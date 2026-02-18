/**
 * Agent Notification 2 Module
 *
 * Provides notification system with templates, preferences, and delivery tracking.
 * Usage: node agent-notification-2.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   send <user> <message>  Send notification
 *   status                 Show notification stats
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname + '/data';
const NOTIF_DB = DATA_DIR + '/notifications-2.json';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
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
 * Notification Type
 */
const NotificationType = {
  INFO: 'info',
  SUCCESS: 'success',
  WARNING: 'warning',
  ERROR: 'error',
  MESSAGE: 'message',
  ALERT: 'alert'
};

/**
 * Delivery Status
 */
const DeliveryStatus = {
  PENDING: 'pending',
  SENT: 'sent',
  DELIVERED: 'delivered',
  FAILED: 'failed',
  READ: 'read'
};

/**
 * Notification Template
 */
class NotificationTemplate {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type || NotificationType.INFO;
    this.subject = config.subject || '';
    this.body = config.body || '';
    this.variables = config.variables || [];
    this.priority = config.priority || 'normal';
  }

  render(data = {}) {
    let content = this.body;
    for (const [key, value] of Object.entries(data)) {
      content = content.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return {
      subject: this.subject,
      body: content,
      type: this.type,
      priority: this.priority
    };
  }
}

/**
 * Notification Channel
 */
class NotificationChannel {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.enabled = config.enabled !== false;
    this.rateLimit = config.rateLimit || 100; // per minute
    this.lastSent = null;
    this.sentCount = 0;
  }

  async send(notification) {
    if (!this.enabled) {
      return { success: false, reason: 'Channel disabled' };
    }

    // Rate limiting
    const now = Date.now();
    if (this.lastSent && now - this.lastSent < 60000) {
      if (this.sentCount >= this.rateLimit) {
        return { success: false, reason: 'Rate limit exceeded' };
      }
      this.sentCount++;
    } else {
      this.sentCount = 1;
    }
    this.lastSent = now;

    return await this._send(notification);
  }

  async _send(notification) {
    console.log(`   [${this.name}] Sent: ${notification.subject}`);
    return { success: true, channel: this.type };
  }
}

class EmailChannel extends NotificationChannel {
  async _send(notification) {
    console.log(`   [Email] To: ${notification.recipient}`);
    console.log(`   [Email] Subject: ${notification.subject}`);
    return { success: true, channel: 'email' };
  }
}

class SMSChannel extends NotificationChannel {
  async _send(notification) {
    console.log(`   [SMS] To: ${notification.recipient}`);
    console.log(`   [SMS] Message: ${notification.body.substring(0, 50)}...`);
    return { success: true, channel: 'sms' };
  }
}

class PushChannel extends NotificationChannel {
  async _send(notification) {
    console.log(`   [Push] To: ${notification.recipient}`);
    console.log(`   [Push] Title: ${notification.subject}`);
    return { success: true, channel: 'push' };
  }
}

class InAppChannel extends NotificationChannel {
  constructor(config) {
    super(config);
    this.notifications = [];
  }

  async _send(notification) {
    this.notifications.push(notification);
    console.log(`   [In-App] User: ${notification.recipient}`);
    return { success: true, channel: 'in-app' };
  }

  getNotifications(userId) {
    return this.notifications.filter(n => n.recipient === userId);
  }
}

/**
 * User Preferences
 */
class UserPreferences {
  constructor(userId) {
    this.userId = userId;
    this.channels = {
      email: true,
      sms: false,
      push: true,
      inApp: true
    };
    this.quietHours = {
      enabled: false,
      start: 22,
      end: 8
    };
    this.dnd = false;
    this.priorityOnly = false;
  }

  isChannelEnabled(channel) {
    return this.channels[channel] && !this.dnd;
  }

  shouldNotify() {
    if (this.dnd) return false;
    if (!this.quietHours.enabled) return true;

    const now = new Date();
    const hour = now.getHours();
    const start = this.quietHours.start;
    const end = this.quietHours.end;

    if (start > end) {
      return hour < start && hour >= end;
    }
    return hour >= start && hour < end;
  }

  toJSON() {
    return {
      userId: this.userId,
      channels: this.channels,
      quietHours: this.quietHours,
      dnd: this.dnd,
      priorityOnly: this.priorityOnly
    };
  }
}

/**
 * Notification
 */
class Notification {
  constructor(config) {
    this.id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.recipient = config.recipient;
    this.sender = config.sender || 'system';
    this.type = config.type || NotificationType.INFO;
    this.subject = config.subject;
    this.body = config.body;
    this.channel = config.channel || 'in-app';
    this.priority = config.priority || 'normal';
    this.status = DeliveryStatus.PENDING;
    this.metadata = config.metadata || {};
    this.createdAt = Date.now();
    this.sentAt = null;
    this.deliveredAt = null;
    this.readAt = null;
  }

  markSent() {
    this.status = DeliveryStatus.SENT;
    this.sentAt = Date.now();
  }

  markDelivered() {
    this.status = DeliveryStatus.DELIVERED;
    this.deliveredAt = Date.now();
  }

  markRead() {
    this.status = DeliveryStatus.READ;
    this.readAt = Date.now();
  }

  markFailed(error) {
    this.status = DeliveryStatus.FAILED;
    this.error = error;
  }

  toJSON() {
    return {
      id: this.id,
      recipient: this.recipient,
      sender: this.sender,
      type: this.type,
      subject: this.subject,
      channel: this.channel,
      priority: this.priority,
      status: this.status,
      createdAt: this.createdAt,
      sentAt: this.sentAt,
      deliveredAt: this.deliveredAt,
      readAt: this.readAt
    };
  }
}

/**
 * Notification Manager
 */
class NotificationManager {
  constructor() {
    this.templates = new Map();
    this.channels = new Map();
    this.preferences = new Map();
    this.notifications = new Map();
    this.stats = {
      created: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0
    };

    // Add default channels
    this.addChannel(new InAppChannel({ id: 'in-app', name: 'In-App', type: 'in-app' }));
    this.addChannel(new EmailChannel({ id: 'email', name: 'Email', type: 'email' }));
    this.addChannel(new PushChannel({ id: 'push', name: 'Push', type: 'push' }));
  }

  addTemplate(template) {
    this.templates.set(template.id, template);
  }

  getTemplate(id) {
    return this.templates.get(id);
  }

  addChannel(channel) {
    this.channels.set(channel.id, channel);
  }

  getChannel(id) {
    return this.channels.get(id);
  }

  setUserPreferences(userId, prefs) {
    const preferences = new UserPreferences(userId);
    Object.assign(preferences.channels, prefs.channels || {});
    Object.assign(preferences.quietHours, prefs.quietHours || {});
    if (prefs.dnd !== undefined) preferences.dnd = prefs.dnd;
    if (prefs.priorityOnly !== undefined) preferences.priorityOnly = prefs.priorityOnly;
    this.preferences.set(userId, preferences);
    return preferences;
  }

  getUserPreferences(userId) {
    return this.preferences.get(userId) || new UserPreferences(userId);
  }

  async send(notification) {
    const notif = notification instanceof Notification ? notification : new Notification(notification);
    this.notifications.set(notif.id, notif);
    this.stats.created++;

    // Check user preferences
    const prefs = this.getUserPreferences(notif.recipient);
    if (!prefs.isChannelEnabled(notif.channel)) {
      notif.markFailed('Channel disabled in preferences');
      this.stats.failed++;
      return notif;
    }

    if (!prefs.shouldNotify() && notif.priority !== 'high') {
      notif.markFailed('Quiet hours');
      this.stats.failed++;
      return notif;
    }

    // Send via channel
    const channel = this.channels.get(notif.channel);
    if (!channel) {
      notif.markFailed('Channel not found');
      this.stats.failed++;
      return notif;
    }

    const result = await channel.send(notif);
    if (result.success) {
      notif.markSent();
      this.stats.sent++;
    } else {
      notif.markFailed(result.reason || result.error);
      this.stats.failed++;
    }

    return notif;
  }

  async sendTemplate(recipient, templateId, data = {}, options = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const content = template.render(data);
    return this.send({
      recipient,
      subject: content.subject,
      body: content.body,
      type: content.type,
      priority: content.priority,
      channel: options.channel || 'in-app',
      metadata: data
    });
  }

  getNotification(id) {
    return this.notifications.get(id);
  }

  getUserNotifications(userId, options = {}) {
    let results = Array.from(this.notifications.values())
      .filter(n => n.recipient === userId);

    if (options.status) {
      results = results.filter(n => n.status === options.status);
    }

    if (options.unread) {
      results = results.filter(n => n.status !== DeliveryStatus.READ);
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  markAsRead(notifId) {
    const notif = this.notifications.get(notifId);
    if (notif) {
      notif.markRead();
      this.stats.read++;
    }
    return notif;
  }

  getStats() {
    return {
      ...this.stats,
      total: this.notifications.size,
      templates: this.templates.size,
      channels: this.channels.size,
      users: this.preferences.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Notification 2 Demo\n');

  const manager = new NotificationManager();

  // Templates
  console.log('1. Notification Templates:');

  manager.addTemplate(new NotificationTemplate({
    id: 'welcome',
    name: 'Welcome',
    type: NotificationType.SUCCESS,
    subject: 'Welcome {{name}}!',
    body: 'Hello {{name}}, welcome to our platform!'
  }));

  manager.addTemplate(new NotificationTemplate({
    id: 'alert',
    name: 'System Alert',
    type: NotificationType.ERROR,
    subject: 'Alert: {{title}}',
    body: 'System alert: {{message}}'
  }));

  manager.addTemplate(new NotificationTemplate({
    id: 'reminder',
    name: 'Reminder',
    type: NotificationType.INFO,
    subject: 'Reminder: {{title}}',
    body: 'You have a reminder: {{message}}'
  }));

  console.log(`   Added ${manager.templates.size} templates`);

  // Send notifications
  console.log('\n2. Sending Notifications:');

  const notif1 = await manager.send({
    recipient: 'user@example.com',
    subject: 'Test Notification',
    body: 'This is a test notification',
    type: NotificationType.INFO,
    channel: 'in-app'
  });
  console.log(`   Created: ${notif1.id.substring(0, 30)}...`);

  // User preferences
  console.log('\n3. User Preferences:');

  manager.setUserPreferences('user@example.com', {
    channels: { email: true, push: true },
    quietHours: { enabled: true, start: 22, end: 8 },
    dnd: false
  });

  const prefs = manager.getUserPreferences('user@example.com');
  console.log(`   Email: ${prefs.channels.email}`);
  console.log(`   Push: ${prefs.channels.push}`);
  console.log(`   Quiet hours: ${prefs.quietHours.enabled ? 'enabled' : 'disabled'}`);

  // Template rendering
  console.log('\n4. Template Rendering:');

  const welcomeNotif = await manager.sendTemplate(
    'newuser@example.com',
    'welcome',
    { name: 'John' },
    { channel: 'email' }
  );
  console.log(`   Welcome notification sent to: ${welcomeNotif.recipient}`);

  const alertNotif = await manager.sendTemplate(
    'admin@example.com',
    'alert',
    { title: 'High CPU', message: 'CPU usage at 95%' }
  );
  console.log(`   Alert notification sent to: ${alertNotif.recipient}`);

  // Delivery tracking
  console.log('\n5. Delivery Tracking:');

  const allNotifs = Array.from(manager.notifications.values());
  console.log(`   Total notifications: ${allNotifs.length}`);

  const unread = allNotifs.filter(n => n.status !== DeliveryStatus.READ);
  console.log(`   Unread: ${unread.length}`);

  // Mark as read
  console.log('\n6. Mark as Read:');
  if (allNotifs.length > 0) {
    const firstNotif = allNotifs[0];
    manager.markAsRead(firstNotif.id);
    console.log(`   Marked ${firstNotif.id.substring(0, 20)} as read`);
  }

  // Get user notifications
  console.log('\n7. User Inbox:');
  const userNotifs = manager.getUserNotifications('user@example.com');
  console.log(`   User notifications: ${userNotifs.length}`);

  // Stats
  console.log('\n8. Statistics:');
  const stats = manager.getStats();
  console.log(`   Created: ${stats.created}`);
  console.log(`   Sent: ${stats.sent}`);
  console.log(`   Delivered: ${stats.delivered}`);
  console.log(`   Read: ${stats.read}`);
  console.log(`   Failed: ${stats.failed}`);

  // Channels
  console.log('\n9. Channels:');
  for (const [id, channel] of manager.channels) {
    console.log(`   - ${channel.name}: ${channel.enabled ? 'enabled' : 'disabled'}`);
  }

  // Priority notification
  console.log('\n10. Priority Notification (bypass quiet hours):');
  const urgentNotif = await manager.send({
    recipient: 'user@example.com',
    subject: 'URGENT: System Down',
    body: 'Critical system failure',
    priority: 'high',
    channel: 'push'
  });
  console.log(`   Status: ${urgentNotif.status}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'send') {
  const manager = new NotificationManager();
  const recipient = args[1] || 'user@example.com';
  const message = args[2] || 'Test message';
  manager.send({
    recipient,
    subject: 'CLI Notification',
    body: message,
    channel: 'in-app'
  }).then(n => console.log(`Sent: ${n.id}`));
} else if (cmd === 'status') {
  const manager = new NotificationManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Notification 2 Module');
  console.log('Usage: node agent-notification-2.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  send <user> <msg>  Send notification');
  console.log('  status             Show stats');
}
