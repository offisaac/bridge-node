/**
 * Agent Fault Injection - Fault Injection Testing Module
 *
 * Simulates various failure scenarios to test system resilience.
 *
 * Usage: node agent-fault-injection.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   faults     - List available fault types
 *   inject     - Inject a specific fault
 */

class FaultInjection {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.type = config.type;
    this.target = config.target;
    this.params = config.params || {};
    this.enabled = config.enabled !== false;
    this.duration = config.duration || 60000; // ms
    this.probability = config.probability || 100; // percentage
    this.injections = config.injections || 0;
  }
}

class FaultInjector {
  constructor() {
    this.faults = new Map();
    this.injectionHistory = [];
    this.activeInfections = [];
    this.faultTypes = this._initFaultTypes();
    this._initSampleData();
  }

  _initFaultTypes() {
    return {
      latency: {
        name: 'Latency Injection',
        description: 'Add artificial delay to requests',
        params: {
          delay: { type: 'number', default: 5000, description: 'Delay in ms' },
          variance: { type: 'number', default: 1000, description: 'Delay variance' }
        }
      },
      error: {
        name: 'Error Injection',
        description: 'Return errors for requests',
        params: {
          code: { type: 'number', default: 500, description: 'HTTP error code' },
          message: { type: 'string', default: 'Internal Server Error', description: 'Error message' }
        }
      },
      timeout: {
        name: 'Timeout Injection',
        description: 'Cause requests to timeout',
        params: {
          duration: { type: 'number', default: 30000, description: 'Timeout duration' }
        }
      },
      drop: {
        name: 'Packet Drop',
        description: 'Drop percentage of requests',
        params: {
          percentage: { type: 'number', default: 50, description: 'Drop rate %' }
        }
      },
      memory: {
        name: 'Memory Stress',
        description: 'Consume memory to test OOM handling',
        params: {
          size: { type: 'number', default: 100, description: 'MB to allocate' },
          rate: { type: 'number', default: 10, description: 'MB per second' }
        }
      },
      cpu: {
        name: 'CPU Stress',
        description: 'High CPU usage simulation',
        params: {
          load: { type: 'number', default: 80, description: 'CPU load %' },
          duration: { type: 'number', default: 10000, description: 'Duration ms' }
        }
      },
      network: {
        name: 'Network Partition',
        description: 'Simulate network isolation',
        params: {
          target: { type: 'string', default: 'all', description: 'Target service' },
          duration: { type: 'number', default: 60000, description: 'Duration ms' }
        }
      },
      exception: {
        name: 'Exception Injection',
        description: 'Throw runtime exceptions',
        params: {
          type: { type: 'string', default: 'RuntimeException', description: 'Exception type' },
          message: { type: 'string', default: 'Injected error', description: 'Error message' }
        }
      },
      duplicate: {
        name: 'Duplicate Request',
        description: 'Replay requests multiple times',
        params: {
          count: { type: 'number', default: 2, description: 'Number of duplicates' }
        }
      },
      corrupt: {
        name: 'Data Corruption',
        description: 'Corrupt response data',
        params: {
          percentage: { type: 'number', default: 10, description: 'Corruption rate %' }
        }
      }
    };
  }

  _initSampleData() {
    // Sample active faults
    const faults = [
      {
        type: 'latency',
        target: 'user-service',
        params: { delay: 3000 },
        enabled: true,
        duration: 300000,
        probability: 50,
        injections: 150
      },
      {
        type: 'error',
        target: 'payment-service',
        params: { code: 503, message: 'Service Temporarily Unavailable' },
        enabled: true,
        duration: 60000,
        probability: 30,
        injections: 45
      },
      {
        type: 'drop',
        target: 'order-service',
        params: { percentage: 25 },
        enabled: false,
        duration: 120000,
        probability: 100,
        injections: 200
      }
    ];

    faults.forEach((f, i) => {
      const fault = new FaultInjection({ id: `fault-${i + 1}`, ...f });
      this.faults.set(fault.id, fault);
    });

    // Sample injection history
    this.injectionHistory = [
      { id: 'inj-1', faultType: 'latency', target: 'api-gateway', timestamp: '2026-02-17T10:00:00Z', duration: 5000, success: true },
      { id: 'inj-2', faultType: 'error', target: 'user-service', timestamp: '2026-02-17T10:05:00Z', duration: 3000, success: true },
      { id: 'inj-3', faultType: 'timeout', target: 'payment-service', timestamp: '2026-02-17T10:10:00Z', duration: 10000, success: false },
      { id: 'inj-4', faultType: 'network', target: 'order-service', timestamp: '2026-02-17T10:15:00Z', duration: 30000, success: true }
    ];
  }

  // List fault types
  listFaultTypes() {
    return Object.entries(this.faultTypes).map(([key, value]) => ({
      type: key,
      ...value
    }));
  }

  // Create fault
  createFault(type, target, params = {}) {
    if (!this.faultTypes[type]) {
      throw new Error(`Unknown fault type: ${type}`);
    }

    const fault = new FaultInjection({
      type,
      target,
      params
    });

    this.faults.set(fault.id, fault);
    return fault;
  }

  // Enable fault
  enableFault(faultId) {
    const fault = this.faults.get(faultId);
    if (!fault) {
      throw new Error(`Fault ${faultId} not found`);
    }
    fault.enabled = true;
    this.activeInfections.push(faultId);
    return fault;
  }

  // Disable fault
  disableFault(faultId) {
    const fault = this.faults.get(faultId);
    if (!fault) {
      throw new Error(`Fault ${faultId} not found`);
    }
    fault.enabled = false;
    this.activeInfections = this.activeInfections.filter(id => id !== faultId);
    return fault;
  }

  // List faults
  listFaults() {
    return Array.from(this.faults.values());
  }

  // Get active faults
  getActiveFaults() {
    return Array.from(this.faults.values()).filter(f => f.enabled);
  }

  // Inject fault (simulate)
  inject(faultId) {
    const fault = this.faults.get(faultId);
    if (!fault) {
      throw new Error(`Fault ${faultId} not found`);
    }

    if (!fault.enabled) {
      throw new Error(`Fault ${faultId} is disabled`);
    }

    const injection = {
      id: `inj-${Date.now()}`,
      faultType: fault.type,
      target: fault.target,
      timestamp: new Date().toISOString(),
      duration: fault.params.delay || fault.duration || 0,
      success: true
    };

    fault.injections += 1;
    this.injectionHistory.push(injection);

    return injection;
  }

  // Get injection history
  getHistory(limit = 20) {
    return this.injectionHistory.slice(-limit);
  }

  // Get statistics
  getStats() {
    const allFaults = Array.from(this.faults.values());
    const active = allFaults.filter(f => f.enabled);

    return {
      totalFaults: allFaults.length,
      activeFaults: active.length,
      disabledFaults: allFaults.length - active.length,
      totalInjections: allFaults.reduce((sum, f) => sum + f.injections, 0),
      historySize: this.injectionHistory.length,
      faultTypes: Object.keys(this.faultTypes).length
    };
  }

  // Delete fault
  deleteFault(faultId) {
    const fault = this.faults.get(faultId);
    if (fault && fault.enabled) {
      this.activeInfections = this.activeInfections.filter(id => id !== faultId);
    }
    return this.faults.delete(faultId);
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const injector = new FaultInjector();

switch (command) {
  case 'demo':
    console.log('=== Agent Fault Injection Demo\n');

    // 1. List fault types
    console.log('1. Available Fault Types:');
    const types = injector.listFaultTypes();
    console.log(`   Total: ${types.length}`);
    types.slice(0, 5).forEach(t => {
      console.log(`   - ${t.type}: ${t.name}`);
    });
    console.log(`   ... and ${types.length - 5} more`);

    // 2. List faults
    console.log('\n2. List Faults:');
    const faults = injector.listFaults();
    faults.forEach(f => {
      console.log(`   - ${f.type} -> ${f.target} [${f.enabled ? 'enabled' : 'disabled'}] (${f.injections} injections)`);
    });

    // 3. Get active faults
    console.log('\n3. Active Faults:');
    const active = injector.getActiveFaults();
    console.log(`   Total: ${active.length}`);
    active.forEach(f => {
      console.log(`   - ${f.type} on ${f.target} (prob: ${f.probability}%)`);
    });

    // 4. Create new fault
    console.log('\n4. Create New Fault:');
    const newFault = injector.createFault('timeout', 'notification-service', {
      duration: 15000
    });
    console.log(`   Created: ${newFault.type} fault for ${newFault.target}`);

    // 5. Enable fault
    console.log('\n5. Enable Fault:');
    const enabled = injector.enableFault(newFault.id);
    console.log(`   Enabled: ${enabled.type} on ${enabled.target}`);

    // 6. Inject fault
    console.log('\n6. Inject Fault:');
    const injection = injector.inject(newFault.id);
    console.log(`   Injected: ${injection.faultType} on ${injection.target}`);
    console.log(`   Duration: ${injection.duration}ms`);

    // 7. Disable fault
    console.log('\n7. Disable Fault:');
    const disabled = injector.disableFault(newFault.id);
    console.log(`   Disabled: ${disabled.type} on ${disabled.target}`);

    // 8. Injection history
    console.log('\n8. Injection History:');
    const history = injector.getHistory(5);
    history.forEach(h => {
      console.log(`   ${h.timestamp}: ${h.faultType} on ${h.target}`);
    });

    // 9. Get fault details
    console.log('\n9. Get Fault Details:');
    const faultTypes = injector.listFaultTypes();
    const latencyType = faultTypes.find(t => t.type === 'latency');
    console.log(`   Latency fault params:`);
    if (latencyType && latencyType.params) {
      Object.entries(latencyType.params).forEach(([key, param]) => {
        console.log(`     - ${key}: ${param.description} (default: ${param.default})`);
      });
    }

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const stats = injector.getStats();
    console.log(`    Total faults: ${stats.totalFaults}`);
    console.log(`    Active: ${stats.activeFaults}`);
    console.log(`    Total injections: ${stats.totalInjections}`);
    console.log(`    Fault types: ${stats.faultTypes}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'faults':
    console.log('Available Fault Types:');
    injector.listFaultTypes().forEach(t => {
      console.log(`  ${t.type}: ${t.name}`);
      console.log(`    ${t.description}`);
    });
    break;

  case 'inject':
    const faultId = args[1];
    if (!faultId) {
      console.log('Usage: node agent-fault-injection.js inject <fault-id>');
      process.exit(1);
    }
    const result = injector.inject(faultId);
    console.log(`Injected: ${result.faultType} on ${result.target}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-fault-injection.js [demo|faults|inject]');
}
