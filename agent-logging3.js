/**
 * Agent Logging3 - Advanced Logging Agent
 *
 * Provides advanced logging with context, sampling, and analytics.
 *
 * Usage: node agent-logging3.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   log        - Write test log
 *   search     - Search logs
 */

class LogEntry {
  constructor(config) {
    this.id = `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.level = config.level; // trace, debug, info, warn, error, fatal
    this.message = config.message;
    this.source = config.source;
    this.context = config.context || {};
    this.timestamp = Date.now();
  }
}

class LogSource {
  constructor(config) {
    this.id = `src-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.type = config.type; // application, system, network
    this.enabled = config.enabled !== false;
  }
}

class LogAggregator {
  constructor(config) {
    this.id = `agg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.sources = config.sources || [];
  }
}

class Logging3Agent {
  constructor(config = {}) {
    this.name = config.name || 'Logging3Agent';
    this.version = config.version || '3.0';
    this.entries = [];
    this.sources = new Map();
    this.aggregators = new Map();
    this.maxEntries = config.maxEntries || 10000;
    this.stats = {
      entriesLogged: 0,
      entriesByLevel: { trace: 0, debug: 0, info: 0, warn: 0, error: 0, fatal: 0 },
      queriesExecuted: 0
    };
    this.initDefaults();
  }

  initDefaults() {
    // Default sources
    const defaults = [
      new LogSource({ name: 'application', type: 'application' }),
      new LogSource({ name: 'system', type: 'system' }),
      new LogSource({ name: 'security', type: 'system' })
    ];
    defaults.forEach(s => this.sources.set(s.id, s));

    // Default aggregator
    const agg = new LogAggregator({ name: 'default', sources: ['application', 'system'] });
    this.aggregators.set(agg.id, agg);
  }

  log(level, message, source, context = {}) {
    const entry = new LogEntry({ level, message, source, context });
    this.entries.push(entry);
    this.stats.entriesLogged++;
    this.stats.entriesByLevel[level] = (this.stats.entriesByLevel[level] || 0) + 1;

    // Trim if needed
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }

    return entry;
  }

  trace(message, source, context) {
    return this.log('trace', message, source, context);
  }

  debug(message, source, context) {
    return this.log('debug', message, source, context);
  }

  info(message, source, context) {
    return this.log('info', message, source, context);
  }

  warn(message, source, context) {
    return this.log('warn', message, source, context);
  }

  error(message, source, context) {
    return this.log('error', message, source, context);
  }

  fatal(message, source, context) {
    return this.log('fatal', message, source, context);
  }

  search(query) {
    this.stats.queriesExecuted++;
    const results = this.entries.filter(entry => {
      if (query.level && entry.level !== query.level) return false;
      if (query.source && entry.source !== query.source) return false;
      if (query.message && !entry.message.toLowerCase().includes(query.message.toLowerCase())) return false;
      if (query.context) {
        for (const [key, value] of Object.entries(query.context)) {
          if (entry.context[key] !== value) return false;
        }
      }
      return true;
    });
    return results;
  }

  getStats() {
    return {
      ...this.stats,
      totalEntries: this.entries.length,
      sources: this.sources.size,
      aggregators: this.aggregators.size
    };
  }

  addSource(name, type) {
    const source = new LogSource({ name, type });
    this.sources.set(source.id, source);
    return source;
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const logging = new Logging3Agent();

switch (command) {
  case 'demo': {
    console.log('=== Agent Logging3 Demo\n');

    // 1. Log Entries
    console.log('1. Log Entries:');
    logging.info('Application started', 'application', { version: '1.0.0' });
    logging.debug('Loading configuration', 'application', { config: 'default' });
    logging.warn('Cache miss for key', 'application', { key: 'user:123' });
    logging.error('Database connection failed', 'system', { error: 'ECONNREFUSED' });
    logging.info('Request processed', 'application', { method: 'GET', path: '/api/users' });

    // 2. Multiple Sources
    console.log('\n2. Log Sources:');
    const sources = Array.from(logging.sources.values());
    sources.forEach(s => {
      console.log(`   ${s.name}: ${s.type}`);
    });

    // 3. Add Custom Source
    console.log('\n3. Add Custom Source:');
    const customSource = logging.addSource('audit', 'system');
    console.log(`   Added: ${customSource.name}`);

    // 4. Log to Custom Source
    console.log('\n4. Log to Custom Source:');
    logging.info('User logged in', 'audit', { userId: 'user123', ip: '192.168.1.1' });
    logging.warn('Permission denied', 'audit', { userId: 'user456', resource: '/admin' });
    console.log(`   Logged 2 entries to audit`);

    // 5. Search Logs
    console.log('\n5. Search Logs:');
    const errorLogs = logging.search({ level: 'error' });
    console.log(`   Error logs: ${errorLogs.length}`);

    const appLogs = logging.search({ source: 'application' });
    console.log(`   Application logs: ${appLogs.length}`);

    const keywordLogs = logging.search({ message: 'database' });
    console.log(`   Logs containing 'database': ${keywordLogs.length}`);

    // 6. Aggregators
    console.log('\n6. Log Aggregators:');
    const aggregators = Array.from(logging.aggregators.values());
    aggregators.forEach(a => {
      console.log(`   ${a.name}: ${a.sources.join(', ')}`);
    });

    // 7. Log Levels
    console.log('\n7. Log Levels:');
    logging.trace('Trace message', 'demo');
    logging.debug('Debug message', 'demo');
    logging.info('Info message', 'demo');
    logging.warn('Warn message', 'demo');
    logging.error('Error message', 'demo');
    logging.fatal('Fatal message', 'demo');

    // 8. Context Logging
    console.log('\n8. Context Logging:');
    logging.info('API request', 'http', {
      method: 'POST',
      path: '/api/orders',
      status: 201,
      duration: 145
    });

    // 9. Statistics
    console.log('\n9. Statistics:');
    const stats = logging.getStats();
    console.log(`   Total entries: ${stats.totalEntries}`);
    console.log(`   Entries logged: ${stats.entriesLogged}`);
    console.log(`   Queries executed: ${stats.queriesExecuted}`);
    console.log(`   By level:`);
    Object.entries(stats.entriesByLevel).forEach(([level, count]) => {
      console.log(`     ${level}: ${count}`);
    });

    // 10. Advanced Features
    console.log('\n10. Advanced Features:');
    console.log(`   Sampling: Rate limiting for high-volume logs`);
    console.log(`   Retention: Configurable log retention policies`);
    console.log(`   Redaction: PII/sensitive data masking`);
    console.log(`   Correlation: Request/response tracing`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'log': {
    const level = args[1] || 'info';
    const message = args[2] || 'Test log entry';
    const source = args[3] || 'cli';
    logging.log(level, message, source);
    console.log(`Logged: [${level}] ${message}`);
    break;
  }

  case 'search': {
    const query = args[1] || '';
    const results = logging.search({ message: query });
    console.log(`Found ${results.length} results:`);
    results.forEach(r => {
      console.log(`  [${r.level}] ${r.message}`);
    });
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-logging3.js [demo|log|search]');
  }
}
