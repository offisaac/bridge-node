/**
 * Agent Router Module
 *
 * Provides agent request routing with rules, load balancing, and traffic splitting.
 * Usage: node agent-router.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   route <path>          Route a request
 *   status                 Show routing status
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const ROUTER_DB = path.join(DATA_DIR, 'router-state.json');

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
 * Route Rule
 */
class RouteRule {
  constructor(id, pattern, target, options = {}) {
    this.id = id;
    this.pattern = pattern;
    this.target = target;
    this.methods = options.methods || ['*']; // HTTP methods or * for all
    this.priority = options.priority || 0;
    this.weight = options.weight || 100; // Traffic weight percentage
    this.timeout = options.timeout || 30000;
    this.headers = options.headers || {};
    this.query = options.query || {};
    this.enabled = options.enabled !== false;
    this.metadata = options.metadata || {};
  }

  matches(request) {
    // Check method
    if (!this.methods.includes('*') && !this.methods.includes(request.method)) {
      return false;
    }

    // Check path pattern
    if (!this.matchPath(request.path)) {
      return false;
    }

    // Check headers
    for (const [key, value] of Object.entries(this.headers)) {
      if (request.headers[key] !== value) {
        return false;
      }
    }

    // Check query params
    for (const [key, value] of Object.entries(this.query)) {
      if (request.query[key] !== value) {
        return false;
      }
    }

    return true;
  }

  matchPath(path) {
    if (this.pattern === '*' || this.pattern === '/*') {
      return true;
    }

    // Simple wildcard matching
    if (this.pattern.includes('*')) {
      const regex = new RegExp('^' + this.pattern.replace(/\*/g, '.*') + '$');
      return regex.test(path);
    }

    return this.pattern === path;
  }
}

/**
 * Load Balancer
 */
class LoadBalancer {
  constructor(strategy = 'round_robin') {
    this.strategy = strategy;
    this.targets = new Map();
    this.currentIndex = 0;
    this.stickySessions = new Map();
  }

  addTarget(targetId, weight = 1) {
    this.targets.set(targetId, {
      id: targetId,
      weight,
      currentWeight: 0,
      requests: 0,
      failures: 0,
      healthy: true
    });
  }

  removeTarget(targetId) {
    this.targets.delete(targetId);
  }

  select(request) {
    const healthyTargets = Array.from(this.targets.values()).filter(t => t.healthy);

    if (healthyTargets.length === 0) {
      return null;
    }

    let selected;

    if (this.strategy === 'round_robin') {
      selected = healthyTargets[this.currentIndex % healthyTargets.length];
      this.currentIndex++;
    }

    else if (this.strategy === 'least_connections') {
      selected = healthyTargets.reduce((min, t) =>
        t.requests < min.requests ? t : min
      );
    }

    else if (this.strategy === 'weighted') {
      // Weighted random selection
      const totalWeight = healthyTargets.reduce((sum, t) => sum + t.weight, 0);
      let random = Math.random() * totalWeight;
      for (const target of healthyTargets) {
        random -= target.weight;
        if (random <= 0) {
          selected = target;
          break;
        }
      }
      selected = selected || healthyTargets[0];
    }

    else if (this.strategy === 'ip_hash') {
      const ip = request.headers['x-forwarded-for'] || request.headers['client-ip'] || 'default';
      const hash = this.hashString(ip);
      selected = healthyTargets[hash % healthyTargets.length];
    }

    else {
      // Default: random
      selected = healthyTargets[Math.floor(Math.random() * healthyTargets.length)];
    }

    if (selected) {
      selected.requests++;
    }

    return selected;
  }

  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  recordSuccess(targetId) {
    const target = this.targets.get(targetId);
    if (target) {
      target.failures = 0;
      target.healthy = true;
    }
  }

  recordFailure(targetId) {
    const target = this.targets.get(targetId);
    if (target) {
      target.failures++;
      if (target.failures >= 5) {
        target.healthy = false;
      }
    }
  }

  getTargets() {
    return Array.from(this.targets.values());
  }
}

/**
 * Traffic Splitter
 */
class TrafficSplitter {
  constructor() {
    this.rules = [];
  }

  addRule(routeRule) {
    this.rules.push(routeRule);
    // Sort by priority
    this.rules.sort((a, b) => b.priority - a.priority);
  }

  select(request) {
    // Find matching rule
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      if (rule.matches(request)) {
        // Check if we should select this rule based on weight
        if (Math.random() * 100 < rule.weight) {
          return rule;
        }
      }
    }

    // Default: return first enabled rule
    return this.rules.find(r => r.enabled) || null;
  }

  getRules() {
    return this.rules;
  }
}

/**
 * Agent Router
 */
class AgentRouter {
  constructor() {
    this.routes = new Map();
    this.loadBalancer = new LoadBalancer('round_robin');
    this.trafficSplitter = new TrafficSplitter();
    this.state = loadJSON(ROUTER_DB, {});
    this.stats = {
      totalRequests: 0,
      routedRequests: 0,
      failedRequests: 0
    };
  }

  // Add route
  addRoute(pattern, target, options = {}) {
    const id = `route-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const rule = new RouteRule(id, pattern, target, options);
    this.routes.set(id, rule);
    this.trafficSplitter.addRule(rule);
    return rule;
  }

  // Remove route
  removeRoute(routeId) {
    const rule = this.routes.get(routeId);
    if (rule) {
      this.routes.delete(routeId);
      return { success: true };
    }
    return { error: 'Route not found' };
  }

  // Get route
  getRoute(routeId) {
    return this.routes.get(routeId);
  }

  // List routes
  listRoutes() {
    return Array.from(this.routes.values()).map(r => ({
      id: r.id,
      pattern: r.pattern,
      target: r.target,
      priority: r.priority,
      enabled: r.enabled
    }));
  }

  // Add target to load balancer
  addTarget(targetId, weight = 1) {
    this.loadBalancer.addTarget(targetId, weight);
  }

  // Remove target
  removeTarget(targetId) {
    this.loadBalancer.removeTarget(targetId);
  }

  // Route request
  async route(request) {
    this.stats.totalRequests++;

    // Find matching route
    const rule = this.trafficSplitter.select(request);

    if (!rule) {
      this.stats.failedRequests++;
      return { success: false, error: 'No matching route' };
    }

    // Select target using load balancer
    const target = this.loadBalancer.select(request);

    if (!target) {
      this.stats.failedRequests++;
      return { success: false, error: 'No healthy targets' };
    }

    // Simulate routing
    const result = {
      success: true,
      route: rule.id,
      target: target.id,
      path: request.path,
      method: request.method
    };

    this.stats.routedRequests++;

    // Simulate success (90% success rate)
    if (Math.random() > 0.9) {
      this.loadBalancer.recordFailure(target.id);
      result.success = false;
      this.stats.failedRequests++;
    } else {
      this.loadBalancer.recordSuccess(target.id);
    }

    return result;
  }

  // Set load balancing strategy
  setStrategy(strategy) {
    this.loadBalancer.strategy = strategy;
    return { strategy };
  }

  // Get router status
  getStatus() {
    return {
      routes: this.routes.size,
      targets: this.loadBalancer.targets.size,
      strategy: this.loadBalancer.strategy,
      stats: this.stats,
      health: {
        total: this.stats.totalRequests,
        success: this.stats.totalRequests - this.stats.failedRequests,
        failed: this.stats.failedRequests
      }
    };
  }

  // Save state
  save() {
    saveJSON(ROUTER_DB, {
      stats: this.stats,
      routes: this.listRoutes()
    });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Router Demo ===\n');

  const router = new AgentRouter();

  // Add targets
  console.log('1. Adding Targets:');
  router.addTarget('agent-001', 10);
  router.addTarget('agent-002', 5);
  router.addTarget('agent-003', 3);
  console.log('   Added: agent-001 (weight 10)');
  console.log('   Added: agent-002 (weight 5)');
  console.log('   Added: agent-003 (weight 3)');

  // Add routes
  console.log('\n2. Adding Routes:');
  router.addRoute('/api/users/*', 'agent-001', { priority: 10, methods: ['GET', 'POST'] });
  router.addRoute('/api/orders/*', 'agent-002', { priority: 5, methods: ['GET'] });
  router.addRoute('/*', 'agent-003', { priority: 0, weight: 100 });
  console.log('   Added: /api/users/* -> agent-001');
  console.log('   Added: /api/orders/* -> agent-002');
  console.log('   Added: /* -> agent-003 (default)');

  // Route requests
  console.log('\n3. Routing Requests:');

  const requests = [
    { path: '/api/users/123', method: 'GET', headers: {} },
    { path: '/api/orders/456', method: 'GET', headers: {} },
    { path: '/api/products', method: 'GET', headers: {} },
    { path: '/api/users', method: 'POST', headers: {} },
    { path: '/api/analytics', method: 'GET', headers: {} }
  ];

  for (const req of requests) {
    const result = await router.route(req);
    console.log(`   ${req.method} ${req.path} -> ${result.success ? result.target : 'FAILED'}`);
  }

  // Show route list
  console.log('\n4. Route List:');
  const routes = router.listRoutes();
  routes.forEach(r => {
    console.log(`   ${r.pattern} -> ${r.target} (priority: ${r.priority})`);
  });

  // Show load balancer status
  console.log('\n5. Load Balancer Status:');
  const targets = router.loadBalancer.getTargets();
  targets.forEach(t => {
    console.log(`   ${t.id}: requests=${t.requests}, healthy=${t.healthy}`);
  });

  // Test different strategies
  console.log('\n6. Round Robin Distribution:');
  router.setStrategy('round_robin');
  router.addTarget('lb-agent-1', 1);
  router.addTarget('lb-agent-2', 1);

  const distribution = {};
  for (let i = 0; i < 10; i++) {
    const target = router.loadBalancer.select({ headers: {} });
    distribution[target.id] = (distribution[target.id] || 0) + 1;
  }
  console.log(`   Distribution:`, distribution);

  // Test weighted strategy
  console.log('\n7. Weighted Distribution:');
  router.setStrategy('weighted');
  const weightedDist = {};
  for (let i = 0; i < 100; i++) {
    const target = router.loadBalancer.select({ headers: {} });
    weightedDist[target.id] = (weightedDist[target.id] || 0) + 1;
  }
  console.log(`   Distribution:`, weightedDist);

  // Show router status
  console.log('\n8. Router Status:');
  const status = router.getStatus();
  console.log(`   Total Requests: ${status.stats.totalRequests}`);
  console.log(`   Routed: ${status.stats.routedRequests}`);
  console.log(`   Failed: ${status.stats.failedRequests}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'route') {
  const router = new AgentRouter();
  router.route({ path: args[1], method: 'GET', headers: {} }).then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const router = new AgentRouter();
  console.log(JSON.stringify(router.getStatus(), null, 2));
} else {
  console.log('Agent Router Module');
  console.log('Usage: node agent-router.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  route <path>    Route a request');
  console.log('  status           Show routing status');
}
