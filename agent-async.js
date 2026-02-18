/**
 * Agent Async Module
 *
 * Provides agent async task handling with operations, callbacks, promises, and events.
 * Usage: node agent-async.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   execute <task>        Execute async task
 *   status                 Show async status
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const ASYNC_DB = path.join(DATA_DIR, 'async-state.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON(file, defaultVal = {}) {
  ensureDataDir();
  if (!fs.existsSync(file)) {
    return defaultVal;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return defaultVal;
  }
}

function saveJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/**
 * Async State
 */
const AsyncState = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

/**
 * Async Operation
 */
class AsyncOperation {
  constructor(id, executor, options = {}) {
    this.id = id;
    this.executor = executor;
    this.options = {
      timeout: options.timeout || 30000,
      retries: options.retries || 0,
      retryDelay: options.retryDelay || 1000,
      ...options
    };
    this.state = AsyncState.PENDING;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.attempts = 0;
    this.callbacks = {
      onSuccess: [],
      onError: [],
      onComplete: [],
      onProgress: []
    };
  }

  async execute() {
    this.state = AsyncState.RUNNING;
    this.startTime = Date.now();
    this.attempts++;

    try {
      const result = await this.runWithTimeout();
      this.state = AsyncState.COMPLETED;
      this.result = result;
      this.endTime = Date.now();
      this.triggerCallback('onSuccess', result);
      return result;
    } catch (error) {
      this.state = AsyncState.FAILED;
      this.error = error.message;
      this.endTime = Date.now();
      this.triggerCallback('onError', error);

      // Retry if attempts remain
      if (this.attempts <= this.options.retries) {
        await new Promise(r => setTimeout(r, this.options.retryDelay));
        return this.execute();
      }

      return Promise.reject(error);
    } finally {
      this.triggerCallback('onComplete', { result: this.result, error: this.error });
    }
  }

  runWithTimeout() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Operation timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);

      Promise.resolve(this.executor()).then(result => {
        clearTimeout(timer);
        resolve(result);
      }).catch(err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  on(event, callback) {
    if (this.callbacks[event]) {
      this.callbacks[event].push(callback);
    }
    return this;
  }

  triggerCallback(event, data) {
    if (this.callbacks[event]) {
      for (const cb of this.callbacks[event]) {
        try {
          cb(data);
        } catch (e) {
          console.error('Callback error:', e);
        }
      }
    }
  }

  progress(value) {
    this.triggerCallback('onProgress', value);
  }

  cancel() {
    this.state = AsyncState.CANCELLED;
    this.endTime = Date.now();
  }

  getDuration() {
    if (this.startTime && this.endTime) {
      return this.endTime - this.startTime;
    }
    return 0;
  }
}

/**
 * Promise Pool
 */
class PromisePool {
  constructor(options = {}) {
    this.concurrency = options.concurrency || 5;
    this.running = 0;
    this.queue = [];
  }

  async add(promiseFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ promiseFn, resolve, reject });
      this.process();
    });
  }

  async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const { promiseFn, resolve, reject } = this.queue.shift();

    try {
      const result = await promiseFn();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.process();
    }
  }
}

/**
 * Event Emitter
 */
class AsyncEventEmitter {
  constructor() {
    this.events = new Map();
  }

  on(event, listener) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event).push(listener);
    return this;
  }

  once(event, listener) {
    const wrapper = (...args) => {
      listener(...args);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  off(event, listener) {
    if (!this.events.has(event)) return;
    const listeners = this.events.get(event);
    const index = listeners.indexOf(listener);
    if (index > -1) {
      listeners.splice(index, 1);
    }
  }

  emit(event, ...args) {
    if (!this.events.has(event)) return;
    for (const listener of this.events.get(event)) {
      try {
        listener(...args);
      } catch (e) {
        console.error('Event listener error:', e);
      }
    }
  }

  removeAllListeners(event) {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}

/**
 * Async Queue
 */
class AsyncQueue extends AsyncEventEmitter {
  constructor(options = {}) {
    super();
    this.options = {
      concurrency: options.concurrency || 1,
      autoStart: options.autoStart !== false,
      ...options
    };
    this.items = [];
    this.running = 0;
    this.paused = false;

    if (this.options.autoStart) {
      this.process();
    }
  }

  add(item, processor) {
    return new Promise((resolve, reject) => {
      this.items.push({
        data: item,
        processor,
        resolve,
        reject,
        attempts: 0
      });
      this.emit('added', item);

      if (!this.options.autoStart) {
        this.process();
      }
    });
  }

  async process() {
    if (this.paused || this.running >= this.options.concurrency || this.items.length === 0) {
      return;
    }

    this.running++;
    const item = this.items.shift();

    try {
      const result = await item.processor(item.data);
      item.resolve(result);
      this.emit('processed', item.data, result);
    } catch (error) {
      item.attempts++;
      if (item.attempts < 3) {
        // Retry
        this.items.unshift(item);
      } else {
        item.reject(error);
        this.emit('error', error, item.data);
      }
    } finally {
      this.running--;
      this.process();
    }
  }

  pause() {
    this.paused = true;
  }

  resume() {
    this.paused = false;
    this.process();
  }

  clear() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }
}

/**
 * Agent Async Manager
 */
class AgentAsyncManager extends AsyncEventEmitter {
  constructor() {
    super();
    this.operations = new Map();
    this.pools = new Map();
    this.stats = {
      totalOperations: 0,
      completed: 0,
      failed: 0,
      cancelled: 0
    };
    this.state = loadJSON(ASYNC_DB, {});
  }

  // Create async operation
  createOperation(executor, options = {}) {
    const id = `async-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const operation = new AsyncOperation(id, executor, options);
    this.operations.set(id, operation);
    this.stats.totalOperations++;
    return operation;
  }

  // Execute operation
  async execute(executor, options = {}) {
    const operation = this.createOperation(executor, options);

    operation.on('onComplete', ({ result, error }) => {
      if (error) {
        this.stats.failed++;
      } else {
        this.stats.completed++;
      }
    });

    try {
      return await operation.execute();
    } catch (error) {
      throw error;
    }
  }

  // Get operation
  getOperation(id) {
    return this.operations.get(id);
  }

  // Cancel operation
  cancel(id) {
    const operation = this.operations.get(id);
    if (operation) {
      operation.cancel();
      this.stats.cancelled++;
      return { success: true };
    }
    return { error: 'Operation not found' };
  }

  // Create promise pool
  createPool(name, concurrency = 5) {
    const pool = new PromisePool({ concurrency });
    this.pools.set(name, pool);
    return pool;
  }

  // Get pool
  getPool(name) {
    return this.pools.get(name);
  }

  // Create async queue
  createQueue(name, options = {}) {
    const queue = new AsyncQueue(options);
    return queue;
  }

  // Get stats
  getStats() {
    return {
      ...this.stats,
      active: this.operations.size,
      pools: this.pools.size
    };
  }

  // Save state
  save() {
    saveJSON(ASYNC_DB, { stats: this.stats });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Async Demo ===\n');

  const manager = new AgentAsyncManager();

  // Create async operation
  console.log('1. Creating Async Operations:');

  const op1 = manager.createOperation(async () => {
    await new Promise(r => setTimeout(r, 50));
    return { result: 'task-1' };
  }, { retries: 2 });

  const op2 = manager.createOperation(async () => {
    await new Promise(r => setTimeout(r, 30));
    return { result: 'task-2' };
  });

  console.log(`   Created: ${op1.id}`);
  console.log(`   Created: ${op2.id}`);

  // Add callbacks
  console.log('\n2. Adding Callbacks:');
  op1.on('onSuccess', (result) => {
    console.log(`   onSuccess: ${result.result}`);
  });
  op1.on('onError', (error) => {
    console.log(`   onError: ${error.message}`);
  });
  console.log('   Added callbacks to op1');

  // Execute operations
  console.log('\n3. Executing Operations:');

  const result1 = await op1.execute();
  console.log(`   op1 result: ${JSON.stringify(result1)}`);

  const result2 = await op2.execute();
  console.log(`   op2 result: ${JSON.stringify(result2)}`);

  // Promise pool
  console.log('\n4. Promise Pool:');
  const pool = manager.createPool('worker-pool', 3);

  const tasks = [];
  for (let i = 0; i < 5; i++) {
    tasks.push(pool.add(async () => {
      await new Promise(r => setTimeout(r, 20));
      return `task-${i}`;
    }));
  }

  const poolResults = await Promise.all(tasks);
  console.log(`   Pool results: ${poolResults.join(', ')}`);

  // Async queue
  console.log('\n5. Async Queue:');
  const queue = manager.createQueue('task-queue', { concurrency: 2 });

  queue.on('processed', (item, result) => {
    console.log(`   Processed: ${item} -> ${result}`);
  });

  await queue.add('item-1', async (item) => {
    await new Promise(r => setTimeout(r, 20));
    return `${item}-done`;
  });

  await queue.add('item-2', async (item) => {
    await new Promise(r => setTimeout(r, 20));
    return `${item}-done`;
  });

  await queue.add('item-3', async (item) => {
    await new Promise(r => setTimeout(r, 20));
    return `${item}-done`;
  });

  console.log(`   Queue size: ${queue.size}`);

  // Event emitter
  console.log('\n6. Event Emitter:');
  const emitter = new AsyncEventEmitter();

  emitter.on('data', (data) => {
    console.log(`   Received: ${data}`);
  });

  emitter.emit('data', 'Hello');
  emitter.emit('data', 'World');

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Total: ${stats.totalOperations}`);
  console.log(`   Completed: ${stats.completed}`);
  console.log(`   Failed: ${stats.failed}`);
  console.log(`   Cancelled: ${stats.cancelled}`);

  // Cancel operation
  console.log('\n8. Cancellation:');
  const op3 = manager.createOperation(async () => {
    await new Promise(r => setTimeout(r, 5000));
    return { result: 'never' };
  });

  setTimeout(() => {
    manager.cancel(op3.id);
    console.log(`   Cancelled: ${op3.id}`);
  }, 10);

  try {
    await op3.execute();
  } catch (e) {
    console.log(`   Operation state: ${op3.state}`);
  }

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'execute') {
  const manager = new AgentAsyncManager();
  manager.execute(async () => 'done').then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const manager = new AgentAsyncManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Async Module');
  console.log('Usage: node agent-async.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  execute <task> Execute async task');
  console.log('  status           Show async status');
}
