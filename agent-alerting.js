/**
 * Agent Alerting System
 * Manages alerts and notifications for agent events
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentAlertingSystem {
  constructor(options = {}) {
    this.alerts = new Map();
    this.alertRules = new Map();
    this.channels = new Map();
    this.escalationPolicies = new Map();
    this.alertHistories = new Map();

    this.config = {
      maxAlerts: options.maxAlerts || 10000,
      alertTtl: options.alertTtl || 86400000, // 24 hours
      cooldownPeriod: options.cooldownPeriod || 300000, // 5 minutes
      maxEscalations: options.maxEscalations || 5
    };

    // Statistics
    this.stats = {
      totalAlerts: 0,
      activeAlerts: 0,
      resolvedAlerts: 0,
      alertsBySeverity: { critical: 0, high: 0, medium: 0, low: 0 },
      lastAlert: null
    };
  }

  createChannel(channelConfig) {
    const { id, name, type, config = {} } = channelConfig;

    const channel = {
      id: id || `channel-${Date.now()}`,
      name,
      type, // email, slack, webhook, sms, pagerduty
      config,
      enabled: true,
      createdAt: new Date().toISOString(),
      alertsSent: 0
    };

    this.channels.set(channel.id, channel);
    console.log(`Alert channel created: ${channel.id} (${name} - ${type})`);
    return channel;
  }

  deleteChannel(channelId) {
    if (!this.channels.has(channelId)) {
      throw new Error(`Channel not found: ${channelId}`);
    }

    this.channels.delete(channelId);
    console.log(`Channel deleted: ${channelId}`);
    return { success: true, channelId };
  }

  createAlertRule(ruleConfig) {
    const {
      id,
      name,
      condition,
      threshold,
      severity = 'medium',
      channels = [],
      cooldown = null,
      enabled = true
    } = ruleConfig;

    const rule = {
      id: id || `rule-${Date.now()}`,
      name,
      condition,
      threshold,
      severity,
      channels,
      cooldown: cooldown || this.config.cooldownPeriod,
      enabled,
      lastTriggered: null,
      triggerCount: 0,
      createdAt: new Date().toISOString()
    };

    this.alertRules.set(rule.id, rule);
    console.log(`Alert rule created: ${rule.id} (${name})`);
    return rule;
  }

  deleteAlertRule(ruleId) {
    if (!this.alertRules.has(ruleId)) {
      throw new Error(`Alert rule not found: ${ruleId}`);
    }

    this.alertRules.delete(ruleId);
    console.log(`Alert rule deleted: ${ruleId}`);
    return { success: true, ruleId };
  }

  createEscalationPolicy(policyConfig) {
    const { name, levels = [] } = policyConfig;

    const policy = {
      id: `policy-${Date.now()}`,
      name,
      levels: levels.map((l, i) => ({
        order: i + 1,
        delay: l.delay || (i + 1) * 300000, // 5 minutes per level
        channels: l.channels || [],
        notify: l.notify || []
      })),
      createdAt: new Date().toISOString()
    };

    this.escalationPolicies.set(policy.id, policy);
    console.log(`Escalation policy created: ${policy.id} (${name})`);
    return policy;
  }

  triggerAlert(alertConfig) {
    const {
      title,
      message,
      severity = 'medium',
      source,
      ruleId = null,
      metadata = {},
      channels = null
    } = alertConfig;

    // Check cooldown for rule
    if (ruleId) {
      const rule = this.alertRules.get(ruleId);
      if (rule && rule.lastTriggered) {
        const timeSinceLastTrigger = Date.now() - new Date(rule.lastTriggered).getTime();
        if (timeSinceLastTrigger < rule.cooldown) {
          console.log(`Alert suppressed due to cooldown: ${title}`);
          return null;
        }
      }
    }

    const alert = {
      id: `alert-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      title,
      message,
      severity,
      source,
      ruleId,
      status: 'triggered',
      metadata,
      channels: channels || this._getDefaultChannels(severity),
      createdAt: new Date().toISOString(),
      acknowledgedAt: null,
      acknowledgedBy: null,
      resolvedAt: null,
      resolvedBy: null,
      escalationLevel: 0,
      notifications: []
    };

    this.alerts.set(alert.id, alert);

    // Update statistics
    this.stats.totalAlerts++;
    this.stats.activeAlerts++;
    this.stats.alertsBySeverity[severity]++;
    this.stats.lastAlert = alert.id;

    // Update rule
    if (ruleId) {
      const rule = this.alertRules.get(ruleId);
      if (rule) {
        rule.lastTriggered = new Date().toISOString();
        rule.triggerCount++;
      }
    }

    // Send notifications
    this._sendNotifications(alert);

    // Add to history
    this._addToHistory(alert);

    console.log(`Alert triggered: ${alert.id} (${severity}) - ${title}`);
    return alert;
  }

  _getDefaultChannels(severity) {
    const defaultChannels = {
      critical: ['email', 'slack', 'sms'],
      high: ['email', 'slack'],
      medium: ['slack'],
      low: []
    };
    return defaultChannels[severity] || [];
  }

  _sendNotifications(alert) {
    for (const channelType of alert.channels) {
      const channel = Array.from(this.channels.values()).find(c => c.type === channelType);
      if (channel && channel.enabled) {
        const notification = {
          alertId: alert.id,
          channelId: channel.id,
          channelType,
          sentAt: new Date().toISOString(),
          status: 'sent'
        };
        alert.notifications.push(notification);
        channel.alertsSent++;
      }
    }
  }

  _addToHistory(alert) {
    const historyKey = alert.source || 'global';
    if (!this.alertHistories.has(historyKey)) {
      this.alertHistories.set(historyKey, []);
    }

    const history = this.alertHistories.get(historyKey);
    history.push({
      alertId: alert.id,
      title: alert.title,
      severity: alert.severity,
      status: alert.status,
      createdAt: alert.createdAt
    });

    // Keep only last 1000 entries
    if (history.length > 1000) {
      history.shift();
    }
  }

  acknowledgeAlert(alertId, acknowledgedBy) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.status = 'acknowledged';
    alert.acknowledgedAt = new Date().toISOString();
    alert.acknowledgedBy = acknowledgedBy;

    console.log(`Alert acknowledged: ${alertId} by ${acknowledgedBy}`);
    return alert;
  }

  resolveAlert(alertId, resolvedBy, resolution = null) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.status = 'resolved';
    alert.resolvedAt = new Date().toISOString();
    alert.resolvedBy = resolvedBy;
    if (resolution) {
      alert.resolution = resolution;
    }

    this.stats.activeAlerts--;
    this.stats.resolvedAlerts++;

    console.log(`Alert resolved: ${alertId} by ${resolvedBy}`);
    return alert;
  }

  escalateAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    if (alert.escalationLevel >= this.config.maxEscalations) {
      console.log(`Max escalation level reached for alert: ${alertId}`);
      return alert;
    }

    alert.escalationLevel++;
    alert.lastEscalatedAt = new Date().toISOString();

    // Send notifications to next level
    const policy = Array.from(this.escalationPolicies.values())[0];
    if (policy && policy.levels[alert.escalationLevel]) {
      const level = policy.levels[alert.escalationLevel];
      alert.channels = [...new Set([...alert.channels, ...level.channels])];
      this._sendNotifications(alert);
    }

    console.log(`Alert escalated: ${alertId} to level ${alert.escalationLevel}`);
    return alert;
  }

  getAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }
    return alert;
  }

  listAlerts(filters = {}) {
    let alerts = Array.from(this.alerts.values());

    if (filters.status) {
      alerts = alerts.filter(a => a.status === filters.status);
    }

    if (filters.severity) {
      alerts = alerts.filter(a => a.severity === filters.severity);
    }

    if (filters.source) {
      alerts = alerts.filter(a => a.source === filters.source);
    }

    if (filters.ruleId) {
      alerts = alerts.filter(a => a.ruleId === filters.ruleId);
    }

    // Sort by creation time descending
    alerts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    if (filters.limit) {
      alerts = alerts.slice(0, filters.limit);
    }

    return alerts;
  }

  listActiveAlerts() {
    return this.listAlerts({ status: 'triggered' });
  }

  getAlertStats() {
    return {
      total: this.stats.totalAlerts,
      active: this.stats.activeAlerts,
      resolved: this.stats.resolvedAlerts,
      bySeverity: this.stats.alertsBySeverity,
      lastAlert: this.stats.lastAlert,
      channels: Array.from(this.channels.values()).map(c => ({
        id: c.id,
        name: c.name,
        type: c.type,
        alertsSent: c.alertsSent
      })),
      rules: Array.from(this.alertRules.values()).map(r => ({
        id: r.id,
        name: r.name,
        triggerCount: r.triggerCount,
        enabled: r.enabled
      }))
    };
  }

  checkRules(context) {
    const triggeredAlerts = [];

    for (const rule of this.alertRules.values()) {
      if (!rule.enabled) continue;

      let conditionMet = false;

      switch (rule.condition) {
        case 'error_rate_above':
          const errorRate = context.errorRate || 0;
          conditionMet = errorRate > rule.threshold;
          break;

        case 'response_time_above':
          const responseTime = context.responseTime || 0;
          conditionMet = responseTime > rule.threshold;
          break;

        case 'cpu_above':
          const cpu = context.cpu || 0;
          conditionMet = cpu > rule.threshold;
          break;

        case 'memory_above':
          const memory = context.memory || 0;
          conditionMet = memory > rule.threshold;
          break;

        case 'agent_down':
          const agentDown = context.agentsDown || [];
          conditionMet = agentDown.length > 0;
          break;

        case 'threshold_exceeded':
          const value = context[rule.metric] || 0;
          conditionMet = value > rule.threshold;
          break;
      }

      if (conditionMet) {
        const alert = this.triggerAlert({
          title: `Alert: ${rule.name}`,
          message: `Rule ${rule.name} triggered - threshold: ${rule.threshold}`,
          severity: rule.severity,
          source: context.source || 'system',
          ruleId: rule.id,
          channels: rule.channels
        });
        if (alert) {
          triggeredAlerts.push(alert);
        }
      }
    }

    return triggeredAlerts;
  }

  listRules() {
    return Array.from(this.alertRules.values()).map(r => ({
      id: r.id,
      name: r.name,
      condition: r.condition,
      threshold: r.threshold,
      severity: r.severity,
      enabled: r.enabled,
      triggerCount: r.triggerCount,
      lastTriggered: r.lastTriggered
    }));
  }

  listChannels() {
    return Array.from(this.channels.values()).map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      enabled: c.enabled,
      alertsSent: c.alertsSent
    }));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const alerting = new AgentAlertingSystem({
    maxAlerts: 1000,
    alertTtl: 86400000,
    cooldownPeriod: 60000
  });

  switch (command) {
    case 'create-channel':
      const channelName = args[1] || 'slack-alerts';
      const channelType = args[2] || 'slack';
      const channel = alerting.createChannel({
        name: channelName,
        type: channelType,
        config: { webhookUrl: 'https://hooks.slack.com/xxx' }
      });
      console.log('Channel created:', channel.id);
      break;

    case 'create-rule':
      const ruleName = args[1] || 'high-error-rate';
      const rule = alerting.createAlertRule({
        name: ruleName,
        condition: 'error_rate_above',
        threshold: 10,
        severity: 'critical',
        channels: ['slack', 'email']
      });
      console.log('Rule created:', rule.id);
      break;

    case 'trigger':
      const alertTitle = args[1] || 'Test Alert';
      const alertSeverity = args[2] || 'medium';
      const alert = alerting.triggerAlert({
        title: alertTitle,
        message: 'This is a test alert',
        severity: alertSeverity,
        source: 'test-system'
      });
      console.log('Alert triggered:', alert?.id);
      break;

    case 'list-alerts':
      console.log('Alerts:', alerting.listAlerts({ limit: 10 }));
      break;

    case 'stats':
      console.log('Stats:', alerting.getAlertStats());
      break;

    case 'demo':
      console.log('=== Agent Alerting System Demo ===\n');

      // Create notification channels
      console.log('1. Creating notification channels...');
      const slackChannel = alerting.createChannel({
        name: 'Slack Alerts',
        type: 'slack',
        config: { webhookUrl: 'https://hooks.slack.com/services/xxx' }
      });
      console.log('   Created:', slackChannel.name);

      const emailChannel = alerting.createChannel({
        name: 'Email Alerts',
        type: 'email',
        config: { smtp: 'smtp.company.com', from: 'alerts@company.com' }
      });
      console.log('   Created:', emailChannel.name);

      const pagerdutyChannel = alerting.createChannel({
        name: 'PagerDuty',
        type: 'pagerduty',
        config: { apiKey: 'xxx', serviceId: 'xxx' }
      });
      console.log('   Created:', pagerdutyChannel.name);

      // Create alert rules
      console.log('\n2. Creating alert rules...');
      const errorRule = alerting.createAlertRule({
        name: 'High Error Rate',
        condition: 'error_rate_above',
        threshold: 10,
        severity: 'critical',
        channels: ['slack', 'email', 'pagerduty']
      });
      console.log('   Created:', errorRule.name);

      const memoryRule = alerting.createAlertRule({
        name: 'High Memory Usage',
        condition: 'memory_above',
        threshold: 90,
        severity: 'high',
        channels: ['slack', 'email']
      });
      console.log('   Created:', memoryRule.name);

      const responseRule = alerting.createAlertRule({
        name: 'Slow Response Time',
        condition: 'response_time_above',
        threshold: 5000,
        severity: 'medium',
        channels: ['slack']
      });
      console.log('   Created:', responseRule.name);

      // Create escalation policy
      console.log('\n3. Creating escalation policy...');
      const escalationPolicy = alerting.createEscalationPolicy({
        name: 'Standard Escalation',
        levels: [
          { delay: 300, channels: ['slack'], notify: ['oncall'] },
          { delay: 600, channels: ['email'], notify: ['team-lead'] },
          { delay: 900, channels: ['pagerduty'], notify: ['manager'] }
        ]
      });
      console.log('   Created:', escalationPolicy.name);

      // Trigger alerts
      console.log('\n4. Triggering alerts...');
      const alert1 = alerting.triggerAlert({
        title: 'Database Connection Failed',
        message: 'Unable to connect to primary database',
        severity: 'critical',
        source: 'api-gateway',
        metadata: { endpoint: 'db-primary', error: 'ECONNREFUSED' }
      });
      console.log('   Triggered:', alert1?.title);

      const alert2 = alerting.triggerAlert({
        title: 'High Memory Usage',
        message: 'Memory usage exceeded 90%',
        severity: 'high',
        source: 'data-processor',
        metadata: { memory: '92%' }
      });
      console.log('   Triggered:', alert2?.title);

      const alert3 = alerting.triggerAlert({
        title: 'Slow Response Time',
        message: 'API response time exceeded 5s',
        severity: 'medium',
        source: 'api-gateway',
        metadata: { avgResponseTime: '6500ms' }
      });
      console.log('   Triggered:', alert3?.title);

      // List active alerts
      console.log('\n5. Active alerts:');
      const activeAlerts = alerting.listActiveAlerts();
      activeAlerts.forEach(a => {
        console.log(`   [${a.severity}] ${a.title} - ${a.status}`);
      });

      // Acknowledge an alert
      console.log('\n6. Acknowledging alert...');
      if (activeAlerts[0]) {
        const ackAlert = alerting.acknowledgeAlert(activeAlerts[0].id, 'admin');
        console.log('   Acknowledged:', ackAlert.id);
      }

      // Resolve an alert
      console.log('\n7. Resolving alert...');
      const resolved = alerting.resolveAlert(
        activeAlerts[activeAlerts.length - 1]?.id,
        'admin',
        'Issue has been fixed'
      );
      console.log('   Resolved:', resolved?.id);

      // Check rules with context
      console.log('\n8. Checking rules...');
      const triggered = alerting.checkRules({
        errorRate: 15,
        memory: 85,
        responseTime: 2000,
        source: 'production'
      });
      console.log('   Rules triggered:', triggered.length);

      // Get statistics
      console.log('\n9. Alert Statistics:');
      const stats = alerting.getAlertStats();
      console.log('   Total:', stats.total);
      console.log('   Active:', stats.active);
      console.log('   Resolved:', stats.resolved);
      console.log('   By severity:', JSON.stringify(stats.bySeverity));

      // List channels
      console.log('\n10. Notification Channels:');
      const channels = alerting.listChannels();
      channels.forEach(c => {
        console.log(`    ${c.name}: ${c.alertsSent} alerts sent`);
      });

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-alerting.js <command> [args]');
      console.log('\nCommands:');
      console.log('  create-channel [name] [type]  Create notification channel');
      console.log('  create-rule [name]            Create alert rule');
      console.log('  trigger [title] [severity]     Trigger an alert');
      console.log('  list-alerts                    List alerts');
      console.log('  stats                         Get statistics');
      console.log('  demo                          Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentAlertingSystem;
