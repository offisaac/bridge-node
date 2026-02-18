/**
 * Agent RSU Module
 *
 * Provides RSU (Restricted Stock Unit) vesting management.
 * Usage: node agent-rsu.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show RSU stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

/**
 * RSU Status
 */
const RSUStatus = {
  PENDING: 'pending',
  VESTED: 'vested',
  RELEASED: 'released',
  CANCELLED: 'cancelled',
  FORFEITED: 'forfeited'
};

/**
 * Vesting Schedule
 */
class RSUVestingSchedule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.totalShares = config.totalShares;
    this.vestedShares = 0;
    this.startDate = config.startDate || Date.now();
    this.cliffMonths = config.cliffMonths || 12;
    this.vestingMonths = config.vestingMonths || 48;
    this.vestingFrequency = config.vestingFrequency || 'quarterly'; // monthly, quarterly
    this.performanceBased = config.performanceBased || false;
  }

  calculateVestedShares(currentDate = Date.now()) {
    const monthsElapsed = this._monthsBetween(this.startDate, currentDate);

    if (monthsElapsed < this.cliffMonths) {
      return 0;
    }

    if (this.performanceBased) {
      // Performance-based has different rules
      return this.vestedShares;
    }

    const vestedMonths = Math.min(monthsElapsed, this.vestingMonths);
    const vestingRatio = vestedMonths / this.vestingMonths;
    return Math.floor(this.totalShares * vestingRatio);
  }

  getNextVestingDate(currentDate = Date.now()) {
    const monthsElapsed = this._monthsBetween(this.startDate, currentDate);

    if (monthsElapsed < this.cliffMonths) {
      const cliffDate = new Date(this.startDate);
      cliffDate.setMonth(cliffDate.getMonth() + this.cliffMonths);
      return cliffDate;
    }

    const monthsPerVest = this.vestingFrequency === 'monthly' ? 1 : 3;
    const nextMonth = Math.ceil(monthsElapsed / monthsPerVest) * monthsPerVest;

    if (nextMonth > this.vestingMonths) return null;

    const nextDate = new Date(this.startDate);
    nextDate.setMonth(nextDate.getMonth() + nextMonth);
    return nextDate;
  }

  getVestingEvents() {
    const events = [];
    const monthsPerVest = this.vestingFrequency === 'monthly' ? 1 : 3;

    let vestedSoFar = 0;
    let currentMonth = this.cliffMonths;

    while (currentMonth <= this.vestingMonths) {
      const vestDate = new Date(this.startDate);
      vestDate.setMonth(vestDate.getMonth() + currentMonth);

      const totalVestedAtPoint = Math.floor(this.totalShares * (currentMonth / this.vestingMonths));
      const sharesVestingNow = totalVestedAtPoint - vestedSoFar;

      events.push({
        date: vestDate.getTime(),
        month: currentMonth,
        sharesVested: sharesVestingNow,
        totalVested: totalVestedAtPoint
      });

      vestedSoFar = totalVestedAtPoint;
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
}

/**
 * RSU Grant
 */
class RSUGrant {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.grantDate = config.grantDate || Date.now();
    this.sharesGranted = config.sharesGranted;
    this.fairMarketValue = config.fairMarketValue;
    this.vestingSchedule = config.vestingSchedule;
    this.status = RSUStatus.PENDING;
    this.taxRate = config.taxRate || 0.25;
    this.releaseType = config.releaseType || 'auto'; // auto, manual
  }

  getVestedShares(currentDate = Date.now()) {
    if (!this.vestingSchedule) return 0;
    return this.vestingSchedule.calculateVestedShares(currentDate);
  }

  getUnvestedShares(currentDate = Date.now()) {
    return this.sharesGranted - this.getVestedShares(currentDate);
  }

  getReleasedShares() {
    if (!this.vestingSchedule) return 0;
    return this.vestingSchedule.vestedShares;
  }

  calculateValue(currentPrice) {
    const vestedShares = this.getVestedShares();
    return vestedShares * currentPrice;
  }

  calculateTaxWithholding(releaseShares, currentPrice) {
    return releaseShares * currentPrice * this.taxRate;
  }
}

/**
 * RSU Release
 */
class RSURelease {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.grantId = config.grantId;
    this.employeeId = config.employeeId;
    this.shares = config.shares;
    this.price = config.price;
    this.grossValue = config.grossValue;
    this.taxWithheld = config.taxWithheld;
    this.netValue = config.netValue;
    this.releaseDate = config.releaseDate || Date.now();
    this.status = config.status || 'completed';
    this.taxYear = new Date().getFullYear();
  }

  toJSON() {
    return {
      id: this.id,
      grantId: this.grantId,
      employeeId: this.employeeId,
      shares: this.shares,
      price: this.price,
      grossValue: this.grossValue,
      taxWithheld: this.taxWithheld,
      netValue: this.netValue,
      releaseDate: this.releaseDate,
      status: this.status
    };
  }
}

/**
 * RSU Manager
 */
class RSUManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.grants = new Map();
    this.releases = new Map();
    this.stats = {
      totalGrants: 0,
      totalSharesGranted: 0,
      totalSharesVested: 0,
      totalSharesReleased: 0,
      totalTaxWithheld: 0,
      releasesProcessed: 0
    };

    this._init();
  }

  _init() {
    this._createSampleGrants();
  }

  _createSampleGrants() {
    // Sample RSU Grant 1 - 24 months ago
    const grant1Date = Date.now() - 24 * 30 * 24 * 60 * 60 * 1000;
    const vesting1 = new RSUVestingSchedule({
      totalShares: 10000,
      cliffMonths: 12,
      vestingMonths: 48,
      vestingFrequency: 'quarterly',
      startDate: grant1Date
    });

    const grant1 = new RSUGrant({
      employeeId: 'EMP001',
      employeeName: 'John Smith',
      sharesGranted: 10000,
      fairMarketValue: 30,
      vestingSchedule: vesting1,
      grantDate: grant1Date,
      taxRate: 0.25
    });
    this.grants.set(grant1.id, grant1);

    // Sample RSU Grant 2 - 18 months ago
    const grant2Date = Date.now() - 18 * 30 * 24 * 60 * 60 * 1000;
    const vesting2 = new RSUVestingSchedule({
      totalShares: 5000,
      cliffMonths: 12,
      vestingMonths: 36,
      vestingFrequency: 'monthly',
      startDate: grant2Date
    });

    const grant2 = new RSUGrant({
      employeeId: 'EMP002',
      employeeName: 'Jane Doe',
      sharesGranted: 5000,
      fairMarketValue: 40,
      vestingSchedule: vesting2,
      grantDate: grant2Date,
      taxRate: 0.30
    });
    this.grants.set(grant2.id, grant2);

    // Sample RSU Grant 3 - 6 months ago (before cliff)
    const grant3Date = Date.now() - 6 * 30 * 24 * 60 * 60 * 1000;
    const vesting3 = new RSUVestingSchedule({
      totalShares: 3000,
      cliffMonths: 12,
      vestingMonths: 48,
      vestingFrequency: 'quarterly',
      startDate: grant3Date
    });

    const grant3 = new RSUGrant({
      employeeId: 'EMP003',
      employeeName: 'Bob Johnson',
      sharesGranted: 3000,
      fairMarketValue: 50,
      vestingSchedule: vesting3,
      grantDate: grant3Date,
      taxRate: 0.22
    });
    this.grants.set(grant3.id, grant3);
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
   * Get grant by ID
   */
  getGrant(grantId) {
    return this.grants.get(grantId);
  }

  /**
   * Calculate employee RSU value
   */
  calculateEmployeeValue(employeeId, currentPrice) {
    const grants = this.getEmployeeGrants(employeeId);
    let totalGranted = 0;
    let totalVested = 0;
    let totalReleased = 0;
    let totalValue = 0;

    for (const grant of grants) {
      totalGranted += grant.sharesGranted;
      totalVested += grant.getVestedShares();
      totalReleased += grant.getReleasedShares();
      totalValue += grant.calculateValue(currentPrice);
    }

    return {
      employeeId,
      totalGrants: grants.length,
      sharesGranted: totalGranted,
      sharesVested: totalVested,
      sharesReleased: totalReleased,
      sharesUnvested: totalGranted - totalVested,
      totalValue: totalValue
    };
  }

  /**
   * Get vesting status
   */
  getVestingStatus(grantId, currentDate = Date.now()) {
    const grant = this.grants.get(grantId);
    if (!grant) return null;

    const vestedShares = grant.getVestedShares(currentDate);
    const unvestedShares = grant.getUnvestedShares(currentDate);
    const nextVestingDate = grant.vestingSchedule.getNextVestingDate(currentDate);

    return {
      grantId: grant.id,
      employeeId: grant.employeeId,
      sharesGranted: grant.sharesGranted,
      sharesVested: vestedShares,
      sharesUnvested: unvestedShares,
      vestingPercentage: Math.round((vestedShares / grant.sharesGranted) * 100),
      nextVestingDate: nextVestingDate ? nextVestingDate.getTime() : null,
      cliffPassed: grant.vestingSchedule._monthsBetween(grant.vestingSchedule.startDate, currentDate) >= grant.vestingSchedule.cliffMonths
    };
  }

  /**
   * Release RSU shares
   */
  releaseShares(grantId, shares, currentPrice) {
    const grant = this.grants.get(grantId);

    if (!grant) {
      return { success: false, reason: 'Grant not found' };
    }

    const vestedShares = grant.getVestedShares();
    const releasedShares = grant.getReleasedShares();
    const availableToRelease = vestedShares - releasedShares;

    if (shares > availableToRelease) {
      return { success: false, reason: `Cannot release more than vested shares. Available: ${availableToRelease}` };
    }

    const grossValue = shares * currentPrice;
    const taxWithheld = grant.calculateTaxWithholding(shares, currentPrice);
    const netValue = grossValue - taxWithheld;

    const release = new RSURelease({
      grantId: grantId,
      employeeId: grant.employeeId,
      shares: shares,
      price: currentPrice,
      grossValue: grossValue,
      taxWithheld: taxWithheld,
      netValue: netValue
    });

    this.releases.set(release.id, release);

    // Update grant vesting state
    grant.vestingSchedule.vestedShares += shares;

    // Update stats
    this.stats.totalSharesVested += shares;
    this.stats.totalSharesReleased += shares;
    this.stats.totalTaxWithheld += taxWithheld;
    this.stats.releasesProcessed++;

    return {
      success: true,
      releaseId: release.id,
      shares: shares,
      price: currentPrice,
      grossValue: grossValue,
      taxWithheld: taxWithheld,
      netValue: netValue,
      remainingVested: vestedShares - shares - releasedShares
    };
  }

  /**
   * Release all vested shares
   */
  releaseAllVested(grantId, currentPrice) {
    const grant = this.grants.get(grantId);

    if (!grant) {
      return { success: false, reason: 'Grant not found' };
    }

    const vestedShares = grant.getVestedShares();
    const releasedShares = grant.getReleasedShares();
    const availableToRelease = vestedShares - releasedShares;

    if (availableToRelease <= 0) {
      return { success: false, reason: 'No shares available to release' };
    }

    return this.releaseShares(grantId, availableToRelease, currentPrice);
  }

  /**
   * Get releases for employee
   */
  getEmployeeReleases(employeeId) {
    const results = [];
    for (const release of this.releases.values()) {
      if (release.employeeId === employeeId) {
        results.push(release);
      }
    }
    return results;
  }

  /**
   * Get all pending vestings
   */
  getPendingVestings() {
    const results = [];
    const now = Date.now();

    for (const grant of this.grants.values()) {
      const vested = grant.getVestedShares(now);
      const released = grant.getReleasedShares();
      const available = vested - released;

      if (available > 0) {
        results.push({
          grantId: grant.id,
          employeeId: grant.employeeId,
          employeeName: grant.employeeName,
          availableToRelease: available,
          currentValue: available * grant.fairMarketValue
        });
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
      totalReleases: this.releases.size,
      totalEmployees: new Set(Array.from(this.grants.values()).map(g => g.employeeId)).size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent RSU Demo\n');

  const manager = new RSUManager();

  // Show grants
  console.log('1. RSU Grants:');
  for (const grant of manager.grants.values()) {
    console.log(`   ${grant.employeeName} (${grant.employeeId}):`);
    console.log(`      Shares: ${grant.sharesGranted}`);
    console.log(`      FMV at Grant: $${grant.fairMarketValue}`);
    console.log(`      Tax Rate: ${(grant.taxRate * 100)}%`);
  }

  // Calculate employee value
  console.log('\n2. Employee RSU Value (at $50/share):');
  const empValue = manager.calculateEmployeeValue('EMP001', 50);
  console.log(`   Employee: ${empValue.employeeId}`);
  console.log(`   Shares Granted: ${empValue.sharesGranted}`);
  console.log(`   Shares Vested: ${empValue.sharesVested}`);
  console.log(`   Shares Released: ${empValue.sharesReleased}`);
  console.log(`   Total Value: $${empValue.totalValue.toFixed(2)}`);

  // Vesting status
  console.log('\n3. Vesting Status (EMP001):');
  const status1 = manager.getVestingStatus(Array.from(manager.grants.values())[0].id);
  console.log(`   Shares Vested: ${status1.sharesVested}`);
  console.log(`   Shares Unvested: ${status1.sharesUnvested}`);
  console.log(`   Vesting %: ${status1.vestingPercentage}%`);
  console.log(`   Cliff Passed: ${status1.cliffPassed}`);
  console.log(`   Next Vesting: ${status1.nextVestingDate ? new Date(status1.nextVestingDate).toLocaleDateString() : 'N/A'}`);

  // Vesting status for employee 3 (before cliff)
  let grant3Id = null;
  for (const [id, grant] of manager.grants.entries()) {
    if (grant.employeeId === 'EMP003') {
      grant3Id = id;
      break;
    }
  }
  console.log('\n4. Vesting Status (EMP003 - Before Cliff):');
  const status3 = manager.getVestingStatus(grant3Id);
  console.log(`   Shares Vested: ${status3.sharesVested}`);
  console.log(`   Cliff Passed: ${status3.cliffPassed}`);

  // Release shares
  console.log('\n5. Releasing RSU Shares (EMP001, 1000 shares at $50):');
  const releaseResult = manager.releaseShares(
    Array.from(manager.grants.values())[0].id,
    1000,
    50
  );
  console.log(`   Success: ${releaseResult.success}`);
  if (releaseResult.success) {
    console.log(`   Shares Released: ${releaseResult.shares}`);
    console.log(`   Gross Value: $${releaseResult.grossValue.toFixed(2)}`);
    console.log(`   Tax Withheld: $${releaseResult.taxWithheld.toFixed(2)}`);
    console.log(`   Net Value: $${releaseResult.netValue.toFixed(2)}`);
    console.log(`   Remaining Vested: ${releaseResult.remainingVested}`);
  }

  // Release all vested
  console.log('\n6. Releasing All Vested (EMP002):');
  let emp2GrantId = null;
  for (const [id, grant] of manager.grants.entries()) {
    if (grant.employeeId === 'EMP002') {
      emp2GrantId = id;
      break;
    }
  }
  const releaseAllResult = manager.releaseAllVested(emp2GrantId, 50);
  console.log(`   Success: ${releaseAllResult.success}`);
  if (releaseAllResult.success) {
    console.log(`   Shares Released: ${releaseAllResult.shares}`);
    console.log(`   Net Value: $${releaseAllResult.netValue.toFixed(2)}`);
  }

  // Pending vestings
  console.log('\n7. Pending RSU Releases:');
  const pending = manager.getPendingVestings();
  for (const p of pending) {
    console.log(`   ${p.employeeName}: ${p.availableToRelease} shares ($${p.currentValue.toFixed(2)})`);
  }

  // Employee releases
  console.log('\n8. Employee Releases (EMP001):');
  const releases = manager.getEmployeeReleases('EMP001');
  console.log(`   Total: ${releases.length}`);
  for (const r of releases) {
    console.log(`   - ${r.shares} shares @ $${r.price}, Net: $${r.netValue.toFixed(2)}`);
  }

  // Vesting schedule
  console.log('\n9. Vesting Schedule (EMP001):');
  const schedule = manager.getVestingSchedule(Array.from(manager.grants.values())[0].id);
  const upcoming = schedule.filter(e => e.sharesVested > 0 && e.date > Date.now()).slice(0, 3);
  console.log(`   Upcoming Vestings:`);
  for (const s of upcoming) {
    console.log(`   - ${new Date(s.date).toLocaleDateString()}: ${s.sharesVested} shares`);
  }

  // Stats
  console.log('\n10. Statistics:');
  const stats = manager.getStats();
  console.log(`    Total Grants: ${stats.totalGrants}`);
  console.log(`    Total Shares Granted: ${stats.totalSharesGranted}`);
  console.log(`    Total Shares Vested: ${stats.totalSharesVested}`);
  console.log(`    Total Shares Released: ${stats.totalSharesReleased}`);
  console.log(`    Total Tax Withheld: $${stats.totalTaxWithheld.toFixed(2)}`);
  console.log(`    Releases Processed: ${stats.releasesProcessed}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new RSUManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent RSU Module');
  console.log('Usage: node agent-rsu.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
