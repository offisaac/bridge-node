/**
 * Service Catalog - 服务目录
 * 实现内部服务目录与所有权信息
 */

const fs = require('fs');
const path = require('path');

// ========== Service Status ==========

const ServiceStatus = {
  ACTIVE: 'active',
  DEPRECATED: 'deprecated',
  PLANNED: 'planned',
  SUNSET: 'sunset',
  UNKNOWN: 'unknown'
};

const ServiceTier = {
  CORE: 'core',
  SUPPORTING: 'supporting',
  UTILITY: 'utility',
  EXPERIMENTAL: 'experimental'
};

const LifecycleStage = {
  INCUBATION: 'incubation',
  PRODUCTION: 'production',
  MAINTENANCE: 'maintenance',
  RETIREMENT: 'retirement'
};

// ========== Owner ==========

class Owner {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.email = config.email;
    this.team = config.team;
    this.role = config.role || 'owner';
    this.slack = config.slack || null;
    this.oncall = config.oncall || null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      team: this.team,
      role: this.role,
      slack: this.slack,
      oncall: this.oncall
    };
  }
}

// ========== Service ==========

class Service {
  constructor(config) {
    this.id = config.id || `svc_${Date.now()}`;
    this.name = config.name;
    this.description = config.description || '';
    this.status = config.status || ServiceStatus.ACTIVE;
    this.tier = config.tier || ServiceTier.SUPPORTING;
    this.lifecycle = config.lifecycle || LifecycleStage.PRODUCTION;

    // Ownership
    this.owners = (config.owners || []).map(o => o instanceof Owner ? o : new Owner(o));
    this.team = config.team;
    this.contact = config.contact;

    // Technical
    this.type = config.type || 'backend'; // frontend, backend, data, infrastructure
    this.language = config.language || null;
    this.framework = config.framework || null;
    this.repository = config.repository || null;
    this.documentation = config.documentation || null;

    // Endpoints
    this.endpoints = config.endpoints || [];
    this.healthCheck = config.healthCheck || null;

    // Dependencies
    this.dependsOn = config.dependsOn || [];
    this.dependents = config.dependents || [];

    // Metrics
    this.uptime = config.uptime || 100;
    this.latency = config.latency || null;
    this.requestsPerDay = config.requestsPerDay || null;

    // Tags & Metadata
    this.tags = config.tags || [];
    this.metadata = config.metadata || {};

    this.createdAt = config.createdAt || Date.now();
    this.updatedAt = config.updatedAt || Date.now();
  }

  addOwner(owner) {
    const o = owner instanceof Owner ? owner : new Owner(owner);
    this.owners.push(o);
    this.updatedAt = Date.now();
    return this;
  }

  addDependency(serviceId) {
    if (!this.dependsOn.includes(serviceId)) {
      this.dependsOn.push(serviceId);
      this.updatedAt = Date.now();
    }
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      status: this.status,
      tier: this.tier,
      lifecycle: this.lifecycle,
      owners: this.owners.map(o => o.toJSON()),
      team: this.team,
      contact: this.contact,
      type: this.type,
      language: this.language,
      framework: this.framework,
      repository: this.repository,
      documentation: this.documentation,
      endpoints: this.endpoints,
      healthCheck: this.healthCheck,
      dependsOn: this.dependsOn,
      dependents: this.dependents,
      uptime: this.uptime,
      latency: this.latency,
      requestsPerDay: this.requestsPerDay,
      tags: this.tags,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// ========== Service Catalog ==========

class ServiceCatalog {
  constructor(options = {}) {
    this.services = new Map(); // id -> Service
    this.storageDir = options.storageDir || './service-catalog-data';
    this.listeners = new Map();

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadServices();
  }

  // ========== Service Management ==========

  createService(config) {
    const service = new Service(config);
    this.services.set(service.id, service);
    this._saveService(service);
    this._emit('service:created', service);
    return service;
  }

  getService(id) {
    return this.services.get(id);
  }

  getServiceByName(name) {
    for (const service of this.services.values()) {
      if (service.name === name) return service;
    }
    return null;
  }

  listServices(filters = {}) {
    let result = Array.from(this.services.values());

    if (filters.status) {
      result = result.filter(s => s.status === filters.status);
    }

    if (filters.tier) {
      result = result.filter(s => s.tier === filters.tier);
    }

    if (filters.lifecycle) {
      result = result.filter(s => s.lifecycle === filters.lifecycle);
    }

    if (filters.type) {
      result = result.filter(s => s.type === filters.type);
    }

    if (filters.team) {
      result = result.filter(s => s.team === filters.team);
    }

    if (filters.owner) {
      result = result.filter(s => s.owners.some(o =>
        o.name.toLowerCase().includes(filters.owner.toLowerCase()) ||
        o.email.toLowerCase().includes(filters.owner.toLowerCase()) ||
        o.team?.toLowerCase().includes(filters.owner.toLowerCase())
      ));
    }

    if (filters.tag) {
      result = result.filter(s => s.tags.includes(filters.tag));
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(s =>
        s.name.toLowerCase().includes(search) ||
        s.description.toLowerCase().includes(search) ||
        s.tags.some(t => t.toLowerCase().includes(search))
      );
    }

    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  updateService(id, updates) {
    const existing = this.services.get(id);
    if (!existing) {
      throw new Error(`Service not found: ${id}`);
    }

    const updated = new Service({
      ...existing.toJSON(),
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now()
    });

    this.services.set(id, updated);
    this._saveService(updated);
    this._emit('service:updated', updated);

    return updated;
  }

  deleteService(id) {
    if (!this.services.has(id)) {
      throw new Error(`Service not found: ${id}`);
    }

    // Remove from dependents of other services
    for (const service of this.services.values()) {
      service.dependents = service.dependents.filter(d => d !== id);
    }

    this.services.delete(id);
    this._deleteServiceFile(id);
    this._emit('service:deleted', { id });

    return true;
  }

  // ========== Dependency Management ==========

  addDependency(serviceId, dependsOnId) {
    const service = this.services.get(serviceId);
    const dependency = this.services.get(dependsOnId);

    if (!service || !dependency) {
      throw new Error('Service not found');
    }

    service.addDependency(dependsOnId);

    if (!dependency.dependents.includes(serviceId)) {
      dependency.dependents.push(serviceId);
    }

    this._saveService(service);
    this._saveService(dependency);

    return this;
  }

  getDependencyGraph(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) return null;

    const graph = {
      service: service.toJSON(),
      dependencies: [],
      dependents: []
    };

    for (const depId of service.dependsOn) {
      const dep = this.services.get(depId);
      if (dep) graph.dependencies.push(dep.toJSON());
    }

    for (const depId of service.dependents) {
      const dep = this.services.get(depId);
      if (dep) graph.dependents.push(dep.toJSON());
    }

    return graph;
  }

  getImpactAnalysis(serviceId) {
    const service = this.services.get(serviceId);
    if (!service) return null;

    // BFS to find all downstream services
    const downstream = new Set();
    const queue = [...service.dependents];

    while (queue.length > 0) {
      const id = queue.shift();
      if (!downstream.has(id)) {
        downstream.add(id);
        const svc = this.services.get(id);
        if (svc) queue.push(...svc.dependents);
      }
    }

    return {
      service: service.toJSON(),
      downstreamServices: Array.from(downstream).map(id => {
        const svc = this.services.get(id);
        return svc ? svc.toJSON() : null;
      }).filter(Boolean),
      totalImpacted: downstream.size
    };
  }

  // ========== Ownership ==========

  addOwner(serviceId, owner) {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    service.addOwner(owner);
    this._saveService(service);
    this._emit('owner:added', { serviceId, owner });

    return service;
  }

  removeOwner(serviceId, ownerId) {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    service.owners = service.owners.filter(o => o.id !== ownerId);
    this._saveService(service);
    this._emit('owner:removed', { serviceId, ownerId });

    return service;
  }

  getTeams() {
    const teams = new Set();
    for (const service of this.services.values()) {
      if (service.team) teams.add(service.team);
      for (const owner of service.owners) {
        if (owner.team) teams.add(owner.team);
      }
    }
    return Array.from(teams);
  }

  getServicesByTeam(team) {
    return this.listServices({ team });
  }

  getServicesByOwner(ownerId) {
    return this.listServices({ owner: ownerId });
  }

  // ========== Search ==========

  search(query) {
    return this.listServices({ search: query });
  }

  // ========== Statistics ==========

  getStats() {
    const services = Array.from(this.services.values());

    return {
      totalServices: services.length,
      byStatus: services.reduce((acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      }, {}),
      byTier: services.reduce((acc, s) => {
        acc[s.tier] = (acc[s.tier] || 0) + 1;
        return acc;
      }, {}),
      byLifecycle: services.reduce((acc, s) => {
        acc[s.lifecycle] = (acc[s.lifecycle] || 0) + 1;
        return acc;
      }, {}),
      byType: services.reduce((acc, s) => {
        acc[s.type] = (acc[s.type] || 0) + 1;
        return acc;
      }, {}),
      totalTeams: this.getTeams().length,
      activeOwners: new Set(services.flatMap(s => s.owners.map(o => o.id))).size,
      avgUptime: services.length > 0
        ? services.reduce((sum, s) => sum + (s.uptime || 0), 0) / services.length
        : 0
    };
  }

  // ========== Persistence ==========

  _loadServices() {
    const dir = path.join(this.storageDir, 'services');
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const service = new Service(data);
        this.services.set(service.id, service);
      } catch (err) {
        console.error(`Failed to load service ${file}:`, err);
      }
    }
  }

  _saveService(service) {
    const dir = path.join(this.storageDir, 'services');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(dir, `${service.id}.json`),
      JSON.stringify(service.toJSON(), null, 2)
    );
  }

  _deleteServiceFile(id) {
    const file = path.join(this.storageDir, 'services', `${id}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  // ========== Events ==========

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index >= 0) callbacks.splice(index, 1);
    }
  }

  _emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(data);
        } catch (err) {
          console.error('Service catalog event error:', err);
        }
      }
    }
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const catalog = new ServiceCatalog();

  switch (command) {
    case 'list':
      console.log('Service Catalog:');
      console.log('================');
      for (const service of catalog.listServices()) {
        console.log(`\n${service.name} [${service.status}]`);
        console.log(`  ID: ${service.id}`);
        console.log(`  Tier: ${service.tier} | Lifecycle: ${service.lifecycle}`);
        console.log(`  Owners: ${service.owners.map(o => o.name).join(', ') || 'None'}`);
        console.log(`  Team: ${service.team || 'N/A'}`);
      }
      break;

    case 'add':
      const service = catalog.createService({
        name: args[1] || 'new-service',
        description: args[2] || 'A new service',
        team: args[3] || 'platform',
        type: args[4] || 'backend',
        owners: [
          { id: 'owner1', name: 'John Doe', email: 'john@example.com', team: 'platform' }
        ]
      });
      console.log(`Created service: ${service.id}`);
      break;

    case 'get':
      const svc = catalog.getService(args[1]);
      if (svc) {
        console.log(JSON.stringify(svc.toJSON(), null, 2));
      } else {
        console.log('Service not found');
      }
      break;

    case 'search':
      const results = catalog.search(args[1] || '');
      console.log(`Found ${results.length} services:`);
      for (const s of results) {
        console.log(`  - ${s.name} [${s.status}]`);
      }
      break;

    case 'deps':
      const graph = catalog.getDependencyGraph(args[1]);
      if (graph) {
        console.log('Dependencies:', graph.dependencies.map(s => s.name));
        console.log('Dependents:', graph.dependents.map(s => s.name));
      } else {
        console.log('Service not found');
      }
      break;

    case 'impact':
      const impact = catalog.getImpactAnalysis(args[1]);
      if (impact) {
        console.log(`Service: ${impact.service.name}`);
        console.log(`Downstream services: ${impact.totalImpacted}`);
        console.log(impact.downstreamServices.map(s => s.name).join(', '));
      } else {
        console.log('Service not found');
      }
      break;

    case 'teams':
      console.log('Teams:');
      console.log(catalog.getTeams().join(', '));
      break;

    case 'stats':
      console.log('Service Catalog Statistics:');
      console.log('===========================');
      console.log(JSON.stringify(catalog.getStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node service-catalog.js list               - List all services');
      console.log('  node service-catalog.js add <name> <desc> <team> <type> - Add service');
      console.log('  node service-catalog.js get <id>            - Get service details');
      console.log('  node service-catalog.js search <query>       - Search services');
      console.log('  node service-catalog.js deps <id>           - Show dependencies');
      console.log('  node service-catalog.js impact <id>          - Show impact analysis');
      console.log('  node service-catalog.js teams                - List teams');
      console.log('  node service-catalog.js stats                - Show statistics');
      console.log('\nStatuses:', Object.values(ServiceStatus).join(', '));
      console.log('Tiers:', Object.values(ServiceTier).join(', '));
      console.log('Lifecycle:', Object.values(LifecycleStage).join(', '));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  ServiceCatalog,
  Service,
  Owner,
  ServiceStatus,
  ServiceTier,
  LifecycleStage
};
