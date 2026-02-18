/**
 * Agent Stock Comp Module
 *
 * Provides stock compensation management.
 * Usage: node agent-stock-comp.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show stock comp stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

/**
 * Stock Comp Type
 */
const StockCompType = {
  ISO: 'iso', // Incentive Stock Options
  NSO: 'nso', // Non-Qualified Stock Options
  RSU: 'rsu', // Restricted Stock Units
  ESPP: 'espp', // Employee Stock Purchase Plan
  SAR: 'sar' // Stock Appreciation Rights
};

/**
 * Vesting Type
 */
const VestingType = {
  CLIFF: 'cliff',
  LINEAR: 'linear',
  PERFORMANCE: 'performance',
  CUSTOM: 'custom'
};

/**
 * Vesting Schedule
 */
class VestingSchedule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.type = config.type || VestingType.LINEAR;
    this.totalShares = config.totalShares;
    this.vestedShares = 0;
    this.startDate = config.startDate || Date.now();
    this.cliffMonths = config.cliffMonths || 12;
    this.vestingMonths = config.vestingMonths || 48; // Total vesting period
    this.vestingFrequency = config.vestingFrequency || 'monthly'; // monthly, quarterly, annually
    this.performanceMetrics = config.performanceMetrics || null;
  }

  calculateVestedShares(currentDate = Date.now()) {
    const monthsElapsed = this._monthsBetween(this.startDate, currentDate);

    if (monthsElapsed < this.cliffMonths) {
      return 0;
    }

    switch (this.type) {
      case VestingType.CLIFF:
        if (monthsElapsed >= this.vestingMonths) {
          return this.totalShares;
        }
        return 0;

      case VestingType.LINEAR:
        const vestedMonths = Math.min(monthsElapsed, this.vestingMonths);
        const vestingRatio = vestedMonths / this.vestingMonths;
        return Math.floor(this.totalShares * vestingRatio);

      case VestingType.PERFORMANCE:
        // Would require performance metrics
        return this.vestedShares;

      default:
        return 0;
    }
  }

  getVestingEvents() {
    const events = [];
    const monthsPerVest = this.vestingFrequency === 'monthly' ? 1 :
                         this.vestingFrequency === 'quarterly' ? 3 : 12;

    let currentMonth = this.cliffMonths;
    while (currentMonth <= this.vestingMonths) {
      const vestDate = new Date(this.startDate);
      vestDate.setMonth(vestDate.getMonth() + currentMonth);

      const sharesAtThisPoint = this.type === VestingType.CLIFF && currentMonth < this.vestingMonths
        ? 0
        : Math.floor(this.totalShares * (currentMonth / this.vestingMonths));

      events.push({
        date: vestDate.getTime(),
        month: currentMonth,
        sharesVested: sharesAtThisPoint - this.vestedShares
      });

      this.vestedShares = sharesAtThisPoint;
      currentMonth += monthsPerVest;
    }

    return events;
  }

  _monthsBetween(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return (end.getFullYear() - start.getFullYear()) * 12 +
           (end.getMonth() - start.getMonth());
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      totalShares: this.totalShares,
      vestedShares: this.vestedShares,
      startDate: this.startDate,
      cliffMonths: this.cliffMonths,
      vestingMonths: this.vestingMonths
    };
  }
}

/**
 * Stock Grant
 */
class StockGrant {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.grantDate = config.grantDate || Date.now();
    this.compType = config.compType;
    this.sharesGranted = config.sharesGranted;
    this.strikePrice = config.strikePrice || 0; // For options
    this.fairMarketValue = config.fairMarketValue;
    this.vestingSchedule = config.vestingSchedule;
    this.expirationDate = config.expirationDate ||
      (config.grantDate ? config.grantDate + 10 * 365 * 24 * 60 * 60 * 1000 : null);
    this.status = config.status || 'active';
  }

  getVestedShares(currentDate = Date.now()) {
    if (!this.vestingSchedule) return this.sharesGranted;
    return this.vestingSchedule.calculateVestedShares(currentDate);
  }

  getUnvestedShares(currentDate = Date.now()) {
    return this.sharesGranted - this.getVestedShares(currentDate);
  }

  calculateValue(currentPrice) {
    const vestedShares = this.getVestedShares();

    switch (this.compType) {
      case StockCompType.ISO:
      case StockCompType.NSO:
        // Value = (Current Price - Strike Price) * Shares
        const intrinsicValue = Math.max(0, currentPrice - this.strikePrice) * vestedShares;
        return intrinsicValue;

      case StockCompType.RSU:
        // Value = Current Price * Shares
        return currentPrice * vestedShares;

      case StockCompType.ESPP:
        // Value = (Current Price - Purchase Price) * Shares
        const discount = this.strikePrice * 0.15; // Assume 15% discount
        return (currentPrice - discount) * vestedShares;

      case StockCompType.SAR:
        return (currentPrice - this.strikePrice) * vestedShares;

      default:
        return 0;
    }
  }

  toJSON() {
    return {
      id: this.id,
      employeeId: this.employeeId,
      compType: this.compType,
      sharesGranted: this.sharesGranted,
      strikePrice: this.strikePrice,
      fairMarketValue: this.fairMarketValue,
      status: this.status,
      grantDate: this.grantDate,
      expirationDate: this.expirationDate
    };
  }
}

/**
 * Stock Transaction
 */
class StockTransaction {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.grantId = config.grantId;
    this.employeeId = config.employeeId;
    this.transactionType = config.transactionType; // exercise, vest, sell, expire
    this.shares = config.shares;
    this.price = config.price;
    this.totalValue = config.totalValue;
    this.proceeds = config.proceeds || 0;
    this.taxWithheld = config.taxWithheld || 0;
    this.date = config.date || Date.now();
    this.status = config.status || 'completed';
  }

  toJSON() {
    return {
      id: this.id,
      grantId: this.grantId,
      employeeId: this.employeeId,
      transactionType: this.transactionType,
      shares: this.shares,
      price: this.price,
      totalValue: this.totalValue,
      proceeds: this.proceeds,
      taxWithheld: this.taxWithheld,
      date: this.date
    };
  }
}

/**
 * Stock Comp Manager
 */
class StockCompManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.grants = new Map();
    this.transactions = new Map();
    this.employees = new Map();
    this.stats = {
      totalGrants: 0,
      totalSharesGranted: 0,
      totalSharesVested: 0,
      totalValueExercised: 0,
      transactionsProcessed: 0
    };

    this._init();
  }

  _init() {
    this._createSampleGrants();
  }

  _createSampleGrants() {
    // ISO Grant - 24 months ago, should have vested some shares after 12 month cliff
    const isoGrantDate = Date.now() - 24 * 30 * 24 * 60 * 60 * 1000;
    const isoVesting = new VestingSchedule({
      type: VestingType.LINEAR,
      totalShares: 10000,
      cliffMonths: 12,
      vestingMonths: 48,
      startDate: isoGrantDate
    });

    const isoGrant = new StockGrant({
      employeeId: 'EMP001',
      employeeName: 'John Smith',
      compType: StockCompType.ISO,
      sharesGranted: 10000,
      strikePrice: 25,
      fairMarketValue: 30,
      vestingSchedule: isoVesting,
      grantDate: isoGrantDate
    });
    this.grants.set(isoGrant.id, isoGrant);

    // RSU Grant - 24 months ago
    const rsuGrantDate = Date.now() - 24 * 30 * 24 * 60 * 60 * 1000;
    const rsuVesting = new VestingSchedule({
      type: VestingType.LINEAR,
      totalShares: 5000,
      cliffMonths: 12,
      vestingMonths: 36,
      startDate: rsuGrantDate
    });

    const rsuGrant = new StockGrant({
      employeeId: 'EMP002',
      employeeName: 'Jane Doe',
      compType: StockCompType.RSU,
      sharesGranted: 5000,
      fairMarketValue: 40,
      vestingSchedule: rsuVesting,
      grantDate: rsuGrantDate
    });
    this.grants.set(rsuGrant.id, rsuGrant);

    // ESPP Grant - 24 months ago
    const esppGrantDate = Date.now() - 24 * 30 * 24 * 60 * 60 * 1000;
    const esppGrant = new StockGrant({
      employeeId: 'EMP003',
      employeeName: 'Bob Johnson',
      compType: StockCompType.ESPP,
      sharesGranted: 1000,
      strikePrice: 35,
      fairMarketValue: 35,
      grantDate: esppGrantDate,
      vestingSchedule: new VestingSchedule({
        type: VestingType.LINEAR,
        totalShares: 1000,
        cliffMonths: 0,
        vestingMonths: 24,
        startDate: esppGrantDate
      })
    });
    this.grants.set(esppGrant.id, esppGrant);
  }

  /**
   * Get employee grants
   */
  getEmployeeGrants(employeeId) {
    const results = [];
    for (const grant of this.grants.values()) {
      if (grant.employeeId === employeeId) {
        results.push(grant);
      }
    }
    return results;
  }

  /**
   * Calculate total value for employee
   */
  calculateEmployeeValue(employeeId, currentPrice) {
    const grants = this.getEmployeeGrants(employeeId);
    let totalVested = 0;
    let totalUnvested = 0;
    let totalValue = 0;

    for (const grant of grants) {
      if (grant.status !== 'active') continue;

      const vested = grant.getVestedShares();
      const unvested = grant.getUnvestedShares();

      totalVested += vested;
      totalUnvested += unvested;
      totalValue += grant.calculateValue(currentPrice);
    }

    return {
      employeeId,
      totalGrants: grants.length,
      vestedShares: totalVested,
      unvestedShares: totalUnvested,
      totalShares: totalVested + totalUnvested,
      totalValue: totalValue
    };
  }

  /**
   * Exercise options
   */
  exerciseOptions(grantId, shares, currentPrice, taxRate = 0.30) {
    const grant = this.grants.get(grantId);

    if (!grant) {
      return { success: false, reason: 'Grant not found' };
    }

    if (grant.compType !== StockCompType.ISO && grant.compType !== StockCompType.NSO) {
      return { success: false, reason: 'Grant is not an option type' };
    }

    const vestedShares = grant.getVestedShares();
    if (shares > vestedShares) {
      return { success: false, reason: 'Cannot exercise more than vested shares' };
    }

    const exerciseCost = shares * grant.strikePrice;
    const marketValue = shares * currentPrice;
    const spread = marketValue - exerciseCost;
    const taxWithheld = spread * taxRate;
    const proceeds = marketValue - taxWithheld;

    const transaction = new StockTransaction({
      grantId: grantId,
      employeeId: grant.employeeId,
      transactionType: 'exercise',
      shares: shares,
      price: currentPrice,
      totalValue: marketValue,
      proceeds: proceeds,
      taxWithheld: taxWithheld
    });

    this.transactions.set(transaction.id, transaction);

    this.stats.totalSharesVested += shares;
    this.stats.totalValueExercised += marketValue;
    this.stats.transactionsProcessed++;

    return {
      success: true,
      transactionId: transaction.id,
      shares: shares,
      strikePrice: grant.strikePrice,
      exerciseCost: exerciseCost,
      marketValue: marketValue,
      spread: spread,
      taxWithheld: taxWithheld,
      netProceeds: proceeds
    };
  }

  /**
   * Vest RSU
   */
  vestRSU(grantId, shares, currentPrice, taxRate = 0.25) {
    const grant = this.grants.get(grantId);

    if (!grant) {
      return { success: false, reason: 'Grant not found' };
    }

    if (grant.compType !== StockCompType.RSU) {
      return { success: false, reason: 'Grant is not an RSU type' };
    }

    const vestedShares = grant.getVestedShares();
    if (shares > vestedShares) {
      return { success: false, reason: 'Cannot vest more than vested shares' };
    }

    const totalValue = shares * currentPrice;
    const taxWithheld = totalValue * taxRate;
    const proceeds = totalValue - taxWithheld;

    const transaction = new StockTransaction({
      grantId: grantId,
      employeeId: grant.employeeId,
      transactionType: 'vest',
      shares: shares,
      price: currentPrice,
      totalValue: totalValue,
      proceeds: proceeds,
      taxWithheld: taxWithheld
    });

    this.transactions.set(transaction.id, transaction);

    this.stats.totalSharesVested += shares;
    this.stats.transactionsProcessed++;

    return {
      success: true,
      transactionId: transaction.id,
      shares: shares,
      price: currentPrice,
      totalValue: totalValue,
      taxWithheld: taxWithheld,
      netProceeds: proceeds
    };
  }

  /**
   * Sell shares
   */
  sellShares(grantId, shares, sellPrice) {
    const grant = this.grants.get(grantId);

    if (!grant) {
      return { success: false, reason: 'Grant not found' };
    }

    const vestedShares = grant.getVestedShares();
    if (shares > vestedShares) {
      return { success: false, reason: 'Cannot sell more than vested shares' };
    }

    const totalValue = shares * sellPrice;

    const transaction = new StockTransaction({
      grantId: grantId,
      employeeId: grant.employeeId,
      transactionType: 'sell',
      shares: shares,
      price: sellPrice,
      totalValue: totalValue,
      proceeds: totalValue
    });

    this.transactions.set(transaction.id, transaction);

    this.stats.transactionsProcessed++;

    return {
      success: true,
      transactionId: transaction.id,
      shares: shares,
      price: sellPrice,
      proceeds: totalValue
    };
  }

  /**
   * Get grant by id
   */
  getGrant(grantId) {
    return this.grants.get(grantId);
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
   * Get vesting schedule
   */
  getVestingSchedule(grantId) {
    const grant = this.grants.get(grantId);
    if (!grant || !grant.vestingSchedule) return null;
    return grant.vestingSchedule.getVestingEvents();
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      totalGrants: this.grants.size,
      totalEmployees: new Set(Array.from(this.grants.values()).map(g => g.employeeId)).size,
      totalTransactions: this.transactions.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Stock Comp Demo\n');

  const manager = new StockCompManager();

  // Show grants
  console.log('1. Stock Grants:');
  for (const grant of manager.grants.values()) {
    console.log(`   ${grant.employeeName} (${grant.employeeId}):`);
    console.log(`      Type: ${grant.compType.toUpperCase()}`);
    console.log(`      Shares: ${grant.sharesGranted}`);
    console.log(`      Strike Price: $${grant.strikePrice}`);
    console.log(`      FMV: $${grant.fairMarketValue}`);
  }

  // Calculate employee value
  console.log('\n2. Employee Stock Value (at $50/share):');
  const empValue = manager.calculateEmployeeValue('EMP001', 50);
  console.log(`   Employee: ${empValue.employeeId}`);
  console.log(`   Total Grants: ${empValue.totalGrants}`);
  console.log(`   Vested Shares: ${empValue.vestedShares}`);
  console.log(`   Unvested Shares: ${empValue.unvestedShares}`);
  console.log(`   Total Value: $${empValue.totalValue.toFixed(2)}`);

  // RSU value
  console.log('\n3. Employee Stock Value (EMP002 - RSU at $50/share):');
  const rsuValue = manager.calculateEmployeeValue('EMP002', 50);
  console.log(`   Vested Shares: ${rsuValue.vestedShares}`);
  console.log(`   Total Value: $${rsuValue.totalValue.toFixed(2)}`);

  // Exercise options
  console.log('\n4. Exercising ISO Options (EMP001, 500 shares at $50):');
  const exerciseResult = manager.exerciseOptions(
    Array.from(manager.grants.values())[0].id,
    500,
    50
  );
  console.log(`   Success: ${exerciseResult.success}`);
  console.log(`   Shares: ${exerciseResult.shares}`);
  console.log(`   Exercise Cost: $${exerciseResult.exerciseCost.toFixed(2)}`);
  console.log(`   Market Value: $${exerciseResult.marketValue.toFixed(2)}`);
  console.log(`   Spread: $${exerciseResult.spread.toFixed(2)}`);
  console.log(`   Tax Withheld: $${exerciseResult.taxWithheld.toFixed(2)}`);
  console.log(`   Net Proceeds: $${exerciseResult.netProceeds.toFixed(2)}`);

  // Find RSU grant
  let rsuGrantId = null;
  for (const [id, grant] of manager.grants.entries()) {
    if (grant.compType === StockCompType.RSU) {
      rsuGrantId = id;
      break;
    }
  }

  // Vest RSU
  console.log('\n5. Vesting RSU (EMP002, 200 shares at $50):');
  const vestResult = manager.vestRSU(rsuGrantId, 200, 50);
  console.log(`   Success: ${vestResult.success}`);
  console.log(`   Shares: ${vestResult.shares}`);
  console.log(`   Total Value: $${vestResult.totalValue.toFixed(2)}`);
  console.log(`   Tax Withheld: $${vestResult.taxWithheld.toFixed(2)}`);
  console.log(`   Net Proceeds: $${vestResult.netProceeds.toFixed(2)}`);

  // Sell shares
  console.log('\n6. Selling Shares (500 shares at $55):');
  const sellResult = manager.sellShares(
    Array.from(manager.grants.values())[0].id,
    500,
    55
  );
  console.log(`   Success: ${sellResult.success}`);
  console.log(`   Shares: ${sellResult.shares}`);
  console.log(`   Proceeds: $${sellResult.proceeds.toFixed(2)}`);

  // Get employee transactions
  console.log('\n7. Employee Transactions (EMP001):');
  const txns = manager.getEmployeeTransactions('EMP001');
  console.log(`   Total: ${txns.length}`);
  for (const txn of txns) {
    console.log(`   - ${txn.transactionType}: ${txn.shares} shares @ $${txn.price}`);
  }

  // Get vesting schedule
  console.log('\n8. Vesting Schedule (ISO Grant):');
  const schedule = manager.getVestingSchedule(Array.from(manager.grants.values())[0].id);
  if (schedule) {
    const nextVesting = schedule.find(e => e.sharesVested > 0);
    if (nextVesting) {
      console.log(`   Next Vest: ${new Date(nextVesting.date).toLocaleDateString()}`);
      console.log(`   Shares: ${nextVesting.sharesVested}`);
    }
  }

  // Stats
  console.log('\n9. Statistics:');
  const stats = manager.getStats();
  console.log(`   Total Grants: ${stats.totalGrants}`);
  console.log(`   Total Shares Vested: ${stats.totalSharesVested}`);
  console.log(`   Total Value Exercised: $${stats.totalValueExercised.toFixed(2)}`);
  console.log(`   Transactions Processed: ${stats.transactionsProcessed}`);
  console.log(`   Total Employees: ${stats.totalEmployees}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new StockCompManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Stock Comp Module');
  console.log('Usage: node agent-stock-comp.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
