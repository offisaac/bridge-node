/**
 * Agent IDS Module
 *
 * Provides Intrusion Detection System services.
 * Usage: node agent-ids.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show IDS stats
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
 * Alert Severity
 */
const AlertSeverity = {
  INFO: 'info',
  WARNING: 'warning',
  ALERT: 'alert',
  CRITICAL: 'critical'
};

/**
 * IDS Alert
 */
class IDSAlert {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.signatureId = config.signatureId;
    this.severity = config.severity || AlertSeverity.WARNING;
    this.source = config.source;
    this.destination = config.destination;
    this.protocol = config.protocol;
    this.message = config.message;
    this.metadata = config.metadata || {};
    this.createdAt = Date.now();
    this.status = 'new';
    this.acknowledgedAt = null;
    this.resolvedAt = null;
  }

  acknowledge() {
    this.status = 'acknowledged';
    this.acknowledgedAt = Date.now();
  }

  resolve() {
    this.status = 'resolved';
    this.resolvedAt = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      signatureId: this.signatureId,
      severity: this.severity,
      source: this.source,
      destination: this.destination,
      protocol: this.protocol,
      message: this.message,
      createdAt: this.createdAt,
      status: this.status
    };
  }
}

/**
 * IDS Signature
 */
class IDSSignature {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description;
    this.severity = config.severity || AlertSeverity.WARNING;
    this.pattern = config.pattern;
    this.protocol = config.protocol;
    this.category = config.category;
    this.enabled = config.enabled !== false;
  }

  match(packet) {
    if (!this.enabled) return false;

    if (this.protocol && packet.protocol !== this.protocol) {
      return false;
    }

    if (this.pattern) {
      return packet.payload && packet.payload.includes(this.pattern);
    }

    return false;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      severity: this.severity,
      category: this.category,
      enabled: this.enabled
    };
  }
}

/**
 * Network Packet
 */
class NetworkPacket {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.timestamp = config.timestamp || Date.now();
    this.source = config.source;
    this.destination = config.destination;
    this.protocol = config.protocol;
    this.length = config.length || 0;
    this.payload = config.payload || '';
    this.flags = config.flags || [];
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      source: this.source,
      destination: this.destination,
      protocol: this.protocol,
      length: this.length,
      payload: this.payload
    };
  }
}

/**
 * IDS Manager
 */
class IDSManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.alerts = new Map();
    this.signatures = new Map();
    this.packets = [];
    this.stats = {
      packetsProcessed: 0,
      signaturesMatched: 0,
      alertsGenerated: 0,
      alertsAcknowledged: 0,
      alertsResolved: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._createDefaultSignatures();
  }

  _createDefaultSignatures() {
    this.addSignature(new IDSSignature({
      id: 'sig-port-scan',
      name: 'Port Scan Detection',
      description: 'Detects potential port scanning activity',
      severity: AlertSeverity.WARNING,
      pattern: 'SYN',
      protocol: 'TCP',
      category: 'reconnaissance',
      enabled: true
    }));

    this.addSignature(new IDSSignature({
      id: 'sig-sql-injection',
      name: 'SQL Injection Attempt',
      description: 'Detects SQL injection patterns',
      severity: AlertSeverity.CRITICAL,
      pattern: "' OR '1'='1",
      protocol: 'HTTP',
      category: 'attack'
    }));

    this.addSignature(new IDSSignature({
      id: 'sig-xss',
      name: 'Cross-Site Scripting Attempt',
      description: 'Detects XSS patterns',
      severity: AlertSeverity.ALERT,
      pattern: '<script>',
      protocol: 'HTTP',
      category: 'attack'
    }));

    this.addSignature(new IDSSignature({
      id: 'sig-brute-force',
      name: 'Brute Force Attack',
      description: 'Detects multiple failed authentication attempts',
      severity: AlertSeverity.CRITICAL,
      pattern: '401',
      protocol: 'HTTP',
      category: 'attack'
    }));
  }

  addSignature(signature) {
    this.signatures.set(signature.id, signature);
  }

  getSignature(signatureId) {
    return this.signatures.get(signatureId);
  }

  processPacket(packetData) {
    const packet = new NetworkPacket(packetData);
    this.packets.push(packet);
    this.stats.packetsProcessed++;

    // Check against all signatures
    for (const signature of this.signatures.values()) {
      if (signature.match(packet)) {
        this.stats.signaturesMatched++;
        this._createAlert(signature, packet);
      }
    }

    return packet;
  }

  _createAlert(signature, packet) {
    const alert = new IDSAlert({
      signatureId: signature.id,
      severity: signature.severity,
      source: packet.source,
      destination: packet.destination,
      protocol: packet.protocol,
      message: signature.description,
      metadata: {
        packetId: packet.id,
        payload: packet.payload
      }
    });

    this.alerts.set(alert.id, alert);
    this.stats.alertsGenerated++;

    return alert;
  }

  getAlert(alertId) {
    return this.alerts.get(alertId);
  }

  acknowledgeAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledge();
      this.stats.alertsAcknowledged++;
      return true;
    }
    return false;
  }

  resolveAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolve();
      this.stats.alertsResolved++;
      return true;
    }
    return false;
  }

  getAlerts(filter = {}) {
    const results = [];
    for (const alert of this.alerts.values()) {
      if (filter.severity && alert.severity !== filter.severity) continue;
      if (filter.status && alert.status !== filter.status) continue;
      if (filter.source && alert.source !== filter.source) continue;
      results.push(alert);
    }
    return results;
  }

  enableSignature(signatureId) {
    const signature = this.signatures.get(signatureId);
    if (signature) {
      signature.enabled = true;
      return true;
    }
    return false;
  }

  disableSignature(signatureId) {
    const signature = this.signatures.get(signatureId);
    if (signature) {
      signature.enabled = false;
      return true;
    }
    return false;
  }

  getStats() {
    return {
      ...this.stats,
      signaturesCount: this.signatures.size,
      alertsNew: this.getAlerts({ status: 'new' }).length,
      packetsInMemory: this.packets.length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent IDS Demo\n');

  const manager = new IDSManager();

  // Show signatures
  console.log('1. IDS Signatures:');
  for (const sig of manager.signatures.values()) {
    console.log(`   - ${sig.name}: ${sig.description} [${sig.severity}]`);
  }

  // Process normal traffic
  console.log('\n2. Processing Normal Traffic:');
  manager.processPacket({
    source: '192.168.1.100',
    destination: '192.168.1.1',
    protocol: 'HTTP',
    length: 512,
    payload: 'GET /index.html HTTP/1.1'
  });
  console.log(`   Processed: 1 packet`);

  // Process suspicious traffic
  console.log('\n3. Processing Suspicious Traffic:');
  const alert1 = manager.processPacket({
    source: '192.168.1.100',
    destination: '10.0.0.1',
    protocol: 'HTTP',
    length: 1024,
    payload: "GET /login?user=' OR '1'='1 HTTP/1.1"
  });
  console.log(`   Alert generated: ${alert1.signatureId}`);

  // Process more suspicious traffic
  console.log('\n4. Processing XSS Attempt:');
  const alert2 = manager.processPacket({
    source: '192.168.1.100',
    destination: '10.0.0.1',
    protocol: 'HTTP',
    length: 256,
    payload: "POST /comment <script>alert('XSS')</script>"
  });
  console.log(`   Alert generated: ${alert2.signatureId}`);

  // Process port scan
  console.log('\n5. Processing Port Scan:');
  manager.processPacket({
    source: '192.168.1.200',
    destination: '192.168.1.1',
    protocol: 'TCP',
    length: 64,
    payload: 'SYN',
    flags: ['SYN']
  });
  console.log(`   Processed TCP SYN packet`);

  // Manage alerts
  console.log('\n6. Managing Alerts:');
  const alerts = Array.from(manager.alerts.values());
  if (alerts.length > 0) {
    manager.acknowledgeAlert(alerts[0].id);
    console.log(`   Acknowledged alert: ${alerts[0].id.substring(0, 8)}`);
  }

  // Query alerts
  console.log('\n7. Querying Alerts:');
  const criticalAlerts = manager.getAlerts({ severity: AlertSeverity.CRITICAL });
  console.log(`   Critical alerts: ${criticalAlerts.length}`);

  const newAlerts = manager.getAlerts({ status: 'new' });
  console.log(`   New alerts: ${newAlerts.length}`);

  // Stats
  console.log('\n8. Statistics:');
  const stats = manager.getStats();
  console.log(`   Packets Processed: ${stats.packetsProcessed}`);
  console.log(`   Signatures Matched: ${stats.signaturesMatched}`);
  console.log(`   Alerts Generated: ${stats.alertsGenerated}`);
  console.log(`   Alerts Acknowledged: ${stats.alertsAcknowledged}`);
  console.log(`   Alerts Resolved: ${stats.alertsResolved}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new IDSManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent IDS Module');
  console.log('Usage: node agent-ids.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
