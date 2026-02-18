/**
 * Agent Orchestration 2 - Advanced Agent Orchestration
 *
 * Advanced orchestration with fan-out/fan-in, chaining, and dynamic routing.
 *
 * Usage: node agent-orchestration-2.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   fanout     - Show fan-out patterns
 *   routing    - Show dynamic routing
 */

class AgentNode {
  constructor(id, handler) {
    this.id = id;
    this.handler = handler;
    this.dependencies = [];
    this.status = 'idle';
    this.result = null;
  }

  dependsOn(nodeIds) {
    this.dependencies = nodeIds;
    return this;
  }
}

class ExecutionContext {
  constructor(orchestration) {
    this.orchestration = orchestration;
    this.nodeResults = new Map();
    this.startTime = null;
    this.endTime = null;
  }
}

class Orchestration2Agent {
  constructor() {
    this.agents = new Map();
    this.orchestrations = new Map();
    this.stats = { executed: 0, success: 0, failed: 0 };
  }

  registerAgent(id, handler) {
    const node = new AgentNode(id, handler);
    this.agents.set(id, node);
    return node;
  }

  createOrchestration(name, config) {
    this.orchestrations.set(name, {
      name,
      nodes: config.nodes || [],
      strategy: config.strategy || 'sequential', // sequential, parallel, fanout, fanin
      timeout: config.timeout || 30000,
      retry: config.retry || 0
    });
    return this;
  }

  async execute(name, input = {}) {
    const orchestration = this.orchestrations.get(name);
    if (!orchestration) throw new Error(`Orchestration ${name} not found`);

    this.stats.executed++;
    const ctx = new ExecutionContext(this);
    ctx.startTime = Date.now();

    try {
      let result;
      switch (orchestration.strategy) {
        case 'sequential':
          result = await this._executeSequential(orchestration, input, ctx);
          break;
        case 'parallel':
          result = await this._executeParallel(orchestration, input, ctx);
          break;
        case 'fanout':
          result = await this._executeFanOut(orchestration, input, ctx);
          break;
        case 'fanin':
          result = await this._executeFanIn(orchestration, input, ctx);
          break;
        default:
          throw new Error(`Unknown strategy: ${orchestration.strategy}`);
      }

      ctx.endTime = Date.now();
      this.stats.success++;
      return {
        success: true,
        duration: ctx.endTime - ctx.startTime,
        results: ctx.nodeResults,
        data: result
      };
    } catch (error) {
      ctx.endTime = Date.now();
      this.stats.failed++;
      return {
        success: false,
        error: error.message,
        duration: ctx.endTime - ctx.startTime,
        partialResults: ctx.nodeResults
      };
    }
  }

  async _executeSequential(orchestration, input, ctx) {
    let data = input;
    for (const nodeId of orchestration.nodes) {
      const agent = this.agents.get(nodeId);
      if (!agent) throw new Error(`Agent ${nodeId} not found`);

      console.log(`   Executing: ${nodeId}`);
      agent.status = 'running';
      data = await agent.handler(data);
      agent.status = 'completed';
      agent.result = data;
      ctx.nodeResults.set(nodeId, data);
    }
    return data;
  }

  async _executeParallel(orchestration, input, ctx) {
    const promises = orchestration.nodes.map(async (nodeId) => {
      const agent = this.agents.get(nodeId);
      if (!agent) throw new Error(`Agent ${nodeId} not found`);

      console.log(`   Executing: ${nodeId}`);
      agent.status = 'running';
      const result = await agent.handler(input);
      agent.status = 'completed';
      ctx.nodeResults.set(nodeId, result);
      return result;
    });

    return Promise.all(promises);
  }

  async _executeFanOut(orchestration, input, ctx) {
    // Fan-out: split input and process in parallel
    const items = Array.isArray(input) ? input : [input];
    const results = [];

    console.log(`   Fan-out: ${items.length} items`);

    const promises = items.map(async (item, index) => {
      const nodeId = orchestration.nodes[index % orchestration.nodes.length];
      const agent = this.agents.get(nodeId);
      console.log(`   Processing item ${index} with ${nodeId}`);
      const result = await agent.handler(item);
      ctx.nodeResults.set(`${nodeId}_${index}`, result);
      return result;
    });

    return Promise.all(promises);
  }

  async _executeFanIn(orchestration, input, ctx) {
    // Fan-in: collect results from multiple sources
    console.log(`   Fan-in: collecting from ${orchestration.nodes.length} sources`);

    const promises = orchestration.nodes.map(async (nodeId) => {
      const agent = this.agents.get(nodeId);
      return await agent.handler(input);
    });

    const results = await Promise.all(promises);
    ctx.nodeResults.set('fanin', results);

    // Aggregate results
    return {
      total: results.length,
      results: results.reduce((acc, r) => ({ ...acc, ...r }), {})
    };
  }

  async executeWithRouting(input, rules) {
    let currentData = input;
    const routeHistory = [];

    for (const rule of rules) {
      const agent = this.agents.get(rule.agent);
      if (!agent) throw new Error(`Agent ${rule.agent} not found`);

      console.log(`   Routing to: ${rule.agent}`);

      const conditionMet = rule.condition ? await rule.condition(currentData) : true;

      if (conditionMet) {
        currentData = await agent.handler(currentData);
        routeHistory.push({ agent: rule.agent, status: 'executed', result: currentData });
      } else {
        routeHistory.push({ agent: rule.agent, status: 'skipped' });
      }
    }

    return { data: currentData, history: routeHistory };
  }

  async fanOutFanIn(workers, items, aggregator) {
    // Fan-out to workers, then fan-in with aggregator
    const chunks = this._chunkArray(items, workers.length);

    const promises = workers.map(async (workerId, index) => {
      const agent = this.agents.get(workerId);
      const chunk = chunks[index] || [];
      console.log(`   Worker ${workerId}: processing ${chunk.length} items`);
      return await agent.handler(chunk);
    });

    const results = await Promise.all(promises);
    return aggregator ? await aggregator(results) : results;
  }

  _chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  getStats() {
    return { ...this.stats, agents: this.agents.size, orchestrations: this.orchestrations.size };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const orch2 = new Orchestration2Agent();

switch (command) {
  case 'demo':
    console.log('=== Agent Orchestration 2 Demo\n');

    // 1. Sequential execution
    console.log('1. Sequential Execution:');
    orch2.registerAgent('validate', async (data) => {
      console.log(`      Validating: ${JSON.stringify(data)}`);
      return { ...data, validated: true };
    });
    orch2.registerAgent('transform', async (data) => {
      console.log(`      Transforming: ${JSON.stringify(data)}`);
      return { ...data, transformed: true };
    });
    orch2.registerAgent('save', async (data) => {
      console.log(`      Saving: ${JSON.stringify(data)}`);
      return { ...data, saved: true };
    });

    orch2.createOrchestration('pipeline', {
      nodes: ['validate', 'transform', 'save'],
      strategy: 'sequential'
    });

    const result1 = await orch2.execute('pipeline', { id: 1 });
    console.log(`   Success: ${result1.success}`);

    // 2. Parallel execution
    console.log('\n2. Parallel Execution:');
    orch2.registerAgent('fetchUser', async (data) => {
      await new Promise(r => setTimeout(r, 10));
      return { ...data, user: { id: 1, name: 'John' } };
    });
    orch2.registerAgent('fetchOrders', async (data) => {
      await new Promise(r => setTimeout(r, 10));
      return { ...data, orders: [{ id: 1 }, { id: 2 }] };
    });
    orch2.registerAgent('fetchHistory', async (data) => {
      await new Promise(r => setTimeout(r, 10));
      return { ...data, history: [] };
    });

    orch2.createOrchestration('parallel-fetch', {
      nodes: ['fetchUser', 'fetchOrders', 'fetchHistory'],
      strategy: 'parallel'
    });

    const result2 = await orch2.execute('parallel-fetch', { userId: 1 });
    console.log(`   Success: ${result2.success}, Duration: ${result2.duration}ms`);

    // 3. Fan-out
    console.log('\n3. Fan-Out:');
    orch2.registerAgent('processItem', async (item) => {
      return { ...item, processed: true, value: item.value * 2 };
    });

    orch2.createOrchestration('process-batch', {
      nodes: ['processItem'],
      strategy: 'fanout'
    });

    const items = [{ id: 1, value: 10 }, { id: 2, value: 20 }, { id: 3, value: 30 }];
    const result3 = await orch2.execute('process-batch', items);
    console.log(`   Processed: ${result3.data.length} items`);

    // 4. Fan-in
    console.log('\n4. Fan-In:');
    orch2.registerAgent('sum', async (data) => {
      return Array.isArray(data) ? data.reduce((a, b) => a + (b.value || b), 0) : 0;
    });
    orch2.registerAgent('count', async (data) => {
      return Array.isArray(data) ? data.length : 0;
    });

    orch2.createOrchestration('aggregate', {
      nodes: ['sum', 'count'],
      strategy: 'fanin'
    });

    const result4 = await orch2.execute('aggregate', [1, 2, 3, 4, 5]);
    console.log(`   Total: ${result4.data.results}`);

    // 5. Dynamic routing
    console.log('\n5. Dynamic Routing:');
    orch2.registerAgent('premiumHandler', async (data) => ({ ...data, tier: 'premium', processed: true }));
    orch2.registerAgent('standardHandler', async (data) => ({ ...data, tier: 'standard', processed: true }));

    const result5 = await orch2.executeWithRouting(
      { amount: 500, type: 'purchase' },
      [
        { agent: 'premiumHandler', condition: (d) => d.amount > 100 },
        { agent: 'standardHandler' }
      ]
    );
    console.log(`   Tier: ${result5.data.tier}`);

    // 6. Statistics
    console.log('\n6. Statistics:');
    const stats = orch2.getStats();
    console.log(`   Agents: ${stats.agents}`);
    console.log(`   Orchestrations: ${stats.orchestrations}`);
    console.log(`   Executed: ${stats.executed}`);
    console.log(`   Success: ${stats.success}`);
    console.log(`   Failed: ${stats.failed}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'fanout':
    console.log('Fan-Out Patterns:');
    console.log('  - Split data into chunks');
    console.log('  - Process chunks in parallel');
    console.log('  - Collect results');
    break;

  case 'routing':
    console.log('Dynamic Routing:');
    console.log('  - Route based on conditions');
    console.log('  - Conditional agent selection');
    console.log('  - Fallback routing');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-orchestration-2.js [demo|fanout|routing]');
}
