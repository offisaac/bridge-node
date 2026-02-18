/**
 * Agent Rollback Module
 *
 * Provides deployment rollback functionality for agents.
 * Usage: node agent-rollback.js [command] [options]
 *
 * Commands:
 *   deploy <agent-id> <version>    Deploy agent version
 *   rollback <agent-id> [version]  Rollback to previous/specific version
 *   history <agent-id>            Show deployment history
 *   status <agent-id>             Show current deployment status
 *   health <agent-id>             Check agent health
 *   demo                          Run demo
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DEPLOYMENTS_DB = path.join(DATA_DIR, 'rollback-deployments.json');
const HISTORY_DB = path.join(DATA_DIR, 'rollback-history.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON(file, defaultVal = {}) {
  ensureDataDir();
  if (!fs.existsSync(file)) {
    return defaultVal;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return defaultVal;
  }
}

function saveJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Deployment Manager
 */
class DeploymentManager {
  constructor() {
    this.deployments = loadJSON(DEPLOYMENTS_DB, {});
  }

  get(agentId) {
    return this.deployments[agentId] || {
      agentId,
      currentVersion: null,
      status: 'not_deployed',
      deployedAt: null,
      healthStatus: 'unknown'
    };
  }

  deploy(agentId, version, options = {}) {
    const existing = this.get(agentId);
    const deployment = {
      agentId,
      currentVersion: version,
      status: 'deployed',
      deployedAt: Date.now(),
      healthStatus: 'healthy',
      config: options.config || {},
      environment: options.environment || 'production',
      rollbackAvailable: existing.currentVersion !== null,
      previousVersion: existing.currentVersion
    };
    this.deployments[agentId] = deployment;
    saveJSON(DEPLOYMENTS_DB, this.deployments);
    return deployment;
  }

  updateHealth(agentId, status) {
    if (this.deployments[agentId]) {
      this.deployments[agentId].healthStatus = status;
      saveJSON(DEPLOYMENTS_DB, this.deployments);
    }
    return this.get(agentId);
  }

  save() {
    saveJSON(DEPLOYMENTS_DB, this.deployments);
  }
}

/**
 * History Manager
 */
class HistoryManager {
  constructor() {
    this.history = loadJSON(HISTORY_DB, {});
  }

  add(agentId, event) {
    if (!this.history[agentId]) {
      this.history[agentId] = [];
    }

    const entry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      ...event
    };

    this.history[agentId].unshift(entry);
    if (this.history[agentId].length > 100) {
      this.history[agentId] = this.history[agentId].slice(0, 100);
    }
    saveJSON(HISTORY_DB, this.history);
    return entry;
  }

  get(agentId, limit = 10) {
    return (this.history[agentId] || []).slice(0, limit);
  }

  getAll(agentId) {
    return this.history[agentId] || [];
  }
}

/**
 * Rollback Manager
 */
class RollbackManager {
  constructor() {
    this.deployments = new DeploymentManager();
    this.history = new HistoryManager();
  }

  rollback(agentId, targetVersion = null) {
    const current = this.deployments.get(agentId);

    if (current.status === 'not_deployed') {
      return { success: false, reason: 'Agent not deployed' };
    }

    // If no target specified, rollback to previous version
    let versionToRollback;
    if (targetVersion) {
      versionToRollback = targetVersion;
    } else {
      versionToRollback = current.previousVersion;
    }

    if (!versionToRollback) {
      return { success: false, reason: 'No previous version to rollback to' };
    }

    // Perform rollback
    console.log(`\n[Rollback] Starting rollback for ${agentId} to version ${versionToRollback}`);

    // Simulate rollback steps
    console.log('[Rollback] Step 1: Backing up current state...');
    console.log('[Rollback] Step 2: Stopping current version...');
    console.log('[Rollback] Step 3: Restoring previous version...');
    console.log('[Rollback] Step 4: Starting services...');
    console.log('[Rollback] Step 5: Running health checks...');

    // Update deployment
    const rollbackDeployment = this.deployments.deploy(agentId, versionToRollback, {
      config: current.config,
      environment: current.environment
    });

    // Record in history
    this.history.add(agentId, {
      type: 'rollback',
      fromVersion: current.currentVersion,
      toVersion: versionToRollback,
      status: 'success'
    });

    console.log(`[Rollback] Rollback completed successfully`);

    return {
      success: true,
      agentId,
      previousVersion: current.currentVersion,
      rolledBackTo: versionToRollback,
      deployment: rollbackDeployment
    };
  }

  deploy(agentId, version, options = {}) {
    const current = this.deployments.get(agentId);

    console.log(`\n[Deploy] Deploying ${agentId} version ${version}`);

    // Simulate deployment steps
    console.log('[Deploy] Step 1: Validating deployment package...');
    console.log('[Deploy] Step 2: Backing up current state...');
    console.log('[Deploy] Step 3: Stopping old version...');
    console.log('[Deploy] Step 4: Installing new version...');
    console.log('[Deploy] Step 5: Starting services...');
    console.log('[Deploy] Step 6: Running health checks...');

    const deployment = this.deployments.deploy(agentId, version, options);

    // Record in history
    this.history.add(agentId, {
      type: 'deploy',
      version: version,
      previousVersion: current.currentVersion,
      status: 'success'
    });

    console.log(`[Deploy] Deployment completed successfully`);

    return {
      success: true,
      agentId,
      version,
      deployment
    };
  }

  getHistory(agentId) {
    return this.history.get(agentId);
  }

  getStatus(agentId) {
    return this.deployments.get(agentId);
  }

  checkHealth(agentId) {
    const deployment = this.deployments.get(agentId);

    // Simulate health check
    const isHealthy = Math.random() > 0.1; // 90% chance healthy
    const status = isHealthy ? 'healthy' : 'unhealthy';

    this.deployments.updateHealth(agentId, status);

    return {
      agentId,
      status,
      version: deployment.currentVersion,
      checkedAt: new Date().toISOString()
    };
  }
}

/**
 * Demo
 */
function demo() {
  console.log('=== Agent Rollback Demo ===\n');

  const rollbackMgr = new RollbackManager();

  // Deploy agent
  console.log('1. Initial Deployment:');
  const deploy1 = rollbackMgr.deploy('agent-001', '1.0.0', { environment: 'production' });
  console.log(`   Agent: ${deploy1.agentId}, Version: ${deploy1.version}`);

  // Deploy new version
  console.log('\n2. Deploy New Version:');
  const deploy2 = rollbackMgr.deploy('agent-001', '1.1.0', { environment: 'production' });
  console.log(`   Agent: ${deploy2.agentId}, Version: ${deploy2.version}`);

  // Check health
  console.log('\n3. Health Check:');
  const health = rollbackMgr.checkHealth('agent-001');
  console.log(`   Agent: ${health.agentId}, Status: ${health.status}, Version: ${health.version}`);

  // Deploy another version
  console.log('\n4. Deploy Another Version:');
  const deploy3 = rollbackMgr.deploy('agent-001', '1.2.0', { environment: 'production' });
  console.log(`   Agent: ${deploy3.agentId}, Version: ${deploy3.version}`);

  // Show history
  console.log('\n5. Deployment History:');
  const history = rollbackMgr.getHistory('agent-001');
  history.forEach((h, i) => {
    console.log(`   ${i + 1}. [${h.type}] ${h.version || h.toVersion} - ${h.status}`);
  });

  // Show status
  console.log('\n6. Current Status:');
  const status = rollbackMgr.getStatus('agent-001');
  console.log(`   Agent: ${status.agentId}`);
  console.log(`   Current Version: ${status.currentVersion}`);
  console.log(`   Status: ${status.status}`);
  console.log(`   Health: ${status.healthStatus}`);
  console.log(`   Previous Version: ${status.previousVersion}`);
  console.log(`   Rollback Available: ${status.rollbackAvailable}`);

  // Rollback
  console.log('\n7. Rollback to Previous Version:');
  const rollback = rollbackMgr.rollback('agent-001');
  console.log(`   Success: ${rollback.success}`);
  if (rollback.success) {
    console.log(`   Rolled back to: ${rollback.rolledBackTo}`);
  }

  // Show status after rollback
  console.log('\n8. Status After Rollback:');
  const statusAfter = rollbackMgr.getStatus('agent-001');
  console.log(`   Current Version: ${statusAfter.currentVersion}`);
  console.log(`   Previous Version: ${statusAfter.previousVersion}`);

  // Show history after rollback
  console.log('\n9. History After Rollback:');
  const historyAfter = rollbackMgr.getHistory('agent-001');
  historyAfter.slice(0, 3).forEach((h, i) => {
    console.log(`   ${i + 1}. [${h.type}] ${h.version || h.toVersion} - ${h.status}`);
  });

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'deploy') {
  const agentId = args[1];
  const version = args[2];
  if (agentId && version) {
    const rollbackMgr = new RollbackManager();
    const result = rollbackMgr.deploy(agentId, version);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Usage: deploy <agent-id> <version>');
  }
} else if (cmd === 'rollback') {
  const agentId = args[1];
  const version = args[2] || null;
  if (agentId) {
    const rollbackMgr = new RollbackManager();
    const result = rollbackMgr.rollback(agentId, version);
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('Usage: rollback <agent-id> [version]');
  }
} else if (cmd === 'history') {
  const agentId = args[1];
  if (agentId) {
    const rollbackMgr = new RollbackManager();
    const history = rollbackMgr.getHistory(agentId);
    console.log(`Deployment history for ${agentId}:`);
    history.forEach((h, i) => {
      console.log(`  ${i + 1}. [${h.type}] ${h.version || h.toVersion} - ${h.status} (${h.timestamp})`);
    });
  } else {
    console.log('Usage: history <agent-id>');
  }
} else if (cmd === 'status') {
  const agentId = args[1];
  if (agentId) {
    const rollbackMgr = new RollbackManager();
    const status = rollbackMgr.getStatus(agentId);
    console.log(JSON.stringify(status, null, 2));
  } else {
    console.log('Usage: status <agent-id>');
  }
} else if (cmd === 'health') {
  const agentId = args[1];
  if (agentId) {
    const rollbackMgr = new RollbackManager();
    const health = rollbackMgr.checkHealth(agentId);
    console.log(JSON.stringify(health, null, 2));
  } else {
    console.log('Usage: health <agent-id>');
  }
} else if (cmd === 'demo') {
  demo();
} else {
  console.log('Agent Rollback');
  console.log('Usage: node agent-rollback.js [command]');
  console.log('Commands:');
  console.log('  deploy <agent-id> <version>  Deploy agent version');
  console.log('  rollback <agent-id> [version] Rollback to previous/specific version');
  console.log('  history <agent-id>           Show deployment history');
  console.log('  status <agent-id>            Show current deployment status');
  console.log('  health <agent-id>            Check agent health');
  console.log('  demo                         Run demo');
}
