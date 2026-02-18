/**
 * Agent Content - Content Management Agent
 *
 * Manages content assets, versions, metadata, and content workflows.
 *
 * Usage: node agent-content.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   asset   - List assets
 *   list    - List content
 */

class ContentAsset {
  constructor(config) {
    this.id = `asset-${Date.now()}`;
    this.title = config.title;
    this.type = config.type; // article, image, document, video, audio
    this.status = config.status || 'draft'; // draft, review, published, archived
    this.content = config.content || '';
    this.metadata = config.metadata || {};
    this.tags = config.tags || [];
    this.author = config.author || 'Unknown';
    this.version = 1;
    this.versions = [];
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
    this.publishedAt = null;
  }

  publish() {
    this.status = 'published';
    this.publishedAt = Date.now();
    this.saveVersion();
  }

  archive() {
    this.status = 'archived';
    this.saveVersion();
  }

  saveVersion() {
    this.versions.push({
      version: this.version,
      content: this.content,
      timestamp: Date.now()
    });
    this.version++;
  }

  updateContent(content) {
    this.content = content;
    this.updatedAt = Date.now();
    this.saveVersion();
  }

  addTag(tag) {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
    }
  }

  removeTag(tag) {
    this.tags = this.tags.filter(t => t !== tag);
  }
}

class ContentWorkflow {
  constructor(config) {
    this.id = `workflow-${Date.now()}`;
    this.assetId = config.assetId;
    this.status = 'pending'; // pending, in_review, approved, rejected, published
    this.steps = config.steps || ['draft', 'review', 'publish'];
    this.currentStep = 0;
    this.assignedTo = config.assignedTo || null;
    this.comments = [];
    this.createdAt = Date.now();
  }

  advance() {
    if (this.currentStep < this.steps.length - 1) {
      this.currentStep++;
      this.status = this.steps[this.currentStep];
    }
  }

  reject(reason) {
    this.status = 'rejected';
    this.comments.push({ type: 'rejection', reason, timestamp: Date.now() });
  }

  addComment(comment, author) {
    this.comments.push({ type: 'comment', text: comment, author, timestamp: Date.now() });
  }
}

class ContentCategory {
  constructor(config) {
    this.id = `category-${Date.now()}`;
    this.name = config.name;
    this.description = config.description || '';
    this.parentId = config.parentId || null;
    this.assetCount = 0;
  }
}

class ContentAgent {
  constructor(config = {}) {
    this.assets = new Map();
    this.workflows = new Map();
    this.categories = new Map();
    this.stats = {
      assetsCreated: 0,
      assetsPublished: 0,
      totalVersions: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo categories
    const categories = [
      { name: 'Technology', description: 'Tech articles and tutorials' },
      { name: 'Business', description: 'Business content' },
      { name: 'Marketing', description: 'Marketing materials' }
    ];

    categories.forEach(c => {
      const category = new ContentCategory(c);
      this.categories.set(category.id, category);
    });

    // Demo assets
    const assets = [
      {
        title: 'Getting Started with React',
        type: 'article',
        content: 'React is a JavaScript library for building user interfaces...',
        author: 'John Doe',
        tags: ['react', 'javascript', 'frontend'],
        metadata: { readTime: 10, language: 'en' }
      },
      {
        title: 'Company Logo',
        type: 'image',
        content: '[Image data]',
        author: 'Design Team',
        tags: ['branding', 'logo'],
        metadata: { format: 'png', resolution: '1920x1080' }
      },
      {
        title: 'Q4 Report',
        type: 'document',
        content: 'Quarterly financial report content...',
        author: 'Finance Team',
        tags: ['report', 'finance', 'q4'],
        metadata: { format: 'pdf', pages: 25 }
      }
    ];

    assets.forEach(a => {
      const asset = new ContentAsset(a);
      asset.publish();
      this.assets.set(asset.id, asset);
      this.stats.assetsCreated++;
      this.stats.assetsPublished++;
      this.stats.totalVersions += asset.version;
    });

    // Update category counts
    const categoryIds = Array.from(this.categories.keys());
    if (categoryIds.length > 0) {
      const category = this.categories.get(categoryIds[0]);
      if (category) category.assetCount = 2;
    }
  }

  createAsset(config) {
    const asset = new ContentAsset(config);
    this.assets.set(asset.id, asset);
    this.stats.assetsCreated++;
    console.log(`   Created asset: ${asset.title}`);
    return asset;
  }

  publishAsset(assetId) {
    const asset = this.assets.get(assetId);
    if (!asset) {
      return { success: false, reason: 'Asset not found' };
    }
    asset.publish();
    this.stats.assetsPublished++;
    console.log(`   Published asset: ${asset.title}`);
    return { success: true, asset };
  }

  archiveAsset(assetId) {
    const asset = this.assets.get(assetId);
    if (!asset) {
      return { success: false, reason: 'Asset not found' };
    }
    asset.archive();
    return { success: true, asset };
  }

  updateAsset(assetId, content) {
    const asset = this.assets.get(assetId);
    if (!asset) {
      return { success: false, reason: 'Asset not found' };
    }
    asset.updateContent(content);
    this.stats.totalVersions += 1;
    return { success: true, asset };
  }

  createWorkflow(assetId, steps, assignedTo = null) {
    const workflow = new ContentWorkflow({
      assetId,
      steps,
      assignedTo
    });
    this.workflows.set(workflow.id, workflow);
    return workflow;
  }

  advanceWorkflow(workflowId) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      return { success: false, reason: 'Workflow not found' };
    }
    workflow.advance();
    return { success: true, workflow };
  }

  createCategory(config) {
    const category = new ContentCategory(config);
    this.categories.set(category.id, category);
    return category;
  }

  listAssets(status = null, type = null) {
    let assets = Array.from(this.assets.values());
    if (status) {
      assets = assets.filter(a => a.status === status);
    }
    if (type) {
      assets = assets.filter(a => a.type === type);
    }
    return assets;
  }

  searchAssets(query) {
    const assets = Array.from(this.assets.values());
    return assets.filter(a =>
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
    );
  }

  getAsset(assetId) {
    return this.assets.get(assetId);
  }

  getStats() {
    return {
      ...this.stats,
      totalAssets: this.assets.size,
      categories: this.categories.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const content = new ContentAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Content Demo\n');

    // 1. List Assets
    console.log('1. List Assets:');
    const assets = content.listAssets();
    assets.forEach(a => {
      console.log(`   - ${a.title} (${a.type}) [${a.status}]`);
    });

    // 2. List by Status
    console.log('\n2. Published Assets:');
    const published = content.listAssets('published');
    published.forEach(a => {
      console.log(`   - ${a.title}`);
    });

    // 3. Create Asset
    console.log('\n3. Create Asset:');
    const newAsset = content.createAsset({
      title: 'Introduction to Node.js',
      type: 'article',
      content: 'Node.js is a JavaScript runtime built on Chrome V8...',
      author: 'Jane Smith',
      tags: ['nodejs', 'javascript', 'backend'],
      metadata: { readTime: 15, language: 'en' }
    });

    // 4. Update Asset
    console.log('\n4. Update Asset:');
    content.updateAsset(newAsset.id, 'Updated content with new information...');

    // 5. Publish Asset
    console.log('\n5. Publish Asset:');
    content.publishAsset(newAsset.id);

    // 6. Search Assets
    console.log('\n6. Search Assets:');
    const searchResults = content.searchAssets('react');
    searchResults.forEach(a => {
      console.log(`   Found: ${a.title}`);
    });

    // 7. Create Workflow
    console.log('\n7. Create Workflow:');
    const workflow = content.createWorkflow(
      newAsset.id,
      ['draft', 'review', 'approved', 'published'],
      'editor@example.com'
    );
    console.log(`   Created workflow: ${workflow.steps[workflow.currentStep]}`);

    // 8. Advance Workflow
    console.log('\n8. Advance Workflow:');
    content.advanceWorkflow(workflow.id);
    console.log(`   Status: ${workflow.status}`);

    // 9. List Categories
    console.log('\n9. Categories:');
    Array.from(content.categories.values()).forEach(c => {
      console.log(`   - ${c.name}: ${c.assetCount} assets`);
    });

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = content.getStats();
    console.log(`   Total Assets: ${stats.totalAssets}`);
    console.log(`   Published: ${stats.assetsPublished}`);
    console.log(`   Total Versions: ${stats.totalVersions}`);
    console.log(`   Categories: ${stats.categories}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'asset':
    console.log('Assets:');
    content.listAssets().forEach(a => {
      console.log(`  ${a.title}: ${a.type} [${a.status}]`);
    });
    break;

  case 'list':
    console.log('All Content:');
    content.listAssets().forEach(a => {
      console.log(`  - ${a.title} by ${a.author}`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-content.js [demo|asset|list]');
}
