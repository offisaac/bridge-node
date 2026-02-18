/**
 * On-Call Rotation - 值班轮换
 * 实现值班计划和升级管理
 */

const fs = require('fs');
const path = require('path');

// ========== Rotation Types ==========

const RotationType = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
  CUSTOM: 'custom'
};

const EscalationLevel = {
  LEVEL_1: 1,
  LEVEL_2: 2,
  LEVEL_3: 3,
  LEVEL_4: 4
};

const DutyStatus = {
  ON_DUTY: 'on_duty',
  OFF_DUTY: 'off_duty',
  ON_LEAVE: 'on_leave',
  UNAVAILABLE: 'unavailable'
};

// ========== Team Member ==========

class TeamMember {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.email = config.email;
    this.phone = config.phone || null;
    this.slack = config.slack || null;
    this.timezone = config.timezone || 'UTC';
    this.skills = config.skills || [];
    this.maxShiftsPerMonth = config.maxShiftsPerMonth || 5;
    this.preferredShifts = config.preferredShifts || [];
    this.unavailableDates = config.unavailableDates || [];
    this.status = DutyStatus.OFF_DUTY;
  }

  isAvailable(date) {
    const dateStr = new Date(date).toISOString().split('T')[0];
    return !this.unavailableDates.includes(dateStr);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      email: this.email,
      phone: this.phone,
      slack: this.slack,
      timezone: this.timezone,
      skills: this.skills,
      maxShiftsPerMonth: this.maxShiftsPerMonth,
      preferredShifts: this.preferredShifts,
      unavailableDates: this.unavailableDates,
      status: this.status
    };
  }
}

// ========== Schedule Entry ==========

class ScheduleEntry {
  constructor(config) {
    this.id = config.id || `entry_${Date.now()}`;
    this.memberId = config.memberId;
    this.rotationId = config.rotationId;
    this.startTime = config.startTime;
    this.endTime = config.endTime;
    this.status = config.status || DutyStatus.ON_DUTY;
    this.notes = config.notes || '';
  }

  isActive(timestamp = Date.now()) {
    const time = new Date(timestamp).getTime();
    return time >= new Date(this.startTime).getTime() &&
           time <= new Date(this.endTime).getTime();
  }

  toJSON() {
    return {
      id: this.id,
      memberId: this.memberId,
      rotationId: this.rotationId,
      startTime: this.startTime,
      endTime: this.endTime,
      status: this.status,
      notes: this.notes
    };
  }
}

// ========== Escalation Policy ==========

class EscalationPolicy {
  constructor(config) {
    this.id = config.id || `policy_${Date.now()}`;
    this.name = config.name;
    this.description = config.description || '';
    this.steps = config.steps || []; // [{ level, delayMinutes, contacts }]
    this.escalateIfUnacknowledged = config.escalateIfUnacknowledged || true;
    this.ackTimeoutMinutes = config.ackTimeoutMinutes || 15;
  }

  addStep(level, delayMinutes, contacts) {
    this.steps.push({ level, delayMinutes, contacts });
    return this;
  }

  getStepForLevel(level) {
    return this.steps.find(s => s.level === level);
  }

  getNextLevel(currentLevel) {
    const currentIndex = this.steps.findIndex(s => s.level === currentLevel);
    if (currentIndex < this.steps.length - 1) {
      return this.steps[currentIndex + 1];
    }
    return null;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      steps: this.steps,
      escalateIfUnacknowledged: this.escalateIfUnacknowledged,
      ackTimeoutMinutes: this.ackTimeoutMinutes
    };
  }
}

// ========== On-Call Rotation ==========

class OnCallRotation {
  constructor(config) {
    this.id = config.id || `rotation_${Date.now()}`;
    this.name = config.name;
    this.description = config.description || '';
    this.type = config.type || RotationType.WEEKLY;
    this.timezone = config.timezone || 'UTC';
    this.startDate = config.startDate;
    this.handoffTime = config.handoffTime || '09:00'; // Time of day for handoff
    this.members = config.members || []; // Array of member IDs
    this.escalationPolicyId = config.escalationPolicyId;
    this.overrides = config.overrides || []; // Manual overrides
    this.schedule = config.schedule || [];
  }

  getCurrentOnDuty(timestamp = Date.now()) {
    // Check overrides first
    for (const override of this.overrides) {
      const entry = new ScheduleEntry(override);
      if (entry.isActive(timestamp)) {
        return override.memberId;
      }
    }

    // Calculate based on rotation
    const startTime = new Date(this.startDate).getTime();
    const currentTime = new Date(timestamp).getTime();
    const elapsed = currentTime - startTime;

    let intervalMs;
    switch (this.type) {
      case RotationType.DAILY:
        intervalMs = 24 * 60 * 60 * 1000;
        break;
      case RotationType.WEEKLY:
        intervalMs = 7 * 24 * 60 * 60 * 1000;
        break;
      case RotationType.BIWEEKLY:
        intervalMs = 14 * 24 * 60 * 60 * 1000;
        break;
      case RotationType.MONTHLY:
        intervalMs = 30 * 24 * 60 * 60 * 1000;
        break;
      default:
        intervalMs = 7 * 24 * 60 * 60 * 1000;
    }

    const intervals = Math.floor(elapsed / intervalMs);
    const memberIndex = intervals % this.members.length;

    return this.members[memberIndex];
  }

  getSchedule(startDate, endDate) {
    const schedule = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Generate regular schedule
    let currentDate = new Date(start);
    let memberIndex = 0;

    while (currentDate <= end) {
      const memberId = this.members[memberIndex];
      const nextDate = this._getNextHandoff(currentDate);

      schedule.push({
        memberId,
        startTime: currentDate.toISOString(),
        endTime: nextDate.toISOString()
      });

      currentDate = nextDate;
      memberIndex = (memberIndex + 1) % this.members.length;
    }

    // Apply overrides
    for (const override of this.overrides) {
      const idx = schedule.findIndex(s =>
        new Date(s.startTime) <= new Date(override.startTime) &&
        new Date(s.endTime) >= new Date(override.startTime)
      );
      if (idx >= 0) {
        schedule[idx] = {
          memberId: override.memberId,
          startTime: override.startTime,
          endTime: override.endTime
        };
      }
    }

    return schedule;
  }

  addOverride(memberId, startTime, endTime, reason) {
    this.overrides.push({
      memberId,
      startTime,
      endTime,
      reason: reason || ''
    });
    return this;
  }

  _getNextHandoff(date) {
    const d = new Date(date);
    switch (this.type) {
      case RotationType.DAILY:
        d.setDate(d.getDate() + 1);
        break;
      case RotationType.WEEKLY:
        d.setDate(d.getDate() + 7);
        break;
      case RotationType.BIWEEKLY:
        d.setDate(d.getDate() + 14);
        break;
      case RotationType.MONTHLY:
        d.setMonth(d.getMonth() + 1);
        break;
      default:
        d.setDate(d.getDate() + 7);
    }
    return d;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      timezone: this.timezone,
      startDate: this.startDate,
      handoffTime: this.handoffTime,
      members: this.members,
      escalationPolicyId: this.escalationPolicyId,
      overrides: this.overrides
    };
  }
}

// ========== On-Call Manager ==========

class OnCallManager {
  constructor(options = {}) {
    this.members = new Map(); // id -> TeamMember
    this.rotations = new Map(); // id -> OnCallRotation
    this.policies = new Map(); // id -> EscalationPolicy
    this.alerts = new Map(); // id -> alert tracking
    this.storageDir = options.storageDir || './oncall-data';

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
  }

  // ========== Member Management ==========

  addMember(config) {
    const member = new TeamMember({
      id: config.id || `member_${Date.now()}`,
      ...config
    });

    this.members.set(member.id, member);
    this._saveData();
    return member;
  }

  getMember(id) {
    return this.members.get(id);
  }

  listMembers(filters = {}) {
    let result = Array.from(this.members.values());

    if (filters.status) {
      result = result.filter(m => m.status === filters.status);
    }

    if (filters.skill) {
      result = result.filter(m => m.skills.includes(filters.skill));
    }

    return result;
  }

  updateMember(id, updates) {
    const existing = this.members.get(id);
    if (!existing) {
      throw new Error(`Member not found: ${id}`);
    }

    const updated = new TeamMember({
      ...existing.toJSON(),
      ...updates,
      id: existing.id
    });

    this.members.set(id, updated);
    this._saveData();
    return updated;
  }

  removeMember(id) {
    this.members.delete(id);
    this._saveData();
  }

  // ========== Rotation Management ==========

  createRotation(config) {
    const rotation = new OnCallRotation({
      id: config.id || `rotation_${Date.now()}`,
      ...config
    });

    this.rotations.set(rotation.id, rotation);
    this._saveData();
    return rotation;
  }

  getRotation(id) {
    return this.rotations.get(id);
  }

  listRotations() {
    return Array.from(this.rotations.values());
  }

  updateRotation(id, updates) {
    const existing = this.rotations.get(id);
    if (!existing) {
      throw new Error(`Rotation not found: ${id}`);
    }

    const updated = new OnCallRotation({
      ...existing.toJSON(),
      ...updates,
      id: existing.id
    });

    this.rotations.set(id, updated);
    this._saveData();
    return updated;
  }

  deleteRotation(id) {
    this.rotations.delete(id);
    this._saveData();
  }

  // ========== Current On-Call ==========

  getCurrentOnCall(rotationId) {
    const rotation = this.rotations.get(rotationId);
    if (!rotation) {
      throw new Error(`Rotation not found: ${rotationId}`);
    }

    const memberId = rotation.getCurrentOnDuty();
    return this.members.get(memberId);
  }

  getOnCallSchedule(rotationId, startDate, endDate) {
    const rotation = this.rotations.get(rotationId);
    if (!rotation) {
      throw new Error(`Rotation not found: ${rotationId}`);
    }

    const schedule = rotation.getSchedule(startDate, endDate);
    return schedule.map(entry => ({
      ...entry,
      member: this.members.get(entry.memberId)?.toJSON()
    }));
  }

  // ========== Escalation Policy Management ==========

  createPolicy(config) {
    const policy = new EscalationPolicy({
      id: config.id || `policy_${Date.now()}`,
      ...config
    });

    this.policies.set(policy.id, policy);
    this._saveData();
    return policy;
  }

  getPolicy(id) {
    return this.policies.get(id);
  }

  listPolicies() {
    return Array.from(this.policies.values());
  }

  // ========== Override Management ==========

  addOverride(rotationId, memberId, startTime, endTime, reason) {
    const rotation = this.rotations.get(rotationId);
    if (!rotation) {
      throw new Error(`Rotation not found: ${rotationId}`);
    }

    rotation.addOverride(memberId, startTime, endTime, reason);
    this._saveData();
    return rotation;
  }

  // ========== Who's Available ==========

  getAvailableMembers(date) {
    return Array.from(this.members.values())
      .filter(m => m.isAvailable(date));
  }

  // ========== Statistics ==========

  getStats() {
    return {
      totalMembers: this.members.size,
      totalRotations: this.rotations.size,
      totalPolicies: this.policies.size,
      onDutyNow: Array.from(this.members.values()).filter(m => m.status === DutyStatus.ON_DUTY).length,
      byStatus: Array.from(this.members.values()).reduce((acc, m) => {
        acc[m.status] = (acc[m.status] || 0) + 1;
        return acc;
      }, {})
    };
  }

  // ========== Persistence ==========

  _loadData() {
    const file = path.join(this.storageDir, 'oncall.json');
    if (!fs.existsSync(file)) return;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));

      for (const memberData of data.members || []) {
        const member = new TeamMember(memberData);
        this.members.set(member.id, member);
      }

      for (const rotationData of data.rotations || []) {
        const rotation = new OnCallRotation(rotationData);
        this.rotations.set(rotation.id, rotation);
      }

      for (const policyData of data.policies || []) {
        const policy = new EscalationPolicy(policyData);
        this.policies.set(policy.id, policy);
      }
    } catch (err) {
      console.error('Failed to load on-call data:', err);
    }
  }

  _saveData() {
    const data = {
      members: Array.from(this.members.values()).map(m => m.toJSON()),
      rotations: Array.from(this.rotations.values()).map(r => r.toJSON()),
      policies: Array.from(this.policies.values()).map(p => p.toJSON())
    };

    fs.writeFileSync(
      path.join(this.storageDir, 'oncall.json'),
      JSON.stringify(data, null, 2)
    );
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new OnCallManager();

  switch (command) {
    case 'members':
      console.log('Team Members:');
      console.log('=============');
      for (const member of manager.listMembers()) {
        console.log(`\n${member.name} (${member.id})`);
        console.log(`  Email: ${member.email}`);
        console.log(`  Skills: ${member.skills.join(', ')}`);
        console.log(`  Status: ${member.status}`);
      }
      break;

    case 'add-member':
      const member = manager.addMember({
        name: args[1] || 'John Doe',
        email: args[2] || 'john@example.com',
        skills: ['backend', 'database']
      });
      console.log(`Added member: ${member.id}`);
      break;

    case 'rotations':
      console.log('On-Call Rotations:');
      console.log('==================');
      for (const rotation of manager.listRotations()) {
        console.log(`\n${rotation.name} (${rotation.type})`);
        console.log(`  Members: ${rotation.members.length}`);
        console.log(`  Current: ${rotation.getCurrentOnDuty()}`);
      }
      break;

    case 'current':
      const rotationId = args[1];
      if (rotationId) {
        const current = manager.getCurrentOnCall(rotationId);
        console.log('Current on-call:', current?.name);
      } else {
        console.log('Available rotations:');
        for (const r of manager.listRotations()) {
          const current = manager.getCurrentOnCall(r.id);
          console.log(`  ${r.name}: ${current?.name || 'Unknown'}`);
        }
      }
      break;

    case 'schedule':
      const rId = args[1];
      const start = args[2] || new Date().toISOString();
      const end = args[3] || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      if (rId) {
        const schedule = manager.getOnCallSchedule(rId, start, end);
        console.log('Schedule:');
        for (const entry of schedule) {
          console.log(`  ${entry.member?.name}: ${entry.startTime} - ${entry.endTime}`);
        }
      }
      break;

    case 'stats':
      console.log('On-Call Statistics:');
      console.log('====================');
      console.log(JSON.stringify(manager.getStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node oncall.js members                    - List team members');
      console.log('  node oncall.js add-member <name> <email> - Add member');
      console.log('  node oncall.js rotations                  - List rotations');
      console.log('  node oncall.js current [rotationId]      - Get current on-call');
      console.log('  node oncall.js schedule <rotationId> <start> <end> - Get schedule');
      console.log('  node oncall.js stats                      - Show statistics');
      console.log('\nRotation Types:', Object.values(RotationType).join(', '));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  OnCallManager,
  OnCallRotation,
  TeamMember,
  ScheduleEntry,
  EscalationPolicy,
  RotationType,
  EscalationLevel,
  DutyStatus
};
