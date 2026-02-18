/**
 * Agent Margin Module
 *
 * Provides margin calculation and management services.
 * Usage: node agent-margin.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show margin stats
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
 * Margin Type
 */
const MarginType = {
  INITIAL: 'initial',
  MAINTENANCE: 'maintenance',
  VARIATION: 'variation',
  EXCESS: 'excess'
};

/**
 * Position
 */
class Position {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.accountId = config.accountId;
    this.instrument = config.instrument;
    this.quantity = config.quantity;
    this.entryPrice = config.entryPrice;
    this.currentPrice = config.currentPrice || entryPrice;
    this.side = config.side || 'long'; // long or short
    this.createdAt = Date.now();
  }

  getMarketValue() {
    return Math.abs(this.quantity) * this.currentPrice;
  }

  getCostBasis() {
    return Math.abs(this.quantity) * this.entryPrice;
  }

  getUnrealizedPnL() {
    if (this.side === 'long') {
      return (this.currentPrice - this.entryPrice) * this.quantity;
    } else {
      return (this.entryPrice - this.currentPrice) * this.quantity;
    }
  }

  updatePrice(price) {
    this.currentPrice = price;
  }
}

/**
 * Account Margin
 */
class AccountMargin {
  constructor(config) {
    this.accountId = config.accountId;
    this.cashBalance = config.cashBalance || 0;
    this.positions = [];
    this.initialMargin = 0;
    this.maintenanceMargin = 0;
    this.marginUsed = 0;
    this.marginExcess = 0;
    this.marginCall = false;
  }

  addPosition(position) {
    this.positions.push(position);
  }

  calculate() {
    // Calculate total market value
    let totalMarketValue = 0;
    let totalCostBasis = 0;

    for (const position of this.positions) {
      totalMarketValue += position.getMarketValue();
      totalCostBasis += position.getCostBasis();
    }

    // Calculate margin requirements (simplified - 10% initial, 5% maintenance)
    this.initialMargin = totalMarketValue * 0.10;
    this.maintenanceMargin = totalMarketValue * 0.05;

    // Total equity = cash + market value + unrealized P&L
    const totalUnrealizedPnL = this.positions.reduce((sum, p) => sum + p.getUnrealizedPnL(), 0);
    const totalEquity = this.cashBalance + totalMarketValue + totalUnrealizedPnL;

    // Margin used is the initial margin
    this.marginUsed = this.initialMargin;

    // Excess equity
    this.marginExcess = totalEquity - this.marginUsed;

    // Check for margin call
    const maintenanceEquity = totalMarketValue * 0.05;
    this.marginCall = totalEquity < maintenanceEquity;

    return {
      totalEquity,
      marginUsed: this.marginUsed,
      marginExcess: this.marginExcess,
      marginCall: this.marginCall
    };
  }

  toJSON() {
    return {
      accountId: this.accountId,
      cashBalance: this.cashBalance,
      positionsCount: this.positions.length,
      initialMargin: this.initialMargin,
      maintenanceMargin: this.maintenanceMargin,
      marginUsed: this.marginUsed,
      marginExcess: this.marginExcess,
      marginCall: this.marginCall
    };
  }
}

/**
 * Margin Manager
 */
class MarginManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.accounts = new Map();
    this.marginRates = {
      initial: 0.10, // 10%
      maintenance: 0.05 // 5%
    };
    this.stats = {
      marginCallsIssued: 0,
      positionsOpened: 0,
      positionsClosed: 0,
      marginBreaches: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  createAccount(accountId, cashBalance) {
    const account = new AccountMargin({ accountId, cashBalance });
    this.accounts.set(accountId, account);
    return account;
  }

  getAccount(accountId) {
    return this.accounts.get(accountId);
  }

  openPosition(accountId, positionData) {
    const account = this.accounts.get(accountId);
    if (!account) {
      return null;
    }

    const position = new Position({
      accountId,
      ...positionData
    });

    account.addPosition(position);
    this.stats.positionsOpened++;

    // Recalculate margin
    const result = account.calculate();

    // Check margin call
    if (result.marginCall && !account.marginCall) {
      this.stats.marginCallsIssued++;
    }

    return { position, margin: result };
  }

  closePosition(accountId, positionId) {
    const account = this.accounts.get(accountId);
    if (!account) {
      return null;
    }

    const positionIndex = account.positions.findIndex(p => p.id === positionId);
    if (positionIndex === -1) {
      return null;
    }

    const position = account.positions[positionIndex];
    account.positions.splice(positionIndex, 1);
    this.stats.positionsClosed++;

    // Recalculate margin
    const result = account.calculate();

    return { position, margin: result };
  }

  updatePositionPrice(accountId, positionId, newPrice) {
    const account = this.accounts.get(accountId);
    if (!account) {
      return null;
    }

    const position = account.positions.find(p => p.id === positionId);
    if (!position) {
      return null;
    }

    position.updatePrice(newPrice);

    // Check for margin breach
    const result = account.calculate();

    if (result.marginCall && !account.marginCall) {
      this.stats.marginCallsIssued++;
    } else if (!result.marginCall && account.marginCall) {
      // Margin call resolved
    }

    return { position, margin: result };
  }

  deposit(accountId, amount) {
    const account = this.accounts.get(accountId);
    if (!account) {
      return null;
    }

    account.cashBalance += amount;
    return account.calculate();
  }

  withdraw(accountId, amount) {
    const account = this.accounts.get(accountId);
    if (!account) {
      return null;
    }

    // Check if withdrawal would cause margin breach
    account.cashBalance -= amount;
    const result = account.calculate();

    if (result.marginCall) {
      account.cashBalance += amount; // Revert
      return { error: 'Insufficient margin for withdrawal' };
    }

    return result;
  }

  setMarginRates(initial, maintenance) {
    this.marginRates.initial = initial;
    this.marginRates.maintenance = maintenance;
  }

  getStats() {
    return {
      ...this.stats,
      totalAccounts: this.accounts.size,
      totalPositions: Array.from(this.accounts.values()).reduce((sum, a) => sum + a.positions.length, 0)
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Margin Demo\n');

  const manager = new MarginManager();

  // Create account
  console.log('1. Creating Account:');
  const account = manager.createAccount('ACC-001', 100000);
  console.log(`   Account ID: ${account.accountId}`);
  console.log(`   Cash Balance: $${account.cashBalance.toLocaleString()}`);

  // Open position
  console.log('\n2. Opening Long Position:');
  const pos1 = manager.openPosition('ACC-001', {
    instrument: 'AAPL',
    quantity: 100,
    entryPrice: 150,
    currentPrice: 150,
    side: 'long'
  });
  console.log(`   Instrument: ${pos1.position.instrument}`);
  console.log(`   Quantity: ${pos1.position.quantity}`);
  console.log(`   Entry Price: $${pos1.position.entryPrice}`);
  console.log(`   Initial Margin: $${pos1.margin.marginUsed.toFixed(2)}`);

  // Open another position
  console.log('\n3. Opening Short Position:');
  const pos2 = manager.openPosition('ACC-001', {
    instrument: 'TSLA',
    quantity: 50,
    entryPrice: 200,
    currentPrice: 200,
    side: 'short'
  });
  console.log(`   Instrument: ${pos2.position.instrument}`);
  console.log(`   Side: ${pos2.position.side}`);
  console.log(`   Total Margin Used: $${pos2.margin.marginUsed.toFixed(2)}`);

  // Check margin status
  console.log('\n4. Margin Status:');
  const margin = account.calculate();
  console.log(`   Total Equity: $${margin.totalEquity.toLocaleString()}`);
  console.log(`   Margin Used: $${margin.marginUsed.toFixed(2)}`);
  console.log(`   Excess Margin: $${margin.marginExcess.toFixed(2)}`);
  console.log(`   Margin Call: ${margin.marginCall ? 'YES' : 'NO'}`);

  // Update price (loss)
  console.log('\n5. Price Update (Loss):');
  manager.updatePositionPrice('ACC-001', pos1.position.id, 100);
  const updatedMargin = account.calculate();
  console.log(`   AAPL Price: $100`);
  console.log(`   Unrealized P&L: $${pos1.position.getUnrealizedPnL().toFixed(2)}`);
  console.log(`   Margin Call: ${updatedMargin.marginCall ? 'YES' : 'NO'}`);

  // Deposit to cover
  console.log('\n6. Depositing Funds:');
  manager.deposit('ACC-001', 50000);
  const afterDeposit = account.calculate();
  console.log(`   New Cash Balance: $${account.cashBalance.toLocaleString()}`);
  console.log(`   Margin Call: ${afterDeposit.marginCall ? 'YES' : 'NO'}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Margin Calls Issued: ${stats.marginCallsIssued}`);
  console.log(`   Positions Opened: ${stats.positionsOpened}`);
  console.log(`   Positions Closed: ${stats.positionsClosed}`);
  console.log(`   Total Accounts: ${stats.totalAccounts}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new MarginManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Margin Module');
  console.log('Usage: node agent-margin.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
