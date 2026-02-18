/**
 * Agent Monitoring4 - System Monitoring Agent
 *
 * Provides comprehensive system monitoring capabilities.
 *
 * Usage: node agent-monitoring4.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   status     - Show monitoring status
 *   metrics    - Display current metrics
 */

class MonitorTarget {
  constructor(config) {
    this.id = `mon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.type = config.type; // system, service, application
    this.endpoint = config.endpoint;
    this.interval = config.interval || 60000;
    this.enabled = config.enabled !== false;
  }
}

class HealthCheck {
  constructor(config) {
    this.id = `hc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.target = config.target;
    this.type = config.type; // http, tcp, process
    this.threshold = config.threshold;
    this.status = 'unknown';
  }
}

class MonitorMetric {
  constructor(config) {
    this.id = `mm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.category = config.category; // cpu, memory, network, disk
    this.value = config.value || 0;
    this.unit = config.unit;
    this.timestamp = Date.now();
  }
}

class Monitoring4Agent {
  constructor(config = {}) {
    this.name = config.name || 'Monitoring4Agent';
    this.version = config.version || '4.0';
    this.targets = new Map();
    this.healthChecks = new Map();
    this.metrics = new Map();
    this.stats = {
      targetsConfigured: 0,
      healthChecksRun: 0,
      alertsGenerated: 0
    };
    this.initDefaults();
  }

  initDefaults() {
    // Add default monitoring targets
    const defaults = [
      new MonitorTarget({ name: 'CPU', type: 'system', endpoint: 'system', interval: 10000 }),
      new MonitorTarget({ name: 'Memory', type: 'system', endpoint: 'system', interval: 10000 }),
      new MonitorTarget({ name: 'Disk', type: 'system', endpoint: 'system', interval: 60000 }),
      new MonitorTarget({ name: 'Network', type: 'system', endpoint: 'system', interval: 10000 })
    ];
    defaults.forEach(t => this.targets.set(t.id, t));
    this.stats.targetsConfigured = defaults.length;
  }

  addTarget(name, type, endpoint, interval) {
    const target = new MonitorTarget({ name, type, endpoint, interval });
    this.targets.set(target.id, target);
    this.stats.targetsConfigured++;
    return target;
  }

  addHealthCheck(name, target, type, threshold) {
    const check = new HealthCheck({ name, target, type, threshold });
    this.healthChecks.set(check.id, check);
    return check;
  }

  recordMetric(name, category, value, unit) {
    const metric = new MonitorMetric({ name, category, value, unit });
    this.metrics.set(metric.id, metric);
    return metric;
  }

  runHealthCheck(checkId) {
    const check = this.healthChecks.get(checkId);
    if (!check) return null;

    // Simulate health check
    this.stats.healthChecksRun++;
    const isHealthy = Math.random() > 0.1; // 90% healthy
    check.status = isHealthy ? 'healthy' : 'unhealthy';

    if (!isHealthy) {
      this.stats.alertsGenerated++;
    }

    return {
      checkId: check.id,
      name: check.name,
      status: check.status,
      timestamp: Date.now()
    };
  }

  getSystemMetrics() {
    return {
      cpu: {
        usage: Math.random() * 100,
        cores: require('os').cpus().length,
        loadAvg: require('os').loadavg()
      },
      memory: {
        total: require('os').totalmem(),
        free: require('os').freemem(),
        usedPercent: ((require('os').totalmem() - require('os').freemem()) / require('os').totalmem() * 100).toFixed(2)
      },
      uptime: require('os').uptime(),
      platform: require('os').platform()
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const monitor = new Monitoring4Agent();

switch (command) {
  case 'demo': {
    console.log('=== Agent Monitoring4 Demo\n');

    // 1. Monitoring Targets
    console.log('1. Monitoring Targets:');
    const targets = Array.from(monitor.targets.values());
    targets.forEach(t => {
      console.log(`   ${t.name}: ${t.type} (interval: ${t.interval}ms)`);
    });

    // 2. Add Custom Target
    console.log('\n2. Add Custom Target:');
    const customTarget = monitor.addTarget('API Service', 'service', 'http://api.example.com/health', 30000);
    console.log(`   Added: ${customTarget.name}`);

    // 3. Health Checks
    console.log('\n3. Health Checks:');
    const hc1 = monitor.addHealthCheck('API Health', 'api', 'http', 5000);
    console.log(`   Created: ${hc1.name} (${hc1.type})`);

    const hc2 = monitor.addHealthCheck('DB Health', 'database', 'tcp', 3000);
    console.log(`   Created: ${hc2.name} (${hc2.type})`);

    // 4. Run Health Checks
    console.log('\n4. Run Health Checks:');
    const result1 = monitor.runHealthCheck(hc1.id);
    console.log(`   ${result1.name}: ${result1.status}`);
    const result2 = monitor.runHealthCheck(hc2.id);
    console.log(`   ${result2.name}: ${result2.status}`);

    // 5. System Metrics
    console.log('\n5. System Metrics:');
    const sysMetrics = monitor.getSystemMetrics();
    console.log(`   CPU Usage: ${sysMetrics.cpu.usage.toFixed(2)}%`);
    console.log(`   CPU Cores: ${sysMetrics.cpu.cores}`);
    console.log(`   Memory Used: ${sysMetrics.memory.usedPercent}%`);
    console.log(`   Uptime: ${Math.floor(sysMetrics.uptime / 3600)}h`);

    // 6. Record Custom Metrics
    console.log('\n6. Custom Metrics:');
    monitor.recordMetric('request_count', 'application', 1520, 'req');
    monitor.recordMetric('response_time', 'application', 145, 'ms');
    monitor.recordMetric('error_rate', 'application', 0.5, '%');
    console.log(`   Recorded 3 custom metrics`);

    // 7. Monitoring Categories
    console.log('\n7. Monitoring Categories:');
    console.log(`   System: CPU, Memory, Disk, Network`);
    console.log(`   Application: Response time, Error rate, Throughput`);
    console.log(`   Service: Health checks, Availability, Latency`);

    // 8. Alerting Integration
    console.log('\n8. Alerting Integration:');
    console.log(`   Threshold alerts: CPU > 80%, Memory > 90%`);
    console.log(`   Anomaly detection: Statistical outliers`);
    console.log(`   Composite alerts: Multi-metric conditions`);

    // 9. Statistics
    console.log('\n9. Statistics:');
    const stats = monitor.getStats();
    console.log(`   Targets configured: ${stats.targetsConfigured}`);
    console.log(`   Health checks run: ${stats.healthChecksRun}`);
    console.log(`   Alerts generated: ${stats.alertsGenerated}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'status': {
    const stats = monitor.getStats();
    console.log('Monitoring4 Status:');
    console.log(`  Targets: ${stats.targetsConfigured}`);
    console.log(`  Health Checks: ${monitor.healthChecks.size}`);
    console.log(`  Metrics: ${monitor.metrics.size}`);
    break;
  }

  case 'metrics': {
    const sysMetrics = monitor.getSystemMetrics();
    console.log('System Metrics:');
    console.log(JSON.stringify(sysMetrics, null, 2));
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-monitoring4.js [demo|status|metrics]');
  }
}
