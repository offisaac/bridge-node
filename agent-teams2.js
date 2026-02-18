/**
 * Agent Teams2 - Enhanced Microsoft Teams Integration Agent
 *
 * Microsoft Teams integration with bots, webhooks, and channel management.
 *
 * Usage: node agent-teams2.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   send        - Send test message
 *   teams       - Show team management
 */

class TeamsChannel {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description || '';
    this.membershipType = config.membershipType || 'standard'; // standard, private
    this.memberCount = config.memberCount || 0;
  }
}

class TeamsUser {
  constructor(config) {
    this.id = config.id;
    this.displayName = config.displayName;
    this.email = config.email;
    this.userPrincipalName = config.userPrincipalName;
    this.department = config.department;
    this.jobTitle = config.jobTitle;
    this.isBot = config.isBot || false;
  }
}

class TeamsMessage {
  constructor(config) {
    this.id = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.channelId = config.channelId;
    this.from = config.from;
    this.content = config.content;
    this.attachments = config.attachments || [];
    this.mentions = config.mentions || [];
    this.replyToId = config.replyToId || null;
    this.created = new Date();
    this.importance = config.importance || 'normal'; // normal, high, urgent
  }
}

class TeamsCard {
  constructor(config) {
    this.type = 'AdaptiveCard';
    this.version = config.version || '1.4';
    this.body = config.body || [];
    this.actions = config.actions || [];
    this.schema = 'http://adaptivecards.io/schemas/adaptive-card.json';
  }

  toJSON() {
    return {
      type: this.type,
      version: this.version,
      body: this.body,
      actions: this.actions,
      '$schema': this.schema
    };
  }
}

class TeamsAgent {
  constructor(config = {}) {
    this.tenantId = config.tenantId || 'tenant-default';
    this.clientId = config.clientId || 'client-default';
    this.clientSecret = config.clientSecret || 'secret-default';
    this.botId = config.botId || 'bot-id';
    this.teams = new Map();
    this.channels = new Map();
    this.users = new Map();
    this.messages = new Map();
    this.stats = {
      messages: 0,
      sent: 0,
      cards: 0,
      meetings: 0
    };
  }

  createTeam(team) {
    this.teams.set(team.id, team);
    console.log(`   Created team: ${team.displayName}`);
    return team;
  }

  getTeam(teamId) {
    return this.teams.get(teamId);
  }

  addChannel(teamId, channel) {
    channel.teamId = teamId;
    this.channels.set(channel.id, channel);
    console.log(`   Added channel: ${channel.name}`);
    return channel;
  }

  getChannel(channelId) {
    return this.channels.get(channelId);
  }

  addUser(user) {
    this.users.set(user.id, user);
    console.log(`   Added user: ${user.displayName}`);
    return user;
  }

  async sendMessage(channelId, options = {}) {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return { success: false, reason: 'Channel not found' };
    }

    const message = new TeamsMessage({
      channelId,
      from: options.from || this.botId,
      content: options.content || '',
      attachments: options.attachments,
      mentions: options.mentions,
      replyToId: options.replyToId,
      importance: options.importance
    });

    this.messages.set(message.id, message);
    this.stats.messages++;
    this.stats.sent++;

    console.log(`   Sent message to channel: ${channel.name}`);
    return { success: true, messageId: message.id };
  }

  async sendCard(channelId, card, options = {}) {
    const channel = this.channels.get(channelId);
    if (!channel) {
      return { success: false, reason: 'Channel not found' };
    }

    this.stats.cards++;
    console.log(`   Sent Adaptive Card to channel: ${channel.name}`);

    return { success: true, cardId: card.id || `card-${Date.now()}` };
  }

  async replyToMessage(messageId, options = {}) {
    const parent = this.messages.get(messageId);
    if (!parent) {
      return { success: false, reason: 'Parent message not found' };
    }

    const reply = new TeamsMessage({
      channelId: parent.channelId,
      from: options.from || this.botId,
      content: options.content || '',
      replyToId: messageId
    });

    this.messages.set(reply.id, reply);
    this.stats.messages++;

    console.log(`   Replied to message`);
    return { success: true, messageId: reply.id };
  }

  async createMeeting(options = {}) {
    const meeting = {
      id: `meet-${Date.now()}`,
      subject: options.subject || 'Team Meeting',
      startDateTime: options.startDateTime || new Date().toISOString(),
      endDateTime: options.endDateTime || new Date(Date.now() + 3600000).toISOString(),
      participants: options.participants || [],
      organizer: options.organizer
    };

    this.stats.meetings++;
    console.log(`   Created meeting: ${meeting.subject}`);

    return { success: true, meetingId: meeting.id };
  }

  async uploadFile(channelId, fileName, content) {
    console.log(`   Uploaded file: ${fileName}`);
    return { success: true, fileId: `file-${Date.now()}` };
  }

  async getChannelMessages(channelId) {
    return Array.from(this.messages.values())
      .filter(m => m.channelId === channelId);
  }

  getStats() {
    return {
      ...this.stats,
      teams: this.teams.size,
      channels: this.channels.size,
      users: this.users.size,
      messages: this.messages.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new TeamsAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Teams2 Demo\n');

    // 1. Create Teams
    console.log('1. Team Management:');
    agent.createTeam({
      id: 'team-001',
      displayName: 'Engineering',
      description: 'Engineering team collaboration'
    });
    agent.createTeam({
      id: 'team-002',
      displayName: 'Marketing',
      description: 'Marketing team'
    });
    console.log(`   Total teams: ${agent.teams.size}`);

    // 2. Add Channels
    console.log('\n2. Channel Management:');
    agent.addChannel('team-001', new TeamsChannel({
      id: 'ch-001',
      name: 'General',
      description: 'General discussions'
    }));
    agent.addChannel('team-001', new TeamsChannel({
      id: 'ch-002',
      name: 'DevOps',
      description: 'DevOps channel'
    }));
    agent.addChannel('team-002', new TeamsChannel({
      id: 'ch-003',
      name: 'Announcements'
    }));
    console.log(`   Total channels: ${agent.channels.size}`);

    // 3. Add Users
    console.log('\n3. User Management:');
    agent.addUser(new TeamsUser({
      id: 'user-001',
      displayName: 'John Doe',
      email: 'john@example.com',
      userPrincipalName: 'john@example.com',
      jobTitle: 'Software Engineer'
    }));
    agent.addUser(new TeamsUser({
      id: 'user-002',
      displayName: 'Jane Smith',
      email: 'jane@example.com',
      jobTitle: 'Product Manager'
    }));
    console.log(`   Total users: ${agent.users.size}`);

    // 4. Send Message
    console.log('\n4. Send Message:');
    const result1 = await agent.sendMessage('ch-001', {
      content: 'Hello from Teams2 agent!'
    });
    console.log(`   Status: ${result1.success ? 'success' : 'failed'}`);

    // 5. Send with mentions
    console.log('\n5. Send with Mentions:');
    const result2 = await agent.sendMessage('ch-001', {
      content: 'Hey @John, please review this.',
      mentions: [{ id: 'user-001', name: 'John Doe' }]
    });
    console.log(`   Status: ${result2.success ? 'success' : 'failed'}`);

    // 6. Send Adaptive Card
    console.log('\n6. Send Adaptive Card:');
    const card = new TeamsCard({
      body: [
        {
          type: 'TextBlock',
          text: 'Incident Report',
          weight: 'bolder',
          size: 'medium'
        },
        {
          type: 'FactSet',
          facts: [
            { title: 'Severity', value: 'High' },
            { title: 'Status', value: 'Investigating' }
          ]
        }
      ],
      actions: [
        { type: 'Action.OpenUrl', title: 'View Details', url: 'https://example.com' }
      ]
    });
    const result3 = await agent.sendCard('ch-002', card);
    console.log(`   Status: ${result3.success ? 'success' : 'failed'}`);

    // 7. Reply to message
    console.log('\n7. Reply to Message:');
    const reply = await agent.replyToMessage(result1.messageId, {
      content: 'This is a reply'
    });
    console.log(`   Status: ${reply.success ? 'success' : 'failed'}`);

    // 8. Create Meeting
    console.log('\n8. Create Meeting:');
    const meeting = await agent.createMeeting({
      subject: 'Sprint Planning',
      startDateTime: new Date().toISOString(),
      endDateTime: new Date(Date.now() + 7200000).toISOString(),
      participants: ['user-001', 'user-002']
    });
    console.log(`   Status: ${meeting.success ? 'success' : 'failed'}`);

    // 9. Upload file
    console.log('\n9. Upload File:');
    const upload = await agent.uploadFile('ch-001', 'report.pdf', 'binary data');
    console.log(`   Status: ${upload.success ? 'success' : 'failed'}`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = agent.getStats();
    console.log(`   Messages: ${stats.messages}`);
    console.log(`   Sent: ${stats.sent}`);
    console.log(`   Cards: ${stats.cards}`);
    console.log(`   Meetings: ${stats.meetings}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'send':
    console.log('Sending test message...');
    const result = await agent.sendMessage('ch-001', {
      content: 'Test message from Teams2 agent'
    });
    console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
    break;

  case 'teams':
    console.log('Teams:');
    for (const [id, team] of agent.teams) {
      console.log(`  - ${team.displayName}`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-teams2.js [demo|send|teams]');
}
