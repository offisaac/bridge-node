/**
 * Agent SIEM Module
 *
 * Provides Security Information and Event Management services.
 * Usage: node agent-siem.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show SIEM stats
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
 * Event Severity
 */
const EventSeverity = {
  DEBUG: 'debug',
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * Log Event
 */
class LogEvent {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.timestamp = config.timestamp || Date.now();
    this.source = config.source;
    this.eventType = config.eventType;
    this.severity = config.severity || EventSeverity.INFO;
    this.message = config.message;
    this.metadata = config.metadata || {};
    this.tags = config.tags || [];
    this.correlationId = config.correlationId || null;
  }

  addTag(tag) {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
    }
  }

  toJSON() {
    return {
      id: this.id,
      timestamp: this.timestamp,
      source: this.eventType,
      eventType: this.eventType,
      severity: this.severity,
      message: this.message,
      metadata: this.metadata,
      tags: this.tags,
      correlationId: this.correlationId
    };
  }
}

/**
 * Correlation Rule
 */
class CorrelationRule {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description;
    this.query = config.query;
    this.timeWindow = config.timeWindow || 300000; // 5 minutes
    this.threshold = config.threshold || 5;
    this.severity = config.severity || EventSeverity.WARNING;
    this.action = config.action || 'alert';
    this.enabled = config.enabled !== false;
  }

  matches(events) {
    return events.length >= this.threshold;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      timeWindow: this.timeWindow,
      threshold: this.threshold,
      severity: this.severity,
      action: this.action,
      enabled: this.enabled
    };
  }
}

/**
 * Incident
 */
class Incident {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.title = config.title;
    this.description = config.description;
    this.severity = config.severity || EventSeverity.WARNING;
    this.status = 'open';
    this.events = config.events || [];
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.assignedTo = null;
    this.resolution = null;
  }

  addEvent(eventId) {
    this.events.push(eventId);
    this.updatedAt = Date.now();
  }

  assign(userId) {
    this.assignedTo = userId;
    this.updatedAt = Date.now();
  }

  resolve(resolution) {
    this.status = 'resolved';
    this.resolution = resolution;
    this.updatedAt = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      title: this.description,
      severity: this.severity,
      status: this.status,
      events: this.events,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      assignedTo: this.assignedTo,
      resolution: this.resolution
    };
  }
}

/**
 * SIEM Manager
 */
class SIEMManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.events = new Map();
    this.rules = new Map();
    this.incidents = new Map();
    this.stats = {
      eventsIngested: 0,
      rulesTriggered: 0,
      incidentsCreated: 0,
      incidentsResolved: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._createDefaultRules();
  }

  _createDefaultRules() {
    this.addRule(new CorrelationRule({
      id: 'rule-brute-force',
      name: 'Brute Force Detection',
      description: 'Detects multiple failed login attempts',
      query: 'eventType:login_failed',
      timeWindow: 300000,
      threshold: 5,
      severity: EventSeverity.WARNING,
      action: 'alert'
    }));

    this.addRule(new CorrelationRule({
      id: 'rule-sql-injection',
      name: 'SQL Injection Detection',
      description: 'Detects potential SQL injection attempts',
      query: 'eventType:http_request',
      timeWindow: 60000,
      threshold: 1,
      severity: EventSeverity.CRITICAL,
      action: 'block'
    }));

    this.addRule(new CorrelationRule({
      id: 'rule-dos',
      name: 'Denial of Service Detection',
      description: 'Detects unusual request volume',
      query: 'eventType:http_request',
      timeWindow: 60000,
      threshold: 100,
      severity: EventSeverity.CRITICAL,
      action: 'alert'
    }));
  }

  ingest(eventData) {
    const event = new LogEvent(eventData);
    this.events.set(event.id, event);
    this.stats.eventsIngested++;

    // Check correlation rules
    this._checkRules(event);

    return event;
  }

  _checkRules(event) {
    const relevantEvents = this._getRelevantEvents(event);

    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      if (rule.matches(relevantEvents)) {
        this.stats.rulesTriggered++;
        this._handleRuleTrigger(rule, relevantEvents);
      }
    }
  }

  _getRelevantEvents(event) {
    const windowStart = Date.now() - 300000; // 5 minute window
    const events = [];

    for (const e of this.events.values()) {
      if (e.timestamp >= windowStart && e.eventType === event.eventType) {
        events.push(e);
      }
    }

    return events;
  }

  _handleRuleTrigger(rule, events) {
    if (rule.action === 'alert' || rule.action === 'block') {
      this.createIncident({
        title: rule.name,
        description: rule.description,
        severity: rule.severity,
        events: events.map(e => e.id)
      });
    }
  }

  addRule(rule) {
    this.rules.set(rule.id, rule);
  }

  getRule(ruleId) {
    return this.rules.get(ruleId);
  }

  createIncident(config) {
    const incident = new Incident(config);
    this.incidents.set(incident.id, incident);
    this.stats.incidentsCreated++;
    return incident;
  }

  assignIncident(incidentId, userId) {
    const incident = this.incidents.get(incidentId);
    if (incident) {
      incident.assign(userId);
      return true;
    }
    return false;
  }

  resolveIncident(incidentId, resolution) {
    const incident = this.incidents.get(incidentId);
    if (incident) {
      incident.resolve(resolution);
      this.stats.incidentsResolved++;
      return true;
    }
    return false;
  }

  queryEvents(query) {
    const results = [];
    for (const event of this.events.values()) {
      if (query.eventType && event.eventType !== query.eventType) continue;
      if (query.severity && event.severity !== query.severity) continue;
      if (query.source && event.source !== query.source) continue;
      results.push(event);
    }
    return results;
  }

  getStats() {
    return {
      ...this.stats,
      totalEvents: this.events.size,
      rulesCount: this.rules.size,
      openIncidents: Array.from(this.incidents.values()).filter(i => i.status === 'open').length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent SIEM Demo\n');

  const manager = new SIEMManager();

  // Show rules
  console.log('1. Correlation Rules:');
  for (const rule of manager.rules.values()) {
    console.log(`   - ${rule.name}: ${rule.description}`);
  }

  // Ingest events
  console.log('\n2. Ingesting Security Events:');

  const event1 = manager.ingest({
    source: 'auth-service',
    eventType: 'login_failed',
    severity: EventSeverity.WARNING,
    message: 'Failed login attempt for user admin',
    metadata: { ip: '192.168.1.100', userId: 'admin' }
  });
  console.log(`   Event 1: ${event1.eventType} - ${event1.message}`);

  const event2 = manager.ingest({
    source: 'auth-service',
    eventType: 'login_failed',
    severity: EventSeverity.WARNING,
    message: 'Failed login attempt for user admin',
    metadata: { ip: '192.168.1.100', userId: 'admin' }
  });
  console.log(`   Event 2: ${event2.eventType} - ${event2.message}`);

  const event3 = manager.ingest({
    source: 'auth-service',
    eventType: 'login_failed',
    severity: EventSeverity.WARNING,
    message: 'Failed login attempt for user admin',
    metadata: { ip: '192.168.1.100', userId: 'admin' }
  });
  console.log(`   Event 3: ${event3.eventType} - ${event3.message}`);

  const event4 = manager.ingest({
    source: 'web-server',
    eventType: 'http_request',
    severity: EventSeverity.INFO,
    message: 'Normal HTTP request',
    metadata: { method: 'GET', path: '/api/users' }
  });
  console.log(`   Event 4: ${event4.eventType} - ${event4.message}`);

  // Ingest critical event
  console.log('\n3. Ingesting Critical Event:');
  const event5 = manager.ingest({
    source: 'web-server',
    eventType: 'http_request',
    severity: EventSeverity.CRITICAL,
    message: 'Potential SQL injection detected',
    metadata: { method: 'POST', path: '/api/users', payload: "' OR '1'='1" }
  });
  console.log(`   Event 5: ${event5.eventType} - ${event5.message}`);

  // Show incidents
  console.log('\n4. Generated Incidents:');
  const incidents = Array.from(manager.incidents.values());
  for (const incident of incidents) {
    console.log(`   - ${incident.title} [${incident.severity}] (${incident.status})`);
  }

  // Assign and resolve
  console.log('\n5. Managing Incident:');
  if (incidents.length > 0) {
    manager.assignIncident(incidents[0].id, 'security-team');
    console.log(`   Assigned to: security-team`);

    manager.resolveIncident(incidents[0].id, 'Blocked malicious IP at firewall');
    console.log(`   Resolved: ${incidents[0].status}`);
  }

  // Query events
  console.log('\n6. Querying Events:');
  const failedLogins = manager.queryEvents({ eventType: 'login_failed' });
  console.log(`   Failed login events: ${failedLogins.length}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Events Ingested: ${stats.eventsIngested}`);
  console.log(`   Rules Triggered: ${stats.rulesTriggered}`);
  console.log(`   Incidents Created: ${stats.incidentsCreated}`);
  console.log(`   Incidents Resolved: ${stats.incidentsResolved}`);
  console.log(`   Open Incidents: ${stats.openIncidents}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new SIEMManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent SIEM Module');
  console.log('Usage: node agent-siem.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
