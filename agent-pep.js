/**
 * Agent PEP Module
 *
 * Provides Politically Exposed Person screening services.
 * Usage: node agent-kyc.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show PEP stats
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
 * PEP Status
 */
const PEPStatus = {
  CLEAR: 'clear',
  MATCH: 'match',
  REVIEW: 'review',
  CONFIRMED: 'confirmed'
};

/**
 * PEP Category
 */
const PEPCategory = {
  HEAD_OF_STATE: 'head_of_state',
  GOVERNMENT: 'government',
  JUDICIARY: 'judicial',
  MILITARY: 'military',
  DIPLOMATIC: 'diplomatic',
  POLITICAL: 'political_party',
  BUSINESS: 'business_associate',
  FAMILY: 'family_member',
  CLOSE_ASSOCIATE: 'close_associate'
};

/**
 * PEP Record
 */
class PEPRecord {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.aliases = config.aliases || [];
    this.category = config.category;
    this.country = config.country;
    this.position = config.position;
    this.organization = config.organization;
    this.riskScore = config.riskScore || 50;
    this.sanctions = config.sanctions || false;
    this.createdAt = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      country: this.country,
      position: this.position,
      riskScore: this.riskScore,
      sanctions: this.sanctions
    };
  }
}

/**
 * Screening Result
 */
class ScreeningResult {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.subjectId = config.subjectId;
    this.status = config.status || PEPStatus.CLEAR;
    this.matches = config.matches || [];
    this.riskLevel = config.riskLevel || 'low';
    this.screenedAt = Date.now();
    this.notes = '';
  }

  addMatch(pepRecord, confidence, notes = '') {
    this.matches.push({
      pepRecord: pepRecord.toJSON(),
      confidence,
      notes
    });
    this.status = PEPStatus.MATCH;
  }

  confirm(isPEP) {
    if (isPEP) {
      this.status = PEPStatus.CONFIRMED;
      this.riskLevel = 'high';
    } else {
      this.status = PEPStatus.CLEAR;
      this.riskLevel = 'low';
    }
  }

  setReview() {
    this.status = PEPStatus.REVIEW;
    this.riskLevel = 'medium';
  }

  toJSON() {
    return {
      id: this.id,
      subjectId: this.subjectId,
      status: this.status,
      matchesCount: this.matches.length,
      riskLevel: this.riskLevel,
      screenedAt: this.screenedAt
    };
  }
}

/**
 * PEP Manager
 */
class PEPManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.pepDatabase = new Map();
    this.screeningHistory = new Map();
    this.stats = {
      screeningsConducted: 0,
      matchesFound: 0,
      confirmedPEP: 0,
      cleared: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._loadSampleData();
  }

  _loadSampleData() {
    // Add sample PEP records
    const samplePEPs = [
      new PEPRecord({ name: 'John Smith', category: PEPCategory.HEAD_OF_STATE, country: 'US', position: 'President', riskScore: 90 }),
      new PEPRecord({ name: 'Jane Doe', category: PEPCategory.GOVERNMENT, country: 'UK', position: 'Minister', riskScore: 75 }),
      new PEPRecord({ name: 'Bob Johnson', category: PEPCategory.JUDICIARY, country: 'CA', position: 'Chief Justice', riskScore: 65 }),
      new PEPRecord({ name: 'Alice Williams', category: PEPCategory.DIPLOMATIC, country: 'FR', position: 'Ambassador', riskScore: 70 }),
      new PEPRecord({ aliases: ['Joe Bloggs'], name: 'Joseph Bloggs', category: PEPCategory.FAMILY, country: 'DE', position: 'Related to Official', riskScore: 55 })
    ];

    for (const pep of samplePEPs) {
      this.pepDatabase.set(pep.id, pep);
    }
  }

  addPEP(pepData) {
    const pep = new PEPRecord(pepData);
    this.pepDatabase.set(pep.id, pep);
    return pep;
  }

  screen(subjectId, subjectName, subjectCountry = null) {
    const result = new ScreeningResult({ subjectId });
    this.stats.screeningsConducted++;

    // Search for matches
    const nameLower = subjectName.toLowerCase();

    for (const pep of this.pepDatabase.values()) {
      let confidence = 0;

      // Check exact name match
      if (pep.name.toLowerCase() === nameLower) {
        confidence = 95;
      }
      // Check aliases
      else {
        for (const alias of pep.aliases) {
          if (alias.toLowerCase() === nameLower) {
            confidence = 90;
            break;
          }
        }
      }

      // Partial match (simplified)
      if (confidence === 0 && nameLower.includes(pep.name.toLowerCase().split(' ')[0])) {
        confidence = 40;
      }

      if (confidence > 0) {
        // Check country match if provided
        if (subjectCountry && pep.country !== subjectCountry) {
          confidence = Math.floor(confidence * 0.7); // Reduce confidence for different country
        }

        // Adjust for sanctions
        if (pep.sanctions) {
          confidence = Math.min(100, confidence + 20);
        }

        result.addMatch(pep, confidence);
        this.stats.matchesFound++;
      }
    }

    // Determine status
    if (result.matches.length > 0) {
      const avgConfidence = result.matches.reduce((sum, m) => sum + m.confidence, 0) / result.matches.length;

      if (avgConfidence >= 80) {
        result.riskLevel = 'high';
      } else if (avgConfidence >= 50) {
        result.riskLevel = 'medium';
        result.setReview();
      } else {
        result.riskLevel = 'low';
      }
    } else {
      result.status = PEPStatus.CLEAR;
      this.stats.cleared++;
    }

    this.screeningHistory.set(result.id, result);
    return result;
  }

  confirmMatch(resultId, isPEP) {
    const result = this.screeningHistory.get(resultId);
    if (!result) {
      return null;
    }

    result.confirm(isPEP);

    if (isPEP) {
      this.stats.confirmedPEP++;
    } else {
      this.stats.cleared++;
    }

    return result;
  }

  getResult(resultId) {
    return this.screeningHistory.get(resultId);
  }

  getHistory(subjectId) {
    const results = [];
    for (const result of this.screeningHistory.values()) {
      if (result.subjectId === subjectId) {
        results.push(result);
      }
    }
    return results;
  }

  getStats() {
    return {
      ...this.stats,
      pepDatabaseSize: this.pepDatabase.size,
      screeningsInHistory: this.screeningHistory.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent PEP Demo\n');

  const manager = new PEPManager();

  // Show database
  console.log('1. PEP Database:');
  console.log(`   Total records: ${manager.pepDatabase.size}`);

  // Screen person
  console.log('\n2. Screening: John Smith:');
  const result1 = manager.screen('user-123', 'John Smith', 'US');
  console.log(`   Status: ${result1.status}`);
  console.log(`   Matches: ${result1.matches.length}`);
  console.log(`   Risk Level: ${result1.riskLevel}`);

  if (result1.matches.length > 0) {
    console.log(`   Match: ${result1.matches[0].pepRecord.name} (${result1.matches[0].pepRecord.category})`);
  }

  // Screen person with no match
  console.log('\n3. Screening: Random Person:');
  const result2 = manager.screen('user-456', 'Random Name', 'US');
  console.log(`   Status: ${result2.status}`);
  console.log(`   Matches: ${result2.matches.length}`);

  // Screen with partial match
  console.log('\n4. Screening: Joseph Bloggs (alias):');
  const result3 = manager.screen('user-789', 'Joe Bloggs', 'DE');
  console.log(`   Status: ${result3.status}`);
  console.log(`   Matches: ${result3.matches.length}`);

  if (result3.matches.length > 0) {
    console.log(`   Match: ${result3.matches[0].pepRecord.name} (${result3.matches[0].confidence}% confidence)`);
  }

  // Confirm match
  console.log('\n5. Confirming Match:');
  manager.confirmMatch(result1.id, true);
  console.log(`   Confirmed as PEP: ${result1.status === PEPStatus.CONFIRMED}`);

  // Get history
  console.log('\n6. Screening History:');
  const history = manager.getHistory('user-123');
  console.log(`   User-123 screenings: ${history.length}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Screenings Conducted: ${stats.screeningsConducted}`);
  console.log(`   Matches Found: ${stats.matchesFound}`);
  console.log(`   Confirmed PEP: ${stats.confirmedPEP}`);
  console.log(`   Cleared: ${stats.cleared}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new PEPManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent PEP Module');
  console.log('Usage: node agent-kyc.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
