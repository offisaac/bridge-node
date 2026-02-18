/**
 * Agent FS Module
 *
 * Provides filesystem operations with watching, glob, and async handling.
 * Usage: node agent-fs.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   read <path>          Read file
 *   write <path> <data>  Write file
 *   status                 Show FS stats
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const FS_DB = path.join(DATA_DIR, 'fs-state.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON(file, defaultVal = {}) {
  ensureDataDir();
  if (!fs.existsSync(file)) {
    return defaultVal;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return defaultVal;
  }
}

function saveJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/**
 * File Types
 */
const FileType = {
  FILE: 'file',
  DIRECTORY: 'directory',
  SYMLINK: 'symlink',
  OTHER: 'other'
};

/**
 * File Stats
 */
class FileStats {
  constructor(filePath) {
    this.path = filePath;
    this.exists = fs.existsSync(filePath);

    if (this.exists) {
      const stats = fs.statSync(filePath);
      this.size = stats.size;
      this.isFile = stats.isFile();
      this.isDirectory = stats.isDirectory();
      this.isSymbolicLink = stats.isSymbolicLink();
      this.created = stats.birthtime;
      this.modified = stats.mtime;
      this.accessed = stats.atime;
      this.mode = stats.mode;
      this.type = this.isDirectory ? FileType.DIRECTORY :
                  this.isSymbolicLink ? FileType.SYMLINK : FileType.FILE;
    } else {
      this.size = 0;
      this.isFile = false;
      this.isDirectory = false;
      this.isSymbolicLink = false;
      this.created = null;
      this.modified = null;
      this.accessed = null;
      this.mode = 0;
      this.type = FileType.OTHER;
    }
  }

  toJSON() {
    return {
      path: this.path,
      exists: this.exists,
      size: this.size,
      isFile: this.isFile,
      isDirectory: this.isDirectory,
      isSymbolicLink: this.isSymbolicLink,
      created: this.created,
      modified: this.modified,
      accessed: this.accessed,
      type: this.type
    };
  }
}

/**
 * File Watcher
 */
class FileWatcher {
  constructor() {
    this.watchers = new Map();
    this.callbacks = new Map();
  }

  watch(filePath, callback, options = {}) {
    if (this.watchers.has(filePath)) {
      return filePath;
    }

    try {
      const watcher = fs.watch(filePath, options, (eventType, filename) => {
        const event = {
          type: eventType,
          filename: filename,
          path: filePath,
          timestamp: Date.now()
        };
        callback(event, this);
      });

      this.watchers.set(filePath, watcher);
      this.callbacks.set(filePath, callback);
      return filePath;
    } catch (error) {
      throw new Error(`Failed to watch ${filePath}: ${error.message}`);
    }
  }

  watchDirectory(dirPath, callback, options = {}) {
    return this.watch(dirPath, callback, { ...options, recursive: true });
  }

  unwatch(filePath) {
    const watcher = this.watchers.get(filePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(filePath);
      this.callbacks.delete(filePath);
      return true;
    }
    return false;
  }

  unwatchAll() {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.callbacks.clear();
  }

  isWatching(filePath) {
    return this.watchers.has(filePath);
  }

  getWatched() {
    return Array.from(this.watchers.keys());
  }
}

/**
 * Glob Matcher
 */
class GlobMatcher {
  constructor(options = {}) {
    this.options = {
      cwd: options.cwd || process.cwd(),
      ignore: options.ignore || [],
      absolute: options.absolute || false,
      ...options
    };
  }

  match(pattern) {
    const results = [];
    const cwd = this.options.cwd;

    // Simple glob implementation
    const parts = pattern.split('/');
    const searchParts = [];
    let currentGlob = null;

    for (const part of parts) {
      if (part === '**') {
        currentGlob = '**';
      } else if (part === '*') {
        currentGlob = '*';
      } else if (part.includes('*') || part.includes('?')) {
        currentGlob = part;
      } else {
        if (currentGlob) {
          searchParts.push({ type: currentGlob, pattern: part });
          currentGlob = null;
        } else {
          searchParts.push({ type: 'exact', pattern: part });
        }
      }
    }

    if (currentGlob) {
      searchParts.push({ type: currentGlob, pattern: '' });
    }

    // Walk directory
    this._walk(cwd, searchParts, 0, results);

    // Filter ignored
    return results.filter(p => !this._isIgnored(p));
  }

  _walk(dir, parts, index, results) {
    if (index >= parts.length) {
      if (this.options.absolute) {
        results.push(path.resolve(dir));
      } else {
        results.push(path.relative(this.options.cwd, dir));
      }
      return;
    }

    const part = parts[index];

    if (!fs.existsSync(dir)) return;

    if (part.type === '**') {
      // Recursive search
      this._walk(dir, parts, index + 1, results);
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = new FileStats(fullPath);
        if (stat.isDirectory) {
          this._walk(fullPath, parts, index, results);
        }
      }
    } else if (part.type === '*') {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = new FileStats(fullPath);
        if (stat.isFile || stat.isDirectory) {
          this._walk(fullPath, parts, index + 1, results);
        }
      }
    } else if (part.type === 'exact') {
      const fullPath = path.join(dir, part.pattern);
      if (fs.existsSync(fullPath)) {
        this._walk(fullPath, parts, index + 1, results);
      }
    }
  }

  _isIgnored(filePath) {
    for (const pattern of this.options.ignore) {
      if (filePath.includes(pattern)) {
        return true;
      }
    }
    return false;
  }

  matchSync(pattern) {
    return this.match(pattern);
  }

  async matchAsync(pattern) {
    return this.match(pattern);
  }
}

/**
 * File Operations
 */
class FileOperations {
  constructor(options = {}) {
    this.options = {
      encoding: options.encoding || 'utf8',
      flag: options.flag || 'w',
      ...options
    };
  }

  async read(filePath, options = {}) {
    const opts = { ...this.options, ...options };
    return fs.promises.readFile(filePath, opts);
  }

  async write(filePath, data, options = {}) {
    const opts = { ...this.options, ...options };
    await fs.promises.writeFile(filePath, data, opts);
    return { path: filePath, size: data.length };
  }

  async append(filePath, data, options = {}) {
    const opts = { ...this.options, flag: 'a', ...options };
    await fs.promises.writeFile(filePath, data, opts);
    return { path: filePath };
  }

  async copy(src, dest, options = {}) {
    await fs.promises.copyFile(src, dest);
    return { src, dest };
  }

  async move(src, dest, options = {}) {
    await fs.promises.rename(src, dest);
    return { src, dest };
  }

  async delete(filePath, options = {}) {
    const stat = new FileStats(filePath);
    if (stat.isDirectory) {
      await fs.promises.rm(filePath, { recursive: true, force: options.force || false });
    } else {
      await fs.promises.unlink(filePath);
    }
    return { path: filePath };
  }

  async mkdir(dirPath, options = {}) {
    await fs.promises.mkdir(dirPath, { recursive: options.recursive || false });
    return { path: dirPath };
  }

  async readdir(dirPath, options = {}) {
    const entries = await fs.promises.readdir(dirPath, options);
    return entries.map(name => {
      const fullPath = path.join(dirPath, name);
      return new FileStats(fullPath).toJSON();
    });
  }

  async stat(filePath) {
    return new FileStats(filePath).toJSON();
  }

  async exists(filePath) {
    try {
      await fs.promises.stat(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async readJSON(filePath) {
    const content = await this.read(filePath);
    return JSON.parse(content);
  }

  async writeJSON(filePath, data, options = {}) {
    const content = JSON.stringify(data, null, 2);
    return this.write(filePath, content, options);
  }
}

/**
 * Path Utilities
 */
class PathUtils {
  static join(...parts) {
    return path.join(...parts);
  }

  static resolve(...parts) {
    return path.resolve(...parts);
  }

  static dirname(filePath) {
    return path.dirname(filePath);
  }

  static basename(filePath, ext = '') {
    return path.basename(filePath, ext);
  }

  static extname(filePath) {
    return path.extname(filePath);
  }

  static relative(from, to) {
    return path.relative(from, to);
  }

  static isAbsolute(filePath) {
    return path.isAbsolute(filePath);
  }

  static normalize(filePath) {
    return path.normalize(filePath);
  }

  static parse(filePath) {
    return path.parse(filePath);
  }

  static format(parsed) {
    return path.format(parsed);
  }
}

/**
 * File Lock
 */
class FileLock {
  constructor(options = {}) {
    this.options = {
      timeout: options.timeout || 30000,
      retries: options.retries || 3,
      ...options
    };
    this.locks = new Map();
  }

  async acquire(filePath) {
    const lockPath = filePath + '.lock';
    const startTime = Date.now();

    for (let i = 0; i < this.options.retries; i++) {
      try {
        await fs.promises.writeFile(lockPath, String(process.pid));
        this.locks.set(filePath, lockPath);
        return true;
      } catch (error) {
        if (i === this.options.retries - 1) {
          throw new Error(`Failed to acquire lock for ${filePath}`);
        }
        await new Promise(r => setTimeout(r, 100));
      }
    }
    return false;
  }

  async release(filePath) {
    const lockPath = this.locks.get(filePath);
    if (lockPath) {
      try {
        await fs.promises.unlink(lockPath);
        this.locks.delete(filePath);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  async withLock(filePath, fn) {
    await this.acquire(filePath);
    try {
      return await fn();
    } finally {
      await this.release(filePath);
    }
  }
}

/**
 * Agent FS Manager
 */
class AgentFsManager {
  constructor() {
    this.fileOps = new FileOperations();
    this.watcher = new FileWatcher();
    this.globMatcher = new GlobMatcher();
    this.fileLock = new FileLock();
    this.stats = {
      reads: 0,
      writes: 0,
      deletes: 0,
      watchers: 0
    };
    this.state = loadJSON(FS_DB, {});
  }

  async read(filePath, options = {}) {
    this.stats.reads++;
    return this.fileOps.read(filePath, options);
  }

  async write(filePath, data, options = {}) {
    this.stats.writes++;
    return this.fileOps.write(filePath, data, options);
  }

  async delete(filePath, options = {}) {
    this.stats.deletes++;
    return this.fileOps.delete(filePath, options);
  }

  watch(filePath, callback, options = {}) {
    this.stats.watchers++;
    return this.watcher.watch(filePath, callback, options);
  }

  watchDirectory(dirPath, callback, options = {}) {
    return this.watcher.watchDirectory(dirPath, callback, options);
  }

  unwatch(filePath) {
    return this.watcher.unwatch(filePath);
  }

  glob(pattern, options = {}) {
    const matcher = new GlobMatcher(options);
    return matcher.match(pattern);
  }

  async lock(filePath, fn) {
    return this.fileLock.withLock(filePath, fn);
  }

  async stat(filePath) {
    return this.fileOps.stat(filePath);
  }

  async exists(filePath) {
    return this.fileOps.exists(filePath);
  }

  async readJSON(filePath) {
    return this.fileOps.readJSON(filePath);
  }

  async writeJSON(filePath, data, options = {}) {
    return this.fileOps.writeJSON(filePath, data, options);
  }

  getStats() {
    return {
      ...this.stats,
      watching: this.watcher.getWatched().length
    };
  }

  save() {
    saveJSON(FS_DB, { stats: this.stats });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent FS Demo\n');

  const manager = new AgentFsManager();

  // File operations
  console.log('1. File Operations:');
  const testDir = path.join(__dirname, 'data', 'test-fs-2');

  await fs.promises.mkdir(testDir, { recursive: true });
  console.log(`   Created directory: ${testDir}`);

  const helloPath = path.join(testDir, 'hello.txt');
  await fs.promises.writeFile(helloPath, 'Hello World!');
  console.log('   Wrote hello.txt');

  const content = await fs.promises.readFile(helloPath, 'utf8');
  console.log(`   Read hello.txt: "${content}"`);

  const exists = await manager.exists(path.join(testDir, 'hello.txt'));
  console.log(`   Exists hello.txt: ${exists}`);

  const stat = await manager.stat(helloPath);
  console.log(`   Stats: size=${stat.size}, type=${stat.type}`);

  // JSON operations
  console.log('\n2. JSON Operations:');
  const dataPath = path.join(testDir, 'data.json');
  await fs.promises.writeFile(dataPath, JSON.stringify({
    name: 'Test',
    value: 123,
    nested: { a: 1, b: 2 }
  }));
  console.log('   Wrote data.json');

  const jsonContent = await fs.promises.readFile(dataPath, 'utf8');
  const jsonData = JSON.parse(jsonContent);
  console.log(`   Read JSON: ${JSON.stringify(jsonData)}`);

  // Path utilities
  console.log('\n3. Path Utilities:');
  const filePath = '/home/user/documents/file.txt';
  console.log(`   Basename: ${PathUtils.basename(filePath)}`);
  console.log(`   Extname: ${PathUtils.extname(filePath)}`);
  console.log(`   Dirname: ${PathUtils.dirname(filePath)}`);
  console.log(`   Parse: ${JSON.stringify(PathUtils.parse(filePath))}`);

  // File watcher
  console.log('\n4. File Watcher:');
  const watchFile = path.join(testDir, 'watch.txt');
  await fs.promises.writeFile(watchFile, 'Watching...');

  let eventReceived = false;
  manager.watch(watchFile, (event) => {
    if (!eventReceived) {
      console.log(`   Event: ${event.type} - ${event.filename}`);
      eventReceived = true;
    }
  });
  console.log(`   Watching: ${watchFile}`);

  await fs.promises.writeFile(watchFile, 'Updated!');
  await new Promise(r => setTimeout(r, 100));

  manager.unwatch(watchFile);
  console.log(`   Stopped watching`);

  // Glob
  console.log('\n5. Glob Matching:');
  const globDir = path.join(__dirname, 'data', 'glob-test');
  await fs.promises.mkdir(path.join(globDir, 'sub1'), { recursive: true });
  await fs.promises.mkdir(path.join(globDir, 'sub2'), { recursive: true });
  await fs.promises.writeFile(path.join(globDir, 'file1.txt'), 'test');
  await fs.promises.writeFile(path.join(globDir, 'file2.js'), 'test');
  await fs.promises.writeFile(path.join(globDir, 'sub1', 'nested.txt'), 'test');

  const jsFiles = manager.glob('*.js', { cwd: globDir });
  console.log(`   JS files: ${jsFiles.join(', ')}`);

  const txtFiles = manager.glob('**/*.txt', { cwd: globDir });
  console.log(`   All TXT files: ${txtFiles.join(', ')}`);

  // File lock
  console.log('\n6. File Lock:');
  const lockFile = path.join(testDir, 'locked.txt');
  // Ensure file exists before lock test
  await fs.promises.writeFile(lockFile, 'initial');
  await manager.lock(lockFile, async () => {
    console.log('   Lock acquired, doing work...');
    await manager.write(lockFile, 'Locked content');
    await new Promise(r => setTimeout(r, 50));
    console.log('   Lock released');
  });

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Reads: ${stats.reads}`);
  console.log(`   Writes: ${stats.writes}`);
  console.log(`   Deletes: ${stats.deletes}`);
  console.log(`   Active watchers: ${stats.watching}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'read') {
  const manager = new AgentFsManager();
  const filePath = args[1] || 'test.txt';
  manager.read(filePath).then(c => console.log(c)).catch(e => console.error(e));
} else if (cmd === 'write') {
  const manager = new AgentFsManager();
  const filePath = args[1] || 'test.txt';
  const data = args[2] || 'test data';
  manager.write(filePath, data).then(() => console.log('Written')).catch(e => console.error(e));
} else if (cmd === 'status') {
  const manager = new AgentFsManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent FS Module');
  console.log('Usage: node agent-fs.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  read <path>  Read file');
  console.log('  write <path> <data> Write file');
  console.log('  status           Show FS stats');
}
