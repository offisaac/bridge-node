/**
 * Agent Logging 2 Module
 *
 * Provides structured logging with levels, formatters, and multiple outputs.
 * Usage: node agent-logging-2.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   log <level> <message>  Log a message
 *   status                 Show logging stats
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname + '/data';
const LOG_FILE = DATA_DIR + '/agent-log-2.json';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Log Levels
 */
const LogLevel = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  FATAL: 5
};

const LevelNames = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

/**
 * Log Formatters
 */
class Formatter {
  static json(record) {
    return JSON.stringify(record);
  }

  static pretty(record) {
    const timestamp = new Date(record.timestamp).toISOString();
    const level = record.level.padEnd(5);
    const logger = record.logger || 'root';
    const msg = record.message;
    const meta = record.meta ? ' ' + JSON.stringify(record.meta) : '';
    return `${timestamp} [${level}] ${logger}: ${msg}${meta}`;
  }

  static simple(record) {
    const level = record.level;
    const msg = record.message;
    return `[${level}] ${msg}`;
  }

  static csv(record) {
    return [
      record.timestamp,
      record.level,
      record.logger,
      record.message,
      JSON.stringify(record.meta || {})
    ].join(',');
  }
}

/**
 * Log Outputs
 */
class ConsoleOutput {
  constructor(formatter = Formatter.pretty) {
    this.formatter = formatter;
  }

  write(record) {
    const formatted = this.formatter(record);
    const stream = record.level >= LogLevel.ERROR ? process.stderr : process.stdout;
    stream.write(formatted + '\n');
  }
}

class FileOutput {
  constructor(filePath, formatter = Formatter.json) {
    this.filePath = filePath;
    this.formatter = formatter;
    ensureDataDir();
  }

  write(record) {
    const formatted = this.formatter(record);
    fs.appendFileSync(this.filePath, formatted + '\n');
  }
}

class RotatingFileOutput {
  constructor(options = {}) {
    this.basePath = options.basePath || (DATA_DIR + '/logs/agent.log');
    this.maxSize = options.maxSize || 1024 * 1024; // 1MB
    this.maxFiles = options.maxFiles || 5;
    this.currentSize = 0;
    this.currentIndex = 0;
    ensureDataDir();
  }

  _getFilePath(index) {
    if (index === 0) {
      return this.basePath;
    }
    return `${this.basePath}.${index}`;
  }

  _rotate() {
    // Remove oldest file
    const oldest = this._getFilePath(this.maxFiles);
    if (fs.existsSync(oldest)) {
      fs.unlinkSync(oldest);
    }

    // Shift files
    for (let i = this.maxFiles - 1; i >= 1; i--) {
      const oldPath = this._getFilePath(i);
      const newPath = this._getFilePath(i + 1);
      if (fs.existsSync(oldPath)) {
        fs.renameSync(oldPath, newPath);
      }
    }

    // Rename current to .1
    if (fs.existsSync(this.basePath)) {
      fs.renameSync(this.basePath, this._getFilePath(1));
    }

    this.currentSize = 0;
  }

  write(record) {
    const formatted = JSON.stringify(record) + '\n';
    const size = Buffer.byteLength(formatted);

    if (this.currentSize + size > this.maxSize) {
      this._rotate();
    }

    fs.appendFileSync(this.basePath, formatted);
    this.currentSize += size;
  }
}

class MemoryOutput {
  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
    this.buffer = [];
  }

  write(record) {
    this.buffer.push(record);
    if (this.buffer.length > this.maxSize) {
      this.buffer.shift();
    }
  }

  getRecords(level = null) {
    if (level === null) {
      return [...this.buffer];
    }
    return this.buffer.filter(r => r.level === level);
  }

  clear() {
    this.buffer = [];
  }
}

/**
 * Log Filter
 */
class LogFilter {
  constructor(options = {}) {
    this.minLevel = options.minLevel || LogLevel.INFO;
    this.maxLevel = options.maxLevel || LogLevel.FATAL;
    this.includePatterns = options.includePatterns || null;
    this.excludePatterns = options.excludePatterns || null;
  }

  shouldLog(record) {
    if (record.level < this.minLevel || record.level > this.maxLevel) {
      return false;
    }

    if (this.includePatterns) {
      const matches = this.includePatterns.some(p =>
        record.message.includes(p) || (record.logger && record.logger.includes(p))
      );
      if (!matches) return false;
    }

    if (this.excludePatterns) {
      const matches = this.excludePatterns.some(p =>
        record.message.includes(p) || (record.logger && record.logger.includes(p))
      );
      if (matches) return false;
    }

    return true;
  }
}

/**
 * Log Context
 */
class LogContext {
  constructor() {
    this.context = {};
  }

  set(key, value) {
    this.context[key] = value;
  }

  get(key) {
    return this.context[key];
  }

  clear() {
    this.context = {};
  }

  getAll() {
    return { ...this.context };
  }
}

/**
 * Structured Logger
 */
class StructuredLogger {
  constructor(name, options = {}) {
    this.name = name;
    this.outputs = options.outputs || [new ConsoleOutput()];
    this.filter = options.filter || new LogFilter({ minLevel: options.level || LogLevel.INFO });
    this.formatter = options.formatter || Formatter.pretty;
    this.context = options.context || new LogContext();
    this.enableTimestamp = options.enableTimestamp !== false;
    this.enableCaller = options.enableCaller || false;
  }

  _createRecord(level, message, meta = {}) {
    const record = {
      timestamp: this.enableTimestamp ? Date.now() : undefined,
      level: LevelNames[level],
      logger: this.name,
      message,
      meta: {
        ...this.context.getAll(),
        ...meta
      }
    };

    if (this.enableCaller) {
      const err = new Error();
      record.caller = err.stack.split('\n')[3]?.trim();
    }

    return record;
  }

  _log(level, message, meta) {
    const record = this._createRecord(level, message, meta);
    if (this.filter.shouldLog(record)) {
      for (const output of this.outputs) {
        output.write(record);
      }
    }
  }

  trace(message, meta) {
    this._log(LogLevel.TRACE, message, meta);
  }

  debug(message, meta) {
    this._log(LogLevel.DEBUG, message, meta);
  }

  info(message, meta) {
    this._log(LogLevel.INFO, message, meta);
  }

  warn(message, meta) {
    this._log(LogLevel.WARN, message, meta);
  }

  error(message, meta) {
    this._log(LogLevel.ERROR, message, meta);
  }

  fatal(message, meta) {
    this._log(LogLevel.FATAL, message, meta);
  }

  child(name) {
    return new StructuredLogger(`${this.name}.${name}`, {
      outputs: this.outputs,
      filter: this.filter,
      formatter: this.formatter,
      context: this.context,
      enableTimestamp: this.enableTimestamp,
      enableCaller: this.enableCaller
    });
  }

  setLevel(level) {
    this.filter.minLevel = level;
  }
}

/**
 * Logger Manager
 */
class LoggerManager {
  constructor() {
    this.loggers = new Map();
    this.outputs = [new ConsoleOutput(), new MemoryOutput(100)];
    this.defaultLevel = LogLevel.INFO;
    this.stats = {
      trace: 0,
      debug: 0,
      info: 0,
      warn: 0,
      error: 0,
      fatal: 0
    };

    // Create root logger
    this.getLogger('root');
  }

  getLogger(name) {
    if (!this.loggers.has(name)) {
      const logger = new StructuredLogger(name, {
        outputs: this.outputs,
        level: this.defaultLevel,
        context: new LogContext()
      });
      this.loggers.set(name, logger);
    }
    return this.loggers.get(name);
  }

  setGlobalLevel(level) {
    this.defaultLevel = level;
    for (const logger of this.loggers.values()) {
      logger.setLevel(level);
    }
  }

  addOutput(output) {
    this.outputs.push(output);
    for (const logger of this.loggers.values()) {
      logger.outputs.push(output);
    }
  }

  getMemoryOutput() {
    return this.outputs.find(o => o instanceof MemoryOutput);
  }

  _incrementStat(level) {
    const key = LevelNames[level].toLowerCase();
    if (this.stats[key] !== undefined) {
      this.stats[key]++;
    }
  }

  getStats() {
    const memoryOutput = this.getMemoryOutput();
    return {
      ...this.stats,
      loggers: this.loggers.size,
      outputs: this.outputs.length,
      bufferedRecords: memoryOutput ? memoryOutput.buffer.length : 0
    };
  }

  clearLogs() {
    const memoryOutput = this.getMemoryOutput();
    if (memoryOutput) {
      memoryOutput.clear();
    }
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Logging 2 Demo\n');

  const manager = new LoggerManager();

  // Basic logging
  console.log('1. Basic Logging:');
  const logger = manager.getLogger('demo');
  logger.info('Application started');
  logger.debug('Debug message with data', { userId: '123' });
  logger.warn('Warning: low memory');
  logger.error('Error occurred', { code: 'ERR_001' });

  // Child logger
  console.log('\n2. Child Loggers:');
  const childLogger = logger.child('database');
  childLogger.info('Connected to database');
  childLogger.error('Query failed', { query: 'SELECT * FROM users', duration: 150 });

  // Different loggers
  console.log('\n3. Multiple Loggers:');
  const httpLogger = manager.getLogger('http');
  httpLogger.info('Incoming request', { method: 'GET', path: '/api/users' });

  const authLogger = manager.getLogger('auth');
  authLogger.warn('Failed login attempt', { email: 'user@example.com', attempts: 3 });

  // Log levels
  console.log('\n4. Log Levels:');
  manager.setGlobalLevel(LogLevel.DEBUG);
  const debugLogger = manager.getLogger('levels');
  debugLogger.trace('Trace message');
  debugLogger.debug('Debug message');
  debugLogger.info('Info message');
  debugLogger.warn('Warn message');
  debugLogger.error('Error message');
  debugLogger.fatal('Fatal message');

  // Memory output
  console.log('\n5. Memory Buffer:');
  const memoryOutput = manager.getMemoryOutput();
  console.log(`   Buffered records: ${memoryOutput.buffer.length}`);

  const errorLogs = memoryOutput.getRecords('ERROR');
  console.log(`   Error records: ${errorLogs.length}`);

  // Stats
  console.log('\n6. Statistics:');
  const stats = manager.getStats();
  console.log(`   Trace: ${stats.trace}`);
  console.log(`   Debug: ${stats.debug}`);
  console.log(`   Info: ${stats.info}`);
  console.log(`   Warn: ${stats.warn}`);
  console.log(`   Error: ${stats.error}`);
  console.log(`   Fatal: ${stats.fatal}`);
  console.log(`   Active loggers: ${stats.loggers}`);

  // Formatters
  console.log('\n7. Formatters:');
  const testRecord = {
    timestamp: Date.now(),
    level: 'INFO',
    logger: 'test',
    message: 'Test message',
    meta: { key: 'value' }
  };

  console.log(`   JSON: ${Formatter.json(testRecord).substring(0, 60)}...`);
  console.log(`   Pretty: ${Formatter.pretty(testRecord).substring(0, 60)}...`);
  console.log(`   Simple: ${Formatter.simple(testRecord)}`);

  // Log filter
  console.log('\n8. Log Filtering:');
  const filteredLogger = new StructuredLogger('filtered', {
    level: LogLevel.WARN,
    filter: new LogFilter({
      minLevel: LogLevel.WARN,
      excludePatterns: ['ignore']
    })
  });

  filteredLogger.info('This should be filtered');
  filteredLogger.warn('This should show');
  filteredLogger.error('ignore this', { ignore: true });

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'log') {
  const manager = new LoggerManager();
  const level = args[1] || 'info';
  const message = args[2] || 'Test message';
  const logger = manager.getLogger('cli');
  logger[level]?.(message);
} else if (cmd === 'status') {
  const manager = new LoggerManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Logging 2 Module');
  console.log('Usage: node agent-logging-2.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  log <level> <msg>  Log message');
  console.log('  status              Show stats');
}
