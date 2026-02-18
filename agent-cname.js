/**
 * Agent CNAME - CNAME Record Management Module
 *
 * Handles CNAME (Canonical Name) DNS records for domain aliasing.
 *
 * Usage: node agent-cname.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   create  - Create a CNAME record
 *   list    - List CNAME records
 *   delete  - Delete a CNAME record
 */

class CNAMERecord {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name; // Alias (e.g., 'www', 'blog')
    this.target = config.target; // Canonical domain (e.g., 'example.com')
    this.zone = config.zone;
    this.ttl = config.ttl || 3600; // Default 1 hour
    this.proxied = config.proxied || false; // For Cloudflare-style proxy
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
    this.updatedAt = config.updatedAt ? new Date(config.updatedAt) : new Date();
    this.status = config.status || 'active'; // active, disabled
  }

  update(config) {
    if (config.target) this.target = config.target;
    if (config.ttl) this.ttl = config.ttl;
    if (config.proxied !== undefined) this.proxied = config.proxied;
    if (config.status) this.status = config.status;
    this.updatedAt = new Date();
    return this;
  }
}

class CNAMEManager {
  constructor() {
    this.records = new Map();
    this.zones = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    const sampleRecords = [
      { name: 'www', target: 'example.com', zone: 'example.com', ttl: 3600 },
      { name: 'blog', target: 'ghost.example.com', zone: 'example.com', ttl: 3600 },
      { name: 'api', target: 'api-prod.us-east-1.elb.amazonaws.com', zone: 'example.com', ttl: 300 },
      { name: 'mail', target: 'ghs.googlehosted.com', zone: 'company.com', ttl: 3600 }
    ];

    sampleRecords.forEach(r => {
      const record = new CNAMERecord(r);
      this.records.set(record.id, record);
    });
  }

  create(name, target, zone, options = {}) {
    // Check for existing record
    const existing = this.findByName(name, zone);
    if (existing) {
      throw new Error(`CNAME record already exists for ${name}.${zone}`);
    }

    // Validate target is a valid domain
    if (!target || target.length === 0) {
      throw new Error('Target domain is required');
    }

    const record = new CNAMERecord({
      name,
      target,
      zone,
      ttl: options.ttl || 3600,
      proxied: options.proxied || false
    });

    this.records.set(record.id, record);
    return record;
  }

  findById(id) {
    return this.records.get(id) || null;
  }

  findByName(name, zone) {
    return Array.from(this.records.values()).find(
      r => r.name === name && r.zone === zone && r.status === 'active'
    ) || null;
  }

  list(zone = null, includeDisabled = false) {
    let allRecords = Array.from(this.records.values());
    if (zone) {
      allRecords = allRecords.filter(r => r.zone === zone);
    }
    if (!includeDisabled) {
      allRecords = allRecords.filter(r => r.status === 'active');
    }
    return allRecords;
  }

  update(id, updates) {
    const record = this.records.get(id);
    if (!record) {
      throw new Error('CNAME record not found');
    }
    return record.update(updates);
  }

  delete(id) {
    const record = this.records.get(id);
    if (!record) {
      throw new Error('CNAME record not found');
    }
    this.records.delete(id);
    return record;
  }

  enable(id) {
    const record = this.records.get(id);
    if (!record) {
      throw new Error('CNAME record not found');
    }
    record.status = 'active';
    record.updatedAt = new Date();
    return record;
  }

  disable(id) {
    const record = this.records.get(id);
    if (!record) {
      throw new Error('CNAME record not found');
    }
    record.status = 'disabled';
    record.updatedAt = new Date();
    return record;
  }

  // Batch operations
  bulkCreate(zone, records) {
    const results = [];
    records.forEach(r => {
      try {
        const record = this.create(r.name, r.target, zone, r.options || {});
        results.push({ name: r.name, success: true, id: record.id });
      } catch (e) {
        results.push({ name: r.name, success: false, reason: e.message });
      }
    });
    return results;
  }

  // Lookup with wildcard support
  resolve(name, zone) {
    // Try exact match first
    let record = this.findByName(name, zone);
    if (record) return record;

    // Try wildcard
    const wildcard = this.findByName('*', zone);
    if (wildcard) return wildcard;

    return null;
  }

  // Health check - verify targets are reachable
  async healthCheck() {
    const activeRecords = this.list(null, false);
    const results = [];

    for (const record of activeRecords) {
      // Simplified health check - in production would ping the target
      results.push({
        id: record.id,
        name: record.name,
        target: record.target,
        status: 'healthy', // Would be 'unhealthy' if target unreachable
        checkedAt: new Date()
      });
    }
    return results;
  }

  // Export in Bind zone file format
  exportZoneFile(zone) {
    const records = this.list(zone, false);
    let output = `; Zone: ${zone}\n; Generated by Agent CNAME\n\n`;

    records.forEach(r => {
      output += `${r.name} IN CNAME ${r.target}\n`;
    });

    return output;
  }
}

function runDemo() {
  console.log('=== Agent CNAME Demo\n');

  const mgr = new CNAMEManager();

  console.log('1. List All CNAME Records:');
  const allRecords = mgr.list();
  console.log(`   Total: ${allRecords.length}`);
  allRecords.forEach(r => console.log(`   - ${r.name}.${r.zone} -> ${r.target}`));

  console.log('\n2. List by Zone:');
  const exampleRecords = mgr.list('example.com');
  console.log(`   example.com: ${exampleRecords.length}`);

  console.log('\n3. Create New CNAME:');
  const newRec = mgr.create('shop', 'store.myshopify.com', 'example.com', { ttl: 600 });
  console.log(`   Created: ${newRec.name}.${newRec.zone} -> ${newRec.target}`);
  console.log(`   ID: ${newRec.id}`);

  console.log('\n4. Find CNAME:');
  const found = mgr.findByName('www', 'example.com');
  console.log(`   Found: ${found.name}.${found.zone} -> ${found.target}`);

  console.log('\n5. Update CNAME:');
  const updated = mgr.update(newRec.id, { target: 'new-store.myshopify.com', ttl: 300 });
  console.log(`   Updated: ${updated.target} (TTL: ${updated.ttl})`);

  console.log('\n6. Resolve (with wildcard):');
  const resolved = mgr.resolve('shop', 'example.com');
  console.log(`   Resolved: ${resolved.name}.${resolved.zone} -> ${resolved.target}`);

  console.log('\n7. Disable CNAME:');
  const disabled = mgr.disable(newRec.id);
  console.log(`   Disabled: ${disabled.name}.${disabled.zone} (status: ${disabled.status})`);

  console.log('\n8. Bulk Create:');
  const bulkResults = mgr.bulkCreate('test.com', [
    { name: 'www', target: 'test.com', options: { ttl: 3600 } },
    { name: 'api', target: 'api.test.com', options: { ttl: 300 } },
    { name: 'blog', target: 'ghost.test.com' }
  ]);
  console.log(`   Created: ${bulkResults.filter(r => r.success).length}/${bulkResults.length}`);

  console.log('\n9. Export Zone File:');
  const zoneFile = mgr.exportZoneFile('example.com');
  console.log(zoneFile);

  console.log('10. Health Check:');
  const health = mgr.healthCheck();
  console.log(`    Checked: ${health.length} records`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new CNAMEManager();

if (command === 'demo') runDemo();
else if (command === 'create') {
  const [name, target, zone, ttl, proxied] = args.slice(1);
  if (!name || !target || !zone) {
    console.log('Usage: node agent-cname.js create <name> <target> <zone> [ttl] [proxied]');
    process.exit(1);
  }
  const record = mgr.create(name, target, zone, { ttl: ttl ? parseInt(ttl) : undefined, proxied: proxied === 'true' });
  console.log(JSON.stringify(record, null, 2));
}
else if (command === 'list') {
  const [zone] = args.slice(1);
  const records = mgr.list(zone || null);
  console.log(JSON.stringify(records, null, 2));
}
else if (command === 'delete') {
  const [id] = args.slice(1);
  if (!id) {
    console.log('Usage: node agent-cname.js delete <id>');
    process.exit(1);
  }
  try {
    const record = mgr.delete(id);
    console.log(`Deleted: ${record.name}.${record.zone}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
else console.log('Usage: node agent-cname.js [demo|create|list|delete]');
