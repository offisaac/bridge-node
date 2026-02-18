/**
 * Agent Coupon Module
 *
 * Provides coupon and promotion management services.
 * Usage: node agent-coupon.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show coupon stats
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
 * Coupon Type
 */
const CouponType = {
  PERCENTAGE: 'percentage',
  FIXED_AMOUNT: 'fixed_amount',
  FREE_SHIPPING: 'free_shipping',
  BUY_X_GET_Y: 'buy_x_get_y',
  NEW_USER: 'new_user',
  LOYALTY: 'loyalty'
};

/**
 * Coupon Status
 */
const CouponStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  EXPIRED: 'expired',
  EXHAUSTED: 'exhausted',
  PENDING: 'pending'
};

/**
 * Coupon
 */
class Coupon {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.code = config.code;
    this.name = config.name;
    this.description = config.description;
    this.type = config.type;
    this.value = config.value; // percentage or fixed amount
    this.minPurchase = config.minPurchase || 0;
    this.maxDiscount = config.maxDiscount || null;
    this.currency = config.currency || 'USD';
    this.usageLimit = config.usageLimit || null; // Total uses allowed
    this.usageCount = 0;
    this.userLimit = config.userLimit || 1; // Uses per user
    this.validFrom = config.validFrom || Date.now();
    this.validUntil = config.validUntil;
    this.status = CouponStatus.ACTIVE;
    this.eligibleProducts = config.eligibleProducts || []; // Empty = all products
    this.excludedProducts = config.excludedProducts || [];
    this.metadata = config.metadata || {};
    this.createdAt = Date.now();
  }

  isValid() {
    const now = Date.now();
    if (now < this.validFrom) return false;
    if (this.validUntil && now > this.validUntil) return false;
    if (this.status !== CouponStatus.ACTIVE) return false;
    if (this.usageLimit && this.usageCount >= this.usageLimit) return false;
    return true;
  }

  isApplicableToProduct(productId) {
    if (this.eligibleProducts.length > 0 && !this.eligibleProducts.includes(productId)) {
      return false;
    }
    if (this.excludedProducts.includes(productId)) {
      return false;
    }
    return true;
  }

  calculateDiscount(amount, userId = null, productId = null) {
    if (!this.isValid()) {
      return { valid: false, reason: 'Coupon is not valid' };
    }

    // Check product applicability
    if (productId && !this.isApplicableToProduct(productId)) {
      return { valid: false, reason: 'Coupon not applicable to this product' };
    }

    // Check minimum purchase
    if (amount < this.minPurchase) {
      return { valid: false, reason: `Minimum purchase of $${this.minPurchase} required` };
    }

    let discount = 0;

    switch (this.type) {
      case CouponType.PERCENTAGE:
        discount = amount * (this.value / 100);
        break;
      case CouponType.FIXED_AMOUNT:
        discount = this.value;
        break;
      case CouponType.FREE_SHIPPING:
        discount = 0; // Free shipping is handled separately
        break;
      default:
        discount = 0;
    }

    // Apply max discount cap
    if (this.maxDiscount && discount > this.maxDiscount) {
      discount = this.maxDiscount;
    }

    // Ensure discount doesn't exceed amount
    discount = Math.min(discount, amount);

    return {
      valid: true,
      discount: discount,
      originalAmount: amount,
      finalAmount: amount - discount
    };
  }

  use() {
    if (!this.isValid()) return false;
    this.usageCount++;
    if (this.usageLimit && this.usageCount >= this.usageLimit) {
      this.status = CouponStatus.EXHAUSTED;
    }
    return true;
  }

  expire() {
    this.status = CouponStatus.EXPIRED;
  }

  activate() {
    this.status = CouponStatus.ACTIVE;
  }

  deactivate() {
    this.status = CouponStatus.INACTIVE;
  }

  toJSON() {
    return {
      id: this.id,
      code: this.code,
      name: this.name,
      type: this.type,
      value: this.value,
      status: this.status,
      usageCount: this.usageCount,
      usageLimit: this.usageLimit,
      validUntil: this.validUntil
    };
  }
}

/**
 * Coupon Redemption
 */
class CouponRedemption {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.couponId = config.couponId;
    this.couponCode = config.couponCode;
    this.userId = config.userId;
    this.orderId = config.orderId;
    this.discount = config.discount;
    this.originalAmount = config.originalAmount;
    this.finalAmount = config.finalAmount;
    this.redeemedAt = Date.now();
    this.status = 'success';
  }
}

/**
 * Coupon Manager
 */
class CouponManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.coupons = new Map();
    this.redemptions = new Map();
    this.stats = {
      couponsCreated: 0,
      couponsRedeemed: 0,
      couponsFailed: 0,
      totalDiscountGiven: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
    this._createSampleCoupons();
  }

  _createSampleCoupons() {
    this.createCoupon({
      code: 'SAVE20',
      name: '20% Off',
      description: 'Save 20% on your purchase',
      type: CouponType.PERCENTAGE,
      value: 20,
      minPurchase: 50,
      maxDiscount: 100,
      usageLimit: 1000,
      validUntil: Date.now() + 30 * 24 * 60 * 60 * 1000
    });

    this.createCoupon({
      code: 'FLAT10',
      name: '$10 Off',
      description: '$10 off any purchase',
      type: CouponType.FIXED_AMOUNT,
      value: 10,
      minPurchase: 30,
      usageLimit: 500,
      validUntil: Date.now() + 60 * 24 * 60 * 60 * 1000
    });

    this.createCoupon({
      code: 'FREESHIP',
      name: 'Free Shipping',
      description: 'Free shipping on your order',
      type: CouponType.FREE_SHIPPING,
      value: 0,
      minPurchase: 75,
      usageLimit: null,
      validUntil: Date.now() + 90 * 24 * 60 * 60 * 1000
    });

    this.createCoupon({
      code: 'NEWUSER50',
      name: '$50 for New Users',
      description: '$50 off for new user registration',
      type: CouponType.NEW_USER,
      value: 50,
      minPurchase: 100,
      userLimit: 1,
      usageLimit: 10000,
      validUntil: Date.now() + 180 * 24 * 60 * 60 * 1000
    });
  }

  createCoupon(couponData) {
    const coupon = new Coupon(couponData);
    this.coupons.set(coupon.id, coupon);
    this.stats.couponsCreated++;
    return coupon;
  }

  getCoupon(couponIdOrCode) {
    // Search by code first
    for (const c of this.coupons.values()) {
      if (c instanceof Coupon && c.code === couponIdOrCode) return c;
    }
    // Then by id
    return this.coupons.get(couponIdOrCode);
  }

  validateCoupon(code, amount = 0, userId = null, productId = null) {
    const coupon = this.getCoupon(code);
    if (!coupon) {
      return { valid: false, reason: 'Coupon not found' };
    }

    if (!coupon.isValid()) {
      return { valid: false, reason: 'Coupon is not valid or has expired' };
    }

    return coupon.calculateDiscount(amount, userId, productId);
  }

  redeemCoupon(code, amount, userId, orderId, productId = null) {
    const coupon = this.getCoupon(code);
    if (!coupon) {
      this.stats.couponsFailed++;
      return { success: false, reason: 'Coupon not found' };
    }

    const validation = coupon.calculateDiscount(amount, userId, productId);
    if (!validation.valid) {
      this.stats.couponsFailed++;
      return { success: false, reason: validation.reason };
    }

    // Record redemption
    const redemption = new CouponRedemption({
      couponId: coupon.id,
      couponCode: code,
      userId,
      orderId,
      discount: validation.discount,
      originalAmount: amount,
      finalAmount: validation.finalAmount
    });

    this.redemptions.set(redemption.id, redemption);

    // Mark coupon as used
    coupon.use();

    this.stats.couponsRedeemed++;
    this.stats.totalDiscountGiven += validation.discount;

    return {
      success: true,
      discount: validation.discount,
      finalAmount: validation.finalAmount,
      redemptionId: redemption.id
    };
  }

  getRedemptions(userId = null) {
    const results = [];
    for (const redemption of this.redemptions.values()) {
      if (!userId || redemption.userId === userId) {
        results.push(redemption);
      }
    }
    return results;
  }

  getStats() {
    return {
      ...this.stats,
      totalCoupons: this.coupons.size / 2, // Count unique coupons (indexed by id and code)
      activeCoupons: Array.from(this.coupons.values()).filter(c => c instanceof Coupon && c.status === CouponStatus.ACTIVE).length,
      totalRedemptions: this.redemptions.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Coupon Demo\n');

  const manager = new CouponManager();

  // Show coupons
  console.log('1. Available Coupons:');
  const coupons = Array.from(manager.coupons.values()).filter(c => c instanceof Coupon);
  for (const coupon of coupons) {
    let value = coupon.value;
    if (coupon.type === CouponType.PERCENTAGE) value += '%';
    else value = '$' + value;
    console.log(`   ${coupon.code}: ${coupon.name} (${value})`);
  }

  // Validate coupon
  console.log('\n2. Validating Coupon (SAVE20):');
  const validation1 = manager.validateCoupon('SAVE20', 100);
  console.log(`   Amount: $100`);
  console.log(`   Valid: ${validation1.valid}`);
  if (validation1.valid) {
    console.log(`   Discount: $${validation1.discount}`);
    console.log(`   Final: $${validation1.finalAmount}`);
  } else {
    console.log(`   Reason: ${validation1.reason}`);
  }

  // Validate with minimum purchase not met
  console.log('\n3. Validating Below Minimum:');
  const validation2 = manager.validateCoupon('SAVE20', 30);
  console.log(`   Amount: $30`);
  console.log(`   Valid: ${validation2.valid}`);
  console.log(`   Reason: ${validation2.reason}`);

  // Redeem coupon
  console.log('\n4. Redeeming Coupon (FLAT10):');
  const redemption1 = manager.redeemCoupon('FLAT10', 50, 'user-123', 'order-001');
  console.log(`   Original: $50`);
  console.log(`   Discount: $${redemption1.discount}`);
  console.log(`   Final: $${redemption1.finalAmount}`);

  // Redeem new user coupon
  console.log('\n5. Redeeming New User Coupon:');
  const redemption2 = manager.redeemCoupon('NEWUSER50', 200, 'new-user-456', 'order-002');
  console.log(`   Original: $200`);
  console.log(`   Discount: $${redemption2.discount}`);
  console.log(`   Final: $${redemption2.finalAmount}`);

  // Test invalid coupon
  console.log('\n6. Testing Invalid Coupon:');
  const invalid = manager.redeemCoupon('INVALID', 100, 'user-123', 'order-003');
  console.log(`   Success: ${invalid.success}`);
  console.log(`   Reason: ${invalid.reason}`);

  // Test coupon code not found
  console.log('\n7. Testing Non-existent Coupon:');
  const notFound = manager.validateCoupon('NOTFOUND', 100);
  console.log(`   Valid: ${notFound.valid}`);
  console.log(`   Reason: ${notFound.reason}`);

  // Get user redemptions
  console.log('\n8. User Redemptions:');
  const userRedemptions = manager.getRedemptions('user-123');
  console.log(`   user-123 redemptions: ${userRedemptions.length}`);

  // Stats
  console.log('\n9. Statistics:');
  const stats = manager.getStats();
  console.log(`   Coupons Created: ${stats.couponsCreated}`);
  console.log(`   Coupons Redeemed: ${stats.couponsRedeemed}`);
  console.log(`   Coupons Failed: ${stats.couponsFailed}`);
  console.log(`   Total Discount Given: $${stats.totalDiscountGiven}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new CouponManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Coupon Module');
  console.log('Usage: node agent-coupon.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
