/**
 * Agent StatefulSet - Kubernetes StatefulSet Management Agent
 *
 * StatefulSet lifecycle, ordered deployment, scaling, PVC management.
 *
 * Usage: node agent-statefulset.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   ordering    - Show ordering guarantees
 *   pvc         - Show PVC management
 */

class StatefulSetSpec {
  constructor(config) {
    this.replicas = config.replicas || 1;
    this.selector = config.selector || {};
    this.serviceName = config.serviceName || '';
    this.template = config.template || {};
    this.volumeClaimTemplates = config.volumeClaimTemplates || [];
    this.podManagementPolicy = config.podManagementPolicy || 'OrderedReady';
    this.updateStrategy = config.updateStrategy || 'RollingUpdate';
    this.revisionHistoryLimit = config.revisionHistoryLimit || 10;
  }
}

class PersistentVolumeClaim {
  constructor(name, storage) {
    this.name = name;
    this.storage = storage;
    this.accessModes = ['ReadWriteOnce'];
    this.storageClass = null;
    this.status = 'Pending';
    this.created = Date.now();
  }
}

class K8sStatefulSet {
  constructor(name, namespace, spec) {
    this.name = name;
    this.namespace = namespace;
    this.spec = spec;
    this.replicas = spec.replicas || 1;
    this.readyReplicas = 0;
    this.currentReplicas = 0;
    this.updatedReplicas = 0;
    this.conditions = [];
    this.pvcs = [];
    this.created = Date.now();
  }

  isReady() {
    return this.readyReplicas === this.replicas;
  }
}

class StatefulSetAgent {
  constructor() {
    this.statefulsets = new Map();
    this.stats = {
      total: 0,
      ready: 0,
      scaling: 0
    };
  }

  createStatefulSet(name, namespace, specConfig) {
    const spec = new StatefulSetSpec({
      replicas: specConfig.replicas,
      selector: specConfig.selector,
      serviceName: specConfig.serviceName,
      template: specConfig.template,
      volumeClaimTemplates: specConfig.volumeClaimTemplates || [],
      podManagementPolicy: specConfig.podManagementPolicy,
      updateStrategy: specConfig.updateStrategy
    });

    const sts = new K8sStatefulSet(name, namespace, spec);
    this.statefulsets.set(`${namespace}/${name}`, sts);

    // Create PVCs for volume claim templates
    if (spec.volumeClaimTemplates && spec.volumeClaimTemplates.length > 0) {
      for (let i = 0; i < spec.replicas; i++) {
        spec.volumeClaimTemplates.forEach(template => {
          const pvcName = `${name}-${template.name}-${i}`;
          const claim = new PersistentVolumeClaim(pvcName, template.storage || '10Gi');
          claim.storageClass = template.storageClass || null;
          sts.pvcs.push(claim);
        });
      }
    }

    this.stats.total++;
    console.log(`   Created StatefulSet: ${namespace}/${name} (${sts.replicas} replicas)`);
    return sts;
  }

  getStatefulSet(name, namespace) {
    return this.statefulsets.get(`${namespace}/${name}`);
  }

  listStatefulSets(namespace = null) {
    const all = Array.from(this.statefulsets.values());
    return namespace ? all.filter(s => s.namespace === namespace) : all;
  }

  // Scaling
  scaleStatefulSet(name, namespace, replicas) {
    const sts = this.statefulsets.get(`${namespace}/${name}`);
    if (!sts) throw new Error(`StatefulSet ${namespace}/${name} not found`);

    const oldReplicas = sts.replicas;
    sts.replicas = replicas;

    // Add/remove PVCs based on replica count
    if (sts.spec.volumeClaimTemplates && sts.spec.volumeClaimTemplates.length > 0) {
      if (replicas > oldReplicas) {
        // Add new PVCs for new pods
        for (let i = oldReplicas; i < replicas; i++) {
          sts.spec.volumeClaimTemplates.forEach(pvc => {
            const pvcName = `${name}-${pvc.name}-${i}`;
            sts.pvcs.push(new PersistentVolumeClaim(pvcName, pvc.storage || '10Gi'));
          });
        }
      } else {
        // Remove PVCs for terminated pods
        sts.pvcs = sts.pvcs.filter(pvc => {
          const index = parseInt(pvc.name.split('-').pop());
          return index < replicas;
        });
      }
    }

    console.log(`   Scaled StatefulSet: ${namespace}/${name} from ${oldReplicas} to ${replicas}`);
    return sts;
  }

  // Ordered operations
  scaleUp(name, namespace, targetReplicas) {
    const sts = this.statefulsets.get(`${namespace}/${name}`);
    if (!sts) throw new Error(`StatefulSet ${namespace}/${name} not found`);

    console.log(`   Scaling up ${namespace}/${name} (ordered):`);
    for (let i = sts.replicas; i < targetReplicas; i++) {
      console.log(`     Creating pod ${i}...`);
      sts.readyReplicas++;
    }
    sts.replicas = targetReplicas;

    return sts;
  }

  scaleDown(name, namespace, targetReplicas) {
    const sts = this.statefulsets.get(`${namespace}/${name}`);
    if (!sts) throw new Error(`StatefulSet ${namespace}/${name} not found`);

    console.log(`   Scaling down ${namespace}/${name} (ordered):`);
    for (let i = sts.replicas - 1; i >= targetReplicas; i--) {
      console.log(`     Terminating pod ${i}...`);
    }
    sts.replicas = targetReplicas;
    sts.readyReplicas = targetReplicas;

    return sts;
  }

  // Status
  getStatus(name, namespace) {
    const sts = this.statefulsets.get(`${namespace}/${name}`);
    if (!sts) throw new Error(`StatefulSet ${namespace}/${name} not found`);

    return {
      name: sts.name,
      namespace: sts.namespace,
      replicas: sts.replicas,
      readyReplicas: sts.readyReplicas,
      currentReplicas: sts.currentReplicas,
      updatedReplicas: sts.updatedReplicas,
      conditions: sts.conditions,
      pvcs: sts.pvcs.map(p => ({ name: p.name, storage: p.storage, status: p.status }))
    };
  }

  // Mark ready
  markReady(name, namespace) {
    const sts = this.statefulsets.get(`${namespace}/${name}`);
    if (!sts) throw new Error(`StatefulSet ${namespace}/${name} not found`);

    sts.readyReplicas = sts.replicas;
    sts.currentReplicas = sts.replicas;
    this.stats.ready++;

    // Mark PVCs as bound
    sts.pvcs.forEach(pvc => pvc.status = 'Bound');

    console.log(`   StatefulSet ready: ${namespace}/${name}`);
    return sts;
  }

  // Delete
  deleteStatefulSet(name, namespace) {
    const key = `${namespace}/${name}`;
    if (this.statefulsets.delete(key)) {
      this.stats.total--;
      return { deleted: true };
    }
    throw new Error(`StatefulSet ${namespace}/${name} not found`);
  }

  // Stats
  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new StatefulSetAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent StatefulSet Demo\n');

    // 1. Create StatefulSets
    console.log('1. StatefulSet Creation:');
    agent.createStatefulSet('mysql', 'production', {
      replicas: 3,
      selector: { matchLabels: { app: 'mysql' } },
      serviceName: 'mysql',
      template: {
        containers: [{ name: 'mysql', image: 'mysql:8.0' }]
      },
      volumeClaimTemplates: [
        { name: 'data', storage: '10Gi' }
      ],
      podManagementPolicy: 'OrderedReady'
    });

    agent.createStatefulSet('redis', 'production', {
      replicas: 3,
      selector: { matchLabels: { app: 'redis' } },
      serviceName: 'redis',
      template: {
        containers: [{ name: 'redis', image: 'redis:7' }]
      },
      volumeClaimTemplates: [
        { name: 'data', storage: '5Gi' }
      ]
    });

    agent.createStatefulSet('kafka', 'production', {
      replicas: 3,
      selector: { matchLabels: { app: 'kafka' } },
      serviceName: 'kafka',
      template: {
        containers: [{ name: 'kafka', image: 'kafka:3.5' }]
      },
      volumeClaimTemplates: [
        { name: 'data', storage: '50Gi' }
      ]
    });

    console.log(`   Total StatefulSets: ${agent.statefulsets.size}`);

    // 2. Scale StatefulSet
    console.log('\n2. Scaling:');
    agent.scaleStatefulSet('mysql', 'production', 5);

    // 3. Ordered scale up
    console.log('\n3. Ordered Scale Up:');
    agent.scaleUp('redis', 'production', 4);

    // 4. Ordered scale down
    console.log('\n4. Ordered Scale Down:');
    agent.scaleDown('redis', 'production', 2);

    // 5. Status with PVCs
    console.log('\n5. PVC Management:');
    const status = agent.getStatus('mysql', 'production');
    console.log(`   mysql PVCs: ${status.pvcs.length}`);
    status.pvcs.forEach(p => console.log(`     - ${p.name}: ${p.storage}`));

    // 6. Mark ready
    console.log('\n6. Ready Status:');
    agent.markReady('mysql', 'production');
    agent.markReady('redis', 'production');
    agent.markReady('kafka', 'production');

    // 7. List StatefulSets
    console.log('\n7. Listing:');
    const list = agent.listStatefulSets('production');
    console.log(`   Production StatefulSets: ${list.length}`);
    list.forEach(s => console.log(`     - ${s.name}: ${s.replicas} replicas`));

    // 8. Statistics
    console.log('\n8. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total: ${stats.total}`);
    console.log(`   Ready: ${stats.ready}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'ordering':
    console.log('Ordering Guarantees:');
    console.log('  - Pods created in order (0, 1, 2, ...)');
    console.log('  - Pods terminated in reverse order');
    console.log('  - Pods ready before next pod starts');
    console.log('  - Persistent volume attachment in order');
    break;

  case 'pvc':
    console.log('PVC Management:');
    console.log('  - VolumeClaimTemplates for persistent storage');
    console.log('  - Each pod gets its own PVC');
    console.log('  - PVCs follow pod naming convention');
    console.log('  - PVCs retained after pod termination');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-statefulset.js [demo|ordering|pvc]');
}
