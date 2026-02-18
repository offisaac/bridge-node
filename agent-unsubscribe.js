/**
 * Agent Unsubscribe - Unsubscribe Management Module
 *
 * Handles email unsubscribe requests, preferences, and compliance.
 *
 * Usage: node agent-unsubscribe.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   list    - List unsubscribe requests
 *   status  - Check unsubscribe status
 */

class UnsubscribeRequest {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.email = config.email;
    this.reason = config.reason || '';
    this.category = config.category || 'all'; // all, marketing, updates, notifications
    this.status = config.status || 'pending'; // pending, completed, failed
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
    this.completedAt = config.completedAt ? new Date(config.completedAt) : null;
    this.method = config.method || 'link'; // link, email, api
    this.ipAddress = config.ipAddress || null;
    this.userAgent = config.userAgent || null;
  }

  complete() {
    this.status = 'completed';
    this.completedAt = new Date();
  }
}

class UnsubscribePreference {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.email = config.email;
    this.preferences = config.preferences || {
      marketing: false,
      updates: false,
      notifications: false,
      thirdParty: false
    };
    this.updatedAt = config.updatedAt ? new Date(config.updatedAt) : new Date();
  }

  updateCategory(category, value) {
    if (this.preferences.hasOwnProperty(category)) {
      this.preferences[category] = value;
      this.updatedAt = new Date();
    }
    return this.preferences;
  }
}

class UnsubscribeManager {
  constructor() {
    this.requests = new Map();
    this.preferences = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    const requests = [
      { email: 'user1@example.com', reason: 'Too many emails', category: 'marketing' },
      { email: 'user2@example.com', reason: 'Not relevant', category: 'updates' }
    ];
    requests.forEach((r, i) => {
      const req = new UnsubscribeRequest({ ...r, id: `req-${i + 1}` });
      req.complete();
      this.requests.set(req.id, req);
    });

    const prefs = [
      { email: 'user1@example.com', preferences: { marketing: false, updates: true, notifications: true, thirdParty: false } },
      { email: 'user3@example.com', preferences: { marketing: false, updates: false, notifications: true, thirdParty: true } }
    ];
    prefs.forEach((p, i) => {
      const pref = new UnsubscribePreference({ ...p, id: `pref-${i + 1}` });
      this.preferences.set(pref.email, pref);
    });
  }

  createRequest(config) {
    const req = new UnsubscribeRequest(config);
    this.requests.set(req.id, req);
    return req;
  }

  processRequest(requestId, processConfig = {}) {
    const req = this.requests.get(requestId);
    if (!req) throw new Error('Request not found');

    // Update preferences
    let pref = this.preferences.get(req.email);
    if (!pref) {
      pref = new UnsubscribePreference({ email: req.email });
      this.preferences.set(req.email, pref);
    }

    if (req.category === 'all') {
      pref.preferences = { marketing: false, updates: false, notifications: false, thirdParty: false };
    } else {
      pref.updateCategory(req.category, false);
    }

    req.complete();
    return { request: req, preferences: pref };
  }

  getPreference(email) {
    return this.preferences.get(email) || null;
  }

  getRequests(email = null) {
    if (email) {
      return Array.from(this.requests.values()).filter(r => r.email === email);
    }
    return Array.from(this.requests.values());
  }

  getPendingRequests() {
    return Array.from(this.requests.values()).filter(r => r.status === 'pending');
  }

  updatePreference(email, category, value) {
    let pref = this.preferences.get(email);
    if (!pref) {
      pref = new UnsubscribePreference({ email });
      this.preferences.set(email, pref);
    }
    return pref.updateCategory(category, value);
  }

  resubscribe(email, categories) {
    let pref = this.preferences.get(email);
    if (!pref) {
      pref = new UnsubscribePreference({ email });
      this.preferences.set(email, pref);
    }

    categories.forEach(cat => {
      pref.updateCategory(cat, true);
    });
    return pref;
  }
}

function runDemo() {
  console.log('=== Agent Unsubscribe Demo\n');

  const mgr = new UnsubscribeManager();

  console.log('1. Create Unsubscribe Request:');
  const req = mgr.createRequest({ email: 'new@example.com', reason: 'No longer interested', category: 'marketing' });
  console.log(`   Created: ${req.id} for ${req.email}`);

  console.log('\n2. Process Request:');
  const result = mgr.processRequest(req.id);
  console.log(`   Status: ${result.request.status}`);
  console.log(`   Marketing: ${result.preferences.preferences.marketing}`);

  console.log('\n3. Get Preference:');
  const pref = mgr.getPreference('user1@example.com');
  if (pref) {
    console.log(`   Preferences:`, pref.preferences);
  }

  console.log('\n4. Update Preference:');
  mgr.updatePreference('user3@example.com', 'notifications', false);
  const updated = mgr.getPreference('user3@example.com');
  console.log(`   Updated:`, updated.preferences);

  console.log('\n5. Pending Requests:');
  console.log(`   Count: ${mgr.getPendingRequests().length}`);

  console.log('\n6. Resubscribe:');
  mgr.resubscribe('user3@example.com', ['marketing', 'updates']);
  const resubscribed = mgr.getPreference('user3@example.com');
  console.log(`   After resubscribe:`, resubscribed.preferences);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new UnsubscribeManager();

if (command === 'demo') runDemo();
else if (command === 'list') {
  mgr.getRequests().forEach(r => console.log(`${r.email}: ${r.category} (${r.status})`));
}
else if (command === 'status') {
  const email = args[1];
  if (email) {
    const pref = mgr.getPreference(email);
    if (pref) console.log(JSON.stringify(pref.preferences, null, 2));
    else console.log('No preferences found');
  } else {
    console.log('Usage: node agent-unsubscribe.js status <email>');
  }
}
else console.log('Usage: node agent-unsubscribe.js [demo|list|status]');
