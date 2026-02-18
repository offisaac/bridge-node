/**
 * Metrics Collector - 指标收集器
 * 实现自定义指标收集代理
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ========== Metric Types ==========

const MetricType = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  SUMMARY: 'summary',
  UNTYPED: 'untyped'
};

const MetricAggregator = {
  SUM: 'sum',
  AVG: 'avg',
  MIN: 'min',
  MAX: 'max',
  COUNT: 'count',
  LAST: 'last'
};

// ========== Label Set ==========

class LabelSet {
  constructor(labels = {}) {
    this.labels = labels;
  }

  match(otherLabels) {
    for (const [key, value] of Object.entries(otherLabels)) {
      if (this.labels[key] !== value) {
        return false;
      }
    }
    return true;
  }

  toString() {
    return Object.entries(this.labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  toJSON() {
    return this.labels;
  }
}

// ========== Metric Point ==========

class MetricPoint {
  constructor(value, timestamp = Date.now()) {
    this.value = value;
    this.timestamp = timestamp;
  }
}

// ========== Time Series ==========

class TimeSeries {
  constructor(name, type, labels, aggregator = MetricAggregator.LAST) {
    this.name = name;
    this.type = type;
    this.labels = labels instanceof LabelSet ? labels : new LabelSet(labels);
    this.aggregator = aggregator;
    this.points = [];
    this.metadata = {};
  }

  addPoint(value, timestamp) {
    const point = new MetricPoint(value, timestamp);
    this.points.push(point);
    return this;
  }

  getValue(aggregator = this.aggregator) {
    if (this.points.length === 0) return null;

    const values = this.points.map(p => p.value);

    switch (aggregator) {
      case MetricAggregator.SUM:
        return values.reduce((a, b) => a + b, 0);
      case MetricAggregator.AVG:
        return values.reduce((a, b) => a + b, 0) / values.length;
      case MetricAggregator.MIN:
        return Math.min(...values);
      case MetricAggregator.MAX:
        return Math.max(...values);
      case MetricAggregator.COUNT:
        return values.length;
      case MetricAggregator.LAST:
        return values[values.length - 1];
      default:
        return values[values.length - 1];
    }
  }

  getRange(startTime, endTime) {
    return this.points.filter(p =>
      p.timestamp >= startTime && p.timestamp <= endTime
    );
  }

  prune(maxPoints) {
    if (this.points.length > maxPoints) {
      this.points = this.points.slice(-maxPoints);
    }
    return this;
  }

  toPrometheusFormat() {
    const labelsStr = this.labels.toString();
    const suffix = labelsStr ? `{${labelsStr}}` : '';

    return this.points.map(p =>
      `${this.name}${suffix} ${p.value} ${p.timestamp}`
    ).join('\n');
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      labels: this.labels.toJSON(),
      aggregator: this.aggregator,
      points: this.points.map(p => ({ value: p.value, timestamp: p.timestamp })),
      metadata: this.metadata
    };
  }
}

// ========== Metric Family ==========

class MetricFamily {
  constructor(config) {
    this.name = config.name;
    this.type = config.type || MetricType.GAUGE;
    this.help = config.help || '';
    this.unit = config.unit || '';
    this.series = new Map(); // labels string -> TimeSeries
  }

  getOrCreateSeries(labels) {
    const labelSet = labels instanceof LabelSet ? labels : new LabelSet(labels);
    const key = labelSet.toString();

    if (!this.series.has(key)) {
      this.series.set(key, new TimeSeries(this.name, this.type, labelSet));
    }

    return this.series.get(key);
  }

  getSeries(labels) {
    const labelSet = labels instanceof LabelSet ? labels : new LabelSet(labels);
    const key = labelSet.toString();
    return this.series.get(key);
  }

  matchSeries(labelFilter) {
    const results = [];
    for (const series of this.series.values()) {
      if (series.labels.match(labelFilter)) {
        results.push(series);
      }
    }
    return results;
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      help: this.help,
      unit: this.unit,
      series: Array.from(this.series.values()).map(s => s.toJSON())
    };
  }
}

// ========== Metrics Collector ==========

class MetricsCollector extends EventEmitter {
  constructor(options = {}) {
    super();
    this.name = options.name || 'metrics_collector';
    this.families = new Map(); // name -> MetricFamily
    this.interval = options.interval || 60000; // 1 minute default
    this.maxPointsPerSeries = options.maxPointsPerSeries || 1000;
    this.collectors = new Map(); // name -> collector function
    this.timer = null;
    this.startTime = Date.now();

    this._init();
  }

  _init() {
    // Built-in collectors
    this._registerBuiltInCollectors();
  }

  _registerBuiltInCollectors() {
    // Process metrics (simulated)
    this.registerCollector('process_cpu_seconds', () => ({
      type: MetricType.COUNTER,
      value: Math.random() * 100
    }));

    this.registerCollector('process_memory_bytes', () => ({
      type: MetricType.GAUGE,
      value: Math.random() * 1000000000
    }));

    this.registerCollector('http_requests_total', () => ({
      type: MetricType.COUNTER,
      value: Math.floor(Math.random() * 10000)
    }));

    this.registerCollector('http_request_duration_seconds', () => ({
      type: MetricType.HISTOGRAM,
      value: Math.random() * 2
    }));
  }

  // ========== Metric Registration ==========

  createMetric(name, type, help, unit = '') {
    if (this.families.has(name)) {
      return this.families.get(name);
    }

    const family = new MetricFamily({
      name,
      type,
      help,
      unit
    });

    this.families.set(name, family);
    this.emit('metric:created', { name, type });
    return family;
  }

  // Counter
  counter(name, help = '') {
    return this.createMetric(name, MetricType.COUNTER, help);
  }

  // Gauge
  gauge(name, help = '') {
    return this.createMetric(name, MetricType.GAUGE, help);
  }

  // Histogram
  histogram(name, help = '') {
    return this.createMetric(name, MetricType.HISTOGRAM, help);
  }

  // Summary
  summary(name, help = '') {
    return this.createMetric(name, MetricType.SUMMARY, help);
  }

  // ========== Recording ==========

  record(name, value, labels = {}, timestamp = Date.now()) {
    const family = this.families.get(name);
    if (!family) {
      console.warn(`Metric family not found: ${name}`);
      return null;
    }

    const series = family.getOrCreateSeries(labels);
    series.addPoint(value, timestamp);
    series.prune(this.maxPointsPerSeries);

    this.emit('record', { name, value, labels, timestamp });
    return series;
  }

  // Increment counter
  increment(name, labels = {}, amount = 1) {
    const family = this.families.get(name);
    if (!family) return null;

    const series = family.getOrCreateSeries(labels);
    const current = series.getValue(MetricAggregator.LAST) || 0;
    series.addPoint(current + amount);
    series.prune(this.maxPointsPerSeries);

    return series;
  }

  // Decrement counter
  decrement(name, labels = {}, amount = 1) {
    return this.increment(name, labels, -amount);
  }

  // Set gauge value
  set(name, value, labels = {}) {
    return this.record(name, value, labels);
  }

  // Observe histogram/summary
  observe(name, value, labels = {}) {
    return this.record(name, value, labels);
  }

  // ========== Collectors ==========

  registerCollector(name, collectorFn) {
    this.collectors.set(name, collectorFn);
  }

  unregisterCollector(name) {
    this.collectors.delete(name);
  }

  async collect() {
    const results = [];

    for (const [name, collectorFn] of this.collectors) {
      try {
        const result = await collectorFn();

        if (result) {
          const labels = result.labels || {};
          const value = result.value;

          // Ensure metric family exists
          let family = this.families.get(name);
          if (!family) {
            family = this.createMetric(name, result.type || MetricType.GAUGE, '');
          }

          // Record value
          family.getOrCreateSeries(labels).addPoint(value);
          results.push({ name, value, labels, type: result.type });
        }
      } catch (err) {
        console.error(`Collector error for ${name}:`, err);
        this.emit('collector:error', { name, error: err });
      }
    }

    this.emit('collected', results);
    return results;
  }

  // ========== Auto Collection ==========

  start(autoCollect = true) {
    if (autoCollect && !this.timer) {
      this.timer = setInterval(() => this.collect(), this.interval);
      this.emit('started');
    }
    return this;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.emit('stopped');
    }
    return this;
  }

  // ========== Querying ==========

  get(name, labelFilter = {}) {
    const family = this.families.get(name);
    if (!family) return null;

    if (Object.keys(labelFilter).length === 0) {
      return family;
    }

    const labelSet = new LabelSet(labelFilter);
    const series = family.matchSeries(labelSet);
    return series.length === 1 ? series[0] : series;
  }

  query(name, labelFilter = {}) {
    const family = this.families.get(name);
    if (!family) return [];

    const results = [];
    for (const series of family.series.values()) {
      if (series.labels.match(labelFilter)) {
        results.push({
          name: series.name,
          labels: series.labels.toJSON(),
          value: series.getValue(),
          type: series.type
        });
      }
    }

    return results;
  }

  // ========== Export ==========

  toPrometheusFormat() {
    let output = '';

    for (const family of this.families.values()) {
      // Add help and type
      if (family.help) {
        output += `# HELP ${family.name} ${family.help}\n`;
      }
      output += `# TYPE ${family.name} ${family.type}\n`;

      // Add series
      for (const series of family.series.values()) {
        output += series.toPrometheusFormat() + '\n';
      }

      output += '\n';
    }

    return output;
  }

  toJSON() {
    return {
      name: this.name,
      families: Array.from(this.families.values()).map(f => f.toJSON()),
      startTime: this.startTime,
      collected: this.collectors.size
    };
  }

  // ========== Persistence ==========

  save(filePath) {
    fs.writeFileSync(filePath, JSON.stringify(this.toJSON(), null, 2));
  }

  load(filePath) {
    if (!fs.existsSync(filePath)) return;

    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    for (const familyData of data.families || []) {
      const family = this.createMetric(familyData.name, familyData.type, familyData.help, familyData.unit);

      for (const seriesData of familyData.series || []) {
        const series = family.getOrCreateSeries(seriesData.labels);
        for (const point of seriesData.points || []) {
          series.addPoint(point.value, point.timestamp);
        }
      }
    }
  }

  // ========== Statistics ==========

  getStats() {
    let totalSeries = 0;
    let totalPoints = 0;

    for (const family of this.families.values()) {
      totalSeries += family.series.size;
      for (const series of family.series.values()) {
        totalPoints += series.points.length;
      }
    }

    return {
      name: this.name,
      families: this.families.size,
      series: totalSeries,
      points: totalPoints,
      collectors: this.collectors.size,
      running: this.timer !== null,
      uptime: Date.now() - this.startTime
    };
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const collector = new MetricsCollector({ name: 'app_metrics' });

  switch (command) {
    case 'start':
      console.log('Starting metrics collector...');
      collector.start();
      console.log('Collector started. Press Ctrl+C to stop.');

      // Keep running
      process.on('SIGINT', () => {
        console.log('\nStopping collector...');
        collector.stop();
        process.exit(0);
      });
      break;

    case 'record':
      const metricName = args[1] || 'test_metric';
      const value = parseFloat(args[2]) || Math.random() * 100;
      collector.record(metricName, value, { label: 'test' });
      console.log(`Recorded ${metricName}: ${value}`);
      break;

    case 'query':
      const queryName = args[1] || 'test_metric';
      const results = collector.query(queryName);
      console.log(`Query results for ${queryName}:`);
      console.log(JSON.stringify(results, null, 2));
      break;

    case 'list':
      console.log('Metric Families:');
      console.log('================');
      for (const family of collector.families.values()) {
        console.log(`\n${family.name} (${family.type})`);
        console.log(`  Series: ${family.series.size}`);
        for (const series of family.series.values()) {
          console.log(`    Labels: {${series.labels.toString()}}`);
          console.log(`    Value: ${series.getValue()}`);
        }
      }
      break;

    case 'prometheus':
      console.log(collector.toPrometheusFormat());
      break;

    case 'stats':
      console.log('Metrics Collector Statistics:');
      console.log('============================');
      console.log(JSON.stringify(collector.getStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node metrics-collector.js start              - Start collector');
      console.log('  node metrics-collector.js record <name> <value> - Record a value');
      console.log('  node metrics-collector.js query <name>        - Query metrics');
      console.log('  node metrics-collector.js list               - List all metrics');
      console.log('  node metrics-collector.js prometheus         - Export in Prometheus format');
      console.log('  node metrics-collector.js stats              - Show statistics');
      console.log('\nMetric Types:', Object.values(MetricType).join(', '));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  MetricsCollector,
  MetricFamily,
  TimeSeries,
  MetricPoint,
  LabelSet,
  MetricType,
  MetricAggregator
};
