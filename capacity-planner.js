/**
 * Capacity Planner - 容量规划工具
 * 实现资源容量规划工具
 */

const fs = require('fs');
const path = require('path');

// ========== Resource Types ==========

const ResourceType = {
  CPU: 'cpu',
  MEMORY: 'memory',
  STORAGE: 'storage',
  NETWORK: 'network',
  DATABASE: 'database',
  CONTAINER: 'container'
};

const MetricType = {
  UTILIZATION: 'utilization',
  THROUGHPUT: 'throughput',
  LATENCY: 'latency',
  ERROR_RATE: 'error_rate',
  CAPACITY: 'capacity'
};

const ForecastModel = {
  LINEAR: 'linear',
  POLYNOMIAL: 'polynomial',
  EXPONENTIAL: 'exponential',
  MOVING_AVERAGE: 'moving_average'
};

const AlertThreshold = {
  WARNING: 70,
  CRITICAL: 85,
  EMERGENCY: 95
};

// ========== Capacity Metric ==========

class CapacityMetric {
  constructor(config) {
    this.resourceId = config.resourceId;
    this.resourceType = config.resourceType;
    this.metricType = config.metricType;
    this.value = config.value;
    this.unit = config.unit || '%';
    this.timestamp = config.timestamp || Date.now();
    this.tags = config.tags || {};
  }

  toJSON() {
    return {
      resourceId: this.resourceId,
      resourceType: this.resourceType,
      metricType: this.metricType,
      value: this.value,
      unit: this.unit,
      timestamp: this.timestamp,
      tags: this.tags
    };
  }
}

// ========== Resource Capacity ==========

class ResourceCapacity {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.current = config.current || 0;
    this.peak = config.peak || 0;
    this.average = config.average || 0;
    this.capacity = config.capacity || 100;
    this.unit = config.unit || '%';
    this.metrics = []; // Historical metrics
    this.projections = []; // Future projections

    this.thresholds = {
      warning: config.warningThreshold || AlertThreshold.WARNING,
      critical: config.criticalThreshold || AlertThreshold.CRITICAL,
      emergency: config.emergencyThreshold || AlertThreshold.EMERGENCY
    };
  }

  addMetric(metric) {
    this.metrics.push(metric);

    // Update current/peak/average
    this.current = metric.value;
    this.peak = Math.max(this.peak, metric.value);

    const recentMetrics = this.metrics.slice(-100);
    this.average = recentMetrics.reduce((sum, m) => sum + m.value, 0) / recentMetrics.length;

    return this;
  }

  getUtilization() {
    return (this.current / this.capacity) * 100;
  }

  getStatus() {
    const utilization = this.getUtilization();

    if (utilization >= this.thresholds.emergency) return 'emergency';
    if (utilization >= this.thresholds.critical) return 'critical';
    if (utilization >= this.thresholds.warning) return 'warning';
    return 'healthy';
  }

  getDaysUntilCapacity(targetUtilization = 80) {
    if (this.projections.length === 0) return null;

    const growthRate = this._calculateGrowthRate();
    if (growthRate <= 0) return Infinity;

    const currentUtil = this.getUtilization();
    const daysNeeded = (targetUtilization - currentUtil) / growthRate;

    return Math.max(0, Math.ceil(daysNeeded));
  }

  _calculateGrowthRate() {
    if (this.metrics.length < 2) return 0;

    const recent = this.metrics.slice(-30);
    if (recent.length < 2) return 0;

    // Simple linear regression
    const n = recent.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += recent[i].value;
      sumXY += i * recent[i].value;
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      current: this.current,
      peak: this.peak,
      average: this.average,
      capacity: this.capacity,
      unit: this.unit,
      utilization: this.getUtilization(),
      status: this.getStatus(),
      thresholds: this.thresholds,
      metrics: this.metrics.slice(-100).map(m => m.toJSON()),
      projections: this.projections
    };
  }
}

// ========== Capacity Forecast ==========

class CapacityForecast {
  constructor(config) {
    this.resourceId = config.resourceId;
    this.model = config.model || ForecastModel.LINEAR;
    this.predictions = [];
    this.confidence = config.confidence || 0.95;
    this.generatedAt = Date.now();
  }

  generate(metrics, daysAhead = 30) {
    if (metrics.length < 7) {
      // Not enough data, use simple projection
      const avgGrowth = this._calculateAvgGrowth(metrics);
      for (let i = 1; i <= daysAhead; i++) {
        this.predictions.push({
          daysAhead: i,
          date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString(),
          predictedValue: metrics[metrics.length - 1].value + avgGrowth * i,
          confidence: 0.5
        });
      }
      return this.predictions;
    }

    const coefficients = this._fitModel(metrics);

    for (let i = 1; i <= daysAhead; i++) {
      const predictedValue = this._predict(coefficients, metrics.length + i);
      const confidence = this._calculateConfidence(metrics, i);

      this.predictions.push({
        daysAhead: i,
        date: new Date(Date.now() + i * 24 * 60 * 60 * 1000).toISOString(),
        predictedValue: Math.max(0, predictedValue),
        confidence
      });
    }

    return this.predictions;
  }

  _calculateAvgGrowth(metrics) {
    if (metrics.length < 2) return 0;
    const recent = metrics.slice(-7);
    const first = recent[0].value;
    const last = recent[recent.length - 1].value;
    return (last - first) / recent.length;
  }

  _fitModel(metrics) {
    // Simple linear regression
    const n = metrics.length;
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += metrics[i].value;
      sumXY += i * metrics[i].value;
      sumX2 += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept };
  }

  _predict(coefficients, x) {
    return coefficients.slope * x + coefficients.intercept;
  }

  _calculateConfidence(metrics, daysAhead) {
    // Simple confidence decay based on prediction distance
    const baseConfidence = this.confidence;
    const decay = 0.02 * daysAhead;
    return Math.max(0.3, baseConfidence - decay);
  }

  getProjectionForDay(day) {
    return this.predictions.find(p => p.daysAhead === day);
  }

  getFirstDayAboveThreshold(threshold) {
    for (const pred of this.predictions) {
      if (pred.predictedValue >= threshold) {
        return pred;
      }
    }
    return null;
  }

  toJSON() {
    return {
      resourceId: this.resourceId,
      model: this.model,
      predictions: this.predictions,
      confidence: this.confidence,
      generatedAt: this.generatedAt
    };
  }
}

// ========== Capacity Planner ==========

class CapacityPlanner {
  constructor(options = {}) {
    this.resources = new Map(); // id -> ResourceCapacity
    this.storageDir = options.storageDir || './capacity-planner-data';
    this.defaultForecastDays = options.forecastDays || 30;

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadResources();
  }

  // ========== Resource Management ==========

  addResource(config) {
    const resource = new ResourceCapacity({
      id: config.id || `res_${Date.now()}`,
      ...config
    });

    this.resources.set(resource.id, resource);
    this._saveResource(resource);
    return resource;
  }

  getResource(id) {
    return this.resources.get(id);
  }

  removeResource(id) {
    this.resources.delete(id);
    this._deleteResourceFile(id);
  }

  listResources(filters = {}) {
    let result = Array.from(this.resources.values());

    if (filters.type) {
      result = result.filter(r => r.type === filters.type);
    }

    if (filters.status) {
      result = result.filter(r => r.getStatus() === filters.status);
    }

    return result.sort((a, b) => b.getUtilization() - a.getUtilization());
  }

  // ========== Metric Collection ==========

  recordMetric(resourceId, metric) {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      throw new Error(`Resource not found: ${resourceId}`);
    }

    const m = metric instanceof CapacityMetric ? metric : new CapacityMetric({
      resourceId,
      ...metric
    });

    resource.addMetric(m);
    this._saveResource(resource);

    return resource;
  }

  // ========== Forecasting ==========

  forecast(resourceId, daysAhead) {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      throw new Error(`Resource not found: ${resourceId}`);
    }

    const forecast = new CapacityForecast({
      resourceId,
      confidence: 0.95
    });

    forecast.generate(resource.metrics, daysAhead || this.defaultForecastDays);
    resource.projections = forecast.predictions;

    return forecast;
  }

  forecastAll(daysAhead) {
    const results = [];

    for (const [id, resource] of this.resources) {
      const forecast = this.forecast(id, daysAhead);
      results.push({
        resource: resource.toJSON(),
        forecast: forecast.toJSON()
      });
    }

    return results;
  }

  // ========== Capacity Analysis ==========

  getCapacityReport() {
    const resources = Array.from(this.resources.values());

    const report = {
      summary: {
        totalResources: resources.length,
        healthy: resources.filter(r => r.getStatus() === 'healthy').length,
        warning: resources.filter(r => r.getStatus() === 'warning').length,
        critical: resources.filter(r => r.getStatus() === 'critical').length,
        emergency: resources.filter(r => r.getStatus() === 'emergency').length
      },
      resources: [],
      alerts: [],
      projections: []
    };

    for (const resource of resources) {
      const utilization = resource.getUtilization();
      const status = resource.getStatus();

      report.resources.push({
        id: resource.id,
        name: resource.name,
        type: resource.type,
        utilization: utilization.toFixed(2),
        status,
        capacity: resource.capacity,
        current: resource.current,
        peak: resource.peak,
        average: resource.average
      });

      if (status !== 'healthy') {
        report.alerts.push({
          resourceId: resource.id,
          resourceName: resource.name,
          status,
          utilization: utilization.toFixed(2),
          threshold: resource.thresholds[status]
        });
      }

      // Forecast
      if (resource.metrics.length >= 7) {
        const forecast = this.forecast(resource.id, 30);
        const warningDay = forecast.getFirstDayAboveThreshold(resource.thresholds.warning);
        const criticalDay = forecast.getFirstDayAboveThreshold(resource.thresholds.critical);

        if (warningDay || criticalDay) {
          report.projections.push({
            resourceId: resource.id,
            resourceName: resource.name,
            currentUtilization: utilization.toFixed(2),
            warningAt: warningDay ? warningDay.daysAhead : null,
            criticalAt: criticalDay ? criticalDay.daysAhead : null
          });
        }
      }
    }

    return report;
  }

  // ========== Scaling Recommendations ==========

  getRecommendations() {
    const recommendations = [];

    for (const resource of this.resources.values()) {
      const utilization = resource.getUtilization();
      const status = resource.getStatus();

      if (status === 'emergency') {
        recommendations.push({
          resourceId: resource.id,
          resourceName: resource.name,
          priority: 'critical',
          action: 'SCALE_UP_IMMEDIATELY',
          reason: `Utilization at ${utilization.toFixed(1)}%`,
          suggestion: `Increase capacity by at least ${Math.ceil((utilization - 60) / 10) * 10}%`
        });
      } else if (status === 'critical') {
        recommendations.push({
          resourceId: resource.id,
          resourceName: resource.name,
          priority: 'high',
          action: 'SCHEDULE_SCALE_UP',
          reason: `Utilization at ${utilization.toFixed(1)}%`,
          suggestion: 'Plan capacity increase within 7 days'
        });
      } else if (status === 'warning') {
        recommendations.push({
          resourceId: resource.id,
          resourceName: resource.name,
          priority: 'medium',
          action: 'MONITOR_CLOSELY',
          reason: `Utilization at ${utilization.toFixed(1)}%`,
          suggestion: 'Continue monitoring, plan scaling if trend continues'
        });
      }

      // Check growth trend
      const daysUntilFull = resource.getDaysUntilCapacity(100);
      if (daysUntilFull && daysUntilFull < 30) {
        recommendations.push({
          resourceId: resource.id,
          resourceName: resource.name,
          priority: daysUntilFull < 7 ? 'critical' : 'high',
          action: 'PLAN_CAPACITY_INCREASE',
          reason: `Estimated to reach 100% in ${daysUntilFull} days`,
          suggestion: 'Based on current growth rate, plan capacity increase'
        });
      }
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  // ========== Persistence ==========

  _loadResources() {
    const file = path.join(this.storageDir, 'resources.json');
    if (!fs.existsSync(file)) return;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [id, resourceData] of Object.entries(data)) {
        const resource = new ResourceCapacity(resourceData);
        resource.metrics = (resourceData.metrics || []).map(m => new CapacityMetric(m));
        this.resources.set(id, resource);
      }
    } catch (err) {
      console.error('Failed to load resources:', err);
    }
  }

  _saveResource(resource) {
    const data = {};
    for (const [id, res] of this.resources) {
      data[id] = res.toJSON();
    }
    fs.writeFileSync(
      path.join(this.storageDir, 'resources.json'),
      JSON.stringify(data, null, 2)
    );
  }

  _deleteResourceFile(id) {
    this._saveResource(null); // Simplified
  }

  // ========== Statistics ==========

  getStats() {
    const resources = Array.from(this.resources.values());

    return {
      totalResources: resources.length,
      avgUtilization: resources.length > 0
        ? resources.reduce((sum, r) => sum + r.getUtilization(), 0) / resources.length
        : 0,
      byType: resources.reduce((acc, r) => {
        acc[r.type] = (acc[r.type] || 0) + 1;
        return acc;
      }, {}),
      byStatus: resources.reduce((acc, r) => {
        const status = r.getStatus();
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {})
    };
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const planner = new CapacityPlanner();

  switch (command) {
    case 'add':
      const resource = planner.addResource({
        id: args[1] || 'cpu-prod-1',
        name: args[2] || 'Production CPU',
        type: ResourceType.CPU,
        capacity: parseInt(args[3]) || 100,
        current: parseInt(args[4]) || 50
      });
      console.log(`Added resource: ${resource.id}`);
      break;

    case 'record':
      const resId = args[1];
      const value = parseFloat(args[2]) || 50;
      planner.recordMetric(resId, {
        resourceType: ResourceType.CPU,
        metricType: MetricType.UTILIZATION,
        value
      });
      console.log(`Recorded metric for ${resId}: ${value}%`);
      break;

    case 'list':
      console.log('Resources:');
      console.log('=========');
      for (const resource of planner.listResources()) {
        console.log(`\n${resource.name} (${resource.type})`);
        console.log(`  Utilization: ${resource.getUtilization().toFixed(1)}% [${resource.getStatus()}]`);
        console.log(`  Current: ${resource.current} | Peak: ${resource.peak} | Avg: ${resource.average.toFixed(1)}`);
      }
      break;

    case 'forecast':
      const forecastResource = planner.getResource(args[1]);
      if (forecastResource) {
        const forecast = planner.forecast(args[1], 30);
        console.log(`Forecast for ${forecastResource.name}:`);
        console.log(`  Day 7: ${forecast.getProjectionForDay(7)?.predictedValue.toFixed(1)}%`);
        console.log(`  Day 14: ${forecast.getProjectionForDay(14)?.predictedValue.toFixed(1)}%`);
        console.log(`  Day 30: ${forecast.getProjectionForDay(30)?.predictedValue.toFixed(1)}%`);
      }
      break;

    case 'report':
      console.log('Capacity Report:');
      console.log('================');
      console.log(JSON.stringify(planner.getCapacityReport(), null, 2));
      break;

    case 'recommend':
      console.log('Recommendations:');
      console.log('================');
      for (const rec of planner.getRecommendations()) {
        console.log(`\n[${rec.priority.toUpperCase()}] ${rec.action}`);
        console.log(`  Resource: ${rec.resourceName}`);
        console.log(`  Reason: ${rec.reason}`);
        console.log(`  Suggestion: ${rec.suggestion}`);
      }
      break;

    case 'stats':
      console.log('Statistics:');
      console.log('===========');
      console.log(JSON.stringify(planner.getStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node capacity-planner.js add <id> <name> <capacity> <current>');
      console.log('  node capacity-planner.js record <resourceId> <value>');
      console.log('  node capacity-planner.js list');
      console.log('  node capacity-planner.js forecast <resourceId>');
      console.log('  node capacity-planner.js report');
      console.log('  node capacity-planner.js recommend');
      console.log('  node capacity-planner.js stats');
      console.log('\nResource Types:', Object.values(ResourceType).join(', '));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  CapacityPlanner,
  ResourceCapacity,
  CapacityMetric,
  CapacityForecast,
  ResourceType,
  MetricType,
  ForecastModel,
  AlertThreshold
};
