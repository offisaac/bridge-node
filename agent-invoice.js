/**
 * Agent Invoice Module
 *
 * Provides invoice generation, management, and tracking.
 * Usage: node agent-invoice.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show invoice stats
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
 * Invoice Status
 */
const InvoiceStatus = {
  DRAFT: 'draft',
  PENDING: 'pending',
  SENT: 'sent',
  PAID: 'paid',
  OVERDUE: 'overdue',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded'
};

/**
 * Line Item
 */
class LineItem {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.description = config.description;
    this.quantity = config.quantity || 1;
    this.unitPrice = config.unitPrice || 0;
    this.taxRate = config.taxRate || 0;
    this.discount = config.discount || 0;
  }

  getSubtotal() {
    return this.quantity * this.unitPrice;
  }

  getDiscountAmount() {
    return this.getSubtotal() * (this.discount / 100);
  }

  getTaxAmount() {
    const afterDiscount = this.getSubtotal() - this.getDiscountAmount();
    return afterDiscount * (this.taxRate / 100);
  }

  getTotal() {
    return this.getSubtotal() - this.getDiscountAmount() + this.getTaxAmount();
  }

  toJSON() {
    return {
      id: this.id,
      description: this.description,
      quantity: this.quantity,
      unitPrice: this.unitPrice,
      taxRate: this.taxRate,
      discount: this.discount,
      subtotal: this.getSubtotal(),
      discountAmount: this.getDiscountAmount(),
      taxAmount: this.getTaxAmount(),
      total: this.getTotal()
    };
  }
}

/**
 * Invoice
 */
class Invoice {
  constructor(config) {
    this.id = config.id || `INV-${Date.now()}`;
    this.invoiceNumber = config.invoiceNumber || this._generateInvoiceNumber();
    this.status = config.status || InvoiceStatus.DRAFT;
    this.customerId = config.customerId;
    this.customerName = config.customerName;
    this.customerEmail = config.customerEmail;
    this.customerAddress = config.customerAddress || {};
    this.issueDate = config.issueDate || Date.now();
    this.dueDate = config.dueDate || (Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    this.items = [];
    this.notes = config.notes || '';
    this.terms = config.terms || 'Payment due within 30 days';
    this.currency = config.currency || 'USD';
    this.paymentMethod = config.paymentMethod || null;
    this.paidDate = null;
    this.createdAt = config.createdAt || Date.now();
    this.updatedAt = config.updatedAt || Date.now();

    // Add initial items if provided
    if (config.items) {
      for (const item of config.items) {
        this.addItem(item);
      }
    }
  }

  _generateInvoiceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `INV-${year}${month}-${random}`;
  }

  addItem(itemConfig) {
    const item = new LineItem(itemConfig);
    this.items.push(item);
    this.updatedAt = Date.now();
    return item;
  }

  removeItem(itemId) {
    const index = this.items.findIndex(i => i.id === itemId);
    if (index !== -1) {
      this.items.splice(index, 1);
      this.updatedAt = Date.now();
      return true;
    }
    return false;
  }

  getSubtotal() {
    return this.items.reduce((sum, item) => sum + item.getSubtotal(), 0);
  }

  getTotalDiscount() {
    return this.items.reduce((sum, item) => sum + item.getDiscountAmount(), 0);
  }

  getTotalTax() {
    return this.items.reduce((sum, item) => sum + item.getTaxAmount(), 0);
  }

  getTotal() {
    return this.getSubtotal() - this.getTotalDiscount() + this.getTotalTax();
  }

  setStatus(status) {
    this.status = status;
    this.updatedAt = Date.now();

    if (status === InvoiceStatus.PAID) {
      this.paidDate = Date.now();
    }
  }

  markAsSent() {
    this.setStatus(InvoiceStatus.SENT);
  }

  markAsPaid(paymentMethod = 'unknown') {
    this.paymentMethod = paymentMethod;
    this.setStatus(InvoiceStatus.PAID);
  }

  cancel() {
    this.setStatus(InvoiceStatus.CANCELLED);
  }

  isOverdue() {
    return (
      this.status === InvoiceStatus.SENT ||
      this.status === InvoiceStatus.PENDING
    ) && Date.now() > this.dueDate;
  }

  getDaysUntilDue() {
    const diff = this.dueDate - Date.now();
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  }

  toJSON() {
    return {
      id: this.id,
      invoiceNumber: this.invoiceNumber,
      status: this.status,
      customerId: this.customerId,
      customerName: this.customerName,
      customerEmail: this.customerEmail,
      customerAddress: this.customerAddress,
      issueDate: this.issueDate,
      dueDate: this.dueDate,
      daysUntilDue: this.getDaysUntilDue(),
      isOverdue: this.isOverdue(),
      items: this.items.map(i => i.toJSON()),
      subtotal: this.getSubtotal(),
      totalDiscount: this.getTotalDiscount(),
      totalTax: this.getTotalTax(),
      total: this.getTotal(),
      currency: this.currency,
      notes: this.notes,
      terms: this.terms,
      paymentMethod: this.paymentMethod,
      paidDate: this.paidDate,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  toPDF() {
    // Simulated PDF generation
    return {
      type: 'pdf',
      invoiceNumber: this.invoiceNumber,
      generated: Date.now()
    };
  }
}

/**
 * Invoice Template
 */
class InvoiceTemplate {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.header = config.header || {};
    this.footer = config.footer || {};
    this.logo = config.logo || null;
    this.style = config.style || {};
  }

  render(invoice) {
    return {
      template: this.name,
      invoice: invoice.invoiceNumber,
      content: this._generateContent(invoice)
    };
  }

  _generateContent(invoice) {
    let content = `INVOICE\n`;
    content += `========\n`;
    content += `Invoice #: ${invoice.invoiceNumber}\n`;
    content += `Date: ${new Date(invoice.issueDate).toLocaleDateString()}\n`;
    content += `Due: ${new Date(invoice.dueDate).toLocaleDateString()}\n\n`;
    content += `Bill To:\n`;
    content += `${invoice.customerName}\n`;
    content += `${invoice.customerEmail}\n\n`;
    content += `Items:\n`;
    content += `------\n`;
    for (const item of invoice.items) {
      content += `${item.description} x${item.quantity} @ $${item.unitPrice} = $${item.getSubtotal()}\n`;
    }
    content += `\nSubtotal: $${invoice.getSubtotal()}\n`;
    content += `Tax: $${invoice.getTotalTax()}\n`;
    content += `TOTAL: $${invoice.getTotal()}\n`;
    return content;
  }
}

/**
 * Invoice Manager
 */
class InvoiceManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.invoices = new Map();
    this.templates = new Map();
    this.stats = {
      totalInvoices: 0,
      totalRevenue: 0,
      paidInvoices: 0,
      overdueInvoices: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._createDefaultTemplates();
  }

  _createDefaultTemplates() {
    this.addTemplate(new InvoiceTemplate({
      id: 'standard',
      name: 'Standard',
      header: { company: 'Company Name' },
      footer: { thankYou: 'Thank you for your business!' }
    }));

    this.addTemplate(new InvoiceTemplate({
      id: 'detailed',
      name: 'Detailed',
      header: { company: 'Company Name', tagline: 'Your trusted partner' },
      footer: { thankYou: 'Questions? Contact us at billing@company.com' }
    }));
  }

  createInvoice(config) {
    const invoice = new Invoice(config);
    this.invoices.set(invoice.id, invoice);
    this.stats.totalInvoices++;
    return invoice;
  }

  getInvoice(invoiceId) {
    return this.invoices.get(invoiceId);
  }

  getInvoiceByNumber(invoiceNumber) {
    for (const invoice of this.invoices.values()) {
      if (invoice.invoiceNumber === invoiceNumber) {
        return invoice;
      }
    }
    return null;
  }

  listInvoices(options = {}) {
    let results = Array.from(this.invoices.values());

    if (options.status) {
      results = results.filter(i => i.status === options.status);
    }

    if (options.customerId) {
      results = results.filter(i => i.customerId === options.customerId);
    }

    if (options.overdue) {
      results = results.filter(i => i.isOverdue());
    }

    // Sort by date
    results.sort((a, b) => b.issueDate - a.issueDate);

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  updateInvoice(invoiceId, updates) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return null;

    Object.assign(invoice, updates);
    invoice.updatedAt = Date.now();
    return invoice;
  }

  deleteInvoice(invoiceId) {
    return this.invoices.delete(invoiceId);
  }

  addTemplate(template) {
    this.templates.set(template.id, template);
  }

  getTemplate(templateId) {
    return this.templates.get(templateId);
  }

  renderInvoice(invoiceId, templateId = 'standard') {
    const invoice = this.invoices.get(invoiceId);
    const template = this.templates.get(templateId);

    if (!invoice || !template) return null;
    return template.render(invoice);
  }

  sendInvoice(invoiceId) {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return null;

    invoice.markAsSent();
    return invoice;
  }

  recordPayment(invoiceId, paymentMethod = 'card') {
    const invoice = this.invoices.get(invoiceId);
    if (!invoice) return null;

    invoice.markAsPaid(paymentMethod);
    this.stats.paidInvoices++;
    this.stats.totalRevenue += invoice.getTotal();
    return invoice;
  }

  checkOverdue() {
    let overdueCount = 0;
    for (const invoice of this.invoices.values()) {
      if (invoice.isOverdue() && invoice.status !== InvoiceStatus.OVERDUE) {
        invoice.setStatus(InvoiceStatus.OVERDUE);
        overdueCount++;
      }
    }
    this.stats.overdueInvoices = overdueCount;
    return overdueCount;
  }

  getStats() {
    const now = Date.now();
    let pendingAmount = 0;
    let paidAmount = 0;

    for (const invoice of this.invoices.values()) {
      if (invoice.status === InvoiceStatus.PAID) {
        paidAmount += invoice.getTotal();
      } else if (invoice.status !== InvoiceStatus.CANCELLED) {
        pendingAmount += invoice.getTotal();
      }
    }

    return {
      ...this.stats,
      totalInvoices: this.invoices.size,
      pendingAmount,
      paidAmount,
      templatesCount: this.templates.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Invoice Demo\n');

  const manager = new InvoiceManager();

  // Create invoice
  console.log('1. Creating Invoice:');
  const invoice = manager.createInvoice({
    customerId: 'cust-001',
    customerName: 'Acme Corp',
    customerEmail: 'billing@acme.com',
    customerAddress: {
      street: '123 Main St',
      city: 'New York',
      state: 'NY',
      zip: '10001',
      country: 'USA'
    },
    notes: 'Thank you for your business!',
    currency: 'USD'
  });
  console.log(`   Created: ${invoice.invoiceNumber}`);

  // Add line items
  console.log('\n2. Adding Line Items:');
  invoice.addItem({
    description: 'Consulting Services',
    quantity: 10,
    unitPrice: 150,
    taxRate: 10
  });
  invoice.addItem({
    description: 'Software License',
    quantity: 2,
    unitPrice: 500,
    taxRate: 10
  });
  invoice.addItem({
    description: 'Support Package',
    quantity: 1,
    unitPrice: 300,
    taxRate: 10,
    discount: 10
  });

  console.log(`   Added 3 items`);
  console.log(`   Subtotal: $${invoice.getSubtotal()}`);
  console.log(`   Tax: $${invoice.getTotalTax()}`);
  console.log(`   Total: $${invoice.getTotal()}`);

  // Send invoice
  console.log('\n3. Sending Invoice:');
  manager.sendInvoice(invoice.id);
  console.log(`   Status: ${invoice.status}`);

  // List invoices
  console.log('\n4. Listing Invoices:');
  const invoices = manager.listInvoices();
  console.log(`   Total invoices: ${invoices.length}`);
  for (const inv of invoices) {
    console.log(`   - ${inv.invoiceNumber}: ${inv.status} ($${inv.getTotal()})`);
  }

  // Record payment
  console.log('\n5. Recording Payment:');
  manager.recordPayment(invoice.id, 'bank_transfer');
  console.log(`   Status: ${invoice.status}`);
  console.log(`   Paid: ${invoice.paidDate ? new Date(invoice.paidDate).toLocaleString() : 'N/A'}`);

  // Create another invoice
  console.log('\n6. Creating Second Invoice:');
  const invoice2 = manager.createInvoice({
    customerId: 'cust-002',
    customerName: 'TechStart Inc',
    customerEmail: 'accounts@techstart.io',
    dueDate: Date.now() - 5 * 24 * 60 * 60 * 1000 // 5 days ago - overdue
  });
  invoice2.addItem({
    description: 'Web Development',
    quantity: 1,
    unitPrice: 2000,
    taxRate: 8
  });
  manager.sendInvoice(invoice2.id);
  console.log(`   Created: ${invoice2.invoiceNumber}`);
  console.log(`   Status: ${invoice2.status}`);
  console.log(`   Overdue: ${invoice2.isOverdue()}`);

  // Check overdue
  console.log('\n7. Checking Overdue:');
  const overdueCount = manager.checkOverdue();
  console.log(`   Overdue invoices: ${overdueCount}`);
  console.log(`   Invoice2 status now: ${invoice2.status}`);

  // Render with template
  console.log('\n8. Rendering Invoice:');
  const rendered = manager.renderInvoice(invoice.id, 'standard');
  console.log(`   Template: ${rendered.template}`);
  console.log(`   Content preview:`);
  console.log(rendered.content.substring(0, 200) + '...');

  // Stats
  console.log('\n9. Statistics:');
  const stats = manager.getStats();
  console.log(`   Total Invoices: ${stats.totalInvoices}`);
  console.log(`   Paid Invoices: ${stats.paidInvoices}`);
  console.log(`   Total Revenue: $${stats.totalRevenue}`);
  console.log(`   Pending Amount: $${stats.pendingAmount}`);
  console.log(`   Paid Amount: $${stats.paidAmount}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new InvoiceManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Invoice Module');
  console.log('Usage: node agent-invoice.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
