/**
 * Agent Gamification - Gamification Engine Module
 *
 * Manages achievements, badges, leaderboards, challenges, and rewards
 * to drive engagement and motivation.
 *
 * Usage: node agent-gamification.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   list    - List achievements
 *   ranks   - Show leaderboard
 */

class Achievement {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description || '';
    this.category = config.category; // performance, collaboration, milestone, special
    this.icon = config.icon || '🏆';
    this.points = config.points || 0;
    this.criteria = config.criteria || {};
    this.rarity = config.rarity || 'common'; // common, uncommon, rare, epic, legendary
    this.isActive = config.isActive !== false;
  }
}

class Badge extends Achievement {
  constructor(config) {
    super(config);
    this.type = 'badge';
    this.badgeId = config.badgeId || crypto.randomUUID();
  }
}

class UserBadge {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.badgeId = config.badgeId;
    this.employeeId = config.employeeId;
    this.earnedAt = config.earnedAt ? new Date(config.earnedAt) : new Date();
    this.metadata = config.metadata || {};
  }
}

class Challenge {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description;
    this.category = config.category || 'daily'; // daily, weekly, monthly, special
    this.startDate = config.startDate ? new Date(config.startDate) : new Date();
    this.endDate = config.endDate ? new Date(config.endDate) : null;
    this.target = config.target;
    this.points = config.points || 0;
    this.participants = config.participants || [];
    this.enabled = config.isActive !== false;
  }

  isActive() {
    const now = new Date();
    const started = now >= this.startDate;
    const notEnded = !this.endDate || now <= this.endDate;
    return this.enabled && started && notEnded;
  }
}

class Leaderboard {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type || 'points'; // points, badges, streaks, challenges
    this.period = config.period || 'all_time'; // daily, weekly, monthly, all_time
    this.entries = config.entries || [];
  }

  updateEntry(employeeId, score) {
    const existing = this.entries.find(e => e.employeeId === employeeId);
    if (existing) {
      existing.score = score;
      existing.updatedAt = new Date();
    } else {
      this.entries.push({
        employeeId,
        score,
        rank: 0,
        updatedAt: new Date()
      });
    }
    this.entries.sort((a, b) => b.score - a.score);
    this.entries.forEach((e, i) => e.rank = i + 1);
  }
}

class GamificationManager {
  constructor() {
    this.achievements = new Map();
    this.userBadges = new Map();
    this.challenges = new Map();
    this.leaderboards = new Map();
    this.points = new Map();
    this.employees = new Map();

    this._initializeDefaultAchievements();
    this._initializeSampleEmployees();
    this._initializeSampleData();
  }

  _initializeDefaultAchievements() {
    const achievements = [
      // Performance
      { category: 'performance', name: 'First Win', description: 'Complete your first task', icon: '🎯', points: 10, rarity: 'common' },
      { category: 'performance', name: 'Task Master', description: 'Complete 100 tasks', icon: '📋', points: 100, rarity: 'rare' },
      { category: 'performance', name: 'Speed Demon', description: 'Complete 10 tasks in one day', icon: '⚡', points: 50, rarity: 'uncommon' },
      { category: 'performance', name: 'Perfectionist', description: 'Achieve 100% quality score', icon: '💎', points: 75, rarity: 'epic' },
      { category: 'performance', name: 'Productivity Guru', description: 'Maintain 90%+ productivity for 30 days', icon: '📈', points: 200, rarity: 'legendary' },

      // Collaboration
      { category: 'collaboration', name: 'Team Player', description: 'Help 10 colleagues', icon: '🤝', points: 30, rarity: 'uncommon' },
      { category: 'collaboration', name: 'Mentor', description: 'Mentor a new employee', icon: '🎓', points: 50, rarity: 'rare' },
      { category: 'collaboration', name: 'Knowledge Sharer', description: 'Share 50 knowledge articles', icon: '📚', points: 75, rarity: 'rare' },

      // Milestone
      { category: 'milestone', name: 'Week Warrior', description: 'Work for 7 consecutive days', icon: '🔥', points: 25, rarity: 'uncommon' },
      { category: 'milestone', name: 'Month Master', description: 'Work for 30 consecutive days', icon: '🌟', points: 100, rarity: 'epic' },
      { category: 'milestone', name: 'Anniversary', description: 'Complete 1 year at company', icon: '🎂', points: 500, rarity: 'legendary' },

      // Special
      { category: 'special', name: 'Bug Hunter', description: 'Report 10 bugs', icon: '🐛', points: 40, rarity: 'uncommon' },
      { category: 'special', name: 'Innovation Champion', description: 'Submit 5 ideas', icon: '💡', points: 60, rarity: 'rare' },
      { category: 'special', name: 'Crisis Manager', description: 'Resolve 3 critical issues', icon: '🛡️', points: 100, rarity: 'epic' }
    ];

    achievements.forEach((a, i) => {
      const badge = new Badge({ ...a, id: `badge-${i + 1}` });
      this.achievements.set(badge.id, badge);
    });
  }

  _initializeSampleEmployees() {
    const employees = [
      { id: 'EMP001', name: 'Alice Johnson', department: 'Engineering' },
      { id: 'EMP002', name: 'Bob Williams', department: 'Engineering' },
      { id: 'EMP003', name: 'Carol Davis', department: 'Sales' },
      { id: 'EMP004', name: 'David Brown', department: 'Engineering' },
      { id: 'EMP005', name: 'Eva Martinez', department: 'HR' }
    ];
    employees.forEach(e => {
      this.employees.set(e.id, e);
      this.points.set(e.id, { employeeId: e.id, totalPoints: Math.floor(Math.random() * 500), level: 1, streak: Math.floor(Math.random() * 10) });
    });
  }

  _initializeSampleData() {
    // Award some badges
    const badges = ['badge-1', 'badge-2', 'badge-9'];
    badges.forEach(badgeId => {
      const ub = new UserBadge({ badgeId, employeeId: 'EMP001' });
      this.userBadges.set(ub.id, ub);
    });

    // Create leaderboard
    const lb = new Leaderboard({ name: 'Overall Leaderboard', type: 'points' });
    this.employees.forEach((emp, id) => {
      const pts = this.points.get(id);
      lb.updateEntry(id, pts.totalPoints);
    });
    this.leaderboards.set(lb.id, lb);
  }

  awardBadge(employeeId, badgeId) {
    const badge = this.achievements.get(badgeId);
    if (!badge) throw new Error('Achievement not found');

    // Check if already earned
    const existing = Array.from(this.userBadges.values()).find(
      ub => ub.badgeId === badgeId && ub.employeeId === employeeId
    );
    if (existing) throw new Error('Badge already earned');

    const userBadge = new UserBadge({ badgeId, employeeId });
    this.userBadges.set(userBadge.id, userBadge);

    // Add points
    this.addPoints(employeeId, badge.points);

    return { badge, userBadge };
  }

  addPoints(employeeId, points) {
    const empPoints = this.points.get(employeeId);
    if (!empPoints) {
      this.points.set(employeeId, { employeeId, totalPoints: points, level: 1, streak: 0 });
    } else {
      empPoints.totalPoints += points;
      empPoints.level = this._calculateLevel(empPoints.totalPoints);
    }
    return this.points.get(employeeId);
  }

  _calculateLevel(totalPoints) {
    if (totalPoints >= 5000) return 10;
    if (totalPoints >= 3000) return 9;
    if (totalPoints >= 2000) return 8;
    if (totalPoints >= 1500) return 7;
    if (totalPoints >= 1000) return 6;
    if (totalPoints >= 700) return 5;
    if (totalPoints >= 500) return 4;
    if (totalPoints >= 300) return 3;
    if (totalPoints >= 100) return 2;
    return 1;
  }

  getEmployeeProfile(employeeId) {
    const employee = this.employees.get(employeeId);
    const empPoints = this.points.get(employeeId);
    const userBadges = Array.from(this.userBadges.values()).filter(ub => ub.employeeId === employeeId);

    const badges = userBadges.map(ub => {
      const badge = this.achievements.get(ub.badgeId);
      return { ...badge, earnedAt: ub.earnedAt };
    });

    return {
      employee,
      points: empPoints,
      badges,
      nextLevelAt: this._getNextLevelPoints(empPoints?.level || 1)
    };
  }

  _getNextLevelPoints(currentLevel) {
    const thresholds = [0, 100, 300, 500, 700, 1000, 1500, 2000, 3000, 5000];
    return thresholds[currentLevel] || 5000;
  }

  getLeaderboard(type = 'points') {
    const lb = Array.from(this.leaderboards.values()).find(l => l.type === type);
    if (!lb) {
      const newLb = new Leaderboard({ name: `${type} Leaderboard`, type });
      this.leaderboards.set(newLb.id, newLb);
      return newLb;
    }
    return lb;
  }

  createChallenge(config) {
    const challenge = new Challenge(config);
    this.challenges.set(challenge.id, challenge);
    return challenge;
  }

  getActiveChallenges() {
    return Array.from(this.challenges.values()).filter(c => c.isActive());
  }
}

function runDemo() {
  console.log('=== Agent Gamification Demo\n');

  const manager = new GamificationManager();

  // 1. List employees
  console.log('1. Employees & Points:');
  manager.employees.forEach((emp, id) => {
    const pts = manager.points.get(id);
    console.log(`   ${emp.name}: ${pts.totalPoints} pts (Level ${pts.level})`);
  });

  // 2. List achievements
  console.log('\n2. Achievements:');
  const byCategory = {};
  manager.achievements.forEach(badge => {
    if (!byCategory[badge.category]) byCategory[badge.category] = [];
    byCategory[badge.category].push(badge);
  });
  Object.entries(byCategory).forEach(([cat, badges]) => {
    console.log(`   ${cat}:`);
    badges.forEach(b => console.log(`      ${b.icon} ${b.name}: ${b.points} pts [${b.rarity}]`));
  });

  // 3. Award new badge
  console.log('\n3. Award Badge:');
  const result = manager.awardBadge('EMP003', 'badge-1');
  console.log(`   Awarded "${result.badge.name}" to EMP003`);
  console.log(`   Points earned: ${result.badge.points}`);

  // 4. Employee profile
  console.log('\n4. Employee Profile (EMP001):');
  const profile = manager.getEmployeeProfile('EMP001');
  console.log(`   Name: ${profile.employee.name}`);
  console.log(`   Level: ${profile.points.level}`);
  console.log(`   Points: ${profile.points.totalPoints}`);
  console.log(`   Badges: ${profile.badges.length}`);
  profile.badges.forEach(b => console.log(`      ${b.icon} ${b.name}`));

  // 5. Leaderboard
  console.log('\n5. Leaderboard:');
  const lb = manager.getLeaderboard('points');
  lb.entries.slice(0, 5).forEach(e => {
    const emp = manager.employees.get(e.employeeId);
    console.log(`   #${e.rank} ${emp.name}: ${e.score} pts`);
  });

  // 6. Add more points
  console.log('\n6. Add Points:');
  const newPts = manager.addPoints('EMP003', 75);
  console.log(`   EMP003 now has ${newPts.totalPoints} pts (Level ${newPts.level})`);

  // 7. Create challenge
  console.log('\n7. Create Challenge:');
  const challenge = manager.createChallenge({
    name: 'February Sprint',
    description: 'Complete 50 tasks this month',
    category: 'monthly',
    startDate: new Date('2026-02-01'),
    endDate: new Date('2026-02-28'),
    target: 50,
    points: 200,
    participants: ['EMP001', 'EMP002', 'EMP003']
  });
  console.log(`   Created: ${challenge.name}`);
  console.log(`   Points: ${challenge.points}`);

  // 8. Active challenges
  console.log('\n8. Active Challenges:');
  const active = manager.getActiveChallenges();
  active.forEach(c => console.log(`   - ${c.name}: ${c.target} target, ${c.points} pts`));

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const manager = new GamificationManager();

switch (command) {
  case 'demo': runDemo(); break;
  case 'list':
    console.log('Achievements:\n');
    manager.achievements.forEach(b => console.log(`${b.icon} ${b.name}: ${b.points} pts [${b.rarity}]`));
    break;
  case 'ranks':
    console.log('Leaderboard:\n');
    const lb = manager.getLeaderboard();
    lb.entries.forEach(e => console.log(`#${e.rank} ${manager.employees.get(e.employeeId)?.name}: ${e.score}`));
    break;
  default:
    console.log('Usage: node agent-gamification.js [demo|list|ranks]');
}
