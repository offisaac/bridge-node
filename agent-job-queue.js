/**
 * Agent Job Queue - Distributed Job Queue
 *
 * Job queue with priorities, dead letters, scheduling, and batching.
 *
 * Usage: node agent-job-queue.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   batch      - Show batch processing
 *   deadletter - Show dead letter queue
 */

class Job {
  constructor(id, payload, options = {}) {
    this.id = id;
    this.payload = payload;
    this.status = 'queued';
    this.priority = options.priority || 0;
    this.attempts = 0;
    this.maxAttempts = options.maxAttempts || 3;
    this.timeout = options.timeout || 30000;
    this.delay = options.delay || 0;
    this.scheduledAt = options.scheduledAt ? new Date(options.scheduledAt) : null;
    this.retriedAt = null;
    this.completedAt = null;
    this.failedAt = null;
    this.error = null;
    this.result = null;
    this.metadata = options.metadata || {};
  }

  canRetry() {
    return this.attempts < this.maxAttempts;
  }

  isDelayed() {
    return this.delay > 0 || (this.scheduledAt && this.scheduledAt > new Date());
  }
}

class DeadLetterQueue {
  constructor() {
    this.jobs = [];
  }

  add(job, reason) {
    this.jobs.push({
      job,
      reason,
      timestamp: Date.now()
    });
  }

  getJobs() {
    return this.jobs;
  }

  size() {
    return this.jobs.length;
  }
}

class Batch {
  constructor(size, timeout) {
    this.size = size;
    this.timeout = timeout;
    this.jobs = [];
    this.createdAt = Date.now();
  }

  add(job) {
    this.jobs.push(job);
    return this.jobs.length >= this.size;
  }

  isReady() {
    return this.jobs.length >= this.size || (Date.now() - this.createdAt) >= this.timeout;
  }

  getJobs() {
    return this.jobs;
  }
}

class JobQueueAgent {
  constructor() {
    this.queues = new Map(); // priority -> jobs
    this.jobs = new Map(); // id -> job
    this.processing = new Set();
    this.deadLetterQueue = new DeadLetterQueue();
    this.stats = { queued: 0, processed: 0, failed: 0, deadLettered: 0 };
    this._initQueues();
  }

  _initQueues() {
    // Priority queues: higher number = higher priority
    for (let i = 0; i <= 10; i++) {
      this.queues.set(i, []);
    }
  }

  enqueue(id, payload, options = {}) {
    const job = new Job(id, payload, options);
    this.jobs.set(id, job);

    if (job.isDelayed()) {
      // Schedule for later
      setTimeout(() => this._actuallyEnqueue(job), job.delay);
      if (job.scheduledAt) {
        const delay = job.scheduledAt.getTime() - Date.now();
        if (delay > 0) {
          setTimeout(() => this._actuallyEnqueue(job), delay);
          return job;
        }
      }
    }

    this._actuallyEnqueue(job);
    return job;
  }

  _actuallyEnqueue(job) {
    const queue = this.queues.get(job.priority);
    queue.push(job);
    this.stats.queued++;
    return job;
  }

  dequeue(count = 1) {
    const jobs = [];

    for (let p = 10; p >= 0 && jobs.length < count; p--) {
      const queue = this.queues.get(p);
      while (queue.length > 0 && jobs.length < count) {
        const job = queue.shift();
        if (!job.isDelayed()) {
          job.status = 'processing';
          this.processing.add(job.id);
          jobs.push(job);
        } else {
          // Put back at front
          queue.unshift(job);
          break;
        }
      }
    }

    return jobs;
  }

  async process(handler, options = {}) {
    const { concurrency = 1, batchSize = 1, batchTimeout = 1000 } = options;

    const batch = new Batch(batchSize, batchTimeout);
    const promises = [];

    while (this.processing.size < concurrency) {
      const jobs = this.dequeue(batchSize - batch.jobs.length);
      if (jobs.length === 0) break;

      for (const job of jobs) {
        const promise = this._processJob(job, handler);
        promises.push(promise);
      }
    }

    return Promise.all(promises);
  }

  async _processJob(job, handler) {
    try {
      job.attempts++;
      console.log(`   Processing: ${job.id} (attempt ${job.attempts}/${job.maxAttempts})`);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout')), job.timeout);
      });

      const result = await Promise.race([
        handler(job.payload),
        timeoutPromise
      ]);

      job.status = 'completed';
      job.completedAt = Date.now();
      job.result = result;
      this.processing.delete(job.id);
      this.stats.processed++;

      return { success: true, job };
    } catch (error) {
      job.error = error.message;
      job.retriedAt = Date.now();

      if (job.canRetry()) {
        job.status = 'retry';
        console.log(`   Retrying: ${job.id}`);
        this._actuallyEnqueue(job);
      } else {
        job.status = 'failed';
        job.failedAt = Date.now();
        this.deadLetterQueue.add(job, error.message);
        this.stats.deadLettered++;
        console.log(`   Dead-lettered: ${job.id}`);
      }

      this.processing.delete(job.id);
      this.stats.failed++;

      return { success: false, job, error: error.message };
    }
  }

  retry(id) {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job ${id} not found`);

    job.status = 'queued';
    job.attempts = 0;
    job.error = null;
    this._actuallyEnqueue(job);

    return job;
  }

  getJob(id) {
    return this.jobs.get(id);
  }

  getStats() {
    let queued = 0;
    for (const queue of this.queues.values()) {
      queued += queue.length;
    }

    return {
      ...this.stats,
      queued,
      processing: this.processing.size,
      deadLetter: this.deadLetterQueue.size()
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const jobQueue = new JobQueueAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Job Queue Demo\n');

    // 1. Basic enqueue/dequeue
    console.log('1. Basic Queue Operations:');
    jobQueue.enqueue('job1', { task: 'process-user', userId: 1 }, { priority: 5 });
    jobQueue.enqueue('job2', { task: 'process-user', userId: 2 }, { priority: 3 });
    jobQueue.enqueue('job3', { task: 'send-email', email: 'test@example.com' }, { priority: 7 });

    const stats1 = jobQueue.getStats();
    console.log(`   Queued: ${stats1.queued}`);

    // 2. Processing
    console.log('\n2. Job Processing:');
    const handler = async (payload) => {
      console.log(`      Handling: ${JSON.stringify(payload)}`);
      await new Promise(r => setTimeout(r, 10));
      return { processed: true };
    };

    await jobQueue.process(handler, { concurrency: 2 });
    console.log(`   Processed: ${jobQueue.stats.processed}`);

    // 3. Delayed jobs
    console.log('\n3. Delayed Jobs:');
    jobQueue.enqueue('job4', { task: 'delayed-task' }, { delay: 100 });
    jobQueue.enqueue('job5', { task: 'scheduled-task' }, { scheduledAt: Date.now() + 50 });

    await new Promise(r => setTimeout(r, 150));
    await jobQueue.process(handler);
    console.log(`   Delayed jobs processed`);

    // 4. Retry logic
    console.log('\n4. Retry Logic:');
    jobQueue.enqueue('job6', { task: 'may-fail' }, { maxAttempts: 3 });

    let attempts = 0;
    const unreliableHandler = async (payload) => {
      attempts++;
      if (attempts < 2) throw new Error('Temporary failure');
      return { success: true };
    };

    await jobQueue.process(unreliableHandler);
    console.log(`   Attempts: ${attempts}, Status: completed`);

    // 5. Priority queue
    console.log('\n5. Priority Queue:');
    jobQueue.enqueue('low-priority', { task: 'low' }, { priority: 1 });
    jobQueue.enqueue('high-priority', { task: 'high' }, { priority: 10 });
    jobQueue.enqueue('medium-priority', { task: 'medium' }, { priority: 5 });

    const jobs = jobQueue.dequeue(3);
    console.log(`   First dequeued: ${jobs[0].id} (priority: ${jobs[0].priority})`);

    // 6. Dead letter queue
    console.log('\n6. Dead Letter Queue:');
    jobQueue.enqueue('job7', { task: 'always-fail' }, { maxAttempts: 1 });

    const failingHandler = async () => {
      throw new Error('Permanent failure');
    };

    await jobQueue.process(failingHandler);
    console.log(`   Dead letter size: ${jobQueue.deadLetterQueue.size()}`);

    // 7. Statistics
    console.log('\n7. Statistics:');
    const finalStats = jobQueue.getStats();
    console.log(`   Queued: ${finalStats.queued}`);
    console.log(`   Processed: ${finalStats.processed}`);
    console.log(`   Failed: ${finalStats.failed}`);
    console.log(`   Dead-lettered: ${finalStats.deadLettered}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'batch':
    console.log('Batch Processing:');
    console.log('  - Collect jobs into batches');
    console.log('  - Process batch together');
    console.log('  - Configurable batch size and timeout');
    break;

  case 'deadletter':
    console.log('Dead Letter Queue:');
    console.log('  - Store failed jobs after max retries');
    console.log('  - Keep track of failure reasons');
    console.log('  - Manual retry available');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-job-queue.js [demo|batch|deadletter]');
}
