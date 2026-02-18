/**
 * Agent Metrics3 - Metrics Collection Agent
 *
 * Provides advanced metrics collection with time series and aggregation.
 *
 * Usage: node agent-metrics3.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   collect    - Collect test metrics
 *   query      - Query metrics
 */

class MetricPoint {
  constructor(config) {
    this.timestamp = config.timestamp || Date.now();
    this.value = config.value;
    this.labels = config.labels || {};
  }
}

class TimeSeries {
  constructor(name, labels = {}) {
    this.name = name;
    this.labels = labels;
    this.points = [];
    this.maxPoints = 1000;
  }

  addPoint(value, timestamp) {
    this.points.push(new MetricPoint({ value, timestamp }));
    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }
  }

  query(startTime, endTime) {
    return this.points.filter(p => p.timestamp >= startTime && p.timestamp <= endTime);
  }

  latest() {
    return this.points[this.points.length - 1];
  }

  min() {
    return Math.min(...this.points.map(p => p.value));
  }

  max() {
    return Math.max(...this.points.map(p => p.value));
  }

  avg() {
    const sum = this.points.reduce((a, b) => a + b.value, 0);
    return this.points.length > 0 ? sum / this.points.length : 0;
  }
}

class MetricAggregator {
  constructor(config) {
    this.id = `agg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.type = config.type; // sum, avg, min, max, count
    this.interval = config.interval || 60000;
  }
}

class Metrics3Agent {
  constructor(config = {}) {
    this.name = config.name || 'Metrics3Agent';
    this.version = config.version || '3.0';
    this.series = new Map();
    this.aggregators = new Map();
    this.stats = {
      metricsRecorded: 0,
      queriesExecuted: 0,
      aggregationsRun: 0
    };
    this.initDefaults();
  }

  initDefaults() {
    // Default aggregators
    const defaults = [
      new MetricAggregator({ name: '1m_avg', type: 'avg', interval: 60000 }),
      new MetricAggregator({ name: '5m_avg', type: 'avg', interval: 300000 }),
      new MetricAggregator({ name: '1h_avg', type: 'avg', interval: 3600000 }),
      new MetricAggregator({ name: '1m_sum', type: 'sum', interval: 60000 })
    ];
    defaults.forEach(a => this.aggregators.set(a.id, a));
  }

  _makeKey(name, labels) {
    const labelStr = Object.entries(labels).sort().map(([k, v]) => `${k}=${v}`).join(',');
    return labelStr ? `${name}{${labelStr}}` : name;
  }

  record(name, value, labels = {}) {
    const key = this._makeKey(name, labels);

    if (!this.series.has(key)) {
      this.series.set(key, new TimeSeries(name, labels));
    }

    this.series.get(key).addPoint(value, Date.now());
    this.stats.metricsRecorded++;

    return this.series.get(key);
  }

  query(name, labels = {}, startTime = 0, endTime = Date.now()) {
    this.stats.queriesExecuted++;

    if (labels && Object.keys(labels).length > 0) {
      const key = this._makeKey(name, labels);
      const ts = this.series.get(key);
      return ts ? ts.query(startTime, endTime) : [];
    }

    // Query all series matching name
    const results = [];
    for (const [key, ts] of this.series) {
      if (ts.name === name) {
        results.push(...ts.query(startTime, endTime));
      }
    }
    return results;
  }

  aggregate(name, type = 'avg', windowMs = 60000) {
    this.stats.aggregationsRun++;

    const endTime = Date.now();
    const startTime = endTime - windowMs;
    const points = this.query(name, {}, startTime, endTime);

    if (points.length === 0) return null;

    switch (type) {
      case 'sum':
        return points.reduce((a, b) => a + b.value, 0);
      case 'min':
        return Math.min(...points.map(p => p.value));
      case 'max':
        return Math.max(...points.map(p => p.value));
      case 'count':
        return points.length;
      case 'avg':
      default:
        return points.reduce((a, b) => a + b.value, 0) / points.length;
    }
  }

  getSeries(name, labels = {}) {
    const key = this._makeKey(name, labels);
    return this.series.get(key);
  }

  listMetrics() {
    const metrics = new Set();
    for (const ts of this.series.values()) {
      metrics.add(ts.name);
    }
    return Array.from(metrics);
  }

  getStats() {
    return {
      ...this.stats,
      uniqueMetrics: this.listMetrics().length,
      timeSeriesCount: this.series.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const metrics = new Metrics3Agent();

switch (command) {
  case 'demo': {
    console.log('=== Agent Metrics3 Demo\n');

    // 1. Record Metrics
    console.log('1. Record Metrics:');
    metrics.record('cpu_usage', 45.2, { env: 'production', region: 'us-east-1' });
    metrics.record('memory_usage', 72.8, { env: 'production', region: 'us-east-1' });
    metrics.record('disk_usage', 65.0, { env: 'production', region: 'us-east-1' });
    metrics.record('request_count', 1520, { env: 'production', service: 'api' });
    metrics.record('request_latency', 145, { env: 'production', service: 'api' });
    console.log(`   Recorded 5 metric points`);

    // 2. Multiple Environments
    console.log('\n2. Multiple Environments:');
    metrics.record('cpu_usage', 35.5, { env: 'staging', region: 'us-east-1' });
    metrics.record('cpu_usage', 28.3, { env: 'development', region: 'us-east-1' });
    console.log(`   cpu_usage now tracked across 3 environments`);

    // 3. Query Metrics
    console.log('\n3. Query Metrics:');
    const cpuPoints = metrics.query('cpu_usage', { env: 'production' });
    console.log(`   CPU points (production): ${cpuPoints.length}`);

    const allCpu = metrics.query('cpu_usage');
    console.log(`   CPU points (all): ${allCpu.length}`);

    // 4. Aggregations
    console.log('\n4. Aggregations:');
    const avgCpu = metrics.aggregate('cpu_usage', 'avg', 300000);
    console.log(`   Average CPU (5m): ${avgCpu?.toFixed(2)}`);

    const maxLatency = metrics.aggregate('request_latency', 'max', 300000);
    console.log(`   Max latency (5m): ${maxLatency}`);

    const totalRequests = metrics.aggregate('request_count', 'sum', 300000);
    console.log(`   Total requests (5m): ${totalRequests}`);

    // 5. Time Series Analysis
    console.log('\n5. Time Series Analysis:');
    const series = metrics.getSeries('cpu_usage', { env: 'production' });
    if (series) {
      console.log(`   Latest: ${series.latest()?.value}`);
      console.log(`   Min: ${series.min()}`);
      console.log(`   Max: ${series.max()}`);
      console.log(`   Avg: ${series.avg().toFixed(2)}`);
    }

    // 6. Additional Metrics
    console.log('\n6. Additional Metrics:');
    metrics.record('error_count', 5, { env: 'production', service: 'api' });
    metrics.record('active_connections', 342, { env: 'production' });
    metrics.record('queue_depth', 28, { env: 'production', component: 'worker' });
    console.log(`   Recorded 3 more metrics`);

    // 7. Metric Types
    console.log('\n7. Metric Types:');
    console.log(`   Gauge: cpu_usage, memory_usage`);
    console.log(`   Counter: request_count, error_count`);
    console.log(`   Histogram: request_latency`);

    // 8. Aggregators
    console.log('\n8. Aggregators:');
    const aggregators = Array.from(metrics.aggregators.values());
    aggregators.forEach(a => {
      console.log(`   ${a.name}: ${a.type} (${a.interval / 1000}s)`);
    });

    // 9. Time Windows
    console.log('\n9. Time Windows:');
    console.log(`   Real-time: Last 1 minute`);
    console.log(`   Short-term: Last 5 minutes`);
    console.log(`   Medium-term: Last 1 hour`);
    console.log(`   Long-term: Last 24 hours`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = metrics.getStats();
    console.log(`   Metrics recorded: ${stats.metricsRecorded}`);
    console.log(`   Queries executed: ${stats.queriesExecuted}`);
    console.log(`   Aggregations run: ${stats.aggregationsRun}`);
    console.log(`   Unique metrics: ${stats.uniqueMetrics}`);
    console.log(`   Time series: ${stats.timeSeriesCount}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'collect': {
    const metricName = args[1] || 'test_metric';
    const value = parseFloat(args[2]) || Math.random() * 100;
    metrics.record(metricName, value, { source: 'cli' });
    console.log(`Recorded: ${metricName} = ${value.toFixed(2)}`);
    break;
  }

  case 'query': {
    const metricName = args[1];
    if (metricName) {
      const points = metrics.query(metricName);
      console.log(`Found ${points.length} points:`);
      points.forEach(p => {
        console.log(`  ${new Date(p.timestamp).toISOString()}: ${p.value}`);
      });
    } else {
      console.log('Usage: node agent-metrics3.js query <metric-name>');
    }
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-metrics3.js [demo|collect|query]');
  }
}
