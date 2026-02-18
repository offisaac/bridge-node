/**
 * Agent HTTP Module
 *
 * Provides HTTP client with retry, timeout, circuit breaker, and caching.
 * Usage: node agent-http.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   get <url>            GET request
 *   post <url> <data>    POST request
 *   status                 Show HTTP stats
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const HTTP_DB = path.join(DATA_DIR, 'http-state.json');

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
 * HTTP Methods
 */
const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS'
};

/**
 * HTTP Headers
 */
class HttpHeaders {
  constructor(headers = {}) {
    this.headers = {};
    for (const [key, value] of Object.entries(headers)) {
      this.set(key, value);
    }
  }

  set(key, value) {
    this.headers[key.toLowerCase()] = value;
    return this;
  }

  get(key) {
    return this.headers[key.toLowerCase()];
  }

  has(key) {
    return key.toLowerCase() in this.headers;
  }

  delete(key) {
    delete this.headers[key.toLowerCase()];
    return this;
  }

  toObject() {
    return { ...this.headers };
  }
}

/**
 * HTTP Request
 */
class HttpRequest {
  constructor(url, method = HttpMethod.GET, options = {}) {
    this.url = url;
    this.method = method;
    this.options = {
      timeout: options.timeout || 30000,
      retries: options.retries || 3,
      retryDelay: options.retryDelay || 1000,
      retryOn: options.retryOn || [408, 429, 500, 502, 503, 504],
      headers: options.headers || {},
      body: options.body || null,
      params: options.params || {},
      auth: options.auth || null,
      followRedirects: options.followRedirects !== false,
      maxRedirects: options.maxRedirects || 5,
      ...options
    };
    this.headers = new HttpHeaders(this.options.headers);
  }

  header(key, value) {
    this.headers.set(key, value);
    return this;
  }

  auth(username, password) {
    const credentials = Buffer.from(`${username}:${password}`).toString('base64');
    this.headers.set('Authorization', `Basic ${credentials}`);
    return this;
  }

  bearer(token) {
    this.headers.set('Authorization', `Bearer ${token}`);
    return this;
  }

  json(data) {
    this.headers.set('Content-Type', 'application/json');
    this.options.body = JSON.stringify(data);
    return this;
  }

  query(key, value) {
    this.options.params[key] = value;
    return this;
  }

  timeout(ms) {
    this.options.timeout = ms;
    return this;
  }

  buildUrl() {
    const url = new URL(this.url);
    for (const [key, value] of Object.entries(this.options.params)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  }
}

/**
 * HTTP Response
 */
class HttpResponse {
  constructor(status, statusText, data, headers, request) {
    this.status = status;
    this.statusText = statusText;
    this.data = data;
    this.headers = headers;
    this.request = request;
    this.ok = status >= 200 && status < 300;
    this.redirected = false;
  }

  json() {
    if (typeof this.data === 'string') {
      try {
        return JSON.parse(this.data);
      } catch {
        return this.data;
      }
    }
    return this.data;
  }

  text() {
    return typeof this.data === 'string' ? this.data : JSON.stringify(this.data);
  }
}

/**
 * HTTP Client
 */
class HttpClient {
  constructor(options = {}) {
    this.options = {
      baseURL: options.baseURL || '',
      timeout: options.timeout || 30000,
      retries: options.retries || 3,
      retryDelay: options.retryDelay || 1000,
      ...options
    };
    this.defaultHeaders = new HttpHeaders(options.headers || {});
    this.interceptors = {
      request: [],
      response: []
    };
  }

  request(url, method = HttpMethod.GET, options = {}) {
    const fullUrl = url.startsWith('http') ? url : this.options.baseURL + url;
    const request = new HttpRequest(fullUrl, method, {
      ...this.options,
      ...options,
      headers: {
        ...this.defaultHeaders.toObject(),
        ...options.headers
      }
    });

    // Apply request interceptors
    for (const interceptor of this.interceptors.request) {
      interceptor(request);
    }

    return this.executeWithRetry(request);
  }

  async executeWithRetry(request) {
    let lastError;
    const maxRetries = request.options.retries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.execute(request);

        // Apply response interceptors
        for (const interceptor of this.interceptors.response) {
          interceptor(response);
        }

        return response;
      } catch (error) {
        lastError = error;

        const shouldRetry = attempt < maxRetries &&
          request.options.retryOn.includes(error.status);

        if (!shouldRetry) {
          throw error;
        }

        const delay = request.options.retryDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  async execute(request) {
    const startTime = Date.now();

    // Simulate HTTP request (in real use, would use fetch or http module)
    try {
      const result = await this.simulateRequest(request);
      return result;
    } catch (error) {
      throw {
        message: error.message,
        status: error.status || 0,
        request
      };
    }
  }

  async simulateRequest(request) {
    // This is a placeholder - in production, use Node's http module or fetch
    const status = 200;
    const data = { success: true, method: request.method, url: request.url };

    return new HttpResponse(
      status,
      'OK',
      data,
      new HttpHeaders({ 'content-type': 'application/json' }),
      request
    );
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  get(url, options = {}) {
    return this.request(url, HttpMethod.GET, options);
  }

  post(url, data, options = {}) {
    const req = new HttpRequest(url, HttpMethod.POST, options);
    if (typeof data === 'object') {
      req.json(data);
    } else {
      req.options.body = data;
    }
    return this.request(url, HttpMethod.POST, { ...options, body: req.options.body });
  }

  put(url, data, options = {}) {
    const req = new HttpRequest(url, HttpMethod.PUT, options);
    req.json(data);
    return this.request(url, HttpMethod.PUT, { ...options, body: req.options.body });
  }

  patch(url, data, options = {}) {
    const req = new HttpRequest(url, HttpMethod.PATCH, options);
    req.json(data);
    return this.request(url, HttpMethod.PATCH, { ...options, body: req.options.body });
  }

  delete(url, options = {}) {
    return this.request(url, HttpMethod.DELETE, options);
  }

  head(url, options = {}) {
    return this.request(url, HttpMethod.HEAD, options);
  }

  options(url, options = {}) {
    return this.request(url, HttpMethod.OPTIONS, options);
  }

  useRequestInterceptor(fn) {
    this.interceptors.request.push(fn);
    return this;
  }

  useResponseInterceptor(fn) {
    this.interceptors.response.push(fn);
    return this;
  }
}

/**
 * Circuit Breaker
 */
class CircuitBreaker {
  constructor(options = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      timeout: options.timeout || 60000,
      ...options
    };
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
  }

  async execute(fn) {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime > this.options.timeout) {
        this.state = 'half-open';
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
      if (this.successes >= this.options.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
      }
    }
  }

  onFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();
    if (this.state === 'closed' && this.failures >= this.options.failureThreshold) {
      this.state = 'open';
    }
    if (this.state === 'half-open') {
      this.state = 'open';
    }
  }

  getState() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes
    };
  }

  reset() {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
  }
}

/**
 * Request Cache
 */
class RequestCache {
  constructor(options = {}) {
    this.options = {
      ttl: options.ttl || 60000,
      maxSize: options.maxSize || 100,
      ...options
    };
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  set(key, value, ttl = this.options.ttl) {
    if (this.cache.size >= this.options.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      createdAt: Date.now()
    });
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  has(key) {
    return this.get(key) !== null;
  }

  keys() {
    return Array.from(this.cache.keys());
  }

  size() {
    return this.cache.size;
  }

  prune() {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Rate Limiter
 */
class RateLimiter {
  constructor(options = {}) {
    this.options = {
      maxRequests: options.maxRequests || 100,
      windowMs: options.windowMs || 60000,
      ...options
    };
    this.requests = new Map();
  }

  tryAcquire(key = 'default') {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }

    const timestamps = this.requests.get(key);
    const recentRequests = timestamps.filter(t => t > windowStart);

    if (recentRequests.length >= this.options.maxRequests) {
      return {
        allowed: false,
        retryAfter: Math.ceil((recentRequests[0] + this.options.windowMs - now) / 1000)
      };
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);

    return {
      allowed: true,
      remaining: this.options.maxRequests - recentRequests.length
    };
  }

  reset(key = 'default') {
    this.requests.delete(key);
  }

  getStats(key = 'default') {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;
    const timestamps = this.requests.get(key) || [];
    const recentRequests = timestamps.filter(t => t > windowStart);

    return {
      total: timestamps.length,
      remaining: this.options.maxRequests - recentRequests.length,
      resetAt: recentRequests.length > 0
        ? recentRequests[0] + this.options.windowMs
        : now + this.options.windowMs
    };
  }
}

/**
 * Agent HTTP Manager
 */
class AgentHttpManager {
  constructor() {
    this.client = new HttpClient();
    this.circuitBreaker = new CircuitBreaker();
    this.cache = new RequestCache();
    this.rateLimiter = new RateLimiter();
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      cachedRequests: 0,
      retries: 0
    };
    this.state = loadJSON(HTTP_DB, {});
  }

  createClient(options = {}) {
    return new HttpClient({ ...this.options, ...options });
  }

  async request(url, method, options = {}) {
    // Rate limiting
    const rateLimitKey = options.rateLimitKey || 'default';
    const rateCheck = this.rateLimiter.tryAcquire(rateLimitKey);

    if (!rateCheck.allowed) {
      throw new Error(`Rate limit exceeded. Retry after ${rateCheck.retryAfter}s`);
    }

    // Caching for GET requests
    const cacheKey = `${method}:${url}:${JSON.stringify(options)}`;
    if (method === HttpMethod.GET && this.cache.has(cacheKey)) {
      this.stats.cachedRequests++;
      return this.cache.get(cacheKey);
    }

    this.stats.totalRequests++;

    try {
      // Circuit breaker
      const response = await this.circuitBreaker.execute(async () => {
        return this.client.request(url, method, options);
      });

      this.stats.successfulRequests++;

      if (method === HttpMethod.GET && response.ok) {
        this.cache.set(cacheKey, response);
      }

      return response;
    } catch (error) {
      this.stats.failedRequests++;
      throw error;
    }
  }

  async get(url, options = {}) {
    return this.request(url, HttpMethod.GET, options);
  }

  async post(url, data, options = {}) {
    return this.request(url, HttpMethod.POST, { ...options, body: data });
  }

  async put(url, data, options = {}) {
    return this.request(url, HttpMethod.PUT, { ...options, body: data });
  }

  async patch(url, data, options = {}) {
    return this.request(url, HttpMethod.PATCH, { ...options, body: data });
  }

  async delete(url, options = {}) {
    return this.request(url, HttpMethod.DELETE, options);
  }

  clearCache() {
    this.cache.clear();
  }

  getStats() {
    return {
      ...this.stats,
      circuitBreaker: this.circuitBreaker.getState(),
      cacheSize: this.cache.size(),
      rateLimit: this.rateLimiter.getStats()
    };
  }

  save() {
    saveJSON(HTTP_DB, { stats: this.stats });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent HTTP Demo\n');

  const manager = new AgentHttpManager();

  // Basic requests
  console.log('1. Basic Requests:');

  const getResponse = await manager.get('https://api.example.com/users');
  console.log(`   GET: ${getResponse.status} - ${JSON.stringify(getResponse.data)}`);

  const postResponse = await manager.post('https://api.example.com/users', {
    name: 'Test User',
    email: 'test@example.com'
  });
  console.log(`   POST: ${postResponse.status}`);

  // Circuit breaker
  console.log('\n2. Circuit Breaker:');
  const cb = manager.circuitBreaker;
  console.log(`   Initial state: ${cb.getState().state}`);

  for (let i = 0; i < 6; i++) {
    try {
      await cb.execute(async () => {
        throw new Error('Simulated failure');
      });
    } catch (e) {
      // Expected
    }
  }
  console.log(`   After failures: ${cb.getState().state}`);

  cb.reset();
  console.log(`   After reset: ${cb.getState().state}`);

  // Cache
  console.log('\n3. Request Cache:');
  const cache = manager.cache;

  cache.set('key1', { data: 'value1' }, 5000);
  console.log(`   Set key1: ${cache.has('key1')}`);

  const cached = cache.get('key1');
  console.log(`   Get key1: ${cached ? cached.data : 'expired'}`);

  await new Promise(r => setTimeout(r, 100));
  console.log(`   After delay: ${cache.has('key1')}`);

  console.log(`   Cache size: ${cache.size()}`);

  // Rate limiter
  console.log('\n4. Rate Limiter:');
  const limiter = manager.rateLimiter;

  for (let i = 0; i < 3; i++) {
    const result = limiter.tryAcquire('api');
    console.log(`   Request ${i + 1}: ${result.allowed ? 'allowed' : 'blocked'} (${result.remaining} remaining)`);
  }

  const stats = limiter.getStats('api');
  console.log(`   Stats: ${stats.total} total, ${stats.remaining} remaining`);

  // Interceptors
  console.log('\n5. Interceptors:');
  const client = new HttpClient({ baseURL: 'https://api.example.com' });

  client.useRequestInterceptor((req) => {
    console.log(`   Request: ${req.method} ${req.url}`);
  });

  client.useResponseInterceptor((res) => {
    console.log(`   Response: ${res.status}`);
  });

  await client.get('/test');

  // Stats
  console.log('\n6. Statistics:');
  const httpStats = manager.getStats();
  console.log(`   Total Requests: ${httpStats.totalRequests}`);
  console.log(`   Successful: ${httpStats.successfulRequests}`);
  console.log(`   Failed: ${httpStats.failedRequests}`);
  console.log(`   Cached: ${httpStats.cachedRequests}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'get') {
  const manager = new AgentHttpManager();
  const url = args[1] || 'https://api.example.com';
  manager.get(url).then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'post') {
  const manager = new AgentHttpManager();
  const url = args[1] || 'https://api.example.com';
  const data = args[2] || '{}';
  manager.post(url, JSON.parse(data)).then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const manager = new AgentHttpManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent HTTP Module');
  console.log('Usage: node agent-http.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  get <url>       GET request');
  console.log('  post <url> <data> POST request');
  console.log('  status           Show HTTP stats');
}
