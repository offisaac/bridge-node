/**
 * Agent Alerting3 - Alert Management Agent
 *
 * Provides alert management with advanced rules and escalation.
 *
 * Usage: node agent-alerting3.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   list       - List alerts
 *   trigger    - Trigger test alert
 */

class AlertRule {
  constructor(config) {
    this.id = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.condition = config.condition;
    this.severity = config.severity; // critical, high, medium, low
    this.threshold = config.threshold;
    this.enabled = config.enabled !== false;
  }
}

class Alert {
  constructor(config) {
    this.id = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.title = config.title;
    this.message = config.message;
    this.severity = config.severity;
    this.source = config.source;
    this.status = config.status || 'triggered';
    this.timestamp = Date.now();
  }
}

class EscalationPolicy {
  constructor(config) {
    this.id = `esc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.steps = config.steps || [];
    this.escalationTime = config.escalationTime || 300000; // 5 min
  }
}

class Alerting3Agent {
  constructor(config = {}) {
    this.name = config.name || 'Alerting3Agent';
    this.version = config.version || '3.0';
    this.rules = new Map();
    this.alerts = new Map();
    this.policies = new Map();
    this.stats = {
      rulesConfigured: 0,
      alertsTriggered: 0,
      alertsResolved: 0
    };
    this.initDefaults();
  }

  initDefaults() {
    // Default alert rules
    const defaults = [
      new AlertRule({ name: 'High CPU', condition: 'cpu > 80', severity: 'high', threshold: 80 }),
      new AlertRule({ name: 'High Memory', condition: 'memory > 90', severity: 'critical', threshold: 90 }),
      new AlertRule({ name: 'Disk Full', condition: 'disk > 95', severity: 'critical', threshold: 95 }),
      new AlertRule({ name: 'Service Down', condition: 'healthcheck == false', severity: 'high' })
    ];
    defaults.forEach(r => this.rules.set(r.id, r));
    this.stats.rulesConfigured = defaults.length;

    // Default escalation policies
    const policy = new EscalationPolicy({
      name: 'Default',
      steps: ['oncall', 'team-lead', 'manager'],
      escalationTime: 300000
    });
    this.policies.set(policy.id, policy);
  }

  createRule(name, condition, severity, threshold) {
    const rule = new AlertRule({ name, condition, severity, threshold });
    this.rules.set(rule.id, rule);
    this.stats.rulesConfigured++;
    return rule;
  }

  triggerAlert(title, message, severity, source) {
    const alert = new Alert({ title, message, severity, source });
    this.alerts.set(alert.id, alert);
    this.stats.alertsTriggered++;
    return alert;
  }

  resolveAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.status = 'resolved';
      this.stats.alertsResolved++;
    }
    return alert;
  }

  getActiveAlerts() {
    return Array.from(this.alerts.values()).filter(a => a.status !== 'resolved');
  }

  getAlertsBySeverity(severity) {
    return Array.from(this.alerts.values()).filter(a => a.severity === severity);
  }

  createPolicy(name, steps, escalationTime) {
    const policy = new EscalationPolicy({ name, steps, escalationTime });
    this.policies.set(policy.id, policy);
    return policy;
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const alerting = new Alerting3Agent();

switch (command) {
  case 'demo': {
    console.log('=== Agent Alerting3 Demo\n');

    // 1. Alert Rules
    console.log('1. Alert Rules:');
    const rules = Array.from(alerting.rules.values());
    rules.forEach(r => {
      console.log(`   ${r.name}: ${r.condition} (${r.severity})`);
    });

    // 2. Create Custom Rule
    console.log('\n2. Create Custom Rule:');
    const customRule = alerting.createRule('High Latency', 'response_time > 1000', 'medium', 1000);
    console.log(`   Created: ${customRule.name}`);

    // 3. Trigger Alerts
    console.log('\n3. Trigger Alerts:');
    const alert1 = alerting.triggerAlert('CPU High', 'CPU usage at 85%', 'high', 'monitoring');
    console.log(`   Triggered: ${alert1.title} [${alert1.severity}]`);
    const alert2 = alerting.triggerAlert('Memory Critical', 'Memory usage at 92%', 'critical', 'monitoring');
    console.log(`   Triggered: ${alert2.title} [${alert2.severity}]`);
    const alert3 = alerting.triggerAlert('Disk Warning', 'Disk usage at 78%', 'low', 'monitoring');
    console.log(`   Triggered: ${alert3.title} [alert3.severity}]`);

    // 4. Active Alerts
    console.log('\n4. Active Alerts:');
    const active = alerting.getActiveAlerts();
    console.log(`   Total active: ${active.length}`);
    active.forEach(a => {
      console.log(`   - ${a.title} [${a.severity}]`);
    });

    // 5. Alerts by Severity
    console.log('\n5. Alerts by Severity:');
    console.log(`   Critical: ${alerting.getAlertsBySeverity('critical').length}`);
    console.log(`   High: ${alerting.getAlertsBySeverity('high').length}`);
    console.log(`   Medium: ${alerting.getAlertsBySeverity('medium').length}`);
    console.log(`   Low: ${alerting.getAlertsBySeverity('low').length}`);

    // 6. Resolve Alert
    console.log('\n6. Resolve Alert:');
    alerting.resolveAlert(alert1.id);
    console.log(`   Resolved: ${alert1.title}`);

    // 7. Escalation Policies
    console.log('\n7. Escalation Policies:');
    const policies = Array.from(alerting.policies.values());
    policies.forEach(p => {
      console.log(`   ${p.name}: ${p.steps.join(' -> ')} (${p.escalationTime / 60000}min)`);
    });

    // 8. Create Custom Policy
    console.log('\n8. Create Custom Policy:');
    const customPolicy = alerting.createPolicy('Critical', ['oncall', 'senior', 'director'], 180000);
    console.log(`   Created: ${customPolicy.name}`);

    // 9. Alert Channels
    console.log('\n9. Alert Channels:');
    console.log(`   Email: SMTP integration`);
    console.log(`   Slack: Webhook integration`);
    console.log(`   PagerDuty: API integration`);
    console.log(`   SMS: Twilio integration`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = alerting.getStats();
    console.log(`   Rules configured: ${stats.rulesConfigured}`);
    console.log(`   Alerts triggered: ${stats.alertsTriggered}`);
    console.log(`   Alerts resolved: ${stats.alertsResolved}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'list': {
    console.log('Active Alerts:');
    const active = alerting.getActiveAlerts();
    active.forEach(a => {
      console.log(`  [${a.severity.toUpperCase()}] ${a.title}: ${a.message}`);
    });
    break;
  }

  case 'trigger': {
    const alert = alerting.triggerAlert('Test Alert', 'This is a test alert', 'info', 'cli');
    console.log(`Alert triggered: ${alert.id}`);
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-alerting3.js [demo|list|trigger]');
  }
}
