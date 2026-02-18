/**
 * Distributed Lock Service - 分布式锁服务
 * 支持 Redis 分布式锁和文件锁
 */

let Redis;
try {
  Redis = require('ioredis');
} catch (e) {
  console.warn('ioredis not installed, Redis locks unavailable');
}

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

// ========== Configuration ==========

const DEFAULT_CONFIG = {
  timeout: 30000,        // 锁超时时间(ms)
  retryTimes: 3,          // 重试次数
  retryDelay: 200,       // 重试延迟(ms)
  blocking: false,       // 是否阻塞
  blockingTimeout: null, // 阻塞超时
  watchdogInterval: 10000 // 看门狗间隔(ms)
};

// ========== Base Lock Error ==========

class LockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LockError';
  }
}

// ========== Redis Lock ==========

class RedisLock {
  constructor(redis, key, config = {}) {
    this.redis = redis;
    this.key = `lock:${key}`;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.token = crypto.randomUUID();
    this._watchdog = null;
  }

  async acquire() {
    const { timeout, retryTimes, retryDelay, blocking, blockingTimeout } = this.config;
    let attempts = 0;
    const startTime = Date.now();

    while (true) {
      const acquired = await this._tryAcquire(timeout);

      if (acquired) {
        this._startWatchdog();
        return true;
      }

      attempts++;

      if (!blocking) {
        if (attempts >= retryTimes) {
          return false;
        }
      } else if (blockingTimeout) {
        if (Date.now() - startTime >= blockingTimeout) {
          return false;
        }
      }

      await this._sleep(retryDelay);
    }
  }

  async _tryAcquire(timeout) {
    try {
      const result = await this.redis.set(this.key, this.token, 'PX', timeout, 'NX');
      return result === 'OK';
    } catch (error) {
      console.error('Failed to acquire lock:', error);
      return false;
    }
  }

  _startWatchdog() {
    const interval = Math.floor(this.config.timeout / 3);

    this._watchdog = setInterval(async () => {
      if (await this.isLocked()) {
        const ttl = await this.redis.pttl(this.key);
        if (ttl > 0 && ttl < this.config.timeout / 2) {
          await this.redis.pexpire(this.key, this.config.timeout);
        }
      } else {
        this._stopWatchdog();
      }
    }, interval);
  }

  _stopWatchdog() {
    if (this._watchdog) {
      clearInterval(this._watchdog);
      this._watchdog = null;
    }
  }

  async release() {
    this._stopWatchdog();

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(script, 1, this.key, this.token);
      return result === 1;
    } catch (error) {
      console.error('Failed to release lock:', error);
      return false;
    }
  }

  async isLocked() {
    try {
      const result = await this.redis.exists(this.key);
      return result === 1;
    } catch {
      return false;
    }
  }

  async extend(additionalTime) {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    try {
      const result = await this.redis.eval(
        script,
        1,
        this.key,
        this.token,
        additionalTime || this.config.timeout
      );
      return result === 1;
    } catch {
      return false;
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Context manager
  async [Symbol.asyncDispose]() {
    await this.release();
  }
}

// ========== File Lock ==========

class FileLock {
  constructor(filePath, config = {}) {
    this.filePath = filePath;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.token = crypto.randomUUID();
    this.lockFile = `${filePath}.lock`;
    this._released = false;
  }

  async acquire() {
    const { timeout, retryTimes, retryDelay, blocking, blockingTimeout } = this.config;
    let attempts = 0;
    const startTime = Date.now();

    while (true) {
      const acquired = await this._tryAcquire();

      if (acquired) {
        return true;
      }

      attempts++;

      if (!blocking) {
        if (attempts >= retryTimes) {
          return false;
        }
      } else if (blockingTimeout) {
        if (Date.now() - startTime >= blockingTimeout) {
          return false;
        }
      }

      await this._sleep(retryDelay);
    }
  }

  async _tryAcquire() {
    try {
      // 确保目录存在
      const dir = path.dirname(this.lockFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 尝试创建锁文件
      fs.writeFileSync(this.lockFile, this.token, { flag: 'wx' });
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') {
        // 检查锁是否过期
        const stats = fs.statSync(this.lockFile);
        const age = Date.now() - stats.mtimeMs;

        if (age > this.config.timeout) {
          // 锁已过期，强制删除
          try {
            fs.unlinkSync(this.lockFile);
          } catch {
            // 可能被其他进程删除了
          }
        }
        return false;
      }
      throw error;
    }
  }

  async release() {
    if (this._released) return true;

    try {
      const content = fs.readFileSync(this.lockFile, 'utf8');
      if (content === this.token) {
        fs.unlinkSync(this.lockFile);
        this._released = true;
        return true;
      }
      return false;
    } catch (error) {
      if (error.code === 'ENOENT') {
        return true;
      }
      throw error;
    }
  }

  async isLocked() {
    return fs.existsSync(this.lockFile);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async [Symbol.asyncDispose]() {
    await this.release();
  }
}

// ========== Lock Manager ==========

class LockManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.locks = new Map();
    this.useRedis = options.useRedis && Redis;

    if (this.useRedis) {
      try {
        this.redis = options.redis || new Redis(options.redisUrl || 'redis://localhost:6379');
      } catch (e) {
        console.warn('Failed to connect to Redis, using file locks only');
        this.useRedis = false;
      }
    }

    this.fileLockDir = options.fileLockDir || '/tmp/locks';
  }

  /**
   * 获取 Redis 分布式锁
   */
  getRedisLock(key, config = {}) {
    const lock = new RedisLock(this.redis, key, config);
    return lock;
  }

  /**
   * 获取文件锁
   */
  getFileLock(key, config = {}) {
    const filePath = path.join(this.fileLockDir, key.replace(/[:/]/g, '_'));
    return new FileLock(filePath, config);
  }

  /**
   * 获取锁 (自动选择)
   */
  lock(key, config = {}) {
    if (this.useRedis) {
      return this.getRedisLock(key, config);
    }
    return this.getFileLock(key, config);
  }

  /**
   * 作用域锁
   */
  async withLock(key, callback, config = {}) {
    const lock = this.lock(key, config);

    try {
      const acquired = await lock.acquire();

      if (!acquired) {
        throw new LockError(`Failed to acquire lock: ${key}`);
      }

      return await callback();
    } finally {
      await lock.release();
    }
  }

  /**
   * 获取锁信息
   */
  async getLockInfo(key) {
    if (this.useRedis) {
      const lockKey = `lock:${key}`;
      const exists = await this.redis.exists(lockKey);

      if (!exists) {
        return { exists: false };
      }

      const token = await this.redis.get(lockKey);
      const ttl = await this.redis.pttl(lockKey);

      return {
        exists: true,
        token: token ? `${token.slice(0, 8)}...` : null,
        ttl,
        expiresAt: ttl > 0 ? new Date(Date.now() + ttl).toISOString() : null
      };
    }

    const lock = this.getFileLock(key);
    const locked = await lock.isLocked();
    return { exists: locked };
  }

  /**
   * 列出所有锁
   */
  async listLocks(pattern = 'lock:*') {
    if (this.useRedis) {
      const keys = await this.redis.keys(pattern);
      const locks = [];

      for (const key of keys) {
        const token = await this.redis.get(key);
        const ttl = await this.redis.pttl(key);

        locks.push({
          key: key.toString(),
          token: token ? `${token.slice(0, 8)}...` : null,
          ttl
        });
      }

      return locks;
    }

    return [];
  }

  /**
   * 释放所有锁
   */
  async releaseAll() {
    const locks = await this.listLocks();

    for (const lock of locks) {
      await this.redis.del(lock.key);
    }

    return locks.length;
  }

  /**
   * 关闭
   */
  async close() {
    if (this.useRedis && this.redis) {
      await this.redis.quit();
    }
  }
}

// ========== Semaphore ==========

class RedisSemaphore {
  constructor(redis, key, limit, config = {}) {
    this.redis = redis;
    this.key = `semaphore:${key}`;
    this.limit = limit;
    this.config = config;
    this.token = crypto.randomUUID();
  }

  async acquire(timeout = 0) {
    const startTime = Date.now();

    while (true) {
      const count = await this.redis.scard(this.key);

      if (count < this.limit) {
        const added = await this.redis.sadd(this.key, this.token);
        if (added) {
          return true;
        }
      }

      if (timeout > 0 && Date.now() - startTime >= timeout) {
        return false;
      }

      await this._sleep(100);
    }
  }

  async release() {
    return await this.redis.srem(this.key, this.token);
  }

  async available() {
    const count = await this.redis.scard(this.key);
    return Math.max(0, this.limit - count);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ========== Factory ==========

function createLockManager(options) {
  return new LockManager(options);
}

// ========== Export ==========

module.exports = {
  RedisLock,
  FileLock,
  LockManager,
  RedisSemaphore,
  LockError,
  createLockManager,
  DEFAULT_CONFIG
};
