/**
 * Agent Prefetch Module
 *
 * Provides agent result prefetching system with prediction and caching.
 * Usage: node agent-prefetch.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   prefetch <key>        Prefetch a result
 *   get <key>             Get cached result
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PREFETCH_DB = path.join(DATA_DIR, 'prefetch-cache.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON(file, defaultVal = {}) {
  ensureDataDir();
  if (!fs.existsSync(file)) {
    return defaultVal;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return defaultVal;
  }
}

function saveJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/**
 * Prefetch Entry
 */
class PrefetchEntry {
  constructor(key, value, options = {}) {
    this.key = key;
    this.value = value;
    this.createdAt = Date.now();
    this.lastAccessed = Date.now();
    this.accessCount = 0;
    this.ttl = options.ttl || 60000; // Time to live in ms
    this.priority = options.priority || 0;
    this.prefetched = options.prefetched || false;
    this.predictionScore = 0;
  }

  isExpired() {
    return Date.now() - this.createdAt > this.ttl;
  }

  access() {
    this.lastAccessed = Date.now();
    this.accessCount++;
  }

  updatePrediction(score) {
    this.predictionScore = score;
  }
}

/**
 * Prefetch Policy
 */
class PrefetchPolicy {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.strategy = config.strategy || 'adaptive'; // adaptive, eager, lazy, predictive
    this.maxEntries = config.maxEntries || 100;
    this.defaultTtl = config.defaultTtl || 60000;
    this.prefetchThreshold = config.prefetchThreshold || 0.7;
    this.cooldownPeriod = config.cooldownPeriod || 5000;
    this.lastPrefetchTime = 0;
  }

  shouldPrefetch(entry, currentLoad) {
    if (!this.enabled) return false;

    if (Date.now() - this.lastPrefetchTime < this.cooldownPeriod) {
      return false;
    }

    if (this.strategy === 'eager') {
      return true;
    }

    if (this.strategy === 'lazy') {
      return false;
    }

    if (this.strategy === 'adaptive') {
      return entry.predictionScore > this.prefetchThreshold && currentLoad < 0.8;
    }

    if (this.strategy === 'predictive') {
      return entry.accessCount > 5 && entry.predictionScore > 0.5;
    }

    return false;
  }

  getEvictionCandidate(entries) {
    // LRU eviction
    let oldest = null;
    let oldestTime = Infinity;

    for (const entry of entries) {
      if (entry.lastAccessed < oldestTime && !entry.prefetched) {
        oldest = entry;
        oldestTime = entry.lastAccessed;
      }
    }

    return oldest || entries[0];
  }
}

/**
 * Prediction Engine
 */
class PredictionEngine {
  constructor() {
    this.patterns = new Map();
    this.history = [];
  }

  // Simple frequency-based prediction
  predict(key) {
    const pattern = this.patterns.get(key);
    if (pattern) {
      return pattern.score;
    }
    return 0;
  }

  learn(key, wasAccessed) {
    if (!this.patterns.has(key)) {
      this.patterns.set(key, { score: 0, count: 0 });
    }

    const pattern = this.patterns.get(key);
    pattern.count++;

    if (wasAccessed) {
      pattern.score = Math.min(1, pattern.score + 0.1);
    } else {
      pattern.score = Math.max(0, pattern.score - 0.05);
    }

    // Keep history for trend analysis
    this.history.push({ key, wasAccessed, timestamp: Date.now() });
    if (this.history.length > 1000) {
      this.history = this.history.slice(-1000);
    }
  }

  getTopPredicted(limit = 10) {
    const entries = Array.from(this.patterns.entries())
      .map(([key, data]) => ({ key, ...data }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return entries;
  }

  // Analyze access patterns
  analyzePattern(key) {
    const keyHistory = this.history.filter(h => h.key === key);
    if (keyHistory.length < 2) {
      return { trend: 'insufficient_data', confidence: 0 };
    }

    const recent = keyHistory.slice(-5);
    const accessed = recent.filter(h => h.wasAccessed).length;
    const accessRate = accessed / recent.length;

    return {
      trend: accessRate > 0.6 ? 'increasing' : accessRate < 0.4 ? 'decreasing' : 'stable',
      confidence: keyHistory.length / 100,
      accessRate
    };
  }
}

/**
 * Prefetch Cache
 */
class PrefetchCache {
  constructor(policy) {
    this.policy = policy;
    this.entries = new Map();
    this.predictionEngine = new PredictionEngine();
    this.stats = {
      hits: 0,
      misses: 0,
      prefetches: 0,
      evictions: 0
    };
  }

  set(key, value, options = {}) {
    // Check capacity
    if (this.entries.size >= this.policy.maxEntries && !this.entries.has(key)) {
      const candidate = this.policy.getEvictionCandidate(Array.from(this.entries.values()));
      if (candidate) {
        this.entries.delete(candidate.key);
        this.stats.evictions++;
      }
    }

    const entry = new PrefetchEntry(key, value, {
      ...options,
      ttl: options.ttl || this.policy.defaultTtl
    });

    this.entries.set(key, entry);
    return entry;
  }

  get(key) {
    const entry = this.entries.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (entry.isExpired()) {
      this.entries.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.access();
    this.stats.hits++;

    // Learn from access
    this.predictionEngine.learn(key, true);

    return entry.value;
  }

  prefetch(key, value, options = {}) {
    this.set(key, value, { ...options, prefetched: true });
    this.stats.prefetches++;
    this.policy.lastPrefetchTime = Date.now();
    return true;
  }

  shouldPrefetch(key) {
    const entry = this.entries.get(key);
    if (!entry) return false;

    const prediction = this.predictionEngine.predict(key);
    entry.updatePrediction(prediction);

    return this.policy.shouldPrefetch(entry, 0.5);
  }

  invalidate(key) {
    return this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? ((this.stats.hits / total) * 100).toFixed(1) + '%' : '0%',
      size: this.entries.size,
      maxSize: this.policy.maxEntries
    };
  }

  getEntries() {
    return Array.from(this.entries.values()).map(e => ({
      key: e.key,
      accessCount: e.accessCount,
      createdAt: e.createdAt,
      prefetched: e.prefetched,
      predictionScore: e.predictionScore
    }));
  }
}

/**
 * Prefetch Manager
 */
class PrefetchManager {
  constructor() {
    this.policy = new PrefetchPolicy({
      strategy: 'adaptive',
      maxEntries: 100,
      defaultTtl: 60000
    });
    this.cache = new PrefetchCache(this.policy);
    this.state = loadJSON(PREFETCH_DB, {});
  }

  // Prefetch a result
  async prefetch(key, fetcher, options = {}) {
    // Check if already cached
    if (this.cache.entries.has(key)) {
      return { alreadyCached: true };
    }

    // Fetch the result
    let value;
    const startTime = Date.now();

    if (typeof fetcher === 'function') {
      value = await fetcher();
    } else {
      value = fetcher;
    }

    const fetchTime = Date.now() - startTime;

    // Store in cache
    this.cache.prefetch(key, value, {
      ttl: options.ttl,
      priority: options.priority
    });

    return { success: true, fetchTime, prefetched: true };
  }

  // Get result (from cache or fetcher)
  async get(key, fetcher, options = {}) {
    // Try cache first
    let value = this.cache.get(key);

    if (value !== null) {
      return { source: 'cache', value };
    }

    // Fetch if not cached
    if (fetcher) {
      value = await fetcher();
      this.cache.set(key, value, options);
      return { source: 'fetch', value };
    }

    return { source: 'miss', value: null };
  }

  // Check if should prefetch
  shouldPrefetch(key) {
    return this.cache.shouldPrefetch(key);
  }

  // Invalidate cache entry
  invalidate(key) {
    return this.cache.invalidate(key);
  }

  // Get statistics
  getStats() {
    return this.cache.getStats();
  }

  // Get top predicted keys
  getPredictions(limit = 10) {
    return this.cache.predictionEngine.getTopPredicted(limit);
  }

  // Set policy
  setPolicy(policyConfig) {
    Object.assign(this.policy, policyConfig);
    return this.policy;
  }

  // Save state
  save() {
    saveJSON(PREFETCH_DB, {
      stats: this.cache.stats,
      policy: this.policy
    });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Prefetch Demo ===\n');

  const manager = new PrefetchManager();

  // Show policy
  console.log('1. Prefetch Policy:');
  console.log(`   Strategy: ${manager.policy.strategy}`);
  console.log(`   Max Entries: ${manager.policy.maxEntries}`);
  console.log(`   Default TTL: ${manager.policy.defaultTtl}ms`);

  // Prefetch some results
  console.log('\n2. Prefetching Results:');

  await manager.prefetch('user:123', { name: 'John', email: 'john@example.com' });
  console.log('   Prefetched: user:123');

  await manager.prefetch('user:456', { name: 'Jane', email: 'jane@example.com' });
  console.log('   Prefetched: user:456');

  await manager.prefetch('data:recent', { items: [1, 2, 3] }, { ttl: 300000 });
  console.log('   Prefetched: data:recent (long TTL)');

  // Get cached results
  console.log('\n3. Getting Cached Results:');

  const result1 = await manager.get('user:123');
  console.log(`   user:123 -> ${result1.source}`);

  const result2 = await manager.get('user:456');
  console.log(`   user:456 -> ${result2.source}`);

  // Get non-cached result with fetcher
  console.log('\n4. Fetching Non-Cached:');

  const result3 = await manager.get('user:789', async () => {
    await new Promise(r => setTimeout(r, 10));
    return { name: 'New User', email: 'new@example.com' };
  });
  console.log(`   user:789 -> ${result3.source}`);

  // Access multiple times to build prediction
  console.log('\n5. Building Access Patterns:');

  for (let i = 0; i < 5; i++) {
    await manager.get('user:123');
    await manager.get('data:recent');
  }

  console.log('   Accessed user:123 and data:recent multiple times');

  // Show predictions
  console.log('\n6. Prediction Analysis:');
  const predictions = manager.getPredictions();
  predictions.forEach(p => {
    console.log(`   ${p.key}: score=${p.score.toFixed(2)}, count=${p.count}`);
  });

  // Show statistics
  console.log('\n7. Cache Statistics:');
  const stats = manager.getStats();
  console.log(`   Hits: ${stats.hits}`);
  console.log(`   Misses: ${stats.misses}`);
  console.log(`   Hit Rate: ${stats.hitRate}`);
  console.log(`   Prefetches: ${stats.prefetches}`);
  console.log(`   Evictions: ${stats.evictions}`);
  console.log(`   Size: ${stats.size}/${stats.maxSize}`);

  // Test invalidation
  console.log('\n8. Invalidation:');
  manager.invalidate('user:456');
  console.log('   Invalidated: user:456');

  const afterInvalidate = await manager.get('user:456');
  console.log(`   user:456 after invalidation -> ${afterInvalidate.source}`);

  // Test shouldPrefetch
  console.log('\n9. Prefetch Prediction:');
  console.log(`   Should prefetch user:123: ${manager.shouldPrefetch('user:123')}`);
  console.log(`   Should prefetch user:999: ${manager.shouldPrefetch('user:999')}`);

  // Change policy
  console.log('\n10. Policy Change:');
  manager.setPolicy({ strategy: 'eager' });
  console.log(`    Changed strategy to: ${manager.policy.strategy}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'prefetch') {
  const manager = new PrefetchManager();
  manager.prefetch(args[1], { data: 'test' }).then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'get') {
  const manager = new PrefetchManager();
  manager.get(args[1]).then(r => console.log(JSON.stringify(r, null, 2)));
} else {
  console.log('Agent Prefetch Module');
  console.log('Usage: node agent-prefetch.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  prefetch <key>   Prefetch a result');
  console.log('  get <key>        Get cached result');
}
