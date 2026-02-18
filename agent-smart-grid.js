/**
 * Agent Smart Grid - Smart Grid Management Agent
 *
 * Manages smart grid infrastructure, grid monitoring, and distribution.
 *
 * Usage: node agent-smart-grid.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   node    - List grid nodes
 *   list    - List all grid data
 */

let gridIdCounter = 0;
class GridNode {
  constructor(config) {
    this.id = `node-${Date.now()}-${++gridIdCounter}`;
    this.name = config.name;
    this.type = config.type; // substation, transformer, switch, meter
    this.location = config.location;
    this.capacity = config.capacity || 0;
    this.load = config.load || 0;
    this.status = 'online'; // online, offline, warning, error
    this.voltage = config.voltage || 0;
  }

  updateLoad(load) {
    this.load = load;
    if (load > this.capacity * 0.9) {
      this.status = 'warning';
    } else if (load > this.capacity) {
      this.status = 'error';
    } else {
      this.status = 'online';
    }
  }
}

let gridZoneIdCounter = 0;
class GridZone {
  constructor(config) {
    this.id = `zone-${Date.now()}-${++gridZoneIdCounter}`;
    this.name = config.name;
    this.nodes = [];
    this.totalCapacity = 0;
    this.totalLoad = 0;
  }

  addNode(node) {
    this.nodes.push(node);
    this.totalCapacity += node.capacity;
    this.totalLoad += node.load;
  }

  getLoadPercentage() {
    if (this.totalCapacity === 0) return 0;
    return (this.totalLoad / this.totalCapacity * 100).toFixed(2);
  }
}

let outageIdCounter = 0;
class PowerOutage {
  constructor(config) {
    this.id = `outage-${Date.now()}-${++outageIdCounter}`;
    this.affectedNodes = config.affectedNodes || [];
    this.startTime = Date.now();
    this.endTime = null;
    this.status = 'active'; // active, resolved
    this.cause = config.cause || 'unknown';
  }

  resolve() {
    this.status = 'resolved';
    this.endTime = Date.now();
  }

  getDuration() {
    const end = this.endTime || Date.now();
    return Math.floor((end - this.startTime) / 1000 / 60); // minutes
  }
}

let alertIdCounter = 0;
class GridAlert {
  constructor(config) {
    this.id = `alert-${Date.now()}-${++alertIdCounter}`;
    this.severity = config.severity; // low, medium, high, critical
    this.message = config.message;
    this.nodeId = config.nodeId;
    this.timestamp = Date.now();
    this.acknowledged = false;
  }

  acknowledge() {
    this.acknowledged = true;
  }
}

let lbIdCounter = 0;
class LoadBalancing {
  constructor(config) {
    this.id = `lb-${Date.now()}-${++lbIdCounter}`;
    this.timestamp = Date.now();
    this.actions = [];
  }

  addAction(action) {
    this.actions.push(action);
  }
}

class SmartGridAgent {
  constructor(config = {}) {
    this.nodes = new Map();
    this.zones = new Map();
    this.outages = new Map();
    this.alerts = new Map();
    this.loadBalancing = new Map();
    this.stats = {
      totalNodes: 0,
      onlineNodes: 0,
      totalCapacity: 0,
      alertsGenerated: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo nodes
    const nodes = [
      { name: 'Main Substation', type: 'substation', location: 'Central', capacity: 500, load: 350, voltage: 138 },
      { name: 'Transformer A', type: 'transformer', location: 'North District', capacity: 200, load: 150, voltage: 13.8 },
      { name: 'Transformer B', type: 'transformer', location: 'South District', capacity: 200, load: 180, voltage: 13.8 },
      { name: 'Switch Station 1', type: 'switch', location: 'Industrial Park', capacity: 100, load: 75, voltage: 4.16 },
      { name: 'Smart Meter Array', type: 'meter', location: 'Residential', capacity: 50, load: 35, voltage: 0.24 }
    ];

    nodes.forEach(n => {
      const node = new GridNode(n);
      this.nodes.set(node.id, node);
      this.stats.totalNodes++;
      if (node.status === 'online') this.stats.onlineNodes++;
      this.stats.totalCapacity += node.capacity;
    });
  }

  addNode(config) {
    const node = new GridNode(config);
    this.nodes.set(node.id, node);
    this.stats.totalNodes++;
    if (node.status === 'online') this.stats.onlineNodes++;
    this.stats.totalCapacity += node.capacity;
    console.log(`   Added grid node: ${node.name}`);
    return node;
  }

  updateNodeLoad(nodeId, load) {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return { success: false, reason: 'Node not found' };
    }

    node.updateLoad(load);

    // Check for alerts
    if (node.status === 'warning') {
      const alert = new GridAlert({
        severity: 'medium',
        message: `Node ${node.name} load at ${(node.load / node.capacity * 100).toFixed(1)}%`,
        nodeId: node.id
      });
      this.alerts.set(alert.id, alert);
      this.stats.alertsGenerated++;
    } else if (node.status === 'error') {
      const alert = new GridAlert({
        severity: 'critical',
        message: `Node ${node.name} overloaded!`,
        nodeId: node.id
      });
      this.alerts.set(alert.id, alert);
      this.stats.alertsGenerated++;
    }

    return { success: true, node };
  }

  createOutage(affectedNodes, cause) {
    const outage = new PowerOutage({
      affectedNodes,
      cause
    });

    affectedNodes.forEach(nodeId => {
      const node = this.nodes.get(nodeId);
      if (node) {
        node.status = 'offline';
      }
    });

    this.outages.set(outage.id, outage);
    console.log(`   Outage reported: ${cause}`);
    return outage;
  }

  resolveOutage(outageId) {
    const outage = this.outages.get(outageId);
    if (!outage) {
      return { success: false, reason: 'Outage not found' };
    }

    outage.resolve();

    outage.affectedNodes.forEach(nodeId => {
      const node = this.nodes.get(nodeId);
      if (node) {
        node.status = 'online';
      }
    });

    return { success: true, outage, duration: outage.getDuration() };
  }

  performLoadBalancing() {
    const lb = new LoadBalancing({});
    const nodes = Array.from(this.nodes.values());

    // Find overloaded and underloaded nodes
    const overloaded = nodes.filter(n => n.load / n.capacity > 0.8);
    const underloaded = nodes.filter(n => n.load / n.capacity < 0.5);

    overloaded.forEach(node => {
      lb.addAction({
        from: node.id,
        action: 'reduce',
        amount: Math.floor(node.load * 0.1)
      });
    });

    underloaded.forEach(node => {
      lb.addAction({
        to: node.id,
        action: 'increase',
        amount: Math.floor((node.capacity - node.load) * 0.2)
      });
    });

    this.loadBalancing.set(lb.id, lb);
    return lb;
  }

  getGridHealth() {
    const online = Array.from(this.nodes.values()).filter(n => n.status === 'online').length;
    const total = this.nodes.size;
    return ((online / total) * 100).toFixed(2);
  }

  listNodes(status = null) {
    if (status) {
      return Array.from(this.nodes.values()).filter(n => n.status === status);
    }
    return Array.from(this.nodes.values());
  }

  getAlerts(severity = null) {
    if (severity) {
      return Array.from(this.alerts.values()).filter(a => a.severity === severity);
    }
    return Array.from(this.alerts.values());
  }

  getStats() {
    return {
      ...this.stats,
      gridHealth: this.getGridHealth(),
      activeOutages: Array.from(this.outages.values()).filter(o => o.status === 'active').length,
      totalZones: this.zones.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const smartGrid = new SmartGridAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Smart Grid Demo\n');

    // 1. List Nodes
    console.log('1. Grid Nodes:');
    const nodes = smartGrid.listNodes();
    nodes.forEach(n => {
      const loadPct = (n.load / n.capacity * 100).toFixed(1);
      console.log(`   - ${n.name}: ${loadPct}% load [${n.status}]`);
    });

    // 2. Add Node
    console.log('\n2. Add Grid Node:');
    smartGrid.addNode({
      name: 'Solar Station',
      type: 'substation',
      location: 'East District',
      capacity: 300,
      load: 0,
      voltage: 13.8
    });

    // 3. Update Node Load
    console.log('\n3. Update Node Load:');
    const node = nodes[1];
    smartGrid.updateNodeLoad(node.id, 190);
    console.log(`   ${node.name}: ${node.load}/${node.capacity} (${node.status})`);

    // 4. Check Alerts
    console.log('\n4. System Alerts:');
    const alerts = smartGrid.getAlerts();
    alerts.forEach(a => {
      console.log(`   - [${a.severity}] ${a.message}`);
    });

    // 5. Create Outage
    console.log('\n5. Report Outage:');
    const outage = smartGrid.createOutage([node.id], 'Storm damage');
    console.log(`   Cause: ${outage.cause}`);

    // 6. Resolve Outage
    console.log('\n6. Resolve Outage:');
    const resolved = smartGrid.resolveOutage(outage.id);
    console.log(`   Duration: ${resolved.duration} minutes`);

    // 7. Load Balancing
    console.log('\n7. Load Balancing:');
    const lb = smartGrid.performLoadBalancing();
    console.log(`   Actions: ${lb.actions.length}`);

    // 8. Grid Health
    console.log('\n8. Grid Health:');
    const health = smartGrid.getGridHealth();
    console.log(`   Health: ${health}%`);

    // 9. Node Status
    console.log('\n9. Node Status:');
    const online = smartGrid.listNodes('online').length;
    const warning = smartGrid.listNodes('warning').length;
    console.log(`   Online: ${online}, Warning: ${warning}`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = smartGrid.getStats();
    console.log(`   Total Nodes: ${stats.totalNodes}`);
    console.log(`   Online Nodes: ${stats.onlineNodes}`);
    console.log(`   Total Capacity: ${stats.totalCapacity} kW`);
    console.log(`   Grid Health: ${stats.gridHealth}%`);
    console.log(`   Alerts: ${stats.alertsGenerated}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'node':
    console.log('Grid Nodes:');
    smartGrid.listNodes().forEach(n => {
      console.log(`  ${n.name}: ${n.load}/${n.capacity} [${n.status}]`);
    });
    break;

  case 'list':
    console.log('Smart Grid Data:');
    console.log(`Nodes: ${smartGrid.nodes.size}`);
    console.log(`Outages: ${smartGrid.outages.size}`);
    console.log(`Alerts: ${smartGrid.alerts.size}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-smart-grid.js [demo|node|list]');
}
