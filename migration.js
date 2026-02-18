/**
 * Database Migration Tool - 数据库迁移工具
 * 支持 Schema 版本管理和自动化迁移
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ========== Migration Types ==========

const MigrationType = {
  UP: 'up',
  DOWN: 'down'
};

const MigrationStatus = {
  PENDING: 'pending',
  APPLIED: 'applied',
  FAILED: 'failed',
  ROLLED_BACK: 'rolled_back'
};

// ========== Migration ==========

class Migration {
  constructor(id, name, up, down) {
    this.id = id;
    this.name = name;
    this.up = up;
    this.down = down;
    this.appliedAt = null;
    this.status = MigrationStatus.PENDING;
  }

  static parse(filename) {
    // Format: 001_create_users.js - extract just the basename
    const basename = path.basename(filename);
    const match = basename.match(/^(\d+)_(.+)\.js$/);
    if (!match) return null;

    const id = parseInt(match[1], 10);
    const name = match[2];

    const content = fs.readFileSync(filename, 'utf8');

    // Extract up and down functions - handle arrow functions and async
    const upMatch = content.match(/exports\.up\s*=\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\};/);
    const downMatch = content.match(/exports\.down\s*=\s*async\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\};/);

    const up = upMatch ? upMatch[1].trim() : '';
    const down = downMatch ? downMatch[1].trim() : '';

    return new Migration(id, name, up, down);
  }
}

// ========== Migration Runner ==========

class MigrationRunner {
  constructor(options = {}) {
    this.migrationsDir = options.migrationsDir || './migrations';
    this.tableName = options.tableName || '_migrations';
    this.db = options.db || null; // Database connection

    this.migrations = [];
    this.appliedMigrations = new Map(); // id -> Migration
  }

  // ========== Migration Discovery ==========

  discover() {
    if (!fs.existsSync(this.migrationsDir)) {
      fs.mkdirSync(this.migrationsDir, { recursive: true });
      console.log(`Created migrations directory: ${this.migrationsDir}`);
      return [];
    }

    const files = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.js') && !f.startsWith('_'))
      .sort();

    this.migrations = files
      .map(f => Migration.parse(path.join(this.migrationsDir, f)))
      .filter(m => m !== null)
      .sort((a, b) => a.id - b.id);

    console.log(`Discovered ${this.migrations.length} migrations`);
    return this.migrations;
  }

  // ========== Migration Creation ==========

  create(name) {
    const id = this._getNextId();
    const filename = path.join(this.migrationsDir, `${String(id).padStart(3, '0')}_${name}.js`);

    const template = `exports.up = async (db) => {
  // TODO: Implement migration up
  // await db.query(\`CREATE TABLE example (id SERIAL PRIMARY KEY)\`);
};

exports.down = async (db) => {
  // TODO: Implement migration down
  // await db.query(\`DROP TABLE example\`);
};
`;

    fs.writeFileSync(filename, template);
    console.log(`Created migration: ${filename}`);

    return filename;
  }

  _getNextId() {
    // Get max ID from existing migration files
    const fs = require('fs');
    if (!fs.existsSync(this.migrationsDir)) return 1;

    const files = fs.readdirSync(this.migrationsDir)
      .filter(f => f.match(/^(\d+)_/))
      .map(f => parseInt(f.match(/^(\d+)_/)[1], 10));

    if (files.length === 0) return 1;
    return Math.max(...files) + 1;
  }

  // ========== Database Operations ==========

  async initialize() {
    if (!this.db) {
      console.warn('No database connection, using file-based tracking');
      return this._loadFromFile();
    }

    // Create migrations table
    const sql = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id INTEGER PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        status VARCHAR(50) DEFAULT 'applied'
      )
    `;

    try {
      await this.db.query(sql);
    } catch (e) {
      console.warn('Could not initialize DB table:', e.message);
    }

    await this._loadFromDB();
  }

  async _loadFromDB() {
    if (!this.db) return;

    try {
      const result = await this.db.query(`SELECT * FROM ${this.tableName} ORDER BY id`);
      for (const row of result.rows || []) {
        const migration = new Migration(row.id, row.name, '', '');
        migration.appliedAt = row.applied_at;
        migration.status = row.status;
        this.appliedMigrations.set(row.id, migration);
      }
    } catch (e) {
      console.warn('Could not load migrations:', e.message);
    }
  }

  _loadFromFile() {
    const trackingFile = path.join(this.migrationsDir, '_applied.json');
    if (fs.existsSync(trackingFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(trackingFile, 'utf8'));
        for (const [id, m] of Object.entries(data)) {
          const migration = new Migration(parseInt(id), m.name, '', '');
          migration.appliedAt = m.appliedAt;
          migration.status = m.status;
          this.appliedMigrations.set(parseInt(id), migration);
        }
      } catch (e) {
        console.warn('Could not load tracking file:', e.message);
      }
    }
  }

  _saveToFile() {
    const trackingFile = path.join(this.migrationsDir, '_applied.json');
    const data = {};
    for (const [id, m] of this.appliedMigrations) {
      data[id] = {
        name: m.name,
        appliedAt: m.appliedAt,
        status: m.status
      };
    }
    fs.writeFileSync(trackingFile, JSON.stringify(data, null, 2));
  }

  // ========== Migration Execution ==========

  async migrate(options = {}) {
    const { direction = 'up', target = null, dryRun = false } = options;

    await this.initialize();

    const pending = this._getPendingMigrations(target);

    if (pending.length === 0) {
      console.log('No pending migrations');
      return { applied: 0, skipped: 0 };
    }

    console.log(`Found ${pending.length} pending migrations`);

    let applied = 0;
    let skipped = 0;

    for (const migration of pending) {
      if (dryRun) {
        console.log(`[DRY RUN] Would ${direction === 'up' ? 'apply' : 'rollback'}: ${migration.id}_${migration.name}`);
        continue;
      }

      try {
        if (direction === 'up') {
          await this._applyMigration(migration);
        } else {
          await this._rollbackMigration(migration);
        }
        applied++;
      } catch (error) {
        console.error(`Migration ${migration.id} failed:`, error.message);
        migration.status = MigrationStatus.FAILED;

        if (!options.force) {
          break;
        }
        skipped++;
      }
    }

    if (!dryRun && this.db) {
      await this._saveToDB();
    } else if (!dryRun) {
      this._saveToFile();
    }

    return { applied, skipped, failed: pending.length - applied - skipped };
  }

  async _applyMigration(migration) {
    console.log(`Applying: ${migration.id}_${migration.name}`);

    if (this.db && migration.up) {
      // Execute SQL directly if it's raw SQL
      if (migration.up.includes('CREATE TABLE') || migration.up.includes('ALTER TABLE')) {
        await this.db.query(migration.up);
      }
    }

    migration.status = MigrationStatus.APPLIED;
    migration.appliedAt = new Date().toISOString();
    this.appliedMigrations.set(migration.id, migration);

    console.log(`Applied: ${migration.id}_${migration.name}`);
  }

  async _rollbackMigration(migration) {
    console.log(`Rolling back: ${migration.id}_${migration.name}`);

    if (this.db && migration.down) {
      if (migration.down.includes('DROP TABLE')) {
        await this.db.query(migration.down);
      }
    }

    migration.status = MigrationStatus.ROLLED_BACK;
    migration.appliedAt = null;
    this.appliedMigrations.delete(migration.id);

    console.log(`Rolled back: ${migration.id}_${migration.name}`);
  }

  _getPendingMigrations(target = null) {
    const pending = [];

    for (const migration of this.migrations) {
      const applied = this.appliedMigrations.has(migration.id);

      if (!applied && (!target || migration.id <= target)) {
        pending.push(migration);
      }
    }

    return pending;
  }

  // ========== Status ==========

  getStatus() {
    const applied = Array.from(this.appliedMigrations.values())
      .filter(m => m.status === MigrationStatus.APPLIED);

    const pending = this._getPendingMigrations();
    const failed = Array.from(this.appliedMigrations.values())
      .filter(m => m.status === MigrationStatus.FAILED);

    return {
      total: this.migrations.length,
      applied: applied.length,
      pending: pending.length,
      failed: failed.length
    };
  }

  // ========== Reset ==========

  async reset(options = {}) {
    const { force = false } = options;

    if (!force) {
      console.log('This will rollback ALL migrations. Use --force to confirm.');
      return;
    }

    console.log('Resetting database...');

    const applied = Array.from(this.appliedMigrations.values())
      .filter(m => m.status === MigrationStatus.APPLIED)
      .sort((a, b) => b.id - a.id); // Reverse order for rollback

    for (const migration of applied) {
      try {
        await this._rollbackMigration(migration);
      } catch (error) {
        console.error(`Rollback failed:`, error.message);
      }
    }

    this._saveToFile();
    console.log('Database reset complete');
  }
}

// ========== CLI ==========

function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0];

  const runner = new MigrationRunner({
    migrationsDir: args.find(a => a.startsWith('--dir='))?.split('=')[1] || './migrations'
  });

  runner.discover();

  switch (command) {
    case 'create':
      const name = args[1] || 'new_migration';
      runner.create(name);
      break;

    case 'migrate':
      runner.migrate({
        dryRun: args.includes('--dry-run'),
        force: args.includes('--force')
      }).then(r => console.log('Result:', r));
      break;

    case 'rollback':
      runner.migrate({
        direction: 'down',
        force: args.includes('--force')
      }).then(r => console.log('Result:', r));
      break;

    case 'status':
      runner.initialize().then(() => {
        console.log('Status:', runner.getStatus());
      });
      break;

    case 'reset':
      runner.reset({ force: args.includes('--force') });
      break;

    default:
      console.log(`
Database Migration Tool

Usage:
  node migration.js create <name>     Create a new migration
  node migration.js migrate           Run pending migrations
  node migration.js rollback          Rollback last migration
  node migration.js status            Show migration status
  node migration.js reset            Reset all migrations (dangerous)

Options:
  --dir=<path>    Migrations directory
  --dry-run       Show what would happen
  --force         Force operation
      `);
  }
}

// ========== Export ==========

module.exports = {
  Migration,
  MigrationRunner,
  MigrationType,
  MigrationStatus
};

// Run CLI if called directly
if (require.main === module) {
  runCLI();
}
