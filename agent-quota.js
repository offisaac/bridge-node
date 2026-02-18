/**
 * Agent Quota Module
 *
 * Provides resource quota management with limits, tracking, and enforcement.
 * Usage: node agent-quota.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show quota stats
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname + '/data';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Resource Type
 */
const ResourceType = {
  API_CALLS: 'api_calls',
  BANDWIDTH: 'bandwidth',
  STORAGE: 'storage',
  COMPUTE: 'compute',
  MEMORY: 'memory',
  REQUESTS: 'requests'
};

/**
 * Quota Scope
 */
const QuotaScope = {
  GLOBAL: 'global',
  USER: 'user',
  TEAM: 'team',
  PROJECT: 'project',
  SERVICE: 'service'
};

/**
 * Quota Limit
 */
class QuotaLimit {
  constructor(config) {
    this.id = config.id;
    this.resource = config.resource;
    this.scope = config.scope || QuotaScope.USER;
    this.scopeId = config.scopeId;
    this.limit = config.limit;
    this.used = 0;
    this.window = config.window || null; // null = unlimited
    this.windowStart = Date.now();
    this.hardLimit = config.hardLimit !== false;
    this.renewable = config.renewable !== false;
  }

  consume(amount = 1) {
    if (this.window) {
      // Check window reset
      const now = Date.now();
      if (now - this.windowStart > this.window) {
        this.used = 0;
        this.windowStart = now;
      }
    }

    if (this.used + amount > this.limit && !this.hardLimit) {
      return { allowed: false, reason: 'Quota exceeded' };
    }

    this.used += amount;
    return { allowed: true, remaining: this.limit - this.used };
  }

  release(amount = 1) {
    this.used = Math.max(0, this.used - amount);
  }

  reset() {
    this.used = 0;
    this.windowStart = Date.now();
  }

  getUsagePercent() {
    return (this.used / this.limit * 100).toFixed(2);
  }

  toJSON() {
    return {
      id: this.id,
      resource: this.resource,
      scope: this.scope,
      scopeId: this.scopeId,
      limit: this.limit,
      used: this.used,
      remaining: this.limit - this.used,
      usagePercent: this.getUsagePercent(),
      window: this.window,
      hardLimit: this.hardLimit
    };
  }
}

/**
 * Quota Plan
 */
class QuotaPlan {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.limits = {}; // resource -> limit
    this.price = config.price || 0;
    this.metadata = config.metadata || {};

    // Default limits
    if (config.limits) {
      for (const [resource, limit] of Object.entries(config.limits)) {
        this.limits[resource] = new QuotaLimit({
          id: `${this.id}-${resource}`,
          resource,
          limit
        });
      }
    }
  }

  getLimit(resource) {
    return this.limits[resource];
  }

  getAllLimits() {
    return Object.values(this.limits).map(l => l.toJSON());
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      limits: this.getAllLimits(),
      price: this.price
    };
  }
}

/**
 * Quota Usage Tracker
 */
class QuotaUsageTracker {
  constructor() {
    this.usage = new Map(); // scope:scopeId:resource -> usage
  }

  record(scope, scopeId, resource, amount = 1) {
    const key = `${scope}:${scopeId}:${resource}`;
    const current = this.usage.get(key) || { count: 0, firstUsed: Date.now(), lastUsed: Date.now() };
    current.count += amount;
    current.lastUsed = Date.now();
    this.usage.set(key, current);
    return current;
  }

  getUsage(scope, scopeId, resource) {
    const key = `${scope}:${scopeId}:${resource}`;
    return this.usage.get(key) || { count: 0 };
  }

  getAllUsage(scope, scopeId) {
    const results = [];
    const prefix = `${scope}:${scopeId}:`;
    for (const [key, value] of this.usage) {
      if (key.startsWith(prefix)) {
        const resource = key.substring(prefix.length);
        results.push({ resource, ...value });
      }
    }
    return results;
  }

  clear(scope, scopeId) {
    const prefix = `${scope}:${scopeId}:`;
    for (const key of this.usage.keys()) {
      if (key.startsWith(prefix)) {
        this.usage.delete(key);
      }
    }
  }
}

/**
 * Quota Alert
 */
class QuotaAlert {
  constructor(config) {
    this.id = config.id;
    this.resource = config.resource;
    this.thresholdPercent = config.thresholdPercent || 80;
    this.scope = config.scope;
    this.scopeId = config.scopeId;
    this.triggered = false;
    this.lastTriggered = null;
  }

  check(quota) {
    const percent = parseFloat(quota.getUsagePercent());
    if (percent >= this.thresholdPercent && !this.triggered) {
      this.triggered = true;
      this.lastTriggered = Date.now();
      return { triggered: true, percent, message: `Quota ${quota.id} at ${percent}%` };
    }
    if (percent < this.thresholdPercent) {
      this.triggered = false;
    }
    return { triggered: false, percent };
  }
}

/**
 * Quota Manager
 */
class QuotaManager {
  constructor() {
    this.plans = new Map();
    this.limits = new Map(); // id -> QuotaLimit
    this.tracker = new QuotaUsageTracker();
    this.alerts = [];
    this.stats = {
      consumed: 0,
      rejected: 0,
      alerts: 0,
      resets: 0
    };

    // Default plans
    this._createDefaultPlans();
  }

  _createDefaultPlans() {
    // Free tier
    this.addPlan(new QuotaPlan({
      id: 'free',
      name: 'Free',
      limits: {
        api_calls: 1000,
        bandwidth: 1024 * 1024, // 1MB
        storage: 100 * 1024 * 1024, // 100MB
        requests: 100
      },
      price: 0
    }));

    // Pro tier
    this.addPlan(new QuotaPlan({
      id: 'pro',
      name: 'Pro',
      limits: {
        api_calls: 100000,
        bandwidth: 1024 * 1024 * 100, // 100MB
        storage: 10 * 1024 * 1024 * 1024, // 10GB
        requests: 10000
      },
      price: 29
    }));

    // Enterprise tier
    this.addPlan(new QuotaPlan({
      id: 'enterprise',
      name: 'Enterprise',
      limits: {
        api_calls: -1, // unlimited
        bandwidth: -1,
        storage: -1,
        requests: -1
      },
      price: 299
    }));
  }

  addPlan(plan) {
    this.plans.set(plan.id, plan);
  }

  getPlan(planId) {
    return this.plans.get(planId);
  }

  listPlans() {
    return Array.from(this.plans.values()).map(p => p.toJSON());
  }

  createLimit(config) {
    const limit = new QuotaLimit(config);
    this.limits.set(limit.id, limit);
    return limit;
  }

  getLimit(limitId) {
    return this.limits.get(limitId);
  }

  consume(resource, amount = 1, options = {}) {
    const { scope = QuotaScope.USER, scopeId = 'default' } = options;

    // Find applicable limit
    let limit = null;
    let limitKey = null;

    // Check plan limit first
    if (options.planId) {
      const plan = this.plans.get(options.planId);
      if (plan) {
        limit = plan.getLimit(resource);
      }
    }

    // Check scope-specific limit
    if (!limit) {
      const specificKey = `${scope}:${scopeId}:${resource}`;
      limit = this.limits.get(specificKey);
    }

    // Check global limit
    if (!limit) {
      const globalKey = `${QuotaScope.GLOBAL}:global:${resource}`;
      limit = this.limits.get(globalKey);
    }

    if (!limit) {
      // No limit - allow
      this.stats.consumed++;
      return { allowed: true, limit: null };
    }

    // Check alerts
    for (const alert of this.alerts) {
      if (alert.resource === resource) {
        const result = alert.check(limit);
        if (result.triggered) {
          this.stats.alerts++;
        }
      }
    }

    // Consume
    const result = limit.consume(amount);
    if (result.allowed) {
      this.stats.consumed++;
      this.tracker.record(scope, scopeId, resource, amount);
    } else {
      this.stats.rejected++;
    }

    return { ...result, limit: limit.toJSON() };
  }

  release(resource, amount = 1, options = {}) {
    const { scope = QuotaScope.USER, scopeId = 'default' } = options;

    const specificKey = `${scope}:${scopeId}:${resource}`;
    const limit = this.limits.get(specificKey);
    if (limit) {
      limit.release(amount);
    }
  }

  reset(resource, options = {}) {
    const { scope = QuotaScope.USER, scopeId = 'default' } = options;

    const specificKey = `${scope}:${scopeId}:${resource}`;
    const limit = this.limits.get(specificKey);
    if (limit) {
      limit.reset();
      this.stats.resets++;
    }
  }

  addAlert(alert) {
    this.alerts.push(alert);
  }

  getUsage(scope, scopeId) {
    return this.tracker.getAllUsage(scope, scopeId);
  }

  getStats() {
    return {
      ...this.stats,
      plans: this.plans.size,
      limits: this.limits.size,
      alerts: this.alerts.length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Quota Demo\n');

  const manager = new QuotaManager();

  // Plans
  console.log('1. Quota Plans:');
  const plans = manager.listPlans();
  for (const plan of plans) {
    console.log(`   ${plan.name}: $${plan.price}/month`);
    for (const limit of plan.limits) {
      const limitStr = limit.limit === -1 ? 'unlimited' : limit.limit;
      console.log(`      - ${limit.resource}: ${limitStr}`);
    }
  }

  // Create custom quota
  console.log('\n2. Custom Quotas:');

  manager.createLimit({
    id: 'user-1-storage',
    resource: ResourceType.STORAGE,
    scope: QuotaScope.USER,
    scopeId: 'user-1',
    limit: 1024 * 1024 * 1024, // 1GB
    window: 24 * 60 * 60 * 1000 // 24 hours
  });

  manager.createLimit({
    id: 'team-1-api',
    resource: ResourceType.API_CALLS,
    scope: QuotaScope.TEAM,
    scopeId: 'team-1',
    limit: 50000,
    window: 60 * 60 * 1000 // 1 hour
  });

  console.log('   Created user storage quota: 1GB');
  console.log('   Created team API quota: 50k/hour');

  // Consume quota
  console.log('\n3. Consuming Quota:');

  let result = manager.consume(ResourceType.API_CALLS, 100, { planId: 'pro' });
  console.log(`   API calls (100): allowed=${result.allowed}, remaining=${result.limit?.remaining}`);

  result = manager.consume(ResourceType.API_CALLS, 200, { planId: 'pro' });
  console.log(`   API calls (200): allowed=${result.allowed}, remaining=${result.limit?.remaining}`);

  result = manager.consume(ResourceType.STORAGE, 500 * 1024 * 1024, { scope: QuotaScope.USER, scopeId: 'user-1' });
  console.log(`   Storage (500MB): allowed=${result.allowed}, remaining=${result.limit?.remaining}MB`);

  result = manager.consume(ResourceType.BANDWIDTH, 50 * 1024 * 1024, { scope: QuotaScope.TEAM, scopeId: 'team-1' });
  console.log(`   Bandwidth (50MB): allowed=${result.allowed}, remaining=${result.limit?.remaining}`);

  // Test limit exceeded
  console.log('\n4. Limit Exceeded:');

  for (let i = 0; i < 10; i++) {
    result = manager.consume(ResourceType.REQUESTS, 10, { planId: 'free' });
  }
  console.log(`   After 10 requests: allowed=${result.allowed}, remaining=${result.limit?.remaining}`);

  // Alerts
  console.log('\n5. Quota Alerts:');

  manager.addAlert(new QuotaAlert({
    id: 'high-usage',
    resource: ResourceType.API_CALLS,
    thresholdPercent: 80,
    scope: QuotaScope.USER,
    scopeId: 'user-1'
  }));

  // Simulate high usage
  manager.createLimit({
    id: 'test-alert',
    resource: ResourceType.COMPUTE,
    scope: QuotaScope.USER,
    scopeId: 'test-user',
    limit: 100,
    window: 60 * 60 * 1000
  });

  const alertLimit = manager.getLimit('test-alert');
  alertLimit.used = 75; // 75%
  console.log(`   Alert set at 80% threshold`);

  for (const alert of manager.alerts) {
    const checkResult = alert.check(alertLimit);
    console.log(`   Alert check: triggered=${checkResult.triggered}, percent=${checkResult.percent}%`);
  }

  // Usage tracking
  console.log('\n6. Usage Tracking:');
  const usage = manager.getUsage(QuotaScope.USER, 'user-1');
  console.log(`   User-1 usage:`);
  for (const u of usage) {
    console.log(`      - ${u.resource}: ${u.count} (last used: ${new Date(u.lastUsed).toISOString()})`);
  }

  // Reset
  console.log('\n7. Reset Quota:');
  manager.reset(ResourceType.REQUESTS, { planId: 'free' });
  console.log('   Reset free tier requests');

  result = manager.consume(ResourceType.REQUESTS, 10, { planId: 'free' });
  console.log(`   After reset: allowed=${result.allowed}, remaining=${result.limit?.remaining}`);

  // Stats
  console.log('\n8. Statistics:');
  const stats = manager.getStats();
  console.log(`   Consumed: ${stats.consumed}`);
  console.log(`   Rejected: ${stats.rejected}`);
  console.log(`   Alerts triggered: ${stats.alerts}`);
  console.log(`   Resets: ${stats.resets}`);
  console.log(`   Plans: ${stats.plans}`);
  console.log(`   Limits: ${stats.limits}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new QuotaManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Quota Module');
  console.log('Usage: node agent-quota.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
