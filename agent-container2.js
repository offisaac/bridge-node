/**
 * Agent Container2 - Container Management Agent
 *
 * Provides container management capabilities.
 *
 * Usage: node agent-container2.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   create     - Create container
 *   start      - Start container
 */

class Container {
  constructor(config) {
    this.id = `container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.image = config.image;
    this.status = 'created';
    this.ports = config.ports || [];
    this.env = config.env || {};
    this.volumes = config.volumes || [];
    this.resources = config.resources || { cpu: '0.5', memory: '512M' };
  }
}

class ContainerImage {
  constructor(config) {
    this.id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.tag = config.tag || 'latest';
    this.registry = config.registry || 'docker.io';
    this.size = config.size || '100MB';
  }
}

class Container2Agent {
  constructor(config = {}) {
    this.name = config.name || 'Container2Agent';
    this.version = config.version || '2.0';
    this.containers = new Map();
    this.images = new Map();
    this.stats = {
      containersCreated: 0,
      containersRunning: 0,
      imagesPulled: 0
    };
    this.initDefaults();
  }

  initDefaults() {
    const defaults = [
      new Container({ name: 'web-server', image: 'nginx:latest', ports: [{ host: 80, container: 80 }], resources: { cpu: '1', memory: '512M' } }),
      new Container({ name: 'db-postgres', image: 'postgres:15', ports: [{ host: 5432, container: 5432 }], env: { POSTGRES_PASSWORD: 'secret' }, resources: { cpu: '1', memory: '1G' } }),
      new Container({ name: 'redis-cache', image: 'redis:7', ports: [{ host: 6379, container: 6379 }], resources: { cpu: '0.5', memory: '256M' } })
    ];
    defaults.forEach(c => {
      this.containers.set(c.id, c);
      this.stats.containersCreated++;
      this.stats.containersRunning++;
    });

    const images = [
      new ContainerImage({ name: 'nginx', tag: 'latest', registry: 'docker.io', size: '142MB' }),
      new ContainerImage({ name: 'postgres', tag: '15', registry: 'docker.io', size: '379MB' }),
      new ContainerImage({ name: 'redis', tag: '7', registry: 'docker.io', size: '130MB' })
    ];
    images.forEach(i => this.images.set(i.id, i));
    this.stats.imagesPulled = images.length;
  }

  create(name, image, ports, env, resources) {
    const container = new Container({ name, image, ports, env, resources });
    this.containers.set(container.id, container);
    this.stats.containersCreated++;
    return container;
  }

  start(containerId) {
    const container = this.containers.get(containerId);
    if (!container) return null;
    container.status = 'running';
    this.stats.containersRunning++;
    return container;
  }

  stop(containerId) {
    const container = this.containers.get(containerId);
    if (!container) return null;
    container.status = 'stopped';
    this.stats.containersRunning--;
    return container;
  }

  listContainers() {
    return Array.from(this.containers.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const container2 = new Container2Agent();

switch (command) {
  case 'demo': {
    console.log('=== Agent Container2 Demo\n');

    // 1. Containers
    console.log('1. Containers:');
    const containers = container2.listContainers();
    containers.forEach(c => {
      console.log(`   ${c.name}: ${c.image} (${c.status})`);
    });

    // 2. Create Container
    console.log('\n2. Create Container:');
    const newContainer = container2.create('my-app', 'node:18', [{ host: 3000, container: 3000 }], { NODE_ENV: 'production' }, { cpu: '1', memory: '1G' });
    console.log(`   Created: ${newContainer.name} (${newContainer.image})`);

    // 3. Start Container
    console.log('\n3. Start Container:');
    container2.start(newContainer.id);
    console.log(`   Started: ${newContainer.name}`);

    // 4. Container Operations
    console.log('\n4. Container Operations:');
    console.log('   start: Start a container');
    console.log('   stop: Stop a container');
    console.log('   restart: Restart a container');
    console.log('   pause: Pause all processes');
    console.log('   unpause: Resume processes');
    console.log('   remove: Remove a container');

    // 5. Container Configuration
    console.log('\n5. Container Configuration:');
    console.log('   Image: Base image for container');
    console.log('   Ports: Port mappings host->container');
    console.log('   Environment: Environment variables');
    console.log('   Volumes: Data persistence');
    console.log('   Resources: CPU and memory limits');

    // 6. Networking
    console.log('\n6. Networking:');
    console.log('   Bridge: Default network');
    console.log('   Host: Share host network');
    console.log('   Overlay: Multi-host networking');
    console.log('   None: Disable networking');

    // 7. Storage
    console.log('\n7. Storage:');
    console.log('   Bind mounts: Host directories');
    console.log('   Volumes: Managed storage');
    console.log('   tmpfs: Memory-backed storage');
    console.log('   Named pipes: Windows containers');

    // 8. Resource Limits
    console.log('\n8. Resource Limits:');
    console.log('   CPU: CPU shares and limits');
    console.log('   Memory: Memory limit and swap');
    console.log('   IO: Disk I/O limits');
    console.log('   PIDs: Process limits');

    // 9. Security
    console.log('\n9. Security:');
    console.log('   User: Run as non-root');
    console.log('   Capabilities: Linux capabilities');
    console.log('   SELinux: Label enforcement');
    console.log('   Seccomp: Syscall filtering');

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = container2.getStats();
    console.log(`   Containers created: ${stats.containersCreated}`);
    console.log(`   Containers running: ${stats.containersRunning}`);
    console.log(`   Images available: ${stats.imagesPulled}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'create': {
    const name = args[1] || 'my-container';
    const image = args[2] || 'alpine:latest';
    const c = container2.create(name, image);
    console.log(`Created: ${c.name}`);
    break;
  }

  case 'start': {
    const containers = container2.listContainers();
    if (containers.length > 0) {
      container2.start(containers[0].id);
      console.log(`Started: ${containers[0].name}`);
    }
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-container2.js [demo|create|start]');
  }
}
