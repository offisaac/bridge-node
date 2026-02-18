/**
 * Agent Multi-Region Manager
 * Manages multi-region deployment and replication for agents
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class MultiRegionManager {
  constructor(options = {}) {
    this.regions = new Map();
    this.agents = new Map();
    this.replicationRules = new Map();
    this.healthChecks = new Map();
    this.failoverPolicies = new Map();
    this.trafficRouting = options.trafficRouting || 'round-robin';
    this.syncInterval = options.syncInterval || 30000;
    this.healthCheckInterval = options.healthCheckInterval || 10000;

    // Initialize default regions
    this._initDefaultRegions();
  }

  _initDefaultRegions() {
    const defaultRegions = [
      { id: 'us-east-1', name: 'US East (N. Virginia)', endpoint: 'https://us-east-1.agents.example.com', priority: 1 },
      { id: 'us-west-2', name: 'US West (Oregon)', endpoint: 'https://us-west-2.agents.example.com', priority: 2 },
      { id: 'eu-west-1', name: 'EU (Ireland)', endpoint: 'https://eu-west-1.agents.example.com', priority: 3 },
      { id: 'ap-southeast-1', name: 'Asia Pacific (Singapore)', endpoint: 'https://ap-southeast-1.agents.example.com', priority: 4 },
      { id: 'ap-northeast-1', name: 'Asia Pacific (Tokyo)', endpoint: 'https://ap-northeast-1.agents.example.com', priority: 5 }
    ];

    for (const region of defaultRegions) {
      this.regions.set(region.id, { ...region, status: 'active', agents: 0, capacity: 100 });
    }
  }

  registerRegion(regionConfig) {
    const { id, name, endpoint, priority, capacity } = regionConfig;
    const region = {
      id,
      name: name || id,
      endpoint: endpoint || `https://${id}.agents.example.com`,
      priority: priority || 10,
      capacity: capacity || 100,
      status: 'active',
      agents: 0,
      latency: {},
      lastHealthCheck: null
    };

    this.regions.set(id, region);
    console.log(`Region registered: ${id} (${region.name})`);
    return region;
  }

  deregisterRegion(regionId) {
    if (!this.regions.has(regionId)) {
      throw new Error(`Region not found: ${regionId}`);
    }

    // Check if there are agents in this region
    const region = this.regions.get(regionId);
    if (region.agents > 0) {
      throw new Error(`Cannot deregister region ${regionId}: ${region.agents} agents still active`);
    }

    this.regions.delete(regionId);
    console.log(`Region deregistered: ${regionId}`);
    return { success: true, regionId };
  }

  async deployAgent(agentId, config = {}) {
    const { region, replicationFactor = 1, replicationMode = 'sync' } = config;

    const agent = {
      agentId,
      primaryRegion: region || this._selectPrimaryRegion(),
      replicas: [],
      replicationFactor,
      replicationMode,
      status: 'deploying',
      version: config.version || '1.0.0',
      deployedAt: null,
      lastSync: null,
      health: 'unknown'
    };

    // Deploy primary instance
    await this._deployToRegion(agentId, agent.primaryRegion);

    // Deploy replicas based on replication factor
    if (replicationFactor > 1) {
      const replicaRegions = this._selectReplicaRegions(agent.primaryRegion, replicationFactor - 1);
      for (const replicaRegion of replicaRegions) {
        await this._deployToRegion(agentId, replicaRegion, true);
        agent.replicas.push(replicaRegion);
      }
    }

    agent.status = 'active';
    agent.deployedAt = new Date().toISOString();
    this.agents.set(agentId, agent);

    // Start health monitoring
    this._startHealthMonitoring(agentId);

    console.log(`Agent deployed: ${agentId} to ${agent.primaryRegion} with ${agent.replicas.length} replicas`);
    return agent;
  }

  async _deployToRegion(agentId, regionId, isReplica = false) {
    const region = this.regions.get(regionId);
    if (!region) {
      throw new Error(`Region not found: ${regionId}`);
    }

    region.agents++;
    console.log(`  Deployed ${isReplica ? 'replica' : 'primary'} to ${regionId} (total: ${region.agents})`);
    return { success: true, regionId, isReplica };
  }

  _selectPrimaryRegion() {
    const activeRegions = Array.from(this.regions.values())
      .filter(r => r.status === 'active')
      .sort((a, b) => a.priority - b.priority);

    if (activeRegions.length === 0) {
      throw new Error('No active regions available');
    }

    return activeRegions[0].id;
  }

  _selectReplicaRegions(primaryRegionId, count) {
    const availableRegions = Array.from(this.regions.values())
      .filter(r => r.status === 'active' && r.id !== primaryRegionId)
      .sort((a, b) => a.priority - b.priority);

    return availableRegions.slice(0, count).map(r => r.id);
  }

  async undeployAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Stop health monitoring
    this.healthChecks.delete(agentId);

    // Remove from all regions
    const regions = [agent.primaryRegion, ...agent.replicas];
    for (const regionId of regions) {
      const region = this.regions.get(regionId);
      if (region) {
        region.agents = Math.max(0, region.agents - 1);
      }
    }

    this.agents.delete(agentId);
    console.log(`Agent undeployed: ${agentId}`);
    return { success: true, agentId };
  }

  async failover(agentId, targetRegionId = null) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const currentPrimary = agent.primaryRegion;
    const targetRegion = targetRegionId || this._selectFailoverRegion(currentPrimary);

    if (!targetRegion) {
      throw new Error('No failover region available');
    }

    // Remove from current primary
    const oldRegion = this.regions.get(currentPrimary);
    if (oldRegion) {
      oldRegion.agents--;
    }

    // Deploy to new primary
    await this._deployToRegion(agentId, targetRegion);

    // Update agent
    agent.primaryRegion = targetRegion;
    agent.status = 'active';
    agent.lastFailover = new Date().toISOString();

    // Add old primary as replica if possible
    if (agent.replicas.length < agent.replicationFactor - 1) {
      agent.replicas.push(currentPrimary);
      oldRegion.agents++;
    }

    console.log(`Failover completed: ${agentId} from ${currentPrimary} to ${targetRegion}`);
    return {
      success: true,
      agentId,
      fromRegion: currentPrimary,
      toRegion: targetRegion
    };
  }

  _selectFailoverRegion(currentRegionId) {
    const availableRegions = Array.from(this.regions.values())
      .filter(r => r.status === 'active' && r.id !== currentRegionId)
      .sort((a, b) => {
        // Prefer regions with lower latency and more capacity
        const aLatency = a.latency[currentRegionId] || 100;
        const bLatency = b.latency[currentRegionId] || 100;
        const aScore = a.capacity - a.agents + (1000 / aLatency);
        const bScore = b.capacity - b.agents + (1000 / bLatency);
        return bScore - aScore;
      });

    return availableRegions[0]?.id || null;
  }

  setReplicationRule(agentId, rule) {
    const { mode = 'sync', targetRegions = [], conflictResolution = 'last-write-wins' } = rule;
    this.replicationRules.set(agentId, {
      mode,
      targetRegions,
      conflictResolution,
      createdAt: new Date().toISOString()
    });
    console.log(`Replication rule set for ${agentId}: ${mode} to ${targetRegions.join(', ') || 'all regions'}`);
    return { success: true, agentId, rule };
  }

  async syncAgent(agentId, data) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const rule = this.replicationRules.get(agentId);
    const targetRegions = rule?.targetRegions || agent.replicas;

    const syncResults = [];
    for (const regionId of targetRegions) {
      try {
        // Simulate sync
        syncResults.push({ regionId, success: true, timestamp: new Date().toISOString() });
      } catch (error) {
        syncResults.push({ regionId, success: false, error: error.message });
      }
    }

    agent.lastSync = new Date().toISOString();
    console.log(`Synced ${agentId} to ${syncResults.filter(r => r.success).length} regions`);
    return { agentId, results: syncResults };
  }

  _startHealthMonitoring(agentId) {
    const interval = setInterval(async () => {
      const agent = this.agents.get(agentId);
      if (!agent) {
        clearInterval(interval);
        return;
      }

      const health = await this._checkAgentHealth(agentId);
      this.healthChecks.set(agentId, {
        ...health,
        timestamp: new Date().toISOString()
      });

      // Auto-failover if unhealthy
      if (health.status === 'unhealthy' && agent.replicationFactor > 0) {
        console.log(`Agent ${agentId} is unhealthy, triggering failover...`);
        await this.failover(agentId);
      }
    }, this.healthCheckInterval);

    this.healthChecks.set(agentId + '_interval', interval);
  }

  async _checkAgentHealth(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      return { status: 'unknown', latency: -1 };
    }

    // Simulate health check
    const isHealthy = Math.random() > 0.05; // 95% success rate
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      latency: Math.floor(Math.random() * 100) + 10,
      region: agent.primaryRegion
    };
  }

  getAgentStatus(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const health = this.healthChecks.get(agentId);
    return {
      agentId,
      status: agent.status,
      primaryRegion: agent.primaryRegion,
      replicas: agent.replicas,
      replicationFactor: agent.replicationFactor,
      replicationMode: agent.replicationMode,
      health: health?.status || 'unknown',
      latency: health?.latency || -1,
      deployedAt: agent.deployedAt,
      lastSync: agent.lastSync,
      lastFailover: agent.lastFailover
    };
  }

  getRegionStatus(regionId) {
    const region = this.regions.get(regionId);
    if (!region) {
      throw new Error(`Region not found: ${regionId}`);
    }

    const agentsInRegion = Array.from(this.agents.values())
      .filter(a => a.primaryRegion === regionId || a.replicas.includes(regionId));

    return {
      id: region.id,
      name: region.name,
      endpoint: region.endpoint,
      status: region.status,
      capacity: region.capacity,
      agents: region.agents,
      availableCapacity: region.capacity - region.agents,
      utilizationPercent: Math.round((region.agents / region.capacity) * 100)
    };
  }

  listRegions() {
    return Array.from(this.regions.values()).map(r => ({
      id: r.id,
      name: r.name,
      status: r.status,
      capacity: r.capacity,
      agents: r.agents,
      utilizationPercent: Math.round((r.agents / r.capacity) * 100)
    }));
  }

  listAgents() {
    return Array.from(this.agents.keys()).map(agentId => this.getAgentStatus(agentId));
  }

  setTrafficRouting(policy) {
    const validPolicies = ['round-robin', 'least-latency', 'weighted', 'geo'];
    if (!validPolicies.includes(policy)) {
      throw new Error(`Invalid policy: ${policy}. Valid: ${validPolicies.join(', ')}`);
    }
    this.trafficRouting = policy;
    console.log(`Traffic routing policy set to: ${policy}`);
    return { success: true, policy };
  }

  routeRequest(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const allRegions = [agent.primaryRegion, ...agent.replicas];
    let selectedRegion;

    switch (this.trafficRouting) {
      case 'round-robin':
        selectedRegion = allRegions[Math.floor(Math.random() * allRegions.length)];
        break;
      case 'least-latency':
        selectedRegion = allRegions.reduce((best, region) => {
          const regionData = this.regions.get(region);
          const bestData = this.regions.get(best);
          return (regionData.latency[agentId] || 100) < (bestData.latency[agentId] || 100) ? region : best;
        });
        break;
      case 'geo':
        selectedRegion = agent.primaryRegion; // Always prefer primary for geo
        break;
      default:
        selectedRegion = agent.primaryRegion;
    }

    const region = this.regions.get(selectedRegion);
    return {
      agentId,
      region: selectedRegion,
      endpoint: region?.endpoint,
      routingPolicy: this.trafficRouting
    };
  }

  async migrateAgent(agentId, targetRegionId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const sourceRegion = agent.primaryRegion;

    // Deploy to new region first
    await this._deployToRegion(agentId, targetRegionId);

    // Update agent
    agent.replicas.push(sourceRegion);
    agent.primaryRegion = targetRegionId;
    agent.lastMigration = new Date().toISOString();

    console.log(`Agent migrated: ${agentId} from ${sourceRegion} to ${targetRegionId}`);
    return {
      success: true,
      agentId,
      fromRegion: sourceRegion,
      toRegion: targetRegionId
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new MultiRegionManager({
    syncInterval: 30000,
    healthCheckInterval: 10000
  });

  switch (command) {
    case 'deploy':
      const agentId = args[1] || 'agent-001';
      const result = await manager.deployAgent(agentId, {
        replicationFactor: 2,
        replicationMode: 'sync'
      });
      console.log('Deployment result:', result);
      break;

    case 'list-regions':
      console.log('Available regions:', manager.listRegions());
      break;

    case 'list-agents':
      console.log('Deployed agents:', manager.listAgents());
      break;

    case 'status':
      const statusAgentId = args[1];
      if (!statusAgentId) {
        console.log('Usage: node agent-multi-region.js status <agent-id>');
        process.exit(1);
      }
      console.log('Agent status:', manager.getAgentStatus(statusAgentId));
      break;

    case 'region-status':
      const regionId = args[1];
      if (!regionId) {
        console.log('Usage: node agent-multi-region.js region-status <region-id>');
        process.exit(1);
      }
      console.log('Region status:', manager.getRegionStatus(regionId));
      break;

    case 'failover':
      const failoverAgentId = args[1];
      if (!failoverAgentId) {
        console.log('Usage: node agent-multi-region.js failover <agent-id>');
        process.exit(1);
      }
      await manager.failover(failoverAgentId);
      console.log('Failover completed');
      break;

    case 'route':
      const routeAgentId = args[1];
      if (!routeAgentId) {
        console.log('Usage: node agent-multi-region.js route <agent-id>');
        process.exit(1);
      }
      console.log('Route request:', manager.routeRequest(routeAgentId));
      break;

    case 'sync':
      const syncAgentId = args[1];
      if (!syncAgentId) {
        console.log('Usage: node agent-multi-region.js sync <agent-id>');
        process.exit(1);
      }
      await manager.syncAgent(syncAgentId, { state: 'updated' });
      console.log('Sync completed');
      break;

    case 'demo':
      console.log('=== Agent Multi-Region Manager Demo ===\n');

      // List regions
      console.log('1. Available regions:');
      console.log('   ', JSON.stringify(manager.listRegions(), null, 2));

      // Register custom region
      console.log('\n2. Registering custom region...');
      manager.registerRegion({
        id: 'sa-east-1',
        name: 'South America (Sao Paulo)',
        endpoint: 'https://sa-east-1.agents.example.com',
        priority: 6,
        capacity: 50
      });
      console.log('   Region registered');

      // Deploy agent
      console.log('\n3. Deploying agent with 2 replicas...');
      const deployment = await manager.deployAgent('demo-agent', {
        replicationFactor: 3,
        replicationMode: 'sync'
      });
      console.log('   Primary region:', deployment.primaryRegion);
      console.log('   Replicas:', deployment.replicas);

      // Set replication rule
      console.log('\n4. Setting replication rule...');
      manager.setReplicationRule('demo-agent', {
        mode: 'async',
        targetRegions: ['us-west-2', 'eu-west-1'],
        conflictResolution: 'last-write-wins'
      });
      console.log('   Rule set');

      // Get agent status
      console.log('\n5. Agent status:');
      const status = manager.getAgentStatus('demo-agent');
      console.log('   Status:', status.status);
      console.log('   Primary:', status.primaryRegion);
      console.log('   Health:', status.health);

      // Route request
      console.log('\n6. Routing request...');
      const route = manager.routeRequest('demo-agent');
      console.log('   Routed to:', route.region);
      console.log('   Endpoint:', route.endpoint);

      // Sync
      console.log('\n7. Syncing agent data...');
      const syncResult = await manager.syncAgent('demo-agent', { test: true });
      console.log('   Synced to', syncResult.results.filter(r => r.success).length, 'regions');

      // List all agents
      console.log('\n8. All deployed agents:');
      console.log('  ', JSON.stringify(manager.listAgents(), null, 2));

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-multi-region.js <command> [args]');
      console.log('\nCommands:');
      console.log('  deploy [agent-id]           Deploy agent with replication');
      console.log('  list-regions                 List all regions');
      console.log('  list-agents                  List all deployed agents');
      console.log('  status <agent-id>            Get agent status');
      console.log('  region-status <region-id>    Get region status');
      console.log('  failover <agent-id>          Trigger failover');
      console.log('  route <agent-id>             Route request to agent');
      console.log('  sync <agent-id>              Sync agent data');
      console.log('  demo                         Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = MultiRegionManager;
