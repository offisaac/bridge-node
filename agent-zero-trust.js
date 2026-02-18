/**
 * Agent Zero Trust Network Module
 *
 * Implements zero trust security principles for agent communication.
 * Usage: node agent-zero-trust.js [command] [options]
 *
 * Commands:
 *   verify <agent-id>              Verify agent identity
 *   policy list                    List trust policies
 *   policy create <name> <rules>  Create trust policy
 *   access <agent-id> <resource>  Check access to resource
 *   segment <agent-id>            Get agent segment
 *   audit                          Show trust audit log
 *   demo                           Run demo
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const POLICIES_DB = path.join(DATA_DIR, 'zero-trust-policies.json');
const AGENTS_DB = path.join(DATA_DIR, 'zero-trust-agents.json');
const AUDIT_DB = path.join(DATA_DIR, 'zero-trust-audit.json');
const SEGMENTS_DB = path.join(DATA_DIR, 'zero-trust-segments.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON(file, defaultVal = {}) {
  ensureDataDir();
  if (!fs.existsSync(file)) {
    return defaultVal;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return defaultVal;
  }
}

function saveJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Zero Trust Policy Manager
 */
class PolicyManager {
  constructor() {
    this.policies = loadJSON(POLICIES_DB, {
      default: {
        name: 'default',
        description: 'Default zero trust policy',
        verifyIdentity: true,
        encryptTraffic: true,
        leastPrivilege: true,
        continuousValidation: true,
        microsegmentation: true,
        rules: [
          { resource: '*', action: 'allow', condition: 'verified' },
          { resource: '*', action: 'deny', condition: 'always' }
        ]
      },
      strict: {
        name: 'strict',
        description: 'Strict zero trust with MFA',
        verifyIdentity: true,
        encryptTraffic: true,
        leastPrivilege: true,
        continuousValidation: true,
        microsegmentation: true,
        mfaRequired: true,
        rules: [
          { resource: '*', action: 'deny', condition: 'always' },
          { resource: 'internal', action: 'allow', condition: 'mfa_verified' }
        ]
      },
      permissive: {
        name: 'permissive',
        description: 'Permissive trust for testing',
        verifyIdentity: false,
        encryptTraffic: false,
        leastPrivilege: false,
        continuousValidation: false,
        microsegmentation: false,
        rules: [
          { resource: '*', action: 'allow', condition: 'always' }
        ]
      }
    });
  }

  list() {
    return Object.values(this.policies);
  }

  get(name) {
    return this.policies[name] || this.policies.default;
  }

  create(name, options = {}) {
    this.policies[name] = {
      name,
      description: options.description || `Custom policy: ${name}`,
      verifyIdentity: options.verifyIdentity ?? true,
      encryptTraffic: options.encryptTraffic ?? true,
      leastPrivilege: options.leastPrivilege ?? true,
      continuousValidation: options.continuousValidation ?? true,
      microsegmentation: options.microsegmentation ?? true,
      mfaRequired: options.mfaRequired ?? false,
      rules: options.rules || [
        { resource: '*', action: 'deny', condition: 'always' }
      ]
    };
    saveJSON(POLICIES_DB, this.policies);
    return this.policies[name];
  }

  delete(name) {
    if (name === 'default') return false;
    delete this.policies[name];
    saveJSON(POLICIES_DB, this.policies);
    return true;
  }
}

/**
 * Segment Manager (Microsegmentation)
 */
class SegmentManager {
  constructor() {
    this.segments = loadJSON(SEGMENTS_DB, {
      public: {
        name: 'public',
        description: 'Public facing services',
        riskLevel: 'high',
        allowedSources: ['public', 'dmz'],
        allowedDestinations: ['public', 'dmz']
      },
      dmz: {
        name: 'dmz',
        description: 'Demilitarized zone',
        riskLevel: 'medium',
        allowedSources: ['dmz', 'internal'],
        allowedDestinations: ['internal', 'database']
      },
      internal: {
        name: 'internal',
        description: 'Internal services',
        riskLevel: 'low',
        allowedSources: ['internal', 'dmz'],
        allowedDestinations: ['internal', 'database', 'cache']
      },
      database: {
        name: 'database',
        description: 'Database tier',
        riskLevel: 'critical',
        allowedSources: ['database', 'internal'],
        allowedDestinations: []
      },
      cache: {
        name: 'cache',
        description: 'Cache tier',
        riskLevel: 'low',
        allowedSources: ['cache', 'internal'],
        allowedDestinations: []
      }
    });
  }

  list() {
    return Object.values(this.segments);
  }

  get(name) {
    return this.segments[name];
  }

  getAgentSegment(agentId) {
    const agents = loadJSON(AGENTS_DB, {});
    return agents[agentId]?.segment || 'internal';
  }

  canAccess(sourceSegment, destResource) {
    const destSegment = this.segments[destResource] || this.segments.internal;
    if (!destSegment) return false;

    return destSegment.allowedSources.includes(sourceSegment) ||
           destSegment.allowedSources.includes('*');
  }
}

/**
 * Agent Identity Manager
 */
class IdentityManager {
  constructor() {
    this.agents = loadJSON(AGENTS_DB, {
      'agent-gateway': {
        id: 'agent-gateway',
        name: 'API Gateway',
        segment: 'public',
        verified: true,
        mfaVerified: false,
        trustScore: 100,
        lastVerified: Date.now(),
        attributes: { type: 'gateway', role: 'ingress' }
      },
      'agent-worker-001': {
        id: 'agent-worker-001',
        name: 'Worker Agent 1',
        segment: 'internal',
        verified: true,
        mfaVerified: true,
        trustScore: 95,
        lastVerified: Date.now(),
        attributes: { type: 'worker', role: 'processor' }
      },
      'agent-db': {
        id: 'agent-db',
        name: 'Database Agent',
        segment: 'database',
        verified: true,
        mfaVerified: false,
        trustScore: 90,
        lastVerified: Date.now(),
        attributes: { type: 'service', role: 'database' }
      }
    });
  }

  get(agentId) {
    return this.agents[agentId];
  }

  verify(agentId) {
    const agent = this.agents[agentId];
    if (!agent) {
      return { verified: false, reason: 'Agent not registered' };
    }

    // Simulate continuous validation
    const timeSinceVerify = Date.now() - agent.lastVerified;
    if (timeSinceVerify > 300000) { // 5 minutes
      agent.trustScore = Math.max(0, agent.trustScore - 10);
    }

    agent.lastVerified = Date.now();
    this.save();

    return {
      verified: agent.verified && agent.trustScore > 50,
      agent,
      trustScore: agent.trustScore,
      reason: agent.trustScore <= 50 ? 'Trust score too low' : 'OK'
    };
  }

  register(agentId, options = {}) {
    this.agents[agentId] = {
      id: agentId,
      name: options.name || agentId,
      segment: options.segment || 'internal',
      verified: options.verified ?? true,
      mfaVerified: options.mfaVerified ?? false,
      trustScore: options.trustScore || 100,
      lastVerified: Date.now(),
      attributes: options.attributes || {}
    };
    this.save();
    return this.agents[agentId];
  }

  updateTrust(agentId, delta) {
    if (this.agents[agentId]) {
      this.agents[agentId].trustScore = Math.max(0, Math.min(100,
        this.agents[agentId].trustScore + delta));
      this.agents[agentId].lastVerified = Date.now();
      this.save();
    }
  }

  save() {
    saveJSON(AGENTS_DB, this.agents);
  }
}

/**
 * Audit Logger
 */
class AuditLogger {
  constructor() {
    this.logs = loadJSON(AUDIT_DB, []);
  }

  log(event) {
    const entry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      ...event
    };
    this.logs.unshift(entry);
    if (this.logs.length > 1000) {
      this.logs = this.logs.slice(0, 1000);
    }
    saveJSON(AUDIT_DB, this.logs);
    return entry;
  }

  getRecent(count = 20) {
    return this.logs.slice(0, count);
  }
}

/**
 * Zero Trust Engine
 */
class ZeroTrustEngine {
  constructor() {
    this.policies = new PolicyManager();
    this.segments = new SegmentManager();
    this.identity = new IdentityManager();
    this.audit = new AuditLogger();
  }

  checkAccess(agentId, resource, action = 'read') {
    const agent = this.identity.get(agentId);
    if (!agent) {
      this.audit.log({
        type: 'ACCESS_DENIED',
        agentId,
        resource,
        reason: 'Agent not registered'
      });
      return { allowed: false, reason: 'Agent not registered' };
    }

    const verification = this.identity.verify(agentId);
    if (!verification.verified) {
      this.audit.log({
        type: 'ACCESS_DENIED',
        agentId,
        resource,
        reason: verification.reason
      });
      return { allowed: false, reason: verification.reason };
    }

    const policy = this.policies.get('default');
    const sourceSegment = agent.segment;

    // Check microsegmentation
    if (!this.segments.canAccess(sourceSegment, resource)) {
      this.audit.log({
        type: 'ACCESS_DENIED',
        agentId,
        resource,
        sourceSegment,
        reason: 'Segment not allowed'
      });
      return { allowed: false, reason: 'Cross-segment access denied' };
    }

    // Check policy rules - check allow rules first, then deny
    let explicitlyAllowed = false;
    let matchedRule = null;

    for (const rule of policy.rules) {
      if ((rule.resource === resource || rule.resource === '*')) {
        if (rule.action === 'allow') {
          explicitlyAllowed = true;
          matchedRule = rule;
          break;
        }
      }
    }

    if (explicitlyAllowed) {
      this.audit.log({
        type: 'ACCESS_ALLOWED',
        agentId,
        resource,
        action,
        sourceSegment,
        rule: matchedRule?.condition
      });
      return {
        allowed: true,
        agent,
        resource,
        action,
        trustScore: verification.trustScore
      };
    }

    // Check deny rules only if no explicit allow
    for (const rule of policy.rules) {
      if (rule.resource === resource || rule.resource === '*') {
        if (rule.action === 'deny') {
          this.audit.log({
            type: 'ACCESS_DENIED',
            agentId,
            resource,
            rule: rule.condition
          });
          return { allowed: false, reason: `Policy denied: ${rule.condition}` };
        }
      }
    }

    this.audit.log({
      type: 'ACCESS_ALLOWED',
      agentId,
      resource,
      action,
      sourceSegment
    });

    return {
      allowed: true,
      agent,
      resource,
      action,
      trustScore: verification.trustScore
    };
  }
}

/**
 * Demo
 */
function demo() {
  console.log('=== Agent Zero Trust Network Demo ===\n');

  const engine = new ZeroTrustEngine();

  // Show policies
  console.log('1. Zero Trust Policies:');
  engine.policies.list().forEach(p => {
    console.log(`   - ${p.name}: ${p.description}`);
    console.log(`     Verify: ${p.verifyIdentity}, Encrypt: ${p.encryptTraffic}, MFA: ${p.mfaRequired || false}`);
  });

  // Show segments
  console.log('\n2. Network Segments (Microsegmentation):');
  engine.segments.list().forEach(s => {
    console.log(`   - ${s.name} (${s.riskLevel} risk)`);
    console.log(`     Sources: ${s.allowedSources.join(', ')}`);
  });

  // Verify agents
  console.log('\n3. Agent Identity Verification:');
  ['agent-gateway', 'agent-worker-001', 'agent-db', 'unknown-agent'].forEach(id => {
    const result = engine.identity.verify(id);
    console.log(`   - ${id}: ${result.verified ? 'VERIFIED' : 'DENIED'} (score: ${result.trustScore || 'N/A'})`);
  });

  // Check access
  console.log('\n4. Access Control Tests:');
  const accessTests = [
    { agent: 'agent-gateway', resource: 'public' },
    { agent: 'agent-worker-001', resource: 'internal' },
    { agent: 'agent-worker-001', resource: 'cache' },
    { agent: 'agent-db', resource: 'database' },
    { agent: 'agent-db', resource: 'internal' }
  ];

  accessTests.forEach(test => {
    const result = engine.checkAccess(test.agent, test.resource);
    console.log(`   - ${test.agent} -> ${test.resource}: ${result.allowed ? 'ALLOWED' : 'DENIED'}`);
    if (!result.allowed) {
      console.log(`     Reason: ${result.reason}`);
    }
  });

  // Simulate trust score changes
  console.log('\n5. Trust Score Updates:');
  engine.identity.updateTrust('agent-worker-001', -20);
  const worker = engine.identity.verify('agent-worker-001');
  console.log(`   - agent-worker-001 trust after penalty: ${worker.trustScore}`);

  // Audit log
  console.log('\n6. Recent Audit Events:');
  engine.audit.getRecent(5).forEach(log => {
    console.log(`   - [${log.type}] ${log.agentId} -> ${log.resource || log.reason}`);
  });

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'verify') {
  const agentId = args[1] || 'agent-default';
  const engine = new ZeroTrustEngine();
  const result = engine.identity.verify(agentId);
  console.log(`Agent: ${agentId}`);
  console.log(`Verified: ${result.verified}`);
  console.log(`Trust Score: ${result.trustScore}`);
  console.log(`Reason: ${result.reason}`);
} else if (cmd === 'policy') {
  const subCmd = args[1];
  const policyMgr = new PolicyManager();

  if (subCmd === 'list') {
    console.log('Zero Trust Policies:');
    policyMgr.list().forEach(p => {
      console.log(`  ${p.name}: ${p.description}`);
    });
  } else if (subCmd === 'create') {
    const name = args[2];
    const policy = policyMgr.create(name, { description: `Custom policy: ${name}` });
    console.log(`Created policy: ${policy.name}`);
  } else if (subCmd === 'delete') {
    const name = args[2];
    if (policyMgr.delete(name)) {
      console.log(`Deleted policy: ${name}`);
    } else {
      console.log('Cannot delete default policy');
    }
  }
} else if (cmd === 'access') {
  const agentId = args[1];
  const resource = args[2];
  const engine = new ZeroTrustEngine();
  const result = engine.checkAccess(agentId, resource);
  console.log(`Access Check: ${agentId} -> ${resource}`);
  console.log(`Allowed: ${result.allowed}`);
  if (!result.allowed) {
    console.log(`Reason: ${result.reason}`);
  }
} else if (cmd === 'segment') {
  const agentId = args[1];
  const identity = new IdentityManager();
  const agent = identity.get(agentId);
  if (agent) {
    console.log(`Agent ${agentId} is in segment: ${agent.segment}`);
  } else {
    console.log(`Agent ${agentId} not found`);
  }
} else if (cmd === 'audit') {
  const audit = new AuditLogger();
  console.log('Recent Audit Events:');
  audit.getRecent(10).forEach(log => {
    console.log(`  [${log.type}] ${log.agentId} - ${log.resource || log.reason}`);
  });
} else if (cmd === 'demo') {
  demo();
} else {
  console.log('Agent Zero Trust Network');
  console.log('Usage: node agent-zero-trust.js [command]');
  console.log('Commands:');
  console.log('  verify <agent-id>              Verify agent identity');
  console.log('  policy list                     List trust policies');
  console.log('  policy create <name>            Create trust policy');
  console.log('  access <agent-id> <resource>   Check access to resource');
  console.log('  segment <agent-id>              Get agent segment');
  console.log('  audit                           Show trust audit log');
  console.log('  demo                            Run demo');
}
