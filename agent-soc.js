/**
 * Agent SOC - Security Operations Center Agent
 *
 * Manages security operations, threat monitoring, and incident response coordination.
 *
 * Usage: node agent-soc.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   alerts     - List security alerts
 *   threats    - List active threats
 */

class SecurityAlert {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.title = config.title;
    this.severity = config.severity; // critical, high, medium, low
    this.source = config.source; // siem, ids, firewall, endpoint
    this.status = config.status || 'active'; // active, investigating, resolved
    this.description = config.description;
    this.indicators = config.indicators || [];
    this.createdAt = config.createdAt || new Date().toISOString();
  }
}

class ThreatIntelligence {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type; // malware, vulnerability, campaign, actor
    this.severity = config.severity;
    this.ttps = config.ttps || []; // MITRE ATT&CK techniques
    this.indicators = config.indicators || [];
    this.firstSeen = config.firstSeen || new Date().toISOString();
    this.lastSeen = config.lastSeen || new Date().toISOString();
  }
}

class SOCAgent {
  constructor() {
    this.alerts = new Map();
    this.threats = new Map();
    this.watchlists = new Map();
    this.incidents = [];
    this._initSampleData();
  }

  _initSampleData() {
    // Sample alerts
    const alerts = [
      { title: 'Brute Force Attack Detected', severity: 'high', source: 'siem', description: 'Multiple failed login attempts from IP 192.168.1.100', indicators: ['192.168.1.100', 'failed_login'] },
      { title: 'Malware Signature Match', severity: 'critical', source: 'endpoint', description: 'Trojan detected on workstation WS-042', indicators: ['WS-042', 'trojan.exe'] },
      { title: 'Suspicious Outbound Traffic', severity: 'medium', source: 'firewall', description: 'Large data transfer to unknown external IP', indicators: ['10.0.0.55', '45.33.22.11'] },
      { title: 'Privilege Escalation Attempt', severity: 'high', source: 'ids', description: 'User john.doe attempted to gain admin access', indicators: ['john.doe', 'admin'] },
      { title: 'Phishing Email Detected', severity: 'medium', source: 'siem', description: 'Email with malicious link detected', indicators: ['phishing@attacker.com', 'malicious.link'] },
      { title: 'SQL Injection Attempt', severity: 'critical', source: 'waf', description: 'SQL injection attack on web application', indicators: ['/api/users', 'OR 1=1'] },
      { title: 'Unusual Login Location', severity: 'low', source: 'siem', description: 'Login from new geographic location', indicators: ['user@example.com', 'Russia'] },
      { title: 'DDoS Attack Detected', severity: 'critical', source: 'firewall', description: 'Volumetric DDoS attack on API gateway', indicators: ['api.example.com', '10Gbps'] }
    ];

    alerts.forEach(a => {
      const alert = new SecurityAlert(a);
      this.alerts.set(alert.id, alert);
    });

    // Sample threat intelligence
    const threats = [
      { name: 'APT29 Campaign', type: 'campaign', severity: 'critical', ttps: ['T1087', 'T1005', 'T1560'], indicators: ['apt29 Infrastructure'] },
      { name: 'Ransomware LockBit', type: 'malware', severity: 'critical', ttps: ['T1486', 'T1490'], indicators: ['lockbit.exe'] },
      { name: 'CVE-2024-1234', type: 'vulnerability', severity: 'high', ttps: ['T1190'], indicators: ['CVE-2024-1234'] },
      { name: 'FIN7 Threat Actor', type: 'actor', severity: 'high', ttps: ['T1566', 'T1204'], indicators: ['FIN7 infrastructure'] },
      { name: 'Emotet Malware', type: 'malware', severity: 'high', ttps: ['T1566', 'T1105'], indicators: ['emotet.exe'] }
    ];

    threats.forEach(t => {
      const threat = new ThreatIntelligence(t);
      this.threats.set(threat.id, threat);
    });

    // Sample watchlists
    const watchlists = [
      { name: 'Critical Assets', description: 'Servers and databases containing sensitive data', entries: ['prod-db-1', 'api-gateway', 'user-service'] },
      { name: 'Blocked IPs', description: 'Known malicious IP addresses', entries: ['192.168.1.100', '45.33.22.11', '10.0.0.0/8'] },
      { name: 'Suspicious Users', description: 'Users flagged for monitoring', entries: ['john.doe', 'test-user'] }
    ];

    watchlists.forEach(w => {
      this.watchlists.set(w.name, w);
    });

    // Sample incidents
    this.incidents = [
      { id: 'INC-001', title: 'Ransomware Outbreak', severity: 'critical', status: 'contained', createdAt: '2026-02-15T10:00:00Z' },
      { id: 'INC-002', title: 'Data Exfiltration Attempt', severity: 'high', status: 'investigating', createdAt: '2026-02-16T14:30:00Z' },
      { id: 'INC-003', title: 'Compromised Credentials', severity: 'medium', status: 'resolved', createdAt: '2026-02-14T09:15:00Z' }
    ];
  }

  // Get alerts
  getAlerts(filter = {}) {
    let alerts = Array.from(this.alerts.values());

    if (filter.severity) {
      alerts = alerts.filter(a => a.severity === filter.severity);
    }
    if (filter.source) {
      alerts = alerts.filter(a => a.source === filter.source);
    }
    if (filter.status) {
      alerts = alerts.filter(a => a.status === filter.status);
    }

    return alerts;
  }

  // Get threats
  getThreats(filter = {}) {
    let threats = Array.from(this.threats.values());

    if (filter.type) {
      threats = threats.filter(t => t.type === filter.type);
    }
    if (filter.severity) {
      threats = threats.filter(t => t.severity === filter.severity);
    }

    return threats;
  }

  // Create alert
  createAlert(title, severity, source, description, indicators = []) {
    const alert = new SecurityAlert({ title, severity, source, description, indicators });
    this.alerts.set(alert.id, alert);
    return alert;
  }

  // Update alert status
  updateAlertStatus(alertId, status) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert ${alertId} not found`);
    }
    alert.status = status;
    return alert;
  }

  // Get watchlist
  getWatchlist(name) {
    return this.watchlists.get(name) || null;
  }

  // Get all watchlists
  getWatchlists() {
    return Array.from(this.watchlists.values());
  }

  // Match indicators against threats
  matchIndicators(indicators) {
    const matched = [];

    this.threats.forEach(threat => {
      const matches = threat.indicators.filter(i =>
        indicators.some(ind => ind.toLowerCase().includes(i.toLowerCase()))
      );

      if (matches.length > 0) {
        matched.push({
          threat: threat.name,
          type: threat.type,
          severity: threat.severity,
          matchedIndicators: matches
        });
      }
    });

    return matched;
  }

  // Get incidents
  getIncidents(filter = {}) {
    let incidents = this.incidents;

    if (filter.status) {
      incidents = incidents.filter(i => i.status === filter.status);
    }
    if (filter.severity) {
      incidents = incidents.filter(i => i.severity === filter.severity);
    }

    return incidents;
  }

  // Get statistics
  getStats() {
    const alerts = Array.from(this.alerts.values());
    const threats = Array.from(this.threats.values());

    return {
      totalAlerts: alerts.length,
      activeAlerts: alerts.filter(a => a.status === 'active').length,
      bySeverity: {
        critical: alerts.filter(a => a.severity === 'critical').length,
        high: alerts.filter(a => a.severity === 'high').length,
        medium: alerts.filter(a => a.severity === 'medium').length,
        low: alerts.filter(a => a.severity === 'low').length
      },
      bySource: {
        siem: alerts.filter(a => a.source === 'siem').length,
        ids: alerts.filter(a => a.source === 'ids').length,
        firewall: alerts.filter(a => a.source === 'firewall').length,
        endpoint: alerts.filter(a => a.source === 'endpoint').length
      },
      totalThreats: threats.length,
      totalWatchlists: this.watchlists.size,
      activeIncidents: this.incidents.filter(i => i.status !== 'resolved').length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const soc = new SOCAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent SOC Demo\n');

    // 1. List alerts
    console.log('1. Security Alerts:');
    const alerts = soc.getAlerts();
    console.log(`   Total: ${alerts.length}`);
    alerts.slice(0, 5).forEach(a => {
      console.log(`   - ${a.title}: [${a.severity}] ${a.source}`);
    });

    // 2. Alerts by severity
    console.log('\n2. Alerts by Severity:');
    const stats = soc.getStats();
    console.log(`   Critical: ${stats.bySeverity.critical}`);
    console.log(`   High: ${stats.bySeverity.high}`);
    console.log(`   Medium: ${stats.bySeverity.medium}`);
    console.log(`   Low: ${stats.bySeverity.low}`);

    // 3. Alerts by source
    console.log('\n3. Alerts by Source:');
    Object.entries(stats.bySource).forEach(([source, count]) => {
      console.log(`   ${source}: ${count}`);
    });

    // 4. Active alerts
    console.log('\n4. Active Alerts:');
    const activeAlerts = soc.getAlerts({ status: 'active' });
    console.log(`   Total: ${activeAlerts.length}`);
    activeAlerts.slice(0, 3).forEach(a => {
      console.log(`   - ${a.title}: ${a.description.substring(0, 50)}...`);
    });

    // 5. Create new alert
    console.log('\n5. Create Alert:');
    const newAlert = soc.createAlert('New SQL Injection Attempt', 'critical', 'waf', 'SQL injection detected in login form', ['/login', "' OR '1'='1"]);
    console.log(`   Created: ${newAlert.title} [${newAlert.severity}]`);

    // 6. Update alert
    console.log('\n6. Update Alert:');
    const alertToUpdate = alerts[0];
    const updated = soc.updateAlertStatus(alertToUpdate.id, 'investigating');
    console.log(`   Updated: ${updated.title} -> ${updated.status}`);

    // 7. Match indicators
    console.log('\n7. Threat Intelligence Match:');
    const matches = soc.matchIndicators(['trojan.exe', 'lockbit.exe']);
    console.log(`   Matches found: ${matches.length}`);
    matches.forEach(m => {
      console.log(`   - ${m.threat}: ${m.matchedIndicators.join(', ')}`);
    });

    // 8. Threats
    console.log('\n8. Threat Intelligence:');
    const threats = soc.getThreats();
    threats.forEach(t => {
      console.log(`   - ${t.name}: ${t.type} [${t.severity}]`);
    });

    // 9. Incidents
    console.log('\n9. Security Incidents:');
    const incidents = soc.getIncidents();
    incidents.forEach(i => {
      console.log(`   - ${i.id}: ${i.title} [${i.status}]`);
    });

    // 10. Statistics
    console.log('\n10. Get Statistics:');
    const finalStats = soc.getStats();
    console.log(`    Total alerts: ${finalStats.totalAlerts}`);
    console.log(`    Active: ${finalStats.activeAlerts}`);
    console.log(`    Threats: ${finalStats.totalThreats}`);
    console.log(`    Watchlists: ${finalStats.totalWatchlists}`);
    console.log(`    Active incidents: ${finalStats.activeIncidents}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'alerts':
    console.log('Security Alerts:');
    soc.getAlerts().forEach(a => {
      console.log(`  [${a.severity}] ${a.title}: ${a.status}`);
    });
    break;

  case 'threats':
    console.log('Threat Intelligence:');
    soc.getThreats().forEach(t => {
      console.log(`  ${t.name}: ${t.type} [${t.severity}]`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-soc.js [demo|alerts|threats]');
}
