/**
 * Agent REST Module
 *
 * Provides REST API client with resource mapping, pagination, and validation.
 * Usage: node agent-rest.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   get <resource>        GET resource
 *   list <resource>       List resources
 *   status                 Show REST stats
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const REST_DB = path.join(DATA_DIR, 'rest-state.json');

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
 * REST Resource
 */
class RestResource {
  constructor(client, name, endpoint, options = {}) {
    this.client = client;
    this.name = name;
    this.endpoint = endpoint;
    this.options = {
      basePath: options.basePath || '',
      idField: options.idField || 'id',
      ...options
    };
  }

  buildPath(idOrParams = '') {
    const base = this.options.basePath + this.endpoint;
    if (typeof idOrParams === 'string' && idOrParams) {
      return `${base}/${idOrParams}`;
    }
    if (typeof idOrParams === 'object' && idOrParams.id) {
      return `${base}/${idOrParams.id}`;
    }
    return base;
  }

  async get(id, options = {}) {
    const url = this.buildPath(id);
    return this.client.get(url, options);
  }

  async list(params = {}, options = {}) {
    const url = this.buildPath();
    return this.client.get(url, { ...options, params });
  }

  async create(data, options = {}) {
    const url = this.buildPath();
    return this.client.post(url, data, options);
  }

  async update(id, data, options = {}) {
    const url = this.buildPath(id);
    return this.client.put(url, data, options);
  }

  async patch(id, data, options = {}) {
    const url = this.buildPath(id);
    return this.client.patch(url, data, options);
  }

  async delete(id, options = {}) {
    const url = this.buildPath(id);
    return this.client.delete(url, options);
  }

  async head(id, options = {}) {
    const url = this.buildPath(id);
    return this.client.head(url, options);
  }

  async options(options = {}) {
    const url = this.buildPath();
    return this.client.options(url, options);
  }
}

/**
 * Pagination Handler
 */
class PaginationHandler {
  constructor(options = {}) {
    this.options = {
      pageParam: options.pageParam || 'page',
      limitParam: options.limitParam || 'limit',
      pageSize: options.pageSize || 20,
      maxPages: options.maxPages || 10,
      ...options
    };
  }

  getPageParams(page = 1, limit = this.options.pageSize) {
    return {
      [this.options.pageParam]: page,
      [this.options.limitParam]: limit
    };
  }

  parseResponse(response) {
    const data = response.data;

    return {
      items: data.items || data.data || data.results || [],
      total: data.total || data.count || 0,
      page: data.page || data.currentPage || 1,
      limit: data.limit || data.pageSize || this.options.pageSize,
      totalPages: data.totalPages || Math.ceil((data.total || 0) / (data.limit || this.options.pageSize)),
      hasNext: data.hasNext !== undefined ? data.hasNext : false,
      hasPrev: data.hasPrev !== undefined ? data.hasPrev : false,
      nextPage: data.nextPage || null,
      prevPage: data.prevPage || null
    };
  }

  async *iterate(resource, params = {}, options = {}) {
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= this.options.maxPages) {
      const pageParams = this.getPageParams(page, this.options.pageSize);
      const response = await resource.list({ ...params, ...pageParams }, options);
      const parsed = this.parseResponse(response);

      for (const item of parsed.items) {
        yield item;
      }

      hasMore = parsed.hasNext || (parsed.page < parsed.totalPages);
      page++;
    }
  }
}

/**
 * Query Builder
 */
class QueryBuilder {
  constructor(resource) {
    this.resource = resource;
    this.params = {};
    this.filters = [];
    this.sortFields = [];
    this.includes = [];
    this.fields = [];
  }

  filter(field, operator, value) {
    this.filters.push({ field, operator, value });
    return this;
  }

  eq(field, value) {
    return this.filter(field, 'eq', value);
  }

  ne(field, value) {
    return this.filter(field, 'ne', value);
  }

  gt(field, value) {
    return this.filter(field, 'gt', value);
  }

  gte(field, value) {
    return this.filter(field, 'gte', value);
  }

  lt(field, value) {
    return this.filter(field, 'lt', value);
  }

  lte(field, value) {
    return this.filter(field, 'lte', value);
  }

  in(field, values) {
    return this.filter(field, 'in', values);
  }

  like(field, value) {
    return this.filter(field, 'like', value);
  }

  sort(field, direction = 'asc') {
    this.sortFields.push({ field, direction });
    return this;
  }

  include(...resources) {
    this.includes.push(...resources);
    return this;
  }

  select(...fields) {
    this.fields.push(...fields);
    return this;
  }

  limit(count) {
    this.params.limit = count;
    return this;
  }

  offset(count) {
    this.params.offset = count;
    return this;
  }

  page(num) {
    this.params.page = num;
    return this;
  }

  build() {
    const query = { ...this.params };

    // Build filters
    if (this.filters.length > 0) {
      query.filter = this.filters.map(f => ({
        field: f.field,
        op: f.operator,
        value: f.value
      }));
    }

    // Build sort
    if (this.sortFields.length > 0) {
      query.sort = this.sortFields.map(s => `${s.direction === 'desc' ? '-' : ''}${s.field}`);
    }

    // Include relations
    if (this.includes.length > 0) {
      query.include = this.includes.join(',');
    }

    // Select fields
    if (this.fields.length > 0) {
      query.fields = this.fields.join(',');
    }

    return query;
  }

  async execute() {
    const query = this.build();
    return this.resource.list(query);
  }

  async *executeIterator() {
    const query = this.build();
    const pagination = new PaginationHandler();

    for await (const item of pagination.iterate(this.resource, query)) {
      yield item;
    }
  }
}

/**
 * Request Validator
 */
class RequestValidator {
  constructor(schema = {}) {
    this.schema = schema;
  }

  validate(data, operation = 'create') {
    const errors = [];
    const rules = this.schema[operation] || this.schema;

    for (const [field, rule] of Object.entries(rules)) {
      const value = data[field];

      // Required check
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({ field, error: 'Field is required' });
        continue;
      }

      // Skip further validation if value is empty and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type check
      if (rule.type) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rule.type) {
          errors.push({ field, error: `Expected ${rule.type}, got ${actualType}` });
          continue;
        }
      }

      // Min/Max for numbers
      if (rule.type === 'number' || rule.type === 'integer') {
        if (rule.min !== undefined && value < rule.min) {
          errors.push({ field, error: `Value must be at least ${rule.min}` });
        }
        if (rule.max !== undefined && value > rule.max) {
          errors.push({ field, error: `Value must be at most ${rule.max}` });
        }
      }

      // Min/Max length for strings
      if (rule.type === 'string') {
        if (rule.minLength !== undefined && value.length < rule.minLength) {
          errors.push({ field, error: `Length must be at least ${rule.minLength}` });
        }
        if (rule.maxLength !== undefined && value.length > rule.maxLength) {
          errors.push({ field, error: `Length must be at most ${rule.maxLength}` });
        }
        if (rule.pattern) {
          const regex = new RegExp(rule.pattern);
          if (!regex.test(value)) {
            errors.push({ field, error: `Value does not match pattern ${rule.pattern}` });
          }
        }
      }

      // Enum check
      if (rule.enum && !rule.enum.includes(value)) {
        errors.push({ field, error: `Value must be one of: ${rule.enum.join(', ')}` });
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * REST Client
 */
class RestClient {
  constructor(baseURL, options = {}) {
    this.baseURL = baseURL;
    this.options = {
      timeout: options.timeout || 30000,
      headers: options.headers || {},
      auth: options.auth || null,
      ...options
    };
    this.resources = new Map();
    this.validators = new Map();
  }

  resource(name, endpoint, options = {}) {
    if (!this.resources.has(name)) {
      const resource = new RestResource(this, name, endpoint, options);
      this.resources.set(name, resource);
    }
    return this.resources.get(name);
  }

  registerValidator(name, schema) {
    this.validators.set(name, new RequestValidator(schema));
  }

  validate(name, data, operation = 'create') {
    const validator = this.validators.get(name);
    if (!validator) {
      return { valid: true, errors: [] };
    }
    return validator.validate(data, operation);
  }

  // HTTP methods (using simulated client for demo)
  async get(url, options = {}) {
    return this.simulateRequest('GET', url, null, options);
  }

  async post(url, data, options = {}) {
    return this.simulateRequest('POST', url, data, options);
  }

  async put(url, data, options = {}) {
    return this.simulateRequest('PUT', url, data, options);
  }

  async patch(url, data, options = {}) {
    return this.simulateRequest('PATCH', url, data, options);
  }

  async delete(url, options = {}) {
    return this.simulateRequest('DELETE', url, null, options);
  }

  async head(url, options = {}) {
    return this.simulateRequest('HEAD', url, null, options);
  }

  async options(url, options = {}) {
    return this.simulateRequest('OPTIONS', url, null, options);
  }

  simulateRequest(method, url, data, options) {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      data: data || {
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0
      },
      headers: new Map([['content-type', 'application/json']])
    };
  }

  createQueryBuilder(resourceName) {
    const resource = this.resources.get(resourceName);
    if (!resource) {
      throw new Error(`Resource not found: ${resourceName}`);
    }
    return new QueryBuilder(resource);
  }
}

/**
 * REST API Manager
 */
class AgentRestManager {
  constructor() {
    this.client = null;
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      resources: 0
    };
    this.state = loadJSON(REST_DB, {});
  }

  createClient(baseURL, options = {}) {
    this.client = new RestClient(baseURL, options);
    return this.client;
  }

  getClient() {
    return this.client;
  }

  registerResource(name, endpoint, options = {}) {
    if (!this.client) {
      throw new Error('Create client first');
    }
    this.client.resource(name, endpoint, options);
    this.stats.resources++;
    return this.client;
  }

  registerValidator(name, schema) {
    if (!this.client) {
      throw new Error('Create client first');
    }
    this.client.registerValidator(name, schema);
  }

  async getStats() {
    return { ...this.stats };
  }

  save() {
    saveJSON(REST_DB, { stats: this.stats });
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent REST Demo\n');

  const manager = new AgentRestManager();

  // Create client
  console.log('1. Creating REST Client:');
  const client = manager.createClient('https://api.example.com', {
    timeout: 10000,
    headers: { 'X-API-Key': 'demo-key' }
  });

  console.log(`   Base URL: ${client.baseURL}`);

  // Register resources
  console.log('\n2. Registering Resources:');
  const users = client.resource('users', '/users');
  const posts = client.resource('posts', '/posts');
  const comments = client.resource('comments', '/comments');

  console.log(`   Registered: users, posts, comments`);

  // Register validator
  console.log('\n3. Registering Validator:');
  client.registerValidator('users', {
    create: {
      email: { required: true, type: 'string', pattern: '^[^@]+@[^@]+$' },
      name: { required: true, type: 'string', minLength: 1, maxLength: 100 },
      age: { type: 'integer', min: 0, max: 150 }
    },
    update: {
      email: { type: 'string', pattern: '^[^@]+@[^@]+$' },
      name: { type: 'string', minLength: 1, maxLength: 100 }
    }
  });

  console.log('   Validator registered for users');

  // Validate
  console.log('\n4. Validation:');

  const validUser = { email: 'test@example.com', name: 'Test User', age: 25 };
  const result1 = client.validate('users', validUser, 'create');
  console.log(`   Valid user: ${result1.valid ? 'valid' : 'invalid'}`);

  const invalidUser = { email: 'invalid', name: '' };
  const result2 = client.validate('users', invalidUser, 'create');
  console.log(`   Invalid user: ${result2.valid ? 'valid' : 'invalid'}`);
  for (const err of result2.errors) {
    console.log(`      - ${err.field}: ${err.error}`);
  }

  // CRUD operations
  console.log('\n5. CRUD Operations:');

  const user = await users.get('123');
  console.log(`   GET /users/123: ${user.status}`);

  const userList = await users.list({ page: 1, limit: 10 });
  console.log(`   GET /users: ${userList.status}, total: ${userList.data.total}`);

  const newUser = await users.create({ email: 'new@example.com', name: 'New User' });
  console.log(`   POST /users: ${newUser.status}`);

  const updatedUser = await users.patch('123', { name: 'Updated Name' });
  console.log(`   PATCH /users/123: ${updatedUser.status}`);

  const deleted = await users.delete('123');
  console.log(`   DELETE /users/123: ${deleted.status}`);

  // Query builder
  console.log('\n6. Query Builder:');

  const query = client.createQueryBuilder('users');
  const queryResult = await query
    .eq('status', 'active')
    .gt('age', 18)
    .sort('name', 'desc')
    .limit(10)
    .execute();

  console.log(`   Query executed: ${queryResult.status}`);

  // Pagination
  console.log('\n7. Pagination:');

  const pagination = new PaginationHandler({ pageSize: 5, maxPages: 3 });
  const pageParams = pagination.getPageParams(2, 10);
  console.log(`   Page params: page=${pageParams.page}, limit=${pageParams.limit}`);

  let count = 0;
  for await (const item of pagination.iterate(users, { status: 'active' })) {
    count++;
    if (count >= 3) break;
  }
  console.log(`   Iterated ${count} items`);

  // Stats
  console.log('\n8. Statistics:');
  const stats = await manager.getStats();
  console.log(`   Total Requests: ${stats.totalRequests}`);
  console.log(`   Resources: ${stats.resources}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'get') {
  const manager = new AgentRestManager();
  const client = manager.createClient('https://api.example.com');
  const resource = client.resource('test', '/test');
  resource.get(args[1]).then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'list') {
  const manager = new AgentRestManager();
  const client = manager.createClient('https://api.example.com');
  const resource = client.resource('test', '/test');
  resource.list().then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const manager = new AgentRestManager();
  manager.getStats().then(s => console.log(JSON.stringify(s, null, 2)));
} else {
  console.log('Agent REST Module');
  console.log('Usage: node agent-rest.js [command]');
  console.log('Commands:');
  console.log('  demo              Run demo');
  console.log('  get <resource> GET resource');
  console.log('  list <resource> List resources');
  console.log('  status           Show REST stats');
}
