/**
 * Agent Leave Request Module
 *
 * Provides leave request management for employees.
 * Usage: node agent-leave-request.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   list                   List leave requests
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

/**
 * Leave Type
 */
const LeaveType = {
  ANNUAL: 'annual',
  SICK: 'sick',
  PERSONAL: 'personal',
  MATERNITY: 'maternity',
  PATERNITY: 'paternity',
  BEREAVEMENT: 'bereavement',
  UNPAID: 'unpaid',
  WORK_FROM_HOME: 'work_from_home',
  BEREAVEMENT_FAMILY: 'bereavement_family',
  JURY_DUTY: 'jury_duty',
  VOTING: 'voting',
  MILITARY: 'military'
};

/**
 * Leave Status
 */
const LeaveStatus = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed'
};

/**
 * Leave Request
 */
class LeaveRequest {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.leaveType = config.leaveType;
    this.startDate = config.startDate;
    this.endDate = config.endDate;
    this.totalDays = config.totalDays || 1;
    this.reason = config.reason || '';
    this.status = config.status || LeaveStatus.PENDING;
    this.approvedBy = config.approvedBy || null;
    this.approvedDate = config.approvedDate || null;
    this.rejectedReason = config.rejectedReason || '';
    this.attachments = config.attachments || [];
    this.emergencyContact = config.emergencyContact || '';
    this.createdAt = Date.now();
  }

  isActive() {
    return this.status === LeaveStatus.PENDING || this.status === LeaveStatus.APPROVED;
  }

  approve(approvedBy) {
    this.status = LeaveStatus.APPROVED;
    this.approvedBy = approvedBy;
    this.approvedDate = Date.now();
  }

  reject(approvedBy, reason) {
    this.status = LeaveStatus.REJECTED;
    this.approvedBy = approvedBy;
    this.rejectedReason = reason;
  }

  cancel() {
    this.status = LeaveStatus.CANCELLED;
  }

  toJSON() {
    return {
      id: this.id,
      employeeId: this.employeeId,
      employeeName: this.employeeName,
      leaveType: this.leaveType,
      startDate: this.startDate,
      endDate: this.endDate,
      totalDays: this.totalDays,
      reason: this.reason,
      status: this.status,
      approvedBy: this.approvedBy,
      approvedDate: this.approvedDate,
      rejectedReason: this.rejectedReason
    };
  }
}

/**
 * Leave Balance
 */
class LeaveBalance {
  constructor(config) {
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.leaveType = config.leaveType;
    this.totalDays = config.totalDays || 0;
    this.usedDays = config.usedDays || 0;
    this.pendingDays = config.pendingDays || 0;
  }

  getAvailableDays() {
    return Math.max(0, this.totalDays - this.usedDays - this.pendingDays);
  }

  toJSON() {
    return {
      employeeId: this.employeeId,
      employeeName: this.employeeName,
      leaveType: this.leaveType,
      totalDays: this.totalDays,
      usedDays: this.usedDays,
      pendingDays: this.pendingDays,
      availableDays: this.getAvailableDays()
    };
  }
}

/**
 * Leave Policy
 */
class LeavePolicy {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.leaveType = config.leaveType;
    this.maxDaysPerYear = config.maxDaysPerYear || 0;
    this.minDaysNotice = config.minDaysNotice || 0;
    this.maxConsecutiveDays = config.maxConsecutiveDays || 0;
    this.requiresApproval = config.requiresApproval !== false;
    this.requiresDocumentation = config.requiresDocumentation || false;
    this.isPaid = config.isPaid !== false;
    this.accrualEnabled = config.accrualEnabled || false;
    this.accrualDaysPerMonth = config.accrualDaysPerMonth || 0;
  }

  toJSON() {
    return {
      id: this.id,
      leaveType: this.leaveType,
      maxDaysPerYear: this.maxDaysPerYear,
      minDaysNotice: this.minDaysNotice,
      maxConsecutiveDays: this.maxConsecutiveDays,
      requiresApproval: this.requiresApproval,
      requiresDocumentation: this.requiresDocumentation,
      isPaid: this.isPaid,
      accrualEnabled: this.accrualEnabled,
      accrualDaysPerMonth: this.accrualDaysPerMonth
    };
  }
}

/**
 * Leave Manager
 */
class LeaveManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.requests = new Map();
    this.balances = new Map();
    this.policies = new Map();
    this.stats = {
      totalRequests: 0,
      pendingRequests: 0,
      approvedRequests: 0,
      rejectedRequests: 0,
      cancelledRequests: 0,
      totalDaysApproved: 0
    };

    this._init();
  }

  _init() {
    this._createPolicies();
    this._createSampleData();
  }

  _createPolicies() {
    const policies = [
      new LeavePolicy({
        leaveType: LeaveType.ANNUAL,
        maxDaysPerYear: 20,
        minDaysNotice: 3,
        maxConsecutiveDays: 10,
        requiresApproval: true,
        requiresDocumentation: false,
        isPaid: true,
        accrualEnabled: true,
        accrualDaysPerMonth: 1.67
      }),
      new LeavePolicy({
        leaveType: LeaveType.SICK,
        maxDaysPerYear: 10,
        minDaysNotice: 0,
        maxConsecutiveDays: 5,
        requiresApproval: true,
        requiresDocumentation: true,
        isPaid: true,
        accrualEnabled: true,
        accrualDaysPerMonth: 0.83
      }),
      new LeavePolicy({
        leaveType: LeaveType.PERSONAL,
        maxDaysPerYear: 5,
        minDaysNotice: 2,
        maxConsecutiveDays: 3,
        requiresApproval: true,
        requiresDocumentation: false,
        isPaid: true,
        accrualEnabled: true,
        accrualDaysPerMonth: 0.42
      }),
      new LeavePolicy({
        leaveType: LeaveType.MATERNITY,
        maxDaysPerYear: 90,
        minDaysNotice: 30,
        maxConsecutiveDays: 90,
        requiresApproval: true,
        requiresDocumentation: true,
        isPaid: true,
        accrualEnabled: false
      }),
      new LeavePolicy({
        leaveType: LeaveType.PATERNITY,
        maxDaysPerYear: 14,
        minDaysNotice: 7,
        maxConsecutiveDays: 14,
        requiresApproval: true,
        requiresDocumentation: true,
        isPaid: true,
        accrualEnabled: false
      }),
      new LeavePolicy({
        leaveType: LeaveType.BEREAVEMENT,
        maxDaysPerYear: 5,
        minDaysNotice: 0,
        maxConsecutiveDays: 5,
        requiresApproval: true,
        requiresDocumentation: true,
        isPaid: true,
        accrualEnabled: false
      }),
      new LeavePolicy({
        leaveType: LeaveType.UNPAID,
        maxDaysPerYear: 30,
        minDaysNotice: 7,
        maxConsecutiveDays: 30,
        requiresApproval: true,
        requiresDocumentation: false,
        isPaid: false,
        accrualEnabled: false
      }),
      new LeavePolicy({
        leaveType: LeaveType.WORK_FROM_HOME,
        maxDaysPerYear: 104,
        minDaysNotice: 1,
        maxConsecutiveDays: 5,
        requiresApproval: true,
        requiresDocumentation: false,
        isPaid: true,
        accrualEnabled: false
      })
    ];

    for (const policy of policies) {
      this.policies.set(policy.leaveType, policy);
    }
  }

  _createSampleData() {
    // Sample leave balances
    const balances = [
      new LeaveBalance({
        employeeId: 'emp-001',
        employeeName: 'John Smith',
        leaveType: LeaveType.ANNUAL,
        totalDays: 20,
        usedDays: 8,
        pendingDays: 3
      }),
      new LeaveBalance({
        employeeId: 'emp-001',
        employeeName: 'John Smith',
        leaveType: LeaveType.SICK,
        totalDays: 10,
        usedDays: 2,
        pendingDays: 0
      }),
      new LeaveBalance({
        employeeId: 'emp-002',
        employeeName: 'Jane Doe',
        leaveType: LeaveType.ANNUAL,
        totalDays: 20,
        usedDays: 15,
        pendingDays: 2
      }),
      new LeaveBalance({
        employeeId: 'emp-002',
        employeeName: 'Jane Doe',
        leaveType: LeaveType.PERSONAL,
        totalDays: 5,
        usedDays: 3,
        pendingDays: 0
      }),
      new LeaveBalance({
        employeeId: 'emp-003',
        employeeName: 'Bob Wilson',
        leaveType: LeaveType.ANNUAL,
        totalDays: 20,
        usedDays: 5,
        pendingDays: 0
      })
    ];

    for (const balance of balances) {
      const key = `${balance.employeeId}-${balance.leaveType}`;
      this.balances.set(key, balance);
    }

    // Sample leave requests
    const requests = [
      new LeaveRequest({
        employeeId: 'emp-001',
        employeeName: 'John Smith',
        leaveType: LeaveType.ANNUAL,
        startDate: '2026-03-15',
        endDate: '2026-03-19',
        totalDays: 5,
        reason: 'Family vacation',
        status: LeaveStatus.PENDING
      }),
      new LeaveRequest({
        employeeId: 'emp-002',
        employeeName: 'Jane Doe',
        leaveType: LeaveType.SICK,
        startDate: '2026-02-10',
        endDate: '2026-02-11',
        totalDays: 2,
        reason: 'Doctor appointment',
        status: LeaveStatus.APPROVED,
        approvedBy: 'manager-001',
        approvedDate: Date.now() - 7 * 24 * 60 * 60 * 1000
      }),
      new LeaveRequest({
        employeeId: 'emp-003',
        employeeName: 'Bob Wilson',
        leaveType: LeaveType.PERSONAL,
        startDate: '2026-04-01',
        endDate: '2026-04-01',
        totalDays: 1,
        reason: 'Personal errands',
        status: LeaveStatus.PENDING
      }),
      new LeaveRequest({
        employeeId: 'emp-001',
        employeeName: 'John Smith',
        leaveType: LeaveType.SICK,
        startDate: '2026-01-20',
        endDate: '2026-01-21',
        totalDays: 2,
        reason: 'Flu',
        status: LeaveStatus.APPROVED,
        approvedBy: 'manager-001',
        approvedDate: Date.now() - 30 * 24 * 60 * 60 * 1000
      })
    ];

    for (const request of requests) {
      this.requests.set(request.id, request);
    }

    this._updateStats();
  }

  _updateStats() {
    const allRequests = Array.from(this.requests.values());
    this.stats.totalRequests = allRequests.length;
    this.stats.pendingRequests = allRequests.filter(r => r.status === LeaveStatus.PENDING).length;
    this.stats.approvedRequests = allRequests.filter(r => r.status === LeaveStatus.APPROVED).length;
    this.stats.rejectedRequests = allRequests.filter(r => r.status === LeaveStatus.REJECTED).length;
    this.stats.cancelledRequests = allRequests.filter(r => r.status === LeaveStatus.CANCELLED).length;
    this.stats.totalDaysApproved = allRequests
      .filter(r => r.status === LeaveStatus.APPROVED)
      .reduce((sum, r) => sum + r.totalDays, 0);
  }

  /**
   * Create leave request
   */
  createRequest(config) {
    const policy = this.policies.get(config.leaveType);
    if (!policy) {
      return { success: false, reason: 'Invalid leave type' };
    }

    // Check minimum notice period
    if (policy.minDaysNotice > 0) {
      const daysUntilStart = Math.ceil((new Date(config.startDate) - new Date()) / (1000 * 60 * 60 * 24));
      if (daysUntilStart < policy.minDaysNotice) {
        return { success: false, reason: `Minimum ${policy.minDaysNotice} days notice required` };
      }
    }

    // Check max consecutive days
    if (policy.maxConsecutiveDays > 0 && config.totalDays > policy.maxConsecutiveDays) {
      return { success: false, reason: `Maximum ${policy.maxConsecutiveDays} consecutive days allowed` };
    }

    // Check balance
    const balanceKey = `${config.employeeId}-${config.leaveType}`;
    const balance = this.balances.get(balanceKey);
    if (balance && balance.getAvailableDays() < config.totalDays) {
      return { success: false, reason: 'Insufficient leave balance' };
    }

    const request = new LeaveRequest(config);
    this.requests.set(request.id, request);

    // Update pending days in balance
    if (balance) {
      balance.pendingDays += config.totalDays;
    }

    this._updateStats();

    return {
      success: true,
      requestId: request.id,
      request: request.toJSON()
    };
  }

  /**
   * Approve leave request
   */
  approveRequest(requestId, approvedBy) {
    const request = this.requests.get(requestId);
    if (!request) {
      return { success: false, reason: 'Leave request not found' };
    }

    if (request.status !== LeaveStatus.PENDING) {
      return { success: false, reason: 'Request is not pending' };
    }

    request.approve(approvedBy);

    // Update balance
    const balanceKey = `${request.employeeId}-${request.leaveType}`;
    const balance = this.balances.get(balanceKey);
    if (balance) {
      balance.pendingDays -= request.totalDays;
      balance.usedDays += request.totalDays;
    }

    this._updateStats();

    return {
      success: true,
      request: request.toJSON()
    };
  }

  /**
   * Reject leave request
   */
  rejectRequest(requestId, approvedBy, reason) {
    const request = this.requests.get(requestId);
    if (!request) {
      return { success: false, reason: 'Leave request not found' };
    }

    if (request.status !== LeaveStatus.PENDING) {
      return { success: false, reason: 'Request is not pending' };
    }

    request.reject(approvedBy, reason);

    // Update balance - remove pending days
    const balanceKey = `${request.employeeId}-${request.leaveType}`;
    const balance = this.balances.get(balanceKey);
    if (balance) {
      balance.pendingDays -= request.totalDays;
    }

    this._updateStats();

    return {
      success: true,
      request: request.toJSON()
    };
  }

  /**
   * Cancel leave request
   */
  cancelRequest(requestId) {
    const request = this.requests.get(requestId);
    if (!request) {
      return { success: false, reason: 'Leave request not found' };
    }

    if (request.status !== LeaveStatus.PENDING && request.status !== LeaveStatus.APPROVED) {
      return { success: false, reason: 'Cannot cancel this request' };
    }

    request.cancel();

    // Update balance
    const balanceKey = `${request.employeeId}-${request.leaveType}`;
    const balance = this.balances.get(balanceKey);
    if (balance) {
      if (request.status === LeaveStatus.PENDING) {
        balance.pendingDays -= request.totalDays;
      } else if (request.status === LeaveStatus.APPROVED) {
        balance.usedDays -= request.totalDays;
      }
    }

    this._updateStats();

    return {
      success: true,
      request: request.toJSON()
    };
  }

  /**
   * Get pending requests
   */
  getPendingRequests() {
    const results = [];
    for (const request of this.requests.values()) {
      if (request.status === LeaveStatus.PENDING) {
        results.push(request);
      }
    }
    return results;
  }

  /**
   * Get employee requests
   */
  getEmployeeRequests(employeeId) {
    const results = [];
    for (const request of this.requests.values()) {
      if (request.employeeId === employeeId) {
        results.push(request);
      }
    }
    return results;
  }

  /**
   * Get leave balance
   */
  getLeaveBalance(employeeId, leaveType) {
    const key = `${employeeId}-${leaveType}`;
    return this.balances.get(key);
  }

  /**
   * Get all balances for employee
   */
  getEmployeeBalances(employeeId) {
    const results = [];
    for (const balance of this.balances.values()) {
      if (balance.employeeId === employeeId) {
        results.push(balance);
      }
    }
    return results;
  }

  /**
   * Get policy for leave type
   */
  getPolicy(leaveType) {
    return this.policies.get(leaveType);
  }

  /**
   * Get stats
   */
  getStats() {
    this._updateStats();
    return { ...this.stats };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Leave Request Demo\n');

  const manager = new LeaveManager();

  // Show policies
  console.log('1. Leave Policies:');
  for (const policy of manager.policies.values()) {
    console.log(`   ${policy.leaveType}:`);
    console.log(`      Max Days/Year: ${policy.maxDaysPerYear}`);
    console.log(`      Min Notice: ${policy.minDaysNotice} days`);
    console.log(`      Paid: ${policy.isPaid}`);
  }

  // Show balances
  console.log('\n2. Leave Balances (John Smith):');
  const johnBalances = manager.getEmployeeBalances('emp-001');
  for (const balance of johnBalances) {
    console.log(`   ${balance.leaveType}: ${balance.usedDays}/${balance.totalDays} used, ${balance.pendingDays} pending, ${balance.getAvailableDays()} available`);
  }

  // Show pending requests
  console.log('\n3. Pending Leave Requests:');
  const pending = manager.getPendingRequests();
  for (const req of pending) {
    console.log(`   ${req.employeeName}: ${req.leaveType} (${req.totalDays} days)`);
    console.log(`      ${req.startDate} - ${req.endDate}`);
  }

  // Create new request
  console.log('\n4. Creating Leave Request:');
  const newReq = manager.createRequest({
    employeeId: 'emp-003',
    employeeName: 'Bob Wilson',
    leaveType: LeaveType.ANNUAL,
    startDate: '2026-04-15',
    endDate: '2026-04-17',
    totalDays: 3,
    reason: 'Short trip'
  });
  console.log(`   Success: ${newReq.success}`);
  if (!newReq.success) {
    console.log(`   Reason: ${newReq.reason}`);
  } else {
    console.log(`   Request ID: ${newReq.requestId}`);
  }

  // Approve request
  console.log('\n5. Approving Leave Request:');
  const pendingReqs = manager.getPendingRequests();
  if (pendingReqs.length > 0) {
    const approve = manager.approveRequest(pendingReqs[0].id, 'manager-001');
    console.log(`   Success: ${approve.success}`);
    console.log(`   Status: ${approve.request.status}`);
  }

  // Reject request
  console.log('\n6. Rejecting Leave Request:');
  const pendingReqs2 = manager.getPendingRequests();
  if (pendingReqs2.length > 0) {
    const reject = manager.rejectRequest(pendingReqs2[0].id, 'manager-001', 'Insufficient staffing');
    console.log(`   Success: ${reject.success}`);
    console.log(`   Status: ${reject.request.status}`);
    console.log(`   Reason: ${reject.request.rejectedReason}`);
  }

  // Cancel request
  console.log('\n7. Cancelling Leave Request:');
  const approvedReqs = Array.from(manager.requests.values()).find(r => r.status === LeaveStatus.APPROVED);
  if (approvedReqs) {
    const cancel = manager.cancelRequest(approvedReqs.id);
    console.log(`   Success: ${cancel.success}`);
    console.log(`   Status: ${cancel.request.status}`);
  }

  // Employee requests
  console.log('\n8. Employee Request History (emp-001):');
  const empReqs = manager.getEmployeeRequests('emp-001');
  for (const req of empReqs) {
    console.log(`   ${req.leaveType}: ${req.startDate} - ${req.endDate} (${req.totalDays} days) [${req.status}]`);
  }

  // Stats
  console.log('\n9. Statistics:');
  const stats = manager.getStats();
  console.log(`    Total Requests: ${stats.totalRequests}`);
  console.log(`    Pending: ${stats.pendingRequests}`);
  console.log(`    Approved: ${stats.approvedRequests}`);
  console.log(`    Rejected: ${stats.rejectedRequests}`);
  console.log(`    Cancelled: ${stats.cancelledRequests}`);
  console.log(`    Total Days Approved: ${stats.totalDaysApproved}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'list') {
  const manager = new LeaveManager();
  console.log(JSON.stringify(manager.getPendingRequests().map(r => r.toJSON()), null, 2));
} else {
  console.log('Agent Leave Request Module');
  console.log('Usage: node agent-leave-request.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  list               List pending requests');
}
