/**
 * Agent Router 2 Module
 *
 * Provides intelligent routing with load balancing, affinity, and traffic management.
 * Usage: node agent-router-2.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   route <request>       Route a request
 *   status                 Show router stats
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname + '/data';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Routing Strategies
 */
const RoutingStrategy = {
  ROUND_ROBIN: 'round-robin',
  LEAST_CONNECTIONS: 'least-connections',
  LEAST_RESPONSE_TIME: 'least-response-time',
  WEIGHTED: 'weighted',
  RANDOM: 'random',
  IP_HASH: 'ip-hash',
  PATH_BASED: 'path-based',
  HEADER_BASED: 'header-based'
};

/**
 * Backend Status
 */
const BackendStatus = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  DRAINING: 'draining',
  UNKNOWN: 'unknown'
};

/**
 * Backend
 */
class Backend {
  constructor(config) {
    this.id = config.id;
    this.url = config.url;
    this.weight = config.weight || 1;
    this.maxConnections = config.maxConnections || 100;
    this.timeout = config.timeout || 30000;
    this.status = BackendStatus.HEALTHY;
    this.connections = 0;
    this.healthCheckUrl = config.healthCheckUrl;
    this.lastHealthCheck = null;
    this.healthCheckInterval = config.healthCheckInterval || 30000;
    this.stats = {
      requests: 0,
      successes: 0,
      failures: 0,
      totalResponseTime: 0,
      avgResponseTime: 0
    };
  }

  isHealthy() {
    return this.status === BackendStatus.HEALTHY;
  }

  isAvailable() {
    return this.isHealthy() && this.connections < this.maxConnections;
  }

  addConnection() {
    this.connections++;
    this.stats.requests++;
  }

  removeConnection() {
    this.connections = Math.max(0, this.connections - 1);
  }

  recordSuccess(responseTime) {
    this.stats.successes++;
    this.stats.totalResponseTime += responseTime;
    this.stats.avgResponseTime = this.stats.totalResponseTime / this.stats.successes;
  }

  recordFailure() {
    this.stats.failures++;
  }

  updateHealth(isHealthy) {
    this.lastHealthCheck = Date.now();
    this.status = isHealthy ? BackendStatus.HEALTHY : BackendStatus.UNHEALTHY;
  }

  getStats() {
    return {
      id: this.id,
      url: this.url,
      status: this.status,
      connections: this.connections,
      weight: this.weight,
      ...this.stats
    };
  }
}

/**
 * Routing Strategy Implementations
 */
class RoutingStrategies {
  static roundRobin(backends) {
    const available = backends.filter(b => b.isAvailable());
    if (available.length === 0) return null;
    const index = Math.floor(Math.random() * available.length);
    return available[index];
  }

  static leastConnections(backends) {
    const available = backends.filter(b => b.isAvailable());
    if (available.length === 0) return null;
    return available.reduce((min, b) => b.connections < min.connections ? b : min);
  }

  static leastResponseTime(backends) {
    const available = backends.filter(b => b.isAvailable());
    if (available.length === 0) return null;
    return available.reduce((min, b) =>
      b.stats.avgResponseTime < min.stats.avgResponseTime ? b : min
    );
  }

  static weighted(backends) {
    const available = backends.filter(b => b.isAvailable());
    if (available.length === 0) return null;

    const totalWeight = available.reduce((sum, b) => sum + b.weight, 0);
    let random = Math.random() * totalWeight;

    for (const backend of available) {
      random -= backend.weight;
      if (random <= 0) return backend;
    }

    return available[available.length - 1];
  }

  static random(backends) {
    const available = backends.filter(b => b.isAvailable());
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
  }

  static ipHash(backends, clientIp) {
    const available = backends.filter(b => b.isAvailable());
    if (available.length === 0) return null;

    let hash = 0;
    for (let i = 0; i < clientIp.length; i++) {
      hash = ((hash << 5) - hash) + clientIp.charCodeAt(i);
      hash |= 0;
    }

    return available[Math.abs(hash) % available.length];
  }

  static pathBased(backends, path, pathMap) {
    const service = pathMap[path] || pathMap['default'];
    const available = backends.filter(b => b.isAvailable() && b.tags?.includes(service));
    if (available.length === 0) return null;
    return this.roundRobin(available);
  }

  static headerBased(backends, headerValue, groups) {
    if (!headerValue || !groups) return this.roundRobin(backends);
    const group = groups[headerValue];
    if (!group) return this.roundRobin(backends);

    const available = backends.filter(b => b.isAvailable() && b.group === group);
    if (available.length === 0) return this.roundRobin(backends);
    return this.roundRobin(available);
  }
}

/**
 * Health Checker
 */
class HealthChecker {
  constructor(interval = 30000) {
    this.interval = interval;
    this.checkers = new Map();
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.checkAll(), this.interval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  addBackend(backend) {
    this.checkers.set(backend.id, backend);
  }

  removeBackend(backendId) {
    this.checkers.delete(backendId);
  }

  async checkAll() {
    for (const backend of this.checkers.values()) {
      await this.check(backend);
    }
  }

  async check(backend) {
    if (!backend.healthCheckUrl) {
      backend.updateHealth(true);
      return;
    }

    try {
      const start = Date.now();
      // Simulate health check
      const isHealthy = Math.random() > 0.1; // 90% success rate
      backend.updateHealth(isHealthy);
    } catch (error) {
      backend.updateHealth(false);
    }
  }
}

/**
 * Circuit Breaker
 */
class CircuitBreaker {
  constructor(config = {}) {
    this.failureThreshold = config.failureThreshold || 5;
    this.successThreshold = config.successThreshold || 2;
    this.timeout = config.timeout || 60000;
    this.state = 'closed'; // closed, open, half-open
    this.failures = 0;
    this.successes = 0;
    this.lastFailure = null;
  }

  canAttempt() {
    if (this.state === 'closed') return true;
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.timeout) {
        this.state = 'half-open';
        return true;
      }
      return false;
    }
    return true; // half-open
  }

  recordSuccess() {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.successThreshold) {
        this.state = 'closed';
        this.successes = 0;
      }
    }
  }

  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  getState() {
    return this.state;
  }
}

/**
 * Route Rule
 */
class RouteRule {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.matchers = config.matchers || [];
    this.targets = config.targets || [];
    this.strategy = config.strategy || RoutingStrategy.ROUND_ROBIN;
    this.enabled = config.enabled !== false;
    this.priority = config.priority || 0;
  }

  matches(request) {
    for (const matcher of this.matchers) {
      if (!this._match(request, matcher)) {
        return false;
      }
    }
    return this.matchers.length > 0;
  }

  _match(request, matcher) {
    switch (matcher.type) {
      case 'path':
        return this._matchPath(request.path, matcher.pattern);
      case 'header':
        return request.headers?.[matcher.name] === matcher.value;
      case 'query':
        return request.query?.[matcher.name] === matcher.value;
      case 'method':
        return request.method === matcher.value;
      case 'ip':
        return this._matchIp(request.clientIp, matcher.pattern);
      default:
        return true;
    }
  }

  _matchPath(path, pattern) {
    if (pattern.startsWith('^')) {
      return new RegExp(pattern).test(path);
    }
    return path.startsWith(pattern);
  }

  _matchIp(ip, pattern) {
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
      return regex.test(ip);
    }
    return ip === pattern;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      strategy: this.strategy,
      enabled: this.enabled,
      priority: this.priority
    };
  }
}

/**
 * Agent Router 2
 */
class AgentRouter {
  constructor(config = {}) {
    this.name = config.name || 'default';
    this.backends = new Map();
    this.rules = [];
    this.defaultStrategy = config.defaultStrategy || RoutingStrategy.ROUND_ROBIN;
    this.healthChecker = new HealthChecker(config.healthCheckInterval);
    this.circuitBreakers = new Map();
    this.stats = {
      requests: 0,
      routed: 0,
      rejected: 0,
      errors: 0
    };

    this.healthChecker.start();
  }

  addBackend(backend) {
    this.backends.set(backend.id, backend);
    this.healthChecker.addBackend(backend);
    this.circuitBreakers.set(backend.id, new CircuitBreaker());
  }

  removeBackend(backendId) {
    this.backends.delete(backendId);
    this.healthChecker.removeBackend(backendId);
    this.circuitBreakers.delete(backendId);
  }

  getBackend(backendId) {
    return this.backends.get(backendId);
  }

  listBackends() {
    return Array.from(this.backends.values()).map(b => b.getStats());
  }

  addRule(rule) {
    this.rules.push(rule);
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  removeRule(ruleId) {
    const index = this.rules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.rules.splice(index, 1);
    }
  }

  getRules() {
    return this.rules.map(r => r.toJSON());
  }

  async route(request) {
    this.stats.requests++;

    // Find matching rule
    let matchedRule = null;
    for (const rule of this.rules) {
      if (rule.enabled && rule.matches(request)) {
        matchedRule = rule;
        break;
      }
    }

    // Determine target backends
    let targets = [];
    if (matchedRule && matchedRule.targets.length > 0) {
      targets = matchedRule.targets
        .map(id => this.backends.get(id))
        .filter(Boolean);
    } else {
      targets = Array.from(this.backends.values());
    }

    if (targets.length === 0) {
      this.stats.rejected++;
      return { error: 'No available backends' };
    }

    // Select backend using strategy
    const strategy = matchedRule?.strategy || this.defaultStrategy;
    const backend = this._selectBackend(strategy, targets, request);

    if (!backend) {
      this.stats.rejected++;
      return { error: 'No healthy backend available' };
    }

    // Check circuit breaker
    const circuitBreaker = this.circuitBreakers.get(backend.id);
    if (circuitBreaker && !circuitBreaker.canAttempt()) {
      this.stats.rejected++;
      return { error: 'Circuit breaker open', backend: backend.id };
    }

    // Route request
    backend.addConnection();
    this.stats.routed++;

    try {
      // Simulate request
      const startTime = Date.now();
      await new Promise(resolve => setTimeout(resolve, 10));
      const responseTime = Date.now() - startTime;

      backend.recordSuccess(responseTime);
      if (circuitBreaker) circuitBreaker.recordSuccess();

      return {
        backend: backend.id,
        url: backend.url,
        responseTime
      };
    } catch (error) {
      backend.recordFailure();
      if (circuitBreaker) circuitBreaker.recordFailure();
      this.stats.errors++;

      return {
        error: error.message,
        backend: backend.id
      };
    } finally {
      backend.removeConnection();
    }
  }

  _selectBackend(strategy, backends, request) {
    const options = {
      backends,
      path: request?.path,
      pathMap: this.pathMap,
      clientIp: request?.clientIp,
      headerValue: request?.headers?.['x-group']
    };

    switch (strategy) {
      case RoutingStrategy.ROUND_ROBIN:
        return RoutingStrategies.roundRobin(backends);
      case RoutingStrategy.LEAST_CONNECTIONS:
        return RoutingStrategies.leastConnections(backends);
      case RoutingStrategy.LEAST_RESPONSE_TIME:
        return RoutingStrategies.leastResponseTime(backends);
      case RoutingStrategy.WEIGHTED:
        return RoutingStrategies.weighted(backends);
      case RoutingStrategy.RANDOM:
        return RoutingStrategies.random(backends);
      case RoutingStrategy.IP_HASH:
        return RoutingStrategies.ipHash(backends, request?.clientIp);
      case RoutingStrategy.PATH_BASED:
        return RoutingStrategies.pathBased(backends, request?.path, this.pathMap);
      default:
        return RoutingStrategies.roundRobin(backends);
    }
  }

  setPathMap(map) {
    this.pathMap = map;
  }

  getStats() {
    const backendStats = Array.from(this.backends.values()).map(b => b.getStats());
    return {
      ...this.stats,
      backends: backendStats.length,
      healthyBackends: backendStats.filter(b => b.status === 'healthy').length,
      rules: this.rules.length
    };
  }

  stop() {
    this.healthChecker.stop();
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Router 2 Demo\n');

  const router = new AgentRouter({
    name: 'api-gateway',
    defaultStrategy: RoutingStrategy.LEAST_CONNECTIONS
  });

  // Add backends
  console.log('1. Backend Management:');

  const backend1 = new Backend({
    id: 'backend-1',
    url: 'http://server1.example.com',
    weight: 2,
    maxConnections: 100
  });

  const backend2 = new Backend({
    id: 'backend-2',
    url: 'http://server2.example.com',
    weight: 1,
    maxConnections: 50
  });

  const backend3 = new Backend({
    id: 'backend-3',
    url: 'http://server3.example.com',
    weight: 1,
    maxConnections: 50
  });

  router.addBackend(backend1);
  router.addBackend(backend2);
  router.addBackend(backend3);

  console.log(`   Added ${router.backends.size} backends`);

  // Routing strategies
  console.log('\n2. Routing Strategies:');

  const strategies = [
    RoutingStrategy.ROUND_ROBIN,
    RoutingStrategy.LEAST_CONNECTIONS,
    RoutingStrategy.LEAST_RESPONSE_TIME,
    RoutingStrategy.WEIGHTED,
    RoutingStrategy.RANDOM
  ];

  for (const strategy of strategies) {
    const requests = [];
    for (let i = 0; i < 5; i++) {
      const result = await router.route({ path: '/api/test', strategy });
      requests.push(result.backend);
    }
    console.log(`   ${strategy}: ${requests.join(', ')}`);
  }

  // Route rules
  console.log('\n3. Route Rules:');

  const apiRule = new RouteRule({
    id: 'api-rule',
    name: 'API Requests',
    matchers: [
      { type: 'path', pattern: '/api/' }
    ],
    targets: ['backend-1', 'backend-2'],
    strategy: RoutingStrategy.LEAST_CONNECTIONS,
    priority: 10
  });

  const adminRule = new RouteRule({
    id: 'admin-rule',
    name: 'Admin Requests',
    matchers: [
      { type: 'path', pattern: '/admin/' },
      { type: 'header', name: 'x-admin', value: 'true' }
    ],
    targets: ['backend-3'],
    priority: 20
  });

  router.addRule(apiRule);
  router.addRule(adminRule);

  console.log(`   Added ${router.rules.length} rules`);

  // Match rules
  console.log('\n4. Rule Matching:');

  const testRequests = [
    { path: '/api/users', headers: {} },
    { path: '/admin/dashboard', headers: { 'x-admin': 'true' } },
    { path: '/static/main.js', headers: {} }
  ];

  for (const req of testRequests) {
    for (const rule of router.rules) {
      if (rule.matches(req)) {
        console.log(`   ${req.path} -> ${rule.name}`);
        break;
      }
    }
  }

  // Route with rules
  console.log('\n5. Routing with Rules:');

  for (let i = 0; i < 3; i++) {
    const result = await router.route({ path: '/api/users' });
    console.log(`   Request ${i + 1} -> ${result.backend}`);
  }

  // IP Hash routing
  console.log('\n6. IP Hash Routing:');

  const ips = ['192.168.1.1', '192.168.1.2', '192.168.1.3', '192.168.1.1', '192.168.1.2'];
  for (const ip of ips) {
    const result = await router.route({
      path: '/api/test',
      clientIp: ip,
      strategy: RoutingStrategy.IP_HASH
    });
    console.log(`   ${ip} -> ${result.backend}`);
  }

  // Circuit breaker
  console.log('\n7. Circuit Breaker:');

  const cb = router.circuitBreakers.get('backend-1');
  for (let i = 0; i < 7; i++) {
    cb.recordFailure();
    console.log(`   Failure ${i + 1}: State = ${cb.getState()}`);
  }

  cb.recordSuccess();
  cb.recordSuccess();
  console.log(`   After recovery: State = ${cb.getState()}`);

  // Stats
  console.log('\n8. Statistics:');
  const stats = router.getStats();
  console.log(`   Total requests: ${stats.requests}`);
  console.log(`   Routed: ${stats.routed}`);
  console.log(`   Rejected: ${stats.rejected}`);
  console.log(`   Errors: ${stats.errors}`);
  console.log(`   Backends: ${stats.backends}`);
  console.log(`   Healthy: ${stats.healthyBackends}`);

  // Backend stats
  console.log('\n9. Backend Stats:');
  for (const backend of router.listBackends()) {
    console.log(`   ${backend.id}: ${backend.status} (${backend.connections} conn, ${backend.requests} req)`);
  }

  router.stop();
  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'route') {
  const router = new AgentRouter();
  const request = JSON.parse(args[1] || '{}');
  router.route(request).then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const router = new AgentRouter();
  console.log(JSON.stringify(router.getStats(), null, 2));
} else {
  console.log('Agent Router 2 Module');
  console.log('Usage: node agent-router-2.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  route <request>    Route request');
  console.log('  status             Show stats');
}
