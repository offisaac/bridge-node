/**
 * Agent Level - Level System Module
 *
 * Manages employee levels, experience points, and progression.
 *
 * Usage: node agent-level.js [command]
 */

class LevelConfig {
  constructor(config) {
    this.level = config.level;
    this.title = config.title;
    this.xpRequired = config.xpRequired;
    this.benefits = config.benefits || [];
  }
}

class EmployeeLevel {
  constructor(config) {
    this.employeeId = config.employeeId;
    this.level = config.level || 1;
    this.xp = config.xp || 0;
    this.title = config.title || 'Junior';
    this.promotedAt = config.promotedAt ? new Date(config.promotedAt) : null;
  }

  addXp(amount) {
    this.xp += amount;
  }
}

class LevelManager {
  constructor() {
    this.levels = [];
    this.employees = new Map();
    this._initLevels();
    this._initSampleEmployees();
  }

  _initLevels() {
    this.levels = [
      new LevelConfig({ level: 1, title: 'Junior', xpRequired: 0, benefits: ['Basic training'] }),
      new LevelConfig({ level: 2, title: 'Associate', xpRequired: 100, benefits: ['Advanced training'] }),
      new LevelConfig({ level: 3, title: 'Mid-Level', xpRequired: 300, benefits: ['Mentorship'] }),
      new LevelConfig({ level: 4, title: 'Senior', xpRequired: 600, benefits: ['Leadership training'] }),
      new LevelConfig({ level: 5, title: 'Lead', xpRequired: 1000, benefits: ['Team lead'] }),
      new LevelConfig({ level: 6, title: 'Principal', xpRequired: 2000, benefits: ['Strategic projects'] }),
      new LevelConfig({ level: 7, title: 'Staff', xpRequired: 3500, benefits: ['Board presentations'] }),
      new LevelConfig({ level: 8, title: 'Senior Staff', xpRequired: 5000, benefits: ['Executive mentoring'] }),
      new LevelConfig({ level: 9, title: 'Principal Engineer', xpRequired: 7500, benefits: ['Technical direction'] }),
      new LevelConfig({ level: 10, title: 'Fellow', xpRequired: 10000, benefits: ['Company equity'] })
    ];
  }

  _initSampleEmployees() {
    const emps = [
      { id: 'EMP001', level: 3, xp: 450 },
      { id: 'EMP002', level: 4, xp: 800 },
      { id: 'EMP003', level: 2, xp: 200 }
    ];
    emps.forEach(e => {
      const lvl = this.levels.find(l => l.level === e.level);
      this.employees.set(e.id, new EmployeeLevel({ employeeId: e.id, level: e.level, xp: e.xp, title: lvl.title }));
    });
  }

  addXp(employeeId, amount) {
    const emp = this.employees.get(employeeId);
    if (!emp) throw new Error('Employee not found');

    emp.addXp(amount);
    this._checkPromotion(emp);
    return emp;
  }

  _checkPromotion(emp) {
    for (let i = emp.level + 1; i < this.levels.length; i++) {
      const nextLevel = this.levels[i];
      if (emp.xp >= nextLevel.xpRequired) {
        emp.level = nextLevel.level;
        emp.title = nextLevel.title;
        emp.promotedAt = new Date();
      }
    }
  }

  getEmployeeLevel(employeeId) {
    return this.employees.get(employeeId);
  }

  getNextLevel(employeeId) {
    const emp = this.employees.get(employeeId);
    if (!emp) return null;
    return this.levels.find(l => l.level === emp.level + 1) || null;
  }
}

function runDemo() {
  console.log('=== Agent Level Demo\n');
  const mgr = new LevelManager();

  console.log('1. Employee Levels:');
  mgr.employees.forEach((e, id) => console.log(`   ${id}: Level ${e.level} ${e.title} (${e.xp} XP)`));

  console.log('\n2. Add XP:');
  const emp = mgr.addXp('EMP003', 150);
  console.log(`   EMP003 now: Level ${emp.level} ${emp.title} (${emp.xp} XP)`);

  console.log('\n3. Next Level Info:');
  const next = mgr.getNextLevel('EMP003');
  if (next) console.log(`   Next: Level ${next.level} ${next.title} (${next.xpRequired} XP required)`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
if ((args[0] || 'demo') === 'demo') runDemo();
