/**
 * Agent WAF - Web Application Firewall Agent
 *
 * Manages web application firewall rules, threat blocking, and request filtering.
 *
 * Usage: node agent-waf.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   rules      - List firewall rules
 *   blocks     - List blocked requests
 */

class WAFRule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.action = config.action; // block, allow, log, challenge
    this.condition = config.condition; // pattern, ip, geo, rate
    this.pattern = config.pattern || null;
    this.enabled = config.enabled !== false;
    this.priority = config.priority || 100;
    this.hitCount = config.hitCount || 0;
  }
}

class BlockedRequest {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.ip = config.ip;
    this.url = config.url;
    this.method = config.method;
    this.reason = config.reason;
    this.rule = config.rule;
    this.timestamp = config.timestamp || new Date().toISOString();
    this.country = config.country || null;
  }
}

class WAFAgent {
  constructor() {
    this.rules = new Map();
    this.blocked = new Map();
    this.whitelist = new Set();
    this.blacklist = new Set();
    this.stats = { requests: 0, blocked: 0, allowed: 0 };
    this._initSampleData();
  }

  _initSampleData() {
    // Sample WAF rules
    const rules = [
      { name: 'Block SQL Injection', action: 'block', condition: 'pattern', pattern: ".*('|;|--|\\/\\*).*", priority: 100 },
      { name: 'Block XSS Attack', action: 'block', condition: 'pattern', pattern: ".*(<script|javascript:|onerror=).*", priority: 90 },
      { name: 'Block Path Traversal', action: 'block', condition: 'pattern', pattern: ".*(\\.\\.|\\/etc\\/passwd).*", priority: 80 },
      { name: 'Rate Limit Check', action: 'challenge', condition: 'rate', pattern: '100/minute', priority: 70 },
      { name: 'Block Known IPs', action: 'block', condition: 'ip', priority: 60 },
      { name: 'Allow Internal', action: 'allow', condition: 'ip', pattern: '10.*', priority: 50 },
      { name: 'Block High Risk Countries', action: 'block', condition: 'geo', priority: 40 },
      { name: 'Log Suspicious Requests', action: 'log', condition: 'pattern', pattern: '.*(union|select|insert).*', priority: 30 }
    ];

    rules.forEach(r => {
      const rule = new WAFRule(r);
      this.rules.set(rule.id, rule);
    });

    // Sample blocked requests
    const blocked = [
      { ip: '192.168.1.100', url: '/api/users', method: 'GET', reason: 'SQL Injection attempt', rule: 'Block SQL Injection', country: 'XX' },
      { ip: '10.0.0.50', url: '/admin', method: 'GET', reason: 'Path traversal attempt', rule: 'Block Path Traversal', country: 'XX' },
      { ip: '45.33.22.11', url: '/login', method: 'POST', reason: 'XSS attack', rule: 'Block XSS Attack', country: 'RU' },
      { ip: '185.220.101.1', url: '/api/data', method: 'GET', reason: 'Rate limit exceeded', rule: 'Rate Limit Check', country: 'DE' },
      { ip: '67.189.123.45', url: '/wp-admin', method: 'GET', reason: 'Known malicious IP', rule: 'Block Known IPs', country: 'US' }
    ];

    blocked.forEach(b => {
      const block = new BlockedRequest(b);
      this.blocked.set(block.id, block);
    });

    // Sample whitelist/blacklist
    this.whitelist = new Set(['10.0.0.0/8', '192.168.0.0/16', '172.16.0.0/12']);
    this.blacklist = new Set(['45.33.22.11', '185.220.101.0/24', '91.121.0.0/16']);
  }

  // Add rule
  addRule(name, action, condition, pattern = null) {
    const rule = new WAFRule({ name, action, condition, pattern });
    this.rules.set(rule.id, rule);
    return rule;
  }

  // Get rules
  getRules(filter = {}) {
    let rules = Array.from(this.rules.values());

    if (filter.action) {
      rules = rules.filter(r => r.action === filter.action);
    }
    if (filter.enabled !== undefined) {
      rules = rules.filter(r => r.enabled === filter.enabled);
    }

    return rules.sort((a, b) => b.priority - a.priority);
  }

  // Enable/disable rule
  toggleRule(ruleId, enabled) {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rule ${ruleId} not found`);
    }
    rule.enabled = enabled;
    return rule;
  }

  // Check request
  checkRequest(ip, url, method) {
    this.stats.requests++;

    // Check whitelist
    if (this.isWhitelisted(ip)) {
      this.stats.allowed++;
      return { allowed: true, reason: 'whitelisted' };
    }

    // Check blacklist
    if (this.isBlacklisted(ip)) {
      this.stats.blocked++;
      this._blockRequest(ip, url, method, 'Blacklisted IP', 'Block Known IPs');
      return { allowed: false, reason: 'blacklisted' };
    }

    // Check rules
    const sortedRules = this.getRules({ enabled: true });

    for (const rule of sortedRules) {
      if (this._matchesRule(ip, url, method, rule)) {
        if (rule.action === 'block') {
          this.stats.blocked++;
          rule.hitCount++;
          this._blockRequest(ip, url, method, rule.name, rule.name);
          return { allowed: false, reason: rule.name, rule: rule.id };
        } else if (rule.action === 'challenge') {
          return { allowed: false, reason: 'challenge', action: 'challenge' };
        } else if (rule.action === 'allow') {
          this.stats.allowed++;
          return { allowed: true, reason: rule.name };
        }
      }
    }

    this.stats.allowed++;
    return { allowed: true, reason: 'default' };
  }

  // Check if IP is whitelisted
  isWhitelisted(ip) {
    return Array.from(this.whitelist).some(range => this._ipInRange(ip, range));
  }

  // Check if IP is blacklisted
  isBlacklisted(ip) {
    return this.blacklist.has(ip);
  }

  // Add to whitelist
  addToWhitelist(ipOrRange) {
    this.whitelist.add(ipOrRange);
  }

  // Add to blacklist
  addToBlacklist(ipOrRange) {
    this.blacklist.add(ipOrRange);
  }

  // Get blocked requests
  getBlockedRequests(limit = 20) {
    return Array.from(this.blocked.values())
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);
  }

  // Get statistics
  getStats() {
    const rules = this.getRules();

    return {
      ...this.stats,
      totalRules: rules.length,
      enabledRules: rules.filter(r => r.enabled).length,
      totalBlocked: this.blocked.size,
      blockRate: this.stats.requests > 0
        ? ((this.stats.blocked / this.stats.requests) * 100).toFixed(2)
        : 0
    };
  }

  // Helper methods
  _matchesRule(ip, url, method, rule) {
    switch (rule.condition) {
      case 'pattern':
        return rule.pattern && new RegExp(rule.pattern, 'i').test(url);
      case 'ip':
        return rule.pattern && this._ipInRange(ip, rule.pattern);
      case 'geo':
        return false; // Would check geo here
      case 'rate':
        return Math.random() < 0.1; // Simulated
      default:
        return false;
    }
  }

  _ipInRange(ip, range) {
    if (range.includes('/')) {
      // CIDR notation - simplified check
      return ip.startsWith(range.split('/')[0].split('.')[0]);
    }
    return ip === range || ip.startsWith(range.split('.')[0]);
  }

  _blockRequest(ip, url, method, reason, rule) {
    const blocked = new BlockedRequest({ ip, url, method, reason, rule });
    this.blocked.set(blocked.id, blocked);
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const waf = new WAFAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent WAF Demo\n');

    // 1. List rules
    console.log('1. WAF Rules:');
    const rules = waf.getRules();
    console.log(`   Total: ${rules.length}`);
    rules.slice(0, 5).forEach(r => {
      console.log(`   - ${r.name}: ${r.action} (priority: ${r.priority}) ${r.enabled ? '' : '[disabled]'}`);
    });

    // 2. Check request - allowed
    console.log('\n2. Check Request (Allowed):');
    const allowedRequest = waf.checkRequest('10.0.0.1', '/api/users', 'GET');
    console.log(`   10.0.0.1 -> /api/users: ${allowedRequest.allowed ? 'ALLOWED' : 'BLOCKED'} (${allowedRequest.reason})`);

    // 3. Check request - blocked (SQLi)
    console.log('\n3. Check Request (SQL Injection):');
    const blockedRequest = waf.checkRequest('192.168.1.50', "/api/users' OR '1'='1", 'GET');
    console.log(`   Blocked: ${blockedRequest.allowed ? 'ALLOWED' : 'BLOCKED'} (${blockedRequest.reason})`);

    // 4. Check request - blocked (XSS)
    console.log('\n4. Check Request (XSS):');
    const xssRequest = waf.checkRequest('45.33.22.11', '/comment?text=<script>alert(1)</script>', 'POST');
    console.log(`   Blocked: ${xssRequest.allowed ? 'ALLOWED' : 'BLOCKED'} (${xssRequest.reason})`);

    // 5. Add to blacklist
    console.log('\n5. Add to Blacklist:');
    waf.addToBlacklist('203.0.113.0/24');
    console.log(`   Added: 203.0.113.0/24 to blacklist`);

    // 6. Check blacklisted IP
    console.log('\n6. Check Blacklisted IP:');
    const blacklistedRequest = waf.checkRequest('203.0.113.50', '/api/data', 'GET');
    console.log(`   Result: ${blacklistedRequest.allowed ? 'ALLOWED' : 'BLOCKED'} (${blacklistedRequest.reason})`);

    // 7. Blocked requests
    console.log('\n7. Blocked Requests:');
    const blocked = waf.getBlockedRequests(5);
    console.log(`   Total: ${blocked.length}`);
    blocked.forEach(b => {
      console.log(`   - ${b.ip} -> ${b.url}: ${b.reason}`);
    });

    // 8. Toggle rule
    console.log('\n8. Toggle Rule:');
    const ruleToToggle = rules[0];
    const toggled = waf.toggleRule(ruleToToggle.id, false);
    console.log(`   Disabled: ${toggled.name}`);

    // 9. Add new rule
    console.log('\n9. Add New Rule:');
    const newRule = waf.addRule('Block Command Injection', 'block', 'pattern', '.*(;|\\||&|`).*');
    console.log(`   Created: ${newRule.name}`);

    // 10. Statistics
    console.log('\n10. Get Statistics:');
    const stats = waf.getStats();
    console.log(`    Requests: ${stats.requests}`);
    console.log(`    Allowed: ${stats.allowed}`);
    console.log(`    Blocked: ${stats.blocked}`);
    console.log(`    Block Rate: ${stats.blockRate}%`);
    console.log(`    Rules: ${stats.enabledRules}/${stats.totalRules} enabled`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'rules':
    console.log('WAF Rules:');
    waf.getRules().forEach(r => {
      console.log(`  ${r.name}: ${r.action} [${r.enabled ? 'enabled' : 'disabled'}]`);
    });
    break;

  case 'blocks':
    console.log('Blocked Requests:');
    waf.getBlockedRequests().forEach(b => {
      console.log(`  ${b.ip}: ${b.url} - ${b.reason}`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-waf.js [demo|rules|blocks]');
}
