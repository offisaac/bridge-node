/**
 * Agent Accrual - Leave Accrual Management Module
 *
 * Manages leave accrual calculations, accrual policies, and employee accrual tracking.
 *
 * Usage: node agent-accrual.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   list    - List all accrual policies
 *   balance - Check employee accrual balances
 */

class AccrualPolicy {
  constructor(config) {
    this.leaveType = config.leaveType;
    this.accrualRate = config.accrualRate; // days per period
    this.accrualPeriod = config.accrualPeriod; // 'monthly', 'biweekly', 'weekly', 'yearly'
    this.maxCarryover = config.maxCarryover || 0; // max days carried over
    this.maxBalance = config.maxBalance || 0; // max accrual balance
    this.accrualStartDay = config.accrualStartDay || 1; // day of month/year
    this.prorateFirstYear = config.prorateFirstYear || false;
  }

  toString() {
    return `${this.leaveType}: ${this.accrualRate} days/${this.accrualPeriod}, max carryover: ${this.maxCarryover}, max balance: ${this.maxBalance}`;
  }
}

class AccrualEntry {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.leaveType = config.leaveType;
    this.amount = config.amount; // positive for accrual, negative for usage
    this.balanceAfter = config.balanceAfter;
    this.transactionDate = config.transactionDate || new Date();
    this.description = config.description || '';
    this.accrualPeriod = config.accrualPeriod || '';
    this.isAutomatic = config.isAutomatic || false;
  }
}

class EmployeeAccrual {
  constructor(config) {
    this.employeeId = config.employeeId;
    this.leaveType = config.leaveType;
    this.totalAccrued = config.totalAccrued || 0;
    this.totalUsed = config.totalUsed || 0;
    this.currentBalance = config.currentBalance || 0;
    this.carryoverBalance = config.carryoverBalance || 0;
    this.pendingAccrual = config.pendingAccrual || 0;
    this.lastAccrualDate = config.lastAccrualDate || null;
    this.accrualHistory = config.accrualHistory || [];
  }

  addAccrual(amount) {
    this.totalAccrued += amount;
    this.currentBalance += amount;
    this.pendingAccrual += amount;
  }

  useAccrual(amount) {
    const available = this.currentBalance - this.carryoverBalance;
    if (amount > available) {
      throw new Error(`Insufficient accrual balance. Available: ${available}, Requested: ${amount}`);
    }
    this.totalUsed += amount;
    this.currentBalance -= amount;
  }

  getAvailableBalance() {
    return this.currentBalance - this.carryoverBalance;
  }

  toString() {
    return `${this.leaveType}: ${this.currentBalance.toFixed(2)} total (${this.getAvailableBalance().toFixed(2)} available, ${this.carryoverBalance.toFixed(2)} carryover)`;
  }
}

class AccrualManager {
  constructor() {
    this.policies = new Map();
    this.employeeAccruals = new Map(); // employeeId -> Map<leaveType, EmployeeAccrual>
    this.transactionHistory = [];

    this._initializeDefaultPolicies();
  }

  _initializeDefaultPolicies() {
    const defaultPolicies = [
      { leaveType: 'annual', accrualRate: 1.67, accrualPeriod: 'monthly', maxCarryover: 5, maxBalance: 20 },
      { leaveType: 'sick', accrualRate: 0.83, accrualPeriod: 'monthly', maxCarryover: 10, maxBalance: 15 },
      { leaveType: 'personal', accrualRate: 0.42, accrualPeriod: 'monthly', maxCarryover: 2, maxBalance: 5 },
      { leaveType: 'vacation', accrualRate: 2.08, accrualPeriod: 'monthly', maxCarryover: 10, maxBalance: 30 },
    ];

    defaultPolicies.forEach(policy => {
      this.addPolicy(policy);
    });
  }

  addPolicy(policyConfig) {
    const policy = new AccrualPolicy(policyConfig);
    this.policies.set(policy.leaveType, policy);
    return policy;
  }

  getPolicy(leaveType) {
    return this.policies.get(leaveType);
  }

  listPolicies() {
    return Array.from(this.policies.values());
  }

  initializeEmployee(employeeId, leaveTypes = null) {
    if (!this.employeeAccruals.has(employeeId)) {
      this.employeeAccruals.set(employeeId, new Map());
    }

    const employeeMap = this.employeeAccruals.get(employeeId);
    const types = leaveTypes || Array.from(this.policies.keys());

    types.forEach(leaveType => {
      if (!employeeMap.has(leaveType) && this.policies.has(leaveType)) {
        const policy = this.policies.get(leaveType);
        employeeMap.set(leaveType, new EmployeeAccrual({
          employeeId,
          leaveType,
          carryoverBalance: 0,
          totalAccrued: 0,
          totalUsed: 0,
          currentBalance: 0
        }));
      }
    });
  }

  processCarryover(employeeId, carryoverData) {
    this.initializeEmployee(employeeId);
    const employeeMap = this.employeeAccruals.get(employeeId);

    Object.entries(carryoverData).forEach(([leaveType, amount]) => {
      if (employeeMap.has(leaveType)) {
        const accrual = employeeMap.get(leaveType);
        const policy = this.policies.get(leaveType);

        const validCarryover = Math.min(amount, policy.maxCarryover);
        accrual.carryoverBalance = validCarryover;
        accrual.currentBalance = validCarryover;

        this._addTransaction({
          employeeId,
          leaveType,
          amount: validCarryover,
          balanceAfter: validCarryover,
          description: `Carryover from previous period`,
          isAutomatic: true
        });
      }
    });
  }

  calculateAccrualForPeriod(policy, currentBalance) {
    let newAccrual = policy.accrualRate;
    let potentialBalance = currentBalance + newAccrual;

    // Apply max balance cap
    if (policy.maxBalance > 0 && potentialBalance > policy.maxBalance) {
      newAccrual = Math.max(0, policy.maxBalance - currentBalance);
    }

    return newAccrual;
  }

  processMonthlyAccrual(employeeId, accrualDate = new Date()) {
    const results = [];

    if (!this.employeeAccruals.has(employeeId)) {
      this.initializeEmployee(employeeId);
    }

    const employeeMap = this.employeeAccruals.get(employeeId);
    const currentMonth = accrualDate.getMonth();
    const currentYear = accrualDate.getFullYear();

    employeeMap.forEach((accrual, leaveType) => {
      const policy = this.policies.get(leaveType);

      // Check if this policy accrues monthly
      if (policy.accrualPeriod !== 'monthly') return;

      // Check if already accrued this month
      if (accrual.lastAccrualDate) {
        const lastAccrual = new Date(accrual.lastAccrualDate);
        if (lastAccrual.getMonth() === currentMonth && lastAccrual.getFullYear() === currentYear) {
          return; // Already accrued this month
        }
      }

      // Calculate and add accrual
      const newAccrual = this.calculateAccrualForPeriod(policy, accrual.currentBalance);

      if (newAccrual > 0) {
        accrual.addAccrual(newAccrual);
        accrual.lastAccrualDate = accrualDate;

        this._addTransaction({
          employeeId,
          leaveType,
          amount: newAccrual,
          balanceAfter: accrual.currentBalance,
          description: `Monthly accrual for ${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`,
          accrualPeriod: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`,
          isAutomatic: true
        });

        results.push({
          leaveType,
          amount: newAccrual,
          newBalance: accrual.currentBalance
        });
      }
    });

    return results;
  }

  processYearlyAccrual(employeeId, year) {
    const results = [];

    if (!this.employeeAccruals.has(employeeId)) {
      this.initializeEmployee(employeeId);
    }

    const employeeMap = this.employeeAccruals.get(employeeId);

    employeeMap.forEach((accrual, leaveType) => {
      const policy = this.policies.get(leaveType);

      if (policy.accrualPeriod !== 'yearly') return;

      const newAccrual = this.calculateAccrualForPeriod(policy, accrual.currentBalance);

      if (newAccrual > 0) {
        accrual.addAccrual(newAccrual);
        accrual.lastAccrualDate = new Date(`${year}-12-31`);

        this._addTransaction({
          employeeId,
          leaveType,
          amount: newAccrual,
          balanceAfter: accrual.currentBalance,
          description: `Yearly accrual for ${year}`,
          accrualPeriod: `${year}`,
          isAutomatic: true
        });

        results.push({
          leaveType,
          amount: newAccrual,
          newBalance: accrual.currentBalance
        });
      }
    });

    return results;
  }

  useAccrual(employeeId, leaveType, amount, description = '') {
    if (!this.employeeAccruals.has(employeeId)) {
      throw new Error(`Employee ${employeeId} not initialized`);
    }

    const employeeMap = this.employeeAccruals.get(employeeId);

    if (!employeeMap.has(leaveType)) {
      throw new Error(`No accrual found for ${leaveType}`);
    }

    const accrual = employeeMap.get(leaveType);

    // Check pending accruals first (process them)
    if (accrual.pendingAccrual > 0) {
      // Pending accruals become available
    }

    accrual.useAccrual(amount);

    this._addTransaction({
      employeeId,
      leaveType,
      amount: -amount,
      balanceAfter: accrual.currentBalance,
      description: description || `Used ${amount} days`,
      isAutomatic: false
    });

    return {
      success: true,
      amountUsed: amount,
      newBalance: accrual.currentBalance,
      availableBalance: accrual.getAvailableBalance()
    };
  }

  getAccrualBalance(employeeId, leaveType = null) {
    if (!this.employeeAccruals.has(employeeId)) {
      return null;
    }

    const employeeMap = this.employeeAccruals.get(employeeId);

    if (leaveType) {
      return employeeMap.get(leaveType);
    }

    return Array.from(employeeMap.values());
  }

  getTransactionHistory(employeeId = null, leaveType = null) {
    let history = this.transactionHistory;

    if (employeeId) {
      history = history.filter(t => t.employeeId === employeeId);
    }

    if (leaveType) {
      history = history.filter(t => t.leaveType === leaveType);
    }

    return history;
  }

  _addTransaction(transaction) {
    const entry = new AccrualEntry({
      ...transaction,
      id: crypto.randomUUID(),
      transactionDate: new Date()
    });

    this.transactionHistory.push(entry);
    return entry;
  }

  getAccrualSummary(employeeId) {
    if (!this.employeeAccruals.has(employeeId)) {
      return null;
    }

    const employeeMap = this.employeeAccruals.get(employeeId);
    const summary = {};

    employeeMap.forEach((accrual, leaveType) => {
      summary[leaveType] = {
        currentBalance: accrual.currentBalance,
        availableBalance: accrual.getAvailableBalance(),
        carryoverBalance: accrual.carryoverBalance,
        totalAccrued: accrual.totalAccrued,
        totalUsed: accrual.totalUsed,
        lastAccrualDate: accrual.lastAccrualDate
      };
    });

    return summary;
  }

  projectAccrual(employeeId, months, leaveType = null) {
    if (!this.employeeAccruals.has(employeeId)) {
      return null;
    }

    const employeeMap = this.employeeAccruals.get(employeeId);
    const projections = {};

    const processProjection = (accrual, policy, months) => {
      let projectedBalance = accrual.currentBalance;
      const monthlyAccrual = policy.accrualPeriod === 'monthly' ? policy.accrualRate : 0;

      for (let i = 1; i <= months; i++) {
        const newAccrual = this.calculateAccrualForPeriod(policy, projectedBalance);
        projectedBalance += newAccrual;
      }

      return projectedBalance;
    };

    employeeMap.forEach((accrual, lt) => {
      if (leaveType && leaveType !== lt) return;

      const policy = this.policies.get(lt);
      if (policy && policy.accrualPeriod === 'monthly') {
        projections[lt] = {
          currentBalance: accrual.currentBalance,
          projectedBalance: processProjection(accrual, policy, months),
          monthlyAccrual: policy.accrualRate,
          months
        };
      }
    });

    return projections;
  }

  expireCarryover(employeeId, leaveType, amount) {
    if (!this.employeeAccruals.has(employeeId)) {
      throw new Error(`Employee ${employeeId} not initialized`);
    }

    const employeeMap = this.employeeAccruals.get(employeeId);

    if (!employeeMap.has(leaveType)) {
      throw new Error(`No accrual found for ${leaveType}`);
    }

    const accrual = employeeMap.get(leaveType);
    const expireAmount = Math.min(amount, accrual.carryoverBalance);

    accrual.carryoverBalance -= expireAmount;
    accrual.currentBalance -= expireAmount;

    this._addTransaction({
      employeeId,
      leaveType,
      amount: -expireAmount,
      balanceAfter: accrual.currentBalance,
      description: `Expired ${expireAmount} days of carryover`,
      isAutomatic: true
    });

    return {
      success: true,
      expiredAmount: expireAmount,
      newBalance: accrual.currentBalance
    };
  }
}

// Demo function
function runDemo() {
  console.log('=== Agent Accrual Demo\n');

  const manager = new AccrualManager();

  // 1. List policies
  console.log('1. Accrual Policies:');
  manager.listPolicies().forEach(policy => {
    console.log(`   ${policy.toString()}`);
  });

  // 2. Initialize employee
  console.log('\n2. Initializing Employee emp-001 (John Smith):');
  manager.initializeEmployee('emp-001');
  console.log('   Employee initialized with default accrual types');

  // 3. Process carryover
  console.log('\n3. Processing Carryover from Previous Year:');
  manager.processCarryover('emp-001', {
    annual: 3,
    vacation: 5
  });
  console.log('   Processed: annual=3 days, vacation=5 days');

  // 4. Get initial balance
  console.log('\n4. Initial Accrual Balances (emp-001):');
  const initialBalances = manager.getAccrualBalance('emp-001');
  initialBalances.forEach(accrual => {
    console.log(`   ${accrual.toString()}`);
  });

  // 5. Process monthly accrual
  console.log('\n5. Processing Monthly Accrual (January 2026):');
  const janAccruals = manager.processMonthlyAccrual('emp-001', new Date('2026-01-15'));
  janAccruals.forEach(accrual => {
    console.log(`   ${accrual.leaveType}: +${accrual.amount.toFixed(2)} days, balance: ${accrual.newBalance.toFixed(2)}`);
  });

  // 6. Process another month
  console.log('\n6. Processing Monthly Accrual (February 2026):');
  const febAccruals = manager.processMonthlyAccrual('emp-001', new Date('2026-02-15'));
  febAccruals.forEach(accrual => {
    console.log(`   ${accrual.leaveType}: +${accrual.amount.toFixed(2)} days, balance: ${accrual.newBalance.toFixed(2)}`);
  });

  // 7. Use some accrual
  console.log('\n7. Using Accrual (Annual Leave):');
  const usage = manager.useAccrual('emp-001', 'annual', 2, 'Vacation');
  console.log(`   Used: ${usage.amountUsed} days`);
  console.log(`   New Balance: ${usage.newBalance.toFixed(2)}`);
  console.log(`   Available: ${usage.availableBalance.toFixed(2)}`);

  // 8. Get summary
  console.log('\n8. Accrual Summary (emp-001):');
  const summary = manager.getAccrualSummary('emp-001');
  Object.entries(summary).forEach(([leaveType, data]) => {
    console.log(`   ${leaveType}:`);
    console.log(`      Current: ${data.currentBalance.toFixed(2)}, Available: ${data.availableBalance.toFixed(2)}`);
    console.log(`      Accrued: ${data.totalAccrued.toFixed(2)}, Used: ${data.totalUsed.toFixed(2)}`);
  });

  // 9. Project future accrual
  console.log('\n9. Projecting Accrual (6 months ahead):');
  const projections = manager.projectAccrual('emp-001', 6);
  Object.entries(projections).forEach(([leaveType, data]) => {
    console.log(`   ${leaveType}: ${data.currentBalance.toFixed(2)} → ${data.projectedBalance.toFixed(2)}`);
    console.log(`      Monthly rate: ${data.monthlyAccrual.toFixed(2)} days`);
  });

  // 10. Transaction history
  console.log('\n10. Transaction History (emp-001, annual):');
  const history = manager.getTransactionHistory('emp-001', 'annual');
  history.slice(-5).forEach(t => {
    const date = new Date(t.transactionDate).toISOString().split('T')[0];
    console.log(`    ${date}: ${t.amount > 0 ? '+' : ''}${t.amount.toFixed(2)} - ${t.description}`);
  });

  // 11. Expire carryover
  console.log('\n11. Expiring Carryover (test):');
  const expireResult = manager.expireCarryover('emp-001', 'vacation', 2);
  console.log(`   Expired: ${expireResult.expiredAmount.toFixed(2)} days`);
  console.log(`   New Balance: ${expireResult.newBalance.toFixed(2)}`);

  // 12. Statistics
  console.log('\n12. Statistics:');
  const allHistory = manager.getTransactionHistory();
  const empHistory = manager.getTransactionHistory('emp-001');
  console.log(`    Total Transactions: ${allHistory.length}`);
  console.log(`    Employee Transactions: ${empHistory.length}`);

  console.log('\n=== Demo Complete ===');
}

// CLI handler
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const manager = new AccrualManager();

switch (command) {
  case 'demo':
    runDemo();
    break;

  case 'list':
    console.log('Accrual Policies:');
    manager.listPolicies().forEach(policy => {
      console.log(`  ${policy.toString()}`);
    });
    break;

  case 'balance':
    const empId = args[1] || 'emp-001';
    manager.initializeEmployee(empId);
    console.log(`Accrual Balances for ${empId}:`);
    manager.getAccrualBalance(empId).forEach(accrual => {
      console.log(`  ${accrual.toString()}`);
    });
    break;

  default:
    console.log('Usage: node agent-accrual.js [command]');
    console.log('Commands:');
    console.log('  demo    - Run demonstration');
    console.log('  list    - List all accrual policies');
    console.log('  balance - Check employee accrual balances');
}
