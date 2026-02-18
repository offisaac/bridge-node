/**
 * Agent Payment - Payment Processing Agent
 *
 * Payment processing with multiple payment methods, refunds, and reconciliation.
 *
 * Usage: node agent-payment.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   process     - Process a test payment
 *   refund      - Process a test refund
 */

class PaymentMethod {
  constructor(config) {
    this.id = config.id;
    this.type = config.type; // card, bank, wallet, crypto
    this.provider = config.provider;
    this.last4 = config.last4 || '';
    this.brand = config.brand || '';
    this.expiryMonth = config.expiryMonth;
    this.expiryYear = config.expiryYear;
    this.isDefault = config.isDefault || false;
  }
}

class PaymentTransaction {
  constructor(config) {
    this.id = `txn-${Date.now()}`;
    this.orderId = config.orderId;
    this.amount = config.amount;
    this.currency = config.currency || 'USD';
    this.method = config.method;
    this.status = 'pending'; // pending, processing, completed, failed, refunded
    this.customerId = config.customerId;
    this.merchantId = config.merchantId;
    this.metadata = config.metadata || {};
    this.createdAt = Date.now();
    this.completedAt = null;
    this.gatewayResponse = null;
  }
}

class Refund extends PaymentTransaction {
  constructor(config) {
    super(config);
    this.id = `ref-${Date.now()}`;
    this.originalTransactionId = config.originalTransactionId;
    this.reason = config.reason;
    this.status = 'pending';
  }
}

class PaymentAgent {
  constructor(config = {}) {
    this.merchantId = config.merchantId || 'merchant-001';
    this.paymentMethods = new Map();
    this.transactions = new Map();
    this.refunds = new Map();
    this.stats = {
      paymentsProcessed: 0,
      paymentsFailed: 0,
      totalVolume: 0,
      refundsProcessed: 0
    };
  }

  addPaymentMethod(customerId, method) {
    const pm = new PaymentMethod({
      id: `pm-${Date.now()}`,
      type: method.type,
      provider: method.provider,
      last4: method.last4,
      brand: method.brand,
      expiryMonth: method.expiryMonth,
      expiryYear: method.expiryYear,
      isDefault: method.isDefault || false
    });

    this.paymentMethods.set(pm.id, pm);
    console.log(`   Added payment method: ${pm.type} (${pm.brand} ****${pm.last4})`);
    return { success: true, methodId: pm.id };
  }

  async processPayment(orderId, amount, currency, methodId, customerId, options = {}) {
    const method = this.paymentMethods.get(methodId);
    if (!method) {
      return { success: false, reason: 'Payment method not found' };
    }

    const txn = new PaymentTransaction({
      orderId,
      amount,
      currency,
      method: method.type,
      customerId,
      merchantId: this.merchantId,
      metadata: options.metadata || {}
    });

    // Simulate payment processing
    const success = Math.random() > 0.1; // 90% success rate

    if (success) {
      txn.status = 'completed';
      txn.completedAt = Date.now();
      txn.gatewayResponse = {
        code: 'approved',
        message: 'Payment successful',
        authCode: `AUTH${Math.random().toString(36).substr(2, 8).toUpperCase()}`
      };
      this.stats.paymentsProcessed++;
      this.stats.totalVolume += amount;
      console.log(`   Processed payment: $${amount} ${currency} for order ${orderId}`);
    } else {
      txn.status = 'failed';
      txn.gatewayResponse = {
        code: 'declined',
        message: 'Payment declined'
      };
      this.stats.paymentsFailed++;
      console.log(`   Payment failed for order ${orderId}`);
    }

    this.transactions.set(txn.id, txn);
    return {
      success,
      transactionId: txn.id,
      status: txn.status,
      gatewayResponse: txn.gatewayResponse
    };
  }

  async refundPayment(transactionId, amount, reason) {
    const txn = this.transactions.get(transactionId);
    if (!txn) {
      return { success: false, reason: 'Transaction not found' };
    }

    if (txn.status !== 'completed') {
      return { success: false, reason: 'Transaction not eligible for refund' };
    }

    if (amount > txn.amount) {
      return { success: false, reason: 'Refund amount exceeds original payment' };
    }

    const refund = new Refund({
      orderId: txn.orderId,
      amount,
      currency: txn.currency,
      method: txn.method,
      customerId: txn.customerId,
      merchantId: txn.merchantId,
      originalTransactionId: transactionId,
      reason
    });

    refund.status = 'completed';
    refund.completedAt = Date.now();
    this.refunds.set(refund.id, refund);
    this.stats.refundsProcessed++;

    console.log(`   Processed refund: $${amount} for transaction ${transactionId}`);
    return { success: true, refundId: refund.id, amount };
  }

  async getTransaction(transactionId) {
    return this.transactions.get(transactionId) || this.refunds.get(transactionId);
  }

  getPaymentMethods(customerId) {
    return Array.from(this.paymentMethods.values());
  }

  getStats() {
    return {
      ...this.stats,
      transactions: this.transactions.size,
      refunds: this.refunds.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new PaymentAgent({ merchantId: 'shop-001' });

switch (command) {
  case 'demo':
    console.log('=== Agent Payment Demo\n');

    // 1. Add Payment Methods
    console.log('1. Add Payment Methods:');
    const pm1 = agent.addPaymentMethod('customer-001', {
      type: 'card',
      provider: 'stripe',
      last4: '4242',
      brand: 'Visa',
      expiryMonth: 12,
      expiryYear: 2027,
      isDefault: true
    });
    const pm2 = agent.addPaymentMethod('customer-001', {
      type: 'card',
      provider: 'stripe',
      last4: '5555',
      brand: 'Mastercard',
      expiryMonth: 6,
      expiryYear: 2026
    });
    const pm3 = agent.addPaymentMethod('customer-002', {
      type: 'wallet',
      provider: 'paypal',
      last4: 'paypal'
    });

    // 2. Process Payments
    console.log('\n2. Process Payments:');
    const payment1 = await agent.processPayment('order-001', 99.99, 'USD', pm1.methodId, 'customer-001');
    console.log(`   Payment 1: ${payment1.success ? 'Success' : 'Failed'}`);

    const payment2 = await agent.processPayment('order-002', 250.00, 'USD', pm1.methodId, 'customer-001');
    console.log(`   Payment 2: ${payment2.success ? 'Success' : 'Failed'}`);

    const payment3 = await agent.processPayment('order-003', 1500.00, 'EUR', pm2.methodId, 'customer-001');
    console.log(`   Payment 3: ${payment3.success ? 'Success' : 'Failed'}`);

    // 3. Process Refund
    console.log('\n3. Process Refund:');
    if (payment1.success) {
      const refund = await agent.refundPayment(payment1.transactionId, 50.00, 'Partial refund for damaged item');
      console.log(`   Refund: ${refund.success ? 'Success' : 'Failed'}`);
    }

    // 4. Get Transaction
    console.log('\n4. Transaction Details:');
    const txn = await agent.getTransaction(payment2.transactionId);
    if (txn) {
      console.log(`   Order ID: ${txn.orderId}`);
      console.log(`   Amount: $${txn.amount} ${txn.currency}`);
      console.log(`   Status: ${txn.status}`);
    }

    // 5. Statistics
    console.log('\n5. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total Payments: ${stats.paymentsProcessed}`);
    console.log(`   Failed Payments: ${stats.paymentsFailed}`);
    console.log(`   Total Volume: $${stats.totalVolume.toFixed(2)}`);
    console.log(`   Refunds Processed: ${stats.refundsProcessed}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'process':
    console.log('Processing test payment...');
    const pm = agent.addPaymentMethod('customer-test', {
      type: 'card',
      provider: 'stripe',
      last4: '1234',
      brand: 'Visa'
    });
    const result = await agent.processPayment('test-order', 100.00, 'USD', pm.methodId, 'customer-test');
    console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
    break;

  case 'refund':
    console.log('Processing test refund...');
    const pmTest = agent.addPaymentMethod('customer-test', { type: 'card', last4: '5678' });
    const payment = await agent.processPayment('order-test', 50.00, 'USD', pmTest.methodId, 'customer-test');
    if (payment.success) {
      const refundResult = await agent.refundPayment(payment.transactionId, 25.00, 'Test refund');
      console.log(`Refund: ${refundResult.success ? 'Success' : 'Failed'}`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-payment.js [demo|process|refund]');
}
