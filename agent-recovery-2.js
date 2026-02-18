/**
 * Agent Recovery 2 Module
 *
 * Provides disaster recovery with backup, restore, and failover capabilities.
 * Usage: node agent-recovery-2.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   backup                Create backup
 *   restore <id>          Restore from backup
 *   status                 Show recovery stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';
const BACKUP_DIR = DATA_DIR + '/backups';
const SNAPSHOT_FILE = DATA_DIR + '/recovery-snapshots.json';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureBackupDir() {
  ensureDataDir();
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
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

/**
 * Recovery Types
 */
const RecoveryType = {
  SNAPSHOT: 'snapshot',
  INCREMENTAL: 'incremental',
  CONTINUOUS: 'continuous',
  POINT_IN_TIME: 'point-in-time'
};

/**
 * Backup Status
 */
const BackupStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FAILED: 'failed',
  VERIFIED: 'verified'
};

/**
 * Snapshot
 */
class Snapshot {
  constructor(config) {
    this.id = config.id || `snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.type = config.type || RecoveryType.SNAPSHOT;
    this.data = config.data || {};
    this.metadata = config.metadata || {};
    this.checksum = null;
    this.size = 0;
    this.createdAt = Date.now();
    this.status = BackupStatus.PENDING;
  }

  generateChecksum() {
    const content = JSON.stringify(this.data);
    this.checksum = crypto.createHash('sha256').update(content).digest('hex');
    this.size = Buffer.byteLength(content);
    return this.checksum;
  }

  verify() {
    if (!this.checksum) return false;
    const currentChecksum = this.generateChecksum();
    return currentChecksum === this.checksum;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      size: this.size,
      checksum: this.checksum,
      createdAt: this.createdAt,
      status: this.status,
      metadata: this.metadata
    };
  }
}

/**
 * Backup Manager
 */
class BackupManager {
  constructor(config = {}) {
    this.config = config;
    this.snapshots = new Map();
    this.backupLocations = new Map();
    this.stats = {
      backups: 0,
      restores: 0,
      verifications: 0,
      failures: 0
    };
  }

  async createBackup(name, data, options = {}) {
    ensureBackupDir();
    const snapshot = new Snapshot({
      name,
      type: options.type || RecoveryType.SNAPSHOT,
      data,
      metadata: options.metadata || {}
    });

    snapshot.generateChecksum();
    snapshot.status = BackupStatus.COMPLETED;

    // Save to backup location
    const backupPath = path.join(BACKUP_DIR, `${snapshot.id}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(snapshot.toJSON()));

    this.snapshots.set(snapshot.id, snapshot);
    this.stats.backups++;

    return snapshot;
  }

  async createIncrementalBackup(name, baseData, deltaData) {
    // Calculate delta
    const fullData = { ...baseData, ...deltaData };
    return this.createBackup(name, fullData, { type: RecoveryType.INCREMENTAL });
  }

  async restore(snapshotId) {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      // Try to load from disk
      const backupPath = path.join(BACKUP_DIR, `${snapshotId}.json`);
      if (fs.existsSync(backupPath)) {
        const data = loadJSON(backupPath);
        const restored = new Snapshot(data);
        this.snapshots.set(restored.id, restored);
        return restored;
      }
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    if (!snapshot.verify()) {
      this.stats.failures++;
      throw new Error('Checksum verification failed');
    }

    this.stats.restores++;
    return snapshot;
  }

  async verify(snapshotId) {
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) {
      throw new Error(`Snapshot ${snapshotId} not found`);
    }

    const isValid = snapshot.verify();
    this.stats.verifications++;

    return {
      valid: isValid,
      snapshot: snapshot.toJSON()
    };
  }

  getSnapshot(snapshotId) {
    return this.snapshots.get(snapshotId);
  }

  listSnapshots(options = {}) {
    let results = Array.from(this.snapshots.values());

    if (options.type) {
      results = results.filter(s => s.type === options.type);
    }

    if (options.status) {
      results = results.filter(s => s.status === options.status);
    }

    return results.map(s => s.toJSON()).sort((a, b) => b.createdAt - a.createdAt);
  }

  deleteSnapshot(snapshotId) {
    const snapshot = this.snapshots.get(snapshotId);
    if (snapshot) {
      const backupPath = path.join(BACKUP_DIR, `${snapshotId}.json`);
      if (fs.existsSync(backupPath)) {
        fs.unlinkSync(backupPath);
      }
      this.snapshots.delete(snapshotId);
      return true;
    }
    return false;
  }

  getStats() {
    return {
      ...this.stats,
      snapshots: this.snapshots.size
    };
  }
}

/**
 * Failover Manager
 */
class FailoverManager {
  constructor(config = {}) {
    this.config = config;
    this.primary = config.primary || null;
    this.replicas = new Map();
    this.currentPrimary = null;
    this.failoverCount = 0;
    this.lastFailover = null;
    this.autoFailover = config.autoFailover !== false;
    this.healthCheckInterval = config.healthCheckInterval || 30000;
    this.healthChecker = null;
  }

  setPrimary(endpoint) {
    this.primary = endpoint;
    if (!this.currentPrimary) {
      this.currentPrimary = endpoint;
    }
  }

  addReplica(id, endpoint) {
    this.replicas.set(id, {
      id,
      endpoint,
      priority: this.replicas.size + 1,
      healthy: true,
      lastCheck: Date.now()
    });
  }

  removeReplica(id) {
    return this.replicas.delete(id);
  }

  async checkHealth() {
    for (const [id, replica] of this.replicas) {
      // Simulate health check
      replica.healthy = Math.random() > 0.1; // 90% healthy
      replica.lastCheck = Date.now();
    }

    if (this.primary) {
      const primaryHealthy = Math.random() > 0.1;
      if (!primaryHealthy && this.autoFailover) {
        await this.triggerFailover();
      }
    }
  }

  async triggerFailover() {
    if (!this.autoFailover) {
      return { success: false, reason: 'Auto failover disabled' };
    }

    // Find best replica
    const healthyReplicas = Array.from(this.replicas.values())
      .filter(r => r.healthy)
      .sort((a, b) => a.priority - b.priority);

    if (healthyReplicas.length === 0) {
      return { success: false, reason: 'No healthy replicas' };
    }

    const newPrimary = healthyReplicas[0];
    const oldPrimary = this.currentPrimary;

    this.currentPrimary = newPrimary.endpoint;
    this.failoverCount++;
    this.lastFailover = Date.now();

    return {
      success: true,
      from: oldPrimary,
      to: newPrimary.endpoint,
      failoverCount: this.failoverCount
    };
  }

  getStatus() {
    return {
      primary: this.primary,
      currentPrimary: this.currentPrimary,
      replicas: Array.from(this.replicas.values()).map(r => ({
        id: r.id,
        endpoint: r.endpoint,
        healthy: r.healthy,
        priority: r.priority,
        lastCheck: r.lastCheck
      })),
      failoverCount: this.failoverCount,
      lastFailover: this.lastFailover,
      autoFailover: this.autoFailover
    };
  }

  startHealthCheck() {
    if (this.healthChecker) return;
    this.healthChecker = setInterval(() => this.checkHealth(), this.healthCheckInterval);
  }

  stopHealthCheck() {
    if (this.healthChecker) {
      clearInterval(this.healthChecker);
      this.healthChecker = null;
    }
  }
}

/**
 * Replica Set Manager
 */
class ReplicaSetManager {
  constructor(config = {}) {
    this.config = config;
    this.members = new Map();
    this.electionTimeout = config.electionTimeout || 5000;
    this.currentLeader = null;
    this.isElecting = false;
  }

  addMember(id, endpoint, priority = 1) {
    this.members.set(id, {
      id,
      endpoint,
      priority,
      state: 'follower',
      lastVote: null,
      term: 0,
      healthy: true
    });
  }

  removeMember(id) {
    return this.members.delete(id);
  }

  async electLeader() {
    if (this.isElecting) return null;
    this.isElecting = true;

    try {
      // Find candidates
      const candidates = Array.from(this.members.values())
        .filter(m => m.healthy)
        .sort((a, b) => b.priority - a.priority);

      if (candidates.length === 0) {
        return null;
      }

      // Simulate election (in real impl, would use raft/etcd/consul)
      const winner = candidates[0];
      winner.state = 'leader';
      this.currentLeader = winner.id;

      // Demote others
      for (const member of this.members.values()) {
        if (member.id !== winner.id) {
          member.state = 'follower';
        }
      }

      return {
        leader: winner.id,
        endpoint: winner.endpoint,
        term: winner.term
      };
    } finally {
      this.isElecting = false;
    }
  }

  getLeader() {
    return this.members.get(this.currentLeader);
  }

  getStatus() {
    return {
      leader: this.currentLeader,
      members: Array.from(this.members.values()).map(m => ({
        id: m.id,
        endpoint: m.endpoint,
        state: m.state,
        priority: m.priority,
        healthy: m.healthy
      }))
    };
  }
}

/**
 * Recovery Plan
 */
class RecoveryPlan {
  constructor(config) {
    this.id = config.id || `plan-${Date.now()}`;
    this.name = config.name;
    this.steps = config.steps || [];
    this.executedSteps = [];
    this.status = 'pending';
    this.startedAt = null;
    this.completedAt = null;
  }

  addStep(step) {
    this.steps.push({
      order: this.steps.length + 1,
      action: step.action,
      target: step.target,
      rollback: step.rollback,
      timeout: step.timeout || 30000,
      ...step
    });
  }

  async execute() {
    this.status = 'in_progress';
    this.startedAt = Date.now();

    for (const step of this.steps) {
      try {
        console.log(`   Step ${step.order}: ${step.action} on ${step.target}`);
        // Simulate step execution
        await new Promise(resolve => setTimeout(resolve, 50));
        this.executedSteps.push({ ...step, status: 'success' });
      } catch (error) {
        this.executedSteps.push({ ...step, status: 'failed', error: error.message });
        this.status = 'failed';
        // Execute rollback
        if (step.rollback) {
          console.log(`   Rolling back: ${step.rollback}`);
        }
        return { success: false, failedStep: step.order, error: error.message };
      }
    }

    this.status = 'completed';
    this.completedAt = Date.now();
    return { success: true, steps: this.executedSteps.length };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      totalSteps: this.steps.length,
      executedSteps: this.executedSteps.length,
      startedAt: this.startedAt,
      completedAt: this.completedAt
    };
  }
}

/**
 * Agent Recovery Manager
 */
class AgentRecoveryManager {
  constructor(config = {}) {
    this.backupManager = new BackupManager(config);
    this.failoverManager = new FailoverManager(config);
    this.replicaSetManager = new ReplicaSetManager(config);
    this.recoveryPlans = new Map();
    this.stats = {
      backups: 0,
      restores: 0,
      failovers: 0,
      errors: 0
    };
  }

  async createBackup(name, data, options = {}) {
    try {
      const snapshot = await this.backupManager.createBackup(name, data, options);
      this.stats.backups++;
      return snapshot;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  async restore(snapshotId) {
    try {
      const snapshot = await this.backupManager.restore(snapshotId);
      this.stats.restores++;
      return snapshot;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  async verifyBackup(snapshotId) {
    return this.backupManager.verify(snapshotId);
  }

  listBackups(options = {}) {
    return this.backupManager.listSnapshots(options);
  }

  addRecoveryPlan(plan) {
    this.recoveryPlans.set(plan.id, plan);
  }

  async executeRecoveryPlan(planId) {
    const plan = this.recoveryPlans.get(planId);
    if (!plan) {
      throw new Error(`Recovery plan ${planId} not found`);
    }
    return plan.execute();
  }

  getFailoverStatus() {
    return this.failoverManager.getStatus();
  }

  async triggerFailover() {
    const result = await this.failoverManager.triggerFailover();
    if (result.success) {
      this.stats.failovers++;
    }
    return result;
  }

  getReplicaSetStatus() {
    return this.replicaSetManager.getStatus();
  }

  getStats() {
    return {
      ...this.stats,
      backups: this.backupManager.snapshots.size,
      recoveryPlans: this.recoveryPlans.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Recovery 2 Demo\n');

  const manager = new AgentRecoveryManager();

  // Backup
  console.log('1. Backup Management:');

  const snapshot1 = await manager.createBackup('initial-config', {
    settings: { timeout: 30, retries: 3 },
    users: ['admin', 'user1'],
    endpoints: ['http://api1.example.com', 'http://api2.example.com']
  });
  console.log(`   Created: ${snapshot1.id.substring(0, 30)}...`);
  console.log(`   Checksum: ${snapshot1.checksum.substring(0, 16)}...`);
  console.log(`   Size: ${snapshot1.size} bytes`);

  const snapshot2 = await manager.createBackup('updated-config', {
    settings: { timeout: 60, retries: 5 },
    users: ['admin', 'user1', 'user2'],
    endpoints: ['http://api1.example.com', 'http://api2.example.com', 'http://api3.example.com']
  }, { type: 'incremental' });
  console.log(`   Created incremental: ${snapshot2.id.substring(0, 30)}...`);

  // List backups
  console.log('\n2. Backup List:');
  const backups = manager.listBackups();
  console.log(`   Total: ${backups.length}`);
  for (const backup of backups) {
    console.log(`   - ${backup.name}: ${backup.type}, ${backup.size} bytes`);
  }

  // Verify
  console.log('\n3. Backup Verification:');
  const verification = await manager.verifyBackup(snapshot1.id);
  console.log(`   Valid: ${verification.valid}`);

  // Restore
  console.log('\n4. Restore:');
  const restored = await manager.restore(snapshot1.id);
  console.log(`   Restored: ${restored.name}`);
  console.log(`   Data: ${JSON.stringify(restored.data).substring(0, 50)}...`);

  // Failover
  console.log('\n5. Failover Management:');

  manager.failoverManager.setPrimary('http://primary.example.com');
  manager.failoverManager.addReplica('replica-1', 'http://replica1.example.com');
  manager.failoverManager.addReplica('replica-2', 'http://replica2.example.com');
  manager.failoverManager.addReplica('replica-3', 'http://replica3.example.com', 2);

  const failoverResult = await manager.triggerFailover();
  console.log(`   Failover: ${failoverResult.success ? 'success' : 'failed'}`);
  if (failoverResult.success) {
    console.log(`   From: ${failoverResult.from}`);
    console.log(`   To: ${failoverResult.to}`);
  }

  const failoverStatus = manager.getFailoverStatus();
  console.log(`   Failover count: ${failoverStatus.failoverCount}`);

  // Replica Set
  console.log('\n6. Replica Set (Leader Election):');

  manager.replicaSetManager.addMember('member-1', 'http://node1.example.com', 3);
  manager.replicaSetManager.addMember('member-2', 'http://node2.example.com', 2);
  manager.replicaSetManager.addMember('member-3', 'http://node3.example.com', 1);

  const election = await manager.replicaSetManager.electLeader();
  console.log(`   Leader elected: ${election?.leader}`);

  const replicaStatus = manager.getReplicaSetStatus();
  console.log(`   Members:`);
  for (const member of replicaStatus.members) {
    console.log(`   - ${member.id}: ${member.state} (priority: ${member.priority})`);
  }

  // Recovery Plan
  console.log('\n7. Recovery Plan:');

  const plan = new RecoveryPlan({
    id: 'recovery-1',
    name: 'Database Recovery'
  });

  plan.addStep({
    action: 'stop-services',
    target: 'all-api-services',
    rollback: 'start-services'
  });

  plan.addStep({
    action: 'restore-database',
    target: 'primary-db',
    rollback: 'restore-backup'
  });

  plan.addStep({
    action: 'verify-data',
    target: 'primary-db'
  });

  plan.addStep({
    action: 'start-services',
    target: 'all-api-services'
  });

  manager.addRecoveryPlan(plan);

  const planResult = await manager.executeRecoveryPlan('recovery-1');
  console.log(`   Plan status: ${planResult.success ? 'completed' : 'failed'}`);
  console.log(`   Steps executed: ${planResult.steps}`);

  // Stats
  console.log('\n8. Statistics:');
  const stats = manager.getStats();
  console.log(`   Backups created: ${stats.backups}`);
  console.log(`   Restores: ${stats.restores}`);
  console.log(`   Failovers: ${stats.failovers}`);
  console.log(`   Errors: ${stats.errors}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'backup') {
  const manager = new AgentRecoveryManager();
  manager.createBackup('cli-backup', { test: true }).then(s => console.log(`Backup: ${s.id}`));
} else if (cmd === 'restore') {
  const manager = new AgentRecoveryManager();
  manager.restore(args[1]).then(s => console.log(`Restored: ${s.name}`));
} else if (cmd === 'status') {
  const manager = new AgentRecoveryManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Recovery 2 Module');
  console.log('Usage: node agent-recovery-2.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  backup             Create backup');
  console.log('  restore <id>       Restore backup');
  console.log('  status             Show stats');
}
