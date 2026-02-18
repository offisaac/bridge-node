/**
 * Event Response - 事件响应工作流
 * 实现自动化事件响应工作流
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ========== Event Types ==========

const EventSeverity = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
  INFO: 'info'
};

const EventStatus = {
  TRIGGERED: 'triggered',
  RUNNING: 'running',
  RESOLVED: 'resolved',
  FAILED: 'failed',
  TIMEOUT: 'timeout'
};

const ActionType = {
  HTTP_REQUEST: 'http_request',
  EXECUTE_SCRIPT: 'execute_script',
  SEND_NOTIFICATION: 'send_notification',
  UPDATE_STATUS: 'update_status',
  ESCALATE: 'escalate',
  RUN_PLAYBOOK: 'run_playbook',
  AUTO_REMEDY: 'auto_remedy'
};

// ========== Event Rule ==========

class EventRule {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description || '';
    this.eventType = config.eventType;
    this.condition = config.condition; // { field, operator, value }
    this.severity = config.severity || EventSeverity.MEDIUM;
    this.actions = config.actions || [];
    this.enabled = config.enabled !== false;
    this.cooldown = config.cooldown || 60000; // ms
    this.timeout = config.timeout || 300000; // ms
    this.lastTriggered = null;
    this.triggerCount = 0;
    this.metadata = config.metadata || {};
  }

  matches(event) {
    if (!this.enabled) return false;
    if (this.eventType && this.eventType !== event.type) return false;

    if (this.condition) {
      const { field, operator, value } = this.condition;
      const eventValue = this._getNestedValue(event, field);

      switch (operator) {
        case 'eq': return eventValue === value;
        case 'ne': return eventValue !== value;
        case 'gt': return eventValue > value;
        case 'gte': return eventValue >= value;
        case 'lt': return eventValue < value;
        case 'lte': return eventValue <= value;
        case 'contains': return String(eventValue).includes(value);
        case 'regex': return new RegExp(value).test(String(eventValue));
        case 'in': return Array.isArray(value) && value.includes(eventValue);
        default: return false;
      }
    }

    return true;
  }

  _getNestedValue(obj, field) {
    return field.split('.').reduce((o, k) => o && o[k], obj);
  }

  canTrigger() {
    if (!this.lastTriggered) return true;
    return Date.now() - this.lastTriggered > this.cooldown;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      eventType: this.eventType,
      condition: this.condition,
      severity: this.severity,
      actions: this.actions,
      enabled: this.enabled,
      cooldown: this.cooldown,
      timeout: this.timeout,
      lastTriggered: this.lastTriggered,
      triggerCount: this.triggerCount,
      metadata: this.metadata
    };
  }
}

// ========== Response Action ==========

class ResponseAction {
  constructor(config) {
    this.id = config.id || `action_${Date.now()}`;
    this.type = config.type;
    this.name = config.name;
    this.config = config.config || {};
    this.retry = config.retry || 0;
    this.retryDelay = config.retryDelay || 1000;
    this.continueOnFailure = config.continueOnFailure !== false;
  }

  async execute(context) {
    const { event, workflow, manager } = context;

    try {
      switch (this.type) {
        case ActionType.HTTP_REQUEST:
          return await this._executeHttpRequest(context);
        case ActionType.EXECUTE_SCRIPT:
          return await this._executeScript(context);
        case ActionType.SEND_NOTIFICATION:
          return await this._sendNotification(context);
        case ActionType.UPDATE_STATUS:
          return await this._updateStatus(context);
        case ActionType.ESCALATE:
          return await this._escalate(context);
        case ActionType.RUN_PLAYBOOK:
          return await this._runPlaybook(context);
        case ActionType.AUTO_REMEDY:
          return await this._autoRemedy(context);
        default:
          throw new Error(`Unknown action type: ${this.type}`);
      }
    } catch (error) {
      if (this.retry > 0) {
        await new Promise(r => setTimeout(r, this.retryDelay));
        return this.execute({ ...context, retry: this.retry - 1 });
      }
      throw error;
    }
  }

  async _executeHttpRequest(context) {
    const { event, manager } = context;
    const { url, method = 'POST', headers = {}, body } = this.config;

    // Simulate HTTP request (in real implementation, use fetch/axios)
    console.log(`[HTTP] ${method} ${url}`);

    return {
      success: true,
      actionId: this.id,
      type: ActionType.HTTP_REQUEST,
      result: { url, method, status: 200 }
    };
  }

  async _executeScript(context) {
    const { event } = context;
    const { script, language = 'javascript' } = this.config;

    console.log(`[Script] Executing ${language} script`);

    // In real implementation, use vm2 or similar
    return {
      success: true,
      actionId: this.id,
      type: ActionType.EXECUTE_SCRIPT,
      result: { executed: true }
    };
  }

  async _sendNotification(context) {
    const { event, workflow } = context;
    const { channel, recipients, template } = this.config;

    console.log(`[Notify] Sending to ${channel}: ${recipients?.join(', ')}`);

    return {
      success: true,
      actionId: this.id,
      type: ActionType.SEND_NOTIFICATION,
      result: { channel, recipients, sent: true }
    };
  }

  async _updateStatus(context) {
    const { event, workflow } = context;
    const { status, comment } = this.config;

    if (workflow) {
      workflow.status = status;
      workflow.resolution = comment;
    }

    return {
      success: true,
      actionId: this.id,
      type: ActionType.UPDATE_STATUS,
      result: { status, comment }
    };
  }

  async _escalate(context) {
    const { event, workflow } = context;
    const { level, to, reason } = this.config;

    console.log(`[Escalate] Level ${level} to ${to}: ${reason}`);

    return {
      success: true,
      actionId: this.id,
      type: ActionType.ESCALATE,
      result: { level, to, escalated: true }
    };
  }

  async _runPlaybook(context) {
    const { event, manager } = context;
    const { playbookId, params = {} } = this.config;

    console.log(`[Playbook] Running ${playbookId}`);

    // In real implementation, run the playbook
    return {
      success: true,
      actionId: this.id,
      type: ActionType.RUN_PLAYBOOK,
      result: { playbookId, executed: true }
    };
  }

  async _autoRemedy(context) {
    const { event } = context;
    const { remedyId, params = {} } = this.config;

    console.log(`[AutoRemedy] Running remedy ${remedyId}`);

    return {
      success: true,
      actionId: this.id,
      type: ActionType.AUTO_REMEDY,
      result: { remedyId, applied: true }
    };
  }
}

// ========== Event Workflow ==========

class EventWorkflow {
  constructor(config) {
    this.id = config.id || `workflow_${Date.now()}`;
    this.ruleId = config.ruleId;
    this.event = config.event;
    this.status = EventStatus.TRIGGERED;
    this.severity = config.severity || EventSeverity.MEDIUM;
    this.actions = [];
    this.results = [];
    this.startedAt = config.startedAt || Date.now();
    this.completedAt = null;
    this.error = null;
    this.resolution = null;
    this.context = config.context || {};
  }

  async execute(manager) {
    this.status = EventStatus.RUNNING;

    for (const action of this.actions) {
      try {
        const result = await action.execute({ event: this.event, workflow: this, manager });
        this.results.push({
          actionId: action.id,
          actionType: action.type,
          success: result.success,
          result: result.result,
          timestamp: Date.now()
        });

        if (!result.success && !action.continueOnFailure) {
          throw new Error(`Action ${action.id} failed`);
        }
      } catch (error) {
        this.results.push({
          actionId: action.id,
          actionType: action.type,
          success: false,
          error: error.message,
          timestamp: Date.now()
        });

        if (!action.continueOnFailure) {
          this.status = EventStatus.FAILED;
          this.error = error.message;
          this.completedAt = Date.now();
          throw error;
        }
      }
    }

    this.status = EventStatus.RESOLVED;
    this.completedAt = Date.now();
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      ruleId: this.ruleId,
      event: this.event,
      status: this.status,
      severity: this.severity,
      actions: this.actions.map(a => ({ id: a.id, type: a.type })),
      results: this.results,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      error: this.error,
      resolution: this.resolution,
      context: this.context
    };
  }
}

// ========== Event Response Manager ==========

class EventResponseManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.rules = new Map(); // ruleId -> EventRule
    this.workflows = new Map(); // workflowId -> EventWorkflow
    this.playbooks = new Map(); // playbookId -> Playbook
    this.remedies = new Map(); // remedyId -> Remedy
    this.storageDir = options.storageDir || './event-response-data';
    this.maxWorkflows = options.maxWorkflows || 1000;

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadRules();
  }

  // ========== Rule Management ==========

  createRule(config) {
    const rule = new EventRule({
      id: config.id || `rule_${Date.now()}`,
      ...config
    });

    this.rules.set(rule.id, rule);
    this._saveRule(rule);
    this.emit('rule:created', rule);

    return rule;
  }

  getRule(id) {
    return this.rules.get(id);
  }

  listRules(filters = {}) {
    let result = Array.from(this.rules.values());

    if (filters.enabled !== undefined) {
      result = result.filter(r => r.enabled === filters.enabled);
    }

    if (filters.eventType) {
      result = result.filter(r => r.eventType === filters.eventType);
    }

    if (filters.severity) {
      result = result.filter(r => r.severity === filters.severity);
    }

    return result;
  }

  updateRule(id, updates) {
    const existing = this.rules.get(id);
    if (!existing) {
      throw new Error(`Rule not found: ${id}`);
    }

    const updated = new EventRule({
      ...existing.toJSON(),
      ...updates,
      id: existing.id
    });

    this.rules.set(id, updated);
    this._saveRule(updated);
    this.emit('rule:updated', updated);

    return updated;
  }

  deleteRule(id) {
    if (!this.rules.has(id)) {
      throw new Error(`Rule not found: ${id}`);
    }

    this.rules.delete(id);
    this._deleteRuleFile(id);
    this.emit('rule:deleted', { id });

    return true;
  }

  enableRule(id) {
    return this.updateRule(id, { enabled: true });
  }

  disableRule(id) {
    return this.updateRule(id, { enabled: false });
  }

  // ========== Event Processing ==========

  async processEvent(event) {
    const matchedRules = [];

    for (const rule of this.rules.values()) {
      if (rule.matches(event) && rule.canTrigger()) {
        matchedRules.push(rule);
      }
    }

    // Sort by severity (critical first)
    const severityOrder = { [EventSeverity.CRITICAL]: 0, [EventSeverity.HIGH]: 1, [EventSeverity.MEDIUM]: 2, [EventSeverity.LOW]: 3, [EventSeverity.INFO]: 4 };
    matchedRules.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    const workflows = [];

    for (const rule of matchedRules) {
      rule.lastTriggered = Date.now();
      rule.triggerCount++;
      this._saveRule(rule);

      const workflow = await this._executeRule(rule, event);
      workflows.push(workflow);

      this.emit('workflow:triggered', workflow);
    }

    return {
      event,
      matchedRules: matchedRules.map(r => r.id),
      workflows
    };
  }

  async _executeRule(rule, event) {
    const workflow = new EventWorkflow({
      id: `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ruleId: rule.id,
      event,
      severity: rule.severity
    });

    // Create action instances
    for (const actionConfig of rule.actions) {
      const action = new ResponseAction(actionConfig);
      workflow.actions.push(action);
    }

    this.workflows.set(workflow.id, workflow);
    this._cleanupOldWorkflows();

    try {
      await workflow.execute(this);
    } catch (error) {
      console.error(`Workflow ${workflow.id} failed:`, error);
    }

    this._saveWorkflow(workflow);
    return workflow;
  }

  // ========== Workflow Management ==========

  getWorkflow(id) {
    return this.workflows.get(id);
  }

  listWorkflows(filters = {}) {
    let result = Array.from(this.workflows.values());

    if (filters.status) {
      result = result.filter(w => w.status === filters.status);
    }

    if (filters.ruleId) {
      result = result.filter(w => w.ruleId === filters.ruleId);
    }

    if (filters.severity) {
      result = result.filter(w => w.severity === filters.severity);
    }

    // Sort by startedAt descending
    result.sort((a, b) => b.startedAt - a.startedAt);

    if (filters.limit) {
      result = result.slice(0, filters.limit);
    }

    return result;
  }

  getWorkflowStats() {
    const workflows = Array.from(this.workflows.values());

    return {
      total: workflows.length,
      byStatus: workflows.reduce((acc, w) => {
        acc[w.status] = (acc[w.status] || 0) + 1;
        return acc;
      }, {}),
      bySeverity: workflows.reduce((acc, w) => {
        acc[w.severity] = (acc[w.severity] || 0) + 1;
        return acc;
      }, {}),
      triggeredToday: workflows.filter(w => {
        const today = new Date().setHours(0, 0, 0, 0);
        return w.startedAt >= today;
      }).length
    };
  }

  _cleanupOldWorkflows() {
    if (this.workflows.size > this.maxWorkflows) {
      const sorted = Array.from(this.workflows.values())
        .sort((a, b) => a.startedAt - b.startedAt);

      const toDelete = sorted.slice(0, this.workflows.size - this.maxWorkflows);
      for (const wf of toDelete) {
        this.workflows.delete(wf.id);
      }
    }
  }

  // ========== Playbook Management ==========

  registerPlaybook(playbook) {
    this.playbooks.set(playbook.id, playbook);
    this.emit('playbook:registered', playbook);
    return playbook;
  }

  getPlaybook(id) {
    return this.playbooks.get(id);
  }

  // ========== Remedy Management ==========

  registerRemedy(remedy) {
    this.remedies.set(remedy.id, remedy);
    this.emit('remedy:registered', remedy);
    return remedy;
  }

  getRemedy(id) {
    return this.remedies.get(id);
  }

  // ========== Persistence ==========

  _loadRules() {
    const dir = path.join(this.storageDir, 'rules');
    if (!fs.existsSync(dir)) return;

    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        const rule = new EventRule(data);
        this.rules.set(rule.id, rule);
      } catch (err) {
        console.error(`Failed to load rule ${file}:`, err);
      }
    }
  }

  _saveRule(rule) {
    const dir = path.join(this.storageDir, 'rules');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(dir, `${rule.id}.json`),
      JSON.stringify(rule.toJSON(), null, 2)
    );
  }

  _deleteRuleFile(id) {
    const file = path.join(this.storageDir, 'rules', `${id}.json`);
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }

  _saveWorkflow(workflow) {
    const dir = path.join(this.storageDir, 'workflows');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(dir, `${workflow.id}.json`),
      JSON.stringify(workflow.toJSON(), null, 2)
    );
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new EventResponseManager();

  switch (command) {
    case 'list':
      console.log('Event Response Rules:');
      console.log('====================');
      for (const rule of manager.listRules()) {
        console.log(`\n${rule.name} (${rule.id})`);
        console.log(`  Event: ${rule.eventType || 'any'}`);
        console.log(`  Severity: ${rule.severity}`);
        console.log(`  Enabled: ${rule.enabled}`);
        console.log(`  Actions: ${rule.actions.length}`);
        console.log(`  Triggered: ${rule.triggerCount} times`);
      }
      break;

    case 'create':
      const rule = manager.createRule({
        name: args[1] || 'New Rule',
        eventType: args[2] || 'alert',
        severity: EventSeverity.HIGH,
        condition: { field: 'value', 'gt': 100 },
        actions: [
          { type: ActionType.SEND_NOTIFICATION, name: 'Notify', config: { channel: 'email' } }
        ]
      });
      console.log(`Created rule: ${rule.id}`);
      break;

    case 'trigger':
      const event = {
        type: args[1] || 'alert',
        severity: args[2] || 'high',
        value: parseInt(args[3]) || 150,
        message: 'Test event',
        timestamp: Date.now()
      };

      console.log('Triggering event:', event);
      manager.processEvent(event).then(result => {
        console.log('\nMatched rules:', result.matchedRules);
        console.log('Workflows executed:', result.workflows.length);
      });
      break;

    case 'workflows':
      const limit = parseInt(args[1]) || 10;
      console.log(`Recent ${limit} workflows:`);
      console.log(JSON.stringify(manager.listWorkflows({ limit }), null, 2));
      break;

    case 'stats':
      console.log('Event Response Statistics:');
      console.log('===========================');
      console.log(JSON.stringify(manager.getWorkflowStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node event-response.js list                 - List all rules');
      console.log('  node event-response.js create <name> <type> <severity> <value> - Create rule');
      console.log('  node event-response.js trigger <type> <severity> <value> - Trigger event');
      console.log('  node event-response.js workflows <limit>   - List recent workflows');
      console.log('  node event-response.js stats                - Show statistics');
      console.log('\nEvent Types: alert, error, metric, custom');
      console.log('Severities:', Object.values(EventSeverity).join(', '));
      console.log('Action Types:', Object.values(ActionType).join(', '));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  EventResponseManager,
  EventRule,
  ResponseAction,
  EventWorkflow,
  EventSeverity,
  EventStatus,
  ActionType
};
