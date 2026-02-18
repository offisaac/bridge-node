/**
 * Agent HR Compliance - HR Compliance Management Module
 *
 * Manages HR compliance requirements, regulations, audits, and policy enforcement.
 *
 * Usage: node agent-hr-compliance.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   list    - List compliance requirements
 *   audit   - Run compliance audit
 */

class ComplianceRequirement {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.category = config.category; // 'labor_law', 'safety', 'data_privacy', 'employment', 'benefits'
    this.name = config.name;
    this.description = config.description;
    this.severity = config.severity || 'high'; // 'critical', 'high', 'medium', 'low'
    this.jurisdiction = config.jurisdiction || 'federal'; // 'federal', 'state', 'local', 'international'
    this.effectiveDate = config.effectiveDate ? new Date(config.effectiveDate) : null;
    this.expirationDate = config.expirationDate ? new Date(config.expirationDate) : null;
    this.associatedLaws = config.associatedLaws || [];
    this.checklist = config.checklist || [];
    this.documentationRequired = config.documentationRequired || [];
    this.penalties = config.penalties || { type: 'fine', amount: 0 };
  }

  isActive() {
    const now = new Date();
    if (this.expirationDate && now > this.expirationDate) return false;
    if (this.effectiveDate && now < this.effectiveDate) return false;
    return true;
  }

  toString() {
    return `${this.name} (${this.category}) - ${this.severity}`;
  }
}

class ComplianceCheck {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.requirementId = config.requirementId;
    this.employeeId = config.employeeId || null;
    this.departmentId = config.departmentId || null;
    this.status = config.status || 'pending'; // 'passed', 'failed', 'pending', 'not_applicable'
    this.checkedAt = config.checkedAt ? new Date(config.checkedAt) : null;
    this.checkedBy = config.checkedBy || null;
    this.findings = config.findings || [];
    this.evidence = config.evidence || [];
    this.notes = config.notes || '';
  }

  markPassed(checkedBy, findings = []) {
    this.status = 'passed';
    this.checkedAt = new Date();
    this.checkedBy = checkedBy;
    this.findings = findings;
  }

  markFailed(checkedBy, findings, evidence = []) {
    this.status = 'failed';
    this.checkedAt = new Date();
    this.checkedBy = checkedBy;
    this.findings = findings;
    this.evidence = evidence;
  }
}

class ComplianceAudit {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description || '';
    this.auditType = config.auditType || 'internal'; // 'internal', 'external', 'regulatory', 'self'
    this.startDate = config.startDate ? new Date(config.startDate) : null;
    this.endDate = config.endDate ? new Date(config.endDate) : null;
    this.status = config.status || 'planned'; // 'planned', 'in_progress', 'completed', 'cancelled'
    this.scope = config.scope || []; // requirement IDs
    this.departments = config.departments || [];
    this.findings = [];
    this.score = null;
    this.conductedBy = config.conductedBy || '';
  }

  start(auditor) {
    this.status = 'in_progress';
    this.startDate = new Date();
    this.conductedBy = auditor;
  }

  complete(findings = []) {
    this.status = 'completed';
    this.endDate = new Date();
    this.findings = findings;
    this.score = this._calculateScore();
  }

  _calculateScore() {
    if (this.findings.length === 0) return 100;

    const critical = this.findings.filter(f => f.severity === 'critical').length;
    const high = this.findings.filter(f => f.severity === 'high').length;
    const medium = this.findings.filter(f => f.severity === 'medium').length;
    const low = this.findings.filter(f => f.severity === 'low').length;

    const deduction = (critical * 25) + (high * 15) + (medium * 5) + (low * 2);
    return Math.max(0, 100 - deduction);
  }
}

class ComplianceFinding {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.requirementId = config.requirementId;
    this.requirementName = config.requirementName;
    this.description = config.description;
    this.severity = config.severity || 'medium';
    this.category = config.category;
    this.affectedEmployees = config.affectedEmployees || [];
    this.affectedDepartments = config.affectedDepartments || [];
    this.recommendation = config.recommendation || '';
    this.dueDate = config.dueDate ? new Date(config.dueDate) : null;
    this.resolvedAt = config.resolvedAt ? new Date(config.resolvedAt) : null;
    this.resolution = config.resolution || '';
    this.status = config.status || 'open'; // 'open', 'in_progress', 'resolved', 'accepted_risk'
  }

  resolve(resolution) {
    this.status = 'resolved';
    this.resolvedAt = new Date();
    this.resolution = resolution;
  }
}

class PolicyViolation {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.policyId = config.policyId;
    this.policyName = config.policyName;
    this.description = config.description;
    this.severity = config.severity || 'low';
    this.reportedAt = config.reportedAt ? new Date(config.reportedAt) : new Date();
    this.reportedBy = config.reportedBy || '';
    this.status = config.status || 'reported'; // 'reported', 'investigating', 'resolved', 'appealed'
    this.action = config.action || '';
    this.resolvedAt = config.resolvedAt ? new Date(config.resolvedAt) : null;
  }
}

class HRComplianceManager {
  constructor() {
    this.requirements = new Map();
    this.audits = new Map();
    this.findings = [];
    this.violations = new Map();
    this.policies = new Map();

    this._initializeDefaultRequirements();
    this._initializeDefaultPolicies();
  }

  _initializeDefaultRequirements() {
    const defaultRequirements = [
      {
        id: 'CR-001',
        category: 'labor_law',
        name: 'Minimum Wage Compliance',
        description: 'Ensure all employees are paid at least the federal/state minimum wage',
        severity: 'critical',
        jurisdiction: 'federal',
        associatedLaws: ['FLSA', 'State Minimum Wage Act'],
        documentationRequired: ['Payroll records', 'Time cards'],
        penalties: { type: 'fine', amount: 1000 }
      },
      {
        id: 'CR-002',
        category: 'labor_law',
        name: 'Overtime Pay',
        description: 'Non-exempt employees must receive overtime pay for hours over 40/week',
        severity: 'critical',
        jurisdiction: 'federal',
        associatedLaws: ['FLSA'],
        documentationRequired: ['Overtime records', 'Payroll'],
        penalties: { type: 'fine', amount: 1000 }
      },
      {
        id: 'CR-003',
        category: 'safety',
        name: 'Workplace Safety (OSHA)',
        description: 'Maintain a safe workplace environment per OSHA regulations',
        severity: 'critical',
        jurisdiction: 'federal',
        associatedLaws: ['OSHA', 'State OSHA'],
        documentationRequired: ['Safety logs', 'Incident reports', 'Training records'],
        penalties: { type: 'fine', amount: 5000 }
      },
      {
        id: 'CR-004',
        category: 'data_privacy',
        name: 'Employee Data Privacy',
        description: 'Protect employee personal information per GDPR/CCPA',
        severity: 'high',
        jurisdiction: 'federal',
        associatedLaws: ['GDPR', 'CCPA'],
        documentationRequired: ['Privacy policy', 'Data processing records'],
        penalties: { type: 'fine', amount: 50000 }
      },
      {
        id: 'CR-005',
        category: 'employment',
        name: 'Equal Employment Opportunity',
        description: 'Prohibit discrimination in hiring and employment',
        severity: 'critical',
        jurisdiction: 'federal',
        associatedLaws: ['EEOC', 'Title VII'],
        documentationRequired: ['EEO reports', 'Hiring records'],
        penalties: { type: 'fine', amount: 10000 }
      },
      {
        id: 'CR-006',
        category: 'employment',
        name: 'I-9 Employment Eligibility',
        description: 'Verify employment eligibility for all hires',
        severity: 'critical',
        jurisdiction: 'federal',
        associatedLaws: ['Immigration Reform and Control Act'],
        documentationRequired: ['Form I-9', 'Identification documents'],
        penalties: { type: 'fine', amount: 2500 }
      },
      {
        id: 'CR-007',
        category: 'benefits',
        name: 'COBRA Notification',
        description: 'Provide COBRA notices to eligible employees',
        severity: 'high',
        jurisdiction: 'federal',
        associatedLaws: ['COBRA'],
        documentationRequired: ['COBRA notices', 'Election forms'],
        penalties: { type: 'fine', amount: 100 }
      },
      {
        id: 'CR-008',
        category: 'safety',
        name: 'Emergency Evacuation Plan',
        description: 'Maintain and communicate emergency evacuation procedures',
        severity: 'high',
        jurisdiction: 'local',
        documentationRequired: ['Evacuation plan', 'Training records'],
        penalties: { type: 'fine', amount: 500 }
      },
      {
        id: 'CR-009',
        category: 'labor_law',
        name: 'Family and Medical Leave (FMLA)',
        description: 'Provide eligible employees with FMLA leave',
        severity: 'high',
        jurisdiction: 'federal',
        associatedLaws: ['FMLA'],
        documentationRequired: ['Leave requests', 'Medical certifications'],
        penalties: { type: 'fine', amount: 1000 }
      },
      {
        id: 'CR-010',
        category: 'data_privacy',
        name: 'Records Retention',
        description: 'Maintain employee records for required retention periods',
        severity: 'medium',
        jurisdiction: 'federal',
        documentationRequired: ['Retention policy', 'Records inventory'],
        penalties: { type: 'fine', amount: 500 }
      }
    ];

    defaultRequirements.forEach(req => {
      this.requirements.set(req.id, new ComplianceRequirement(req));
    });
  }

  _initializeDefaultPolicies() {
    const defaultPolicies = [
      {
        id: 'POL-001',
        name: 'Code of Conduct',
        description: 'Standards of professional behavior',
        category: 'employment',
        effectiveDate: '2020-01-01'
      },
      {
        id: 'POL-002',
        name: 'Anti-Harassment Policy',
        description: 'Prohibition of workplace harassment',
        category: 'employment',
        effectiveDate: '2020-01-01'
      },
      {
        id: 'POL-003',
        name: 'Data Security Policy',
        description: 'Protection of sensitive data',
        category: 'data_privacy',
        effectiveDate: '2021-01-01'
      },
      {
        id: 'POL-004',
        name: 'Safety Procedures',
        description: 'Workplace safety guidelines',
        category: 'safety',
        effectiveDate: '2019-06-01'
      },
      {
        id: 'POL-005',
        name: 'Attendance Policy',
        description: 'Employee attendance requirements',
        category: 'employment',
        effectiveDate: '2020-01-01'
      }
    ];

    defaultPolicies.forEach(policy => {
      this.policies.set(policy.id, policy);
    });
  }

  addRequirement(requirementConfig) {
    const requirement = new ComplianceRequirement(requirementConfig);
    this.requirements.set(requirement.id, requirement);
    return requirement;
  }

  getRequirement(requirementId) {
    return this.requirements.get(requirementId);
  }

  listRequirements(category = null, jurisdiction = null, activeOnly = true) {
    let results = Array.from(this.requirements.values());

    if (activeOnly) {
      results = results.filter(r => r.isActive());
    }

    if (category) {
      results = results.filter(r => r.category === category);
    }

    if (jurisdiction) {
      results = results.filter(r => r.jurisdiction === jurisdiction);
    }

    return results;
  }

  createAudit(auditConfig) {
    const audit = new ComplianceAudit(auditConfig);
    this.audits.set(audit.id, audit);
    return audit;
  }

  getAudit(auditId) {
    return this.audits.get(auditId);
  }

  runAudit(auditId, employeeData = {}) {
    const audit = this.audits.get(auditId);
    if (!audit) throw new Error('Audit not found');

    audit.start('Compliance Officer');
    const findings = [];

    // Check each requirement in scope
    audit.scope.forEach(reqId => {
      const requirement = this.requirements.get(reqId);
      if (!requirement || !requirement.isActive()) return;

      // Simulate compliance check
      const passed = Math.random() > 0.3; // 70% pass rate for demo

      if (!passed) {
        const finding = new ComplianceFinding({
          requirementId: reqId,
          requirementName: requirement.name,
          description: `Compliance issue found in ${requirement.category}`,
          severity: requirement.severity,
          category: requirement.category,
          recommendation: `Review and update ${requirement.name} compliance procedures`,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        });
        findings.push(finding);
        this.findings.push(finding);
      }
    });

    audit.complete(findings);
    return { audit, findings };
  }

  getFindings(status = null) {
    let results = this.findings;

    if (status) {
      results = results.filter(f => f.status === status);
    }

    return results;
  }

  resolveFinding(findingId, resolution) {
    const finding = this.findings.find(f => f.id === findingId);
    if (!finding) throw new Error('Finding not found');

    finding.resolve(resolution);
    return finding;
  }

  reportViolation(violationConfig) {
    const violation = new PolicyViolation(violationConfig);
    const employeeViolations = this.violations.get(violation.employeeId) || [];
    employeeViolations.push(violation);
    this.violations.set(violation.employeeId, employeeViolations);
    return violation;
  }

  getViolations(employeeId = null, status = null) {
    if (employeeId) {
      let violations = this.violations.get(employeeId) || [];
      if (status) {
        violations = violations.filter(v => v.status === status);
      }
      return violations;
    }

    let allViolations = [];
    this.violations.forEach(v => allViolations.push(...v));

    if (status) {
      allViolations = allViolations.filter(v => v.status === status);
    }

    return allViolations;
  }

  resolveViolation(violationId, employeeId, action) {
    const violations = this.violations.get(employeeId) || [];
    const violation = violations.find(v => v.id === violationId);

    if (!violation) throw new Error('Violation not found');

    violation.status = 'resolved';
    violation.action = action;
    violation.resolvedAt = new Date();

    return violation;
  }

  getComplianceScore(departmentId = null) {
    const allRequirements = Array.from(this.requirements.values());
    const activeRequirements = allRequirements.filter(r => r.isActive());

    // Count resolved findings
    const resolvedFindings = this.findings.filter(f => f.status === 'resolved');
    const openFindings = this.findings.filter(f => f.status !== 'resolved');

    const criticalOpen = openFindings.filter(f => f.severity === 'critical').length;
    const highOpen = openFindings.filter(f => f.severity === 'high').length;

    // Calculate score
    let score = 100;

    // Deduct for open findings
    score -= (criticalOpen * 25);
    score -= (highOpen * 10);
    score -= (openFindings.filter(f => f.severity === 'medium').length * 3);
    score -= (openFindings.filter(f => f.severity === 'low').length * 1);

    return Math.max(0, Math.min(100, score));
  }

  getComplianceReport() {
    const activeRequirements = this.listRequirements(null, null, true);
    const categories = [...new Set(activeRequirements.map(r => r.category))];

    const categoryBreakdown = {};
    categories.forEach(cat => {
      const reqs = activeRequirements.filter(r => r.category === cat);
      categoryBreakdown[cat] = {
        total: reqs.length,
        critical: reqs.filter(r => r.severity === 'critical').length,
        high: reqs.filter(r => r.severity === 'high').length,
        medium: reqs.filter(r => r.severity === 'medium').length,
        low: reqs.filter(r => r.severity === 'low').length
      };
    });

    return {
      overallScore: this.getComplianceScore(),
      totalRequirements: activeRequirements.length,
      categories: categoryBreakdown,
      openFindings: this.getFindings('open').length,
      resolvedFindings: this.getFindings('resolved').length,
      totalViolations: this.getViolations().length,
      pendingAudits: Array.from(this.audits.values()).filter(a => a.status === 'in_progress').length,
      completedAudits: Array.from(this.audits.values()).filter(a => a.status === 'completed').length
    };
  }

  scheduleAudit(auditConfig) {
    return this.createAudit({
      ...auditConfig,
      status: 'planned'
    });
  }

  getUpcomingAudits() {
    return Array.from(this.audits.values())
      .filter(a => a.status === 'planned')
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }
}

// Demo function
function runDemo() {
  console.log('=== Agent HR Compliance Demo\n');

  const manager = new HRComplianceManager();

  // 1. List requirements by category
  console.log('1. Compliance Requirements by Category:');
  const categories = ['labor_law', 'safety', 'data_privacy', 'employment', 'benefits'];
  categories.forEach(cat => {
    const reqs = manager.listRequirements(cat);
    console.log(`   ${cat}: ${reqs.length} requirements`);
    reqs.slice(2).forEach(r => {
      console.log(`      - ${r.toString()}`);
    });
  });

  // 2. Create compliance audit
  console.log('\n2. Creating Compliance Audit:');
  const audit = manager.createAudit({
    name: 'Q1 2026 Compliance Audit',
    description: 'Quarterly compliance review',
    auditType: 'internal',
    startDate: '2026-03-01',
    endDate: '2026-03-15',
    scope: ['CR-001', 'CR-002', 'CR-003', 'CR-004', 'CR-005'],
    departments: ['hr', 'operations', 'finance']
  });
  console.log(`   Created: ${audit.name}`);
  console.log(`   ID: ${audit.id}`);
  console.log(`   Scope: ${audit.scope.length} requirements`);

  // 3. Run audit
  console.log('\n3. Running Compliance Audit:');
  const { audit: completedAudit, findings } = manager.runAudit(audit.id);
  console.log(`   Status: ${completedAudit.status}`);
  console.log(`   Score: ${completedAudit.score}`);
  console.log(`   Findings: ${findings.length}`);

  // 4. Display findings
  if (findings.length > 0) {
    console.log('\n4. Audit Findings:');
    findings.forEach(f => {
      console.log(`   [${f.severity.toUpperCase()}] ${f.requirementName}`);
      console.log(`      ${f.description}`);
      console.log(`      Recommendation: ${f.recommendation}`);
    });
  }

  // 5. Report policy violation
  console.log('\n5. Reporting Policy Violation:');
  const violation = manager.reportViolation({
    employeeId: 'emp-042',
    policyId: 'POL-001',
    policyName: 'Code of Conduct',
    description: 'Unauthorized access to confidential files',
    severity: 'high',
    reportedBy: 'supervisor-001'
  });
  console.log(`   Violation ID: ${violation.id}`);
  console.log(`   Employee: ${violation.employeeId}`);
  console.log(`   Policy: ${violation.policyName}`);
  console.log(`   Severity: ${violation.severity}`);

  // 6. Resolve violation
  console.log('\n6. Resolving Violation:');
  const resolved = manager.resolveViolation(violation.id, violation.employeeId, 'Written warning issued');
  console.log(`   Status: ${resolved.status}`);
  console.log(`   Action: ${resolved.action}`);

  // 7. Get compliance report
  console.log('\n7. Compliance Report:');
  const report = manager.getComplianceReport();
  console.log(`   Overall Score: ${report.overallScore}/100`);
  console.log(`   Total Requirements: ${report.totalRequirements}`);
  console.log(`   Open Findings: ${report.openFindings}`);
  console.log(`   Resolved Findings: ${report.resolvedFindings}`);
  console.log(`   Category Breakdown:`);
  Object.entries(report.categories).forEach(([cat, data]) => {
    console.log(`      ${cat}: ${data.total} (${data.critical} critical, ${data.high} high)`);
  });

  // 8. List critical requirements
  console.log('\n8. Critical Requirements:');
  const critical = manager.listRequirements().filter(r => r.severity === 'critical');
  critical.forEach(r => {
    console.log(`   ${r.name} (${r.jurisdiction})`);
    console.log(`      Laws: ${r.associatedLaws.join(', ')}`);
  });

  // 9. Violation statistics
  console.log('\n9. Violation Statistics:');
  const allViolations = manager.getViolations();
  console.log(`   Total: ${allViolations.length}`);
  console.log(`   Resolved: ${allViolations.filter(v => v.status === 'resolved').length}`);
  console.log(`   Pending: ${allViolations.filter(v => v.status !== 'resolved').length}`);

  // 10. Upcoming audits
  console.log('\n10. Scheduling Additional Audits:');
  const safetyAudit = manager.scheduleAudit({
    name: 'Annual Safety Compliance Audit',
    auditType: 'regulatory',
    startDate: '2026-06-01',
    endDate: '2026-06-30',
    scope: ['CR-003', 'CR-008'],
    departments: ['operations', 'warehouse']
  });
  console.log(`   Scheduled: ${safetyAudit.name}`);
  console.log(`   Type: ${safetyAudit.auditType}`);

  const upcoming = manager.getUpcomingAudits();
  console.log(`   Upcoming Audits: ${upcoming.length}`);

  console.log('\n=== Demo Complete ===');
}

// CLI handler
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const manager = new HRComplianceManager();

switch (command) {
  case 'demo':
    runDemo();
    break;

  case 'list':
    const category = args[1] || null;
    console.log(`Compliance Requirements${category ? ` (${category})` : ''}:`);
    manager.listRequirements(category).forEach(req => {
      console.log(`  [${req.severity.toUpperCase()}] ${req.name} - ${req.category}`);
    });
    break;

  case 'audit':
    console.log('Running Compliance Audit...');
    const audit = manager.createAudit({
      name: 'Quick Compliance Audit',
      auditType: 'self',
      scope: manager.listRequirements().map(r => r.id).slice(0, 5)
    });
    const { audit: completed, findings } = manager.runAudit(audit.id);
    console.log(`Score: ${completed.score}/100`);
    console.log(`Findings: ${findings.length}`);
    break;

  default:
    console.log('Usage: node agent-hr-compliance.js [command]');
    console.log('Commands:');
    console.log('  demo   - Run demonstration');
    console.log('  list   - List compliance requirements');
    console.log('  audit  - Run compliance audit');
}
