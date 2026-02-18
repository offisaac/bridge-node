/**
 * Agent Training - Training Management Module
 *
 * Manages training programs, courses, enrollments, progress tracking,
 * and completion certifications for employee development.
 *
 * Usage: node agent-training.js [command]
 * Commands:
 *   demo      - Run demonstration
 *   list      - List training programs
 *   progress  - Show enrollment progress
 */

class Course {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.title = config.title;
    this.description = config.description || '';
    this.category = config.category; // technical, leadership, compliance, soft_skill, product
    this.difficulty = config.difficulty || 'intermediate'; // beginner, intermediate, advanced
    this.duration = config.duration; // in minutes
    this.modules = config.modules || [];
    this.prerequisites = config.prerequisites || [];
    this.instructorId = config.instructorId || null;
    this.isActive = config.isActive !== false;
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
  }

  getTotalDuration() {
    if (this.modules.length === 0) return this.duration || 0;
    return this.modules.reduce((sum, m) => sum + (m.duration || 0), 0);
  }
}

class TrainingProgram {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.description = config.description || '';
    this.courses = config.courses || [];
    this.requiredCourses = config.requiredCourses || [];
    this.estimatedDuration = config.estimatedDuration; // total minutes
    this.targetAudience = config.targetAudience || [];
    this.certificateOnCompletion = config.certificateOnCompletion !== false;
    this.validityPeriod = config.validityPeriod || 365; // days
    this.isActive = config.isActive !== false;
    this.createdAt = config.createdAt ? new Date(config.createdAt) : new Date();
  }

  getProgress(employeeId, enrollments) {
    const employeeEnrollments = enrollments.filter(e =>
      e.programId === this.id && e.employeeId === employeeId
    );

    if (employeeEnrollments.length === 0) return { status: 'not_enrolled', progress: 0 };

    const completed = employeeEnrollments.filter(e => e.status === 'completed').length;
    const inProgress = employeeEnrollments.filter(e => e.status === 'in_progress').length;
    const total = this.requiredCourses.length || this.courses.length;

    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    let status = 'not_enrolled';
    if (completed === total && total > 0) status = 'completed';
    else if (inProgress > 0 || completed > 0) status = 'in_progress';

    return { status, progress, completed, total };
  }
}

class Enrollment {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.programId = config.programId;
    this.courseId = config.courseId || null;
    this.status = config.status || 'enrolled'; // enrolled, in_progress, completed, dropped
    this.enrolledAt = config.enrolledAt ? new Date(config.enrolledAt) : new Date();
    this.startedAt = config.startedAt ? new Date(config.startedAt) : null;
    this.completedAt = config.completedAt ? new Date(config.completedAt) : null;
    this.progress = config.progress || 0; // 0-100
    this.score = config.score || null; // quiz/exam score
    this.certificateIssued = config.certificateIssued || false;
    this.certificateId = config.certificateId || null;
  }

  complete(score = null) {
    this.status = 'completed';
    this.completedAt = new Date();
    this.progress = 100;
    if (score !== null) this.score = score;
  }

  updateProgress(percent) {
    this.progress = Math.min(100, Math.max(0, percent));
    if (this.progress > 0 && this.status === 'enrolled') {
      this.status = 'in_progress';
      this.startedAt = new Date();
    }
    if (this.progress >= 100) {
      this.complete();
    }
  }
}

class Certificate {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.certificateNumber = config.certificateNumber || `CERT-${Date.now()}`;
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.programId = config.programId;
    this.programName = config.programName;
    this.issuedAt = config.issuedAt ? new Date(config.issuedAt) : new Date();
    this.expiresAt = config.expiresAt || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    this.isValid = true;
  }

  isExpired() {
    return new Date() > this.expiresAt;
  }
}

class TrainingRecord {
  constructor(config) {
    this.employeeId = config.employeeId;
    this.employeeName = config.employeeName;
    this.enrollments = config.enrollments || [];
    this.certificates = config.certificates || [];
    this.totalTrainingHours = config.totalTrainingHours || 0;
  }

  addEnrollment(enrollment) {
    this.enrollments.push(enrollment);
    this.totalTrainingHours += enrollment.duration || 0;
  }

  getCompletedPrograms() {
    return this.enrollments.filter(e => e.status === 'completed').length;
  }

  getInProgressPrograms() {
    return this.enrollments.filter(e => e.status === 'in_progress').length;
  }
}

class TrainingManager {
  constructor() {
    this.programs = new Map();
    this.courses = new Map();
    this.enrollments = new Map();
    this.certificates = new Map();
    this.employees = new Map();

    this._initializeDefaultCourses();
    this._initializeDefaultPrograms();
    this._initializeSampleEmployees();
    this._initializeSampleEnrollments();
  }

  _initializeDefaultCourses() {
    const defaultCourses = [
      // Technical
      { category: 'technical', title: 'Introduction to Cloud Computing', description: 'Fundamentals of cloud computing', difficulty: 'beginner', duration: 120, modules: [{ title: 'Cloud Basics', duration: 40 }, { title: 'Service Models', duration: 40 }, { title: 'Deployment Models', duration: 40 }] },
      { category: 'technical', title: 'Advanced JavaScript', description: 'Advanced JavaScript patterns', difficulty: 'advanced', duration: 180, modules: [{ title: 'Closures', duration: 45 }, { title: 'Prototypes', duration: 45 }, { title: 'Async Patterns', duration: 45 }, { title: 'Design Patterns', duration: 45 }] },
      { category: 'technical', title: 'Database Design', description: 'Relational database design', difficulty: 'intermediate', duration: 90, modules: [{ title: 'Normalization', duration: 30 }, { title: 'Indexing', duration: 30 }, { title: 'Optimization', duration: 30 }] },

      // Leadership
      { category: 'leadership', title: 'Management Fundamentals', description: 'Core management skills', difficulty: 'intermediate', duration: 60, modules: [{ title: 'Planning', duration: 20 }, { title: 'Organizing', duration: 20 }, { title: 'Controlling', duration: 20 }] },
      { category: 'leadership', title: 'Effective Communication', description: 'Communication for leaders', difficulty: 'beginner', duration: 45, modules: [{ title: 'Active Listening', duration: 15 }, { title: 'Feedback', duration: 15 }, { title: 'Presentation', duration: 15 }] },

      // Compliance
      { category: 'compliance', title: 'Data Privacy Fundamentals', description: 'GDPR and data privacy', difficulty: 'beginner', duration: 60 },
      { category: 'compliance', title: 'Security Awareness', description: 'Information security basics', difficulty: 'beginner', duration: 45 },

      // Soft Skills
      { category: 'soft_skill', title: 'Time Management', description: 'Effective time management', difficulty: 'beginner', duration: 30 },
      { category: 'soft_skill', title: 'Conflict Resolution', description: 'Managing workplace conflicts', difficulty: 'intermediate', duration: 45 },

      // Product
      { category: 'product', title: 'Product Overview', description: 'Company product knowledge', difficulty: 'beginner', duration: 90 }
    ];

    defaultCourses.forEach((course, i) => {
      const courseObj = new Course({ ...course, id: `course-${i + 1}` });
      this.courses.set(courseObj.id, courseObj);
    });
  }

  _initializeDefaultPrograms() {
    const programs = [
      {
        name: 'New Employee Onboarding',
        description: 'Essential training for new hires',
        courses: ['course-7', 'course-10'],
        requiredCourses: ['course-7', 'course-10'],
        estimatedDuration: 150,
        targetAudience: ['new_hire'],
        certificateOnCompletion: true
      },
      {
        name: 'Technical Excellence',
        description: 'Technical skills development track',
        courses: ['course-1', 'course-2', 'course-3'],
        requiredCourses: ['course-1', 'course-3'],
        estimatedDuration: 300,
        targetAudience: ['engineer', 'developer'],
        certificateOnCompletion: true
      },
      {
        name: 'Leadership Development',
        description: 'Management and leadership skills',
        courses: ['course-4', 'course-5', 'course-8'],
        requiredCourses: ['course-4', 'course-5'],
        estimatedDuration: 150,
        targetAudience: ['manager', 'lead'],
        certificateOnCompletion: true
      },
      {
        name: 'Compliance Essentials',
        description: 'Required compliance training',
        courses: ['course-6', 'course-7'],
        requiredCourses: ['course-6', 'course-7'],
        estimatedDuration: 105,
        targetAudience: ['all'],
        certificateOnCompletion: true,
        validityPeriod: 180
      }
    ];

    programs.forEach((prog, i) => {
      const programObj = new TrainingProgram({ ...prog, id: `program-${i + 1}` });
      this.programs.set(programObj.id, programObj);
    });
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

  _initializeSampleEnrollments() {
    // Alice - completed onboarding
    const enroll1 = new Enrollment({
      employeeId: 'EMP001',
      employeeName: 'Alice Johnson',
      programId: 'program-1',
      status: 'completed',
      progress: 100,
      enrolledAt: new Date('2026-01-01'),
      startedAt: new Date('2026-01-01'),
      completedAt: new Date('2026-01-05')
    });
    this.enrollments.set(enroll1.id, enroll1);

    // Alice - in progress on technical excellence
    const enroll2 = new Enrollment({
      employeeId: 'EMP001',
      employeeName: 'Alice Johnson',
      programId: 'program-2',
      status: 'in_progress',
      progress: 66,
      enrolledAt: new Date('2026-01-15'),
      startedAt: new Date('2026-01-16')
    });
    this.enrollments.set(enroll2.id, enroll2);

    // Bob - completed multiple programs
    const enroll3 = new Enrollment({
      employeeId: 'EMP002',
      employeeName: 'Bob Williams',
      programId: 'program-1',
      status: 'completed',
      progress: 100,
      enrolledAt: new Date('2025-12-01'),
      completedAt: new Date('2025-12-10')
    });
    this.enrollments.set(enroll3.id, enroll3);

    const enroll4 = new Enrollment({
      employeeId: 'EMP002',
      employeeName: 'Bob Williams',
      programId: 'program-3',
      status: 'completed',
      progress: 100,
      enrolledAt: new Date('2025-12-15'),
      completedAt: new Date('2026-01-10')
    });
    this.enrollments.set(enroll4.id, enroll4);

    // Carol - just enrolled
    const enroll5 = new Enrollment({
      employeeId: 'EMP003',
      employeeName: 'Carol Davis',
      programId: 'program-1',
      status: 'enrolled',
      progress: 0,
      enrolledAt: new Date('2026-02-01')
    });
    this.enrollments.set(enroll5.id, enroll5);
  }

  createCourse(config) {
    const course = new Course(config);
    this.courses.set(course.id, course);
    return course;
  }

  getCourse(courseId) {
    return this.courses.get(courseId);
  }

  listCourses(category = null) {
    let results = Array.from(this.courses.values());
    if (category) {
      results = results.filter(c => c.category === category);
    }
    return results;
  }

  createProgram(config) {
    const program = new TrainingProgram(config);
    this.programs.set(program.id, program);
    return program;
  }

  getProgram(programId) {
    return this.programs.get(programId);
  }

  listPrograms() {
    return Array.from(this.programs.values());
  }

  enrollEmployee(employeeId, programId) {
    const employee = this.employees.get(employeeId);
    if (!employee) throw new Error('Employee not found');

    const program = this.programs.get(programId);
    if (!program) throw new Error('Training program not found');

    // Check if already enrolled
    const existing = Array.from(this.enrollments.values()).find(e =>
      e.employeeId === employeeId && e.programId === programId
    );
    if (existing) throw new Error('Employee already enrolled');

    const enrollment = new Enrollment({
      employeeId,
      employeeName: employee.name,
      programId
    });

    this.enrollments.set(enrollment.id, enrollment);
    return enrollment;
  }

  getEnrollments(employeeId = null, programId = null) {
    let results = Array.from(this.enrollments.values());

    if (employeeId) {
      results = results.filter(e => e.employeeId === employeeId);
    }

    if (programId) {
      results = results.filter(e => e.programId === programId);
    }

    return results;
  }

  updateProgress(enrollmentId, progress) {
    const enrollment = this.enrollments.get(enrollmentId);
    if (!enrollment) throw new Error('Enrollment not found');

    enrollment.updateProgress(progress);
    return enrollment;
  }

  completeEnrollment(enrollmentId, score = null) {
    const enrollment = this.enrollments.get(enrollmentId);
    if (!enrollment) throw new Error('Enrollment not found');

    enrollment.complete(score);

    // Check if program is complete and issue certificate
    const program = this.programs.get(enrollment.programId);
    if (program?.certificateOnCompletion) {
      const allEnrollments = this.getEnrollments(enrollment.employeeId, enrollment.programId);
      const allCompleted = allEnrollments.every(e => e.status === 'completed');

      if (allCompleted) {
        const cert = this.issueCertificate(enrollment.employeeId, enrollment.programId);
        enrollment.certificateIssued = true;
        enrollment.certificateId = cert.id;
      }
    }

    return enrollment;
  }

  issueCertificate(employeeId, programId) {
    const employee = this.employees.get(employeeId);
    const program = this.programs.get(programId);

    const cert = new Certificate({
      employeeId,
      employeeName: employee?.name || 'Unknown',
      programId,
      programName: program?.name || 'Unknown Program',
      expiresAt: new Date(Date.now() + (program?.validityPeriod || 365) * 24 * 60 * 60 * 1000)
    });

    this.certificates.set(cert.id, cert);
    return cert;
  }

  getCertificates(employeeId = null) {
    let results = Array.from(this.certificates.values());

    if (employeeId) {
      results = results.filter(c => c.employeeId === employeeId);
    }

    return results;
  }

  getEmployeeTrainingRecord(employeeId) {
    const employee = this.employees.get(employeeId);
    if (!employee) throw new Error('Employee not found');

    const enrollments = this.getEnrollments(employeeId);
    const certificates = this.getCertificates(employeeId);

    return new TrainingRecord({
      employeeId,
      employeeName: employee.name,
      enrollments,
      certificates,
      totalTrainingHours: enrollments.reduce((sum, e) => {
        const program = this.programs.get(e.programId);
        return sum + (program?.estimatedDuration || 0) * (e.progress / 100);
      }, 0) / 60
    });
  }

  getProgramStats(programId) {
    const program = this.programs.get(programId);
    if (!program) return null;

    const enrollments = this.getEnrollments(null, programId);

    return {
      programId,
      programName: program.name,
      totalEnrollments: enrollments.length,
      completed: enrollments.filter(e => e.status === 'completed').length,
      inProgress: enrollments.filter(e => e.status === 'in_progress').length,
      enrolled: enrollments.filter(e => e.status === 'enrolled').length,
      dropped: enrollments.filter(e => e.status === 'dropped').length,
      completionRate: enrollments.length > 0
        ? Math.round((enrollments.filter(e => e.status === 'completed').length / enrollments.length) * 100)
        : 0
    };
  }

  getRecommendedPrograms(employeeId) {
    const employee = this.employees.get(employeeId);
    if (!employee) return [];

    const enrollments = this.getEnrollments(employeeId);
    const enrolledProgramIds = enrollments.map(e => e.programId);

    // Recommend programs based on target audience
    return this.listPrograms().filter(p => {
      if (enrolledProgramIds.includes(p.id)) return false;
      if (!p.isActive) return false;
      return p.targetAudience.includes('all') ||
             p.targetAudience.includes(employee.title?.toLowerCase()) ||
             p.targetAudience.includes(employee.department?.toLowerCase());
    });
  }

  getEmployeeList() {
    return Array.from(this.employees.values());
  }
}

// Demo function
function runDemo() {
  console.log('=== Agent Training Demo\n');

  const manager = new TrainingManager();

  // 1. List employees
  console.log('1. Employees:');
  manager.getEmployeeList().forEach(emp => {
    console.log(`   ${emp.id}: ${emp.name} - ${emp.title} (${emp.department})`);
  });

  // 2. List training programs
  console.log('\n2. Training Programs:');
  manager.listPrograms().forEach(prog => {
    console.log(`   ${prog.name}`);
    console.log(`      Description: ${prog.description}`);
    console.log(`      Courses: ${prog.requiredCourses.length} required`);
    console.log(`      Duration: ${prog.estimatedDuration} minutes`);
    console.log(`      Certificate: ${prog.certificateOnCompletion ? 'Yes' : 'No'}`);
    console.log('');
  });

  // 3. List courses
  console.log('\n3. Available Courses:');
  manager.listCourses().forEach(course => {
    console.log(`   ${course.title} [${course.category}] - ${course.difficulty}`);
    console.log(`      Duration: ${course.getTotalDuration()} minutes`);
  });

  // 4. Enroll new employee
  console.log('\n4. Enroll Employee:');
  const newEnrollment = manager.enrollEmployee('EMP004', 'program-2');
  console.log(`   Enrolled EMP004 in Technical Excellence program`);
  console.log(`   Enrollment ID: ${newEnrollment.id}`);

  // 5. Update progress
  console.log('\n5. Update Progress:');
  manager.updateProgress(newEnrollment.id, 33);
  console.log(`   Progress updated to 33%`);

  // 6. Employee training records
  console.log('\n6. Employee Training Records:');
  const record = manager.getEmployeeTrainingRecord('EMP001');
  console.log(`   Employee: ${record.employeeName}`);
  console.log(`   Total Training Hours: ${record.totalTrainingHours.toFixed(1)}`);
  console.log(`   Completed Programs: ${record.getCompletedPrograms()}`);
  console.log(`   In Progress: ${record.getInProgressPrograms()}`);
  console.log(`   Certificates: ${record.certificates.length}`);

  // 7. Program statistics
  console.log('\n7. Program Statistics:');
  const stats = manager.getProgramStats('program-1');
  console.log(`   Program: ${stats.programName}`);
  console.log(`   Total Enrollments: ${stats.totalEnrollments}`);
  console.log(`   Completed: ${stats.completed}`);
  console.log(`   In Progress: ${stats.inProgress}`);
  console.log(`   Completion Rate: ${stats.completionRate}%`);

  // 8. Recommended programs
  console.log('\n8. Recommended Programs for EMP003:');
  const recommended = manager.getRecommendedPrograms('EMP003');
  recommended.forEach(prog => {
    console.log(`   - ${prog.name}`);
  });

  // 9. Complete enrollment and issue certificate
  console.log('\n9. Complete Enrollment:');
  manager.updateProgress(newEnrollment.id, 100);
  const completed = manager.completeEnrollment(newEnrollment.id, 95);
  console.log(`   Enrollment completed with score: ${completed.score}`);
  console.log(`   Certificate Issued: ${completed.certificateIssued}`);

  // 10. View certificates
  console.log('\n10. All Certificates:');
  manager.getCertificates().forEach(cert => {
    console.log(`   ${cert.certificateNumber}: ${cert.employeeName} - ${cert.programName}`);
  });

  console.log('\n=== Demo Complete ===');
}

// CLI handler
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const manager = new TrainingManager();

switch (command) {
  case 'demo':
    runDemo();
    break;

  case 'list':
    console.log('Training Programs:\n');
    manager.listPrograms().forEach(prog => {
      console.log(`${prog.name}`);
      console.log(`  ${prog.description}`);
      console.log(`  Courses: ${prog.requiredCourses.length}, Duration: ${prog.estimatedDuration}min`);
      console.log('');
    });
    break;

  case 'progress':
    const employeeId = args[1] || 'EMP001';
    console.log(`Training Progress for ${employeeId}:\n`);
    const record = manager.getEmployeeTrainingRecord(employeeId);
    console.log(`Employee: ${record.employeeName}`);
    console.log(`Total Training Hours: ${record.totalTrainingHours.toFixed(1)}`);
    console.log('\nEnrollments:');
    record.enrollments.forEach(e => {
      const prog = manager.getProgram(e.programId);
      console.log(`  - ${prog?.name}: ${e.progress}% (${e.status})`);
    });
    console.log(`\nCertificates: ${record.certificates.length}`);
    break;

  default:
    console.log('Usage: node agent-training.js [command]');
    console.log('Commands:');
    console.log('  demo           - Run demonstration');
    console.log('  list           - List training programs');
    console.log('  progress [id]  - Show employee progress');
}
