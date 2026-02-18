/**
 * Agent AMQP - AMQP Protocol Agent
 *
 * Provides AMQP message protocol capabilities.
 *
 * Usage: node agent-amqp.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   connect    - Connect to broker
 *   publish    - Publish message
 */

class AMQPConnection {
  constructor(config) {
    this.id = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.host = config.host;
    this.port = config.port || 5672;
    this.vhost = config.vhost || '/';
    this.status = 'connected';
  }
}

class AMQPExchange {
  constructor(config) {
    this.id = `exchange-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.type = config.type || 'direct'; // direct, fanout, topic, headers
    this.durable = config.durable || true;
    this.bindings = config.bindings || [];
  }
}

class AMQPQueue {
  constructor(config) {
    this.id = `queue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.durable = config.durable || true;
    this.exclusive = config.exclusive || false;
    this.autoDelete = config.autoDelete || false;
    this.messageCount = config.messageCount || 0;
  }
}

class AMQPMessage {
  constructor(config) {
    this.id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.exchange = config.exchange;
    this.routingKey = config.routingKey;
    this.body = config.body;
    this.headers = config.headers || {};
    this.deliveryMode = config.deliveryMode || 2;
    this.timestamp = Date.now();
  }
}

class AMQPAgent {
  constructor(config = {}) {
    this.name = config.name || 'AMQPAgent';
    this.version = config.version || '1.0';
    this.connections = new Map();
    this.exchanges = new Map();
    this.queues = new Map();
    this.messages = new Map();
    this.stats = {
      connections: 0,
      exchanges: 0,
      queues: 0,
      messagesPublished: 0,
      messagesConsumed: 0
    };
    this.initDefaults();
  }

  initDefaults() {
    const exchanges = [
      new AMQPExchange({ name: 'orders', type: 'topic', durable: true }),
      new AMQPExchange({ name: 'notifications', type: 'fanout', durable: true }),
      new AMQPExchange({ name: 'events', type: 'direct', durable: true })
    ];
    exchanges.forEach(e => {
      this.exchanges.set(e.id, e);
      this.stats.exchanges++;
    });

    const queues = [
      new AMQPQueue({ name: 'order-queue', durable: true, messageCount: 10 }),
      new AMQPQueue({ name: 'notification-queue', durable: true, messageCount: 5 }),
      new AMQPQueue({ name: 'event-queue', durable: true, messageCount: 20 })
    ];
    queues.forEach(q => {
      this.queues.set(q.id, q);
      this.stats.queues++;
    });
  }

  connect(host, port, vhost) {
    const conn = new AMQPConnection({ host, port, vhost });
    this.connections.set(conn.id, conn);
    this.stats.connections++;
    return conn;
  }

  publish(exchange, routingKey, body, headers) {
    const msg = new AMQPMessage({ exchange, routingKey, body, headers });
    this.messages.set(msg.id, msg);
    this.stats.messagesPublished++;
    return msg;
  }

  consume(queueName) {
    const queue = Array.from(this.queues.values()).find(q => q.name === queueName);
    if (!queue) return null;
    this.stats.messagesConsumed++;
    if (queue.messageCount > 0) queue.messageCount--;
    return { queue: queue.name, messageCount: queue.messageCount };
  }

  listExchanges() {
    return Array.from(this.exchanges.values());
  }

  listQueues() {
    return Array.from(this.queues.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const amqp = new AMQPAgent();

switch (command) {
  case 'demo': {
    console.log('=== Agent AMQP Demo\n');

    // 1. Exchanges
    console.log('1. Exchanges:');
    amqp.listExchanges().forEach(e => {
      console.log(`   ${e.name}: ${e.type} (${e.durable ? 'durable' : 'non-durable'})`);
    });

    // 2. Queues
    console.log('\n2. Queues:');
    amqp.listQueues().forEach(q => {
      console.log(`   ${q.name}: ${q.messageCount} messages`);
    });

    // 3. Publish Message
    console.log('\n3. Publish Message:');
    const msg = amqp.publish('orders', 'order.created', { orderId: '12345', amount: 99.99 }, { priority: 'high' });
    console.log(`   Published to ${msg.exchange} with key ${msg.routingKey}`);

    // 4. Consume Message
    console.log('\n4. Consume Message:');
    const consumed = amqp.consume('order-queue');
    console.log(`   Consumed from ${consumed.queue}, remaining: ${consumed.messageCount}`);

    // 5. Exchange Types
    console.log('\n5. Exchange Types:');
    console.log('   direct: Exact key matching');
    console.log('   fanout: Broadcast to all queues');
    console.log('   topic: Wildcard pattern matching');
    console.log('   headers: Header-based routing');

    // 6. Queue Options
    console.log('\n6. Queue Options:');
    console.log('   durable: Survive broker restart');
    console.log('   exclusive: Single consumer');
    console.log('   autoDelete: Delete when unused');
    console.log('   message TTL: Expiration time');

    // 7. Message Properties
    console.log('\n7. Message Properties:');
    console.log('   deliveryMode: 1 (non-persistent), 2 (persistent)');
    console.log('   priority: Message priority 0-255');
    console.log('   contentType: MIME type');
    console.log('   correlationId: Request/response tracking');
    console.log('   replyTo: Response queue');

    // 8. Routing
    console.log('\n8. Routing Patterns:');
    console.log('   #: Match zero or more words');
    console.log('   *: Match exactly one word');
    console.log('   Example: order.# matches order.created, order.updated');

    // 9. Quality of Service
    console.log('\n9. Quality of Service:');
    console.log('   prefetch: Number of unacked messages');
    console.log('   consumer acknowledgments');
    console.log('   publisher confirms');

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = amqp.getStats();
    console.log(`   Connections: ${stats.connections}`);
    console.log(`   Exchanges: ${stats.exchanges}`);
    console.log(`   Queues: ${stats.queues}`);
    console.log(`   Published: ${stats.messagesPublished}`);
    console.log(`   Consumed: ${stats.messagesConsumed}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'connect': {
    const host = args[1] || 'localhost';
    const port = args[2] || 5672;
    const conn = amqp.connect(host, port, '/');
    console.log(`Connected to ${conn.host}:${conn.port}`);
    break;
  }

  case 'publish': {
    const exchange = args[1] || 'orders';
    const key = args[2] || 'test';
    const msg = amqp.publish(exchange, key, { data: 'test' });
    console.log(`Published to ${msg.exchange}`);
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-amqp.js [demo|connect|publish]');
  }
}
