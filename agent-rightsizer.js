/**
 * Agent Rightsizer
 * Optimizes resource allocation for agents based on usage patterns
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentRightsizer {
  constructor(options = {}) {
    this.agents = new Map();
    this.recommendations = new Map();
    this.history = new Map();

    this.config = {
      samplingInterval: options.samplingInterval || 300000, // 5 minutes
      lookbackPeriod: options.lookbackPeriod || 7, // days
      cpuBuffer: options.cpuBuffer || 0.2, // 20% buffer
      memoryBuffer: options.memoryBuffer || 0.15, // 15% buffer
      minCpu: options.minCpu || 100, // mCPU
      minMemory: options.minMemory || 128, // MiB
      maxCpu: options.maxCpu || 16000, // mCPU
      maxMemory: options.maxMemory || 32768, // MiB
      optimizationTarget: options.optimizationTarget || 'cost' // cost, performance, balanced
    };

    this.stats = {
      totalRecommendations: 0,
      appliedRecommendations: 0,
      savings: 0
    };
  }

  registerAgent(agentConfig) {
    const { id, name, currentResources = {} } = agentConfig;

    const agent = {
      id: id || `agent-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      namespace: agentConfig.namespace || 'default',
      currentResources: {
        cpu: currentResources.cpu || 500,
        memory: currentResources.memory || 512
      },
      recommendedResources: {
        cpu: currentResources.cpu || 500,
        memory: currentResources.memory || 512
      },
      usage: {
        cpu: [],
        memory: [],
        samples: 0
      },
      status: 'monitoring',
      createdAt: new Date().toISOString(),
      lastOptimized: null
    };

    this.agents.set(agent.id, agent);
    this.history.set(agent.id, []);

    console.log(`Agent registered for rightsizing: ${agent.id} (${name})`);
    return agent;
  }

  recordUsage(agentId, usageData) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const sample = {
      timestamp: usageData.timestamp || new Date().toISOString(),
      cpu: usageData.cpu || 0, // actual CPU usage (mCPU)
      memory: usageData.memory || 0, // actual memory usage (MiB)
      cpuPercent: usageData.cpuPercent || 0,
      memoryPercent: usageData.memoryPercent || 0,
      requests: usageData.requests || 0,
      errors: usageData.errors || 0
    };

    agent.usage.cpu.push(sample.cpu);
    agent.usage.memory.push(sample.memory);
    agent.usage.samples++;

    // Keep only last 1000 samples
    if (agent.usage.cpu.length > 1000) {
      agent.usage.cpu.shift();
      agent.usage.memory.shift();
    }

    // Store in history
    const agentHistory = this.history.get(agentId);
    agentHistory.push(sample);

    // Trim history
    if (agentHistory.length > 10000) {
      this.history.set(agentId, agentHistory.slice(-5000));
    }

    return sample;
  }

  analyzeResources(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const cpuUsage = agent.usage.cpu;
    const memoryUsage = agent.usage.memory;

    if (cpuUsage.length < 10) {
      return {
        agentId: agent.id,
        status: 'insufficient_data',
        message: 'Need more samples for accurate analysis'
      };
    }

    // Calculate statistics
    const stats = {
      cpu: {
        avg: this._avg(cpuUsage),
        max: Math.max(...cpuUsage),
        p95: this._percentile(cpuUsage, 95),
        p99: this._percentile(cpuUsage, 99)
      },
      memory: {
        avg: this._avg(memoryUsage),
        max: Math.max(...memoryUsage),
        p95: this._percentile(memoryUsage, 95),
        p99: this._percentile(memoryUsage, 99)
      }
    };

    // Calculate recommended resources
    const recommendations = this._calculateRecommendations(agent, stats);

    // Update agent
    agent.recommendedResources = recommendations.resources;
    agent.lastOptimized = new Date().toISOString();

    // Create recommendation record
    const recommendation = {
      id: crypto.randomUUID(),
      agentId: agent.id,
      agentName: agent.name,
      currentResources: { ...agent.currentResources },
      recommendedResources: recommendations.resources,
      reasons: recommendations.reasons,
      potentialSavings: recommendations.savings,
      confidence: recommendations.confidence,
      status: 'pending',
      createdAt: new Date().toISOString()
    };

    this.recommendations.set(recommendation.id, recommendation);
    this.stats.totalRecommendations++;

    return recommendation;
  }

  _avg(arr) {
    return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  }

  _percentile(arr, p) {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index] || sorted[sorted.length - 1];
  }

  _calculateRecommendations(agent, stats) {
    const { cpuBuffer, memoryBuffer, minCpu, minMemory, maxCpu, maxMemory } = this.config;
    const currentCpu = agent.currentResources.cpu;
    const currentMemory = agent.currentResources.memory;

    let recommendedCpu = Math.ceil(stats.cpu.p95 * (1 + cpuBuffer));
    let recommendedMemory = Math.ceil(stats.memory.p95 * (1 + memoryBuffer));

    // Enforce limits
    recommendedCpu = Math.max(minCpu, Math.min(maxCpu, recommendedCpu));
    recommendedMemory = Math.max(minMemory, Math.min(maxMemory, recommendedMemory));

    // Round to nearest 100mCPU or 64MiB
    recommendedCpu = Math.ceil(recommendedCpu / 100) * 100;
    recommendedMemory = Math.ceil(recommendedMemory / 64) * 64;

    const reasons = [];
    let savings = 0;

    // Analyze CPU
    const cpuUtilization = (stats.cpu.avg / currentCpu) * 100;
    if (cpuUtilization < 50) {
      reasons.push({
        type: 'cpu',
        issue: 'Low CPU utilization',
        detail: `Average CPU usage is only ${cpuUtilization.toFixed(1)}% of allocated`
      });
    } else if (cpuUtilization > 90) {
      reasons.push({
        type: 'cpu',
        issue: 'High CPU utilization',
        detail: `Consider increasing CPU to handle peaks (P95: ${stats.cpu.p95.toFixed(0)}mCPU)`
      });
    }

    // Analyze memory
    const memoryUtilization = (stats.memory.avg / currentMemory) * 100;
    if (memoryUtilization < 60) {
      reasons.push({
        type: 'memory',
        issue: 'Low memory utilization',
        detail: `Average memory usage is only ${memoryUtilization.toFixed(1)}% of allocated`
      });
    } else if (memoryUtilization > 90) {
      reasons.push({
        type: 'memory',
        issue: 'High memory utilization',
        detail: `Consider increasing memory to handle peaks (P95: ${stats.memory.p95.toFixed(0)}MiB)`
      });
    }

    // Calculate potential savings (assume $0.01 per mCPU/day and $0.001 per MiB/day)
    const cpuDiff = currentCpu - recommendedCpu;
    const memoryDiff = currentMemory - recommendedMemory;
    if (cpuDiff > 0 || memoryDiff > 0) {
      savings = (cpuDiff * 0.01 + memoryDiff * 0.001);
    }

    return {
      resources: {
        cpu: recommendedCpu,
        memory: recommendedMemory
      },
      reasons,
      savings: Math.max(0, savings),
      confidence: this._calculateConfidence(agent.usage.samples)
    };
  }

  _calculateConfidence(sampleCount) {
    if (sampleCount < 100) return 'low';
    if (sampleCount < 500) return 'medium';
    return 'high';
  }

  applyRecommendation(recommendationId) {
    const recommendation = this.recommendations.get(recommendationId);
    if (!recommendation) {
      throw new Error(`Recommendation not found: ${recommendationId}`);
    }

    const agent = this.agents.get(recommendation.agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${recommendation.agentId}`);
    }

    // Apply the recommendation
    agent.currentResources = { ...recommendation.recommendedResources };
    recommendation.status = 'applied';
    recommendation.appliedAt = new Date().toISOString();

    this.stats.appliedRecommendations++;
    this.stats.savings += recommendation.potentialSavings;

    console.log(`Applied rightsizing recommendation for agent ${agent.name}`);
    console.log(`  CPU: ${recommendation.currentResources.cpu}m → ${recommendation.recommendedResources.cpu}m`);
    console.log(`  Memory: ${recommendation.currentResources.memory}MiB → ${recommendation.recommendedResources.memory}MiB`);

    return recommendation;
  }

  dismissRecommendation(recommendationId) {
    const recommendation = this.recommendations.get(recommendationId);
    if (!recommendation) {
      throw new Error(`Recommendation not found: ${recommendationId}`);
    }

    recommendation.status = 'dismissed';
    recommendation.dismissedAt = new Date().toISOString();

    return recommendation;
  }

  getRecommendation(recommendationId) {
    return this.recommendations.get(recommendationId);
  }

  getAgentRecommendations(agentId) {
    return Array.from(this.recommendations.values())
      .filter(r => r.agentId === agentId);
  }

  listRecommendations(status = null) {
    let recommendations = Array.from(this.recommendations.values());

    if (status) {
      recommendations = recommendations.filter(r => r.status === status);
    }

    return recommendations.sort((a, b) =>
      new Date(b.createdAt) - new Date(a.createdAt)
    );
  }

  analyzeAllAgents() {
    const results = [];

    for (const agent of this.agents.values()) {
      const analysis = this.analyzeResources(agent.id);
      results.push(analysis);
    }

    return results;
  }

  getAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }
    return agent;
  }

  listAgents() {
    return Array.from(this.agents.values()).map(a => ({
      id: a.id,
      name: a.name,
      namespace: a.namespace,
      currentResources: a.currentResources,
      recommendedResources: a.recommendedResources,
      samples: a.usage.samples,
      status: a.status,
      lastOptimized: a.lastOptimized
    }));
  }

  getHistory(agentId, startTime = null, endTime = null) {
    let history = this.history.get(agentId) || [];

    if (startTime) {
      history = history.filter(h => new Date(h.timestamp) >= new Date(startTime));
    }

    if (endTime) {
      history = history.filter(h => new Date(h.timestamp) <= new Date(endTime));
    }

    return history;
  }

  getStatistics() {
    const pending = this.listRecommendations('pending');
    const applied = this.listRecommendations('applied');

    return {
      totalAgents: this.agents.size,
      totalRecommendations: this.stats.totalRecommendations,
      pendingRecommendations: pending.length,
      appliedRecommendations: applied.length,
      potentialSavings: this._sumPotentialSavings(pending),
      actualSavings: this.stats.savings
    };
  }

  _sumPotentialSavings(recommendations) {
    return recommendations.reduce((sum, r) => sum + r.potentialSavings, 0);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const rightsizer = new AgentRightsizer({
    cpuBuffer: 0.2,
    memoryBuffer: 0.15,
    optimizationTarget: 'cost'
  });

  switch (command) {
    case 'register':
      const agentName = args[1] || 'my-agent';
      const agent = rightsizer.registerAgent({
        name: agentName,
        namespace: args[2] || 'default',
        currentResources: {
          cpu: parseInt(args[3]) || 1000,
          memory: parseInt(args[4]) || 1024
        }
      });
      console.log('Agent registered:', agent.id);
      break;

    case 'record-usage':
      const recordAgentId = args[1];
      if (!recordAgentId) {
        console.log('Usage: node agent-rightsizer.js record-usage <agent-id> [cpu] [memory]');
        process.exit(1);
      }
      const sample = rightsizer.recordUsage(recordAgentId, {
        cpu: parseInt(args[2]) || 400,
        memory: parseInt(args[3]) || 512,
        cpuPercent: parseInt(args[4]) || 40,
        memoryPercent: parseInt(args[5]) || 50
      });
      console.log('Usage recorded:', sample);
      break;

    case 'analyze':
      const analyzeAgentId = args[1];
      if (!analyzeAgentId) {
        console.log('Usage: node agent-rightsizer.js analyze <agent-id>');
        process.exit(1);
      }
      console.log('Analysis:', rightsizer.analyzeResources(analyzeAgentId));
      break;

    case 'list-recommendations':
      console.log('Recommendations:', rightsizer.listRecommendations());
      break;

    case 'demo':
      console.log('=== Agent Rightsizer Demo ===\n');

      // Register agents
      console.log('1. Registering agents...');
      const agent1 = rightsizer.registerAgent({
        name: 'api-gateway',
        namespace: 'production',
        currentResources: { cpu: 2000, memory: 2048 }
      });
      console.log('   Registered:', agent1.name);

      const agent2 = rightsizer.registerAgent({
        name: 'data-processor',
        namespace: 'production',
        currentResources: { cpu: 4000, memory: 4096 }
      });
      console.log('   Registered:', agent2.name);

      const agent3 = rightsizer.registerAgent({
        name: 'worker-service',
        namespace: 'production',
        currentResources: { cpu: 500, memory: 512 }
      });
      console.log('   Registered:', agent3.name);

      // Record usage data for agent1 (over-provisioned)
      console.log('\n2. Recording usage data...');
      for (let i = 0; i < 50; i++) {
        rightsizer.recordUsage(agent1.id, {
          timestamp: new Date(Date.now() - i * 600000).toISOString(),
          cpu: 300 + Math.random() * 200, // Using ~400mCPU of 2000mCPU
          memory: 400 + Math.random() * 200, // Using ~500MiB of 2GiB
          cpuPercent: 15 + Math.random() * 10,
          memoryPercent: 20 + Math.random() * 10
        });
      }
      console.log('   Recorded 50 samples for api-gateway');

      // Record usage data for agent2 (under-provisioned)
      for (let i = 0; i < 50; i++) {
        rightsizer.recordUsage(agent2.id, {
          timestamp: new Date(Date.now() - i * 600000).toISOString(),
          cpu: 3500 + Math.random() * 500, // Using ~3750mCPU of 4000mCPU
          memory: 3500 + Math.random() * 500, // Using ~3750MiB of 4GiB
          cpuPercent: 85 + Math.random() * 10,
          memoryPercent: 85 + Math.random() * 10
        });
      }
      console.log('   Recorded 50 samples for data-processor');

      // Record usage data for agent3 (properly sized)
      for (let i = 0; i < 50; i++) {
        rightsizer.recordUsage(agent3.id, {
          timestamp: new Date(Date.now() - i * 600000).toISOString(),
          cpu: 350 + Math.random() * 100, // Using ~400mCPU of 500mCPU
          memory: 350 + Math.random() * 100, // Using ~400MiB of 512MiB
          cpuPercent: 70 + Math.random() * 20,
          memoryPercent: 70 + Math.random() * 20
        });
      }
      console.log('   Recorded 50 samples for worker-service');

      // Analyze resources
      console.log('\n3. Analyzing resources...');
      const rec1 = rightsizer.analyzeResources(agent1.id);
      console.log('   api-gateway recommendation:');
      console.log(`     CPU: ${rec1.currentResources.cpu}m → ${rec1.recommendedResources.cpu}m`);
      console.log(`     Memory: ${rec1.currentResources.memory}MiB → ${rec1.recommendedResources.memory}MiB`);
      console.log(`     Savings: $${rec1.potentialSavings.toFixed(3)}/day`);

      const rec2 = rightsizer.analyzeResources(agent2.id);
      console.log('   data-processor recommendation:');
      console.log(`     CPU: ${rec2.currentResources.cpu}m → ${rec2.recommendedResources.cpu}m`);
      console.log(`     Memory: ${rec2.currentResources.memory}MiB → ${rec2.recommendedResources.memory}MiB`);
      console.log(`     Note: ${rec2.reasons.length > 0 ? rec2.reasons[0].issue : 'Properly sized'}`);

      const rec3 = rightsizer.analyzeResources(agent3.id);
      console.log('   worker-service recommendation:');
      console.log(`     CPU: ${rec3.currentResources.cpu}m → ${rec3.recommendedResources.cpu}m`);
      console.log(`     Memory: ${rec3.currentResources.memory}MiB → ${rec3.recommendedResources.memory}MiB`);

      // List recommendations
      console.log('\n4. Pending recommendations:');
      const pending = rightsizer.listRecommendations('pending');
      pending.forEach(r => {
        console.log(`   - ${r.agentName}: CPU ${r.currentResources.cpu}→${r.recommendedResources.cpu}m, Memory ${r.currentResources.memory}→${r.recommendedResources.memory}MiB`);
      });

      // Apply a recommendation
      console.log('\n5. Applying recommendation...');
      const applied = rightsizer.applyRecommendation(pending[0].id);
      console.log('   Applied for:', applied.agentName);

      // Get statistics
      console.log('\n6. Statistics:');
      const stats = rightsizer.getStatistics();
      console.log('   Total Agents:', stats.totalAgents);
      console.log('   Total Recommendations:', stats.totalRecommendations);
      console.log('   Pending:', stats.pendingRecommendations);
      console.log('   Applied:', stats.appliedRecommendations);
      console.log('   Potential Savings:', `$${stats.potentialSavings.toFixed(3)}/day`);
      console.log('   Actual Savings:', `$${stats.actualSavings.toFixed(3)}/day`);

      // List all agents
      console.log('\n7. All agents:');
      const agents = rightsizer.listAgents();
      agents.forEach(a => {
        console.log(`   - ${a.name}: CPU ${a.currentResources.cpu}m, Memory ${a.currentResources.memory}MiB`);
      });

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-rightsizer.js <command> [args]');
      console.log('\nCommands:');
      console.log('  register [name] [ns] [cpu] [memory]  Register agent');
      console.log('  record-usage <id> [cpu] [memory]      Record usage');
      console.log('  analyze <agent-id>                      Analyze resources');
      console.log('  list-recommendations                   List recommendations');
      console.log('  demo                                    Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentRightsizer;
