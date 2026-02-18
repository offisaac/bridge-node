/**
 * Agent CDN2 - Advanced CDN Management Agent
 *
 * Manages advanced CDN configurations, edge computing, real-time analytics, and multi-region failover.
 *
 * Usage: node agent-cdn2.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   edges      - List edge locations
 *   rules      - List routing rules
 */

class EdgeLocation {
  constructor(config) {
    this.id = `edge-${Date.now()}`;
    this.name = config.name;
    this.region = config.region;
    this.country = config.country;
    this.city = config.city;
    this.latency = config.latency || 0;
    this.capacity = config.capacity || 100; // percentage
    this.status = 'active'; // active, degraded, offline
    this.requests = 0;
    this.bandwidth = 0;
  }
}

class RoutingRule {
  constructor(config) {
    this.id = `rule-${Date.now()}`;
    this.name = config.name;
    this.condition = config.condition; // geo, latency, load, header
    this.action = config.action; // route, redirect, block, cache
    this.target = config.target;
    this.priority = config.priority || 100;
    this.enabled = config.enabled !== false;
  }
}

class OriginPool {
  constructor(config) {
    this.id = `pool-${Date.now()}`;
    this.name = config.name;
    this.origins = config.origins || [];
    this.loadBalancing = config.loadBalancing || 'round-robin'; // round-robin, least-connections, geo
    this.healthCheck = config.healthCheck || { enabled: true, interval: 30 };
    this.failover = config.failover || { enabled: true, threshold: 3 };
    this.status = 'healthy';
  }

  getNextOrigin() {
    if (this.origins.length === 0) return null;
    const index = Math.floor(Math.random() * this.origins.length);
    return this.origins[index];
  }
}

class CacheConfig {
  constructor(config) {
    this.id = `cache-${Date.now()}`;
    this.name = config.name;
    this.pattern = config.pattern;
    this.ttl = config.ttl || 3600;
    this.staleTTL = config.staleTTL || 86400;
    this.cacheControl = config.cacheControl || 'public';
    this.edgeOnly = config.edgeOnly || false;
    this.compression = config.compression || 'gzip';
  }
}

class SecurityConfig {
  constructor(config) {
    this.id = `security-${Date.now()}`;
    this.ddosProtection = config.ddosProtection || { enabled: true, level: 'standard' };
    this.waf = config.waf || { enabled: false, rules: [] };
    this.botProtection = config.botProtection || { enabled: false };
    this.ssl = config.ssl || { enabled: true, minVersion: 'TLS 1.2' };
  }
}

class CDN2Agent {
  constructor(config = {}) {
    this.edgeLocations = new Map();
    this.routingRules = new Map();
    this.originPools = new Map();
    this.cacheConfigs = new Map();
    this.securityConfigs = new Map();
    this.analytics = new Map();
    this.stats = {
      totalRequests: 0,
      cacheHits: 0,
      missRate: 0,
      avgLatency: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo edge locations
    const locations = [
      { name: 'us-east-1', region: 'us-east', country: 'US', city: 'Virginia', latency: 5 },
      { name: 'us-west-1', region: 'us-west', country: 'US', city: 'California', latency: 15 },
      { name: 'eu-west-1', region: 'eu-west', country: 'IE', city: 'Dublin', latency: 80 },
      { name: 'ap-northeast-1', region: 'ap-northeast', country: 'JP', city: 'Tokyo', latency: 150 },
      { name: 'sa-east-1', region: 'sa-east', country: 'BR', city: 'Sao Paulo', latency: 120 }
    ];

    locations.forEach(l => {
      const edge = new EdgeLocation(l);
      edge.requests = Math.floor(Math.random() * 1000000);
      edge.bandwidth = Math.floor(Math.random() * 500);
      this.edgeLocations.set(edge.id, edge);
    });

    // Demo routing rules
    const rules = [
      { name: 'Geo Routing US', condition: { type: 'geo', countries: ['US', 'CA'] }, action: 'route', target: 'us-east-1', priority: 10 },
      { name: 'Geo Routing EU', condition: { type: 'geo', countries: ['GB', 'DE', 'FR'] }, action: 'route', target: 'eu-west-1', priority: 20 },
      { name: 'Low Latency', condition: { type: 'latency', threshold: 50 }, action: 'route', target: 'auto', priority: 30 },
      { name: 'Block IPs', condition: { type: 'block', ips: ['192.168.1.0/24'] }, action: 'block', target: null, priority: 5 }
    ];

    rules.forEach(r => {
      const rule = new RoutingRule(r);
      this.routingRules.set(rule.id, rule);
    });

    // Demo origin pools
    const pools = [
      {
        name: 'primary-pool',
        origins: [
          { host: 'origin1.example.com', weight: 100 },
          { host: 'origin2.example.com', weight: 50 }
        ],
        loadBalancing: 'round-robin'
      },
      {
        name: 'media-pool',
        origins: [
          { host: 'media1.example.com', weight: 100 },
          { host: 'media2.example.com', weight: 100 }
        ],
        loadBalancing: 'least-connections'
      }
    ];

    pools.forEach(p => {
      const pool = new OriginPool(p);
      this.originPools.set(pool.id, pool);
    });

    // Demo cache configs
    const caches = [
      { name: 'Static Assets', pattern: '/static/*', ttl: 86400, compression: 'gzip' },
      { name: 'API Responses', pattern: '/api/*', ttl: 300, cacheControl: 'private' },
      { name: 'Images', pattern: '/*.jpg', ttl: 604800, edgeOnly: true },
      { name: 'HTML', pattern: '/*.html', ttl: 3600 }
    ];

    caches.forEach(c => {
      const cache = new CacheConfig(c);
      this.cacheConfigs.set(cache.id, cache);
    });

    // Demo security config
    const security = new SecurityConfig({
      ddosProtection: { enabled: true, level: 'high' },
      waf: { enabled: true, rules: ['sqli-prevention', 'xss-prevention'] },
      botProtection: { enabled: true },
      ssl: { enabled: true, minVersion: 'TLS 1.3' }
    });
    this.securityConfigs.set(security.id, security);

    // Demo analytics
    this.analytics.set('hourly', { requests: 5000000, bandwidth: '2.5TB', cacheHitRate: 92 });
    this.analytics.set('daily', { requests: 120000000, bandwidth: '60TB', cacheHitRate: 91 });
    this.analytics.set('monthly', { requests: 3600000000, bandwidth: '1.8PB', cacheHitRate: 90 });
  }

  addEdgeLocation(config) {
    const edge = new EdgeLocation(config);
    this.edgeLocations.set(edge.id, edge);
    console.log(`   Added edge location: ${edge.name} (${edge.city})`);
    return edge;
  }

  createRoutingRule(config) {
    const rule = new RoutingRule(config);
    this.routingRules.set(rule.id, rule);
    console.log(`   Created routing rule: ${rule.name}`);
    return rule;
  }

  createOriginPool(config) {
    const pool = new OriginPool(config);
    this.originPools.set(pool.id, pool);
    return pool;
  }

  createCacheConfig(config) {
    const cache = new CacheConfig(config);
    this.cacheConfigs.set(cache.id, cache);
    console.log(`   Created cache config: ${cache.name}`);
    return cache;
  }

  matchRequest(request) {
    const rules = Array.from(this.routingRules.values())
      .filter(r => r.enabled)
      .sort((a, b) => a.priority - b.priority);

    for (const rule of rules) {
      if (this.evaluateCondition(rule.condition, request)) {
        return rule;
      }
    }
    return null;
  }

  evaluateCondition(condition, request) {
    switch (condition.type) {
      case 'geo':
        return condition.countries.includes(request.country);
      case 'latency':
        return request.latency < condition.threshold;
      case 'block':
        return condition.ips.includes(request.ip);
      default:
        return false;
    }
  }

  getEdgeForRequest(request) {
    const edges = Array.from(this.edgeLocations.values())
      .filter(e => e.status === 'active')
      .sort((a, b) => a.latency - b.latency);

    if (request.country) {
      const geoEdge = edges.find(e => e.country === request.country);
      if (geoEdge) return geoEdge;
    }

    return edges[0] || null;
  }

  purgeCache(pattern) {
    const purged = Math.floor(Math.random() * 100000) + 10000;
    console.log(`   Purged ${purged} objects matching ${pattern}`);
    return { success: true, purged, pattern };
  }

  getAnalytics(period = 'hourly') {
    return this.analytics.get(period) || null;
  }

  getEdgeLocations() {
    return Array.from(this.edgeLocations.values());
  }

  getRoutingRules() {
    return Array.from(this.routingRules.values());
  }

  getStats() {
    const edges = this.getEdgeLocations();
    const totalRequests = edges.reduce((sum, e) => sum + e.requests, 0);
    const avgLatency = edges.reduce((sum, e) => sum + e.latency, 0) / edges.length;

    return {
      edgeLocations: edges.length,
      routingRules: this.routingRules.size,
      originPools: this.originPools.size,
      totalRequests,
      avgLatency: Math.round(avgLatency),
      cacheConfigs: this.cacheConfigs.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const cdn2 = new CDN2Agent();

switch (command) {
  case 'demo':
    console.log('=== Agent CDN2 Demo\n');

    // 1. List Edge Locations
    console.log('1. Edge Locations:');
    const edges = cdn2.getEdgeLocations();
    edges.forEach(e => {
      console.log(`   - ${e.name} (${e.city}): ${e.latency}ms latency`);
    });

    // 2. List Routing Rules
    console.log('\n2. Routing Rules:');
    const rules = cdn2.getRoutingRules();
    rules.forEach(r => {
      console.log(`   - ${r.name}: ${r.condition.type} -> ${r.action}`);
    });

    // 3. Add Edge Location
    console.log('\n3. Add Edge Location:');
    cdn2.addEdgeLocation({
      name: 'ap-south-1',
      region: 'ap-south',
      country: 'IN',
      city: 'Mumbai',
      latency: 180
    });

    // 4. Create Routing Rule
    console.log('\n4. Create Routing Rule:');
    cdn2.createRoutingRule({
      name: 'APAC Traffic',
      condition: { type: 'geo', countries: ['JP', 'KR', 'IN', 'SG'] },
      action: 'route',
      target: 'ap-northeast-1',
      priority: 25
    });

    // 5. Match Request (Geo)
    console.log('\n5. Request Routing:');
    const request1 = { country: 'US', latency: 10 };
    const matched1 = cdn2.matchRequest(request1);
    console.log(`   Request from US: ${matched1 ? matched1.name : 'default'}`);

    const request2 = { country: 'JP', latency: 150 };
    const matched2 = cdn2.matchRequest(request2);
    console.log(`   Request from JP: ${matched2 ? matched2.name : 'default'}`);

    // 6. Get Edge for Request
    console.log('\n6. Edge Selection:');
    const bestEdge = cdn2.getEdgeForRequest({ country: 'US' });
    console.log(`   Best edge: ${bestEdge?.name}`);

    // 7. Create Cache Config
    console.log('\n7. Create Cache Config:');
    cdn2.createCacheConfig({
      name: 'Video Files',
      pattern: '/*.mp4',
      ttl: 604800,
      staleTTL: 2592000
    });

    // 8. Purge Cache
    console.log('\n8. Purge Cache:');
    cdn2.purgeCache('/static/*');

    // 9. Analytics
    console.log('\n9. Analytics:');
    const hourly = cdn2.getAnalytics('hourly');
    console.log(`   Hourly: ${hourly.requests.toLocaleString()} requests, ${hourly.cacheHitRate}% cache hit`);

    const daily = cdn2.getAnalytics('daily');
    console.log(`   Daily: ${daily.requests.toLocaleString()} requests`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = cdn2.getStats();
    console.log(`   Edge Locations: ${stats.edgeLocations}`);
    console.log(`   Routing Rules: ${stats.routingRules}`);
    console.log(`   Origin Pools: ${stats.originPools}`);
    console.log(`   Total Requests: ${stats.totalRequests.toLocaleString()}`);
    console.log(`   Avg Latency: ${stats.avgLatency}ms`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'edges':
    console.log('Edge Locations:');
    cdn2.getEdgeLocations().forEach(e => {
      console.log(`  ${e.name}: ${e.city} (${e.latency}ms)`);
    });
    break;

  case 'rules':
    console.log('Routing Rules:');
    cdn2.getRoutingRules().forEach(r => {
      console.log(`  ${r.name}: ${r.action}`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-cdn2.js [demo|edges|rules]');
}
