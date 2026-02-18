/**
 * Agent Timeout Management Module
 *
 * Provides configurable timeout management with policies and handling.
 * Usage: node agent-timeout.js [command] [options]
 *
 * Commands:
 *   run <agent-id> <timeout-ms>  Run agent with timeout
 *   policy list                    List timeout policies
 *   policy create <name> <ms>     Create a timeout policy
 *   stats                         Show timeout statistics
 *   demo                          Run demo
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const TIMEOUT_DB = path.join(DATA_DIR, 'timeouts.json');
const POLICIES_DB = path.join(DATA_DIR, 'timeout-policies.json');
const STATS_DB = path.join(DATA_DIR, 'timeout-stats.json');

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
 * Timeout Policy Manager
 */
class TimeoutPolicyManager {
  constructor() {
    this.policies = loadJSON(POLICIES_DB, {
      default: {
        name: 'default',
        timeoutMs: 30000,
        retryEnabled: true,
        maxRetries: 3,
        fallbackEnabled: true,
        alertEnabled: true
      },
      fast: {
        name: 'fast',
        timeoutMs: 5000,
        retryEnabled: false,
        maxRetries: 0,
        fallbackEnabled: false,
        alertEnabled: false
      },
      slow: {
        name: 'slow',
        timeoutMs: 120000,
        retryEnabled: true,
        maxRetries: 5,
        fallbackEnabled: true,
        alertEnabled: true
      }
    });
  }

  list() {
    return Object.values(this.policies);
  }

  get(name) {
    return this.policies[name] || this.policies.default;
  }

  create(name, timeoutMs, options = {}) {
    this.policies[name] = {
      name,
      timeoutMs: parseInt(timeoutMs, 10),
      retryEnabled: options.retryEnabled ?? true,
      maxRetries: options.maxRetries ?? 3,
      fallbackEnabled: options.fallbackEnabled ?? true,
      alertEnabled: options.alertEnabled ?? true
    };
    saveJSON(POLICIES_DB, this.policies);
    return this.policies[name];
  }

  delete(name) {
    if (name === 'default') return false;
    delete this.policies[name];
    saveJSON(POLICIES_DB, this.policies);
    return true;
  }
}

/**
 * Timeout Tracker
 */
class TimeoutTracker {
  constructor() {
    this.timeouts = loadJSON(TIMEOUT_DB, {});
    this.stats = loadJSON(STATS_DB, {
      total: 0,
      success: 0,
      timeout: 0,
      cancelled: 0,
      byPolicy: {}
    });
  }

  start(agentId, timeoutMs, policy = 'default') {
    const id = `${agentId}-${Date.now()}`;
    this.timeouts[id] = {
      id,
      agentId,
      policy,
      startTime: Date.now(),
      timeoutMs,
      status: 'running',
      remainingMs: timeoutMs
    };
    this.save();
    return id;
  }

  update(id, remainingMs) {
    if (this.timeouts[id]) {
      this.timeouts[id].remainingMs = remainingMs;
      this.save();
    }
  }

  complete(id, status = 'success') {
    if (this.timeouts[id]) {
      const t = this.timeouts[id];
      t.status = status;
      t.endTime = Date.now();
      t.duration = t.endTime - t.startTime;

      this.stats.total++;
      this.stats[status] = (this.stats[status] || 0) + 1;

      const policy = t.policy;
      this.stats.byPolicy[policy] = this.stats.byPolicy[policy] || { total: 0, timeout: 0 };
      this.stats.byPolicy[policy].total++;
      if (status === 'timeout') {
        this.stats.byPolicy[policy].timeout++;
      }

      this.save();
      return t;
    }
    return null;
  }

  get(id) {
    return this.timeouts[id];
  }

  getActive() {
    return Object.values(this.timeouts).filter(t => t.status === 'running');
  }

  getStats() {
    return this.stats;
  }

  save() {
    saveJSON(TIMEOUT_DB, this.timeouts);
    saveJSON(STATS_DB, this.stats);
  }
}

/**
 * Run agent with timeout
 */
async function runAgent(agentId, timeoutMs) {
  const tracker = new TimeoutTracker();
  const policyMgr = new TimeoutPolicyManager();

  const policy = policyMgr.get('default');
  const timeoutId = tracker.start(agentId, timeoutMs, policy.name);

  console.log(`\n[Timeout] Starting agent ${agentId} with ${timeoutMs}ms timeout`);
  console.log(`[Timeout] Policy: ${policy.name}, maxRetries: ${policy.maxRetries}`);

  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;

    const doResolve = (status) => {
      if (resolved) return;
      resolved = true;
      resolve(status);
    };

    // Simulate agent work with random duration
    const workTime = Math.random() * timeoutMs * 1.2;
    const willTimeout = workTime > timeoutMs;

    const timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, timeoutMs - elapsed);
      tracker.update(timeoutId, remaining);

      if (remaining <= 0) {
        clearInterval(timer);
        tracker.complete(timeoutId, 'timeout');
        console.log(`\n[TIMEOUT] Agent ${agentId} timed out after ${timeoutMs}ms`);
        console.log(`[Timeout] Policy action: ${policy.fallbackEnabled ? 'fallback triggered' : 'no fallback'}`);
        doResolve({ status: 'timeout', agentId, duration: timeoutMs });
      }
    }, 50);

    setTimeout(() => {
      clearInterval(timer);
      if (!resolved) {
        if (willTimeout) {
          tracker.complete(timeoutId, 'timeout');
          console.log(`\n[TIMEOUT] Agent ${agentId} timed out after ${timeoutMs}ms`);
        } else {
          tracker.complete(timeoutId, 'success');
          console.log(`\n[Success] Agent ${agentId} completed in ${Date.now() - startTime}ms`);
        }
        doResolve({ status: willTimeout ? 'timeout' : 'success', agentId, duration: Date.now() - startTime });
      }
    }, Math.min(workTime, timeoutMs + 100));
  });
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Timeout Management Demo ===\n');

  const policyMgr = new TimeoutPolicyManager();
  const tracker = new TimeoutTracker();

  // List policies
  console.log('1. Available Timeout Policies:');
  const policies = policyMgr.list();
  policies.forEach(p => {
    console.log(`   - ${p.name}: ${p.timeoutMs}ms, retries: ${p.maxRetries}`);
  });

  // Create custom policy
  console.log('\n2. Creating custom policy "api":');
  const custom = policyMgr.create('api', 10000, { maxRetries: 2 });
  console.log(`   Created: ${custom.name} with ${custom.timeoutMs}ms timeout`);

  // Run agents with different timeouts
  console.log('\n3. Running agents with timeouts:');

  await runAgent('agent-001', 5000);
  await runAgent('agent-002', 2000);
  await runAgent('agent-003', 8000);

  // Show stats
  console.log('\n4. Timeout Statistics:');
  const stats = tracker.getStats();
  console.log(`   Total runs: ${stats.total}`);
  console.log(`   Success: ${stats.success}`);
  console.log(`   Timeout: ${stats.timeout}`);
  console.log(`   By policy:`);
  for (const [policy, data] of Object.entries(stats.byPolicy)) {
    console.log(`     - ${policy}: ${data.total} runs, ${data.timeout} timeouts`);
  }

  // Active timeouts
  console.log('\n5. Active Timeouts:');
  const active = tracker.getActive();
  if (active.length === 0) {
    console.log('   (none)');
  } else {
    active.forEach(t => {
      console.log(`   - ${t.agentId}: ${t.remainingMs}ms remaining`);
    });
  }

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'run') {
  const agentId = args[1] || 'agent-default';
  const timeoutMs = parseInt(args[2], 10) || 30000;
  runAgent(agentId, timeoutMs).then(() => process.exit(0));
} else if (cmd === 'policy') {
  const subCmd = args[1];
  const policyMgr = new TimeoutPolicyManager();

  if (subCmd === 'list') {
    console.log('Timeout Policies:');
    policyMgr.list().forEach(p => {
      console.log(`  ${p.name}: ${p.timeoutMs}ms (retries: ${p.maxRetries})`);
    });
  } else if (subCmd === 'create') {
    const name = args[2];
    const timeoutMs = args[3] || 30000;
    const policy = policyMgr.create(name, timeoutMs);
    console.log(`Created policy: ${policy.name} with ${policy.timeoutMs}ms timeout`);
  } else if (subCmd === 'delete') {
    const name = args[2];
    if (policyMgr.delete(name)) {
      console.log(`Deleted policy: ${name}`);
    } else {
      console.log(`Cannot delete default policy`);
    }
  } else {
    console.log('policy list | policy create <name> <ms> | policy delete <name>');
  }
} else if (cmd === 'stats') {
  const tracker = new TimeoutTracker();
  const stats = tracker.getStats();
  console.log('Timeout Statistics:');
  console.log(`  Total: ${stats.total}`);
  console.log(`  Success: ${stats.success}`);
  console.log(`  Timeout: ${stats.timeout}`);
  console.log(`  Cancelled: ${stats.cancelled}`);
} else if (cmd === 'demo') {
  demo().then(() => process.exit(0));
} else {
  console.log('Agent Timeout Management');
  console.log('Usage: node agent-timeout.js [command]');
  console.log('Commands:');
  console.log('  run <agent-id> <timeout-ms>  Run agent with timeout');
  console.log('  policy list                    List timeout policies');
  console.log('  policy create <name> <ms>     Create a timeout policy');
  console.log('  stats                         Show timeout statistics');
  console.log('  demo                          Run demo');
}
