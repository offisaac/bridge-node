/**
 * GraphQL API Example
 * GraphQL API 使用示例
 */

const express = require('express');
const { GraphQLServer, createGraphQLMiddleware, createPlaygroundMiddleware } = require('./graphql-api');

async function main() {
  // Create GraphQL server
  const server = new GraphQLServer();

  // Create Express app
  const app = express();
  app.use(express.json());

  // GraphQL endpoint
  app.post('/graphql', createGraphQLMiddleware(server));

  // GraphQL Playground (optional)
  app.get('/graphql', createPlaygroundMiddleware('/graphql'));

  // Sample queries
  console.log('\n=== GraphQL Queries ===\n');

  // Query: Get all users
  const usersQuery = `
    query {
      users {
        id
        username
        email
        role
      }
    }
  `;
  let result = await server.execute(usersQuery);
  console.log('1. Get Users:');
  console.log(JSON.stringify(result, null, 2));

  // Query: Get sessions
  const sessionsQuery = `
    query {
      sessions {
        id
        name
        status
      }
    }
  `;
  result = await server.execute(sessionsQuery);
  console.log('\n2. Get Sessions:');
  console.log(JSON.stringify(result, null, 2));

  // Query: Get status
  const statusQuery = `
    query {
      status {
        version
        uptime
        sessions
        contexts
      }
    }
  `;
  result = await server.execute(statusQuery);
  console.log('\n3. Get Status:');
  console.log(JSON.stringify(result, null, 2));

  // Mutation: Create user
  const createUserMutation = `
    mutation {
      createUser(input: {
        username: "john_doe"
        email: "john@example.com"
        role: "developer"
      }) {
        id
        username
        email
        role
      }
    }
  `;
  result = await server.execute(createUserMutation);
  console.log('\n4. Create User:');
  console.log(JSON.stringify(result, null, 2));

  // Query: Get all users again
  result = await server.execute(usersQuery);
  console.log('\n5. Get Users (after create):');
  console.log(JSON.stringify(result, null, 2));

  // Mutation: Create context
  const createContextMutation = `
    mutation {
      createContext(input: {
        name: "New Project"
        description: "A new project context"
        tags: ["project", "new"]
      }) {
        id
        name
        description
        tags
      }
    }
  `;
  result = await server.execute(createContextMutation);
  console.log('\n6. Create Context:');
  console.log(JSON.stringify(result, null, 2));

  // Query: Get contexts
  const contextsQuery = `
    query {
      contexts {
        id
        name
        description
        tags
      }
    }
  `;
  result = await server.execute(contextsQuery);
  console.log('\n7. Get Contexts:');
  console.log(JSON.stringify(result, null, 2));

  // Start server
  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`\n=== Server Running ===`);
    console.log(`GraphQL endpoint: http://localhost:${PORT}/graphql`);
    console.log(`Playground: http://localhost:${PORT}/graphql`);
    console.log(`\nPress Ctrl+C to stop\n`);
  });
}

main().catch(console.error);
