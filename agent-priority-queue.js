/**
 * Agent Priority Queue - 智能优先级队列管理器
 * Agent任务优先级调度系统
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

// ========== Data Models ==========

class PriorityLevel {
  static CRITICAL = 0;
  static HIGH = 1;
  static NORMAL = 2;
  static LOW = 3;
  static IDLE = 4;

  static labels = {
    0: 'CRITICAL',
    1: 'HIGH',
    2: 'NORMAL',
    3: 'LOW',
    4: 'IDLE'
  };

  static fromString(str) {
    const map = {
      'CRITICAL': 0,
      'HIGH': 1,
      'NORMAL': 2,
      'LOW': 3,
      'IDLE': 4
    };
    return map[str.toUpperCase()] ?? 2;
  }
}

class QueueItem {
  constructor(data) {
    this.id = data.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.agentId = data.agentId;
    this.task = data.task || {};
    // Convert string priority to number if needed
    this.priority = typeof data.priority === 'string'
      ? PriorityLevel.fromString(data.priority)
      : (data.priority ?? PriorityLevel.NORMAL);
    this.payload = data.payload || {};
    this.metadata = data.metadata || {};
    this.status = data.status || 'pending'; // pending, processing, completed, failed, cancelled
    this.createdAt = data.createdAt || Date.now();
    this.startedAt = data.startedAt || null;
    this.completedAt = data.completedAt || null;
    this.processedBy = data.processedBy || null;
    this.retries = data.retries || 0;
    this.maxRetries = data.maxRetries || 3;
    this.timeout = data.timeout || 300000; // 5 minutes default
    this.deadline = data.deadline || null; // Unix timestamp
  }

  toJSON() {
    return {
      id: this.id,
      agentId: this.agentId,
      task: this.task,
      priority: this.priority,
      priorityLabel: PriorityLevel.labels[this.priority],
      payload: this.payload,
      metadata: this.metadata,
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      processedBy: this.processedBy,
      retries: this.retries,
      maxRetries: this.maxRetries,
      timeout: this.timeout,
      deadline: this.deadline
    };
  }

  isExpired() {
    if (!this.deadline) return false;
    return Date.now() > this.deadline;
  }

  canRetry() {
    return this.retries < this.maxRetries;
  }

  incrementRetry() {
    this.retries++;
    this.status = 'pending';
    this.startedAt = null;
  }
}

// ========== Main Queue Class ==========

class AgentPriorityQueue extends EventEmitter {
  constructor(options = {}) {
    super();
    this.storageDir = options.storageDir || './agent-priority-queue-data';
    this.name = options.name || 'default';
    this.maxSize = options.maxSize || 10000;
    this.defaultTimeout = options.defaultTimeout || 300000;

    // Priority queues (lower number = higher priority)
    this.queues = {
      0: [], // CRITICAL
      1: [], // HIGH
      2: [], // NORMAL
      3: [], // LOW
      4: []  // IDLE
    };

    // Processing state
    this.processing = new Map(); // itemId -> processing info
    this.completed = new Map(); // itemId -> result
    this.stats = {
      enqueued: 0,
      processed: 0,
      failed: 0,
      cancelled: 0,
      expired: 0
    };

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this._loadState();
  }

  _loadState() {
    const stateFile = path.join(this.storageDir, `${this.name}-queue.json`);
    if (fs.existsSync(stateFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        for (const priority of Object.keys(this.queues)) {
          this.queues[priority] = (data.queues?.[priority] || []).map(
            item => new QueueItem(item)
          );
        }
        this.stats = data.stats || this.stats;
      } catch (e) {
        console.error('Failed to load queue state:', e);
      }
    }
  }

  _saveState() {
    const stateFile = path.join(this.storageDir, `${this.name}-queue.json`);
    const data = {
      queues: {},
      stats: this.stats
    };
    for (const priority of Object.keys(this.queues)) {
      data.queues[priority] = this.queues[priority].map(item => item.toJSON());
    }
    fs.writeFileSync(stateFile, JSON.stringify(data, null, 2));
  }

  // ========== Enqueue ==========

  enqueue(agentId, task, options = {}) {
    const item = new QueueItem({
      agentId,
      task,
      priority: options.priority ?? PriorityLevel.NORMAL,
      payload: options.payload || {},
      metadata: options.metadata || {},
      maxRetries: options.maxRetries ?? 3,
      timeout: options.timeout ?? this.defaultTimeout,
      deadline: options.deadline || null
    });

    // Check max size
    const totalSize = this.size();
    if (totalSize >= this.maxSize) {
      // Try to remove expired or lowest priority items
      this._evictIfNeeded();
      if (this.size() >= this.maxSize) {
        throw new Error(`Queue is full (max: ${this.maxSize})`);
      }
    }

    // Add to appropriate priority queue
    this.queues[item.priority].push(item);
    this.stats.enqueued++;

    this._saveState();
    this.emit('enqueue', item);

    return item;
  }

  _evictIfNeeded() {
    // Try to remove expired items first
    for (const priority of Object.keys(this.queues)) {
      const queue = this.queues[priority];
      const validItems = queue.filter(item => !item.isExpired());
      const expiredCount = queue.length - validItems.length;
      this.queues[priority] = validItems;
      this.stats.expired += expiredCount;
    }

    // If still full, remove lowest priority items
    if (this.size() >= this.maxSize) {
      const lowestQueue = this.queues[PriorityLevel.IDLE];
      const removeCount = Math.min(10, lowestQueue.length);
      this.queues[PriorityLevel.IDLE] = lowestQueue.slice(removeCount);
      this.stats.cancelled += removeCount;
    }
  }

  // ========== Dequeue ==========

  dequeue(agentId = null) {
    // Find highest priority non-empty queue
    for (let priority = PriorityLevel.CRITICAL; priority <= PriorityLevel.IDLE; priority++) {
      const queue = this.queues[priority];
      if (queue.length === 0) continue;

      // Find item that matches agentId (or any if agentId is null)
      let itemIndex = -1;
      if (agentId) {
        itemIndex = queue.findIndex(item =>
          item.agentId === agentId && item.status === 'pending'
        );
      } else {
        itemIndex = queue.findIndex(item => item.status === 'pending');
      }

      if (itemIndex >= 0) {
        const item = queue.splice(itemIndex, 1)[0];

        // Check if expired
        if (item.isExpired()) {
          item.status = 'expired';
          this.stats.expired++;
          this._saveState();
          this.emit('expired', item);
          continue;
        }

        // Mark as processing
        item.status = 'processing';
        item.startedAt = Date.now();
        item.processedBy = agentId;

        this.processing.set(item.id, {
          item,
          startedAt: item.startedAt,
          timeout: setTimeout(() => {
            this._handleTimeout(item.id);
          }, item.timeout)
        });

        this._saveState();
        this.emit('dequeue', item);
        return item;
      }
    }

    return null;
  }

  _handleTimeout(itemId) {
    const processing = this.processing.get(itemId);
    if (!processing) return;

    const item = processing.item;
    item.status = 'timeout';

    if (item.canRetry()) {
      item.incrementRetry();
      this.queues[item.priority].push(item);
      this.emit('retry', item);
    } else {
      this.stats.failed++;
      this.emit('failed', item);
    }

    this.processing.delete(itemId);
    this._saveState();
  }

  // ========== Complete ==========

  complete(itemId, result = null) {
    const processing = this.processing.get(itemId);
    if (!processing) {
      throw new Error(`Item not found in processing: ${itemId}`);
    }

    clearTimeout(processing.timeout);
    const item = processing.item;

    item.status = 'completed';
    item.completedAt = Date.now();
    item.result = result;

    this.completed.set(itemId, { item, result, completedAt: item.completedAt });
    this.processing.delete(itemId);
    this.stats.processed++;

    this._saveState();
    this.emit('complete', item);

    return item;
  }

  // ========== Fail ==========

  fail(itemId, error = null) {
    const processing = this.processing.get(itemId);
    if (!processing) {
      throw new Error(`Item not found in processing: ${itemId}`);
    }

    clearTimeout(processing.timeout);
    const item = processing.item;

    if (item.canRetry()) {
      item.incrementRetry();
      this.queues[item.priority].push(item);
      this.emit('retry', item);
    } else {
      item.status = 'failed';
      item.error = error?.message || String(error);
      item.completedAt = Date.now();
      this.stats.failed++;
      this.emit('failed', item);
    }

    this.processing.delete(itemId);
    this._saveState();

    return item;
  }

  // ========== Cancel ==========

  cancel(itemId) {
    // Check pending queues
    for (const priority of Object.keys(this.queues)) {
      const queue = this.queues[priority];
      const index = queue.findIndex(item => item.id === itemId);
      if (index >= 0) {
        const item = queue.splice(index, 1)[0];
        item.status = 'cancelled';
        this.stats.cancelled++;
        this._saveState();
        this.emit('cancelled', item);
        return item;
      }
    }

    // Check processing
    const processing = this.processing.get(itemId);
    if (processing) {
      clearTimeout(processing.timeout);
      const item = processing.item;
      item.status = 'cancelled';
      this.processing.delete(itemId);
      this.stats.cancelled++;
      this._saveState();
      this.emit('cancelled', item);
      return item;
    }

    return null;
  }

  // ========== Peek ==========

  peek(priority = null) {
    if (priority !== null) {
      const queue = this.queues[priority];
      return queue.find(item => item.status === 'pending') || null;
    }

    // Find highest priority item
    for (let p = PriorityLevel.CRITICAL; p <= PriorityLevel.IDLE; p++) {
      const item = this.queues[p].find(i => i.status === 'pending');
      if (item) return item;
    }
    return null;
  }

  // ========== Query ==========

  get(itemId) {
    // Check queues
    for (const queue of Object.values(this.queues)) {
      const item = queue.find(i => i.id === itemId);
      if (item) return item;
    }

    // Check processing
    const processing = this.processing.get(itemId);
    if (processing) return processing.item;

    // Check completed
    const completed = this.completed.get(itemId);
    if (completed) return completed.item;

    return null;
  }

  list(options = {}) {
    const {
      status = null,
      priority = null,
      agentId = null,
      limit = 100,
      offset = 0
    } = options;

    let results = [];

    // Gather all items
    for (const queue of Object.values(this.queues)) {
      results = results.concat(queue);
    }

    // Add processing
    for (const [, processing] of this.processing) {
      results.push(processing.item);
    }

    // Add completed (recent only)
    const completedArray = Array.from(this.completed.values())
      .map(c => c.item)
      .slice(-100);
    results = results.concat(completedArray);

    // Apply filters
    if (status) {
      results = results.filter(item => item.status === status);
    }
    if (priority !== null) {
      results = results.filter(item => item.priority === priority);
    }
    if (agentId) {
      results = results.filter(item => item.agentId === agentId);
    }

    // Sort by priority then creation time
    results.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.createdAt - b.createdAt;
    });

    return results.slice(offset, offset + limit);
  }

  // ========== Statistics ==========

  size(priority = null) {
    if (priority !== null) {
      return this.queues[priority].length;
    }
    let total = 0;
    for (const queue of Object.values(this.queues)) {
      total += queue.length;
    }
    return total;
  }

  getStats() {
    const byPriority = {};
    for (const [priority, queue] of Object.entries(this.queues)) {
      byPriority[PriorityLevel.labels[priority]] = {
        pending: queue.filter(i => i.status === 'pending').length,
        total: queue.length
      };
    }

    return {
      name: this.name,
      maxSize: this.maxSize,
      currentSize: this.size(),
      processing: this.processing.size,
      completed: this.completed.size,
      stats: this.stats,
      byPriority
    };
  }

  // ========== Priority Adjustment ==========

  adjustPriority(itemId, newPriority) {
    // Find item in queues
    for (const [priority, queue] of Object.entries(this.queues)) {
      const index = queue.findIndex(item => item.id === itemId);
      if (index >= 0) {
        const item = queue.splice(index, 1)[0];
        item.priority = newPriority;
        this.queues[newPriority].push(item);
        this._saveState();
        this.emit('priority-adjusted', item);
        return item;
      }
    }
    return null;
  }

  // ========== Requeue ==========

  requeue(itemId) {
    const item = this.get(itemId);
    if (!item) return null;

    // Cancel first if processing
    if (item.status === 'processing') {
      this.cancel(itemId);
    }

    // Reset and re-enqueue
    item.status = 'pending';
    item.startedAt = null;
    item.completedAt = null;
    item.retries = 0;

    this.queues[item.priority].push(item);
    this._saveState();
    this.emit('requeue', item);

    return item;
  }

  // ========== Cleanup ==========

  clearCompleted(keepLast = 100) {
    const entries = Array.from(this.completed.entries());
    const toRemove = entries.slice(0, Math.max(0, entries.length - keepLast));

    for (const [id] of toRemove) {
      this.completed.delete(id);
    }

    this._saveState();
    return toRemove.length;
  }

  // ========== Export ==========

  exportQueue() {
    return {
      name: this.name,
      pending: this.list({ status: 'pending' }),
      processing: Array.from(this.processing.values()).map(p => p.item),
      stats: this.stats
    };
  }
}

// ========== Multi-Queue Manager ==========

class QueueManager {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './agent-priority-queue-data';
    this.queues = new Map();
    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    this._loadQueues();
  }

  _loadQueues() {
    const indexFile = path.join(this.storageDir, 'queue-index.json');
    if (fs.existsSync(indexFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(indexFile, 'utf8'));
        for (const name of data.queues || []) {
          this.queues.set(name, new AgentPriorityQueue({
            name,
            storageDir: this.storageDir
          }));
        }
      } catch (e) {
        console.error('Failed to load queue index:', e);
      }
    }
  }

  _saveIndex() {
    const indexFile = path.join(this.storageDir, 'queue-index.json');
    fs.writeFileSync(indexFile, JSON.stringify({
      queues: Array.from(this.queues.keys())
    }, null, 2));
  }

  getOrCreate(name, options = {}) {
    if (!this.queues.has(name)) {
      this.queues.set(name, new AgentPriorityQueue({
        name,
        storageDir: this.storageDir,
        ...options
      }));
      this._saveIndex();
    }
    return this.queues.get(name);
  }

  listQueues() {
    return Array.from(this.queues.keys());
  }

  getStats() {
    const stats = {};
    for (const [name, queue] of this.queues) {
      stats[name] = queue.getStats();
    }
    return stats;
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new QueueManager();
  const queue = manager.getOrCreate(args[1] || 'default');

  switch (command) {
    case 'enqueue':
      const item = queue.enqueue(args[1], args[2], {
        priority: args[3] ? PriorityLevel.fromString(args[3]) : PriorityLevel.NORMAL
      });
      console.log(`Enqueued item: ${item.id}`);
      break;

    case 'dequeue':
      const dequeued = queue.dequeue(args[1]);
      if (dequeued) {
        console.log(`Dequeued: ${dequeued.id} (priority: ${PriorityLevel.labels[dequeued.priority]})`);
      } else {
        console.log('No items to dequeue');
      }
      break;

    case 'list':
      console.log('Queue Contents:');
      console.log('================');
      for (const item of queue.list({ limit: 20 })) {
        console.log(`[${item.status}] ${item.id} - ${item.agentId} (${PriorityLevel.labels[item.priority]})`);
      }
      break;

    case 'stats':
      console.log('Queue Statistics:');
      console.log(JSON.stringify(queue.getStats(), null, 2));
      break;

    case 'complete':
      const completed = queue.complete(args[1]);
      console.log(`Completed: ${completed.id}`);
      break;

    case 'fail':
      const failed = queue.fail(args[1], args[2] || 'Unknown error');
      console.log(`Failed: ${failed.id}`);
      break;

    case 'cancel':
      const cancelled = queue.cancel(args[1]);
      console.log(`Cancelled: ${cancelled?.id || 'not found'}`);
      break;

    case 'peek':
      const peeked = queue.peek();
      if (peeked) {
        console.log(`Next: ${peeked.id} (${PriorityLevel.labels[peeked.priority]})`);
      } else {
        console.log('Queue is empty');
      }
      break;

    case 'adjust':
      const adjusted = queue.adjustPriority(args[1], PriorityLevel.fromString(args[2]));
      console.log(`Adjusted: ${adjusted?.id || 'not found'}`);
      break;

    case 'demo':
      // Demo: Create demo queue items
      console.log('=== Agent Priority Queue Demo ===\n');

      // Enqueue items with different priorities
      queue.enqueue('agent-1', { action: 'process-data', data: 'users.csv' }, { priority: 'HIGH' });
      queue.enqueue('agent-2', { action: 'send-email', data: 'newsletter' }, { priority: 'NORMAL' });
      queue.enqueue('agent-1', { action: 'cleanup', data: 'temp-files' }, { priority: 'LOW' });
      queue.enqueue('agent-3', { action: 'urgent-alert', data: 'system-down' }, { priority: 'CRITICAL' });
      queue.enqueue('agent-2', { action: 'backup', data: 'db' }, { priority: 'IDLE' });

      console.log('--- After Enqueue ---');
      console.log(`Total items: ${queue.size()}`);

      console.log('\n--- Dequeue (highest priority first) ---');
      for (let i = 0; i < 3; i++) {
        const item = queue.dequeue();
        if (item) {
          console.log(`Dequeued: ${item.id} - ${item.task.action} (${PriorityLevel.labels[item.priority]})`);
          queue.complete(item.id, { success: true });
        }
      }

      console.log('\n--- Queue Status ---');
      console.log(JSON.stringify(queue.getStats(), null, 2));

      console.log('\n--- List All Items ---');
      for (const item of queue.list()) {
        console.log(`[${item.status}] ${item.id}: ${item.task.action} (${PriorityLevel.labels[item.priority]})`);
      }

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage:');
      console.log('  node agent-priority-queue.js enqueue <agentId> <task> [priority]');
      console.log('  node agent-priority-queue.js dequeue [agentId]');
      console.log('  node agent-priority-queue.js list');
      console.log('  node agent-priority-queue.js stats');
      console.log('  node agent-priority-queue.js complete <itemId>');
      console.log('  node agent-priority-queue.js fail <itemId> [error]');
      console.log('  node agent-priority-queue.js cancel <itemId>');
      console.log('  node agent-priority-queue.js peek');
      console.log('  node agent-priority-queue.js adjust <itemId> <newPriority>');
      console.log('  node agent-priority-queue.js demo');
      console.log('\nPriority levels: CRITICAL, HIGH, NORMAL, LOW, IDLE');
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  AgentPriorityQueue,
  QueueManager,
  PriorityLevel,
  QueueItem
};
