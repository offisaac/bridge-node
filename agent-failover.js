/**
 * Agent Failover - Automatic Failover Agent
 *
 * Monitors services and automatically executes failover when failures are detected.
 *
 * Usage: node agent-failover.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   status     - Show failover status
 *   failback   - Execute failback to primary
 */

class FailoverTarget {
  constructor(config) {
    this.name = config.name;
    this.type = config.type; // primary, secondary, tertiary
    this.endpoint = config.endpoint;
    this.healthCheck = config.healthCheck || null;
    this.priority = config.priority || 100;
    this.weight = config.weight || 100;
    this.enabled = config.enabled !== false;
    this.active = config.active || false;
  }
}

class FailoverRule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.source = config.source;
    this.targets = config.targets || []; // Ordered list of failover targets
    this.conditions = config.conditions || {};
    this.enabled = config.enabled !== false;
    this.cooldown = config.cooldown || 60000; // ms before next failover
    this.maxFailovers = config.maxFailovers || 3;
    this.failoverCount = config.failoverCount || 0;
    this.lastFailover = config.lastFailover || null;
  }
}

class FailoverEvent {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.ruleId = config.ruleId;
    this.ruleName = config.ruleName;
    this.fromTarget = config.fromTarget;
    this.toTarget = config.toTarget;
    this.reason = config.reason;
    this.timestamp = config.timestamp || new Date().toISOString();
    this.status = config.status || 'completed'; // triggered, in_progress, completed, failed
    this.duration = config.duration || 0;
  }
}

class FailoverAgent {
  constructor() {
    this.targets = new Map();
    this.rules = new Map();
    this.events = [];
    this.monitoring = new Map();
    this.failbackQueue = [];
    this._initSampleData();
  }

  _initSampleData() {
    // Sample failover targets
    const targets = [
      { name: 'primary-us-east', type: 'primary', endpoint: 'https://primary.example.com', priority: 100, active: true },
      { name: 'secondary-us-west', type: 'secondary', endpoint: 'https://secondary.example.com', priority: 50, active: false },
      { name: 'tertiary-eu-west', type: 'tertiary', endpoint: 'https://tertiary.example.com', priority: 10, active: false },
      { name: 'primary-eu-central', type: 'primary', endpoint: 'https://eu.primary.example.com', priority: 100, active: true },
      { name: 'secondary-asia-east', type: 'secondary', endpoint: 'https://asia.secondary.example.com', priority: 50, active: false }
    ];

    targets.forEach(t => {
      const target = new FailoverTarget(t);
      this.targets.set(target.name, target);
    });

    // Sample failover rules
    const rules = [
      {
        name: 'API Gateway Failover',
        source: 'api-gateway',
        targets: ['primary-us-east', 'secondary-us-west', 'tertiary-eu-west'],
        conditions: { errorRate: 10, latencyThreshold: 5000, timeoutCount: 5 },
        enabled: true,
        cooldown: 300000,
        maxFailovers: 3,
        failoverCount: 1,
        lastFailover: '2026-02-10T14:00:00Z'
      },
      {
        name: 'Database Failover',
        source: 'postgres-main',
        targets: ['primary-us-east', 'secondary-us-west'],
        conditions: { errorRate: 5, connectionErrors: 3, replicationLag: 10000 },
        enabled: true,
        cooldown: 60000,
        maxFailovers: 2,
        failoverCount: 0,
        lastFailover: null
      },
      {
        name: 'Cache Failover',
        source: 'redis-cache',
        targets: ['primary-eu-central', 'secondary-asia-east'],
        conditions: { errorRate: 20, memoryPressure: 90, evictionRate: 1000 },
        enabled: true,
        cooldown: 120000,
        maxFailovers: 5,
        failoverCount: 2,
        lastFailover: '2026-02-15T08:30:00Z'
      }
    ];

    rules.forEach(r => {
      const rule = new FailoverRule(r);
      this.rules.set(rule.id, rule);
    });

    // Sample failover events
    this.events = [
      { ruleId: Array.from(this.rules.keys())[0], ruleName: 'API Gateway Failover', fromTarget: 'primary-us-east', toTarget: 'secondary-us-west', reason: 'High error rate', timestamp: '2026-02-10T14:00:00Z', status: 'completed', duration: 5000 },
      { ruleId: Array.from(this.rules.keys())[2], ruleName: 'Cache Failover', fromTarget: 'primary-eu-central', toTarget: 'secondary-asia-east', reason: 'Memory pressure', timestamp: '2026-02-15T08:30:00Z', status: 'completed', duration: 3000 },
      { ruleId: Array.from(this.rules.keys())[2], ruleName: 'Cache Failover', fromTarget: 'secondary-asia-east', toTarget: 'primary-eu-central', reason: 'Manual failback', timestamp: '2026-02-15T10:00:00Z', status: 'completed', duration: 4000 }
    ];

    // Sample monitoring data
    this.monitoring.set('primary-us-east', { healthy: true, latency: 45, errorRate: 0.1, lastCheck: new Date().toISOString() });
    this.monitoring.set('secondary-us-west', { healthy: true, latency: 120, errorRate: 0.5, lastCheck: new Date().toISOString() });
    this.monitoring.set('tertiary-eu-west', { healthy: true, latency: 200, errorRate: 1.0, lastCheck: new Date().toISOString() });
  }

  // Register target
  registerTarget(config) {
    const target = new FailoverTarget(config);
    this.targets.set(target.name, target);
    return target;
  }

  // Create failover rule
  createRule(name, source, targets, conditions = {}) {
    const rule = new FailoverRule({
      name,
      source,
      targets,
      conditions
    });
    this.rules.set(rule.id, rule);
    return rule;
  }

  // Get targets for source
  getTargets(source) {
    return Array.from(this.targets.values())
      .filter(t => this.rules.has(source) || true)
      .sort((a, b) => b.priority - a.priority);
  }

  // Execute failover
  executeFailover(ruleId, reason = 'automatic') {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    if (!rule.enabled) {
      throw new Error(`Rule ${rule.name} is disabled`);
    }

    // Check cooldown
    if (rule.lastFailover) {
      const timeSinceLastFailover = Date.now() - new Date(rule.lastFailover).getTime();
      if (timeSinceLastFailover < rule.cooldown) {
        throw new Error(`Rule ${rule.name} is in cooldown period`);
      }
    }

    // Check max failovers
    if (rule.failoverCount >= rule.maxFailovers) {
      throw new Error(`Rule ${rule.name} has reached maximum failover count`);
    }

    // Get current and next target
    const targets = rule.targets;
    const currentIndex = targets.findIndex(t => {
      const target = this.targets.get(t);
      return target && target.active;
    });

    const nextIndex = (currentIndex + 1) % targets.length;
    const fromTarget = currentIndex >= 0 ? targets[currentIndex] : targets[0];
    const toTarget = targets[nextIndex];

    // Create failover event
    const event = new FailoverEvent({
      ruleId,
      ruleName: rule.name,
      fromTarget,
      toTarget,
      reason,
      status: 'in_progress'
    });

    // Simulate failover
    event.status = 'completed';
    event.duration = Math.floor(Math.random() * 5000) + 1000;

    // Update targets
    if (this.targets.has(fromTarget)) {
      this.targets.get(fromTarget).active = false;
    }
    if (this.targets.has(toTarget)) {
      this.targets.get(toTarget).active = true;
    }

    // Update rule
    rule.failoverCount += 1;
    rule.lastFailover = event.timestamp;
    this.events.push(event);

    // Update monitoring
    this.monitoring.set(toTarget, { healthy: true, latency: 100, errorRate: 0.1, lastCheck: new Date().toISOString() });

    return event;
  }

  // Execute failback
  failback(ruleId, targetName = null) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }

    const targets = rule.targets;
    const toTarget = targetName || targets[0]; // Default to primary

    const currentActive = targets.find(t => {
      const target = this.targets.get(t);
      return target && target.active;
    });

    if (currentActive === toTarget) {
      return { message: 'Already on target', fromTarget: currentActive, toTarget };
    }

    const event = new FailoverEvent({
      ruleId,
      ruleName: rule.name,
      fromTarget: currentActive,
      toTarget,
      reason: 'Manual failback',
      status: 'completed',
      duration: Math.floor(Math.random() * 4000) + 500
    });

    // Update targets
    if (this.targets.has(currentActive)) {
      this.targets.get(currentActive).active = false;
    }
    if (this.targets.has(toTarget)) {
      this.targets.get(toTarget).active = true;
    }

    this.events.push(event);

    return event;
  }

  // Check health
  checkHealth(targetName) {
    return this.monitoring.get(targetName) || { healthy: false, lastCheck: null };
  }

  // Get failover events
  getEvents(limit = 20) {
    return this.events.slice(-limit);
  }

  // Get active failover
  getActiveFailover() {
    return Array.from(this.rules.values())
      .filter(r => r.failoverCount > 0 && r.failoverCount < r.maxFailovers)
      .map(r => ({
        name: r.name,
        source: r.source,
        failoverCount: r.failoverCount,
        maxFailovers: r.maxFailovers,
        lastFailover: r.lastFailover
      }));
  }

  // Enable/disable rule
  toggleRule(ruleId, enabled) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }
    rule.enabled = enabled;
    return rule;
  }

  // Get status
  getStatus() {
    const activeTargets = Array.from(this.targets.values()).filter(t => t.active);

    return {
      totalTargets: this.targets.size,
      activeTargets: activeTargets.length,
      totalRules: this.rules.size,
      enabledRules: Array.from(this.rules.values()).filter(r => r.enabled).length,
      totalFailovers: this.events.length,
      recentFailovers: this.events.filter(e => {
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        return new Date(e.timestamp).getTime() > dayAgo;
      }).length
    };
  }

  // Get statistics
  getStats() {
    const rules = Array.from(this.rules.values());
    const events = this.events;

    return {
      totalRules: rules.length,
      enabledRules: rules.filter(r => r.enabled).length,
      totalTargets: this.targets.size,
      activeTargets: Array.from(this.targets.values()).filter(t => t.active).length,
      totalEvents: events.length,
      completedFailovers: events.filter(e => e.status === 'completed').length,
      failedFailovers: events.filter(e => e.status === 'failed').length,
      totalFailoverCount: rules.reduce((sum, r) => sum + r.failoverCount, 0)
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const failover = new FailoverAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Failover Demo\n');

    // 1. List targets
    console.log('1. List Failover Targets:');
    const targets = Array.from(failover.targets.values());
    targets.forEach(t => {
      console.log(`   - ${t.name} [${t.type}] ${t.active ? '(ACTIVE)' : ''} priority=${t.priority}`);
    });

    // 2. List rules
    console.log('\n2. List Failover Rules:');
    const rules = Array.from(failover.rules.values());
    rules.forEach(r => {
      console.log(`   - ${r.name}: ${r.source} -> ${r.targets.join(' -> ')}`);
      console.log(`     Enabled: ${r.enabled}, Failovers: ${r.failoverCount}/${r.maxFailovers}`);
    });

    // 3. Get status
    console.log('\n3. Failover Status:');
    const status = failover.getStatus();
    console.log(`   Targets: ${status.activeTargets}/${status.totalTargets} active`);
    console.log(`   Rules: ${status.enabledRules}/${status.totalRules} enabled`);
    console.log(`   Total failovers: ${status.totalFailovers}`);

    // 4. Check health
    console.log('\n4. Health Check:');
    ['primary-us-east', 'secondary-us-west'].forEach(t => {
      const health = failover.checkHealth(t);
      console.log(`   ${t}: ${health.healthy ? 'healthy' : 'unhealthy'} (latency: ${health.latency}ms)`);
    });

    // 5. Execute failover
    console.log('\n5. Execute Failover:');
    const rule = rules[0];
    const event = failover.executeFailover(rule.id, 'High error rate detected');
    console.log(`   Rule: ${event.ruleName}`);
    console.log(`   ${event.fromTarget} -> ${event.toTarget}`);
    console.log(`   Reason: ${event.reason}`);
    console.log(`   Duration: ${event.duration}ms`);

    // 6. List targets after failover
    console.log('\n6. Targets After Failover:');
    const targetsAfter = Array.from(failover.targets.values());
    targetsAfter.forEach(t => {
      console.log(`   - ${t.name}: ${t.active ? 'ACTIVE' : 'standby'}`);
    });

    // 7. Failback
    console.log('\n7. Execute Failback:');
    const failback = failover.failback(rule.id);
    console.log(`   ${failback.fromTarget} -> ${failback.toTarget}`);
    console.log(`   Reason: ${failback.reason}`);
    console.log(`   Duration: ${failback.duration}ms`);

    // 8. Get events
    console.log('\n8. Failover Events:');
    const events = failover.getEvents(5);
    events.forEach(e => {
      console.log(`   ${e.timestamp}: ${e.ruleName}: ${e.fromTarget} -> ${e.toTarget}`);
    });

    // 9. Active failover status
    console.log('\n9. Active Failover Status:');
    const active = failover.getActiveFailover();
    console.log(`   Active rules: ${active.length}`);
    active.forEach(a => {
      console.log(`   - ${a.name}: ${a.failoverCount}/${a.maxFailovers} failovers`);
    });

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const stats = failover.getStats();
    console.log(`    Total rules: ${stats.totalRules}`);
    console.log(`    Enabled: ${stats.enabledRules}`);
    console.log(`    Total events: ${stats.totalEvents}`);
    console.log(`    Total failover count: ${stats.totalFailoverCount}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'status':
    const s = failover.getStatus();
    console.log('Failover Status:');
    console.log(`  Targets: ${s.activeTargets}/${s.totalTargets} active`);
    console.log(`  Rules: ${s.enabledRules}/${s.totalRules} enabled`);
    console.log(`  Recent failovers (24h): ${s.recentFailovers}`);
    break;

  case 'failback':
    const ruleId = args[1];
    const target = args[2] || null;
    if (!ruleId) {
      console.log('Usage: node agent-failover.js failback <rule-id> [target-name]');
      process.exit(1);
    }
    const result = failover.failback(ruleId, target);
    console.log(`Failback: ${result.fromTarget} -> ${result.toTarget}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-failover.js [demo|status|failback]');
}
