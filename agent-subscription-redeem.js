/**
 * Agent Subscription Redeem Module
 *
 * Provides subscription redemption services.
 * Usage: node agent-subscription-redeem.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show subscription stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

/**
 * Subscription Status
 */
const SubscriptionStatus = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
  SUSPENDED: 'suspended',
  PENDING: 'pending'
};

/**
 * Redemption Type
 */
const RedemptionType = {
  CREDIT: 'credit',
  UPGRADE: 'upgrade',
  EXTENSION: 'extension',
  BONUS: 'bonus',
  TIER_CHANGE: 'tier_change',
  FEATURE_UNLOCK: 'feature_unlock'
};

/**
 * Subscription Plan
 */
class SubscriptionPlan {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.tier = config.tier; // free, basic, pro, enterprise
    this.price = config.price;
    this.currency = config.currency || 'USD';
    this.billingCycle = config.billingCycle || 'monthly'; // monthly, yearly
    this.features = config.features || [];
    this.credits = config.credits || 0;
    this.maxUsers = config.maxUsers || 1;
    this.storage = config.storage || '1GB';
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      tier: this.tier,
      price: this.price,
      billingCycle: this.billingCycle,
      features: this.features,
      credits: this.credits,
      maxUsers: this.maxUsers,
      storage: this.storage
    };
  }
}

/**
 * Subscription
 */
class Subscription {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.userId = config.userId;
    this.planId = config.planId;
    this.planName = config.planName;
    this.tier = config.tier;
    this.status = SubscriptionStatus.ACTIVE;
    this.startDate = config.startDate || Date.now();
    this.endDate = config.endDate;
    this.credits = config.credits || 0;
    this.usedCredits = 0;
    this.autoRenew = config.autoRenew !== false;
    this.paymentMethod = config.paymentMethod || 'card';
  }

  getRemainingCredits() {
    return this.credits - this.usedCredits;
  }

  useCredits(amount) {
    if (this.usedCredits + amount > this.credits) {
      return false;
    }
    this.usedCredits += amount;
    return true;
  }

  addCredits(amount) {
    this.credits += amount;
  }

  isActive() {
    const now = Date.now();
    if (this.status !== SubscriptionStatus.ACTIVE) return false;
    if (this.endDate && now > this.endDate) {
      this.status = SubscriptionStatus.EXPIRED;
      return false;
    }
    return true;
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      planName: this.planName,
      tier: this.tier,
      status: this.status,
      credits: this.credits,
      usedCredits: this.usedCredits,
      remainingCredits: this.getRemainingCredits(),
      autoRenew: this.autoRenew,
      startDate: this.startDate,
      endDate: this.endDate
    };
  }
}

/**
 * Redemption
 */
class Redemption {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.subscriptionId = config.subscriptionId;
    this.userId = config.userId;
    this.type = config.type;
    this.value = config.value;
    this.description = config.description;
    this.redeemedAt = Date.now();
    this.status = 'success';
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      subscriptionId: this.subscriptionId,
      userId: this.userId,
      type: this.type,
      value: this.value,
      description: this.description,
      redeemedAt: this.redeemedAt,
      status: this.status
    };
  }
}

/**
 * Subscription Redeem Manager
 */
class SubscriptionRedeemManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.subscriptions = new Map();
    this.redemptions = new Map();
    this.plans = new Map();
    this.stats = {
      redemptionsTotal: 0,
      redemptionsCredits: 0,
      redemptionsUpgrades: 0,
      redemptionsExtensions: 0,
      redemptionsFailed: 0
    };

    this._init();
  }

  _init() {
    this._createSamplePlans();
    this._createSampleSubscriptions();
  }

  _createSamplePlans() {
    const plans = [
      new SubscriptionPlan({
        name: 'Free',
        tier: 'free',
        price: 0,
        features: ['basic_access'],
        credits: 10,
        maxUsers: 1,
        storage: '1GB'
      }),
      new SubscriptionPlan({
        name: 'Basic',
        tier: 'basic',
        price: 9.99,
        features: ['basic_access', 'email_support', 'analytics'],
        credits: 100,
        maxUsers: 3,
        storage: '10GB'
      }),
      new SubscriptionPlan({
        name: 'Pro',
        tier: 'pro',
        price: 29.99,
        features: ['full_access', 'priority_support', 'advanced_analytics', 'api_access'],
        credits: 500,
        maxUsers: 10,
        storage: '100GB'
      }),
      new SubscriptionPlan({
        name: 'Enterprise',
        tier: 'enterprise',
        price: 99.99,
        features: ['full_access', '24/7_support', 'custom_analytics', 'api_access', 'dedicated_account_manager'],
        credits: 2000,
        maxUsers: -1, // unlimited
        storage: '1TB'
      })
    ];

    for (const plan of plans) {
      this.plans.set(plan.id, plan);
    }
  }

  _createSampleSubscriptions() {
    // Sample subscription for demo user
    const sub = new Subscription({
      userId: 'user-123',
      planId: 'basic-plan',
      planName: 'Basic',
      tier: 'basic',
      credits: 100,
      endDate: Date.now() + 30 * 24 * 60 * 60 * 1000
    });
    this.subscriptions.set(sub.id, sub);
  }

  getSubscription(subscriptionIdOrUserId) {
    // Search by userId first
    for (const s of this.subscriptions.values()) {
      if (s.userId === subscriptionIdOrUserId) return s;
    }
    // Then by id
    return this.subscriptions.get(subscriptionIdOrUserId);
  }

  getPlan(planId) {
    return this.plans.get(planId);
  }

  getAllPlans() {
    return Array.from(this.plans.values());
  }

  /**
   * Redeem credits
   */
  redeemCredits(userId, amount, description = '') {
    const subscription = this.getSubscription(userId);
    if (!subscription) {
      this.stats.redemptionsFailed++;
      return { success: false, reason: 'Subscription not found' };
    }

    if (!subscription.isActive()) {
      this.stats.redemptionsFailed++;
      return { success: false, reason: 'Subscription is not active' };
    }

    if (subscription.getRemainingCredits() < amount) {
      this.stats.redemptionsFailed++;
      return { success: false, reason: 'Insufficient credits' };
    }

    subscription.useCredits(amount);

    const redemption = new Redemption({
      subscriptionId: subscription.id,
      userId: userId,
      type: RedemptionType.CREDIT,
      value: amount,
      description: description || `Redeemed ${amount} credits`
    });

    this.redemptions.set(redemption.id, redemption);
    this.stats.redemptionsTotal++;
    this.stats.redemptionsCredits++;

    return {
      success: true,
      redemptionId: redemption.id,
      amount: amount,
      remainingCredits: subscription.getRemainingCredits()
    };
  }

  /**
   * Redeem upgrade
   */
  redeemUpgrade(userId, targetTier, additionalCost = 0) {
    const subscription = this.getSubscription(userId);
    if (!subscription) {
      this.stats.redemptionsFailed++;
      return { success: false, reason: 'Subscription not found' };
    }

    if (!subscription.isActive()) {
      this.stats.redemptionsFailed++;
      return { success: false, reason: 'Subscription is not active' };
    }

    // Find target plan
    let targetPlan = null;
    for (const plan of this.plans.values()) {
      if (plan.tier === targetTier) {
        targetPlan = plan;
        break;
      }
    }

    if (!targetPlan) {
      this.stats.redemptionsFailed++;
      return { success: false, reason: 'Target tier not found' };
    }

    // Check if upgrade is valid
    const tiers = ['free', 'basic', 'pro', 'enterprise'];
    const currentIdx = tiers.indexOf(subscription.tier);
    const targetIdx = tiers.indexOf(targetTier);

    if (targetIdx <= currentIdx) {
      this.stats.redemptionsFailed++;
      return { success: false, reason: 'Cannot upgrade to same or lower tier' };
    }

    // Apply upgrade
    subscription.tier = targetTier;
    subscription.planName = targetPlan.name;
    subscription.credits += targetPlan.credits;

    const redemption = new Redemption({
      subscriptionId: subscription.id,
      userId: userId,
      type: RedemptionType.UPGRADE,
      value: targetTier,
      description: `Upgraded to ${targetPlan.name}`,
      metadata: { additionalCost }
    });

    this.redemptions.set(redemption.id, redemption);
    this.stats.redemptionsTotal++;
    this.stats.redemptionsUpgrades++;

    return {
      success: true,
      redemptionId: redemption.id,
      newTier: targetTier,
      newPlanName: targetPlan.name,
      additionalCredits: targetPlan.credits
    };
  }

  /**
   * Redeem extension
   */
  redeemExtension(userId, days, reason = '') {
    const subscription = this.getSubscription(userId);
    if (!subscription) {
      this.stats.redemptionsFailed++;
      return { success: false, reason: 'Subscription not found' };
    }

    if (!subscription.isActive()) {
      this.stats.redemptionsFailed++;
      return { success: false, reason: 'Subscription is not active' };
    }

    const extensionMs = days * 24 * 60 * 60 * 1000;

    if (subscription.endDate) {
      subscription.endDate += extensionMs;
    } else {
      subscription.endDate = Date.now() + extensionMs;
    }

    const redemption = new Redemption({
      subscriptionId: subscription.id,
      userId: userId,
      type: RedemptionType.EXTENSION,
      value: days,
      description: reason || `Extended by ${days} days`,
      metadata: { days }
    });

    this.redemptions.set(redemption.id, redemption);
    this.stats.redemptionsTotal++;
    this.stats.redemptionsExtensions++;

    return {
      success: true,
      redemptionId: redemption.id,
      daysAdded: days,
      newEndDate: subscription.endDate
    };
  }

  /**
   * Redeem bonus
   */
  redeemBonus(userId, bonusType, value) {
    const subscription = this.getSubscription(userId);
    if (!subscription) {
      this.stats.redemptionsFailed++;
      return { success: false, reason: 'Subscription not found' };
    }

    if (!subscription.isActive()) {
      this.stats.redemptionsFailed++;
      return { success: false, reason: 'Subscription is not active' };
    }

    switch (bonusType) {
      case 'credits':
        subscription.addCredits(value);
        break;
      case 'storage':
        // Would handle storage upgrade
        break;
      default:
        this.stats.redemptionsFailed++;
        return { success: false, reason: 'Unknown bonus type' };
    }

    const redemption = new Redemption({
      subscriptionId: subscription.id,
      userId: userId,
      type: RedemptionType.BONUS,
      value: value,
      description: `${bonusType} bonus`,
      metadata: { bonusType }
    });

    this.redemptions.set(redemption.id, redemption);
    this.stats.redemptionsTotal++;

    return {
      success: true,
      redemptionId: redemption.id,
      bonusType,
      value,
      newCredits: subscription.getRemainingCredits()
    };
  }

  /**
   * Get user redemptions
   */
  getRedemptions(userId = null) {
    const results = [];
    for (const redemption of this.redemptions.values()) {
      if (!userId || redemption.userId === userId) {
        results.push(redemption);
      }
    }
    return results;
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      ...this.stats,
      totalSubscriptions: this.subscriptions.size,
      totalRedemptions: this.redemptions.size,
      activeSubscriptions: Array.from(this.subscriptions.values()).filter(s => s.isActive()).length
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Subscription Redeem Demo\n');

  const manager = new SubscriptionRedeemManager();

  // Show available plans
  console.log('1. Available Plans:');
  const plans = manager.getAllPlans();
  for (const plan of plans) {
    console.log(`   ${plan.name} (${plan.tier}): $${plan.price}/${plan.billingCycle} - ${plan.credits} credits`);
  }

  // Show user subscription
  console.log('\n2. User Subscription:');
  const sub = manager.getSubscription('user-123');
  console.log(`   Plan: ${sub.planName} (${sub.tier})`);
  console.log(`   Credits: ${sub.credits} total, ${sub.getRemainingCredits()} remaining`);
  console.log(`   Status: ${sub.status}`);

  // Redeem credits
  console.log('\n3. Redeeming Credits (50 credits):');
  const result1 = manager.redeemCredits('user-123', 50, 'Monthly bonus');
  console.log(`   Success: ${result1.success}`);
  if (result1.success) {
    console.log(`   Remaining: ${result1.remainingCredits}`);
  } else {
    console.log(`   Reason: ${result1.reason}`);
  }

  // Redeem more credits (should fail - not enough)
  console.log('\n4. Redeeming More Credits (60 credits):');
  const result2 = manager.redeemCredits('user-123', 60);
  console.log(`   Success: ${result2.success}`);
  if (!result2.success) {
    console.log(`   Reason: ${result2.reason}`);
  }

  // Redeem upgrade
  console.log('\n5. Redeeming Upgrade to Pro:');
  const result3 = manager.redeemUpgrade('user-123', 'pro');
  console.log(`   Success: ${result3.success}`);
  if (result3.success) {
    console.log(`   New Tier: ${result3.newTier}`);
    console.log(`   New Plan: ${result3.newPlanName}`);
    console.log(`   Additional Credits: ${result3.additionalCredits}`);
  } else {
    console.log(`   Reason: ${result3.reason}`);
  }

  // Show updated subscription
  console.log('\n6. Updated Subscription:');
  const sub2 = manager.getSubscription('user-123');
  console.log(`   Plan: ${sub2.planName} (${sub2.tier})`);
  console.log(`   Credits: ${sub2.credits} total, ${sub2.getRemainingCredits()} remaining`);

  // Redeem extension
  console.log('\n7. Redeeming Extension (30 days):');
  const result4 = manager.redeemExtension('user-123', 30, 'Loyalty bonus');
  console.log(`   Success: ${result4.success}`);
  if (result4.success) {
    console.log(`   Days Added: ${result4.daysAdded}`);
  }

  // Redeem bonus
  console.log('\n8. Redeeming Bonus (100 credits):');
  const result5 = manager.redeemBonus('user-123', 'credits', 100);
  console.log(`   Success: ${result5.success}`);
  if (result5.success) {
    console.log(`   New Credits: ${result5.newCredits}`);
  }

  // Test invalid user
  console.log('\n9. Testing Invalid User:');
  const result6 = manager.redeemCredits('invalid-user', 10);
  console.log(`   Success: ${result6.success}`);
  console.log(`   Reason: ${result6.reason}`);

  // Get user redemptions
  console.log('\n10. User Redemptions:');
  const redemptions = manager.getRedemptions('user-123');
  console.log(`    Total: ${redemptions.length}`);
  for (const r of redemptions) {
    console.log(`    - ${r.type}: ${r.value} (${new Date(r.redeemedAt).toLocaleDateString()})`);
  }

  // Stats
  console.log('\n11. Statistics:');
  const stats = manager.getStats();
  console.log(`    Redemptions Total: ${stats.redemptionsTotal}`);
  console.log(`    Redemptions Credits: ${stats.redemptionsCredits}`);
  console.log(`    Redemptions Upgrades: ${stats.redemptionsUpgrades}`);
  console.log(`    Redemptions Extensions: ${stats.redemptionsExtensions}`);
  console.log(`    Redemptions Failed: ${stats.redemptionsFailed}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new SubscriptionRedeemManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Subscription Redeem Module');
  console.log('Usage: node agent-subscription-redeem.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
