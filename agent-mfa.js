/**
 * Agent MFA Module
 *
 * Provides multi-factor authentication with multiple verification methods.
 * Usage: node agent-mfa.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show MFA stats
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
 * MFA Method
 */
const MFAMethod = {
  TOTP: 'totp',
  SMS: 'sms',
  EMAIL: 'email',
  PUSH: 'push',
  WEBUTHN: 'webauthn'
};

/**
 * MFA Status
 */
const MFAStatus = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed',
  EXPIRED: 'expired',
  DISABLED: 'disabled'
};

/**
 * MFA Challenge
 */
class MFAChallenge {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.userId = config.userId;
    this.method = config.method;
    this.status = MFAStatus.PENDING;
    this.code = config.code || this._generateCode();
    this.attempts = 0;
    this.maxAttempts = config.maxAttempts || 3;
    this.createdAt = Date.now();
    this.expiresAt = config.expiresAt || (Date.now() + 300000); // 5 minutes
    this.verifiedAt = null;
    this.metadata = config.metadata || {};
  }

  _generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }

  verify(inputCode) {
    if (this.status !== MFAStatus.PENDING) {
      return { success: false, reason: 'Challenge already processed' };
    }

    if (this.isExpired()) {
      this.status = MFAStatus.EXPIRED;
      return { success: false, reason: 'Challenge expired' };
    }

    if (this.attempts >= this.maxAttempts) {
      this.status = MFAStatus.FAILED;
      return { success: false, reason: 'Max attempts exceeded' };
    }

    this.attempts++;

    if (inputCode === this.code) {
      this.status = MFAStatus.VERIFIED;
      this.verifiedAt = Date.now();
      return { success: true };
    }

    return { success: false, reason: 'Invalid code' };
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      method: this.method,
      status: this.status,
      attempts: this.attempts,
      maxAttempts: this.maxAttempts,
      expiresAt: this.expiresAt,
      isExpired: this.isExpired(),
      verifiedAt: this.verifiedAt
    };
  }
}

/**
 * MFA Device
 */
class MFADevice {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.userId = config.userId;
    this.name = config.name;
    this.method = config.method;
    this.enabled = true;
    this.trusted = false;
    this.createdAt = Date.now();
    this.lastUsed = null;
    this.metadata = config.metadata || {};
  }

  disable() {
    this.enabled = false;
  }

  enable() {
    this.enabled = true;
  }

  trust() {
    this.trusted = true;
  }

  untrust() {
    this.trusted = false;
  }

  recordUsage() {
    this.lastUsed = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      name: this.name,
      method: this.method,
      enabled: this.enabled,
      trusted: this.trusted,
      createdAt: this.createdAt,
      lastUsed: this.lastUsed
    };
  }
}

/**
 * MFA Manager
 */
class MFAManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.challenges = new Map();
    this.devices = new Map();
    this.stats = {
      challengesCreated: 0,
      challengesVerified: 0,
      challengesFailed: 0,
      devicesRegistered: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  createChallenge(config) {
    const challenge = new MFAChallenge(config);
    this.challenges.set(challenge.id, challenge);
    this.stats.challengesCreated++;
    return challenge;
  }

  getChallenge(challengeId) {
    return this.challenges.get(challengeId);
  }

  verifyChallenge(challengeId, code) {
    const challenge = this.challenges.get(challengeId);
    if (!challenge) {
      return { success: false, reason: 'Challenge not found' };
    }

    const result = challenge.verify(code);
    if (result.success) {
      this.stats.challengesVerified++;
    } else {
      this.stats.challengesFailed++;
    }

    return result;
  }

  registerDevice(config) {
    const device = new MFADevice(config);
    this.devices.set(device.id, device);
    this.stats.devicesRegistered++;
    return device;
  }

  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  getDevicesForUser(userId) {
    return Array.from(this.devices.values()).filter(d => d.userId === userId);
  }

  deleteDevice(deviceId) {
    return this.devices.delete(deviceId);
  }

  initiateMFA(userId, method, options = {}) {
    // Get user devices
    const devices = this.getDevicesForUser(userId);
    const device = devices.find(d => d.method === method && d.enabled);

    if (!device) {
      return { success: false, reason: 'No enabled device for method' };
    }

    // Create challenge
    const challenge = this.createChallenge({
      userId,
      method,
      maxAttempts: options.maxAttempts || 3,
      metadata: { deviceId: device.id }
    });

    device.recordUsage();

    // Simulate sending code (in real implementation, would send via SMS, email, etc.)
    console.log(`   [SIMULATED] Sending code ${challenge.code} via ${method}`);

    return {
      success: true,
      challengeId: challenge.id,
      method: method,
      expiresAt: challenge.expiresAt
    };
  }

  completeMFA(challengeId, code) {
    return this.verifyChallenge(challengeId, code);
  }

  cleanupExpired() {
    let count = 0;
    for (const [id, challenge] of this.challenges) {
      if (challenge.isExpired()) {
        this.challenges.delete(id);
        count++;
      }
    }
    return count;
  }

  getStats() {
    return {
      ...this.stats,
      activeChallenges: Array.from(this.challenges.values()).filter(c => c.status === MFAStatus.PENDING).length,
      devicesCount: this.devices.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent MFA Demo\n');

  const manager = new MFAManager();

  // Register devices
  console.log('1. Registering MFA Devices:');

  const device1 = manager.registerDevice({
    userId: 'user-123',
    name: 'My Phone',
    method: MFAMethod.TOTP,
    metadata: { phone: '+1234567890' }
  });
  console.log(`   Registered: ${device1.name} (${device1.method})`);

  const device2 = manager.registerDevice({
    userId: 'user-123',
    name: 'Backup Email',
    method: MFAMethod.EMAIL,
    metadata: { email: 'user@example.com' }
  });
  console.log(`   Registered: ${device2.name} (${device2.method})`);

  // Initiate MFA
  console.log('\n2. Initiating MFA:');
  const mfaResult = manager.initiateMFA('user-123', MFAMethod.TOTP);
  console.log(`   Challenge ID: ${mfaResult.challengeId}`);
  console.log(`   Expires At: ${new Date(mfaResult.expiresAt).toLocaleTimeString()}`);

  // Verify with correct code
  console.log('\n3. Verifying with Correct Code:');
  const challenge = manager.getChallenge(mfaResult.challengeId);
  const result1 = manager.verifyChallenge(mfaResult.challengeId, challenge.code);
  console.log(`   Result: ${result1.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`   Reason: ${result1.reason || 'N/A'}`);

  // Initiate again for failed attempt demo
  console.log('\n4. Verifying with Wrong Code:');
  const mfaResult2 = manager.initiateMFA('user-123', MFAMethod.TOTP);
  const result2 = manager.verifyChallenge(mfaResult2.challengeId, '000000');
  console.log(`   Result: ${result2.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`   Reason: ${result2.reason}`);

  // Get user devices
  console.log('\n5. User Devices:');
  const userDevices = manager.getDevicesForUser('user-123');
  for (const device of userDevices) {
    console.log(`   - ${device.name}: ${device.method} (enabled: ${device.enabled}, trusted: ${device.trusted})`);
  }

  // Disable device
  console.log('\n6. Disabling Device:');
  device1.disable();
  console.log(`   ${device1.name} disabled`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Challenges Created: ${stats.challengesCreated}`);
  console.log(`   Challenges Verified: ${stats.challengesVerified}`);
  console.log(`   Challenges Failed: ${stats.challengesFailed}`);
  console.log(`   Devices Registered: ${stats.devicesRegistered}`);
  console.log(`   Active Challenges: ${stats.activeChallenges}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new MFAManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent MFA Module');
  console.log('Usage: node agent-mfa.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
