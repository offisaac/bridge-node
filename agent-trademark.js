/**
 * Agent Trademark - Trademark Check Module
 *
 * Checks domain names for trademark conflicts and brand protection.
 *
 * Usage: node agent-trademark.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   check      - Check a domain for trademark issues
 *   report     - Generate trademark report
 */

class TrademarkRecord {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.registrationNumber = config.registrationNumber || null;
    this.registrationDate = config.registrationDate ? new Date(config.registrationDate) : null;
    this.expiryDate = config.expiryDate ? new Date(config.expiryDate) : null;
    this.owner = config.owner || null;
    this.status = config.status || 'registered'; // registered, pending, expired, cancelled
    this.classes = config.classes || []; // Nice classes (1-45)
    this.description = config.description || '';
  }

  isExpired() {
    if (!this.expiryDate) return false;
    return new Date() > this.expiryDate;
  }
}

class DomainTrademarkCheck {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.domain = config.domain;
    this.timestamp = config.timestamp ? new Date(config.timestamp) : new Date();
    this.matches = config.matches || [];
    this.riskLevel = config.riskLevel || 'low'; // low, medium, high, critical
    this.riskScore = config.riskScore || 0; // 0-100
  }
}

class TrademarkManager {
  constructor() {
    this.trademarks = new Map();
    this.checks = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    const sampleTrademarks = [
      {
        name: 'GOOGLE',
        registrationNumber: 'US-TM-123456',
        registrationDate: '2003-09-15',
        expiryDate: '2028-09-15',
        owner: 'Google LLC',
        status: 'registered',
        classes: [9, 35, 38, 42],
        description: 'Computer software, search engine services'
      },
      {
        name: 'APPLE',
        registrationNumber: 'US-TM-789012',
        registrationDate: '1980-01-15',
        expiryDate: '2030-01-15',
        owner: 'Apple Inc.',
        status: 'registered',
        classes: [9, 14, 18, 25, 28],
        description: 'Computers, phones, watches, electronics'
      },
      {
        name: 'AMAZON',
        registrationNumber: 'US-TM-345678',
        registrationDate: '1995-11-15',
        expiryDate: '2029-11-15',
        owner: 'Amazon Technologies, Inc.',
        status: 'registered',
        classes: [9, 35, 36, 38, 39, 41, 42],
        description: 'E-commerce,云计算, entertainment'
      },
      {
        name: 'MICROSOFT',
        registrationNumber: 'US-TM-901234',
        registrationDate: '1985-04-25',
        expiryDate: '2028-04-25',
        owner: 'Microsoft Corporation',
        status: 'registered',
        classes: [9, 35, 41, 42],
        description: 'Software, cloud services'
      },
      {
        name: 'FACEBOOK',
        registrationNumber: 'US-TM-567890',
        registrationDate: '2010-03-15',
        expiryDate: '2030-03-15',
        owner: 'Meta Platforms, Inc.',
        status: 'registered',
        classes: [9, 35, 38, 41, 42, 45],
        description: 'Social networking services'
      },
      {
        name: 'TESLA',
        registrationNumber: 'US-TM-111222',
        registrationDate: '2017-06-20',
        expiryDate: '2027-06-20',
        owner: 'Tesla, Inc.',
        status: 'registered',
        classes: [12, 35, 37, 42],
        description: 'Electric vehicles, energy products'
      }
    ];

    sampleTrademarks.forEach(t => {
      const tm = new TrademarkRecord(t);
      this.trademarks.set(tm.name, tm);
    });
  }

  // Check domain for trademark conflicts
  checkDomain(domain) {
    // Extract main part of domain (without TLD)
    const domainName = domain.replace(/\.[a-z]+$/i, '').toUpperCase();
    const matches = [];

    // Check exact match
    const exactMatch = this.trademarks.get(domainName);
    if (exactMatch) {
      matches.push({
        type: 'exact',
        trademark: exactMatch,
        relevance: 100
      });
    }

    // Check partial matches (contains)
    Array.from(this.trademarks.values()).forEach(tm => {
      if (tm.name !== domainName) {
        // Check if domain contains trademark
        if (domainName.includes(tm.name)) {
          matches.push({
            type: 'contains',
            trademark: tm,
            relevance: 80
          });
        }
        // Check if trademark contains domain
        else if (tm.name.includes(domainName) && domainName.length > 3) {
          matches.push({
            type: 'similar',
            trademark: tm,
            relevance: 70
          });
        }
        // Check for close similarity
        else if (this._calculateSimilarity(domainName, tm.name) > 0.6) {
          matches.push({
            type: 'similar',
            trademark: tm,
            relevance: Math.round(this._calculateSimilarity(domainName, tm.name) * 60)
          });
        }
      }
    });

    // Calculate risk
    const maxRelevance = matches.length > 0
      ? Math.max(...matches.map(m => m.relevance))
      : 0;

    let riskLevel = 'low';
    let riskScore = 0;

    if (maxRelevance >= 100) {
      riskLevel = 'critical';
      riskScore = 95;
    } else if (maxRelevance >= 80) {
      riskLevel = 'high';
      riskScore = 75;
    } else if (maxRelevance >= 60) {
      riskLevel = 'medium';
      riskScore = 50;
    }

    const check = new DomainTrademarkCheck({
      domain,
      matches,
      riskLevel,
      riskScore
    });

    this.checks.set(check.id, check);
    return check;
  }

  _calculateSimilarity(str1, str2) {
    // Simplified Levenshtein-based similarity
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    const editDistance = this._levenshtein(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  _levenshtein(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2[i - 1] === str1[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  // Search trademarks by name
  searchTrademarks(query) {
    const queryUpper = query.toUpperCase();
    return Array.from(this.trademarks.values())
      .filter(tm => tm.name.includes(queryUpper))
      .sort((a, b) => b.name.length - a.name.length);
  }

  // Get trademark details
  getTrademark(name) {
    return this.trademarks.get(name.toUpperCase()) || null;
  }

  // Register new trademark (for tracking)
  registerTrademark(data) {
    const tm = new TrademarkRecord({
      name: data.name.toUpperCase(),
      registrationNumber: data.registrationNumber,
      registrationDate: data.registrationDate,
      expiryDate: data.expiryDate,
      owner: data.owner,
      status: data.status || 'registered',
      classes: data.classes || [],
      description: data.description || ''
    });

    this.trademarks.set(tm.name, tm);
    return tm;
  }

  // Get check history
  getHistory(domain = null) {
    let allChecks = Array.from(this.checks.values());

    if (domain) {
      allChecks = allChecks.filter(c => c.domain === domain);
    }

    return allChecks.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Get statistics
  getStats() {
    const allChecks = Array.from(this.checks.values());
    const total = allChecks.length;
    const critical = allChecks.filter(c => c.riskLevel === 'critical').length;
    const high = allChecks.filter(c => c.riskLevel === 'high').length;
    const medium = allChecks.filter(c => c.riskLevel === 'medium').length;

    return {
      totalChecks: total,
      critical,
      high,
      medium,
      low: total - critical - high - medium,
      riskDistribution: {
        critical: total > 0 ? (critical / total * 100).toFixed(1) + '%' : '0%',
        high: total > 0 ? (high / total * 100).toFixed(1) + '%' : '0%',
        medium: total > 0 ? (medium / total * 100).toFixed(1) + '%' : '0%'
      }
    };
  }

  // Generate report
  generateReport(domains) {
    let report = '=== Trademark Check Report ===\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    const results = domains.map(d => this.checkDomain(d));

    const critical = results.filter(r => r.riskLevel === 'critical').length;
    const high = results.filter(r => r.riskLevel === 'high').length;
    const medium = results.filter(r => r.riskLevel === 'medium').length;
    const low = results.filter(r => r.riskLevel === 'low').length;

    report += `Summary:\n`;
    report += `- Total domains checked: ${domains.length}\n`;
    report += `- Critical risk: ${critical}\n`;
    report += `- High risk: ${high}\n`;
    report += `- Medium risk: ${medium}\n`;
    report += `- Low risk: ${low}\n\n`;

    results.forEach(r => {
      report += `Domain: ${r.domain}\n`;
      report += `  Risk Level: ${r.riskLevel.toUpperCase()}\n`;
      report += `  Risk Score: ${r.riskScore}\n`;
      report += `  Matches: ${r.matches.length}\n`;

      if (r.matches.length > 0) {
        r.matches.forEach(m => {
          report += `  - [${m.type}] ${m.trademark.name} (${m.relevance}%)\n`;
          report += `      Owner: ${m.trademark.owner}\n`;
        });
      }
      report += '\n';
    });

    return report;
  }
}

function runDemo() {
  console.log('=== Agent Trademark Demo\n');

  const mgr = new TrademarkManager();

  console.log('1. Check Domain (exact match):');
  const check1 = mgr.checkDomain('google.com');
  console.log(`   Domain: ${check1.domain}`);
  console.log(`   Risk Level: ${check1.riskLevel}`);
  console.log(`   Risk Score: ${check1.riskScore}`);
  console.log(`   Matches: ${check1.matches.length}`);
  check1.matches.forEach(m => {
    console.log(`   - ${m.trademark.name} (${m.type}, ${m.relevance}%)`);
  });

  console.log('\n2. Check Domain (similar):');
  const check2 = mgr.checkDomain('googlesearch.org');
  console.log(`   Domain: ${check2.domain}`);
  console.log(`   Risk Level: ${check2.riskLevel}`);
  console.log(`   Risk Score: ${check2.riskScore}`);
  console.log(`   Matches: ${check2.matches.length}`);

  console.log('\n3. Check Domain (no match):');
  const check3 = mgr.checkDomain('myrandomblog.com');
  console.log(`   Domain: ${check3.domain}`);
  console.log(`   Risk Level: ${check3.riskLevel}`);
  console.log(`   Risk Score: ${check3.riskScore}`);

  console.log('\n4. Search Trademarks:');
  const search = mgr.searchTrademarks('soft');
  console.log(`   Found: ${search.length}`);
  search.forEach(t => console.log(`   - ${t.name} (${t.owner})`));

  console.log('\n5. Get Trademark Details:');
  const tm = mgr.getTrademark('amazon');
  if (tm) {
    console.log(`   Name: ${tm.name}`);
    console.log(`   Owner: ${tm.owner}`);
    console.log(`   Classes: ${tm.classes.join(', ')}`);
    console.log(`   Description: ${tm.description}`);
  }

  console.log('\n6. Register New Trademark:');
  const newTm = mgr.registerTrademark({
    name: 'MYBRAND',
    registrationNumber: 'US-TM-999999',
    registrationDate: '2025-01-01',
    expiryDate: '2035-01-01',
    owner: 'My Company Inc.',
    classes: [9, 35],
    description: 'Brand for software products'
  });
  console.log(`   Registered: ${newTm.name}`);

  console.log('\n7. Check with new trademark:');
  const check4 = mgr.checkDomain('mybrand.com');
  console.log(`   Domain: ${check4.domain}`);
  console.log(`   Risk Level: ${check4.riskLevel}`);
  console.log(`   Matches: ${check4.matches.length}`);

  console.log('\n8. Get Statistics:');
  const stats = mgr.getStats();
  console.log(`   Total checks: ${stats.totalChecks}`);
  console.log(`   Critical: ${stats.critical}`);
  console.log(`   High: ${stats.high}`);
  console.log(`   Medium: ${stats.medium}`);
  console.log(`   Low: ${stats.low}`);

  console.log('\n9. Generate Report:');
  const report = mgr.generateReport(['apple.net', 'teslaclothing.com', 'randomdomain.io']);
  console.log(report);

  console.log('=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new TrademarkManager();

if (command === 'demo') runDemo();
else if (command === 'check') {
  const [domain] = args.slice(1);
  if (!domain) {
    console.log('Usage: node agent-trademark.js check <domain>');
    process.exit(1);
  }
  const result = mgr.checkDomain(domain);
  console.log(JSON.stringify(result, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else if (command === 'report') {
  const domains = args.slice(1);
  if (domains.length === 0) {
    console.log('Usage: node agent-trademark.js report <domain1> [domain2] ...');
    process.exit(1);
  }
  console.log(mgr.generateReport(domains));
}
else console.log('Usage: node agent-trademark.js [demo|check|report]');
