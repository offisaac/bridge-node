/**
 * Agent WHOIS - WHOIS Lookup Module
 *
 * Handles WHOIS lookups for domain registration information.
 *
 * Usage: node agent-whois.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   lookup  - Lookup domain info
 *   history - Get domain history
 */

class WHOISRecord {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.domain = config.domain;
    this.registrar = config.registrar || null;
    this.registrant = config.registrant || null;
    this.createdDate = config.createdDate ? new Date(config.createdDate) : null;
    this.expiryDate = config.expiryDate ? new Date(config.expiryDate) : null;
    this.updatedDate = config.updatedDate ? new Date(config.updatedDate) : null;
    this.nameServers = config.nameServers || [];
    this.status = config.status || [];
    this.DNSSEC = config.DNSSEC || false;
    this.lookups = config.lookups || 0;
    this.lastChecked = config.lastChecked ? new Date(config.lastChecked) : new Date();
  }
}

class WHOISHistoryEntry {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.domain = config.domain;
    this.event = config.event; // created, updated, expired, transferred
    this.date = config.date ? new Date(config.date) : new Date();
    this.registrar = config.registrar || null;
    this.details = config.details || {};
  }
}

class WHOISManager {
  constructor() {
    this.records = new Map();
    this.history = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    const sampleDomains = [
      {
        domain: 'example.com',
        registrar: 'Example Registrar, Inc.',
        registrant: 'Example Inc.',
        createdDate: '2020-01-15',
        expiryDate: '2028-01-15',
        updatedDate: '2025-06-20',
        nameServers: ['ns1.example.com', 'ns2.example.com'],
        status: ['clientTransferProhibited', 'serverDeleteProhibited']
      },
      {
        domain: 'google.com',
        registrar: 'MarkMonitor Inc.',
        registrant: 'Google LLC',
        createdDate: '1997-09-15',
        expiryDate: '2028-09-14',
        updatedDate: '2025-01-10',
        nameServers: ['ns1.google.com', 'ns2.google.com', 'ns3.google.com', 'ns4.google.com'],
        status: ['clientUpdateProhibited', 'clientTransferProhibited']
      },
      {
        domain: 'cloudflare.com',
        registrar: 'Cloudflare, Inc.',
        registrant: 'Cloudflare, Inc.',
        createdDate: '2010-03-18',
        expiryDate: '2028-03-18',
        updatedDate: '2025-02-01',
        nameServers: ['ns1.cloudflare.com', 'ns2.cloudflare.com', 'ns3.cloudflare.com'],
        status: ['clientTransferProhibited']
      }
    ];

    sampleDomains.forEach(d => {
      const record = new WHOISRecord(d);
      this.records.set(record.domain, record);
    });

    // Sample history
    const sampleHistory = [
      { domain: 'example.com', event: 'created', date: '2020-01-15', registrar: 'Example Registrar, Inc.' },
      { domain: 'example.com', event: 'updated', date: '2023-03-10', registrar: 'Example Registrar, Inc.' },
      { domain: 'example.com', event: 'updated', date: '2025-06-20', registrar: 'Example Registrar, Inc.' },
      { domain: 'google.com', event: 'created', date: '1997-09-15', registrar: 'Network Solutions' },
      { domain: 'google.com', event: 'transferred', date: '2019-10-01', registrar: 'MarkMonitor Inc.' }
    ];

    sampleHistory.forEach(h => {
      const entry = new WHOISHistoryEntry(h);
      this.history.set(entry.id, entry);
    });
  }

  lookup(domain) {
    // Check cache first
    const cached = this.records.get(domain.toLowerCase());
    if (cached) {
      cached.lookups += 1;
      cached.lastChecked = new Date();
      return cached;
    }

    // Simulate WHOIS lookup
    const registrarNames = ['GoDaddy.com', 'Namecheap', 'Cloudflare', 'Name.com', 'Domain.com'];
    const registrantOrgs = ['Tech Corp', 'Startup Inc', 'Digital Ltd', 'Online Services', 'Web Solutions'];

    const record = new WHOISRecord({
      domain: domain.toLowerCase(),
      registrar: registrarNames[Math.floor(Math.random() * registrarNames.length)],
      registrant: registrantOrgs[Math.floor(Math.random() * registrantOrgs.length)],
      createdDate: this._randomDate(2015, 2023),
      expiryDate: this._randomDate(2026, 2030),
      updatedDate: this._randomDate(2024, 2025),
      nameServers: [
        `ns1.${domain.toLowerCase()}`,
        `ns2.${domain.toLowerCase()}`
      ],
      status: ['clientTransferProhibited'],
      lookups: 1,
      lastChecked: new Date()
    });

    this.records.set(record.domain, record);
    return record;
  }

  _randomDate(startYear, endYear) {
    const start = new Date(startYear, 0, 1);
    const end = new Date(endYear, 11, 31);
    const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
    return date.toISOString().split('T')[0];
  }

  getHistory(domain) {
    return Array.from(this.history.values())
      .filter(h => h.domain === domain.toLowerCase())
      .sort((a, b) => b.date - a.date);
  }

  addHistoryEntry(domain, event, details = {}) {
    const entry = new WHOISHistoryEntry({
      domain: domain.toLowerCase(),
      event,
      date: new Date(),
      details
    });
    this.history.set(entry.id, entry);
    return entry;
  }

  // Check domain availability
  checkAvailability(domain) {
    const exists = this.records.has(domain.toLowerCase());
    return {
      domain: domain.toLowerCase(),
      available: !exists,
      checkedAt: new Date()
    };
  }

  // Get expiring domains
  getExpiringDomains(days = 30) {
    const now = new Date();
    const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return Array.from(this.records.values())
      .filter(r => {
        if (!r.expiryDate) return false;
        const expiry = new Date(r.expiryDate);
        return expiry > now && expiry <= threshold;
      })
      .map(r => ({
        domain: r.domain,
        expiryDate: r.expiryDate,
        daysUntilExpiry: Math.ceil((new Date(r.expiryDate) - now) / (1000 * 60 * 60 * 24))
      }));
  }

  // Compare domains
  compare(domains) {
    return domains.map(d => this.lookup(d));
  }

  // Get domain statistics
  getStats() {
    const records = Array.from(this.records.values());
    return {
      totalDomains: records.length,
      totalLookups: records.reduce((sum, r) => sum + r.lookups, 0),
      avgLookupsPerDomain: records.length > 0
        ? (records.reduce((sum, r) => sum + r.lookups, 0) / records.length).toFixed(2)
        : 0,
      lastLookup: records.length > 0
        ? records.sort((a, b) => b.lastChecked - a.lastChecked)[0].lastChecked
        : null
    };
  }
}

function runDemo() {
  console.log('=== Agent WHOIS Demo\n');

  const mgr = new WHOISManager();

  console.log('1. Lookup Existing Domain:');
  const example = mgr.lookup('example.com');
  console.log(`   Domain: ${example.domain}`);
  console.log(`   Registrar: ${example.registrar}`);
  console.log(`   Created: ${example.createdDate}`);
  console.log(`   Expiry: ${example.expiryDate}`);

  console.log('\n2. Lookup New Domain:');
  const newDomain = mgr.lookup('newdomain.org');
  console.log(`   Domain: ${newDomain.domain}`);
  console.log(`   Registrar: ${newDomain.registrar}`);
  console.log(`   Expiry: ${newDomain.expiryDate}`);

  console.log('\n3. Check Availability:');
  const check1 = mgr.checkAvailability('example.com');
  console.log(`   example.com: ${check1.available ? 'Available' : 'Taken'}`);
  const check2 = mgr.checkAvailability('unused-domain-12345.com');
  console.log(`   unused-domain-12345.com: ${check2.available ? 'Available' : 'Taken'}`);

  console.log('\n4. Get Domain History:');
  const history = mgr.getHistory('example.com');
  console.log(`   History entries: ${history.length}`);
  history.forEach(h => console.log(`   - ${h.date}: ${h.event}`));

  console.log('\n5. Add History Entry:');
  const newEntry = mgr.addHistoryEntry('newdomain.org', 'transferred', { from: 'Old Registrar', to: 'New Registrar' });
  console.log(`   Added: ${newEntry.event} on ${newEntry.date}`);

  console.log('\n6. Get Expiring Domains:');
  const expiring = mgr.getExpiringDomains(365);
  console.log(`   Expiring within 365 days: ${expiring.length}`);

  console.log('\n7. Compare Domains:');
  const comparison = mgr.compare(['google.com', 'cloudflare.com', 'amazon.com']);
  console.log(`   Compared: ${comparison.map(c => c.domain).join(', ')}`);

  console.log('\n8. Get Statistics:');
  const stats = mgr.getStats();
  console.log(`   Total domains: ${stats.totalDomains}`);
  console.log(`   Total lookups: ${stats.totalLookups}`);
  console.log(`   Avg lookups/domain: ${stats.avgLookupsPerDomain}`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new WHOISManager();

if (command === 'demo') runDemo();
else if (command === 'lookup') {
  const [domain] = args.slice(1);
  if (!domain) {
    console.log('Usage: node agent-whois.js lookup <domain>');
    process.exit(1);
  }
  const result = mgr.lookup(domain);
  console.log(JSON.stringify(result, (key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  }, 2));
}
else if (command === 'history') {
  const [domain] = args.slice(1);
  if (!domain) {
    console.log('Usage: node agent-whois.js history <domain>');
    process.exit(1);
  }
  const result = mgr.getHistory(domain);
  console.log(JSON.stringify(result, (key, value) => {
    if (value instanceof Date) return value.toISOString();
    return value;
  }, 2));
}
else console.log('Usage: node agent-whois.js [demo|lookup|history]');
