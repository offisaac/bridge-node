/**
 * Service Mesh Integration - 服务网格集成
 * 支持 Istio/Consul 服务网格集成
 */

const http = require('http');
const https = require('https');

// ========== Service Mesh Types ==========

const MeshProvider = {
  ISTIO: 'istio',
  CONSUL: 'consul'
};

const ServiceEndpointType = {
  HTTP: 'http',
  GRPC: 'grpc'
};

// ========== Service Mesh Base ==========

class ServiceMeshClient {
  constructor(options = {}) {
    this.provider = options.provider;
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.namespace = options.namespace || 'default';
    this.timeout = options.timeout || 5000;
  }

  async request(method, path, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const lib = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          ...(this.token ? { 'Authorization': `Bearer ${this.token}` } : {})
        },
        timeout: this.timeout
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }
}

// ========== Istio Client ==========

class IstioClient extends ServiceMeshClient {
  constructor(options = {}) {
    super({ ...options, provider: MeshProvider.ISTIO });
    this.controlPlaneUrl = options.controlPlaneUrl || 'http://istiod.istio-system:15010';
  }

  // ========== Virtual Services ==========

  async createVirtualService(vs) {
    return this.request('POST', `/apis/networking.istio.io/v1alpha3/namespaces/${this.namespace}/virtualservices`, vs);
  }

  async getVirtualService(name) {
    return this.request('GET', `/apis/networking.istio.io/v1alpha3/namespaces/${this.namespace}/virtualservices/${name}`);
  }

  async listVirtualServices() {
    return this.request('GET', `/apis/networking.istio.io/v1alpha3/namespaces/${this.namespace}/virtualservices`);
  }

  async deleteVirtualService(name) {
    return this.request('DELETE', `/apis/networking.istio.io/v1alpha3/namespaces/${this.namespace}/virtualservices/${name}`);
  }

  // ========== Destination Rules ==========

  async createDestinationRule(dr) {
    return this.request('POST', `/apis/networking.istio.io/v1alpha3/namespaces/${this.namespace}/destinationrules`, dr);
  }

  async getDestinationRule(name) {
    return this.request('GET', `/apis/networking.istio.io/v1alpha3/namespaces/${this.namespace}/destinationrules/${name}`);
  }

  async listDestinationRules() {
    return this.request('GET', `/apis/networking.istio.io/v1alpha3/namespaces/${this.namespace}/destinationrules`);
  }

  // ========== Service Entries ==========

  async createServiceEntry(se) {
    return this.request('POST', `/apis/networking.istio.io/v1alpha3/namespaces/${this.namespace}/serviceentries`, se);
  }

  async listServiceEntries() {
    return this.request('GET', `/apis/networking.istio.io/v1alpha3/namespaces/${this.namespace}/serviceentries`);
  }

  // ========== Authorization Policies ==========

  async createAuthorizationPolicy(policy) {
    return this.request('POST', `/apis/security.istio.io/v1beta1/namespaces/${this.namespace}/authorizationpolicies`, policy);
  }

  async listAuthorizationPolicies() {
    return this.request('GET', `/apis/security.istio.io/v1beta1/namespaces/${this.namespace}/authorizationpolicies`);
  }

  // ========== Telemetry ==========

  async createTelemetry(telemetry) {
    return this.request('POST', `/apis/telemetry.istio.io/v1alpha1/namespaces/${this.namespace}/telemetries`, telemetry);
  }

  // ========== Envoy Config =========-

  async getEnvoyConfig(podName, namespace) {
    return this.request('GET', `/api/v1/namespaces/${namespace}/pods/${podName}/proxyconfig`);
  }

  // ========== Service Mesh Status ==========

  async getMeshStatus() {
    try {
      const [vs, dr, se] = await Promise.all([
        this.listVirtualServices(),
        this.listDestinationRules(),
        this.listServiceEntries()
      ]);

      return {
        provider: MeshProvider.ISTIO,
        status: 'healthy',
        virtualServices: vs.items?.length || 0,
        destinationRules: dr.items?.length || 0,
        serviceEntries: se.items?.length || 0,
        namespace: this.namespace
      };
    } catch (err) {
      return {
        provider: MeshProvider.ISTIO,
        status: 'unhealthy',
        error: err.message
      };
    }
  }
}

// ========== Consul Client ==========

class ConsulClient extends ServiceMeshClient {
  constructor(options = {}) {
    super({ ...options, provider: MeshProvider.CONSUL });
    this.datacenter = options.datacenter || 'dc1';
  }

  // ========== Service Registration ==========

  async registerService(service) {
    return this.request('PUT', `/v1/agent/service/register`, {
      ID: service.id || service.Name,
      Name: service.Name,
      Address: service.Address,
      Port: service.Port,
      Check: service.Check || {
        HTTP: `http://${service.Address}:${service.Port}/health`,
        Interval: '10s',
        Timeout: '5s'
      },
      ...service
    });
  }

  async deregisterService(serviceId) {
    return this.request('PUT', `/v1/agent/service/deregister/${serviceId}`);
  }

  async listServices() {
    return this.request('GET', '/v1/catalog/services');
  }

  async getService(serviceName) {
    return this.request('GET', `/v1/catalog/service/${serviceName}`);
  }

  // ========== Health Checks ==========

  async getServiceHealth(serviceName) {
    return this.request('GET', `/v1/health/service/${serviceName}`);
  }

  async getNodeHealth(node) {
    return this.request('GET', `/v1/health/node/${node}`);
  }

  // ========== Key-Value Store =========-

  async getKV(key) {
    return this.request('GET', `/v1/kv/${key}`);
  }

  async putKV(key, value) {
    return this.request('PUT', `/v1/kv/${key}`, value);
  }

  async deleteKV(key) {
    return this.request('DELETE', `/v1/kv/${key}`);
  }

  // ========== Intentions (Service Mesh) ==========

  async createIntention(intention) {
    return this.request('PUT', `/v1/connect/intentions`, {
      SourceName: intention.SourceName,
      DestinationName: intention.DestinationName,
      Action: intention.Action || 'allow'
    });
  }

  async listIntentions() {
    return this.request('GET', '/v1/connect/intentions');
  }

  // ========== Mesh Configuration =========-

  async getConfigEntries() {
    return this.request('GET', '/v1/config_entries');
  }

  async getProxyDefaults() {
    return this.request('GET', '/v1/config_entries/proxy-defaults/default');
  }

  async setProxyDefaults(config) {
    return this.request('PUT', '/v1/config_entries/proxy-defaults', {
      Kind: 'proxy-defaults',
      Name: 'global',
      ...config
    });
  }

  // ========== Service Mesh Status ==========

  async getMeshStatus() {
    try {
      const [services, intentions] = await Promise.all([
        this.listServices(),
        this.listIntentions()
      ]);

      return {
        provider: MeshProvider.CONSUL,
        status: 'healthy',
        services: Object.keys(services).length,
        intentions: Array.isArray(intentions) ? intentions.length : 0,
        datacenter: this.datacenter
      };
    } catch (err) {
      return {
        provider: MeshProvider.CONSUL,
        status: 'unhealthy',
        error: err.message
      };
    }
  }
}

// ========== Service Mesh Manager ==========

class ServiceMeshManager {
  constructor(options = {}) {
    this.provider = options.provider || MeshProvider.ISTIO;
    this.client = this._createClient(options);
  }

  _createClient(options) {
    switch (this.provider) {
      case MeshProvider.ISTIO:
        return new IstioClient(options);
      case MeshProvider.CONSUL:
        return new ConsulClient(options);
      default:
        throw new Error(`Unsupported mesh provider: ${this.provider}`);
    }
  }

  // ========== Service Discovery ==========

  async discoverServices() {
    if (this.provider === MeshProvider.ISTIO) {
      const se = await this.client.listServiceEntries();
      return se.items?.map(item => ({
        name: item.metadata.name,
        hosts: item.spec.hosts,
        ports: item.spec.ports,
        location: item.spec.location
      })) || [];
    } else {
      const services = await this.client.listServices();
      return Object.entries(services).map(([name, info]) => ({
        name,
        ...info
      }));
    }
  }

  async discoverService(serviceName) {
    if (this.provider === MeshProvider.ISTIO) {
      // For Istio, need to query ServiceEntries or Kubernetes services
      return null;
    } else {
      return this.client.getService(serviceName);
    }
  }

  // ========== Traffic Management =========-

  async createTrafficRule(rule) {
    if (this.provider === MeshProvider.ISTIO) {
      return this.client.createVirtualService(rule);
    } else {
      throw new Error('Traffic rules not supported for Consul');
    }
  }

  async createLoadBalancer(config) {
    if (this.provider === MeshProvider.ISTIO) {
      return this.client.createDestinationRule(config);
    } else {
      return this.client.setProxyDefaults({
        DefaultProxyBalance: config.strategy || 'random'
      });
    }
  }

  // ========== Security ==========

  async createAccessPolicy(policy) {
    if (this.provider === MeshProvider.ISTIO) {
      return this.client.createAuthorizationPolicy(policy);
    } else {
      return this.client.createIntention(policy);
    }
  }

  async listAccessPolicies() {
    if (this.provider === MeshProvider.ISTIO) {
      return this.client.listAuthorizationPolicies();
    } else {
      return this.client.listIntentions();
    }
  }

  // ========== Resilience =========-

  async createCircuitBreaker(config) {
    if (this.provider === MeshProvider.ISTIO) {
      return this.client.createDestinationRule({
        ...config,
        trafficPolicy: {
          connectionPool: config.connectionPool,
          outlierDetection: config.outlierDetection
        }
      });
    } else {
      throw new Error('Circuit breaker not supported for Consul');
    }
  }

  async createRetryPolicy(config) {
    if (this.provider === MeshProvider.ISTIO) {
      return this.client.createVirtualService({
        ...config,
        retries: {
          attempts: config.attempts || 3,
          perTryTimeout: config.perTryTimeout || '2s',
          retryOn: config.retryOn || '5xx,reset,connect-failure,retriable-4xx'
        }
      });
    } else {
      throw new Error('Retry policy not supported for Consul');
    }
  }

  // ========== Observability ==========

  async enableTracing(config) {
    if (this.provider === MeshProvider.ISTIO) {
      return this.client.createTelemetry({
        metadata: {
          name: 'default',
          namespace: this.client.namespace
        },
        spec: {
          tracing: config.tracing || []
        }
      });
    } else {
      return this.client.putKV('mesh/tracing', config);
    }
  }

  // ========== Status ==========

  async getStatus() {
    return this.client.getMeshStatus();
  }

  async healthCheck() {
    try {
      const status = await this.client.getMeshStatus();
      return status.status === 'healthy';
    } catch {
      return false;
    }
  }
}

// ========== Factory ==========

function createMeshClient(provider, options) {
  switch (provider) {
    case MeshProvider.ISTIO:
      return new IstioClient(options);
    case MeshProvider.CONSUL:
      return new ConsulClient(options);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

function createMeshManager(provider, options) {
  return new ServiceMeshManager({ ...options, provider });
}

// ========== CLI ==========

function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0];
  const provider = args.find(a => a.startsWith('--provider='))?.split('=')[1] || MeshProvider.ISTIO;

  const manager = new ServiceMeshManager({ provider });

  switch (command) {
    case 'status':
      manager.getStatus().then(status => {
        console.log('Service Mesh Status:');
        console.log(JSON.stringify(status, null, 2));
      });
      break;

    case 'services':
      manager.discoverServices().then(services => {
        console.log('Discovered Services:');
        console.log(JSON.stringify(services, null, 2));
      });
      break;

    case 'policies':
      manager.listAccessPolicies().then(policies => {
        console.log('Access Policies:');
        console.log(JSON.stringify(policies, null, 2));
      });
      break;

    default:
      console.log(`
Service Mesh Integration CLI

Usage:
  node service-mesh.js status --provider=istio      Get mesh status
  node service-mesh.js services --provider=consul   List services
  node service-mesh.js policies                     List access policies

Providers:
  istio   - Istio service mesh
  consul  - Consul service mesh
      `);
  }
}

// ========== Export ==========

module.exports = {
  ServiceMeshManager,
  ServiceMeshClient,
  IstioClient,
  ConsulClient,
  MeshProvider,
  ServiceEndpointType,
  createMeshClient,
  createMeshManager
};

// Run CLI if called directly
if (require.main === module) {
  runCLI();
}
