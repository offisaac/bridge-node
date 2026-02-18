/**
 * Agent Fallback Module
 *
 * Provides agent fallback strategy system with chains, health checks, and circuit breakers.
 * Usage: node agent-fallback.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   execute <chain>       Execute fallback chain
 *   status                 Show fallback status
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FALLBACK_DB = path.join(DATA_DIR, 'fallback-state.json');

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
 * Fallback Option
 */
class FallbackOption {
  constructor(id, handler, options = {}) {
    this.id = id;
    this.handler = handler;
    this.priority = options.priority || 0;
    this.timeout = options.timeout || 30000;
    this.retry = options.retry || 0;
    this.healthCheck = options.healthCheck || null;
    this.weight = options.weight || 1;
    this.enabled = options.enabled !== false;
    this.state = 'idle'; // idle, healthy, unhealthy, disabled
    this.stats = {
      attempts: 0,
      successes: 0,
      failures: 0,
      avgLatency: 0
    };
  }

  async execute(input) {
    this.stats.attempts++;
    const startTime = Date.now();

    try {
      const result = await this.runWithTimeout(input);
      this.stats.successes++;
      this.state = 'healthy';
      return { success: true, result, option: this.id };
    } catch (error) {
      this.stats.failures++;
      this.state = 'unhealthy';
      throw error;
    } finally {
      const latency = Date.now() - startTime;
      this.stats.avgLatency = (this.stats.avgLatency * (this.stats.attempts - 1) + latency) / this.stats.attempts;
    }
  }

  runWithTimeout(input) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout after ${this.timeout}ms`));
      }, this.timeout);

      Promise.resolve(this.handler(input)).then(result => {
        clearTimeout(timer);
        resolve(result);
      }).catch(err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  isHealthy() {
    if (!this.enabled) return false;
    if (this.stats.attempts === 0) return true;

    const failureRate = this.stats.failures / this.stats.attempts;
    return failureRate < 0.5; // 50% failure threshold
  }
}

/**
 * Fallback Chain
 */
class FallbackChain {
  constructor(name, options = {}) {
    this.name = name;
    this.options = options;
    this.fallbacks = [];
    this.strategy = options.strategy || 'priority'; // priority, weighted, round_robin
    this.currentIndex = 0;
  }

  addFallback(option) {
    this.fallbacks.push(option);
    this.sortFallbacks();
  }

  removeFallback(optionId) {
    this.fallbacks = this.fallbacks.filter(f => f.id !== optionId);
  }

  sortFallbacks() {
    if (this.strategy === 'priority') {
      this.fallbacks.sort((a, b) => b.priority - a.priority);
    }
  }

  getNext() {
    // Filter to only healthy fallbacks
    const healthy = this.fallbacks.filter(f => f.isHealthy() && f.enabled);

    if (healthy.length === 0) {
      return null;
    }

    if (this.strategy === 'priority') {
      return healthy[0];
    }

    if (this.strategy === 'round_robin') {
      const option = healthy[this.currentIndex % healthy.length];
      this.currentIndex++;
      return option;
    }

    if (this.strategy === 'weighted') {
      const totalWeight = healthy.reduce((sum, f) => sum + f.weight, 0);
      let random = Math.random() * totalWeight;
      for (const fallback of healthy) {
        random -= fallback.weight;
        if (random <= 0) {
          return fallback;
        }
      }
      return healthy[0];
    }

    return healthy[0];
  }

  getAll() {
    return this.fallbacks;
  }
}

/**
 * Health Checker
 */
class HealthChecker {
  constructor() {
    this.checks = new Map();
    this.intervals = new Map();
  }

  register(name, checkFn, interval = 30000) {
    this.checks.set(name, checkFn);

    // Run initial check
    this.runCheck(name);

    // Schedule periodic checks
    const intervalId = setInterval(() => this.runCheck(name), interval);
    this.intervals.set(name, intervalId);
  }

  async runCheck(name) {
    const checkFn = this.checks.get(name);
    if (!checkFn) return;

    try {
      const result = await checkFn();
      return result;
    } catch (error) {
      return { healthy: false, error: error.message };
    }
  }

  async check(name) {
    return this.runCheck(name);
  }

  stop() {
    for (const intervalId of this.intervals.values()) {
      clearInterval(intervalId);
    }
    this.intervals.clear();
  }
}

/**
 * Fallback Manager
 */
class FallbackManager {
  constructor() {
    this.chains = new Map();
    this.healthChecker = new HealthChecker();
    this.state = loadJSON(FALLBACK_DB, { chains: {} });
  }

  // Create fallback chain
  createChain(name, options = {}) {
    const chain = new FallbackChain(name, options);
    this.chains.set(name, chain);
    return chain;
  }

  // Get chain
  getChain(name) {
    return this.chains.get(name);
  }

  // Add fallback to chain
  addFallback(chainName, option) {
    const chain = this.chains.get(chainName);
    if (!chain) {
      return { error: `Chain ${chainName} not found` };
    }
    chain.addFallback(option);
    return { success: true };
  }

  // Execute fallback chain
  async execute(chainName, input, options = {}) {
    const chain = this.chains.get(chainName);
    if (!chain) {
      return { error: `Chain ${chainName} not found` };
    }

    const results = [];
    let lastError = null;

    while (true) {
      const fallback = chain.getNext();

      if (!fallback) {
        lastError = new Error('All fallbacks failed');
        break;
      }

      try {
        const result = await fallback.execute(input);
        results.push({ option: fallback.id, success: true, result: result.result });

        return {
          success: true,
          option: fallback.id,
          result: result.result,
          attempts: results.length
        };
      } catch (error) {
        lastError = error;
        results.push({ option: fallback.id, success: false, error: error.message });
      }
    }

    return {
      success: false,
      attempts: results.length,
      errors: results,
      lastError: lastError.message
    };
  }

  // Health check a specific option
  async healthCheck(optionId) {
    for (const chain of this.chains.values()) {
      const fallback = chain.fallbacks.find(f => f.id === optionId);
      if (fallback && fallback.healthCheck) {
        return fallback.healthCheck();
      }
    }
    return { healthy: true, reason: 'No health check defined' };
  }

  // Get chain status
  getChainStatus(chainName) {
    const chain = this.chains.get(chainName);
    if (!chain) {
      return { error: `Chain ${chainName} not found` };
    }

    return {
      name: chain.name,
      strategy: chain.strategy,
      fallbacks: chain.fallbacks.map(f => ({
        id: f.id,
        priority: f.priority,
        enabled: f.enabled,
        state: f.state,
        stats: f.stats
      }))
    };
  }

  // List all chains
  listChains() {
    return Array.from(this.chains.keys());
  }

  // Enable/disable fallback
  setEnabled(chainName, optionId, enabled) {
    const chain = this.chains.get(chainName);
    if (!chain) return { error: 'Chain not found' };

    const fallback = chain.fallbacks.find(f => f.id === optionId);
    if (!fallback) return { error: 'Fallback not found' };

    fallback.enabled = enabled;
    return { success: true };
  }

  // Save state
  save() {
    const chainsState = {};
    for (const [name, chain] of this.chains) {
      chainsState[name] = {
        strategy: chain.strategy,
        fallbacks: chain.fallbacks.map(f => ({
          id: f.id,
          priority: f.priority,
          stats: f.stats
        }))
      };
    }
    this.state = { chains: chainsState };
    saveJSON(FALLBACK_DB, this.state);
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Fallback Demo ===\n');

  const manager = new FallbackManager();

  // Create fallback chain
  console.log('1. Creating Fallback Chain:');
  const chain = manager.createChain('agent-service', { strategy: 'priority' });
  console.log(`   Created: agent-service (priority strategy)`);

  // Add fallbacks
  console.log('\n2. Adding Fallback Options:');

  const primary = new FallbackOption('primary', async (input) => {
    if (Math.random() > 0.7) throw new Error('Primary service unavailable');
    return { source: 'primary', data: input.value * 2 };
  }, { priority: 10, timeout: 5000 });

  const secondary = new FallbackOption('secondary', async (input) => {
    if (Math.random() > 0.5) throw new Error('Secondary service slow');
    return { source: 'secondary', data: input.value + 100 };
  }, { priority: 5, timeout: 3000 });

  const cache = new FallbackOption('cache', async (input) => {
    return { source: 'cache', data: `cached-${input.value}` };
  }, { priority: 1, timeout: 1000 });

  const defaultHandler = new FallbackOption('default', async (input) => {
    return { source: 'default', data: 'default-value' };
  }, { priority: 0, timeout: 500 });

  manager.addFallback('agent-service', primary);
  manager.addFallback('agent-service', secondary);
  manager.addFallback('agent-service', cache);
  manager.addFallback('agent-service', defaultHandler);

  console.log('   Added: primary (priority 10)');
  console.log('   Added: secondary (priority 5)');
  console.log('   Added: cache (priority 1)');
  console.log('   Added: default (priority 0)');

  // Execute chain multiple times
  console.log('\n3. Executing Fallback Chain:');

  for (let i = 1; i <= 5; i++) {
    const result = await manager.execute('agent-service', { value: i });
    console.log(`   Attempt ${i}: ${result.success ? `SUCCESS (${result.option})` : 'FAILED'}`);
  }

  // Show chain status
  console.log('\n4. Chain Status:');
  const status = manager.getChainStatus('agent-service');
  console.log(`   Strategy: ${status.strategy}`);
  status.fallbacks.forEach(f => {
    console.log(`   ${f.id}: priority=${f.priority}, state=${f.state}, attempts=${f.stats.attempts}, success=${f.stats.successes}, fail=${f.stats.failures}`);
  });

  // Test disable
  console.log('\n5. Disabling Fallback:');
  manager.setEnabled('agent-service', 'cache', false);
  console.log('   Disabled: cache');

  const result = await manager.execute('agent-service', { value: 99 });
  console.log(`   After disable: ${result.success ? `SUCCESS (${result.option})` : 'FAILED'}`);

  // Re-enable
  manager.setEnabled('agent-service', 'cache', true);
  console.log('   Re-enabled: cache');

  // Show all chains
  console.log('\n6. All Chains:');
  const chains = manager.listChains();
  console.log(`   Available: ${chains.join(', ')}`);

  // Test weighted strategy
  console.log('\n7. Weighted Strategy:');
  const weightedChain = manager.createChain('weighted-service', { strategy: 'weighted' });

  const w1 = new FallbackOption('high', async (i) => ({ w: 1 }), { weight: 10 });
  const w2 = new FallbackOption('low', async (i) => ({ w: 2 }), { weight: 1 });

  weightedChain.addFallback(w1);
  weightedChain.addFallback(w2);

  let highCount = 0, lowCount = 0;
  for (let i = 0; i < 20; i++) {
    const next = weightedChain.getNext();
    if (next.id === 'high') highCount++;
    else lowCount++;
  }
  console.log(`   High weight selected: ${highCount} times`);
  console.log(`   Low weight selected: ${lowCount} times`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'execute') {
  const manager = new FallbackManager();
  manager.execute(args[1], {}).then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const manager = new FallbackManager();
  console.log(JSON.stringify(manager.listChains(), null, 2));
} else {
  console.log('Agent Fallback Module');
  console.log('Usage: node agent-fallback.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  execute <chain>  Execute fallback chain');
  console.log('  status            Show fallback status');
}
