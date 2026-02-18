/**
 * Agent Assistant - General AI Assistant Agent
 *
 * Provides general-purpose AI assistant capabilities.
 *
 * Usage: node agent-assistant.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   ask     - Ask a question
 *   list    - List capabilities
 */

class AssistantCapability {
  constructor(config) {
    this.id = `cap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.description = config.description;
    this.enabled = config.enabled !== false;
    this.category = config.category; // reasoning, generation, analysis, etc.
  }

  enable() { this.enabled = true; }
  disable() { this.enabled = false; }
}

class ConversationContext {
  constructor(config) {
    this.id = `ctx-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.topic = config.topic || 'general';
    this.history = [];
    this.metadata = {};
    this.createdAt = Date.now();
  }

  addMessage(role, content) {
    this.history.push({ role, content, timestamp: Date.now() });
  }

  getHistory() {
    return [...this.history];
  }
}

class Task {
  constructor(config) {
    this.id = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.description = config.description;
    this.status = 'pending'; // pending, in_progress, completed, failed
    this.priority = config.priority || 'normal'; // low, normal, high, urgent
    this.result = null;
    this.createdAt = Date.now();
  }

  start() { this.status = 'in_progress'; }
  complete(result) {
    this.status = 'completed';
    this.result = result;
  }
  fail(error) {
    this.status = 'failed';
    this.result = error;
  }
}

class Persona {
  constructor(config) {
    this.id = `persona-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.tone = config.tone || 'neutral'; // professional, casual, friendly, formal
    this.expertise = config.expertise || [];
    this.behavior = config.behavior || {};
  }
}

class AssistantAgent {
  constructor(config = {}) {
    this.name = config.name || 'Assistant';
    this.version = config.version || '1.0';
    this.capabilities = new Map();
    this.conversations = new Map();
    this.tasks = new Map();
    this.personas = new Map();
    this.stats = {
      messagesProcessed: 0,
      tasksCompleted: 0,
      conversationsStarted: 0
    };
    this.initCapabilities();
  }

  initCapabilities() {
    const caps = [
      { name: 'Text Generation', description: 'Generate text responses', category: 'generation' },
      { name: 'Question Answering', description: 'Answer questions', category: 'reasoning' },
      { name: 'Summarization', description: 'Summarize content', category: 'analysis' },
      { name: 'Translation', description: 'Translate between languages', category: 'generation' },
      { name: 'Code Assistance', description: 'Help with code', category: 'reasoning' },
      { name: 'Analysis', description: 'Analyze data or text', category: 'analysis' }
    ];
    caps.forEach(c => {
      const cap = new AssistantCapability(c);
      this.capabilities.set(cap.id, cap);
    });
  }

  async processMessage(content, contextId = null) {
    this.stats.messagesProcessed++;

    // Simulate response generation
    const response = {
      content: `Processed: ${content.substring(0, 50)}...`,
      confidence: 0.95,
      tokens: Math.floor(Math.random() * 500) + 100
    };

    if (contextId) {
      const ctx = this.conversations.get(contextId);
      if (ctx) {
        ctx.addMessage('user', content);
        ctx.addMessage('assistant', response.content);
      }
    }

    return response;
  }

  createConversation(topic = 'general') {
    const ctx = new ConversationContext({ topic });
    this.conversations.set(ctx.id, ctx);
    this.stats.conversationsStarted++;
    return ctx;
  }

  createTask(description, priority = 'normal') {
    const task = new Task({ description, priority });
    this.tasks.set(task.id, task);
    return task;
  }

  async executeTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false, reason: 'Task not found' };

    task.start();

    // Simulate task execution
    await new Promise(resolve => setTimeout(resolve, 100));

    task.complete({ output: `Task completed: ${task.description}` });
    this.stats.tasksCompleted++;

    return { success: true, task };
  }

  addPersona(config) {
    const persona = new Persona(config);
    this.personas.set(persona.id, persona);
    return persona;
  }

  listCapabilities(category = null) {
    if (category) {
      return Array.from(this.capabilities.values()).filter(c => c.category === category);
    }
    return Array.from(this.capabilities.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const assistant = new AssistantAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Assistant Demo\n');

    // 1. List Capabilities
    console.log('1. Assistant Capabilities:');
    const caps = assistant.listCapabilities();
    caps.forEach(c => {
      console.log(`   - ${c.name}: ${c.description} [${c.enabled ? 'enabled' : 'disabled'}]`);
    });

    // 2. Process Message
    console.log('\n2. Process Message:');
    const response = await assistant.processMessage('What is machine learning?');
    console.log(`   Response: ${response.content}`);
    console.log(`   Confidence: ${response.confidence}, Tokens: ${response.tokens}`);

    // 3. Create Conversation
    console.log('\n3. Create Conversation:');
    const ctx = assistant.createConversation('Technology');
    console.log(`   Created conversation: ${ctx.id}`);
    console.log(`   Topic: ${ctx.topic}`);

    // 4. Add Messages
    console.log('\n4. Add Messages:');
    assistant.processMessage('Tell me about AI', ctx.id);
    const history = ctx.getHistory();
    console.log(`   Messages in history: ${history.length}`);

    // 5. Create Task
    console.log('\n5. Create Task:');
    const task = assistant.createTask('Analyze code', 'high');
    console.log(`   Task: ${task.description} [${task.priority}]`);

    // 6. Execute Task
    console.log('\n6. Execute Task:');
    const result = await assistant.executeTask(task.id);
    console.log(`   Status: ${result.task.status}`);
    console.log(`   Result: ${result.task.result.output}`);

    // 7. Add Persona
    console.log('\n7. Add Persona:');
    const persona = assistant.addPersona({
      name: 'Technical Expert',
      tone: 'professional',
      expertise: ['coding', 'algorithms', 'data structures']
    });
    console.log(`   Persona: ${persona.name} (${persona.tone})`);

    // 8. Filter Capabilities
    console.log('\n8. Filter by Category:');
    const genCaps = assistant.listCapabilities('generation');
    console.log(`   Generation capabilities: ${genCaps.length}`);

    // 9. Statistics
    console.log('\n9. Statistics:');
    const stats = assistant.getStats();
    console.log(`   Messages Processed: ${stats.messagesProcessed}`);
    console.log(`   Tasks Completed: ${stats.tasksCompleted}`);
    console.log(`   Conversations: ${stats.conversationsStarted}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'ask':
    const question = args.slice(1).join(' ');
    if (!question) {
      console.log('Usage: node agent-assistant.js ask <question>');
      process.exit(1);
    }
    const ans = await assistant.processMessage(question);
    console.log(ans.content);
    break;

  case 'list':
    console.log('Assistant Capabilities:');
    assistant.listCapabilities().forEach(c => {
      console.log(`  ${c.name}: ${c.description}`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-assistant.js [demo|ask|list]');
}
