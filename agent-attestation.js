/**
 * Agent Attestation Module
 *
 * Provides attestation service for verifying identity, integrity, and compliance.
 * Usage: node agent-attestation.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show attestation stats
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
 * Attestation Type
 */
const AttestationType = {
  IDENTITY: 'identity',
  DEVICE: 'device',
  SOFTWARE: 'software',
  COMPLIANCE: 'compliance',
  SECURITY: 'security'
};

/**
 * Attestation Status
 */
const AttestationStatus = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed',
  EXPIRED: 'expired',
  REVOKED: 'revoked'
};

/**
 * Attestation Claim
 */
class AttestationClaim {
  constructor(config) {
    this.type = config.type;
    this.value = config.value;
    this.verified = config.verified || false;
    this.timestamp = config.timestamp || Date.now();
  }

  toJSON() {
    return {
      type: this.type,
      value: this.value,
      verified: this.verified,
      timestamp: this.timestamp
    };
  }
}

/**
 * Attestation
 */
class Attestation {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.subject = config.subject; // Entity being attested
    this.attestor = config.attestor; // Entity performing attestation
    this.type = config.type;
    this.status = config.status || AttestationStatus.PENDING;
    this.claims = [];
    this.metadata = config.metadata || {};
    this.issuedAt = config.issuedAt || Date.now();
    this.expiresAt = config.expiresAt || (Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year
    this.verifiedAt = null;
    this.signature = null;
  }

  addClaim(type, value, verified = false) {
    const claim = new AttestationClaim({ type, value, verified });
    this.claims.push(claim);
    return claim;
  }

  verify() {
    if (this.status === AttestationStatus.REVOKED) {
      return { valid: false, reason: 'Attestation has been revoked' };
    }

    if (Date.now() > this.expiresAt) {
      this.status = AttestationStatus.EXPIRED;
      return { valid: false, reason: 'Attestation has expired' };
    }

    const allVerified = this.claims.every(c => c.verified);
    if (allVerified) {
      this.status = AttestationStatus.VERIFIED;
      this.verifiedAt = Date.now();
      return { valid: true, reason: 'All claims verified' };
    }

    return { valid: false, reason: 'Not all claims verified' };
  }

  revoke() {
    this.status = AttestationStatus.REVOKED;
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }

  toJSON() {
    return {
      id: this.id,
      subject: this.subject,
      attestor: this.attestor,
      type: this.type,
      status: this.status,
      claims: this.claims.map(c => c.toJSON()),
      metadata: this.metadata,
      issuedAt: this.issuedAt,
      expiresAt: this.expiresAt,
      verifiedAt: this.verifiedAt,
      isExpired: this.isExpired()
    };
  }
}

/**
 * Attestation Policy
 */
class AttestationPolicy {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.requiredClaims = config.requiredClaims || [];
    this.verificationLevel = config.verificationLevel || 'standard'; // basic, standard, strict
    this.trustThreshold = config.trustThreshold || 0.8;
    this.validityPeriod = config.validityPeriod || 365 * 24 * 60 * 60 * 1000;
  }

  validate(attestation) {
    // Check type
    if (attestation.type !== this.type) {
      return { valid: false, reason: 'Type mismatch' };
    }

    // Check required claims
    for (const required of this.requiredClaims) {
      const hasClaim = attestation.claims.some(c => c.type === required);
      if (!hasClaim) {
        return { valid: false, reason: `Missing required claim: ${required}` };
      }
    }

    // Check all claims verified
    const unverified = attestation.claims.filter(c => !c.verified);
    if (unverified.length > 0) {
      return { valid: false, reason: 'Unverified claims present' };
    }

    return { valid: true };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      requiredClaims: this.requiredClaims,
      verificationLevel: this.verificationLevel,
      trustThreshold: this.trustThreshold,
      validityPeriod: this.validityPeriod
    };
  }
}

/**
 * Attestation Manager
 */
class AttestationManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.attestations = new Map();
    this.policies = new Map();
    this.stats = {
      attestationsCreated: 0,
      attestationsVerified: 0,
      attestationsRevoked: 0,
      attestationsFailed: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._createDefaultPolicies();
  }

  _createDefaultPolicies() {
    // Identity attestation policy
    this.addPolicy(new AttestationPolicy({
      id: 'identity-standard',
      name: 'Standard Identity',
      type: AttestationType.IDENTITY,
      requiredClaims: ['email', 'phone'],
      verificationLevel: 'standard',
      trustThreshold: 0.9
    }));

    // Device attestation policy
    this.addPolicy(new AttestationPolicy({
      id: 'device-strict',
      name: 'Strict Device',
      type: AttestationType.DEVICE,
      requiredClaims: ['hardware-id', 'secure-boot', 'tamper-detection'],
      verificationLevel: 'strict',
      trustThreshold: 0.95
    }));

    // Compliance attestation policy
    this.addPolicy(new AttestationPolicy({
      id: 'compliance-basic',
      name: 'Basic Compliance',
      type: AttestationType.COMPLIANCE,
      requiredClaims: ['data-handling', 'encryption'],
      verificationLevel: 'basic',
      trustThreshold: 0.8
    }));
  }

  createAttestation(config) {
    const attestation = new Attestation(config);
    this.attestations.set(attestation.id, attestation);
    this.stats.attestationsCreated++;
    return attestation;
  }

  getAttestation(attestationId) {
    return this.attestations.get(attestationId);
  }

  verifyAttestation(attestationId, policyId = null) {
    const attestation = this.attestations.get(attestationId);
    if (!attestation) {
      return { valid: false, reason: 'Attestation not found' };
    }

    // If policy provided, validate against policy
    if (policyId) {
      const policy = this.policies.get(policyId);
      if (policy) {
        const policyResult = policy.validate(attestation);
        if (!policyResult.valid) {
          this.stats.attestationsFailed++;
          return policyResult;
        }
      }
    }

    const result = attestation.verify();
    if (result.valid) {
      this.stats.attestationsVerified++;
    } else {
      this.stats.attestationsFailed++;
    }

    return result;
  }

  revokeAttestation(attestationId) {
    const attestation = this.attestations.get(attestationId);
    if (attestation) {
      attestation.revoke();
      this.stats.attestationsRevoked++;
      return true;
    }
    return false;
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

  getStats() {
    return {
      ...this.stats,
      totalAttestations: this.attestations.size,
      policiesCount: this.policies.size,
      activeAttestations: Array.from(this.attestations.values()).filter(a => a.status === AttestationStatus.VERIFIED).length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Attestation Demo\n');

  const manager = new AttestationManager();

  // Show policies
  console.log('1. Attestation Policies:');
  const policies = manager.listPolicies();
  for (const policy of policies) {
    console.log(`   - ${policy.name} (${policy.verificationLevel})`);
    console.log(`     Required claims: ${policy.requiredClaims.join(', ')}`);
  }

  // Create identity attestation
  console.log('\n2. Creating Identity Attestation:');
  const idAttestation = manager.createAttestation({
    subject: 'user-123',
    attestor: 'identity-provider',
    type: AttestationType.IDENTITY,
    metadata: { userId: 'user-123', level: 'standard' }
  });

  idAttestation.addClaim('email', 'user@example.com', true);
  idAttestation.addClaim('phone', '+1234567890', true);
  idAttestation.addClaim('name', 'John Doe', false); // Not verified

  console.log(`   Created: ${idAttestation.id}`);
  console.log(`   Claims: ${idAttestation.claims.length}`);

  // Verify without policy
  console.log('\n3. Verifying Without Policy:');
  const result1 = manager.verifyAttestation(idAttestation.id);
  console.log(`   Valid: ${result1.valid}, Reason: ${result1.reason}`);
  console.log(`   Status: ${idAttestation.status}`);

  // Verify with policy
  console.log('\n4. Verifying With Policy:');
  const result2 = manager.verifyAttestation(idAttestation.id, 'identity-standard');
  console.log(`   Valid: ${result2.valid}, Reason: ${result2.reason}`);

  // Create device attestation
  console.log('\n5. Creating Device Attestation:');
  const deviceAttestation = manager.createAttestation({
    subject: 'device-456',
    attestor: 'device-trust-service',
    type: AttestationType.DEVICE,
    metadata: { deviceType: 'mobile', os: 'iOS' }
  });

  deviceAttestation.addClaim('hardware-id', 'hw-abc123', true);
  deviceAttestation.addClaim('secure-boot', 'enabled', true);
  deviceAttestation.addClaim('tamper-detection', 'active', true);

  console.log(`   Created: ${deviceAttestation.id}`);

  // Verify device attestation
  console.log('\n6. Verifying Device Attestation:');
  const result3 = manager.verifyAttestation(deviceAttestation.id, 'device-strict');
  console.log(`   Valid: ${result3.valid}, Reason: ${result3.reason}`);
  console.log(`   Status: ${deviceAttestation.status}`);

  // Revoke
  console.log('\n7. Revoking Attestation:');
  manager.revokeAttestation(idAttestation.id);
  console.log(`   Revoked: ${idAttestation.id}`);
  console.log(`   Status: ${idAttestation.status}`);

  // Verify revoked
  console.log('\n8. Verifying Revoked Attestation:');
  const result4 = manager.verifyAttestation(idAttestation.id);
  console.log(`   Valid: ${result4.valid}, Reason: ${result4.reason}`);

  // Stats
  console.log('\n9. Statistics:');
  const stats = manager.getStats();
  console.log(`   Total Attestations: ${stats.totalAttestations}`);
  console.log(`   Created: ${stats.attestationsCreated}`);
  console.log(`   Verified: ${stats.attestationsVerified}`);
  console.log(`   Revoked: ${stats.attestationsRevoked}`);
  console.log(`   Failed: ${stats.attestationsFailed}`);
  console.log(`   Policies: ${stats.policiesCount}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new AttestationManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Attestation Module');
  console.log('Usage: node agent-attestation.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
