/**
 * Agent Payroll - Payroll Processing Agent
 *
 * Manages payroll processing, salary calculations, tax deductions, and payment distribution.
 *
 * Usage: node agent-payroll.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   process - Process payroll
 *   run     - Run payroll for period
 */

class PayrollPeriod {
  constructor(config) {
    this.id = `period-${Date.now()}`;
    this.name = config.name;
    this.startDate = config.startDate;
    this.endDate = config.endDate;
    this.type = config.type; // weekly, biweekly, monthly
    this.status = 'pending'; // pending, processing, completed
  }
}

class PayrollEntry {
  constructor(config) {
    this.id = `pay-${Date.now()}`;
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.periodId = config.periodId;
    this.grossPay = config.grossPay;
    this.deductions = config.deductions || {};
    this.netPay = config.grossPay - this.getTotalDeductions();
    this.status = 'calculated'; // calculated, approved, paid
    this.payDate = null;
  }

  getTotalDeductions() {
    return Object.values(this.deductions).reduce((sum, d) => sum + d, 0);
  }
}

class PayrollAgent {
  constructor(config = {}) {
    this.periods = new Map();
    this.entries = new Map();
    this.taxRates = {
      federal: 0.22,
      state: 0.05,
      socialSecurity: 0.062,
      medicare: 0.0145,
      healthInsurance: 200
    };
    this.stats = {
      totalProcessed: 0,
      totalPaid: 0,
      totalDeductions: 0
    };
  }

  createPeriod(name, startDate, endDate, type) {
    const period = new PayrollPeriod({ name, startDate, endDate, type });
    this.periods.set(period.id, period);
    console.log(`   Created period: ${name}`);
    return period;
  }

  calculatePayroll(employeeId, employeeName, salary, periodType = 'monthly') {
    const periodsPerYear = periodType === 'monthly' ? 12 : 26;
    const grossPay = salary / periodsPerYear;

    const deductions = {
      federal: grossPay * this.taxRates.federal,
      state: grossPay * this.taxRates.state,
      socialSecurity: grossPay * this.taxRates.socialSecurity,
      medicare: grossPay * this.taxRates.medicare,
      healthInsurance: this.taxRates.healthInsurance / periodsPerYear
    };

    return { grossPay, deductions };
  }

  processPayroll(periodId, employees) {
    const period = this.periods.get(periodId);
    if (!period) {
      return { success: false, reason: 'Period not found' };
    }

    period.status = 'processing';
    let totalGross = 0;
    let totalDeductions = 0;

    for (const emp of employees) {
      const { grossPay, deductions } = this.calculatePayroll(
        emp.id, emp.name, emp.salary, period.type
      );

      const entry = new PayrollEntry({
        employeeId: emp.id,
        employeeName: emp.name,
        periodId,
        grossPay,
        deductions
      });

      this.entries.set(entry.id, entry);
      totalGross += grossPay;
      totalDeductions += entry.getTotalDeductions();

      console.log(`   Processed: ${emp.name} - $${entry.netPay.toFixed(2)}`);
    }

    period.status = 'completed';
    this.stats.totalProcessed += employees.length;
    this.stats.totalPaid += totalGross;
    this.stats.totalDeductions += totalDeductions;

    console.log(`   Period total: $${totalGross.toFixed(2)} gross, $${totalDeductions.toFixed(2)} deductions`);
    return { success: true, entries: employees.length };
  }

  getEntry(entryId) {
    return this.entries.get(entryId);
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new PayrollAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Payroll Demo\n');

    // 1. Create Payroll Periods
    console.log('1. Create Payroll Periods:');
    const period1 = agent.createPeriod(
      'January 2026',
      new Date('2026-01-01'),
      new Date('2026-01-31'),
      'monthly'
    );
    const period2 = agent.createPeriod(
      'Feb 1-15 2026',
      new Date('2026-02-01'),
      new Date('2026-02-15'),
      'biweekly'
    );

    // 2. Process Payroll
    console.log('\n2. Process Payroll:');
    const employees = [
      { id: 'emp-001', name: 'John Smith', salary: 120000 },
      { id: 'emp-002', name: 'Sarah Johnson', salary: 85000 },
      { id: 'emp-003', name: 'Mike Davis', salary: 75000 },
      { id: 'emp-004', name: 'Emily Chen', salary: 95000 }
    ];
    agent.processPayroll(period1.id, employees);

    // 3. Calculate Individual Pay
    console.log('\n3. Calculate Individual Pay:');
    const calc = agent.calculatePayroll('emp-001', 'John Smith', 120000, 'monthly');
    console.log(`   Gross: $${calc.grossPay.toFixed(2)}`);
    console.log(`   Deductions: $${Object.values(calc.deductions).reduce((a, b) => a + b).toFixed(2)}`);
    console.log(`   Net: $${(calc.grossPay - Object.values(calc.deductions).reduce((a, b) => a + b)).toFixed(2)}`);

    // 4. Statistics
    console.log('\n4. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total Processed: ${stats.totalProcessed} employees`);
    console.log(`   Total Paid: $${stats.totalPaid.toFixed(2)}`);
    console.log(`   Total Deductions: $${stats.totalDeductions.toFixed(2)}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'process':
    console.log('Processing test payroll...');
    const p = agent.createPeriod('Test Period', Date.now(), Date.now() + 86400000, 'monthly');
    const emps = [{ id: 'test', name: 'Test User', salary: 60000 }];
    agent.processPayroll(p.id, emps);
    break;

  case 'run':
    console.log('Running payroll...');
    const period = agent.createPeriod('March 2026', Date.now(), Date.now() + 86400000 * 30, 'monthly');
    const staff = [
      { id: '1', name: 'Alice', salary: 100000 },
      { id: '2', name: 'Bob', salary: 80000 }
    ];
    agent.processPayroll(period.id, staff);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-payroll.js [demo|process|run]');
}
