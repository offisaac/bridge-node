/**
 * Agent Queue 2 Module
 *
 * Provides advanced message queuing with pub/sub, persistence, and routing.
 * Usage: node agent-queue-2.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   enqueue <msg>        Enqueue message
 *   status                 Show queue status
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const QUEUE_DB = path.join(DATA_DIR, 'queue2-state.json');

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
 * Message Types
 */
const MessageType = {
  TEXT: 'text',
  JSON: 'json',
  BINARY: 'binary',
  COMMAND: 'command',
  EVENT: 'event'
};

/**
 * Queue States
 */
const QueueState = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  DRAINING: 'draining',
  CLOSED: 'closed'
};

/**
 * Queue Message
 */
class QueueMessage {
  constructor(payload, options = {}) {
    this.id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.payload = payload;
    this.options = {
      type: options.type || MessageType.TEXT,
      priority: options.priority || 0,
      ttl: options.ttl || 0,
      persistent: options.persistent || false,
      headers: options.headers || {},
      replyTo: options.replyTo || null,
      correlationId: options.correlationId || null,
      ...options
    };
    this.timestamp = Date.now();
    this.expiresAt = this.options.ttl > 0 ? this.timestamp + this.options.ttl : 0;
    this.acknowledged = false;
    this.rejected = false;
    this.processedAt = null;
  }

  isExpired() {
    return this.expiresAt > 0 && Date.now() > this.expiresAt;
  }

  acknowledge() {
    this.acknowledged = true;
    this.processedAt = Date.now();
  }

  reject(requeue = false) {
    this.rejected = true;
    this.processedAt = Date.now();
    return requeue;
  }

  getAge() {
    return Date.now() - this.timestamp;
  }
}

/**
 * Message Queue
 */
class MessageQueue {
  constructor(name, options = {}) {
    this.name = name;
    this.options = {
      maxSize: options.maxSize || 10000,
      maxPriority: options.maxPriority || 10,
      deadLetterQueue: options.deadLetterQueue || null,
      defaultTTL: options.defaultTTL || 3600000,
      persistence: options.persistence || false,
      ...options
    };
    this.messages = [];
    this.state = QueueState.ACTIVE;
    this.stats = {
      enqueued: 0,
      dequeued: 0,
      acknowledged: 0,
      rejected: 0,
      expired: 0
    };
  }

  enqueue(payload, options = {}) {
    if (this.state === QueueState.CLOSED) {
      throw new Error('Queue is closed');
    }

    if (this.messages.length >= this.options.maxSize) {
      if (this.options.deadLetterQueue) {
        this.sendToDeadLetter({ payload, reason: 'queue_full' });
        return null;
      }
      throw new Error('Queue is full');
    }

    const message = new QueueMessage(payload, {
      ...options,
      ttl: options.ttl || this.options.defaultTTL
    });

    this.messages.push(message);
    this.stats.enqueued++;

    this.messages.sort((a, b) => b.options.priority - a.options.priority);

    return message;
  }

  dequeue() {
    if (this.messages.length === 0) {
      return null;
    }

    const now = Date.now();
    let message = null;
    let index = -1;

    for (let i = 0; i < this.messages.length; i++) {
      const msg = this.messages[i];
      if (msg.isExpired()) {
        this.messages.splice(i, 1);
        this.stats.expired++;
        i--;
      } else if (!message) {
        message = msg;
        index = i;
      }
    }

    if (message && index >= 0) {
      this.messages.splice(index, 1);
      this.stats.dequeued++;
    }

    return message;
  }

  peek() {
    const now = Date.now();
    for (const msg of this.messages) {
      if (!msg.isExpired()) {
        return msg;
      }
    }
    return null;
  }

  size() {
    const now = Date.now();
    return this.messages.filter(msg => !msg.isExpired()).length;
  }

  clear() {
    const count = this.messages.length;
    this.messages = [];
    return count;
  }

  pause() {
    this.state = QueueState.PAUSED;
  }

  resume() {
    this.state = QueueState.ACTIVE;
  }

  close() {
    this.state = QueueState.CLOSED;
  }

  sendToDeadLetter(data) {
    if (this.options.deadLetterQueue) {
      this.options.deadLetterQueue.enqueue(data, { persistent: true });
    }
  }

  getStats() {
    return {
      name: this.name,
      state: this.state,
      size: this.size(),
      maxSize: this.options.maxSize,
      ...this.stats
    };
  }
}

/**
 * Pub/Sub Manager
 */
class PubSubManager {
  constructor(options = {}) {
    this.options = options;
    this.subscribers = new Map();
    this.patterns = new Map();
    this.messages = [];
    this.maxMessages = options.maxMessages || 1000;
  }

  subscribe(channel, callback, options = {}) {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, []);
    }
    const subscription = {
      callback,
      pattern: options.pattern || null,
      queue: options.queue || null,
      id: `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    this.subscribers.get(channel).push(subscription);
    return subscription.id;
  }

  unsubscribe(channel, subscriptionId) {
    if (!this.subscribers.has(channel)) return false;
    const subs = this.subscribers.get(channel);
    const index = subs.findIndex(s => s.id === subscriptionId);
    if (index >= 0) {
      subs.splice(index, 1);
      return true;
    }
    return false;
  }

  publish(channel, message) {
    const envelope = {
      channel,
      message,
      timestamp: Date.now()
    };

    this.messages.push(envelope);
    if (this.messages.length > this.maxMessages) {
      this.messages.shift();
    }

    let delivered = 0;
    const subs = this.subscribers.get(channel) || [];

    for (const sub of subs) {
      try {
        sub.callback(message);
        delivered++;
      } catch (e) {
        console.error(`Subscriber error: ${e.message}`);
      }
    }

    return delivered;
  }

  subscribePattern(pattern, callback) {
    const id = `pat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.patterns.set(pattern, { callback, id });
    return id;
  }

  publishToPatterns(channel, message) {
    for (const [pattern, sub] of this.patterns) {
      const regex = new RegExp(pattern);
      if (regex.test(channel)) {
        try {
          sub.callback(message, channel);
        } catch (e) {
          console.error(`Pattern subscriber error: ${e.message}`);
        }
      }
    }
  }

  getChannels() {
    return Array.from(this.subscribers.keys());
  }

  getSubscriberCount(channel) {
    return (this.subscribers.get(channel) || []).length;
  }
}

/**
 * Queue Router
 */
class QueueRouter {
  constructor() {
    this.routes = [];
    this.queues = new Map();
  }

  addRoute(pattern, queueName, options = {}) {
    this.routes.push({
      pattern,
      queueName,
      options: {
        priority: options.priority || 0,
        transform: options.transform || null,
        filter: options.filter || null
      }
    });
  }

  registerQueue(name, queue) {
    this.queues.set(name, queue);
  }

  route(message) {
    for (const route of this.routes) {
      const regex = new RegExp(route.pattern);
      if (regex.test(message.channel || '')) {
        const queue = this.queues.get(route.queueName);
        if (queue) {
          let payload = message.payload;
          if (route.options.transform) {
            payload = route.options.transform(payload);
          }
          if (route.options.filter && !route.options.filter(payload)) {
            continue;
          }
          return queue.enqueue(payload, {
            priority: route.options.priority,
            headers: { routedFrom: message.channel }
          });
        }
      }
    }
    return null;
  }

  getRoutes() {
    return this.routes.map(r => ({
      pattern: r.pattern,
      queueName: r.queueName
    }));
  }

  publishToPatterns(channel, message) {
    for (const route of this.routes) {
      const regex = new RegExp(route.pattern);
      if (regex.test(channel)) {
        const queue = this.queues.get(route.queueName);
        if (queue) {
          queue.enqueue(message, { priority: route.options.priority });
        }
      }
    }
  }
}

/**
 * Message Broker
 */
class MessageBroker {
  constructor(options = {}) {
    this.options = options;
    this.queues = new Map();
    this.pubsub = new PubSubManager();
    this.router = new QueueRouter();
    this.stats = {
      totalMessages: 0,
      routedMessages: 0,
      publishedMessages: 0
    };
  }

  createQueue(name, options = {}) {
    const queue = new MessageQueue(name, options);
    this.queues.set(name, queue);
    this.router.registerQueue(name, queue);
    return queue;
  }

  getQueue(name) {
    return this.queues.get(name);
  }

  deleteQueue(name) {
    const queue = this.queues.get(name);
    if (queue) {
      queue.close();
      this.queues.delete(name);
      return true;
    }
    return false;
  }

  enqueue(queueName, payload, options = {}) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }
    this.stats.totalMessages++;
    return queue.enqueue(payload, options);
  }

  dequeue(queueName) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }
    return queue.dequeue();
  }

  publish(channel, message) {
    this.stats.publishedMessages++;
    this.pubsub.publish(channel, message);
    this.router.publishToPatterns(channel, message);
  }

  subscribe(channel, callback, options = {}) {
    return this.pubsub.subscribe(channel, callback, options);
  }

  subscribePattern(pattern, callback) {
    return this.pubsub.subscribePattern(pattern, callback);
  }

  addRoute(pattern, queueName, options = {}) {
    this.router.addRoute(pattern, queueName, options);
  }

  getStats() {
    const queueStats = {};
    for (const [name, queue] of this.queues) {
      queueStats[name] = queue.getStats();
    }

    return {
      ...this.stats,
      queueCount: this.queues.size,
      queues: queueStats,
      channels: this.pubsub.getChannels().length
    };
  }
}

/**
 * Agent Queue Manager
 */
class AgentQueueManager {
  constructor() {
    this.broker = new MessageBroker();
    this.state = loadJSON(QUEUE_DB, {});
  }

  setupDefaultQueues() {
    this.broker.createQueue('default', { maxSize: 1000 });
    this.broker.createQueue('high-priority', { maxSize: 500, maxPriority: 10 });
    this.broker.createQueue('low-priority', { maxSize: 5000, maxPriority: 1 });
    this.broker.createQueue('dead-letter', { maxSize: 100 });

    this.broker.createQueue('default', { deadLetterQueue: this.broker.getQueue('dead-letter') });

    return this.broker;
  }

  getBroker() {
    return this.broker;
  }

  getStats() {
    return this.broker.getStats();
  }

  save() {
    saveJSON(QUEUE_DB, { stats: this.broker.getStats() });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Queue 2 Demo\n');

  const manager = new AgentQueueManager();
  const broker = manager.setupDefaultQueues();

  // Create queues
  console.log('1. Creating Queues:');
  const queue1 = broker.getQueue('default');
  const queue2 = broker.getQueue('high-priority');
  const queue3 = broker.getQueue('low-priority');

  console.log(`   Created: default, high-priority, low-priority, dead-letter`);

  // Enqueue messages
  console.log('\n2. Enqueuing Messages:');

  broker.enqueue('default', 'Hello World');
  broker.enqueue('default', { type: 'json', data: { key: 'value' } });
  broker.enqueue('high-priority', 'Urgent message', { priority: 10 });
  broker.enqueue('low-priority', 'Low priority task', { priority: 1, ttl: 60000 });
  broker.enqueue('default', 'Message with headers', { headers: { source: 'demo' } });

  console.log(`   default queue: ${queue1.size()} messages`);
  console.log(`   high-priority queue: ${queue2.size()} messages`);
  console.log(`   low-priority queue: ${queue3.size()} messages`);

  // Dequeue messages
  console.log('\n3. Dequeuing Messages:');

  let msg = broker.dequeue('default');
  console.log(`   Dequeued: ${JSON.stringify(msg ? msg.payload : 'empty')}`);
  console.log(`   Remaining: ${queue1.size()}`);

  msg = broker.dequeue('high-priority');
  console.log(`   Dequeued from high-priority: ${JSON.stringify(msg ? msg.payload : 'empty')}`);

  // Pub/Sub demo
  console.log('\n4. Pub/Sub Demo:');

  broker.subscribe('notifications', (msg) => {
    console.log(`   Received: ${msg}`);
  });

  broker.publish('notifications', 'New user registered');
  broker.publish('notifications', 'Payment received');

  // Pattern matching
  console.log('\n5. Pattern Matching:');

  broker.subscribePattern('user\\..+', (msg, channel) => {
    console.log(`   Pattern match on ${channel}: ${msg}`);
  });

  broker.publish('user.created', 'User created event');
  broker.publish('user.updated', 'User updated event');
  broker.publish('order.created', 'Order created event');

  // Routing
  console.log('\n6. Message Routing:');

  broker.addRoute('^events\\.', 'high-priority', { priority: 5 });

  broker.publish('events.order', { event: 'order', data: 'test' });
  broker.publish('events.user', { event: 'user', data: 'test' });

  console.log(`   Routed to high-priority: ${queue2.size()} messages`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Total Messages: ${stats.totalMessages}`);
  console.log(`   Published: ${stats.publishedMessages}`);
  console.log(`   Queue Count: ${stats.queueCount}`);
  console.log(`   Channels: ${stats.channels}`);

  for (const [name, q] of Object.entries(stats.queues)) {
    console.log(`   ${name}: ${q.size} messages, ${q.enqueued} enqueued, ${q.dequeued} dequeued`);
  }

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[1] || args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'enqueue') {
  const manager = new AgentQueueManager();
  const broker = manager.setupDefaultQueues();
  const msg = args[1] || 'test message';
  broker.enqueue('default', msg);
  console.log('Enqueued:', msg);
} else if (cmd === 'status') {
  const manager = new AgentQueueManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Queue 2 Module');
  console.log('Usage: node agent-queue-2.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  enqueue <msg> Enqueue message');
  console.log('  status           Show queue status');
}
