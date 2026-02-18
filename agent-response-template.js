/**
 * Agent Response Template - Template Management Module
 *
 * Manages response templates for automated communications.
 *
 * Usage: node agent-response-template.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   list       - List templates
 *   render     - Render a template
 *   create     - Create a template
 */

class ResponseTemplate {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.category = config.category; // support, sales, crisis, onboarding, feedback
    this.content = config.content;
    this.variables = config.variables || []; // Array of variable names
    this.channel = config.channel || 'email'; // email, sms, chat, webhook
    this.language = config.language || 'en';
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
    this.updatedAt = config.updatedAt ? new Date(config.updatedAt) : new Date();
    this.usageCount = config.usageCount || 0;
    this.status = config.status || 'active'; // active, deprecated
  }

  update(config) {
    if (config.name) this.name = config.name;
    if (config.category) this.category = config.category;
    if (config.content) this.content = config.content;
    if (config.variables) this.variables = config.variables;
    if (config.channel) this.channel = config.channel;
    if (config.status) this.status = config.status;
    this.updatedAt = new Date();
    return this;
  }
}

class TemplateRenderer {
  constructor() {
    // Built-in filters
    this.filters = {
      uppercase: (val) => String(val).toUpperCase(),
      lowercase: (val) => String(val).toLowerCase(),
      capitalize: (val) => String(val).charAt(0).toUpperCase() + String(val).slice(1),
      trim: (val) => String(val).trim(),
      date: (val) => new Date(val).toLocaleDateString(),
      datetime: (val) => new Date(val).toLocaleString()
    };
  }

  // Simple template rendering with {{variable}} syntax
  render(template, variables) {
    let content = template;

    // Replace variables
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      content = content.replace(regex, variables[key]);
    });

    // Check for unresolved variables
    const unresolved = content.match(/\{\{[^}]+\}\}/g);
    if (unresolved) {
      console.log(`Warning: Unresolved variables: ${unresolved.join(', ')}`);
    }

    return content;
  }

  // Render with filters: {{variable|filter}}
  renderWithFilters(template, variables) {
    let content = template;

    // Replace variables with filters
    const filterRegex = /\{\{([^}|]+)(\|([^}]+))?\}\}/g;
    content = content.replace(filterRegex, (match, varName, filterPart, filterName) => {
      let value = variables[varName.trim()] || '';

      if (filterName && this.filters[filterName]) {
        value = this.filters[filterName](value);
      }

      return value;
    });

    return content;
  }
}

class ResponseTemplateManager {
  constructor() {
    this.templates = new Map();
    this.renderer = new TemplateRenderer();
    this._initSampleData();
  }

  _initSampleData() {
    const sampleTemplates = [
      {
        name: 'Welcome Email',
        category: 'onboarding',
        channel: 'email',
        content: `Dear {{name}},

Welcome to {{company_name}}! We're excited to have you on board.

Your account details:
- Email: {{email}}
- Start Date: {{start_date}}

Getting started is easy. Simply log in to your dashboard at {{dashboard_url}} and complete your profile.

If you have any questions, don't hesitate to reach out to our support team at {{support_email}}.

Best regards,
{{company_name}} Team`,
        variables: ['name', 'company_name', 'email', 'start_date', 'dashboard_url', 'support_email']
      },
      {
        name: 'Support Ticket Acknowledgment',
        category: 'support',
        channel: 'email',
        content: `Hello {{name}},

Thank you for contacting {{company_name}} support. We've received your ticket and will get back to you within 24 hours.

Ticket Details:
- Ticket #: {{ticket_id}}
- Subject: {{subject}}
- Priority: {{priority}}

You can track your ticket status at {{ticket_url}}.

Best regards,
{{company_name}} Support Team`,
        variables: ['name', 'company_name', 'ticket_id', 'subject', 'priority', 'ticket_url']
      },
      {
        name: 'Password Reset',
        category: 'support',
        channel: 'email',
        content: `Hi {{name}},

We received a request to reset your {{company_name}} password.

Click the link below to create a new password:
{{reset_link}}

This link will expire in {{expiry_hours}} hours.

If you didn't request this change, please ignore this email or contact support immediately.

Best regards,
{{company_name}} Security Team`,
        variables: ['name', 'company_name', 'reset_link', 'expiry_hours']
      },
      {
        name: 'Order Confirmation',
        category: 'sales',
        channel: 'email',
        content: `Thank you for your order, {{name}}!

Order Details:
- Order #: {{order_id}}
- Items: {{items}}
- Total: {{total}}

Estimated delivery: {{delivery_date}}

Track your order: {{tracking_url}}

Thank you for shopping with {{company_name}}!

Best,
{{company_name}}`,
        variables: ['name', 'order_id', 'items', 'total', 'delivery_date', 'tracking_url', 'company_name']
      },
      {
        name: 'Crisis Response',
        category: 'crisis',
        channel: 'email',
        content: `Dear {{name}},

We are aware of the issue regarding {{issue}} and want to assure you that we are taking immediate action.

What happened: {{description}}

What we're doing: {{action}}

Expected resolution: {{resolution_time}}

We apologize for any inconvenience and appreciate your patience.

{{company_name}} Team`,
        variables: ['name', 'issue', 'description', 'action', 'resolution_time', 'company_name']
      },
      {
        name: 'Feedback Request',
        category: 'feedback',
        channel: 'email',
        content: `Hi {{name}},

Thank you for using {{product_name}}! We'd love to hear your feedback.

Please take 2 minutes to share your experience:
{{feedback_url}}

Your input helps us improve!

Best,
{{company_name}} Team`,
        variables: ['name', 'product_name', 'feedback_url', 'company_name']
      }
    ];

    sampleTemplates.forEach(t => {
      const template = new ResponseTemplate(t);
      this.templates.set(template.id, template);
    });
  }

  // Create template
  create(name, category, content, options = {}) {
    // Extract variables from content
    const variableRegex = /\{\{([^}]+)\}\}/g;
    const variables = [];
    let match;
    while ((match = variableRegex.exec(content)) !== null) {
      if (!variables.includes(match[1].trim())) {
        variables.push(match[1].trim());
      }
    }

    const template = new ResponseTemplate({
      name,
      category,
      content,
      variables,
      channel: options.channel || 'email',
      language: options.language || 'en'
    });

    this.templates.set(template.id, template);
    return template;
  }

  // Get template by ID
  getById(id) {
    return this.templates.get(id) || null;
  }

  // Get template by name
  getByName(name) {
    return Array.from(this.templates.values())
      .find(t => t.name.toLowerCase() === name.toLowerCase()) || null;
  }

  // List templates
  list(category = null, channel = null, includeDeprecated = false) {
    let allTemplates = Array.from(this.templates.values());

    if (category) {
      allTemplates = allTemplates.filter(t => t.category === category);
    }

    if (channel) {
      allTemplates = allTemplates.filter(t => t.channel === channel);
    }

    if (!includeDeprecated) {
      allTemplates = allTemplates.filter(t => t.status === 'active');
    }

    return allTemplates;
  }

  // Render template
  render(templateId, variables) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error('Template not found');
    }

    // Update usage count
    template.usageCount++;

    return this.renderer.renderWithFilters(template.content, variables);
  }

  // Render by name
  renderByName(name, variables) {
    const template = this.getByName(name);
    if (!template) {
      throw new Error('Template not found');
    }
    return this.render(template.id, variables);
  }

  // Update template
  update(id, updates) {
    const template = this.templates.get(id);
    if (!template) {
      throw new Error('Template not found');
    }

    // Re-extract variables if content changed
    if (updates.content) {
      const variableRegex = /\{\{([^}]+)\}\}/g;
      const variables = [];
      let match;
      while ((match = variableRegex.exec(updates.content)) !== null) {
        if (!variables.includes(match[1].trim())) {
          variables.push(match[1].trim());
        }
      }
      updates.variables = variables;
    }

    return template.update(updates);
  }

  // Delete template
  delete(id) {
    const template = this.templates.get(id);
    if (!template) {
      throw new Error('Template not found');
    }
    this.templates.delete(id);
    return template;
  }

  // Get statistics
  getStats() {
    const templates = Array.from(this.templates.values());
    const totalUsage = templates.reduce((sum, t) => sum + t.usageCount, 0);

    const byCategory = {};
    const byChannel = {};
    const byStatus = { active: 0, deprecated: 0 };

    templates.forEach(t => {
      byCategory[t.category] = (byCategory[t.category] || 0) + 1;
      byChannel[t.channel] = (byChannel[t.channel] || 0) + 1;
      byStatus[t.status]++;
    });

    return {
      totalTemplates: templates.length,
      totalUsage,
      avgUsage: templates.length > 0 ? Math.round(totalUsage / templates.length) : 0,
      byCategory,
      byChannel,
      byStatus
    };
  }

  // Search templates
  search(query) {
    const queryLower = query.toLowerCase();
    return Array.from(this.templates.values())
      .filter(t =>
        t.name.toLowerCase().includes(queryLower) ||
        t.content.toLowerCase().includes(queryLower) ||
        t.category.toLowerCase().includes(queryLower)
      );
  }
}

function runDemo() {
  console.log('=== Agent Response Template Demo\n');

  const mgr = new ResponseTemplateManager();

  console.log('1. List Templates:');
  const templates = mgr.list();
  console.log(`   Total: ${templates.length}`);
  templates.forEach(t => console.log(`   - ${t.name} [${t.category}]`));

  console.log('\n2. Get Template by Name:');
  const welcome = mgr.getByName('Welcome Email');
  console.log(`   Found: ${welcome.name}`);
  console.log(`   Variables: ${welcome.variables.join(', ')}`);

  console.log('\n3. Render Template (by ID):');
  const rendered1 = mgr.render(welcome.id, {
    name: 'John Doe',
    company_name: 'Acme Corp',
    email: 'john@example.com',
    start_date: '2026-02-20',
    dashboard_url: 'https://dashboard.acme.com',
    support_email: 'support@acme.com'
  });
  console.log(rendered1.substring(0, 200) + '...');

  console.log('\n4. Render Template (by name):');
  const rendered2 = mgr.renderByName('Support Ticket Acknowledgment', {
    name: 'Jane Smith',
    company_name: 'Acme Corp',
    ticket_id: 'TKT-12345',
    subject: 'Login issue',
    priority: 'High',
    ticket_url: 'https://support.acme.com/ticket/12345'
  });
  console.log(rendered2.substring(0, 200) + '...');

  console.log('\n5. List by Category (support):');
  const supportTemplates = mgr.list('support');
  console.log(`   Support templates: ${supportTemplates.length}`);

  console.log('\n6. List by Channel (email):');
  const emailTemplates = mgr.list(null, 'email');
  console.log(`   Email templates: ${emailTemplates.length}`);

  console.log('\n7. Create New Template:');
  const newTemplate = mgr.create(
    'Newsletter Signup',
    'sales',
    `Hi {{name}}!

Thanks for subscribing to our newsletter!

You'll receive updates at: {{email}}

Best,
{{company_name}} Team`,
    { channel: 'email' }
  );
  console.log(`   Created: ${newTemplate.name}`);
  console.log(`   Variables: ${newTemplate.variables.join(', ')}`);

  console.log('\n8. Render New Template:');
  const rendered3 = mgr.render(newTemplate.id, {
    name: 'Subscriber',
    email: 'sub@example.com',
    company_name: 'Acme Corp'
  });
  console.log(rendered3);

  console.log('\n9. Search Templates:');
  const results = mgr.search('password');
  console.log(`   Found: ${results.length}`);
  results.forEach(r => console.log(`   - ${r.name}`));

  console.log('\n10. Update Template:');
  const updated = mgr.update(welcome.id, { name: 'Welcome Email (Updated)' });
  console.log(`    Updated: ${updated.name}`);

  console.log('\n11. Get Statistics:');
  const stats = mgr.getStats();
  console.log(`    Total: ${stats.totalTemplates}`);
  console.log(`    Total usage: ${stats.totalUsage}`);
  console.log(`    By category:`, stats.byCategory);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new ResponseTemplateManager();

if (command === 'demo') runDemo();
else if (command === 'list') {
  const [category, channel] = args.slice(1);
  const templates = mgr.list(category || null, channel || null);
  console.log(JSON.stringify(templates, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else if (command === 'render') {
  const [templateId, ...varParts] = args.slice(1);
  if (!templateId) {
    console.log('Usage: node agent-response-template.js render <templateId> <var1=val1> [var2=val2] ...');
    process.exit(1);
  }
  try {
    const variables = {};
    varParts.forEach(vp => {
      const [key, val] = vp.split('=');
      if (key && val) variables[key] = val;
    });
    const result = mgr.render(templateId, variables);
    console.log(result);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
else if (command === 'create') {
  const [name, category, content] = args.slice(1);
  if (!name || !category || !content) {
    console.log('Usage: node agent-response-template.js create <name> <category> <content>');
    process.exit(1);
  }
  try {
    const template = mgr.create(name, category, content);
    console.log(JSON.stringify(template, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
else console.log('Usage: node agent-response-template.js [demo|list|render|create]');
