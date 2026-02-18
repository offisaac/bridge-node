/**
 * Agent Stream 2 - Advanced Stream Processing Agent
 *
 * Manages advanced stream processing with windowing, aggregations, and stateful operations.
 *
 * Usage: node agent-stream-2.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   windows    - Show windowing
 *   aggregate  - Show aggregations
 */

class Window {
  constructor(type, size) {
    this.type = type; // tumbling, sliding, session
    this.size = size;
    this.data = [];
    this.startTime = Date.now();
  }

  add(item) {
    this.data.push(item);
    return this.shouldEmit();
  }

  shouldEmit() {
    switch (this.type) {
      case 'tumbling':
        return this.data.length >= this.size;
      case 'sliding':
        return this.data.length > 0;
      case 'session':
        return Date.now() - this.startTime > this.size;
      default:
        return false;
    }
  }

  getAndReset() {
    const result = [...this.data];
    this.data = [];
    this.startTime = Date.now();
    return result;
  }
}

class StreamAggregator {
  constructor() {
    this.state = new Map();
  }

  sum(key, value) {
    const current = this.state.get(key) || 0;
    this.state.set(key, current + value);
    return this.state.get(key);
  }

  avg(key, value) {
    const current = this.state.get(key) || { sum: 0, count: 0 };
    current.sum += value;
    current.count += 1;
    this.state.set(key, current);
    return current.sum / current.count;
  }

  min(key, value) {
    const current = this.state.get(key);
    if (!current || value < current) {
      this.state.set(key, value);
    }
    return this.state.get(key);
  }

  max(key, value) {
    const current = this.state.get(key);
    if (!current || value > current) {
      this.state.set(key, value);
    }
    return this.state.get(key);
  }

  count(key) {
    const current = this.state.get(key) || 0;
    this.state.set(key, current + 1);
    return current + 1;
  }

  distinct(key, value) {
    const current = this.state.get(key) || new Set();
    current.add(value);
    this.state.set(key, current);
    return current.size;
  }

  get(key) {
    return this.state.get(key);
  }

  clear() {
    this.state.clear();
  }
}

class StreamProcessor {
  constructor() {
    this.handlers = [];
    this.windows = new Map();
    this.aggregator = new StreamAggregator();
  }

  filter(predicate) {
    this.handlers.push({ type: 'filter', fn: predicate });
    return this;
  }

  map(transform) {
    this.handlers.push({ type: 'map', fn: transform });
    return this;
  }

  flatMap(transform) {
    this.handlers.push({ type: 'flatMap', fn: transform });
    return this;
  }

  window(type, size) {
    const window = new Window(type, size);
    this.windows.set(`window_${this.windows.size}`, window);
    return this;
  }

  aggregate(operations) {
    this.handlers.push({ type: 'aggregate', operations });
    return this;
  }

  process(data) {
    let result = data;

    for (const handler of this.handlers) {
      switch (handler.type) {
        case 'filter':
          if (!handler.fn(result)) return null;
          break;
        case 'map':
          result = handler.fn(result);
          break;
        case 'flatMap':
          const mapped = handler.fn(result);
          result = Array.isArray(mapped) ? mapped : [mapped];
          break;
        case 'aggregate':
          for (const [op, key, value] of handler.operations) {
            switch (op) {
              case 'sum': this.aggregator.sum(key, value); break;
              case 'avg': this.aggregator.avg(key, value); break;
              case 'min': this.aggregator.min(key, value); break;
              case 'max': this.aggregator.max(key, value); break;
              case 'count': this.aggregator.count(key); break;
              case 'distinct': this.aggregator.distinct(key, value); break;
            }
          }
          break;
      }
    }

    // Check windows
    for (const [name, window] of this.windows) {
      if (window.add(result)) {
        const windowData = window.getAndReset();
        return { type: 'window', window: name, data: windowData };
      }
    }

    return result;
  }
}

class Stream2Agent {
  constructor() {
    this.processors = new Map();
    this.streams = new Map();
    this.stats = { processed: 0, windows: 0, dropped: 0 };

    this._initSampleStreams();
  }

  _initSampleStreams() {
    // Create sample streams
    const userEvents = [];
    for (let i = 0; i < 100; i++) {
      userEvents.push({
        userId: `user_${Math.floor(Math.random() * 10)}`,
        action: ['click', 'view', 'purchase'][Math.floor(Math.random() * 3)],
        amount: Math.floor(Math.random() * 100),
        timestamp: Date.now() - i * 1000
      });
    }
    this.streams.set('user_events', userEvents);
  }

  createProcessor(name) {
    const processor = new StreamProcessor();
    this.processors.set(name, processor);
    return processor;
  }

  process(name, data) {
    const processor = this.processors.get(name);
    if (!processor) return null;

    const result = processor.process(data);
    if (result) {
      if (result.type === 'windows') {
        this.stats.windows++;
      } else {
        this.stats.processed++;
      }
    }
    return result;
  }

  processStream(streamName, processorName) {
    const stream = this.streams.get(streamName);
    const processor = this.processors.get(processorName);

    if (!stream || !processor) return null;

    const results = [];
    for (const data of stream) {
      const result = processor.process(data);
      if (result) results.push(result);
    }
    return results;
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const stream2 = new Stream2Agent();

switch (command) {
  case 'demo':
    console.log('=== Agent Stream 2 Demo\n');

    // 1. Simple stream processing
    console.log('1. Stream Processing:');
    const filterMap = stream2.createProcessor('filter-map')
      .filter(item => item.action !== 'view')
      .map(item => ({ ...item, processed: true }));

    for (const event of stream2.streams.get('user_events').slice(0, 5)) {
      const result = stream2.process('filter-map', event);
      if (result) {
        console.log(`   Processed: ${event.action} by ${event.userId}`);
      }
    }

    // 2. Windowing
    console.log('\n2. Windowing (Tumbling):');
    const windowed = stream2.createProcessor('windowed')
      .window('tumbling', 3);

    let windowEmits = 0;
    for (let i = 0; i < 10; i++) {
      const result = stream2.process('windowed', { id: i, value: Math.random() * 10 });
      if (result && result.type === 'windows') {
        windowEmits++;
        console.log(`   Window emitted: ${result.data.length} items`);
      }
    }
    console.log(`   Total window emits: ${windowEmits}`);

    // 3. Aggregation
    console.log('\n3. Aggregation:');
    const aggregated = stream2.createProcessor('aggregated')
      .aggregate([
        ['sum', 'total_amount', 0],
        ['count', 'events', 0],
        ['avg', 'avg_amount', 0]
      ]);

    const events = stream2.streams.get('user_events').slice(0, 10);
    for (const event of events) {
      stream2.process('aggregated', event);
    }

    const agg = aggregated.aggregator;
    console.log(`   Total amount: ${agg.get('total_amount')}`);
    console.log(`   Event count: ${agg.get('events')}`);

    // 4. Multiple operations
    console.log('\n4. Complex Pipeline:');
    const complex = stream2.createProcessor('complex')
      .filter(item => item.amount > 30)
      .map(item => ({ ...item, highValue: true }))
      .window('sliding', 5);

    let highValueCount = 0;
    for (const event of stream2.streams.get('user_events')) {
      const result = stream2.process('complex', event);
      if (result?.highValue) highValueCount++;
    }
    console.log(`   High value events: ${highValueCount}`);

    // 5. Statistics
    console.log('\n5. Statistics:');
    const stats = stream2.getStats();
    console.log(`   Processed: ${stats.processed}`);
    console.log(`   Windows: ${stats.windows}`);
    console.log(`   Dropped: ${stats.dropped}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'windows':
    console.log('Window Types:');
    console.log('  - tumbling: Fixed-size, non-overlapping windows');
    console.log('  - sliding: Overlapping windows with slide interval');
    console.log('  - session: Activity-based session windows');
    break;

  case 'aggregate':
    console.log('Aggregation Operations:');
    console.log('  - sum: Running sum');
    console.log('  - avg: Running average');
    console.log('  - min: Running minimum');
    console.log('  - max: Running maximum');
    console.log('  - count: Running count');
    console.log('  - distinct: Distinct count');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-stream-2.js [demo|windows|aggregate]');
}
