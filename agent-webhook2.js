/**
 * Agent Webhook2 - Enhanced Webhook Management Agent
 *
 * Webhook management with retries, signatures, filters, and delivery tracking.
 *
 * Usage: node agent-webhook2.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   send        - Send test webhook
 *   hooks       - Show webhook management
 */

class WebhookFilter {
  constructor(config) {
    this.field = config.field;
    this.operator = config.operator; // eq, neq, gt, lt, contains, regex
    this.value = config.value;
  }

  matches(data) {
    const fieldValue = this._getFieldValue(data, this.field);

    switch (this.operator) {
      case 'eq': return fieldValue === this.value;
      case 'neq': return fieldValue !== this.value;
      case 'gt': return fieldValue > this.value;
      case 'lt': return fieldValue < this.value;
      case 'contains': return String(fieldValue).includes(this.value);
      case 'regex': return new RegExp(this.value).test(String(fieldValue));
      default: return false;
    }
  }

  _getFieldValue(data, field) {
    return field.split('.').reduce((obj, key) => obj?.[key], data);
  }
}

class WebhookSubscription {
  constructor(config) {
    this.id = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.event = config.event;
    this.url = config.url;
    this.secret = config.secret;
    this.filters = (config.filters || []).map(f => new WebhookFilter(f));
    this.enabled = config.enabled !== false;
    this.retryPolicy = config.retryPolicy || { maxAttempts: 3, backoff: 'exponential' };
    this.headers = config.headers || {};
    this.createdAt = Date.now();
    this.lastTriggeredAt = null;
  }

  shouldTrigger(eventData) {
    if (!this.enabled) return false;
    return this.filters.every(f => f.matches(eventData));
  }
}

class WebhookDelivery {
  constructor(subscription, payload) {
    this.id = `delivery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.subscriptionId = subscription.id;
    this.event = subscription.event;
    this.url = subscription.url;
    this.payload = payload;
    this.status = 'pending';
    this.attempts = 0;
    this.maxAttempts = subscription.retryPolicy.maxAttempts;
    this.response = null;
    this.responseCode = null;
    this.error = null;
    this.createdAt = Date.now();
    this.sentAt = null;
    this.completedAt = null;
  }

  async attempt(httpClient) {
    this.attempts++;
    this.status = 'attempting';
    this.sentAt = Date.now();

    try {
      const response = await httpClient.post(this.url, this.payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Event': this.event,
          'X-Webhook-Delivery': this.id,
          ...this._generateSignature()
        }
      });

      this.responseCode = response.status;
      this.response = response.data;
      this.status = response.status >= 200 && response.status < 300 ? 'success' : 'failed';
      this.completedAt = Date.now();

      return { success: true, response: response.data };
    } catch (error) {
      this.error = error.message;
      this.responseCode = error.response?.status;
      this.status = this.attempts >= this.maxAttempts ? 'failed' : 'retrying';
      this.completedAt = Date.now();

      return { success: false, error: error.message };
    }
  }

  _generateSignature() {
    if (this.payload.secret) {
      const crypto = require('crypto');
      const signature = crypto
        .createHmac('sha256', this.payload.secret)
        .update(JSON.stringify(this.payload.data))
        .digest('hex');
      return { 'X-Webhook-Signature': `sha256=${signature}` };
    }
    return {};
  }
}

class WebhookEvent {
  constructor(config) {
    this.id = `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.type = config.type;
    this.data = config.data;
    this.timestamp = Date.now();
    this.metadata = config.metadata || {};
  }
}

class WebhookAgent {
  constructor(config = {}) {
    this.subscriptions = new Map();
    this.events = new Map();
    this.deliveries = new Map();
    this.stats = {
      events: 0,
      triggered: 0,
      delivered: 0,
      failed: 0,
      retried: 0
    };

    this.config = {
      timeout: config.timeout || 30000,
      maxConcurrent: config.maxConcurrent || 10
    };
  }

  subscribe(options) {
    const subscription = new WebhookSubscription(options);
    this.subscriptions.set(subscription.id, subscription);
    console.log(`   Subscribed: ${subscription.event} -> ${subscription.url}`);
    return subscription;
  }

  unsubscribe(subscriptionId) {
    if (this.subscriptions.delete(subscriptionId)) {
      console.log(`   Unsubscribed: ${subscriptionId}`);
      return { success: true };
    }
    return { success: false, reason: 'Subscription not found' };
  }

  getSubscription(id) {
    return this.subscriptions.get(id);
  }

  getSubscriptionsByEvent(event) {
    return Array.from(this.subscriptions.values())
      .filter(s => s.event === event);
  }

  async publish(eventType, data, metadata = {}) {
    const event = new WebhookEvent({ type: eventType, data, metadata });
    this.events.set(event.id, event);
    this.stats.events++;

    console.log(`   Published event: ${eventType}`);

    // Find matching subscriptions
    const subscriptions = this.getSubscriptionsByEvent(eventType);
    const matching = subscriptions.filter(s => s.shouldTrigger(data));

    this.stats.triggered += matching.length;

    // Create deliveries
    const deliveries = [];
    for (const subscription of matching) {
      subscription.lastTriggeredAt = Date.now();
      const delivery = new WebhookDelivery(subscription, { data, secret: subscription.secret });
      this.deliveries.set(delivery.id, delivery);
      deliveries.push(delivery);
    }

    // Send deliveries
    for (const delivery of deliveries) {
      await this._deliver(delivery);
    }

    return {
      eventId: event.id,
      deliveries: deliveries.length
    };
  }

  async _deliver(delivery) {
    const httpClient = {
      post: async (url, payload, options) => {
        console.log(`   [HTTP] POST ${url}`);
        console.log(`   [HTTP] Payload: ${JSON.stringify(payload).substring(0, 50)}...`);
        // Simulate response
        await new Promise(resolve => setTimeout(resolve, 10));
        return { status: 200, data: { success: true } };
      }
    };

    const result = await delivery.attempt(httpClient);

    if (result.success) {
      this.stats.delivered++;
      console.log(`   Delivered: ${delivery.id.substring(0, 20)}...`);
    } else if (delivery.status === 'retrying') {
      this.stats.retried++;
      console.log(`   Will retry: ${delivery.id.substring(0, 20)}...`);
    } else {
      this.stats.failed++;
      console.log(`   Failed: ${delivery.error}`);
    }

    return result;
  }

  async retryDelivery(deliveryId) {
    const delivery = this.deliveries.get(deliveryId);
    if (!delivery) {
      return { success: false, reason: 'Delivery not found' };
    }

    return this._deliver(delivery);
  }

  getDelivery(id) {
    return this.deliveries.get(id);
  }

  getEventDeliveries(eventId) {
    const event = Array.from(this.events.values()).find(e => e.id === eventId);
    if (!event) return [];

    return Array.from(this.deliveries.values())
      .filter(d => d.event === event.type);
  }

  getStats() {
    return {
      ...this.stats,
      subscriptions: this.subscriptions.size,
      events: this.events.size,
      deliveries: this.deliveries.size
    };
  }

  getSubscriptionStats(subscriptionId) {
    const deliveries = Array.from(this.deliveries.values())
      .filter(d => d.subscriptionId === subscriptionId);

    return {
      total: deliveries.length,
      success: deliveries.filter(d => d.status === 'success').length,
      failed: deliveries.filter(d => d.status === 'failed').length,
      pending: deliveries.filter(d => d.status === 'pending').length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new WebhookAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Webhook2 Demo\n');

    // 1. Subscriptions
    console.log('1. Webhook Subscriptions:');
    agent.subscribe({
      event: 'user.created',
      url: 'https://example.com/webhooks/users',
      secret: 'secret-key-123',
      filters: [
        { field: 'data.role', operator: 'eq', value: 'admin' }
      ]
    });

    agent.subscribe({
      event: 'order.completed',
      url: 'https://example.com/webhooks/orders',
      secret: 'order-secret',
      retryPolicy: { maxAttempts: 5, backoff: 'exponential' }
    });

    agent.subscribe({
      event: 'payment.received',
      url: 'https://example.com/webhooks/payments',
      filters: [
        { field: 'data.amount', operator: 'gt', value: 1000 }
      ]
    });

    agent.subscribe({
      event: 'system.alert',
      url: 'https://example.com/webhooks/alerts'
    });

    console.log(`   Total subscriptions: ${agent.subscriptions.size}`);

    // 2. Publish events
    console.log('\n2. Publish Events:');

    // User created event
    const result1 = await agent.publish('user.created', {
      name: 'John Doe',
      email: 'john@example.com',
      role: 'admin'
    });
    console.log(`   User created: ${result1.deliveries} deliveries`);

    // Order completed event
    const result2 = await agent.publish('order.completed', {
      orderId: 'ORD-123',
      total: 99.99,
      status: 'completed'
    });
    console.log(`   Order completed: ${result2.deliveries} deliveries`);

    // Payment received (high value)
    const result3 = await agent.publish('payment.received', {
      paymentId: 'PAY-456',
      amount: 5000,
      currency: 'USD'
    });
    console.log(`   Payment received: ${result3.deliveries} deliveries`);

    // Payment received (low value - should not trigger)
    const result4 = await agent.publish('payment.received', {
      paymentId: 'PAY-789',
      amount: 50,
      currency: 'USD'
    });
    console.log(`   Payment received (low): ${result4.deliveries} deliveries`);

    // System alert
    const result5 = await agent.publish('system.alert', {
      level: 'critical',
      message: 'High CPU usage'
    });
    console.log(`   System alert: ${result5.deliveries} deliveries`);

    // 3. Filters
    console.log('\n3. Filter Testing:');
    const filter = new WebhookFilter({ field: 'data.amount', operator: 'gt', value: 1000 });
    console.log(`   5000 > 1000: ${filter.matches({ data: { amount: 5000 } })}`);
    console.log(`   50 > 1000: ${filter.matches({ data: { amount: 50 } })}`);

    // 4. Subscription management
    console.log('\n4. Subscription Management:');
    const subs = agent.getSubscriptionsByEvent('user.created');
    console.log(`   user.created subscriptions: ${subs.length}`);

    // 5. Delivery tracking
    console.log('\n5. Delivery Tracking:');
    const deliveries = Array.from(agent.deliveries.values()).slice(0, 3);
    deliveries.forEach(d => console.log(`   - ${d.id.substring(0, 20)}: ${d.status}`));

    // 6. Retry delivery
    console.log('\n6. Retry Delivery:');
    const failedDelivery = Array.from(agent.deliveries.values())
      .find(d => d.status === 'failed');
    if (failedDelivery) {
      await agent.retryDelivery(failedDelivery.id);
      console.log(`   Retried: ${failedDelivery.id.substring(0, 20)}...`);
    }

    // 7. Subscription stats
    console.log('\n7. Subscription Stats:');
    const subArray = Array.from(agent.subscriptions.values());
    if (subArray.length > 0) {
      const subStats = agent.getSubscriptionStats(subArray[0].id);
      console.log(`   Total deliveries: ${subStats.total}`);
      console.log(`   Success: ${subStats.success}`);
    }

    // 8. Event history
    console.log('\n8. Event History:');
    console.log(`   Total events: ${agent.events.size}`);

    // 9. Statistics
    console.log('\n9. Statistics:');
    const stats = agent.getStats();
    console.log(`   Events published: ${stats.events}`);
    console.log(`   Subscriptions triggered: ${stats.triggered}`);
    console.log(`   Deliveries successful: ${stats.delivered}`);
    console.log(`   Deliveries failed: ${stats.failed}`);
    console.log(`   Retries: ${stats.retried}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'send':
    console.log('Publishing test event...');
    const result = await agent.publish('test.event', { message: 'Test webhook' });
    console.log(`Published: ${result.eventId}`);
    break;

  case 'hooks':
    console.log('Webhook Subscriptions:');
    for (const [id, sub] of agent.subscriptions) {
      console.log(`  - ${sub.event} -> ${sub.url}`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-webhook2.js [demo|send|hooks]');
}
