/**
 * Agent Asset Module
 *
 * Provides asset management services.
 * Usage: node agent-asset.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show asset stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Asset Type
 */
const AssetType = {
  CASH: 'cash',
  EQUITY: 'equity',
  FIXED_INCOME: 'fixed_income',
  REAL_ESTATE: 'real_estate',
  COMMODITY: 'commodity',
  CRYPTO: 'crypto',
  FUND: 'fund',
  ETF: 'etf',
  BOND: 'bond'
};

/**
 * Asset Class
 */
const AssetClass = {
  LIQUID: 'liquid',
  ILLIQUID: 'illiquid',
  ALTERNATIVE: 'alternative'
};

/**
 * Asset
 */
class Asset {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.symbol = config.symbol || null;
    this.type = config.type;
    this.assetClass = config.assetClass || this._determineAssetClass();
    this.quantity = config.quantity || 0;
    this.costBasis = config.costBasis || 0;
    this.currentValue = config.currentValue || 0;
    this.currency = config.currency || 'USD';
    this.acquiredAt = config.acquiredAt || Date.now();
    this.metadata = config.metadata || {};
  }

  _determineAssetClass() {
    const liquidTypes = [AssetType.CASH, AssetType.EQUITY, AssetType.ETF, AssetType.FUND];
    if (liquidTypes.includes(this.type)) return AssetClass.LIQUID;
    return AssetClass.ILLIQUID;
  }

  getTotalCost() {
    return this.costBasis;
  }

  getCurrentValue() {
    return this.currentValue || this.costBasis;
  }

  getUnrealizedPnL() {
    return this.getCurrentValue() - this.getTotalCost();
  }

  getReturn() {
    const cost = this.getTotalCost();
    if (cost === 0) return 0;
    return ((this.getCurrentValue() - cost) / cost) * 100;
  }

  updateValue(value) {
    this.currentValue = value;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      symbol: this.symbol,
      type: this.type,
      assetClass: this.assetClass,
      quantity: this.quantity,
      costBasis: this.costBasis,
      currentValue: this.getCurrentValue(),
      unrealizedPnL: this.getUnrealizedPnL(),
      return: this.getReturn().toFixed(2) + '%'
    };
  }
}

/**
 * Portfolio
 */
class Portfolio {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.accountId = config.accountId;
    this.assets = new Map();
    this.cash = config.cash || 0;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
  }

  addAsset(asset) {
    this.assets.set(asset.id, asset);
    this.updatedAt = Date.now();
  }

  removeAsset(assetId) {
    const removed = this.assets.delete(assetId);
    if (removed) {
      this.updatedAt = Date.now();
    }
    return removed;
  }

  getAsset(assetId) {
    return this.assets.get(assetId);
  }

  getTotalValue() {
    let total = this.cash;
    for (const asset of this.assets.values()) {
      total += asset.getCurrentValue();
    }
    return total;
  }

  getTotalCost() {
    let total = 0;
    for (const asset of this.assets.values()) {
      total += asset.getTotalCost();
    }
    return total;
  }

  getTotalPnL() {
    return this.getTotalValue() - this.getTotalCost();
  }

  getAllocation() {
    const total = this.getTotalValue();
    const allocation = {};

    for (const asset of this.assets.values()) {
      const type = asset.type;
      if (!allocation[type]) {
        allocation[type] = 0;
      }
      allocation[type] += asset.getCurrentValue();
    }

    // Convert to percentages
    const result = {};
    for (const [type, value] of Object.entries(allocation)) {
      result[type] = {
        value,
        percentage: total > 0 ? ((value / total) * 100).toFixed(2) + '%' : '0%'
      };
    }

    return result;
  }

  rebalance(targetAllocation) {
    // Simplified rebalancing - returns trades needed
    const trades = [];
    const currentValue = this.getTotalValue();

    for (const [type, target] of Object.entries(targetAllocation)) {
      const targetValue = currentValue * (target / 100);
      let currentValueByType = 0;

      for (const asset of this.assets.values()) {
        if (asset.type === type) {
          currentValueByType += asset.getCurrentValue();
        }
      }

      const diff = targetValue - currentValueByType;
      if (Math.abs(diff) > 1) {
        trades.push({
          type,
          action: diff > 0 ? 'buy' : 'sell',
          amount: Math.abs(diff)
        });
      }
    }

    return trades;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      accountId: this.accountId,
      cash: this.cash,
      totalValue: this.getTotalValue(),
      totalCost: this.getTotalCost(),
      totalPnL: this.getTotalPnL(),
      assetsCount: this.assets.size
    };
  }
}

/**
 * Asset Manager
 */
class AssetManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.portfolios = new Map();
    this.assets = new Map();
    this.stats = {
      portfoliosCreated: 0,
      assetsAdded: 0,
      assetsRemoved: 0,
      totalValue: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  createPortfolio(config) {
    const portfolio = new Portfolio(config);
    this.portfolios.set(portfolio.id, portfolio);
    this.stats.portfoliosCreated++;
    return portfolio;
  }

  getPortfolio(portfolioId) {
    return this.portfolios.get(portfolioId);
  }

  addAssetToPortfolio(portfolioId, assetData) {
    const portfolio = this.portfolios.get(portfolioId);
    if (!portfolio) {
      return null;
    }

    const asset = new Asset(assetData);
    portfolio.addAsset(asset);
    this.assets.set(asset.id, asset);
    this.stats.assetsAdded++;

    return asset;
  }

  removeAssetFromPortfolio(portfolioId, assetId) {
    const portfolio = this.portfolios.get(portfolioId);
    if (!portfolio) {
      return false;
    }

    const removed = portfolio.removeAsset(assetId);
    if (removed) {
      this.assets.delete(assetId);
      this.stats.assetsRemoved++;
    }

    return removed;
  }

  updateAssetValue(assetId, newValue) {
    const asset = this.assets.get(assetId);
    if (asset) {
      asset.updateValue(newValue);
      return asset;
    }
    return null;
  }

  depositCash(portfolioId, amount) {
    const portfolio = this.portfolios.get(portfolioId);
    if (portfolio) {
      portfolio.cash += amount;
      return portfolio.cash;
    }
    return null;
  }

  withdrawCash(portfolioId, amount) {
    const portfolio = this.portfolios.get(portfolioId);
    if (portfolio && portfolio.cash >= amount) {
      portfolio.cash -= amount;
      return portfolio.cash;
    }
    return null;
  }

  getAllAssets() {
    return Array.from(this.assets.values());
  }

  getStats() {
    let totalValue = 0;
    for (const portfolio of this.portfolios.values()) {
      totalValue += portfolio.getTotalValue();
    }

    return {
      ...this.stats,
      totalPortfolios: this.portfolios.size,
      totalAssets: this.assets.size,
      totalValue: totalValue
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Asset Demo\n');

  const manager = new AssetManager();

  // Create portfolio
  console.log('1. Creating Portfolio:');
  const portfolio = manager.createPortfolio({
    name: 'Retirement Portfolio',
    accountId: 'ACC-001',
    cash: 50000
  });
  console.log(`   Portfolio: ${portfolio.name}`);
  console.log(`   Cash: $${portfolio.cash.toLocaleString()}`);

  // Add assets
  console.log('\n2. Adding Assets:');

  const asset1 = manager.addAssetToPortfolio(portfolio.id, {
    name: 'Apple Inc.',
    symbol: 'AAPL',
    type: AssetType.EQUITY,
    quantity: 100,
    costBasis: 15000,
    currentValue: 17500
  });
  console.log(`   Added: ${asset1.name} (${asset1.symbol})`);

  const asset2 = manager.addAssetToPortfolio(portfolio.id, {
    name: 'Tesla Inc.',
    symbol: 'TSLA',
    type: AssetType.EQUITY,
    quantity: 50,
    costBasis: 10000,
    currentValue: 8500
  });
  console.log(`   Added: ${asset2.name} (${asset2.symbol})`);

  const asset3 = manager.addAssetToPortfolio(portfolio.id, {
    name: 'Bitcoin',
    symbol: 'BTC',
    type: AssetType.CRYPTO,
    quantity: 1,
    costBasis: 25000,
    currentValue: 32000
  });
  console.log(`   Added: ${asset3.name} (${asset3.symbol})`);

  const asset4 = manager.addAssetToPortfolio(portfolio.id, {
    name: 'US Treasury Bond',
    symbol: 'UST10Y',
    type: AssetType.BOND,
    quantity: 100,
    costBasis: 10000,
    currentValue: 9800
  });
  console.log(`   Added: ${asset4.name} (${asset4.symbol})`);

  // Portfolio value
  console.log('\n3. Portfolio Value:');
  console.log(`   Total Value: $${portfolio.getTotalValue().toLocaleString()}`);
  console.log(`   Total Cost: $${portfolio.getTotalCost().toLocaleString()}`);
  console.log(`   Total P&L: $${portfolio.getTotalPnL().toLocaleString()}`);

  // Asset details
  console.log('\n4. Asset Performance:');
  for (const asset of portfolio.assets.values()) {
    console.log(`   ${asset.name}: $${asset.getCurrentValue()} (${asset.getReturn().toFixed(2)}%)`);
  }

  // Allocation
  console.log('\n5. Asset Allocation:');
  const allocation = portfolio.getAllocation();
  for (const [type, data] of Object.entries(allocation)) {
    console.log(`   ${type}: $${data.value.toLocaleString()} (${data.percentage})`);
  }

  // Rebalance
  console.log('\n6. Rebalancing:');
  const targetAlloc = {
    [AssetType.EQUITY]: 40,
    [AssetType.BOND]: 30,
    [AssetType.CRYPTO]: 10,
    [AssetType.CASH]: 20
  };
  const trades = portfolio.rebalance(targetAlloc);
  for (const trade of trades) {
    console.log(`   ${trade.action.toUpperCase()} ${trade.type}: $${trade.amount.toFixed(2)}`);
  }

  // Update asset value
  console.log('\n7. Updating Asset Value:');
  manager.updateAssetValue(asset1.id, 18000);
  console.log(`   AAPL new value: $${asset1.getCurrentValue()}`);

  // Stats
  console.log('\n8. Statistics:');
  const stats = manager.getStats();
  console.log(`   Portfolios: ${stats.totalPortfolios}`);
  console.log(`   Assets: ${stats.totalAssets}`);
  console.log(`   Total Value: $${stats.totalValue.toLocaleString()}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new AssetManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Asset Module');
  console.log('Usage: node agent-asset.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
