/**
 * Cost Optimizer - 云成本优化建议
 * 实现云成本优化建议系统
 */

const fs = require('fs');
const path = require('path');

// ========== Cost Types ==========

const CostCategory = {
  COMPUTE: 'compute',
  STORAGE: 'storage',
  NETWORK: 'network',
  DATABASE: 'database',
  SERVERLESS: 'serverless',
  CONTAINER: 'container',
  CDN: 'cdn',
  OTHER: 'other'
};

const ResourceType = {
  EC2: 'ec2',
  RDS: 'rds',
  S3: 's3',
  LAMBDA: 'lambda',
  ECS: 'ecs',
  EKS: 'eks',
  CLOUDFRONT: 'cloudfront',
  NAT_GATEWAY: 'nat_gateway',
  ELASTICACHE: 'elasticache',
  EBS: 'ebs'
};

const SavingPriority = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low'
};

const FindingType = {
  IDLE_RESOURCE: 'idle_resource',
  UNDERUTILIZED: 'underutilized',
  OVERSIZED: 'oversized',
  UNUSED_STORAGE: 'unused_storage',
  RESERVED_INSTANCE: 'reserved_instance',
  SPOT_INSTANCE: 'spot_instance',
  SAVINGS_PLAN: 'savings_plan',
  RIGHT_SIZING: 'right_sizing',
  OLD_SNAPSHOT: 'old_snapshot',
  PUBLIC_BUCKET: 'public_bucket',
  MULTI_AZ: 'multi_az',
  GRAVITON: 'graviton',
  COMPRESSION: 'compression'
};

// ========== Cost Finding ==========

class CostFinding {
  constructor(config) {
    this.id = config.id || `finding_${Date.now()}`;
    this.type = config.type;
    this.title = config.title;
    this.description = config.description;
    this.category = config.category || CostCategory.OTHER;
    this.resourceType = config.resourceType;
    this.resourceId = config.resourceId;
    this.resourceName = config.resourceName;
    this.region = config.region || 'global';
    this.priority = config.priority || SavingPriority.MEDIUM;
    this.currentCost = config.currentCost || 0;
    this.potentialSavings = config.potentialSavings || 0;
    this.savingsPercentage = config.savingsPercentage || 0;
    this.details = config.details || {};
    this.recommendation = config.recommendation;
    this.estimatedEffort = config.estimatedEffort || 'low';
    this.riskLevel = config.riskLevel || 'low';
    this.tags = config.tags || {};
    this.detectedAt = config.detectedAt || Date.now();
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      description: this.description,
      category: this.category,
      resourceType: this.resourceType,
      resourceId: this.resourceId,
      resourceName: this.resourceName,
      region: this.region,
      priority: this.priority,
      currentCost: this.currentCost,
      potentialSavings: this.potentialSavings,
      savingsPercentage: this.savingsPercentage,
      details: this.details,
      recommendation: this.recommendation,
      estimatedEffort: this.estimatedEffort,
      riskLevel: this.riskLevel,
      tags: this.tags,
      detectedAt: this.detectedAt,
      metadata: this.metadata
    };
  }
}

// ========== Resource Analyzer ==========

class ResourceAnalyzer {
  constructor(manager) {
    this.manager = manager;
  }

  analyze() {
    const findings = [];

    // Analyze idle resources
    findings.push(...this._analyzeIdleResources());

    // Analyze underutilized resources
    findings.push(...this._analyzeUnderutilized());

    // Analyze rightsizing opportunities
    findings.push(...this._analyzeRightSizing());

    // Analyze storage
    findings.push(...this._analyzeStorage());

    // Analyze reserved instances
    findings.push(...this._analyzeReservedInstances());

    // Analyze networking
    findings.push(...this._analyzeNetworking());

    // Analyze database
    findings.push(...this._analyzeDatabase());

    return findings;
  }

  _analyzeIdleResources() {
    const findings = [];
    const resources = this.manager.resources;

    for (const [id, resource] of resources) {
      if (resource.utilization === 0 && resource.idleDays > 7) {
        findings.push(new CostFinding({
          type: FindingType.IDLE_RESOURCE,
          title: `Idle ${resource.type} Resource`,
          description: `Resource ${resource.name} has been idle for ${resource.idleDays} days`,
          category: this._getCategoryForType(resource.type),
          resourceType: resource.type,
          resourceId: id,
          resourceName: resource.name,
          region: resource.region,
          priority: SavingPriority.HIGH,
          currentCost: resource.monthlyCost || 0,
          potentialSavings: resource.monthlyCost || 0,
          savingsPercentage: 100,
          recommendation: 'Consider terminating or downsizing this resource',
          estimatedEffort: 'low',
          details: { idleDays: resource.idleDays, lastUsed: resource.lastUsed }
        }));
      }
    }

    return findings;
  }

  _analyzeUnderutilized() {
    const findings = [];
    const resources = this.manager.resources;

    for (const [id, resource] of resources) {
      if (resource.utilization && resource.utilization < 20 && resource.idleDays < 7) {
        const savings = (resource.monthlyCost || 0) * 0.4;
        findings.push(new CostFinding({
          type: FindingType.UNDERUTILIZED,
          title: `Underutilized ${resource.type}`,
          description: `Resource ${resource.name} has low utilization (${resource.utilization}%)`,
          category: this._getCategoryForType(resource.type),
          resourceType: resource.type,
          resourceId: id,
          resourceName: resource.name,
          region: resource.region,
          priority: SavingPriority.MEDIUM,
          currentCost: resource.monthlyCost || 0,
          potentialSavings: savings,
          savingsPercentage: 40,
          recommendation: 'Consider downsizing to a smaller instance type',
          estimatedEffort: 'medium',
          details: { utilization: resource.utilization }
        }));
      }
    }

    return findings;
  }

  _analyzeRightSizing() {
    const findings = [];
    const resources = this.manager.resources;

    for (const [id, resource] of resources) {
      if (resource.actualUsage && resource.recommendedSize) {
        const currentSize = this._parseSize(resource.size);
        const recommendedSize = this._parseSize(resource.recommendedSize);

        if (recommendedSize < currentSize) {
          const savings = ((resource.monthlyCost || 0) / currentSize) * (currentSize - recommendedSize);

          findings.push(new CostFinding({
            type: FindingType.RIGHT_SIZING,
            title: `Right-sizing Opportunity for ${resource.type}`,
            description: `Current size: ${resource.size}, Recommended: ${resource.recommendedSize}`,
            category: this._getCategoryForType(resource.type),
            resourceType: resource.type,
            resourceId: id,
            resourceName: resource.name,
            region: resource.region,
            priority: SavingPriority.MEDIUM,
            currentCost: resource.monthlyCost || 0,
            potentialSavings: savings,
            savingsPercentage: Math.round((savings / (resource.monthlyCost || 1)) * 100),
            recommendation: `Resize from ${resource.size} to ${resource.recommendedSize}`,
            estimatedEffort: 'medium',
            riskLevel: 'medium',
            details: { currentSize: resource.size, recommendedSize: resource.recommendedSize, actualUsage: resource.actualUsage }
          }));
        }
      }
    }

    return findings;
  }

  _analyzeStorage() {
    const findings = [];
    const resources = this.manager.resources;

    for (const [id, resource] of resources) {
      // Old snapshots
      if (resource.type === 'snapshot' && resource.ageDays > 90) {
        findings.push(new CostFinding({
          type: FindingType.OLD_SNAPSHOT,
          title: 'Old Snapshot',
          description: `Snapshot ${resource.name} is ${resource.ageDays} days old`,
          category: CostCategory.STORAGE,
          resourceType: ResourceType.EBS,
          resourceId: id,
          resourceName: resource.name,
          region: resource.region,
          priority: SavingPriority.LOW,
          currentCost: resource.monthlyCost || 0,
          potentialSavings: resource.monthlyCost || 0,
          savingsPercentage: 100,
          recommendation: 'Delete old snapshots or archive to cheaper storage',
          estimatedEffort: 'low',
          details: { ageDays: resource.ageDays }
        }));
      }

      // Unused EBS volumes
      if (resource.type === 'ebs_volume' && resource.status === 'available') {
        findings.push(new CostFinding({
          type: FindingType.IDLE_RESOURCE,
          title: 'Unattached EBS Volume',
          description: `EBS volume ${resource.name} is not attached to any instance`,
          category: CostCategory.STORAGE,
          resourceType: ResourceType.EBS,
          resourceId: id,
          resourceName: resource.name,
          region: resource.region,
          priority: SavingPriority.HIGH,
          currentCost: resource.monthlyCost || 0,
          potentialSavings: resource.monthlyCost || 0,
          savingsPercentage: 100,
          recommendation: 'Delete unattached EBS volume or attach to instance',
          estimatedEffort: 'low',
          details: { size: resource.size, status: resource.status }
        }));
      }
    }

    return findings;
  }

  _analyzeReservedInstances() {
    const findings = [];

    // Check for unused Reserved Instances
    const resources = this.manager.resources;
    let totalRI = 0;
    let usedRI = 0;

    for (const [id, resource] of resources) {
      if (resource.reserved) {
        totalRI += resource.monthlyCost || 0;
        usedRI += (resource.monthlyCost || 0) * ((resource.utilization || 100) / 100);
      }
    }

    const unusedRI = totalRI - usedRI;
    if (unusedRI > 100) {
      findings.push(new CostFinding({
        type: FindingType.RESERVED_INSTANCE,
        title: 'Unused Reserved Capacity',
        description: `Approximately $${unusedRI.toFixed(2)} of Reserved Instance capacity is unused`,
        category: CostCategory.COMPUTE,
        priority: SavingPriority.HIGH,
        currentCost: totalRI,
        potentialSavings: unusedRI,
        savingsPercentage: Math.round((unusedRI / totalRI) * 100),
        recommendation: 'Consider selling unused RIs on the marketplace or adjusting reservation size',
        estimatedEffort: 'medium',
        details: { totalRI, usedRI, unusedRI }
      }));
    }

    return findings;
  }

  _analyzeNetworking() {
    const findings = [];
    const resources = this.manager.resources;

    for (const [id, resource] of resources) {
      // NAT Gateway with low traffic
      if (resource.type === ResourceType.NAT_GATEWAY && resource.bytesProcessed < 10000000) {
        findings.push(new CostFinding({
          type: FindingType.UNDERUTILIZED,
          title: 'Underutilized NAT Gateway',
          description: `NAT Gateway ${resource.name} has processed only ${resource.bytesProcessed} bytes`,
          category: CostCategory.NETWORK,
          resourceType: ResourceType.NAT_GATEWAY,
          resourceId: id,
          resourceName: resource.name,
          region: resource.region,
          priority: SavingPriority.MEDIUM,
          currentCost: resource.monthlyCost || 45,
          potentialSavings: 30,
          savingsPercentage: 66,
          recommendation: 'Consider using NAT Gateway more efficiently or alternative architecture',
          estimatedEffort: 'high',
          riskLevel: 'high',
          details: { bytesProcessed: resource.bytesProcessed }
        }));
      }
    }

    return findings;
  }

  _analyzeDatabase() {
    const findings = [];
    const resources = this.manager.resources;

    for (const [id, resource] of resources) {
      // Multi-AZ for dev/test that doesn't need it
      if (resource.type === ResourceType.RDS && resource.multiAz && resource.environment !== 'production') {
        findings.push(new CostFinding({
          type: FindingType.OVERSIZED,
          title: 'Unnecessary Multi-AZ Deployment',
          description: `RDS instance ${resource.name} uses Multi-AZ but environment is ${resource.environment}`,
          category: CostCategory.DATABASE,
          resourceType: ResourceType.RDS,
          resourceId: id,
          resourceName: resource.name,
          region: resource.region,
          priority: SavingPriority.MEDIUM,
          currentCost: resource.monthlyCost || 0,
          potentialSavings: (resource.monthlyCost || 0) * 0.5,
          savingsPercentage: 50,
          recommendation: 'Switch to Single-AZ for non-production environments',
          estimatedEffort: 'low',
          details: { multiAz: resource.multiAz, environment: resource.environment }
        }));
      }

      // Old generation instances
      if (resource.type === ResourceType.RDS && resource.instanceClass?.includes('old')) {
        findings.push(new CostFinding({
          type: FindingType.RIGHT_SIZING,
          title: 'Old Generation RDS Instance',
          description: `RDS instance ${resource.name} uses old generation instance class`,
          category: CostCategory.DATABASE,
          resourceType: ResourceType.RDS,
          resourceId: id,
          resourceName: resource.name,
          region: resource.region,
          priority: SavingPriority.HIGH,
          currentCost: resource.monthlyCost || 0,
          potentialSavings: (resource.monthlyCost || 0) * 0.3,
          savingsPercentage: 30,
          recommendation: 'Migrate to new generation instance for better price/performance',
          estimatedEffort: 'medium',
          riskLevel: 'medium',
          details: { instanceClass: resource.instanceClass }
        }));
      }
    }

    return findings;
  }

  _getCategoryForType(type) {
    const categoryMap = {
      [ResourceType.EC2]: CostCategory.COMPUTE,
      [ResourceType.LAMBDA]: CostCategory.SERVERLESS,
      [ResourceType.ECS]: CostCategory.CONTAINER,
      [ResourceType.EKS]: CostCategory.CONTAINER,
      [ResourceType.RDS]: CostCategory.DATABASE,
      [ResourceType.S3]: CostCategory.STORAGE,
      [ResourceType.CLOUDFRONT]: CostCategory.CDN,
      [ResourceType.NAT_GATEWAY]: CostCategory.NETWORK,
      [ResourceType.ELASTICACHE]: CostCategory.DATABASE,
      [ResourceType.EBS]: CostCategory.STORAGE
    };
    return categoryMap[type] || CostCategory.OTHER;
  }

  _parseSize(size) {
    if (typeof size === 'number') return size;
    const match = String(size).match(/(\d+)/);
    return match ? parseInt(match[1]) : 1;
  }
}

// ========== Cost Optimizer ==========

class CostOptimizer {
  constructor(options = {}) {
    this.resources = new Map(); // id -> resource data
    this.findings = [];
    this.storageDir = options.storageDir || './cost-optimizer-data';
    this.analyzer = new ResourceAnalyzer(this);

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadResources();
  }

  // ========== Resource Management ==========

  addResource(resource) {
    const id = resource.id || `res_${Date.now()}`;
    this.resources.set(id, {
      ...resource,
      id,
      addedAt: Date.now()
    });
    this._saveResources();
    return id;
  }

  removeResource(id) {
    this.resources.delete(id);
    this._saveResources();
  }

  getResource(id) {
    return this.resources.get(id);
  }

  listResources(filters = {}) {
    let result = Array.from(this.resources.values());

    if (filters.type) {
      result = result.filter(r => r.type === filters.type);
    }

    if (filters.region) {
      result = result.filter(r => r.region === filters.region);
    }

    if (filters.category) {
      result = result.filter(r => r.category === filters.category);
    }

    return result;
  }

  // ========== Cost Analysis ==========

  analyze() {
    this.findings = this.analyzer.analyze();
    this._saveFindings();
    return this.findings;
  }

  getFindings(filters = {}) {
    let result = this.findings;

    if (filters.priority) {
      result = result.filter(f => f.priority === filters.priority);
    }

    if (filters.category) {
      result = result.filter(f => f.category === filters.category);
    }

    if (filters.type) {
      result = result.filter(f => f.type === filters.type);
    }

    if (filters.minSavings) {
      result = result.filter(f => f.potentialSavings >= filters.minSavings);
    }

    // Sort by priority and savings
    const priorityOrder = { [SavingPriority.CRITICAL]: 0, [SavingPriority.HIGH]: 1, [SavingPriority.MEDIUM]: 2, [SavingPriority.LOW]: 3 };
    result.sort((a, b) => {
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;
      return b.potentialSavings - a.potentialSavings;
    });

    return result;
  }

  getTotalPotentialSavings() {
    return this.findings.reduce((sum, f) => sum + f.potentialSavings, 0);
  }

  getSavingsByCategory() {
    const savings = {};
    for (const finding of this.findings) {
      if (!savings[finding.category]) {
        savings[finding.category] = 0;
      }
      savings[finding.category] += finding.potentialSavings;
    }
    return savings;
  }

  getSavingsByPriority() {
    const savings = {};
    for (const finding of this.findings) {
      if (!savings[finding.priority]) {
        savings[finding.priority] = 0;
      }
      savings[finding.priority] += finding.potentialSavings;
    }
    return savings;
  }

  // ========== Report Generation ==========

  generateReport() {
    const totalCurrentCost = Array.from(this.resources.values())
      .reduce((sum, r) => sum + (r.monthlyCost || 0), 0);

    const totalPotentialSavings = this.getTotalPotentialSavings();
    const savingsPercentage = totalCurrentCost > 0 ? (totalPotentialSavings / totalCurrentCost) * 100 : 0;

    return {
      summary: {
        totalResources: this.resources.size,
        totalFindings: this.findings.length,
        totalCurrentCost,
        totalPotentialSavings,
        savingsPercentage: savingsPercentage.toFixed(1)
      },
      byCategory: this.getSavingsByCategory(),
      byPriority: this.getSavingsByPriority(),
      criticalFindings: this.getFindings({ priority: SavingPriority.CRITICAL }),
      highPriorityFindings: this.getFindings({ priority: SavingPriority.HIGH }),
      topSavings: this.findings
        .sort((a, b) => b.potentialSavings - a.potentialSavings)
        .slice(0, 10)
        .map(f => ({
          title: f.title,
          savings: f.potentialSavings,
          priority: f.priority
        })),
      generatedAt: new Date().toISOString()
    };
  }

  // ========== Actions ==========

  dismissFinding(findingId) {
    this.findings = this.findings.filter(f => f.id !== findingId);
    this._saveFindings();
  }

  applyRecommendation(findingId) {
    const finding = this.findings.find(f => f.id === findingId);
    if (!finding) {
      throw new Error(`Finding not found: ${findingId}`);
    }

    // In real implementation, this would trigger the actual optimization
    console.log(`Applying recommendation for ${findingId}: ${finding.recommendation}`);

    // Mark as applied (in real impl, track this)
    finding.metadata.applied = true;
    finding.metadata.appliedAt = Date.now();

    return { success: true, findingId, appliedAt: finding.metadata.appliedAt };
  }

  // ========== Persistence ==========

  _loadResources() {
    const file = path.join(this.storageDir, 'resources.json');
    if (!fs.existsSync(file)) return;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      for (const [id, resource] of Object.entries(data)) {
        this.resources.set(id, resource);
      }
    } catch (err) {
      console.error('Failed to load resources:', err);
    }
  }

  _saveResources() {
    const data = {};
    for (const [id, resource] of this.resources) {
      data[id] = resource;
    }
    fs.writeFileSync(
      path.join(this.storageDir, 'resources.json'),
      JSON.stringify(data, null, 2)
    );
  }

  _saveFindings() {
    fs.writeFileSync(
      path.join(this.storageDir, 'findings.json'),
      JSON.stringify(this.findings.map(f => f.toJSON ? f.toJSON() : f), null, 2)
    );
  }

  // ========== Statistics ==========

  getStats() {
    return {
      totalResources: this.resources.size,
      totalFindings: this.findings.length,
      totalPotentialSavings: this.getTotalPotentialSavings(),
      byCategory: this.getSavingsByCategory(),
      byPriority: this.getSavingsByPriority()
    };
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const optimizer = new CostOptimizer();

  switch (command) {
    case 'add':
      const resource = {
        type: args[1] || 'ec2',
        name: args[2] || 'web-server',
        region: args[3] || 'us-east-1',
        monthlyCost: parseFloat(args[4]) || 100,
        utilization: parseInt(args[5]) || 5,
        idleDays: parseInt(args[6]) || 0
      };
      const id = optimizer.addResource(resource);
      console.log(`Added resource: ${id}`);
      break;

    case 'analyze':
      console.log('Analyzing costs...');
      const findings = optimizer.analyze();
      console.log(`Found ${findings.length} optimization opportunities`);
      break;

    case 'findings':
      const filters = {};
      if (args[1]) filters.priority = args[1];
      if (args[2]) filters.category = args[2];

      console.log('Findings:');
      console.log('========');
      for (const finding of optimizer.getFindings(filters)) {
        console.log(`\n[${finding.priority.toUpperCase()}] ${finding.title}`);
        console.log(`  Savings: $${finding.potentialSavings.toFixed(2)}/month`);
        console.log(`  Recommendation: ${finding.recommendation}`);
      }
      break;

    case 'report':
      console.log('Cost Optimization Report');
      console.log('======================');
      console.log(JSON.stringify(optimizer.generateReport(), null, 2));
      break;

    case 'stats':
      console.log('Statistics');
      console.log('==========');
      console.log(JSON.stringify(optimizer.getStats(), null, 2));
      break;

    case 'resources':
      console.log('Resources:');
      console.log('==========');
      for (const resource of optimizer.listResources()) {
        console.log(`\n${resource.name} (${resource.type})`);
        console.log(`  Cost: $${resource.monthlyCost}/month`);
        console.log(`  Utilization: ${resource.utilization}%`);
      }
      break;

    default:
      console.log('Usage:');
      console.log('  node cost-optimizer.js add <type> <name> <region> <cost> <util%> <idleDays>');
      console.log('  node cost-optimizer.js analyze');
      console.log('  node cost-optimizer.js findings [priority] [category]');
      console.log('  node cost-optimizer.js report');
      console.log('  node cost-optimizer.js stats');
      console.log('  node cost-optimizer.js resources');
      console.log('\nResource Types:', Object.values(ResourceType).join(', '));
      console.log('Priorities:', Object.values(SavingPriority).join(', '));
      console.log('Categories:', Object.values(CostCategory).join(', '));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  CostOptimizer,
  CostFinding,
  ResourceAnalyzer,
  CostCategory,
  ResourceType,
  SavingPriority,
  FindingType
};
