/**
 * Agent Ingress2 - Kubernetes Ingress Management Agent
 *
 * Ingress routing, TLS, annotations, path rules.
 *
 * Usage: node agent-ingress2.js [command]
 * Commands:
 *   demo      - Run demonstration
 *   routing   - Show routing features
 *   tls       - Show TLS features
 */

class IngressRule {
  constructor(host) {
    this.host = host;
    this.paths = [];
  }

  addPath(path, serviceName, servicePort) {
    this.paths.push({
      path,
      serviceName,
      servicePort,
      backend: {
        service: { name: serviceName, port: { number: servicePort } }
      }
    });
    return this;
  }
}

class IngressTLS {
  constructor(secretName, hosts) {
    this.secretName = secretName;
    this.hosts = hosts;
  }
}

class IngressAnnotation {
  constructor(key, value) {
    this.key = key;
    this.value = value;
  }
}

class K8sIngress {
  constructor(name, namespace) {
    this.name = name;
    this.namespace = namespace;
    this.rules = [];
    this.tls = [];
    this.annotations = [];
    this.defaultBackend = null;
    this.ingressClassName = null;
    this.created = Date.now();
  }

  addRule(host, path, serviceName, servicePort) {
    const rule = new IngressRule(host);
    rule.addPath(path, serviceName, servicePort);
    this.rules.push(rule);
    return this;
  }

  addTLS(secretName, hosts) {
    this.tls.push(new IngressTLS(secretName, hosts));
    return this;
  }

  addAnnotation(key, value) {
    this.annotations.push(new IngressAnnotation(key, value));
    return this;
  }
}

class IngressAgent {
  constructor() {
    this.ingresses = new Map();
    this.stats = {
      total: 0,
      withTLS: 0,
      withAnnotations: 0
    };
  }

  createIngress(name, namespace, spec = {}) {
    const ingress = new K8sIngress(name, namespace);
    ingress.ingressClassName = spec.ingressClassName || 'nginx';

    if (spec.rules) {
      spec.rules.forEach(rule => {
        ingress.addRule(rule.host, rule.path, rule.serviceName, rule.servicePort);
      });
    }

    if (spec.tls) {
      spec.tls.forEach(t => {
        ingress.addTLS(t.secretName, t.hosts);
      });
    }

    if (spec.annotations) {
      Object.entries(spec.annotations).forEach(([key, value]) => {
        ingress.addAnnotation(key, value);
      });
    }

    if (spec.defaultBackend) {
      ingress.defaultBackend = spec.defaultBackend;
    }

    this.ingresses.set(`${namespace}/${name}`, ingress);
    this.stats.total++;

    if (ingress.tls.length > 0) this.stats.withTLS++;
    if (ingress.annotations.length > 0) this.stats.withAnnotations++;

    console.log(`   Created ingress: ${namespace}/${name}`);
    return ingress;
  }

  getIngress(name, namespace) {
    return this.ingresses.get(`${namespace}/${name}`);
  }

  listIngresses(namespace = null) {
    const all = Array.from(this.ingresses.values());
    return namespace ? all.filter(i => i.namespace === namespace) : all;
  }

  // Add rules
  addRule(name, namespace, host, path, serviceName, servicePort) {
    const ingress = this.ingresses.get(`${namespace}/${name}`);
    if (!ingress) throw new Error(`Ingress ${namespace}/${name} not found`);

    ingress.addRule(host, path, serviceName, servicePort);
    console.log(`   Added rule: ${host}${path} -> ${serviceName}:${servicePort}`);
    return ingress;
  }

  // Remove rules
  removeRule(name, namespace, host, path) {
    const ingress = this.ingresses.get(`${namespace}/${name}`);
    if (!ingress) throw new Error(`Ingress ${namespace}/${name} not found`);

    const rule = ingress.rules.find(r => r.host === host);
    if (rule) {
      rule.paths = rule.paths.filter(p => p.path !== path);
    }
    console.log(`   Removed rule: ${host}${path}`);
    return ingress;
  }

  // TLS
  addTLS(name, namespace, secretName, hosts) {
    const ingress = this.ingresses.get(`${namespace}/${name}`);
    if (!ingress) throw new Error(`Ingress ${namespace}/${name} not found`);

    ingress.addTLS(secretName, hosts);
    this.stats.withTLS++;
    console.log(`   Added TLS: ${secretName}`);
    return ingress;
  }

  removeTLS(name, namespace, secretName) {
    const ingress = this.ingresses.get(`${namespace}/${name}`);
    if (!ingress) throw new Error(`Ingress ${namespace}/${name} not found`);

    ingress.tls = ingress.tls.filter(t => t.secretName !== secretName);
    this.stats.withTLS--;
    console.log(`   Removed TLS: ${secretName}`);
    return ingress;
  }

  // Annotations
  setAnnotation(name, namespace, key, value) {
    const ingress = this.ingresses.get(`${namespace}/${name}`);
    if (!ingress) throw new Error(`Ingress ${namespace}/${name} not found`);

    const existing = ingress.annotations.find(a => a.key === key);
    if (existing) {
      existing.value = value;
    } else {
      ingress.addAnnotation(key, value);
    }

    if (ingress.annotations.length > 0 && this.stats.withAnnotations === 0) {
      this.stats.withAnnotations++;
    }

    console.log(`   Set annotation: ${key}=${value}`);
    return ingress;
  }

  getAnnotations(name, namespace) {
    const ingress = this.ingresses.get(`${namespace}/${name}`);
    if (!ingress) throw new Error(`Ingress ${namespace}/${name} not found`);

    return ingress.annotations.map(a => ({ key: a.key, value: a.value }));
  }

  // Status
  getStatus(name, namespace) {
    const ingress = this.ingresses.get(`${namespace}/${name}`);
    if (!ingress) throw new Error(`Ingress ${namespace}/${name} not found`);

    return {
      name: ingress.name,
      namespace: ingress.namespace,
      ingressClassName: ingress.ingressClassName,
      rules: ingress.rules.map(r => ({
        host: r.host,
        paths: r.paths.map(p => ({
          path: p.path,
          serviceName: p.serviceName,
          servicePort: p.servicePort
        }))
      })),
      tls: ingress.tls.map(t => ({ secretName: t.secretName, hosts: t.hosts })),
      annotations: ingress.annotations.map(a => ({ key: a.key, value: a.value }))
    };
  }

  // Delete
  deleteIngress(name, namespace) {
    const key = `${namespace}/${name}`;
    if (this.ingresses.delete(key)) {
      this.stats.total--;
      return { deleted: true };
    }
    throw new Error(`Ingress ${namespace}/${name} not found`);
  }

  // Stats
  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new IngressAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Ingress2 Demo\n');

    // 1. Create ingresses
    console.log('1. Ingress Creation:');
    agent.createIngress('web-ingress', 'production', {
      ingressClassName: 'nginx',
      rules: [
        { host: 'example.com', path: '/', serviceName: 'web-svc', servicePort: 80 },
        { host: 'example.com', path: '/api', serviceName: 'api-svc', servicePort: 8080 },
        { host: 'api.example.com', path: '/', serviceName: 'api-svc', servicePort: 8080 }
      ],
      tls: [
        { secretName: 'example-tls', hosts: ['example.com', 'api.example.com'] }
      ],
      annotations: {
        'nginx.ingress.kubernetes.io/rewrite-target': '/',
        'nginx.ingress.kubernetes.io/ssl-redirect': 'true'
      }
    });

    agent.createIngress('app-ingress', 'production', {
      ingressClassName: 'nginx',
      rules: [
        { host: 'app.example.com', path: '/', serviceName: 'app-svc', servicePort: 3000 }
      ],
      tls: [
        { secretName: 'app-tls', hosts: ['app.example.com'] }
      ]
    });

    agent.createIngress('default-backend', 'production', {
      ingressClassName: 'nginx',
      defaultBackend: { serviceName: 'default-svc', servicePort: 80 }
    });

    console.log(`   Total ingresses: ${agent.ingresses.size}`);

    // 2. Add rules
    console.log('\n2. Rule Management:');
    agent.addRule('web-ingress', 'production', 'example.com', '/admin', 'admin-svc', 8080);

    // 3. Remove rules
    console.log('\n3. Remove Rules:');
    agent.removeRule('web-ingress', 'production', 'example.com', '/admin');

    // 4. TLS management
    console.log('\n4. TLS Management:');
    agent.addTLS('app-ingress', 'production', 'app-wildcard-tls', ['*.example.com']);

    // 5. Annotations
    console.log('\n5. Annotations:');
    agent.setAnnotation('web-ingress', 'production', 'nginx.ingress.kubernetes.io/proxy-read-timeout', '300');
    const annotations = agent.getAnnotations('web-ingress', 'production');
    console.log(`   Annotation count: ${annotations.length}`);

    // 6. Status
    console.log('\n6. Ingress Status:');
    const status = agent.getStatus('web-ingress', 'production');
    console.log(`   Class: ${status.ingressClassName}`);
    console.log(`   Rules: ${status.rules.length}`);
    console.log(`   TLS: ${status.tls.length}`);

    // 7. List
    console.log('\n7. Listing:');
    const list = agent.listIngresses('production');
    console.log(`   Production ingresses: ${list.length}`);

    // 8. Statistics
    console.log('\n8. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total: ${stats.total}`);
    console.log(`   With TLS: ${stats.withTLS}`);
    console.log(`   With Annotations: ${stats.withAnnotations}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'routing':
    console.log('Routing Features:');
    console.log('  - Host-based routing');
    console.log('  - Path-based routing');
    console.log('  - Path rewrite');
    console.log('  - Header-based routing');
    console.log('  - HTTP/WS/TCP routing');
    break;

  case 'tls':
    console.log('TLS Features:');
    console.log('  - TLS termination');
    console.log('  - TLS passthrough');
    console.log('  - Multiple certificates');
    console.log('  - Certificate management');
    console.log('  - Redirect HTTP to HTTPS');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-ingress2.js [demo|routing|tls]');
}
