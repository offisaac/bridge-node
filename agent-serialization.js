/**
 * Agent Serialization Module
 *
 * Provides data serialization with compression, validation, and versioning.
 * Usage: node agent-serialization.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   serialize <data>       Serialize data to string
 *   deserialize <data>     Deserialize string to data
 *   status                 Show serialization stats
 */

const crypto = require('crypto');
const zlib = require('zlib');

const DATA_DIR = __dirname + '/data';
const FS = require('fs');

function ensureDataDir() {
  if (!FS.existsSync(DATA_DIR)) {
    FS.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Serialization Types
 */
const SerialType = {
  JSON: 'json',
  BINARY: 'binary',
  BASE64: 'base64',
  MSG_PACK: 'msgpack',
  PROTO_BUF: 'protobuf'
};

/**
 * Compression Types
 */
const CompressionType = {
  NONE: 'none',
  GZIP: 'gzip',
  DEFLATE: 'deflate',
  BROTLI: 'brotli'
};

/**
 * Schema Validator
 */
class SchemaValidator {
  constructor(schema) {
    this.schema = schema;
  }

  validate(data) {
    const errors = [];
    this._validateObject(data, this.schema, '', errors);
    return {
      valid: errors.length === 0,
      errors
    };
  }

  _validateObject(data, schema, path, errors) {
    if (!data || typeof data !== 'object') {
      errors.push(`${path}: expected object, got ${typeof data}`);
      return;
    }

    for (const [key, type] of Object.entries(schema)) {
      const value = data[key];
      const currentPath = path ? `${path}.${key}` : key;

      if (value === undefined && type.required) {
        errors.push(`${currentPath}: required field missing`);
        continue;
      }

      if (value !== undefined) {
        this._validateType(value, type, currentPath, errors);
      }
    }
  }

  _validateType(value, type, path, errors) {
    const expectedType = type.type;

    if (expectedType === 'string' && typeof value !== 'string') {
      errors.push(`${path}: expected string, got ${typeof value}`);
    } else if (expectedType === 'number' && typeof value !== 'number') {
      errors.push(`${path}: expected number, got ${typeof value}`);
    } else if (expectedType === 'boolean' && typeof value !== 'boolean') {
      errors.push(`${path}: expected boolean, got ${typeof value}`);
    } else if (expectedType === 'array' && !Array.isArray(value)) {
      errors.push(`${path}: expected array, got ${typeof value}`);
    } else if (expectedType === 'object' && (typeof value !== 'object' || value === null)) {
      errors.push(`${path}: expected object, got ${typeof value}`);
    } else if (expectedType === 'object' && type.schema) {
      this._validateObject(value, type.schema, path, errors);
    } else if (expectedType === 'array' && type.items) {
      value.forEach((item, i) => {
        this._validateType(item, type.items, `${path}[${i}]`, errors);
      });
    }
  }
}

/**
 * Data Serializer
 */
class DataSerializer {
  constructor(options = {}) {
    this.options = {
      type: options.type || SerialType.JSON,
      compression: options.compression || CompressionType.NONE,
      version: options.version || '1.0.0',
      checksum: options.checksum !== false,
      pretty: options.pretty || false,
      ...options
    };
  }

  serialize(data) {
    let serialized = this._serializeData(data);
    let compressed = this._compress(serialized);
    let checksum = null;

    if (this.options.checksum) {
      checksum = this._generateChecksum(compressed);
    }

    const result = {
      v: this.options.version,
      t: this.options.type,
      c: this.options.compression,
      d: compressed,
      h: checksum
    };

    return this._encodeResult(result);
  }

  deserialize(serialized) {
    const result = this._decodeResult(serialized);

    if (!result) {
      throw new Error('Invalid serialized format');
    }

    if (result.h && !this._verifyChecksum(result.d, result.h)) {
      throw new Error('Checksum verification failed');
    }

    const decompressed = this._decompress(result.d, result.c);
    return this._deserializeData(decompressed, result.t);
  }

  _serializeData(data) {
    switch (this.options.type) {
      case SerialType.JSON:
        return this.options.pretty
          ? JSON.stringify(data, null, 2)
          : JSON.stringify(data);
      case SerialType.BINARY:
        return Buffer.from(JSON.stringify(data), 'utf8');
      case SerialType.BASE64:
        return JSON.stringify(data);
      default:
        return JSON.stringify(data);
    }
  }

  _deserializeData(serialized, type) {
    switch (type) {
      case SerialType.JSON:
      case SerialType.BASE64:
        return JSON.parse(serialized);
      case SerialType.BINARY:
        return JSON.parse(serialized.toString('utf8'));
      default:
        return JSON.parse(serialized);
    }
  }

  _compress(data) {
    switch (this.options.compression) {
      case CompressionType.GZIP:
        return zlib.gzipSync(Buffer.from(data, 'utf8')).toString('base64');
      case CompressionType.DEFLATE:
        return zlib.deflateSync(Buffer.from(data, 'utf8')).toString('base64');
      case CompressionType.BROTLI:
        return zlib.brotliCompressSync(Buffer.from(data, 'utf8')).toString('base64');
      default:
        return data;
    }
  }

  _decompress(data, compression) {
    const buffer = Buffer.from(data, 'base64');
    switch (compression) {
      case CompressionType.GZIP:
        return zlib.gunzipSync(buffer).toString('utf8');
      case CompressionType.DEFLATE:
        return zlib.inflateSync(buffer).toString('utf8');
      case CompressionType.BROTLI:
        return zlib.brotliDecompressSync(buffer).toString('utf8');
      default:
        return data;
    }
  }

  _generateChecksum(data) {
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  _verifyChecksum(data, checksum) {
    return this._generateChecksum(data) === checksum;
  }

  _encodeResult(result) {
    return Buffer.from(JSON.stringify(result)).toString('base64');
  }

  _decodeResult(serialized) {
    try {
      return JSON.parse(Buffer.from(serialized, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
}

/**
 * Schema Registry
 */
class SchemaRegistry {
  constructor() {
    this.schemas = new Map();
  }

  register(name, schema) {
    this.schemas.set(name, {
      name,
      schema,
      created: Date.now(),
      version: schema.version || '1.0.0'
    });
  }

  get(name) {
    return this.schemas.get(name);
  }

  list() {
    return Array.from(this.schemas.values());
  }

  validate(name, data) {
    const registered = this.schemas.get(name);
    if (!registered) {
      return { valid: false, errors: [`Schema '${name}' not found`] };
    }
    const validator = new SchemaValidator(registered.schema);
    return validator.validate(data);
  }

  remove(name) {
    return this.schemas.delete(name);
  }
}

/**
 * Version Manager
 */
class VersionManager {
  constructor() {
    this.versions = new Map();
  }

  registerVersion(version, serializer) {
    this.versions.set(version, serializer);
  }

  getSerializer(version) {
    return this.versions.get(version) || this.versions.get('1.0.0');
  }

  migrate(data, fromVersion, toVersion) {
    const migrators = this._getMigrators(fromVersion, toVersion);
    let result = data;

    for (const migrator of migrators) {
      result = migrator(result);
    }

    return result;
  }

  _getMigrators(fromVersion, toVersion) {
    const migrators = [];
    const from = this._parseVersion(fromVersion);
    const to = this._parseVersion(toVersion);

    if (from.major !== to.major) {
      migrators.push(data => this._migrateMajor(data, from.major, to.major));
    }
    if (from.minor !== to.minor) {
      migrators.push(data => this._migrateMinor(data, from.minor, to.minor));
    }

    return migrators;
  }

  _parseVersion(version) {
    const [major, minor, patch] = version.split('.').map(Number);
    return { major: major || 1, minor: minor || 0, patch: patch || 0 };
  }

  _migrateMajor(data, from, to) {
    console.log(`   Migrating major version ${from} -> ${to}`);
    return data;
  }

  _migrateMinor(data, from, to) {
    console.log(`   Migrating minor version ${from} -> ${to}`);
    return data;
  }
}

/**
 * Buffer Pool for Binary Serialization
 */
class BufferPool {
  constructor(options = {}) {
    this.options = {
      maxSize: options.maxSize || 1024 * 1024,
      poolSize: options.poolSize || 10,
      ...options
    };
    this.pool = [];
    this.allocated = 0;
  }

  acquire(size) {
    const buffer = Buffer.alloc(size);
    this.allocated += size;
    return buffer;
  }

  release(buffer) {
    this.allocated -= buffer.length;
  }

  getStats() {
    return {
      poolSize: this.pool.length,
      allocated: this.allocated,
      maxSize: this.options.maxSize
    };
  }
}

/**
 * Agent Serialization Manager
 */
class AgentSerializationManager {
  constructor() {
    this.registry = new SchemaRegistry();
    this.versionManager = new VersionManager();
    this.bufferPool = new BufferPool();
    this.stats = {
      serialized: 0,
      deserialized: 0,
      validated: 0,
      errors: 0
    };

    // Register default serializers
    this.versionManager.registerVersion('1.0.0', new DataSerializer({ type: SerialType.JSON }));
    this.versionManager.registerVersion('2.0.0', new DataSerializer({ type: SerialType.JSON, compression: CompressionType.GZIP }));
  }

  serialize(data, options = {}) {
    const serializer = new DataSerializer(options);
    const result = serializer.serialize(data);
    this.stats.serialized++;
    return result;
  }

  deserialize(serialized, options = {}) {
    try {
      const serializer = new DataSerializer(options);
      const result = serializer.deserialize(serialized);
      this.stats.deserialized++;
      return result;
    } catch (error) {
      this.stats.errors++;
      throw error;
    }
  }

  registerSchema(name, schema) {
    this.registry.register(name, schema);
  }

  validateSchema(name, data) {
    this.stats.validated++;
    return this.registry.validate(name, data);
  }

  migrate(data, fromVersion, toVersion) {
    return this.versionManager.migrate(data, fromVersion, toVersion);
  }

  getStats() {
    return {
      ...this.stats,
      ...this.bufferPool.getStats()
    };
  }

  listSchemas() {
    return this.registry.list();
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Serialization Demo\n');

  const manager = new AgentSerializationManager();

  // Basic serialization
  console.log('1. Basic Serialization:');
  const data = {
    id: 'agent-001',
    name: 'Test Agent',
    status: 'active',
    config: {
      timeout: 30000,
      retries: 3
    },
    tags: ['test', 'demo']
  };

  const serialized = manager.serialize(data);
  console.log(`   Original: ${JSON.stringify(data).substring(0, 50)}...`);
  console.log(`   Serialized: ${serialized.substring(0, 50)}...`);

  const deserialized = manager.deserialize(serialized);
  console.log(`   Deserialized: ${JSON.stringify(deserialized).substring(0, 50)}...`);
  console.log(`   Match: ${JSON.stringify(data) === JSON.stringify(deserialized)}`);

  // Compression
  console.log('\n2. Compression:');
  const largeData = {
    items: Array(100).fill(null).map((_, i) => ({
      id: i,
      name: `item-${i}`,
      data: 'x'.repeat(100)
    }))
  };

  const noCompression = manager.serialize(largeData, { compression: 'none' });
  const gzipCompression = manager.serialize(largeData, { compression: 'gzip' });
  console.log(`   No compression: ${noCompression.length} bytes`);
  console.log(`   GZIP compression: ${gzipCompression.length} bytes`);
  console.log(`   Compression ratio: ${(1 - gzipCompression.length / noCompression.length * 100).toFixed(1)}%`);

  // Schema validation
  console.log('\n3. Schema Validation:');
  const userSchema = {
    id: { type: 'string', required: true },
    name: { type: 'string', required: true },
    age: { type: 'number', required: false },
    email: { type: 'string', required: false }
  };

  manager.registerSchema('user', userSchema);

  const validUser = { id: 'u1', name: 'John', age: 30 };
  const result1 = manager.validateSchema('user', validUser);
  console.log(`   Valid user: ${result1.valid}`);

  const invalidUser = { id: 'u2', age: 'thirty' };
  const result2 = manager.validateSchema('user', invalidUser);
  console.log(`   Invalid user: ${!result2.valid}`);
  if (!result2.valid) {
    console.log(`   Errors: ${result2.errors.join(', ')}`);
  }

  // Version migration
  console.log('\n4. Version Migration:');
  const oldData = { name: 'test', value: 123 };
  console.log(`   Original: ${JSON.stringify(oldData)}`);

  const migrated = manager.migrate(oldData, '1.0.0', '2.0.0');
  console.log(`   Migrated: ${JSON.stringify(migrated)}`);

  // Stats
  console.log('\n5. Statistics:');
  const stats = manager.getStats();
  console.log(`   Serialized: ${stats.serialized}`);
  console.log(`   Deserialized: ${stats.deserialized}`);
  console.log(`   Validated: ${stats.validated}`);
  console.log(`   Errors: ${stats.errors}`);

  // List schemas
  console.log('\n6. Registered Schemas:');
  const schemas = manager.listSchemas();
  console.log(`   Schemas: ${schemas.length}`);
  for (const schema of schemas) {
    console.log(`   - ${schema.name}: ${schema.version}`);
  }

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'serialize') {
  const manager = new AgentSerializationManager();
  const data = JSON.parse(args[1] || '{}');
  console.log(manager.serialize(data));
} else if (cmd === 'deserialize') {
  const manager = new AgentSerializationManager();
  const result = manager.deserialize(args[1]);
  console.log(JSON.stringify(result, null, 2));
} else if (cmd === 'status') {
  const manager = new AgentSerializationManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Serialization Module');
  console.log('Usage: node agent-serialization.js [command]');
  console.log('Commands:');
  console.log('  demo                  Run demo');
  console.log('  serialize <json>     Serialize data');
  console.log('  deserialize <data>   Deserialize data');
  console.log('  status               Show stats');
}
