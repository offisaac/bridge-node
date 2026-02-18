/**
 * Agent Session Feedback - Session Feedback Module
 *
 * Collects and manages session feedback.
 *
 * Usage: node agent-session-feedback.js [command]
 */

class Feedback {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.sessionId = config.sessionId;
    this.employeeId = config.employeeId;
    this.rating = config.rating; // 1-5
    this.comment = config.comment || '';
    this.category = config.category || 'general'; // helpful, clarity, accuracy, timing
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
  }
}

class FeedbackManager {
  constructor() {
    this.feedback = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    const data = [
      { sessionId: 's1', employeeId: 'EMP001', rating: 5, comment: 'Very helpful!', category: 'helpful' },
      { sessionId: 's1', employeeId: 'EMP002', rating: 4, comment: 'Good clarity', category: 'clarity' },
      { sessionId: 's2', employeeId: 'EMP001', rating: 3, comment: 'Could be faster', category: 'timing' }
    ];
    data.forEach((f, i) => {
      const fb = new Feedback({ ...f, id: `fb-${i + 1}` });
      this.feedback.set(fb.id, fb);
    });
  }

  submit(config) {
    const fb = new Feedback(config);
    this.feedback.set(fb.id, fb);
    return fb;
  }

  getBySession(sessionId) {
    return Array.from(this.feedback.values()).filter(f => f.sessionId === sessionId);
  }

  getAverageRating(sessionId) {
    const sessionFeedback = this.getBySession(sessionId);
    if (sessionFeedback.length === 0) return 0;
    const sum = sessionFeedback.reduce((a, f) => a + f.rating, 0);
    return (sum / sessionFeedback.length).toFixed(1);
  }
}

function runDemo() {
  console.log('=== Agent Session Feedback Demo\n');
  const mgr = new FeedbackManager();

  console.log('1. Submit Feedback:');
  const fb = mgr.submit({ sessionId: 's3', employeeId: 'EMP003', rating: 5, comment: 'Excellent!' });
  console.log(`   Submitted: Rating ${fb.rating}`);

  console.log('\n2. Session s1 Average:');
  console.log(`   Rating: ${mgr.getAverageRating('s1')}`);

  console.log('\n=== Demo Complete ===');
}

const args = process.argv.slice(2);
if ((args[0] || 'demo') === 'demo') runDemo();
