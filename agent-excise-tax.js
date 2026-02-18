/**
 * Agent Excise Tax Module
 *
 * Provides excise tax calculation and management.
 * Usage: node agent-excise-tax.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show excise tax stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

/**
 * Product Category
 */
const ProductCategory = {
  ALCOHOL: 'alcohol',
  TOBACCO: 'tobacco',
  FUEL: 'fuel',
  VEHICLE: 'vehicle',
  SUGAR: 'sugar',
  ENVIRONMENTAL: 'environmental'
};

/**
 * Tax Calculation Type
 */
const TaxCalcType = {
  PER_UNIT: 'per_unit',
  PERCENTAGE: 'percentage',
  AD_VALOREM: 'ad_valorem'
};

/**
 * Excise Tax Rate
 */
class ExciseTaxRate {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.category = config.category;
    this.productType = config.productType;
    this.country = config.country;
    this.rate = config.rate;
    this.rateType = config.rateType; // per_unit, percentage, ad_valorem
    this.unit = config.unit; // liter, pack, gallon, etc.
    this.minTax = config.minTax || 0;
    this.effectiveDate = config.effectiveDate || Date.now();
    this.expirationDate = config.expirationDate || null;
  }

  isActive() {
    const now = Date.now();
    if (now < this.effectiveDate) return false;
    if (this.expirationDate && now > this.expirationDate) return false;
    return true;
  }

  calculateTax(quantity, value = 0) {
    if (!this.isActive()) return 0;

    let tax = 0;

    switch (this.rateType) {
      case TaxCalcType.PER_UNIT:
        tax = quantity * this.rate;
        break;
      case TaxCalcType.PERCENTAGE:
      case TaxCalcType.AD_VALOREM:
        tax = value * (this.rate / 100);
        break;
    }

    // Apply minimum tax if applicable
    if (this.minTax > 0 && tax < this.minTax) {
      tax = this.minTax;
    }

    return tax;
  }

  toJSON() {
    return {
      id: this.id,
      category: this.category,
      productType: this.productType,
      country: this.country,
      rate: this.rate,
      rateType: this.rateType,
      unit: this.unit,
      effectiveDate: this.effectiveDate,
      isActive: this.isActive()
    };
  }
}

/**
 * Excise Tax Transaction
 */
class ExciseTaxTransaction {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.transactionId = config.transactionId;
    this.productCategory = config.productCategory;
    this.productType = config.productType;
    this.country = config.country;
    this.quantity = config.quantity;
    this.unit = config.unit;
    this.value = config.value;
    this.taxRate = config.taxRate;
    this.taxAmount = config.taxAmount;
    this.status = config.status || 'pending';
    this.manufacturerId = config.manufacturerId;
    this.distributorId = config.distributorId;
    this.date = config.date || Date.now();
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      transactionId: this.transactionId,
      productCategory: this.productCategory,
      productType: this.productType,
      country: this.country,
      quantity: this.quantity,
      value: this.value,
      taxRate: this.taxRate,
      taxAmount: this.taxAmount,
      status: this.status,
      date: this.date
    };
  }
}

/**
 * Tax Bond
 */
class TaxBond {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.entityId = config.entityId;
    this.entityName = config.entityName;
    this.country = config.country;
    this.bondAmount = config.bondAmount;
    this.bondNumber = config.bondNumber;
    this.issueDate = config.issueDate || Date.now();
    this.expirationDate = config.expirationDate;
    this.status = config.status || 'active';
  }

  isActive() {
    if (this.status !== 'active') return false;
    if (this.expirationDate && Date.now() > this.expirationDate) {
      this.status = 'expired';
      return false;
    }
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      entityId: this.entityId,
      entityName: this.entityName,
      country: this.country,
      bondAmount: this.bondAmount,
      bondNumber: this.bondNumber,
      status: this.status
    };
  }
}

/**
 * Excise Tax Manager
 */
class ExciseTaxManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.rates = new Map();
    this.transactions = new Map();
    this.bonds = new Map();
    this.stats = {
      totalTransactions: 0,
      totalTaxCollected: 0,
      totalTaxRemitted: 0,
      transactionsByCategory: {},
      transactionsFailed: 0
    };

    this._init();
  }

  _init() {
    this._createSampleRates();
  }

  _createSampleRates() {
    // US Federal Excise Taxes
    this.rates.set('US-FUEL-GAS', new ExciseTaxRate({
      category: ProductCategory.FUEL,
      productType: 'gasoline',
      country: 'US',
      rate: 18.4, // cents per gallon
      rateType: TaxCalcType.PER_UNIT,
      unit: 'gallon'
    }));

    this.rates.set('US-FUEL-DSL', new ExciseTaxRate({
      category: ProductCategory.FUEL,
      productType: 'diesel',
      country: 'US',
      rate: 24.4,
      rateType: TaxCalcType.PER_UNIT,
      unit: 'gallon'
    }));

    this.rates.set('US-ALCOHOL-BEER', new ExciseTaxRate({
      category: ProductCategory.ALCOHOL,
      productType: 'beer',
      country: 'US',
      rate: 0.58, // per gallon
      rateType: TaxCalcType.PER_UNIT,
      unit: 'gallon',
      minTax: 1.0
    }));

    this.rates.set('US-ALCOHOL-WINE', new ExciseTaxRate({
      category: ProductCategory.ALCOHOL,
      productType: 'wine',
      country: 'US',
      rate: 1.07, // per gallon
      rateType: TaxCalcType.PER_UNIT,
      unit: 'gallon'
    }));

    this.rates.set('US-TOBACCO-CIG', new ExciseTaxRate({
      category: ProductCategory.TOBACCO,
      productType: 'cigarettes',
      country: 'US',
      rate: 50.33, // per pack of 20
      rateType: TaxCalcType.PER_UNIT,
      unit: 'pack'
    }));

    // UK Excise Taxes
    this.rates.set('UK-FUEL-UNI', new ExciseTaxRate({
      category: ProductCategory.FUEL,
      productType: 'unleaded',
      country: 'GB',
      rate: 57.95, // pence per liter
      rateType: TaxCalcType.PER_UNIT,
      unit: 'liter'
    }));

    this.rates.set('UK-ALCOHOL-BEER', new ExciseTaxRate({
      category: ProductCategory.ALCOHOL,
      productType: 'beer',
      country: 'GB',
      rate: 19.08, // per ABV%
      rateType: TaxCalcType.PER_UNIT,
      unit: 'hectoliter'
    }));

    this.rates.set('UK-TOBACCO-CIG', new ExciseTaxRate({
      category: ProductCategory.TOBACCO,
      productType: 'cigarettes',
      country: 'GB',
      rate: 16.5, // % of retail price + per unit
      rateType: TaxCalcType.AD_VALOREM,
      unit: 'pack'
    }));

    // Canada Excise Taxes
    this.rates.set('CA-FUEL-GAS', new ExciseTaxRate({
      category: ProductCategory.FUEL,
      productType: 'gasoline',
      country: 'CA',
      rate: 10.0, // cents per liter
      rateType: TaxCalcType.PER_UNIT,
      unit: 'liter'
    }));

    this.rates.set('CA-ALCOHOL-BEER', new ExciseTaxRate({
      category: ProductCategory.ALCOHOL,
      productType: 'beer',
      country: 'CA',
      rate: 2.977, // per liter
      rateType: TaxCalcType.PER_UNIT,
      unit: 'liter'
    }));

    this.rates.set('CA-TOBACCO-CIG', new ExciseTaxRate({
      category: ProductCategory.TOBACCO,
      productType: 'cigarettes',
      country: 'CA',
      rate: 31.68, // per pack of 20
      rateType: TaxCalcType.PER_UNIT,
      unit: 'pack'
    }));

    // Australia Excise Taxes
    this.rates.set('AU-FUEL-PETROL', new ExciseTaxRate({
      category: ProductCategory.FUEL,
      productType: 'petrol',
      country: 'AU',
      rate: 0.428, // per liter
      rateType: TaxCalcType.PER_UNIT,
      unit: 'liter'
    }));

    this.rates.set('AU-ALCOHOL-SPIRIT', new ExciseTaxRate({
      category: ProductCategory.ALCOHOL,
      productType: 'spirits',
      country: 'AU',
      rate: 67.57, // per liter of pure alcohol
      rateType: TaxCalcType.PER_UNIT,
      unit: 'liter'
    }));

    this.rates.set('AU-TOBACCO-CIG', new ExciseTaxRate({
      category: ProductCategory.TOBACCO,
      productType: 'cigarettes',
      country: 'AU',
      rate: 1.206, // per stick
      rateType: TaxCalcType.PER_UNIT,
      unit: 'stick'
    }));

    // Environmental Taxes
    this.rates.set('UK-CARBON', new ExciseTaxRate({
      category: ProductCategory.ENVIRONMENTAL,
      productType: 'carbon_emissions',
      country: 'GB',
      rate: 21.0, // per tonne CO2
      rateType: TaxCalcType.PER_UNIT,
      unit: 'tonne'
    }));

    this.rates.set('EU-CARBON', new ExciseTaxRate({
      category: ProductCategory.ENVIRONMENTAL,
      productType: 'carbon_emissions',
      country: 'EU',
      rate: 50.0, // per tonne CO2
      rateType: TaxCalcType.PER_UNIT,
      unit: 'tonne'
    }));
  }

  /**
   * Find rate
   */
  findRate(country, category, productType = null) {
    for (const rate of this.rates.values()) {
      if (rate.country === country && rate.category === category && rate.isActive()) {
        if (!productType || rate.productType === productType) {
          return rate;
        }
      }
    }
    return null;
  }

  /**
   * Calculate excise tax
   */
  calculateExciseTax(country, category, quantity, value = 0, productType = null) {
    const rate = this.findRate(country, category, productType);

    if (!rate) {
      return {
        success: false,
        reason: `No excise tax rate found for ${country}/${category}`
      };
    }

    const taxAmount = rate.calculateTax(quantity, value);

    return {
      success: true,
      rate: rate.rate,
      rateType: rate.rateType,
      unit: rate.unit,
      rateName: `${rate.productType} (${rate.category})`,
      quantity: quantity,
      value: value,
      taxAmount: taxAmount
    };
  }

  /**
   * Process transaction
   */
  processTransaction(config) {
    const { transactionId, country, category, productType, quantity, value, manufacturerId, distributorId } = config;

    const calculation = this.calculateExciseTax(country, category, quantity, value, productType);

    if (!calculation.success) {
      this.stats.transactionsFailed++;
      return calculation;
    }

    const transaction = new ExciseTaxTransaction({
      transactionId,
      productCategory: category,
      productType: productType,
      country: country,
      quantity: quantity,
      unit: calculation.unit,
      value: value,
      taxRate: calculation.rate,
      taxAmount: calculation.taxAmount,
      manufacturerId,
      distributorId,
      status: 'completed'
    });

    this.transactions.set(transaction.id, transaction);

    // Update stats
    this.stats.totalTransactions++;
    this.stats.totalTaxCollected += calculation.taxAmount;

    if (!this.stats.transactionsByCategory[category]) {
      this.stats.transactionsByCategory[category] = 0;
    }
    this.stats.transactionsByCategory[category]++;

    return {
      success: true,
      transactionId: transaction.id,
      ...calculation
    };
  }

  /**
   * Register bond
   */
  registerBond(config) {
    const bond = new TaxBond(config);
    this.bonds.set(bond.id, bond);
    return {
      success: true,
      bondId: bond.id,
      bond: bond.toJSON()
    };
  }

  /**
   * Get entity bonds
   */
  getBonds(entityId) {
    const results = [];
    for (const bond of this.bonds.values()) {
      if (bond.entityId === entityId) {
        results.push(bond);
      }
    }
    return results;
  }

  /**
   * Calculate liability by entity
   */
  calculateLiability(entityId) {
    let totalTax = 0;
    let transactionCount = 0;
    const byCategory = {};

    for (const txn of this.transactions.values()) {
      if (txn.manufacturerId === entityId || txn.distributorId === entityId) {
        totalTax += txn.taxAmount;
        transactionCount++;

        if (!byCategory[txn.productCategory]) {
          byCategory[txn.productCategory] = { count: 0, tax: 0 };
        }
        byCategory[txn.productCategory].count++;
        byCategory[txn.productCategory].tax += txn.taxAmount;
      }
    }

    return {
      totalTax: totalTax,
      transactionCount: transactionCount,
      byCategory: byCategory
    };
  }

  /**
   * Get rates by category
   */
  getRatesByCategory(category) {
    const results = [];
    for (const rate of this.rates.values()) {
      if (rate.category === category && rate.isActive()) {
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
      totalRates: this.rates.size,
      activeRates: Array.from(this.rates.values()).filter(r => r.isActive()).length,
      totalBonds: this.bonds.size,
      activeBonds: Array.from(this.bonds.values()).filter(b => b.isActive()).length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Excise Tax Demo\n');

  const manager = new ExciseTaxManager();

  // Show available rates by category
  console.log('1. Available Excise Tax Rates:');
  const categories = [ProductCategory.ALCOHOL, ProductCategory.TOBACCO, ProductCategory.FUEL, ProductCategory.ENVIRONMENTAL];
  for (const cat of categories) {
    console.log(`\n   ${cat.toUpperCase()}:`);
    const rates = manager.getRatesByCategory(cat);
    for (const rate of rates) {
      const rateDisplay = rate.rateType === TaxCalcType.PER_UNIT
        ? `${rate.rate} per ${rate.unit}`
        : `${rate.rate}%`;
      console.log(`      ${rate.productType} (${rate.country}): ${rateDisplay}`);
    }
  }

  // US Gasoline Tax
  console.log('\n2. US Gasoline Tax (10 gallons):');
  const result1 = manager.calculateExciseTax('US', ProductCategory.FUEL, 10, 0, 'gasoline');
  console.log(`   Quantity: ${result1.quantity} gallons`);
  console.log(`   Rate: ${result1.rate} cents/gallon`);
  console.log(`   Tax: $${(result1.taxAmount / 100).toFixed(2)}`);

  // US Cigarettes
  console.log('\n3. US Cigarette Tax (5 packs):');
  const result2 = manager.calculateExciseTax('US', ProductCategory.TOBACCO, 5, 0, 'cigarettes');
  console.log(`   Quantity: ${result2.quantity} packs`);
  console.log(`   Rate: $${result2.rate}/pack`);
  console.log(`   Tax: $${result2.taxAmount.toFixed(2)}`);

  // UK Beer Tax
  console.log('\n4. UK Beer Tax (100 liters, 5% ABV):');
  const result3 = manager.calculateExciseTax('GB', ProductCategory.ALCOHOL, 100, 0, 'beer');
  console.log(`   Quantity: ${result3.quantity} hl`);
  console.log(`   Rate: ${result3.rate}/hl/ABV%`);
  console.log(`   Tax: $${result3.taxAmount.toFixed(2)}`);

  // Australia Tobacco
  console.log('\n5. Australia Tobacco Tax (20 sticks):');
  const result4 = manager.calculateExciseTax('AU', ProductCategory.TOBACCO, 20, 0, 'cigarettes');
  console.log(`   Quantity: ${result4.quantity} sticks`);
  console.log(`   Rate: $${result4.rate}/stick`);
  console.log(`   Tax: $${result4.taxAmount.toFixed(2)}`);

  // Carbon Tax
  console.log('\n6. UK Carbon Tax (100 tonnes):');
  const result5 = manager.calculateExciseTax('GB', ProductCategory.ENVIRONMENTAL, 100, 0, 'carbon_emissions');
  console.log(`   Quantity: ${result5.quantity} tonnes`);
  console.log(`   Rate: £${result5.rate}/tonne`);
  console.log(`   Tax: £${result5.taxAmount.toFixed(2)}`);

  // Process transaction - Fuel
  console.log('\n7. Processing Fuel Transaction (1000 gallons):');
  const result6 = manager.processTransaction({
    transactionId: 'EXC-001',
    country: 'US',
    category: ProductCategory.FUEL,
    productType: 'gasoline',
    quantity: 1000,
    value: 0,
    manufacturerId: 'mfr-001'
  });
  console.log(`   Success: ${result6.success}`);
  console.log(`   Tax: $${(result6.taxAmount / 100).toFixed(2)}`);

  // Process transaction - Alcohol
  console.log('\n8. Processing Alcohol Transaction (500 gallons):');
  const result7 = manager.processTransaction({
    transactionId: 'EXC-002',
    country: 'US',
    category: ProductCategory.ALCOHOL,
    productType: 'beer',
    quantity: 500,
    value: 0,
    manufacturerId: 'mfr-001'
  });
  console.log(`   Success: ${result7.success}`);
  console.log(`   Tax: $${result7.taxAmount.toFixed(2)}`);

  // Process transaction - Tobacco
  console.log('\n9. Processing Tobacco Transaction (100 packs):');
  const result8 = manager.processTransaction({
    transactionId: 'EXC-003',
    country: 'CA',
    category: ProductCategory.TOBACCO,
    productType: 'cigarettes',
    quantity: 100,
    value: 0,
    manufacturerId: 'mfr-002'
  });
  console.log(`   Success: ${result8.success}`);
  console.log(`   Tax: $${result8.taxAmount.toFixed(2)}`);

  // Register bond
  console.log('\n10. Registering Tax Bond:');
  const bondResult = manager.registerBond({
    entityId: 'mfr-001',
    entityName: 'Sample Distillery',
    country: 'US',
    bondAmount: 100000,
    bondNumber: 'BOND-12345',
    expirationDate: Date.now() + 365 * 24 * 60 * 60 * 1000
  });
  console.log(`    Success: ${bondResult.success}`);
  console.log(`    Bond Number: ${bondResult.bond.bondNumber}`);

  // Calculate liability
  console.log('\n11. Liability for mfr-001:');
  const liability = manager.calculateLiability('mfr-001');
  console.log(`    Total Tax: $${liability.totalTax.toFixed(2)}`);
  console.log(`    Transactions: ${liability.transactionCount}`);
  console.log(`    By Category:`);
  for (const [cat, data] of Object.entries(liability.byCategory)) {
    console.log(`      ${cat}: ${data.count} txns, $${data.tax.toFixed(2)}`);
  }

  // No rate found
  console.log('\n12. No Rate Found (China Alcohol):');
  const result9 = manager.calculateExciseTax('CN', ProductCategory.ALCOHOL, 100, 0);
  console.log(`    Success: ${result9.success}`);
  console.log(`    Reason: ${result9.reason}`);

  // Stats
  console.log('\n13. Statistics:');
  const stats = manager.getStats();
  console.log(`    Total Transactions: ${stats.totalTransactions}`);
  console.log(`    Total Tax Collected: $${stats.totalTaxCollected.toFixed(2)}`);
  console.log(`    Active Rates: ${stats.activeRates}`);
  console.log(`    Transactions by Category:`);
  for (const [cat, count] of Object.entries(stats.transactionsByCategory)) {
    console.log(`      ${cat}: ${count}`);
  }

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new ExciseTaxManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Excise Tax Module');
  console.log('Usage: node agent-excise-tax.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
