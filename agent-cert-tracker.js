/**
 * Agent Cert Tracker - Certification Tracking Module
 *
 * Manages professional certifications, compliance tracking, expiration alerts,
 * and renewal workflows for employees.
 *
 * Usage: node agent-cert-tracker.js [command]
 * Commands:
 *   demo     - Run demonstration
 *   list     - List certifications
 *   expires  - Show expiring certifications
 */

class Certification {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.provider = config.provider;
    this.description = config.description || '';
    this.category = config.category; // technical, compliance, professional, industry
    this.validityPeriod = config.validityPeriod; // days
    this.requirements = config.requirements || [];
    this.continuingEducation = config.continuingEducation || false;
    this.ceuRequired = config.ceuRequired || 0; // Continuing Education Units
    this.isActive = config.isActive !== false;
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
  }

  isExpired(issuedAt) {
    const expiryDate = new Date(issuedAt);
    expiryDate.setDate(expiryDate.getDate() + this.validityPeriod);
    return new Date() > expiryDate;
  }

  getExpiryDate(issuedAt) {
    const expiryDate = new Date(issuedAt);
    expiryDate.setDate(expiryDate.getDate() + this.validityPeriod);
    return expiryDate;
  }

  daysUntilExpiry(issuedAt) {
    const expiryDate = this.getExpiryDate(issuedAt);
    const now = new Date();
    const diff = expiryDate - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }
}

class EmployeeCert {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.certId = config.certId;
    this.certName = config.certName;
    this.issuedDate = config.issuedDate ? new Date(config.issuedDate) : new Date();
    this.expiryDate = config.expiryDate ? new Date(config.expiryDate) : null;
    this.status = config.status || 'active'; // active, expiring_soon, expired, pending, revoked
    this.credentialId = config.credentialId || '';
    this.credentialUrl = config.credentialUrl || '';
    this.ceuEarned = config.ceuEarned || 0;
    this.renewalStatus = config.renewalStatus || 'not_started'; // not_started, in_progress, submitted, approved
    this.renewedCertId = config.renewedCertId || null;
    this.documents = config.documents || [];
    this.verifiedAt = config.verifiedAt ? new Date(config.verifiedAt) : null;
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
  }

  updateStatus() {
    if (!this.expiryDate) {
      this.status = 'pending';
      return;
    }

    const now = new Date();
    const daysUntil = Math.ceil((this.expiryDate - now) / (1000 * 60 * 60 * 24));

    if (daysUntil < 0) {
      this.status = 'expired';
    } else if (daysUntil <= 30) {
      this.status = 'expiring_soon';
    } else {
      this.status = 'active';
    }
  }

  renew(newCredentialId, newExpiryDate) {
    this.renewalStatus = 'approved';
    this.renewedCertId = newCredentialId;
    this.credentialId = newCredentialId;
    this.expiryDate = newExpiryDate;
    this.status = 'active';
  }
}

class RenewalAlert {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeCertId = config.employeeCertId;
    this.employeeId = config.employeeId;
    this.certName = config.certName;
    this.alertType = config.alertType; // expiring_30, expiring_60, expiring_90, expired
    this.alertDate = config.alertDate ? new Date(config.alertDate) : new Date();
    this.message = config.message || '';
    this.isRead = config.isRead || false;
    this.actionRequired = config.actionRequired || false;
  }
}

class CertTrackerManager {
  constructor() {
    this.certifications = new Map();
    this.employeeCerts = new Map();
    this.alerts = new Map();
    this.employees = new Map();

    this._initializeDefaultCertifications();
    this._initializeSampleEmployees();
    this._initializeSampleEmployeeCerts();
  }

  _initializeDefaultCertifications() {
    const defaultCerts = [
      // Technical
      { category: 'technical', name: 'AWS Solutions Architect', provider: 'Amazon Web Services', validityPeriod: 1095, description: 'AWS professional certification', continuingEducation: true, ceuRequired: 30 },
      { category: 'technical', name: 'AWS Developer Associate', provider: 'Amazon Web Services', validityPeriod: 1095, description: 'AWS developer certification', continuingEducation: true, ceuRequired: 30 },
      { category: 'technical', name: 'Google Cloud Professional', provider: 'Google', validityPeriod: 730, description: 'GCP professional certification', continuingEducation: true, ceuRequired: 20 },
      { category: 'technical', name: 'Kubernetes Administrator', provider: 'CNCF', validityPeriod: 730, description: 'CKA certification', continuingEducation: true, ceuRequired: 24 },
      { category: 'technical', name: 'PMP', provider: 'PMI', validityPeriod: 1095, description: 'Project Management Professional', continuingEducation: true, ceuRequired: 60 },
      { category: 'technical', name: 'Scrum Master', provider: 'Scrum Alliance', validityPeriod: 730, description: 'CSM certification', continuingEducation: true, ceuRequired: 20 },

      // Compliance
      { category: 'compliance', name: 'GDPR Compliance', provider: 'IAPP', validityPeriod: 365, description: 'Data protection certification', continuingEducation: true, ceuRequired: 15 },
      { category: 'compliance', name: 'HIPAA Compliance', provider: 'HHS', validityPeriod: 365, description: 'Healthcare data security', continuingEducation: true, ceuRequired: 20 },
      { category: 'compliance', name: 'SOC 2 Type II', provider: 'AICPA', validityPeriod: 365, description: 'Security compliance', continuingEducation: false },

      // Professional
      { category: 'professional', name: 'CPA', provider: 'AICPA', validityPeriod: 1095, description: 'Certified Public Accountant', continuingEducation: true, ceuRequired: 40 },
      { category: 'professional', name: 'PHR', provider: 'HRCI', validityPeriod: 1095, description: 'Professional in HR', continuingEducation: true, ceuRequired: 60 },
      { category: 'professional', name: 'Six Sigma Black Belt', provider: 'ASQ', validityPeriod: 1095, description: 'Lean Six Sigma certification', continuingEducation: false },

      // Industry
      { category: 'industry', name: 'FinTech Certification', provider: 'FSCA', validityPeriod: 730, description: 'Financial technology', continuingEducation: true, ceuRequired: 25 },
      { category: 'industry', name: 'Healthcare IT', provider: 'HIMSS', validityPeriod: 730, description: 'Healthcare information technology', continuingEducation: true, ceuRequired: 20 }
    ];

    defaultCerts.forEach((cert, i) => {
      const certObj = new Certification({ ...cert, id: `cert-${i + 1}` });
      this.certifications.set(certObj.id, certObj);
    });
  }

  _initializeSampleEmployees() {
    const employees = [
      { id: 'EMP001', name: 'Alice Johnson', department: 'Engineering', title: 'Senior Engineer' },
      { id: 'EMP002', name: 'Bob Williams', department: 'Engineering', title: 'Team Lead' },
      { id: 'EMP003', name: 'Carol Davis', department: 'Sales', title: 'Account Executive' },
      { id: 'EMP004', name: 'David Brown', department: 'Engineering', title: 'Engineer' },
      { id: 'EMP005', name: 'Eva Martinez', department: 'HR', title: 'HR Manager' }
    ];
    employees.forEach(e => this.employees.set(e.id, e));
  }

  _initializeSampleEmployeeCerts() {
    const today = new Date();

    // Alice - active AWS cert
    const cert1 = new EmployeeCert({
      employeeId: 'EMP001',
      employeeName: 'Alice Johnson',
      certId: 'cert-1',
      certName: 'AWS Solutions Architect',
      issuedDate: new Date('2024-06-15'),
      status: 'active',
      credentialId: 'AWS-CSA-12345',
      credentialUrl: 'https://aws.com/verify/12345'
    });
    cert1.expiryDate = new Date('2027-06-15');
    this.employeeCerts.set(cert1.id, cert1);

    // Bob - expiring soon Kubernetes cert
    const cert2 = new EmployeeCert({
      employeeId: 'EMP002',
      employeeName: 'Bob Williams',
      certId: 'cert-4',
      certName: 'Kubernetes Administrator',
      issuedDate: new Date('2024-08-01'),
      status: 'expiring_soon',
      credentialId: 'CKA-67890',
      credentialUrl: 'https://verify.cncf.io/67890'
    });
    cert2.expiryDate = new Date('2026-03-01'); // Expires in ~12 days
    this.employeeCerts.set(cert2.id, cert2);

    // Bob - active PMP
    const cert3 = new EmployeeCert({
      employeeId: 'EMP002',
      employeeName: 'Bob Williams',
      certId: 'cert-5',
      certName: 'PMP',
      issuedDate: new Date('2025-01-15'),
      status: 'active',
      credentialId: 'PMP-456789',
      credentialUrl: 'https://pmi.org/verify/456789'
    });
    cert3.expiryDate = new Date('2028-01-15');
    this.employeeCerts.set(cert3.id, cert3);

    // Carol - expired GDPR
    const cert4 = new EmployeeCert({
      employeeId: 'EMP003',
      employeeName: 'Carol Davis',
      certId: 'cert-7',
      certName: 'GDPR Compliance',
      issuedDate: new Date('2024-01-01'),
      status: 'expired',
      credentialId: 'GDPR-11111',
      credentialUrl: ''
    });
    cert4.expiryDate = new Date('2025-01-01');
    this.employeeCerts.set(cert4.id, cert4);

    // David - active Scrum Master
    const cert5 = new EmployeeCert({
      employeeId: 'EMP004',
      employeeName: 'David Brown',
      certId: 'cert-6',
      certName: 'Scrum Master',
      issuedDate: new Date('2025-06-01'),
      status: 'active',
      credentialId: 'CSM-22222',
      credentialUrl: 'https://scrumalliance.org/verify/22222'
    });
    cert5.expiryDate = new Date('2027-06-01');
    this.employeeCerts.set(cert5.id, cert5);

    // Eva - active PHR
    const cert6 = new EmployeeCert({
      employeeId: 'EMP005',
      employeeName: 'Eva Martinez',
      certId: 'cert-11',
      certName: 'PHR',
      issuedDate: new Date('2024-09-01'),
      status: 'active',
      credentialId: 'PHR-33333',
      credentialUrl: 'https://hrci.org/verify/33333'
    });
    cert6.expiryDate = new Date('2027-09-01');
    this.employeeCerts.set(cert6.id, cert6);
  }

  createCertification(config) {
    const cert = new Certification(config);
    this.certifications.set(cert.id, cert);
    return cert;
  }

  getCertification(certId) {
    return this.certifications.get(certId);
  }

  listCertifications(category = null) {
    let results = Array.from(this.certifications.values());
    if (category) {
      results = results.filter(c => c.category === category);
    }
    return results;
  }

  addEmployeeCert(employeeId, certId, credentialId, issuedDate) {
    const employee = this.employees.get(employeeId);
    if (!employee) throw new Error('Employee not found');

    const cert = this.certifications.get(certId);
    if (!cert) throw new Error('Certification not found');

    const expiryDate = new Date(issuedDate);
    expiryDate.setDate(expiryDate.getDate() + cert.validityPeriod);

    const empCert = new EmployeeCert({
      employeeId,
      employeeName: employee.name,
      certId,
      certName: cert.name,
      issuedDate,
      credentialId,
      expiryDate
    });

    empCert.updateStatus();
    this.employeeCerts.set(empCert.id, empCert);
    return empCert;
  }

  getEmployeeCerts(employeeId = null, status = null) {
    let results = Array.from(this.employeeCerts.values());

    if (employeeId) {
      results = results.filter(ec => ec.employeeId === employeeId);
    }

    if (status) {
      results = results.filter(ec => ec.status === status);
    }

    return results;
  }

  verifyCert(empCertId) {
    const empCert = this.employeeCerts.get(empCertId);
    if (!empCert) throw new Error('Employee certification not found');

    empCert.verifiedAt = new Date();
    empCert.status = 'active';
    return empCert;
  }

  renewCert(empCertId, newCredentialId, newExpiryDate) {
    const empCert = this.employeeCerts.get(empCertId);
    if (!empCert) throw new Error('Employee certification not found');

    empCert.renew(newCredentialId, newExpiryDate);
    return empCert;
  }

  getExpiringCerts(daysThreshold = 30) {
    const now = new Date();
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + daysThreshold);

    return Array.from(this.employeeCerts.values()).filter(ec => {
      if (!ec.expiryDate) return false;
      return ec.expiryDate <= threshold && ec.expiryDate > now;
    }).map(ec => {
      const daysLeft = Math.ceil((ec.expiryDate - now) / (1000 * 60 * 60 * 24));
      return { ...ec, daysLeft };
    });
  }

  getExpiredCerts() {
    return Array.from(this.employeeCerts.values()).filter(ec => {
      if (!ec.expiryDate) return false;
      return new Date() > ec.expiryDate;
    });
  }

  getComplianceStats() {
    const allCerts = Array.from(this.employeeCerts.values());
    const now = new Date();

    const stats = {
      total: allCerts.length,
      active: allCerts.filter(ec => ec.status === 'active').length,
      expiringSoon: allCerts.filter(ec => ec.status === 'expiring_soon').length,
      expired: allCerts.filter(ec => ec.status === 'expired').length,
      pending: allCerts.filter(ec => ec.status === 'pending').length,
      complianceRate: 0
    };

    const compliant = stats.active;
    stats.complianceRate = stats.total > 0
      ? Math.round((compliant / stats.total) * 100)
      : 0;

    return stats;
  }

  getEmployeeCertStats(employeeId) {
    const certs = this.getEmployeeCerts(employeeId);

    return {
      employeeId,
      total: certs.length,
      active: certs.filter(c => c.status === 'active').length,
      expiringSoon: certs.filter(c => c.status === 'expiring_soon').length,
      expired: certs.filter(c => c.status === 'expired').length,
      validCerts: certs.filter(c => c.status === 'active' || c.status === 'expiring_soon').length
    };
  }

  generateAlerts() {
    const now = new Date();
    const alerts = [];

    this.employeeCerts.forEach(ec => {
      if (!ec.expiryDate) return;

      const daysUntil = Math.ceil((ec.expiryDate - now) / (1000 * 60 * 60 * 24));

      if (daysUntil < 0) {
        alerts.push(new RenewalAlert({
          employeeCertId: ec.id,
          employeeId: ec.employeeId,
          certName: ec.certName,
          alertType: 'expired',
          message: `${ec.certName} has expired! Immediate renewal required.`,
          actionRequired: true
        }));
      } else if (daysUntil <= 30) {
        alerts.push(new RenewalAlert({
          employeeCertId: ec.id,
          employeeId: ec.employeeId,
          certName: ec.certName,
          alertType: 'expiring_30',
          message: `${ec.certName} expires in ${daysUntil} days.`,
          actionRequired: true
        }));
      } else if (daysUntil <= 60) {
        alerts.push(new RenewalAlert({
          employeeCertId: ec.id,
          employeeId: ec.employeeId,
          certName: ec.certName,
          alertType: 'expiring_60',
          message: `${ec.certName} expires in ${daysUntil} days. Start renewal process.`
        }));
      } else if (daysUntil <= 90) {
        alerts.push(new RenewalAlert({
          employeeCertId: ec.id,
          employeeId: ec.employeeId,
          certName: ec.certName,
          alertType: 'expiring_90',
          message: `${ec.certName} expires in ${daysUntil} days.`
        }));
      }
    });

    return alerts;
  }

  getCertificationsByCategory() {
    const categories = {};
    this.certifications.forEach(cert => {
      if (!categories[cert.category]) {
        categories[cert.category] = [];
      }
      categories[cert.category].push(cert);
    });
    return categories;
  }

  getEmployeeList() {
    return Array.from(this.employees.values());
  }
}

// Demo function
function runDemo() {
  console.log('=== Agent Cert Tracker Demo\n');

  const manager = new CertTrackerManager();

  // 1. List employees
  console.log('1. Employees:');
  manager.getEmployeeList().forEach(emp => {
    console.log(`   ${emp.id}: ${emp.name} - ${emp.title} (${emp.department})`);
  });

  // 2. List certifications by category
  console.log('\n2. Certifications by Category:');
  const byCategory = manager.getCertificationsByCategory();
  Object.entries(byCategory).forEach(([category, certs]) => {
    console.log(`   ${category} (${certs.length}):`);
    certs.forEach(cert => {
      console.log(`      - ${cert.name} (${cert.provider}) - ${cert.validityPeriod/365} years`);
    });
  });

  // 3. Employee certifications
  console.log('\n3. Employee Certifications:');
  manager.getEmployeeList().forEach(emp => {
    const stats = manager.getEmployeeCertStats(emp.id);
    console.log(`   ${emp.name}: ${stats.active} active, ${stats.expiringSoon} expiring, ${stats.expired} expired`);
  });

  // 4. Add new certification
  console.log('\n4. Add New Certification:');
  const newCert = manager.addEmployeeCert('EMP003', 'cert-2', 'AWS-DEV-99999', new Date('2026-02-01'));
  console.log(`   Added AWS Developer Associate for Carol Davis`);
  console.log(`   Credential ID: ${newCert.credentialId}`);
  console.log(`   Expires: ${newCert.expiryDate.toISOString().split('T')[0]}`);

  // 5. Compliance statistics
  console.log('\n5. Compliance Statistics:');
  const compliance = manager.getComplianceStats();
  console.log(`   Total Certifications: ${compliance.total}`);
  console.log(`   Active: ${compliance.active}`);
  console.log(`   Expiring Soon: ${compliance.expiringSoon}`);
  console.log(`   Expired: ${compliance.expired}`);
  console.log(`   Compliance Rate: ${compliance.complianceRate}%`);

  // 6. Expiring certifications
  console.log('\n6. Expiring Soon (30 days):');
  const expiring = manager.getExpiringCerts(30);
  expiring.forEach(ec => {
    console.log(`   ${ec.employeeName}: ${ec.certName} - ${ec.daysLeft} days left`);
  });

  // 7. Expired certifications
  console.log('\n7. Expired Certifications:');
  const expired = manager.getExpiredCerts();
  expired.forEach(ec => {
    console.log(`   ${ec.employeeName}: ${ec.certName} - Expired ${Math.abs(Math.ceil((ec.expiryDate - new Date()) / (1000 * 60 * 60 * 24)))} days ago`);
  });

  // 8. Verify certification
  console.log('\n8. Verify Certification:');
  const empCerts = manager.getEmployeeCerts('EMP001');
  if (empCerts.length > 0) {
    const verified = manager.verifyCert(empCerts[0].id);
    console.log(`   Verified: ${verified.certName} for ${verified.employeeName}`);
    console.log(`   Verified at: ${verified.verifiedAt.toISOString()}`);
  }

  // 9. Renewal
  console.log('\n9. Renewal Process:');
  const bobCerts = manager.getEmployeeCerts('EMP002');
  const expiringCert = bobCerts.find(c => c.status === 'expiring_soon');
  if (expiringCert) {
    const newExpiry = new Date();
    newExpiry.setFullYear(newExpiry.getFullYear() + 2);
    manager.renewCert(expiringCert.id, 'CKA-NEW-67890', newExpiry);
    console.log(`   Renewed: ${expiringCert.certName}`);
    console.log(`   New Credential ID: CKA-NEW-67890`);
    console.log(`   New Expiry: ${newExpiry.toISOString().split('T')[0]}`);
  }

  // 10. Generate alerts
  console.log('\n10. Renewal Alerts:');
  const alerts = manager.generateAlerts();
  alerts.forEach(alert => {
    console.log(`   [${alert.alertType}] ${alert.employeeId}: ${alert.message}`);
  });

  console.log('\n=== Demo Complete ===');
}

// CLI handler
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const manager = new CertTrackerManager();

switch (command) {
  case 'demo':
    runDemo();
    break;

  case 'list':
    console.log('Available Certifications:\n');
    const categories = manager.getCertificationsByCategory();
    Object.entries(categories).forEach(([category, certs]) => {
      console.log(`## ${category}`);
      certs.forEach(cert => {
        console.log(`  - ${cert.name} (${cert.provider}): ${cert.validityPeriod/365} years, CEU: ${cert.ceuRequired}`);
      });
      console.log('');
    });
    break;

  case 'expires':
    console.log('Expiring Certifications:\n');
    const expiring = manager.getExpiringCerts(90);
    if (expiring.length === 0) {
      console.log('No certifications expiring in the next 90 days.');
    } else {
      expiring.forEach(ec => {
        console.log(`${ec.employeeName}: ${ec.certName} - ${ec.daysLeft} days`);
      });
    }
    break;

  default:
    console.log('Usage: node agent-cert-tracker.js [command]');
    console.log('Commands:');
    console.log('  demo     - Run demonstration');
    console.log('  list     - List certifications');
    console.log('  expires  - Show expiring certifications');
}
