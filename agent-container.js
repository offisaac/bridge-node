/**
 * Agent Container - Container Management Agent
 *
 * Container lifecycle management, resource limits, health checks.
 *
 * Usage: node agent-container.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   lifecycle  - Show container lifecycle
 *   resources  - Show resource management
 */

class Container {
  constructor(id, image, config = {}) {
    this.id = id;
    this.image = image;
    this.status = 'created';
    this.config = {
      cpu: config.cpu || 1,
      memory: config.memory || 512,
      ports: config.ports || [],
      env: config.env || {},
      volumes: config.volumes || [],
      restartPolicy: config.restartPolicy || 'no'
    };
    this.stats = { cpu: 0, memory: 0, networkIn: 0, networkOut: 0 };
    this.healthCheck = config.healthCheck || null;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.stoppedAt = null;
  }

  isHealthy() {
    if (!this.healthCheck) return true;
    return this.healthCheck.status === 'healthy';
  }

  getUptime() {
    if (!this.startedAt) return 0;
    return Date.now() - this.startedAt;
  }
}

class ContainerStats {
  constructor() {
    this.containers = new Map();
  }

  update(containerId, stats) {
    const container = this.containers.get(containerId);
    if (container) {
      Object.assign(container.stats, stats);
    }
  }

  get(containerId) {
    return this.containers.get(containerId);
  }

  getAll() {
    return Array.from(this.containers.values());
  }
}

class ContainerAgent {
  constructor() {
    this.containers = new Map();
    this.stats = new ContainerStats();
    this.statsData = { created: 0, running: 0, stopped: 0, failed: 0 };
  }

  create(id, image, config = {}) {
    const container = new Container(id, image, config);
    this.containers.set(id, container);
    this.stats.containers.set(id, container);
    this.statsData.created++;
    return container;
  }

  start(id) {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);

    container.status = 'running';
    container.startedAt = Date.now();
    this.statsData.running++;
    return container;
  }

  stop(id) {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);

    container.status = 'stopped';
    container.stoppedAt = Date.now();
    this.statsData.running--;
    this.statsData.stopped++;
    return container;
  }

  restart(id) {
    this.stop(id);
    return this.start(id);
  }

  remove(id) {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);

    if (container.status === 'running') {
      this.stop(id);
    }
    this.containers.delete(id);
    this.stats.containers.delete(id);
    return { removed: true };
  }

  exec(id, command) {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);
    if (container.status !== 'running') throw new Error('Container not running');

    console.log(`   Exec: ${command.join(' ')} in ${id}`);
    return { output: 'command executed', exitCode: 0 };
  }

  logs(id, options = {}) {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);

    return {
      container: id,
      stdout: `[${container.status}] container logs...`,
      stderr: '',
      tail: options.tail || 100
    };
  }

  getStats(id) {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);

    const cpuLimit = (container.config && container.config.cpu) ? container.config.cpu : 1;
    const memLimit = (container.config && container.config.memory) ? container.config.memory : 512;

    const cpu = Math.random() * cpuLimit * 100;
    const memUsage = Math.random() * memLimit;

    return {
      id: container.id,
      status: container.status,
      cpu: cpu,
      memory: {
        usage: memUsage,
        limit: memLimit
      },
      uptime: container.getUptime()
    };
  }

  setHealthCheck(id, healthCheck) {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);

    container.healthCheck = { ...healthCheck, status: 'unknown' };
    return container;
  }

  inspect(id) {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);

    return {
      id: container.id,
      image: container.image,
      status: container.status,
      config: container.config,
      created: container.createdAt,
      started: container.startedAt,
      stopped: container.stoppedAt
    };
  }

  list() {
    return Array.from(this.containers.values()).map(c => ({
      id: c.id,
      image: c.image,
      status: c.status,
      created: c.createdAt
    }));
  }

  getAggregateStats() {
    return { ...this.statsData, total: this.containers.size };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const containerAgent = new ContainerAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Container Demo\n');

    // 1. Create containers
    console.log('1. Container Creation:');
    containerAgent.create('web-1', 'nginx:latest', {
      cpu: 2,
      memory: 1024,
      ports: [80, 443],
      env: { NODE_ENV: 'production' }
    });
    containerAgent.create('db-1', 'postgres:15', {
      cpu: 4,
      memory: 4096,
      volumes: ['/data/postgres'],
      restartPolicy: 'always'
    });
    containerAgent.create('cache-1', 'redis:7', {
      cpu: 1,
      memory: 512,
      ports: [6379]
    });
    console.log('   Created: web-1, db-1, cache-1');

    // 2. Start containers
    console.log('\n2. Container Lifecycle:');
    containerAgent.start('web-1');
    containerAgent.start('db-1');
    console.log('   Started: web-1, db-1');

    // 3. Container operations
    console.log('\n3. Container Operations:');
    const logs = containerAgent.logs('web-1', { tail: 50 });
    console.log(`   Logs: ${logs.tail} lines`);

    const exec = containerAgent.exec('web-1', ['ls', '-la']);
    console.log(`   Exec: exit code ${exec.exitCode}`);

    // 4. Stats
    console.log('\n4. Resource Monitoring:');
    const webStats = containerAgent.getStats('web-1');
    console.log(`   web-1: CPU ${webStats.cpu.toFixed(1)}%, Memory ${webStats.memory.usage.toFixed(0)}/${webStats.memory.limit}MB`);

    // 5. Health checks
    console.log('\n5. Health Checks:');
    containerAgent.setHealthCheck('web-1', {
      path: '/health',
      interval: 30,
      timeout: 5
    });
    console.log('   Health check configured for web-1');

    // 6. Inspect
    console.log('\n6. Container Inspection:');
    const inspect = containerAgent.inspect('db-1');
    console.log(`   db-1: ${inspect.image} (${inspect.config.restartPolicy})`);

    // 7. Stop and restart
    console.log('\n7. Stop/Restart:');
    containerAgent.stop('web-1');
    containerAgent.restart('db-1');
    console.log('   Stopped: web-1, Restarted: db-1');

    // 8. Statistics
    console.log('\n8. Statistics:');
    const stats = containerAgent.getAggregateStats();
    console.log(`   Created: ${stats.created}`);
    console.log(`   Running: ${stats.running}`);
    console.log(`   Stopped: ${stats.stopped}`);
    console.log(`   Total: ${stats.total}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'lifecycle':
    console.log('Container Lifecycle:');
    console.log('  - created -> running -> stopped');
    console.log('  - Health checks at each state');
    console.log('  - Restart policies: no, on-failure, always, unless-stopped');
    break;

  case 'resources':
    console.log('Resource Management:');
    console.log('  - CPU limits and shares');
    console.log('  - Memory limits and swaps');
    console.log('  - I/O bandwidth limits');
    console.log('  - Network bandwidth limits');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-container.js [demo|lifecycle|resources]');
}
