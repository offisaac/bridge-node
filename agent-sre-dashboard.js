/**
 * Agent SRE Dashboard - SRE Dashboard Agent
 *
 * Manages SRE dashboards with SLIs, SLOs, error budgets, and reliability metrics.
 *
 * Usage: node agent-sre-dashboard.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   slos       - List SLO status
 *   services   - List service health
 */

class SLI {
  constructor(config) {
    this.name = config.name;
    this.service = config.service;
    this.type = config.type; // availability, latency, throughput, error
    this.value = config.value;
    this.target = config.target;
    this.unit = config.unit || '%';
  }
}

class SLO {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.service = config.service;
    this.sli = config.sli;
    this.target = config.target; // target percentage
    this.period = config.period || '30d'; // measurement period
    this.errorBudget = config.errorBudget || 100;
    this.consumed = config.consumed || 0;
    this.status = config.status || 'healthy'; // healthy, at-risk, breached
  }
}

class ServiceHealth {
  constructor(config) {
    this.name = config.name;
    this.status = config.status || 'healthy'; // healthy, degraded, down
    this.sli = config.sli || {};
    this.incidents = config.incidents || 0;
    this.uptime = config.uptime || 99.9;
  }
}

class SREDashboard {
  constructor() {
    this.slos = new Map();
    this.services = new Map();
    this.incidents = [];
    this.errorBudgets = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample services
    const services = [
      { name: 'api-gateway', status: 'healthy', uptime: 99.95, incidents: 0, sli: { availability: 99.95, latency: 45 } },
      { name: 'user-service', status: 'healthy', uptime: 99.9, incidents: 1, sli: { availability: 99.9, latency: 32 } },
      { name: 'payment-service', status: 'degraded', uptime: 99.5, incidents: 2, sli: { availability: 99.5, latency: 120 } },
      { name: 'notification-service', status: 'healthy', uptime: 99.98, incidents: 0, sli: { availability: 99.98, latency: 15 } },
      { name: 'search-service', status: 'healthy', uptime: 99.92, incidents: 0, sli: { availability: 99.92, latency: 85 } },
      { name: 'analytics-service', status: 'down', uptime: 98.5, incidents: 3, sli: { availability: 98.5, latency: 500 } }
    ];

    services.forEach(s => {
      const service = new ServiceHealth(s);
      this.services.set(service.name, service);
    });

    // Sample SLOs
    const slos = [
      { name: 'API Gateway Availability', service: 'api-gateway', sli: 'availability', target: 99.9, errorBudget: 0.1, consumed: 0.05, status: 'healthy' },
      { name: 'User Service Latency', service: 'user-service', sli: 'latency', target: 99, errorBudget: 1, consumed: 0.1, status: 'healthy' },
      { name: 'Payment Service Availability', service: 'payment-service', sli: 'availability', target: 99.9, errorBudget: 0.1, consumed: 0.4, status: 'at-risk' },
      { name: 'Notification Service Latency', service: 'notification-service', sli: 'latency', target: 99.5, errorBudget: 0.5, consumed: 0.02, status: 'healthy' },
      { name: 'Search Service Availability', service: 'search-service', sli: 'availability', target: 99.9, errorBudget: 0.1, consumed: 0.08, status: 'healthy' },
      { name: 'Analytics Service Availability', service: 'analytics-service', sli: 'availability', target: 99.9, errorBudget: 0.1, consumed: 1.5, status: 'breached' }
    ];

    slos.forEach(s => {
      const slo = new SLO(s);
      this.slos.set(slo.id, slo);
    });

    // Sample error budgets
    this.errorBudgets.set('api-gateway', { total: 100, consumed: 5, remaining: 95 });
    this.errorBudgets.set('user-service', { total: 100, consumed: 10, remaining: 90 });
    this.errorBudgets.set('payment-service', { total: 100, consumed: 40, remaining: 60 });
    this.errorBudgets.set('analytics-service', { total: 100, consumed: 150, remaining: -50 });

    // Sample incidents affecting SLOs
    this.incidents = [
      { service: 'payment-service', type: 'latency', impact: 0.3, duration: 1800, status: 'resolved' },
      { service: 'analytics-service', type: 'outage', impact: 1.0, duration: 3600, status: 'ongoing' },
      { service: 'user-service', type: 'error', impact: 0.1, duration: 600, status: 'resolved' }
    ];
  }

  // Add SLO
  addSLO(name, service, sliType, target, period = '30d') {
    const slo = new SLO({
      name,
      service,
      sli: sliType,
      target,
      period,
      errorBudget: 100 - target,
      consumed: 0,
      status: 'healthy'
    });
    this.slos.set(slo.id, slo);
    return slo;
  }

  // Get SLOs
  getSLOs(filter = {}) {
    let slos = Array.from(this.slos.values());

    if (filter.service) {
      slos = slos.filter(s => s.service === filter.service);
    }
    if (filter.status) {
      slos = slos.filter(s => s.status === filter.status);
    }

    return slos;
  }

  // Get services
  getServices() {
    return Array.from(this.services.values());
  }

  // Get service health
  getServiceHealth(serviceName) {
    return this.services.get(serviceName) || null;
  }

  // Update SLO status
  updateSLOStatus(sloId, consumed) {
    const slo = this.slos.get(sloId);
    if (!slo) {
      throw new Error(`SLO ${sloId} not found`);
    }

    slo.consumed = consumed;
    const remaining = slo.errorBudget - consumed;

    if (remaining <= 0) {
      slo.status = 'breached';
    } else if (remaining < slo.errorBudget * 0.2) {
      slo.status = 'at-risk';
    } else {
      slo.status = 'healthy';
    }

    // Update error budget
    this.errorBudgets.set(slo.service, {
      total: slo.errorBudget,
      consumed,
      remaining
    });

    return slo;
  }

  // Get error budget
  getErrorBudget(serviceName) {
    return this.errorBudgets.get(serviceName) || null;
  }

  // Get incidents
  getIncidents(filter = {}) {
    let incidents = this.incidents;

    if (filter.service) {
      incidents = incidents.filter(i => i.service === filter.service);
    }
    if (filter.status) {
      incidents = incidents.filter(i => i.status === filter.status);
    }

    return incidents;
  }

  // Get SLO burn rate
  getBurnRate(serviceName) {
    const budget = this.errorBudgets.get(serviceName);
    if (!budget) return null;

    // Simulated burn rate calculation
    const daysInMonth = 30;
    const daysPassed = 17;
    const expectedBurn = budget.total / daysInMonth * daysPassed;
    const burnRate = budget.consumed / expectedBurn;

    return {
      service: serviceName,
      currentBurn: budget.consumed,
      expectedBurn: expectedBurn.toFixed(2),
      burnRate: burnRate.toFixed(2),
      projectedBreach: burnRate > 1 ? 'Yes' : 'No'
    };
  }

  // Get dashboard summary
  getSummary() {
    const slos = Array.from(this.slos.values());
    const services = this.getServices();

    return {
      totalSLOs: slos.length,
      healthySLOs: slos.filter(s => s.status === 'healthy').length,
      atRiskSLOs: slos.filter(s => s.status === 'at-risk').length,
      breachedSLOs: slos.filter(s => s.status === 'breached').length,
      totalServices: services.length,
      healthyServices: services.filter(s => s.status === 'healthy').length,
      degradedServices: services.filter(s => s.status === 'degraded').length,
      downServices: services.filter(s => s.status === 'down').length,
      activeIncidents: this.incidents.filter(i => i.status === 'ongoing').length
    };
  }

  // Get statistics
  getStats() {
    const summary = this.getSummary();
    const services = this.getServices();

    return {
      ...summary,
      avgUptime: services.reduce((sum, s) => sum + s.uptime, 0) / services.length,
      totalIncidents: this.incidents.length,
      errorBudgets: this.errorBudgets.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const dashboard = new SREDashboard();

switch (command) {
  case 'demo':
    console.log('=== Agent SRE Dashboard Demo\n');

    // 1. Get summary
    console.log('1. Dashboard Summary:');
    const summary = dashboard.getSummary();
    console.log(`   SLOs: ${summary.healthySLOs} healthy, ${summary.atRiskSLOs} at-risk, ${summary.breachedSLOs} breached`);
    console.log(`   Services: ${summary.healthyServices} healthy, ${summary.degradedServices} degraded, ${summary.downServices} down`);

    // 2. List SLOs
    console.log('\n2. SLO Status:');
    const slos = dashboard.getSLOs();
    slos.forEach(slo => {
      console.log(`   ${slo.name}: ${slo.status} (${slo.consumed}/${slo.errorBudget}% consumed)`);
    });

    // 3. List services
    console.log('\n3. Service Health:');
    const services = dashboard.getServices();
    services.forEach(s => {
      console.log(`   ${s.name}: ${s.status} (uptime: ${s.uptime}%)`);
    });

    // 4. Error budgets
    console.log('\n4. Error Budgets:');
    dashboard.errorBudgets.forEach((budget, service) => {
      console.log(`   ${service}: ${budget.remaining}% remaining (${budget.consumed}% consumed)`);
    });

    // 5. Burn rate
    console.log('\n5. Burn Rate Analysis:');
    ['api-gateway', 'payment-service', 'analytics-service'].forEach(service => {
      const burn = dashboard.getBurnRate(service);
      if (burn) {
        console.log(`   ${service}: ${burn.burnRate}x (projected breach: ${burn.projectedBreach})`);
      }
    });

    // 6. Incidents
    console.log('\n6. SLO-Breaching Incidents:');
    const incidents = dashboard.getIncidents({ status: 'ongoing' });
    incidents.forEach(i => {
      console.log(`   ${i.service}: ${i.type} (impact: ${i.impact}%, duration: ${i.duration}s)`);
    });

    // 7. Add SLO
    console.log('\n7. Add New SLO:');
    const newSLO = dashboard.addSLO('New Service Latency', 'new-service', 'latency', 99.5);
    console.log(`   Created: ${newSLO.name} (target: ${newSLO.target}%)`);

    // 8. Update SLO
    console.log('\n8. Update SLO Consumption:');
    const sloToUpdate = slos.find(s => s.status === 'at-risk');
    if (sloToUpdate) {
      const updated = dashboard.updateSLOStatus(sloToUpdate.id, 0.45);
      console.log(`   Updated: ${updated.name} - status: ${updated.status}`);
    }

    // 9. Service details
    console.log('\n9. Service Details:');
    const paymentService = dashboard.getServiceHealth('payment-service');
    if (paymentService) {
      console.log(`   ${paymentService.name}:`);
      console.log(`     Status: ${paymentService.status}`);
      console.log(`     Uptime: ${paymentService.uptime}%`);
      console.log(`     Incidents: ${paymentService.incidents}`);
      console.log(`     SLI: ${JSON.stringify(paymentService.sli)}`);
    }

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const stats = dashboard.getStats();
    console.log(`    Total SLOs: ${stats.totalSLOs}`);
    console.log(`    Healthy: ${stats.healthySLOs}, At-Risk: ${stats.atRiskSLOs}, Breached: ${stats.breachedSLOs}`);
    console.log(`    Avg Uptime: ${stats.avgUptime.toFixed(2)}%`);
    console.log(`    Active Incidents: ${stats.activeIncidents}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'slos':
    console.log('SLO Status:');
    dashboard.getSLOs().forEach(slo => {
      console.log(`  ${slo.name}: ${slo.status} (${slo.consumed}/${slo.errorBudget}%)`);
    });
    break;

  case 'services':
    console.log('Service Health:');
    dashboard.getServices().forEach(s => {
      console.log(`  ${s.name}: ${s.status} (${s.uptime}%)`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-sre-dashboard.js [demo|slos|services]');
}
