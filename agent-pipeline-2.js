/**
 * Agent Pipeline 2 - Advanced Pipeline Agent
 *
 * Manages advanced data pipeline workflows with branching, parallel execution, and error handling.
 *
 * Usage: node agent-pipeline-2.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   branches   - Show branching
 *   parallel   - Show parallel execution
 */

class PipelineStage {
  constructor(name, handler) {
    this.name = name;
    this.handler = handler;
    this.next = null;
    this.branches = [];
    this.errorHandler = null;
  }

  then(stage) {
    this.next = stage;
    return stage;
  }

  branch(condition, trueBranch, falseBranch = null) {
    this.branches.push({ condition, trueBranch, falseBranch });
    return this;
  }

  catch(handler) {
    this.errorHandler = handler;
    return this;
  }
}

class ParallelBranch {
  constructor(stages) {
    this.stages = stages;
    this.results = [];
  }

  async execute(input) {
    const promises = this.stages.map(stage => stage.execute(input));
    return Promise.all(promises);
  }
}

class Pipeline2Agent {
  constructor() {
    this.pipelines = [];
    this.stats = { executed: 0, success: 0, failed: 0 };
  }

  create(name) {
    const pipeline = {
      name,
      stages: [],
      first: null,
      last: null
    };
    this.pipelines.push(pipeline);
    return {
      add: (stageName, handler) => this.addStage(pipeline, stageName, handler),
      branch: (condition, trueBranch, falseBranch) => this.addBranch(pipeline, condition, trueBranch, falseBranch),
      execute: (input) => this.executePipeline(pipeline, input),
      parallel: (...stages) => this.addParallel(pipeline, stages)
    };
  }

  addStage(pipeline, stageName, handler) {
    const stage = new PipelineStage(stageName, handler);

    if (!pipeline.first) {
      pipeline.first = stage;
    }
    if (pipeline.last) {
      pipeline.last.next = stage;
    }
    pipeline.last = stage;
    pipeline.stages.push(stage);

    // Return a chainable object
    const chain = {
      then: (nextName, nextHandler) => {
        const nextStage = new PipelineStage(nextName, nextHandler);
        pipeline.last.next = nextStage;
        pipeline.last = nextStage;
        pipeline.stages.push(nextStage);
        return chain;
      },
      catch: (handler) => {
        stage.errorHandler = handler;
        return chain;
      },
      add: (nextName, nextHandler) => {
        const nextStage = new PipelineStage(nextName, nextHandler);
        pipeline.last.next = nextStage;
        pipeline.last = nextStage;
        pipeline.stages.push(nextStage);
        return chain;
      },
      execute: (input) => this.executePipeline(pipeline, input),
      parallel: (...stageConfigs) => {
        this.addParallel(pipeline, stageConfigs);
        return chain;
      }
    };
    return chain;
  }

  addBranch(pipeline, condition, trueBranch, falseBranch) {
    if (pipeline.last) {
      pipeline.last.branch({ condition, trueBranch, falseBranch });
    }
    return this;
  }

  addParallel(pipeline, stageConfigs) {
    const parallel = new ParallelBranch(stageConfigs.map(cfg => {
      const stage = new PipelineStage(cfg.name, cfg.handler);
      pipeline.stages.push(stage);
      return stage;
    }));
    if (pipeline.last) {
      pipeline.last.next = parallel;
    }
    return this;
  }

  async executePipeline(pipeline, input) {
    this.stats.executed++;

    let current = pipeline.first;
    let data = input;
    const results = [];

    try {
      while (current) {
        if (current instanceof ParallelBranch) {
          const parallelResults = await current.execute(data);
          results.push(...parallelResults);
        } else if (current.branches && current.branches.length > 0) {
          for (const branch of current.branches) {
            if (branch.condition(data)) {
              data = await branch.trueBranch.handler(data);
              if (branch.falseBranch) {
                await branch.falseBranch.handler(data);
              }
            }
          }
        } else {
          data = await current.handler(data);
          results.push({ stage: current.name, result: data });
        }
        current = current.next;
      }
      this.stats.success++;
      return { success: true, data, results };
    } catch (error) {
      this.stats.failed++;
      if (current && current.errorHandler) {
        return await current.errorHandler(error, data);
      }
      return { success: false, error: error.message, results };
    }
  }

  getStats() {
    return {
      ...this.stats,
      pipelines: this.pipelines.length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const pipeline2 = new Pipeline2Agent();

switch (command) {
  case 'demo':
    console.log('=== Agent Pipeline 2 Demo\n');

    // 1. Simple linear pipeline
    console.log('1. Linear Pipeline:');
    const linear = pipeline2.create('user-processing')
      .add('validate', async (data) => {
        console.log(`   Validating: ${data.email}`);
        return { ...data, validated: true };
      })
      .add('transform', async (data) => {
        console.log(`   Transforming: ${data.name}`);
        return { ...data, name: data.name.toUpperCase(), transformed: true };
      })
      .add('save', async (data) => {
        console.log(`   Saving: ${data.email}`);
        return { ...data, saved: true };
      });

    const result1 = await linear.execute({ name: 'john', email: 'john@example.com' });
    console.log(`   Result: ${result1.success}`);

    // 2. Pipeline with error handling
    console.log('\n2. Pipeline with Error Handling:');
    const withError = pipeline2.create('error-handling')
      .add('step1', async (data) => {
        console.log(`   Step 1: ${data.value}`);
        return { ...data, step1: 'done' };
      })
      .catch(async (error, data) => {
        console.log(`   Error caught: ${error.message}`);
        return { ...data, errorHandled: true, recovered: true };
      })
      .add('step2', async (data) => {
        if (data.shouldFail) throw new Error('Intentional failure');
        return { ...data, step2: 'done' };
      });

    const result2 = await withError.execute({ value: 'test', shouldFail: true });
    console.log(`   Recovered: ${result2.data?.recovered}`);

    // 3. Pipeline with branching
    console.log('\n3. Branching Pipeline:');
    const branching = pipeline2.create('branching')
      .add('classify', async (data) => {
        const type = data.amount > 100 ? 'high' : 'low';
        return { ...data, type };
      });

    const branchConfig = {
      condition: (data) => data.type === 'high',
      trueBranch: {
        handler: async (data) => {
          console.log(`   High value: ${data.amount}`);
          return { ...data, priority: 'high' };
        }
      },
      falseBranch: {
        handler: async (data) => {
          console.log(`   Low value: ${data.amount}`);
          return { ...data, priority: 'low' };
        }
      }
    };

    const result3a = await pipeline2.executePipeline(
      { ...branching, first: { ...branching.first, handler: async (d) => d }, last: { branches: [branchConfig] } },
      { amount: 150 }
    );

    // 4. Parallel execution
    console.log('\n4. Parallel Execution:');
    const parallel = pipeline2.create('parallel')
      .add('fetch', async (data) => data)
      .parallel(
        { name: 'process1', handler: async (d) => { await new Promise(r => setTimeout(r, 10)); return { ...d, p1: true }; }},
        { name: 'process2', handler: async (d) => { await new Promise(r => setTimeout(r, 10)); return { ...d, p2: true }; }},
        { name: 'process3', handler: async (d) => { await new Promise(r => setTimeout(r, 10)); return { ...d, p3: true }; }}
      );

    const result4 = await parallel.execute({ id: 1 });
    console.log(`   Parallel results: ${result4.results?.length || 0}`);

    // 5. Statistics
    console.log('\n5. Statistics:');
    const stats = pipeline2.getStats();
    console.log(`   Pipelines: ${stats.pipelines}`);
    console.log(`   Executed: ${stats.executed}`);
    console.log(`   Success: ${stats.success}`);
    console.log(`   Failed: ${stats.failed}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'branches':
    console.log('Branching Options:');
    console.log('  - Conditional branches (if/else)');
    console.log('  - Multiple branch conditions');
    console.log('  - Fan-out/fan-in patterns');
    break;

  case 'parallel':
    console.log('Parallel Execution:');
    console.log('  - Run multiple stages concurrently');
    console.log('  - Wait for all to complete');
    console.log('  - Aggregate results');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-pipeline-2.js [demo|branches|parallel]');
}
