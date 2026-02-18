/**
 * Agent Chaos - Agent混沌工程测试工具
 * 故障注入与韧性测试框架
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ========== Chaos Types ==========

const ChaosType = {
  DELAY: 'delay',           // 添加延迟
  ERROR: 'error',           // 注入错误
  TIMEOUT: 'timeout',       // 超时
  DROP: 'drop',            // 丢弃请求
  BLACKHOLE: 'blackhole',  // 黑洞（无响应）
  CPU_LOAD: 'cpu_load',    // CPU 负载
  MEMORY_LEAK: 'memory_leak', // 内存泄漏
  NETWORK_PARTITION: 'network_partition', // 网络分区
  KILL_AGENT: 'kill_agent', // 杀死 Agent
  THROTTLE: 'throttle',   // 限流
  DUPLICATE: 'duplicate', // 重复请求
  CORRUPT: 'corrupt'      // 数据损坏
};

const ChaosLevel = {
  LOW: 1,
  MEDIUM: 5,
  HIGH: 10,
  CRITICAL: 20
};

// ========== Data Models ==========

class ChaosExperiment {
  constructor(data) {
    this.id = data.id || `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.name = data.name;
    this.description = data.description || '';
    this.type = data.type;
    this.level = data.level || ChaosLevel.MEDIUM;
    this.targetAgents = data.targetAgents || []; // Agent IDs or patterns
    this.targetPercentage = data.targetPercentage || 100; // % of requests to affect
    this.duration = data.duration || 60000; // ms
    this.enabled = data.enabled ?? true;
    this.schedule = data.schedule || null; // cron expression for recurring
    this.createdAt = data.createdAt || Date.now();
    this.startedAt = data.startedAt || null;
    this.completedAt = data.completedAt || null;
    this.status = data.status || 'pending'; // pending, running, completed, failed, cancelled
    this.config = data.config || {};
    this.results = data.results || null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      level: this.level,
      targetAgents: this.targetAgents,
      targetPercentage: this.targetPercentage,
      duration: this.duration,
      enabled: this.enabled,
      schedule: this.schedule,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      status: this.status,
      config: this.config,
      results: this.results
    };
  }
}

class ChaosResult {
  constructor(experimentId) {
    this.experimentId = experimentId;
    this.startedAt = Date.now();
    this.completedAt = null;
    this.requestsAffected = 0;
    this.errorsInjected = 0;
    this.failuresObserved = 0;
    this.recoveries = 0;
    this.latencies = [];
    this.errors = [];
  }

  addLatency(latency) {
    this.latencies.push(latency);
  }

  addError(error) {
    this.errors.push(error);
    this.errorsInjected++;
  }

  complete() {
    this.completedAt = Date.now();
  }

  getStats() {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const count = this.latencies.length;

    return {
      duration: this.completedAt - this.startedAt,
      requestsAffected: this.requestsAffected,
      errorsInjected: this.errorsInjected,
      failuresObserved: this.failuresObserved,
      recoveries: this.recoveries,
      latency: {
        min: sorted[0] || 0,
        max: sorted[count - 1] || 0,
        avg: count > 0 ? sorted.reduce((a, b) => a + b, 0) / count : 0,
        p50: sorted[Math.floor(count * 0.5)] || 0,
        p95: sorted[Math.floor(count * 0.95)] || 0,
        p99: sorted[Math.floor(count * 0.99)] || 0
      }
    };
  }
}

// ========== Main Chaos Engine ==========

class AgentChaos extends EventEmitter {
  constructor(options = {}) {
    super();
    this.storageDir = options.storageDir || './agent-chaos-data';
    this.name = options.name || 'default';

    this.experiments = new Map();
    this.activeExperiments = new Map(); // experimentId -> { experiment, result, timer }
    this.middleware = null;
    this.enabled = false;

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this._loadState();
  }

  _loadState() {
    const stateFile = path.join(this.storageDir, `${this.name}-chaos.json`);
    if (fs.existsSync(stateFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        for (const expData of data.experiments || []) {
          const exp = new ChaosExperiment(expData);
          this.experiments.set(exp.id, exp);
        }
      } catch (e) {
        console.error('Failed to load chaos state:', e);
      }
    }
  }

  _saveState() {
    const stateFile = path.join(this.storageDir, `${this.name}-chaos.json`);
    const data = {
      experiments: Array.from(this.experiments.values()).map(e => e.toJSON())
    };
    fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
  }

  // ========== Experiment Management ==========

  createExperiment(expData) {
    if (!expData.type || !Object.values(ChaosType).includes(expData.type)) {
      throw new Error(`Invalid chaos type: ${expData.type}`);
    }

    const experiment = new ChaosExperiment(expData);
    this.experiments.set(experiment.id, experiment);
    this._saveState();
    this.emit('experiment-created', experiment);
    return experiment;
  }

  updateExperiment(expId, updates) {
    const exp = this.experiments.get(expId);
    if (!exp) {
      throw new Error(`Experiment not found: ${expId}`);
    }

    Object.assign(exp, updates);
    this._saveState();
    this.emit('experiment-updated', exp);
    return exp;
  }

  deleteExperiment(expId) {
    const exp = this.experiments.get(expId);
    if (!exp) {
      throw new Error(`Experiment not found: ${expId}`);
    }

    // Stop if running
    if (this.activeExperiments.has(expId)) {
      this.stopExperiment(expId);
    }

    this.experiments.delete(expId);
    this._saveState();
    this.emit('experiment-deleted', exp);
    return exp;
  }

  getExperiment(expId) {
    return this.experiments.get(expId) || null;
  }

  listExperiments(filters = {}) {
    let result = Array.from(this.experiments.values());

    if (filters.status) {
      result = result.filter(e => e.status === filters.status);
    }
    if (filters.type) {
      result = result.filter(e => e.type === filters.type);
    }

    return result.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ========== Experiment Execution ==========

  startExperiment(expId) {
    const exp = this.experiments.get(expId);
    if (!exp) {
      throw new Error(`Experiment not found: ${expId}`);
    }

    if (!exp.enabled) {
      throw new Error(`Experiment is disabled: ${expId}`);
    }

    if (this.activeExperiments.has(expId)) {
      throw new Error(`Experiment already running: ${expId}`);
    }

    exp.status = 'running';
    exp.startedAt = Date.now();

    const result = new ChaosResult(expId);

    this.activeExperiments.set(expId, {
      experiment: exp,
      result,
      timer: setTimeout(() => this.completeExperiment(expId), exp.duration)
    });

    this._saveState();
    this.emit('experiment-started', exp, result);

    return { experiment: exp, result };
  }

  stopExperiment(expId) {
    const active = this.activeExperiments.get(expId);
    if (!active) {
      throw new Error(`Experiment not running: ${expId}`);
    }

    clearTimeout(active.timer);
    this.completeExperiment(expId, 'cancelled');

    return active.experiment;
  }

  completeExperiment(expId, status = 'completed') {
    const active = this.activeExperiments.get(expId);
    if (!active) return;

    const { experiment, result } = active;

    result.complete();
    experiment.status = status;
    experiment.completedAt = Date.now();
    experiment.results = result.getStats();

    this.activeExperiments.delete(expId);
    this._saveState();

    this.emit('experiment-completed', experiment, result);
  }

  // ========== Middleware (Request Interception) ==========

  createMiddleware() {
    return (req, res, next) => {
      if (!this.enabled || this.activeExperiments.size === 0) {
        return next();
      }

      // Check each active experiment
      for (const [expId, active] of this.activeExperiments) {
        const { experiment, result } = active;

        // Check if this request should be affected
        if (!this._shouldAffect(experiment, req)) {
          continue;
        }

        result.requestsAffected++;

        const startTime = Date.now();

        // Apply chaos based on type
        switch (experiment.type) {
          case ChaosType.DELAY:
            const delay = experiment.level * experiment.config.multiplier || 1000;
            setTimeout(() => {
              this._applyDelayResult(experiment, result, startTime, req, res, next);
            }, delay);
            return;

          case ChaosType.ERROR:
            this._injectError(experiment, result, req, res);
            return;

          case ChaosType.TIMEOUT:
            // Don't call next(), just timeout
            setTimeout(() => {
              if (!res.headersSent) {
                res.status(504).json({ error: 'Gateway Timeout', chaos: experiment.name });
              }
            }, experiment.level * 100);
            return;

          case ChaosType.DROP:
            // Don't call next(), just drop
            this.emit('request-dropped', experiment, req);
            return;

          case ChaosType.BLACKHOLE:
            // Keep connection open but never respond
            this.emit('request-blackholed', experiment, req);
            return;

          case ChaosType.THROTTLE:
            this._applyThrottle(experiment, result, req, res, next);
            return;

          case ChaosType.DUPLICATE:
            this._applyDuplicate(experiment, result, req, res, next);
            return;

          case ChaosType.CORRUPT:
            this._applyCorrupt(experiment, result, req, res, next);
            return;

          default:
            break;
        }
      }

      next();
    };
  }

  _shouldAffect(experiment, req) {
    // Check target agents
    if (experiment.targetAgents.length > 0) {
      const agentId = req.headers['x-agent-id'] || req.body?.agentId;
      const matches = experiment.targetAgents.some(
        target => target === agentId || new RegExp(target).test(agentId)
      );
      if (!matches) return false;
    }

    // Check percentage
    if (experiment.targetPercentage < 100) {
      const random = Math.random() * 100;
      if (random > experiment.targetPercentage) return false;
    }

    return true;
  }

  _applyDelayResult(experiment, result, startTime, req, res, next) {
    const latency = Date.now() - startTime;
    result.addLatency(latency);
    next();
  }

  _injectError(experiment, result, req, res) {
    result.addError({
      type: experiment.type,
      code: experiment.config.errorCode || 500,
      message: experiment.config.errorMessage || 'Injected chaos error'
    });

    res.status(experiment.config.errorCode || 500).json({
      error: experiment.config.errorMessage || 'Injected chaos error',
      chaos: experiment.name
    });
  }

  _applyThrottle(experiment, result, req, res, next) {
    // Simulate throttling by adding delay
    const delay = experiment.level * 50;
    setTimeout(next, delay);
  }

  _applyDuplicate(experiment, result, req, res, next) {
    // Original request
    next();

    // Duplicate request (just emit event, don't actually duplicate)
    this.emit('request-duplicated', experiment, req);
  }

  _applyCorrupt(experiment, result, req, res, next) {
    // Store original json method
    const originalJson = res.json.bind(res);

    // Override to corrupt response
    res.json = (data) => {
      // Corrupt the data
      const corrupted = this._corruptData(data);
      return originalJson(corrupted);
    };

    next();
  }

  _corruptData(data) {
    if (typeof data === 'string') {
      // Random character replacement
      const chars = data.split('');
      const idx = Math.floor(Math.random() * chars.length);
      chars[idx] = String.fromCharCode(chars[idx].charCodeAt(0) + 1);
      return chars.join('');
    }

    if (typeof data === 'object' && data !== null) {
      // Add or modify a field
      const keys = Object.keys(data);
      if (keys.length > 0) {
        const key = keys[Math.floor(Math.random() * keys.length)];
        data[`${key}_corrupted`] = 'CHAOS';
      }
    }

    return data;
  }

  // ========== Built-in Experiments ==========

  createPreset(type, config = {}) {
    const presets = {
      high_latency: {
        name: 'High Latency Test',
        description: 'Simulate high network latency',
        type: ChaosType.DELAY,
        level: ChaosLevel.HIGH,
        duration: 300000,
        config: { multiplier: 2000 }
      },
      random_errors: {
        name: 'Random Errors',
        description: 'Inject random 5xx errors',
        type: ChaosType.ERROR,
        level: ChaosLevel.MEDIUM,
        targetPercentage: 20,
        duration: 300000,
        config: { errorCode: 500, errorMessage: 'Random server error' }
      },
      timeouts: {
        name: 'Timeout Test',
        description: 'Simulate request timeouts',
        type: ChaosType.TIMEOUT,
        level: ChaosLevel.HIGH,
        duration: 180000
      },
      packet_loss: {
        name: 'Packet Loss',
        description: 'Drop random requests',
        type: ChaosType.DROP,
        level: ChaosLevel.MEDIUM,
        targetPercentage: 15,
        duration: 300000
      },
      slow_agents: {
        name: 'Slow Agents',
        description: 'Make specific agents slow',
        type: ChaosType.DELAY,
        level: ChaosLevel.HIGH,
        duration: 600000,
        config: { multiplier: 3000 }
      }
    };

    const preset = presets[type];
    if (!preset) {
      throw new Error(`Unknown preset: ${type}`);
    }

    return this.createExperiment({ ...preset, ...config });
  }

  // ========== Statistics ==========

  getActiveStats() {
    const stats = {
      active: this.activeExperiments.size,
      enabled: this.enabled,
      experiments: []
    };

    for (const [expId, active] of this.activeExperiments) {
      stats.experiments.push({
        id: expId,
        name: active.experiment.name,
        type: active.experiment.type,
        duration: active.experiment.duration,
        startedAt: active.experiment.startedAt,
        requestsAffected: active.result.requestsAffected,
        errorsInjected: active.result.errorsInjected
      });
    }

    return stats;
  }

  getStats() {
    const experiments = Array.from(this.experiments.values());
    const completed = experiments.filter(e => e.status === 'completed');
    const failed = experiments.filter(e => e.status === 'failed');
    const cancelled = experiments.filter(e => e.status === 'cancelled');

    return {
      totalExperiments: experiments.length,
      completed: completed.length,
      failed: failed.length,
      cancelled: cancelled.length,
      active: this.activeExperiments.size,
      enabled: this.enabled
    };
  }

  // ========== Enable/Disable ==========

  enable() {
    this.enabled = true;
    this.emit('enabled');
  }

  disable() {
    this.enabled = false;

    // Stop all active experiments
    for (const [expId] of this.activeExperiments) {
      this.stopExperiment(expId);
    }

    this.emit('disabled');
  }
}

// ========== Multi-Chaos Manager ==========

class ChaosManager {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './agent-chaos-data';
    this.engines = new Map();
    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  getOrCreate(name, options = {}) {
    if (!this.engines.has(name)) {
      this.engines.set(name, new AgentChaos({
        name,
        storageDir: this.storageDir,
        ...options
      }));
    }
    return this.engines.get(name);
  }

  listEngines() {
    return Array.from(this.engines.keys());
  }

  getStats() {
    const stats = {};
    for (const [name, engine] of this.engines) {
      stats[name] = engine.getStats();
    }
    return stats;
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new ChaosManager();
  const chaos = manager.getOrCreate(args[1] || 'default');

  switch (command) {
    case 'create':
      const experiment = chaos.createExperiment({
        name: args[1] || 'Test Experiment',
        type: args[2] || ChaosType.DELAY,
        level: parseInt(args[3]) || ChaosLevel.MEDIUM,
        duration: parseInt(args[4]) || 60000,
        description: args[5] || 'Chaos experiment'
      });
      console.log(`Created experiment: ${experiment.id}`);
      break;

    case 'list':
      console.log('Chaos Experiments:');
      console.log('=================');
      for (const exp of chaos.listExperiments()) {
        console.log(`[${exp.status}] ${exp.name} - ${exp.type} (level: ${exp.level})`);
        if (exp.startedAt) {
          console.log(`  Started: ${new Date(exp.startedAt).toLocaleString()}`);
        }
      }
      break;

    case 'start':
      chaos.startExperiment(args[1]);
      console.log(`Started experiment: ${args[1]}`);
      break;

    case 'stop':
      chaos.stopExperiment(args[1]);
      console.log(`Stopped experiment: ${args[1]}`);
      break;

    case 'enable':
      chaos.enable();
      console.log('Chaos engine enabled');
      break;

    case 'disable':
      chaos.disable();
      console.log('Chaos engine disabled');
      break;

    case 'stats':
      console.log('Chaos Statistics:');
      console.log(JSON.stringify(chaos.getStats(), null, 2));
      console.log('\nActive Experiments:');
      console.log(JSON.stringify(chaos.getActiveStats(), null, 2));
      break;

    case 'preset':
      const preset = chaos.createPreset(args[1]);
      console.log(`Created preset: ${preset.id}`);
      break;

    case 'demo':
      console.log('=== Agent Chaos Demo ===\n');

      // Create various experiments
      chaos.createExperiment({
        name: 'High Latency Test',
        description: 'Test system under high latency',
        type: ChaosType.DELAY,
        level: ChaosLevel.MEDIUM,
        duration: 120000,
        config: { multiplier: 500 }
      });

      chaos.createExperiment({
        name: 'Random Errors',
        description: 'Inject random errors',
        type: ChaosType.ERROR,
        level: ChaosLevel.LOW,
        targetPercentage: 10,
        duration: 180000,
        config: { errorCode: 500, errorMessage: 'Chaos-induced error' }
      });

      chaos.createExperiment({
        name: 'Timeout Test',
        description: 'Test timeout handling',
        type: ChaosType.TIMEOUT,
        level: ChaosLevel.HIGH,
        duration: 60000
      });

      console.log('--- Experiments Created ---');
      for (const exp of chaos.listExperiments()) {
        console.log(`[${exp.status}] ${exp.name}: ${exp.type} (level: ${exp.level})`);
      }

      console.log('\n--- Starting Random Errors ---');
      const exp = chaos.listExperiments().find(e => e.name === 'Random Errors');
      if (exp) {
        chaos.startExperiment(exp.id);
      }

      console.log('\n--- Active Stats ---');
      console.log(JSON.stringify(chaos.getActiveStats(), null, 2));

      console.log('\n--- Statistics ---');
      console.log(JSON.stringify(chaos.getStats(), null, 2));

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage:');
      console.log('  node agent-chaos.js create <name> <type> [level] [duration] [description]');
      console.log('  node agent-chaos.js list');
      console.log('  node agent-chaos.js start <experimentId>');
      console.log('  node agent-chaos.js stop <experimentId>');
      console.log('  node agent-chaos.js enable');
      console.log('  node agent-chaos.js disable');
      console.log('  node agent-chaos.js stats');
      console.log('  node agent-chaos.js preset <preset-name>');
      console.log('  node agent-chaos.js demo');
      console.log('\nChaos Types:');
      console.log(`  ${Object.values(ChaosType).join(', ')}`);
      console.log('\nChaos Levels:');
      console.log(`  LOW: ${ChaosLevel.LOW}, MEDIUM: ${ChaosLevel.MEDIUM}, HIGH: ${ChaosLevel.HIGH}, CRITICAL: ${ChaosLevel.CRITICAL}`);
      console.log('\nPresets:');
      console.log('  high_latency, random_errors, timeouts, packet_loss, slow_agents');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  AgentChaos,
  ChaosManager,
  ChaosExperiment,
  ChaosResult,
  ChaosType,
  ChaosLevel
};
