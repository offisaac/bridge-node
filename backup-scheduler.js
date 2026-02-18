/**
 * Backup Scheduler - 备份调度器
 * 自动化备份调度和保留策略
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');

// ========== Backup Types ==========

const BackupType = {
  FULL: 'full',
  INCREMENTAL: 'incremental',
  DIFFERENTIAL: 'differential'
};

const BackupStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const RetentionPolicy = {
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly'
};

// ========== Backup Entry ==========

class BackupEntry {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name || `backup_${Date.now()}`;
    this.type = config.type || BackupType.FULL;
    this.source = config.source; // Source path or database connection
    this.destination = config.destination; // Destination path
    this.status = BackupStatus.PENDING;
    this.createdAt = config.createdAt || new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.size = null;
    this.checksum = null;
    this.error = null;
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      source: this.source,
      destination: this.destination,
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      size: this.size,
      checksum: this.checksum,
      error: this.error,
      metadata: this.metadata
    };
  }
}

// ========== Retention Rule ==========

class RetentionRule {
  constructor(policy, keepCount) {
    this.policy = policy;
    this.keepCount = keepCount;
  }

  shouldDelete(backupDate, now) {
    const backupTime = new Date(backupDate).getTime();
    const nowTime = new Date(now).getTime();

    switch (this.policy) {
      case RetentionPolicy.HOURLY:
        // Keep backups from the last N hours
        return nowTime - backupTime > this.keepCount * 60 * 60 * 1000;

      case RetentionPolicy.DAILY:
        // Keep backups from the last N days
        return nowTime - backupTime > this.keepCount * 24 * 60 * 60 * 1000;

      case RetentionPolicy.WEEKLY:
        // Keep backups from the last N weeks
        return nowTime - backupTime > this.keepCount * 7 * 24 * 60 * 60 * 1000;

      case RetentionPolicy.MONTHLY:
        // Keep backups from the last N months
        const backupMonth = new Date(backupDate).getMonth();
        const currentMonth = new Date(now).getMonth();
        return currentMonth - backupMonth > this.keepCount;

      case RetentionPolicy.YEARLY:
        // Keep backups from the last N years
        const backupYear = new Date(backupDate).getFullYear();
        const currentYear = new Date(now).getFullYear();
        return currentYear - backupYear > this.keepCount;

      default:
        return false;
    }
  }
}

// ========== Backup Scheduler ==========

class BackupScheduler {
  constructor(options = {}) {
    this.name = options.name || 'backup-scheduler';
    this.backupDir = options.backupDir || './backups';
    this.retentionRules = options.retentionRules || [
      new RetentionRule(RetentionPolicy.DAILY, 7),
      new RetentionRule(RetentionPolicy.WEEKLY, 4),
      new RetentionRule(RetentionPolicy.MONTHLY, 12)
    ];
    this.compression = options.compression || 'gzip';
    this.encryption = options.encryption || false;
    this.encryptionKey = options.encryptionKey || null;

    this.backups = new Map();
    this.scheduledJobs = new Map();
    this.listeners = new Map();

    this._init();
  }

  _init() {
    // Ensure backup directory exists
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }

    // Load existing backup history
    this._loadHistory();
  }

  // ========== Backup Operations ==========

  async createBackup(config = {}) {
    const id = crypto.randomUUID();
    const backup = new BackupEntry(id, {
      ...config,
      destination: config.destination || path.join(this.backupDir, `${config.name || 'backup'}_${Date.now()}.tar.gz`)
    });

    this.backups.set(id, backup);
    this._emit('backup:created', backup);

    // Run backup in background
    this._executeBackup(backup);

    return backup;
  }

  async _executeBackup(backup) {
    backup.status = BackupStatus.RUNNING;
    backup.startedAt = new Date().toISOString();
    this._emit('backup:started', backup);

    try {
      if (typeof backup.source === 'string') {
        // File system backup
        await this._backupFileSystem(backup);
      } else if (backup.source.type === 'database') {
        // Database backup
        await this._backupDatabase(backup);
      } else {
        throw new Error('Unknown backup source type');
      }

      backup.status = BackupStatus.COMPLETED;
      backup.completedAt = new Date().toISOString();
      this._emit('backup:completed', backup);
    } catch (err) {
      backup.status = BackupStatus.FAILED;
      backup.error = err.message;
      this._emit('backup:failed', backup);
    }

    this._saveHistory();
    return backup;
  }

  async _backupFileSystem(backup) {
    const { source, destination, compression } = backup;

    // Ensure destination directory exists
    const destDir = path.dirname(destination);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    // For simple file backup, copy the file
    // More complex backups can use tar
    let sourcePath = source;
    let destPath = destination;

    // If source is a directory, use tar
    const sourceStats = fs.statSync(sourcePath);
    if (sourceStats.isDirectory()) {
      const tarPath = destination.replace('.tar.gz', '').replace('.tgz', '');
      const archivePath = `${tarPath}.tar`;

      // Use tar to create archive
      execSync(`tar -cf ${archivePath} -C ${path.dirname(sourcePath)} ${path.basename(sourcePath)}`, {
        stdio: 'pipe'
      });

      // Compress if needed
      if (compression === 'gzip') {
        execSync(`gzip -f ${archivePath}`);
        destPath = `${archivePath}.gz`;
      } else {
        destPath = archivePath;
      }
    } else {
      // Single file backup - copy and optionally compress
      if (compression === 'gzip') {
        const content = fs.readFileSync(sourcePath);
        const zlib = require('zlib');
        const compressed = zlib.gzipSync(content);
        fs.writeFileSync(destPath, compressed);
      } else {
        fs.copyFileSync(sourcePath, destPath);
      }
    }

    backup.destination = destPath;

    // Calculate checksum
    const checksum = crypto.createHash('md5');
    const fileContent = fs.readFileSync(backup.destination);
    checksum.update(fileContent);
    backup.checksum = checksum.digest('hex');

    // Get file size
    const stats = fs.statSync(backup.destination);
    backup.size = stats.size;

    backup.metadata.filesBackedUp = sourceStats.isDirectory() ? 'directory' : 1;
    backup.metadata.compression = compression;
  }

  async _backupDatabase(backup) {
    const { source, destination } = backup;
    const { type, connection, database } = source;

    let cmd = '';
    let outputFile = destination;

    switch (type) {
      case 'postgresql':
        cmd = `pg_dump -h ${connection.host} -U ${connection.user} -d ${database} -f ${outputFile}`;
        break;
      case 'mysql':
        cmd = `mysqldump -h ${connection.host} -u ${connection.user} -p${connection.password} ${database} > ${outputFile}`;
        break;
      case 'mongodb':
        cmd = `mongodump --host ${connection.host} --db ${database} --out ${outputFile}`;
        break;
      default:
        throw new Error(`Unsupported database type: ${type}`);
    }

    try {
      execSync(cmd, { stdio: 'pipe' });
    } catch (err) {
      throw new Error(`Database backup failed: ${err.message}`);
    }

    // Compress the backup
    execSync(`gzip -f ${outputFile}`);
    backup.destination = `${outputFile}.gz`;

    // Calculate checksum
    const checksum = crypto.createHash('md5');
    const fileContent = fs.readFileSync(backup.destination);
    checksum.update(fileContent);
    backup.checksum = checksum.digest('hex');

    // Get file size
    const stats = fs.statSync(backup.destination);
    backup.size = stats.size;

    backup.metadata.databaseType = type;
    backup.metadata.database = database;
  }

  // ========== Restore Operations ==========

  async restoreBackup(backupId, targetPath) {
    const backup = this.backups.get(backupId);
    if (!backup) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    if (backup.status !== BackupStatus.COMPLETED) {
      throw new Error(`Backup is not in completed state: ${backup.status}`);
    }

    if (!fs.existsSync(backup.destination)) {
      throw new Error(`Backup file not found: ${backup.destination}`);
    }

    // Verify checksum
    const checksum = crypto.createHash('md5');
    const fileContent = fs.readFileSync(backup.destination);
    checksum.update(fileContent);
    const currentChecksum = checksum.digest('hex');

    if (currentChecksum !== backup.checksum) {
      throw new Error('Backup file checksum mismatch - file may be corrupted');
    }

    // Decompress if needed
    const decompressedPath = backup.destination.replace('.gz', '');
    if (backup.destination.endsWith('.gz')) {
      execSync(`gunzip -f ${backup.destination}`);
    }

    // Extract tar archive
    execSync(`tar -xf ${decompressedPath} -C ${targetPath}`);

    // Compress back if needed
    if (backup.destination.endsWith('.gz')) {
      execSync(`gzip ${decompressedPath}`);
    }

    return { success: true, backup, targetPath };
  }

  // ========== Scheduling ==========

  schedule(config) {
    const { name, cron, action } = config;

    const job = {
      id: crypto.randomUUID(),
      name,
      cron,
      action,
      enabled: true,
      lastRun: null,
      nextRun: null
    };

    this.scheduledJobs.set(job.id, job);
    this._emit('job:scheduled', job);

    return job;
  }

  unschedule(jobId) {
    const job = this.scheduledJobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    this.scheduledJobs.delete(jobId);
    this._emit('job:unscheduled', job);

    return true;
  }

  enableJob(jobId) {
    const job = this.scheduledJobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.enabled = true;
    this._emit('job:enabled', job);

    return job;
  }

  disableJob(jobId) {
    const job = this.scheduledJobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.enabled = false;
    this._emit('job:disabled', job);

    return job;
  }

  // ========== Retention Management ==========

  applyRetention() {
    const now = new Date().toISOString();
    let deletedCount = 0;

    for (const [id, backup] of this.backups) {
      if (backup.status !== BackupStatus.COMPLETED) continue;

      for (const rule of this.retentionRules) {
        if (rule.shouldDelete(backup.completedAt, now)) {
          try {
            if (fs.existsSync(backup.destination)) {
              fs.unlinkSync(backup.destination);
            }
            this.backups.delete(id);
            deletedCount++;
            this._emit('backup:deleted', backup);
            break;
          } catch (err) {
            console.error(`Failed to delete backup ${id}:`, err);
          }
        }
      }
    }

    this._saveHistory();
    return { deletedCount };
  }

  // ========== Backup List ==========

  listBackups(filters = {}) {
    let backups = Array.from(this.backups.values());

    if (filters.status) {
      backups = backups.filter(b => b.status === filters.status);
    }

    if (filters.type) {
      backups = backups.filter(b => b.type === filters.type);
    }

    if (filters.fromDate) {
      backups = backups.filter(b => new Date(b.createdAt) >= new Date(filters.fromDate));
    }

    if (filters.toDate) {
      backups = backups.filter(b => new Date(b.createdAt) <= new Date(filters.toDate));
    }

    return backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getBackup(id) {
    return this.backups.get(id);
  }

  // ========== Event System ==========

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (!this.listeners.has(event)) return;
    const callbacks = this.listeners.get(event);
    const index = callbacks.indexOf(callback);
    if (index > -1) callbacks.splice(index, 1);
  }

  _emit(event, data) {
    if (!this.listeners.has(event)) return;
    for (const callback of this.listeners.get(event)) {
      try { callback(data); } catch (err) { console.error(err); }
    }
  }

  // ========== Persistence ==========

  _loadHistory() {
    const historyFile = path.join(this.backupDir, '_backup_history.json');
    if (fs.existsSync(historyFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        for (const [id, backup] of Object.entries(data.backups || {})) {
          this.backups.set(id, new BackupEntry(id, backup));
        }
      } catch (err) {
        console.error('Failed to load backup history:', err);
      }
    }
  }

  _saveHistory() {
    const historyFile = path.join(this.backupDir, '_backup_history.json');
    const data = {
      version: '1.0',
      updatedAt: new Date().toISOString(),
      backups: Object.fromEntries(
        Array.from(this.backups.entries()).map(([id, backup]) => [id, backup.toJSON()])
      )
    };
    fs.writeFileSync(historyFile, JSON.stringify(data, null, 2));
  }

  // ========== Statistics ==========

  getStats() {
    const backups = Array.from(this.backups.values());
    const completed = backups.filter(b => b.status === BackupStatus.COMPLETED);
    const failed = backups.filter(b => b.status === BackupStatus.FAILED);

    const totalSize = completed.reduce((sum, b) => sum + (b.size || 0), 0);

    return {
      total: backups.length,
      completed: completed.length,
      failed: failed.length,
      pending: backups.filter(b => b.status === BackupStatus.PENDING).length,
      running: backups.filter(b => b.status === BackupStatus.RUNNING).length,
      totalSize,
      totalSizeFormatted: this._formatSize(totalSize)
    };
  }

  _formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// ========== Export ==========

module.exports = {
  BackupScheduler,
  BackupEntry,
  RetentionRule,
  BackupType,
  BackupStatus,
  RetentionPolicy
};
