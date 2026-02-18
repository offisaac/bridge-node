/**
 * Agent Learn Analytics - Learning Analytics Module
 *
 * Tracks learning metrics and analytics.
 *
 * Usage: node agent-learn-analytics.js [command]
 */

class LearnAnalytics {
  constructor() {
    this.data = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    this.data.set('EMP001', { coursesCompleted: 5, hoursLearned: 42, avgScore: 88, streak: 7 });
    this.data.set('EMP002', { coursesCompleted: 8, hoursLearned: 65, avgScore: 92, streak: 14 });
    this.data.set('EMP003', { coursesCompleted: 2, hoursLearned: 15, avgScore: 75, streak: 3 });
  }

  getAnalytics(employeeId) {
    return this.data.get(employeeId) || { coursesCompleted: 0, hoursLearned: 0, avgScore: 0, streak: 0 };
  }

  getAllAnalytics() {
    return Object.fromEntries(this.data);
  }

  updateMetric(employeeId, metric, value) {
    const d = this.data.get(employeeId) || { coursesCompleted: 0, hoursLearned: 0, avgScore: 0, streak: 0 };
    d[metric] = value;
    this.data.set(employeeId, d);
    return d;
  }
}

function runDemo() {
  console.log('=== Agent Learn Analytics Demo\n');
  const la = new LearnAnalytics();

  console.log('1. All Analytics:');
  Object.entries(la.getAllAnalytics()).forEach(([id, d]) => console.log(`   ${id}: ${d.coursesCompleted} courses, ${d.hoursLearned}h, ${d.avgScore}%`));

  console.log('\n2. Update Metric:');
  la.updateMetric('EMP003', 'coursesCompleted', 3);
  console.log(`   EMP003: ${la.getAnalytics('EMP003').coursesCompleted} courses`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
if ((args[0] || 'demo') === 'demo') runDemo();
