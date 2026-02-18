/**
 * Agent SLA Module
 *
 * Provides SLA (Service Level Agreement) tracking with metrics, targets, and reporting.
 * Usage: node agent-sla.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show SLA stats
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname + '/data';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * SLA Status
 */
const SLAStatus = {
  OK: 'ok',
  WARNING: 'warning',
  CRITICAL: 'critical',
  BREACHED: 'breached',
  UNKNOWN: 'unknown'
};

/**
 * Metric Type
 */
const MetricType = {
  AVAILABILITY: 'availability',
  LATENCY: 'latency',
  THROUGHPUT: 'throughput',
  ERROR_RATE: 'error_rate',
  SUCCESS_RATE: 'success_rate'
};

/**
 * SLA Target
 */
class SLATarget {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.metric = config.metric;
    this.operator = config.operator || 'gte'; // gte, lte, eq
    this.threshold = config.threshold;
    this.period = config.period || 3600000; // 1 hour in ms
    this.weight = config.weight || 1;
    this.description = config.description || '';
  }

  evaluate(value) {
    switch (this.operator) {
      case 'gte':
        return value >= this.threshold;
      case 'lte':
        return value <= this.threshold;
      case 'eq':
        return value === this.threshold;
      default:
        return true;
    }
  }

  getStatus(value) {
    const passed = this.evaluate(value);
    return passed ? SLAStatus.OK : SLAStatus.BREACHED;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      metric: this.metric,
      operator: this.operator,
      threshold: this.threshold,
      period: this.period,
      weight: this.weight,
      description: this.description
    };
  }
}

/**
 * SLA Metric
 */
class SLAMetric {
  constructor(config) {
    this.id = config.id || `metric_${Date.now()}`;
    this.name = config.name;
    this.type = config.type;
    this.values = []; // Array of { timestamp, value }
    this.windowSize = config.windowSize || 3600000; // 1 hour
  }

  addValue(value) {
    const timestamp = Date.now();
    this.values.push({ timestamp, value });

    // Remove old values outside window
    const cutoff = timestamp - this.windowSize;
    this.values = this.values.filter(v => v.timestamp >= cutoff);
  }

  getAverage() {
    if (this.values.length === 0) return 0;
    const sum = this.values.reduce((acc, v) => acc + v.value, 0);
    return sum / this.values.length;
  }

  getPercentile(p) {
    if (this.values.length === 0) return 0;
    const sorted = [...this.values].sort((a, b) => a.value - b.value);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[index]?.value || 0;
  }

  getMin() {
    if (this.values.length === 0) return 0;
    return Math.min(...this.values.map(v => v.value));
  }

  getMax() {
    if (this.values.length === 0) return 0;
    return Math.max(...this.values.map(v => v.value));
  }

  getCount() {
    return this.values.length;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      count: this.getCount(),
      average: this.getAverage(),
      p50: this.getPercentile(50),
      p95: this.getPercentile(95),
      p99: this.getPercentile(99),
      min: this.getMin(),
      max: this.getMax()
    };
  }
}

/**
 * SLA Window
 */
class SLAWindow {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.startTime = config.startTime || Date.now();
    this.endTime = config.endTime || null;
    this.targets = config.targets || [];
    this.metrics = new Map(); // metricType -> SLAMetric
    this.compliance = {}; // targetId -> { passed, failed, total }
    this.status = SLAStatus.UNKNOWN;
  }

  addMetric(type, value) {
    if (!this.metrics.has(type)) {
      this.metrics.set(type, new SLAMetric({
        id: `${this.id}_${type}`,
        name: type,
        type
      }));
    }
    this.metrics.get(type).addValue(value);
  }

  evaluate() {
    const results = [];

    for (const target of this.targets) {
      const metric = this.metrics.get(target.metric);
      if (!metric) {
        results.push({
          target: target.id,
          status: SLAStatus.UNKNOWN,
          message: 'No data'
        });
        continue;
      }

      const value = metric.getAverage();
      const passed = target.evaluate(value);
      const targetStatus = passed ? SLAStatus.OK : SLAStatus.BREACHED;

      // Track compliance
      if (!this.compliance[target.id]) {
        this.compliance[target.id] = { passed: 0, failed: 0, total: 0 };
      }
      this.compliance[target.id].total++;
      if (passed) {
        this.compliance[target.id].passed++;
      } else {
        this.compliance[target.id].failed++;
      }

      results.push({
        target: target.id,
        targetName: target.name,
        metric: target.metric,
        value,
        threshold: target.threshold,
        operator: target.operator,
        status: targetStatus
      });
    }

    return results;
  }

  getOverallStatus() {
    const results = this.evaluate();
    if (results.length === 0) return SLAStatus.UNKNOWN;

    const hasCritical = results.some(r => r.status === SLAStatus.BREACHED);
    if (hasCritical) return SLAStatus.BREACHED;

    const hasWarning = results.some(r => r.status === SLAStatus.WARNING);
    if (hasWarning) return SLAStatus.WARNING;

    return SLAStatus.OK;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      startTime: this.startTime,
      endTime: this.endTime,
      status: this.getOverallStatus(),
      compliance: this.compliance,
      metrics: Object.fromEntries(
        Array.from(this.metrics.entries()).map(([k, v]) => [k, v.toJSON()])
      )
    };
  }
}

/**
 * SLA Report
 */
class SLAReport {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.period = config.period || 'daily'; // daily, weekly, monthly
    this.createdAt = Date.now();
    this.windows = [];
    this.summary = {};
  }

  addWindow(window) {
    this.windows.push(window);
  }

  generate() {
    if (this.windows.length === 0) {
      return { error: 'No data' };
    }

    // Calculate summary
    let totalPassed = 0;
    let totalFailed = 0;
    let totalChecks = 0;

    for (const window of this.windows) {
      for (const [targetId, compliance] of Object.entries(window.compliance)) {
        totalPassed += compliance.passed;
        totalFailed += compliance.failed;
        totalChecks += compliance.total;
      }
    }

    const uptimePercent = totalChecks > 0
      ? ((totalPassed / totalChecks) * 100).toFixed(2)
      : 0;

    this.summary = {
      period: this.period,
      windowsCount: this.windows.length,
      totalChecks,
      passed: totalPassed,
      failed: totalFailed,
      uptimePercent: parseFloat(uptimePercent),
      generatedAt: Date.now()
    };

    return this.summary;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      period: this.period,
      createdAt: this.createdAt,
      summary: this.summary,
      windows: this.windows.map(w => w.toJSON())
    };
  }
}

/**
 * SLA Manager
 */
class SLAManager {
  constructor(config = {}) {
    this.name = config.name || 'default';
    this.storageDir = config.storageDir || DATA_DIR;
    this.currentWindow = null;
    this.targets = new Map();
    this.history = [];
    this.alerts = [];
    this.stats = {
      totalRequests: 0,
      totalBreaches: 0,
      totalEvaluations: 0,
      windowsCreated: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._createDefaultTargets();
  }

  _createDefaultTargets() {
    // Default SLA targets
    this.addTarget(new SLATarget({
      id: 'availability_99.9',
      name: 'API Availability',
      metric: MetricType.AVAILABILITY,
      operator: 'gte',
      threshold: 99.9,
      period: 3600000,
      weight: 2,
      description: 'API must be available 99.9% of the time'
    }));

    this.addTarget(new SLATarget({
      id: 'latency_p95_500ms',
      name: 'API Latency P95',
      metric: MetricType.LATENCY,
      operator: 'lte',
      threshold: 500,
      period: 3600000,
      weight: 1.5,
      description: 'P95 latency must be under 500ms'
    }));

    this.addTarget(new SLATarget({
      id: 'error_rate_1%',
      name: 'Error Rate',
      metric: MetricType.ERROR_RATE,
      operator: 'lte',
      threshold: 1,
      period: 3600000,
      weight: 2,
      description: 'Error rate must be under 1%'
    }));

    this.addTarget(new SLATarget({
      id: 'success_rate_99%',
      name: 'Success Rate',
      metric: MetricType.SUCCESS_RATE,
      operator: 'gte',
      threshold: 99,
      period: 3600000,
      weight: 1.5,
      description: 'Success rate must be at least 99%'
    }));
  }

  addTarget(target) {
    this.targets.set(target.id, target);
  }

  getTarget(targetId) {
    return this.targets.get(targetId);
  }

  listTargets() {
    return Array.from(this.targets.values()).map(t => t.toJSON());
  }

  startWindow(name) {
    this.currentWindow = new SLAWindow({
      id: `window_${Date.now()}`,
      name,
      targets: Array.from(this.targets.values())
    });
    this.stats.windowsCreated++;
    return this.currentWindow;
  }

  recordMetric(type, value) {
    if (!this.currentWindow) {
      this.startWindow('default');
    }
    this.currentWindow.addMetric(type, value);
    this.stats.totalRequests++;
  }

  recordRequest(success, latency) {
    // Record availability (1 = success, 0 = failure)
    this.recordMetric(MetricType.AVAILABILITY, success ? 1 : 0);

    // Record latency
    this.recordMetric(MetricType.LATENCY, latency);

    // Record error rate (1 = error, 0 = no error)
    this.recordMetric(MetricType.ERROR_RATE, success ? 0 : 1);

    // Record success rate (1 = success, 0 = failure)
    this.recordMetric(MetricType.SUCCESS_RATE, success ? 1 : 0);
  }

  evaluate() {
    if (!this.currentWindow) {
      return { error: 'No active window' };
    }

    const results = this.currentWindow.evaluate();
    this.stats.totalEvaluations++;

    // Check for breaches
    const breaches = results.filter(r => r.status === SLAStatus.BREACHED);
    this.stats.totalBreaches += breaches.length;

    return {
      window: this.currentWindow.toJSON(),
      results,
      overallStatus: this.currentWindow.getOverallStatus(),
      breaches: breaches.length
    };
  }

  endWindow() {
    if (!this.currentWindow) return null;

    this.currentWindow.endTime = Date.now();
    const result = this.currentWindow.toJSON();
    this.history.push(this.currentWindow);
    this.currentWindow = null;

    return result;
  }

  generateReport(period = 'daily') {
    const report = new SLAReport({
      id: `report_${Date.now()}`,
      name: `${this.name} ${period} report`,
      period
    });

    // Use recent windows
    const recentWindows = this.history.slice(-24); // Last 24 windows
    for (const window of recentWindows) {
      report.addWindow(window);
    }

    return report.generate();
  }

  getStats() {
    return {
      ...this.stats,
      targetsCount: this.targets.size,
      historyCount: this.history.length,
      hasActiveWindow: this.currentWindow !== null
    };
  }

  getCurrentStatus() {
    if (!this.currentWindow) {
      return { status: SLAStatus.UNKNOWN, message: 'No active window' };
    }

    return {
      status: this.currentWindow.getOverallStatus(),
      window: this.currentWindow.toJSON()
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent SLA Demo\n');

  const manager = new SLAManager({ name: 'api-service' });

  // Show targets
  console.log('1. SLA Targets:');
  const targets = manager.listTargets();
  for (const target of targets) {
    console.log(`   ${target.name}:`);
    console.log(`      Metric: ${target.metric}, Operator: ${target.operator}, Threshold: ${target.threshold}`);
  }

  // Start a monitoring window
  console.log('\n2. Starting SLA Window:');
  manager.startWindow('hourly-check');
  console.log('   Window started');

  // Simulate requests
  console.log('\n3. Recording Metrics:');
  const requests = [
    { success: true, latency: 120 },
    { success: true, latency: 150 },
    { success: true, latency: 200 },
    { success: false, latency: 50 }, // Error
    { success: true, latency: 180 },
    { success: true, latency: 300 },
    { success: true, latency: 450 },
    { success: true, latency: 100 },
    { success: false, latency: 30 }, // Error
    { success: true, latency: 250 },
  ];

  for (const req of requests) {
    manager.recordRequest(req.success, req.latency);
  }
  console.log(`   Recorded ${requests.length} requests`);

  // Evaluate
  console.log('\n4. SLA Evaluation:');
  const evalResult = manager.evaluate();
  console.log(`   Overall Status: ${evalResult.overallStatus}`);
  console.log(`   Total Breaches: ${evalResult.breaches}`);

  for (const result of evalResult.results) {
    const statusIcon = result.status === 'ok' ? '✓' : '✗';
    console.log(`   ${statusIcon} ${result.targetName}: ${result.value?.toFixed(2)} (threshold: ${result.threshold})`);
  }

  // Current status
  console.log('\n5. Current Status:');
  const status = manager.getCurrentStatus();
  console.log(`   Status: ${status.status}`);

  // Simulate more requests for metrics
  console.log('\n6. More Metrics:');
  for (let i = 0; i < 20; i++) {
    manager.recordRequest(true, Math.random() * 400 + 50);
  }
  console.log('   Recorded 20 more requests');

  // Re-evaluate
  const evalResult2 = manager.evaluate();
  console.log(`   New Status: ${evalResult2.overallStatus}`);
  for (const result of evalResult2.results) {
    console.log(`   - ${result.targetName}: ${result.value?.toFixed(2)} → ${result.status}`);
  }

  // End window
  console.log('\n7. Ending Window:');
  const windowResult = manager.endWindow();
  console.log(`   Window ended: ${windowResult.id}`);
  console.log(`   Final Status: ${windowResult.status}`);

  // Generate report
  console.log('\n8. Generating Report:');
  const report = manager.generateReport('hourly');
  console.log(`   Uptime: ${report.uptimePercent}%`);
  console.log(`   Total Checks: ${report.totalChecks}`);
  console.log(`   Passed: ${report.passed}`);
  console.log(`   Failed: ${report.failed}`);

  // Stats
  console.log('\n9. Statistics:');
  const stats = manager.getStats();
  console.log(`   Total Requests: ${stats.totalRequests}`);
  console.log(`   Total Breaches: ${stats.totalBreaches}`);
  console.log(`   Windows Created: ${stats.windowsCreated}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new SLAManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent SLA Module');
  console.log('Usage: node agent-sla.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
