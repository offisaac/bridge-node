/**
 * Agent TOTP Module
 *
 * Provides TOTP (Time-based One-Time Password) generation and validation.
 * Usage: node agent-totp.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show TOTP stats
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
 * TOTP Generator
 */
class TOTPGenerator {
  constructor(config = {}) {
    this.issuer = config.issuer || 'BridgeNode';
    this.digits = config.digits || 6;
    this.period = config.period || 30; // seconds
    this.algorithm = config.algorithm || 'SHA1';
  }

  generateSecret() {
    return crypto.randomBytes(20).toString('hex');
  }

  generateTOTP(secret, timestamp = Date.now()) {
    const counter = Math.floor(timestamp / 1000 / this.period);
    return this._generateHOTP(secret, counter);
  }

  _generateHOTP(secret, counter) {
    // Convert counter to buffer
    const counterBuffer = Buffer.alloc(8);
    counterBuffer.writeBigInt64BE(BigInt(counter));

    // Create HMAC
    const hmac = crypto.createHmac(this.algorithm.toLowerCase(), Buffer.from(secret, 'hex'));
    hmac.update(counterBuffer);
    const hash = hmac.digest();

    // Dynamic truncation
    const offset = hash[hash.length - 1] & 0x0f;
    const binary =
      ((hash[offset] & 0x7f) << 24) |
      ((hash[offset + 1] & 0xff) << 16) |
      ((hash[offset + 2] & 0xff) << 8) |
      (hash[offset + 3] & 0xff);

    // Generate OTP
    const otp = binary % Math.pow(10, this.digits);
    return otp.toString().padStart(this.digits, '0');
  }

  verify(secret, token, window = 1) {
    const now = Date.now();

    // Check current window
    if (this._compareToken(this.generateTOTP(secret, now), token)) {
      return { valid: true, window: 0 };
    }

    // Check previous window
    if (window >= 1) {
      const prevTime = now - (this.period * 1000);
      if (this._compareToken(this.generateTOTP(secret, prevTime), token)) {
        return { valid: true, window: -1 };
      }
    }

    // Check next window
    if (window >= 1) {
      const nextTime = now + (this.period * 1000);
      if (this._compareToken(this.generateTOTP(secret, nextTime), token)) {
        return { valid: true, window: 1 };
      }
    }

    return { valid: false, window: null };
  }

  _compareToken(generated, provided) {
    // Use constant-time comparison
    if (generated.length !== provided.length) return false;
    let result = 0;
    for (let i = 0; i < generated.length; i++) {
      result |= generated.charCodeAt(i) ^ provided.charCodeAt(i);
    }
    return result === 0;
  }

  getProvisioningURI(secret, accountName) {
    return `otpauth://totp/${encodeURIComponent(this.issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(this.issuer)}&digits=${this.digits}&period=${this.period}`;
  }

  getTimeRemaining() {
    const now = Math.floor(Date.now() / 1000);
    return this.period - (now % this.period);
  }
}

/**
 * TOTP User
 */
class TOTPUser {
  constructor(config) {
    this.userId = config.userId;
    this.secret = config.secret;
    this.enabled = config.enabled !== false;
    this.backupCodes = config.backupCodes || [];
    this.createdAt = config.createdAt || Date.now();
    this.lastUsed = null;
  }

  enable() {
    this.enabled = true;
  }

  disable() {
    this.enabled = false;
  }

  recordUsage() {
    this.lastUsed = Date.now();
  }

  verifyBackupCode(code) {
    const index = this.backupCodes.indexOf(code);
    if (index !== -1) {
      this.backupCodes.splice(index, 1);
      return { valid: true, remaining: this.backupCodes.length };
    }
    return { valid: false };
  }

  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      codes.push(code);
    }
    this.backupCodes = codes;
    return codes;
  }

  toJSON() {
    return {
      userId: this.userId,
      enabled: this.enabled,
      hasSecret: !!this.secret,
      backupCodesRemaining: this.backupCodes.length,
      createdAt: this.createdAt,
      lastUsed: this.lastUsed
    };
  }
}

/**
 * TOTP Manager
 */
class TOTPManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.generator = new TOTPGenerator(config);
    this.users = new Map();
    this.stats = {
      tokensGenerated: 0,
      tokensVerified: 0,
      tokensFailed: 0,
      backupCodesUsed: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  setupUser(userId) {
    const secret = this.generator.generateSecret();

    const user = new TOTPUser({
      userId,
      secret
    });

    // Generate backup codes
    const backupCodes = user.generateBackupCodes(10);

    this.users.set(userId, user);
    return {
      user,
      secret,
      backupCodes,
      uri: this.generator.getProvisioningURI(secret, userId)
    };
  }

  getUser(userId) {
    return this.users.get(userId);
  }

  enableUser(userId) {
    const user = this.users.get(userId);
    if (user) {
      user.enable();
      return true;
    }
    return false;
  }

  disableUser(userId) {
    const user = this.users.get(userId);
    if (user) {
      user.disable();
      return true;
    }
    return false;
  }

  verify(userId, token) {
    const user = this.users.get(userId);
    if (!user) {
      return { valid: false, reason: 'User not found' };
    }

    if (!user.enabled) {
      return { valid: false, reason: 'TOTP not enabled' };
    }

    // Check backup codes first
    const backupResult = user.verifyBackupCode(token);
    if (backupResult.valid) {
      this.stats.backupCodesUsed++;
      user.recordUsage();
      return { valid: true, method: 'backup', remaining: backupResult.remaining };
    }

    // Verify TOTP
    const result = this.generator.verify(user.secret, token);
    if (result.valid) {
      this.stats.tokensVerified++;
      user.recordUsage();
      return { valid: true, method: 'totp', window: result.window };
    }

    this.stats.tokensFailed++;
    return { valid: false, reason: 'Invalid token' };
  }

  regenerateBackupCodes(userId) {
    const user = this.users.get(userId);
    if (!user) {
      return null;
    }
    return user.generateBackupCodes();
  }

  getTimeRemaining() {
    return this.generator.getTimeRemaining();
  }

  getStats() {
    return {
      ...this.stats,
      usersCount: this.users.size,
      enabledUsers: Array.from(this.users.values()).filter(u => u.enabled).length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent TOTP Demo\n');

  const manager = new TOTPManager();

  // Setup user
  console.log('1. Setting Up TOTP:');
  const setup = manager.setupUser('user-123');
  console.log(`   User: ${setup.user.userId}`);
  console.log(`   Secret: ${setup.secret.substring(0, 10)}...`);
  console.log(`   URI: ${setup.uri.substring(0, 50)}...`);
  console.log(`   Backup Codes: ${setup.backupCodes.join(', ')}`);

  // Generate TOTP
  console.log('\n2. Generating TOTP:');
  const token = manager.generator.generateTOTP(setup.secret);
  console.log(`   Current Token: ${token}`);
  console.log(`   Time Remaining: ${manager.getTimeRemaining()}s`);

  // Verify valid token
  console.log('\n3. Verifying Valid Token:');
  const result1 = manager.verify('user-123', token);
  console.log(`   Valid: ${result1.valid}`);
  console.log(`   Method: ${result1.method}`);

  // Verify invalid token
  console.log('\n4. Verifying Invalid Token:');
  const result2 = manager.verify('user-123', '000000');
  console.log(`   Valid: ${result2.valid}`);
  console.log(`   Reason: ${result2.reason}`);

  // Verify backup code
  console.log('\n5. Verifying Backup Code:');
  const backupCode = setup.backupCodes[0];
  const result3 = manager.verify('user-123', backupCode);
  console.log(`   Valid: ${result3.valid}`);
  console.log(`   Method: ${result3.method}`);
  console.log(`   Remaining: ${result3.remaining}`);

  // Try same backup code again (should fail)
  console.log('\n6. Verifying Used Backup Code:');
  const result4 = manager.verify('user-123', backupCode);
  console.log(`   Valid: ${result4.valid}`);
  console.log(`   Reason: ${result4.reason || 'N/A'}`);

  // Disable user
  console.log('\n7. Disabling TOTP:');
  manager.disableUser('user-123');
  console.log(`   Disabled for user-123`);

  // Try verify after disable
  console.log('\n8. Verifying After Disable:');
  const result5 = manager.verify('user-123', token);
  console.log(`   Valid: ${result5.valid}`);
  console.log(`   Reason: ${result5.reason}`);

  // Re-enable
  console.log('\n9. Re-enabling TOTP:');
  manager.enableUser('user-123');
  const result6 = manager.verify('user-123', token);
  console.log(`   Valid: ${result6.valid}`);

  // Stats
  console.log('\n10. Statistics:');
  const stats = manager.getStats();
  console.log(`   Tokens Verified: ${stats.tokensVerified}`);
  console.log(`   Tokens Failed: ${stats.tokensFailed}`);
  console.log(`   Backup Codes Used: ${stats.backupCodesUsed}`);
  console.log(`   Users: ${stats.usersCount}`);
  console.log(`   Enabled Users: ${stats.enabledUsers}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new TOTPManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent TOTP Module');
  console.log('Usage: node agent-totp.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
