/**
 * Agent Incident Module
 *
 * Provides incident management and tracking services.
 * Usage: node agent-incident.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show incident stats
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
 * Incident Priority
 */
const IncidentPriority = {
  P1: 'p1', // Critical
  P2: 'p2', // High
  P3: 'p3', // Medium
  P4: 'p4'  // Low
};

/**
 * Incident Status
 */
const IncidentStatus = {
  OPEN: 'open',
  INVESTIGATING: 'investigating',
  IDENTIFIED: 'identified',
  MONITORING: 'monitoring',
  RESOLVED: 'resolved',
  CLOSED: 'closed'
};

/**
 * Incident
 */
class Incident {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.title = config.title;
    this.description = config.description;
    this.status = config.status || IncidentStatus.OPEN;
    this.priority = config.priority || IncidentPriority.P3;
    this.severity = config.severity;
    this.category = config.category;
    this.createdAt = Date.now();
    this.updatedAt = this.createdAt;
    this.resolvedAt = null;
    this.reporter = config.reporter;
    this.assignee = config.assignee || null;
    this.timeline = [{ event: 'created', timestamp: this.createdAt }];
    this.relatedIncidents = [];
    this.tags = config.tags || [];
    this.impact = config.impact || {};
    this.rootCause = null;
    this.resolution = null;
  }

  updateStatus(status) {
    this.status = status;
    this.updatedAt = Date.now();
    this.timeline.push({ event: `status_changed_to_${status}`, timestamp: Date.now() });
  }

  assign(userId) {
    this.assignee = userId;
    this.updatedAt = Date.now();
    this.timeline.push({ event: 'assigned', timestamp: Date.now(), user: userId });
  }

  addComment(comment, author) {
    this.timeline.push({ event: 'comment', timestamp: Date.now(), author, comment });
  }

  addRelated(incidentId) {
    if (!this.relatedIncidents.includes(incidentId)) {
      this.relatedIncidents.push(incidentId);
    }
  }

  resolve(resolution, rootCause = null) {
    this.status = IncidentStatus.RESOLVED;
    this.resolvedAt = Date.now();
    this.updatedAt = this.resolvedAt;
    this.resolution = resolution;
    this.rootCause = rootCause;
    this.timeline.push({ event: 'resolved', timestamp: Date.now(), resolution, rootCause });
  }

  close() {
    this.status = IncidentStatus.CLOSED;
    this.updatedAt = Date.now();
    this.timeline.push({ event: 'closed', timestamp: Date.now() });
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      status: this.status,
      priority: this.priority,
      severity: this.severity,
      category: this.category,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      resolvedAt: this.resolvedAt,
      reporter: this.reporter,
      assignee: this.assignee,
      timelineLength: this.timeline.length,
      relatedIncidents: this.relatedIncidents,
      tags: this.tags,
      impact: this.impact,
      rootCause: this.rootCause,
      resolution: this.resolution
    };
  }
}

/**
 * Incident Template
 */
class IncidentTemplate {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.title = config.title;
    this.description = config.description;
    this.priority = config.priority || IncidentPriority.P3;
    this.category = config.category;
    this.checklist = config.checklist || [];
  }

  createIncident(overrides = {}) {
    return new Incident({
      ...this,
      ...overrides,
      id: undefined
    });
  }
}

/**
 * Incident Manager
 */
class IncidentManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.incidents = new Map();
    this.templates = new Map();
    this.stats = {
      incidentsCreated: 0,
      incidentsResolved: 0,
      incidentsClosed: 0,
      commentsAdded: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._createDefaultTemplates();
  }

  _createDefaultTemplates() {
    this.addTemplate(new IncidentTemplate({
      id: 'template-outage',
      name: 'Service Outage',
      title: 'Service Outage: [SERVICE_NAME]',
      description: 'Service is experiencing a complete outage',
      priority: IncidentPriority.P1,
      category: 'outage',
      checklist: [
        'Confirm outage status',
        'Notify stakeholders',
        'Begin investigation',
        'Identify root cause',
        'Apply fix',
        'Verify resolution',
        'Post-mortem'
      ]
    }));

    this.addTemplate(new IncidentTemplate({
      id: 'template-performance',
      name: 'Performance Degradation',
      title: 'Performance Issue: [SERVICE_NAME]',
      description: 'Service is experiencing degraded performance',
      priority: IncidentPriority.P2,
      category: 'performance',
      checklist: [
        'Identify affected components',
        'Check metrics',
        'Analyze logs',
        'Identify bottleneck',
        'Apply optimization'
      ]
    }));
  }

  create(incidentData) {
    const incident = new Incident(incidentData);
    this.incidents.set(incident.id, incident);
    this.stats.incidentsCreated++;
    return incident;
  }

  createFromTemplate(templateId, overrides = {}) {
    const template = this.templates.get(templateId);
    if (!template) {
      return null;
    }
    const incident = template.createIncident(overrides);
    this.incidents.set(incident.id, incident);
    this.stats.incidentsCreated++;
    return incident;
  }

  get(incidentId) {
    return this.incidents.get(incidentId);
  }

  updateStatus(incidentId, status) {
    const incident = this.incidents.get(incidentId);
    if (incident) {
      incident.updateStatus(status);
      if (status === IncidentStatus.RESOLVED) {
        this.stats.incidentsResolved++;
      }
      return true;
    }
    return false;
  }

  assign(incidentId, userId) {
    const incident = this.incidents.get(incidentId);
    if (incident) {
      incident.assign(userId);
      return true;
    }
    return false;
  }

  addComment(incidentId, comment, author) {
    const incident = this.incidents.get(incidentId);
    if (incident) {
      incident.addComment(comment, author);
      this.stats.commentsAdded++;
      return true;
    }
    return false;
  }

  resolve(incidentId, resolution, rootCause = null) {
    const incident = this.incidents.get(incidentId);
    if (incident) {
      incident.resolve(resolution, rootCause);
      this.stats.incidentsResolved++;
      return true;
    }
    return false;
  }

  close(incidentId) {
    const incident = this.incidents.get(incidentId);
    if (incident) {
      incident.close();
      this.stats.incidentsClosed++;
      return true;
    }
    return false;
  }

  addTemplate(template) {
    this.templates.set(template.id, template);
  }

  getTemplates() {
    return Array.from(this.templates.values());
  }

  query(filter = {}) {
    const results = [];
    for (const incident of this.incidents.values()) {
      if (filter.status && incident.status !== filter.status) continue;
      if (filter.priority && incident.priority !== filter.priority) continue;
      if (filter.assignee && incident.assignee !== filter.assignee) continue;
      if (filter.category && incident.category !== filter.category) continue;
      results.push(incident);
    }
    return results;
  }

  getStats() {
    return {
      ...this.stats,
      totalIncidents: this.incidents.size,
      openIncidents: this.query({ status: IncidentStatus.OPEN }).length +
                     this.query({ status: IncidentStatus.INVESTIGATING }).length +
                     this.query({ status: IncidentStatus.IDENTIFIED }).length +
                     this.query({ status: IncidentStatus.MONITORING }).length,
      templatesCount: this.templates.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Incident Demo\n');

  const manager = new IncidentManager();

  // Show templates
  console.log('1. Incident Templates:');
  for (const template of manager.getTemplates()) {
    console.log(`   - ${template.name}: ${template.title}`);
  }

  // Create incident from template
  console.log('\n2. Creating Incident from Template:');
  const incident1 = manager.createFromTemplate('template-outage', {
    title: 'Database Outage',
    description: 'Primary database cluster is down',
    reporter: 'on-call'
  });
  console.log(`   Created: ${incident1.title}`);
  console.log(`   Priority: ${incident1.priority}`);
  console.log(`   Status: ${incident1.status}`);

  // Create direct incident
  console.log('\n3. Creating Direct Incident:');
  const incident2 = manager.create({
    title: 'API Latency Spike',
    description: 'API response times are higher than normal',
    priority: IncidentPriority.P2,
    category: 'performance',
    reporter: 'monitoring-system'
  });
  console.log(`   Created: ${incident2.title}`);

  // Manage incidents
  console.log('\n4. Managing Incidents:');
  manager.assign(incident1.id, 'database-team');
  console.log(`   Assigned incident 1 to: database-team`);

  manager.updateStatus(incident1.id, IncidentStatus.INVESTIGATING);
  console.log(`   Updated status: ${incident1.status}`);

  manager.addComment(incident1.id, 'Investigating database logs', 'db-admin');
  console.log(`   Added comment`);

  // Resolve incident
  console.log('\n5. Resolving Incident:');
  manager.resolve(incident1.id, 'Database failover completed', 'Primary database disk failure');
  console.log(`   Resolved: ${incident1.status}`);
  console.log(`   Root Cause: ${incident1.rootCause}`);

  // Query incidents
  console.log('\n6. Querying Incidents:');
  const p1Incidents = manager.query({ priority: IncidentPriority.P1 });
  console.log(`   P1 incidents: ${p1Incidents.length}`);

  const openIncidents = manager.query({ status: IncidentStatus.OPEN });
  console.log(`   Open incidents: ${openIncidents.length}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Total Incidents: ${stats.totalIncidents}`);
  console.log(`   Incidents Created: ${stats.incidentsCreated}`);
  console.log(`   Incidents Resolved: ${stats.incidentsResolved}`);
  console.log(`   Open Incidents: ${stats.openIncidents}`);
  console.log(`   Comments Added: ${stats.commentsAdded}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new IncidentManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Incident Module');
  console.log('Usage: node agent-incident.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
