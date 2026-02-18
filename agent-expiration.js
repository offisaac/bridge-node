/**
 * Agent Expiration - Expiration Monitoring Module
 *
 * Monitors and tracks expiration dates for various resources (domains, certificates, subscriptions, etc.)
 *
 * Usage: node agent-expiration.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   add     - Add an item to monitor
 *   list    - List monitored items
 *   check   - Check expiring items
 */

class ExpirationItem {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type; // domain, certificate, subscription, license, warranty, contract
    this.resourceId = config.resourceId || null;
    this.expiryDate = config.expiryDate ? new Date(config.expiryDate) : null;
    this.renewalDate = config.renewalDate ? new Date(config.renewalDate) : null;
    this.autoRenew = config.autoRenew || false;
    this.cost = config.cost || null;
    this.notes = config.notes || '';
    this.reminderDays = config.reminderDays || [30, 14, 7, 1]; // Days before expiry to remind
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
    this.updatedAt = config.updatedAt ? new Date(config.updatedAt) : new Date();
    this.status = config.status || 'active'; // active, expired, renewed, cancelled
  }

  daysUntilExpiry() {
    if (!this.expiryDate) return null;
    const now = new Date();
    const diff = this.expiryDate - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  isExpired() {
    if (!this.expiryDate) return false;
    return new Date() > this.expiryDate;
  }

  needsReminder() {
    if (this.isExpired() || this.status !== 'active') return false;
    const daysLeft = this.daysUntilExpiry();
    return this.reminderDays.includes(daysLeft);
  }

  update(config) {
    if (config.name) this.name = config.name;
    if (config.expiryDate) this.expiryDate = new Date(config.expiryDate);
    if (config.renewalDate) this.renewalDate = new Date(config.renewalDate);
    if (config.autoRenew !== undefined) this.autoRenew = config.autoRenew;
    if (config.cost) this.cost = config.cost;
    if (config.notes) this.notes = config.notes;
    if (config.reminderDays) this.reminderDays = config.reminderDays;
    if (config.status) this.status = config.status;
    this.updatedAt = new Date();
    return this;
  }
}

class ExpirationManager {
  constructor() {
    this.items = new Map();
    this.notifications = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    const sampleItems = [
      {
        name: 'example.com',
        type: 'domain',
        resourceId: 'example.com',
        expiryDate: '2026-03-15',
        autoRenew: true,
        cost: 12.99,
        notes: 'Primary domain'
      },
      {
        name: 'api.example.com',
        type: 'certificate',
        resourceId: 'cert-001',
        expiryDate: '2026-02-28',
        autoRenew: true,
        cost: 0,
        notes: 'SSL certificate via Lets Encrypt'
      },
      {
        name: 'AWS Subscription',
        type: 'subscription',
        resourceId: 'aws-prod',
        expiryDate: '2026-12-31',
        autoRenew: true,
        cost: 5000,
        notes: 'Annual AWS subscription'
      },
      {
        name: 'Office 365 License',
        type: 'license',
        resourceId: 'o365-enterprise',
        expiryDate: '2026-06-30',
        autoRenew: true,
        cost: 1200,
        notes: '50 user licenses'
      },
      {
        name: 'Server Warranty',
        type: 'warranty',
        resourceId: 'srv-warranty-001',
        expiryDate: '2027-01-15',
        autoRenew: false,
        cost: 2500,
        notes: 'Dell PowerEdge warranty'
      },
      {
        name: 'Vendor Contract',
        type: 'contract',
        resourceId: 'contract-abc',
        expiryDate: '2026-04-01',
        autoRenew: false,
        cost: 15000,
        notes: 'Annual support contract'
      }
    ];

    sampleItems.forEach(item => {
      const expItem = new ExpirationItem(item);
      this.items.set(expItem.id, expItem);
    });
  }

  add(name, type, expiryDate, options = {}) {
    const item = new ExpirationItem({
      name,
      type,
      expiryDate,
      resourceId: options.resourceId || null,
      autoRenew: options.autoRenew || false,
      cost: options.cost || null,
      notes: options.notes || '',
      reminderDays: options.reminderDays || [30, 14, 7, 1]
    });

    this.items.set(item.id, item);
    return item;
  }

  findById(id) {
    return this.items.get(id) || null;
  }

  list(type = null, includeExpired = false) {
    let allItems = Array.from(this.items.values());

    if (type) {
      allItems = allItems.filter(i => i.type === type);
    }

    if (!includeExpired) {
      allItems = allItems.filter(i => i.status === 'active');
    }

    return allItems.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
  }

  // Get items expiring within days
  getExpiring(days = 30) {
    const now = new Date();
    const threshold = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return Array.from(this.items.values())
      .filter(i => {
        if (!i.expiryDate || i.status !== 'active') return false;
        return i.expiryDate <= threshold;
      })
      .sort((a, b) => a.expiryDate - b.expiryDate)
      .map(i => ({
        ...i,
        daysUntilExpiry: i.daysUntilExpiry()
      }));
  }

  // Get items that need reminders today
  getReminders() {
    return Array.from(this.items.values())
      .filter(i => i.needsReminder())
      .map(i => ({
        ...i,
        daysUntilExpiry: i.daysUntilExpiry()
      }));
  }

  // Get expired items
  getExpired() {
    return Array.from(this.items.values())
      .filter(i => i.isExpired() && i.status === 'active')
      .map(i => ({
        ...i,
        daysExpired: Math.ceil((new Date() - i.expiryDate) / (1000 * 60 * 60 * 24))
      }));
  }

  // Get statistics
  getStats() {
    const items = Array.from(this.items.values());
    const active = items.filter(i => i.status === 'active');
    const expired = this.getExpired();
    const expiring7 = this.getExpiring(7);
    const expiring30 = this.getExpiring(30);

    const totalCost = active.reduce((sum, i) => sum + (i.cost || 0), 0);

    return {
      total: items.length,
      active: active.length,
      expired: expired.length,
      expiringIn7Days: expiring7.length,
      expiringIn30Days: expiring30.length,
      totalActiveCost: totalCost,
      byType: this._groupByType(active)
    };
  }

  _groupByType(items) {
    const grouped = {};
    items.forEach(i => {
      if (!grouped[i.type]) grouped[i.type] = 0;
      grouped[i.type]++;
    });
    return grouped;
  }

  update(id, updates) {
    const item = this.items.get(id);
    if (!item) {
      throw new Error('Expiration item not found');
    }
    return item.update(updates);
  }

  renew(id, newExpiryDate) {
    const item = this.items.get(id);
    if (!item) {
      throw new Error('Expiration item not found');
    }

    item.expiryDate = new Date(newExpiryDate);
    item.status = 'active';
    item.updatedAt = new Date();

    return item;
  }

  markExpired(id) {
    const item = this.items.get(id);
    if (!item) {
      throw new Error('Expiration item not found');
    }
    item.status = 'expired';
    item.updatedAt = new Date();
    return item;
  }

  delete(id) {
    const item = this.items.get(id);
    if (!item) {
      throw new Error('Expiration item not found');
    }
    this.items.delete(id);
    return item;
  }

  // Generate report
  generateReport(days = 30) {
    const expiring = this.getExpiring(days);
    const expired = this.getExpired();
    const reminders = this.getReminders();

    let report = `=== Expiration Report (Next ${days} days) ===\n\n`;
    report += `Generated: ${new Date().toISOString()}\n\n`;

    report += `Summary:\n`;
    report += `- Total Items: ${this.items.size}\n`;
    report += `- Expired: ${expired.length}\n`;
    report += `- Expiring in ${days} days: ${expiring.length}\n`;
    report += `- Reminders Due Today: ${reminders.length}\n\n`;

    if (expired.length > 0) {
      report += `EXPIRED ITEMS:\n`;
      expired.forEach(i => {
        report += `  - ${i.name} (${i.type}) - Expired ${i.daysExpired} days ago\n`;
      });
      report += '\n';
    }

    if (expiring.length > 0) {
      report += `EXPIRING SOON:\n`;
      expiring.forEach(i => {
        report += `  - ${i.name} (${i.type}) - ${i.daysUntilExpiry} days (${i.expiryDate.toISOString().split('T')[0]})\n`;
      });
      report += '\n';
    }

    return report;
  }
}

function runDemo() {
  console.log('=== Agent Expiration Demo\n');

  const mgr = new ExpirationManager();

  console.log('1. List All Items:');
  const allItems = mgr.list();
  console.log(`   Total: ${allItems.length}`);
  allItems.forEach(i => console.log(`   - ${i.name} [${i.type}] expires ${i.expiryDate}`));

  console.log('\n2. List by Type (domain):');
  const domains = mgr.list('domain');
  console.log(`   Domains: ${domains.length}`);

  console.log('\n3. Get Expiring in 30 Days:');
  const expiring = mgr.getExpiring(30);
  console.log(`   Expiring: ${expiring.length}`);
  expiring.forEach(i => console.log(`   - ${i.name}: ${i.daysUntilExpiry} days`));

  console.log('\n4. Get Expired Items:');
  const expired = mgr.getExpired();
  console.log(`   Expired: ${expired.length}`);

  console.log('\n5. Get Reminders:');
  const reminders = mgr.getReminders();
  console.log(`   Reminders due: ${reminders.length}`);

  console.log('\n6. Add New Item:');
  const newItem = mgr.add('new-service.com', 'domain', '2026-12-01', {
    autoRenew: true,
    cost: 29.99,
    notes: 'New domain registration'
  });
  console.log(`   Added: ${newItem.name} (${newItem.type})`);

  console.log('\n7. Update Item:');
  const updated = mgr.update(newItem.id, { cost: 24.99, notes: 'Updated cost' });
  console.log(`   Updated: ${updated.cost}, ${updated.notes}`);

  console.log('\n8. Renew Item:');
  const renewed = mgr.renew(updated.id, '2027-12-01');
  console.log(`   Renewed: ${renewed.name} until ${renewed.expiryDate}`);

  console.log('\n9. Get Statistics:');
  const stats = mgr.getStats();
  console.log(`   Total: ${stats.total}`);
  console.log(`   Active: ${stats.active}`);
  console.log(`   Expiring in 7 days: ${stats.expiringIn7Days}`);
  console.log(`   Expiring in 30 days: ${stats.expiringIn30Days}`);
  console.log(`   Total active cost: $${stats.totalActiveCost}`);
  console.log(`   By type:`, stats.byType);

  console.log('\n10. Generate Report:');
  const report = mgr.generateReport(60);
  console.log(report);

  console.log('=== Demo Complete ===');
}

const args = process.argv.slice(2);
const command = args[0] || 'demo';
const mgr = new ExpirationManager();

if (command === 'demo') runDemo();
else if (command === 'add') {
  const [name, type, expiryDate, cost] = args.slice(1);
  if (!name || !type || !expiryDate) {
    console.log('Usage: node agent-expiration.js add <name> <type> <expiryDate> [cost]');
    process.exit(1);
  }
  const item = mgr.add(name, type, expiryDate, { cost: cost ? parseFloat(cost) : undefined });
  console.log(JSON.stringify(item, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else if (command === 'list') {
  const [type, includeExpired] = args.slice(1);
  const items = mgr.list(type || null, includeExpired === 'true');
  console.log(JSON.stringify(items, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else if (command === 'check') {
  const [days] = args.slice(1);
  const expiring = mgr.getExpiring(days ? parseInt(days) : 30);
  console.log(JSON.stringify(expiring, (key, value) => value instanceof Date ? value.toISOString() : value, 2));
}
else console.log('Usage: node agent-expiration.js [demo|add|list|check]');
