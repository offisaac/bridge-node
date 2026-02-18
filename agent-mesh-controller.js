/**
 * Agent Mesh Controller - Service Mesh Controller Module
 *
 * High-level controller for managing service mesh operations.
 *
 * Usage: node agent-mesh-controller.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   status     - Show mesh status
 *   config     - Show configuration
 */

class MeshController {
  constructor(config = {}) {
    this.name = config.name || 'mesh-controller';
    this.version = config.version || 'v1';
    this.namespace = config.namespace || 'default';
    this.enabled = true;
    this.config = {};
    this.policies = new Map();
    this.services = new Map();
    this.gateways = new Map();
    this.virtualServices = new Map();
    this.destinationRules = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample services
    this.services.set('product-service', {
      name: 'product-service',
      version: 'v1',
      host: 'product-service.default.svc.cluster.local',
      ports: [{ port: 8080, targetPort: 8080 }],
      subsets: [
        { name: 'v1', labels: { version: 'v1' } },
        { name: 'v2', labels: { version: 'v2' } }
      ]
    });

    this.services.set('user-service', {
      name: 'user-service',
      version: 'v1',
      host: 'user-service.default.svc.cluster.local',
      ports: [{ port: 8081, targetPort: 8081 }],
      subsets: [{ name: 'v1', labels: { version: 'v1' } }]
    });

    this.services.set('order-service', {
      name: 'order-service',
      version: 'v1',
      host: 'order-service.default.svc.cluster.local',
      ports: [{ port: 8082, targetPort: 8082 }],
      subsets: [{ name: 'v1', labels: { version: 'v1' } }]
    });

    // Sample gateways
    this.gateways.set('ingress-gateway', {
      name: 'ingress-gateway',
      selector: { app: 'istio-ingressgateway' },
      servers: [
        {
          port: { number: 80, name: 'http', protocol: 'HTTP' },
          hosts: ['*']
        },
        {
          port: { number: 443, name: 'https', protocol: 'HTTPS' },
          hosts: ['*'],
          tls: { mode: 'SIMPLE', credentialName: 'ingress-cert' }
        }
      ]
    });

    this.gateways.set('egress-gateway', {
      name: 'egress-gateway',
      selector: { app: 'istio-egressgateway' },
      servers: [
        {
          port: { number: 443, name: 'https', protocol: 'HTTPS' },
          hosts: ['external-service.example.com']
        }
      ]
    });

    // Sample virtual services
    this.virtualServices.set('product-vs', {
      name: 'product-vs',
      gateways: ['ingress-gateway'],
      hosts: ['product.example.com'],
      http: [
        {
          match: [{ headers: { 'x-canary': { exact: 'true' } } }],
          route: [
            { destination: { host: 'product-service', subset: 'v2', port: { number: 8080 } }, weight: 100 }
          ]
        },
        {
          route: [
            { destination: { host: 'product-service', subset: 'v1', port: { number: 8080 } }, weight: 90 },
            { destination: { host: 'product-service', subset: 'v2', port: { number: 8080 } }, weight: 10 }
          ]
        }
      ]
    });

    this.virtualServices.set('user-vs', {
      name: 'user-vs',
      gateways: ['ingress-gateway'],
      hosts: ['user.example.com'],
      http: [
        {
          route: [
            { destination: { host: 'user-service', subset: 'v1', port: { number: 8081 } }, weight: 100 }
          ]
        }
      ]
    });

    // Sample destination rules
    this.destinationRules.set('product-service', {
      name: 'product-service',
      host: 'product-service',
      trafficPolicy: {
        connectionPool: { tcp: { maxConnections: 100 }, http: { h2UpgradePolicy: 'UPGRADE', http1MaxPendingRequests: 100, http2MaxRequests: 1000 } },
        loadBalancer: { simple: 'ROUND_ROBIN' },
        outlierDetection: { consecutive5xxErrors: 5, interval: 30, baseEjectionTime: 30 }
      },
      subsets: [
        { name: 'v1', labels: { version: 'v1' } },
        { name: 'v2', labels: { version: 'v2' } }
      ]
    });

    this.destinationRules.set('user-service', {
      name: 'user-service',
      host: 'user-service',
      trafficPolicy: {
        connectionPool: { tcp: { maxConnections: 50 }, http: { http1MaxPendingRequests: 50, http2MaxRequests: 500 } },
        loadBalancer: { simple: 'LEAST_REQUEST' }
      },
      subsets: [{ name: 'v1', labels: { version: 'v1' } }]
    });

    // Sample policies
    this.policies.set('mesh-mtls', {
      name: 'mesh-mtls',
      type: 'mesh',
      mode: 'STRICT'
    });

    this.policies.set('product-rate-limit', {
      name: 'product-rate-limit',
      type: 'rate-limit',
      limits: [{ maxRequests: 100, unit: 'second' }]
    });
  }

  // Register service
  registerService(service) {
    this.services.set(service.name, service);
    return service;
  }

  // Create gateway
  createGateway(gateway) {
    this.gateways.set(gateway.name, gateway);
    return gateway;
  }

  // Create virtual service
  createVirtualService(vs) {
    this.virtualServices.set(vs.name, vs);
    return vs;
  }

  // Create destination rule
  createDestinationRule(dr) {
    this.destinationRules.set(dr.name, dr);
    return dr;
  }

  // Add policy
  addPolicy(policy) {
    this.policies.set(policy.name, policy);
    return policy;
  }

  // Get service
  getService(name) {
    return this.services.get(name) || null;
  }

  // Get gateway
  getGateway(name) {
    return this.gateways.get(name) || null;
  }

  // Get virtual service
  getVirtualService(name) {
    return this.virtualServices.get(name) || null;
  }

  // Get destination rule
  getDestinationRule(name) {
    return this.destinationRules.get(name) || null;
  }

  // Get all services
  listServices() {
    return Array.from(this.services.values());
  }

  // Get all gateways
  listGateways() {
    return Array.from(this.gateways.values());
  }

  // Get all virtual services
  listVirtualServices() {
    return Array.from(this.virtualServices.values());
  }

  // Get all destination rules
  listDestinationRules() {
    return Array.from(this.destinationRules.values());
  }

  // Get all policies
  listPolicies() {
    return Array.from(this.policies.values());
  }

  // Update traffic routing
  updateRouting(serviceName, routes) {
    const vs = Array.from(this.virtualServices.values()).find(vs =>
      vs.http && vs.http.some(r => r.route && r.route.some(rt => rt.destination && rt.destination.host === serviceName))
    );
    if (!vs) {
      // Create new virtual service
      const newVs = {
        name: `${serviceName}-vs`,
        gateways: ['ingress-gateway'],
        hosts: [`${serviceName}.example.com`],
        http: [{ route: routes }]
      };
      this.virtualServices.set(newVs.name, newVs);
      return newVs;
    }

    // Update existing
    vs.http = vs.http || [];
    vs.http.push({ route: routes });
    return vs;
  }

  // Configure canary deployment
  configureCanary(serviceName, v1Weight, v2Weight) {
    const vs = Array.from(this.virtualServices.values()).find(vs =>
      vs.http && vs.http.some(r => r.route && r.route.some(rt => rt.destination && rt.destination.host === serviceName))
    );

    if (!vs) {
      throw new Error(`No virtual service found for ${serviceName}`);
    }

    // Find or create canary route
    const existingRoute = vs.http.find(r => !r.match);
    if (existingRoute) {
      existingRoute.route = [
        { destination: { host: serviceName, subset: 'v1', port: { number: 8080 } }, weight: v1Weight },
        { destination: { host: serviceName, subset: 'v2', port: { number: 8080 } }, weight: v2Weight }
      ];
    } else {
      vs.http.push({
        route: [
          { destination: { host: serviceName, subset: 'v1', port: { number: 8080 } }, weight: v1Weight },
          { destination: { host: serviceName, subset: 'v2', port: { number: 8080 } }, weight: v2Weight }
        ]
      });
    }

    return vs;
  }

  // Configure timeout
  configureTimeout(serviceName, timeout) {
    const vs = this.getVirtualService(`${serviceName}-vs`);
    if (vs && vs.http) {
      vs.http.forEach(route => {
        route.timeout = timeout;
      });
    }
    return vs;
  }

  // Configure retry
  configureRetry(serviceName, retries, perTryTimeout) {
    const vs = this.getVirtualService(`${serviceName}-vs`);
    if (vs && vs.http) {
      vs.http.forEach(route => {
        route.retries = { attempts: retries, perTryTimeout: perTryTimeout };
      });
    }
    return vs;
  }

  // Configure circuit breaker
  configureCircuitBreaker(serviceName, config) {
    const dr = this.destinationRules.get(serviceName);
    if (!dr) {
      throw new Error(`No destination rule found for ${serviceName}`);
    }
    dr.trafficPolicy = dr.trafficPolicy || {};
    dr.trafficPolicy.outlierDetection = {
      consecutive5xxErrors: config.consecutiveErrors || 5,
      interval: config.interval || 30,
      baseEjectionTime: config.baseEjectionTime || 30
    };
    return dr;
  }

  // Configure mTLS
  configureMTLS(mode = 'STRICT') {
    const policy = this.policies.get('mesh-mtls');
    if (policy) {
      policy.mode = mode;
    } else {
      this.policies.set('mesh-mtls', { name: 'mesh-mtls', type: 'mesh', mode });
    }
    return this.policies.get('mesh-mtls');
  }

  // Get mesh status
  getStatus() {
    return {
      controller: this.name,
      version: this.version,
      namespace: this.namespace,
      enabled: this.enabled,
      services: this.services.size,
      gateways: this.gateways.size,
      virtualServices: this.virtualServices.size,
      destinationRules: this.destinationRules.size,
      policies: this.policies.size
    };
  }

  // Get full config
  getConfig() {
    return {
      status: this.getStatus(),
      services: this.listServices(),
      gateways: this.listGateways(),
      virtualServices: this.listVirtualServices(),
      destinationRules: this.listDestinationRules(),
      policies: this.listPolicies()
    };
  }

  // Deploy configuration
  deploy() {
    console.log(`[Mesh Controller] Deploying configuration to namespace: ${this.namespace}`);
    console.log(`  - Services: ${this.services.size}`);
    console.log(`  - Gateways: ${this.gateways.size}`);
    console.log(`  - Virtual Services: ${this.virtualServices.size}`);
    console.log(`  - Destination Rules: ${this.destinationRules.size}`);
    console.log(`  - Policies: ${this.policies.size}`);
    return { success: true, namespace: this.namespace };
  }
}

function runDemo() {
  console.log('=== Agent Mesh Controller Demo\n');

  const controller = new MeshController({ name: 'istio-controller', namespace: 'production' });

  console.log('1. Mesh Status:');
  const status = controller.getStatus();
  console.log(`   Controller: ${status.controller}`);
  console.log(`   Version: ${status.version}`);
  console.log(`   Namespace: ${status.namespace}`);
  console.log(`   Services: ${status.services}`);
  console.log(`   Gateways: ${status.gateways}`);
  console.log(`   Virtual Services: ${status.virtualServices}`);

  console.log('\n2. List Services:');
  const services = controller.listServices();
  services.forEach(s => console.log(`   - ${s.name} (${s.host})`));

  console.log('\n3. List Gateways:');
  const gateways = controller.listGateways();
  gateways.forEach(g => console.log(`   - ${g.name}: ${g.servers.length} server(s)`));

  console.log('\n4. List Virtual Services:');
  const vss = controller.listVirtualServices();
  vss.forEach(vs => console.log(`   - ${vs.name}: ${vs.hosts.join(', ')}`));

  console.log('\n5. Get Virtual Service:');
  const productVs = controller.getVirtualService('product-vs');
  console.log(`   Product VS: ${productVs?.http?.length} route rule(s)`);

  console.log('\n6. Configure Canary Deployment:');
  const canary = controller.configureCanary('product-service', 80, 20);
  console.log(`   Updated: ${canary.name}`);
  canary.http.forEach(r => {
    if (r.route) {
      r.route.forEach(rt => {
        console.log(`   - ${rt.destination.subset}: ${rt.weight}%`);
      });
    }
  });

  console.log('\n7. Configure Circuit Breaker:');
  const cb = controller.configureCircuitBreaker('product-service', {
    consecutiveErrors: 5,
    interval: 30,
    baseEjectionTime: 30
  });
  console.log(`   Updated: ${cb.name}`);
  console.log(`   Consecutive Errors: ${cb.trafficPolicy.outlierDetection.consecutive5xxErrors}`);

  console.log('\n8. Configure mTLS:');
  const mtls = controller.configureMTLS('STRICT');
  console.log(`   Mode: ${mtls.mode}`);

  console.log('\n9. Add Custom Policy:');
  const rateLimitPolicy = controller.addPolicy({
    name: 'api-rate-limit',
    type: 'rate-limit',
    limits: [{ maxRequests: 1000, unit: 'minute' }]
  });
  console.log(`   Added: ${rateLimitPolicy.name}`);

  console.log('\n10. Deploy Configuration:');
  const deploy = controller.deploy();
  console.log(`    Status: ${deploy.success ? 'Success' : 'Failed'}`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const controller = new MeshController();

if (command === 'demo') runDemo();
else if (command === 'status') {
  console.log(JSON.stringify(controller.getStatus(), null, 2));
}
else if (command === 'config') {
  console.log(JSON.stringify(controller.getConfig(), (key, value) => value instanceof Map ? Object.fromEntries(value) : value, 2));
}
else console.log('Usage: node agent-mesh-controller.js [demo|status|config]');
