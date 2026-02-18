/**
 * GraphQL-style API Support - GraphQL API 支持
 * 基于 BRIDGE-009
 * 实现兼容 GraphQL 的 API 模式，无需外部依赖
 */

const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();

// ========== GraphQL-like Schema Definition ==========

const typeDefs = `
  type Query {
    users: [User]
    user(id: ID!): User
    sessions: [Session]
    session(id: ID!): Session
    contexts: [Context]
    context(id: ID!): Context
    inputs: [Input]
    input(id: ID!): Input
    status: Status!
  }

  type Mutation {
    createUser(input: CreateUserInput!): User
    updateUser(id: ID!, input: UpdateUserInput!): User
    deleteUser(id: ID!): Boolean
    createSession(input: CreateSessionInput!): Session
    updateSession(id: ID!, input: UpdateSessionInput!): Session
    deleteSession(id: ID!): Boolean
    createContext(input: CreateContextInput!): Context
    updateContext(id: ID!, input: UpdateContextInput!): Context
    deleteContext(id: ID!): Boolean
    createInput(input: CreateInputInput!): Input
    deleteInput(id: ID!): Boolean
  }

  type Subscription {
    userUpdated: User
    sessionUpdated: Session
    contextUpdated: Context
    inputReceived: Input
  }

  type User {
    id: ID!
    username: String!
    email: String
    role: String
    createdAt: String!
    updatedAt: String!
  }

  type Session {
    id: ID!
    name: String!
    status: String
    context: String
    createdAt: String!
    updatedAt: String!
  }

  type Context {
    id: ID!
    name: String!
    description: String
    content: String
    tags: [String]
    createdAt: String!
    updatedAt: String!
  }

  type Input {
    id: ID!
    type: String!
    content: String!
    metadata: String
    createdAt: String!
  }

  type Status {
    version: String!
    uptime: Float!
    sessions: Int!
    contexts: Int!
    inputs: Int!
  }

  input CreateUserInput {
    username: String!
    email: String
    role: String
  }

  input UpdateUserInput {
    username: String
    email: String
    role: String
  }

  input CreateSessionInput {
    name: String!
    context: String
  }

  input UpdateSessionInput {
    name: String
    status: String
    context: String
  }

  input CreateContextInput {
    name: String!
    description: String
    content: String
    tags: [String]
  }

  input UpdateContextInput {
    name: String
    description: String
    content: String
    tags: [String]
  }

  input CreateInputInput {
    type: String!
    content: String!
    metadata: String
  }
`;

// ========== Data Store ==========

class DataStore {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.contexts = new Map();
    this.inputs = new Map();
    this.startTime = Date.now();

    this._initSampleData();
  }

  _initSampleData() {
    this.users.set('1', {
      id: '1',
      username: 'admin',
      email: 'admin@example.com',
      role: 'admin',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    this.sessions.set('1', {
      id: '1',
      name: 'Main Session',
      status: 'active',
      context: 'general',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    this.contexts.set('1', {
      id: '1',
      name: 'Project Alpha',
      description: 'Main project context',
      content: 'Project description...',
      tags: ['project', 'alpha'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  // Users
  getUsers() { return Array.from(this.users.values()); }
  getUser(id) { return this.users.get(id); }
  createUser(input) {
    const id = uuidv4();
    const user = {
      id,
      username: input.username,
      email: input.email || null,
      role: input.role || 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.users.set(id, user);
    return user;
  }
  updateUser(id, input) {
    const user = this.users.get(id);
    if (!user) return null;
    Object.assign(user, input, { updatedAt: new Date().toISOString() });
    return user;
  }
  deleteUser(id) { return this.users.delete(id); }

  // Sessions
  getSessions() { return Array.from(this.sessions.values()); }
  getSession(id) { return this.sessions.get(id); }
  createSession(input) {
    const id = uuidv4();
    const session = {
      id,
      name: input.name,
      status: 'active',
      context: input.context || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.sessions.set(id, session);
    return session;
  }
  updateSession(id, input) {
    const session = this.sessions.get(id);
    if (!session) return null;
    Object.assign(session, input, { updatedAt: new Date().toISOString() });
    return session;
  }
  deleteSession(id) { return this.sessions.delete(id); }

  // Contexts
  getContexts() { return Array.from(this.contexts.values()); }
  getContext(id) { return this.contexts.get(id); }
  createContext(input) {
    const id = uuidv4();
    const context = {
      id,
      name: input.name,
      description: input.description || null,
      content: input.content || null,
      tags: input.tags || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.contexts.set(id, context);
    return context;
  }
  updateContext(id, input) {
    const context = this.contexts.get(id);
    if (!context) return null;
    Object.assign(context, input, { updatedAt: new Date().toISOString() });
    return context;
  }
  deleteContext(id) { return this.contexts.delete(id); }

  // Inputs
  getInputs() { return Array.from(this.inputs.values()); }
  getInput(id) { return this.inputs.get(id); }
  createInput(input) {
    const id = uuidv4();
    const inp = {
      id,
      type: input.type,
      content: input.content,
      metadata: input.metadata || null,
      createdAt: new Date().toISOString()
    };
    this.inputs.set(id, inp);
    return inp;
  }
  deleteInput(id) { return this.inputs.delete(id); }

  getStatus() {
    return {
      version: '1.0.0',
      uptime: (Date.now() - this.startTime) / 1000,
      sessions: this.sessions.size,
      contexts: this.contexts.size,
      inputs: this.inputs.size
    };
  }
}

// ========== GraphQL Resolvers ==========

const resolvers = {
  Query: {
    users: (ctx) => ctx.dataStore.getUsers(),
    user: (ctx, { id }) => ctx.dataStore.getUser(id),
    sessions: (ctx) => ctx.dataStore.getSessions(),
    session: (ctx, { id }) => ctx.dataStore.getSession(id),
    contexts: (ctx) => ctx.dataStore.getContexts(),
    context: (ctx, { id }) => ctx.dataStore.getContext(id),
    inputs: (ctx) => ctx.dataStore.getInputs(),
    input: (ctx, { id }) => ctx.dataStore.getInput(id),
    status: (ctx) => ctx.dataStore.getStatus()
  },
  Mutation: {
    createUser: (ctx, { input }) => ctx.dataStore.createUser(input),
    updateUser: (ctx, { id, input }) => ctx.dataStore.updateUser(id, input),
    deleteUser: (ctx, { id }) => ctx.dataStore.deleteUser(id),
    createSession: (ctx, { input }) => ctx.dataStore.createSession(input),
    updateSession: (ctx, { id, input }) => ctx.dataStore.updateSession(id, input),
    deleteSession: (ctx, { id }) => ctx.dataStore.deleteSession(id),
    createContext: (ctx, { input }) => ctx.dataStore.createContext(input),
    updateContext: (ctx, { id, input }) => ctx.dataStore.updateContext(id, input),
    deleteContext: (ctx, { id }) => ctx.dataStore.deleteContext(id),
    createInput: (ctx, { input }) => ctx.dataStore.createInput(input),
    deleteInput: (ctx, { id }) => ctx.dataStore.deleteInput(id)
  }
};

// ========== Simple GraphQL Parser & Executor ==========

class GraphQLExecutor {
  constructor(dataStore) {
    this.dataStore = dataStore;
  }

  execute(query, variables = {}) {
    const ctx = { dataStore: this.dataStore, variables };

    // Parse query (simple implementation)
    const parsed = this.parse(query);

    if (parsed.errors) {
      return { errors: parsed.errors };
    }

    // Execute
    try {
      const result = this.executeOperation(ctx, parsed.operation, parsed.selection);
      return { data: result };
    } catch (error) {
      return { errors: [{ message: error.message }] };
    }
  }

  parse(query) {
    const trimmed = query.trim();

    // Detect operation type
    let operation = 'query';
    if (trimmed.startsWith('mutation')) operation = 'mutation';
    else if (trimmed.startsWith('subscription')) operation = 'subscription';

    // Extract selection set
    const match = trimmed.match(/{([^}]+)}/);
    if (!match) {
      return { errors: [{ message: 'Invalid query' }] };
    }

    const selectionStr = match[1];
    const selections = this.parseSelections(selectionStr);

    return { operation, selection: selections[0] };
  }

  parseSelections(str) {
    const selections = [];
    let current = '';
    let depth = 0;

    for (const char of str) {
      if (char === '{') depth++;
      if (char === '}') depth--;

      if (char === ' ' && depth === 0 && current.trim()) {
        if (current.trim()) {
          selections.push(this.parseField(current.trim()));
        }
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      selections.push(this.parseField(current.trim()));
    }

    return selections;
  }

  parseField(str) {
    const [name, argsStr] = str.split('(');
    const field = { name: name.trim() };

    if (argsStr) {
      const args = argsStr.replace(')', '').split(',').reduce((acc, arg) => {
        const [key, value] = arg.split(':').map(s => s.trim());
        acc[key] = this.parseValue(value);
        return acc;
      }, {});
      field.args = args;
    }

    // Check for nested selection
    const nestedMatch = str.match(/{([^}]*)}/);
    if (nestedMatch) {
      field.selection = this.parseSelections(nestedMatch[1]);
    }

    return field;
  }

  parseValue(value) {
    if (!value) return null;
    const trimmed = value.trim();

    // String
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1);
    }

    // Number
    if (!isNaN(trimmed)) {
      return Number(trimmed);
    }

    // Boolean/null
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (trimmed === 'null') return null;

    // Object literal
    if (trimmed.startsWith('{')) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return {};
      }
    }

    return trimmed;
  }

  executeOperation(ctx, operation, selection) {
    const result = {};

    for (const field of selection.selection || [selection]) {
      const fieldName = field.name;
      const resolver = resolvers[operation]?.[fieldName];

      if (resolver) {
        result[fieldName] = resolver(ctx, field.args || {});
      } else if (field.selection) {
        // Nested query
        const data = resolvers.Query[fieldName]?.(ctx, field.args || {});
        if (Array.isArray(data)) {
          result[fieldName] = data.map(item => this.mapSelection(item, field.selection));
        } else if (data) {
          result[fieldName] = this.mapSelection(data, field.selection);
        }
      }
    }

    return result;
  }

  mapSelection(data, selection) {
    if (!data) return null;
    const result = {};

    for (const field of selection) {
      if (data[field.name] !== undefined) {
        result[field.name] = data[field.name];
      }
    }

    return result;
  }
}

// ========== GraphQL Server ==========

class GraphQLServer {
  constructor() {
    this.dataStore = new DataStore();
    this.executor = new GraphQLExecutor(this.dataStore);
  }

  execute(query, variables = {}) {
    return this.executor.execute(query, variables);
  }

  getDataStore() {
    return this.dataStore;
  }
}

// ========== Export ==========

module.exports = {
  GraphQLServer,
  typeDefs,
  DataStore
};
