/**
 * Agent Replication Module
 *
 * Provides data replication with sync, async modes and conflict resolution.
 * Usage: node agent-replication.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   replicate <data>      Replicate data
 *   status                 Show replication stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';
const REPLICA_DIR = DATA_DIR + '/replicas';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureReplicaDir() {
  ensureDataDir();
  if (!fs.existsSync(REPLICA_DIR)) {
    fs.mkdirSync(REPLICA_DIR, { recursive: true });
  }
}

/**
 * Replication Mode
 */
const ReplicationMode = {
  SYNC: 'sync',
  ASYNC: 'async',
  SEMI_SYNC: 'semi-sync'
};

/**
 * Conflict Resolution Strategy
 */
const ConflictStrategy = {
  LAST_WRITE_WINS: 'last-write-wins',
  FIRST_WRITE_WINS: 'first-write-wins',
  MANUAL: 'manual',
  MERGE: 'merge',
  SOURCE_WINS: 'source-wins',
  TARGET_WINS: 'target-wins'
};

/**
 * Node Status
 */
const NodeStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SYNCING: 'syncing',
  ERROR: 'error'
};

/**
 * Replica Node
 */
class ReplicaNode {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.endpoint = config.endpoint;
    this.priority = config.priority || 1;
    this.status = NodeStatus.ACTIVE;
    this.isPrimary = config.isPrimary || false;
    this.latency = config.latency || 0;
    this.lastSync = null;
    this.syncErrors = 0;
    this.stats = {
      replicated: 0,
      failed: 0,
      bytesSent: 0,
      bytesReceived: 0
  };
  }

  markSyncing() {
    this.status = NodeStatus.SYNCING;
  }

  markActive() {
    this.status = NodeStatus.ACTIVE;
  }

  markError() {
    this.status = NodeStatus.ERROR;
    this.syncErrors++;
  }

  updateLatency(ms) {
    this.latency = ms;
  }

  recordSuccess(bytesSent = 0) {
    this.stats.replicated++;
    this.stats.bytesSent += bytesSent;
    this.status = NodeStatus.ACTIVE;
  }

  recordFailure() {
    this.stats.failed++;
    this.markError();
  }

  getStats() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      isPrimary: this.isPrimary,
      latency: this.latency,
      lastSync: this.lastSync,
      ...this.stats
    };
  }
}

/**
 * Data Item
 */
class ReplicatedData {
  constructor(config) {
    this.key = config.key;
    this.value = config.value;
    this.version = config.version || 1;
    this.timestamp = config.timestamp || Date.now();
    this.source = config.source;
    this.checksum = null;
    this.generateChecksum();
  }

  generateChecksum() {
    const content = JSON.stringify({ key: this.key, value: this.value, version: this.version });
    this.checksum = crypto.createHash('sha256').update(content).digest('hex');
  }

  update(value) {
    this.value = value;
    this.version++;
    this.timestamp = Date.now();
    this.generateChecksum();
  }

  isNewerThan(other) {
    return this.timestamp > other.timestamp;
  }

  toJSON() {
    return {
      key: this.key,
      value: this.value,
      version: this.version,
      timestamp: this.timestamp,
      source: this.source,
      checksum: this.checksum
    };
  }
}

/**
 * Conflict Resolver
 */
class ConflictResolver {
  constructor(strategy = ConflictStrategy.LAST_WRITE_WINS) {
    this.strategy = strategy;
  }

  resolve(local, remote) {
    switch (this.strategy) {
      case ConflictStrategy.LAST_WRITE_WINS:
        return local.isNewerThan(remote) ? local : remote;
      case ConflictStrategy.FIRST_WRITE_WINS:
        return local.isNewerThan(remote) ? remote : local;
      case ConflictStrategy.SOURCE_WINS:
        return local;
      case ConflictStrategy.TARGET_WINS:
        return remote;
      case ConflictStrategy.MERGE:
        return this._merge(local, remote);
      case ConflictStrategy.MANUAL:
        return null; // Requires manual resolution
      default:
        return local.isNewerThan(remote) ? local : remote;
    }
  }

  _merge(local, remote) {
    // Simple merge: combine keys from both
    if (typeof local.value === 'object' && typeof remote.value === 'object') {
      return new ReplicatedData({
        key: local.key,
        value: { ...local.value, ...remote.value },
        version: Math.max(local.version, remote.version) + 1,
        timestamp: Date.now(),
        source: 'merge'
      });
    }
    return local.isNewerThan(remote) ? local : remote;
  }
}

/**
 * Replication Log
 */
class ReplicationLog {
  constructor() {
    this.entries = [];
    this.maxEntries = 1000;
  }

  add(operation) {
    this.entries.push({
      ...operation,
      id: this.entries.length + 1,
      timestamp: Date.now()
    });

    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  getRecent(count = 10) {
    return this.entries.slice(-count);
  }

  getByKey(key) {
    return this.entries.filter(e => e.key === key);
  }

  clear() {
    this.entries = [];
  }
}

/**
 * Sync Manager
 */
class SyncManager {
  constructor(options = {}) {
    this.mode = options.mode || ReplicationMode.ASYNC;
    this.batchSize = options.batchSize || 100;
    this.interval = options.interval || 5000;
    this.timer = null;
    this.pending = [];
  }

  async sync(data, nodes) {
    if (this.mode === ReplicationMode.SYNC) {
      return this._syncAll(data, nodes);
    } else if (this.mode === ReplicationMode.SEMI_SYNC) {
      return this._syncQuorum(data, nodes);
    } else {
      return this._syncAsync(data, nodes);
    }
  }

  async _syncAll(data, nodes) {
    const results = await Promise.all(
      nodes.map(node => this._syncToNode(data, node))
    );
    return results.every(r => r.success);
  }

  async _syncQuorum(data, nodes) {
    const activeNodes = nodes.filter(n => n.status === NodeStatus.ACTIVE);
    const quorum = Math.ceil(activeNodes.length / 2);

    const results = await Promise.all(
      activeNodes.map(node => this._syncToNode(data, node))
    );

    const successCount = results.filter(r => r.success).length;
    return successCount >= quorum;
  }

  async _syncToNode(data, node) {
    try {
      // Simulate replication
      await new Promise(resolve => setTimeout(resolve, 10));
      node.recordSuccess(JSON.stringify(data).length);
      return { success: true, node: node.id };
    } catch (error) {
      node.recordFailure();
      return { success: false, node: node.id, error: error.message };
    }
  }

  async _syncAsync(data, nodes) {
    // Queue for async replication
    this.pending.push({ data, nodes });
    return { success: true, queued: true };
  }

  async processQueue() {
    while (this.pending.length > 0) {
      const item = this.pending.shift();
      const activeNodes = item.nodes.filter(n => n.status === NodeStatus.ACTIVE);
      await Promise.all(
        activeNodes.map(node => this._syncToNode(item.data, node))
      );
    }
  }
}

/**
 * Replication Manager
 */
class ReplicationManager {
  constructor(options = {}) {
    this.nodes = new Map();
    this.data = new Map();
    this.conflictResolver = new ConflictResolver(options.conflictStrategy || ConflictStrategy.LAST_WRITE_WINS);
    this.syncManager = new SyncManager({ mode: options.mode });
    this.replicationLog = new ReplicationLog();
    this.stats = {
      writes: 0,
      reads: 0,
      conflicts: 0,
      resolved: 0,
      syncs: 0,
      errors: 0
    };

    // Start sync timer for async mode
    if (options.mode === ReplicationMode.ASYNC) {
      this.syncTimer = setInterval(() => this.syncManager.processQueue(), options.interval || 5000);
    }
  }

  addNode(node) {
    this.nodes.set(node.id, node);
  }

  removeNode(nodeId) {
    return this.nodes.delete(nodeId);
  }

  getNode(nodeId) {
    return this.nodes.get(nodeId);
  }

  listNodes() {
    return Array.from(this.nodes.values()).map(n => n.getStats());
  }

  async write(key, value, options = {}) {
    const source = options.source || 'unknown';
    const existing = this.data.get(key);

    // Check for conflict
    if (existing && options.replicate !== false) {
      const activeNodes = Array.from(this.nodes.values()).filter(n => n.status === NodeStatus.ACTIVE);

      for (const node of activeNodes) {
        if (node.isPrimary) continue;

        // Simulate getting remote version
        const remote = existing; // In real impl, would fetch from node

        if (existing.version !== remote.version) {
          this.stats.conflicts++;
          const resolved = this.conflictResolver.resolve(existing, remote);
          if (resolved) {
            this.data.set(key, resolved);
            this.stats.resolved++;
          }
        }
      }
    }

    // Update local
    const data = existing ? existing : new ReplicatedData({ key });
    data.update(value);
    data.source = source;
    this.data.set(key, data);

    this.stats.writes++;
    this.replicationLog.add({ type: 'write', key, version: data.version });

    // Replicate to other nodes
    if (options.replicate !== false) {
      const targetNodes = Array.from(this.nodes.values()).filter(n => !n.isPrimary);
      await this.syncManager.sync(data, targetNodes);
      this.stats.syncs++;
    }

    return data;
  }

  read(key) {
    const data = this.data.get(key);
    this.stats.reads++;
    return data;
  }

  delete(key, options = {}) {
    const existing = this.data.get(key);
    if (!existing) return false;

    this.data.delete(key);
    this.replicationLog.add({ type: 'delete', key });

    // Replicate deletion
    if (options.replicate !== false) {
      const targetNodes = Array.from(this.nodes.values()).filter(n => !n.isPrimary);
      this.syncManager.sync({ key, deleted: true }, targetNodes);
    }

    return true;
  }

  async syncAll() {
    const activeNodes = Array.from(this.nodes.values()).filter(n => n.status === NodeStatus.ACTIVE);

    for (const [key, data] of this.data) {
      await this.syncManager.sync(data, activeNodes);
    }

    return { success: true, synced: this.data.size };
  }

  getReplicationLog(count = 10) {
    return this.replicationLog.getRecent(count);
  }

  getStats() {
    return {
      ...this.stats,
      nodes: this.nodes.size,
      dataItems: this.data.size,
      queueSize: this.syncManager.pending.length,
      activeNodes: Array.from(this.nodes.values()).filter(n => n.status === NodeStatus.ACTIVE).length
    };
  }

  stop() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Replication Demo\n');

  const manager = new ReplicationManager({
    mode: ReplicationMode.ASYNC,
    conflictStrategy: ConflictStrategy.LAST_WRITE_WINS
  });

  // Add nodes
  console.log('1. Replica Nodes:');

  const primary = new ReplicaNode({
    id: 'node-1',
    name: 'Primary',
    endpoint: 'http://primary.example.com',
    isPrimary: true,
    priority: 1
  });

  const replica1 = new ReplicaNode({
    id: 'node-2',
    name: 'Replica 1',
    endpoint: 'http://replica1.example.com',
    priority: 2
  });

  const replica2 = new ReplicaNode({
    id: 'node-3',
    name: 'Replica 2',
    endpoint: 'http://replica2.example.com',
    priority: 3
  });

  manager.addNode(primary);
  manager.addNode(replica1);
  manager.addNode(replica2);

  console.log(`   Added ${manager.nodes.size} nodes`);
  console.log(`   Primary: ${primary.name}`);
  console.log(`   Replicas: ${replica1.name}, ${replica2.name}`);

  // Write data
  console.log('\n2. Write Operations:');

  await manager.write('user:1', { name: 'Alice', email: 'alice@example.com' });
  console.log(`   Wrote user:1`);

  await manager.write('user:2', { name: 'Bob', email: 'bob@example.com' });
  console.log(`   Wrote user:2`);

  await manager.write('config', { theme: 'dark', language: 'en' });
  console.log(`   Wrote config`);

  // Read data
  console.log('\n3. Read Operations:');

  const user1 = manager.read('user:1');
  console.log(`   Read user:1: ${JSON.stringify(user1.value)}`);

  const user2 = manager.read('user:2');
  console.log(`   Read user:2: ${JSON.stringify(user2.value)}`);

  // Update with conflict
  console.log('\n4. Conflict Resolution:');

  // Simulate concurrent update
  await manager.write('counter', { count: 10 }, { source: 'node-2' });
  await manager.write('counter', { count: 15 }, { source: 'node-3' });

  const counter = manager.read('counter');
  console.log(`   Final counter value: ${JSON.stringify(counter.value)}`);
  console.log(`   Version: ${counter.version}`);

  // Sync
  console.log('\n5. Full Sync:');
  const syncResult = await manager.syncAll();
  console.log(`   Synced ${syncResult.synced} items`);

  // Replication log
  console.log('\n6. Replication Log:');
  const log = manager.getReplicationLog(5);
  console.log(`   Recent operations:`);
  for (const entry of log) {
    console.log(`   - ${entry.type}: ${entry.key} (v${entry.version})`);
  }

  // Node stats
  console.log('\n7. Node Statistics:');
  for (const node of manager.listNodes()) {
    console.log(`   ${node.name}: ${node.status} (${node.replicated} replicated, ${node.failed} failed)`);
  }

  // Conflict strategies
  console.log('\n8. Conflict Strategies:');

  const resolver1 = new ConflictResolver(ConflictStrategy.LAST_WRITE_WINS);
  const resolver2 = new ConflictResolver(ConflictStrategy.SOURCE_WINS);
  const resolver3 = new ConflictResolver(ConflictStrategy.MERGE);

  const local = new ReplicatedData({ key: 'test', value: { x: 1 }, version: 1, timestamp: 1000 });
  const remote = new ReplicatedData({ key: 'test', value: { y: 2 }, version: 2, timestamp: 2000 });

  const result1 = resolver1.resolve(local, remote);
  const result2 = resolver2.resolve(local, remote);
  const result3 = resolver3.resolve(local, remote);

  console.log(`   Last-write-wins: v${result1.version}`);
  console.log(`   Source-wins: v${result2.version}`);
  console.log(`   Merge: ${JSON.stringify(result3.value)}`);

  // Stats
  console.log('\n9. Statistics:');
  const stats = manager.getStats();
  console.log(`   Writes: ${stats.writes}`);
  console.log(`   Reads: ${stats.reads}`);
  console.log(`   Conflicts: ${stats.conflicts}`);
  console.log(`   Resolved: ${stats.resolved}`);
  console.log(`   Syncs: ${stats.syncs}`);
  console.log(`   Errors: ${stats.errors}`);
  console.log(`   Data items: ${stats.dataItems}`);
  console.log(`   Queue size: ${stats.queueSize}`);

  manager.stop();
  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'replicate') {
  const manager = new ReplicationManager();
  const data = JSON.parse(args[1] || '{}');
  manager.write('cli-data', data).then(d => console.log(`Replicated: ${d.version}`));
} else if (cmd === 'status') {
  const manager = new ReplicationManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Replication Module');
  console.log('Usage: node agent-replication.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  replicate <data>  Replicate data');
  console.log('  status             Show stats');
}
