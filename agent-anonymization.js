/**
 * Agent Anonymization - Data Anonymization Agent
 *
 * Provides data anonymization and de-identification capabilities.
 *
 * Usage: node agent-anonymization.js [command]
 * Commands:
 *   demo          - Run demonstration
 *   anonymize    - Anonymize data
 *   techniques   - List techniques
 */

class AnonymizationRule {
  constructor(config) {
    this.id = `rule-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.field = config.field;
    this.technique = config.technique;
    this.options = config.options || {};
  }
}

class AnonymizedRecord {
  constructor(config) {
    this.id = `anon-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.original = config.original;
    this.anonymized = config.anonymized;
    this.techniques = config.techniques || [];
  }
}

class DataCategory {
  constructor(config) {
    this.id = `cat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.sensitivity = config.sensitivity; // low, medium, high, critical
    this.pii = config.pii || false;
  }
}

class AnonymizationJob {
  constructor(config) {
    this.id = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.records = config.records || [];
    this.status = config.status || 'pending';
    this.anonymizedCount = config.anonymizedCount || 0;
    this.createdAt = config.createdAt || Date.now();
  }
}

class AnonymizationAgent {
  constructor(config = {}) {
    this.name = config.name || 'AnonymizationAgent';
    this.version = config.version || '1.0';
    this.rules = new Map();
    this.categories = new Map();
    this.jobs = new Map();
    this.stats = {
      recordsAnonymized: 0,
      jobsCompleted: 0,
      piiFieldsProcessed: 0
    };
    this.initCategories();
  }

  initCategories() {
    const categories = [
      new DataCategory({ name: 'Personal ID', sensitivity: 'critical', pii: true }),
      new DataCategory({ name: 'Financial', sensitivity: 'critical', pii: true }),
      new DataCategory({ name: 'Health', sensitivity: 'critical', pii: true }),
      new DataCategory({ name: 'Contact', sensitivity: 'high', pii: true }),
      new DataCategory({ name: 'Demographic', sensitivity: 'medium', pii: true }),
      new DataCategory({ name: 'Behavioral', sensitivity: 'low', pii: false })
    ];
    categories.forEach(c => this.categories.set(c.name, c));
  }

  addRule(field, technique, options = {}) {
    const rule = new AnonymizationRule({ field, technique, options });
    this.rules.set(rule.id, rule);
    return rule;
  }

  anonymize(data) {
    const anonymized = { ...data };

    // Apply rules
    this.rules.forEach(rule => {
      if (anonymized[rule.field] !== undefined) {
        const value = anonymized[rule.field];
        anonymized[rule.field] = this.applyTechnique(value, rule.technique, rule.options);
        this.stats.piiFieldsProcessed++;
      }
    });

    const record = new AnonymizedRecord({
      original: data,
      anonymized,
      techniques: Array.from(this.rules.values()).map(r => r.technique)
    });

    this.stats.recordsAnonymized++;

    return record;
  }

  applyTechnique(value, technique, options) {
    switch (technique) {
      case 'mask':
        return this.maskValue(value, options);
      case 'hash':
        return this.hashValue(value, options);
      case 'pseudonymize':
        return this.pseudonymizeValue(value, options);
      case 'generalize':
        return this.generalizeValue(value, options);
      case 'suppress':
        return '[REDACTED]';
      case 'perturb':
        return this.perturbValue(value, options);
      default:
        return value;
    }
  }

  maskValue(value, options) {
    const char = options.char || '*';
    const visible = options.visible || 0;
    const str = String(value);
    if (str.length <= visible) return str;
    return char.repeat(str.length - visible) + str.slice(-visible);
  }

  hashValue(value, options) {
    const salt = options.salt || 'default-salt';
    let hash = 0;
    const str = String(value) + salt;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `hash:${Math.abs(hash).toString(16)}`;
  }

  pseudonymizeValue(value, options) {
    const prefix = options.prefix || 'user';
    // Simple hash function for JavaScript (since no native hashCode)
    let hash = 0;
    const str = String(value);
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `${prefix}_${Math.abs(hash)}`;
  }

  generalizeValue(value, options) {
    const type = options.type;
    if (type === 'age') {
      const age = parseInt(value);
      if (age < 18) return 'under 18';
      if (age < 30) return '18-29';
      if (age < 50) return '30-49';
      if (age < 70) return '50-69';
      return '70+';
    }
    if (type === 'date') {
      const date = new Date(value);
      return `${date.getFullYear()}`;
    }
    if (type === 'zip') {
      return String(value).slice(0, 3) + '**';
    }
    return value;
  }

  perturbValue(value, options) {
    const range = options.range || 10;
    const num = parseFloat(value);
    if (!isNaN(num)) {
      const noise = (Math.random() - 0.5) * range;
      return (num + noise).toFixed(2);
    }
    return value;
  }

  createJob(records) {
    const job = new AnonymizationJob({ records, status: 'processing' });
    this.jobs.set(job.id, job);
    return job;
  }

  processJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;

    job.records.forEach(record => {
      this.anonymize(record);
      job.anonymizedCount++;
    });

    job.status = 'completed';
    this.stats.jobsCompleted++;

    return job;
  }

  listCategories() {
    return Array.from(this.categories.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const anonymizer = new AnonymizationAgent();

switch (command) {
  case 'demo': {
    console.log('=== Agent Anonymization Demo\n');

    // 1. Data Categories
    console.log('1. Data Categories:');
    const categories = anonymizer.listCategories();
    console.log(`   Total: ${categories.length} categories`);
    categories.slice(0, 3).forEach(c => {
      console.log(`   - ${c.name}: ${c.sensitivity} sensitivity, PII: ${c.pii}`);
    });

    // 2. Add Rules
    console.log('\n2. Anonymization Rules:');
    anonymizer.addRule('email', 'mask', { visible: 2 });
    anonymizer.addRule('phone', 'mask', { visible: 4 });
    anonymizer.addRule('ssn', 'suppress');
    anonymizer.addRule('age', 'generalize', { type: 'age' });
    anonymizer.addRule('salary', 'perturb', { range: 5000 });
    console.log(`   Rules added: ${anonymizer.rules.size}`);

    // 3. Anonymize Data
    console.log('\n3. Anonymize Data:');
    const data = {
      name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '555-123-4567',
      ssn: '123-45-6789',
      age: 32,
      salary: 75000
    };
    console.log(`   Original:`, data);

    const result = anonymizer.anonymize(data);
    console.log(`   Anonymized:`, result.anonymized);
    console.log(`   Techniques used: ${result.techniques.join(', ')}`);

    // 4. Pseudonymization
    console.log('\n4. Pseudonymization:');
    anonymizer.addRule('userId', 'pseudonymize', { prefix: 'user' });
    const pseudoData = { userId: 'user12345' };
    const pseudoResult = anonymizer.anonymize(pseudoData);
    console.log(`   Original: ${pseudoData.userId}`);
    console.log(`   Pseudonymized: ${pseudoResult.anonymized.userId}`);

    // 5. Job Processing
    console.log('\n5. Batch Processing:');
    const job = anonymizer.createJob([
      { name: 'Alice', email: 'alice@test.com' },
      { name: 'Bob', email: 'bob@test.com' }
    ]);
    const processedJob = anonymizer.processJob(job.id);
    console.log(`   Job ID: ${processedJob.id}`);
    console.log(`   Status: ${processedJob.status}`);
    console.log(`   Records processed: ${processedJob.anonymizedCount}`);

    // 6. Statistics
    console.log('\n6. Statistics:');
    const stats = anonymizer.getStats();
    console.log(`   Records anonymized: ${stats.recordsAnonymized}`);
    console.log(`   Jobs completed: ${stats.jobsCompleted}`);
    console.log(`   PII fields processed: ${stats.piiFieldsProcessed}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'anonymize': {
    const data = JSON.parse(args[1] || '{}');
    const result = anonymizer.anonymize(data);
    console.log(JSON.stringify(result.anonymized, null, 2));
    break;
  }

  case 'techniques': {
    console.log('Anonymization Techniques:');
    console.log('  mask - Partial masking (e.g., ****1234)');
    console.log('  hash - Cryptographic hashing');
    console.log('  pseudonymize - Replace with fake ID');
    console.log('  generalize - Generalize ranges');
    console.log('  suppress - Complete removal');
    console.log('  perturb - Add noise');
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-anonymization.js [demo|anonymize|techniques]');
  }
}
