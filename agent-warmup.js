/**
 * Agent Warmup - Agent预热服务
 * Agent启动预热与资源准备系统
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ========== Data Models ==========

class WarmupTask {
  constructor(data) {
    this.id = data.id || `warmup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.agentId = data.agentId;
    this.taskType = data.taskType; // 'load-model', 'init-cache', 'prepare-data', 'warm-connection'
    this.priority = data.priority ?? 5; // 1-10, higher is more important
    this.status = data.status || 'pending'; // pending, running, completed, failed, skipped
    this.progress = data.progress || 0; // 0-100
    this.createdAt = data.createdAt || Date.now();
    this.startedAt = data.startedAt || null;
    this.completedAt = data.completedAt || null;
    this.duration = data.duration || null;
    this.error = data.error || null;
    this.result = data.result || null;
    this.retries = data.retries || 0;
    this.maxRetries = data.maxRetries || 3;
  }

  toJSON() {
    return {
      id: this.id,
      agentId: this.agentId,
      taskType: this.taskType,
      priority: this.priority,
      status: this.status,
      progress: this.progress,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      duration: this.duration,
      error: this.error,
      result: this.result,
      retries: this.retries,
      maxRetries: this.maxRetries
    };
  }
}

class WarmupProfile {
  constructor(data) {
    this.id = data.id || `profile_${Date.now()}`;
    this.name = data.name;
    this.description = data.description || '';
    this.tasks = data.tasks || []; // Array of warmup task configurations
    this.parallel = data.parallel ?? true; // Run tasks in parallel
    this.timeout = data.timeout || 300000; // Max time for entire warmup
    this.retryPolicy = data.retryPolicy || {
      maxRetries: 3,
      backoff: 'exponential',
      initialDelay: 1000
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      tasks: this.tasks,
      parallel: this.parallel,
      timeout: this.timeout,
      retryPolicy: this.retryPolicy
    };
  }
}

// ========== Main Warmup Engine ==========

class AgentWarmup extends EventEmitter {
  constructor(options = {}) {
    super();
    this.storageDir = options.storageDir || './agent-warmup-data';
    this.name = options.name || 'default';
    this.maxConcurrent = options.maxConcurrent || 5;

    this.profiles = new Map();
    this.warmupQueue = []; // Priority queue
    this.running = new Map(); // taskId -> WarmupTask
    this.completed = new Map(); // taskId -> WarmupTask
    this.activeWarmups = new Map(); // agentId -> { profile, tasks, status }

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this._loadState();
  }

  _loadState() {
    const stateFile = path.join(this.storageDir, `${this.name}-warmup.json`);
    if (fs.existsSync(stateFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

        // Load profiles
        for (const profileData of data.profiles || []) {
          this.profiles.set(profileData.id, new WarmupProfile(profileData));
        }
      } catch (e) {
        console.error('Failed to load warmup state:', e);
      }
    }
  }

  _saveState() {
    const stateFile = path.join(this.storageDir, `${this.name}-warmup.json`);
    const data = {
      profiles: Array.from(this.profiles.values()).map(p => p.toJSON())
    };
    fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
  }

  // ========== Profile Management ==========

  createProfile(profileData) {
    const profile = new WarmupProfile(profileData);
    this.profiles.set(profile.id, profile);
    this._saveState();
    this.emit('profile-created', profile);
    return profile;
  }

  getProfile(profileId) {
    return this.profiles.get(profileId) || null;
  }

  listProfiles() {
    return Array.from(this.profiles.values());
  }

  deleteProfile(profileId) {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }
    this.profiles.delete(profileId);
    this._saveState();
    return profile;
  }

  // ========== Built-in Profiles ==========

  createPreset(type, customTasks = []) {
    const presets = {
      default: {
        name: 'Default Warmup',
        description: 'Standard warmup for all agents',
        tasks: [
          { taskType: 'warm-connection', priority: 10, timeout: 5000 },
          { taskType: 'init-cache', priority: 8, timeout: 10000 },
          { taskType: 'prepare-data', priority: 5, timeout: 30000 }
        ]
      },
      ml_model: {
        name: 'ML Model Warmup',
        description: 'Warmup for ML agents',
        tasks: [
          { taskType: 'warm-connection', priority: 10, timeout: 5000 },
          { taskType: 'load-model', priority: 9, timeout: 120000 },
          { taskType: 'init-cache', priority: 7, timeout: 10000 },
          { taskType: 'prepare-data', priority: 5, timeout: 60000 }
        ]
      },
      fast_start: {
        name: 'Fast Start',
        description: 'Quick warmup for fast startup',
        tasks: [
          { taskType: 'warm-connection', priority: 10, timeout: 3000 }
        ]
      },
      full: {
        name: 'Full Warmup',
        description: 'Complete warmup with all optimizations',
        tasks: [
          { taskType: 'warm-connection', priority: 10, timeout: 5000 },
          { taskType: 'load-model', priority: 9, timeout: 120000 },
          { taskType: 'init-cache', priority: 8, timeout: 15000 },
          { taskType: 'prepare-data', priority: 7, timeout: 60000 },
          { taskType: 'warm-connection', priority: 5, timeout: 5000 } // Connection pool
        ]
      },
      minimal: {
        name: 'Minimal Warmup',
        description: 'Minimal warmup for resource-constrained environments',
        tasks: [
          { taskType: 'warm-connection', priority: 10, timeout: 2000 }
        ]
      }
    };

    const preset = presets[type];
    if (!preset) {
      throw new Error(`Unknown preset: ${type}`);
    }

    // Merge custom tasks
    if (customTasks.length > 0) {
      preset.tasks = customTasks;
    }

    return this.createProfile(preset);
  }

  // ========== Warmup Execution ==========

  warmupAgent(agentId, profileId) {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    // Check if already warming up
    if (this.activeWarmups.has(agentId)) {
      throw new Error(`Agent ${agentId} is already warming up`);
    }

    // Create warmup tasks from profile
    const tasks = profile.tasks.map(taskConfig => {
      return new WarmupTask({
        agentId,
        taskType: taskConfig.taskType,
        priority: taskConfig.priority,
        maxRetries: profile.retryPolicy.maxRetries
      });
    });

    const warmup = {
      profile,
      tasks,
      status: 'running',
      startedAt: Date.now(),
      completedTasks: 0,
      failedTasks: 0
    };

    this.activeWarmups.set(agentId, warmup);

    // Add tasks to queue
    for (const task of tasks) {
      this.warmupQueue.push(task);
    }

    // Sort by priority
    this.warmupQueue.sort((a, b) => b.priority - a.priority);

    // Start processing
    this._processQueue();

    this.emit('warmup-started', agentId, profile, tasks);

    return { agentId, profile, tasks };
  }

  _processQueue() {
    while (
      this.warmupQueue.length > 0 &&
      this.running.size < this.maxConcurrent
    ) {
      const task = this.warmupQueue.shift();
      this._executeTask(task);
    }
  }

  async _executeTask(task) {
    task.status = 'running';
    task.startedAt = Date.now();
    this.running.set(task.id, task);

    this.emit('task-started', task);

    try {
      // Simulate warmup task execution
      const result = await this._runWarmupTask(task);

      task.status = 'completed';
      task.progress = 100;
      task.completedAt = Date.now();
      task.duration = task.completedAt - task.startedAt;
      task.result = result;

      this.running.delete(task.id);
      this.completed.set(task.id, task);

      // Update warmup progress
      this._updateWarmupProgress(task.agentId, true);

      this.emit('task-completed', task);

    } catch (error) {
      task.status = 'failed';
      task.error = error.message;
      task.completedAt = Date.now();
      task.duration = task.completedAt - task.startedAt;

      // Retry logic
      if (task.retries < task.maxRetries) {
        task.retries++;
        task.status = 'pending';
        task.startedAt = null;
        this.warmupQueue.push(task);
        this.warmupQueue.sort((a, b) => b.priority - a.priority);
      }

      this.running.delete(task.id);
      this.completed.set(task.id, task);

      // Update warmup progress
      this._updateWarmupProgress(task.agentId, false);

      this.emit('task-failed', task, error);
    }

    // Continue processing
    this._processQueue();

    // Check if warmup is complete
    this._checkWarmupComplete(task.agentId);
  }

  async _runWarmupTask(task) {
    // Simulate task execution based on type
    const delays = {
      'warm-connection': 100,
      'load-model': 500,
      'init-cache': 300,
      'prepare-data': 200
    };

    const delay = delays[task.taskType] || 200;

    return new Promise((resolve, reject) => {
      setTimeout(() => {
        // Simulate occasional failures for load-model
        if (task.taskType === 'load-model' && Math.random() < 0.1) {
          reject(new Error('Model loading failed'));
        } else {
          resolve({ success: true, taskType: task.taskType });
        }
      }, delay);
    });
  }

  _updateWarmupProgress(agentId, success) {
    const warmup = this.activeWarmups.get(agentId);
    if (!warmup) return;

    if (success) {
      warmup.completedTasks++;
    } else {
      warmup.failedTasks++;
    }

    const totalTasks = warmup.tasks.length;
    const progress = Math.round(
      ((warmup.completedTasks + warmup.failedTasks) / totalTasks) * 100
    );

    warmup.progress = progress;
    this.emit('warmup-progress', agentId, progress);
  }

  _checkWarmupComplete(agentId) {
    const warmup = this.activeWarmups.get(agentId);
    if (!warmup) return;

    const totalTasks = warmup.tasks.length;
    const processed = warmup.completedTasks + warmup.failedTasks;

    if (processed >= totalTasks) {
      warmup.status = warmup.failedTasks > 0 ? 'completed-with-errors' : 'completed';
      warmup.completedAt = Date.now();

      this.emit('warmup-completed', agentId, warmup);
    }
  }

  // ========== Query ==========

  getWarmupStatus(agentId) {
    const warmup = this.activeWarmups.get(agentId);
    if (!warmup) return null;

    return {
      agentId,
      profile: warmup.profile.name,
      status: warmup.status,
      progress: warmup.progress,
      completedTasks: warmup.completedTasks,
      failedTasks: warmup.failedTasks,
      totalTasks: warmup.tasks.length,
      startedAt: warmup.startedAt
    };
  }

  getTask(taskId) {
    if (this.running.has(taskId)) {
      return this.running.get(taskId);
    }
    if (this.completed.has(taskId)) {
      return this.completed.get(taskId);
    }
    return null;
  }

  listRunningTasks() {
    return Array.from(this.running.values());
  }

  listCompletedTasks(limit = 50) {
    const tasks = Array.from(this.completed.values());
    return tasks.slice(-limit).reverse();
  }

  // ========== Control ==========

  cancelWarmup(agentId) {
    const warmup = this.activeWarmups.get(agentId);
    if (!warmup) {
      throw new Error(`No warmup in progress for agent: ${agentId}`);
    }

    // Cancel running tasks
    for (const task of this.running.values()) {
      if (task.agentId === agentId) {
        task.status = 'cancelled';
        task.completedAt = Date.now();
        this.running.delete(task.id);
        this.completed.set(task.id, task);
      }
    }

    // Remove from queue
    this.warmupQueue = this.warmupQueue.filter(t => t.agentId !== agentId);

    warmup.status = 'cancelled';
    warmup.completedAt = Date.now();

    this.emit('warmup-cancelled', agentId);

    return warmup;
  }

  // ========== Statistics ==========

  getStats() {
    return {
      queueLength: this.warmupQueue.length,
      runningTasks: this.running.size,
      completedTasks: this.completed.size,
      activeWarmups: this.activeWarmups.size,
      profiles: this.profiles.size
    };
  }

  // ========== Export ==========

  exportWarmupConfig() {
    return {
      profiles: this.listProfiles().map(p => p.toJSON()),
      stats: this.getStats()
    };
  }
}

// ========== Multi-Warmup Manager ==========

class WarmupManager {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './agent-warmup-data';
    this.warmups = new Map();
    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  getOrCreate(name, options = {}) {
    if (!this.warmups.has(name)) {
      this.warmups.set(name, new AgentWarmup({
        name,
        storageDir: this.storageDir,
        ...options
      }));
    }
    return this.warmups.get(name);
  }

  listWarmups() {
    return Array.from(this.warmups.keys());
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new WarmupManager();
  const warmup = manager.getOrCreate(args[1] || 'default');

  switch (command) {
    case 'profile':
      const profile = warmup.createPreset(args[2] || 'default');
      console.log(`Created profile: ${profile.id}`);
      break;

    case 'list-profiles':
      console.log('Warmup Profiles:');
      for (const p of warmup.listProfiles()) {
        console.log(`  ${p.name}: ${p.tasks.length} tasks`);
      }
      break;

    case 'warmup':
      const result = warmup.warmupAgent(args[1] || 'agent-1', args[2] || 'default');
      console.log(`Started warmup for ${result.agentId}`);
      break;

    case 'status':
      const status = warmup.getWarmupStatus(args[1] || 'agent-1');
      if (status) {
        console.log(JSON.stringify(status, null, 2));
      } else {
        console.log('No warmup in progress');
      }
      break;

    case 'cancel':
      warmup.cancelWarmup(args[1] || 'agent-1');
      console.log(`Cancelled warmup for ${args[1] || 'agent-1'}`);
      break;

    case 'stats':
      console.log('Warmup Statistics:');
      console.log(JSON.stringify(warmup.getStats(), null, 2));
      break;

    case 'demo':
      console.log('=== Agent Warmup Demo ===\n');

      // Create presets
      warmup.createPreset('default');
      warmup.createPreset('ml_model');
      warmup.createPreset('fast_start');

      console.log('--- Profiles Created ---');
      for (const p of warmup.listProfiles()) {
        console.log(`  ${p.name}: ${p.tasks.length} tasks`);
      }

      console.log('\n--- Starting Warmup (ml_model) ---');
      const w = warmup.warmupAgent('agent-1', warmup.listProfiles()[1].id);

      // Wait and show status
      setTimeout(() => {
        console.log('\n--- Warmup Status ---');
        console.log(JSON.stringify(warmup.getWarmupStatus('agent-1'), null, 2));

        console.log('\n--- Running Tasks ---');
        for (const t of warmup.listRunningTasks()) {
          console.log(`  [${t.status}] ${t.taskType}: ${t.progress}%`);
        }

        console.log('\n--- Statistics ---');
        console.log(JSON.stringify(warmup.getStats(), null, 2));

        console.log('\n=== Demo Complete ===');
        process.exit(0);
      }, 2000);
      break;

    default:
      console.log('Usage:');
      console.log('  node agent-warmup.js profile [preset]');
      console.log('  node agent-warmup.js list-profiles');
      console.log('  node agent-warmup.js warmup <agentId> [profileId]');
      console.log('  node agent-warmup.js status <agentId>');
      console.log('  node agent-warmup.js cancel <agentId>');
      console.log('  node agent-warmup.js stats');
      console.log('  node agent-warmup.js demo');
      console.log('\nPresets: default, ml_model, fast_start, full, minimal');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  AgentWarmup,
  WarmupManager,
  WarmupTask,
  WarmupProfile
};
