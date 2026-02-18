/**
 * API Gateway Middleware - Node.js Express
 * 统一 API 入口、认证、限流
 */

const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { RateLimiterRedis } = require('rate-limiter-flexible');
const Redis = require('ioredis');
const { createHash } = require('crypto');

// ========== Configuration ==========

const config = {
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtExpiry: process.env.JWT_EXPIRY || '24h',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  defaultRateLimit: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // requests per window
    message: { error: 'Too many requests, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
  }
};

// ========== Redis Client ==========

let redisClient = null;

function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(config.redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
    });
  }
  return redisClient;
}

// ========== JWT Authentication Middleware ==========

/**
 * JWT Authentication Middleware
 */
function authenticateJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: 'Authorization header missing' });
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  jwt.verify(token, config.jwtSecret, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    next();
  });
}

/**
 * Optional JWT Authentication
 * - Doesn't fail if no token, but attaches user if valid
 */
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return next();
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : authHeader;

  jwt.verify(token, config.jwtSecret, (err, user) => {
    if (!err) {
      req.user = user;
    }
    next();
  });
}

/**
 * Generate JWT Token
 */
function generateToken(payload, expiresIn = config.jwtExpiry) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn });
}

/**
 * Verify JWT Token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (err) {
    return null;
  }
}

// ========== Rate Limiting ==========

/**
 * Create rate limiter instance
 */
function createRateLimiter(options = {}) {
  const limiterConfig = {
    ...config.defaultRateLimit,
    ...options,
    windowMs: options.windowMs || config.defaultRateLimit.windowMs,
    max: options.max || config.defaultRateLimit.max,
  };

  return rateLimit(limiterConfig);
}

/**
 * Redis-based rate limiter (for distributed systems)
 */
async function createRedisRateLimiter(options = {}) {
  const redis = getRedisClient();

  const limiter = new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: options.keyPrefix || 'rl:',
    points: options.max || 100,
    duration: (options.windowMs || 60000) / 1000, // seconds
    blockDuration: 0,
  });

  return limiter;
}

/**
 * Rate limiter middleware factory
 */
function rateLimiter(options = {}) {
  const windowMs = options.windowMs || 60000;
  const max = options.max || 100;
  const keyGenerator = options.keyGenerator || ((req) => {
    return req.ip || req.connection.remoteAddress || 'unknown';
  });

  const limiter = rateLimit({
    windowMs,
    max,
    keyGenerator,
    message: options.message || { error: 'Too many requests' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: options.skip || (() => false),
    handler: (req, res) => {
      if (options.onLimitReached) {
        options.onLimitReached(req);
      }
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });

  return limiter;
}

/**
 * IP-based rate limiter
 */
const ipRateLimiter = rateLimiter({
  max: 50,
  windowMs: 60 * 1000,
  keyGenerator: (req) => req.ip
});

/**
 * Authenticated user rate limiter
 */
const userRateLimiter = rateLimiter({
  max: 200,
  windowMs: 60 * 1000,
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * API Key rate limiter
 */
const apiKeyRateLimiter = rateLimiter({
  max: 1000,
  windowMs: 60 * 1000,
  keyGenerator: (req) => {
    const apiKey = req.headers['x-api-key'] || req.query.api_key;
    return apiKey || req.ip;
  }
});

// ========== API Key Authentication ==========

/**
 * API Key validation
 */
const apiKeys = new Map(); // In production, use database

function registerApiKey(name, key, rateLimit = 100) {
  const hashedKey = createHash('sha256').update(key).digest('hex');
  apiKeys.set(hashedKey, {
    name,
    rateLimit,
    createdAt: new Date(),
    isActive: true
  });
  return key;
}

function validateApiKey(key) {
  const hashedKey = createHash('sha256').update(key).digest('hex');
  return apiKeys.get(hashedKey);
}

function revokeApiKey(key) {
  const hashedKey = createHash('sha256').update(key).digest('hex');
  const apiKey = apiKeys.get(hashedKey);
  if (apiKey) {
    apiKey.isActive = false;
    return true;
  }
  return false;
}

/**
 * API Key Authentication Middleware
 */
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({ error: 'API key required' });
  }

  const keyData = validateApiKey(apiKey);

  if (!keyData) {
    return res.status(403).json({ error: 'Invalid API key' });
  }

  if (!keyData.isActive) {
    return res.status(403).json({ error: 'API key revoked' });
  }

  req.apiKey = keyData;
  req.rateLimit = keyData.rateLimit;
  next();
}

// ========== Request Validation ==========

/**
 * Validate request body schema
 */
function validateBody(schema) {
  return (req, res, next) => {
    const errors = [];

    for (const [field, rules] of Object.entries(schema)) {
      const value = req.body[field];

      if (rules.required && (value === undefined || value === null || value === '')) {
        errors.push(`${field} is required`);
        continue;
      }

      if (value !== undefined && rules.type) {
        if (rules.type === 'string' && typeof value !== 'string') {
          errors.push(`${field} must be a string`);
        } else if (rules.type === 'number' && typeof value !== 'number') {
          errors.push(`${field} must be a number`);
        } else if (rules.type === 'array' && !Array.isArray(value)) {
          errors.push(`${field} must be an array`);
        } else if (rules.type === 'object' && typeof value !== 'object') {
          errors.push(`${field} must be an object`);
        }
      }

      if (rules.minLength && value && value.length < rules.minLength) {
        errors.push(`${field} must be at least ${rules.minLength} characters`);
      }

      if (rules.maxLength && value && value.length > rules.maxLength) {
        errors.push(`${field} must be at most ${rules.maxLength} characters`);
      }

      if (rules.min !== undefined && value < rules.min) {
        errors.push(`${field} must be at least ${rules.min}`);
      }

      if (rules.max !== undefined && value > rules.max) {
        errors.push(`${field} must be at most ${rules.max}`);
      }

      if (rules.pattern && value && !new RegExp(rules.pattern).test(value)) {
        errors.push(`${field} has invalid format`);
      }

      if (rules.enum && value && !rules.enum.includes(value)) {
        errors.push(`${field} must be one of: ${rules.enum.join(', ')}`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    next();
  };
}

// ========== Request Router ==========

/**
 * Simple router for routing requests to backends
 */
class RequestRouter {
  constructor() {
    this.routes = [];
  }

  addRoute(path, backend, options = {}) {
    this.routes.push({
      path,
      backend,
      methods: options.methods || ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      auth: options.auth || false,
      rateLimit: options.rateLimit || null,
    });
    return this;
  }

  matchRoute(req) {
    const path = req.path;
    const method = req.method;

    for (const route of this.routes) {
      if (route.methods.includes(method) && this.matchPath(route.path, path)) {
        return route;
      }
    }

    return null;
  }

  matchPath(pattern, path) {
    // Simple pattern matching with :param support
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        continue;
      }
      if (patternParts[i] !== pathParts[i]) {
        return false;
      }
    }

    return true;
  }

  middleware() {
    const router = this;

    return async (req, res, next) => {
      const route = router.matchRoute(req);

      if (!route) {
        return next();
      }

      // Store route info
      req.routeInfo = route;

      next();
    };
  }
}

// ========== Load Balancer ==========

/**
 * Load balancer for backend services
 */
class LoadBalancer {
  constructor(strategy = 'round-robin') {
    this.strategy = strategy;
    this.backends = new Map(); // url -> { weight, currentConnections, totalRequests, healthy }
    this.rrCounters = new Map(); // group -> counter
  }

  addBackend(url, weight = 1) {
    this.backends.set(url, {
      url,
      weight,
      currentConnections: 0,
      totalRequests: 0,
      failedRequests: 0,
      healthy: true,
      lastHealthCheck: Date.now()
    });
  }

  removeBackend(url) {
    this.backends.delete(url);
    this.rrCounters.delete(url);
  }

  setHealthy(url, healthy) {
    const backend = this.backends.get(url);
    if (backend) {
      backend.healthy = healthy;
      backend.lastHealthCheck = Date.now();
    }
  }

  selectBackend() {
    const healthyBackends = Array.from(this.backends.values())
      .filter(b => b.healthy);

    if (healthyBackends.length === 0) {
      return null;
    }

    switch (this.strategy) {
      case 'round-robin':
        return this.roundRobin(healthyBackends);
      case 'least-connections':
        return this.leastConnections(healthyBackends);
      case 'weighted':
        return this.weighted(healthyBackends);
      case 'ip-hash':
        return this.ipHash(healthyBackends);
      default:
        return healthyBackends[0];
    }
  }

  roundRobin(backends) {
    const key = 'default';
    const counter = (this.rrCounters.get(key) || 0) + 1;
    this.rrCounters.set(key, counter);

    return backends[(counter - 1) % backends.length];
  }

  leastConnections(backends) {
    return backends.reduce((min, b) =>
      b.currentConnections < min.currentConnections ? b : min
    );
  }

  weighted(backends) {
    const totalWeight = backends.reduce((sum, b) => sum + b.weight, 0);
    let random = Math.random() * totalWeight;

    for (const backend of backends) {
      random -= backend.weight;
      if (random <= 0) {
        return backend;
      }
    }

    return backends[0];
  }

  ipHash(backends) {
    // Use IP-based hash
    return backends[0]; // Simplified
  }

  recordRequest(url, success = true) {
    const backend = this.backends.get(url);
    if (backend) {
      backend.totalRequests++;
      backend.currentConnections++;
      if (!success) {
        backend.failedRequests++;
      }
    }
  }

  recordResponse(url) {
    const backend = this.backends.get(url);
    if (backend) {
      backend.currentConnections = Math.max(0, backend.currentConnections - 1);
    }
  }

  getStats() {
    return Array.from(this.backends.values()).map(b => ({
      url: b.url,
      healthy: b.healthy,
      currentConnections: b.currentConnections,
      totalRequests: b.totalRequests,
      failedRequests: b.failedRequests,
      failureRate: b.totalRequests > 0
        ? (b.failedRequests / b.totalRequests).toFixed(2)
        : 0
    }));
  }
}

// ========== Circuit Breaker ==========

/**
 * Circuit breaker for fault tolerance
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.name = options.name || 'default';
    this.failureThreshold = options.failureThreshold || 5;
    this.successThreshold = options.successThreshold || 2;
    this.timeout = options.timeout || 60000; // 1 minute

    this.state = 'closed'; // closed, open, half-open
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
  }

  async execute(fn) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.timeout) {
        this.state = 'half-open';
        this.successes = 0;
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.failures = 0;

    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'closed';
      }
    }
  }

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime
    };
  }

  reset() {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
  }
}

// ========== Export ==========

module.exports = {
  // Config
  config,

  // JWT
  authenticateJWT,
  optionalAuth,
  generateToken,
  verifyToken,

  // Rate Limiting
  createRateLimiter,
  rateLimiter,
  ipRateLimiter,
  userRateLimiter,
  apiKeyRateLimiter,

  // API Key
  registerApiKey,
  validateApiKey,
  revokeApiKey,
  authenticateApiKey,

  // Validation
  validateBody,

  // Router
  RequestRouter,

  // Load Balancer
  LoadBalancer,

  // Circuit Breaker
  CircuitBreaker,

  // Redis
  getRedisClient
};
