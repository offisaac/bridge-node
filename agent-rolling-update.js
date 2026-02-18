/**
 * Agent Rolling Update - Rolling Update Manager Module
 *
 * Manages rolling update deployments with health checks and rollback support.
 *
 * Usage: node agent-rolling-update.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   status     - Show current deployment status
 *   history    - Show deployment history
 */

class RollingUpdate {
  constructor(config) {
    this.name = config.name || 'rolling-update';
    this.strategy = config.strategy || 'RollingUpdate';
    this.maxSurge = config.maxSurge || 1;
    this.maxUnavailable = config.maxUnavailable || 0;
    this.minReadySeconds = config.minReadySeconds || 10;
    this.progressDeadlineSeconds = config.progressDeadlineSeconds || 600;

    this.replicas = config.replicas || 3;
    this.currentReplicas = config.currentReplicas || 3;
    this.updatedReplicas = config.updatedReplicas || 0;
    this.readyReplicas = config.readyReplicas || 3;
    this.availableReplicas = config.availableReplicas || 3;

    this.pods = [];
    this.history = [];
    this.currentStep = 0;
    this.isRolling = false;

    this._initSamplePods();
  }

  _initSamplePods() {
    const labels = { app: 'my-app', version: 'v1' };
    for (let i = 1; i <= this.replicas; i++) {
      this.pods.push({
        name: `my-app-${i}`,
        version: 'v1',
        status: 'Running',
        ready: true,
        restarts: 0,
        age: `${i * 10}s`,
        readyConditions: [{ type: 'Ready', status: 'True' }]
      });
    }
  }

  // Start rolling update
  async start(newVersion = 'v2', image = 'my-app:v2') {
    if (this.isRolling) {
      throw new Error('Rolling update already in progress');
    }

    this.isRolling = true;
    this.currentStep = 0;
    const totalSteps = this.replicas;

    console.log(`\n[RollingUpdate] Starting rolling update to ${newVersion}`);
    console.log(`   Strategy: ${this.strategy}`);
    console.log(`   Max Surge: ${this.maxSurge}, Max Unavailable: ${this.maxUnavailable}`);
    console.log(`   Total steps: ${totalSteps}\n`);

    const historyEntry = {
      version: newVersion,
      image: image,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: 'InProgress',
      steps: []
    };

    for (let i = 0; i < this.replicas; i++) {
      this.currentStep = i + 1;

      // Get old pod and replace with new
      const oldPod = this.pods[i];
      const newPod = {
        name: `my-app-${i + 1}`,
        version: newVersion,
        status: 'Running',
        ready: false,
        restarts: 0,
        age: '0s',
        readyConditions: []
      };

      console.log(`[Step ${this.currentStep}/${totalSteps}] Updating pod: ${oldPod.name} (${oldPod.version} -> ${newVersion})`);

      // Simulate pod termination
      this.pods[i] = newPod;

      // Simulate pod readiness
      await this._simulateProgress(newPod, i);

      // Update stats
      this.updatedReplicas = this.currentStep;
      this.readyReplicas = this.currentStep;

      historyEntry.steps.push({
        step: this.currentStep,
        pod: oldPod.name,
        action: 'Replaced',
        timestamp: new Date().toISOString()
      });

      console.log(`   Pod ${newPod.name} is ready\n`);
    }

    historyEntry.completedAt = new Date().toISOString();
    historyEntry.status = 'Completed';
    this.history.push(historyEntry);

    this.isRolling = false;
    this.updatedReplicas = this.replicas;

    console.log(`[RollingUpdate] Rolling update completed successfully\n`);

    return {
      success: true,
      version: newVersion,
      steps: totalSteps
    };
  }

  async _simulateProgress(pod, index) {
    return new Promise(resolve => {
      setTimeout(() => {
        pod.status = 'Running';
        pod.ready = true;
        pod.readyConditions = [{ type: 'Ready', status: 'True' }];
        resolve();
      }, 100);
    });
  }

  // Pause rolling update
  pause() {
    if (!this.isRolling) {
      return { success: false, message: 'No rolling update in progress' };
    }
    console.log(`[RollingUpdate] Rolling update paused at step ${this.currentStep}`);
    return { success: true, pausedAt: this.currentStep };
  }

  // Resume rolling update
  resume() {
    if (this.isRolling) {
      return { success: false, message: 'Rolling update already in progress' };
    }
    console.log(`[RollingUpdate] Resuming rolling update from step ${this.currentStep}`);
    return { success: true, resumedAt: this.currentStep };
  }

  // Rollback to previous version
  async rollback() {
    if (this.history.length === 0) {
      return { success: false, message: 'No history to rollback' };
    }

    const lastUpdate = this.history[this.history.length - 1];
    const previousVersion = this.pods[0]?.version || 'v1';

    console.log(`[RollingUpdate] Rolling back to previous version: ${previousVersion}`);

    // Restore all pods to previous version
    for (let i = 0; i < this.replicas; i++) {
      this.pods[i].version = previousVersion;
      this.pods[i].ready = true;
    }

    this.updatedReplicas = this.replicas;
    this.readyReplicas = this.replicas;

    const rollbackEntry = {
      version: previousVersion,
      image: `my-app:${previousVersion}`,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'RolledBack',
      steps: [{
        action: 'Rollback',
        timestamp: new Date().toISOString()
      }]
    };

    this.history.push(rollbackEntry);

    console.log(`[RollingUpdate] Rollback completed\n`);

    return { success: true, version: previousVersion };
  }

  // Get deployment status
  getStatus() {
    return {
      name: this.name,
      strategy: this.strategy,
      replicas: this.replicas,
      currentReplicas: this.currentReplicas,
      updatedReplicas: this.updatedReplicas,
      readyReplicas: this.readyReplicas,
      availableReplicas: this.availableReplicas,
      isRolling: this.isRolling,
      currentStep: this.currentStep
    };
  }

  // Get pod status
  getPods() {
    return this.pods;
  }

  // Get deployment history
  getHistory() {
    return this.history;
  }

  // Scale replicas
  scale(replicas) {
    const oldReplicas = this.replicas;
    this.replicas = replicas;

    // Add or remove pods
    if (replicas > oldReplicas) {
      for (let i = oldReplicas; i < replicas; i++) {
        this.pods.push({
          name: `my-app-${i + 1}`,
          version: 'v1',
          status: 'Running',
          ready: true,
          restarts: 0,
          age: '0s',
          readyConditions: [{ type: 'Ready', status: 'True' }]
        });
      }
    } else if (replicas < oldReplicas) {
      this.pods = this.pods.slice(0, replicas);
    }

    this.currentReplicas = replicas;
    this.readyReplicas = replicas;
    this.availableReplicas = replicas;

    return {
      success: true,
      oldReplicas,
      newReplicas: replicas
    };
  }

  // Configure strategy
  configureStrategy(maxSurge, maxUnavailable) {
    this.maxSurge = maxSurge;
    this.maxUnavailable = maxUnavailable;
    return {
      success: true,
      maxSurge: this.maxSurge,
      maxUnavailable: this.maxUnavailable
    };
  }
}

function runDemo() {
  console.log('=== Agent Rolling Update Demo\n');

  const rollingUpdate = new RollingUpdate({
    name: 'my-app-deployment',
    replicas: 3,
    maxSurge: 1,
    maxUnavailable: 0,
    strategy: 'RollingUpdate'
  });

  console.log('1. Initial Status:');
  const status = rollingUpdate.getStatus();
  console.log(`   Deployment: ${status.name}`);
  console.log(`   Strategy: ${status.strategy}`);
  console.log(`   Replicas: ${status.replicas} (Ready: ${status.readyReplicas})`);

  console.log('\n2. Pod Status:');
  const pods = rollingUpdate.getPods();
  pods.forEach(p => console.log(`   - ${p.name}: ${p.version} [${p.status}]`));

  console.log('\n3. Start Rolling Update to v2:');
  rollingUpdate.start('v2', 'my-app:v2').then(result => {
    console.log(`   Result: ${result.success ? 'Success' : 'Failed'}`);

    console.log('\n4. Updated Pod Status:');
    const updatedPods = rollingUpdate.getPods();
    updatedPods.forEach(p => console.log(`   - ${p.name}: ${p.version} [${p.status}]`));

    console.log('\n5. Get Status After Update:');
    const newStatus = rollingUpdate.getStatus();
    console.log(`   Updated Replicas: ${newStatus.updatedReplicas}`);
    console.log(`   Ready Replicas: ${newStatus.readyReplicas}`);

    console.log('\n6. Pause Test:');
    console.log(`   Note: Cannot pause during demo (sync operation)`);

    console.log('\n7. Get History:');
    const history = rollingUpdate.getHistory();
    history.forEach((h, i) => {
      console.log(`   #${i + 1}: ${h.version} - ${h.status} (${h.steps.length} steps)`);
    });

    console.log('\n8. Scale Replicas:');
    const scale = rollingUpdate.scale(5);
    console.log(`   Scaled: ${scale.oldReplicas} -> ${scale.newReplicas}`);

    console.log('\n9. Configure Strategy:');
    const strategy = rollingUpdate.configureStrategy(2, 1);
    console.log(`   Max Surge: ${strategy.maxSurge}`);
    console.log(`   Max Unavailable: ${strategy.maxUnavailable}`);

    console.log('\n10. Rollback:');
    rollingUpdate.rollback().then(result => {
      console.log(`   Rolled back to: ${result.version}`);

      const finalPods = rollingUpdate.getPods();
      finalPods.forEach(p => console.log(`   - ${p.name}: ${p.version}`));

      console.log('\n=== Demo Complete ===');
    });
  });
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';

if (command === 'demo') {
  runDemo();
} else if (command === 'status') {
  const rollingUpdate = new RollingUpdate();
  console.log(JSON.stringify(rollingUpdate.getStatus(), null, 2));
} else if (command === 'history') {
  const rollingUpdate = new RollingUpdate();
  console.log(JSON.stringify(rollingUpdate.getHistory(), null, 2));
} else {
  console.log('Usage: node agent-rolling-update.js [demo|status|history]');
}
