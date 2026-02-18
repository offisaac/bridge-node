/**
 * Agent Service Mesh - Service Mesh Management Module
 *
 * Manages service mesh with traffic routing, load balancing, and observability.
 *
 * Usage: node agent-service-mesh.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   routes     - List routes
 *   services   - List services
 */

class Service {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.version = config.version || 'v1';
    this.instances = config.instances || [];
    this.metadata = config.metadata || {};
    this.health = config.health || 'healthy';
  }
}

class Route {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.destination = config.destination;
    this.weight = config.weight || 100; // Traffic weight 0-100
    this.match = config.match || null; // Match conditions
    this.filters = config.filters || []; // Request/response filters
  }
}

class ServiceMeshManager {
  constructor() {
    this.services = new Map();
    this.routes = new Map();
    this.traffic = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample services
    const services = [
      { name: 'api-gateway', version: 'v1', instances: [{ host: 'gateway-1', port: 8080 }, { host: 'gateway-2', port: 8080 }], health: 'healthy' },
      { name: 'user-service', version: 'v1', instances: [{ host: 'user-v1-1', port: 8081 }, { host: 'user-v1-2', port: 8081 }], health: 'healthy' },
      { name: 'user-service', version: 'v2', instances: [{ host: 'user-v2-1', port: 8081 }], health: 'healthy' },
      { name: 'order-service', version: 'v1', instances: [{ host: 'order-1', port: 8082 }, { host: 'order-2', port: 8082 }], health: 'healthy' },
      { name: 'payment-service', version: 'v1', instances: [{ host: 'payment-1', port: 8083 }], health: 'degraded' }
    ];

    services.forEach(s => {
      const service = new Service(s);
      this.services.set(`${service.name}:${service.version}`, service);
    });

    // Sample routes
    const routes = [
      { name: 'user-default', destination: 'user-service:v1', weight: 100 },
      { name: 'user-canary', destination: 'user-service:v2', weight: 20 },
      { name: 'order-default', destination: 'order-service:v1', weight: 100 },
      { name: 'payment-default', destination: 'payment-service:v1', weight: 100 }
    ];

    routes.forEach(r => {
      const route = new Route(r);
      this.routes.set(route.id, route);
    });

    // Sample traffic data
    this.traffic.set('api-gateway', { requests: 10000, latency: 50, errors: 10 });
    this.traffic.set('user-service', { requests: 5000, latency: 30, errors: 5 });
    this.traffic.set('order-service', { requests: 3000, latency: 45, errors: 3 });
    this.traffic.set('payment-service', { requests: 1500, latency: 100, errors: 15 });
  }

  // Register service
  register(name, version, instances, metadata = {}) {
    const service = new Service({
      name,
      version,
      instances,
      metadata
    });
    this.services.set(`${name}:${version}`, service);
    return service;
  }

  // Get service
  getService(name, version = null) {
    if (version) {
      return this.services.get(`${name}:${version}`) || null;
    }
    // Return all versions
    return Array.from(this.services.values()).filter(s => s.name === name);
  }

  // List services
  listServices() {
    return Array.from(this.services.values());
  }

  // Add route
  addRoute(name, destination, weight = 100, match = null) {
    const route = new Route({
      name,
      destination,
      weight,
      match
    });
    this.routes.set(route.id, route);
    return route;
  }

  // Get routes
  getRoutes(destination = null) {
    let all = Array.from(this.routes.values());
    if (destination) {
      all = all.filter(r => r.destination === destination);
    }
    return all;
  }

  // Update route weight (for canary deployments)
  updateRouteWeight(routeId, weight) {
    const route = this.routes.get(routeId);
    if (!route) {
      throw new Error('Route not found');
    }
    route.weight = Math.min(100, Math.max(0, weight));
    return route;
  }

  // Record traffic metrics
  recordTraffic(serviceName, requests = 0, latency = 0, errors = 0) {
    const current = this.traffic.get(serviceName) || { requests: 0, latency: 0, errors: 0 };
    this.traffic.set(serviceName, {
      requests: current.requests + requests,
      latency: current.latency + latency,
      errors: current.errors + errors
    });
  }

  // Get traffic metrics
  getTraffic(serviceName = null) {
    if (serviceName) {
      return this.traffic.get(serviceName) || null;
    }
    return Object.fromEntries(this.traffic);
  }

  // Resolve destination (load balancing)
  resolveDestination(serviceName) {
    const versions = this.getService(serviceName);
    if (!versions || versions.length === 0) {
      return null;
    }

    // Simple round-robin or weighted selection
    const healthy = versions.filter(s => s.health === 'healthy');
    if (healthy.length === 0) {
      return versions[0]; // Fallback to any
    }

    // Return healthy instance
    const service = healthy[Math.floor(Math.random() * healthy.length)];
    return service.instances[Math.floor(Math.random() * service.instances.length)];
  }

  // Health check
  checkHealth(serviceName) {
    const versions = this.getService(serviceName);
    if (!versions || versions.length === 0) {
      return { status: 'unknown', services: [] };
    }

    const statuses = versions.map(s => ({
      version: s.version,
      health: s.health,
      instances: s.instances.length
    }));

    const hasUnhealthy = versions.some(s => s.health === 'unhealthy');
    const hasDegraded = versions.some(s => s.health === 'degraded');

    return {
      status: hasUnhealthy ? 'unhealthy' : hasDegraded ? 'degraded' : 'healthy',
      services: statuses
    };
  }

  // Get mesh statistics
  getStats() {
    const services = this.listServices();
    const uniqueServices = new Set(services.map(s => s.name));

    return {
      totalServices: uniqueServices.size,
      totalVersions: services.length,
      totalRoutes: this.routes.size,
      totalInstances: services.reduce((sum, s) => sum + s.instances.length, 0),
      healthyServices: services.filter(s => s.health === 'healthy').length,
      degradedServices: services.filter(s => s.health === 'degraded').length,
      unhealthyServices: services.filter(s => s.health === 'unhealthy').length
    };
  }
}

function runDemo() {
  console.log('=== Agent Service Mesh Demo\n');

  const mgr = new ServiceMeshManager();

  console.log('1. List Services:');
  const services = mgr.listServices();
  console.log(`   Total: ${services.length}`);
  services.forEach(s => console.log(`   - ${s.name}:${s.version} [${s.health}] (${s.instances.length} instances)`));

  console.log('\n2. Get Routes:');
  const routes = mgr.getRoutes();
  console.log(`   Total: ${routes.length}`);
  routes.forEach(r => console.log(`   - ${r.name} -> ${r.destination} (${r.weight}%)`));

  console.log('\n3. Get Traffic:');
  const traffic = mgr.getTraffic();
  console.log(`   API Gateway: ${traffic['api-gateway']?.requests || 0} requests`);
  console.log(`   User Service: ${traffic['user-service']?.requests || 0} requests`);

  console.log('\n4. Resolve Destination:');
  const instance = mgr.resolveDestination('user-service');
  console.log(`   Instance: ${instance?.host}:${instance?.port}`);

  console.log('\n5. Check Health:');
  const health = mgr.checkHealth('user-service');
  console.log(`   Status: ${health.status}`);
  health.services.forEach(s => console.log(`   - ${s.version}: ${s.health}`));

  console.log('\n6. Register New Service:');
  const newService = mgr.register('notification-service', 'v1', [
    { host: 'notif-1', port: 8084 },
    { host: 'notif-2', port: 8084 }
  ]);
  console.log(`   Registered: ${newService.name}:${newService.version}`);

  console.log('\n7. Add Route:');
  const newRoute = mgr.addRoute('notif-default', 'notification-service:v1', 100);
  console.log(`   Added: ${newRoute.name} -> ${newRoute.destination}`);

  console.log('\n8. Update Route Weight (Canary):');
  const routesToUser = mgr.getRoutes('user-service:v2');
  if (routesToUser.length > 0) {
    const updated = mgr.updateRouteWeight(routesToUser[0].id, 50);
    console.log(`   Updated: ${updated.name} -> ${updated.weight}%`);
  }

  console.log('\n9. Record Traffic:');
  mgr.recordTraffic('notification-service', 100, 25, 0);
  const notifTraffic = mgr.getTraffic('notification-service');
  console.log(`   Recorded: ${notifTraffic.requests} requests`);

  console.log('\n10. Get Statistics:');
  const stats = mgr.getStats();
  console.log(`    Total services: ${stats.totalServices}`);
  console.log(`    Total versions: ${stats.totalVersions}`);
  console.log(`    Total routes: ${stats.totalRoutes}`);
  console.log(`    Healthy: ${stats.healthyServices}`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new ServiceMeshManager();

if (command === 'demo') runDemo();
else if (command === 'routes') {
  const routes = mgr.getRoutes();
  console.log(JSON.stringify(routes, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else if (command === 'services') {
  const services = mgr.listServices();
  console.log(JSON.stringify(services, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else console.log('Usage: node agent-service-mesh.js [demo|routes|services]');
