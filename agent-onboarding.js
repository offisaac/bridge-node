/**
 * Agent Onboarding - Employee Onboarding Management Agent
 *
 * Manages new employee onboarding, orientation, training, and integration.
 *
 * Usage: node agent-onboarding.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   start   - Start onboarding
 *   status  - Check onboarding status
 */

class OnboardingTask {
  constructor(config) {
    this.id = `task-${Date.now()}`;
    this.name = config.name;
    this.description = config.description;
    this.category = config.category; // paperwork, IT_setup, training, orientation, introduction
    this.assignee = config.assignee; // who completes this task
    this.dueDays = config.dueDays || 7; // days from start
    this.completed = false;
    this.completedAt = null;
    this.completedBy = null;
  }

  complete(completedBy) {
    this.completed = true;
    this.completedAt = Date.now();
    this.completedBy = completedBy;
  }

  isOverdue(startDate) {
    const dueDate = startDate + this.dueDays * 24 * 60 * 60 * 1000;
    return !this.completed && Date.now() > dueDate;
  }
}

class OnboardingProcess {
  constructor(config) {
    this.id = `onboard-${Date.now()}`;
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.department = config.department;
    this.position = config.position;
    this.startDate = config.startDate || Date.now();
    this.status = 'in_progress'; // pending, in_progress, completed
    this.tasks = [];
    this.buddy = null;
    this.manager = config.manager || '';
    this.orientationCompleted = false;
    this.trainingCompleted = false;
  }

  addTask(task) {
    this.tasks.push(task);
  }

  complete() {
    this.status = 'completed';
  }

  getProgress() {
    if (this.tasks.length === 0) return 0;
    const completed = this.tasks.filter(t => t.completed).length;
    return Math.round((completed / this.tasks.length) * 100);
  }
}

class OnboardingBuddy {
  constructor(config) {
    this.id = `buddy-${Date.now()}`;
    this.employeeId = config.employeeId;
    this.name = config.name;
    this.department = config.department;
    this.assignedDate = Date.now();
  }
}

class OnboardingAgent {
  constructor(config = {}) {
    this.processes = new Map();
    this.templates = new Map();
    this.stats = {
      onboardingStarted: 0,
      completed: 0,
      averageDays: 0
    };
    this.initTemplates();
  }

  initTemplates() {
    // Default onboarding tasks template
    const defaultTasks = [
      { name: 'Sign employment contract', description: 'Complete and sign all paperwork', category: 'paperwork', assignee: 'HR', dueDays: 1 },
      { name: 'Set up workstation', description: 'Prepare desk, chair, equipment', category: 'IT_setup', assignee: 'IT', dueDays: 1 },
      { name: 'Create email account', description: 'Set up company email', category: 'IT_setup', assignee: 'IT', dueDays: 1 },
      { name: 'Provision system access', description: 'Grant access to required systems', category: 'IT_setup', assignee: 'IT', dueDays: 2 },
      { name: 'Complete I-9 verification', description: 'Employment eligibility verification', category: 'paperwork', assignee: 'HR', dueDays: 3 },
      { name: 'Enroll in benefits', description: 'Health insurance, 401k, etc.', category: 'paperwork', assignee: 'HR', dueDays: 5 },
      { name: 'Company orientation', description: 'Overview of company culture, values, policies', category: 'orientation', assignee: 'HR', dueDays: 1 },
      { name: 'Department orientation', description: 'Meet team, understand department goals', category: 'orientation', assignee: 'Manager', dueDays: 2 },
      { name: 'Safety training', description: 'Workplace safety and emergency procedures', category: 'training', assignee: 'Safety', dueDays: 3 },
      { name: 'Role-specific training', description: 'Job-specific skills and tools training', category: 'training', assignee: 'Manager', dueDays: 7 },
      { name: 'Introductions to key stakeholders', description: 'Meet important colleagues', category: 'introduction', assignee: 'Buddy', dueDays: 5 }
    ];

    this.templates.set('default', defaultTasks);
  }

  startOnboarding(config) {
    const process = new OnboardingProcess(config);

    // Add tasks from template
    const template = this.templates.get('default') || [];
    for (const taskConfig of template) {
      process.addTask(new OnboardingTask(taskConfig));
    }

    this.processes.set(process.id, process);
    this.stats.onboardingStarted++;

    console.log(`   Started onboarding: ${process.employeeName}`);
    return process;
  }

  assignBuddy(processId, buddyConfig) {
    const process = this.processes.get(processId);
    if (!process) {
      return { success: false, reason: 'Process not found' };
    }

    const buddy = new OnboardingBuddy(buddyConfig);
    process.buddy = buddy;
    console.log(`   Assigned buddy: ${buddy.name}`);
    return { success: true, buddy };
  }

  completeTask(processId, taskName, completedBy) {
    const process = this.processes.get(processId);
    if (!process) {
      return { success: false, reason: 'Process not found' };
    }

    const task = process.tasks.find(t => t.name === taskName);
    if (!task) {
      return { success: false, reason: 'Task not found' };
    }

    task.complete(completedBy);
    console.log(`   Completed task: ${taskName}`);
    return { success: true, task };
  }

  completeOrientation(processId) {
    const process = this.processes.get(processId);
    if (!process) {
      return { success: false, reason: 'Process not found' };
    }

    process.orientationCompleted = true;
    console.log(`   Orientation completed for: ${process.employeeName}`);
    return { success: true };
  }

  completeTraining(processId) {
    const process = this.processes.get(processId);
    if (!process) {
      return { success: false, reason: 'Process not found' };
    }

    process.trainingCompleted = true;
    console.log(`   Training completed for: ${process.employeeName}`);
    return { success: true };
  }

  completeOnboarding(processId) {
    const process = this.processes.get(processId);
    if (!process) {
      return { success: false, reason: 'Process not found' };
    }

    process.complete();
    this.stats.completed++;
    console.log(`   Onboarding completed: ${process.employeeName}`);
    return { success: true };
  }

  getProcess(processId) {
    return this.processes.get(processId);
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new OnboardingAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Onboarding Demo\n');

    // 1. Start Onboarding
    console.log('1. Start Onboarding:');
    const onboard1 = agent.startOnboarding({
      employeeId: 'emp-001',
      employeeName: 'Sarah Johnson',
      department: 'Engineering',
      position: 'Software Developer',
      manager: 'John Smith'
    });
    const onboard2 = agent.startOnboarding({
      employeeId: 'emp-002',
      employeeName: 'Mike Chen',
      department: 'Marketing',
      position: 'Marketing Manager',
      manager: 'Emily Davis'
    });

    // 2. Assign Buddies
    console.log('\n2. Assign Onboarding Buddies:');
    agent.assignBuddy(onboard1.id, {
      employeeId: 'emp-101',
      name: 'Alex Kim',
      department: 'Engineering'
    });

    // 3. Complete Tasks
    console.log('\n3. Complete Tasks:');
    agent.completeTask(onboard1.id, 'Sign employment contract', 'HR');
    agent.completeTask(onboard1.id, 'Set up workstation', 'IT');
    agent.completeTask(onboard1.id, 'Create email account', 'IT');
    agent.completeTask(onboard1.id, 'Company orientation', 'HR');

    // 4. Complete Orientation
    console.log('\n4. Complete Orientation:');
    agent.completeOrientation(onboard1.id);

    // 5. Complete Training
    console.log('\n5. Complete Training:');
    agent.completeTraining(onboard1.id);

    // 6. Complete More Tasks
    console.log('\n6. Complete Remaining Tasks:');
    agent.completeTask(onboard1.id, 'Safety training', 'Safety');
    agent.completeTask(onboard1.id, 'Role-specific training', 'Manager');

    // 7. Check Progress
    console.log('\n7. Onboarding Progress:');
    const progress = onboard1.getProgress();
    console.log(`   Sarah Johnson: ${progress}% complete`);

    // 8. Complete Onboarding
    console.log('\n8. Complete Onboarding:');
    agent.completeOnboarding(onboard1.id);

    // 9. Statistics
    console.log('\n9. Statistics:');
    const stats = agent.getStats();
    console.log(`   Onboarding Started: ${stats.onboardingStarted}`);
    console.log(`   Completed: ${stats.completed}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'start':
    console.log('Starting test onboarding...');
    const p = agent.startOnboarding({
      employeeId: 'test-001',
      employeeName: 'Test User',
      department: 'Test Dept',
      position: 'Tester'
    });
    console.log(`Started: ${p.employeeName}`);
    break;

  case 'status':
    console.log('Checking onboarding status...');
    for (const p of agent.processes.values()) {
      console.log(`   ${p.employeeName}: ${p.getProgress()}%`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-onboarding.js [demo|start|status]');
}
