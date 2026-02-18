/**
 * Saga Orchestrator - Saga编排器
 * 分布式Saga模式编排
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ========== Saga Types ==========

const SagaStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  COMPENSATING: 'compensating',
  COMPENSATED: 'compensated'
};

const StepStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  COMPENSATED: 'compensated',
  SKIPPED: 'skipped'
};

// ========== Saga Step ==========

class SagaStep {
  constructor(name, action, compensation = null, options = {}) {
    this.name = name;
    this.action = action;
    this.compensation = compensation;
    this.options = options;
    this.status = StepStatus.PENDING;
    this.result = null;
    this.error = null;
    this.startedAt = null;
    this.completedAt = null;
  }

  async execute(context) {
    this.status = StepStatus.RUNNING;
    this.startedAt = new Date().toISOString();

    try {
      const result = await this.action(context);
      this.status = StepStatus.COMPLETED;
      this.result = result;
      this.completedAt = new Date().toISOString();
      return result;
    } catch (err) {
      this.status = StepStatus.FAILED;
      this.error = err.message;
      this.completedAt = new Date().toISOString();
      throw err;
    }
  }

  async compensate(context) {
    if (!this.compensation) {
      this.status = StepStatus.SKIPPED;
      return null;
    }

    try {
      await this.compensation(context, this.result);
      this.status = StepStatus.COMPENSATED;
      this.completedAt = new Date().toISOString();
      return true;
    } catch (err) {
      this.status = StepStatus.FAILED;
      this.error = err.message;
      throw err;
    }
  }

  toJSON() {
    return {
      name: this.name,
      status: this.status,
      result: this.result,
      error: this.error,
      startedAt: this.startedAt,
      completedAt: this.completedAt
    };
  }
}

// ========== Saga ==========

class Saga {
  constructor(id, name, steps = []) {
    this.id = id;
    this.name = name;
    this.steps = steps;
    this.status = SagaStatus.PENDING;
    this.context = {};
    this.createdAt = new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.error = null;
    this.currentStepIndex = -1;
  }

  addStep(step) {
    this.steps.push(step);
    return this;
  }

  step(name, action, compensation = null, options = {}) {
    this.steps.push(new SagaStep(name, action, compensation, options));
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      context: this.context,
      steps: this.steps.map(s => s.toJSON()),
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      error: this.error
    };
  }
}

// ========== Saga Orchestrator ==========

class SagaOrchestrator {
  constructor(options = {}) {
    this.name = options.name || 'saga-orchestrator';
    this.sagasDir = options.sagasDir || './sagas';
    this.sagas = new Map();
    this.compensationStrategies = options.compensationStrategies || {};
    this.listeners = new Map();
    this.concurrentSagas = new Map();

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.sagasDir)) {
      fs.mkdirSync(this.sagasDir, { recursive: true });
    }
    this._loadSagas();
  }

  // ========== Saga Definition ==========

  defineSaga(name, configureFn) {
    const saga = new Saga(crypto.randomUUID(), name);

    configureFn(saga);

    this.sagas.set(name, saga);
    return saga;
  }

  // ========== Saga Execution ==========

  async execute(sagaName, initialContext = {}) {
    const sagaTemplate = this.sagas.get(sagaName);
    if (!sagaTemplate) {
      throw new Error(`Saga not found: ${sagaName}`);
    }

    // Create a new saga instance
    const saga = new Saga(crypto.randomUUID(), sagaName, sagaTemplate.steps.map(step =>
      new SagaStep(step.name, step.action, step.compensation, step.options)
    ));

    saga.context = { ...initialContext };
    saga.status = SagaStatus.RUNNING;
    saga.startedAt = new Date().toISOString();

    this._emit('saga:started', saga);
    this.concurrentSagas.set(saga.id, saga);

    try {
      // Execute each step
      for (let i = 0; i < saga.steps.length; i++) {
        saga.currentStepIndex = i;
        const step = saga.steps[i];

        this._emit('step:started', { saga, step });

        try {
          await step.execute(saga.context);
          saga.context.lastResult = step.result;

          this._emit('step:completed', { saga, step });
        } catch (err) {
          // Step failed, start compensation
          this._emit('step:failed', { saga, step, error: err.message });

          await this._compensate(saga, i);
          throw err;
        }
      }

      saga.status = SagaStatus.COMPLETED;
      saga.completedAt = new Date().toISOString();
      this._emit('saga:completed', saga);

    } catch (err) {
      saga.status = SagaStatus.FAILED;
      saga.error = err.message;
      saga.completedAt = new Date().toISOString();
      this._emit('saga:failed', saga);
    } finally {
      this.concurrentSagas.delete(saga.id);
      this._saveSaga(saga);
    }

    return saga;
  }

  async _compensate(saga, failedAtIndex) {
    saga.status = SagaStatus.COMPENSATING;
    this._emit('saga:compensating', saga);

    // Compensate in reverse order
    for (let i = failedAtIndex - 1; i >= 0; i--) {
      const step = saga.steps[i];

      if (step.status === StepStatus.COMPLETED) {
        this._emit('step:compensating', { saga, step });

        try {
          await step.compensate(saga.context);
          this._emit('step:compensated', { saga, step });
        } catch (err) {
          this._emit('step:compensation:failed', { saga, step, error: err.message });
          // Continue compensating other steps
        }
      }
    }

    saga.status = SagaStatus.COMPENSATED;
    this._emit('saga:compensated', saga);
  }

  // ========== Saga Management ==========

  getSaga(id) {
    return this.concurrentSagas.get(id);
  }

  async abortSaga(sagaId) {
    const saga = this.concurrentSagas.get(sagaId);
    if (!saga) {
      throw new Error(`Saga not running: ${sagaId}`);
    }

    if (saga.currentStepIndex >= 0) {
      await this._compensate(saga, saga.currentStepIndex + 1);
    }

    saga.status = SagaStatus.FAILED;
    saga.error = 'Aborted by user';
    saga.completedAt = new Date().toISOString();

    this.concurrentSagas.delete(sagaId);
    this._emit('saga:aborted', saga);

    return saga;
  }

  listSagas(filters = {}) {
    let sagas = Array.from(this.concurrentSagas.values());

    if (filters.status) {
      sagas = sagas.filter(s => s.status === filters.status);
    }

    return sagas;
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

  _loadSagas() {
    const historyFile = path.join(this.sagasDir, '_history.json');
    if (fs.existsSync(historyFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        // Load completed sagas if needed
      } catch (err) {
        console.error('Failed to load sagas:', err);
      }
    }
  }

  _saveSaga(saga) {
    const historyFile = path.join(this.sagasDir, '_history.json');
    const data = {
      version: '1.0',
      updatedAt: new Date().toISOString(),
      sagas: {}
    };

    // Load existing
    if (fs.existsSync(historyFile)) {
      try {
        const existing = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        Object.assign(data.sagas, existing.sagas || {});
      } catch (err) {}
    }

    data.sagas[saga.id] = saga.toJSON();

    fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
  }

  // ========== Statistics ==========

  getStats() {
    const sagas = Array.from(this.concurrentSagas.values());

    return {
      running: sagas.filter(s => s.status === SagaStatus.RUNNING).length,
      completed: sagas.filter(s => s.status === SagaStatus.COMPLETED).length,
      failed: sagas.filter(s => s.status === SagaStatus.FAILED).length,
      compensating: sagas.filter(s => s.status === SagaStatus.COMPENSATING).length
    };
  }
}

// ========== Saga Builder ==========

class SagaBuilder {
  constructor(name) {
    this.name = name;
    this.steps = [];
  }

  step(name, action, compensation = null, options = {}) {
    this.steps.push(new SagaStep(name, action, compensation, options));
    return this;
  }

  build() {
    return new Saga(crypto.randomUUID(), this.name, this.steps);
  }
}

// ========== Export ==========

module.exports = {
  SagaOrchestrator,
  Saga,
  SagaStep,
  SagaBuilder,
  SagaStatus,
  StepStatus
};
