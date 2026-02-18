/**
 * Agent Performance - Performance Management Agent
 *
 * Manages employee performance reviews, goals, KPIs, and performance metrics.
 *
 * Usage: node agent-performance.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   review  - Create performance review
 *   goals   - List goals
 */

class PerformanceReview {
  constructor(config) {
    this.id = `review-${Date.now()}`;
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.reviewPeriod = config.reviewPeriod; // Q1 2026, Annual 2025, etc.
    this.reviewType = config.reviewType || 'annual'; // annual, quarterly, mid_year, probation
    this.reviewerId = config.reviewerId;
    this.reviewerName = config.reviewerName;
    this.reviewDate = config.reviewDate || Date.now();
    this.status = 'draft'; // draft, submitted, completed
    this.ratings = {}; // { category: score }
    this.overallRating = null;
    this.goals = [];
    this.strengths = [];
    this.improvements = [];
    this.comments = '';
  }

  addRating(category, score) {
    if (score < 1 || score > 5) return false;
    this.ratings[category] = score;
    this.calculateOverall();
    return true;
  }

  calculateOverall() {
    const scores = Object.values(this.ratings);
    if (scores.length === 0) {
      this.overallRating = null;
      return;
    }
    this.overallRating = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  complete() {
    this.status = 'completed';
  }
}

class Goal {
  constructor(config) {
    this.id = `goal-${Date.now()}`;
    this.employeeId = config.employeeId;
    this.title = config.title;
    this.description = config.description;
    this.category = config.category; // performance, development, project, team
    this.priority = config.priority || 'medium'; // low, medium, high, critical
    this.status = 'active'; // active, completed, cancelled, overdue
    this.startDate = config.startDate || Date.now();
    this.dueDate = config.dueDate;
    this.completedDate = null;
    this.progress = config.progress || 0; // 0-100
    this.metrics = config.metrics || [];
  }

  updateProgress(progress) {
    this.progress = Math.min(100, Math.max(0, progress));
    if (this.progress === 100) {
      this.complete();
    }
  }

  complete() {
    this.status = 'completed';
    this.completedDate = Date.now();
  }

  isOverdue() {
    if (this.status === 'completed') return false;
    if (!this.dueDate) return false;
    return Date.now() > new Date(this.dueDate);
  }
}

class PerformanceMetric {
  constructor(config) {
    this.id = `metric-${Date.now()}`;
    this.employeeId = config.employeeId;
    this.name = config.name;
    this.category = config.category; // productivity, quality, teamwork, leadership
    this.targetValue = config.targetValue;
    this.actualValue = config.actualValue || 0;
    this.unit = config.unit || 'count';
    this.period = config.period || 'monthly';
    this.date = config.date || Date.now();
  }

  getAchievementRate() {
    if (!this.targetValue || this.targetValue === 0) return 0;
    return Math.min(100, (this.actualValue / this.targetValue) * 100);
  }
}

class PerformanceAgent {
  constructor(config = {}) {
    this.reviews = new Map();
    this.goals = new Map();
    this.metrics = new Map();
    this.stats = {
      reviewsCompleted: 0,
      goalsCompleted: 0,
      averageRating: 0
    };
  }

  createReview(config) {
    const review = new PerformanceReview(config);
    this.reviews.set(review.id, review);
    console.log(`   Created review for: ${review.employeeName}`);
    return review;
  }

  addRating(reviewId, category, score) {
    const review = this.reviews.get(reviewId);
    if (!review) {
      return { success: false, reason: 'Review not found' };
    }

    const result = review.addRating(category, score);
    if (!result) {
      return { success: false, reason: 'Invalid score (1-5)' };
    }

    console.log(`   Added ${category} rating: ${score}`);
    return { success: true, review };
  }

  completeReview(reviewId) {
    const review = this.reviews.get(reviewId);
    if (!review) {
      return { success: false, reason: 'Review not found' };
    }

    review.complete();
    this.stats.reviewsCompleted++;
    this.stats.averageRating = review.overallRating || 0;
    console.log(`   Completed review: ${review.overallRating?.toFixed(1)}/5`);
    return { success: true, review };
  }

  createGoal(config) {
    const goal = new Goal(config);
    this.goals.set(goal.id, goal);
    console.log(`   Created goal: ${goal.title}`);
    return goal;
  }

  updateGoalProgress(goalId, progress) {
    const goal = this.goals.get(goalId);
    if (!goal) {
      return { success: false, reason: 'Goal not found' };
    }

    goal.updateProgress(progress);
    if (goal.status === 'completed') {
      this.stats.goalsCompleted++;
    }

    console.log(`   Updated goal progress: ${progress}%`);
    return { success: true, goal };
  }

  addMetric(config) {
    const metric = new PerformanceMetric(config);
    this.metrics.set(metric.id, metric);
    console.log(`   Added metric: ${metric.name}`);
    return metric;
  }

  getEmployeeGoals(employeeId) {
    return Array.from(this.goals.values()).filter(g => g.employeeId === employeeId);
  }

  getEmployeeReviews(employeeId) {
    return Array.from(this.reviews.values()).filter(r => r.employeeId === employeeId);
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new PerformanceAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Performance Demo\n');

    // 1. Create Performance Reviews
    console.log('1. Create Performance Reviews:');
    const review1 = agent.createReview({
      employeeId: 'emp-001',
      employeeName: 'John Smith',
      reviewPeriod: 'Q4 2025',
      reviewType: 'quarterly',
      reviewerId: 'mgr-001',
      reviewerName: 'Sarah Johnson'
    });
    const review2 = agent.createReview({
      employeeId: 'emp-002',
      employeeName: 'Emily Chen',
      reviewPeriod: 'Annual 2025',
      reviewType: 'annual',
      reviewerId: 'mgr-002',
      reviewerName: 'Mike Davis'
    });

    // 2. Add Ratings
    console.log('\n2. Add Ratings:');
    agent.addRating(review1.id, 'productivity', 4);
    agent.addRating(review1.id, 'quality', 5);
    agent.addRating(review1.id, 'teamwork', 4);
    agent.addRating(review1.id, 'communication', 3);

    // 3. Complete Reviews
    console.log('\n3. Complete Reviews:');
    agent.completeReview(review1.id);
    agent.addRating(review2.id, 'productivity', 5);
    agent.addRating(review2.id, 'quality', 4);
    agent.addRating(review2.id, 'teamwork', 5);
    agent.completeReview(review2.id);

    // 4. Create Goals
    console.log('\n4. Create Goals:');
    const goal1 = agent.createGoal({
      employeeId: 'emp-001',
      title: 'Complete Cloud Certification',
      description: 'Obtain AWS Solutions Architect certification',
      category: 'development',
      priority: 'high',
      dueDate: Date.now() + 90 * 24 * 60 * 60 * 1000
    });
    const goal2 = agent.createGoal({
      employeeId: 'emp-001',
      title: 'Lead New Project',
      description: 'Lead the migration project to new platform',
      category: 'project',
      priority: 'critical',
      dueDate: Date.now() + 60 * 24 * 60 * 60 * 1000
    });

    // 5. Update Goal Progress
    console.log('\n5. Update Goal Progress:');
    agent.updateGoalProgress(goal1.id, 50);
    agent.updateGoalProgress(goal1.id, 100);

    // 6. Add Metrics
    console.log('\n6. Add Performance Metrics:');
    agent.addMetric({
      employeeId: 'emp-001',
      name: 'Tasks Completed',
      category: 'productivity',
      targetValue: 100,
      actualValue: 95,
      unit: 'tasks'
    });
    agent.addMetric({
      employeeId: 'emp-001',
      name: 'Code Review Coverage',
      category: 'quality',
      targetValue: 100,
      actualValue: 88,
      unit: 'percent'
    });

    // 7. Employee Performance Summary
    console.log('\n7. Employee Performance Summary:');
    const goals = agent.getEmployeeGoals('emp-001');
    const reviews = agent.getEmployeeReviews('emp-001');
    console.log(`   Goals: ${goals.length} total, ${goals.filter(g => g.status === 'completed').length} completed`);
    console.log(`   Reviews: ${reviews.length}`);

    // 8. Statistics
    console.log('\n8. Statistics:');
    const stats = agent.getStats();
    console.log(`   Reviews Completed: ${stats.reviewsCompleted}`);
    console.log(`   Goals Completed: ${stats.goalsCompleted}`);
    console.log(`   Average Rating: ${stats.averageRating.toFixed(1)}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'review':
    console.log('Creating test review...');
    const r = agent.createReview({
      employeeId: 'test-001',
      employeeName: 'Test User',
      reviewPeriod: 'Q1 2026',
      reviewType: 'quarterly',
      reviewerId: 'mgr-001',
      reviewerName: 'Manager'
    });
    console.log(`Created review: ${r.id}`);
    break;

  case 'goals':
    console.log('Listing goals...');
    for (const goal of agent.goals.values()) {
      console.log(`   ${goal.title} - ${goal.status} (${goal.progress}%)`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-performance.js [demo|review|goals]');
}
