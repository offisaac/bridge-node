/**
 * SSE (Server-Sent Events) - Server-Sent Events 支持
 * 基于 BRIDGE-015
 */

const EventEmitter = require('events');

// ========== SSE Client ==========

class SSEConnection {
  constructor(req, res) {
    this.req = req;
    this.res = res;
    this.id = null;
    this.channels = new Set();
    this.connected = true;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Send initial comment to establish connection
    this.res.write(':connected\n\n');

    // Handle close
    req.on('close', () => {
      this.connected = false;
      this.emit('close');
    });
  }

  send(event, data) {
    if (!this.connected) return;

    let message = '';

    if (event) {
      message += `event: ${event}\n`;
    }

    if (typeof data === 'object') {
      message += `data: ${JSON.stringify(data)}\n`;
    } else {
      message += `data: ${data}\n`;
    }

    message += '\n';

    this.res.write(message);
  }

  sendJSON(event, data) {
    this.send(event, JSON.stringify(data));
  }

  join(channel) {
    this.channels.add(channel);
  }

  leave(channel) {
    this.channels.delete(channel);
  }

  close() {
    this.connected = false;
    this.res.end();
  }

  on(event, handler) {
    if (event === 'close') {
      // Custom close handler
      this._closeHandler = handler;
    }
  }

  emit(event, ...args) {
    if (event === 'close' && this._closeHandler) {
      this._closeHandler();
    }
  }
}

// ========== SSE Manager ==========

class SSEManager extends EventEmitter {
  constructor() {
    super();
    this.connections = new Map(); // id -> SSEConnection
    this.channels = new Map(); // channel -> Set of connection ids
    this._idCounter = 0;
  }

  createConnection(req, res) {
    const id = `conn_${++this._idCounter}`;
    const connection = new SSEConnection(req, res);
    connection.id = id;

    this.connections.set(id, connection);

    connection.on('close', () => {
      this._removeConnection(id);
    });

    this.emit('connection', connection);

    return connection;
  }

  _removeConnection(id) {
    const conn = this.connections.get(id);
    if (conn) {
      // Remove from all channels
      for (const channel of conn.channels) {
        this._leaveChannel(id, channel);
      }
      this.connections.delete(id);
      this.emit('disconnection', conn);
    }
  }

  // ========== Channel Management ==========

  joinChannel(connectionId, channel) {
    const conn = this.connections.get(connectionId);
    if (!conn) return false;

    conn.join(channel);

    if (!this.channels.has(channel)) {
      this.channels.set(channel, new Set());
    }
    this.channels.get(channel).add(connectionId);

    return true;
  }

  leaveChannel(connectionId, channel) {
    return this._leaveChannel(connectionId, channel);
  }

  _leaveChannel(connectionId, channel) {
    const channelConns = this.channels.get(channel);
    if (channelConns) {
      channelConns.delete(connectionId);
      if (channelConns.size === 0) {
        this.channels.delete(channel);
      }
    }

    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.leave(channel);
    }

    return true;
  }

  // ========== Broadcasting ==========

  broadcast(event, data, channel = null) {
    let targets;

    if (channel) {
      const channelConns = this.channels.get(channel);
      if (!channelConns) return 0;

      targets = [];
      for (const connId of channelConns) {
        const conn = this.connections.get(connId);
        if (conn && conn.connected) {
          targets.push(conn);
        }
      }
    } else {
      targets = Array.from(this.connections.values())
        .filter(c => c.connected);
    }

    let count = 0;
    for (const conn of targets) {
      try {
        conn.send(event, data);
        count++;
      } catch (e) {
        // Connection might be closed
      }
    }

    return count;
  }

  broadcastToChannel(channel, event, data) {
    return this.broadcast(event, data, channel);
  }

  // Send to specific connection
  sendTo(connectionId, event, data) {
    const conn = this.connections.get(connectionId);
    if (conn && conn.connected) {
      conn.send(event, data);
      return true;
    }
    return false;
  }

  // ========== Query ==========

  getConnections() {
    return Array.from(this.connections.values())
      .filter(c => c.connected);
  }

  getConnectionCount() {
    return this.connections.size;
  }

  getChannelCount(channel) {
    const channelConns = this.channels.get(channel);
    return channelConns ? channelConns.size : 0;
  }

  getChannels() {
    return Array.from(this.channels.keys());
  }

  // ========== Utility ==========

  closeAll() {
    for (const conn of this.connections.values()) {
      conn.close();
    }
    this.connections.clear();
    this.channels.clear();
  }
}

// ========== Express Middleware ==========

const createSSEMiddleware = (sseManager) => {
  return (req, res) => {
    const connection = sseManager.createConnection(req, res);

    // Keep connection alive
    req.socket.on('error', () => {
      connection.close();
    });
  };
};

// ========== SSE Router ==========

class SSERouter {
  constructor(sseManager) {
    this.sseManager = sseManager;
  }

  // Handle SSE connection
  handle(req, res) {
    const connection = this.sseManager.createConnection(req, res);
    return connection;
  }
}

// ========== Built-in Events ==========

const SSE_EVENTS = {
  // Connection events
  CONNECT: 'sse:connect',
  DISCONNECT: 'sse:disconnect',

  // Custom events
  MESSAGE: 'message',
  NOTIFICATION: 'notification',
  UPDATE: 'update',
  ERROR: 'error',

  // Data events
  USER_JOINED: 'user:joined',
  USER_LEFT: 'user:left',
  DATA_UPDATED: 'data:updated',
  TASK_COMPLETED: 'task:completed',
  TASK_PROGRESS: 'task:progress'
};

// ========== Export ==========

module.exports = {
  SSEConnection,
  SSEManager,
  SSERouter,
  createSSEMiddleware,
  SSE_EVENTS
};
