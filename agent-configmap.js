/**
 * Agent ConfigMap - Kubernetes ConfigMap Management Agent
 *
 * ConfigMap lifecycle, data management, versioning.
 *
 * Usage: node agent-configmap.js [command]
 * Commands:
 *   demo      - Run demonstration
 *   data      - Show data types
 *   usage     - Show usage patterns
 */

class ConfigMapData {
  constructor() {
    this.stringData = {};
    this.binaryData = {};
  }

  addKey(key, value) {
    this.stringData[key] = value;
    return this;
  }

  addFromFile(key, filename) {
    this.stringData[key] = `[from file: ${filename}]`;
    return this;
  }

  addFromLiteral(key, value) {
    return this.addKey(key, value);
  }
}

class ConfigMapVersion {
  constructor(version, data) {
    this.version = version;
    this.data = { ...data };
    this.created = Date.now();
  }
}

class K8sConfigMap {
  constructor(name, namespace) {
    this.name = name;
    this.namespace = namespace;
    this.data = new ConfigMapData();
    this.binaryData = {};
    this.immutable = false;
    this.labels = {};
    this.annotations = {};
    this.versionHistory = [];
    this.created = Date.now();
    this.updated = null;
  }

  addData(key, value) {
    this.data.addKey(key, value);
    this.updated = Date.now();
    return this;
  }
}

class ConfigMapAgent {
  constructor() {
    this.configmaps = new Map();
    this.stats = {
      total: 0,
      immutable: 0,
      withVersions: 0
    };
  }

  createConfigMap(name, namespace, data = {}) {
    const cm = new K8sConfigMap(name, namespace);

    Object.entries(data).forEach(([key, value]) => {
      cm.addData(key, value);
    });

    this.configmaps.set(`${namespace}/${name}`, cm);
    this.stats.total++;

    console.log(`   Created ConfigMap: ${namespace}/${name}`);
    return cm;
  }

  getConfigMap(name, namespace) {
    return this.configmaps.get(`${namespace}/${name}`);
  }

  listConfigMaps(namespace = null) {
    const all = Array.from(this.configmaps.values());
    return namespace ? all.filter(cm => cm.namespace === namespace) : all;
  }

  // Update data
  setData(name, namespace, key, value) {
    const cm = this.configmaps.get(`${namespace}/${name}`);
    if (!cm) throw new Error(`ConfigMap ${namespace}/${name} not found`);

    // Save version before update
    if (!cm.immutable) {
      cm.versionHistory.push(new ConfigMapVersion(cm.versionHistory.length + 1, cm.data.stringData));
      if (cm.versionHistory.length > 1 && this.stats.withVersions === 0) {
        this.stats.withVersions++;
      }
    }

    cm.addData(key, value);
    console.log(`   Set data: ${namespace}/${name}[${key}]`);
    return cm;
  }

  removeData(name, namespace, key) {
    const cm = this.configmaps.get(`${namespace}/${name}`);
    if (!cm) throw new Error(`ConfigMap ${namespace}/${name} not found`);

    if (cm.immutable) throw new Error('Cannot modify immutable ConfigMap');

    delete cm.data.stringData[key];
    cm.updated = Date.now();

    console.log(`   Removed data: ${namespace}/${name}[${key}]`);
    return cm;
  }

  getData(name, namespace, key) {
    const cm = this.configmaps.get(`${namespace}/${name}`);
    if (!cm) throw new Error(`ConfigMap ${namespace}/${name} not found`);

    return cm.data.stringData[key] || null;
  }

  // Immutable
  makeImmutable(name, namespace) {
    const cm = this.configmaps.get(`${namespace}/${name}`);
    if (!cm) throw new Error(`ConfigMap ${namespace}/${name} not found`);

    cm.immutable = true;
    this.stats.immutable++;
    console.log(`   Made immutable: ${namespace}/${name}`);
    return cm;
  }

  // Labels and annotations
  setLabel(name, namespace, key, value) {
    const cm = this.configmaps.get(`${namespace}/${name}`);
    if (!cm) throw new Error(`ConfigMap ${namespace}/${name} not found`);

    cm.labels[key] = value;
    console.log(`   Set label: ${namespace}/${name} ${key}=${value}`);
    return cm;
  }

  setAnnotation(name, namespace, key, value) {
    const cm = this.configmaps.get(`${namespace}/${name}`);
    if (!cm) throw new Error(`ConfigMap ${namespace}/${name} not found`);

    cm.annotations[key] = value;
    console.log(`   Set annotation: ${namespace}/${name} ${key}=${value}`);
    return cm;
  }

  // Version history
  getVersionHistory(name, namespace) {
    const cm = this.configmaps.get(`${namespace}/${name}`);
    if (!cm) throw new Error(`ConfigMap ${namespace}/${name} not found`);

    return cm.versionHistory;
  }

  rollbackToVersion(name, namespace, version) {
    const cm = this.configmaps.get(`${namespace}/${name}`);
    if (!cm) throw new Error(`ConfigMap ${namespace}/${name} not found`);

    const targetVersion = cm.versionHistory.find(v => v.version === version);
    if (!targetVersion) throw new Error(`Version ${version} not found`);

    cm.data.stringData = { ...targetVersion.data };
    cm.updated = Date.now();

    console.log(`   Rolled back to version ${version}: ${namespace}/${name}`);
    return cm;
  }

  // Status
  getStatus(name, namespace) {
    const cm = this.configmaps.get(`${namespace}/${name}`);
    if (!cm) throw new Error(`ConfigMap ${namespace}/${name} not found`);

    return {
      name: cm.name,
      namespace: cm.namespace,
      data: { ...cm.data.stringData },
      immutable: cm.immutable,
      labels: { ...cm.labels },
      annotations: { ...cm.annotations },
      versionCount: cm.versionHistory.length,
      created: cm.created,
      updated: cm.updated
    };
  }

  // Watch (simulated)
  watch(name, namespace, callback) {
    const cm = this.configmaps.get(`${namespace}/${name}`);
    if (!cm) throw new Error(`ConfigMap ${namespace}/${name} not found`);

    // Simulate watching
    console.log(`   Watching: ${namespace}/${name}`);
    return { stop: () => console.log(`   Stopped watching: ${namespace}/${name}`) };
  }

  // Delete
  deleteConfigMap(name, namespace) {
    const key = `${namespace}/${name}`;
    if (this.configmaps.delete(key)) {
      this.stats.total--;
      if (this.stats.immutable > 0) this.stats.immutable--;
      return { deleted: true };
    }
    throw new Error(`ConfigMap ${namespace}/${name} not found`);
  }

  // Stats
  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new ConfigMapAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent ConfigMap Demo\n');

    // 1. Create ConfigMaps
    console.log('1. ConfigMap Creation:');
    agent.createConfigMap('app-config', 'production', {
      'database-url': 'postgres://db:5432',
      'cache-enabled': 'true',
      'log-level': 'info'
    });

    agent.createConfigMap('feature-flags', 'production', {
      'new-ui': 'false',
      'beta-features': 'true',
      'maintenance-mode': 'false'
    });

    agent.createConfigMap('nginx-config', 'production', {
      'nginx.conf': 'server { listen 80; }',
      'mime.types': 'types { text/plain txt; }'
    });

    agent.createConfigMap('env-config', 'production', {
      'ENV': 'production',
      'DEBUG': 'false'
    });

    console.log(`   Total ConfigMaps: ${agent.configmaps.size}`);

    // 2. Update data
    console.log('\n2. Data Management:');
    agent.setData('app-config', 'production', 'database-url', 'postgres://db-replica:5432');
    agent.setData('app-config', 'production', 'max-connections', '100');

    // 3. Remove data
    console.log('\n3. Remove Data:');
    agent.removeData('app-config', 'production', 'cache-enabled');

    // 4. Immutable
    console.log('\n4. Immutable ConfigMaps:');
    agent.makeImmutable('feature-flags', 'production');

    // 5. Labels and annotations
    console.log('\n5. Labels & Annotations:');
    agent.setLabel('app-config', 'production', 'app', 'myapp');
    agent.setLabel('app-config', 'production', 'env', 'prod');
    agent.setAnnotation('app-config', 'production', 'description', 'Main application config');

    // 6. Get data
    console.log('\n6. Get Data:');
    const dbUrl = agent.getData('app-config', 'production', 'database-url');
    console.log(`   database-url: ${dbUrl}`);

    // 7. Version history
    console.log('\n7. Version History:');
    const history = agent.getVersionHistory('app-config', 'production');
    console.log(`   Versions: ${history.length}`);

    // 8. Rollback
    console.log('\n8. Rollback:');
    agent.rollbackToVersion('app-config', 'production', 1);

    // 9. Status
    console.log('\n9. Status:');
    const status = agent.getStatus('app-config', 'production');
    console.log(`   Immutable: ${status.immutable}`);
    console.log(`   Labels: ${Object.keys(status.labels).length}`);
    console.log(`   Data keys: ${Object.keys(status.data).length}`);

    // 10. List
    console.log('\n10. Listing:');
    const list = agent.listConfigMaps('production');
    console.log(`   Production ConfigMaps: ${list.length}`);

    // 11. Statistics
    console.log('\n11. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total: ${stats.total}`);
    console.log(`   Immutable: ${stats.immutable}`);
    console.log(`   With Versions: ${stats.withVersions}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'data':
    console.log('Data Types:');
    console.log('  - stringData: Plain text key-value pairs');
    console.log('  - binaryData: Base64 encoded binary data');
    console.log('  - from-file: Load data from files');
    console.log('  - from-literal: Define key-value from CLI');
    break;

  case 'usage':
    console.log('Usage Patterns:');
    console.log('  - Environment variables');
    console.log('  - Command-line arguments');
    console.log('  - Configuration files');
    console.log('  - Volume mounts');
    console.log('  - Pod specs');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-configmap.js [demo|data|usage]');
}
