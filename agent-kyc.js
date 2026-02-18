/**
 * Agent KYC Module
 *
 * Provides Know Your Customer verification services.
 * Usage: node agent-kyc.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show KYC stats
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
 * KYC Status
 */
const KYCStatus = {
  NOT_STARTED: 'not_started',
  PENDING: 'pending',
  IN_REVIEW: 'in_review',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  EXPIRED: 'expired'
};

/**
 * Document Type
 */
const DocumentType = {
  PASSPORT: 'passport',
  DRIVERS_LICENSE: 'drivers_license',
  NATIONAL_ID: 'national_id',
  UTILITY_BILL: 'utility_bill',
  BANK_STATEMENT: 'bank_statement'
};

/**
 * KYC Record
 */
class KYCRecord {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.userId = config.userId;
    this.status = config.status || KYCStatus.NOT_STARTED;
    this.level = config.level || 1; // 1: Basic, 2: Intermediate, 3: Full
    this.documents = [];
    this.checks = [];
    this.riskScore = 0;
    this.verifiedAt = null;
    this.expiresAt = null;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.metadata = config.metadata || {};
  }

  addDocument(document) {
    this.documents.push(document);
    this.updatedAt = Date.now();
  }

  addCheck(check) {
    this.checks.push(check);
    this.updatedAt = Date.now();
  }

  setStatus(status) {
    this.status = status;
    this.updatedAt = Date.now();

    if (status === KYCStatus.VERIFIED) {
      this.verifiedAt = Date.now();
      this.expiresAt = Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 year
    }
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      status: this.status,
      level: this.level,
      documentsCount: this.documents.length,
      checksCount: this.checks.length,
      riskScore: this.riskScore,
      verifiedAt: this.verifiedAt,
      expiresAt: this.expiresAt
    };
  }
}

/**
 * Document
 */
class Document {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.type = config.type;
    this.number = config.number; // Masked
    this.status = 'pending';
    this.uploadedAt = Date.now();
    this.verifiedAt = null;
    this.metadata = config.metadata || {};
  }

  verify() {
    this.status = 'verified';
    this.verifiedAt = Date.now();
  }

  reject(reason) {
    this.status = 'rejected';
    this.verifiedAt = Date.now();
    this.metadata.rejectReason = reason;
  }
}

/**
 * Verification Check
 */
class VerificationCheck {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.type = config.type; // identity, address, document, watchlist
    this.status = 'pending';
    this.result = null;
    this.score = 0;
    this.details = config.details || {};
    this.createdAt = Date.now();
    this.completedAt = null;
  }

  pass(score = 100) {
    this.status = 'passed';
    this.result = 'pass';
    this.score = score;
    this.completedAt = Date.now();
  }

  fail(reason) {
    this.status = 'failed';
    this.result = 'fail';
    this.score = 0;
    this.completedAt = Date.now();
    this.details.reason = reason;
  }
}

/**
 * KYC Manager
 */
class KYCManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.records = new Map();
    this.stats = {
      applicationsStarted: 0,
      applicationsVerified: 0,
      applicationsRejected: 0,
      documentsVerified: 0,
      checksPassed: 0,
      checksFailed: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  createApplication(userId, level = 1) {
    const record = new KYCRecord({ userId, level });
    this.records.set(record.id, record);
    this.stats.applicationsStarted++;
    return record;
  }

  getRecord(recordId) {
    return this.records.get(recordId);
  }

  getRecordByUser(userId) {
    for (const record of this.records.values()) {
      if (record.userId === userId) {
        return record;
      }
    }
    return null;
  }

  addDocument(recordId, documentData) {
    const record = this.records.get(recordId);
    if (!record) {
      return null;
    }

    const document = new Document(documentData);
    record.addDocument(document);
    return document;
  }

  verifyDocument(recordId, documentId, verified = true, reason = null) {
    const record = this.records.get(recordId);
    if (!record) {
      return null;
    }

    const document = record.documents.find(d => d.id === documentId);
    if (!document) {
      return null;
    }

    if (verified) {
      document.verify();
      this.stats.documentsVerified++;
    } else {
      document.reject(reason);
    }

    return document;
  }

  addCheck(recordId, checkData) {
    const record = this.records.get(recordId);
    if (!record) {
      return null;
    }

    const check = new VerificationCheck(checkData);
    record.addCheck(check);
    return check;
  }

  completeCheck(recordId, checkId, passed = true, score = 100, reason = null) {
    const record = this.records.get(recordId);
    if (!record) {
      return null;
    }

    const check = record.checks.find(c => c.id === checkId);
    if (!check) {
      return null;
    }

    if (passed) {
      check.pass(score);
      this.stats.checksPassed++;
    } else {
      check.fail(reason);
      this.stats.checksFailed++;
    }

    // Update risk score
    record.riskScore = this._calculateRiskScore(record);

    return check;
  }

  _calculateRiskScore(record) {
    let score = 0;

    // Base score from failed checks
    const failedChecks = record.checks.filter(c => c.status === 'failed').length;
    score += failedChecks * 20;

    // Score from document verification
    const unverifiedDocs = record.documents.filter(d => d.status !== 'verified').length;
    score += unverifiedDocs * 10;

    // Adjust based on KYC level
    if (record.level === 1) score += 10;
    if (record.level === 2) score += 5;

    return Math.min(100, score);
  }

  verifyApplication(recordId) {
    const record = this.records.get(recordId);
    if (!record) {
      return null;
    }

    // Check if all required documents are verified
    const allDocsVerified = record.documents.every(d => d.status === 'verified');

    // Check if all checks passed
    const allChecksPassed = record.checks.every(c => c.status === 'passed');

    // Determine status
    if (allDocsVerified && allChecksPassed) {
      record.setStatus(KYCStatus.VERIFIED);
      this.stats.applicationsVerified++;
    } else if (record.riskScore > 50) {
      record.setStatus(KYCStatus.REJECTED);
      this.stats.applicationsRejected++;
    } else {
      record.setStatus(KYCStatus.IN_REVIEW);
    }

    return record;
  }

  rejectApplication(recordId, reason) {
    const record = this.records.get(recordId);
    if (!record) {
      return null;
    }

    record.setStatus(KYCStatus.REJECTED);
    record.metadata.rejectReason = reason;
    this.stats.applicationsRejected++;

    return record;
  }

  getStats() {
    return {
      ...this.stats,
      totalApplications: this.records.size,
      pendingApplications: Array.from(this.records.values()).filter(r => r.status === KYCStatus.PENDING || r.status === KYCStatus.IN_REVIEW).length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent KYC Demo\n');

  const manager = new KYCManager();

  // Create application
  console.log('1. Creating KYC Application:');
  const app = manager.createApplication('user-123', 2);
  console.log(`   Application ID: ${app.id}`);
  console.log(`   User: ${app.userId}, Level: ${app.level}`);
  console.log(`   Status: ${app.status}`);

  // Add documents
  console.log('\n2. Adding Documents:');
  const doc1 = manager.addDocument(app.id, {
    type: DocumentType.PASSPORT,
    number: '****1234',
    metadata: { country: 'US' }
  });
  console.log(`   Added: ${doc1.type}`);

  const doc2 = manager.addDocument(app.id, {
    type: DocumentType.UTILITY_BILL,
    number: '****5678',
    metadata: { address: '123 Main St' }
  });
  console.log(`   Added: ${doc2.type}`);

  // Verify documents
  console.log('\n3. Verifying Documents:');
  manager.verifyDocument(app.id, doc1.id, true);
  console.log(`   ${doc1.type}: verified`);

  manager.verifyDocument(app.id, doc2.id, true);
  console.log(`   ${doc2.type}: verified`);

  // Add checks
  console.log('\n4. Running Verification Checks:');

  const check1 = manager.addCheck(app.id, {
    type: 'identity',
    details: { name: 'John Doe', dob: '1990-01-01' }
  });
  console.log(`   Check: ${check1.type} - ${check1.status}`);

  const check2 = manager.addCheck(app.id, {
    type: 'address',
    details: { address: '123 Main St' }
  });
  console.log(`   Check: ${check2.type} - ${check2.status}`);

  // Complete checks
  console.log('\n5. Completing Checks:');
  manager.completeCheck(app.id, check1.id, true, 95);
  console.log(`   ${check1.type}: passed (95)`);

  manager.completeCheck(app.id, check2.id, true, 90);
  console.log(`   ${check2.type}: passed (90)`);

  // Verify application
  console.log('\n6. Verifying Application:');
  manager.verifyApplication(app.id);
  console.log(`   Status: ${app.status}`);
  console.log(`   Verified At: ${new Date(app.verifiedAt).toLocaleString()}`);
  console.log(`   Risk Score: ${app.riskScore}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Applications Started: ${stats.applicationsStarted}`);
  console.log(`   Applications Verified: ${stats.applicationsVerified}`);
  console.log(`   Applications Rejected: ${stats.applicationsRejected}`);
  console.log(`   Documents Verified: ${stats.documentsVerified}`);
  console.log(`   Checks Passed: ${stats.checksPassed}`);
  console.log(`   Checks Failed: ${stats.checksFailed}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new KYCManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent KYC Module');
  console.log('Usage: node agent-kyc.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
