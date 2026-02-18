/**
 * Traffic Splitter - 流量分割器模块
 * HTTP流量分割用于测试
 */

const http = require('http');
const https = require('https');
const url = require('url');

// ========== Data Models ==========

class Route {
  constructor(data) {
    this.name = data.name;
    this.target = data.target; // URL to forward to
    this.weight = data.weight || 50; // 0-100
    this.condition = data.condition || null; // { type: 'header'|'cookie'|'query', key, value, operator }
    this.active = data.active !== false;
  }

  toJSON() {
    return {
      name: this.name,
      target: this.target,
      weight: this.weight,
      condition: this.condition,
      active: this.active
    };
  }
}

class TrafficRule {
  constructor(data) {
    this.id = data.id || `rule_${Date.now()}`;
    this.name = data.name;
    this.routes = (data.routes || []).map(r => new Route(r));
    this.sticky = data.sticky !== false; // sticky sessions
    this.description = data.description || '';
    this.active = data.active !== false;
    this.stats = {
      totalRequests: 0,
      routeStats: {}
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      routes: this.routes.map(r => r.toJSON()),
      sticky: this.sticky,
      description: this.description,
      active: this.active,
      stats: this.stats
    };
  }

  getTotalWeight() {
    return this.routes.filter(r => r.active).reduce((sum, r) => sum + r.weight, 0);
  }

  selectRoute(identifier) {
    const activeRoutes = this.routes.filter(r => r.active);
    if (activeRoutes.length === 0) return null;

    // Check conditions first
    for (const route of activeRoutes) {
      if (route.condition && this._matchCondition(route.condition, identifier)) {
        return route;
      }
    }

    // Weight-based selection
    const totalWeight = this.getTotalWeight();
    let random = Math.random() * totalWeight;

    for (const route of activeRoutes) {
      random -= route.weight;
      if (random <= 0) {
        return route;
      }
    }

    return activeRoutes[activeRoutes.length - 1];
  }

  _matchCondition(condition, identifier) {
    const { type, key, value, operator } = condition;
    let targetValue;

    switch (type) {
      case 'header':
        targetValue = identifier.headers[key];
        break;
      case 'cookie':
        targetValue = (identifier.cookies || {})[key];
        break;
      case 'query':
        targetValue = identifier.query[key];
        break;
      case 'ip':
        targetValue = identifier.ip;
        break;
      default:
        return false;
    }

    switch (operator) {
      case 'equals':
        return targetValue === value;
      case 'contains':
        return targetValue && targetValue.includes(value);
      case 'startsWith':
        return targetValue && targetValue.startsWith(value);
      case 'regex':
        return targetValue && new RegExp(value).test(targetValue);
      default:
        return targetValue === value;
    }
  }
}

// ========== Main Traffic Splitter Class ==========

class TrafficSplitter {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './traffic-splitter-data';
    this.rules = new Map();
    this.port = options.port || 8080;

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
  }

  _loadData() {
    const rulesFile = path.join(this.storageDir, 'rules.json');
    if (fs.existsSync(rulesFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(rulesFile, 'utf8'));
        for (const r of data) {
          this.rules.set(r.id, new TrafficRule(r));
        }
      } catch (e) {
        console.error('Failed to load rules:', e);
      }
    }
  }

  _saveData() {
    const data = Array.from(this.rules.values()).map(r => r.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'rules.json'),
      JSON.stringify(data, null, 2)
    );
  }

  // ========== Rule Management ==========

  createRule(data) {
    const rule = new TrafficRule({
      ...data,
      id: `rule_${Date.now()}`
    });
    this.rules.set(rule.id, rule);
    this._saveData();
    return rule;
  }

  getRule(id) {
    return this.rules.get(id) || null;
  }

  listRules() {
    return Array.from(this.rules.values());
  }

  updateRule(id, updates) {
    const rule = this.rules.get(id);
    if (!rule) {
      throw new Error(`Rule not found: ${id}`);
    }

    Object.assign(rule, updates);
    this._saveData();
    return rule;
  }

  deleteRule(id) {
    this.rules.delete(id);
    this._saveData();
  }

  // ========== Route Management ==========

  addRoute(ruleId, routeData) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    const route = new Route(routeData);
    rule.routes.push(route);
    rule.stats.routeStats[route.name] = { requests: 0, errors: 0 };
    this._saveData();
    return route;
  }

  removeRoute(ruleId, routeName) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    rule.routes = rule.routes.filter(r => r.name !== routeName);
    delete rule.stats.routeStats[routeName];
    this._saveData();
  }

  // ========== Traffic Handling ==========

  handleRequest(req, res, ruleId) {
    const rule = this.rules.get(ruleId);
    if (!rule || !rule.active) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('No active rule found');
      return;
    }

    // Build identifier
    const identifier = {
      ip: req.ip || req.connection.remoteAddress,
      headers: req.headers,
      cookies: this._parseCookies(req.headers.cookie),
      query: req.query || {}
    };

    // Select route
    const route = rule.selectRoute(identifier);
    if (!route) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('No route available');
      return;
    }

    // Update stats
    rule.stats.totalRequests++;
    if (!rule.stats.routeStats[route.name]) {
      rule.stats.routeStats[route.name] = { requests: 0, errors: 0 };
    }
    rule.stats.routeStats[route.name].requests++;
    this._saveData();

    // Forward request
    this._proxyRequest(req, res, route.target);
  }

  async _proxyRequest(req, res, targetUrl) {
    const target = new URL(targetUrl);
    const isHttps = target.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: target.pathname + target.search,
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host
      }
    };

    const proxyReq = client.request(options, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res, { end: true });
    });

    proxyReq.on('error', (error) => {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end(`Proxy error: ${error.message}`);
    });

    req.pipe(proxyReq, { end: true });
  }

  _parseCookies(cookieHeader) {
    if (!cookieHeader) return {};
    const cookies = {};
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      if (name) cookies[name] = value;
    });
    return cookies;
  }

  // ========== Statistics ==========

  getStats(ruleId) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    return {
      rule: rule.name,
      totalRequests: rule.stats.totalRequests,
      routes: Object.entries(rule.stats.routeStats).map(([name, stats]) => ({
        name,
        requests: stats.requests,
        errors: stats.errors,
        percent: rule.stats.totalRequests > 0
          ? (stats.requests / rule.stats.totalRequests * 100).toFixed(1) + '%'
          : '0%'
      }))
    };
  }

  getAllStats() {
    const results = [];
    for (const rule of this.rules.values()) {
      results.push(this.getStats(rule.id));
    }
    return results;
  }

  // ========== Server Mode ==========

  startServer(port = null) {
    const serverPort = port || this.port;

    const server = http.createServer((req, res) => {
      // Match request to rule
      const path = url.parse(req.url).pathname;

      for (const rule of this.rules.values()) {
        if (rule.active) {
          this.handleRequest(req, res, rule.id);
          return;
        }
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('No active traffic rule');
    });

    server.listen(serverPort, () => {
      console.log(`Traffic splitter server running on port ${serverPort}`);
    });

    return server;
  }
}

// ========== CLI ==========

const fs = require('fs');
const path = require('path');

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const splitter = new TrafficSplitter();

  switch (command) {
    case 'list':
      console.log('Traffic Rules:');
      console.log('==============');
      for (const rule of splitter.listRules()) {
        console.log(`\n[${rule.active ? 'active' : 'inactive'}] ${rule.name}`);
        console.log(`  Routes: ${rule.routes.map(r => `${r.name}(${r.weight}%)`).join(', ')}`);
        console.log(`  Requests: ${rule.stats.totalRequests}`);
      }
      break;

    case 'create':
      const rule = splitter.createRule({
        name: args[1] || 'New Rule',
        routes: [
          { name: 'control', target: 'http://localhost:3000', weight: 50 },
          { name: 'variant', target: 'http://localhost:3001', weight: 50 }
        ]
      });
      console.log(`Created rule: ${rule.id}`);
      break;

    case 'add-route':
      splitter.addRoute(args[1], {
        name: args[2] || 'new-route',
        target: args[3] || 'http://localhost:3000',
        weight: parseInt(args[4]) || 50
      });
      console.log('Added route');
      break;

    case 'stats':
      console.log('Statistics:');
      console.log(JSON.stringify(splitter.getAllStats(), null, 2));
      break;

    case 'rule-stats':
      console.log('Rule Stats:');
      console.log(JSON.stringify(splitter.getStats(args[1]), null, 2));
      break;

    case 'activate':
      splitter.updateRule(args[1], { active: true });
      console.log(`Activated rule: ${args[1]}`);
      break;

    case 'deactivate':
      splitter.updateRule(args[1], { active: false });
      console.log(`Deactivated rule: ${args[1]}`);
      break;

    case 'start':
      splitter.startServer(parseInt(args[1]) || 8080);
      break;

    case 'demo':
      // Create demo rules
      const demoRule = splitter.createRule({
        name: 'A/B Test - Homepage',
        description: 'Testing new homepage design',
        routes: [
          { name: 'control', target: 'http://localhost:3000', weight: 50 },
          { name: 'variant', target: 'http://localhost:3001', weight: 50 }
        ]
      });

      // Add conditional route
      splitter.addRoute(demoRule.id, {
        name: 'premium',
        target: 'http://localhost:3002',
        weight: 0,
        condition: { type: 'cookie', key: 'tier', value: 'premium', operator: 'equals' }
      });

      console.log('Created demo traffic rule');
      console.log('\n--- Rule ---');
      console.log(JSON.stringify(demoRule.toJSON(), null, 2));

      // Simulate some requests
      console.log('\n--- Simulating Requests ---');
      for (let i = 0; i < 10; i++) {
        const route = demoRule.selectRoute({ ip: `192.168.1.${i}` });
        console.log(`Request ${i + 1} -> ${route.name} (${route.target})`);
      }

      console.log('\n--- Stats ---');
      console.log(JSON.stringify(splitter.getStats(demoRule.id), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node traffic-splitter.js list');
      console.log('  node traffic-splitter.js create <name>');
      console.log('  node traffic-splitter.js add-route <rule-id> <name> <target> <weight>');
      console.log('  node traffic-splitter.js stats');
      console.log('  node traffic-splitter.js rule-stats <rule-id>');
      console.log('  node traffic-splitter.js activate <rule-id>');
      console.log('  node traffic-splitter.js deactivate <rule-id>');
      console.log('  node traffic-splitter.js start [port]');
      console.log('  node traffic-splitter.js demo');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  Route,
  TrafficRule,
  TrafficSplitter
};
