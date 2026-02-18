/**
 * Agent Worker Module
 *
 * Provides agent worker thread pool with management, task queue, and concurrency.
 * Usage: node agent-worker.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   submit <task>         Submit a task
 *   status                 Show worker status
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const WORKER_DB = path.join(DATA_DIR, 'worker-state.json');

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
 * Worker State
 */
const WorkerState = {
  IDLE: 'idle',
  BUSY: 'busy',
  TERMINATED: 'terminated'
};

/**
 * Task
 */
class Task {
  constructor(id, handler, options = {}) {
    this.id = id;
    this.handler = handler;
    this.options = {
      timeout: options.timeout || 30000,
      priority: options.priority || 0,
      retries: options.retries || 0,
      ...options
    };
    this.state = 'pending'; // pending, running, completed, failed, cancelled
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.attempts = 0;
  }

  async execute() {
    this.state = 'running';
    this.startTime = Date.now();
    this.attempts++;

    try {
      const result = await this.runWithTimeout();
      this.state = 'completed';
      this.result = result;
      this.endTime = Date.now();
      return { success: true, result };
    } catch (error) {
      this.state = 'failed';
      this.error = error.message;
      this.endTime = Date.now();
      return { success: false, error: error.message };
    }
  }

  runWithTimeout() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);

      Promise.resolve(this.handler()).then(result => {
        clearTimeout(timer);
        resolve(result);
      }).catch(err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  getDuration() {
    if (this.startTime && this.endTime) {
      return this.endTime - this.startTime;
    }
    return 0;
  }
}

/**
 * Worker
 */
class Worker {
  constructor(id, options = {}) {
    this.id = id;
    this.state = WorkerState.IDLE;
    this.currentTask = null;
    this.options = {
      maxConcurrent: options.maxConcurrent || 1,
      timeout: options.timeout || 60000,
      ...options
    };
    this.stats = {
      tasksProcessed: 0,
      tasksSucceeded: 0,
      tasksFailed: 0,
      totalRuntime: 0,
      lastTask: null
    };
  }

  async executeTask(task) {
    this.state = WorkerState.BUSY;
    this.currentTask = task;

    const startTime = Date.now();
    const result = await task.execute();
    const duration = Date.now() - startTime;

    this.stats.tasksProcessed++;
    this.stats.totalRuntime += duration;
    this.stats.lastTask = task.id;

    if (result.success) {
      this.stats.tasksSucceeded++;
    } else {
      this.stats.tasksFailed++;
    }

    this.state = WorkerState.IDLE;
    this.currentTask = null;

    return result;
  }

  isAvailable() {
    return this.state === WorkerState.IDLE;
  }

  getStats() {
    return {
      id: this.id,
      state: this.state,
      currentTask: this.currentTask?.id || null,
      ...this.stats
    };
  }

  terminate() {
    this.state = WorkerState.TERMINATED;
  }
}

/**
 * Task Queue
 */
class TaskQueue {
  constructor(options = {}) {
    this.options = {
      maxSize: options.maxSize || 1000,
      priority: options.priority || true,
      ...options
    };
    this.tasks = [];
    this.waiting = [];
  }

  enqueue(task) {
    if (this.tasks.length >= this.options.maxSize) {
      return { error: 'Queue full' };
    }

    this.tasks.push(task);
    this.tasks.sort((a, b) => b.options.priority - a.options.priority);

    return { success: true, taskId: task.id };
  }

  dequeue() {
    return this.tasks.shift() || null;
  }

  peek() {
    return this.tasks[0] || null;
  }

  size() {
    return this.tasks.length;
  }

  clear() {
    this.tasks = [];
  }
}

/**
 * Worker Pool
 */
class WorkerPool {
  constructor(options = {}) {
    this.options = {
      minWorkers: options.minWorkers || 2,
      maxWorkers: options.maxWorkers || 10,
      maxQueueSize: options.maxQueueSize || 1000,
      workerTimeout: options.workerTimeout || 60000,
      ...options
    };
    this.workers = new Map();
    this.queue = new TaskQueue({ maxSize: this.options.maxQueueSize });
    this.running = false;
    this.stats = {
      tasksSubmitted: 0,
      tasksCompleted: 0,
      tasksFailed: 0
    };
  }

  // Initialize workers
  initialize() {
    for (let i = 0; i < this.options.minWorkers; i++) {
      const workerId = `worker-${i}`;
      this.workers.set(workerId, new Worker(workerId));
    }
  }

  // Get available worker
  getAvailableWorker() {
    for (const worker of this.workers.values()) {
      if (worker.isAvailable()) {
        return worker;
      }
    }
    return null;
  }

  // Scale workers
  scaleUp(count = 1) {
    const currentCount = this.workers.size;
    const newCount = Math.min(currentCount + count, this.options.maxWorkers);

    for (let i = currentCount; i < newCount; i++) {
      const workerId = `worker-${i}`;
      this.workers.set(workerId, new Worker(workerId));
    }

    return { workers: newCount };
  }

  scaleDown(count = 1) {
    const currentCount = this.workers.size;
    const newCount = Math.max(currentCount - count, this.options.minWorkers);

    // Remove idle workers
    let removed = 0;
    for (const [id, worker] of this.workers) {
      if (removed >= count) break;
      if (worker.isAvailable()) {
        worker.terminate();
        this.workers.delete(id);
        removed++;
      }
    }

    return { workers: this.workers.size };
  }

  // Submit task
  submit(handler, options = {}) {
    const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    const task = new Task(taskId, handler, options);

    // Try to assign to worker
    const worker = this.getAvailableWorker();

    if (worker) {
      this.stats.tasksSubmitted++;
      worker.executeTask(task).then(result => {
        if (result.success) {
          this.stats.tasksCompleted++;
        } else {
          this.stats.tasksFailed++;
        }
      });
      return { assigned: true, taskId, workerId: worker.id };
    } else {
      // Add to queue
      this.queue.enqueue(task);
      this.stats.tasksSubmitted++;
      return { queued: true, taskId, queueSize: this.queue.size() };
    }
  }

  // Process queue
  async processQueue() {
    while (this.queue.size() > 0) {
      const worker = this.getAvailableWorker();
      if (!worker) break;

      const task = this.queue.dequeue();
      if (!task) break;

      worker.executeTask(task).then(result => {
        if (result.success) {
          this.stats.tasksCompleted++;
        } else {
          this.stats.tasksFailed++;
        }
      });
    }
  }

  // Get worker stats
  getWorkerStats(workerId) {
    const worker = this.workers.get(workerId);
    return worker ? worker.getStats() : null;
  }

  // Get all workers
  getAllWorkers() {
    return Array.from(this.workers.values()).map(w => w.getStats());
  }

  // Get queue size
  getQueueSize() {
    return this.queue.size();
  }

  // Get stats
  getStats() {
    const idleWorkers = Array.from(this.workers.values()).filter(w => w.isAvailable()).length;
    const busyWorkers = this.workers.size - idleWorkers;

    return {
      workers: this.workers.size,
      idle: idleWorkers,
      busy: busyWorkers,
      queueSize: this.queue.size(),
      maxWorkers: this.options.maxWorkers,
      tasks: {
        submitted: this.stats.tasksSubmitted,
        completed: this.stats.tasksCompleted,
        failed: this.stats.tasksFailed
      }
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Worker Demo ===\n');

  const pool = new WorkerPool({ minWorkers: 2, maxWorkers: 5 });
  pool.initialize();

  // Show initial state
  console.log('1. Initial Workers:');
  const initialStats = pool.getStats();
  console.log(`   Workers: ${initialStats.workers}`);
  console.log(`   Idle: ${initialStats.idle}`);

  // Submit tasks
  console.log('\n2. Submitting Tasks:');

  for (let i = 1; i <= 5; i++) {
    const result = pool.submit(async () => {
      await new Promise(r => setTimeout(r, 50));
      return { taskId: i, result: i * 10 };
    }, { priority: 5 - i });
    console.log(`   Task ${i}: ${result.assigned ? `assigned to ${result.workerId}` : 'queued'}`);
  }

  // Wait for tasks to complete
  await new Promise(r => setTimeout(r, 200));

  // Show stats
  console.log('\n3. Task Statistics:');
  const stats = pool.getStats();
  console.log(`   Submitted: ${stats.tasks.submitted}`);
  console.log(`   Completed: ${stats.tasks.completed}`);
  console.log(`   Failed: ${stats.tasks.failed}`);

  // Show worker stats
  console.log('\n4. Worker Statistics:');
  const workers = pool.getAllWorkers();
  workers.forEach(w => {
    console.log(`   ${w.id}: state=${w.state}, processed=${w.tasksProcessed}, succeeded=${w.tasksSucceeded}`);
  });

  // Scale up
  console.log('\n5. Scaling Up:');
  pool.scaleUp(2);
  const afterScale = pool.getStats();
  console.log(`   Workers: ${afterScale.workers}`);

  // Scale down
  console.log('\n6. Scaling Down:');
  pool.scaleDown(1);
  const afterScaleDown = pool.getStats();
  console.log(`   Workers: ${afterScaleDown.workers}`);

  // Submit more tasks with different priorities
  console.log('\n7. Priority Tasks:');
  pool.submit(async () => 'low priority', { priority: 1 });
  pool.submit(async () => 'high priority', { priority: 10 });
  console.log('   Submitted: low priority (1), high priority (10)');

  await new Promise(r => setTimeout(r, 100));

  // Final stats
  console.log('\n8. Final Statistics:');
  const finalStats = pool.getStats();
  console.log(`   Workers: ${finalStats.workers} (idle: ${finalStats.idle}, busy: ${finalStats.busy})`);
  console.log(`   Queue: ${finalStats.queueSize}`);
  console.log(`   Tasks: ${finalStats.tasks.submitted} submitted, ${finalStats.tasks.completed} completed`);

  // Show queue info
  console.log('\n9. Queue Management:');
  console.log(`   Current queue size: ${pool.getQueueSize()}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'submit') {
  const pool = new WorkerPool();
  pool.initialize();
  pool.submit(async () => 'done').then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const pool = new WorkerPool();
  console.log(JSON.stringify(pool.getStats(), null, 2));
} else {
  console.log('Agent Worker Module');
  console.log('Usage: node agent-worker.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  submit <task>  Submit a task');
  console.log('  status           Show worker status');
}
