/**
 * Agent Config Module
 *
 * Provides agent configuration management with profiles, validation, versioning.
 * Usage: node agent-config.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   get <key>              Get config value
 *   set <key> <value>      Set config value
 *   profile <name>         Switch to profile
 *   validate               Validate config
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_DB = path.join(DATA_DIR, 'agent-config.json');
const PROFILES_DIR = path.join(DATA_DIR, 'config-profiles');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(PROFILES_DIR)) {
    fs.mkdirSync(PROFILES_DIR, { recursive: true });
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
 * Config Schema Validator
 */
class ConfigValidator {
  constructor(schema = {}) {
    this.schema = schema;
  }

  validate(config) {
    const errors = [];
    const warnings = [];

    for (const [key, rules] of Object.entries(this.schema)) {
      const value = config[key];

      // Required check
      if (rules.required && (value === undefined || value === null)) {
        errors.push(`Missing required field: ${key}`);
        continue;
      }

      if (value === undefined) continue;

      // Type check
      if (rules.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        // Accept 'number' for both integer and number types
        const expectedType = rules.type === 'integer' ? 'number' : rules.type;
        if (actualType !== expectedType) {
          errors.push(`Invalid type for ${key}: expected ${rules.type}, got ${actualType}`);
        }
      }

      // Range check for numbers
      if (rules.type === 'number' || rules.type === 'integer') {
        if (rules.min !== undefined && value < rules.min) {
          errors.push(`${key} must be >= ${rules.min}`);
        }
        if (rules.max !== undefined && value > rules.max) {
          errors.push(`${key} must be <= ${rules.max}`);
        }
      }

      // Enum check
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push(`${key} must be one of: ${rules.enum.join(', ')}`);
      }

      // Pattern check for strings
      if (rules.pattern && typeof value === 'string') {
        const regex = new RegExp(rules.pattern);
        if (!regex.test(value)) {
          errors.push(`${key} does not match pattern: ${rules.pattern}`);
        }
      }

      // Deprecated warning
      if (rules.deprecated) {
        warnings.push(`${key} is deprecated: ${rules.deprecated}`);
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}

/**
 * Config Profile Manager
 */
class ProfileManager {
  constructor() {
    this.profiles = new Map();
    this.loadProfiles();
  }

  loadProfiles() {
    const files = fs.readdirSync(PROFILES_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const name = file.replace('.json', '');
      const config = loadJSON(path.join(PROFILES_DIR, file), {});
      this.profiles.set(name, config);
    }
  }

  saveProfile(name, config) {
    this.profiles.set(name, config);
    saveJSON(path.join(PROFILES_DIR, `${name}.json`), config);
  }

  getProfile(name) {
    return this.profiles.get(name);
  }

  listProfiles() {
    return Array.from(this.profiles.keys());
  }

  deleteProfile(name) {
    const file = path.join(PROFILES_DIR, `${name}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
    return this.profiles.delete(name);
  }

  createDefaultProfiles() {
    const defaults = {
      development: {
        logLevel: 'debug',
        maxAgents: 5,
        timeout: 30000,
        retryAttempts: 3,
        cacheEnabled: false,
        debugMode: true
      },
      production: {
        logLevel: 'info',
        maxAgents: 20,
        timeout: 60000,
        retryAttempts: 5,
        cacheEnabled: true,
        debugMode: false
      },
      testing: {
        logLevel: 'warn',
        maxAgents: 2,
        timeout: 5000,
        retryAttempts: 1,
        cacheEnabled: false,
        debugMode: false
      }
    };

    for (const [name, config] of Object.entries(defaults)) {
      this.saveProfile(name, config);
    }
  }
}

/**
 * Config Version Manager
 */
class VersionManager {
  constructor() {
    this.versions = [];
  }

  createVersion(config, message = '') {
    const version = {
      version: this.versions.length + 1,
      config: { ...config },
      message,
      timestamp: Date.now()
    };
    this.versions.push(version);

    // Keep last 50 versions
    if (this.versions.length > 50) {
      this.versions = this.versions.slice(-50);
    }

    return version;
  }

  getVersion(versionNum) {
    return this.versions.find(v => v.version === versionNum);
  }

  getLatest() {
    return this.versions[this.versions.length - 1];
  }

  rollback(versionNum) {
    const version = this.getVersion(versionNum);
    if (!version) {
      return null;
    }
    return { ...version.config };
  }

  getHistory(limit = 10) {
    return this.versions.slice(-limit).reverse();
  }
}

/**
 * Config Hot Reloader
 */
class HotReloader {
  constructor(configManager) {
    this.configManager = configManager;
    this.watchers = new Map();
    this.listeners = [];
  }

  watch(key, callback) {
    if (!this.watchers.has(key)) {
      this.watchers.set(key, []);
    }
    this.watchers.get(key).push(callback);
  }

  onChange(callback) {
    this.listeners.push(callback);
  }

  notifyChange(key, oldValue, newValue) {
    // Notify specific watchers
    const watchers = this.watchers.get(key) || [];
    for (const cb of watchers) {
      cb(newValue, oldValue);
    }

    // Notify general listeners
    for (const cb of this.listeners) {
      cb(key, oldValue, newValue);
    }
  }
}

/**
 * Agent Config Manager
 */
class AgentConfigManager {
  constructor() {
    this.config = loadJSON(CONFIG_DB, this.getDefaultConfig());
    this.validator = new ConfigValidator(this.getSchema());
    this.profileManager = new ProfileManager();
    this.versionManager = new VersionManager();
    this.hotReloader = new HotReloader(this);

    // Initialize default profiles if none exist
    if (this.profileManager.listProfiles().length === 0) {
      this.profileManager.createDefaultProfiles();
    }

    // Create initial version
    this.versionManager.createVersion(this.config, 'Initial config');
  }

  getDefaultConfig() {
    return {
      logLevel: 'info',
      maxAgents: 10,
      timeout: 30000,
      retryAttempts: 3,
      cacheEnabled: true,
      debugMode: false,
      region: 'us-east-1',
      enableMetrics: true,
      enableTracing: false,
      maxConcurrentRequests: 100,
      connectionPoolSize: 20
    };
  }

  getSchema() {
    return {
      logLevel: {
        type: 'string',
        enum: ['debug', 'info', 'warn', 'error'],
        required: false
      },
      maxAgents: {
        type: 'integer',
        min: 1,
        max: 100,
        required: true
      },
      timeout: {
        type: 'integer',
        min: 1000,
        max: 300000,
        required: true
      },
      retryAttempts: {
        type: 'integer',
        min: 0,
        max: 10,
        required: false
      },
      cacheEnabled: {
        type: 'boolean',
        required: false
      },
      debugMode: {
        type: 'boolean',
        required: false
      },
      region: {
        type: 'string',
        pattern: '^[a-z]+-[a-z]+-[0-9]+$',
        required: false
      },
      enableMetrics: {
        type: 'boolean',
        required: false
      },
      enableTracing: {
        type: 'boolean',
        required: false
      },
      maxConcurrentRequests: {
        type: 'integer',
        min: 1,
        max: 1000,
        required: false
      },
      connectionPoolSize: {
        type: 'integer',
        min: 1,
        max: 200,
        required: false
      }
    };
  }

  get(key) {
    return key ? this.config[key] : { ...this.config };
  }

  set(key, value, message = '') {
    const oldValue = this.config[key];
    this.config[key] = value;

    // Create version on change
    this.versionManager.createVersion(this.config, message || `Set ${key}`);

    // Notify hot reloaders
    this.hotReloader.notifyChange(key, oldValue, value);

    // Save to disk
    this.save();

    return { oldValue, newValue: value };
  }

  setMultiple(updates, message = '') {
    const oldConfig = { ...this.config };

    for (const [key, value] of Object.entries(updates)) {
      this.config[key] = value;
    }

    this.versionManager.createVersion(this.config, message || 'Bulk update');
    this.save();

    return { old: oldConfig, new: this.config };
  }

  validate() {
    return this.validator.validate(this.config);
  }

  applyProfile(profileName) {
    const profile = this.profileManager.getProfile(profileName);
    if (!profile) {
      return { error: `Profile ${profileName} not found` };
    }

    const result = this.setMultiple(profile, `Apply profile: ${profileName}`);
    return { success: true, profile: profileName, changes: result };
  }

  getProfiles() {
    return this.profileManager.listProfiles();
  }

  saveProfile(name, config) {
    this.profileManager.saveProfile(name, config);
  }

  getHistory() {
    return this.versionManager.getHistory();
  }

  rollback(versionNum) {
    const config = this.versionManager.rollback(versionNum);
    if (!config) {
      return { error: `Version ${versionNum} not found` };
    }

    this.config = config;
    this.versionManager.createVersion(this.config, `Rollback to v${versionNum}`);
    this.save();

    return { success: true, version: versionNum, config };
  }

  save() {
    saveJSON(CONFIG_DB, this.config);
  }

  reset() {
    this.config = this.getDefaultConfig();
    this.versionManager.createVersion(this.config, 'Reset to defaults');
    this.save();
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Config Demo ===\n');

  const manager = new AgentConfigManager();

  // Show default config
  console.log('1. Default Config:');
  console.log(`   Log Level: ${manager.get('logLevel')}`);
  console.log(`   Max Agents: ${manager.get('maxAgents')}`);
  console.log(`   Timeout: ${manager.get('timeout')}ms`);

  // Update config
  console.log('\n2. Updating Config:');
  manager.set('logLevel', 'debug', 'Enable debug logging');
  manager.set('maxAgents', 15, 'Increase agent limit');
  console.log(`   Set logLevel: debug`);
  console.log(`   Set maxAgents: 15`);

  // Validate
  console.log('\n3. Validation:');
  const validation = manager.validate();
  console.log(`   Valid: ${validation.valid}`);
  if (validation.errors.length > 0) {
    console.log(`   Errors: ${validation.errors.join(', ')}`);
  }
  if (validation.warnings.length > 0) {
    console.log(`   Warnings: ${validation.warnings.join(', ')}`);
  }

  // Profiles
  console.log('\n4. Profiles:');
  const profiles = manager.getProfiles();
  console.log(`   Available: ${profiles.join(', ')}`);

  console.log('\n5. Applying Production Profile:');
  const result = manager.applyProfile('production');
  console.log(`   Applied: ${result.success}`);
  console.log(`   Log Level: ${manager.get('logLevel')}`);
  console.log(`   Max Agents: ${manager.get('maxAgents')}`);

  // Hot reload simulation
  console.log('\n6. Hot Reload:');
  manager.hotReloader.watch('logLevel', (newVal, oldVal) => {
    console.log(`   Watcher triggered: logLevel changed from ${oldVal} to ${newVal}`);
  });
  manager.set('logLevel', 'error', 'Test hot reload');
  console.log(`   Set logLevel: error (watcher triggered above)`);

  // Version history
  console.log('\n7. Version History:');
  const history = manager.getHistory();
  history.forEach(v => {
    const time = new Date(v.timestamp).toLocaleTimeString();
    console.log(`   v${v.version}: ${v.message} at ${time}`);
  });

  // Rollback
  console.log('\n8. Rollback:');
  const rollback = manager.rollback(1);
  console.log(`   Rolled back to: v${rollback.version}`);
  console.log(`   Log Level: ${manager.get('logLevel')}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'get') {
  const manager = new AgentConfigManager();
  console.log(manager.get(args[1]));
} else if (cmd === 'set') {
  const manager = new AgentConfigManager();
  let value = args[2];
  // Parse numeric/boolean values
  if (value === 'true') value = true;
  else if (value === 'false') value = false;
  else if (!isNaN(value)) value = Number(value);

  manager.set(args[1], value);
  console.log(`Set ${args[1]} = ${value}`);
} else if (cmd === 'profile') {
  const manager = new AgentConfigManager();
  const result = manager.applyProfile(args[1]);
  console.log(JSON.stringify(result, null, 2));
} else if (cmd === 'validate') {
  const manager = new AgentConfigManager();
  console.log(JSON.stringify(manager.validate(), null, 2));
} else {
  console.log('Agent Config Module');
  console.log('Usage: node agent-config.js [command]');
  console.log('Commands:');
  console.log('  demo             Run demo');
  console.log('  get <key>        Get config value');
  console.log('  set <key> <val>  Set config value');
  console.log('  profile <name>   Apply profile');
  console.log('  validate         Validate config');
}
