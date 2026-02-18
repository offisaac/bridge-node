/**
 * Feature Flag Service - 特性开关服务
 * 集中式特性开关管理，支持定向投放、灰度发布、动态配置
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ========== Feature Flag Types ==========

const FlagType = {
  BOOLEAN: 'boolean',
  STRING: 'string',
  NUMBER: 'number',
  JSON: 'json'
};

const TargetType = {
  USER: 'user',
  IP: 'ip',
  PERCENTAGE: 'percentage',
  REGION: 'region'
};

// ========== Feature Flag ==========

class FeatureFlag {
  constructor(name, config = {}) {
    this.name = name;
    this.enabled = config.enabled ?? false;
    this.type = config.type ?? FlagType.BOOLEAN;
    this.defaultValue = config.defaultValue ?? null;
    this.description = config.description ?? '';
    this.tags = config.tags ?? [];
    this.rollout = config.rollout ?? 0; // 0-100 percentage
    this.targets = config.targets ?? []; // Array of targeting rules
    this.variants = config.variants ?? []; // For multivariate flags
    this.createdAt = config.createdAt ?? new Date().toISOString();
    this.updatedAt = config.updatedAt ?? new Date().toISOString();
    this.metadata = config.metadata ?? {};
  }

  // 评估特性开关
  evaluate(context = {}) {
    // 1. Check targeting rules first
    if (this.targets.length > 0) {
      for (const target of this.targets) {
        if (this._matchTarget(target, context)) {
          return target.value ?? true;
        }
      }
    }

    // 2. Check rollout percentage
    if (this.rollout > 0 && this.rollout < 100) {
      const userId = context.userId || context.user_id || context.sessionId;
      if (userId) {
        const hash = this._hashUser(userId);
        if (hash < this.rollout) {
          return this.defaultValue ?? true;
        }
      } else if (context.ip) {
        const hash = this._hashIP(context.ip);
        if (hash < this.rollout) {
          return this.defaultValue ?? true;
        }
      }
    }

    // 3. Return enabled state
    return this.enabled ? (this.defaultValue ?? true) : this.defaultValue;
  }

  _matchTarget(target, context) {
    const { type, operator, value } = target;

    switch (type) {
      case TargetType.USER:
        if (operator === 'in') {
          return Array.isArray(value) && value.includes(context.userId || context.user_id);
        }
        return context.userId === value || context.user_id === value;

      case TargetType.IP:
        if (operator === 'range') {
          return this._ipInRange(context.ip, value.start, value.end);
        }
        return context.ip === value;

      case TargetType.REGION:
        return context.region === value || context.country === value;

      case TargetType.PERCENTAGE:
        return this._hashUser(context.userId || context.sessionId) < value;

      default:
        return false;
    }
  }

  _hashUser(userId) {
    const hash = crypto.createHash('md5').update(userId).digest('hex');
    return parseInt(hash.substring(0, 8), 16) % 100;
  }

  _hashIP(ip) {
    const hash = crypto.createHash('md5').update(ip).digest('hex');
    return parseInt(hash.substring(0, 8), 16) % 100;
  }

  _ipInRange(ip, start, end) {
    const ipToNum = (ip) => {
      return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
    };
    const ipNum = ipToNum(ip);
    return ipNum >= ipToNum(start) && ipNum <= ipToNum(end);
  }

  toJSON() {
    return {
      name: this.name,
      enabled: this.enabled,
      type: this.type,
      defaultValue: this.defaultValue,
      description: this.description,
      tags: this.tags,
      rollout: this.rollout,
      targets: this.targets,
      variants: this.variants,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata: this.metadata
    };
  }
}

// ========== Feature Flag Service ==========

class FeatureFlagService {
  constructor(options = {}) {
    this.flags = new Map();
    this.storagePath = options.storagePath || './feature-flags.json';
    this.listeners = new Map();
    this.cache = new Map();
    this.cacheTTL = options.cacheTTL || 60000; // 1 minute default

    this._load();
  }

  // ========== Flag Management ==========

  create(name, config = {}) {
    if (this.flags.has(name)) {
      throw new Error(`Flag '${name}' already exists`);
    }

    const flag = new FeatureFlag(name, config);
    this.flags.set(name, flag);
    this._save();
    this._emit('flag:created', flag);

    return flag;
  }

  update(name, updates) {
    const flag = this.flags.get(name);
    if (!flag) {
      throw new Error(`Flag '${name}' not found`);
    }

    const updated = new FeatureFlag(name, {
      ...flag.toJSON(),
      ...updates,
      updatedAt: new Date().toISOString()
    });

    this.flags.set(name, updated);
    this.cache.clear(); // Clear cache on update
    this._save();
    this._emit('flag:updated', updated);

    return updated;
  }

  delete(name) {
    const flag = this.flags.get(name);
    if (!flag) {
      throw new Error(`Flag '${name}' not found`);
    }

    this.flags.delete(name);
    this.cache.clear();
    this._save();
    this._emit('flag:deleted', { name });

    return true;
  }

  get(name) {
    return this.flags.get(name);
  }

  list(filters = {}) {
    let flags = Array.from(this.flags.values());

    if (filters.enabled !== undefined) {
      flags = flags.filter(f => f.enabled === filters.enabled);
    }

    if (filters.tag) {
      flags = flags.filter(f => f.tags.includes(filters.tag));
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      flags = flags.filter(f =>
        f.name.toLowerCase().includes(search) ||
        f.description.toLowerCase().includes(search)
      );
    }

    return flags;
  }

  // ========== Flag Evaluation ==========

  isEnabled(name, context = {}) {
    // Check cache first
    const cacheKey = `${name}:${JSON.stringify(context)}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.value;
    }

    const flag = this.flags.get(name);
    if (!flag) {
      return false;
    }

    const value = flag.evaluate(context);

    // Cache the result
    this.cache.set(cacheKey, {
      value,
      timestamp: Date.now()
    });

    return value;
  }

  getValue(name, context = {}, defaultValue = null) {
    const flag = this.flags.get(name);
    if (!flag) {
      return defaultValue;
    }

    return flag.evaluate(context) ?? defaultValue;
  }

  // ========== Targeting Rules ==========

  addTarget(name, target) {
    const flag = this.flags.get(name);
    if (!flag) {
      throw new Error(`Flag '${name}' not found`);
    }

    flag.targets.push(target);
    this.flags.set(name, flag);
    this.cache.clear();
    this._save();
    this._emit('target:added', { name, target });

    return flag;
  }

  removeTarget(name, targetIndex) {
    const flag = this.flags.get(name);
    if (!flag) {
      throw new Error(`Flag '${name}' not found`);
    }

    flag.targets.splice(targetIndex, 1);
    this.flags.set(name, flag);
    this.cache.clear();
    this._save();

    return flag;
  }

  // ========== Rollout Management ==========

  setRollout(name, percentage) {
    if (percentage < 0 || percentage > 100) {
      throw new Error('Rollout percentage must be between 0 and 100');
    }

    return this.update(name, { rollout: percentage });
  }

  // ========== Bulk Operations ==========

  enableAll(tags = []) {
    for (const [name, flag] of this.flags) {
      if (tags.length === 0 || flag.tags.some(t => tags.includes(t))) {
        this.update(name, { enabled: true });
      }
    }
  }

  disableAll(tags = []) {
    for (const [name, flag] of this.flags) {
      if (tags.length === 0 || flag.tags.some(t => tags.includes(t))) {
        this.update(name, { enabled: false });
      }
    }
  }

  // ========== Event System ==========

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;

    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) {
      callbacks.splice(index, 1);
    }
  }

  _emit(event, data) {
    if (!this.listeners.has(event)) return;

    for (const callback of this.listeners.get(event)) {
      try {
        callback(data);
      } catch (err) {
        console.error(`Error in flag event listener:`, err);
      }
    }
  }

  // ========== Persistence ==========

  _load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        for (const [name, config] of Object.entries(data.flags || {})) {
          this.flags.set(name, new FeatureFlag(name, config));
        }
      }
    } catch (err) {
      console.error('Failed to load feature flags:', err);
    }
  }

  _save() {
    try {
      const data = {
        version: '1.0',
        updatedAt: new Date().toISOString(),
        flags: {}
      };

      for (const [name, flag] of this.flags) {
        data.flags[name] = flag.toJSON();
      }

      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to save feature flags:', err);
    }
  }

  // ========== Cache Management ==========

  clearCache() {
    this.cache.clear();
  }

  // ========== Export/Import ==========

  export() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      flags: Object.fromEntries(
        Array.from(this.flags.entries()).map(([name, flag]) => [name, flag.toJSON()])
      )
    };
  }

  import(data) {
    if (!data.flags) {
      throw new Error('Invalid import data: missing flags');
    }

    for (const [name, config] of Object.entries(data.flags)) {
      this.flags.set(name, new FeatureFlag(name, config));
    }

    this._save();
    this.cache.clear();

    return this.flags.size;
  }
}

// ========== CLI ==========

function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0];

  const service = new FeatureFlagService();

  switch (command) {
    case 'list':
      console.log('Feature Flags:');
      for (const flag of service.list()) {
        console.log(`  ${flag.enabled ? '[x]' : '[ ]'} ${flag.name} (${flag.rollout}%)`);
        if (flag.description) {
          console.log(`      ${flag.description}`);
        }
      }
      break;

    case 'create':
      const name = args[1];
      if (!name) {
        console.error('Usage: node feature-flags.js create <name>');
        process.exit(1);
      }
      service.create(name, {
        enabled: args.includes('--enabled'),
        description: args.find(a => a.startsWith('--desc='))?.split('=')[1] || ''
      });
      console.log(`Created flag: ${name}`);
      break;

    case 'enable':
      const enableName = args[1];
      if (!enableName) {
        console.error('Usage: node feature-flags.js enable <name>');
        process.exit(1);
      }
      service.update(enableName, { enabled: true });
      console.log(`Enabled flag: ${enableName}`);
      break;

    case 'disable':
      const disableName = args[1];
      if (!disableName) {
        console.error('Usage: node feature-flags.js disable <name>');
        process.exit(1);
      }
      service.update(disableName, { enabled: false });
      console.log(`Disabled flag: ${disableName}`);
      break;

    case 'rollout':
      const rolloutName = args[1];
      const percentage = parseInt(args[2], 10);
      if (!rolloutName || isNaN(percentage)) {
        console.error('Usage: node feature-flags.js rollout <name> <percentage>');
        process.exit(1);
      }
      service.setRollout(rolloutName, percentage);
      console.log(`Set rollout for ${rolloutName} to ${percentage}%`);
      break;

    case 'eval':
      const evalName = args[1];
      const contextJson = args[2] || '{}';
      const context = JSON.parse(contextJson);
      const result = service.isEnabled(evalName, context);
      console.log(`Flag '${evalName}' is ${result ? 'enabled' : 'disabled'} for context:`, context);
      break;

    default:
      console.log(`
Feature Flag Service CLI

Usage:
  node feature-flags.js list                           List all flags
  node feature-flags.js create <name>                Create a new flag
  node feature-flags.js enable <name>                Enable a flag
  node feature-flags.js disable <name>               Disable a flag
  node feature-flags.js rollout <name> <percentage>  Set rollout percentage
  node feature-flags.js eval <name> [context]        Evaluate a flag

Options:
  --enabled       Enable flag on create
  --desc=<desc>   Set description
      `);
  }
}

// ========== Export ==========

module.exports = {
  FeatureFlagService,
  FeatureFlag,
  FlagType,
  TargetType
};

// Run CLI if called directly
if (require.main === module) {
  runCLI();
}
