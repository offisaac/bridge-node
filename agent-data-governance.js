/**
 * Agent Data Governance - Data Governance Agent
 *
 * Provides data governance and data management capabilities.
 *
 * Usage: node agent-data-governance.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   catalog    - Data catalog
 *   policies   - List governance policies
 */

class DataAsset {
  constructor(config) {
    this.id = `asset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.type = config.type; // table, file, API, stream
    this.owner = config.owner;
    this.sensitivity = config.sensitivity; // public, internal, confidential, restricted
    this.retention = config.retention || '7 years';
  }
}

class DataPolicy {
  constructor(config) {
    this.id = `policy-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.description = config.description;
    this.scope = config.scope; // organization, department, project
    this.enforced = config.enforced || false;
  }
}

class DataQualityRule {
  constructor(config) {
    this.id = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.assetId = config.assetId;
    this.rule = config.rule; // not-null, unique, range, format
    this.threshold = config.threshold;
    this.status = config.status || 'active';
  }
}

class DataLineage {
  constructor(config) {
    this.id = `lineage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.source = config.source;
    this.target = config.target;
    this.transform = config.transform || 'none';
    this.quality = config.quality || 'unknown';
  }
}

class DataSteward {
  constructor(config) {
    this.id = `steward-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.role = config.role; // steward, owner, custodian
    this.domains = config.domains || [];
  }
}

class DataGovernanceAgent {
  constructor(config = {}) {
    this.name = config.name || 'DataGovernanceAgent';
    this.version = config.version || '1.0';
    this.assets = new Map();
    this.policies = new Map();
    this.qualityRules = new Map();
    this.lineage = new Map();
    this.stewards = new Map();
    this.stats = {
      assetsCataloged: 0,
      policiesEnforced: 0,
      qualityChecksRun: 0
    };
    this.initPolicies();
  }

  initPolicies() {
    const policies = [
      new DataPolicy({ name: 'Data Classification', description: 'Classify all data by sensitivity', scope: 'organization', enforced: true }),
      new DataPolicy({ name: 'Data Retention', description: 'Retain data per schedule', scope: 'organization', enforced: true }),
      new DataPolicy({ name: 'Data Access Control', description: 'Restrict access based on need-to-know', scope: 'organization', enforced: true }),
      new DataPolicy({ name: 'Data Quality', description: 'Ensure data quality standards', scope: 'department', enforced: false }),
      new DataPolicy({ name: 'Data Privacy', description: 'Protect PII and sensitive data', scope: 'organization', enforced: true })
    ];
    policies.forEach(p => this.policies.set(p.id, p));
    this.stats.policiesEnforced = policies.filter(p => p.enforced).length;
  }

  registerAsset(name, type, owner, sensitivity, retention) {
    const asset = new DataAsset({ name, type, owner, sensitivity, retention });
    this.assets.set(asset.id, asset);
    this.stats.assetsCataloged++;
    return asset;
  }

  addQualityRule(assetId, rule, threshold) {
    const qualityRule = new DataQualityRule({ assetId, rule, threshold });
    this.qualityRules.set(qualityRule.id, qualityRule);
    return qualityRule;
  }

  trackLineage(source, target, transform, quality) {
    const lineage = new DataLineage({ source, target, transform, quality });
    this.lineage.set(lineage.id, lineage);
    return lineage;
  }

  assignSteward(name, role, domains) {
    const steward = new DataSteward({ name, role, domains });
    this.stewards.set(steward.id, steward);
    return steward;
  }

  runQualityCheck(assetId) {
    this.stats.qualityChecksRun++;
    const rules = Array.from(this.qualityRules.values()).filter(r => r.assetId === assetId);
    const passed = rules.filter(r => r.status === 'active').length;
    return {
      assetId,
      rulesChecked: rules.length,
      passed,
      failed: rules.length - passed,
      score: rules.length > 0 ? Math.round((passed / rules.length) * 100) : 100
    };
  }

  assessDataMaturity() {
    const totalAssets = this.assets.size;
    const classifiedAssets = Array.from(this.assets.values()).filter(a => a.sensitivity !== 'public').length;
    const totalPolicies = this.policies.size;
    const enforcedPolicies = Array.from(this.policies.values()).filter(p => p.enforced).length;
    const totalRules = this.qualityRules.size;
    const activeRules = Array.from(this.qualityRules.values()).filter(r => r.status === 'active').length;

    const classificationScore = totalAssets > 0 ? Math.round((classifiedAssets / totalAssets) * 100) : 0;
    const policyScore = Math.round((enforcedPolicies / totalPolicies) * 100);
    const qualityScore = totalRules > 0 ? Math.round((activeRules / totalRules) * 100) : 0;

    const overallScore = Math.round((classificationScore + policyScore + qualityScore) / 3);

    return {
      totalAssets,
      classifiedAssets,
      classificationScore,
      policyScore,
      qualityScore,
      overallScore
    };
  }

  listAssets() {
    return Array.from(this.assets.values());
  }

  listPolicies() {
    return Array.from(this.policies.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const dg = new DataGovernanceAgent();

switch (command) {
  case 'demo': {
    console.log('=== Agent Data Governance Demo\n');

    // 1. Data Assets
    console.log('1. Data Assets:');
    const asset1 = dg.registerAsset('customer_data', 'table', 'sales@company.com', 'confidential', '5 years');
    const asset2 = dg.registerAsset('user_logs', 'file', 'engineering@company.com', 'internal', '1 year');
    const asset3 = dg.registerAsset('payment_info', 'table', 'finance@company.com', 'restricted', '7 years');
    console.log(`   Asset: ${asset1.name} (${asset1.type})`);
    console.log(`   Owner: ${asset1.owner}`);
    console.log(`   Sensitivity: ${asset1.sensitivity}`);
    console.log(`   Retention: ${asset1.retention}`);
    console.log(`   Asset: ${asset2.name} (${asset2.type})`);
    console.log(`   Asset: ${asset3.name} (${asset3.type})`);

    // 2. Governance Policies
    console.log('\n2. Governance Policies:');
    const policies = dg.listPolicies();
    console.log(`   Total: ${policies.length} policies`);
    policies.slice(0, 3).forEach(p => {
      console.log(`   - ${p.name}: ${p.description}`);
      console.log(`     Scope: ${p.scope}, Enforced: ${p.enforced}`);
    });

    // 3. Data Quality Rules
    console.log('\n3. Data Quality Rules:');
    const rule1 = dg.addQualityRule(asset1.id, 'not-null', 100);
    const rule2 = dg.addQualityRule(asset1.id, 'unique', 100);
    const rule3 = dg.addQualityRule(asset3.id, 'encryption', 100);
    console.log(`   Rule 1: ${asset1.name} - ${rule1.rule} (threshold: ${rule1.threshold}%)`);
    console.log(`   Rule 2: ${asset1.name} - ${rule2.rule} (threshold: ${rule2.threshold}%)`);
    console.log(`   Rule 3: ${asset3.name} - ${rule3.rule} (threshold: ${rule3.threshold}%)`);

    // 4. Data Lineage
    console.log('\n4. Data Lineage:');
    const lineage1 = dg.trackLineage('raw_data', 'processed_data', 'ETL transform', 'good');
    const lineage2 = dg.trackLineage('processed_data', 'analytics_data', 'Aggregation', 'good');
    console.log(`   Flow: ${lineage1.source} -> ${lineage1.target}`);
    console.log(`   Transform: ${lineage1.transform}`);
    console.log(`   Quality: ${lineage1.quality}`);
    console.log(`   Flow: ${lineage2.source} -> ${lineage2.target}`);

    // 5. Data Stewardship
    console.log('\n5. Data Stewardship:');
    const steward1 = dg.assignSteward('Alice Chen', 'steward', ['customer data', 'analytics']);
    const steward2 = dg.assignSteward('Bob Smith', 'owner', ['payment data']);
    console.log(`   Steward: ${steward1.name}`);
    console.log(`   Role: ${steward1.role}`);
    console.log(`   Domains: ${steward1.domains.join(', ')}`);
    console.log(`   Steward: ${steward2.name}`);
    console.log(`   Role: ${steward2.role}`);

    // 6. Quality Check
    console.log('\n6. Quality Check:');
    const qualityResult = dg.runQualityCheck(asset1.id);
    console.log(`   Asset: ${asset1.name}`);
    console.log(`   Rules Checked: ${qualityResult.rulesChecked}`);
    console.log(`   Passed: ${qualityResult.passed}`);
    console.log(`   Failed: ${qualityResult.failed}`);
    console.log(`   Score: ${qualityResult.score}%`);

    // 7. Data Maturity Assessment
    console.log('\n7. Data Maturity Assessment:');
    const maturity = dg.assessDataMaturity();
    console.log(`   Total Assets: ${maturity.totalAssets}`);
    console.log(`   Classification Score: ${maturity.classificationScore}%`);
    console.log(`   Policy Score: ${maturity.policyScore}%`);
    console.log(`   Quality Score: ${maturity.qualityScore}%`);
    console.log(`   Overall Score: ${maturity.overallScore}%`);

    // 8. Statistics
    console.log('\n8. Statistics:');
    const stats = dg.getStats();
    console.log(`   Assets cataloged: ${stats.assetsCataloged}`);
    console.log(`   Policies enforced: ${stats.policiesEnforced}`);
    console.log(`   Quality checks run: ${stats.qualityChecksRun}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'catalog': {
    const assets = dg.listAssets();
    console.log('Data Catalog:');
    assets.forEach(a => {
      console.log(`  ${a.name} (${a.type}): ${a.sensitivity} - Owner: ${a.owner}`);
    });
    break;
  }

  case 'policies': {
    console.log('Governance Policies:');
    dg.listPolicies().forEach(p => {
      console.log(`  ${p.name}: ${p.description} [${p.enforced ? 'enforced' : 'not enforced'}]`);
    });
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-data-governance.js [demo|catalog|policies]');
  }
}
