/**
 * Agent Webhook Module
 *
 * Provides agent webhook integration with subscriptions, events, and delivery.
 * Usage: node agent-webhook.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   send <event> <data>    Send webhook event
 *   list                    List subscriptions
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const WEBHOOK_DB = path.join(DATA_DIR, 'webhooks.json');

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
 * Webhook Event Types
 */
const EVENT_TYPES = {
  AGENT_CREATED: 'agent.created',
  AGENT_UPDATED: 'agent.updated',
  AGENT_DELETED: 'agent.deleted',
  AGENT_STARTED: 'agent.started',
  AGENT_STOPPED: 'agent.stopped',
  TASK_ASSIGNED: 'task.assigned',
  TASK_COMPLETED: 'task.completed',
  TASK_FAILED: 'task.failed',
  ERROR_OCCURRED: 'error.occurred',
  METRICS_THRESHOLD: 'metrics.threshold'
};

/**
 * Webhook Subscription
 */
class WebhookSubscription {
  constructor(id, url, events, options = {}) {
    this.id = id;
    this.url = url;
    this.events = events; // Array of event types or '*' for all
    this.secret = options.secret || null;
    this.enabled = options.enabled !== false;
    this.retryPolicy = options.retryPolicy || { maxRetries: 3, backoff: 'exponential' };
    this.timeout = options.timeout || 30000;
    this.filters = options.filters || {};
    this.createdAt = Date.now();
    this.lastTriggered = null;
  }

  matchesEvent(eventType) {
    if (this.events.includes('*')) {
      return true;
    }
    if (this.events.includes(eventType)) {
      return true;
    }
    // Check for wildcard suffix
    const prefix = eventType.split('.')[0];
    return this.events.includes(`${prefix}.*`);
  }

  applyFilters(payload) {
    let filtered = { ...payload };

    for (const [key, filter] of Object.entries(this.filters)) {
      if (filter.exclude && filtered[key] !== undefined) {
        delete filtered[key];
      }
      if (filter.include && filtered[key] !== undefined) {
        filtered = { [key]: filtered[key] };
      }
    }

    return filtered;
  }
}

/**
 * Webhook Payload
 */
class WebhookPayload {
  constructor(eventType, data, metadata = {}) {
    this.id = `wh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.eventType = eventType;
    this.timestamp = new Date().toISOString();
    this.data = data;
    this.metadata = metadata;
    this.agentId = metadata.agentId || null;
    this.correlationId = metadata.correlationId || null;
  }

  toJSON() {
    return {
      id: this.id,
      eventType: this.eventType,
      timestamp: this.timestamp,
      data: this.data,
      metadata: this.metadata
    };
  }
}

/**
 * Payload Transformer
 */
class PayloadTransformer {
  static addMetadata(payload, metadata) {
    return { ...payload, metadata: { ...payload.metadata, ...metadata } };
  }

  static flatten(payload) {
    const flattened = { ...payload };

    // Flatten nested objects
    for (const [key, value] of Object.entries(flattened)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        for (const [nestedKey, nestedValue] of Object.entries(value)) {
          flattened[`${key}_${nestedKey}`] = nestedValue;
        }
        delete flattened[key];
      }
    }

    return flattened;
  }

  static extractFields(payload, fields) {
    const extracted = {};
    for (const field of fields) {
      const parts = field.split('.');
      let value = payload;
      for (const part of parts) {
        value = value?.[part];
      }
      if (value !== undefined) {
        extracted[field] = value;
      }
    }
    return extracted;
  }

  static customTemplate(payload, template) {
    let result = JSON.parse(JSON.stringify(payload));

    for (const [key, value] of Object.entries(template)) {
      if (typeof value === 'string') {
        // Simple variable substitution
        result[key] = value.replace(/\$\{(\w+)\}/g, (_, field) => {
          return payload[field] || '';
        });
      }
    }

    return result;
  }
}

/**
 * Delivery Attempt
 */
class DeliveryAttempt {
  constructor(subscriptionId, payload, attemptNumber) {
    this.subscriptionId = subscriptionId;
    this.payload = payload;
    this.attemptNumber = attemptNumber;
    this.status = 'pending';
    this.responseCode = null;
    this.responseBody = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
  }

  async deliver(webhookUrl, secret) {
    this.startTime = Date.now();

    // Simulate webhook delivery (in real implementation, would make HTTP request)
    const success = Math.random() > 0.1; // 90% success rate simulation

    this.endTime = Date.now();

    if (success) {
      this.status = 'success';
      this.responseCode = 200;
      return { success: true };
    } else {
      this.status = 'failed';
      this.responseCode = 500;
      this.error = 'Simulated delivery failure';
      return { success: false, error: this.error };
    }
  }

  getDuration() {
    if (this.startTime && this.endTime) {
      return this.endTime - this.startTime;
    }
    return 0;
  }
}

/**
 * Webhook Manager
 */
class WebhookManager {
  constructor() {
    this.subscriptions = new Map();
    this.deliveryHistory = [];
    this.eventQueue = [];
    this.state = loadJSON(WEBHOOK_DB, { subscriptions: [], history: [] });

    // Load subscriptions from state
    for (const sub of this.state.subscriptions || []) {
      const subscription = new WebhookSubscription(
        sub.id, sub.url, sub.events, sub
      );
      this.subscriptions.set(sub.id, subscription);
    }

    this.deliveryHistory = this.state.history || [];

    // Create default subscriptions if none exist
    if (this.subscriptions.size === 0) {
      this.createDefaultSubscriptions();
    }
  }

  createDefaultSubscriptions() {
    this.subscribe(
      'http://localhost:8080/webhook/agent-events',
      ['agent.*', 'task.*'],
      { enabled: true }
    );
  }

  // Subscription management
  subscribe(url, events, options = {}) {
    const id = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const subscription = new WebhookSubscription(id, url, events, options);
    this.subscriptions.set(id, subscription);
    this.save();
    return subscription;
  }

  unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return { error: 'Subscription not found' };
    }

    this.subscriptions.delete(subscriptionId);
    this.save();
    return { success: true };
  }

  getSubscription(subscriptionId) {
    return this.subscriptions.get(subscriptionId);
  }

  listSubscriptions(eventType = null) {
    const subs = Array.from(this.subscriptions.values());

    if (eventType) {
      return subs.filter(s => s.matchesEvent(eventType));
    }

    return subs;
  }

  updateSubscription(subscriptionId, updates) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return { error: 'Subscription not found' };
    }

    Object.assign(subscription, updates);
    this.save();
    return subscription;
  }

  // Event triggering
  async trigger(eventType, data, metadata = {}) {
    const payload = new WebhookPayload(eventType, data, metadata);

    // Find matching subscriptions
    const matchingSubs = this.listSubscriptions(eventType)
      .filter(s => s.enabled);

    console.log(`\n5. Triggering Webhooks:`);
    console.log(`   Event: ${eventType}`);
    console.log(`   Matching subscriptions: ${matchingSubs.length}`);

    // Deliver to each subscription
    const results = [];
    for (const subscription of matchingSubs) {
      const result = await this.deliver(subscription, payload);
      results.push({ subscription: subscription.id, ...result });
    }

    return { payload, results };
  }

  async deliver(subscription, payload) {
    // Apply filters
    const filteredPayload = subscription.applyFilters(payload.toJSON());

    // Create delivery attempt
    const attempt = new DeliveryAttempt(
      subscription.id,
      filteredPayload,
      1
    );

    // Simulate delivery with retries
    let lastError = null;
    for (let i = 0; i <= subscription.retryPolicy.maxRetries; i++) {
      const result = await attempt.deliver(subscription.url, subscription.secret);

      if (result.success) {
        subscription.lastTriggered = Date.now();
        this.recordDelivery(attempt);
        this.save();
        return { success: true, attempt: attempt.getDuration() };
      }

      lastError = result.error;
      // Wait before retry (simulated backoff)
      if (i < subscription.retryPolicy.maxRetries) {
        await new Promise(r => setTimeout(r, 100 * (i + 1)));
      }
    }

    this.recordDelivery(attempt);
    this.save();
    return { success: false, error: lastError };
  }

  recordDelivery(attempt) {
    this.deliveryHistory.unshift({
      subscriptionId: attempt.subscriptionId,
      payloadId: attempt.payload.id,
      status: attempt.status,
      responseCode: attempt.responseCode,
      duration: attempt.getDuration(),
      timestamp: Date.now()
    });

    if (this.deliveryHistory.length > 100) {
      this.deliveryHistory = this.deliveryHistory.slice(0, 100);
    }
  }

  getDeliveryHistory(subscriptionId = null, limit = 10) {
    let history = this.deliveryHistory;

    if (subscriptionId) {
      history = history.filter(h => h.subscriptionId === subscriptionId);
    }

    return history.slice(0, limit);
  }

  getStats() {
    const total = this.deliveryHistory.length;
    const successful = this.deliveryHistory.filter(h => h.status === 'success').length;
    const failed = this.deliveryHistory.filter(h => h.status === 'failed').length;

    return {
      subscriptions: this.subscriptions.size,
      totalDeliveries: total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(1) + '%' : 'N/A'
    };
  }

  save() {
    const subscriptions = Array.from(this.subscriptions.values()).map(s => ({
      id: s.id,
      url: s.url,
      events: s.events,
      secret: s.secret,
      enabled: s.enabled,
      retryPolicy: s.retryPolicy,
      timeout: s.timeout,
      filters: s.filters,
      createdAt: s.createdAt,
      lastTriggered: s.lastTriggered
    }));

    saveJSON(WEBHOOK_DB, {
      subscriptions,
      history: this.deliveryHistory
    });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Webhook Demo ===\n');

  const manager = new WebhookManager();

  // Show available event types
  console.log('1. Available Event Types:');
  Object.entries(EVENT_TYPES).forEach(([key, value]) => {
    console.log(`   ${key}: ${value}`);
  });

  // List subscriptions
  console.log('\n2. Current Subscriptions:');
  const subs = manager.listSubscriptions();
  subs.forEach(sub => {
    console.log(`   ${sub.id}: ${sub.url}`);
    console.log(`      Events: ${sub.events.join(', ')}`);
    console.log(`      Enabled: ${sub.enabled}`);
  });

  // Create new subscription
  console.log('\n3. Creating Subscription:');
  const newSub = manager.subscribe(
    'http://api.example.com/webhooks/agents',
    ['agent.created', 'agent.deleted', 'task.*'],
    {
      retryPolicy: { maxRetries: 3, backoff: 'exponential' },
      filters: { data: { exclude: ['password', 'secret'] } }
    }
  );
  console.log(`   Created: ${newSub.id}`);
  console.log(`   URL: ${newSub.url}`);
  console.log(`   Events: ${newSub.events.join(', ')}`);

  // Trigger events
  console.log('\n4. Triggering Events:');

  // Event 1: agent.created
  await manager.trigger(EVENT_TYPES.AGENT_CREATED, {
    agentId: 'agent-001',
    name: 'Test Agent',
    type: 'worker'
  }, { agentId: 'agent-001' });

  // Event 2: task.completed
  await manager.trigger(EVENT_TYPES.TASK_COMPLETED, {
    taskId: 'task-123',
    agentId: 'agent-001',
    duration: 5000
  }, { agentId: 'agent-001', correlationId: 'corr-456' });

  // Event 3: error.occurred
  await manager.trigger(EVENT_TYPES.ERROR_OCCURRED, {
    error: 'Connection timeout',
    agentId: 'agent-002'
  }, { agentId: 'agent-002' });

  // Show delivery history
  console.log('\n6. Delivery History:');
  const history = manager.getDeliveryHistory(null, 5);
  history.forEach(h => {
    console.log(`   ${h.status}: ${h.responseCode} (${h.duration}ms)`);
  });

  // Show stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Subscriptions: ${stats.subscriptions}`);
  console.log(`   Total Deliveries: ${stats.totalDeliveries}`);
  console.log(`   Success Rate: ${stats.successRate}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'send') {
  const manager = new WebhookManager();
  const data = args[2] ? JSON.parse(args[2]) : {};
  manager.trigger(args[1], data).then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'list') {
  const manager = new WebhookManager();
  console.log(JSON.stringify(manager.listSubscriptions(), null, 2));
} else {
  console.log('Agent Webhook Module');
  console.log('Usage: node agent-webhook.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  send <event> <data>  Send webhook event');
  console.log('  list              List subscriptions');
}
