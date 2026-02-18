/**
 * Agent SQL - SQL Query Agent
 *
 * Manages SQL query building, execution, and optimization.
 *
 * Usage: node agent-sql.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   build      - Build sample queries
 *   optimize   - Show query optimization
 */

class QueryBuilder {
  constructor() {
    this.queries = [];
  }

  select(table, columns = ['*'], conditions = {}) {
    const cols = columns.join(', ');
    let sql = `SELECT ${cols} FROM ${table}`;

    const whereClauses = Object.entries(conditions).map(([key, value]) => {
      if (typeof value === 'string') return `${key} = '${value}'`;
      if (typeof value === 'number') return `${key} = ${value}`;
      return `${key} = ${value}`;
    });

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    this.queries.push(sql);
    return sql;
  }

  insert(table, data) {
    const columns = Object.keys(data).join(', ');
    const values = Object.values(data).map(v =>
      typeof v === 'string' ? `'${v}'` : v
    ).join(', ');

    const sql = `INSERT INTO ${table} (${columns}) VALUES (${values})`;
    this.queries.push(sql);
    return sql;
  }

  update(table, data, conditions) {
    const setClauses = Object.entries(data).map(([key, value]) => {
      if (typeof value === 'string') return `${key} = '${value}'`;
      return `${key} = ${value}`;
    });

    let sql = `UPDATE ${table} SET ${setClauses.join(', ')}`;

    const whereClauses = Object.entries(conditions).map(([key, value]) => {
      if (typeof value === 'string') return `${key} = '${value}'`;
      return `${key} = ${value}`;
    });

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    this.queries.push(sql);
    return sql;
  }

  delete(table, conditions) {
    let sql = `DELETE FROM ${table}`;

    const whereClauses = Object.entries(conditions).map(([key, value]) => {
      if (typeof value === 'string') return `${key} = '${value}'`;
      return `${key} = ${value}`;
    });

    if (whereClauses.length > 0) {
      sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    this.queries.push(sql);
    return sql;
  }

  join(table1, table2, condition, type = 'INNER') {
    return `${type} JOIN ${table2} ON ${condition}`;
  }

  getQueries() {
    return this.queries;
  }

  clear() {
    this.queries = [];
  }
}

class QueryOptimizer {
  analyze(query) {
    const issues = [];
    const suggestions = [];

    if (query.includes('SELECT *')) {
      issues.push('Using SELECT * fetches unnecessary columns');
      suggestions.push('Specify exact column names');
    }

    if (!query.includes('WHERE') && !query.includes('LIMIT')) {
      issues.push('Query may return large result set');
      suggestions.push('Add WHERE clause or LIMIT');
    }

    if (query.toLowerCase().includes('like \'%')) {
      issues.push('Leading wildcard prevents index usage');
      suggestions.push('Use full-text search or reverse index');
    }

    if (query.toLowerCase().includes('order by rand()')) {
      issues.push('ORDER BY RAND() is expensive');
      suggestions.push('Use application-level randomization');
    }

    return { query, issues, suggestions, score: Math.max(0, 100 - issues.length * 25) };
  }

  explain(query) {
    return {
      type: query.trim().split(' ')[0].toUpperCase(),
      estimatedCost: Math.floor(Math.random() * 100) + 10,
      usesIndex: Math.random() > 0.3,
      tableScans: Math.random() > 0.5 ? 1 : 0
    };
  }
}

class SQLAgent {
  constructor() {
    this.builder = new QueryBuilder();
    this.optimizer = new QueryOptimizer();
    this.executedQueries = [];
  }

  buildSelect(table, columns, conditions) {
    return this.builder.select(table, columns, conditions);
  }

  buildInsert(table, data) {
    return this.builder.insert(table, data);
  }

  buildUpdate(table, data, conditions) {
    return this.builder.update(table, data, conditions);
  }

  buildDelete(table, conditions) {
    return this.builder.delete(table, conditions);
  }

  execute(query) {
    this.executedQueries.push({
      query,
      timestamp: new Date().toISOString(),
      rows: Math.floor(Math.random() * 1000)
    });

    return {
      success: true,
      query: query.substring(0, 50) + '...',
      rows: Math.floor(Math.random() * 1000),
      time: (Math.random() * 50).toFixed(2) + 'ms'
    };
  }

  optimize(query) {
    return this.optimizer.analyze(query);
  }

  explain(query) {
    return this.optimizer.explain(query);
  }

  getStats() {
    return {
      queriesBuilt: this.builder.getQueries().length,
      queriesExecuted: this.executedQueries.length,
      lastQuery: this.executedQueries[this.executedQueries.length - 1]?.query || null
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const sql = new SQLAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent SQL Demo\n');

    // 1. Build queries
    console.log('1. Query Building:');
    const selectQuery = sql.buildSelect('users', ['id', 'name', 'email'], { active: 1 });
    console.log(`   SELECT: ${selectQuery}`);

    const insertQuery = sql.buildInsert('users', { name: 'John', email: 'john@example.com', active: 1 });
    console.log(`   INSERT: ${insertQuery}`);

    const updateQuery = sql.buildUpdate('users', { name: 'Jane' }, { id: 1 });
    console.log(`   UPDATE: ${updateQuery}`);

    // 2. Execute query
    console.log('\n2. Query Execution:');
    const result = sql.execute('SELECT * FROM users WHERE active = 1');
    console.log(`   Executed: ${result.success}`);
    console.log(`   Rows: ${result.rows}, Time: ${result.time}`);

    // 3. Query optimization
    console.log('\n3. Query Optimization:');
    const optimization = sql.optimize('SELECT * FROM users WHERE name LIKE "%john%" ORDER BY RAND()');
    console.log(`   Score: ${optimization.score}/100`);
    optimization.issues.forEach(issue => console.log(`   - ${issue}`));
    optimization.suggestions.forEach(s => console.log(`   + ${s}`));

    // 4. Explain query
    console.log('\n4. Query Explain:');
    const explain = sql.explain('SELECT id, name FROM users WHERE active = 1');
    console.log(`   Type: ${explain.type}`);
    console.log(`   Cost: ${explain.estimatedCost}`);
    console.log(`   Uses Index: ${explain.usesIndex}`);

    // 5. Statistics
    console.log('\n5. Statistics:');
    const stats = sql.getStats();
    console.log(`   Queries Built: ${stats.queriesBuilt}`);
    console.log(`   Queries Executed: ${stats.queriesExecuted}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'build':
    console.log('Query Building:');
    console.log(`  SELECT: ${sql.buildSelect('products', ['*'], { category: 'electronics' })}`);
    console.log(`  INSERT: ${sql.buildInsert('orders', { user_id: 1, total: 99.99 })}`);
    console.log(`  UPDATE: ${sql.buildUpdate('users', { status: 'active' }, { id: 5 })}`);
    console.log(`  DELETE: ${sql.buildDelete('sessions', { expired: true })}`);
    break;

  case 'optimize':
    const queries = [
      'SELECT * FROM users',
      'SELECT id, name FROM users WHERE email LIKE "%gmail%"',
      'SELECT * FROM orders ORDER BY RAND()'
    ];
    queries.forEach(q => {
      const opt = sql.optimize(q);
      console.log(`\nQuery: ${q.substring(0, 40)}...`);
      console.log(`  Score: ${opt.score}/100`);
      opt.issues.forEach(i => console.log(`  Issue: ${i}`));
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-sql.js [demo|build|optimize]');
}
