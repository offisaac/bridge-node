/**
 * Agent Deployment2 - Kubernetes Deployment Management Agent
 *
 * Deployment strategies, scaling, rolling updates, rollback.
 *
 * Usage: node agent-deployment2.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   strategies - Show deployment strategies
 *   scaling   - Show scaling features
 */

class DeploymentStrategy {
  static RECREATE = 'Recreate';
  static ROLLING_UPDATE = 'RollingUpdate';
  static BLUE_GREEN = 'BlueGreen';
  static CANARY = 'Canary';
}

class DeploymentCondition {
  constructor(type, status) {
    this.type = type;
    this.status = status;
    this.lastTransitionTime = Date.now();
    this.reason = '';
    this.message = '';
  }
}

class K8sDeployment {
  constructor(name, namespace, spec) {
    this.name = name;
    this.namespace = namespace;
    this.spec = spec;
    this.replicas = spec.replicas || 1;
    this.readyReplicas = 0;
    this.updatedReplicas = 0;
    this.availableReplicas = 0;
    this.unavailableReplicas = 0;
    this.conditions = [];
    this.strategy = spec.strategy || DeploymentStrategy.ROLLING_UPDATE;
    this.created = Date.now();
    this.updated = null;
  }

  isReady() {
    return this.readyReplicas === this.replicas;
  }

  getProgressDeadline() {
    return this.spec.progressDeadlineSeconds || 600;
  }
}

class DeploymentAgent {
  constructor() {
    this.deployments = new Map();
    this.revisionHistory = new Map();
    this.stats = {
      total: 0,
      ready: 0,
      updating: 0,
      failed: 0
    };
  }

  createDeployment(name, namespace, spec) {
    const deployment = new K8sDeployment(name, namespace, {
      replicas: spec.replicas || 1,
      selector: spec.selector || { matchLabels: { app: name } },
      template: spec.template || {},
      strategy: spec.strategy || DeploymentStrategy.ROLLING_UPDATE,
      minReadySeconds: spec.minReadySeconds || 0,
      progressDeadlineSeconds: spec.progressDeadlineSeconds || 600,
      revisionHistoryLimit: spec.revisionHistoryLimit || 10
    });

    this.deployments.set(`${namespace}/${name}`, deployment);
    this.stats.total++;

    // Initialize revision history
    this.revisionHistory.set(`${namespace}/${name}`, [{
      revision: 1,
      created: Date.now(),
      replicas: deployment.replicas
    }]);

    console.log(`   Created deployment: ${namespace}/${name} (${deployment.replicas} replicas)`);
    return deployment;
  }

  getDeployment(name, namespace) {
    return this.deployments.get(`${namespace}/${name}`);
  }

  listDeployments(namespace = null) {
    const all = Array.from(this.deployments.values());
    return namespace ? all.filter(d => d.namespace === namespace) : all;
  }

  scaleDeployment(name, namespace, replicas) {
    const deployment = this.deployments.get(`${namespace}/${name}`);
    if (!deployment) throw new Error(`Deployment ${namespace}/${name} not found`);

    const oldReplicas = deployment.replicas;
    deployment.replicas = replicas;
    deployment.updated = Date.now();

    console.log(`   Scaled deployment: ${namespace}/${name} from ${oldReplicas} to ${replicas} replicas`);
    return deployment;
  }

  // Rolling update
  startRollingUpdate(name, namespace, newImage) {
    const deployment = this.deployments.get(`${namespace}/${name}`);
    if (!deployment) throw new Error(`Deployment ${namespace}/${name} not found`);

    if (deployment.strategy === DeploymentStrategy.ROLLING_UPDATE) {
      deployment.updatedReplicas = Math.ceil(deployment.replicas * 0.25);
      console.log(`   Started rolling update: ${namespace}/${name} (maxSurge: 25%)`);
    } else {
      console.log(`   Strategy ${deployment.strategy} not supported for rolling update`);
    }

    return deployment;
  }

  completeRollingUpdate(name, namespace) {
    const deployment = this.deployments.get(`${namespace}/${name}`);
    if (!deployment) throw new Error(`Deployment ${namespace}/${name} not found`);

    deployment.readyReplicas = deployment.replicas;
    deployment.updatedReplicas = deployment.replicas;
    deployment.availableReplicas = deployment.replicas;

    // Update revision history
    const history = this.revisionHistory.get(`${namespace}/${name}`);
    if (history) {
      history.push({
        revision: history.length + 1,
        created: Date.now(),
        replicas: deployment.replicas
      });
    }

    console.log(`   Completed rolling update: ${namespace}/${name}`);
    this.stats.ready++;
    return deployment;
  }

  // Rollback
  rollbackToRevision(name, namespace, revision) {
    const deployment = this.deployments.get(`${namespace}/${name}`);
    if (!deployment) throw new Error(`Deployment ${namespace}/${name} not found`);

    console.log(`   Rolled back: ${namespace}/${name} to revision ${revision}`);
    return deployment;
  }

  // Status
  getDeploymentStatus(name, namespace) {
    const deployment = this.deployments.get(`${namespace}/${name}`);
    if (!deployment) throw new Error(`Deployment ${namespace}/${name} not found`);

    return {
      name: deployment.name,
      namespace: deployment.namespace,
      replicas: deployment.replicas,
      readyReplicas: deployment.readyReplicas,
      updatedReplicas: deployment.updatedReplicas,
      availableReplicas: deployment.availableReplicas,
      conditions: deployment.conditions,
      strategy: deployment.strategy
    };
  }

  // Conditions
  setCondition(name, namespace, type, status, reason, message) {
    const deployment = this.deployments.get(`${namespace}/${name}`);
    if (!deployment) throw new Error(`Deployment ${namespace}/${name} not found`);

    const condition = new DeploymentCondition(type, status);
    condition.reason = reason;
    condition.message = message;
    deployment.conditions.push(condition);

    return deployment;
  }

  // Pause/Resume
  pauseDeployment(name, namespace) {
    const deployment = this.deployments.get(`${namespace}/${name}`);
    if (!deployment) throw new Error(`Deployment ${namespace}/${name} not found`);

    deployment.conditions.push(new DeploymentCondition('Progressing', 'False'));
    console.log(`   Paused deployment: ${namespace}/${name}`);
    return deployment;
  }

  resumeDeployment(name, namespace) {
    const deployment = this.deployments.get(`${namespace}/${name}`);
    if (!deployment) throw new Error(`Deployment ${namespace}/${name} not found`);

    deployment.conditions = deployment.conditions.filter(c => c.type !== 'Progressing' || c.status !== 'False');
    console.log(`   Resumed deployment: ${namespace}/${name}`);
    return deployment;
  }

  // Delete
  deleteDeployment(name, namespace) {
    const key = `${namespace}/${name}`;
    if (this.deployments.delete(key)) {
      this.revisionHistory.delete(key);
      this.stats.total--;
      return { deleted: true };
    }
    throw new Error(`Deployment ${namespace}/${name} not found`);
  }

  // Stats
  getStats() {
    return { ...this.stats, total: this.deployments.size };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const deploymentAgent = new DeploymentAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Deployment2 Demo\n');

    // 1. Create deployments
    console.log('1. Deployment Creation:');
    deploymentAgent.createDeployment('web-app', 'production', {
      replicas: 3,
      selector: { matchLabels: { app: 'web-app' } },
      template: {
        containers: [{ name: 'nginx', image: 'nginx:1.25' }]
      },
      strategy: DeploymentStrategy.ROLLING_UPDATE,
      minReadySeconds: 10
    });

    deploymentAgent.createDeployment('api-service', 'production', {
      replicas: 5,
      selector: { matchLabels: { app: 'api' } },
      template: {
        containers: [{ name: 'api', image: 'myapi:v2' }]
      },
      strategy: DeploymentStrategy.ROLLING_UPDATE
    });

    deploymentAgent.createDeployment('worker', 'production', {
      replicas: 2,
      selector: { matchLabels: { app: 'worker' } },
      template: {
        containers: [{ name: 'worker', image: 'worker:v1' }]
      },
      strategy: DeploymentStrategy.RECREATE
    });

    console.log(`   Total deployments: ${deploymentAgent.deployments.size}`);

    // 2. Scale deployments
    console.log('\n2. Scaling:');
    deploymentAgent.scaleDeployment('web-app', 'production', 5);
    deploymentAgent.scaleDeployment('api-service', 'production', 10);

    // 3. Rolling update
    console.log('\n3. Rolling Update:');
    deploymentAgent.startRollingUpdate('web-app', 'production', 'nginx:1.26');
    deploymentAgent.completeRollingUpdate('web-app', 'production');

    // 4. Rollback
    console.log('\n4. Rollback:');
    deploymentAgent.rollbackToRevision('web-app', 'production', 1);

    // 5. Pause/Resume
    console.log('\n5. Pause/Resume:');
    deploymentAgent.pauseDeployment('api-service', 'production');
    deploymentAgent.resumeDeployment('api-service', 'production');

    // 6. Deployment status
    console.log('\n6. Deployment Status:');
    const status = deploymentAgent.getDeploymentStatus('web-app', 'production');
    console.log(`   web-app: ${status.readyReplicas}/${status.replicas} ready`);
    console.log(`   Strategy: ${status.strategy}`);

    // 7. Conditions
    console.log('\n7. Conditions:');
    deploymentAgent.setCondition('web-app', 'production', 'Available', 'True', 'MinimumReplicasAvailable', 'Deployment has minimum availability');
    const conditions = deploymentAgent.getDeploymentStatus('web-app', 'production');
    console.log(`   Conditions: ${conditions.conditions.length}`);

    // 8. Revision history
    console.log('\n8. Revision History:');
    const history = deploymentAgent.revisionHistory.get('production/web-app');
    console.log(`   Revisions: ${history.length}`);

    // 9. List deployments
    console.log('\n9. Deployment Listing:');
    const deps = deploymentAgent.listDeployments('production');
    console.log(`   Production deployments: ${deps.length}`);
    deps.forEach(d => console.log(`     - ${d.name}: ${d.replicas} replicas`));

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = deploymentAgent.getStats();
    console.log(`   Total: ${stats.total}`);
    console.log(`   Ready: ${stats.ready}`);
    console.log(`   Updating: ${stats.updating}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'strategies':
    console.log('Deployment Strategies:');
    console.log('  - Recreate: Delete old pods, create new ones');
    console.log('  - RollingUpdate: Gradually replace old pods');
    console.log('  - BlueGreen: Run both versions simultaneously');
    console.log('  - Canary: Route small traffic to new version');
    break;

  case 'scaling':
    console.log('Scaling Features:');
    console.log('  - Manual scaling with replicas count');
    console.log('  - Horizontal Pod Autoscaler (HPA)');
    console.log('  - Vertical Pod Autoscaler (VPA)');
    console.log('  - Custom metrics scaling');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-deployment2.js [demo|strategies|scaling]');
}
