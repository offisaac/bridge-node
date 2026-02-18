/**
 * Agent VPN Connector Manager
 * Manages VPN connections for agents
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentVPNConnector {
  constructor(options = {}) {
    this.connections = new Map();
    this.profiles = new Map();
    this.tunnels = new Map();
    this.routes = new Map();
    this.certificates = new Map();

    this.config = {
      defaultProtocol: options.defaultProtocol || 'wireguard',
      defaultPort: options.defaultPort || 51820,
      maxTunnels: options.maxTunnels || 100,
      enableSplitTunnel: options.enableSplitTunnel !== false,
      keepAliveInterval: options.keepAliveInterval || 30
    };

    this.stats = {
      activeTunnels: 0,
      totalConnections: 0,
      bytesTransferred: 0,
      failedConnections: 0
    };

    // Initialize default profiles
    this._initDefaultProfiles();
  }

  _initDefaultProfiles() {
    // Corporate VPN profile
    this.createProfile({
      name: 'corporate',
      protocol: 'wireguard',
      server: 'vpn.corporate.internal',
      port: 51820,
      dns: ['10.0.0.53', '10.0.0.54'],
      splitTunnel: true,
      allowedApps: ['*']
    });

    // Split tunnel profile
    this.createProfile({
      name: 'split-tunnel',
      protocol: 'openvpn',
      server: 'vpn-split.corporate.internal',
      port: 1194,
      dns: ['10.0.0.53'],
      splitTunnel: true,
      allowedApps: ['browser', 'mail', 'slack']
    });

    // Full tunnel profile
    this.createProfile({
      name: 'full-tunnel',
      protocol: 'ipsec',
      server: 'vpn-full.corporate.internal',
      port: 500,
      dns: ['10.0.0.53'],
      splitTunnel: false,
      allowedApps: []
    });
  }

  createProfile(profileConfig) {
    const { name, protocol, server, port, dns, splitTunnel, allowedApps } = profileConfig;

    const profile = {
      id: `profile-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      protocol: protocol || this.config.defaultProtocol,
      server: server || 'vpn.example.com',
      port: port || this.config.defaultPort,
      dns: dns || ['10.0.0.53'],
      splitTunnel: splitTunnel !== false,
      allowedApps: allowedApps || [],
      mtu: profileConfig.mtu || 1420,
      persistentKeepalive: profileConfig.persistentKeepalive || this.config.keepAliveInterval,
      createdAt: new Date().toISOString()
    };

    this.profiles.set(profile.id, profile);
    console.log(`VPN Profile created: ${profile.id} (${name}) - ${protocol}://${server}:${port}`);
    return profile;
  }

  deleteProfile(profileId) {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    this.profiles.delete(profileId);
    console.log(`VPN Profile deleted: ${profileId}`);
    return { success: true, profileId };
  }

  connect(agentId, profileId) {
    const profile = this.profiles.get(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const connection = {
      id: `conn-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      agentId,
      profileId,
      profileName: profile.name,
      protocol: profile.protocol,
      server: profile.server,
      port: profile.port,
      status: 'connecting',
      localIp: null,
      remoteIp: null,
      dns: profile.dns,
      splitTunnel: profile.splitTunnel,
      connectedAt: null,
      lastHeartbeat: null,
      bytesSent: 0,
      bytesReceived: 0,
      createdAt: new Date().toISOString()
    };

    // Simulate connection establishment
    connection.status = 'connected';
    connection.localIp = this._generateLocalIp();
    connection.remoteIp = profile.server;
    connection.connectedAt = new Date().toISOString();
    connection.lastHeartbeat = new Date().toISOString();

    this.connections.set(connection.id, connection);
    this.stats.activeTunnels++;
    this.stats.totalConnections++;

    console.log(`Agent ${agentId} connected via VPN: ${connection.id} (${profile.name})`);
    return connection;
  }

  disconnect(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    connection.status = 'disconnected';
    connection.disconnectedAt = new Date().toISOString();
    this.stats.activeTunnels--;

    console.log(`VPN connection disconnected: ${connectionId}`);
    return { success: true, connectionId };
  }

  createTunnel(tunnelConfig) {
    const { name, connectionId, localSubnet, remoteSubnet, gateway, mtu } = tunnelConfig;

    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    const tunnel = {
      id: `tunnel-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      connectionId,
      localSubnet: localSubnet || '10.8.0.0/24',
      remoteSubnet: remoteSubnet || '10.0.0.0/16',
      gateway: gateway || connection.localIp,
      mtu: mtu || 1420,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    this.tunnels.set(tunnel.id, tunnel);

    // Add routes
    this.addRoute({
      tunnelId: tunnel.id,
      destination: remoteSubnet,
      gateway: tunnel.gateway,
      metric: 100
    });

    console.log(`VPN Tunnel created: ${tunnel.id} (${name})`);
    return tunnel;
  }

  addRoute(routeConfig) {
    const { tunnelId, destination, gateway, metric } = routeConfig;

    const route = {
      id: `route-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      tunnelId,
      destination: destination || '0.0.0.0/0',
      gateway: gateway || '0.0.0.0',
      metric: metric || 100,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    this.routes.set(route.id, route);
    console.log(`VPN Route created: ${route.id} -> ${destination}`);
    return route;
  }

  generateCertificate(certConfig) {
    const { agentId, commonName, validityDays, keyType } = certConfig;

    const certificate = {
      id: `cert-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      agentId,
      commonName: commonName || agentId,
      keyType: keyType || 'ed25519',
      validityDays: validityDays || 365,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (validityDays || 365) * 24 * 60 * 60 * 1000).toISOString(),
      status: 'valid',
      serialNumber: crypto.randomBytes(16).toString('hex')
    };

    this.certificates.set(certificate.id, certificate);
    console.log(`VPN Certificate generated: ${certificate.id} (${commonName})`);
    return certificate;
  }

  revokeCertificate(certId) {
    const certificate = this.certificates.get(certId);
    if (!certificate) {
      throw new Error(`Certificate not found: ${certId}`);
    }

    certificate.status = 'revoked';
    certificate.revokedAt = new Date().toISOString();
    console.log(`Certificate revoked: ${certId}`);
    return { success: true, certId };
  }

  getConnectionStatus(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      throw new Error(`Connection not found: ${connectionId}`);
    }

    // Simulate updating stats
    connection.bytesSent += Math.floor(Math.random() * 1000);
    connection.bytesReceived += Math.floor(Math.random() * 5000);
    connection.lastHeartbeat = new Date().toISOString();

    return {
      id: connection.id,
      agentId: connection.agentId,
      profileName: connection.profileName,
      status: connection.status,
      localIp: connection.localIp,
      remoteIp: connection.remoteIp,
      connectedAt: connection.connectedAt,
      uptime: connection.connectedAt ?
        Math.floor((Date.now() - new Date(connection.connectedAt).getTime()) / 1000) : 0,
      bytesSent: connection.bytesSent,
      bytesReceived: connection.bytesReceived
    };
  }

  listConnections() {
    return Array.from(this.connections.values()).map(c => ({
      id: c.id,
      agentId: c.agentId,
      profileName: c.profileName,
      status: c.status,
      localIp: c.localIp,
      connectedAt: c.connectedAt
    }));
  }

  listProfiles() {
    return Array.from(this.profiles.values()).map(p => ({
      id: p.id,
      name: p.name,
      protocol: p.protocol,
      server: p.server,
      port: p.port,
      splitTunnel: p.splitTunnel
    }));
  }

  getStatistics() {
    return {
      tunnels: {
        active: this.stats.activeTunnels,
        total: this.tunnels.size
      },
      connections: {
        total: this.stats.totalConnections,
        active: Array.from(this.connections.values()).filter(c => c.status === 'connected').length,
        failed: this.stats.failedConnections
      },
      certificates: {
        valid: Array.from(this.certificates.values()).filter(c => c.status === 'valid').length,
        revoked: Array.from(this.certificates.values()).filter(c => c.status === 'revoked').length
      },
      traffic: {
        bytesTransferred: this.stats.bytesTransferred
      }
    };
  }

  _generateLocalIp() {
    // Generate a local IP from the 10.8.0.0/24 range
    const lastOctet = Math.floor(Math.random() * 254) + 1;
    return `10.8.0.${lastOctet}`;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const vpn = new AgentVPNConnector({
    defaultProtocol: 'wireguard',
    maxTunnels: 100
  });

  switch (command) {
    case 'create-profile':
      const profile = vpn.createProfile({
        name: args[1] || 'custom-profile',
        protocol: args[2] || 'wireguard',
        server: args[3] || 'vpn.example.com'
      });
      console.log('Profile created:', profile.id);
      break;

    case 'connect':
      const connection = vpn.connect(args[1], args[2]);
      console.log('Connected:', connection.id);
      break;

    case 'disconnect':
      const result = vpn.disconnect(args[1]);
      console.log('Disconnected:', result);
      break;

    case 'list-profiles':
      const profiles = vpn.listProfiles();
      console.log('VPN Profiles:');
      profiles.forEach(p => console.log(`  - ${p.name}: ${p.protocol}://${p.server}:${p.port}`));
      break;

    case 'list-connections':
      const conns = vpn.listConnections();
      console.log('Active Connections:');
      conns.forEach(c => console.log(`  - ${c.agentId}: ${c.profileName} (${c.status})`));
      break;

    case 'status':
      const status = vpn.getConnectionStatus(args[1]);
      console.log('Connection Status:', status);
      break;

    case 'stats':
      const vpnStats = vpn.getStatistics();
      console.log('VPN Statistics:', vpnStats);
      break;

    case 'demo':
      console.log('=== Agent VPN Connector Demo ===\n');

      // List profiles
      console.log('1. VPN Profiles:');
      const profileList = vpn.listProfiles();
      profileList.forEach(p => {
        console.log(`   - ${p.name}: ${p.protocol}://${p.server}:${p.port} (split: ${p.splitTunnel})`);
      });

      // Connect agents
      console.log('\n2. Connecting Agents:');
      const conn1 = vpn.connect('agent-001', profileList[0].id);
      console.log(`   Agent agent-001 connected: ${conn1.id} (${conn1.profileName})`);
      console.log(`   Local IP: ${conn1.localIp}`);

      const conn2 = vpn.connect('agent-002', profileList[1].id);
      console.log(`   Agent agent-002 connected: ${conn2.id} (${conn2.profileName})`);
      console.log(`   Local IP: ${conn2.localIp}`);

      // Create tunnels
      console.log('\n3. Creating Tunnels:');
      const tunnel1 = vpn.createTunnel({
        name: 'corp-tunnel',
        connectionId: conn1.id,
        localSubnet: '10.8.0.0/24',
        remoteSubnet: '10.0.0.0/16'
      });
      console.log(`   Created: ${tunnel1.name} (${tunnel1.localSubnet} -> ${tunnel1.remoteSubnet})`);

      const tunnel2 = vpn.createTunnel({
        name: 'split-tunnel',
        connectionId: conn2.id,
        localSubnet: '10.8.1.0/24',
        remoteSubnet: '192.168.1.0/24'
      });
      console.log(`   Created: ${tunnel2.name} (${tunnel2.localSubnet} -> ${tunnel2.remoteSubnet})`);

      // Generate certificates
      console.log('\n4. Generating Certificates:');
      const cert1 = vpn.generateCertificate({
        agentId: 'agent-001',
        commonName: 'agent-001@corporate.vpn',
        validityDays: 365
      });
      console.log(`   Certificate: ${cert1.commonName}`);
      console.log(`   Expires: ${cert1.expiresAt}`);

      const cert2 = vpn.generateCertificate({
        agentId: 'agent-002',
        commonName: 'agent-002@corporate.vpn',
        validityDays: 180
      });
      console.log(`   Certificate: ${cert2.commonName}`);

      // List connections
      console.log('\n5. Active Connections:');
      const connections = vpn.listConnections();
      connections.forEach(c => {
        const status = vpn.getConnectionStatus(c.id);
        console.log(`   - ${c.agentId}: ${c.profileName} (${c.status})`);
        console.log(`     IP: ${status.localIp}, Uptime: ${status.uptime}s`);
      });

      // Get statistics
      console.log('\n6. Statistics:');
      const stats = vpn.getStatistics();
      console.log(`   Active Tunnels: ${stats.tunnels.active}`);
      console.log(`   Total Connections: ${stats.connections.total}`);
      console.log(`   Valid Certificates: ${stats.certificates.valid}`);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-vpn-connector.js <command> [args]');
      console.log('\nCommands:');
      console.log('  create-profile [name] [protocol] [server]  Create VPN profile');
      console.log('  connect <agentId> <profileId>             Connect agent to VPN');
      console.log('  disconnect <connectionId>                Disconnect VPN');
      console.log('  list-profiles                            List VPN profiles');
      console.log('  list-connections                         List active connections');
      console.log('  status <connectionId>                    Get connection status');
      console.log('  stats                                    Get VPN statistics');
      console.log('  demo                                     Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentVPNConnector;
