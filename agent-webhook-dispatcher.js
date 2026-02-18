/**
 * Agent Webhook Dispatcher
 * Webhook dispatch and retry system for Universal-Narrator-Core
 */

const crypto = require('crypto');

class AgentWebhookDispatcher {
  constructor(options = {}) {
    this.webhooks = new Map();
    this.deliveries = new Map();
    this.retryQueue = [];

    this.config = {
      maxRetries: options.maxRetries || 5,
      retryDelay: options.retryDelay || 1000, // ms
      retryBackoff: options.retryBackoff || 2, // exponential
      maxRetryDelay: options.maxRetryDelay || 60000,
      timeout: options.timeout || 30000,
      enableSignature: options.enableSignature !== false,
      secretKey: options.secretKey || 'default-secret'
    };

    this.stats = {
      totalDelivered: 0,
      totalFailed: 0,
      totalRetries: 0
    };

    // Initialize default webhooks
    this._initDefaultWebhooks();

    // Start retry processor
    this._startRetryProcessor();
  }

  _initDefaultWebhooks() {
    const defaultWebhooks = [
      { name: 'narrator-events', url: 'https://narrator.example.com/events', event: 'narrator.*', enabled: true },
      { name: 'core-updates', url: 'https://core.example.com/updates', event: 'core.*', enabled: true },
      { name: 'notification', url: 'https://notify.example.com/webhook', event: 'notification.*', enabled: false }
    ];

    defaultWebhooks.forEach(wh => this.registerWebhook(wh));
  }

  _startRetryProcessor() {
    this.retryTimer = setInterval(() => {
      this._processRetryQueue();
    }, this.config.retryDelay);
  }

  _processRetryQueue() {
    const now = Date.now();
    const toRetry = [];

    for (let i = this.retryQueue.length - 1; i >= 0; i--) {
      const item = this.retryQueue[i];
      if (item.nextRetry <= now) {
        toRetry.push(item);
        this.retryQueue.splice(i, 1);
      }
    }

    toRetry.forEach(item => {
      this._deliver(item.webhook, item.payload, item.options, item.attempt + 1);
    });
  }

  registerWebhook(webhookConfig) {
    const { name, url, event, enabled } = webhookConfig;

    const webhook = {
      id: `wh-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      url,
      event: event || '*',
      enabled: enabled !== false,
      secret: webhookConfig.secret || this.config.secretKey,
      headers: webhookConfig.headers || {},
      timeout: webhookConfig.timeout || this.config.timeout,
      createdAt: new Date().toISOString()
    };

    this.webhooks.set(name, webhook);
    console.log(`Webhook registered: ${webhook.name} -> ${webhook.url}`);
    return webhook;
  }

  getWebhook(name) {
    const webhook = this.webhooks.get(name);
    if (!webhook) {
      throw new Error(`Webhook not found: ${name}`);
    }
    return webhook;
  }

  listWebhooks() {
    return Array.from(this.webhooks.values()).map(w => ({
      id: w.id,
      name: w.name,
      url: w.url,
      event: w.event,
      enabled: w.enabled
    }));
  }

  updateWebhook(name, updates) {
    const webhook = this.webhooks.get(name);
    if (!webhook) {
      throw new Error(`Webhook not found: ${name}`);
    }

    Object.assign(webhook, updates);
    console.log(`Webhook updated: ${name}`);
    return webhook;
  }

  deleteWebhook(name) {
    const deleted = this.webhooks.delete(name);
    if (deleted) {
      console.log(`Webhook deleted: ${name}`);
    }
    return deleted;
  }

  dispatch(eventType, payload, options = {}) {
    const matchingWebhooks = Array.from(this.webhooks.values())
      .filter(w => w.enabled && this._matchesEvent(w.event, eventType));

    if (matchingWebhooks.length === 0) {
      console.log(`No webhooks matching event: ${eventType}`);
      return { delivered: 0, failed: 0 };
    }

    let delivered = 0;
    let failed = 0;

    matchingWebhooks.forEach(webhook => {
      const result = this._deliver(webhook, payload, options, 0);
      if (result.success) {
        delivered++;
      } else {
        failed++;
      }
    });

    return { delivered, failed, total: matchingWebhooks.length };
  }

  _matchesEvent(pattern, event) {
    if (pattern === '*' || pattern === event) return true;
    if (pattern.endsWith('.*')) {
      const prefix = pattern.slice(0, -2);
      return event.startsWith(prefix);
    }
    if (pattern.includes('*')) {
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(event);
    }
    return false;
  }

  _deliver(webhook, payload, options, attempt) {
    const delivery = {
      id: `dlv-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      webhookId: webhook.id,
      webhookName: webhook.name,
      event: options.event || 'unknown',
      payload,
      attempt,
      status: 'pending',
      timestamp: new Date().toISOString()
    };

    // Add signature if enabled
    if (this.config.enableSignature) {
      const signature = this._generateSignature(payload, webhook.secret);
      delivery.headers = { ...webhook.headers, 'X-Webhook-Signature': signature };
    }

    // Simulate delivery (in real implementation, would make HTTP request)
    const success = Math.random() > 0.1; // 90% success rate for simulation

    if (success) {
      delivery.status = 'delivered';
      delivery.response = { statusCode: 200, message: 'OK' };
      this.stats.totalDelivered++;
      console.log(`[${webhook.name}] Delivered successfully (attempt ${attempt + 1})`);
    } else {
      delivery.status = 'failed';
      delivery.error = 'Connection timeout';
      this.stats.totalFailed++;

      if (attempt < this.config.maxRetries) {
        // Queue for retry
        const delay = Math.min(
          this.config.retryDelay * Math.pow(this.config.retryBackoff, attempt),
          this.config.maxRetryDelay
        );

        this.retryQueue.push({
          webhook,
          payload,
          options,
          attempt,
          nextRetry: Date.now() + delay,
          maxRetries: this.config.maxRetries
        });

        console.log(`[${webhook.name}] Failed, queued for retry ${attempt + 1}/${this.config.maxRetries} (delay: ${delay}ms)`);
      } else {
        console.log(`[${webhook.name}] Failed after ${attempt + 1} attempts, giving up`);
      }
    }

    this.deliveries.set(delivery.id, delivery);
    return { success, deliveryId: delivery.id };
  }

  _generateSignature(payload, secret) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  verifySignature(payload, signature, secret) {
    const expected = this._generateSignature(payload, secret);
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  }

  getDelivery(deliveryId) {
    return this.deliveries.get(deliveryId);
  }

  listDeliveries(filter) {
    let deliveries = Array.from(this.deliveries.values());

    if (filter) {
      if (filter.webhookName) {
        deliveries = deliveries.filter(d => d.webhookName === filter.webhookName);
      }
      if (filter.status) {
        deliveries = deliveries.filter(d => d.status === filter.status);
      }
      if (filter.event) {
        deliveries = deliveries.filter(d => d.event === filter.event);
      }
    }

    return deliveries;
  }

  retryDelivery(deliveryId) {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) {
      throw new Error(`Delivery not found: ${deliveryId}`);
    }

    const webhook = this.webhooks.get(delivery.webhookName);
    if (!webhook) {
      throw new Error(`Webhook not found: ${delivery.webhookName}`);
    }

    return this._deliver(webhook, delivery.payload, { event: delivery.event }, 0);
  }

  getStatistics() {
    const byStatus = {};
    for (const d of this.deliveries.values()) {
      byStatus[d.status] = (byStatus[d.status] || 0) + 1;
    }

    return {
      delivered: this.stats.totalDelivered,
      failed: this.stats.totalFailed,
      retries: this.stats.totalRetries,
      pendingRetries: this.retryQueue.length,
      byStatus
    };
  }

  shutdown() {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
    }
    console.log('Webhook dispatcher shut down');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const dispatcher = new AgentWebhookDispatcher({
    maxRetries: 3,
    retryDelay: 500,
    retryBackoff: 2
  });

  switch (command) {
    case 'list-webhooks':
      const webhooks = dispatcher.listWebhooks();
      console.log('Registered Webhooks:');
      webhooks.forEach(w => console.log(`  - ${w.name}: ${w.url} [${w.event}] [${w.enabled ? 'enabled' : 'disabled'}]`));
      break;

    case 'register':
      dispatcher.registerWebhook({
        name: args[1] || 'test-webhook',
        url: args[2] || 'https://example.com/webhook',
        event: args[3] || 'test.event',
        enabled: true
      });
      console.log('Webhook registered');
      break;

    case 'dispatch':
      const result = dispatcher.dispatch(args[1] || 'test.event', {
        data: 'test-payload',
        timestamp: Date.now()
      });
      console.log('Dispatch result:', result);
      break;

    case 'deliveries':
      const deliveries = dispatcher.listDeliveries(
        args[1] ? { status: args[1] } : undefined
      );
      console.log('Deliveries:');
      deliveries.slice(-10).forEach(d => console.log(`  - [${d.status}] ${d.webhookName}: ${d.event}`));
      break;

    case 'stats':
      const stats = dispatcher.getStatistics();
      console.log('Webhook Dispatcher Statistics:', stats);
      break;

    case 'demo':
      console.log('=== Agent Webhook Dispatcher Demo ===\n');

      // List webhooks
      console.log('1. Registered Webhooks:');
      const whList = dispatcher.listWebhooks();
      whList.forEach(w => {
        console.log(`   - ${w.name}: ${w.url}`);
        console.log(`     Event: ${w.event}, Status: ${w.enabled ? 'enabled' : 'disabled'}`);
      });

      // Dispatch events
      console.log('\n2. Dispatching Events:');

      // Narrator events
      console.log('\n   Dispatching narrator events...');
      dispatcher.dispatch('narrator.start', {
        sessionId: 'session-001',
        timestamp: Date.now()
      });
      dispatcher.dispatch('narrator.update', {
        progress: 45,
        message: 'Processing...'
      });
      dispatcher.dispatch('narrator.complete', {
        sessionId: 'session-001',
        duration: 5000
      });

      // Core events
      console.log('\n   Dispatching core events...');
      dispatcher.dispatch('core.config', {
        configId: 'config-001',
        changes: ['option1', 'option2']
      });
      dispatcher.dispatch('core.error', {
        error: 'Connection lost',
        code: 500
      });

      // Notification events (disabled)
      console.log('\n   Dispatching notification events...');
      dispatcher.dispatch('notification.alert', {
        level: 'warning',
        message: 'Test alert'
      });

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      // List recent deliveries
      console.log('\n3. Recent Deliveries:');
      const recentDeliveries = dispatcher.listDeliveries();
      recentDeliveries.slice(-6).forEach(d => {
        console.log(`   - [${d.status}] ${d.webhookName}: ${d.event} (attempt ${d.attempt + 1})`);
      });

      // Statistics
      console.log('\n4. Statistics:');
      const finalStats = dispatcher.getStatistics();
      console.log(`   Total delivered: ${finalStats.delivered}`);
      console.log(`   Total failed: ${finalStats.failed}`);
      console.log(`   Pending retries: ${finalStats.pendingRetries}`);
      console.log(`   By status:`, finalStats.byStatus);

      // Test signature verification
      console.log('\n5. Signature Verification:');
      const testPayload = { test: 'data' };
      const webhook = dispatcher.getWebhook('narrator-events');
      const sig = dispatcher._generateSignature(testPayload, webhook.secret);
      const verified = dispatcher.verifySignature(testPayload, sig, webhook.secret);
      console.log(`   Signature generated and verified: ${verified}`);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-webhook-dispatcher.js <command> [args]');
      console.log('\nCommands:');
      console.log('  list-webhooks              List registered webhooks');
      console.log('  register <name> <url>      Register new webhook');
      console.log('  dispatch <event>            Dispatch event to webhooks');
      console.log('  deliveries [status]        List deliveries');
      console.log('  stats                      Get statistics');
      console.log('  demo                       Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentWebhookDispatcher;
