/**
 * Agent Network Segmentation Manager
 * Manages network segmentation and microsegmentation for agents
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentNetworkSegmentation {
  constructor(options = {}) {
    this.segments = new Map();
    this.policies = new Map();
    this.agents = new Map();
    this.routes = new Map();
    this.firewallRules = new Map();

    this.config = {
      defaultAction: options.defaultAction || 'deny',
      enableMicrosegmentation: options.enableMicrosegmentation !== false,
      allowIntraSegment: options.allowIntraSegment !== false,
      maxSegments: options.maxSegments || 100
    };

    this.stats = {
      totalSegments: 0,
      totalPolicies: 0,
      totalRoutes: 0,
      blockedConnections: 0,
      allowedConnections: 0
    };

    // Initialize default segments
    this._initDefaultSegments();
  }

  _initDefaultSegments() {
    // DMZ segment for public-facing services
    this.createSegment({
      name: 'dmz',
      description: 'Public-facing services',
      cidr: '10.0.1.0/24',
      tags: ['public', 'web'],
      isolationLevel: 'high'
    });

    // Application segment
    this.createSegment({
      name: 'app',
      description: 'Application servers',
      cidr: '10.0.2.0/24',
      tags: ['internal', 'app'],
      isolationLevel: 'medium'
    });

    // Database segment
    this.createSegment({
      name: 'database',
      description: 'Database servers',
      cidr: '10.0.3.0/24',
      tags: ['internal', 'data'],
      isolationLevel: 'high'
    });

    // Management segment
    this.createSegment({
      name: 'management',
      description: 'Management and monitoring',
      cidr: '10.0.4.0/24',
      tags: ['internal', 'admin'],
      isolationLevel: 'high'
    });
  }

  createSegment(segmentConfig) {
    const { name, description, cidr, tags, isolationLevel } = segmentConfig;

    const segment = {
      id: `segment-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      description: description || '',
      cidr: cidr || '10.0.0.0/24',
      tags: tags || [],
      isolationLevel: isolationLevel || 'medium',
      agents: [],
      policies: [],
      createdAt: new Date().toISOString()
    };

    this.segments.set(segment.id, segment);
    this.stats.totalSegments++;

    console.log(`Segment created: ${segment.id} (${name}) - ${cidr}`);
    return segment;
  }

  deleteSegment(segmentId) {
    const segment = this.segments.get(segmentId);
    if (!segment) {
      throw new Error(`Segment not found: ${segmentId}`);
    }

    if (segment.agents.length > 0) {
      throw new Error(`Cannot delete segment with ${segment.agents.length} agents`);
    }

    this.segments.delete(segmentId);
    this.stats.totalSegments--;

    console.log(`Segment deleted: ${segmentId}`);
    return { success: true, segmentId };
  }

  registerAgent(agentConfig) {
    const { id, name, segmentId, ip, metadata = {} } = agentConfig;

    // Get segment
    const segment = this.segments.get(segmentId);
    if (!segment) {
      throw new Error(`Segment not found: ${segmentId}`);
    }

    const agent = {
      id: id || `agent-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      segmentId,
      segmentName: segment.name,
      ip,
      metadata,
      connected: false,
      createdAt: new Date().toISOString()
    };

    this.agents.set(agent.id, agent);
    segment.agents.push(agent.id);

    // Create default allow policy for segment
    this.createPolicy({
      name: `allow-${segment.name}`,
      sourceSegment: segmentId,
      destinationSegment: segmentId,
      action: 'allow',
      priority: 50
    });

    console.log(`Agent registered: ${agent.id} (${name}) in segment ${segment.name}`);
    return agent;
  }

  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const segment = this.segments.get(agent.segmentId);
    if (segment) {
      segment.agents = segment.agents.filter(id => id !== agentId);
    }

    this.agents.delete(agentId);
    console.log(`Agent unregistered: ${agentId}`);
    return { success: true, agentId };
  }

  createPolicy(policyConfig) {
    const { name, sourceSegment, destinationSegment, action, priority, ports, protocol } = policyConfig;

    const policy = {
      id: `policy-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      sourceSegment,
      destinationSegment,
      action: action || 'allow',
      priority: priority || 0,
      ports: ports || ['*'],
      protocol: protocol || 'tcp',
      enabled: true,
      hitCount: 0,
      createdAt: new Date().toISOString()
    };

    this.policies.set(policy.id, policy);
    this.stats.totalPolicies++;

    // Add to segments
    const source = this.segments.get(sourceSegment);
    const dest = this.segments.get(destinationSegment);
    if (source) source.policies.push(policy.id);
    if (dest) dest.policies.push(policy.id);

    console.log(`Policy created: ${policy.id} (${name})`);
    return policy;
  }

  deletePolicy(policyId) {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    this.policies.delete(policyId);
    this.stats.totalPolicies--;

    console.log(`Policy deleted: ${policyId}`);
    return { success: true, policyId };
  }

  checkConnection(sourceAgentId, destinationAgentId, port, protocol = 'tcp') {
    const source = this.agents.get(sourceAgentId);
    const destination = this.agents.get(destinationAgentId);

    if (!source || !destination) {
      throw new Error('Agent not found');
    }

    // Same segment - check intra-segment policy
    if (source.segmentId === destination.segmentId) {
      if (this.config.allowIntraSegment) {
        this.stats.allowedConnections++;
        return { allowed: true, reason: 'intra-segment' };
      }
    }

    // Get applicable policies
    const applicablePolicies = Array.from(this.policies.values())
      .filter(p => p.enabled)
      .filter(p => p.sourceSegment === source.segmentId || p.sourceSegment === '*')
      .filter(p => p.destinationSegment === destination.segmentId || p.destinationSegment === '*')
      .filter(p => p.ports.includes('*') || p.ports.includes(port) || p.ports.includes(String(port)))
      .sort((a, b) => b.priority - a.priority);

    if (applicablePolicies.length > 0) {
      const policy = applicablePolicies[0];
      policy.hitCount++;

      if (policy.action === 'allow') {
        this.stats.allowedConnections++;
        return { allowed: true, reason: 'policy', policy: policy.name };
      } else {
        this.stats.blockedConnections++;
        return { allowed: false, reason: 'policy', policy: policy.name };
      }
    }

    // Default action
    if (this.config.defaultAction === 'allow') {
      this.stats.allowedConnections++;
      return { allowed: true, reason: 'default-allow' };
    } else {
      this.stats.blockedConnections++;
      return { allowed: false, reason: 'default-deny' };
    }
  }

  addRoute(routeConfig) {
    const { name, sourceSegment, destinationSegment, gateway, metric } = routeConfig;

    const route = {
      id: `route-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      sourceSegment,
      destinationSegment,
      gateway: gateway || '0.0.0.0',
      metric: metric || 100,
      enabled: true,
      createdAt: new Date().toISOString()
    };

    this.routes.set(route.id, route);
    this.stats.totalRoutes++;

    console.log(`Route created: ${route.id} (${name})`);
    return route;
  }

  createFirewallRule(ruleConfig) {
    const { name, sourceIp, destinationIp, port, action, direction } = ruleConfig;

    const rule = {
      id: `rule-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      sourceIp: sourceIp || '0.0.0.0/0',
      destinationIp: destinationIp || '0.0.0.0/0',
      port: port || '*',
      action: action || 'allow',
      direction: direction || 'ingress', // ingress or egress
      enabled: true,
      hitCount: 0,
      createdAt: new Date().toISOString()
    };

    this.firewallRules.set(rule.id, rule);

    console.log(`Firewall rule created: ${rule.id} (${name})`);
    return rule;
  }

  listSegments() {
    return Array.from(this.segments.values()).map(s => ({
      id: s.id,
      name: s.name,
      cidr: s.cidr,
      agents: s.agents.length,
      isolationLevel: s.isolationLevel
    }));
  }

  listPolicies() {
    return Array.from(this.policies.values());
  }

  getAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return agent;
  }

  getStatistics() {
    return {
      segments: {
        total: this.stats.totalSegments,
        byIsolation: Array.from(this.segments.values()).reduce((acc, s) => {
          acc[s.isolationLevel] = (acc[s.isolationLevel] || 0) + 1;
          return acc;
        }, {})
      },
      policies: {
        total: this.stats.totalPolicies,
        allow: Array.from(this.policies.values()).filter(p => p.action === 'allow').length,
        deny: Array.from(this.policies.values()).filter(p => p.action === 'deny').length
      },
      agents: {
        total: this.agents.size,
        bySegment: Array.from(this.segments.values()).reduce((acc, s) => {
          acc[s.name] = s.agents.length;
          return acc;
        }, {})
      },
      connections: {
        allowed: this.stats.allowedConnections,
        blocked: this.stats.blockedConnections
      },
      routes: {
        total: this.stats.totalRoutes
      }
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const segmentation = new AgentNetworkSegmentation({
    defaultAction: 'deny',
    enableMicrosegmentation: true,
    allowIntraSegment: true
  });

  switch (command) {
    case 'create-segment':
      const segment = segmentation.createSegment({
        name: args[1] || 'new-segment',
        cidr: args[2] || '10.0.10.0/24'
      });
      console.log('Segment created:', segment.id);
      break;

    case 'register-agent':
      const agent = segmentation.registerAgent({
        name: args[1] || 'test-agent',
        segmentId: args[2],
        ip: args[3] || '10.0.1.10'
      });
      console.log('Agent registered:', agent.id);
      break;

    case 'check-connection':
      const result = segmentation.checkConnection(args[1], args[2], args[3] || 80);
      console.log('Connection:', result);
      break;

    case 'demo':
      console.log('=== Agent Network Segmentation Demo ===\n');

      // List segments
      console.log('1. Network Segments:');
      const segments = segmentation.listSegments();
      segments.forEach(s => {
        console.log(`   - ${s.name}: ${s.cidr} (${s.agents} agents, isolation: ${s.isolationLevel})`);
      });

      // Register agents
      console.log('\n2. Registering Agents:');
      const agent1 = segmentation.registerAgent({
        name: 'web-gateway',
        segmentId: segments[0].id, // dmz
        ip: '10.0.1.10'
      });
      console.log('   Registered:', agent1.name, 'in', agent1.segmentName);

      const agent2 = segmentation.registerAgent({
        name: 'app-server-1',
        segmentId: segments[1].id, // app
        ip: '10.0.2.10'
      });
      console.log('   Registered:', agent2.name, 'in', agent2.segmentName);

      const agent3 = segmentation.registerAgent({
        name: 'app-server-2',
        segmentId: segments[1].id, // app
        ip: '10.0.2.11'
      });
      console.log('   Registered:', agent3.name, 'in', agent3.segmentName);

      const agent4 = segmentation.registerAgent({
        name: 'database-primary',
        segmentId: segments[2].id, // database
        ip: '10.0.3.10'
      });
      console.log('   Registered:', agent4.name, 'in', agent4.segmentName);

      // Create policies
      console.log('\n3. Creating Policies:');

      segmentation.createPolicy({
        name: 'DMZ to App',
        sourceSegment: segments[0].id, // dmz
        destinationSegment: segments[1].id, // app
        action: 'allow',
        priority: 80,
        ports: [80, 443]
      });
      console.log('   Created: DMZ to App (HTTP/HTTPS)');

      segmentation.createPolicy({
        name: 'App to Database',
        sourceSegment: segments[1].id, // app
        destinationSegment: segments[2].id, // database
        action: 'allow',
        priority: 80,
        ports: [5432]
      });
      console.log('   Created: App to Database (PostgreSQL)');

      segmentation.createPolicy({
        name: 'Database to Management',
        sourceSegment: segments[2].id, // database
        destinationSegment: segments[3].id, // management
        action: 'allow',
        priority: 80,
        ports: [22, 443]
      });
      console.log('   Created: Database to Management');

      segmentation.createPolicy({
        name: 'Block DMZ to Database',
        sourceSegment: segments[0].id, // dmz
        destinationSegment: segments[2].id, // database
        action: 'deny',
        priority: 90
      });
      console.log('   Created: Block DMZ to Database');

      // Check connections
      console.log('\n4. Checking Connections:');

      // DMZ to App (should be allowed)
      const conn1 = segmentation.checkConnection(agent1.id, agent2.id, 80);
      console.log(`   ${agent1.name} -> ${agent2.name}:80`, conn1.allowed ? 'ALLOWED' : 'BLOCKED', `(${conn1.reason})`);

      // App to Database (should be allowed)
      const conn2 = segmentation.checkConnection(agent2.id, agent4.id, 5432);
      console.log(`   ${agent2.name} -> ${agent4.name}:5432`, conn2.allowed ? 'ALLOWED' : 'BLOCKED', `(${conn2.reason})`);

      // DMZ to Database (should be blocked)
      const conn3 = segmentation.checkConnection(agent1.id, agent4.id, 5432);
      console.log(`   ${agent1.name} -> ${agent4.name}:5432`, conn3.allowed ? 'ALLOWED' : 'BLOCKED', `(${conn3.reason})`);

      // Same segment (should be allowed by default)
      const conn4 = segmentation.checkConnection(agent2.id, agent3.id, 8080);
      console.log(`   ${agent2.name} -> ${agent3.name}:8080`, conn4.allowed ? 'ALLOWED' : 'BLOCKED', `(${conn4.reason})`);

      // App to DMZ (should be blocked by default)
      const conn5 = segmentation.checkConnection(agent2.id, agent1.id, 80);
      console.log(`   ${agent2.name} -> ${agent1.name}:80`, conn5.allowed ? 'ALLOWED' : 'BLOCKED', `(${conn5.reason})`);

      // List policies
      console.log('\n5. Active Policies:');
      const policies = segmentation.listPolicies();
      policies.forEach(p => {
        console.log(`   - ${p.name}: ${p.action} (priority: ${p.hitCount} hits)`);
      });

      // Get statistics
      console.log('\n6. Statistics:');
      const stats = segmentation.getStatistics();
      console.log('   Segments:', stats.segments.total);
      console.log('   Agents:', stats.agents.total);
      console.log('   Policies:', stats.policies.total);
      console.log('   Allowed:', stats.connections.allowed);
      console.log('   Blocked:', stats.connections.blocked);
      console.log('   By Segment:', stats.agents.bySegment);

      // Add route
      console.log('\n7. Adding Routes:');
      segmentation.addRoute({
        name: 'DMZ to Internet',
        sourceSegment: segments[0].id,
        destinationSegment: 'internet',
        gateway: '10.0.1.1',
        metric: 10
      });
      console.log('   Added: DMZ to Internet');

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-segmentation.js <command> [args]');
      console.log('\nCommands:');
      console.log('  create-segment [name] [cidr]   Create segment');
      console.log('  register-agent [name] [seg] [ip] Register agent');
      console.log('  check-connection <src> <dst> [port] Check connection');
      console.log('  demo                         Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentNetworkSegmentation;
