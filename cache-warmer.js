/**
 * Cache Warmer - 缓存预热模块
 * 缓存预热服务
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ========== Data Models ==========

class WarmUpJob {
  constructor(data) {
    this.id = data.id || `job_${Date.now()}`;
    this.url = data.url;
    this.method = data.method || 'GET';
    this.headers = data.headers || {};
    this.body = data.body || null;
    this.interval = data.interval || 3600000; // 1 hour
    this.priority = data.priority || 'normal'; // low, normal, high
    this.status = data.status || 'pending'; // pending, running, completed, failed
    this.lastRun = data.lastRun || null;
    this.nextRun = data.nextRun || Date.now();
    this.runCount = data.runCount || 0;
    this.successCount = data.successCount || 0;
    this.failCount = data.failCount || 0;
    this.avgResponseTime = data.avgResponseTime || 0;
    this.createdAt = data.createdAt || Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      url: this.url,
      method: this.method,
      headers: this.headers,
      body: this.body,
      interval: this.interval,
      priority: this.priority,
      status: this.status,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      runCount: this.runCount,
      successCount: this.successCount,
      failCount: this.failCount,
      avgResponseTime: this.avgResponseTime,
      createdAt: this.createdAt
    };
  }
}

class WarmUpResult {
  constructor(data) {
    this.jobId = data.jobId;
    this.success = data.success;
    this.statusCode = data.statusCode;
    this.responseTime = data.responseTime;
    this.responseSize = data.responseSize;
    this.error = data.error || null;
    this.timestamp = data.timestamp || Date.now();
  }

  toJSON() {
    return {
      jobId: this.jobId,
      success: this.success,
      statusCode: this.statusCode,
      responseTime: this.responseTime,
      responseSize: this.responseSize,
      error: this.error,
      timestamp: this.timestamp
    };
  }
}

// ========== HTTP Client ==========

class HttpClient {
  constructor() {
    this.timeout = 30000;
  }

  async request(options) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const isHttps = options.url.startsWith('https');
      const client = isHttps ? https : http;

      const url = new URL(options.url);
      const requestOptions = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: this.timeout
      };

      const req = client.request(requestOptions, (res) => {
        let data = [];
        res.on('data', chunk => data.push(chunk));
        res.on('end', () => {
          const responseTime = Date.now() - startTime;
          resolve({
            success: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            responseTime,
            responseSize: Buffer.concat(data).length,
            data: Buffer.concat(data)
          });
        });
      });

      req.on('error', (error) => {
        resolve({
          success: false,
          statusCode: 0,
          responseTime: Date.now() - startTime,
          responseSize: 0,
          error: error.message
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({
          success: false,
          statusCode: 0,
          responseTime: this.timeout,
          responseSize: 0,
          error: 'Request timeout'
        });
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }
}

// ========== Main Cache Warmer Class ==========

class CacheWarmer {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './cache-warmer-data';
    this.jobs = new Map();
    this.results = [];
    this.httpClient = new HttpClient();
    this.isRunning = false;
    this.intervalId = null;

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
  }

  _loadData() {
    const jobsFile = path.join(this.storageDir, 'jobs.json');
    if (fs.existsSync(jobsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
        for (const j of data) {
          this.jobs.set(j.id, new WarmUpJob(j));
        }
      } catch (e) {
        console.error('Failed to load jobs:', e);
      }
    }

    const resultsFile = path.join(this.storageDir, 'results.json');
    if (fs.existsSync(resultsFile)) {
      try {
        this.results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
      } catch (e) {
        console.error('Failed to load results:', e);
      }
    }
  }

  _saveData() {
    const data = Array.from(this.jobs.values()).map(j => j.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'jobs.json'),
      JSON.stringify(data, null, 2)
    );

    fs.writeFileSync(
      path.join(this.storageDir, 'results.json'),
      JSON.stringify(this.results.slice(-1000), null, 2) // Keep last 1000 results
    );
  }

  // ========== Job Management ==========

  createJob(data) {
    const job = new WarmUpJob(data);
    this.jobs.set(job.id, job);
    this._saveData();
    return job;
  }

  getJob(id) {
    return this.jobs.get(id) || null;
  }

  listJobs(filters = {}) {
    let result = Array.from(this.jobs.values());

    if (filters.status) {
      result = result.filter(j => j.status === filters.status);
    }

    if (filters.priority) {
      result = result.filter(j => j.priority === filters.priority);
    }

    // Sort by priority then nextRun
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    result.sort((a, b) => {
      if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return a.nextRun - b.nextRun;
    });

    return result;
  }

  updateJob(id, updates) {
    const job = this.jobs.get(id);
    if (!job) {
      throw new Error(`Job not found: ${id}`);
    }

    Object.assign(job, updates);
    this._saveData();
    return job;
  }

  deleteJob(id) {
    this.jobs.delete(id);
    this._saveData();
  }

  // ========== Execution ==========

  async runJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.status = 'running';
    this._saveData();

    try {
      const response = await this.httpClient.request({
        url: job.url,
        method: job.method,
        headers: job.headers,
        body: job.body
      });

      const result = new WarmUpResult({
        jobId: job.id,
        success: response.success,
        statusCode: response.statusCode,
        responseTime: response.responseTime,
        responseSize: response.responseSize,
        error: response.error
      });

      this.results.push(result.toJSON());

      // Update job stats
      job.lastRun = Date.now();
      job.runCount++;
      if (response.success) {
        job.successCount++;
      } else {
        job.failCount++;
      }

      // Calculate avg response time
      job.avgResponseTime = (
        (job.avgResponseTime * (job.runCount - 1) + response.responseTime)
        / job.runCount
      );

      job.nextRun = Date.now() + job.interval;
      job.status = 'completed';

      this._saveData();
      return result;
    } catch (error) {
      job.status = 'failed';
      job.failCount++;
      job.lastRun = Date.now();
      job.nextRun = Date.now() + job.interval;
      this._saveData();

      throw error;
    }
  }

  async runAll() {
    const pendingJobs = this.listJobs({ status: 'pending' });
    const dueJobs = this.listJobs().filter(j => j.nextRun <= Date.now());

    const jobsToRun = [...pendingJobs, ...dueJobs];

    const results = [];
    for (const job of jobsToRun) {
      try {
        const result = await this.runJob(job.id);
        results.push(result);
      } catch (error) {
        console.error(`Job ${job.id} failed: ${error.message}`);
      }
    }

    return results;
  }

  // ========== Scheduler ==========

  startScheduler(intervalMs = 60000) {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.intervalId = setInterval(() => {
      this.runAll();
    }, intervalMs);

    console.log(`Cache warmer scheduler started (interval: ${intervalMs}ms)`);
  }

  stopScheduler() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('Cache warmer scheduler stopped');
  }

  // ========== Analysis ==========

  getJobStats(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    const jobResults = this.results.filter(r => r.jobId === jobId);

    return {
      job: job.toJSON(),
      totalRuns: job.runCount,
      successRate: job.runCount > 0 ? (job.successCount / job.runCount * 100).toFixed(1) + '%' : 'N/A',
      avgResponseTime: job.avgResponseTime.toFixed(0) + 'ms',
      recentResults: jobResults.slice(-10)
    };
  }

  getSummary() {
    const jobs = this.listJobs();
    const total = jobs.length;
    const pending = jobs.filter(j => j.status === 'pending').length;
    const running = jobs.filter(j => j.status === 'running').length;
    const completed = jobs.filter(j => j.status === 'completed').length;
    const failed = jobs.filter(j => j.status === 'failed').length;

    const totalRuns = jobs.reduce((sum, j) => sum + j.runCount, 0);
    const totalSuccess = jobs.reduce((sum, j) => sum + j.successCount, 0);
    const totalFail = jobs.reduce((sum, j) => sum + j.failCount, 0);

    return {
      totalJobs: total,
      status: { pending, running, completed, failed },
      totalRuns,
      successRate: totalRuns > 0 ? (totalSuccess / totalRuns * 100).toFixed(1) + '%' : 'N/A',
      isRunning: this.isRunning
    };
  }

  // ========== Predefined Jobs ==========

  addCommonEndpoints() {
    const commonEndpoints = [
      { url: '/api/health', priority: 'high', interval: 300000 }, // 5 min
      { url: '/api/users/me', priority: 'high', interval: 600000 }, // 10 min
      { url: '/api/products', priority: 'normal', interval: 1800000 }, // 30 min
      { url: '/api/config', priority: 'normal', interval: 3600000 }, // 1 hour
    ];

    for (const endpoint of commonEndpoints) {
      this.createJob({
        url: `http://localhost:3000${endpoint.url}`,
        priority: endpoint.priority,
        interval: endpoint.interval
      });
    }

    return commonEndpoints.length;
  }
}

// ========== CLI ==========

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const warmer = new CacheWarmer();

  switch (command) {
    case 'list':
      console.log('Warm-up Jobs:');
      console.log('=============');
      for (const job of warmer.listJobs()) {
        console.log(`\n[${job.status}] ${job.url}`);
        console.log(`  Priority: ${job.priority} | Runs: ${job.runCount} | Next: ${new Date(job.nextRun).toLocaleTimeString()}`);
      }
      break;

    case 'run':
      const result = await warmer.runJob(args[1]);
      console.log('Job Result:');
      console.log(JSON.stringify(result, null, 2));
      break;

    case 'run-all':
      console.log('Running all jobs...');
      const results = await warmer.runAll();
      console.log(`Completed ${results.length} jobs`);
      break;

    case 'add':
      const job = warmer.createJob({
        url: args[1] || 'http://localhost:3000/api/health',
        method: args[2] || 'GET',
        interval: parseInt(args[3]) || 3600000,
        priority: args[4] || 'normal'
      });
      console.log(`Created job: ${job.id}`);
      break;

    case 'add-common':
      const count = warmer.addCommonEndpoints();
      console.log(`Added ${count} common endpoint jobs`);
      break;

    case 'stats':
      console.log('Summary:');
      console.log(JSON.stringify(warmer.getSummary(), null, 2));
      break;

    case 'job-stats':
      console.log('Job Stats:');
      console.log(JSON.stringify(warmer.getJobStats(args[1]), null, 2));
      break;

    case 'start':
      warmer.startScheduler(parseInt(args[1]) || 60000);
      break;

    case 'stop':
      warmer.stopScheduler();
      break;

    case 'demo':
      // Create demo jobs
      warmer.createJob({
        url: 'http://localhost:3000/api/health',
        priority: 'high',
        interval: 60000
      });
      warmer.createJob({
        url: 'http://localhost:3000/api/users',
        priority: 'normal',
        interval: 120000
      });
      warmer.createJob({
        url: 'http://localhost:3000/api/products',
        priority: 'low',
        interval: 300000
      });

      console.log('Created demo jobs');
      console.log('\n--- Summary ---');
      console.log(JSON.stringify(warmer.getSummary(), null, 2));

      console.log('\n--- Jobs ---');
      for (const job of warmer.listJobs()) {
        console.log(`- ${job.url} [${job.priority}]`);
      }
      break;

    default:
      console.log('Usage:');
      console.log('  node cache-warmer.js list');
      console.log('  node cache-warmer.js run <job-id>');
      console.log('  node cache-warmer.js run-all');
      console.log('  node cache-warmer.js add <url> [method] [interval] [priority]');
      console.log('  node cache-warmer.js add-common');
      console.log('  node cache-warmer.js stats');
      console.log('  node cache-warmer.js job-stats <job-id>');
      console.log('  node cache-warmer.js start [interval]');
      console.log('  node cache-warmer.js stop');
      console.log('  node cache-warmer.js demo');
  }
}

if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  WarmUpJob,
  WarmUpResult,
  HttpClient,
  CacheWarmer
};
