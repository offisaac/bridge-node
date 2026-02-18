/**
 * Agent Message Broker
 * Distributed message broker for Universal-Narrator-Core
 */

const crypto = require('crypto');

class AgentMessageBroker {
  constructor(options = {}) {
    this.topics = new Map();
    this.subscriptions = new Map();
    this.messages = new Map();
    this.consumers = new Map();

    this.config = {
      retentionPeriod: options.retentionPeriod || 3600000, // 1 hour
      maxMessagesPerTopic: options.maxMessagesPerTopic || 10000,
      ackTimeout: options.ackTimeout || 30000,
      maxRetries: options.maxRetries || 3,
      enablePersistence: options.enablePersistence !== false
    };

    this.stats = {
      totalPublished: 0,
      totalDelivered: 0,
      totalAcknowledged: 0,
      totalFailed: 0
    };

    // Initialize default topics
    this._initDefaultTopics();
  }

  _initDefaultTopics() {
    const defaultTopics = [
      { name: 'narrator.events', partitions: 3, retention: 3600000 },
      { name: 'core.updates', partitions: 2, retention: 1800000 },
      { name: 'agent.metrics', partitions: 1, retention: 600000 }
    ];

    defaultTopics.forEach(topic => this.createTopic(topic));
  }

  createTopic(topicConfig) {
    const { name, partitions, retention } = topicConfig;

    const topic = {
      id: `topic-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      partitions: partitions || 1,
      retention: retention || this.config.retentionPeriod,
      messageCount: 0,
      createdAt: new Date().toISOString()
    };

    // Initialize partitions
    topic.partitions = [];
    for (let i = 0; i < (topicConfig.partitions || 1); i++) {
      topic.partitions.push({
        id: i,
        messages: [],
        consumers: []
      });
    }

    this.topics.set(name, topic);
    console.log(`Topic created: ${topic.name} (${topicConfig.partitions || 1} partitions)`);
    return topic;
  }

  getTopic(name) {
    const topic = this.topics.get(name);
    if (!topic) {
      throw new Error(`Topic not found: ${name}`);
    }
    return topic;
  }

  listTopics() {
    return Array.from(this.topics.values()).map(t => ({
      id: t.id,
      name: t.name,
      partitions: t.partitions.length,
      messageCount: t.messageCount
    }));
  }

  deleteTopic(name) {
    const deleted = this.topics.delete(name);
    if (deleted) {
      this.subscriptions.delete(name);
      console.log(`Topic deleted: ${name}`);
    }
    return deleted;
  }

  publish(topicName, payload, options = {}) {
    const topic = this.getTopic(topicName);

    // Select partition (round-robin or hash-based)
    const partitionId = options.partition !== undefined
      ? options.partition
      : this._selectPartition(topic);

    const partition = topic.partitions[partitionId];

    const message = {
      id: `msg-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      topic: topicName,
      partition: partitionId,
      payload,
      key: options.key || null,
      headers: options.headers || {},
      timestamp: Date.now(),
      offset: partition.messages.length,
      acked: false,
      retryCount: 0
    };

    // Check retention limit
    if (partition.messages.length >= this.config.maxMessagesPerTopic) {
      // Remove oldest message
      partition.messages.shift();
    }

    partition.messages.push(message);
    this.messages.set(message.id, message);
    topic.messageCount++;
    this.stats.totalPublished++;

    console.log(`[Broker] Published message ${message.id} to ${topicName}[${partitionId}]`);

    // Deliver to consumers
    this._deliverMessage(message, partition);

    return {
      messageId: message.id,
      topic: topicName,
      partition: partitionId,
      offset: message.offset
    };
  }

  _selectPartition(topic) {
    // Round-robin partition selection
    const counts = topic.partitions.map(p => p.messages.length);
    let minCount = counts[0];
    let selected = 0;
    for (let i = 1; i < counts.length; i++) {
      if (counts[i] < minCount) {
        minCount = counts[i];
        selected = i;
      }
    }
    return selected;
  }

  _deliverMessage(message, partition) {
    const topicSubs = this.subscriptions.get(message.topic) || [];

    topicSubs.forEach(sub => {
      // Check if consumer is assigned to this partition
      if (sub.partitions.includes(message.partition) || sub.partitions.length === 0) {
        this._sendToConsumer(sub, message);
      }
    });
  }

  _sendToConsumer(consumer, message) {
    const delivery = {
      messageId: message.id,
      topic: message.topic,
      partition: message.partition,
      payload: message.payload,
      timestamp: message.timestamp
    };

    if (consumer.callback) {
      try {
        consumer.callback(delivery);
        this.stats.totalDelivered++;
      } catch (error) {
        console.error(`[Broker] Consumer error:`, error);
        this.stats.totalFailed++;
      }
    }
  }

  subscribe(topicName, consumerId, callback, options = {}) {
    const topic = this.getTopic(topicName);

    if (!this.consumers.has(consumerId)) {
      this.consumers.set(consumerId, {
        id: consumerId,
        subscriptions: new Map(),
        offsets: new Map()
      });
    }

    const consumer = this.consumers.get(consumerId);

    const subscription = {
      id: `sub-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      consumerId,
      topic: topicName,
      partitions: options.partitions || [],
      callback,
      createdAt: new Date().toISOString()
    };

    if (!this.subscriptions.has(topicName)) {
      this.subscriptions.set(topicName, []);
    }
    this.subscriptions.get(topicName).push(subscription);
    consumer.subscriptions.set(topicName, subscription);

    // Initialize offsets for partitions
    topic.partitions.forEach(p => {
      if (!consumer.offsets.has(`${topicName}-${p.id}`)) {
        consumer.offsets.set(`${topicName}-${p.id}`, 0);
      }
    });

    console.log(`[Broker] Consumer ${consumerId} subscribed to ${topicName}`);
    return subscription;
  }

  unsubscribe(topicName, consumerId) {
    const subs = this.subscriptions.get(topicName);
    if (!subs) return false;

    const index = subs.findIndex(s => s.consumerId === consumerId);
    if (index > -1) {
      subs.splice(index, 1);
      const consumer = this.consumers.get(consumerId);
      if (consumer) {
        consumer.subscriptions.delete(topicName);
      }
      console.log(`[Broker] Consumer ${consumerId} unsubscribed from ${topicName}`);
      return true;
    }
    return false;
  }

  acknowledge(messageId, consumerId) {
    const message = this.messages.get(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    message.acked = true;
    this.stats.totalAcknowledged++;

    console.log(`[Broker] Message ${messageId} acknowledged by ${consumerId}`);
    return true;
  }

  getMessage(messageId) {
    const message = this.messages.get(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }
    return message;
  }

  getTopicMessages(topicName, options = {}) {
    const topic = this.topics.get(topicName);
    if (!topic) {
      return [];
    }

    let messages = [];
    topic.partitions.forEach((p, idx) => {
      p.messages.forEach(m => {
        messages.push({ ...m, partition: idx });
      });
    });

    // Sort by timestamp
    messages.sort((a, b) => a.timestamp - b.timestamp);

    if (options.offset !== undefined) {
      messages = messages.slice(options.offset);
    }
    if (options.limit !== undefined) {
      messages = messages.slice(0, options.limit);
    }

    return messages;
  }

  listConsumers() {
    return Array.from(this.consumers.values()).map(c => ({
      id: c.id,
      subscriptions: Array.from(c.subscriptions.keys()),
      offsets: Object.fromEntries(c.offsets)
    }));
  }

  getConsumerOffset(consumerId, topicName, partitionId) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      throw new Error(`Consumer not found: ${consumerId}`);
    }

    const key = `${topicName}-${partitionId}`;
    return consumer.offsets.get(key) || 0;
  }

  setConsumerOffset(consumerId, topicName, partitionId, offset) {
    const consumer = this.consumers.get(consumerId);
    if (!consumer) {
      throw new Error(`Consumer not found: ${consumerId}`);
    }

    const key = `${topicName}-${partitionId}`;
    consumer.offsets.set(key, offset);
    console.log(`[Broker] Consumer ${consumerId} offset set to ${offset} for ${topicName}[${partitionId}]`);
    return true;
  }

  getStatistics() {
    const topicStats = {};
    for (const [name, topic] of this.topics) {
      topicStats[name] = {
        partitions: topic.partitions.length,
        totalMessages: topic.messageCount
      };
    }

    return {
      published: this.stats.totalPublished,
      delivered: this.stats.totalDelivered,
      acknowledged: this.stats.totalAcknowledged,
      failed: this.stats.totalFailed,
      topics: this.topics.size,
      consumers: this.consumers.size,
      topicStats
    };
  }

  shutdown() {
    console.log('Message broker shut down');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const broker = new AgentMessageBroker({
    maxMessagesPerTopic: 1000,
    retentionPeriod: 3600000
  });

  switch (command) {
    case 'list-topics':
      const topics = broker.listTopics();
      console.log('Topics:');
      topics.forEach(t => console.log(`  - ${t.name}: ${t.partitions} partitions, ${t.messageCount} messages`));
      break;

    case 'create-topic':
      const newTopic = broker.createTopic({
        name: args[1] || 'custom-topic',
        partitions: parseInt(args[2]) || 1
      });
      console.log('Topic created:', newTopic.name);
      break;

    case 'publish':
      const result = broker.publish(args[1] || 'test-topic', {
        data: 'test-message'
      });
      console.log('Published:', result);
      break;

    case 'subscribe':
      broker.subscribe(args[1] || 'test-topic', args[2] || 'consumer-1', (msg) => {
        console.log(`[Consumer] Received:`, msg.topic, msg.payload);
      });
      console.log('Subscribed');
      break;

    case 'ack':
      broker.acknowledge(args[1], args[2] || 'consumer-1');
      console.log('Acknowledged');
      break;

    case 'list-consumers':
      const consumers = broker.listConsumers();
      console.log('Consumers:');
      consumers.forEach(c => console.log(`  - ${c.id}: ${c.subscriptions.length} subscriptions`));
      break;

    case 'stats':
      const stats = broker.getStatistics();
      console.log('Message Broker Statistics:', stats);
      break;

    case 'demo':
      console.log('=== Agent Message Broker Demo ===\n');

      // List topics
      console.log('1. Existing Topics:');
      const topicList = broker.listTopics();
      topicList.forEach(t => {
        console.log(`   - ${t.name}: ${t.partitions} partitions`);
      });

      // Create custom topic
      console.log('\n2. Creating Custom Topic:');
      const customTopic = broker.createTopic({
        name: 'narrator.pipeline',
        partitions: 4,
        retention: 7200000
      });
      console.log(`   Created: ${customTopic.name} with ${customTopic.partitions.length} partitions`);

      // Subscribe consumers
      console.log('\n3. Subscribing Consumers:');

      const consumer1Messages = [];
      broker.subscribe('narrator.events', 'consumer-1', (msg) => {
        consumer1Messages.push(msg);
        console.log(`   [consumer-1] Received: ${msg.topic} - ${JSON.stringify(msg.payload)}`);
      });
      console.log('   Subscribed consumer-1 to narrator.events');

      const consumer2Messages = [];
      broker.subscribe('core.updates', 'consumer-2', (msg) => {
        consumer2Messages.push(msg);
        console.log(`   [consumer-2] Received: ${msg.topic} - ${JSON.stringify(msg.payload)}`);
      });
      console.log('   Subscribed consumer-2 to core.updates');

      const consumer3Messages = [];
      broker.subscribe('narrator.pipeline', 'consumer-3', (msg) => {
        consumer3Messages.push(msg);
        console.log(`   [consumer-3] Received: ${msg.topic} - ${JSON.stringify(msg.payload)}`);
      });
      console.log('   Subscribed consumer-3 to narrator.pipeline');

      // Publish messages
      console.log('\n4. Publishing Messages:');

      // Narrator events
      for (let i = 1; i <= 3; i++) {
        broker.publish('narrator.events', {
          event: 'narrator.start',
          sessionId: `session-${i}`,
          timestamp: Date.now()
        });
      }
      console.log('   Published 3 messages to narrator.events');

      // Core updates
      for (let i = 1; i <= 2; i++) {
        broker.publish('core.updates', {
          type: 'config',
          key: `key-${i}`,
          value: `value-${i}`
        });
      }
      console.log('   Published 2 messages to core.updates');

      // Narrator pipeline (multi-partition)
      for (let i = 1; i <= 4; i++) {
        broker.publish('narrator.pipeline', {
          stage: `stage-${i}`,
          status: i === 3 ? 'failed' : 'completed'
        }, { partition: (i - 1) % 4 });
      }
      console.log('   Published 4 messages to narrator.pipeline (across partitions)');

      // List consumers with offsets
      console.log('\n5. Consumer Status:');
      const consumerList = broker.listConsumers();
      consumerList.forEach(c => {
        console.log(`   - ${c.id}:`);
        console.log(`     Subscriptions: ${c.subscriptions.join(', ')}`);
        console.log(`     Offsets:`, c.offsets);
      });

      // Acknowledge some messages
      console.log('\n6. Acknowledging Messages:');
      const events = broker.getTopicMessages('narrator.events');
      if (events.length > 0) {
        broker.acknowledge(events[0].id, 'consumer-1');
        console.log(`   Acknowledged first message from narrator.events`);
      }

      // Statistics
      console.log('\n7. Statistics:');
      const finalStats = broker.getStatistics();
      console.log(`   Total published: ${finalStats.published}`);
      console.log(`   Total delivered: ${finalStats.delivered}`);
      console.log(`   Total acknowledged: ${finalStats.acknowledged}`);
      console.log(`   Failed: ${finalStats.failed}`);
      console.log(`   Topics: ${finalStats.topics}`);
      console.log(`   Consumers: ${finalStats.consumers}`);

      // Message counts by topic
      console.log('\n8. Messages by Topic:');
      console.log(`   narrator.events: ${finalStats.topicStats['narrator.events']?.totalMessages || 0}`);
      console.log(`   core.updates: ${finalStats.topicStats['core.updates']?.totalMessages || 0}`);
      console.log(`   narrator.pipeline: ${finalStats.topicStats['narrator.pipeline']?.totalMessages || 0}`);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-message-broker.js <command> [args]');
      console.log('\nCommands:');
      console.log('  list-topics             List topics');
      console.log('  create-topic <name>     Create topic');
      console.log('  publish <topic>         Publish message');
      console.log('  subscribe <topic> <id> Subscribe consumer');
      console.log('  ack <msgId> <consumer> Acknowledge message');
      console.log('  list-consumers          List consumers');
      console.log('  stats                  Get statistics');
      console.log('  demo                   Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentMessageBroker;
