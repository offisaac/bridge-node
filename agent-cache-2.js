/**
 * Agent Cache 2 Module
 *
 * Provides advanced caching with Redis and Memcached support, pub/sub, and clustering.
 * Usage: node agent-cache-2.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   get <key>            Get cache value
 *   set <key> <value>    Set cache value
 *   status                 Show cache status
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CACHE_DB = path.join(DATA_DIR, 'cache2-state.json');

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
 * Cache Backend Types
 */
const CacheBackend = {
  MEMORY: 'memory',
  REDIS: 'redis',
  MEMCACHED: 'memcached'
};

/**
 * Cache Options
 */
const CacheOption = {
  EX: 'ex',
  PX: 'px',
  NX: 'nx',
  XX: 'xx',
  KEEPTTL: 'keepttl'
};

/**
 * Memory Cache
 */
class MemoryCache {
  constructor(options = {}) {
    this.options = {
      maxSize: options.maxSize || 1000,
      ttl: options.ttl || 3600000,
      ...options
    };
    this.store = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  set(key, value, ttl = this.options.ttl) {
    if (this.store.size >= this.options.maxSize) {
      const firstKey = this.store.keys().next().value;
      this.store.delete(firstKey);
    }

    this.store.set(key, {
      value,
      createdAt: Date.now(),
      expiresAt: ttl > 0 ? Date.now() + ttl : 0
    });
    this.stats.sets++;
    return true;
  }

  delete(key) {
    const result = this.store.delete(key);
    if (result) {
      this.stats.deletes++;
    }
    return result;
  }

  has(key) {
    return this.get(key) !== null;
  }

  clear() {
    this.store.clear();
    return true;
  }

  keys() {
    return Array.from(this.store.keys());
  }

  size() {
    return this.store.size;
  }

  prune() {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.store) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.store.delete(key);
        pruned++;
      }
    }
    return pruned;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%'
    };
  }
}

/**
 * Redis-like Cache (Simulated)
 */
class RedisCache {
  constructor(options = {}) {
    this.options = {
      host: options.host || 'localhost',
      port: options.port || 6379,
      password: options.password || null,
      db: options.db || 0,
      keyPrefix: options.keyPrefix || '',
      ttl: options.ttl || 3600000,
      ...options
    };
    this.store = new Map();
    this.subscribers = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  _addPrefix(key) {
    return this.options.keyPrefix + key;
  }

  async get(key) {
    const fullKey = this._addPrefix(key);
    const entry = this.store.get(fullKey);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(fullKey);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  async set(key, value, options = {}) {
    const fullKey = this._addPrefix(key);
    const ttl = options.ex || options.px || this.options.ttl;

    this.store.set(fullKey, {
      value,
      createdAt: Date.now(),
      expiresAt: ttl > 0 ? Date.now() + ttl : 0
    });
    this.stats.sets++;
    return 'OK';
  }

  async del(key) {
    const fullKey = this._addPrefix(key);
    const result = this.store.delete(fullKey);
    if (result) {
      this.stats.deletes++;
    }
    return result ? 1 : 0;
  }

  async exists(key) {
    return this.has(key) ? 1 : 0;
  }

  async expire(key, seconds) {
    const fullKey = this._addPrefix(key);
    const entry = this.store.get(fullKey);
    if (entry) {
      entry.expiresAt = Date.now() + (seconds * 1000);
      return 1;
    }
    return 0;
  }

  async ttl(key) {
    const fullKey = this._addPrefix(key);
    const entry = this.store.get(fullKey);
    if (!entry || !entry.expiresAt) {
      return -1;
    }
    return Math.max(0, Math.floor((entry.expiresAt - Date.now()) / 1000));
  }

  async incr(key) {
    const fullKey = this._addPrefix(key);
    const current = await this.get(key) || 0;
    const newValue = parseInt(current) + 1;
    await this.set(key, newValue);
    return newValue;
  }

  async decr(key) {
    const fullKey = this._addPrefix(key);
    const current = await this.get(key) || 0;
    const newValue = parseInt(current) - 1;
    await this.set(key, newValue);
    return newValue;
  }

  async hset(key, field, value) {
    const fullKey = this._addPrefix(key);
    let hash = this.store.get(fullKey);
    if (!hash) {
      hash = new Map();
      this.store.set(fullKey, hash);
    }
    hash.set(field, value);
    this.stats.sets++;
    return 1;
  }

  async hget(key, field) {
    const fullKey = this._addPrefix(key);
    const hash = this.store.get(fullKey);
    if (!hash) {
      this.stats.misses++;
      return null;
    }
    this.stats.hits++;
    return hash.get(field) || null;
  }

  async hgetall(key) {
    const fullKey = this._addPrefix(key);
    const hash = this.store.get(fullKey);
    if (!hash) {
      return {};
    }
    const result = {};
    for (const [field, value] of hash) {
      result[field] = value;
    }
    return result;
  }

  async lpush(key, ...values) {
    const fullKey = this._addPrefix(key);
    let list = this.store.get(fullKey);
    if (!list) {
      list = [];
      this.store.set(fullKey, list);
    }
    list.unshift(...values);
    this.stats.sets++;
    return list.length;
  }

  async rpush(key, ...values) {
    const fullKey = this._addPrefix(key);
    let list = this.store.get(fullKey);
    if (!list) {
      list = [];
      this.store.set(fullKey, list);
    }
    list.push(...values);
    this.stats.sets++;
    return list.length;
  }

  async lrange(key, start, stop) {
    const fullKey = this._addPrefix(key);
    const list = this.store.get(fullKey);
    if (!list) {
      return [];
    }
    return list.slice(start, stop === -1 ? undefined : stop + 1);
  }

  async sadd(key, ...members) {
    const fullKey = this._addPrefix(key);
    let set = this.store.get(fullKey);
    if (!set) {
      set = new Set();
      this.store.set(fullKey, set);
    }
    let added = 0;
    for (const member of members) {
      if (!set.has(member)) {
        set.add(member);
        added++;
      }
    }
    this.stats.sets++;
    return added;
  }

  async smembers(key) {
    const fullKey = this._addPrefix(key);
    const set = this.store.get(fullKey);
    if (!set) {
      return [];
    }
    return Array.from(set);
  }

  async sismember(key, member) {
    const fullKey = this._addPrefix(key);
    const set = this.store.get(fullKey);
    if (!set) {
      return 0;
    }
    return set.has(member) ? 1 : 0;
  }

  async publish(channel, message) {
    const subscribers = this.subscribers.get(channel) || [];
    for (const callback of subscribers) {
      callback(message);
    }
    return subscribers.length;
  }

  async subscribe(channel, callback) {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, []);
    }
    this.subscribers.get(channel).push(callback);
    return 'OK';
  }

  async flushdb() {
    this.store.clear();
    return 'OK';
  }

  async keys(pattern) {
    const regex = new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.'));
    const keys = [];
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        keys.push(key.replace(this.options.keyPrefix, ''));
      }
    }
    return keys;
  }

  has(key) {
    const fullKey = this._addPrefix(key);
    const entry = this.store.get(fullKey);
    if (!entry) return false;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(fullKey);
      return false;
    }
    return true;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
      keys: this.store.size
    };
  }
}

/**
 * Memcached-like Cache (Simulated)
 */
class MemcachedCache {
  constructor(options = {}) {
    this.options = {
      servers: options.servers || ['localhost:11211'],
      poolSize: options.poolSize || 10,
      ttl: options.ttl || 3600000,
      keyPrefix: options.keyPrefix || '',
      ...options
    };
    this.store = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0
    };
  }

  _addPrefix(key) {
    return this.options.keyPrefix + key;
  }

  async get(key) {
    const fullKey = this._addPrefix(key);
    const entry = this.store.get(fullKey);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(fullKey);
      this.stats.misses++;
      return null;
    }

    this.stats.hits++;
    return entry.value;
  }

  async set(key, value, ttl = this.options.ttl) {
    const fullKey = this._addPrefix(key);
    this.store.set(fullKey, {
      value,
      createdAt: Date.now(),
      expiresAt: ttl > 0 ? Date.now() + ttl : 0,
      flags: 0
    });
    this.stats.sets++;
    return true;
  }

  async del(key) {
    const fullKey = this._addPrefix(key);
    const result = this.store.delete(fullKey);
    if (result) {
      this.stats.deletes++;
    }
    return result;
  }

  async gets(key) {
    const fullKey = this._addPrefix(key);
    const entry = this.store.get(fullKey);
    if (!entry) {
      this.stats.misses++;
      return { cas: null };
    }
    this.stats.hits++;
    return { value: entry.value, flags: entry.flags, cas: Date.now() };
  }

  async cas(key, value, cas, ttl = this.options.ttl) {
    const fullKey = this._addPrefix(key);
    const entry = this.store.get(fullKey);
    if (!entry || entry.createdAt !== cas) {
      return false;
    }
    return this.set(key, value, ttl);
  }

  async incr(key, amount = 1) {
    const current = await this.get(key) || 0;
    const newValue = parseInt(current) + amount;
    await this.set(key, newValue);
    return newValue;
  }

  async decr(key, amount = 1) {
    const current = await this.get(key) || 0;
    const newValue = parseInt(current) - amount;
    await this.set(key, newValue);
    return newValue;
  }

  async flush() {
    this.store.clear();
    return true;
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
      keys: this.store.size
    };
  }
}

/**
 * Cache Cluster
 */
class CacheCluster {
  constructor(options = {}) {
    this.options = {
      strategy: options.strategy || 'round-robin',
      nodes: options.nodes || [],
      ...options
    };
    this.nodes = [];
    this.currentIndex = 0;
    this.keyHashRing = new Map();

    for (const node of this.options.nodes) {
      this.addNode(node);
    }
  }

  addNode(node) {
    const cache = node.type === CacheBackend.REDIS
      ? new RedisCache(node.options)
      : node.type === CacheBackend.MEMCACHED
        ? new MemcachedCache(node.options)
        : new MemoryCache(node.options);

    this.nodes.push(cache);
    return cache;
  }

  removeNode(index) {
    if (index >= 0 && index < this.nodes.length) {
      return this.nodes.splice(index, 1)[0];
    }
    return null;
  }

  getNode(key) {
    if (this.nodes.length === 0) {
      return null;
    }

    switch (this.options.strategy) {
      case 'round-robin':
        const node = this.nodes[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.nodes.length;
        return node;

      case 'hash':
        const hash = this._hash(key);
        const nodeIndex = hash % this.nodes.length;
        return this.nodes[nodeIndex];

      case 'random':
        const randomIndex = Math.floor(Math.random() * this.nodes.length);
        return this.nodes[randomIndex];

      default:
        return this.nodes[0];
    }
  }

  _hash(key) {
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  async get(key) {
    const node = this.getNode(key);
    return node ? node.get(key) : null;
  }

  async set(key, value, options) {
    const node = this.getNode(key);
    return node ? node.set(key, value, options) : false;
  }

  async del(key) {
    const node = this.getNode(key);
    return node ? node.del(key) : false;
  }

  getStats() {
    const stats = [];
    for (let i = 0; i < this.nodes.length; i++) {
      stats.push({
        node: i,
        ...this.nodes[i].getStats()
      });
    }
    return stats;
  }
}

/**
 * Cache Manager
 */
class AgentCacheManager {
  constructor() {
    this.backends = new Map();
    this.defaultBackend = null;
    this.stats = {
      totalGets: 0,
      totalSets: 0,
      totalDeletes: 0
    };
    this.state = loadJSON(CACHE_DB, {});
  }

  registerBackend(name, type, options = {}) {
    let cache;
    switch (type) {
      case CacheBackend.REDIS:
        cache = new RedisCache(options);
        break;
      case CacheBackend.MEMCACHED:
        cache = new MemcachedCache(options);
        break;
      default:
        cache = new MemoryCache(options);
    }

    this.backends.set(name, cache);

    if (!this.defaultBackend) {
      this.defaultBackend = name;
    }

    return cache;
  }

  getBackend(name = this.defaultBackend) {
    return this.backends.get(name);
  }

  async get(key, backend = this.defaultBackend) {
    const cache = this.getBackend(backend);
    if (!cache) {
      throw new Error(`Backend not found: ${backend}`);
    }
    this.stats.totalGets++;
    return cache.get(key);
  }

  async set(key, value, options = {}, backend = this.defaultBackend) {
    const cache = this.getBackend(backend);
    if (!cache) {
      throw new Error(`Backend not found: ${backend}`);
    }
    this.stats.totalSets++;
    return cache.set(key, value, options);
  }

  async del(key, backend = this.defaultBackend) {
    const cache = this.getBackend(backend);
    if (!cache) {
      throw new Error(`Backend not found: ${backend}`);
    }
    this.stats.totalDeletes++;
    return cache.delete(key);
  }

  async clear(backend = this.defaultBackend) {
    const cache = this.getBackend(backend);
    if (!cache) {
      throw new Error(`Backend not found: ${backend}`);
    }
    return cache.clear ? cache.clear() : false;
  }

  getStats(backend = this.defaultBackend) {
    const cache = this.getBackend(backend);
    if (!cache) {
      return null;
    }
    return {
      ...this.stats,
      backend,
      ...cache.getStats()
    };
  }

  save() {
    saveJSON(CACHE_DB, { stats: this.stats });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Cache 2 Demo\n');

  const manager = new AgentCacheManager();

  // Register backends
  console.log('1. Registering Cache Backends:');
  const memory = manager.registerBackend('memory', CacheBackend.MEMORY, { maxSize: 100 });
  const redis = manager.registerBackend('redis', CacheBackend.REDIS, { keyPrefix: 'app:' });
  const memcached = manager.registerBackend('memcached', CacheBackend.MEMCACHED, { keyPrefix: 'mc:' });

  console.log(`   Registered: memory, redis, memcached`);

  // Memory cache
  console.log('\n2. Memory Cache:');
  memory.set('user:1', { name: 'Alice', age: 30 });
  memory.set('user:2', { name: 'Bob', age: 25 }, 5000);
  console.log(`   Set user:1: ${JSON.stringify(memory.get('user:1'))}`);
  console.log(`   Get user:1: ${JSON.stringify(memory.get('user:1'))}`);
  console.log(`   Has user:2: ${memory.has('user:2')}`);
  console.log(`   Size: ${memory.size()}`);
  console.log(`   Keys: ${memory.keys().join(', ')}`);

  // Redis cache
  console.log('\n3. Redis Cache:');
  await redis.set('session:abc', { userId: 123, expires: 3600 }, { ex: 3600 });
  const session = await redis.get('session:abc');
  console.log(`   Session: ${JSON.stringify(session)}`);

  await redis.hset('user:profile:1', 'name', 'Alice');
  await redis.hset('user:profile:1', 'email', 'alice@example.com');
  const profile = await redis.hgetall('user:profile:1');
  console.log(`   Hash: ${JSON.stringify(profile)}`);

  await redis.lpush('queue:tasks', 'task1', 'task2', 'task3');
  const tasks = await redis.lrange('queue:tasks', 0, -1);
  console.log(`   List: ${JSON.stringify(tasks)}`);

  await redis.sadd('tags:1', 'javascript', 'nodejs', 'redis');
  const tags = await redis.smembers('tags:1');
  console.log(`   Set: ${JSON.stringify(tags)}`);

  const isMember = await redis.sismember('tags:1', 'nodejs');
  console.log(`   SISMEMBER: ${isMember}`);

  // Memcached cache
  console.log('\n4. Memcached Cache:');
  await memcached.set('counter:views', 100);
  await memcached.incr('counter:views', 5);
  const views = await memcached.get('counter:views');
  console.log(`   Counter: ${views}`);

  await memcached.set('config:app', { theme: 'dark', lang: 'en' });
  const config = await memcached.get('config:app');
  console.log(`   Config: ${JSON.stringify(config)}`);

  // Pub/Sub
  console.log('\n5. Pub/Sub:');
  await redis.subscribe('notifications', (msg) => {
    console.log(`   Received: ${msg}`);
  });
  await redis.publish('notifications', 'New message arrived');
  await redis.publish('notifications', 'Another notification');

  // Cache cluster
  console.log('\n6. Cache Cluster:');
  const cluster = new CacheCluster({
    strategy: 'hash',
    nodes: [
      { type: CacheBackend.MEMORY, options: { maxSize: 50 } },
      { type: CacheBackend.MEMORY, options: { maxSize: 50 } },
      { type: CacheBackend.MEMORY, options: { maxSize: 50 } }
    ]
  });

  await cluster.set('key1', 'value1');
  await cluster.set('key2', 'value2');
  await cluster.set('key3', 'value3');
  console.log(`   Cluster nodes: ${cluster.nodes.length}`);

  // Stats
  console.log('\n7. Statistics:');
  console.log(`   Memory: ${JSON.stringify(memory.getStats())}`);
  console.log(`   Redis: ${JSON.stringify(redis.getStats())}`);
  console.log(`   Memcached: ${JSON.stringify(memcached.getStats())}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'get') {
  const manager = new AgentCacheManager();
  manager.registerBackend('default', CacheBackend.MEMORY);
  const key = args[1] || 'test';
  manager.get(key).then(v => console.log(v));
} else if (cmd === 'set') {
  const manager = new AgentCacheManager();
  manager.registerBackend('default', CacheBackend.MEMORY);
  const key = args[1] || 'test';
  const value = args[2] || 'value';
  manager.set(key, value).then(() => console.log('Set:', key, value));
} else if (cmd === 'status') {
  const manager = new AgentCacheManager();
  manager.registerBackend('default', CacheBackend.MEMORY);
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Cache 2 Module');
  console.log('Usage: node agent-cache-2.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  get <key>     Get cache value');
  console.log('  set <key> <value> Set cache value');
  console.log('  status           Show cache status');
}
