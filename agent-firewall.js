/**
 * Agent Firewall Module
 *
 * Provides firewall rule management services.
 * Usage: node agent-firewall.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show firewall stats
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
 * Rule Action
 */
const RuleAction = {
  ALLOW: 'allow',
  DENY: 'deny',
  DROP: 'drop',
  REJECT: 'reject',
  LOG: 'log'
};

/**
 * Rule Protocol
 */
const RuleProtocol = {
  TCP: 'tcp',
  UDP: 'udp',
  ICMP: 'icmp',
  ANY: 'any'
};

/**
 * Firewall Rule
 */
class FirewallRule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description;
    this.action = config.action || RuleAction.ALLOW;
    this.protocol = config.protocol || RuleProtocol.ANY;
    this.sourceIP = config.sourceIP || 'any';
    this.sourcePort = config.sourcePort || 'any';
    this.destinationIP = config.destinationIP || 'any';
    this.destinationPort = config.destinationPort || 'any';
    this.direction = config.direction || 'inbound'; // inbound, outbound
    this.enabled = config.enabled !== false;
    this.priority = config.priority || 100;
    this.hitCount = 0;
    this.createdAt = Date.now();
    this.metadata = config.metadata || {};
  }

  match(packet) {
    if (!this.enabled) return false;

    // Check direction
    if (this.direction !== 'any' && packet.direction !== this.direction) {
      return false;
    }

    // Check protocol
    if (this.protocol !== RuleProtocol.ANY && this.protocol !== packet.protocol) {
      return false;
    }

    // Check source IP (simplified)
    if (this.sourceIP !== 'any' && !this._matchIP(packet.sourceIP, this.sourceIP)) {
      return false;
    }

    // Check destination IP
    if (this.destinationIP !== 'any' && !this._matchIP(packet.destinationIP, this.destinationIP)) {
      return false;
    }

    // Check ports
    if (this.sourcePort !== 'any' && !this._matchPort(packet.sourcePort, this.sourcePort)) {
      return false;
    }

    if (this.destinationPort !== 'any' && !this._matchPort(packet.destinationPort, this.destinationPort)) {
      return false;
    }

    this.hitCount++;
    return true;
  }

  _matchIP(packetIP, ruleIP) {
    if (ruleIP.includes('/')) {
      // CIDR notation - simplified check
      const [base, prefix] = ruleIP.split('/');
      return packetIP.startsWith(base.split('.').slice(0, parseInt(prefix) / 8).join('.'));
    }
    return packetIP === ruleIP;
  }

  _matchPort(packetPort, rulePort) {
    if (rulePort.includes('-')) {
      const [min, max] = rulePort.split('-').map(Number);
      return packetPort >= min && packetPort <= max;
    }
    return packetPort === parseInt(rulePort);
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.description,
      action: this.action,
      protocol: this.protocol,
      sourceIP: this.sourceIP,
      destinationIP: this.destinationIP,
      enabled: this.enabled,
      priority: this.priority,
      hitCount: this.hitCount
    };
  }
}

/**
 * Firewall Log Entry
 */
class FirewallLogEntry {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.timestamp = config.timestamp || Date.now();
    this.ruleId = config.ruleId;
    this.action = config.action;
    this.sourceIP = config.sourceIP;
    this.destinationIP = config.destinationIP;
    this.protocol = config.protocol;
    this.sourcePort = config.sourcePort;
    this.destinationPort = config.destinationPort;
    this.packetLength = config.packetLength;
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      ruleId: this.ruleId,
      action: this.action,
      sourceIP: this.sourceIP,
      destinationIP: this.destinationIP,
      protocol: this.protocol,
      destinationPort: this.destinationPort
    };
  }
}

/**
 * Firewall Manager
 */
class FirewallManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.rules = new Map();
    this.logs = [];
    this.stats = {
      packetsAllowed: 0,
      packetsDenied: 0,
      packetsDropped: 0,
      rulesMatched: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._createDefaultRules();
  }

  _createDefaultRules() {
    this.addRule(new FirewallRule({
      id: 'rule-default-deny',
      name: 'Default Deny',
      description: 'Drop all traffic by default',
      action: RuleAction.DROP,
      protocol: RuleProtocol.ANY,
      priority: 999,
      enabled: true
    }));

    this.addRule(new FirewallRule({
      id: 'rule-allow-http',
      name: 'Allow HTTP',
      description: 'Allow incoming HTTP traffic',
      action: RuleAction.ALLOW,
      protocol: RuleProtocol.TCP,
      destinationPort: '80',
      direction: 'inbound',
      priority: 50,
      enabled: true
    }));

    this.addRule(new FirewallRule({
      id: 'rule-allow-https',
      name: 'Allow HTTPS',
      description: 'Allow incoming HTTPS traffic',
      action: RuleAction.ALLOW,
      protocol: RuleProtocol.TCP,
      destinationPort: '443',
      direction: 'inbound',
      priority: 50,
      enabled: true
    }));

    this.addRule(new FirewallRule({
      id: 'rule-block-telnet',
      name: 'Block Telnet',
      description: 'Block Telnet traffic',
      action: RuleAction.DENY,
      protocol: RuleProtocol.TCP,
      destinationPort: '23',
      direction: 'inbound',
      priority: 30,
      enabled: true
    }));
  }

  addRule(rule) {
    this.rules.set(rule.id, rule);
    // Re-sort rules by priority
    this._sortRules();
  }

  _sortRules() {
    const sorted = Array.from(this.rules.values()).sort((a, b) => a.priority - b.priority);
    this.rules = new Map(sorted.map(r => [r.id, r]));
  }

  getRule(ruleId) {
    return this.rules.get(ruleId);
  }

  removeRule(ruleId) {
    return this.rules.delete(ruleId);
  }

  processPacket(packet) {
    // Sort by priority and find matching rule
    const sortedRules = Array.from(this.rules.values()).sort((a, b) => a.priority - b.priority);

    for (const rule of sortedRules) {
      if (rule.match(packet)) {
        this.stats.rulesMatched++;

        if (rule.action === RuleAction.ALLOW) {
          this.stats.packetsAllowed++;
        } else if (rule.action === RuleAction.DENY) {
          this.stats.packetsDenied++;
        } else if (rule.action === RuleAction.DROP) {
          this.stats.packetsDropped++;
        }

        // Log the event
        this._logPacket(packet, rule);
        return { action: rule.action, rule: rule.id };
      }
    }

    // Default deny
    this.stats.packetsDropped++;
    return { action: RuleAction.DROP, rule: 'default' };
  }

  _logPacket(packet, rule) {
    const entry = new FirewallLogEntry({
      ruleId: rule.id,
      action: rule.action,
      sourceIP: packet.sourceIP,
      destinationIP: packet.destinationIP,
      protocol: packet.protocol,
      sourcePort: packet.sourcePort,
      destinationPort: packet.destinationPort,
      packetLength: packet.length
    });

    this.logs.push(entry);

    // Keep only last 1000 logs
    if (this.logs.length > 1000) {
      this.logs.shift();
    }
  }

  getLogs(filter = {}) {
    const results = [];
    for (const entry of this.logs) {
      if (filter.action && entry.action !== filter.action) continue;
      if (filter.sourceIP && entry.sourceIP !== filter.sourceIP) continue;
      if (filter.destinationIP && entry.destinationIP !== filter.destinationIP) continue;
      results.push(entry);
    }
    return results;
  }

  enableRule(ruleId) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enable();
      return true;
    }
    return false;
  }

  disableRule(ruleId) {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.disable();
      return true;
    }
    return false;
  }

  getStats() {
    return {
      ...this.stats,
      rulesCount: this.rules.size,
      logsCount: this.logs.length,
      enabledRules: Array.from(this.rules.values()).filter(r => r.enabled).length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Firewall Demo\n');

  const manager = new FirewallManager();

  // Show rules
  console.log('1. Firewall Rules:');
  for (const rule of manager.rules.values()) {
    console.log(`   - ${rule.name}: ${rule.description} [${rule.action}]`);
  }

  // Process allowed packet
  console.log('\n2. Processing HTTP Packet:');
  const result1 = manager.processPacket({
    sourceIP: '192.168.1.100',
    destinationIP: '10.0.0.1',
    protocol: 'tcp',
    sourcePort: 12345,
    destinationPort: 80,
    length: 512,
    direction: 'inbound'
  });
  console.log(`   Action: ${result1.action}`);
  console.log(`   Rule: ${result1.rule}`);

  // Process HTTPS packet
  console.log('\n3. Processing HTTPS Packet:');
  const result2 = manager.processPacket({
    sourceIP: '192.168.1.100',
    destinationIP: '10.0.0.1',
    protocol: 'tcp',
    sourcePort: 12346,
    destinationPort: 443,
    length: 512,
    direction: 'inbound'
  });
  console.log(`   Action: ${result2.action}`);

  // Process blocked packet
  console.log('\n4. Processing Telnet Packet:');
  const result3 = manager.processPacket({
    sourceIP: '192.168.1.100',
    destinationIP: '10.0.0.1',
    protocol: 'tcp',
    sourcePort: 12347,
    destinationPort: 23,
    length: 64,
    direction: 'inbound'
  });
  console.log(`   Action: ${result3.action}`);

  // Process denied packet
  console.log('\n5. Processing Blocked IP Packet:');
  manager.addRule(new FirewallRule({
    name: 'Block Malicious IP',
    description: 'Block traffic from 192.168.1.100',
    action: RuleAction.DENY,
    sourceIP: '192.168.1.100',
    priority: 10,
    enabled: true
  }));

  const result4 = manager.processPacket({
    sourceIP: '192.168.1.100',
    destinationIP: '10.0.0.1',
    protocol: 'tcp',
    sourcePort: 12348,
    destinationPort: 8080,
    length: 256,
    direction: 'inbound'
  });
  console.log(`   Action: ${result4.action}`);

  // View logs
  console.log('\n6. Firewall Logs:');
  const logs = manager.getLogs();
  console.log(`   Total log entries: ${logs.length}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Packets Allowed: ${stats.packetsAllowed}`);
  console.log(`   Packets Denied: ${stats.packetsDenied}`);
  console.log(`   Packets Dropped: ${stats.packetsDropped}`);
  console.log(`   Rules Matched: ${stats.rulesMatched}`);
  console.log(`   Total Rules: ${stats.rulesCount}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new FirewallManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Firewall Module');
  console.log('Usage: node agent-firewall.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
