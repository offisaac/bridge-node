/**
 * Agent Revoke Module
 *
 * Provides revocation services for tokens, sessions, and credentials.
 * Usage: node agent-revoke.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show revoke stats
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
 * Revocation Type
 */
const RevocationType = {
  TOKEN: 'token',
  SESSION: 'session',
  CREDENTIAL: 'credential',
  API_KEY: 'api_key',
  CERTIFICATE: 'certificate'
};

/**
 * Revocation Reason
 */
const RevocationReason = {
  EXPIRED: 'expired',
  USER_REQUEST: 'user_request',
  COMPROMISED: 'compromised',
  POLICY_VIOLATION: 'policy_violation',
  INACTIVE: 'inactive',
  MANUAL: 'manual',
  UPGRADE: 'upgrade'
};

/**
 * Revocation Entry
 */
class RevocationEntry {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.type = config.type;
    this.subject = config.subject; // Entity being revoked
    this.identifier = config.identifier; // Token value, session ID, etc.
    this.reason = config.reason;
    this.revokedBy = config.revokedBy;
    this.metadata = config.metadata || {};
    this.revokedAt = config.revokedAt || Date.now();
    this.expiresAt = config.expiresAt || null; // When revocation record expires
  }

  isExpired() {
    if (!this.expiresAt) return false;
    return Date.now() > this.expiresAt;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      subject: this.subject,
      identifier: this.identifier,
      reason: this.reason,
      revokedBy: this.revokedBy,
      metadata: this.metadata,
      revokedAt: this.revokedAt,
      expiresAt: this.expiresAt,
      isExpired: this.isExpired()
    };
  }
}

/**
 * Revocation Policy
 */
class RevocationPolicy {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.retainHistory = config.retainHistory !== false;
    this.historyDuration = config.historyDuration || 30 * 24 * 60 * 60 * 1000; // 30 days
    this.autoRevoke = config.autoRevoke || false;
    this.conditions = config.conditions || [];
  }

  evaluate(entity) {
    for (const condition of this.conditions) {
      if (!condition(entity)) {
        return false;
      }
    }
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      retainHistory: this.retainHistory,
      historyDuration: this.historyDuration,
      autoRevoke: this.autoRevoke
    };
  }
}

/**
 * Revocation Manager
 */
class RevocationManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.revocations = new Map(); // identifier -> RevocationEntry
    this.policies = new Map();
    this.stats = {
      totalRevocations: 0,
      tokensRevoked: 0,
      sessionsRevoked: 0,
      credentialsRevoked: 0,
      autoRevoked: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._createDefaultPolicies();
  }

  _createDefaultPolicies() {
    // Token revocation policy
    this.addPolicy(new RevocationPolicy({
      id: 'token-policy',
      name: 'Token Revocation Policy',
      type: RevocationType.TOKEN,
      retainHistory: true,
      historyDuration: 7 * 24 * 60 * 60 * 1000
    }));

    // Session revocation policy
    this.addPolicy(new RevocationPolicy({
      id: 'session-policy',
      name: 'Session Revocation Policy',
      type: RevocationType.SESSION,
      retainHistory: true,
      historyDuration: 30 * 24 * 60 * 60 * 1000
    }));
  }

  revoke(config) {
    const entry = new RevocationEntry({
      type: config.type,
      subject: config.subject,
      identifier: config.identifier,
      reason: config.reason,
      revokedBy: config.revokedBy,
      metadata: config.metadata,
      expiresAt: config.retainUntil || null
    });

    this.revocations.set(entry.identifier, entry);
    this.stats.totalRevocations++;

    if (config.type === RevocationType.TOKEN) {
      this.stats.tokensRevoked++;
    } else if (config.type === RevocationType.SESSION) {
      this.stats.sessionsRevoked++;
    } else if (config.type === RevocationType.CREDENTIAL) {
      this.stats.credentialsRevoked++;
    }

    return entry;
  }

  isRevoked(identifier) {
    const entry = this.revocations.get(identifier);
    if (!entry) return false;
    if (entry.isExpired()) {
      this.revocations.delete(identifier);
      return false;
    }
    return true;
  }

  getRevocation(identifier) {
    return this.revocations.get(identifier);
  }

  revokeBySubject(subject) {
    const entries = [];
    for (const [identifier, entry] of this.revocations) {
      if (entry.subject === subject) {
        entries.push(entry);
      }
    }
    return entries;
  }

  revokeByType(type) {
    const entries = [];
    for (const entry of this.revocations.values()) {
      if (entry.type === type) {
        entries.push(entry);
      }
    }
    return entries;
  }

  addPolicy(policy) {
    this.policies.set(policy.id, policy);
  }

  getPolicy(policyId) {
    return this.policies.get(policyId);
  }

  listPolicies() {
    return Array.from(this.policies.values()).map(p => p.toJSON());
  }

  cleanupExpired() {
    let count = 0;
    for (const [identifier, entry] of this.revocations) {
      if (entry.isExpired()) {
        this.revocations.delete(identifier);
        count++;
      }
    }
    return count;
  }

  getStats() {
    return {
      ...this.stats,
      activeRevocations: this.revocations.size,
      policiesCount: this.policies.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Revoke Demo\n');

  const manager = new RevocationManager();

  // Show policies
  console.log('1. Revocation Policies:');
  const policies = manager.listPolicies();
  for (const policy of policies) {
    console.log(`   - ${policy.name}: retain for ${policy.historyDuration / 86400000} days`);
  }

  // Revoke tokens
  console.log('\n2. Revoking Tokens:');
  const token1 = manager.revoke({
    type: RevocationType.TOKEN,
    subject: 'user-123',
    identifier: 'token-abc-123',
    reason: RevocationReason.USER_REQUEST,
    revokedBy: 'admin@example.com',
    retainUntil: Date.now() + 7 * 24 * 60 * 60 * 1000
  });
  console.log(`   Revoked: token-abc-123 (${token1.reason})`);

  const token2 = manager.revoke({
    type: RevocationType.TOKEN,
    subject: 'user-456',
    identifier: 'token-def-456',
    reason: RevocationReason.COMPROMISED,
    revokedBy: 'security-system',
    retainUntil: Date.now() + 30 * 24 * 60 * 60 * 1000
  });
  console.log(`   Revoked: token-def-456 (${token2.reason})`);

  // Revoke session
  console.log('\n3. Revoking Session:');
  const session = manager.revoke({
    type: RevocationType.SESSION,
    subject: 'user-123',
    identifier: 'session-xyz-789',
    reason: RevocationReason.USER_REQUEST,
    revokedBy: 'user-123'
  });
  console.log(`   Revoked: session-xyz-789`);

  // Check revocation status
  console.log('\n4. Checking Revocation Status:');
  const isRevoked1 = manager.isRevoked('token-abc-123');
  console.log(`   token-abc-123: ${isRevoked1 ? 'REVOKED' : 'ACTIVE'}`);

  const isRevoked2 = manager.isRevoked('token-new-999');
  console.log(`   token-new-999: ${isRevoked2 ? 'REVOKED' : 'ACTIVE'}`);

  // Get revocation details
  console.log('\n5. Revocation Details:');
  const details = manager.getRevocation('token-abc-123');
  console.log(`   Subject: ${details.subject}`);
  console.log(`   Reason: ${details.reason}`);
  console.log(`   Revoked By: ${details.revokedBy}`);
  console.log(`   Revoked At: ${new Date(details.revokedAt).toLocaleString()}`);

  // Revoke by subject
  console.log('\n6. Revoking All for Subject:');
  const allForSubject = manager.revokeBySubject('user-123');
  console.log(`   Revocations for user-123: ${allForSubject.length}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Total Revocations: ${stats.totalRevocations}`);
  console.log(`   Tokens Revoked: ${stats.tokensRevoked}`);
  console.log(`   Sessions Revoked: ${stats.sessionsRevoked}`);
  console.log(`   Active Revocations: ${stats.activeRevocations}`);
  console.log(`   Policies: ${stats.policiesCount}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new RevocationManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Revoke Module');
  console.log('Usage: node agent-revoke.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
