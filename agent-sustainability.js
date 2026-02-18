/**
 * Agent Sustainability - Sustainability Management Agent
 *
 * Manages sustainability metrics, ESG reporting, and environmental impact.
 *
 * Usage: node agent-sustainability.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   report  - List reports
 *   list    - List all sustainability data
 */

let metricIdCounter = 0;
let esgIdCounter = 0;
let carbonIdCounter = 0;
let goalIdCounter = 0;
let initiativeIdCounter = 0;

class SustainabilityMetric {
  constructor(config) {
    this.id = `metric-${Date.now()}-${++metricIdCounter}`;
    this.name = config.name;
    this.category = config.category; // energy, water, waste, emissions, social
    this.value = config.value || 0;
    this.unit = config.unit;
    this.target = config.target || 0;
    this.baseline = config.baseline || 0;
    this.period = config.period || 'monthly';
  }

  updateValue(value) {
    this.value = value;
  }

  getProgress() {
    if (this.target === 0) return 0;
    return ((this.value / this.target) * 100).toFixed(2);
  }

  getImprovement() {
    if (this.baseline === 0) return 0;
    return (((this.baseline - this.value) / this.baseline * 100)).toFixed(2);
  }
}

class ESGReport {
  constructor(config) {
    this.id = `esg-${Date.now()}-${++esgIdCounter}`;
    this.name = config.name;
    this.period = config.period; // quarterly, annual
    this.year = config.year;
    this.eScore = config.eScore || 0;
    this.sScore = config.sScore || 0;
    this.gScore = config.gScore || 0;
    this.totalScore = 0;
    this.metrics = [];
    this.status = 'draft'; // draft, submitted, approved
    this.createdAt = Date.now();
  }

  calculateTotal() {
    this.totalScore = (this.eScore + this.sScore + this.gScore) / 3;
  }

  submit() {
    this.status = 'submitted';
  }

  approve() {
    this.status = 'approved';
  }

  addMetric(metric) {
    this.metrics.push(metric);
  }
}

class CarbonFootprint {
  constructor(config) {
    this.id = `carbon-${Date.now()}-${++carbonIdCounter}`;
    this.scope = config.scope; // 1, 2, 3
    this.source = config.source;
    this.emissions = config.emissions || 0; // tCO2e
    this.unit = 'tCO2e';
  }

  calculateFromActivity(activity, factor) {
    this.emissions = activity * factor;
  }
}

class SustainabilityGoal {
  constructor(config) {
    this.id = `goal-${Date.now()}-${++goalIdCounter}`;
    this.name = config.name;
    this.description = config.description;
    this.targetValue = config.targetValue;
    this.currentValue = config.currentValue || 0;
    this.deadline = config.deadline;
    this.status = 'in_progress'; // not_started, in_progress, achieved, missed
    this.category = config.category;
  }

  updateProgress(value) {
    this.currentValue = value;
    if (this.currentValue >= this.targetValue) {
      this.status = 'achieved';
    }
  }

  getProgress() {
    return ((this.currentValue / this.targetValue) * 100).toFixed(2);
  }
}

class Initiative {
  constructor(config) {
    this.id = `initiative-${Date.now()}-${++initiativeIdCounter}`;
    this.name = config.name;
    this.description = config.description;
    this.category = config.category;
    this.impact = config.impact || 0; // estimated reduction
    this.cost = config.cost || 0;
    this.status = 'planned'; // planned, in_progress, completed
    this.startDate = config.startDate;
    this.endDate = config.endDate;
  }

  start() {
    this.status = 'in_progress';
  }

  complete() {
    this.status = 'completed';
  }
}

class SustainabilityAgent {
  constructor(config = {}) {
    this.metrics = new Map();
    this.reports = new Map();
    this.goals = new Map();
    this.initiatives = new Map();
    this.carbonFootprints = new Map();
    this.stats = {
      metricsTracked: 0,
      reportsGenerated: 0,
      goalsAchved: 0,
      carbonReduced: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo metrics
    const metrics = [
      { name: 'Carbon Emissions', category: 'emissions', value: 1250, unit: 'tCO2e', target: 1000, baseline: 1500, period: 'monthly' },
      { name: 'Water Usage', category: 'water', value: 45000, unit: 'gallons', target: 40000, baseline: 55000, period: 'monthly' },
      { name: 'Waste Diverted', category: 'waste', value: 75, unit: '%', target: 80, baseline: 60, period: 'monthly' },
      { name: 'Renewable Energy', category: 'energy', value: 45, unit: '%', target: 60, baseline: 30, period: 'monthly' }
    ];

    metrics.forEach(m => {
      const metric = new SustainabilityMetric(m);
      this.metrics.set(metric.id, metric);
      this.stats.metricsTracked++;
    });

    // Demo goals
    const goals = [
      { name: 'Net Zero 2030', description: 'Achieve net zero emissions by 2030', targetValue: 0, currentValue: 1250, deadline: '2030-01-01', category: 'emissions' },
      { name: 'Zero Waste', description: 'Zero waste to landfill', targetValue: 100, currentValue: 75, deadline: '2025-12-31', category: 'waste' }
    ];

    goals.forEach(g => {
      const goal = new SustainabilityGoal(g);
      this.goals.set(goal.id, goal);
    });

    // Demo initiatives
    const initiatives = [
      { name: 'LED Lighting Upgrade', description: 'Replace all lighting with LED', category: 'energy', impact: 150, cost: 50000 },
      { name: 'Solar Panel Installation', description: 'Install solar on rooftops', category: 'energy', impact: 300, cost: 250000 }
    ];

    initiatives.forEach(i => {
      const initiative = new Initiative(i);
      this.initiatives.set(initiative.id, initiative);
    });
  }

  addMetric(config) {
    const metric = new SustainabilityMetric(config);
    this.metrics.set(metric.id, metric);
    this.stats.metricsTracked++;
    console.log(`   Added metric: ${metric.name}`);
    return metric;
  }

  updateMetric(metricId, value) {
    const metric = this.metrics.get(metricId);
    if (!metric) {
      return { success: false, reason: 'Metric not found' };
    }

    metric.updateValue(value);
    return { success: true, metric };
  }

  createGoal(config) {
    const goal = new SustainabilityGoal(config);
    this.goals.set(goal.id, goal);
    console.log(`   Created goal: ${goal.name}`);
    return goal;
  }

  updateGoalProgress(goalId, value) {
    const goal = this.goals.get(goalId);
    if (!goal) {
      return { success: false, reason: 'Goal not found' };
    }

    goal.updateProgress(value);
    if (goal.status === 'achieved') {
      this.stats.goalsAchved++;
    }

    return { success: true, goal };
  }

  createInitiative(config) {
    const initiative = new Initiative(config);
    this.initiatives.set(initiative.id, initiative);
    console.log(`   Created initiative: ${initiative.name}`);
    return initiative;
  }

  startInitiative(initiativeId) {
    const initiative = this.initiatives.get(initiativeId);
    if (!initiative) {
      return { success: false, reason: 'Initiative not found' };
    }

    initiative.start();
    return { success: true, initiative };
  }

  completeInitiative(initiativeId) {
    const initiative = this.initiatives.get(initiativeId);
    if (!initiative) {
      return { success: false, reason: 'Initiative not found' };
    }

    initiative.complete();
    this.stats.carbonReduced += initiative.impact;
    return { success: true, initiative };
  }

  createReport(config) {
    const report = new ESGReport(config);
    report.calculateTotal();
    this.reports.set(report.id, report);
    this.stats.reportsGenerated++;
    console.log(`   Created ESG report: ${report.name}`);
    return report;
  }

  calculateCarbonFootprint(scope, source, activity, factor) {
    const footprint = new CarbonFootprint({ scope, source });
    footprint.calculateFromActivity(activity, factor);
    this.carbonFootprints.set(footprint.id, footprint);
    return footprint;
  }

  getTotalEmissions() {
    let total = 0;
    this.carbonFootprints.forEach(fp => {
      total += fp.emissions;
    });
    return total;
  }

  getCategoryProgress(category) {
    const categoryMetrics = Array.from(this.metrics.values())
      .filter(m => m.category === category);
    return categoryMetrics.map(m => ({
      name: m.name,
      progress: m.getProgress(),
      improvement: m.getImprovement()
    }));
  }

  listMetrics(category = null) {
    if (category) {
      return Array.from(this.metrics.values()).filter(m => m.category === category);
    }
    return Array.from(this.metrics.values());
  }

  getStats() {
    return {
      ...this.stats,
      goalsActive: Array.from(this.goals.values()).filter(g => g.status === 'in_progress').length,
      initiativesActive: Array.from(this.initiatives.values()).filter(i => i.status === 'in_progress').length,
      totalEmissions: this.getTotalEmissions()
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const sustainability = new SustainabilityAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Sustainability Demo\n');

    // 1. List Metrics
    console.log('1. Sustainability Metrics:');
    const metrics = sustainability.listMetrics();
    metrics.forEach(m => {
      console.log(`   - ${m.name}: ${m.value} ${m.unit} (${m.getProgress()}% of target)`);
    });

    // 2. Add Metric
    console.log('\n2. Add Metric:');
    sustainability.addMetric({
      name: 'Employee Commute',
      category: 'emissions',
      value: 200,
      unit: 'tCO2e',
      target: 150,
      baseline: 250
    });

    // 3. Update Metric
    console.log('\n3. Update Metric:');
    const metric = metrics[0];
    sustainability.updateMetric(metric.id, 1100);
    console.log(`   ${metric.name}: ${metric.value} (${metric.getImprovement()}% improvement)`);

    // 4. Goals
    console.log('\n4. Sustainability Goals:');
    const goals = Array.from(sustainability.goals.values());
    goals.forEach(g => {
      console.log(`   - ${g.name}: ${g.getProgress()}% (${g.status})`);
    });

    // 5. Update Goal
    console.log('\n5. Update Goal Progress:');
    const goal = goals[0];
    sustainability.updateGoalProgress(goal.id, 1000);
    console.log(`   ${goal.name}: ${goal.getProgress()}%`);

    // 6. Initiatives
    console.log('\n6. Initiatives:');
    const initiatives = Array.from(sustainability.initiatives.values());
    initiatives.forEach(i => {
      console.log(`   - ${i.name}: ${i.status} (${i.impact} tCO2e impact)`);
    });

    // 7. Start Initiative
    console.log('\n7. Start Initiative:');
    const initiative = initiatives[0];
    sustainability.startInitiative(initiative.id);
    console.log(`   ${initiative.name}: ${initiative.status}`);

    // 8. Complete Initiative
    console.log('\n8. Complete Initiative:');
    sustainability.completeInitiative(initiative.id);
    console.log(`   ${initiative.name}: ${initiative.status}`);
    console.log(`   Carbon reduced: ${sustainability.stats.carbonReduced} tCO2e`);

    // 9. ESG Report
    console.log('\n9. Create ESG Report:');
    const report = sustainability.createReport({
      name: 'Annual ESG Report 2024',
      period: 'annual',
      year: 2024,
      eScore: 78,
      sScore: 85,
      gScore: 90
    });
    console.log(`   Score: ${report.totalScore.toFixed(1)}/100`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = sustainability.getStats();
    console.log(`   Metrics Tracked: ${stats.metricsTracked}`);
    console.log(`   Reports: ${stats.reportsGenerated}`);
    console.log(`   Goals Achieved: ${stats.goalsAchved}`);
    console.log(`   Carbon Reduced: ${stats.carbonReduced} tCO2e`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'report':
    console.log('ESG Reports:');
    sustainability.reports.forEach(r => {
      console.log(`  ${r.name}: ${r.totalScore.toFixed(1)} [${r.status}]`);
    });
    break;

  case 'list':
    console.log('Sustainability Data:');
    console.log(`Metrics: ${sustainability.metrics.size}`);
    console.log(`Goals: ${sustainability.goals.size}`);
    console.log(`Initiatives: ${sustainability.initiatives.size}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-sustainability.js [demo|report|list]');
}
