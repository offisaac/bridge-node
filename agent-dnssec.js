/**
 * Agent DNSSEC - DNSSEC Signing Module
 *
 * Handles DNSSEC (Domain Name System Security Extensions) for DNS security.
 *
 * Usage: node agent-dnssec.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   sign    - Sign a zone
 *   verify  - Verify signatures
 */

class DNSSECKey {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.zone = config.zone;
    this.keyType = config.keyType || 'ZSK'; // ZSK (Zone Signing Key) or KSK (Key Signing Key)
    this.algorithm = config.algorithm || 13; // ECDSA P-256 SHA-256
    this.keyTag = config.keyTag || this._calculateKeyTag();
    this.flags = config.flags || (this.keyType === 'KSK' ? 257 : 256);
    this.publicKey = config.publicKey || null;
    this.privateKey = config.privateKey || null;
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
    this.expiresAt = config.expiresAt || null;
    this.status = config.status || 'active'; // active, expired, revoked
  }

  _calculateKeyTag() {
    // Simplified key tag calculation
    const keyStr = `${this.zone}:${this.keyType}:${this.algorithm}`;
    let sum = 0;
    for (let i = 0; i < keyStr.length; i++) {
      sum += keyStr.charCodeAt(i);
    }
    return sum % 65536;
  }

  isExpired() {
    if (!this.expiresAt) return false;
    return new Date() > new Date(this.expiresAt);
  }
}

class DNSSECSignature {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.recordName = config.recordName;
    this.recordType = config.recordType;
    this.signature = config.signature || '';
    this.signerKeyId = config.signerKeyId;
    this.signedAt = config.signedAt ? new Date(config.signedAt) : new Date();
    this.expiresAt = config.expiresAt ? new Date(config.expiresAt) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // Default 7 days
    this.validator = config.validator || 'ECDSA';
  }

  isExpired() {
    return new Date() > this.expiresAt;
  }
}

class DNSSECManager {
  constructor() {
    this.keys = new Map();
    this.signatures = new Map();
    this.zones = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    const zones = [
      { zone: 'example.com', keyType: 'ZSK', algorithm: 13 },
      { zone: 'example.com', keyType: 'KSK', algorithm: 13 },
      { zone: 'mail.company.com', keyType: 'ZSK', algorithm: 13 },
      { zone: 'mail.company.com', keyType: 'KSK', algorithm: 13 }
    ];

    zones.forEach(z => {
      const key = new DNSSECKey({
        zone: z.zone,
        keyType: z.keyType,
        algorithm: z.algorithm,
        publicKey: `PUBLIC_KEY_${z.zone}_${z.keyType}`,
        privateKey: `PRIVATE_KEY_${z.zone}_${z.keyType}`
      });
      this.keys.set(key.id, key);
    });
  }

  generateKeyPair(zone, keyType = 'ZSK', algorithm = 13) {
    const existingKey = Array.from(this.keys.values()).find(
      k => k.zone === zone && k.keyType === keyType && k.status === 'active'
    );
    if (existingKey) {
      throw new Error('Key already exists. Revoke first.');
    }

    const key = new DNSSECKey({
      zone,
      keyType,
      algorithm,
      publicKey: `PUBLIC_KEY_${zone}_${keyType}_${Date.now()}`,
      privateKey: `PRIVATE_KEY_${zone}_${keyType}_${Date.now()}`,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });

    this.keys.set(key.id, key);
    return key;
  }

  getKeys(zone, keyType = null) {
    const allKeys = Array.from(this.keys.values()).filter(k => k.zone === zone);
    if (keyType) {
      return allKeys.filter(k => k.keyType === keyType);
    }
    return allKeys;
  }

  signRecord(recordName, recordType, zone) {
    const zsk = this.getKeys(zone, 'ZSK').find(k => k.status === 'active');
    if (!zsk) throw new Error('No active ZSK found for zone');

    const existingSig = Array.from(this.signatures.values()).find(
      s => s.recordName === recordName && s.recordType === recordType
    );
    if (existingSig) {
      throw new Error('Signature already exists. Re-sign or verify existing.');
    }

    const sig = new DNSSECSignature({
      recordName,
      recordType,
      signerKeyId: zsk.id,
      signature: `RRSIG_${recordType}_${zsk.publicKey}_${Date.now()}`
    });

    this.signatures.set(sig.id, sig);
    return sig;
  }

  verifySignature(recordName, recordType, zone) {
    const sig = Array.from(this.signatures.values()).find(
      s => s.recordName === recordName && s.recordType === recordType
    );
    if (!sig) return { valid: false, reason: 'Signature not found' };

    const key = this.keys.get(sig.signerKeyId);
    if (!key) return { valid: false, reason: 'Signing key not found' };
    if (key.status !== 'active') return { valid: false, reason: 'Signing key not active' };
    if (key.isExpired()) return { valid: false, reason: 'Signing key expired' };
    if (sig.isExpired()) return { valid: false, reason: 'Signature expired' };

    // Simplified verification (in production, use crypto)
    const hasValidFormat = sig.signature.startsWith('RRSIG_');

    return {
      valid: hasValidFormat && key.status === 'active',
      signature: sig,
      key
    };
  }

  signZone(zone) {
    const records = [
      { name: '@', type: 'SOA' },
      { name: '@', type: 'NS' },
      { name: 'www', type: 'A' },
      { name: 'mail', type: 'A' },
      { name: '@', type: 'MX' }
    ];

    const results = [];
    records.forEach(rec => {
      try {
        const sig = this.signRecord(rec.name, rec.type, zone);
        results.push({ record: `${rec.name} ${rec.type}`, signed: true, signatureId: sig.id });
      } catch (e) {
        results.push({ record: `${rec.name} ${rec.type}`, signed: false, reason: e.message });
      }
    });
    return results;
  }

  getDSRecords(zone) {
    const ksk = this.getKeys(zone, 'KSK').find(k => k.status === 'active');
    if (!ksk) return [];

    // Simplified DS record generation
    return [{
      zone,
      keyTag: ksk.keyTag,
      algorithm: ksk.algorithm,
      digestType: 2, // SHA-256
      digest: `DS_DIGEST_${ksk.id}`
    }];
  }

  revokeKey(zone, keyType) {
    const key = this.getKeys(zone, keyType).find(k => k.status === 'active');
    if (!key) throw new Error('Key not found');
    key.status = 'revoked';
    return key;
  }

  rotateKey(zone, keyType) {
    const oldKey = this.getKeys(zone, keyType).find(k => k.status === 'active');
    if (oldKey) {
      oldKey.status = 'revoked';
    }
    return this.generateKeyPair(zone, keyType);
  }

  listSignatures(zone = null) {
    let allSigs = Array.from(this.signatures.values());
    if (zone) {
      const zoneKeys = this.getKeys(zone).map(k => k.id);
      allSigs = allSigs.filter(s => zoneKeys.includes(s.signerKeyId));
    }
    return allSigs;
  }
}

function runDemo() {
  console.log('=== Agent DNSSEC Demo\n');

  const mgr = new DNSSECManager();

  console.log('1. List Zone Keys:');
  const keys = mgr.getKeys('example.com');
  console.log(`   example.com keys: ${keys.length}`);
  keys.forEach(k => console.log(`   - ${k.keyType}: ${k.id.substring(0, 8)} (${k.status})`));

  console.log('\n2. Sign DNS Record:');
  const sig = mgr.signRecord('www', 'A', 'example.com');
  console.log(`   Signed: ${sig.id}`);
  console.log(`   Record: ${sig.recordName} ${sig.recordType}`);
  console.log(`   Expires: ${sig.expiresAt}`);

  console.log('\n3. Verify Signature:');
  const result = mgr.verifySignature('www', 'A', 'example.com');
  console.log(`   Valid: ${result.valid}`);
  if (result.reason) console.log(`   Reason: ${result.reason}`);

  console.log('\n4. Sign Entire Zone:');
  const zoneResults = mgr.signZone('mail.company.com');
  console.log(`   Signed ${zoneResults.filter(r => r.signed).length} records`);
  zoneResults.forEach(r => console.log(`   - ${r.record}: ${r.signed ? 'OK' : r.reason}`));

  console.log('\n5. Get DS Records:');
  const dsRecords = mgr.getDSRecords('example.com');
  console.log(`   DS records: ${dsRecords.length}`);
  dsRecords.forEach(ds => console.log(`   - KeyTag: ${ds.keyTag}, Algorithm: ${ds.algorithm}`));

  console.log('\n6. Generate New Key:');
  const newKey = mgr.generateKeyPair('newdomain.com', 'ZSK', 13);
  console.log(`   Created: ${newKey.id}`);
  console.log(`   Zone: ${newKey.zone}`);
  console.log(`   Type: ${newKey.keyType}`);

  console.log('\n7. Rotate Key:');
  const rotated = mgr.rotateKey('newdomain.com', 'ZSK');
  console.log(`   Rotated: ${rotated.id}`);

  console.log('\n8. List All Signatures:');
  const sigs = mgr.listSignatures();
  console.log(`   Total: ${sigs.length}`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new DNSSECManager();

if (command === 'demo') runDemo();
else if (command === 'sign') {
  const [zone, recordName, recordType] = args.slice(1);
  if (!zone || !recordName || !recordType) {
    console.log('Usage: node agent-dnssec.js sign <zone> <recordName> <recordType>');
    process.exit(1);
  }
  const sig = mgr.signRecord(recordName, recordType, zone);
  console.log(JSON.stringify(sig, null, 2));
}
else if (command === 'verify') {
  const [zone, recordName, recordType] = args.slice(1);
  if (!zone || !recordName || !recordType) {
    console.log('Usage: node agent-dnssec.js verify <zone> <recordName> <recordType>');
    process.exit(1);
  }
  const result = mgr.verifySignature(recordName, recordType, zone);
  console.log(JSON.stringify(result, null, 2));
}
else console.log('Usage: node agent-dnssec.js [demo|sign|verify]');
