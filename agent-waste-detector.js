/**
 * Agent Waste Detector - Resource Waste Detection Agent
 *
 * Identifies and reports on unused or underutilized resources.
 *
 * Usage: node agent-waste-detector.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   waste      - List detected waste
 *   resources  - List analyzed resources
 */

class Resource {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type; // compute, storage, network, license
    this.provider = config.provider || 'internal';
    this.cost = config.cost || 0;
    this.utilization = config.utilization || 0;
    this.lastUsed = config.lastUsed || null;
    this.tags = config.tags || {};
  }
}

class WasteReport {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.resourceId = config.resourceId;
    this.resourceName = config.resourceName;
    this.type = config.type; // idle, overprovisioned, unused, zombie
    this.potentialSavings = config.potentialSavings;
    this.severity = config.severity || 'low'; // low, medium, high, critical
    this.description = config.description;
    this.recommendation = config.recommendation;
    this.detectedAt = config.detectedAt || new Date().toISOString();
  }
}

class WasteDetector {
  constructor() {
    this.resources = new Map();
    this.reports = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample resources
    const resources = [
      { name: 'prod-api-server-1', type: 'compute', provider: 'aws', cost: 500, utilization: 85, tags: { env: 'prod' } },
      { name: 'prod-api-server-2', type: 'compute', provider: 'aws', cost: 500, utilization: 82, tags: { env: 'prod' } },
      { name: 'staging-api-server', type: 'compute', provider: 'aws', cost: 200, utilization: 5, tags: { env: 'staging' } },
      { name: 'dev-server', type: 'compute', provider: 'aws', cost: 100, utilization: 2, tags: { env: 'dev' } },
      { name: 'old-backup-volume', type: 'storage', provider: 'aws', cost: 150, utilization: 0, lastUsed: '2025-12-01', tags: { backup: 'old' } },
      { name: 'production-database', type: 'compute', provider: 'gcp', cost: 800, utilization: 75, tags: { env: 'prod', db: 'true' } },
      { name: 'test-database', type: 'compute', provider: 'gcp', cost: 200, utilization: 3, tags: { env: 'test' } },
      { name: 'unused-elb', type: 'network', provider: 'aws', cost: 25, utilization: 0, tags: { env: 'staging' } },
      { name: 'unattached-eip', type: 'network', provider: 'aws', cost: 5, utilization: 0, tags: { status: 'orphaned' } },
      { name: 'expired-license', type: 'license', provider: 'internal', cost: 1000, utilization: 0, tags: { status: 'expired' } },
      { name: 'overprovisioned-vm-1', type: 'compute', provider: 'azure', cost: 600, utilization: 15, tags: { env: 'prod' } },
      { name: 'overprovisioned-vm-2', type: 'compute', provider: 'azure', cost: 600, utilization: 12, tags: { env: 'prod' } },
      { name: 'zombie-snapshot', type: 'storage', provider: 'aws', cost: 50, utilization: 0, lastUsed: '2025-11-15', tags: { status: 'orphaned' } }
    ];

    resources.forEach(r => {
      const resource = new Resource(r);
      this.resources.set(resource.id, resource);
    });

    // Sample waste reports
    const reports = [
      { resourceId: 'staging-api-server', resourceName: 'staging-api-server', type: 'idle', potentialSavings: 190, severity: 'medium', description: 'Staging server with 5% utilization', recommendation: 'Consider shutting down during off-hours or using spot instances' },
      { resourceId: 'dev-server', resourceName: 'dev-server', type: 'idle', potentialSavings: 98, severity: 'medium', description: 'Dev server with 2% utilization', recommendation: 'Use development environment on-demand or suspend when not in use' },
      { resourceId: 'old-backup-volume', resourceName: 'old-backup-volume', type: 'unused', potentialSavings: 150, severity: 'high', description: 'Unused backup volume not accessed since December', recommendation: 'Delete or archive old backups' },
      { resourceId: 'unused-elb', resourceName: 'unused-elb', type: 'zombie', potentialSavings: 25, severity: 'high', description: 'Load balancer with no active backends', recommendation: 'Remove unused load balancer' },
      { resourceId: 'unattached-eip', resourceName: 'unattached-eip', type: 'zombie', potentialSavings: 5, severity: 'low', description: 'Elastic IP not attached to any instance', recommendation: 'Release unused Elastic IP' },
      { resourceId: 'expired-license', resourceName: 'expired-license', type: 'unused', potentialSavings: 1000, severity: 'critical', description: 'Expired license still being billed', recommendation: 'Cancel or renew expired license' },
      { resourceId: 'overprovisioned-vm-1', resourceName: 'overprovisioned-vm-1', type: 'overprovisioned', potentialSavings: 400, severity: 'high', description: 'VM with only 15% CPU utilization', recommendation: 'Downsize to smaller instance type' },
      { resourceId: 'overprovisioned-vm-2', resourceName: 'overprovisioned-vm-2', type: 'overprovisioned', potentialSavings: 420, severity: 'high', description: 'VM with only 12% CPU utilization', recommendation: 'Downsize to smaller instance type' },
      { resourceId: 'zombie-snapshot', resourceName: 'zombie-snapshot', type: 'zombie', potentialSavings: 50, severity: 'medium', description: 'Snapshot not accessed in 3 months', recommendation: 'Review and delete old snapshots' }
    ];

    reports.forEach(r => {
      const report = new WasteReport(r);
      this.reports.set(report.id, report);
    });
  }

  // Analyze resource
  analyze(resourceId) {
    const resource = this.resources.get(resourceId);
    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    let wasteType = null;
    let severity = 'low';
    let potentialSavings = 0;
    let recommendation = '';

    // Detect waste based on utilization
    if (resource.utilization === 0) {
      wasteType = resource.lastUsed ? 'unused' : 'zombie';
      potentialSavings = resource.cost;
      severity = potentialSavings > 500 ? 'critical' : potentialSavings > 100 ? 'high' : 'medium';
      recommendation = 'Review for deletion';
    } else if (resource.utilization < 10) {
      wasteType = 'idle';
      potentialSavings = Math.round(resource.cost * 0.7);
      severity = 'medium';
      recommendation = 'Consider scaling down or using on-demand';
    } else if (resource.utilization < 30) {
      wasteType = 'overprovisioned';
      potentialSavings = Math.round(resource.cost * 0.5);
      severity = 'medium';
      recommendation = 'Downsize resource';
    }

    if (wasteType) {
      const report = new WasteReport({
        resourceId: resource.id,
        resourceName: resource.name,
        type: wasteType,
        potentialSavings,
        severity,
        description: `${resource.name} with ${resource.utilization}% utilization`,
        recommendation
      });
      this.reports.set(report.id, report);
      return report;
    }

    return null;
  }

  // Get reports
  getReports(filter = {}) {
    let reports = Array.from(this.reports.values());

    if (filter.severity) {
      reports = reports.filter(r => r.severity === filter.severity);
    }
    if (filter.type) {
      reports = reports.filter(r => r.type === filter.type);
    }

    return reports;
  }

  // Get resources
  getResources(filter = {}) {
    let resources = Array.from(this.resources.values());

    if (filter.type) {
      resources = resources.filter(r => r.type === filter.type);
    }
    if (filter.provider) {
      resources = resources.filter(r => r.provider === filter.provider);
    }

    return resources;
  }

  // Get total potential savings
  getTotalSavings() {
    return Array.from(this.reports.values())
      .reduce((sum, r) => sum + r.potentialSavings, 0);
  }

  // Get statistics
  getStats() {
    const reports = Array.from(this.reports.values());
    const resources = Array.from(this.resources.values());

    return {
      totalResources: resources.length,
      analyzedResources: this.reports.size,
      totalPotentialSavings: this.getTotalSavings(),
      byType: {
        idle: reports.filter(r => r.type === 'idle').length,
        unused: reports.filter(r => r.type === 'unused').length,
        overprovisioned: reports.filter(r => r.type === 'overprovisioned').length,
        zombie: reports.filter(r => r.type === 'zombie').length
      },
      bySeverity: {
        critical: reports.filter(r => r.severity === 'critical').length,
        high: reports.filter(r => r.severity === 'high').length,
        medium: reports.filter(r => r.severity === 'medium').length,
        low: reports.filter(r => r.severity === 'low').length
      }
    };
  }

  // Generate summary
  getSummary() {
    const stats = this.getStats();
    const reports = this.getReports();

    return {
      totalWaste: reports.length,
      potentialMonthlySavings: stats.totalPotentialSavings,
      criticalIssues: stats.bySeverity.critical,
      highIssues: stats.bySeverity.high,
      immediateSavings: reports
        .filter(r => r.severity === 'critical' || r.severity === 'high')
        .reduce((sum, r) => sum + r.potentialSavings, 0)
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const detector = new WasteDetector();

switch (command) {
  case 'demo':
    console.log('=== Agent Waste Detector Demo\n');

    // 1. Get summary
    console.log('1. Waste Summary:');
    const summary = detector.getSummary();
    console.log(`   Total waste detected: ${summary.totalWaste} resources`);
    console.log(`   Potential monthly savings: $${summary.potentialMonthlySavings}`);
    console.log(`   Critical issues: ${summary.criticalIssues}`);
    console.log(`   High issues: ${summary.highIssues}`);

    // 2. List waste reports
    console.log('\n2. Waste Reports:');
    const reports = detector.getReports();
    console.log(`   Total: ${reports.length}`);
    reports.forEach(r => {
      console.log(`   - ${r.resourceName}: ${r.type} ($${r.potentialSavings}/mo) [${r.severity}]`);
    });

    // 3. Reports by severity
    console.log('\n3. By Severity:');
    const stats = detector.getStats();
    console.log(`   Critical: ${stats.bySeverity.critical}`);
    console.log(`   High: ${stats.bySeverity.high}`);
    console.log(`   Medium: ${stats.bySeverity.medium}`);
    console.log(`   Low: ${stats.bySeverity.low}`);

    // 4. Reports by type
    console.log('\n4. By Type:');
    console.log(`   Idle: ${stats.byType.idle}`);
    console.log(`   Unused: ${stats.byType.unused}`);
    console.log(`   Overprovisioned: ${stats.byType.overprovisioned}`);
    console.log(`   Zombie: ${stats.byType.zombie}`);

    // 5. List resources
    console.log('\n5. Analyzed Resources:');
    const resources = detector.getResources();
    console.log(`   Total: ${resources.length}`);
    resources.slice(0, 5).forEach(r => {
      console.log(`   - ${r.name} [${r.type}]: ${r.utilization}% utilization`);
    });

    // 6. Critical waste
    console.log('\n6. Critical Waste:');
    const critical = detector.getReports({ severity: 'critical' });
    critical.forEach(r => {
      console.log(`   - ${r.resourceName}: $${r.potentialSavings}/mo - ${r.description}`);
    });

    // 7. High waste
    console.log('\n7. High Priority Waste:');
    const high = detector.getReports({ severity: 'high' });
    high.forEach(r => {
      console.log(`   - ${r.resourceName}: $${r.potentialSavings}/mo - ${r.description}`);
    });

    // 8. Analyze new resource
    console.log('\n8. Analyze Resource:');
    const newResource = detector.resources.values().next().value;
    const analysis = detector.analyze(newResource.id);
    if (analysis) {
      console.log(`   Analyzed: ${analysis.resourceName}`);
      console.log(`   Type: ${analysis.type}`);
      console.log(`   Savings: $${analysis.potentialSavings}/mo`);
    }

    // 9. Recommendations
    console.log('\n9. Top Recommendations:');
    const topReports = detector.getReports()
      .sort((a, b) => b.potentialSavings - a.potentialSavings)
      .slice(0, 3);
    topReports.forEach(r => {
      console.log(`   - ${r.recommendation} ($${r.potentialSavings}/mo)`);
    });

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const finalStats = detector.getStats();
    console.log(`    Total analyzed: ${finalStats.analyzedResources}`);
    console.log(`    Potential savings: $${finalStats.totalPotentialSavings}/mo`);
    console.log(`    Resources monitored: ${finalStats.totalResources}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'waste':
    console.log('Waste Reports:');
    detector.getReports().forEach(r => {
      console.log(`  ${r.resourceName}: ${r.type} - $${r.potentialSavings}/mo [${r.severity}]`);
    });
    break;

  case 'resources':
    console.log('Resources:');
    detector.getResources().forEach(r => {
      console.log(`  ${r.name}: ${r.type} - ${r.utilization}% utilized`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-waste-detector.js [demo|waste|resources]');
}
