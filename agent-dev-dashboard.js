/**
 * Agent Developer Dashboard
 * Provides monitoring and debugging for agent development
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentDevDashboard {
  constructor(options = {}) {
    this.agents = new Map();
    this.metrics = new Map();
    this.logs = new Map();
    this.sessions = new Map();
    this.breakpoints = new Map();
    this.profiles = new Map();

    this.config = {
      logRetentionDays: options.logRetentionDays || 7,
      maxMetricsPoints: options.maxMetricsPoints || 1000,
      enableProfiling: options.enableProfiling !== false,
      refreshInterval: options.refreshInterval || 5000
    };

    // Initialize default dashboard state
    this.dashboardState = {
      activeAgents: 0,
      totalRequests: 0,
      avgResponseTime: 0,
      errorRate: 0,
      lastUpdate: new Date().toISOString()
    };
  }

  registerAgent(agentConfig) {
    const { id, name, type, version, metadata = {} } = agentConfig;

    const agent = {
      id: id || `agent-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      type: type || 'general',
      version: version || '1.0.0',
      status: 'idle',
      metadata,
      createdAt: new Date().toISOString(),
      startedAt: null,
      lastActivity: new Date().toISOString(),
      resources: {
        cpu: 0,
        memory: 0,
        requests: 0,
        errors: 0
      }
    };

    this.agents.set(agent.id, agent);
    this.logs.set(agent.id, []);
    this.metrics.set(agent.id, {
      responseTime: [],
      throughput: [],
      errors: [],
      custom: {}
    });

    console.log(`Agent registered: ${agent.id} (${name})`);
    return agent;
  }

  unregisterAgent(agentId) {
    if (!this.agents.has(agentId)) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    this.agents.delete(agentId);
    this.logs.delete(agentId);
    this.metrics.delete(agentId);
    this.sessions.delete(agentId);

    console.log(`Agent unregistered: ${agentId}`);
    return { success: true, agentId };
  }

  startAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    agent.status = 'running';
    agent.startedAt = new Date().toISOString();
    this.log(agentId, 'info', 'Agent started');

    console.log(`Agent started: ${agentId}`);
    return agent;
  }

  stopAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    agent.status = 'stopped';
    this.log(agentId, 'info', 'Agent stopped');

    console.log(`Agent stopped: ${agentId}`);
    return agent;
  }

  log(agentId, level, message, metadata = {}) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const logEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata
    };

    const agentLogs = this.logs.get(agentId);
    agentLogs.push(logEntry);

    // Keep only last 10000 logs per agent
    if (agentLogs.length > 10000) {
      agentLogs.shift();
    }

    agent.lastActivity = new Date().toISOString();
    return logEntry;
  }

  recordMetric(agentId, metricType, value, timestamp = null) {
    const agentMetrics = this.metrics.get(agentId);
    if (!agentMetrics) {
      throw new Error(`Metrics not found for agent: ${agentId}`);
    }

    const point = {
      timestamp: timestamp || new Date().toISOString(),
      value
    };

    if (agentMetrics[metricType]) {
      agentMetrics[metricType].push(point);

      // Trim old data
      if (agentMetrics[metricType].length > this.config.maxMetricsPoints) {
        agentMetrics[metricType].shift();
      }
    } else {
      agentMetrics.custom[metricType] = [point];
    }

    return point;
  }

  recordRequest(agentId, duration, success = true) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    agent.resources.requests++;
    if (!success) {
      agent.resources.errors++;
    }

    this.recordMetric(agentId, 'responseTime', duration);
    this.recordMetric(agentId, 'throughput', 1);

    // Calculate rolling average response time
    const responseTimes = this.metrics.get(agentId).responseTime;
    if (responseTimes.length > 0) {
      const recentTimes = responseTimes.slice(-100);
      agent.resources.cpu = recentTimes.reduce((a, b) => a + b.value, 0) / recentTimes.length;
    }

    this.dashboardState.totalRequests++;
    return { duration, success };
  }

  setBreakpoint(agentId, condition, action = 'pause') {
    const breakpoint = {
      id: crypto.randomUUID(),
      agentId,
      condition,
      action,
      enabled: true,
      hitCount: 0,
      createdAt: new Date().toISOString()
    };

    this.breakpoints.set(breakpoint.id, breakpoint);
    console.log(`Breakpoint set: ${breakpoint.id} for agent ${agentId}`);
    return breakpoint;
  }

  removeBreakpoint(breakpointId) {
    if (!this.breakpoints.has(breakpointId)) {
      throw new Error(`Breakpoint not found: ${breakpointId}`);
    }

    this.breakpoints.delete(breakpointId);
    console.log(`Breakpoint removed: ${breakpointId}`);
    return { success: true, breakpointId };
  }

  checkBreakpoints(agentId, context) {
    const hits = [];

    for (const [id, bp] of this.breakpoints) {
      if (bp.agentId === agentId && bp.enabled) {
        // Simple condition evaluation
        const conditionMet = this._evaluateCondition(bp.condition, context);
        if (conditionMet) {
          bp.hitCount++;
          hits.push(bp);

          if (bp.action === 'pause') {
            this.log(agentId, 'debug', `Breakpoint hit: ${bp.id}`, { condition: bp.condition });
          }
        }
      }
    }

    return hits;
  }

  _evaluateCondition(condition, context) {
    // Simple condition parser
    if (typeof condition === 'string') {
      const parts = condition.split(' ');
      if (parts.length === 3) {
        const [key, op, value] = parts;
        const contextValue = context[key];
        switch (op) {
          case '==': return contextValue == value;
          case '!=': return contextValue != value;
          case '>': return contextValue > value;
          case '<': return contextValue < value;
          case '>=': return contextValue >= value;
          case '<=': return contextValue <= value;
        }
      }
    }
    return false;
  }

  startProfile(agentId, profileType = 'cpu') {
    const profile = {
      id: crypto.randomUUID(),
      agentId,
      type: profileType,
      status: 'running',
      startTime: new Date().toISOString(),
      endTime: null,
      samples: []
    };

    this.profiles.set(profile.id, profile);
    console.log(`Profiling started: ${profile.id} for agent ${agentId}`);
    return profile;
  }

  stopProfile(profileId) {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    profile.status = 'completed';
    profile.endTime = new Date().toISOString();

    console.log(`Profiling stopped: ${profileId}`);
    return profile;
  }

  addProfileSample(profileId, sample) {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    profile.samples.push({
      timestamp: new Date().toISOString(),
      ...sample
    });

    return profile;
  }

  getAgentLogs(agentId, level = null, limit = 100) {
    const logs = this.logs.get(agentId);
    if (!logs) {
      throw new Error(`Logs not found for agent: ${agentId}`);
    }

    let filtered = logs;
    if (level) {
      filtered = logs.filter(l => l.level === level);
    }

    return filtered.slice(-limit);
  }

  getAgentMetrics(agentId, metricType = null) {
    const metrics = this.metrics.get(agentId);
    if (!metrics) {
      throw new Error(`Metrics not found for agent: ${agentId}`);
    }

    if (metricType) {
      return metrics[metricType] || metrics.custom[metricType] || [];
    }

    return metrics;
  }

  getDashboardOverview() {
    const agents = Array.from(this.agents.values());

    this.dashboardState.activeAgents = agents.filter(a => a.status === 'running').length;
    this.dashboardState.lastUpdate = new Date().toISOString();

    // Calculate aggregate metrics
    let totalResponseTime = 0;
    let totalRequests = 0;
    let totalErrors = 0;

    for (const agent of agents) {
      totalRequests += agent.resources.requests;
      totalErrors += agent.resources.errors;

      const metrics = this.metrics.get(agent.id);
      if (metrics?.responseTime) {
        const recent = metrics.responseTime.slice(-100);
        for (const m of recent) {
          totalResponseTime += m.value;
        }
      }
    }

    if (totalRequests > 0) {
      this.dashboardState.avgResponseTime = totalResponseTime / Math.min(totalRequests, 100);
      this.dashboardState.errorRate = (totalErrors / totalRequests) * 100;
    }

    return {
      ...this.dashboardState,
      agents: agents.map(a => ({
        id: a.id,
        name: a.name,
        type: a.type,
        status: a.status,
        resources: a.resources,
        lastActivity: a.lastActivity
      }))
    };
  }

  getAgentDetails(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const metrics = this.metrics.get(agentId);
    const logs = this.logs.get(agentId);

    // Calculate statistics
    const responseTimes = metrics?.responseTime || [];
    const stats = {
      avgResponseTime: 0,
      p95ResponseTime: 0,
      p99ResponseTime: 0,
      totalRequests: agent.resources.requests,
      errorRate: 0
    };

    if (responseTimes.length > 0) {
      const values = responseTimes.map(m => m.value).sort((a, b) => a - b);
      stats.avgResponseTime = values.reduce((a, b) => a + b, 0) / values.length;
      stats.p95ResponseTime = values[Math.floor(values.length * 0.95)] || 0;
      stats.p99ResponseTime = values[Math.floor(values.length * 0.99)] || 0;
    }

    if (agent.resources.requests > 0) {
      stats.errorRate = (agent.resources.errors / agent.resources.requests) * 100;
    }

    return {
      agent,
      stats,
      logs: logs?.slice(-50) || [],
      metrics: {
        responseTime: responseTimes.slice(-100),
        throughput: metrics?.throughput?.slice(-100) || []
      }
    };
  }

  createSession(agentId, sessionConfig = {}) {
    const { name, description } = sessionConfig;

    const session = {
      id: crypto.randomUUID(),
      agentId,
      name: name || `Session-${Date.now()}`,
      description: description || '',
      status: 'active',
      createdAt: new Date().toISOString(),
      data: {}
    };

    this.sessions.set(session.id, session);
    console.log(`Debug session created: ${session.id} for agent ${agentId}`);
    return session;
  }

  endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    session.status = 'ended';
    session.endedAt = new Date().toISOString();

    console.log(`Session ended: ${sessionId}`);
    return session;
  }

  listAgents(status = null) {
    const agents = Array.from(this.agents.values());
    if (status) {
      return agents.filter(a => a.status === status);
    }
    return agents;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const dashboard = new AgentDevDashboard({
    logRetentionDays: 7,
    maxMetricsPoints: 1000
  });

  switch (command) {
    case 'register':
      const agentName = args[1] || 'my-agent';
      const agentType = args[2] || 'worker';
      const agent = dashboard.registerAgent({
        name: agentName,
        type: agentType,
        version: '1.0.0'
      });
      console.log('Agent registered:', agent.id);
      break;

    case 'start':
      const startAgentId = args[1];
      if (!startAgentId) {
        console.log('Usage: node agent-dev-dashboard.js start <agent-id>');
        process.exit(1);
      }
      dashboard.startAgent(startAgentId);
      console.log('Agent started');
      break;

    case 'stop':
      const stopAgentId = args[1];
      if (!stopAgentId) {
        console.log('Usage: node agent-dev-dashboard.js stop <agent-id>');
        process.exit(1);
      }
      dashboard.stopAgent(stopAgentId);
      console.log('Agent stopped');
      break;

    case 'overview':
      console.log('Dashboard Overview:', dashboard.getDashboardOverview());
      break;

    case 'logs':
      const logsAgentId = args[1];
      const logLevel = args[2] || null;
      if (!logsAgentId) {
        console.log('Usage: node agent-dev-dashboard.js logs <agent-id> [level]');
        process.exit(1);
      }
      console.log('Logs:', dashboard.getAgentLogs(logsAgentId, logLevel));
      break;

    case 'demo':
      console.log('=== Agent Developer Dashboard Demo ===\n');

      // Register agents
      console.log('1. Registering agents...');
      const dataAgent = dashboard.registerAgent({
        name: 'data-processor',
        type: 'worker',
        version: '2.1.0',
        metadata: { environment: 'production' }
      });
      console.log('   Registered:', dataAgent.id);

      const apiAgent = dashboard.registerAgent({
        name: 'api-gateway',
        type: 'gateway',
        version: '1.5.0',
        metadata: { environment: 'production' }
      });
      console.log('   Registered:', apiAgent.id);

      // Start agents
      console.log('\n2. Starting agents...');
      dashboard.startAgent(dataAgent.id);
      dashboard.startAgent(apiAgent.id);

      // Simulate requests
      console.log('\n3. Simulating requests...');
      for (let i = 0; i < 10; i++) {
        const duration = Math.random() * 100 + 10;
        dashboard.recordRequest(dataAgent.id, duration, Math.random() > 0.1);
      }
      for (let i = 0; i < 5; i++) {
        const duration = Math.random() * 50 + 5;
        dashboard.recordRequest(apiAgent.id, duration, Math.random() > 0.05);
      }

      // Log messages
      console.log('\n4. Logging messages...');
      dashboard.log(dataAgent.id, 'info', 'Processing batch job', { batchId: 'batch-123' });
      dashboard.log(dataAgent.id, 'debug', 'Starting data transformation');
      dashboard.log(dataAgent.id, 'warning', 'High memory usage detected', { memory: '85%' });
      dashboard.log(apiAgent.id, 'info', 'Request received', { path: '/api/data', method: 'GET' });
      dashboard.log(apiAgent.id, 'error', 'Connection timeout', { endpoint: 'db-primary' });

      // Set breakpoints
      console.log('\n5. Setting breakpoints...');
      const bp = dashboard.setBreakpoint(dataAgent.id, 'errors > 5');
      console.log('   Breakpoint set:', bp.id);

      // Create debug session
      console.log('\n6. Creating debug session...');
      const session = dashboard.createSession(dataAgent.id, {
        name: 'Debug Session 1',
        description: 'Investigating performance issue'
      });
      console.log('   Session created:', session.id);

      // Get overview
      console.log('\n7. Dashboard Overview:');
      const overview = dashboard.getDashboardOverview();
      console.log('   Active Agents:', overview.activeAgents);
      console.log('   Total Requests:', overview.totalRequests);
      console.log('   Avg Response Time:', overview.avgResponseTime.toFixed(2), 'ms');
      console.log('   Error Rate:', overview.errorRate.toFixed(2), '%');

      // Get agent details
      console.log('\n8. Data Processor Agent Details:');
      const details = dashboard.getAgentDetails(dataAgent.id);
      console.log('   Status:', details.agent.status);
      console.log('   Requests:', details.stats.totalRequests);
      console.log('   Avg Response:', details.stats.avgResponseTime.toFixed(2), 'ms');
      console.log('   P95 Response:', details.stats.p95ResponseTime.toFixed(2), 'ms');
      console.log('   Error Rate:', details.stats.errorRate.toFixed(2), '%');

      // Get logs
      console.log('\n9. Agent Logs:');
      const logs = dashboard.getAgentLogs(dataAgent.id, null, 5);
      logs.forEach(log => {
        console.log(`   [${log.level}] ${log.message}`);
      });

      // End session
      console.log('\n10. Ending debug session...');
      dashboard.endSession(session.id);
      console.log('    Session ended');

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-dev-dashboard.js <command> [args]');
      console.log('\nCommands:');
      console.log('  register [name] [type]   Register an agent');
      console.log('  start <agent-id>          Start an agent');
      console.log('  stop <agent-id>           Stop an agent');
      console.log('  overview                  Get dashboard overview');
      console.log('  logs <agent-id> [level]   Get agent logs');
      console.log('  demo                     Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentDevDashboard;
