/**
 * Agent Reputation Module
 *
 * Provides reputation management and scoring services.
 * Usage: node agent-reputation.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show reputation stats
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
 * Reputation Event Type
 */
const ReputationEventType = {
  POSITIVE_REVIEW: 'positive_review',
  NEGATIVE_REVIEW: 'negative_review',
  TRANSACTION_COMPLETED: 'transaction_completed',
  TRANSACTION_DISPUTED: 'transaction_disputed',
  PAYMENT_ON_TIME: 'payment_on_time',
  PAYMENT_LATE: 'payment_late',
  RESPONSE_QUICK: 'response_quick',
  RESPONSE_SLOW: 'response_slow',
  REPORT_FILED: 'report_filed',
  REPORT_DROPPED: 'report_dropped'
};

/**
 * Reputation Score
 */
class ReputationScore {
  constructor(config) {
    this.entityId = config.entityId;
    this.entityType = config.entityType; // user, business, service
    this.score = config.score || 0;
    this.maxScore = config.maxScore || 100;
    this.level = config.level || this._calculateLevel();
    this.history = [];
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
  }

  _calculateLevel() {
    const percentage = (this.score / this.maxScore) * 100;
    if (percentage >= 90) return 'excellent';
    if (percentage >= 70) return 'good';
    if (percentage >= 50) return 'average';
    if (percentage >= 30) return 'poor';
    return 'critical';
  }

  update(newScore) {
    this.score = newScore;
    this.level = this._calculateLevel();
    this.updatedAt = Date.now();
  }

  adjust(delta) {
    this.score = Math.max(0, Math.min(this.maxScore, this.score + delta));
    this.level = this._calculateLevel();
    this.updatedAt = Date.now();
  }

  addHistory(event) {
    this.history.push(event);
    // Keep only last 100 events
    if (this.history.length > 100) {
      this.history.shift();
    }
  }

  toJSON() {
    return {
      entityId: this.entityId,
      entityType: this.entityType,
      score: this.score,
      maxScore: this.maxScore,
      level: this.level,
      historyLength: this.history.length,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

/**
 * Reputation Event
 */
class ReputationEvent {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.entityId = config.entityId;
    this.eventType = config.eventType;
    this.weight = config.weight || 1.0;
    this.description = config.description;
    this.metadata = config.metadata || {};
    this.timestamp = Date.now();
  }
}

/**
 * Reputation Manager
 */
class ReputationManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.reputations = new Map(); // entityId -> ReputationScore
    this.events = [];
    this.defaultWeights = config.defaultWeights || this._getDefaultWeights();
    this.stats = {
      eventsProcessed: 0,
      scoreIncreases: 0,
      scoreDecreases: 0,
      entitiesScored: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  _getDefaultWeights() {
    return {
      [ReputationEventType.POSITIVE_REVIEW]: 10,
      [ReputationEventType.NEGATIVE_REVIEW]: -15,
      [ReputationEventType.TRANSACTION_COMPLETED]: 5,
      [ReputationEventType.TRANSACTION_DISPUTED]: -10,
      [ReputationEventType.PAYMENT_ON_TIME]: 8,
      [ReputationEventType.PAYMENT_LATE]: -12,
      [ReputationEventType.RESPONSE_QUICK]: 3,
      [ReputationEventType.RESPONSE_SLOW]: -2,
      [ReputationEventType.REPORT_FILED]: -20,
      [ReputationEventType.REPORT_DROPPED]: 5
    };
  }

  getOrCreate(entityId, entityType) {
    let reputation = this.reputations.get(entityId);
    if (!reputation) {
      reputation = new ReputationScore({ entityId, entityType });
      this.reputations.set(entityId, reputation);
      this.stats.entitiesScored++;
    }
    return reputation;
  }

  recordEvent(entityId, entityType, eventType, metadata = {}) {
    const event = new ReputationEvent({
      entityId,
      eventType,
      description: this._getEventDescription(eventType),
      metadata
    });

    this.events.push(event);
    this.stats.eventsProcessed++;

    // Get or create reputation
    const reputation = this.getOrCreate(entityId, entityType);

    // Calculate score change
    const weight = this.defaultWeights[eventType] || 1;

    // Track if increase or decrease
    if (weight > 0) {
      this.stats.scoreIncreases++;
    } else {
      this.stats.scoreDecreases++;
    }

    // Update reputation
    reputation.adjust(weight);
    reputation.addHistory(event);

    return { event, newScore: reputation.score, level: reputation.level };
  }

  _getEventDescription(eventType) {
    const descriptions = {
      [ReputationEventType.POSITIVE_REVIEW]: 'Received positive review',
      [ReputationEventType.NEGATIVE_REVIEW]: 'Received negative review',
      [ReputationEventType.TRANSACTION_COMPLETED]: 'Transaction completed successfully',
      [ReputationEventType.TRANSACTION_DISPUTED]: 'Transaction was disputed',
      [ReputationEventType.PAYMENT_ON_TIME]: 'Payment made on time',
      [ReputationEventType.PAYMENT_LATE]: 'Payment made late',
      [ReputationEventType.RESPONSE_QUICK]: 'Responded quickly',
      [ReputationEventType.RESPONSE_SLOW]: 'Slow response',
      [ReputationEventType.REPORT_FILED]: 'Report filed against entity',
      [ReputationEventType.REPORT_DROPPED]: 'Report was dropped'
    };
    return descriptions[eventType] || 'Unknown event';
  }

  getReputation(entityId) {
    return this.reputations.get(entityId);
  }

  getTopReputations(entityType = null, limit = 10) {
    const all = Array.from(this.reputations.values());

    let filtered = all;
    if (entityType) {
      filtered = all.filter(r => r.entityType === entityType);
    }

    return filtered
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  getReputationHistory(entityId) {
    const reputation = this.reputations.get(entityId);
    return reputation ? reputation.history : [];
  }

  setWeight(eventType, weight) {
    this.defaultWeights[eventType] = weight;
  }

  getStats() {
    return {
      ...this.stats,
      totalEntities: this.reputations.size,
      eventsInHistory: this.events.length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Reputation Demo\n');

  const manager = new ReputationManager();

  // Record positive events
  console.log('1. Recording Positive Events:');
  const result1 = manager.recordEvent('user-123', 'user', ReputationEventType.POSITIVE_REVIEW);
  console.log(`   Event: ${result1.event.description}`);
  console.log(`   New Score: ${result1.newScore}, Level: ${result1.level}`);

  manager.recordEvent('user-123', 'user', ReputationEventType.TRANSACTION_COMPLETED);
  manager.recordEvent('user-123', 'user', ReputationEventType.PAYMENT_ON_TIME);
  console.log(`   Total events: 3`);

  // Record negative events
  console.log('\n2. Recording Negative Events:');
  const result2 = manager.recordEvent('user-456', 'user', ReputationEventType.NEGATIVE_REVIEW);
  console.log(`   Event: ${result2.event.description}`);
  console.log(`   New Score: ${result2.newScore}, Level: ${result2.level}`);

  manager.recordEvent('user-456', 'user', ReputationEventType.TRANSACTION_DISPUTED);
  console.log(`   Total events: 2`);

  // Record for business
  console.log('\n3. Recording Business Events:');
  const result3 = manager.recordEvent('biz-789', 'business', ReputationEventType.POSITIVE_REVIEW);
  console.log(`   Event: ${result3.event.description}`);
  console.log(`   New Score: ${result3.newScore}, Level: ${result3.level}`);

  // Get reputation
  console.log('\n4. Getting Reputation:');
  const rep1 = manager.getReputation('user-123');
  console.log(`   User-123: Score=${rep1.score}, Level=${rep1.level}`);

  const rep2 = manager.getReputation('user-456');
  console.log(`   User-456: Score=${rep2.score}, Level=${rep2.level}`);

  // Get top reputations
  console.log('\n5. Top User Reputations:');
  const topUsers = manager.getTopReputations('user');
  for (const user of topUsers) {
    console.log(`   ${user.entityId}: ${user.score} (${user.level})`);
  }

  // Get history
  console.log('\n6. Reputation History:');
  const history = manager.getReputationHistory('user-123');
  console.log(`   Events in history: ${history.length}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Events Processed: ${stats.eventsProcessed}`);
  console.log(`   Score Increases: ${stats.scoreIncreases}`);
  console.log(`   Score Decreases: ${stats.scoreDecreases}`);
  console.log(`   Total Entities: ${stats.totalEntities}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new ReputationManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Reputation Module');
  console.log('Usage: node agent-reputation.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
