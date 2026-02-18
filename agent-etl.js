/**
 * Agent ETL - Extract Transform Load Agent
 *
 * Manages ETL pipelines: data extraction, transformation, and loading.
 *
 * Usage: node agent-etl.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   extract    - Show extraction methods
 *   transform  - Show transformations
 */

class DataExtractor {
  constructor() {
    this.sources = [];
  }

  extractFromAPI(endpoint, params = {}) {
    const count = Math.floor(Math.random() * 100) + 10;
    const records = Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      name: `user_${i}`,
      email: `user${i}@example.com`,
      active: true
    }));
    const record = {
      source: 'api',
      endpoint,
      params,
      records,
      timestamp: new Date().toISOString()
    };
    this.sources.push(record);
    return record;
  }

  extractFromDB(query) {
    const count = Math.floor(Math.random() * 50) + 10;
    const records = Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      order_id: `ORD-${i}`,
      amount: Math.floor(Math.random() * 1000),
      status: 'completed'
    }));
    const record = {
      source: 'database',
      query: query.substring(0, 50),
      records,
      timestamp: new Date().toISOString()
    };
    this.sources.push(record);
    return record;
  }

  extractFromFile(path, format = 'csv') {
    const count = Math.floor(Math.random() * 100) + 10;
    const records = Array.from({ length: count }, (_, i) => ({
      product_id: `P${i}`,
      name: `Product ${i}`,
      price: (Math.random() * 100).toFixed(2),
      category: ['electronics', 'books', 'clothing'][i % 3]
    }));
    const record = {
      source: 'file',
      path,
      format,
      records,
      timestamp: new Date().toISOString()
    };
    this.sources.push(record);
    return record;
  }

  extractFromStream(topic) {
    const count = Math.floor(Math.random() * 20) + 5;
    const records = Array.from({ length: count }, (_, i) => ({
      event_id: `EVT-${i}`,
      type: ['click', 'view', 'purchase'][i % 3],
      user_id: `user_${i % 10}`,
      timestamp: Date.now()
    }));
    const record = {
      source: 'stream',
      topic,
      records,
      timestamp: new Date().toISOString()
    };
    this.sources.push(record);
    return record;
  }
}

class DataTransformer {
  constructor() {
    this.transforms = [];
  }

  clean(data) {
    const cleaned = data.map(record => {
      const cleaned = { ...record };
      for (const key in cleaned) {
        if (typeof cleaned[key] === 'string') {
          cleaned[key] = cleaned[key].trim();
        }
        if (cleaned[key] === null || cleaned[key] === undefined) {
          delete cleaned[key];
        }
      }
      return cleaned;
    });
    this.transforms.push({ type: 'clean', records: cleaned.length });
    return cleaned;
  }

  map(data, mapping) {
    const mapped = data.map(record => {
      const newRecord = {};
      for (const [oldKey, newKey] of Object.entries(mapping)) {
        if (record[oldKey] !== undefined) {
          newRecord[newKey] = record[oldKey];
        }
      }
      return newRecord;
    });
    this.transforms.push({ type: 'map', records: mapped.length });
    return mapped;
  }

  filter(data, predicate) {
    const filtered = data.filter(predicate);
    this.transforms.push({ type: 'filter', original: data.length, result: filtered.length });
    return filtered;
  }

  aggregate(data, groupBy, aggregations) {
    const groups = new Map();

    data.forEach(record => {
      const key = groupBy(record);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key).push(record);
    });

    const result = Array.from(groups.entries()).map(([key, records]) => {
      const aggregated = { [groupBy.name || 'group']: key };
      for (const [aggName, aggFunc] of Object.entries(aggregations)) {
        aggregated[aggName] = aggFunc(records);
      }
      return aggregated;
    });

    this.transforms.push({ type: 'aggregate', groups: result.length });
    return result;
  }

  enrich(data, enrichFn) {
    const enriched = data.map(record => ({
      ...record,
      ...enrichFn(record)
    }));
    this.transforms.push({ type: 'enrich', records: enriched.length });
    return enriched;
  }

  validate(data, schema) {
    const valid = [];
    const invalid = [];

    data.forEach(record => {
      let isValid = true;
      for (const [field, rules] of Object.entries(schema)) {
        if (rules.required && !record[field]) isValid = false;
        if (rules.type && typeof record[field] !== rules.type) isValid = false;
      }
      if (isValid) valid.push(record);
      else invalid.push(record);
    });

    this.transforms.push({ type: 'validate', valid: valid.length, invalid: invalid.length });
    return { valid, invalid };
  }
}

class DataLoader {
  constructor() {
    this.targets = [];
  }

  loadToDB(data, table) {
    const record = {
      target: 'database',
      table,
      records: data.length,
      timestamp: new Date().toISOString()
    };
    this.targets.push(record);
    return record;
  }

  loadToAPI(data, endpoint) {
    const record = {
      target: 'api',
      endpoint,
      records: data.length,
      timestamp: new Date().toISOString()
    };
    this.targets.push(record);
    return record;
  }

  loadToFile(data, path, format = 'json') {
    const record = {
      target: 'file',
      path,
      format,
      records: data.length,
      timestamp: new Date().toISOString()
    };
    this.targets.push(record);
    return record;
  }

  loadToStream(data, topic) {
    const record = {
      target: 'stream',
      topic,
      records: data.length,
      timestamp: new Date().toISOString()
    };
    this.targets.push(record);
    return record;
  }
}

class ETLAgent {
  constructor() {
    this.extractor = new DataExtractor();
    this.transformer = new DataTransformer();
    this.loader = new DataLoader();
    this.stats = { pipelines: 0, records: 0 };
  }

  runPipeline(config) {
    this.stats.pipelines++;

    let data;

    // Extract
    switch (config.source.type) {
      case 'api':
        data = this.extractor.extractFromAPI(config.source.endpoint, config.source.params);
        break;
      case 'database':
        data = this.extractor.extractFromDB(config.source.query);
        break;
      case 'file':
        data = this.extractor.extractFromFile(config.source.path, config.source.format);
        break;
      case 'stream':
        data = this.extractor.extractFromStream(config.source.topic);
        break;
      default:
        data = { records: [] };
    }

    // Transform
    let transformed = data.records || [];
    if (config.transform) {
      if (config.transform.clean) transformed = this.transformer.clean(transformed);
      if (config.transform.map) transformed = this.transformer.map(transformed, config.transform.map);
      if (config.transform.filter) transformed = this.transformer.filter(transformed, config.transform.filter);
    }

    // Load
    let loaded;
    switch (config.target.type) {
      case 'database':
        loaded = this.loader.loadToDB(transformed, config.target.table);
        break;
      case 'api':
        loaded = this.loader.loadToAPI(transformed, config.target.endpoint);
        break;
      case 'file':
        loaded = this.loader.loadToFile(transformed, config.target.path, config.target.format);
        break;
      case 'stream':
        loaded = this.loader.loadToStream(transformed, config.target.topic);
        break;
    }

    this.stats.records += transformed.length;

    return {
      extracted: data.records || 0,
      transformed: transformed.length,
      loaded: loaded.records,
      status: 'completed'
    };
  }

  getStats() {
    return {
      ...this.stats,
      extractors: this.extractor.sources.length,
      transformations: this.transformer.transforms.length,
      loaders: this.loader.targets.length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const etl = new ETLAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent ETL Demo\n');

    // 1. Simple pipeline
    console.log('1. Running ETL Pipeline:');
    const result = etl.runPipeline({
      source: { type: 'api', endpoint: '/api/users', params: { limit: 100 } },
      transform: { clean: true, map: { user_id: 'id', user_name: 'name' } },
      target: { type: 'database', table: 'users_staging' }
    });
    console.log(`   Extracted: ${result.extracted} records`);
    console.log(`   Transformed: ${result.transformed} records`);
    console.log(`   Loaded: ${result.loaded} records`);
    console.log(`   Status: ${result.status}`);

    // 2. Database to file
    console.log('\n2. Database to File:');
    const dbResult = etl.runPipeline({
      source: { type: 'database', query: 'SELECT * FROM orders' },
      transform: { clean: true },
      target: { type: 'file', path: '/data/orders.json', format: 'json' }
    });
    console.log(`   Extracted: ${dbResult.extracted}`);
    console.log(`   Loaded: ${dbResult.loaded}`);

    // 3. Stream processing
    console.log('\n3. Stream Processing:');
    const streamResult = etl.runPipeline({
      source: { type: 'stream', topic: 'user_events' },
      transform: { filter: r => r.active },
      target: { type: 'stream', topic: 'active_users' }
    });
    console.log(`   Extracted: ${streamResult.extracted}`);
    console.log(`   Transformed: ${streamResult.transformed}`);

    // 4. Statistics
    console.log('\n4. Statistics:');
    const stats = etl.getStats();
    console.log(`   Pipelines Run: ${stats.pipelines}`);
    console.log(`   Total Records Processed: ${stats.records}`);
    console.log(`   Extract Operations: ${stats.extractors}`);
    console.log(`   Transform Operations: ${stats.transformations}`);
    console.log(`   Load Operations: ${stats.loaders}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'extract':
    console.log('Extraction Methods:');
    console.log('  - API: extractFromAPI(endpoint, params)');
    console.log('  - Database: extractFromDB(query)');
    console.log('  - File: extractFromFile(path, format)');
    console.log('  - Stream: extractFromStream(topic)');
    break;

  case 'transform':
    console.log('Transformations:');
    console.log('  - clean: Remove nulls, trim strings');
    console.log('  - map: Rename fields');
    console.log('  - filter: Filter records');
    console.log('  - aggregate: Group and aggregate');
    console.log('  - enrich: Add computed fields');
    console.log('  - validate: Validate against schema');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-etl.js [demo|extract|transform]');
}
