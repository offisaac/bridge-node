/**
 * Agent Points - Point System Module
 *
 * Manages points accumulation, redemption, and transactions.
 *
 * Usage: node agent-points.js [command]
 */

class PointsSystem {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.currency = config.currency || 'points';
    this.exchangeRate = config.exchangeRate || 100; // points per unit
    this.isActive = config.isActive !== false;
  }
}

class PointTransaction {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.type = config.type; // earned, redeemed, bonus, adjustment
    this.amount = config.amount;
    this.description = config.description || '';
    this.referenceId = config.referenceId || null;
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
  }
}

class Reward {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description || '';
    this.category = config.category; // gift, voucher, time_off, equipment
    this.pointsCost = config.pointsCost;
    this.stock = config.stock || -1; // -1 = unlimited
    this.isActive = config.isActive !== false;
  }
}

class PointsManager {
  constructor() {
    this.employees = new Map();
    this.transactions = new Map();
    this.rewards = new Map();
    this._initializeSampleData();
  }

  _initializeSampleData() {
    const employees = [
      { id: 'EMP001', name: 'Alice Johnson' },
      { id: 'EMP002', name: 'Bob Williams' },
      { id: 'EMP003', name: 'Carol Davis' }
    ];
    employees.forEach(e => this.employees.set(e.id, { ...e, balance: Math.floor(Math.random() * 1000) + 500 }));

    const rewards = [
      { name: 'Gift Card $10', category: 'voucher', pointsCost: 100 },
      { name: 'Extra PTO Hour', category: 'time_off', pointsCost: 50 },
      { name: 'Premium Coffee', category: 'gift', pointsCost: 25 },
      { name: 'Wireless Mouse', category: 'equipment', pointsCost: 200 },
      { name: 'Team Lunch', category: 'gift', pointsCost: 150 }
    ];
    rewards.forEach((r, i) => {
      this.rewards.set(`reward-${i + 1}`, new Reward({ ...r, id: `reward-${i + 1}` }));
    });
  }

  earnPoints(employeeId, amount, description, referenceId = null) {
    const emp = this.employees.get(employeeId);
    if (!emp) throw new Error('Employee not found');

    emp.balance += amount;
    const tx = new PointTransaction({ employeeId, type: 'earned', amount, description, referenceId });
    this.transactions.set(tx.id, tx);
    return { employee: emp, transaction: tx };
  }

  redeemPoints(employeeId, rewardId) {
    const emp = this.employees.get(employeeId);
    const reward = this.rewards.get(rewardId);
    if (!emp) throw new Error('Employee not found');
    if (!reward) throw new Error('Reward not found');
    if (emp.balance < reward.pointsCost) throw new Error('Insufficient points');
    if (reward.stock === 0) throw new Error('Reward out of stock');

    emp.balance -= reward.pointsCost;
    if (reward.stock > 0) reward.stock--;
    const tx = new PointTransaction({ employeeId, type: 'redeemed', amount: -reward.pointsCost, description: reward.name });
    this.transactions.set(tx.id, tx);
    return { employee: emp, reward, transaction: tx };
  }

  getBalance(employeeId) {
    return this.employees.get(employeeId)?.balance || 0;
  }

  getTransactions(employeeId = null, limit = 10) {
    let txs = Array.from(this.transactions.values());
    if (employeeId) txs = txs.filter(t => t.employeeId === employeeId);
    return txs.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }

  listRewards() {
    return Array.from(this.rewards.values()).filter(r => r.isActive);
  }
}

function runDemo() {
  console.log('=== Agent Points Demo\n');
  const mgr = new PointsManager();

  console.log('1. Balances:');
  mgr.employees.forEach((e, id) => console.log(`   ${e.name}: ${e.balance} pts`));

  console.log('\n2. Earn Points:');
  const earned = mgr.earnPoints('EMP001', 100, 'Task completion bonus');
  console.log(`   ${earned.employee.name} earned 100 pts`);

  console.log('\n3. Rewards:');
  mgr.listRewards().forEach(r => console.log(`   ${r.name}: ${r.pointsCost} pts`));

  console.log('\n4. Redeem:');
  try {
    const redeemed = mgr.redeemPoints('EMP001', 'reward-3');
    console.log(`   Redeemed: ${redeemed.reward.name}`);
  } catch (e) {
    console.log(`   ${e.message}`);
  }

  console.log('\n5. Transactions:');
  mgr.getTransactions('EMP001').forEach(t => console.log(`   ${t.type}: ${t.amount} - ${t.description}`));

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new PointsManager();

if (command === 'demo') runDemo();
else if (command === 'list') mgr.listRewards().forEach(r => console.log(`${r.name}: ${r.pointsCost} pts`));
else console.log('Usage: node agent-points.js [demo|list]');
