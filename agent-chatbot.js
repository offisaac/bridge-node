/**
 * Agent Chatbot - Conversational Chatbot Agent
 *
 * Manages conversational chatbot interactions.
 *
 * Usage: node agent-chatbot.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   chat    - Start a chat session
 *   list    - List chat sessions
 */

class ChatSession {
  constructor(config) {
    this.id = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.userId = config.userId;
    this.botId = config.botId || 'default';
    this.messages = [];
    this.context = {};
    this.status = 'active'; // active, paused, ended
    this.createdAt = Date.now();
    this.lastActivity = Date.now();
  }

  addMessage(sender, content) {
    this.messages.push({
      sender,
      content,
      timestamp: Date.now()
    });
    this.lastActivity = Date.now();
  }

  end() { this.status = 'ended'; }
  pause() { this.status = 'paused'; }
  resume() { this.status = 'active'; }
}

class Intent {
  constructor(config) {
    this.id = `intent-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.patterns = config.patterns || [];
    this.responses = config.responses || [];
    this.action = config.action || null;
  }

  match(input) {
    const lower = input.toLowerCase();
    return this.patterns.some(p => lower.includes(p.toLowerCase()));
  }

  getResponse() {
    const idx = Math.floor(Math.random() * this.responses.length);
    return this.responses[idx];
  }
}

class Entity {
  constructor(config) {
    this.id = `entity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.type = config.type; // name, date, number, location, etc.
    this.value = config.value;
    this.confidence = config.confidence || 1.0;
  }
}

class ResponseTemplate {
  constructor(config) {
    this.id = `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.template = config.template;
    this.variables = config.variables || [];
  }

  render(context = {}) {
    let result = this.template;
    this.variables.forEach(v => {
      const val = context[v] || `[${v}]`;
      result = result.replace(new RegExp(`{{${v}}}`, 'g'), val);
    });
    return result;
  }
}

class ChatbotAgent {
  constructor(config = {}) {
    this.name = config.name || 'Chatbot';
    this.welcomeMessage = config.welcomeMessage || 'Hello! How can I help you today?';
    this.sessions = new Map();
    this.intents = new Map();
    this.entities = new Map();
    this.templates = new Map();
    this.stats = {
      sessionsCreated: 0,
      messagesReceived: 0,
      intentsMatched: 0
    };
    this.initIntents();
    this.initTemplates();
  }

  initIntents() {
    const intents = [
      {
        name: 'greeting',
        patterns: ['hello', 'hi', 'hey', 'good morning', 'good evening'],
        responses: ['Hello! How can I assist you?', 'Hi there! What can I do for you?', 'Hey! How are you doing?']
      },
      {
        name: 'help',
        patterns: ['help', 'assist', 'support', 'can you'],
        responses: ['I can help you with...', 'Sure, I\'d be happy to assist!', 'What do you need help with?']
      },
      {
        name: 'goodbye',
        patterns: ['bye', 'goodbye', 'see you', 'later'],
        responses: ['Goodbye! Have a great day!', 'Bye! Come back anytime!', 'See you soon!']
      },
      {
        name: 'thanks',
        patterns: ['thank', 'thanks', 'appreciate'],
        responses: ['You\'re welcome!', 'Happy to help!', 'No problem!']
      }
    ];
    intents.forEach(i => {
      const intent = new Intent(i);
      this.intents.set(intent.id, intent);
    });
  }

  initTemplates() {
    const templates = [
      { name: 'greeting_user', template: 'Hello, {{name}}! How can I help you today?', variables: ['name'] },
      { name: 'order_status', template: 'Your order {{order_id}} is currently {{status}}.', variables: ['order_id', 'status'] },
      { name: 'appointment_reminder', template: 'Reminder: You have an appointment on {{date}} at {{time}}.', variables: ['date', 'time'] }
    ];
    templates.forEach(t => {
      const template = new ResponseTemplate(t);
      this.templates.set(template.id, template);
    });
  }

  createSession(userId) {
    const session = new ChatSession({ userId });
    this.sessions.set(session.id, session);
    this.stats.sessionsCreated++;
    return session;
  }

  async processMessage(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, reason: 'Session not found' };
    }

    this.stats.messagesReceived++;
    session.addMessage('user', message);

    // Match intent
    let response = null;
    for (const intent of this.intents.values()) {
      if (intent.match(message)) {
        response = intent.getResponse();
        this.stats.intentsMatched++;
        break;
      }
    }

    // Default response if no intent matched
    if (!response) {
      response = 'I understand. Let me help you with that.';
    }

    session.addMessage('assistant', response);

    return {
      success: true,
      response,
      sessionId: session.id
    };
  }

  createIntent(config) {
    const intent = new Intent(config);
    this.intents.set(intent.id, intent);
    return intent;
  }

  renderTemplate(templateName, context) {
    for (const template of this.templates.values()) {
      if (template.name === templateName) {
        return template.render(context);
      }
    }
    return null;
  }

  listSessions() {
    return Array.from(this.sessions.values());
  }

  getStats() {
    return {
      ...this.stats,
      activeSessions: Array.from(this.sessions.values()).filter(s => s.status === 'active').length,
      totalIntents: this.intents.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const chatbot = new ChatbotAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Chatbot Demo\n');

    // 1. Create Session
    console.log('1. Create Chat Session:');
    const session = chatbot.createSession('user-123');
    console.log(`   Session ID: ${session.id}`);
    console.log(`   Welcome: ${session.messages.length > 0 ? 'Yes' : 'No'}`);

    // 2. Process Message - Greeting
    console.log('\n2. Process Greeting:');
    let result = await chatbot.processMessage(session.id, 'Hello there!');
    console.log(`   Response: ${result.response}`);

    // 3. Process Message - Help
    console.log('\n3. Process Help Request:');
    result = await chatbot.processMessage(session.id, 'Can you help me?');
    console.log(`   Response: ${result.response}`);

    // 4. Process Message - Question
    console.log('\n4. Process Question:');
    result = await chatbot.processMessage(session.id, 'What is the weather?');
    console.log(`   Response: ${result.response}`);

    // 5. Process Message - Thanks
    console.log('\n5. Process Thanks:');
    result = await chatbot.processMessage(session.id, 'Thank you so much!');
    console.log(`   Response: ${result.response}`);

    // 6. Process Message - Goodbye
    console.log('\n6. Process Goodbye:');
    result = await chatbot.processMessage(session.id, 'Goodbye!');
    console.log(`   Response: ${result.response}`);

    // 7. View Session History
    console.log('\n7. Session History:');
    console.log(`   Total messages: ${session.messages.length}`);

    // 8. Create Custom Intent
    console.log('\n8. Create Custom Intent:');
    const intent = chatbot.createIntent({
      name: 'order_status',
      patterns: ['order', 'package', 'shipping'],
      responses: ['Your order is being processed.', 'Let me check your order status.']
    });
    console.log(`   Created: ${intent.name}`);

    // 9. Render Template
    console.log('\n9. Render Template:');
    const rendered = chatbot.renderTemplate('greeting_user', { name: 'John' });
    console.log(`   Output: ${rendered}`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = chatbot.getStats();
    console.log(`   Sessions Created: ${stats.sessionsCreated}`);
    console.log(`   Messages Received: ${stats.messagesReceived}`);
    console.log(`   Intents Matched: ${stats.intentsMatched}`);
    console.log(`   Active Sessions: ${stats.activeSessions}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'chat':
    const sessionId = chatbot.createSession('cli-user').id;
    console.log(`Chat session: ${sessionId}`);
    console.log(chatbot.welcomeMessage);
    console.log('\n(Type your messages, or "exit" to quit)');
    // Note: Interactive mode would require readline
    console.log('\n(Use "demo" command to see the chatbot in action)');
    break;

  case 'list':
    console.log('Chat Sessions:');
    chatbot.listSessions().forEach(s => {
      console.log(`  ${s.id}: ${s.messages.length} messages [${s.status}]`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-chatbot.js [demo|chat|list]');
}
