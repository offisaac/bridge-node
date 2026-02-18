/**
 * Agent Cost Optimize Module
 *
 * Provides cost analysis, optimization recommendations, and budget tracking.
 * Usage: node agent-cost-optimize.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show cost stats
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
  COMPUTE: 'compute',
  STORAGE: 'storage',
  NETWORK: 'network',
  DATABASE: 'database',
  API: 'api',
  FUNCTION: 'function',
  CONTAINER: 'container'
};

/**
 * Cost Category
 */
const CostCategory = {
  FIXED: 'fixed',
  VARIABLE: 'variable',
  ONE_TIME: 'one_time',
  USAGE: 'usage'
};

/**
 * Cost Entry
 */
class CostEntry {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.resourceId = config.resourceId;
    this.resourceName = config.resourceName;
    this.resourceType = config.resourceType;
    this.category = config.category || CostCategory.USAGE;
    this.amount = config.amount;
    this.currency = config.currency || 'USD';
    this.period = config.period || 'monthly';
    this.tags = config.tags || {};
    this.metadata = config.metadata || {};
    this.timestamp = config.timestamp || Date.now();
  }

  getMonthlyAmount() {
    switch (this.period) {
      case 'hourly': return this.amount * 24 * 30;
      case 'daily': return this.amount * 30;
      case 'weekly': return this.amount * 4;
      case 'monthly': return this.amount;
      case 'yearly': return this.amount / 12;
      default: return this.amount;
    }
  }

  toJSON() {
    return {
      id: this.id,
      resourceId: this.resourceId,
      resourceName: this.resourceName,
      resourceType: this.resourceType,
      category: this.category,
      amount: this.amount,
      currency: this.currency,
      period: this.period,
      monthlyAmount: this.getMonthlyAmount(),
      tags: this.tags,
      timestamp: this.timestamp
    };
  }
}

/**
 * Resource
 */
class Resource {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.costs = [];
    this.metrics = config.metrics || {};
    this.tags = config.tags || {};
  }

  addCost(cost) {
    this.costs.push(cost);
  }

  getTotalCost() {
    return this.costs.reduce((sum, c) => sum + c.getMonthlyAmount(), 0);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      totalCost: this.getTotalCost(),
      costs: this.costs.map(c => c.toJSON()),
      metrics: this.metrics,
      tags: this.tags
    };
  }
}

/**
 * Optimization Recommendation
 */
class Recommendation {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.title = config.title;
    this.description = config.description;
    this.category = config.category; // right-size, reserved, spot, etc.
    this.resourceId = config.resourceId;
    this.resourceName = config.resourceName;
    this.currentCost = config.currentCost;
    this.projectedSavings = config.projectedSavings;
    this.savingsPercent = config.savingsPercent;
    this.effort = config.effort || 'medium'; // low, medium, high
    this.impact = config.impact || 'medium'; // low, medium, high
    this.risk = config.risk || 'low'; // low, medium, high
    this.status = config.status || 'pending'; // pending, approved, rejected, implemented
    this.createdAt = config.createdAt || Date.now();
  }

  getScore() {
    // Calculate priority score
    const savingsScore = Math.min(this.savingsPercent / 20, 5); // Max 5 points
    const effortScore = this.effort === 'low' ? 3 : this.effort === 'medium' ? 2 : 1;
    const impactScore = this.impact === 'high' ? 3 : this.impact === 'medium' ? 2 : 1;
    const riskScore = this.risk === 'low' ? 3 : this.risk === 'medium' ? 2 : 1;
    return savingsScore + effortScore + impactScore + riskScore;
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      category: this.category,
      resourceId: this.resourceId,
      resourceName: this.resourceName,
      currentCost: this.currentCost,
      projectedSavings: this.projectedSavings,
      savingsPercent: this.savingsPercent,
      effort: this.effort,
      impact: this.impact,
      risk: this.risk,
      status: this.status,
      score: this.getScore(),
      createdAt: this.createdAt
    };
  }
}

/**
 * Budget
 */
class Budget {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.limit = config.limit;
    this.current = 0;
    this.period = config.period || 'monthly';
    this.alerts = config.alerts || [50, 80, 100]; // Alert thresholds
    this.currency = config.currency || 'USD';
  }

  addCost(amount) {
    this.current += amount;
  }

  getUsagePercent() {
    return (this.current / this.limit * 100).toFixed(2);
  }

  getRemaining() {
    return Math.max(0, this.limit - this.current);
  }

  getAlertLevel() {
    const percent = parseFloat(this.getUsagePercent());
    if (percent >= 100) return 'exceeded';
    if (percent >= 80) return 'critical';
    if (percent >= 50) return 'warning';
    return 'ok';
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      limit: this.limit,
      current: this.current,
      remaining: this.getRemaining(),
      usagePercent: this.getUsagePercent(),
      period: this.period,
      alertLevel: this.getAlertLevel(),
      currency: this.currency
    };
  }
}

/**
 * Cost Report
 */
class CostReport {
  constructor(config) {
    this.id = config.id || `report_${Date.now()}`;
    this.name = config.name;
    this.startDate = config.startDate;
    this.endDate = config.endDate || Date.now();
    this.resources = [];
    this.budgets = [];
    this.recommendations = [];
    this.summary = {};
  }

  addResource(resource) {
    this.resources.push(resource);
  }

  addBudget(budget) {
    this.budgets.push(budget);
  }

  addRecommendation(recommendation) {
    this.recommendations.push(recommendation);
  }

  generate() {
    // Calculate summary
    const totalCost = this.resources.reduce((sum, r) => sum + r.getTotalCost(), 0);

    const byType = {};
    for (const resource of this.resources) {
      if (!byType[resource.type]) {
        byType[resource.type] = 0;
      }
      byType[resource.type] += resource.getTotalCost();
    }

    const totalProjectedSavings = this.recommendations
      .filter(r => r.status === 'pending')
      .reduce((sum, r) => sum + r.projectedSavings, 0);

    const budgetStatus = this.budgets.map(b => b.toJSON());

    this.summary = {
      totalCost,
      byType,
      resourceCount: this.resources.length,
      recommendationCount: this.recommendations.length,
      pendingSavings: totalProjectedSavings,
      potentialSavingsPercent: totalCost > 0
        ? ((totalProjectedSavings / totalCost) * 100).toFixed(2)
        : 0,
      generatedAt: Date.now()
    };

    return this.summary;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      startDate: this.startDate,
      endDate: this.endDate,
      summary: this.summary,
      resources: this.resources.map(r => r.toJSON()),
      budgets: budgetStatus,
      recommendations: this.recommendations.map(r => r.toJSON())
    };
  }
}

/**
 * Cost Optimizer
 */
class CostOptimizer {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.resources = new Map();
    this.recommendations = [];
    this.budgets = new Map();
    this.stats = {
      totalCost: 0,
      totalSavings: 0,
      recommendationsGenerated: 0,
      recommendationsImplemented: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  addResource(resource) {
    this.resources.set(resource.id, resource);
  }

  getResource(resourceId) {
    return this.resources.get(resourceId);
  }

  addCostEntry(resourceId, costConfig) {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      // Create resource if doesn't exist
      const newResource = new Resource({
        id: resourceId,
        name: costConfig.resourceName || resourceId,
        type: costConfig.resourceType || ResourceType.COMPUTE
      });
      this.resources.set(resourceId, newResource);
    }

    const cost = new CostEntry(costConfig);
    this.resources.get(resourceId).addCost(cost);
    this.stats.totalCost += cost.getMonthlyAmount();
    return cost;
  }

  createBudget(config) {
    const budget = new Budget(config);
    this.budgets.set(budget.id, budget);
    return budget;
  }

  analyze() {
    const recommendations = [];

    // Right-size analysis
    for (const [id, resource] of this.resources) {
      const costs = resource.costs;
      if (costs.length === 0) continue;

      const avgCost = costs.reduce((sum, c) => sum + c.getMonthlyAmount(), 0) / costs.length;

      // Check if resource is underutilized
      if (resource.metrics.avgUtilization && resource.metrics.avgUtilization < 30) {
        recommendations.push(new Recommendation({
          title: `Right-size ${resource.name}`,
          description: `Resource utilization is ${resource.metrics.avgUtilization}%. Consider downsizing.`,
          category: 'right-size',
          resourceId: resource.id,
          resourceName: resource.name,
          currentCost: avgCost,
          projectedSavings: avgCost * 0.4,
          savingsPercent: 40,
          effort: 'low',
          impact: 'medium',
          risk: 'low'
        }));
      }

      // Check for idle resources
      if (resource.metrics.avgUtilization === 0 && costs.length > 1) {
        recommendations.push(new Recommendation({
          title: `Remove idle ${resource.name}`,
          description: 'Resource has zero utilization but continues to incur costs.',
          category: 'remove',
          resourceId: resource.id,
          resourceName: resource.name,
          currentCost: avgCost,
          projectedSavings: avgCost,
          savingsPercent: 100,
          effort: 'low',
          impact: 'high',
          risk: 'low'
        }));
      }
    }

    // Reserved instance analysis
    const computeResources = Array.from(this.resources.values())
      .filter(r => r.type === ResourceType.COMPUTE);

    if (computeResources.length > 2) {
      const computeCost = computeResources.reduce((sum, r) => sum + r.getTotalCost(), 0);
      recommendations.push(new Recommendation({
        title: 'Purchase Reserved Instances',
        description: 'Consider reserved instances for sustained compute usage.',
        category: 'reserved',
        resourceId: 'compute',
        resourceName: 'All Compute Resources',
        currentCost: computeCost,
        projectedSavings: computeCost * 0.3,
        savingsPercent: 30,
        effort: 'medium',
        impact: 'high',
        risk: 'low'
      }));
    }

    // Spot instance analysis
    recommendations.push(new Recommendation({
      title: 'Use Spot Instances for batch workloads',
      description: 'Batch processing can use spot instances for 60-90% savings.',
      category: 'spot',
      resourceId: 'batch',
      resourceName: 'Batch Processing',
      currentCost: 500,
      projectedSavings: 350,
      savingsPercent: 70,
      effort: 'high',
      impact: 'high',
      risk: 'medium'
    }));

    this.recommendations = recommendations;
    this.stats.recommendationsGenerated = recommendations.length;

    return recommendations;
  }

  approveRecommendation(recommendationId) {
    const rec = this.recommendations.find(r => r.id === recommendationId);
    if (rec) {
      rec.status = 'approved';
    }
    return rec;
  }

  implementRecommendation(recommendationId) {
    const rec = this.recommendations.find(r => r.id === recommendationId);
    if (rec) {
      rec.status = 'implemented';
      this.stats.totalSavings += rec.projectedSavings;
      this.stats.recommendationsImplemented++;
    }
    return rec;
  }

  updateBudget(budgetId, amount) {
    const budget = this.budgets.get(budgetId);
    if (budget) {
      budget.addCost(amount);
    }
    return budget;
  }

  generateReport(name = 'Monthly Report') {
    const report = new CostReport({
      id: `report_${Date.now()}`,
      name,
      startDate: Date.now() - 30 * 24 * 60 * 60 * 1000
    });

    for (const resource of this.resources.values()) {
      report.addResource(resource);
    }

    for (const budget of this.budgets.values()) {
      report.addBudget(budget);
    }

    for (const rec of this.recommendations) {
      report.addRecommendation(rec);
    }

    return report.generate();
  }

  getStats() {
    return {
      ...this.stats,
      resourceCount: this.resources.size,
      budgetCount: this.budgets.size,
      pendingRecommendations: this.recommendations.filter(r => r.status === 'pending').length,
      approvedRecommendations: this.recommendations.filter(r => r.status === 'approved').length,
      implementedRecommendations: this.recommendations.filter(r => r.status === 'implemented').length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Cost Optimize Demo\n');

  const optimizer = new CostOptimizer();

  // Add resources with costs
  console.log('1. Adding Resources:');

  // Compute resources
  optimizer.addResource(new Resource({
    id: 'ec2-prod-1',
    name: 'Production EC2',
    type: ResourceType.COMPUTE,
    metrics: { avgUtilization: 85 }
  }));
  optimizer.addCostEntry('ec2-prod-1', {
    resourceId: 'ec2-prod-1',
    resourceName: 'Production EC2',
    resourceType: ResourceType.COMPUTE,
    amount: 450,
    period: 'monthly'
  });

  optimizer.addResource(new Resource({
    id: 'ec2-dev-1',
    name: 'Dev EC2',
    type: ResourceType.COMPUTE,
    metrics: { avgUtilization: 15 }
  }));
  optimizer.addCostEntry('ec2-dev-1', {
    resourceId: 'ec2-dev-1',
    resourceName: 'Dev EC2',
    resourceType: ResourceType.COMPUTE,
    amount: 200,
    period: 'monthly'
  });

  // Storage
  optimizer.addCostEntry('s3-1', {
    resourceId: 's3-1',
    resourceName: 'S3 Storage',
    resourceType: ResourceType.STORAGE,
    amount: 150,
    period: 'monthly'
  });

  // Database
  optimizer.addCostEntry('rds-1', {
    resourceId: 'rds-1',
    resourceName: 'RDS Database',
    resourceType: ResourceType.DATABASE,
    amount: 300,
    period: 'monthly'
  });

  // Network
  optimizer.addCostEntry('nat-gw-1', {
    resourceId: 'nat-gw-1',
    resourceName: 'NAT Gateway',
    resourceType: ResourceType.NETWORK,
    amount: 50,
    period: 'monthly'
  });

  console.log(`   Added ${optimizer.resources.size} resources`);

  // Create budget
  console.log('\n2. Creating Budget:');
  const budget = optimizer.createBudget({
    id: 'monthly-ops',
    name: 'Monthly Operations',
    limit: 2000,
    period: 'monthly'
  });
  console.log(`   Budget: $${budget.limit}/month`);

  // Update budget
  optimizer.updateBudget('monthly-ops', 1150);
  console.log(`   Current: $${budget.current}`);
  console.log(`   Usage: ${budget.getUsagePercent()}%`);
  console.log(`   Alert Level: ${budget.getAlertLevel()}`);

  // Analyze for recommendations
  console.log('\n3. Analyzing Costs:');
  const recommendations = optimizer.analyze();
  console.log(`   Generated ${recommendations.length} recommendations`);

  for (const rec of recommendations) {
    console.log(`   - ${rec.title}: $${rec.projectedSavings}/mo savings (${rec.savingsPercent}%)`);
  }

  // Approve and implement recommendations
  console.log('\n4. Implementing Recommendations:');
  if (recommendations.length > 0) {
    optimizer.approveRecommendation(recommendations[0].id);
    console.log(`   Approved: ${recommendations[0].title}`);
    optimizer.implementRecommendation(recommendations[0].id);
    console.log(`   Implemented: ${recommendations[0].title}`);
  }

  // Generate report
  console.log('\n5. Generating Report:');
  const report = optimizer.generateReport('Monthly Cost Report');
  console.log(`   Total Cost: $${report.totalCost}`);
  console.log(`   By Type:`);
  for (const [type, cost] of Object.entries(report.byType)) {
    console.log(`      - ${type}: $${cost}`);
  }
  console.log(`   Potential Savings: $${report.pendingSavings} (${report.potentialSavingsPercent}%)`);

  // Stats
  console.log('\n6. Statistics:');
  const stats = optimizer.getStats();
  console.log(`   Total Cost: $${stats.totalCost}`);
  console.log(`   Total Savings: $${stats.totalSavings}`);
  console.log(`   Resources: ${stats.resourceCount}`);
  console.log(`   Recommendations Generated: ${stats.recommendationsGenerated}`);
  console.log(`   Recommendations Implemented: ${stats.recommendationsImplemented}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const optimizer = new CostOptimizer();
  console.log(JSON.stringify(optimizer.getStats(), null, 2));
} else {
  console.log('Agent Cost Optimize Module');
  console.log('Usage: node agent-cost-optimize.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
