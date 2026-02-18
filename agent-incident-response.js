/**
 * Agent Incident Response
 * Automated incident response and remediation for agent systems
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentIncidentResponse {
  constructor(options = {}) {
    this.incidents = new Map();
    this.playbooks = new Map();
    this.actions = new Map();
    this.runbooks = new Map();

    this.config = {
      autoResponse: options.autoResponse !== false,
      maxConcurrentActions: options.maxConcurrentActions || 10,
      actionTimeout: options.actionTimeout || 300000, // 5 minutes
      escalationDelay: options.escalationDelay || 600000 // 10 minutes
    };

    // Initialize default playbooks
    this._initDefaultPlaybooks();

    this.stats = {
      totalIncidents: 0,
      incidentsResolved: 0,
      actionsExecuted: 0,
      autoRemediated: 0
    };
  }

  _initDefaultPlaybooks() {
    // Playbook for high CPU usage
    this.createPlaybook({
      name: 'High CPU Response',
      trigger: 'cpu_high',
      severity: 'high',
      steps: [
        { action: 'collect_metrics', params: { duration: 60 } },
        { action: 'identify_process', params: {} },
        { action: 'scale_up', params: { replicas: 2 } },
        { action: 'notify', params: { channels: ['slack', 'email'] } }
      ]
    });

    // Playbook for service failure
    this.createPlaybook({
      name: 'Service Failure Response',
      trigger: 'service_failure',
      severity: 'critical',
      steps: [
        { action: 'collect_logs', params: { lines: 100 } },
        { action: 'restart_service', params: {} },
        { action: 'scale_up', params: { replicas: 2 } },
        { action: 'create_incident', params: {} },
        { action: 'notify', params: { channels: ['slack', 'email', 'sms'] } }
      ]
    });

    // Playbook for security incident
    this.createPlaybook({
      name: 'Security Incident Response',
      trigger: 'security_incident',
      severity: 'critical',
      steps: [
        { action: 'collect_evidence', params: {} },
        { action: 'isolate_agent', params: {} },
        { action: 'block_ip', params: {} },
        { action: 'create_incident', params: {} },
        { action: 'notify', params: { channels: ['slack', 'email', 'sms'], severity: 'critical' } }
      ]
    });

    // Playbook for memory issue
    this.createPlaybook({
      name: 'Memory Issue Response',
      trigger: 'memory_high',
      severity: 'medium',
      steps: [
        { action: 'collect_metrics', params: { duration: 60 } },
        { action: 'restart_service', params: {} },
        { action: 'adjust_resources', params: { memory: '2x' } }
      ]
    });
  }

  createPlaybook(playbookConfig) {
    const { name, trigger, severity, steps, enabled = true } = playbookConfig;

    const playbook = {
      id: `playbook-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      trigger,
      severity,
      steps,
      enabled,
      executionCount: 0,
      successCount: 0,
      createdAt: new Date().toISOString()
    };

    this.playbooks.set(playbook.id, playbook);
    console.log(`Playbook created: ${playbook.id} (${name})`);
    return playbook;
  }

  deletePlaybook(playbookId) {
    const playbook = this.playbooks.get(playbookId);
    if (!playbook) {
      throw new Error(`Playbook not found: ${playbookId}`);
    }

    this.playbooks.delete(playbookId);
    console.log(`Playbook deleted: ${playbookId}`);
    return { success: true, playbookId };
  }

  triggerIncident(incidentConfig) {
    const {
      title,
      description = '',
      severity = 'medium',
      source,
      trigger,
      affectedAgents = [],
      metadata = {}
    } = incidentConfig;

    const incident = {
      id: `incident-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      title,
      description,
      severity,
      source,
      trigger,
      status: 'open',
      affectedAgents,
      metadata,
      timeline: [
        {
          id: crypto.randomUUID(),
          timestamp: new Date().toISOString(),
          event: 'incident_created',
          details: { severity }
        }
      ],
      actions: [],
      assignedTo: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      resolvedAt: null
    };

    this.incidents.set(incident.id, incident);
    this.stats.totalIncidents++;

    console.log(`Incident triggered: ${incident.id} (${severity}) - ${title}`);

    // Auto-trigger playbook if enabled
    if (this.config.autoResponse && trigger) {
      this._executePlaybook(incident, trigger);
    }

    return incident;
  }

  async _executePlaybook(incident, trigger) {
    // Find matching playbook
    let playbook = null;
    for (const p of this.playbooks.values()) {
      if (p.enabled && p.trigger === trigger) {
        playbook = p;
        break;
      }
    }

    if (!playbook) {
      console.log(`No playbook found for trigger: ${trigger}`);
      return;
    }

    console.log(`Executing playbook: ${playbook.name}`);

    // Add to timeline
    incident.timeline.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event: 'playbook_started',
      details: { playbook: playbook.name }
    });

    playbook.executionCount++;

    // Execute steps
    for (const step of playbook.steps) {
      const action = await this._executeAction(incident, step);
      incident.actions.push(action);

      if (!action.success && step.critical) {
        console.log(`Critical step failed, stopping playbook: ${step.action}`);
        break;
      }
    }

    // Update playbook stats
    const allSuccess = incident.actions.every(a => a.success);
    if (allSuccess) {
      playbook.successCount++;
      this.stats.autoRemediated++;
    }
  }

  async _executeAction(incident, step) {
    const actionRecord = {
      id: crypto.randomUUID(),
      incidentId: incident.id,
      action: step.action,
      params: step.params,
      status: 'running',
      startedAt: new Date().toISOString(),
      completedAt: null,
      success: false,
      output: {}
    };

    this.actions.set(actionRecord.id, actionRecord);
    this.stats.actionsExecuted++;

    console.log(`Executing action: ${step.action}`);

    try {
      // Simulate action execution
      const result = await this._performAction(step.action, step.params);
      actionRecord.success = true;
      actionRecord.output = result;
      actionRecord.status = 'completed';
    } catch (error) {
      actionRecord.success = false;
      actionRecord.output = { error: error.message };
      actionRecord.status = 'failed';
    }

    actionRecord.completedAt = new Date().toISOString();

    // Add to incident timeline
    incident.timeline.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event: 'action_completed',
      details: { action: step.action, success: actionRecord.success }
    });

    return actionRecord;
  }

  async _performAction(action, params) {
    // Simulate different actions
    switch (action) {
      case 'collect_metrics':
        return { metrics: ['cpu', 'memory', 'network'], samples: 60 };

      case 'collect_logs':
        return { lines: params.lines || 100, format: 'json' };

      case 'identify_process':
        return { process: 'worker-123', cpu: '85%' };

      case 'scale_up':
        return { replicas: params.replicas || 2, previousReplicas: 1 };

      case 'restart_service':
        return { success: true, duration: '30s' };

      case 'notify':
        return { notified: params.channels || ['slack'], message: 'Alert sent' };

      case 'create_incident':
        return { ticketId: `TKT-${Date.now()}` };

      case 'collect_evidence':
        return { files: ['logs', 'memory_dump', 'network_capture'] };

      case 'isolate_agent':
        return { isolated: true, networkBlocked: true };

      case 'block_ip':
        return { blocked: true, ip: params.ip || 'unknown' };

      case 'adjust_resources':
        return { memory: params.memory || 'increased' };

      default:
        return { action: 'unknown' };
    }
  }

  acknowledgeIncident(incidentId, acknowledgedBy) {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    incident.status = 'acknowledged';
    incident.assignedTo = acknowledgedBy;
    incident.acknowledgedAt = new Date().toISOString();
    incident.updatedAt = new Date().toISOString();

    incident.timeline.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event: 'incident_acknowledged',
      details: { acknowledgedBy }
    });

    console.log(`Incident acknowledged: ${incidentId} by ${acknowledgedBy}`);
    return incident;
  }

  resolveIncident(incidentId, resolution) {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    incident.status = 'resolved';
    incident.resolution = resolution;
    incident.resolvedAt = new Date().toISOString();
    incident.updatedAt = new Date().toISOString();

    this.stats.incidentsResolved++;

    incident.timeline.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event: 'incident_resolved',
      details: { resolution }
    });

    console.log(`Incident resolved: ${incidentId}`);
    return incident;
  }

  escalateIncident(incidentId, escalateTo) {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }

    incident.escalatedTo = escalateTo;
    incident.escalatedAt = new Date().toISOString();
    incident.updatedAt = new Date().toISOString();

    incident.timeline.push({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      event: 'incident_escalated',
      details: { escalateTo }
    });

    console.log(`Incident escalated: ${incidentId} to ${escalateTo}`);
    return incident;
  }

  getIncident(incidentId) {
    const incident = this.incidents.get(incidentId);
    if (!incident) {
      throw new Error(`Incident not found: ${incidentId}`);
    }
    return incident;
  }

  listIncidents(filters = {}) {
    let incidents = Array.from(this.incidents.values());

    if (filters.status) {
      incidents = incidents.filter(i => i.status === filters.status);
    }

    if (filters.severity) {
      incidents = incidents.filter(i => i.severity === filters.severity);
    }

    if (filters.source) {
      incidents = incidents.filter(i => i.source === filters.source);
    }

    return incidents.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  listPlaybooks() {
    return Array.from(this.playbooks.values());
  }

  getStatistics() {
    return {
      incidents: {
        total: this.stats.totalIncidents,
        resolved: this.stats.incidentsResolved,
        open: this.listIncidents({ status: 'open' }).length,
        bySeverity: Array.from(this.incidents.values()).reduce((acc, i) => {
          acc[i.severity] = (acc[i.severity] || 0) + 1;
          return acc;
        }, {})
      },
      actions: {
        total: this.stats.actionsExecuted,
        autoRemediated: this.stats.autoRemediated
      },
      playbooks: {
        total: this.playbooks.size,
        executions: Array.from(this.playbooks.values()).reduce((sum, p) => sum + p.executionCount, 0)
      }
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const responder = new AgentIncidentResponse({
    autoResponse: true
  });

  switch (command) {
    case 'create-incident':
      const incident = responder.triggerIncident({
        title: args[1] || 'Test Incident',
        severity: args[2] || 'medium',
        source: 'manual'
      });
      console.log('Incident created:', incident.id);
      break;

    case 'list-incidents':
      console.log('Incidents:', responder.listIncidents());
      break;

    case 'demo':
      console.log('=== Agent Incident Response Demo ===\n');

      // List playbooks
      console.log('1. Available Playbooks:');
      const playbooks = responder.listPlaybooks();
      playbooks.forEach(p => {
        console.log(`   - ${p.name} (trigger: ${p.trigger}, severity: ${p.severity})`);
      });

      // Trigger incident - high CPU
      console.log('\n2. Triggering High CPU Incident:');
      const incident1 = responder.triggerIncident({
        title: 'High CPU Usage on api-gateway',
        description: 'CPU usage exceeded 90%',
        severity: 'high',
        source: 'monitoring',
        trigger: 'cpu_high',
        affectedAgents: ['api-gateway']
      });
      console.log('   Incident:', incident1.id);

      // Trigger incident - service failure
      console.log('\n3. Triggering Service Failure Incident:');
      const incident2 = responder.triggerIncident({
        title: 'data-processor Service Down',
        description: 'Service stopped responding',
        severity: 'critical',
        source: 'health_check',
        trigger: 'service_failure',
        affectedAgents: ['data-processor']
      });
      console.log('   Incident:', incident2.id);

      // Wait a moment for async actions
      await new Promise(r => setTimeout(r, 100));

      // List incidents
      console.log('\n4. Active Incidents:');
      const incidents = responder.listIncidents();
      incidents.forEach(i => {
        console.log(`   - [${i.severity}] ${i.title} (${i.status})`);
      });

      // Get incident details
      console.log('\n5. Incident Details:');
      const details1 = responder.getIncident(incident1.id);
      console.log('   High CPU Incident:');
      console.log('   - Status:', details1.status);
      console.log('   - Actions:', details1.actions.length);
      console.log('   - Timeline events:', details1.timeline.length);

      const details2 = responder.getIncident(incident2.id);
      console.log('   Service Failure Incident:');
      console.log('   - Status:', details2.status);
      console.log('   - Actions:', details2.actions.length);

      // Acknowledge incident
      console.log('\n6. Acknowledging incident...');
      responder.acknowledgeIncident(incident1.id, 'admin');
      console.log('   Acknowledged:', incident1.id);

      // Resolve incident
      console.log('\n7. Resolving incident...');
      responder.resolveIncident(incident1.id, 'Scaled up replicas, CPU normalized');
      console.log('   Resolved:', incident1.id);

      // Escalate incident
      console.log('\n8. Escalating incident...');
      responder.escalateIncident(incident2.id, 'on-call-engineer');
      console.log('   Escalated:', incident2.id);

      // Get statistics
      console.log('\n9. Statistics:');
      const stats = responder.getStatistics();
      console.log('   Total Incidents:', stats.incidents.total);
      console.log('   Resolved:', stats.incidents.resolved);
      console.log('   Open:', stats.incidents.open);
      console.log('   Actions Executed:', stats.actions.total);
      console.log('   Auto-Remediated:', stats.actions.autoRemediated);

      // Final incident list
      console.log('\n10. Final Incident Status:');
      const finalIncidents = responder.listIncidents();
      finalIncidents.forEach(i => {
        console.log(`    - [${i.severity}] ${i.title} (${i.status})`);
      });

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-incident-response.js <command> [args]');
      console.log('\nCommands:');
      console.log('  create-incident [title] [severity]  Create incident');
      console.log('  list-incidents                     List incidents');
      console.log('  demo                              Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentIncidentResponse;
