/**
 * Agent Backup Manager
 * Manages backup and restore operations for agent state and data
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class BackupManager {
  constructor(options = {}) {
    this.backupDir = options.backupDir || './backups';
    this.maxBackups = options.maxBackups || 10;
    this.compression = options.compression || false;
    this.encrypted = options.encrypted || false;
    this.encryptionKey = options.encryptionKey || null;
    this.backups = new Map();
    this.scheduledBackups = new Map();
    this._ensureBackupDir();
  }

  _ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  _generateBackupId() {
    return `backup_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  _encrypt(data) {
    if (!this.encrypted || !this.encryptionKey) return data;
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return { iv: iv.toString('hex'), data: encrypted };
  }

  _decrypt(encryptedData) {
    if (!this.encrypted || !this.encryptionKey) return encryptedData;
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }

  async createBackup(agentId, data, metadata = {}) {
    const backupId = this._generateBackupId();
    const timestamp = new Date().toISOString();

    const backupData = {
      backupId,
      agentId,
      timestamp,
      data,
      metadata,
      version: '1.0'
    };

    const finalData = this._encrypt(backupData);
    const backupPath = path.join(this.backupDir, `${backupId}.json`);

    fs.writeFileSync(backupPath, JSON.stringify(finalData, null, 2));

    const backupInfo = {
      backupId,
      agentId,
      timestamp,
      path: backupPath,
      size: fs.statSync(backupPath).size,
      metadata
    };

    this.backups.set(backupId, backupInfo);
    await this._cleanupOldBackups(agentId);

    console.log(`Backup created: ${backupId} for agent ${agentId}`);
    return backupInfo;
  }

  async _cleanupOldBackups(agentId) {
    const agentBackups = Array.from(this.backups.values())
      .filter(b => b.agentId === agentId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (agentBackups.length > this.maxBackups) {
      const toDelete = agentBackups.slice(this.maxBackups);
      for (const backup of toDelete) {
        if (fs.existsSync(backup.path)) {
          fs.unlinkSync(backup.path);
        }
        this.backups.delete(backup.backupId);
      }
    }
  }

  async restoreBackup(backupId) {
    const backupInfo = this.backups.get(backupId);
    if (!backupInfo) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    const backupPath = backupInfo.path;
    const rawData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

    const backupData = this._decrypt(rawData);
    return {
      backupId: backupData.backupId,
      agentId: backupData.agentId,
      timestamp: backupData.timestamp,
      data: backupData.data,
      metadata: backupData.metadata
    };
  }

  async listBackups(agentId = null) {
    const backups = Array.from(this.backups.values());
    if (agentId) {
      return backups.filter(b => b.agentId === agentId)
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    }
    return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  async deleteBackup(backupId) {
    const backupInfo = this.backups.get(backupId);
    if (!backupInfo) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    if (fs.existsSync(backupInfo.path)) {
      fs.unlinkSync(backupInfo.path);
    }
    this.backups.delete(backupId);
    console.log(`Backup deleted: ${backupId}`);
    return { success: true, backupId };
  }

  async scheduleBackup(agentId, intervalMs, dataProvider) {
    const scheduleId = `schedule_${agentId}_${Date.now()}`;

    const schedule = {
      scheduleId,
      agentId,
      intervalMs,
      dataProvider,
      active: true,
      lastRun: null,
      nextRun: new Date(Date.now() + intervalMs)
    };

    this.scheduledBackups.set(scheduleId, schedule);

    const runScheduledBackup = async () => {
      const sched = this.scheduledBackups.get(scheduleId);
      if (!sched || !sched.active) return;

      try {
        const data = await sched.dataProvider();
        await this.createBackup(sched.agentId, data, { scheduled: true });
        sched.lastRun = new Date();
        sched.nextRun = new Date(Date.now() + sched.intervalMs);
        console.log(`Scheduled backup completed for agent ${sched.agentId}`);
      } catch (error) {
        console.error(`Scheduled backup failed: ${error.message}`);
      }

      if (sched.active) {
        setTimeout(runScheduledBackup, sched.intervalMs);
      }
    };

    setTimeout(runScheduledBackup, intervalMs);
    console.log(`Scheduled backup created: ${scheduleId} for agent ${agentId}`);
    return schedule;
  }

  async cancelScheduledBackup(scheduleId) {
    const schedule = this.scheduledBackups.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }
    schedule.active = false;
    this.scheduledBackups.delete(scheduleId);
    console.log(`Scheduled backup cancelled: ${scheduleId}`);
    return { success: true, scheduleId };
  }

  async createIncrementalBackup(agentId, data, baseBackupId = null) {
    let baseData = null;
    if (baseBackupId) {
      const baseBackup = await this.restoreBackup(baseBackupId);
      baseData = baseBackup.data;
    }

    const incrementalData = {
      baseTimestamp: baseData ? new Date().toISOString() : null,
      changes: this._calculateChanges(baseData, data),
      fullData: data
    };

    return this.createBackup(agentId, incrementalData, { incremental: true });
  }

  _calculateChanges(base, current) {
    if (!base) return { full: true, data: current };

    const changes = {};
    const allKeys = new Set([...Object.keys(base), ...Object.keys(current)]);

    for (const key of allKeys) {
      if (JSON.stringify(base[key]) !== JSON.stringify(current[key])) {
        changes[key] = { old: base[key], new: current[key] };
      }
    }

    return { full: Object.keys(changes).length === 0, changes };
  }

  async restoreIncrementalBackup(backupId) {
    const backup = await this.restoreBackup(backupId);
    const data = backup.data;

    if (!data.baseTimestamp) {
      return data.fullData;
    }

    const baseBackups = Array.from(this.backups.values())
      .filter(b => b.agentId === backup.agentId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    let baseData = null;
    for (const b of baseBackups) {
      if (b.timestamp === data.baseTimestamp) {
        const base = await this.restoreBackup(b.backupId);
        baseData = base.data.fullData || base.data;
        break;
      }
    }

    if (!baseData) {
      return data.fullData;
    }

    const merged = { ...baseData };
    if (data.changes && !data.changes.full) {
      for (const [key, change] of Object.entries(data.changes)) {
        merged[key] = change.new;
      }
    }

    return merged;
  }

  async getBackupStatus(backupId) {
    const backupInfo = this.backups.get(backupId);
    if (!backupInfo) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    const stats = fs.statSync(backupInfo.path);
    return {
      backupId: backupInfo.backupId,
      agentId: backupInfo.agentId,
      timestamp: backupInfo.timestamp,
      size: stats.size,
      path: backupInfo.path,
      metadata: backupInfo.metadata
    };
  }

  async verifyBackup(backupId) {
    const backupInfo = this.backups.get(backupId);
    if (!backupInfo) {
      return { valid: false, error: 'Backup not found' };
    }

    try {
      const rawData = JSON.parse(fs.readFileSync(backupInfo.path, 'utf8'));
      const decrypted = this._decrypt(rawData);
      return {
        valid: true,
        backupId,
        agentId: decrypted.agentId,
        timestamp: decrypted.timestamp
      };
    } catch (error) {
      return { valid: false, error: error.message };
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const backupManager = new BackupManager({
    backupDir: './agent_backups',
    maxBackups: 5
  });

  switch (command) {
    case 'create':
      const agentId = args[1] || 'agent-001';
      const testData = {
        state: { status: 'running', tasks: 5 },
        config: { timeout: 30000, retries: 3 },
        memory: { keys: 100, size: '1.2MB' }
      };
      const backup = await backupManager.createBackup(agentId, testData);
      console.log('Backup created:', backup);
      break;

    case 'list':
      const backups = await backupManager.listBackups();
      console.log('Available backups:', backups);
      break;

    case 'restore':
      const backupIdToRestore = args[1];
      if (!backupIdToRestore) {
        console.log('Usage: node agent-backup.js restore <backup-id>');
        process.exit(1);
      }
      const restored = await backupManager.restoreBackup(backupIdToRestore);
      console.log('Restored data:', restored);
      break;

    case 'delete':
      const backupIdToDelete = args[1];
      if (!backupIdToDelete) {
        console.log('Usage: node agent-backup.js delete <backup-id>');
        process.exit(1);
      }
      await backupManager.deleteBackup(backupIdToDelete);
      console.log('Backup deleted');
      break;

    case 'verify':
      const backupIdToVerify = args[1];
      if (!backupIdToVerify) {
        console.log('Usage: node agent-backup.js verify <backup-id>');
        process.exit(1);
      }
      const verification = await backupManager.verifyBackup(backupIdToVerify);
      console.log('Verification result:', verification);
      break;

    case 'schedule':
      const schedAgentId = args[1] || 'agent-001';
      const schedule = await backupManager.scheduleBackup(
        schedAgentId,
        60000,
        async () => ({
          state: { status: 'running', timestamp: new Date().toISOString() }
        })
      );
      console.log('Scheduled backup:', schedule);
      break;

    case 'demo':
      console.log('=== Agent Backup Manager Demo ===\n');

      // Create backup
      console.log('1. Creating backup...');
      const demoBackup = await backupManager.createBackup('agent-demo', {
        state: { status: 'active', version: '1.0.0' },
        config: { maxRetries: 3, timeout: 5000 }
      });
      console.log('   Created:', demoBackup.backupId);

      // List backups
      console.log('\n2. Listing backups...');
      const allBackups = await backupManager.listBackups();
      console.log('   Total backups:', allBackups.length);

      // Verify backup
      console.log('\n3. Verifying backup...');
      const verified = await backupManager.verifyBackup(demoBackup.backupId);
      console.log('   Valid:', verified.valid);

      // Restore backup
      console.log('\n4. Restoring backup...');
      const restoredData = await backupManager.restoreBackup(demoBackup.backupId);
      console.log('   Restored agentId:', restoredData.agentId);
      console.log('   Restored data:', JSON.stringify(restoredData.data, null, 2));

      // Create incremental backup
      console.log('\n5. Creating incremental backup...');
      const incrBackup = await backupManager.createIncrementalBackup(
        'agent-demo',
        { state: { status: 'active', version: '1.0.1' }, config: { maxRetries: 5 } },
        demoBackup.backupId
      );
      console.log('   Incremental backup:', incrBackup.backupId);

      // Delete backup
      console.log('\n6. Deleting incremental backup...');
      await backupManager.deleteBackup(incrBackup.backupId);
      console.log('   Deleted:', incrBackup.backupId);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-backup.js <command> [args]');
      console.log('\nCommands:');
      console.log('  create [agent-id]     Create a backup');
      console.log('  list                   List all backups');
      console.log('  restore <backup-id>    Restore a backup');
      console.log('  delete <backup-id>    Delete a backup');
      console.log('  verify <backup-id>     Verify backup integrity');
      console.log('  schedule [agent-id]    Schedule recurring backups');
      console.log('  demo                   Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = BackupManager;
