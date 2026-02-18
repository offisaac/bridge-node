/**
 * Deployment Predictor - 部署预测模块
 * 预测部署成功率，分析历史数据模式
 */

const fs = require('fs');
const path = require('path');

// ========== Data Models ==========

class DeploymentRecord {
  constructor(data) {
    this.id = data.id || `deploy_${Date.now()}`;
    this.timestamp = data.timestamp || Date.now();
    this.service = data.service;
    this.environment = data.environment; // production, staging, development
    this.strategy = data.strategy || 'rolling'; // rolling, blue-green, canary
    this.version = data.version;
    this.changes = data.changes || []; // file changes, config changes
    this.testCoverage = data.testCoverage || 0; // 0-100
    this.hasRollback = data.hasRollback !== false;
    this.approvals = data.approvals || 0;
    this.timeOfDay = data.timeOfDay; // hour 0-23
    this.dayOfWeek = data.dayOfWeek; // 0-6
    this.teamExperience = data.teamExperience || 3; // years
    this.previousFailures = data.previousFailures || 0;
    this.success = data.success; // boolean
    this.failureReason = data.failureReason || null;
  }

  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      service: this.service,
      environment: this.environment,
      strategy: this.strategy,
      version: this.version,
      changes: this.changes,
      testCoverage: this.testCoverage,
      hasRollback: this.hasRollback,
      approvals: this.approvals,
      timeOfDay: this.timeOfDay,
      dayOfWeek: this.dayOfWeek,
      teamExperience: this.teamExperience,
      previousFailures: this.previousFailures,
      success: this.success,
      failureReason: this.failureReason
    };
  }
}

class PredictionResult {
  constructor(data) {
    this.predicted = data.predicted;
    this.confidence = data.confidence; // 0-1
    this.riskFactors = data.riskFactors || [];
    this.recommendations = data.recommendations || [];
    this.historicalSuccessRate = data.historicalSuccessRate;
    this.similarDeployments = data.similarDeployments || [];
  }

  toJSON() {
    return {
      predicted: this.predicted,
      confidence: this.confidence,
      riskFactors: this.riskFactors,
      recommendations: this.recommendations,
      historicalSuccessRate: this.historicalSuccessRate,
      similarDeployments: this.similarDeployments
    };
  }
}

// ========== Analysis Engines ==========

class HistoricalAnalyzer {
  constructor(records) {
    this.records = records;
  }

  getSuccessRate(filters = {}) {
    let filtered = this.records;

    if (filters.environment) {
      filtered = filtered.filter(r => r.environment === filters.environment);
    }
    if (filters.service) {
      filtered = filtered.filter(r => r.service === filters.service);
    }
    if (filters.strategy) {
      filtered = filtered.filter(r => r.strategy === filters.strategy);
    }

    if (filtered.length === 0) return { rate: 0.5, count: 0 };

    const successCount = filtered.filter(r => r.success).length;
    return {
      rate: successCount / filtered.length,
      count: filtered.length,
      successCount
    };
  }

  findSimilarRecords(deployment, limit = 5) {
    return this.records
      .map(record => {
        let similarity = 0;
        if (record.service === deployment.service) similarity += 3;
        if (record.environment === deployment.environment) similarity += 2;
        if (record.strategy === deployment.strategy) similarity += 1;
        // Similar change count
        const changeDiff = Math.abs(record.changes.length - deployment.changes.length);
        similarity += Math.max(0, 2 - changeDiff);
        // Similar test coverage
        const coverageDiff = Math.abs(record.testCoverage - deployment.testCoverage);
        similarity += Math.max(0, 1 - coverageDiff / 100);
        return { record, similarity };
      })
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit)
      .map(r => r.record);
  }

  analyzeRiskFactors(deployment) {
    const factors = [];

    // Low test coverage
    if (deployment.testCoverage < 50) {
      factors.push({
        factor: 'Low Test Coverage',
        impact: 'high',
        weight: 0.2,
        message: `Test coverage is only ${deployment.testCoverage}%`
      });
    }

    // High change count
    if (deployment.changes.length > 20) {
      factors.push({
        factor: 'Many Changes',
        impact: 'medium',
        weight: 0.15,
        message: `${deployment.changes.length} files changed in this deployment`
      });
    }

    // No rollback plan
    if (!deployment.hasRollback) {
      factors.push({
        factor: 'No Rollback Plan',
        impact: 'high',
        weight: 0.2,
        message: 'No rollback mechanism configured'
      });
    }

    // Insufficient approvals
    if (deployment.approvals < 1 && deployment.environment === 'production') {
      factors.push({
        factor: 'Insufficient Approvals',
        impact: 'medium',
        weight: 0.1,
        message: 'Production deployments require at least 1 approval'
      });
    }

    // Risky time of day
    if (deployment.timeOfDay !== undefined) {
      if (deployment.timeOfDay < 6 || deployment.timeOfDay > 22) {
        factors.push({
          factor: 'Off-Hours Deployment',
          impact: 'medium',
          weight: 0.1,
          message: 'Deployments during off-hours may have slower response times'
        });
      }
    }

    // Previous failures
    if (deployment.previousFailures > 2) {
      factors.push({
        factor: 'Recent Failures',
        impact: 'high',
        weight: 0.25,
        message: `${deployment.previousFailures} recent failures for this service`
      });
    }

    // Low team experience
    if (deployment.teamExperience < 1) {
      factors.push({
        factor: 'Inexperienced Team',
        impact: 'low',
        weight: 0.05,
        message: 'Team has less than 1 year experience with this service'
      });
    }

    return factors;
  }

  generateRecommendations(deployment, riskFactors) {
    const recommendations = [];

    if (deployment.testCoverage < 70) {
      recommendations.push('Increase test coverage to at least 70% before deploying');
    }

    if (!deployment.hasRollback) {
      recommendations.push('Configure automatic rollback mechanism');
    }

    if (deployment.approvals < 1 && deployment.environment === 'production') {
      recommendations.push('Get at least one approval from a senior engineer');
    }

    const hasSimilarFailure = riskFactors.some(f =>
      f.factor === 'Recent Failures' && f.impact === 'high'
    );
    if (hasSimilarFailure) {
      recommendations.push('Conduct a pre-deployment review meeting');
    }

    if (deployment.changes.length > 15) {
      recommendations.push('Consider breaking this into smaller, incremental deployments');
    }

    if (recommendations.length === 0) {
      recommendations.push('Deployment looks good! Proceed with confidence.');
    }

    return recommendations;
  }
}

class PredictionModel {
  constructor(records) {
    this.analyzer = new HistoricalAnalyzer(records);
    this.weights = {
      testCoverage: 0.25,
      approvals: 0.15,
      hasRollback: 0.15,
      previousFailures: 0.2,
      teamExperience: 0.1,
      changes: 0.1,
      timeOfDay: 0.05
    };
  }

  predict(deployment) {
    const records = this.analyzer.findSimilarRecords(deployment, 10);
    const riskFactors = this.analyzer.analyzeRiskFactors(deployment);
    const recommendations = this.analyzer.generateRecommendations(deployment, riskFactors);

    // Calculate base probability from similar deployments
    let similarSuccessRate = 0.5;
    if (records.length > 0) {
      const successCount = records.filter(r => r.success).length;
      similarSuccessRate = successCount / records.length;
    }

    // Adjust based on risk factors
    let riskAdjustment = 0;
    for (const factor of riskFactors) {
      if (factor.impact === 'high') {
        riskAdjustment -= factor.weight;
      } else if (factor.impact === 'medium') {
        riskAdjustment -= factor.weight * 0.5;
      }
    }

    // Boost for positive factors
    if (deployment.testCoverage >= 80) riskAdjustment += 0.1;
    if (deployment.approvals >= 2) riskAdjustment += 0.1;
    if (deployment.hasRollback) riskAdjustment += 0.05;
    if (deployment.teamExperience >= 3) riskAdjustment += 0.05;

    let predictedSuccess = Math.max(0, Math.min(1, similarSuccessRate + riskAdjustment));
    const predicted = predictedSuccess >= 0.5;

    // Calculate confidence based on data availability
    let confidence = 0.5;
    if (records.length >= 5) confidence += 0.2;
    if (records.length >= 10) confidence += 0.1;
    if (deployment.testCoverage > 0) confidence += 0.1;
    if (deployment.approvals > 0) confidence += 0.1;

    const historicalRate = this.analyzer.getSuccessRate({
      environment: deployment.environment,
      service: deployment.service
    });

    return new PredictionResult({
      predicted,
      confidence: Math.min(1, confidence),
      riskFactors,
      recommendations,
      historicalSuccessRate: historicalRate.rate,
      similarDeployments: records.map(r => ({
        id: r.id,
        timestamp: r.timestamp,
        success: r.success
      }))
    });
  }
}

// ========== Main Predictor Class ==========

class DeploymentPredictor {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './deployment-predictor-data';
    this.records = [];
    this.model = null;

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadRecords();
    this.model = new PredictionModel(this.records);
  }

  _loadRecords() {
    const recordsFile = path.join(this.storageDir, 'records.json');
    if (fs.existsSync(recordsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(recordsFile, 'utf8'));
        this.records = data.map(d => new DeploymentRecord(d));
      } catch (e) {
        console.error('Failed to load records:', e);
        this.records = [];
      }
    }
  }

  _saveRecords() {
    const recordsFile = path.join(this.storageDir, 'records.json');
    fs.writeFileSync(
      recordsFile,
      JSON.stringify(this.records.map(r => r.toJSON()), null, 2)
    );
  }

  // ========== Public API ==========

  addRecord(recordData) {
    const record = new DeploymentRecord(recordData);
    this.records.push(record);
    this._saveRecords();
    this.model = new PredictionModel(this.records);
    return record;
  }

  predict(deploymentData) {
    const deployment = new DeploymentRecord(deploymentData);
    return this.model.predict(deployment);
  }

  getStats() {
    const total = this.records.length;
    if (total === 0) {
      return {
        totalDeployments: 0,
        successRate: 0,
        byEnvironment: {},
        byStrategy: {},
        byService: {}
      };
    }

    const successCount = this.records.filter(r => r.success).length;

    const byEnvironment = {};
    const byStrategy = {};
    const byService = {};

    for (const record of this.records) {
      byEnvironment[record.environment] = (byEnvironment[record.environment] || 0) + 1;
      byStrategy[record.strategy] = (byStrategy[record.strategy] || 0) + 1;
      byService[record.service] = (byService[record.service] || 0) + 1;
    }

    return {
      totalDeployments: total,
      successRate: successCount / total,
      successCount,
      byEnvironment,
      byStrategy,
      byService
    };
  }

  getRecommendations(deploymentData) {
    const result = this.predict(deploymentData);
    return result.recommendations;
  }

  getRiskAssessment(deploymentData) {
    const deployment = new DeploymentRecord(deploymentData);
    const analyzer = new HistoricalAnalyzer(this.records);
    return analyzer.analyzeRiskFactors(deployment);
  }

  // Pre-built prediction scenarios
  quickPredict(service, environment = 'production') {
    return this.predict({
      service,
      environment,
      strategy: 'rolling',
      changes: [],
      testCoverage: 70,
      hasRollback: true,
      approvals: 1,
      timeOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
      teamExperience: 2,
      previousFailures: 0
    });
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const predictor = new DeploymentPredictor();

  switch (command) {
    case 'predict':
      const service = args[1] || 'myservice';
      const env = args[2] || 'production';
      const result = predictor.quickPredict(service, env);
      console.log('Deployment Prediction:');
      console.log('======================');
      console.log(JSON.stringify(result.toJSON(), null, 2));
      break;

    case 'add':
      const record = predictor.addRecord({
        service: args[1] || 'test-service',
        environment: args[2] || 'production',
        strategy: args[3] || 'rolling',
        testCoverage: parseInt(args[4]) || 80,
        hasRollback: args[5] !== 'false',
        approvals: parseInt(args[6]) || 1,
        timeOfDay: new Date().getHours(),
        dayOfWeek: new Date().getDay(),
        teamExperience: parseInt(args[7]) || 2,
        previousFailures: parseInt(args[8]) || 0,
        success: args[9] === 'true'
      });
      console.log(`Added deployment record: ${record.id}`);
      break;

    case 'stats':
      console.log('Deployment Statistics:');
      console.log('======================');
      console.log(JSON.stringify(predictor.getStats(), null, 2));
      break;

    case 'demo':
      // Add demo records
      const demoRecords = [
        { service: 'api-gateway', environment: 'production', strategy: 'rolling', testCoverage: 85, hasRollback: true, approvals: 2, success: true },
        { service: 'api-gateway', environment: 'production', strategy: 'rolling', testCoverage: 90, hasRollback: true, approvals: 2, success: true },
        { service: 'api-gateway', environment: 'production', strategy: 'canary', testCoverage: 70, hasRollback: true, approvals: 1, success: false, failureReason: 'High latency' },
        { service: 'user-service', environment: 'staging', strategy: 'rolling', testCoverage: 60, hasRollback: false, approvals: 0, success: true },
        { service: 'user-service', environment: 'production', strategy: 'blue-green', testCoverage: 95, hasRollback: true, approvals: 3, success: true },
        { service: 'payment-service', environment: 'production', strategy: 'canary', testCoverage: 45, hasRollback: true, approvals: 1, success: false, failureReason: 'Payment processing error' },
        { service: 'notification-service', environment: 'production', strategy: 'rolling', testCoverage: 80, hasRollback: true, approvals: 2, success: true },
        { service: 'notification-service', environment: 'production', strategy: 'rolling', testCoverage: 30, hasRollback: false, approvals: 0, success: false, failureReason: 'Configuration error' }
      ];

      for (const r of demoRecords) {
        predictor.addRecord({
          ...r,
          timeOfDay: 10,
          dayOfWeek: 1,
          teamExperience: 3,
          previousFailures: 0
        });
      }
      console.log('Added demo records');

      // Test prediction
      console.log('\nPrediction for new deployment:');
      const prediction = predictor.predict({
        service: 'api-gateway',
        environment: 'production',
        strategy: 'rolling',
        changes: ['src/auth.ts', 'src/middleware.ts'],
        testCoverage: 75,
        hasRollback: true,
        approvals: 1,
        timeOfDay: 14,
        dayOfWeek: 3,
        teamExperience: 2,
        previousFailures: 0
      });
      console.log(JSON.stringify(prediction.toJSON(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node deployment-predictor.js predict <service> <env>  - Quick predict');
      console.log('  node deployment-predictor.js add <service> <env> <strategy> <coverage> <rollback> <approvals> <experience> <failures> <success>');
      console.log('  node deployment-predictor.js stats                         - Show statistics');
      console.log('  node deployment-predictor.js demo                         - Run demo');
  }
}

if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  DeploymentRecord,
  PredictionResult,
  HistoricalAnalyzer,
  PredictionModel,
  DeploymentPredictor
};
