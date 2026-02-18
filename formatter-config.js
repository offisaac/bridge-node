/**
 * Formatter Config Manager - 代码格式化配置管理器
 * 实现代码格式化配置管理器
 */

const fs = require('fs');
const path = require('path');

// ========== Formatter Types ==========

const FormatterType = {
  PRETTIER: 'prettier',
  ESLINT: 'eslint',
  BLACK: 'black',
  RUFF: 'ruff',
  GOFMT: 'gofmt',
  CARGO: 'cargo',
  NATSUKO: 'natsuko'
};

const Language = {
  JAVASCRIPT: 'javascript',
  TYPESCRIPT: 'typescript',
  PYTHON: 'python',
  GO: 'go',
  RUST: 'rust',
  JAVA: 'java',
  Csharp: 'csharp',
  CPP: 'cpp',
  JSON: 'json',
  YAML: 'yaml',
  MARKDOWN: 'markdown',
  CSS: 'css',
  HTML: 'html'
};

// ========== Formatter Config ==========

class FormatterConfig {
  constructor(config) {
    this.id = config.id || `config_${Date.now()}`;
    this.name = config.name;
    this.formatter = config.formatter;
    this.language = config.language;
    this.config = config.config || {};
    this.extends = config.extends || null;
    this.rules = config.rules || {};
    this.metadata = config.metadata || {};
    this.version = config.version || '1.0.0';
    this.active = config.active !== false;
    this.createdAt = config.createdAt || Date.now();
    this.updatedAt = config.updatedAt || Date.now();
  }

  merge(parentConfig) {
    if (!parentConfig) return this;

    // Deep merge rules
    const mergedRules = { ...parentConfig.rules, ...this.rules };
    const mergedConfig = { ...parentConfig.config, ...this.config };

    return new FormatterConfig({
      ...this.toJSON(),
      rules: mergedRules,
      config: mergedConfig,
      extends: this.extends || parentConfig.id
    });
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      formatter: this.formatter,
      language: this.language,
      config: this.config,
      extends: this.extends,
      rules: this.rules,
      metadata: this.metadata,
      version: this.version,
      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// ========== Preset ==========

class Preset {
  constructor(config) {
    this.id = config.id || `preset_${Date.now()}`;
    this.name = config.name;
    this.description = config.description || '';
    this.language = config.language;
    this.formatters = config.formatters || []; // [{ formatter, config }]
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      language: this.language,
      formatters: this.formatters,
      metadata: this.metadata
    };
  }
}

// ========== Formatter Config Manager ==========

class FormatterConfigManager {
  constructor(options = {}) {
    this.configs = new Map(); // id -> FormatterConfig
    this.presets = new Map(); // id -> Preset
    this.storageDir = options.storageDir || './formatter-config-data';

    this._init();
    this._registerBuiltInPresets();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
  }

  _registerBuiltInPresets() {
    // JavaScript/TypeScript presets
    this.registerPreset(new Preset({
      id: 'prettier-default',
      name: 'Prettier Default',
      description: 'Official Prettier defaults',
      language: Language.JAVASCRIPT,
      formatters: [
        {
          formatter: FormatterType.PRETTIER,
          config: {
            printWidth: 80,
            tabWidth: 2,
            useTabs: false,
            semi: true,
            singleQuote: true,
            trailingComma: 'es5',
            bracketSpacing: true,
            arrowParens: 'always'
          }
        }
      ]
    }));

    // Python presets
    this.registerPreset(new Preset({
      id: 'black-default',
      name: 'Black Default',
      description: 'Official Black defaults',
      language: Language.PYTHON,
      formatters: [
        {
          formatter: FormatterType.BLACK,
          config: {
            lineLength: 88,
            targetVersion: 'py311',
            skipStringNormalization: false,
            extendSkipmagicComments: []
          }
        }
      ]
    }));

    // ESLint recommended
    this.registerPreset(new Preset({
      id: 'eslint-recommended',
      name: 'ESLint Recommended',
      description: 'ESLint recommended rules',
      language: Language.JAVASCRIPT,
      formatters: [
        {
          formatter: FormatterType.ESLINT,
          config: {
            env: {
              browser: true,
              es2021: true,
              node: true
            },
            extends: ['eslint:recommended'],
            parserOptions: {
              ecmaVersion: 'latest',
              sourceType: 'module'
            },
            rules: {
              'no-unused-vars': 'warn',
              'no-console': 'off'
            }
          }
        }
      ]
    }));
  }

  // ========== Config Management ==========

  createConfig(config) {
    const formatterConfig = new FormatterConfig({
      id: config.id || `config_${Date.now()}`,
      ...config
    });

    this.configs.set(formatterConfig.id, formatterConfig);
    this._saveConfig(formatterConfig);
    return formatterConfig;
  }

  getConfig(id) {
    return this.configs.get(id);
  }

  getConfigByName(name) {
    for (const config of this.configs.values()) {
      if (config.name === name) return config;
    }
    return null;
  }

  listConfigs(filters = {}) {
    let result = Array.from(this.configs.values());

    if (filters.formatter) {
      result = result.filter(c => c.formatter === filters.formatter);
    }

    if (filters.language) {
      result = result.filter(c => c.language === filters.language);
    }

    if (filters.active !== undefined) {
      result = result.filter(c => c.active === filters.active);
    }

    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  updateConfig(id, updates) {
    const existing = this.configs.get(id);
    if (!existing) {
      throw new Error(`Config not found: ${id}`);
    }

    const updated = new FormatterConfig({
      ...existing.toJSON(),
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now()
    });

    this.configs.set(id, updated);
    this._saveConfig(updated);
    return updated;
  }

  deleteConfig(id) {
    this.configs.delete(id);
    this._deleteConfigFile(id);
  }

  // ========== Config Resolution ==========

  resolveConfig(language, formatter) {
    // Find matching configs
    const configs = this.listConfigs({ language, active: true });

    // Filter by formatter if specified
    let matching = formatter
      ? configs.filter(c => c.formatter === formatter)
      : configs;

    // If no active configs, try presets
    if (matching.length === 0) {
      const preset = this.getPresetForLanguage(language);
      if (preset) {
        const presetFormatter = preset.formatters.find(f =>
          !formatter || f.formatter === formatter
        );
        if (presetFormatter) {
          return new FormatterConfig({
            name: preset.name,
            formatter: presetFormatter.formatter,
            language,
            config: presetFormatter.config
          });
        }
      }
    }

    // Return first matching config
    return matching[0] || null;
  }

  getPresetForLanguage(language) {
    for (const preset of this.presets.values()) {
      if (preset.language === language) {
        return preset;
      }
    }
    return null;
  }

  // ========== Preset Management ==========

  registerPreset(preset) {
    this.presets.set(preset.id, preset);
    this._savePresets();
    return preset;
  }

  getPreset(id) {
    return this.presets.get(id);
  }

  listPresets(filters = {}) {
    let result = Array.from(this.presets.values());

    if (filters.language) {
      result = result.filter(p => p.language === filters.language);
    }

    return result;
  }

  deletePreset(id) {
    this.presets.delete(id);
    this._savePresets();
  }

  // ========== Config Generation ==========

  generatePrettierConfig(language) {
    const config = this.resolveConfig(language, FormatterType.PRETTIER);
    if (!config) {
      return {
        printWidth: 80,
        tabWidth: 2,
        semi: true,
        singleQuote: true
      };
    }
    return config.config;
  }

  generateESLintConfig(language) {
    const config = this.resolveConfig(language, FormatterType.ESLINT);
    if (!config) {
      return {
        env: { node: true, es2021: true },
        extends: ['eslint:recommended'],
        parserOptions: { ecmaVersion: 'latest' },
        rules: {}
      };
    }
    return config.config;
  }

  generateBlackConfig() {
    const config = this.resolveConfig(Language.PYTHON, FormatterType.BLACK);
    if (!config) {
      return { lineLength: 88 };
    }
    return config.config;
  }

  generateConfigFile(language, formatter, format = 'json') {
    let config;

    switch (formatter) {
      case FormatterType.PRETTIER:
        config = this.generatePrettierConfig(language);
        break;
      case FormatterType.ESLINT:
        config = this.generateESLintConfig(language);
        break;
      case FormatterType.BLACK:
        config = this.generateBlackConfig();
        break;
      default:
        throw new Error(`Unknown formatter: ${formatter}`);
    }

    switch (format) {
      case 'json':
        return JSON.stringify(config, null, 2);
      case 'yaml':
        return this._toYaml(config);
      default:
        return JSON.stringify(config, null, 2);
    }
  }

  _toYaml(obj, indent = 0) {
    let yaml = '';
    const spaces = ' '.repeat(indent);

    for (const [key, value] of Object.entries(obj)) {
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        yaml += `${spaces}${key}:\n${this._toYaml(value, indent + 2)}`;
      } else if (Array.isArray(value)) {
        yaml += `${spaces}${key}:\n`;
        for (const item of value) {
          if (typeof item === 'object') {
            yaml += `${spaces}  - ${JSON.stringify(item)}\n`;
          } else {
            yaml += `${spaces}  - ${item}\n`;
          }
        }
      } else if (typeof value === 'boolean') {
        yaml += `${spaces}${key}: ${value}\n`;
      } else if (typeof value === 'number') {
        yaml += `${spaces}${key}: ${value}\n`;
      } else {
        yaml += `${spaces}${key}: '${value}'\n`;
      }
    }

    return yaml;
  }

  // ========== Statistics ==========

  getStats() {
    return {
      totalConfigs: this.configs.size,
      activeConfigs: Array.from(this.configs.values()).filter(c => c.active).length,
      byFormatter: Array.from(this.configs.values()).reduce((acc, c) => {
        acc[c.formatter] = (acc[c.formatter] || 0) + 1;
        return acc;
      }, {}),
      byLanguage: Array.from(this.configs.values()).reduce((acc, c) => {
        acc[c.language] = (acc[c.language] || 0) + 1;
        return acc;
      }, {}),
      totalPresets: this.presets.size
    };
  }

  // ========== Persistence ==========

  _loadData() {
    const configsFile = path.join(this.storageDir, 'configs.json');
    if (fs.existsSync(configsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(configsFile, 'utf8'));
        for (const c of data) {
          const config = new FormatterConfig(c);
          this.configs.set(config.id, config);
        }
      } catch (e) {
        console.error('Failed to load configs:', e);
      }
    }

    const presetsFile = path.join(this.storageDir, 'presets.json');
    if (fs.existsSync(presetsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(presetsFile, 'utf8'));
        for (const p of data) {
          const preset = new Preset(p);
          this.presets.set(preset.id, preset);
        }
      } catch (e) {
        console.error('Failed to load presets:', e);
      }
    }
  }

  _saveConfig(config) {
    const data = Array.from(this.configs.values()).map(c => c.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'configs.json'),
      JSON.stringify(data, null, 2)
    );
  }

  _deleteConfigFile(id) {
    this._saveConfig(null);
  }

  _savePresets() {
    const data = Array.from(this.presets.values()).map(p => p.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'presets.json'),
      JSON.stringify(data, null, 2)
    );
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new FormatterConfigManager();

  switch (command) {
    case 'list':
      console.log('Formatter Configs:');
      console.log('================');
      for (const config of manager.listConfigs()) {
        console.log(`\n${config.name} (${config.formatter})`);
        console.log(`  Language: ${config.language}`);
        console.log(`  Active: ${config.active}`);
      }
      break;

    case 'add':
      const config = manager.createConfig({
        name: args[1] || 'My Config',
        formatter: args[2] || 'prettier',
        language: args[3] || 'javascript',
        config: { printWidth: 100 }
      });
      console.log(`Created config: ${config.id}`);
      break;

    case 'presets':
      console.log('Built-in Presets:');
      console.log('================');
      for (const preset of manager.listPresets()) {
        console.log(`\n${preset.name} (${preset.language})`);
        console.log(`  ${preset.description}`);
      }
      break;

    case 'generate':
      const lang = args[1] || 'javascript';
      const fmt = args[2] || 'prettier';
      console.log(`Generated ${fmt} config for ${lang}:`);
      console.log(manager.generateConfigFile(lang, fmt));
      break;

    case 'resolve':
      const resolvedLang = args[1] || 'javascript';
      const resolvedFmt = args[2] || 'prettier';
      const resolved = manager.resolveConfig(resolvedLang, resolvedFmt);
      console.log('Resolved config:');
      console.log(JSON.stringify(resolved ? resolved.toJSON() : null, null, 2));
      break;

    case 'stats':
      console.log('Formatter Config Statistics:');
      console.log('=============================');
      console.log(JSON.stringify(manager.getStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node formatter-config.js list                   - List configs');
      console.log('  node formatter-config.js add <name> <fmt> <lang> - Add config');
      console.log('  node formatter-config.js presets                - List presets');
      console.log('  node formatter-config.js generate <lang> <fmt> - Generate config file');
      console.log('  node formatter-config.js resolve <lang> <fmt>  - Resolve config');
      console.log('  node formatter-config.js stats                 - Show statistics');
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  FormatterConfigManager,
  FormatterConfig,
  Preset,
  FormatterType,
  Language
};
