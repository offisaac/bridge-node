/**
 * Agent API Gateway Module
 *
 * Provides API gateway service with routing, rate limiting, authentication,
 * and request/response transformation.
 * Usage: node agent-gateway.js [command] [options]
 *
 * Commands:
 *   start                      Start the gateway server
 *   route list                 List routes
 *   route add <path> <target>  Add a route
 *   stats                      Show gateway statistics
 *   demo                       Run demo
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const DATA_DIR = path.join(__dirname, 'data');
const ROUTES_DB = path.join(DATA_DIR, 'gateway-routes.json');
const STATS_DB = path.join(DATA_DIR, 'gateway-stats.json');
const POLICIES_DB = path.join(DATA_DIR, 'gateway-policies.json');

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

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Route Manager
 */
class RouteManager {
  constructor() {
    this.routes = loadJSON(ROUTES_DB, {
      '/api/agents': {
        path: '/api/agents',
        target: 'http://localhost:3001',
        methods: ['GET', 'POST'],
        auth: true,
        rateLimit: 100
      },
      '/api/tasks': {
        path: '/api/tasks',
        target: 'http://localhost:3002',
        methods: ['GET', 'POST', 'PUT'],
        auth: true,
        rateLimit: 50
      },
      '/api/health': {
        path: '/api/health',
        target: 'http://localhost:3003',
        methods: ['GET'],
        auth: false,
        rateLimit: 1000
      }
    });
  }

  list() {
    return Object.values(this.routes);
  }

  get(path) {
    return this.routes[path];
  }

  add(path, target, options = {}) {
    this.routes[path] = {
      path,
      target,
      methods: options.methods || ['GET'],
      auth: options.auth ?? true,
      rateLimit: options.rateLimit || 100,
      timeout: options.timeout || 30000,
      transform: options.transform || null
    };
    saveJSON(ROUTES_DB, this.routes);
    return this.routes[path];
  }

  remove(path) {
    delete this.routes[path];
    saveJSON(ROUTES_DB, this.routes);
    return true;
  }
}

/**
 * Rate Limiter
 */
class RateLimiter {
  constructor() {
    this.requests = {};
  }

  check(key, limit, windowMs) {
    const now = Date.now();
    if (!this.requests[key]) {
      this.requests[key] = [];
    }

    // Clean old requests
    this.requests[key] = this.requests[key].filter(t => now - t < windowMs);

    if (this.requests[key].length >= limit) {
      return { allowed: false, remaining: 0, resetAt: now + windowMs };
    }

    this.requests[key].push(now);
    return { allowed: true, remaining: limit - this.requests[key].length, resetAt: now + windowMs };
  }

  reset(key) {
    delete this.requests[key];
  }
}

/**
 * Authentication Manager
 */
class AuthManager {
  constructor() {
    this.tokens = loadJSON(POLICIES_DB, {
      'token-gateway': { id: 'token-gateway', role: 'gateway', expiresAt: null },
      'token-agent-001': { id: 'token-agent-001', role: 'agent', expiresAt: null }
    });
  }

  verify(token) {
    const found = Object.values(this.tokens).find(t => t.id === token);
    if (!found) {
      return { valid: false, reason: 'Invalid token' };
    }
    if (found.expiresAt && found.expiresAt < Date.now()) {
      return { valid: false, reason: 'Token expired' };
    }
    return { valid: true, role: found.role, token: found };
  }

  add(tokenId, role, expiresAt = null) {
    this.tokens[tokenId] = { id: tokenId, role, expiresAt };
    saveJSON(POLICIES_DB, this.tokens);
    return this.tokens[tokenId];
  }

  remove(tokenId) {
    delete this.tokens[tokenId];
    saveJSON(POLICIES_DB, this.tokens);
    return true;
  }
}

/**
 * Request/Response Transformer
 */
class Transformer {
  transformRequest(body, rules) {
    if (!rules) return body;
    // Example transformations
    if (rules.addTimestamp) {
      return { ...body, _timestamp: Date.now(), _original: body };
    }
    if (rules.addGatewayInfo) {
      return { ...body, _gateway: 'agent-gateway', _version: '1.0.0' };
    }
    return body;
  }

  transformResponse(body, rules) {
    if (!rules) return body;
    if (rules.wrap) {
      return { data: body, meta: { gateway: 'agent-gateway', timestamp: Date.now() } };
    }
    return body;
  }
}

/**
 * Gateway Statistics
 */
class GatewayStats {
  constructor() {
    this.stats = loadJSON(STATS_DB, {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      blockedRequests: 0,
      byRoute: {},
      byStatus: {}
    });
  }

  record(route, status, blocked = false) {
    this.stats.totalRequests++;
    if (blocked) {
      this.stats.blockedRequests++;
    } else if (status >= 200 && status < 300) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }

    if (!this.stats.byRoute[route]) {
      this.stats.byRoute[route] = { requests: 0, success: 0, failed: 0 };
    }
    this.stats.byRoute[route].requests++;
    if (status >= 200 && status < 300) {
      this.stats.byRoute[route].success++;
    } else {
      this.stats.byRoute[route].failed++;
    }

    const statusKey = status.toString();
    this.stats.byStatus[statusKey] = (this.stats.byStatus[statusKey] || 0) + 1;

    saveJSON(STATS_DB, this.stats);
  }

  get() {
    return this.stats;
  }

  reset() {
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      blockedRequests: 0,
      byRoute: {},
      byStatus: {}
    };
    saveJSON(STATS_DB, this.stats);
  }
}

/**
 * API Gateway
 */
class AgentGateway {
  constructor() {
    this.routes = new RouteManager();
    this.rateLimiter = new RateLimiter();
    this.auth = new AuthManager();
    this.transformer = new Transformer();
    this.stats = new GatewayStats();
    this.server = null;
  }

  handleRequest(req, res) {
    const parsedUrl = new url.URL(req.url, `http://${req.headers.host}`);
    const routePath = parsedUrl.pathname;
    const route = this.routes.get(routePath);

    // 404 if no route found
    if (!route) {
      this.stats.record(routePath, 404);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Route not found', path: routePath }));
      return;
    }

    // Check method
    if (!route.methods.includes(req.method)) {
      this.stats.record(routePath, 405);
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method not allowed' }));
      return;
    }

    // Check authentication
    if (route.auth) {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        this.stats.record(routePath, 401);
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Authentication required' }));
        return;
      }

      const token = authHeader.substring(7);
      const authResult = this.auth.verify(token);
      if (!authResult.valid) {
        this.stats.record(routePath, 403);
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: authResult.reason }));
        return;
      }
    }

    // Check rate limit
    const rateLimitResult = this.rateLimiter.check(
      routePath,
      route.rateLimit,
      60000 // 1 minute window
    );

    if (!rateLimitResult.allowed) {
      this.stats.record(routePath, 429, true);
      res.writeHead(429, {
        'Content-Type': 'application/json',
        'X-RateLimit-Remaining': 0,
        'X-RateLimit-Reset': rateLimitResult.resetAt
      });
      res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
      return;
    }

    // Transform request
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        if (body) {
          const parsed = JSON.parse(body);
          const transformed = this.transformer.transformRequest(parsed, route.transform);
          body = JSON.stringify(transformed);
        }
      } catch (e) {
        // Keep original body if parsing fails
      }

      // Proxy request to target
      this.proxyRequest(route, req.method, body, res, routePath);
    });
  }

  proxyRequest(route, method, body, res, routePath) {
    const targetUrl = new url.URL(route.path, route.target);
    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port,
      path: targetUrl.pathname + targetUrl.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway': 'agent-gateway'
      },
      timeout: route.timeout
    };

    const proxyReq = http.request(options, (proxyRes) => {
      let data = '';
      proxyRes.on('data', chunk => data += chunk);
      proxyRes.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          const transformed = this.transformer.transformResponse(parsed, route.transform);
          res.writeHead(proxyRes.statusCode, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(transformed));
          this.stats.record(routePath, proxyRes.statusCode);
        } catch (e) {
          res.writeHead(proxyRes.statusCode);
          res.end(data);
          this.stats.record(routePath, proxyRes.statusCode);
        }
      });
    });

    proxyReq.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad gateway', message: e.message }));
      this.stats.record(routePath, 502);
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Gateway timeout' }));
      this.stats.record(routePath, 504);
    });

    if (body) {
      proxyReq.write(body);
    }
    proxyReq.end();
  }

  start(port = 8080) {
    this.server = http.createServer((req, res) => this.handleRequest(req, res));
    this.server.listen(port, () => {
      console.log(`Agent Gateway listening on port ${port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

/**
 * Demo
 */
function demo() {
  console.log('=== Agent API Gateway Demo ===\n');

  const gateway = new AgentGateway();

  // Show routes
  console.log('1. Configured Routes:');
  gateway.routes.list().forEach(r => {
    console.log(`   - ${r.path} -> ${r.target}`);
    console.log(`     Methods: ${r.methods.join(', ')}, Auth: ${r.auth}, RateLimit: ${r.rateLimit}/min`);
  });

  // Show auth tokens
  console.log('\n2. Authentication Tokens:');
  Object.values(gateway.auth.tokens).forEach(t => {
    console.log(`   - ${t.id}: role=${t.role}`);
  });

  // Test rate limiting
  console.log('\n3. Rate Limiting Test:');
  const route = gateway.routes.get('/api/agents');
  for (let i = 0; i < 5; i++) {
    const result = gateway.rateLimiter.check('/api/agents', route.rateLimit, 60000);
    console.log(`   Request ${i + 1}: ${result.allowed ? 'ALLOWED' : 'BLOCKED'} (remaining: ${result.remaining})`);
  }

  // Test authentication
  console.log('\n4. Authentication Test:');
  const authResult1 = gateway.auth.verify('invalid-token');
  console.log(`   - Invalid token: ${authResult1.valid ? 'VALID' : 'INVALID'} (${authResult1.reason})`);

  const authResult2 = gateway.auth.verify('token-gateway');
  console.log(`   - Valid token: ${authResult2.valid ? 'VALID' : 'INVALID'} (role: ${authResult2.role})`);

  // Test transformation
  console.log('\n5. Request Transformation:');
  const testBody = { name: 'test-agent', type: 'worker' };
  const transformed = gateway.transformer.transformRequest(testBody, { addTimestamp: true, addGatewayInfo: true });
  console.log(`   Original: ${JSON.stringify(testBody)}`);
  console.log(`   Transformed: ${JSON.stringify(transformed)}`);

  // Show stats
  console.log('\n6. Gateway Statistics:');
  gateway.stats.record('/api/agents', 200);
  gateway.stats.record('/api/agents', 200);
  gateway.stats.record('/api/agents', 404);
  gateway.stats.record('/api/tasks', 201);
  gateway.stats.record('/api/tasks', 500);

  const stats = gateway.stats.get();
  console.log(`   Total Requests: ${stats.totalRequests}`);
  console.log(`   Successful: ${stats.successfulRequests}`);
  console.log(`   Failed: ${stats.failedRequests}`);
  console.log(`   By Route:`);
  for (const [route, data] of Object.entries(stats.byRoute)) {
    console.log(`     - ${route}: ${data.requests} (${data.success} success, ${data.failed} failed)`);
  }

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'start') {
  const port = parseInt(args[1], 10) || 8080;
  const gateway = new AgentGateway();
  gateway.start(port);
} else if (cmd === 'route') {
  const subCmd = args[1];
  const routeMgr = new RouteManager();

  if (subCmd === 'list') {
    console.log('Routes:');
    routeMgr.list().forEach(r => {
      console.log(`  ${r.path} -> ${r.target}`);
    });
  } else if (subCmd === 'add') {
    const path = args[2];
    const target = args[3];
    if (path && target) {
      const route = routeMgr.add(path, target);
      console.log(`Added route: ${route.path} -> ${route.target}`);
    } else {
      console.log('Usage: route add <path> <target>');
    }
  } else if (subCmd === 'remove') {
    const path = args[2];
    if (path) {
      routeMgr.remove(path);
      console.log(`Removed route: ${path}`);
    }
  }
} else if (cmd === 'stats') {
  const gateway = new AgentGateway();
  const stats = gateway.stats.get();
  console.log('Gateway Statistics:');
  console.log(`  Total: ${stats.totalRequests}`);
  console.log(`  Success: ${stats.successfulRequests}`);
  console.log(`  Failed: ${stats.failedRequests}`);
  console.log(`  Blocked: ${stats.blockedRequests}`);
} else if (cmd === 'demo') {
  demo();
} else {
  console.log('Agent API Gateway');
  console.log('Usage: node agent-gateway.js [command]');
  console.log('Commands:');
  console.log('  start [port]           Start gateway server');
  console.log('  route list             List routes');
  console.log('  route add <path> <target>  Add route');
  console.log('  route remove <path>    Remove route');
  console.log('  stats                  Show statistics');
  console.log('  demo                   Run demo');
}
