/**
 * Chaos Engineering - 混沌工程
 * 韧性测试和故障注入
 */

const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

// ========== Chaos Types ==========

const ChaosType = {
  LATENCY: 'latency',             // 延迟注入
  ERROR: 'error',                 // 错误注入
  TIMEOUT: 'timeout',             // 超时注入
  PACKET_LOSS: 'packet_loss',    // 丢包
  CPU_LOAD: 'cpu_load',           // CPU负载
  MEMORY_LOAD: 'memory_load',     // 内存负载
  DISK_IO: 'disk_io',            // 磁盘IO
  NETWORK_PARTITION: 'network_partition', // 网络分区
  KILL_PROCESS: 'kill_process',  // 杀死进程
  CONTAINER_KILL: 'container_kill' // 容器杀死
};

const ExperimentStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const ExperimentPhase = {
  PREPARATION: 'preparation',
  PRE_VERIFICATION: 'pre_verification',
  INJECTION: 'injection',
  POST_VERIFICATION: 'post_verification',
  ROLLBACK: 'rollback'
};

// ========== Chaos Experiment ==========

class ChaosExperiment {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name;
    this.description = config.description || '';
    this.type = config.type;
    this.target = config.target; // target service/container/process
    this.parameters = config.parameters || {};
    this.duration = config.duration || 60000; // ms
    this.status = ExperimentStatus.PENDING;
    this.createdAt = config.createdAt || new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.results = null;
    this.error = null;
    this.logs = [];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      target: this.target,
      parameters: this.parameters,
      duration: this.duration,
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      results: this.results,
      error: this.error,
      logs: this.logs
    };
  }
}

// ========== Fault Injector ==========

class FaultInjector {
  constructor(type, params = {}) {
    this.type = type;
    this.params = params;
    this.logs = [];
  }

  async inject() {
    switch (this.type) {
      case ChaosType.LATENCY:
        return this._injectLatency();
      case ChaosType.ERROR:
        return this._injectError();
      case ChaosType.TIMEOUT:
        return this._injectTimeout();
      case ChaosType.PACKET_LOSS:
        return this._injectPacketLoss();
      case ChaosType.CPU_LOAD:
        return this._injectCpuLoad();
      case ChaosType.MEMORY_LOAD:
        return this._injectMemoryLoad();
      case ChaosType.NETWORK_PARTITION:
        return this._injectNetworkPartition();
      default:
        throw new Error(`Unknown chaos type: ${this.type}`);
    }
  }

  async _injectLatency() {
    const { delay = 1000, jitter = 0 } = this.params;
    this.logs.push(`Injecting latency: ${delay}ms (±${jitter}ms)`);
    // In production, would use tc (traffic control) or similar
    return { type: ChaosType.LATENCY, delay, jitter, injected: true };
  }

  async _injectError() {
    const { errorCode = 500, errorMessage = 'Internal Server Error' } = this.params;
    this.logs.push(`Injecting error: ${errorCode} - ${errorMessage}`);
    return { type: ChaosType.ERROR, errorCode, errorMessage, injected: true };
  }

  async _injectTimeout() {
    const { timeout = 30000 } = this.params;
    this.logs.push(`Injecting timeout: ${timeout}ms`);
    return { type: ChaosType.TIMEOUT, timeout, injected: true };
  }

  async _injectPacketLoss() {
    const { percentage = 10, iface = 'eth0' } = this.params;
    this.logs.push(`Injecting packet loss: ${percentage}% on ${iface}`);
    return { type: ChaosType.PACKET_LOSS, percentage, iface, injected: true };
  }

  async _injectCpuLoad() {
    const { percentage = 80, duration = 60000 } = this.params;
    this.logs.push(`Injecting CPU load: ${percentage}% for ${duration}ms`);
    return { type: ChaosType.CPU_LOAD, percentage, duration, injected: true };
  }

  async _injectMemoryLoad() {
    const { percentage = 80, duration = 60000 } = this.params;
    this.logs.push(`Injecting memory load: ${percentage}% for ${duration}ms`);
    return { type: ChaosType.MEMORY_LOAD, percentage, duration, injected: true };
  }

  async _injectNetworkPartition() {
    const { target, isolation = true } = this.params;
    this.logs.push(`Network partition: ${target} isolated=${isolation}`);
    return { type: ChaosType.NETWORK_PARTITION, target, isolation, injected: true };
  }

  async rollback() {
    this.logs.push(`Rolling back ${this.type} injection`);
    return { type: this.type, rolledBack: true };
  }
}

// ========== Chaos Engine ==========

class ChaosEngine {
  constructor(options = {}) {
    this.name = options.name || 'chaos-engine';
    this.experimentsDir = options.experimentsDir || './chaos-experiments';
    this.autoCleanup = options.autoCleanup ?? true;
    this.verifyBefore = options.verifyBefore ?? true;
    this.verifyAfter = options.verifyAfter ?? true;

    this.experiments = new Map();
    this.activeExperiments = new Map();
    this.listeners = new Map();

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.experimentsDir)) {
      fs.mkdirSync(this.experimentsDir, { recursive: true });
    }
    this._loadHistory();
  }

  // ========== Experiment Management ==========

  async createExperiment(config) {
    const id = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const experiment = new ChaosExperiment(id, config);
    this.experiments.set(id, experiment);
    this._saveHistory();

    this._emit('experiment:created', experiment);
    return experiment;
  }

  async runExperiment(experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    if (this.activeExperiments.has(experiment.type)) {
      throw new Error(`Experiment of type ${experiment.type} is already running`);
    }

    experiment.status = ExperimentStatus.RUNNING;
    experiment.startedAt = new Date().toISOString();
    this.activeExperiments.set(experiment.type, experiment);

    this._emit('experiment:started', experiment);

    try {
      // Phase 1: Pre-verification
      if (this.verifyBefore) {
        experiment.logs.push('Phase: PRE_VERIFICATION');
        const preCheck = await this._verifySystem(experiment);
        experiment.logs.push(`Pre-verification: ${preCheck ? 'PASSED' : 'FAILED'}`);
        if (!preCheck) {
          throw new Error('Pre-verification failed');
        }
      }

      // Phase 2: Injection
      experiment.logs.push('Phase: INJECTION');
      const injector = new FaultInjector(experiment.type, experiment.parameters);
      const injectionResult = await injector.inject();
      experiment.results = injectionResult;

      // Wait for duration
      if (experiment.duration > 0) {
        experiment.logs.push(`Running for ${experiment.duration}ms...`);
        await new Promise(r => setTimeout(r, experiment.duration));
      }

      // Phase 3: Post-verification
      if (this.verifyAfter) {
        experiment.logs.push('Phase: POST_VERIFICATION');
        const postCheck = await this._verifySystem(experiment);
        experiment.logs.push(`Post-verification: ${postCheck ? 'PASSED' : 'FAILED'}`);
        experiment.results.verificationPassed = postCheck;
      }

      // Phase 4: Rollback
      experiment.logs.push('Phase: ROLLBACK');
      await injector.rollback();
      experiment.logs.push('Rollback complete');

      // Determine experiment result
      const success = experiment.results.verificationPassed !== false;
      experiment.status = success ? ExperimentStatus.SUCCESS : ExperimentStatus.FAILED;
      experiment.completedAt = new Date().toISOString();

      this._emit('experiment:completed', experiment);
    } catch (err) {
      experiment.status = ExperimentStatus.FAILED;
      experiment.error = err.message;
      experiment.completedAt = new Date().toISOString();
      experiment.logs.push(`ERROR: ${err.message}`);

      this._emit('experiment:failed', experiment);
    } finally {
      this.activeExperiments.delete(experiment.type);
    }

    this._saveHistory();
    return experiment;
  }

  async abortExperiment(experimentId) {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) {
      throw new Error(`Experiment not found: ${experimentId}`);
    }

    if (experiment.status !== ExperimentStatus.RUNNING) {
      throw new Error('Experiment is not running');
    }

    // Rollback any injections
    const injector = new FaultInjector(experiment.type, experiment.parameters);
    await injector.rollback();

    experiment.status = ExperimentStatus.CANCELLED;
    experiment.completedAt = new Date().toISOString();
    this.activeExperiments.delete(experiment.type);

    this._emit('experiment:cancelled', experiment);
    this._saveHistory();

    return experiment;
  }

  // ========== Verification ==========

  async _verifySystem(experiment) {
    // Simulate system verification
    // In production, would check:
    // - Service health endpoints
    // - Metrics
    // - Log patterns
    // - Error rates
    experiment.logs.push('Verifying system health...');

    // Simulate verification
    await new Promise(r => setTimeout(r, 100));

    return true; // Always pass in simulation
  }

  // ========== Query Operations ==========

  getExperiment(id) {
    return this.experiments.get(id);
  }

  listExperiments(filters = {}) {
    let experiments = Array.from(this.experiments.values());

    if (filters.status) {
      experiments = experiments.filter(e => e.status === filters.status);
    }

    if (filters.type) {
      experiments = experiments.filter(e => e.type === filters.type);
    }

    return experiments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getActiveExperiments() {
    return Array.from(this.activeExperiments.values());
  }

  // ========== Predefined Experiments ==========

  async runLatencyExperiment(target, delay = 1000, duration = 60000) {
    return this.runExperiment((await this.createExperiment({
      name: `Latency test on ${target}`,
      description: `Inject ${delay}ms latency`,
      type: ChaosType.LATENCY,
      target,
      parameters: { delay, jitter: 100 },
      duration
    })).id);
  }

  async runErrorExperiment(target, errorCode = 500, duration = 30000) {
    return this.runExperiment((await this.createExperiment({
      name: `Error injection on ${target}`,
      description: `Inject ${errorCode} errors`,
      type: ChaosType.ERROR,
      target,
      parameters: { errorCode, errorMessage: 'Chaos test error' },
      duration
    })).id);
  }

  async runNetworkLossExperiment(target, percentage = 10, duration = 30000) {
    return this.runExperiment((await this.createExperiment({
      name: `Packet loss on ${target}`,
      description: `Inject ${percentage}% packet loss`,
      type: ChaosType.PACKET_LOSS,
      target,
      parameters: { percentage },
      duration
    })).id);
  }

  async runCpuStressExperiment(target, percentage = 80, duration = 60000) {
    return this.runExperiment((await this.createExperiment({
      name: `CPU stress on ${target}`,
      description: `Stress CPU to ${percentage}%`,
      type: ChaosType.CPU_LOAD,
      target,
      parameters: { percentage },
      duration
    })).id);
  }

  // ========== Event System ==========

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) callbacks.splice(index, 1);
  }

  _emit(event, data) {
    if (!this.listeners.has(event)) return;
    for (const callback of this.listeners.get(event)) {
      try { callback(data); } catch (err) { console.error(err); }
    }
  }

  // ========== Persistence =========-

  _loadHistory() {
    const historyFile = path.join(this.experimentsDir, '_experiments.json');
    if (fs.existsSync(historyFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        for (const [id, exp] of Object.entries(data.experiments || {})) {
          this.experiments.set(id, new ChaosExperiment(id, exp));
        }
      } catch (err) {
        console.error('Failed to load experiments:', err);
      }
    }
  }

  _saveHistory() {
    const historyFile = path.join(this.experimentsDir, '_experiments.json');
    const data = {
      version: '1.0',
      updatedAt: new Date().toISOString(),
      experiments: Object.fromEntries(
        Array.from(this.experiments.entries()).map(([id, exp]) => [id, exp.toJSON()])
      )
    };
    fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
  }

  // ========== Statistics ==========

  getStats() {
    const experiments = Array.from(this.experiments.values());
    return {
      total: experiments.length,
      success: experiments.filter(e => e.status === ExperimentStatus.SUCCESS).length,
      failed: experiments.filter(e => e.status === ExperimentStatus.FAILED).length,
      running: this.activeExperiments.size,
      pending: experiments.filter(e => e.status === ExperimentStatus.PENDING).length
    };
  }
}

// ========== Export ==========

module.exports = {
  ChaosEngine,
  ChaosExperiment,
  FaultInjector,
  ChaosType,
  ExperimentStatus,
  ExperimentPhase
};
