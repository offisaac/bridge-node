/**
 * WebSocket Real-Time Communication Module
 * 实时协作中心的 WebSocket 支持
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// ========== Configuration ==========

const config = {
  port: process.env.WS_PORT || 8080,
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  heartbeatInterval: 30000, // 30 seconds
  maxMessageSize: 10 * 1024 * 1024, // 10MB
  pingTimeout: 10000,
};

// ========== Message Types ==========

const MessageType = {
  // Connection
  CONNECT: 'connect',
  DISCONNECT: 'disconnect',
  AUTH_REQUEST: 'auth_request',
  AUTH_RESPONSE: 'auth_response',

  // Chat
  CHAT_MESSAGE: 'chat_message',
  CHAT_HISTORY: 'chat_history',

  // Collaboration
  CURSOR_MOVE: 'cursor_move',
  SELECTION_CHANGE: 'selection_change',
  FILE_EDIT: 'file_edit',
  SYNC_REQUEST: 'sync_request',
  SYNC_RESPONSE: 'sync_response',

  // Presence
  USER_JOIN: 'user_join',
  USER_LEAVE: 'user_leave',
  USER_LIST: 'user_list',

  // Notifications
  NOTIFICATION: 'notification',

  // Errors
  ERROR: 'error',
};

// ========== Client Session ==========

class ClientSession {
  constructor(ws, req) {
    this.id = uuidv4();
    this.ws = ws;
    this.ip = req.socket.remoteAddress;
    this.userAgent = req.headers['user-agent'];
    this.user = null;
    this.room = null;
    this.joinedAt = new Date();
    this.lastActivity = Date.now();
    this.metadata = {};
  }

  setUser(user) {
    this.user = user;
  }

  joinRoom(roomId) {
    this.room = roomId;
  }

  leaveRoom() {
    this.room = null;
  }

  updateActivity() {
    this.lastActivity = Date.now();
  }

  isAuthenticated() {
    return this.user !== null;
  }

  toJSON() {
    return {
      id: this.id,
      ip: this.ip,
      user: this.user,
      room: this.room,
      joinedAt: this.joinedAt,
      lastActivity: this.lastActivity,
    };
  }
}

// ========== Room ==========

class Room {
  constructor(id, name, options = {}) {
    this.id = id;
    this.name = name;
    this.description = options.description || '';
    this.clients = new Map(); // clientId -> ClientSession
    this.createdAt = new Date();
    this.maxClients = options.maxClients || 100;
    this.isPrivate = options.isPrivate || false;
    this.metadata = options.metadata || {};
  }

  addClient(client) {
    if (this.clients.size >= this.maxClients) {
      return false;
    }
    this.clients.set(client.id, client);
    return true;
  }

  removeClient(clientId) {
    return this.clients.delete(clientId);
  }

  getClient(clientId) {
    return this.clients.get(clientId);
  }

  getClients() {
    return Array.from(this.clients.values());
  }

  getUserList() {
    return this.getClients()
      .filter(c => c.isAuthenticated())
      .map(c => ({
        id: c.id,
        user: c.user,
      }));
  }

  broadcast(message, excludeClientId = null) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.id !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(data);
      }
    });
  }

  broadcastBinary(buffer, excludeClientId = null) {
    this.clients.forEach((client) => {
      if (client.id !== excludeClientId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(buffer);
      }
    });
  }
}

// ========== WebSocket Server ==========

class RealtimeServer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      ...config,
      ...options,
    };

    this.wss = null;
    this.clients = new Map(); // clientId -> ClientSession
    this.rooms = new Map(); // roomId -> Room
    this.heartbeatTimers = new Map(); // clientId -> timer

    // Statistics
    this.stats = {
      totalConnections: 0,
      totalMessages: 0,
      roomsCreated: 0,
    };

    // Create default room
    this.createRoom('global', 'Global', { description: 'Default room' });
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocket.Server({
          port: this.options.port,
          maxPayload: this.options.maxMessageSize,
        });

        this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
        this.wss.on('error', (error) => this.emit('error', error));

        console.log(`WebSocket server started on port ${this.options.port}`);
        resolve(this.options.port);
      } catch (error) {
        reject(error);
      }
    });
  }

  stop() {
    return new Promise((resolve) => {
      // Close all clients
      this.clients.forEach((client) => {
        client.ws.close(1001, 'Server shutting down');
      });

      // Clear timers
      this.heartbeatTimers.forEach((timer) => clearInterval(timer));

      if (this.wss) {
        this.wss.close(() => {
          console.log('WebSocket server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  handleConnection(ws, req) {
    const client = new ClientSession(ws, req);
    this.clients.set(client.id, client);
    this.stats.totalConnections++;

    console.log(`Client connected: ${client.id} from ${client.ip}`);

    // Setup heartbeat
    this.setupHeartbeat(client);

    // Handle messages
    ws.on('message', (data) => this.handleMessage(client, data));

    // Handle close
    ws.on('close', (code, reason) => this.handleDisconnect(client, code, reason));

    // Handle error
    ws.on('error', (error) => this.emit('clientError', { client, error }));

    // Send connection acknowledgment
    this.send(client, {
      type: MessageType.CONNECT,
      data: {
        clientId: client.id,
        serverTime: new Date().toISOString(),
      },
    });
  }

  setupHeartbeat(client) {
    const timer = setInterval(() => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }, this.options.heartbeatInterval);

    client.ws.on('pong', () => {
      client.updateActivity();
    });

    this.heartbeatTimers.set(client.id, timer);
  }

  handleMessage(client, data) {
    try {
      let message;
      if (Buffer.isBuffer(data)) {
        // Binary message
        message = JSON.parse(data.toString());
      } else {
        message = JSON.parse(data);
      }

      client.updateActivity();
      this.stats.totalMessages++;

      this.processMessage(client, message);
    } catch (error) {
      console.error('Error processing message:', error);
      this.sendError(client, 'Invalid message format');
    }
  }

  processMessage(client, message) {
    const { type, data, roomId } = message;

    switch (type) {
      case MessageType.AUTH_REQUEST:
        this.handleAuth(client, data);
        break;

      case MessageType.CHAT_MESSAGE:
        this.handleChatMessage(client, data);
        break;

      case MessageType.CURSOR_MOVE:
        this.handleCursorMove(client, data);
        break;

      case MessageType.SELECTION_CHANGE:
        this.handleSelectionChange(client, data);
        break;

      case MessageType.FILE_EDIT:
        this.handleFileEdit(client, data);
        break;

      case MessageType.USER_JOIN:
        this.handleUserJoin(client, roomId);
        break;

      case MessageType.USER_LEAVE:
        this.handleUserLeave(client);
        break;

      case MessageType.SYNC_REQUEST:
        this.handleSyncRequest(client, data);
        break;

      default:
        this.emit('message', { client, type, data });
    }
  }

  handleAuth(client, data) {
    const { token } = data;

    try {
      if (token) {
        const decoded = jwt.verify(token, this.options.jwtSecret);
        client.setUser(decoded);
      }

      this.send(client, {
        type: MessageType.AUTH_RESPONSE,
        data: {
          success: true,
          user: client.user,
        },
      });

      this.emit('auth', { client, user: client.user });
    } catch (error) {
      this.send(client, {
        type: MessageType.AUTH_RESPONSE,
        data: {
          success: false,
          error: 'Invalid token',
        },
      });
    }
  }

  handleChatMessage(client, data) {
    const room = this.rooms.get(client.room);
    if (!room) return;

    const chatMessage = {
      id: uuidv4(),
      user: client.user,
      content: data.content,
      timestamp: new Date().toISOString(),
      clientId: client.id,
    };

    room.broadcast({
      type: MessageType.CHAT_MESSAGE,
      data: chatMessage,
    }, client.id);

    this.emit('chatMessage', chatMessage);
  }

  handleCursorMove(client, data) {
    const room = this.rooms.get(client.room);
    if (!room) return;

    room.broadcast({
      type: MessageType.CURSOR_MOVE,
      data: {
        clientId: client.id,
        user: client.user,
        position: data.position,
        element: data.element,
      },
    }, client.id);
  }

  handleSelectionChange(client, data) {
    const room = this.rooms.get(client.room);
    if (!room) return;

    room.broadcast({
      type: MessageType.SELECTION_CHANGE,
      data: {
        clientId: client.id,
        user: client.user,
        selection: data.selection,
      },
    }, client.id);
  }

  handleFileEdit(client, data) {
    const room = this.rooms.get(client.room);
    if (!room) return;

    room.broadcast({
      type: MessageType.FILE_EDIT,
      data: {
        clientId: client.id,
        user: client.user,
        file: data.file,
        changes: data.changes,
        version: data.version,
      },
    }, client.id);
  }

  handleUserJoin(client, roomId) {
    const room = this.rooms.get(roomId);
    if (!room) {
      this.sendError(client, 'Room not found');
      return;
    }

    if (!room.addClient(client)) {
      this.sendError(client, 'Room is full');
      return;
    }

    client.joinRoom(roomId);

    // Notify others
    room.broadcast({
      type: MessageType.USER_JOIN,
      data: {
        clientId: client.id,
        user: client.user,
      },
    }, client.id);

    // Send user list
    this.send(client, {
      type: MessageType.USER_LIST,
      data: room.getUserList(),
    });

    this.emit('userJoin', { client, room });
  }

  handleUserLeave(client) {
    const room = this.rooms.get(client.room);
    if (room) {
      room.removeClient(client.id);
      client.leaveRoom();

      room.broadcast({
        type: MessageType.USER_LEAVE,
        data: {
          clientId: client.id,
          user: client.user,
        },
      });
    }

    this.emit('userLeave', { client });
  }

  handleSyncRequest(client, data) {
    const room = this.rooms.get(client.room);
    if (!room) return;

    this.send(client, {
      type: MessageType.SYNC_RESPONSE,
      data: {
        version: data.version,
        state: room.metadata,
      },
    });
  }

  handleDisconnect(client, code, reason) {
    console.log(`Client disconnected: ${client.id}, code: ${code}`);

    // Clean up
    this.handleUserLeave(client);

    // Clear heartbeat timer
    const timer = this.heartbeatTimers.get(client.id);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(client.id);
    }

    // Remove client
    this.clients.delete(client.id);

    this.emit('disconnect', { client, code, reason });
  }

  send(client, message) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  sendError(client, error) {
    this.send(client, {
      type: MessageType.ERROR,
      data: { message: error },
    });
  }

  // ========== Room Management ==========

  createRoom(id, name, options = {}) {
    if (this.rooms.has(id)) {
      return this.rooms.get(id);
    }

    const room = new Room(id, name, options);
    this.rooms.set(id, room);
    this.stats.roomsCreated++;

    this.emit('roomCreated', room);
    return room;
  }

  deleteRoom(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;

    // Disconnect all clients
    room.getClients().forEach((client) => {
      client.ws.close(1001, 'Room deleted');
    });

    this.rooms.delete(roomId);
    this.emit('roomDeleted', room);
    return true;
  }

  getRoom(roomId) {
    return this.rooms.get(roomId);
  }

  getRooms() {
    return Array.from(this.rooms.values()).map((room) => ({
      id: room.id,
      name: room.name,
      clientCount: room.clients.size,
      createdAt: room.createdAt,
    }));
  }

  // ========== Broadcasting ==========

  broadcast(message, roomId = null) {
    if (roomId) {
      const room = this.rooms.get(roomId);
      if (room) {
        room.broadcast(message);
      }
    } else {
      const data = JSON.stringify(message);
      this.clients.forEach((client) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(data);
        }
      });
    }
  }

  // ========== Statistics ==========

  getStats() {
    return {
      ...this.stats,
      activeClients: this.clients.size,
      activeRooms: this.rooms.size,
    };
  }
}

// ========== Client Module ==========

class RealtimeClient extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      url: options.url || 'ws://localhost:8080',
      reconnectInterval: options.reconnectInterval || 3000,
      maxReconnectAttempts: options.maxReconnectAttempts || 10,
    };

    this.ws = null;
    this.clientId = null;
    this.rooms = new Set();
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.handlers = new Map();
  }

  connect(token = null) {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.options.url);

        this.ws.on('open', () => {
          console.log('Connected to WebSocket server');
          this.isConnected = true;
          this.reconnectAttempts = 0;

          if (token) {
            this.authenticate(token);
          }

          resolve();
        });

        this.ws.on('message', (data) => this.handleMessage(data));

        this.ws.on('close', (code, reason) => {
          console.log(`Disconnected: ${code} - ${reason}`);
          this.isConnected = false;
          this.emit('disconnect', { code, reason });
          this.attemptReconnect(token);
        });

        this.ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.emit('error', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  attemptReconnect(token) {
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.emit('reconnectFailed');
      return;
    }

    this.reconnectAttempts++;
    console.log(`Reconnecting... (${this.reconnectAttempts}/${this.options.maxReconnectAttempts})`);

    setTimeout(() => {
      this.connect(token).catch(() => {});
    }, this.options.reconnectInterval);
  }

  disconnect() {
    if (this.ws) {
      this.ws.close(1000, 'Client disconnecting');
    }
  }

  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      const { type, data: messageData } = message;

      // Handle connection acknowledgment
      if (type === MessageType.CONNECT) {
        this.clientId = messageData.clientId;
      }

      // Emit event
      this.emit(type, messageData);

      // Call registered handler
      const handler = this.handlers.get(type);
      if (handler) {
        handler(messageData);
      }
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }

  send(type, data = {}) {
    if (!this.isConnected || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('Cannot send message: not connected');
      return false;
    }

    this.ws.send(JSON.stringify({ type, data }));
    return true;
  }

  on(type, handler) {
    this.handlers.set(type, handler);
    super.on(type, handler);
  }

  off(type) {
    this.handlers.delete(type);
    super.removeAllListeners(type);
  }

  // ========== Convenience Methods ==========

  authenticate(token) {
    return this.send(MessageType.AUTH_REQUEST, { token });
  }

  joinRoom(roomId) {
    return this.send(MessageType.USER_JOIN, { roomId });
  }

  leaveRoom() {
    return this.send(MessageType.USER_LEAVE);
  }

  sendChatMessage(content) {
    return this.send(MessageType.CHAT_MESSAGE, { content });
  }

  moveCursor(position, element) {
    return this.send(MessageType.CURSOR_MOVE, { position, element });
  }

  changeSelection(selection) {
    return this.send(MessageType.SELECTION_CHANGE, { selection });
  }

  editFile(file, changes, version) {
    return this.send(MessageType.FILE_EDIT, { file, changes, version });
  }

  requestSync(version) {
    return this.send(MessageType.SYNC_REQUEST, { version });
  }
}

// ========== Export ==========

module.exports = {
  RealtimeServer,
  RealtimeClient,
  MessageType,
  config,
};
