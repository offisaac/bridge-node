/**
 * Agent Alerting 2 Module
 *
 * Provides alert management with rules, channels, and escalation.
 * Usage: node agent-alerting-2.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   trigger <alert>       Trigger an alert
 *   status                 Show alerting stats
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname + '/data';
const ALERT_DB = DATA_DIR + '/alerting-2.json';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON(file, defaultVal = {}) {
  ensureDataDir();
  if (!fs.existsSync(file)) {
    return defaultVal;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return defaultVal;
  }
}

function saveJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/**
 * Alert Severity Levels
 */
const AlertSeverity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info'
};

const SeverityPriority = {
  [AlertSeverity.CRITICAL]: 5,
  [AlertSeverity.HIGH]: 4,
  [AlertSeverity.MEDIUM]: 3,
  [AlertSeverity.LOW]: 2,
  [AlertSeverity.INFO]: 1
};

/**
 * Alert Status
 */
const AlertStatus = {
  TRIGGERED: 'triggered',
  ACKNOWLEDGED: 'acknowledged',
  RESOLVED: 'resolved',
  SUPPRESSED: 'suppressed'
};

/**
 * Alert Channel
 */
class AlertChannel {
  constructor(config) {
    this.name = config.name;
    this.type = config.type;
    this.config = config;
    this.enabled = config.enabled !== false;
  }

  async send(alert) {
    if (!this.enabled) {
      return { success: false, reason: 'Channel disabled' };
    }

    try {
      return await this._send(alert);
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async _send(alert) {
    // Override in subclasses
    return { success: true };
  }
}

class EmailChannel extends AlertChannel {
  async _send(alert) {
    console.log(`   [Email] Sending to: ${this.config.recipients.join(', ')}`);
    console.log(`   [Email] Subject: ${alert.title}`);
    return { success: true, channel: 'email' };
  }
}

class SlackChannel extends AlertChannel {
  async _send(alert) {
    console.log(`   [Slack] Sending to: ${this.config.channel}`);
    console.log(`   [Slack] Message: ${alert.message}`);
    return { success: true, channel: 'slack' };
  }
}

class WebhookChannel extends AlertChannel {
  async _send(alert) {
    console.log(`   [Webhook] POST to: ${this.config.url}`);
    return { success: true, channel: 'webhook' };
  }
}

class ConsoleChannel extends AlertChannel {
  async _send(alert) {
    const icon = alert.severity === AlertSeverity.CRITICAL ? '🔴' :
                 alert.severity === AlertSeverity.HIGH ? '🟠' :
                 alert.severity === AlertSeverity.MEDIUM ? '🟡' : '🔵';
    console.log(`   ${icon} [${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`);
    return { success: true, channel: 'console' };
  }
}

/**
 * Alert Rule
 */
class AlertRule {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.condition = config.condition;
    this.severity = config.severity || AlertSeverity.MEDIUM;
    this.channels = config.channels || [];
    this.enabled = config.enabled !== false;
    this.threshold = config.threshold || 1;
    this.cooldown = config.cooldown || 60000; // 1 minute
    this.lastTriggered = null;
  }

  evaluate(context) {
    if (!this.enabled) {
      return false;
    }

    const result = this.condition(context);

    if (result) {
      const now = Date.now();
      if (this.lastTriggered && (now - this.lastTriggered) < this.cooldown) {
        return false; // In cooldown
      }
      this.lastTriggered = now;
    }

    return result;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      severity: this.severity,
      channels: this.channels,
      enabled: this.enabled,
      threshold: this.threshold,
      cooldown: this.cooldown
    };
  }
}

/**
 * Alert
 */
class Alert {
  constructor(config) {
    this.id = config.id || `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.title = config.title;
    this.message = config.message;
    this.severity = config.severity || AlertSeverity.MEDIUM;
    this.source = config.source || 'system';
    this.ruleId = config.ruleId;
    this.context = config.context || {};
    this.status = AlertStatus.TRIGGERED;
    this.triggeredAt = Date.now();
    this.acknowledgedAt = null;
    this.resolvedAt = null;
    this.acknowledgedBy = null;
    this.resolvedBy = null;
    this.notifications = [];
  }

  acknowledge(user) {
    this.status = AlertStatus.ACKNOWLEDGED;
    this.acknowledgedAt = Date.now();
    this.acknowledgedBy = user;
  }

  resolve(user) {
    this.status = AlertStatus.RESOLVED;
    this.resolvedAt = Date.now();
    this.resolvedBy = user;
  }

  suppress() {
    this.status = AlertStatus.SUPPRESSED;
  }

  addNotification(channel, result) {
    this.notifications.push({
      channel,
      result,
      sentAt: Date.now()
    });
  }

  toJSON() {
    return {
      id: this.title,
      message: this.message,
      severity: this.severity,
      source: this.source,
      ruleId: this.ruleId,
      status: this.status,
      triggeredAt: this.triggeredAt,
      acknowledgedAt: this.acknowledgedAt,
      resolvedAt: this.resolvedAt,
      acknowledgedBy: this.acknowledgedBy,
      resolvedBy: this.resolvedBy,
      notifications: this.notifications.length
    };
  }
}

/**
 * Escalation Policy
 */
class EscalationPolicy {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.steps = config.steps || [];
    this.currentStep = 0;
  }

  getNextStep() {
    if (this.currentStep >= this.steps.length) {
      return null;
    }
    return this.steps[this.currentStep];
  }

  advance() {
    this.currentStep++;
  }

  reset() {
    this.currentStep = 0;
  }
}

/**
 * Alert Manager
 */
class AlertManager {
  constructor() {
    this.channels = new Map();
    this.rules = new Map();
    this.alerts = new Map();
    this.escalationPolicies = new Map();
    this.stats = {
      triggered: 0,
      acknowledged: 0,
      resolved: 0,
      notified: 0,
      errors: 0
    };

    // Add default console channel
    this.addChannel(new ConsoleChannel({ name: 'console', type: 'console' }));
  }

  addChannel(channel) {
    this.channels.set(channel.name, channel);
  }

  removeChannel(name) {
    return this.channels.delete(name);
  }

  getChannel(name) {
    return this.channels.get(name);
  }

  addRule(rule) {
    this.rules.set(rule.id, rule);
  }

  removeRule(id) {
    return this.rules.delete(id);
  }

  getRule(id) {
    return this.rules.get(id);
  }

  listRules() {
    return Array.from(this.rules.values()).map(r => r.toJSON());
  }

  async createAlert(config) {
    const alert = new Alert(config);
    this.alerts.set(alert.id, alert);
    this.stats.triggered++;

    // Send notifications
    for (const channelName of config.channels || ['console']) {
      const channel = this.channels.get(channelName);
      if (channel) {
        const result = await channel.send(alert);
        alert.addNotification(channelName, result);
        if (result.success) {
          this.stats.notified++;
        } else {
          this.stats.errors++;
        }
      }
    }

    return alert;
  }

  async triggerRule(ruleId, context) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    if (rule.evaluate(context)) {
      return this.createAlert({
        title: rule.name,
        message: `Alert rule "${rule.name}" triggered`,
        severity: rule.severity,
        source: 'rule',
        ruleId: rule.id,
        context,
        channels: rule.channels
      });
    }

    return null;
  }

  async acknowledgeAlert(alertId, user) {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.acknowledge(user);
      this.stats.acknowledged++;
    }
    return alert;
  }

  async resolveAlert(alertId, user) {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolve(user);
      this.stats.resolved++;
    }
    return alert;
  }

  getAlert(alertId) {
    return this.alerts.get(alertId);
  }

  listAlerts(status = null) {
    const all = Array.from(this.alerts.values());
    if (status) {
      return all.filter(a => a.status === status);
    }
    return all;
  }

  addEscalationPolicy(policy) {
    this.escalationPolicies.set(policy.id, policy);
  }

  getStats() {
    return {
      ...this.stats,
      activeAlerts: this.alerts.size,
      rules: this.rules.size,
      channels: this.channels.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Alerting 2 Demo\n');

  const manager = new AlertManager();

  // Setup channels
  console.log('1. Alert Channels:');
  manager.addChannel(new EmailChannel({
    name: 'email',
    type: 'email',
    recipients: ['admin@example.com', 'oncall@example.com']
  }));
  manager.addChannel(new SlackChannel({
    name: 'slack',
    type: 'slack',
    channel: '#alerts'
  }));
  console.log(`   Added: ${Array.from(manager.channels.keys()).join(', ')}`);

  // Setup rules
  console.log('\n2. Alert Rules:');

  const highCpuRule = new AlertRule({
    id: 'high-cpu',
    name: 'High CPU Usage',
    severity: AlertSeverity.HIGH,
    channels: ['console', 'slack'],
    condition: (ctx) => ctx.cpu > 80,
    cooldown: 30000
  });
  manager.addRule(highCpuRule);

  const criticalMemoryRule = new AlertRule({
    id: 'critical-memory',
    name: 'Critical Memory',
    severity: AlertSeverity.CRITICAL,
    channels: ['console', 'email', 'slack'],
    condition: (ctx) => ctx.memory > 95,
    cooldown: 60000
  });
  manager.addRule(criticalMemoryRule);

  const diskFullRule = new AlertRule({
    id: 'disk-full',
    name: 'Disk Full',
    severity: AlertSeverity.HIGH,
    channels: ['console', 'email'],
    condition: (ctx) => ctx.disk > 90,
    cooldown: 300000
  });
  manager.addRule(diskFullRule);

  console.log(`   Added ${manager.rules.size} rules`);

  // Trigger alerts
  console.log('\n3. Triggering Alerts:');

  const alert1 = await manager.createAlert({
    title: 'Test Critical Alert',
    message: 'This is a critical test alert',
    severity: AlertSeverity.CRITICAL,
    source: 'manual',
    channels: ['console', 'slack']
  });
  console.log(`   Created: ${alert1.id.substring(0, 30)}...`);

  // Evaluate rules
  console.log('\n4. Rule Evaluation:');

  await manager.triggerRule('high-cpu', { cpu: 85, memory: 60, disk: 40 });
  await manager.triggerRule('critical-memory', { cpu: 50, memory: 96, disk: 30 });

  // Acknowledge
  console.log('\n5. Alert Lifecycle:');
  const alerts = manager.listAlerts();
  if (alerts.length > 0) {
    const firstAlert = alerts[0];
    console.log(`   Status before: ${firstAlert.status}`);
    await manager.acknowledgeAlert(firstAlert.id, 'admin');
    console.log(`   Status after ack: ${firstAlert.status}`);
    await manager.resolveAlert(firstAlert.id, 'admin');
    console.log(`   Status after resolve: ${firstAlert.status}`);
  }

  // List alerts
  console.log('\n6. Active Alerts:');
  const activeAlerts = manager.listAlerts(AlertStatus.TRIGGERED);
  console.log(`   Triggered: ${activeAlerts.length}`);

  const acknowledgedAlerts = manager.listAlerts(AlertStatus.ACKNOWLEDGED);
  console.log(`   Acknowledged: ${acknowledgedAlerts.length}`);

  const resolvedAlerts = manager.listAlerts(AlertStatus.RESOLVED);
  console.log(`   Resolved: ${resolvedAlerts.length}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Triggered: ${stats.triggered}`);
  console.log(`   Acknowledged: ${stats.acknowledged}`);
  console.log(`   Resolved: ${stats.resolved}`);
  console.log(`   Notifications sent: ${stats.notified}`);
  console.log(`   Errors: ${stats.errors}`);

  // Escalation
  console.log('\n8. Escalation Policy:');
  const policy = new EscalationPolicy({
    id: 'oncall',
    name: 'On-Call Escalation',
    steps: [
      { delay: 0, channel: 'slack', user: 'oncall-1' },
      { delay: 300, channel: 'slack', user: 'oncall-2' },
      { delay: 600, channel: 'email', user: 'manager' }
    ]
  });
  manager.addEscalationPolicy(policy);

  let step = policy.getNextStep();
  console.log(`   Step 1: ${step?.channel} -> ${step?.user}`);
  policy.advance();
  step = policy.getNextStep();
  console.log(`   Step 2: ${step?.channel} -> ${step?.user}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'trigger') {
  const manager = new AlertManager();
  const alertName = args[1] || 'test-alert';
  manager.createAlert({
    title: alertName,
    message: 'Triggered via CLI',
    severity: AlertSeverity.INFO,
    channels: ['console']
  }).then(a => console.log(`Alert triggered: ${a.id}`));
} else if (cmd === 'status') {
  const manager = new AlertManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Alerting 2 Module');
  console.log('Usage: node agent-alerting-2.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  trigger <name>     Trigger alert');
  console.log('  status             Show stats');
}
