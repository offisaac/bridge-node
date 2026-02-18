/**
 * Agent Pod - Kubernetes Pod Management Agent
 *
 * Pod lifecycle, scheduling, health checks, init containers.
 *
 * Usage: node agent-pod.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   lifecycle  - Show pod lifecycle
 *   scheduling - Show scheduling features
 */

class PodSpec {
  constructor(config) {
    this.containers = config.containers || [];
    this.initContainers = config.initContainers || [];
    this.volumes = config.volumes || [];
    this.nodeSelector = config.nodeSelector || {};
    this.affinity = config.affinity || {};
    this.tolerations = config.tolerations || [];
    this.restartPolicy = config.restartPolicy || 'Always';
    this.serviceAccountName = config.serviceAccountName || 'default';
  }
}

class ContainerSpec {
  constructor(name, image, config = {}) {
    this.name = name;
    this.image = image;
    this.command = config.command || [];
    this.args = config.args || [];
    this.ports = config.ports || [];
    this.env = config.env || [];
    this.resources = config.resources || { requests: {}, limits: {} };
    this.volumeMounts = config.volumeMounts || [];
    this.livenessProbe = config.livenessProbe || null;
    this.readinessProbe = config.readinessProbe || null;
    this.startupProbe = config.startupProbe || null;
    this.imagePullPolicy = config.imagePullPolicy || 'IfNotPresent';
  }
}

class PodPhase {
  static PENDING = 'Pending';
  static RUNNING = 'Running';
  static SUCCEEDED = 'Succeeded';
  static FAILED = 'Failed';
  static UNKNOWN = 'Unknown';
}

class PodCondition {
  constructor(type, status) {
    this.type = type;
    this.status = status;
    this.lastTransitionTime = Date.now();
    this.reason = '';
    this.message = '';
  }
}

class K8sPod {
  constructor(name, namespace, spec) {
    this.name = name;
    this.namespace = namespace;
    this.spec = spec;
    this.phase = PodPhase.PENDING;
    this.conditions = [];
    this.nodeName = null;
    this.hostIP = null;
    this.podIP = null;
    this.created = Date.now();
    this.started = null;
    this.initStarted = null;
    this.restartCount = 0;
    this.containerStatuses = [];
  }

  isReady() {
    const ready = this.conditions.find(c => c.type === 'Ready');
    return ready && ready.status === 'True';
  }

  isRunning() {
    return this.phase === PodPhase.RUNNING;
  }

  isFailed() {
    return this.phase === PodPhase.FAILED;
  }
}

class PodAgent {
  constructor() {
    this.pods = new Map();
    this.schedulingQueue = [];
    this.stats = { pending: 0, running: 0, succeeded: 0, failed: 0 };
  }

  createPod(name, namespace, specConfig) {
    const containers = specConfig.containers.map(c =>
      new ContainerSpec(c.name, c.image, c)
    );

    const initContainers = (specConfig.initContainers || []).map(c =>
      new ContainerSpec(c.name, c.image, c)
    );

    const spec = new PodSpec({
      ...specConfig,
      containers,
      initContainers
    });

    const pod = new K8sPod(name, namespace, spec);
    this.pods.set(`${namespace}/${name}`, pod);
    this.stats.pending++;
    console.log(`   Created pod: ${namespace}/${name}`);
    return pod;
  }

  schedulePod(name, namespace, nodeName) {
    const pod = this.pods.get(`${namespace}/${name}`);
    if (!pod) throw new Error(`Pod ${namespace}/${name} not found`);

    pod.nodeName = nodeName;
    pod.hostIP = `10.0.0.${Math.floor(Math.random() * 254) + 1}`;
    pod.podIP = `10.244.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;
    pod.phase = PodPhase.RUNNING;
    pod.started = Date.now();
    pod.conditions.push(new PodCondition('Initialized', 'True'));
    pod.conditions.push(new PodCondition('Ready', 'True'));
    pod.conditions.push(new PodCondition('ContainersReady', 'True'));

    pod.spec.containers.forEach(c => {
      pod.containerStatuses.push({
        name: c.name,
        ready: true,
        restartCount: 0,
        state: 'running',
        startedAt: pod.started
      });
    });

    this.stats.pending--;
    this.stats.running++;
    console.log(`   Scheduled pod: ${namespace}/${name} on ${nodeName}`);
    return pod;
  }

  startInitContainers(name, namespace) {
    const pod = this.pods.get(`${namespace}/${name}`);
    if (!pod) throw new Error(`Pod ${namespace}/${name} not found`);

    if (pod.spec.initContainers.length > 0) {
      pod.initStarted = Date.now();
      console.log(`   Starting init containers for: ${namespace}/${name}`);
    }
    return pod;
  }

  completeInitContainers(name, namespace) {
    const pod = this.pods.get(`${namespace}/${name}`);
    if (!pod) throw new Error(`Pod ${namespace}/${name} not found`);

    pod.conditions.push(new PodCondition('Initialized', 'True'));
    console.log(`   Init containers complete for: ${namespace}/${name}`);
    return pod;
  }

  getPod(name, namespace) {
    return this.pods.get(`${namespace}/${name}`);
  }

  listPods(namespace = null) {
    const pods = Array.from(this.pods.values());
    if (namespace) {
      return pods.filter(p => p.namespace === namespace);
    }
    return pods;
  }

  deletePod(name, namespace) {
    const pod = this.pods.get(`${namespace}/${name}`);
    if (!pod) throw new Error(`Pod ${namespace}/${name} not found`);

    if (pod.phase === PodPhase.RUNNING) {
      this.stats.running--;
    } else if (pod.phase === PodPhase.PENDING) {
      this.stats.pending--;
    } else if (pod.phase === PodPhase.FAILED) {
      this.stats.failed--;
    }

    this.pods.delete(`${namespace}/${name}`);
    return { deleted: true };
  }

  // Health checks
  setLivenessProbe(name, namespace, probe) {
    const pod = this.pods.get(`${namespace}/${name}`);
    if (!pod) throw new Error(`Pod ${namespace}/${name} not found`);

    const container = pod.spec.containers.find(c => c.name === probe.container);
    if (container) {
      container.livenessProbe = probe;
      console.log(`   Added liveness probe to ${probe.container}`);
    }
    return pod;
  }

  setReadinessProbe(name, namespace, probe) {
    const pod = this.pods.get(`${namespace}/${name}`);
    if (!pod) throw new Error(`Pod ${namespace}/${name} not found`);

    const container = pod.spec.containers.find(c => c.name === probe.container);
    if (container) {
      container.readinessProbe = probe;
      console.log(`   Added readiness probe to ${probe.container}`);
    }
    return pod;
  }

  // Container operations
  execInContainer(name, namespace, containerName, command) {
    const pod = this.pods.get(`${namespace}/${name}`);
    if (!pod) throw new Error(`Pod ${namespace}/${name} not found`);
    if (!pod.isRunning()) throw new Error('Pod not running');

    console.log(`   Exec: ${command.join(' ')} in ${namespace}/${name}/${containerName}`);
    return { output: 'command output', exitCode: 0 };
  }

  getContainerLogs(name, namespace, containerName, tail = 100) {
    const pod = this.pods.get(`${namespace}/${name}`);
    if (!pod) throw new Error(`Pod ${namespace}/${name} not found`);

    return {
      container: containerName,
      logs: `[${containerName}] Log entries... (${tail} lines)`,
      timestamp: Date.now()
    };
  }

  // Pod status
  getPodStatus(name, namespace) {
    const pod = this.pods.get(`${namespace}/${name}`);
    if (!pod) throw new Error(`Pod ${namespace}/${name} not found`);

    return {
      name: pod.name,
      namespace: pod.namespace,
      phase: pod.phase,
      conditions: pod.conditions,
      nodeName: pod.nodeName,
      podIP: pod.podIP,
      hostIP: pod.hostIP,
      startedAt: pod.started,
      initStartedAt: pod.initStarted,
      restartCount: pod.restartCount,
      containerStatuses: pod.containerStatuses
    };
  }

  // Simulate failure
  failPod(name, namespace, reason) {
    const pod = this.pods.get(`${namespace}/${name}`);
    if (!pod) throw new Error(`Pod ${namespace}/${name} not found`);

    pod.phase = PodPhase.FAILED;
    pod.conditions.push(new PodCondition('Ready', 'False'));
    pod.conditions.push(new PodCondition('Initialized', 'False'));
    pod.conditions[pod.conditions.length - 1].reason = reason;
    pod.conditions[pod.conditions.length - 1].message = reason;

    if (pod.phase === PodPhase.RUNNING) {
      this.stats.running--;
    } else if (pod.phase === PodPhase.PENDING) {
      this.stats.pending--;
    }
    this.stats.failed++;

    console.log(`   Pod failed: ${namespace}/${name} - ${reason}`);
    return pod;
  }

  // Eviction
  evictPod(name, namespace, reason) {
    const pod = this.pods.get(`${namespace}/${name}`);
    if (!pod) throw new Error(`Pod ${namespace}/${name} not found`);

    pod.phase = PodPhase.FAILED;
    if (pod.phase === PodPhase.RUNNING) {
      this.stats.running--;
    }
    this.stats.failed++;

    console.log(`   Evicted: ${namespace}/${name} - ${reason}`);
    return pod;
  }

  getStats() {
    return { ...this.stats, total: this.pods.size };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const podAgent = new PodAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Pod Demo\n');

    // 1. Create pods
    console.log('1. Pod Creation:');
    podAgent.createPod('web-0', 'production', {
      containers: [
        {
          name: 'nginx',
          image: 'nginx:1.25',
          ports: [{ containerPort: 80 }],
          resources: {
            requests: { cpu: '100m', memory: '128Mi' },
            limits: { cpu: '500m', memory: '512Mi' }
          }
        }
      ],
      initContainers: [
        {
          name: 'init-db',
          image: 'busybox:1.36',
          command: ['sh', '-c', 'echo init']
        }
      ],
      serviceAccountName: 'web-sa',
      restartPolicy: 'Always'
    });

    podAgent.createPod('api-0', 'production', {
      containers: [
        {
          name: 'api',
          image: 'myapi:v1',
          ports: [{ containerPort: 8080 }],
          env: [
            { name: 'DATABASE_URL', value: 'postgres://db:5432' }
          ],
          resources: {
            requests: { cpu: '200m', memory: '256Mi' },
            limits: { cpu: '1000m', memory: '1Gi' }
          }
        }
      ],
      restartPolicy: 'Always'
    });

    podAgent.createPod('worker-0', 'production', {
      containers: [
        {
          name: 'worker',
          image: 'worker:v1',
          args: ['--queue', 'default'],
          resources: {
            requests: { cpu: '100m', memory: '128Mi' },
            limits: { cpu: '500m', memory: '512Mi' }
          }
        }
      ],
      restartPolicy: 'OnFailure'
    });

    console.log(`   Total pods: ${podAgent.pods.size}`);

    // 2. Schedule pods
    console.log('\n2. Pod Scheduling:');
    podAgent.schedulePod('web-0', 'production', 'worker-1');
    podAgent.schedulePod('api-0', 'production', 'worker-2');
    podAgent.schedulePod('worker-0', 'production', 'worker-1');

    // 3. Init containers
    console.log('\n3. Init Containers:');
    podAgent.startInitContainers('web-0', 'production');
    podAgent.completeInitContainers('web-0', 'production');

    // 4. Health checks
    console.log('\n4. Health Checks:');
    podAgent.setLivenessProbe('web-0', 'production', {
      container: 'nginx',
      httpGet: { path: '/healthz', port: 80 },
      initialDelaySeconds: 10,
      periodSeconds: 5
    });
    podAgent.setReadinessProbe('web-0', 'production', {
      container: 'nginx',
      httpGet: { path: '/ready', port: 80 },
      initialDelaySeconds: 5,
      periodSeconds: 5
    });

    // 5. Container operations
    console.log('\n5. Container Operations:');
    podAgent.execInContainer('web-0', 'production', 'nginx', ['ls', '-la']);
    const logs = podAgent.getContainerLogs('web-0', 'production', 'nginx', 50);
    console.log(`   Logs: ${logs.logs}`);

    // 6. Pod status
    console.log('\n6. Pod Status:');
    const status = podAgent.getPodStatus('api-0', 'production');
    console.log(`   Phase: ${status.phase}`);
    console.log(`   Node: ${status.nodeName}`);
    console.log(`   Pod IP: ${status.podIP}`);

    // 7. List pods
    console.log('\n7. Pod Listing:');
    const pods = podAgent.listPods('production');
    console.log(`   Production pods: ${pods.length}`);
    pods.forEach(p => console.log(`     - ${p.name}: ${p.phase}`));

    // 8. Simulate failure
    console.log('\n8. Failure Simulation:');
    podAgent.failPod('worker-0', 'production', 'OOMKilled');

    // 9. Statistics
    console.log('\n9. Statistics:');
    const stats = podAgent.getStats();
    console.log(`   Pending: ${stats.pending}`);
    console.log(`   Running: ${stats.running}`);
    console.log(`   Succeeded: ${stats.succeeded}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`   Total: ${stats.total}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'lifecycle':
    console.log('Pod Lifecycle:');
    console.log('  - Pending -> Running -> Succeeded/Failed');
    console.log('  - Init containers run first');
    console.log('  - Main containers start after init');
    console.log('  - Pod conditions track readiness');
    break;

  case 'scheduling':
    console.log('Scheduling Features:');
    console.log('  - Node selector');
    console.log('  - Node affinity/anti-affinity');
    console.log('  - Pod affinity/anti-affinity');
    console.log('  - Taints and tolerations');
    console.log('  - Priority and preemption');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-pod.js [demo|lifecycle|scheduling]');
}
