/**
 * Agent Network Monitor
 * Monitors network traffic, performance, and health for agents
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentNetworkMonitor {
  constructor(options = {}) {
    this.agents = new Map();
    this.interfaces = new Map();
    this.trafficData = new Map();
    this.alerts = new Map();
    this.thresholds = new Map();

    this.config = {
      pollingInterval: options.pollingInterval || 5000,
      retentionPeriod: options.retentionPeriod || 3600, // 1 hour
      enablePacketCapture: options.enablePacketCapture !== false,
      maxInterfaces: options.maxInterfaces || 100
    };

    this.stats = {
      totalPackets: 0,
      totalBytes: 0,
      alertsGenerated: 0,
      packetsDropped: 0
    };

    // Initialize default interfaces
    this._initDefaultInterfaces();

    // Set up default thresholds
    this._initDefaultThresholds();
  }

  _initDefaultInterfaces() {
    const defaultInterfaces = [
      { name: 'eth0', type: 'ethernet', ip: '192.168.1.10', mac: '00:11:22:33:44:55', status: 'up' },
      { name: 'wlan0', type: 'wifi', ip: '192.168.1.11', mac: '00:11:22:33:44:56', status: 'up' },
      { name: 'lo', type: 'loopback', ip: '127.0.0.1', mac: '00:00:00:00:00:00', status: 'up' }
    ];

    defaultInterfaces.forEach(iface => {
      this.createInterface(iface);
    });
  }

  _initDefaultThresholds() {
    this.setThreshold('cpu', 80, 'percent');
    this.setThreshold('memory', 85, 'percent');
    this.setThreshold('disk', 90, 'percent');
    this.setThreshold('latency', 100, 'ms');
    this.setThreshold('packetLoss', 5, 'percent');
    this.setThreshold('bandwidth', 80, 'percent');
  }

  createInterface(interfaceConfig) {
    const { name, type, ip, mac } = interfaceConfig;

    const iface = {
      id: `iface-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      type: type || 'ethernet',
      ip: ip || '0.0.0.0',
      mac: mac || '00:00:00:00:00:00',
      status: 'down',
      speed: interfaceConfig.speed || 1000, // Mbps
      mtu: interfaceConfig.mtu || 1500,
      stats: {
        rxBytes: 0,
        txBytes: 0,
        rxPackets: 0,
        txPackets: 0,
        rxErrors: 0,
        txErrors: 0,
        rxDropped: 0,
        txDropped: 0
      },
      createdAt: new Date().toISOString()
    };

    this.interfaces.set(iface.id, iface);
    console.log(`Network interface created: ${iface.name} (${iface.type}) - ${iface.ip}`);
    return iface;
  }

  setThreshold(metric, value, unit) {
    const threshold = {
      id: `threshold-${metric}`,
      metric,
      value,
      unit,
      enabled: true,
      createdAt: new Date().toISOString()
    };

    this.thresholds.set(metric, threshold);
    console.log(`Threshold set: ${metric} > ${value}${unit}`);
    return threshold;
  }

  registerAgent(agentConfig) {
    const { id, name, interfaceId, ip } = agentConfig;

    const agent = {
      id: id || `agent-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      interfaceId,
      ip: ip || '0.0.0.0',
      status: 'online',
      metrics: {
        cpu: 0,
        memory: 0,
        disk: 0,
        latency: 0,
        packetLoss: 0,
        bandwidth: 0,
        connections: 0,
        throughput: 0
      },
      lastUpdate: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    this.agents.set(agent.id, agent);
    console.log(`Agent registered for monitoring: ${agent.name} (${agent.id})`);
    return agent;
  }

  updateMetrics(agentId, metrics) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Update metrics
    agent.metrics = { ...agent.metrics, ...metrics };
    agent.lastUpdate = new Date().toISOString();

    // Check thresholds
    this._checkThresholds(agent);

    // Record traffic data
    this._recordTrafficData(agentId, metrics);

    return agent;
  }

  _checkThresholds(agent) {
    for (const [metric, threshold] of this.thresholds) {
      if (!threshold.enabled) continue;

      const value = agent.metrics[metric];
      if (value === undefined) continue;

      let exceeded = false;
      if (metric === 'cpu' || metric === 'memory' || metric === 'disk' || metric === 'bandwidth') {
        exceeded = value > threshold.value;
      } else if (metric === 'latency' || metric === 'packetLoss') {
        exceeded = value > threshold.value;
      }

      if (exceeded) {
        this._createAlert(agent, metric, value, threshold);
      }
    }
  }

  _createAlert(agent, metric, value, threshold) {
    const alert = {
      id: `alert-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      agentId: agent.id,
      agentName: agent.name,
      type: 'threshold_exceeded',
      severity: value > threshold.value * 1.2 ? 'critical' : 'warning',
      metric,
      value,
      threshold: threshold.value,
      message: `${metric} at ${value}${threshold.unit} exceeds threshold of ${threshold.value}${threshold.unit}`,
      status: 'active',
      createdAt: new Date().toISOString()
    };

    this.alerts.set(alert.id, alert);
    this.stats.alertsGenerated++;

    console.log(`[${alert.severity.toUpperCase()}] ${alert.message}`);
    return alert;
  }

  _recordTrafficData(agentId, metrics) {
    const dataPoint = {
      timestamp: new Date().toISOString(),
      throughput: metrics.throughput || 0,
      bandwidth: metrics.bandwidth || 0,
      latency: metrics.latency || 0,
      packetLoss: metrics.packetLoss || 0,
      connections: metrics.connections || 0
    };

    if (!this.trafficData.has(agentId)) {
      this.trafficData.set(agentId, []);
    }

    const data = this.trafficData.get(agentId);
    data.push(dataPoint);

    // Clean old data
    const cutoff = Date.now() - (this.config.retentionPeriod * 1000);
    this.trafficData.set(agentId, data.filter(d => new Date(d.timestamp).getTime() > cutoff));

    // Update stats
    this.stats.totalBytes += dataPoint.throughput;
    this.stats.totalPackets += metrics.packets || 0;
  }

  getInterface(interfaceId) {
    const iface = this.interfaces.get(interfaceId);
    if (!iface) {
      throw new Error(`Interface not found: ${interfaceId}`);
    }
    return iface;
  }

  listInterfaces() {
    return Array.from(this.interfaces.values()).map(i => ({
      id: i.id,
      name: i.name,
      type: i.type,
      ip: i.ip,
      status: i.status,
      speed: i.speed
    }));
  }

  listAgents() {
    return Array.from(this.agents.values()).map(a => ({
      id: a.id,
      name: a.name,
      ip: a.ip,
      status: a.status,
      cpu: a.metrics.cpu,
      memory: a.metrics.memory,
      latency: a.metrics.latency,
      lastUpdate: a.lastUpdate
    }));
  }

  getAgentMetrics(agentId) {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return {
      agentId: agent.id,
      name: agent.name,
      metrics: agent.metrics,
      lastUpdate: agent.lastUpdate
    };
  }

  getTrafficHistory(agentId, duration = 300) {
    const data = this.trafficData.get(agentId) || [];
    const cutoff = Date.now() - (duration * 1000);

    return data.filter(d => new Date(d.timestamp).getTime() > cutoff);
  }

  listAlerts(status) {
    const alerts = Array.from(this.alerts.values());
    if (status) {
      return alerts.filter(a => a.status === status);
    }
    return alerts;
  }

  acknowledgeAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    alert.status = 'acknowledged';
    alert.acknowledgedAt = new Date().toISOString();
    console.log(`Alert acknowledged: ${alertId}`);
    return alert;
  }

  getStatistics() {
    return {
      agents: {
        total: this.agents.size,
        online: Array.from(this.agents.values()).filter(a => a.status === 'online').length,
        offline: Array.from(this.agents.values()).filter(a => a.status === 'offline').length
      },
      interfaces: {
        total: this.interfaces.size,
        up: Array.from(this.interfaces.values()).filter(i => i.status === 'up').length,
        down: Array.from(this.interfaces.values()).filter(i => i.status === 'down').length
      },
      alerts: {
        total: this.alerts.size,
        active: Array.from(this.alerts.values()).filter(a => a.status === 'active').length,
        acknowledged: Array.from(this.alerts.values()).filter(a => a.status === 'acknowledged').length
      },
      traffic: {
        totalBytes: this.stats.totalBytes,
        totalPackets: this.stats.totalPackets,
        alertsGenerated: this.stats.alertsGenerated
      }
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const monitor = new AgentNetworkMonitor({
    pollingInterval: 5000,
    retentionPeriod: 3600
  });

  switch (command) {
    case 'list-interfaces':
      const ifaces = monitor.listInterfaces();
      console.log('Network Interfaces:');
      ifaces.forEach(i => console.log(`  - ${i.name}: ${i.type} (${i.ip}) [${i.status}]`));
      break;

    case 'register-agent':
      const agent = monitor.registerAgent({
        name: args[1] || 'test-agent',
        ip: args[2] || '192.168.1.100'
      });
      console.log('Agent registered:', agent.id);
      break;

    case 'update-metrics':
      const agentId = args[1];
      const metrics = {
        cpu: parseFloat(args[2]) || 50,
        memory: parseFloat(args[3]) || 60,
        latency: parseFloat(args[4]) || 10,
        throughput: parseFloat(args[5]) || 1000
      };
      monitor.updateMetrics(agentId, metrics);
      console.log('Metrics updated:', metrics);
      break;

    case 'list-agents':
      const agents = monitor.listAgents();
      console.log('Monitored Agents:');
      agents.forEach(a => console.log(`  - ${a.name}: ${a.ip} [${a.status}] CPU: ${a.cpu}%`));
      break;

    case 'list-alerts':
      const alerts = monitor.listAlerts();
      console.log('Alerts:');
      alerts.forEach(a => console.log(`  - [${a.severity}] ${a.message}`));
      break;

    case 'set-threshold':
      monitor.setThreshold(args[1], parseFloat(args[2]), args[3] || 'percent');
      break;

    case 'stats':
      const netStats = monitor.getStatistics();
      console.log('Network Monitor Statistics:', netStats);
      break;

    case 'demo':
      console.log('=== Agent Network Monitor Demo ===\n');

      // List interfaces
      console.log('1. Network Interfaces:');
      const interfaceList = monitor.listInterfaces();
      interfaceList.forEach(i => {
        console.log(`   - ${i.name}: ${i.type} (${i.ip}) [${i.status}] ${i.speed}Mbps`);
      });

      // Register agents
      console.log('\n2. Registering Agents:');
      const agent1 = monitor.registerAgent({
        name: 'web-server-01',
        ip: '192.168.1.101'
      });
      console.log(`   Registered: ${agent1.name} (${agent1.ip})`);

      const agent2 = monitor.registerAgent({
        name: 'app-server-01',
        ip: '192.168.1.102'
      });
      console.log(`   Registered: ${agent2.name} (${agent2.ip})`);

      const agent3 = monitor.registerAgent({
        name: 'db-server-01',
        ip: '192.168.1.103'
      });
      console.log(`   Registered: ${agent3.name} (${agent3.ip})`);

      // Simulate metrics updates
      console.log('\n3. Updating Metrics:');

      // Normal metrics
      monitor.updateMetrics(agent1.id, {
        cpu: 45,
        memory: 62,
        disk: 55,
        latency: 12,
        packetLoss: 0.1,
        bandwidth: 35,
        connections: 150,
        throughput: 50000000
      });
      console.log(`   ${agent1.name}: CPU 45%, Memory 62%, Latency 12ms`);

      // High CPU warning
      monitor.updateMetrics(agent2.id, {
        cpu: 85,
        memory: 78,
        disk: 60,
        latency: 25,
        packetLoss: 0.5,
        bandwidth: 72,
        connections: 320,
        throughput: 120000000
      });
      console.log(`   ${agent2.name}: CPU 85%, Memory 78%, Latency 25ms`);

      // Critical metrics
      monitor.updateMetrics(agent3.id, {
        cpu: 95,
        memory: 92,
        disk: 88,
        latency: 150,
        packetLoss: 8,
        bandwidth: 95,
        connections: 500,
        throughput: 250000000
      });
      console.log(`   ${agent3.name}: CPU 95%, Memory 92%, Latency 150ms`);

      // List alerts
      console.log('\n4. Active Alerts:');
      const activeAlerts = monitor.listAlerts('active');
      activeAlerts.forEach(a => {
        console.log(`   [${a.severity.toUpperCase()}] ${a.message}`);
      });

      // List agents with status
      console.log('\n5. Agent Status:');
      const agentList = monitor.listAgents();
      agentList.forEach(a => {
        console.log(`   - ${a.name}: ${a.status}`);
        console.log(`     CPU: ${a.cpu}%, Memory: ${a.memory}%, Latency: ${a.latency}ms`);
      });

      // Get statistics
      console.log('\n6. Statistics:');
      const stats = monitor.getStatistics();
      console.log(`   Agents: ${stats.agents.total} total (${stats.agents.online} online)`);
      console.log(`   Interfaces: ${stats.interfaces.total} (${stats.interfaces.up} up)`);
      console.log(`   Alerts: ${stats.alerts.total} (${stats.alerts.active} active)`);
      console.log(`   Traffic: ${(stats.traffic.totalBytes / 1000000).toFixed(2)} MB`);

      // Show traffic history
      console.log('\n7. Traffic History (agent-1):');
      const history = monitor.getTrafficHistory(agent1.id, 60);
      console.log(`   Data points: ${history.length}`);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-net-monitor.js <command> [args]');
      console.log('\nCommands:');
      console.log('  list-interfaces              List network interfaces');
      console.log('  register-agent [name] [ip]   Register agent for monitoring');
      console.log('  update-metrics <id> [args]  Update agent metrics');
      console.log('  list-agents                  List monitored agents');
      console.log('  list-alerts                  List alerts');
      console.log('  set-threshold <metric> <val> Set threshold');
      console.log('  stats                        Get statistics');
      console.log('  demo                         Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentNetworkMonitor;
