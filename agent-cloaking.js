/**
 * Agent Cloaking - Cloaking Detection Module
 *
 * Detects cloaking (showing different content to search engines vs users).
 *
 * Usage: node agent-cloaking.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   detect     - Run cloaking detection
 *   report     - Generate detection report
 */

class CloakingCheck {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.url = config.url;
    this.timestamp = config.timestamp ? new Date(config.timestamp) : new Date();
    this.userAgent = config.userAgent || 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    this.results = config.results || {};
  }
}

class CloakDetector {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name || 'CloakDetector';
    this.userAgents = config.userAgents || [
      { name: 'Googlebot', ua: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
      { name: 'Bingbot', ua: 'Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)' },
      { name: 'Slurp', ua: 'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)' },
      { name: 'DuckDuckBot', ua: 'DuckDuckBot/1.0; (+http://duckduckgo.com/duckduckbot.html)' },
      { name: 'YandexBot', ua: 'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)' }
    ];
    this.sensitivity = config.sensitivity || 0.8; // 0-1, higher = more strict
  }

  // Simulate fetching content with different user agents
  fetchContent(url, userAgent) {
    // In production, this would make actual HTTP requests
    // Simulate different content based on user agent
    const isBot = userAgent.includes('bot') || userAgent.includes('Spider');

    if (isBot) {
      // Bot sees SEO-optimized content
      return {
        statusCode: 200,
        title: 'Best Widgets for Sale - Cheap Prices',
        description: 'Buy the best widgets online. Great quality, low prices.',
        content: 'Welcome to our widget store. We sell the best widgets...',
        links: ['/about', '/products', '/contact'],
        h1Count: 3,
        wordCount: 500
      };
    } else {
      // Regular user sees different content
      return {
        statusCode: 200,
        title: 'Amazing Deals on Widgets!',
        description: 'Shop now for exclusive discounts on widgets!',
        content: 'Hello! Welcome to our amazing widget shop where we have...',
        links: ['/sale', '/new', '/cart'],
        h1Count: 1,
        wordCount: 800
      };
    }
  }

  // Compare two content versions
  compareContent(botContent, userContent) {
    const differences = [];
    let score = 0;

    // Check title
    if (botContent.title !== userContent.title) {
      differences.push({
        type: 'title',
        bot: botContent.title,
        user: userContent.title,
        severity: 0.7
      });
      score += 0.7;
    }

    // Check description
    if (botContent.description !== userContent.description) {
      differences.push({
        type: 'description',
        bot: botContent.description,
        user: userContent.description,
        severity: 0.6
      });
      score += 0.6;
    }

    // Check content similarity (simplified)
    const contentSimilarity = this._calculateSimilarity(botContent.content, userContent.content);
    if (contentSimilarity < 0.5) {
      differences.push({
        type: 'content',
        similarity: contentSimilarity,
        severity: 1 - contentSimilarity
      });
      score += (1 - contentSimilarity);
    }

    // Check link count
    const linkDiff = Math.abs(botContent.links.length - userContent.links.length);
    if (linkDiff > 2) {
      differences.push({
        type: 'links',
        bot: botContent.links.length,
        user: userContent.links.length,
        severity: 0.5
      });
      score += 0.5;
    }

    // Check h1 count
    if (botContent.h1Count !== userContent.h1Count) {
      differences.push({
        type: 'h1_count',
        bot: botContent.h1Count,
        user: userContent.h1Count,
        severity: 0.3
      });
      score += 0.3;
    }

    return {
      differences,
      score: Math.min(score / 3, 1), // Normalize to 0-1
      isCloaking: (score / 3) > this.sensitivity
    };
  }

  _calculateSimilarity(text1, text2) {
    // Simplified Jaccard similarity
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return union.size === 0 ? 1 : intersection.size / union.size;
  }

  // Detect cloaking for a URL
  detect(url) {
    const results = {
      url,
      timestamp: new Date(),
      checks: []
    };

    // Get user content first (regular browser)
    const userContent = this.fetchContent(url, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    // Check with each bot user agent
    this.userAgents.forEach(bot => {
      const botContent = this.fetchContent(url, bot.ua);
      const comparison = this.compareContent(botContent, userContent);

      results.checks.push({
        bot: bot.name,
        userAgent: bot.ua,
        isCloaking: comparison.isCloaking,
        score: comparison.score,
        differences: comparison.differences
      });
    });

    // Overall result
    const cloakingDetected = results.checks.some(c => c.isCloaking);
    const avgScore = results.checks.reduce((sum, c) => sum + c.score, 0) / results.checks.length;

    results.summary = {
      cloakingDetected,
      confidence: avgScore,
      affectedBots: results.checks.filter(c => c.isCloaking).map(c => c.bot),
      severity: avgScore > 0.8 ? 'high' : avgScore > 0.5 ? 'medium' : 'low'
    };

    return results;
  }
}

class CloakingManager {
  constructor() {
    this.detectors = new Map();
    this.history = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Create default detector
    const detector = new CloakDetector({
      name: 'Default Detector',
      sensitivity: 0.7
    });
    this.detectors.set(detector.id, detector);
  }

  createDetector(options = {}) {
    const detector = new CloakDetector(options);
    this.detectors.set(detector.id, detector);
    return detector;
  }

  runDetection(url, detectorId = null) {
    let detector;
    if (detectorId) {
      detector = this.detectors.get(detectorId);
      if (!detector) throw new Error('Detector not found');
    } else {
      detector = Array.from(this.detectors.values())[0];
    }

    const result = detector.detect(url);

    // Save to history
    const check = new CloakingCheck({
      url,
      results: result
    });
    this.history.set(check.id, check);

    return result;
  }

  getHistory(url = null) {
    let allChecks = Array.from(this.history.values());

    if (url) {
      allChecks = allChecks.filter(c => c.url === url);
    }

    return allChecks.sort((a, b) => b.timestamp - a.timestamp);
  }

  getStats() {
    const allChecks = Array.from(this.history.values());
    const total = allChecks.length;
    const detected = allChecks.filter(c => c.results.summary.cloakingDetected).length;

    return {
      totalChecks: total,
      cloakingDetected: detected,
      detectionRate: total > 0 ? (detected / total * 100).toFixed(2) + '%' : '0%'
    };
  }

  generateReport(urls) {
    let report = '=== Cloaking Detection Report ===\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    const results = [];
    urls.forEach(url => {
      const result = this.runDetection(url);
      results.push(result);
    });

    const totalUrls = results.length;
    const cloakingFound = results.filter(r => r.summary.cloakingDetected).length;

    report += `Summary:\n`;
    report += `- Total URLs checked: ${totalUrls}\n`;
    report += `- Cloaking detected: ${cloakingFound}\n`;
    report += `- Clean URLs: ${totalUrls - cloakingFound}\n\n`;

    results.forEach(r => {
      report += `URL: ${r.url}\n`;
      report += `  Status: ${r.summary.cloakingDetected ? 'CLOAKING DETECTED' : 'Clean'}\n`;
      report += `  Confidence: ${(r.summary.confidence * 100).toFixed(1)}%\n`;
      report += `  Severity: ${r.summary.severity}\n`;
      if (r.summary.affectedBots.length > 0) {
        report += `  Affected bots: ${r.summary.affectedBots.join(', ')}\n`;
      }
      report += '\n';
    });

    return report;
  }
}

function runDemo() {
  console.log('=== Agent Cloaking Demo\n');

  const mgr = new CloakingManager();

  console.log('1. Detect Cloaking:');
  const result1 = mgr.runDetection('https://example.com/');
  console.log(`   URL: ${result1.url}`);
  console.log(`   Cloaking detected: ${result1.summary.cloakingDetected}`);
  console.log(`   Confidence: ${(result1.summary.confidence * 100).toFixed(1)}%`);
  console.log(`   Severity: ${result1.summary.severity}`);
  console.log(`   Affected bots: ${result1.summary.affectedBots.join(', ') || 'None'}`);

  console.log('\n2. Check Another URL:');
  const result2 = mgr.runDetection('https://shop-example.com/');
  console.log(`   URL: ${result2.url}`);
  console.log(`   Cloaking detected: ${result2.summary.cloakingDetected}`);
  console.log(`   Confidence: ${(result2.summary.confidence * 100).toFixed(1)}%`);

  console.log('\n3. Check Another URL (clean):');
  const result3 = mgr.runDetection('https://clean-site.com/');
  console.log(`   URL: ${result3.url}`);
  console.log(`   Cloaking detected: ${result3.summary.cloakingDetected}`);
  console.log(`   Confidence: ${(result3.summary.confidence * 100).toFixed(1)}%`);

  console.log('\n4. Detailed Check:');
  const check = result1.checks[0];
  console.log(`   Bot: ${check.bot}`);
  console.log(`   Is cloaking: ${check.isCloaking}`);
  console.log(`   Score: ${(check.score * 100).toFixed(1)}%`);
  console.log(`   Differences: ${check.differences.length}`);
  check.differences.forEach(d => {
    console.log(`   - ${d.type}: severity ${(d.severity * 100).toFixed(0)}%`);
  });

  console.log('\n5. Get History:');
  const history = mgr.getHistory();
  console.log(`   Total checks: ${history.length}`);

  console.log('\n6. Get Statistics:');
  const stats = mgr.getStats();
  console.log(`   Total checks: ${stats.totalChecks}`);
  console.log(`   Cloaking detected: ${stats.cloakingDetected}`);
  console.log(`   Detection rate: ${stats.detectionRate}`);

  console.log('\n7. Generate Report:');
  const report = mgr.generateReport(['https://site1.com', 'https://site2.com', 'https://site3.com']);
  console.log(report);

  console.log('=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new CloakingManager();

if (command === 'demo') runDemo();
else if (command === 'detect') {
  const [url] = args.slice(1);
  if (!url) {
    console.log('Usage: node agent-cloaking.js detect <url>');
    process.exit(1);
  }
  const result = mgr.runDetection(url);
  console.log(JSON.stringify(result, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else if (command === 'report') {
  const urls = args.slice(1);
  if (urls.length === 0) {
    console.log('Usage: node agent-cloaking.js report <url1> [url2] ...');
    process.exit(1);
  }
  console.log(mgr.generateReport(urls));
}
else console.log('Usage: node agent-cloaking.js [demo|detect|report]');
