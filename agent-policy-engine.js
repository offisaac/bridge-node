/**
 * Agent Policy Engine
 * Manages and enforces policies for agent operations
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentPolicyEngine {
  constructor(options = {}) {
    this.policies = new Map();
    this.violations = new Map();
    this.exceptions = new Map();
    this.auditLog = [];

    this.config = {
      enforcementMode: options.enforcementMode || 'enforce', // enforce, warn, audit
      strictMode: options.strictMode !== false,
      maxViolationsPerPolicy: options.maxViolationsPerPolicy || 100,
      autoRemediation: options.autoRemediation !== false
    };

    this.stats = {
      totalPolicies: 0,
      activePolicies: 0,
      violations: 0,
      enforced: 0,
      warnings: 0
    };
  }

  createPolicy(policyConfig) {
    const {
      id,
      name,
      description = '',
      resource,
      effect = 'allow', // allow, deny
      actions = [],
      conditions = {},
      subjects = [],
      priority = 0,
      enabled = true,
      remediation = null
    } = policyConfig;

    const policy = {
      id: id || `policy-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      description,
      resource, // agent, deployment, service, etc.
      effect,
      actions,
      conditions,
      subjects,
      priority,
      enabled,
      remediation,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      triggerCount: 0,
      violationCount: 0
    };

    this.policies.set(policy.id, policy);
    this.stats.totalPolicies++;
    if (enabled) this.stats.activePolicies++;

    console.log(`Policy created: ${policy.id} (${name})`);
    return policy;
  }

  deletePolicy(policyId) {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    this.policies.delete(policyId);
    if (policy.enabled) this.stats.activePolicies--;

    console.log(`Policy deleted: ${policyId}`);
    return { success: true, policyId };
  }

  updatePolicy(policyId, updates) {
    const policy = this.policies.get(policyId);
    if (!policy) {
      throw new Error(`Policy not found: ${policyId}`);
    }

    Object.assign(policy, updates);
    policy.updatedAt = new Date().toISOString();

    console.log(`Policy updated: ${policyId}`);
    return policy;
  }

  evaluateRequest(request) {
    const { subject, resource, action, context = {} } = request;

    // Get applicable policies
    const applicablePolicies = this._getApplicablePolicies(resource, action, subject);

    // Sort by priority (highest first)
    applicablePolicies.sort((a, b) => b.priority - a.priority);

    let decision = { allowed: true, policies: [], effect: 'allow' };

    for (const policy of applicablePolicies) {
      if (!policy.enabled) continue;

      // Check conditions
      const conditionsMet = this._evaluateConditions(policy.conditions, subject, resource, context);

      if (conditionsMet) {
        policy.triggerCount++;
        decision.policies.push({
          policyId: policy.id,
          name: policy.name,
          effect: policy.effect
        });

        if (policy.effect === 'deny') {
          decision.allowed = false;
          decision.effect = 'deny';
          decision.deniedBy = policy.name;

          // Record violation
          this._recordViolation(policy, request);

          break;
        }
      }
    }

    // Handle based on enforcement mode
    if (!decision.allowed && this.config.enforcementMode === 'warn') {
      decision.allowed = true;
      decision.effect = 'warn';
      this.stats.warnings++;
    } else if (!decision.allowed) {
      this.stats.enforced++;
    }

    // Log to audit
    this._logAudit(request, decision);

    return decision;
  }

  _getApplicablePolicies(resource, action, subject) {
    const applicable = [];

    for (const policy of this.policies.values()) {
      // Check if policy applies to this resource type
      if (policy.resource && policy.resource !== resource && policy.resource !== '*') {
        continue;
      }

      // Check if policy applies to this action
      if (policy.actions.length > 0 && !policy.actions.includes(action) && !policy.actions.includes('*')) {
        continue;
      }

      // Check subjects
      if (policy.subjects.length > 0) {
        const subjectMatch = policy.subjects.some(s =>
          s === subject || s === '*' || (s.startsWith('role:') && subject.startsWith('role:'))
        );
        if (!subjectMatch) continue;
      }

      applicable.push(policy);
    }

    return applicable;
  }

  _evaluateConditions(conditions, subject, resource, context) {
    if (!conditions || Object.keys(conditions).length === 0) {
      return true;
    }

    for (const [key, condition] of Object.entries(conditions)) {
      let value;

      // Get value from subject, resource, or context
      if (key.startsWith('subject.')) {
        const field = key.substring(8);
        value = subject[field];
      } else if (key.startsWith('resource.')) {
        const field = key.substring(9);
        value = resource[field];
      } else {
        value = context[key];
      }

      // Evaluate condition
      if (condition.operator === 'equals') {
        if (value !== condition.value) return false;
      } else if (condition.operator === 'notEquals') {
        if (value === condition.value) return false;
      } else if (condition.operator === 'in') {
        if (!condition.value.includes(value)) return false;
      } else if (condition.operator === 'notIn') {
        if (condition.value.includes(value)) return false;
      } else if (condition.operator === 'greaterThan') {
        if (value <= condition.value) return false;
      } else if (condition.operator === 'lessThan') {
        if (value >= condition.value) return false;
      } else if (condition.operator === 'exists') {
        if (condition.value && !value) return false;
        if (!condition.value && value) return false;
      } else if (condition.operator === 'matches') {
        const regex = new RegExp(condition.value);
        if (!regex.test(value)) return false;
      }
    }

    return true;
  }

  _recordViolation(policy, request) {
    const violation = {
      id: crypto.randomUUID(),
      policyId: policy.id,
      policyName: policy.name,
      request,
      timestamp: new Date().toISOString(),
      acknowledged: false
    };

    const policyViolations = this.violations.get(policy.id) || [];
    policyViolations.push(violation);

    // Keep only recent violations
    if (policyViolations.length > this.config.maxViolationsPerPolicy) {
      policyViolations.shift();
    }

    this.violations.set(policy.id, policyViolations);
    policy.violationCount++;
    this.stats.violations++;

    console.log(`Policy violation recorded: ${policy.name}`);
  }

  _logAudit(request, decision) {
    const entry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      request: {
        subject: request.subject,
        resource: request.resource,
        action: request.action
      },
      decision: {
        allowed: decision.allowed,
        effect: decision.effect,
        policies: decision.policies
      }
    };

    this.auditLog.push(entry);

    // Keep only last 10000 entries
    if (this.auditLog.length > 10000) {
      this.auditLog.shift();
    }
  }

  acknowledgeViolation(policyId, violationId) {
    const policyViolations = this.violations.get(policyId);
    if (!policyViolations) {
      throw new Error(`No violations found for policy: ${policyId}`);
    }

    const violation = policyViolations.find(v => v.id === violationId);
    if (!violation) {
      throw new Error(`Violation not found: ${violationId}`);
    }

    violation.acknowledged = true;
    violation.acknowledgedAt = new Date().toISOString();

    return violation;
  }

  createException(exceptionConfig) {
    const { policyId, subject, resource, reason, expiresAt } = exceptionConfig;

    const exception = {
      id: crypto.randomUUID(),
      policyId,
      subject,
      resource,
      reason,
      expiresAt,
      createdAt: new Date().toISOString(),
      used: false
    };

    this.exceptions.set(exception.id, exception);

    console.log(`Exception created: ${exception.id} for policy ${policyId}`);
    return exception;
  }

  revokeException(exceptionId) {
    const exception = this.exceptions.get(exceptionId);
    if (!exception) {
      throw new Error(`Exception not found: ${exceptionId}`);
    }

    exception.revoked = true;
    exception.revokedAt = new Date().toISOString();

    return exception;
  }

  getViolations(policyId = null, acknowledged = null) {
    if (policyId) {
      let violations = this.violations.get(policyId) || [];
      if (acknowledged !== null) {
        violations = violations.filter(v => v.acknowledged === acknowledged);
      }
      return violations;
    }

    let allViolations = [];
    for (const violations of this.violations.values()) {
      allViolations = [...allViolations, ...violations];
    }

    if (acknowledged !== null) {
      allViolations = allViolations.filter(v => v.acknowledged === acknowledged);
    }

    return allViolations;
  }

  getAuditLog(filters = {}) {
    let entries = [...this.auditLog];

    if (filters.subject) {
      entries = entries.filter(e => e.request.subject === filters.subject);
    }

    if (filters.resource) {
      entries = entries.filter(e => e.request.resource === filters.resource);
    }

    if (filters.action) {
      entries = entries.filter(e => e.request.action === filters.action);
    }

    if (filters.allowed !== undefined) {
      entries = entries.filter(e => e.decision.allowed === filters.allowed);
    }

    if (filters.limit) {
      entries = entries.slice(-filters.limit);
    }

    return entries;
  }

  listPolicies(filters = {}) {
    let policies = Array.from(this.policies.values());

    if (filters.enabled !== undefined) {
      policies = policies.filter(p => p.enabled === filters.enabled);
    }

    if (filters.resource) {
      policies = policies.filter(p => p.resource === filters.resource);
    }

    if (filters.effect) {
      policies = policies.filter(p => p.effect === filters.effect);
    }

    return policies.sort((a, b) => b.priority - a.priority);
  }

  getStatistics() {
    return {
      policies: {
        total: this.stats.totalPolicies,
        active: this.stats.activePolicies,
        byEffect: Array.from(this.policies.values()).reduce((acc, p) => {
          acc[p.effect] = (acc[p.effect] || 0) + 1;
          return acc;
        }, {})
      },
      violations: {
        total: this.stats.violations,
        unacknowledged: this.getViolations(null, false).length,
        byPolicy: Array.from(this.policies.values()).reduce((acc, p) => {
          acc[p.name] = p.violationCount;
          return acc;
        }, {})
      },
      enforcement: {
        enforced: this.stats.enforced,
        warnings: this.stats.warnings,
        mode: this.config.enforcementMode
      },
      audit: {
        entries: this.auditLog.length
      }
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const engine = new AgentPolicyEngine({
    enforcementMode: 'enforce',
    strictMode: true
  });

  switch (command) {
    case 'create-policy':
      const policyName = args[1] || 'deny-production-delete';
      const policy = engine.createPolicy({
        name: policyName,
        description: 'Deny delete operations on production resources',
        resource: 'deployment',
        effect: 'deny',
        actions: ['delete'],
        subjects: ['role:developer'],
        priority: 100,
        conditions: {
          'resource.environment': {
            operator: 'equals',
            value: 'production'
          }
        }
      });
      console.log('Policy created:', policy.id);
      break;

    case 'evaluate':
      const evalResult = engine.evaluateRequest({
        subject: 'role:developer',
        resource: 'deployment',
        action: 'delete',
        context: { environment: 'production' }
      });
      console.log('Evaluation result:', evalResult);
      break;

    case 'list-policies':
      console.log('Policies:', engine.listPolicies());
      break;

    case 'demo':
      console.log('=== Agent Policy Engine Demo ===\n');

      // Create policies
      console.log('1. Creating policies...');

      const policy1 = engine.createPolicy({
        name: 'Deny Production Delete',
        description: 'Deny delete operations on production resources',
        resource: 'deployment',
        effect: 'deny',
        actions: ['delete'],
        subjects: ['role:developer', 'role:operator'],
        priority: 100,
        conditions: {
          'resource.environment': {
            operator: 'equals',
            value: 'production'
          }
        }
      });
      console.log('   Created:', policy1.name);

      const policy2 = engine.createPolicy({
        name: 'Allow Read Operations',
        description: 'Allow read operations on all resources',
        resource: '*',
        effect: 'allow',
        actions: ['get', 'list', 'watch'],
        subjects: ['*'],
        priority: 0
      });
      console.log('   Created:', policy2.name);

      const policy3 = engine.createPolicy({
        name: 'Require Approval for Scaling',
        description: 'Require approval for scaling beyond 10 replicas',
        resource: 'deployment',
        effect: 'deny',
        actions: ['scale'],
        subjects: ['role:developer'],
        priority: 50,
        conditions: {
          'resource.replicas': {
            operator: 'greaterThan',
            value: 10
          }
        }
      });
      console.log('   Created:', policy3.name);

      const policy4 = engine.createPolicy({
        name: 'Memory Limit',
        description: 'Deny deployments with memory > 8Gi',
        resource: 'deployment',
        effect: 'deny',
        actions: ['create', 'update'],
        subjects: ['*'],
        priority: 75,
        conditions: {
          'resource.memoryLimit': {
            operator: 'greaterThan',
            value: 8192
          }
        }
      });
      console.log('   Created:', policy4.name);

      // Evaluate requests
      console.log('\n2. Evaluating requests...');

      const req1 = engine.evaluateRequest({
        subject: 'role:developer',
        resource: 'deployment',
        action: 'delete',
        context: { environment: 'production' }
      });
      console.log('   Developer delete production:', req1.allowed ? 'ALLOWED' : 'DENIED');

      const req2 = engine.evaluateRequest({
        subject: 'role:developer',
        resource: 'deployment',
        action: 'delete',
        context: { environment: 'staging' }
      });
      console.log('   Developer delete staging:', req2.allowed ? 'ALLOWED' : 'DENIED');

      const req3 = engine.evaluateRequest({
        subject: 'role:admin',
        resource: 'deployment',
        action: 'delete',
        context: { environment: 'production' }
      });
      console.log('   Admin delete production:', req3.allowed ? 'ALLOWED' : 'DENIED');

      const req4 = engine.evaluateRequest({
        subject: 'role:developer',
        resource: 'deployment',
        action: 'scale',
        context: { replicas: 5 }
      });
      console.log('   Developer scale to 5:', req4.allowed ? 'ALLOWED' : 'DENIED');

      const req5 = engine.evaluateRequest({
        subject: 'role:developer',
        resource: 'deployment',
        action: 'scale',
        context: { replicas: 15 }
      });
      console.log('   Developer scale to 15:', req5.allowed ? 'ALLOWED' : 'DENIED');

      const req6 = engine.evaluateRequest({
        subject: 'role:developer',
        resource: 'deployment',
        action: 'get',
        context: {}
      });
      console.log('   Developer get:', req6.allowed ? 'ALLOWED' : 'DENIED');

      // Create exception
      console.log('\n3. Creating exception...');
      const exception = engine.createException({
        policyId: policy1.id,
        subject: 'user:john',
        resource: 'deployment',
        reason: 'Emergency maintenance required',
        expiresAt: '2026-02-20T00:00:00Z'
      });
      console.log('   Created exception for user:john');

      // Get violations
      console.log('\n4. Violations:');
      const violations = engine.getViolations();
      console.log('   Total violations:', violations.length);

      // Get audit log
      console.log('\n5. Audit Log (last 3):');
      const audit = engine.getAuditLog({ limit: 3 });
      audit.forEach(entry => {
        console.log(`   [${entry.decision.effect}] ${entry.request.subject} ${entry.request.action} ${entry.request.resource}`);
      });

      // Get statistics
      console.log('\n6. Statistics:');
      const stats = engine.getStatistics();
      console.log('   Total Policies:', stats.policies.total);
      console.log('   Active Policies:', stats.policies.active);
      console.log('   Total Violations:', stats.violations.total);
      console.log('   Enforced:', stats.enforcement.enforced);
      console.log('   Warnings:', stats.enforcement.warnings);

      // List policies
      console.log('\n7. All Policies:');
      const policies = engine.listPolicies();
      policies.forEach(p => {
        console.log(`   - ${p.name} (${p.effect}, priority: ${p.priority})`);
      });

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-policy-engine.js <command> [args]');
      console.log('\nCommands:');
      console.log('  create-policy [name]     Create a policy');
      console.log('  evaluate                  Evaluate a request');
      console.log('  list-policies            List policies');
      console.log('  demo                     Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentPolicyEngine;
