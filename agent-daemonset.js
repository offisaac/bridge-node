/**
 * Agent DaemonSet - Kubernetes DaemonSet Management Agent
 *
 * DaemonSet lifecycle, node scheduling, rolling updates.
 *
 * Usage: node agent-daemonset.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   scheduling - Show scheduling features
 *   updates    - Show update strategies
 */

class DaemonSetSpec {
  constructor(config) {
    this.selector = config.selector || {};
    this.template = config.template || {};
    this.updateStrategy = config.updateStrategy || 'RollingUpdate';
    this.minReadySeconds = config.minReadySeconds || 0;
    this.revisionHistoryLimit = config.revisionHistoryLimit || 10;
  }
}

class DaemonSetCondition {
  constructor(type, status) {
    this.type = type;
    this.status = status;
    this.lastTransitionTime = Date.now();
  }
}

class K8sDaemonSet {
  constructor(name, namespace, spec) {
    this.name = name;
    this.namespace = namespace;
    this.spec = spec;
    this.desiredNumberScheduled = 0;
    this.currentNumberScheduled = 0;
    this.numberReady = 0;
    this.numberAvailable = 0;
    this.numberMisscheduled = 0;
    this.conditions = [];
    this.nodeAssignments = new Map();
    this.created = Date.now();
  }
}

class DaemonSetAgent {
  constructor() {
    this.daemonsets = new Map();
    this.stats = {
      total: 0,
      ready: 0,
      scheduled: 0
    };
  }

  createDaemonSet(name, namespace, specConfig) {
    const spec = new DaemonSetSpec({
      selector: specConfig.selector,
      template: specConfig.template,
      updateStrategy: specConfig.updateStrategy,
      minReadySeconds: specConfig.minReadySeconds
    });

    const ds = new K8sDaemonSet(name, namespace, spec);
    this.daemonsets.set(`${namespace}/${name}`, ds);
    this.stats.total++;

    console.log(`   Created DaemonSet: ${namespace}/${name}`);
    return ds;
  }

  getDaemonSet(name, namespace) {
    return this.daemonsets.get(`${namespace}/${name}`);
  }

  listDaemonSets(namespace = null) {
    const all = Array.from(this.daemonsets.values());
    return namespace ? all.filter(d => d.namespace === namespace) : all;
  }

  // Schedule to nodes
  scheduleToNodes(name, namespace, nodes) {
    const ds = this.daemonsets.get(`${namespace}/${name}`);
    if (!ds) throw new Error(`DaemonSet ${namespace}/${name} not found`);

    ds.desiredNumberScheduled = nodes.length;
    ds.currentNumberScheduled = nodes.length;

    nodes.forEach(node => {
      ds.nodeAssignments.set(node, {
        scheduled: true,
        ready: true
      });
    });

    ds.numberReady = nodes.length;
    ds.numberAvailable = nodes.length;
    this.stats.scheduled += nodes.length;

    console.log(`   Scheduled ${namespace}/${name} to ${nodes.length} nodes`);
    return ds;
  }

  // Update
  startRollingUpdate(name, namespace) {
    const ds = this.daemonsets.get(`${namespace}/${name}`);
    if (!ds) throw new Error(`DaemonSet ${namespace}/${name} not found`);

    console.log(`   Started rolling update: ${namespace}/${name}`);
    return ds;
  }

  completeRollingUpdate(name, namespace) {
    const ds = this.daemonsets.get(`${namespace}/${name}`);
    if (!ds) throw new Error(`DaemonSet ${namespace}/${name} not found`);

    ds.conditions.push(new DaemonSetCondition('Updated', 'True'));
    this.stats.ready++;

    console.log(`   Completed rolling update: ${namespace}/${name}`);
    return ds;
  }

  // Rollback
  rollback(name, namespace) {
    const ds = this.daemonsets.get(`${namespace}/${name}`);
    if (!ds) throw new Error(`DaemonSet ${namespace}/${name} not found`);

    console.log(`   Rolled back: ${namespace}/${name}`);
    return ds;
  }

  // Node operations
  scheduleToNewNode(name, namespace, nodeName) {
    const ds = this.daemonsets.get(`${namespace}/${name}`);
    if (!ds) throw new Error(`DaemonSet ${namespace}/${name} not found`);

    ds.desiredNumberScheduled++;
    ds.currentNumberScheduled++;
    ds.nodeAssignments.set(nodeName, { scheduled: true, ready: true });
    ds.numberReady++;
    ds.numberAvailable++;

    console.log(`   Scheduled to new node: ${namespace}/${name} -> ${nodeName}`);
    return ds;
  }

  unscheduleFromNode(name, namespace, nodeName) {
    const ds = this.daemonsets.get(`${namespace}/${name}`);
    if (!ds) throw new Error(`DaemonSet ${namespace}/${name} not found`);

    if (ds.nodeAssignments.has(nodeName)) {
      ds.nodeAssignments.delete(nodeName);
      ds.desiredNumberScheduled--;
      ds.currentNumberScheduled--;
      ds.numberReady--;
      ds.numberAvailable--;

      console.log(`   Unscheduled from node: ${namespace}/${name} <- ${nodeName}`);
    }

    return ds;
  }

  // Status
  getStatus(name, namespace) {
    const ds = this.daemonsets.get(`${namespace}/${name}`);
    if (!ds) throw new Error(`DaemonSet ${namespace}/${name} not found`);

    return {
      name: ds.name,
      namespace: ds.namespace,
      desiredNumberScheduled: ds.desiredNumberScheduled,
      currentNumberScheduled: ds.currentNumberScheduled,
      numberReady: ds.numberReady,
      numberAvailable: ds.numberAvailable,
      numberMisscheduled: ds.numberMisscheduled,
      conditions: ds.conditions,
      nodes: Array.from(ds.nodeAssignments.keys())
    };
  }

  // Delete
  deleteDaemonSet(name, namespace) {
    const key = `${namespace}/${name}`;
    if (this.daemonsets.delete(key)) {
      this.stats.total--;
      return { deleted: true };
    }
    throw new Error(`DaemonSet ${namespace}/${name} not found`);
  }

  // Stats
  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new DaemonSetAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent DaemonSet Demo\n');

    // 1. Create DaemonSets
    console.log('1. DaemonSet Creation:');
    agent.createDaemonSet('node-exporter', 'monitoring', {
      selector: { matchLabels: { app: 'node-exporter' } },
      template: {
        containers: [{ name: 'exporter', image: 'prom/node-exporter:v1.6.0' }]
      },
      updateStrategy: 'RollingUpdate'
    });

    agent.createDaemonSet('fluentd', 'logging', {
      selector: { matchLabels: { app: 'fluentd' } },
      template: {
        containers: [{ name: 'fluentd', image: 'fluentd:v1.16' }]
      },
      updateStrategy: 'RollingUpdate'
    });

    agent.createDaemonSet('nginx-ingress', 'ingress-nginx', {
      selector: { matchLabels: { app: 'nginx-ingress' } },
      template: {
        containers: [{ name: 'controller', image: 'nginx/nginx-ingress:3.0' }]
      },
      updateStrategy: 'OnDelete'
    });

    console.log(`   Total DaemonSets: ${agent.daemonsets.size}`);

    // 2. Schedule to nodes
    console.log('\n2. Node Scheduling:');
    agent.scheduleToNodes('node-exporter', 'monitoring', ['node-1', 'node-2', 'node-3']);
    agent.scheduleToNodes('fluentd', 'logging', ['node-1', 'node-2', 'node-3']);
    agent.scheduleToNodes('nginx-ingress', 'ingress-nginx', ['node-1', 'node-2']);

    // 3. Rolling update
    console.log('\n3. Rolling Update:');
    agent.startRollingUpdate('node-exporter', 'monitoring');
    agent.completeRollingUpdate('node-exporter', 'monitoring');

    // 4. Node operations
    console.log('\n4. Node Operations:');
    agent.scheduleToNewNode('fluentd', 'logging', 'node-4');
    agent.unscheduleFromNode('fluentd', 'logging', 'node-3');

    // 5. Status
    console.log('\n5. DaemonSet Status:');
    const status = agent.getStatus('node-exporter', 'monitoring');
    console.log(`   Desired: ${status.desiredNumberScheduled}`);
    console.log(`   Ready: ${status.numberReady}`);
    console.log(`   Nodes: ${status.nodes.join(', ')}`);

    // 6. Rollback
    console.log('\n6. Rollback:');
    agent.rollback('nginx-ingress', 'ingress-nginx');

    // 7. List
    console.log('\n7. Listing:');
    const list = agent.listDaemonSets('monitoring');
    console.log(`   Monitoring DaemonSets: ${list.length}`);

    // 8. Statistics
    console.log('\n8. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total: ${stats.total}`);
    console.log(`   Ready: ${stats.ready}`);
    console.log(`   Scheduled: ${stats.scheduled}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'scheduling':
    console.log('Scheduling Features:');
    console.log('  - Runs on all nodes by default');
    console.log('  - Node selector support');
    console.log('  - Node affinity/anti-affinity');
    console.log('  - Taints and tolerations');
    console.log('  - Pod affinity/anti-affinity');
    break;

  case 'updates':
    console.log('Update Strategies:');
    console.log('  - RollingUpdate: Gradually update pods');
    console.log('  - OnDelete: Update when manually deleted');
    console.log('  - MaxSurge: Extra pods during update');
    console.log('  - MaxUnavailable: Unavailable pods during update');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-daemonset.js [demo|scheduling|updates]');
}
