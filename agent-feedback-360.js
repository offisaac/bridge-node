/**
 * Agent Feedback 360 - 360-Degree Feedback Management Module
 *
 * Manages 360-degree feedback processes including self-assessment, manager assessment,
 * peer assessment, and direct report assessment with anonymity and analytics.
 *
 * Usage: node agent-feedback-360.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   list    - List feedback cycles
 *   report  - Generate feedback report
 */

class FeedbackQuestion {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.category = config.category; // technical, communication, leadership, teamwork, performance
    this.text = config.text;
    this.type = config.type || 'rating'; // rating, text, boolean
    this.scale = config.scale || 5; // 1-5 or 1-10
    this.isRequired = config.isRequired !== false;
  }
}

class FeedbackResponse {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.questionId = config.questionId;
    this.responderId = config.responderId;
    this.responderName = config.responderName;
    this.responderRole = config.responderRole; // self, manager, peer, direct_report
    this.cycleId = config.cycleId;
    this.rating = config.rating || null;
    this.comment = config.comment || '';
    this.submittedAt = config.submittedAt ? new Date(config.submittedAt) : new Date();
    this.isAnonymous = config.isAnonymous || false;
  }
}

class FeedbackCycle {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description || '';
    this.startDate = config.startDate ? new Date(config.startDate) : new Date();
    this.endDate = config.endDate ? new Date(config.endDate) : new Date();
    this.status = config.status || 'draft'; // draft, active, completed, cancelled
    this.participants = config.participants || []; // Array of {employeeId, employeeName, department}
    this.reviewType = config.reviewType || 'full'; // full, self_only, manager_only
    this.questions = config.questions || [];
    this.createdBy = config.createdBy || 'system';
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
  }

  isActive() {
    const now = new Date();
    return this.status === 'active' && now >= this.startDate && now <= this.endDate;
  }

  activate() {
    this.status = 'active';
  }

  complete() {
    this.status = 'completed';
  }
}

class FeedbackReport {
  constructor(config) {
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.cycleId = config.cycleId;
    this.cycleName = config.cycleName;
    this.selfAssessment = config.selfAssessment || null;
    this.managerAssessment = config.managerAssessment || null;
    this.peerAssessments = config.peerAssessments || [];
    this.directReportAssessments = config.directReportAssessments || [];
    this.averageRatings = config.averageRatings || {};
    this.strengths = config.strengths || [];
    this.improvements = config.improvements || [];
    this.generatedAt = config.generatedAt ? new Date(config.generatedAt) : new Date();
  }

  calculateOverallScore() {
    const allRatings = [];
    if (this.selfAssessment) allRatings.push(this.selfAssessment);
    if (this.managerAssessment) allRatings.push(this.managerAssessment);

    // Calculate average from peer assessments
    if (this.peerAssessments && this.peerAssessments.length > 0) {
      const peerRatings = this.peerAssessments.filter(r => r.rating).map(r => r.rating);
      if (peerRatings.length > 0) {
        allRatings.push(peerRatings.reduce((a, b) => a + b, 0) / peerRatings.length);
      }
    }

    // Calculate average from direct report assessments
    if (this.directReportAssessments && this.directReportAssessments.length > 0) {
      const drRatings = this.directReportAssessments.filter(r => r.rating).map(r => r.rating);
      if (drRatings.length > 0) {
        allRatings.push(drRatings.reduce((a, b) => a + b, 0) / drRatings.length);
      }
    }

    if (allRatings.length === 0) return 0;
    return (allRatings.reduce((a, b) => a + b, 0) / allRatings.length).toFixed(2);
  }
}

class FeedbackManager {
  constructor() {
    this.cycles = new Map();
    this.responses = new Map();
    this.employees = new Map();

    this._initializeDefaultQuestions();
    this._initializeSampleEmployees();
    this._initializeSampleCycle();
  }

  _initializeDefaultQuestions() {
    this.defaultQuestions = [
      // Technical Skills
      { category: 'technical', text: 'Demonstrates technical expertise in their role', type: 'rating' },
      { category: 'technical', text: 'Keeps up-to-date with industry trends and technologies', type: 'rating' },
      { category: 'technical', text: 'Produces high-quality work', type: 'rating' },

      // Communication
      { category: 'communication', text: 'Communicates clearly and effectively', type: 'rating' },
      { category: 'communication', text: 'Listens actively to others', type: 'rating' },
      { category: 'communication', text: 'Provides timely and helpful feedback', type: 'rating' },

      // Leadership
      { category: 'leadership', text: 'Demonstrates strong decision-making skills', type: 'rating' },
      { category: 'leadership', text: 'Motivates and inspires others', type: 'rating' },
      { category: 'leadership', text: 'Takes responsibility for outcomes', type: 'rating' },

      // Teamwork
      { category: 'teamwork', text: 'Collaborates effectively with team members', type: 'rating' },
      { category: 'teamwork', text: 'Supports colleagues in achieving goals', type: 'rating' },
      { category: 'teamwork', text: 'Resolves conflicts constructively', type: 'rating' },

      // Performance
      { category: 'performance', text: 'Meets or exceeds performance goals', type: 'rating' },
      { category: 'performance', text: 'Demonstrates productivity and efficiency', type: 'rating' },
      { category: 'performance', text: 'Shows initiative and takes on challenges', type: 'rating' }
    ].map((q, i) => new FeedbackQuestion({ ...q, id: `q-${i + 1}` }));
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

  _initializeSampleCycle() {
    const cycle = new FeedbackCycle({
      name: 'Q1 2026 Performance Review',
      description: 'Quarterly 360-degree feedback for all employees',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-03-31'),
      status: 'active',
      participants: [
        { employeeId: 'EMP001', employeeName: 'Alice Johnson', department: 'Engineering' },
        { employeeId: 'EMP002', employeeName: 'Bob Williams', department: 'Engineering' },
        { employeeId: 'EMP003', employeeName: 'Carol Davis', department: 'Sales' }
      ],
      questions: this.defaultQuestions
    });
    this.cycles.set(cycle.id, cycle);
  }

  createCycle(config) {
    const cycle = new FeedbackCycle({
      ...config,
      questions: config.questions || this.defaultQuestions
    });
    this.cycles.set(cycle.id, cycle);
    return cycle;
  }

  getCycle(cycleId) {
    return this.cycles.get(cycleId);
  }

  listCycles(status = null) {
    let results = Array.from(this.cycles.values());
    if (status) {
      results = results.filter(c => c.status === status);
    }
    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  submitFeedback(cycleId, feedbackConfig) {
    const cycle = this.cycles.get(cycleId);
    if (!cycle) throw new Error('Feedback cycle not found');

    const response = new FeedbackResponse({
      ...feedbackConfig,
      cycleId
    });

    this.responses.set(response.id, response);
    return response;
  }

  getResponses(cycleId, employeeId = null, questionId = null) {
    let results = Array.from(this.responses.values())
      .filter(r => r.cycleId === cycleId);

    if (employeeId) {
      results = results.filter(r => r.responderId === employeeId);
    }

    if (questionId) {
      results = results.filter(r => r.questionId === questionId);
    }

    return results;
  }

  getFeedbackForEmployee(cycleId, employeeId) {
    const responses = this.getResponses(cycleId, null, null)
      .filter(r => r.responderId !== employeeId); // Exclude self-feedback for analysis

    const selfResponses = this.getResponses(cycleId, employeeId);

    // Group by responder role
    const byRole = {
      self: selfResponses,
      manager: responses.filter(r => r.responderRole === 'manager'),
      peer: responses.filter(r => r.responderRole === 'peer'),
      direct_report: responses.filter(r => r.responderRole === 'direct_report')
    };

    // Calculate averages by category
    const categoryAverages = {};
    this.defaultQuestions.forEach(q => {
      const qResponses = responses.filter(r => r.questionId === q.id);
      if (qResponses.length > 0) {
        const avg = qResponses.reduce((sum, r) => sum + (r.rating || 0), 0) / qResponses.length;
        categoryAverages[q.category] = categoryAverages[q.category]
          ? (categoryAverages[q.category] + avg) / 2
          : avg;
      }
    });

    return {
      cycleId,
      employeeId,
      responses: byRole,
      categoryAverages,
      totalResponses: responses.length
    };
  }

  generateReport(cycleId, employeeId) {
    const employee = this.employees.get(employeeId);
    if (!employee) throw new Error('Employee not found');

    const cycle = this.cycles.get(cycleId);
    if (!cycle) throw new Error('Feedback cycle not found');

    const feedbackData = this.getFeedbackForEmployee(cycleId, employeeId);

    // Calculate scores by role
    const calcAvg = (responses) => {
      if (!responses || responses.length === 0) return null;
      const ratings = responses.filter(r => r.rating).map(r => r.rating);
      return ratings.length > 0
        ? ratings.reduce((a, b) => a + b, 0) / ratings.length
        : null;
    };

    const report = new FeedbackReport({
      employeeId,
      employeeName: employee.name,
      cycleId,
      cycleName: cycle.name,
      selfAssessment: calcAvg(feedbackData.responses.self),
      managerAssessment: calcAvg(feedbackData.responses.manager),
      peerAssessments: feedbackData.responses.peer,
      directReportAssessments: feedbackData.responses.direct_report,
      averageRatings: feedbackData.categoryAverages
    });

    // Identify strengths and improvements
    Object.entries(feedbackData.categoryAverages).forEach(([category, avg]) => {
      if (avg >= 4) {
        report.strengths.push({ category, score: avg.toFixed(2) });
      } else if (avg < 3) {
        report.improvements.push({ category, score: avg.toFixed(2) });
      }
    });

    return report;
  }

  getEmployeeList() {
    return Array.from(this.employees.values());
  }

  getStatistics(cycleId) {
    const cycle = this.cycles.get(cycleId);
    if (!cycle) return null;

    const allResponses = Array.from(this.responses.values())
      .filter(r => r.cycleId === cycleId);

    const byRole = {
      self: allResponses.filter(r => r.responderRole === 'self').length,
      manager: allResponses.filter(r => r.responderRole === 'manager').length,
      peer: allResponses.filter(r => r.responderRole === 'peer').length,
      direct_report: allResponses.filter(r => r.responderRole === 'direct_report').length
    };

    return {
      cycleId: cycle.id,
      cycleName: cycle.name,
      status: cycle.status,
      participants: cycle.participants.length,
      totalResponses: allResponses.length,
      responsesByRole: byRole,
      completionRate: cycle.participants.length > 0
        ? Math.round((allResponses.length / (cycle.participants.length * 4)) * 100)
        : 0
    };
  }
}

// Demo function
function runDemo() {
  console.log('=== Agent Feedback 360 Demo\n');

  const manager = new FeedbackManager();

  // 1. List employees
  console.log('1. Employees:');
  manager.getEmployeeList().forEach(emp => {
    console.log(`   ${emp.id}: ${emp.name} - ${emp.title} (${emp.department})`);
  });

  // 2. List feedback cycles
  console.log('\n2. Feedback Cycles:');
  manager.listCycles().forEach(cycle => {
    console.log(`   ${cycle.name}: ${cycle.status} (${cycle.participants.length} participants)`);
  });

  // 3. Create a new feedback cycle
  console.log('\n3. Create New Feedback Cycle:');
  const newCycle = manager.createCycle({
    name: 'Mid-Year 2026 Review',
    description: 'Bi-annual 360 feedback',
    startDate: new Date('2026-06-01'),
    endDate: new Date('2026-06-30'),
    status: 'draft',
    participants: [
      { employeeId: 'EMP001', employeeName: 'Alice Johnson', department: 'Engineering' },
      { employeeId: 'EMP004', employeeName: 'David Brown', department: 'Engineering' }
    ]
  });
  console.log(`   Created: ${newCycle.name}`);
  console.log(`   ID: ${newCycle.id}`);

  // 4. Activate cycle
  console.log('\n4. Activate Feedback Cycle:');
  newCycle.activate();
  console.log(`   ${newCycle.name} is now ${newCycle.status}`);

  // 5. Submit feedback responses
  console.log('\n5. Submit Feedback Responses:');

  // Self-assessment
  const selfFeedback = manager.submitFeedback(newCycle.id, {
    questionId: 'q-1',
    responderId: 'EMP001',
    responderName: 'Alice Johnson',
    responderRole: 'self',
    rating: 4,
    comment: 'I have improved my technical skills this year'
  });
  console.log(`   ${selfFeedback.responderName} submitted self-assessment`);

  // Peer feedback
  const peerFeedback = manager.submitFeedback(newCycle.id, {
    questionId: 'q-1',
    responderId: 'EMP002',
    responderName: 'Bob Williams',
    responderRole: 'peer',
    rating: 5,
    comment: 'Alice is very knowledgeable',
    isAnonymous: false
  });
  console.log(`   Peer submitted feedback for Alice`);

  // Manager feedback
  const managerFeedback = manager.submitFeedback(newCycle.id, {
    questionId: 'q-1',
    responderId: 'EMP002',
    responderName: 'Bob Williams',
    responderRole: 'manager',
    rating: 4,
    comment: 'Strong performer, continues to grow'
  });
  console.log(`   Manager submitted feedback for Alice`);

  // Direct report feedback
  const drFeedback = manager.submitFeedback(newCycle.id, {
    questionId: 'q-1',
    responderId: 'EMP004',
    responderName: 'David Brown',
    responderRole: 'direct_report',
    rating: 5,
    comment: 'Great mentor and leader'
  });
  console.log(`   Direct report submitted feedback for Alice`);

  // 6. Get feedback data
  console.log('\n6. Get Feedback Data:');
  const feedbackData = manager.getFeedbackForEmployee(newCycle.id, 'EMP001');
  console.log(`   Employee: EMP001`);
  console.log(`   Total Responses: ${feedbackData.totalResponses}`);
  console.log(`   Category Averages:`);
  Object.entries(feedbackData.categoryAverages).forEach(([cat, avg]) => {
    console.log(`      ${cat}: ${avg.toFixed(2)}`);
  });

  // 7. Generate report
  console.log('\n7. Generate 360 Feedback Report:');
  const report = manager.generateReport(newCycle.id, 'EMP001');
  console.log(`   Employee: ${report.employeeName}`);
  console.log(`   Cycle: ${report.cycleName}`);
  console.log(`   Self Assessment: ${report.selfAssessment?.toFixed(2) || 'N/A'}`);
  console.log(`   Manager Assessment: ${report.managerAssessment?.toFixed(2) || 'N/A'}`);
  console.log(`   Overall Score: ${report.calculateOverallScore()}`);
  console.log(`   Strengths: ${report.strengths.map(s => s.category).join(', ') || 'None identified'}`);
  console.log(`   Areas for Improvement: ${report.improvements.map(i => i.category).join(', ') || 'None identified'}`);

  // 8. Get cycle statistics
  console.log('\n8. Feedback Cycle Statistics:');
  const stats = manager.getStatistics(newCycle.id);
  console.log(`   Cycle: ${stats.cycleName}`);
  console.log(`   Status: ${stats.status}`);
  console.log(`   Participants: ${stats.participants}`);
  console.log(`   Total Responses: ${stats.totalResponses}`);
  console.log(`   Completion Rate: ${stats.completionRate}%`);

  // 9. Submit more feedback for demo
  console.log('\n9. Submit Additional Feedback:');
  const questions = manager.defaultQuestions.slice(1, 5);
  questions.forEach((q, i) => {
    manager.submitFeedback(newCycle.id, {
      questionId: q.id,
      responderId: 'EMP002',
      responderName: 'Bob Williams',
      responderRole: 'peer',
      rating: 3 + (i % 3),
      comment: `Feedback on ${q.category}`
    });
  });
  console.log(`   Submitted ${questions.length} additional peer feedbacks`);

  // 10. Updated statistics
  console.log('\n10. Updated Statistics:');
  const updatedStats = manager.getStatistics(newCycle.id);
  console.log(`    Total Responses: ${updatedStats.totalResponses}`);
  console.log(`    Completion Rate: ${updatedStats.completionRate}%`);

  console.log('\n=== Demo Complete ===');
}

// CLI handler
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const manager = new FeedbackManager();

switch (command) {
  case 'demo':
    runDemo();
    break;

  case 'list':
    console.log('Feedback Cycles:\n');
    manager.listCycles().forEach(cycle => {
      console.log(`${cycle.name} [${cycle.status}]`);
      console.log(`  Period: ${cycle.startDate.toISOString().split('T')[0]} - ${cycle.endDate.toISOString().split('T')[0]}`);
      console.log(`  Participants: ${cycle.participants.length}`);
      console.log('');
    });
    break;

  case 'report':
    const cycleId = manager.listCycles('active')[0]?.id;
    if (!cycleId) {
      console.log('No active feedback cycles found');
      break;
    }
    console.log(`Feedback Report for Active Cycle:\n`);
    manager.getEmployeeList().forEach(emp => {
      try {
        const report = manager.generateReport(cycleId, emp.id);
        console.log(`${report.employeeName}:`);
        console.log(`  Overall Score: ${report.calculateOverallScore()}`);
        console.log(`  Self: ${report.selfAssessment?.toFixed(1) || 'N/A'}`);
        console.log(`  Manager: ${report.managerAssessment?.toFixed(1) || 'N/A'}`);
        console.log('');
      } catch (e) {
        // Skip employees with no feedback
      }
    });
    break;

  default:
    console.log('Usage: node agent-feedback-360.js [command]');
    console.log('Commands:');
    console.log('  demo   - Run demonstration');
    console.log('  list   - List feedback cycles');
    console.log('  report - Generate feedback report');
}
