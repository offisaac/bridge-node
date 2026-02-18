/**
 * Agent SLA Tracker
 * Tracks and reports on Service Level Agreements for agents
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentSLATracker {
  constructor(options = {}) {
    this.slas = new Map();
    this.metrics = new Map();
    this.reports = new Map();
    this.violations = new Map();

    this.config = {
      reportingPeriod: options.reportingPeriod || 'monthly', // daily, weekly, monthly
      violationThreshold: options.violationThreshold || 0.95, // 95%
      calculationWindow: options.calculationWindow || 86400000, // 24 hours
      dataRetention: options.dataRetention || 90 // days
    };

    // Statistics
    this.stats = {
      totalSLAs: 0,
      activeSLAs: 0,
      violations: 0,
      met: 0
    };
  }

  createSLA(slaConfig) {
    const {
      id,
      name,
      agentId,
      targets = {},
      description = ''
    } = slaConfig;

    const sla = {
      id: id || `sla-${Date.now()}`,
      name,
      agentId,
      description,
      status: 'active',
      targets: {
        availability: targets.availability || 99.9, // 99.9%
        responseTime: targets.responseTime || 1000, // ms
        throughput: targets.throughput || 100, // requests/sec
        errorRate: targets.errorRate || 1, // %
        custom: targets.custom || {}
      },
      currentMetrics: {
        availability: 100,
        avgResponseTime: 0,
        avgThroughput: 0,
        avgErrorRate: 0
      },
      createdAt: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
      history: []
    };

    this.slas.set(sla.id, sla);
    this.metrics.set(sla.id, []);
    this.stats.totalSLAs++;
    this.stats.activeSLAs++;

    console.log(`SLA created: ${sla.id} (${name}) for agent ${agentId}`);
    return sla;
  }

  deleteSLA(slaId) {
    const sla = this.slas.get(slaId);
    if (!sla) {
      throw new Error(`SLA not found: ${slaId}`);
    }

    this.slas.delete(slaId);
    this.metrics.delete(slaId);
    this.reports.delete(slaId);
    this.stats.activeSLAs--;

    console.log(`SLA deleted: ${slaId}`);
    return { success: true, slaId };
  }

  recordMetric(slaId, metricData) {
    const sla = this.slas.get(slaId);
    if (!sla) {
      throw new Error(`SLA not found: ${slaId}`);
    }

    const metric = {
      id: crypto.randomUUID(),
      timestamp: metricData.timestamp || new Date().toISOString(),
      availability: metricData.availability !== undefined ? metricData.availability : 100,
      responseTime: metricData.responseTime || 0,
      throughput: metricData.throughput || 0,
      errorRate: metricData.errorRate || 0,
      requests: metricData.requests || 0,
      errors: metricData.errors || 0
    };

    const slaMetrics = this.metrics.get(slaId);
    slaMetrics.push(metric);

    // Keep only last 30 days of metrics
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.dataRetention);
    const filteredMetrics = slaMetrics.filter(m => new Date(m.timestamp) > cutoff);
    this.metrics.set(slaId, filteredMetrics);

    // Update SLA current metrics
    this._updateSLAmetrics(sla);

    return metric;
  }

  _updateSLAmetrics(sla) {
    const slaMetrics = this.metrics.get(sla.id);
    if (!slaMetrics || slaMetrics.length === 0) return;

    // Calculate averages for recent period
    const now = new Date();
    const windowStart = new Date(now.getTime() - this.config.calculationWindow);
    const recentMetrics = slaMetrics.filter(m => new Date(m.timestamp) > windowStart);

    if (recentMetrics.length > 0) {
      const sum = recentMetrics.reduce((acc, m) => ({
        availability: acc.availability + m.availability,
        responseTime: acc.responseTime + m.responseTime,
        throughput: acc.throughput + m.throughput,
        errorRate: acc.errorRate + m.errorRate,
        requests: acc.requests + m.requests
      }), { availability: 0, responseTime: 0, throughput: 0, errorRate: 0, requests: 0 });

      const count = recentMetrics.length;
      sla.currentMetrics = {
        availability: sum.availability / count,
        avgResponseTime: sum.responseTime / count,
        avgThroughput: sum.throughput / count,
        avgErrorRate: sum.errorRate / count,
        totalRequests: sum.requests
      };
    }

    sla.lastChecked = new Date().toISOString();
  }

  calculateSLAStatus(slaId) {
    const sla = this.slas.get(slaId);
    if (!sla) {
      throw new Error(`SLA not found: ${slaId}`);
    }

    this._updateSLAmetrics(sla);

    const status = {
      slaId: sla.id,
      name: sla.name,
      agentId: sla.agentId,
      timestamp: new Date().toISOString(),
      targets: sla.targets,
      current: sla.currentMetrics,
      compliance: {}
    };

    // Check each target
    const availabilityMet = sla.currentMetrics.availability >= sla.targets.availability;
    const responseTimeMet = sla.currentMetrics.avgResponseTime <= sla.targets.responseTime;
    const errorRateMet = sla.currentMetrics.avgErrorRate <= sla.targets.errorRate;
    const throughputMet = sla.currentMetrics.avgThroughput >= sla.targets.throughput;

    status.compliance = {
      availability: {
        target: sla.targets.availability,
        current: sla.currentMetrics.availability,
        met: availabilityMet,
        percentage: (sla.currentMetrics.availability / sla.targets.availability) * 100
      },
      responseTime: {
        target: sla.targets.responseTime,
        current: sla.currentMetrics.avgResponseTime,
        met: responseTimeMet,
        percentage: (sla.targets.responseTime / sla.currentMetrics.avgResponseTime) * 100
      },
      errorRate: {
        target: sla.targets.errorRate,
        current: sla.currentMetrics.avgErrorRate,
        met: errorRateMet,
        percentage: (sla.targets.errorRate / (sla.currentMetrics.avgErrorRate || 0.001)) * 100
      },
      throughput: {
        target: sla.targets.throughput,
        current: sla.currentMetrics.avgThroughput,
        met: throughputMet,
        percentage: (sla.currentMetrics.avgThroughput / sla.targets.throughput) * 100
      }
    };

    // Overall status
    status.overallMet = availabilityMet && responseTimeMet && errorRateMet && throughputMet;
    status.violated = !status.overallMet;

    // Record violation if any
    if (status.violated) {
      this._recordViolation(sla, status.compliance);
    }

    return status;
  }

  _recordViolation(sla, compliance) {
    const violation = {
      id: crypto.randomUUID(),
      slaId: sla.id,
      timestamp: new Date().toISOString(),
      details: [],
      acknowledged: false
    };

    for (const [key, data] of Object.entries(compliance)) {
      if (!data.met) {
        violation.details.push({
          metric: key,
          target: data.target,
          current: data.current,
          percentage: data.percentage
        });
      }
    }

    if (violation.details.length > 0) {
      const slaViolations = this.violations.get(sla.id) || [];
      slaViolations.push(violation);
      this.violations.set(sla.id, slaViolations);
      this.stats.violations++;

      console.log(`SLA violation recorded: ${sla.id} - ${violation.details.map(d => d.metric).join(', ')}`);
    }
  }

  acknowledgeViolation(slaId, violationId) {
    const slaViolations = this.violations.get(slaId);
    if (!slaViolations) {
      throw new Error(`No violations found for SLA: ${slaId}`);
    }

    const violation = slaViolations.find(v => v.id === violationId);
    if (!violation) {
      throw new Error(`Violation not found: ${violationId}`);
    }

    violation.acknowledged = true;
    violation.acknowledgedAt = new Date().toISOString();

    console.log(`Violation acknowledged: ${violationId}`);
    return violation;
  }

  generateReport(slaId, reportConfig = {}) {
    const { period = 'monthly', format = 'json' } = reportConfig;

    const sla = this.slas.get(slaId);
    if (!sla) {
      throw new Error(`SLA not found: ${slaId}`);
    }

    // Calculate period date range
    const now = new Date();
    let startDate = new Date(now);

    switch (period) {
      case 'daily':
        startDate.setDate(startDate.getDate() - 1);
        break;
      case 'weekly':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'monthly':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      default:
        startDate.setMonth(startDate.getMonth() - 1);
    }

    const slaMetrics = this.metrics.get(slaId) || [];
    const periodMetrics = slaMetrics.filter(m =>
      new Date(m.timestamp) >= startDate && new Date(m.timestamp) <= now
    );

    // Calculate statistics
    const report = {
      slaId: sla.id,
      name: sla.name,
      agentId: sla.agentId,
      period: {
        type: period,
        startDate: startDate.toISOString(),
        endDate: now.toISOString()
      },
      summary: {
        totalDataPoints: periodMetrics.length,
        uptimePercentage: this._calculateUptime(periodMetrics),
        avgResponseTime: this._calculateAvg(periodMetrics, 'responseTime'),
        avgThroughput: this._calculateAvg(periodMetrics, 'throughput'),
        avgErrorRate: this._calculateAvg(periodMetrics, 'errorRate'),
        totalRequests: periodMetrics.reduce((sum, m) => sum + m.requests, 0)
      },
      targets: sla.targets,
      compliance: {
        availability: this._checkCompliance(periodMetrics, sla.targets.availability, 'availability'),
        responseTime: this._checkCompliance(periodMetrics, sla.targets.responseTime, 'responseTime', true),
        errorRate: this._checkCompliance(periodMetrics, sla.targets.errorRate, 'errorRate', true),
        throughput: this._checkCompliance(periodMetrics, sla.targets.throughput, 'throughput')
      },
      violations: (this.violations.get(slaId) || []).filter(v =>
        new Date(v.timestamp) >= startDate
      ).length,
      generatedAt: new Date().toISOString()
    };

    // Overall compliance score
    const compliantMetrics = Object.values(report.compliance).filter(c => c.met).length;
    report.overallCompliance = (compliantMetrics / 4) * 100;
    report.slaMet = report.overallCompliance >= 95;

    // Store report
    const reportId = `report-${Date.now()}`;
    this.reports.set(reportId, report);

    if (format === 'json') {
      return JSON.stringify(report, null, 2);
    } else if (format === 'summary') {
      return this._generateTextSummary(report);
    }

    return report;
  }

  _calculateUptime(metrics) {
    if (metrics.length === 0) return 100;
    return metrics.reduce((sum, m) => sum + m.availability, 0) / metrics.length;
  }

  _calculateAvg(metrics, field) {
    if (metrics.length === 0) return 0;
    return metrics.reduce((sum, m) => sum + m[field], 0) / metrics.length;
  }

  _checkCompliance(metrics, target, field, lowerIsBetter = false) {
    const avg = this._calculateAvg(metrics, field);
    const met = lowerIsBetter ? avg <= target : avg >= target;
    const percentage = lowerIsBetter
      ? Math.min(100, (target / avg) * 100)
      : Math.min(100, (avg / target) * 100);

    return {
      target,
      actual: avg,
      met,
      percentage
    };
  }

  _generateTextSummary(report) {
    let summary = `SLA Report: ${report.name}\n`;
    summary += `${'='.repeat(50)}\n\n`;
    summary += `Period: ${report.period.type} (${report.period.startDate} to ${report.period.endDate})\n`;
    summary += `Data Points: ${report.summary.totalDataPoints}\n\n`;

    summary += `Summary:\n`;
    summary += `- Uptime: ${report.summary.uptimePercentage.toFixed(2)}%\n`;
    summary += `- Avg Response Time: ${report.summary.avgResponseTime.toFixed(2)} ms\n`;
    summary += `- Avg Throughput: ${report.summary.avgThroughput.toFixed(2)} req/s\n`;
    summary += `- Avg Error Rate: ${report.summary.avgErrorRate.toFixed(2)}%\n`;
    summary += `- Total Requests: ${report.summary.totalRequests}\n\n`;

    summary += `Compliance:\n`;
    summary += `- Availability: ${report.compliance.availability.met ? '✓' : '✗'} ${report.compliance.availability.percentage.toFixed(1)}% (target: ${report.compliance.availability.target}%)\n`;
    summary += `- Response Time: ${report.compliance.responseTime.met ? '✓' : '✗'} ${report.compliance.responseTime.percentage.toFixed(1)}% (target: ≤${report.compliance.responseTime.target}ms)\n`;
    summary += `- Error Rate: ${report.compliance.errorRate.met ? '✓' : '✗'} ${report.compliance.errorRate.percentage.toFixed(1)}% (target: ≤${report.compliance.errorRate.target}%)\n`;
    summary += `- Throughput: ${report.compliance.throughput.met ? '✓' : '✗'} ${report.compliance.throughput.percentage.toFixed(1)}% (target: ≥${report.compliance.throughput.target})\n\n`;

    summary += `Overall: ${report.overallCompliance.toFixed(1)}% - ${report.slaMet ? 'SLA MET' : 'SLA VIOLATED'}\n`;
    summary += `Violations: ${report.violations}\n`;

    return summary;
  }

  getSLA(slaId) {
    const sla = this.slas.get(slaId);
    if (!sla) {
      throw new Error(`SLA not found: ${slaId}`);
    }
    return sla;
  }

  listSLAs(agentId = null) {
    const slas = Array.from(this.slas.values());
    if (agentId) {
      return slas.filter(s => s.agentId === agentId);
    }
    return slas;
  }

  getViolations(slaId = null) {
    if (slaId) {
      return this.violations.get(slaId) || [];
    }

    let allViolations = [];
    for (const violations of this.violations.values()) {
      allViolations = [...allViolations, ...violations];
    }
    return allViolations;
  }

  getDashboardData() {
    const slas = Array.from(this.slas.values());
    let metCount = 0;
    let violatedCount = 0;

    for (const sla of slas) {
      const status = this.calculateSLAStatus(sla.id);
      if (status.overallMet) metCount++;
      else violatedCount++;
    }

    return {
      total: slas.length,
      active: this.stats.activeSLAs,
      met: metCount,
      violated: violatedCount,
      complianceRate: slas.length > 0 ? (metCount / slas.length) * 100 : 100,
      totalViolations: this.stats.violations,
      slas: slas.map(s => ({
        id: s.id,
        name: s.name,
        agentId: s.agentId,
        targets: s.targets,
        current: s.currentMetrics
      }))
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const tracker = new AgentSLATracker({
    reportingPeriod: 'monthly',
    violationThreshold: 0.95
  });

  switch (command) {
    case 'create-sla':
      const slaName = args[1] || 'api-gateway-sla';
      const agentId = args[2] || 'api-gateway';
      const sla = tracker.createSLA({
        name: slaName,
        agentId,
        targets: {
          availability: 99.9,
          responseTime: 500,
          errorRate: 0.5,
          throughput: 1000
        }
      });
      console.log('SLA created:', sla.id);
      break;

    case 'record-metric':
      const metricSlaId = args[1];
      if (!metricSlaId) {
        console.log('Usage: node agent-sla-tracker.js record-metric <sla-id>');
        process.exit(1);
      }
      const metric = tracker.recordMetric(metricSlaId, {
        availability: 99.95,
        responseTime: 250,
        throughput: 800,
        errorRate: 0.3,
        requests: 10000,
        errors: 30
      });
      console.log('Metric recorded:', metric.id);
      break;

    case 'status':
      const statusSlaId = args[1];
      if (!statusSlaId) {
        console.log('Usage: node agent-sla-tracker.js status <sla-id>');
        process.exit(1);
      }
      console.log('Status:', tracker.calculateSLAStatus(statusSlaId));
      break;

    case 'list-slas':
      console.log('SLAs:', tracker.listSLAs());
      break;

    case 'demo':
      console.log('=== Agent SLA Tracker Demo ===\n');

      // Create SLAs
      console.log('1. Creating SLAs...');
      const sla1 = tracker.createSLA({
        name: 'API Gateway SLA',
        agentId: 'api-gateway',
        targets: {
          availability: 99.9,
          responseTime: 500,
          errorRate: 0.5,
          throughput: 1000
        }
      });
      console.log('   Created:', sla1.name);

      const sla2 = tracker.createSLA({
        name: 'Data Processor SLA',
        agentId: 'data-processor',
        targets: {
          availability: 99.5,
          responseTime: 2000,
          errorRate: 1.0,
          throughput: 100
        }
      });
      console.log('   Created:', sla2.name);

      // Record metrics
      console.log('\n2. Recording metrics...');
      for (let i = 0; i < 10; i++) {
        tracker.recordMetric(sla1.id, {
          timestamp: new Date(Date.now() - i * 3600000).toISOString(),
          availability: 99.5 + Math.random() * 0.5,
          responseTime: 200 + Math.random() * 300,
          throughput: 800 + Math.random() * 400,
          errorRate: Math.random() * 0.5,
          requests: Math.floor(8000 + Math.random() * 4000),
          errors: Math.floor(Math.random() * 30)
        });
      }

      for (let i = 0; i < 5; i++) {
        tracker.recordMetric(sla2.id, {
          timestamp: new Date(Date.now() - i * 3600000).toISOString(),
          availability: 99.0 + Math.random() * 0.5,
          responseTime: 1500 + Math.random() * 1000,
          throughput: 80 + Math.random() * 40,
          errorRate: Math.random() * 1.0,
          requests: Math.floor(80 + Math.random() * 40),
          errors: Math.floor(Math.random() * 2)
        });
      }
      console.log('   Recorded 15 metric data points');

      // Get SLA status
      console.log('\n3. SLA Status:');
      const status1 = tracker.calculateSLAStatus(sla1.id);
      console.log('   API Gateway SLA:', status1.overallMet ? '✓ MET' : '✗ VIOLATED');
      console.log('   Availability:', status1.compliance.availability.percentage.toFixed(2), '%');

      const status2 = tracker.calculateSLAStatus(sla2.id);
      console.log('   Data Processor SLA:', status2.overallMet ? '✓ MET' : '✗ VIOLATED');
      console.log('   Availability:', status2.compliance.availability.percentage.toFixed(2), '%');

      // Generate report
      console.log('\n4. Generating report...');
      const report = tracker.generateReport(sla1.id, { period: 'monthly', format: 'summary' });
      console.log('\n' + report);

      // Get violations
      console.log('5. Violations:');
      const violations = tracker.getViolations();
      console.log('   Total violations:', violations.length);

      // Get dashboard data
      console.log('\n6. Dashboard:');
      const dashboard = tracker.getDashboardData();
      console.log('   Total SLAs:', dashboard.total);
      console.log('   Compliance Rate:', dashboard.complianceRate.toFixed(1), '%');
      console.log('   Met:', dashboard.met);
      console.log('   Violated:', dashboard.violated);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-sla-tracker.js <command> [args]');
      console.log('\nCommands:');
      console.log('  create-sla [name] [agentId]  Create an SLA');
      console.log('  record-metric <sla-id>        Record a metric');
      console.log('  status <sla-id>               Get SLA status');
      console.log('  list-slas                     List all SLAs');
      console.log('  demo                          Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentSLATracker;
