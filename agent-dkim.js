/**
 * Agent DKIM - DKIM Signing Module
 *
 * Handles DKIM email signing for email authentication.
 *
 * Usage: node agent-dkim.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   sign    - Sign a message
 *   verify  - Verify a signature
 */

class DKIMKey {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.domain = config.domain;
    this.selector = config.selector || 'default';
    this.privateKey = config.privateKey || null;
    this.publicKey = config.publicKey || null;
    this.algorithm = config.algorithm || 'rsa-sha256';
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
    this.expiresAt = config.expiresAt ? new Date(config.expiresAt) : null;
    this.status = config.status || 'active'; // active, expired, revoked
  }

  isExpired() {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  }
}

class DKIMSignature {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.messageId = config.messageId;
    this.domain = config.domain;
    this.selector = config.selector;
    this.signature = config.signature || '';
    this.algorithm = config.algorithm || 'rsa-sha256';
    this.signedAt = config.signedAt ? new Date(config.signedAt) : new Date();
    this.headers = config.headers || [];
  }
}

class DKIMManager {
  constructor() {
    this.keys = new Map();
    this.signatures = new Map();
    this.domains = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    const domains = [
      { domain: 'example.com', selector: 'default', keySize: 2048 },
      { domain: 'mail.company.com', selector: 'mail', keySize: 2048 },
      { domain: 'newsletter.brand.io', selector: 'news', keySize: 1024 }
    ];

    domains.forEach(d => {
      const key = new DKIMKey({
        domain: d.domain,
        selector: d.selector,
        privateKey: `PRIVATE_KEY_${d.domain}`,
        publicKey: `PUBLIC_KEY_${d.domain}`
      });
      this.keys.set(key.id, key);
      this.domains.set(`${d.selector}._domainkey.${d.domain}`, key);
    });
  }

  generateKeyPair(domain, selector = 'default', keySize = 2048) {
    const existing = this.getKey(domain, selector);
    if (existing) {
      throw new Error('Key already exists. Revoke first.');
    }

    const key = new DKIMKey({
      domain,
      selector,
      privateKey: `PRIVATE_KEY_${domain}_${Date.now()}`,
      publicKey: `PUBLIC_KEY_${domain}_${Date.now()}`
    });

    this.keys.set(key.id, key);
    this.domains.set(`${selector}._domainkey.${domain}`, key);
    return key;
  }

  getKey(domain, selector) {
    return this.domains.get(`${selector}._domainkey.${domain}`) || null;
  }

  signMessage(messageId, domain, selector, headers, body) {
    const key = this.getKey(domain, selector);
    if (!key) throw new Error('DKIM key not found');
    if (key.isExpired()) throw new Error('DKIM key expired');

    // Create DKIM signature header
    const signatureValue = `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${domain}; s=${selector}; h=from:to:subject:date; b=${Buffer.from(`SIGNED_${body}`).toString('base64')}`;

    const sig = new DKIMSignature({
      messageId,
      domain,
      selector,
      signature: signatureValue,
      headers
    });

    this.signatures.set(sig.id, sig);
    return sig;
  }

  verifySignature(messageId, domain, selector, headers, body) {
    const sig = Array.from(this.signatures.values()).find(s => s.messageId === messageId);
    if (!sig) return { valid: false, reason: 'Signature not found' };

    const key = this.getKey(domain, selector);
    if (!key) return { valid: false, reason: 'Key not found' };

    // Simplified verification (in production, use crypto)
    const expectedSig = `v=1; a=rsa-sha256; c=relaxed/relaxed; d=${domain}; s=${selector}`;
    const hasExpectedStart = sig.signature.startsWith(expectedSig);

    return {
      valid: hasExpectedStart && key.status === 'active',
      signature: sig,
      key
    };
  }

  revokeKey(domain, selector) {
    const key = this.getKey(domain, selector);
    if (!key) throw new Error('Key not found');

    key.status = 'revoked';
    return key;
  }

  rotateKey(domain, selector) {
    const oldKey = this.getKey(domain, selector);
    if (oldKey) {
      oldKey.status = 'revoked';
      // Remove old key from domain map to allow new key
      this.domains.delete(`${selector}._domainkey.${domain}`);
    }

    return this.generateKeyPair(domain, selector);
  }

  getDomainKeys(domain) {
    return Array.from(this.domains.values()).filter(k => k.domain === domain);
  }

  listSignatures(messageId = null) {
    if (messageId) {
      return Array.from(this.signatures.values()).filter(s => s.messageId === messageId);
    }
    return Array.from(this.signatures.values());
  }
}

function runDemo() {
  console.log('=== Agent DKIM Demo\n');

  const mgr = new DKIMManager();

  console.log('1. List Domain Keys:');
  const keys = mgr.getDomainKeys('example.com');
  console.log(`   example.com keys: ${keys.length}`);

  console.log('\n2. Sign Message:');
  const sig = mgr.signMessage('msg-123', 'example.com', 'default', ['From', 'To', 'Subject'], 'Email body content');
  console.log(`   Signed: ${sig.id}`);
  console.log(`   Domain: ${sig.domain}`);
  console.log(`   Selector: ${sig.selector}`);

  console.log('\n3. Verify Signature:');
  const result = mgr.verifySignature('msg-123', 'example.com', 'default', ['From', 'To', 'Subject'], 'Email body content');
  console.log(`   Valid: ${result.valid}`);
  if (result.reason) console.log(`   Reason: ${result.reason}`);

  console.log('\n4. Generate New Key:');
  const newKey = mgr.generateKeyPair('newdomain.com', 'new', 2048);
  console.log(`   Created: ${newKey.id}`);
  console.log(`   Domain: ${newKey.domain}`);
  console.log(`   Selector: ${newKey.selector}`);

  console.log('\n5. Rotate Key:');
  const rotated = mgr.rotateKey('newdomain.com', 'new');
  console.log(`   Rotated: ${rotated.id}`);

  console.log('\n6. Verify After Rotation:');
  const result2 = mgr.verifySignature('msg-123', 'newdomain.com', 'new', ['From'], 'body');
  console.log(`   Valid: ${result2.valid}`);

  console.log('\n7. List All Signatures:');
  const sigs = mgr.listSignatures();
  console.log(`   Total: ${sigs.length}`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new DKIMManager();

if (command === 'demo') runDemo();
else if (command === 'sign') {
  const [domain, selector, messageId] = args.slice(1);
  if (!domain || !messageId) {
    console.log('Usage: node agent-dkim.js sign <domain> <selector> <messageId>');
    process.exit(1);
  }
  const sig = mgr.signMessage(messageId, domain, selector || 'default', ['From', 'To'], 'Body');
  console.log(JSON.stringify(sig, null, 2));
}
else if (command === 'verify') {
  const [domain, selector, messageId] = args.slice(1);
  if (!domain || !messageId) {
    console.log('Usage: node agent-dkim.js verify <domain> <selector> <messageId>');
    process.exit(1);
  }
  const result = mgr.verifySignature(messageId, domain, selector || 'default', ['From', 'To'], 'Body');
  console.log(JSON.stringify(result, null, 2));
}
else console.log('Usage: node agent-dkim.js [demo|sign|verify]');
