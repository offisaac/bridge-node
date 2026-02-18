/**
 * Agent NoSQL - NoSQL Database Agent
 *
 * Manages NoSQL database operations, document stores, and key-value stores.
 *
 * Usage: node agent-nosql.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   collections - List collections
 *   operations - Show operations
 */

class DocumentStore {
  constructor(name) {
    this.name = name;
    this.documents = new Map();
    this.indexes = new Map();
  }

  insert(id, document) {
    this.documents.set(id, {
      ...document,
      _id: id,
      _created: new Date().toISOString(),
      _updated: new Date().toISOString()
    });
    return { success: true, id };
  }

  find(id) {
    return this.documents.get(id) || null;
  }

  findAll(query = {}) {
    const results = [];
    for (const doc of this.documents.values()) {
      let match = true;
      for (const [key, value] of Object.entries(query)) {
        if (doc[key] !== value) {
          match = false;
          break;
        }
      }
      if (match) results.push(doc);
    }
    return results;
  }

  update(id, document) {
    if (!this.documents.has(id)) {
      return { success: false, error: 'Document not found' };
    }
    const existing = this.documents.get(id);
    this.documents.set(id, {
      ...existing,
      ...document,
      _id: id,
      _updated: new Date().toISOString()
    });
    return { success: true, id };
  }

  delete(id) {
    if (!this.documents.has(id)) {
      return { success: false, error: 'Document not found' };
    }
    this.documents.delete(id);
    return { success: true };
  }

  count() {
    return this.documents.size;
  }

  createIndex(field, unique = false) {
    this.indexes.set(field, { unique });
    return { success: true, field, unique };
  }
}

class KeyValueStore {
  constructor(name) {
    this.name = name;
    this.store = new Map();
    this.ttls = new Map();
  }

  set(key, value, ttl = null) {
    this.store.set(key, value);
    if (ttl) {
      this.ttls.set(key, Date.now() + ttl * 1000);
    }
    return { success: true, key };
  }

  get(key) {
    const ttl = this.ttls.get(key);
    if (ttl && Date.now() > ttl) {
      this.store.delete(key);
      this.ttls.delete(key);
      return null;
    }
    return this.store.get(key) || null;
  }

  delete(key) {
    this.store.delete(key);
    this.ttls.delete(key);
    return { success: true };
  }

  exists(key) {
    return this.store.has(key);
  }

  expire(key, ttl) {
    if (this.store.has(key)) {
      this.ttls.set(key, Date.now() + ttl * 1000);
      return { success: true };
    }
    return { success: false, error: 'Key not found' };
  }

  keys(pattern = '*') {
    return Array.from(this.store.keys());
  }
}

class NoSQLAgent {
  constructor() {
    this.collections = new Map();
    this.keyValueStores = new Map();
    this.stats = { operations: 0, documents: 0 };

    // Initialize sample data
    this._initSampleData();
  }

  _initSampleData() {
    const users = new DocumentStore('users');
    users.insert('u1', { name: 'Alice', role: 'admin', active: true });
    users.insert('u2', { name: 'Bob', role: 'user', active: true });
    users.insert('u3', { name: 'Charlie', role: 'user', active: false });
    this.collections.set('users', users);

    const products = new DocumentStore('products');
    products.insert('p1', { name: 'Laptop', price: 999, category: 'electronics' });
    products.insert('p2', { name: 'Mouse', price: 29, category: 'electronics' });
    products.insert('p3', { name: 'Book', price: 19, category: 'books' });
    this.collections.set('products', products);

    const cache = new KeyValueStore('cache');
    cache.set('session:123', { user: 'alice', expires: 3600 });
    cache.set('config:theme', 'dark');
    this.keyValueStores.set('cache', cache);
  }

  getCollections() {
    return Array.from(this.collections.keys());
  }

  getCollection(name) {
    return this.collections.get(name) || null;
  }

  createCollection(name) {
    const collection = new DocumentStore(name);
    this.collections.set(name, collection);
    return { success: true, name };
  }

  insertDocument(collectionName, id, document) {
    this.stats.operations++;
    this.stats.documents++;
    const collection = this.collections.get(collectionName);
    if (!collection) {
      return { success: false, error: 'Collection not found' };
    }
    return collection.insert(id, document);
  }

  findDocument(collectionName, id) {
    this.stats.operations++;
    const collection = this.collections.get(collectionName);
    if (!collection) return null;
    return collection.find(id);
  }

  queryDocuments(collectionName, query) {
    this.stats.operations++;
    const collection = this.collections.get(collectionName);
    if (!collection) return [];
    return collection.findAll(query);
  }

  updateDocument(collectionName, id, document) {
    this.stats.operations++;
    const collection = this.collections.get(collectionName);
    if (!collection) {
      return { success: false, error: 'Collection not found' };
    }
    return collection.update(id, document);
  }

  deleteDocument(collectionName, id) {
    this.stats.operations++;
    this.stats.documents--;
    const collection = this.collections.get(collectionName);
    if (!collection) {
      return { success: false, error: 'Collection not found' };
    }
    return collection.delete(id);
  }

  // Key-Value operations
  kvSet(storeName, key, value, ttl) {
    this.stats.operations++;
    let store = this.keyValueStores.get(storeName);
    if (!store) {
      store = new KeyValueStore(storeName);
      this.keyValueStores.set(storeName, store);
    }
    return store.set(key, value, ttl);
  }

  kvGet(storeName, key) {
    this.stats.operations++;
    const store = this.keyValueStores.get(storeName);
    if (!store) return null;
    return store.get(key);
  }

  kvDelete(storeName, key) {
    this.stats.operations++;
    const store = this.keyValueStores.get(storeName);
    if (!store) return { success: false };
    return store.delete(key);
  }

  getStats() {
    return {
      ...this.stats,
      collections: this.collections.size,
      kvStores: this.keyValueStores.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const nosql = new NoSQLAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent NoSQL Demo\n');

    // 1. List collections
    console.log('1. Collections:');
    const collections = nosql.getCollections();
    collections.forEach(c => {
      const col = nosql.getCollection(c);
      console.log(`   - ${c}: ${col.count()} documents`);
    });

    // 2. Insert document
    console.log('\n2. Insert Document:');
    const insert = nosql.insertDocument('users', 'u4', { name: 'Diana', role: 'user', active: true });
    console.log(`   Inserted: ${insert.success}, ID: ${insert.id}`);

    // 3. Find document
    console.log('\n3. Find Document:');
    const user = nosql.findDocument('users', 'u1');
    console.log(`   Found: ${user?.name}, Role: ${user?.role}`);

    // 4. Query documents
    console.log('\n4. Query Documents:');
    const activeUsers = nosql.queryDocuments('users', { active: true });
    console.log(`   Active users: ${activeUsers.length}`);
    activeUsers.forEach(u => console.log(`   - ${u.name}`));

    // 5. Update document
    console.log('\n5. Update Document:');
    const update = nosql.updateDocument('users', 'u2', { role: 'admin' });
    console.log(`   Updated: ${update.success}`);
    const updated = nosql.findDocument('users', 'u2');
    console.log(`   New role: ${updated?.role}`);

    // 6. Key-Value operations
    console.log('\n6. Key-Value Store:');
    nosql.kvSet('session', 'sess:456', { user: 'bob', data: 'test' }, 300);
    const session = nosql.kvGet('session', 'sess:456');
    console.log(`   Set/Get: ${session ? 'OK' : 'Failed'}`);
    console.log(`   User: ${session?.user}`);

    // 7. Statistics
    console.log('\n7. Statistics:');
    const stats = nosql.getStats();
    console.log(`   Operations: ${stats.operations}`);
    console.log(`   Documents: ${stats.documents}`);
    console.log(`   Collections: ${stats.collections}`);
    console.log(`   KV Stores: ${stats.kvStores}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'collections':
    console.log('Collections:');
    nosql.getCollections().forEach(c => {
      console.log(`  - ${c}: ${nosql.getCollection(c).count()} docs`);
    });
    break;

  case 'operations':
    console.log('NoSQL Operations:');
    console.log('  Document: insert, find, query, update, delete');
    console.log('  Key-Value: set, get, delete, exists, expire');
    console.log('  Collections: create, list, drop');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-nosql.js [demo|collections|operations]');
}
