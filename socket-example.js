/**
 * Socket.IO Example
 * 使用示例
 */

const { SocketServer } = require('./socket-server');
const { RealtimeClient } = require('./socket-client');
const jwt = require('jsonwebtoken');

// ========== Server Example ==========

function startServer() {
  const server = new SocketServer({
    port: 3001,
    jwtSecret: 'your-secret-key',
  });

  server.start().then(() => {
    console.log('Socket server started on port 3001');

    // Print stats every 10 seconds
    setInterval(() => {
      console.log('Stats:', server.getStats());
    }, 10000);
  });

  return server;
}

// ========== Client Example ==========

async function startClient(username) {
  // Generate token
  const token = jwt.sign(
    { id: username, username, role: 'developer' },
    'your-secret-key',
    { expiresIn: '1h' }
  );

  // Create client
  const client = new RealtimeClient({
    url: 'http://localhost:3001',
    auth: token,
  });

  // Setup handlers
  client.on('ready', (data) => {
    console.log('Ready:', data);
  });

  client.on('message', (msg) => {
    console.log(`[${msg.room}] ${msg.user?.username || msg.socketId}: ${msg.content}`);
  });

  client.on('user:joined', (data) => {
    console.log(`User joined: ${data.user?.username}`);
  });

  client.on('user:left', (data) => {
    console.log(`User left: ${data.user?.username}`);
  });

  client.on('cursor:update', (data) => {
    console.log(`Cursor moved: ${data.user?.username} at ${JSON.stringify(data.position)}`);
  });

  client.on('typing:start', (data) => {
    console.log(`${data.user?.username} is typing...`);
  });

  client.on('disconnect', (data) => {
    console.log('Disconnected:', data.reason);
  });

  // Connect
  await client.connect();

  // Join room
  await client.join('general');

  // Send message
  await client.sendMessage(`Hello from ${username}!`);

  // Simulate typing
  setTimeout(() => {
    client.startTyping();
    setTimeout(() => {
      client.stopTyping();
      client.sendMessage('This is an automated message.');
    }, 2000);
  }, 3000);

  return client;
}

// ========== Run ==========

const args = process.argv.slice(2);

if (args[0] === 'server') {
  console.log('Starting Socket.IO server...');
  startServer();
} else if (args[0] === 'client') {
  const username = args[1] || 'testuser';
  console.log(`Starting client as ${username}...`);
  startClient(username).catch(console.error);
} else {
  console.log('Usage:');
  console.log('  node socket-example.js server     - Start server');
  console.log('  node socket-example.js client [name] - Start client');
}
