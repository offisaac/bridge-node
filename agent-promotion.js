/**
 * Agent Promotion - Employee Promotion Management Module
 *
 * Manages promotion criteria, promotion requests, promotion tracking, and career progression.
 *
 * Usage: node agent-promotion.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   list    - List promotion criteria
 *   requests - List promotion requests
 */

class PromotionCriteria {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.fromLevel = config.fromLevel;
    this.toLevel = config.toLevel;
    this.minYearsExperience = config.minYearsExperience || 0;
    this.minPerformanceRating = config.minPerformanceRating || 3.0; // 1-5 scale
    this.requiredSkills = config.requiredSkills || [];
    this.requiredCertifications = config.requiredCertifications || [];
    this.requiredTraining = config.requiredTraining || [];
    this.minProjects = config.minProjects || 0;
    this.minDirectReports = config.minDirectReports || 0;
    this.approvalRequired = config.approvalRequired !== false;
    this.description = config.description || '';
  }

  meetsCriteria(employeeData) {
    if (employeeData.yearsExperience < this.minYearsExperience) return false;
    if (employeeData.performanceRating < this.minPerformanceRating) return false;
    if (this.requiredSkills.length > 0) {
      const hasSkills = this.requiredSkills.every(skill =>
        employeeData.skills.includes(skill)
      );
      if (!hasSkills) return false;
    }
    if (this.requiredCertifications.length > 0) {
      const hasCerts = this.requiredCertifications.every(cert =>
        employeeData.certifications.includes(cert)
      );
      if (!hasCerts) return false;
    }
    if (employeeData.completedProjects < this.minProjects) return false;
    if (employeeData.directReports < this.minDirectReports) return false;
    return true;
  }

  getMissingCriteria(employeeData) {
    const missing = [];

    if (employeeData.yearsExperience < this.minYearsExperience) {
      missing.push(`Need ${this.minYearsExperience} years experience (have ${employeeData.yearsExperience})`);
    }
    if (employeeData.performanceRating < this.minPerformanceRating) {
      missing.push(`Need performance rating ${this.minPerformanceRating} (have ${employeeData.performanceRating})`);
    }
    const missingSkills = this.requiredSkills.filter(s => !employeeData.skills.includes(s));
    if (missingSkills.length > 0) {
      missing.push(`Missing skills: ${missingSkills.join(', ')}`);
    }
    const missingCerts = this.requiredCertifications.filter(c => !employeeData.certifications.includes(c));
    if (missingCerts.length > 0) {
      missing.push(`Missing certifications: ${missingCerts.join(', ')}`);
    }
    if (employeeData.completedProjects < this.minProjects) {
      missing.push(`Need ${this.minProjects} projects (have ${employeeData.completedProjects})`);
    }
    if (employeeData.directReports < this.minDirectReports) {
      missing.push(`Need ${this.minDirectReports} direct reports (have ${employeeData.directReports})`);
    }

    return missing;
  }
}

class PromotionRequest {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.currentLevel = config.currentLevel;
    this.requestedLevel = config.requestedLevel;
    this.requestedAt = config.requestedAt ? new Date(config.requestedAt) : new Date();
    this.requestedBy = config.requestedBy || 'employee'; // 'employee', 'manager', 'hr'
    this.status = config.status || 'pending'; // 'pending', 'approved', 'rejected', 'withdrawn'
    this.effectiveDate = config.effectiveDate ? new Date(config.effectiveDate) : null;
    this.approvedBy = config.approvedBy || null;
    this.approvedAt = config.approvedAt ? new Date(config.approvedAt) : null;
    this.rejectedBy = config.rejectedBy || null;
    this.rejectedAt = config.rejectedAt ? new Date(config.rejectedAt) : null;
    this.rejectionReason = config.rejectionReason || '';
    this.justification = config.justification || '';
    this.supportingDocs = config.supportingDocs || [];
    this.notes = config.notes || '';
  }

  approve(approvedBy, effectiveDate = null) {
    this.status = 'approved';
    this.approvedBy = approvedBy;
    this.approvedAt = new Date();
    if (effectiveDate) {
      this.effectiveDate = new Date(effectiveDate);
    }
  }

  reject(rejectedBy, reason) {
    this.status = 'rejected';
    this.rejectedBy = rejectedBy;
    this.rejectedAt = new Date();
    this.rejectionReason = reason;
  }

  withdraw() {
    this.status = 'withdrawn';
  }
}

class PromotionHistory {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.fromLevel = config.fromLevel;
    this.toLevel = config.toLevel;
    this.promotedAt = config.promotedAt ? new Date(config.promotedAt) : new Date();
    this.promotionType = config.promotionType || 'performance'; // 'performance', 'seniority', 'internal_move'
    this.previousSalary = config.previousSalary || 0;
    this.newSalary = config.newSalary || 0;
    this.salaryIncrease = config.salaryIncrease || 0;
    this.percentageIncrease = config.percentageIncrease || 0;
    this.approvedBy = config.approvedBy || '';
    this.notes = config.notes || '';
  }
}

class CareerLevel {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.level = config.level;
    this.title = config.title;
    this.minSalary = config.minSalary || 0;
    this.maxSalary = config.maxSalary || 0;
    this.description = config.description || '';
    this.skills = config.skills || [];
    this.responsibilities = config.responsibilities || [];
    this.nextLevels = config.nextLevels || []; // promotion paths
  }
}

class PromotionManager {
  constructor() {
    this.criteria = new Map();
    this.requests = new Map();
    this.history = new Map();
    this.levels = new Map();

    this._initializeDefaultLevels();
    this._initializeDefaultCriteria();
  }

  _initializeDefaultLevels() {
    const levels = [
      { id: 'L1', name: 'Entry', level: 1, title: 'Junior Associate', minSalary: 40000, maxSalary: 55000 },
      { id: 'L2', name: 'Associate', level: 2, title: 'Associate', minSalary: 50000, maxSalary: 70000 },
      { id: 'L3', name: 'Senior', level: 3, title: 'Senior Associate', minSalary: 65000, maxSalary: 90000 },
      { id: 'L4', name: 'Lead', level: 4, title: 'Team Lead', minSalary: 85000, maxSalary: 110000 },
      { id: 'L5', name: 'Manager', level: 5, title: 'Manager', minSalary: 100000, maxSalary: 130000 },
      { id: 'L6', name: 'Senior Manager', level: 6, title: 'Senior Manager', minSalary: 120000, maxSalary: 160000 },
      { id: 'L7', name: 'Director', level: 7, title: 'Director', minSalary: 150000, maxSalary: 200000 },
      { id: 'L8', name: 'Senior Director', level: 8, title: 'Senior Director', minSalary: 180000, maxSalary: 250000 },
      { id: 'L9', name: 'VP', level: 9, title: 'Vice President', minSalary: 220000, maxSalary: 300000 },
      { id: 'L10', name: 'Executive', level: 10, title: 'Executive', minSalary: 280000, maxSalary: 500000 }
    ];

    levels.forEach(l => {
      this.levels.set(l.id, new CareerLevel(l));
    });
  }

  _initializeDefaultCriteria() {
    const criteriaList = [
      {
        fromLevel: 'L1', toLevel: 'L2',
        minYearsExperience: 1, minPerformanceRating: 3.0,
        requiredSkills: [], minProjects: 2
      },
      {
        fromLevel: 'L2', toLevel: 'L3',
        minYearsExperience: 2, minPerformanceRating: 3.5,
        requiredSkills: ['Leadership', 'Project Management'], minProjects: 4
      },
      {
        fromLevel: 'L3', toLevel: 'L4',
        minYearsExperience: 3, minPerformanceRating: 4.0,
        requiredSkills: ['Strategic Planning', 'Team Management'],
        requiredCertifications: ['Leadership Certificate'],
        minProjects: 6, minDirectReports: 2
      },
      {
        fromLevel: 'L4', toLevel: 'L5',
        minYearsExperience: 4, minPerformanceRating: 4.0,
        requiredSkills: ['Business Development', 'Budget Management'],
        requiredCertifications: ['Management Certificate'],
        minProjects: 8, minDirectReports: 5
      },
      {
        fromLevel: 'L5', toLevel: 'L6',
        minYearsExperience: 5, minPerformanceRating: 4.5,
        requiredSkills: ['P&L Management', 'Strategic Vision'],
        requiredTraining: ['Executive Leadership Program'],
        minProjects: 10, minDirectReports: 10
      }
    ];

    criteriaList.forEach(c => {
      const criteria = new PromotionCriteria(c);
      this.criteria.set(`${c.fromLevel}-${c.toLevel}`, criteria);
    });
  }

  getCriteria(fromLevel, toLevel) {
    return this.criteria.get(`${fromLevel}-${toLevel}`);
  }

  listCriteria(fromLevel = null) {
    let results = Array.from(this.criteria.values());
    if (fromLevel) {
      results = results.filter(c => c.fromLevel === fromLevel);
    }
    return results;
  }

  getLevel(levelId) {
    return this.levels.get(levelId);
  }

  listLevels() {
    return Array.from(this.levels.values()).sort((a, b) => a.level - b.level);
  }

  checkEligibility(employeeData, toLevel) {
    const currentLevel = this.levels.get(employeeData.level);
    if (!currentLevel) return { eligible: false, reason: 'Current level not found' };

    const criteria = this.criteria.get(`${currentLevel.id}-${toLevel}`);
    if (!criteria) {
      return {
        eligible: false,
        reason: `No promotion path from ${currentLevel.name} to ${toLevel}`
      };
    }

    const eligible = criteria.meetsCriteria(employeeData);
    const missing = eligible ? [] : criteria.getMissingCriteria(employeeData);

    return { eligible, missing };
  }

  submitPromotionRequest(requestConfig) {
    const request = new PromotionRequest(requestConfig);
    this.requests.set(request.id, request);
    return request;
  }

  getRequest(requestId) {
    return this.requests.get(requestId);
  }

  approvePromotion(requestId, approvedBy, effectiveDate = null) {
    const request = this.requests.get(requestId);
    if (!request) throw new Error('Request not found');

    request.approve(approvedBy, effectiveDate);

    // Add to history
    const history = new PromotionHistory({
      employeeId: request.employeeId,
      fromLevel: request.currentLevel,
      toLevel: request.requestedLevel,
      promotedAt: request.effectiveDate || new Date(),
      approvedBy: approvedBy,
      notes: request.justification
    });

    const empHistory = this.history.get(request.employeeId) || [];
    empHistory.push(history);
    this.history.set(request.employeeId, empHistory);

    return request;
  }

  rejectPromotion(requestId, rejectedBy, reason) {
    const request = this.requests.get(requestId);
    if (!request) throw new Error('Request not found');

    request.reject(rejectedBy, reason);
    return request;
  }

  withdrawPromotion(requestId) {
    const request = this.requests.get(requestId);
    if (!request) throw new Error('Request not found');

    request.withdraw();
    return request;
  }

  getEmployeeHistory(employeeId) {
    return this.history.get(employeeId) || [];
  }

  getRequests(status = null, employeeId = null) {
    let results = Array.from(this.requests.values());

    if (status) {
      results = results.filter(r => r.status === status);
    }

    if (employeeId) {
      results = results.filter(r => r.employeeId === employeeId);
    }

    return results.sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
  }

  calculatePromotionSalary(currentSalary, fromLevel, toLevel) {
    const to = this.levels.get(toLevel);
    if (!to) return currentSalary;

    const minSalary = to.minSalary;
    const maxSalary = to.maxSalary;

    // Calculate midpoint increase
    const currentMid = (this.levels.get(fromLevel)?.minSalary + this.levels.get(fromLevel)?.maxSalary) / 2;
    const newMid = (minSalary + maxSalary) / 2;

    let newSalary = Math.round((newMid / currentMid) * currentSalary);

    // Ensure within range
    newSalary = Math.max(minSalary, Math.min(maxSalary, newSalary));

    const increase = newSalary - currentSalary;
    const percentage = Math.round((increase / currentSalary) * 100);

    return { newSalary, increase, percentage, minSalary, maxSalary };
  }

  getPromotionPaths(fromLevel) {
    const level = this.levels.get(fromLevel);
    if (!level) return [];

    const paths = [];
    this.criteria.forEach((criteria, key) => {
      if (criteria.fromLevel === fromLevel) {
        const toLevel = this.levels.get(criteria.toLevel);
        paths.push({
          from: fromLevel,
          to: criteria.toLevel,
          level: toLevel,
          criteria: {
            minYears: criteria.minYearsExperience,
            minRating: criteria.minPerformanceRating,
            requiredSkills: criteria.requiredSkills,
            requiredCerts: criteria.requiredCertifications
          }
        });
      }
    });

    return paths;
  }

  getStatistics() {
    const requests = Array.from(this.requests.values());
    const approved = requests.filter(r => r.status === 'approved').length;
    const pending = requests.filter(r => r.status === 'pending').length;
    const rejected = requests.filter(r => r.status === 'rejected').length;

    const history = Array.from(this.history.values()).flat();
    const avgIncrease = history.length > 0
      ? Math.round(history.reduce((sum, h) => sum + h.percentageIncrease, 0) / history.length)
      : 0;

    return {
      requests: {
        total: requests.length,
        approved,
        pending,
        rejected,
        approvalRate: requests.length > 0 ? Math.round((approved / requests.length) * 100) : 0
      },
      promotions: {
        total: history.length,
        averageIncreasePercent: avgIncrease
      }
    };
  }
}

// Demo function
function runDemo() {
  console.log('=== Agent Promotion Demo\n');

  const manager = new PromotionManager();

  // 1. List career levels
  console.log('1. Career Levels:');
  manager.listLevels().forEach(level => {
    console.log(`   ${level.id}: ${level.title} ($${level.minSalary/1000}k-$${level.maxSalary/1000}k)`);
  });

  // 2. List promotion criteria
  console.log('\n2. Promotion Criteria:');
  manager.listCriteria().forEach(criteria => {
    console.log(`   ${criteria.fromLevel} → ${criteria.toLevel}:`);
    console.log(`      Min Experience: ${criteria.minYearsExperience} years`);
    console.log(`      Min Rating: ${criteria.minPerformanceRating}`);
    if (criteria.requiredSkills.length) console.log(`      Skills: ${criteria.requiredSkills.join(', ')}`);
    if (criteria.requiredCertifications.length) console.log(`      Certs: ${criteria.requiredCertifications.join(', ')}`);
  });

  // 3. Check eligibility
  console.log('\n3. Checking Promotion Eligibility:');
  const employeeData = {
    level: 'L2',
    name: 'John Smith',
    yearsExperience: 2.5,
    performanceRating: 4.2,
    skills: ['Leadership', 'Project Management', 'Python'],
    certifications: [],
    completedProjects: 5,
    directReports: 3,
    currentSalary: 62000
  };

  const eligibility = manager.checkEligibility(employeeData, 'L3');
  console.log(`   Employee: ${employeeData.name} (${employeeData.level})`);
  console.log(`   Target: L3 (Senior Associate)`);
  console.log(`   Eligible: ${eligibility.eligible}`);
  if (!eligibility.eligible && eligibility.missing.length > 0) {
    console.log(`   Missing:`);
    eligibility.missing.forEach(m => console.log(`      - ${m}`));
  }

  // 4. Submit promotion request
  console.log('\n4. Submitting Promotion Request:');
  const request = manager.submitPromotionRequest({
    employeeId: 'emp-042',
    employeeName: 'John Smith',
    currentLevel: 'L2',
    requestedLevel: 'L3',
    requestedBy: 'manager',
    justification: 'Consistently exceeds performance targets, demonstrated leadership skills',
    supportingDocs: ['performance_review_q4.pdf', 'project_list.xlsx']
  });
  console.log(`   Request ID: ${request.id}`);
  console.log(`   From: ${request.currentLevel} → ${request.requestedLevel}`);
  console.log(`   Status: ${request.status}`);

  // 5. Calculate salary impact
  console.log('\n5. Salary Impact Calculation:');
  const salaryCalc = manager.calculatePromotionSalary(62000, 'L2', 'L3');
  console.log(`   Current: $62,000`);
  console.log(`   New Salary: $${salaryCalc.newSalary.toLocaleString()}`);
  console.log(`   Increase: $${salaryCalc.increase.toLocaleString()} (${salaryCalc.percentage}%)`);
  console.log(`   Range: $${salaryCalc.minSalary.toLocaleString()} - $${salaryCalc.maxSalary.toLocaleString()}`);

  // 6. Approve promotion
  console.log('\n6. Approving Promotion:');
  const approved = manager.approvePromotion(request.id, 'HR-Director', '2026-03-01');
  console.log(`   Status: ${approved.status}`);
  console.log(`   Approved By: ${approved.approvedBy}`);
  console.log(`   Effective Date: ${approved.effectiveDate.toISOString().split('T')[0]}`);

  // 7. Promotion paths
  console.log('\n7. Promotion Paths from L3:');
  const paths = manager.getPromotionPaths('L3');
  paths.forEach(path => {
    console.log(`   → ${path.to}: ${path.level.title}`);
    console.log(`      Required: ${path.criteria.minYears} years, ${path.criteria.minRating} rating`);
  });

  // 8. Get employee history
  console.log('\n8. Employee Promotion History:');
  const history = manager.getEmployeeHistory('emp-042');
  history.forEach(h => {
    console.log(`   ${h.fromLevel} → ${h.toLevel} on ${h.promotedAt.toISOString().split('T')[0]}`);
  });

  // 9. List pending requests
  console.log('\n9. Pending Promotion Requests:');
  const pending = manager.getRequests('pending');
  console.log(`   Total Pending: ${pending.length}`);

  // 10. Get statistics
  console.log('\n10. Promotion Statistics:');
  const stats = manager.getStatistics();
  console.log(`    Requests: ${stats.requests.total} total`);
  console.log(`       Approved: ${stats.requests.approved}`);
  console.log(`       Pending: ${stats.requests.pending}`);
  console.log(`       Approval Rate: ${stats.requests.approvalRate}%`);
  console.log(`    Promotions: ${stats.promotions.total} total`);
  console.log(`       Avg Increase: ${stats.promotions.averageIncreasePercent}%`);

  // 11. Another promotion example
  console.log('\n11. Checking L4 → L5 Eligibility:');
  const seniorEmp = {
    level: 'L4',
    name: 'Jane Doe',
    yearsExperience: 5,
    performanceRating: 4.5,
    skills: ['Business Development', 'Budget Management', 'Strategic Planning'],
    certifications: ['Management Certificate'],
    completedProjects: 10,
    directReports: 7,
    currentSalary: 95000
  };
  const l5Eligibility = manager.checkEligibility(seniorEmp, 'L5');
  console.log(`   Employee: ${seniorEmp.name} (${seniorEmp.level})`);
  console.log(`   Target: L5 (Manager)`);
  console.log(`   Eligible: ${l5Eligibility.eligible}`);

  console.log('\n=== Demo Complete ===');
}

// CLI handler
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const manager = new PromotionManager();

switch (command) {
  case 'demo':
    runDemo();
    break;

  case 'list':
    console.log('Promotion Criteria:');
    manager.listCriteria().forEach(c => {
      console.log(`  ${c.fromLevel} → ${c.toLevel}: ${c.minYearsExperience} years, ${c.minPerformanceRating} rating`);
    });
    break;

  case 'requests':
    const status = args[1] || null;
    console.log(`Promotion Requests${status ? ` (${status})` : ''}:`);
    manager.getRequests(status).forEach(r => {
      console.log(`  ${r.employeeName}: ${r.currentLevel} → ${r.requestedLevel} [${r.status}]`);
    });
    break;

  default:
    console.log('Usage: node agent-promotion.js [command]');
    console.log('Commands:');
    console.log('  demo     - Run demonstration');
    console.log('  list     - List promotion criteria');
    console.log('  requests - List promotion requests');
}
