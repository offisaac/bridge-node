/**
 * Service Registry - 服务注册与发现
 * 微服务间通信管理
 */

const EventEmitter = require('events');
const crypto = require('crypto');

// ========== Service Types ==========

const ServiceStatus = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  STARTING: 'starting',
  STOPPING: 'stopping'
};

const ServiceProtocol = {
  HTTP: 'http',
  HTTPS: 'https',
  GRPC: 'grpc',
  WEBSOCKET: 'ws',
  WEBSOCKETS: 'wss'
};

// ========== Service Instance ==========

class ServiceInstance {
  constructor(serviceName, instanceId, host, port, protocol = 'http') {
    this.serviceName = serviceName;
    this.instanceId = instanceId || crypto.randomUUID();
    this.host = host;
    this.port = port;
    this.protocol = protocol;
    this.status = ServiceStatus.STARTING;
    this.metadata = {};
    this.version = '1.0.0';
    this.weight = 1;
    this.healthy = true;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.lastHeartbeat = Date.now();
  }

  get url() {
    return `${this.protocol}://${this.host}:${this.port}`;
  }

  toJSON() {
    return {
      serviceName: this.serviceName,
      instanceId: this.instanceId,
      host: this.host,
      port: this.port,
      protocol: this.protocol,
      url: this.url,
      status: this.status,
      metadata: this.metadata,
      version: this.version,
      weight: this.weight,
      healthy: this.healthy,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastHeartbeat: this.lastHeartbeat
    };
  }
}

// ========== Service Registry ==========

class ServiceRegistry extends EventEmitter {
  constructor(options = {}) {
    super();

    this.services = new Map(); // serviceName -> Map(instanceId -> ServiceInstance)
    this.serviceMetadata = new Map(); // serviceName -> metadata
    this.subscriptions = new Map(); // subscriber -> Set of serviceNames

    this.heartbeatInterval = options.heartbeatInterval || 30000; // 30s
    this.instanceTimeout = options.instanceTimeout || 90000; // 90s

    this._heartbeatTimer = null;
    this._cleanupTimer = null;

    this.startHealthCheck();
  }

  // ========== Registration ==========

  register(serviceName, host, port, options = {}) {
    const instance = new ServiceInstance(
      serviceName,
      options.instanceId,
      host,
      port,
      options.protocol
    );

    instance.metadata = options.metadata || {};
    instance.version = options.version || '1.0.0';
    instance.weight = options.weight || 1;

    if (!this.services.has(serviceName)) {
      this.services.set(serviceName, new Map());
    }

    this.services.get(serviceName).set(instance.instanceId, instance);

    // Auto-set to healthy after registration
    instance.status = ServiceStatus.HEALTHY;
    instance.healthy = true;

    console.log(`Service registered: ${serviceName}/${instance.instanceId} at ${instance.url}`);

    this.emit('registered', {
      serviceName,
      instance: instance.toJSON()
    });

    return instance;
  }

  deregister(serviceName, instanceId) {
    const serviceInstances = this.services.get(serviceName);

    if (!serviceInstances) {
      return false;
    }

    const instance = serviceInstances.get(instanceId);

    if (!instance) {
      return false;
    }

    instance.status = ServiceStatus.STOPPING;
    serviceInstances.delete(instanceId);

    console.log(`Service deregistered: ${serviceName}/${instanceId}`);

    this.emit('deregistered', {
      serviceName,
      instanceId
    });

    return true;
  }

  // ========== Discovery ==========

  getService(serviceName) {
    const serviceInstances = this.services.get(serviceName);

    if (!serviceInstances) {
      return null;
    }

    const instances = Array.from(serviceInstances.values())
      .filter(instance => instance.healthy && instance.status === ServiceStatus.HEALTHY);

    if (instances.length === 0) {
      return null;
    }

    return instances;
  }

  getAllInstances(serviceName) {
    const serviceInstances = this.services.get(serviceName);

    if (!serviceInstances) {
      return [];
    }

    return Array.from(serviceInstances.values()).map(i => i.toJSON());
  }

  getHealthyInstances(serviceName) {
    const instances = this.getService(serviceName);
    return instances ? instances.map(i => i.toJSON()) : [];
  }

  // ========== Service Metadata ==========

  setServiceMetadata(serviceName, metadata) {
    this.serviceMetadata.set(serviceName, {
      ...this.serviceMetadata.get(serviceName),
      ...metadata
    });
  }

  getServiceMetadata(serviceName) {
    return this.serviceMetadata.get(serviceName) || {};
  }

  // ========== Health Check ==========

  startHealthCheck() {
    this._heartbeatTimer = setInterval(() => {
      this._checkHeartbeats();
    }, this.heartbeatInterval);

    this._cleanupTimer = setInterval(() => {
      this._cleanupStaleInstances();
    }, this.instanceTimeout);
  }

  stopHealthCheck() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
    }
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
    }
  }

  heartbeat(serviceName, instanceId) {
    const serviceInstances = this.services.get(serviceName);

    if (!serviceInstances) {
      return false;
    }

    const instance = serviceInstances.get(instanceId);

    if (!instance) {
      return false;
    }

    instance.lastHeartbeat = Date.now();
    instance.healthy = true;
    instance.status = ServiceStatus.HEALTHY;
    instance.updatedAt = Date.now();

    return true;
  }

  _checkHeartbeats() {
    for (const [serviceName, instances] of this.services) {
      for (const [instanceId, instance] of instances) {
        if (Date.now() - instance.lastHeartbeat > this.instanceTimeout) {
          instance.healthy = false;
          instance.status = ServiceStatus.UNHEALTHY;

          this.emit('unhealthy', {
            serviceName,
            instanceId,
            lastHeartbeat: instance.lastHeartbeat
          });
        }
      }
    }
  }

  _cleanupStaleInstances() {
    const now = Date.now();
    const timeout = this.instanceTimeout * 2;

    for (const [serviceName, instances] of this.services) {
      for (const [instanceId, instance] of instances) {
        if (now - instance.lastHeartbeat > timeout) {
          console.log(`Removing stale instance: ${serviceName}/${instanceId}`);
          instances.delete(instanceId);

          this.emit('removed', {
            serviceName,
            instanceId,
            reason: 'stale'
          });
        }
      }
    }
  }

  // ========== Service List ==========

  listServices() {
    const result = [];

    for (const [serviceName, instances] of this.services) {
      const healthyInstances = Array.from(instances.values())
        .filter(i => i.healthy);

      result.push({
        name: serviceName,
        instanceCount: instances.size,
        healthyCount: healthyInstances.length,
        instances: Array.from(instances.values()).map(i => i.toJSON())
      });
    }

    return result;
  }

  // ========== Load Balancing ==========

  selectInstance(serviceName, strategy = 'round-robin') {
    const instances = this.getService(serviceName);

    if (!instances || instances.length === 0) {
      return null;
    }

    if (instances.length === 1) {
      return instances[0];
    }

    switch (strategy) {
      case 'random':
        return instances[Math.floor(Math.random() * instances.length)];

      case 'weighted':
        return this._weightedSelect(instances);

      case 'round-robin':
      default:
        return instances[Math.now() % instances.length];
    }
  }

  _weightedSelect(instances) {
    const totalWeight = instances.reduce((sum, i) => sum + i.weight, 0);
    let random = Math.random() * totalWeight;

    for (const instance of instances) {
      random -= instance.weight;
      if (random <= 0) {
        return instance;
      }
    }

    return instances[0];
  }

  // ========== Subscription ==========

  subscribe(subscriber, serviceNames) {
    if (!this.subscriptions.has(subscriber)) {
      this.subscriptions.set(subscriber, new Set());
    }

    for (const serviceName of serviceNames) {
      this.subscriptions.get(subscriber).add(serviceName);
    }
  }

  unsubscribe(subscriber, serviceName = null) {
    if (!this.subscriptions.has(subscriber)) {
      return;
    }

    if (serviceName) {
      this.subscriptions.get(subscriber).delete(serviceName);
    } else {
      this.subscriptions.delete(subscriber);
    }
  }

  // ========== Close ==========

  close() {
    this.stopHealthCheck();
    this.services.clear();
    this.subscriptions.clear();
  }
}

// ========== Service Client (Discovery) ==========

class ServiceClient {
  constructor(registry, options = {}) {
    this.registry = registry;
    this.cacheTimeout = options.cacheTimeout || 5000;
    this.strategy = options.strategy || 'round-robin';

    this.cache = new Map(); // serviceName -> { instances, timestamp }
  }

  async getService(serviceName) {
    const cached = this.cache.get(serviceName);

    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.instances;
    }

    const instances = this.registry.getHealthyInstances(serviceName);

    this.cache.set(serviceName, {
      instances,
      timestamp: Date.now()
    });

    return instances;
  }

  async getInstance(serviceName) {
    const instances = await this.getService(serviceName);

    if (!instances || instances.length === 0) {
      return null;
    }

    // Simple load balancing
    const index = Math.floor(Math.random() * instances.length);
    return instances[index];
  }

  async callService(serviceName, path, options = {}) {
    const instance = await this.getInstance(serviceName);

    if (!instance) {
      throw new Error(`No healthy instances for service: ${serviceName}`);
    }

    const url = `${instance.url}${path}`;

    // Simplified HTTP call
    // In production, use axios or fetch
    return {
      url,
      method: options.method || 'GET',
      serviceName,
      instanceId: instance.instanceId
    };
  }

  invalidateCache(serviceName = null) {
    if (serviceName) {
      this.cache.delete(serviceName);
    } else {
      this.cache.clear();
    }
  }
}

// ========== Export ==========

module.exports = {
  ServiceRegistry,
  ServiceClient,
  ServiceStatus,
  ServiceProtocol,
  ServiceInstance
};
