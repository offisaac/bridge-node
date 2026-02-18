/**
 * Agent Event Bus - Event Bus Management Module
 *
 * Implements publish-subscribe event bus for distributed messaging.
 *
 * Usage: node agent-event-bus.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   publish    - Publish an event
 *   subscribe  - Subscribe to events
 *   list       - List subscriptions
 */

class Event {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.type = config.type;
    this.payload = config.payload || {};
    this.source = config.source || 'unknown';
    this.timestamp = config.timestamp ? new Date(config.timestamp) : new Date();
    this.correlationId = config.correlationId || null;
    this.metadata = config.metadata || {};
  }
}

class Subscription {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.eventType = config.eventType; // Event type to subscribe to
    this.handler = config.handler || null; // Function to handle event
    this.subscriber = config.subscriber;
    this.pattern = config.pattern || null; // Wildcard pattern
    this.priority = config.priority || 0;
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
    this.active = config.active !== false;
  }

  matches(eventType) {
    if (this.eventType === eventType) return true;
    if (this.pattern) {
      // Simple wildcard matching
      const regex = new RegExp('^' + this.pattern.replace('*', '.*') + '$');
      return regex.test(eventType);
    }
    return false;
  }
}

class EventBusManager {
  constructor() {
    this.subscribers = new Map();
    this.events = [];
    this.maxEvents = 1000;
    this._initSampleData();
  }

  _initSampleData() {
    // Sample subscriptions
    const subscriptions = [
      { eventType: 'user.created', subscriber: 'user-service', priority: 10 },
      { eventType: 'user.updated', subscriber: 'user-service', priority: 5 },
      { eventType: 'order.created', subscriber: 'order-service', priority: 10 },
      { eventType: 'order.completed', subscriber: 'order-service', priority: 5 },
      { eventType: 'payment.processed', subscriber: 'payment-service', priority: 10 },
      { eventType: '*', subscriber: 'audit-service', pattern: '*', priority: 1 },
      { eventType: 'notification.*', subscriber: 'notification-service', pattern: 'notification.*', priority: 5 }
    ];

    subscriptions.forEach(s => {
      const sub = new Subscription(s);
      this.subscribers.set(sub.id, sub);
    });

    // Sample events
    const events = [
      { type: 'user.created', payload: { userId: '123', email: 'test@example.com' }, source: 'user-service' },
      { type: 'order.created', payload: { orderId: '456', amount: 99.99 }, source: 'order-service' },
      { type: 'payment.processed', payload: { paymentId: '789', status: 'success' }, source: 'payment-service' }
    ];

    events.forEach(e => {
      this.events.push(new Event(e));
    });
  }

  // Subscribe to events
  subscribe(eventType, subscriber, options = {}) {
    const sub = new Subscription({
      eventType,
      subscriber,
      pattern: options.pattern || null,
      priority: options.priority || 0
    });

    this.subscribers.set(sub.id, sub);
    return sub;
  }

  // Unsubscribe
  unsubscribe(subscriptionId) {
    const sub = this.subscribers.get(subscriptionId);
    if (!sub) {
      throw new Error('Subscription not found');
    }
    sub.active = false;
    return sub;
  }

  // Publish event
  publish(type, payload, options = {}) {
    const event = new Event({
      type,
      payload,
      source: options.source || 'unknown',
      correlationId: options.correlationId || null,
      metadata: options.metadata || {}
    });

    // Store event
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    // Find matching subscriptions
    const matchingSubs = Array.from(this.subscribers.values())
      .filter(sub => sub.active && sub.matches(type))
      .sort((a, b) => b.priority - a.priority);

    // Notify subscribers
    const results = matchingSubs.map(sub => {
      try {
        if (sub.handler) {
          sub.handler(event);
        }
        return { subscriber: sub.subscriber, status: 'delivered' };
      } catch (e) {
        return { subscriber: sub.subscriber, status: 'error', error: e.message };
      }
    });

    return {
      event,
      delivered: results.filter(r => r.status === 'delivered').length,
      failed: results.filter(r => r.status === 'error').length,
      results
    };
  }

  // Get subscriptions
  getSubscriptions(eventType = null) {
    let all = Array.from(this.subscribers.values()).filter(s => s.active);

    if (eventType) {
      all = all.filter(s => s.matches(eventType));
    }

    return all;
  }

  // Get events
  getEvents(type = null, limit = 100) {
    let all = this.events;

    if (type) {
      all = all.filter(e => e.type === type);
    }

    return all.slice(-limit);
  }

  // Get event types
  getEventTypes() {
    const types = new Set();
    this.events.forEach(e => types.add(e.type));
    return Array.from(types);
  }

  // Get statistics
  getStats() {
    const subscriptions = Array.from(this.subscribers.values());
    const active = subscriptions.filter(s => s.active).length;

    const bySubscriber = {};
    subscriptions.forEach(s => {
      bySubscriber[s.subscriber] = (bySubscriber[s.subscriber] || 0) + 1;
    });

    const eventTypes = this.getEventTypes();

    return {
      totalEvents: this.events.length,
      totalSubscriptions: subscriptions.length,
      activeSubscriptions: active,
      eventTypes: eventTypes.length,
      bySubscriber
    };
  }

  // Clear events
  clearEvents() {
    this.events = [];
    return { cleared: true };
  }
}

function runDemo() {
  console.log('=== Agent Event Bus Demo\n');

  const mgr = new EventBusManager();

  console.log('1. Get Statistics:');
  const stats = mgr.getStats();
  console.log(`   Events: ${stats.totalEvents}`);
  console.log(`   Subscriptions: ${stats.activeSubscriptions}`);
  console.log(`   Event types: ${stats.eventTypes}`);

  console.log('\n2. Get Subscriptions:');
  const subs = mgr.getSubscriptions();
  console.log(`   Total: ${subs.length}`);
  subs.slice(0, 5).forEach(s => console.log(`   - ${s.subscriber} -> ${s.eventType}`));

  console.log('\n3. Publish Event:');
  const result = mgr.publish('user.registered', {
    userId: 'user-999',
    email: 'new@example.com'
  }, { source: 'auth-service' });
  console.log(`   Event: ${result.event.type}`);
  console.log(`   Delivered: ${result.delivered}`);
  console.log(`   Failed: ${result.failed}`);

  console.log('\n4. Subscribe to Event:');
  const newSub = mgr.subscribe('custom.event', 'custom-handler', { priority: 100 });
  console.log(`   Created: ${newSub.id}`);
  console.log(`   Subscriber: ${newSub.subscriber}`);

  console.log('\n5. Publish to Multiple Subscribers:');
  const result2 = mgr.publish('notification.email', { to: 'user@test.com', subject: 'Test' });
  console.log(`   Delivered: ${result2.delivered}`);

  console.log('\n6. Get Events:');
  const events = mgr.getEvents();
  console.log(`   Total: ${events.length}`);
  events.slice(-3).forEach(e => console.log(`   - ${e.type}: ${JSON.stringify(e.payload).substring(0, 40)}`));

  console.log('\n7. Get Event Types:');
  const types = mgr.getEventTypes();
  console.log(`   Types: ${types.join(', ')}`);

  console.log('\n8. Get Subscriptions by Event Type:');
  const userSubs = mgr.getSubscriptions('user.created');
  console.log(`   user.created subscribers: ${userSubs.length}`);

  console.log('\n9. Unsubscribe:');
  const unsub = mgr.unsubscribe(newSub.id);
  console.log(`   Unsubscribed: ${unsub.subscriber}`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new EventBusManager();

if (command === 'demo') runDemo();
else if (command === 'publish') {
  const [type, payload] = args.slice(1);
  if (!type) {
    console.log('Usage: node agent-event-bus.js publish <type> [payload_json]');
    process.exit(1);
  }
  try {
    const result = mgr.publish(type, payload ? JSON.parse(payload) : {});
    console.log(JSON.stringify(result, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
else if (command === 'subscribe') {
  const [eventType, subscriber] = args.slice(1);
  if (!eventType || !subscriber) {
    console.log('Usage: node agent-event-bus.js subscribe <eventType> <subscriber>');
    process.exit(1);
  }
  try {
    const sub = mgr.subscribe(eventType, subscriber);
    console.log(JSON.stringify(sub, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
else if (command === 'list') {
  const [eventType] = args.slice(1);
  const subs = mgr.getSubscriptions(eventType || null);
  console.log(JSON.stringify(subs, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else console.log('Usage: node agent-event-bus.js [demo|publish|subscribe|list]');
