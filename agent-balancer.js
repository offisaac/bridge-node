/**
 * Agent Balancer Module
 *
 * Provides agent traffic balancer with health monitoring and failover.
 * Usage: node agent-balancer.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   balance <requests>    Balance requests
 *   status                 Show balancer status
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const BALANCER_DB = path.join(DATA_DIR, 'balancer-state.json');

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
 * Agent Node
 */
class AgentNode {
  constructor(id, endpoint, options = {}) {
    this.id = id;
    this.endpoint = endpoint;
    this.weight = options.weight || 1;
    this.maxConnections = options.maxConnections || 100;
    this.timeout = options.timeout || 30000;
    this.healthy = true;
    this.metadata = options.metadata || {};
    this.stats = {
      requests: 0,
      successes: 0,
      failures: 0,
      latencySum: 0,
      latencyCount: 0,
      lastRequest: null,
      lastSuccess: null,
      lastFailure: null
    };
  }

  isHealthy() {
    return this.healthy && this.stats.failures < 10;
  }

  recordSuccess(latency) {
    this.stats.requests++;
    this.stats.successes++;
    this.stats.latencySum += latency;
    this.stats.latencyCount++;
    this.stats.lastRequest = Date.now();
    this.stats.lastSuccess = Date.now();
    this.healthy = true;
  }

  recordFailure() {
    this.stats.requests++;
    this.stats.failures++;
    this.stats.lastRequest = Date.now();
    this.stats.lastFailure = Date.now();

    // Mark unhealthy after consecutive failures
    if (this.stats.failures >= 5) {
      this.healthy = false;
    }
  }

  getAvgLatency() {
    if (this.stats.latencyCount === 0) return 0;
    return this.stats.latencySum / this.stats.latencyCount;
  }

  getStats() {
    return {
      id: this.id,
      healthy: this.healthy,
      weight: this.weight,
      requests: this.stats.requests,
      successes: this.stats.successes,
      failures: this.stats.failures,
      avgLatency: this.getAvgLatency().toFixed(2),
      lastRequest: this.stats.lastRequest
    };
  }
}

/**
 * Health Monitor
 */
class HealthMonitor {
  constructor(options = {}) {
    this.interval = options.interval || 30000;
    this.threshold = options.threshold || 0.5; // 50% failure threshold
    this.nodes = new Map();
    this.timer = null;
  }

  addNode(node) {
    this.nodes.set(node.id, node);
  }

  removeNode(nodeId) {
    this.nodes.delete(nodeId);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.checkHealth(), this.interval);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  checkHealth() {
    for (const node of this.nodes.values()) {
      const total = node.stats.successes + node.stats.failures;
      if (total > 0) {
        const failureRate = node.stats.failures / total;
        node.healthy = failureRate < this.threshold;
      }
    }
  }

  getHealthyNodes() {
    return Array.from(this.nodes.values()).filter(n => n.isHealthy());
  }

  getAllNodes() {
    return Array.from(this.nodes.values());
  }
}

/**
 * Balancer Algorithm
 */
const algorithms = {
  // Round robin - evenly distribute
  round_robin: (nodes, index) => {
    const healthy = nodes.filter(n => n.isHealthy());
    if (healthy.length === 0) return null;
    return healthy[index % healthy.length];
  },

  // Least connections - choose node with fewest active connections
  least_connections: (nodes) => {
    const healthy = nodes.filter(n => n.isHealthy());
    if (healthy.length === 0) return null;
    return healthy.reduce((min, n) =>
      n.stats.requests < min.stats.requests ? n : min
    );
  },

  // Weighted random - distribute based on weight
  weighted: (nodes) => {
    const healthy = nodes.filter(n => n.isHealthy());
    if (healthy.length === 0) return null;

    const totalWeight = healthy.reduce((sum, n) => sum + n.weight, 0);
    let random = Math.random() * totalWeight;

    for (const node of healthy) {
      random -= node.weight;
      if (random <= 0) return node;
    }
    return healthy[0];
  },

  // Least latency - choose fastest node
  least_latency: (nodes) => {
    const healthy = nodes.filter(n => n.isHealthy() && n.stats.latencyCount > 0);
    if (healthy.length === 0) return null;

    return healthy.reduce((min, n) =>
      n.getAvgLatency() < min.getAvgLatency() ? n : min
    );
  },

  // IP hash - consistent hashing based on client IP
  ip_hash: (nodes, index, request) => {
    const healthy = nodes.filter(n => n.isHealthy());
    if (healthy.length === 0) return null;

    const ip = request?.headers?.['x-forwarded-for'] || 'default';
    const hash = Math.abs(ip.split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0));
    return healthy[hash % healthy.length];
  }
};

/**
 * Agent Balancer
 */
class AgentBalancer {
  constructor(options = {}) {
    this.algorithm = options.algorithm || 'round_robin';
    this.nodes = new Map();
    this.healthMonitor = new HealthMonitor();
    this.currentIndex = 0;
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      failoverCount: 0
    };
    this.state = loadJSON(BALANCER_DB, {});
  }

  // Add node
  addNode(id, endpoint, options = {}) {
    const node = new AgentNode(id, endpoint, options);
    this.nodes.set(id, node);
    this.healthMonitor.addNode(node);
    return node;
  }

  // Remove node
  removeNode(nodeId) {
    const node = this.nodes.get(nodeId);
    if (node) {
      this.healthMonitor.removeNode(nodeId);
      this.nodes.delete(nodeId);
    }
  }

  // Get node
  getNode(nodeId) {
    return this.nodes.get(nodeId);
  }

  // Set algorithm
  setAlgorithm(algorithm) {
    if (algorithms[algorithm]) {
      this.algorithm = algorithm;
      return { success: true, algorithm };
    }
    return { error: `Unknown algorithm: ${algorithm}` };
  }

  // Select node
  selectNode(request = {}) {
    const nodes = Array.from(this.nodes.values());

    if (nodes.length === 0) {
      return null;
    }

    let selected;

    if (this.algorithm === 'round_robin') {
      selected = algorithms.round_robin(nodes, this.currentIndex);
      this.currentIndex++;
    } else if (algorithms[this.algorithm]) {
      selected = algorithms[this.algorithm](nodes, this.currentIndex, request);
    } else {
      selected = algorithms.round_robin(nodes, this.currentIndex);
    }

    return selected;
  }

  // Forward request (simulated)
  async forward(request) {
    this.stats.totalRequests++;

    const node = this.selectNode(request);

    if (!node) {
      this.stats.failedRequests++;
      return { success: false, error: 'No healthy nodes available' };
    }

    const startTime = Date.now();

    try {
      // Simulate request (90% success rate)
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          if (Math.random() > 0.1) {
            resolve();
          } else {
            reject(new Error('Request failed'));
          }
        }, 10);
      });

      const latency = Date.now() - startTime;
      node.recordSuccess(latency);

      this.stats.successfulRequests++;
      return { success: true, node: node.id, latency };
    } catch (error) {
      node.recordFailure();
      this.stats.failedRequests++;
      this.stats.failoverCount++;

      // Try failover
      const fallback = this.selectNode(request);
      if (fallback && fallback.id !== node.id) {
        return this.forward(request); // Retry with fallback
      }

      return { success: false, error: error.message };
    }
  }

  // Get load distribution
  getDistribution() {
    const distribution = [];
    for (const node of this.nodes.values()) {
      distribution.push(node.getStats());
    }
    return distribution;
  }

  // Get status
  getStatus() {
    const healthy = Array.from(this.nodes.values()).filter(n => n.isHealthy()).length;
    return {
      algorithm: this.algorithm,
      totalNodes: this.nodes.size,
      healthyNodes: healthy,
      stats: this.stats,
      distribution: this.getDistribution()
    };
  }

  // Start health monitoring
  start() {
    this.healthMonitor.start();
  }

  // Stop health monitoring
  stop() {
    this.healthMonitor.stop();
  }

  // Save state
  save() {
    saveJSON(BALANCER_DB, {
      algorithm: this.algorithm,
      stats: this.stats
    });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Balancer Demo ===\n');

  const balancer = new AgentBalancer({ algorithm: 'round_robin' });

  // Add nodes
  console.log('1. Adding Agent Nodes:');
  balancer.addNode('agent-1', 'http://agent1:8001', { weight: 10 });
  balancer.addNode('agent-2', 'http://agent2:8002', { weight: 5 });
  balancer.addNode('agent-3', 'http://agent3:8003', { weight: 3 });
  console.log('   Added: agent-1 (weight 10)');
  console.log('   Added: agent-2 (weight 5)');
  console.log('   Added: agent-3 (weight 3)');

  // Test different algorithms
  console.log('\n2. Round Robin:');
  balancer.setAlgorithm('round_robin');
  const rr = {};
  for (let i = 0; i < 6; i++) {
    const node = balancer.selectNode({ headers: {} });
    if (node) rr[node.id] = (rr[node.id] || 0) + 1;
  }
  console.log(`   Distribution:`, rr);

  console.log('\n3. Weighted:');
  balancer.setAlgorithm('weighted');
  const wr = {};
  for (let i = 0; i < 100; i++) {
    const node = balancer.selectNode({ headers: {} });
    if (node) wr[node.id] = (wr[node.id] || 0) + 1;
  }
  console.log(`   Distribution:`, wr);

  // Forward requests
  console.log('\n4. Forwarding Requests:');
  for (let i = 0; i < 10; i++) {
    const result = await balancer.forward({ path: '/api/test' });
    console.log(`   Request ${i + 1}: ${result.success ? `SUCCESS (${result.node})` : 'FAILED'}`);
  }

  // Show distribution
  console.log('\n5. Load Distribution:');
  const dist = balancer.getDistribution();
  dist.forEach(n => {
    console.log(`   ${n.id}: requests=${n.requests}, success=${n.successes}, fail=${n.failures}, avgLatency=${n.avgLatency}ms`);
  });

  // Show status
  console.log('\n6. Balancer Status:');
  const status = balancer.getStatus();
  console.log(`   Algorithm: ${status.algorithm}`);
  console.log(`   Total Nodes: ${status.totalNodes}`);
  console.log(`   Healthy: ${status.healthyNodes}`);
  console.log(`   Total Requests: ${status.stats.totalRequests}`);
  console.log(`   Successful: ${status.stats.successfulRequests}`);
  console.log(`   Failed: ${status.stats.failedRequests}`);

  // Test failover
  console.log('\n7. Testing Failover:');
  const agent2 = balancer.getNode('agent-2');
  for (let i = 0; i < 5; i++) {
    agent2.recordFailure();
  }
  console.log(`   Agent-2 healthy: ${agent2.healthy}`);

  const healthy = balancer.healthMonitor.getHealthyNodes();
  console.log(`   Healthy nodes: ${healthy.map(n => n.id).join(', ')}`);

  // IP hash demo
  console.log('\n8. IP Hash Algorithm:');
  balancer.setAlgorithm('ip_hash');
  const ip1 = balancer.selectNode({ headers: { 'x-forwarded-for': '192.168.1.1' } });
  const ip2 = balancer.selectNode({ headers: { 'x-forwarded-for': '192.168.1.2' } });
  const ip3 = balancer.selectNode({ headers: { 'x-forwarded-for': '192.168.1.1' } });
  console.log(`   192.168.1.1 -> ${ip1.id}`);
  console.log(`   192.168.1.2 -> ${ip2.id}`);
  console.log(`   192.168.1.1 again -> ${ip3.id} (consistent: ${ip1.id === ip3.id})`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'balance') {
  const balancer = new AgentBalancer();
  balancer.forward({ requests: parseInt(args[1]) || 10 }).then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const balancer = new AgentBalancer();
  console.log(JSON.stringify(balancer.getStatus(), null, 2));
} else {
  console.log('Agent Balancer Module');
  console.log('Usage: node agent-balancer.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  balance <n>     Balance n requests');
  console.log('  status           Show balancer status');
}
