/**
 * Agent Registry - Agent注册与发现服务
 * Agent注册和发现服务模块
 */

const fs = require('fs');
const path = require('path');

// ========== Data Models ==========

class Agent {
  constructor(data) {
    this.id = data.id || `agent_${Date.now()}`;
    this.name = data.name;
    this.type = data.type; // worker, coordinator, monitor, etc.
    this.capabilities = data.capabilities || []; // ['data-processing', 'api-call', etc.]
    this.status = data.status || 'offline'; // online, offline, busy, unknown
    this.endpoint = data.endpoint || ''; // URL or connection string
    this.metadata = data.metadata || {};
    this.tags = data.tags || [];
    this.version = data.version || '1.0.0';
    this.health = data.health || {
      status: 'healthy',
      lastCheck: Date.now(),
      responseTime: 0
    };
    this.createdAt = data.createdAt || Date.now();
    this.lastSeen = data.lastSeen || Date.now();
    this.heartbeatInterval = data.heartbeatInterval || 30000; // ms
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      capabilities: this.capabilities,
      status: this.status,
      endpoint: this.endpoint,
      metadata: this.metadata,
      tags: this.tags,
      version: this.version,
      health: this.health,
      createdAt: this.createdAt,
      lastSeen: this.lastSeen
    };
  }

  updateHeartbeat() {
    this.lastSeen = Date.now();
    this.status = 'online';
    return this;
  }

  setHealth(health) {
    this.health = { ...this.health, ...health, lastCheck: Date.now() };
    return this;
  }
}

class ServiceEndpoint {
  constructor(data) {
    this.agentId = data.agentId;
    this.path = data.path;
    this.method = data.method || 'GET';
    this.description = data.description || '';
    this.rateLimit = data.rateLimit || null;
  }

  toJSON() {
    return {
      agentId: this.agentId,
      path: this.path,
      method: this.method,
      description: this.description,
      rateLimit: this.rateLimit
    };
  }
}

// ========== Main Registry Class ==========

class AgentRegistry {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './agent-registry-data';
    this.agents = new Map();
    this.endpoints = new Map(); // agentId -> ServiceEndpoint[]
    this.watchers = new Set();

    this._init();
    this._startHealthCheck();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
  }

  _loadData() {
    const agentsFile = path.join(this.storageDir, 'agents.json');
    if (fs.existsSync(agentsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(agentsFile, 'utf8'));
        for (const a of data) {
          this.agents.set(a.id, new Agent(a));
        }
      } catch (e) {
        console.error('Failed to load agents:', e);
      }
    }

    const endpointsFile = path.join(this.storageDir, 'endpoints.json');
    if (fs.existsSync(endpointsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(endpointsFile, 'utf8'));
        for (const [agentId, eps] of Object.entries(data)) {
          this.endpoints.set(agentId, eps.map(e => new ServiceEndpoint({ ...e, agentId })));
        }
      } catch (e) {
        console.error('Failed to load endpoints:', e);
      }
    }
  }

  _saveData() {
    const agentsData = Array.from(this.agents.values()).map(a => a.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'agents.json'),
      JSON.stringify(agentsData, null, 2)
    );

    const endpointsData = {};
    for (const [agentId, eps] of this.endpoints) {
      endpointsData[agentId] = eps.map(e => e.toJSON());
    }
    fs.writeFileSync(
      path.join(this.storageDir, 'endpoints.json'),
      JSON.stringify(endpointsData, null, 2)
    );
  }

  // ========== Agent Management ==========

  register(agentData) {
    const agent = new Agent(agentData);
    this.agents.set(agent.id, agent);
    this._saveData();
    this._notifyWatchers('register', agent);
    return agent;
  }

  unregister(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    this.agents.delete(agentId);
    this.endpoints.delete(agentId);
    this._saveData();
    this._notifyWatchers('unregister', { id: agentId, name: agent.name });
    return agent;
  }

  getAgent(agentId) {
    return this.agents.get(agentId) || null;
  }

  listAgents(filters = {}) {
    let result = Array.from(this.agents.values());

    if (filters.status) {
      result = result.filter(a => a.status === filters.status);
    }

    if (filters.type) {
      result = result.filter(a => a.type === filters.type);
    }

    if (filters.capability) {
      result = result.filter(a => a.capabilities.includes(filters.capability));
    }

    if (filters.tag) {
      result = result.filter(a => a.tags.includes(filters.tag));
    }

    return result.sort((a, b) => b.lastSeen - a.lastSeen);
  }

  updateAgent(agentId, updates) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    Object.assign(agent, updates);
    agent.lastSeen = Date.now();
    this._saveData();
    this._notifyWatchers('update', agent);
    return agent;
  }

  // ========== Heartbeat ==========

  heartbeat(agentId, health = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    agent.updateHeartbeat();
    if (Object.keys(health).length > 0) {
      agent.setHealth(health);
    }
    this._saveData();
    return agent;
  }

  // ========== Discovery ==========

  discover(criteria = {}) {
    let agents = this.listAgents({ status: 'online' });

    if (criteria.capability) {
      agents = agents.filter(a => a.capabilities.includes(criteria.capability));
    }

    if (criteria.type) {
      agents = agents.filter(a => a.type === criteria.type);
    }

    if (criteria.tags) {
      for (const tag of criteria.tags) {
        agents = agents.filter(a => a.tags.includes(tag));
      }
    }

    // Score by health
    if (criteria.healthy) {
      agents = agents.filter(a => a.health.status === 'healthy');
    }

    return agents;
  }

  findBestAgent(criteria = {}) {
    const candidates = this.discover(criteria);
    if (candidates.length === 0) return null;

    // Score by health and response time
    return candidates.sort((a, b) => {
      const aScore = (a.health.responseTime || 1000);
      const bScore = (b.health.responseTime || 1000);
      return aScore - bScore;
    })[0];
  }

  // ========== Endpoints ==========

  registerEndpoint(agentId, endpointData) {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    if (!this.endpoints.has(agentId)) {
      this.endpoints.set(agentId, []);
    }

    const endpoint = new ServiceEndpoint({ ...endpointData, agentId });
    this.endpoints.get(agentId).push(endpoint);
    this._saveData();
    return endpoint;
  }

  getEndpoints(agentId) {
    return this.endpoints.get(agentId) || [];
  }

  findEndpoint(path, method = 'GET') {
    for (const [agentId, endpoints] of this.endpoints) {
      const agent = this.agents.get(agentId);
      if (!agent || agent.status !== 'online') continue;

      for (const endpoint of endpoints) {
        if (endpoint.path === path && (endpoint.method === method || endpoint.method === 'ALL')) {
          return { endpoint, agent };
        }
      }
    }
    return null;
  }

  // ========== Watchers ==========

  addWatcher(callback) {
    this.watchers.add(callback);
    return () => this.watchers.delete(callback);
  }

  _notifyWatchers(event, data) {
    for (const watcher of this.watchers) {
      try {
        watcher(event, data);
      } catch (e) {
        console.error('Watcher error:', e);
      }
    }
  }

  // ========== Health Check ==========

  _startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      this._checkHealth();
    }, 30000); // Check every 30 seconds
  }

  _checkHealth() {
    const now = Date.now();
    for (const agent of this.agents.values()) {
      if (agent.status === 'online') {
        const idleTime = now - agent.lastSeen;
        if (idleTime > agent.heartbeatInterval * 2) {
          agent.status = 'offline';
          this._notifyWatchers('offline', agent);
        }
      }
    }
    this._saveData();
  }

  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  // ========== Statistics ==========

  getStats() {
    const agents = Array.from(this.agents.values());
    const statusCounts = { online: 0, offline: 0, busy: 0, unknown: 0 };
    const typeCounts = {};

    for (const a of agents) {
      statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
      typeCounts[a.type] = (typeCounts[a.type] || 0) + 1;
    }

    const healthyCount = agents.filter(a => a.health.status === 'healthy').length;

    return {
      totalAgents: agents.length,
      onlineAgents: statusCounts.online,
      offlineAgents: statusCounts.offline,
      healthyAgents: healthyCount,
      byStatus: statusCounts,
      byType: typeCounts,
      totalEndpoints: Array.from(this.endpoints.values()).reduce((sum, eps) => sum + eps.length, 0)
    };
  }

  // ========== Export ==========

  exportServiceMap() {
    const map = {
      agents: [],
      endpoints: [],
      connections: []
    };

    for (const agent of this.listAgents({ status: 'online' })) {
      map.agents.push({
        id: agent.id,
        name: agent.name,
        type: agent.type,
        capabilities: agent.capabilities,
        status: agent.status
      });

      for (const endpoint of this.getEndpoints(agent.id)) {
        map.endpoints.push({
          ...endpoint.toJSON(),
          agentName: agent.name
        });
      }
    }

    return map;
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const registry = new AgentRegistry();

  switch (command) {
    case 'list':
      console.log('Registered Agents:');
      console.log('=================');
      for (const agent of registry.listAgents()) {
        console.log(`\n[${agent.status}] ${agent.name} (${agent.type})`);
        console.log(`  ID: ${agent.id}`);
        console.log(`  Capabilities: ${agent.capabilities.join(', ')}`);
        console.log(`  Last seen: ${new Date(agent.lastSeen).toLocaleString()}`);
      }
      break;

    case 'register':
      const agent = registry.register({
        name: args[1] || 'New Agent',
        type: args[2] || 'worker',
        capabilities: args[3] ? args[3].split(',') : ['default'],
        endpoint: args[4] || 'http://localhost:8080',
        status: 'online'
      });
      console.log(`Registered agent: ${agent.id}`);
      break;

    case 'unregister':
      registry.unregister(args[1]);
      console.log(`Unregistered agent: ${args[1]}`);
      break;

    case 'heartbeat':
      registry.heartbeat(args[1], {
        status: 'healthy',
        responseTime: parseInt(args[2]) || 50
      });
      console.log(`Heartbeat received from: ${args[1]}`);
      break;

    case 'discover':
      const criteria = {};
      if (args[1]) criteria.capability = args[1];
      if (args[2]) criteria.type = args[2];
      const found = registry.discover(criteria);
      console.log(`Found ${found.length} agents:`);
      for (const a of found) {
        console.log(`  - ${a.name} (${a.type})`);
      }
      break;

    case 'stats':
      console.log('Registry Statistics:');
      console.log(JSON.stringify(registry.getStats(), null, 2));
      break;

    case 'export':
      console.log('Service Map:');
      console.log(JSON.stringify(registry.exportServiceMap(), null, 2));
      break;

    case 'demo':
      // Register demo agents
      registry.register({
        name: 'DataProcessor-1',
        type: 'worker',
        capabilities: ['data-processing', 'etl', 'transform'],
        endpoint: 'http://worker-1:8080',
        tags: ['production', 'high-memory']
      });

      registry.register({
        name: 'DataProcessor-2',
        type: 'worker',
        capabilities: ['data-processing', 'etl'],
        endpoint: 'http://worker-2:8080',
        tags: ['production']
      });

      registry.register({
        name: 'APICoordinator',
        type: 'coordinator',
        capabilities: ['api-gateway', 'routing', 'orchestration'],
        endpoint: 'http://coordinator:8080',
        tags: ['production', 'api']
      });

      registry.register({
        name: 'MonitorAgent',
        type: 'monitor',
        capabilities: ['monitoring', 'alerting', 'metrics'],
        endpoint: 'http://monitor:8080',
        tags: ['production', 'monitoring']
      });

      // Register heartbeat to make them online - get IDs from list
      const agents = registry.listAgents();
      for (const a of agents) {
        registry.heartbeat(a.id, { status: 'healthy', responseTime: Math.floor(Math.random() * 50) + 10 });
      }

      console.log('=== Demo Agents Registered ===');

      console.log('\n--- All Agents ---');
      for (const a of registry.listAgents()) {
        console.log(`[${a.status}] ${a.name}: ${a.capabilities.join(', ')}`);
      }

      console.log('\n--- Discover: data-processing ---');
      const workers = registry.discover({ capability: 'data-processing' });
      console.log('Found:', workers.map(w => w.name).join(', '));

      console.log('\n--- Discover: monitoring ---');
      const monitors = registry.discover({ capability: 'monitoring' });
      console.log('Found:', monitors.map(m => m.name).join(', '));

      console.log('\n--- Best Agent: api-gateway ---');
      const best = registry.findBestAgent({ capability: 'api-gateway' });
      console.log('Best:', best ? best.name : 'None found');

      console.log('\n--- Statistics ---');
      console.log(JSON.stringify(registry.getStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node agent-registry.js list');
      console.log('  node agent-registry.js register <name> <type> <capabilities> <endpoint>');
      console.log('  node agent-registry.js unregister <agent-id>');
      console.log('  node agent-registry.js heartbeat <agent-id> [response-time]');
      console.log('  node agent-registry.js discover [capability] [type]');
      console.log('  node agent-registry.js stats');
      console.log('  node agent-registry.js export');
      console.log('  node agent-registry.js demo');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  Agent,
  ServiceEndpoint,
  AgentRegistry
};
