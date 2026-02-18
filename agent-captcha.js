/**
 * Agent CAPTCHA Module
 *
 * Provides CAPTCHA generation and verification services.
 * Usage: node agent-captcha.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show CAPTCHA stats
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
 * CAPTCHA Type
 */
const CAPTCHAType = {
  TEXT: 'text',
  IMAGE: 'image',
  MATH: 'math',
  RECAPTCHA: 'recaptcha'
};

/**
 * CAPTCHA
 */
class CAPTCHA {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.type = config.type || CAPTCHAType.TEXT;
    this.question = config.question;
    this.answer = config.answer;
    this.options = config.options || [];
    this.imageData = config.imageData || null;
    this.createdAt = Date.now();
    this.expiresAt = config.expiresAt || (Date.now() + 300000); // 5 minutes
    this.verified = false;
    this.attempts = 0;
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }

  verify(input) {
    this.attempts++;

    if (this.isExpired()) {
      return { success: false, reason: 'CAPTCHA expired' };
    }

    if (this.verified) {
      return { success: false, reason: 'CAPTCHA already verified' };
    }

    // Case-insensitive comparison for text
    const answer = String(input).toLowerCase().trim();
    const correct = String(this.answer).toLowerCase().trim();

    if (answer === correct) {
      this.verified = true;
      return { success: true };
    }

    return { success: false, reason: 'Incorrect answer' };
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      question: this.type !== CAPTCHAType.IMAGE ? this.question : '[image]',
      expiresAt: this.expiresAt,
      verified: this.verified,
      attempts: this.attempts
    };
  }
}

/**
 * CAPTCHA Generator
 */
class CAPTCHAGenerator {
  constructor(config = {}) {
    this.length = config.length || 6;
    this.characters = config.characters || 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars
    this.mathMin = config.mathMin || 1;
    this.mathMax = config.mathMax || 20;
  }

  generateText() {
    let result = '';
    for (let i = 0; i < this.length; i++) {
      result += this.characters.charAt(Math.floor(Math.random() * this.characters.length));
    }
    return {
      question: `Enter the characters: ${result}`,
      answer: result
    };
  }

  generateMath() {
    const a = Math.floor(Math.random() * (this.mathMax - this.mathMin + 1)) + this.mathMin;
    const b = Math.floor(Math.random() * (this.mathMax - this.mathMin + 1)) + this.mathMin;
    const operations = ['+', '-', '*'];
    const op = operations[Math.floor(Math.random() * operations.length)];

    let answer;
    if (op === '+') {
      answer = a + b;
    } else if (op === '-') {
      answer = a - b;
    } else {
      answer = a * b;
    }

    return {
      question: `What is ${a} ${op} ${b}?`,
      answer: answer.toString()
    };
  }

  generateImage() {
    // Generate a random text for image CAPTCHA
    const text = this.generateText();
    return {
      question: '[Image CAPTCHA - Enter the text shown]',
      answer: text.answer,
      imageData: 'base64_image_data_placeholder'
    };
  }

  generate(type = CAPTCHAType.TEXT) {
    switch (type) {
      case CAPTCHAType.TEXT:
        return this.generateText();
      case CAPTCHAType.MATH:
        return this.generateMath();
      case CAPTCHAType.IMAGE:
        return this.generateImage();
      default:
        return this.generateText();
    }
  }
}

/**
 * CAPTCHA Manager
 */
class CaptchaManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.captchas = new Map();
    this.generator = new CAPTCHAGenerator(config);
    this.stats = {
      captchasCreated: 0,
      captchasVerified: 0,
      captchasFailed: 0,
      captchasExpired: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  create(type = CAPTCHAType.TEXT) {
    const generated = this.generator.generate(type);

    const captcha = new CAPTCHA({
      type,
      question: generated.question,
      answer: generated.answer,
      imageData: generated.imageData
    });

    this.captchas.set(captcha.id, captcha);
    this.stats.captchasCreated++;

    return captcha;
  }

  verify(captchaId, input) {
    const captcha = this.captchas.get(captchaId);
    if (!captcha) {
      return { success: false, reason: 'CAPTCHA not found' };
    }

    const result = captcha.verify(input);

    if (result.success) {
      this.stats.captchasVerified++;
    } else {
      this.stats.captchasFailed++;
    }

    return result;
  }

  get(captchaId) {
    return this.captchas.get(captchaId);
  }

  cleanupExpired() {
    let count = 0;
    for (const [id, captcha] of this.captchas) {
      if (captcha.isExpired() && !captcha.verified) {
        this.captchas.delete(id);
        this.stats.captchasExpired++;
        count++;
      }
    }
    return count;
  }

  getStats() {
    return {
      ...this.stats,
      activeCaptchas: Array.from(this.captchas.values()).filter(c => !c.verified && !c.isExpired()).length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent CAPTCHA Demo\n');

  const manager = new CaptchaManager();

  // Generate text CAPTCHA
  console.log('1. Generating Text CAPTCHA:');
  const textCaptcha = manager.create(CAPTCHAType.TEXT);
  console.log(`   CAPTCHA ID: ${textCaptcha.id}`);
  console.log(`   Question: ${textCaptcha.question}`);

  // Verify with correct answer
  console.log('\n2. Verifying with Correct Answer:');
  const result1 = manager.verify(textCaptcha.id, textCaptcha.answer);
  console.log(`   Result: ${result1.success ? 'SUCCESS' : 'FAILED'}`);

  // Generate math CAPTCHA
  console.log('\n3. Generating Math CAPTCHA:');
  const mathCaptcha = manager.create(CAPTCHAType.MATH);
  console.log(`   CAPTCHA ID: ${mathCaptcha.id}`);
  console.log(`   Question: ${mathCaptcha.question}`);

  // Verify with correct answer
  console.log('\n4. Verifying Math CAPTCHA:');
  const result2 = manager.verify(mathCaptcha.id, mathCaptcha.answer);
  console.log(`   Result: ${result2.success ? 'SUCCESS' : 'FAILED'}`);

  // Verify with wrong answer
  console.log('\n5. Verifying with Wrong Answer:');
  const imageCaptcha = manager.create(CAPTCHAType.IMAGE);
  const result3 = manager.verify(imageCaptcha.id, 'wronganswer');
  console.log(`   Result: ${result3.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`   Reason: ${result3.reason}`);

  // Verify already verified CAPTCHA
  console.log('\n6. Verifying Already Verified CAPTCHA:');
  const result4 = manager.verify(textCaptcha.id, textCaptcha.answer);
  console.log(`   Result: ${result4.success ? 'SUCCESS' : 'FAILED'}`);
  console.log(`   Reason: ${result4.reason}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   CAPTCHAs Created: ${stats.captchasCreated}`);
  console.log(`   CAPTCHAs Verified: ${stats.captchasVerified}`);
  console.log(`   CAPTCHAs Failed: ${stats.captchasFailed}`);
  console.log(`   Active CAPTCHAs: ${stats.activeCaptchas}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new CaptchaManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent CAPTCHA Module');
  console.log('Usage: node agent-captcha.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
