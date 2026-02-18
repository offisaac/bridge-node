/**
 * Agent Feature Flag - Feature Flag Module
 *
 * Manages feature flags for gradual rollouts and A/B testing.
 *
 * Usage: node agent-feature-flag.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   evaluate   - Evaluate a flag
 *   list       - List flags
 */

class FeatureFlag {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description || '';
    this.enabled = config.enabled !== false;
    this.targeting = config.targeting || null; // Targeting rules
    this.rollout = config.rollout || 100; // Percentage 0-100
    this.variants = config.variants || null; // For multivariate flags
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
    this.updatedAt = config.updatedAt ? new Date(config.updatedAt) : new Date();
    this.expiresAt = config.expiresAt ? new Date(config.expiresAt) : null;
  }

  isExpired() {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }

  update(config) {
    if (config.name) this.name = config.name;
    if (config.description) this.description = config.description;
    if (config.enabled !== undefined) this.enabled = config.enabled;
    if (config.targeting) this.targeting = config.targeting;
    if (config.rollout !== undefined) this.rollout = config.rollout;
    if (config.variants) this.variants = config.variants;
    if (config.expiresAt) this.expiresAt = new Date(config.expiresAt);
    this.updatedAt = new Date();
    return this;
  }
}

class FeatureFlagManager {
  constructor() {
    this.flags = new Map();
    this.evaluations = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample feature flags
    const flags = [
      { name: 'new-dashboard', description: 'New dashboard design', enabled: true, rollout: 100 },
      { name: 'dark-mode', description: 'Dark mode feature', enabled: true, rollout: 50 },
      { name: 'beta-feature', description: 'Beta testing feature', enabled: true, rollout: 10 },
      { name: 'premium-tier', description: 'Premium tier features', enabled: false, rollout: 0 },
      { name: 'experimental-ui', description: 'Experimental UI', enabled: true, rollout: 5, variants: { control: 50, treatment_a: 25, treatment_b: 25 } }
    ];

    flags.forEach(f => {
      const flag = new FeatureFlag(f);
      this.flags.set(flag.name, flag);
    });
  }

  // Create flag
  create(name, options = {}) {
    if (this.flags.has(name)) {
      throw new Error(`Flag "${name}" already exists`);
    }

    const flag = new FeatureFlag({
      name,
      description: options.description || '',
      enabled: options.enabled !== false,
      rollout: options.rollout || 100,
      variants: options.variants || null,
      expiresAt: options.expiresAt || null
    });

    this.flags.set(name, flag);
    return flag;
  }

  // Get flag
  get(name) {
    return this.flags.get(name) || null;
  }

  // List flags
  list(enabled = null) {
    let all = Array.from(this.flags.values());
    if (enabled !== null) {
      all = all.filter(f => f.enabled === enabled);
    }
    return all;
  }

  // Enable/disable flag
  setEnabled(name, enabled) {
    const flag = this.flags.get(name);
    if (!flag) {
      throw new Error(`Flag "${name}" not found`);
    }
    flag.enabled = enabled;
    flag.updatedAt = new Date();
    return flag;
  }

  // Update rollout percentage
  setRollout(name, rollout) {
    const flag = this.flags.get(name);
    if (!flag) {
      throw new Error(`Flag "${name}" not found`);
    }
    flag.rollout = Math.min(100, Math.max(0, rollout));
    flag.updatedAt = new Date();
    return flag;
  }

  // Evaluate flag for user
  evaluate(name, userId = null, context = {}) {
    const flag = this.flags.get(name);
    if (!flag) {
      return { enabled: false, reason: 'Flag not found' };
    }

    if (!flag.enabled) {
      return { enabled: false, reason: 'Flag disabled' };
    }

    if (flag.isExpired()) {
      return { enabled: false, reason: 'Flag expired' };
    }

    // Check targeting rules
    if (flag.targeting && !this._evaluateTargeting(flag.targeting, userId, context)) {
      return { enabled: false, reason: 'Not in target audience' };
    }

    // Check rollout percentage
    if (userId) {
      // Deterministic evaluation based on userId hash
      const hash = this._hashString(userId + name);
      const bucket = hash % 100;
      if (bucket >= flag.rollout) {
        return { enabled: false, reason: 'Not in rollout percentage' };
      }
    } else if (flag.rollout < 100) {
      // Random evaluation for anonymous users
      if (Math.random() * 100 >= flag.rollout) {
        return { enabled: false, reason: 'Not in rollout percentage' };
      }
    }

    // Handle variants
    let variant = null;
    if (flag.variants) {
      variant = this._evaluateVariant(flag.variants, userId, name);
    }

    // Record evaluation
    this._recordEvaluation(name, userId);

    return {
      enabled: true,
      reason: 'Flag enabled',
      variant,
      rollout: flag.rollout
    };
  }

  _hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }

  _evaluateTargeting(targeting, userId, context) {
    // Simple targeting evaluation
    if (targeting.users && userId && targeting.users.includes(userId)) {
      return true;
    }
    if (targeting.percentage && Math.random() * 100 < targeting.percentage) {
      return true;
    }
    return !targeting.users && !targeting.percentage;
  }

  _evaluateVariant(variants, userId, flagName) {
    const variantNames = Object.keys(variants);
    const weights = Object.values(variants);

    if (userId) {
      // Deterministic variant selection
      const hash = this._hashString(userId + flagName);
      let bucket = hash % 100;
      let cumulative = 0;
      for (let i = 0; i < variantNames.length; i++) {
        cumulative += weights[i];
        if (bucket < cumulative) {
          return variantNames[i];
        }
      }
    } else {
      // Random variant selection
      const random = Math.random() * 100;
      let cumulative = 0;
      for (let i = 0; i < variantNames.length; i++) {
        cumulative += weights[i];
        if (random < cumulative) {
          return variantNames[i];
        }
      }
    }

    return variantNames[0];
  }

  _recordEvaluation(name, userId) {
    if (!this.evaluations.has(name)) {
      this.evaluations.set(name, []);
    }
    this.evaluations.get(name).push({
      userId,
      timestamp: new Date()
    });
  }

  // Delete flag
  delete(name) {
    const flag = this.flags.get(name);
    if (!flag) {
      throw new Error(`Flag "${name}" not found`);
    }
    this.flags.delete(name);
    return flag;
  }

  // Get statistics
  getStats() {
    const flags = Array.from(this.flags.values());
    const enabled = flags.filter(f => f.enabled).length;
    const disabled = flags.length - enabled;

    const evalCounts = {};
    this.evaluations.forEach((evals, name) => {
      evalCounts[name] = evals.length;
    });

    return {
      totalFlags: flags.length,
      enabled,
      disabled,
      evaluations: evalCounts
    };
  }
}

function runDemo() {
  console.log('=== Agent Feature Flag Demo\n');

  const mgr = new FeatureFlagManager();

  console.log('1. List Feature Flags:');
  const flags = mgr.list();
  console.log(`   Total: ${flags.length}`);
  flags.forEach(f => console.log(`   - ${f.name}: ${f.enabled ? 'enabled' : 'disabled'} (${f.rollout}%)`));

  console.log('\n2. Evaluate Enabled Flag:');
  const result1 = mgr.evaluate('new-dashboard', 'user-123');
  console.log(`   new-dashboard: ${result1.enabled ? 'ON' : 'OFF'}`);

  console.log('\n3. Evaluate Flag with Rollout:');
  const result2 = mgr.evaluate('dark-mode', 'user-456');
  console.log(`   dark-mode: ${result2.enabled ? 'ON' : 'OFF'} (rollout: ${result2.rollout}%)`);

  console.log('\n4. Evaluate Disabled Flag:');
  const result3 = mgr.evaluate('premium-tier', 'user-789');
  console.log(`   premium-tier: ${result3.enabled ? 'ON' : 'OFF'} (${result3.reason})`);

  console.log('\n5. Evaluate Flag with Variants:');
  const result4 = mgr.evaluate('experimental-ui', 'user-999');
  console.log(`   experimental-ui: ${result4.enabled ? 'ON' : 'OFF'}`);
  if (result4.variant) console.log(`   variant: ${result4.variant}`);

  console.log('\n6. Create New Flag:');
  const newFlag = mgr.create('new-search', {
    description: 'New search algorithm',
    enabled: true,
    rollout: 25
  });
  console.log(`   Created: ${newFlag.name}`);

  console.log('\n7. Update Rollout:');
  const updated = mgr.setRollout('new-search', 50);
  console.log(`   Updated: ${updated.name} -> ${updated.rollout}%`);

  console.log('\n8. Disable Flag:');
  const disabled = mgr.setEnabled('dark-mode', false);
  console.log(`   Disabled: ${disabled.name}`);

  console.log('\n9. Evaluate After Disable:');
  const result5 = mgr.evaluate('dark-mode', 'user-456');
  console.log(`   dark-mode: ${result5.enabled ? 'ON' : 'OFF'} (${result5.reason})`);

  console.log('\n10. Get Statistics:');
  const stats = mgr.getStats();
  console.log(`    Total: ${stats.totalFlags}`);
  console.log(`    Enabled: ${stats.enabled}`);
  console.log(`    Disabled: ${stats.disabled}`);
  console.log(`    Evaluations:`, stats.evaluations);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new FeatureFlagManager();

if (command === 'demo') runDemo();
else if (command === 'evaluate') {
  const [name, userId] = args.slice(1);
  if (!name) {
    console.log('Usage: node agent-feature-flag.js evaluate <name> [userId]');
    process.exit(1);
  }
  const result = mgr.evaluate(name, userId || null);
  console.log(JSON.stringify(result, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else if (command === 'list') {
  const [enabled] = args.slice(1);
  const flags = mgr.list(enabled === 'true' ? true : enabled === 'false' ? false : null);
  console.log(JSON.stringify(flags, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else console.log('Usage: node agent-feature-flag.js [demo|evaluate|list]');
