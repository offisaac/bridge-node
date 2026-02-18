/**
 * Agent Social Mention - Social Media Mention Tracking Module
 *
 * Tracks and analyzes brand/keyword mentions across social media platforms.
 *
 * Usage: node agent-social-mention.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   track      - Track a keyword
 *   mentions   - Get mentions for a keyword
 *   report     - Generate mention report
 */

class SocialMention {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.keyword = config.keyword;
    this.platform = config.platform; // twitter, facebook, instagram, linkedin, reddit, youtube
    this.author = config.author;
    this.content = config.content;
    this.url = config.url || null;
    this.sentiment = config.sentiment || 'neutral'; // positive, negative, neutral
    this.engagement = config.engagement || { likes: 0, shares: 0, comments: 0 };
    this.timestamp = config.timestamp ? new Date(config.timestamp) : new Date();
    this.language = config.language || 'en';
  }
}

class TrackedKeyword {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.keyword = config.keyword;
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
    this.mentionCount = config.mentionCount || 0;
    this.alerts = config.alerts || []; // Array of alert configurations
  }
}

class SocialMentionManager {
  constructor() {
    this.tracked = new Map();
    this.mentions = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Track some keywords
    const keywords = ['brandname', 'productlaunch', 'technews'];
    keywords.forEach(kw => {
      const tracked = new TrackedKeyword({ keyword: kw, mentionCount: Math.floor(Math.random() * 100) });
      this.tracked.set(tracked.id, tracked);
    });

    // Generate sample mentions
    const sampleMentions = [
      { keyword: 'brandname', platform: 'twitter', author: 'user123', content: 'Just discovered brandname! Amazing product!', sentiment: 'positive', likes: 45, shares: 12, comments: 5 },
      { keyword: 'brandname', platform: 'twitter', author: 'techfan', content: 'brandname is trending today', sentiment: 'neutral', likes: 23, shares: 3, comments: 1 },
      { keyword: 'brandname', platform: 'reddit', author: 'reddit_user1', content: 'Has anyone tried brandname? Worth it?', sentiment: 'neutral', likes: 15, shares: 2, comments: 8 },
      { keyword: 'brandname', platform: 'facebook', author: 'page_fan', content: 'Love brandname products!', sentiment: 'positive', likes: 120, shares: 25, comments: 30 },
      { keyword: 'brandname', platform: 'linkedin', author: 'pro_user', content: 'Using brandname for my business', sentiment: 'positive', likes: 35, shares: 8, comments: 4 },
      { keyword: 'productlaunch', platform: 'twitter', author: 'news_bot', content: 'New productlaunch coming soon!', sentiment: 'neutral', likes: 89, shares: 45, comments: 20 },
      { keyword: 'productlaunch', platform: 'youtube', author: 'tech_reviewer', content: 'Review: productlaunch - Is it worth it?', sentiment: 'neutral', likes: 250, shares: 30, comments: 85 },
      { keyword: 'technews', platform: 'twitter', author: 'tech_journalist', content: 'Breaking: technews update released', sentiment: 'positive', likes: 180, shares: 95, comments: 42 },
      { keyword: 'brandname', platform: 'instagram', author: 'influencer_1', content: 'Check out brandname!', sentiment: 'positive', likes: 500, shares: 50, comments: 35 }
    ];

    sampleMentions.forEach(m => {
      const mention = new SocialMention({
        keyword: m.keyword,
        platform: m.platform,
        author: m.author,
        content: m.content,
        sentiment: m.sentiment,
        engagement: { likes: m.likes, shares: m.shares, comments: m.comments }
      });
      this.mentions.set(mention.id, mention);
    });
  }

  // Track a new keyword
  track(keyword) {
    const existing = Array.from(this.tracked.values()).find(t => t.keyword === keyword);
    if (existing) {
      throw new Error(`Keyword "${keyword}" is already being tracked`);
    }

    const tracked = new TrackedKeyword({ keyword });
    this.tracked.set(tracked.id, tracked);
    return tracked;
  }

  // Stop tracking a keyword
  untrack(keyword) {
    const existing = Array.from(this.tracked.values()).find(t => t.keyword === keyword);
    if (!existing) {
      throw new Error(`Keyword "${keyword}" is not being tracked`);
    }
    this.tracked.delete(existing.id);
    return existing;
  }

  // Get tracked keywords
  getTracked() {
    return Array.from(this.tracked.values());
  }

  // Add a mention (simulated)
  addMention(keyword, platform, author, content, options = {}) {
    const mention = new SocialMention({
      keyword,
      platform,
      author,
      content,
      sentiment: options.sentiment || 'neutral',
      engagement: options.engagement || { likes: 0, shares: 0, comments: 0 },
      language: options.language || 'en'
    });

    this.mentions.set(mention.id, mention);

    // Update tracked keyword count
    const tracked = Array.from(this.tracked.values()).find(t => t.keyword === keyword);
    if (tracked) {
      tracked.mentionCount++;
    }

    return mention;
  }

  // Get mentions for a keyword
  getMentions(keyword, options = {}) {
    let results = Array.from(this.mentions.values())
      .filter(m => m.keyword === keyword);

    if (options.platform) {
      results = results.filter(m => m.platform === options.platform);
    }

    if (options.sentiment) {
      results = results.filter(m => m.sentiment === options.sentiment);
    }

    if (options.since) {
      results = results.filter(m => m.timestamp >= new Date(options.since));
    }

    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Get mention statistics
  getStats(keyword) {
    const mentions = this.getMentions(keyword);

    const byPlatform = {};
    const bySentiment = { positive: 0, negative: 0, neutral: 0 };
    let totalEngagement = { likes: 0, shares: 0, comments: 0 };

    mentions.forEach(m => {
      // By platform
      if (!byPlatform[m.platform]) {
        byPlatform[m.platform] = 0;
      }
      byPlatform[m.platform]++;

      // By sentiment
      bySentiment[m.sentiment]++;

      // Engagement
      totalEngagement.likes += m.engagement.likes;
      totalEngagement.shares += m.engagement.shares;
      totalEngagement.comments += m.engagement.comments;
    });

    return {
      totalMentions: mentions.length,
      byPlatform,
      bySentiment,
      totalEngagement,
      avgEngagement: mentions.length > 0 ? {
        likes: Math.round(totalEngagement.likes / mentions.length),
        shares: Math.round(totalEngagement.shares / mentions.length),
        comments: Math.round(totalEngagement.comments / mentions.length)
      } : { likes: 0, shares: 0, comments: 0 }
    };
  }

  // Get trending keywords
  getTrending(limit = 10) {
    const counts = {};
    Array.from(this.mentions.values()).forEach(m => {
      counts[m.keyword] = (counts[m.keyword] || 0) + 1;
    });

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([keyword, count]) => ({ keyword, count }));
  }

  // Get sentiment analysis
  getSentiment(keyword) {
    const mentions = this.getMentions(keyword);
    const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };

    mentions.forEach(m => {
      sentimentCounts[m.sentiment]++;
    });

    const total = mentions.length || 1;
    const score = (
      (sentimentCounts.positive * 1) +
      (sentimentCounts.neutral * 0) +
      (sentimentCounts.negative * -1)
    ) / total;

    return {
      positive: sentimentCounts.positive,
      negative: sentimentCounts.negative,
      neutral: sentimentCounts.neutral,
      score: score,
      label: score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral'
    };
  }

  // Generate report
  generateReport(keywords) {
    let report = '=== Social Mention Report ===\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    keywords.forEach(kw => {
      const mentions = this.getMentions(kw);
      const stats = this.getStats(kw);
      const sentiment = this.getSentiment(kw);

      report += `Keyword: ${kw}\n`;
      report += `  Total Mentions: ${stats.totalMentions}\n`;
      report += `  Sentiment: ${sentiment.label} (score: ${sentiment.score.toFixed(2)})\n`;
      report += `  Positive: ${sentiment.positive} | Neutral: ${sentiment.neutral} | Negative: ${sentiment.negative}\n`;
      report += `  Total Engagement: ${stats.totalEngagement.likes} likes, ${stats.totalEngagement.shares} shares, ${stats.totalEngagement.comments} comments\n`;
      report += `  By Platform:\n`;
      Object.entries(stats.byPlatform).forEach(([platform, count]) => {
        report += `    - ${platform}: ${count}\n`;
      });
      report += '\n';
    });

    return report;
  }
}

function runDemo() {
  console.log('=== Agent Social Mention Demo\n');

  const mgr = new SocialMentionManager();

  console.log('1. Get Tracked Keywords:');
  const tracked = mgr.getTracked();
  console.log(`   Tracked: ${tracked.length}`);
  tracked.forEach(t => console.log(`   - ${t.keyword} (${t.mentionCount} mentions)`));

  console.log('\n2. Track New Keyword:');
  const newTracked = mgr.track('newproduct');
  console.log(`   Added: ${newTracked.keyword}`);

  console.log('\n3. Get Mentions:');
  const mentions = mgr.getMentions('brandname');
  console.log(`   brandname mentions: ${mentions.length}`);
  mentions.slice(0, 3).forEach(m => {
    console.log(`   - [${m.platform}] ${m.author}: ${m.content.substring(0, 40)}...`);
  });

  console.log('\n4. Get Mentions by Platform:');
  const twitterMentions = mgr.getMentions('brandname', { platform: 'twitter' });
  console.log(`   Twitter: ${twitterMentions.length}`);

  console.log('\n5. Get Statistics:');
  const stats = mgr.getStats('brandname');
  console.log(`   Total: ${stats.totalMentions}`);
  console.log(`   By platform:`, stats.byPlatform);
  console.log(`   Total engagement: ${stats.totalEngagement.likes} likes, ${stats.totalEngagement.shares} shares`);

  console.log('\n6. Get Sentiment:');
  const sentiment = mgr.getSentiment('brandname');
  console.log(`   Label: ${sentiment.label}`);
  console.log(`   Score: ${sentiment.score.toFixed(2)}`);
  console.log(`   Positive: ${sentiment.positive}, Neutral: ${sentiment.neutral}, Negative: ${sentiment.negative}`);

  console.log('\n7. Get Trending:');
  const trending = mgr.getTrending();
  console.log(`   Top keywords:`);
  trending.forEach(t => console.log(`   - ${t.keyword}: ${t.count}`));

  console.log('\n8. Add New Mention:');
  const newMention = mgr.addMention('newproduct', 'twitter', 'newuser', 'Trying newproduct today! Its great!', {
    sentiment: 'positive',
    engagement: { likes: 10, shares: 2, comments: 1 }
  });
  console.log(`   Added: ${newMention.keyword} by ${newMention.author}`);

  console.log('\n9. Untrack Keyword:');
  const untracked = mgr.untrack('technews');
  console.log(`   Untracked: ${untracked.keyword}`);

  console.log('\n10. Generate Report:');
  const report = mgr.generateReport(['brandname', 'productlaunch']);
  console.log(report);

  console.log('=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new SocialMentionManager();

if (command === 'demo') runDemo();
else if (command === 'track') {
  const [keyword] = args.slice(1);
  if (!keyword) {
    console.log('Usage: node agent-social-mention.js track <keyword>');
    process.exit(1);
  }
  try {
    const result = mgr.track(keyword);
    console.log(JSON.stringify(result, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
else if (command === 'mentions') {
  const [keyword, platform] = args.slice(1);
  if (!keyword) {
    console.log('Usage: node agent-social-mention.js mentions <keyword> [platform]');
    process.exit(1);
  }
  const result = mgr.getMentions(keyword, platform ? { platform } : {});
  console.log(JSON.stringify(result, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else if (command === 'report') {
  const keywords = args.slice(1);
  if (keywords.length === 0) {
    console.log('Usage: node agent-social-mention.js report <keyword1> [keyword2] ...');
    process.exit(1);
  }
  console.log(mgr.generateReport(keywords));
}
else console.log('Usage: node agent-social-mention.js [demo|track|mentions|report]');
