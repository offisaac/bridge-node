/**
 * Agent Recruitment - Recruitment Management Agent
 *
 * Manages job postings, applicant tracking, interviews, and hiring workflow.
 *
 * Usage: node agent-recruitment.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   post    - Post a job
 *   apply   - Apply for job
 */

class JobPosting {
  constructor(config) {
    this.id = `job-${Date.now()}`;
    this.title = config.title;
    this.department = config.department;
    this.location = config.location;
    this.type = config.type; // full_time, part_time, contract, internship
    this.description = config.description;
    this.requirements = config.requirements || [];
    this.salary = config.salary || {};
    this.status = 'open'; // open, closed, draft
    this.postedDate = Date.now();
    this.applicants = [];
  }

  close() {
    this.status = 'closed';
  }
}

class Applicant {
  constructor(config) {
    this.id = `app-${Date.now()}`;
    this.name = config.name;
    this.email = config.email;
    this.phone = config.phone || '';
    this.resume = config.resume || '';
    this.coverLetter = config.coverLetter || '';
    this.experience = config.experience || [];
    this.skills = config.skills || [];
    this.status = 'applied'; // applied, screening, interview, offer, hired, rejected
    this.appliedDate = Date.now();
    this.interviewScore = null;
  }
}

class Interview {
  constructor(config) {
    this.id = `int-${Date.now()}`;
    this.applicantId = config.applicantId;
    this.jobId = config.jobId;
    this.interviewer = config.interviewer;
    this.scheduledAt = config.scheduledAt || null;
    this.type = config.type; // phone, video, onsite
    this.status = 'scheduled'; // scheduled, completed, cancelled
    this.score = null;
    this.notes = '';
  }

  complete(score, notes) {
    this.status = 'completed';
    this.score = score;
    this.notes = notes;
  }
}

class RecruitmentAgent {
  constructor(config = {}) {
    this.jobs = new Map();
    this.applicants = new Map();
    this.interviews = new Map();
    this.stats = {
      jobsPosted: 0,
      totalApplicants: 0,
      hired: 0
    };
  }

  createJob(config) {
    const job = new JobPosting(config);
    this.jobs.set(job.id, job);
    this.stats.jobsPosted++;
    console.log(`   Created job: ${job.title}`);
    return job;
  }

  postJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { success: false, reason: 'Job not found' };
    }
    job.status = 'open';
    console.log(`   Posted job: ${job.title}`);
    return { success: true, job };
  }

  addApplicant(jobId, config) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { success: false, reason: 'Job not found' };
    }

    const applicant = new Applicant(config);
    this.applicants.set(applicant.id, applicant);
    job.applicants.push(applicant.id);
    this.stats.totalApplicants++;

    console.log(`   Added applicant: ${applicant.name} for ${job.title}`);
    return { success: true, applicant };
  }

  updateApplicantStatus(applicantId, status) {
    const applicant = this.applicants.get(applicantId);
    if (!applicant) {
      return { success: false, reason: 'Applicant not found' };
    }
    applicant.status = status;
    console.log(`   Updated ${applicant.name} status to: ${status}`);
    return { success: true, applicant };
  }

  scheduleInterview(applicantId, jobId, interviewer, type) {
    const applicant = this.applicants.get(applicantId);
    if (!applicant) {
      return { success: false, reason: 'Applicant not found' };
    }

    const interview = new Interview({
      applicantId,
      jobId,
      interviewer,
      type
    });
    this.interviews.set(interview.id, interview);

    applicant.status = 'interview';
    console.log(`   Scheduled interview for ${applicant.name}`);
    return { success: true, interview };
  }

  completeInterview(interviewId, score, notes) {
    const interview = this.interviews.get(interviewId);
    if (!interview) {
      return { success: false, reason: 'Interview not found' };
    }

    interview.complete(score, notes);
    const applicant = this.applicants.get(interview.applicantId);
    if (applicant) {
      applicant.interviewScore = score;
    }

    console.log(`   Completed interview with score: ${score}`);
    return { success: true, interview };
  }

  hireApplicant(applicantId) {
    const applicant = this.applicants.get(applicantId);
    if (!applicant) {
      return { success: false, reason: 'Applicant not found' };
    }

    applicant.status = 'hired';
    this.stats.hired++;
    console.log(`   Hired: ${applicant.name}`);
    return { success: true, applicant };
  }

  getJob(jobId) {
    return this.jobs.get(jobId);
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new RecruitmentAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Recruitment Demo\n');

    // 1. Create Job Postings
    console.log('1. Create Job Postings:');
    const job1 = agent.createJob({
      title: 'Senior Software Engineer',
      department: 'Engineering',
      location: 'San Francisco, CA',
      type: 'full_time',
      description: 'Build scalable backend systems',
      requirements: ['5+ years experience', 'Node.js', 'Python'],
      salary: { min: 150000, max: 200000 }
    });
    const job2 = agent.createJob({
      title: 'Product Manager',
      department: 'Product',
      location: 'Remote',
      type: 'full_time',
      description: 'Lead product strategy',
      requirements: ['3+ years PM experience', 'Agile'],
      salary: { min: 130000, max: 170000 }
    });

    // 2. Post Jobs
    console.log('\n2. Post Jobs:');
    agent.postJob(job1.id);
    agent.postJob(job2.id);

    // 3. Add Applicants
    console.log('\n3. Add Applicants:');
    const app1 = agent.addApplicant(job1.id, {
      name: 'Alex Chen',
      email: 'alex@example.com',
      skills: ['Node.js', 'Python', 'AWS'],
      experience: ['Senior Dev at TechCorp', 'Tech Lead at Startup']
    });
    const app2 = agent.addApplicant(job1.id, {
      name: 'Jordan Smith',
      email: 'jordan@example.com',
      skills: ['Java', 'Spring', 'Kubernetes'],
      experience: ['Backend Engineer at BigTech']
    });
    const app3 = agent.addApplicant(job2.id, {
      name: 'Taylor Brown',
      email: 'taylor@example.com',
      skills: ['Product Strategy', 'Agile', 'Analytics'],
      experience: ['PM at TechCompany']
    });

    // 4. Screen Applicants
    console.log('\n4. Screen Applicants:');
    agent.updateApplicantStatus(app1.applicant.id, 'screening');
    agent.updateApplicantStatus(app2.applicant.id, 'screening');

    // 5. Schedule Interviews
    console.log('\n5. Schedule Interviews:');
    agent.scheduleInterview(app1.applicant.id, job1.id, 'John Doe', 'video');
    agent.scheduleInterview(app2.applicant.id, job1.id, 'Jane Smith', 'onsite');

    // 6. Complete Interviews
    console.log('\n6. Complete Interviews:');
    const interviews = Array.from(agent.interviews.values());
    if (interviews.length > 0) {
      agent.completeInterview(interviews[0].id, 85, 'Strong technical skills, good communication');
    }

    // 7. Hire
    console.log('\n7. Hire Candidate:');
    agent.hireApplicant(app1.applicant.id);

    // 8. Statistics
    console.log('\n8. Statistics:');
    const stats = agent.getStats();
    console.log(`   Jobs Posted: ${stats.jobsPosted}`);
    console.log(`   Total Applicants: ${stats.totalApplicants}`);
    console.log(`   Hired: ${stats.hired}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'post':
    console.log('Posting test job...');
    const j = agent.createJob({
      title: 'Developer',
      department: 'Engineering',
      location: 'Remote',
      type: 'full_time'
    });
    agent.postJob(j.id);
    break;

  case 'apply':
    console.log('Applying for job...');
    const job = agent.createJob({ title: 'Test Job', department: 'Test', location: 'Remote', type: 'full_time' });
    const app = agent.addApplicant(job.id, { name: 'Test User', email: 'test@test.com' });
    console.log(`Applied: ${app.success}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-recruitment.js [demo|post|apply]');
}
