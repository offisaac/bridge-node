/**
 * Health Check API - 健康检查API
 * 综合健康检查，支持依赖服务状态检测
 */

const os = require('os');
const crypto = require('crypto');

// ========== Health Check Types ==========

const HealthStatus = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown'
};

const ComponentType = {
  DATABASE: 'database',
  CACHE: 'cache',
  EXTERNAL: 'external',
  SYSTEM: 'system',
  CUSTOM: 'custom'
};

// ========== Health Check Result ==========

class HealthCheckResult {
  constructor(name, type) {
    this.name = name;
    this.type = type;
    this.status = HealthStatus.UNKNOWN;
    this.message = null;
    this.responseTime = null;
    this.timestamp = new Date().toISOString();
    this.metadata = {};
  }

  setHealthy(message = 'OK', metadata = {}) {
    this.status = HealthStatus.HEALTHY;
    this.message = message;
    this.metadata = metadata;
    return this;
  }

  setDegraded(message, metadata = {}) {
    this.status = HealthStatus.DEGRADED;
    this.message = message;
    this.metadata = metadata;
    return this;
  }

  setUnhealthy(message, metadata = {}) {
    this.status = HealthStatus.UNHEALTHY;
    this.message = message;
    this.metadata = metadata;
    return this;
  }

  setResponseTime(ms) {
    this.responseTime = ms;
    return this;
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      status: this.status,
      message: this.message,
      responseTime: this.responseTime,
      timestamp: this.timestamp,
      metadata: this.metadata
    };
  }
}

// ========== Base Health Checker ==========

class HealthChecker {
  constructor(name, type) {
    this.name = name;
    this.type = type;
  }

  async check() {
    throw new Error('check() must be implemented');
  }
}

// ========== System Health Checkers ==========

class SystemHealthChecker extends HealthChecker {
  constructor() {
    super('system', ComponentType.SYSTEM);
  }

  async check() {
    const result = new HealthCheckResult(this.name, this.type);

    try {
      const cpuLoad = os.loadavg()[0];
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memUsagePercent = ((totalMem - freeMem) / totalMem) * 100;

      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;
      for (const cpu of cpus) {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      }
      const cpuUsagePercent = 100 - (totalIdle / totalTick * 100);

      if (cpuLoad > os.cpus().length * 0.75 || memUsagePercent > 90) {
        result.setDegraded('System resources are under high load', {
          cpuLoad,
          cpuUsagePercent: cpuUsagePercent.toFixed(2),
          memUsagePercent: memUsagePercent.toFixed(2),
          freeMemory: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`
        });
      } else if (cpuLoad > os.cpus().length * 0.5 || memUsagePercent > 75) {
        result.setDegraded('System resources are moderately loaded', {
          cpuLoad,
          cpuUsagePercent: cpuUsagePercent.toFixed(2),
          memUsagePercent: memUsagePercent.toFixed(2),
          freeMemory: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`
        });
      } else {
        result.setHealthy('System resources are normal', {
          cpuLoad,
          cpuUsagePercent: cpuUsagePercent.toFixed(2),
          memUsagePercent: memUsagePercent.toFixed(2),
          freeMemory: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`
        });
      }

      result.setResponseTime(0);
    } catch (err) {
      result.setUnhealthy('Failed to check system resources', { error: err.message });
    }

    return result;
  }
}

// ========== Database Health Checker ==========

class DatabaseHealthChecker extends HealthChecker {
  constructor(options = {}) {
    super(options.name || 'database', ComponentType.DATABASE);
    this.connection = options.connection || null;
    this.query = options.query || 'SELECT 1';
  }

  async check() {
    const result = new HealthCheckResult(this.name, this.type);
    const startTime = Date.now();

    try {
      if (!this.connection) {
        // Simulate database check
        result.setHealthy('Database connection available (simulated)', {
          type: 'mock'
        });
      } else {
        // Real database check would go here
        await this.connection.query(this.query);
        result.setHealthy('Database is responsive');
      }
    } catch (err) {
      result.setUnhealthy('Database is unreachable', { error: err.message });
    }

    result.setResponseTime(Date.now() - startTime);
    return result;
  }

  setConnection(connection) {
    this.connection = connection;
    return this;
  }
}

// ========== Cache Health Checker ==========

class CacheHealthChecker extends HealthChecker {
  constructor(options = {}) {
    super(options.name || 'cache', ComponentType.CACHE);
    this.client = options.client || null;
  }

  async check() {
    const result = new HealthCheckResult(this.name, this.type);
    const startTime = Date.now();

    try {
      if (!this.client) {
        // Simulate cache check
        result.setHealthy('Cache service available (simulated)', {
          type: 'mock'
        });
      } else {
        // Real cache check would go here
        await this.client.ping();
        result.setHealthy('Cache is responsive');
      }
    } catch (err) {
      result.setUnhealthy('Cache is unreachable', { error: err.message });
    }

    result.setResponseTime(Date.now() - startTime);
    return result;
  }

  setClient(client) {
    this.client = client;
    return this;
  }
}

// ========== External Service Health Checker ==========

class ExternalServiceHealthChecker extends HealthChecker {
  constructor(options = {}) {
    super(options.name || 'external', ComponentType.EXTERNAL);
    this.url = options.url || null;
    this.timeout = options.timeout || 5000;
    this.expectedStatus = options.expectedStatus || 200;
  }

  async check() {
    const result = new HealthCheckResult(this.name, this.type);
    const startTime = Date.now();

    if (!this.url) {
      result.setDegraded('No URL configured for external service');
      result.setResponseTime(0);
      return result;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(this.url, {
        method: 'HEAD',
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (response.status === this.expectedStatus) {
        result.setHealthy('External service is responsive', {
          statusCode: response.status,
          url: this.url
        });
      } else {
        result.setDegraded('External service returned unexpected status', {
          statusCode: response.status,
          expected: this.expectedStatus,
          url: this.url
        });
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        result.setUnhealthy('External service timed out', {
          timeout: this.timeout,
          url: this.url
        });
      } else {
        result.setUnhealthy('External service is unreachable', {
          error: err.message,
          url: this.url
        });
      }
    }

    result.setResponseTime(Date.now() - startTime);
    return result;
  }

  setUrl(url) {
    this.url = url;
    return this;
  }
}

// ========== Custom Health Checker ==========

class CustomHealthChecker extends HealthChecker {
  constructor(name, checkFn) {
    super(name, ComponentType.CUSTOM);
    this.checkFn = checkFn;
  }

  async check() {
    const result = new HealthCheckResult(this.name, this.type);
    const startTime = Date.now();

    try {
      const checkResult = await this.checkFn();

      if (typeof checkResult === 'boolean') {
        result.setHealthy(checkResult ? 'OK' : 'Check failed');
      } else if (typeof checkResult === 'string') {
        result.setHealthy(checkResult);
      } else if (checkResult && typeof checkResult === 'object') {
        if (checkResult.status === 'healthy') {
          result.setHealthy(checkResult.message, checkResult.metadata);
        } else if (checkResult.status === 'degraded') {
          result.setDegraded(checkResult.message, checkResult.metadata);
        } else {
          result.setUnhealthy(checkResult.message, checkResult.metadata);
        }
      }
    } catch (err) {
      result.setUnhealthy('Check failed with error', { error: err.message });
    }

    result.setResponseTime(Date.now() - startTime);
    return result;
  }
}

// ========== Health Check Service ==========

class HealthCheckService {
  constructor(options = {}) {
    this.name = options.name || 'bridge-node';
    this.version = options.version || '1.0.0';
    this.checkers = new Map();
    this.globalTimeout = options.timeout || 10000;

    // Register default checkers
    this.register(new SystemHealthChecker());
  }

  register(checker) {
    if (!(checker instanceof HealthChecker)) {
      throw new Error('Checker must be an instance of HealthChecker');
    }
    this.checkers.set(checker.name, checker);
    return this;
  }

  unregister(name) {
    return this.checkers.delete(name);
  }

  getChecker(name) {
    return this.checkers.get(name);
  }

  async check(name) {
    const checker = this.checkers.get(name);
    if (!checker) {
      throw new Error(`No checker found for: ${name}`);
    }

    return await checker.check();
  }

  async checkAll(options = {}) {
    const { parallel = true, timeout = this.globalTimeout } = options;

    const results = new Map();
    const startTime = Date.now();

    if (parallel) {
      // Run all checks in parallel with timeout
      const checks = Array.from(this.checkers.entries()).map(async ([name, checker]) => {
        try {
          const result = await Promise.race([
            checker.check(),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Check timed out')), timeout)
            )
          ]);
          results.set(name, result);
        } catch (err) {
          const errorResult = new HealthCheckResult(name, checker.type);
          errorResult.setUnhealthy('Check failed', { error: err.message });
          results.set(name, errorResult);
        }
      });

      await Promise.all(checks);
    } else {
      // Run checks sequentially
      for (const [name, checker] of this.checkers) {
        try {
          const result = await checker.check();
          results.set(name, result);
        } catch (err) {
          const errorResult = new HealthCheckResult(name, checker.type);
          errorResult.setUnhealthy('Check failed', { error: err.message });
          results.set(name, errorResult);
        }
      }
    }

    const totalTime = Date.now() - startTime;

    return this._buildResponse(results, totalTime);
  }

  _buildResponse(results, totalTime) {
    let overallStatus = HealthStatus.HEALTHY;
    let unhealthyCount = 0;
    let degradedCount = 0;

    for (const result of results.values()) {
      if (result.status === HealthStatus.UNHEALTHY) {
        unhealthyCount++;
        overallStatus = HealthStatus.UNHEALTHY;
      } else if (result.status === HealthStatus.DEGRADED && overallStatus !== HealthStatus.UNHEALTHY) {
        degradedCount++;
        if (overallStatus === HealthStatus.HEALTHY) {
          overallStatus = HealthStatus.DEGRADED;
        }
      }
    }

    return {
      status: overallStatus,
      name: this.name,
      version: this.version,
      timestamp: new Date().toISOString(),
      totalTime: `${totalTime}ms`,
      checks: Object.fromEntries(results),
      summary: {
        total: results.size,
        healthy: results.size - unhealthyCount - degradedCount,
        degraded: degradedCount,
        unhealthy: unhealthyCount
      }
    };
  }

  // ========== Express Middleware ==========

  middleware(options = {}) {
    const {
      path = '/health',
      detailed = false,
      includeSystem = true
    } = options;

    return async (req, res) => {
      try {
        const health = await this.checkAll();

        if (!detailed) {
          // Simplified response
          const statusCode = health.status === HealthStatus.HEALTHY ? 200 :
            health.status === HealthStatus.DEGRADED ? 200 : 503;
          return res.status(statusCode).json({
            status: health.status,
            name: health.name,
            version: health.version,
            timestamp: health.timestamp
          });
        }

        // Detailed response
        const statusCode = health.status === HealthStatus.HEALTHY ? 200 :
          health.status === HealthStatus.DEGRADED ? 200 : 503;
        res.status(statusCode).json(health);
      } catch (err) {
        res.status(503).json({
          status: HealthStatus.UNHEALTHY,
          error: err.message
        });
      }
    };
  }

  // ========== Liveness/Readiness Probes ==========

  livenessProbe() {
    return (req, res) => {
      res.status(200).json({
        status: 'alive',
        timestamp: new Date().toISOString()
      });
    };
  }

  readinessProbe() {
    return async (req, res) => {
      try {
        const health = await this.checkAll();
        const statusCode = health.status === HealthStatus.UNHEALTHY ? 503 : 200;
        res.status(statusCode).json({
          status: health.status === HealthStatus.UNHEALTHY ? 'not_ready' : 'ready',
          summary: health.summary
        });
      } catch (err) {
        res.status(503).json({
          status: 'not_ready',
          error: err.message
        });
      }
    };
  }
}

// ========== Factory Functions ==========

function createDatabaseChecker(name, connection) {
  return new DatabaseHealthChecker({ name, connection });
}

function createCacheChecker(name, client) {
  return new CacheHealthChecker({ name, client });
}

function createExternalChecker(name, url, options = {}) {
  return new ExternalServiceHealthChecker({ name, url, ...options });
}

function createCustomChecker(name, checkFn) {
  return new CustomHealthChecker(name, checkFn);
}

// ========== Export ==========

module.exports = {
  HealthCheckService,
  HealthChecker,
  HealthCheckResult,
  HealthStatus,
  ComponentType,
  SystemHealthChecker,
  DatabaseHealthChecker,
  CacheHealthChecker,
  ExternalServiceHealthChecker,
  CustomHealthChecker,
  createDatabaseChecker,
  createCacheChecker,
  createExternalChecker,
  createCustomChecker
};
