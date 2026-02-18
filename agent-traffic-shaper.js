/**
 * Agent Traffic Shaper
 * Controls and shapes agent network traffic with rate limiting and bandwidth management
 */

const crypto = require('crypto');

class AgentTrafficShaper {
  constructor(options = {}) {
    this.queues = new Map();
    this.policies = new Map();
    this.stats = {
      totalPacketsShaped: 0,
      totalBytesShaped: 0,
      packetsDropped: 0,
      packetsQueued: 0
    };

    this.config = {
      maxQueueSize: options.maxQueueSize || 10000,
      defaultRate: options.defaultRate || 1000, // packets per second
      defaultBurst: options.defaultBurst || 2000,
      cleanupInterval: options.cleanupInterval || 60000,
      enablePriority: options.enablePriority !== false
    };

    // Initialize default shaping policies
    this._initDefaultPolicies();

    // Start cleanup timer
    this._startCleanupTimer();
  }

  _initDefaultPolicies() {
    const defaultPolicies = [
      { name: 'default', rate: 1000, burst: 2000, priority: 5, enabled: true },
      { name: 'high-priority', rate: 5000, burst: 10000, priority: 1, enabled: true },
      { name: 'low-priority', rate: 100, burst: 200, priority: 10, enabled: true },
      { name: 'bulk', rate: 50, burst: 100, priority: 20, enabled: true }
    ];

    defaultPolicies.forEach(policy => {
      this.createPolicy(policy);
    });
  }

  _startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this._cleanupStaleQueues();
    }, this.config.cleanupInterval);
  }

  _cleanupStaleQueues() {
    const now = Date.now();
    const staleTimeout = 300000; // 5 minutes

    for (const [agentId, queue] of this.queues) {
      if (now - queue.lastActivity > staleTimeout && queue.size === 0) {
        this.queues.delete(agentId);
      }
    }
  }

  createPolicy(policyConfig) {
    const { name, rate, burst, priority, enabled } = policyConfig;

    const policy = {
      id: `policy-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      rate: rate || this.config.defaultRate,
      burst: burst || this.config.defaultBurst,
      priority: priority || 5,
      enabled: enabled !== false,
      tokens: burst || this.config.defaultBurst,
      lastUpdate: Date.now(),
      createdAt: new Date().toISOString()
    };

    this.policies.set(name, policy);
    console.log(`Traffic shaping policy created: ${policy.name} (${policy.rate} pps, burst: ${policy.burst}, priority: ${policy.priority})`);
    return policy;
  }

  getPolicy(name) {
    const policy = this.policies.get(name);
    if (!policy) {
      throw new Error(`Policy not found: ${name}`);
    }
    return policy;
  }

  listPolicies() {
    return Array.from(this.policies.values()).map(p => ({
      id: p.id,
      name: p.name,
      rate: p.rate,
      burst: p.burst,
      priority: p.priority,
      enabled: p.enabled
    }));
  }

  updatePolicy(name, updates) {
    const policy = this.policies.get(name);
    if (!policy) {
      throw new Error(`Policy not found: ${name}`);
    }

    Object.assign(policy, updates);
    console.log(`Policy updated: ${name}`);
    return policy;
  }

  enqueuePacket(agentId, packet, options = {}) {
    const { policyName, priority } = options;

    // Get or create queue for agent
    if (!this.queues.has(agentId)) {
      this._createQueue(agentId);
    }

    const queue = this.queues.get(agentId);
    const policy = this.policies.get(policyName || 'default');

    // Check queue size
    if (queue.size >= this.config.maxQueueSize) {
      this.stats.packetsDropped++;
      console.log(`Queue full for agent ${agentId}, dropping packet`);
      return { success: false, reason: 'queue_full' };
    }

    // Create packet
    const pkt = {
      id: `pkt-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      agentId,
      data: packet.data || packet,
      size: packet.size || 1,
      priority: priority || policy.priority,
      policyName: policy.name,
      enqueuedAt: Date.now(),
      metadata: packet.metadata || {}
    };

    // Add to queue sorted by priority
    queue.packets.push(pkt);
    queue.packets.sort((a, b) => a.priority - b.priority);
    queue.size++;
    queue.lastActivity = Date.now();

    this.stats.packetsQueued++;

    return { success: true, packetId: pkt.id, queueSize: queue.size };
  }

  _createQueue(agentId) {
    const queue = {
      agentId,
      packets: [],
      size: 0,
      bytesQueued: 0,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      tokens: this.config.defaultBurst,
      lastUpdate: Date.now()
    };

    this.queues.set(agentId, queue);
    return queue;
  }

  getQueue(agentId) {
    if (!this.queues.has(agentId)) {
      throw new Error(`Queue not found for agent: ${agentId}`);
    }
    return this.queues.get(agentId);
  }

  processQueue(agentId, maxPackets = 100) {
    const queue = this.queues.get(agentId);
    if (!queue) {
      return { processed: 0, dropped: 0 };
    }

    const policy = this.policies.get('default');
    const now = Date.now();
    const timeDelta = (now - queue.lastUpdate) / 1000;

    // Refill tokens (token bucket algorithm)
    const tokensToAdd = policy.rate * timeDelta;
    queue.tokens = Math.min(policy.burst, queue.tokens + tokensToAdd);
    queue.lastUpdate = now;

    let processed = 0;
    let dropped = 0;
    const processedPackets = [];

    while (queue.packets.length > 0 && processed < maxPackets) {
      const packet = queue.packets[0];

      if (queue.tokens >= packet.size) {
        // Process packet
        queue.packets.shift();
        queue.tokens -= packet.size;
        queue.size--;
        processed++;
        this.stats.totalPacketsShaped++;
        this.stats.totalBytesShaped += packet.size;
        processedPackets.push(packet);
      } else {
        // No tokens available, wait
        break;
      }
    }

    queue.lastActivity = Date.now();

    return { processed, dropped, processedPackets };
  }

  getQueueStatus(agentId) {
    const queue = this.queues.get(agentId);
    if (!queue) {
      return null;
    }

    return {
      agentId: queue.agentId,
      size: queue.size,
      bytesQueued: queue.bytesQueued,
      tokens: queue.tokens,
      priority: queue.packets.length > 0 ? queue.packets[0].priority : null
    };
  }

  listQueues() {
    return Array.from(this.queues.values()).map(q => ({
      agentId: q.agentId,
      size: q.size,
      bytesQueued: q.bytesQueued,
      lastActivity: q.lastActivity
    }));
  }

  clearQueue(agentId) {
    const queue = this.queues.get(agentId);
    if (!queue) {
      return { cleared: 0 };
    }

    const cleared = queue.size;
    queue.packets = [];
    queue.size = 0;
    queue.bytesQueued = 0;

    console.log(`Cleared ${cleared} packets from queue for agent ${agentId}`);
    return { cleared };
  }

  getStatistics() {
    const queueStats = Array.from(this.queues.values()).reduce((acc, q) => {
      acc.totalQueued += q.size;
      acc.totalBytes += q.bytesQueued;
      return acc;
    }, { totalQueued: 0, totalBytes: 0 });

    return {
      shaping: {
        totalPacketsShaped: this.stats.totalPacketsShaped,
        totalBytesShaped: this.stats.totalBytesShaped,
        packetsDropped: this.stats.packetsDropped,
        packetsQueued: this.stats.packetsQueued
      },
      queues: {
        active: this.queues.size,
        totalQueued: queueStats.totalQueued,
        totalBytes: queueStats.totalBytes
      },
      policies: {
        total: this.policies.size,
        enabled: Array.from(this.policies.values()).filter(p => p.enabled).length
      }
    };
  }

  shutdown() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.queues.clear();
    console.log('Traffic shaper shut down');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const shaper = new AgentTrafficShaper({
    maxQueueSize: 10000,
    defaultRate: 1000,
    defaultBurst: 2000
  });

  switch (command) {
    case 'list-policies':
      const policies = shaper.listPolicies();
      console.log('Traffic Shaping Policies:');
      policies.forEach(p => console.log(`  - ${p.name}: ${p.rate} pps, burst: ${p.burst}, priority: ${p.priority} [${p.enabled ? 'enabled' : 'disabled'}]`));
      break;

    case 'create-policy':
      const newPolicy = shaper.createPolicy({
        name: args[1] || 'custom',
        rate: parseInt(args[2]) || 500,
        burst: parseInt(args[3]) || 1000,
        priority: parseInt(args[4]) || 5
      });
      console.log('Policy created:', newPolicy.name);
      break;

    case 'enqueue':
      const agentId = args[1] || 'agent-001';
      const result = shaper.enqueuePacket(agentId, {
        data: 'test-packet',
        size: parseInt(args[2]) || 1
      }, { policyName: args[3] || 'default' });
      console.log('Packet enqueued:', result);
      break;

    case 'process':
      const procResult = shaper.processQueue(args[1] || 'agent-001', parseInt(args[2]) || 10);
      console.log('Processed:', procResult);
      break;

    case 'queue-status':
      const status = shaper.getQueueStatus(args[1] || 'agent-001');
      console.log('Queue Status:', status);
      break;

    case 'list-queues':
      const queues = shaper.listQueues();
      console.log('Active Queues:');
      queues.forEach(q => console.log(`  - ${q.agentId}: ${q.size} packets`));
      break;

    case 'clear-queue':
      const cleared = shaper.clearQueue(args[1] || 'agent-001');
      console.log('Cleared:', cleared);
      break;

    case 'stats':
      const stats = shaper.getStatistics();
      console.log('Traffic Shaper Statistics:', stats);
      break;

    case 'demo':
      console.log('=== Agent Traffic Shaper Demo ===\n');

      // List policies
      console.log('1. Traffic Shaping Policies:');
      const policyList = shaper.listPolicies();
      policyList.forEach(p => {
        console.log(`   - ${p.name}: ${p.rate} pps, burst: ${p.burst}, priority: ${p.priority}`);
      });

      // Enqueue packets for different agents
      console.log('\n2. Enqueuing Packets:');

      // High priority agent
      const hpResult = shaper.enqueuePacket('agent-high-prio', {
        data: 'critical-update',
        size: 10
      }, { policyName: 'high-priority' });
      console.log(`   High-priority agent: ${hpResult.success ? 'enqueued' : 'failed'}`);

      // Default agent
      for (let i = 0; i < 5; i++) {
        shaper.enqueuePacket('agent-default', { data: `packet-${i}`, size: 1 });
      }
      console.log(`   Default agent: 5 packets enqueued`);

      // Low priority agent
      for (let i = 0; i < 3; i++) {
        shaper.enqueuePacket('agent-low-prio', { data: `bulk-${i}`, size: 5 }, { policyName: 'low-priority' });
      }
      console.log(`   Low-priority agent: 3 packets enqueued`);

      // Bulk agent
      for (let i = 0; i < 10; i++) {
        shaper.enqueuePacket('agent-bulk', { data: `bulk-data-${i}`, size: 2 }, { policyName: 'bulk' });
      }
      console.log(`   Bulk agent: 10 packets enqueued`);

      // List queues
      console.log('\n3. Queue Status:');
      const queueList = shaper.listQueues();
      queueList.forEach(q => {
        console.log(`   - ${q.agentId}: ${q.size} packets, ${q.bytesQueued} bytes`);
      });

      // Process queues
      console.log('\n4. Processing Queues:');
      const highResult = shaper.processQueue('agent-high-prio', 5);
      console.log(`   High-priority: ${highResult.processed} packets processed`);

      const defaultResult = shaper.processQueue('agent-default', 5);
      console.log(`   Default: ${defaultResult.processed} packets processed`);

      const lowResult = shaper.processQueue('agent-low-prio', 5);
      console.log(`   Low-priority: ${lowResult.processed} packets processed`);

      const bulkResult = shaper.processQueue('agent-bulk', 5);
      console.log(`   Bulk: ${bulkResult.processed} packets processed`);

      // Queue status after processing
      console.log('\n5. Queue Status After Processing:');
      const finalQueues = shaper.listQueues();
      finalQueues.forEach(q => {
        console.log(`   - ${q.agentId}: ${q.size} packets remaining`);
      });

      // Statistics
      console.log('\n6. Statistics:');
      const finalStats = shaper.getStatistics();
      console.log(`   Total packets shaped: ${finalStats.shaping.totalPacketsShaped}`);
      console.log(`   Total bytes shaped: ${finalStats.shaping.totalBytesShaped}`);
      console.log(`   Packets dropped: ${finalStats.shaping.packetsDropped}`);
      console.log(`   Active queues: ${finalStats.queues.active}`);
      console.log(`   Total queued: ${finalStats.queues.totalQueued}`);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-traffic-shaper.js <command> [args]');
      console.log('\nCommands:');
      console.log('  list-policies              List traffic shaping policies');
      console.log('  create-policy <name> [args] Create new policy');
      console.log('  enqueue <agent> [size]      Enqueue a packet');
      console.log('  process <agent> [count]    Process packets from queue');
      console.log('  queue-status <agent>       Get queue status');
      console.log('  list-queues                 List all active queues');
      console.log('  clear-queue <agent>         Clear queue for agent');
      console.log('  stats                       Get statistics');
      console.log('  demo                        Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentTrafficShaper;
