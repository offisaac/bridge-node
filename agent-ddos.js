/**
 * Agent DDoS Protector
 * Protects agents from DDoS attacks with rate limiting and traffic analysis
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentDDoSProtector {
  constructor(options = {}) {
    this.rules = new Map();
    this.whitelist = new Set();
    this.blacklist = new Set();
    this.trafficRecords = new Map();
    this.alerts = new Map();
    this.blockedIps = new Map();

    this.config = {
      requestLimit: options.requestLimit || 100, // requests per window
      windowSize: options.windowSize || 60000, // 1 minute
      blockDuration: options.blockDuration || 300000, // 5 minutes
      enableRateLimiting: options.enableRateLimiting !== false,
      enableTrafficAnalysis: options.enableTrafficAnalysis !== false,
      detectionThreshold: options.detectionThreshold || 1000, // requests per second
      autoBlock: options.autoBlock !== false
    };

    // Initialize default rules
    this._initDefaultRules();

    this.stats = {
      totalRequests: 0,
      blockedRequests: 0,
      rateLimitedRequests: 0,
      maliciousRequests: 0,
      ipsBlocked: 0
    };
  }

  _initDefaultRules() {
    // Rate limiting rule
    this.createRule({
      name: 'Rate Limit Rule',
      type: 'rate_limit',
      action: 'block',
      priority: 10,
      config: {
        requests: 100,
        window: 60000
      }
    });

    // IP whitelist
    this.createRule({
      name: 'Internal Network Whitelist',
      type: 'whitelist',
      action: 'allow',
      priority: 100,
      config: {
        ipRanges: ['10.0.0.0/8', '192.168.0.0/16', '172.16.0.0/12']
      }
    });

    // Known bad IPs blacklist
    this.createRule({
      name: 'Known Attackers Blacklist',
      type: 'blacklist',
      action: 'block',
      priority: 100,
      config: {
        ipList: ['1.2.3.4', '5.6.7.8', '9.10.11.12']
      }
    });

    // Geo blocking rule
    this.createRule({
      name: 'Block High Risk Countries',
      type: 'geo',
      action: 'block',
      priority: 50,
      config: {
        countries: ['XX', 'YY'] // Placeholder for high-risk countries
      }
    });

    // Request size rule
    this.createRule({
      name: 'Limit Request Size',
      type: 'size_limit',
      action: 'block',
      priority: 20,
      config: {
        maxSize: 10485760 // 10MB
      }
    });
  }

  createRule(ruleConfig) {
    const { name, type, action, priority, config } = ruleConfig;

    const rule = {
      id: `rule-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      type,
      action,
      priority: priority || 0,
      config: config || {},
      enabled: true,
      hits: 0,
      createdAt: new Date().toISOString()
    };

    this.rules.set(rule.id, rule);
    console.log(`Rule created: ${rule.id} (${name})`);
    return rule;
  }

  deleteRule(ruleId) {
    if (!this.rules.has(ruleId)) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    this.rules.delete(ruleId);
    console.log(`Rule deleted: ${ruleId}`);
    return { success: true, ruleId };
  }

  addToWhitelist(ip) {
    this.whitelist.add(ip);
    console.log(`Added to whitelist: ${ip}`);
    return { success: true, ip };
  }

  addToBlacklist(ip, reason) {
    this.blacklist.add(ip);

    // Set block expiry
    this.blockedIps.set(ip, {
      blockedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + this.config.blockDuration).toISOString(),
      reason: reason || 'manual_block'
    });

    this.stats.ipsBlocked++;
    console.log(`Added to blacklist: ${ip}`);
    return { success: true, ip };
  }

  removeFromBlacklist(ip) {
    this.blacklist.delete(ip);
    this.blockedIps.delete(ip);
    console.log(`Removed from blacklist: ${ip}`);
    return { success: true, ip };
  }

  checkRequest(request) {
    const { ip, path, method, headers, body, timestamp } = request;
    const now = timestamp || new Date().toISOString();

    // Increment stats
    this.stats.totalRequests++;

    // Check whitelist first
    if (this.whitelist.has(ip)) {
      return { allowed: true, reason: 'whitelisted' };
    }

    // Check blacklist
    if (this.blacklist.has(ip)) {
      this.stats.blockedRequests++;
      return { allowed: false, reason: 'blacklisted', blocked: true };
    }

    // Get sorted rules
    const sortedRules = Array.from(this.rules.values())
      .filter(r => r.enabled)
      .sort((a, b) => b.priority - a.priority);

    // Check each rule type
    for (const rule of sortedRules) {
      const result = this._checkRule(rule, request, now);
      if (result.matched) {
        rule.hits++;

        if (rule.action === 'block') {
          this.stats.blockedRequests++;

          if (rule.type === 'rate_limit') {
            this.stats.rateLimitedRequests++;
          }

          // Auto-block IP if needed
          if (this.config.autoBlock && !this.blacklist.has(ip)) {
            this.addToBlacklist(ip, `Rule: ${rule.name}`);
          }

          return { allowed: false, reason: rule.type, rule: rule.name, blocked: true };
        } else if (rule.action === 'allow') {
          return { allowed: true, reason: rule.type, rule: rule.name };
        }
      }
    }

    // Check rate limiting
    if (this.config.enableRateLimiting) {
      const rateLimitResult = this._checkRateLimit(ip, now);
      if (!rateLimitResult.allowed) {
        return rateLimitResult;
      }
    }

    // Check traffic anomaly
    if (this.config.enableTrafficAnalysis) {
      const anomalyResult = this._checkTrafficAnomaly(ip, now);
      if (!anomalyResult.allowed) {
        return anomalyResult;
      }
    }

    // Record request for statistics
    this._recordRequest(ip, path, now);

    return { allowed: true, reason: 'passed_all_rules' };
  }

  _checkRule(rule, request, timestamp) {
    switch (rule.type) {
      case 'rate_limit':
        return { matched: false }; // Handled separately

      case 'whitelist':
        const ip = request.ip;
        if (rule.config.ipRanges) {
          for (const range of rule.config.ipRanges) {
            if (this._ipInRange(ip, range)) {
              return { matched: true };
            }
          }
        }
        return { matched: false };

      case 'blacklist':
        return { matched: this.blacklist.has(request.ip) };

      case 'geo':
        // Simulate geo check
        return { matched: false };

      case 'size_limit':
        const bodySize = request.body ? request.body.length : 0;
        return { matched: bodySize > rule.config.maxSize };

      default:
        return { matched: false };
    }
  }

  _ipInRange(ip, range) {
    // Simple CIDR check (simplified)
    if (range.includes('/')) {
      const [baseIp, bits] = range.split('/');
      return ip.startsWith(baseIp.split('.').slice(0, parseInt(bits) / 8 | 0).join('.'));
    }
    return ip === range;
  }

  _checkRateLimit(ip, timestamp) {
    // Get or create traffic record
    if (!this.trafficRecords.has(ip)) {
      this.trafficRecords.set(ip, []);
    }

    const records = this.trafficRecords.get(ip);
    const windowStart = new Date(new Date(timestamp).getTime() - this.config.windowSize);

    // Filter to current window
    const recentRecords = records.filter(r => new Date(r.timestamp) > windowStart);

    if (recentRecords.length >= this.config.requestLimit) {
      this.stats.rateLimitedRequests++;
      this.stats.blockedRequests++;

      // Generate alert
      this._generateAlert(ip, 'rate_limit', `Rate limit exceeded: ${recentRecords.length} requests in window`);

      return {
        allowed: false,
        reason: 'rate_limit_exceeded',
        limit: this.config.requestLimit,
        window: this.config.windowSize
      };
    }

    return { allowed: true };
  }

  _checkTrafficAnomaly(ip, timestamp) {
    const records = this.trafficRecords.get(ip) || [];
    const oneSecondAgo = new Date(new Date(timestamp).getTime() - 1000);

    const recentRecords = records.filter(r => new Date(r.timestamp) > oneSecondAgo);

    if (recentRecords.length > this.config.detectionThreshold) {
      this.stats.maliciousRequests++;
      this.stats.blockedRequests++;

      this.addToBlacklist(ip, 'Traffic anomaly detected');
      this._generateAlert(ip, 'traffic_anomaly', `Traffic spike: ${recentRecords.length} requests/second`);

      return {
        allowed: false,
        reason: 'traffic_anomaly',
        requestsPerSecond: recentRecords.length
      };
    }

    return { allowed: true };
  }

  _recordRequest(ip, path, timestamp) {
    if (!this.trafficRecords.has(ip)) {
      this.trafficRecords.set(ip, []);
    }

    const records = this.trafficRecords.get(ip);
    records.push({ path, timestamp });

    // Keep only last 10000 records per IP
    if (records.length > 10000) {
      records.shift();
    }
  }

  _generateAlert(ip, type, message) {
    const alert = {
      id: crypto.randomUUID().substring(0, 8),
      ip,
      type,
      message,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };

    this.alerts.set(alert.id, alert);
    console.log(`Alert generated: ${type} - ${ip}`);
    return alert;
  }

  acknowledgeAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date().toISOString();
    return alert;
  }

  getAlerts(acknowledged = null) {
    let alerts = Array.from(this.alerts.values());

    if (acknowledged !== null) {
      alerts = alerts.filter(a => a.acknowledged === acknowledged);
    }

    return alerts.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  getStatistics() {
    // Clean up expired blocks
    const now = new Date();
    for (const [ip, block] of this.blockedIps) {
      if (new Date(block.expiresAt) < now) {
        this.blacklist.delete(ip);
        this.blockedIps.delete(ip);
      }
    }

    return {
      requests: {
        total: this.stats.totalRequests,
        blocked: this.stats.blockedRequests,
        rateLimited: this.stats.rateLimitedRequests,
        malicious: this.stats.maliciousRequests
      },
      rules: {
        total: this.rules.size,
        active: Array.from(this.rules.values()).filter(r => r.enabled).length
      },
      blocked: {
        ips: this.stats.ipsBlocked,
        active: this.blacklist.size
      },
      whitelist: {
        ips: this.whitelist.size
      }
    };
  }

  listRules() {
    return Array.from(this.rules.values()).sort((a, b) => b.priority - a.priority);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const protector = new AgentDDoSProtector({
    requestLimit: 100,
    windowSize: 60000,
    autoBlock: true
  });

  switch (command) {
    case 'check':
      const result = protector.checkRequest({
        ip: args[1] || '192.168.1.1',
        path: args[2] || '/api/test',
        method: 'GET',
        body: ''
      });
      console.log('Check result:', result);
      break;

    case 'list-rules':
      console.log('Rules:', protector.listRules());
      break;

    case 'demo':
      console.log('=== Agent DDoS Protector Demo ===\n');

      // List rules
      console.log('1. Protection Rules:');
      const rules = protector.listRules();
      rules.forEach(r => {
        console.log(`   - ${r.name} (${r.type}, ${r.action}, priority: ${r.priority})`);
      });

      // Add to whitelist
      console.log('\n2. Adding to whitelist:');
      protector.addToWhitelist('10.0.0.1');
      protector.addToWhitelist('192.168.1.100');
      console.log('   Added internal IPs to whitelist');

      // Process normal requests
      console.log('\n3. Processing Normal Requests:');
      for (let i = 0; i < 5; i++) {
        const result = protector.checkRequest({
          ip: '192.168.1.50',
          path: '/api/data',
          method: 'GET',
          timestamp: new Date().toISOString()
        });
        console.log(`   Request ${i + 1}: ${result.allowed ? 'ALLOWED' : 'BLOCKED'}`);
      }

      // Process requests from whitelisted IP
      console.log('\n4. Processing Whitelisted Requests:');
      for (let i = 0; i < 3; i++) {
        const result = protector.checkRequest({
          ip: '10.0.0.1',
          path: '/api/admin',
          method: 'GET',
          timestamp: new Date().toISOString()
        });
        console.log(`   Request: ${result.allowed ? 'ALLOWED' : 'BLOCKED'} (${result.reason})`);
      }

      // Simulate attack
      console.log('\n5. Simulating Attack:');
      for (let i = 0; i < 150; i++) {
        protector.checkRequest({
          ip: '1.2.3.4',
          path: '/api/attack',
          method: 'GET',
          timestamp: new Date().toISOString()
        });
      }
      console.log('   Sent 150 requests from attacker IP');

      // Check blocked IP
      console.log('\n6. Checking Blocked IP:');
      const blockedCheck = protector.checkRequest({
        ip: '1.2.3.4',
        path: '/api/test',
        method: 'GET',
        timestamp: new Date().toISOString()
      });
      console.log(`   Request: ${blockedCheck.allowed ? 'ALLOWED' : 'BLOCKED'} (${blockedCheck.reason})`);

      // Add to blacklist manually
      console.log('\n7. Adding to Blacklist:');
      protector.addToBlacklist('5.6.7.8', 'Suspicious activity');
      console.log('   Manually blocked IP: 5.6.7.8');

      // Get alerts
      console.log('\n8. Active Alerts:');
      const alerts = protector.getAlerts(false);
      console.log('   Total alerts:', alerts.length);
      alerts.forEach(a => {
        console.log(`   - [${a.type}] ${a.message}`);
      });

      // Get statistics
      console.log('\n9. Statistics:');
      const stats = protector.getStatistics();
      console.log('   Total Requests:', stats.requests.total);
      console.log('   Blocked Requests:', stats.requests.blocked);
      console.log('   Rate Limited:', stats.requests.rateLimited);
      console.log('   Malicious:', stats.requests.malicious);
      console.log('   IPs Blocked:', stats.blocked.ips);
      console.log('   Active Blocked:', stats.blocked.active);
      console.log('   Whitelist:', stats.whitelist.ips);

      // List rules with hits
      console.log('\n10. Rule Statistics:');
      const updatedRules = protector.listRules();
      updatedRules.forEach(r => {
        console.log(`    - ${r.name}: ${r.hits} hits`);
      });

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-ddos.js <command> [args]');
      console.log('\nCommands:');
      console.log('  check [ip] [path]     Check a request');
      console.log('  list-rules            List protection rules');
      console.log('  demo                  Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentDDoSProtector;
