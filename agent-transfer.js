/**
 * Agent Transfer Module
 *
 * Provides transfer agency services.
 * Usage: node agent-transfer.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show transfer stats
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
 * Transfer Type
 */
const TransferType = {
  ACH: 'ach',
  WIRE: 'wire',
  CHECK: 'check',
  INTERNAL: 'internal',
  ACH_RTP: 'ach_rtp',
  SWIFT: 'swift'
};

/**
 * Transfer Status
 */
const TransferStatus = {
  PENDING: 'pending',
  SUBMITTED: 'submitted',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETURNED: 'returned',
  CANCELLED: 'cancelled'
};

/**
 * Transfer
 */
class Transfer {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.accountId = config.accountId;
    this.type = config.type;
    this.direction = config.direction || 'outbound'; // inbound or outbound
    this.amount = config.amount;
    this.currency = config.currency || 'USD';
    this.fromAccount = config.fromAccount;
    this.toAccount = config.toAccount;
    this.status = TransferStatus.PENDING;
    this.fee = config.fee || 0;
    this.reference = config.reference || this._generateReference();
    this.description = config.description || '';
    this.metadata = config.metadata || {};
    this.createdAt = Date.now();
    this.submittedAt = null;
    this.completedAt = null;
    this.failedAt = null;
    this.failureReason = null;
    this.timeline = [{ event: 'created', timestamp: this.createdAt }];
  }

  _generateReference() {
    return `TRF-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }

  submit() {
    this.status = TransferStatus.SUBMITTED;
    this.submittedAt = Date.now();
    this.timeline.push({ event: 'submitted', timestamp: this.submittedAt });
  }

  process() {
    this.status = TransferStatus.PROCESSING;
    this.timeline.push({ event: 'processing', timestamp: Date.now() });
  }

  complete() {
    this.status = TransferStatus.COMPLETED;
    this.completedAt = Date.now();
    this.timeline.push({ event: 'completed', timestamp: this.completedAt });
  }

  fail(reason) {
    this.status = TransferStatus.FAILED;
    this.failedAt = Date.now();
    this.failureReason = reason;
    this.timeline.push({ event: 'failed', timestamp: this.failedAt, reason });
  }

  cancel() {
    if (this.status === TransferStatus.PENDING || this.status === TransferStatus.SUBMITTED) {
      this.status = TransferStatus.CANCELLED;
      this.timeline.push({ event: 'cancelled', timestamp: Date.now() });
      return true;
    }
    return false;
  }

  return(reason) {
    this.status = TransferStatus.RETURNED;
    this.timeline.push({ event: 'returned', timestamp: Date.now(), reason });
  }

  getNetAmount() {
    return this.direction === 'outbound' ? this.amount - this.fee : this.amount;
  }

  toJSON() {
    return {
      id: this.id,
      accountId: this.accountId,
      type: this.type,
      direction: this.direction,
      amount: this.amount,
      currency: this.currency,
      status: this.status,
      fee: this.fee,
      reference: this.reference,
      createdAt: this.createdAt,
      completedAt: this.completedAt
    };
  }
}

/**
 * Transfer Schedule
 */
class TransferSchedule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.frequency = config.frequency; // daily, weekly, monthly
    this.amount = config.amount;
    this.fromAccount = config.fromAccount;
    this.toAccount = config.toAccount;
    this.type = config.type || TransferType.ACH;
    this.nextRunAt = config.nextRunAt || this._calculateNextRun();
    this.enabled = config.enabled !== false;
    this.lastRunAt = null;
  }

  _calculateNextRun() {
    const now = Date.now();
    if (this.frequency === 'daily') {
      return now + 24 * 60 * 60 * 1000;
    } else if (this.frequency === 'weekly') {
      return now + 7 * 24 * 60 * 60 * 1000;
    } else if (this.frequency === 'monthly') {
      return now + 30 * 24 * 60 * 60 * 1000;
    }
    return now;
  }

  run() {
    if (!this.enabled) return null;
    this.lastRunAt = Date.now();
    this.nextRunAt = this._calculateNextRun();
    return this.lastRunAt;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }
}

/**
 * Transfer Manager
 */
class TransferManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.transfers = new Map();
    this.schedules = new Map();
    this.limits = {
      daily: config.dailyLimit || 100000,
      perTransaction: config.perTransactionLimit || 50000,
      monthly: config.monthlyLimit || 500000
    };
    this.stats = {
      transfersCreated: 0,
      transfersCompleted: 0,
      transfersFailed: 0,
      transfersCancelled: 0,
      totalVolume: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  createTransfer(transferData) {
    const transfer = new Transfer(transferData);
    this.transfers.set(transfer.id, transfer);
    this.stats.transfersCreated++;
    return transfer;
  }

  submitTransfer(transferId) {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return { error: 'Transfer not found' };
    }

    // Check limits
    const limitCheck = this._checkLimits(transfer.amount);
    if (!limitCheck.allowed) {
      transfer.fail(limitCheck.reason);
      this.stats.transfersFailed++;
      return { error: limitCheck.reason };
    }

    transfer.submit();
    return { success: true, transfer };
  }

  processTransfer(transferId) {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return { error: 'Transfer not found' };
    }

    transfer.process();
    return { success: true, transfer };
  }

  completeTransfer(transferId) {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return { error: 'Transfer not found' };
    }

    transfer.complete();
    this.stats.transfersCompleted++;
    this.stats.totalVolume += transfer.amount;
    return { success: true, transfer };
  }

  failTransfer(transferId, reason) {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return { error: 'Transfer not found' };
    }

    transfer.fail(reason);
    this.stats.transfersFailed++;
    return { success: true, transfer };
  }

  cancelTransfer(transferId) {
    const transfer = this.transfers.get(transferId);
    if (!transfer) {
      return { error: 'Transfer not found' };
    }

    const success = transfer.cancel();
    if (success) {
      this.stats.transfersCancelled++;
    }
    return { success, transfer };
  }

  _checkLimits(amount) {
    if (amount > this.limits.perTransaction) {
      return { allowed: false, reason: 'Exceeds per-transaction limit' };
    }

    // Check daily volume
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dailyVolume = this._getDailyVolume(today.getTime());

    if (dailyVolume + amount > this.limits.daily) {
      return { allowed: false, reason: 'Exceeds daily limit' };
    }

    return { allowed: true };
  }

  _getDailyVolume(since) {
    let volume = 0;
    for (const transfer of this.transfers.values()) {
      if (transfer.createdAt >= since &&
          (transfer.status === TransferStatus.COMPLETED || transfer.status === TransferStatus.SUBMITTED)) {
        volume += transfer.amount;
      }
    }
    return volume;
  }

  createSchedule(scheduleData) {
    const schedule = new TransferSchedule(scheduleData);
    this.schedules.set(schedule.id, schedule);
    return schedule;
  }

  getSchedule(scheduleId) {
    return this.schedules.get(scheduleId);
  }

  getTransfer(transferId) {
    return this.transfers.get(transferId);
  }

  getTransfersByAccount(accountId) {
    const results = [];
    for (const transfer of this.transfers.values()) {
      if (transfer.accountId === accountId) {
        results.push(transfer);
      }
    }
    return results;
  }

  getStats() {
    return {
      ...this.stats,
      totalTransfers: this.transfers.size,
      pendingTransfers: Array.from(this.transfers.values()).filter(t => t.status === TransferStatus.PENDING).length,
      scheduledTransfers: this.schedules.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Transfer Demo\n');

  const manager = new TransferManager();

  // Create transfer
  console.log('1. Creating Transfer:');
  const transfer1 = manager.createTransfer({
    accountId: 'ACC-001',
    type: TransferType.ACH,
    direction: 'outbound',
    amount: 5000,
    fromAccount: 'ACC-001 Checking',
    toAccount: 'ACC-002 Savings',
    fee: 0,
    description: 'Monthly savings transfer'
  });
  console.log(`   Transfer ID: ${transfer1.id}`);
  console.log(`   Reference: ${transfer1.reference}`);
  console.log(`   Amount: $${transfer1.amount}`);
  console.log(`   Status: ${transfer1.status}`);

  // Submit transfer
  console.log('\n2. Submitting Transfer:');
  manager.submitTransfer(transfer1.id);
  console.log(`   Status: ${transfer1.status}`);

  // Process transfer
  console.log('\n3. Processing Transfer:');
  manager.processTransfer(transfer1.id);
  console.log(`   Status: ${transfer1.status}`);

  // Complete transfer
  console.log('\n4. Completing Transfer:');
  manager.completeTransfer(transfer1.id);
  console.log(`   Status: ${transfer1.status}`);
  console.log(`   Completed At: ${new Date(transfer1.completedAt).toLocaleString()}`);

  // Create another transfer
  console.log('\n5. Creating Second Transfer:');
  const transfer2 = manager.createTransfer({
    accountId: 'ACC-001',
    type: TransferType.WIRE,
    direction: 'outbound',
    amount: 25000,
    fromAccount: 'ACC-001 Checking',
    toAccount: 'External Bank',
    fee: 25,
    description: 'Wire transfer'
  });
  console.log(`   Transfer: $${transfer2.amount} (Fee: $${transfer2.fee})`);
  console.log(`   Net Amount: $${transfer2.getNetAmount()}`);

  manager.submitTransfer(transfer2.id);
  manager.processTransfer(transfer2.id);
  manager.completeTransfer(transfer2.id);
  console.log(`   Status: ${transfer2.status}`);

  // Test limit
  console.log('\n6. Testing Transfer Limits:');
  const transfer3 = manager.createTransfer({
    accountId: 'ACC-001',
    type: TransferType.ACH,
    direction: 'outbound',
    amount: 200000,
    fromAccount: 'ACC-001',
    toAccount: 'Test',
    description: 'Over limit test'
  });
  const limitCheck = manager.submitTransfer(transfer3.id);
  console.log(`   Amount: $${transfer3.amount}`);
  console.log(`   Result: ${limitCheck.allowed ? 'Allowed' : 'Blocked'}`);
  if (!limitCheck.allowed) {
    console.log(`   Reason: ${limitCheck.reason}`);
  }

  // Create scheduled transfer
  console.log('\n7. Creating Scheduled Transfer:');
  const schedule = manager.createSchedule({
    name: 'Monthly Rent',
    frequency: 'monthly',
    amount: 1500,
    fromAccount: 'ACC-001 Checking',
    toAccount: 'Landlord Account',
    type: TransferType.ACH
  });
  console.log(`   Schedule: ${schedule.name}`);
  console.log(`   Frequency: ${schedule.frequency}`);
  console.log(`   Amount: $${schedule.amount}`);
  console.log(`   Next Run: ${new Date(schedule.nextRunAt).toLocaleString()}`);

  // Get transfers
  console.log('\n8. Account Transfers:');
  const transfers = manager.getTransfersByAccount('ACC-001');
  console.log(`   Total: ${transfers.length}`);

  // Stats
  console.log('\n9. Statistics:');
  const stats = manager.getStats();
  console.log(`   Transfers Created: ${stats.transfersCreated}`);
  console.log(`   Transfers Completed: ${stats.transfersCompleted}`);
  console.log(`   Transfers Failed: ${stats.transfersFailed}`);
  console.log(`   Total Volume: $${stats.totalVolume.toLocaleString()}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new TransferManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Transfer Module');
  console.log('Usage: node agent-transfer.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
