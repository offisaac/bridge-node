/**
 * Agent Matrix2 - Enhanced Matrix Integration Agent
 *
 * Matrix integration with rooms, encryption, and advanced messaging.
 *
 * Usage: node agent-matrix2.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   send        - Send test message
 *   rooms       - Show room management
 */

class MatrixUser {
  constructor(config) {
    this.userId = config.userId;
    this.localpart = config.localpart;
    this.domain = config.domain;
    this.displayName = config.displayName || '';
    this.avatarUrl = config.avatarUrl || '';
    this.deviceId = config.deviceId;
  }
}

class MatrixRoom {
  constructor(config) {
    this.roomId = config.roomId;
    this.name = config.name;
    this.topic = config.topic || '';
    this.alias = config.alias || '';
    this.isDirect = config.isDirect || false;
    this.joinRule = config.joinRule || 'public'; // public, invite, private
    this.members = new Set();
    this.events = [];
    this.createdAt = Date.now();
  }

  addMember(userId) {
    this.members.add(userId);
  }

  removeMember(userId) {
    this.members.delete(userId);
  }
}

class MatrixEvent {
  constructor(config) {
    this.eventId = `$${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.type = config.type; // m.room.message, m.room.member, etc.
    this.roomId = config.roomId;
    this.sender = config.sender;
    this.content = config.content;
    this.originServerTs = Date.now();
    this.unsigned = {};
  }
}

class MatrixMessage {
  constructor(config) {
    this.msgtype = config.msgtype || 'm.text';
    this.body = config.body;
    this.formattedBody = config.formattedBody;
    this.format = config.format;
    this.url = config.url;
    this.info = config.info;
  }
}

class MatrixEncryption {
  constructor(algorithm = 'm.megolm.v1.aes-sha2') {
    this.algorithm = algorithm;
    this.rotationPeriod = 604800000; // 7 days in ms
    this.rotationEvents = 100;
  }
}

class MatrixAgent {
  constructor(config = {}) {
    this.homeserver = config.homeserver || 'https://matrix.example.com';
    this.accessToken = config.accessToken || 'access-token-default';
    this.userId = config.userId || '@bot:example.com';
    this.deviceId = config.deviceId || 'DEVICE_ID';
    this.rooms = new Map();
    this.users = new Map();
    this.events = new Map();
    this.encryption = new Map();
    this.stats = {
      messages: 0,
      sent: 0,
      joined: 0,
      invites: 0
    };
  }

  createRoom(options = {}) {
    const roomId = `!${Date.now()}-${Math.random().toString(36).substr(2, 9)}:example.com`;
    const room = new MatrixRoom({
      roomId,
      name: options.name || 'New Room',
      topic: options.topic,
      alias: options.roomAliasName,
      isDirect: options.isDirect,
      joinRule: options.joinRule || 'public'
    });

    this.rooms.set(room.roomId, room);
    console.log(`   Created room: ${room.name}`);

    // Add creator as member
    room.addMember(this.userId);
    this.stats.joined++;

    return room;
  }

  getRoom(roomIdOrAliasOrName) {
    return Array.from(this.rooms.values())
      .find(r => r.roomId === roomIdOrAliasOrName || r.alias === roomIdOrAliasOrName || r.name === roomIdOrAliasOrName);
  }

  joinRoom(roomIdOrAlias, options = {}) {
    const room = this.getRoom(roomIdOrAlias) || this.createRoom({ name: roomIdOrAlias });
    room.addMember(this.userId);
    this.stats.joined++;
    console.log(`   Joined room: ${room.name}`);
    return { room_id: room.roomId };
  }

  leaveRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.removeMember(this.userId);
      console.log(`   Left room: ${room.name}`);
      return { success: true };
    }
    return { success: false, reason: 'Room not found' };
  }

  inviteUser(roomId, userId) {
    const room = this.rooms.get(roomId);
    if (room) {
      room.addMember(userId);
      this.stats.invites++;
      console.log(`   Invited ${userId} to room ${room.name}`);
      return { success: true };
    }
    return { success: false, reason: 'Room not found' };
  }

  async sendMessage(roomId, content, options = {}) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, reason: 'Room not found' };
    }

    const message = new MatrixMessage({
      msgtype: options.msgtype || 'm.text',
      body: content,
      formattedBody: options.formattedBody,
      format: options.format
    });

    const event = new MatrixEvent({
      type: 'm.room.message',
      roomId,
      sender: this.userId,
      content: message
    });

    room.events.push(event);
    this.events.set(event.eventId, event);
    this.stats.messages++;
    this.stats.sent++;

    console.log(`   Sent message to room: ${room.name}`);
    return { event_id: event.eventId, room_id: roomId };
  }

  async sendStateEvent(roomId, eventType, content, options = {}) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, reason: 'Room not found' };
    }

    const event = new MatrixEvent({
      type: eventType,
      roomId,
      sender: this.userId,
      content
    });

    room.events.push(event);
    this.stats.messages++;

    console.log(`   Sent state event: ${eventType}`);
    return { event_id: event.eventId };
  }

  async setRoomName(roomId, name) {
    return this.sendStateEvent(roomId, 'm.room.name', { name });
  }

  async setRoomTopic(roomId, topic) {
    return this.sendStateEvent(roomId, 'm.room.topic', { topic });
  }

  async setRoomAvatar(roomId, avatarUrl) {
    return this.sendStateEvent(roomId, 'm.room.avatar', { url: avatarUrl });
  }

  async redactEvent(roomId, eventId, reason) {
    const event = this.events.get(eventId);
    if (event) {
      console.log(`   Redacted event in room`);
      return { success: true };
    }
    return { success: false, reason: 'Event not found' };
  }

  setUserTyping(roomId, userId, isTyping) {
    console.log(`   User ${userId} ${isTyping ? 'started' : 'stopped'} typing`);
    return { success: true };
  }

  async getMessages(roomId, options = {}) {
    const room = this.rooms.get(roomId);
    if (!room) {
      return { success: false, reason: 'Room not found' };
    }

    const limit = options.limit || 10;
    const messages = room.events
      .filter(e => e.type === 'm.room.message')
      .slice(-limit);

    return {
      chunk: messages.map(e => ({
        event_id: e.eventId,
        type: e.type,
        sender: e.sender,
        content: e.content,
        origin_server_ts: e.originServerTs
      }))
    };
  }

  enableEncryption(roomId, algorithm = 'm.megolm.v1.aes-sha2') {
    this.encryption.set(roomId, new MatrixEncryption(algorithm));
    console.log(`   Enabled encryption in room`);
    return { success: true };
  }

  getStats() {
    return {
      ...this.stats,
      rooms: this.rooms.size,
      users: this.users.size,
      events: this.events.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new MatrixAgent();

switch (command) {
  case 'demo':
    (async () => {
    console.log('=== Agent Matrix2 Demo\n');

    // 1. Create Rooms
    console.log('1. Room Management:');
    agent.createRoom({
      name: 'General Discussion',
      topic: 'General chat room',
      roomAliasName: 'general',
      joinRule: 'public'
    });
    agent.createRoom({
      name: 'Development',
      topic: 'Development discussions',
      roomAliasName: 'dev',
      joinRule: 'public'
    });
    agent.createRoom({
      name: 'Private Team',
      topic: 'Private team room',
      joinRule: 'invite',
      isDirect: true
    });
    console.log(`   Total rooms: ${agent.rooms.size}`);

    // 2. Join Room
    console.log('\n2. Join Room:');
    agent.joinRoom('#random:example.com');
    console.log(`   Total joined: ${agent.stats.joined}`);

    // 3. Room Management
    console.log('\n3. Room Settings:');
    const room = agent.getRoom('General Discussion');
    agent.setRoomName(room.roomId, 'General');
    agent.setRoomTopic(room.roomId, 'Company-wide discussions');
    console.log(`   Updated room settings`);

    // 4. Send Message
    console.log('\n4. Send Message:');
    const result1 = await agent.sendMessage(room.roomId, 'Hello from Matrix2 agent!');
    console.log(`   Status: ${result1.success !== false ? 'success' : 'failed'}`);

    // 5. Send Formatted Message
    console.log('\n5. Send Formatted Message:');
    await agent.sendMessage(room.roomId, 'This is bold text', {
      formattedBody: '<strong>This is bold text</strong>',
      format: 'org.matrix.custom.html'
    });
    console.log(`   Status: success`);

    // 6. Send State Event
    console.log('\n6. Send State Event:');
    await agent.setRoomAvatar(room.roomId, 'mxc://example.com/avatar');
    console.log(`   Status: success`);

    // 7. Invite User
    console.log('\n7. Invite User:');
    await agent.inviteUser(room.roomId, '@alice:example.com');
    console.log(`   Status: success`);

    // 8. Typing Indicator
    console.log('\n8. Typing Indicator:');
    agent.setUserTyping(room.roomId, '@alice:example.com', true);
    setTimeout(() => {
      agent.setUserTyping(room.roomId, '@alice:example.com', false);
    }, 100);
    console.log(`   Status: success`);

    // 9. Get Messages
    console.log('\n9. Get Messages:');
    const messages = await agent.getMessages(room.roomId, { limit: 5 });
    console.log(`   Retrieved ${messages.chunk.length} messages`);

    // 10. Enable Encryption
    console.log('\n10. Enable Encryption:');
    await agent.enableEncryption(room.roomId);
    console.log(`   Encryption enabled`);

    // 11. Redact Event
    console.log('\n11. Redact Event:');
    if (result1.event_id) {
      await agent.redactEvent(room.roomId, result1.event_id, 'Spam');
    }
    console.log(`   Status: success`);

    // 12. Leave Room
    console.log('\n12. Leave Room:');
    const tempRoom = agent.createRoom({ name: 'Temp Room' });
    await agent.leaveRoom(tempRoom.roomId);
    console.log(`   Left room`);

    // 13. Direct Message Room
    console.log('\n13. Direct Message:');
    const dmRoom = agent.createRoom({
      name: 'Alice DM',
      isDirect: true
    });
    console.log(`   Created DM room`);

    // 14. Statistics
    console.log('\n14. Statistics:');
    const stats = agent.getStats();
    console.log(`   Messages: ${stats.messages}`);
    console.log(`   Sent: ${stats.sent}`);
    console.log(`   Joined: ${stats.joined}`);
    console.log(`   Invites: ${stats.invites}`);
    console.log(`   Rooms: ${stats.rooms}`);

    console.log('\n=== Demo Complete ===');
    })();
    break;

  case 'send':
    console.log('Sending test message...');
    const room = agent.createRoom({ name: 'Test Room' });
    const result = await agent.sendMessage(room.roomId, 'Test message from Matrix2 agent');
    console.log(`Result: ${result.success !== false ? 'Success' : 'Failed'}`);
    break;

  case 'rooms':
    console.log('Matrix Rooms:');
    for (const [id, room] of agent.rooms) {
      console.log(`  - ${room.name} (${room.members.size} members)`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-matrix2.js [demo|send|rooms]');
}
