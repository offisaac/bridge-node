/**
 * Agent TXT - TXT Record Management Module
 *
 * Handles TXT (Text) DNS records for domain verification, SPF, DKIM, etc.
 *
 * Usage: node agent-txt.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   create  - Create a TXT record
 *   list    - List TXT records
 *   delete  - Delete a TXT record
 */

class TXTRecord {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name; // Record name (e.g., '@', 'google._domainkey')
    this.value = config.value; // Text value
    this.zone = config.zone;
    this.ttl = config.ttl || 3600;
    this.purpose = config.purpose || 'general'; // spf, dkim, dmarc, verification, general
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
    this.updatedAt = config.updatedAt ? new Date(config.updatedAt) : new Date();
    this.status = config.status || 'active';
  }

  update(config) {
    if (config.value) this.value = config.value;
    if (config.ttl) this.ttl = config.ttl;
    if (config.status) this.status = config.status;
    this.updatedAt = new Date();
    return this;
  }
}

class TXTManager {
  constructor() {
    this.records = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    const sampleRecords = [
      { name: '@', value: 'v=spf1 include:_spf.google.com ~all', zone: 'example.com', purpose: 'spf', ttl: 3600 },
      { name: '@', value: 'v=spf1 mx -all', zone: 'company.com', purpose: 'spf', ttl: 3600 },
      { name: 'google._domainkey', value: 'v=DKIM1; k=rsa; p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC...', zone: 'example.com', purpose: 'dkim', ttl: 3600 },
      { name: '_dmarc', value: 'v=DMARC1; p=quarantine; rua=mailto:dmarc@example.com', zone: 'example.com', purpose: 'dmarc', ttl: 3600 },
      { name: '@', value: 'google-site-verification=abc123xyz789', zone: 'example.com', purpose: 'verification', ttl: 3600 }
    ];

    sampleRecords.forEach(r => {
      const record = new TXTRecord(r);
      this.records.set(record.id, record);
    });
  }

  create(name, value, zone, options = {}) {
    const record = new TXTRecord({
      name,
      value,
      zone,
      ttl: options.ttl || 3600,
      purpose: options.purpose || 'general'
    });

    this.records.set(record.id, record);
    return record;
  }

  findById(id) {
    return this.records.get(id) || null;
  }

  findByName(name, zone) {
    return Array.from(this.records.values()).filter(
      r => r.name === name && r.zone === zone && r.status === 'active'
    );
  }

  list(zone = null, purpose = null, includeDisabled = false) {
    let allRecords = Array.from(this.records.values());

    if (zone) {
      allRecords = allRecords.filter(r => r.zone === zone);
    }
    if (purpose) {
      allRecords = allRecords.filter(r => r.purpose === purpose);
    }
    if (!includeDisabled) {
      allRecords = allRecords.filter(r => r.status === 'active');
    }

    return allRecords;
  }

  // Get SPF record for a zone
  getSPF(zone) {
    return this.findByName('@', zone).find(r => r.purpose === 'spf') || null;
  }

  // Get DKIM selector record
  getDKIM(zone, selector = 'google') {
    return this.findByName(`${selector}._domainkey`, zone).find(r => r.purpose === 'dkim') || null;
  }

  // Get DMARC record
  getDMARC(zone) {
    return this.findByName('_dmarc', zone).find(r => r.purpose === 'dmarc') || null;
  }

  // Set SPF record (creates or updates)
  setSPF(zone, value, ttl = 3600) {
    const existing = this.getSPF(zone);
    if (existing) {
      return this.update(existing.id, { value, ttl });
    }
    return this.create('@', value, zone, { purpose: 'spf', ttl });
  }

  // Set DKIM record
  setDKIM(zone, selector, value, ttl = 3600) {
    const name = `${selector}._domainkey`;
    const existing = this.findByName(name, zone).find(r => r.purpose === 'dkim');
    if (existing) {
      return this.update(existing.id, { value, ttl });
    }
    return this.create(name, value, zone, { purpose: 'dkim', ttl });
  }

  // Set DMARC record
  setDMARC(zone, value, ttl = 3600) {
    const existing = this.getDMARC(zone);
    if (existing) {
      return this.update(existing.id, { value, ttl });
    }
    return this.create('_dmarc', value, zone, { purpose: 'dmarc', ttl });
  }

  // Verify SPF configuration
  verifySPF(zone) {
    const spf = this.getSPF(zone);
    if (!spf) {
      return { valid: false, issues: ['No SPF record found'] };
    }

    const issues = [];
    const value = spf.value;

    // Check for valid SPF syntax
    if (!value.startsWith('v=spf1')) {
      issues.push('SPF record must start with v=spf1');
    }

    // Check for too many DNS lookups (mechanism count)
    const mechanisms = value.match(/(include:|a:|mx:|redirect=|exp=)/g) || [];
    if (mechanisms.length > 10) {
      issues.push('SPF record has too many DNS lookups (>10)');
    }

    // Check for softfail/FAIL without all
    if (value.includes('~all') || value.includes('-all')) {
      // Good
    } else if (value.includes('~all') === false && value.includes('-all') === false) {
      issues.push('SPF record should end with ~all or -all');
    }

    return {
      valid: issues.length === 0,
      record: spf,
      issues
    };
  }

  // Verify DMARC configuration
  verifyDMARC(zone) {
    const dmarc = this.getDMARC(zone);
    if (!dmarc) {
      return { valid: false, issues: ['No DMARC record found'] };
    }

    const issues = [];
    const value = dmarc.value;

    if (!value.startsWith('v=DMARC1')) {
      issues.push('DMARC record must start with v=DMARC1');
    }

    // Check for policy
    if (!value.includes('p=')) {
      issues.push('DMARC record must specify policy (p=)');
    }

    return {
      valid: issues.length === 0,
      record: dmarc,
      issues
    };
  }

  update(id, updates) {
    const record = this.records.get(id);
    if (!record) {
      throw new Error('TXT record not found');
    }
    return record.update(updates);
  }

  delete(id) {
    const record = this.records.get(id);
    if (!record) {
      throw new Error('TXT record not found');
    }
    this.records.delete(id);
    return record;
  }

  // Export in Bind zone file format
  exportZoneFile(zone) {
    const records = this.list(zone, null, false);
    let output = `; Zone: ${zone}\n; Generated by Agent TXT\n\n`;

    records.forEach(r => {
      output += `${r.name} IN TXT "${r.value}"\n`;
    });

    return output;
  }
}

function runDemo() {
  console.log('=== Agent TXT Demo\n');

  const mgr = new TXTManager();

  console.log('1. List All TXT Records:');
  const allRecords = mgr.list();
  console.log(`   Total: ${allRecords.length}`);
  allRecords.forEach(r => console.log(`   - ${r.name}.${r.zone} [${r.purpose}]`));

  console.log('\n2. List by Zone:');
  const exampleRecords = mgr.list('example.com');
  console.log(`   example.com: ${exampleRecords.length}`);

  console.log('\n3. List by Purpose (SPF):');
  const spfRecords = mgr.list(null, 'spf');
  console.log(`   SPF records: ${spfRecords.length}`);

  console.log('\n4. Get SPF Record:');
  const spf = mgr.getSPF('example.com');
  console.log(`   SPF: ${spf ? spf.value.substring(0, 50) + '...' : 'Not found'}`);

  console.log('\n5. Get DMARC Record:');
  const dmarc = mgr.getDMARC('example.com');
  console.log(`   DMARC: ${dmarc ? dmarc.value : 'Not found'}`);

  console.log('\n6. Verify SPF:');
  const spfVerify = mgr.verifySPF('example.com');
  console.log(`   Valid: ${spfVerify.valid}`);
  if (spfVerify.issues.length > 0) {
    console.log(`   Issues: ${spfVerify.issues.join(', ')}`);
  }

  console.log('\n7. Verify DMARC:');
  const dmarcVerify = mgr.verifyDMARC('example.com');
  console.log(`   Valid: ${dmarcVerify.valid}`);

  console.log('\n8. Set SPF Record:');
  const newSPF = mgr.setSPF('newdomain.com', 'v=spf1 include:_spf.google.com ~all', 1800);
  console.log(`   Created: ${newSPF.name}.${newSPF.zone}`);

  console.log('\n9. Set DMARC Record:');
  const newDMARC = mgr.setDMARC('newdomain.com', 'v=DMARC1; p=quarantine; rua=mailto:dmarc@newdomain.com');
  console.log(`   Created: ${newDMARC.name}.${newDMARC.zone}`);

  console.log('\n10. Create Verification Record:');
  const verify = mgr.create('@', 'verification=abc123xyz', 'newdomain.com', { purpose: 'verification' });
  console.log(`    Created: ${verify.name}.${verify.zone}`);

  console.log('\n11. Export Zone File:');
  const zoneFile = mgr.exportZoneFile('example.com');
  console.log(zoneFile);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new TXTManager();

if (command === 'demo') runDemo();
else if (command === 'create') {
  const [name, value, zone, purpose, ttl] = args.slice(1);
  if (!name || !value || !zone) {
    console.log('Usage: node agent-txt.js create <name> <value> <zone> [purpose] [ttl]');
    process.exit(1);
  }
  const record = mgr.create(name, value, zone, { purpose, ttl: ttl ? parseInt(ttl) : undefined });
  console.log(JSON.stringify(record, null, 2));
}
else if (command === 'list') {
  const [zone, purpose] = args.slice(1);
  const records = mgr.list(zone || null, purpose || null);
  console.log(JSON.stringify(records, null, 2));
}
else if (command === 'delete') {
  const [id] = args.slice(1);
  if (!id) {
    console.log('Usage: node agent-txt.js delete <id>');
    process.exit(1);
  }
  try {
    const record = mgr.delete(id);
    console.log(`Deleted: ${record.name}.${record.zone}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
else console.log('Usage: node agent-txt.js [demo|create|list|delete]');
