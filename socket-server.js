/**
 * Socket.IO Real-Time Communication Server
 * 实时通信服务 - 简化版
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// ========== Configuration ==========

const config = {
  port: process.env.PORT || 3001,
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  pingInterval: 25000,
  pingTimeout: 20000,
};

// ========== Server ==========

class SocketServer {
  constructor(options = {}) {
    this.options = { ...config, ...options };

    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: this.options.corsOrigin,
        methods: ['GET', 'POST'],
      },
      pingInterval: this.options.pingInterval,
      pingTimeout: this.options.pingTimeout,
    });

    this.clients = new Map(); // socket.id -> { user, room, joinedAt }
    this.rooms = new Map(); // roomId -> Set of socket.id
    this.userSockets = new Map(); // user.id -> Set of socket.id

    // Statistics
    this.stats = {
      totalConnections: 0,
      totalMessages: 0,
      roomsCreated: 0,
    };

    this.setupMiddleware();
    this.setupSocketHandlers();
  }

  setupMiddleware() {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        clients: this.clients.size,
        rooms: this.rooms.size,
        uptime: process.uptime(),
      });
    });

    // Stats endpoint
    this.app.get('/stats', (req, res) => {
      res.json(this.getStats());
    });
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });
  }

  handleConnection(socket) {
    console.log(`Client connected: ${socket.id}`);
    this.stats.totalConnections++;

    // Initialize client data
    this.clients.set(socket.id, {
      id: socket.id,
      user: null,
      room: null,
      joinedAt: new Date(),
      ip: socket.handshake.address,
    });

    // ========== Authentication ==========

    socket.on('auth', (data, callback) => {
      const { token } = data;

      try {
        if (token) {
          const decoded = jwt.verify(token, this.options.jwtSecret);
          const client = this.clients.get(socket.id);
          client.user = decoded;

          // Track user sockets
          if (!this.userSockets.has(decoded.id)) {
            this.userSockets.set(decoded.id, new Set());
          }
          this.userSockets.get(decoded.id).add(socket.id);

          console.log(`User authenticated: ${decoded.username} (${socket.id})`);
        }

        callback({ success: true, user: this.clients.get(socket.id).user });
      } catch (error) {
        callback({ success: false, error: 'Invalid token' });
      }
    });

    // ========== Room Management ==========

    socket.on('join', (data, callback) => {
      const { room } = data;
      const client = this.clients.get(socket.id);

      if (!room) {
        callback({ success: false, error: 'Room name required' });
        return;
      }

      // Leave current room
      if (client.room) {
        this.leaveRoom(socket, client.room);
      }

      // Join new room
      socket.join(room);

      if (!this.rooms.has(room)) {
        this.rooms.set(room, new Set());
      }
      this.rooms.get(room).add(socket.id);

      client.room = room;

      // Notify others
      socket.to(room).emit('user:joined', {
        user: client.user,
        socketId: socket.id,
        room,
      });

      // Send room info
      const roomUsers = this.getRoomUsers(room);
      callback({
        success: true,
        room,
        users: roomUsers,
      });

      console.log(`Socket ${socket.id} joined room: ${room}`);
    });

    socket.on('leave', (data, callback) => {
      const client = this.clients.get(socket.id);

      if (client.room) {
        this.leaveRoom(socket, client.room);
      }

      callback({ success: true });
    });

    // ========== Messaging ==========

    socket.on('message', (data, callback) => {
      const { content, room, type = 'text' } = data;
      const client = this.clients.get(socket.id);

      if (!room && !client.room) {
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const targetRoom = room || client.room;

      const message = {
        id: uuidv4(),
        content,
        type,
        user: client.user,
        socketId: socket.id,
        room: targetRoom,
        timestamp: new Date().toISOString(),
      };

      // Broadcast to room
      this.io.to(targetRoom).emit('message', message);

      this.stats.totalMessages++;
      callback({ success: true, message });

      console.log(`Message in ${targetRoom}: ${content.substring(0, 50)}...`);
    });

    socket.on('private', (data, callback) => {
      const { to, content } = data;
      const client = this.clients.get(socket.id);

      const targetSocket = this.io.sockets.sockets.get(to);

      if (!targetSocket) {
        callback({ success: false, error: 'Target not found' });
        return;
      }

      const message = {
        id: uuidv4(),
        content,
        from: client.user,
        to,
        timestamp: new Date().toISOString(),
      };

      targetSocket.emit('private', message);
      socket.emit('private', message);

      callback({ success: true, message });
    });

    // ========== Real-time Collaboration ==========

    // Cursor position
    socket.on('cursor:move', (data) => {
      const client = this.clients.get(socket.id);
      if (!client.room) return;

      socket.to(client.room).emit('cursor:update', {
        socketId: socket.id,
        user: client.user,
        position: data.position,
      });
    });

    // Selection change
    socket.on('selection:change', (data) => {
      const client = this.clients.get(socket.id);
      if (!client.room) return;

      socket.to(client.room).emit('selection:update', {
        socketId: socket.id,
        user: client.user,
        selection: data.selection,
      });
    });

    // Typing indicator
    socket.on('typing:start', () => {
      const client = this.clients.get(socket.id);
      if (!client.room) return;

      socket.to(client.room).emit('typing:start', {
        user: client.user,
        socketId: socket.id,
      });
    });

    socket.on('typing:stop', () => {
      const client = this.clients.get(socket.id);
      if (!client.room) return;

      socket.to(client.room).emit('typing:stop', {
        user: client.user,
        socketId: socket.id,
      });
    });

    // ========== Disconnect ==========

    socket.on('disconnect', (reason) => {
      console.log(`Client disconnected: ${socket.id}, reason: ${reason}`);

      const client = this.clients.get(socket.id);

      if (client.room) {
        this.leaveRoom(socket, client.room);
      }

      // Clean up user sockets
      if (client.user && this.userSockets.has(client.user.id)) {
        this.userSockets.get(client.user.id).delete(socket.id);
        if (this.userSockets.get(client.user.id).size === 0) {
          this.userSockets.delete(client.user.id);
        }
      }

      this.clients.delete(socket.id);
    });

    // Send connection ack
    socket.emit('connected', {
      socketId: socket.id,
      timestamp: new Date().toISOString(),
    });
  }

  leaveRoom(socket, room) {
    socket.leave(room);

    if (this.rooms.has(room)) {
      this.rooms.get(room).delete(socket.id);
      if (this.rooms.get(room).size === 0) {
        this.rooms.delete(room);
      }
    }

    const client = this.clients.get(socket.id);
    if (client) {
      client.room = null;
    }

    // Notify others
    socket.to(room).emit('user:left', {
      socketId: socket.id,
      user: client?.user,
      room,
    });
  }

  getRoomUsers(room) {
    const roomSockets = this.io.sockets.adapter.rooms.get(room);
    if (!roomSockets) return [];

    const users = [];
    for (const socketId of roomSockets) {
      const client = this.clients.get(socketId);
      if (client && client.user) {
        users.push({
          socketId,
          user: client.user,
        });
      }
    }

    return users;
  }

  // ========== Server Control ==========

  start() {
    return new Promise((resolve) => {
      this.server.listen(this.options.port, () => {
        console.log(`Socket.IO server running on port ${this.options.port}`);
        resolve(this.options.port);
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.io.close();
      this.server.close(() => {
        console.log('Socket server stopped');
        resolve();
      });
    });
  }

  // ========== Broadcasting ==========

  broadcast(event, data, room = null) {
    if (room) {
      this.io.to(room).emit(event, data);
    } else {
      this.io.emit(event, data);
    }
  }

  sendToUser(userId, event, data) {
    const sockets = this.userSockets.get(userId);
    if (sockets) {
      for (const socketId of sockets) {
        this.io.to(socketId).emit(event, data);
      }
    }
  }

  // ========== Statistics ==========

  getStats() {
    return {
      ...this.stats,
      activeClients: this.clients.size,
      activeRooms: this.rooms.size,
      memory: process.memoryUsage(),
      uptime: process.uptime(),
    };
  }
}

// ========== Export ==========

module.exports = { SocketServer, config };
