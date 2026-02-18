/**
 * Agent HR - Human Resources Management Agent
 *
 * Core HR functions: employee management, policies, compliance, and HR operations.
 *
 * Usage: node agent-hr.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   add     - Add new employee
 *   list    - List employees
 */

class Employee {
  constructor(config) {
    this.id = `emp-${Date.now()}`;
    this.firstName = config.firstName;
    this.lastName = config.lastName;
    this.email = config.email;
    this.phone = config.phone || '';
    this.department = config.department;
    this.position = config.position;
    this.managerId = config.managerId || null;
    this.hireDate = config.hireDate || Date.now();
    this.status = 'active'; // active, inactive, on_leave, terminated
    this.salary = config.salary || 0;
    this.benefits = [];
    this.skills = config.skills || [];
    this.performanceRating = null;
  }

  getFullName() {
    return `${this.firstName} ${this.lastName}`;
  }
}

class Department {
  constructor(config) {
    this.id = `dept-${Date.now()}`;
    this.name = config.name;
    this.description = config.description || '';
    this.managerId = config.managerId || null;
    this.budget = config.budget || 0;
    this.headcount = 0;
  }
}

class HRPolicy {
  constructor(config) {
    this.id = `policy-${Date.now()}`;
    this.name = config.name;
    this.description = config.description;
    this.category = config.category; // leave, benefits, conduct, safety, compliance
    this.effectiveDate = config.effectiveDate || Date.now();
    this.status = 'active'; // active, draft, archived
  }
}

class HRAgent {
  constructor(config = {}) {
    this.employees = new Map();
    this.departments = new Map();
    this.policies = new Map();
    this.stats = {
      totalEmployees: 0,
      activeEmployees: 0,
      departments: 0
    };
  }

  addEmployee(config) {
    const employee = new Employee(config);
    this.employees.set(employee.id, employee);
    this.stats.totalEmployees++;
    this.stats.activeEmployees++;
    console.log(`   Added employee: ${employee.getFullName()}`);
    return employee;
  }

  updateEmployee(employeeId, updates) {
    const employee = this.employees.get(employeeId);
    if (!employee) {
      return { success: false, reason: 'Employee not found' };
    }
    Object.assign(employee, updates);
    console.log(`   Updated employee: ${employee.getFullName()}`);
    return { success: true, employee };
  }

  terminateEmployee(employeeId, reason) {
    const employee = this.employees.get(employeeId);
    if (!employee) {
      return { success: false, reason: 'Employee not found' };
    }
    employee.status = 'terminated';
    this.stats.activeEmployees--;
    console.log(`   Terminated employee: ${employee.getFullName()}`);
    return { success: true };
  }

  createDepartment(config) {
    const department = new Department(config);
    this.departments.set(department.id, department);
    this.stats.departments++;
    console.log(`   Created department: ${department.name}`);
    return department;
  }

  addPolicy(config) {
    const policy = new HRPolicy(config);
    this.policies.set(policy.id, policy);
    console.log(`   Added policy: ${policy.name}`);
    return policy;
  }

  getEmployee(employeeId) {
    return this.employees.get(employeeId);
  }

  getDepartment(departmentId) {
    return this.departments.get(departmentId);
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new HRAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent HR Demo\n');

    // 1. Create Departments
    console.log('1. Create Departments:');
    const eng = agent.createDepartment({
      name: 'Engineering',
      description: 'Software development team',
      budget: 500000
    });
    const hr = agent.createDepartment({
      name: 'Human Resources',
      description: 'HR operations',
      budget: 100000
    });
    const sales = agent.createDepartment({
      name: 'Sales',
      description: 'Sales and marketing',
      budget: 300000
    });

    // 2. Add Employees
    console.log('\n2. Add Employees:');
    const emp1 = agent.addEmployee({
      firstName: 'John',
      lastName: 'Smith',
      email: 'john.smith@company.com',
      department: 'Engineering',
      position: 'Senior Developer',
      salary: 120000,
      skills: ['JavaScript', 'Python', 'AWS']
    });
    const emp2 = agent.addEmployee({
      firstName: 'Sarah',
      lastName: 'Johnson',
      email: 'sarah.johnson@company.com',
      department: 'Human Resources',
      position: 'HR Manager',
      salary: 85000,
      skills: ['Recruitment', 'Employee Relations']
    });
    const emp3 = agent.addEmployee({
      firstName: 'Mike',
      lastName: 'Davis',
      email: 'mike.davis@company.com',
      department: 'Sales',
      position: 'Sales Executive',
      salary: 75000,
      skills: ['B2B Sales', 'Negotiation']
    });

    // 3. Update Employee
    console.log('\n3. Update Employee:');
    agent.updateEmployee(emp1.id, { performanceRating: 4.5 });

    // 4. Add Policies
    console.log('\n4. Add HR Policies:');
    agent.addPolicy({
      name: 'Remote Work Policy',
      description: 'Guidelines for remote work arrangements',
      category: 'conduct'
    });
    agent.addPolicy({
      name: 'Annual Leave Policy',
      description: 'Employee leave entitlements and procedures',
      category: 'leave'
    });

    // 5. Statistics
    console.log('\n5. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total Employees: ${stats.totalEmployees}`);
    console.log(`   Active Employees: ${stats.activeEmployees}`);
    console.log(`   Departments: ${stats.departments}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'add':
    console.log('Adding test employee...');
    const newEmp = agent.addEmployee({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@company.com',
      department: 'Engineering',
      position: 'Developer',
      salary: 70000
    });
    console.log(`Added: ${newEmp.getFullName()}`);
    break;

  case 'list':
    console.log('Listing employees...');
    for (const emp of agent.employees.values()) {
      console.log(`   ${emp.getFullName()} - ${emp.position} (${emp.department})`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-hr.js [demo|add|list]');
}
