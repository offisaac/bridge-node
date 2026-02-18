/**
 * Agent Right-Size Module
 *
 * Provides resource right-sizing analysis with utilization metrics and recommendations.
 * Usage: node agent-right-size.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show right-size stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Resource Type
 */
const ResourceType = {
  VM: 'vm',
  CONTAINER: 'container',
  DATABASE: 'database',
  STORAGE: 'storage',
  FUNCTION: 'function',
  LOAD_BALANCER: 'load_balancer'
};

/**
 * Resource Size
 */
class ResourceSize {
  constructor(config) {
    this.vcpu = config.vcpu || 1;
    this.memory = config.memory || 1024; // MB
    this.storage = config.storage || 20; // GB
    this.gpu = config.gpu || 0;
  }

  getCost() {
    // Simplified cost calculation
    const vcpuCost = this.vcpu * 10;
    const memoryCost = this.memory * 0.01;
    const storageCost = this.storage * 0.1;
    const gpuCost = this.gpu * 50;
    return vcpuCost + memoryCost + storageCost + gpuCost;
  }

  toJSON() {
    return {
      vcpu: this.vcpu,
      memory: this.memory,
      storage: this.storage,
      gpu: this.gpu,
      cost: this.getCost()
    };
  }
}

/**
 * Utilization Metrics
 */
class UtilizationMetrics {
  constructor(config) {
    this.cpu = config.cpu || 0;
    this.memory = config.memory || 0;
    this.network = config.network || 0;
    this.storage = config.storage || 0;
    this.gpu = config.gpu || 0;
    this.timestamp = config.timestamp || Date.now();
    this.period = config.period || '7d';
  }

  getAverage() {
    return {
      cpu: this.cpu,
      memory: this.memory,
      network: this.network,
      storage: this.storage,
      gpu: this.gpu
    };
  }

  isOverutilized() {
    return this.cpu > 90 || this.memory > 90 || this.gpu > 90;
  }

  isUnderutilized() {
    return this.cpu < 20 && this.memory < 30;
  }

  toJSON() {
    return {
      ...this.getAverage(),
      timestamp: this.timestamp,
      period: this.period,
      isOverutilized: this.isOverutilized(),
      isUnderutilized: this.isUnderutilized()
    };
  }
}

/**
 * Monitored Resource
 */
class MonitoredResource {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.currentSize = new ResourceSize(config.currentSize || {});
    this.utilization = new UtilizationMetrics(config.utilization || {});
    this.cost = config.cost || this.currentSize.getCost();
    this.tags = config.tags || {};
    this.history = [];
    this.createdAt = config.createdAt || Date.now();
  }

  updateUtilization(metrics) {
    this.utilization = new UtilizationMetrics(metrics);
    this.history.push({
      metrics: this.utilization.toJSON(),
      timestamp: Date.now()
    });

    // Keep only last 100 entries
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }
  }

  getRecommendation() {
    const avgUtil = this.utilization.getAverage();

    if (avgUtil.cpu < 10 && avgUtil.memory < 20) {
      // Severely underutilized - suggest significant downsizing
      return {
        action: 'downsize',
        currentSize: this.currentSize.toJSON(),
        recommendedSize: new ResourceSize({
          vcpu: Math.max(1, Math.ceil(this.currentSize.vcpu * 0.5)),
          memory: Math.max(256, Math.ceil(this.currentSize.memory * 0.5)),
          storage: this.currentSize.storage,
          gpu: 0
        }).toJSON(),
        reason: 'Severe underutilization detected'
      };
    }

    if (avgUtil.cpu < 20 || avgUtil.memory < 30) {
      // Moderately underutilized
      return {
        action: 'downsize',
        currentSize: this.currentSize.toJSON(),
        recommendedSize: new ResourceSize({
          vcpu: Math.max(1, Math.ceil(this.currentSize.vcpu * 0.75)),
          memory: Math.max(512, Math.ceil(this.currentSize.memory * 0.75)),
          storage: this.currentSize.storage,
          gpu: this.currentSize.gpu
        }).toJSON(),
        reason: 'Moderate underutilization detected'
      };
    }

    if (avgUtil.cpu > 85 || avgUtil.memory > 85) {
      // Overutilized - suggest upsizing
      return {
        action: 'upsize',
        currentSize: this.currentSize.toJSON(),
        recommendedSize: new ResourceSize({
          vcpu: Math.min(64, this.currentSize.vcpu * 2),
          memory: Math.min(32768, this.currentSize.memory * 2),
          storage: this.currentSize.storage,
          gpu: this.currentSize.gpu
        }).toJSON(),
        reason: 'High utilization may cause performance issues'
      };
    }

    return {
      action: 'maintain',
      currentSize: this.currentSize.toJSON(),
      recommendedSize: this.currentSize.toJSON(),
      reason: 'Resource is properly sized'
    };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      currentSize: this.currentSize.toJSON(),
      utilization: this.utilization.toJSON(),
      cost: this.cost,
      recommendation: this.getRecommendation(),
      tags: this.tags,
      historyCount: this.history.length
    };
  }
}

/**
 * Size Option
 */
class SizeOption {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.size = new ResourceSize(config.size);
    this.utilization = new UtilizationMetrics(config.utilization || {});
    this.suitable = config.suitable || true;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      size: this.size.toJSON(),
      utilization: this.utilization.toJSON(),
      suitable: this.suitable
    };
  }
}

/**
 * Right-Size Analyzer
 */
class RightSizeAnalyzer {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.resources = new Map();
    this.sizeOptions = new Map();
    this.stats = {
      resourcesAnalyzed: 0,
      downsizeRecommended: 0,
      upsizeRecommended: 0,
      maintainRecommended: 0,
      totalPotentialSavings: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  addResource(resource) {
    this.resources.set(resource.id, resource);
    this.stats.resourcesAnalyzed++;
  }

  getResource(resourceId) {
    return this.resources.get(resourceId);
  }

  registerSizeOption(option) {
    this.sizeOptions.set(option.id, option);
  }

  analyzeResource(resourceId) {
    const resource = this.resources.get(resourceId);
    if (!resource) return null;

    const recommendation = resource.getRecommendation();

    if (recommendation.action === 'downsize') {
      this.stats.downsizeRecommended++;
      const savings = resource.cost - recommendation.recommendedSize.cost;
      this.stats.totalPotentialSavings += savings;
    } else if (recommendation.action === 'upsize') {
      this.stats.upsizeRecommended++;
    } else {
      this.stats.maintainRecommended++;
    }

    return {
      resource: resource.toJSON(),
      recommendation
    };
  }

  analyzeAll() {
    const results = [];
    for (const resourceId of this.resources.keys()) {
      const result = this.analyzeResource(resourceId);
      if (result) {
        results.push(result);
      }
    }
    return results;
  }

  getOverutilized() {
    const results = [];
    for (const resource of this.resources.values()) {
      if (resource.utilization.isOverutilized()) {
        results.push(resource);
      }
    }
    return results;
  }

  getUnderutilized() {
    const results = [];
    for (const resource of this.resources.values()) {
      if (resource.utilization.isUnderutilized()) {
        results.push(resource);
      }
    }
    return results;
  }

  getPotentialSavings() {
    return this.stats.totalPotentialSavings;
  }

  getSizeRecommendation(resourceType, utilization) {
    // Find suitable size options
    const suitable = [];

    for (const option of this.sizeOptions.values()) {
      if (option.suitable) {
        suitable.push(option.toJSON());
      }
    }

    return suitable;
  }

  getStats() {
    return {
      ...this.stats,
      totalResources: this.resources.size,
      sizeOptionsCount: this.sizeOptions.size,
      potentialSavings: this.stats.totalPotentialSavings
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Right-Size Demo\n');

  const analyzer = new RightSizeAnalyzer();

  // Register size options
  console.log('1. Registering Size Options:');
  analyzer.registerSizeOption(new SizeOption({
    id: 'vm-tiny',
    name: 'Tiny VM',
    size: { vcpu: 1, memory: 512, storage: 10, gpu: 0 },
    utilization: { cpu: 20, memory: 30 }
  }));
  analyzer.registerSizeOption(new SizeOption({
    id: 'vm-small',
    name: 'Small VM',
    size: { vcpu: 2, memory: 1024, storage: 20, gpu: 0 },
    utilization: { cpu: 40, memory: 50 }
  }));
  analyzer.registerSizeOption(new SizeOption({
    id: 'vm-medium',
    name: 'Medium VM',
    size: { vcpu: 4, memory: 2048, storage: 40, gpu: 0 },
    utilization: { cpu: 60, memory: 70 }
  }));
  analyzer.registerSizeOption(new SizeOption({
    id: 'vm-large',
    name: 'Large VM',
    size: { vcpu: 8, memory: 4096, storage: 80, gpu: 0 },
    utilization: { cpu: 80, memory: 85 }
  }));
  console.log(`   Registered ${analyzer.sizeOptions.size} size options`);

  // Add resources
  console.log('\n2. Adding Resources:');

  // Underutilized resource
  const prodServer = new MonitoredResource({
    id: 'prod-web-01',
    name: 'Production Web Server',
    type: ResourceType.VM,
    currentSize: { vcpu: 8, memory: 8192, storage: 100, gpu: 0 },
    utilization: { cpu: 12, memory: 18, network: 5, storage: 25, gpu: 0 },
    cost: 250,
    tags: { env: 'prod', app: 'web' }
  });
  analyzer.addResource(prodServer);
  console.log(`   Added: ${prodServer.name}`);
  console.log(`   Utilization: CPU ${prodServer.utilization.cpu}%, Memory ${prodServer.utilization.memory}%`);

  // Properly sized resource
  const apiServer = new MonitoredResource({
    id: 'api-server-01',
    name: 'API Server',
    type: ResourceType.VM,
    currentSize: { vcpu: 4, memory: 4096, storage: 50, gpu: 0 },
    utilization: { cpu: 65, memory: 72, network: 45, storage: 35, gpu: 0 },
    cost: 150,
    tags: { env: 'prod', app: 'api' }
  });
  analyzer.addResource(apiServer);
  console.log(`   Added: ${apiServer.name}`);
  console.log(`   Utilization: CPU ${apiServer.utilization.cpu}%, Memory ${apiServer.utilization.memory}%`);

  // Overutilized resource
  const batchWorker = new MonitoredResource({
    id: 'batch-worker-01',
    name: 'Batch Worker',
    type: ResourceType.VM,
    currentSize: { vcpu: 2, memory: 2048, storage: 30, gpu: 0 },
    utilization: { cpu: 95, memory: 88, network: 60, storage: 40, gpu: 0 },
    cost: 80,
    tags: { env: 'prod', app: 'batch' }
  });
  analyzer.addResource(batchWorker);
  console.log(`   Added: ${batchWorker.name}`);
  console.log(`   Utilization: CPU ${batchWorker.utilization.cpu}%, Memory ${batchWorker.utilization.memory}%`);

  // Analysis
  console.log('\n3. Analyzing Resources:');
  const results = analyzer.analyzeAll();
  for (const result of results) {
    const action = result.recommendation.action.toUpperCase();
    console.log(`   ${result.resource.name}:`);
    console.log(`      Action: ${action}`);
    console.log(`      Reason: ${result.recommendation.reason}`);
    if (result.recommendation.action !== 'maintain') {
      const curr = result.recommendation.currentSize;
      const rec = result.recommendation.recommendedSize;
      console.log(`      Current: ${curr.vcpu}vCPU, ${curr.memory}MB, $${curr.cost}`);
      console.log(`      Recommended: ${rec.vcpu}vCPU, ${rec.memory}MB, $${rec.cost}`);
    }
  }

  // Over/Underutilized
  console.log('\n4. Resource Status:');
  const over = analyzer.getOverutilized();
  const under = analyzer.getUnderutilized();
  console.log(`   Overutilized: ${over.length}`);
  console.log(`   Underutilized: ${under.length}`);

  // Potential savings
  console.log('\n5. Potential Savings:');
  const savings = analyzer.getPotentialSavings();
  console.log(`   Monthly savings potential: $${savings}`);

  // Stats
  console.log('\n6. Statistics:');
  const stats = analyzer.getStats();
  console.log(`   Total Resources: ${stats.totalResources}`);
  console.log(`   Downsize Recommended: ${stats.downsizeRecommended}`);
  console.log(`   Upsize Recommended: ${stats.upsizeRecommended}`);
  console.log(`   Maintain: ${stats.maintainRecommended}`);
  console.log(`   Potential Savings: $${stats.potentialSavings}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const analyzer = new RightSizeAnalyzer();
  console.log(JSON.stringify(analyzer.getStats(), null, 2));
} else {
  console.log('Agent Right-Size Module');
  console.log('Usage: node agent-right-size.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
