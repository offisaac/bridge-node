/**
 * Canary Deployment - 金丝雀部署
 * 金丝雀部署与渐进式发布
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ========== Deployment Types ==========

const DeploymentStrategy = {
  CANARY: 'canary',
  ROLLING: 'rolling',
  BLUE_GREEN: 'blue_green',
  RECANARY: 'recannary'
};

const CanaryStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ROLLED_BACK: 'rolled_back'
};

// ========== Canary Deployment ==========

class CanaryDeployment {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name;
    this.strategy = config.strategy || DeploymentStrategy.CANARY;
    this.stableVersion = config.stableVersion;
    this.canaryVersion = config.canaryVersion;
    this.trafficPercent = config.trafficPercent || 0;
    this.targetPercent = config.targetPercent || 100;
    this.steps = config.steps || [10, 25, 50, 75, 100];
    this.stepInterval = config.stepInterval || 60000; // 1 minute
    this.status = CanaryStatus.PENDING;
    this.createdAt = config.createdAt || new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.currentStep = 0;
    this.metrics = {};
    this.error = null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      strategy: this.strategy,
      stableVersion: this.stableVersion,
      canaryVersion: this.canaryVersion,
      trafficPercent: this.trafficPercent,
      targetPercent: this.targetPercent,
      steps: this.steps,
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      currentStep: this.currentStep,
      metrics: this.metrics,
      error: this.error
    };
  }
}

// ========== Canary Manager ==========

class CanaryManager {
  constructor(options = {}) {
    this.name = options.name || 'canary-manager';
    this.deploymentsDir = options.deploymentsDir || './canary-deployments';
    this.deployments = new Map();
    this.listeners = new Map();

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.deploymentsDir)) {
      fs.mkdirSync(this.deploymentsDir, { recursive: true });
    }
    this._loadDeployments();
  }

  // ========== Deployment Management ==========

  createDeployment(config) {
    const id = crypto.randomUUID();
    const deployment = new CanaryDeployment(id, config);
    this.deployments.set(id, deployment);
    this._saveDeployment(deployment);
    this._emit('deployment:created', deployment);
    return deployment;
  }

  getDeployment(id) {
    return this.deployments.get(id);
  }

  listDeployments(filters = {}) {
    let deployments = Array.from(this.deployments.values());

    if (filters.status) {
      deployments = deployments.filter(d => d.status === filters.status);
    }

    return deployments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // ========== Canary Execution ==========

  async startCanary(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    deployment.status = CanaryStatus.RUNNING;
    deployment.startedAt = new Date().toISOString();
    deployment.trafficPercent = deployment.steps[0] || 0;

    this._emit('canary:started', deployment);

    try {
      // Execute canary deployment
      await this._runCanarySteps(deployment);

      // Promote to stable if successful
      await this._promoteToStable(deployment);

      deployment.status = CanaryStatus.COMPLETED;
      deployment.completedAt = new Date().toISOString();
      deployment.trafficPercent = 100;

      this._emit('canary:completed', deployment);
    } catch (err) {
      if (deployment.status !== CanaryStatus.PAUSED) {
        deployment.status = CanaryStatus.FAILED;
        deployment.error = err.message;
      }
      deployment.completedAt = new Date().toISOString();
      this._emit('canary:failed', deployment);
    }

    this._saveDeployment(deployment);
    return deployment;
  }

  async _runCanarySteps(deployment) {
    for (let i = 0; i < deployment.steps.length; i++) {
      deployment.currentStep = i;
      deployment.trafficPercent = deployment.steps[i];

      this._emit('canary:step', deployment);

      // Simulate traffic shift
      await this._shiftTraffic(deployment);

      // Wait for interval
      await new Promise(r => setTimeout(r, deployment.stepInterval));

      // Check metrics before proceeding
      const metrics = await this._collectMetrics(deployment);
      deployment.metrics = metrics;

      // If metrics are bad, rollback
      if (!this._isMetricsHealthy(metrics)) {
        throw new Error(`Canary metrics unhealthy at ${deployment.trafficPercent}%`);
      }

      this._emit('canary:step:completed', deployment);
    }
  }

  async _shiftTraffic(deployment) {
    // In production, would configure load balancer or service mesh
    console.log(`Shifting ${deployment.trafficPercent}% traffic to canary version ${deployment.canaryVersion}`);
    deployment.metrics.trafficShifted = deployment.trafficPercent;
  }

  async _collectMetrics(deployment) {
    // In production, would collect from monitoring system
    return {
      requestCount: Math.floor(Math.random() * 1000),
      errorRate: Math.random() * 0.05,
      latencyP50: 50 + Math.random() * 100,
      latencyP99: 100 + Math.random() * 500,
      successRate: 0.95 + Math.random() * 0.05
    };
  }

  _isMetricsHealthy(metrics) {
    // Basic health checks
    return metrics.errorRate < 0.05 &&
           metrics.latencyP99 < 1000 &&
           metrics.successRate > 0.95;
  }

  async _promoteToStable(deployment) {
    this._emit('promotion:started', deployment);

    // Simulate promotion
    console.log(`Promoting canary ${deployment.canaryVersion} to stable`);

    this._emit('promotion:completed', deployment);
  }

  // ========== Rollback =========-

  async rollback(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    this._emit('rollback:started', deployment);

    try {
      // Shift all traffic back to stable
      deployment.trafficPercent = 0;
      await this._shiftTrafficBack(deployment);

      deployment.status = CanaryStatus.ROLLED_BACK;
      deployment.completedAt = new Date().toISOString();

      this._emit('rollback:completed', deployment);
    } catch (err) {
      deployment.status = CanaryStatus.FAILED;
      deployment.error = err.message;
      this._emit('rollback:failed', deployment);
    }

    this._saveDeployment(deployment);
    return deployment;
  }

  async _shiftTrafficBack(deployment) {
    console.log(`Rolling back traffic to stable version ${deployment.stableVersion}`);
  }

  // ========== Pause/Resume =========-

  async pauseCanary(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    if (deployment.status !== CanaryStatus.RUNNING) {
      throw new Error('Canary is not running');
    }

    deployment.status = CanaryStatus.PAUSED;
    this._emit('canary:paused', deployment);
    this._saveDeployment(deployment);

    return deployment;
  }

  async resumeCanary(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    if (deployment.status !== CanaryStatus.PAUSED) {
      throw new Error('Canary is not paused');
    }

    deployment.status = CanaryStatus.RUNNING;
    this._emit('canary:resumed', deployment);

    try {
      await this._runCanarySteps(deployment);
      await this._promoteToStable(deployment);

      deployment.status = CanaryStatus.COMPLETED;
      deployment.completedAt = new Date().toISOString();
      deployment.trafficPercent = 100;

      this._emit('canary:completed', deployment);
    } catch (err) {
      deployment.status = CanaryStatus.FAILED;
      deployment.error = err.message;
      this._emit('canary:failed', deployment);
    }

    this._saveDeployment(deployment);
    return deployment;
  }

  // ========== Manual Traffic Control ==========

  async setTrafficPercent(deploymentId, percent) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    if (deployment.status !== CanaryStatus.RUNNING && deployment.status !== CanaryStatus.PAUSED) {
      throw new Error('Canary is not active');
    }

    deployment.trafficPercent = percent;
    await this._shiftTraffic(deployment);

    this._emit('traffic:updated', deployment);
    this._saveDeployment(deployment);

    return deployment;
  }

  // ========== Event System ==========

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) callbacks.splice(index, 1);
  }

  _emit(event, data) {
    if (!this.listeners.has(event)) return;
    for (const callback of this.listeners.get(event)) {
      try { callback(data); } catch (err) { console.error(err); }
    }
  }

  // ========== Persistence =========-

  _loadDeployments() {
    const historyFile = path.join(this.deploymentsDir, '_deployments.json');
    if (fs.existsSync(historyFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        for (const [id, dep] of Object.entries(data.deployments || {})) {
          this.deployments.set(id, new CanaryDeployment(id, dep));
        }
      } catch (err) {
        console.error('Failed to load deployments:', err);
      }
    }
  }

  _saveDeployment(deployment) {
    const historyFile = path.join(this.deploymentsDir, '_deployments.json');
    const data = {
      version: '1.0',
      updatedAt: new Date().toISOString(),
      deployments: {}
    };

    if (fs.existsSync(historyFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        Object.assign(data.deployments, existing.deployments || {});
      } catch (err) {}
    }

    data.deployments[deployment.id] = deployment.toJSON();
    fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
  }

  // ========== Statistics =========-

  getStats() {
    const deployments = Array.from(this.deployments.values());

    return {
      total: deployments.length,
      running: deployments.filter(d => d.status === CanaryStatus.RUNNING).length,
      completed: deployments.filter(d => d.status === CanaryStatus.COMPLETED).length,
      failed: deployments.filter(d => d.status === CanaryStatus.FAILED).length,
      rolledBack: deployments.filter(d => d.status === CanaryStatus.ROLLED_BACK).length
    };
  }
}

// ========== Export ==========

module.exports = {
  CanaryManager,
  CanaryDeployment,
  DeploymentStrategy,
  CanaryStatus
};
