/**
 * Agent Phone Module
 *
 * Provides phone number verification and validation services.
 * Usage: node agent-phone.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show phone stats
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
 * Phone Number
 */
class PhoneNumber {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.number = config.number;
    this.countryCode = config.countryCode || '+1';
    this.formatted = this._format();
    this.isValid = false;
    this.carrier = null;
    this.lineType = null;
    this.region = null;
    this.timezone = null;
    this.isoCountry = config.isoCountry || 'US';
  }

  _format() {
    const digits = this.number.replace(/\D/g, '');
    if (this.countryCode === '+1' && digits.length === 10) {
      return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return `${this.countryCode} ${digits}`;
  }

  validate() {
    const digits = this.number.replace(/\D/g, '');

    // Basic validation rules
    if (this.countryCode === '+1') {
      this.isValid = digits.length === 10 && /^[2-9]/.test(digits);
    } else {
      this.isValid = digits.length >= 10 && digits.length <= 15;
    }

    return this.isValid;
  }

  toJSON() {
    return {
      id: this.id,
      number: this.number,
      countryCode: this.countryCode,
      formatted: this.formatted,
      isValid: this.isValid,
      carrier: this.carrier,
      lineType: this.lineType,
      region: this.region,
      isoCountry: this.isoCountry
    };
  }
}

/**
 * Phone Verification
 */
class PhoneVerification {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.phoneNumber = config.phoneNumber;
    this.code = config.code || this._generateCode();
    this.status = 'pending';
    this.attempts = 0;
    this.maxAttempts = config.maxAttempts || 3;
    this.createdAt = Date.now();
    this.expiresAt = config.expiresAt || (Date.now() + 300000); // 5 minutes
    this.verifiedAt = null;
  }

  _generateCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }

  verify(inputCode) {
    if (this.status !== 'pending') {
      return { success: false, reason: 'Verification already processed' };
    }

    if (this.isExpired()) {
      this.status = 'expired';
      return { success: false, reason: 'Verification code expired' };
    }

    if (this.attempts >= this.maxAttempts) {
      this.status = 'failed';
      return { success: false, reason: 'Max attempts exceeded' };
    }

    this.attempts++;

    if (inputCode === this.code) {
      this.status = 'verified';
      this.verifiedAt = Date.now();
      return { success: true };
    }

    return { success: false, reason: 'Invalid code' };
  }

  toJSON() {
    return {
      id: this.id,
      phoneNumber: this.phoneNumber,
      status: this.status,
      attempts: this.attempts,
      expiresAt: this.expiresAt,
      isExpired: this.isExpired(),
      verifiedAt: this.verifiedAt
    };
  }
}

/**
 * Phone Manager
 */
class PhoneManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.phoneNumbers = new Map();
    this.verifications = new Map();
    this.stats = {
      phonesValidated: 0,
      phonesVerified: 0,
      verificationsSent: 0,
      verificationsFailed: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  parseAndValidate(number, countryCode = '+1') {
    const phone = new PhoneNumber({ number, countryCode });
    phone.validate();

    if (phone.isValid) {
      this.stats.phonesValidated++;
      // Simulate carrier/line type lookup
      phone.carrier = this._simulateCarrierLookup(number);
      phone.lineType = this._simulateLineType();
      phone.region = this._simulateRegion();
    }

    this.phoneNumbers.set(phone.id, phone);
    return phone;
  }

  _simulateCarrierLookup(number) {
    const carriers = ['Verizon', 'AT&T', 'T-Mobile', 'Sprint', 'US Cellular'];
    return carriers[Math.floor(Math.random() * carriers.length)];
  }

  _simulateLineType() {
    const types = ['mobile', 'landline', 'voip', 'prepaid'];
    return types[Math.floor(Math.random() * types.length)];
  }

  _simulateRegion() {
    const regions = ['CA', 'NY', 'TX', 'FL', 'WA', 'IL'];
    return regions[Math.floor(Math.random() * regions.length)];
  }

  createVerification(phoneNumber) {
    const verification = new PhoneVerification({ phoneNumber });
    this.verifications.set(verification.id, verification);
    this.stats.verificationsSent++;

    console.log(`   [SIMULATED] Sending code ${verification.code} to ${phoneNumber}`);

    return verification;
  }

  verifyCode(verificationId, code) {
    const verification = this.verifications.get(verificationId);
    if (!verification) {
      return { success: false, reason: 'Verification not found' };
    }

    const result = verification.verify(code);
    if (result.success) {
      this.stats.phonesVerified++;
    } else {
      this.stats.verificationsFailed++;
    }

    return result;
  }

  getVerification(verificationId) {
    return this.verifications.get(verificationId);
  }

  cleanupExpired() {
    let count = 0;
    for (const [id, verification] of this.verifications) {
      if (verification.isExpired() && verification.status === 'pending') {
        verification.status = 'expired';
        count++;
      }
    }
    return count;
  }

  getStats() {
    return {
      ...this.stats,
      phonesCount: this.phoneNumbers.size,
      activeVerifications: Array.from(this.verifications.values()).filter(v => v.status === 'pending').length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Phone Demo\n');

  const manager = new PhoneManager();

  // Validate phone numbers
  console.log('1. Validating Phone Numbers:');

  const phone1 = manager.parseAndValidate('5551234567', '+1');
  console.log(`   ${phone1.formatted}: ${phone1.isValid ? 'VALID' : 'INVALID'}`);
  console.log(`   Carrier: ${phone1.carrier}, Type: ${phone1.lineType}, Region: ${phone1.region}`);

  const phone2 = manager.parseAndValidate('+44 20 7946 0958', '+44');
  console.log(`   ${phone2.formatted}: ${phone2.isValid ? 'VALID' : 'INVALID'}`);

  const phone3 = manager.parseAndValidate('123', '+1');
  console.log(`   ${phone3.formatted}: ${phone3.isValid ? 'VALID' : 'INVALID'}`);

  // Create verification
  console.log('\n2. Creating Phone Verification:');
  const verification = manager.createVerification(phone1.formatted);
  console.log(`   Verification ID: ${verification.id}`);
  console.log(`   Expires At: ${new Date(verification.expiresAt).toLocaleTimeString()}`);

  // Verify with correct code
  console.log('\n3. Verifying with Correct Code:');
  const result1 = manager.verifyCode(verification.id, verification.code);
  console.log(`   Result: ${result1.success ? 'SUCCESS' : 'FAILED'}`);

  // Create another verification for failed attempt demo
  console.log('\n4. Verifying with Wrong Code:');
  const verification2 = manager.createVerification(phone1.formatted);
  const result2 = manager.verifyCode(verification2.id, '000000');
  console.log(`   Result: ${result2.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`   Reason: ${result2.reason}`);

  // Stats
  console.log('\n5. Statistics:');
  const stats = manager.getStats();
  console.log(`   Phones Validated: ${stats.phonesValidated}`);
  console.log(`   Phones Verified: ${stats.phonesVerified}`);
  console.log(`   Verifications Sent: ${stats.verificationsSent}`);
  console.log(`   Verifications Failed: ${stats.verificationsFailed}`);
  console.log(`   Active Verifications: ${stats.activeVerifications}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new PhoneManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Phone Module');
  console.log('Usage: node agent-phone.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
