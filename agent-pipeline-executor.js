/**
 * Agent Pipeline Executor
 * Pipeline execution orchestration for Universal-Narrator-Core
 */

const crypto = require('crypto');

class AgentPipelineExecutor {
  constructor(options = {}) {
    this.pipelines = new Map();
    this.executions = new Map();
    this.stages = new Map();

    this.config = {
      maxConcurrent: options.maxConcurrent || 5,
      defaultTimeout: options.defaultTimeout || 300000, // 5 minutes
      enableRollback: options.enableRollback !== false,
      retryFailed: options.retryFailed || false,
      maxRetries: options.maxRetries || 3
    };

    this.stats = {
      totalExecuted: 0,
      totalSucceeded: 0,
      totalFailed: 0,
      totalRolledBack: 0
    };

    // Initialize default stages
    this._initDefaultStages();

    // Start execution monitor
    this._startExecutionMonitor();
  }

  _initDefaultStages() {
    const defaultStages = [
      { name: 'validate', handler: 'validateHandler', timeout: 30000 },
      { name: 'prepare', handler: 'prepareHandler', timeout: 60000 },
      { name: 'execute', handler: 'executeHandler', timeout: 300000 },
      { name: 'verify', handler: 'verifyHandler', timeout: 60000 },
      { name: 'complete', handler: 'completeHandler', timeout: 30000 }
    ];

    defaultStages.forEach(stage => this.registerStage(stage));
  }

  _startExecutionMonitor() {
    this.monitorTimer = setInterval(() => {
      this._checkTimeouts();
    }, 5000);
  }

  _checkTimeouts() {
    const now = Date.now();

    for (const [execId, execution] of this.executions) {
      if (execution.status === 'running') {
        if (now - execution.startedAt > this.config.defaultTimeout) {
          this._failExecution(execution, 'Timeout exceeded');
        }
      }
    }
  }

  registerStage(stageConfig) {
    const { name, handler, timeout } = stageConfig;

    const stage = {
      id: `stage-${name}`,
      name,
      handler: handler || `${name}Handler`,
      timeout: timeout || 30000,
      config: stageConfig.config || {},
      createdAt: new Date().toISOString()
    };

    this.stages.set(name, stage);
    console.log(`Pipeline stage registered: ${stage.name} (timeout: ${stage.timeout}ms)`);
    return stage;
  }

  getStage(name) {
    const stage = this.stages.get(name);
    if (!stage) {
      throw new Error(`Stage not found: ${name}`);
    }
    return stage;
  }

  listStages() {
    return Array.from(this.stages.values()).map(s => ({
      id: s.id,
      name: s.name,
      handler: s.handler,
      timeout: s.timeout
    }));
  }

  createPipeline(pipelineConfig) {
    const { name, stages, config } = pipelineConfig;

    const pipeline = {
      id: `pipeline-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      stages: stages || ['validate', 'prepare', 'execute', 'verify', 'complete'],
      config: config || {},
      enabled: pipelineConfig.enabled !== false,
      createdAt: new Date().toISOString()
    };

    // Validate stages exist
    pipeline.stages.forEach(stageName => {
      if (!this.stages.has(stageName)) {
        throw new Error(`Unknown stage: ${stageName}`);
      }
    });

    this.pipelines.set(name, pipeline);
    console.log(`Pipeline created: ${pipeline.name} (${pipeline.stages.length} stages)`);
    return pipeline;
  }

  getPipeline(name) {
    const pipeline = this.pipelines.get(name);
    if (!pipeline) {
      throw new Error(`Pipeline not found: ${name}`);
    }
    return pipeline;
  }

  listPipelines() {
    return Array.from(this.pipelines.values()).map(p => ({
      id: p.id,
      name: p.name,
      stages: p.stages,
      enabled: p.enabled
    }));
  }

  async executePipeline(pipelineName, input, options = {}) {
    const pipeline = this.getPipeline(pipelineName);

    const execution = {
      id: `exec-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      pipelineId: pipeline.id,
      pipelineName: pipeline.name,
      input,
      output: null,
      stageResults: [],
      status: 'pending',
      startedAt: null,
      completedAt: null,
      duration: 0,
      error: null,
      options
    };

    this.executions.set(execution.id, execution);
    this.stats.totalExecuted++;

    // Run execution asynchronously
    this._runExecution(execution);

    return {
      executionId: execution.id,
      status: execution.status
    };
  }

  async _runExecution(execution) {
    const pipeline = this.pipelines.get(execution.pipelineName);
    execution.status = 'running';
    execution.startedAt = Date.now();

    console.log(`[${execution.pipelineName}] Starting execution ${execution.id}`);

    let currentData = execution.input;

    try {
      for (const stageName of pipeline.stages) {
        const stage = this.stages.get(stageName);
        console.log(`[${execution.pipelineName}] Running stage: ${stageName}`);

        const stageResult = await this._executeStage(stage, currentData, execution);
        execution.stageResults.push(stageResult);

        if (!stageResult.success) {
          throw new Error(`Stage ${stageName} failed: ${stageResult.error}`);
        }

        currentData = stageResult.output;
      }

      execution.output = currentData;
      execution.status = 'completed';
      execution.completedAt = Date.now();
      execution.duration = execution.completedAt - execution.startedAt;
      this.stats.totalSucceeded++;

      console.log(`[${execution.pipelineName}] Execution ${execution.id} completed in ${execution.duration}ms`);

    } catch (error) {
      this._failExecution(execution, error.message);

      if (this.config.enableRollback && execution.options.rollbackOnFailure) {
        await this._rollbackExecution(execution);
      }
    }
  }

  async _executeStage(stage, input, execution) {
    const startTime = Date.now();

    try {
      // Simulate stage execution
      const output = await this._simulateStageHandler(stage, input, execution);

      return {
        stage: stage.name,
        success: true,
        output,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        stage: stage.name,
        success: false,
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      };
    }
  }

  async _simulateStageHandler(stage, input, execution) {
    // Simulate processing time based on stage
    const delay = Math.min(stage.timeout / 10, 100);
    await new Promise(resolve => setTimeout(resolve, delay));

    // Return modified input based on stage
    return {
      ...input,
      [`${stage.name}Output`]: true,
      stage: stage.name,
      executionId: execution.id
    };
  }

  _failExecution(execution, error) {
    execution.status = 'failed';
    execution.error = error;
    execution.completedAt = Date.now();
    execution.duration = execution.completedAt - execution.startedAt;
    this.stats.totalFailed++;

    console.log(`[${execution.pipelineName}] Execution ${execution.id} failed: ${error}`);
  }

  async _rollbackExecution(execution) {
    console.log(`[${execution.pipelineName}] Rolling back execution ${execution.id}`);

    // Rollback in reverse order
    for (let i = execution.stageResults.length - 1; i >= 0; i--) {
      const result = execution.stageResults[i];
      if (result.success) {
        console.log(`[${execution.pipelineName}] Rolling back stage: ${result.stage}`);
        // Simulate rollback
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    this.stats.totalRolledBack++;
    console.log(`[${execution.pipelineName}] Rollback complete for ${execution.id}`);
  }

  getExecution(executionId) {
    return this.executions.get(executionId);
  }

  listExecutions(filter) {
    let executions = Array.from(this.executions.values());

    if (filter) {
      if (filter.pipelineName) {
        executions = executions.filter(e => e.pipelineName === filter.pipelineName);
      }
      if (filter.status) {
        executions = executions.filter(e => e.status === filter.status);
      }
    }

    return executions;
  }

  cancelExecution(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status !== 'running') {
      throw new Error(`Cannot cancel execution in status: ${execution.status}`);
    }

    execution.status = 'cancelled';
    execution.completedAt = Date.now();
    execution.duration = execution.completedAt - execution.startedAt;

    console.log(`[${execution.pipelineName}] Execution ${executionId} cancelled`);
    return execution;
  }

  retryExecution(executionId) {
    const execution = this.executions.get(executionId);
    if (!execution) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    if (execution.status !== 'failed') {
      throw new Error(`Can only retry failed executions`);
    }

    return this.executePipeline(execution.pipelineName, execution.input, execution.options);
  }

  getStatistics() {
    const byStatus = {};
    for (const e of this.executions.values()) {
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    }

    return {
      totalExecuted: this.stats.totalExecuted,
      succeeded: this.stats.totalSucceeded,
      failed: this.stats.totalFailed,
      rolledBack: this.stats.totalRolledBack,
      byStatus
    };
  }

  shutdown() {
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
    }
    console.log('Pipeline executor shut down');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const executor = new AgentPipelineExecutor({
    maxConcurrent: 5,
    defaultTimeout: 60000,
    enableRollback: true
  });

  switch (command) {
    case 'list-stages':
      const stages = executor.listStages();
      console.log('Pipeline Stages:');
      stages.forEach(s => console.log(`  - ${s.name}: ${s.handler} (${s.timeout}ms)`));
      break;

    case 'list-pipelines':
      const pipelines = executor.listPipelines();
      console.log('Pipelines:');
      pipelines.forEach(p => console.log(`  - ${p.name}: ${p.stages.join(' -> ')}`));
      break;

    case 'create-pipeline':
      const newPipeline = executor.createPipeline({
        name: args[1] || 'custom-pipeline',
        stages: args[2] ? args[2].split(',') : ['validate', 'execute', 'complete']
      });
      console.log('Pipeline created:', newPipeline.name);
      break;

    case 'execute':
      const execResult = await executor.executePipeline(args[1] || 'default', {
        data: 'test-input',
        timestamp: Date.now()
      });
      console.log('Execution started:', execResult);
      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 500));
      const completed = executor.getExecution(execResult.executionId);
      console.log('Execution completed:', completed.status);
      break;

    case 'list-executions':
      const executions = executor.listExecutions(
        args[1] ? { status: args[1] } : undefined
      );
      console.log('Executions:');
      executions.slice(-10).forEach(e => console.log(`  - [${e.status}] ${e.pipelineName} (${e.duration}ms)`));
      break;

    case 'stats':
      const stats = executor.getStatistics();
      console.log('Pipeline Statistics:', stats);
      break;

    case 'demo':
      console.log('=== Agent Pipeline Executor Demo ===\n');

      // List stages
      console.log('1. Pipeline Stages:');
      const stageList = executor.listStages();
      stageList.forEach(s => {
        console.log(`   - ${s.name}: ${s.handler} (timeout: ${s.timeout}ms)`);
      });

      // Create custom pipeline
      console.log('\n2. Creating Custom Pipeline:');
      const customPipeline = executor.createPipeline({
        name: 'narrator-pipeline',
        stages: ['validate', 'prepare', 'execute', 'verify', 'complete'],
        config: { parallel: false }
      });
      console.log(`   Created: ${customPipeline.name} with ${customPipeline.stages.length} stages`);

      // Also create a default pipeline
      const defaultPipeline = executor.createPipeline({
        name: 'default',
        stages: ['validate', 'execute', 'complete'],
        config: {}
      });
      console.log(`   Created: ${defaultPipeline.name} with ${defaultPipeline.stages.length} stages`);

      // Execute pipelines
      console.log('\n3. Executing Pipelines:');

      // Default pipeline
      console.log('\n   Executing default pipeline...');
      const defaultExec = await executor.executePipeline('default', {
        sessionId: 'session-001',
        data: 'test-data'
      }, { rollbackOnFailure: true });
      console.log(`   Execution ID: ${defaultExec.executionId}`);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 300));

      const defaultResult = executor.getExecution(defaultExec.executionId);
      console.log(`   Status: ${defaultResult.status}, Duration: ${defaultResult.duration}ms`);

      // Narrator pipeline
      console.log('\n   Executing narrator-pipeline...');
      const narratorExec = await executor.executePipeline('narrator-pipeline', {
        narrativeId: 'narrative-001',
        content: 'Story content'
      });
      console.log(`   Execution ID: ${narratorExec.executionId}`);

      await new Promise(resolve => setTimeout(resolve, 300));

      const narratorResult = executor.getExecution(narratorExec.executionId);
      console.log(`   Status: ${narratorResult.status}, Duration: ${narratorResult.duration}ms`);
      console.log(`   Stages completed: ${narratorResult.stageResults.filter(r => r.success).length}/${narratorResult.stageResults.length}`);

      // List executions
      console.log('\n4. Recent Executions:');
      const recentExecs = executor.listExecutions();
      recentExecs.slice(-5).forEach(e => {
        console.log(`   - [${e.status}] ${e.pipelineName}: ${e.duration}ms`);
      });

      // Statistics
      console.log('\n5. Statistics:');
      const finalStats = executor.getStatistics();
      console.log(`   Total executed: ${finalStats.totalExecuted}`);
      console.log(`   Succeeded: ${finalStats.succeeded}`);
      console.log(`   Failed: ${finalStats.failed}`);
      console.log(`   Rolled back: ${finalStats.rolledBack}`);
      console.log(`   By status:`, finalStats.byStatus);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-pipeline-executor.js <command> [args]');
      console.log('\nCommands:');
      console.log('  list-stages              List pipeline stages');
      console.log('  list-pipelines           List pipelines');
      console.log('  create-pipeline <name>   Create new pipeline');
      console.log('  execute <pipeline>       Execute pipeline');
      console.log('  list-executions [status] List executions');
      console.log('  stats                    Get statistics');
      console.log('  demo                     Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentPipelineExecutor;
