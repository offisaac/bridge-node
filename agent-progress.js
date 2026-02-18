/**
 * Agent Progress - Progress Tracking Module
 *
 * Tracks employee progress, goals, and development.
 *
 * Usage: node agent-progress.js [command]
 */

class Goal {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.title = config.title;
    this.description = config.description || '';
    this.targetValue = config.targetValue;
    this.currentValue = config.currentValue || 0;
    this.unit = config.unit || '%';
    this.deadline = config.deadline ? new Date(config.deadline) : null;
    this.status = config.status || 'active'; // active, completed, abandoned
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
  }

  getProgress() {
    if (this.targetValue === 0) return 0;
    return Math.min(100, Math.round((this.currentValue / this.targetValue) * 100));
  }
}

class ProgressTracker {
  constructor() {
    this.goals = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    const goals = [
      { employeeId: 'EMP001', title: 'Complete 50 Tasks', targetValue: 50, currentValue: 35 },
      { employeeId: 'EMP001', title: 'Read 10 Books', targetValue: 10, currentValue: 4 },
      { employeeId: 'EMP002', title: 'Learn Python', targetValue: 100, currentValue: 60 }
    ];
    goals.forEach((g, i) => {
      const goal = new Goal({ ...g, id: `goal-${i + 1}` });
      this.goals.set(goal.id, goal);
    });
  }

  createGoal(config) {
    const goal = new Goal(config);
    this.goals.set(goal.id, goal);
    return goal;
  }

  updateProgress(goalId, value) {
    const goal = this.goals.get(goalId);
    if (!goal) throw new Error('Goal not found');
    goal.currentValue = value;
    if (goal.currentValue >= goal.targetValue) goal.status = 'completed';
    return goal;
  }

  getGoals(employeeId) {
    return Array.from(this.goals.values()).filter(g => g.employeeId === employeeId);
  }
}

function runDemo() {
  console.log('=== Agent Progress Demo\n');
  const tracker = new ProgressTracker();

  console.log('1. EMP001 Goals:');
  tracker.getGoals('EMP001').forEach(g => console.log(`   ${g.title}: ${g.getProgress()}% (${g.currentValue}/${g.targetValue})`));

  console.log('\n2. Create Goal:');
  const g = tracker.createGoal({ employeeId: 'EMP003', title: 'Complete Certification', targetValue: 1, currentValue: 0 });
  console.log(`   Created: ${g.title}`);

  console.log('\n3. Update Progress:');
  tracker.updateProgress('goal-1', 40);
  console.log('   Updated goal-1 to 40');

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
if ((args[0] || 'demo') === 'demo') runDemo();
