/**
 * Agent Attendance - Employee Attendance Tracking Module
 *
 * Manages attendance records, time tracking, clock in/out, overtime calculation, and attendance reports.
 *
 * Usage: node agent-attendance.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   report  - Generate attendance report
 *   status  - Show current attendance status
 */

class AttendanceRecord {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.date = config.date ? new Date(config.date) : new Date();
    this.clockInTime = config.clockInTime ? new Date(config.clockInTime) : (config.clockIn ? new Date(config.clockIn) : null);
    this.clockOutTime = config.clockOutTime ? new Date(config.clockOutTime) : (config.clockOut ? new Date(config.clockOut) : null);
    this.breaks = config.breaks || []; // Array of {start, end, duration}
    this.totalBreakTime = config.totalBreakTime || 0; // minutes
    this.status = config.status || 'present'; // present, absent, late, half_day, on_leave
    this.workingHours = config.workingHours || 0;
    this.overtimeHours = config.overtimeHours || 0;
    this.notes = config.notes || '';
    this.location = config.location || 'office'; // office, remote, field
    this.verificationMethod = config.verificationMethod || 'biometric'; // biometric, manual, gps
  }

  get clockIn() { return this.clockInTime; }
  get clockOut() { return this.clockOutTime; }

  calculateWorkingHours() {
    if (!this.clockInTime || !this.clockOutTime) return 0;

    const diff = this.clockOutTime - this.clockInTime;
    const totalMinutes = Math.floor(diff / (1000 * 60));
    const workedMinutes = totalMinutes - this.totalBreakTime;

    this.workingHours = workedMinutes / 60;
    return this.workingHours;
  }

  isLate(thresholdMinutes = 15) {
    if (!this.clockInTime) return false;
    const expectedStart = new Date(this.date);
    expectedStart.setHours(9, 0, 0, 0); // Default 9 AM

    const lateMinutes = (this.clockInTime - expectedStart) / (1000 * 60);
    return lateMinutes > thresholdMinutes;
  }

  doClockIn(location = 'office', method = 'biometric') {
    this.clockInTime = new Date();
    this.location = location;
    this.verificationMethod = method;
    this.status = 'present';
  }

  doClockOut() {
    this.clockOutTime = new Date();
    this.calculateWorkingHours();

    // Calculate overtime (超过8小时为加班)
    if (this.workingHours > 8) {
      this.overtimeHours = this.workingHours - 8;
    }

    return this.workingHours;
  }

  addBreak(start, end) {
    const breakDuration = (new Date(end) - new Date(start)) / (1000 * 60);
    this.breaks.push({ start: new Date(start), end: new Date(end), duration: breakDuration });
    this.totalBreakTime += breakDuration;
  }
}

class AttendancePolicy {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.workStartTime = config.workStartTime || '09:00';
    this.workEndTime = config.workEndTime || '18:00';
    this.breakDuration = config.breakDuration || 60; // minutes
    this.lateThreshold = config.lateThreshold || 15; // minutes
    this.minWorkingHours = config.minWorkingHours || 8;
    this.overtimeThreshold = config.overtimeThreshold || 8;
    this.weekendWorkAllowed = config.weekendWorkAllowed || false;
    this.remoteWorkAllowed = config.remoteWorkAllowed || true;
    this.maxAbsenceDays = config.maxAbsenceDays || 10;
    this.gracePeriod = config.gracePeriod || 5; // minutes
  }

  isWorkingDay(date) {
    const day = date.getDay();
    return day !== 0 && day !== 6; // Not Sunday or Saturday
  }

  calculateExpectedHours(date) {
    let hours = 8;
    if (!this.isWorkingDay(date)) {
      hours = this.weekendWorkAllowed ? hours : 0;
    }
    return hours;
  }
}

class AttendanceSummary {
  constructor(config) {
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.periodStart = config.periodStart ? new Date(config.periodStart) : new Date();
    this.periodEnd = config.periodEnd ? new Date(config.periodEnd) : new Date();
    this.totalDays = config.totalDays || 0;
    this.presentDays = config.presentDays || 0;
    this.absentDays = config.absentDays || 0;
    this.lateDays = config.lateDays || 0;
    this.halfDays = config.halfDays || 0;
    this.onLeaveDays = config.onLeaveDays || 0;
    this.totalWorkingHours = config.totalWorkingHours || 0;
    this.totalOvertimeHours = config.totalOvertimeHours || 0;
    this.averageCheckIn = config.averageCheckIn || null;
  }

  calculateAttendanceRate() {
    if (this.totalDays === 0) return 0;
    return Math.round((this.presentDays / this.totalDays) * 100);
  }
}

class AttendanceManager {
  constructor() {
    this.records = new Map();
    this.policies = new Map();
    this.employees = new Map();

    this._initializeDefaultPolicy();
    this._initializeSampleEmployees();
  }

  _initializeDefaultPolicy() {
    const policy = new AttendancePolicy({
      id: 'default',
      name: 'Standard Policy',
      workStartTime: '09:00',
      workEndTime: '18:00',
      breakDuration: 60,
      lateThreshold: 15,
      minWorkingHours: 8,
      weekendWorkAllowed: false,
      remoteWorkAllowed: true
    });
    this.policies.set(policy.id, policy);
  }

  _initializeSampleEmployees() {
    const employees = [
      { id: 'EMP001', name: 'Alice Johnson', department: 'Engineering', manager: 'John Smith' },
      { id: 'EMP002', name: 'Bob Williams', department: 'Sales', manager: 'Jane Doe' },
      { id: 'EMP003', name: 'Carol Davis', department: 'Marketing', manager: 'Jane Doe' },
      { id: 'EMP004', name: 'David Brown', department: 'Engineering', manager: 'John Smith' },
      { id: 'EMP005', name: 'Eva Martinez', department: 'HR', manager: 'Robert Lee' }
    ];
    employees.forEach(e => this.employees.set(e.id, e));
  }

  clockIn(employeeId, location = 'office', method = 'biometric') {
    const employee = this.employees.get(employeeId);
    if (!employee) throw new Error('Employee not found');

    const today = new Date();
    const dateKey = `${employeeId}-${today.toISOString().split('T')[0]}`;

    // Check if already clocked in
    if (this.records.has(dateKey)) {
      throw new Error('Already clocked in today');
    }

    const record = new AttendanceRecord({
      employeeId,
      employeeName: employee.name,
      date: today
    });

    record.doClockIn(location, method);
    this.records.set(dateKey, record);

    return record;
  }

  clockOut(employeeId) {
    const today = new Date();
    const dateKey = `${employeeId}-${today.toISOString().split('T')[0]}`;

    const record = this.records.get(dateKey);
    if (!record) throw new Error('No clock-in record found for today');

    record.doClockOut();
    return record;
  }

  addBreak(employeeId, start, end) {
    const today = new Date();
    const dateKey = `${employeeId}-${today.toISOString().split('T')[0]}`;

    const record = this.records.get(dateKey);
    if (!record) throw new Error('No clock-in record found for today');

    record.addBreak(start, end);
    return record;
  }

  getRecord(employeeId, date) {
    const dateKey = `${employeeId}-${date.toISOString().split('T')[0]}`;
    return this.records.get(dateKey);
  }

  getTodayRecord(employeeId) {
    return this.getRecord(employeeId, new Date());
  }

  getRecordsByDateRange(employeeId, startDate, endDate) {
    const results = [];
    this.records.forEach((record, key) => {
      if (record.employeeId === employeeId &&
          record.date >= startDate &&
          record.date <= endDate) {
        results.push(record);
      }
    });
    return results.sort((a, b) => a.date - b.date);
  }

  markAbsent(employeeId, date, reason = '') {
    const employee = this.employees.get(employeeId);
    if (!employee) throw new Error('Employee not found');

    const dateKey = `${employeeId}-${date.toISOString().split('T')[0]}`;
    const record = new AttendanceRecord({
      employeeId,
      employeeName: employee.name,
      date,
      status: 'absent',
      notes: reason
    });

    this.records.set(dateKey, record);
    return record;
  }

  markOnLeave(employeeId, date, leaveType = 'paid') {
    const employee = this.employees.get(employeeId);
    if (!employee) throw new Error('Employee not found');

    const dateKey = `${employeeId}-${date.toISOString().split('T')[0]}`;
    const record = new AttendanceRecord({
      employeeId,
      employeeName: employee.name,
      date,
      status: 'on_leave',
      notes: leaveType
    });

    this.records.set(dateKey, record);
    return record;
  }

  generateSummary(employeeId, startDate, endDate) {
    const employee = this.employees.get(employeeId);
    if (!employee) throw new Error('Employee not found');

    const records = this.getRecordsByDateRange(employeeId, startDate, endDate);

    const summary = new AttendanceSummary({
      employeeId,
      employeeName: employee.name,
      periodStart: startDate,
      periodEnd: endDate,
      totalDays: records.length
    });

    records.forEach(record => {
      switch (record.status) {
        case 'present':
          summary.presentDays++;
          break;
        case 'absent':
          summary.absentDays++;
          break;
        case 'late':
          summary.lateDays++;
          break;
        case 'half_day':
          summary.halfDays++;
          break;
        case 'on_leave':
          summary.onLeaveDays++;
          break;
      }

      summary.totalWorkingHours += record.workingHours;
      summary.totalOvertimeHours += record.overtimeHours;
    });

    return summary;
  }

  generateDepartmentReport(department, startDate, endDate) {
    const deptEmployees = Array.from(this.employees.values())
      .filter(e => e.department === department);

    const report = {
      department,
      periodStart: startDate,
      periodEnd: endDate,
      employees: []
    };

    deptEmployees.forEach(emp => {
      const summary = this.generateSummary(emp.id, startDate, endDate);
      report.employees.push(summary);
    });

    // Calculate department totals
    report.totals = {
      totalDays: report.employees.reduce((sum, e) => sum + e.totalDays, 0),
      presentDays: report.employees.reduce((sum, e) => sum + e.presentDays, 0),
      absentDays: report.employees.reduce((sum, e) => sum + e.absentDays, 0),
      lateDays: report.employees.reduce((sum, e) => sum + e.lateDays, 0),
      totalOvertime: report.employees.reduce((sum, e) => sum + e.totalOvertimeHours, 0),
      averageAttendanceRate: report.employees.length > 0
        ? Math.round(report.employees.reduce((sum, e) => sum + e.calculateAttendanceRate(), 0) / report.employees.length)
        : 0
    };

    return report;
  }

  getAttendanceStatus(employeeId) {
    const record = this.getTodayRecord(employeeId);
    if (!record) {
      return { status: 'not_clocked_in', message: 'Employee has not clocked in today' };
    }

    if (!record.clockOut) {
      return {
        status: 'clocked_in',
        clockInTime: record.clockIn.toISOString(),
        location: record.location,
        workingHours: record.workingHours,
        message: 'Currently at work'
      };
    }

    return {
      status: 'clocked_out',
      clockInTime: record.clockIn.toISOString(),
      clockOutTime: record.clockOut.toISOString(),
      workingHours: record.workingHours,
      overtimeHours: record.overtimeHours,
      location: record.location,
      message: 'Work day completed'
    };
  }

  listEmployees() {
    return Array.from(this.employees.values());
  }

  getPolicy(policyId = 'default') {
    return this.policies.get(policyId);
  }
}

// Demo function
function runDemo() {
  console.log('=== Agent Attendance Demo\n');

  const manager = new AttendanceManager();

  // 1. List employees
  console.log('1. Employees:');
  manager.listEmployees().forEach(emp => {
    console.log(`   ${emp.id}: ${emp.name} (${emp.department})`);
  });

  // 2. Clock in employees - simulate with fixed times
  console.log('\n2. Clock In Employees:');

  // Create a simulated today with fixed time
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Manually create records with realistic times
  const emp1Record = new AttendanceRecord({
    employeeId: 'EMP001',
    employeeName: 'Alice Johnson',
    date: today,
    clockInTime: new Date(today.getTime() + 9 * 60 * 60 * 1000), // 9 AM
    status: 'present'
  });
  manager.records.set('EMP001-' + today.toISOString().split('T')[0], emp1Record);
  console.log(`   Alice Johnson clocked in at 09:00:00`);

  const emp2Record = new AttendanceRecord({
    employeeId: 'EMP002',
    employeeName: 'Bob Williams',
    date: today,
    clockInTime: new Date(today.getTime() + 8 * 60 * 60 * 1000 + 45 * 60 * 1000), // 8:45 AM (late)
    status: 'present'
  });
  manager.records.set('EMP002-' + today.toISOString().split('T')[0], emp2Record);
  console.log(`   Bob Williams clocked in at 08:45:00 (remote)`);

  const emp3Record = new AttendanceRecord({
    employeeId: 'EMP003',
    employeeName: 'Carol Davis',
    date: today,
    clockInTime: new Date(today.getTime() + 9 * 60 * 60 * 1000), // 9 AM
    status: 'present'
  });
  manager.records.set('EMP003-' + today.toISOString().split('T')[0], emp3Record);
  console.log(`   Carol Davis clocked in at 09:00:00`);

  // 3. Simulate breaks
  console.log('\n3. Add Lunch Break:');
  const breakStart = new Date(today.getTime() + 12 * 60 * 60 * 1000); // 12 PM
  const breakEnd = new Date(today.getTime() + 13 * 60 * 60 * 1000); // 1 PM

  emp1Record.addBreak(breakStart, breakEnd);
  console.log(`   Alice Johnson took lunch break 12:00-13:00 (60 min)`);

  // 4. Clock out employees - simulate with fixed times
  console.log('\n4. Clock Out Employees:');
  emp1Record.clockOutTime = new Date(today.getTime() + 18 * 60 * 60 * 1000); // 6 PM
  const hours1 = emp1Record.calculateWorkingHours();
  console.log(`   Alice Johnson worked ${hours1.toFixed(2)} hours`);
  console.log(`      Overtime: ${emp1Record.overtimeHours.toFixed(2)} hours`);

  emp2Record.clockOutTime = new Date(today.getTime() + 17 * 60 * 60 * 1000); // 5 PM
  const hours2 = emp2Record.calculateWorkingHours();
  console.log(`   Bob Williams worked ${hours2.toFixed(2)} hours`);

  // 5. Get attendance status
  console.log('\n5. Current Attendance Status:');
  const status1 = manager.getAttendanceStatus('EMP001');
  console.log(`   EMP001: ${status1.status} - ${status1.message}`);

  const status2 = manager.getAttendanceStatus('EMP002');
  console.log(`   EMP002: ${status2.status} - ${status1.message}`);

  // 6. Mark absent employee
  console.log('\n6. Mark Absent Employee:');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  manager.markAbsent('EMP004', yesterday, 'Sick leave');
  console.log(`   EMP004 marked absent on ${yesterday.toISOString().split('T')[0]}`);

  // 7. Mark on leave
  console.log('\n7. Mark Employee On Leave:');
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  manager.markOnLeave('EMP005', lastWeek, 'Annual leave');
  console.log(`   EMP005 on leave on ${lastWeek.toISOString().split('T')[0]}`);

  // 8. Generate summary for employee
  console.log('\n8. Employee Attendance Summary (Last 7 days):');
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 7);
  const summary = manager.generateSummary('EMP001', weekStart, new Date());
  console.log(`   Employee: ${summary.employeeName}`);
  console.log(`   Period: ${summary.periodStart.toISOString().split('T')[0]} to ${summary.periodEnd.toISOString().split('T')[0]}`);
  console.log(`   Total Days: ${summary.totalDays}`);
  console.log(`   Present: ${summary.presentDays}`);
  console.log(`   Late: ${summary.lateDays}`);
  console.log(`   Total Working Hours: ${summary.totalWorkingHours.toFixed(2)}`);
  console.log(`   Total Overtime: ${summary.totalOvertimeHours.toFixed(2)}`);
  console.log(`   Attendance Rate: ${summary.calculateAttendanceRate()}%`);

  // 9. Generate department report
  console.log('\n9. Engineering Department Report:');
  const deptReport = manager.generateDepartmentReport('Engineering', weekStart, new Date());
  console.log(`   Department: ${deptReport.department}`);
  console.log(`   Total Employees: ${deptReport.employees.length}`);
  console.log(`   Total Present Days: ${deptReport.totals.presentDays}`);
  console.log(`   Total Overtime Hours: ${deptReport.totals.totalOvertime.toFixed(2)}`);
  console.log(`   Average Attendance Rate: ${deptReport.totals.averageAttendanceRate}%`);

  // 10. Get attendance policy
  console.log('\n10. Attendance Policy:');
  const policy = manager.getPolicy();
  console.log(`    Policy: ${policy.name}`);
  console.log(`    Work Hours: ${policy.workStartTime} - ${policy.workEndTime}`);
  console.log(`    Late Threshold: ${policy.lateThreshold} minutes`);
  console.log(`    Remote Work: ${policy.remoteWorkAllowed ? 'Allowed' : 'Not Allowed'}`);

  console.log('\n=== Demo Complete ===');
}

// CLI handler
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const manager = new AttendanceManager();

switch (command) {
  case 'demo':
    runDemo();
    break;

  case 'report':
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - 7);
    console.log('Attendance Report (Last 7 days):\n');
    manager.listEmployees().forEach(emp => {
      const summary = manager.generateSummary(emp.id, weekStart, new Date());
      console.log(`${emp.name}:`);
      console.log(`  Present: ${summary.presentDays}/${summary.totalDays} days`);
      console.log(`  Working Hours: ${summary.totalWorkingHours.toFixed(1)}`);
      console.log(`  Overtime: ${summary.totalOvertimeHours.toFixed(1)} hours`);
      console.log(`  Rate: ${summary.calculateAttendanceRate()}%`);
    });
    break;

  case 'status':
    console.log('Current Attendance Status:\n');
    manager.listEmployees().forEach(emp => {
      const status = manager.getAttendanceStatus(emp.id);
      console.log(`${emp.name}: ${status.status} - ${status.message}`);
    });
    break;

  default:
    console.log('Usage: node agent-attendance.js [command]');
    console.log('Commands:');
    console.log('  demo    - Run demonstration');
    console.log('  report  - Generate attendance report');
    console.log('  status  - Show current attendance status');
}
