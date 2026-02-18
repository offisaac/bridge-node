/**
 * Agent Rate Firewall Module
 *
 * Provides rate limiting and firewall services.
 * Usage: node agent-rate-firewall.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show rate firewall stats
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
 * Rate Limit Rule
 */
class RateLimitRule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description;
    this.sourceIP = config.sourceIP || 'any';
    this.destinationIP = config.destinationIP || 'any';
    this.endpoint = config.endpoint || 'any';
    this.maxRequests = config.maxRequests || 100;
    this.windowMs = config.windowMs || 60000; // 1 minute
    this.action = config.action || 'block'; // block, throttle, log
    this.enabled = config.enabled !== false;
    this.createdAt = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      maxRequests: this.maxRequests,
      windowMs: this.windowMs,
      action: this.action,
      enabled: this.enabled
    };
  }
}

/**
 * Rate Limit Entry
 */
class RateLimitEntry {
  constructor(key) {
    this.key = key;
    this.requests = [];
    this.blocked = false;
    this.blockedAt = null;
    this.blockedUntil = null;
  }

  addRequest(timestamp = Date.now()) {
    this.requests.push(timestamp);
    this._cleanupOldRequests(timestamp);
  }

  _cleanupOldRequests(now) {
    const windowStart = now - 60000; // Clean requests older than 1 minute
    this.requests = this.requests.filter(t => t > windowStart);
  }

  getRequestCount() {
    return this.requests.length;
  }

  isOverLimit(limit, now = Date.now()) {
    this._cleanupOldRequests(now);
    return this.requests.length >= limit;
  }

  block(durationMs) {
    this.blocked = true;
    this.blockedAt = Date.now();
    this.blockedUntil = this.blockedAt + durationMs;
  }

  unblock() {
    this.blocked = false;
    this.blockedAt = null;
    this.blockedUntil = null;
  }

  isBlocked(now = Date.now()) {
    if (!this.blocked) return false;
    if (this.blockedUntil && now > this.blockedUntil) {
      this.unblock();
      return false;
    }
    return true;
  }
}

/**
 * Rate Firewall Log
 */
class RateFirewallLog {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.timestamp = Date.now();
    this.sourceIP = config.sourceIP;
    this.endpoint = config.endpoint;
    this.action = config.action;
    this.reason = config.reason;
    this.requestsCount = config.requestsCount;
  }

  toJSON() {
    return {
      timestamp: this.timestamp,
      sourceIP: this.sourceIP,
      endpoint: this.endpoint,
      action: this.action,
      reason: this.reason
    };
  }
}

/**
 * Rate Firewall Manager
 */
class RateFirewallManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.rules = new Map();
    this.entries = new Map();
    this.logs = [];
    this.defaultBlockDuration = config.defaultBlockDuration || 300000; // 5 minutes
    this.stats = {
      requestsAllowed: 0,
      requestsBlocked: 0,
      requestsThrottled: 0,
      rulesTriggered: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._createDefaultRules();
  }

  _createDefaultRules() {
    this.addRule(new RateLimitRule({
      id: 'rule-auth',
      name: 'Authentication Rate Limit',
      description: 'Rate limit for login endpoints',
      endpoint: '/api/login',
      maxRequests: 5,
      windowMs: 60000,
      action: 'block'
    }));

    this.addRule(new RateLimitRule({
      id: 'rule-upload',
      name: 'Upload Rate Limit',
      description: 'Rate limit for file uploads',
      endpoint: '/api/upload',
      maxRequests: 10,
      windowMs: 60000,
      action: 'throttle'
    }));

    this.addRule(new RateLimitRule({
      id: 'rule-api-global',
      name: 'Global API Rate Limit',
      description: 'Default rate limit for all API endpoints',
      endpoint: 'any',
      maxRequests: 100,
      windowMs: 60000,
      action: 'block'
    }));
  }

  addRule(rule) {
    this.rules.set(rule.id, rule);
  }

  getRule(ruleId) {
    return this.rules.get(ruleId);
  }

  removeRule(ruleId) {
    return this.rules.delete(ruleId);
  }

  processRequest(sourceIP, endpoint, metadata = {}) {
    const key = `${sourceIP}:${endpoint}`;

    // Get or create entry
    let entry = this.entries.get(key);
    if (!entry) {
      entry = new RateLimitEntry(key);
      this.entries.set(key, entry);
    }

    // Check if blocked
    if (entry.isBlocked()) {
      this._log({
        sourceIP,
        endpoint,
        action: 'blocked',
        reason: 'IP is temporarily blocked',
        requestsCount: entry.getRequestCount()
      });
      this.stats.requestsBlocked++;
      return { allowed: false, reason: 'blocked', action: 'block' };
    }

    // Find matching rule
    const matchingRule = this._findMatchingRule(sourceIP, endpoint);
    if (!matchingRule || !matchingRule.enabled) {
      this.stats.requestsAllowed++;
      entry.addRequest();
      return { allowed: true };
    }

    // Check rate limit
    if (entry.isOverLimit(matchingRule.maxRequests)) {
      this.stats.rulesTriggered++;

      if (matchingRule.action === 'block') {
        entry.block(this.defaultBlockDuration);
        this.stats.requestsBlocked++;
        this._log({
          sourceIP,
          endpoint,
          action: 'blocked',
          reason: 'Rate limit exceeded',
          requestsCount: entry.getRequestCount()
        });
        return { allowed: false, reason: 'rate_limit', action: 'block' };
      } else if (matchingRule.action === 'throttle') {
        this.stats.requestsThrottled++;
        this._log({
          sourceIP,
          endpoint,
          action: 'throttled',
          reason: 'Rate limit approaching',
          requestsCount: entry.getRequestCount()
        });
        return { allowed: true, reason: 'throttled', action: 'throttle', retryAfter: matchingRule.windowMs };
      }
    }

    // Add request and allow
    entry.addRequest();
    this.stats.requestsAllowed++;
    return { allowed: true, rule: matchingRule.id };
  }

  _findMatchingRule(sourceIP, endpoint) {
    let bestMatch = null;
    let bestScore = 0;

    for (const rule of this.rules.values()) {
      let score = 0;
      let matches = false;

      // Check sourceIP
      if (rule.sourceIP === sourceIP) {
        score += 10;
        matches = true;
      } else if (rule.sourceIP !== 'any') {
        continue; // Specific IP rule doesn't match
      } else {
        matches = true; // 'any' matches everything
      }

      // Check endpoint
      if (rule.endpoint === 'any') {
        // 'any' matches but gives low score
        matches = true;
      } else if (rule.endpoint === endpoint) {
        score += 20;
        matches = true;
      } else if (endpoint.includes(rule.endpoint)) {
        score += 15;
        matches = true;
      } else {
        continue; // Specific endpoint rule doesn't match
      }

      if (matches && score > bestScore) {
        bestScore = score;
        bestMatch = rule;
      }
    }

    return bestMatch;
  }

  _log(data) {
    const entry = new RateFirewallLog(data);
    this.logs.push(entry);

    // Keep only last 1000 logs
    if (this.logs.length > 1000) {
      this.logs.shift();
    }
  }

  getLogs(filter = {}) {
    const results = [];
    for (const entry of this.logs) {
      if (filter.action && entry.action !== filter.action) continue;
      if (filter.sourceIP && entry.sourceIP !== filter.sourceIP) continue;
      results.push(entry);
    }
    return results;
  }

  unblock(sourceIP, endpoint = null) {
    let unblocked = 0;
    for (const [key, entry] of this.entries) {
      if (endpoint && !key.includes(endpoint)) continue;
      if (!endpoint && !key.startsWith(sourceIP)) continue;
      if (entry.blocked) {
        entry.unblock();
        unblocked++;
      }
    }
    return unblocked;
  }

  getStats() {
    return {
      ...this.stats,
      rulesCount: this.rules.size,
      activeEntries: this.entries.size,
      blockedIPs: Array.from(this.entries.values()).filter(e => e.isBlocked()).length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Rate Firewall Demo\n');

  const manager = new RateFirewallManager();

  // Show rules
  console.log('1. Rate Limit Rules:');
  for (const rule of manager.rules.values()) {
    console.log(`   - ${rule.name}: ${rule.maxRequests} req/${rule.windowMs / 1000}s [${rule.action}]`);
  }

  // Process normal requests
  console.log('\n2. Processing Normal Requests:');
  for (let i = 0; i < 3; i++) {
    const result = manager.processRequest('192.168.1.100', '/api/users');
    console.log(`   Request ${i + 1}: ${result.allowed ? 'ALLOWED' : 'BLOCKED'}`);
  }

  // Exceed rate limit
  console.log('\n3. Exceeding Rate Limit:');
  for (let i = 0; i < 5; i++) {
    const result = manager.processRequest('192.168.1.101', '/api/login');
    console.log(`   Request ${i + 1}: ${result.allowed ? 'ALLOWED' : 'BLOCKED'} (${result.reason || 'ok'})`);
  }

  // Blocked request
  console.log('\n4. Processing Blocked Request:');
  const blockedResult = manager.processRequest('192.168.1.101', '/api/login');
  console.log(`   Result: ${blockedResult.allowed ? 'ALLOWED' : 'BLOCKED'}`);
  console.log(`   Reason: ${blockedResult.reason || 'N/A'}`);

  // Add custom rule
  console.log('\n5. Adding Custom Rule:');
  manager.addRule(new RateLimitRule({
    name: 'Strict IP Limit',
    description: 'Very strict limit for specific IP',
    sourceIP: '192.168.1.200',
    maxRequests: 10,
    windowMs: 60000,
    action: 'block'
  }));
  console.log(`   Added: Strict IP Limit`);

  // Unblock IP
  console.log('\n6. Unblocking IP:');
  const unblocked = manager.unblock('192.168.1.101');
  console.log(`   Unblocked entries: ${unblocked}`);

  // Check if unblocked works
  const afterUnblock = manager.processRequest('192.168.1.101', '/api/login');
  console.log(`   After unblock: ${afterUnblock.allowed ? 'ALLOWED' : 'BLOCKED'}`);

  // View logs
  console.log('\n7. Rate Firewall Logs:');
  const logs = manager.getLogs();
  console.log(`   Total log entries: ${logs.length}`);

  // Stats
  console.log('\n8. Statistics:');
  const stats = manager.getStats();
  console.log(`   Requests Allowed: ${stats.requestsAllowed}`);
  console.log(`   Requests Blocked: ${stats.requestsBlocked}`);
  console.log(`   Requests Throttled: ${stats.requestsThrottled}`);
  console.log(`   Rules Triggered: ${stats.rulesTriggered}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new RateFirewallManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Rate Firewall Module');
  console.log('Usage: node agent-rate-firewall.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
