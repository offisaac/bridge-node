/**
 * Agent Pipeline Module
 *
 * Provides agent processing pipeline builder with stages and middleware.
 * Usage: node agent-pipeline.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   run <pipeline> <input> Run pipeline with input
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const PIPELINE_DB = path.join(DATA_DIR, 'pipelines.json');

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
 * Pipeline Stage
 */
class PipelineStage {
  constructor(name, handler, options = {}) {
    this.name = name;
    this.handler = handler;
    this.options = {
      timeout: options.timeout || 30000,
      retry: options.retry || 0,
      parallel: options.parallel || false,
      condition: options.condition || null
    };
    this.middleware = [];
  }

  use(middlewareFn) {
    this.middleware.push(middlewareFn);
    return this;
  }

  async execute(context) {
    // Run middleware chain
    let idx = 0;
    const next = async () => {
      if (idx >= this.middleware.length) {
        return this.handler(context);
      }
      const fn = this.middleware[idx++];
      return fn(context, next);
    };

    return next();
  }

  async executeWithRetry(context) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.options.retry; attempt++) {
      try {
        return await this.execute(context);
      } catch (error) {
        lastError = error;
        if (attempt < this.options.retry) {
          await new Promise(r => setTimeout(r, 100 * (attempt + 1)));
        }
      }
    }

    throw lastError;
  }
}

/**
 * Pipeline Middleware
 */
const middleware = {
  // Logging middleware
  logger: (context, next) => {
    console.log(`  [${context.stage}] Processing:`, context.input?.id || 'unknown');
    return next().then(result => {
      console.log(`  [${context.stage}] Completed`);
      return result;
    });
  },

  // Timing middleware
  timer: async (context, next) => {
    const start = Date.now();
    const result = await next();
    context.timing = context.timing || {};
    context.timing[context.stage] = Date.now() - start;
    return result;
  },

  // Validation middleware
  validator: (schema) => (context, next) => {
    if (schema) {
      // Simple validation check
      for (const [key, type] of Object.entries(schema)) {
        if (context.input[key] === undefined) {
          throw new Error(`Missing required field: ${key}`);
        }
      }
    }
    return next();
  },

  // Error handler middleware
  errorHandler: (handler) => async (context, next) => {
    try {
      return await next();
    } catch (error) {
      context.error = error;
      if (handler) {
        return handler(error, context);
      }
      throw error;
    }
  },

  // Transform middleware
  transform: (transformFn) => async (context, next) => {
    const result = await next();
    return transformFn(result, context);
  }
};

/**
 * Pipeline
 */
class Pipeline {
  constructor(name) {
    this.name = name;
    this.stages = [];
    this.middleware = [];
    this.errorHandlers = [];
  }

  stage(name, handler, options = {}) {
    const stage = new PipelineStage(name, handler, options);
    this.stages.push(stage);
    return stage;
  }

  use(middlewareFn) {
    this.middleware.push(middlewareFn);
    return this;
  }

  error(handler) {
    this.errorHandlers.push(handler);
    return this;
  }

  async execute(input, context = {}) {
    const ctx = {
      ...context,
      input,
      output: null,
      errors: [],
      timing: {},
      stage: 'init'
    };

    // Run global middleware
    let idx = 0;
    const next = async () => {
      if (idx >= this.stages.length) {
        return ctx.output;
      }

      const stage = this.stages[idx++];
      ctx.stage = stage.name;

      // Check condition
      if (stage.options.condition && !stage.options.condition(ctx)) {
        return next();
      }

      try {
        ctx.output = await stage.executeWithRetry(ctx);
        return next();
      } catch (error) {
        ctx.errors.push({ stage: stage.name, error: error.message });

        // Run error handlers
        for (const handler of this.errorHandlers) {
          const handled = handler(error, ctx);
          if (handled !== undefined) {
            ctx.output = handled;
            return next();
          }
        }

        throw error;
      }
    };

    // Run pipeline middleware first
    for (const mw of this.middleware) {
      await mw(ctx, next);
    }

    return next();
  }

  async executeParallel(inputs, context = {}) {
    const promises = inputs.map(input => this.execute(input, context));
    return Promise.all(promises);
  }

  getStages() {
    return this.stages.map(s => s.name);
  }
}

/**
 * Pipeline Builder
 */
class PipelineBuilder {
  constructor() {
    this.pipelines = new Map();
    this.state = loadJSON(PIPELINE_DB, { pipelines: {} });
  }

  create(name) {
    const pipeline = new Pipeline(name);
    this.pipelines.set(name, pipeline);
    return pipeline;
  }

  get(name) {
    return this.pipelines.get(name);
  }

  list() {
    return Array.from(this.pipelines.keys());
  }

  delete(name) {
    return this.pipelines.delete(name);
  }

  // Pre-built pipelines
  createDataProcessingPipeline() {
    const pipeline = this.create('data-processing');

    pipeline.stage('validate', async (ctx) => {
      // Validate input data
      if (!ctx.input.data) {
        throw new Error('No data provided');
      }
      return { validated: true, data: ctx.input.data };
    });

    pipeline.stage('transform', async (ctx) => {
      // Transform data
      const data = ctx.output.data;
      return { ...ctx.output, transformed: data.toUpperCase() };
    });

    pipeline.stage('enrich', async (ctx) => {
      // Enrich with metadata
      return {
        ...ctx.output,
        enriched: true,
        metadata: { processedAt: Date.now() }
      };
    });

    pipeline.stage('save', async (ctx) => {
      // Save result
      return { ...ctx.output, saved: true };
    });

    return pipeline;
  }

  createAgentWorkflowPipeline() {
    const pipeline = this.create('agent-workflow');

    pipeline.stage('receive', async (ctx) => {
      return { task: ctx.input.task, receivedAt: Date.now() };
    });

    pipeline.stage('analyze', async (ctx) => {
      return { ...ctx.output, analysis: 'analyzed' };
    });

    pipeline.stage('execute', async (ctx) => {
      return { ...ctx.output, result: 'executed' };
    });

    pipeline.stage('respond', async (ctx) => {
      return { ...ctx.output, response: 'complete' };
    });

    return pipeline;
  }

  save() {
    const pipelinesState = {};
    for (const [name, pipeline] of this.pipelines) {
      pipelinesState[name] = {
        stages: pipeline.getStages()
      };
    }
    this.state = { pipelines: pipelinesState };
    saveJSON(PIPELINE_DB, this.state);
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Pipeline Demo ===\n');

  const builder = new PipelineBuilder();

  // Show pipeline types
  console.log('1. Creating Pipelines:');

  // Data processing pipeline
  const dataPipeline = builder.createDataProcessingPipeline();
  console.log(`   Created: data-processing`);
  console.log(`   Stages: ${dataPipeline.getStages().join(' -> ')}`);

  // Agent workflow pipeline
  const agentPipeline = builder.createAgentWorkflowPipeline();
  console.log(`   Created: agent-workflow`);
  console.log(`   Stages: ${agentPipeline.getStages().join(' -> ')}`);

  // Custom pipeline with middleware
  console.log('\n2. Custom Pipeline with Middleware:');
  const customPipeline = builder.create('custom');
  customPipeline.use(middleware.logger);
  customPipeline.use(middleware.timer);
  customPipeline.stage('prepare', async (ctx) => {
    return { prepared: true };
  });
  customPipeline.stage('process', async (ctx) => {
    return { ...ctx.output, processed: true };
  });
  customPipeline.stage('finalize', async (ctx) => {
    return { ...ctx.output, finalized: true };
  });

  console.log(`   Created: custom`);
  console.log(`   Stages: ${customPipeline.getStages().join(' -> ')}`);

  // Run data processing pipeline
  console.log('\n3. Running Data Processing Pipeline:');
  const dataResult = await dataPipeline.execute({ data: 'hello world' });
  console.log(`   Result:`, JSON.stringify(dataResult));

  // Run agent workflow pipeline
  console.log('\n4. Running Agent Workflow Pipeline:');
  const agentResult = await agentPipeline.execute({ task: 'process-request' });
  console.log(`   Result:`, JSON.stringify(agentResult));

  // Run custom pipeline
  console.log('\n5. Running Custom Pipeline:');
  const customResult = await customPipeline.execute({ value: 42 });
  console.log(`   Result:`, JSON.stringify(customResult));
  console.log(`   Timing:`, JSON.stringify(customResult.timing));

  // Parallel execution
  console.log('\n6. Parallel Execution:');
  const inputs = [
    { data: 'item1' },
    { data: 'item2' },
    { data: 'item3' }
  ];
  const parallelResults = await dataPipeline.executeParallel(inputs);
  console.log(`   Processed ${parallelResults.length} items in parallel`);

  // Error handling
  console.log('\n7. Error Handling:');
  const errorPipeline = builder.create('error-test');
  errorPipeline.stage('step1', async (ctx) => ({ step1: 'ok' }));
  errorPipeline.stage('step2', async (ctx) => {
    throw new Error('Intentional error');
  });
  errorPipeline.stage('step3', async (ctx) => ({ step3: 'ok' }));
  errorPipeline.error((err, ctx) => {
    console.log(`   Error caught: ${err.message}`);
    return { recovered: true, error: err.message };
  });

  try {
    const errorResult = await errorPipeline.execute({});
    console.log(`   Recovered:`, JSON.stringify(errorResult));
  } catch (e) {
    console.log(`   Pipeline failed: ${e.message}`);
  }

  // Pipeline list
  console.log('\n8. Pipeline Registry:');
  const pipelineList = builder.list();
  console.log(`   Available: ${pipelineList.join(', ')}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'run') {
  const builder = new PipelineBuilder();
  builder.createDataProcessingPipeline();
  const pipeline = builder.get(args[1]);
  if (pipeline) {
    const input = args[2] ? JSON.parse(args[2]) : {};
    pipeline.execute(input).then(r => console.log(JSON.stringify(r, null, 2)));
  } else {
    console.log(`Pipeline ${args[1]} not found`);
  }
} else {
  console.log('Agent Pipeline Module');
  console.log('Usage: node agent-pipeline.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  run <pipeline> <input>  Run pipeline with input');
}
