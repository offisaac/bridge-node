/**
 * Agent Service - Kubernetes Service Management Agent
 *
 * Service types, discovery, load balancing, ingress.
 *
 * Usage: node agent-service.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   types      - Show service types
 *   discovery  - Show discovery features
 */

class ServiceType {
  static CLUSTER_IP = 'ClusterIP';
  static NODE_PORT = 'NodePort';
  static LOAD_BALANCER = 'LoadBalancer';
  static EXTERNAL_NAME = 'ExternalName';
}

class ServicePort {
  constructor(name, port, targetPort, protocol = 'TCP') {
    this.name = name;
    this.port = port;
    this.targetPort = targetPort;
    this.protocol = protocol;
  }
}

class Endpoint {
  constructor(address, ports) {
    this.address = address;
    this.ports = ports;
    this.targetRef = null;
    this.notReadyAddresses = [];
  }
}

class IngressRule {
  constructor(host, path) {
    this.host = host;
    this.path = path;
    this.backend = null;
  }

  withBackend(serviceName, servicePort) {
    this.backend = { serviceName, servicePort };
    return this;
  }
}

class Ingress {
  constructor(name, namespace) {
    this.name = name;
    this.namespace = namespace;
    this.rules = [];
    this.tls = [];
    this.created = Date.now();
  }

  addRule(host, path, backend) {
    const rule = new IngressRule(host, path);
    if (backend) {
      rule.withBackend(backend.serviceName, backend.servicePort);
    }
    this.rules.push(rule);
    return this;
  }
}

class K8sService {
  constructor(name, namespace, spec) {
    this.name = name;
    this.namespace = namespace;
    this.spec = spec;
    this.clusterIP = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.1`;
    this.clusterIPs = [this.clusterIP];
    this.externalIPs = [];
    this.loadBalancerIP = null;
    this.created = Date.now();
    this.endpoints = [];
  }

  getSelector() {
    return this.spec.selector || {};
  }

  isHeadless() {
    return this.clusterIP === 'None';
  }
}

class ServiceAgent {
  constructor() {
    this.services = new Map();
    this.endpoints = new Map();
    this.ingresses = new Map();
    this.dnsRecords = new Map();
    this.stats = {
      clusterIP: 0,
      nodePort: 0,
      loadBalancer: 0,
      externalName: 0,
      ingresses: 0
    };
  }

  // Service operations
  createService(name, namespace, spec) {
    const service = new K8sService(name, namespace, spec);
    this.services.set(`${namespace}/${name}`, service);

    // Track by type
    switch (spec.type) {
      case ServiceType.CLUSTER_IP:
        this.stats.clusterIP++;
        break;
      case ServiceType.NODE_PORT:
        this.stats.nodePort++;
        break;
      case ServiceType.LOAD_BALANCER:
        this.stats.loadBalancer++;
        break;
      case ServiceType.EXTERNAL_NAME:
        this.stats.externalName++;
        break;
    }

    // Create DNS record
    this.dnsRecords.set(`${name}.${namespace}.svc.cluster.local`, {
      type: 'A',
      value: service.clusterIP,
      service: name
    });

    console.log(`   Created service: ${namespace}/${name} (${spec.type})`);
    return service;
  }

  getService(name, namespace) {
    return this.services.get(`${namespace}/${name}`);
  }

  listServices(namespace = null) {
    const services = Array.from(this.services.values());
    if (namespace) {
      return services.filter(s => s.namespace === namespace);
    }
    return services;
  }

  deleteService(name, namespace) {
    const key = `${namespace}/${name}`;
    const service = this.services.get(key);
    if (!service) throw new Error(`Service ${namespace}/${name} not found`);

    // Update stats
    switch (service.spec.type) {
      case ServiceType.CLUSTER_IP:
        this.stats.clusterIP--;
        break;
      case ServiceType.NODE_PORT:
        this.stats.nodePort--;
        break;
      case ServiceType.LOAD_BALANCER:
        this.stats.loadBalancer--;
        break;
      case ServiceType.EXTERNAL_NAME:
        this.stats.externalName--;
        break;
    }

    this.dnsRecords.delete(`${name}.${namespace}.svc.cluster.local`);
    this.services.delete(key);
    return { deleted: true };
  }

  // Endpoint operations
  createEndpoints(name, namespace, addresses) {
    const endpoints = new Endpoint(addresses[0], [80, 8080]);
    endpoints.targetRef = {
      kind: 'Pod',
      name: name,
      namespace: namespace
    };
    this.endpoints.set(`${namespace}/${name}`, endpoints);
    console.log(`   Created endpoints: ${namespace}/${name}`);
    return endpoints;
  }

  updateEndpoints(name, namespace, addresses) {
    const endpoints = this.endpoints.get(`${namespace}/${name}`);
    if (!endpoints) throw new Error(`Endpoints ${namespace}/${name} not found`);
    endpoints.addresses = addresses;
    console.log(`   Updated endpoints: ${namespace}/${name}`);
    return endpoints;
  }

  getEndpoints(name, namespace) {
    return this.endpoints.get(`${namespace}/${name}`);
  }

  // Service discovery
  discoverServices(namespace = null) {
    const allServices = Array.from(this.services.values());
    const services = namespace
      ? allServices.filter(s => s.namespace === namespace)
      : allServices;

    return services.map(s => ({
      name: s.name,
      namespace: s.namespace,
      clusterIP: s.clusterIP,
      ports: s.spec.ports ? s.spec.ports.map(p => ({ name: p.name, port: p.port })) : [],
      selector: s.getSelector ? s.getSelector() : {}
    }));
  }

  // DNS
  getDNSRecord(name, namespace) {
    return this.dnsRecords.get(`${name}.${namespace}.svc.cluster.local`);
  }

  listDNSRecords() {
    return Array.from(this.dnsRecords.entries()).map(([name, record]) => ({
      name,
      ...record
    }));
  }

  // Ingress operations
  createIngress(name, namespace, spec = {}) {
    const ingress = new Ingress(name, namespace);

    if (spec.rules) {
      spec.rules.forEach(rule => {
        ingress.addRule(rule.host, rule.path, rule.backend);
      });
    }

    if (spec.tls) {
      ingress.tls = spec.tls;
    }

    this.ingresses.set(`${namespace}/${name}`, ingress);
    this.stats.ingresses++;
    console.log(`   Created ingress: ${namespace}/${name}`);
    return ingress;
  }

  getIngress(name, namespace) {
    return this.ingresses.get(`${namespace}/${name}`);
  }

  listIngresses(namespace = null) {
    const ingresses = Array.from(this.ingresses.values());
    if (namespace) {
      return ingresses.filter(i => i.namespace === namespace);
    }
    return ingresses;
  }

  deleteIngress(name, namespace) {
    const key = `${namespace}/${name}`;
    if (this.ingresses.delete(key)) {
      this.stats.ingresses--;
      return { deleted: true };
    }
    throw new Error(`Ingress ${namespace}/${name} not found`);
  }

  // Load balancing
  getServiceEndpoints(name, namespace) {
    const service = this.services.get(`${namespace}/${name}`);
    if (!service) throw new Error(`Service ${namespace}/${name} not found`);

    // In real K8s, this would return actual endpoints
    return {
      endpoints: [
        { address: `10.244.0.${Math.floor(Math.random() * 254) + 1}`, ports: [80] },
        { address: `10.244.0.${Math.floor(Math.random() * 254) + 1}`, ports: [80] }
      ],
      notReady: []
    };
  }

  // Service topology
  getServiceTopology() {
    return {
      services: this.services.size,
      endpoints: this.endpoints.size,
      ingresses: this.ingresses.size,
      dnsRecords: this.dnsRecords.size
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const serviceAgent = new ServiceAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Service Demo\n');

    // 1. Create ClusterIP services
    console.log('1. ClusterIP Services:');
    serviceAgent.createService('web-svc', 'production', {
      type: ServiceType.CLUSTER_IP,
      selector: { app: 'web' },
      ports: [
        { name: 'http', port: 80, targetPort: 8080 },
        { name: 'https', port: 443, targetPort: 8443 }
      ]
    });

    serviceAgent.createService('api-svc', 'production', {
      type: ServiceType.CLUSTER_IP,
      selector: { app: 'api' },
      ports: [
        { name: 'grpc', port: 8080, targetPort: 8080 },
        { name: 'metrics', port: 9090, targetPort: 9090 }
      ]
    });

    serviceAgent.createService('headless-svc', 'production', {
      type: ServiceType.CLUSTER_IP,
      clusterIP: 'None',
      selector: { app: 'stateful' },
      ports: [
        { name: 'data', port: 5432, targetPort: 5432 }
      ]
    });

    // 2. Create NodePort service
    console.log('\n2. NodePort Service:');
    serviceAgent.createService('admin-svc', 'production', {
      type: ServiceType.NODE_PORT,
      selector: { app: 'admin' },
      ports: [
        { name: 'http', port: 80, targetPort: 8080, nodePort: 30080 }
      ]
    });

    // 3. Create LoadBalancer service
    console.log('\n3. LoadBalancer Service:');
    serviceAgent.createService('lb-svc', 'production', {
      type: ServiceType.LOAD_BALANCER,
      selector: { app: 'public' },
      ports: [
        { name: 'http', port: 80, targetPort: 8080 },
        { name: 'https', port: 443, targetPort: 8443 }
      ],
      loadBalancerIP: '203.0.113.10'
    });

    // 4. Create ExternalName service
    console.log('\n4. ExternalName Service:');
    serviceAgent.createService('external-db', 'production', {
      type: ServiceType.EXTERNAL_NAME,
      externalName: 'db.example.com'
    });

    // 5. Create endpoints
    console.log('\n5. Endpoint Management:');
    serviceAgent.createEndpoints('web-svc', 'production', [
      '10.244.0.5',
      '10.244.0.6'
    ]);
    serviceAgent.createEndpoints('api-svc', 'production', [
      '10.244.1.5',
      '10.244.1.6',
      '10.244.1.7'
    ]);

    // 6. Service discovery
    console.log('\n6. Service Discovery:');
    const discovered = serviceAgent.discoverServices('production');
    console.log(`   Found ${discovered.length} services in production`);

    // 7. DNS records
    console.log('\n7. DNS Records:');
    const dnsRecords = serviceAgent.listDNSRecords();
    dnsRecords.forEach(r => console.log(`   ${r.name} -> ${r.value}`));

    // 8. Create Ingress
    console.log('\n8. Ingress Management:');
    serviceAgent.createIngress('main-ingress', 'production', {
      rules: [
        {
          host: 'example.com',
          path: '/api',
          backend: { serviceName: 'api-svc', servicePort: 8080 }
        },
        {
          host: 'example.com',
          path: '/',
          backend: { serviceName: 'web-svc', servicePort: 80 }
        }
      ],
      tls: [{ secretName: 'example-tls', hosts: ['example.com'] }]
    });

    const ingresses = serviceAgent.listIngresses('production');
    console.log(`   Total ingresses: ${ingresses.length}`);

    // 9. Load balancing
    console.log('\n9. Load Balancing:');
    const lbEndpoints = serviceAgent.getServiceEndpoints('web-svc', 'production');
    console.log(`   web-svc endpoints: ${lbEndpoints.endpoints.length}`);

    // 10. Topology
    console.log('\n10. Service Topology:');
    const topology = serviceAgent.getServiceTopology();
    console.log(`   Services: ${topology.services}`);
    console.log(`   Endpoints: ${topology.endpoints}`);
    console.log(`   Ingresses: ${topology.ingresses}`);
    console.log(`   DNS Records: ${topology.dnsRecords}`);

    // 11. Statistics
    console.log('\n11. Statistics:');
    const stats = serviceAgent.getStats();
    console.log(`   ClusterIP: ${stats.clusterIP}`);
    console.log(`   NodePort: ${stats.nodePort}`);
    console.log(`   LoadBalancer: ${stats.loadBalancer}`);
    console.log(`   ExternalName: ${stats.externalName}`);
    console.log(`   Ingresses: ${stats.ingresses}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'types':
    console.log('Service Types:');
    console.log('  - ClusterIP: Internal cluster IP');
    console.log('  - NodePort: Exposes on each node port');
    console.log('  - LoadBalancer: External load balancer');
    console.log('  - ExternalName: Maps to external DNS');
    break;

  case 'discovery':
    console.log('Service Discovery:');
    console.log('  - Kubernetes DNS (kube-dns/CoreDNS)');
    console.log('  - Service name resolution');
    console.log('  - Headless services for pod discovery');
    console.log('  - Endpoint slices for scalable endpoints');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-service.js [demo|types|discovery]');
}
