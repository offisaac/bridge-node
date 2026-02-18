/**
 * Agent Docker - Docker Management Agent
 *
 * Docker image management, build, pull, networks, volumes.
 *
 * Usage: node agent-docker.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   build      - Show build features
 *   network    - Show network features
 */

class DockerImage {
  constructor(repository, tag, id) {
    this.repository = repository;
    this.tag = tag;
    this.id = id;
    this.size = 0;
    this.created = Date.now();
    this.layers = [];
  }

  fullName() {
    return `${this.repository}:${this.tag}`;
  }
}

class DockerVolume {
  constructor(name, driver, mountpoint) {
    this.name = name;
    this.driver = driver || 'local';
    this.mountpoint = mountpoint || `/var/lib/docker/volumes/${name}`;
    this.created = Date.now();
    this.options = {};
  }
}

class DockerNetwork {
  constructor(name, driver, subnet) {
    this.name = name;
    this.driver = driver || 'bridge';
    this.subnet = subnet || '172.17.0.0/16';
    this.containers = [];
    this.created = Date.now();
  }
}

class DockerAgent {
  constructor() {
    this.images = new Map();
    this.containers = new Map();
    this.volumes = new Map();
    this.networks = new Map();
    this.stats = { images: 0, containers: 0, volumes: 0, networks: 0 };
  }

  // Image operations
  pullImage(repository, tag = 'latest') {
    const id = Math.random().toString(36).substring(7);
    const image = new DockerImage(repository, tag, id);
    this.images.set(id, image);
    this.stats.images++;
    console.log(`   Pulled: ${repository}:${tag} (${id})`);
    return image;
  }

  buildImage(dockerfile, tag) {
    const id = Math.random().toString(36).substring(7);
    const [repo, tagName] = tag.split(':');
    const image = new DockerImage(repo, tagName || 'latest', id);
    image.layers = ['base', 'dependencies', 'application'];
    image.size = Math.floor(Math.random() * 500) + 100;
    this.images.set(id, image);
    this.stats.images++;
    console.log(`   Built: ${tag} (${id})`);
    return image;
  }

  listImages() {
    return Array.from(this.images.values()).map(img => ({
      repository: img.repository,
      tag: img.tag,
      id: img.id,
      size: img.size,
      created: img.created
    }));
  }

  removeImage(imageId) {
    if (this.images.delete(imageId)) {
      this.stats.images--;
      return { removed: true };
    }
    throw new Error(`Image ${imageId} not found`);
  }

  // Volume operations
  createVolume(name, driver = 'local', options = {}) {
    const volume = new DockerVolume(name, driver);
    volume.options = options;
    this.volumes.set(name, volume);
    this.stats.volumes++;
    console.log(`   Created volume: ${name} (${driver})`);
    return volume;
  }

  listVolumes() {
    return Array.from(this.volumes.values()).map(v => ({
      name: v.name,
      driver: v.driver,
      mountpoint: v.mountpoint,
      created: v.created
    }));
  }

  removeVolume(name) {
    if (this.volumes.delete(name)) {
      this.stats.volumes--;
      return { removed: true };
    }
    throw new Error(`Volume ${name} not found`);
  }

  // Network operations
  createNetwork(name, driver = 'bridge', subnet) {
    const network = new DockerNetwork(name, driver, subnet);
    this.networks.set(name, network);
    this.stats.networks++;
    console.log(`   Created network: ${name} (${driver})`);
    return network;
  }

  listNetworks() {
    return Array.from(this.networks.values()).map(n => ({
      name: n.name,
      driver: n.driver,
      subnet: n.subnet,
      containers: n.containers.length,
      created: n.created
    }));
  }

  connectContainer(networkName, containerId) {
    const network = this.networks.get(networkName);
    if (!network) throw new Error(`Network ${networkName} not found`);
    if (!network.containers.includes(containerId)) {
      network.containers.push(containerId);
    }
    return { connected: true };
  }

  disconnectContainer(networkName, containerId) {
    const network = this.networks.get(networkName);
    if (!network) throw new Error(`Network ${networkName} not found`);
    network.containers = network.containers.filter(c => c !== containerId);
    return { disconnected: true };
  }

  removeNetwork(name) {
    if (this.networks.delete(name)) {
      this.stats.networks--;
      return { removed: true };
    }
    throw new Error(`Network ${name} not found`);
  }

  // Container operations
  runContainer(imageId, name, ports = [], volumes = []) {
    const containerId = Math.random().toString(36).substring(7);
    this.containers.set(containerId, {
      id: containerId,
      name,
      image: imageId,
      status: 'running',
      ports,
      volumes,
      created: Date.now()
    });
    this.stats.containers++;
    console.log(`   Running container: ${name} from ${imageId}`);
    return containerId;
  }

  listContainers() {
    return Array.from(this.containers.values()).map(c => ({
      id: c.id,
      name: c.name,
      image: c.image,
      status: c.status,
      ports: c.ports,
      created: c.created
    }));
  }

  stopContainer(containerId) {
    const container = this.containers.get(containerId);
    if (!container) throw new Error(`Container ${containerId} not found`);
    container.status = 'exited';
    return { stopped: true };
  }

  removeContainer(containerId) {
    if (this.containers.delete(containerId)) {
      this.stats.containers--;
      return { removed: true };
    }
    throw new Error(`Container ${containerId} not found`);
  }

  // System operations
  prune() {
    const removed = {
      images: 0,
      containers: 0,
      volumes: 0,
      networks: 0
    };
    // Simulate pruning
    console.log('   Pruned: images, containers, volumes, networks');
    return removed;
  }

  systemDf() {
    return {
      images: this.stats.images,
      containers: this.stats.containers,
      volumes: this.stats.volumes,
      networks: this.stats.networks
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const docker = new DockerAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Docker Demo\n');

    // 1. Pull images
    console.log('1. Image Management:');
    docker.pullImage('nginx', 'latest');
    docker.pullImage('postgres', '15');
    docker.pullImage('redis', '7-alpine');
    const images = docker.listImages();
    console.log(`   Total images: ${images.length}`);

    // 2. Build image
    console.log('\n2. Build Image:');
    docker.buildImage('Dockerfile', 'myapp:v1.0');

    // 3. Create volumes
    console.log('\n3. Volume Management:');
    docker.createVolume('data-postgres', 'local');
    docker.createVolume('cache-redis', 'local');
    const volumes = docker.listVolumes();
    console.log(`   Total volumes: ${volumes.length}`);

    // 4. Create networks
    console.log('\n4. Network Management:');
    docker.createNetwork('frontend', 'bridge', '172.20.0.0/16');
    docker.createNetwork('backend', 'bridge', '172.21.0.0/16');
    docker.createNetwork('overlay', 'overlay');
    const networks = docker.listNetworks();
    console.log(`   Total networks: ${networks.length}`);

    // 5. Run containers
    console.log('\n5. Container Operations:');
    const webId = docker.runContainer('nginx', 'web-1', [80, 443]);
    const dbId = docker.runContainer('postgres', 'db-1', [5432], ['data-postgres']);
    const cacheId = docker.runContainer('redis', 'cache-1', [6379], ['cache-redis']);

    // 6. Connect containers to networks
    console.log('\n6. Network Connections:');
    docker.connectContainer('frontend', webId);
    docker.connectContainer('backend', dbId);
    docker.connectContainer('backend', cacheId);
    console.log('   Connected containers to networks');

    // 7. List containers
    console.log('\n7. Container Listing:');
    const containers = docker.listContainers();
    console.log(`   Total containers: ${containers.length}`);

    // 8. System df
    console.log('\n8. System Usage:');
    const df = docker.systemDf();
    console.log(`   Images: ${df.images}`);
    console.log(`   Containers: ${df.containers}`);
    console.log(`   Volumes: ${df.volumes}`);
    console.log(`   Networks: ${df.networks}`);

    // 9. Prune
    console.log('\n9. Prune:');
    docker.prune();

    console.log('\n=== Demo Complete ===');
    break;

  case 'build':
    console.log('Build Features:');
    console.log('  - Dockerfile parsing');
    console.log('  - Layer caching');
    console.log('  - Multi-stage builds');
    console.log('  - Build args and secrets');
    break;

  case 'network':
    console.log('Network Features:');
    console.log('  - Bridge networks');
    console.log('  - Overlay networks (Swarm)');
    console.log('  - Macvlan networks');
    console.log('  - Network isolation');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-docker.js [demo|build|network]');
}
