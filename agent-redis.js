/**
 * Agent Redis - Redis Cache Agent
 *
 * Manages Redis-like caching operations, pub/sub, and data structures.
 *
 * Usage: node agent-redis.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   keys       - List keys
 *   strings    - String operations
 *   lists      - List operations
 */

class RedisString {
  constructor() {
    this.value = null;
  }

  set(value) {
    this.value = value;
    return 'OK';
  }

  get() {
    return this.value;
  }

  incr() {
    const num = parseInt(this.value) || 0;
    this.value = String(num + 1);
    return num + 1;
  }

  decr() {
    const num = parseInt(this.value) || 0;
    this.value = String(num - 1);
    return num - 1;
  }

  append(value) {
    this.value = (this.value || '') + value;
    return this.value.length;
  }

  strlen() {
    return (this.value || '').length;
  }
}

class RedisList {
  constructor() {
    this.items = [];
  }

  lpush(value) {
    this.items.unshift(value);
    return this.items.length;
  }

  rpush(value) {
    this.items.push(value);
    return this.items.length;
  }

  lpop() {
    return this.items.shift() || null;
  }

  rpop() {
    return this.items.pop() || null;
  }

  lrange(start = 0, stop = -1) {
    if (stop === -1) stop = this.items.length;
    return this.items.slice(start, stop + 1);
  }

  llen() {
    return this.items.length;
  }

  lindex(index) {
    return this.items[index] || null;
  }
}

class RedisHash {
  constructor() {
    this.fields = new Map();
  }

  hset(key, value) {
    this.fields.set(key, value);
    return 1;
  }

  hget(key) {
    return this.fields.get(key) || null;
  }

  hgetall() {
    return Object.fromEntries(this.fields);
  }

  hdel(key) {
    return this.fields.delete(key) ? 1 : 0;
  }

  hexists(key) {
    return this.fields.has(key) ? 1 : 0;
  }

  hkeys() {
    return Array.from(this.fields.keys());
  }

  hvals() {
    return Array.from(this.fields.values());
  }
}

class RedisSet {
  constructor() {
    this.members = new Set();
  }

  sadd(member) {
    const isNew = !this.members.has(member);
    this.members.add(member);
    return isNew ? 1 : 0;
  }

  sismember(member) {
    return this.members.has(member) ? 1 : 0;
  }

  smembers() {
    return Array.from(this.members);
  }

  scard() {
    return this.members.size;
  }

  srem(member) {
    return this.members.delete(member) ? 1 : 0;
  }
}

class RedisSortedSet {
  constructor() {
    this.members = new Map(); // member -> score
  }

  zadd(member, score) {
    this.members.set(member, score);
    return 1;
  }

  zscore(member) {
    return this.members.get(member) || null;
  }

  zrange(start = 0, stop = -1) {
    const sorted = Array.from(this.members.entries())
      .sort((a, b) => a[1] - b[1])
      .map(e => e[0]);
    if (stop === -1) stop = sorted.length;
    return sorted.slice(start, stop + 1);
  }

  zrevrange(start = 0, stop = -1) {
    const sorted = Array.from(this.members.entries())
      .sort((a, b) => b[1] - a[1])
      .map(e => e[0]);
    if (stop === -1) stop = sorted.length;
    return sorted.slice(start, stop + 1);
  }

  zcard() {
    return this.members.size;
  }
}

class PubSub {
  constructor() {
    this.channels = new Map();
    this.subscribers = new Map();
  }

  subscribe(channel, callback) {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, []);
    }
    this.subscribers.get(channel).push(callback);
    return ['subscribe', channel, 1];
  }

  publish(channel, message) {
    const subs = this.subscribers.get(channel) || [];
    subs.forEach(cb => cb(message));
    return subs.length;
  }

  channels() {
    return Array.from(this.subscribers.keys());
  }
}

class RedisAgent {
  constructor() {
    this.strings = new Map();
    this.lists = new Map();
    this.hashes = new Map();
    this.sets = new Map();
    this.sortedSets = new Map();
    this.pubsub = new PubSub();
    this.ttls = new Map();
    this.stats = { commands: 0 };

    this._initSampleData();
  }

  _initSampleData() {
    // Strings
    const counter = new RedisString();
    counter.set('0');
    this.strings.set('counter', counter);

    const config = new RedisString();
    config.set('{"theme": "dark", "lang": "en"}');
    this.strings.set('config:app', config);

    // List
    const queue = new RedisList();
    queue.rpush('task:1');
    queue.rpush('task:2');
    queue.rpush('task:3');
    this.lists.set('queue:tasks', queue);

    // Hash
    const user = new RedisHash();
    user.hset('name', 'Alice');
    user.hset('email', 'alice@example.com');
    user.hset('role', 'admin');
    this.hashes.set('user:1', user);

    // Set
    const tags = new RedisSet();
    tags.sadd('javascript');
    tags.sadd('nodejs');
    tags.sadd('redis');
    this.sets.set('tags:article:1', tags);

    // Sorted Set
    const leaderboard = new RedisSortedSet();
    leaderboard.zadd('alice', 100);
    leaderboard.zadd('bob', 85);
    leaderboard.zadd('charlie', 92);
    this.sortedSets.set('leaderboard', leaderboard);
  }

  // String commands
  set(key, value, ttl = null) {
    this.stats.commands++;
    const redisStr = new RedisString();
    redisStr.set(value);
    this.strings.set(key, redisStr);
    if (ttl) this.ttls.set(key, Date.now() + ttl * 1000);
    return 'OK';
  }

  get(key) {
    this.stats.commands++;
    if (this.ttls.has(key) && Date.now() > this.ttls.get(key)) {
      this.strings.delete(key);
      this.ttls.delete(key);
      return null;
    }
    const redisStr = this.strings.get(key);
    return redisStr ? redisStr.get() : null;
  }

  incr(key) {
    this.stats.commands++;
    let redisStr = this.strings.get(key);
    if (!redisStr) {
      redisStr = new RedisString();
      redisStr.set('0');
      this.strings.set(key, redisStr);
    }
    return redisStr.incr();
  }

  decr(key) {
    this.stats.commands++;
    let redisStr = this.strings.get(key);
    if (!redisStr) {
      redisStr = new RedisString();
      redisStr.set('0');
      this.strings.set(key, redisStr);
    }
    return redisStr.decr();
  }

  // List commands
  lpush(key, value) {
    this.stats.commands++;
    let list = this.lists.get(key);
    if (!list) {
      list = new RedisList();
      this.lists.set(key, list);
    }
    return list.lpush(value);
  }

  rpush(key, value) {
    this.stats.commands++;
    let list = this.lists.get(key);
    if (!list) {
      list = new RedisList();
      this.lists.set(key, list);
    }
    return list.rpush(value);
  }

  lrange(key, start = 0, stop = -1) {
    this.stats.commands++;
    const list = this.lists.get(key);
    return list ? list.lrange(start, stop) : [];
  }

  // Hash commands
  hset(key, field, value) {
    this.stats.commands++;
    let hash = this.hashes.get(key);
    if (!hash) {
      hash = new RedisHash();
      this.hashes.set(key, hash);
    }
    return hash.hset(field, value);
  }

  hget(key, field) {
    this.stats.commands++;
    const hash = this.hashes.get(key);
    return hash ? hash.hget(field) : null;
  }

  hgetall(key) {
    this.stats.commands++;
    const hash = this.hashes.get(key);
    return hash ? hash.hgetall() : {};
  }

  // Set commands
  sadd(key, member) {
    this.stats.commands++;
    let set = this.sets.get(key);
    if (!set) {
      set = new RedisSet();
      this.sets.set(key, set);
    }
    return set.sadd(member);
  }

  smembers(key) {
    this.stats.commands++;
    const set = this.sets.get(key);
    return set ? set.smembers() : [];
  }

  // Sorted set commands
  zadd(key, score, member) {
    this.stats.commands++;
    let zset = this.sortedSets.get(key);
    if (!zset) {
      zset = new RedisSortedSet();
      this.sortedSets.set(key, zset);
    }
    return zset.zadd(member, score);
  }

  zrange(key, start = 0, stop = -1) {
    this.stats.commands++;
    const zset = this.sortedSets.get(key);
    return zset ? zset.zrange(start, stop) : [];
  }

  // PubSub
  publish(channel, message) {
    return this.pubsub.publish(channel, message);
  }

  keys(pattern = '*') {
    const allKeys = [
      ...this.strings.keys(),
      ...this.lists.keys(),
      ...this.hashes.keys(),
      ...this.sets.keys(),
      ...this.sortedSets.keys()
    ];
    if (pattern === '*') return allKeys;
    const regex = new RegExp(pattern.replace('*', '.*'));
    return allKeys.filter(k => regex.test(k));
  }

  del(key) {
    this.stats.commands++;
    const deleted =
      (this.strings.delete(key) ? 1 : 0) +
      (this.lists.delete(key) ? 1 : 0) +
      (this.hashes.delete(key) ? 1 : 0) +
      (this.sets.delete(key) ? 1 : 0) +
      (this.sortedSets.delete(key) ? 1 : 0);
    this.ttls.delete(key);
    return deleted;
  }

  getStats() {
    return {
      ...this.stats,
      keys: this.keys().length,
      strings: this.strings.size,
      lists: this.lists.size,
      hashes: this.hashes.size,
      sets: this.sets.size,
      sortedSets: this.sortedSets.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const redis = new RedisAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Redis Demo\n');

    // 1. Keys
    console.log('1. Keys:');
    const keys = redis.keys();
    console.log(`   Total: ${keys.length}`);
    keys.slice(0, 5).forEach(k => console.log(`   - ${k}`));

    // 2. String operations
    console.log('\n2. String Operations:');
    const counter = redis.incr('counter');
    console.log(`   INCR counter: ${counter}`);
    const config = redis.get('config:app');
    console.log(`   GET config:app: ${config}`);

    // 3. List operations
    console.log('\n3. List Operations:');
    const len = redis.lpush('queue:tasks', 'task:0');
    console.log(`   LPUSH queue:tasks: ${len}`);
    const tasks = redis.lrange('queue:tasks', 0, 2);
    console.log(`   LRANGE: ${tasks.join(', ')}`);

    // 4. Hash operations
    console.log('\n4. Hash Operations:');
    redis.hset('user:2', 'name', 'Bob');
    const user = redis.hgetall('user:1');
    console.log(`   HGETALL user:1: ${JSON.stringify(user)}`);

    // 5. Set operations
    console.log('\n5. Set Operations:');
    redis.sadd('tags:article:1', 'redis');
    const tags = redis.smembers('tags:article:1');
    console.log(`   SMEMBERS tags:article:1: ${tags.join(', ')}`);

    // 6. Sorted set (leaderboard)
    console.log('\n6. Sorted Set (Leaderboard):');
    redis.zadd('leaderboard', 95, 'diana');
    const top3 = redis.zrange('leaderboard', 0, 2);
    console.log(`   ZRANGE leaderboard (top 3): ${top3.join(', ')}`);

    // 7. PubSub
    console.log('\n7. PubSub:');
    const msgCount = redis.publish('news', 'Breaking news!');
    console.log(`   PUBLISH news: ${msgCount} subscribers`);

    // 8. Statistics
    console.log('\n8. Statistics:');
    const stats = redis.getStats();
    console.log(`   Commands: ${stats.commands}`);
    console.log(`   Keys: ${stats.keys}`);
    console.log(`   Strings: ${stats.strings}`);
    console.log(`   Lists: ${stats.lists}`);
    console.log(`   Hashes: ${stats.hashes}`);
    console.log(`   Sets: ${stats.sets}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'keys':
    console.log('Keys:');
    redis.keys().forEach(k => console.log(`  - ${k}`));
    break;

  case 'strings':
    console.log('String Operations:');
    console.log(`  GET: ${redis.get('config:app')}`);
    console.log(`  INCR: ${redis.incr('counter')}`);
    redis.set('test:string', 'hello', 60);
    console.log(`  SET: OK`);
    break;

  case 'lists':
    console.log('List Operations:');
    console.log(`  LRANGE: ${redis.lrange('queue:tasks').join(', ')}`);
    console.log(`  LPUSH: ${redis.lpush('queue:tasks', 'new:task')}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-redis.js [demo|keys|strings|lists]');
}
