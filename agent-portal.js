/**
 * Agent Portal - Developer Portal Agent
 *
 * Manages developer portal, API documentation, and service catalog.
 *
 * Usage: node agent-portal.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   services   - List services
 *   docs       - List API docs
 */

class APIDoc {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.version = config.version;
    this.endpoint = config.endpoint;
    this.method = config.method || 'GET';
    this.description = config.description || '';
    this.params = config.params || [];
    this.response = config.response || {};
    this.auth = config.auth || 'none';
  }
}

class Service {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type; // api, library, tool, agent
    this.description = config.description || '';
    this.owner = config.owner;
    this.team = config.team;
    this.repository = config.repository || null;
    this.documentation = config.documentation || null;
    this.status = config.status || 'active';
    this.version = config.version || '1.0.0';
    this.endpoints = config.endpoints || [];
    this.tags = config.tags || [];
  }
}

class DeveloperPortal {
  constructor() {
    this.services = new Map();
    this.docs = new Map();
    this.categories = new Map();
    this._initSampleData();
  }

  _initSampleData() {
    // Sample categories
    const categories = [
      { name: 'Core Services', description: 'Core infrastructure services' },
      { name: 'Data Services', description: 'Database and storage services' },
      { name: 'API Gateway', description: 'API management and routing' },
      { name: 'Monitoring', description: 'Observability and monitoring' },
      { name: 'Security', description: 'Security and authentication' }
    ];

    categories.forEach(c => {
      this.categories.set(c.name, c);
    });

    // Sample services
    const services = [
      {
        name: 'User Service',
        type: 'api',
        description: 'User management and authentication',
        owner: 'Platform Team',
        team: 'identity',
        repository: 'https://github.com/company/user-service',
        documentation: 'https://docs.company.com/user-service',
        status: 'active',
        version: '2.5.0',
        tags: ['auth', 'users', 'identity']
      },
      {
        name: 'Payment Gateway',
        type: 'api',
        description: 'Payment processing and transactions',
        owner: 'Finance Team',
        team: 'payments',
        repository: 'https://github.com/company/payment-gateway',
        documentation: 'https://docs.company.com/payment-gateway',
        status: 'active',
        version: '1.8.0',
        tags: ['payments', 'finance', 'transactions']
      },
      {
        name: 'Notification Service',
        type: 'api',
        description: 'Email, SMS, and push notifications',
        owner: 'Platform Team',
        team: 'communications',
        repository: 'https://github.com/company/notification-service',
        status: 'active',
        version: '3.2.0',
        tags: ['notifications', 'email', 'sms']
      },
      {
        name: 'Analytics Engine',
        type: 'tool',
        description: 'Data analytics and reporting',
        owner: 'Data Team',
        team: 'analytics',
        repository: 'https://github.com/company/analytics-engine',
        documentation: 'https://docs.company.com/analytics',
        status: 'active',
        version: '4.0.0',
        tags: ['analytics', 'reporting', 'data']
      },
      {
        name: 'Search Service',
        type: 'api',
        description: 'Full-text search and indexing',
        owner: 'Platform Team',
        team: 'search',
        repository: 'https://github.com/company/search-service',
        status: 'active',
        version: '1.5.0',
        tags: ['search', 'elasticsearch', 'indexing']
      },
      {
        name: 'ML Pipeline',
        type: 'tool',
        description: 'Machine learning model training and serving',
        owner: 'ML Team',
        team: 'ml',
        repository: 'https://github.com/company/ml-pipeline',
        documentation: 'https://docs.company.com/ml',
        status: 'beta',
        version: '0.9.0',
        tags: ['ml', 'ai', 'models']
      }
    ];

    services.forEach(s => {
      const service = new Service(s);
      this.services.set(service.id, service);
    });

    // Sample API docs
    const docs = [
      { name: 'Create User', version: 'v1', endpoint: '/users', method: 'POST', description: 'Create a new user', auth: 'api-key' },
      { name: 'Get User', version: 'v1', endpoint: '/users/{id}', method: 'GET', description: 'Get user by ID', auth: 'jwt' },
      { name: 'Update User', version: 'v1', endpoint: '/users/{id}', method: 'PUT', description: 'Update user details', auth: 'jwt' },
      { name: 'Delete User', version: 'v1', endpoint: '/users/{id}', method: 'DELETE', description: 'Delete a user', auth: 'admin' },
      { name: 'Process Payment', version: 'v1', endpoint: '/payments', method: 'POST', description: 'Process payment', auth: 'oauth' },
      { name: 'Get Payment', version: 'v1', endpoint: '/payments/{id}', method: 'GET', description: 'Get payment status', auth: 'jwt' },
      { name: 'Send Notification', version: 'v1', endpoint: '/notifications', method: 'POST', description: 'Send notification', auth: 'service-account' },
      { name: 'Search', version: 'v1', endpoint: '/search', method: 'GET', description: 'Full-text search', auth: 'none' }
    ];

    docs.forEach(d => {
      const doc = new APIDoc(d);
      this.docs.set(doc.id, doc);
    });
  }

  // Register service
  register(serviceData) {
    const service = new Service(serviceData);
    this.services.set(service.id, service);
    return service;
  }

  // List services
  listServices(filter = {}) {
    let services = Array.from(this.services.values());

    if (filter.type) {
      services = services.filter(s => s.type === filter.type);
    }
    if (filter.status) {
      services = services.filter(s => s.status === filter.status);
    }
    if (filter.team) {
      services = services.filter(s => s.team === filter.team);
    }
    if (filter.tag) {
      services = services.filter(s => s.tags.includes(filter.tag));
    }

    return services;
  }

  // Get service
  getService(serviceId) {
    return this.services.get(serviceId) || null;
  }

  // Update service
  updateService(serviceId, updates) {
    const service = this.services.get(serviceId);
    if (!service) {
      throw new Error(`Service ${serviceId} not found`);
    }
    Object.assign(service, updates);
    return service;
  }

  // Delete service
  deleteService(serviceId) {
    return this.services.delete(serviceId);
  }

  // Add API doc
  addDoc(docData) {
    const doc = new APIDoc(docData);
    this.docs.set(doc.id, doc);
    return doc;
  }

  // List docs
  listDocs(filter = {}) {
    let docs = Array.from(this.docs.values());

    if (filter.endpoint) {
      docs = docs.filter(d => d.endpoint.includes(filter.endpoint));
    }
    if (filter.method) {
      docs = docs.filter(d => d.method === filter.method);
    }

    return docs;
  }

  // Get docs for service
  getDocsForService(serviceName) {
    return Array.from(this.docs.values()).filter(d =>
      d.endpoint.includes(serviceName.toLowerCase().replace(/\s+/g, '-'))
    );
  }

  // List categories
  listCategories() {
    return Array.from(this.categories.values());
  }

  // Search
  search(query) {
    const lowerQuery = query.toLowerCase();
    const services = this.listServices().filter(s =>
      s.name.toLowerCase().includes(lowerQuery) ||
      s.description.toLowerCase().includes(lowerQuery) ||
      s.tags.some(t => t.includes(lowerQuery))
    );

    const docs = this.listDocs().filter(d =>
      d.name.toLowerCase().includes(lowerQuery) ||
      d.description.toLowerCase().includes(lowerQuery)
    );

    return { services, docs };
  }

  // Get statistics
  getStats() {
    const services = Array.from(this.services.values());

    return {
      totalServices: services.length,
      activeServices: services.filter(s => s.status === 'active').length,
      betaServices: services.filter(s => s.status === 'beta').length,
      deprecatedServices: services.filter(s => s.status === 'deprecated').length,
      byType: {
        api: services.filter(s => s.type === 'api').length,
        library: services.filter(s => s.type === 'library').length,
        tool: services.filter(s => s.type === 'tool').length,
        agent: services.filter(s => s.type === 'agent').length
      },
      totalTeams: [...new Set(services.map(s => s.team))].length,
      totalDocs: this.docs.size,
      totalCategories: this.categories.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const portal = new DeveloperPortal();

switch (command) {
  case 'demo':
    console.log('=== Agent Portal Demo\n');

    // 1. List services
    console.log('1. Services Catalog:');
    const services = portal.listServices();
    console.log(`   Total: ${services.length}`);
    services.forEach(s => {
      console.log(`   - ${s.name} [${s.type}] v${s.version} - ${s.team}`);
    });

    // 2. List by type
    console.log('\n2. Services by Type:');
    const apis = portal.listServices({ type: 'api' });
    const tools = portal.listServices({ type: 'tool' });
    console.log(`   APIs: ${apis.length}`);
    console.log(`   Tools: ${tools.length}`);

    // 3. List by team
    console.log('\n3. Services by Team:');
    const teams = [...new Set(services.map(s => s.team))];
    teams.forEach(team => {
      const teamServices = portal.listServices({ team });
      console.log(`   ${team}: ${teamServices.length} service(s)`);
    });

    // 4. List categories
    console.log('\n4. Categories:');
    const categories = portal.listCategories();
    categories.forEach(c => {
      console.log(`   - ${c.name}: ${c.description}`);
    });

    // 5. Search
    console.log('\n5. Search:');
    const searchResults = portal.search('user');
    console.log(`   Query "user": ${searchResults.services.length} services, ${searchResults.docs.length} docs`);

    // 6. Register new service
    console.log('\n6. Register Service:');
    const newService = portal.register({
      name: 'Inventory Service',
      type: 'api',
      description: 'Product inventory management',
      owner: 'Commerce Team',
      team: 'inventory',
      version: '1.0.0',
      tags: ['inventory', 'products', 'stock']
    });
    console.log(`   Registered: ${newService.name} (${newService.type})`);

    // 7. List API docs
    console.log('\n7. API Documentation:');
    const docs = portal.listDocs();
    console.log(`   Total: ${docs.length}`);
    docs.slice(0, 5).forEach(d => {
      console.log(`   - ${d.method} ${d.endpoint}: ${d.name}`);
    });

    // 8. Add API doc
    console.log('\n8. Add API Doc:');
    const newDoc = portal.addDoc({
      name: 'List Inventory',
      version: 'v1',
      endpoint: '/inventory',
      method: 'GET',
      description: 'List all inventory items',
      auth: 'jwt'
    });
    console.log(`   Added: ${newDoc.method} ${newDoc.endpoint}`);

    // 9. Get service details
    console.log('\n9. Service Details:');
    const userService = services.find(s => s.name === 'User Service');
    if (userService) {
      console.log(`   Name: ${userService.name}`);
      console.log(`   Owner: ${userService.owner}`);
      console.log(`   Repository: ${userService.repository}`);
      console.log(`   Tags: ${userService.tags.join(', ')}`);
    }

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const stats = portal.getStats();
    console.log(`    Total services: ${stats.totalServices}`);
    console.log(`    Active: ${stats.activeServices}, Beta: ${stats.betaServices}`);
    console.log(`    APIs: ${stats.byType.api}, Tools: ${stats.byType.tool}`);
    console.log(`    Teams: ${stats.totalTeams}`);
    console.log(`    Documentation: ${stats.totalDocs}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'services':
    console.log('Services:');
    portal.listServices().forEach(s => {
      console.log(`  ${s.name}: ${s.type} [${s.status}]`);
    });
    break;

  case 'docs':
    console.log('API Documentation:');
    portal.listDocs().forEach(d => {
      console.log(`  ${d.method} ${d.endpoint}: ${d.name}`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-portal.js [demo|services|docs]');
}
