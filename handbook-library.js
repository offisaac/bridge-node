/**
 * Handbook Library - 手册库模块
 * 集中式手册库，支持搜索和分类
 */

const fs = require('fs');
const path = require('path');

// ========== Data Models ==========

class Handbook {
  constructor(data) {
    this.id = data.id || `handbook_${Date.now()}`;
    this.title = data.title;
    this.content = data.content;
    this.category = data.category || 'general';
    this.tags = data.tags || [];
    this.author = data.author || 'system';
    this.version = data.version || '1.0.0';
    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
    this.metadata = data.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      content: this.content,
      category: this.category,
      tags: this.tags,
      author: this.author,
      version: this.version,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      metadata: this.metadata
    };
  }

  update(updates) {
    Object.assign(this, updates);
    this.updatedAt = Date.now();
    return this;
  }
}

class Category {
  constructor(data) {
    this.id = data.id || `cat_${Date.now()}`;
    this.name = data.name;
    this.description = data.description || '';
    this.parentId = data.parentId || null;
    this.order = data.order || 0;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      parentId: this.parentId,
      order: this.order
    };
  }
}

// ========== Search Engine ==========

class SearchEngine {
  constructor() {
    this.index = new Map(); // term -> Set of handbook IDs
  }

  indexHandbook(handbook) {
    // Clear old index for this handbook
    for (const term of this.index.keys()) {
      this.index.get(term).delete(handbook.id);
    }

    // Index title and content
    const text = `${handbook.title} ${handbook.content} ${handbook.tags.join(' ')}`.toLowerCase();
    const words = text.split(/\W+/).filter(w => w.length >= 2);

    for (const word of words) {
      if (!this.index.has(word)) {
        this.index.set(word, new Set());
      }
      this.index.get(word).add(handbook.id);
    }
  }

  search(query, handbooks) {
    const queryWords = query.toLowerCase().split(/\W+/).filter(w => w.length >= 2);
    if (queryWords.length === 0) return [];

    // Find matching IDs
    const matchingIds = new Set();
    for (const word of queryWords) {
      if (this.index.has(word)) {
        for (const id of this.index.get(word)) {
          matchingIds.add(id);
        }
      }
    }

    // Score and sort results
    const results = [];
    for (const id of matchingIds) {
      const handbook = handbooks.find(h => h.id === id);
      if (!handbook) continue;

      let score = 0;
      const text = `${handbook.title} ${handbook.content} ${handbook.tags.join(' ')}`.toLowerCase();

      // Title matches score higher
      for (const word of queryWords) {
        if (handbook.title.toLowerCase().includes(word)) {
          score += 10;
        }
        // Tag matches score high
        for (const tag of handbook.tags) {
          if (tag.toLowerCase().includes(word)) {
            score += 5;
          }
        }
        // Count occurrences in content
        const matches = text.match(new RegExp(word, 'g'));
        if (matches) {
          score += matches.length;
        }
      }

      results.push({ handbook, score });
    }

    return results.sort((a, b) => b.score - a.score).map(r => r.handbook);
  }
}

// ========== Main Library Class ==========

class HandbookLibrary {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './handbook-library-data';
    this.handbooks = new Map();
    this.categories = new Map();
    this.searchEngine = new SearchEngine();

    this._init();
    this._registerBuiltInCategories();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
    this._rebuildIndex();
  }

  _loadData() {
    const handbooksFile = path.join(this.storageDir, 'handbooks.json');
    if (fs.existsSync(handbooksFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(handbooksFile, 'utf8'));
        for (const h of data) {
          const handbook = new Handbook(h);
          this.handbooks.set(handbook.id, handbook);
        }
      } catch (e) {
        console.error('Failed to load handbooks:', e);
      }
    }

    const categoriesFile = path.join(this.storageDir, 'categories.json');
    if (fs.existsSync(categoriesFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(categoriesFile, 'utf8'));
        for (const c of data) {
          const category = new Category(c);
          this.categories.set(category.id, category);
        }
      } catch (e) {
        console.error('Failed to load categories:', e);
      }
    }
  }

  _saveHandbooks() {
    const data = Array.from(this.handbooks.values()).map(h => h.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'handbooks.json'),
      JSON.stringify(data, null, 2)
    );
  }

  _saveCategories() {
    const data = Array.from(this.categories.values()).map(c => c.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'categories.json'),
      JSON.stringify(data, null, 2)
    );
  }

  _rebuildIndex() {
    this.searchEngine = new SearchEngine();
    for (const handbook of this.handbooks.values()) {
      this.searchEngine.indexHandbook(handbook);
    }
  }

  _registerBuiltInCategories() {
    const builtInCategories = [
      { id: 'getting-started', name: 'Getting Started', description: 'Quick start guides', order: 1 },
      { id: 'api-reference', name: 'API Reference', description: 'API documentation', order: 2 },
      { id: 'configuration', name: 'Configuration', description: 'Configuration guides', order: 3 },
      { id: 'troubleshooting', name: 'Troubleshooting', description: 'Problem solving', order: 4 },
      { id: 'best-practices', name: 'Best Practices', description: 'Recommended practices', order: 5 },
      { id: 'security', name: 'Security', description: 'Security guidelines', order: 6 },
      { id: 'deployment', name: 'Deployment', description: 'Deployment guides', order: 7 },
      { id: 'general', name: 'General', description: 'General documentation', order: 99 }
    ];

    for (const cat of builtInCategories) {
      if (!this.categories.has(cat.id)) {
        this.categories.set(cat.id, new Category(cat));
      }
    }
    this._saveCategories();
  }

  // ========== Handbook CRUD ==========

  addHandbook(data) {
    const handbook = new Handbook(data);
    this.handbooks.set(handbook.id, handbook);
    this.searchEngine.indexHandbook(handbook);
    this._saveHandbooks();
    return handbook;
  }

  getHandbook(id) {
    return this.handbooks.get(id) || null;
  }

  listHandbooks(filters = {}) {
    let result = Array.from(this.handbooks.values());

    if (filters.category) {
      result = result.filter(h => h.category === filters.category);
    }

    if (filters.tag) {
      result = result.filter(h => h.tags.includes(filters.tag));
    }

    if (filters.author) {
      result = result.filter(h => h.author === filters.author);
    }

    if (filters.sortBy === 'updated') {
      result.sort((a, b) => b.updatedAt - a.updatedAt);
    } else if (filters.sortBy === 'created') {
      result.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      result.sort((a, b) => a.title.localeCompare(b.title));
    }

    return result;
  }

  updateHandbook(id, updates) {
    const handbook = this.handbooks.get(id);
    if (!handbook) {
      throw new Error(`Handbook not found: ${id}`);
    }

    handbook.update(updates);
    this.searchEngine.indexHandbook(handbook);
    this._saveHandbooks();
    return handbook;
  }

  deleteHandbook(id) {
    if (!this.handbooks.has(id)) {
      throw new Error(`Handbook not found: ${id}`);
    }
    this.handbooks.delete(id);
    this._rebuildIndex();
    this._saveHandbooks();
  }

  // ========== Search ==========

  search(query, options = {}) {
    const handbooks = Array.from(this.handbooks.values());
    let results = this.searchEngine.search(query, handbooks);

    // Apply filters
    if (options.category) {
      results = results.filter(h => h.category === options.category);
    }

    if (options.tag) {
      results = results.filter(h => h.tags.includes(options.tag));
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // ========== Categories ==========

  addCategory(data) {
    const category = new Category(data);
    this.categories.set(category.id, category);
    this._saveCategories();
    return category;
  }

  getCategory(id) {
    return this.categories.get(id) || null;
  }

  listCategories() {
    return Array.from(this.categories.values()).sort((a, b) => a.order - b.order);
  }

  deleteCategory(id) {
    // Don't delete if handbooks exist in this category
    const handbooksInCategory = Array.from(this.handbooks.values()).filter(
      h => h.category === id
    );
    if (handbooksInCategory.length > 0) {
      throw new Error(`Cannot delete category with ${handbooksInCategory.length} handbooks`);
    }
    this.categories.delete(id);
    this._saveCategories();
  }

  // ========== Tags ==========

  getAllTags() {
    const tags = new Set();
    for (const handbook of this.handbooks.values()) {
      for (const tag of handbook.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }

  getHandbooksByTag(tag) {
    return this.listHandbooks({ tag });
  }

  // ========== Statistics ==========

  getStats() {
    const handbooks = Array.from(this.handbooks.values());

    const categoryCount = {};
    const tagCount = {};
    const authorCount = {};

    for (const h of handbooks) {
      categoryCount[h.category] = (categoryCount[h.category] || 0) + 1;
      for (const tag of h.tags) {
        tagCount[tag] = (tagCount[tag] || 0) + 1;
      }
      authorCount[h.author] = (authorCount[h.author] || 0) + 1;
    }

    return {
      totalHandbooks: handbooks.length,
      totalCategories: this.categories.size,
      totalTags: Object.keys(tagCount).length,
      byCategory: categoryCount,
      byTag: tagCount,
      byAuthor: authorCount,
      recentUpdates: handbooks
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5)
        .map(h => ({ id: h.id, title: h.title, updatedAt: h.updatedAt }))
    };
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const library = new HandbookLibrary();

  switch (command) {
    case 'list':
      console.log('Handbooks:');
      console.log('==========');
      for (const h of library.listHandbooks({ sortBy: 'updated' })) {
        console.log(`\n[${h.category}] ${h.title}`);
        console.log(`  Tags: ${h.tags.join(', ')}`);
        console.log(`  Author: ${h.author} | Version: ${h.version}`);
      }
      break;

    case 'search':
      const query = args.slice(1).join(' ');
      console.log(`Searching for: "${query}"`);
      const results = library.search(query, { limit: 10 });
      console.log(`\nFound ${results.length} results:`);
      for (const h of results) {
        console.log(`\n- ${h.title} [${h.category}]`);
      }
      break;

    case 'add':
      const handbook = library.addHandbook({
        title: args[1] || 'New Handbook',
        content: args[2] || 'Content goes here...',
        category: args[3] || 'general',
        tags: args[4] ? args[4].split(',') : [],
        author: args[5] || 'system'
      });
      console.log(`Added handbook: ${handbook.id}`);
      break;

    case 'get':
      const id = args[1];
      const h = library.getHandbook(id);
      if (h) {
        console.log(JSON.stringify(h.toJSON(), null, 2));
      } else {
        console.log(`Handbook not found: ${id}`);
      }
      break;

    case 'categories':
      console.log('Categories:');
      console.log('==========');
      for (const c of library.listCategories()) {
        console.log(`\n${c.name} (${c.id})`);
        console.log(`  ${c.description}`);
      }
      break;

    case 'tags':
      console.log('All Tags:');
      console.log('=========');
      console.log(library.getAllTags().join(', '));
      break;

    case 'stats':
      console.log('Handbook Library Statistics:');
      console.log('============================');
      console.log(JSON.stringify(library.getStats(), null, 2));
      break;

    case 'demo':
      // Add demo handbooks
      const demoHandbooks = [
        {
          title: 'Quick Start Guide',
          content: 'Welcome to our platform! This guide will help you get started quickly. First, install the CLI tool...',
          category: 'getting-started',
          tags: ['quick-start', 'beginner', 'installation'],
          author: 'admin'
        },
        {
          title: 'API Authentication',
          content: 'To authenticate with our API, you need to obtain an API key. Send a POST request to /auth/login with your credentials...',
          category: 'api-reference',
          tags: ['api', 'authentication', 'security'],
          author: 'dev-team'
        },
        {
          title: 'Configuration Options',
          content: 'Our application supports various configuration options. You can configure them via config.yaml or environment variables...',
          category: 'configuration',
          tags: ['config', 'yaml', 'environment'],
          author: 'ops-team'
        },
        {
          title: 'Troubleshooting Common Errors',
          content: 'Common errors and their solutions: Connection timeout - check network. Out of memory - increase heap size. Permission denied - check file permissions...',
          category: 'troubleshooting',
          tags: ['errors', 'debugging', 'solutions'],
          author: 'support-team'
        },
        {
          title: 'Security Best Practices',
          content: 'Always use HTTPS. Rotate API keys regularly. Never commit secrets to version control. Enable two-factor authentication...',
          category: 'security',
          tags: ['security', 'best-practices', 'encryption'],
          author: 'security-team'
        },
        {
          title: 'Deployment Strategies',
          content: 'We support multiple deployment strategies: Rolling updates, Blue-green deployments, Canary releases. Choose based on your risk tolerance...',
          category: 'deployment',
          tags: ['deployment', 'devops', 'ci-cd'],
          author: 'ops-team'
        },
        {
          title: 'Rate Limiting Guide',
          content: 'Our API has rate limits to prevent abuse. Free tier: 100 requests/min. Pro tier: 1000 requests/min. Enterprise: unlimited...',
          category: 'api-reference',
          tags: ['api', 'rate-limit', ' quotas'],
          author: 'dev-team'
        },
        {
          title: 'Database Migration',
          content: 'When migrating databases, always backup first. Use transactions for data integrity. Test in staging before production...',
          category: 'deployment',
          tags: ['database', 'migration', 'backup'],
          author: 'dba-team'
        }
      ];

      for (const d of demoHandbooks) {
        library.addHandbook(d);
      }
      console.log('Added demo handbooks');

      // Search demo
      console.log('\nSearch: "deployment"');
      const searchResults = library.search('deployment');
      for (const h of searchResults) {
        console.log(`  - ${h.title}`);
      }

      console.log('\nSearch: "api security"');
      const searchResults2 = library.search('api security');
      for (const h of searchResults2) {
        console.log(`  - ${h.title}`);
      }

      console.log('\nStats:');
      console.log(JSON.stringify(library.getStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node handbook-library.js list                     - List all handbooks');
      console.log('  node handbook-library.js search <query>            - Search handbooks');
      console.log('  node handbook-library.js add <title> <content> <category> <tags> <author>');
      console.log('  node handbook-library.js get <id>                  - Get handbook by ID');
      console.log('  node handbook-library.js categories                 - List categories');
      console.log('  node handbook-library.js tags                     - List all tags');
      console.log('  node handbook-library.js stats                    - Show statistics');
      console.log('  node handbook-library.js demo                      - Run demo');
  }
}

if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  Handbook,
  Category,
  SearchEngine,
  HandbookLibrary
};
