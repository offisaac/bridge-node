/**
 * Agent Media - Media Management Agent
 *
 * Manages media assets, transformations, thumbnails, and media processing.
 *
 * Usage: node agent-media.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   asset   - List media assets
 *   list    - List all media
 */

class MediaAsset {
  constructor(config) {
    this.id = `media-${Date.now()}`;
    this.name = config.name;
    this.type = config.type; // image, audio, video, document
    this.format = config.format; // jpg, png, mp4, mp3, pdf
    this.size = config.size || 0; // bytes
    this.duration = config.duration || null; // seconds for audio/video
    this.dimensions = config.dimensions || null; // width x height
    this.status = config.status || 'processing'; // processing, ready, error
    this.url = config.url || '';
    this.thumbnails = [];
    this.metadata = config.metadata || {};
    this.tags = config.tags || [];
    this.createdAt = Date.now();
  }

  complete() {
    this.status = 'ready';
  }

  fail(error) {
    this.status = 'error';
    this.metadata.error = error;
  }

  addThumbnail(thumbnail) {
    this.thumbnails.push(thumbnail);
  }

  addTag(tag) {
    if (!this.tags.includes(tag)) {
      this.tags.push(tag);
    }
  }
}

class MediaTransformation {
  constructor(config) {
    this.id = `transform-${Date.now()}`;
    this.assetId = config.assetId;
    this.type = config.type; // resize, crop, rotate, filter, compress
    this.params = config.params || {};
    this.status = 'pending'; // pending, processing, completed, failed
    this.result = null;
    this.createdAt = Date.now();
  }

  process() {
    this.status = 'processing';
  }

  complete(result) {
    this.status = 'completed';
    this.result = result;
  }

  fail(error) {
    this.status = 'failed';
    this.result = { error };
  }
}

class MediaCollection {
  constructor(config) {
    this.id = `collection-${Date.now()}`;
    this.name = config.name;
    this.description = config.description || '';
    this.assets = [];
    this.createdAt = Date.now();
  }

  addAsset(assetId) {
    if (!this.assets.includes(assetId)) {
      this.assets.push(assetId);
    }
  }

  removeAsset(assetId) {
    this.assets = this.assets.filter(id => id !== assetId);
  }
}

class MediaAgent {
  constructor(config = {}) {
    this.assets = new Map();
    this.transformations = new Map();
    this.collections = new Map();
    this.stats = {
      assetsUploaded: 0,
      transformationsProcessed: 0,
      storageUsed: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo media assets
    const assets = [
      {
        name: 'Hero Banner',
        type: 'image',
        format: 'jpg',
        size: 2048000,
        dimensions: '1920x1080',
        url: '/media/hero-banner.jpg',
        tags: ['banner', 'homepage', 'featured'],
        metadata: { author: 'Design Team' }
      },
      {
        name: 'Product Video',
        type: 'video',
        format: 'mp4',
        size: 52428800,
        duration: 120,
        dimensions: '1920x1080',
        url: '/media/product-video.mp4',
        tags: ['product', 'marketing', 'video'],
        metadata: { resolution: '1080p', fps: 30 }
      },
      {
        name: 'Background Music',
        type: 'audio',
        format: 'mp3',
        size: 3145728,
        duration: 180,
        url: '/media/bg-music.mp3',
        tags: ['audio', 'background', 'music'],
        metadata: { bitrate: '192kbps' }
      },
      {
        name: 'Logo PNG',
        type: 'image',
        format: 'png',
        size: 512000,
        dimensions: '512x512',
        url: '/media/logo.png',
        tags: ['logo', 'brand', 'transparent'],
        metadata: { transparent: true }
      }
    ];

    assets.forEach(a => {
      const asset = new MediaAsset(a);
      asset.complete();
      asset.addThumbnail({ size: 'small', url: `${asset.url}_thumb.jpg` });
      asset.addThumbnail({ size: 'medium', url: `${asset.url}_medium.jpg` });
      this.assets.set(asset.id, asset);
      this.stats.assetsUploaded++;
      this.stats.storageUsed += asset.size;
    });

    // Demo collections
    const collections = [
      { name: 'Marketing Assets', description: 'All marketing materials' },
      { name: 'Product Images', description: 'Product photography' }
    ];

    collections.forEach(c => {
      const collection = new MediaCollection(c);
      const assetIds = Array.from(this.assets.keys());
      if (assetIds.length > 0) {
        collection.addAsset(assetIds[0]);
      }
      this.collections.set(collection.id, collection);
    });
  }

  uploadAsset(config) {
    const asset = new MediaAsset(config);
    this.assets.set(asset.id, asset);
    this.stats.assetsUploaded++;
    this.stats.storageUsed += asset.size;
    console.log(`   Uploaded: ${asset.name} (${asset.format})`);
    return asset;
  }

  processAsset(assetId) {
    const asset = this.assets.get(assetId);
    if (!asset) {
      return { success: false, reason: 'Asset not found' };
    }

    asset.complete();
    console.log(`   Processed: ${asset.name}`);
    return { success: true, asset };
  }

  createTransformation(config) {
    const transform = new MediaTransformation(config);
    this.transformations.set(transform.id, transform);
    transform.process();
    return transform;
  }

  completeTransformation(transformId, result) {
    const transform = this.transformations.get(transformId);
    if (!transform) {
      return { success: false, reason: 'Transformation not found' };
    }

    transform.complete(result);
    this.stats.transformationsProcessed++;
    return { success: true, transform };
  }

  generateThumbnail(assetId, size) {
    const asset = this.assets.get(assetId);
    if (!asset) {
      return { success: false, reason: 'Asset not found' };
    }

    const thumbnail = {
      size,
      url: `${asset.url}_${size}.jpg`,
      createdAt: Date.now()
    };

    asset.addThumbnail(thumbnail);
    console.log(`   Generated ${size} thumbnail for ${asset.name}`);
    return { success: true, thumbnail };
  }

  createCollection(config) {
    const collection = new MediaCollection(config);
    this.collections.set(collection.id, collection);
    console.log(`   Created collection: ${collection.name}`);
    return collection;
  }

  addToCollection(collectionId, assetId) {
    const collection = this.collections.get(collectionId);
    if (!collection) {
      return { success: false, reason: 'Collection not found' };
    }

    collection.addAsset(assetId);
    return { success: true, collection };
  }

  listAssets(type = null, status = null) {
    let assets = Array.from(this.assets.values());
    if (type) {
      assets = assets.filter(a => a.type === type);
    }
    if (status) {
      assets = assets.filter(a => a.status === status);
    }
    return assets;
  }

  searchAssets(query) {
    const assets = Array.from(this.assets.values());
    return assets.filter(a =>
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
    );
  }

  getAsset(assetId) {
    return this.assets.get(assetId);
  }

  getStats() {
    const assets = Array.from(this.assets.values());
    return {
      ...this.stats,
      totalAssets: assets.length,
      images: assets.filter(a => a.type === 'image').length,
      videos: assets.filter(a => a.type === 'video').length,
      audio: assets.filter(a => a.type === 'audio').length,
      storageFormatted: this.formatBytes(this.stats.storageUsed)
    };
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const media = new MediaAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Media Demo\n');

    // 1. List Assets
    console.log('1. Media Assets:');
    const assets = media.listAssets();
    assets.forEach(a => {
      const size = media.formatBytes(a.size);
      console.log(`   - ${a.name}: ${a.type} (${a.format}) - ${size}`);
    });

    // 2. List by Type
    console.log('\n2. Images:');
    const images = media.listAssets('image');
    images.forEach(a => {
      console.log(`   - ${a.name}: ${a.dimensions}`);
    });

    // 3. Upload Asset
    console.log('\n3. Upload Asset:');
    const newAsset = media.uploadAsset({
      name: 'Promo Video',
      type: 'video',
      format: 'mp4',
      size: 104857600,
      duration: 60,
      dimensions: '1920x1080',
      url: '/media/promo-video.mp4',
      tags: ['promo', 'video']
    });
    media.processAsset(newAsset.id);

    // 4. Create Transformation
    console.log('\n4. Create Transformation:');
    const transform = media.createTransformation({
      assetId: newAsset.id,
      type: 'resize',
      params: { width: 1280, height: 720 }
    });
    media.completeTransformation(transform.id, { url: '/media/promo-video-720p.mp4', size: 20971520 });

    // 5. Generate Thumbnails
    console.log('\n5. Generate Thumbnails:');
    if (assets.length > 0) {
      media.generateThumbnail(assets[0].id, 'small');
      media.generateThumbnail(assets[0].id, 'medium');
    }

    // 6. Search Assets
    console.log('\n6. Search Assets:');
    const searchResults = media.searchAssets('video');
    searchResults.forEach(a => {
      console.log(`   Found: ${a.name}`);
    });

    // 7. Create Collection
    console.log('\n7. Create Collection:');
    const collection = media.createCollection({
      name: 'Website Assets',
      description: 'Assets for website'
    });

    // 8. Add to Collection
    console.log('\n8. Add to Collection:');
    media.addToCollection(collection.id, assets[0].id);

    // 9. List Collections
    console.log('\n9. Collections:');
    Array.from(media.collections.values()).forEach(c => {
      console.log(`   - ${c.name}: ${c.assets.length} assets`);
    });

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = media.getStats();
    console.log(`   Total Assets: ${stats.totalAssets}`);
    console.log(`   Images: ${stats.images}`);
    console.log(`   Videos: ${stats.videos}`);
    console.log(`   Audio: ${stats.audio}`);
    console.log(`   Storage Used: ${stats.storageFormatted}`);
    console.log(`   Transformations: ${stats.transformationsProcessed}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'asset':
    console.log('Media Assets:');
    media.listAssets().forEach(a => {
      console.log(`  ${a.name}: ${a.type} [${a.status}]`);
    });
    break;

  case 'list':
    console.log('All Media:');
    media.listAssets().forEach(a => {
      console.log(`  - ${a.name} (${a.format})`);
    });
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-media.js [demo|asset|list]');
}
