/**
 * Agent KPI - Key Performance Indicator Tracking Module
 *
 * Manages KPI definitions, data collection, calculation, and reporting
 * for employee and agent performance tracking.
 *
 * Usage: node agent-kpi.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   list    - List KPIs
 *   report  - Generate KPI report
 */

class KPI {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description || '';
    this.category = config.category; // performance, quality, efficiency, growth, custom
    this.unit = config.unit || 'number'; // number, percentage, currency, time
    this.target = config.target; // target value
    this.threshold = config.threshold || {}; // { warning: 80, critical: 50 }
    this.weight = config.weight || 1; // weight in overall score
    this.direction = config.direction || 'higher'; // higher is better, lower is better
    this.frequency = config.frequency || 'monthly'; // daily, weekly, monthly, quarterly
    this.ownerId = config.ownerId || null;
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
    this.isActive = config.isActive !== false;
  }

  calculateScore(actual) {
    if (!actual) return 0;

    if (this.direction === 'higher') {
      return Math.min(100, (actual / this.target) * 100);
    } else {
      return Math.min(100, (this.target / actual) * 100);
    }
  }

  getStatus(actual) {
    if (!actual) return 'no_data';

    const score = this.calculateScore(actual);
    if (score >= 100) return 'exceeded';
    if (score >= (this.threshold?.warning || 80)) return 'on_track';
    if (score >= (this.threshold?.critical || 50)) return 'at_risk';
    return 'critical';
  }
}

class KPIRecord {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.kpiId = config.kpiId;
    this.employeeId = config.employeeId;
    this.period = config.period; // 2026-01, 2026-Q1
    this.actualValue = config.actualValue;
    this.notes = config.notes || '';
    this.recordedBy = config.recordedBy || 'system';
    this.recordedAt = config.recordedAt ? new Date(config.recordedAt) : new Date();
  }
}

class KPIResult {
  constructor(config) {
    this.kpiId = config.kpiId;
    this.kpiName = config.kpiName;
    this.category = config.category;
    this.target = config.target;
    this.actual = config.actual;
    this.previous = config.previous || null;
    this.score = config.score || 0;
    this.status = config.status || 'no_data';
    this.weight = config.weight || 1;
    this.trend = config.trend || 'flat'; // up, down, flat
  }
}

class KPIReport {
  constructor(config) {
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.period = config.period;
    this.results = config.results || [];
    this.overallScore = config.overallScore || 0;
    this.status = config.status || 'no_data';
    this.generatedAt = config.generatedAt ? new Date(config.generatedAt) : new Date();
  }

  calculateOverallScore() {
    if (this.results.length === 0) return 0;

    const totalWeight = this.results.reduce((sum, r) => sum + r.weight, 0);
    const weightedSum = this.results.reduce((sum, r) => sum + (r.score * r.weight), 0);

    return totalWeight > 0 ? (weightedSum / totalWeight).toFixed(2) : 0;
  }

  getStatusBreakdown() {
    const breakdown = {
      exceeded: 0,
      on_track: 0,
      at_risk: 0,
      critical: 0,
      no_data: 0
    };

    this.results.forEach(r => {
      breakdown[r.status] = (breakdown[r.status] || 0) + 1;
    });

    return breakdown;
  }
}

class KPIManager {
  constructor() {
    this.kpis = new Map();
    this.records = new Map();
    this.employees = new Map();

    this._initializeDefaultKPIs();
    this._initializeSampleEmployees();
    this._initializeSampleRecords();
  }

  _initializeDefaultKPIs() {
    const defaultKPIs = [
      // Performance
      { category: 'performance', name: 'Task Completion Rate', description: 'Percentage of assigned tasks completed on time', unit: 'percentage', target: 95, weight: 2 },
      { category: 'performance', name: 'Average Task Duration', description: 'Average time to complete a task (hours)', unit: 'time', target: 4, weight: 1.5, direction: 'lower' },
      { category: 'performance', name: 'Throughput', description: 'Number of tasks completed per week', unit: 'number', target: 20, weight: 1.5 },

      // Quality
      { category: 'quality', name: 'First Pass Quality', description: 'Percentage of work delivered without revisions', unit: 'percentage', target: 90, weight: 2 },
      { category: 'quality', name: 'Error Rate', description: 'Number of errors per 100 tasks', unit: 'percentage', target: 2, weight: 1.5, direction: 'lower' },
      { category: 'quality', name: 'Client Satisfaction', description: 'Average satisfaction score from stakeholders', unit: 'number', target: 4.5, weight: 2 },

      // Efficiency
      { category: 'efficiency', name: 'Resource Utilization', description: 'Percentage of available time spent on productive work', unit: 'percentage', target: 85, weight: 1.5 },
      { category: 'efficiency', name: 'Cost per Task', description: 'Average cost to complete a task', unit: 'currency', target: 50, weight: 1, direction: 'lower' },
      { category: 'efficiency', name: 'Automation Coverage', description: 'Percentage of tasks automated', unit: 'percentage', target: 40, weight: 1 },

      // Growth
      { category: 'growth', name: 'Skill Development', description: 'Number of new skills acquired this quarter', unit: 'number', target: 3, weight: 1 },
      { category: 'growth', name: 'Knowledge Sharing', description: 'Number of knowledge sharing sessions conducted', unit: 'number', target: 4, weight: 0.5 },
      { category: 'growth', name: 'Peer Review Contributions', description: 'Number of peer reviews completed', unit: 'number', target: 10, weight: 0.5 }
    ];

    defaultKPIs.forEach((kpi, i) => {
      const kpiObj = new KPI({ ...kpi, id: `kpi-${i + 1}` });
      this.kpis.set(kpiObj.id, kpiObj);
    });
  }

  _initializeSampleEmployees() {
    const employees = [
      { id: 'EMP001', name: 'Alice Johnson', department: 'Engineering', title: 'Senior Engineer' },
      { id: 'EMP002', name: 'Bob Williams', department: 'Engineering', title: 'Team Lead' },
      { id: 'EMP003', name: 'Carol Davis', department: 'Sales', title: 'Account Executive' },
      { id: 'EMP004', name: 'David Brown', department: 'Engineering', title: 'Engineer' },
      { id: 'EMP005', name: 'Eva Martinez', department: 'HR', title: 'HR Manager' }
    ];
    employees.forEach(e => this.employees.set(e.id, e));
  }

  _initializeSampleRecords() {
    const activeKPIs = Array.from(this.kpis.values()).filter(k => k.isActive);
    const period = '2026-01';

    // Sample records for Alice (EMP001)
    activeKPIs.slice(0, 6).forEach((kpi, i) => {
      const actual = this._generateSampleValue(kpi, i);
      this.records.set(crypto.randomUUID(), new KPIRecord({
        kpiId: kpi.id,
        employeeId: 'EMP001',
        period,
        actualValue: actual,
        notes: `Performance data for ${period}`
      }));
    });

    // Sample records for Bob (EMP002)
    activeKPIs.slice(0, 6).forEach((kpi, i) => {
      const actual = this._generateSampleValue(kpi, i, true);
      this.records.set(crypto.randomUUID(), new KPIRecord({
        kpiId: kpi.id,
        employeeId: 'EMP002',
        period,
        actualValue: actual,
        notes: `Performance data for ${period}`
      }));
    });
  }

  _generateSampleValue(kpi, index, higherIsBetter = true) {
    // Generate realistic sample values based on KPI type
    const variance = higherIsBetter ? 0.9 + Math.random() * 0.3 : 1 + Math.random() * 0.2;
    const baseValue = kpi.target * variance;

    switch (kpi.unit) {
      case 'percentage':
        return Math.min(100, Math.round(baseValue));
      case 'currency':
        return Math.round(baseValue * 100) / 100;
      case 'time':
        return Math.round(baseValue * 100) / 100;
      default:
        return Math.round(baseValue * 10) / 10;
    }
  }

  createKPI(config) {
    const kpi = new KPI(config);
    this.kpis.set(kpi.id, kpi);
    return kpi;
  }

  getKPI(kpiId) {
    return this.kpis.get(kpiId);
  }

  listKPIs(category = null, activeOnly = true) {
    let results = Array.from(this.kpis.values());

    if (activeOnly) {
      results = results.filter(k => k.isActive);
    }

    if (category) {
      results = results.filter(k => k.category === category);
    }

    return results;
  }

  recordKPI(kpiId, employeeId, period, actualValue, notes = '') {
    const kpi = this.kpis.get(kpiId);
    if (!kpi) throw new Error('KPI not found');

    const record = new KPIRecord({
      kpiId,
      employeeId,
      period,
      actualValue,
      notes
    });

    this.records.set(record.id, record);
    return record;
  }

  getRecords(employeeId = null, kpiId = null, period = null) {
    let results = Array.from(this.records.values());

    if (employeeId) {
      results = results.filter(r => r.employeeId === employeeId);
    }

    if (kpiId) {
      results = results.filter(r => r.kpiId === kpiId);
    }

    if (period) {
      results = results.filter(r => r.period === period);
    }

    return results;
  }

  getKPIsByCategory() {
    const categories = {};
    this.kpis.forEach(kpi => {
      if (!categories[kpi.category]) {
        categories[kpi.category] = [];
      }
      categories[kpi.category].push(kpi);
    });
    return categories;
  }

  generateReport(employeeId, period) {
    const employee = this.employees.get(employeeId);
    if (!employee) throw new Error('Employee not found');

    const records = this.getRecords(employeeId, null, period);
    const kpis = this.listKPIs();

    const results = kpis.map(kpi => {
      const record = records.find(r => r.kpiId === kpi.id);
      const actual = record?.actualValue || null;
      const score = kpi.calculateScore(actual);
      const status = kpi.getStatus(actual);

      // Calculate trend (simplified - would need historical data for real trend)
      const trend = 'flat';

      return new KPIResult({
        kpiId: kpi.id,
        kpiName: kpi.name,
        category: kpi.category,
        target: kpi.target,
        actual,
        score,
        status,
        weight: kpi.weight,
        trend
      });
    });

    const report = new KPIReport({
      employeeId,
      employeeName: employee.name,
      period,
      results
    });

    report.overallScore = report.calculateOverallScore();

    // Determine overall status
    if (report.overallScore >= 100) report.status = 'exceeded';
    else if (report.overallScore >= 80) report.status = 'on_track';
    else if (report.overallScore >= 50) report.status = 'at_risk';
    else report.status = 'critical';

    return report;
  }

  getEmployeeList() {
    return Array.from(this.employees.values());
  }

  getKPIStatistics(period) {
    const allRecords = Array.from(this.records.values())
      .filter(r => r.period === period);

    const stats = {
      period,
      totalKPIs: this.listKPIs().length,
      totalRecords: allRecords.length,
      coverage: 0,
      avgScore: 0,
      byCategory: {}
    };

    if (stats.totalKPIs > 0) {
      stats.coverage = Math.round((allRecords.length / stats.totalKPIs) * 100);
    }

    // Calculate average score by category
    const kpis = this.listKPIs();
    let totalScore = 0;
    let scoredCount = 0;

    kpis.forEach(kpi => {
      const record = allRecords.find(r => r.kpiId === kpi.id);
      if (record) {
        const score = kpi.calculateScore(record.actualValue);
        totalScore += score;
        scoredCount++;

        if (!stats.byCategory[kpi.category]) {
          stats.byCategory[kpi.category] = { count: 0, totalScore: 0 };
        }
        stats.byCategory[kpi.category].count++;
        stats.byCategory[kpi.category].totalScore += score;
      }
    });

    // Calculate category averages
    Object.keys(stats.byCategory).forEach(cat => {
      const catStats = stats.byCategory[cat];
      catStats.average = catStats.count > 0
        ? (catStats.totalScore / catStats.count).toFixed(2)
        : 0;
    });

    stats.avgScore = scoredCount > 0
      ? (totalScore / scoredCount).toFixed(2)
      : 0;

    return stats;
  }

  getTrendingKPIs(period) {
    const records = Array.from(this.records.values())
      .filter(r => r.period === period);

    const trending = [];

    this.kpis.forEach(kpi => {
      const record = records.find(r => r.kpiId === kpi.id);
      if (record) {
        trending.push({
          id: kpi.id,
          name: kpi.name,
          category: kpi.category,
          target: kpi.target,
          actual: record.actualValue,
          score: kpi.calculateScore(record.actualValue),
          status: kpi.getStatus(record.actualValue)
        });
      }
    });

    return trending.sort((a, b) => b.score - a.score);
  }
}

// Demo function
function runDemo() {
  console.log('=== Agent KPI Demo\n');

  const manager = new KPIManager();

  // 1. List employees
  console.log('1. Employees:');
  manager.getEmployeeList().forEach(emp => {
    console.log(`   ${emp.id}: ${emp.name} - ${emp.title} (${emp.department})`);
  });

  // 2. List KPIs by category
  console.log('\n2. KPIs by Category:');
  const kpisByCategory = manager.getKPIsByCategory();
  Object.entries(kpisByCategory).forEach(([category, kpis]) => {
    console.log(`   ${category} (${kpis.length} KPIs):`);
    kpis.forEach(kpi => {
      console.log(`      - ${kpi.name}: target=${kpi.target}${kpi.unit === 'percentage' ? '%' : ''} (weight: ${kpi.weight})`);
    });
  });

  // 3. KPI score examples
  console.log('\n3. KPI Score Calculation Examples:');
  const sampleKPIs = manager.listKPIs().slice(0, 3);
  sampleKPIs.forEach(kpi => {
    const actual = kpi.target * 0.85;
    const score = kpi.calculateScore(actual);
    const status = kpi.getStatus(actual);
    console.log(`   ${kpi.name}: target=${kpi.target}, actual=${actual}, score=${score.toFixed(1)}%, status=${status}`);
  });

  // 4. Record new KPI data
  console.log('\n4. Record New KPI Data:');
  const newKPI = manager.listKPIs()[0];
  const record = manager.recordKPI(
    newKPI.id,
    'EMP003',
    '2026-02',
    newKPI.target * 1.1,
    'Exceeded target this month'
  );
  console.log(`   Recorded: ${newKPI.name} = ${newKPI.target * 1.1} for EMP003`);
  console.log(`   Record ID: ${record.id}`);

  // 5. Generate employee report
  console.log('\n5. Generate KPI Report:');
  const report = manager.generateReport('EMP001', '2026-01');
  console.log(`   Employee: ${report.employeeName}`);
  console.log(`   Period: ${report.period}`);
  console.log(`   Overall Score: ${report.overallScore}%`);
  console.log(`   Status: ${report.status}`);

  // 6. KPI results breakdown
  console.log('\n6. KPI Results Breakdown:');
  const breakdown = report.getStatusBreakdown();
  console.log(`   Exceeded (${report.results.filter(r => r.status === 'exceeded').length}): ${report.results.filter(r => r.status === 'exceeded').map(r => r.kpiName).join(', ') || 'None'}`);
  console.log(`   On Track (${report.results.filter(r => r.status === 'on_track').length}): ${report.results.filter(r => r.status === 'on_track').map(r => r.kpiName).join(', ') || 'None'}`);
  console.log(`   At Risk (${report.results.filter(r => r.status === 'at_risk').length}): ${report.results.filter(r => r.status === 'at_risk').map(r => r.kpiName).join(', ') || 'None'}`);
  console.log(`   Critical (${report.results.filter(r => r.status === 'critical').length}): ${report.results.filter(r => r.status === 'critical').map(r => r.kpiName).join(', ') || 'None'}`);

  // 7. KPI Statistics
  console.log('\n7. KPI Statistics:');
  const stats = manager.getKPIStatistics('2026-01');
  console.log(`   Period: ${stats.period}`);
  console.log(`   Total KPIs: ${stats.totalKPIs}`);
  console.log(`   Records: ${stats.totalRecords}`);
  console.log(`   Coverage: ${stats.coverage}%`);
  console.log(`   Average Score: ${stats.avgScore}%`);
  console.log(`   By Category:`);
  Object.entries(stats.byCategory).forEach(([cat, data]) => {
    console.log(`      ${cat}: ${data.average}% (${data.count} KPIs)`);
  });

  // 8. Trending KPIs
  console.log('\n8. Top Performing KPIs:');
  const trending = manager.getTrendingKPIs('2026-01').slice(0, 5);
  trending.forEach((kpi, i) => {
    console.log(`   ${i + 1}. ${kpi.name}: ${kpi.score.toFixed(1)}% (${kpi.status})`);
  });

  // 9. Generate report for another employee
  console.log('\n9. Another Employee Report:');
  const report2 = manager.generateReport('EMP002', '2026-01');
  console.log(`   Employee: ${report2.employeeName}`);
  console.log(`   Overall Score: ${report2.overallScore}%`);
  console.log(`   Status: ${report2.status}`);

  // 10. List all active KPIs
  console.log('\n10. All Active KPIs:');
  manager.listKPIs().forEach(kpi => {
    console.log(`    ${kpi.id}: ${kpi.name} [${kpi.category}]`);
  });

  console.log('\n=== Demo Complete ===');
}

// CLI handler
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const manager = new KPIManager();

switch (command) {
  case 'demo':
    runDemo();
    break;

  case 'list':
    console.log('KPI Categories:\n');
    const categories = manager.getKPIsByCategory();
    Object.entries(categories).forEach(([category, kpis]) => {
      console.log(`## ${category} (${kpis.length})`);
      kpis.forEach(kpi => {
        console.log(`  - ${kpi.name}: target=${kpi.target}${kpi.unit === 'percentage' ? '%' : ''}`);
      });
      console.log('');
    });
    break;

  case 'report':
    const period = args[1] || '2026-01';
    console.log(`KPI Report for Period: ${period}\n`);

    manager.getEmployeeList().forEach(emp => {
      try {
        const report = manager.generateReport(emp.id, period);
        console.log(`${report.employeeName} [${report.period}]:`);
        console.log(`  Overall Score: ${report.overallScore}% (${report.status})`);
        console.log('');
      } catch (e) {
        // Skip employees with no data
      }
    });
    break;

  default:
    console.log('Usage: node agent-kpi.js [command]');
    console.log('Commands:');
    console.log('  demo        - Run demonstration');
    console.log('  list        - List KPIs by category');
    console.log('  report [period] - Generate KPI report');
}
