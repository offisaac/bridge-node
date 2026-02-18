/**
 * Agent Stream Processor - Stream Processing Module
 *
 * Processes continuous data streams with filtering, transformation, and aggregation.
 *
 * Usage: node agent-stream-processor.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   process    - Process a stream
 *   stats      - Get stream statistics
 */

class StreamProcessor {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.source = config.source; // kafka, kinesis, mqtt, websocket, http
    this.pipeline = config.pipeline || []; // Array of processing steps
    this.status = config.status || 'stopped'; // running, stopped, paused
    this.messagesProcessed = config.messagesProcessed || 0;
    this.errors = config.errors || 0;
  }

  addStep(step) {
    this.pipeline.push(step);
  }
}

class StreamMessage {
  constructor(data, metadata = {}) {
    this.id = crypto.randomUUID();
    this.data = data;
    this.metadata = metadata;
    this.timestamp = new Date();
    this.processed = false;
  }
}

class StreamProcessorManager {
  constructor() {
    this.processors = new Map();
    this.messages = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Create sample processors
    const processors = [
      {
        name: 'User Activity Stream',
        source: 'kafka',
        pipeline: [
          { type: 'filter', condition: 'action === "purchase"' },
          { type: 'transform', map: 'enrichUserData' },
          { type: 'aggregate', window: '5m', metrics: ['count', 'sum'] }
        ],
        status: 'running',
        messagesProcessed: 1500,
        errors: 5
      },
      {
        name: 'Log Stream',
        source: 'kinesis',
        pipeline: [
          { type: 'filter', condition: 'level === "error"' },
          { type: 'transform', map: 'extractStackTrace' },
          { type: 'alert', threshold: 10 }
        ],
        status: 'running',
        messagesProcessed: 5000,
        errors: 12
      },
      {
        name: 'Metrics Stream',
        source: 'mqtt',
        pipeline: [
          { type: 'transform', map: 'normalizeMetrics' },
          { type: 'aggregate', window: '1m', metrics: ['avg', 'max', 'min'] },
          { type: 'store', destination: 'timeseries' }
        ],
        status: 'paused',
        messagesProcessed: 800,
        errors: 2
      }
    ];

    processors.forEach(p => {
      const processor = new StreamProcessor(p);
      this.processors.set(processor.id, processor);
    });

    // Generate sample messages
    for (let i = 0; i < 10; i++) {
      const msg = new StreamMessage(
        { event: 'click', userId: `user-${i}`, value: Math.random() * 100 },
        { source: 'kafka', partition: i % 3 }
      );
      this.messages.set(msg.id, msg);
    }
  }

  // Create processor
  create(name, source, pipeline = []) {
    const processor = new StreamProcessor({
      name,
      source,
      pipeline,
      status: 'stopped'
    });

    this.processors.set(processor.id, processor);
    return processor;
  }

  // Start processor
  start(id) {
    const processor = this.processors.get(id);
    if (!processor) {
      throw new Error('Processor not found');
    }
    processor.status = 'running';
    return processor;
  }

  // Stop processor
  stop(id) {
    const processor = this.processors.get(id);
    if (!processor) {
      throw new Error('Processor not found');
    }
    processor.status = 'stopped';
    return processor;
  }

  // Pause processor
  pause(id) {
    const processor = this.processors.get(id);
    if (!processor) {
      throw new Error('Processor not found');
    }
    processor.status = 'paused';
    return processor;
  }

  // Get processor
  get(id) {
    return this.processors.get(id) || null;
  }

  // List processors
  list(status = null) {
    let all = Array.from(this.processors.values());
    if (status) {
      all = all.filter(p => p.status === status);
    }
    return all;
  }

  // Process a message through pipeline
  processMessage(processorId, messageData, metadata = {}) {
    const processor = this.processors.get(processorId);
    if (!processor) {
      throw new Error('Processor not found');
    }

    if (processor.status !== 'running') {
      throw new Error('Processor is not running');
    }

    const message = new StreamMessage(messageData, metadata);
    let result = message;

    // Process through pipeline
    for (const step of processor.pipeline) {
      result = this._executeStep(step, result);
      if (!result) break;
    }

    if (result) {
      result.processed = true;
      processor.messagesProcessed++;
      this.messages.set(result.id, result);
    } else {
      processor.errors++;
    }

    return result;
  }

  _executeStep(step, message) {
    const data = message.data;

    switch (step.type) {
      case 'filter':
        // Simple filter - evaluate condition
        try {
          const condition = step.condition.replace(/(\w+)/g, 'data.$1');
          if (!eval(condition)) {
            return null;
          }
        } catch (e) {
          console.log('Filter error:', e.message);
        }
        break;

      case 'transform':
        // Apply transformation
        if (step.map === 'enrichUserData') {
          message.data.enriched = true;
          message.data.processedAt = new Date().toISOString();
        } else if (step.map === 'normalizeMetrics') {
          message.data.normalized = true;
          message.data.unit = 'ms';
        } else if (step.map === 'extractStackTrace') {
          message.data.extracted = true;
        }
        break;

      case 'aggregate':
        // Aggregation would be done in batch in real implementation
        message.data.aggregated = true;
        message.data.window = step.window;
        break;

      case 'alert':
        // Check threshold
        break;

      case 'store':
        // Store to destination
        message.data.stored = true;
        message.data.destination = step.destination;
        break;

      default:
        console.log(`Unknown step type: ${step.type}`);
    }

    return message;
  }

  // Add pipeline step
  addPipelineStep(processorId, step) {
    const processor = this.processors.get(processorId);
    if (!processor) {
      throw new Error('Processor not found');
    }
    processor.addStep(step);
    return processor;
  }

  // Get messages
  getMessages(processorId = null, limit = 100) {
    let all = Array.from(this.messages.values());
    if (processorId) {
      // Filter by processor - would need to track in real impl
      all = all.slice(0, limit);
    }
    return all.slice(-limit);
  }

  // Get statistics
  getStats() {
    const processors = Array.from(this.processors.values());

    const byStatus = { running: 0, stopped: 0, paused: 0 };
    let totalMessages = 0;
    let totalErrors = 0;

    processors.forEach(p => {
      byStatus[p.status]++;
      totalMessages += p.messagesProcessed;
      totalErrors += p.errors;
    });

    return {
      totalProcessors: processors.length,
      byStatus,
      totalMessages,
      totalErrors,
      errorRate: totalMessages > 0 ? (totalErrors / totalMessages * 100).toFixed(2) + '%' : '0%'
    };
  }

  // Get processor stats
  getProcessorStats(processorId) {
    const processor = this.processors.get(processorId);
    if (!processor) {
      throw new Error('Processor not found');
    }

    return {
      id: processor.id,
      name: processor.name,
      source: processor.source,
      status: processor.status,
      pipelineLength: processor.pipeline.length,
      messagesProcessed: processor.messagesProcessed,
      errors: processor.errors,
      errorRate: processor.messagesProcessed > 0
        ? (processor.errors / processor.messagesProcessed * 100).toFixed(2) + '%'
        : '0%'
    };
  }
}

function runDemo() {
  console.log('=== Agent Stream Processor Demo\n');

  const mgr = new StreamProcessorManager();

  console.log('1. List Processors:');
  const processors = mgr.list();
  console.log(`   Total: ${processors.length}`);
  processors.forEach(p => console.log(`   - ${p.name} [${p.source}] (${p.status})`));

  console.log('\n2. Create Processor:');
  const newProcessor = mgr.create('Data Stream', 'websocket', [
    { type: 'filter', condition: 'type === "data"' },
    { type: 'transform', map: 'normalizeData' },
    { type: 'aggregate', window: '10s', metrics: ['count'] }
  ]);
  console.log(`   Created: ${newProcessor.name}`);
  console.log(`   ID: ${newProcessor.id}`);

  console.log('\n3. Start Processor:');
  const started = mgr.start(newProcessor.id);
  console.log(`   Status: ${started.status}`);

  console.log('\n4. Process Messages:');
  for (let i = 0; i < 3; i++) {
    const result = mgr.processMessage(newProcessor.id, {
      type: 'data',
      value: Math.random() * 100,
      timestamp: new Date().toISOString()
    }, { source: 'test' });
    console.log(`   Processed: ${result ? result.id.substring(0, 8) : 'filtered'}`);
  }

  console.log('\n5. Add Pipeline Step:');
  const withStep = mgr.addPipelineStep(newProcessor.id, {
    type: 'store',
    destination: 's3'
  });
  console.log(`   Pipeline length: ${withStep.pipeline.length}`);

  console.log('\n6. Stop Processor:');
  const stopped = mgr.stop(newProcessor.id);
  console.log(`   Status: ${stopped.status}`);

  console.log('\n7. Pause Processor:');
  const running = mgr.list('running')[0];
  if (running) {
    const paused = mgr.pause(running.id);
    console.log(`   Paused: ${paused.name}`);
  }

  console.log('\n8. Get Processor Stats:');
  const stats = mgr.getProcessorStats(running?.id || processors[0].id);
  console.log(`   Messages: ${stats.messagesProcessed}`);
  console.log(`   Errors: ${stats.errors}`);
  console.log(`   Error rate: ${stats.errorRate}`);

  console.log('\n9. Get Messages:');
  const messages = mgr.getMessages();
  console.log(`   Total: ${messages.length}`);

  console.log('\n10. Get Overall Stats:');
  const overallStats = mgr.getStats();
  console.log(`   Total processors: ${overallStats.totalProcessors}`);
  console.log(`   Running: ${overallStats.byStatus.running}`);
  console.log(`   Total messages: ${overallStats.totalMessages}`);
  console.log(`   Error rate: ${overallStats.errorRate}`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new StreamProcessorManager();

if (command === 'demo') runDemo();
else if (command === 'process') {
  const [processorId] = args.slice(1);
  if (!processorId) {
    console.log('Usage: node agent-stream-processor.js process <processorId>');
    process.exit(1);
  }
  try {
    const result = mgr.processMessage(processorId, { test: 'data' });
    console.log(JSON.stringify(result, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
else if (command === 'stats') {
  const [processorId] = args.slice(1);
  if (processorId) {
    const stats = mgr.getProcessorStats(processorId);
    console.log(JSON.stringify(stats, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
  } else {
    const stats = mgr.getStats();
    console.log(JSON.stringify(stats, 2));
  }
}
else console.log('Usage: node agent-stream-processor.js [demo|process|stats]');
