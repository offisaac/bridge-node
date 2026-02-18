/**
 * Agent Scheduling - Employee Scheduling Agent
 *
 * Manages work schedules, shift assignments, and employee scheduling.
 *
 * Usage: node agent-scheduling.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   create  - Create schedule
 *   list    - List schedules
 */

class WorkSchedule {
  constructor(config) {
    this.id = `schedule-${Date.now()}`;
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.name = config.name || 'Default Schedule';
    this.startDate = new Date(config.startDate);
    this.endDate = config.endDate ? new Date(config.endDate) : null;
    this.scheduleType = config.scheduleType || 'regular'; // regular, shift, flexible, remote
    this.shifts = [];
    this.status = 'active';
  }

  addShift(shift) {
    this.shifts.push(shift);
  }
}

class Shift {
  constructor(config) {
    this.id = `shift-${Date.now()}`;
    this.employeeId = config.employeeId;
    this.date = new Date(config.date);
    this.startTime = config.startTime; // "09:00"
    this.endTime = config.endTime; // "17:00"
    this.duration = config.duration || this.calculateDuration();
    this.role = config.role || 'employee';
    this.location = config.location || 'office';
    this.status = 'scheduled'; // scheduled, confirmed, completed, cancelled
    this.notes = '';
  }

  calculateDuration() {
    const [startH, startM] = this.startTime.split(':').map(Number);
    const [endH, endM] = this.endTime.split(':').map(Number);
    return (endH * 60 + endM - startH * 60 - startM) / 60;
  }

  confirm() {
    this.status = 'confirmed';
  }

  complete() {
    this.status = 'completed';
  }

  cancel() {
    this.status = 'cancelled';
  }
}

class ScheduleTemplate {
  constructor(config) {
    this.id = `template-${Date.now()}`;
    this.name = config.name;
    this.scheduleType = config.scheduleType;
    this.defaultStartTime = config.defaultStartTime;
    this.defaultEndTime = config.defaultEndTime;
    this.daysOfWeek = config.daysOfWeek || [1, 2, 3, 4, 5]; // Mon-Fri
  }
}

class SchedulingAgent {
  constructor(config = {}) {
    this.schedules = new Map();
    this.shifts = new Map();
    this.templates = new Map();
    this.stats = {
      schedulesCreated: 0,
      shiftsScheduled: 0,
      shiftsCompleted: 0
    };
    this.initTemplates();
    this.initSampleSchedules();
  }

  initTemplates() {
    const templates = [
      { name: 'Standard 9-5', scheduleType: 'regular', defaultStartTime: '09:00', defaultEndTime: '17:00', daysOfWeek: [1, 2, 3, 4, 5] },
      { name: 'Morning Shift', scheduleType: 'shift', defaultStartTime: '06:00', defaultEndTime: '14:00', daysOfWeek: [1, 2, 3, 4, 5] },
      { name: 'Evening Shift', scheduleType: 'shift', defaultStartTime: '14:00', defaultEndTime: '22:00', daysOfWeek: [1, 2, 3, 4, 5] },
      { name: 'Night Shift', scheduleType: 'shift', defaultStartTime: '22:00', defaultEndTime: '06:00', daysOfWeek: [1, 2, 3, 4, 5] },
      { name: 'Flexible', scheduleType: 'flexible', defaultStartTime: '09:00', defaultEndTime: '17:00', daysOfWeek: [1, 2, 3, 4, 5] },
      { name: 'Remote', scheduleType: 'remote', defaultStartTime: '09:00', defaultEndTime: '17:00', daysOfWeek: [1, 2, 3, 4, 5] }
    ];

    templates.forEach(t => {
      const template = new ScheduleTemplate(t);
      this.templates.set(template.name, template);
    });
  }

  initSampleSchedules() {
    // Create sample schedules for demo
  }

  createSchedule(config) {
    const schedule = new WorkSchedule(config);
    this.schedules.set(schedule.id, schedule);
    this.stats.schedulesCreated++;
    console.log(`   Created schedule: ${schedule.employeeName}`);
    return schedule;
  }

  createShift(config) {
    const shift = new Shift(config);
    this.shifts.set(shift.id, shift);
    this.stats.shiftsScheduled++;

    // Add to employee's schedule
    const schedule = Array.from(this.schedules.values()).find(s => s.employeeId === shift.employeeId);
    if (schedule) {
      schedule.addShift(shift);
    }

    console.log(`   Scheduled shift: ${shift.date.toISOString().split('T')[0]} ${shift.startTime}-${shift.endTime}`);
    return shift;
  }

  bulkCreateShifts(employeeId, startDate, days, startTime, endTime) {
    const shifts = [];
    const start = new Date(startDate);

    for (let i = 0; i < days; i++) {
      const date = new Date(start);
      date.setDate(date.getDate() + i);

      const shift = this.createShift({
        employeeId,
        date,
        startTime,
        endTime
      });
      shifts.push(shift);
    }

    return shifts;
  }

  confirmShift(shiftId) {
    const shift = this.shifts.get(shiftId);
    if (!shift) {
      return { success: false, reason: 'Shift not found' };
    }

    shift.confirm();
    console.log(`   Confirmed shift: ${shift.id}`);
    return { success: true, shift };
  }

  completeShift(shiftId) {
    const shift = this.shifts.get(shiftId);
    if (!shift) {
      return { success: false, reason: 'Shift not found' };
    }

    shift.complete();
    this.stats.shiftsCompleted++;
    console.log(`   Completed shift: ${shift.id}`);
    return { success: true, shift };
  }

  cancelShift(shiftId) {
    const shift = this.shifts.get(shiftId);
    if (!shift) {
      return { success: false, reason: 'Shift not found' };
    }

    shift.cancel();
    console.log(`   Cancelled shift: ${shift.id}`);
    return { success: true, shift };
  }

  getEmployeeSchedule(employeeId) {
    return Array.from(this.schedules.values()).find(s => s.employeeId === employeeId);
  }

  getEmployeeShifts(employeeId, startDate, endDate) {
    return Array.from(this.shifts.values()).filter(s => {
      if (s.employeeId !== employeeId) return false;
      if (startDate && s.date < new Date(startDate)) return false;
      if (endDate && s.date > new Date(endDate)) return false;
      return true;
    });
  }

  getTemplates() {
    return Array.from(this.templates.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new SchedulingAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Scheduling Demo\n');

    // 1. Show Schedule Templates
    console.log('1. Schedule Templates:');
    const templates = agent.getTemplates();
    templates.forEach(t => {
      console.log(`   ${t.name}: ${t.defaultStartTime}-${t.defaultEndTime} (${t.scheduleType})`);
    });

    // 2. Create Employee Schedules
    console.log('\n2. Create Employee Schedules:');
    const sched1 = agent.createSchedule({
      employeeId: 'emp-001',
      employeeName: 'John Smith',
      name: 'Standard Schedule',
      startDate: '2026-01-01',
      scheduleType: 'regular'
    });
    const sched2 = agent.createSchedule({
      employeeId: 'emp-002',
      employeeName: 'Sarah Johnson',
      name: 'Morning Shift',
      startDate: '2026-01-01',
      scheduleType: 'shift'
    });

    // 3. Schedule Shifts
    console.log('\n3. Schedule Shifts:');
    agent.createShift({
      employeeId: 'emp-001',
      date: '2026-02-20',
      startTime: '09:00',
      endTime: '17:00',
      role: 'Developer',
      location: 'Office'
    });
    agent.createShift({
      employeeId: 'emp-001',
      date: '2026-02-21',
      startTime: '09:00',
      endTime: '17:00',
      role: 'Developer',
      location: 'Office'
    });
    agent.createShift({
      employeeId: 'emp-002',
      date: '2026-02-20',
      startTime: '06:00',
      endTime: '14:00',
      role: 'Support',
      location: 'Office'
    });

    // 4. Bulk Schedule
    console.log('\n4. Bulk Schedule (Week):');
    agent.bulkCreateShifts('emp-003', '2026-02-24', 5, '09:00', '17:00');

    // 5. Confirm Shifts
    console.log('\n5. Confirm Shifts:');
    const shifts = agent.getEmployeeShifts('emp-001');
    if (shifts.length > 0) {
      agent.confirmShift(shifts[0].id);
    }

    // 6. Complete Shift
    console.log('\n6. Complete Shift:');
    if (shifts.length > 1) {
      agent.completeShift(shifts[1].id);
    }

    // 7. View Employee Schedule
    console.log('\n7. View Employee Schedule:');
    const empSchedule = agent.getEmployeeSchedule('emp-001');
    if (empSchedule) {
      console.log(`   Employee: ${empSchedule.employeeName}`);
      console.log(`   Schedule Type: ${empSchedule.scheduleType}`);
      console.log(`   Total Shifts: ${empSchedule.shifts.length}`);
    }

    // 8. Get Shifts for Date Range
    console.log('\n8. Shifts This Week:');
    const weekShifts = agent.getEmployeeShifts('emp-001', '2026-02-20', '2026-02-28');
    weekShifts.forEach(s => {
      console.log(`   ${s.date.toISOString().split('T')[0]}: ${s.startTime}-${s.endTime} (${s.status})`);
    });

    // 9. Statistics
    console.log('\n9. Statistics:');
    const stats = agent.getStats();
    console.log(`   Schedules Created: ${stats.schedulesCreated}`);
    console.log(`   Shifts Scheduled: ${stats.shiftsScheduled}`);
    console.log(`   Shifts Completed: ${stats.shiftsCompleted}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'create':
    console.log('Creating test schedule...');
    const s = agent.createSchedule({
      employeeId: 'test-001',
      employeeName: 'Test User',
      startDate: '2026-03-01',
      scheduleType: 'regular'
    });
    console.log(`Created: ${s.id}`);
    break;

  case 'list':
    console.log('Listing schedules...');
    for (const sched of agent.schedules.values()) {
      console.log(`   ${sched.employeeName}: ${sched.scheduleType}`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-scheduling.js [demo|create|list]');
}
