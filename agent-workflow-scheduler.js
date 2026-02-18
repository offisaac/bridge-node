/**
 * Agent Workflow Scheduler - Workflow Scheduling Module
 *
 * Schedules and manages workflow executions with cron-like scheduling.
 *
 * Usage: node agent-workflow-scheduler.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   schedule   - Schedule a workflow
 *   list       - List scheduled workflows
 *   run        - Trigger a workflow manually
 */

class WorkflowSchedule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.workflow = config.workflow; // Workflow ID or definition
    this.cron = config.cron || null; // Cron expression
    this.interval = config.interval || null; // Interval in ms
    this.nextRun = config.nextRun ? new Date(config.nextRun) : null;
    this.enabled = config.enabled !== false;
    this.maxRetries = config.maxRetries || 3;
    this.timeout = config.timeout || 300000; // 5 minutes default
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
    this.lastRun = config.lastRun ? new Date(config.lastRun) : null;
    this.runCount = config.runCount || 0;
  }

  calculateNextRun() {
    if (this.cron) {
      // Simplified cron parsing - in production use a cron library
      // For demo, just add interval
      const parts = this.cron.split(' ');
      if (parts[0] === '*' && parts[1] === '*') {
        // Every hour
        this.nextRun = new Date(Date.now() + 60 * 60 * 1000);
      } else if (parts[0] !== '*' && parts[1] === '*') {
        // Every X hours
        const hours = parseInt(parts[0]);
        this.nextRun = new Date(Date.now() + hours * 60 * 60 * 1000);
      }
    } else if (this.interval) {
      this.nextRun = new Date(Date.now() + this.interval);
    }
    return this.nextRun;
  }
}

class WorkflowExecution {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.scheduleId = config.scheduleId;
    this.status = config.status || 'pending'; // pending, running, success, failed, timeout
    this.startedAt = config.startedAt ? new Date(config.startedAt) : null;
    this.completedAt = config.completedAt ? new Date(config.completedAt) : null;
    this.duration = config.duration || null;
    this.result = config.result || null;
    this.error = config.error || null;
    this.retries = config.retries || 0;
  }
}

class WorkflowSchedulerManager {
  constructor() {
    this.schedules = new Map();
    this.executions = new Map();
    this.workflows = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample workflows
    const workflows = [
      { id: 'daily-report', name: 'Daily Report Generation', steps: ['fetch-data', 'generate-report', 'send-email'] },
      { id: 'backup-db', name: 'Database Backup', steps: ['connect-db', 'export-data', 'upload-backup'] },
      { id: 'sync-users', name: 'User Sync', steps: ['fetch-source', 'transform', 'sync-target'] },
      { id: 'cleanup-logs', name: 'Log Cleanup', steps: ['find-old-logs', 'archive', 'delete'] },
      { id: 'health-check', name: 'System Health Check', steps: ['check-services', 'check-db-storage', 'check', 'send-alert'] }
    ];

    workflows.forEach(w => {
      this.workflows.set(w.id, w);
    });

    // Sample schedules
    const schedules = [
      { name: 'Daily Report', workflow: 'daily-report', cron: '0 9 * * *', enabled: true, runCount: 150, nextRun: new Date(Date.now() + 12 * 60 * 60 * 1000) },
      { name: 'Database Backup', workflow: 'backup-db', interval: 24 * 60 * 60 * 1000, enabled: true, runCount: 45, nextRun: new Date(Date.now() + 8 * 60 * 60 * 1000) },
      { name: 'User Sync', workflow: 'sync-users', cron: '0 * * * *', enabled: true, runCount: 720, nextRun: new Date(Date.now() + 30 * 60 * 1000) },
      { name: 'Log Cleanup', workflow: 'cleanup-logs', cron: '0 2 * * *', enabled: false, runCount: 30, nextRun: null },
      { name: 'Health Check', workflow: 'health-check', interval: 5 * 60 * 1000, enabled: true, runCount: 5000, nextRun: new Date(Date.now() + 2 * 60 * 1000) }
    ];

    schedules.forEach(s => {
      const schedule = new WorkflowSchedule(s);
      this.schedules.set(schedule.id, schedule);
    });

    // Sample executions
    const sampleExecutions = [
      { scheduleId: Array.from(this.schedules.values())[0].id, status: 'success', duration: 45000 },
      { scheduleId: Array.from(this.schedules.values())[1].id, status: 'success', duration: 120000 },
      { scheduleId: Array.from(this.schedules.values())[2].id, status: 'failed', error: 'Connection timeout', duration: 30000 }
    ];

    sampleExecutions.forEach(e => {
      const exec = new WorkflowExecution(e);
      this.executions.set(exec.id, exec);
    });
  }

  // Schedule a workflow
  schedule(name, workflowId, options = {}) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow "${workflowId}" not found`);
    }

    const schedule = new WorkflowSchedule({
      name,
      workflow: workflowId,
      cron: options.cron || null,
      interval: options.interval || null,
      enabled: options.enabled !== false,
      maxRetries: options.maxRetries || 3,
      timeout: options.timeout || 300000
    });

    schedule.calculateNextRun();
    this.schedules.set(schedule.id, schedule);

    return schedule;
  }

  // Get schedule
  get(id) {
    return this.schedules.get(id) || null;
  }

  // List schedules
  list(enabled = null) {
    let all = Array.from(this.schedules.values());
    if (enabled !== null) {
      all = all.filter(s => s.enabled === enabled);
    }
    return all.sort((a, b) => (a.nextRun || 0) - (b.nextRun || 0));
  }

  // Enable/disable schedule
  setEnabled(id, enabled) {
    const schedule = this.schedules.get(id);
    if (!schedule) {
      throw new Error('Schedule not found');
    }
    schedule.enabled = enabled;
    if (enabled) {
      schedule.calculateNextRun();
    } else {
      schedule.nextRun = null;
    }
    return schedule;
  }

  // Run workflow manually
  run(id) {
    const schedule = this.schedules.get(id);
    if (!schedule) {
      throw new Error('Schedule not found');
    }

    const workflow = this.workflows.get(schedule.workflow);
    if (!workflow) {
      throw new Error('Workflow not found');
    }

    // Create execution
    const execution = new WorkflowExecution({
      scheduleId: schedule.id,
      status: 'running',
      startedAt: new Date()
    });
    this.executions.set(execution.id, execution);

    // Simulate workflow execution
    const success = Math.random() > 0.1; // 90% success rate

    execution.status = success ? 'success' : 'failed';
    execution.completedAt = new Date();
    execution.duration = execution.completedAt - execution.startedAt;
    execution.result = success ? { output: 'Workflow completed', steps: workflow.steps } : null;
    execution.error = success ? null : 'Simulated failure';

    // Update schedule
    schedule.lastRun = new Date();
    schedule.runCount++;
    schedule.calculateNextRun();

    return { schedule, execution };
  }

  // Get executions
  getExecutions(scheduleId = null, limit = 50) {
    let all = Array.from(this.executions.values());
    if (scheduleId) {
      all = all.filter(e => e.scheduleId === scheduleId);
    }
    return all.sort((a, b) => b.startedAt - a.startedAt).slice(0, limit);
  }

  // Get pending executions
  getPendingRuns() {
    const now = new Date();
    return Array.from(this.schedules.values())
      .filter(s => s.enabled && s.nextRun && s.nextRun <= now)
      .sort((a, b) => a.nextRun - b.nextRun);
  }

  // Process pending runs
  processPending() {
    const pending = this.getPendingRuns();
    const results = [];

    pending.forEach(schedule => {
      const result = this.run(schedule.id);
      results.push(result);
    });

    return results;
  }

  // Delete schedule
  delete(id) {
    const schedule = this.schedules.get(id);
    if (!schedule) {
      throw new Error('Schedule not found');
    }
    this.schedules.delete(id);
    return schedule;
  }

  // Get statistics
  getStats() {
    const schedules = Array.from(this.schedules.values());
    const executions = Array.from(this.executions.values());

    const enabled = schedules.filter(s => s.enabled).length;
    const totalRuns = schedules.reduce((sum, s) => sum + s.runCount, 0);

    const successCount = executions.filter(e => e.status === 'success').length;
    const failedCount = executions.filter(e => e.status === 'failed').length;

    const avgDuration = executions.length > 0
      ? executions.reduce((sum, e) => sum + (e.duration || 0), 0) / executions.length
      : 0;

    return {
      totalSchedules: schedules.length,
      enabledSchedules: enabled,
      disabledSchedules: schedules.length - enabled,
      totalRuns,
      successCount,
      failedCount,
      successRate: (successCount + failedCount) > 0
        ? (successCount / (successCount + failedCount) * 100).toFixed(1) + '%'
        : '0%',
      avgDuration: Math.round(avgDuration) + 'ms'
    };
  }

  // List workflows
  listWorkflows() {
    return Array.from(this.workflows.values());
  }
}

function runDemo() {
  console.log('=== Agent Workflow Scheduler Demo\n');

  const mgr = new WorkflowSchedulerManager();

  console.log('1. List Workflows:');
  const workflows = mgr.listWorkflows();
  console.log(`   Total: ${workflows.length}`);
  workflows.forEach(w => console.log(`   - ${w.id}: ${w.name}`));

  console.log('\n2. List Schedules:');
  const schedules = mgr.list();
  console.log(`   Total: ${schedules.length}`);
  schedules.forEach(s => {
    console.log(`   - ${s.name} [${s.workflow}] ${s.enabled ? 'enabled' : 'disabled'}`);
    if (s.nextRun) console.log(`     Next run: ${s.nextRun.toISOString()}`);
  });

  console.log('\n3. Schedule New Workflow:');
  const newSchedule = mgr.schedule('Hourly Analytics', 'sync-users', {
    interval: 60 * 60 * 1000, // 1 hour
    enabled: true
  });
  console.log(`   Created: ${newSchedule.name}`);
  console.log(`   Next run: ${newSchedule.nextRun}`);

  console.log('\n4. Run Workflow Manually:');
  const runResult = mgr.run(newSchedule.id);
  console.log(`   Status: ${runResult.execution.status}`);
  console.log(`   Duration: ${runResult.execution.duration}ms`);

  console.log('\n5. Get Pending Runs:');
  const pending = mgr.getPendingRuns();
  console.log(`   Pending: ${pending.length}`);

  console.log('\n6. Disable Schedule:');
  const disabled = mgr.setEnabled(newSchedule.id, false);
  console.log(`   Disabled: ${disabled.name} (enabled: ${disabled.enabled})`);

  console.log('\n7. Enable Schedule:');
  const enabled = mgr.setEnabled(newSchedule.id, true);
  console.log(`   Enabled: ${enabled.name} (enabled: ${enabled.enabled})`);

  console.log('\n8. Get Executions:');
  const executions = mgr.getExecutions();
  console.log(`   Total: ${executions.length}`);
  executions.slice(0, 3).forEach(e => {
    console.log(`   - ${e.status} (${e.duration}ms)`);
  });

  console.log('\n9. Process Pending:');
  const processed = mgr.processPending();
  console.log(`   Processed: ${processed.length}`);

  console.log('\n10. Get Statistics:');
  const stats = mgr.getStats();
  console.log(`   Total schedules: ${stats.totalSchedules}`);
  console.log(`   Enabled: ${stats.enabledSchedules}`);
  console.log(`   Total runs: ${stats.totalRuns}`);
  console.log(`   Success rate: ${stats.successRate}`);
  console.log(`   Avg duration: ${stats.avgDuration}`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new WorkflowSchedulerManager();

if (command === 'demo') runDemo();
else if (command === 'schedule') {
  const [name, workflowId, interval] = args.slice(1);
  if (!name || !workflowId) {
    console.log('Usage: node agent-workflow-scheduler.js schedule <name> <workflowId> [interval_ms]');
    process.exit(1);
  }
  try {
    const schedule = mgr.schedule(name, workflowId, { interval: interval ? parseInt(interval) : undefined });
    console.log(JSON.stringify(schedule, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
else if (command === 'list') {
  const [enabled] = args.slice(1);
  const schedules = mgr.list(enabled === 'true' ? true : enabled === 'false' ? false : null);
  console.log(JSON.stringify(schedules, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else if (command === 'run') {
  const [scheduleId] = args.slice(1);
  if (!scheduleId) {
    console.log('Usage: node agent-workflow-scheduler.js run <scheduleId>');
    process.exit(1);
  }
  try {
    const result = mgr.run(scheduleId);
    console.log(JSON.stringify(result, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
else console.log('Usage: node agent-workflow-scheduler.js [demo|schedule|list|run]');
