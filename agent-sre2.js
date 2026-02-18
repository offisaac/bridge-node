/**
 * Agent SRE2 - Site Reliability Engineering Agent
 *
 * Provides SRE and reliability engineering capabilities.
 *
 * Usage: node agent-sre2.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   slos       - List SLOs
 *   analyze    - Analyze system reliability
 */

class ServiceLevelObjective {
  constructor(config) {
    this.id = `slo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.target = config.target; // percentage
    this.window = config.window; // rolling time window
    this.errorBudget = config.errorBudget;
  }
}

class Incident {
  constructor(config) {
    this.id = `inc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.title = config.title;
    this.severity = config.severity; // sev1, sev2, sev3
    this.status = config.status; // open, investigating, resolved
    this.mttr = config.mttr; // mean time to resolve (minutes)
  }
}

class Alert {
  constructor(config) {
    this.id = `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.metric = config.metric;
    this.threshold = config.threshold;
    this.severity = config.severity;
  }
}

class SREAgent2 {
  constructor(config = {}) {
    this.name = config.name || 'SREAgent2';
    this.version = config.version || '1.0';
    this.slos = new Map();
    this.incidents = new Map();
    this.alerts = new Map();
    this.stats = {
      slosDefined: 0,
      incidentsResolved: 0,
      alertsConfigured: 0
    };
    this.initSLOs();
    this.initAlerts();
  }

  initSLOs() {
    const slos = [
      new ServiceLevelObjective({ name: 'API Availability', target: 99.9, window: '30d', errorBudget: '43.8m' }),
      new ServiceLevelObjective({ name: 'API Latency p99', target: 99.0, window: '7d', errorBudget: '10.1m' }),
      new ServiceLevelObjective({ name: 'Error Rate', target: 99.5, window: '24h', errorBudget: '7.2m' }),
      new ServiceLevelObjective({ name: 'Uptime', target: 99.99, window: '30d', errorBudget: '4.4m' })
    ];
    slos.forEach(s => this.slos.set(s.name, s));
  }

  initAlerts() {
    const alerts = [
      new Alert({ name: 'High Error Rate', metric: 'error_rate', threshold: '>5%', severity: 'critical' }),
      new Alert({ name: 'High Latency', metric: 'latency_p99', threshold: '>2s', severity: 'warning' }),
      new Alert({ name: 'CPU Usage', metric: 'cpu_usage', threshold: '>80%', severity: 'warning' }),
      new Alert({ name: 'Memory Usage', metric: 'memory_usage', threshold: '>90%', severity: 'critical' })
    ];
    alerts.forEach(a => this.alerts.set(a.name, a));
  }

  createSLO(name, target, window, errorBudget) {
    const slo = new ServiceLevelObjective({ name, target, window, errorBudget });
    this.slos.set(slo.name, slo);
    this.stats.slosDefined++;
    return slo;
  }

  createIncident(title, severity, status, mttr) {
    const incident = new Incident({ title, severity, status, mttr });
    this.incidents.set(incident.id, incident);
    if (status === 'resolved') {
      this.stats.incidentsResolved++;
    }
    return incident;
  }

  configureAlert(name, metric, threshold, severity) {
    const alert = new Alert({ name, metric, threshold, severity });
    this.alerts.set(alert.name, alert);
    this.stats.alertsConfigured++;
    return alert;
  }

  calculateErrorBudget(sloName) {
    const slo = this.slos.get(sloName);
    if (!slo) return null;

    const windowMinutes = this.parseWindow(slo.window);
    const allowedDowntime = (100 - slo.target) / 100 * windowMinutes;

    return {
      slo: slo.name,
      target: `${slo.target}%`,
      window: slo.window,
      allowedDowntime: `${allowedDowntime.toFixed(2)} minutes`,
      errorBudget: slo.errorBudget
    };
  }

  parseWindow(window) {
    const match = window.match(/(\d+)([dh])/);
    if (!match) return 0;
    const value = parseInt(match[1]);
    const unit = match[2];
    return unit === 'h' ? value * 60 : value * 24 * 60;
  }

  listSLOs() {
    return Array.from(this.slos.values());
  }

  listIncidents() {
    return Array.from(this.incidents.values());
  }

  listAlerts() {
    return Array.from(this.alerts.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const sre = new SREAgent2();

switch (command) {
  case 'demo': {
    console.log('=== Agent SRE2 Demo\n');

    // 1. SLOs
    console.log('1. Service Level Objectives:');
    const slos = sre.listSLOs();
    slos.forEach(slo => {
      console.log(`   ${slo.name}: ${slo.target}% (${slo.window}), budget: ${slo.errorBudget}`);
    });

    // 2. Error Budget
    console.log('\n2. Error Budget Calculation:');
    const budget = sre.calculateErrorBudget('API Availability');
    console.log(`   ${budget.slo}:`);
    console.log(`   Target: ${budget.target}`);
    console.log(`   Window: ${budget.window}`);
    console.log(`   Allowed Downtime: ${budget.allowedDowntime}`);

    // 3. Incidents
    console.log('\n3. Incident Management:');
    const inc1 = sre.createIncident('Database connection timeout', 'sev1', 'resolved', 45);
    console.log(`   Incident: ${inc1.title}`);
    console.log(`   Severity: ${inc1.severity}`);
    console.log(`   Status: ${inc1.status}`);
    console.log(`   MTTR: ${inc1.mttr} minutes`);

    const inc2 = sre.createIncident('API latency spike', 'sev2', 'open', null);
    console.log(`   Incident: ${inc2.title}`);
    console.log(`   Severity: ${inc2.severity}`);
    console.log(`   Status: ${inc2.status}`);

    // 4. Alerts
    console.log('\n4. Alert Configuration:');
    const alerts = sre.listAlerts();
    alerts.slice(0, 3).forEach(alert => {
      console.log(`   ${alert.name}: ${alert.metric} ${alert.threshold} [${alert.severity}]`);
    });

    // 5. Reliability Engineering
    console.log('\n5. Reliability Engineering Practices:');
    console.log(`   Toil Reduction: Automate manual operational tasks`);
    console.log(`   SRE Principles: Error budgets, SLIs, SLOs, SLAs`);
    console.log(`   Observability: Metrics, logs, traces (the three pillars)`);
    console.log(`   Incident Management: Runbooks, post-mortems, blameless culture`);
    console.log(`   Capacity Planning: Forecasting, scaling, cost optimization`);

    // 6. Monitoring Stack
    console.log('\n6. Monitoring & Observability:');
    console.log(`   Prometheus: Metrics collection & querying`);
    console.log(`   Grafana: Visualization & dashboards`);
    console.log(`   Jaeger/Zipkin: Distributed tracing`);
    console.log(`   ELK Stack: Log aggregation & analysis`);
    console.log(`   PagerDuty: Incident alerting & on-call`);

    // 7. On-Call Practices
    console.log('\n7. On-Call Best Practices:');
    console.log(`   Clear escalation paths and runbooks`);
    console.log(`   Fair rotation schedules`);
    console.log(`   Appropriate alert thresholds (reduce noise)`);
    console.log(`   Post-incident reviews and learning`);
    console.log(`   Psychological safety and blameless culture`);

    // 8. Statistics
    console.log('\n8. Statistics:');
    const stats = sre.getStats();
    console.log(`   SLOs defined: ${stats.slosDefined}`);
    console.log(`   Incidents resolved: ${stats.incidentsResolved}`);
    console.log(`   Alerts configured: ${stats.alertsConfigured}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'slos': {
    console.log('Service Level Objectives:');
    const slos = sre.listSLOs();
    slos.forEach(slo => {
      console.log(`  ${slo.name}: ${slo.target}% over ${slo.window}`);
    });
    break;
  }

  case 'analyze': {
    const budget = sre.calculateErrorBudget('API Availability');
    console.log(`SLO: ${budget.slo}`);
    console.log(`Target: ${budget.target}`);
    console.log(`Allowed Downtime: ${budget.allowedDowntime}`);
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-sre2.js [demo|slos|analyze]');
  }
}
