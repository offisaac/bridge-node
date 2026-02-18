/**
 * Agent Threat Detector
 * Detects and responds to security threats against agents
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentThreatDetector {
  constructor(options = {}) {
    this.agents = new Map();
    this.threats = new Map();
    this.alerts = new Map();
    this.intelligence = new Map();
    this.blockedIps = new Set();

    this.config = {
      detectionThreshold: options.detectionThreshold || 5,
      blockDuration: options.blockDuration || 3600000, // 1 hour
      alertThreshold: options.alertThreshold || 3,
      enableAutoBlock: options.enableAutoBlock !== false,
      intelligenceSources: options.intelligenceSources || ['internal', 'external']
    };

    // Initialize threat patterns
    this.threatPatterns = this._initThreatPatterns();

    this.stats = {
      totalThreats: 0,
      blockedAttacks: 0,
      alertsGenerated: 0,
      ipsBlocked: 0
    };
  }

  _initThreatPatterns() {
    return {
      'brute-force': {
        id: 'THREAT-BF-001',
        name: 'Brute Force Attack',
        category: 'authentication',
        severity: 'high',
        description: 'Multiple failed authentication attempts detected',
        indicators: ['failed_login', 'invalid_credentials', 'account_lockout'],
        threshold: 5,
        timeWindow: 300000 // 5 minutes
      },
      'ddos': {
        id: 'THREAT-DD-001',
        name: 'Distributed Denial of Service',
        category: 'availability',
        severity: 'critical',
        description: 'Unusual traffic volume detected',
        indicators: ['high_volume', 'traffic_spike', 'request_flood'],
        threshold: 100,
        timeWindow: 60000 // 1 minute
      },
      'sql-injection-attempt': {
        id: 'THREAT-SQL-001',
        name: 'SQL Injection Attempt',
        category: 'injection',
        severity: 'high',
        description: 'Potential SQL injection attack detected',
        indicators: ['sql_keywords', 'union_select', 'or_1_1'],
        threshold: 1,
        timeWindow: 0
      },
      'xss-attempt': {
        id: 'THREAT-XSS-001',
        name: 'Cross-Site Scripting Attempt',
        category: 'injection',
        severity: 'high',
        description: 'Potential XSS attack detected',
        indicators: ['script_tag', 'javascript:', 'onerror'],
        threshold: 1,
        timeWindow: 0
      },
      'unauthorized-access': {
        id: 'THREAT-UA-001',
        name: 'Unauthorized Access Attempt',
        category: 'access',
        severity: 'high',
        description: 'Access attempt without proper authorization',
        indicators: ['forbidden_access', 'privilege_escalation', 'unauthorized_api'],
        threshold: 3,
        timeWindow: 300000
      },
      'data-exfiltration': {
        id: 'THREAT-DE-001',
        name: 'Data Exfiltration',
        category: 'confidentiality',
        severity: 'critical',
        description: 'Unusual data outbound transfer detected',
        indicators: ['large_download', 'bulk_export', 'suspicious_destination'],
        threshold: 1,
        timeWindow: 0
      },
      'anomaly': {
        id: 'THREAT-AM-001',
        name: 'Behavioral Anomaly',
        category: 'anomaly',
        severity: 'medium',
        description: 'Unusual behavior pattern detected',
        indicators: ['unusual_time', 'unusual_location', 'unusual_action'],
        threshold: 2,
        timeWindow: 600000 // 10 minutes
      },
      'malware': {
        id: 'THREAT-MW-001',
        name: 'Malware Indicator',
        category: 'malware',
        severity: 'critical',
        description: 'Potential malware activity detected',
        indicators: ['suspicious_process', 'unknown_binary', 'network_anomaly'],
        threshold: 1,
        timeWindow: 0
      }
    };
  }

  registerAgent(agentConfig) {
    const { id, name, type, metadata = {} } = agentConfig;

    const agent = {
      id: id || `agent-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      type: type || 'general',
      metadata,
      events: [],
      threats: [],
      blocked: false,
      lastActivity: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    this.agents.set(agent.id, agent);

    console.log(`Agent registered for threat detection: ${agent.id} (${name})`);
    return agent;
  }

  recordEvent(agentId, event) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const eventData = {
      id: crypto.randomUUID(),
      timestamp: event.timestamp || new Date().toISOString(),
      type: event.type,
      source: event.source || 'unknown',
      ip: event.ip,
      user: event.user,
      details: event.details || {},
      severity: event.severity || 'low'
    };

    agent.events.push(eventData);
    agent.lastActivity = eventData.timestamp;

    // Keep only last 10000 events
    if (agent.events.length > 10000) {
      agent.events.shift();
    }

    // Check for threats
    this._analyzeEvent(agent, eventData);

    return eventData;
  }

  _analyzeEvent(agent, event) {
    // Check against threat patterns
    for (const [patternId, pattern] of Object.entries(this.threatPatterns)) {
      if (this._matchesPattern(event, pattern)) {
        this._createThreat(agent, pattern, event);
      }
    }

    // Check IP intelligence
    if (event.ip && this.blockedIps.has(event.ip)) {
      this._createThreat(agent, {
        id: 'THREAT-BL-001',
        name: 'Blocked IP Attempt',
        category: 'blacklist',
        severity: 'critical',
        description: `Request from blocked IP: ${event.ip}`
      }, event);
    }
  }

  _matchesPattern(event, pattern) {
    // Check if event matches any indicator
    for (const indicator of pattern.indicators) {
      const eventStr = JSON.stringify(event).toLowerCase();
      if (eventStr.includes(indicator.toLowerCase())) {
        return true;
      }
    }
    return false;
  }

  _createThreat(agent, pattern, event) {
    const threat = {
      id: crypto.randomUUID(),
      agentId: agent.id,
      agentName: agent.name,
      patternId: pattern.id || 'unknown',
      name: pattern.name,
      category: pattern.category,
      severity: pattern.severity,
      description: pattern.description,
      source: event.source,
      ip: event.ip,
      timestamp: event.timestamp,
      status: 'detected',
      blocked: false
    };

    // Auto-block if enabled and severity is critical/high
    if (this.config.enableAutoBlock && (pattern.severity === 'critical' || pattern.severity === 'high')) {
      if (event.ip) {
        this.blockIp(event.ip);
        threat.blocked = true;
        this.stats.blockedAttacks++;
      }
    }

    this.threats.set(threat.id, threat);
    agent.threats.push(threat.id);
    this.stats.totalThreats++;

    console.log(`Threat detected: ${threat.name} for agent ${agent.name}`);

    // Generate alert if threshold reached
    const threatCount = agent.threats.length;
    if (threatCount >= this.config.alertThreshold) {
      this._generateAlert(agent, threatCount);
    }

    return threat;
  }

  blockIp(ip) {
    this.blockedIps.add(ip);
    this.stats.ipsBlocked++;

    console.log(`IP blocked: ${ip}`);
    return { success: true, ip };
  }

  unblockIp(ip) {
    this.blockedIps.delete(ip);

    console.log(`IP unblocked: ${ip}`);
    return { success: true, ip };
  }

  _generateAlert(agent, threatCount) {
    const alert = {
      id: crypto.randomUUID(),
      agentId: agent.id,
      agentName: agent.name,
      type: 'threat_threshold_reached',
      severity: 'high',
      message: `${threatCount} threats detected for agent ${agent.name}`,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };

    this.alerts.set(alert.id, alert);
    this.stats.alertsGenerated++;

    return alert;
  }

  acknowledgeAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();

    return alert;
  }

  getThreats(agentId = null, filters = {}) {
    let threats = [];

    if (agentId) {
      const agent = this.agents.get(agentId);
      if (agent) {
        threats = agent.threats.map(id => this.threats.get(id)).filter(Boolean);
      }
    } else {
      threats = Array.from(this.threats.values());
    }

    // Apply filters
    if (filters.severity) {
      threats = threats.filter(t => t.severity === filters.severity);
    }

    if (filters.category) {
      threats = threats.filter(t => t.category === filters.category);
    }

    if (filters.status) {
      threats = threats.filter(t => t.status === filters.status);
    }

    return threats;
  }

  getAlerts(acknowledged = null) {
    let alerts = Array.from(this.alerts.values());

    if (acknowledged !== null) {
      alerts = alerts.filter(a => a.acknowledged === acknowledged);
    }

    return alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  getAgentThreatProfile(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const threats = this.getThreats(agentId);

    const profile = {
      agentId: agent.id,
      agentName: agent.name,
      totalThreats: threats.length,
      bySeverity: {},
      byCategory: {},
      blockedAttacks: threats.filter(t => t.blocked).length,
      lastThreat: threats.length > 0 ? threats[threats.length - 1].timestamp : null,
      riskScore: this._calculateRiskScore(threats)
    };

    for (const threat of threats) {
      profile.bySeverity[threat.severity] = (profile.bySeverity[threat.severity] || 0) + 1;
      profile.byCategory[threat.category] = (profile.byCategory[threat.category] || 0) + 1;
    }

    return profile;
  }

  _calculateRiskScore(threats) {
    const severityWeights = {
      critical: 10,
      high: 7,
      medium: 4,
      low: 1
    };

    let score = 0;
    for (const threat of threats) {
      score += severityWeights[threat.severity] || 0;
    }

    return Math.min(100, score);
  }

  addIntelligence(intelConfig) {
    const { source, type, data } = intelConfig;

    const intel = {
      id: crypto.randomUUID(),
      source,
      type, // ip, domain, hash, etc.
      data,
      addedAt: new Date().toISOString()
    };

    this.intelligence.set(intel.id, intel);

    // Process IP blocklist
    if (type === 'ip' && data.blocklist) {
      for (const ip of data.blocklist) {
        this.blockedIps.add(ip);
      }
    }

    console.log(`Intelligence added from ${source}`);
    return intel;
  }

  getStatistics() {
    return {
      threats: {
        total: this.stats.totalThreats,
        blocked: this.stats.blockedAttacks,
        bySeverity: Array.from(this.threats.values()).reduce((acc, t) => {
          acc[t.severity] = (acc[t.severity] || 0) + 1;
          return acc;
        }, {}),
        byCategory: Array.from(this.threats.values()).reduce((acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + 1;
          return acc;
        }, {})
      },
      alerts: {
        total: this.stats.alertsGenerated,
        unacknowledged: this.getAlerts(false).length
      },
      blocked: {
        ips: this.stats.ipsBlocked,
        activeBlockedIps: this.blockedIps.size
      }
    };
  }

  listAgents() {
    return Array.from(this.agents.values()).map(a => ({
      id: a.id,
      name: a.name,
      type: a.type,
      threatCount: a.threats.length,
      blocked: a.blocked,
      lastActivity: a.lastActivity
    }));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const detector = new AgentThreatDetector({
    detectionThreshold: 5,
    enableAutoBlock: true
  });

  switch (command) {
    case 'register':
      const agentName = args[1] || 'my-agent';
      const agent = detector.registerAgent({
        name: agentName,
        type: args[2] || 'worker'
      });
      console.log('Agent registered:', agent.id);
      break;

    case 'record':
      const recordAgentId = args[1];
      if (!recordAgentId) {
        console.log('Usage: node agent-threat.js record <agent-id> <event-type> [ip]');
        process.exit(1);
      }
      const event = detector.recordEvent(recordAgentId, {
        type: args[2] || 'login',
        ip: args[3] || '192.168.1.1',
        source: 'api',
        details: { user: 'test' }
      });
      console.log('Event recorded:', event.id);
      break;

    case 'list-threats':
      console.log('Threats:', detector.getThreats());
      break;

    case 'demo':
      console.log('=== Agent Threat Detector Demo ===\n');

      // Register agents
      console.log('1. Registering agents...');
      const agent1 = detector.registerAgent({ name: 'api-gateway', type: 'gateway' });
      console.log('   Registered:', agent1.name);

      const agent2 = detector.registerAgent({ name: 'data-processor', type: 'worker' });
      console.log('   Registered:', agent2.name);

      const agent3 = detector.registerAgent({ name: 'auth-service', type: 'service' });
      console.log('   Registered:', agent3.name);

      // Record events (simulate attacks)
      console.log('\n2. Recording security events...');

      // Brute force attempts on api-gateway
      for (let i = 0; i < 6; i++) {
        detector.recordEvent(agent1.id, {
          type: 'failed_login',
          ip: '10.0.0.100',
          source: 'web',
          details: { user: 'admin', attempt: i + 1 }
        });
      }
      console.log('   Recorded 6 brute force attempts on api-gateway');

      // SQL injection attempt
      detector.recordEvent(agent1.id, {
        type: 'sql_injection',
        ip: '10.0.0.101',
        source: 'api',
        details: { payload: "'; DROP TABLE users;--" }
      });
      console.log('   Recorded SQL injection attempt on api-gateway');

      // Suspicious data transfer
      detector.recordEvent(agent2.id, {
        type: 'large_download',
        ip: '10.0.0.200',
        source: 'internal',
        details: { size: '500MB', destination: 'unknown' }
      });
      console.log('   Recorded data exfiltration attempt on data-processor');

      // Normal activity on auth-service
      for (let i = 0; i < 3; i++) {
        detector.recordEvent(agent3.id, {
          type: 'login',
          ip: '192.168.1.50',
          source: 'web',
          details: { user: 'john', success: true }
        });
      }
      console.log('   Recorded normal activity on auth-service');

      // Get threats
      console.log('\n3. Detected threats:');
      const allThreats = detector.getThreats();
      console.log('   Total threats:', allThreats.length);
      allThreats.forEach(t => {
        console.log(`   [${t.severity}] ${t.name} - ${t.agentName}`);
      });

      // Get threat profile for api-gateway
      console.log('\n4. Threat Profile - api-gateway:');
      const profile1 = detector.getAgentThreatProfile(agent1.id);
      console.log('   Total Threats:', profile1.totalThreats);
      console.log('   By Severity:', profile1.bySeverity);
      console.log('   By Category:', profile1.byCategory);
      console.log('   Risk Score:', profile1.riskScore);

      // Get alerts
      console.log('\n5. Active Alerts:');
      const alerts = detector.getAlerts(false);
      console.log('   Unacknowledged alerts:', alerts.length);
      alerts.forEach(a => {
        console.log(`   - ${a.message}`);
      });

      // Get blocked IPs
      console.log('\n6. Blocked IPs:');
      console.log('   Total blocked:', detector.blockedIps.size);
      console.log('   IPs:', Array.from(detector.blockedIps));

      // Add intelligence
      console.log('\n7. Adding threat intelligence...');
      detector.addIntelligence({
        source: 'external-feed',
        type: 'ip',
        data: {
          blocklist: ['10.0.0.250', '10.0.0.251', '10.0.0.252']
        }
      });
      console.log('   Added 3 IPs to blocklist');

      // Get statistics
      console.log('\n8. Statistics:');
      const stats = detector.getStatistics();
      console.log('   Total Threats:', stats.threats.total);
      console.log('   Blocked Attacks:', stats.threats.blocked);
      console.log('   IPs Blocked:', stats.blocked.ips);
      console.log('   Active Alerts:', stats.alerts.unacknowledged);

      // List agents
      console.log('\n9. Agent Status:');
      const agents = detector.listAgents();
      agents.forEach(a => {
        console.log(`   - ${a.name}: ${a.threatCount} threats, blocked: ${a.blocked}`);
      });

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-threat.js <command> [args]');
      console.log('\nCommands:');
      console.log('  register [name] [type]     Register agent');
      console.log('  record <agent-id> <type>   Record security event');
      console.log('  list-threats              List threats');
      console.log('  demo                      Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentThreatDetector;
