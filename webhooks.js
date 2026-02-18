/**
 * Webhooks System - 可配置的 Webhooks 系统
 * 基于 BRIDGE-014
 */

const EventEmitter = require('events');
const crypto = require('crypto');

// ========== Webhook Event Types ==========

const WebhookEvent = {
  // User events
  USER_CREATED: 'user.created',
  USER_UPDATED: 'user.updated',
  USER_DELETED: 'user.deleted',

  // Session events
  SESSION_CREATED: 'session.created',
  SESSION_UPDATED: 'session.updated',
  SESSION_DELETED: 'session.deleted',

  // Context events
  CONTEXT_CREATED: 'context.created',
  CONTEXT_UPDATED: 'context.updated',
  CONTEXT_DELETED: 'context.deleted',

  // Input events
  INPUT_RECEIVED: 'input.received',

  // System events
  SYSTEM_ERROR: 'system.error',
  SYSTEM_BACKUP: 'system.backup',

  // Custom events
  CUSTOM: 'custom'
};

// ========== Webhook ==========

class Webhook {
  constructor(id, url, events, options = {}) {
    this.id = id;
    this.url = url;
    this.events = events; // Array of event names or '*' for all
    this.name = options.name || '';
    this.secret = options.secret || null;
    this.headers = options.headers || {};
    this.timeout = options.timeout || 30000;
    this.retry = options.retry || 3;
    this.enabled = options.enabled !== false;
    this.createdAt = new Date();
    this.lastTriggered = null;
  }

  matchesEvent(event) {
    if (this.events.includes('*')) return true;
    return this.events.includes(event);
  }

  toJSON() {
    return {
      id: this.id,
      url: this.url,
      events: this.events,
      name: this.name,
      timeout: this.timeout,
      retry: this.retry,
      enabled: this.enabled,
      createdAt: this.createdAt
    };
  }
}

// ========== Webhook Delivery ==========

class WebhookDelivery {
  constructor(webhook, payload) {
    this.id = crypto.randomUUID();
    this.webhookId = webhook.id;
    this.url = webhook.url;
    this.event = payload.event;
    this.data = payload.data;
    this.timestamp = new Date();
    this.status = 'pending';
    this.response = null;
    this.error = null;
    this.attempts = 0;
  }
}

// ========== Webhook Manager ==========

class WebhookManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.webhooks = new Map(); // id -> Webhook
    this.deliveries = new Map(); // id -> WebhookDelivery
    this.deliveryQueue = [];
    this.running = false;
    this.maxConcurrent = options.maxConcurrent || 5;
    this.deliveryStats = {
      total: 0,
      success: 0,
      failed: 0,
      pending: 0
    };
  }

  // ========== Webhook CRUD ==========

  createWebhook(url, events, options = {}) {
    const id = options.id || crypto.randomUUID();
    const webhook = new Webhook(id, url, events, options);
    this.webhooks.set(id, webhook);
    this.emit('webhook:created', webhook.toJSON());
    return webhook;
  }

  updateWebhook(id, updates) {
    const webhook = this.webhooks.get(id);
    if (!webhook) return null;

    if (updates.url) webhook.url = updates.url;
    if (updates.events) webhook.events = updates.events;
    if (updates.name !== undefined) webhook.name = updates.name;
    if (updates.secret !== undefined) webhook.secret = updates.secret;
    if (updates.headers) webhook.headers = updates.headers;
    if (updates.timeout) webhook.timeout = updates.timeout;
    if (updates.retry) webhook.retry = updates.retry;
    if (updates.enabled !== undefined) webhook.enabled = updates.enabled;

    this.emit('webhook:updated', webhook.toJSON());
    return webhook;
  }

  deleteWebhook(id) {
    const webhook = this.webhooks.get(id);
    if (!webhook) return false;

    this.webhooks.delete(id);
    this.emit('webhook:deleted', { id });
    return true;
  }

  getWebhook(id) {
    return this.webhooks.get(id);
  }

  listWebhooks(event = null) {
    const webhooks = Array.from(this.webhooks.values());

    if (event) {
      return webhooks.filter(w => w.matchesEvent(event) && w.enabled);
    }

    return webhooks;
  }

  // ========== Trigger ==========

  async trigger(event, data) {
    const matchingWebhooks = this.listWebhooks(event);

    if (matchingWebhooks.length === 0) {
      return [];
    }

    const payload = {
      event,
      data,
      timestamp: new Date().toISOString()
    };

    const deliveries = [];

    for (const webhook of matchingWebhooks) {
      const delivery = new WebhookDelivery(webhook, payload);
      this.deliveries.set(delivery.id, delivery);
      deliveries.push(delivery);
      this.deliveryQueue.push(delivery);
    }

    this.deliveryStats.total += deliveries.length;
    this.deliveryStats.pending += deliveries.length;

    // Start processing if not already running
    if (!this.running) {
      this._processQueue();
    }

    return deliveries;
  }

  // ========== Delivery Processing ==========

  async _processQueue() {
    this.running = true;

    while (this.deliveryQueue.length > 0) {
      // Process up to maxConcurrent deliveries
      const batch = this.deliveryQueue.splice(0, this.maxConcurrent);

      await Promise.allSettled(
        batch.map(d => this._deliver(d))
      );
    }

    this.running = false;
  }

  async _deliver(delivery) {
    const webhook = this.webhooks.get(delivery.webhookId);
    if (!webhook || !webhook.enabled) {
      delivery.status = 'skipped';
      return;
    }

    delivery.attempts++;

    try {
      // Build request
      const headers = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': delivery.event,
        'X-Webhook-Delivery': delivery.id,
        ...webhook.headers
      };

      // Add signature if secret is set
      if (webhook.secret) {
        const signature = crypto
          .createHmac('sha256', webhook.secret)
          .update(JSON.stringify(delivery.data))
          .digest('hex');
        headers['X-Webhook-Signature'] = signature;
      }

      // Make request (using native fetch or http)
      const response = await this._makeRequest(webhook.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(delivery.data),
        timeout: webhook.timeout
      });

      delivery.status = response.ok ? 'success' : 'failed';
      delivery.response = {
        status: response.status,
        body: await response.text().catch(() => '')
      };

      this.deliveryStats.pending--;
      if (response.ok) {
        this.deliveryStats.success++;
      } else {
        this.deliveryStats.failed++;
        this._scheduleRetry(delivery, webhook);
      }

      this.emit('delivery:completed', delivery);

    } catch (error) {
      delivery.status = 'failed';
      delivery.error = error.message;
      this.deliveryStats.pending--;

      if (delivery.attempts < webhook.retry) {
        this._scheduleRetry(delivery, webhook);
      } else {
        this.deliveryStats.failed++;
      }

      this.emit('delivery:failed', delivery);
    }
  }

  async _makeRequest(url, options) {
    // Simple implementation using native http
    const http = require('http');
    const https = require('https');

    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    return new Promise((resolve) => {
      const req = client.request(urlObj, {
        method: options.method,
        headers: options.headers
      }, (res) => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          text: () => new Promise(r => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => r(body));
          })
        });
      });

      req.on('error', () => {
        resolve({ ok: false, status: 0, text: () => '' });
      });

      req.setTimeout(options.timeout || 30000, () => {
        req.destroy();
        resolve({ ok: false, status: 408, text: () => 'Timeout' });
      });

      if (options.body) {
        req.write(options.body);
      }
      req.end();
    });
  }

  _scheduleRetry(delivery, webhook) {
    const delay = Math.pow(2, delivery.attempts) * 1000;
    setTimeout(() => {
      this.deliveryQueue.push(delivery);
      if (!this.running) {
        this._processQueue();
      }
    }, delay);
  }

  // ========== Delivery History ==========

  getDelivery(id) {
    return this.deliveries.get(id);
  }

  getDeliveries(webhookId = null, limit = 100) {
    let deliveries = Array.from(this.deliveries.values());

    if (webhookId) {
      deliveries = deliveries.filter(d => d.webhookId === webhookId);
    }

    return deliveries
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  // ========== Statistics ==========

  getStats() {
    return {
      ...this.deliveryStats,
      webhooks: this.webhooks.size,
      pending: this.deliveryQueue.length
    };
  }

  // ========== Test ==========

  async testWebhook(id) {
    const webhook = this.webhooks.get(id);
    if (!webhook) return null;

    const payload = {
      event: 'test',
      data: { message: 'Test webhook' },
      timestamp: new Date().toISOString()
    };

    const delivery = new WebhookDelivery(webhook, payload);
    this.deliveries.set(delivery.id, delivery);

    await this._deliver(delivery);

    return delivery;
  }
}

// ========== Export ==========

module.exports = {
  WebhookManager,
  Webhook,
  WebhookDelivery,
  WebhookEvent
};
