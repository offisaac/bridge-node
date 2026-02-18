/**
 * Agent Metrics - Agent指标收集与聚合系统
 * 实时指标收集、聚合与分析
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ========== Metric Types ==========

const MetricType = {
  COUNTER: 'counter',       // 计数器
  GAUGE: 'gauge',         // 仪表盘
  HISTOGRAM: 'histogram',  // 直方图
  SUMMARY: 'summary',      // 摘要
  RATE: 'rate'            // 速率
};

const MetricUnit = {
  MILLISECONDS: 'ms',
  SECONDS: 's',
  BYTES: 'bytes',
  COUNT: 'count',
  PERCENT: '%',
  REQUESTS: 'req'
};

// ========== Data Models ==========

class Metric {
  constructor(name, type, options = {}) {
    this.name = name;
    this.type = type;
    this.labels = options.labels || {};
    this.description = options.description || '';
    this.unit = options.unit || '';
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      labels: this.labels,
      description: this.description,
      unit: this.unit
    };
  }
}

class Counter extends Metric {
  constructor(name, options = {}) {
    super(name, MetricType.COUNTER, options);
    this.value = 0;
  }

  increment(amount = 1) {
    this.value += amount;
    return this.value;
  }

  getValue() {
    return this.value;
  }

  reset() {
    this.value = 0;
  }
}

class Gauge extends Metric {
  constructor(name, options = {}) {
    super(name, MetricType.GAUGE, options);
    this.value = 0;
  }

  set(value) {
    this.value = value;
    return this.value;
  }

  increment(amount = 1) {
    this.value += amount;
    return this.value;
  }

  decrement(amount = 1) {
    this.value -= amount;
    return this.value;
  }

  getValue() {
    return this.value;
  }
}

class Histogram extends Metric {
  constructor(name, options = {}) {
    super(name, MetricType.HISTOGRAM, options);
    this.buckets = options.buckets || [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
    this.values = [];
    this.sum = 0;
    this.count = 0;
  }

  observe(value) {
    this.values.push(value);
    this.sum += value;
    this.count++;
    return this;
  }

  getValue() {
    return {
      sum: this.sum,
      count: this.count,
      min: this.values.length > 0 ? Math.min(...this.values) : 0,
      max: this.values.length > 0 ? Math.max(...this.values) : 0,
      avg: this.count > 0 ? this.sum / this.count : 0,
      buckets: this._getBuckets()
    };
  }

  _getBuckets() {
    const result = {};
    for (const bucket of this.buckets) {
      const count = this.values.filter(v => v <= bucket).length;
      result[`<=${bucket}`] = count;
    }
    result['+Inf'] = this.count;
    return result;
  }

  getPercentiles(p = [0.5, 0.75, 0.9, 0.95, 0.99]) {
    if (this.values.length === 0) return {};

    const sorted = [...this.values].sort((a, b) => a - b);
    const result = {};

    for (const percentile of p) {
      const idx = Math.floor(sorted.length * percentile);
      result[`p${percentile * 100}`] = sorted[idx];
    }

    return result;
  }

  reset() {
    this.values = [];
    this.sum = 0;
    this.count = 0;
  }
}

class Summary extends Metric {
  constructor(name, options = {}) {
    super(name, MetricType.SUMMARY, options);
    this.values = [];
    this.count = 0;
    this.sum = 0;
    this.percentives = options.percentives || [0.5, 0.9, 0.99];
  }

  observe(value) {
    this.values.push(value);
    this.count++;
    this.sum += value;
    return this;
  }

  getValue() {
    const sorted = [...this.values].sort((a, b) => a - b);
    const percentiles = {};

    for (const p of this.percentives) {
      const idx = Math.floor(sorted.length * p);
      percentiles[`p${p * 100}`] = sorted[idx];
    }

    return {
      count: this.count,
      sum: this.sum,
      avg: this.count > 0 ? this.sum / this.count : 0,
      ...percentiles
    };
  }

  reset() {
    this.values = [];
    this.count = 0;
    this.sum = 0;
  }
}

class Rate extends Metric {
  constructor(name, options = {}) {
    super(name, MetricType.RATE, options);
    this.values = []; // timestamped values
    this.windowMs = options.windowMs || 60000; // 1 minute default
  }

  record(value) {
    this.values.push({ time: Date.now(), value });
    this._prune();
    return this;
  }

  _prune() {
    const cutoff = Date.now() - this.windowMs;
    this.values = this.values.filter(v => v.time > cutoff);
  }

  getValue() {
    this._prune();
    if (this.values.length < 2) return 0;

    const first = this.values[0];
    const last = this.values[this.values.length - 1];
    const timeDiff = (last.time - first.time) / 1000;

    if (timeDiff === 0) return 0;

    const valueDiff = last.value - first.value;
    return valueDiff / timeDiff;
  }

  reset() {
    this.values = [];
  }
}

// ========== Main Metrics Collector ==========

class AgentMetrics extends EventEmitter {
  constructor(options = {}) {
    super();
    this.storageDir = options.storageDir || './agent-metrics-data';
    this.name = options.name || 'default';
    this.flushInterval = options.flushInterval || 60000; // 1 minute

    this.metrics = new Map(); // name -> metric
    this.agentMetrics = new Map(); // agentId -> { metrics }
    this.history = []; // Historical snapshots
    this.maxHistory = options.maxHistory || 1440; // 24 hours at 1-min intervals

    this.timer = null;

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this._loadMetrics();
  }

  _loadMetrics() {
    const stateFile = path.join(this.storageDir, `${this.name}-metrics.json`);
    if (fs.existsSync(stateFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        // Note: Runtime metrics (counters, etc.) are not persisted
      } catch (e) {
        console.error('Failed to load metrics state:', e);
      }
    }
  }

  _saveMetrics() {
    const stateFile = path.join(this.storageDir, `${this.name}-metrics.json`);
    const data = {
      savedAt: Date.now()
    };
    fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
  }

  // ========== Metric Registration ==========

  registerCounter(name, options = {}) {
    const counter = new Counter(name, options);
    this.metrics.set(name, counter);
    return counter;
  }

  registerGauge(name, options = {}) {
    const gauge = new Gauge(name, options);
    this.metrics.set(name, gauge);
    return gauge;
  }

  registerHistogram(name, options = {}) {
    const histogram = new Histogram(name, options);
    this.metrics.set(name, histogram);
    return histogram;
  }

  registerSummary(name, options = {}) {
    const summary = new Summary(name, options);
    this.metrics.set(name, summary);
    return summary;
  }

  registerRate(name, options = {}) {
    const rate = new Rate(name, options);
    this.metrics.set(name, rate);
    return rate;
  }

  // ========== Convenient Methods ==========

  incrementCounter(name, amount = 1, labels = {}) {
    const key = this._getKey(name, labels);
    let metric = this.metrics.get(key);

    if (!metric || metric.type !== MetricType.COUNTER) {
      metric = this.registerCounter(key, { labels, description: name });
    }

    return metric.increment(amount);
  }

  setGauge(name, value, labels = {}) {
    const key = this._getKey(name, labels);
    let metric = this.metrics.get(key);

    if (!metric || metric.type !== MetricType.GAUGE) {
      metric = this.registerGauge(key, { labels, description: name });
    }

    return metric.set(value);
  }

  observeHistogram(name, value, labels = {}) {
    const key = this._getKey(name, labels);
    let metric = this.metrics.get(key);

    if (!metric || metric.type !== MetricType.HISTOGRAM) {
      metric = this.registerHistogram(key, { labels, description: name });
    }

    return metric.observe(value);
  }

  recordRate(name, value, labels = {}) {
    const key = this._getKey(name, labels);
    let metric = this.metrics.get(key);

    if (!metric || metric.type !== MetricType.RATE) {
      metric = this.registerRate(key, { labels, description: name });
    }

    return metric.record(value);
  }

  _getKey(name, labels) {
    if (Object.keys(labels).length === 0) return name;
    const labelStr = Object.entries(labels)
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${labelStr}}`;
  }

  // ========== Agent-scoped Metrics ==========

  recordAgentMetric(agentId, metricName, value, type = 'gauge') {
    if (!this.agentMetrics.has(agentId)) {
      this.agentMetrics.set(agentId, new Map());
    }

    const agentMetrics = this.agentMetrics.get(agentId);
    let metric = agentMetrics.get(metricName);

    if (!metric) {
      switch (type) {
        case 'counter':
          metric = new Counter(metricName);
          break;
        case 'histogram':
          metric = new Histogram(metricName);
          break;
        default:
          metric = new Gauge(metricName);
      }
      agentMetrics.set(metricName, metric);
    }

    if (type === 'counter') {
      metric.increment(value);
    } else if (type === 'histogram') {
      metric.observe(value);
    } else {
      metric.set(value);
    }

    return metric;
  }

  // ========== Query ==========

  getMetric(name) {
    return this.metrics.get(name) || null;
  }

  getAllMetrics() {
    const result = {};
    for (const [name, metric] of this.metrics) {
      if (metric instanceof Histogram || metric instanceof Summary) {
        result[name] = metric.getValue();
      } else {
        result[name] = metric.getValue();
      }
    }
    return result;
  }

  getAgentMetrics(agentId) {
    const agentMetrics = this.agentMetrics.get(agentId);
    if (!agentMetrics) return {};

    const result = {};
    for (const [name, metric] of agentMetrics) {
      result[name] = metric.getValue();
    }
    return result;
  }

  listMetrics() {
    const result = [];
    for (const [name, metric] of this.metrics) {
      result.push(metric.toJSON());
    }
    return result;
  }

  // ========== Snapshot & History ==========

  snapshot() {
    const snapshot = {
      timestamp: Date.now(),
      metrics: {},
      agents: {}
    };

    // Global metrics
    for (const [name, metric] of this.metrics) {
      if (metric instanceof Histogram) {
        snapshot.metrics[name] = {
          ...metric.getValue(),
          percentiles: metric.getPercentiles()
        };
      } else {
        snapshot.metrics[name] = metric.getValue();
      }
    }

    // Agent metrics
    for (const [agentId, metrics] of this.agentMetrics) {
      snapshot.agents[agentId] = {};
      for (const [name, metric] of metrics) {
        snapshot.agents[agentId][name] = metric.getValue();
      }
    }

    this.history.push(snapshot);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }

    this._saveMetrics();
    this.emit('snapshot', snapshot);

    return snapshot;
  }

  getHistory(limit = 60) {
    return this.history.slice(-limit);
  }

  // ========== Aggregation ==========

  aggregateByAgent(metricName) {
    const result = {};
    for (const [agentId, metrics] of this.agentMetrics) {
      const metric = metrics.get(metricName);
      if (metric) {
        result[agentId] = metric.getValue();
      }
    }
    return result;
  }

  aggregateSum(metricName) {
    let sum = 0;
    for (const [, metrics] of this.agentMetrics) {
      const metric = metrics.get(metricName);
      if (metric && typeof metric.getValue() === 'number') {
        sum += metric.getValue();
      }
    }
    return sum;
  }

  aggregateAvg(metricName) {
    let count = 0;
    let sum = 0;
    for (const [, metrics] of this.agentMetrics) {
      const metric = metrics.get(metricName);
      if (metric && typeof metric.getValue() === 'number') {
        sum += metric.getValue();
        count++;
      }
    }
    return count > 0 ? sum / count : 0;
  }

  // ========== Timer ==========

  startAutoFlush() {
    if (this.timer) return;
    this.timer = setInterval(() => this.snapshot(), this.flushInterval);
    this.emit('auto-flush-started');
  }

  stopAutoFlush() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.emit('auto-flush-stopped');
  }

  // ========== Reset ==========

  reset() {
    for (const [, metric] of this.metrics) {
      metric.reset();
    }
    this.emit('reset');
  }

  resetAgentMetrics(agentId) {
    if (this.agentMetrics.has(agentId)) {
      this.agentMetrics.delete(agentId);
    }
  }

  // ========== Statistics ==========

  getStats() {
    return {
      totalMetrics: this.metrics.size,
      agentCount: this.agentMetrics.size,
      historyLength: this.history.length,
      snapshotInterval: this.flushInterval,
      metrics: this.listMetrics().map(m => ({ name: m.name, type: m.type }))
    };
  }

  // ========== Export ==========

  exportPrometheus() {
    let output = '';

    for (const [name, metric] of this.metrics) {
      const labels = Object.keys(metric.labels).length > 0
        ? `{${Object.entries(metric.labels).map(([k, v]) => `${k}="${v}"`).join(',')}}`
        : '';

      if (metric instanceof Histogram) {
        const value = metric.getValue();
        output += `# HELP ${name} ${metric.description}\n`;
        output += `# TYPE ${name} histogram\n`;
        for (const [bucket, count] of Object.entries(value.buckets)) {
          output += `${name}_bucket${labels}{${bucket}} ${count}\n`;
        }
        output += `${name}_sum${labels} ${value.sum}\n`;
        output += `${name}_count${labels} ${value.count}\n`;
      } else if (metric instanceof Summary) {
        const value = metric.getValue();
        output += `# HELP ${name} ${metric.description}\n`;
        output += `# TYPE ${name} summary\n`;
        for (const [p, v] of Object.entries(value)) {
          if (p !== 'count' && p !== 'sum' && p !== 'avg') {
            output += `${name}${labels}{quantile="${p}"} ${v}\n`;
          }
        }
        output += `${name}_sum${labels} ${value.sum}\n`;
        output += `${name}_count${labels} ${value.count}\n`;
      } else if (metric instanceof Rate) {
        output += `# HELP ${name} ${metric.description}\n`;
        output += `# TYPE ${name} gauge\n`;
        output += `${name}${labels} ${metric.getValue().toFixed(4)}\n`;
      } else {
        output += `# HELP ${name} ${metric.description}\n`;
        output += `# TYPE ${name} ${metric.type}\n`;
        output += `${name}${labels} ${metric.getValue()}\n`;
      }
    }

    return output;
  }
}

// ========== Multi-Metrics Manager ==========

class MetricsManager {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './agent-metrics-data';
    this.collectors = new Map();
    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
  }

  getOrCreate(name, options = {}) {
    if (!this.collectors.has(name)) {
      this.collectors.set(name, new AgentMetrics({
        name,
        storageDir: this.storageDir,
        ...options
      }));
    }
    return this.collectors.get(name);
  }

  listCollectors() {
    return Array.from(this.collectors.keys());
  }

  getStats() {
    const stats = {};
    for (const [name, collector] of this.collectors) {
      stats[name] = collector.getStats();
    }
    return stats;
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new MetricsManager();
  const metrics = manager.getOrCreate(args[1] || 'default');

  switch (command) {
    case 'counter':
      metrics.incrementCounter(args[1] || 'requests', 1);
      console.log(`Counter incremented: ${metrics.getMetric(args[1] || 'requests')?.getValue()}`);
      break;

    case 'gauge':
      metrics.setGauge(args[1] || 'cpu_usage', parseFloat(args[2]) || 50);
      console.log(`Gauge set: ${metrics.getMetric(args[1] || 'cpu_usage')?.getValue()}`);
      break;

    case 'histogram':
      metrics.observeHistogram(args[1] || 'request_duration', parseFloat(args[2]) || 100);
      console.log(`Histogram observed`);
      break;

    case 'list':
      console.log('Registered Metrics:');
      for (const m of metrics.listMetrics()) {
        console.log(`  ${m.name} (${m.type})`);
      }
      break;

    case 'get':
      const metric = metrics.getMetric(args[1]);
      if (metric) {
        console.log(JSON.stringify(metric.getValue(), null, 2));
      } else {
        console.log('Metric not found');
      }
      break;

    case 'snapshot':
      console.log('Taking snapshot...');
      const snapshot = metrics.snapshot();
      console.log(JSON.stringify(snapshot, null, 2));
      break;

    case 'history':
      console.log('History:');
      for (const s of metrics.getHistory(10)) {
        console.log(`  ${new Date(s.timestamp).toLocaleString()}: ${Object.keys(s.metrics).length} metrics`);
      }
      break;

    case 'stats':
      console.log('Metrics Statistics:');
      console.log(JSON.stringify(metrics.getStats(), null, 2));
      break;

    case 'prometheus':
      console.log(metrics.exportPrometheus());
      break;

    case 'demo':
      console.log('=== Agent Metrics Demo ===\n');

      // Register and record various metrics
      metrics.incrementCounter('agent_requests_total', 0);
      metrics.setGauge('agent_cpu_percent', 0);
      metrics.registerHistogram('agent_request_duration_ms');
      metrics.registerRate('agent_requests_per_second');

      // Simulate metrics collection
      for (let i = 0; i < 20; i++) {
        metrics.incrementCounter('agent_requests_total', Math.floor(Math.random() * 10) + 1);
        metrics.setGauge('agent_cpu_percent', Math.random() * 100);
        metrics.observeHistogram('agent_request_duration_ms', Math.random() * 1000);
        metrics.recordRate('agent_requests_per_second', Math.random() * 100);
      }

      console.log('--- All Metrics ---');
      console.log(JSON.stringify(metrics.getAllMetrics(), null, 2));

      console.log('\n--- Agent Metrics (simulated) ---');
      metrics.recordAgentMetric('agent-1', 'tasks_completed', 100, 'counter');
      metrics.recordAgentMetric('agent-1', 'memory_usage', 1024 * 1024 * 256, 'gauge');
      metrics.recordAgentMetric('agent-2', 'tasks_completed', 50, 'counter');
      metrics.recordAgentMetric('agent-2', 'memory_usage', 1024 * 1024 * 128, 'gauge');

      console.log('Agent-1:', JSON.stringify(metrics.getAgentMetrics('agent-1'), null, 2));
      console.log('Agent-2:', JSON.stringify(metrics.getAgentMetrics('agent-2'), null, 2));

      console.log('\n--- Aggregation ---');
      console.log('Sum of tasks_completed:', metrics.aggregateSum('tasks_completed'));
      console.log('Avg of memory_usage:', metrics.aggregateAvg('memory_usage'));

      console.log('\n--- Statistics ---');
      console.log(JSON.stringify(metrics.getStats(), null, 2));

      console.log('\n--- Prometheus Export ---');
      console.log(metrics.exportPrometheus());

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage:');
      console.log('  node agent-metrics.js counter <name> [amount]');
      console.log('  node agent-metrics.js gauge <name> <value>');
      console.log('  node agent-metrics.js histogram <name> <value>');
      console.log('  node agent-metrics.js list');
      console.log('  node agent-metrics.js get <name>');
      console.log('  node agent-metrics.js snapshot');
      console.log('  node agent-metrics.js history');
      console.log('  node agent-metrics.js stats');
      console.log('  node agent-metrics.js prometheus');
      console.log('  node agent-metrics.js demo');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  AgentMetrics,
  MetricsManager,
  Metric,
  Counter,
  Gauge,
  Histogram,
  Summary,
  Rate,
  MetricType,
  MetricUnit
};
