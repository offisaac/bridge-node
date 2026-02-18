/**
 * Agent Capacity Planner - Capacity Planning Agent
 *
 * Manages capacity planning, resource forecasting, and scaling recommendations.
 *
 * Usage: node agent-capacity-planner.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   plans      - List capacity plans
 *   forecast   - Show resource forecasts
 */

class ResourceMetric {
  constructor(config) {
    this.name = config.name;
    this.value = config.value;
    this.unit = config.unit || '';
    this.timestamp = config.timestamp || new Date().toISOString();
  }
}

class CapacityPlan {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.service = config.service;
    this.current = config.current || {};
    this.projected = config.projected || {};
    this.recommendations = config.recommendations || [];
    this.horizon = config.horizon || '3months'; // 1month, 3months, 6months, 1year
    this.createdAt = config.createdAt || new Date().toISOString();
  }
}

class CapacityPlanner {
  constructor() {
    this.plans = new Map();
    this.metrics = new Map();
    this.forecasts = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample capacity plans
    const plans = [
      {
        name: 'API Gateway Capacity 2026',
        service: 'api-gateway',
        current: { cpu: '8 cores', memory: '16 GiB', requests: '100K RPM' },
        projected: { cpu: '16 cores', memory: '32 GiB', requests: '200K RPM' },
        recommendations: ['Increase CPU by 100%', 'Double memory allocation', 'Enable auto-scaling'],
        horizon: '3months'
      },
      {
        name: 'Database Cluster Q2',
        service: 'postgres-main',
        current: { cpu: '16 cores', memory: '64 GiB', storage: '500 GiB' },
        projected: { cpu: '24 cores', memory: '128 GiB', storage: '1 TiB' },
        recommendations: ['Add read replica', 'Upgrade storage', 'Increase memory'],
        horizon: '6months'
      },
      {
        name: 'Cache Layer Expansion',
        service: 'redis-cache',
        current: { memory: '32 GiB', connections: '10K' },
        projected: { memory: '64 GiB', connections: '25K' },
        recommendations: ['Double cache size', 'Enable clustering', 'Review eviction policy'],
        horizon: '3months'
      },
      {
        name: 'Message Queue Growth',
        service: 'kafka-cluster',
        current: { brokers: 3, storage: '10 TiB', throughput: '100K msg/s' },
        projected: { brokers: 5, storage: '25 TiB', throughput: '250K msg/s' },
        recommendations: ['Add 2 brokers', 'Increase storage 2.5x', 'Optimize partition count'],
        horizon: '6months'
      }
    ];

    plans.forEach(p => {
      const plan = new CapacityPlan(p);
      this.plans.set(plan.id, plan);
    });

    // Sample historical metrics
    const metrics = {
      'api-gateway': [
        { name: 'cpu_usage', value: 65, unit: '%', timestamp: '2026-01-01' },
        { name: 'cpu_usage', value: 70, unit: '%', timestamp: '2026-02-01' },
        { name: 'cpu_usage', value: 75, unit: '%', timestamp: '2026-02-15' },
        { name: 'memory_usage', value: 60, unit: '%', timestamp: '2026-01-01' },
        { name: 'memory_usage', value: 65, unit: '%', timestamp: '2026-02-01' },
        { name: 'memory_usage', value: 72, unit: '%', timestamp: '2026-02-15' }
      ],
      'postgres-main': [
        { name: 'cpu_usage', value: 45, unit: '%', timestamp: '2026-01-01' },
        { name: 'cpu_usage', value: 55, unit: '%', timestamp: '2026-02-01' },
        { name: 'storage_usage', value: 40, unit: '%', timestamp: '2026-01-01' },
        { name: 'storage_usage', value: 50, unit: '%', timestamp: '2026-02-01' }
      ]
    };

    Object.entries(metrics).forEach(([service, metricsList]) => {
      this.metrics.set(service, metricsList);
    });

    // Sample forecasts
    this.forecasts.set('api-gateway', {
      cpu: { current: 75, '1month': 82, '3months': 95, '6months': 120 },
      memory: { current: 72, '1month': 78, '3months': 88, '6months': 105 },
      requests: { current: 100, '1month': 115, '3months': 140, '6months': 200 }
    });

    this.forecasts.set('postgres-main', {
      cpu: { current: 55, '1month': 60, '3months': 70, '6months': 85 },
      storage: { current: 50, '1month': 55, '3months': 65, '6months': 80 }
    });
  }

  // Create capacity plan
  createPlan(name, service, current, projected, recommendations, horizon = '3months') {
    const plan = new CapacityPlan({
      name,
      service,
      current,
      projected,
      recommendations,
      horizon
    });
    this.plans.set(plan.id, plan);
    return plan;
  }

  // Get plans
  getPlans(filter = {}) {
    let plans = Array.from(this.plans.values());

    if (filter.service) {
      plans = plans.filter(p => p.service === filter.service);
    }
    if (filter.horizon) {
      plans = plans.filter(p => p.horizon === filter.horizon);
    }

    return plans;
  }

  // Get plan
  getPlan(planId) {
    return this.plans.get(planId) || null;
  }

  // Update plan
  updatePlan(planId, updates) {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan ${planId} not found`);
    }
    Object.assign(plan, updates);
    return plan;
  }

  // Delete plan
  deletePlan(planId) {
    return this.plans.delete(planId);
  }

  // Get forecast
  getForecast(service) {
    return this.forecasts.get(service) || null;
  }

  // Add metric
  addMetric(service, name, value, unit = '') {
    if (!this.metrics.has(service)) {
      this.metrics.set(service, []);
    }

    const metric = { name, value, unit, timestamp: new Date().toISOString() };
    this.metrics.get(service).push(metric);
    return metric;
  }

  // Get metrics
  getMetrics(service) {
    return this.metrics.get(service) || [];
  }

  // Calculate growth rate
  calculateGrowthRate(service, metricName) {
    const serviceMetrics = this.metrics.get(service) || [];
    const metricHistory = serviceMetrics.filter(m => m.name === metricName);

    if (metricHistory.length < 2) return 0;

    const oldest = metricHistory[0].value;
    const newest = metricHistory[metricHistory.length - 1].value;

    return ((newest - oldest) / oldest * 100).toFixed(2);
  }

  // Get scaling recommendations
  getRecommendations(service) {
    const forecast = this.forecasts.get(service);
    const recommendations = [];

    if (!forecast) {
      return ['No forecast data available'];
    }

    // Analyze forecast and generate recommendations
    Object.entries(forecast).forEach(([resource, values]) => {
      if (values['3months'] > 100) {
        recommendations.push(`Scale ${resource} by ${Math.round(values['3months'] - 100)}% before 3 months`);
      }
    });

    if (recommendations.length === 0) {
      recommendations.push('Current capacity is sufficient for projected growth');
    }

    return recommendations;
  }

  // Get statistics
  getStats() {
    const plans = Array.from(this.plans.values());

    return {
      totalPlans: plans.length,
      byHorizon: {
        '1month': plans.filter(p => p.horizon === '1month').length,
        '3months': plans.filter(p => p.horizon === '3months').length,
        '6months': plans.filter(p => p.horizon === '6months').length,
        '1year': plans.filter(p => p.horizon === '1year').length
      },
      servicesCovered: [...new Set(plans.map(p => p.service))].length,
      totalRecommendations: plans.reduce((sum, p) => sum + p.recommendations.length, 0),
      forecastsAvailable: this.forecasts.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const planner = new CapacityPlanner();

switch (command) {
  case 'demo':
    console.log('=== Agent Capacity Planner Demo\n');

    // 1. List plans
    console.log('1. Capacity Plans:');
    const plans = planner.getPlans();
    console.log(`   Total: ${plans.length}`);
    plans.forEach(p => {
      console.log(`   - ${p.name}: ${p.service} (${p.horizon})`);
    });

    // 2. Get forecasts
    console.log('\n2. Resource Forecasts:');
    planner.forecasts.forEach((forecast, service) => {
      console.log(`   ${service}:`);
      Object.entries(forecast).forEach(([resource, values]) => {
        console.log(`     ${resource}: current=${values.current}% -> 3months=${values['3months']}%`);
      });
    });

    // 3. Growth rates
    console.log('\n3. Growth Rates:');
    const growthCPU = planner.calculateGrowthRate('api-gateway', 'cpu_usage');
    const growthMem = planner.calculateGrowthRate('api-gateway', 'memory_usage');
    console.log(`   API Gateway CPU: ${growthCPU}%`);
    console.log(`   API Gateway Memory: ${growthMem}%`);

    // 4. Recommendations
    console.log('\n4. Scaling Recommendations:');
    ['api-gateway', 'postgres-main'].forEach(service => {
      const recs = planner.getRecommendations(service);
      console.log(`   ${service}:`);
      recs.forEach(r => console.log(`     - ${r}`));
    });

    // 5. Get plan details
    console.log('\n5. Plan Details:');
    const firstPlan = plans[0];
    if (firstPlan) {
      console.log(`   Plan: ${firstPlan.name}`);
      console.log(`   Service: ${firstPlan.service}`);
      console.log(`   Current: ${JSON.stringify(firstPlan.current)}`);
      console.log(`   Projected: ${JSON.stringify(firstPlan.projected)}`);
      console.log(`   Recommendations:`);
      firstPlan.recommendations.forEach(r => console.log(`     - ${r}`));
    }

    // 6. Create new plan
    console.log('\n6. Create New Plan:');
    const newPlan = planner.createPlan(
      'New Service Capacity',
      'new-service',
      { cpu: '4 cores', memory: '8 GiB' },
      { cpu: '8 cores', memory: '16 GiB' },
      ['Double CPU allocation', 'Double memory'],
      '3months'
    );
    console.log(`   Created: ${newPlan.name}`);

    // 7. Add metrics
    console.log('\n7. Add Metrics:');
    const newMetric = planner.addMetric('new-service', 'cpu_usage', 50, '%');
    console.log(`   Added: cpu_usage = ${newMetric.value}%`);

    // 8. Get metrics
    console.log('\n8. Historical Metrics:');
    const metrics = planner.getMetrics('api-gateway');
    console.log(`   API Gateway: ${metrics.length} data points`);
    metrics.slice(0, 3).forEach(m => {
      console.log(`     ${m.name}: ${m.value}${m.unit} (${m.timestamp})`);
    });

    // 9. Forecast analysis
    console.log('\n9. Forecast Analysis:');
    const forecast = planner.getForecast('api-gateway');
    if (forecast) {
      console.log(`   CPU forecast:`);
      Object.entries(forecast.cpu).forEach(([period, value]) => {
        const status = value > 100 ? '(OVER)' : '';
        console.log(`     ${period}: ${value}% ${status}`);
      });
    }

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const stats = planner.getStats();
    console.log(`    Total plans: ${stats.totalPlans}`);
    console.log(`    Services covered: ${stats.servicesCovered}`);
    console.log(`    By horizon: 1m=${stats.byHorizon['1month']}, 3m=${stats.byHorizon['3months']}, 6m=${stats.byHorizon['6months']}`);
    console.log(`    Total recommendations: ${stats.totalRecommendations}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'plans':
    console.log('Capacity Plans:');
    planner.getPlans().forEach(p => {
      console.log(`  ${p.name}: ${p.service} (${p.horizon})`);
    });
    break;

  case 'forecast':
    console.log('Resource Forecasts:');
    planner.forecasts.forEach((forecast, service) => {
      console.log(`  ${service}:`);
      Object.entries(forecast).forEach(([resource, values]) => {
        console.log(`    ${resource}: ${values.current}% -> ${values['3months']}% (3 months)`);
      });
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-capacity-planner.js [demo|plans|forecast]');
}
