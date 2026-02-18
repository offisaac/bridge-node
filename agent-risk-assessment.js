/**
 * Agent Risk Assessment Module
 *
 * Provides risk assessment and scoring services.
 * Usage: node agent-risk-assessment.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show risk assessment stats
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
 * Risk Level
 */
const RiskLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
};

/**
 * Risk Category
 */
const RiskCategory = {
  FINANCIAL: 'financial',
  COMPLIANCE: 'compliance',
  OPERATIONAL: 'operational',
  REPUTATIONAL: 'reputational',
  SECURITY: 'security',
  CREDIT: 'credit'
};

/**
 * Risk Factor
 */
class RiskFactor {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.category = config.category;
    this.weight = config.weight || 1.0;
    this.score = 0;
    this.maxScore = config.maxScore || 100;
    this.description = config.description;
    this.metadata = config.metadata || {};
  }

  setScore(score) {
    this.score = Math.max(0, Math.min(this.maxScore, score));
  }

  getNormalizedScore() {
    return (this.score / this.maxScore) * this.weight;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      weight: this.weight,
      score: this.score,
      maxScore: this.maxScore
    };
  }
}

/**
 * Risk Assessment
 */
class RiskAssessment {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.subjectId = config.subjectId;
    this.subjectType = config.subjectType; // user, transaction, account
    this.overallScore = 0;
    this.riskLevel = RiskLevel.LOW;
    this.factors = [];
    this.recommendations = [];
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
  }

  addFactor(factor) {
    this.factors.push(factor);
  }

  calculate() {
    let totalWeightedScore = 0;
    let totalWeight = 0;

    for (const factor of this.factors) {
      totalWeightedScore += factor.getNormalizedScore();
      totalWeight += factor.weight;
    }

    this.overallScore = totalWeight > 0 ? (totalWeightedScore / totalWeight) * 100 : 0;
    this.riskLevel = this._determineRiskLevel();
    this.recommendations = this._generateRecommendations();
    this.updatedAt = Date.now();

    return this.overallScore;
  }

  _determineRiskLevel() {
    if (this.overallScore >= 80) return RiskLevel.CRITICAL;
    if (this.overallScore >= 60) return RiskLevel.HIGH;
    if (this.overallScore >= 40) return RiskLevel.MEDIUM;
    return RiskLevel.LOW;
  }

  _generateRecommendations() {
    const recommendations = [];

    for (const factor of this.factors) {
      const normalizedScore = (factor.score / factor.maxScore) * 100;

      if (normalizedScore >= 80) {
        recommendations.push({
          factor: factor.name,
          priority: 'high',
          action: `Immediate attention required for ${factor.name}`
        });
      } else if (normalizedScore >= 60) {
        recommendations.push({
          factor: factor.name,
          priority: 'medium',
          action: `Review and monitor ${factor.name}`
        });
      }
    }

    return recommendations;
  }

  toJSON() {
    return {
      id: this.id,
      subjectId: this.subjectId,
      overallScore: this.overallScore,
      riskLevel: this.riskLevel,
      factorsCount: this.factors.length,
      recommendationsCount: this.recommendations.length,
      createdAt: this.createdAt
    };
  }
}

/**
 * Risk Assessment Manager
 */
class RiskAssessmentManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.assessments = new Map();
    this.factorTemplates = new Map();
    this.stats = {
      assessmentsCreated: 0,
      highRiskFound: 0,
      mediumRiskFound: 0,
      lowRiskFound: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._loadDefaultFactorTemplates();
  }

  _loadDefaultFactorTemplates() {
    // Financial risk factors
    this.addFactorTemplate(new RiskFactor({
      id: 'factor-credit-score',
      name: 'Credit Score',
      category: RiskCategory.CREDIT,
      weight: 2.0,
      maxScore: 850,
      description: 'Credit score assessment'
    }));

    this.addFactorTemplate(new RiskFactor({
      id: 'factor-debt-ratio',
      name: 'Debt to Income Ratio',
      category: RiskCategory.FINANCIAL,
      weight: 1.5,
      maxScore: 100,
      description: 'Monthly debt payments vs income'
    }));

    // Compliance risk factors
    this.addFactorTemplate(new RiskFactor({
      id: 'factor-kyc-status',
      name: 'KYC Status',
      category: RiskCategory.COMPLIANCE,
      weight: 2.0,
      maxScore: 100,
      description: 'Know Your Customer verification status'
    }));

    this.addFactorTemplate(new RiskFactor({
      id: 'factor-pep-status',
      name: 'PEP Screening',
      category: RiskCategory.COMPLIANCE,
      weight: 1.8,
      maxScore: 100,
      description: 'Politically Exposed Person screening'
    }));

    // Security risk factors
    this.addFactorTemplate(new RiskFactor({
      id: 'factor-authentication',
      name: 'Authentication Strength',
      category: RiskCategory.SECURITY,
      weight: 1.5,
      maxScore: 100,
      description: 'Multi-factor authentication status'
    }));
  }

  addFactorTemplate(factor) {
    this.factorTemplates.set(factor.id, factor);
  }

  createAssessment(subjectId, subjectType) {
    const assessment = new RiskAssessment({ subjectId, subjectType });
    this.assessments.set(assessment.id, assessment);
    this.stats.assessmentsCreated++;
    return assessment;
  }

  addFactorToAssessment(assessmentId, factorId, score) {
    const assessment = this.assessments.get(assessmentId);
    if (!assessment) {
      return null;
    }

    const template = this.factorTemplates.get(factorId);
    if (!template) {
      return null;
    }

    // Create a copy of the factor
    const factor = new RiskFactor({
      ...template.toJSON(),
      id: crypto.randomUUID()
    });
    factor.setScore(score);

    assessment.addFactor(factor);
    return factor;
  }

  runAssessment(subjectId, subjectType, factorScores) {
    const assessment = this.createAssessment(subjectId, subjectType);

    // Add factors with scores
    for (const [factorId, score] of Object.entries(factorScores)) {
      this.addFactorToAssessment(assessment.id, factorId, score);
    }

    // Calculate overall risk
    assessment.calculate();

    // Update stats
    if (assessment.riskLevel === RiskLevel.CRITICAL || assessment.riskLevel === RiskLevel.HIGH) {
      this.stats.highRiskFound++;
    } else if (assessment.riskLevel === RiskLevel.MEDIUM) {
      this.stats.mediumRiskFound++;
    } else {
      this.stats.lowRiskFound++;
    }

    return assessment;
  }

  getAssessment(assessmentId) {
    return this.assessments.get(assessmentId);
  }

  getStats() {
    return {
      ...this.stats,
      totalAssessments: this.assessments.size,
      factorTemplates: this.factorTemplates.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Risk Assessment Demo\n');

  const manager = new RiskAssessmentManager();

  // Show factor templates
  console.log('1. Risk Factor Templates:');
  for (const factor of manager.factorTemplates.values()) {
    console.log(`   - ${factor.name} (${factor.category}) [weight: ${factor.weight}]`);
  }

  // Run assessment for low-risk user
  console.log('\n2. Running Assessment (Low Risk):');
  const assessment1 = manager.runAssessment('user-123', 'user', {
    'factor-credit-score': 750,
    'factor-debt-ratio': 20,
    'factor-kyc-status': 100,
    'factor-pep-status': 0,
    'factor-authentication': 100
  });
  console.log(`   Overall Score: ${assessment1.overallScore.toFixed(1)}`);
  console.log(`   Risk Level: ${assessment1.riskLevel}`);

  // Run assessment for high-risk user
  console.log('\n3. Running Assessment (High Risk):');
  const assessment2 = manager.runAssessment('user-456', 'user', {
    'factor-credit-score': 550,
    'factor-debt-ratio': 60,
    'factor-kyc-status': 50,
    'factor-pep-status': 90,
    'factor-authentication': 30
  });
  console.log(`   Overall Score: ${assessment2.overallScore.toFixed(1)}`);
  console.log(`   Risk Level: ${assessment2.riskLevel}`);

  // Show recommendations
  console.log('\n4. Recommendations:');
  for (const rec of assessment2.recommendations) {
    console.log(`   [${rec.priority}] ${rec.action}`);
  }

  // Get stats
  console.log('\n5. Statistics:');
  const stats = manager.getStats();
  console.log(`   Assessments Created: ${stats.assessmentsCreated}`);
  console.log(`   High Risk Found: ${stats.highRiskFound}`);
  console.log(`   Medium Risk Found: ${stats.mediumRiskFound}`);
  console.log(`   Low Risk Found: ${stats.lowRiskFound}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new RiskAssessmentManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Risk Assessment Module');
  console.log('Usage: node agent-risk-assessment.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
