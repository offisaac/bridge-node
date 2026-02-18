/**
 * Usage Quota - 使用配额管理
 * 实现使用配额跟踪和执行
 */

const fs = require('fs');
const path = require('path');

// ========== Quota Types ==========

const QuotaType = {
  API_CALLS: 'api_calls',
  BANDWIDTH: 'bandwidth',
  STORAGE: 'storage',
  COMPUTE: 'compute',
  REQUESTS: 'requests',
  CUSTOM: 'custom'
};

const QuotaPeriod = {
  SECOND: 'second',
  MINUTE: 'minute',
  HOUR: 'hour',
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  UNLIMITED: 'unlimited'
};

const QuotaAction = {
  ALLOW: 'allow',
  BLOCK: 'block',
  THROTTLE: 'throttle',
  WARN: 'warn'
};

// ========== Quota Definition ==========

class QuotaDefinition {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type || QuotaType.API_CALLS;
    this.limit = config.limit;
    this.period = config.period || QuotaPeriod.DAY;
    this.scope = config.scope || 'global'; // global, user, api_key, ip
    this.action = config.action || QuotaAction.BLOCK;
    this.throttleAfter = config.throttleAfter || null;
    this.throttleTo = config.throttleTo || null;
    this.softLimit = config.softLimit || null; // Warn threshold
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      limit: this.limit,
      period: this.period,
      scope: this.scope,
      action: this.action,
      throttleAfter: this.throttleAfter,
      throttleTo: this.throttleTo,
      softLimit: this.softLimit,
      metadata: this.metadata
    };
  }
}

// ========== Quota Usage ==========

class QuotaUsage {
  constructor(quotaId, scope) {
    this.quotaId = quotaId;
    this.scope = scope;
    this.used = 0;
    this.windowStart = Date.now();
    this.softLimitHit = false;
    this.hardLimitHit = false;
    this.throttled = false;
    this.history = [];
  }

  increment(amount = 1) {
    this.used += amount;
    return this.used;
  }

  reset() {
    this.history.push({
      used: this.used,
      windowStart: this.windowStart,
      endedAt: Date.now()
    });
    this.used = 0;
    this.windowStart = Date.now();
    this.softLimitHit = false;
    this.hardLimitHit = false;
    this.throttled = false;
  }

  getWindowDuration(period) {
    const now = Date.now();
    const elapsed = now - this.windowStart;

    const periodMs = {
      [QuotaPeriod.SECOND]: 1000,
      [QuotaPeriod.MINUTE]: 60 * 1000,
      [QuotaPeriod.HOUR]: 60 * 60 * 1000,
      [QuotaPeriod.DAY]: 24 * 60 * 60 * 1000,
      [QuotaPeriod.WEEK]: 7 * 24 * 60 * 60 * 1000,
      [QuotaPeriod.MONTH]: 30 * 24 * 60 * 60 * 1000
    };

    return periodMs[period] || periodMs[QuotaPeriod.DAY];
  }

  isWindowExpired(period) {
    if (period === QuotaPeriod.UNLIMITED) return false;
    const elapsed = Date.now() - this.windowStart;
    return elapsed >= this.getWindowDuration(period);
  }

  toJSON() {
    return {
      quotaId: this.quotaId,
      scope: this.scope,
      used: this.used,
      windowStart: this.windowStart,
      softLimitHit: this.softLimitHit,
      hardLimitHit: this.hardLimitHit,
      throttled: this.throttled,
      history: this.history
    };
  }
}

// ========== Quota Checker ==========

class QuotaChecker {
  constructor(quota, usage) {
    this.quota = quota;
    this.usage = usage;
  }

  check(addAmount = 1) {
    const projected = this.usage.used + addAmount;

    // Reset window if expired
    if (this.usage.isWindowExpired(this.quota.period)) {
      this.usage.reset();
    }

    // Check hard limit
    if (projected > this.quota.limit) {
      this.usage.hardLimitHit = true;
      return {
        allowed: this.quota.action === QuotaAction.ALLOW,
        action: this.quota.action,
        reason: 'hard_limit_exceeded',
        used: this.usage.used,
        limit: this.quota.limit,
        remaining: Math.max(0, this.quota.limit - this.usage.used)
      };
    }

    // Check soft limit
    if (this.quota.softLimit && projected > this.quota.softLimit && !this.usage.softLimitHit) {
      this.usage.softLimitHit = true;
      return {
        allowed: true,
        action: QuotaAction.WARN,
        reason: 'soft_limit_exceeded',
        used: this.usage.used,
        limit: this.quota.limit,
        remaining: this.quota.limit - this.usage.used
      };
    }

    // Check throttling
    if (this.quota.throttleAfter && projected > this.quota.throttleAfter) {
      this.usage.throttled = true;
      return {
        allowed: true,
        action: QuotaAction.THROTTLE,
        reason: 'throttled',
        throttleTo: this.quota.throttleTo,
        used: this.usage.used,
        limit: this.quota.limit,
        remaining: Math.max(0, this.quota.limit - this.usage.used)
      };
    }

    // Allow
    return {
      allowed: true,
      action: QuotaAction.ALLOW,
      reason: 'ok',
      used: this.usage.used,
      limit: this.quota.limit,
      remaining: Math.max(0, this.quota.limit - projected)
    };
  }
}

// ========== Quota Manager ==========

class QuotaManager {
  constructor(options = {}) {
    this.quotas = new Map(); // quotaId -> QuotaDefinition
    this.usage = new Map(); // scope:quotaId -> QuotaUsage
    this.storageDir = options.storageDir || './quota-data';
    this.listeners = new Map(); // event -> []

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadQuotas();
  }

  // ========== Quota Management ==========

  createQuota(config) {
    const quota = new QuotaDefinition({
      id: config.id || `quota_${Date.now()}`,
      ...config
    });

    this.quotas.set(quota.id, quota);
    this._saveQuota(quota);
    this._emit('quota:created', quota);

    return quota;
  }

  getQuota(id) {
    return this.quotas.get(id);
  }

  listQuotas(filters = {}) {
    let result = Array.from(this.quotas.values());

    if (filters.type) {
      result = result.filter(q => q.type === filters.type);
    }

    if (filters.scope) {
      result = result.filter(q => q.scope === filters.scope);
    }

    return result;
  }

  updateQuota(id, updates) {
    const existing = this.quotas.get(id);
    if (!existing) {
      throw new Error(`Quota not found: ${id}`);
    }

    const updated = new QuotaDefinition({
      ...existing.toJSON(),
      ...updates,
      id: existing.id
    });

    this.quotas.set(id, updated);
    this._saveQuota(updated);
    this._emit('quota:updated', updated);

    return updated;
  }

  deleteQuota(id) {
    const quota = this.quotas.get(id);
    if (!quota) {
      throw new Error(`Quota not found: ${id}`);
    }

    this.quotas.delete(id);
    this._deleteQuotaFile(id);
    this._emit('quota:deleted', { id });

    return true;
  }

  // ========== Quota Checking ==========

  getScopeKey(scope, quotaId) {
    return `${scope}:${quotaId}`;
  }

  check(scope, quotaId, amount = 1) {
    const quota = this.quotas.get(quotaId);
    if (!quota) {
      return {
        allowed: true,
        action: QuotaAction.ALLOW,
        reason: 'quota_not_found',
        used: 0,
        limit: null,
        remaining: null
      };
    }

    // Get or create usage record
    const key = this.getScopeKey(scope, quotaId);
    let usage = this.usage.get(key);

    if (!usage) {
      usage = new QuotaUsage(quotaId, scope);
      this.usage.set(key, usage);
    }

    const checker = new QuotaChecker(quota, usage);
    const result = checker.check(amount);

    // Increment usage if allowed
    if (result.allowed) {
      usage.increment(amount);
    }

    // Persist usage
    this._saveUsage(scope);

    this._emit('quota:check', {
      scope,
      quotaId,
      result
    });

    return result;
  }

  // Also supports checking by quota type
  checkByType(scope, type, amount = 1) {
    const quotas = this.listQuotas({ type, scope: scope.split(':')[0] || 'global' });
    if (quotas.length === 0) {
      return {
        allowed: true,
        action: QuotaAction.ALLOW,
        reason: 'no_quotas_for_type',
        used: 0,
        limit: null,
        remaining: null
      };
    }

    // Check first matching quota
    return this.check(scope, quotas[0].id, amount);
  }

  // ========== Usage Management ==========

  getUsage(scope, quotaId) {
    const key = this.getScopeKey(scope, quotaId);
    return this.usage.get(key);
  }

  getAllUsage(scope) {
    const result = [];
    const prefix = `${scope}:`;

    for (const [key, usage] of this.usage) {
      if (key.startsWith(prefix) || scope === 'global') {
        const [, quotaId] = key.split(':');
        const quota = this.quotas.get(quotaId);
        result.push({
          quota: quota ? quota.toJSON() : null,
          usage: usage.toJSON()
        });
      }
    }

    return result;
  }

  resetUsage(scope, quotaId) {
    const key = this.getScopeKey(scope, quotaId);
    const usage = this.usage.get(key);

    if (usage) {
      usage.reset();
      this._saveUsage(scope);
      this._emit('usage:reset', { scope, quotaId });
    }

    return usage;
  }

  // ========== Persistence ==========

  _loadQuotas() {
    const file = path.join(this.storageDir, 'quotas.json');
    if (!fs.existsSync(file)) return;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const q of data) {
        this.quotas.set(q.id, new QuotaDefinition(q));
      }
    } catch (err) {
      console.error('Failed to load quotas:', err);
    }
  }

  _saveQuota(quota) {
    const data = Array.from(this.quotas.values()).map(q => q.toJSON());
    const file = path.join(this.storageDir, 'quotas.json');
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  _deleteQuotaFile(id) {
    const data = Array.from(this.quotas.values()).map(q => q.toJSON());
    const file = path.join(this.storageDir, 'quotas.json');
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  _saveUsage(scope) {
    const file = path.join(this.storageDir, `usage_${scope}.json`);
    const data = {};

    for (const [key, usage] of this.usage) {
      if (key.startsWith(`${scope}:`)) {
        data[key] = usage.toJSON();
      }
    }

    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }

  _loadUsage(scope) {
    const file = path.join(this.storageDir, `usage_${scope}.json`);
    if (!fs.existsSync(file)) return;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [key, usage] of Object.entries(data)) {
        const u = new QuotaUsage(usage.quotaId, usage.scope);
        Object.assign(u, usage);
        this.usage.set(key, u);
      }
    } catch (err) {
      console.error('Failed to load usage:', err);
    }
  }

  // ========== Events ==========

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index >= 0) callbacks.splice(index, 1);
    }
  }

  _emit(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) {
        try {
          cb(data);
        } catch (err) {
          console.error('Quota manager event error:', err);
        }
      }
    }
  }

  // ========== Statistics ==========

  getStats() {
    const quotas = Array.from(this.quotas.values());
    const usageRecords = Array.from(this.usage.values());

    return {
      totalQuotas: quotas.length,
      totalUsageRecords: usageRecords.length,
      byType: {
        [QuotaType.API_CALLS]: quotas.filter(q => q.type === QuotaType.API_CALLS).length,
        [QuotaType.BANDWIDTH]: quotas.filter(q => q.type === QuotaType.BANDWIDTH).length,
        [QuotaType.STORAGE]: quotas.filter(q => q.type === QuotaType.STORAGE).length,
        [QuotaType.COMPUTE]: quotas.filter(q => q.type === QuotaType.COMPUTE).length,
        [QuotaType.REQUESTS]: quotas.filter(q => q.type === QuotaType.REQUESTS).length
      },
      byScope: quotas.reduce((acc, q) => {
        acc[q.scope] = (acc[q.scope] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new QuotaManager();

  switch (command) {
    case 'list':
      console.log('Available Quotas:');
      console.log('=================');
      for (const quota of manager.listQuotas()) {
        console.log(`\n${quota.name} (${quota.id})`);
        console.log(`  Type: ${quota.type}`);
        console.log(`  Limit: ${quota.limit} / ${quota.period}`);
        console.log(`  Scope: ${quota.scope}`);
        console.log(`  Action: ${quota.action}`);
      }
      break;

    case 'create':
      const name = args[1] || 'New Quota';
      const limit = parseInt(args[2]) || 1000;
      const period = args[3] || 'day';

      const newQuota = manager.createQuota({
        name,
        type: QuotaType.API_CALLS,
        limit,
        period,
        scope: 'global',
        action: QuotaAction.BLOCK
      });

      console.log(`Created quota: ${newQuota.id}`);
      break;

    case 'check':
      const scopeCheck = args[1] || 'user_1';
      const quotaIdCheck = args[2] || 'default';
      const result = manager.check(scopeCheck, quotaIdCheck);
      console.log('Check Result:', JSON.stringify(result, null, 2));
      break;

    case 'stats':
      console.log('Quota Manager Statistics:');
      console.log('=========================');
      console.log(JSON.stringify(manager.getStats(), null, 2));
      break;

    case 'usage':
      const scopeUsage = args[1] || 'user_1';
      console.log(`Usage for ${scopeUsage}:`);
      console.log(JSON.stringify(manager.getAllUsage(scopeUsage), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node quota-manager.js list              - List all quotas');
      console.log('  node quota-manager.js create <name> <limit> <period> - Create quota');
      console.log('  node quota-manager.js check <scope> <quotaId> - Check quota');
      console.log('  node quota-manager.js stats             - Show statistics');
      console.log('  node quota-manager.js usage <scope>     - Show usage');
      console.log('\nQuota Types:', Object.values(QuotaType).join(', '));
      console.log('Quota Periods:', Object.values(QuotaPeriod).join(', '));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  QuotaManager,
  QuotaDefinition,
  QuotaUsage,
  QuotaChecker,
  QuotaType,
  QuotaPeriod,
  QuotaAction
};
