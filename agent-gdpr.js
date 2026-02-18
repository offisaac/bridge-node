/**
 * Agent GDPR - GDPR Compliance Agent
 *
 * Provides GDPR compliance and data protection capabilities.
 *
 * Usage: node agent-gdpr.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   assess      - Assess GDPR compliance
 *   rights      - List data subject rights
 */

class GDPRPolicy {
  constructor(config) {
    this.id = `gdpr-pol-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.article = config.article;
    this.title = config.title;
    this.description = config.description;
    this.compliance = config.compliance || 'unknown';
  }
}

class DataSubjectRequest {
  constructor(config) {
    this.id = `dsr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.type = config.type; // access, rectification, erasure, portability
    this.subjectId = config.subjectId;
    this.status = config.status || 'pending';
    this.createdAt = config.createdAt || Date.now();
    this.completedAt = config.completedAt || null;
  }
}

class ProcessingActivity {
  constructor(config) {
    this.id = `process-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.purpose = config.purpose;
    this.legalBasis = config.legalBasis;
    this.dataCategories = config.dataCategories || [];
    this.retention = config.retention;
  }
}

class DataBreach {
  constructor(config) {
    this.id = `breach-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.description = config.description;
    this.severity = config.severity;
    this.affectedSubjects = config.affectedSubjects || 0;
    this.reported = config.reported || false;
    this.reportedAt = config.reportedAt || null;
  }
}

class ComplianceAudit {
  constructor(config) {
    this.id = `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.scope = config.scope;
    this.status = config.status || 'pending';
    this.findings = config.findings || [];
    this.score = config.score || 0;
  }
}

class GDPRAgent {
  constructor(config = {}) {
    this.name = config.name || 'GDPRAgent';
    this.version = config.version || '1.0';
    this.policies = new Map();
    this.requests = new Map();
    this.activities = new Map();
    this.breaches = new Map();
    this.audits = new Map();
    this.stats = {
      requestsProcessed: 0,
      breachesReported: 0,
      auditsCompleted: 0
    };
    this.initPolicies();
  }

  initPolicies() {
    const policies = [
      new GDPRPolicy({ article: 'Art. 5', title: 'Principles', description: 'Lawfulness, fairness, transparency', compliance: 'compliant' }),
      new GDPRPolicy({ article: 'Art. 6', title: 'Legal Basis', description: 'Conditions for lawful processing', compliance: 'compliant' }),
      new GDPRPolicy({ article: 'Art. 12-22', title: 'Data Subject Rights', description: 'Access, rectification, erasure, portability', compliance: 'compliant' }),
      new GDPRPolicy({ article: 'Art. 25', title: 'Data Protection by Design', description: 'Privacy by design and default', compliance: 'partial' }),
      new GDPRPolicy({ article: 'Art. 32', title: 'Security', description: 'Appropriate technical measures', compliance: 'compliant' }),
      new GDPRPolicy({ article: 'Art. 33', title: 'Breach Notification', description: '72-hour notification requirement', compliance: 'compliant' }),
      new GDPRPolicy({ article: 'Art. 35', title: 'DPIA', description: 'Data protection impact assessment', compliance: 'needs-review' })
    ];
    policies.forEach(p => this.policies.set(p.article, p));
  }

  processRequest(subjectId, requestType) {
    const request = new DataSubjectRequest({ type: requestType, subjectId });
    this.requests.set(request.id, request);

    // Simulate processing
    request.status = 'completed';
    request.completedAt = Date.now();
    this.stats.requestsProcessed++;

    return request;
  }

  registerActivity(name, purpose, legalBasis, dataCategories, retention) {
    const activity = new ProcessingActivity({ name, purpose, legalBasis, dataCategories, retention });
    this.activities.set(activity.id, activity);
    return activity;
  }

  reportBreach(description, severity, affectedSubjects) {
    const breach = new DataBreach({ description, severity, affectedSubjects, reported: true, reportedAt: Date.now() });
    this.breaches.set(breach.id, breach);
    this.stats.breachesReported++;
    return breach;
  }

  conductAudit(scope) {
    const audit = new ComplianceAudit({
      scope,
      status: 'completed',
      findings: ['Minor issues found in data retention policy'],
      score: 85
    });
    this.audits.set(audit.id, audit);
    this.stats.auditsCompleted++;
    return audit;
  }

  assessCompliance() {
    const policies = Array.from(this.policies.values());
    const compliant = policies.filter(p => p.compliance === 'compliant').length;
    const partial = policies.filter(p => p.compliance === 'partial').length;
    const needsReview = policies.filter(p => p.compliance === 'needs-review').length;
    const score = Math.round((compliant / policies.length) * 100);

    return {
      total: policies.length,
      compliant,
      partial,
      needsReview,
      score
    };
  }

  listPolicies() {
    return Array.from(this.policies.values());
  }

  listRequests() {
    return Array.from(this.requests.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const gdpr = new GDPRAgent();

switch (command) {
  case 'demo': {
    console.log('=== Agent GDPR Demo\n');

    // 1. GDPR Policies
    console.log('1. GDPR Policies:');
    const policies = gdpr.listPolicies();
    console.log(`   Total: ${policies.length} policies`);
    policies.slice(0, 4).forEach(p => {
      console.log(`   - ${p.article}: ${p.title}`);
      console.log(`     Compliance: ${p.compliance}`);
    });

    // 2. Compliance Assessment
    console.log('\n2. Compliance Assessment:');
    const assessment = gdpr.assessCompliance();
    console.log(`   Overall Score: ${assessment.score}%`);
    console.log(`   Compliant: ${assessment.compliant}`);
    console.log(`   Partial: ${assessment.partial}`);
    console.log(`   Needs Review: ${assessment.needsReview}`);

    // 3. Data Subject Requests
    console.log('\n3. Data Subject Requests:');
    const accessRequest = gdpr.processRequest('user-123', 'access');
    console.log(`   Request Type: ${accessRequest.type}`);
    console.log(`   Subject: ${accessRequest.subjectId}`);
    console.log(`   Status: ${accessRequest.status}`);

    const erasureRequest = gdpr.processRequest('user-456', 'erasure');
    console.log(`   Erasure Request: ${erasureRequest.id}`);

    // 4. Processing Activities
    console.log('\n4. Processing Activities:');
    const activity = gdpr.registerActivity(
      'Customer Analytics',
      'Analyze customer behavior for product improvement',
      'Legitimate Interest',
      ['email', 'purchase history', 'browsing behavior'],
      '24 months'
    );
    console.log(`   Activity: ${activity.name}`);
    console.log(`   Purpose: ${activity.purpose}`);
    console.log(`   Legal Basis: ${activity.legalBasis}`);
    console.log(`   Retention: ${activity.retention}`);

    // 5. Data Breach Handling
    console.log('\n5. Data Breach Handling:');
    const breach = gdpr.reportBreach('Unauthorized access to user database', 'high', 1500);
    console.log(`   Breach ID: ${breach.id}`);
    console.log(`   Severity: ${breach.severity}`);
    console.log(`   Affected Users: ${breach.affectedSubjects}`);
    console.log(`   Reported: ${breach.reported}`);
    console.log(`   Reported At: ${new Date(breach.reportedAt).toISOString()}`);

    // 6. Compliance Audit
    console.log('\n6. Compliance Audit:');
    const audit = gdpr.conductAudit('Marketing Department');
    console.log(`   Scope: ${audit.scope}`);
    console.log(`   Status: ${audit.status}`);
    console.log(`   Score: ${audit.score}/100`);
    console.log(`   Findings: ${audit.findings.join(', ')}`);

    // 7. Statistics
    console.log('\n7. Statistics:');
    const stats = gdpr.getStats();
    console.log(`   Requests processed: ${stats.requestsProcessed}`);
    console.log(`   Breaches reported: ${stats.breachesReported}`);
    console.log(`   Audits completed: ${stats.auditsCompleted}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'assess': {
    const result = gdpr.assessCompliance();
    console.log(`GDPR Compliance Score: ${result.score}%`);
    console.log(`Compliant: ${result.compliant}, Partial: ${result.partial}, Needs Review: ${result.needsReview}`);
    break;
  }

  case 'rights': {
    console.log('Data Subject Rights (GDPR Articles 12-22):');
    console.log('  - Right to Access (Art. 15)');
    console.log('  - Right to Rectification (Art. 16)');
    console.log('  - Right to Erasure (Art. 17)');
    console.log('  - Right to Restriction (Art. 18)');
    console.log('  - Right to Data Portability (Art. 20)');
    console.log('  - Right to Object (Art. 21)');
    console.log('  - Rights related to Automated Decision-making (Art. 22)');
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-gdpr.js [demo|assess|rights]');
  }
}
