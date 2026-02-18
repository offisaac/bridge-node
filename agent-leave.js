/**
 * Agent Leave - Leave Management Agent
 *
 * Manages employee leave requests, vacation tracking, sick leave, and leave policies.
 *
 * Usage: node agent-leave.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   request - Create leave request
 *   list    - List leave requests
 */

class LeaveRequest {
  constructor(config) {
    this.id = `leave-${Date.now()}`;
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.leaveType = config.leaveType; // vacation, sick, personal, parental, bereavement
    this.startDate = new Date(config.startDate);
    this.endDate = new Date(config.endDate);
    this.totalDays = config.totalDays || this.calculateDays();
    this.reason = config.reason || '';
    this.status = 'pending'; // pending, approved, rejected, cancelled
    this.approverId = config.approverId || null;
    this.approverName = config.approverName || null;
    this.approvedDate = null;
    this.createdAt = Date.now();
  }

  calculateDays() {
    const diff = this.endDate - this.startDate;
    return Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1;
  }

  approve(approverId, approverName) {
    this.status = 'approved';
    this.approverId = approverId;
    this.approverName = approverName;
    this.approvedDate = Date.now();
  }

  reject(approverId, approverName, reason) {
    this.status = 'rejected';
    this.approverId = approverId;
    this.approverName = approverName;
    this.reason = reason;
  }

  cancel() {
    this.status = 'cancelled';
  }
}

class LeaveBalance {
  constructor(config) {
    this.employeeId = config.employeeId;
    this.year = config.year || new Date().getFullYear();
    this.vacationDays = config.vacationDays || 20;
    this.sickDays = config.sickDays || 10;
    this.personalDays = config.personalDays || 5;
    this.usedVacation = 0;
    this.usedSick = 0;
    this.usedPersonal = 0;
  }

  getRemaining(type) {
    switch (type) {
      case 'vacation': return this.vacationDays - this.usedVacation;
      case 'sick': return this.sickDays - this.usedSick;
      case 'personal': return this.personalDays - this.usedPersonal;
      default: return 0;
    }
  }

  useDays(type, days) {
    switch (type) {
      case 'vacation': this.usedVacation += days; break;
      case 'sick': this.usedSick += days; break;
      case 'personal': this.usedPersonal += days; break;
    }
  }
}

class LeavePolicy {
  constructor(config) {
    this.id = `policy-${Date.now()}`;
    this.name = config.name;
    this.leaveType = config.leaveType;
    this.daysPerYear = config.daysPerYear;
    this.maxConsecutive = config.maxConsecutive || 30;
    this.requiresApproval = config.requiresApproval !== false;
    this.noticeDays = config.noticeDays || 7;
    this.canCarryOver = config.canCarryOver || false;
    this.carryOverLimit = config.carryOverLimit || 5;
  }
}

class LeaveAgent {
  constructor(config = {}) {
    this.requests = new Map();
    this.balances = new Map();
    this.policies = new Map();
    this.stats = {
      requestsCreated: 0,
      requestsApproved: 0,
      daysApproved: 0
    };
    this.initPolicies();
    this.initBalances();
  }

  initPolicies() {
    const policies = [
      { name: 'Vacation Policy', leaveType: 'vacation', daysPerYear: 20, maxConsecutive: 30, noticeDays: 7 },
      { name: 'Sick Leave Policy', leaveType: 'sick', daysPerYear: 10, maxConsecutive: 10, noticeDays: 0 },
      { name: 'Personal Leave Policy', leaveType: 'personal', daysPerYear: 5, maxConsecutive: 3, noticeDays: 3 },
      { name: 'Parental Leave Policy', leaveType: 'parental', daysPerYear: 90, maxConsecutive: 90, noticeDays: 30 },
      { name: 'Bereavement Policy', leaveType: 'bereavement', daysPerYear: 5, maxConsecutive: 5, noticeDays: 0 }
    ];

    policies.forEach(p => {
      const policy = new LeavePolicy(p);
      this.policies.set(policy.leaveType, policy);
    });
  }

  initBalances() {
    const employees = ['emp-001', 'emp-002', 'emp-003', 'emp-004'];
    employees.forEach(empId => {
      const balance = new LeaveBalance({ employeeId: empId, year: 2026 });
      // Add some used days for demo
      balance.usedVacation = Math.floor(Math.random() * 10);
      balance.usedSick = Math.floor(Math.random() * 3);
      balance.usedPersonal = Math.floor(Math.random() * 2);
      this.balances.set(empId, balance);
    });
  }

  createRequest(config) {
    const request = new LeaveRequest(config);
    this.requests.set(request.id, request);
    this.stats.requestsCreated++;
    console.log(`   Created leave request: ${request.employeeName} - ${request.leaveType}`);
    return request;
  }

  approveRequest(requestId, approverId, approverName) {
    const request = this.requests.get(requestId);
    if (!request) {
      return { success: false, reason: 'Request not found' };
    }

    request.approve(approverId, approverName);
    this.stats.requestsApproved++;
    this.stats.daysApproved += request.totalDays;

    // Update balance
    const balance = this.balances.get(request.employeeId);
    if (balance) {
      balance.useDays(request.leaveType, request.totalDays);
    }

    console.log(`   Approved: ${request.employeeName} - ${request.totalDays} days`);
    return { success: true, request };
  }

  rejectRequest(requestId, approverId, approverName, reason) {
    const request = this.requests.get(requestId);
    if (!request) {
      return { success: false, reason: 'Request not found' };
    }

    request.reject(approverId, approverName, reason);
    console.log(`   Rejected: ${request.employeeName} - ${reason}`);
    return { success: true, request };
  }

  getBalance(employeeId) {
    return this.balances.get(employeeId);
  }

  getEmployeeRequests(employeeId) {
    return Array.from(this.requests.values()).filter(r => r.employeeId === employeeId);
  }

  getPendingRequests() {
    return Array.from(this.requests.values()).filter(r => r.status === 'pending');
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new LeaveAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Leave Demo\n');

    // 1. Show Leave Policies
    console.log('1. Leave Policies:');
    for (const policy of agent.policies.values()) {
      console.log(`   ${policy.name}: ${policy.daysPerYear} days/year`);
    }

    // 2. Show Leave Balances
    console.log('\n2. Leave Balances:');
    const balance = agent.getBalance('emp-001');
    if (balance) {
      console.log(`   Employee: emp-001`);
      console.log(`   Vacation: ${balance.getRemaining('vacation')} days remaining`);
      console.log(`   Sick: ${balance.getRemaining('sick')} days remaining`);
      console.log(`   Personal: ${balance.getRemaining('personal')} days remaining`);
    }

    // 3. Create Leave Requests
    console.log('\n3. Create Leave Requests:');
    const req1 = agent.createRequest({
      employeeId: 'emp-001',
      employeeName: 'John Smith',
      leaveType: 'vacation',
      startDate: '2026-03-15',
      endDate: '2026-03-20',
      reason: 'Family vacation'
    });
    const req2 = agent.createRequest({
      employeeId: 'emp-002',
      employeeName: 'Sarah Johnson',
      leaveType: 'sick',
      startDate: '2026-02-20',
      endDate: '2026-02-21',
      reason: 'Not feeling well'
    });

    // 4. Approve Requests
    console.log('\n4. Approve Requests:');
    agent.approveRequest(req1.id, 'mgr-001', 'Manager');

    // 5. Reject Request
    console.log('\n5. Reject Request:');
    agent.rejectRequest(req2.id, 'mgr-001', 'Manager', 'Insufficient notice');

    // 6. Show Employee Requests
    console.log('\n6. Employee Leave History:');
    const empRequests = agent.getEmployeeRequests('emp-001');
    empRequests.forEach(r => {
      console.log(`   ${r.leaveType}: ${r.startDate.toISOString().split('T')[0]} - ${r.status}`);
    });

    // 7. Pending Requests
    console.log('\n7. Pending Requests:');
    const pending = agent.getPendingRequests();
    console.log(`   Total: ${pending.length}`);

    // 8. Updated Balance
    console.log('\n8. Updated Leave Balance:');
    const updatedBalance = agent.getBalance('emp-001');
    if (updatedBalance) {
      console.log(`   Vacation: ${updatedBalance.getRemaining('vacation')} days remaining`);
    }

    // 9. Statistics
    console.log('\n9. Statistics:');
    const stats = agent.getStats();
    console.log(`   Requests Created: ${stats.requestsCreated}`);
    console.log(`   Requests Approved: ${stats.requestsApproved}`);
    console.log(`   Days Approved: ${stats.daysApproved}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'request':
    console.log('Creating test leave request...');
    const req = agent.createRequest({
      employeeId: 'test-001',
      employeeName: 'Test User',
      leaveType: 'vacation',
      startDate: '2026-04-01',
      endDate: '2026-04-05'
    });
    console.log(`Created request: ${req.id}`);
    break;

  case 'list':
    console.log('Listing leave requests...');
    for (const req of agent.requests.values()) {
      console.log(`   ${req.employeeName}: ${req.leaveType} (${req.status})`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-leave.js [demo|request|list]');
}
