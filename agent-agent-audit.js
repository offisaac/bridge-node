/**
 * Agent Audit - Security Audit Agent
 *
 * Performs security audits, compliance checks, and vulnerability assessments.
 *
 * Usage: node agent-agent-audit.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   audits     - List audit reports
 *   findings   - List security findings
 */

class SecurityFinding {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.title = config.title;
    this.severity = config.severity; // critical, high, medium, low, info
    this.category = config.category; // authentication, authorization, encryption, compliance
    this.description = config.description;
    this.resource = config.resource;
    this.remediation = config.remediation;
    this.status = config.status || 'open'; // open, in_progress, resolved, false_positive
    this.detectedAt = config.detectedAt || new Date().toISOString();
  }
}

class AuditReport {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type; // security, compliance, vulnerability, access
    this.status = config.status || 'completed'; // in_progress, completed, failed
    this.findings = config.findings || [];
    this.score = config.score || 0;
    this.startedAt = config.startedAt || new Date().toISOString();
    this.completedAt = config.completedAt || null;
  }
}

class SecurityAudit {
  constructor() {
    this.reports = new Map();
    this.findings = new Map();
    this.standards = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample compliance standards
    const standards = [
      { name: 'SOC2', description: 'Service Organization Control 2', controls: 90 },
      { name: 'PCI-DSS', description: 'Payment Card Industry Data Security Standard', controls: 300 },
      { name: 'GDPR', description: 'General Data Protection Regulation', controls: 99 },
      { name: 'HIPAA', description: 'Health Insurance Portability and Accountability Act', controls: 54 },
      { name: 'ISO27001', description: 'Information Security Management', controls: 114 }
    ];

    standards.forEach(s => {
      this.standards.set(s.name, s);
    });

    // Sample findings
    const findings = [
      { title: 'Weak Password Policy', severity: 'high', category: 'authentication', description: 'Password policy allows weak passwords with minimum length of 6', resource: 'user-service', remediation: 'Enforce minimum 12 character passwords with complexity requirements', status: 'open' },
      { title: 'Missing MFA', severity: 'critical', category: 'authentication', description: 'Administrative accounts do not require multi-factor authentication', resource: 'admin-portal', remediation: 'Enable MFA for all administrative accounts', status: 'open' },
      { title: 'Unencrypted Data at Rest', severity: 'high', category: 'encryption', description: 'Database encryption at rest is disabled', resource: 'postgres-main', remediation: 'Enable encryption at rest for database storage', status: 'in_progress' },
      { title: 'Insufficient TLS Version', severity: 'medium', category: 'encryption', description: 'TLS 1.0 and 1.1 are still supported', resource: 'api-gateway', remediation: 'Disable TLS versions below 1.2', status: 'resolved' },
      { title: 'Overprivileged Service Account', severity: 'high', category: 'authorization', description: 'Service account has excessive permissions', resource: 'worker-service', remediation: 'Apply principle of least privilege', status: 'open' },
      { title: 'Missing Security Headers', severity: 'low', category: 'compliance', description: 'X-Frame-Options header is missing', resource: 'web-frontend', remediation: 'Add security headers to HTTP responses', status: 'resolved' },
      { title: 'Open SSH Port', severity: 'critical', category: 'access', description: 'SSH port 22 is exposed to public internet', resource: 'bastion-host', remediation: 'Restrict SSH access to VPN or jump host', status: 'open' },
      { title: 'Outdated Dependencies', severity: 'medium', category: 'vulnerability', description: 'Several packages have known vulnerabilities', resource: 'frontend-app', remediation: 'Update npm dependencies to latest versions', status: 'in_progress' },
      { title: 'Missing Backup Encryption', severity: 'high', category: 'encryption', description: 'Database backups are not encrypted', resource: 'backup-service', remediation: 'Enable encryption for backup files', status: 'open' },
      { title: 'Inadequate Logging', severity: 'medium', category: 'compliance', description: 'Audit logs do not capture all required events', resource: 'api-gateway', remediation: 'Implement comprehensive audit logging', status: 'open' }
    ];

    findings.forEach(f => {
      const finding = new SecurityFinding(f);
      this.findings.set(finding.id, finding);
    });

    // Sample audit reports
    const reports = [
      { name: 'Q1 2026 Security Audit', type: 'security', status: 'completed', findings: 5, score: 78, completedAt: '2026-01-31T23:59:59Z' },
      { name: 'SOC2 Compliance Audit', type: 'compliance', status: 'completed', findings: 3, score: 92, completedAt: '2026-02-10T23:59:59Z' },
      { name: 'February Vulnerability Scan', type: 'vulnerability', status: 'completed', findings: 2, score: 85, completedAt: '2026-02-15T23:59:59Z' },
      { name: 'Access Control Review', type: 'access', status: 'completed', findings: 1, score: 95, completedAt: '2026-02-17T23:59:59Z' }
    ];

    reports.forEach(r => {
      const report = new AuditReport(r);
      this.reports.set(report.id, report);
    });
  }

  // Run audit
  runAudit(name, type) {
    const report = new AuditReport({
      name,
      type,
      status: 'in_progress',
      startedAt: new Date().toISOString()
    });

    // Simulate audit by collecting relevant findings
    const relevantFindings = Array.from(this.findings.values())
      .filter(f => this._matchesType(f, type))
      .slice(0, Math.floor(Math.random() * 5) + 1);

    report.findings = relevantFindings.map(f => f.id);
    report.score = this._calculateScore(relevantFindings);
    report.status = 'completed';
    report.completedAt = new Date().toISOString();

    this.reports.set(report.id, report);
    return report;
  }

  // Get findings
  getFindings(filter = {}) {
    let findings = Array.from(this.findings.values());

    if (filter.severity) {
      findings = findings.filter(f => f.severity === filter.severity);
    }
    if (filter.category) {
      findings = findings.filter(f => f.category === filter.category);
    }
    if (filter.status) {
      findings = findings.filter(f => f.status === filter.status);
    }

    return findings;
  }

  // Get reports
  getReports(filter = {}) {
    let reports = Array.from(this.reports.values());

    if (filter.type) {
      reports = reports.filter(r => r.type === filter.type);
    }
    if (filter.status) {
      reports = reports.filter(r => r.status === filter.status);
    }

    return reports;
  }

  // Update finding status
  updateFindingStatus(findingId, status) {
    const finding = this.findings.get(findingId);
    if (!finding) {
      throw new Error(`Finding ${findingId} not found`);
    }
    finding.status = status;
    return finding;
  }

  // Get compliance status
  getComplianceStatus(standard) {
    const std = this.standards.get(standard);
    if (!std) {
      return null;
    }

    const complianceFindings = this.getFindings({ category: 'compliance' });
    const totalControls = std.controls;
    const passedControls = totalControls - complianceFindings.length;
    const score = Math.round((passedControls / totalControls) * 100);

    return {
      standard: std.name,
      description: std.description,
      totalControls,
      passedControls,
      failedControls: complianceFindings.length,
      score,
      status: score >= 80 ? 'compliant' : score >= 60 ? 'partial' : 'non-compliant'
    };
  }

  // Get statistics
  getStats() {
    const findings = Array.from(this.findings.values());
    const reports = Array.from(this.reports.values());

    return {
      totalFindings: findings.length,
      openFindings: findings.filter(f => f.status === 'open').length,
      resolvedFindings: findings.filter(f => f.status === 'resolved').length,
      bySeverity: {
        critical: findings.filter(f => f.severity === 'critical').length,
        high: findings.filter(f => f.severity === 'high').length,
        medium: findings.filter(f => f.severity === 'medium').length,
        low: findings.filter(f => f.severity === 'low').length
      },
      byCategory: {
        authentication: findings.filter(f => f.category === 'authentication').length,
        authorization: findings.filter(f => f.category === 'authorization').length,
        encryption: findings.filter(f => f.category === 'encryption').length,
        compliance: findings.filter(f => f.category === 'compliance').length
      },
      totalReports: reports.length,
      avgScore: reports.length > 0 ? Math.round(reports.reduce((sum, r) => sum + r.score, 0) / reports.length) : 0
    };
  }

  // Helper methods
  _matchesType(finding, type) {
    const mapping = {
      security: ['authentication', 'authorization', 'encryption'],
      compliance: ['compliance'],
      vulnerability: ['vulnerability'],
      access: ['access']
    };
    return mapping[type]?.includes(finding.category) || false;
  }

  _calculateScore(findings) {
    const weights = { critical: 20, high: 15, medium: 10, low: 5, info: 2 };
    const deductions = findings.reduce((sum, f) => sum + (weights[f.severity] || 0), 0);
    return Math.max(0, 100 - deductions);
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const audit = new SecurityAudit();

switch (command) {
  case 'demo':
    console.log('=== Agent Audit Demo\n');

    // 1. List findings
    console.log('1. Security Findings:');
    const findings = audit.getFindings();
    console.log(`   Total: ${findings.length}`);
    findings.forEach(f => {
      console.log(`   - ${f.title}: [${f.severity}] ${f.category}`);
    });

    // 2. Findings by severity
    console.log('\n2. Findings by Severity:');
    const stats = audit.getStats();
    console.log(`   Critical: ${stats.bySeverity.critical}`);
    console.log(`   High: ${stats.bySeverity.high}`);
    console.log(`   Medium: ${stats.bySeverity.medium}`);
    console.log(`   Low: ${stats.bySeverity.low}`);

    // 3. Findings by category
    console.log('\n3. Findings by Category:');
    Object.entries(stats.byCategory).forEach(([cat, count]) => {
      console.log(`   ${cat}: ${count}`);
    });

    // 4. Open findings
    console.log('\n4. Open Findings:');
    const openFindings = audit.getFindings({ status: 'open' });
    console.log(`   Total: ${openFindings.length}`);
    openFindings.slice(0, 3).forEach(f => {
      console.log(`   - ${f.title}: ${f.remediation.substring(0, 50)}...`);
    });

    // 5. Run new audit
    console.log('\n5. Run Security Audit:');
    const newAudit = audit.runAudit('March 2026 Security Audit', 'security');
    console.log(`   Audit: ${newAudit.name}`);
    console.log(`   Status: ${newAudit.status}`);
    console.log(`   Findings: ${newAudit.findings.length}`);
    console.log(`   Score: ${newAudit.score}/100`);

    // 6. Audit reports
    console.log('\n6. Audit Reports:');
    const reports = audit.getReports();
    reports.forEach(r => {
      console.log(`   - ${r.name}: score=${r.score} findings=${r.findings.length}`);
    });

    // 7. Compliance status
    console.log('\n7. Compliance Status:');
    const soc2 = audit.getComplianceStatus('SOC2');
    console.log(`   SOC2: ${soc2.score}% (${soc2.status})`);
    const pci = audit.getComplianceStatus('PCI-DSS');
    console.log(`   PCI-DSS: ${pci.score}% (${pci.status})`);

    // 8. Update finding status
    console.log('\n8. Update Finding Status:');
    const firstFinding = findings[0];
    const updated = audit.updateFindingStatus(firstFinding.id, 'resolved');
    console.log(`   Updated: ${updated.title} -> ${updated.status}`);

    // 9. Critical findings
    console.log('\n9. Critical Findings:');
    const critical = audit.getFindings({ severity: 'critical' });
    critical.forEach(f => {
      console.log(`   - ${f.title} (${f.resource})`);
      console.log(`     ${f.remediation}`);
    });

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const finalStats = audit.getStats();
    console.log(`    Total findings: ${finalStats.totalFindings}`);
    console.log(`    Open: ${finalStats.openFindings}, Resolved: ${finalStats.resolvedFindings}`);
    console.log(`    Avg audit score: ${finalStats.avgScore}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'audits':
    console.log('Audit Reports:');
    audit.getReports().forEach(r => {
      console.log(`  ${r.name}: ${r.type} - score ${r.score}`);
    });
    break;

  case 'findings':
    console.log('Security Findings:');
    audit.getFindings().forEach(f => {
      console.log(`  [${f.severity}] ${f.title}: ${f.status}`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-agent-audit.js [demo|audits|findings]');
}
