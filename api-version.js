/**
 * API Version Control - API版本控制
 * API版本管理和弃用策略
 */

const fs = require('fs');
const path = require('path');

// ========== API Version Types ==========

const VersionStatus = {
  ACTIVE: 'active',
  DEPRECATED: 'deprecated',
  SUNSET: 'sunset',
  RETIRED: 'retired'
};

const DeprecationPhase = {
  ANNOUNCED: 'announced',
  WARNING: 'warning',
  FINAL: 'final',
  REMOVED: 'removed'
};

// ========== API Version ==========

class APIVersion {
  constructor(version, config = {}) {
    this.version = version;
    this.status = config.status || VersionStatus.ACTIVE;
    this.deprecationPhase = config.deprecationPhase || null;
    this.deprecatedAt = config.deprecatedAt || null;
    this.sunsetDate = config.sunsetDate || null;
    this.retiredAt = config.retiredAt || null;
    this.releaseDate = config.releaseDate || new Date().toISOString();
    this.changelog = config.changelog || [];
    this.endpoints = config.endpoints || [];
    this.metadata = config.metadata || {};
  }

  deprecate(sunsetDate) {
    this.status = VersionStatus.DEPRECATED;
    this.deprecationPhase = DeprecationPhase.ANNOUNCED;
    this.deprecatedAt = new Date().toISOString();
    this.sunsetDate = sunsetDate;
    return this;
  }

  setDeprecationPhase(phase) {
    this.deprecationPhase = phase;
    return this;
  }

  sunset() {
    this.status = VersionStatus.SUNSET;
    this.deprecationPhase = DeprecationPhase.REMOVED;
    this.sunsetAt = new Date().toISOString();
    return this;
  }

  retire() {
    this.status = VersionStatus.RETIRED;
    this.retiredAt = new Date().toISOString();
    return this;
  }

  isActive() {
    return this.status === VersionStatus.ACTIVE;
  }

  isDeprecated() {
    return this.status === VersionStatus.DEPRECATED;
  }

  shouldShowWarning() {
    return this.isDeprecated() &&
      (this.deprecationPhase === DeprecationPhase.WARNING ||
       this.deprecationPhase === DeprecationPhase.FINAL);
  }

  toJSON() {
    return {
      version: this.version,
      status: this.status,
      deprecationPhase: this.deprecationPhase,
      deprecatedAt: this.deprecatedAt,
      sunsetDate: this.sunsetDate,
      retiredAt: this.retiredAt,
      releaseDate: this.releaseDate,
      changelog: this.changelog,
      endpoints: this.endpoints,
      metadata: this.metadata
    };
  }
}

// ========== API Endpoint ==========

class APIEndpoint {
  constructor(path, method, config = {}) {
    this.path = path;
    this.method = method;
    this.version = config.version || 'v1';
    this.deprecated = config.deprecated || false;
    this.deprecationMessage = config.deprecationMessage || null;
    this.replacement = config.replacement || null;
    this.since = config.since || null;
    this.removalDate = config.removalDate || null;
    this.requestSchema = config.requestSchema || null;
    this.responseSchema = config.responseSchema || null;
    this.examples = config.examples || {};
    this.metadata = config.metadata || {};
  }

  deprecate(replacement, removalDate, message = null) {
    this.deprecated = true;
    this.replacement = replacement;
    this.removalDate = removalDate;
    this.deprecationMessage = message || `This endpoint will be removed on ${removalDate}. Please use ${replacement} instead.`;
    return this;
  }

  toJSON() {
    return {
      path: this.path,
      method: this.method,
      version: this.version,
      deprecated: this.deprecated,
      deprecationMessage: this.deprecationMessage,
      replacement: this.replacement,
      since: this.since,
      removalDate: this.removalDate,
      requestSchema: this.requestSchema,
      responseSchema: this.responseSchema,
      examples: this.examples,
      metadata: this.metadata
    };
  }
}

// ========== API Version Manager ==========

class APIVersionManager {
  constructor(options = {}) {
    this.name = options.name || 'api';
    this.versions = new Map();
    this.endpoints = new Map();
    this.storagePath = options.storagePath || './api-versions.json';
    this.defaultVersion = options.defaultVersion || 'v1';
    this.gracePeriod = options.gracePeriod || 30; // days

    this._load();
  }

  // ========== Version Management ==========

  createVersion(version, config = {}) {
    if (this.versions.has(version)) {
      throw new Error(`Version ${version} already exists`);
    }

    const apiVersion = new APIVersion(version, config);
    this.versions.set(version, apiVersion);
    this._save();

    return apiVersion;
  }

  getVersion(version) {
    return this.versions.get(version);
  }

  listVersions(filters = {}) {
    let versions = Array.from(this.versions.values());

    if (filters.status) {
      versions = versions.filter(v => v.status === filters.status);
    }

    return versions.sort((a, b) => {
      // Sort by version number (v2 > v1)
      const aNum = parseFloat(a.version.replace('v', ''));
      const bNum = parseFloat(b.version.replace('v', ''));
      return bNum - aNum;
    });
  }

  getActiveVersions() {
    return this.listVersions({ status: VersionStatus.ACTIVE });
  }

  getDeprecatedVersions() {
    return this.listVersions({ status: VersionStatus.DEPRECATED });
  }

  // ========== Version Operations ==========

  deprecateVersion(version, sunsetDate) {
    const apiVersion = this.versions.get(version);
    if (!apiVersion) {
      throw new Error(`Version ${version} not found`);
    }

    apiVersion.deprecate(sunsetDate);
    this._save();

    return apiVersion;
  }

  sunsetVersion(version) {
    const apiVersion = this.versions.get(version);
    if (!apiVersion) {
      throw new Error(`Version ${version} not found`);
    }

    apiVersion.sunset();
    this._save();

    return apiVersion;
  }

  retireVersion(version) {
    const apiVersion = this.versions.get(version);
    if (!apiVersion) {
      throw new Error(`Version ${version} not found`);
    }

    apiVersion.retire();
    this._save();

    return apiVersion;
  }

  // ========== Endpoint Management ==========

  registerEndpoint(endpoint) {
    const key = `${endpoint.method}:${endpoint.path}:${endpoint.version}`;
    this.endpoints.set(key, endpoint);
    this._save();

    return endpoint;
  }

  getEndpoint(path, method, version = null) {
    version = version || this.defaultVersion;
    const key = `${method}:${path}:${version}`;
    return this.endpoints.get(key);
  }

  listEndpoints(filters = {}) {
    let endpoints = Array.from(this.endpoints.values());

    if (filters.version) {
      endpoints = endpoints.filter(e => e.version === filters.version);
    }

    if (filters.method) {
      endpoints = endpoints.filter(e => e.method === filters.method);
    }

    if (filters.deprecated !== undefined) {
      endpoints = endpoints.filter(e => e.deprecated === filters.deprecated);
    }

    return endpoints;
  }

  // ========== Version Resolution ==========

  resolveVersion(requestedVersion) {
    // If exact version exists
    if (this.versions.has(requestedVersion)) {
      return this.versions.get(requestedVersion);
    }

    // If no version specified, return default
    if (!requestedVersion) {
      return this.versions.get(this.defaultVersion);
    }

    // Try to find compatible version
    const baseVersion = requestedVersion.replace(/\.\d+$/, '');
    for (const [version, apiVersion] of this.versions) {
      if (version.startsWith(baseVersion) && apiVersion.isActive()) {
        return apiVersion;
      }
    }

    // Return default if no match
    return this.versions.get(this.defaultVersion);
  }

  // ========== Deprecation Warnings ==========

  getDeprecationHeaders(version) {
    const apiVersion = this.versions.get(version);
    if (!apiVersion || !apiVersion.isDeprecated()) {
      return {};
    }

    const headers = {
      'Deprecation': 'true'
    };

    if (apiVersion.sunsetDate) {
      headers['Sunset'] = new Date(apiVersion.sunsetDate).toUTCString();
    }

    if (apiVersion.deprecationPhase === DeprecationPhase.FINAL) {
      headers['Link'] = `<https://api.example.com/docs>; rel="deprecation"; type="text/html"`;
    }

    return headers;
  }

  getDeprecationWarning(version, endpoint = null) {
    const apiVersion = this.versions.get(version);
    if (!apiVersion) return null;

    if (!apiVersion.shouldShowWarning()) return null;

    let warning = `API version ${version} is deprecated`;

    if (apiVersion.sunsetDate) {
      const daysLeft = Math.ceil(
        (new Date(apiVersion.sunsetDate) - new Date()) / (1000 * 60 * 60 * 24)
      );
      warning += `. Will be removed in ${daysLeft} days`;
    }

    if (endpoint && endpoint.replacement) {
      warning += `. Use ${endpoint.replacement} instead`;
    }

    return warning;
  }

  // ========== Changelog ==========

  addChangelogEntry(version, entry) {
    const apiVersion = this.versions.get(version);
    if (!apiVersion) {
      throw new Error(`Version ${version} not found`);
    }

    apiVersion.changelog.unshift({
      date: new Date().toISOString(),
      ...entry
    });

    this._save();
    return apiVersion;
  }

  getChangelog(version, limit = 10) {
    const apiVersion = this.versions.get(version);
    if (!apiVersion) {
      throw new Error(`Version ${version} not found`);
    }

    return apiVersion.changelog.slice(0, limit);
  }

  // ========== Documentation ==========

  generateOpenAPISpec(version) {
    const apiVersion = this.versions.get(version);
    if (!apiVersion) {
      throw new Error(`Version ${version} not found`);
    }

    const spec = {
      openapi: '3.0.0',
      info: {
        title: `${this.name} API`,
        version: version,
        deprecation: apiVersion.isDeprecated(),
        sunsetDate: apiVersion.sunsetDate
      },
      paths: {}
    };

    // Add endpoints for this version
    for (const [key, endpoint] of this.endpoints) {
      if (endpoint.version !== version) continue;

      const pathItem = spec.paths[endpoint.path] || {};
      const method = endpoint.method.toLowerCase();

      pathItem[method] = {
        deprecated: endpoint.deprecated,
        summary: endpoint.metadata.summary || '',
        description: endpoint.metadata.description || '',
        ...(endpoint.deprecated && {
          deprecated: true,
          description: endpoint.deprecationMessage
        }),
        ...(endpoint.requestSchema && { requestBody: endpoint.requestSchema }),
        ...(endpoint.responseSchema && { responses: endpoint.responseSchema })
      };

      spec.paths[endpoint.path] = pathItem;
    }

    return spec;
  }

  // ========== Persistence ==========

  _load() {
    try {
      if (fs.existsSync(this.storagePath)) {
        const data = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));

        for (const [version, config] of Object.entries(data.versions || {})) {
          this.versions.set(version, new APIVersion(version, config));
        }

        for (const [key, config] of Object.entries(data.endpoints || {})) {
          this.endpoints.set(key, new APIEndpoint(config.path, config.method, config));
        }
      } else {
        // Create default version
        this.createVersion('v1', {
          status: VersionStatus.ACTIVE
        });
      }
    } catch (err) {
      console.error('Failed to load API versions:', err);
    }
  }

  _save() {
    try {
      const data = {
        version: '1.0',
        updatedAt: new Date().toISOString(),
        versions: Object.fromEntries(
          Array.from(this.versions.entries()).map(([v, av]) => [v, av.toJSON()])
        ),
        endpoints: Object.fromEntries(
          Array.from(this.endpoints.entries()).map(([k, e]) => [k, e.toJSON()])
        )
      };

      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('Failed to save API versions:', err);
    }
  }

  // ========== Export ==========

  export() {
    return {
      name: this.name,
      defaultVersion: this.defaultVersion,
      versions: this.listVersions(),
      endpoints: this.listEndpoints()
    };
  }
}

// ========== Middleware ==========

function createVersionMiddleware(manager) {
  return (req, res, next) => {
    // Extract version from header or URL
    let version = req.headers['Accept-Version'] ||
                  req.headers['X-API-Version'] ||
                  req.params.version ||
                  manager.defaultVersion;

    // Resolve version
    const apiVersion = manager.resolveVersion(version);

    // Add version to request
    req.apiVersion = apiVersion.version;
    req.apiVersionInfo = apiVersion;

    // Add deprecation headers
    const deprecationHeaders = manager.getDeprecationHeaders(apiVersion.version);
    for (const [key, value] of Object.entries(deprecationHeaders)) {
      res.setHeader(key, value);
    }

    // Add deprecation warning
    const warning = manager.getDeprecationWarning(apiVersion.version);
    if (warning) {
      res.setHeader('X-Deprecation-Warning', warning);
    }

    next();
  };
}

// ========== CLI ==========

function runCLI() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new APIVersionManager();

  switch (command) {
    case 'list':
      console.log('API Versions:');
      for (const v of manager.listVersions()) {
        console.log(`  ${v.version} - ${v.status}${v.isDeprecated() ? ` (sunset: ${v.sunsetDate})` : ''}`);
      }
      break;

    case 'create':
      const version = args[1];
      if (!version) {
        console.error('Usage: node api-version.js create <version>');
        process.exit(1);
      }
      manager.createVersion(version);
      console.log(`Created version: ${version}`);
      break;

    case 'deprecate':
      const depVersion = args[1];
      const sunsetDate = args[2];
      if (!depVersion || !sunsetDate) {
        console.error('Usage: node api-version.js deprecate <version> <sunset-date>');
        process.exit(1);
      }
      manager.deprecateVersion(depVersion, sunsetDate);
      console.log(`Deprecated version: ${depVersion}, sunset: ${sunsetDate}`);
      break;

    case 'endpoints':
      const listVersion = args[1] || manager.defaultVersion;
      console.log(`Endpoints for ${listVersion}:`);
      for (const e of manager.listEndpoints({ version: listVersion })) {
        console.log(`  ${e.method} ${e.path} ${e.deprecated ? '[DEPRECATED]' : ''}`);
      }
      break;

    default:
      console.log(`
API Version Control CLI

Usage:
  node api-version.js list                       List all versions
  node api-version.js create <version>           Create new version
  node api-version.js deprecate <version> <date> Deprecate version
  node api-version.js endpoints [version]       List endpoints
      `);
  }
}

// ========== Export ==========

module.exports = {
  APIVersionManager,
  APIVersion,
  APIEndpoint,
  VersionStatus,
  DeprecationPhase,
  createVersionMiddleware
};

// Run CLI if called directly
if (require.main === module) {
  runCLI();
}
