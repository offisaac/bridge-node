/**
 * Agent Sandbox Module
 *
 * Provides sandbox execution environment services.
 * Usage: node agent-sandbox.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show sandbox stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Sandbox Status
 */
const SandboxStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  CANCELLED: 'cancelled'
};

/**
 * Sandbox Environment
 */
class SandboxEnvironment {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type || 'javascript'; // javascript, python, etc.
    this.timeout = config.timeout || 30000; // 30 seconds
    this.memoryLimit = config.memoryLimit || 128; // MB
    this.networkAccess = config.networkAccess !== false;
    this.fileSystemAccess = config.fileSystemAccess !== false;
    this.environment = config.environment || {};
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      timeout: this.timeout,
      memoryLimit: this.memoryLimit,
      networkAccess: this.networkAccess,
      fileSystemAccess: this.fileSystemAccess,
      environment: this.environment
    };
  }
}

/**
 * Sandbox Execution
 */
class SandboxExecution {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.environment = config.environment;
    this.code = config.code;
    this.status = SandboxStatus.PENDING;
    this.startedAt = null;
    this.completedAt = null;
    this.output = null;
    this.error = null;
    this.duration = null;
    this.memoryUsage = 0;
    this.metrics = {};
  }

  start() {
    this.status = SandboxStatus.RUNNING;
    this.startedAt = Date.now();
  }

  complete(output) {
    this.status = SandboxStatus.COMPLETED;
    this.completedAt = Date.now();
    this.output = output;
    this.duration = this.completedAt - this.startedAt;
  }

  fail(error) {
    this.status = SandboxStatus.FAILED;
    this.completedAt = Date.now();
    this.error = error;
    this.duration = this.completedAt - this.startedAt;
  }

  timeout() {
    this.status = SandboxStatus.TIMEOUT;
    this.completedAt = Date.now();
    this.error = 'Execution timeout';
    this.duration = this.timeout;
  }

  toJSON() {
    return {
      id: this.id,
      environmentId: this.environment.id,
      status: this.status,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      duration: this.duration,
      output: this.output,
      error: this.error,
      memoryUsage: this.memoryUsage,
      metrics: this.metrics
    };
  }
}

/**
 * Sandbox Manager
 */
class SandboxManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.environments = new Map();
    this.executions = new Map();
    this.stats = {
      executionsStarted: 0,
      executionsCompleted: 0,
      executionsFailed: 0,
      executionsTimedOut: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  createEnvironment(config) {
    const env = new SandboxEnvironment(config);
    this.environments.set(env.id, env);
    return env;
  }

  getEnvironment(envId) {
    return this.environments.get(envId);
  }

  execute(envId, code) {
    const environment = this.environments.get(envId);
    if (!environment) {
      return { error: 'Environment not found' };
    }

    const execution = new SandboxExecution({ environment, code });
    this.executions.set(execution.id, execution);
    this.stats.executionsStarted++;

    // Simulate execution
    execution.start();

    // Simulate code execution
    try {
      const result = this._simulateExecution(code, environment);
      execution.complete(result);
      this.stats.executionsCompleted++;
    } catch (error) {
      execution.fail(error.message);
      this.stats.executionsFailed++;
    }

    return execution;
  }

  _simulateExecution(code, environment) {
    // Simple simulation - in real implementation would use VM or container
    const startTime = Date.now();

    // Simulate some processing
    let output = '';
    if (code.includes('console.log')) {
      const matches = code.match(/console\.log\(['"`](.+?)['"`]\)/g);
      if (matches) {
        output = matches.map(m => {
          const match = m.match(/console\.log\(['"`](.+?)['"`]\)/);
          return match ? match[1] : '';
        }).join('\n');
      }
    }

    if (code.includes('return')) {
      const match = code.match(/return\s+(.+?);/);
      if (match) {
        output = match[1];
      }
    }

    // Simulate execution time
    const simulatedTime = Math.random() * 100;
    while (Date.now() - startTime < simulatedTime) {
      // Busy wait
    }

    return output || 'Execution completed';
  }

  getExecution(executionId) {
    return this.executions.get(executionId);
  }

  listExecutions(envId = null) {
    const results = [];
    for (const execution of this.executions.values()) {
      if (!envId || execution.environment.id === envId) {
        results.push(execution);
      }
    }
    return results;
  }

  cancelExecution(executionId) {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === SandboxStatus.RUNNING) {
      execution.status = SandboxStatus.CANCELLED;
      execution.completedAt = Date.now();
      execution.error = 'Cancelled by user';
      return true;
    }
    return false;
  }

  getStats() {
    return {
      ...this.stats,
      environmentsCount: this.environments.size,
      activeExecutions: this.listExecutions().filter(e => e.status === SandboxStatus.RUNNING).length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Sandbox Demo\n');

  const manager = new SandboxManager();

  // Create environments
  console.log('1. Creating Sandbox Environments:');

  const env1 = manager.createEnvironment({
    name: 'JavaScript Runner',
    type: 'javascript',
    timeout: 5000,
    memoryLimit: 64
  });
  console.log(`   Created: ${env1.name} (${env1.type})`);

  const env2 = manager.createEnvironment({
    name: 'Python Runner',
    type: 'python',
    timeout: 10000,
    memoryLimit: 128
  });
  console.log(`   Created: ${env2.name} (${env2.type})`);

  // Execute code
  console.log('\n2. Executing Code:');

  const exec1 = manager.execute(env1.id, 'console.log("Hello from sandbox!");');
  console.log(`   Execution 1: ${exec1.status}`);
  console.log(`   Output: ${exec1.output}`);

  // Execute with return
  console.log('\n3. Executing with Return:');
  const exec2 = manager.execute(env1.id, 'const x = 5; const y = 10; return x + y;');
  console.log(`   Execution 2: ${exec2.status}`);
  console.log(`   Output: ${exec2.output}`);
  console.log(`   Duration: ${exec2.duration}ms`);

  // Execute with error
  console.log('\n4. Executing with Error:');
  const exec3 = manager.execute(env1.id, 'throw new Error("Test error");');
  console.log(`   Execution 3: ${exec3.status}`);
  console.log(`   Error: ${exec3.error}`);

  // List executions
  console.log('\n5. Listing Executions:');
  const executions = manager.listExecutions();
  console.log(`   Total executions: ${executions.length}`);

  // Stats
  console.log('\n6. Statistics:');
  const stats = manager.getStats();
  console.log(`   Executions Started: ${stats.executionsStarted}`);
  console.log(`   Executions Completed: ${stats.executionsCompleted}`);
  console.log(`   Executions Failed: ${stats.executionsFailed}`);
  console.log(`   Environments: ${stats.environmentsCount}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new SandboxManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Sandbox Module');
  console.log('Usage: node agent-sandbox.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
