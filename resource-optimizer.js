/**
 * Resource Optimizer - 资源优化器模块
 * 静态资源优化流水线
 */

const fs = require('fs');
const path = require('path');

// ========== Data Models ==========

class Asset {
  constructor(data) {
    this.id = data.id || `asset_${Date.now()}`;
    this.path = data.path;
    this.type = data.type; // javascript, stylesheet, image, font, other
    this.size = data.size || 0;
    this.originalSize = data.originalSize || data.size || 0;
    this.optimizations = data.optimizations || [];
    this.hash = data.hash || '';
    this.lastModified = data.lastModified || Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      path: this.path,
      type: this.type,
      size: this.size,
      originalSize: this.originalSize,
      optimizations: this.optimizations,
      hash: this.hash,
      lastModified: this.lastModified
    };
  }

  getSavings() {
    return this.originalSize - this.size;
  }

  getSavingsPercent() {
    if (this.originalSize === 0) return 0;
    return ((this.originalSize - this.size) / this.originalSize * 100).toFixed(1);
  }
}

class OptimizationConfig {
  constructor(data = {}) {
    this.javascript = {
      minify: data.javascript?.minify !== false,
      mangle: data.javascript?.mangle !== false,
      compress: data.javascript?.compress !== false
    };
    this.stylesheet = {
      minify: data.stylesheet?.minify !== false,
      autoprefixer: data.stylesheet?.autoprefixer !== false,
      compress: data.stylesheet?.compress !== false
    };
    this.image = {
      compress: data.image?.compress !== false,
      quality: data.image?.quality || 80,
      format: data.image?.format || 'auto', // auto, webp, avif, jpeg
      resize: data.image?.resize !== false
    };
    this.font = {
      subset: data.font?.subset !== false,
      formats: data.font?.formats || ['woff2', 'woff']
    };
  }

  toJSON() {
    return {
      javascript: this.javascript,
      stylesheet: this.stylesheet,
      image: this.image,
      font: this.font
    };
  }
}

// ========== Optimizers ==========

class JavaScriptOptimizer {
  constructor(config) {
    this.config = config;
  }

  optimize(code) {
    let result = code;
    const optimizations = [];

    if (this.config.minify) {
      // Simple minification (remove comments, whitespace)
      result = result
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
        .replace(/\/\/.*$/gm, '') // Remove line comments
        .replace(/\s+/g, ' ') // Collapse whitespace
        .replace(/\s*([{};:,=<>+\-*/&|!?()])\s*/g, '$1') // Remove space around operators
        .trim();
      optimizations.push('minify');
    }

    if (this.config.mangle) {
      // Simple variable mangling (for demo - real implementation would use proper parser)
      const varMap = new Map();
      let counter = 0;
      result = result.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match) => {
        if (!varMap.has(match)) {
          varMap.set(match, `v${counter++}`);
        }
        return varMap.get(match);
      });
      optimizations.push('mangle');
    }

    return { code: result, optimizations };
  }
}

class StylesheetOptimizer {
  constructor(config) {
    this.config = config;
  }

  optimize(code) {
    let result = code;
    const optimizations = [];

    if (this.config.minify) {
      result = result
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
        .replace(/\s+/g, ' ') // Collapse whitespace
        .replace(/\s*([{}:;>,+])\s*/g, '$1') // Remove space around operators
        .replace(/;\}/g, '}') // Remove trailing semicolons
        .trim();
      optimizations.push('minify');
    }

    if (this.config.autoprefixer) {
      // Add vendor prefixes for common properties
      const prefixMap = {
        'border-radius': ['-webkit-border-radius', '-moz-border-radius'],
        'box-shadow': ['-webkit-box-shadow', '-moz-box-shadow'],
        'transform': ['-webkit-transform', '-moz-transform', '-ms-transform'],
        'transition': ['-webkit-transition', '-moz-transition', '-o-transition'],
        'animation': ['-webkit-animation', '-moz-animation']
      };

      for (const [prop, prefixes] of Object.entries(prefixMap)) {
        if (result.includes(prop + ':')) {
          for (const prefix of prefixes) {
            const value = result.match(new RegExp(`${prop}:\\s*([^;]+)`));
            if (value) {
              result = result.replace(
                `${prop}: ${value[1]}`,
                `${prefix}: ${value[1]}; ${prop}: ${value[1]}`
              );
            }
          }
          optimizations.push('autoprefixer');
        }
      }
    }

    return { code: result, optimizations };
  }
}

class ImageOptimizer {
  constructor(config) {
    this.config = config;
  }

  optimize(buffer, filename) {
    const optimizations = [];
    let result = buffer;

    if (this.config.compress) {
      // Simulate compression (in real implementation, use sharp, imagemin, etc.)
      // Here we just simulate size reduction
      const compressionRatio = this.config.quality / 100;
      result = Buffer.alloc(Math.floor(buffer.length * compressionRatio));
      optimizations.push(`compress(${this.config.quality}%)`);
    }

    // Check format
    const ext = path.extname(filename).toLowerCase();
    if (this.config.format === 'auto') {
      if (ext === '.png') optimizations.push('format:webp');
      else if (ext === '.jpeg' || ext === '.jpg') optimizations.push('format:jpeg');
    }

    return { buffer: result, optimizations };
  }
}

// ========== Main Optimizer Class ==========

class ResourceOptimizer {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './resource-optimizer-data';
    this.config = new OptimizationConfig(options.config);
    this.assets = new Map();
    this.jsOptimizer = new JavaScriptOptimizer(this.config.javascript);
    this.cssOptimizer = new StylesheetOptimizer(this.config.stylesheet);
    this.imageOptimizer = new ImageOptimizer(this.config.image);

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
  }

  _loadData() {
    const assetsFile = path.join(this.storageDir, 'assets.json');
    if (fs.existsSync(assetsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(assetsFile, 'utf8'));
        for (const a of data) {
          this.assets.set(a.id, new Asset(a));
        }
      } catch (e) {
        console.error('Failed to load assets:', e);
      }
    }
  }

  _saveData() {
    const data = Array.from(this.assets.values()).map(a => a.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'assets.json'),
      JSON.stringify(data, null, 2)
    );
  }

  // ========== Asset Processing ==========

  processFile(filePath, outputDir = null) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const stats = fs.statSync(filePath);
    const originalSize = stats.size;
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();

    let type, optimized, optimizations;

    if (ext === '.js') {
      type = 'javascript';
      const result = this.jsOptimizer.optimize(buffer.toString('utf8'));
      optimized = Buffer.from(result.code, 'utf8');
      optimizations = result.optimizations;
    } else if (ext === '.css') {
      type = 'stylesheet';
      const result = this.cssOptimizer.optimize(buffer.toString('utf8'));
      optimized = Buffer.from(result.code, 'utf8');
      optimizations = result.optimizations;
    } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp'].includes(ext)) {
      type = 'image';
      const result = this.imageOptimizer.optimize(buffer, path.basename(filePath));
      optimized = result.buffer;
      optimizations = result.optimizations;
    } else if (['.woff', '.woff2', '.ttf', '.otf'].includes(ext)) {
      type = 'font';
      // Font optimization (subsetting would happen here)
      optimized = buffer;
      optimizations = this.config.font.subset ? ['subset'] : [];
    } else {
      type = 'other';
      optimized = buffer;
      optimizations = [];
    }

    // Save optimized version
    if (outputDir) {
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      const outputPath = path.join(outputDir, path.basename(filePath));
      fs.writeFileSync(outputPath, optimized);
    }

    // Create asset record
    const asset = new Asset({
      path: filePath,
      type,
      size: optimized.length,
      originalSize,
      optimizations,
      hash: this._generateHash(optimized)
    });

    this.assets.set(asset.id, asset);
    this._saveData();

    return asset;
  }

  processDirectory(dirPath, outputDir = null, recursive = true) {
    const results = [];
    const files = this._getFiles(dirPath, recursive);

    for (const file of files) {
      try {
        const asset = this.processFile(file, outputDir);
        results.push(asset);
      } catch (e) {
        console.error(`Failed to process ${file}: ${e.message}`);
      }
    }

    return results;
  }

  // ========== Analysis ==========

  analyzeAsset(assetId) {
    const asset = this.assets.get(assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${assetId}`);
    }

    return {
      ...asset.toJSON(),
      savings: asset.getSavings(),
      savingsPercent: asset.getSavingsPercent()
    };
  }

  getOptimizationReport() {
    const assets = Array.from(this.assets.values());

    const byType = {
      javascript: { count: 0, original: 0, optimized: 0 },
      stylesheet: { count: 0, original: 0, optimized: 0 },
      image: { count: 0, original: 0, optimized: 0 },
      font: { count: 0, original: 0, optimized: 0 },
      other: { count: 0, original: 0, optimized: 0 }
    };

    for (const asset of assets) {
      byType[asset.type].count++;
      byType[asset.type].original += asset.originalSize;
      byType[asset.type].optimized += asset.size;
    }

    const totalOriginal = Object.values(byType).reduce((sum, t) => sum + t.original, 0);
    const totalOptimized = Object.values(byType).reduce((sum, t) => sum + t.optimized, 0);

    return {
      totalAssets: assets.length,
      totalOriginal,
      totalOptimized,
      totalSavings: totalOriginal - totalOptimized,
      savingsPercent: totalOriginal > 0
        ? ((totalOriginal - totalOptimized) / totalOriginal * 100).toFixed(1)
        : 0,
      byType
    };
  }

  // ========== Helpers ==========

  _generateHash(buffer) {
    // Simple hash for demo (use crypto in production)
    let hash = 0;
    for (let i = 0; i < buffer.length; i++) {
      hash = ((hash << 5) - hash) + buffer[i];
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  _getFiles(dirPath, recursive) {
    const files = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && recursive) {
        files.push(...this._getFiles(fullPath, recursive));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  // ========== Configuration ==========

  updateConfig(newConfig) {
    this.config = new OptimizationConfig({
      ...this.config.toJSON(),
      ...newConfig
    });
    return this.config;
  }

  getConfig() {
    return this.config.toJSON();
  }

  // ========== Statistics ==========

  getStats() {
    return this.getOptimizationReport();
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const optimizer = new ResourceOptimizer();

  switch (command) {
    case 'process-file':
      const asset = optimizer.processFile(args[1], args[2] || null);
      console.log(`Processed: ${asset.path}`);
      console.log(`Original: ${asset.originalSize} bytes`);
      console.log(`Optimized: ${asset.size} bytes`);
      console.log(`Savings: ${asset.getSavings()} bytes (${asset.getSavingsPercent()}%)`);
      console.log(`Optimizations: ${asset.optimizations.join(', ')}`);
      break;

    case 'process-dir':
      const results = optimizer.processDirectory(args[1], args[2] || null);
      console.log(`Processed ${results.length} files`);
      console.log(JSON.stringify(optimizer.getOptimizationReport(), null, 2));
      break;

    case 'report':
      console.log('Optimization Report:');
      console.log('====================');
      console.log(JSON.stringify(optimizer.getOptimizationReport(), null, 2));
      break;

    case 'config':
      console.log('Current Config:');
      console.log(JSON.stringify(optimizer.getConfig(), null, 2));
      break;

    case 'stats':
      console.log('Statistics:');
      console.log(JSON.stringify(optimizer.getStats(), null, 2));
      break;

    case 'demo':
      // Create demo files
      const demoDir = './demo-assets';
      if (!fs.existsSync(demoDir)) {
        fs.mkdirSync(demoDir, { recursive: true });
      }

      // Create demo JS
      const jsContent = `// This is a demo JavaScript file
function greet(name) {
  console.log("Hello, " + name + "!");
}

// Another function
function calculate(a, b) {
  return a + b;
}

greet("World");
`;
      fs.writeFileSync(path.join(demoDir, 'app.js'), jsContent);

      // Create demo CSS
      const cssContent = `/* Demo Stylesheet */

.container {
  width: 100%;
  height: auto;
  margin: 10px;
  padding: 20px;
  border-radius: 5px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  transform: translateX(10px);
  transition: all 0.3s ease;
}

.button {
  background: blue;
  color: white;
  border-radius: 3px;
}
`;
      fs.writeFileSync(path.join(demoDir, 'styles.css'), cssContent);

      // Create demo HTML (to be ignored)
      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="container">
    <button class="button">Click Me</button>
  </div>
  <script src="app.js"></script>
</body>
</html>`;
      fs.writeFileSync(path.join(demoDir, 'index.html'), htmlContent);

      console.log('Created demo files in', demoDir);

      // Process files
      const processed = optimizer.processDirectory(demoDir, demoDir + '/optimized');
      console.log('\nProcessed files:');
      for (const p of processed) {
        console.log(`  ${path.basename(p.path)}: ${p.originalSize} -> ${p.size} bytes (${p.getSavingsPercent()}% saved)`);
      }

      console.log('\n--- Optimization Report ---');
      console.log(JSON.stringify(optimizer.getOptimizationReport(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node resource-optimizer.js process-file <file> [output]');
      console.log('  node resource-optimizer.js process-dir <dir> [output]');
      console.log('  node resource-optimizer.js report');
      console.log('  node resource-optimizer.js config');
      console.log('  node resource-optimizer.js stats');
      console.log('  node resource-optimizer.js demo');
  }
}

if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  Asset,
  OptimizationConfig,
  JavaScriptOptimizer,
  StylesheetOptimizer,
  ImageOptimizer,
  ResourceOptimizer
};
