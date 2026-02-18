/**
 * Agent Milestone - Milestone Tracking Module
 *
 * Tracks career milestones, project milestones, and achievements.
 *
 * Usage: node agent-milestone.js [command]
 */

class Milestone {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description || '';
    this.category = config.category; // career, project, personal, team
    this.targetDate = config.targetDate ? new Date(config.targetDate) : null;
    this.completedDate = config.completedDate ? new Date(config.completedDate) : null;
    this.status = config.status || 'pending'; // pending, in_progress, completed, delayed
    this.employeeId = config.employeeId || null;
    this.metadata = config.metadata || {};
  }

  complete() {
    this.status = 'completed';
    this.completedDate = new Date();
  }
}

class MilestoneManager {
  constructor() {
    this.milestones = new Map();
    this._initializeSampleData();
  }

  _initializeSampleData() {
    const ms = [
      { name: 'Complete Onboarding', category: 'career', employeeId: 'EMP001', status: 'completed' },
      { name: 'First Project Delivery', category: 'project', employeeId: 'EMP001', status: 'in_progress' },
      { name: 'Get Promoted to Senior', category: 'career', employeeId: 'EMP001', status: 'pending' },
      { name: 'Launch Product v2.0', category: 'project', status: 'in_progress' },
      { name: 'Complete 100 Tasks', category: 'personal', employeeId: 'EMP002', status: 'completed' }
    ];
    ms.forEach((m, i) => {
      const milestone = new Milestone({ ...m, id: `ms-${i + 1}` });
      if (m.status === 'completed') milestone.completedDate = new Date();
      this.milestones.set(milestone.id, milestone);
    });
  }

  create(config) {
    const m = new Milestone(config);
    this.milestones.set(m.id, m);
    return m;
  }

  complete(milestoneId) {
    const m = this.milestones.get(milestoneId);
    if (!m) throw new Error('Milestone not found');
    m.complete();
    return m;
  }

  getByEmployee(employeeId) {
    return Array.from(this.milestones.values()).filter(m => m.employeeId === employeeId);
  }

  getByCategory(category) {
    return Array.from(this.milestones.values()).filter(m => m.category === category);
  }

  getStats() {
    const all = Array.from(this.milestones.values());
    return {
      total: all.length,
      completed: all.filter(m => m.status === 'completed').length,
      inProgress: all.filter(m => m.status === 'in_progress').length,
      pending: all.filter(m => m.status === 'pending').length
    };
  }
}

function runDemo() {
  console.log('=== Agent Milestone Demo\n');
  const mgr = new MilestoneManager();

  console.log('1. Stats:', mgr.getStats());

  console.log('\n2. EMP001 Milestones:');
  mgr.getByEmployee('EMP001').forEach(m => console.log(`   - ${m.name}: ${m.status}`));

  console.log('\n3. Create Milestone:');
  const newMs = mgr.create({ name: 'Learn React', category: 'personal', employeeId: 'EMP003', status: 'pending' });
  console.log(`   Created: ${newMs.name}`);

  console.log('\n4. Complete Milestone:');
  const completed = mgr.complete('ms-2');
  console.log(`   Completed: ${completed.name}`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new MilestoneManager();

if (command === 'demo') runDemo();
else console.log('Usage: node agent-milestone.js [demo]');
