/**
 * Agent Automation - Automation Workflow Agent
 *
 * Manages automation workflows, triggers, actions, and process orchestration.
 *
 * Usage: node agent-automation.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   create  - Create workflow
 *   list    - List workflows
 */

class AutomationWorkflow {
  constructor(config) {
    this.id = `workflow-${Date.now()}`;
    this.name = config.name;
    this.description = config.description || '';
    this.status = 'inactive'; // active, inactive, running, paused, error
    this.triggers = [];
    this.actions = [];
    this.conditions = config.conditions || [];
    this.schedule = config.schedule || null;
    this.lastRun = null;
    this.nextRun = null;
    this.runCount = 0;
    this.successCount = 0;
    this.failureCount = 0;
    this.createdAt = Date.now();
  }

  addTrigger(trigger) {
    this.triggers.push(trigger);
  }

  addAction(action) {
    this.actions.push(action);
  }

  activate() {
    this.status = 'active';
  }

  deactivate() {
    this.status = 'inactive';
  }

  start() {
    this.status = 'running';
    this.lastRun = Date.now();
    this.runCount++;
  }

  pause() {
    this.status = 'paused';
  }

  resume() {
    this.status = 'running';
  }

  complete(success) {
    this.status = 'active';
    if (success) {
      this.successCount++;
    } else {
      this.failureCount++;
    }
  }
}

class Trigger {
  constructor(config) {
    this.id = `trigger-${Date.now()}`;
    this.type = config.type; // schedule, event, webhook, sensor, manual
    this.condition = config.condition || {};
    this.config = config.config || {};
  }

  evaluate(context) {
    switch (this.type) {
      case 'schedule':
        return this.evaluateSchedule(context);
      case 'event':
        return this.evaluateEvent(context);
      case 'sensor':
        return this.evaluateSensor(context);
      default:
        return false;
    }
  }

  evaluateSchedule(context) {
    const now = new Date();
    const { cron, interval } = this.config;
    // Simplified schedule evaluation
    return true;
  }

  evaluateEvent(context) {
    const { eventType, conditions } = this.config;
    return context.eventType === eventType;
  }

  evaluateSensor(context) {
    const { sensorId, threshold, operator } = this.config;
    const value = context.sensorValues?.[sensorId];
    if (value === undefined) return false;

    switch (operator) {
      case '>': return value > threshold;
      case '<': return value < threshold;
      case '>=': return value >= threshold;
      case '<=': return value <= threshold;
      case '==': return value === threshold;
      default: return false;
    }
  }
}

class Action {
  constructor(config) {
    this.id = `action-${Date.now()}`;
    this.type = config.type; // http, notify, transform, delay, condition, loop
    this.config = config.config || {};
    this.status = 'pending'; // pending, running, completed, failed, skipped
    this.result = null;
  }

  async execute(context) {
    this.status = 'running';
    console.log(`   Executing action: ${this.type}`);

    switch (this.type) {
      case 'http':
        return this.executeHttp(context);
      case 'notify':
        return this.executeNotify(context);
      case 'transform':
        return this.executeTransform(context);
      case 'delay':
        return this.executeDelay(context);
      default:
        return { success: true };
    }
  }

  executeHttp(context) {
    const { method, url, body } = this.config;
    // Simulated HTTP request
    console.log(`   HTTP ${method} ${url}`);
    this.status = 'completed';
    return { success: true, statusCode: 200 };
  }

  executeNotify(context) {
    const { channel, message } = this.config;
    console.log(`   Sending notification to ${channel}: ${message}`);
    this.status = 'completed';
    return { success: true };
  }

  executeTransform(context) {
    const { mapping } = this.config;
    this.status = 'completed';
    return { success: true, transformed: context };
  }

  executeDelay(context) {
    const { ms } = this.config;
    console.log(`   Waiting ${ms}ms`);
    this.status = 'completed';
    return { success: true };
  }
}

class AutomationAgent {
  constructor(config = {}) {
    this.workflows = new Map();
    this.executions = new Map();
    this.stats = {
      workflowsCreated: 0,
      executionsRun: 0,
      executionsSuccess: 0
    };
    this.initDemoWorkflows();
  }

  initDemoWorkflows() {
    // Create demo workflows
  }

  createWorkflow(config) {
    const workflow = new AutomationWorkflow(config);
    this.workflows.set(workflow.id, workflow);
    this.stats.workflowsCreated++;
    console.log(`   Created workflow: ${workflow.name}`);
    return workflow;
  }

  addTrigger(workflowId, triggerConfig) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return { success: false, reason: 'Workflow not found' };
    }

    const trigger = new Trigger(triggerConfig);
    workflow.addTrigger(trigger);
    console.log(`   Added trigger: ${trigger.type}`);
    return { success: true, trigger };
  }

  addAction(workflowId, actionConfig) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return { success: false, reason: 'Workflow not found' };
    }

    const action = new Action(actionConfig);
    workflow.addAction(action);
    console.log(`   Added action: ${action.type}`);
    return { success: true, action };
  }

  activateWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return { success: false, reason: 'Workflow not found' };
    }

    workflow.activate();
    console.log(`   Activated workflow: ${workflow.name}`);
    return { success: true };
  }

  deactivateWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return { success: false, reason: 'Workflow not found' };
    }

    workflow.deactivate();
    console.log(`   Deactivated workflow: ${workflow.name}`);
    return { success: true };
  }

  async runWorkflow(workflowId, context = {}) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return { success: false, reason: 'Workflow not found' };
    }

    if (workflow.status === 'inactive') {
      return { success: false, reason: 'Workflow is inactive' };
    }

    workflow.start();
    this.stats.executionsRun++;

    console.log(`\n   Running workflow: ${workflow.name}`);
    console.log(`   Triggers: ${workflow.triggers.length}`);
    console.log(`   Actions: ${workflow.actions.length}`);

    // Evaluate triggers
    let triggersFired = true;
    for (const trigger of workflow.triggers) {
      if (!trigger.evaluate(context)) {
        triggersFired = false;
        break;
      }
    }

    if (!triggersFired) {
      console.log('   Triggers not satisfied, skipping workflow');
      workflow.complete(true);
      return { success: true, executed: false };
    }

    // Execute actions
    const results = [];
    for (const action of workflow.actions) {
      const result = await action.execute(context);
      results.push(result);

      if (!result.success && this.shouldStopOnError(action)) {
        console.log(`   Action failed, stopping workflow`);
        workflow.complete(false);
        return { success: false, results };
      }
    }

    workflow.complete(true);
    this.stats.executionsSuccess++;

    console.log(`   Workflow completed successfully`);
    return { success: true, results };
  }

  shouldStopOnError(action) {
    return action.config?.stopOnError !== false;
  }

  getWorkflow(workflowId) {
    return this.workflows.get(workflowId);
  }

  listWorkflows(status = null) {
    const workflows = Array.from(this.workflows.values());
    if (status) {
      return workflows.filter(w => w.status === status);
    }
    return workflows;
  }

  getWorkflowStats(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return null;

    return {
      id: workflow.id,
      name: workflow.name,
      status: workflow.status,
      runCount: workflow.runCount,
      successCount: workflow.successCount,
      failureCount: workflow.failureCount,
      successRate: workflow.runCount > 0
        ? (workflow.successCount / workflow.runCount * 100).toFixed(1) + '%'
        : 'N/A'
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new AutomationAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Automation Demo\n');

    // 1. Create Workflows
    console.log('1. Create Workflows:');
    const w1 = agent.createWorkflow({
      name: 'Temperature Alert',
      description: 'Send alert when temperature exceeds threshold',
      conditions: []
    });
    const w2 = agent.createWorkflow({
      name: 'Daily Report',
      description: 'Generate and send daily report',
      conditions: []
    });
    const w3 = agent.createWorkflow({
      name: 'Device Onboarding',
      description: 'Automate new IoT device setup',
      conditions: []
    });

    // 2. Add Triggers
    console.log('\n2. Add Triggers:');
    agent.addTrigger(w1.id, {
      type: 'sensor',
      config: { sensorId: 'temp-1', threshold: 30, operator: '>' }
    });
    agent.addTrigger(w2.id, {
      type: 'schedule',
      config: { cron: '0 9 * * *' }
    });
    agent.addTrigger(w3.id, {
      type: 'event',
      config: { eventType: 'device.registered' }
    });

    // 3. Add Actions
    console.log('\n3. Add Actions:');
    agent.addAction(w1.id, {
      type: 'notify',
      config: { channel: 'email', message: 'Temperature alert!' }
    });
    agent.addAction(w1.id, {
      type: 'http',
      config: { method: 'POST', url: '/api/alerts' }
    });
    agent.addAction(w2.id, {
      type: 'http',
      config: { method: 'GET', url: '/api/reports/daily' }
    });
    agent.addAction(w2.id, {
      type: 'notify',
      config: { channel: 'slack', message: 'Daily report generated' }
    });
    agent.addAction(w3.id, {
      type: 'transform',
      config: { mapping: { deviceId: 'id', name: 'name' } }
    });
    agent.addAction(w3.id, {
      type: 'notify',
      config: { channel: 'email', message: 'Device onboarded' }
    });

    // 4. Activate Workflows
    console.log('\n4. Activate Workflows:');
    agent.activateWorkflow(w1.id);
    agent.activateWorkflow(w2.id);
    agent.activateWorkflow(w3.id);

    // 5. Run Workflows
    console.log('\n5. Run Workflows:');

    // Run temp alert (should trigger)
    await agent.runWorkflow(w1.id, {
      sensorValues: { 'temp-1': 35 }
    });

    // Run temp alert (should not trigger)
    await agent.runWorkflow(w1.id, {
      sensorValues: { 'temp-1': 25 }
    });

    // Run daily report
    await agent.runWorkflow(w2.id, {});

    // Run device onboarding
    await agent.runWorkflow(w3.id, {
      eventType: 'device.registered',
      device: { id: 'dev-001', name: 'New Sensor' }
    });

    // 6. List Active Workflows
    console.log('\n6. Active Workflows:');
    const active = agent.listWorkflows('active');
    active.forEach(w => {
      console.log(`   ${w.name}: ${w.triggers.length} triggers, ${w.actions.length} actions`);
    });

    // 7. Workflow Statistics
    console.log('\n7. Workflow Statistics:');
    const w1Stats = agent.getWorkflowStats(w1.id);
    console.log(`   ${w1.name}: ${w1Stats.runCount} runs, ${w1Stats.successRate} success`);

    const w2Stats = agent.getWorkflowStats(w2.id);
    console.log(`   ${w2.name}: ${w2Stats.runCount} runs, ${w2Stats.successRate} success`);

    const w3Stats = agent.getWorkflowStats(w3.id);
    console.log(`   ${w3.name}: ${w3Stats.runCount} runs, ${w3Stats.successRate} success`);

    // 8. Deactivate Workflow
    console.log('\n8. Deactivate Workflow:');
    agent.deactivateWorkflow(w1.id);

    // 9. Statistics
    console.log('\n9. Statistics:');
    const stats = agent.getStats();
    console.log(`   Workflows Created: ${stats.workflowsCreated}`);
    console.log(`   Total Executions: ${stats.executionsRun}`);
    console.log(`   Successful: ${stats.executionsSuccess}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'create':
    console.log('Creating test workflow...');
    const w = agent.createWorkflow({
      name: 'Test Workflow',
      description: 'Test automation'
    });
    console.log(`Created workflow: ${w.id}`);
    break;

  case 'list':
    console.log('Listing workflows...');
    for (const w of agent.workflows.values()) {
      console.log(`   ${w.name}: ${w.status}`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-automation.js [demo|create|list]');
}
