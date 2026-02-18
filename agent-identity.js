/**
 * Agent Identity Module
 *
 * Provides identity management with profiles, roles, and access control.
 * Usage: node agent-identity.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show identity stats
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
 * Identity Status
 */
const IdentityStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  PENDING: 'pending'
};

/**
 * Identity Type
 */
const IdentityType = {
  USER: 'user',
  SERVICE: 'service',
  DEVICE: 'device',
  APPLICATION: 'application'
};

/**
 * Identity Attribute
 */
class IdentityAttribute {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.verified = false;
    this.createdAt = Date.now();
  }

  verify() {
    this.verified = true;
  }

  toJSON() {
    return {
      key: this.key,
      value: this.value,
      verified: this.verified,
      createdAt: this.createdAt
    };
  }
}

/**
 * Identity
 */
class Identity {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type || IdentityType.USER;
    this.status = config.status || IdentityStatus.PENDING;
    this.email = config.email;
    this.attributes = new Map();
    this.roles = [];
    this.groups = [];
    this.metadata = config.metadata || {};
    this.createdAt = config.createdAt || Date.now();
    this.updatedAt = config.updatedAt || Date.now();
    this.lastLogin = null;

    // Add initial attributes
    if (config.attributes) {
      for (const [key, value] of Object.entries(config.attributes)) {
        this.setAttribute(key, value);
      }
    }
  }

  setAttribute(key, value) {
    this.attributes.set(key, new IdentityAttribute(key, value));
    this.updatedAt = Date.now();
  }

  getAttribute(key) {
    return this.attributes.get(key);
  }

  addRole(role) {
    if (!this.roles.includes(role)) {
      this.roles.push(role);
      this.updatedAt = Date.now();
    }
  }

  removeRole(role) {
    const index = this.roles.indexOf(role);
    if (index !== -1) {
      this.roles.splice(index, 1);
      this.updatedAt = Date.now();
    }
  }

  addToGroup(group) {
    if (!this.groups.includes(group)) {
      this.groups.push(group);
      this.updatedAt = Date.now();
    }
  }

  removeFromGroup(group) {
    const index = this.groups.indexOf(group);
    if (index !== -1) {
      this.groups.splice(index, 1);
      this.updatedAt = Date.now();
    }
  }

  activate() {
    this.status = IdentityStatus.ACTIVE;
    this.updatedAt = Date.now();
  }

  deactivate() {
    this.status = IdentityStatus.INACTIVE;
    this.updatedAt = Date.now();
  }

  suspend() {
    this.status = IdentityStatus.SUSPENDED;
    this.updatedAt = Date.now();
  }

  recordLogin() {
    this.lastLogin = Date.now();
  }

  hasRole(role) {
    return this.roles.includes(role);
  }

  hasGroup(group) {
    return this.groups.includes(group);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.status,
      email: this.email,
      attributes: Object.fromEntries(
        Array.from(this.attributes.entries()).map(([k, v]) => [k, v.toJSON()])
      ),
      roles: this.roles,
      groups: this.groups,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastLogin: this.lastLogin
    };
  }
}

/**
 * Role
 */
class Role {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.permissions = config.permissions || [];
    this.metadata = config.metadata || {};
    this.createdAt = config.createdAt || Date.now();
  }

  addPermission(permission) {
    if (!this.permissions.includes(permission)) {
      this.permissions.push(permission);
    }
  }

  removePermission(permission) {
    const index = this.permissions.indexOf(permission);
    if (index !== -1) {
      this.permissions.splice(index, 1);
    }
  }

  hasPermission(permission) {
    return this.permissions.includes(permission) || this.permissions.includes('*');
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      permissions: this.permissions,
      metadata: this.metadata,
      createdAt: this.createdAt
    };
  }
}

/**
 * Group
 */
class Group {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.description = config.description;
    this.members = [];
    this.roles = [];
    this.metadata = config.metadata || {};
    this.createdAt = config.createdAt || Date.now();
  }

  addMember(identityId) {
    if (!this.members.includes(identityId)) {
      this.members.push(identityId);
    }
  }

  removeMember(identityId) {
    const index = this.members.indexOf(identityId);
    if (index !== -1) {
      this.members.splice(index, 1);
    }
  }

  hasMember(identityId) {
    return this.members.includes(identityId);
  }

  addRole(role) {
    if (!this.roles.includes(role)) {
      this.roles.push(role);
    }
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      memberCount: this.members.length,
      roles: this.roles,
      metadata: this.metadata,
      createdAt: this.createdAt
    };
  }
}

/**
 * Identity Manager
 */
class IdentityManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.identities = new Map();
    this.roles = new Map();
    this.groups = new Map();
    this.stats = {
      identitiesCreated: 0,
      loginsRecorded: 0,
      rolesCreated: 0,
      groupsCreated: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._createDefaultRoles();
  }

  _createDefaultRoles() {
    // Admin role
    const adminRole = new Role({
      id: 'role-admin',
      name: 'Administrator',
      description: 'Full system access'
    });
    adminRole.addPermission('*');
    this.addRole(adminRole);

    // User role
    const userRole = new Role({
      id: 'role-user',
      name: 'User',
      description: 'Standard user access'
    });
    userRole.addPermission('read');
    userRole.addPermission('write');
    this.addRole(userRole);

    // Viewer role
    const viewerRole = new Role({
      id: 'role-viewer',
      name: 'Viewer',
      description: 'Read-only access'
    });
    viewerRole.addPermission('read');
    this.addRole(viewerRole);
  }

  createIdentity(config) {
    const identity = new Identity(config);
    this.identities.set(identity.id, identity);
    this.stats.identitiesCreated++;
    return identity;
  }

  getIdentity(identityId) {
    return this.identities.get(identityId);
  }

  getIdentityByEmail(email) {
    for (const identity of this.identities.values()) {
      if (identity.email === email) {
        return identity;
      }
    }
    return null;
  }

  deleteIdentity(identityId) {
    return this.identities.delete(identityId);
  }

  addRole(role) {
    this.roles.set(role.id, role);
    this.stats.rolesCreated++;
  }

  getRole(roleId) {
    return this.roles.get(roleId);
  }

  listRoles() {
    return Array.from(this.roles.values()).map(r => r.toJSON());
  }

  createGroup(config) {
    const group = new Group(config);
    this.groups.set(group.id, group);
    this.groupsCreated++;
    return group;
  }

  getGroup(groupId) {
    return this.groups.get(groupId);
  }

  deleteGroup(groupId) {
    return this.groups.delete(groupId);
  }

  authenticate(email, password) {
    const identity = this.getIdentityByEmail(email);
    if (!identity) {
      return { success: false, reason: 'Identity not found' };
    }

    if (identity.status !== IdentityStatus.ACTIVE) {
      return { success: false, reason: 'Identity not active' };
    }

    // Simplified password check
    const expectedPassword = identity.metadata.passwordHash;
    if (expectedPassword && password !== expectedPassword) {
      return { success: false, reason: 'Invalid credentials' };
    }

    identity.recordLogin();
    this.stats.loginsRecorded++;

    return { success: true, identity };
  }

  authorize(identityId, permission) {
    const identity = this.identities.get(identityId);
    if (!identity) {
      return { authorized: false, reason: 'Identity not found' };
    }

    if (identity.status !== IdentityStatus.ACTIVE) {
      return { authorized: false, reason: 'Identity not active' };
    }

    // Check identity roles
    for (const roleName of identity.roles) {
      const role = this.roles.get(`role-${roleName}`);
      if (role && role.hasPermission(permission)) {
        return { authorized: true };
      }
    }

    // Check group roles
    for (const groupName of identity.groups) {
      const group = this.groups.get(groupName);
      if (group) {
        for (const roleName of group.roles) {
          const role = this.roles.get(`role-${roleName}`);
          if (role && role.hasPermission(permission)) {
            return { authorized: true };
          }
        }
      }
    }

    return { authorized: false, reason: 'No matching permission' };
  }

  getStats() {
    return {
      ...this.stats,
      totalIdentities: this.identities.size,
      activeIdentities: Array.from(this.identities.values()).filter(i => i.status === IdentityStatus.ACTIVE).length,
      rolesCount: this.roles.size,
      groupsCount: this.groups.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Identity Demo\n');

  const manager = new IdentityManager();

  // Show roles
  console.log('1. Default Roles:');
  const roles = manager.listRoles();
  for (const role of roles) {
    console.log(`   - ${role.name}: ${role.permissions.join(', ')}`);
  }

  // Create identities
  console.log('\n2. Creating Identities:');

  const user1 = manager.createIdentity({
    name: 'John Doe',
    type: IdentityType.USER,
    email: 'john@example.com',
    status: IdentityStatus.ACTIVE,
    attributes: { department: 'Engineering', location: 'NYC' },
    metadata: { passwordHash: 'demo123' }
  });
  console.log(`   Created: ${user1.name} (${user1.id})`);

  const user2 = manager.createIdentity({
    name: 'Jane Smith',
    type: IdentityType.USER,
    email: 'jane@example.com',
    status: IdentityStatus.ACTIVE,
    attributes: { department: 'Sales', location: 'LA' }
  });
  console.log(`   Created: ${user2.name} (${user2.id})`);

  const service = manager.createIdentity({
    name: 'api-gateway',
    type: IdentityType.SERVICE,
    status: IdentityStatus.ACTIVE,
    attributes: { serviceType: 'gateway', version: '1.0' }
  });
  console.log(`   Created: ${service.name} (${service.type})`);

  // Assign roles
  console.log('\n3. Assigning Roles:');
  user1.addRole('admin');
  console.log(`   ${user1.name} -> admin`);
  user2.addRole('user');
  console.log(`   ${user2.name} -> user`);

  // Create group
  console.log('\n4. Creating Group:');
  const group = manager.createGroup({
    id: 'group-engineering',
    name: 'Engineering Team',
    description: 'Engineering department group'
  });
  group.addMember(user1.id);
  group.addRole('developer');
  console.log(`   Created: ${group.name}`);
  console.log(`   Members: ${group.memberCount}`);

  // Add user to group
  user1.addToGroup('group-engineering');
  console.log(`   Added ${user1.name} to group`);

  // Authenticate
  console.log('\n5. Authentication:');
  const authResult = manager.authenticate('john@example.com', 'demo123');
  console.log(`   Auth: ${authResult.success ? 'Success' : authResult.reason}`);

  // Authorization
  console.log('\n6. Authorization:');
  const authz1 = manager.authorize(user1.id, 'read');
  console.log(`   ${user1.name} -> read: ${authz1.authorized ? 'Allowed' : 'Denied'}`);

  const authz2 = manager.authorize(user1.id, 'delete');
  console.log(`   ${user1.name} -> delete: ${authz2.authorized ? 'Allowed' : 'Denied'}`);

  const authz3 = manager.authorize(user2.id, 'delete');
  console.log(`   ${user2.name} -> delete: ${authz3.authorized ? 'Allowed' : 'Denied'}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Total Identities: ${stats.totalIdentities}`);
  console.log(`   Active Identities: ${stats.activeIdentities}`);
  console.log(`   Roles: ${stats.rolesCount}`);
  console.log(`   Groups: ${stats.groupsCount}`);
  console.log(`   Logins: ${stats.loginsRecorded}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new IdentityManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Identity Module');
  console.log('Usage: node agent-identity.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
