/**
 * Agent Migration Module
 *
 * Provides agent state migration tools for version upgrades.
 * Usage: node agent-migration.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   plan <from> <to>       Create migration plan
 *   status                  Show migration status
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const MIGRATION_DB = path.join(DATA_DIR, 'migrations.json');

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
 * Migration Step
 */
class MigrationStep {
  constructor(id, name, description, transformFn) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.transformFn = transformFn;
    this.status = 'pending'; // pending, running, completed, failed, rolled_back
    this.error = null;
    this.startTime = null;
    this.endTime = null;
  }

  async execute(state) {
    this.status = 'running';
    this.startTime = Date.now();

    try {
      const result = await this.transformFn(state);
      this.status = 'completed';
      this.endTime = Date.now();
      return { success: true, result };
    } catch (error) {
      this.status = 'failed';
      this.error = error.message;
      this.endTime = Date.now();
      return { success: false, error: error.message };
    }
  }

  async rollback(state) {
    this.status = 'rolled_back';
    return { success: true };
  }

  getDuration() {
    if (this.startTime && this.endTime) {
      return this.endTime - this.startTime;
    }
    return 0;
  }
}

/**
 * Migration Plan
 */
class MigrationPlan {
  constructor(fromVersion, toVersion) {
    this.id = `migration-${fromVersion}-to-${toVersion}`;
    this.fromVersion = fromVersion;
    this.toVersion = toVersion;
    this.steps = [];
    this.status = 'draft'; // draft, planned, running, completed, failed, rolled_back
    this.createdAt = Date.now();
  }

  addStep(step) {
    this.steps.push(step);
  }

  getStep(stepId) {
    return this.steps.find(s => s.id === stepId);
  }

  async execute(state) {
    this.status = 'running';

    for (const step of this.steps) {
      const result = await step.execute(state);
      if (!result.success) {
        this.status = 'failed';
        return { success: false, step: step.id, error: result.error };
      }
      // Apply transformation to state
      if (result.result) {
        Object.assign(state, result.result);
      }
    }

    this.status = 'completed';
    return { success: true, state };
  }

  async rollback(state) {
    this.status = 'rolled_back';

    // Rollback in reverse order
    for (let i = this.steps.length - 1; i >= 0; i--) {
      await this.steps[i].rollback(state);
    }

    return { success: true };
  }

  getSummary() {
    const pending = this.steps.filter(s => s.status === 'pending').length;
    const completed = this.steps.filter(s => s.status === 'completed').length;
    const failed = this.steps.filter(s => s.status === 'failed').length;

    return {
      total: this.steps.length,
      pending,
      completed,
      failed,
      status: this.status
    };
  }
}

/**
 * State Transformer
 */
class StateTransformer {
  // Transform from v1 to v2
  static v1Tov2(state) {
    const newState = { ...state, version: 'v2' };

    // Rename fields
    if (newState.agentId) {
      newState.id = newState.agentId;
      delete newState.agentId;
    }

    // Add new fields with defaults
    if (!newState.metadata) {
      newState.metadata = {
        createdAt: Date.now(),
        migratedAt: Date.now()
      };
    }

    return newState;
  }

  // Transform from v2 to v3
  static v2Tov3(state) {
    const newState = { ...state, version: 'v3' };

    // Flatten nested config
    if (newState.config && newState.config.settings) {
      newState.settings = { ...newState.config.settings };
      delete newState.config.settings;
    }

    // Add new fields
    if (!newState.tags) {
      newState.tags = [];
    }

    // Convert status to new format
    if (newState.status === 'active') {
      newState.state = 'running';
    }

    return newState;
  }

  // Transform from v3 to v4
  static v3Tov4(state) {
    const newState = { ...state, version: 'v4' };

    // Add capabilities array
    if (!newState.capabilities) {
      newState.capabilities = [];
    }

    // Convert metrics to new format
    if (newState.metrics) {
      newState.performance = { ...newState.metrics };
      delete newState.metrics;
    }

    return newState;
  }

  // Transform from v4 to v5 (current)
  static v4Tov5(state) {
    const newState = { ...state, version: 'v5' };

    // Add runtime info
    if (!newState.runtime) {
      newState.runtime = {
        memory: '512MB',
        timeout: 30000
      };
    }

    // Add health check config
    if (!newState.health) {
      newState.health = {
        enabled: true,
        interval: 60000
      };
    }

    return newState;
  }
}

/**
 * Migration Registry
 */
class MigrationRegistry {
  constructor() {
    this.migrations = new Map();
    this.registerMigrations();
  }

  registerMigrations() {
    // v1 -> v2
    this.migrations.set('v1->v2', {
      from: 'v1',
      to: 'v2',
      steps: [
        new MigrationStep('rename-id', 'Rename agentId to id', 'Rename agentId field to id', StateTransformer.v1Tov2),
        new MigrationStep('add-metadata', 'Add metadata', 'Add metadata with timestamps', (s) => s)
      ]
    });

    // v2 -> v3
    this.migrations.set('v2->v3', {
      from: 'v2',
      to: 'v3',
      steps: [
        new MigrationStep('flatten-config', 'Flatten config', 'Flatten nested config.settings', StateTransformer.v2Tov3),
        new MigrationStep('add-tags', 'Add tags', 'Add tags array', (s) => s),
        new MigrationStep('update-status', 'Update status', 'Convert status to state', (s) => s)
      ]
    });

    // v3 -> v4
    this.migrations.set('v3->v4', {
      from: 'v3',
      to: 'v4',
      steps: [
        new MigrationStep('add-capabilities', 'Add capabilities', 'Add capabilities array', StateTransformer.v3Tov4),
        new MigrationStep('convert-metrics', 'Convert metrics', 'Rename metrics to performance', (s) => s)
      ]
    });

    // v4 -> v5
    this.migrations.set('v4->v5', {
      from: 'v4',
      to: 'v5',
      steps: [
        new MigrationStep('add-runtime', 'Add runtime info', 'Add runtime configuration', StateTransformer.v4Tov5),
        new MigrationStep('add-health', 'Add health config', 'Add health check configuration', (s) => s)
      ]
    });
  }

  getMigrationPath(fromVersion, toVersion) {
    const versions = ['v1', 'v2', 'v3', 'v4', 'v5'];
    const fromIdx = versions.indexOf(fromVersion);
    const toIdx = versions.indexOf(toVersion);

    if (fromIdx === -1 || toIdx === -1) {
      return null;
    }

    if (fromIdx >= toIdx) {
      return null; // Can't migrate backwards
    }

    const path = [];
    for (let i = fromIdx; i < toIdx; i++) {
      const key = `${versions[i]}->${versions[i + 1]}`;
      if (this.migrations.has(key)) {
        path.push(this.migrations.get(key));
      }
    }

    return path;
  }

  getAvailableVersions() {
    return ['v1', 'v2', 'v3', 'v4', 'v5'];
  }
}

/**
 * Migration Executor
 */
class MigrationExecutor {
  constructor() {
    this.registry = new MigrationRegistry();
    this.history = [];
    this.state = loadJSON(MIGRATION_DB, { history: [] });
    this.history = this.state.history || [];
  }

  createPlan(fromVersion, toVersion) {
    const path = this.registry.getMigrationPath(fromVersion, toVersion);

    if (!path) {
      return { error: 'Invalid migration path' };
    }

    const plan = new MigrationPlan(fromVersion, toVersion);

    for (const migration of path) {
      for (const step of migration.steps) {
        plan.addStep(new MigrationStep(
          step.id,
          step.name,
          step.description,
          step.transformFn
        ));
      }
    }

    return { success: true, plan };
  }

  async executeMigration(plan, state) {
    const startTime = Date.now();

    const result = await plan.execute(state);

    const record = {
      id: plan.id,
      fromVersion: plan.fromVersion,
      toVersion: plan.toVersion,
      status: plan.status,
      startTime,
      endTime: Date.now(),
      steps: plan.steps.map(s => ({
        id: s.id,
        status: s.status,
        duration: s.getDuration()
      }))
    };

    this.history.unshift(record);
    if (this.history.length > 50) {
      this.history = this.history.slice(0, 50);
    }

    this.save();
    return result;
  }

  async rollbackMigration(plan, state) {
    const result = await plan.rollback(state);
    this.save();
    return result;
  }

  getHistory(limit = 10) {
    return this.history.slice(0, limit);
  }

  getMigrationStatus() {
    return {
      availableVersions: this.registry.getAvailableVersions(),
      migrationsCount: this.registry.migrations.size,
      historyCount: this.history.length
    };
  }

  save() {
    this.state = { history: this.history };
    saveJSON(MIGRATION_DB, this.state);
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Migration Demo ===\n');

  const executor = new MigrationExecutor();

  // Show available versions
  console.log('1. Available Versions:');
  const versions = executor.registry.getAvailableVersions();
  console.log(`   ${versions.join(' -> ')}`);

  // Create sample old state
  console.log('\n2. Original State (v1):');
  const oldState = {
    version: 'v1',
    agentId: 'agent-001',
    status: 'active',
    config: {
      timeout: 5000
    }
  };
  console.log(`   ${JSON.stringify(oldState)}`);

  // Create migration plan
  console.log('\n3. Creating Migration Plan:');
  const planResult = executor.createPlan('v1', 'v5');
  const plan = planResult.plan;
  console.log(`   Plan: ${plan.id}`);
  console.log(`   Steps: ${plan.steps.length}`);

  plan.steps.forEach((step, i) => {
    console.log(`   ${i + 1}. ${step.name} (${step.description})`);
  });

  // Execute migration
  console.log('\n4. Executing Migration:');
  const state = { ...oldState };
  const result = await executor.executeMigration(plan, state);

  if (result.success) {
    console.log('   Migration completed successfully');
    console.log(`   Final version: ${state.version}`);
    console.log(`   State: ${JSON.stringify(state)}`);
  } else {
    console.log(`   Migration failed: ${result.error}`);
  }

  // Show step results
  console.log('\n5. Step Results:');
  plan.steps.forEach(step => {
    console.log(`   ${step.id}: ${step.status} (${step.getDuration()}ms)`);
  });

  // Migration history
  console.log('\n6. Migration History:');
  const history = executor.getHistory(3);
  history.forEach(record => {
    console.log(`   ${record.id}: ${record.status}`);
  });

  // Show migration status
  console.log('\n7. System Status:');
  const status = executor.getMigrationStatus();
  console.log(`   Available versions: ${status.availableVersions.join(', ')}`);
  console.log(`   Migrations: ${status.migrationsCount}`);
  console.log(`   History records: ${status.historyCount}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'plan') {
  const executor = new MigrationExecutor();
  const result = executor.createPlan(args[1], args[2]);
  if (result.plan) {
    console.log(`Plan: ${result.plan.id}`);
    console.log(`Steps: ${result.plan.steps.length}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
} else if (cmd === 'status') {
  const executor = new MigrationExecutor();
  console.log(JSON.stringify(executor.getMigrationStatus(), null, 2));
} else {
  console.log('Agent Migration Module');
  console.log('Usage: node agent-migration.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  plan <from> <to>  Create migration plan');
  console.log('  status            Show migration status');
}
