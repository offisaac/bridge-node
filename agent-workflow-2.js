/**
 * Agent Workflow 2 - Advanced Workflow Engine
 *
 * Advanced workflow automation with state machines, checkpoints, and compensation.
 *
 * Usage: node agent-workflow-2.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   checkpoints - Show checkpoint features
 *   compensate - Show compensation patterns
 */

class WorkflowState {
  constructor(workflow) {
    this.workflow = workflow;
    this.currentStep = 0;
    this.data = {};
    this.status = 'pending'; // pending, running, paused, completed, failed, compensating
    this.history = [];
    this.checkpoints = [];
  }

  checkpoint(name) {
    this.checkpoints.push({
      name,
      step: this.currentStep,
      data: JSON.parse(JSON.stringify(this.data)),
      timestamp: Date.now()
    });
  }

  restore(checkpoint) {
    this.currentStep = checkpoint.step;
    this.data = JSON.parse(JSON.stringify(checkpoint.data));
  }
}

class Compensation {
  constructor() {
    this.stack = [];
  }

  add(action, rollback) {
    this.stack.push({ action, rollback });
  }

  async execute() {
    const errors = [];
    while (this.stack.length > 0) {
      const { action, rollback } = this.stack.pop();
      try {
        if (rollback) await rollback();
        console.log(`   Compensated: ${action}`);
      } catch (e) {
        errors.push({ action, error: e.message });
      }
    }
    return errors;
  }
}

class WorkflowStep {
  constructor(name, handler, compensation = null) {
    this.name = name;
    this.handler = handler;
    this.compensation = compensation;
    this.retryable = false;
    this.maxRetries = 0;
    this.timeout = 0;
  }

  withRetry(maxRetries) {
    this.retryable = true;
    this.maxRetries = maxRetries;
    return this;
  }

  withTimeout(ms) {
    this.timeout = ms;
    return this;
  }

  withCompensation(compensation) {
    this.compensation = compensation;
    return this;
  }
}

class Workflow2Agent {
  constructor() {
    this.workflows = new Map();
    this.activeInstances = new Map();
    this.stats = { created: 0, completed: 0, failed: 0, compensated: 0 };
  }

  define(name, steps) {
    this.workflows.set(name, {
      name,
      steps: steps.map(s => s instanceof WorkflowStep ? s : new WorkflowStep(s.name, s.handler, s.compensation))
    });
    return this;
  }

  async execute(name, input = {}) {
    const workflow = this.workflows.get(name);
    if (!workflow) throw new Error(`Workflow ${name} not found`);

    const instanceId = `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const state = new WorkflowState(workflow);
    state.data = { ...input };
    state.status = 'running';

    this.activeInstances.set(instanceId, state);
    this.stats.created++;

    const compensation = new Compensation();

    try {
      for (let i = 0; i < workflow.steps.length; i++) {
        state.currentStep = i;
        const step = workflow.steps[i];

        console.log(`   Step ${i + 1}: ${step.name}`);

        // Execute step with retry
        let retries = 0;
        let success = false;

        while (!success && retries <= step.maxRetries) {
          try {
            if (step.timeout > 0) {
              state.data = await this._timeout(step.handler(state.data), step.timeout);
            } else {
              state.data = await step.handler(state.data);
            }
            success = true;
          } catch (e) {
            if (!step.retryable || retries >= step.maxRetries) throw e;
            retries++;
            console.log(`   Retry ${retries}/${step.maxRetries} for ${step.name}`);
          }
        }

        // Record history
        state.history.push({
          step: step.name,
          timestamp: Date.now(),
          data: JSON.parse(JSON.stringify(state.data))
        });

        // Add compensation if step fails
        if (step.compensation) {
          compensation.add(step.name, () => step.compensation(state.data));
        }
      }

      state.status = 'completed';
      this.stats.completed++;
      return { instanceId, status: 'completed', data: state.data };
    } catch (error) {
      state.status = 'failed';
      this.stats.failed++;

      // Run compensation
      console.log(`   Running compensation...`);
      const errors = await compensation.execute();
      this.stats.compensated++;

      return {
        instanceId,
        status: 'failed',
        error: error.message,
        compensationErrors: errors,
        data: state.data
      };
    }
  }

  async _timeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), ms))
    ]);
  }

  checkpoint(instanceId, name) {
    const state = this.activeInstances.get(instanceId);
    if (!state) throw new Error(`Instance ${instanceId} not found`);
    state.checkpoint(name);
    return state.checkpoints.length;
  }

  async resume(instanceId) {
    const state = this.activeInstances.get(instanceId);
    if (!state) throw new Error(`Instance ${instanceId} not found`);
    if (state.status !== 'paused') throw new Error('Can only resume paused workflows');

    const workflow = state.workflow;
    state.status = 'running';

    try {
      for (let i = state.currentStep; i < workflow.steps.length; i++) {
        state.currentStep = i;
        const step = workflow.steps[i];
        console.log(`   Resuming at Step ${i + 1}: ${step.name}`);
        state.data = await step.handler(state.data);
      }
      state.status = 'completed';
      this.stats.completed++;
      return { instanceId, status: 'completed', data: state.data };
    } catch (error) {
      state.status = 'failed';
      return { instanceId, status: 'failed', error: error.message };
    }
  }

  getStats() {
    return { ...this.stats, active: this.activeInstances.size };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const workflow2 = new Workflow2Agent();

switch (command) {
  case 'demo':
    console.log('=== Agent Workflow 2 Demo\n');

    // 1. Simple workflow
    console.log('1. Simple Workflow:');
    const simple = workflow2.define('order-processing', [
      new WorkflowStep('validate', async (data) => {
        console.log(`      Validating order: ${data.orderId}`);
        return { ...data, validated: true };
      }),
      new WorkflowStep('process', async (data) => {
        console.log(`      Processing order: ${data.orderId}`);
        return { ...data, processed: true };
      }),
      new WorkflowStep('complete', async (data) => {
        console.log(`      Completing order: ${data.orderId}`);
        return { ...data, completed: true };
      })
    ]);

    const result1 = await workflow2.execute('order-processing', { orderId: 'ORD-001' });
    console.log(`   Status: ${result1.status}`);

    // 2. Workflow with compensation
    console.log('\n2. Workflow with Compensation:');
    const withComp = workflow2.define('payment-flow', [
      new WorkflowStep('charge', async (data) => {
        console.log(`      Charging: $${data.amount}`);
        return { ...data, charged: true };
      }, async (data) => {
        console.log(`      Refunding: $${data.amount}`);
      }),
      new WorkflowStep('reserve', async (data) => {
        console.log(`      Reserving inventory`);
        return { ...data, reserved: true };
      }, async (data) => {
        console.log(`      Releasing inventory`);
      }),
      new WorkflowStep('notify', async (data) => {
        console.log(`      Sending notification`);
        return { ...data, notified: true };
      })
    ]);

    const result2 = await workflow2.execute('payment-flow', { amount: 100, orderId: 'ORD-002' });
    console.log(`   Status: ${result2.status}`);

    // 3. Workflow with retry
    console.log('\n3. Workflow with Retry:');
    const withRetry = workflow2.define('api-call', [
      new WorkflowStep('call-api', async (data) => {
        if (data.shouldFail) throw new Error('API Error');
        console.log(`      API call successful`);
        return { ...data, apiCalled: true };
      }).withRetry(3)
    ]);

    const result3a = await workflow2.execute('api-call', { shouldFail: false });
    console.log(`   Without failure: ${result3a.status}`);

    const result3b = await workflow2.execute('api-call', { shouldFail: true });
    console.log(`   With failure: ${result3b.status}`);

    // 4. Checkpoint and resume
    console.log('\n4. Checkpoint and Resume:');
    const checkpoint = workflow2.define('long-running', [
      new WorkflowStep('step1', async (data) => ({ ...data, step1: true })),
      new WorkflowStep('step2', async (data) => ({ ...data, step2: true })),
      new WorkflowStep('step3', async (data) => ({ ...data, step3: true }))
    ]);

    const result4 = await workflow2.execute('long-running', { taskId: 'TASK-001' });
    workflow2.checkpoint(result4.instanceId, 'mid-point');
    console.log(`   Checkpoints: ${workflow2.activeInstances.get(result4.instanceId)?.checkpoints.length}`);

    // 5. Statistics
    console.log('\n5. Statistics:');
    const stats = workflow2.getStats();
    console.log(`   Created: ${stats.created}`);
    console.log(`   Completed: ${stats.completed}`);
    console.log(`   Failed: ${stats.failed}`);
    console.log(`   Compensated: ${stats.compensated}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'checkpoints':
    console.log('Checkpoint Features:');
    console.log('  - Save workflow state at any point');
    console.log('  - Resume from checkpoint');
    console.log('  - View checkpoint history');
    break;

  case 'compensate':
    console.log('Compensation Patterns:');
    console.log('  - SAGA pattern for distributed transactions');
    console.log('  - Reverse order execution');
    console.log('  - Best-effort compensation');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-workflow-2.js [demo|checkpoints|compensate]');
}
