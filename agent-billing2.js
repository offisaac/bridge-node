/**
 * Agent Billing2 - Billing Management Agent
 *
 * Advanced billing with invoicing, payment collection, and financial reporting.
 *
 * Usage: node agent-billing2.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   invoice     - Generate invoice
 *   collect     - Process collection
 */

class BillingPlan {
  constructor(config) {
    this.id = `plan-${Date.now()}`;
    this.name = config.name;
    this.description = config.description || '';
    this.amount = config.amount;
    this.interval = config.interval; // monthly, yearly, weekly
    this.features = config.features || [];
    this.currency = config.currency || 'USD';
  }
}

class Invoice {
  constructor(config) {
    this.id = `inv-${Date.now()}`;
    this.invoiceNumber = config.invoiceNumber;
    this.customerId = config.customerId;
    this.customerName = config.customerName;
    this.items = config.items || [];
    this.subtotal = config.subtotal || 0;
    this.tax = config.tax || 0;
    this.total = config.total || 0;
    this.currency = config.currency || 'USD';
    this.status = 'draft'; // draft, sent, paid, overdue, cancelled
    this.dueDate = config.dueDate;
    this.createdAt = Date.now();
    this.paidAt = null;
  }
}

class BillingCycle {
  constructor(config) {
    this.id = `cycle-${Date.now()}`;
    this.customerId = config.customerId;
    this.planId = config.planId;
    this.startDate = config.startDate;
    this.endDate = config.endDate;
    this.amount = config.amount;
    this.status = 'active'; // active, paused, cancelled
    this.invoices = [];
  }
}

class BillingAgent {
  constructor(config = {}) {
    this.plans = new Map();
    this.invoices = new Map();
    this.cycles = new Map();
    this.stats = {
      invoicesGenerated: 0,
      invoicesPaid: 0,
      revenue: 0,
      overdueAmount: 0
    };
  }

  createPlan(name, amount, interval, features = []) {
    const plan = new BillingPlan({
      name,
      amount,
      interval,
      features
    });
    this.plans.set(plan.id, plan);
    console.log(`   Created plan: ${name} - $${amount}/${interval}`);
    return plan;
  }

  generateInvoice(customerId, customerName, items, options = {}) {
    const subtotal = items.reduce((sum, item) => sum + (item.amount * item.quantity), 0);
    const taxRate = options.taxRate || 0.1;
    const tax = subtotal * taxRate;
    const total = subtotal + tax;

    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

    const invoice = new Invoice({
      invoiceNumber,
      customerId,
      customerName,
      items,
      subtotal,
      tax,
      total,
      currency: options.currency || 'USD',
      dueDate: options.dueDate || Date.now() + 30 * 24 * 60 * 60 * 1000
    });

    this.invoices.set(invoice.id, invoice);
    this.stats.invoicesGenerated++;

    console.log(`   Generated invoice: ${invoiceNumber} - $${total.toFixed(2)}`);
    return invoice;
  }

  async sendInvoice(invoiceId) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      return { success: false, reason: 'Invoice not found' };
    }

    invoice.status = 'sent';
    console.log(`   Sent invoice: ${invoice.invoiceNumber}`);
    return { success: true, invoiceId };
  }

  async markPaid(invoiceId, paymentMethod = 'bank_transfer') {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) {
      return { success: false, reason: 'Invoice not found' };
    }

    invoice.status = 'paid';
    invoice.paidAt = Date.now();
    this.stats.invoicesPaid++;
    this.stats.revenue += invoice.total;

    console.log(`   Invoice paid: ${invoice.invoiceNumber} via ${paymentMethod}`);
    return { success: true, invoiceId, amount: invoice.total };
  }

  async processOverdue() {
    const now = Date.now();
    let overdueAmount = 0;

    for (const invoice of this.invoices.values()) {
      if (invoice.status === 'sent' && invoice.dueDate < now) {
        invoice.status = 'overdue';
        overdueAmount += invoice.total;
      }
    }

    this.stats.overdueAmount = overdueAmount;
    console.log(`   Processed overdue invoices: $${overdueAmount.toFixed(2)}`);
    return { success: true, overdueAmount };
  }

  startBillingCycle(customerId, planId) {
    const plan = this.plans.get(planId);
    if (!plan) {
      return { success: false, reason: 'Plan not found' };
    }

    const cycle = new BillingCycle({
      customerId,
      planId,
      startDate: Date.now(),
      amount: plan.amount,
      endDate: Date.now() + (plan.interval === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000
    });

    this.cycles.set(cycle.id, cycle);
    console.log(`   Started billing cycle for customer ${customerId}`);
    return { success: true, cycleId: cycle.id };
  }

  getInvoice(invoiceId) {
    return this.invoices.get(invoiceId);
  }

  getCustomerInvoices(customerId) {
    return Array.from(this.invoices.values())
      .filter(inv => inv.customerId === customerId);
  }

  getStats() {
    return {
      ...this.stats,
      plans: this.plans.size,
      invoices: this.invoices.size,
      cycles: this.cycles.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new BillingAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Billing2 Demo\n');

    // 1. Create Plans
    console.log('1. Create Billing Plans:');
    const basicPlan = agent.createPlan('Basic', 29.99, 'monthly', ['5GB Storage', 'Email Support']);
    const proPlan = agent.createPlan('Pro', 79.99, 'monthly', ['50GB Storage', 'Priority Support', 'API Access']);
    const enterprisePlan = agent.createPlan('Enterprise', 299.99, 'yearly', ['Unlimited Storage', '24/7 Support', 'API Access', 'Custom Integrations']);

    // 2. Generate Invoices
    console.log('\n2. Generate Invoices:');
    const invoice1 = agent.generateInvoice('cust-001', 'Acme Corp', [
      { description: 'Pro Plan - Monthly', amount: 79.99, quantity: 1 },
      { description: 'Additional User', amount: 15.00, quantity: 5 }
    ], { taxRate: 0.1 });

    const invoice2 = agent.generateInvoice('cust-002', 'TechStart Inc', [
      { description: 'Basic Plan - Monthly', amount: 29.99, quantity: 1 }
    ], { taxRate: 0.08 });

    const invoice3 = agent.generateInvoice('cust-003', 'GlobalTech', [
      { description: 'Enterprise Plan - Yearly', amount: 299.99, quantity: 1 },
      { description: 'Setup Fee', amount: 500.00, quantity: 1 }
    ], { taxRate: 0.1 });

    // 3. Send Invoices
    console.log('\n3. Send Invoices:');
    await agent.sendInvoice(invoice1.id);
    await agent.sendInvoice(invoice2.id);
    await agent.sendInvoice(invoice3.id);

    // 4. Mark as Paid
    console.log('\n4. Process Payments:');
    await agent.markPaid(invoice1.id, 'credit_card');
    await agent.markPaid(invoice2.id, 'bank_transfer');

    // 5. Billing Cycles
    console.log('\n5. Billing Cycles:');
    agent.startBillingCycle('cust-001', proPlan.id);
    agent.startBillingCycle('cust-002', basicPlan.id);

    // 6. Process Overdue
    console.log('\n6. Overdue Processing:');
    await agent.processOverdue();

    // 7. Statistics
    console.log('\n7. Statistics:');
    const stats = agent.getStats();
    console.log(`   Invoices Generated: ${stats.invoicesGenerated}`);
    console.log(`   Invoices Paid: ${stats.invoicesPaid}`);
    console.log(`   Total Revenue: $${stats.revenue.toFixed(2)}`);
    console.log(`   Overdue Amount: $${stats.overdueAmount.toFixed(2)}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'invoice':
    console.log('Generating test invoice...');
    const plan = agent.createPlan('Test Plan', 50.00, 'monthly');
    const inv = agent.generateInvoice('test-customer', 'Test Customer', [
      { description: 'Test Service', amount: 50.00, quantity: 1 }
    ]);
    console.log(`Invoice created: ${inv.invoiceNumber}`);
    break;

  case 'collect':
    console.log('Processing collection...');
    await agent.processOverdue();
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-billing2.js [demo|invoice|collect]');
}
