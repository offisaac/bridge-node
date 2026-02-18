/**
 * Agent ACL Module
 *
 * Provides agent access control lists with permissions, roles, and enforcement.
 * Usage: node agent-acl.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   check <agent> <perm>   Check permission
 *   add <agent> <role>     Add agent to role
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const ACL_DB = path.join(DATA_DIR, 'agent-acl.json');

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

/**
 * Permission
 */
class Permission {
  constructor(name, description = '', actions = []) {
    this.name = name;
    this.description = description;
    this.actions = actions; // e.g., ['read', 'write', 'delete']
  }

  allows(action) {
    return this.actions.includes(action) || this.actions.includes('*');
  }
}

/**
 * Role
 */
class Role {
  constructor(name, permissions = [], description = '') {
    this.name = name;
    this.description = description;
    this.permissions = permissions;
    this.inherits = [];
  }

  addPermission(permission) {
    if (!this.permissions.includes(permission)) {
      this.permissions.push(permission);
    }
  }

  removePermission(permission) {
    this.permissions = this.permissions.filter(p => p !== permission);
  }

  inherit(roleName) {
    if (!this.inherits.includes(roleName)) {
      this.inherits.push(roleName);
    }
  }

  hasPermission(permissionName, allPermissions) {
    if (this.permissions.includes(permissionName)) {
      return true;
    }
    // Check inherited roles
    for (const inheritedRole of this.inherits) {
      const role = allPermissions[inheritedRole];
      if (role && role.hasPermission(permissionName, allPermissions)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Access Control Entry
 */
class ACE {
  constructor(principal, permission, allow = true, priority = 0) {
    this.principal = principal; // agent ID or role
    this.permission = permission;
    this.allow = allow;
    this.priority = priority;
    this.conditions = {};
  }

  addCondition(key, value) {
    this.conditions[key] = value;
  }

  matches(context) {
    for (const [key, value] of Object.entries(this.conditions)) {
      if (context[key] !== value) {
        return false;
      }
    }
    return true;
  }
}

/**
 * Access Control List
 */
class ACL {
  constructor() {
    this.entries = [];
  }

  addEntry(ace) {
    this.entries.push(ace);
    // Sort by priority (higher first)
    this.entries.sort((a, b) => b.priority - a.priority);
  }

  removeEntry(principal, permission) {
    this.entries = this.entries.filter(
      e => !(e.principal === principal && e.permission === permission)
    );
  }

  evaluate(principal, permission, context = {}) {
    for (const entry of this.entries) {
      if (entry.principal === principal || entry.principal === '*') {
        if (entry.permission === permission || entry.permission === '*') {
          if (Object.keys(entry.conditions).length === 0 || entry.matches(context)) {
            return entry.allow;
          }
        }
      }
    }
    return false; // Default deny
  }

  getEntries(principal = null) {
    if (principal) {
      return this.entries.filter(e => e.principal === principal);
    }
    return this.entries;
  }
}

/**
 * Agent ACL Manager
 */
class AgentACLManager {
  constructor() {
    this.roles = new Map();
    this.agentRoles = new Map();
    this.acls = new Map();
    this.state = loadJSON(ACL_DB, {
      roles: {},
      agentRoles: {},
      acls: {}
    });

    // Load saved state
    for (const [name, roleData] of Object.entries(this.state.roles || {})) {
      const role = new Role(name, roleData.permissions || [], roleData.description);
      role.inherits = roleData.inherits || [];
      this.roles.set(name, role);
    }

    this.agentRoles = new Map(Object.entries(this.state.agentRoles || {}));

    for (const [resource, acls] of Object.entries(this.state.acls || {})) {
      const acl = new ACL();
      for (const entry of acls) {
        acl.addEntry(new ACE(entry.principal, entry.permission, entry.allow, entry.priority));
      }
      this.acls.set(resource, acl);
    }

    // Create default roles if none exist
    if (this.roles.size === 0) {
      this.createDefaultRoles();
    }
  }

  createDefaultRoles() {
    // Admin role
    const admin = new Role('admin', ['*'], 'Full access');
    this.roles.set('admin', admin);

    // Developer role
    const developer = new Role('developer', ['read', 'write', 'execute'], 'Development access');
    developer.inherit('viewer');
    this.roles.set('developer', developer);

    // Viewer role
    const viewer = new Role('viewer', ['read'], 'Read-only access');
    this.roles.set('viewer', viewer);

    // Operator role
    const operator = new Role('operator', ['read', 'write', 'execute', 'manage'], 'Operations access');
    this.roles.set('operator', viewer);

    this.save();
  }

  // Role management
  createRole(name, permissions = [], description = '') {
    const role = new Role(name, permissions, description);
    this.roles.set(name, role);
    this.save();
    return role;
  }

  getRole(name) {
    return this.roles.get(name);
  }

  deleteRole(name) {
    // Don't delete system roles
    if (['admin', 'developer', 'viewer', 'operator'].includes(name)) {
      return { error: 'Cannot delete system role' };
    }
    this.roles.delete(name);
    this.save();
    return { success: true };
  }

  listRoles() {
    return Array.from(this.roles.keys());
  }

  // Agent role assignment
  assignRole(agentId, roleName) {
    const role = this.roles.get(roleName);
    if (!role) {
      return { error: `Role ${roleName} not found` };
    }

    if (!this.agentRoles.has(agentId)) {
      this.agentRoles.set(agentId, []);
    }

    const roles = this.agentRoles.get(agentId);
    if (!roles.includes(roleName)) {
      roles.push(roleName);
      this.save();
    }

    return { success: true, agent: agentId, role: roleName };
  }

  removeRole(agentId, roleName) {
    if (!this.agentRoles.has(agentId)) {
      return { error: `Agent ${agentId} not found` };
    }

    const roles = this.agentRoles.get(agentId);
    this.agentRoles.set(agentId, roles.filter(r => r !== roleName));
    this.save();

    return { success: true };
  }

  getAgentRoles(agentId) {
    return this.agentRoles.get(agentId) || [];
  }

  // ACL management
  setACL(resource, acl) {
    this.acls.set(resource, acl);
    this.save();
  }

  addACLEntry(resource, principal, permission, allow = true, priority = 0) {
    if (!this.acls.has(resource)) {
      this.acls.set(resource, new ACL());
    }

    const acl = this.acls.get(resource);
    acl.addEntry(new ACE(principal, permission, allow, priority));
    this.save();
  }

  // Permission check
  checkPermission(agentId, permission, context = {}) {
    // Check direct agent permissions via ACL
    for (const [resource, acl] of this.acls) {
      if (acl.evaluate(agentId, permission, context)) {
        return true;
      }
      if (acl.evaluate(agentId, '*', context)) {
        return true;
      }
      // Check role permissions via ACL
      const roles = this.getAgentRoles(agentId);
      for (const roleName of roles) {
        if (acl.evaluate(`role:${roleName}`, permission, context)) {
          return true;
        }
        if (acl.evaluate(`role:${roleName}`, '*', context)) {
          return true;
        }
      }
    }

    // Check role-based permissions
    const roles = this.getAgentRoles(agentId);
    for (const roleName of roles) {
      const role = this.roles.get(roleName);
      if (role && role.hasPermission(permission, Object.fromEntries(this.roles))) {
        return true;
      }
    }

    // Admin has full access
    if (roles.includes('admin')) {
      return true;
    }

    return false;
  }

  // Evaluate access
  can(agentId, action, resource) {
    // Try resource-specific permission first
    const permission = `${resource}:${action}`;
    if (this.checkPermission(agentId, permission)) {
      return true;
    }
    // Fall back to action-only permission
    return this.checkPermission(agentId, action);
  }

  save() {
    const rolesState = {};
    for (const [name, role] of this.roles) {
      rolesState[name] = {
        permissions: role.permissions,
        description: role.description,
        inherits: role.inherits
      };
    }

    const aclsState = {};
    for (const [resource, acl] of this.acls) {
      aclsState[resource] = acl.entries.map(e => ({
        principal: e.principal,
        permission: e.permission,
        allow: e.allow,
        priority: e.priority
      }));
    }

    this.state = {
      roles: rolesState,
      agentRoles: Object.fromEntries(this.agentRoles),
      acls: aclsState
    };

    saveJSON(ACL_DB, this.state);
  }

  // Get status
  getStatus() {
    return {
      rolesCount: this.roles.size,
      agentsCount: this.agentRoles.size,
      aclsCount: this.acls.size,
      roles: this.listRoles()
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent ACL Demo ===\n');

  const manager = new AgentACLManager();

  // Show roles
  console.log('1. Default Roles:');
  const roles = manager.listRoles();
  roles.forEach(role => {
    const r = manager.getRole(role);
    console.log(`   ${role}: ${r.permissions.join(', ')}`);
  });

  // Assign roles to agents
  console.log('\n2. Assigning Roles:');
  manager.assignRole('agent-001', 'admin');
  manager.assignRole('agent-002', 'developer');
  manager.assignRole('agent-003', 'viewer');
  console.log('   agent-001 -> admin');
  console.log('   agent-002 -> developer');
  console.log('   agent-003 -> viewer');

  // Check permissions
  console.log('\n3. Permission Checks:');
  console.log(`   agent-001 can read config: ${manager.can('agent-001', 'read', 'config')}`);
  console.log(`   agent-002 can write config: ${manager.can('agent-002', 'write', 'config')}`);
  console.log(`   agent-003 can delete config: ${manager.can('agent-003', 'delete', 'config')}`);

  // Create custom role
  console.log('\n4. Creating Custom Role:');
  const auditor = manager.createRole('auditor', ['read', 'audit'], 'Audit access');
  console.log(`   Created auditor role: ${auditor.permissions.join(', ')}`);

  manager.assignRole('agent-004', 'auditor');
  console.log('   agent-004 -> auditor');
  console.log(`   agent-004 can audit logs: ${manager.can('agent-004', 'audit', 'logs')}`);

  // ACL entries
  console.log('\n5. ACL Entries:');
  manager.addACLEntry('deployments', 'role:developer', 'write', true, 10);
  manager.addACLEntry('deployments', 'role:viewer', 'write', false, 5);
  console.log('   Added: developers can write deployments');
  console.log('   Added: viewers cannot write deployments');

  console.log('\n6. ACL Permission Checks:');
  console.log(`   agent-002 (developer) can write deployments: ${manager.can('agent-002', 'write', 'deployments')}`);
  console.log(`   agent-003 (viewer) can write deployments: ${manager.can('agent-003', 'write', 'deployments')}`);

  // Role inheritance
  console.log('\n7. Role Inheritance:');
  const developerRole = manager.getRole('developer');
  console.log(`   developer inherits: ${developerRole.inherits.join(', ') || 'none'}`);
  console.log(`   developer has 'read' permission: ${developerRole.hasPermission('read', Object.fromEntries(manager.roles))}`);

  // Status
  console.log('\n8. System Status:');
  const status = manager.getStatus();
  console.log(`   Roles: ${status.rolesCount}`);
  console.log(`   Agents with roles: ${status.agentsCount}`);
  console.log(`   ACLs: ${status.aclsCount}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'check') {
  const manager = new AgentACLManager();
  const result = manager.can(args[1], args[2], args[3] || '*');
  console.log(result);
} else if (cmd === 'add') {
  const manager = new AgentACLManager();
  console.log(manager.assignRole(args[1], args[2]));
} else {
  console.log('Agent ACL Module');
  console.log('Usage: node agent-acl.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  check <agent> <perm>  Check permission');
  console.log('  add <agent> <role>    Add agent to role');
}
