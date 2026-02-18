/**
 * Agent Testing Module
 *
 * Provides testing framework for agents with unit tests, integration tests,
 * and test reporting.
 * Usage: node agent-testing.js [command] [options]
 *
 * Commands:
 *   run <agent-id>          Run tests for specific agent
 *   run-all                 Run all agent tests
 *   suite <name>            Run test suite
 *   report                  Generate test report
 *   demo                    Run demo
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const TESTS_DB = path.join(DATA_DIR, 'testing-tests.json');
const RESULTS_DB = path.join(DATA_DIR, 'testing-results.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON(file, defaultVal = {}) {
  ensureDataDir();
  if (!fs.existsSync(file)) {
    return defaultVal;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return defaultVal;
  }
}

function saveJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/**
 * Test Case
 */
class TestCase {
  constructor(name, fn, options = {}) {
    this.name = name;
    this.fn = fn;
    this.timeout = options.timeout || 5000;
    this.skip = options.skip || false;
    this.only = options.only || false;
    this.retries = options.retries || 0;
  }

  async run() {
    if (this.skip) {
      return { status: 'skipped', name: this.name };
    }

    const startTime = Date.now();
    try {
      const result = await this.executeWithTimeout();
      const duration = Date.now() - startTime;
      return {
        status: 'passed',
        name: this.name,
        duration,
        result
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        status: 'failed',
        name: this.name,
        duration,
        error: error.message
      };
    }
  }

  async executeWithTimeout() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Test timed out after ${this.timeout}ms`));
      }, this.timeout);

      Promise.resolve(this.fn()).then(result => {
        clearTimeout(timer);
        resolve(result);
      }).catch(err => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
}

/**
 * Test Suite
 */
class TestSuite {
  constructor(name) {
    this.name = name;
    this.tests = [];
  }

  beforeEach(fn) {
    this._beforeEach = fn;
  }

  afterEach(fn) {
    this._afterEach = fn;
  }

  beforeAll(fn) {
    this._beforeAll = fn;
  }

  afterAll(fn) {
    this._afterAll = fn;
  }

  addTest(name, fn, options = {}) {
    this.tests.push(new TestCase(name, fn, options));
  }

  async run() {
    const results = {
      suite: this.name,
      tests: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      duration: 0
    };

    const startTime = Date.now();

    // Run beforeAll
    if (this._beforeAll) {
      await this._beforeAll();
    }

    for (const test of this.tests) {
      // Run beforeEach
      if (this._beforeEach) {
        await this._beforeEach();
      }

      const result = await test.run();
      results.tests.push(result);

      if (result.status === 'passed') results.passed++;
      else if (result.status === 'failed') results.failed++;
      else if (result.status === 'skipped') results.skipped++;

      // Run afterEach
      if (this._afterEach) {
        await this._afterEach();
      }
    }

    // Run afterAll
    if (this._afterAll) {
      await this._afterAll();
    }

    results.duration = Date.now() - startTime;
    return results;
  }
}

/**
 * Test Runner
 */
class TestRunner {
  constructor() {
    this.suites = {};
    this.results = loadJSON(RESULTS_DB, []);
  }

  createSuite(name) {
    const suite = new TestSuite(name);
    this.suites[name] = suite;
    return suite;
  }

  async runSuite(name) {
    const suite = this.suites[name];
    if (!suite) {
      return { error: `Suite ${name} not found` };
    }
    return suite.run();
  }

  async runAll() {
    const allResults = {
      suites: [],
      totalTests: 0,
      totalPassed: 0,
      totalFailed: 0,
      totalSkipped: 0,
      duration: 0
    };

    const startTime = Date.now();

    for (const [name, suite] of Object.entries(this.suites)) {
      const result = await suite.run();
      allResults.suites.push(result);
      allResults.totalTests += result.tests.length;
      allResults.totalPassed += result.passed;
      allResults.totalFailed += result.failed;
      allResults.totalSkipped += result.skipped;
    }

    allResults.duration = Date.now() - startTime;

    // Save results
    this.results.unshift(allResults);
    if (this.results.length > 50) {
      this.results = this.results.slice(0, 50);
    }
    saveJSON(RESULTS_DB, this.results);

    return allResults;
  }

  getResults(limit = 10) {
    return this.results.slice(0, limit);
  }

  getLastResult() {
    return this.results[0] || null;
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Testing Framework Demo ===\n');

  const runner = new TestRunner();

  // Create agent registry tests
  const registrySuite = runner.createSuite('AgentRegistry');

  let counter = 0;
  registrySuite.beforeEach(function() {
    counter = 0;
  });

  registrySuite.addTest('should register new agent', () => {
    counter++;
    if (counter !== 1) throw new Error('Expected counter to be 1');
    return { success: true, agentId: 'agent-001' };
  });

  registrySuite.addTest('should list registered agents', () => {
    return { agents: ['agent-001', 'agent-002'] };
  });

  registrySuite.addTest('should handle duplicate registration', () => {
    throw new Error('Duplicate registration not allowed');
  }, { skip: true });

  // Create agent metrics tests
  const metricsSuite = runner.createSuite('AgentMetrics');

  metricsSuite.addTest('should increment counter', () => {
    const counter = { value: 0 };
    counter.value++;
    if (counter.value !== 1) throw new Error('Counter should be 1');
    return counter;
  });

  metricsSuite.addTest('should calculate rate', () => {
    const metrics = { requests: 100, duration: 10 };
    const rate = metrics.requests / metrics.duration;
    return { rate };
  });

  // Run individual suite
  console.log('1. Running AgentRegistry suite:');
  const registryResult = await runner.runSuite('AgentRegistry');
  console.log(`   Passed: ${registryResult.passed}, Failed: ${registryResult.failed}, Skipped: ${registryResult.skipped}`);
  console.log(`   Duration: ${registryResult.duration}ms`);

  // Run all tests
  console.log('\n2. Running all test suites:');
  const allResult = await runner.runAll();
  console.log(`   Total tests: ${allResult.totalTests}`);
  console.log(`   Passed: ${allResult.totalPassed}, Failed: ${allResult.totalFailed}, Skipped: ${allResult.totalSkipped}`);
  console.log(`   Duration: ${allResult.duration}ms`);

  // Show results
  console.log('\n3. Test Results:');
  allResult.suites.forEach(suite => {
    console.log(`   ${suite.suite}: ${suite.passed}/${suite.tests.length} passed`);
  });

  // Generate report
  console.log('\n4. Test Report:');
  const report = generateReport(allResult);
  console.log(report);

  console.log('\n=== Demo Complete ===');
}

function generateReport(results) {
  const passRate = results.totalTests > 0
    ? ((results.totalPassed / results.totalTests) * 100).toFixed(1)
    : 0;

  let report = `
========================================
       AGENT TESTING REPORT
========================================

Total Suites: ${results.suites.length}
Total Tests: ${results.totalTests}
Passed: ${results.totalPassed}
Failed: ${results.totalFailed}
Skipped: ${results.totalSkipped}
Pass Rate: ${passRate}%
Duration: ${results.duration}ms

========================================
       SUITE BREAKDOWN
========================================
`;

  results.suites.forEach(suite => {
    const suiteRate = suite.tests.length > 0
      ? ((suite.passed / suite.tests.length) * 100).toFixed(1)
      : 0;
    report += `
${suite.suite}:
  Tests: ${suite.tests.length}
  Passed: ${suite.passed}
  Failed: ${suite.failed}
  Skipped: ${suite.skipped}
  Pass Rate: ${suiteRate}%
`;
  });

  return report;
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'run') {
  const agentId = args[1];
  console.log(`Running tests for agent: ${agentId}`);
  // Simplified single agent test run
  const runner = new TestRunner();
  const suite = runner.createSuite(agentId);
  suite.addTest('test 1', () => ({ status: 'ok' }));
  suite.run().then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'run-all') {
  const runner = new TestRunner();
  // Add demo suites
  const s1 = runner.createSuite('test1');
  s1.addTest('t1', () => ({ ok: true }));
  runner.runAll().then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'suite') {
  console.log(`Running suite: ${args[1]}`);
} else if (cmd === 'report') {
  const runner = new TestRunner();
  const results = runner.getResults(1);
  if (results.length > 0) {
    console.log(generateReport(results[0]));
  } else {
    console.log('No test results found');
  }
} else if (cmd === 'demo') {
  demo();
} else {
  console.log('Agent Testing Framework');
  console.log('Usage: node agent-testing.js [command]');
  console.log('Commands:');
  console.log('  run <agent-id>    Run tests for specific agent');
  console.log('  run-all           Run all agent tests');
  console.log('  suite <name>      Run test suite');
  console.log('  report            Generate test report');
  console.log('  demo              Run demo');
}
