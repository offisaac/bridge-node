/**
 * Notification Template - 通知模板
 * 实现可定制的通知模板
 */

const fs = require('fs');
const path = require('path');

// ========== Notification Types ==========

const NotificationType = {
  EMAIL: 'email',
  SMS: 'sms',
  PUSH: 'push',
  SLACK: 'slack',
  WEBHOOK: 'webhook',
  DINGTALK: 'dingtalk',
  WECHAT: 'wechat'
};

const NotificationPriority = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  URGENT: 'urgent'
};

const VariableType = {
  STRING: 'string',
  NUMBER: 'number',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
  OBJECT: 'object',
  DATETIME: 'datetime'
};

// ========== Template Variable ==========

class TemplateVariable {
  constructor(config) {
    this.name = config.name;
    this.type = config.type || VariableType.STRING;
    this.required = config.required !== false;
    this.default = config.default;
    this.description = config.description || '';
    this.validator = config.validator || null;
    this.enum = config.enum || null;
  }

  validate(value) {
    if (this.required && (value === undefined || value === null || value === '')) {
      return { valid: false, error: `Variable '${this.name}' is required` };
    }

    if (value === undefined || value === null) {
      return { valid: true };
    }

    // Type validation
    switch (this.type) {
      case VariableType.NUMBER:
        if (typeof value !== 'number') {
          return { valid: false, error: `'${this.name}' must be a number` };
        }
        break;
      case VariableType.BOOLEAN:
        if (typeof value !== 'boolean') {
          return { valid: false, error: `'${this.name}' must be a boolean` };
        }
        break;
      case VariableType.ARRAY:
        if (!Array.isArray(value)) {
          return { valid: false, error: `'${this.name}' must be an array` };
        }
        break;
      case VariableType.OBJECT:
        if (typeof value !== 'object' || Array.isArray(value)) {
          return { valid: false, error: `'${this.name}' must be an object` };
        }
        break;
    }

    // Enum validation
    if (this.enum && !this.enum.includes(value)) {
      return { valid: false, error: `'${this.name}' must be one of: ${this.enum.join(', ')}` };
    }

    // Custom validator
    if (this.validator) {
      try {
        if (!this.validator(value)) {
          return { valid: false, error: `'${this.name}' failed validation` };
        }
      } catch (e) {
        return { valid: false, error: e.message };
      }
    }

    return { valid: true };
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      required: this.required,
      default: this.default,
      description: this.description,
      enum: this.enum
    };
  }
}

// ========== Notification Template ==========

class NotificationTemplate {
  constructor(config) {
    this.id = config.id || `template_${Date.now()}`;
    this.name = config.name;
    this.description = config.description || '';
    this.type = config.type || NotificationType.EMAIL;
    this.category = config.category || 'general';
    this.subject = config.subject || ''; // For email
    this.content = config.content || '';
    this.htmlContent = config.htmlContent || null; // For email
    this.variables = (config.variables || []).map(v =>
      v instanceof TemplateVariable ? v : new TemplateVariable(v)
    );
    this.metadata = config.metadata || {};
    this.version = config.version || 1;
    this.active = config.active !== false;
    this.createdAt = config.createdAt || Date.now();
    this.updatedAt = config.updatedAt || Date.now();
  }

  addVariable(variable) {
    const v = variable instanceof TemplateVariable ? variable : new TemplateVariable(variable);
    this.variables.push(v);
    this.updatedAt = Date.now();
    return this;
  }

  validateVariables(data) {
    const errors = [];

    for (const variable of this.variables) {
      const value = data[variable.name];
      const result = variable.validate(value);

      if (!result.valid) {
        errors.push(result.error);
      }
    }

    return { valid: errors.length === 0, errors };
  }

  render(data) {
    // Validate variables first
    const validation = this.validateVariables(data);
    if (!validation.valid) {
      throw new Error(`Variable validation failed: ${validation.errors.join(', ')}`);
    }

    // Merge with defaults
    const mergedData = { ...data };
    for (const variable of this.variables) {
      if (mergedData[variable.name] === undefined && variable.default !== undefined) {
        mergedData[variable.name] = variable.default;
      }
    }

    // Render content
    let content = this.content;
    let subject = this.subject;
    let htmlContent = this.htmlContent;

    // Simple template variable replacement
    content = this._replaceVariables(content, mergedData);
    subject = this._replaceVariables(subject, mergedData);
    if (htmlContent) {
      htmlContent = this._replaceVariables(htmlContent, mergedData);
    }

    return {
      type: this.type,
      subject: subject || null,
      content,
      htmlContent,
      metadata: this.metadata
    };
  }

  _replaceVariables(template, data) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      const value = data[name];
      if (value === undefined) {
        return match; // Keep placeholder if not provided
      }
      if (typeof value === 'object') {
        return JSON.stringify(value);
      }
      return String(value);
    });
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      category: this.category,
      subject: this.subject,
      content: this.content,
      htmlContent: this.htmlContent,
      variables: this.variables.map(v => v.toJSON()),
      metadata: this.metadata,
      version: this.version,
      active: this.active,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// ========== Notification Channel ==========

class NotificationChannel {
  constructor(config) {
    this.id = config.id || `channel_${Date.now()}`;
    this.name = config.name;
    this.type = config.type;
    this.config = config.config || {};
    this.enabled = config.enabled !== false;
    this.rateLimit = config.rateLimit || null; // messages per minute
    this.retryConfig = config.retryConfig || {
      maxRetries: 3,
      retryDelay: 1000,
      backoff: 'exponential'
    };
  }

  async send(template, data) {
    // In real implementation, send notification via appropriate channel
    console.log(`[${this.type}] Sending ${template.name} to ${this._getRecipients(data)}`);
    return {
      success: true,
      channel: this.type,
      template: template.name,
      recipients: this._getRecipients(data)
    };
  }

  _getRecipients(data) {
    return data.recipients || data.to || data.email || 'unknown';
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      config: this.config,
      enabled: this.enabled,
      rateLimit: this.rateLimit,
      retryConfig: this.retryConfig
    };
  }
}

// ========== Notification Template Manager ==========

class NotificationTemplateManager {
  constructor(options = {}) {
    this.templates = new Map(); // id -> NotificationTemplate
    this.channels = new Map(); // id -> NotificationChannel
    this.categories = new Set();
    this.storageDir = options.storageDir || './notification-templates-data';

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
  }

  // ========== Template Management ==========

  createTemplate(config) {
    const template = new NotificationTemplate({
      id: config.id || `template_${Date.now()}`,
      ...config
    });

    this.templates.set(template.id, template);
    this.categories.add(template.category);
    this._saveData();
    return template;
  }

  getTemplate(id) {
    return this.templates.get(id);
  }

  getTemplateByName(name) {
    for (const template of this.templates.values()) {
      if (template.name === name) return template;
    }
    return null;
  }

  listTemplates(filters = {}) {
    let result = Array.from(this.templates.values());

    if (filters.type) {
      result = result.filter(t => t.type === filters.type);
    }

    if (filters.category) {
      result = result.filter(t => t.category === filters.category);
    }

    if (filters.active !== undefined) {
      result = result.filter(t => t.active === filters.active);
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(search) ||
        t.description.toLowerCase().includes(search)
      );
    }

    return result.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  updateTemplate(id, updates) {
    const existing = this.templates.get(id);
    if (!existing) {
      throw new Error(`Template not found: ${id}`);
    }

    const updated = new NotificationTemplate({
      ...existing.toJSON(),
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: Date.now()
    });

    this.templates.set(id, updated);
    this._saveData();
    return updated;
  }

  deleteTemplate(id) {
    this.templates.delete(id);
    this._saveData();
  }

  // ========== Channel Management ==========

  addChannel(config) {
    const channel = new NotificationChannel({
      id: config.id || `channel_${Date.now()}`,
      ...config
    });

    this.channels.set(channel.id, channel);
    this._saveData();
    return channel;
  }

  getChannel(id) {
    return this.channels.get(id);
  }

  listChannels(filters = {}) {
    let result = Array.from(this.channels.values());

    if (filters.type) {
      result = result.filter(c => c.type === filters.type);
    }

    if (filters.enabled !== undefined) {
      result = result.filter(c => c.enabled === filters.enabled);
    }

    return result;
  }

  enableChannel(id) {
    const channel = this.channels.get(id);
    if (!channel) throw new Error(`Channel not found: ${id}`);
    channel.enabled = true;
    this._saveData();
    return channel;
  }

  disableChannel(id) {
    const channel = this.channels.get(id);
    if (!channel) throw new Error(`Channel not found: ${id}`);
    channel.enabled = false;
    this._saveData();
    return channel;
  }

  // ========== Notification Sending ==========

  async send(templateId, data, channelIds = []) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Render template
    const rendered = template.render(data);

    // Determine channels
    const channels = channelIds.length > 0
      ? channelIds.map(id => this.channels.get(id)).filter(Boolean)
      : Array.from(this.channels.values()).filter(c => c.enabled);

    if (channels.length === 0) {
      throw new Error('No enabled channels available');
    }

    // Send to all channels
    const results = [];
    for (const channel of channels) {
      try {
        const result = await channel.send(template, { ...data, ...rendered });
        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          channel: channel.type,
          error: error.message
        });
      }
    }

    return {
      template: template.name,
      rendered,
      results
    };
  }

  // ========== Preview ==========

  preview(templateId, sampleData = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Generate sample data for missing variables
    const data = { ...sampleData };
    for (const variable of template.variables) {
      if (data[variable.name] === undefined) {
        data[variable.name] = variable.default || this._generateSampleValue(variable);
      }
    }

    return template.render(data);
  }

  _generateSampleValue(variable) {
    switch (variable.type) {
      case VariableType.STRING:
        return 'sample_value';
      case VariableType.NUMBER:
        return 42;
      case VariableType.BOOLEAN:
        return true;
      case VariableType.ARRAY:
        return ['item1', 'item2'];
      case VariableType.OBJECT:
        return { key: 'value' };
      case VariableType.DATETIME:
        return new Date().toISOString();
      default:
        return 'sample';
    }
  }

  // ========== Statistics ==========

  getStats() {
    const templates = Array.from(this.templates.values());

    return {
      totalTemplates: templates.length,
      activeTemplates: templates.filter(t => t.active).length,
      byType: templates.reduce((acc, t) => {
        acc[t.type] = (acc[t.type] || 0) + 1;
        return acc;
      }, {}),
      byCategory: templates.reduce((acc, t) => {
        acc[t.category] = (acc[t.category] || 0) + 1;
        return acc;
      }, {}),
      totalChannels: this.channels.size,
      enabledChannels: Array.from(this.channels.values()).filter(c => c.enabled).length,
      categories: Array.from(this.categories)
    };
  }

  // ========== Persistence ==========

  _loadData() {
    const file = path.join(this.storageDir, 'templates.json');
    if (!fs.existsSync(file)) return;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));

      for (const t of data.templates || []) {
        const template = new NotificationTemplate(t);
        this.templates.set(template.id, template);
        this.categories.add(template.category);
      }

      for (const c of data.channels || []) {
        const channel = new NotificationChannel(c);
        this.channels.set(channel.id, channel);
      }
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  }

  _saveData() {
    const data = {
      templates: Array.from(this.templates.values()).map(t => t.toJSON()),
      channels: Array.from(this.channels.values()).map(c => c.toJSON())
    };

    fs.writeFileSync(
      path.join(this.storageDir, 'templates.json'),
      JSON.stringify(data, null, 2)
    );
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new NotificationTemplateManager();

  switch (command) {
    case 'templates':
      console.log('Notification Templates:');
      console.log('=====================');
      for (const template of manager.listTemplates()) {
        console.log(`\n${template.name} (${template.type})`);
        console.log(`  Category: ${template.category}`);
        console.log(`  Variables: ${template.variables.length}`);
        console.log(`  Active: ${template.active}`);
      }
      break;

    case 'add-template':
      const template = manager.createTemplate({
        name: args[1] || 'Alert Notification',
        type: NotificationType.EMAIL,
        category: 'alerts',
        subject: 'Alert: {{alert_type}}',
        content: 'Hello {{recipient_name}},\n\n{{message}}\n\nTimestamp: {{timestamp}}',
        variables: [
          { name: 'recipient_name', type: 'string', required: true },
          { name: 'alert_type', type: 'string', required: true },
          { name: 'message', type: 'string', required: true },
          { name: 'timestamp', type: 'datetime', default: 'now' }
        ]
      });
      console.log(`Created template: ${template.id}`);
      break;

    case 'preview':
      const previewId = args[1];
      if (previewId) {
        const preview = manager.preview(previewId, {
          recipient_name: 'John',
          alert_type: 'High CPU',
          message: 'Server CPU usage exceeded 90%'
        });
        console.log('Preview:');
        console.log('Subject:', preview.subject);
        console.log('Content:', preview.content);
      }
      break;

    case 'send':
      const sendId = args[1];
      if (sendId) {
        manager.send(sendId, {
          recipient_name: 'John',
          alert_type: 'Test',
          message: 'This is a test notification'
        }).then(result => {
          console.log('Send result:', JSON.stringify(result, null, 2));
        }).catch(err => {
          console.error('Error:', err.message);
        });
      }
      break;

    case 'channels':
      console.log('Notification Channels:');
      console.log('====================');
      for (const channel of manager.listChannels()) {
        console.log(`\n${channel.name} (${channel.type})`);
        console.log(`  Enabled: ${channel.enabled}`);
      }
      break;

    case 'add-channel':
      const channel = manager.addChannel({
        name: args[1] || 'Email',
        type: NotificationType.EMAIL,
        config: { smtp: 'localhost' }
      });
      console.log(`Added channel: ${channel.id}`);
      break;

    case 'stats':
      console.log('Notification Template Statistics:');
      console.log('=================================');
      console.log(JSON.stringify(manager.getStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node notification-template.js templates             - List templates');
      console.log('  node notification-template.js add-template <name> - Add template');
      console.log('  node notification-template.js preview <id>        - Preview template');
      console.log('  node notification-template.js send <id>           - Send notification');
      console.log('  node notification-template.js channels            - List channels');
      console.log('  node notification-template.js add-channel <name>  - Add channel');
      console.log('  node notification-template.js stats               - Show statistics');
      console.log('\nNotification Types:', Object.values(NotificationType).join(', '));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  NotificationTemplateManager,
  NotificationTemplate,
  TemplateVariable,
  NotificationChannel,
  NotificationType,
  NotificationPriority,
  VariableType
};
