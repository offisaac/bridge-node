/**
 * Session Manager - 会话管理器
 * 用户会话管理，支持集群部署
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ========== Session Types ==========

const SessionStatus = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  REVOKED: 'revoked'
};

// ========== Session ==========

class Session {
  constructor(id, userId, config = {}) {
    this.id = id;
    this.userId = userId;
    this.status = SessionStatus.ACTIVE;
    this.createdAt = config.createdAt || new Date().toISOString();
    this.lastAccessedAt = this.createdAt;
    this.expiresAt = config.expiresAt || null;
    this.refreshedAt = null;
    this.ipAddress = config.ipAddress || null;
    this.userAgent = config.userAgent || null;
    this.data = config.data || {};
    this.metadata = config.metadata || {};
  }

  isExpired() {
    if (!this.expiresAt) return false;
    return new Date(this.expiresAt) < new Date();
  }

  isActive() {
    return this.status === SessionStatus.ACTIVE && !this.isExpired();
  }

  touch() {
    this.lastAccessedAt = new Date().toISOString();
    return this;
  }

  extend(ttl) {
    const now = new Date();
    if (this.expiresAt) {
      this.expiresAt = new Date(new Date(this.expiresAt).getTime() + ttl).toISOString();
    } else {
      this.expiresAt = new Date(now.getTime() + ttl).toISOString();
    }
    this.refreshedAt = new Date().toISOString();
    return this;
  }

  revoke() {
    this.status = SessionStatus.REVOKED;
    return this;
  }

  set(key, value) {
    this.data[key] = value;
    return this;
  }

  get(key, defaultValue = null) {
    return this.data[key] ?? defaultValue;
  }

  remove(key) {
    delete this.data[key];
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      status: this.status,
      createdAt: this.createdAt,
      lastAccessedAt: this.lastAccessedAt,
      expiresAt: this.expiresAt,
      refreshedAt: this.refreshedAt,
      ipAddress: this.ipAddress,
      userAgent: this.userAgent,
      data: this.data,
      metadata: this.metadata
    };
  }
}

// ========== Session Store ==========

class SessionStore {
  constructor(options = {}) {
    this.ttl = options.ttl || 3600000; // 1 hour default
    this.storage = options.storage || 'memory'; // memory, redis, file
    this.redisClient = options.redisClient || null;
    this.storagePath = options.storagePath || './sessions';
    this.prefix = options.prefix || 'session:';

    this.sessions = new Map();
    this.cleanupInterval = null;

    this._init();
  }

  _init() {
    // Initialize storage
    if (this.storage === 'file') {
      if (!fs.existsSync(this.storagePath)) {
        fs.mkdirSync(this.storagePath, { recursive: true });
      }
      this._loadFromFile();
    }

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Clean up every minute
  }

  async create(session) {
    if (this.storage === 'redis' && this.redisClient) {
      await this._createRedis(session);
    } else if (this.storage === 'file') {
      this._createFile(session);
    } else {
      this.sessions.set(session.id, session);
    }
    return session;
  }

  async get(sessionId) {
    let session;

    if (this.storage === 'redis' && this.redisClient) {
      session = await this._getRedis(sessionId);
    } else if (this.storage === 'file') {
      session = this._getFile(sessionId);
    } else {
      session = this.sessions.get(sessionId);
    }

    if (session && session.isExpired()) {
      await this.destroy(sessionId);
      return null;
    }

    return session;
  }

  async update(session) {
    if (this.storage === 'redis' && this.redisClient) {
      await this._updateRedis(session);
    } else if (this.storage === 'file') {
      this._updateFile(session);
    } else {
      this.sessions.set(session.id, session);
    }
    return session;
  }

  async destroy(sessionId) {
    if (this.storage === 'redis' && this.redisClient) {
      await this._destroyRedis(sessionId);
    } else if (this.storage === 'file') {
      this._destroyFile(sessionId);
    } else {
      this.sessions.delete(sessionId);
    }
  }

  async destroyByUserId(userId) {
    const sessions = await this.findByUserId(userId);
    for (const session of sessions) {
      await this.destroy(session.id);
    }
    return sessions.length;
  }

  async findByUserId(userId) {
    const sessions = [];

    if (this.storage === 'redis' && this.redisClient) {
      // For Redis, scan keys
      const keys = await this.redisClient.keys(`${this.prefix}*`);
      for (const key of keys) {
        const data = await this.redisClient.get(key);
        const session = JSON.parse(data);
        if (session.userId === userId && session.status === SessionStatus.ACTIVE) {
          sessions.push(new Session(session.id, session.userId, session));
        }
      }
    } else if (this.storage === 'file') {
      // For file storage, scan directory
      const files = fs.readdirSync(this.storagePath);
      for (const file of files) {
        const data = fs.readFileSync(path.join(this.storagePath, file), 'utf8');
        const session = JSON.parse(data);
        if (session.userId === userId && session.status === SessionStatus.ACTIVE) {
          sessions.push(new Session(session.id, session.userId, session));
        }
      }
    } else {
      // For memory storage
      for (const session of this.sessions.values()) {
        if (session.userId === userId && session.isActive()) {
          sessions.push(session);
        }
      }
    }

    return sessions;
  }

  async all() {
    const sessions = [];

    if (this.storage === 'redis' && this.redisClient) {
      const keys = await this.redisClient.keys(`${this.prefix}*`);
      for (const key of keys) {
        const data = await this.redisClient.get(key);
        const session = JSON.parse(data);
        if (session.status === SessionStatus.ACTIVE) {
          sessions.push(new Session(session.id, session.userId, session));
        }
      }
    } else if (this.storage === 'file') {
      const files = fs.readdirSync(this.storagePath);
      for (const file of files) {
        const data = fs.readFileSync(path.join(this.storagePath, file), 'utf8');
        const session = JSON.parse(data);
        if (session.status === SessionStatus.ACTIVE) {
          sessions.push(new Session(session.id, session.userId, session));
        }
      }
    } else {
      for (const session of this.sessions.values()) {
        if (session.isActive()) {
          sessions.push(session);
        }
      }
    }

    return sessions;
  }

  cleanup() {
    let cleaned = 0;

    for (const [id, session] of this.sessions) {
      if (session.isExpired() || session.status !== SessionStatus.ACTIVE) {
        this.sessions.delete(id);
        cleaned++;
      }
    }

    return cleaned;
  }

  // ========== Redis Storage ==========

  async _createRedis(session) {
    const key = `${this.prefix}${session.id}`;
    const ttlSeconds = session.expiresAt
      ? Math.max(1, Math.floor((new Date(session.expiresAt) - new Date()) / 1000))
      : this.ttl / 1000;

    await this.redisClient.setex(key, ttlSeconds, JSON.stringify(session.toJSON()));
  }

  async _getRedis(sessionId) {
    const key = `${this.prefix}${sessionId}`;
    const data = await this.redisClient.get(key);
    if (!data) return null;

    const sessionData = JSON.parse(data);
    return new Session(sessionData.id, sessionData.userId, sessionData);
  }

  async _updateRedis(session) {
    await this._createRedis(session); // Same as create for Redis
  }

  async _destroyRedis(sessionId) {
    const key = `${this.prefix}${sessionId}`;
    await this.redisClient.del(key);
  }

  // ========== File Storage ==========

  _loadFromFile() {
    if (!fs.existsSync(this.storagePath)) return;

    const files = fs.readdirSync(this.storagePath);
    for (const file of files) {
      try {
        const data = fs.readFileSync(path.join(this.storagePath, file), 'utf8');
        const session = JSON.parse(data);
        this.sessions.set(session.id, new Session(session.id, session.userId, session));
      } catch (err) {
        console.error(`Failed to load session ${file}:`, err);
      }
    }
  }

  _createFile(session) {
    const file = path.join(this.storagePath, `${session.id}.json`);
    fs.writeFileSync(file, JSON.stringify(session.toJSON(), null, 2));
    this.sessions.set(session.id, session);
  }

  _getFile(sessionId) {
    const file = path.join(this.storagePath, `${sessionId}.json`);
    if (!fs.existsSync(file)) return null;

    const data = fs.readFileSync(file, 'utf8');
    const sessionData = JSON.parse(data);
    return new Session(sessionData.id, sessionData.userId, sessionData);
  }

  _updateFile(session) {
    this._createFile(session);
  }

  _destroyFile(sessionId) {
    const file = path.join(this.storagePath, `${sessionId}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
    this.sessions.delete(sessionId);
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// ========== Session Manager ==========

class SessionManager {
  constructor(options = {}) {
    this.store = new SessionStore({
      storage: options.storage || 'memory',
      ttl: options.ttl || 3600000,
      redisClient: options.redisClient,
      storagePath: options.storagePath
    });
    this.cookieName = options.cookieName || 'session_id';
    this.cookieOptions = options.cookieOptions || {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 3600000
    };
  }

  // ========== Session Operations ==========

  async create(userId, options = {}) {
    const sessionId = crypto.randomUUID();
    const ttl = options.ttl || this.store.ttl;
    const expiresAt = new Date(Date.now() + ttl).toISOString();

    const session = new Session(sessionId, userId, {
      expiresAt,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      data: options.data || {},
      metadata: options.metadata || {}
    });

    await this.store.create(session);
    return session;
  }

  async get(sessionId) {
    if (!sessionId) return null;
    return this.store.get(sessionId);
  }

  async refresh(sessionId, ttl) {
    const session = await this.store.get(sessionId);
    if (!session) return null;

    session.extend(ttl || this.store.ttl);
    await this.store.update(session);
    return session;
  }

  async destroy(sessionId) {
    return this.store.destroy(sessionId);
  }

  async destroyUserSessions(userId) {
    return this.store.destroyByUserId(userId);
  }

  async touch(sessionId) {
    const session = await this.store.get(sessionId);
    if (!session) return null;

    session.touch();
    await this.store.update(session);
    return session;
  }

  // ========== Middleware ==========

  middleware(options = {}) {
    const cookieName = options.cookieName || this.cookieName;

    return async (req, res, next) => {
      // Get session ID from cookie
      const sessionId = req.cookies?.[cookieName] || req.headers['x-session-id'];

      if (sessionId) {
        const session = await this.get(sessionId);
        if (session && session.isActive()) {
          req.session = session;
          req.sessionId = sessionId;

          // Touch session on each request
          await this.touch(sessionId);
        } else {
          req.session = null;
          req.sessionId = null;
        }
      } else {
        req.session = null;
        req.sessionId = null;
      }

      next();
    };
  }

  // ========== Auth Helpers =========-

  async login(userId, options = {}) {
    // Destroy existing sessions for user
    await this.destroyUserSessions(userId);

    // Create new session
    const session = await this.create(userId, options);

    return session;
  }

  async logout(sessionId) {
    return this.destroy(sessionId);
  }

  async isAuthenticated(sessionId) {
    const session = await this.get(sessionId);
    return session && session.isActive();
  }

  async getUserSession(sessionId) {
    return this.get(sessionId);
  }

  // ========== Statistics ==========

  async getStats() {
    const sessions = await this.store.all();
    const now = Date.now();

    let activeCount = 0;
    let expiredCount = 0;

    for (const session of sessions) {
      if (session.expiresAt && new Date(session.expiresAt) < new Date()) {
        expiredCount++;
      } else {
        activeCount++;
      }
    }

    // Get unique users
    const userIds = new Set(sessions.map(s => s.userId));

    return {
      total: sessions.length,
      active: activeCount,
      expired: expiredCount,
      uniqueUsers: userIds.size
    };
  }
}

// ========== Export ==========

module.exports = {
  SessionManager,
  Session,
  SessionStore,
  SessionStatus
};
