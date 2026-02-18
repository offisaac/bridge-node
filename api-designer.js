/**
 * API Designer - REST API设计工具与验证
 * 实现REST API设计工具与验证
 */

const fs = require('fs');
const path = require('path');

// ========== HTTP Methods ==========

const HttpMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  PATCH: 'PATCH',
  DELETE: 'DELETE',
  HEAD: 'HEAD',
  OPTIONS: 'OPTIONS'
};

const ParamLocation = {
  PATH: 'path',
  QUERY: 'query',
  HEADER: 'header',
  BODY: 'body'
};

const ParamType = {
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
  ARRAY: 'array',
  OBJECT: 'object',
  FILE: 'file'
};

// ========== API Parameter ==========

class ApiParameter {
  constructor(config) {
    this.name = config.name;
    this.location = config.location || ParamLocation.QUERY;
    this.type = config.type || ParamType.STRING;
    this.required = config.required || false;
    this.description = config.description || '';
    this.default = config.default;
    this.enum = config.enum || null;
    this.schema = config.schema || null;
    this.deprecated = config.deprecated || false;
  }

  toJSON() {
    return {
      name: this.name,
      location: this.location,
      type: this.type,
      required: this.required,
      description: this.description,
      default: this.default,
      enum: this.enum,
      schema: this.schema,
      deprecated: this.deprecated
    };
  }

  validate(value) {
    const errors = [];

    if (this.required && (value === undefined || value === null || value === '')) {
      errors.push(`Parameter '${this.name}' is required`);
      return { valid: false, errors };
    }

    if (value === undefined || value === null) {
      return { valid: true, errors: [] };
    }

    // Type validation
    switch (this.type) {
      case ParamType.STRING:
        if (typeof value !== 'string') {
          errors.push(`Parameter '${this.name}' must be a string`);
        }
        break;
      case ParamType.NUMBER:
      case ParamType.INTEGER:
        if (typeof value !== 'number') {
          errors.push(`Parameter '${this.name}' must be a number`);
        }
        break;
      case ParamType.BOOLEAN:
        if (typeof value !== 'boolean') {
          errors.push(`Parameter '${this.name}' must be a boolean`);
        }
        break;
      case ParamType.ARRAY:
        if (!Array.isArray(value)) {
          errors.push(`Parameter '${this.name}' must be an array`);
        }
        break;
      case ParamType.OBJECT:
        if (typeof value !== 'object' || Array.isArray(value)) {
          errors.push(`Parameter '${this.name}' must be an object`);
        }
        break;
    }

    // Enum validation
    if (this.enum && !this.enum.includes(value)) {
      errors.push(`Parameter '${this.name}' must be one of: ${this.enum.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  }
}

// ========== API Endpoint ==========

class ApiEndpoint {
  constructor(config) {
    this.id = config.id || `endpoint_${Date.now()}`;
    this.path = config.path;
    this.method = config.method || HttpMethod.GET;
    this.summary = config.summary || '';
    this.description = config.description || '';
    this.tags = config.tags || [];
    this.deprecated = config.deprecated || false;

    // Parameters
    this.parameters = (config.parameters || []).map(p =>
      p instanceof ApiParameter ? p : new ApiParameter(p)
    );

    // Request body
    this.requestBody = config.requestBody || null;

    // Responses
    this.responses = config.responses || {};

    // Security
    this.security = config.security || [];
    this.authRequired = config.authRequired !== false;

    // Rate limiting
    this.rateLimit = config.rateLimit || null;
  }

  addParameter(param) {
    const p = param instanceof ApiParameter ? param : new ApiParameter(param);
    this.parameters.push(p);
    return this;
  }

  addResponse(status, response) {
    this.responses[status] = response;
    return this;
  }

  validateRequest(params, body) {
    const errors = [];

    // Validate parameters
    for (const param of this.parameters) {
      let value;
      switch (param.location) {
        case ParamLocation.PATH:
        case ParamLocation.QUERY:
          value = params[param.name];
          break;
        case ParamLocation.HEADER:
          value = params[`header.${param.name}`];
          break;
        case ParamLocation.BODY:
          value = body;
          break;
      }

      const result = param.validate(value);
      if (!result.valid) {
        errors.push(...result.errors);
      }
    }

    // Validate required path parameters
    const pathParams = this.path.match(/{([^}]+)}/g);
    if (pathParams) {
      for (const param of pathParams) {
        const paramName = param.slice(1, -1);
        if (!params[paramName]) {
          errors.push(`Missing required path parameter: ${paramName}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      id: this.id,
      path: this.path,
      method: this.method,
      summary: this.summary,
      description: this.description,
      tags: this.tags,
      deprecated: this.deprecated,
      parameters: this.parameters.map(p => p.toJSON()),
      requestBody: this.requestBody,
      responses: this.responses,
      security: this.security,
      authRequired: this.authRequired,
      rateLimit: this.rateLimit
    };
  }
}

// ========== API Schema ==========

class ApiSchema {
  constructor(config) {
    this.id = config.id || `schema_${Date.now()}`;
    this.name = config.name;
    this.type = config.type || ParamType.OBJECT;
    this.description = config.description || '';
    this.properties = config.properties || {};
    this.required = config.required || [];
    this.example = config.example || null;
    this.enum = config.enum || null;
  }

  addProperty(name, schema, required = false) {
    this.properties[name] = schema;
    if (required) {
      this.required.push(name);
    }
    return this;
  }

  validate(data) {
    const errors = [];

    if (this.type === ParamType.OBJECT) {
      if (typeof data !== 'object' || Array.isArray(data)) {
        errors.push('Data must be an object');
        return { valid: false, errors };
      }

      // Check required properties
      for (const req of this.required) {
        if (!(req in data)) {
          errors.push(`Missing required property: ${req}`);
        }
      }

      // Validate properties
      for (const [key, value] of Object.entries(data)) {
        if (this.properties[key]) {
          const propSchema = this.properties[key];
          if (propSchema.type && typeof value !== propSchema.type) {
            errors.push(`Property '${key}' must be of type ${propSchema.type}`);
          }
        }
      }
    }

    if (this.enum && !this.enum.includes(data)) {
      errors.push(`Value must be one of: ${this.enum.join(', ')}`);
    }

    return { valid: errors.length === 0, errors };
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      description: this.description,
      properties: this.properties,
      required: this.required,
      example: this.example,
      enum: this.enum
    };
  }
}

// ========== API Designer ==========

class ApiDesigner {
  constructor(options = {}) {
    this.endpoints = new Map(); // id -> ApiEndpoint
    this.schemas = new Map(); // id -> ApiSchema
    this.version = options.version || '1.0.0';
    this.title = options.title || 'API';
    this.description = options.description || '';
    this.basePath = options.basePath || '/api';
    this.storageDir = options.storageDir || './api-designer-data';

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
  }

  // ========== Endpoint Management ==========

  addEndpoint(config) {
    const endpoint = new ApiEndpoint(config);
    this.endpoints.set(endpoint.id, endpoint);
    this._saveData();
    return endpoint;
  }

  getEndpoint(id) {
    return this.endpoints.get(id);
  }

  getEndpointByPath(path, method) {
    for (const endpoint of this.endpoints.values()) {
      if (this._matchPath(endpoint.path, path) && endpoint.method === method) {
        return endpoint;
      }
    }
    return null;
  }

  listEndpoints(filters = {}) {
    let result = Array.from(this.endpoints.values());

    if (filters.method) {
      result = result.filter(e => e.method === filters.method);
    }

    if (filters.path) {
      result = result.filter(e => e.path.includes(filters.path));
    }

    if (filters.tag) {
      result = result.filter(e => e.tags.includes(filters.tag));
    }

    if (filters.deprecated !== undefined) {
      result = result.filter(e => e.deprecated === filters.deprecated);
    }

    return result;
  }

  updateEndpoint(id, updates) {
    const existing = this.endpoints.get(id);
    if (!existing) {
      throw new Error(`Endpoint not found: ${id}`);
    }

    const updated = new ApiEndpoint({
      ...existing.toJSON(),
      ...updates,
      id: existing.id
    });

    this.endpoints.set(id, updated);
    this._saveData();
    return updated;
  }

  deleteEndpoint(id) {
    if (!this.endpoints.has(id)) {
      throw new Error(`Endpoint not found: ${id}`);
    }

    this.endpoints.delete(id);
    this._saveData();
    return true;
  }

  // ========== Schema Management ==========

  addSchema(config) {
    const schema = new ApiSchema(config);
    this.schemas.set(schema.id, schema);
    this._saveData();
    return schema;
  }

  getSchema(id) {
    return this.schemas.get(id);
  }

  listSchemas() {
    return Array.from(this.schemas.values());
  }

  // ========== Validation ==========

  _matchPath(pattern, path) {
    // Simple path matching with {param} support
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith('{') && patternParts[i].endsWith('}')) {
        continue;
      }
      if (patternParts[i] !== pathParts[i]) {
        return false;
      }
    }

    return true;
  }

  validateRequest(path, method, params, body) {
    const endpoint = this.getEndpointByPath(path, method);

    if (!endpoint) {
      return {
        valid: false,
        errors: [`No endpoint found for ${method} ${path}`]
      };
    }

    return endpoint.validateRequest(params || {}, body || {});
  }

  // ========== OpenAPI Generation ==========

  generateOpenAPI() {
    const openapi = {
      openapi: '3.0.0',
      info: {
        title: this.title,
        version: this.version,
        description: this.description
      },
      paths: {}
    };

    for (const endpoint of this.endpoints.values()) {
      const pathItem = openapi.paths[endpoint.path] || {};

      const operation = {
        summary: endpoint.summary,
        description: endpoint.description,
        tags: endpoint.tags,
        deprecated: endpoint.deprecated,
        parameters: endpoint.parameters.map(p => ({
          name: p.name,
          in: p.location,
          description: p.description,
          required: p.required,
          schema: { type: p.type },
          ...(p.default !== undefined && { default: p.default }),
          ...(p.enum && { enum: p.enum })
        })),
        responses: {}
      };

      if (endpoint.requestBody) {
        operation.requestBody = {
          content: {
            'application/json': {
              schema: endpoint.requestBody
            }
          }
        };
      }

      for (const [status, response] of Object.entries(endpoint.responses)) {
        operation.responses[status] = {
          description: response.description || '',
          content: response.content ? {
            'application/json': {
              schema: response.schema
            }
          } : undefined
        };
      }

      const method = endpoint.method.toLowerCase();
      pathItem[method] = operation;

      openapi.paths[endpoint.path] = pathItem;
    }

    return openapi;
  }

  // ========== Documentation ==========

  generateMarkdown() {
    let md = `# ${this.title}\n\n`;
    md += `Version: ${this.version}\n\n`;
    md += `${this.description}\n\n`;
    md += `Base Path: ${this.basePath}\n\n`;

    // Group by tags
    const byTag = {};
    for (const endpoint of this.endpoints.values()) {
      const tag = endpoint.tags[0] || 'default';
      if (!byTag[tag]) byTag[tag] = [];
      byTag[tag].push(endpoint);
    }

    for (const [tag, endpoints] of Object.entries(byTag)) {
      md += `## ${tag}\n\n`;

      for (const endpoint of endpoints) {
        md += `### ${endpoint.method} ${endpoint.path}\n\n`;
        md += `${endpoint.summary}\n\n`;
        md += `${endpoint.description}\n\n`;

        if (endpoint.parameters.length > 0) {
          md += `**Parameters:**\n\n`;
          md += `| Name | Location | Type | Required | Description |\n`;
          md += `|------|----------|------|----------|-------------|\n`;
          for (const param of endpoint.parameters) {
            md += `| ${param.name} | ${param.location} | ${param.type} | ${param.required} | ${param.description} |\n`;
          }
          md += '\n';
        }

        if (Object.keys(endpoint.responses).length > 0) {
          md += `**Responses:**\n\n`;
          for (const [status, response] of Object.entries(endpoint.responses)) {
            md += `- ${status}: ${response.description || 'No description'}\n`;
          }
          md += '\n';
        }
      }
    }

    return md;
  }

  // ========== Persistence ==========

  _loadData() {
    const file = path.join(this.storageDir, 'api.json');
    if (!fs.existsSync(file)) return;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));

      this.version = data.version || this.version;
      this.title = data.title || this.title;
      this.description = data.description || this.description;
      this.basePath = data.basePath || this.basePath;

      for (const endpointData of data.endpoints || []) {
        const endpoint = new ApiEndpoint(endpointData);
        this.endpoints.set(endpoint.id, endpoint);
      }

      for (const schemaData of data.schemas || []) {
        const schema = new ApiSchema(schemaData);
        this.schemas.set(schema.id, schema);
      }
    } catch (err) {
      console.error('Failed to load API data:', err);
    }
  }

  _saveData() {
    const data = {
      version: this.version,
      title: this.title,
      description: this.description,
      basePath: this.basePath,
      endpoints: Array.from(this.endpoints.values()).map(e => e.toJSON()),
      schemas: Array.from(this.schemas.values()).map(s => s.toJSON())
    };

    fs.writeFileSync(
      path.join(this.storageDir, 'api.json'),
      JSON.stringify(data, null, 2)
    );
  }

  // ========== Statistics ==========

  getStats() {
    const endpoints = Array.from(this.endpoints.values());

    return {
      totalEndpoints: endpoints.length,
      totalSchemas: this.schemas.size,
      byMethod: endpoints.reduce((acc, e) => {
        acc[e.method] = (acc[e.method] || 0) + 1;
        return acc;
      }, {}),
      byTag: endpoints.reduce((acc, e) => {
        for (const tag of e.tags) {
          acc[tag] = (acc[tag] || 0) + 1;
        }
        return acc;
      }, {}),
      deprecated: endpoints.filter(e => e.deprecated).length
    };
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const designer = new ApiDesigner({
    title: 'User Management API',
    version: '1.0.0',
    description: 'API for managing users'
  });

  switch (command) {
    case 'add':
      const endpoint = designer.addEndpoint({
        path: args[1] || '/users',
        method: args[2] || 'GET',
        summary: 'List users',
        description: 'Get a list of all users',
        tags: ['users'],
        parameters: [
          { name: 'page', location: 'query', type: 'integer', required: false },
          { name: 'limit', location: 'query', type: 'integer', required: false }
        ]
      });
      console.log(`Added endpoint: ${endpoint.method} ${endpoint.path}`);
      break;

    case 'list':
      console.log('Endpoints:');
      console.log('=========');
      for (const endpoint of designer.listEndpoints()) {
        console.log(`\n${endpoint.method} ${endpoint.path}`);
        console.log(`  ${endpoint.summary}`);
        console.log(`  Parameters: ${endpoint.parameters.length}`);
      }
      break;

    case 'validate':
      const result = designer.validateRequest(
        args[1] || '/users',
        args[2] || 'GET',
        { page: '1' },
        {}
      );
      console.log('Validation result:', JSON.stringify(result, null, 2));
      break;

    case 'openapi':
      console.log(JSON.stringify(designer.generateOpenAPI(), null, 2));
      break;

    case 'docs':
      console.log(designer.generateMarkdown());
      break;

    case 'stats':
      console.log('API Designer Statistics:');
      console.log('========================');
      console.log(JSON.stringify(designer.getStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node api-designer.js add <path> <method>       - Add endpoint');
      console.log('  node api-designer.js list                    - List endpoints');
      console.log('  node api-designer.js validate <path> <method> - Validate request');
      console.log('  node api-designer.js openapi                 - Generate OpenAPI spec');
      console.log('  node api-designer.js docs                   - Generate Markdown docs');
      console.log('  node api-designer.js stats                  - Show statistics');
      console.log('\nHTTP Methods:', Object.values(HttpMethod).join(', '));
      console.log('Param Locations:', Object.values(ParamLocation).join(', '));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  ApiDesigner,
  ApiEndpoint,
  ApiParameter,
  ApiSchema,
  HttpMethod,
  ParamLocation,
  ParamType
};
