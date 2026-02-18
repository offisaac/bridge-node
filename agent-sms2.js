/**
 * Agent SMS2 - Enhanced SMS Notification Agent
 *
 * SMS notification system with templates, delivery tracking, and multi-provider support.
 *
 * Usage: node agent-sms2.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   send        - Send test SMS
 *   templates   - Show template management
 */

class SMSTemplate {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.body = config.body;
    this.variables = config.variables || [];
  }

  render(data = {}) {
    let body = this.body;
    for (const [key, value] of Object.entries(data)) {
      body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return { body };
  }
}

class SMS {
  constructor(config) {
    this.id = `sms-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.from = config.from;
    this.to = config.to;
    this.body = config.body;
    this.type = config.type || 'text';
    this.status = 'queued';
    this.sentAt = null;
    this.deliveredAt = null;
    this.errorCode = null;
    this.errorMessage = null;
    this.metadata = config.metadata || {};
    this.createdAt = Date.now();
  }

  markSent() {
    this.status = 'sent';
    this.sentAt = Date.now();
  }

  markDelivered() {
    this.status = 'delivered';
    this.deliveredAt = Date.now();
  }

  markFailed(code, message) {
    this.status = 'failed';
    this.errorCode = code;
    this.errorMessage = message;
  }
}

class SMSProvider {
  constructor(config) {
    this.name = config.name;
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.from = config.from;
    this.enabled = config.enabled !== false;
  }

  async send(sms) {
    console.log(`   [${this.name}] Sending SMS to ${sms.to}`);
    console.log(`   [${this.name}] Body: ${sms.body.substring(0, 50)}...`);
    return { success: true, messageId: sms.id };
  }
}

class SMSAgent {
  constructor(config = {}) {
    this.providers = new Map();
    this.currentProvider = null;
    this.templates = new Map();
    this.smsMessages = new Map();
    this.stats = {
      queued: 0,
      sent: 0,
      delivered: 0,
      failed: 0
    };

    // Add default provider
    this.addProvider(new SMSProvider({
      name: 'twilio',
      apiKey: config.apiKey || 'default-key',
      from: config.from || '+15551234567'
    }));
  }

  addProvider(provider) {
    this.providers.set(provider.name, provider);
    if (!this.currentProvider) {
      this.currentProvider = provider.name;
    }
    console.log(`   Added provider: ${provider.name}`);
  }

  setProvider(name) {
    if (this.providers.has(name)) {
      this.currentProvider = name;
      console.log(`   Switched to provider: ${name}`);
    }
  }

  addTemplate(template) {
    this.templates.set(template.id, template);
    console.log(`   Added template: ${template.name}`);
    return template;
  }

  getTemplate(id) {
    return this.templates.get(id);
  }

  async send(options) {
    const sms = options instanceof SMS ? options : new SMS(options);
    this.smsMessages.set(sms.id, sms);
    this.stats.queued++;

    // Validate phone number
    if (!sms.to || !this._validatePhoneNumber(sms.to)) {
      this.stats.failed++;
      sms.markFailed('INVALID_NUMBER', 'Invalid phone number format');
      return { success: false, reason: 'Invalid phone number' };
    }

    // Send via provider
    try {
      const provider = this.providers.get(this.currentProvider);
      await provider.send(sms);
      sms.markSent();
      this.stats.sent++;

      console.log(`   SMS sent: ${sms.id.substring(0, 20)}...`);

      return { success: true, smsId: sms.id };
    } catch (error) {
      this.stats.failed++;
      sms.markFailed('PROVIDER_ERROR', error.message);
      console.log(`   Failed to send: ${error.message}`);
      return { success: false, reason: error.message };
    }
  }

  _validatePhoneNumber(phone) {
    // Basic validation: starts with + and has digits
    return /^\+\d{10,15}$/.test(phone);
  }

  async sendTemplate(phoneNumber, templateId, data = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const content = template.render(data);
    return this.send({
      from: this.providers.get(this.currentProvider)?.from,
      to: phoneNumber,
      body: content.body,
      metadata: data
    });
  }

  async sendBatch(phoneNumbers, options) {
    const results = [];
    for (const phone of phoneNumbers) {
      const result = await this.send({
        ...options,
        to: phone
      });
      results.push({ phone, ...result });
    }
    return results;
  }

  getSMS(id) {
    return this.smsMessages.get(id);
  }

  getSMSByPhone(phone) {
    return Array.from(this.smsMessages.values())
      .filter(s => s.to === phone)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  trackDelivery(smsId) {
    const sms = this.smsMessages.get(smsId);
    if (sms) {
      sms.markDelivered();
      this.stats.delivered++;
      console.log(`   SMS delivered: ${smsId}`);
    }
    return sms;
  }

  getStats() {
    return {
      ...this.stats,
      total: this.smsMessages.size,
      templates: this.templates.size,
      providers: this.providers.size,
      currentProvider: this.currentProvider
    };
  }

  getPhoneStats(phone) {
    const messages = this.getSMSByPhone(phone);
    return {
      total: messages.length,
      sent: messages.filter(m => m.status === 'sent').length,
      delivered: messages.filter(m => m.status === 'delivered').length,
      failed: messages.filter(m => m.status === 'failed').length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new SMSAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent SMS2 Demo\n');

    // 1. Providers
    console.log('1. SMS Providers:');
    agent.addProvider(new SMSProvider({
      name: 'nexmo',
      apiKey: 'nexmo-key',
      from: '+15559876543'
    }));
    agent.addProvider(new SMSProvider({
      name: 'aws-sns',
      apiKey: 'aws-key',
      from: '+15551112222'
    }));
    console.log(`   Total providers: ${agent.providers.size}`);

    // 2. Switch provider
    console.log('\n2. Provider Management:');
    agent.setProvider('twilio');
    console.log(`   Current: ${agent.currentProvider}`);

    // 3. Templates
    console.log('\n3. SMS Templates:');
    agent.addTemplate(new SMSTemplate({
      id: 'verification',
      name: 'Verification Code',
      body: 'Your verification code is: {{code}}'
    }));

    agent.addTemplate(new SMSTemplate({
      id: 'appointment',
      name: 'Appointment Reminder',
      body: 'Reminder: Your appointment is on {{date}} at {{time}}'
    }));

    agent.addTemplate(new SMSTemplate({
      id: 'promo',
      name: 'Promotional',
      body: 'Hi {{name}}! {{message}}'
    }));

    console.log(`   Total templates: ${agent.templates.size}`);

    // 4. Send single SMS
    console.log('\n4. Send Single SMS:');
    const result1 = await agent.send({
      from: '+15551234567',
      to: '+15551234567',
      body: 'Hello from SMS2 agent!'
    });
    console.log(`   Status: ${result1.success ? 'success' : 'failed'}`);

    // 5. Send with template
    console.log('\n5. Send with Template:');
    const result2 = await agent.sendTemplate('+15559876543', 'verification', { code: '123456' });
    console.log(`   Status: ${result2.success ? 'success' : 'failed'}`);

    // 6. Batch send
    console.log('\n6. Batch Send:');
    const recipients = ['+15551111111', '+15552222222', '+15553333333'];
    const batchResults = await agent.sendBatch(recipients, {
      body: 'Testing batch SMS'
    });
    console.log(`   Sent: ${batchResults.filter(r => r.success).length}/${recipients.length}`);

    // 7. Delivery tracking
    console.log('\n7. Delivery Tracking:');
    agent.trackDelivery(result1.smsId);
    console.log(`   Tracked delivery for: ${result1.smsId.substring(0, 20)}...`);

    // 8. Phone stats
    console.log('\n8. Phone Statistics:');
    const phoneStats = agent.getPhoneStats('+15551234567');
    console.log(`   Total: ${phoneStats.total}`);
    console.log(`   Delivered: ${phoneStats.delivered}`);

    // 9. Validation
    console.log('\n9. Phone Validation:');
    const validPhones = ['+15551234567', '+15559876543', '+1234567890'];
    const invalidPhones = ['123456', 'abc', '+123'];
    validPhones.forEach(p => console.log(`   ${p}: ${agent._validatePhoneNumber(p) ? 'valid' : 'invalid'}`));

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = agent.getStats();
    console.log(`   Queued: ${stats.queued}`);
    console.log(`   Sent: ${stats.sent}`);
    console.log(`   Delivered: ${stats.delivered}`);
    console.log(`   Failed: ${stats.failed}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'send':
    console.log('Sending test SMS...');
    const result = await agent.send({
      from: '+15551234567',
      to: '+15551234567',
      body: 'Test message from SMS2 agent'
    });
    console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
    break;

  case 'templates':
    console.log('SMS Templates:');
    for (const [id, template] of agent.templates) {
      console.log(`  - ${template.name} (${id})`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-sms2.js [demo|send|templates]');
}
