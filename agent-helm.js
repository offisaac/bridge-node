/**
 * Agent Helm - Helm Chart Manager
 *
 * Manages Helm charts, releases, and deployments.
 *
 * Usage: node agent-helm.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   releases   - List releases
 *   charts     - List charts
 */

class HelmChart {
  constructor(config) {
    this.name = config.name;
    this.version = config.version;
    this.repository = config.repository || 'local';
    this.description = config.description || '';
    this.values = config.values || {};
    this.dependencies = config.dependencies || [];
  }
}

class HelmRelease {
  constructor(config) {
    this.name = config.name;
    this.chart = config.chart;
    this.namespace = config.namespace || 'default';
    this.version = config.version || 1;
    this.status = config.status || 'deployed'; // deployed, failed, pending, uninstalled
    this.revision = config.revision || 1;
    this.values = config.values || {};
    this.manifest = config.manifest || '';
    this.upgradedAt = config.upgradedAt || null;
    this.createdAt = config.createdAt || new Date().toISOString();
  }
}

class HelmManager {
  constructor() {
    this.charts = new Map();
    this.releases = new Map();
    this.repositories = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample repositories
    const repos = [
      { name: 'stable', url: 'https://charts.helm.sh/stable' },
      { name: 'bitnami', url: 'https://charts.bitnami.com/bitnami' },
      { name: 'prometheus', url: 'https://prometheus-community.github.io/helm-charts' },
      { name: 'local', url: 'file:///charts' }
    ];

    repos.forEach(r => {
      this.repositories.set(r.name, r);
    });

    // Sample charts
    const charts = [
      { name: 'nginx-ingress', version: '4.7.0', repository: 'bitnami', description: 'Nginx Ingress Controller', dependencies: [] },
      { name: 'postgresql', version: '12.1.0', repository: 'bitnami', description: 'PostgreSQL Database', dependencies: [] },
      { name: 'redis', version: '17.3.0', repository: 'bitnami', description: 'Redis Cache', dependencies: [] },
      { name: 'prometheus', version: '25.0.0', repository: 'prometheus', description: 'Prometheus Monitoring', dependencies: ['alertmanager', 'node-exporter'] },
      { name: 'grafana', version: '6.57.0', repository: 'stable', description: 'Grafana Dashboard', dependencies: [] },
      { name: 'elasticsearch', version: '19.0.0', repository: 'bitnami', description: 'Elasticsearch', dependencies: ['kibana'] },
      { name: 'my-app', version: '1.0.0', repository: 'local', description: 'Custom Application Chart', dependencies: [] }
    ];

    charts.forEach(c => {
      const chart = new HelmChart(c);
      this.charts.set(`${chart.name}-${chart.version}`, chart);
    });

    // Sample releases
    const releases = [
      { name: 'nginx-prod', chart: 'nginx-ingress', namespace: 'ingress-prod', status: 'deployed', revision: 3, values: { replicaCount: 5 } },
      { name: 'nginx-staging', chart: 'nginx-ingress', namespace: 'ingress-staging', status: 'deployed', revision: 1, values: { replicaCount: 2 } },
      { name: 'postgres-main', chart: 'postgresql', namespace: 'database', status: 'deployed', revision: 5, values: { persistence: { size: '50Gi' } } },
      { name: 'redis-cache', chart: 'redis', namespace: 'cache', status: 'deployed', revision: 2, values: { cluster: { enabled: true } } },
      { name: 'monitoring', chart: 'prometheus', namespace: 'monitoring', status: 'deployed', revision: 1, values: { retention: '30d' } },
      { name: 'analytics-db', chart: 'elasticsearch', namespace: 'data', status: 'failed', revision: 2, values: { master: { replicas: 3 } } }
    ];

    releases.forEach(r => {
      const release = new HelmRelease(r);
      this.releases.set(release.name, release);
    });
  }

  // Add repository
  addRepository(name, url) {
    this.repositories.set(name, { name, url });
    return { name, url };
  }

  // List repositories
  listRepositories() {
    return Array.from(this.repositories.values());
  }

  // Search charts
  searchCharts(query) {
    return Array.from(this.charts.values())
      .filter(c => c.name.includes(query) || c.description.includes(query));
  }

  // Install release
  install(name, chartName, namespace = 'default', values = {}) {
    const chart = Array.from(this.charts.values()).find(c => c.name === chartName);
    if (!chart) {
      throw new Error(`Chart ${chartName} not found`);
    }

    const release = new HelmRelease({
      name,
      chart: chartName,
      namespace,
      values,
      status: 'pending'
    });

    // Simulate deployment
    release.status = 'deployed';
    release.manifest = this._generateManifest(chart, values);

    this.releases.set(name, release);
    return release;
  }

  // Upgrade release
  upgrade(name, values = {}) {
    const release = this.releases.get(name);
    if (!release) {
      throw new Error(`Release ${name} not found`);
    }

    release.revision += 1;
    release.version = release.revision;
    release.values = { ...release.values, ...values };
    release.upgradedAt = new Date().toISOString();
    release.status = 'deployed';

    return release;
  }

  // Rollback release
  rollback(name, revision = null) {
    const release = this.releases.get(name);
    if (!release) {
      throw new Error(`Release ${name} not found`);
    }

    const targetRevision = revision || release.revision - 1;
    release.revision = targetRevision;
    release.status = 'deployed';

    return release;
  }

  // Uninstall release
  uninstall(name) {
    const release = this.releases.get(name);
    if (!release) {
      throw new Error(`Release ${name} not found`);
    }

    release.status = 'uninstalled';
    return release;
  }

  // List releases
  listReleases(namespace = null) {
    let releases = Array.from(this.releases.values());

    if (namespace) {
      releases = releases.filter(r => r.namespace === namespace);
    }

    return releases;
  }

  // Get release
  getRelease(name) {
    return this.releases.get(name) || null;
  }

  // Get release history
  getHistory(name) {
    const release = this.releases.get(name);
    if (!release) {
      return [];
    }

    // Generate simulated history
    return Array.from({ length: release.revision }, (_, i) => ({
      revision: i + 1,
      chart: release.chart,
      status: i === release.revision - 1 ? 'deployed' : 'superseded',
      upgradedAt: new Date(Date.now() - (release.revision - i - 1) * 86400000).toISOString()
    }));
  }

  // Get chart values
  getValues(releaseName, all = false) {
    const release = this.releases.get(releaseName);
    if (!release) {
      throw new Error(`Release ${releaseName} not found`);
    }

    return all ? { ...release.values } : release.values;
  }

  // Template chart
  template(chartName, values = {}) {
    const chart = Array.from(this.charts.values()).find(c => c.name === chartName);
    if (!chart) {
      throw new Error(`Chart ${chartName} not found`);
    }

    return this._generateManifest(chart, values);
  }

  // Generate manifest (simulated)
  _generateManifest(chart, values) {
    return `# Helm Manifest for ${chart.name}
apiVersion: v1
kind: Deployment
metadata:
  name: ${chart.name}
  labels:
    app: ${chart.name}
    chart: ${chart.name}-${chart.version}
spec:
  replicas: ${values.replicaCount || 1}
  selector:
    matchLabels:
      app: ${chart.name}
  template:
    metadata:
      labels:
        app: ${chart.name}
    spec:
      containers:
      - name: ${chart.name}
        image: ${chart.repository}/${chart.name}:${chart.version}
        ports:
        - containerPort: 80`;
  }

  // Get statistics
  getStats() {
    const releases = Array.from(this.releases.values());

    return {
      totalReleases: releases.length,
      deployed: releases.filter(r => r.status === 'deployed').length,
      failed: releases.filter(r => r.status === 'failed').length,
      pending: releases.filter(r => r.status === 'pending').length,
      totalCharts: this.charts.size,
      totalRepos: this.repositories.size,
      namespaces: [...new Set(releases.map(r => r.namespace))].length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const helm = new HelmManager();

switch (command) {
  case 'demo':
    console.log('=== Agent Helm Demo\n');

    // 1. List repositories
    console.log('1. Helm Repositories:');
    const repos = helm.listRepositories();
    repos.forEach(r => {
      console.log(`   - ${r.name}: ${r.url}`);
    });

    // 2. List releases
    console.log('\n2. Helm Releases:');
    const releases = helm.listReleases();
    releases.forEach(r => {
      console.log(`   - ${r.name}: ${r.chart} [${r.status}] rev=${r.revision}`);
    });

    // 3. List by namespace
    console.log('\n3. Releases by Namespace:');
    const namespaces = ['default', 'ingress-prod', 'database', 'cache', 'monitoring', 'data'];
    namespaces.forEach(ns => {
      const nsReleases = helm.listReleases(ns);
      if (nsReleases.length > 0) {
        console.log(`   ${ns}: ${nsReleases.length} release(s)`);
      }
    });

    // 4. Install new release
    console.log('\n4. Install Release:');
    const installed = helm.install('my-web-app', 'nginx-ingress', 'web', {
      replicaCount: 3,
      service: { type: 'LoadBalancer' }
    });
    console.log(`   Installed: ${installed.name} (${installed.chart})`);
    console.log(`   Status: ${installed.status}`);

    // 5. Upgrade release
    console.log('\n5. Upgrade Release:');
    const upgraded = helm.upgrade('my-web-app', { replicaCount: 5 });
    console.log(`   Upgraded: ${upgraded.name} to revision ${upgraded.revision}`);

    // 6. Rollback release
    console.log('\n6. Rollback Release:');
    const rolledBack = helm.rollback('my-web-app', 1);
    console.log(`   Rolled back: ${rolledBack.name} to revision ${rolledBack.revision}`);

    // 7. Get release history
    console.log('\n7. Release History:');
    const history = helm.getHistory('postgres-main');
    history.forEach(h => {
      console.log(`   rev ${h.revision}: ${h.status} (${h.upgradedAt})`);
    });

    // 8. Get values
    console.log('\n8. Release Values:');
    const values = helm.getValues('nginx-prod');
    console.log(`   ${JSON.stringify(values)}`);

    // 9. Template chart
    console.log('\n9. Template Chart:');
    const manifest = helm.template('my-app', { replicaCount: 2 });
    console.log(`   Generated manifest (${manifest.split('\n').length} lines)`);

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const stats = helm.getStats();
    console.log(`    Releases: ${stats.deployed} deployed / ${stats.totalReleases} total`);
    console.log(`    Failed: ${stats.failed}`);
    console.log(`    Charts: ${stats.totalCharts}`);
    console.log(`    Repositories: ${stats.totalRepos}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'releases':
    console.log('Helm Releases:');
    helm.listReleases().forEach(r => {
      console.log(`  ${r.name}: ${r.chart} [${r.status}]`);
    });
    break;

  case 'charts':
    console.log('Available Charts:');
    helm.listRepositories().forEach(repo => {
      const repoCharts = Array.from(helm.charts.values()).filter(c => c.repository === repo.name);
      if (repoCharts.length > 0) {
        console.log(`  ${repo.name}:`);
        repoCharts.forEach(c => {
          console.log(`    - ${c.name}:${c.version} - ${c.description}`);
        });
      }
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-helm.js [demo|releases|charts]');
}
