/**
 * Agent Email2 - Enhanced Email Notification Agent
 *
 * Email notification system with templates, tracking, and SMTP integration.
 *
 * Usage: node agent-email2.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   send        - Send test email
 *   templates   - Show template management
 */

class EmailTemplate {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.subject = config.subject;
    this.body = config.body;
    this.html = config.html;
    this.from = config.from || 'noreply@example.com';
    this.replyTo = config.replyTo;
    this.attachments = config.attachments || [];
  }

  render(data = {}) {
    let subject = this.subject;
    let body = this.body;
    let html = this.html;

    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
      if (html) html = html.replace(regex, value);
    }

    return { subject, body, html, from: this.from, replyTo: this.replyTo };
  }
}

class EmailAddress {
  constructor(email, name = '') {
    this.email = email;
    this.name = name;
  }

  toString() {
    return this.name ? `"${this.name}" <${this.email}>` : this.email;
  }
}

class EmailAttachment {
  constructor(config) {
    this.filename = config.filename;
    this.content = config.content;
    this.contentType = config.contentType || 'application/octet-stream';
    this.inline = config.inline || false;
    this.cid = config.cid;
  }
}

class Email {
  constructor(config) {
    this.id = `email-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.from = config.from;
    this.to = Array.isArray(config.to) ? config.to : [config.to];
    this.cc = config.cc || [];
    this.bcc = config.bcc || [];
    this.replyTo = config.replyTo;
    this.subject = config.subject;
    this.body = config.body;
    this.html = config.html;
    this.attachments = config.attachments || [];
    this.headers = config.headers || {};
    this.priority = config.priority || 'normal';
    this.status = 'queued';
    this.sentAt = null;
    this.deliveredAt = null;
    this.openedAt = null;
    this.clickedAt = null;
    this.bouncedAt = null;
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

  markOpened() {
    this.status = 'opened';
    this.openedAt = Date.now();
  }

  markClicked() {
    this.clickedAt = Date.now();
  }

  markBounced(type = 'hard') {
    this.status = 'bounced';
    this.bouncedAt = Date.now();
    this.bounceType = type;
  }
}

class SMTPConfig {
  constructor(config) {
    this.host = config.host || 'smtp.example.com';
    this.port = config.port || 587;
    this.secure = config.secure || false;
    this.username = config.username;
    this.password = config.password;
    this.from = config.from || 'noreply@example.com';
    this.tls = config.tls || { rejectUnauthorized: true };
    this.maxConnections = config.maxConnections || 5;
    this.rateLimit = config.rateLimit || 100; // per minute
  }
}

class EmailAgent {
  constructor(config = {}) {
    this.smtp = config.smtp ? new SMTPConfig(config.smtp) : new SMTPConfig({});
    this.templates = new Map();
    this.emails = new Map();
    this.stats = {
      queued: 0,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      failed: 0
    };
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
    const email = options instanceof Email ? options : new Email(options);
    this.emails.set(email.id, email);
    this.stats.queued++;

    // Validate recipients
    if (!email.to || email.to.length === 0) {
      this.stats.failed++;
      email.status = 'failed';
      return { success: false, reason: 'No recipients' };
    }

    // Send via SMTP (simulated)
    try {
      await this._sendViaSMTP(email);
      email.markSent();
      this.stats.sent++;

      console.log(`   Sent email: ${email.subject}`);
      console.log(`   To: ${email.to.map(t => t.toString()).join(', ')}`);

      return { success: true, emailId: email.id };
    } catch (error) {
      this.stats.failed++;
      email.status = 'failed';
      console.log(`   Failed to send: ${error.message}`);
      return { success: false, reason: error.message };
    }
  }

  async _sendViaSMTP(email) {
    // Simulate SMTP sending
    console.log(`   [SMTP] Connecting to ${this.smtp.host}:${this.smtp.port}`);
    console.log(`   [SMTP] From: ${email.from}`);
    console.log(`   [SMTP] Subject: ${email.subject}`);

    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 10));

    return { messageId: email.id };
  }

  async sendTemplate(recipient, templateId, data = {}, options = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const content = template.render(data);
    return this.send({
      from: options.from || this.smtp.from,
      to: recipient,
      subject: content.subject,
      body: content.body,
      html: content.html,
      replyTo: content.replyTo,
      metadata: data
    });
  }

  async sendBatch(recipients, options) {
    const results = [];
    for (const recipient of recipients) {
      const result = await this.send({
        ...options,
        to: recipient
      });
      results.push({ recipient, ...result });
    }
    return results;
  }

  async sendBulk(recipients, templateId, data = {}, options = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const results = [];
    for (const recipient of recipients) {
      const result = await this.sendTemplate(recipient, templateId, { ...data, recipient }, options);
      results.push({ recipient, ...result });
    }
    return results;
  }

  getEmail(id) {
    return this.emails.get(id);
  }

  getEmailByRecipient(email, recipient) {
    return Array.from(this.emails.values())
      .filter(e => e.to.some(t => t.email === recipient))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  trackOpen(emailId) {
    const email = this.emails.get(emailId);
    if (email) {
      email.markOpened();
      this.stats.opened++;
      console.log(`   Email opened: ${emailId}`);
    }
    return email;
  }

  trackClick(emailId) {
    const email = this.emails.get(emailId);
    if (email) {
      email.markClicked();
      this.stats.clicked++;
    }
    return email;
  }

  trackBounce(emailId, type = 'hard') {
    const email = this.emails.get(emailId);
    if (email) {
      email.markBounced(type);
      this.stats.bounced++;
    }
    return email;
  }

  getStats() {
    return {
      ...this.stats,
      total: this.emails.size,
      templates: this.templates.size
    };
  }

  getRecipientStats(recipient) {
    const emails = this.getEmailByRecipient(null, recipient);
    return {
      total: emails.length,
      sent: emails.filter(e => e.status === 'sent').length,
      opened: emails.filter(e => e.status === 'opened').length,
      clicked: emails.filter(e => e.clickedAt).length,
      bounced: emails.filter(e => e.status === 'bounced').length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new EmailAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Email2 Demo\n');

    // 1. SMTP Configuration
    console.log('1. SMTP Configuration:');
    console.log(`   Host: ${agent.smtp.host}`);
    console.log(`   Port: ${agent.smtp.port}`);
    console.log(`   From: ${agent.smtp.from}`);

    // 2. Templates
    console.log('\n2. Email Templates:');
    agent.addTemplate(new EmailTemplate({
      id: 'welcome',
      name: 'Welcome Email',
      subject: 'Welcome to {{company}}!',
      body: 'Hello {{name}}, welcome to our platform!',
      html: '<h1>Welcome!</h1><p>Hello {{name}}, welcome to {{company}}!</p>'
    }));

    agent.addTemplate(new EmailTemplate({
      id: 'password-reset',
      name: 'Password Reset',
      subject: 'Reset your password',
      body: 'Click here to reset: {{link}}',
      html: '<p>Click <a href="{{link}}">here</a> to reset your password.</p>'
    }));

    agent.addTemplate(new EmailTemplate({
      id: 'invoice',
      name: 'Invoice',
      subject: 'Invoice #{{invoiceNumber}}',
      body: 'Total: ${{total}}\nDue: {{dueDate}}'
    }));

    console.log(`   Total templates: ${agent.templates.size}`);

    // 3. Send single email
    console.log('\n3. Send Single Email:');
    const result1 = await agent.send({
      from: 'noreply@example.com',
      to: new EmailAddress('user@example.com', 'John Doe'),
      subject: 'Test Email',
      body: 'This is a test email',
      html: '<p>This is a <strong>test email</strong></p>'
    });
    console.log(`   Status: ${result1.success ? 'success' : 'failed'}`);

    // 4. Send with template
    console.log('\n4. Send with Template:');
    const result2 = await agent.sendTemplate(
      new EmailAddress('jane@example.com', 'Jane'),
      'welcome',
      { name: 'Jane', company: 'Acme Corp' }
    );
    console.log(`   Status: ${result2.success ? 'success' : 'failed'}`);

    // 5. Batch send
    console.log('\n5. Batch Send:');
    const recipients = [
      new EmailAddress('user1@example.com', 'User 1'),
      new EmailAddress('user2@example.com', 'User 2'),
      new EmailAddress('user3@example.com', 'User 3')
    ];
    const batchResults = await agent.sendBatch(recipients, {
      from: 'noreply@example.com',
      subject: 'Batch Test',
      body: 'Testing batch send'
    });
    console.log(`   Sent: ${batchResults.filter(r => r.success).length}/${recipients.length}`);

    // 6. Bulk send with template
    console.log('\n6. Bulk Send:');
    const bulkRecipients = ['alice@example.com', 'bob@example.com', 'charlie@example.com'];
    const bulkResults = await agent.sendBulk(bulkRecipients, 'welcome', { company: 'TechCorp' });
    console.log(`   Sent: ${bulkResults.filter(r => r.success).length}/${bulkRecipients.length}`);

    // 7. Tracking
    console.log('\n7. Email Tracking:');
    const emailId = result1.emailId;
    agent.trackOpen(emailId);
    agent.trackClick(emailId);
    console.log(`   Tracked open for: ${emailId.substring(0, 20)}...`);

    // 8. Bounce handling
    console.log('\n8. Bounce Handling:');
    const bounceEmail = await agent.send({
      from: 'noreply@example.com',
      to: new EmailAddress('invalid@example.com'),
      subject: 'Test',
      body: 'Test'
    });
    agent.trackBounce(bounceEmail.emailId, 'hard');
    console.log(`   Marked as bounced`);

    // 9. Recipient stats
    console.log('\n9. Recipient Stats:');
    const recipientStats = agent.getRecipientStats('user@example.com');
    console.log(`   Total: ${recipientStats.total}`);
    console.log(`   Opened: ${recipientStats.opened}`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = agent.getStats();
    console.log(`   Queued: ${stats.queued}`);
    console.log(`   Sent: ${stats.sent}`);
    console.log(`   Opened: ${stats.opened}`);
    console.log(`   Clicked: ${stats.clicked}`);
    console.log(`   Bounced: ${stats.bounced}`);
    console.log(`   Failed: ${stats.failed}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'send':
    console.log('Sending test email...');
    const result = await agent.send({
      from: 'noreply@example.com',
      to: new EmailAddress('test@example.com', 'Test User'),
      subject: 'Test Email',
      body: 'This is a test email from Email2 agent'
    });
    console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
    break;

  case 'templates':
    console.log('Email Templates:');
    for (const [id, template] of agent.templates) {
      console.log(`  - ${template.name} (${id})`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-email2.js [demo|send|templates]');
}
