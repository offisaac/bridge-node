/**
 * Agent Fraud Module
 *
 * Provides fraud detection and prevention services.
 * Usage: node agent-fraud.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show fraud stats
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
 * Fraud Type
 */
const FraudType = {
  TRANSACTION: 'transaction',
  IDENTITY: 'identity',
  ACCOUNT: 'account',
  PAYMENT: 'payment',
  COLLUSION: 'collusion'
};

/**
 * Fraud Risk Level
 */
const FraudRiskLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Fraud Alert
 */
class FraudAlert {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.type = config.type;
    this.riskLevel = config.riskLevel || FraudRiskLevel.LOW;
    this.score = config.score || 0;
    this.description = config.description;
    this.indicators = config.indicators || [];
    this.status = 'open';
    this.createdAt = Date.now();
    this.resolvedAt = null;
    this.resolution = null;
    this.metadata = config.metadata || {};
  }

  resolve(resolution) {
    this.status = 'resolved';
    this.resolvedAt = Date.now();
    this.resolution = resolution;
  }

  escalate() {
    if (this.riskLevel === FraudRiskLevel.LOW) {
      this.riskLevel = FraudRiskLevel.MEDIUM;
    } else if (this.riskLevel === FraudRiskLevel.MEDIUM) {
      this.riskLevel = FraudRiskLevel.HIGH;
    } else if (this.riskLevel === FraudRiskLevel.HIGH) {
      this.riskLevel = FraudRiskLevel.CRITICAL;
    }
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      riskLevel: this.riskLevel,
      score: this.score,
      description: this.description,
      indicators: this.indicators,
      status: this.status,
      createdAt: this.createdAt,
      resolvedAt: this.resolvedAt,
      resolution: this.resolution
    };
  }
}

/**
 * Fraud Indicator
 */
class FraudIndicator {
  constructor(config) {
    this.name = config.name;
    this.weight = config.weight || 1.0;
    this.threshold = config.threshold || 0.5;
    this.category = config.category || 'behavior';
  }

  evaluate(value) {
    return {
      triggered: value >= this.threshold,
      value: value,
      weight: this.weight
    };
  }
}

/**
 * Fraud Rule
 */
class FraudRule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description;
    this.type = config.type;
    this.conditions = config.conditions || [];
    this.action = config.action || 'alert';
    this.enabled = config.enabled !== false;
  }

  evaluate(context) {
    for (const condition of this.conditions) {
      if (!condition(context)) {
        return { triggered: false };
      }
    }
    return { triggered: true };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      action: this.action,
      enabled: this.enabled
    };
  }
}

/**
 * Fraud Manager
 */
class FraudManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.alerts = new Map();
    this.rules = new Map();
    this.indicators = [];
    this.stats = {
      alertsCreated: 0,
      alertsResolved: 0,
      rulesTriggered: 0,
      transactionsScored: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._createDefaultRules();
  }

  _createDefaultRules() {
    // High velocity rule
    this.addRule(new FraudRule({
      id: 'rule-velocity',
      name: 'High Velocity Detection',
      description: 'Detects unusually high transaction velocity',
      type: FraudType.TRANSACTION,
      conditions: [
        (ctx) => ctx.transactionCount > 10,
        (ctx) => ctx.timeWindow < 300 // 5 minutes
      ],
      action: 'block'
    }));

    // Large transaction rule
    this.addRule(new FraudRule({
      id: 'rule-large',
      name: 'Large Transaction Detection',
      description: 'Flags transactions above threshold',
      type: FraudType.TRANSACTION,
      conditions: [
        (ctx) => ctx.amount > 10000
      ],
      action: 'alert'
    }));

    // New account rule
    this.addRule(new FraudRule({
      id: 'rule-new-account',
      name: 'New Account Detection',
      description: 'Flags activity from newly created accounts',
      type: FraudType.ACCOUNT,
      conditions: [
        (ctx) => ctx.accountAge < 86400000 // 24 hours
      ],
      action: 'review'
    }));
  }

  addRule(rule) {
    this.rules.set(rule.id, rule);
  }

  getRule(ruleId) {
    return this.rules.get(ruleId);
  }

  addIndicator(indicator) {
    this.indicators.push(indicator);
  }

  evaluateTransaction(transaction) {
    this.stats.transactionsScored++;
    const context = this._buildContext(transaction);
    let totalScore = 0;
    const triggeredRules = [];
    const triggeredIndicators = [];

    // Evaluate rules
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      const result = rule.evaluate(context);
      if (result.triggered) {
        triggeredRules.push(rule);
        this.stats.rulesTriggered++;
        totalScore += 10;
      }
    }

    // Evaluate indicators
    for (const indicator of this.indicators) {
      const value = context[indicator.name] || 0;
      const result = indicator.evaluate(value);
      if (result.triggered) {
        triggeredIndicators.push({ indicator: indicator.name, value });
        totalScore += result.weight * 10;
      }
    }

    // Determine risk level
    let riskLevel = FraudRiskLevel.LOW;
    if (totalScore >= 70) {
      riskLevel = FraudRiskLevel.CRITICAL;
    } else if (totalScore >= 50) {
      riskLevel = FraudRiskLevel.HIGH;
    } else if (totalScore >= 30) {
      riskLevel = FraudRiskLevel.MEDIUM;
    }

    return {
      transactionId: transaction.id,
      score: Math.min(totalScore, 100),
      riskLevel,
      triggeredRules: triggeredRules.map(r => r.name),
      triggeredIndicators,
      recommendation: this._getRecommendation(riskLevel, triggeredRules)
    };
  }

  _buildContext(transaction) {
    return {
      ...transaction,
      transactionCount: transaction.transactionCount || 1,
      timeWindow: transaction.timeWindow || 3600,
      amount: transaction.amount || 0,
      accountAge: transaction.accountAge || Infinity
    };
  }

  _getRecommendation(riskLevel, triggeredRules) {
    const hasBlockAction = triggeredRules.some(r => r.action === 'block');

    if (riskLevel === FraudRiskLevel.CRITICAL || hasBlockAction) {
      return 'block';
    } else if (riskLevel === FraudRiskLevel.HIGH) {
      return 'review';
    } else if (riskLevel === FraudRiskLevel.MEDIUM) {
      return 'flag';
    }
    return 'allow';
  }

  createAlert(config) {
    const alert = new FraudAlert(config);
    this.alerts.set(alert.id, alert);
    this.stats.alertsCreated++;
    return alert;
  }

  resolveAlert(alertId, resolution) {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolve(resolution);
      this.stats.alertsResolved++;
      return true;
    }
    return false;
  }

  getAlert(alertId) {
    return this.alerts.get(alertId);
  }

  getOpenAlerts() {
    return Array.from(this.alerts.values()).filter(a => a.status === 'open');
  }

  getStats() {
    return {
      ...this.stats,
      openAlerts: this.getOpenAlerts().length,
      rulesCount: this.rules.size,
      indicatorsCount: this.indicators.length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Fraud Demo\n');

  const manager = new FraudManager();

  // Show rules
  console.log('1. Fraud Detection Rules:');
  for (const rule of manager.rules.values()) {
    console.log(`   - ${rule.name}: ${rule.description}`);
  }

  // Add custom indicators
  console.log('\n2. Adding Custom Indicators:');
  manager.addIndicator(new FraudIndicator({
    name: 'velocity',
    weight: 2.0,
    threshold: 5
  }));
  manager.addIndicator(new FraudIndicator({
    name: 'unusualLocation',
    weight: 1.5,
    threshold: 0.8
  }));
  console.log(`   Added ${manager.indicators.length} indicators`);

  // Evaluate normal transaction
  console.log('\n3. Evaluating Normal Transaction:');
  const normalResult = manager.evaluateTransaction({
    id: 'txn-001',
    amount: 50,
    transactionCount: 2,
    timeWindow: 3600,
    accountAge: 30 * 86400000
  });
  console.log(`   Score: ${normalResult.score}`);
  console.log(`   Risk Level: ${normalResult.riskLevel}`);
  console.log(`   Recommendation: ${normalResult.recommendation}`);

  // Evaluate suspicious transaction
  console.log('\n4. Evaluating Suspicious Transaction:');
  const suspiciousResult = manager.evaluateTransaction({
    id: 'txn-002',
    amount: 15000,
    transactionCount: 15,
    timeWindow: 120,
    accountAge: 3600000, // 1 hour old
    velocity: 10,
    unusualLocation: 0.9
  });
  console.log(`   Score: ${suspiciousResult.score}`);
  console.log(`   Risk Level: ${suspiciousResult.riskLevel}`);
  console.log(`   Recommendation: ${suspiciousResult.recommendation}`);
  console.log(`   Triggered Rules: ${suspiciousResult.triggeredRules.join(', ')}`);

  // Create alert
  console.log('\n5. Creating Fraud Alert:');
  const alert = manager.createAlert({
    type: FraudType.TRANSACTION,
    riskLevel: FraudRiskLevel.HIGH,
    score: suspiciousResult.score,
    description: 'Suspicious high-value transaction detected',
    indicators: suspiciousResult.triggeredIndicators
  });
  console.log(`   Alert ID: ${alert.id}`);
  console.log(`   Risk Level: ${alert.riskLevel}`);

  // Resolve alert
  console.log('\n6. Resolving Alert:');
  manager.resolveAlert(alert.id, 'Confirmed legitimate - customer verified');
  console.log(`   Alert resolved: ${alert.status}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Transactions Scored: ${stats.transactionsScored}`);
  console.log(`   Rules Triggered: ${stats.rulesTriggered}`);
  console.log(`   Alerts Created: ${stats.alertsCreated}`);
  console.log(`   Alerts Resolved: ${stats.alertsResolved}`);
  console.log(`   Open Alerts: ${stats.openAlerts}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new FraudManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Fraud Module');
  console.log('Usage: node agent-fraud.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
