/**
 * Agent Scaling Module
 *
 * Provides dynamic agent scaling with policies, metrics, and health checks.
 * Usage: node agent-scaling.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                  Show current scaling status
 *   scale <agents>         Scale to specified number of agents
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SCALING_DB = path.join(DATA_DIR, 'scaling-state.json');

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
 * Scaling Policy
 */
class ScalingPolicy {
  constructor(config = {}) {
    this.type = config.type || 'cpu'; // cpu, memory, request, custom
    this.minAgents = config.minAgents || 1;
    this.maxAgents = config.maxAgents || 10;
    this.scaleUpThreshold = config.scaleUpThreshold || 0.8;
    this.scaleDownThreshold = config.scaleDownThreshold || 0.3;
    this.cooldownPeriod = config.cooldownPeriod || 60000; // ms
    this.scaleUpStep = config.scaleUpStep || 1;
    this.scaleDownStep = config.scaleDownStep || 1;
  }

  evaluate(metrics) {
    if (this.type === 'cpu') {
      return this.evaluateCPU(metrics);
    } else if (this.type === 'memory') {
      return this.evaluateMemory(metrics);
    } else if (this.type === 'request') {
      return this.evaluateRequests(metrics);
    }
    return 0;
  }

  evaluateCPU(metrics) {
    const cpuAvg = metrics.cpuUsage || 0;
    if (cpuAvg >= this.scaleUpThreshold) {
      return this.scaleUpStep;
    } else if (cpuAvg <= this.scaleDownThreshold) {
      return -this.scaleDownStep;
    }
    return 0;
  }

  evaluateMemory(metrics) {
    const memAvg = metrics.memoryUsage || 0;
    if (memAvg >= this.scaleUpThreshold) {
      return this.scaleUpStep;
    } else if (memAvg <= this.scaleDownThreshold) {
      return -this.scaleDownStep;
    }
    return 0;
  }

  evaluateRequests(metrics) {
    const requestsPerAgent = (metrics.totalRequests || 0) / Math.max(metrics.activeAgents, 1);
    if (requestsPerAgent >= this.scaleUpThreshold * 100) {
      return this.scaleUpStep;
    } else if (requestsPerAgent <= this.scaleDownThreshold * 10) {
      return -this.scaleDownStep;
    }
    return 0;
  }
}

/**
 * Agent Pool
 */
class AgentPool {
  constructor(name) {
    this.name = name;
    this.agents = new Map();
    this.lastScaleTime = 0;
  }

  addAgent(agentId, metadata = {}) {
    if (!this.agents.has(agentId)) {
      this.agents.set(agentId, {
        id: agentId,
        status: 'active',
        createdAt: Date.now(),
        ...metadata
      });
      return true;
    }
    return false;
  }

  removeAgent(agentId) {
    return this.agents.delete(agentId);
  }

  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  getActiveCount() {
    let count = 0;
    for (const agent of this.agents.values()) {
      if (agent.status === 'active') count++;
    }
    return count;
  }

  getAll() {
    return Array.from(this.agents.values());
  }

  scaleTo(targetCount) {
    const current = this.getActiveCount();
    const diff = targetCount - current;

    if (diff > 0) {
      // Scale up
      for (let i = 0; i < diff; i++) {
        const agentId = `agent-${Date.now()}-${i}`;
        this.addAgent(agentId);
      }
    } else if (diff < 0) {
      // Scale down - remove oldest agents
      const agents = Array.from(this.agents.values())
        .filter(a => a.status === 'active')
        .sort((a, b) => a.createdAt - b.createdAt);

      for (let i = 0; i < Math.abs(diff) && i < agents.length; i++) {
        this.removeAgent(agents[i].id);
      }
    }

    return this.getActiveCount();
  }
}

/**
 * Scaling Controller
 */
class ScalingController {
  constructor() {
    this.pools = new Map();
    this.policies = new Map();
    this.metrics = new Map();
    this.history = [];
    this.state = loadJSON(SCALING_DB, { pools: {}, lastUpdate: Date.now() });
  }

  createPool(name, policyConfig = {}) {
    const pool = new AgentPool(name);
    this.pools.set(name, pool);

    const policy = new ScalingPolicy(policyConfig);
    this.policies.set(name, policy);

    // Initialize from saved state
    if (this.state.pools[name]) {
      for (const agent of this.state.pools[name].agents || []) {
        pool.addAgent(agent.id, agent);
      }
    }

    return pool;
  }

  getPool(name) {
    return this.pools.get(name);
  }

  recordMetrics(poolName, metrics) {
    this.metrics.set(poolName, {
      ...metrics,
      timestamp: Date.now()
    });
  }

  evaluateScaling(poolName) {
    const pool = this.pools.get(poolName);
    const policy = this.policies.get(poolName);
    const metrics = this.metrics.get(poolName);

    if (!pool || !policy || !metrics) {
      return { action: 'none', reason: 'Missing pool, policy, or metrics' };
    }

    const now = Date.now();
    if (now - pool.lastScaleTime < policy.cooldownPeriod) {
      return { action: 'none', reason: 'Cooldown period active' };
    }

    const scaleDelta = policy.evaluate(metrics);
    const currentCount = pool.getActiveCount();

    if (scaleDelta > 0) {
      const newCount = Math.min(currentCount + scaleDelta, policy.maxAgents);
      if (newCount > currentCount) {
        pool.lastScaleTime = now;
        pool.scaleTo(newCount);
        this.recordScalingEvent(poolName, 'scale_up', currentCount, newCount);
        return { action: 'scale_up', from: currentCount, to: newCount };
      }
    } else if (scaleDelta < 0) {
      const newCount = Math.max(currentCount + scaleDelta, policy.minAgents);
      if (newCount < currentCount) {
        pool.lastScaleTime = now;
        pool.scaleTo(newCount);
        this.recordScalingEvent(poolName, 'scale_down', currentCount, newCount);
        return { action: 'scale_down', from: currentCount, to: newCount };
      }
    }

    return { action: 'none', reason: 'Within threshold' };
  }

  recordScalingEvent(poolName, action, from, to) {
    this.history.push({
      pool: poolName,
      action,
      from,
      to,
      timestamp: Date.now()
    });

    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }

    this.saveState();
  }

  saveState() {
    const poolsState = {};
    for (const [name, pool] of this.pools) {
      poolsState[name] = {
        agents: pool.getAll()
      };
    }

    this.state = {
      pools: poolsState,
      lastUpdate: Date.now()
    };

    saveJSON(SCALING_DB, this.state);
  }

  getStatus(poolName) {
    const pool = this.pools.get(poolName);
    const policy = this.policies.get(poolName);
    const metrics = this.metrics.get(poolName);

    if (!pool) {
      return { error: `Pool ${poolName} not found` };
    }

    return {
      pool: poolName,
      activeAgents: pool.getActiveCount(),
      totalAgents: pool.agents.size,
      policy: policy ? {
        type: policy.type,
        minAgents: policy.minAgents,
        maxAgents: policy.maxAgents,
        scaleUpThreshold: policy.scaleUpThreshold,
        scaleDownThreshold: policy.scaleDownThreshold
      } : null,
      metrics: metrics || null,
      recentEvents: this.history.filter(e => e.pool === poolName).slice(-5)
    };
  }

  getHistory(limit = 10) {
    return this.history.slice(-limit);
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Scaling Demo ===\n');

  const controller = new ScalingController();

  // Create production pool with CPU-based scaling
  const productionPool = controller.createPool('production', {
    type: 'cpu',
    minAgents: 2,
    maxAgents: 8,
    scaleUpThreshold: 0.75,
    scaleDownThreshold: 0.25,
    cooldownPeriod: 5000,
    scaleUpStep: 1,
    scaleDownStep: 1
  });

  // Create batch pool with request-based scaling
  const batchPool = controller.createPool('batch', {
    type: 'request',
    minAgents: 1,
    maxAgents: 5,
    scaleUpThreshold: 0.6,
    scaleDownThreshold: 0.2,
    cooldownPeriod: 3000,
    scaleUpStep: 2,
    scaleDownStep: 1
  });

  // Initial agents
  productionPool.scaleTo(3);
  batchPool.scaleTo(2);

  console.log('1. Initial State:');
  console.log(`   Production pool: ${productionPool.getActiveCount()} agents`);
  console.log(`   Batch pool: ${batchPool.getActiveCount()} agents`);

  // Simulate metrics and scaling
  console.log('\n2. Simulating Load Scenarios:');

  // Scenario 1: High CPU on production
  controller.recordMetrics('production', {
    cpuUsage: 0.85,
    memoryUsage: 0.6,
    totalRequests: 500,
    activeAgents: 3
  });

  const result1 = controller.evaluateScaling('production');
  console.log(`   Scenario 1 - High CPU (85%): ${result1.action}`);
  console.log(`   -> Production pool now has ${productionPool.getActiveCount()} agents`);

  // Scenario 2: Low load on production
  controller.recordMetrics('production', {
    cpuUsage: 0.15,
    memoryUsage: 0.2,
    totalRequests: 50,
    activeAgents: 4
  });

  const result2 = controller.evaluateScaling('production');
  console.log(`   Scenario 2 - Low CPU (15%): ${result2.action}`);
  console.log(`   -> Production pool now has ${productionPool.getActiveCount()} agents`);

  // Scenario 3: High request load on batch
  controller.recordMetrics('batch', {
    cpuUsage: 0.4,
    memoryUsage: 0.5,
    totalRequests: 800,
    activeAgents: 2
  });

  const result3 = controller.evaluateScaling('batch');
  console.log(`   Scenario 3 - High Requests (800): ${result3.action}`);
  console.log(`   -> Batch pool now has ${batchPool.getActiveCount()} agents`);

  // Show final status
  console.log('\n3. Final Status:');
  const prodStatus = controller.getStatus('production');
  console.log(`   Production: ${prodStatus.activeAgents}/${prodStatus.policy.maxAgents} agents`);
  console.log(`   CPU threshold: ${prodStatus.policy.scaleUpThreshold * 100}% up / ${prodStatus.policy.scaleDownThreshold * 100}% down`);

  const batchStatus = controller.getStatus('batch');
  console.log(`   Batch: ${batchStatus.activeAgents}/${batchStatus.policy.maxAgents} agents`);

  // Show scaling history
  console.log('\n4. Scaling History:');
  const history = controller.getHistory();
  history.forEach(event => {
    console.log(`   ${event.action}: ${event.pool} ${event.from} -> ${event.to}`);
  });

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const controller = new ScalingController();
  controller.createPool('default', { minAgents: 1, maxAgents: 5 });
  console.log(JSON.stringify(controller.getStatus('default'), null, 2));
} else if (cmd === 'scale') {
  const count = parseInt(args[1]) || 3;
  const controller = new ScalingController();
  const pool = controller.createPool('default', { minAgents: 1, maxAgents: 10 });
  pool.scaleTo(count);
  console.log(`Scaled to ${count} agents`);
} else {
  console.log('Agent Scaling Module');
  console.log('Usage: node agent-scaling.js [command]');
  console.log('Commands:');
  console.log('  demo           Run demo');
  console.log('  status         Show scaling status');
  console.log('  scale <n>      Scale to n agents');
}
