/**
 * Agent Revenue - Revenue Management Agent
 *
 * Revenue tracking, forecasting, and financial reporting.
 *
 * Usage: node agent-revenue.js [command]
 * Commands:
 *   demo        - Run demonstration
 *   report      - Generate revenue report
 *   forecast    - Forecast revenue
 */

class RevenueEntry {
  constructor(config) {
    this.id = `rev-${Date.now()}`;
    this.date = config.date || Date.now();
    this.source = config.source; // subscription, one_time, usage, addon
    this.amount = config.amount;
    this.currency = config.currency || 'USD';
    this.customerId = config.customerId;
    this.productId = config.productId;
    this.planId = config.planId;
    this.type = config.type; // new, renewal, upgrade, downgrade, churn
    this.metadata = config.metadata || {};
  }
}

class RevenueReport {
  constructor(config) {
    this.id = `report-${Date.now()}`;
    this.startDate = config.startDate;
    this.endDate = config.endDate;
    this.entries = config.entries || [];
    this.metrics = {};
  }

  calculateMetrics() {
    const total = this.entries.reduce((sum, e) => sum + e.amount, 0);
    const newRevenue = this.entries.filter(e => e.type === 'new').reduce((sum, e) => sum + e.amount, 0);
    const renewalRevenue = this.entries.filter(e => e.type === 'renewal').reduce((sum, e) => sum + e.amount, 0);
    const upgradeRevenue = this.entries.filter(e => e.type === 'upgrade').reduce((sum, e) => sum + e.amount, 0);
    const downgradeRevenue = this.entries.filter(e => e.type === 'downgrade').reduce((sum, e) => sum + e.amount, 0);
    const churnAmount = this.entries.filter(e => e.type === 'churn').reduce((sum, e) => sum + e.amount, 0);

    this.metrics = {
      totalRevenue: total,
      newRevenue,
      renewalRevenue,
      upgradeRevenue,
      downgradeRevenue,
      churnAmount,
      netRevenue: total - churnAmount,
      transactions: this.entries.length
    };

    return this.metrics;
  }
}

class RevenueForecast {
  constructor(config) {
    this.currentMRR = config.currentMRR || 0;
    this.growthRate = config.growthRate || 0.05;
    this.churnRate = config.churnRate || 0.02;
    this.upgradeRate = config.upgradeRate || 0.03;
    this.downgradeRate = config.downgradeRate || 0.01;
  }

  forecast(months = 12) {
    const forecast = [];
    let mrr = this.currentMRR;

    for (let i = 1; i <= months; i++) {
      const newMRR = mrr * this.growthRate;
      const churnedMRR = mrr * this.churnRate;
      const upgradedMRR = mrr * this.upgradeRate;
      const downgradedMRR = mrr * this.downgradeRate;

      mrr = mrr + newMRR - churnedMRR + upgradedMRR - downgradedMRR;

      forecast.push({
        month: i,
        projectedMRR: mrr,
        newBusiness: newMRR,
        churn: churnedMRR,
        expansion: upgradedMRR,
        contraction: downgradedMRR
      });
    }

    return forecast;
  }
}

class RevenueAgent {
  constructor(config = {}) {
    this.entries = new Map();
    this.reports = new Map();
    this.forecasts = [];
    this.stats = {
      totalRevenue: 0,
      mrr: 0,
      arr: 0,
      ltv: 0,
      arpu: 0
    };
  }

  recordRevenue(config) {
    const entry = new RevenueEntry(config);
    this.entries.set(entry.id, entry);
    this.stats.totalRevenue += entry.amount;

    console.log(`   Recorded revenue: $${entry.amount} from ${entry.source}`);
    return entry;
  }

  generateReport(startDate, endDate) {
    const filteredEntries = Array.from(this.entries.values())
      .filter(e => e.date >= startDate && e.date <= endDate);

    const report = new RevenueReport({
      startDate,
      endDate,
      entries: filteredEntries
    });

    report.calculateMetrics();
    this.reports.set(report.id, report);

    console.log(`   Generated report: $${report.metrics.totalRevenue.toFixed(2)} total`);
    return report;
  }

  calculateMRR(customers, plans) {
    let mrr = 0;
    for (const customer of customers) {
      for (const sub of customer.subscriptions) {
        if (sub.status === 'active') {
          mrr += sub.plan.price;
        }
      }
    }

    this.stats.mrr = mrr;
    this.stats.arr = mrr * 12;

    console.log(`   MRR: $${mrr.toFixed(2)} | ARR: $${this.stats.arr.toFixed(2)}`);
    return { mrr, arr: this.stats.arr };
  }

  calculateLTV(arpu, churnRate) {
    if (churnRate > 0) {
      this.stats.ltv = arpu / churnRate;
    } else {
      this.stats.ltv = arpu * 24; // Default to 2 years
    }

    console.log(`   LTV: $${this.stats.ltv.toFixed(2)}`);
    return this.stats.ltv;
  }

  calculateARPU(totalRevenue, activeCustomers) {
    if (activeCustomers > 0) {
      this.stats.arpu = totalRevenue / activeCustomers;
    }

    console.log(`   ARPU: $${this.stats.arpu.toFixed(2)}`);
    return this.stats.arpu;
  }

  forecastRevenue(months = 12) {
    const forecast = new RevenueForecast({
      currentMRR: this.stats.mrr || 10000,
      growthRate: 0.08,
      churnRate: 0.03,
      upgradeRate: 0.05,
      downgradeRate: 0.01
    });

    const result = forecast.forecast(months);
    this.forecasts.push(result);

    console.log(`   Generated ${months}-month forecast`);
    return result;
  }

  calculateMetrics(config = {}) {
    const {
      activeCustomers = 100,
      churnRate = 0.03,
      averageRevenuePerUser = 50
    } = config;

    const metrics = {
      mrr: this.stats.mrr,
      arr: this.stats.arr,
      ltv: this.calculateLTV(averageRevenuePerUser, churnRate),
      arpu: this.stats.arpu,
      nrr: 0,
      pptr: 0
    };

    // Net Revenue Retention
    metrics.nrr = ((metrics.mrr * (1 - churnRate) + metrics.mrr * 0.05) / metrics.mrr) * 100;

    // Expansion Revenue
    metrics.pptr = metrics.mrr * 0.08; // 8% expansion

    return metrics;
  }

  getEntry(entryId) {
    return this.entries.get(entryId);
  }

  getStats() {
    return {
      ...this.stats,
      totalTransactions: this.entries.size,
      reports: this.reports.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new RevenueAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Revenue Demo\n');

    // 1. Record Revenue
    console.log('1. Record Revenue:');
    agent.recordRevenue({
      source: 'subscription',
      amount: 99.99,
      customerId: 'cust-001',
      type: 'new'
    });
    agent.recordRevenue({
      source: 'subscription',
      amount: 49.99,
      customerId: 'cust-002',
      type: 'renewal'
    });
    agent.recordRevenue({
      source: 'addon',
      amount: 25.00,
      customerId: 'cust-003',
      type: 'upgrade'
    });
    agent.recordRevenue({
      source: 'usage',
      amount: 150.00,
      customerId: 'cust-001',
      type: 'new'
    });

    // 2. Generate Report
    console.log('\n2. Generate Report:');
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const report = agent.generateReport(thirtyDaysAgo, now);
    console.log(`   Total Revenue: $${report.metrics.totalRevenue.toFixed(2)}`);
    console.log(`   New Revenue: $${report.metrics.newRevenue.toFixed(2)}`);
    console.log(`   Renewal Revenue: $${report.metrics.renewalRevenue.toFixed(2)}`);
    console.log(`   Churn Amount: $${report.metrics.churnAmount.toFixed(2)}`);

    // 3. Calculate MRR/ARR
    console.log('\n3. Calculate MRR & ARR:');
    const customers = [
      { subscriptions: [{ status: 'active', plan: { price: 29.99 } }] },
      { subscriptions: [{ status: 'active', plan: { price: 99.99 } }] },
      { subscriptions: [{ status: 'active', plan: { price: 19.99 } }] }
    ];
    agent.calculateMRR(customers);

    // 4. Calculate LTV
    console.log('\n4. Calculate Customer LTV:');
    const ltv = agent.calculateLTV(50, 0.05);
    console.log(`   Customer LTV: $${ltv.toFixed(2)}`);

    // 5. Calculate ARPU
    console.log('\n5. Calculate ARPU:');
    const arpu = agent.calculateARPU(10000, 200);
    console.log(`   Average Revenue Per User: $${arpu.toFixed(2)}`);

    // 6. Revenue Forecast
    console.log('\n6. Revenue Forecast:');
    const forecast = agent.forecastRevenue(6);
    console.log('   6-Month Projection:');
    forecast.forEach(f => {
      console.log(`   Month ${f.month}: MRR $${f.projectedMRR.toFixed(2)}`);
    });

    // 7. Comprehensive Metrics
    console.log('\n7. Comprehensive Metrics:');
    const metrics = agent.calculateMetrics({
      activeCustomers: 500,
      churnRate: 0.05,
      averageRevenuePerUser: 75
    });
    console.log(`   MRR: $${metrics.mrr.toFixed(2)}`);
    console.log(`   ARR: $${metrics.arr.toFixed(2)}`);
    console.log(`   LTV: $${metrics.ltv.toFixed(2)}`);
    console.log(`   ARPU: $${metrics.arpu.toFixed(2)}`);
    console.log(`   NRR: ${metrics.nrr.toFixed(1)}%`);

    // 8. Statistics
    console.log('\n8. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total Revenue: $${stats.totalRevenue.toFixed(2)}`);
    console.log(`   Total Transactions: ${stats.totalTransactions}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'report':
    console.log('Generating revenue report...');
    const now2 = Date.now();
    const start = now2 - 30 * 24 * 60 * 60 * 1000;
    const rpt = agent.generateReport(start, now2);
    console.log(`Report: $${rpt.metrics.totalRevenue.toFixed(2)}`);
    break;

  case 'forecast':
    console.log('Forecasting revenue...');
    const fc = agent.forecastRevenue(12);
    console.log(`12-month forecast generated`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-revenue.js [demo|report|forecast]');
}
