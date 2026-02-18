/**
 * Agent Subscription2 - Subscription Management Agent
 *
 * Advanced subscription management with plans, trials, upgrades, and cancellations.
 *
 * Usage: node agent-subscription2.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   subscribe  - Create subscription
 *   upgrade    - Upgrade plan
 */

class SubscriptionPlan {
  constructor(config) {
    this.id = `plan-${Date.now()}`;
    this.name = config.name;
    this.description = config.description || '';
    this.price = config.price;
    this.interval = config.interval; // monthly, yearly, weekly
    this.features = config.features || [];
    this.limits = config.limits || {};
    this.trialDays = config.trialDays || 0;
    this.currency = config.currency || 'USD';
  }
}

class Subscription {
  constructor(config) {
    this.id = `sub-${Date.now()}`;
    this.customerId = config.customerId;
    this.planId = config.planId;
    this.plan = config.plan;
    this.status = 'active'; // active, trialing, paused, cancelled, expired
    this.startDate = config.startDate || Date.now();
    this.currentPeriodStart = config.currentPeriodStart || Date.now();
    this.currentPeriodEnd = config.currentPeriodEnd || Date.now() + 30 * 24 * 60 * 60 * 1000;
    this.cancelAtPeriodEnd = false;
    this.cancelledAt = null;
    this.usage = {};
    this.addons = [];
  }

  getDaysRemaining() {
    const diff = this.currentPeriodEnd - Date.now();
    return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
  }

  isInTrial() {
    return this.status === 'trialing';
  }
}

class SubscriptionAddon {
  constructor(config) {
    this.id = `addon-${Date.now()}`;
    this.name = config.name;
    this.price = config.price;
    this.interval = config.interval || 'monthly';
    this.quantity = config.quantity || 1;
  }
}

class SubscriptionAgent {
  constructor(config = {}) {
    this.plans = new Map();
    this.subscriptions = new Map();
    this.stats = {
      activeSubscriptions: 0,
      trialSubscriptions: 0,
      mrr: 0,
      cancelled: 0
    };
  }

  createPlan(name, price, interval, options = {}) {
    const plan = new SubscriptionPlan({
      name,
      price,
      interval,
      description: options.description,
      features: options.features || [],
      limits: options.limits || {},
      trialDays: options.trialDays || 0
    });

    this.plans.set(plan.id, plan);
    console.log(`   Created plan: ${name} - $${price}/${interval}`);
    return plan;
  }

  subscribe(customerId, planId, options = {}) {
    const plan = this.plans.get(planId);
    if (!plan) {
      return { success: false, reason: 'Plan not found' };
    }

    const subscription = new Subscription({
      customerId,
      planId,
      plan,
      currentPeriodEnd: Date.now() + (plan.interval === 'monthly' ? 30 : 365) * 24 * 60 * 60 * 1000
    });

    if (plan.trialDays > 0) {
      subscription.status = 'trialing';
      subscription.trialEnd = Date.now() + plan.trialDays * 24 * 60 * 60 * 1000;
      this.stats.trialSubscriptions++;
    } else {
      this.stats.activeSubscriptions++;
    }

    this.subscriptions.set(subscription.id, subscription);
    this.stats.mrr += plan.price;

    console.log(`   Created subscription for customer ${customerId} on plan ${plan.name}`);
    return { success: true, subscriptionId: subscription.id };
  }

  async upgrade(subscriptionId, newPlanId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return { success: false, reason: 'Subscription not found' };
    }

    const newPlan = this.plans.get(newPlanId);
    if (!newPlan) {
      return { success: false, reason: 'Plan not found' };
    }

    const oldPrice = subscription.plan.price;
    subscription.plan = newPlan;
    subscription.planId = newPlanId;

    this.stats.mrr = this.stats.mrr - oldPrice + newPlan.price;

    console.log(`   Upgraded subscription to plan ${newPlan.name}`);
    return { success: true, newPlan: newPlan.name };
  }

  async downgrade(subscriptionId, newPlanId) {
    return this.upgrade(subscriptionId, newPlanId);
  }

  cancel(subscriptionId, immediately = false) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return { success: false, reason: 'Subscription not found' };
    }

    if (immediately) {
      subscription.status = 'cancelled';
      subscription.cancelledAt = Date.now();
      this.stats.activeSubscriptions--;
      this.stats.mrr -= subscription.plan.price;
    } else {
      subscription.cancelAtPeriodEnd = true;
    }

    this.stats.cancelled++;
    console.log(`   Cancelled subscription (${immediately ? 'immediate' : 'end of period'})`);
    return { success: true };
  }

  resume(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return { success: false, reason: 'Subscription not found' };
    }

    subscription.cancelAtPeriodEnd = false;
    console.log(`   Resumed subscription`);
    return { success: true };
  }

  addAddon(subscriptionId, addon) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return { success: false, reason: 'Subscription not found' };
    }

    const newAddon = new SubscriptionAddon(addon);
    subscription.addons.push(newAddon);
    this.stats.mrr += newAddon.price * newAddon.quantity;

    console.log(`   Added addon: ${newAddon.name}`);
    return { success: true, addonId: newAddon.id };
  }

  trackUsage(subscriptionId, metric, value) {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) {
      return { success: false, reason: 'Subscription not found' };
    }

    subscription.usage[metric] = value;
    console.log(`   Usage: ${metric} = ${value}`);
    return { success: true };
  }

  getSubscription(subscriptionId) {
    return this.subscriptions.get(subscriptionId);
  }

  getCustomerSubscription(customerId) {
    return Array.from(this.subscriptions.values())
      .find(sub => sub.customerId === customerId);
  }

  getStats() {
    return {
      ...this.stats,
      totalSubscriptions: this.subscriptions.size,
      plans: this.plans.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new SubscriptionAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Subscription2 Demo\n');

    // 1. Create Plans
    console.log('1. Create Subscription Plans:');
    const basicPlan = agent.createPlan('Basic', 9.99, 'monthly', {
      description: 'Basic features',
      features: ['5GB Storage', 'Email Support', 'Basic Analytics'],
      limits: { users: 5, projects: 10 }
    });

    const proPlan = agent.createPlan('Pro', 29.99, 'monthly', {
      description: 'Pro features',
      features: ['50GB Storage', 'Priority Support', 'Advanced Analytics', 'API Access'],
      limits: { users: 25, projects: 100 },
      trialDays: 14
    });

    const enterprisePlan = agent.createPlan('Enterprise', 99.99, 'monthly', {
      description: 'Enterprise features',
      features: ['Unlimited Storage', '24/7 Support', 'Advanced Analytics', 'API Access', 'Custom Integrations', 'Dedicated Account Manager'],
      limits: { users: -1, projects: -1 }
    });

    // 2. Create Subscriptions
    console.log('\n2. Create Subscriptions:');
    const sub1 = agent.subscribe('cust-001', basicPlan.id);
    const sub2 = agent.subscribe('cust-002', proPlan.id);
    const sub3 = agent.subscribe('cust-003', enterprisePlan.id);

    // 3. Upgrade
    console.log('\n3. Upgrade Subscription:');
    await agent.upgrade(sub1.subscriptionId, proPlan.id);

    // 4. Add Addons
    console.log('\n4. Add Addons:');
    agent.addAddon(sub2.subscriptionId, {
      name: 'Additional Storage',
      price: 10.00,
      quantity: 2
    });

    // 5. Track Usage
    console.log('\n5. Track Usage:');
    agent.trackUsage(sub1.subscriptionId, 'api_calls', 15000);
    agent.trackUsage(sub2.subscriptionId, 'storage_gb', 75);
    agent.trackUsage(sub3.subscriptionId, 'api_calls', 150000);

    // 6. Cancel
    console.log('\n6. Cancel Subscription:');
    agent.cancel(sub3.subscriptionId, false);

    // 7. Statistics
    console.log('\n7. Statistics:');
    const stats = agent.getStats();
    console.log(`   Active Subscriptions: ${stats.activeSubscriptions}`);
    console.log(`   Trial Subscriptions: ${stats.trialSubscriptions}`);
    console.log(`   Monthly Recurring Revenue: $${stats.mrr.toFixed(2)}`);
    console.log(`   Cancelled: ${stats.cancelled}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'subscribe':
    console.log('Creating test subscription...');
    const plan = agent.createPlan('Test Plan', 19.99, 'monthly');
    const result = agent.subscribe('test-customer', plan.id);
    console.log(`Result: ${result.success ? 'Success' : 'Failed'}`);
    break;

  case 'upgrade':
    console.log('Upgrading test subscription...');
    const p1 = agent.createPlan('Basic', 9.99, 'monthly');
    const p2 = agent.createPlan('Pro', 29.99, 'monthly');
    const sub = agent.subscribe('cust-test', p1.id);
    if (sub.success) {
      await agent.upgrade(sub.subscriptionId, p2.id);
    }
    console.log('Upgrade complete');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-subscription2.js [demo|subscribe|upgrade]');
}
