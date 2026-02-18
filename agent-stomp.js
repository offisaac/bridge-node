/**
 * Agent STOMP - STOMP Protocol Agent
 *
 * Provides STOMP messaging protocol capabilities.
 *
 * Usage: node agent-stomp.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   connect    - Connect to broker
 *   send       - Send message
 */

class STOMPConnection {
  constructor(config) {
    this.id = `stomp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.host = config.host;
    this.port = config.port || 61613;
    this.login = config.login || 'guest';
    this.passcode = config.passcode || 'guest';
    this.status = 'connected';
  }
}

class STOMPDestination {
  constructor(config) {
    this.id = `dest-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.type = config.type; // queue, topic
    this.subscribers = config.subscribers || 0;
  }
}

class STOMPMessage {
  constructor(config) {
    this.id = `stompmsg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.destination = config.destination;
    this.body = config.body;
    this.headers = config.headers || {};
    this.messageId = `msg-${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = Date.now();
  }
}

class STOMPSubscription {
  constructor(config) {
    this.id = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.destination = config.destination;
    this.id = config.subscriptionId || 'sub-1';
    this.ack = config.ack || 'auto';
  }
}

class STOMPAgent {
  constructor(config = {}) {
    this.name = config.name || 'STOMPAgent';
    this.version = config.version || '1.0';
    this.connections = new Map();
    this.destinations = new Map();
    this.messages = new Map();
    this.subscriptions = new Map();
    this.stats = {
      connections: 0,
      destinations: 0,
      messagesSent: 0,
      messagesReceived: 0
    };
    this.initDefaults();
  }

  initDefaults() {
    const destinations = [
      new STOMPDestination({ name: '/queue/orders', type: 'queue', subscribers: 2 }),
      new STOMPDestination({ name: '/topic/notifications', type: 'topic', subscribers: 5 }),
      new STOMPDestination({ name: '/queue/events', type: 'queue', subscribers: 1 })
    ];
    destinations.forEach(d => {
      this.destinations.set(d.id, d);
      this.stats.destinations++;
    });
  }

  connect(host, port, login, passcode) {
    const conn = new STOMPConnection({ host, port, login, passcode });
    this.connections.set(conn.id, conn);
    this.stats.connections++;
    return conn;
  }

  send(destination, body, headers) {
    const msg = new STOMPMessage({ destination, body, headers });
    this.messages.set(msg.id, msg);
    this.stats.messagesSent++;
    return msg;
  }

  subscribe(destination, subscriptionId, ack) {
    const sub = new STOMPSubscription({ destination, subscriptionId, ack });
    this.subscriptions.set(sub.id, sub);

    const dest = Array.from(this.destinations.values()).find(d => d.name === destination);
    if (dest) dest.subscribers++;

    return sub;
  }

  receive(destination) {
    const messages = Array.from(this.messages.values()).filter(m => m.destination === destination);
    if (messages.length === 0) return null;
    const msg = messages[0];
    this.messages.delete(msg.id);
    this.stats.messagesReceived++;
    return msg;
  }

  listDestinations() {
    return Array.from(this.destinations.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const stomp = new STOMPAgent();

switch (command) {
  case 'demo': {
    console.log('=== Agent STOMP Demo\n');

    // 1. Destinations
    console.log('1. Destinations:');
    stomp.listDestinations().forEach(d => {
      console.log(`   ${d.name} (${d.type}): ${d.subscribers} subscribers`);
    });

    // 2. Send Message
    console.log('\n2. Send Message:');
    const msg = stomp.send('/queue/orders', JSON.stringify({ orderId: '123', item: 'Product A' }), { priority: 'high' });
    console.log(`   Sent to ${msg.destination}`);

    // 3. Subscribe
    console.log('\n3. Subscribe:');
    const sub = stomp.subscribe('/topic/notifications', 'sub-1', 'client');
    console.log(`   Subscribed to ${sub.destination} [${sub.ack}]`);

    // 4. Receive
    console.log('\n4. Receive Message:');
    const received = stomp.receive('/queue/orders');
    console.log(`   Received: ${received ? received.body : 'none'}`);

    // 5. STOMP Frames
    console.log('\n5. STOMP Frames:');
    console.log('   CONNECT: Establish connection');
    console.log('   SEND: Send message to destination');
    console.log('   SUBSCRIBE: Subscribe to destination');
    console.log('   UNSUBSCRIBE: Unsubscribe');
    console.log('   ACK: Acknowledge message');
    console.log('   NACK: Reject message');
    console.log('   DISCONNECT: Close connection');

    // 6. Destination Types
    console.log('\n6. Destination Types:');
    console.log('   /queue/: Point-to-point (one consumer)');
    console.log('   /topic/: Publish-subscribe (all consumers)');
    console.log('   /temp-queue/: Temporary reply queue');
    console.log('   /temp-topic/: Temporary topic');

    // 7. Headers
    console.log('\n7. Common Headers:');
    console.log('   destination: Target queue/topic');
    console.log('   content-type: Message MIME type');
    console.log('   correlation-id: Request matching');
    console.log('   reply-to: Response destination');
    console.log('   priority: Message priority');

    // 8. Acknowledgment
    console.log('\n8. Acknowledgment Modes:');
    console.log('   auto: Auto-ack on receive');
    console.log('   client: Manual ack required');
    console.log('   client-individual: Per-message ack');

    // 9. Brokers
    console.log('\n9. STOMP Brokers:');
    console.log('   Apache ActiveMQ');
    console.log('   RabbitMQ (STOMP plugin)');
    console.log('   HornetQ');
    console.log('   Apollo');

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = stomp.getStats();
    console.log(`   Connections: ${stats.connections}`);
    console.log(`   Destinations: ${stats.destinations}`);
    console.log(`   Sent: ${stats.messagesSent}`);
    console.log(`   Received: ${stats.messagesReceived}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'connect': {
    const host = args[1] || 'localhost';
    const port = args[2] || 61613;
    const conn = stomp.connect(host, port, 'guest', 'guest');
    console.log(`Connected to ${conn.host}:${conn.port}`);
    break;
  }

  case 'send': {
    const dest = args[1] || '/queue/test';
    const body = args[2] || 'Hello STOMP';
    const msg = stomp.send(dest, body);
    console.log(`Sent to ${msg.destination}`);
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-stomp.js [demo|connect|send]');
  }
}
