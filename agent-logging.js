/**
 * Agent Logging Aggregator
 * Centralized logging for distributed agent systems
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');

class AgentLoggingAggregator {
  constructor(options = {}) {
    this.logs = new Map();
    this.streams = new Map();
    this.indices = new Map();
    this.archives = new Map();

    this.config = {
      retentionDays: options.retentionDays || 30,
      maxLogSize: options.maxLogSize || 100000,
      compressionEnabled: options.compressionEnabled !== false,
      flushInterval: options.flushInterval || 60000,
      logLevels: options.logLevels || ['debug', 'info', 'warn', 'error', 'fatal'],
      defaultLevel: options.defaultLevel || 'info'
    };

    // Initialize log levels priority
    this.levelPriority = {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
      fatal: 4
    };

    // Statistics
    this.stats = {
      totalLogs: 0,
      logsByLevel: {},
      logsByAgent: {},
      lastFlush: new Date().toISOString()
    };

    for (const level of this.config.logLevels) {
      this.stats.logsByLevel[level] = 0;
    }
  }

  createLogStream(streamConfig) {
    const { id, name, agentId, retentionDays, filters = {} } = streamConfig;

    const stream = {
      id: id || `stream-${Date.now()}`,
      name: name || id,
      agentId: agentId || null,
      retentionDays: retentionDays || this.config.retentionDays,
      filters,
      createdAt: new Date().toISOString(),
      logs: [],
      size: 0,
      archived: false
    };

    this.streams.set(stream.id, stream);
    console.log(`Log stream created: ${stream.id} (${stream.name})`);
    return stream;
  }

  deleteLogStream(streamId) {
    if (!this.streams.has(streamId)) {
      throw new Error(`Log stream not found: ${streamId}`);
    }

    this.streams.delete(streamId);
    console.log(`Log stream deleted: ${streamId}`);
    return { success: true, streamId };
  }

  ingestLog(logConfig) {
    const {
      streamId,
      level = this.config.defaultLevel,
      message,
      agentId,
      metadata = {},
      timestamp = null
    } = logConfig;

    let stream = this.streams.get(streamId);
    if (!stream) {
      // Create default stream if not exists
      stream = this.createLogStream({
        id: streamId,
        name: 'default',
        agentId
      });
    }

    // Check filters
    if (stream.filters.level) {
      const minLevel = stream.filters.level;
      if (this.levelPriority[level] < this.levelPriority[minLevel]) {
        return null;
      }
    }

    const logEntry = {
      id: crypto.randomUUID(),
      streamId: stream.id,
      timestamp: timestamp || new Date().toISOString(),
      level,
      message,
      agentId: agentId || stream.agentId,
      metadata,
      archived: false
    };

    stream.logs.push(logEntry);
    stream.size += JSON.stringify(logEntry).length;

    // Update statistics
    this.stats.totalLogs++;
    this.stats.logsByLevel[level] = (this.stats.logsByLevel[level] || 0) + 1;
    if (agentId) {
      this.stats.logsByAgent[agentId] = (this.stats.logsByAgent[agentId] || 0) + 1;
    }

    // Create index entry
    this._indexLog(logEntry);

    // Check retention
    this._checkRetention(stream);

    return logEntry;
  }

  _indexLog(logEntry) {
    const indexKey = `${logEntry.agentId || 'global'}:${logEntry.level}`;
    if (!this.indices.has(indexKey)) {
      this.indices.set(indexKey, []);
    }
    this.indices.get(indexKey).push(logEntry.id);
  }

  _checkRetention(stream) {
    if (stream.logs.length > this.config.maxLogSize) {
      // Archive old logs
      const toArchive = stream.logs.splice(0, Math.floor(stream.logs.length / 2));
      this._archiveLogs(stream.id, toArchive);
    }

    // Check age-based retention
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - stream.retentionDays);

    stream.logs = stream.logs.filter(log => new Date(log.timestamp) > cutoff);
  }

  _archiveLogs(streamId, logs) {
    if (!this.config.compressionEnabled) {
      return;
    }

    const archiveId = `archive-${Date.now()}`;
    const compressed = zlib.deflateSync(JSON.stringify(logs));

    this.archives.set(archiveId, {
      id: archiveId,
      streamId,
      compressed: true,
      size: compressed.length,
      originalSize: logs.length,
      createdAt: new Date().toISOString()
    });

    console.log(`Archived ${logs.length} logs for stream ${streamId}`);
  }

  queryLogs(query) {
    const {
      streamId,
      agentId,
      level,
      startTime,
      endTime,
      search,
      limit = 100,
      offset = 0
    } = query;

    let results = [];

    // Get logs from streams
    if (streamId) {
      const stream = this.streams.get(streamId);
      if (stream) {
        results = [...stream.logs];
      }
    } else {
      // Get logs from all streams
      for (const stream of this.streams.values()) {
        results = [...results, ...stream.logs];
      }
    }

    // Apply filters
    if (agentId) {
      results = results.filter(log => log.agentId === agentId);
    }

    if (level) {
      const minLevel = this.levelPriority[level];
      results = results.filter(log => this.levelPriority[log.level] >= minLevel);
    }

    if (startTime) {
      results = results.filter(log => new Date(log.timestamp) >= new Date(startTime));
    }

    if (endTime) {
      results = results.filter(log => new Date(log.timestamp) <= new Date(endTime));
    }

    if (search) {
      const searchLower = search.toLowerCase();
      results = results.filter(log =>
        log.message.toLowerCase().includes(searchLower) ||
        JSON.stringify(log.metadata).toLowerCase().includes(searchLower)
      );
    }

    // Sort by timestamp descending
    results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // Apply pagination
    return results.slice(offset, offset + limit);
  }

  getLogStats(streamId = null) {
    const stats = {
      totalLogs: 0,
      byLevel: {},
      byAgent: {},
      streams: {},
      archived: this.archives.size,
      lastFlush: this.stats.lastFlush
    };

    for (const stream of this.streams.values()) {
      if (streamId && stream.id !== streamId) continue;

      stats.streams[stream.id] = {
        name: stream.name,
        count: stream.logs.length,
        size: stream.size,
        archived: stream.archived
      };

      for (const log of stream.logs) {
        stats.totalLogs++;
        stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
        if (log.agentId) {
          stats.byAgent[log.agentId] = (stats.byAgent[log.agentId] || 0) + 1;
        }
      }
    }

    return stats;
  }

  getAggregatedMetrics(timeWindow = '1h') {
    const now = new Date();
    let startTime = new Date(now);

    switch (timeWindow) {
      case '5m':
        startTime.setMinutes(startTime.getMinutes() - 5);
        break;
      case '1h':
        startTime.setHours(startTime.getHours() - 1);
        break;
      case '24h':
        startTime.setDate(startTime.getDate() - 1);
        break;
      case '7d':
        startTime.setDate(startTime.getDate() - 7);
        break;
      default:
        startTime.setHours(startTime.getHours() - 1);
    }

    const metrics = {
      timeWindow,
      startTime: startTime.toISOString(),
      endTime: now.toISOString(),
      totalLogs: 0,
      byLevel: {},
      byAgent: {},
      errorRate: 0,
      avgLogsPerMinute: 0
    };

    let totalErrors = 0;
    let logsInWindow = [];

    for (const stream of this.streams.values()) {
      for (const log of stream.logs) {
        if (new Date(log.timestamp) >= startTime) {
          logsInWindow.push(log);
          metrics.totalLogs++;
          metrics.byLevel[log.level] = (metrics.byLevel[log.level] || 0) + 1;

          if (log.agentId) {
            metrics.byAgent[log.agentId] = (metrics.byAgent[log.agentId] || 0) + 1;
          }

          if (log.level === 'error' || log.level === 'fatal') {
            totalErrors++;
          }
        }
      }
    }

    // Calculate rates
    const durationMinutes = (now - startTime) / 60000;
    metrics.avgLogsPerMinute = metrics.totalLogs / durationMinutes;
    metrics.errorRate = metrics.totalLogs > 0 ? (totalErrors / metrics.totalLogs) * 100 : 0;

    return metrics;
  }

  createAlertRule(alertConfig) {
    const {
      name,
      condition,
      threshold,
      duration,
      severity = 'warning'
    } = alertConfig;

    const rule = {
      id: crypto.randomUUID(),
      name,
      condition,
      threshold,
      duration: duration || 60000,
      severity,
      enabled: true,
      triggered: false,
      lastTriggered: null,
      createdAt: new Date().toISOString()
    };

    console.log(`Alert rule created: ${rule.id} (${name})`);
    return rule;
  }

  checkAlerts(rules) {
    const alerts = [];
    const now = new Date();

    for (const rule of rules) {
      if (!rule.enabled) continue;

      let conditionMet = false;

      switch (rule.condition) {
        case 'error_rate_above':
          const metrics = this.getAggregatedMetrics('5m');
          conditionMet = metrics.errorRate > rule.threshold;
          break;
        case 'logs_above':
          const stream = this.streams.get(rule.streamId);
          if (stream) {
            conditionMet = stream.logs.length > rule.threshold;
          }
          break;
        case 'no_logs':
          const recentLogs = this.queryLogs({
            startTime: new Date(now - rule.duration).toISOString(),
            limit: 1
          });
          conditionMet = recentLogs.length === 0;
          break;
      }

      if (conditionMet && !rule.triggered) {
        rule.triggered = true;
        rule.lastTriggered = now.toISOString();

        alerts.push({
          ruleId: rule.id,
          ruleName: rule.name,
          severity: rule.severity,
          triggeredAt: now.toISOString(),
          message: `Alert triggered: ${rule.name}`
        });
      } else if (!conditionMet && rule.triggered) {
        rule.triggered = false;
      }
    }

    return alerts;
  }

  exportLogs(exportConfig) {
    const {
      streamId,
      format = 'json',
      startTime,
      endTime,
      compress = false
    } = exportConfig;

    const logs = this.queryLogs({
      streamId,
      startTime,
      endTime,
      limit: 100000
    });

    let output;
    if (format === 'json') {
      output = JSON.stringify(logs, null, 2);
    } else if (format === 'csv') {
      const headers = 'timestamp,level,agentId,message\n';
      const rows = logs.map(log =>
        `"${log.timestamp}","${log.level}","${log.agentId || ''}","${log.message.replace(/"/g, '""')}"`
      ).join('\n');
      output = headers + rows;
    }

    if (compress) {
      output = zlib.deflateSync(output);
    }

    console.log(`Exported ${logs.length} logs (format: ${format}, compressed: ${compress})`);
    return {
      logs: logs.length,
      format,
      compressed: compress,
      size: output.length,
      data: compress ? output.toString('base64') : output
    };
  }

  flush() {
    for (const stream of this.streams.values()) {
      this._checkRetention(stream);
    }

    this.stats.lastFlush = new Date().toISOString();
    console.log('Log buffers flushed');
    return { success: true, flushedAt: this.stats.lastFlush };
  }

  listStreams() {
    return Array.from(this.streams.values()).map(s => ({
      id: s.id,
      name: s.name,
      agentId: s.agentId,
      logCount: s.logs.length,
      size: s.size,
      createdAt: s.createdAt
    }));
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const aggregator = new AgentLoggingAggregator({
    retentionDays: 30,
    maxLogSize: 1000,
    compressionEnabled: true
  });

  switch (command) {
    case 'create-stream':
      const streamName = args[1] || 'default';
      const stream = aggregator.createLogStream({
        name: streamName,
        agentId: args[2] || null
      });
      console.log('Stream created:', stream.id);
      break;

    case 'ingest':
      const ingestStreamId = args[1] || 'default';
      const level = args[2] || 'info';
      const message = args[3] || 'Test log message';
      const log = aggregator.ingestLog({
        streamId: ingestStreamId,
        level,
        message,
        agentId: 'agent-001'
      });
      console.log('Log ingested:', log.id);
      break;

    case 'query':
      console.log('Logs:', aggregator.queryLogs({ limit: 10 }));
      break;

    case 'stats':
      console.log('Stats:', aggregator.getLogStats());
      break;

    case 'demo':
      console.log('=== Agent Logging Aggregator Demo ===\n');

      // Create streams
      console.log('1. Creating log streams...');
      const prodStream = aggregator.createLogStream({
        name: 'production',
        agentId: null,
        retentionDays: 7
      });
      console.log('   Created stream:', prodStream.name);

      const devStream = aggregator.createLogStream({
        name: 'development',
        agentId: null,
        retentionDays: 3
      });
      console.log('   Created stream:', devStream.name);

      // Ingest logs
      console.log('\n2. Ingesting logs...');

      // Production agent logs
      aggregator.ingestLog({
        streamId: prodStream.id,
        level: 'info',
        message: 'Agent started successfully',
        agentId: 'data-processor'
      });
      aggregator.ingestLog({
        streamId: prodStream.id,
        level: 'debug',
        message: 'Processing batch job',
        agentId: 'data-processor',
        metadata: { batchId: 'batch-123', items: 1000 }
      });
      aggregator.ingestLog({
        streamId: prodStream.id,
        level: 'warn',
        message: 'High memory usage detected',
        agentId: 'data-processor',
        metadata: { memory: '85%' }
      });
      aggregator.ingestLog({
        streamId: prodStream.id,
        level: 'error',
        message: 'Connection timeout to database',
        agentId: 'api-gateway',
        metadata: { endpoint: 'db-primary', timeout: 30000 }
      });

      // Development agent logs
      aggregator.ingestLog({
        streamId: devStream.id,
        level: 'info',
        message: 'Development agent initialized',
        agentId: 'dev-agent'
      });
      aggregator.ingestLog({
        streamId: devStream.id,
        level: 'debug',
        message: 'Loading configuration',
        agentId: 'dev-agent'
      });

      console.log('   Ingested 6 logs');

      // Query logs
      console.log('\n3. Querying all logs:');
      const allLogs = aggregator.queryLogs({ limit: 10 });
      console.log('   Found', allLogs.length, 'logs');

      // Query by level
      console.log('\n4. Query error logs:');
      const errorLogs = aggregator.queryLogs({ level: 'error', limit: 10 });
      errorLogs.forEach(log => {
        console.log(`   [${log.level}] ${log.message}`);
      });

      // Query by agent
      console.log('\n5. Query data-processor logs:');
      const agentLogs = aggregator.queryLogs({ agentId: 'data-processor', limit: 10 });
      console.log('   Found', agentLogs.length, 'logs for data-processor');

      // Get statistics
      console.log('\n6. Log Statistics:');
      const stats = aggregator.getLogStats();
      console.log('   Total logs:', stats.totalLogs);
      console.log('   By level:', JSON.stringify(stats.byLevel));
      console.log('   By agent:', JSON.stringify(stats.byAgent));

      // Get aggregated metrics
      console.log('\n7. Aggregated Metrics (1h):');
      const metrics = aggregator.getAggregatedMetrics('1h');
      console.log('   Total:', metrics.totalLogs);
      console.log('   Error rate:', metrics.errorRate.toFixed(2), '%');
      console.log('   Avg/min:', metrics.avgLogsPerMinute.toFixed(2));

      // Create alert rules
      console.log('\n8. Creating alert rules...');
      const errorAlert = aggregator.createAlertRule({
        name: 'High Error Rate',
        condition: 'error_rate_above',
        threshold: 10,
        severity: 'critical'
      });
      console.log('   Created:', errorAlert.name);

      const noLogAlert = aggregator.createAlertRule({
        name: 'No Logs Received',
        condition: 'no_logs',
        threshold: 0,
        duration: 300000,
        severity: 'warning'
      });
      console.log('   Created:', noLogAlert.name);

      // Check alerts
      console.log('\n9. Checking alerts...');
      const alerts = aggregator.checkAlerts([errorAlert, noLogAlert]);
      console.log('   Active alerts:', alerts.length);

      // Export logs
      console.log('\n10. Exporting logs...');
      const exported = aggregator.exportLogs({
        streamId: prodStream.id,
        format: 'json',
        compress: false
      });
      console.log('   Exported:', exported.logs, 'logs');

      // List streams
      console.log('\n11. Log Streams:');
      const streams = aggregator.listStreams();
      streams.forEach(s => {
        console.log(`   ${s.name}: ${s.logCount} logs`);
      });

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-logging.js <command> [args]');
      console.log('\nCommands:');
      console.log('  create-stream [name] [agentId]  Create a log stream');
      console.log('  ingest <stream> <level> <msg>  Ingest a log');
      console.log('  query                        Query logs');
      console.log('  stats                        Get log statistics');
      console.log('  demo                         Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentLoggingAggregator;
