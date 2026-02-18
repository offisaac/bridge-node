/**
 * Agent Scheduler - Agent定时任务调度器
 * 基于Cron表达式的定时任务管理系统
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ========== Cron Parser ==========

class CronParser {
  static parse(expression) {
    const parts = expression.trim().split(/\s+/);
    if (parts.length < 5 || parts.length > 6) {
      throw new Error(`Invalid cron expression: ${expression}`);
    }

    return {
      minute: this.parseField(parts[0], 0, 59),
      hour: this.parseField(parts[1], 0, 23),
      dayOfMonth: this.parseField(parts[2], 1, 31),
      month: this.parseField(parts[3], 1, 12),
      dayOfWeek: this.parseField(parts[4], 0, 6),
      year: parts[5] ? this.parseField(parts[5], 1970, 2099) : null
    };
  }

  static parseField(field, min, max) {
    if (field === '*') {
      return { type: 'any', min, max };
    }

    const values = new Set();
    const ranges = [];
    const steps = [];

    const parts = field.split(',');
    for (const part of parts) {
      if (part.includes('/')) {
        const [range, step] = part.split('/');
        steps.push({ range: range === '*' ? { min, max } : this.parseRange(range, min, max), step: parseInt(step) });
      } else if (part.includes('-')) {
        ranges.push(this.parseRange(part, min, max));
      } else if (part === '*') {
        return { type: 'any', min, max };
      } else {
        const num = parseInt(part);
        if (isNaN(num) || num < min || num > max) {
          throw new Error(`Invalid cron field value: ${part}`);
        }
        values.add(num);
      }
    }

    if (values.size > 0) return { type: 'values', values: Array.from(values), min, max };
    if (ranges.length > 0) return { type: 'ranges', ranges, min, max };
    if (steps.length > 0) return { type: 'steps', steps, min, max };

    return { type: 'any', min, max };
  }

  static parseRange(range, min, max) {
    const [start, end] = range.split('-').map(n => parseInt(n));
    return { start: Math.max(min, start), end: Math.min(max, end) };
  }

  static matches(cron, date) {
    const minute = date.getMinutes();
    const hour = date.getHours();
    const dayOfMonth = date.getDate();
    const month = date.getMonth() + 1;
    const dayOfWeek = date.getDay();
    const year = date.getFullYear();

    if (!this.matchField(cron.minute, minute)) return false;
    if (!this.matchField(cron.hour, hour)) return false;
    if (!this.matchField(cron.dayOfMonth, dayOfMonth)) return false;
    if (!this.matchField(cron.month, month)) return false;
    if (!this.matchField(cron.dayOfWeek, dayOfWeek)) return false;
    if (cron.year && !this.matchField(cron.year, year)) return false;

    return true;
  }

  static matchField(field, value) {
    if (field.type === 'any') {
      return value >= field.min && value <= field.max;
    }
    if (field.type === 'values') {
      return field.values.includes(value);
    }
    if (field.type === 'ranges') {
      return field.ranges.some(r => value >= r.start && value <= r.end);
    }
    if (field.type === 'steps') {
      for (const step of field.steps) {
        if (value >= step.range.start && value <= step.range.end) {
          if ((value - step.range.start) % step.step === 0) return true;
        }
      }
      return false;
    }
    return false;
  }

  static getNextRun(expression, fromDate = new Date()) {
    const cron = this.parse(expression);
    const date = new Date(fromDate);
    date.setSeconds(0);
    date.setMilliseconds(0);

    // Search for next 100 years
    for (let i = 0; i < 365 * 100; i++) {
      date.setMinutes(date.getMinutes() + 1);

      if (this.matches(cron, date)) {
        return date;
      }
    }

    return null;
  }

  static getNextN(expression, n, fromDate = new Date()) {
    const results = [];
    let date = fromDate;

    for (let i = 0; i < n; i++) {
      const next = this.getNextRun(expression, date);
      if (!next) break;
      results.push(next);
      date = next;
    }

    return results;
  }
}

// ========== Data Models ==========

class ScheduledTask {
  constructor(data) {
    this.id = data.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.name = data.name;
    this.agentId = data.agentId;
    this.cron = data.cron;
    this.command = data.command || {};
    this.payload = data.payload || {};
    this.metadata = data.metadata || {};
    this.enabled = data.enabled ?? true;
    this.timezone = data.timezone || 'UTC';
    this.createdAt = data.createdAt || Date.now();
    this.lastRun = data.lastRun || null;
    this.nextRun = data.nextRun || null;
    this.runCount = data.runCount || 0;
    this.failCount = data.failCount || 0;
    this.maxRetries = data.maxRetries || 3;
    this.timeout = data.timeout || 300000;
    this.options = {
      immediate: data.options?.immediate ?? false,
      runOnStartup: data.options?.runOnStartup ?? false,
      skipIfRunning: data.options?.skipIfRunning ?? false,
      ...data.options
    };

    // Validate cron
    if (this.cron) {
      try {
        CronParser.parse(this.cron);
      } catch (e) {
        throw new Error(`Invalid cron expression: ${this.cron}`);
      }
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      agentId: this.agentId,
      cron: this.cron,
      command: this.command,
      payload: this.payload,
      metadata: this.metadata,
      enabled: this.enabled,
      timezone: this.timezone,
      createdAt: this.createdAt,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      runCount: this.runCount,
      failCount: this.failCount,
      maxRetries: this.maxRetries,
      timeout: this.timeout,
      options: this.options
    };
  }

  calculateNextRun() {
    if (!this.cron || !this.enabled) {
      this.nextRun = null;
      return null;
    }

    const nextDate = CronParser.getNextRun(this.cron, new Date());
    this.nextRun = nextDate ? nextDate.getTime() : null;
    return this.nextRun;
  }
}

class TaskRun {
  constructor(taskId, data = {}) {
    this.id = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.taskId = taskId;
    this.startedAt = data.startedAt || Date.now();
    this.completedAt = data.completedAt || null;
    this.status = data.status || 'running'; // running, success, failed, timeout, cancelled
    this.result = data.result || null;
    this.error = data.error || null;
    this.duration = data.duration || null;
  }

  toJSON() {
    return {
      id: this.id,
      taskId: this.taskId,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      status: this.status,
      result: this.result,
      error: this.error,
      duration: this.duration
    };
  }

  complete(status, result = null, error = null) {
    this.completedAt = Date.now();
    this.status = status;
    this.result = result;
    this.error = error;
    this.duration = this.completedAt - this.startedAt;
    return this;
  }
}

// ========== Main Scheduler Class ==========

class AgentScheduler extends EventEmitter {
  constructor(options = {}) {
    super();
    this.storageDir = options.storageDir || './agent-scheduler-data';
    this.name = options.name || 'default';
    this.tickInterval = options.tickInterval || 60000; // 1 minute

    this.tasks = new Map();
    this.runningTasks = new Map(); // taskId -> TaskRun
    this.history = []; // Recent runs
    this.maxHistory = options.maxHistory || 1000;

    this.isRunning = false;
    this.timer = null;

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this._loadState();
  }

  _loadState() {
    const stateFile = path.join(this.storageDir, `${this.name}-scheduler.json`);
    if (fs.existsSync(stateFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        for (const taskData of data.tasks || []) {
          const task = new ScheduledTask(taskData);
          if (task.enabled) {
            task.calculateNextRun();
          }
          this.tasks.set(task.id, task);
        }
        this.history = data.history || [];
      } catch (e) {
        console.error('Failed to load scheduler state:', e);
      }
    }
  }

  _saveState() {
    const stateFile = path.join(this.storageDir, `${this.name}-scheduler.json`);
    const data = {
      tasks: Array.from(this.tasks.values()).map(t => t.toJSON()),
      history: this.history.slice(-this.maxHistory)
    };
    fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
  }

  // ========== Task Management ==========

  createTask(taskData) {
    const task = new ScheduledTask(taskData);
    task.calculateNextRun();
    this.tasks.set(task.id, task);
    this._saveState();
    this.emit('task-created', task);
    return task;
  }

  updateTask(taskId, updates) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    Object.assign(task, updates);
    if (updates.cron) {
      task.calculateNextRun();
    }
    this._saveState();
    this.emit('task-updated', task);
    return task;
  }

  deleteTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    this.tasks.delete(taskId);
    this._saveState();
    this.emit('task-deleted', task);
    return task;
  }

  getTask(taskId) {
    return this.tasks.get(taskId) || null;
  }

  listTasks(filters = {}) {
    let result = Array.from(this.tasks.values());

    if (filters.enabled !== undefined) {
      result = result.filter(t => t.enabled === filters.enabled);
    }
    if (filters.agentId) {
      result = result.filter(t => t.agentId === filters.agentId);
    }

    return result.sort((a, b) => (a.nextRun || 0) - (b.nextRun || 0));
  }

  // ========== Scheduler Control ==========

  start() {
    if (this.isRunning) return;
    this.isRunning = true;

    // Run immediately if option set
    for (const task of this.tasks.values()) {
      if (task.options.runOnStartup && task.enabled) {
        this._executeTask(task);
      }
    }

    this.timer = setInterval(() => this._tick(), this.tickInterval);
    this.emit('started');
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.emit('stopped');
  }

  _tick() {
    const now = Date.now();

    for (const task of this.tasks.values()) {
      if (!task.enabled) continue;
      if (!task.nextRun) continue;

      // Check if task should run
      if (now >= task.nextRun) {
        // Skip if already running and option set
        if (task.options.skipIfRunning && this.runningTasks.has(task.id)) {
          continue;
        }

        this._executeTask(task);
      }
    }
  }

  async _executeTask(task) {
    const run = new TaskRun(task.id);
    this.runningTasks.set(task.id, run);

    task.lastRun = Date.now();
    task.runCount++;

    this.emit('task-start', task, run);

    try {
      // Simulate task execution (in real implementation, this would call the agent)
      const result = await this._runTask(task);

      run.complete('success', result);
      task.calculateNextRun();

      this.emit('task-complete', task, run);
    } catch (error) {
      task.failCount++;

      if (task.failCount < task.maxRetries) {
        // Retry after 1 minute
        task.nextRun = Date.now() + 60000;
        run.complete('failed', null, error.message);
      } else {
        run.complete('failed', null, error.message);
        task.calculateNextRun();
      }

      this.emit('task-failed', task, run, error);
    }

    this.runningTasks.delete(task.id);
    this.history.push(run.toJSON());
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory);
    }

    this._saveState();
  }

  async _runTask(task) {
    // In a real implementation, this would:
    // 1. Call the agent API with the task command
    // 2. Wait for response or timeout
    // 3. Return result or throw error

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Task execution timeout'));
      }, task.timeout);

      // Simulate execution
      setTimeout(() => {
        clearTimeout(timeout);
        resolve({ executed: true, taskId: task.id, agentId: task.agentId });
      }, 100);
    });
  }

  // ========== Manual Execution ==========

  async runNow(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (!task.enabled) {
      throw new Error(`Task is disabled: ${taskId}`);
    }

    this._executeTask(task);
    return task;
  }

  // ========== Query ==========

  getTaskHistory(taskId, limit = 50) {
    return this.history
      .filter(r => r.taskId === taskId)
      .slice(-limit)
      .reverse();
  }

  getUpcoming(limit = 10) {
    return this.listTasks({ enabled: true })
      .filter(t => t.nextRun)
      .slice(0, limit);
  }

  getStats() {
    const tasks = Array.from(this.tasks.values());
    const enabled = tasks.filter(t => t.enabled).length;
    const disabled = tasks.length - enabled;
    const running = this.runningTasks.size;

    const totalRuns = tasks.reduce((sum, t) => sum + t.runCount, 0);
    const totalFails = tasks.reduce((sum, t) => sum + t.failCount, 0);

    return {
      totalTasks: tasks.length,
      enabled,
      disabled,
      running,
      totalRuns,
      totalFails,
      successRate: totalRuns > 0 ? ((totalRuns - totalFails) / totalRuns * 100).toFixed(2) + '%' : 'N/A'
    };
  }

  // ========== Timezone Support ==========

  getNextRuns(taskId, count = 5) {
    const task = this.tasks.get(taskId);
    if (!task || !task.cron) return [];

    return CronParser.getNextN(task.cron, count, new Date());
  }

  // ========== Export ==========

  exportSchedule() {
    const schedule = {
      tasks: [],
      upcoming: []
    };

    for (const task of this.listTasks()) {
      schedule.tasks.push(task.toJSON());
    }

    for (const task of this.getUpcoming(20)) {
      schedule.upcoming.push({
        taskId: task.id,
        taskName: task.name,
        nextRun: new Date(task.nextRun).toISOString()
      });
    }

    return schedule;
  }
}

// ========== Multi-Scheduler Manager ==========

class SchedulerManager {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './agent-scheduler-data';
    this.schedulers = new Map();
    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  getOrCreate(name, options = {}) {
    if (!this.schedulers.has(name)) {
      this.schedulers.set(name, new AgentScheduler({
        name,
        storageDir: this.storageDir,
        ...options
      }));
    }
    return this.schedulers.get(name);
  }

  listSchedulers() {
    return Array.from(this.schedulers.keys());
  }

  getStats() {
    const stats = {};
    for (const [name, scheduler] of this.schedulers) {
      stats[name] = scheduler.getStats();
    }
    return stats;
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new SchedulerManager();
  const scheduler = manager.getOrCreate(args[1] || 'default');

  switch (command) {
    case 'create':
      const task = scheduler.createTask({
        name: args[1] || 'Demo Task',
        agentId: args[2] || 'agent-1',
        cron: args[3] || '*/5 * * * *', // Every 5 minutes
        command: { action: 'demo' },
        payload: { message: 'Hello from scheduler' }
      });
      console.log(`Created task: ${task.id}`);
      break;

    case 'list':
      console.log('Scheduled Tasks:');
      console.log('================');
      for (const t of scheduler.listTasks()) {
        const nextRun = t.nextRun ? new Date(t.nextRun).toLocaleString() : 'N/A';
        const lastRun = t.lastRun ? new Date(t.lastRun).toLocaleString() : 'Never';
        console.log(`[${t.enabled ? 'ENABLED' : 'DISABLED'}] ${t.name}`);
        console.log(`  Cron: ${t.cron}`);
        console.log(`  Next: ${nextRun}`);
        console.log(`  Last: ${lastRun}`);
        console.log(`  Agent: ${t.agentId}`);
        console.log();
      }
      break;

    case 'start':
      scheduler.start();
      console.log('Scheduler started');
      break;

    case 'stop':
      scheduler.stop();
      console.log('Scheduler stopped');
      break;

    case 'run':
      scheduler.runNow(args[1]);
      console.log(`Triggered task: ${args[1]}`);
      break;

    case 'enable':
      scheduler.updateTask(args[1], { enabled: true });
      console.log(`Enabled task: ${args[1]}`);
      break;

    case 'disable':
      scheduler.updateTask(args[1], { enabled: false });
      console.log(`Disabled task: ${args[1]}`);
      break;

    case 'delete':
      scheduler.deleteTask(args[1]);
      console.log(`Deleted task: ${args[1]}`);
      break;

    case 'next':
      const nextRuns = scheduler.getNextRuns(args[1] || scheduler.listTasks()[0]?.id, 5);
      console.log('Next 5 runs:');
      for (const dt of nextRuns) {
        console.log(`  ${dt.toLocaleString()}`);
      }
      break;

    case 'history':
      const history = scheduler.getTaskHistory(args[1], 10);
      console.log('Recent runs:');
      for (const run of history) {
        console.log(`[${run.status}] ${new Date(run.startedAt).toLocaleString()} - ${run.duration}ms`);
        if (run.error) console.log(`  Error: ${run.error}`);
      }
      break;

    case 'stats':
      console.log('Scheduler Statistics:');
      console.log(JSON.stringify(scheduler.getStats(), null, 2));
      break;

    case 'demo':
      console.log('=== Agent Scheduler Demo ===\n');

      // Create demo tasks
      scheduler.createTask({
        name: 'Health Check',
        agentId: 'agent-1',
        cron: '*/2 * * * *', // Every 2 minutes
        command: { action: 'health-check' },
        options: { runOnStartup: true }
      });

      scheduler.createTask({
        name: 'Data Backup',
        agentId: 'agent-2',
        cron: '0 2 * * *', // 2 AM daily
        command: { action: 'backup' },
        metadata: { target: 'database' }
      });

      scheduler.createTask({
        name: 'Report Generation',
        agentId: 'agent-3',
        cron: '0 9 * * 1', // 9 AM Monday
        command: { action: 'generate-report' },
        options: { skipIfRunning: true }
      });

      scheduler.createTask({
        name: 'Cleanup Temp Files',
        agentId: 'agent-1',
        cron: '0 3 * * *', // 3 AM daily
        command: { action: 'cleanup' },
        enabled: false // Disabled by default
      });

      console.log('--- Tasks Created ---');
      for (const t of scheduler.listTasks()) {
        const nextRun = t.nextRun ? new Date(t.nextRun).toLocaleString() : 'N/A';
        console.log(`[${t.enabled ? 'ON ' : 'OFF'}] ${t.name}: ${t.cron} -> ${nextRun}`);
      }

      console.log('\n--- Upcoming Runs ---');
      for (const t of scheduler.getUpcoming(5)) {
        console.log(`  ${t.name}: ${new Date(t.nextRun).toLocaleString()}`);
      }

      console.log('\n--- Statistics ---');
      console.log(JSON.stringify(scheduler.getStats(), null, 2));

      console.log('\n--- Starting Scheduler ---');
      scheduler.start();

      // Wait a bit and show stats
      setTimeout(() => {
        console.log('\n--- After Running ---');
        console.log('Stats:', JSON.stringify(scheduler.getStats(), null, 2));
        console.log('\n=== Demo Complete ===');
        process.exit(0);
      }, 2000);
      break;

    default:
      console.log('Usage:');
      console.log('  node agent-scheduler.js create <name> <agentId> <cron>');
      console.log('  node agent-scheduler.js list');
      console.log('  node agent-scheduler.js start');
      console.log('  node agent-scheduler.js stop');
      console.log('  node agent-scheduler.js run <taskId>');
      console.log('  node agent-scheduler.js enable <taskId>');
      console.log('  node agent-scheduler.js disable <taskId>');
      console.log('  node agent-scheduler.js delete <taskId>');
      console.log('  node agent-scheduler.js next <taskId>');
      console.log('  node agent-scheduler.js history <taskId>');
      console.log('  node agent-scheduler.js stats');
      console.log('  node agent-scheduler.js demo');
      console.log('\nCron examples:');
      console.log('  */5 * * * *   - Every 5 minutes');
      console.log('  0 * * * *     - Every hour');
      console.log('  0 2 * * *     - 2 AM daily');
      console.log('  0 9 * * 1-5   - 9 AM weekdays');
      console.log('  0 9 * * 1     - 9 AM Mondays');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  AgentScheduler,
  SchedulerManager,
  ScheduledTask,
  TaskRun,
  CronParser
};
