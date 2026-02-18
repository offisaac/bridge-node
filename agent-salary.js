/**
 * Agent Salary Module
 *
 * Provides salary calculation and payroll management.
 * Usage: node agent-salary.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show salary stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

/**
 * Salary Type
 */
const SalaryType = {
  HOURLY: 'hourly',
  MONTHLY: 'monthly',
  ANNUAL: 'annual',
  COMMISSION: 'commission'
};

/**
 * Deduction Type
 */
const DeductionType = {
  FEDERAL_TAX: 'federal_tax',
  STATE_TAX: 'state_tax',
  SOCIAL_SECURITY: 'social_security',
  MEDICARE: 'medicare',
  HEALTH_INSURANCE: 'health_insurance',
  DENTAL_INSURANCE: 'dental_insurance',
  VISION_INSURANCE: 'vision_insurance',
  RETIREMENT_401K: 'retirement_401k',
  LIFE_INSURANCE: 'life_insurance',
  HSA: 'hsa',
  FSA: 'fsa',
  UNION_DUES: 'union_dues',
  OTHER: 'other'
};

/**
 * Bonus Type
 */
const BonusType = {
  PERFORMANCE: 'performance',
  SIGNING: 'signing',
  REFERRAL: 'referral',
  HOLIDAY: 'holiday',
  PROFIT_SHARING: 'profit_sharing',
  STOCK_OPTIONS: 'stock_options'
};

/**
 * Employee
 */
class Employee {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.name = config.name;
    this.department = config.department;
    this.position = config.position;
    this.salaryType = config.salaryType;
    this.baseSalary = config.baseSalary; // Annual for monthly, hourly rate for hourly
    this.hireDate = config.hireDate || Date.now();
    this.status = config.status || 'active';
    this.taxFilingStatus = config.taxFilingStatus || 'single';
    this.state = config.state || 'CA';
    this.allowances = config.allowances || 0;
    this.metadata = config.metadata || {};
  }

  getAnnualSalary() {
    switch (this.salaryType) {
      case SalaryType.MONTHLY:
        return this.baseSalary * 12;
      case SalaryType.HOURLY:
        return this.baseSalary * 2080; // 40 hours * 52 weeks
      case SalaryType.ANNUAL:
        return this.baseSalary;
      default:
        return 0;
    }
  }

  getMonthlySalary() {
    return this.getAnnualSalary() / 12;
  }

  toJSON() {
    return {
      id: this.id,
      employeeId: this.employeeId,
      name: this.name,
      department: this.department,
      position: this.position,
      salaryType: this.salaryType,
      baseSalary: this.baseSalary,
      annualSalary: this.getAnnualSalary(),
      monthlySalary: this.getMonthlySalary(),
      status: this.status,
      hireDate: this.hireDate
    };
  }
}

/**
 * Deduction Rule
 */
class DeductionRule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.type = config.type;
    this.name = config.name;
    this.rate = config.rate; // Percentage
    this.fixedAmount = config.fixedAmount || 0;
    this.maxAmount = config.maxAmount || null;
    this.minSalary = config.minSalary || 0;
    this.employerMatch = config.employerMatch || 0; // Percentage match
    this.effectiveDate = config.effectiveDate || Date.now();
    this.expirationDate = config.expirationDate || null;
  }

  isActive() {
    const now = Date.now();
    if (now < this.effectiveDate) return false;
    if (this.expirationDate && now > this.expirationDate) return false;
    return true;
  }

  calculate(grossPay) {
    if (!this.isActive()) return 0;
    if (grossPay < this.minSalary) return 0;

    let deduction = 0;

    if (this.rate > 0) {
      deduction = grossPay * (this.rate / 100);
    } else if (this.fixedAmount > 0) {
      deduction = this.fixedAmount;
    }

    if (this.maxAmount && deduction > this.maxAmount) {
      deduction = this.maxAmount;
    }

    return deduction;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      name: this.name,
      rate: this.rate,
      fixedAmount: this.fixedAmount,
      maxAmount: this.maxAmount,
      isActive: this.isActive()
    };
  }
}

/**
 * Salary Transaction
 */
class SalaryTransaction {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.payPeriod = config.payPeriod; // monthly, bi-weekly, weekly
    this.payDate = config.payDate || Date.now();
    this.grossPay = config.grossPay;
    this.grossPayYTD = config.grossPayYTD || 0;
    this.deductions = config.deductions || {};
    this.deductionsYTD = config.deductionsYTD || {};
    this.bonuses = config.bonuses || {};
    this.bonusesYTD = config.bonusesYTD || {};
    this.netPay = config.netPay;
    this.status = config.status || 'pending';
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      employeeId: this.employeeId,
      payPeriod: this.payPeriod,
      payDate: this.payDate,
      grossPay: this.grossPay,
      deductions: this.deductions,
      bonuses: this.bonuses,
      netPay: this.netPay,
      status: this.status
    };
  }
}

/**
 * Salary Manager
 */
class SalaryManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.employees = new Map();
    this.deductionRules = new Map();
    this.transactions = new Map();
    this.stats = {
      totalEmployees: 0,
      totalPayroll: 0,
      totalDeductions: 0,
      totalBonuses: 0,
      transactionsProcessed: 0
    };

    this._init();
  }

  _init() {
    this._createSampleDeductions();
    this._createSampleEmployees();
  }

  _createSampleDeductions() {
    // US Federal Income Tax (simplified brackets)
    this.deductionRules.set('FED-TAX', new DeductionRule({
      type: DeductionType.FEDERAL_TAX,
      name: 'Federal Income Tax',
      rate: 22, // Simplified
      minSalary: 0
    }));

    // Social Security
    this.deductionRules.set('SS', new DeductionRule({
      type: DeductionType.SOCIAL_SECURITY,
      name: 'Social Security',
      rate: 6.2,
      maxAmount: 10080, // 2024 cap
      minSalary: 0
    }));

    // Medicare
    this.deductionRules.set('MED', new DeductionRule({
      type: DeductionType.MEDICARE,
      name: 'Medicare',
      rate: 1.45,
      minSalary: 0
    }));

    // California State Tax
    this.deductionRules.set('CA-STATE', new DeductionRule({
      type: DeductionType.STATE_TAX,
      name: 'California State Tax',
      rate: 5.0,
      minSalary: 0
    }));

    // Health Insurance
    this.deductionRules.set('HEALTH', new DeductionRule({
      type: DeductionType.HEALTH_INSURANCE,
      name: 'Health Insurance',
      fixedAmount: 200
    }));

    // Dental Insurance
    this.deductionRules.set('DENTAL', new DeductionRule({
      type: DeductionType.DENTAL_INSURANCE,
      name: 'Dental Insurance',
      fixedAmount: 30
    }));

    // 401(k)
    this.deductionRules.set('401K', new DeductionRule({
      type: DeductionType.RETIREMENT_401K,
      name: '401(k)',
      rate: 6.0,
      maxAmount: 23000, // 2024 limit
      employerMatch: 3.0
    }));
  }

  _createSampleEmployees() {
    const employees = [
      new Employee({
        employeeId: 'EMP001',
        name: 'John Smith',
        department: 'Engineering',
        position: 'Senior Developer',
        salaryType: SalaryType.MONTHLY,
        baseSalary: 8000,
        taxFilingStatus: 'married',
        state: 'CA'
      }),
      new Employee({
        employeeId: 'EMP002',
        name: 'Jane Doe',
        department: 'Marketing',
        position: 'Marketing Manager',
        salaryType: SalaryType.MONTHLY,
        baseSalary: 7000,
        taxFilingStatus: 'single',
        state: 'CA'
      }),
      new Employee({
        employeeId: 'EMP003',
        name: 'Bob Johnson',
        department: 'Sales',
        position: 'Sales Representative',
        salaryType: SalaryType.MONTHLY,
        baseSalary: 5000,
        taxFilingStatus: 'single',
        state: 'NY'
      })
    ];

    for (const emp of employees) {
      this.employees.set(emp.id, emp);
    }
  }

  /**
   * Get employee
   */
  getEmployee(employeeIdOrName) {
    // Search by employeeId
    for (const emp of this.employees.values()) {
      if (emp.employeeId === employeeIdOrName || emp.name === employeeIdOrName) {
        return emp;
      }
    }
    return null;
  }

  /**
   * Calculate deductions
   */
  calculateDeductions(grossPay, employee) {
    const deductions = {};
    let totalDeductions = 0;

    for (const rule of this.deductionRules.values()) {
      const amount = rule.calculate(grossPay);
      deductions[rule.type] = amount;
      totalDeductions += amount;
    }

    return { deductions, totalDeductions };
  }

  /**
   * Process salary
   */
  processSalary(employeeId, payPeriod = 'monthly', bonuses = {}) {
    const employee = this.getEmployee(employeeId);

    if (!employee) {
      return { success: false, reason: 'Employee not found' };
    }

    if (employee.status !== 'active') {
      return { success: false, reason: 'Employee is not active' };
    }

    // Calculate gross pay
    let grossPay = 0;
    switch (payPeriod) {
      case 'weekly':
        grossPay = employee.getAnnualSalary() / 52;
        break;
      case 'bi-weekly':
        grossPay = employee.getAnnualSalary() / 26;
        break;
      case 'monthly':
        grossPay = employee.getMonthlySalary();
        break;
      default:
        grossPay = employee.getMonthlySalary();
    }

    // Add bonuses
    let totalBonus = 0;
    for (const [type, amount] of Object.entries(bonuses)) {
      totalBonus += amount;
    }
    grossPay += totalBonus;

    // Calculate deductions
    const { deductions, totalDeductions } = this.calculateDeductions(grossPay, employee);

    // Calculate net pay
    const netPay = grossPay - totalDeductions;

    // Create transaction
    const transaction = new SalaryTransaction({
      employeeId: employee.employeeId,
      payPeriod: payPeriod,
      grossPay: grossPay,
      deductions: deductions,
      bonuses: bonuses,
      netPay: netPay,
      status: 'processed'
    });

    this.transactions.set(transaction.id, transaction);

    // Update stats
    this.stats.totalEmployees++;
    this.stats.totalPayroll += grossPay;
    this.stats.totalDeductions += totalDeductions;
    this.stats.totalBonuses += totalBonus;
    this.stats.transactionsProcessed++;

    return {
      success: true,
      transactionId: transaction.id,
      employee: employee.toJSON(),
      grossPay: grossPay,
      deductions: deductions,
      totalDeductions: totalDeductions,
      bonuses: bonuses,
      totalBonus: totalBonus,
      netPay: netPay
    };
  }

  /**
   * Add employee
   */
  addEmployee(config) {
    const employee = new Employee(config);
    this.employees.set(employee.id, employee);
    return {
      success: true,
      employeeId: employee.id,
      employee: employee.toJSON()
    };
  }

  /**
   * Get employee transactions
   */
  getEmployeeTransactions(employeeId) {
    const results = [];
    for (const txn of this.transactions.values()) {
      if (txn.employeeId === employeeId) {
        results.push(txn);
      }
    }
    return results;
  }

  /**
   * Get employees by department
   */
  getEmployeesByDepartment(department) {
    const results = [];
    for (const emp of this.employees.values()) {
      if (emp.department === department) {
        results.push(emp);
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
      totalEmployees: this.employees.size,
      activeEmployees: Array.from(this.employees.values()).filter(e => e.status === 'active').length,
      totalTransactions: this.transactions.size,
      avgSalary: Array.from(this.employees.values()).reduce((sum, e) => sum + e.getAnnualSalary(), 0) / this.employees.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Salary Demo\n');

  const manager = new SalaryManager();

  // Show employees
  console.log('1. Employees:');
  for (const emp of manager.employees.values()) {
    console.log(`   ${emp.employeeId}: ${emp.name} - ${emp.position}`);
    console.log(`      Salary: $${emp.baseSalary}/month ($${emp.getAnnualSalary()}/year)`);
  }

  // Show deduction rules
  console.log('\n2. Deduction Rules:');
  for (const rule of manager.deductionRules.values()) {
    const rateDisplay = rule.rate > 0 ? `${rule.rate}%` : `$${rule.fixedAmount}`;
    console.log(`   ${rule.name}: ${rateDisplay}`);
  }

  // Process salary for John
  console.log('\n3. Processing Monthly Salary (EMP001):');
  const result1 = manager.processSalary('EMP001', 'monthly');
  console.log(`   Success: ${result1.success}`);
  console.log(`   Gross Pay: $${result1.grossPay.toFixed(2)}`);
  console.log(`   Deductions:`);
  for (const [type, amount] of Object.entries(result1.deductions)) {
    console.log(`      ${type}: $${amount.toFixed(2)}`);
  }
  console.log(`   Total Deductions: $${result1.totalDeductions.toFixed(2)}`);
  console.log(`   Net Pay: $${result1.netPay.toFixed(2)}`);

  // Process salary for Jane
  console.log('\n4. Processing Monthly Salary (EMP002):');
  const result2 = manager.processSalary('EMP002', 'monthly');
  console.log(`   Success: ${result2.success}`);
  console.log(`   Gross Pay: $${result2.grossPay.toFixed(2)}`);
  console.log(`   Net Pay: $${result2.netPay.toFixed(2)}`);

  // Process salary with bonus
  console.log('\n5. Processing Salary with Bonus (EMP001):');
  const result3 = manager.processSalary('EMP001', 'monthly', {
    [BonusType.PERFORMANCE]: 1000,
    [BonusType.HOLIDAY]: 500
  });
  console.log(`   Success: ${result3.success}`);
  console.log(`   Gross Pay: $${result3.grossPay.toFixed(2)}`);
  console.log(`   Bonuses: $${result3.totalBonus.toFixed(2)}`);
  console.log(`   Net Pay: $${result3.netPay.toFixed(2)}`);

  // Process salary for sales rep
  console.log('\n6. Processing Salary (EMP003 - Sales):');
  const result4 = manager.processSalary('EMP003', 'monthly');
  console.log(`   Success: ${result4.success}`);
  console.log(`   Gross Pay: $${result4.grossPay.toFixed(2)}`);
  console.log(`   Net Pay: ${result4.netPay.toFixed(2)}`);

  // Process salary with commission
  console.log('\n7. Processing Salary with Commission (EMP003):');
  const result5 = manager.processSalary('EMP003', 'monthly', {
    [BonusType.COMMISSION]: 2000
  });
  console.log(`   Success: ${result5.success}`);
  console.log(`   Gross Pay: $${result5.grossPay.toFixed(2)}`);
  console.log(`   Net Pay: $${result5.netPay.toFixed(2)}`);

  // Test invalid employee
  console.log('\n8. Testing Invalid Employee:');
  const result6 = manager.processSalary('INVALID', 'monthly');
  console.log(`   Success: ${result6.success}`);
  console.log(`   Reason: ${result6.reason}`);

  // Get employees by department
  console.log('\n9. Employees by Department:');
  const deptCounts = {};
  for (const emp of manager.employees.values()) {
    deptCounts[emp.department] = (deptCounts[emp.department] || 0) + 1;
  }
  for (const [dept, count] of Object.entries(deptCounts)) {
    console.log(`   ${dept}: ${count}`);
  }

  // Get employee transactions
  console.log('\n10. Employee Transactions (EMP001):');
  const txns = manager.getEmployeeTransactions('EMP001');
  console.log(`    Total: ${txns.length}`);

  // Stats
  console.log('\n11. Statistics:');
  const stats = manager.getStats();
  console.log(`    Total Employees: ${stats.totalEmployees}`);
  console.log(`    Active Employees: ${stats.activeEmployees}`);
  console.log(`    Total Payroll: $${stats.totalPayroll.toFixed(2)}`);
  console.log(`    Total Deductions: $${stats.totalDeductions.toFixed(2)}`);
  console.log(`    Total Bonuses: $${stats.totalBonuses.toFixed(2)}`);
  console.log(`    Transactions Processed: ${stats.transactionsProcessed}`);
  console.log(`    Average Salary: $${stats.avgSalary.toFixed(2)}/year`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new SalaryManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Salary Module');
  console.log('Usage: node agent-salary.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
