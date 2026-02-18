/**
 * SSE (Server-Sent Events) Example
 * Server-Sent Events 使用示例
 */

const { SSEManager, SSE_EVENTS } = require('./sse-server');
const http = require('http');

// Create SSE Manager
const sseManager = new SSEManager();

// Connection handler
sseManager.on('connection', (conn) => {
  console.log(`Client connected: ${conn.id}`);

  // Send welcome message
  conn.sendJSON('welcome', { message: 'Connected to SSE server', clientId: conn.id });
});

sseManager.on('disconnection', (conn) => {
  console.log(`Client disconnected: ${conn.id}`);
});

// Create HTTP server
const server = http.createServer((req, res) => {
  const url = req.url;

  // SSE endpoint
  if (url === '/events' || url.startsWith('/events?')) {
    // Parse query params
    const params = new URLSearchParams(url.split('?')[1]);
    const channel = params.get('channel') || 'default';

    const conn = sseManager.createConnection(req, res);
    conn.join(channel);

    console.log(`Client ${conn.id} joined channel: ${channel}`);

    // Send channel info
    conn.sendJSON('channel', { channel });
    return;
  }

  // Broadcast endpoint
  if (url === '/broadcast' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const event = data.event || 'message';
        const message = data.message;

        // Get channel from query
        const params = new URLSearchParams(url.split('?')[1]);
        const channel = params.get('channel');

        const count = sseManager.broadcast(event, message, channel);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, clients: count }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
    return;
  }

  // Stats endpoint
  if (url === '/stats') {
    const stats = {
      connections: sseManager.getConnectionCount(),
      channels: sseManager.getChannels(),
      details: {}
    };

    for (const channel of sseManager.getChannels()) {
      stats.details[channel] = sseManager.getChannelCount(channel);
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats, null, 2));
    return;
  }

  // HTML page
  if (url === '/' || url === '/index.html') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
<!DOCTYPE html>
<html>
<head>
  <title>SSE Demo</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; }
    #events { border: 1px solid #ccc; padding: 10px; height: 300px; overflow-y: auto; margin-top: 10px; }
    .event { padding: 5px; margin: 2px 0; border-bottom: 1px solid #eee; }
    .event-name { font-weight: bold; color: #0066cc; }
    .event-data { color: #333; }
    button { padding: 10px 20px; margin: 5px; cursor: pointer; }
  </style>
</head>
<body>
  <h1>Server-Sent Events Demo</h1>
  <div>
    <button onclick="connect()">Connect</button>
    <button onclick="disconnect()">Disconnect</button>
    <button onclick="broadcast()">Broadcast Test</button>
  </div>
  <h2>Events</h2>
  <div id="events"></div>
  <script>
    let eventSource = null;

    function connect() {
      if (eventSource) {
        eventSource.close();
      }

      eventSource = new EventSource('/events?channel=default');

      eventSource.onopen = () => {
        addEvent('system', 'Connected to SSE server');
      };

      eventSource.onmessage = (event) => {
        addEvent('message', event.data);
      };

      eventSource.addEventListener('welcome', (event) => {
        addEvent('welcome', JSON.parse(event.data));
      });

      eventSource.addEventListener('notification', (event) => {
        addEvent('notification', event.data);
      });

      eventSource.addEventListener('channel', (event) => {
        addEvent('channel', JSON.parse(event.data));
      });

      eventSource.onerror = () => {
        addEvent('error', 'Connection error');
      };
    }

    function disconnect() {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
        addEvent('system', 'Disconnected');
      }
    }

    function broadcast() {
      fetch('/broadcast?channel=default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'notification',
          message: { text: 'Hello from browser!', time: new Date().toISOString() }
        })
      });
    }

    function addEvent(name, data) {
      const div = document.getElementById('events');
      const eventDiv = document.createElement('div');
      eventDiv.className = 'event';
      eventDiv.innerHTML = '<span class="event-name">' + name + ':</span> <span class="event-data">' + JSON.stringify(data) + '</span>';
      div.appendChild(eventDiv);
      div.scrollTop = div.scrollHeight;
    }
  </script>
</body>
</html>
    `);
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

// Start server
const PORT = process.env.PORT || 3002;
server.listen(PORT, () => {
  console.log(`=== SSE Server Running ===`);
  console.log(`Open http://localhost:${PORT} in your browser`);
  console.log(`SSE endpoint: http://localhost:${PORT}/events`);
  console.log(`\nUsage:`);
  console.log(`  curl -X POST http://localhost:${PORT}/broadcast?channel=default \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -d '{"event": "notification", "message": "Hello!"}'`);
  console.log(``);
});

// Simulate periodic broadcasts
setInterval(() => {
  const time = new Date().toISOString();
  const count = sseManager.broadcast('notification', { time, message: 'Periodic update' });
  if (count > 0) {
    console.log(`Broadcast to ${count} clients: ${time}`);
  }
}, 10000);

// Handle shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  sseManager.closeAll();
  server.close();
  process.exit(0);
});
