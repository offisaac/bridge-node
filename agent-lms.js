/**
 * Agent LMS - Learning Management System Agent
 *
 * Manages courses, students, enrollments, and learning progress.
 *
 * Usage: node agent-lms.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   course  - List courses
 *   student - List students
 */

class Course {
  constructor(config) {
    this.id = `course-${Date.now()}`;
    this.title = config.title;
    this.description = config.description || '';
    this.category = config.category || 'general';
    this.difficulty = config.difficulty || 'beginner'; // beginner, intermediate, advanced
    this.duration = config.duration || 0; // hours
    this.modules = config.modules || [];
    this.instructor = config.instructor || 'Unknown';
    this.status = config.status || 'draft'; // draft, published, archived
    this.enrolledCount = 0;
    this.rating = 0;
    this.createdAt = Date.now();
  }

  publish() {
    this.status = 'published';
  }

  archive() {
    this.status = 'archived';
  }

  addModule(module) {
    this.modules.push(module);
  }
}

class Module {
  constructor(config) {
    this.id = `module-${Date.now()}`;
    this.title = config.title;
    this.description = config.description || '';
    this.lessons = config.lessons || [];
    this.duration = config.duration || 0;
    this.order = config.order || 0;
  }

  addLesson(lesson) {
    this.lessons.push(lesson);
  }
}

class Lesson {
  constructor(config) {
    this.id = `lesson-${Date.now()}`;
    this.title = config.title;
    this.type = config.type || 'video'; // video, quiz, reading, assignment
    this.content = config.content || '';
    this.duration = config.duration || 0;
    this.order = config.order || 0;
  }
}

class Student {
  constructor(config) {
    this.id = `student-${Date.now()}`;
    this.name = config.name;
    this.email = config.email;
    this.enrollments = [];
    this.completedCourses = [];
    this.progress = {}; // courseId -> progress percentage
    this.badges = [];
    this.createdAt = Date.now();
  }

  enroll(courseId) {
    if (!this.enrollments.includes(courseId)) {
      this.enrollments.push(courseId);
      this.progress[courseId] = 0;
    }
  }

  completeCourse(courseId) {
    if (!this.completedCourses.includes(courseId)) {
      this.completedCourses.push(courseId);
      this.progress[courseId] = 100;
    }
  }

  updateProgress(courseId, percentage) {
    this.progress[courseId] = Math.min(100, Math.max(0, percentage));
  }

  addBadge(badge) {
    this.badges.push(badge);
  }
}

class Enrollment {
  constructor(config) {
    this.id = `enrollment-${Date.now()}`;
    this.studentId = config.studentId;
    this.courseId = config.courseId;
    this.status = 'active'; // active, completed, dropped
    this.progress = 0;
    this.startDate = Date.now();
    this.completionDate = null;
    this.lastAccessDate = Date.now();
  }

  complete() {
    this.status = 'completed';
    this.progress = 100;
    this.completionDate = Date.now();
  }

  drop() {
    this.status = 'dropped';
  }

  updateProgress(progress) {
    this.progress = Math.min(100, Math.max(0, progress));
    this.lastAccessDate = Date.now();
  }
}

class LMSAgent {
  constructor(config = {}) {
    this.courses = new Map();
    this.students = new Map();
    this.enrollments = new Map();
    this.badges = new Map();
    this.stats = {
      coursesCreated: 0,
      studentsRegistered: 0,
      enrollmentsCount: 0,
      completionsCount: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo courses
    const courses = [
      {
        title: 'Introduction to Web Development',
        description: 'Learn the basics of HTML, CSS, and JavaScript',
        category: 'Technology',
        difficulty: 'beginner',
        duration: 20,
        instructor: 'Dr. Smith'
      },
      {
        title: 'Advanced Python Programming',
        description: 'Master advanced Python concepts and patterns',
        category: 'Technology',
        difficulty: 'advanced',
        duration: 40,
        instructor: 'Prof. Johnson'
      },
      {
        title: 'Digital Marketing Fundamentals',
        description: 'Learn SEO, social media, and content marketing',
        category: 'Marketing',
        difficulty: 'beginner',
        duration: 15,
        instructor: 'Ms. Williams'
      }
    ];

    courses.forEach(c => {
      const course = new Course(c);
      course.publish();
      this.courses.set(course.id, course);
      this.stats.coursesCreated++;

      // Add sample modules
      course.addModule(new Module({
        title: 'Module 1: Getting Started',
        duration: 5,
        order: 1
      }));
      course.addModule(new Module({
        title: 'Module 2: Core Concepts',
        duration: 10,
        order: 2
      }));
    });

    // Demo students
    const students = [
      { name: 'Alice Johnson', email: 'alice@example.com' },
      { name: 'Bob Smith', email: 'bob@example.com' },
      { name: 'Carol Davis', email: 'carol@example.com' }
    ];

    students.forEach(s => {
      const student = new Student(s);
      this.students.set(student.id, student);
      this.stats.studentsRegistered++;
    });

    // Demo enrollments
    const courseIds = Array.from(this.courses.keys());
    const studentIds = Array.from(this.students.keys());

    if (courseIds.length > 0 && studentIds.length > 0) {
      const enrollment = new Enrollment({
        studentId: studentIds[0],
        courseId: courseIds[0]
      });
      enrollment.updateProgress(45);
      this.enrollments.set(enrollment.id, enrollment);
      this.stats.enrollmentsCount++;
    }
  }

  createCourse(config) {
    const course = new Course(config);
    this.courses.set(course.id, course);
    this.stats.coursesCreated++;
    console.log(`   Created course: ${course.title}`);
    return course;
  }

  publishCourse(courseId) {
    const course = this.courses.get(courseId);
    if (!course) {
      return { success: false, reason: 'Course not found' };
    }
    course.publish();
    return { success: true, course };
  }

  registerStudent(config) {
    const student = new Student(config);
    this.students.set(student.id, student);
    this.stats.studentsRegistered++;
    console.log(`   Registered student: ${student.name}`);
    return student;
  }

  enrollStudent(studentId, courseId) {
    const student = this.students.get(studentId);
    const course = this.courses.get(courseId);

    if (!student || !course) {
      return { success: false, reason: 'Student or course not found' };
    }

    const enrollment = new Enrollment({ studentId, courseId });
    student.enroll(courseId);
    course.enrolledCount++;

    this.enrollments.set(enrollment.id, enrollment);
    this.stats.enrollmentsCount++;

    console.log(`   Enrolled ${student.name} in ${course.title}`);
    return { success: true, enrollment };
  }

  updateProgress(enrollmentId, progress) {
    const enrollment = this.enrollments.get(enrollmentId);
    if (!enrollment) {
      return { success: false, reason: 'Enrollment not found' };
    }

    enrollment.updateProgress(progress);

    const student = this.students.get(enrollment.studentId);
    if (student) {
      student.updateProgress(enrollment.courseId, progress);
    }

    if (progress >= 100) {
      enrollment.complete();
      this.stats.completionsCount++;

      const student = this.students.get(enrollment.studentId);
      if (student) {
        student.completeCourse(enrollment.courseId);
      }
    }

    return { success: true, enrollment };
  }

  listCourses(status = null) {
    const courses = Array.from(this.courses.values());
    if (status) {
      return courses.filter(c => c.status === status);
    }
    return courses;
  }

  listStudents() {
    return Array.from(this.students.values());
  }

  listEnrollments(status = null) {
    const enrollments = Array.from(this.enrollments.values());
    if (status) {
      return enrollments.filter(e => e.status === status);
    }
    return enrollments;
  }

  getCourse(courseId) {
    return this.courses.get(courseId);
  }

  getStudent(studentId) {
    return this.students.get(studentId);
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const lms = new LMSAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent LMS Demo\n');

    // 1. List Courses
    console.log('1. List Courses:');
    const courses = lms.listCourses('published');
    courses.forEach(c => {
      console.log(`   - ${c.title} (${c.difficulty}) - ${c.duration}h`);
    });

    // 2. List Students
    console.log('\n2. List Students:');
    const students = lms.listStudents();
    students.forEach(s => {
      console.log(`   - ${s.name} (${s.email})`);
    });

    // 3. Create New Course
    console.log('\n3. Create New Course:');
    const newCourse = lms.createCourse({
      title: 'Machine Learning Basics',
      description: 'Introduction to ML algorithms',
      category: 'Data Science',
      difficulty: 'intermediate',
      duration: 25,
      instructor: 'Dr. AI'
    });
    lms.publishCourse(newCourse.id);

    // 4. Register New Student
    console.log('\n4. Register New Student:');
    const newStudent = lms.registerStudent({
      name: 'David Lee',
      email: 'david@example.com'
    });

    // 5. Enroll Student
    console.log('\n5. Enroll Student:');
    const courseIds = Array.from(lms.courses.keys());
    const studentIds = Array.from(lms.students.keys());
    lms.enrollStudent(studentIds[studentIds.length - 1], courseIds[0]);

    // 6. Update Progress
    console.log('\n6. Update Progress:');
    const enrollments = lms.listEnrollments('active');
    if (enrollments.length > 0) {
      lms.updateProgress(enrollments[0].id, 75);
    }

    // 7. List Active Enrollments
    console.log('\n7. Active Enrollments:');
    const activeEnrollments = lms.listEnrollments('active');
    activeEnrollments.forEach(e => {
      const student = lms.getStudent(e.studentId);
      const course = lms.getCourse(e.courseId);
      console.log(`   - ${student?.name}: ${course?.title} (${e.progress}%)`);
    });

    // 8. Course Statistics
    console.log('\n8. Course Statistics:');
    courses.forEach(c => {
      console.log(`   ${c.title}: ${c.enrolledCount} enrolled, ${c.modules.length} modules`);
    });

    // 9. Student Progress
    console.log('\n9. Student Progress:');
    students.forEach(s => {
      const completed = s.completedCourses.length;
      const inProgress = s.enrollments.length - completed;
      console.log(`   ${s.name}: ${completed} completed, ${inProgress} in progress`);
    });

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = lms.getStats();
    console.log(`   Total Courses: ${stats.coursesCreated}`);
    console.log(`   Total Students: ${stats.studentsRegistered}`);
    console.log(`   Total Enrollments: ${stats.enrollmentsCount}`);
    console.log(`   Completions: ${stats.completionsCount}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'course':
    console.log('Courses:');
    lms.listCourses().forEach(c => {
      console.log(`  ${c.title}: ${c.status}`);
    });
    break;

  case 'student':
    console.log('Students:');
    lms.listStudents().forEach(s => {
      console.log(`  ${s.name}: ${s.email}`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-lms.js [demo|course|student]');
}
