/**
 * Agent Fingerprint Module
 *
 * Provides device/browser fingerprinting services.
 * Usage: node agent-fingerprint.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show fingerprint stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Fingerprint Component
 */
class FingerprintComponent {
  constructor(name, value) {
    this.name = name;
    this.value = value;
    this.weight = 1.0;
  }
}

/**
 * Device Fingerprint
 */
class DeviceFingerprint {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.userId = config.userId || null;
    this.components = config.components || {};
    this.hash = config.hash || this._computeHash();
    this.createdAt = Date.now();
    this.lastSeen = this.createdAt;
    this.visitCount = 1;
    this.trusted = false;
  }

  _computeHash() {
    const data = JSON.stringify(this.components);
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  update(components) {
    this.components = { ...this.components, ...components };
    this.hash = this._computeHash();
    this.lastSeen = Date.now();
    this.visitCount++;
  }

  trust() {
    this.trusted = true;
  }

  untrust() {
    this.trusted = false;
  }

  toJSON() {
    return {
      id: this.id,
      userId: this.userId,
      hash: this.hash,
      components: this.components,
      createdAt: this.createdAt,
      lastSeen: this.lastSeen,
      visitCount: this.visitCount,
      trusted: this.trusted
    };
  }
}

/**
 * Fingerprint Collector
 */
class FingerprintCollector {
  constructor() {
    this.components = {};
  }

  addUserAgent(userAgent) {
    this.components.userAgent = userAgent;
  }

  addScreen(screen) {
    this.components.screen = `${screen.width}x${screen.height}`;
    this.components.colorDepth = screen.colorDepth;
  }

  addTimezone(timezone) {
    this.components.timezone = timezone;
  }

  addLanguage(language) {
    this.components.language = language;
  }

  addPlatform(platform) {
    this.components.platform = platform;
  }

  addCookiesEnabled(enabled) {
    this.components.cookiesEnabled = enabled;
  }

  addDoNotTrack(dnt) {
    this.components.doNotTrack = dnt;
  }

  addWebGL(webgl) {
    this.components.webGLVendor = webgl.vendor;
    this.components.webGLRenderer = webgl.renderer;
  }

  addCanvas(canvasHash) {
    this.components.canvas = canvasHash;
  }

  addFonts(fonts) {
    this.components.fonts = fonts;
  }

  addPlugins(plugins) {
    this.components.plugins = plugins;
  }

  addHardwareConcurrency(cores) {
    this.components.hardwareConcurrency = cores;
  }

  addDeviceMemory(memory) {
    this.components.deviceMemory = memory;
  }

  getComponents() {
    return { ...this.components };
  }
}

/**
 * Fingerprint Manager
 */
class FingerprintManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.fingerprints = new Map();
    this.stats = {
      fingerprintsCreated: 0,
      fingerprintsMatched: 0,
      fingerprintsUpdated: 0,
      trustedDevices: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  create(components, userId = null) {
    const fingerprint = new DeviceFingerprint({ components, userId });
    this.fingerprints.set(fingerprint.id, fingerprint);
    this.stats.fingerprintsCreated++;
    return fingerprint;
  }

  match(components) {
    const hash = this._computeHash(components);

    // Try to find existing fingerprint
    for (const fingerprint of this.fingerprints.values()) {
      if (fingerprint.hash === hash) {
        fingerprint.lastSeen = Date.now();
        fingerprint.visitCount++;
        this.stats.fingerprintsMatched++;
        return { matched: true, fingerprint };
      }
    }

    return { matched: false };
  }

  getOrCreate(components, userId = null) {
    const result = this.match(components);

    if (result.matched) {
      return result.fingerprint;
    }

    return this.create(components, userId);
  }

  _computeHash(components) {
    const data = JSON.stringify(components);
    return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  getFingerprint(id) {
    return this.fingerprints.get(id);
  }

  trustDevice(id) {
    const fingerprint = this.fingerprints.get(id);
    if (fingerprint) {
      fingerprint.trust();
      this.stats.trustedDevices++;
      return true;
    }
    return false;
  }

  untrustDevice(id) {
    const fingerprint = this.fingerprints.get(id);
    if (fingerprint) {
      fingerprint.untrust();
      this.stats.trustedDevices--;
      return true;
    }
    return false;
  }

  getDevicesForUser(userId) {
    return Array.from(this.fingerprints.values()).filter(f => f.userId === userId);
  }

  getStats() {
    return {
      ...this.stats,
      totalFingerprints: this.fingerprints.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Fingerprint Demo\n');

  const manager = new FingerprintManager();

  // Collect fingerprint components
  console.log('1. Collecting Fingerprint Components:');

  const collector = new FingerprintCollector();
  collector.addUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  collector.addScreen({ width: 1920, height: 1080, colorDepth: 24 });
  collector.addTimezone('America/New_York');
  collector.addLanguage('en-US');
  collector.addPlatform('Win32');
  collector.addCookiesEnabled(true);
  collector.addDoNotTrack('1');
  collector.addWebGL({ vendor: 'NVIDIA', renderer: 'NVIDIA GeForce RTX 3080' });
  collector.addHardwareConcurrency(16);
  collector.addDeviceMemory(32);

  const components = collector.getComponents();
  console.log(`   Components collected: ${Object.keys(components).length}`);

  // Create fingerprint
  console.log('\n2. Creating Fingerprint:');
  const fp1 = manager.create(components, 'user-123');
  console.log(`   Fingerprint ID: ${fp1.id}`);
  console.log(`   Hash: ${fp1.hash}`);

  // Match existing fingerprint
  console.log('\n3. Matching Fingerprint:');
  const matchResult = manager.match(components);
  console.log(`   Matched: ${matchResult.matched ? 'YES' : 'NO'}`);

  // Create different fingerprint
  console.log('\n4. Creating Different Fingerprint:');
  const collector2 = new FingerprintCollector();
  collector2.addUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
  collector2.addScreen({ width: 2560, height: 1440, colorDepth: 24 });
  collector2.addTimezone('America/Los_Angeles');
  collector2.addLanguage('en-US');
  collector2.addPlatform('MacIntel');
  collector2.addCookiesEnabled(true);
  collector2.addHardwareConcurrency(8);
  collector2.addDeviceMemory(16);

  const components2 = collector2.getComponents();
  const fp2 = manager.create(components2, 'user-123');
  console.log(`   New Fingerprint ID: ${fp2.id}`);
  console.log(`   Different Hash: ${fp2.hash}`);

  // Trust device
  console.log('\n5. Trusting Device:');
  manager.trustDevice(fp1.id);
  console.log(`   Device ${fp1.id.substring(0, 8)} trusted`);

  // Get user devices
  console.log('\n6. User Devices:');
  const userDevices = manager.getDevicesForUser('user-123');
  console.log(`   Total devices for user-123: ${userDevices.length}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Fingerprints Created: ${stats.fingerprintsCreated}`);
  console.log(`   Fingerprints Matched: ${stats.fingerprintsMatched}`);
  console.log(`   Trusted Devices: ${stats.trustedDevices}`);
  console.log(`   Total Fingerprints: ${stats.totalFingerprints}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new FingerprintManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Fingerprint Module');
  console.log('Usage: node agent-fingerprint.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
