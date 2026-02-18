/**
 * Agent CDN - CDN Management Agent
 *
 * Manages CDN configurations, cache rules, and content delivery.
 *
 * Usage: node agent-cdn.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   origins    - List origin servers
 *   rules      - List cache rules
 */

class Origin {
  constructor(config) {
    this.name = config.name;
    this.host = config.host;
    this.port = config.port || 80;
    this.protocol = config.protocol || 'https';
    this.weight = config.weight || 100;
    this.healthCheck = config.healthCheck || null;
    this.enabled = config.enabled !== false;
    this.backup = config.backup || false;
  }
}

class CacheRule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.pattern = config.pattern; // URL pattern
    this.ttl = config.ttl || 3600; // Time to live in seconds
    this.cacheControl = config.cacheControl || 'public';
    this.staleWhileRevalidate = config.staleWhileRevalidate || 60;
    this.varyHeaders = config.varyHeaders || ['Accept-Encoding'];
    this.enabled = config.enabled !== false;
    this.priority = config.priority || 100;
  }
}

class CDNZone {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.domain = config.domain;
    this.status = config.status || 'active';
    this.origins = config.origins || [];
    this.cors = config.cors || { enabled: false };
    this.ssl = config.ssl || { enabled: true, managed: true };
    this.analytics = config.analytics || { enabled: true };
  }
}

class CDNManager {
  constructor() {
    this.zones = new Map();
    this.origins = new Map();
    this.rules = new Map();
    this.analytics = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample origins
    const origins = [
      { name: 'primary-origin', host: 'origin.example.com', protocol: 'https', weight: 100 },
      { name: 'backup-origin', host: 'backup.example.com', protocol: 'https', weight: 50, backup: true },
      { name: 'asia-origin', host: 'asia.origin.example.com', protocol: 'https', weight: 100 },
      { name: 'eu-origin', host: 'eu.origin.example.com', protocol: 'https', weight: 100 }
    ];

    origins.forEach(o => {
      const origin = new Origin(o);
      this.origins.set(origin.name, origin);
    });

    // Sample cache rules
    const rules = [
      { name: 'Static Assets', pattern: '/static/*', ttl: 86400, cacheControl: 'public', priority: 10, enabled: true },
      { name: 'Images', pattern: '/*.jpg', ttl: 604800, cacheControl: 'public', priority: 20, enabled: true },
      { name: 'API Responses', pattern: '/api/*', ttl: 300, cacheControl: 'private', priority: 5, enabled: true },
      { name: 'HTML Pages', pattern: '/*.html', ttl: 3600, cacheControl: 'public', priority: 15, enabled: true },
      { name: 'User Data', pattern: '/user/*', ttl: 0, cacheControl: 'no-cache', priority: 1, enabled: true }
    ];

    rules.forEach(r => {
      const rule = new CacheRule(r);
      this.rules.set(rule.id, rule);
    });

    // Sample zones
    const zones = [
      {
        name: 'main-zone',
        domain: 'example.com',
        status: 'active',
        origins: ['primary-origin', 'backup-origin'],
        cors: { enabled: true, origins: ['https://app.example.com'] },
        ssl: { enabled: true, managed: true }
      },
      {
        name: 'media-zone',
        domain: 'media.example.com',
        status: 'active',
        origins: ['asia-origin', 'eu-origin'],
        cors: { enabled: false },
        ssl: { enabled: true, managed: true }
      }
    ];

    zones.forEach(z => {
      const zone = new CDNZone(z);
      this.zones.set(zone.id, zone);
    });

    // Sample analytics
    this.analytics.set('main-zone', {
      requests: 1000000,
      bandwidth: '500GB',
      cacheHitRate: 85,
      avgLatency: 45,
      errorRate: 0.1
    });

    this.analytics.set('media-zone', {
      requests: 500000,
      bandwidth: '1.2TB',
      cacheHitRate: 92,
      avgLatency: 30,
      errorRate: 0.05
    });
  }

  // Create zone
  createZone(name, domain, origins = []) {
    const zone = new CDNZone({ name, domain, origins });
    this.zones.set(zone.id, zone);
    return zone;
  }

  // Get zone
  getZone(zoneId) {
    return this.zones.get(zoneId) || null;
  }

  // List zones
  listZones() {
    return Array.from(this.zones.values());
  }

  // Add origin to zone
  addOrigin(zoneId, originName) {
    const zone = this.zones.get(zoneId);
    if (!zone) {
      throw new Error(`Zone ${zoneId} not found`);
    }

    if (!this.origins.has(originName)) {
      throw new Error(`Origin ${originName} not found`);
    }

    zone.origins.push(originName);
    return zone;
  }

  // Create cache rule
  createRule(name, pattern, config = {}) {
    const rule = new CacheRule({ name, pattern, ...config });
    this.rules.set(rule.id, rule);
    return rule;
  }

  // Get rules
  listRules() {
    return Array.from(this.rules.values()).sort((a, b) => b.priority - a.priority);
  }

  // Match rule
  matchRule(url) {
    const rules = this.listRules().filter(r => r.enabled);

    for (const rule of rules) {
      // Simple pattern matching
      const pattern = rule.pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');

      if (new RegExp(`^${pattern}$`).test(url)) {
        return rule;
      }
    }

    return null;
  }

  // Get analytics
  getAnalytics(zoneId = null) {
    if (zoneId) {
      return this.analytics.get(zoneId) || null;
    }
    return Array.from(this.analytics.entries()).map(([zoneId, data]) => ({
      zoneId,
      ...data
    }));
  }

  // Purge cache
  purgeCache(zoneId, pattern = '/*') {
    const zone = this.zones.get(zoneId);
    if (!zone) {
      throw new Error(`Zone ${zoneId} not found`);
    }

    return {
      zoneId,
      pattern,
      purged: Math.floor(Math.random() * 10000) + 1000,
      timestamp: new Date().toISOString()
    };
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

  // Get statistics
  getStats() {
    const zones = this.listZones();
    const rules = this.listRules();

    const totalRequests = Array.from(this.analytics.values())
      .reduce((sum, a) => sum + a.requests, 0);

    const avgCacheHit = Array.from(this.analytics.values())
      .reduce((sum, a, _, arr) => sum + a.cacheHitRate / arr.length, 0);

    return {
      totalZones: zones.length,
      activeZones: zones.filter(z => z.status === 'active').length,
      totalOrigins: this.origins.size,
      totalRules: rules.length,
      enabledRules: rules.filter(r => r.enabled).length,
      totalRequests,
      avgCacheHitRate: Math.round(avgCacheHit)
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const cdn = new CDNManager();

switch (command) {
  case 'demo':
    console.log('=== Agent CDN Demo\n');

    // 1. List zones
    console.log('1. List CDN Zones:');
    const zones = cdn.listZones();
    zones.forEach(z => {
      console.log(`   - ${z.name}: ${z.domain} [${z.status}]`);
    });

    // 2. List origins
    console.log('\n2. List Origins:');
    const origins = Array.from(cdn.origins.values());
    origins.forEach(o => {
      console.log(`   - ${o.name}: ${o.protocol}://${o.host} weight=${o.weight} ${o.backup ? '(backup)' : ''}`);
    });

    // 3. List cache rules
    console.log('\n3. List Cache Rules:');
    const rules = cdn.listRules();
    rules.forEach(r => {
      console.log(`   - ${r.name}: ${r.pattern} TTL=${r.ttl}s ${r.enabled ? '' : '[disabled]'}`);
    });

    // 4. Match cache rule
    console.log('\n4. Cache Rule Matching:');
    const urls = [
      '/static/js/app.js',
      '/api/users/123',
      '/images/photo.jpg',
      '/user/profile'
    ];

    urls.forEach(url => {
      const rule = cdn.matchRule(url);
      if (rule) {
        console.log(`   ${url} -> ${rule.name} (TTL: ${rule.ttl}s)`);
      } else {
        console.log(`   ${url} -> NO MATCH`);
      }
    });

    // 5. Create new zone
    console.log('\n5. Create New Zone:');
    const newZone = cdn.createZone('api-zone', 'api.example.com', ['primary-origin']);
    console.log(`   Created: ${newZone.name} (${newZone.domain})`);

    // 6. Add origin to zone
    console.log('\n6. Add Origin to Zone:');
    const updatedZone = cdn.addOrigin(zones[0].id, 'asia-origin');
    console.log(`   Added: asia-origin to ${updatedZone.name}`);

    // 7. Create cache rule
    console.log('\n7. Create Cache Rule:');
    const newRule = cdn.createRule('Font Files', '/*.woff2', {
      ttl: 2592000,
      priority: 25
    });
    console.log(`   Created: ${newRule.name} (${newRule.pattern}) TTL=${newRule.ttl}s`);

    // 8. Analytics
    console.log('\n8. CDN Analytics:');
    const analytics = cdn.getAnalytics();
    analytics.forEach(a => {
      console.log(`   ${a.zoneId}:`);
      console.log(`     Requests: ${a.requests.toLocaleString()}`);
      console.log(`     Bandwidth: ${a.bandwidth}`);
      console.log(`     Cache Hit: ${a.cacheHitRate}%`);
    });

    // 9. Purge cache
    console.log('\n9. Purge Cache:');
    const purge = cdn.purgeCache(zones[0].id, '/static/*');
    console.log(`   Purged: ${purge.pattern} (${purge.purged} files)`);

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const stats = cdn.getStats();
    console.log(`    Zones: ${stats.activeZones}/${stats.totalZones} active`);
    console.log(`    Origins: ${stats.totalOrigins}`);
    console.log(`    Rules: ${stats.enabledRules}/${stats.totalRules} enabled`);
    console.log(`    Total requests: ${stats.totalRequests.toLocaleString()}`);
    console.log(`    Avg cache hit: ${stats.avgCacheHitRate}%`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'origins':
    console.log('Origin Servers:');
    Array.from(cdn.origins.values()).forEach(o => {
      console.log(`  ${o.name}: ${o.protocol}://${o.host}`);
    });
    break;

  case 'rules':
    console.log('Cache Rules:');
    cdn.listRules().forEach(r => {
      console.log(`  ${r.name}: ${r.pattern} (TTL: ${r.ttl}s)`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-cdn.js [demo|origins|rules]');
}
