/**
 * Agent Recovery Module
 *
 * Provides agent error recovery with strategies, fallback, and state restoration.
 * Usage: node agent-recovery.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   recover <agent>        Recover an agent
 *   status                  Show recovery status
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const RECOVERY_DB = path.join(DATA_DIR, 'recovery-state.json');

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
 * Error Category
 */
const ErrorCategory = {
  TRANSIENT: 'transient',       // Temporary errors (network timeout)
  RESOURCE: 'resource',         // Resource exhaustion (memory, disk)
  CONFIGURATION: 'configuration', // Misconfiguration
  AUTHENTICATION: 'authentication', // Auth failures
  PERMISSION: 'permission',     // Access denied
  EXTERNAL: 'external',         // Third-party service errors
  INTERNAL: 'internal',         // Code bugs
  UNKNOWN: 'unknown'
};

/**
 * Recovery Strategy
 */
const RecoveryStrategy = {
  RETRY: 'retry',
  RETRY_WITH_BACKOFF: 'retry_with_backoff',
  FALLBACK: 'fallback',
  CIRCUIT_BREAKER: 'circuit_breaker',
  STATE_RESTORE: 'state_restore',
  ESCALATE: 'escalate',
  SKIP: 'skip',
  ABORT: 'abort'
};

/**
 * Recovery Action
 */
class RecoveryAction {
  constructor(strategy, config = {}) {
    this.strategy = strategy;
    this.config = {
      maxRetries: config.maxRetries || 3,
      initialDelay: config.initialDelay || 1000,
      maxDelay: config.maxDelay || 30000,
      backoffMultiplier: config.backoffMultiplier || 2,
      fallbackValue: config.fallbackValue || null,
      ...config
    };
    this.executed = false;
    this.result = null;
    this.error = null;
  }

  async execute(context) {
    this.executed = true;

    switch (this.strategy) {
      case RecoveryStrategy.RETRY:
        return this.retry(context);
      case RecoveryStrategy.RETRY_WITH_BACKOFF:
        return this.retryWithBackoff(context);
      case RecoveryStrategy.FALLBACK:
        return this.fallback(context);
      case RecoveryStrategy.CIRCUIT_BREAKER:
        return this.circuitBreaker(context);
      case RecoveryStrategy.STATE_RESTORE:
        return this.stateRestore(context);
      case RecoveryStrategy.ESCALATE:
        return this.escalate(context);
      case RecoveryStrategy.SKIP:
        return { skipped: true };
      case RecoveryStrategy.ABORT:
        return { aborted: true };
      default:
        return { error: 'Unknown strategy' };
    }
  }

  async retry(context) {
    let lastError;
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await context.operation();
      } catch (error) {
        lastError = error;
        if (attempt < this.config.maxRetries) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
    }
    throw lastError;
  }

  async retryWithBackoff(context) {
    let delay = this.config.initialDelay;
    let lastError;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await context.operation();
      } catch (error) {
        lastError = error;
        if (attempt < this.config.maxRetries) {
          await new Promise(r => setTimeout(r, delay));
          delay = Math.min(delay * this.config.backoffMultiplier, this.config.maxDelay);
        }
      }
    }
    throw lastError;
  }

  fallback(context) {
    return { fallback: true, value: this.config.fallbackValue };
  }

  circuitBreaker(context) {
    // Simplified circuit breaker
    if (context.circuitBreaker && context.circuitBreaker.isOpen) {
      return { fallback: true, reason: 'Circuit breaker open' };
    }
    return context.operation();
  }

  stateRestore(context) {
    return { restored: true, state: context.savedState };
  }

  escalate(context) {
    return { escalated: true, error: context.error };
  }
}

/**
 * Error Classifier
 */
class ErrorClassifier {
  classify(error) {
    const message = error.message || String(error);
    const stack = error.stack || '';

    // Transient errors
    if (/timeout|temporary|network|connection/i.test(message)) {
      return ErrorCategory.TRANSIENT;
    }

    // Resource errors
    if (/memory|disk|space|quota|limit/i.test(message)) {
      return ErrorCategory.RESOURCE;
    }

    // Configuration errors
    if (/config|invalid.*option|missing.*param/i.test(message)) {
      return ErrorCategory.CONFIGURATION;
    }

    // Authentication errors
    if (/auth|login|password|token/i.test(message)) {
      return ErrorCategory.AUTHENTICATION;
    }

    // Permission errors
    if (/permission|access.*denied|forbidden|unauthorized/i.test(message)) {
      return ErrorCategory.PERMISSION;
    }

    // External service errors
    if (/external|service.*unavailable|3rd.*party|api.*error/i.test(message)) {
      return ErrorCategory.EXTERNAL;
    }

    // Internal errors
    if (/internal|bug|unexpected|null.*pointer/i.test(message)) {
      return ErrorCategory.INTERNAL;
    }

    return ErrorCategory.UNKNOWN;
  }

  getDefaultStrategy(category) {
    const strategies = {
      [ErrorCategory.TRANSIENT]: RecoveryStrategy.RETRY_WITH_BACKOFF,
      [ErrorCategory.RESOURCE]: RecoveryStrategy.ESCALATE,
      [ErrorCategory.CONFIGURATION]: RecoveryStrategy.ABORT,
      [ErrorCategory.AUTHENTICATION]: RecoveryStrategy.RETRY,
      [ErrorCategory.PERMISSION]: RecoveryStrategy.ESCALATE,
      [ErrorCategory.EXTERNAL]: RecoveryStrategy.FALLBACK,
      [ErrorCategory.INTERNAL]: RecoveryStrategy.ABORT,
      [ErrorCategory.UNKNOWN]: RecoveryStrategy.RETRY
    };
    return strategies[category] || RecoveryStrategy.RETRY;
  }
}

/**
 * Recovery Plan
 */
class RecoveryPlan {
  constructor(agentId) {
    this.agentId = agentId;
    this.actions = [];
    this.status = 'pending'; // pending, executing, completed, failed
    this.createdAt = Date.now();
    this.completedAt = null;
  }

  addAction(action) {
    this.actions.push(action);
  }

  async execute(context) {
    this.status = 'executing';

    for (const action of this.actions) {
      const result = await action.execute(context);
      if (result.aborted) {
        this.status = 'failed';
        break;
      }
      if (result.escalated) {
        this.status = 'failed';
        break;
      }
      if (result.fallback || result.restored || result.skipped) {
        this.status = 'completed';
        break;
      }
    }

    if (this.status !== 'failed') {
      this.status = 'completed';
    }
    this.completedAt = Date.now();

    return { status: this.status };
  }
}

/**
 * Agent Recovery Manager
 */
class AgentRecoveryManager {
  constructor() {
    this.classifier = new ErrorClassifier();
    this.recoveryPlans = new Map();
    this.circuitBreakers = new Map();
    this.savedStates = new Map();
    this.recoveryHistory = [];
    this.state = loadJSON(RECOVERY_DB, { history: [] });
    this.recoveryHistory = this.state.history || [];
  }

  // Classify error and get recovery strategy
  analyzeError(error) {
    const category = this.classifier.classify(error);
    const strategy = this.classifier.getDefaultStrategy(category);

    return { category, strategy };
  }

  // Create recovery plan for an agent
  createRecoveryPlan(agentId, error, options = {}) {
    const { category, strategy } = this.analyzeError(error);

    const plan = new RecoveryPlan(agentId);

    // Add recovery actions based on error category
    switch (category) {
      case ErrorCategory.TRANSIENT:
        plan.addAction(new RecoveryAction(RecoveryStrategy.RETRY_WITH_BACKOFF, {
          maxRetries: options.maxRetries || 3,
          initialDelay: 1000,
          maxDelay: 30000
        }));
        break;

      case ErrorCategory.RESOURCE:
        plan.addAction(new RecoveryAction(RecoveryStrategy.STATE_RESTORE));
        plan.addAction(new RecoveryAction(RecoveryStrategy.ESCALATE));
        break;

      case ErrorCategory.EXTERNAL:
        plan.addAction(new RecoveryAction(RecoveryStrategy.FALLBACK, {
          fallbackValue: options.fallbackValue || null
        }));
        break;

      default:
        plan.addAction(new RecoveryAction(strategy));
    }

    this.recoveryPlans.set(agentId, plan);
    return plan;
  }

  // Execute recovery for an agent
  async recover(agentId, operation, options = {}) {
    const context = {
      agentId,
      operation,
      circuitBreaker: this.circuitBreakers.get(agentId),
      savedState: this.savedStates.get(agentId),
      error: null
    };

    try {
      // Try the operation first
      return await operation();
    } catch (error) {
      context.error = error;

      // Create and execute recovery plan
      const plan = this.createRecoveryPlan(agentId, error, options);
      const result = await plan.execute(context);

      // Record in history
      this.recordRecovery(agentId, error, result);

      return result;
    }
  }

  // Save agent state for restoration
  saveState(agentId, state) {
    this.savedStates.set(agentId, {
      state,
      timestamp: Date.now()
    });
  }

  // Get saved state
  getSavedState(agentId) {
    return this.savedStates.get(agentId);
  }

  // Clear saved state
  clearState(agentId) {
    return this.savedStates.delete(agentId);
  }

  // Circuit breaker management
  getCircuitBreaker(agentId) {
    if (!this.circuitBreakers.has(agentId)) {
      this.circuitBreakers.set(agentId, {
        failures: 0,
        threshold: 5,
        timeout: 60000,
        isOpen: false,
        lastFailure: null
      });
    }
    return this.circuitBreakers.get(agentId);
  }

  recordFailure(agentId) {
    const cb = this.getCircuitBreaker(agentId);
    cb.failures++;
    cb.lastFailure = Date.now();

    if (cb.failures >= cb.threshold) {
      cb.isOpen = true;
      setTimeout(() => {
        cb.isOpen = false;
        cb.failures = 0;
      }, cb.timeout);
    }
  }

  recordSuccess(agentId) {
    const cb = this.circuitBreakers.get(agentId);
    if (cb) {
      cb.failures = 0;
      cb.isOpen = false;
    }
  }

  // Record recovery in history
  recordRecovery(agentId, error, result) {
    this.recoveryHistory.unshift({
      agentId,
      error: error.message || String(error),
      category: this.classifier.classify(error),
      result: result.status,
      timestamp: Date.now()
    });

    if (this.recoveryHistory.length > 100) {
      this.recoveryHistory = this.recoveryHistory.slice(0, 100);
    }

    this.save();
  }

  // Get recovery history
  getHistory(limit = 10) {
    return this.recoveryHistory.slice(0, limit);
  }

  // Get recovery status
  getStatus() {
    return {
      activePlans: this.recoveryPlans.size,
      savedStates: this.savedStates.size,
      circuitBreakers: this.circuitBreakers.size,
      historyCount: this.recoveryHistory.length
    };
  }

  // Save state
  save() {
    saveJSON(RECOVERY_DB, { history: this.recoveryHistory });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Recovery Demo ===\n');

  const manager = new AgentRecoveryManager();

  // Show error classification
  console.log('1. Error Classification:');
  const testErrors = [
    new Error('Connection timeout'),
    new Error('Out of memory'),
    new Error('Invalid configuration'),
    new Error('Authentication failed'),
    new Error('Permission denied')
  ];

  testErrors.forEach(error => {
    const { category, strategy } = manager.analyzeError(error);
    console.log(`   ${error.message}: ${category} -> ${strategy}`);
  });

  // Save agent state
  console.log('\n2. Saving Agent State:');
  manager.saveState('agent-001', {
    data: { counter: 42 },
    position: { x: 10, y: 20 },
    config: { mode: 'active' }
  });
  console.log('   Saved state for agent-001');

  // Simulate recovery
  console.log('\n3. Simulating Recovery:');

  // Simulate transient error recovery
  let attempt = 0;
  const transientOperation = async () => {
    attempt++;
    if (attempt < 3) {
      throw new Error('Temporary network error');
    }
    return { success: true, data: 'result' };
  };

  const result1 = await manager.recover('agent-001', transientOperation, { maxRetries: 3 });
  console.log(`   Transient error recovery: ${result1.status}`);
  console.log(`   Attempts made: ${attempt}`);

  // Simulate fallback recovery
  console.log('\n4. Fallback Recovery:');
  const fallbackOperation = async () => {
    throw new Error('External service unavailable');
  };

  const result2 = await manager.recover('agent-002', fallbackOperation, {
    fallbackValue: { cached: true, data: 'fallback-data' }
  });
  console.log(`   Fallback result: fallback=${result2.fallback}, value=${JSON.stringify(result2.value)}`);

  // Circuit breaker
  console.log('\n5. Circuit Breaker:');
  const cb = manager.getCircuitBreaker('agent-003');
  console.log(`   Initial state: failures=${cb.failures}, open=${cb.isOpen}`);

  for (let i = 0; i < 3; i++) {
    manager.recordFailure('agent-003');
  }
  console.log(`   After 3 failures: failures=${cb.failures}, open=${cb.isOpen}`);

  manager.recordSuccess('agent-003');
  console.log(`   After success: failures=${cb.failures}, open=${cb.isOpen}`);

  // State restoration
  console.log('\n6. State Restoration:');
  const savedState = manager.getSavedState('agent-001');
  console.log(`   Restored state: ${JSON.stringify(savedState.state)}`);

  // Recovery history
  console.log('\n7. Recovery History:');
  const history = manager.getHistory(5);
  history.forEach(record => {
    console.log(`   ${record.agentId}: ${record.category} -> ${record.result}`);
  });

  // Status
  console.log('\n8. System Status:');
  const status = manager.getStatus();
  console.log(`   Active plans: ${status.activePlans}`);
  console.log(`   Saved states: ${status.savedStates}`);
  console.log(`   Circuit breakers: ${status.circuitBreakers}`);
  console.log(`   History records: ${status.historyCount}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'recover') {
  const manager = new AgentRecoveryManager();
  manager.recover(args[1], async () => ({ result: 'ok' })).then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const manager = new AgentRecoveryManager();
  console.log(JSON.stringify(manager.getStatus(), null, 2));
} else {
  console.log('Agent Recovery Module');
  console.log('Usage: node agent-recovery.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  recover <agent>  Recover an agent');
  console.log('  status            Show recovery status');
}
