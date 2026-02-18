/**
 * Agent Mentor - Mentorship Matching Module
 *
 * Manages mentorship programs and matching.
 *
 * Usage: node agent-mentor.js [command]
 */

class Mentorship {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.mentorId = config.mentorId;
    this.menteeId = config.menteeId;
    this.startDate = config.startDate ? new Date(config.startDate) : new Date();
    this.endDate = config.endDate ? new Date(config.endDate) : null;
    this.status = config.status || 'active'; // active, completed, cancelled
    this.goals = config.goals || [];
  }
}

class MentorManager {
  constructor() {
    this.mentorships = new Map();
    this.employees = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    this.employees.set('EMP001', { id: 'EMP001', name: 'Alice', skills: ['Python', 'JavaScript'], isMentor: true });
    this.employees.set('EMP002', { id: 'EMP002', name: 'Bob', skills: ['Go', 'DevOps'], isMentor: true });
    this.employees.set('EMP003', { id: 'EMP003', name: 'Carol', skills: ['Python'], isMentor: false });
    this.employees.set('EMP004', { id: 'EMP004', name: 'David', skills: ['JavaScript'], isMentor: false });

    const ms = new Mentorship({ mentorId: 'EMP001', menteeId: 'EMP003', goals: ['Learn Python'] });
    this.mentorships.set(ms.id, ms);
  }

  matchMentor(menteeId, skills) {
    const mentors = Array.from(this.employees.values()).filter(e => e.isMentor);
    const match = mentors.find(m => skills.some(s => m.skills.includes(s)));
    return match || null;
  }

  createMentorship(mentorId, menteeId, goals = []) {
    const ms = new Mentorship({ mentorId, menteeId, goals });
    this.mentorships.set(ms.id, ms);
    return ms;
  }

  getMentorships(employeeId) {
    return Array.from(this.mentorships.values()).filter(m => m.mentorId === employeeId || m.menteeId === employeeId);
  }
}

function runDemo() {
  console.log('=== Agent Mentor Demo\n');
  const mgr = new MentorManager();

  console.log('1. Match Mentor:');
  const match = mgr.matchMentor('EMP004', ['Go']);
  console.log(`   Match: ${match?.name || 'None'}`);

  console.log('\n2. Create Mentorship:');
  const ms = mgr.createMentorship('EMP002', 'EMP004', ['Learn DevOps']);
  console.log(`   Created: ${ms.mentorId} -> ${ms.menteeId}`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
if ((args[0] || 'demo') === 'demo') runDemo();
