/**
 * Agent Post-Mortem Tool
 * Generates post-mortem reports for agent incidents
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentPostmortemTool {
  constructor(options = {}) {
    this.postmortems = new Map();
    this.incidents = new Map();
    this.templates = new Map();
    this.timelines = new Map();

    this.config = {
      defaultSeverity: options.defaultSeverity || 'major',
      timelineRetention: options.timelineRetention || 90, // days
      autoCaptureLogs: options.autoCaptureLogs !== false
    };

    // Initialize default template
    this._initDefaultTemplate();
  }

  _initDefaultTemplate() {
    const defaultTemplate = {
      id: 'default',
      name: 'Standard Post-Mortem',
      sections: [
        { id: 'summary', title: 'Summary', required: true },
        { id: 'impact', title: 'Impact', required: true },
        { id: 'root-cause', title: 'Root Cause', required: true },
        { id: 'timeline', title: 'Timeline', required: true },
        { id: 'resolution', title: 'Resolution', required: true },
        { id: 'lessons', title: 'Lessons Learned', required: true },
        { id: 'action-items', title: 'Action Items', required: false }
      ]
    };

    this.templates.set(defaultTemplate.id, defaultTemplate);
  }

  createIncident(incidentConfig) {
    const {
      id,
      title,
      severity = this.config.defaultSeverity,
      startTime,
      endTime,
      affectedAgents = [],
      affectedServices = [],
      description = ''
    } = incidentConfig;

    const incident = {
      id: id || `inc-${Date.now()}`,
      title,
      severity,
      status: 'open',
      startTime: startTime || new Date().toISOString(),
      endTime,
      duration: 0,
      affectedAgents,
      affectedServices,
      description,
      createdAt: new Date().toISOString(),
      postmortemId: null
    };

    if (endTime) {
      incident.duration = new Date(endTime) - new Date(incident.startTime);
    }

    this.incidents.set(incident.id, incident);
    console.log(`Incident created: ${incident.id} (${severity}) - ${title}`);
    return incident;
  }

  resolveIncident(incidentId, endTime = null) {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    const resolvedTime = endTime || new Date().toISOString();
    incident.endTime = resolvedTime;
    incident.duration = new Date(resolvedTime) - new Date(incident.startTime);
    incident.status = 'resolved';

    console.log(`Incident resolved: ${incidentId} (duration: ${incident.duration}ms)`);
    return incident;
  }

  createPostmortem(postmortemConfig) {
    const {
      id,
      incidentId,
      templateId = 'default',
      title,
      summary = '',
      impact = {},
      rootCause = '',
      timeline = [],
      resolution = '',
      lessonsLearned = [],
      actionItems = []
    } = postmortemConfig;

    const incident = incidentId ? this.incidents.get(incidentId) : null;

    const postmortem = {
      id: id || `pm-${Date.now()}`,
      incidentId,
      templateId,
      title: title || (incident ? `Post-Mortem: ${incident.title}` : 'Post-Mortem Report'),
      status: 'draft',
      summary,
      impact: impact || {
        agents: incident?.affectedAgents || [],
        services: incident?.affectedServices || [],
        users: 0,
        duration: incident?.duration || 0
      },
      rootCause,
      timeline,
      resolution,
      lessonsLearned,
      actionItems,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: null
    };

    // Link to incident
    if (incident) {
      incident.postmortemId = postmortem.id;
    }

    this.postmortems.set(postmortem.id, postmortem);
    console.log(`Post-mortem created: ${postmortem.id}`);
    return postmortem;
  }

  addTimelineEvent(postmortemId, event) {
    const postmortem = this.postmortems.get(postmortemId);
    if (!postmortem) {
      throw new Error(`Post-mortem not found: ${postmortemId}`);
    }

    const timelineEvent = {
      id: crypto.randomUUID(),
      timestamp: event.timestamp || new Date().toISOString(),
      type: event.type || 'event', // event, detection, escalation, resolution
      description: event.description,
      actor: event.actor || 'system',
      metadata: event.metadata || {}
    };

    postmortem.timeline.push(timelineEvent);
    postmortem.timeline.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    postmortem.updatedAt = new Date().toISOString();

    return timelineEvent;
  }

  addLesson(postmortemId, lesson) {
    const postmortem = this.postmortems.get(postmortemId);
    if (!postmortem) {
      throw new Error(`Post-mortem not found: ${postmortemId}`);
    }

    const lessonEntry = {
      id: crypto.randomUUID(),
      category: lesson.category || 'process', // process, technology, communication
      description: lesson.description,
      impact: lesson.impact || 'positive', // positive, negative
      createdAt: new Date().toISOString()
    };

    postmortem.lessonsLearned.push(lessonEntry);
    postmortem.updatedAt = new Date().toISOString();

    return lessonEntry;
  }

  addActionItem(postmortemId, actionItem) {
    const postmortem = this.postmortems.get(postmortemId);
    if (!postmortem) {
      throw new Error(`Post-mortem not found: ${postmortemId}`);
    }

    const item = {
      id: crypto.randomUUID(),
      title: actionItem.title,
      description: actionItem.description || '',
      priority: actionItem.priority || 'medium', // high, medium, low
      assignee: actionItem.assignee || null,
      dueDate: actionItem.dueDate || null,
      status: actionItem.status || 'pending', // pending, in-progress, completed
      createdAt: new Date().toISOString()
    };

    postmortem.actionItems.push(item);
    postmortem.updatedAt = new Date().toISOString();

    return item;
  }

  updateActionItem(postmortemId, actionItemId, updates) {
    const postmortem = this.postmortems.get(postmortemId);
    if (!postmortem) {
      throw new Error(`Post-mortem not found: ${postmortemId}`);
    }

    const item = postmortem.actionItems.find(i => i.id === actionItemId);
    if (!item) {
      throw new Error(`Action item not found: ${actionItemId}`);
    }

    Object.assign(item, updates);
    postmortem.updatedAt = new Date().toISOString();

    return item;
  }

  generateReport(postmortemId, format = 'markdown') {
    const postmortem = this.postmortems.get(postmortemId);
    if (!postmortem) {
      throw new Error(`Post-mortem not found: ${postmortemId}`);
    }

    let report;

    if (format === 'markdown') {
      report = this._generateMarkdownReport(postmortem);
    } else if (format === 'json') {
      report = JSON.stringify(postmortem, null, 2);
    } else if (format === 'html') {
      report = this._generateHtmlReport(postmortem);
    } else {
      throw new Error(`Unsupported format: ${format}`);
    }

    return report;
  }

  _generateMarkdownReport(postmortem) {
    const formatDuration = (ms) => {
      const minutes = Math.floor(ms / 60000);
      const hours = Math.floor(minutes / 60);
      if (hours > 0) return `${hours}h ${minutes % 60}m`;
      return `${minutes}m`;
    };

    let md = `# ${postmortem.title}\n\n`;
    md += `**Status:** ${postmortem.status}\n`;
    md += `**Created:** ${postmortem.createdAt}\n`;
    if (postmortem.publishedAt) {
      md += `**Published:** ${postmortem.publishedAt}\n`;
    }

    md += `\n## Summary\n\n${postmortem.summary || 'N/A'}\n`;

    md += `\n## Impact\n\n`;
    md += `- **Duration:** ${formatDuration(postmortem.impact.duration || 0)}\n`;
    md += `- **Affected Agents:** ${postmortem.impact.agents?.join(', ') || 'None'}\n`;
    md += `- **Affected Services:** ${postmortem.impact.services?.join(', ') || 'None'}\n`;
    md += `- **Users Affected:** ${postmortem.impact.users || 0}\n`;

    md += `\n## Root Cause\n\n${postmortem.rootCause || 'Under investigation'}\n`;

    md += `\n## Timeline\n\n`;
    md += `| Time | Type | Description | Actor |\n`;
    md += `|------|------|-------------|-------|\n`;
    for (const event of postmortem.timeline) {
      const time = new Date(event.timestamp).toISOString().replace('T', ' ').substring(0, 19);
      md += `| ${time} | ${event.type} | ${event.description} | ${event.actor} |\n`;
    }

    md += `\n## Resolution\n\n${postmortem.resolution || 'N/A'}\n`;

    md += `\n## Lessons Learned\n\n`;
    for (const lesson of postmortem.lessonsLearned) {
      const icon = lesson.impact === 'positive' ? '+' : '-';
      md += `- **[${lesson.category}]** ${icon} ${lesson.description}\n`;
    }

    md += `\n## Action Items\n\n`;
    if (postmortem.actionItems.length > 0) {
      md += `| Priority | Title | Assignee | Status | Due Date |\n`;
      md += `|----------|-------|----------|--------|----------|\n`;
      for (const item of postmortem.actionItems) {
        md += `| ${item.priority} | ${item.title} | ${item.assignee || 'Unassigned'} | ${item.status} | ${item.dueDate || '-'} |\n`;
      }
    } else {
      md += `No action items.\n`;
    }

    return md;
  }

  _generateHtmlReport(postmortem) {
    const markdown = this._generateMarkdownReport(postmortem);
    // Simple markdown to HTML conversion
    let html = `<!DOCTYPE html>
<html>
<head>
  <title>${postmortem.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }
    h1 { color: #333; border-bottom: 2px solid #eee; padding-bottom: 10px; }
    h2 { color: #555; margin-top: 30px; }
    table { border-collapse: collapse; width: 100%; margin: 15px 0; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f5f5f5; }
    .severity-high { color: #d32f2f; }
    .severity-medium { color: #f57c00; }
    .severity-low { color: #388e3c; }
  </style>
</head>
<body>
`;

    // Convert markdown to basic HTML
    html += markdown
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.*$)/gm, '<li>$1</li>')
      .replace(/\| /g, '<td>')
      .replace(/\|$/gm, '');

    html += `\n</body>\n</html>`;
    return html;
  }

  publishPostmortem(postmortemId) {
    const postmortem = this.postmortems.get(postmortemId);
    if (!postmortem) {
      throw new Error(`Post-mortem not found: ${postmortemId}`);
    }

    postmortem.status = 'published';
    postmortem.publishedAt = new Date().toISOString();
    postmortem.updatedAt = new Date().toISOString();

    console.log(`Post-mortem published: ${postmortemId}`);
    return postmortem;
  }

  getPostmortem(postmortemId) {
    const postmortem = this.postmortems.get(postmortemId);
    if (!postmortem) {
      throw new Error(`Post-mortem not found: ${postmortemId}`);
    }
    return postmortem;
  }

  listPostmortems(filters = {}) {
    let results = Array.from(this.postmortems.values());

    if (filters.status) {
      results = results.filter(p => p.status === filters.status);
    }

    if (filters.incidentId) {
      results = results.filter(p => p.incidentId === filters.incidentId);
    }

    // Sort by creation time descending
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return results;
  }

  listIncidents(filters = {}) {
    let results = Array.from(this.incidents.values());

    if (filters.status) {
      results = results.filter(i => i.status === filters.status);
    }

    if (filters.severity) {
      results = results.filter(i => i.severity === filters.severity);
    }

    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return results;
  }

  getStatistics() {
    const incidents = Array.from(this.incidents.values());
    const postmortems = Array.from(this.postmortems.values());

    return {
      incidents: {
        total: incidents.length,
        open: incidents.filter(i => i.status === 'open').length,
        resolved: incidents.filter(i => i.status === 'resolved').length,
        bySeverity: incidents.reduce((acc, i) => {
          acc[i.severity] = (acc[i.severity] || 0) + 1;
          return acc;
        }, {})
      },
      postmortems: {
        total: postmortems.length,
        draft: postmortems.filter(p => p.status === 'draft').length,
        published: postmortems.filter(p => p.status === 'published').length
      },
      actionItems: {
        total: postmortems.reduce((sum, p) => sum + p.actionItems.length, 0),
        completed: postmortems.reduce((sum, p) =>
          sum + p.actionItems.filter(i => i.status === 'completed').length, 0)
      }
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const postmortem = new AgentPostmortemTool();

  switch (command) {
    case 'create-incident':
      const incidentTitle = args[1] || 'Database Outage';
      const incident = postmortem.createIncident({
        title: incidentTitle,
        severity: 'major',
        affectedAgents: ['api-gateway', 'data-processor'],
        affectedServices: ['API', 'Data Processing']
      });
      console.log('Incident created:', incident.id);
      break;

    case 'create-postmortem':
      const pm = postmortem.createPostmortem({
        title: 'Post-Mortem: Database Outage',
        summary: 'Major database outage affecting multiple agents'
      });
      console.log('Post-mortem created:', pm.id);
      break;

    case 'list-incidents':
      console.log('Incidents:', postmortem.listIncidents());
      break;

    case 'stats':
      console.log('Statistics:', postmortem.getStatistics());
      break;

    case 'demo':
      console.log('=== Agent Post-Mortem Tool Demo ===\n');

      // Create incident
      console.log('1. Creating incident...');
      const incident1 = postmortem.createIncident({
        title: 'API Gateway Database Connection Failure',
        severity: 'major',
        affectedAgents: ['api-gateway', 'auth-service'],
        affectedServices: ['Authentication', 'User API'],
        description: 'Database connection pool exhausted causing cascading failures'
      });
      console.log('   Created incident:', incident1.id);

      // Resolve incident
      console.log('\n2. Resolving incident...');
      const resolved = postmortem.resolveIncident(incident1.id);
      console.log('   Resolved - Duration:', resolved.duration / 60000, 'minutes');

      // Create post-mortem
      console.log('\n3. Creating post-mortem...');
      const pm1 = postmortem.createPostmortem({
        incidentId: incident1.id,
        summary: 'A major database outage occurred affecting the API Gateway and Auth Service. The root cause was connection pool exhaustion due to a memory leak in the database driver. The incident lasted 45 minutes and affected approximately 10,000 users.',
        impact: {
          agents: ['api-gateway', 'auth-service'],
          services: ['Authentication', 'User API'],
          users: 10000,
          duration: 45 * 60 * 1000
        },
        rootCause: 'The database connection pool was not properly releasing connections due to a memory leak in the database driver. Under high load, all available connections were exhausted.',
        resolution: 'Restarted the affected services and updated the database driver to the latest version. Also implemented connection pool monitoring and automatic cleanup.'
      });
      console.log('   Created post-mortem:', pm1.id);

      // Add timeline events
      console.log('\n4. Adding timeline events...');

      const startTime = new Date(Date.now() - 50 * 60000);
      postmortem.addTimelineEvent(pm1.id, {
        timestamp: new Date(startTime).toISOString(),
        type: 'event',
        description: 'Deployment of database driver update',
        actor: 'deploy-bot'
      });

      postmortem.addTimelineEvent(pm1.id, {
        timestamp: new Date(startTime.getTime() + 10 * 60000).toISOString(),
        type: 'event',
        description: 'First alert triggered: High connection count',
        actor: 'monitoring-system'
      });

      postmortem.addTimelineEvent(pm1.id, {
        timestamp: new Date(startTime.getTime() + 15 * 60000).toISOString(),
        type: 'detection',
        description: 'Database connection pool exhausted',
        actor: 'monitoring-system'
      });

      postmortem.addTimelineEvent(pm1.id, {
        timestamp: new Date(startTime.getTime() + 20 * 60000).toISOString(),
        type: 'escalation',
        description: 'On-call engineer paged',
        actor: 'alerting-system'
      });

      postmortem.addTimelineEvent(pm1.id, {
        timestamp: new Date(startTime.getTime() + 35 * 60000).toISOString(),
        type: 'event',
        description: 'Services restarted with updated driver',
        actor: 'engineer'
      });

      postmortem.addTimelineEvent(pm1.id, {
        timestamp: new Date(startTime.getTime() + 45 * 60000).toISOString(),
        type: 'resolution',
        description: 'All services恢复正常',
        actor: 'engineer'
      });

      console.log('   Added 6 timeline events');

      // Add lessons learned
      console.log('\n5. Adding lessons learned...');
      postmortem.addLesson(pm1.id, {
        category: 'process',
        description: 'Need better alerting on connection pool metrics',
        impact: 'negative'
      });
      postmortem.addLesson(pm1.id, {
        category: 'technology',
        description: 'Database driver should be tested under load before deployment',
        impact: 'negative'
      });
      postmortem.addLesson(pm1.id, {
        category: 'process',
        description: 'Quick incident response saved significant downtime',
        impact: 'positive'
      });
      console.log('   Added 3 lessons');

      // Add action items
      console.log('\n6. Adding action items...');
      const action1 = postmortem.addActionItem(pm1.id, {
        title: 'Implement connection pool monitoring',
        description: 'Add metrics for connection pool usage to dashboard',
        priority: 'high',
        assignee: 'sre-team',
        dueDate: '2026-02-25'
      });
      console.log('   Added action item:', action1.title);

      const action2 = postmortem.addActionItem(pm1.id, {
        title: 'Update database driver in all services',
        description: 'Roll out latest driver version to prevent memory leaks',
        priority: 'high',
        assignee: 'platform-team',
        dueDate: '2026-02-20'
      });
      console.log('   Added action item:', action2.title);

      const action3 = postmortem.addActionItem(pm1.id, {
        title: 'Create load testing pipeline',
        description: 'Add load tests to CI/CD to catch issues before deployment',
        priority: 'medium',
        assignee: 'qa-team',
        dueDate: '2026-03-01'
      });
      console.log('   Added action item:', action3.title);

      // Update action item status
      console.log('\n7. Updating action items...');
      postmortem.updateActionItem(pm1.id, action2.id, { status: 'in-progress' });
      console.log('   Updated to in-progress');

      // Generate markdown report
      console.log('\n8. Generating report...');
      const report = postmortem.generateReport(pm1.id, 'markdown');
      console.log('   Generated markdown report');
      console.log('\n--- Report Preview ---');
      console.log(report.substring(0, 800) + '...\n--- End Preview ---');

      // Publish post-mortem
      console.log('\n9. Publishing post-mortem...');
      const published = postmortem.publishPostmortem(pm1.id);
      console.log('   Published:', published.id);

      // Get statistics
      console.log('\n10. Statistics:');
      const stats = postmortem.getStatistics();
      console.log('   Incidents:', stats.incidents.total, '(resolved:', stats.incidents.resolved + ')');
      console.log('   Post-mortems:', stats.postmortems.total, '(published:', stats.postmortems.published + ')');
      console.log('   Action items:', stats.actionItems.total, '(completed:', stats.actionItems.completed + ')');

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-postmortem.js <command> [args]');
      console.log('\nCommands:');
      console.log('  create-incident [title]    Create an incident');
      console.log('  create-postmortem           Create a post-mortem');
      console.log('  list-incidents              List incidents');
      console.log('  stats                       Get statistics');
      console.log('  demo                        Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentPostmortemTool;
