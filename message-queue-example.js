/**
 * Message Queue Example
 * 异步消息队列示例
 */

const { Queue, QueueManager, JobStatus, MessagePriority } = require('./message-queue');

// ========== Simple Queue Example ==========

async function simpleQueueExample() {
  console.log('=== Simple Queue Example ===\n');

  const queue = new Queue('tasks', { concurrency: 2 });

  // Define worker
  const worker = async (job) => {
    console.log(`Processing job ${job.id}:`, job.data);
    await new Promise(r => setTimeout(r, 500)); // Simulate work
    return { result: 'done', input: job.data };
  };

  // Add jobs
  console.log('Adding jobs...');
  await queue.add({ task: 'send-email', to: 'user1@example.com' });
  await queue.add({ task: 'process-image', image: 'photo.jpg' }, { priority: MessagePriority.HIGH });
  await queue.add({ task: 'generate-report', type: 'weekly' }, { delay: 2000 });

  // Start processing
  console.log('\nStarting queue...');
  queue.start();

  // Wait for completion
  await new Promise(r => setTimeout(r, 3000));

  console.log('\nStats:', queue.getStats());

  queue.stop();
}

// ========== Queue Manager Example ==========

async function queueManagerExample() {
  console.log('\n=== Queue Manager Example ===\n');

  const manager = new QueueManager();

  // Create queues
  const emailQueue = manager.createQueue('emails', { concurrency: 5 });
  const imageQueue = manager.createQueue('images', { concurrency: 2 });

  // Add jobs to different queues
  console.log('Adding jobs...');
  await emailQueue.add({ to: 'user1@test.com', subject: 'Welcome' });
  await emailQueue.add({ to: 'user2@test.com', subject: 'Reset Password' });

  await imageQueue.add({ image: 'photo1.jpg', action: 'resize' });
  await imageQueue.add({ image: 'photo2.jpg', action: 'thumbnail' });

  // Start processing
  const worker = async (job) => {
    console.log(`[${job.queue.name}] Processing:`, job.data);
    await new Promise(r => setTimeout(r, 300));
    return 'done';
  };

  emailQueue.worker = worker;
  imageQueue.worker = worker;

  emailQueue.start();
  imageQueue.start();

  // Wait
  await new Promise(r => setTimeout(r, 2000));

  console.log('\nAll Stats:', manager.getStats());

  manager.clearAll();
}

// ========== Job Options Example ==========

async function jobOptionsExample() {
  console.log('\n=== Job Options Example ===\n');

  const queue = new Queue('advanced');

  // Job with retry
  console.log('1. Job with retry (will fail twice then succeed):');
  let attempt = 0;
  const unreliableWorker = async (job) => {
    attempt++;
    console.log(`   Attempt ${attempt}`);
    if (attempt < 3) {
      throw new Error('Simulated failure');
    }
    return { success: true };
  };

  await queue.add({ task: 'unreliable' }, { maxAttempts: 3, retryDelay: 500 });

  queue.worker = unreliableWorker;
  queue.start();

  await new Promise(r => setTimeout(r, 3000));

  console.log('\nStats:', queue.getStats());
  queue.stop();

  // Delayed job
  console.log('\n2. Delayed job:');
  const delayedQueue = new Queue('delayed');

  const start = Date.now();
  await delayedQueue.add({ task: 'delayed' }, { delay: 1500 });

  delayedQueue.worker = async (job) => {
    const elapsed = Date.now() - start;
    console.log(`   Job executed after ${elapsed}ms`);
    return 'done';
  };

  delayedQueue.start();
  await new Promise(r => setTimeout(r, 2000));
  delayedQueue.stop();

  // Priority job
  console.log('\n3. Priority jobs:');
  const priorityQueue = new Queue('priority');

  await priorityQueue.add({ task: 'low' }, { priority: MessagePriority.LOW });
  await priorityQueue.add({ task: 'normal' }, { priority: MessagePriority.NORMAL });
  await priorityQueue.add({ task: 'high' }, { priority: MessagePriority.HIGH });
  await priorityQueue.add({ task: 'critical' }, { priority: MessagePriority.CRITICAL });

  const order = [];
  priorityQueue.worker = async (job) => {
    order.push(job.data.task);
    return 'done';
  };

  priorityQueue.start();
  await new Promise(r => setTimeout(r, 1000));

  console.log('   Execution order:', order);
  priorityQueue.stop();
}

// ========== Run ==========

async function main() {
  const args = process.argv.slice(2);
  const example = args[0] || 'simple';

  try {
    if (example === 'simple') {
      await simpleQueueExample();
    } else if (example === 'manager') {
      await queueManagerExample();
    } else if (example === 'options') {
      await jobOptionsExample();
    } else if (example === 'all') {
      await simpleQueueExample();
      await queueManagerExample();
      await jobOptionsExample();
    } else {
      console.log('Usage: node message-queue-example.js [simple|manager|options|all]');
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
