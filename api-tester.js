/**
 * API Tester - API测试器
 * 自动化API测试，支持场景化测试
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ========== Test Types ==========

const TestStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  PASSED: 'passed',
  FAILED: 'failed',
  SKIPPED: 'skipped'
};

const AssertionType = {
  STATUS: 'status',
  HEADER: 'header',
  BODY: 'body',
  JSON: 'json',
  SCHEMA: 'schema',
  RESPONSE_TIME: 'response_time'
};

// ========== Assertion ==========

class Assertion {
  constructor(type, expected, options = {}) {
    this.type = type;
    this.expected = expected;
    this.options = options;
    this.actual = null;
    this.passed = false;
    this.message = null;
  }

  evaluate(response) {
    try {
      switch (this.type) {
        case AssertionType.STATUS:
          this.actual = response.status;
          this.passed = this.actual === this.expected;
          break;

        case AssertionType.HEADER:
          this.actual = response.headers[this.expected.key?.toLowerCase()];
          this.passed = this.actual === this.expected.value;
          break;

        case AssertionType.BODY:
          this.actual = response.body;
          if (typeof this.expected === 'string') {
            this.passed = response.body.includes(this.expected);
          } else if (this.expected instanceof RegExp) {
            this.passed = this.expected.test(response.body);
          }
          break;

        case AssertionType.JSON:
          this.actual = response.json;
          this.passed = this._evaluateJson(this.expected, this.actual);
          break;

        case AssertionType.RESPONSE_TIME:
          this.actual = response.responseTime;
          if (this.expected.operator === 'less_than') {
            this.passed = this.actual < this.expected.value;
          } else if (this.expected.operator === 'greater_than') {
            this.passed = this.actual > this.expected.value;
          } else {
            this.passed = this.actual === this.expected.value;
          }
          break;

        default:
          this.passed = false;
      }

      if (!this.passed && !this.message) {
        this.message = `Expected ${this.type} to be ${JSON.stringify(this.expected)}, got ${JSON.stringify(this.actual)}`;
      }

      return this.passed;
    } catch (err) {
      this.passed = false;
      this.message = err.message;
      return false;
    }
  }

  _evaluateJson(expected, actual) {
    if (typeof expected !== 'object' || expected === null) {
      return expected === actual;
    }

    for (const [key, value] of Object.entries(expected)) {
      if (key.startsWith('$')) {
        // Special operators
        if (key === '$exists') {
          if (value && !(key in actual)) return false;
          if (!value && key in actual) return false;
        } else if (key === '$type') {
          if (typeof actual[key] !== value) return false;
        }
      } else {
        if (!(key in actual)) return false;
        if (!this._evaluateJson(value, actual[key])) return false;
      }
    }

    return true;
  }

  toJSON() {
    return {
      type: this.type,
      expected: this.expected,
      actual: this.actual,
      passed: this.passed,
      message: this.message
    };
  }
}

// ========== Test Request ==========

class TestRequest {
  constructor(method, url, options = {}) {
    this.method = method;
    this.url = url;
    this.headers = options.headers || {};
    this.body = options.body || null;
    this.timeout = options.timeout || 30000;
    this.auth = options.auth || null;
  }

  toHttpOptions() {
    const urlObj = new URL(this.url);
    return {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: this.method,
      headers: this.headers,
      timeout: this.timeout
    };
  }
}

// ========== Test Case ==========

class TestCase {
  constructor(name, config = {}) {
    this.name = name;
    this.description = config.description || '';
    this.request = config.request;
    this.assertions = [];
    this.variables = config.variables || {};
    this.before = config.before || null;
    this.after = config.after || null;
    this.status = TestStatus.PENDING;
    this.result = null;
    this.error = null;
    this.responseTime = null;
  }

  addAssertion(type, expected, options = {}) {
    this.assertions.push(new Assertion(type, expected, options));
    return this;
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      request: this.request,
      assertions: this.assertions.map(a => a.toJSON()),
      status: this.status,
      result: this.result,
      error: this.error,
      responseTime: this.responseTime
    };
  }
}

// ========== Test Suite ==========

class TestSuite {
  constructor(name, config = {}) {
    this.name = name;
    this.description = config.description || '';
    this.baseUrl = config.baseUrl || '';
    this.globalHeaders = config.globalHeaders || {};
    this.variables = config.variables || {};
    this.testCases = [];
    this.beforeAll = config.beforeAll || null;
    this.afterAll = config.afterAll || null;
  }

  addTestCase(testCase) {
    this.testCases.push(testCase);
    return this;
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      baseUrl: this.baseUrl,
      testCases: this.testCases.map(t => t.toJSON())
    };
  }
}

// ========== API Tester ==========

class APITester {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:3000';
    this.timeout = options.timeout || 30000;
    this.defaultHeaders = options.defaultHeaders || {};
    this.variables = options.variables || {};
    this.hooks = options.hooks || {};

    this.results = [];
    this.currentTest = null;
  }

  // ========== Test Execution ==========

  async runTestCase(testCase) {
    const startTime = Date.now();

    testCase.status = TestStatus.RUNNING;
    this.currentTest = testCase;

    // Execute before hook
    if (this.hooks.before) {
      await this.hooks.before(testCase);
    }

    try {
      // Build request URL
      let url = testCase.request.url;
      if (!url.startsWith('http') && this.baseUrl) {
        url = this.baseUrl + (url.startsWith('/') ? url : '/' + url);
      }

      // Replace variables in URL
      url = this._replaceVariables(url);

      // Make request
      const response = await this._makeRequest({
        method: testCase.request.method,
        url,
        headers: { ...this.defaultHeaders, ...testCase.request.headers },
        body: testCase.request.body,
        timeout: testCase.request.timeout || this.timeout
      });

      testCase.responseTime = Date.now() - startTime;

      // Evaluate assertions
      let allPassed = true;
      for (const assertion of testCase.assertions) {
        const passed = assertion.evaluate(response);
        if (!passed) {
          allPassed = false;
          break;
        }
      }

      testCase.status = allPassed ? TestStatus.PASSED : TestStatus.FAILED;
      testCase.result = {
        status: response.status,
        headers: response.headers,
        body: response.body,
        json: response.json,
        responseTime: testCase.responseTime
      };

      // Execute after hook
      if (this.hooks.after) {
        await this.hooks.after(testCase);
      }

    } catch (err) {
      testCase.status = TestStatus.FAILED;
      testCase.error = err.message;
    }

    this.results.push(testCase);
    this.currentTest = null;

    return testCase;
  }

  async runTestSuite(testSuite) {
    const suiteResults = {
      name: testSuite.name,
      description: testSuite.description,
      tests: [],
      passed: 0,
      failed: 0,
      skipped: 0,
      totalTime: 0
    };

    const startTime = Date.now();

    // Execute beforeAll hook
    if (testSuite.beforeAll && this.hooks.beforeAll) {
      await this.hooks.beforeAll(testSuite);
    }

    // Run each test case
    for (const testCase of testSuite.testCases) {
      const result = await this.runTestCase(testCase);
      suiteResults.tests.push(result);

      if (result.status === TestStatus.PASSED) suiteResults.passed++;
      else if (result.status === TestStatus.FAILED) suiteResults.failed++;
      else if (result.status === TestStatus.SKIPPED) suiteResults.skipped++;
    }

    // Execute afterAll hook
    if (testSuite.afterAll && this.hooks.afterAll) {
      await this.hooks.afterAll(testSuite);
    }

    suiteResults.totalTime = Date.now() - startTime;

    return suiteResults;
  }

  // ========== HTTP Request ==========

  async _makeRequest(request) {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const isHttps = request.url.startsWith('https');
      const lib = isHttps ? https : http;

      const urlObj = new URL(request.url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        method: request.method,
        headers: request.headers,
        timeout: request.timeout
      };

      const req = lib.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(body);
          } catch {}

          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
            json,
            responseTime: Date.now() - startTime
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));

      if (request.body) {
        const body = typeof request.body === 'string'
          ? request.body
          : JSON.stringify(request.body);
        req.write(body);
      }

      req.end();
    });
  }

  // ========== Variable Management ==========

  _replaceVariables(str) {
    if (typeof str !== 'string') return str;

    return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return this.variables[key] !== undefined
        ? this.variables[key]
        : match;
    });
  }

  setVariable(key, value) {
    this.variables[key] = value;
    return this;
  }

  getVariable(key) {
    return this.variables[key];
  }

  // ========== Test Builder =========-

  createTestCase(name, method, url) {
    return new TestCase(name, {
      request: { method, url }
    });
  }

  createTestSuite(name) {
    return new TestSuite(name);
  }

  // ========== Results =========-

  getResults() {
    return this.results;
  }

  getSummary() {
    const passed = this.results.filter(r => r.status === TestStatus.PASSED).length;
    const failed = this.results.filter(r => r.status === TestStatus.FAILED).length;
    const skipped = this.results.filter(r => r.status === TestStatus.SKIPPED).length;

    return {
      total: this.results.length,
      passed,
      failed,
      skipped,
      passRate: this.results.length > 0
        ? `${((passed / this.results.length) * 100).toFixed(1)}%`
        : '0%'
    };
  }

  // ========== Import/Export =========-

  exportResults() {
    return {
      timestamp: new Date().toISOString(),
      summary: this.getSummary(),
      results: this.results.map(r => r.toJSON())
    };
  }

  saveResults(filepath) {
    fs.writeFileSync(filepath, JSON.stringify(this.exportResults(), null, 2));
  }
}

// ========== CLI ==========

function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0];

  const tester = new APITester({ baseUrl: args.find(a => a.startsWith('--url='))?.split('=')[1] || 'http://localhost:3000' });

  switch (command) {
    case 'run':
      console.log('Running tests...');
      // Would load and run test file
      break;

    default:
      console.log(`
API Tester CLI

Usage:
  node api-tester.js run --url=http://localhost:3000
      `);
  }
}

// ========== Export ==========

module.exports = {
  APITester,
  TestSuite,
  TestCase,
  TestRequest,
  Assertion,
  TestStatus,
  AssertionType
};

// Run CLI if called directly
if (require.main === module) {
  runCLI();
}
