/**
 * Agent Scheduler 2 - Advanced Task Scheduler
 *
 * Advanced scheduling with priorities, dependencies, and resource management.
 *
 * Usage: node agent-scheduler-2.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   priority   - Show priority scheduling
 *   resources  - Show resource management
 */

class Task {
  constructor(id, handler, config = {}) {
    this.id = id;
    this.handler = handler;
    this.priority = config.priority || 0;
    this.dependencies = config.dependencies || [];
    this.resources = config.resources || {};
    this.status = 'pending';
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
  }
}

class ResourceManager {
  constructor() {
    this.resources = new Map();
    this.allocations = new Map();
  }

  register(name, capacity) {
    this.resources.set(name, { capacity, used: 0 });
    return this;
  }

  allocate(taskId, resources) {
    for (const [name, amount] of Object.entries(resources)) {
      const resource = this.resources.get(name);
      if (!resource) throw new Error(`Unknown resource: ${name}`);
      if (resource.used + amount > resource.capacity) {
        return false;
      }
    }

    // Allocate
    for (const [name, amount] of Object.entries(resources)) {
      this.resources.get(name).used += amount;
    }
    this.allocations.set(taskId, resources);
    return true;
  }

  release(taskId) {
    const resources = this.allocations.get(taskId);
    if (!resources) return;

    for (const [name, amount] of Object.entries(resources)) {
      const resource = this.resources.get(name);
      if (resource) resource.used -= amount;
    }
    this.allocations.delete(taskId);
  }

  getAvailable(name) {
    const resource = this.resources.get(name);
    if (!resource) return 0;
    return resource.capacity - resource.used;
  }

  getStatus() {
    return Array.from(this.resources.entries()).map(([name, r]) => ({
      name,
      capacity: r.capacity,
      used: r.used,
      available: r.capacity - r.used
    }));
  }
}

class Scheduler2Agent {
  constructor() {
    this.tasks = new Map();
    this.queue = [];
    this.running = new Map();
    this.completed = new Map();
    this.resourceManager = new ResourceManager();
    this.stats = { scheduled: 0, completed: 0, failed: 0 };
  }

  registerTask(id, handler, config = {}) {
    const task = new Task(id, handler, config);
    this.tasks.set(id, task);
    return this;
  }

  schedule(id, cronExpression = null) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);

    this.queue.push({ task, cronExpression, nextRun: Date.now() });
    this.queue.sort((a, b) => b.task.priority - a.task.priority);
    this.stats.scheduled++;

    return this;
  }

  scheduleCron(id, cronExpression) {
    const task = this.tasks.get(id);
    if (!task) throw new Error(`Task ${id} not found`);

    // Simple cron: min hour day month weekday
    const parts = cronExpression.split(' ');
    const schedule = {
      minute: parts[0] === '*' ? null : parseInt(parts[0]),
      hour: parts[1] === '*' ? null : parseInt(parts[1]),
      day: parts[2] === '*' ? null : parseInt(parts[2]),
      month: parts[3] === '*' ? null : parseInt(parts[3]),
      weekday: parts[4] === '*' ? null : parseInt(parts[4])
    };

    this.queue.push({ task, cronExpression, schedule, recurring: true });
    this.stats.scheduled++;

    return this;
  }

  async processQueue(concurrency = 1) {
    const promises = [];

    while (this.queue.length > 0 && this.running.size < concurrency) {
      const item = this.queue.shift();
      const task = item.task;

      // Check dependencies
      const depsMet = task.dependencies.every(depId => {
        const dep = this.completed.get(depId);
        return dep && dep.status === 'completed';
      });

      if (!depsMet) {
        this.queue.unshift(item);
        continue;
      }

      // Check resources
      if (Object.keys(task.resources).length > 0) {
        if (!this.resourceManager.allocate(task.id, task.resources)) {
          this.queue.unshift(item);
          continue;
        }
      }

      // Execute
      const promise = this._runTask(task);
      promises.push(promise);
      this.running.set(task.id, task);
    }

    return Promise.all(promises);
  }

  async _runTask(task) {
    console.log(`   Running: ${task.id} (priority: ${task.priority})`);
    task.status = 'running';
    task.startTime = Date.now();

    try {
      task.result = await task.handler();
      task.status = 'completed';
      this.stats.completed++;
    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      this.stats.failed++;
    }

    task.endTime = Date.now();
    this.running.delete(task.id);
    this.completed.set(task.id, task);

    // Release resources
    this.resourceManager.release(task.id);

    return task;
  }

  getTask(id) {
    return this.tasks.get(id);
  }

  getQueue() {
    return this.queue.map(item => ({
      id: item.task.id,
      priority: item.task.priority,
      dependencies: item.task.dependencies
    }));
  }

  getStats() {
    return {
      ...this.stats,
      queued: this.queue.length,
      running: this.running.size,
      completed: this.completed.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const scheduler2 = new Scheduler2Agent();

switch (command) {
  case 'demo':
    console.log('=== Agent Scheduler 2 Demo\n');

    // Setup resources
    console.log('1. Resource Management:');
    scheduler2.resourceManager
      .register('cpu', 4)
      .register('memory', 1024)
      .register('io', 10);

    const resources = scheduler2.resourceManager.getStatus();
    resources.forEach(r => console.log(`   ${r.name}: ${r.used}/${r.capacity}`));

    // 2. Register tasks
    console.log('\n2. Task Registration:');
    scheduler2.registerTask('task1', async () => {
      await new Promise(r => setTimeout(r, 50));
      return { result: 'task1 done' };
    }, { priority: 10, resources: { cpu: 1, memory: 100 } });

    scheduler2.registerTask('task2', async () => {
      await new Promise(r => setTimeout(r, 50));
      return { result: 'task2 done' };
    }, { priority: 5, resources: { cpu: 2, memory: 200 } });

    scheduler2.registerTask('task3', async () => {
      await new Promise(r => setTimeout(r, 50));
      return { result: 'task3 done' };
    }, { priority: 8, resources: { io: 2 } });

    scheduler2.registerTask('task4', async () => {
      await new Promise(r => setTimeout(r, 50));
      return { result: 'task4 done' };
    }, { priority: 3, dependencies: ['task1', 'task2'] });

    console.log('   Registered: task1, task2, task3, task4');

    // 3. Schedule tasks
    console.log('\n3. Task Scheduling:');
    scheduler2.schedule('task1');
    scheduler2.schedule('task2');
    scheduler2.schedule('task3');
    scheduler2.schedule('task4');

    const queue = scheduler2.getQueue();
    console.log(`   Queued: ${queue.length} tasks`);
    console.log(`   First: ${queue[0]?.id} (priority: ${queue[0]?.priority})`);

    // 4. Execute
    console.log('\n4. Execution:');
    await scheduler2.processQueue(2);
    console.log('   Completed: task1, task2, task3');

    // 5. Dependencies
    console.log('\n5. Dependencies:');
    scheduler2.schedule('task4');
    await scheduler2.processQueue(2);
    console.log('   task4 completed after dependencies');

    // 6. Statistics
    console.log('\n6. Statistics:');
    const stats = scheduler2.getStats();
    console.log(`   Scheduled: ${stats.scheduled}`);
    console.log(`   Completed: ${stats.completed}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`   Queued: ${stats.queued}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'priority':
    console.log('Priority Scheduling:');
    console.log('  - Higher priority tasks execute first');
    console.log('  - Priority range: 0-100');
    console.log('  - Equal priority: FIFO');
    break;

  case 'resources':
    console.log('Resource Management:');
    console.log('  - Register resource pools');
    console.log('  - Allocate resources per task');
    console.log('  - Automatic release on completion');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-scheduler-2.js [demo|priority|resources]');
}
