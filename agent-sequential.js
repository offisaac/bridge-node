/**
 * Agent Sequential Module
 *
 * Provides sequential task processing for agents with ordered execution,
 * dependencies, and state management.
 * Usage: node agent-sequential.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   execute <task>        Execute sequential task
 *   status                 Show sequential status
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SEQUENTIAL_DB = path.join(DATA_DIR, 'sequential-state.json');

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
 * Task States
 */
const TaskState = {
  PENDING: 'pending',
  WAITING: 'waiting',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

/**
 * Sequential Task
 */
class SequentialTask {
  constructor(id, fn, options = {}) {
    this.id = id;
    this.fn = fn;
    this.options = {
      timeout: options.timeout || 30000,
      retries: options.retries || 0,
      retryDelay: options.retryDelay || 1000,
      ...options
    };
    this.state = TaskState.PENDING;
    this.result = null;
    this.error = null;
    this.startTime = null;
    this.endTime = null;
    this.attempts = 0;
    this.dependencies = [];
    this.dependents = [];
  }

  async execute() {
    if (this.state === TaskState.SKIPPED) {
      return null;
    }

    this.state = TaskState.RUNNING;
    this.startTime = Date.now();
    this.attempts++;

    try {
      const result = await this.runWithTimeout();
      this.state = TaskState.COMPLETED;
      this.result = result;
      this.endTime = Date.now();
      return result;
    } catch (error) {
      this.state = TaskState.FAILED;
      this.error = error.message;
      this.endTime = Date.now();

      if (this.attempts <= this.options.retries) {
        await new Promise(r => setTimeout(r, this.options.retryDelay));
        return this.execute();
      }

      throw error;
    }
  }

  runWithTimeout() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Task timed out after ${this.options.timeout}ms`));
      }, this.options.timeout);

      Promise.resolve(this.fn()).then(result => {
        clearTimeout(timer);
        resolve(result);
      }).catch(err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  addDependency(task) {
    this.dependencies.push(task.id);
    task.dependents.push(this.id);
  }

  canExecute(completedTasks) {
    if (this.state !== TaskState.PENDING && this.state !== TaskState.WAITING) {
      return false;
    }
    return this.dependencies.every(depId => completedTasks.has(depId));
  }

  getDuration() {
    if (this.startTime && this.endTime) {
      return this.endTime - this.startTime;
    }
    return 0;
  }
}

/**
 * Sequential Pipeline
 */
class SequentialPipeline {
  constructor(name, options = {}) {
    this.name = name;
    this.options = {
      stopOnError: options.stopOnError !== false,
      parallel: options.parallel || 1,
      ...options
    };
    this.tasks = new Map();
    this.taskOrder = [];
    this.completedTasks = new Set();
    this.failedTasks = new Set();
    this.results = new Map();
    this.state = TaskState.PENDING;
  }

  addTask(id, fn, options = {}) {
    const task = new SequentialTask(id, fn, options);
    this.tasks.set(id, task);
    this.taskOrder.push(id);
    return task;
  }

  addDependency(taskId, dependencyId) {
    const task = this.tasks.get(taskId);
    const dependency = this.tasks.get(dependencyId);
    if (task && dependency) {
      task.addDependency(dependency);
    }
  }

  async execute() {
    this.state = TaskState.RUNNING;
    this.completedTasks.clear();
    this.failedTasks.clear();
    this.results.clear();

    const pendingTasks = new Set(this.taskOrder);
    const waitingTasks = new Set();

    while (pendingTasks.size > 0 || waitingTasks.size > 0) {
      // Move tasks that can execute from pending to ready
      for (const taskId of pendingTasks) {
        const task = this.tasks.get(taskId);
        if (task.canExecute(this.completedTasks)) {
          waitingTasks.add(taskId);
        }
      }

      for (const taskId of waitingTasks) {
        pendingTasks.delete(taskId);
      }

      if (waitingTasks.size === 0 && pendingTasks.size > 0) {
        throw new Error('Circular dependency detected or unmet dependencies');
      }

      // Execute ready tasks
      const readyTasks = Array.from(waitingTasks).slice(0, this.options.parallel);
      const executions = readyTasks.map(async (taskId) => {
        const task = this.tasks.get(taskId);
        try {
          const result = await task.execute();
          this.results.set(taskId, result);
          this.completedTasks.add(taskId);
        } catch (error) {
          this.failedTasks.add(taskId);
          if (this.options.stopOnError) {
            throw error;
          }
        }
        waitingTasks.delete(taskId);
      });

      await Promise.all(executions);

      // Skip tasks that depend on failed tasks
      if (this.failedTasks.size > 0 && !this.options.stopOnError) {
        for (const taskId of pendingTasks) {
          const task = this.tasks.get(taskId);
          const hasFailedDep = task.dependencies.some(depId => this.failedTasks.has(depId));
          if (hasFailedDep) {
            task.state = TaskState.SKIPPED;
            this.completedTasks.add(taskId);
            pendingTasks.delete(taskId);
          }
        }
      }
    }

    this.state = this.failedTasks.size > 0 ? TaskState.FAILED : TaskState.COMPLETED;
    return {
      results: Object.fromEntries(this.results),
      completed: this.completedTasks.size,
      failed: this.failedTasks.size
    };
  }

  getStatus() {
    const taskStatus = {};
    for (const [id, task] of this.tasks) {
      taskStatus[id] = {
        state: task.state,
        result: task.result,
        error: task.error,
        duration: task.getDuration()
      };
    }
    return {
      name: this.name,
      state: this.state,
      total: this.tasks.size,
      completed: this.completedTasks.size,
      failed: this.failedTasks.size,
      tasks: taskStatus
    };
  }

  reset() {
    for (const task of this.tasks.values()) {
      task.state = TaskState.PENDING;
      task.result = null;
      task.error = null;
      task.startTime = null;
      task.endTime = null;
      task.attempts = 0;
    }
    this.completedTasks.clear();
    this.failedTasks.clear();
    this.results.clear();
    this.state = TaskState.PENDING;
  }
}

/**
 * Agent Sequential Manager
 */
class AgentSequentialManager {
  constructor() {
    this.pipelines = new Map();
    this.stats = {
      totalPipelines: 0,
      completedPipelines: 0,
      failedPipelines: 0,
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0
    };
    this.state = loadJSON(SEQUENTIAL_DB, {});
  }

  createPipeline(name, options = {}) {
    const pipeline = new SequentialPipeline(name, options);
    this.pipelines.set(name, pipeline);
    this.stats.totalPipelines++;
    return pipeline;
  }

  getPipeline(name) {
    return this.pipelines.get(name);
  }

  async executePipeline(name, options = {}) {
    const pipeline = this.createPipeline(name, options);
    try {
      const result = await pipeline.execute();
      this.stats.completedPipelines++;
      this.stats.completedTasks += result.completed;
      this.stats.failedTasks += result.failed;
      return result;
    } catch (error) {
      this.stats.failedPipelines++;
      throw error;
    }
  }

  getStats() {
    return {
      ...this.stats,
      activePipelines: this.pipelines.size
    };
  }

  save() {
    saveJSON(SEQUENTIAL_DB, { stats: this.stats });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Sequential Demo\n');

  const manager = new AgentSequentialManager();

  // Create pipeline with dependencies
  console.log('1. Creating Sequential Pipeline:');
  const pipeline = manager.createPipeline('workflow', { stopOnError: false });

  // Add tasks with dependencies
  pipeline.addTask('init', async () => {
    console.log('   [init] Starting workflow...');
    await new Promise(r => setTimeout(r, 20));
    return { status: 'initialized' };
  });

  pipeline.addTask('fetch', async () => {
    console.log('   [fetch] Fetching data...');
    await new Promise(r => setTimeout(r, 20));
    return { data: [1, 2, 3, 4, 5] };
  }, { dependencies: ['init'] });

  pipeline.addTask('process', async (ctx) => {
    console.log('   [process] Processing data...');
    const fetchResult = pipeline.results.get('fetch');
    await new Promise(r => setTimeout(r, 20));
    return { processed: fetchResult.data.map(x => x * 2) };
  });

  pipeline.addTask('save', async () => {
    console.log('   [save] Saving results...');
    const processResult = pipeline.results.get('process');
    await new Promise(r => setTimeout(r, 20));
    return { saved: processResult ? processResult.processed.length : 0 };
  });

  pipeline.addTask('notify', async () => {
    console.log('   [notify] Sending notification...');
    await new Promise(r => setTimeout(r, 20));
    return { notified: true };
  });

  // Set dependencies properly
  pipeline.addDependency('fetch', 'init');
  pipeline.addDependency('process', 'fetch');
  pipeline.addDependency('save', 'process');
  pipeline.addDependency('notify', 'save');

  console.log('   Pipeline created with 5 tasks');

  // Execute pipeline
  console.log('\n2. Executing Pipeline:');
  const result = await pipeline.execute();
  console.log(`   Completed: ${result.completed}, Failed: ${result.failed}`);

  // Show results
  console.log('\n3. Task Results:');
  const status = pipeline.getStatus();
  for (const [id, taskState] of Object.entries(status.tasks)) {
    console.log(`   ${id}: ${taskState.state} (${taskState.duration}ms)`);
  }

  // Parallel pipeline demo
  console.log('\n4. Parallel Pipeline:');
  const parallelPipeline = manager.createPipeline('parallel', { parallel: 2 });

  parallelPipeline.addTask('task1', async () => {
    await new Promise(r => setTimeout(r, 30));
    return 'task1-result';
  });

  parallelPipeline.addTask('task2', async () => {
    await new Promise(r => setTimeout(r, 20));
    return 'task2-result';
  });

  parallelPipeline.addTask('task3', async () => {
    await new Promise(r => setTimeout(r, 25));
    return 'task3-result';
  });

  const pResult = await parallelPipeline.execute();
  console.log(`   Completed: ${pResult.completed}, Failed: ${pResult.failed}`);

  // Stats
  console.log('\n5. Statistics:');
  const stats = manager.getStats();
  console.log(`   Total Pipelines: ${stats.totalPipelines}`);
  console.log(`   Completed: ${stats.completedPipelines}`);
  console.log(`   Failed: ${stats.failedPipelines}`);
  console.log(`   Total Tasks: ${stats.totalTasks}`);
  console.log(`   Completed Tasks: ${stats.completedTasks}`);
  console.log(`   Failed Tasks: ${stats.failedTasks}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'execute') {
  const manager = new AgentSequentialManager();
  const pipeline = manager.createPipeline('default');
  pipeline.addTask('task1', async () => 'done');
  pipeline.execute().then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const manager = new AgentSequentialManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Sequential Module');
  console.log('Usage: node agent-sequential.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  execute <task> Execute sequential task');
  console.log('  status           Show sequential status');
}
