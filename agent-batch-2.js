/**
 * Agent Batch 2 Module
 *
 * Provides advanced batch processing with priority, scheduling, and monitoring.
 * Usage: node agent-batch-2.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   execute <batch>       Execute batch job
 *   status                 Show batch status
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const BATCH_DB = path.join(DATA_DIR, 'batch2-state.json');

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
 * Batch States
 */
const BatchState = {
  PENDING: 'pending',
  QUEUED: 'queued',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  PAUSED: 'paused',
  CANCELLED: 'cancelled'
};

/**
 * Batch Priority
 */
const Priority = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  CRITICAL: 3
};

/**
 * Batch Job
 */
class BatchJob {
  constructor(id, items, processor, options = {}) {
    this.id = id;
    this.items = items;
    this.processor = processor;
    this.options = {
      batchSize: options.batchSize || 10,
      timeout: options.timeout || 60000,
      retries: options.retries || 0,
      retryDelay: options.retryDelay || 1000,
      priority: options.priority || Priority.NORMAL,
      ...options
    };
    this.state = BatchState.PENDING;
    this.results = [];
    this.errors = [];
    this.progress = 0;
    this.startTime = null;
    this.endTime = null;
    this.processedCount = 0;
  }

  async execute() {
    this.state = BatchState.PROCESSING;
    this.startTime = Date.now();

    const batches = [];
    for (let i = 0; i < this.items.length; i += this.options.batchSize) {
      batches.push(this.items.slice(i, i + this.options.batchSize));
    }

    for (const batch of batches) {
      if (this.state === BatchState.CANCELLED) {
        break;
      }

      try {
        const batchResults = await this.processBatch(batch);
        this.results.push(...batchResults.results);
        this.errors.push(...batchResults.errors);
        this.processedCount += batch.length;
        this.progress = Math.floor((this.processedCount / this.items.length) * 100);
      } catch (error) {
        this.errors.push({ batch, error: error.message });
        if (this.options.stopOnError) {
          throw error;
        }
      }
    }

    this.state = this.errors.length > 0 && this.options.stopOnError
      ? BatchState.FAILED
      : BatchState.COMPLETED;
    this.endTime = Date.now();

    return {
      results: this.results,
      errors: this.errors,
      progress: this.progress
    };
  }

  async processBatch(batch) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Batch timeout after ${this.options.timeout}ms`));
      }, this.options.timeout);

      try {
        const batchResults = this.processor(batch);
        Promise.resolve(batchResults).then(results => {
          clearTimeout(timer);
          resolve({
            results: Array.isArray(results) ? results : [results],
            errors: []
          });
        }).catch(err => {
          clearTimeout(timer);
          reject(err);
        });
      } catch (err) {
        clearTimeout(timer);
        reject(err);
      }
    });
  }

  pause() {
    if (this.state === BatchState.PROCESSING) {
      this.state = BatchState.PAUSED;
    }
  }

  resume() {
    if (this.state === BatchState.PAUSED) {
      this.state = BatchState.PROCESSING;
    }
  }

  cancel() {
    this.state = BatchState.CANCELLED;
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
 * Batch Queue
 */
class BatchQueue {
  constructor(options = {}) {
    this.options = {
      maxConcurrent: options.maxConcurrent || 3,
      maxQueueSize: options.maxQueueSize || 1000,
      ...options
    };
    this.queue = [];
    this.running = 0;
    this.completed = 0;
    this.failed = 0;
  }

  enqueue(job) {
    if (this.queue.length >= this.options.maxQueueSize) {
      throw new Error('Queue is full');
    }

    this.queue.push({
      job,
      enqueuedAt: Date.now(),
      priority: job.options.priority
    });

    this.queue.sort((a, b) => b.priority - a.priority);
  }

  dequeue() {
    return this.queue.shift();
  }

  async process() {
    while (this.queue.length > 0 && this.running < this.options.maxConcurrent) {
      const item = this.dequeue();
      if (!item) break;

      this.running++;
      const job = item.job;

      try {
        await job.execute();
        this.completed++;
      } catch (error) {
        this.failed++;
      } finally {
        this.running--;
      }
    }
  }

  getSize() {
    return this.queue.length;
  }

  getStats() {
    return {
      queueSize: this.queue.length,
      running: this.running,
      completed: this.completed,
      failed: this.failed
    };
  }
}

/**
 * Batch Scheduler
 */
class BatchScheduler {
  constructor(options = {}) {
    this.options = {
      interval: options.interval || 5000,
      maxJobsPerInterval: options.maxJobsPerInterval || 10,
      ...options
    };
    this.scheduledJobs = new Map();
    this.intervalId = null;
    this.isRunning = false;
  }

  schedule(job, scheduleTime) {
    this.scheduledJobs.set(job.id, {
      job,
      scheduleTime,
      executed: false
    });
  }

  unschedule(jobId) {
    this.scheduledJobs.delete(jobId);
  }

  start(queue) {
    if (this.isRunning) return;
    this.isRunning = true;

    this.intervalId = setInterval(() => {
      const now = Date.now();
      let count = 0;

      for (const [id, scheduled] of this.scheduledJobs) {
        if (count >= this.options.maxJobsPerInterval) break;

        if (now >= scheduled.scheduleTime && !scheduled.executed) {
          queue.enqueue(scheduled.job);
          scheduled.executed = true;
          count++;
        }
      }

      queue.process();
    }, this.options.interval);
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
  }

  getScheduledJobs() {
    return Array.from(this.scheduledJobs.values()).map(s => ({
      jobId: s.job.id,
      scheduleTime: s.scheduleTime,
      executed: s.executed
    }));
  }
}

/**
 * Batch Monitor
 */
class BatchMonitor {
  constructor() {
    this.jobs = new Map();
    this.events = [];
  }

  track(job) {
    this.jobs.set(job.id, job);
  }

  untrack(jobId) {
    this.jobs.delete(jobId);
  }

  recordEvent(event) {
    this.events.push({
      ...event,
      timestamp: Date.now()
    });

    if (this.events.length > 1000) {
      this.events.shift();
    }
  }

  getJobStatus(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    return {
      id: job.id,
      state: job.state,
      progress: job.progress,
      processedCount: job.processedCount,
      totalItems: job.items.length,
      duration: job.getDuration(),
      resultsCount: job.results.length,
      errorsCount: job.errors.length
    };
  }

  getAllJobs() {
    return Array.from(this.jobs.values()).map(job => this.getJobStatus(job.id));
  }

  getEvents(limit = 100) {
    return this.events.slice(-limit);
  }

  getStats() {
    const states = {};
    for (const job of this.jobs.values()) {
      states[job.state] = (states[job.state] || 0) + 1;
    }

    return {
      totalJobs: this.jobs.size,
      states,
      totalEvents: this.events.length
    };
  }
}

/**
 * Agent Batch Manager
 */
class AgentBatchManager {
  constructor() {
    this.queue = new BatchQueue();
    this.scheduler = new BatchScheduler();
    this.monitor = new BatchMonitor();
    this.stats = {
      totalJobs: 0,
      completedJobs: 0,
      failedJobs: 0,
      totalItems: 0,
      processedItems: 0
    };
    this.state = loadJSON(BATCH_DB, {});
  }

  createJob(id, items, processor, options = {}) {
    const job = new BatchJob(id, items, processor, options);
    this.monitor.track(job);
    this.stats.totalJobs++;
    this.stats.totalItems += items.length;
    return job;
  }

  async enqueueAndExecute(job) {
    this.queue.enqueue(job);
    await this.queue.process();
    return job;
  }

  scheduleJob(job, delay = 0) {
    const scheduleTime = Date.now() + delay;
    this.scheduler.schedule(job, scheduleTime);
    this.scheduler.start(this.queue);
  }

  getJob(jobId) {
    return this.monitor.getJobStatus(jobId);
  }

  cancelJob(jobId) {
    for (const job of this.monitor.jobs.values()) {
      if (job.id === jobId) {
        job.cancel();
        return { success: true };
      }
    }
    return { error: 'Job not found' };
  }

  getStats() {
    return {
      ...this.stats,
      queue: this.queue.getStats(),
      monitor: this.monitor.getStats()
    };
  }

  save() {
    saveJSON(BATCH_DB, { stats: this.stats });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Batch 2 Demo\n');

  const manager = new AgentBatchManager();

  // Create batch jobs
  console.log('1. Creating Batch Jobs:');

  const job1 = manager.createJob('job1', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], async (batch) => {
    console.log(`   Processing batch: ${batch.join(', ')}`);
    await new Promise(r => setTimeout(r, 20));
    return batch.map(x => ({ value: x, doubled: x * 2 }));
  }, { batchSize: 3, priority: Priority.HIGH });

  const job2 = manager.createJob('job2', ['a', 'b', 'c', 'd', 'e'], async (batch) => {
    console.log(`   Processing batch: ${batch.join(', ')}`);
    await new Promise(r => setTimeout(r, 15));
    return batch.map(x => ({ value: x, upper: x.toUpperCase() }));
  }, { batchSize: 2, priority: Priority.NORMAL });

  console.log(`   Created job1 with 10 items`);
  console.log(`   Created job2 with 5 items`);

  // Execute jobs
  console.log('\n2. Executing Jobs:');

  const result1 = await manager.enqueueAndExecute(job1);
  console.log(`   job1: ${result1.state}, progress: ${result1.progress}%`);

  const result2 = await manager.enqueueAndExecute(job2);
  console.log(`   job2: ${result2.state}, progress: ${result2.progress}%`);

  // Show results
  console.log('\n3. Job Results:');
  console.log(`   job1 results: ${result1.results.length}`);
  console.log(`   job1 errors: ${result1.errors.length}`);
  console.log(`   job2 results: ${result2.results.length}`);
  console.log(`   job2 errors: ${result2.errors.length}`);

  // Schedule job
  console.log('\n4. Scheduling Job:');
  const job3 = manager.createJob('job3', [100, 200, 300], async (batch) => {
    console.log(`   Scheduled job processing: ${batch.join(', ')}`);
    return batch.map(x => ({ value: x }));
  }, { batchSize: 1 });

  manager.scheduleJob(job3, 1000);
  console.log('   Job3 scheduled for 1 second later');

  await new Promise(r => setTimeout(r, 1500));

  // Monitor
  console.log('\n5. Monitor Status:');
  const allJobs = manager.monitor.getAllJobs();
  for (const job of allJobs) {
    console.log(`   ${job.id}: ${job.state} (${job.progress}%)`);
  }

  // Stats
  console.log('\n6. Statistics:');
  const stats = manager.getStats();
  console.log(`   Total Jobs: ${stats.totalJobs}`);
  console.log(`   Total Items: ${stats.totalItems}`);
  console.log(`   Queue Size: ${stats.queue.queueSize}`);
  console.log(`   Running: ${stats.queue.running}`);
  console.log(`   Completed: ${stats.queue.completed}`);
  console.log(`   Failed: ${stats.queue.failed}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'execute') {
  const manager = new AgentBatchManager();
  const job = manager.createJob('default', [1, 2, 3], async (batch) => batch);
  manager.enqueueAndExecute(job).then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const manager = new AgentBatchManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Batch 2 Module');
  console.log('Usage: node agent-batch-2.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  execute <batch> Execute batch job');
  console.log('  status           Show batch status');
}
