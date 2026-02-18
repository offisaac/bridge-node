/**
 * Agent Health Check - Health Check Module
 *
 * Monitors service health with various check types.
 *
 * Usage: node agent-health-check.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   check      - Run health check
 *   status     - Get status
 */

class HealthCheck {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type; // http, tcp, process, disk, memory, custom
    this.target = config.target; // URL, host:port, process name
    this.interval = config.interval || 60000; // Check interval in ms
    this.timeout = config.timeout || 5000; // Timeout in ms
    this.enabled = config.enabled !== false;
    this.status = config.status || 'unknown'; // healthy, unhealthy, unknown
    this.lastCheck = config.lastCheck ? new Date(config.lastCheck) : null;
    this.nextCheck = config.nextCheck ? new Date(config.nextCheck) : null;
    this.consecutiveFailures = config.consecutiveFailures || 0;
    this.consecutiveSuccesses = config.consecutiveSuccesses || 0;
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
  }

  updateStatus(isHealthy) {
    this.lastCheck = new Date();
    this.nextCheck = new Date(Date.now() + this.interval);

    if (isHealthy) {
      this.consecutiveSuccesses++;
      this.consecutiveFailures = 0;
      this.status = 'healthy';
    } else {
      this.consecutiveFailures++;
      this.consecutiveSuccesses = 0;
      this.status = 'unhealthy';
    }
  }
}

class HealthCheckResult {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.checkId = config.checkId;
    this.checkName = config.checkName;
    this.healthy = config.healthy;
    this.responseTime = config.responseTime || 0;
    this.message = config.message || '';
    this.details = config.details || {};
    this.timestamp = config.timestamp ? new Date(config.timestamp) : new Date();
  }
}

class HealthCheckManager {
  constructor() {
    this.checks = new Map();
    this.results = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample health checks
    const checks = [
      { name: 'API Server', type: 'http', target: 'https://api.example.com/health', interval: 30000 },
      { name: 'Database', type: 'tcp', target: 'db.example.com:5432', interval: 60000 },
      { name: 'Redis Cache', type: 'tcp', target: 'redis.example.com:6379', interval: 30000 },
      { name: 'Worker Process', type: 'process', target: 'worker', interval: 60000 },
      { name: 'Disk Space', type: 'disk', target: '/', interval: 300000 },
      { name: 'Memory Usage', type: 'memory', target: 'process', interval: 60000 }
    ];

    checks.forEach(c => {
      const check = new HealthCheck(c);
      // Set some as healthy, some as unhealthy
      if (check.name === 'Worker Process') {
        check.status = 'unhealthy';
        check.consecutiveFailures = 3;
      }
      this.checks.set(check.id, check);
    });
  }

  // Add health check
  add(name, type, target, options = {}) {
    const check = new HealthCheck({
      name,
      type,
      target,
      interval: options.interval || 60000,
      timeout: options.timeout || 5000,
      enabled: options.enabled !== false
    });

    this.checks.set(check.id, check);
    return check;
  }

  // Run single check
  runCheck(checkId) {
    const check = this.checks.get(checkId);
    if (!check) {
      throw new Error('Health check not found');
    }

    const startTime = Date.now();
    let isHealthy = false;
    let message = '';

    // Simulate different check types
    switch (check.type) {
      case 'http':
        isHealthy = Math.random() > 0.1; // 90% success
        message = isHealthy ? 'HTTP 200 OK' : 'Connection timeout';
        break;
      case 'tcp':
        isHealthy = Math.random() > 0.05; // 95% success
        message = isHealthy ? 'Port open' : 'Connection refused';
        break;
      case 'process':
        isHealthy = check.name !== 'Worker Process'; // Simulated
        message = isHealthy ? 'Process running' : 'Process not found';
        break;
      case 'disk':
        isHealthy = Math.random() > 0.1;
        message = isHealthy ? 'Disk OK' : 'Low disk space';
        break;
      case 'memory':
        isHealthy = Math.random() > 0.1;
        message = isHealthy ? 'Memory OK' : 'High memory usage';
        break;
      default:
        isHealthy = true;
        message = 'Check complete';
    }

    const responseTime = Date.now() - startTime;
    check.updateStatus(isHealthy);

    const result = new HealthCheckResult({
      checkId: check.id,
      checkName: check.name,
      healthy: isHealthy,
      responseTime,
      message
    });

    this.results.set(result.id, result);
    return result;
  }

  // Run all checks
  runAllChecks() {
    const results = [];
    this.checks.forEach(check => {
      if (check.enabled) {
        const result = this.runCheck(check.id);
        results.push(result);
      }
    });
    return results;
  }

  // Get check
  get(checkId) {
    return this.checks.get(checkId) || null;
  }

  // List checks
  list(enabled = null) {
    let all = Array.from(this.checks.values());
    if (enabled !== null) {
      all = all.filter(c => c.enabled === enabled);
    }
    return all;
  }

  // Enable/disable check
  setEnabled(checkId, enabled) {
    const check = this.checks.get(checkId);
    if (!check) {
      throw new Error('Health check not found');
    }
    check.enabled = enabled;
    return check;
  }

  // Get results
  getResults(checkId = null, limit = 50) {
    let all = Array.from(this.results.values());
    if (checkId) {
      all = all.filter(r => r.checkId === checkId);
    }
    return all.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
  }

  // Get status summary
  getStatus() {
    const checks = Array.from(this.checks.values()).filter(c => c.enabled);
    const healthy = checks.filter(c => c.status === 'healthy').length;
    const unhealthy = checks.filter(c => c.status === 'unhealthy').length;
    const unknown = checks.filter(c => c.status === 'unknown').length;

    return {
      total: checks.length,
      healthy,
      unhealthy,
      unknown,
      overall: unhealthy > 0 ? 'degraded' : healthy === checks.length ? 'healthy' : 'unknown'
    };
  }

  // Get statistics
  getStats() {
    const checks = Array.from(this.checks.values());
    const total = checks.length;
    const enabled = checks.filter(c => c.enabled).length;

    return {
      total,
      enabled,
      disabled: total - enabled,
      byType: checks.reduce((acc, c) => {
        acc[c.type] = (acc[c.type] || 0) + 1;
        return acc;
      }, {})
    };
  }

  // Delete check
  delete(checkId) {
    const check = this.checks.get(checkId);
    if (!check) {
      throw new Error('Health check not found');
    }
    this.checks.delete(checkId);
    return check;
  }
}

function runDemo() {
  console.log('=== Agent Health Check Demo\n');

  const mgr = new HealthCheckManager();

  console.log('1. List Health Checks:');
  const checks = mgr.list();
  console.log(`   Total: ${checks.length}`);
  checks.forEach(c => console.log(`   - ${c.name} [${c.type}]: ${c.status}`));

  console.log('\n2. Get Status Summary:');
  const status = mgr.getStatus();
  console.log(`   Overall: ${status.overall}`);
  console.log(`   Healthy: ${status.healthy}`);
  console.log(`   Unhealthy: ${status.unhealthy}`);
  console.log(`   Unknown: ${status.unknown}`);

  console.log('\n3. Run Single Check:');
  const result = mgr.runCheck(checks[0].id);
  console.log(`   Check: ${result.checkName}`);
  console.log(`   Status: ${result.healthy ? 'Healthy' : 'Unhealthy'}`);
  console.log(`   Response time: ${result.responseTime}ms`);
  console.log(`   Message: ${result.message}`);

  console.log('\n4. Run All Checks:');
  const allResults = mgr.runAllChecks();
  console.log(`   Checked: ${allResults.length}`);
  const healthy = allResults.filter(r => r.healthy).length;
  console.log(`   Healthy: ${healthy}`);
  console.log(`   Unhealthy: ${allResults.length - healthy}`);

  console.log('\n5. Get Updated Status:');
  const updatedStatus = mgr.getStatus();
  console.log(`   Overall: ${updatedStatus.overall}`);

  console.log('\n6. Disable Check:');
  const disabled = mgr.setEnabled(checks[0].id, false);
  console.log(`   Disabled: ${disabled.name}`);

  console.log('\n7. Enable Check:');
  const enabled = mgr.setEnabled(checks[0].id, true);
  console.log(`   Enabled: ${enabled.name}`);

  console.log('\n8. Add New Check:');
  const newCheck = mgr.add('New Service', 'http', 'https://new.example.com/health', {
    interval: 60000,
    timeout: 5000
  });
  console.log(`   Added: ${newCheck.name}`);

  console.log('\n9. Get Results:');
  const results = mgr.getResults();
  console.log(`   Total results: ${results.length}`);

  console.log('\n10. Get Statistics:');
  const stats = mgr.getStats();
  console.log(`    Total checks: ${stats.total}`);
  console.log(`    Enabled: ${stats.enabled}`);
  console.log(`    By type:`, stats.byType);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new HealthCheckManager();

if (command === 'demo') runDemo();
else if (command === 'check') {
  const results = mgr.runAllChecks();
  console.log(JSON.stringify(results, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else if (command === 'status') {
  const status = mgr.getStatus();
  console.log(JSON.stringify(status, 2));
}
else console.log('Usage: node agent-health-check.js [demo|check|status]');
