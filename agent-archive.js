/**
 * Agent Archive Module
 *
 * Provides data archiving with compression, retention policies, and archival storage.
 * Usage: node agent-archive.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   archive <data>       Archive data
 *   status                 Show archive stats
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';
const ARCHIVE_DIR = DATA_DIR + '/archives';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureArchiveDir() {
  ensureDataDir();
  if (!fs.existsSync(ARCHIVE_DIR)) {
    fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  }
}

/**
 * Archive Format
 */
const ArchiveFormat = {
  ZIP: 'zip',
  TAR: 'tar',
  GZIP: 'gzip',
  BZIP2: 'bzip2'
};

/**
 * Archive Status
 */
const ArchiveStatus = {
  PENDING: 'pending',
  COMPRESSING: 'compressing',
  STORED: 'stored',
  EXPIRED: 'expired',
  DELETED: 'deleted'
};

/**
 * Retention Policy
 */
class RetentionPolicy {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.duration = config.duration || 365 * 24 * 60 * 60 * 1000; // 1 year
    this.maxSize = config.maxSize || 1024 * 1024 * 1024; // 1GB
    this.maxItems = config.maxItems || 10000;
    this.compressionLevel = config.compressionLevel || 6;
    this.deleteAfterRetention = config.deleteAfterRetention !== false;
  }

  isExpired(archive) {
    const age = Date.now() - archive.createdAt;
    return age > this.duration;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      duration: this.duration,
      maxSize: this.maxSize,
      maxItems: this.maxItems,
      compressionLevel: this.compressionLevel,
      deleteAfterRetention: this.deleteAfterRetention
    };
  }
}

/**
 * Archive Entry
 */
class ArchiveEntry {
  constructor(config) {
    this.id = config.id || `archive-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.data = config.data;
    this.metadata = config.metadata || {};
    this.format = config.format || ArchiveFormat.GZIP;
    this.compressed = false;
    this.compressedData = null;
    this.size = 0;
    this.compressedSize = 0;
    this.checksum = null;
    this.createdAt = Date.now();
    this.status = ArchiveStatus.PENDING;
    this.policyId = config.policyId;
  }

  compress() {
    if (this.compressed) return this;

    const jsonData = JSON.stringify(this.data);
    this.size = Buffer.byteLength(jsonData);

    let compressed;
    switch (this.format) {
      case ArchiveFormat.GZIP:
        compressed = zlib.gzipSync(jsonData);
        break;
      case ArchiveFormat.DEFLATE:
        compressed = zlib.deflateSync(jsonData);
        break;
      case ArchiveFormat.BZIP2:
        compressed = zlib.brotliCompressSync(jsonData);
        break;
      default:
        compressed = Buffer.from(jsonData);
    }

    this.compressedData = compressed;
    this.compressedSize = compressed.length;
    this.checksum = crypto.createHash('sha256').update(compressed).digest('hex');
    this.compressed = true;
    this.status = ArchiveStatus.STORED;

    return this;
  }

  decompress() {
    if (!this.compressed || !this.compressedData) {
      return this.data;
    }

    let decompressed;
    switch (this.format) {
      case ArchiveFormat.GZIP:
        decompressed = zlib.gunzipSync(this.compressedData);
        break;
      case ArchiveFormat.DEFLATE:
        decompressed = zlib.inflateSync(this.compressedData);
        break;
      case ArchiveFormat.BROT:
        decompressed = zlib.brotliDecompressSync(this.compressedData);
        break;
      default:
        decompressed = this.compressedData;
    }

    return JSON.parse(decompressed.toString('utf8'));
  }

  getCompressionRatio() {
    if (this.size === 0) return 0;
    return ((this.size - this.compressedSize) / this.size * 100).toFixed(2);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      metadata: this.metadata,
      format: this.format,
      size: this.size,
      compressedSize: this.compressedSize,
      compressionRatio: this.getCompressionRatio(),
      checksum: this.checksum,
      createdAt: this.createdAt,
      status: this.status,
      policyId: this.policyId
    };
  }
}

/**
 * Archive Storage
 */
class ArchiveStorage {
  constructor(rootDir = ARCHIVE_DIR) {
    this.rootDir = rootDir;
    this.indexFile = path.join(rootDir, 'archive-index.json');
    this.index = new Map();
    ensureArchiveDir();
    this._loadIndex();
  }

  _loadIndex() {
    if (!fs.existsSync(this.indexFile)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.indexFile, 'utf8'));
      for (const entry of data) {
        this.index.set(entry.id, entry);
      }
    } catch {}
  }

  _saveIndex() {
    const data = Array.from(this.index.values());
    fs.writeFileSync(this.indexFile, JSON.stringify(data, null, 2));
  }

  store(archive) {
    const filePath = path.join(this.rootDir, `${archive.id}.archive`);
    fs.writeFileSync(filePath, archive.compressedData);
    this.index.set(archive.id, archive.toJSON());
    this._saveIndex();
  }

  retrieve(id) {
    const meta = this.index.get(id);
    if (!meta) return null;

    const filePath = path.join(this.rootDir, `${id}.archive`);
    if (!fs.existsSync(filePath)) return null;

    const compressedData = fs.readFileSync(filePath);
    return { metadata: meta, data: compressedData };
  }

  delete(id) {
    const filePath = path.join(this.rootDir, `${id}.archive`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    this.index.delete(id);
    this._saveIndex();
  }

  list(options = {}) {
    let results = Array.from(this.index.values());

    if (options.status) {
      results = results.filter(a => a.status === options.status);
    }

    if (options.policyId) {
      results = results.filter(a => a.policyId === options.policyId);
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  getTotalSize() {
    let total = 0;
    for (const entry of this.index.values()) {
      total += entry.compressedSize || entry.size;
    }
    return total;
  }
}

/**
 * Archive Manager
 */
class ArchiveManager {
  constructor() {
    this.storage = new ArchiveStorage();
    this.policies = new Map();
    this.stats = {
      archived: 0,
      retrieved: 0,
      deleted: 0,
      expired: 0,
      errors: 0
    };

    // Default policy
    this.addPolicy(new RetentionPolicy({
      id: 'default',
      name: 'Default Policy',
      duration: 365 * 24 * 60 * 60 * 1000
    }));
  }

  addPolicy(policy) {
    this.policies.set(policy.id, policy);
  }

  removePolicy(policyId) {
    return this.policies.delete(policyId);
  }

  getPolicy(policyId) {
    return this.policies.get(policyId);
  }

  listPolicies() {
    return Array.from(this.policies.values()).map(p => p.toJSON());
  }

  async archive(name, data, options = {}) {
    try {
      const policyId = options.policyId || 'default';
      const policy = this.policies.get(policyId);

      const archive = new ArchiveEntry({
        name,
        data,
        metadata: options.metadata || {},
        format: options.format || ArchiveFormat.GZIP,
        policyId
      });

      archive.compress();
      this.storage.store(archive);
      this.stats.archived++;

      return archive;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  async archiveBatch(items, options = {}) {
    const results = [];
    for (const item of items) {
      const archive = await this.archive(item.name, item.data, options);
      results.push(archive);
    }
    return results;
  }

  retrieve(id) {
    try {
      const stored = this.storage.retrieve(id);
      if (!stored) return null;

      const archive = new ArchiveEntry({
        id: stored.metadata.id,
        name: stored.metadata.name,
        metadata: stored.metadata.metadata,
        format: stored.metadata.format,
        policyId: stored.metadata.policyId
      });

      archive.compressedData = stored.data;
      archive.compressed = true;
      archive.size = stored.metadata.size;
      archive.compressedSize = stored.metadata.compressedSize;
      archive.checksum = stored.metadata.checksum;
      archive.status = stored.metadata.status;

      const data = archive.decompress();
      this.stats.retrieved++;

      return { archive: archive.toJSON(), data };
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  delete(id) {
    this.storage.delete(id);
    this.stats.deleted++;
    return true;
  }

  list(options = {}) {
    return this.storage.list(options);
  }

  checkExpiration() {
    const expired = [];
    const archives = this.list();

    for (const archive of archives) {
      const policy = this.policies.get(archive.policyId);
      if (policy && policy.isExpired(archive)) {
        expired.push(archive);
        if (policy.deleteAfterRetention) {
          this.delete(archive.id);
          this.stats.expired++;
        }
      }
    }

    return expired;
  }

  getStats() {
    return {
      ...this.stats,
      totalArchives: this.storage.index.size,
      totalSize: this.storage.getTotalSize(),
      policies: this.policies.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Archive Demo\n');

  const manager = new ArchiveManager();

  // Policies
  console.log('1. Retention Policies:');

  manager.addPolicy(new RetentionPolicy({
    id: 'short',
    name: 'Short Term',
    duration: 7 * 24 * 60 * 60 * 1000, // 7 days
    compressionLevel: 9
  }));

  manager.addPolicy(new RetentionPolicy({
    id: 'long',
    name: 'Long Term',
    duration: 365 * 24 * 60 * 60 * 1000, // 1 year
    compressionLevel: 6
  }));

  const policies = manager.listPolicies();
  console.log(`   Added ${policies.length} policies`);
  for (const policy of policies) {
    console.log(`   - ${policy.name}: ${policy.duration / (24 * 60 * 60 * 1000)} days`);
  }

  // Archive data
  console.log('\n2. Archiving Data:');

  const data1 = {
    users: Array(100).fill(null).map((_, i) => ({
      id: i,
      name: `user-${i}`,
      email: `user${i}@example.com`,
      created: new Date().toISOString()
    })),
    settings: { theme: 'dark', notifications: true }
  };

  const archive1 = await manager.archive('users-backup', data1, { policyId: 'long' });
  console.log(`   Archived: ${archive1.name}`);
  console.log(`   Size: ${archive1.size} -> ${archive1.compressedSize} bytes`);
  console.log(`   Compression: ${archive1.getCompressionRatio()}%`);
  console.log(`   Checksum: ${archive1.checksum.substring(0, 16)}...`);

  // Archive more data
  console.log('\n3. Multiple Archives:');

  const archives = await manager.archiveBatch([
    { name: 'logs-2024', data: { logs: Array(50).fill('log entry') } },
    { name: 'config-backup', data: { config: { key: 'value' } } },
    { name: 'metrics', data: { metrics: { cpu: 80, memory: 60 } } }
  ], { policyId: 'short' });

  console.log(`   Created ${archives.length} archives`);

  // List archives
  console.log('\n4. Archive List:');
  const list = manager.list();
  console.log(`   Total: ${list.length}`);
  for (const archive of list) {
    console.log(`   - ${archive.name}: ${archive.compressedSize} bytes (${archive.compressionRatio}% saved)`);
  }

  // Retrieve
  console.log('\n5. Retrieve Archive:');
  const retrieved = manager.retrieve(archive1.id);
  console.log(`   Retrieved: ${retrieved.archive.name}`);
  console.log(`   Data keys: ${Object.keys(retrieved.data).join(', ')}`);
  console.log(`   User count: ${retrieved.data.users.length}`);

  // Check expiration
  console.log('\n6. Expiration Check:');
  const expired = manager.checkExpiration();
  console.log(`   Expired: ${expired.length}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Archived: ${stats.archived}`);
  console.log(`   Retrieved: ${stats.retrieved}`);
  console.log(`   Deleted: ${stats.deleted}`);
  console.log(`   Expired: ${stats.expired}`);
  console.log(`   Errors: ${stats.errors}`);
  console.log(`   Total archives: ${stats.totalArchives}`);
  console.log(`   Total size: ${stats.totalSize} bytes`);

  // Storage info
  console.log('\n8. Storage Info:');
  const storage = manager.storage;
  console.log(`   Root: ${storage.rootDir}`);
  console.log(`   Index entries: ${storage.index.size}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'archive') {
  const manager = new ArchiveManager();
  const data = JSON.parse(args[1] || '{}');
  manager.archive('cli-archive', data).then(a => console.log(`Archived: ${a.id}`));
} else if (cmd === 'status') {
  const manager = new ArchiveManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Archive Module');
  console.log('Usage: node agent-archive.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  archive <data>    Archive data');
  console.log('  status             Show stats');
}
