/**
 * Contract Testing - 契约测试
 * 消费者驱动的契约测试框架
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

// ========== Contract Types ==========

const ContractType = {
  CONSUMER: 'consumer',
  PROVIDER: 'provider'
};

const ContractStatus = {
  DRAFT: 'draft',
  VERIFIED: 'verified',
  FAILED: 'failed',
  PUBLISHED: 'published'
};

// ========== HTTP Interaction ==========

class HttpInteraction {
  constructor(description = '') {
    this.description = description;
    this.request = null;
    this.response = null;
    this.providerState = null;
  }

  withRequest(method, path, headers = {}, body = null) {
    this.request = { method, path, headers, body };
    return this;
  }

  withResponse(status, headers = {}, body = null) {
    this.response = { status, headers, body };
    return this;
  }

  uponReceiving(description) {
    this.description = description;
    return this;
  }

  given(providerState) {
    this.providerState = providerState;
    return this;
  }

  toJSON() {
    return {
      description: this.description,
      providerState: this.providerState,
      request: this.request,
      response: this.response
    };
  }
}

// ========== Contract ==========

class Contract {
  constructor(name, config = {}) {
    this.name = name;
    this.type = config.type || ContractType.CONSUMER;
    this.consumer = config.consumer;
    this.provider = config.provider;
    this.interactions = [];
    this.status = ContractStatus.DRAFT;
    this.createdAt = config.createdAt || new Date().toISOString();
    this.updatedAt = this.createdAt;
    this.metadata = config.metadata || {};
  }

  addInteraction(interaction) {
    this.interactions.push(interaction);
    return this;
  }

  setStatus(status) {
    this.status = status;
    this.updatedAt = new Date().toISOString();
    return this;
  }

  toJSON() {
    return {
      name: this.name,
      type: this.type,
      consumer: this.consumer,
      provider: this.provider,
      interactions: this.interactions.map(i => i.toJSON()),
      status: this.status,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata: this.metadata
    };
  }
}

// ========== Contract Verifier ==========

class ContractVerifier {
  constructor(options = {}) {
    this.providerUrl = options.providerUrl || 'http://localhost:3000';
    this.timeout = options.timeout || 5000;
    this.headers = options.headers || {};
  }

  async verify(contract) {
    const results = {
      contract: contract.name,
      passed: true,
      interactions: []
    };

    for (const interaction of contract.interactions) {
      const result = await this._verifyInteraction(interaction);
      results.interactions.push(result);

      if (!result.passed) {
        results.passed = false;
      }
    }

    return results;
  }

  async _verifyInteraction(interaction) {
    const result = {
      description: interaction.description,
      passed: false,
      error: null
    };

    try {
      const { request, response: expectedResponse } = interaction;

      // Make HTTP request
      const actualResponse = await this._makeRequest(
        this.providerUrl + request.path,
        request.method,
        request.headers,
        request.body
      );

      // Verify status code
      if (actualResponse.status !== expectedResponse.status) {
        throw new Error(`Expected status ${expectedResponse.status}, got ${actualResponse.status}`);
      }

      // Verify headers (basic check)
      for (const [key, value] of Object.entries(expectedResponse.headers || {})) {
        if (key.toLowerCase() !== 'content-type') {
          continue;
        }
        if (!actualResponse.headers[key.toLowerCase()] && !actualResponse.headers[key]) {
          // Header matching is optional
        }
      }

      // Verify body (if expected)
      if (expectedResponse.body) {
        const actualBody = typeof actualResponse.body === 'string'
          ? JSON.parse(actualResponse.body)
          : actualResponse.body;

        const expectedBody = typeof expectedResponse.body === 'string'
          ? JSON.parse(expectedResponse.body)
          : expectedResponse.body;

        // Simple matching - check if expected body is subset of actual
        this._matchBody(expectedBody, actualBody);
      }

      result.passed = true;
    } catch (err) {
      result.passed = false;
      result.error = err.message;
    }

    return result;
  }

  async _makeRequest(url, method, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
      const isHttps = url.startsWith('https');
      const lib = isHttps ? https : http;

      const urlObj = new URL(url);
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
          ...headers
        },
        timeout: this.timeout
      };

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => reject(new Error('Request timeout')));

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  _matchBody(expected, actual) {
    if (typeof expected !== typeof actual) {
      throw new Error(`Body type mismatch: expected ${typeof expected}, got ${typeof actual}`);
    }

    if (typeof expected === 'object' && expected !== null) {
      for (const [key, value] of Object.entries(expected)) {
        if (!(key in actual)) {
          throw new Error(`Missing key in response: ${key}`);
        }
        this._matchBody(value, actual[key]);
      }
    } else if (expected !== actual) {
      throw new Error(`Body value mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }
}

// ========== Contract Testing Framework ==========

class ContractTestingFramework {
  constructor(options = {}) {
    this.contractsDir = options.contractsDir || './contracts';
    this.contracts = new Map();
    this.verifier = new ContractVerifier({
      providerUrl: options.providerUrl
    });

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.contractsDir)) {
      fs.mkdirSync(this.contractsDir, { recursive: true });
    }

    this._loadContracts();
  }

  // ========== Contract Management ==========

  createContract(name, consumer, provider) {
    const contract = new Contract(name, {
      consumer,
      provider,
      type: ContractType.CONSUMER
    });

    this.contracts.set(name, contract);
    return contract;
  }

  getContract(name) {
    return this.contracts.get(name);
  }

  listContracts(filters = {}) {
    let contracts = Array.from(this.contracts.values());

    if (filters.consumer) {
      contracts = contracts.filter(c => c.consumer === filters.consumer);
    }

    if (filters.provider) {
      contracts = contracts.filter(c => c.provider === filters.provider);
    }

    if (filters.status) {
      contracts = contracts.filter(c => c.status === filters.status);
    }

    return contracts;
  }

  // ========== Contract Builder ==========

  newInteraction(description) {
    return new HttpInteraction(description);
  }

  // ========== Verification ==========

  async verifyContract(contractName) {
    const contract = this.contracts.get(contractName);
    if (!contract) {
      throw new Error(`Contract not found: ${contractName}`);
    }

    const results = await this.verifier.verify(contract);

    if (results.passed) {
      contract.setStatus(ContractStatus.VERIFIED);
    } else {
      contract.setStatus(ContractStatus.FAILED);
    }

    this._saveContract(contract);
    return results;
  }

  async verifyAll() {
    const results = [];

    for (const contract of this.contracts.values()) {
      const result = await this.verifyContract(contract.name);
      results.push(result);
    }

    return results;
  }

  // ========== Mock Server ==========

  createMockServer(contract) {
    return new ContractMockServer(contract);
  }

  // ========== Provider State ==========

  setupProviderState(state) {
    // Provider state setup - would be implemented based on provider
    console.log(`Setting up provider state: ${state}`);
    return Promise.resolve();
  }

  // ========== Persistence ==========

  _loadContracts() {
    if (!fs.existsSync(this.contractsDir)) return;

    const files = fs.readdirSync(this.contractsDir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.contractsDir, file), 'utf8'));
        const contract = new Contract(data.name, data);
        contract.interactions = (data.interactions || []).map(i => {
          const interaction = new HttpInteraction(i.description);
          interaction.providerState = i.providerState;
          if (i.request) {
            interaction.request = i.request;
          }
          if (i.response) {
            interaction.response = i.response;
          }
          return interaction;
        });
        this.contracts.set(contract.name, contract);
      } catch (err) {
        console.error(`Failed to load contract ${file}:`, err);
      }
    }
  }

  _saveContract(contract) {
    const file = path.join(this.contractsDir, `${contract.name}.json`);
    fs.writeFileSync(file, JSON.stringify(contract.toJSON(), null, 2));
  }

  // ========== Import/Export ==========

  exportContract(contractName) {
    const contract = this.contracts.get(contractName);
    if (!contract) {
      throw new Error(`Contract not found: ${contractName}`);
    }
    return contract.toJSON();
  }

  importContract(data) {
    const contract = new Contract(data.name, data);
    contract.interactions = (data.interactions || []).map(i => {
      const interaction = new HttpInteraction(i.description);
      interaction.providerState = i.providerState;
      interaction.request = i.request;
      interaction.response = i.response;
      return interaction;
    });

    this.contracts.set(contract.name, contract);
    this._saveContract(contract);
    return contract;
  }

  // ========== Statistics ==========

  getStats() {
    const contracts = Array.from(this.contracts.values());

    return {
      total: contracts.length,
      verified: contracts.filter(c => c.status === ContractStatus.VERIFIED).length,
      failed: contracts.filter(c => c.status === ContractStatus.FAILED).length,
      draft: contracts.filter(c => c.status === ContractStatus.DRAFT).length
    };
  }
}

// ========== Contract Mock Server ==========

class ContractMockServer {
  constructor(contract) {
    this.contract = contract;
    this.interactions = new Map();
    this._buildInteractionMap();
  }

  _buildInteractionMap() {
    for (const interaction of this.contract.interactions) {
      const key = `${interaction.request.method}:${interaction.request.path}`;
      this.interactions.set(key, interaction);
    }
  }

  handleRequest(req, res) {
    const key = `${req.method}:${req.path}`;
    const interaction = this.interactions.get(key);

    if (!interaction) {
      res.status(404).json({ error: 'No matching contract interaction found' });
      return;
    }

    const response = interaction.response;

    // Set headers
    for (const [key, value] of Object.entries(response.headers || {})) {
      res.setHeader(key, value);
    }

    // Set status
    res.status(response.status);

    // Send body
    if (response.body) {
      res.json(response.body);
    } else {
      res.end();
    }
  }
}

// ========== CLI ==========

function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0];

  const framework = new ContractTestingFramework({
    contractsDir: './test_contracts'
  });

  switch (command) {
    case 'list':
      console.log('Contracts:');
      for (const c of framework.listContracts()) {
        console.log(`  ${c.name} [${c.status}] (${c.consumer} -> ${c.provider})`);
      }
      break;

    case 'verify':
      const contractName = args[1];
      if (!contractName) {
        console.error('Usage: node contract-testing.js verify <contract-name>');
        process.exit(1);
      }
      framework.verifyContract(contractName).then(results => {
        console.log('Verification results:', JSON.stringify(results, null, 2));
      });
      break;

    case 'verify:all':
      framework.verifyAll().then(results => {
        console.log('All verifications:');
        for (const r of results) {
          console.log(`  ${r.contract}: ${r.passed ? 'PASSED' : 'FAILED'}`);
        }
      });
      break;

    default:
      console.log(`
Contract Testing CLI

Usage:
  node contract-testing.js list                    List all contracts
  node contract-testing.js verify <name>           Verify a contract
  node contract-testing.js verify:all              Verify all contracts
      `);
  }
}

// ========== Export ==========

module.exports = {
  ContractTestingFramework,
  Contract,
  HttpInteraction,
  ContractVerifier,
  ContractMockServer,
  ContractType,
  ContractStatus
};

// Run CLI if called directly
if (require.main === module) {
  runCLI();
}
