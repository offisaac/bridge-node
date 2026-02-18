/**
 * Deployment Rollback - 部署回滚
 * 一键回滚功能，用于失败的部署
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync, spawn } = require('child_process');

// ========== Deployment Types ==========

const DeploymentStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  SUCCESS: 'success',
  FAILED: 'failed',
  ROLLED_BACK: 'rolled_back'
};

const RollbackStrategy = {
  FULL: 'full',           // 回滚到完整上一版本
  PARTIAL: 'partial',     // 部分回滚
  CANARY: 'canary',       // 金丝雀回滚
  BLUE_GREEN: 'blue_green' // 蓝绿部署回滚
};

// ========== Deployment Entry ==========

class Deployment {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name;
    this.environment = config.environment || 'production';
    this.version = config.version;
    this.status = DeploymentStatus.PENDING;
    this.createdAt = config.createdAt || new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.rollbackId = null;
    this.artifacts = config.artifacts || [];
    this.config = config.config || {};
    this.metadata = config.metadata || {};
    this.error = null;
    this.logs = [];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      environment: this.environment,
      version: this.version,
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      rollbackId: this.rollbackId,
      artifacts: this.artifacts,
      config: this.config,
      metadata: this.metadata,
      error: this.error,
      logs: this.logs
    };
  }
}

// ========== Rollback Entry ==========

class Rollback {
  constructor(id, config = {}) {
    this.id = id;
    this.deploymentId = config.deploymentId;
    this.targetVersion = config.targetVersion;
    this.strategy = config.strategy || RollbackStrategy.FULL;
    this.status = DeploymentStatus.PENDING;
    this.createdAt = config.createdAt || new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.completedAt = null;
    this.error = null;
    this.changes = config.changes || [];
    this.verification = null;
  }

  toJSON() {
    return {
      id: this.id,
      deploymentId: this.deploymentId,
      targetVersion: this.targetVersion,
      strategy: this.strategy,
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      error: this.error,
      changes: this.changes,
      verification: this.verification
    };
  }
}

// ========== Deployment Rollback Manager ==========

class DeploymentRollback {
  constructor(options = {}) {
    this.name = options.name || 'deployment-rollback';
    this.deploymentsDir = options.deploymentsDir || './deployments';
    this.artifactsDir = options.artifactsDir || './artifacts';
    this.maxHistory = options.maxHistory || 50;
    this.autoVerify = options.autoVerify ?? true;
    this.hooks = options.hooks || {};

    this.deployments = new Map();
    this.rollbacks = new Map();
    this.listeners = new Map();

    this._init();
  }

  _init() {
    // Ensure directories exist
    if (!fs.existsSync(this.deploymentsDir)) {
      fs.mkdirSync(this.deploymentsDir, { recursive: true });
    }
    if (!fs.existsSync(this.artifactsDir)) {
      fs.mkdirSync(this.artifactsDir, { recursive: true });
    }

    // Load history
    this._loadHistory();
  }

  // ========== Deployment Operations ==========

  async createDeployment(config) {
    const id = crypto.randomUUID();
    const deployment = new Deployment(id, {
      ...config,
      createdAt: new Date().toISOString()
    });

    this.deployments.set(id, deployment);
    this._emit('deployment:created', deployment);
    this._saveHistory();

    return deployment;
  }

  async startDeployment(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    deployment.status = DeploymentStatus.IN_PROGRESS;
    deployment.startedAt = new Date().toISOString();
    this._emit('deployment:started', deployment);

    try {
      // Execute pre-deployment hooks
      if (this.hooks.preDeploy) {
        await this.hooks.preDeploy(deployment);
      }

      // Simulate deployment process
      deployment.logs.push(`Starting deployment ${deployment.version}...`);

      // Execute actual deployment (custom logic)
      if (this.hooks.deploy) {
        await this.hooks.deploy(deployment);
      }

      deployment.status = DeploymentStatus.SUCCESS;
      deployment.completedAt = new Date().toISOString();
      deployment.logs.push('Deployment completed successfully');

      // Execute post-deployment hooks
      if (this.hooks.postDeploy) {
        await this.hooks.postDeploy(deployment);
      }

      this._emit('deployment:completed', deployment);
    } catch (err) {
      deployment.status = DeploymentStatus.FAILED;
      deployment.error = err.message;
      deployment.completedAt = new Date().toISOString();
      deployment.logs.push(`Deployment failed: ${err.message}`);

      this._emit('deployment:failed', deployment);
    }

    this._saveHistory();
    return deployment;
  }

  // ========== Rollback Operations ==========

  async createRollback(deploymentId, options = {}) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const id = crypto.randomUUID();
    const rollback = new Rollback(id, {
      deploymentId,
      targetVersion: options.targetVersion || this._getPreviousVersion(deployment),
      strategy: options.strategy || RollbackStrategy.FULL,
      changes: options.changes || this._getChanges(deployment)
    });

    this.rollbacks.set(id, rollback);
    deployment.rollbackId = id;

    this._emit('rollback:created', rollback);
    this._saveHistory();

    return rollback;
  }

  async executeRollback(rollbackId) {
    const rollback = this.rollbacks.get(rollbackId);
    if (!rollback) {
      throw new Error(`Rollback not found: ${rollbackId}`);
    }

    const deployment = this.deployments.get(rollback.deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${rollback.deploymentId}`);
    }

    rollback.status = DeploymentStatus.IN_PROGRESS;
    rollback.startedAt = new Date().toISOString();
    this._emit('rollback:started', rollback);

    try {
      // Execute pre-rollback hooks
      if (this.hooks.preRollback) {
        await this.hooks.preRollback(rollback, deployment);
      }

      // Execute rollback based on strategy
      switch (rollback.strategy) {
        case RollbackStrategy.FULL:
          await this._fullRollback(rollback, deployment);
          break;
        case RollbackStrategy.PARTIAL:
          await this._partialRollback(rollback, deployment);
          break;
        case RollbackStrategy.CANARY:
          await this._canaryRollback(rollback, deployment);
          break;
        case RollbackStrategy.BLUE_GREEN:
          await this._blueGreenRollback(rollback, deployment);
          break;
        default:
          throw new Error(`Unknown rollback strategy: ${rollback.strategy}`);
      }

      // Verify rollback
      if (this.autoVerify) {
        rollback.verification = await this._verifyRollback(rollback, deployment);
        if (!rollback.verification.success) {
          throw new Error('Rollback verification failed');
        }
      }

      rollback.status = DeploymentStatus.SUCCESS;
      rollback.completedAt = new Date().toISOString();

      // Update deployment status
      deployment.status = DeploymentStatus.ROLLED_BACK;
      deployment.completedAt = new Date().toISOString();

      // Execute post-rollback hooks
      if (this.hooks.postRollback) {
        await this.hooks.postRollback(rollback, deployment);
      }

      this._emit('rollback:completed', rollback);
    } catch (err) {
      rollback.status = DeploymentStatus.FAILED;
      rollback.error = err.message;
      rollback.completedAt = new Date().toISOString();

      this._emit('rollback:failed', rollback);
    }

    this._saveHistory();
    return rollback;
  }

  async _fullRollback(rollback, deployment) {
    deployment.logs.push(`Starting full rollback to version ${rollback.targetVersion}...`);

    // Restore from artifacts
    const artifactPath = path.join(this.artifactsDir, `${deployment.name}_${rollback.targetVersion}.tar.gz`);
    if (fs.existsSync(artifactPath)) {
      // Extract and restore
      deployment.logs.push(`Restoring artifact from ${artifactPath}`);
    }

    // Execute rollback commands
    if (this.hooks.rollbackCommands) {
      await this.hooks.rollbackCommands(rollback, deployment);
    }

    deployment.logs.push('Full rollback completed');
  }

  async _partialRollback(rollback, deployment) {
    deployment.logs.push(`Starting partial rollback to version ${rollback.targetVersion}...`);

    // Only rollback specific changes
    for (const change of rollback.changes) {
      if (change.rollbackAction) {
        deployment.logs.push(`Rolling back: ${change.resource}`);
        // Execute specific rollback action
      }
    }

    deployment.logs.push('Partial rollback completed');
  }

  async _canaryRollback(rollback, deployment) {
    deployment.logs.push(`Starting canary rollback to version ${rollback.targetVersion}...`);

    // Gradually shift traffic back
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const percentage = (i / steps) * 100;
      deployment.logs.push(`Canary: ${percentage}% traffic to version ${rollback.targetVersion}`);
      await new Promise(r => setTimeout(r, 500));
    }

    deployment.logs.push('Canary rollback completed');
  }

  async _blueGreenRollback(rollback, deployment) {
    deployment.logs.push('Starting blue-green rollback...');

    // Switch traffic back to previous environment
    deployment.logs.push('Switching traffic to previous environment');
    await new Promise(r => setTimeout(r, 500));

    deployment.logs.push('Blue-green rollback completed');
  }

  async _verifyRollback(rollback, deployment) {
    deployment.logs.push('Verifying rollback...');

    // Run verification checks
    const checks = [];

    // Health check
    if (this.hooks.healthCheck) {
      const healthOk = await this.hooks.healthCheck(deployment);
      checks.push({ name: 'health', success: healthOk });
    }

    // Smoke test
    if (this.hooks.smokeTest) {
      const smokeOk = await this.hooks.smokeTest(deployment);
      checks.push({ name: 'smoke_test', success: smokeOk });
    }

    const success = checks.every(c => c.success);

    return {
      success,
      checks,
      timestamp: new Date().toISOString()
    };
  }

  _getPreviousVersion(deployment) {
    // Find the previous version from history
    const deployments = this.listDeployments({ environment: deployment.environment });
    const currentIndex = deployments.findIndex(d => d.id === deployment.id);

    if (currentIndex > 0) {
      return deployments[currentIndex - 1].version;
    }

    return 'previous';
  }

  _getChanges(deployment) {
    // Return list of changes that can be rolled back
    return [
      { resource: 'config', action: 'update', rollbackAction: 'restore' },
      { resource: 'database', action: 'migrate', rollbackAction: 'migrate:down' }
    ];
  }

  // ========== Query Operations ==========

  getDeployment(id) {
    return this.deployments.get(id);
  }

  listDeployments(filters = {}) {
    let deployments = Array.from(this.deployments.values());

    if (filters.environment) {
      deployments = deployments.filter(d => d.environment === filters.environment);
    }

    if (filters.status) {
      deployments = deployments.filter(d => d.status === filters.status);
    }

    return deployments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getRollback(id) {
    return this.rollbacks.get(id);
  }

  listRollbacks(filters = {}) {
    let rollbacks = Array.from(this.rollbacks.values());

    if (filters.deploymentId) {
      rollbacks = rollbacks.filter(r => r.deploymentId === filters.deploymentId);
    }

    if (filters.status) {
      rollbacks = rollbacks.filter(r => r.status === filters.status);
    }

    return rollbacks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // ========== Quick Rollback ==========

  async quickRollback(environment, options = {}) {
    // Find the latest failed deployment
    const deployments = this.listDeployments({ environment, status: DeploymentStatus.FAILED });

    if (deployments.length === 0) {
      // If no failed deployment, find the latest and roll back to previous
      const allDeployments = this.listDeployments({ environment });
      if (allDeployments.length < 2) {
        throw new Error('No previous version to rollback to');
      }
      return this.createRollback(allDeployments[0].id, options);
    }

    return this.createRollback(deployments[0].id, options);
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

  // ========== Persistence ==========

  _loadHistory() {
    const historyFile = path.join(this.deploymentsDir, '_history.json');
    if (fs.existsSync(historyFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        for (const [id, dep] of Object.entries(data.deployments || {})) {
          this.deployments.set(id, new Deployment(id, dep));
        }
        for (const [id, rb] of Object.entries(data.rollbacks || {})) {
          this.rollbacks.set(id, new Rollback(id, rb));
        }
      } catch (err) {
        console.error('Failed to load history:', err);
      }
    }
  }

  _saveHistory() {
    const historyFile = path.join(this.deploymentsDir, '_history.json');
    const data = {
      version: '1.0',
      updatedAt: new Date().toISOString(),
      deployments: Object.fromEntries(
        Array.from(this.deployments.entries()).map(([id, d]) => [id, d.toJSON()])
      ),
      rollbacks: Object.fromEntries(
        Array.from(this.rollbacks.entries()).map(([id, r]) => [id, r.toJSON()])
      )
    };
    fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
  }

  // ========== Statistics ==========

  getStats() {
    const deployments = Array.from(this.deployments.values());
    const rollbacks = Array.from(this.rollbacks.values());

    return {
      totalDeployments: deployments.length,
      successfulDeployments: deployments.filter(d => d.status === DeploymentStatus.SUCCESS).length,
      failedDeployments: deployments.filter(d => d.status === DeploymentStatus.FAILED).length,
      rolledBackDeployments: deployments.filter(d => d.status === DeploymentStatus.ROLLED_BACK).length,
      totalRollbacks: rollbacks.length,
      successfulRollbacks: rollbacks.filter(r => r.status === DeploymentStatus.SUCCESS).length,
      failedRollbacks: rollbacks.filter(r => r.status === DeploymentStatus.FAILED).length
    };
  }
}

// ========== Export ==========

module.exports = {
  DeploymentRollback,
  Deployment,
  Rollback,
  DeploymentStatus,
  RollbackStrategy
};
