/**
 * Agent Batch Module
 *
 * Provides agent batch processing system with queuing and parallel execution.
 * Usage: node agent-batch.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   process <batch>        Process a batch
 *   status <batch>        Show batch status
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const BATCH_DB = path.join(DATA_DIR, 'batches.json');

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
 * Batch Job
 */
class BatchJob {
  constructor(id, data, options = {}) {
    this.id = id;
    this.data = data;
    this.status = 'pending'; // pending, running, completed, failed, skipped
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.attempts = 0;
    this.maxAttempts = options.maxAttempts || 3;
    this.timeout = options.timeout || 30000;
    this.priority = options.priority || 0;
  }

  async execute(handler) {
    this.status = 'running';
    this.startTime = Date.now();
    this.attempts++;

    try {
      const result = await this.runWithTimeout(handler);
      this.status = 'completed';
      this.result = result;
      this.endTime = Date.now();
      return { success: true, result };
    } catch (error) {
      this.status = 'failed';
      this.error = error.message;
      this.endTime = Date.now();

      // Retry if attempts remain
      if (this.attempts < this.maxAttempts) {
        this.status = 'pending';
        return { success: false, retry: true, attempts: this.attempts };
      }

      return { success: false, retry: false, error: error.message };
    }
  }

  async runWithTimeout(handler) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Job timed out after ${this.timeout}ms`));
      }, this.timeout);

      Promise.resolve(handler(this.data)).then(result => {
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
 * Batch
 */
class Batch {
  constructor(id, name, options = {}) {
    this.id = id;
    this.name = name;
    this.jobs = [];
    this.status = 'created'; // created, queued, running, completed, failed, paused
    this.options = {
      parallel: options.parallel || 5,
      stopOnError: options.stopOnError || false,
      retryFailed: options.retryFailed || true,
      ...options
    };
    this.createdAt = Date.now();
    this.startTime = null;
    this.endTime = null;
    this.progress = { total: 0, completed: 0, failed: 0, running: 0 };
  }

  addJob(job) {
    this.jobs.push(job);
    this.progress.total = this.jobs.length;
  }

  addJobs(jobsData) {
    for (const data of jobsData) {
      const job = new BatchJob(
        `job-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        data
      );
      this.jobs.push(job);
    }
    this.progress.total = this.jobs.length;
  }

  getPendingJobs() {
    return this.jobs.filter(j => j.status === 'pending');
  }

  getNextJob() {
    const pending = this.getPendingJobs();
    // Get highest priority job
    pending.sort((a, b) => b.priority - a.priority);
    return pending[0] || null;
  }

  updateProgress() {
    this.progress.completed = this.jobs.filter(j => j.status === 'completed').length;
    this.progress.failed = this.jobs.filter(j => j.status === 'failed').length;
    this.progress.running = this.jobs.filter(j => j.status === 'running').length;

    if (this.progress.completed + this.progress.failed === this.progress.total) {
      this.status = this.progress.failed > 0 ? 'completed' : 'completed';
      this.endTime = Date.now();
    }
  }

  getStats() {
    return {
      total: this.progress.total,
      completed: this.progress.completed,
      failed: this.progress.failed,
      running: this.progress.running,
      pending: this.progress.total - this.progress.completed - this.progress.failed - this.progress.running,
      duration: this.getDuration(),
      status: this.status
    };
  }

  getDuration() {
    if (this.startTime && this.endTime) {
      return this.endTime - this.startTime;
    }
    if (this.startTime) {
      return Date.now() - this.startTime;
    }
    return 0;
  }
}

/**
 * Batch Queue
 */
class BatchQueue {
  constructor() {
    this.batches = new Map();
    this.pendingBatches = [];
  }

  enqueue(batch) {
    this.batches.set(batch.id, batch);
    this.pendingBatches.push(batch);
  }

  dequeue() {
    return this.pendingBatches.shift() || null;
  }

  getBatch(batchId) {
    return this.batches.get(batchId);
  }

  listBatches() {
    return Array.from(this.batches.values());
  }
}

/**
 * Batch Processor
 */
class BatchProcessor {
  constructor(options = {}) {
    this.queue = new BatchQueue();
    this.maxParallel = options.maxParallel || 5;
    this.runningJobs = 0;
    this.handlers = new Map();
    this.state = loadJSON(BATCH_DB, { batches: {} });
  }

  registerHandler(name, handler) {
    this.handlers.set(name, handler);
  }

  createBatch(name, jobsData, options = {}) {
    const batchId = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const batch = new Batch(batchId, name, options);
    batch.addJobs(jobsData);
    this.queue.enqueue(batch);
    return batch;
  }

  async processBatch(batch, handlerName) {
    const handler = this.handlers.get(handlerName);
    if (!handler) {
      throw new Error(`Handler ${handlerName} not found`);
    }

    batch.status = 'running';
    batch.startTime = Date.now();

    while (batch.getPendingJobs().length > 0 && this.runningJobs < this.maxParallel) {
      const job = batch.getNextJob();
      if (!job) break;

      this.runningJobs++;

      // Run job
      const result = await job.execute(handler);
      this.runningJobs--;

      batch.updateProgress();

      // Handle failure
      if (!result.success && !result.retry && batch.options.stopOnError) {
        batch.status = 'paused';
        break;
      }
    }

    if (batch.getPendingJobs().length === 0) {
      batch.status = 'completed';
      batch.endTime = Date.now();
    }

    return batch.getStats();
  }

  async processAll(handlerName) {
    const results = [];

    while (this.queue.pendingBatches.length > 0) {
      const batch = this.queue.dequeue();
      const stats = await this.processBatch(batch, handlerName);
      results.push({ batchId: batch.id, ...stats });
    }

    return results;
  }

  getBatchStatus(batchId) {
    const batch = this.queue.getBatch(batchId);
    return batch ? batch.getStats() : null;
  }

  saveState() {
    const batchesState = {};
    for (const [id, batch] of this.queue.batches) {
      batchesState[id] = {
        id: batch.id,
        name: batch.name,
        status: batch.status,
        progress: batch.progress
      };
    }
    this.state = { batches: batchesState };
    saveJSON(BATCH_DB, this.state);
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Batch Demo ===\n');

  const processor = new BatchProcessor({ maxParallel: 3 });

  // Register handlers
  processor.registerHandler('process', async (data) => {
    // Simulate processing
    await new Promise(r => setTimeout(r, 50));
    return { processed: true, data: data.value * 2 };
  });

  processor.registerHandler('validate', async (data) => {
    if (data.value < 0) {
      throw new Error('Invalid value: must be positive');
    }
    return { valid: true, data };
  });

  // Create batches
  console.log('1. Creating Batches:');

  const batch1 = processor.createBatch('process-numbers', [
    { value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 }
  ], { parallel: 2 });
  console.log(`   Created batch: ${batch1.name} (${batch1.jobs.length} jobs)`);

  const batch2 = processor.createBatch('validate-data', [
    { value: 10 }, { value: 20 }, { value: -5 }, { value: 30 }
  ], { parallel: 2, stopOnError: true });
  console.log(`   Created batch: ${batch2.name} (${batch2.jobs.length} jobs)`);

  // Process first batch
  console.log('\n2. Processing Batch 1:');
  const stats1 = await processor.processBatch(batch1, 'process');
  console.log(`   Status: ${stats1.status}`);
  console.log(`   Completed: ${stats1.completed}/${stats1.total}`);
  console.log(`   Failed: ${stats1.failed}`);
  console.log(`   Duration: ${stats1.duration}ms`);

  // Show job results
  console.log('\n3. Job Results:');
  batch1.jobs.forEach(job => {
    console.log(`   ${job.id}: ${job.status} (${job.getDuration()}ms)`);
    if (job.result) {
      console.log(`      Result: ${JSON.stringify(job.result)}`);
    }
  });

  // Process second batch
  console.log('\n4. Processing Batch 2:');
  const stats2 = await processor.processBatch(batch2, 'validate');
  console.log(`   Status: ${stats2.status}`);
  console.log(`   Completed: ${stats2.completed}/${stats2.total}`);
  console.log(`   Failed: ${stats2.failed}`);

  // Show failed job
  const failedJob = batch2.jobs.find(j => j.status === 'failed');
  if (failedJob) {
    console.log(`   Failed job error: ${failedJob.error}`);
  }

  // Create and process batch with multiple parallel
  console.log('\n5. Parallel Processing:');
  const batch3 = processor.createBatch('parallel-test', [
    { value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 },
    { value: 6 }, { value: 7 }, { value: 8 }, { value: 9 }, { value: 10 }
  ], { parallel: 5 });

  const startTime = Date.now();
  const stats3 = await processor.processBatch(batch3, 'process');
  const totalTime = Date.now() - startTime;

  console.log(`   Jobs: ${stats3.total}`);
  console.log(`   Parallel: 5`);
  console.log(`   Total time: ${totalTime}ms`);
  console.log(`   Avg per job: ${(totalTime / stats3.total).toFixed(0)}ms`);

  // Show batch list
  console.log('\n6. Batch Summary:');
  const batches = processor.queue.listBatches();
  batches.forEach(batch => {
    const stats = batch.getStats();
    console.log(`   ${batch.name}: ${stats.completed}/${stats.total} completed, ${stats.failed} failed`);
  });

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'process') {
  const processor = new BatchProcessor();
  processor.registerHandler('default', async (data) => ({ result: data }));
  const batch = processor.createBatch('default', [{ value: 1 }]);
  processor.processBatch(batch, 'default').then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const processor = new BatchProcessor();
  console.log(processor.queue.listBatches().length, 'batches');
} else {
  console.log('Agent Batch Module');
  console.log('Usage: node agent-batch.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  process <batch>  Process a batch');
  console.log('  status <batch>   Show batch status');
}
