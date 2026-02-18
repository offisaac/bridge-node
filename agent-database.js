/**
 * Agent Database - Generic Database Agent
 *
 * Manages database connections, pooling, and generic database operations.
 *
 * Usage: node agent-database.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   pools      - List connection pools
 *   stats      - Show database statistics
 */

class ConnectionPool {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type; // mysql, postgresql, mongodb, redis
    this.maxConnections = config.maxConnections || 10;
    this.activeConnections = config.activeConnections || 0;
    this.idleConnections = config.idleConnections || 0;
    this.waitingRequests = config.waitingRequests || 0;
    this.createdAt = config.createdAt || new Date().toISOString();
    this.lastUsed = config.lastUsed || new Date().toISOString();
  }
}

class DatabaseAgent {
  constructor() {
    this.pools = new Map();
    this.queries = [];
    this.transactions = [];
    this.stats = { queries: 0, transactions: 0, connections: 0 };
    this._initSampleData();
  }

  _initSampleData() {
    const pools = [
      { name: 'primary-mysql', type: 'mysql', maxConnections: 20, activeConnections: 8, idleConnections: 12 },
      { name: 'replica-mysql', type: 'mysql', maxConnections: 15, activeConnections: 3, idleConnections: 12 },
      { name: 'primary-postgres', type: 'postgresql', maxConnections: 25, activeConnections: 15, idleConnections: 10 },
      { name: 'analytics-postgres', type: 'postgresql', maxConnections: 50, activeConnections: 25, idleConnections: 25 },
      { name: 'user-mongodb', type: 'mongodb', maxConnections: 30, activeConnections: 12, idleConnections: 18 },
      { name: 'cache-redis', type: 'redis', maxConnections: 50, activeConnections: 20, idleConnections: 30 }
    ];

    pools.forEach(p => {
      const pool = new ConnectionPool(p);
      this.pools.set(pool.id, pool);
    });
  }

  getPools(filter = {}) {
    let pools = Array.from(this.pools.values());

    if (filter.type) {
      pools = pools.filter(p => p.type === filter.type);
    }
    if (filter.name) {
      pools = pools.filter(p => p.name.includes(filter.name));
    }

    return pools;
  }

  getPoolStats(poolId) {
    const pool = this.pools.get(poolId);
    if (!pool) return null;

    return {
      name: pool.name,
      type: pool.type,
      max: pool.maxConnections,
      active: pool.activeConnections,
      idle: pool.idleConnections,
      utilization: ((pool.activeConnections / pool.maxConnections) * 100).toFixed(2)
    };
  }

  executeQuery(poolName, query) {
    this.stats.queries++;
    const pool = Array.from(this.pools.values()).find(p => p.name === poolName);

    if (!pool) {
      return { success: false, error: 'Pool not found' };
    }

    const result = {
      success: true,
      pool: poolName,
      query: query.substring(0, 50) + '...',
      rows: Math.floor(Math.random() * 100),
      time: (Math.random() * 100).toFixed(2) + 'ms'
    };

    pool.activeConnections++;
    pool.idleConnections--;
    pool.lastUsed = new Date().toISOString();

    return result;
  }

  beginTransaction(poolName) {
    this.stats.transactions++;
    const tx = {
      id: crypto.randomUUID(),
      pool: poolName,
      status: 'active',
      started: new Date().toISOString()
    };
    this.transactions.push(tx);
    return tx;
  }

  commitTransaction(txId) {
    const tx = this.transactions.find(t => t.id === txId);
    if (tx) {
      tx.status = 'committed';
      tx.committed = new Date().toISOString();
      return { success: true, tx: txId };
    }
    return { success: false, error: 'Transaction not found' };
  }

  rollbackTransaction(txId) {
    const tx = this.transactions.find(t => t.id === txId);
    if (tx) {
      tx.status = 'rolled_back';
      tx.rolledBack = new Date().toISOString();
      return { success: true, tx: txId };
    }
    return { success: false, error: 'Transaction not found' };
  }

  getStats() {
    const totalActive = Array.from(this.pools.values()).reduce((sum, p) => sum + p.activeConnections, 0);
    const totalMax = Array.from(this.pools.values()).reduce((sum, p) => sum + p.maxConnections, 0);

    return {
      ...this.stats,
      totalPools: this.pools.size,
      activeConnections: totalActive,
      maxConnections: totalMax,
      utilization: ((totalActive / totalMax) * 100).toFixed(2),
      activeTransactions: this.transactions.filter(t => t.status === 'active').length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const db = new DatabaseAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Database Demo\n');

    // 1. List pools
    console.log('1. Connection Pools:');
    const pools = db.getPools();
    console.log(`   Total: ${pools.length}`);
    pools.slice(0, 5).forEach(p => {
      console.log(`   - ${p.name} (${p.type}): ${p.activeConnections}/${p.maxConnections} active`);
    });

    // 2. Pools by type
    console.log('\n2. Pools by Type:');
    ['mysql', 'postgresql', 'mongodb', 'redis'].forEach(type => {
      const typePools = db.getPools({ type });
      console.log(`   - ${type}: ${typePools.length} pool(s)`);
    });

    // 3. Execute query
    console.log('\n3. Execute Query:');
    const result = db.executeQuery('primary-mysql', 'SELECT * FROM users WHERE active = 1');
    console.log(`   Query executed: ${result.success}`);
    console.log(`   Rows: ${result.rows}, Time: ${result.time}`);

    // 4. Begin transaction
    console.log('\n4. Transaction:');
    const tx = db.beginTransaction('primary-postgres');
    console.log(`   Transaction started: ${tx.id.substring(0, 8)}`);
    const committed = db.commitTransaction(tx.id);
    console.log(`   Transaction committed: ${committed.success}`);

    // 5. Get pool stats
    console.log('\n5. Pool Statistics:');
    const primaryPool = db.getPools({ name: 'primary-mysql' })[0];
    if (primaryPool) {
      const stats = db.getPoolStats(primaryPool.id);
      console.log(`   ${stats.name}: ${stats.utilization}% utilization`);
    }

    // 6. Statistics
    console.log('\n6. Database Statistics:');
    const overallStats = db.getStats();
    console.log(`   Queries: ${overallStats.queries}`);
    console.log(`   Transactions: ${overallStats.transactions}`);
    console.log(`   Active Connections: ${overallStats.activeConnections}/${overallStats.maxConnections}`);
    console.log(`   Overall Utilization: ${overallStats.utilization}%`);
    console.log(`   Active Transactions: ${overallStats.activeTransactions}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'pools':
    console.log('Connection Pools:');
    db.getPools().forEach(p => {
      console.log(`  ${p.name}: ${p.activeConnections}/${p.maxConnections} (${p.type})`);
    });
    break;

  case 'stats':
    const s = db.getStats();
    console.log('Database Stats:');
    console.log(`  Total Pools: ${s.totalPools}`);
    console.log(`  Queries: ${s.queries}`);
    console.log(`  Transactions: ${s.transactions}`);
    console.log(`  Utilization: ${s.utilization}%`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-database.js [demo|pools|stats]');
}
