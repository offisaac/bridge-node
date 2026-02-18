/**
 * Agent Crisis - Crisis Detection Module
 *
 * Detects and monitors crisis situations from social mentions and alerts.
 *
 * Usage: node agent-crisis.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   detect     - Run crisis detection
 *   alert      - Create/view alerts
 *   report     - Generate crisis report
 */

class CrisisEvent {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.title = config.title;
    this.description = config.description;
    this.severity = config.severity || 'low'; // low, medium, high, critical
    this.category = config.category; // pr, security, product, service, legal, financial
    this.status = config.status || 'active'; // active, monitoring, resolved
    this.mentions = config.mentions || [];
    this.sentiment = config.sentiment || -1; // -1 to 1
    this.trend = config.trend || 'stable'; // increasing, stable, decreasing
    this.detectedAt = config.detectedAt ? new Date(config.detectedAt) : new Date();
    this.updatedAt = config.updatedAt ? new Date(config.updatedAt) : new Date();
    this.resolvedAt = config.resolvedAt ? new Date(config.resolvedAt) : null;
  }
}

class CrisisAlert {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.eventId = config.eventId;
    this.type = config.type; // escalation, mention_spike, sentiment_shift, keyword_mention
    this.message = config.message;
    this.timestamp = config.timestamp ? new Date(config.timestamp) : new Date();
    this.read = config.read || false;
    this.actionRequired = config.actionRequired || false;
  }
}

class CrisisManager {
  constructor() {
    this.events = new Map();
    this.alerts = new Map();
    this.keywords = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Crisis keywords
    const crisisKeywords = [
      { keyword: 'data breach', category: 'security', severity: 'critical', weight: 1.0 },
      { keyword: 'hack', category: 'security', severity: 'high', weight: 0.8 },
      { keyword: 'leak', category: 'security', severity: 'high', weight: 0.8 },
      { keyword: 'scandal', category: 'pr', severity: 'high', weight: 0.9 },
      { keyword: 'lawsuit', category: 'legal', severity: 'high', weight: 0.9 },
      { keyword: 'outage', category: 'service', severity: 'medium', weight: 0.7 },
      { keyword: 'down', category: 'service', severity: 'medium', weight: 0.5 },
      { keyword: 'fired', category: 'pr', severity: 'medium', weight: 0.6 },
      { keyword: 'resign', category: 'pr', severity: 'medium', weight: 0.7 },
      { keyword: 'recall', category: 'product', severity: 'high', weight: 0.9 }
    ];

    crisisKeywords.forEach(kw => {
      this.keywords.set(kw.keyword, kw);
    });

    // Sample crisis events
    const sampleEvents = [
      {
        title: 'Service Outage Reports',
        description: 'Users reporting service is down',
        severity: 'medium',
        category: 'service',
        sentiment: -0.6,
        trend: 'increasing',
        mentions: ['outage', 'down', 'not working']
      },
      {
        title: 'Security Concern',
        description: 'Potential security issue reported',
        severity: 'high',
        category: 'security',
        sentiment: -0.8,
        trend: 'stable',
        mentions: ['hack', 'breach']
      }
    ];

    sampleEvents.forEach(e => {
      const event = new CrisisEvent(e);
      this.events.set(event.id, event);
    });
  }

  // Add crisis keyword
  addKeyword(keyword, category, severity = 'medium', weight = 0.5) {
    const existing = this.keywords.get(keyword.toLowerCase());
    if (existing) {
      throw new Error(`Keyword "${keyword}" already exists`);
    }

    this.keywords.set(keyword.toLowerCase(), {
      keyword: keyword.toLowerCase(),
      category,
      severity,
      weight
    });

    return { keyword, category, severity, weight };
  }

  // Remove keyword
  removeKeyword(keyword) {
    const existing = this.keywords.get(keyword.toLowerCase());
    if (!existing) {
      throw new Error(`Keyword "${keyword}" not found`);
    }
    this.keywords.delete(keyword.toLowerCase());
    return existing;
  }

  // Get all keywords
  getKeywords(category = null) {
    let allKeywords = Array.from(this.keywords.values());
    if (category) {
      allKeywords = allKeywords.filter(kw => kw.category === category);
    }
    return allKeywords;
  }

  // Detect crisis from mentions
  detectFromMentions(mentions) {
    const matchedKeywords = [];
    const severityScores = [];

    mentions.forEach(mention => {
      const content = mention.content.toLowerCase();

      this.keywords.forEach(kw => {
        if (content.includes(kw.keyword)) {
          matchedKeywords.push({
            keyword: kw.keyword,
            category: kw.category,
            severity: kw.severity,
            weight: kw.weight,
            mention: mention
          });
          severityScores.push(kw.weight);
        }
      });
    });

    // Calculate overall crisis level
    const avgScore = severityScores.length > 0
      ? severityScores.reduce((a, b) => a + b, 0) / severityScores.length
      : 0;

    let severity = 'low';
    if (avgScore >= 0.9) severity = 'critical';
    else if (avgScore >= 0.7) severity = 'high';
    else if (avgScore >= 0.5) severity = 'medium';

    // Determine category
    const categoryCounts = {};
    matchedKeywords.forEach(m => {
      categoryCounts[m.category] = (categoryCounts[m.category] || 0) + 1;
    });
    const category = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';

    return {
      crisisDetected: matchedKeywords.length > 0 && avgScore >= 0.5,
      severity,
      category,
      confidence: avgScore,
      matchedKeywords: matchedKeywords.map(m => m.keyword),
      keywordCount: matchedKeywords.length
    };
  }

  // Create crisis event
  createEvent(title, description, category, severity, mentions = []) {
    const detection = this.detectFromMentions(mentions);

    const event = new CrisisEvent({
      title,
      description,
      category: category || detection.category,
      severity: severity || detection.severity,
      mentions: mentions.map(m => m.content),
      sentiment: detection.matchedKeywords.length > 0 ? -0.5 : 0,
      trend: 'increasing'
    });

    this.events.set(event.id, event);

    // Generate alert
    if (detection.crisisDetected) {
      this.createAlert(event.id, 'escalation', `Crisis detected: ${title}`);
    }

    return { event, detection };
  }

  // Get active events
  getActiveEvents() {
    return Array.from(this.events.values())
      .filter(e => e.status === 'active' || e.status === 'monitoring')
      .sort((a, b) => {
        const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });
  }

  // Get event by ID
  getEvent(id) {
    return this.events.get(id) || null;
  }

  // Update event status
  updateEventStatus(id, status) {
    const event = this.events.get(id);
    if (!event) {
      throw new Error('Event not found');
    }

    event.status = status;
    event.updatedAt = new Date();

    if (status === 'resolved') {
      event.resolvedAt = new Date();
    }

    return event;
  }

  // Create alert
  createAlert(eventId, type, message, actionRequired = false) {
    const alert = new CrisisAlert({
      eventId,
      type,
      message,
      actionRequired
    });

    this.alerts.set(alert.id, alert);
    return alert;
  }

  // Get alerts
  getAlerts(eventId = null, unreadOnly = false) {
    let allAlerts = Array.from(this.alerts.values());

    if (eventId) {
      allAlerts = allAlerts.filter(a => a.eventId === eventId);
    }

    if (unreadOnly) {
      allAlerts = allAlerts.filter(a => !a.read);
    }

    return allAlerts.sort((a, b) => b.timestamp - a.timestamp);
  }

  // Mark alert as read
  markAlertRead(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error('Alert not found');
    }
    alert.read = true;
    return alert;
  }

  // Get statistics
  getStats() {
    const events = Array.from(this.events.values());
    const active = events.filter(e => e.status === 'active');
    const resolved = events.filter(e => e.status === 'resolved');
    const alerts = Array.from(this.alerts.values());
    const unreadAlerts = alerts.filter(a => !a.read);

    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0 };
    active.forEach(e => {
      bySeverity[e.severity]++;
    });

    const byCategory = {};
    events.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
    });

    return {
      totalEvents: events.length,
      activeEvents: active.length,
      resolvedEvents: resolved.length,
      totalAlerts: alerts.length,
      unreadAlerts: unreadAlerts.length,
      bySeverity,
      byCategory
    };
  }

  // Generate report
  generateReport() {
    let report = '=== Crisis Detection Report ===\n\n';
    report += `Generated: ${new Date().toISOString()}\n\n`;

    const activeEvents = this.getActiveEvents();
    const stats = this.getStats();

    report += `Summary:\n`;
    report += `- Active Events: ${stats.activeEvents}\n`;
    report += `- Resolved Events: ${stats.resolvedEvents}\n`;
    report += `- Unread Alerts: ${stats.unreadAlerts}\n`;
    report += `- Critical: ${stats.bySeverity.critical}\n`;
    report += `- High: ${stats.bySeverity.high}\n`;
    report += `- Medium: ${stats.bySeverity.medium}\n`;
    report += `- Low: ${stats.bySeverity.low}\n\n`;

    if (activeEvents.length > 0) {
      report += `ACTIVE CRISIS EVENTS:\n`;
      activeEvents.forEach(e => {
        report += `\n[${e.severity.toUpperCase()}] ${e.title}\n`;
        report += `  Category: ${e.category}\n`;
        report += `  Status: ${e.status}\n`;
        report += `  Trend: ${e.trend}\n`;
        report += `  Detected: ${e.detectedAt.toISOString()}\n`;
        report += `  Description: ${e.description}\n`;
      });
    } else {
      report += `No active crisis events.\n`;
    }

    return report;
  }
}

function runDemo() {
  console.log('=== Agent Crisis Demo\n');

  const mgr = new CrisisManager();

  console.log('1. Get Crisis Keywords:');
  const keywords = mgr.getKeywords();
  console.log(`   Total: ${keywords.length}`);
  keywords.slice(0, 5).forEach(kw => {
    console.log(`   - ${kw.keyword} [${kw.category}] (${kw.severity})`);
  });

  console.log('\n2. Add Crisis Keyword:');
  const newKw = mgr.addKeyword('ransomware', 'security', 'critical', 1.0);
  console.log(`   Added: ${newKw.keyword} [${newKw.category}] (${newKw.severity})`);

  console.log('\n3. Detect Crisis from Mentions:');
  const mockMentions = [
    { content: 'Just experienced a data breach at company x', sentiment: -0.8 },
    { content: 'Service is down again', sentiment: -0.5 },
    { content: 'Great product!', sentiment: 0.8 }
  ];
  const detection = mgr.detectFromMentions(mockMentions);
  console.log(`   Crisis detected: ${detection.crisisDetected}`);
  console.log(`   Severity: ${detection.severity}`);
  console.log(`   Category: ${detection.category}`);
  console.log(`   Confidence: ${(detection.confidence * 100).toFixed(0)}%`);
  console.log(`   Keywords: ${detection.matchedKeywords.join(', ')}`);

  console.log('\n4. Create Crisis Event:');
  const eventResult = mgr.createEvent(
    'New Security Issue',
    'Potential security vulnerability reported',
    'security',
    'high',
    mockMentions
  );
  console.log(`   Created: ${eventResult.event.id}`);
  console.log(`   Severity: ${eventResult.event.severity}`);

  console.log('\n5. Get Active Events:');
  const activeEvents = mgr.getActiveEvents();
  console.log(`   Active: ${activeEvents.length}`);
  activeEvents.forEach(e => console.log(`   - [${e.severity}] ${e.title}`));

  console.log('\n6. Get Alerts:');
  const alerts = mgr.getAlerts();
  console.log(`   Total alerts: ${alerts.length}`);
  alerts.slice(0, 3).forEach(a => console.log(`   - ${a.message}`));

  console.log('\n7. Mark Alert Read:');
  if (alerts.length > 0) {
    const read = mgr.markAlertRead(alerts[0].id);
    console.log(`   Marked: ${read.id}`);
  }

  console.log('\n8. Update Event Status:');
  if (activeEvents.length > 0) {
    const updated = mgr.updateEventStatus(activeEvents[0].id, 'monitoring');
    console.log(`   Updated: ${updated.id} -> ${updated.status}`);
  }

  console.log('\n9. Get Statistics:');
  const stats = mgr.getStats();
  console.log(`   Total events: ${stats.totalEvents}`);
  console.log(`   Active: ${stats.activeEvents}`);
  console.log(`   Unread alerts: ${stats.unreadAlerts}`);
  console.log(`   By severity:`, stats.bySeverity);

  console.log('\n10. Generate Report:');
  const report = mgr.generateReport();
  console.log(report);

  console.log('=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new CrisisManager();

if (command === 'demo') runDemo();
else if (command === 'detect') {
  // Simulate detection from mentions passed as JSON
  const mentionsJson = args.slice(1).join(' ');
  if (!mentionsJson) {
    console.log('Usage: node agent-crisis.js detect <mentions_json>');
    process.exit(1);
  }
  try {
    const mentions = JSON.parse(mentionsJson);
    const result = mgr.detectFromMentions(mentions);
    console.log(JSON.stringify(result, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}
else if (command === 'alert') {
  const [eventId] = args.slice(1);
  const alerts = mgr.getAlerts(eventId || null);
  console.log(JSON.stringify(alerts, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else if (command === 'report') {
  console.log(mgr.generateReport());
}
else console.log('Usage: node agent-crisis.js [demo|detect|alert|report]');
