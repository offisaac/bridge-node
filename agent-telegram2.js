/**
 * Agent Telegram2 - Enhanced Telegram Integration Agent
 *
 * Telegram integration with bots, inline queries, and payments.
 *
 * Usage: node agent-telegram2.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   send        - Send test message
 *   bots        - Show bot management
 */

class TelegramUser {
  constructor(config) {
    this.id = config.id;
    this.isBot = config.isBot || false;
    this.firstName = config.firstName;
    this.lastName = config.lastName || '';
    this.username = config.username || '';
    this.languageCode = config.languageCode || 'en';
  }

  get fullName() {
    return this.lastName ? `${this.firstName} ${this.lastName}` : this.firstName;
  }
}

class TelegramChat {
  constructor(config) {
    this.id = config.id;
    this.type = config.type; // private, group, supergroup, channel
    this.title = config.title || '';
    this.username = config.username || '';
    this.firstName = config.firstName || '';
    this.lastName = config.lastName || '';
    this.allMembersAreAdministrators = false;
  }
}

class TelegramMessage {
  constructor(config) {
    this.messageId = config.messageId || Date.now();
    this.from = config.from;
    this.chat = config.chat;
    this.date = Math.floor(Date.now() / 1000);
    this.text = config.text || '';
    this.entities = config.entities || [];
    this.photo = config.photo || [];
    this.document = config.document || null;
    this.replyToMessage = config.replyToMessage || null;
    this.callbackQuery = config.callbackQuery || null;
  }
}

class TelegramInlineKeyboardButton {
  constructor(options) {
    this.text = options.text;
    this.url = options.url;
    this.callbackData = options.callbackData;
    this.loginUrl = options.loginUrl;
    this.switchInlineQuery = options.switchInlineQuery;
  }
}

class TelegramInlineKeyboardMarkup {
  constructor(keyboard) {
    this.inline_keyboard = keyboard;
  }
}

class TelegramBotCommand {
  constructor(config) {
    this.command = config.command;
    this.description = config.description;
  }
}

class TelegramAgent {
  constructor(config = {}) {
    this.token = config.token || 'BOT_TOKEN';
    this.username = config.username || 'MyBot';
    this.chats = new Map();
    this.users = new Map();
    this.messages = new Map();
    this.commands = [];
    this.callbackQueries = new Map();
    this.stats = {
      messages: 0,
      sent: 0,
      edited: 0,
      callbacks: 0
    };
  }

  addChat(chat) {
    this.chats.set(chat.id, chat);
    console.log(`   Added chat: ${chat.title || chat.username || 'Private'}`);
    return chat;
  }

  getChat(chatId) {
    return this.chats.get(chatId);
  }

  addUser(user) {
    this.users.set(user.id, user);
    return user;
  }

  registerCommand(command) {
    this.commands.push(command);
    console.log(`   Registered command: /${command.command}`);
    return command;
  }

  async sendMessage(chatId, text, options = {}) {
    const chat = this.chats.get(chatId);
    if (!chat) {
      return { success: false, reason: 'Chat not found' };
    }

    const message = new TelegramMessage({
      chat,
      text,
      from: { id: 'bot', isBot: true, firstName: this.username }
    });

    const result = {
      success: true,
      message_id: message.messageId,
      chat: { id: chatId, type: chat.type },
      date: message.date
    };

    this.messages.set(`${chatId}-${message.messageId}`, message);
    this.stats.messages++;
    this.stats.sent++;

    console.log(`   Sent message to chat ${chatId}`);
    console.log(`   Text: ${text.substring(0, 30)}...`);

    return result;
  }

  async editMessageText(chatId, messageId, text, options = {}) {
    const key = `${chatId}-${messageId}`;
    const message = this.messages.get(key);
    if (message) {
      message.text = text;
      this.stats.edited++;
      console.log(`   Edited message`);
      return { success: true, message_id: messageId };
    }
    return { success: false, reason: 'Message not found' };
  }

  async deleteMessage(chatId, messageId) {
    const key = `${chatId}-${messageId}`;
    if (this.messages.has(key)) {
      this.messages.delete(key);
      console.log(`   Deleted message`);
      return { success: true };
    }
    return { success: false, reason: 'Message not found' };
  }

  async answerCallbackQuery(callbackQueryId, text, options = {}) {
    this.callbackQueries.set(callbackQueryId, { answered: true, text });
    this.stats.callbacks++;
    console.log(`   Answered callback query`);
    return { success: true };
  }

  async sendPhoto(chatId, photo, options = {}) {
    console.log(`   Sent photo to chat ${chatId}`);
    return {
      success: true,
      message_id: Date.now(),
      photo: [{ file_id: `photo-${Date.now()}`, width: 800, height: 600 }]
    };
  }

  async sendDocument(chatId, document, options = {}) {
    console.log(`   Sent document to chat ${chatId}`);
    return {
      success: true,
      message_id: Date.now(),
      document: { file_id: `doc-${Date.now()}`, file_name: document }
    };
  }

  async sendSticker(chatId, sticker) {
    console.log(`   Sent sticker to chat ${chatId}`);
    return {
      success: true,
      message_id: Date.now(),
      sticker: { file_id: `sticker-${Date.now()}` }
    };
  }

  async sendVenue(chatId, latitude, longitude, title, address, options = {}) {
    console.log(`   Sent venue to chat ${chatId}`);
    return {
      success: true,
      message_id: Date.now(),
      venue: {
        location: { latitude, longitude },
        title,
        address
      }
    };
  }

  async sendContact(chatId, phoneNumber, firstName, options = {}) {
    console.log(`   Sent contact to chat ${chatId}`);
    return {
      success: true,
      message_id: Date.now(),
      contact: { phone_number: phoneNumber, first_name: firstName, last_name: options.lastName || '' }
    };
  }

  async sendChatAction(chatId, action) {
    console.log(`   Sent action: ${action} to chat ${chatId}`);
    return { success: true };
  }

  async getChatMember(chatId, userId) {
    const chat = this.chats.get(chatId);
    const user = this.users.get(userId);
    if (chat && user) {
      return {
        success: true,
        user,
        status: 'member'
      };
    }
    return { success: false, reason: 'Chat or user not found' };
  }

  setMyCommands(commands) {
    this.commands = commands;
    console.log(`   Set ${commands.length} bot commands`);
    return { success: true };
  }

  getStats() {
    return {
      ...this.stats,
      chats: this.chats.size,
      users: this.users.size,
      messages: this.messages.size,
      commands: this.commands.length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new TelegramAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Telegram2 Demo\n');

    // 1. Chats
    console.log('1. Chat Management:');
    agent.addChat(new TelegramChat({
      id: 123456789,
      type: 'private',
      firstName: 'John',
      lastName: 'Doe',
      username: 'johndoe'
    }));
    agent.addChat(new TelegramChat({
      id: -1001234567890,
      type: 'supergroup',
      title: 'Tech Discussions'
    }));
    agent.addChat(new TelegramChat({
      id: -1001987654321,
      type: 'channel',
      title: 'Official Channel'
    }));
    console.log(`   Total chats: ${agent.chats.size}`);

    // 2. Users
    console.log('\n2. User Management:');
    agent.addUser(new TelegramUser({
      id: 111,
      firstName: 'Alice',
      username: 'alice'
    }));
    agent.addUser(new TelegramUser({
      id: 222,
      firstName: 'Bob',
      lastName: 'Smith',
      isBot: true,
      username: 'mybot'
    }));
    console.log(`   Total users: ${agent.users.size}`);

    // 3. Bot Commands
    console.log('\n3. Bot Commands:');
    agent.registerCommand(new TelegramBotCommand({ command: 'start', description: 'Start the bot' }));
    agent.registerCommand(new TelegramBotCommand({ command: 'help', description: 'Show help' }));
    agent.registerCommand(new TelegramBotCommand({ command: 'status', description: 'Get bot status' }));
    agent.setMyCommands(agent.commands);

    // 4. Send Message
    console.log('\n4. Send Message:');
    const result1 = await agent.sendMessage(123456789, 'Hello from Telegram2 agent!');
    console.log(`   Status: ${result1.success ? 'success' : 'failed'}`);

    // 5. Send with keyboard
    console.log('\n5. Send with Inline Keyboard:');
    const keyboard = new TelegramInlineKeyboardMarkup([
      [new TelegramInlineKeyboardButton({ text: 'Visit Website', url: 'https://example.com' })],
      [new TelegramInlineKeyboardButton({ text: 'Option A', callbackData: 'option_a' }),
       new TelegramInlineKeyboardButton({ text: 'Option B', callbackData: 'option_b' })]
    ]);
    await agent.sendMessage(123456789, 'Choose an option:', { reply_markup: keyboard });
    console.log(`   Status: success`);

    // 6. Edit Message
    console.log('\n6. Edit Message:');
    await agent.editMessageText(123456789, result1.message_id, 'Updated message text!');
    console.log(`   Status: success`);

    // 7. Send Photo
    console.log('\n7. Send Photo:');
    await agent.sendPhoto(123456789, 'photo.jpg', { caption: 'Beautiful sunset' });
    console.log(`   Status: success`);

    // 8. Send Document
    console.log('\n8. Send Document:');
    await agent.sendDocument(123456789, 'report.pdf', { caption: 'Monthly report' });
    console.log(`   Status: success`);

    // 9. Send Sticker
    console.log('\n9. Send Sticker:');
    await agent.sendSticker(123456789, 'sticker.webp');
    console.log(`   Status: success`);

    // 10. Send Venue
    console.log('\n10. Send Venue:');
    await agent.sendVenue(
      123456789,
      40.7128,
      -74.0060,
      'New York City',
      'Manhattan, NY'
    );
    console.log(`   Status: success`);

    // 11. Send Contact
    console.log('\n11. Send Contact:');
    await agent.sendContact(123456789, '+1234567890', 'John', { lastName: 'Doe' });
    console.log(`   Status: success`);

    // 12. Chat Action
    console.log('\n12. Send Chat Action:');
    await agent.sendChatAction(123456789, 'typing');
    console.log(`   Status: success`);

    // 13. Get Chat Member
    console.log('\n13. Get Chat Member:');
    const member = await agent.getChatMember(-1001234567890, 111);
    console.log(`   Status: ${member.success ? 'success' : 'failed'}`);

    // 14. Statistics
    console.log('\n14. Statistics:');
    const stats = agent.getStats();
    console.log(`   Messages: ${stats.messages}`);
    console.log(`   Sent: ${stats.sent}`);
    console.log(`   Edited: ${stats.edited}`);
    console.log(`   Callbacks: ${stats.callbacks}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'send':
    console.log('Sending test message...');
    const result = await agent.sendMessage(123456789, 'Test message from Telegram2 agent');
    console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
    break;

  case 'bots':
    console.log('Bot Commands:');
    for (const cmd of agent.commands) {
      console.log(`  - /${cmd.command}: ${cmd.description}`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-telegram2.js [demo|send|bots]');
}
