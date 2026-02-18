/**
 * Agent Token Exchange Module
 *
 * Provides token exchange, refresh, and validation services.
 * Usage: node agent-token-exchange.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show token stats
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
 * Token Type
 */
const TokenType = {
  ACCESS: 'access',
  REFRESH: 'refresh',
  ID: 'id',
  API: 'api'
};

/**
 * Token Status
 */
const TokenStatus = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  REVOKED: 'revoked',
  SUSPENDED: 'suspended'
};

/**
 * Token
 */
class Token {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.type = config.type || TokenType.ACCESS;
    this.value = config.value || this._generateToken();
    this.subject = config.subject; // User or service ID
    this.issuer = config.issuer || 'default';
    this.audience = config.audience || null;
    this.scopes = config.scopes || [];
    this.status = TokenStatus.ACTIVE;
    this.issuedAt = config.issuedAt || Date.now();
    this.expiresAt = config.expiresAt || (Date.now() + 3600000); // 1 hour default
    this.refreshExpiresAt = config.refreshExpiresAt || (Date.now() + 7 * 24 * 3600000); // 7 days
    this.metadata = config.metadata || {};
  }

  _generateToken() {
    return crypto.randomBytes(32).toString('hex');
  }

  isExpired() {
    return Date.now() > this.expiresAt;
  }

  isRefreshExpired() {
    return Date.now() > this.refreshExpiresAt;
  }

  revoke() {
    this.status = TokenStatus.REVOKED;
  }

  validate() {
    if (this.status === TokenStatus.REVOKED) {
      return { valid: false, reason: 'Token revoked' };
    }

    if (this.isExpired()) {
      this.status = TokenStatus.EXPIRED;
      return { valid: false, reason: 'Token expired' };
    }

    return { valid: true };
  }

  hasScope(scope) {
    return this.scopes.includes(scope) || this.scopes.includes('*');
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      subject: this.subject,
      issuer: this.issuer,
      audience: this.audience,
      scopes: this.scopes,
      status: this.status,
      issuedAt: this.issuedAt,
      expiresAt: this.expiresAt,
      isExpired: this.isExpired()
    };
  }
}

/**
 * Token Pair
 */
class TokenPair {
  constructor(config) {
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.tokenType = config.tokenType || 'Bearer';
    this.expiresIn = config.expiresIn || 3600;
    this.issuedAt = Date.now();
  }

  toJSON() {
    return {
      accessToken: this.accessToken.value,
      refreshToken: this.refreshToken?.value,
      tokenType: this.tokenType,
      expiresIn: this.expiresIn,
      issuedAt: this.issuedAt
    };
  }
}

/**
 * Token Grant
 */
class TokenGrant {
  constructor(config) {
    this.grantType = config.grantType; // authorization_code, client_credentials, refresh_token
    this.clientId = config.clientId;
    this.scope = config.scope || '';
    this.redirectUri = config.redirectUri || null;
    this.code = config.code || null;
    this.refreshTokenValue = config.refreshTokenValue || null;
  }

  validate() {
    if (!this.clientId) {
      return { valid: false, reason: 'Missing client_id' };
    }
    return { valid: true };
  }
}

/**
 * Token Manager
 */
class TokenManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.tokens = new Map();
    this.refreshTokens = new Map();
    this.clients = new Map();
    this.stats = {
      tokensIssued: 0,
      tokensRefreshed: 0,
      tokensRevoked: 0,
      tokensExpired: 0
    };

    this._init();
  }

  _init() {
    ensureDataDir();
  }

  createToken(config) {
    const token = new Token(config);
    this.tokens.set(token.id, token);

    if (token.type === TokenType.REFRESH) {
      this.refreshTokens.set(token.value, token);
    }

    this.stats.tokensIssued++;
    return token;
  }

  createTokenPair(config) {
    // Create access token
    const accessToken = this.createToken({
      type: TokenType.ACCESS,
      subject: config.subject,
      issuer: config.issuer,
      audience: config.audience,
      scopes: config.scopes,
      expiresAt: Date.now() + (config.accessTokenExpiresIn || 3600000)
    });

    // Create refresh token if requested
    let refreshToken = null;
    if (config.withRefreshToken) {
      refreshToken = this.createToken({
        type: TokenType.REFRESH,
        subject: config.subject,
        issuer: config.issuer,
        expiresAt: Date.now() + (config.refreshTokenExpiresIn || 7 * 24 * 3600000)
      });
    }

    return new TokenPair({
      accessToken,
      refreshToken,
      expiresIn: (config.accessTokenExpiresIn || 3600000) / 1000
    });
  }

  getToken(tokenId) {
    return this.tokens.get(tokenId);
  }

  getTokenByValue(tokenValue) {
    for (const token of this.tokens.values()) {
      if (token.value === tokenValue) {
        return token;
      }
    }
    return null;
  }

  validateToken(tokenValue, options = {}) {
    const token = this.getTokenByValue(tokenValue);
    if (!token) {
      return { valid: false, reason: 'Token not found' };
    }

    const result = token.validate();
    if (!result.valid) {
      if (token.isExpired()) {
        this.stats.tokensExpired++;
      }
      return result;
    }

    // Check audience
    if (options.audience && token.audience !== options.audience) {
      return { valid: false, reason: 'Invalid audience' };
    }

    // Check scope
    if (options.requiredScope && !token.hasScope(options.requiredScope)) {
      return { valid: false, reason: 'Insufficient scope' };
    }

    return { valid: true, token };
  }

  refresh(refreshTokenValue) {
    const refreshToken = this.refreshTokens.get(refreshTokenValue);
    if (!refreshToken) {
      return { error: 'Invalid refresh token' };
    }

    if (refreshToken.isRefreshExpired()) {
      return { error: 'Refresh token expired' };
    }

    const validation = refreshToken.validate();
    if (!validation.valid) {
      return validation;
    }

    // Create new token pair
    const newPair = this.createTokenPair({
      subject: refreshToken.subject,
      issuer: refreshToken.issuer,
      scopes: refreshToken.scopes,
      withRefreshToken: false // Don't issue new refresh token on refresh
    });

    this.stats.tokensRefreshed++;
    return newPair;
  }

  revokeToken(tokenValue) {
    const token = this.getTokenByValue(tokenValue);
    if (token) {
      token.revoke();
      this.stats.tokensRevoked++;
      return true;
    }
    return false;
  }

  revokeAllTokensForSubject(subject) {
    let count = 0;
    for (const token of this.tokens.values()) {
      if (token.subject === subject && token.status === TokenStatus.ACTIVE) {
        token.revoke();
        count++;
      }
    }
    this.stats.tokensRevoked += count;
    return count;
  }

  cleanupExpired() {
    let count = 0;
    for (const [id, token] of this.tokens) {
      if (token.isExpired() || token.isRefreshExpired()) {
        this.tokens.delete(id);
        if (token.type === TokenType.REFRESH) {
          this.refreshTokens.delete(token.value);
        }
        count++;
      }
    }
    return count;
  }

  getStats() {
    return {
      ...this.stats,
      totalTokens: this.tokens.size,
      activeTokens: Array.from(this.tokens.values()).filter(t => t.status === TokenStatus.ACTIVE).length,
      refreshTokens: this.refreshTokens.size
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Token Exchange Demo\n');

  const manager = new TokenManager();

  // Create token pair
  console.log('1. Creating Token Pair:');
  const tokenPair = manager.createTokenPair({
    subject: 'user-123',
    issuer: 'auth-server',
    audience: 'api-server',
    scopes: ['read', 'write', 'admin'],
    accessTokenExpiresIn: 3600000, // 1 hour
    refreshTokenExpiresIn: 7 * 24 * 3600000, // 7 days
    withRefreshToken: true
  });
  console.log(`   Access Token: ${tokenPair.accessToken.value.substring(0, 20)}...`);
  console.log(`   Refresh Token: ${tokenPair.refreshToken?.value.substring(0, 20)}...`);
  console.log(`   Expires In: ${tokenPair.expiresIn}s`);

  // Validate token
  console.log('\n2. Validating Token:');
  const validation1 = manager.validateToken(tokenPair.accessToken.value);
  console.log(`   Valid: ${validation1.valid}`);

  // Validate with scope
  console.log('\n3. Validating With Scope:');
  const validation2 = manager.validateToken(tokenPair.accessToken.value, { requiredScope: 'admin' });
  console.log(`   Has admin scope: ${validation2.valid}`);

  const validation3 = manager.validateToken(tokenPair.accessToken.value, { requiredScope: 'delete' });
  console.log(`   Has delete scope: ${validation3.valid}`);

  // Refresh token
  console.log('\n4. Refreshing Token:');
  const refreshed = manager.refresh(tokenPair.refreshToken.value);
  if (refreshed.accessToken) {
    console.log(`   New Access Token: ${refreshed.accessToken.value.substring(0, 20)}...`);
    console.log(`   Success: true`);
  } else {
    console.log(`   Error: ${refreshed.error}`);
  }

  // Revoke token
  console.log('\n5. Revoking Token:');
  const revoked = manager.revokeToken(tokenPair.accessToken.value);
  console.log(`   Revoked: ${revoked}`);

  // Validate revoked token
  console.log('\n6. Validating Revoked Token:');
  const validation4 = manager.validateToken(tokenPair.accessToken.value);
  console.log(`   Valid: ${validation4.valid}, Reason: ${validation4.reason}`);

  // Stats
  console.log('\n7. Statistics:');
  const stats = manager.getStats();
  console.log(`   Tokens Issued: ${stats.tokensIssued}`);
  console.log(`   Tokens Refreshed: ${stats.tokensRefreshed}`);
  console.log(`   Tokens Revoked: ${stats.tokensRevoked}`);
  console.log(`   Tokens Expired: ${stats.tokensExpired}`);
  console.log(`   Total Tokens: ${stats.totalTokens}`);
  console.log(`   Active Tokens: ${stats.activeTokens}`);

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new TokenManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Token Exchange Module');
  console.log('Usage: node agent-token-exchange.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
