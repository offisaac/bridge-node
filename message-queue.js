/**
 * Message Queue - 异步消息队列系统
 * 支持任务异步处理
 */

const EventEmitter = require('events');
const crypto = require('crypto');

// ========== Message Types ==========

const MessagePriority = {
  LOW: 0,
  NORMAL: 1,
  HIGH: 2,
  CRITICAL: 3
};

const JobStatus = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRY: 'retry',
  CANCELLED: 'cancelled'
};

// ========== Job ==========

class Job {
  constructor(queue, id, data, options = {}) {
    this.queue = queue;
    this.id = id || crypto.randomUUID();
    this.data = data;
    this.options = options;

    this.priority = options.priority || MessagePriority.NORMAL;
    this.attempts = 0;
    this.maxAttempts = options.maxAttempts || 3;
    this.delay = options.delay || 0;
    this.timeout = options.timeout || 30000;

    this.status = JobStatus.PENDING;
    this.result = null;
    this.error = null;

    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.nextRetryAt = null;
  }

  async process(handler) {
    if (this.status === JobStatus.CANCELLED) {
      return;
    }

    this.status = JobStatus.PROCESSING;
    this.startedAt = Date.now();

    try {
      // Check delay
      if (this.delay > 0 && this.attempts === 0) {
        await this._delay(this.delay);
      }

      // Execute with timeout
      const result = await this._executeWithTimeout(handler);

      this.status = JobStatus.COMPLETED;
      this.result = result;
      this.completedAt = Date.now();

      this.queue.emit('job:completed', this);

      return result;

    } catch (error) {
      this.attempts++;
      this.error = error.message;

      if (this.attempts < this.maxAttempts) {
        this.status = JobStatus.RETRY;
        const retryDelay = this.options.retryDelay || Math.pow(2, this.attempts) * 1000;
        this.nextRetryAt = Date.now() + retryDelay;

        this.queue.emit('job:retry', this);
        throw error;

      } else {
        this.status = JobStatus.FAILED;
        this.completedAt = Date.now();

        this.queue.emit('job:failed', this);
        throw error;
      }
    }
  }

  async _executeWithTimeout(handler) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Job timeout'));
      }, this.timeout);

      Promise.resolve(handler(this.data))
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  cancel() {
    this.status = JobStatus.CANCELLED;
    this.queue.emit('job:cancelled', this);
  }

  toJSON() {
    return {
      id: this.id,
      data: this.data,
      priority: this.priority,
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      status: this.status,
      result: this.result,
      error: this.error,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt
    };
  }
}

// ========== Queue ==========

class Queue extends EventEmitter {
  constructor(name, options = {}) {
    super();

    this.name = name;
    this.options = options;

    this.jobs = new Map(); // id -> Job
    this.pending = []; // Priority queue
    this.processing = new Map(); // id -> Job

    this.concurrency = options.concurrency || 1;
    this.running = false;
    this.worker = null;

    this.stats = {
      processed: 0,
      completed: 0,
      failed: 0,
      retried: 0
    };
  }

  // ========== Job Management ==========

  async add(data, options = {}) {
    const job = new Job(this, null, data, options);

    this.jobs.set(job.id, job);

    if (job.delay > 0) {
      // Delayed job
      setTimeout(() => {
        this._enqueue(job);
      }, job.delay);
    } else {
      this._enqueue(job);
    }

    this.emit('job:added', job);

    // Start processing if not running
    if (!this.running && this.worker) {
      this.start();
    }

    return job;
  }

  _enqueue(job) {
    // Insert by priority
    let inserted = false;
    for (let i = 0; i < this.pending.length; i++) {
      if (job.priority > this.pending[i].priority) {
        this.pending.splice(i, 0, job);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      this.pending.push(job);
    }
  }

  async process(processor) {
    this.worker = processor;

    while (this.running && this.pending.length > 0) {
      const job = this.pending.shift();

      if (job.status === JobStatus.CANCELLED) {
        continue;
      }

      this.processing.set(job.id, job);

      try {
        await job.process(processor);
        this.stats.processed++;
        this.stats.completed++;
      } catch (error) {
        this.stats.failed++;

        if (job.status === JobStatus.RETRY) {
          this.stats.retried++;
          // Re-queue for retry
          this._enqueue(job);
        }
      } finally {
        this.processing.delete(job.id);
      }
    }
  }

  // ========== Queue Control ==========

  start() {
    if (this.running) return;
    this.running = true;

    const processNext = async () => {
      if (!this.running) return;

      if (this.pending.length === 0) {
        setTimeout(processNext, 100);
        return;
      }

      // Process up to concurrency jobs
      const batch = this.pending.splice(0, this.concurrency);

      await Promise.all(batch.map(async (job) => {
        if (job.status === JobStatus.CANCELLED) {
          return;
        }

        this.processing.set(job.id, job);

        try {
          await job.process(this.worker);
          this.stats.processed++;
          this.stats.completed++;
        } catch (error) {
          this.stats.failed++;

          if (job.status === JobStatus.RETRY) {
            this.stats.retried++;
            this._enqueue(job);
          }
        } finally {
          this.processing.delete(job.id);
        }
      }));

      processNext();
    };

    processNext();
    this.emit('started');
  }

  stop() {
    this.running = false;
    this.emit('stopped');
  }

  pause() {
    this.running = false;
    this.emit('paused');
  }

  resume() {
    if (!this.running) {
      this.start();
    }
  }

  // ========== Job Operations ==========

  async getJob(jobId) {
    return this.jobs.get(jobId);
  }

  async getJobs(status) {
    const jobs = [];
    for (const job of this.jobs.values()) {
      if (!status || job.status === status) {
        jobs.push(job);
      }
    }
    return jobs;
  }

  async cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && job.status === JobStatus.PENDING) {
      job.cancel();
      return true;
    }
    return false;
  }

  async retryJob(jobId) {
    const job = this.jobs.get(jobId);
    if (job && (job.status === JobStatus.FAILED || job.status === JobStatus.CANCELLED)) {
      job.status = JobStatus.PENDING;
      job.attempts = 0;
      job.error = null;
      this._enqueue(job);
      return true;
    }
    return false;
  }

  // ========== Bulk Operations ==========

  async bulkAdd(jobsData) {
    const jobs = [];

    for (const item of jobsData) {
      const job = await this.add(item.data, item.options);
      jobs.push(job);
    }

    return jobs;
  }

  async bulkCancel(jobIds) {
    let cancelled = 0;
    for (const jobId of jobIds) {
      if (await this.cancelJob(jobId)) {
        cancelled++;
      }
    }
    return cancelled;
  }

  // ========== Statistics ==========

  getStats() {
    return {
      name: this.name,
      pending: this.pending.length,
      processing: this.processing.size,
      total: this.jobs.size,
      ...this.stats
    };
  }

  clear() {
    this.jobs.clear();
    this.pending = [];
    this.processing.clear();
    this.stats = {
      processed: 0,
      completed: 0,
      failed: 0,
      retried: 0
    };
  }
}

// ========== Queue Manager ==========

class QueueManager extends EventEmitter {
  constructor(options = {}) {
    super();

    this.queues = new Map();
    this.options = options;
  }

  createQueue(name, options = {}) {
    if (this.queues.has(name)) {
      return this.queues.get(name);
    }

    const queue = new Queue(name, options);
    this.queues.set(name, queue);

    // Forward events
    queue.on('job:added', (job) => this.emit('job:added', { queue: name, job }));
    queue.on('job:completed', (job) => this.emit('job:completed', { queue: name, job }));
    queue.on('job:failed', (job) => this.emit('job:failed', { queue: name, job }));

    return queue;
  }

  getQueue(name) {
    return this.queues.get(name);
  }

  getQueueNames() {
    return Array.from(this.queues.keys());
  }

  async getStats() {
    const stats = {};
    for (const [name, queue] of this.queues) {
      stats[name] = queue.getStats();
    }
    return stats;
  }

  async clearQueue(name) {
    const queue = this.queues.get(name);
    if (queue) {
      queue.clear();
    }
  }

  async clearAll() {
    for (const queue of this.queues.values()) {
      queue.clear();
    }
  }
}

// ========== Delayed Job Queue ==========

class DelayedQueue extends Queue {
  _enqueue(job) {
    // Schedule based on nextRetryAt
    if (job.nextRetryAt) {
      const delay = job.nextRetryAt - Date.now();
      if (delay > 0) {
        setTimeout(() => {
          super._enqueue(job);
        }, delay);
        return;
      }
    }
    super._enqueue(job);
  }
}

// ========== Export ==========

module.exports = {
  Queue,
  QueueManager,
  DelayedQueue,
  Job,
  JobStatus,
  MessagePriority
};
