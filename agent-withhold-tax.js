/**
 * Agent Withhold Tax Module
 *
 * Provides withholding tax calculation and management.
 * Usage: node agent-withhold-tax.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show tax stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

/**
 * Tax Type
 */
const TaxType = {
  INCOME: 'income',
  WITHHOLDING: 'withholding',
  BACKUP_WITHHOLDING: 'backup_withholding',
  FOREIGN: 'foreign',
  STATE: 'state',
  LOCAL: 'local'
};

/**
 * Tax Status
 */
const TaxStatus = {
  PENDING: 'pending',
  WITHHELD: 'withheld',
  REMITTED: 'remitted',
  ADJUSTED: 'adjusted',
  EXEMPT: 'exempt'
};

/**
 * Withholding Rule
 */
class WithholdingRule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.country = config.country;
    this.taxType = config.taxType;
    this.rate = config.rate; // Percentage
    this.threshold = config.threshold || 0; // Income threshold
    this.exemptions = config.exemptions || [];
    this.effectiveDate = config.effectiveDate || Date.now();
    this.expirationDate = config.expirationDate || null;
  }

  isActive() {
    const now = Date.now();
    if (now < this.effectiveDate) return false;
    if (this.expirationDate && now > this.expirationDate) return false;
    return true;
  }

  calculateTaxableIncome(income, exemptions = []) {
    let taxable = income;
    for (const exemption of exemptions) {
      if (this.exemptions.includes(exemption.type)) {
        taxable -= exemption.amount;
      }
    }
    return Math.max(0, taxable);
  }

  calculateTax(income, exemptions = []) {
    if (!this.isActive()) return 0;
    if (income < this.threshold) return 0;

    const taxableIncome = this.calculateTaxableIncome(income, exemptions);
    return taxableIncome * (this.rate / 100);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      country: this.country,
      taxType: this.taxType,
      rate: this.rate,
      threshold: this.threshold,
      effectiveDate: this.effectiveDate,
      isActive: this.isActive()
    };
  }
}

/**
 * Tax Withholding
 */
class TaxWithholding {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.entityId = config.entityId;
    this.entityName = config.entityName;
    this.country = config.country;
    this.taxType = config.taxType;
    this.grossAmount = config.grossAmount;
    this.taxableAmount = config.taxableAmount;
    this.taxRate = config.taxRate;
    this.taxWithheld = config.taxWithheld;
    this.netAmount = config.netAmount;
    this.status = config.status || TaxStatus.PENDING;
    this.paymentDate = config.paymentDate || null;
    this.remittanceDate = config.remittanceDate || null;
    this.createdAt = Date.now();
    this.metadata = config.metadata || {};
  }

  remit() {
    this.status = TaxStatus.REMITTED;
    this.remittanceDate = Date.now();
  }

  adjust(newAmount) {
    this.taxWithheld = newAmount;
    this.netAmount = this.grossAmount - newAmount;
    this.status = TaxStatus.ADJUSTED;
  }

  toJSON() {
    return {
      id: this.id,
      entityId: this.entityId,
      entityName: this.entityName,
      country: this.country,
      taxType: this.taxType,
      grossAmount: this.grossAmount,
      taxableAmount: this.taxableAmount,
      taxRate: this.taxRate,
      taxWithheld: this.taxWithheld,
      netAmount: this.netAmount,
      status: this.status,
      paymentDate: this.paymentDate,
      remittanceDate: this.remittanceDate
    };
  }
}

/**
 * Withhold Tax Manager
 */
class WithholdTaxManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.rules = new Map();
    this.withholdings = new Map();
    this.entities = new Map();
    this.stats = {
      totalWithholdings: 0,
      totalTaxCollected: 0,
      totalTaxRemitted: 0,
      totalTaxPending: 0,
      withholdingsFailed: 0
    };

    this._init();
  }

  _init() {
    this._createSampleRules();
  }

  _createSampleRules() {
    // US Federal Income Tax
    this.rules.set('US-FED-01', new WithholdingRule({
      name: 'US Federal Income Tax',
      country: 'US',
      taxType: TaxType.INCOME,
      rate: 22,
      threshold: 600,
      exemptions: ['dependent', 'disability']
    }));

    // US Backup Withholding
    this.rules.set('US-BACKUP-01', new WithholdingRule({
      name: 'US Backup Withholding',
      country: 'US',
      taxType: TaxType.BACKUP_WITHHOLDING,
      rate: 24,
      threshold: 0
    }));

    // UK Income Tax
    this.rules.set('UK-INC-01', new WithholdingRule({
      name: 'UK Income Tax',
      country: 'GB',
      taxType: TaxType.INCOME,
      rate: 20,
      threshold: 12570, // Personal allowance
      exemptions: ['personal_allowance']
    }));

    // Canada Federal Tax
    this.rules.set('CA-FED-01', new WithholdingRule({
      name: 'Canada Federal Tax',
      country: 'CA',
      taxType: TaxType.INCOME,
      rate: 15,
      threshold: 0,
      exemptions: ['basic_exemption']
    }));

    // Germany Income Tax
    this.rules.set('DE-INC-01', new WithholdingRule({
      name: 'Germany Income Tax',
      country: 'DE',
      taxType: TaxType.INCOME,
      rate: 25,
      threshold: 0,
      exemptions: ['grundfreibetrag']
    }));

    // Australia Income Tax
    this.rules.set('AU-INC-01', new WithholdingRule({
      name: 'Australia Income Tax',
      country: 'AU',
      taxType: TaxType.INCOME,
      rate: 19,
      threshold: 18200,
      exemptions: ['tax_free_threshold']
    }));

    // Japan Income Tax
    this.rules.set('JP-INC-01', new WithholdingRule({
      name: 'Japan Income Tax',
      country: 'JP',
      taxType: TaxType.INCOME,
      rate: 10,
      threshold: 0
    }));
  }

  /**
   * Find applicable rule
   */
  findRule(country, taxType = TaxType.INCOME) {
    for (const rule of this.rules.values()) {
      if (rule.country === country && rule.taxType === taxType && rule.isActive()) {
        return rule;
      }
    }
    return null;
  }

  /**
   * Calculate withholding
   */
  calculateWithholding(entityId, entityName, country, amount, taxType = TaxType.INCOME, exemptions = []) {
    const rule = this.findRule(country, taxType);

    if (!rule) {
      return {
        success: false,
        reason: `No withholding rule found for ${country}/${taxType}`
      };
    }

    const taxableAmount = rule.calculateTaxableIncome(amount, exemptions);
    const taxWithheld = rule.calculateTax(amount, exemptions);
    const netAmount = amount - taxWithheld;

    return {
      success: true,
      rule: rule.name,
      grossAmount: amount,
      taxableAmount: taxableAmount,
      taxRate: rule.rate,
      taxWithheld: taxWithheld,
      netAmount: netAmount
    };
  }

  /**
   * Process withholding
   */
  processWithholding(entityId, entityName, country, amount, taxType = TaxType.INCOME, exemptions = []) {
    const calculation = this.calculateWithholding(entityId, entityName, country, amount, taxType, exemptions);

    if (!calculation.success) {
      this.stats.withholdingsFailed++;
      return calculation;
    }

    const withholding = new TaxWithholding({
      entityId: entityId,
      entityName: entityName,
      country: country,
      taxType: taxType,
      grossAmount: calculation.grossAmount,
      taxableAmount: calculation.taxableAmount,
      taxRate: calculation.taxRate,
      taxWithheld: calculation.taxWithheld,
      netAmount: calculation.netAmount,
      status: TaxStatus.WITHHELD,
      paymentDate: Date.now()
    });

    this.withholdings.set(withholding.id, withholding);

    // Track entity
    if (!this.entities.has(entityId)) {
      this.entities.set(entityId, {
        id: entityId,
        name: entityName,
        country: country,
        totalPaid: 0,
        totalWithheld: 0
      });
    }

    const entity = this.entities.get(entityId);
    entity.totalPaid += amount;
    entity.totalWithheld += calculation.taxWithheld;

    this.stats.totalWithholdings++;
    this.stats.totalTaxCollected += calculation.taxWithheld;
    this.stats.totalTaxPending += calculation.taxWithheld;

    return {
      success: true,
      withholdingId: withholding.id,
      ...calculation
    };
  }

  /**
   * Remit withholding
   */
  remittance(withholdingId) {
    const withholding = this.withholdings.get(withholdingId);

    if (!withholding) {
      return { success: false, reason: 'Withholding not found' };
    }

    if (withholding.status === TaxStatus.REMITTED) {
      return { success: false, reason: 'Already remitted' };
    }

    withholding.remit();

    this.stats.totalTaxPending -= withholding.taxWithheld;
    this.stats.totalTaxRemitted += withholding.taxWithheld;

    return {
      success: true,
      withholdingId: withholding.id,
      amountRemitted: withholding.taxWithheld,
      remittanceDate: withholding.remittanceDate
    };
  }

  /**
   * Adjust withholding
   */
  adjustWithholding(withholdingId, newAmount) {
    const withholding = this.withholdings.get(withholdingId);

    if (!withholding) {
      return { success: false, reason: 'Withholding not found' };
    }

    const difference = newAmount - withholding.taxWithheld;
    withholding.adjust(newAmount);

    // Update stats
    this.stats.totalTaxCollected += difference;
    if (withholding.status === TaxStatus.WITHHELD) {
      this.stats.totalTaxPending += difference;
    }

    return {
      success: true,
      withholdingId: withholding.id,
      oldAmount: withholding.taxWithheld - difference,
      newAmount: newAmount,
      netAmount: withholding.netAmount
    };
  }

  /**
   * Get entity withholdings
   */
  getEntityWithholdings(entityId) {
    const results = [];
    for (const w of this.withholdings.values()) {
      if (w.entityId === entityId) {
        results.push(w);
      }
    }
    return results;
  }

  /**
   * Get pending withholdings
   */
  getPendingWithholdings() {
    const results = [];
    for (const w of this.withholdings.values()) {
      if (w.status === TaxStatus.WITHHELD || w.status === TaxStatus.PENDING) {
        results.push(w);
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
      totalRules: this.rules.size,
      activeRules: Array.from(this.rules.values()).filter(r => r.isActive()).length,
      totalEntities: this.entities.size,
      pendingRemittance: this.getPendingWithholdings().length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Withhold Tax Demo\n');

  const manager = new WithholdTaxManager();

  // Show available rules
  console.log('1. Available Withholding Rules:');
  for (const rule of manager.rules.values()) {
    console.log(`   ${rule.name} (${rule.country}): ${rule.rate}%`);
    console.log(`      Threshold: $${rule.threshold}`);
  }

  // US Income Tax
  console.log('\n2. US Income Tax Calculation ($1,000):');
  const result1 = manager.calculateWithholding('entity-001', 'US Corp', 'US', 1000, TaxType.INCOME);
  console.log(`   Gross: $${result1.grossAmount}`);
  console.log(`   Taxable: $${result1.taxableAmount}`);
  console.log(`   Rate: ${result1.taxRate}%`);
  console.log(`   Tax Withheld: $${result1.taxWithheld}`);
  console.log(`   Net: $${result1.netAmount}`);

  // US Income Tax below threshold
  console.log('\n3. US Income Tax Below Threshold ($500):');
  const result2 = manager.calculateWithholding('entity-001', 'US Corp', 'US', 500, TaxType.INCOME);
  console.log(`   Gross: $${result2.grossAmount}`);
  console.log(`   Tax Withheld: $${result2.taxWithheld}`);
  console.log(`   Net: $${result2.netAmount}`);

  // UK Income Tax
  console.log('\n4. UK Income Tax Calculation ($50,000):');
  const result3 = manager.calculateWithholding('entity-002', 'UK Ltd', 'GB', 50000, TaxType.INCOME);
  console.log(`   Gross: $${result3.grossAmount}`);
  console.log(`   Tax Withheld: $${result3.taxWithheld}`);
  console.log(`   Net: $${result3.netAmount}`);

  // Process withholding
  console.log('\n5. Processing Withholding (Canada, $10,000):');
  const result4 = manager.processWithholding('entity-003', 'Canada Inc', 'CA', 10000, TaxType.INCOME);
  console.log(`   Success: ${result4.success}`);
  console.log(`   Withholding ID: ${result4.withholdingId}`);
  console.log(`   Tax Withheld: $${result4.taxWithheld}`);
  console.log(`   Net: $${result4.netAmount}`);

  // Process another withholding
  console.log('\n6. Processing Withholding (Germany, $25,000):');
  const result5 = manager.processWithholding('entity-004', 'Germany GmbH', 'DE', 25000, TaxType.INCOME);
  console.log(`   Success: ${result5.success}`);
  console.log(`   Tax Withheld: $${result5.taxWithheld}`);
  console.log(`   Net: $${result5.netAmount}`);

  // Remit withholding
  console.log('\n7. Remitting Withholding:');
  const remitResult = manager.remittance(result4.withholdingId);
  console.log(`   Success: ${remitResult.success}`);
  console.log(`   Amount Remitted: $${remitResult.amountRemitted}`);

  // No rule found
  console.log('\n8. No Rule Found (China):');
  const result6 = manager.calculateWithholding('entity-005', 'China Co', 'CN', 10000, TaxType.INCOME);
  console.log(`   Success: ${result6.success}`);
  console.log(`   Reason: ${result6.reason}`);

  // Get pending withholdings
  console.log('\n9. Pending Withholdings:');
  const pending = manager.getPendingWithholdings();
  console.log(`   Count: ${pending.length}`);

  // Get entity withholdings
  console.log('\n10. Entity Withholdings (entity-003):');
  const entityWithholdings = manager.getEntityWithholdings('entity-003');
  console.log(`    Count: ${entityWithholdings.length}`);

  // Stats
  console.log('\n11. Statistics:');
  const stats = manager.getStats();
  console.log(`    Total Withholdings: ${stats.totalWithholdings}`);
  console.log(`    Total Tax Collected: $${stats.totalTaxCollected}`);
  console.log(`    Total Tax Remitted: $${stats.totalTaxRemitted}`);
  console.log(`    Total Tax Pending: $${stats.totalTaxPending}`);
  console.log(`    Withholdings Failed: ${stats.withholdingsFailed}`);
  console.log(`    Active Rules: ${stats.activeRules}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new WithholdTaxManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Withhold Tax Module');
  console.log('Usage: node agent-withhold-tax.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
