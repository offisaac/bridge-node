/**
 * Threat Model - 威胁模型模块
 * 威胁建模助手，帮助识别和分析系统威胁
 */

const fs = require('fs');
const path = require('path');

// ========== Data Models ==========

class Threat {
  constructor(data) {
    this.id = data.id || `threat_${Date.now()}`;
    this.name = data.name;
    this.description = data.description;
    this.category = data.category || 'other'; // injection, authentication, authorization, data_leak, dos, etc.
    this.severity = data.severity || 'medium'; // low, medium, high, critical
    this.likelihood = data.likelihood || 'medium'; // low, medium, high
    this.status = data.status || 'identified'; // identified, mitigated, accepted, false_positive
    this.affectedComponents = data.affectedComponents || [];
    this.mitigations = data.mitigations || [];
    this.references = data.references || [];
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      severity: this.severity,
      likelihood: this.likelihood,
      status: this.status,
      affectedComponents: this.affectedComponents,
      mitigations: this.mitigations,
      references: this.references,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

class Component {
  constructor(data) {
    this.id = data.id || `component_${Date.now()}`;
    this.name = data.name;
    this.type = data.type; // api, database, frontend, backend, external, storage
    this.description = data.description || '';
    this.trustLevel = data.trustLevel || 'internal'; // internal, trusted, untrusted
    this.dataClassification = data.dataClassification || 'public'; // public, internal, confidential, restricted
    this.entryPoints = data.entryPoints || [];
    this.dataFlows = data.dataFlows || [];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      trustLevel: this.trustLevel,
      dataClassification: this.dataClassification,
      entryPoints: this.entryPoints,
      dataFlows: this.dataFlows
    };
  }
}

class ThreatModel {
  constructor(data) {
    this.id = data.id || `model_${Date.now()}`;
    this.name = data.name;
    this.description = data.description || '';
    this.components = data.components || [];
    this.threats = data.threats || [];
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      components: this.components,
      threats: this.threats,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// ========== Threat Categories & Patterns ==========

const ThreatPatterns = {
  injection: {
    name: 'Injection',
    description: 'SQL, NoSQL, OS, or LDAP injection',
    threats: [
      { name: 'SQL Injection', description: 'Attacker inserts malicious SQL code' },
      { name: 'NoSQL Injection', description: 'Attacker exploits NoSQL query syntax' },
      { name: 'Command Injection', description: 'Attacker executes OS commands' },
      { name: 'XSS', description: 'Cross-site scripting attack' },
      { name: 'SSRF', description: 'Server-side request forgery' }
    ]
  },
  authentication: {
    name: 'Authentication Issues',
    description: 'Authentication and session management flaws',
    threats: [
      { name: 'Weak Authentication', description: 'Insufficient authentication mechanisms' },
      { name: 'Credential Stuffing', description: 'Using stolen credentials' },
      { name: 'Session Hijacking', description: 'Stealing session tokens' },
      { name: 'Brute Force', description: 'Repeated login attempts' }
    ]
  },
  authorization: {
    name: 'Authorization Issues',
    description: 'Access control and permission problems',
    threats: [
      { name: 'IDOR', description: 'Insecure direct object reference' },
      { name: 'Privilege Escalation', description: 'Gaining higher privileges' },
      { name: 'Broken Access Control', description: 'Missing authorization checks' }
    ]
  },
  data_leak: {
    name: 'Data Leakage',
    description: 'Sensitive data exposure',
    threats: [
      { name: 'Data Breach', description: 'Unauthorized data access' },
      { name: 'Information Disclosure', description: 'Exposing sensitive info' },
      { name: 'Logging Sensitive Data', description: 'Sensitive data in logs' }
    ]
  },
  dos: {
    name: 'Denial of Service',
    description: 'Service availability attacks',
    threats: [
      { name: 'Resource Exhaustion', description: 'Consuming all resources' },
      { name: 'DDoS', description: 'Distributed denial of service' },
      { name: 'API Rate Limit Abuse', description: 'Exploiting rate limits' }
    ]
  },
  crypto: {
    name: 'Cryptographic Issues',
    description: 'Encryption and hashing problems',
    threats: [
      { name: 'Weak Encryption', description: 'Using weak algorithms' },
      { name: 'Key Management', description: 'Poor key handling' },
      { name: 'Hardcoded Secrets', description: 'Secrets in code' }
    ]
  },
  config: {
    name: 'Security Misconfiguration',
    description: 'Improper system configuration',
    threats: [
      { name: 'Default Credentials', description: 'Using default passwords' },
      { name: 'Verbose Errors', description: 'Exposing error details' },
      { name: 'Missing Security Headers', description: 'Missing HTTP security headers' }
    ]
  },
  external: {
    name: 'External Dependencies',
    description: 'Third-party component vulnerabilities',
    threats: [
      { name: 'Vulnerable Dependencies', description: 'Using outdated libraries' },
      { name: 'Supply Chain Attack', description: 'Compromised dependencies' }
    ]
  }
};

// ========== Risk Calculator ==========

class RiskCalculator {
  static calculateRisk(severity, likelihood) {
    const severityMap = { low: 1, medium: 2, high: 3, critical: 4 };
    const likelihoodMap = { low: 1, medium: 2, high: 3 };

    const score = severityMap[severity] * likelihoodMap[likelihood];

    let level;
    if (score <= 2) level = 'low';
    else if (score <= 4) level = 'medium';
    else if (score <= 8) level = 'high';
    else level = 'critical';

    return { score, level };
  }

  static getRiskColor(level) {
    const colors = {
      low: '#22c55e',
      medium: '#f59e0b',
      high: '#f97316',
      critical: '#dc2626'
    };
    return colors[level] || '#6b7280';
  }
}

// ========== Main Threat Model Class ==========

class ThreatModeler {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './threat-model-data';
    this.models = new Map();

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
  }

  _loadData() {
    const modelsFile = path.join(this.storageDir, 'models.json');
    if (fs.existsSync(modelsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(modelsFile, 'utf8'));
        for (const m of data) {
          this.models.set(m.id, new ThreatModel(m));
        }
      } catch (e) {
        console.error('Failed to load models:', e);
      }
    }
  }

  _saveData() {
    const data = Array.from(this.models.values()).map(m => m.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'models.json'),
      JSON.stringify(data, null, 2)
    );
  }

  // ========== Model Management ==========

  createModel(data) {
    const model = new ThreatModel(data);
    this.models.set(model.id, model);
    this._saveData();
    return model;
  }

  getModel(id) {
    return this.models.get(id) || null;
  }

  listModels() {
    return Array.from(this.models.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  deleteModel(id) {
    this.models.delete(id);
    this._saveData();
  }

  // ========== Component Management ==========

  addComponent(modelId, componentData) {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const component = new Component(componentData);
    model.components.push(component);
    model.updatedAt = Date.now();
    this._saveData();
    return component;
  }

  removeComponent(modelId, componentId) {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    model.components = model.components.filter(c => c.id !== componentId);
    model.updatedAt = Date.now();
    this._saveData();
  }

  // ========== Threat Management ==========

  addThreat(modelId, threatData) {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const threat = new Threat(threatData);
    model.threats.push(threat);
    model.updatedAt = Date.now();
    this._saveData();
    return threat;
  }

  updateThreat(modelId, threatId, updates) {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const threat = model.threats.find(t => t.id === threatId);
    if (!threat) {
      throw new Error(`Threat not found: ${threatId}`);
    }

    Object.assign(threat, updates);
    threat.updatedAt = Date.now();
    model.updatedAt = Date.now();
    this._saveData();
    return threat;
  }

  removeThreat(modelId, threatId) {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    model.threats = model.threats.filter(t => t.id !== threatId);
    model.updatedAt = Date.now();
    this._saveData();
  }

  // ========== Threat Generation ==========

  generateThreats(modelId) {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const generated = [];

    // Check each component against threat patterns
    for (const component of model.components) {
      // External/untrusted components get more threats
      if (component.trustLevel === 'untrusted') {
        generated.push({
          name: 'Untrusted Input Handling',
          description: `Component ${component.name} accepts untrusted input`,
          category: 'injection',
          severity: 'high',
          likelihood: 'medium',
          affectedComponents: [component.id]
        });
      }

      // Public entry points
      if (component.type === 'api' || component.type === 'frontend') {
        generated.push({
          name: 'Public API Exposure',
          description: `API ${component.name} is publicly accessible`,
          category: 'authorization',
          severity: 'medium',
          likelihood: 'high',
          affectedComponents: [component.id]
        });
      }

      // Database components
      if (component.type === 'database') {
        generated.push({
          name: 'Database Exposure',
          description: `Database ${component.name} needs protection`,
          category: 'data_leak',
          severity: 'critical',
          likelihood: 'low',
          affectedComponents: [component.id]
        });

        generated.push({
          name: 'SQL Injection',
          description: `Database ${component.name} vulnerable to SQL injection`,
          category: 'injection',
          severity: 'critical',
          likelihood: 'medium',
          affectedComponents: [component.id]
        });
      }

      // External integrations
      if (component.type === 'external') {
        generated.push({
          name: 'External Service Compromise',
          description: `External service ${component.name} could be compromised`,
          category: 'external',
          severity: 'high',
          likelihood: 'low',
          affectedComponents: [component.id]
        });
      }

      // Storage without encryption
      if (component.type === 'storage' && component.dataClassification !== 'public') {
        generated.push({
          name: 'Unencrypted Storage',
          description: `Storage ${component.name} may contain sensitive data`,
          category: 'crypto',
          severity: 'high',
          likelihood: 'medium',
          affectedComponents: [component.id]
        });
      }
    }

    // Add generated threats to model
    for (const threatData of generated) {
      const threat = new Threat(threatData);
      model.threats.push(threat);
    }

    model.updatedAt = Date.now();
    this._saveData();
    return generated;
  }

  // ========== Risk Analysis ==========

  getRiskSummary(modelId) {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const threats = model.threats;
    const severityCounts = { low: 0, medium: 0, high: 0, critical: 0 };
    const statusCounts = { identified: 0, mitigated: 0, accepted: 0, false_positive: 0 };

    let totalRiskScore = 0;
    let analyzedCount = 0;

    for (const threat of threats) {
      severityCounts[threat.severity] = (severityCounts[threat.severity] || 0) + 1;
      statusCounts[threat.status] = (statusCounts[threat.status] || 0) + 1;

      if (threat.status !== 'false_positive') {
        const risk = RiskCalculator.calculateRisk(threat.severity, threat.likelihood);
        totalRiskScore += risk.score;
        analyzedCount++;
      }
    }

    const averageRisk = analyzedCount > 0 ? totalRiskScore / analyzedCount : 0;

    return {
      totalThreats: threats.length,
      severityCounts,
      statusCounts,
      averageRiskScore: averageRisk.toFixed(2),
      riskLevel: averageRisk <= 2 ? 'low' : averageRisk <= 4 ? 'medium' : averageRisk <= 8 ? 'high' : 'critical'
    };
  }

  // ========== Export ==========

  exportReport(modelId) {
    const model = this.models.get(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    const riskSummary = this.getRiskSummary(modelId);

    let report = `# Threat Model: ${model.name}

## Overview

${model.description}

## Components

${model.components.map(c => `
### ${c.name} (${c.type})
- Trust Level: ${c.trustLevel}
- Data Classification: ${c.dataClassification}
- Description: ${c.description}
`).join('\n')}

## Risk Summary

- **Total Threats**: ${riskSummary.totalThreats}
- **Average Risk Score**: ${riskSummary.averageRiskScore}
- **Risk Level**: ${riskSummary.riskLevel}

### By Severity
- Critical: ${riskSummary.severityCounts.critical}
- High: ${riskSummary.severityCounts.high}
- Medium: ${riskSummary.severityCounts.medium}
- Low: ${riskSummary.severityCounts.low}

### By Status
- Identified: ${riskSummary.statusCounts.identified}
- Mitigated: ${riskSummary.statusCounts.mitigated}
- Accepted: ${riskSummary.statusCounts.accepted}
- False Positive: ${riskSummary.statusCounts.false_positive}

## Threats

${model.threats.map(t => `
### ${t.name}

- **Category**: ${t.category}
- **Severity**: ${t.severity}
- **Likelihood**: ${t.likelihood}
- **Status**: ${t.status}
- **Description**: ${t.description}

${t.mitigations.length > 0 ? `**Mitigations**:
${t.mitigations.map(m => `- ${m}`).join('\n')}` : ''}
`).join('\n')}

---
*Generated: ${new Date().toISOString()}*
`;

    return report;
  }

  // ========== Statistics ==========

  getStats() {
    const models = Array.from(this.models.values());
    const totalThreats = models.reduce((sum, m) => sum + m.threats.length, 0);
    const mitigatedThreats = models.reduce(
      (sum, m) => sum + m.threats.filter(t => t.status === 'mitigated').length,
      0
    );

    return {
      totalModels: models.length,
      totalThreats,
      mitigatedThreats,
      mitigationRate: totalThreats > 0 ? ((mitigatedThreats / totalThreats) * 100).toFixed(1) + '%' : 'N/A'
    };
  }

  // ========== Threat Categories ==========

  getThreatCategories() {
    return ThreatPatterns;
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const modeler = new ThreatModeler();

  switch (command) {
    case 'list':
      console.log('Threat Models:');
      console.log('=============');
      for (const m of modeler.listModels()) {
        console.log(`\n${m.name}`);
        console.log(`  Threats: ${m.threats.length} | Components: ${m.components.length}`);
      }
      break;

    case 'get':
      const model = modeler.getModel(args[1]);
      if (model) {
        console.log(JSON.stringify(model.toJSON(), null, 2));
      } else {
        console.log(`Model not found: ${args[1]}`);
      }
      break;

    case 'create':
      const newModel = modeler.createModel({
        name: args.slice(1).join(' ') || 'New Model'
      });
      console.log(`Created model: ${newModel.id}`);
      break;

    case 'add-component':
      modeler.addComponent(args[1], {
        name: args[2] || 'New Component',
        type: args[3] || 'api',
        trustLevel: args[4] || 'internal',
        dataClassification: args[5] || 'public'
      });
      console.log('Added component');
      break;

    case 'add-threat':
      modeler.addThreat(args[1], {
        name: args[2] || 'New Threat',
        description: args[3] || 'Threat description',
        category: args[4] || 'injection',
        severity: args[5] || 'medium',
        likelihood: args[6] || 'medium'
      });
      console.log('Added threat');
      break;

    case 'generate':
      const generated = modeler.generateThreats(args[1]);
      console.log(`Generated ${generated.length} threats`);
      break;

    case 'risk':
      console.log('Risk Summary:');
      console.log('=============');
      console.log(JSON.stringify(modeler.getRiskSummary(args[1]), null, 2));
      break;

    case 'report':
      console.log(modeler.exportReport(args[1]));
      break;

    case 'categories':
      console.log('Threat Categories:');
      console.log('==================');
      for (const [key, cat] of Object.entries(ThreatPatterns)) {
        console.log(`\n${cat.name} (${key})`);
        console.log(`  ${cat.description}`);
        for (const t of cat.threats) {
          console.log(`  - ${t.name}: ${t.description}`);
        }
      }
      break;

    case 'stats':
      console.log('Threat Model Statistics:');
      console.log('========================');
      console.log(JSON.stringify(modeler.getStats(), null, 2));
      break;

    case 'demo':
      // Create demo model
      const demo = modeler.createModel({
        name: 'E-Commerce Platform Threat Model',
        description: 'Security analysis for e-commerce platform'
      });

      // Add components
      modeler.addComponent(demo.id, { name: 'Web Frontend', type: 'frontend', trustLevel: 'untrusted', dataClassification: 'public' });
      modeler.addComponent(demo.id, { name: 'API Gateway', type: 'api', trustLevel: 'internal', dataClassification: 'internal' });
      modeler.addComponent(demo.id, { name: 'User Database', type: 'database', trustLevel: 'internal', dataClassification: 'confidential' });
      modeler.addComponent(demo.id, { name: 'Payment Service', type: 'external', trustLevel: 'trusted', dataClassification: 'restricted' });
      modeler.addComponent(demo.id, { name: 'File Storage', type: 'storage', trustLevel: 'internal', dataClassification: 'internal' });

      // Add manual threats
      modeler.addThreat(demo.id, { name: 'SQL Injection', description: 'User input in SQL queries', category: 'injection', severity: 'critical', likelihood: 'medium', status: 'mitigated' });
      modeler.addThreat(demo.id, { name: 'XSS Attack', description: 'Malicious scripts in user input', category: 'injection', severity: 'high', likelihood: 'high', status: 'mitigated' });
      modeler.addThreat(demo.id, { name: 'Weak Password Policy', description: 'Insufficient password requirements', category: 'authentication', severity: 'medium', likelihood: 'medium', status: 'identified' });

      // Generate threats
      const genThreats = modeler.generateThreats(demo.id);
      console.log(`Added ${genThreats.length} generated threats`);

      console.log('\n--- Risk Summary ---');
      console.log(JSON.stringify(modeler.getRiskSummary(demo.id), null, 2));

      console.log('\n--- Report Preview ---');
      console.log(modeler.exportReport(demo.id).split('\n').slice(0, 50).join('\n'));
      break;

    default:
      console.log('Usage:');
      console.log('  node threat-model.js list                                - List models');
      console.log('  node threat-model.js get <id>                           - Get model');
      console.log('  node threat-model.js create <name>                     - Create model');
      console.log('  node threat-model.js add-component <model> <name> <type> <trust> <class>');
      console.log('  node threat-model.js add-threat <model> <name> <desc> <cat> <sev> <like>');
      console.log('  node threat-model.js generate <model>                  - Auto-generate threats');
      console.log('  node threat-model.js risk <model>                       - Get risk summary');
      console.log('  node threat-model.js report <model>                     - Export report');
      console.log('  node threat-model.js categories                         - List threat categories');
      console.log('  node threat-model.js stats                            - Show statistics');
      console.log('  node threat-model.js demo                             - Run demo');
  }
}

if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  Threat,
  Component,
  ThreatModel,
  ThreatModeler,
  ThreatPatterns,
  RiskCalculator
};
