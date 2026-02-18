/**
 * Agent Runtime - Runtime Environment Manager
 *
 * Manages runtime environments, containers, and resource allocation.
 *
 * Usage: node agent-runtime.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   status     - Show runtime status
 *   instances  - List runtime instances
 */

class RuntimeInstance {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type; // container, vm, function, process
    this.image = config.image || null;
    this.status = config.status || 'stopped';
    this.resources = config.resources || { cpu: '1', memory: '512Mi' };
    this.env = config.env || {};
    this.ports = config.ports || [];
    this.volumes = config.volumes || [];
    this.startedAt = config.startedAt || null;
    this.restartCount = config.restartCount || 0;
  }
}

class RuntimeEnvironment {
  constructor() {
    this.instances = new Map();
    this.images = new Map();
    this.templates = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample runtime instances
    const instances = [
      {
        name: 'api-server',
        type: 'container',
        image: 'nginx:latest',
        status: 'running',
        resources: { cpu: '2', memory: '1Gi' },
        ports: [{ container: 80, host: 8080 }],
        startedAt: '2026-02-17T10:00:00Z',
        restartCount: 0
      },
      {
        name: 'worker-1',
        type: 'container',
        image: 'worker:latest',
        status: 'running',
        resources: { cpu: '4', memory: '2Gi' },
        env: { WORKER_ID: '1', MODE: 'async' },
        startedAt: '2026-02-17T08:00:00Z',
        restartCount: 2
      },
      {
        name: 'worker-2',
        type: 'container',
        image: 'worker:latest',
        status: 'running',
        resources: { cpu: '4', memory: '2Gi' },
        env: { WORKER_ID: '2', MODE: 'async' },
        startedAt: '2026-02-17T08:00:00Z',
        restartCount: 1
      },
      {
        name: 'db-proxy',
        type: 'vm',
        image: null,
        status: 'running',
        resources: { cpu: '2', memory: '4Gi' },
        startedAt: '2026-02-16T12:00:00Z',
        restartCount: 0
      },
      {
        name: 'payment-fn',
        type: 'function',
        image: 'payment-handler:v2',
        status: 'idle',
        resources: { cpu: '0.5', memory: '256Mi' },
        startedAt: null,
        restartCount: 0
      },
      {
        name: 'analytics-worker',
        type: 'process',
        image: null,
        status: 'stopped',
        resources: { cpu: '8', memory: '8Gi' },
        startedAt: null,
        restartCount: 5
      }
    ];

    instances.forEach(i => {
      const instance = new RuntimeInstance(i);
      this.instances.set(instance.id, instance);
    });

    // Sample images
    const images = [
      { name: 'nginx:latest', size: '140MB', pulls: 1000000 },
      { name: 'worker:latest', size: '350MB', pulls: 500000 },
      { name: 'payment-handler:v2', size: '50MB', pulls: 100000 },
      { name: 'api-server:v3', size: '200MB', pulls: 250000 }
    ];

    images.forEach(img => {
      this.images.set(img.name, img);
    });

    // Sample templates
    const templates = [
      { name: 'web-server', type: 'container', resources: { cpu: '1', memory: '512Mi' }, ports: [80, 443] },
      { name: 'background-worker', type: 'container', resources: { cpu: '2', memory: '1Gi' }, env: { MODE: 'worker' } },
      { name: 'light-function', type: 'function', resources: { cpu: '0.25', memory: '128Mi' } },
      { name: 'heavy-worker', type: 'vm', resources: { cpu: '8', memory: '16Gi' } }
    ];

    templates.forEach(t => {
      this.templates.set(t.name, t);
    });
  }

  // Create instance
  createInstance(name, type, config = {}) {
    const instance = new RuntimeInstance({ name, type, ...config });
    this.instances.set(instance.id, instance);
    return instance;
  }

  // Start instance
  start(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    instance.status = 'running';
    instance.startedAt = new Date().toISOString();

    return instance;
  }

  // Stop instance
  stop(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    instance.status = 'stopped';
    instance.startedAt = null;

    return instance;
  }

  // Restart instance
  restart(instanceId) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    instance.restartCount += 1;
    instance.startedAt = new Date().toISOString();

    return instance;
  }

  // List instances
  listInstances(filter = {}) {
    let instances = Array.from(this.instances.values());

    if (filter.status) {
      instances = instances.filter(i => i.status === filter.status);
    }
    if (filter.type) {
      instances = instances.filter(i => i.type === filter.type);
    }

    return instances;
  }

  // Get instance
  getInstance(instanceId) {
    return this.instances.get(instanceId) || null;
  }

  // Delete instance
  deleteInstance(instanceId) {
    return this.instances.delete(instanceId);
  }

  // Update resources
  updateResources(instanceId, resources) {
    const instance = this.instances.get(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    instance.resources = { ...instance.resources, ...resources };
    return instance;
  }

  // List images
  listImages() {
    return Array.from(this.images.values());
  }

  // Pull image
  pullImage(name) {
    if (!this.images.has(name)) {
      this.images.set(name, { name, size: '100MB', pulls: 1 });
    } else {
      const img = this.images.get(name);
      img.pulls += 1;
    }
    return { name, status: 'pulled' };
  }

  // List templates
  listTemplates() {
    return Array.from(this.templates.values());
  }

  // Create from template
  createFromTemplate(templateName, instanceName) {
    const template = this.templates.get(templateName);
    if (!template) {
      throw new Error(`Template ${templateName} not found`);
    }

    return this.createInstance(instanceName, template.type, {
      resources: template.resources,
      ports: template.ports,
      env: template.env,
      image: template.image
    });
  }

  // Get statistics
  getStats() {
    const instances = Array.from(this.instances.values());

    return {
      totalInstances: instances.length,
      running: instances.filter(i => i.status === 'running').length,
      stopped: instances.filter(i => i.status === 'stopped').length,
      idle: instances.filter(i => i.status === 'idle').length,
      byType: {
        container: instances.filter(i => i.type === 'container').length,
        vm: instances.filter(i => i.type === 'vm').length,
        function: instances.filter(i => i.type === 'function').length,
        process: instances.filter(i => i.type === 'process').length
      },
      totalRestarts: instances.reduce((sum, i) => sum + i.restartCount, 0),
      totalImages: this.images.size,
      totalTemplates: this.templates.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const runtime = new RuntimeEnvironment();

switch (command) {
  case 'demo':
    console.log('=== Agent Runtime Demo\n');

    // 1. List instances
    console.log('1. List Runtime Instances:');
    const instances = runtime.listInstances();
    console.log(`   Total: ${instances.length}`);
    instances.forEach(i => {
      console.log(`   - ${i.name} [${i.type}] ${i.status} CPU:${i.resources.cpu} Mem:${i.resources.memory}`);
    });

    // 2. Get running instances
    console.log('\n2. Running Instances:');
    const running = runtime.listInstances({ status: 'running' });
    console.log(`   Total: ${running.length}`);
    running.forEach(i => {
      console.log(`   - ${i.name}: started ${i.startedAt}`);
    });

    // 3. Start stopped instance
    console.log('\n3. Start Instance:');
    const stopped = runtime.listInstances({ status: 'stopped' })[0];
    if (stopped) {
      const started = runtime.start(stopped.id);
      console.log(`   Started: ${started.name} [${started.status}]`);
    }

    // 4. Stop running instance
    console.log('\n4. Stop Instance:');
    const toStop = runtime.listInstances({ status: 'running' })[0];
    if (toStop) {
      const stoppedInstance = runtime.stop(toStop.id);
      console.log(`   Stopped: ${stoppedInstance.name} [${stoppedInstance.status}]`);
    }

    // 5. Restart instance
    console.log('\n5. Restart Instance:');
    const toRestart = runtime.listInstances({ status: 'running' })[0];
    if (toRestart) {
      const restarted = runtime.restart(toRestart.id);
      console.log(`   Restarted: ${restarted.name} [restarts: ${restarted.restartCount}]`);
    }

    // 6. List images
    console.log('\n6. Container Images:');
    const images = runtime.listImages();
    images.forEach(img => {
      console.log(`   - ${img.name}: ${img.size} (${img.pulls.toLocaleString()} pulls)`);
    });

    // 7. Pull image
    console.log('\n7. Pull Image:');
    const pull = runtime.pullImage('new-image:v1');
    console.log(`   Pulled: ${pull.name}`);

    // 8. List templates
    console.log('\n8. Runtime Templates:');
    const templates = runtime.listTemplates();
    templates.forEach(t => {
      console.log(`   - ${t.name}: ${t.type} CPU:${t.resources.cpu} Mem:${t.resources.memory}`);
    });

    // 9. Create from template
    console.log('\n9. Create From Template:');
    const newInstance = runtime.createFromTemplate('web-server', 'my-web-server');
    console.log(`   Created: ${newInstance.name} [${newInstance.type}]`);

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const stats = runtime.getStats();
    console.log(`    Total instances: ${stats.totalInstances}`);
    console.log(`    Running: ${stats.running}`);
    console.log(`    Stopped: ${stats.stopped}`);
    console.log(`    By type: container=${stats.byType.container}, vm=${stats.byType.vm}, function=${stats.byType.function}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'status':
    const s = runtime.getStats();
    console.log('Runtime Status:');
    console.log(`  Instances: ${s.running} running / ${s.totalInstances} total`);
    console.log(`  Containers: ${s.byType.container}, VMs: ${s.byType.vm}`);
    break;

  case 'instances':
    console.log('Runtime Instances:');
    runtime.listInstances().forEach(i => {
      console.log(`  ${i.name}: ${i.type} [${i.status}]`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-runtime.js [demo|status|instances]');
}
