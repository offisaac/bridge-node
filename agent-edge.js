/**
 * Agent Edge Computing Manager
 * Manages edge computing deployment and offloading for agents
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class EdgeComputingManager {
  constructor(options = {}) {
    this.edgeNodes = new Map();
    this.edgeAgents = new Map();
    this.offloadRules = new Map();
    this.dataCache = new Map();
    this.syncPolicies = options.syncPolicies || 'on-demand';
    this.maxLatency = options.maxLatency || 50; // ms
    this.bandwidthLimit = options.bandwidthLimit || 100; // Mbps
    this.computeUnits = options.computeUnits || 1000; // available compute units

    // Initialize default edge nodes
    this._initDefaultNodes();
  }

  _initDefaultNodes() {
    const defaultNodes = [
      { id: 'edge-us-1', location: 'New York', type: 'gateway', capacity: 50, latency: 5 },
      { id: 'edge-us-2', location: 'Los Angeles', type: 'gateway', capacity: 50, latency: 8 },
      { id: 'edge-eu-1', location: 'London', type: 'gateway', capacity: 40, latency: 6 },
      { id: 'edge-ap-1', location: 'Tokyo', type: 'gateway', capacity: 40, latency: 10 },
      { id: 'mobile-1', location: '5G Device', type: 'mobile', capacity: 20, latency: 2 },
      { id: 'iot-1', location: 'Smart Sensor', type: 'iot', capacity: 10, latency: 1 }
    ];

    for (const node of defaultNodes) {
      this.edgeNodes.set(node.id, { ...node, status: 'online', agents: [], load: 0 });
    }
  }

  registerEdgeNode(nodeConfig) {
    const { id, location, type, capacity, latency } = nodeConfig;
    const node = {
      id,
      location: location || id,
      type: type || 'gateway',
      capacity: capacity || 50,
      latency: latency || 10,
      status: 'online',
      agents: [],
      load: 0,
      cpu: 0,
      memory: 0,
      networkIn: 0,
      networkOut: 0,
      registeredAt: new Date().toISOString()
    };

    this.edgeNodes.set(id, node);
    console.log(`Edge node registered: ${id} (${location}) - ${type}`);
    return node;
  }

  deregisterEdgeNode(nodeId) {
    const node = this.edgeNodes.get(nodeId);
    if (!node) {
      throw new Error(`Edge node not found: ${nodeId}`);
    }

    if (node.agents.length > 0) {
      throw new Error(`Cannot deregister: ${node.agents.length} agents still running`);
    }

    this.edgeNodes.delete(nodeId);
    console.log(`Edge node deregistered: ${nodeId}`);
    return { success: true, nodeId };
  }

  async deployToEdge(agentId, config = {}) {
    const { nodeId, priority = 'latency', computeRequired = 10, dataRequirements = {} } = config;

    const targetNode = nodeId || this._selectOptimalNode(priority, computeRequired);

    if (!targetNode) {
      throw new Error('No suitable edge node available');
    }

    const edgeNode = this.edgeNodes.get(targetNode);
    if (edgeNode.load + computeRequired > edgeNode.capacity) {
      throw new Error(`Node ${targetNode} insufficient capacity`);
    }

    const edgeAgent = {
      agentId,
      nodeId: targetNode,
      computeRequired,
      priority: config.priority || 'normal',
      status: 'deployed',
      dataRequirements,
      localStorage: dataRequirements.localStorage || 100, // MB
      deployedAt: new Date().toISOString(),
      lastHeartbeat: null,
      offloadedFrom: config.offloadedFrom || null
    };

    edgeNode.agents.push(agentId);
    edgeNode.load += computeRequired;
    this.edgeAgents.set(agentId, edgeAgent);

    console.log(`Agent ${agentId} deployed to edge node ${targetNode}`);
    return edgeAgent;
  }

  _selectOptimalNode(priority, computeRequired) {
    const availableNodes = Array.from(this.edgeNodes.values())
      .filter(n => n.status === 'online' && n.load + computeRequired <= n.capacity);

    if (availableNodes.length === 0) return null;

    switch (priority) {
      case 'latency':
        return availableNodes.sort((a, b) => a.latency - b.latency)[0].id;
      case 'capacity':
        return availableNodes.sort((a, b) => (b.capacity - b.load) - (a.capacity - a.load))[0].id;
      case 'cost':
        return availableNodes.sort((a, b) => a.type === 'iot' ? -1 : 1)[0].id;
      default:
        return availableNodes[0].id;
    }
  }

  async offloadToEdge(agentId, data = {}) {
    // Offload from cloud to edge
    const edgeAgent = this.edgeAgents.get(agentId);
    if (edgeAgent) {
      // Already on edge, just update
      edgeAgent.dataRequirements = { ...edgeAgent.dataRequirements, ...data };
      return edgeAgent;
    }

    return this.deployToEdge(agentId, {
      ...data,
      priority: 'latency',
      offloadedFrom: 'cloud'
    });
  }

  async recallFromEdge(agentId) {
    const edgeAgent = this.edgeAgents.get(agentId);
    if (!edgeAgent) {
      throw new Error(`Edge agent not found: ${agentId}`);
    }

    const node = this.edgeNodes.get(edgeAgent.nodeId);
    if (node) {
      node.agents = node.agents.filter(a => a !== agentId);
      node.load -= edgeAgent.computeRequired;
    }

    this.edgeAgents.delete(agentId);
    console.log(`Agent ${agentId} recalled from edge`);
    return { success: true, agentId, fromNode: edgeAgent.nodeId };
  }

  setOffloadRule(agentId, rule) {
    const { conditions = {}, actions = {} } = rule;
    this.offloadRules.set(agentId, {
      conditions,
      actions,
      createdAt: new Date().toISOString()
    });
    console.log(`Offload rule set for agent ${agentId}`);
    return { success: true, agentId, rule };
  }

  evaluateOffload(agentId, metrics) {
    const rule = this.offloadRules.get(agentId);
    if (!rule) return { shouldOffload: false, reason: 'No rule defined' };

    const { conditions } = rule;
    let shouldOffload = true;
    let reason = '';

    if (conditions.latencyThreshold && metrics.latency > conditions.latencyThreshold) {
      shouldOffload = true;
      reason = `Latency ${metrics.latency}ms exceeds threshold ${conditions.latencyThreshold}ms`;
    }

    if (conditions.bandwidthThreshold && metrics.bandwidth < conditions.bandwidthThreshold) {
      shouldOffload = false;
      reason = `Insufficient bandwidth ${metrics.bandwidth}Mbps`;
    }

    if (conditions.dataSize && conditions.dataSize > this._getNodeCapacity()) {
      shouldOffload = false;
      reason = 'Data too large for edge';
    }

    return { shouldOffload, reason };
  }

  _getNodeCapacity() {
    const onlineNodes = Array.from(this.edgeNodes.values())
      .filter(n => n.status === 'online');
    return onlineNodes.reduce((sum, n) => sum + (n.capacity - n.load), 0);
  }

  cacheData(key, data, ttl = 3600) {
    const cacheEntry = {
      data,
      createdAt: Date.now(),
      ttl: ttl * 1000,
      hits: 0
    };
    this.dataCache.set(key, cacheEntry);
    console.log(`Data cached: ${key} (TTL: ${ttl}s)`);
    return { success: true, key };
  }

  getCachedData(key) {
    const entry = this.dataCache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.createdAt > entry.ttl) {
      this.dataCache.delete(key);
      return null;
    }

    entry.hits++;
    return entry.data;
  }

  invalidateCache(key) {
    this.dataCache.delete(key);
    return { success: true, key };
  }

  getEdgeAgentStatus(agentId) {
    const agent = this.edgeAgents.get(agentId);
    if (!agent) {
      throw new Error(`Edge agent not found: ${agentId}`);
    }

    const node = this.edgeNodes.get(agent.nodeId);
    return {
      agentId,
      nodeId: agent.nodeId,
      nodeLocation: node?.location,
      nodeType: node?.type,
      computeRequired: agent.computeRequired,
      status: agent.status,
      priority: agent.priority,
      deployedAt: agent.deployedAt,
      offloadedFrom: agent.offloadedFrom
    };
  }

  getEdgeNodeStatus(nodeId) {
    const node = this.edgeNodes.get(nodeId);
    if (!node) {
      throw new Error(`Edge node not found: ${nodeId}`);
    }

    return {
      id: node.id,
      location: node.location,
      type: node.type,
      status: node.status,
      capacity: node.capacity,
      load: node.load,
      availableCapacity: node.capacity - node.load,
      agents: node.agents,
      latency: node.latency,
      cpu: node.cpu,
      memory: node.memory
    };
  }

  listEdgeNodes() {
    return Array.from(this.edgeNodes.values()).map(n => ({
      id: n.id,
      location: n.location,
      type: n.type,
      status: n.status,
      capacity: n.capacity,
      load: n.load,
      agents: n.agents.length,
      latency: n.latency
    }));
  }

  listEdgeAgents() {
    return Array.from(this.edgeAgents.keys()).map(id => this.getEdgeAgentStatus(id));
  }

  async syncEdgeToCloud(agentId, data) {
    const agent = this.edgeAgents.get(agentId);
    if (!agent) {
      throw new Error(`Edge agent not found: ${agentId}`);
    }

    console.log(`Syncing agent ${agentId} data to cloud`);
    return {
      success: true,
      agentId,
      dataSize: JSON.stringify(data).length,
      syncedAt: new Date().toISOString()
    };
  }

  async distributeAgent(agentId, config = {}) {
    const { nodeIds, replicationMode = 'fanout' } = config;
    const results = [];

    if (replicationMode === 'fanout') {
      // Deploy to all specified nodes
      for (const nodeId of nodeIds) {
        try {
          const result = await this.deployToEdge(`${agentId}-${nodeId}`, {
            nodeId,
            priority: 'capacity'
          });
          results.push({ nodeId, success: true, agentId: result.agentId });
        } catch (error) {
          results.push({ nodeId, success: false, error: error.message });
        }
      }
    } else if (replicationMode === 'active-passive') {
      // Deploy to primary and backup
      const primary = await this.deployToEdge(`${agentId}-primary`, { nodeId: nodeIds[0] });
      const backup = await this.deployToEdge(`${agentId}-backup`, { nodeId: nodeIds[1] });
      results.push({ nodeId: nodeIds[0], success: true, agentId: primary.agentId, role: 'primary' });
      results.push({ nodeId: nodeIds[1], success: true, agentId: backup.agentId, role: 'backup' });
    }

    return { agentId, results };
  }

  getClosestNode(location) {
    // Simple location matching
    const nodes = Array.from(this.edgeNodes.values())
      .filter(n => n.status === 'online')
      .sort((a, b) => {
        const aMatch = a.location.toLowerCase().includes(location.toLowerCase()) ? 0 : 1;
        const bMatch = b.location.toLowerCase().includes(location.toLowerCase()) ? 0 : 1;
        return aMatch - bMatch;
      });
    return nodes[0]?.id || null;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new EdgeComputingManager({
    maxLatency: 50,
    bandwidthLimit: 100
  });

  switch (command) {
    case 'deploy':
      const agentId = args[1] || 'agent-001';
      const result = await manager.deployToEdge(agentId, { computeRequired: 15 });
      console.log('Deployment result:', result);
      break;

    case 'list-nodes':
      console.log('Edge nodes:', manager.listEdgeNodes());
      break;

    case 'list-agents':
      console.log('Edge agents:', manager.listEdgeAgents());
      break;

    case 'status':
      const statusAgentId = args[1];
      if (!statusAgentId) {
        console.log('Usage: node agent-edge.js status <agent-id>');
        process.exit(1);
      }
      console.log('Agent status:', manager.getEdgeAgentStatus(statusAgentId));
      break;

    case 'recall':
      const recallAgentId = args[1];
      if (!recallAgentId) {
        console.log('Usage: node agent-edge.js recall <agent-id>');
        process.exit(1);
      }
      await manager.recallFromEdge(recallAgentId);
      console.log('Agent recalled from edge');
      break;

    case 'offload':
      const offloadAgentId = args[1] || 'agent-offload';
      await manager.offloadToEdge(offloadAgentId, { computeRequired: 20 });
      console.log('Agent offloaded to edge');
      break;

    case 'cache-set':
      const cacheKey = args[1] || 'test-key';
      const cacheData = { value: 'test-data', timestamp: Date.now() };
      manager.cacheData(cacheKey, cacheData, 60);
      console.log('Data cached');
      break;

    case 'cache-get':
      const getKey = args[1] || 'test-key';
      const cached = manager.getCachedData(getKey);
      console.log('Cached data:', cached);
      break;

    case 'demo':
      console.log('=== Agent Edge Computing Manager Demo ===\n');

      // List edge nodes
      console.log('1. Available edge nodes:');
      console.log('   ', JSON.stringify(manager.listEdgeNodes(), null, 2));

      // Register custom node
      console.log('\n2. Registering custom edge node...');
      manager.registerEdgeNode({
        id: 'edge-cdn-1',
        location: 'CDN Point of Presence',
        type: 'cdn',
        capacity: 100,
        latency: 3
      });
      console.log('   Node registered');

      // Deploy to edge
      console.log('\n3. Deploying agent to edge...');
      const deployment = await manager.deployToEdge('analytics-agent', {
        computeRequired: 20,
        priority: 'latency',
        dataRequirements: { localStorage: 500 }
      });
      console.log('   Deployed to node:', deployment.nodeId);

      // Set offload rule
      console.log('\n4. Setting offload rule...');
      manager.setOffloadRule('analytics-agent', {
        conditions: {
          latencyThreshold: 100,
          bandwidthThreshold: 50,
          dataSize: 1000
        },
        actions: {
          targetNode: 'edge-us-1',
          priority: 'high'
        }
      });
      console.log('   Rule set');

      // Evaluate offload
      console.log('\n5. Evaluating offload conditions...');
      const evaluation = manager.evaluateOffload('analytics-agent', {
        latency: 150,
        bandwidth: 30,
        dataSize: 500
      });
      console.log('   Should offload:', evaluation.shouldOffload);
      console.log('   Reason:', evaluation.reason);

      // Cache data
      console.log('\n6. Caching data at edge...');
      manager.cacheData('user-session-123', { userId: 123, preferences: { theme: 'dark' } }, 300);
      console.log('   Data cached');

      // Get cached data
      console.log('\n7. Retrieving cached data...');
      const cachedData = manager.getCachedData('user-session-123');
      console.log('   Cached:', cachedData);

      // Deploy multiple
      console.log('\n8. Distributing agent across nodes...');
      const distribution = await manager.distributeAgent('replicated-agent', {
        nodeIds: ['edge-us-1', 'edge-us-2', 'edge-eu-1'],
        replicationMode: 'fanout'
      });
      console.log('   Distributed to', distribution.results.filter(r => r.success).length, 'nodes');

      // List all
      console.log('\n9. All edge agents:');
      console.log('   ', JSON.stringify(manager.listEdgeAgents(), null, 2));

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-edge.js <command> [args]');
      console.log('\nCommands:');
      console.log('  deploy [agent-id]         Deploy agent to edge');
      console.log('  list-nodes                 List all edge nodes');
      console.log('  list-agents                List all edge agents');
      console.log('  status <agent-id>          Get edge agent status');
      console.log('  recall <agent-id>          Recall agent from edge');
      console.log('  offload [agent-id]         Offload agent to edge');
      console.log('  cache-set [key]            Cache data at edge');
      console.log('  cache-get [key]            Get cached data');
      console.log('  demo                       Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = EdgeComputingManager;
