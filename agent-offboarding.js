/**
 * Agent Offboarding - Employee Offboarding Management Module
 *
 * Manages employee offboarding processes, exit interviews, asset returns, and offboarding checklists.
 *
 * Usage: node agent-offboarding.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   list    - List offboarding processes
 *   status  - Check process status
 */

class OffboardingTask {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description || '';
    this.category = config.category; // 'documentation', 'equipment', 'access', 'benefits', 'financial', 'knowledge_transfer'
    this.required = config.required !== false;
    this.assignee = config.assignee || null; // HR, IT, Manager, Employee
    this.dueDaysBefore = config.dueDaysBefore || 0; // days before last day
    this.completedAt = config.completedAt ? new Date(config.completedAt) : null;
    this.completedBy = config.completedBy || null;
    this.notes = config.notes || '';
    this.evidence = config.evidence || [];
  }

  complete(completedBy, notes = '', evidence = []) {
    this.completedAt = new Date();
    this.completedBy = completedBy;
    this.notes = notes;
    this.evidence = evidence;
  }

  isComplete() {
    return this.completedAt !== null;
  }

  getStatus() {
    return this.isComplete() ? 'completed' : 'pending';
  }
}

class OffboardingProcess {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.department = config.department;
    this.position = config.position || '';
    this.lastDay = new Date(config.lastDay);
    this.reason = config.reason || ''; // 'resignation', 'termination', 'retirement', 'layoff'
    this.initiatedBy = config.initiatedBy || '';
    this.initiatedAt = config.initiatedAt ? new Date(config.initiatedAt) : new Date();
    this.status = config.status || 'planned'; // 'planned', 'in_progress', 'completed', 'cancelled'
    this.tasks = config.tasks || [];
    this.interviewScheduled = config.interviewScheduled || null;
    this.exitInterviewCompleted = config.exitInterviewCompleted || false;
    this.documents = config.documents || [];
    this.notes = config.notes || '';
  }

  start() {
    this.status = 'in_progress';
  }

  complete() {
    this.status = 'completed';
  }

  addTask(task) {
    this.tasks.push(task);
  }

  getCompletionPercentage() {
    if (this.tasks.length === 0) return 0;
    const completed = this.tasks.filter(t => t.isComplete()).length;
    return Math.round((completed / this.tasks.length) * 100);
  }
}

class ExitInterview {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.interviewer = config.interviewer;
    this.scheduledAt = config.scheduledAt ? new Date(config.scheduledAt) : null;
    this.completedAt = config.completedAt ? new Date(config.completedAt) : null;
    this.duration = config.duration || 0; // minutes
    this.reasonForLeaving = config.reasonForLeaving || '';
    this.feedback = config.feedback || {};
    this.recommendations = config.recommendations || [];
    this.confidential = config.confidential !== false;
    this.status = config.status || 'scheduled'; // 'scheduled', 'completed', 'cancelled', 'no_show'
  }

  complete(interviewer, feedback, duration = 60) {
    this.completedAt = new Date();
    this.interviewer = interviewer;
    this.feedback = feedback;
    this.duration = duration;
    this.status = 'completed';
  }

  cancel() {
    this.status = 'cancelled';
  }
}

class AssetReturn {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.assetId = config.assetId;
    this.assetName = config.assetName;
    this.assetType = config.assetType; // 'laptop', 'phone', 'badge', 'equipment', 'software_license'
    this.assignedDate = config.assignedDate ? new Date(config.assignedDate) : null;
    this.returnDueDate = config.returnDueDate ? new Date(config.returnDueDate) : null;
    this.returnedAt = config.returnedAt ? new Date(config.returnedAt) : null;
    this.condition = config.condition || ''; // 'excellent', 'good', 'fair', 'damaged'
    this.receivedBy = config.receivedBy || null;
    this.notes = config.notes || '';
    this.status = config.status || 'pending'; // 'pending', 'returned', 'overdue', 'waived'
  }

  markReturned(condition, receivedBy, notes = '') {
    this.returnedAt = new Date();
    this.condition = condition;
    this.receivedBy = receivedBy;
    this.notes = notes;
    this.status = 'returned';
  }

  isOverdue() {
    if (this.status === 'returned' || this.status === 'waived') return false;
    if (!this.returnDueDate) return false;
    return new Date() > this.returnDueDate;
  }
}

class OffboardingManager {
  constructor() {
    this.processes = new Map();
    this.exitInterviews = new Map();
    this.assetReturns = new Map();
    this.taskTemplates = new Map();

    this._initializeDefaultTemplates();
  }

  _initializeDefaultTemplates() {
    const templates = {
      documentation: [
        { name: 'Resignation Letter', category: 'documentation', required: true, dueDaysBefore: 14, assignee: 'Employee' },
        { name: 'Exit Interview', category: 'documentation', required: true, dueDaysBefore: 5, assignee: 'HR' },
        { name: 'Final Paycheck Authorization', category: 'documentation', required: true, dueDaysBefore: 1, assignee: 'HR' },
        { name: 'COBRA Notification', category: 'documentation', required: true, dueDaysBefore: 1, assignee: 'HR' },
        { name: 'Unemployment Forms', category: 'documentation', required: false, dueDaysBefore: 1, assignee: 'HR' }
      ],
      equipment: [
        { name: 'Laptop Return', category: 'equipment', required: true, dueDaysBefore: 1, assignee: 'IT' },
        { name: 'Phone Return', category: 'equipment', required: false, dueDaysBefore: 1, assignee: 'IT' },
        { name: 'Badge/Access Card', category: 'equipment', required: true, dueDaysBefore: 1, assignee: 'Security' },
        { name: 'Parking Pass', category: 'equipment', required: false, dueDaysBefore: 1, assignee: 'Security' },
        { name: 'Company Equipment', category: 'equipment', required: true, dueDaysBefore: 1, assignee: 'Manager' }
      ],
      access: [
        { name: 'Email Account Disable', category: 'access', required: true, dueDaysBefore: 0, assignee: 'IT' },
        { name: 'VPN Access Revoke', category: 'access', required: true, dueDaysBefore: 0, assignee: 'IT' },
        { name: 'System Accounts Removal', category: 'access', required: true, dueDaysBefore: 0, assignee: 'IT' },
        { name: 'Building Access Revoke', category: 'access', required: true, dueDaysBefore: 0, assignee: 'Security' },
        { name: 'Shared Drive Access Transfer', category: 'access', required: false, dueDaysBefore: 3, assignee: 'IT' }
      ],
      benefits: [
        { name: 'Benefits Continuation Info', category: 'benefits', required: true, dueDaysBefore: 1, assignee: 'HR' },
        { name: '401(k) RollOver Info', category: 'benefits', required: true, dueDaysBefore: 1, assignee: 'HR' },
        { name: 'Stock Options Discussion', category: 'benefits', required: false, dueDaysBefore: 5, assignee: 'HR' },
        { name: 'PTO Payout Calculation', category: 'benefits', required: true, dueDaysBefore: 1, assignee: 'HR' }
      ],
      financial: [
        { name: 'Final Expense Report', category: 'financial', required: false, dueDaysBefore: 5, assignee: 'Employee' },
        { name: 'Company Credit Card', category: 'financial', required: true, dueDaysBefore: 1, assignee: 'Finance' },
        { name: 'Expense Card Cancellation', category: 'financial', required: true, dueDaysBefore: 1, assignee: 'Finance' }
      ],
      knowledge_transfer: [
        { name: 'Project Handover', category: 'knowledge_transfer', required: true, dueDaysBefore: 7, assignee: 'Employee' },
        { name: 'Documentation Update', category: 'knowledge_transfer', required: false, dueDaysBefore: 5, assignee: 'Employee' },
        { name: 'Training Backup', category: 'knowledge_transfer', required: false, dueDaysBefore: 5, assignee: 'Manager' }
      ]
    };

    Object.entries(templates).forEach(([category, tasks]) => {
      this.taskTemplates.set(category, tasks.map(t => new OffboardingTask(t)));
    });
  }

  initiateOffboarding(processConfig) {
    const process = new OffboardingProcess(processConfig);

    // Add tasks from templates
    this.taskTemplates.forEach((tasks, category) => {
      tasks.forEach(taskTemplate => {
        const task = new OffboardingTask({
          ...taskTemplate,
          id: crypto.randomUUID()
        });
        process.addTask(task);
      });
    });

    this.processes.set(process.id, process);
    return process;
  }

  getProcess(processId) {
    return this.processes.get(processId);
  }

  getProcessByEmployee(employeeId) {
    return Array.from(this.processes.values())
      .find(p => p.employeeId === employeeId);
  }

  completeTask(processId, taskName, completedBy, notes = '', evidence = []) {
    const process = this.processes.get(processId);
    if (!process) throw new Error('Process not found');

    const task = process.tasks.find(t => t.name === taskName);
    if (!task) throw new Error('Task not found');

    task.complete(completedBy, notes, evidence);

    // Check if all required tasks are complete
    if (process.getCompletionPercentage() === 100) {
      process.complete();
    }

    return task;
  }

  scheduleExitInterview(employeeId, interviewer, scheduledAt) {
    const interview = new ExitInterview({
      employeeId,
      interviewer,
      scheduledAt: new Date(scheduledAt),
      status: 'scheduled'
    });

    this.exitInterviews.set(interview.id, interview);

    // Update process if exists
    const process = this.getProcessByEmployee(employeeId);
    if (process) {
      process.interviewScheduled = scheduledAt;
    }

    return interview;
  }

  completeExitInterview(interviewId, interviewer, feedback, duration = 60) {
    const interview = this.exitInterviews.get(interviewId);
    if (!interview) throw new Error('Interview not found');

    interview.complete(interviewer, feedback, duration);

    // Update process
    const process = this.getProcessByEmployee(interview.employeeId);
    if (process) {
      process.exitInterviewCompleted = true;
    }

    return interview;
  }

  registerAsset(assetConfig) {
    const asset = new AssetReturn(assetConfig);
    const key = `${asset.employeeId}-${asset.assetId}`;

    this.assetReturns.set(key, asset);
    return asset;
  }

  returnAsset(employeeId, assetId, condition, receivedBy, notes = '') {
    const key = `${employeeId}-${assetId}`;
    const asset = this.assetReturns.get(key);

    if (!asset) throw new Error('Asset not found');

    asset.markReturned(condition, receivedBy, notes);
    return asset;
  }

  getEmployeeAssets(employeeId) {
    return Array.from(this.assetReturns.values())
      .filter(a => a.employeeId === employeeId);
  }

  getOverdueAssets() {
    return Array.from(this.assetReturns.values())
      .filter(a => a.isOverdue());
  }

  getOffboardingSummary(employeeId) {
    const process = this.getProcessByEmployee(employeeId);

    if (!process) {
      return null;
    }

    const tasksByCategory = {};
    process.tasks.forEach(task => {
      if (!tasksByCategory[task.category]) {
        tasksByCategory[task.category] = { total: 0, completed: 0 };
      }
      tasksByCategory[task.category].total++;
      if (task.isComplete()) {
        tasksByCategory[task.category].completed++;
      }
    });

    const assets = this.getEmployeeAssets(employeeId);

    return {
      employeeId: process.employeeId,
      employeeName: process.employeeName,
      lastDay: process.lastDay,
      reason: process.reason,
      status: process.status,
      completionPercentage: process.getCompletionPercentage(),
      tasksByCategory,
      tasksCompleted: process.tasks.filter(t => t.isComplete()).length,
      totalTasks: process.tasks.length,
      assets: assets.map(a => ({
        name: a.assetName,
        status: a.status,
        condition: a.condition
      })),
      exitInterviewCompleted: process.exitInterviewCompleted
    };
  }

  getAllProcesses(status = null) {
    let processes = Array.from(this.processes.values());

    if (status) {
      processes = processes.filter(p => p.status === status);
    }

    return processes.sort((a, b) => new Date(b.initiatedAt) - new Date(a.initiatedAt));
  }

  getStatistics() {
    const processes = Array.from(this.processes.values());
    const completed = processes.filter(p => p.status === 'completed').length;
    const inProgress = processes.filter(p => p.status === 'in_progress').length;
    const planned = processes.filter(p => p.status === 'planned').length;

    const totalTasks = processes.reduce((sum, p) => sum + p.tasks.length, 0);
    const completedTasks = processes.reduce((sum, p) => sum + p.tasks.filter(t => t.isComplete()).length, 0);

    const assets = Array.from(this.assetReturns.values());
    const returnedAssets = assets.filter(a => a.status === 'returned').length;
    const overdueAssets = assets.filter(a => a.isOverdue()).length;

    return {
      processes: {
        total: processes.length,
        completed,
        inProgress,
        planned
      },
      tasks: {
        total: totalTasks,
        completed: completedTasks,
        completionRate: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
      },
      assets: {
        total: assets.length,
        returned: returnedAssets,
        pending: assets.length - returnedAssets,
        overdue: overdueAssets
      }
    };
  }

  cancelProcess(processId, reason = '') {
    const process = this.processes.get(processId);
    if (!process) throw new Error('Process not found');

    process.status = 'cancelled';
    process.notes = reason;
    return process;
  }
}

// Demo function
function runDemo() {
  console.log('=== Agent Offboarding Demo\n');

  const manager = new OffboardingManager();

  // 1. Initiate offboarding
  console.log('1. Initiating Offboarding:');
  const process = manager.initiateOffboarding({
    employeeId: 'emp-042',
    employeeName: 'John Smith',
    department: 'Engineering',
    position: 'Senior Developer',
    lastDay: '2026-02-28',
    reason: 'resignation',
    initiatedBy: 'emp-042',
    initiatedAt: '2026-02-10'
  });
  console.log(`   Employee: ${process.employeeName}`);
  console.log(`   Last Day: ${process.lastDay.toISOString().split('T')[0]}`);
  console.log(`   Reason: ${process.reason}`);
  console.log(`   Tasks: ${process.tasks.length} tasks created`);

  // 2. Show tasks by category
  console.log('\n2. Offboarding Tasks by Category:');
  const categories = {};
  process.tasks.forEach(task => {
    if (!categories[task.category]) categories[task.category] = [];
    categories[task.category].push(task.name);
  });
  Object.entries(categories).forEach(([cat, tasks]) => {
    console.log(`   ${cat}: ${tasks.length} tasks`);
    tasks.slice(3).forEach(t => console.log(`      - ${t}`));
  });

  // 3. Complete some tasks
  console.log('\n3. Completing Tasks:');
  manager.completeTask(process.id, 'Resignation Letter', 'emp-042', 'Submitted formal letter');
  manager.completeTask(process.id, 'Laptop Return', 'IT-Admin', 'Returned in good condition', ['photo_001.jpg']);
  manager.completeTask(process.id, 'Email Account Disable', 'IT-Admin', 'Account disabled');
  manager.completeTask(process.id, 'Benefits Continuation Info', 'HR-Admin', 'COBRA info provided');
  console.log(`   Completed: ${process.tasks.filter(t => t.isComplete()).length}/${process.tasks.length}`);
  console.log(`   Progress: ${process.getCompletionPercentage()}%`);

  // 4. Schedule exit interview
  console.log('\n4. Scheduling Exit Interview:');
  const interview = manager.scheduleExitInterview(
    process.employeeId,
    'HR-Manager',
    '2026-02-25T14:00:00'
  );
  console.log(`   Interview ID: ${interview.id}`);
  console.log(`   Scheduled: ${interview.scheduledAt.toISOString().split('T')[0]} at 2:00 PM`);

  // 5. Complete exit interview
  console.log('\n5. Completing Exit Interview:');
  const completedInterview = manager.completeExitInterview(
    interview.id,
    'HR-Manager',
    {
      reasonForLeaving: 'Career advancement opportunity',
      satisfaction: 4,
      managementFeedback: 'Good experience, some communication issues',
      workplaceFeedback: 'Great team culture',
      suggestions: 'More frequent 1-on-1s'
    },
    45
  );
  console.log(`   Status: ${completedInterview.status}`);
  console.log(`   Duration: ${completedInterview.duration} minutes`);
  console.log(`   Reason: ${completedInterview.feedback.reasonForLeaving}`);

  // 6. Register assets
  console.log('\n6. Registering Assets:');
  manager.registerAsset({
    employeeId: process.employeeId,
    assetId: 'LAP-042',
    assetName: 'MacBook Pro 16"',
    assetType: 'laptop',
    assignedDate: '2024-01-15',
    returnDueDate: '2026-02-28'
  });
  manager.registerAsset({
    employeeId: process.employeeId,
    assetId: 'PH-042',
    assetName: 'iPhone 14 Pro',
    assetType: 'phone',
    assignedDate: '2024-01-15',
    returnDueDate: '2026-02-28'
  });
  manager.registerAsset({
    employeeId: process.employeeId,
    assetId: 'BDG-042',
    assetName: 'Building Access Badge',
    assetType: 'badge',
    assignedDate: '2024-01-15',
    returnDueDate: '2026-02-28'
  });
  const assets = manager.getEmployeeAssets(process.employeeId);
  console.log(`   Total Assets: ${assets.length}`);

  // 7. Return asset
  console.log('\n7. Returning Asset:');
  const returnedAsset = manager.returnAsset(
    process.employeeId,
    'LAP-042',
    'excellent',
    'IT-Admin',
    'Minor scratches on lid'
  );
  console.log(`   Asset: ${returnedAsset.assetName}`);
  console.log(`   Status: ${returnedAsset.status}`);
  console.log(`   Condition: ${returnedAsset.condition}`);

  // 8. Get summary
  console.log('\n8. Offboarding Summary:');
  const summary = manager.getOffboardingSummary(process.employeeId);
  console.log(`   Employee: ${summary.employeeName}`);
  console.log(`   Progress: ${summary.completionPercentage}%`);
  console.log(`   Tasks: ${summary.tasksCompleted}/${summary.totalTasks}`);
  console.log(`   Exit Interview: ${summary.exitInterviewCompleted ? 'Completed' : 'Pending'}`);
  console.log(`   Assets Returned: ${summary.assets.filter(a => a.status === 'returned').length}/${summary.assets.length}`);

  // 9. Get statistics
  console.log('\n9. Offboarding Statistics:');
  const stats = manager.getStatistics();
  console.log(`   Processes: ${stats.processes.total} total`);
  console.log(`      Completed: ${stats.processes.completed}`);
  console.log(`      In Progress: ${stats.processes.inProgress}`);
  console.log(`      Planned: ${stats.processes.planned}`);
  console.log(`   Tasks: ${stats.tasks.completionRate}% completion rate`);
  console.log(`   Assets: ${stats.assets.returned}/${stats.assets.total} returned`);
  if (stats.assets.overdue > 0) {
    console.log(`      WARNING: ${stats.assets.overdue} overdue returns`);
  }

  // 10. Get overdue assets
  console.log('\n10. Overdue Assets:');
  const overdue = manager.getOverdueAssets();
  console.log(`    Total Overdue: ${overdue.length}`);

  console.log('\n=== Demo Complete ===');
}

// CLI handler
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const manager = new OffboardingManager();

switch (command) {
  case 'demo':
    runDemo();
    break;

  case 'list':
    const status = args[1] || null;
    console.log(`Offboarding Processes${status ? ` (${status})` : ''}:`);
    manager.getAllProcesses(status).forEach(p => {
      console.log(`  ${p.employeeName} - ${p.status} (${p.getCompletionPercentage()}%)`);
    });
    break;

  case 'status':
    const empId = args[1] || 'emp-042';
    const summary = manager.getOffboardingSummary(empId);
    if (summary) {
      console.log(`Employee: ${summary.employeeName}`);
      console.log(`Progress: ${summary.completionPercentage}%`);
      console.log(`Tasks: ${summary.tasksCompleted}/${summary.totalTasks}`);
    } else {
      console.log('No offboarding process found');
    }
    break;

  default:
    console.log('Usage: node agent-offboarding.js [command]');
    console.log('Commands:');
    console.log('  demo    - Run demonstration');
    console.log('  list    - List offboarding processes');
    console.log('  status  - Check process status');
}
