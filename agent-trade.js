/**
 * Agent Trade Module
 *
 * Provides trade execution services.
 * Usage: node agent-trade.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show trade stats
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
 * Order Side
 */
const OrderSide = {
  BUY: 'buy',
  SELL: 'sell'
};

/**
 * Order Type
 */
const OrderType = {
  MARKET: 'market',
  LIMIT: 'limit',
  STOP: 'stop',
  STOP_LIMIT: 'stop_limit'
};

/**
 * Order Status
 */
const OrderStatus = {
  PENDING: 'pending',
  SUBMITTED: 'submitted',
  PARTIALLY_FILLED: 'partially_filled',
  FILLED: 'filled',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected'
};

/**
 * Order
 */
class Order {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.accountId = config.accountId;
    this.instrument = config.instrument;
    this.side = config.side;
    this.type = config.type;
    this.quantity = config.quantity;
    this.filledQuantity = 0;
    this.price = config.price || null;
    this.stopPrice = config.stopPrice || null;
    this.status = OrderStatus.PENDING;
    this.createdAt = Date.now();
    this.submittedAt = null;
    this.filledAt = null;
    this.cancelledAt = null;
    this.rejectedAt = null;
    this.rejectionReason = null;
    this.fills = [];
    this.metadata = config.metadata || {};
  }

  submit() {
    this.status = OrderStatus.SUBMITTED;
    this.submittedAt = Date.now();
  }

  fill(quantity, price) {
    this.filledQuantity += quantity;
    this.fills.push({
      quantity,
      price,
      timestamp: Date.now()
    });

    if (this.filledQuantity >= this.quantity) {
      this.status = OrderStatus.FILLED;
      this.filledAt = Date.now();
    } else {
      this.status = OrderStatus.PARTIALLY_FILLED;
    }
  }

  cancel() {
    if (this.status === OrderStatus.FILLED || this.status === OrderStatus.CANCELLED) {
      return false;
    }
    this.status = OrderStatus.CANCELLED;
    this.cancelledAt = Date.now();
    return true;
  }

  reject(reason) {
    this.status = OrderStatus.REJECTED;
    this.rejectedAt = Date.now();
    this.rejectionReason = reason;
  }

  getRemainingQuantity() {
    return this.quantity - this.filledQuantity;
  }

  getAverageFillPrice() {
    if (this.fills.length === 0) return 0;
    const totalValue = this.fills.reduce((sum, f) => sum + (f.quantity * f.price), 0);
    const totalQty = this.fills.reduce((sum, f) => sum + f.quantity, 0);
    return totalQty > 0 ? totalValue / totalQty : 0;
  }

  toJSON() {
    return {
      id: this.id,
      accountId: this.accountId,
      instrument: this.instrument,
      side: this.side,
      type: this.type,
      quantity: this.quantity,
      filledQuantity: this.filledQuantity,
      price: this.price,
      status: this.status,
      createdAt: this.createdAt,
      submittedAt: this.submittedAt,
      filledAt: this.filledAt,
      rejectionReason: this.rejectionReason
    };
  }
}

/**
 * Trade
 */
class Trade {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.orderId = config.orderId;
    this.accountId = config.accountId;
    this.instrument = config.instrument;
    this.side = config.side;
    this.quantity = config.quantity;
    this.price = config.price;
    this.executedAt = config.executedAt || Date.now();
    this.commission = config.commission || 0;
    this.metadata = config.metadata || {};
  }

  getTotalValue() {
    return this.quantity * this.price;
  }

  getTotalCost() {
    return this.getTotalValue() + this.commission;
  }

  toJSON() {
    return {
      id: this.id,
      orderId: this.orderId,
      accountId: this.accountId,
      instrument: this.instrument,
      side: this.side,
      quantity: this.quantity,
      price: this.price,
      executedAt: this.executedAt,
      commission: this.commission
    };
  }
}

/**
 * Position
 */
class Position {
  constructor(config) {
    this.accountId = config.accountId;
    this.instrument = config.instrument;
    this.quantity = config.quantity || 0;
    this.averagePrice = config.averagePrice || 0;
    this.realizedPnL = config.realizedPnL || 0;
    this.updatedAt = Date.now();
  }

  update(fillQuantity, fillPrice, side) {
    if (side === OrderSide.BUY) {
      const totalCost = (this.quantity * this.averagePrice) + (fillQuantity * fillPrice);
      this.quantity += fillQuantity;
      this.averagePrice = this.quantity > 0 ? totalCost / this.quantity : 0;
    } else {
      this.realizedPnL += (fillPrice - this.averagePrice) * fillQuantity;
      this.quantity -= fillQuantity;
    }
    this.updatedAt = Date.now();
  }

  getMarketValue(currentPrice) {
    return this.quantity * currentPrice;
  }

  getUnrealizedPnL(currentPrice) {
    return (currentPrice - this.averagePrice) * this.quantity;
  }

  toJSON() {
    return {
      accountId: this.accountId,
      instrument: this.instrument,
      quantity: this.quantity,
      averagePrice: this.averagePrice,
      realizedPnL: this.realizedPnL
    };
  }
}

/**
 * Trade Manager
 */
class TradeManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.orders = new Map();
    this.trades = new Map();
    this.positions = new Map();
    this.commissionRate = config.commissionRate || 0.001; // 0.1%
    this.stats = {
      ordersSubmitted: 0,
      ordersFilled: 0,
      ordersCancelled: 0,
      ordersRejected: 0,
      tradesExecuted: 0,
      totalVolume: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  createOrder(orderData) {
    const order = new Order(orderData);
    this.orders.set(order.id, order);
    return order;
  }

  submitOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) {
      return { error: 'Order not found' };
    }

    // Validate order
    if (order.type === OrderType.LIMIT && !order.price) {
      order.reject('Limit order requires price');
      this.stats.ordersRejected++;
      return { error: 'Limit order requires price' };
    }

    if ((order.type === OrderType.STOP || order.type === OrderType.STOP_LIMIT) && !order.stopPrice) {
      order.reject('Stop order requires stop price');
      this.stats.ordersRejected++;
      return { error: 'Stop order requires stop price' };
    }

    order.submit();
    this.stats.ordersSubmitted++;

    return { success: true, order };
  }

  executeOrder(orderId, executionPrice) {
    const order = this.orders.get(orderId);
    if (!order) {
      return { error: 'Order not found' };
    }

    if (order.status === OrderStatus.FILLED || order.status === OrderStatus.CANCELLED) {
      return { error: 'Order cannot be executed' };
    }

    // Get execution price
    const price = executionPrice || order.price || 100; // Simplified

    // Calculate fill quantity
    const fillQty = order.getRemainingQuantity();

    // Create trade
    const commission = fillQty * price * this.commissionRate;
    const trade = new Trade({
      orderId: order.id,
      accountId: order.accountId,
      instrument: order.instrument,
      side: order.side,
      quantity: fillQty,
      price: price,
      commission: commission
    });

    this.trades.set(trade.id, trade);
    this.stats.tradesExecuted++;
    this.stats.totalVolume += trade.getTotalValue();

    // Fill order
    order.fill(fillQty, price);
    this.stats.ordersFilled++;

    // Update position
    this._updatePosition(order.accountId, order.instrument, fillQty, price, order.side);

    return { trade, order };
  }

  cancelOrder(orderId) {
    const order = this.orders.get(orderId);
    if (!order) {
      return { error: 'Order not found' };
    }

    const success = order.cancel();
    if (success) {
      this.stats.ordersCancelled++;
      return { success: true, order };
    }

    return { error: 'Order cannot be cancelled' };
  }

  _updatePosition(accountId, instrument, quantity, price, side) {
    const key = `${accountId}:${instrument}`;
    let position = this.positions.get(key);

    if (!position) {
      position = new Position({ accountId, instrument });
    }

    position.update(quantity, price, side);
    this.positions.set(key, position);
  }

  getOrder(orderId) {
    return this.orders.get(orderId);
  }

  getTrades(accountId = null) {
    const results = [];
    for (const trade of this.trades.values()) {
      if (!accountId || trade.accountId === accountId) {
        results.push(trade);
      }
    }
    return results;
  }

  getPosition(accountId, instrument) {
    const key = `${accountId}:${instrument}`;
    return this.positions.get(key);
  }

  getAccountPositions(accountId) {
    const results = [];
    for (const position of this.positions.values()) {
      if (position.accountId === accountId) {
        results.push(position);
      }
    }
    return results;
  }

  getStats() {
    return {
      ...this.stats,
      totalOrders: this.orders.size,
      totalPositions: this.positions.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Trade Demo\n');

  const manager = new TradeManager();

  // Create market order
  console.log('1. Creating Market Order:');
  const order1 = manager.createOrder({
    accountId: 'ACC-001',
    instrument: 'AAPL',
    side: OrderSide.BUY,
    type: OrderType.MARKET,
    quantity: 100
  });
  console.log(`   Order ID: ${order1.id}`);
  console.log(`   Instrument: ${order1.instrument}`);
  console.log(`   Quantity: ${order1.quantity}`);
  console.log(`   Status: ${order1.status}`);

  // Submit order
  console.log('\n2. Submitting Order:');
  manager.submitOrder(order1.id);
  console.log(`   Status: ${order1.status}`);

  // Execute order
  console.log('\n3. Executing Order:');
  const result1 = manager.executeOrder(order1.id, 150);
  console.log(`   Filled at: $${result1.trade.price}`);
  console.log(`   Commission: $${result1.trade.commission.toFixed(2)}`);
  console.log(`   Order Status: ${result1.order.status}`);

  // Create limit order
  console.log('\n4. Creating Limit Order:');
  const order2 = manager.createOrder({
    accountId: 'ACC-001',
    instrument: 'TSLA',
    side: OrderSide.BUY,
    type: OrderType.LIMIT,
    quantity: 50,
    price: 200
  });
  console.log(`   Order ID: ${order2.id}`);
  console.log(`   Limit Price: $${order2.price}`);

  // Submit limit order
  manager.submitOrder(order2.id);
  console.log(`   Status: ${order2.status}`);

  // Execute limit order
  console.log('\n5. Executing Limit Order:');
  const result2 = manager.executeOrder(order2.id, 200);
  console.log(`   Filled at: $${result2.trade.price}`);
  console.log(`   Order Status: ${result2.order.status}`);

  // Cancel order demo
  console.log('\n6. Cancel Order Demo:');
  const order3 = manager.createOrder({
    accountId: 'ACC-001',
    instrument: 'GOOGL',
    side: OrderSide.BUY,
    type: OrderType.LIMIT,
    quantity: 25,
    price: 2800
  });
  manager.submitOrder(order3.id);
  console.log(`   Created order: ${order3.id}`);

  manager.cancelOrder(order3.id);
  console.log(`   Cancelled: ${order3.status}`);

  // Get positions
  console.log('\n7. Account Positions:');
  const positions = manager.getAccountPositions('ACC-001');
  for (const pos of positions) {
    const unrealized = pos.getUnrealizedPnL(155);
    console.log(`   ${pos.instrument}: ${pos.quantity} shares @ $${pos.averagePrice} (Unrealized: $${unrealized.toFixed(2)})`);
  }

  // Get trades
  console.log('\n8. Trade History:');
  const trades = manager.getTrades('ACC-001');
  console.log(`   Total trades: ${trades.length}`);

  // Stats
  console.log('\n9. Statistics:');
  const stats = manager.getStats();
  console.log(`   Orders Submitted: ${stats.ordersSubmitted}`);
  console.log(`   Orders Filled: ${stats.ordersFilled}`);
  console.log(`   Orders Cancelled: ${stats.ordersCancelled}`);
  console.log(`   Trades Executed: ${stats.tradesExecuted}`);
  console.log(`   Total Volume: $${stats.totalVolume.toLocaleString()}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new TradeManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Trade Module');
  console.log('Usage: node agent-trade.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
