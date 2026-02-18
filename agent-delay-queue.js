/**
 * Agent Delay Queue
 * Delayed message queue for Universal-Narrator-Core
 */

const crypto = require('crypto');

class AgentDelayQueue {
  constructor(options = {}) {
    this.messages = new Map();
    this.subscriptions = new Map();
    this.stats = {
      totalEnqueued: 0,
      totalDelivered: 0,
      totalExpired: 0,
      totalCancelled: 0
    };

    this.config = {
      maxDelay: options.maxDelay || 3600000, // 1 hour max delay
      minDelay: options.minDelay || 1000,   // 1 second min delay
      cleanupInterval: options.cleanupInterval || 5000,
      maxMessages: options.maxMessages || 100000,
      defaultDelay: options.defaultDelay || 5000
    };

    // Start message processor
    this._startProcessor();

    // Start cleanup timer
    this._startCleanupTimer();
  }

  _startProcessor() {
    this.processorTimer = setInterval(() => {
      this._processMessages();
    }, 100); // Check every 100ms
  }

  _startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this._cleanupExpired();
    }, this.config.cleanupInterval);
  }

  _processMessages() {
    const now = Date.now();
    const toDeliver = [];

    for (const [id, message] of this.messages) {
      if (message.status === 'pending' && message.deliverAt <= now) {
        toDeliver.push(message);
      }
    }

    toDeliver.forEach(message => {
      this._deliverMessage(message);
    });
  }

  _deliverMessage(message) {
    message.status = 'delivered';
    message.deliveredAt = Date.now();
    this.stats.totalDelivered++;

    console.log(`[DelayQueue] Delivering message ${message.id} to ${message.topic}`);

    // Notify subscribers
    const subscribers = this.subscriptions.get(message.topic) || [];
    subscribers.forEach(callback => {
      try {
        callback(message);
      } catch (error) {
        console.error(`[DelayQueue] Subscriber error:`, error);
      }
    });

    // Also notify wildcard subscribers
    const wildcardSubs = this.subscriptions.get('*') || [];
    wildcardSubs.forEach(callback => {
      try {
        callback(message);
      } catch (error) {
        console.error(`[DelayQueue] Wildcard subscriber error:`, error);
      }
    });
  }

  _cleanupExpired() {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, message] of this.messages) {
      if (message.status === 'pending' && message.deliverAt < now - 60000) {
        message.status = 'expired';
        this.stats.totalExpired++;
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[DelayQueue] Cleaned up ${cleaned} expired messages`);
    }
  }

  enqueue(topic, payload, options = {}) {
    const delay = options.delay || this.config.defaultDelay;

    // Validate delay
    if (delay < this.config.minDelay) {
      throw new Error(`Delay must be at least ${this.config.minDelay}ms`);
    }
    if (delay > this.config.maxDelay) {
      throw new Error(`Delay cannot exceed ${this.config.maxDelay}ms`);
    }

    // Check max messages
    if (this.messages.size >= this.config.maxMessages) {
      throw new Error(`Queue is full (max ${this.config.maxMessages} messages)`);
    }

    const message = {
      id: `msg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      topic,
      payload,
      status: 'pending',
      delay,
      deliverAt: Date.now() + delay,
      scheduledAt: Date.now(),
      deliveredAt: null,
      expiredAt: null,
      metadata: options.metadata || {}
    };

    this.messages.set(message.id, message);
    this.stats.totalEnqueued++;

    console.log(`[DelayQueue] Enqueued message ${message.id} to ${topic} (delay: ${delay}ms)`);

    return {
      messageId: message.id,
      topic,
      delay,
      deliverAt: message.deliverAt
    };
  }

  enqueueAt(topic, payload, timestamp, options = {}) {
    const delay = timestamp - Date.now();

    if (delay < this.config.minDelay) {
      throw new Error(`Delay must be at least ${this.config.minDelay}ms`);
    }
    if (delay > this.config.maxDelay) {
      throw new Error(`Delay cannot exceed ${this.config.maxDelay}ms`);
    }

    const message = {
      id: `msg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      topic,
      payload,
      status: 'pending',
      delay,
      deliverAt: timestamp,
      scheduledAt: Date.now(),
      deliveredAt: null,
      expiredAt: null,
      metadata: options.metadata || {}
    };

    this.messages.set(message.id, message);
    this.stats.totalEnqueued++;

    console.log(`[DelayQueue] Enqueued message ${message.id} to ${topic} (scheduled: ${new Date(timestamp).toISOString()})`);

    return {
      messageId: message.id,
      topic,
      scheduledFor: timestamp,
      deliverAt: message.deliverAt
    };
  }

  cancel(messageId) {
    const message = this.messages.get(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    if (message.status !== 'pending') {
      throw new Error(`Cannot cancel message with status: ${message.status}`);
    }

    message.status = 'cancelled';
    message.cancelledAt = Date.now();
    this.stats.totalCancelled++;

    console.log(`[DelayQueue] Cancelled message ${messageId}`);
    return true;
  }

  getMessage(messageId) {
    const message = this.messages.get(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }
    return message;
  }

  listMessages(filter) {
    let messages = Array.from(this.messages.values());

    if (filter) {
      if (filter.topic) {
        messages = messages.filter(m => m.topic === filter.topic);
      }
      if (filter.status) {
        messages = messages.filter(m => m.status === filter.status);
      }
    }

    return messages;
  }

  getPendingCount() {
    let count = 0;
    for (const msg of this.messages.values()) {
      if (msg.status === 'pending') count++;
    }
    return count;
  }

  subscribe(topic, callback) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
    }
    this.subscriptions.get(topic).push(callback);
    console.log(`[DelayQueue] Subscribed to ${topic}`);
    return true;
  }

  unsubscribe(topic, callback) {
    const subs = this.subscriptions.get(topic);
    if (!subs) return false;

    const index = subs.indexOf(callback);
    if (index > -1) {
      subs.splice(index, 1);
      console.log(`[DelayQueue] Unsubscribed from ${topic}`);
      return true;
    }
    return false;
  }

  clear() {
    let cleared = 0;
    for (const [id, message] of this.messages) {
      if (message.status === 'pending') {
        message.status = 'cancelled';
        cleared++;
      }
    }
    console.log(`[DelayQueue] Cleared ${cleared} pending messages`);
    return { cleared };
  }

  getStatistics() {
    const byStatus = {};
    for (const msg of this.messages.values()) {
      byStatus[msg.status] = (byStatus[msg.status] || 0) + 1;
    }

    const byTopic = {};
    for (const msg of this.messages.values()) {
      byTopic[msg.topic] = (byTopic[msg.topic] || 0) + 1;
    }

    return {
      enqueued: this.stats.totalEnqueued,
      delivered: this.stats.totalDelivered,
      expired: this.stats.totalExpired,
      cancelled: this.stats.totalCancelled,
      pending: this.getPendingCount(),
      total: this.messages.size,
      byStatus,
      byTopic
    };
  }

  shutdown() {
    if (this.processorTimer) {
      clearInterval(this.processorTimer);
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    console.log('Delay queue shut down');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const queue = new AgentDelayQueue({
    maxDelay: 60000,
    defaultDelay: 5000
  });

  switch (command) {
    case 'enqueue':
      const result = queue.enqueue(args[1] || 'test-topic', {
        data: 'test-payload'
      }, { delay: parseInt(args[2]) || 5000 });
      console.log('Enqueued:', result);
      break;

    case 'enqueue-at':
      const atResult = queue.enqueueAt(args[1] || 'test-topic', {
        data: 'test-payload'
      }, Date.now() + parseInt(args[2]) || 5000);
      console.log('Enqueued:', atResult);
      break;

    case 'cancel':
      queue.cancel(args[1]);
      console.log('Cancelled message');
      break;

    case 'list':
      const messages = queue.listMessages(
        args[1] ? { status: args[1] } : undefined
      );
      console.log('Messages:');
      messages.forEach(m => console.log(`  - [${m.status}] ${m.topic}: ${m.id}`));
      break;

    case 'stats':
      const stats = queue.getStatistics();
      console.log('Delay Queue Statistics:', stats);
      break;

    case 'clear':
      const cleared = queue.clear();
      console.log('Cleared:', cleared);
      break;

    case 'demo':
      console.log('=== Agent Delay Queue Demo ===\n');

      // Subscribe to topics
      console.log('1. Subscribing to topics:');
      queue.subscribe('narrator.events', (msg) => {
        console.log(`   [Subscriber] Received: ${msg.topic} - ${JSON.stringify(msg.payload)}`);
      });
      queue.subscribe('core.updates', (msg) => {
        console.log(`   [Subscriber] Received: ${msg.topic} - ${JSON.stringify(msg.payload)}`);
      });
      console.log('   Subscribed to narrator.events and core.updates');

      // Enqueue messages with different delays
      console.log('\n2. Enqueuing messages:');

      // Short delay (1s)
      const msg1 = queue.enqueue('narrator.events', { event: 'start', sessionId: 's1' }, { delay: 1000 });
      console.log(`   Enqueued: narrator.events (delay: 1000ms) -> ${msg1.messageId}`);

      // Short delay (1.5s)
      const msg2 = queue.enqueue('narrator.events', { event: 'progress', sessionId: 's1', progress: 25 }, { delay: 1500 });
      console.log(`   Enqueued: narrator.events (delay: 1500ms) -> ${msg2.messageId}`);

      // Medium delay (2s)
      const msg3 = queue.enqueue('narrator.events', { event: 'progress', sessionId: 's1', progress: 50 }, { delay: 2000 });
      console.log(`   Enqueued: narrator.events (delay: 2000ms) -> ${msg3.messageId}`);

      // Longer delay (3s)
      const msg4 = queue.enqueue('core.updates', { type: 'config', key: 'timeout' }, { delay: 3000 });
      console.log(`   Enqueued: core.updates (delay: 3000ms) -> ${msg4.messageId}`);

      // Core update with short delay
      const msg5 = queue.enqueue('core.updates', { type: 'status', online: true }, { delay: 1200 });
      console.log(`   Enqueued: core.updates (delay: 1200ms) -> ${msg5.messageId}`);

      // Show initial stats
      console.log('\n3. Initial statistics:');
      const initialStats = queue.getStatistics();
      console.log(`   Pending: ${initialStats.pending}, Total: ${initialStats.total}`);

      // Wait for messages to be delivered
      console.log('\n4. Waiting for message delivery...\n');

      await new Promise(resolve => setTimeout(resolve, 2500));

      // Show stats after delivery
      console.log('\n5. Statistics after delivery:');
      const finalStats = queue.getStatistics();
      console.log(`   Delivered: ${finalStats.delivered}`);
      console.log(`   Pending: ${finalStats.pending}`);
      console.log(`   Total: ${finalStats.total}`);
      console.log(`   By topic:`, finalStats.byTopic);

      // List messages by status
      console.log('\n6. Messages by status:');
      const delivered = queue.listMessages({ status: 'delivered' });
      const pending = queue.listMessages({ status: 'pending' });
      console.log(`   Delivered: ${delivered.length}`);
      console.log(`   Pending: ${pending.length}`);

      // Test cancel
      console.log('\n7. Testing cancel:');
      const cancelMsg = queue.enqueue('test.cancel', { data: 'will cancel' }, { delay: 10000 });
      console.log(`   Enqueued cancelable message: ${cancelMsg.messageId}`);
      console.log(`   Pending before cancel: ${queue.getPendingCount()}`);
      queue.cancel(cancelMsg.messageId);
      console.log(`   Cancelled: ${cancelMsg.messageId}`);
      console.log(`   Pending after cancel: ${queue.getPendingCount()}`);

      // Final stats
      console.log('\n8. Final statistics:');
      const endStats = queue.getStatistics();
      console.log(`   Total enqueued: ${endStats.enqueued}`);
      console.log(`   Delivered: ${endStats.delivered}`);
      console.log(`   Cancelled: ${endStats.cancelled}`);
      console.log(`   Pending: ${endStats.pending}`);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-delay-queue.js <command> [args]');
      console.log('\nCommands:');
      console.log('  enqueue <topic> [delay]    Enqueue message with delay');
      console.log('  enqueue-at <topic> <ms>   Enqueue message at specific time');
      console.log('  cancel <messageId>         Cancel pending message');
      console.log('  list [status]              List messages');
      console.log('  stats                     Get statistics');
      console.log('  clear                     Clear all pending messages');
      console.log('  demo                      Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentDelayQueue;
