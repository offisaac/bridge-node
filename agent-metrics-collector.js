/**
 * Agent Metrics Collector - Metrics Collection Agent
 *
 * Collects and aggregates metrics from various sources.
 *
 * Usage: node agent-metrics-collector.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   metrics    - List current metrics
 *   sources    - List metric sources
 */

class MetricSource {
  constructor(config) {
    this.name = config.name;
    this.type = config.type; // system, application, business, custom
    this.endpoint = config.endpoint || null;
    this.interval = config.interval || 60000; // ms
    this.enabled = config.enabled !== false;
    this.lastCollected = config.lastCollected || null;
  }
}

class Metric {
  constructor(config) {
    this.name = config.name;
    this.value = config.value;
    this.type = config.type; // gauge, counter, histogram, summary
    this.unit = config.unit || '';
    this.labels = config.labels || {};
    this.timestamp = config.timestamp || new Date().toISOString();
    this.source = config.source;
  }
}

class MetricsCollector {
  constructor() {
    this.sources = new Map();
    this.metrics = new Map();
    this.aggregations = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample sources
    const sources = [
      { name: 'cpu-metrics', type: 'system', endpoint: 'http://node-exporter:9100/metrics', interval: 15000 },
      { name: 'memory-metrics', type: 'system', interval: 15000 },
      { name: 'disk-metrics', type: 'system', interval: 60000 },
      { name: 'request-latency', type: 'application', interval: 10000 },
      { name: 'error-rate', type: 'application', interval: 30000 },
      { name: 'user-signups', type: 'business', interval: 3600000 },
      { name: 'revenue', type: 'business', interval: 3600000 },
      { name: 'api-requests', type: 'custom', interval: 10000 }
    ];

    sources.forEach(s => {
      const source = new MetricSource(s);
      this.sources.set(source.name, source);
    });

    // Sample metrics
    const metrics = [
      { name: 'cpu_usage_percent', value: 45.2, type: 'gauge', unit: '%', source: 'cpu-metrics', labels: { env: 'prod', region: 'us-east-1' } },
      { name: 'cpu_usage_percent', value: 32.8, type: 'gauge', unit: '%', source: 'cpu-metrics', labels: { env: 'staging', region: 'us-east-1' } },
      { name: 'memory_used_bytes', value: 8589934592, type: 'gauge', unit: 'bytes', source: 'memory-metrics', labels: { env: 'prod' } },
      { name: 'memory_available_bytes', value: 17179869184, type: 'gauge', unit: 'bytes', source: 'memory-metrics', labels: { env: 'prod' } },
      { name: 'disk_used_percent', value: 67.5, type: 'gauge', unit: '%', source: 'disk-metrics', labels: { device: '/dev/sda1' } },
      { name: 'request_latency_ms', value: 125, type: 'histogram', unit: 'ms', source: 'request-latency', labels: { endpoint: '/api/users', method: 'GET' } },
      { name: 'error_rate_percent', value: 0.5, type: 'gauge', unit: '%', source: 'error-rate', labels: { service: 'api-gateway' } },
      { name: 'user_signups_total', value: 1523, type: 'counter', unit: '', source: 'user-signups', labels: { day: '2026-02-17' } },
      { name: 'revenue_total_usd', value: 45892.50, type: 'counter', unit: 'USD', source: 'revenue', labels: { day: '2026-02-17' } },
      { name: 'api_requests_total', value: 1250000, type: 'counter', unit: '', source: 'api-requests', labels: { method: 'GET' } }
    ];

    metrics.forEach(m => {
      const metric = new Metric(m);
      const key = `${metric.name}_${JSON.stringify(metric.labels)}`;
      this.metrics.set(key, metric);
    });

    // Sample aggregations
    this.aggregations.set('hourly', { type: 'avg', interval: 3600000, metrics: ['cpu_usage_percent', 'memory_used_bytes'] });
    this.aggregations.set('daily', { type: 'sum', interval: 86400000, metrics: ['user_signups_total', 'api_requests_total'] });
  }

  // Register source
  registerSource(name, type, config = {}) {
    const source = new MetricSource({ name, type, ...config });
    this.sources.set(name, source);
    return source;
  }

  // Collect metric
  collect(name, value, labels = {}, source = 'custom') {
    const metric = new Metric({ name, value, labels, source });
    const key = `${name}_${JSON.stringify(labels)}`;
    this.metrics.set(key, metric);

    // Update source last collected
    if (this.sources.has(source)) {
      this.sources.get(source).lastCollected = new Date().toISOString();
    }

    return metric;
  }

  // Get metrics
  getMetrics(filter = {}) {
    let metrics = Array.from(this.metrics.values());

    if (filter.name) {
      metrics = metrics.filter(m => m.name === filter.name);
    }
    if (filter.source) {
      metrics = metrics.filter(m => m.source === filter.source);
    }
    if (filter.type) {
      metrics = metrics.filter(m => m.type === filter.type);
    }

    return metrics;
  }

  // Query metrics
  query(name, labels = {}) {
    const key = `${name}_${JSON.stringify(labels)}`;
    return this.metrics.get(key) || null;
  }

  // List sources
  listSources() {
    return Array.from(this.sources.values());
  }

  // Enable/disable source
  toggleSource(name, enabled) {
    const source = this.sources.get(name);
    if (!source) {
      throw new Error(`Source ${name} not found`);
    }
    source.enabled = enabled;
    return source;
  }

  // Create aggregation
  createAggregation(name, type, interval, metricNames) {
    const aggregation = { name, type, interval, metrics: metricNames };
    this.aggregations.set(name, aggregation);
    return aggregation;
  }

  // Get aggregation
  getAggregation(name) {
    return this.aggregations.get(name) || null;
  }

  // Get statistics
  getStats() {
    const metrics = Array.from(this.metrics.values());
    const sources = Array.from(this.sources.values());

    return {
      totalMetrics: metrics.length,
      byType: {
        gauge: metrics.filter(m => m.type === 'gauge').length,
        counter: metrics.filter(m => m.type === 'counter').length,
        histogram: metrics.filter(m => m.type === 'histogram').length,
        summary: metrics.filter(m => m.type === 'summary').length
      },
      totalSources: sources.length,
      enabledSources: sources.filter(s => s.enabled).length,
      aggregations: this.aggregations.size,
      uniqueMetricNames: [...new Set(metrics.map(m => m.name))].length
    };
  }

  // Export metrics (Prometheus format)
  exportPrometheus() {
    const metrics = this.getMetrics();
    let output = '';

    metrics.forEach(m => {
      const labels = Object.entries(m.labels)
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');

      const labelStr = labels ? `{${labels}}` : '';
      output += `# TYPE ${m.name} ${m.type}\n`;
      output += `${m.name}${labelStr} ${m.value}\n\n`;
    });

    return output;
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const collector = new MetricsCollector();

switch (command) {
  case 'demo':
    console.log('=== Agent Metrics Collector Demo\n');

    // 1. List sources
    console.log('1. Metric Sources:');
    const sources = collector.listSources();
    console.log(`   Total: ${sources.length}`);
    sources.forEach(s => {
      console.log(`   - ${s.name} [${s.type}] ${s.enabled ? '' : '(disabled)'} interval=${s.interval}ms`);
    });

    // 2. Get metrics
    console.log('\n2. Current Metrics:');
    const metrics = collector.getMetrics();
    console.log(`   Total: ${metrics.length}`);
    metrics.slice(0, 5).forEach(m => {
      const labels = Object.keys(m.labels).length > 0 ? JSON.stringify(m.labels) : '';
      console.log(`   - ${m.name}${labels}: ${m.value} ${m.unit}`);
    });

    // 3. Query specific metric
    console.log('\n3. Query Metric:');
    const cpuMetric = collector.query('cpu_usage_percent', { env: 'prod' });
    if (cpuMetric) {
      console.log(`   cpu_usage_percent{env="prod"}: ${cpuMetric.value}%`);
    }

    // 4. Collect new metric
    console.log('\n4. Collect New Metric:');
    const newMetric = collector.collect('active_connections', 4500, { service: 'api-gateway' }, 'custom');
    console.log(`   Collected: ${newMetric.name} = ${newMetric.value}`);

    // 5. Collect with increment
    console.log('\n5. Collect Counter:');
    collector.collect('page_views_total', 1, { page: '/home' }, 'custom');
    collector.collect('page_views_total', 1, { page: '/home' }, 'custom');
    collector.collect('page_views_total', 1, { page: '/home' }, 'custom');
    const pageViews = collector.query('page_views_total', { page: '/home' });
    console.log(`   page_views_total{page="/home"}: ${pageViews?.value}`);

    // 6. Toggle source
    console.log('\n6. Toggle Source:');
    const disabled = collector.toggleSource('cpu-metrics', false);
    console.log(`   Disabled: ${disabled.name}`);

    // 7. Get metrics by type
    console.log('\n7. Metrics by Type:');
    const gauges = collector.getMetrics({ type: 'gauge' });
    const counters = collector.getMetrics({ type: 'counter' });
    console.log(`   Gauges: ${gauges.length}`);
    console.log(`   Counters: ${counters.length}`);

    // 8. Get metrics by source
    console.log('\n8. Metrics by Source:');
    const appMetrics = collector.getMetrics({ source: 'application' });
    console.log(`   Application metrics: ${appMetrics.length}`);

    // 9. Aggregations
    console.log('\n9. Aggregations:');
    const hourlyAgg = collector.createAggregation('hourly-avg', 'avg', 3600000, ['cpu_usage_percent']);
    console.log(`   Created: ${hourlyAgg.name} (type: ${hourlyAgg.type})`);

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const stats = collector.getStats();
    console.log(`    Total metrics: ${stats.totalMetrics}`);
    console.log(`    By type: gauge=${stats.byType.gauge}, counter=${stats.byType.counter}`);
    console.log(`    Sources: ${stats.enabledSources}/${stats.totalSources} enabled`);
    console.log(`    Unique names: ${stats.uniqueMetricNames}`);

    // Bonus: Export Prometheus format
    console.log('\n11. Prometheus Export:');
    const prometheus = collector.exportPrometheus();
    console.log(`    Exported ${metrics.length} metrics`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'metrics':
    console.log('Current Metrics:');
    collector.getMetrics().forEach(m => {
      const labels = Object.keys(m.labels).length > 0 ? ` ${JSON.stringify(m.labels)}` : '';
      console.log(`  ${m.name}${labels}: ${m.value} ${m.unit}`);
    });
    break;

  case 'sources':
    console.log('Metric Sources:');
    collector.listSources().forEach(s => {
      console.log(`  ${s.name}: ${s.type} [${s.enabled ? 'enabled' : 'disabled'}]`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-metrics-collector.js [demo|metrics|sources]');
}
