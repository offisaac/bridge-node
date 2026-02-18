/**
 * Agent Docker2 - Docker Management Agent
 *
 * Provides Docker-specific container management.
 *
 * Usage: node agent-docker2.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   build      - Build image
 *   run        - Run container
 */

class DockerImage {
  constructor(config) {
    this.id = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.tag = config.tag || 'latest';
    this.dockerfile = config.dockerfile || 'Dockerfile';
    this.context = config.context || '.';
    this.size = config.size || '100MB';
    this.layers = config.layers || 5;
  }
}

class DockerContainer {
  constructor(config) {
    this.id = `container-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.image = config.image;
    this.status = 'created';
    this.portBindings = config.portBindings || [];
    this.volumeBindings = config.volumeBindings || [];
    this.env = config.env || [];
  }
}

class DockerVolume {
  constructor(config) {
    this.id = `vol-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.driver = config.driver || 'local';
    this.mountpoint = config.mountpoint || `/var/lib/docker/volumes/${config.name}`;
  }
}

class DockerNetwork {
  constructor(config) {
    this.id = `net-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.driver = config.driver || 'bridge';
    this.subnet = config.subnet || '172.17.0.0/16';
  }
}

class Docker2Agent {
  constructor(config = {}) {
    this.name = config.name || 'Docker2Agent';
    this.version = config.version || '2.0';
    this.images = new Map();
    this.containers = new Map();
    this.volumes = new Map();
    this.networks = new Map();
    this.stats = {
      imagesBuilt: 0,
      containersCreated: 0,
      volumesCreated: 0,
      networksCreated: 0
    };
    this.initDefaults();
  }

  initDefaults() {
    const defaults = [
      new DockerImage({ name: 'nginx', tag: 'alpine', size: '142MB', layers: 8 }),
      new DockerImage({ name: 'node', tag: '18-alpine', size: '180MB', layers: 12 }),
      new DockerImage({ name: 'python', tag: '3.11-slim', size: '125MB', layers: 6 })
    ];
    defaults.forEach(i => {
      this.images.set(i.id, i);
      this.stats.imagesBuilt++;
    });

    const containers = [
      new DockerContainer({ name: 'web', image: 'nginx:alpine', status: 'running', portBindings: [{ host: 80, container: 80 }] }),
      new DockerContainer({ name: 'api', image: 'node:18-alpine', status: 'running', portBindings: [{ host: 3000, container: 3000 }], env: ['NODE_ENV=production'] }),
      new DockerContainer({ name: 'worker', image: 'python:3.11-slim', status: 'exited' })
    ];
    containers.forEach(c => {
      this.containers.set(c.id, c);
      this.stats.containersCreated++;
    });

    const volumes = [
      new DockerVolume({ name: 'data', driver: 'local' }),
      new DockerVolume({ name: 'logs', driver: 'local' })
    ];
    volumes.forEach(v => {
      this.volumes.set(v.id, v);
      this.stats.volumesCreated++;
    });

    const networks = [
      new DockerNetwork({ name: 'frontend', driver: 'bridge', subnet: '172.20.0.0/16' }),
      new DockerNetwork({ name: 'backend', driver: 'bridge', subnet: '172.21.0.0/16' })
    ];
    networks.forEach(n => {
      this.networks.set(n.id, n);
      this.stats.networksCreated++;
    });
  }

  build(name, tag, dockerfile, context) {
    const image = new DockerImage({ name, tag, dockerfile, context });
    this.images.set(image.id, image);
    this.stats.imagesBuilt++;
    return image;
  }

  run(name, image, ports, volumes, env) {
    const container = new DockerContainer({ name, image, portBindings: ports, volumeBindings: volumes, env });
    this.containers.set(container.id, container);
    container.status = 'running';
    this.stats.containersCreated++;
    return container;
  }

  createVolume(name, driver) {
    const volume = new DockerVolume({ name, driver });
    this.volumes.set(volume.id, volume);
    this.stats.volumesCreated++;
    return volume;
  }

  createNetwork(name, driver, subnet) {
    const network = new DockerNetwork({ name, driver, subnet });
    this.networks.set(network.id, network);
    this.stats.networksCreated++;
    return network;
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

const docker2 = new Docker2Agent();

switch (command) {
  case 'demo': {
    console.log('=== Agent Docker2 Demo\n');

    // 1. Images
    console.log('1. Docker Images:');
    Array.from(docker2.images.values()).forEach(i => {
      console.log(`   ${i.name}:${i.tag} (${i.size}, ${i.layers} layers)`);
    });

    // 2. Build Image
    console.log('\n2. Build Image:');
    const newImage = docker2.build('myapp', 'v1.0', 'Dockerfile', './src');
    console.log(`   Built: ${newImage.name}:${newImage.tag}`);

    // 3. Containers
    console.log('\n3. Containers:');
    docker2.listContainers().forEach(c => {
      console.log(`   ${c.name}: ${c.image} (${c.status})`);
    });

    // 4. Run Container
    console.log('\n4. Run Container:');
    const newContainer = docker2.run('myservice', 'myapp:v1.0', [{ host: 8080, container: 8080 }], ['/data:/data'], ['ENV=production']);
    console.log(`   Running: ${newContainer.name}`);

    // 5. Dockerfiles
    console.log('\n5. Dockerfile Instructions:');
    console.log('   FROM: Base image');
    console.log('   RUN: Execute commands');
    console.log('   COPY: Copy files');
    console.log('   WORKDIR: Set working directory');
    console.log('   ENV: Environment variables');
    console.log('   EXPOSE: Port exposure');
    console.log('   CMD/ENTRYPOINT: Default command');

    // 6. Multi-stage Builds
    console.log('\n6. Multi-stage Builds:');
    console.log('   Build: Compile in builder stage');
    console.log('   Copy: Copy artifacts');
    console.log('   Run: Minimal runtime image');
    console.log('   Benefit: Smaller final images');

    // 7. Volumes
    console.log('\n7. Volumes:');
    console.log('   Named volumes: docker volume create');
    console.log('   Bind mounts: -v /host:/container');
    console.log('   tmpfs: Memory-backed storage');
    Array.from(docker2.volumes.values()).forEach(v => {
      console.log(`   ${v.name}: ${v.driver}`);
    });

    // 8. Networks
    console.log('\n8. Networks:');
    console.log('   Bridge: Default network');
    console.log('   Host: Host network stack');
    console.log('   Overlay: Multi-host (Swarm)');
    console.log('   Macvlan: Direct container access');
    Array.from(docker2.networks.values()).forEach(n => {
      console.log(`   ${n.name}: ${n.driver} (${n.subnet})`);
    });

    // 9. Compose
    console.log('\n9. Docker Compose:');
    console.log('   Multi-container orchestration');
    console.log('   Service dependencies');
    console.log('   Shared networks');
    console.log('   Volume sharing');
    console.log('   Environment variables');

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = docker2.getStats();
    console.log(`   Images: ${stats.imagesBuilt}`);
    console.log(`   Containers: ${stats.containersCreated}`);
    console.log(`   Volumes: ${stats.volumesCreated}`);
    console.log(`   Networks: ${stats.networksCreated}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'build': {
    const name = args[1] || 'myapp';
    const tag = args[2] || 'latest';
    const img = docker2.build(name, tag);
    console.log(`Built: ${img.name}:${img.tag}`);
    break;
  }

  case 'run': {
    const name = args[1] || 'mycontainer';
    const image = args[2] || 'alpine';
    const c = docker2.run(name, image);
    console.log(`Running: ${c.name}`);
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-docker2.js [demo|build|run]');
  }
}
