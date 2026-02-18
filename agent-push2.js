/**
 * Agent Push2 - Enhanced Push Notification Agent
 *
 * Push notification system with device management, segmentation, and delivery tracking.
 *
 * Usage: node agent-push2.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   send        - Send test push
 *   devices     - Show device management
 */

class PushTemplate {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.title = config.title;
    this.body = config.body;
    this.data = config.data || {};
    this.icon = config.icon;
    this.sound = config.sound || 'default';
    this.badge = config.badge;
    this.color = config.color;
  }

  render(data = {}) {
    let title = this.title;
    let body = this.body;

    for (const [key, value] of Object.entries(data)) {
      title = title.replace(new RegExp(`{{${key}}}`, 'g'), value);
      body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }

    return {
      title,
      body,
      data: { ...this.data, ...data },
      icon: this.icon,
      sound: this.sound,
      badge: this.badge,
      color: this.color
    };
  }
}

class Device {
  constructor(config) {
    this.id = config.id;
    this.userId = config.userId;
    this.platform = config.platform; // ios, android, web
    this.token = config.token;
    this.version = config.version;
    this.model = config.model;
    this.language = config.language || 'en';
    this.timezone = config.timezone;
    this.lastActive = Date.now();
    this.notificationsEnabled = true;
    this.createdAt = Date.now();
  }

  isActive() {
    return (Date.now() - this.lastActive) < 30 * 24 * 60 * 60 * 1000; // 30 days
  }
}

class PushNotification {
  constructor(config) {
    this.id = `push-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.title = config.title;
    this.body = config.body;
    this.data = config.data || {};
    this.tokens = Array.isArray(config.tokens) ? config.tokens : [config.tokens];
    this.platform = config.platform; // all, ios, android, web
    this.priority = config.priority || 'normal';
    this.ttl = config.ttl || 3600; // seconds
    this.status = 'pending';
    this.sentAt = null;
    this.deliveredAt = null;
    this.clickedAt = null;
    this.error = null;
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

  markClicked() {
    this.clickedAt = Date.now();
  }

  markFailed(error) {
    this.status = 'failed';
    this.error = error;
  }
}

class PushAgent {
  constructor(config = {}) {
    this.templates = new Map();
    this.devices = new Map();
    this.notifications = new Map();
    this.stats = {
      pending: 0,
      sent: 0,
      delivered: 0,
      clicked: 0,
      failed: 0
    };

    // FCM/APNS config
    this.config = {
      fcmKey: config.fcmKey || 'fcm-default-key',
      apnsCert: config.apnsCert || 'apns-default-cert',
      apnsKey: config.apnsKey || 'apns-default-key'
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

  registerDevice(device) {
    this.devices.set(device.id, device);
    console.log(`   Registered device: ${device.id} (${device.platform})`);
    return device;
  }

  getDevice(id) {
    return this.devices.get(id);
  }

  getUserDevices(userId) {
    return Array.from(this.devices.values())
      .filter(d => d.userId === userId);
  }

  updateDeviceToken(deviceId, newToken) {
    const device = this.devices.get(deviceId);
    if (device) {
      device.token = newToken;
      console.log(`   Updated token for device: ${deviceId}`);
    }
    return device;
  }

  unregisterDevice(deviceId) {
    if (this.devices.delete(deviceId)) {
      console.log(`   Unregistered device: ${deviceId}`);
      return { success: true };
    }
    return { success: false, reason: 'Device not found' };
  }

  async send(options) {
    const notification = options instanceof PushNotification ? options : new PushNotification(options);
    this.notifications.set(notification.id, notification);
    this.stats.pending++;

    // Send to FCM/APNS (simulated)
    try {
      if (options.platform === 'ios' || options.platform === 'android') {
        await this._sendToProvider(notification);
      } else {
        // Send to all tokens
        for (const token of notification.tokens) {
          await this._sendToToken(token, notification);
        }
      }

      notification.markSent();
      this.stats.sent++;

      console.log(`   Push sent: ${notification.title}`);
      console.log(`   Tokens: ${notification.tokens.length}`);

      return { success: true, notificationId: notification.id };
    } catch (error) {
      this.stats.failed++;
      notification.markFailed(error.message);
      console.log(`   Failed to send: ${error.message}`);
      return { success: false, reason: error.message };
    }
  }

  async _sendToProvider(notification) {
    console.log(`   [Provider] Sending ${notification.platform} push notification`);
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  async _sendToToken(token, notification) {
    console.log(`   [Push] To token: ${token.substring(0, 10)}...`);
  }

  async sendToUser(userId, options) {
    const userDevices = this.getUserDevices(userId);
    if (userDevices.length === 0) {
      return { success: false, reason: 'No devices found for user' };
    }

    const tokens = userDevices.map(d => d.token);
    return this.send({
      ...options,
      tokens
    });
  }

  async sendTemplate(userId, templateId, data = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    const content = template.render(data);
    return this.sendToUser(userId, {
      title: content.title,
      body: content.body,
      data: content.data
    });
  }

  async sendSegment(segment, options) {
    const segmentDevices = Array.from(this.devices.values())
      .filter(d => this._matchesSegment(d, segment));

    const tokens = segmentDevices.map(d => d.token);
    return this.send({
      ...options,
      tokens
    });
  }

  _matchesSegment(device, segment) {
    if (segment.platform && device.platform !== segment.platform) return false;
    if (segment.language && device.language !== segment.language) return false;
    return true;
  }

  trackDelivery(notificationId) {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.markDelivered();
      this.stats.delivered++;
      console.log(`   Notification delivered: ${notificationId}`);
    }
    return notification;
  }

  trackClick(notificationId) {
    const notification = this.notifications.get(notificationId);
    if (notification) {
      notification.markClicked();
      this.stats.clicked++;
    }
    return notification;
  }

  getStats() {
    return {
      ...this.stats,
      total: this.notifications.size,
      templates: this.templates.size,
      devices: this.devices.size
    };
  }

  getUserStats(userId) {
    const devices = this.getUserDevices(userId);
    return {
      devices: devices.length,
      activeDevices: devices.filter(d => d.isActive()).length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new PushAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Push2 Demo\n');

    // 1. Device Registration
    console.log('1. Device Registration:');
    agent.registerDevice(new Device({
      id: 'device-001',
      userId: 'user-123',
      platform: 'ios',
      token: 'ios-token-abc123',
      model: 'iPhone 14',
      language: 'en'
    }));

    agent.registerDevice(new Device({
      id: 'device-002',
      userId: 'user-123',
      platform: 'android',
      token: 'android-token-xyz789',
      model: 'Pixel 7',
      language: 'en'
    }));

    agent.registerDevice(new Device({
      id: 'device-003',
      userId: 'user-456',
      platform: 'ios',
      token: 'ios-token-def456',
      model: 'iPhone 13',
      language: 'zh'
    }));

    console.log(`   Total devices: ${agent.devices.size}`);

    // 2. Templates
    console.log('\n2. Push Templates:');
    agent.addTemplate(new PushTemplate({
      id: 'new-message',
      name: 'New Message',
      title: 'New Message',
      body: 'You have a new message from {{sender}}',
      data: { type: 'message', conversationId: '{{conversationId}}' },
      sound: 'default'
    }));

    agent.addTemplate(new PushTemplate({
      id: 'order-update',
      name: 'Order Update',
      title: 'Order {{orderId}}',
      body: 'Your order status: {{status}}',
      data: { type: 'order' },
      sound: 'default'
    }));

    agent.addTemplate(new PushTemplate({
      id: 'promotion',
      name: 'Promotion',
      title: 'Special Offer!',
      body: '{{message}}',
      data: { type: 'promotion' },
      sound: 'default'
    }));

    console.log(`   Total templates: ${agent.templates.size}`);

    // 3. Send to single token
    console.log('\n3. Send Push Notification:');
    const result1 = await agent.send({
      title: 'Hello',
      body: 'This is a push notification',
      tokens: ['token-123']
    });
    console.log(`   Status: ${result1.success ? 'success' : 'failed'}`);

    // 4. Send to user
    console.log('\n4. Send to User:');
    const result2 = await agent.sendToUser('user-123', {
      title: 'New Message',
      body: 'You have a new message from John'
    });
    console.log(`   Status: ${result2.success ? 'success' : 'failed'}`);

    // 5. Send with template
    console.log('\n5. Send with Template:');
    const result3 = await agent.sendTemplate('user-123', 'new-message', {
      sender: 'Alice',
      conversationId: 'conv-789'
    });
    console.log(`   Status: ${result3.success ? 'success' : 'failed'}`);

    // 6. Segment send
    console.log('\n6. Send to Segment:');
    const result4 = await agent.sendSegment(
      { platform: 'ios' },
      { title: 'iOS Update', body: 'Update available!' }
    );
    console.log(`   Status: ${result4.success ? 'success' : 'failed'}`);

    // 7. Delivery tracking
    console.log('\n7. Delivery Tracking:');
    agent.trackDelivery(result1.notificationId);
    console.log(`   Tracked delivery for: ${result1.notificationId.substring(0, 20)}...`);

    // 8. Click tracking
    console.log('\n8. Click Tracking:');
    agent.trackClick(result1.notificationId);
    console.log(`   Tracked click for: ${result1.notificationId.substring(0, 20)}...`);

    // 9. Device management
    console.log('\n9. Device Management:');
    const userDevices = agent.getUserDevices('user-123');
    console.log(`   User devices: ${userDevices.length}`);
    const activeDevices = userDevices.filter(d => d.isActive()).length;
    console.log(`   Active devices: ${activeDevices}`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = agent.getStats();
    console.log(`   Pending: ${stats.pending}`);
    console.log(`   Sent: ${stats.sent}`);
    console.log(`   Delivered: ${stats.delivered}`);
    console.log(`   Clicked: ${stats.clicked}`);
    console.log(`   Failed: ${stats.failed}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'send':
    console.log('Sending test push...');
    const result = await agent.send({
      title: 'Test Push',
      body: 'This is a test push notification',
      tokens: ['test-token']
    });
    console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
    break;

  case 'devices':
    console.log('Registered Devices:');
    for (const [id, device] of agent.devices) {
      console.log(`  - ${id}: ${device.platform} (${device.userId})`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-push2.js [demo|send|devices]');
}
