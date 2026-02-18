/**
 * Environment Manager - 环境变量管理
 * 实现环境变量管理
 */

const fs = require('fs');
const path = require('path');

// ========== Environment Types ==========

const EnvType = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  JSON: 'json',
  URL: 'url',
  PATH: 'path',
  SECRET: 'secret'
};

const EnvScope = {
  GLOBAL: 'global',
  PROJECT: 'project',
  USER: 'user',
  RUNTIME: 'runtime'
};

const ValidationLevel = {
  STRICT: 'strict',
  NORMAL: 'normal',
  LENIENT: 'lenient'
};

// ========== Environment Variable ==========

class EnvironmentVariable {
  constructor(config) {
    this.name = config.name;
    this.value = config.value;
    this.type = config.type || EnvType.STRING;
    this.description = config.description || '';
    this.default = config.default;
    this.required = config.required || false;
    this.scope = config.scope || EnvScope.PROJECT;
    this.validation = config.validation || null;
    this.encrypted = config.encrypted || false;
    this.deprecated = config.deprecated || false;
    this.deprecatedMessage = config.deprecatedMessage || '';
    this.metadata = config.metadata || {};
  }

  getValue() {
    if (this.value !== undefined) {
      return this.value;
    }
    return this.default;
  }

  castValue(value) {
    switch (this.type) {
      case EnvType.NUMBER:
        const num = parseFloat(value);
        return isNaN(num) ? value : num;
      case EnvType.BOOLEAN:
        if (typeof value === 'boolean') return value;
        return value === 'true' || value === '1' || value === 'yes';
      case EnvType.JSON:
        if (typeof value === 'object') return value;
        try {
          return JSON.parse(value);
        } catch (e) {
          return value;
        }
      default:
        return value;
    }
  }

  validate() {
    const value = this.getValue();

    if (this.required && (value === undefined || value === null || value === '')) {
      return { valid: false, error: `Required variable '${this.name}' is not set` };
    }

    if (this.validation) {
      if (this.validation.pattern) {
        const regex = new RegExp(this.validation.pattern);
        if (!regex.test(String(value))) {
          return { valid: false, error: `Value for '${this.name}' does not match pattern` };
        }
      }

      if (this.validation.min !== undefined && value < this.validation.min) {
        return { valid: false, error: `Value for '${this.name}' is below minimum` };
      }

      if (this.validation.max !== undefined && value > this.validation.max) {
        return { valid: false, error: `Value for '${this.name}' exceeds maximum` };
      }

      if (this.validation.enum && !this.validation.enum.includes(value)) {
        return { valid: false, error: `Value for '${this.name}' must be one of: ${this.validation.enum.join(', ')}` };
      }
    }

    return { valid: true };
  }

  toString() {
    return String(this.getValue() || '');
  }

  toJSON() {
    return {
      name: this.name,
      value: this.value,
      type: this.type,
      description: this.description,
      default: this.default,
      required: this.required,
      scope: this.scope,
      validation: this.validation,
      encrypted: this.encrypted,
      deprecated: this.deprecated,
      deprecatedMessage: this.deprecatedMessage,
      metadata: this.metadata
    };
  }
}

// ========== Environment Schema ==========

class EnvironmentSchema {
  constructor(config) {
    this.name = config.name;
    this.description = config.description || '';
    this.variables = (config.variables || []).map(v =>
      v instanceof EnvironmentVariable ? v : new EnvironmentVariable(v)
    );
    this.requiredVars = this.variables.filter(v => v.required);
  }

  addVariable(variable) {
    const v = variable instanceof EnvironmentVariable ? variable : new EnvironmentVariable(variable);
    this.variables.push(v);
    if (v.required) {
      this.requiredVars.push(v);
    }
    return this;
  }

  getVariable(name) {
    return this.variables.find(v => v.name === name);
  }

  validateAll(values) {
    const errors = [];

    // Check required variables
    for (const variable of this.requiredVars) {
      if (values[variable.name] === undefined && variable.default === undefined) {
        errors.push(`Required variable '${variable.name}' is not set`);
      }
    }

    // Validate each variable
    for (const [name, value] of Object.entries(values)) {
      const variable = this.getVariable(name);
      if (variable) {
        variable.value = value;
        const result = variable.validate();
        if (!result.valid) {
          errors.push(result.error);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  getDefaults() {
    const defaults = {};
    for (const variable of this.variables) {
      if (variable.default !== undefined) {
        defaults[variable.name] = variable.default;
      }
    }
    return defaults;
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      variables: this.variables.map(v => v.toJSON())
    };
  }
}

// ========== Environment Manager ==========

class EnvironmentManager {
  constructor(options = {}) {
    this.envs = new Map(); // name -> EnvironmentVariable
    this.schemas = new Map(); // name -> EnvironmentSchema
    this.profiles = new Map(); // name -> { variables }
    this.currentProfile = options.defaultProfile || 'default';
    this.storageDir = options.storageDir || './env-manager-data';
    this.validationLevel = options.validationLevel || ValidationLevel.NORMAL;

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
    this._loadProcessEnv();
  }

  _loadProcessEnv() {
    // Load variables from process.env
    for (const [name, value] of Object.entries(process.env)) {
      if (!this.envs.has(name)) {
        this.envs.set(name, new EnvironmentVariable({ name, value }));
      }
    }
  }

  // ========== Variable Management ==========

  set(name, value, options = {}) {
    const variable = new EnvironmentVariable({
      name,
      value,
      ...options
    });

    this.envs.set(name, variable);
    process.env[name] = String(value);
    this._saveVariable(variable);

    return variable;
  }

  get(name, defaultValue = null) {
    const variable = this.envs.get(name);
    if (!variable) {
      return defaultValue;
    }

    const value = variable.getValue();
    return value !== undefined ? variable.castValue(value) : defaultValue;
  }

  has(name) {
    return this.envs.has(name) || process.env[name] !== undefined;
  }

  unset(name) {
    this.envs.delete(name);
    delete process.env[name];
    this._deleteVariableFile(name);
  }

  list(filters = {}) {
    let result = Array.from(this.envs.values());

    if (filters.scope) {
      result = result.filter(e => e.scope === filters.scope);
    }

    if (filters.type) {
      result = result.filter(e => e.type === filters.type);
    }

    if (filters.required) {
      result = result.filter(e => e.required);
    }

    if (filters.deprecated) {
      result = result.filter(e => e.deprecated);
    }

    return result;
  }

  // ========== Bulk Operations ==========

  loadFromObject(obj, scope = EnvScope.RUNTIME) {
    for (const [name, value] of Object.entries(obj)) {
      this.set(name, value, { scope });
    }
  }

  loadFromEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Environment file not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const [, name, value] = match;
        this.set(name.trim(), value.trim(), { scope: EnvScope.RUNTIME });
      }
    }
  }

  exportToEnvFile(filePath, includeSecrets = false) {
    let content = '# Generated Environment File\n\n';

    for (const variable of this.envs.values()) {
      // Skip encrypted or secret variables unless explicitly included
      if (variable.encrypted && !includeSecrets) continue;

      content += `# ${variable.description || variable.name}\n`;
      content += `${variable.name}=${variable.getValue()}\n\n`;
    }

    fs.writeFileSync(filePath, content);
    return filePath;
  }

  // ========== Schema Management ==========

  createSchema(config) {
    const schema = new EnvironmentSchema(config);
    this.schemas.set(schema.name, schema);
    this._saveSchema(schema);
    return schema;
  }

  getSchema(name) {
    return this.schemas.get(name);
  }

  listSchemas() {
    return Array.from(this.schemas.values());
  }

  validateAgainstSchema(schemaName, values) {
    const schema = this.schemas.get(schemaName);
    if (!schema) {
      throw new Error(`Schema not found: ${schemaName}`);
    }

    return schema.validateAll(values);
  }

  // ========== Profiles ==========

  createProfile(name, variables = {}) {
    const profile = {
      name,
      variables: { ...variables },
      createdAt: Date.now()
    };

    this.profiles.set(name, profile);
    this._saveProfile(profile);
    return profile;
  }

  switchProfile(name) {
    if (!this.profiles.has(name)) {
      throw new Error(`Profile not found: ${name}`);
    }

    this.currentProfile = name;
    const profile = this.profiles.get(name);

    // Load profile variables
    this.loadFromObject(profile.variables, EnvScope.USER);

    return profile;
  }

  getProfile(name) {
    return this.profiles.get(name || this.currentProfile);
  }

  listProfiles() {
    return Array.from(this.profiles.values());
  }

  // ========== Encryption ==========

  encrypt(name) {
    const variable = this.envs.get(name);
    if (!variable) {
      throw new Error(`Variable not found: ${name}`);
    }

    // Simple base64 encoding (in production, use proper encryption)
    const encrypted = Buffer.from(String(variable.value)).toString('base64');
    variable.value = encrypted;
    variable.encrypted = true;

    this._saveVariable(variable);
    return variable;
  }

  decrypt(name) {
    const variable = this.envs.get(name);
    if (!variable || !variable.encrypted) {
      return variable?.value;
    }

    // Simple base64 decoding (in production, use proper decryption)
    return Buffer.from(variable.value, 'base64').toString('utf8');
  }

  // ========== Interpolation ==========

  interpolate(template) {
    return template.replace(/\$\{([^}]+)\}/g, (match, name) => {
      const value = this.get(name);
      return value !== null ? String(value) : match;
    });
  }

  // ========== Statistics ==========

  getStats() {
    const envs = Array.from(this.envs.values());

    return {
      totalVariables: envs.length,
      byType: envs.reduce((acc, e) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {}),
      byScope: envs.reduce((acc, e) => {
        acc[e.scope] = (acc[e.scope] || 0) + 1;
        return acc;
      }, {}),
      required: envs.filter(e => e.required).length,
      deprecated: envs.filter(e => e.deprecated).length,
      encrypted: envs.filter(e => e.encrypted).length,
      profiles: this.profiles.size,
      currentProfile: this.currentProfile
    };
  }

  // ========== Persistence ==========

  _loadData() {
    // Load variables
    const varsDir = path.join(this.storageDir, 'variables');
    if (fs.existsSync(varsDir)) {
      for (const file of fs.readdirSync(varsDir).filter(f => f.endsWith('.json'))) {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(varsDir, file), 'utf8'));
          const variable = new EnvironmentVariable(data);
          this.envs.set(variable.name, variable);
        } catch (e) {
          console.error(`Failed to load variable ${file}:`, e);
        }
      }
    }

    // Load schemas
    const schemasFile = path.join(this.storageDir, 'schemas.json');
    if (fs.existsSync(schemasFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(schemasFile, 'utf8'));
        for (const s of data) {
          const schema = new EnvironmentSchema(s);
          this.schemas.set(schema.name, schema);
        }
      } catch (e) {
        console.error('Failed to load schemas:', e);
      }
    }

    // Load profiles
    const profilesFile = path.join(this.storageDir, 'profiles.json');
    if (fs.existsSync(profilesFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(profilesFile, 'utf8'));
        for (const p of data) {
          this.profiles.set(p.name, p);
        }
      } catch (e) {
        console.error('Failed to load profiles:', e);
      }
    }
  }

  _saveVariable(variable) {
    const dir = path.join(this.storageDir, 'variables');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(dir, `${variable.name}.json`),
      JSON.stringify(variable.toJSON(), null, 2)
    );
  }

  _deleteVariableFile(name) {
    const file = path.join(this.storageDir, 'variables', `${name}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  _saveSchema(schema) {
    const data = Array.from(this.schemas.values()).map(s => s.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'schemas.json'),
      JSON.stringify(data, null, 2)
    );
  }

  _saveProfile(profile) {
    const data = Array.from(this.profiles.values());
    fs.writeFileSync(
      path.join(this.storageDir, 'profiles.json'),
      JSON.stringify(data, null, 2)
    );
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new EnvironmentManager();

  switch (command) {
    case 'list':
      console.log('Environment Variables:');
      console.log('=====================');
      for (const env of manager.list()) {
        console.log(`\n${env.name} = ${env.value || '(not set)'}`);
        console.log(`  Type: ${env.type} | Scope: ${env.scope}`);
        if (env.required) console.log(`  Required: true`);
        if (env.deprecated) console.log(`  Deprecated: ${env.deprecatedMessage}`);
      }
      break;

    case 'get':
      const value = manager.get(args[1]);
      console.log(`${args[1]} = ${value}`);
      break;

    case 'set':
      const name = args[1];
      const varValue = args[2] || '';
      manager.set(name, varValue);
      console.log(`Set ${name} = ${varValue}`);
      break;

    case 'unset':
      manager.unset(args[1]);
      console.log(`Unset ${args[1]}`);
      break;

    case 'schema':
      const schemaName = args[1] || 'default';
      const schema = manager.createSchema({
        name: schemaName,
        description: 'Application environment schema',
        variables: [
          { name: 'PORT', type: 'number', default: 3000, required: true },
          { name: 'NODE_ENV', type: 'string', default: 'development', enum: ['development', 'staging', 'production'] },
          { name: 'DEBUG', type: 'boolean', default: false }
        ]
      });
      console.log(`Created schema: ${schema.name} with ${schema.variables.length} variables`);
      break;

    case 'validate':
      const v = manager.validateAgainstSchema(args[1] || 'default', {
        PORT: args[2] || 3000,
        NODE_ENV: args[3] || 'development'
      });
      console.log('Validation result:', JSON.stringify(v, null, 2));
      break;

    case 'profiles':
      console.log('Profiles:');
      console.log('========');
      for (const profile of manager.listProfiles()) {
        console.log(`\n${profile.name} (current: ${profile.name === manager.currentProfile})`);
        console.log(`  Variables: ${Object.keys(profile.variables).length}`);
      }
      break;

    case 'stats':
      console.log('Environment Manager Statistics:');
      console.log('===============================');
      console.log(JSON.stringify(manager.getStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node env-manager.js list                      - List all variables');
      console.log('  node env-manager.js get <name>                - Get variable value');
      console.log('  node env-manager.js set <name> <value>       - Set variable value');
      console.log('  node env-manager.js unset <name>             - Unset variable');
      console.log('  node env-manager.js schema [name]            - Create schema');
      console.log('  node env-manager.js validate <schema>       - Validate against schema');
      console.log('  node env-manager.js profiles                 - List profiles');
      console.log('  node env-manager.js stats                    - Show statistics');
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  EnvironmentManager,
  EnvironmentVariable,
  EnvironmentSchema,
  EnvType,
  EnvScope,
  ValidationLevel
};
