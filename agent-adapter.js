/**
 * Agent Adapter Module
 *
 * Provides protocol adapter framework for different agent communication standards.
 * Usage: node agent-adapter.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   adapt <protocol> <data>  Adapt data between protocols
 *   status                 Show adapter stats
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = __dirname + '/data';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Protocol Types
 */
const ProtocolType = {
  REST: 'rest',
  GRPC: 'grpc',
  WEBSOCKET: 'websocket',
  MQTT: 'mqtt',
  AMQP: 'amqp',
  STOMP: 'stomp',
  SSE: 'sse'
};

/**
 * Message Format Types
 */
const MessageFormat = {
  JSON: 'json',
  XML: 'xml',
  PROTOBUF: 'protobuf',
  YAML: 'yaml',
  TEXT: 'text'
};

/**
 * Adapter Interface
 */
class Adapter {
  constructor(config) {
    this.name = config.name;
    this.sourceProtocol = config.sourceProtocol;
    this.targetProtocol = config.targetProtocol;
    this.config = config;
  }

  async adapt(data) {
    throw new Error('adapt() must be implemented');
  }

  async validate(data) {
    return { valid: true };
  }

  getCapabilities() {
    return {
      sourceProtocol: this.sourceProtocol,
      targetProtocol: this.targetProtocol,
      features: []
    };
  }
}

/**
 * REST to gRPC Adapter
 */
class RestToGrpcAdapter extends Adapter {
  constructor(config) {
    super({ ...config, sourceProtocol: ProtocolType.REST, targetProtocol: ProtocolType.GRPC });
    this.serviceMapping = config.serviceMapping || {};
  }

  async adapt(data) {
    // Transform RESTful request to gRPC method call
    const { method, path: rpcPath, body, headers } = data;

    const serviceName = this._extractService(rpcPath);
    const methodName = this._extractMethod(rpcPath);

    const grpcRequest = {
      service: serviceName,
      method: methodName,
      methodType: this._getMethodType(method),
      payload: body || {},
      metadata: headers || {}
    };

    return {
      protocol: ProtocolType.GRPC,
      data: grpcRequest
    };
  }

  _extractService(path) {
    const parts = path.split('/').filter(Boolean);
    return parts[0] || 'UnknownService';
  }

  _extractMethod(path) {
    const parts = path.split('/').filter(Boolean);
    return parts[1] || 'UnknownMethod';
  }

  _getMethodType(method) {
    const mapping = {
      GET: 'unary',
      POST: 'unary',
      PUT: 'unary',
      DELETE: 'unary',
      PATCH: 'unary'
    };
    return mapping[method] || 'unary';
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      features: ['rest-to-grpc', 'header-mapping', 'query-param-mapping']
    };
  }
}

/**
 * JSON to XML Adapter
 */
class JsonToXmlAdapter extends Adapter {
  constructor(config) {
    super({ ...config, sourceProtocol: 'json', targetProtocol: 'xml' });
    this.rootElement = config.rootElement || 'root';
  }

  async adapt(data) {
    const xml = this._jsonToXml(data, this.rootElement);
    return {
      protocol: 'xml',
      data: xml,
      contentType: 'application/xml'
    };
  }

  _jsonToXml(obj, element) {
    let xml = `<${element}>`;

    if (obj && typeof obj === 'object') {
      for (const [key, value] of Object.entries(obj)) {
        const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
        if (Array.isArray(value)) {
          for (const item of value) {
            xml += this._jsonToXml(item, safeKey);
          }
        } else if (value && typeof value === 'object') {
          xml += this._jsonToXml(value, safeKey);
        } else {
          xml += `<${safeKey}>${this._escapeXml(String(value))}</${safeKey}>`;
        }
      }
    } else if (obj !== null && obj !== undefined) {
      xml += this._escapeXml(String(obj));
    }

    xml += `</${element}>`;
    return xml;
  }

  _escapeXml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      features: ['json-to-xml', 'array-handling', 'xml-escaping']
    };
  }
}

/**
 * WebSocket to REST Adapter
 */
class WebSocketToRestAdapter extends Adapter {
  constructor(config) {
    super({ ...config, sourceProtocol: ProtocolType.WEBSOCKET, targetProtocol: ProtocolType.REST });
    this.restEndpoint = config.restEndpoint || '/api';
  }

  async adapt(data) {
    const { action, payload, id } = data;

    // Map WebSocket action to REST method
    const method = this._getRestMethod(action);
    const path = this._getRestPath(action);

    const restRequest = {
      method,
      path: `${this.restEndpoint}${path}`,
      body: method !== 'GET' ? payload : undefined,
      query: method === 'GET' ? payload : undefined,
      requestId: id
    };

    return {
      protocol: ProtocolType.REST,
      data: restRequest
    };
  }

  _getRestMethod(action) {
    const mapping = {
      'subscribe': 'GET',
      'unsubscribe': 'DELETE',
      'publish': 'POST',
      'update': 'PUT',
      'delete': 'DELETE'
    };
    return mapping[action] || 'POST';
  }

  _getRestPath(action) {
    const mapping = {
      'subscribe': '/subscriptions',
      'unsubscribe': '/subscriptions',
      'publish': '/messages',
      'update': '/resources',
      'delete': '/resources'
    };
    return mapping[action] || '/actions';
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      features: ['ws-to-rest', 'action-mapping', 'bidirectional']
    };
  }
}

/**
 * MQTT to AMQP Adapter
 */
class MqttToAmqpAdapter extends Adapter {
  constructor(config) {
    super({ ...config, sourceProtocol: ProtocolType.MQTT, targetProtocol: ProtocolType.AMQP });
    this.topicMapping = config.topicMapping || {};
    this.qosMapping = config.qosMapping || {};
  }

  async adapt(data) {
    const { topic, payload, qos = 0, retain = false } = data;

    // Map MQTT topic to AMQP routing key
    const routingKey = this._mapTopic(topic);

    // Map MQTT QoS to AMQP priority
    const priority = this._mapQos(qos);

    const amqpMessage = {
      exchange: 'mqtt.bridge',
      routingKey,
      body: payload,
      priority,
      properties: {
        deliveryMode: retain ? 2 : 1,
        timestamp: Date.now(),
        messageId: data.messageId || `msg-${Date.now()}`
      }
    };

    return {
      protocol: ProtocolType.AMQP,
      data: amqpMessage
    };
  }

  _mapTopic(topic) {
    // Transform MQTT topic to AMQP routing key
    // e.g., sensors/+/temperature -> sensors.*.temperature
    return topic.replace(/\+/g, '*').replace(/\/#/g, '.*');
  }

  _mapQos(qos) {
    const mapping = {
      0: 0,  // at-most-once
      1: 4,  // at-least-once
      2: 9   // exactly-once
    };
    return mapping[qos] || 0;
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      features: ['mqtt-to-amqp', 'topic-mapping', 'qos-mapping', 'retain-handling']
    };
  }
}

/**
 * Protocol Converter
 */
class ProtocolConverter {
  constructor() {
    this.adapters = new Map();
  }

  registerAdapter(name, adapter) {
    this.adapters.set(name, adapter);
  }

  getAdapter(name) {
    return this.adapters.get(name);
  }

  listAdapters() {
    return Array.from(this.adapters.values()).map(a => ({
      name: a.name,
      capabilities: a.getCapabilities()
    }));
  }

  async convert(adapterName, data) {
    const adapter = this.adapters.get(adapterName);
    if (!adapter) {
      throw new Error(`Adapter '${adapterName}' not found`);
    }
    return adapter.adapt(data);
  }

  async findPath(sourceProtocol, targetProtocol) {
    for (const adapter of this.adapters.values()) {
      if (adapter.sourceProtocol === sourceProtocol && adapter.targetProtocol === targetProtocol) {
        return adapter.name;
      }
    }
    return null;
  }
}

/**
 * Data Transformer
 */
class DataTransformer {
  constructor() {
    this.transforms = new Map();
  }

  registerTransform(name, fn) {
    this.transforms.set(name, fn);
  }

  transform(data, pipeline) {
    let result = data;
    for (const name of pipeline) {
      const fn = this.transforms.get(name);
      if (fn) {
        result = fn(result);
      }
    }
    return result;
  }

  listTransforms() {
    return Array.from(this.transforms.keys());
  }
}

/**
 * Adapter Manager
 */
class AdapterManager {
  constructor() {
    this.converter = new ProtocolConverter();
    this.transformer = new DataTransformer();
    this.stats = {
      conversions: 0,
      transforms: 0,
      errors: 0
    };

    // Register default adapters
    this._registerDefaultAdapters();
    this._registerDefaultTransforms();
  }

  _registerDefaultAdapters() {
    this.converter.registerAdapter('rest-to-grpc', new RestToGrpcAdapter({
      name: 'rest-to-grpc'
    }));

    this.converter.registerAdapter('json-to-xml', new JsonToXmlAdapter({
      name: 'json-to-xml',
      rootElement: 'response'
    }));

    this.converter.registerAdapter('ws-to-rest', new WebSocketToRestAdapter({
      name: 'ws-to-rest'
    }));

    this.converter.registerAdapter('mqtt-to-amqp', new MqttToAmqpAdapter({
      name: 'mqtt-to-amqp'
    }));
  }

  _registerDefaultTransforms() {
    this.transformer.registerTransform('uppercase', data => {
      if (typeof data === 'string') return data.toUpperCase();
      return data;
    });

    this.transformer.registerTransform('lowercase', data => {
      if (typeof data === 'string') return data.toLowerCase();
      return data;
    });

    this.transformer.registerTransform('trim', data => {
      if (typeof data === 'string') return data.trim();
      return data;
    });

    this.transformer.registerTransform('flatten', data => {
      return this._flattenObject(data);
    });
  }

  _flattenObject(obj, prefix = '') {
    const result = {};
    for (const [key, value] of Object.entries(obj || {})) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, this._flattenObject(value, newKey));
      } else {
        result[newKey] = value;
      }
    }
    return result;
  }

  async convert(adapterName, data) {
    try {
      const result = await this.converter.convert(adapterName, data);
      this.stats.conversions++;
      return result;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  transform(data, pipeline) {
    try {
      const result = this.transformer.transform(data, pipeline);
      this.stats.transforms++;
      return result;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  listAdapters() {
    return this.converter.listAdapters();
  }

  listTransforms() {
    return this.transformer.listTransforms();
  }

  getStats() {
    return {
      ...this.stats,
      adapters: this.converter.adapters.size,
      transforms: this.transformer.transforms.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Adapter Demo\n');

  const manager = new AdapterManager();

  // List adapters
  console.log('1. Registered Adapters:');
  const adapters = manager.listAdapters();
  for (const adapter of adapters) {
    console.log(`   - ${adapter.name}: ${adapter.capabilities.sourceProtocol} -> ${adapter.capabilities.targetProtocol}`);
  }

  // REST to gRPC
  console.log('\n2. REST to gRPC:');
  const restData = {
    method: 'POST',
    path: '/users/CreateUser',
    body: { name: 'John', email: 'john@example.com' },
    headers: { 'x-request-id': 'req-123' }
  };

  const grpcResult = await manager.convert('rest-to-grpc', restData);
  console.log(`   Source: ${JSON.stringify(restData).substring(0, 40)}...`);
  console.log(`   Target: ${JSON.stringify(grpcResult.data).substring(0, 40)}...`);

  // JSON to XML
  console.log('\n3. JSON to XML:');
  const jsonData = {
    user: { name: 'Alice', email: 'alice@example.com' },
    items: [{ id: 1 }, { id: 2 }]
  };

  const xmlResult = await manager.convert('json-to-xml', jsonData);
  console.log(`   XML: ${xmlResult.data.substring(0, 80)}...`);

  // WebSocket to REST
  console.log('\n4. WebSocket to REST:');
  const wsData = {
    action: 'publish',
    payload: { message: 'Hello' },
    id: 'msg-001'
  };

  const restResult = await manager.convert('ws-to-rest', wsData);
  console.log(`   Action: ${wsData.action} -> Method: ${restResult.data.method} ${restResult.data.path}`);

  // MQTT to AMQP
  console.log('\n5. MQTT to AMQP:');
  const mqttData = {
    topic: 'sensors/room1/temperature',
    payload: JSON.stringify({ value: 25.5 }),
    qos: 1,
    retain: false,
    messageId: 'msg-002'
  };

  const amqpResult = await manager.convert('mqtt-to-amqp', mqttData);
  console.log(`   Topic: ${mqttData.topic}`);
  console.log(`   Routing Key: ${amqpResult.data.routingKey}`);
  console.log(`   Priority: ${amqpResult.data.priority}`);

  // Data Transforms
  console.log('\n6. Data Transforms:');
  const transforms = manager.listTransforms();
  console.log(`   Available: ${transforms.join(', ')}`);

  const transformData = { user: { name: '  Bob  ', age: 30 } };
  const transformed = manager.transform(transformData, ['flatten', 'trim', 'lowercase']);
  console.log(`   Input: ${JSON.stringify(transformData)}`);
  console.log(`   Output: ${JSON.stringify(transformed)}`);

  // Chain conversion and transform
  console.log('\n7. Chain: Convert + Transform:');
  const complexData = {
    method: 'GET',
    path: '/products/ListProducts',
    query: { category: 'Electronics', minPrice: 100 }
  };

  const converted = await manager.convert('rest-to-grpc', complexData);
  const final = manager.transform(converted, ['flatten']);
  console.log(`   Converted & flattened: ${JSON.stringify(final).substring(0, 60)}...`);

  // Stats
  console.log('\n8. Statistics:');
  const stats = manager.getStats();
  console.log(`   Conversions: ${stats.conversions}`);
  console.log(`   Transforms: ${stats.transforms}`);
  console.log(`   Errors: ${stats.errors}`);
  console.log(`   Adapters: ${stats.adapters}`);
  console.log(`   Transform functions: ${stats.transforms}`);

  // Adapter capabilities
  console.log('\n9. Adapter Capabilities:');
  const wsAdapter = manager.converter.getAdapter('ws-to-rest');
  const caps = wsAdapter.getCapabilities();
  console.log(`   ${wsAdapter.name} features: ${caps.features.join(', ')}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'adapt') {
  const manager = new AdapterManager();
  const adapter = args[1] || 'rest-to-grpc';
  const data = JSON.parse(args[2] || '{}');
  manager.convert(adapter, data).then(r => console.log(JSON.stringify(r, null, 2)));
} else if (cmd === 'status') {
  const manager = new AdapterManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Adapter Module');
  console.log('Usage: node agent-adapter.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  adapt <name> <data> Convert data');
  console.log('  status             Show stats');
}
