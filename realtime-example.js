/**
 * WebSocket Real-Time Communication Example
 * 演示如何使用实时通信模块
 */

const { RealtimeServer, RealtimeClient, MessageType, config } = require('./realtime');

// ========== Server Example ==========

function startServer() {
  const server = new RealtimeServer({
    port: 8080,
    jwtSecret: 'your-secret-key',
  });

  // Handle events
  server.on('connection', (client) => {
    console.log('New connection:', client.id);
  });

  server.on('auth', ({ client, user }) => {
    console.log(`Client ${client.id} authenticated as:`, user);
  });

  server.on('chatMessage', (message) => {
    console.log('Chat message:', message);
  });

  server.on('userJoin', ({ client, room }) => {
    console.log(`Client ${client.id} joined room: ${room.id}`);
  });

  server.on('userLeave', ({ client }) => {
    console.log(`Client ${client.id} left room`);
  });

  server.on('disconnect', ({ client, code }) => {
    console.log(`Client ${client.id} disconnected with code: ${code}`);
  });

  server.on('error', (error) => {
    console.error('Server error:', error);
  });

  // Start server
  server.start()
    .then((port) => {
      console.log(`Server started on port ${port}`);

      // Create additional rooms
      server.createRoom('project-alpha', 'Project Alpha', {
        description: 'Collaboration room for Project Alpha',
        maxClients: 50,
      });

      server.createRoom('project-beta', 'Project Beta', {
        description: 'Collaboration room for Project Beta',
        maxClients: 50,
      });

      // Example: Broadcast notification every 30 seconds
      setInterval(() => {
        server.broadcast({
          type: MessageType.NOTIFICATION,
          data: {
            message: 'Server is running',
            timestamp: new Date().toISOString(),
          },
        });
      }, 30000);

      // Print stats every 10 seconds
      setInterval(() => {
        console.log('Stats:', server.getStats());
      }, 10000);
    })
    .catch((error) => {
      console.error('Failed to start server:', error);
    });

  return server;
}

// ========== Client Example ==========

function startClient(token = null) {
  const client = new RealtimeClient({
    url: 'ws://localhost:8080',
    reconnectInterval: 3000,
    maxReconnectAttempts: 5,
  });

  // Handle connection
  client.on('open', () => {
    console.log('Client connected');

    // Join a room
    client.joinRoom('global');

    // Send a chat message
    setTimeout(() => {
      client.sendChatMessage('Hello from client!');
    }, 1000);

    // Move cursor example
    setTimeout(() => {
      client.moveCursor({ x: 100, y: 200 }, 'editor');
    }, 2000);
  });

  // Handle disconnect
  client.on('disconnect', ({ code, reason }) => {
    console.log(`Disconnected: ${code} - ${reason}`);
  });

  // Handle messages
  client.on(MessageType.CHAT_MESSAGE, (data) => {
    console.log('Received chat:', data);
  });

  client.on(MessageType.USER_JOIN, (data) => {
    console.log('User joined:', data);
  });

  client.on(MessageType.USER_LEAVE, (data) => {
    console.log('User left:', data);
  });

  client.on(MessageType.USER_LIST, (data) => {
    console.log('User list:', data);
  });

  client.on(MessageType.NOTIFICATION, (data) => {
    console.log('Notification:', data);
  });

  client.on('error', (error) => {
    console.error('Client error:', error);
  });

  // Connect
  client.connect(token)
    .then(() => {
      console.log('Connected successfully');
    })
    .catch((error) => {
      console.error('Connection failed:', error);
    });

  return client;
}

// ========== Run Examples ==========

// Check command line arguments
const args = process.argv.slice(2);

if (args[0] === 'server') {
  console.log('Starting WebSocket server...');
  startServer();
} else if (args[0] === 'client') {
  console.log('Starting WebSocket client...');
  // Generate a test token
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { id: '1', username: 'testuser', role: 'developer' },
    'your-secret-key',
    { expiresIn: '1h' }
  );
  startClient(token);
} else {
  console.log('Usage:');
  console.log('  node realtime-example.js server  - Start WebSocket server');
  console.log('  node realtime-example.js client  - Start WebSocket client');
}
