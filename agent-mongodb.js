/**
 * Agent MongoDB - MongoDB Database Agent
 *
 * Manages MongoDB-like document operations, aggregations, and collections.
 *
 * Usage: node agent-mongodb.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   collections - List collections
 *   aggregate  - Run aggregation
 */

class MongoCollection {
  constructor(name) {
    this.name = name;
    this.documents = new Map();
    this.indexes = [
      { name: '_id_', key: { _id: 1 }, unique: true }
    ];
  }

  insert(document) {
    const id = document._id || crypto.randomUUID();
    const doc = {
      ...document,
      _id: id,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.documents.set(id, doc);
    return { acknowledged: true, insertedId: id };
  }

  insertMany(documents) {
    const insertedIds = [];
    documents.forEach(doc => {
      const result = this.insert(doc);
      insertedIds.push(result.insertedId);
    });
    return { acknowledged: true, insertedCount: documents.length, insertedIds };
  }

  find(query = {}) {
    const results = [];
    for (const doc of this.documents.values()) {
      if (this._matchesQuery(doc, query)) {
        results.push(doc);
      }
    }
    return results;
  }

  findOne(query = {}) {
    for (const doc of this.documents.values()) {
      if (this._matchesQuery(doc, query)) {
        return doc;
      }
    }
    return null;
  }

  findById(id) {
    return this.documents.get(id) || null;
  }

  _matchesQuery(doc, query) {
    for (const [key, value] of Object.entries(query)) {
      if (key === '_id' && doc._id !== value) return false;
      if (doc[key] !== value) return false;
    }
    return true;
  }

  updateOne(query, update, options = {}) {
    const doc = this.findOne(query);
    if (!doc) {
      return { acknowledged: false, matchedCount: 0 };
    }

    const updated = { ...doc, updatedAt: new Date() };
    if (update.$set) {
      Object.assign(updated, update.$set);
    }
    if (update.$inc && update.$inc instanceof Object) {
      for (const [key, value] of Object.entries(update.$inc)) {
        updated[key] = (updated[key] || 0) + value;
      }
    }
    if (update.$unset) {
      for (const key of Object.keys(update.$unset)) {
        delete updated[key];
      }
    }

    this.documents.set(doc._id, updated);
    return {
      acknowledged: true,
      matchedCount: 1,
      modifiedCount: 1,
      upsertedId: null
    };
  }

  updateMany(query, update) {
    const docs = this.find(query);
    let modifiedCount = 0;

    docs.forEach(doc => {
      const result = this.updateOne({ _id: doc._id }, update);
      if (result.modifiedCount) modifiedCount++;
    });

    return {
      acknowledged: true,
      matchedCount: docs.length,
      modifiedCount
    };
  }

  deleteOne(query) {
    const doc = this.findOne(query);
    if (!doc) {
      return { acknowledged: false, deletedCount: 0 };
    }
    this.documents.delete(doc._id);
    return { acknowledged: true, deletedCount: 1 };
  }

  deleteMany(query) {
    const docs = this.find(query);
    docs.forEach(doc => this.documents.delete(doc._id));
    return { acknowledged: true, deletedCount: docs.length };
  }

  countDocuments(query = {}) {
    return this.find(query).length;
  }

  createIndex(keys, options = {}) {
    const indexName = Object.keys(keys).map(k => `${k}_${keys[k]}`).join('_');
    this.indexes.push({ name: indexName, key: keys, ...options });
    return indexName;
  }

  getIndexes() {
    return this.indexes;
  }

  aggregate(pipeline) {
    let results = Array.from(this.documents.values());

    for (const stage of pipeline) {
      if (stage.$match) {
        results = results.filter(doc => this._matchesQuery(doc, stage.$match));
      }
      if (stage.$group) {
        results = this._group(results, stage.$group);
      }
      if (stage.$sort) {
        const sortKey = Object.keys(stage.$sort)[0];
        const sortOrder = stage.$sort[sortKey];
        results.sort((a, b) => {
          if (sortOrder === 1) return a[sortKey] > b[sortKey] ? 1 : -1;
          return a[sortKey] < b[sortKey] ? 1 : -1;
        });
      }
      if (stage.$limit) {
        results = results.slice(0, stage.$limit);
      }
      if (stage.$project) {
        results = results.map(doc => {
          const projected = {};
          for (const [key, value] of Object.entries(stage.$project)) {
            if (value === 1) projected[key] = doc[key];
          }
          return projected;
        });
      }
    }

    return results;
  }

  _group(documents, groupConfig) {
    const groups = new Map();
    const _id = groupConfig._id;

    documents.forEach(doc => {
      let key;
      if (typeof _id === 'function') {
        key = _id(doc);
      } else if (typeof _id === 'string') {
        key = doc[_id];
      } else {
        key = 'null';
      }

      if (!groups.has(key)) {
        groups.set(key, { _id: key, count: 0 });
      }

      const group = groups.get(key);
      group.count++;

      for (const [aggKey, aggValue] of Object.entries(groupConfig)) {
        if (aggKey.startsWith('total_')) {
          const field = aggKey.replace('total_', '');
          group[aggKey] = (group[aggKey] || 0) + (doc[field] || 0);
        }
        if (aggKey.startsWith('avg_')) {
          const field = aggKey.replace('avg_', '');
          if (!group.sum) group.sum = {};
          group.sum[field] = (group.sum[field] || 0) + (doc[field] || 0);
        }
      }
    });

    return Array.from(groups.values()).map(g => {
      if (g.sum) {
        for (const [k, v] of Object.entries(g.sum)) {
          g[`avg_${k}`] = v / g.count;
        }
        delete g.sum;
      }
      return g;
    });
  }

  distinct(field, query = {}) {
    const docs = this.find(query);
    const values = new Set();
    docs.forEach(doc => {
      if (doc[field] !== undefined) {
        values.add(doc[field]);
      }
    });
    return Array.from(values);
  }

  count() {
    return this.documents.size;
  }
}

class MongoDBAgent {
  constructor() {
    this.collections = new Map();
    this.stats = { operations: 0, documents: 0 };
    this._initSampleData();
  }

  _initSampleData() {
    const users = new MongoCollection('users');
    users.insert({ name: 'Alice', email: 'alice@example.com', age: 30, role: 'admin', active: true });
    users.insert({ name: 'Bob', email: 'bob@example.com', age: 25, role: 'user', active: true });
    users.insert({ name: 'Charlie', email: 'charlie@example.com', age: 35, role: 'user', active: false });
    users.insert({ name: 'Diana', email: 'diana@example.com', age: 28, role: 'user', active: true });
    this.collections.set('users', users);

    const products = new MongoCollection('products');
    products.insert({ name: 'Laptop', price: 999, category: 'electronics', stock: 50 });
    products.insert({ name: 'Mouse', price: 29, category: 'electronics', stock: 200 });
    products.insert({ name: 'Book', price: 19, category: 'books', stock: 100 });
    products.insert({ name: 'Keyboard', price: 79, category: 'electronics', stock: 75 });
    this.collections.set('products', products);

    const orders = new MongoCollection('orders');
    orders.insert({ userId: 'u1', productId: 'p1', quantity: 1, total: 999, status: 'completed' });
    orders.insert({ userId: 'u2', productId: 'p2', quantity: 2, total: 58, status: 'pending' });
    orders.insert({ userId: 'u1', productId: 'p3', quantity: 3, total: 57, status: 'completed' });
    this.collections.set('orders', orders);
  }

  getCollection(name) {
    return this.collections.get(name);
  }

  listCollections() {
    return Array.from(this.collections.keys());
  }

  createCollection(name) {
    const collection = new MongoCollection(name);
    this.collections.set(name, collection);
    return { acknowledged: true, name };
  }

  dropCollection(name) {
    const deleted = this.collections.delete(name);
    return { acknowledged: true, dropped: deleted ? name : null };
  }

  insertOne(collectionName, document) {
    this.stats.operations++;
    const collection = this.collections.get(collectionName);
    if (!collection) return { acknowledged: false, error: 'Collection not found' };
    const result = collection.insert(document);
    this.stats.documents++;
    return result;
  }

  insertMany(collectionName, documents) {
    this.stats.operations++;
    const collection = this.collections.get(collectionName);
    if (!collection) return { acknowledged: false, error: 'Collection not found' };
    const result = collection.insertMany(documents);
    this.stats.documents += documents.length;
    return result;
  }

  find(collectionName, query = {}) {
    this.stats.operations++;
    const collection = this.collections.get(collectionName);
    if (!collection) return [];
    return collection.find(query);
  }

  findOne(collectionName, query) {
    this.stats.operations++;
    const collection = this.collections.get(collectionName);
    if (!collection) return null;
    return collection.findOne(query);
  }

  updateOne(collectionName, query, update, options) {
    this.stats.operations++;
    const collection = this.collections.get(collectionName);
    if (!collection) return { acknowledged: false };
    return collection.updateOne(query, update, options);
  }

  updateMany(collectionName, query, update) {
    this.stats.operations++;
    const collection = this.collections.get(collectionName);
    if (!collection) return { acknowledged: false };
    return collection.updateMany(query, update);
  }

  deleteOne(collectionName, query) {
    this.stats.operations++;
    const collection = this.collections.get(collectionName);
    if (!collection) return { acknowledged: false };
    const result = collection.deleteOne(query);
    if (result.deletedCount) this.stats.documents--;
    return result;
  }

  deleteMany(collectionName, query) {
    this.stats.operations++;
    const collection = this.collections.get(collectionName);
    if (!collection) return { acknowledged: false };
    const result = collection.deleteMany(query);
    this.stats.documents -= result.deletedCount;
    return result;
  }

  countDocuments(collectionName, query = {}) {
    const collection = this.collections.get(collectionName);
    if (!collection) return 0;
    return collection.countDocuments(query);
  }

  aggregate(collectionName, pipeline) {
    this.stats.operations++;
    const collection = this.collections.get(collectionName);
    if (!collection) return [];
    return collection.aggregate(pipeline);
  }

  distinct(collectionName, field, query = {}) {
    const collection = this.collections.get(collectionName);
    if (!collection) return [];
    return collection.distinct(field, query);
  }

  getStats() {
    return {
      ...this.stats,
      collections: this.collections.size,
      indexes: Array.from(this.collections.values()).reduce((sum, c) => sum + c.getIndexes().length, 0)
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const mongo = new MongoDBAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent MongoDB Demo\n');

    // 1. List collections
    console.log('1. Collections:');
    const collections = mongo.listCollections();
    collections.forEach(c => {
      const col = mongo.getCollection(c);
      console.log(`   - ${c}: ${col.count()} documents`);
    });

    // 2. Insert
    console.log('\n2. Insert:');
    const insertOne = mongo.insertOne('users', { name: 'Eve', email: 'eve@example.com', age: 32 });
    console.log(`   InsertOne: ${insertOne.acknowledged ? 'OK' : 'Failed'}, ID: ${insertOne.insertedId?.substring(0, 8)}`);

    // 3. Find
    console.log('\n3. Find:');
    const users = mongo.find('users', { active: true });
    console.log(`   Active users: ${users.length}`);
    users.forEach(u => console.log(`   - ${u.name} (${u.role})`));

    // 4. FindOne
    console.log('\n4. FindOne:');
    const alice = mongo.findOne('users', { name: 'Alice' });
    console.log(`   Found: ${alice?.name}, Email: ${alice?.email}`);

    // 5. Update
    console.log('\n5. Update:');
    const updateResult = mongo.updateOne('users', { name: 'Bob' }, { $set: { role: 'admin' } });
    console.log(`   UpdateOne: ${updateResult.modifiedCount} modified`);
    const bob = mongo.findOne('users', { name: 'Bob' });
    console.log(`   Bob's new role: ${bob?.role}`);

    // 6. Delete
    console.log('\n6. Delete:');
    const deleteResult = mongo.deleteOne('users', { name: 'Charlie' });
    console.log(`   DeleteOne: ${deleteResult.deletedCount} deleted`);

    // 7. Aggregation
    console.log('\n7. Aggregation:');
    const pipeline = [
      { $match: { active: true } },
      { $group: { _id: '$role', count: { $sum: 1 }, avgAge: { $avg: '$age' } } },
      { $sort: { count: -1 } }
    ];
    const grouped = mongo.aggregate('users', pipeline);
    console.log(`   Grouped by role:`);
    grouped.forEach(g => console.log(`   - ${g._id}: ${g.count} users, avg age: ${g.avgAge?.toFixed(1)}`));

    // 8. Distinct
    console.log('\n8. Distinct:');
    const roles = mongo.distinct('users', 'role');
    console.log(`   Roles: ${roles.join(', ')}`);

    // 9. Statistics
    console.log('\n9. Statistics:');
    const stats = mongo.getStats();
    console.log(`   Operations: ${stats.operations}`);
    console.log(`   Documents: ${stats.documents}`);
    console.log(`   Collections: ${stats.collections}`);
    console.log(`   Indexes: ${stats.indexes}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'collections':
    console.log('Collections:');
    mongo.listCollections().forEach(c => {
      console.log(`  - ${c}: ${mongo.getCollection(c).count()} docs`);
    });
    break;

  case 'aggregate':
    console.log('Aggregation Examples:');
    console.log('\n1. Count by category:');
    const byCategory = mongo.aggregate('products', [
      { $group: { _id: '$category', count: { $sum: 1 }, totalStock: { $sum: '$stock' } } }
    ]);
    byCategory.forEach(c => console.log(`  ${c._id}: ${c.count} products, ${c.totalStock} stock`));

    console.log('\n2. Order status:');
    const byStatus = mongo.aggregate('orders', [
      { $group: { _id: '$status', total: { $sum: '$total' }, count: { $sum: 1 } } }
    ]);
    byStatus.forEach(s => console.log(`  ${s._id}: ${s.count} orders, $${s.total}`));
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-mongodb.js [demo|collections|aggregate]');
}
