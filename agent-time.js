/**
 * Agent Time Module
 *
 * Provides time tracking and management.
 * Usage: node agent-time.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show time stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

/**
 * Time Entry Status
 */
const TimeEntryStatus = {
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  INVOICED: 'invoiced'
};

/**
 * Project
 */
class Project {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.client = config.client || null;
    this.status = config.status || 'active';
    this.budget = config.budget || 0;
    this.budgetType = config.budgetType || 'hours'; // hours, fixed
    this.hourlyRate = config.hourlyRate || 0;
    this.startDate = config.startDate || Date.now();
    this.endDate = config.endDate || null;
  }

  isActive() {
    return this.status === 'active';
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      client: this.client,
      status: this.status,
      budget: this.budget,
      budgetType: this.budgetType,
      hourlyRate: this.hourlyRate
    };
  }
}

/**
 * Time Entry
 */
class TimeEntry {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.userId = config.userId;
    this.projectId = config.projectId;
    this.taskName = config.taskName;
    this.description = config.description || '';
    this.startTime = config.startTime;
    this.endTime = config.endTime;
    this.duration = config.duration || 0; // in minutes
    this.date = config.date || new Date().toISOString().split('T')[0];
    this.status = config.status || TimeEntryStatus.DRAFT;
    this.billable = config.billable !== false;
    this.tags = config.tags || [];
    this.createdAt = Date.now();
  }

  calculateDuration() {
    if (this.startTime && this.endTime) {
      this.duration = Math.round((this.endTime - this.startTime) / 60000);
    }
    return this.duration;
  }

  getHours() {
    return this.duration / 60;
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      projectId: this.projectId,
      taskName: this.taskName,
      description: this.description,
      date: this.date,
      duration: this.duration,
      hours: this.getHours(),
      status: this.status,
      billable: this.billable,
      tags: this.tags
    };
  }
}

/**
 * Time Off Request
 */
class TimeOffRequest {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.userId = config.userId;
    this.type = config.type; // vacation, sick, personal, holiday
    this.startDate = config.startDate;
    this.endDate = config.endDate;
    this.days = config.days;
    this.reason = config.reason || '';
    this.status = config.status || 'pending';
    this.approvedBy = config.approvedBy || null;
    this.createdAt = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      type: this.type,
      startDate: this.startDate,
      endDate: this.endDate,
      days: this.days,
      reason: this.reason,
      status: this.status
    };
  }
}

/**
 * Time Manager
 */
class TimeManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.projects = new Map();
    this.entries = new Map();
    this.timeOffRequests = new Map();
    this.stats = {
      totalEntries: 0,
      totalHours: 0,
      billableHours: 0,
      nonBillableHours: 0,
      entriesApproved: 0,
      entriesPending: 0
    };

    this._init();
  }

  _init() {
    this._createSampleData();
  }

  _createSampleData() {
    // Sample projects
    const projects = [
      new Project({
        name: 'Website Redesign',
        client: 'Acme Corp',
        budget: 200,
        budgetType: 'hours',
        hourlyRate: 150
      }),
      new Project({
        name: 'Mobile App Development',
        client: 'TechStart',
        budget: 500,
        budgetType: 'hours',
        hourlyRate: 175
      }),
      new Project({
        name: 'Internal Tools',
        client: 'Internal',
        budget: 100,
        budgetType: 'hours',
        hourlyRate: 100
      })
    ];

    for (const proj of projects) {
      this.projects.set(proj.id, proj);
    }

    // Sample time entries
    const today = new Date();
    const entries = [
      new TimeEntry({
        userId: 'user-001',
        projectId: projects[0].id,
        taskName: 'Design mockups',
        description: 'Created initial wireframes for homepage',
        startTime: today.setHours(9, 0, 0, 0),
        endTime: today.setHours(12, 0, 0, 0),
        date: new Date().toISOString().split('T')[0],
        status: TimeEntryStatus.APPROVED,
        billable: true
      }),
      new TimeEntry({
        userId: 'user-001',
        projectId: projects[1].id,
        taskName: 'API Integration',
        description: 'Implemented REST API endpoints',
        startTime: today.setHours(13, 0, 0, 0),
        endTime: today.setHours(17, 30, 0, 0),
        date: new Date().toISOString().split('T')[0],
        status: TimeEntryStatus.SUBMITTED,
        billable: true
      }),
      new TimeEntry({
        userId: 'user-001',
        projectId: projects[2].id,
        taskName: 'Team meeting',
        description: 'Weekly sync with team',
        startTime: today.setHours(8, 30, 0, 0),
        endTime: today.setHours(9, 0, 0, 0),
        date: new Date().toISOString().split('T')[0],
        status: TimeEntryStatus.APPROVED,
        billable: false,
        tags: ['meeting']
      })
    ];

    for (const entry of entries) {
      entry.calculateDuration();
      this.entries.set(entry.id, entry);
      this._updateStats(entry);
    }
  }

  _updateStats(entry) {
    this.stats.totalEntries++;
    this.stats.totalHours += entry.getHours();
    if (entry.billable) {
      this.stats.billableHours += entry.getHours();
    } else {
      this.stats.nonBillableHours += entry.getHours();
    }
    if (entry.status === TimeEntryStatus.APPROVED) {
      this.stats.entriesApproved++;
    } else if (entry.status === TimeEntryStatus.SUBMITTED) {
      this.stats.entriesPending++;
    }
  }

  /**
   * Create time entry
   */
  createEntry(config) {
    const entry = new TimeEntry(config);
    entry.calculateDuration();
    this.entries.set(entry.id, entry);
    this._updateStats(entry);
    return {
      success: true,
      entryId: entry.id,
      entry: entry.toJSON()
    };
  }

  /**
   * Get entries by user
   */
  getUserEntries(userId, filters = {}) {
    const results = [];
    for (const entry of this.entries.values()) {
      if (entry.userId !== userId) continue;

      if (filters.projectId && entry.projectId !== filters.projectId) continue;
      if (filters.date && entry.date !== filters.date) continue;
      if (filters.status && entry.status !== filters.status) continue;

      results.push(entry);
    }
    return results;
  }

  /**
   * Get entries by project
   */
  getProjectEntries(projectId) {
    const results = [];
    for (const entry of this.entries.values()) {
      if (entry.projectId === projectId) {
        results.push(entry);
      }
    }
    return results;
  }

  /**
   * Get project
   */
  getProject(projectId) {
    return this.projects.get(projectId);
  }

  /**
   * Create project
   */
  createProject(config) {
    const project = new Project(config);
    this.projects.set(project.id, project);
    return {
      success: true,
      projectId: project.id,
      project: project.toJSON()
    };
  }

  /**
   * Update entry status
   */
  updateEntryStatus(entryId, status) {
    const entry = this.entries.get(entryId);
    if (!entry) {
      return { success: false, reason: 'Entry not found' };
    }

    const oldStatus = entry.status;
    entry.status = status;

    // Update stats
    if (status === TimeEntryStatus.APPROVED && oldStatus !== TimeEntryStatus.APPROVED) {
      this.stats.entriesApproved++;
      if (oldStatus === TimeEntryStatus.SUBMITTED) this.stats.entriesPending--;
    }

    return {
      success: true,
      entryId: entry.id,
      oldStatus,
      newStatus: status
    };
  }

  /**
   * Get time summary
   */
  getTimeSummary(userId, startDate, endDate) {
    let totalHours = 0;
    let billableHours = 0;
    let nonBillableHours = 0;
    const byProject = {};
    const byTask = {};

    for (const entry of this.entries.values()) {
      if (userId && entry.userId !== userId) continue;
      if (startDate && entry.date < startDate) continue;
      if (endDate && entry.date > endDate) continue;

      totalHours += entry.getHours();

      if (entry.billable) {
        billableHours += entry.getHours();
      } else {
        nonBillableHours += entry.getHours();
      }

      // By project
      if (!byProject[entry.projectId]) {
        byProject[entry.projectId] = { hours: 0, billable: 0 };
      }
      byProject[entry.projectId].hours += entry.getHours();
      if (entry.billable) {
        byProject[entry.projectId].billable += entry.getHours();
      }

      // By task
      if (!byTask[entry.taskName]) {
        byTask[entry.taskName] = 0;
      }
      byTask[entry.taskName] += entry.getHours();
    }

    return {
      userId,
      totalHours,
      billableHours,
      nonBillableHours,
      byProject,
      byTask,
      dateRange: { startDate, endDate }
    };
  }

  /**
   * Get project budget status
   */
  getProjectBudgetStatus(projectId) {
    const project = this.projects.get(projectId);
    if (!project) return null;

    const entries = this.getProjectEntries(projectId);
    const totalHours = entries.reduce((sum, e) => sum + e.getHours(), 0);
    const billableHours = entries.filter(e => e.billable).reduce((sum, e) => sum + e.getHours(), 0);

    let budgetUsed = 0;
    if (project.budgetType === 'hours') {
      budgetUsed = totalHours;
    } else if (project.budgetType === 'fixed') {
      budgetUsed = totalHours * project.hourlyRate;
    }

    const budgetRemaining = project.budget - budgetUsed;
    const percentUsed = project.budget > 0 ? (budgetUsed / project.budget) * 100 : 0;

    return {
      project: project.toJSON(),
      totalHours,
      billableHours,
      budgetUsed,
      budgetRemaining,
      percentUsed: Math.round(percentUsed)
    };
  }

  /**
   * Submit time off request
   */
  submitTimeOff(config) {
    const request = new TimeOffRequest(config);
    this.timeOffRequests.set(request.id, request);
    return {
      success: true,
      requestId: request.id,
      request: request.toJSON()
    };
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals() {
    const results = [];
    for (const entry of this.entries.values()) {
      if (entry.status === TimeEntryStatus.SUBMITTED) {
        results.push(entry);
      }
    }
    return results;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      totalProjects: this.projects.size,
      totalEntries: this.entries.size,
      pendingApprovals: this.getPendingApprovals().length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Time Demo\n');

  const manager = new TimeManager();

  // Show projects
  console.log('1. Projects:');
  for (const project of manager.projects.values()) {
    console.log(`   ${project.name} (${project.client})`);
    console.log(`      Budget: ${project.budget} ${project.budgetType}`);
    console.log(`      Rate: $${project.hourlyRate}/hour`);
  }

  // Show today's entries
  console.log('\n2. Today\'s Time Entries:');
  const today = new Date().toISOString().split('T')[0];
  const entries = manager.getUserEntries('user-001', { date: today });
  console.log(`   Total entries: ${entries.length}`);
  for (const entry of entries) {
    console.log(`   - ${entry.taskName}: ${entry.getHours()}h (${entry.status})`);
  }

  // Create new entry
  console.log('\n3. Creating New Time Entry:');
  const project = Array.from(manager.projects.values())[0];
  const newEntry = manager.createEntry({
    userId: 'user-001',
    projectId: project.id,
    taskName: 'Code review',
    description: 'Reviewed pull requests for feature branch',
    startTime: Date.now() - 2 * 60 * 60 * 1000,
    endTime: Date.now() - 1 * 60 * 60 * 1000,
    billable: true
  });
  console.log(`   Success: ${newEntry.success}`);
  console.log(`   Entry ID: ${newEntry.entryId}`);
  console.log(`   Hours: ${newEntry.entry.hours}`);

  // Submit entry
  console.log('\n4. Submitting Entry for Approval:');
  const submitResult = manager.updateEntryStatus(newEntry.entryId, TimeEntryStatus.SUBMITTED);
  console.log(`   Success: ${submitResult.success}`);
  console.log(`   New Status: ${submitResult.newStatus}`);

  // Approve entry
  console.log('\n5. Approving Entry:');
  const approveResult = manager.updateEntryStatus(newEntry.entryId, TimeEntryStatus.APPROVED);
  console.log(`   Success: ${approveResult.success}`);
  console.log(`   New Status: ${approveResult.newStatus}`);

  // Time summary
  console.log('\n6. Time Summary (user-001):');
  const summary = manager.getTimeSummary('user-001');
  console.log(`   Total Hours: ${summary.totalHours.toFixed(2)}`);
  console.log(`   Billable Hours: ${summary.billableHours.toFixed(2)}`);
  console.log(`   Non-billable Hours: ${summary.nonBillableHours.toFixed(2)}`);
  console.log(`   By Task:`);
  for (const [task, hours] of Object.entries(summary.byTask)) {
    console.log(`      ${task}: ${hours.toFixed(2)}h`);
  }

  // Project budget status
  console.log('\n7. Project Budget Status:');
  const budgetStatus = manager.getProjectBudgetStatus(project.id);
  console.log(`   Project: ${budgetStatus.project.name}`);
  console.log(`   Total Hours: ${budgetStatus.totalHours}`);
  console.log(`   Budget Used: ${budgetStatus.budgetUsed} ${budgetStatus.project.budgetType}`);
  console.log(`   Budget Remaining: ${budgetStatus.budgetRemaining}`);
  console.log(`   Percent Used: ${budgetStatus.percentUsed}%`);

  // Pending approvals
  console.log('\n8. Pending Approvals:');
  const pending = manager.getPendingApprovals();
  console.log(`   Count: ${pending.length}`);

  // Time off request
  console.log('\n9. Submitting Time Off Request:');
  const timeOff = manager.submitTimeOff({
    userId: 'user-001',
    type: 'vacation',
    startDate: '2026-03-01',
    endDate: '2026-03-05',
    days: 5,
    reason: 'Family vacation'
  });
  console.log(`   Success: ${timeOff.success}`);
  console.log(`   Request ID: ${timeOff.requestId}`);

  // Stats
  console.log('\n10. Statistics:');
  const stats = manager.getStats();
  console.log(`    Total Entries: ${stats.totalEntries}`);
  console.log(`    Total Hours: ${stats.totalHours.toFixed(2)}`);
  console.log(`    Billable Hours: ${stats.billableHours.toFixed(2)}`);
  console.log(`    Non-billable Hours: ${stats.nonBillableHours.toFixed(2)}`);
  console.log(`    Entries Approved: ${stats.entriesApproved}`);
  console.log(`    Entries Pending: ${stats.entriesPending}`);
  console.log(`    Pending Approvals: ${stats.pendingApprovals}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new TimeManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Time Module');
  console.log('Usage: node agent-time.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
