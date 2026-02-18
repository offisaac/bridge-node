/**
 * Agent Federation Module
 *
 * Provides federation across clusters with membership, sharding, and cross-cluster communication.
 * Usage: node agent-federation.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show federation stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Cluster Role
 */
const ClusterRole = {
  LEADER: 'leader',
  FOLLOWER: 'follower',
  OBSERVER: 'observer'
};

/**
 * Member Status
 */
const MemberStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPECTED: 'suspected',
  LEFT: 'left'
};

/**
 * Cluster Member
 */
class ClusterMember {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.endpoint = config.endpoint;
    this.role = config.role || ClusterRole.FOLLOWER;
    this.status = MemberStatus.ACTIVE;
    this.region = config.region || 'unknown';
    this.zone = config.zone || 'default';
    this.weight = config.weight || 1;
    this.capabilities = config.capabilities || [];
    this.metrics = {
      load: 0,
      latency: 0,
      connections: 0,
      requestsPerSecond: 0
    };
    this.lastHeartbeat = Date.now();
    this.joinedAt = Date.now();
  }

  updateHeartbeat() {
    this.lastHeartbeat = Date.now();
    this.status = MemberStatus.ACTIVE;
  }

  markSuspected() {
    this.status = MemberStatus.SUSPECTED;
  }

  markInactive() {
    this.status = MemberStatus.INACTIVE;
  }

  updateMetrics(metrics) {
    Object.assign(this.metrics, metrics);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      endpoint: this.endpoint,
      role: this.role,
      status: this.status,
      region: this.region,
      zone: this.zone,
      weight: this.weight,
      capabilities: this.capabilities,
      metrics: this.metrics,
      lastHeartbeat: this.lastHeartbeat,
      joinedAt: this.joinedAt
    };
  }
}

/**
 * Federation Cluster
 */
class FederationCluster {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.region = config.region;
    this.members = new Map();
    this.leaderId = null;
    this.config = config;
  }

  addMember(member) {
    this.members.set(member.id, member);
    if (member.role === ClusterRole.LEADER) {
      this.leaderId = member.id;
    }
  }

  removeMember(memberId) {
    return this.members.delete(memberId);
  }

  getMember(memberId) {
    return this.members.get(memberId);
  }

  getActiveMembers() {
    return Array.from(this.members.values()).filter(m => m.status === MemberStatus.ACTIVE);
  }

  getLeader() {
    return this.members.get(this.leaderId);
  }

  electLeader() {
    const active = this.getActiveMembers();
    const leaders = active.filter(m => m.role === ClusterRole.LEADER);
    if (leaders.length > 0) {
      this.leaderId = leaders[0].id;
      return leaders[0];
    }

    // Elect new leader based on weight and load
    active.sort((a, b) => {
      if (a.weight !== b.weight) return b.weight - a.weight;
      return a.metrics.load - b.metrics.load;
    });

    if (active.length > 0) {
      this.leaderId = active[0].id;
      active[0].role = ClusterRole.LEADER;
      return active[0];
    }
    return null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      region: this.region,
      leaderId: this.leaderId,
      memberCount: this.members.size,
      activeCount: this.getActiveMembers().length
    };
  }
}

/**
 * Shard Manager
 */
class ShardManager {
  constructor(totalShards = 128) {
    this.totalShards = totalShards;
    this.shardMap = new Map(); // shardId -> memberId
    this.replicationFactor = 3;
  }

  assignShard(shardId, memberId) {
    this.shardMap.set(shardId, memberId);
  }

  getShardOwner(shardId) {
    return this.shardMap.get(shardId);
  }

  getShardsForMember(memberId) {
    const shards = [];
    for (const [shard, owner] of this.shardMap) {
      if (owner === memberId) {
        shards.push(shard);
      }
    }
    return shards;
  }

  rebalance(currentMembers) {
    this.shardMap.clear();
    const shardsPerMember = Math.floor(this.totalShards / currentMembers.length);

    currentMembers.forEach((member, idx) => {
      const startShard = idx * shardsPerMember;
      const endShard = idx === currentMembers.length - 1 ? this.totalShards : startShard + shardsPerMember;

      for (let shard = startShard; shard < endShard; shard++) {
        this.assignShard(shard, member.id);
      }
    });
  }

  toJSON() {
    return {
      totalShards: this.totalShards,
      assignedShards: this.shardMap.size,
      replicationFactor: this.replicationFactor
    };
  }
}

/**
 * Cross-Cluster Communication
 */
class CrossClusterComm {
  constructor() {
    this.pendingRequests = new Map();
    this.routes = new Map(); // clusterId -> { endpoint, latency }
  }

  registerCluster(clusterId, endpoint) {
    this.routes.set(clusterId, { endpoint, latency: 0, healthy: true });
  }

  async sendRequest(targetCluster, request) {
    const route = this.routes.get(targetCluster);
    if (!route) {
      throw new Error(`Cluster ${targetCluster} not found`);
    }

    const requestId = crypto.randomUUID();
    const start = Date.now();

    // Simulate request
    await new Promise(resolve => setTimeout(resolve, 10));

    const latency = Date.now() - start;
    route.latency = latency;

    return {
      requestId,
      success: true,
      latency,
      cluster: targetCluster
    };
  }

  async broadcast(clusters, message) {
    const results = await Promise.all(
      clusters.map(c => this.sendRequest(c, message))
    );
    return results;
  }

  getRoute(clusterId) {
    return this.routes.get(clusterId);
  }
}

/**
 * Federation Manager
 */
class FederationManager {
  constructor(config = {}) {
    this.clusters = new Map();
    this.localClusterId = config.localClusterId;
    this.shardManager = new ShardManager(config.totalShards || 128);
    this.crossClusterComm = new CrossClusterComm();
    this.stats = {
      requests: 0,
      crossClusterRequests: 0,
      failures: 0,
      leaderElections: 0,
      memberChanges: 0
    };
  }

  addCluster(cluster) {
    this.clusters.set(cluster.id, cluster);
    this.crossClusterComm.registerCluster(cluster.id, cluster.config.endpoint);
  }

  removeCluster(clusterId) {
    return this.clusters.delete(clusterId);
  }

  getCluster(clusterId) {
    return this.clusters.get(clusterId);
  }

  getLocalCluster() {
    return this.clusters.get(this.localClusterId);
  }

  addMemberToCluster(clusterId, member) {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);

    cluster.addMember(member);
    this.stats.memberChanges++;

    // Rebalance shards if needed
    const activeMembers = cluster.getActiveMembers();
    if (activeMembers.length > 0) {
      this.shardManager.rebalance(activeMembers);
    }
  }

  async routeRequest(key, operation) {
    this.stats.requests++;

    // Determine which cluster/shard
    const shardId = this._getShardForKey(key);
    const ownerMemberId = this.shardManager.getShardOwner(shardId);

    if (!ownerMemberId) {
      this.stats.failures++;
      throw new Error('No shard owner available');
    }

    // Find member across clusters
    for (const cluster of this.clusters.values()) {
      const member = cluster.getMember(ownerMemberId);
      if (member) {
        // Simulate operation
        await new Promise(resolve => setTimeout(resolve, 5));
        return { shardId, memberId: ownerMemberId, cluster: cluster.id };
      }
    }

    // Cross-cluster request needed
    this.stats.crossClusterRequests++;
    return null;
  }

  _getShardForKey(key) {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    const num = parseInt(hash.substring(0, 8), 16);
    return num % this.shardManager.totalShards;
  }

  async electLeader(clusterId) {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) throw new Error(`Cluster ${clusterId} not found`);

    const newLeader = cluster.electLeader();
    this.stats.leaderElections++;
    return newLeader;
  }

  async syncClusters() {
    const clusters = Array.from(this.clusters.values());
    // Simulate cross-cluster sync
    await this.crossClusterComm.broadcast(
      clusters.map(c => c.id),
      { type: 'sync', timestamp: Date.now() }
    );
  }

  getStats() {
    return {
      ...this.stats,
      clusters: this.clusters.size,
      shards: this.shardManager.totalShards,
      localCluster: this.localClusterId
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Federation Demo\n');

  const manager = new FederationManager({
    localClusterId: 'cluster-us-east',
    totalShards: 64
  });

  // Create clusters
  console.log('1. Federation Clusters:');

  const usEast = new FederationCluster({
    id: 'cluster-us-east',
    name: 'US East',
    region: 'us-east-1',
    endpoint: 'http://us-east.example.com'
  });

  const usWest = new FederationCluster({
    id: 'cluster-us-west',
    name: 'US West',
    region: 'us-west-1',
    endpoint: 'http://us-west.example.com'
  });

  const euCentral = new FederationCluster({
    id: 'cluster-eu-central',
    name: 'EU Central',
    region: 'eu-central-1',
    endpoint: 'http://eu-central.example.com'
  });

  manager.addCluster(usEast);
  manager.addCluster(usWest);
  manager.addCluster(euCentral);

  console.log(`   Created ${manager.clusters.size} clusters`);

  // Add members to clusters
  console.log('\n2. Cluster Members:');

  // US East - 3 members
  const member1 = new ClusterMember({
    id: 'member-us-east-1',
    name: 'US East Primary',
    endpoint: 'http://us-east-1.example.com',
    role: ClusterRole.LEADER,
    region: 'us-east-1',
    weight: 3,
    capabilities: ['read', 'write', 'admin']
  });

  const member2 = new ClusterMember({
    id: 'member-us-east-2',
    name: 'US East Replica 1',
    endpoint: 'http://us-east-2.example.com',
    role: ClusterRole.FOLLOWER,
    region: 'us-east-1',
    weight: 2,
    capabilities: ['read', 'write']
  });

  const member3 = new ClusterMember({
    id: 'member-us-east-3',
    name: 'US East Replica 2',
    endpoint: 'http://us-east-3.example.com',
    role: ClusterRole.FOLLOWER,
    region: 'us-east-1',
    weight: 2,
    capabilities: ['read']
  });

  manager.addMemberToCluster('cluster-us-east', member1);
  manager.addMemberToCluster('cluster-us-east', member2);
  manager.addMemberToCluster('cluster-us-east', member3);

  // US West - 2 members
  const member4 = new ClusterMember({
    id: 'member-us-west-1',
    name: 'US West Primary',
    endpoint: 'http://us-west-1.example.com',
    role: ClusterRole.LEADER,
    region: 'us-west-1',
    weight: 3,
    capabilities: ['read', 'write', 'admin']
  });

  const member5 = new ClusterMember({
    id: 'member-us-west-2',
    name: 'US West Replica',
    endpoint: 'http://us-west-2.example.com',
    role: ClusterRole.FOLLOWER,
    region: 'us-west-1',
    weight: 2,
    capabilities: ['read', 'write']
  });

  manager.addMemberToCluster('cluster-us-west', member4);
  manager.addMemberToCluster('cluster-us-west', member5);

  console.log(`   US East: ${usEast.members.size} members (leader: ${usEast.leaderId})`);
  console.log(`   US West: ${usWest.members.size} members (leader: ${usWest.leaderId})`);

  // Sharding
  console.log('\n3. Shard Distribution:');
  const shardInfo = manager.shardManager.toJSON();
  console.log(`   Total shards: ${shardInfo.totalShards}`);
  console.log(`   Assigned shards: ${shardInfo.assignedShards}`);

  const shardsForMember1 = manager.shardManager.getShardsForMember('member-us-east-1');
  console.log(`   Shards for member-us-east-1: ${shardsForMember1.length}`);

  // Route requests
  console.log('\n4. Request Routing:');
  const keys = ['user:1', 'user:2', 'config:app', 'session:abc', 'cache:key'];
  for (const key of keys) {
    const route = await manager.routeRequest(key, 'read');
    console.log(`   ${key} -> shard ${route.shardId} on ${route.memberId}`);
  }

  // Cross-cluster communication
  console.log('\n5. Cross-Cluster Communication:');

  await manager.syncClusters();
  console.log('   Clusters synchronized');

  const route = manager.crossClusterComm.getRoute('cluster-us-west');
  console.log(`   US West route latency: ${route?.latency || 0}ms`);

  // Leader election
  console.log('\n6. Leader Election:');

  // Simulate leader failure
  member1.markInactive();
  console.log(`   Member ${member1.id} marked inactive`);

  const newLeader = await manager.electLeader('cluster-us-east');
  console.log(`   New leader elected: ${newLeader?.id || 'none'}`);

  // Member status
  console.log('\n7. Member Status:');
  for (const cluster of manager.clusters.values()) {
    console.log(`   Cluster ${cluster.name}:`);
    for (const member of cluster.members.values()) {
      console.log(`   - ${member.name}: ${member.status} (${member.role})`);
    }
  }

  // Stats
  console.log('\n8. Statistics:');
  const stats = manager.getStats();
  console.log(`   Total requests: ${stats.requests}`);
  console.log(`   Cross-cluster: ${stats.crossClusterRequests}`);
  console.log(`   Failures: ${stats.failures}`);
  console.log(`   Leader elections: ${stats.leaderElections}`);
  console.log(`   Member changes: ${stats.memberChanges}`);
  console.log(`   Clusters: ${stats.clusters}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new FederationManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Federation Module');
  console.log('Usage: node agent-federation.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
