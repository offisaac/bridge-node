/**
 * Agent GST Module
 *
 * Provides GST (Goods and Services Tax) processing.
 * Usage: node agent-gst.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show GST stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

/**
 * GST Rate Type
 */
const GSTRateType = {
  STANDARD: 'standard',
  REDUCED: 'reduced',
  ZERO: 'zero',
  EXEMPT: 'exempt'
};

/**
 * Transaction Type
 */
const TransactionType = {
  SUPPLY: 'supply',
  PURCHASE: 'purchase',
  IMPORT: 'import',
  EXPORT: 'export',
  REVERSE_CHARGE: 'reverse_charge'
};

/**
 * GST Rate
 */
class GSTRate {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.country = config.country;
    this.name = config.name;
    this.rate = config.rate; // Percentage
    this.rateType = config.rateType;
    this.category = config.category || 'general'; // goods, services, etc.
    this.effectiveDate = config.effectiveDate || Date.now();
    this.expirationDate = config.expirationDate || null;
  }

  isActive() {
    const now = Date.now();
    if (now < this.effectiveDate) return false;
    if (this.expirationDate && now > this.expirationDate) return false;
    return true;
  }

  calculateTax(amount) {
    if (!this.isActive()) return 0;
    if (this.rateType === GSTRateType.EXEMPT || this.rateType === GSTRateType.ZERO) return 0;
    return amount * (this.rate / 100);
  }

  toJSON() {
    return {
      id: this.id,
      country: this.country,
      name: this.name,
      rate: this.rate,
      rateType: this.rateType,
      effectiveDate: this.effectiveDate,
      isActive: this.isActive()
    };
  }
}

/**
 * GST Transaction
 */
class GSTTransaction {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.transactionId = config.transactionId;
    this.country = config.country;
    this.transactionType = config.transactionType;
    this.grossAmount = config.grossAmount;
    this.gstRate = config.gstRate;
    this.gstAmount = config.gstAmount;
    this.netAmount = config.netAmount;
    this.supplierId = config.supplierId;
    this.customerId = config.customerId;
    this.invoiceNumber = config.invoiceNumber;
    this.date = config.date || Date.now();
    this.status = config.status || 'pending';
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      transactionId: this.transactionId,
      country: this.country,
      transactionType: this.transactionType,
      grossAmount: this.grossAmount,
      gstRate: this.gstRate,
      gstAmount: this.gstAmount,
      netAmount: this.netAmount,
      supplierId: this.supplierId,
      customerId: this.customerId,
      invoiceNumber: this.invoiceNumber,
      date: this.date,
      status: this.status
    };
  }
}

/**
 * GST Registration
 */
class GSTRegistration {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.entityId = config.entityId;
    this.entityName = config.entityName;
    this.country = config.country;
    this.registrationNumber = config.registrationNumber;
    this.registrationType = config.registrationType; // regular, composite, exempt
    this.effectiveDate = config.effectiveDate;
    this.status = config.status || 'active';
    this.annualTurnover = config.annualTurnover || 0;
    this.threshold = config.threshold || 0;
  }

  isActive() {
    return this.status === 'active';
  }

  toJSON() {
    return {
      id: this.id,
      entityId: this.entityId,
      entityName: this.entityName,
      country: this.country,
      registrationNumber: this.registrationNumber,
      registrationType: this.registrationType,
      status: this.status,
      effectiveDate: this.effectiveDate
    };
  }
}

/**
 * GST Manager
 */
class GSTManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.rates = new Map();
    this.transactions = new Map();
    this.registrations = new Map();
    this.stats = {
      totalTransactions: 0,
      totalGSTCollected: 0,
      totalGSTPaid: 0,
      totalGSTRemitted: 0,
      totalGSTClaimed: 0,
      transactionsFailed: 0
    };

    this._init();
  }

  _init() {
    this._createSampleRates();
  }

  _createSampleRates() {
    // Australia GST
    this.rates.set('AU-STANDARD', new GSTRate({
      country: 'AU',
      name: 'Australia Standard GST',
      rate: 10,
      rateType: GSTRateType.STANDARD,
      category: 'general'
    }));

    this.rates.set('AU-ZERO', new GSTRate({
      country: 'AU',
      name: 'Australia Zero Rate',
      rate: 0,
      rateType: GSTRateType.ZERO,
      category: 'export'
    }));

    // Canada GST/HST
    this.rates.set('CA-GST', new GSTRate({
      country: 'CA',
      name: 'Canada GST',
      rate: 5,
      rateType: GSTRateType.STANDARD,
      category: 'general'
    }));

    this.rates.set('CA-HST-ON', new GSTRate({
      country: 'CA-ON',
      name: 'Ontario HST',
      rate: 13,
      rateType: GSTRateType.STANDARD,
      category: 'general'
    }));

    this.rates.set('CA-HST-BC', new GSTRate({
      country: 'CA-BC',
      name: 'British Columbia GST',
      rate: 12,
      rateType: GSTRateType.STANDARD,
      category: 'general'
    }));

    // UK VAT (similar to GST)
    this.rates.set('UK-VAT-STANDARD', new GSTRate({
      country: 'GB',
      name: 'UK Standard VAT',
      rate: 20,
      rateType: GSTRateType.STANDARD,
      category: 'general'
    }));

    this.rates.set('UK-VAT-REDUCED', new GSTRate({
      country: 'GB',
      name: 'UK Reduced Rate VAT',
      rate: 5,
      rateType: GSTRateType.REDUCED,
      category: 'reduced'
    }));

    this.rates.set('UK-VAT-ZERO', new GSTRate({
      country: 'GB',
      name: 'UK Zero Rate VAT',
      rate: 0,
      rateType: GSTRateType.ZERO,
      category: 'food'
    }));

    // New Zealand GST
    this.rates.set('NZ-GST', new GSTRate({
      country: 'NZ',
      name: 'New Zealand GST',
      rate: 15,
      rateType: GSTRateType.STANDARD,
      category: 'general'
    }));

    // Singapore GST
    this.rates.set('SG-GST', new GSTRate({
      country: 'SG',
      name: 'Singapore GST',
      rate: 9,
      rateType: GSTRateType.STANDARD,
      category: 'general'
    }));

    // India GST
    this.rates.set('IN-GST-5', new GSTRate({
      country: 'IN',
      name: 'India GST 5%',
      rate: 5,
      rateType: GSTRateType.REDUCED,
      category: 'reduced'
    }));

    this.rates.set('IN-GST-12', new GSTRate({
      country: 'IN',
      name: 'India GST 12%',
      rate: 12,
      rateType: GSTRateType.REDUCED,
      category: 'reduced'
    }));

    this.rates.set('IN-GST-18', new GSTRate({
      country: 'IN',
      name: 'India GST 18%',
      rate: 18,
      rateType: GSTRateType.STANDARD,
      category: 'general'
    }));

    this.rates.set('IN-GST-28', new GSTRate({
      country: 'IN',
      name: 'India GST 28%',
      rate: 28,
      rateType: GSTRateType.STANDARD,
      category: 'luxury'
    }));
  }

  /**
   * Find rate by country
   */
  findRate(country, category = 'general') {
    // First try exact match
    for (const rate of this.rates.values()) {
      if (rate.country === country && rate.isActive()) {
        return rate;
      }
    }
    // Try partial match
    for (const rate of this.rates.values()) {
      if (country.startsWith(rate.country) && rate.isActive()) {
        return rate;
      }
    }
    return null;
  }

  /**
   * Calculate GST
   */
  calculateGST(country, amount, category = 'general') {
    const rate = this.findRate(country, category);

    if (!rate) {
      return {
        success: false,
        reason: `No GST rate found for ${country}`
      };
    }

    const gstAmount = rate.calculateTax(amount);
    const netAmount = amount + gstAmount;

    return {
      success: true,
      rate: rate.rate,
      rateType: rate.rateType,
      rateName: rate.name,
      grossAmount: amount,
      gstAmount: gstAmount,
      netAmount: netAmount
    };
  }

  /**
   * Process transaction
   */
  processTransaction(config) {
    const { transactionId, country, transactionType, amount, supplierId, customerId, invoiceNumber } = config;

    const calculation = this.calculateGST(country, amount);

    if (!calculation.success) {
      this.stats.transactionsFailed++;
      return calculation;
    }

    const transaction = new GSTTransaction({
      transactionId,
      country,
      transactionType,
      grossAmount: calculation.grossAmount,
      gstRate: calculation.rate,
      gstAmount: calculation.gstAmount,
      netAmount: calculation.netAmount,
      supplierId,
      customerId,
      invoiceNumber,
      status: 'completed'
    });

    this.transactions.set(transaction.id, transaction);

    // Update stats based on transaction type
    this.stats.totalTransactions++;
    if (transactionType === TransactionType.SUPPLY) {
      this.stats.totalGSTCollected += calculation.gstAmount;
    } else if (transactionType === TransactionType.PURCHASE || transactionType === TransactionType.IMPORT) {
      this.stats.totalGSTPaid += calculation.gstAmount;
    }

    return {
      success: true,
      transactionId: transaction.id,
      ...calculation
    };
  }

  /**
   * Register entity for GST
   */
  registerEntity(config) {
    const registration = new GSTRegistration(config);
    this.registrations.set(registration.id, registration);
    return {
      success: true,
      registrationId: registration.id,
      registration: registration.toJSON()
    };
  }

  /**
   * Get entity registration
   */
  getRegistration(entityId) {
    for (const reg of this.registrations.values()) {
      if (reg.entityId === entityId) {
        return reg;
      }
    }
    return null;
  }

  /**
   * Calculate GST liability
   */
  calculateLiability(entityId) {
    // Find registration
    const registration = this.getRegistration(entityId);
    if (!registration && this.registrations.size === 0) {
      // No registrations, use transaction stats instead
      return {
        success: true,
        gstCollected: this.stats.totalGSTCollected,
        gstPaid: this.stats.totalGSTPaid,
        netLiability: this.stats.totalGSTCollected - this.stats.totalGSTPaid,
        payable: Math.max(0, this.stats.totalGSTCollected - this.stats.totalGSTPaid),
        refundable: Math.max(0, this.stats.totalGSTPaid - this.stats.totalGSTCollected)
      };
    }

    let collected = 0;
    let paid = 0;

    for (const txn of this.transactions.values()) {
      if (txn.supplierId === entityId && txn.transactionType === TransactionType.SUPPLY) {
        collected += txn.gstAmount;
      }
      if (txn.customerId === entityId && (txn.transactionType === TransactionType.PURCHASE || txn.transactionType === TransactionType.IMPORT)) {
        paid += txn.gstAmount;
      }
    }

    const netLiability = collected - paid;

    return {
      success: true,
      gstCollected: collected,
      gstPaid: paid,
      netLiability: netLiability,
      payable: netLiability > 0 ? netLiability : 0,
      refundable: netLiability < 0 ? Math.abs(netLiability) : 0
    };
  }

  /**
   * Get transactions for entity
   */
  getTransactions(entityId, type = null) {
    const results = [];
    for (const txn of this.transactions.values()) {
      if (txn.supplierId === entityId || txn.customerId === entityId) {
        if (!type || txn.transactionType === type) {
          results.push(txn);
        }
      }
    }
    return results;
  }

  /**
   * Get rates by country
   */
  getRatesByCountry(country) {
    const results = [];
    for (const rate of this.rates.values()) {
      if (rate.country.startsWith(country) && rate.isActive()) {
        results.push(rate);
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
      netGST: this.stats.totalGSTCollected - this.stats.totalGSTPaid,
      totalRates: this.rates.size,
      activeRates: Array.from(this.rates.values()).filter(r => r.isActive()).length,
      totalRegistrations: this.registrations.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent GST Demo\n');

  const manager = new GSTManager();

  // Show available rates
  console.log('1. Available GST Rates:');
  const countries = ['AU', 'CA', 'GB', 'NZ', 'SG', 'IN'];
  for (const country of countries) {
    const rates = manager.getRatesByCountry(country);
    for (const rate of rates) {
      console.log(`   ${rate.name}: ${rate.rate}% (${rate.rateType})`);
    }
  }

  // Australia GST
  console.log('\n2. Australia GST Calculation ($100):');
  const result1 = manager.calculateGST('AU', 100);
  console.log(`   Gross: $${result1.grossAmount}`);
  console.log(`   GST (${result1.rate}%): $${result1.gstAmount}`);
  console.log(`   Net: $${result1.netAmount}`);

  // Canada HST (Ontario)
  console.log('\n3. Canada HST Calculation ($500):');
  const result2 = manager.calculateGST('CA-ON', 500);
  console.log(`   Gross: $${result2.grossAmount}`);
  console.log(`   HST (${result2.rate}%): $${result2.gstAmount}`);
  console.log(`   Net: $${result2.netAmount}`);

  // UK VAT
  console.log('\n4. UK VAT Calculation ($200):');
  const result3 = manager.calculateGST('GB', 200);
  console.log(`   Gross: $${result3.grossAmount}`);
  console.log(`   VAT (${result3.rate}%): $${result3.gstAmount}`);
  console.log(`   Net: $${result3.netAmount}`);

  // India GST (multiple rates)
  console.log('\n5. India GST Rates:');
  const indiaRates = manager.getRatesByCountry('IN');
  for (const rate of indiaRates) {
    console.log(`   ${rate.name}: ${rate.rate}%`);
  }

  // Process supply transaction
  console.log('\n6. Processing Supply Transaction ($1,000):');
  const result4 = manager.processTransaction({
    transactionId: 'TXN-001',
    country: 'AU',
    transactionType: TransactionType.SUPPLY,
    amount: 1000,
    supplierId: 'supplier-001',
    customerId: 'customer-001',
    invoiceNumber: 'INV-001'
  });
  console.log(`   Success: ${result4.success}`);
  console.log(`   GST Collected: $${result4.gstAmount}`);

  // Process purchase transaction
  console.log('\n7. Processing Purchase Transaction ($500):');
  const result5 = manager.processTransaction({
    transactionId: 'TXN-002',
    country: 'AU',
    transactionType: TransactionType.PURCHASE,
    amount: 500,
    supplierId: 'supplier-002',
    customerId: 'supplier-001',
    invoiceNumber: 'INV-002'
  });
  console.log(`   Success: ${result5.success}`);
  console.log(`   GST Paid: $${result5.gstAmount}`);

  // Register entity
  console.log('\n8. Registering Entity for GST:');
  const regResult = manager.registerEntity({
    entityId: 'company-001',
    entityName: 'Sample Company',
    country: 'AU',
    registrationNumber: 'AU12345678901',
    registrationType: 'regular',
    effectiveDate: Date.now()
  });
  console.log(`   Success: ${regResult.success}`);
  console.log(`   Registration Number: ${regResult.registration.registrationNumber}`);

  // Calculate liability
  console.log('\n9. Calculating GST Liability:');
  const liability = manager.calculateLiability('company-001');
  console.log(`   GST Collected: $${liability.gstCollected}`);
  console.log(`   GST Paid: $${liability.gstPaid}`);
  console.log(`   Net Liability: $${liability.netLiability}`);
  console.log(`   Payable: $${liability.payable}`);
  console.log(`   Refundable: $${liability.refundable}`);

  // Get entity transactions
  console.log('\n10. Entity Transactions:');
  const txns = manager.getTransactions('supplier-001');
  console.log(`    Total: ${txns.length}`);

  // No rate found
  console.log('\n11. No Rate Found (China):');
  const result6 = manager.calculateGST('CN', 100);
  console.log(`    Success: ${result6.success}`);
  console.log(`    Reason: ${result6.reason}`);

  // Stats
  console.log('\n12. Statistics:');
  const stats = manager.getStats();
  console.log(`    Total Transactions: ${stats.totalTransactions}`);
  console.log(`    Total GST Collected: $${stats.totalGSTCollected}`);
  console.log(`    Total GST Paid: $${stats.totalGSTPaid}`);
  console.log(`    Net GST: $${stats.netGST}`);
  console.log(`    Active Rates: ${stats.activeRates}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new GSTManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent GST Module');
  console.log('Usage: node agent-gst.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
