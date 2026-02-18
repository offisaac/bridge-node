/**
 * Agent Ingress - Ingress Controller Module
 *
 * Manages external traffic routing into the cluster with host/path-based routing,
 * TLS termination, and load balancing.
 *
 * Usage: node agent-ingress.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   rules      - List ingress rules
 *   backends   - List backend services
 */

class IngressRule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.host = config.host; // Domain-based routing
    this.path = config.path || '/'; // Path-based routing
    this.pathType = config.pathType || 'Prefix'; // Prefix, Exact, Regex
    this.backend = config.backend; // Target service
    this.tls = config.tls || null; // TLS configuration
    this.annotations = config.annotations || {};
    this.priority = config.priority || 100;
    this.enabled = config.enabled !== false;
  }
}

class Backend {
  constructor(config) {
    this.name = config.name;
    this.port = config.port || 80;
    this.protocol = config.protocol || 'http';
    this.healthCheck = config.healthCheck || null;
    this.maxConnections = config.maxConnections || 1000;
    this.timeout = config.timeout || 30000;
    this.retries = config.retries || 3;
    this.weight = config.weight || 100;
  }
}

class IngressController {
  constructor() {
    this.rules = new Map();
    this.backends = new Map();
    this.certificates = new Map();
    this.traffic = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample backends
    const backends = [
      { name: 'web-frontend', port: 80, protocol: 'http', weight: 100 },
      { name: 'api-gateway', port: 8080, protocol: 'http', weight: 100 },
      { name: 'admin-panel', port: 443, protocol: 'https', weight: 50 },
      { name: 'static-assets', port: 80, protocol: 'http', weight: 200 },
      { name: 'websocket-service', port: 8081, protocol: 'ws', weight: 50 }
    ];

    backends.forEach(b => {
      const backend = new Backend(b);
      this.backends.set(backend.name, backend);
    });

    // Sample ingress rules
    const rules = [
      {
        host: 'example.com',
        path: '/',
        pathType: 'Prefix',
        backend: 'web-frontend',
        priority: 10,
        tls: { secret: 'example-tls', enabled: true }
      },
      {
        host: 'api.example.com',
        path: '/',
        pathType: 'Prefix',
        backend: 'api-gateway',
        priority: 20,
        tls: { secret: 'api-tls', enabled: true }
      },
      {
        host: 'admin.example.com',
        path: '/',
        pathType: 'Prefix',
        backend: 'admin-panel',
        priority: 30,
        tls: { secret: 'admin-tls', enabled: true }
      },
      {
        host: 'example.com',
        path: '/static',
        pathType: 'Prefix',
        backend: 'static-assets',
        priority: 15,
        tls: null
      },
      {
        host: 'ws.example.com',
        path: '/',
        pathType: 'Prefix',
        backend: 'websocket-service',
        priority: 25,
        tls: { secret: 'ws-tls', enabled: true }
      }
    ];

    rules.forEach(r => {
      const rule = new IngressRule(r);
      this.rules.set(rule.id, rule);
    });

    // Sample certificates
    this.certificates.set('example-tls', { issuer: 'letsencrypt', expiry: '2026-03-01', domains: ['example.com'] });
    this.certificates.set('api-tls', { issuer: 'letsencrypt', expiry: '2026-03-15', domains: ['api.example.com'] });
    this.certificates.set('admin-tls', { issuer: 'custom', expiry: '2026-06-01', domains: ['admin.example.com'] });

    // Sample traffic data
    this.traffic.set('web-frontend', { requests: 50000, bandwidth: '1.2GB', latency: 45 });
    this.traffic.set('api-gateway', { requests: 30000, bandwidth: '800MB', latency: 60 });
    this.traffic.set('admin-panel', { requests: 5000, bandwidth: '200MB', latency: 30 });
  }

  // Create ingress rule
  createRule(host, path, backendName, options = {}) {
    if (!this.backends.has(backendName)) {
      throw new Error(`Backend ${backendName} not found`);
    }

    const rule = new IngressRule({
      host,
      path,
      backend: backendName,
      ...options
    });

    this.rules.set(rule.id, rule);
    return rule;
  }

  // Get rule by host/path
  matchRequest(host, path) {
    // Sort rules by priority
    const sortedRules = Array.from(this.rules.values())
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      // Check host match
      if (rule.host && rule.host !== host && rule.host !== '*') {
        continue;
      }

      // Check path match
      let pathMatch = false;
      switch (rule.pathType) {
        case 'Prefix':
          pathMatch = path.startsWith(rule.path);
          break;
        case 'Exact':
          pathMatch = path === rule.path;
          break;
        case 'Regex':
          pathMatch = new RegExp(rule.path).test(path);
          break;
      }

      if (pathMatch) {
        return {
          rule,
          backend: this.backends.get(rule.backend)
        };
      }
    }

    return null;
  }

  // List all rules
  listRules() {
    return Array.from(this.rules.values()).sort((a, b) => a.priority - b.priority);
  }

  // List backends
  listBackends() {
    return Array.from(this.backends.values());
  }

  // Get backend
  getBackend(name) {
    return this.backends.get(name) || null;
  }

  // Add backend
  addBackend(name, config) {
    const backend = new Backend({ name, ...config });
    this.backends.set(name, backend);
    return backend;
  }

  // Update rule
  updateRule(ruleId, updates) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    Object.assign(rule, updates);
    return rule;
  }

  // Delete rule
  deleteRule(ruleId) {
    return this.rules.delete(ruleId);
  }

  // Enable/disable rule
  toggleRule(ruleId, enabled) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }
    rule.enabled = enabled;
    return rule;
  }

  // Get certificates
  listCertificates() {
    return Array.from(this.certificates.entries()).map(([name, cert]) => ({
      name,
      ...cert
    }));
  }

  // Get traffic stats
  getTrafficStats(backendName = null) {
    if (backendName) {
      return this.traffic.get(backendName) || null;
    }
    return Array.from(this.traffic.entries()).map(([name, stats]) => ({
      backend: name,
      ...stats
    }));
  }

  // Record request
  recordRequest(backendName, latency = 0) {
    const stats = this.traffic.get(backendName) || { requests: 0, bandwidth: '0B', latency: 0 };
    stats.requests += 1;
    stats.latency = Math.round((stats.latency + latency) / 2);
    this.traffic.set(backendName, stats);
  }

  // Get statistics
  getStats() {
    const rules = Array.from(this.rules.values());
    const enabledRules = rules.filter(r => r.enabled);

    return {
      totalRules: rules.length,
      enabledRules: enabledRules.length,
      disabledRules: rules.length - enabledRules.length,
      totalBackends: this.backends.size,
      totalCertificates: this.certificates.size,
      trafficRecorded: this.traffic.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const ingress = new IngressController();

switch (command) {
  case 'demo':
    console.log('=== Agent Ingress Demo\n');

    // 1. List rules
    console.log('1. List Ingress Rules:');
    const rules = ingress.listRules();
    console.log(`   Total: ${rules.length}`);
    rules.forEach(r => {
      console.log(`   - ${r.host}${r.path} -> ${r.backend} [${r.enabled ? 'enabled' : 'disabled'}]`);
    });

    // 2. List backends
    console.log('\n2. List Backends:');
    const backends = ingress.listBackends();
    console.log(`   Total: ${backends.length}`);
    backends.forEach(b => {
      console.log(`   - ${b.name} [${b.protocol}://:${b.port}] weight=${b.weight}`);
    });

    // 3. Match request
    console.log('\n3. Match Requests:');
    const tests = [
      { host: 'example.com', path: '/home' },
      { host: 'api.example.com', path: '/users' },
      { host: 'admin.example.com', path: '/dashboard' },
      { host: 'example.com', path: '/static/images/logo.png' }
    ];

    tests.forEach(test => {
      const match = ingress.matchRequest(test.host, test.path);
      if (match) {
        console.log(`   ${test.host}${test.path} -> ${match.backend.name}`);
      } else {
        console.log(`   ${test.host}${test.path} -> NO MATCH`);
      }
    });

    // 4. List certificates
    console.log('\n4. TLS Certificates:');
    const certs = ingress.listCertificates();
    certs.forEach(c => {
      console.log(`   - ${c.name}: ${c.domains.join(', ')} (expires: ${c.expiry})`);
    });

    // 5. Create new rule
    console.log('\n5. Create New Rule:');
    const newRule = ingress.createRule('shop.example.com', '/', 'api-gateway', {
      priority: 35,
      tls: { secret: 'shop-tls', enabled: true }
    });
    console.log(`   Created: ${newRule.host}${newRule.path} -> ${newRule.backend}`);

    // 6. Update rule
    console.log('\n6. Update Rule:');
    const rulesAfter = ingress.listRules();
    if (rulesAfter.length > 0) {
      const ruleToUpdate = rulesAfter[0];
      ingress.updateRule(ruleToUpdate.id, { path: '/new-path' });
      console.log(`   Updated: ${ruleToUpdate.host} path -> /new-path`);
    }

    // 7. Toggle rule
    console.log('\n7. Toggle Rule:');
    const allRules = ingress.listRules();
    if (allRules.length > 1) {
      const ruleToToggle = allRules[1];
      const wasEnabled = ruleToToggle.enabled;
      ingress.toggleRule(ruleToToggle.id, !wasEnabled);
      console.log(`   Toggled: ${ruleToToggle.host} -> ${!wasEnabled ? 'enabled' : 'disabled'}`);
    }

    // 8. Add backend
    console.log('\n8. Add Backend:');
    const newBackend = ingress.addBackend('new-service', {
      port: 9090,
      protocol: 'http',
      weight: 100
    });
    console.log(`   Added: ${newBackend.name} [${newBackend.protocol}://:${newBackend.port}]`);

    // 9. Record traffic
    console.log('\n9. Record Traffic:');
    ingress.recordRequest('web-frontend', 50);
    ingress.recordRequest('api-gateway', 75);
    console.log('   Recorded: 2 requests');

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const stats = ingress.getStats();
    console.log(`    Total rules: ${stats.totalRules}`);
    console.log(`    Enabled: ${stats.enabledRules}`);
    console.log(`    Backends: ${stats.totalBackends}`);
    console.log(`    Certificates: ${stats.totalCertificates}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'rules':
    console.log('Ingress Rules:');
    ingress.listRules().forEach(r => {
      console.log(`  ${r.host}${r.path} -> ${r.backend} [${r.enabled ? 'enabled' : 'disabled'}]`);
    });
    break;

  case 'backends':
    console.log('Backends:');
    ingress.listBackends().forEach(b => {
      console.log(`  ${b.name}: ${b.protocol}://:${b.port} (weight: ${b.weight})`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-ingress.js [demo|rules|backends]');
}
