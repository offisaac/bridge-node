/**
 * Agent Shift Management Module
 *
 * Provides shift scheduling and management for workforce.
 * Usage: node agent-shift.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   schedule                Show shift schedule
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

/**
 * Shift Type
 */
const ShiftType = {
  MORNING: 'morning',
  AFTERNOON: 'afternoon',
  EVENING: 'evening',
  NIGHT: 'night',
  SPLIT: 'split',
  ON_CALL: 'on_call'
};

/**
 * Shift Status
 */
const ShiftStatus = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show'
};

/**
 * Shift
 */
class Shift {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type;
    this.startTime = config.startTime; // HH:MM format
    this.endTime = config.endTime; // HH:MM format
    this.duration = config.duration || 8; // hours
    this.status = config.status || ShiftStatus.SCHEDULED;
    this.requiredStaff = config.requiredStaff || 1;
    this.tags = config.tags || [];
    this.metadata = config.metadata || {};
  }

  isActive() {
    return this.status === ShiftStatus.SCHEDULED || this.status === ShiftStatus.IN_PROGRESS;
  }

  getDuration() {
    const [startH, startM] = this.startTime.split(':').map(Number);
    const [endH, endM] = this.endTime.split(':').map(Number);
    let hours = endH - startH;
    let mins = endM - startM;
    if (hours < 0) hours += 24;
    return hours + mins / 60;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this.duration,
      status: this.status,
      requiredStaff: this.requiredStaff
    };
  }
}

/**
 * Shift Assignment
 */
class ShiftAssignment {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.shiftId = config.shiftId;
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.date = config.date;
    this.startTime = config.startTime;
    this.endTime = config.endTime;
    this.status = config.status || 'assigned';
    this.checkInTime = config.checkInTime || null;
    this.checkOutTime = config.checkOutTime || null;
    this.notes = config.notes || '';
    this.createdAt = Date.now();
  }

  isActive() {
    return this.status === 'assigned' || this.status === 'checked_in';
  }

  checkIn() {
    this.status = 'checked_in';
    this.checkInTime = Date.now();
  }

  checkOut() {
    this.status = 'completed';
    this.checkOutTime = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      shiftId: this.shiftId,
      employeeId: this.employeeId,
      employeeName: this.employeeName,
      date: this.date,
      startTime: this.startTime,
      endTime: this.endTime,
      status: this.status,
      checkInTime: this.checkInTime,
      checkOutTime: this.checkOutTime,
      notes: this.notes
    };
  }
}

/**
 * Shift Swap Request
 */
class ShiftSwapRequest {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.requestingEmployeeId = config.requestingEmployeeId;
    this.requestingEmployeeName = config.requestingEmployeeName;
    this.targetEmployeeId = config.targetEmployeeId;
    this.targetEmployeeName = config.targetEmployeeName;
    this.originalShiftId = config.originalShiftId;
    this.targetShiftId = config.targetShiftId;
    this.reason = config.reason || '';
    this.status = config.status || 'pending';
    this.approvedBy = config.approvedBy || null;
    this.createdAt = Date.now();
  }

  approve(approvedBy) {
    this.status = 'approved';
    this.approvedBy = approvedBy;
  }

  reject(approvedBy, reason) {
    this.status = 'rejected';
    this.approvedBy = approvedBy;
    this.notes = reason;
  }

  toJSON() {
    return {
      id: this.id,
      requestingEmployeeId: this.requestingEmployeeId,
      requestingEmployeeName: this.requestingEmployeeName,
      targetEmployeeId: this.targetEmployeeId,
      targetEmployeeName: this.targetEmployeeName,
      originalShiftId: this.originalShiftId,
      targetShiftId: this.targetShiftId,
      reason: this.reason,
      status: this.status,
      approvedBy: this.approvedBy
    };
  }
}

/**
 * Shift Manager
 */
class ShiftManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.shifts = new Map();
    this.assignments = new Map();
    this.swapRequests = new Map();
    this.stats = {
      totalShifts: 0,
      scheduledShifts: 0,
      completedShifts: 0,
      cancelledShifts: 0,
      totalAssignments: 0,
      pendingSwaps: 0,
      approvedSwaps: 0
    };

    this._init();
  }

  _init() {
    this._createSampleData();
  }

  _createSampleData() {
    // Sample shifts
    const shifts = [
      new Shift({
        name: 'Morning Shift A',
        type: ShiftType.MORNING,
        startTime: '06:00',
        endTime: '14:00',
        duration: 8,
        requiredStaff: 5,
        tags: ['core hours']
      }),
      new Shift({
        name: 'Afternoon Shift B',
        type: ShiftType.AFTERNOON,
        startTime: '14:00',
        endTime: '22:00',
        duration: 8,
        requiredStaff: 4,
        tags: ['core hours']
      }),
      new Shift({
        name: 'Night Shift C',
        type: ShiftType.NIGHT,
        startTime: '22:00',
        endTime: '06:00',
        duration: 8,
        requiredStaff: 2,
        tags: ['night']
      }),
      new Shift({
        name: 'Morning Shift D',
        type: ShiftType.MORNING,
        startTime: '08:00',
        endTime: '16:00',
        duration: 8,
        requiredStaff: 3,
        tags: ['support']
      }),
      new Shift({
        name: 'Split Shift E',
        type: ShiftType.SPLIT,
        startTime: '09:00',
        endTime: '13:00',
        duration: 4,
        requiredStaff: 2,
        tags: ['part-time']
      })
    ];

    for (const shift of shifts) {
      this.shifts.set(shift.id, shift);
    }

    // Sample assignments
    const today = new Date().toISOString().split('T')[0];
    const assignments = [
      new ShiftAssignment({
        shiftId: shifts[0].id,
        employeeId: 'emp-001',
        employeeName: 'John Smith',
        date: today,
        startTime: '06:00',
        endTime: '14:00',
        status: 'checked_in',
        checkInTime: Date.now() - 4 * 60 * 60 * 1000
      }),
      new ShiftAssignment({
        shiftId: shifts[0].id,
        employeeId: 'emp-002',
        employeeName: 'Jane Doe',
        date: today,
        startTime: '06:00',
        endTime: '14:00',
        status: 'assigned'
      }),
      new ShiftAssignment({
        shiftId: shifts[1].id,
        employeeId: 'emp-003',
        employeeName: 'Bob Wilson',
        date: today,
        startTime: '14:00',
        endTime: '22:00',
        status: 'assigned'
      }),
      new ShiftAssignment({
        shiftId: shifts[2].id,
        employeeId: 'emp-004',
        employeeName: 'Alice Brown',
        date: today,
        startTime: '22:00',
        endTime: '06:00',
        status: 'assigned'
      })
    ];

    for (const assignment of assignments) {
      this.assignments.set(assignment.id, assignment);
    }

    // Sample swap request
    const swapRequest = new ShiftSwapRequest({
      requestingEmployeeId: 'emp-005',
      requestingEmployeeName: 'Charlie Davis',
      targetEmployeeId: 'emp-002',
      targetEmployeeName: 'Jane Doe',
      originalShiftId: shifts[1].id,
      targetShiftId: shifts[0].id,
      reason: 'Family commitment'
    });

    this.swapRequests.set(swapRequest.id, swapRequest);

    this._updateStats();
  }

  _updateStats() {
    this.stats.totalShifts = this.shifts.size;
    this.stats.scheduledShifts = Array.from(this.shifts.values()).filter(s => s.status === ShiftStatus.SCHEDULED).length;
    this.stats.completedShifts = Array.from(this.shifts.values()).filter(s => s.status === ShiftStatus.COMPLETED).length;
    this.stats.cancelledShifts = Array.from(this.shifts.values()).filter(s => s.status === ShiftStatus.CANCELLED).length;
    this.stats.totalAssignments = this.assignments.size;
    this.stats.pendingSwaps = Array.from(this.swapRequests.values()).filter(s => s.status === 'pending').length;
    this.stats.approvedSwaps = Array.from(this.swapRequests.values()).filter(s => s.status === 'approved').length;
  }

  /**
   * Get shifts by type
   */
  getShiftsByType(type) {
    const results = [];
    for (const shift of this.shifts.values()) {
      if (shift.type === type) {
        results.push(shift);
      }
    }
    return results;
  }

  /**
   * Get shift by ID
   */
  getShift(shiftId) {
    return this.shifts.get(shiftId);
  }

  /**
   * Create shift
   */
  createShift(config) {
    const shift = new Shift(config);
    this.shifts.set(shift.id, shift);
    this._updateStats();
    return {
      success: true,
      shiftId: shift.id,
      shift: shift.toJSON()
    };
  }

  /**
   * Create shift assignment
   */
  createAssignment(config) {
    const shift = this.shifts.get(config.shiftId);
    if (!shift) {
      return { success: false, reason: 'Shift not found' };
    }

    // Check staff capacity
    const currentAssignments = this.getShiftAssignments(config.shiftId, config.date);
    if (currentAssignments.length >= shift.requiredStaff) {
      return { success: false, reason: 'Shift at full capacity' };
    }

    const assignment = new ShiftAssignment(config);
    this.assignments.set(assignment.id, assignment);
    this._updateStats();

    return {
      success: true,
      assignmentId: assignment.id,
      assignment: assignment.toJSON()
    };
  }

  /**
   * Get shift assignments
   */
  getShiftAssignments(shiftId, date = null) {
    const results = [];
    for (const assignment of this.assignments.values()) {
      if (assignment.shiftId === shiftId) {
        if (!date || assignment.date === date) {
          results.push(assignment);
        }
      }
    }
    return results;
  }

  /**
   * Get employee assignments
   */
  getEmployeeAssignments(employeeId, date = null) {
    const results = [];
    for (const assignment of this.assignments.values()) {
      if (assignment.employeeId === employeeId) {
        if (!date || assignment.date === date) {
          results.push(assignment);
        }
      }
    }
    return results;
  }

  /**
   * Check in employee
   */
  checkIn(assignmentId) {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) {
      return { success: false, reason: 'Assignment not found' };
    }

    assignment.checkIn();
    this._updateStats();

    return {
      success: true,
      assignment: assignment.toJSON()
    };
  }

  /**
   * Check out employee
   */
  checkOut(assignmentId) {
    const assignment = this.assignments.get(assignmentId);
    if (!assignment) {
      return { success: false, reason: 'Assignment not found' };
    }

    assignment.checkOut();
    this._updateStats();

    return {
      success: true,
      assignment: assignment.toJSON()
    };
  }

  /**
   * Create swap request
   */
  createSwapRequest(config) {
    const request = new ShiftSwapRequest(config);
    this.swapRequests.set(request.id, request);
    this._updateStats();

    return {
      success: true,
      requestId: request.id,
      request: request.toJSON()
    };
  }

  /**
   * Approve swap request
   */
  approveSwapRequest(requestId, approvedBy) {
    const request = this.swapRequests.get(requestId);
    if (!request) {
      return { success: false, reason: 'Swap request not found' };
    }

    // Swap the assignments
    const originalAssign = Array.from(this.assignments.values())
      .find(a => a.id === request.originalShiftId || a.shiftId === request.originalShiftId);
    const targetAssign = Array.from(this.assignments.values())
      .find(a => a.id === request.targetShiftId || a.shiftId === request.targetShiftId);

    if (originalAssign && targetAssign) {
      // Swap employee IDs and names
      const tempEmpId = originalAssign.employeeId;
      const tempEmpName = originalAssign.employeeName;
      originalAssign.employeeId = targetAssign.employeeId;
      originalAssign.employeeName = targetAssign.employeeName;
      targetAssign.employeeId = tempEmpId;
      targetAssign.employeeName = tempEmpName;
    }

    request.approve(approvedBy);
    this._updateStats();

    return {
      success: true,
      request: request.toJSON()
    };
  }

  /**
   * Reject swap request
   */
  rejectSwapRequest(requestId, approvedBy, reason) {
    const request = this.swapRequests.get(requestId);
    if (!request) {
      return { success: false, reason: 'Swap request not found' };
    }

    request.reject(approvedBy, reason);
    this._updateStats();

    return {
      success: true,
      request: request.toJSON()
    };
  }

  /**
   * Get pending swap requests
   */
  getPendingSwapRequests() {
    const results = [];
    for (const request of this.swapRequests.values()) {
      if (request.status === 'pending') {
        results.push(request);
      }
    }
    return results;
  }

  /**
   * Get schedule for date
   */
  getSchedule(date) {
    const results = [];
    for (const assignment of this.assignments.values()) {
      if (assignment.date === date) {
        const shift = this.shifts.get(assignment.shiftId);
        results.push({
          ...assignment.toJSON(),
          shiftName: shift ? shift.name : 'Unknown'
        });
      }
    }
    return results;
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
  console.log('=== Agent Shift Management Demo\n');

  const manager = new ShiftManager();

  // Show shifts
  console.log('1. Shifts:');
  for (const shift of manager.shifts.values()) {
    console.log(`   ${shift.name} (${shift.type})`);
    console.log(`      Time: ${shift.startTime} - ${shift.endTime} (${shift.duration}h)`);
    console.log(`      Required Staff: ${shift.requiredStaff}`);
  }

  // Show assignments
  console.log('\n2. Today\'s Assignments:');
  const today = new Date().toISOString().split('T')[0];
  const schedule = manager.getSchedule(today);
  for (const assign of schedule) {
    console.log(`   ${assign.employeeName}: ${assign.startTime} - ${assign.endTime} (${assign.status})`);
  }

  // Show shift coverage
  console.log('\n3. Shift Coverage:');
  for (const shift of manager.shifts.values()) {
    const assignments = manager.getShiftAssignments(shift.id, today);
    console.log(`   ${shift.name}: ${assignments.length}/${shift.requiredStaff} staff`);
  }

  // Create new shift
  console.log('\n4. Creating New Shift:');
  const newShift = manager.createShift({
    name: 'Weekend Morning',
    type: ShiftType.MORNING,
    startTime: '07:00',
    endTime: '15:00',
    duration: 8,
    requiredStaff: 3,
    tags: ['weekend']
  });
  console.log(`   Success: ${newShift.success}`);
  console.log(`   Shift ID: ${newShift.shiftId}`);

  // Create new assignment
  console.log('\n5. Creating New Assignment:');
  const shiftsArray = Array.from(manager.shifts.values());
  const newAssign = manager.createAssignment({
    shiftId: shiftsArray[0].id,
    employeeId: 'emp-006',
    employeeName: 'New Employee',
    date: today,
    startTime: '06:00',
    endTime: '14:00',
    status: 'assigned'
  });
  console.log(`   Success: ${newAssign.success}`);
  if (!newAssign.success) {
    console.log(`   Reason: ${newAssign.reason}`);
  } else {
    console.log(`   Assignment ID: ${newAssign.assignmentId}`);
  }

  // Check in
  console.log('\n6. Checking In Employee:');
  const assignArray = Array.from(manager.assignments.values());
  const pendingAssign = assignArray.find(a => a.status === 'assigned');
  if (pendingAssign) {
    const checkIn = manager.checkIn(pendingAssign.id);
    console.log(`   Success: ${checkIn.success}`);
    console.log(`   Status: ${checkIn.assignment.status}`);
  }

  // Swap request
  console.log('\n7. Creating Swap Request:');
  const swapReq = manager.createSwapRequest({
    requestingEmployeeId: 'emp-007',
    requestingEmployeeName: 'New Person',
    targetEmployeeId: 'emp-003',
    targetEmployeeName: 'Bob Wilson',
    originalShiftId: shiftsArray[1].id,
    targetShiftId: shiftsArray[0].id,
    reason: 'Doctor appointment'
  });
  console.log(`   Success: ${swapReq.success}`);
  console.log(`   Request ID: ${swapReq.requestId}`);

  // Approve swap
  console.log('\n8. Approving Swap Request:');
  const pendingSwap = manager.getPendingSwapRequests()[0];
  if (pendingSwap) {
    const approve = manager.approveSwapRequest(pendingSwap.id, 'manager-001');
    console.log(`   Success: ${approve.success}`);
    console.log(`   Status: ${approve.request.status}`);
  }

  // Pending swaps
  console.log('\n9. Pending Swap Requests:');
  const pendingSwaps = manager.getPendingSwapRequests();
  console.log(`   Count: ${pendingSwaps.length}`);

  // Stats
  console.log('\n10. Statistics:');
  const stats = manager.getStats();
  console.log(`    Total Shifts: ${stats.totalShifts}`);
  console.log(`    Scheduled Shifts: ${stats.scheduledShifts}`);
  console.log(`    Completed Shifts: ${stats.completedShifts}`);
  console.log(`    Total Assignments: ${stats.totalAssignments}`);
  console.log(`    Pending Swaps: ${stats.pendingSwaps}`);
  console.log(`    Approved Swaps: ${stats.approvedSwaps}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'schedule') {
  const manager = new ShiftManager();
  const today = new Date().toISOString().split('T')[0];
  console.log(JSON.stringify(manager.getSchedule(today), null, 2));
} else {
  console.log('Agent Shift Management Module');
  console.log('Usage: node agent-shift.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  schedule           Show today\'s schedule');
}
