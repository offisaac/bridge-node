/**
 * Socket.IO Client Library
 * 客户端实时通信库
 */

const { io } = require('socket.io-client');

class RealtimeClient {
  constructor(options = {}) {
    this.options = {
      url: options.url || 'http://localhost:3001',
      autoConnect: options.autoConnect !== false,
      reconnection: options.reconnection !== false,
      reconnectionAttempts: options.reconnectionAttempts || 10,
      reconnectionDelay: options.reconnectionDelay || 1000,
      auth: options.auth || null,
    };

    this.socket = null;
    this.connected = false;
    this.authenticated = false;
    this.user = null;
    this.room = null;

    // Event handlers
    this.handlers = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.socket = io(this.options.url, {
        autoConnect: this.options.autoConnect,
        reconnection: this.options.reconnection,
        reconnectionAttempts: this.options.reconnectionAttempts,
        reconnectionDelay: this.options.reconnectionDelay,
      });

      this.socket.on('connect', () => {
        console.log('Connected to server');
        this.connected = true;

        // Auto auth if token provided
        if (this.options.auth) {
          this.auth(this.options.auth);
        }

        resolve();
      });

      this.socket.on('disconnect', (reason) => {
        console.log('Disconnected:', reason);
        this.connected = false;
        this.emit('disconnect', { reason });
      });

      this.socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        reject(error);
      });

      this.socket.on('connected', (data) => {
        console.log('Server ack:', data);
        this.emit('ready', data);
      });

      // Forward all events
      this.setupEventForwarding();
    });
  }

  setupEventForwarding() {
    const events = [
      'connected',
      'user:joined',
      'user:left',
      'message',
      'private',
      'cursor:update',
      'selection:update',
      'typing:start',
      'typing:stop',
    ];

    events.forEach((event) => {
      this.socket.on(event, (data) => {
        this.emit(event, data);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.connected = false;
    }
  }

  // ========== Authentication ==========

  auth(token) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.emit('auth', { token }, (response) => {
        if (response.success) {
          this.authenticated = true;
          this.user = response.user;
          console.log('Authenticated as:', this.user?.username);
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  // ========== Room Management ==========

  join(room) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.emit('join', { room }, (response) => {
        if (response.success) {
          this.room = room;
          console.log(`Joined room: ${room}`);
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  leave() {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.emit('leave', {}, (response) => {
        if (response.success) {
          this.room = null;
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  // ========== Messaging ==========

  sendMessage(content, type = 'text') {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.emit('message', { content, type, room: this.room }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  sendPrivate(to, content) {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Not connected'));
        return;
      }

      this.socket.emit('private', { to, content }, (response) => {
        if (response.success) {
          resolve(response);
        } else {
          reject(new Error(response.error));
        }
      });
    });
  }

  // ========== Collaboration ==========

  moveCursor(position) {
    if (!this.socket || !this.connected) return;

    this.socket.emit('cursor:move', { position });
  }

  changeSelection(selection) {
    if (!this.socket || !this.connected) return;

    this.socket.emit('selection:change', { selection });
  }

  startTyping() {
    if (!this.socket || !this.connected) return;

    this.socket.emit('typing:start');
  }

  stopTyping() {
    if (!this.socket || !this.connected) return;

    this.socket.emit('typing:stop');
  }

  // ========== Event Handling ==========

  on(event, handler) {
    this.handlers.set(event, handler);
  }

  off(event) {
    this.handlers.delete(event);
  }

  emit(event, data) {
    const handler = this.handlers.get(event);
    if (handler) {
      handler(data);
    }
  }

  // ========== State ==========

  get isConnected() {
    return this.connected;
  }

  get isAuthenticated() {
    return this.authenticated;
  }

  get socketId() {
    return this.socket?.id;
  }
}

// ========== Export ==========

module.exports = { RealtimeClient };
