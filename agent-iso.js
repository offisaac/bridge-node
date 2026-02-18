/**
 * Agent ISO - ISO Standards Compliance Agent
 *
 * Provides ISO standards compliance and certification support.
 *
 * Usage: node agent-iso.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   assess     - Assess ISO compliance
 *   standards  - List ISO standards
 */

class ISOStandard {
  constructor(config) {
    this.id = `iso-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.standard = config.standard;
    this.title = config.title;
    this.version = config.version || '2020';
    this.clauses = config.clauses || [];
    this.status = config.status || 'not-started';
  }
}

class CertificationAudit {
  constructor(config) {
    this.id = `cert-audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.standard = config.standard;
    this.stage = config.stage; // stage1, stage2, surveillance
    this.date = config.date || Date.now();
    this.findings = config.findings || [];
    this.result = config.result || 'pending';
  }
}

class NonConformance {
  constructor(config) {
    this.id = `ncr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.standard = config.standard;
    this.clause = config.clause;
    this.description = config.description;
    this.type = config.type; // major, minor, observation
    this.status = config.status || 'open';
  }
}

class CorrectiveAction {
  constructor(config) {
    this.id = `ca-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.ncrId = config.ncrId;
    this.action = config.action;
    this.responsible = config.responsible;
    this.dueDate = config.dueDate;
    this.status = config.status || 'pending';
  }
}

class ISOAgent {
  constructor(config = {}) {
    this.name = config.name || 'ISOAgent';
    this.version = config.version || '1.0';
    this.standards = new Map();
    this.audits = new Map();
    this.ncrs = new Map();
    this.actions = new Map();
    this.stats = {
      certificationsAchieved: 0,
      auditsConducted: 0,
      ncrsResolved: 0
    };
    this.initStandards();
  }

  initStandards() {
    const standards = [
      new ISOStandard({
        standard: 'ISO 27001',
        title: 'Information Security Management',
        clauses: ['Context of the organization', 'Leadership', 'Planning', 'Support', 'Operation', 'Performance evaluation', 'Improvement']
      }),
      new ISOStandard({
        standard: 'ISO 9001',
        title: 'Quality Management',
        clauses: ['Context of the organization', 'Leadership', 'Planning', 'Support', 'Operation', 'Performance evaluation', 'Improvement']
      }),
      new ISOStandard({
        standard: 'ISO 14001',
        title: 'Environmental Management',
        clauses: ['Context', 'Leadership', 'Planning', 'Support', 'Operation', 'Performance evaluation', 'Improvement']
      }),
      new ISOStandard({
        standard: 'ISO 22301',
        title: 'Business Continuity',
        clauses: ['Context', 'Leadership', 'Planning', 'Support', 'Operation', 'Performance evaluation', 'Improvement']
      }),
      new ISOStandard({
        standard: 'ISO 27701',
        title: 'Privacy Information Management',
        clauses: ['General', 'PIMS-specific', 'Mapping to ISO 27001', 'Mapping to GDPR']
      })
    ];
    standards.forEach(s => this.standards.set(s.standard, s));
  }

  scheduleAudit(standard, stage) {
    const audit = new CertificationAudit({ standard, stage, result: 'passed' });
    this.audits.set(audit.id, audit);
    this.stats.auditsConducted++;
    return audit;
  }

  raiseNCR(standard, clause, description, type) {
    const ncr = new NonConformance({ standard, clause, description, type });
    this.ncrs.set(ncr.id, ncr);
    return ncr;
  }

  closeNCR(ncrId, action, responsible, dueDate) {
    const ncr = this.ncrs.get(ncrId);
    if (!ncr) return null;

    const correctiveAction = new CorrectiveAction({
      ncrId,
      action,
      responsible,
      dueDate,
      status: 'completed'
    });
    this.actions.set(correctiveAction.id, correctiveAction);

    ncr.status = 'closed';
    this.stats.ncrsResolved++;

    return { ncr, correctiveAction };
  }

  achieveCertification(standard) {
    const std = this.standards.get(standard);
    if (std) {
      std.status = 'certified';
      this.stats.certificationsAchieved++;
    }
    return std;
  }

  assessCompliance(standard) {
    const std = this.standards.get(standard);
    if (!std) return null;

    const ncrs = Array.from(this.ncrs.values()).filter(n => n.standard === standard);
    const openNCRs = ncrs.filter(n => n.status === 'open');
    const score = Math.max(0, 100 - (openNCRs.length * 10));

    return {
      standard: std.standard,
      title: std.title,
      status: std.status,
      clauses: std.clauses.length,
      openNCRs: openNCRs.length,
      score
    };
  }

  listStandards() {
    return Array.from(this.standards.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const iso = new ISOAgent();

switch (command) {
  case 'demo': {
    console.log('=== Agent ISO Demo\n');

    // 1. ISO Standards
    console.log('1. ISO Standards:');
    const standards = iso.listStandards();
    console.log(`   Total: ${standards.length} standards`);
    standards.slice(0, 3).forEach(s => {
      console.log(`   - ${s.standard}: ${s.title}`);
      console.log(`     Clauses: ${s.clauses.length}`);
      console.log(`     Status: ${s.status}`);
    });

    // 2. Certification Audits
    console.log('\n2. Certification Audits:');
    const audit1 = iso.scheduleAudit('ISO 27001', 'stage2');
    const audit2 = iso.scheduleAudit('ISO 9001', 'surveillance');
    console.log(`   Audit 1: ${audit1.standard} - ${audit1.stage}`);
    console.log(`   Result: ${audit1.result}`);
    console.log(`   Audit 2: ${audit2.standard} - ${audit2.stage}`);
    console.log(`   Result: ${audit2.result}`);

    // 3. Non-Conformances
    console.log('\n3. Non-Conformances:');
    const ncr1 = iso.raiseNCR('ISO 27001', 'A.9.2.3', 'Weak password policy', 'minor');
    const ncr2 = iso.raiseNCR('ISO 27001', 'A.12.4', 'Missing audit logs', 'major');
    console.log(`   NCR 1: ${ncr1.description}`);
    console.log(`   Type: ${ncr1.type}, Status: ${ncr1.status}`);
    console.log(`   NCR 2: ${ncr2.description}`);
    console.log(`   Type: ${ncr2.type}, Status: ${ncr2.status}`);

    // 4. Corrective Actions
    console.log('\n4. Corrective Actions:');
    const closed = iso.closeNCR(ncr1.id, 'Implement strong password policy', 'IT Security', Date.now() + 7 * 24 * 60 * 60 * 1000);
    console.log(`   NCR: ${closed.ncr.description}`);
    console.log(`   Action: ${closed.correctiveAction.action}`);
    console.log(`   Status: ${closed.correctiveAction.status}`);

    // 5. Compliance Assessment
    console.log('\n5. Compliance Assessment:');
    const assessment = iso.assessCompliance('ISO 27001');
    console.log(`   Standard: ${assessment.standard}`);
    console.log(`   Title: ${assessment.title}`);
    console.log(`   Clauses: ${assessment.clauses}`);
    console.log(`   Open NCRs: ${assessment.openNCRs}`);
    console.log(`   Score: ${assessment.score}%`);

    // 6. Certification
    console.log('\n6. Certification:');
    const cert = iso.achieveCertification('ISO 27001');
    console.log(`   Standard: ${cert.standard}`);
    console.log(`   Status: ${cert.status}`);

    // 7. Statistics
    console.log('\n7. Statistics:');
    const stats = iso.getStats();
    console.log(`   Certifications achieved: ${stats.certificationsAchieved}`);
    console.log(`   Audits conducted: ${stats.auditsConducted}`);
    console.log(`   NCRs resolved: ${stats.ncrsResolved}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'assess': {
    const standard = args[1] || 'ISO 27001';
    const result = iso.assessCompliance(standard);
    if (result) {
      console.log(`${result.standard} - ${result.title}`);
      console.log(`Status: ${result.status}`);
      console.log(`Score: ${result.score}%`);
      console.log(`Open NCRs: ${result.openNCRs}`);
    }
    break;
  }

  case 'standards': {
    console.log('ISO Standards:');
    iso.listStandards().forEach(s => {
      console.log(`  ${s.standard}: ${s.title} [${s.status}]`);
    });
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-iso.js [demo|assess|standards]');
  }
}
