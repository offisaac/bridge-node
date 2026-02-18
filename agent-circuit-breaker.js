/**
 * Agent Circuit Breaker
 * Circuit breaker state machine for Universal-Narrator-Core
 */

const crypto = require('crypto');

class AgentCircuitBreaker {
  constructor(options = {}) {
    this.circuits = new Map();

    this.config = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      timeout: options.timeout || 60000,
      halfOpenMaxCalls: options.halfOpenMaxCalls || 3,
      monitoringPeriod: options.monitoringPeriod || 120000
    };

    this.stats = {
      totalOpened: 0,
      totalClosed: 0,
      totalHalfOpen: 0
    };

    this._initDefaultCircuits();
  }

  _initDefaultCircuits() {
    const defaultCircuits = [
      { name: 'narrator-api', service: 'narrator-service', failureThreshold: 5 },
      { name: 'core-service', service: 'core-api', failureThreshold: 3 },
      { name: 'database', service: 'db-primary', failureThreshold: 10 }
    ];

    defaultCircuits.forEach(circuit => this.createCircuit(circuit));
  }

  createCircuit(circuitConfig) {
    const { name, service, failureThreshold } = circuitConfig;

    const circuit = {
      id: `circuit-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      name,
      service: service || name,
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      lastStateChange: Date.now(),
      failureThreshold: failureThreshold || this.config.failureThreshold,
      successThreshold: this.config.successThreshold,
      timeout: this.config.timeout,
      calls: [],
      createdAt: new Date().toISOString()
    };

    this.circuits.set(name, circuit);
    console.log(`Circuit breaker created: ${name} (state: ${circuit.state}, threshold: ${circuit.failureThreshold})`);
    return circuit;
  }

  getCircuit(name) {
    const circuit = this.circuits.get(name);
    if (!circuit) {
      throw new Error(`Circuit not found: ${name}`);
    }
    return circuit;
  }

  listCircuits() {
    return Array.from(this.circuits.values()).map(c => ({
      name: c.name,
      service: c.service,
      state: c.state,
      failures: c.failureCount,
      successes: c.successCount
    }));
  }

  async execute(name, operation) {
    const circuit = this.getCircuit(name);

    if (circuit.state === 'open') {
      if (this._shouldAttemptReset(circuit)) {
        this._transitionToHalfOpen(circuit);
      } else {
        throw new Error(`Circuit ${name} is OPEN`);
      }
    }

    const startTime = Date.now();
    try {
      const result = await operation();
      this._onSuccess(circuit, Date.now() - startTime);
      return result;
    } catch (error) {
      this._onFailure(circuit, Date.now() - startTime, error);
      throw error;
    }
  }

  _shouldAttemptReset(circuit) {
    return Date.now() - circuit.lastFailureTime >= circuit.timeout;
  }

  _transitionToHalfOpen(circuit) {
    circuit.state = 'half-open';
    circuit.successCount = 0;
    circuit.lastStateChange = Date.now();
    this.stats.totalHalfOpen++;
    console.log(`[CircuitBreaker] ${circuit.name} transitioned to HALF-OPEN`);
  }

  _onSuccess(circuit, duration) {
    circuit.calls.push({ success: true, duration, timestamp: Date.now() });
    this._cleanupCalls(circuit);

    if (circuit.state === 'half-open') {
      circuit.successCount++;
      if (circuit.successCount >= circuit.successThreshold) {
        this._transitionToClosed(circuit);
      }
    } else if (circuit.state === 'closed') {
      circuit.failureCount = 0;
    }

    console.log(`[CircuitBreaker] ${circuit.name}: Success (state: ${circuit.state})`);
  }

  _onFailure(circuit, duration, error) {
    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();
    circuit.calls.push({ success: false, duration, timestamp: Date.now(), error: error.message });
    this._cleanupCalls(circuit);

    if (circuit.state === 'half-open') {
      this._transitionToOpen(circuit);
    } else if (circuit.state === 'closed') {
      if (circuit.failureCount >= circuit.failureThreshold) {
        this._transitionToOpen(circuit);
      }
    }

    console.log(`[CircuitBreaker] ${circuit.name}: Failure (${circuit.failureCount}/${circuit.failureThreshold})`);
  }

  _transitionToOpen(circuit) {
    circuit.state = 'open';
    circuit.lastStateChange = Date.now();
    circuit.lastFailureTime = Date.now();
    this.stats.totalOpened++;
    console.log(`[CircuitBreaker] ${circuit.name} transitioned to OPEN`);
  }

  _transitionToClosed(circuit) {
    circuit.state = 'closed';
    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.lastStateChange = Date.now();
    this.stats.totalClosed++;
    console.log(`[CircuitBreaker] ${circuit.name} transitioned to CLOSED`);
  }

  _cleanupCalls(circuit) {
    const cutoff = Date.now() - this.config.monitoringPeriod;
    circuit.calls = circuit.calls.filter(c => c.timestamp > cutoff);
  }

  getCircuitStatus(name) {
    const circuit = this.getCircuit(name);
    return {
      name: circuit.name,
      service: circuit.service,
      state: circuit.state,
      failureCount: circuit.failureCount,
      successCount: circuit.successCount,
      lastFailureTime: circuit.lastFailureTime,
      lastStateChange: circuit.lastStateChange,
      threshold: circuit.failureThreshold,
      callsInLastPeriod: circuit.calls.length
    };
  }

  getCircuitHealth(name) {
    const circuit = this.getCircuit(name);
    const recentCalls = circuit.calls.slice(-10);

    const successRate = recentCalls.length > 0
      ? recentCalls.filter(c => c.success).length / recentCalls.length
      : 1;

    const avgDuration = recentCalls.length > 0
      ? recentCalls.reduce((sum, c) => sum + c.duration, 0) / recentCalls.length
      : 0;

    return {
      name: circuit.name,
      state: circuit.state,
      successRate: (successRate * 100).toFixed(1) + '%',
      avgResponseTime: Math.round(avgDuration) + 'ms',
      recentCalls: recentCalls.length,
      healthy: circuit.state === 'closed' && successRate > 0.8
    };
  }

  resetCircuit(name) {
    const circuit = this.getCircuit(name);
    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.state = 'closed';
    circuit.lastStateChange = Date.now();
    console.log(`[CircuitBreaker] ${name} manually reset to CLOSED`);
    return circuit;
  }

  deleteCircuit(name) {
    const deleted = this.circuits.delete(name);
    if (deleted) {
      console.log(`Circuit deleted: ${name}`);
    }
    return deleted;
  }

  getStatistics() {
    const byState = { closed: 0, open: 0, 'half-open': 0 };
    for (const circuit of this.circuits.values()) {
      byState[circuit.state]++;
    }

    return {
      totalCircuits: this.circuits.size,
      totalOpened: this.stats.totalOpened,
      totalClosed: this.stats.totalClosed,
      totalHalfOpen: this.stats.totalHalfOpen,
      byState
    };
  }

  shutdown() {
    console.log('Circuit breaker shut down');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const breaker = new AgentCircuitBreaker({
    failureThreshold: 3,
    successThreshold: 2,
    timeout: 5000
  });

  switch (command) {
    case 'list':
      const circuits = breaker.listCircuits();
      console.log('Circuit Breakers:');
      circuits.forEach(c => console.log(`  - ${c.name}: ${c.state}`));
      break;

    case 'create':
      breaker.createCircuit({
        name: args[1] || 'test-circuit',
        service: args[2] || 'test-service',
        failureThreshold: parseInt(args[3]) || 3
      });
      console.log('Circuit created');
      break;

    case 'status':
      const status = breaker.getCircuitStatus(args[1]);
      console.log('Circuit Status:', status);
      break;

    case 'health':
      const health = breaker.getCircuitHealth(args[1]);
      console.log('Circuit Health:', health);
      break;

    case 'reset':
      breaker.resetCircuit(args[1]);
      console.log('Circuit reset');
      break;

    case 'stats':
      const stats = breaker.getStatistics();
      console.log('Circuit Breaker Statistics:', stats);
      break;

    case 'demo':
      console.log('=== Agent Circuit Breaker Demo ===\n');

      console.log('1. Default Circuits:');
      const circuitList = breaker.listCircuits();
      circuitList.forEach(c => {
        console.log(`   - ${c.name}: ${c.state} (service: ${c.service})`);
      });

      console.log('\n2. Creating Custom Circuit:');
      const customCircuit = breaker.createCircuit({
        name: 'external-api',
        service: 'external-payment-gateway',
        failureThreshold: 3
      });
      console.log(`   Created: ${customCircuit.name} (threshold: ${customCircuit.failureThreshold})`);

      console.log('\n3. Simulating Operations:');

      const simulateOperation = async (name, shouldFail = false) => {
        const operation = async () => {
          if (shouldFail && Math.random() > 0.3) {
            throw new Error('Service unavailable');
          }
          return { status: 'ok', data: 'result' };
        };

        try {
          const result = await breaker.execute(name, operation);
          console.log(`   [${name}] Success`);
        } catch (error) {
          console.log(`   [${name}] Failed: ${error.message}`);
        }
      };

      console.log('\n   Testing narrator-api:');
      await simulateOperation('narrator-api', false);
      await simulateOperation('narrator-api', false);

      console.log('\n   Testing core-service:');
      await simulateOperation('core-service', true);
      await simulateOperation('core-service', true);
      await simulateOperation('core-service', true);
      await simulateOperation('core-service', true);

      console.log('\n   Testing external-api:');
      await simulateOperation('external-api', false);
      await simulateOperation('external-api', false);
      await simulateOperation('external-api', false);

      console.log('\n4. Circuit Statuses:');
      const allCircuits = breaker.listCircuits();
      allCircuits.forEach(c => {
        const status = breaker.getCircuitStatus(c.name);
        console.log(`   - ${c.name}:`);
        console.log(`     State: ${status.state}`);
        console.log(`     Failures: ${status.failureCount}/${status.threshold}`);
      });

      console.log('\n5. Circuit Health:');
      allCircuits.forEach(c => {
        const health = breaker.getCircuitHealth(c.name);
        console.log(`   - ${c.name}: ${health.state}, Success: ${health.successRate}, Avg: ${health.avgResponseTime}, Healthy: ${health.healthy}`);
      });

      console.log('\n6. Direct Execute Test:');
      breaker.createCircuit({
        name: 'test-circuit',
        service: 'test-service',
        failureThreshold: 2
      });

      try {
        await breaker.execute('test-circuit', async () => {
          console.log('   Operation executed successfully');
          return { success: true };
        });
      } catch (e) {
        console.log(`   Error: ${e.message}`);
      }

      breaker.resetCircuit('test-circuit');

      console.log('\n7. Statistics:');
      const finalStats = breaker.getStatistics();
      console.log(`   Total circuits: ${finalStats.totalCircuits}`);
      console.log(`   Total opened: ${finalStats.totalOpened}`);
      console.log(`   Total closed: ${finalStats.totalClosed}`);
      console.log(`   Total half-open: ${finalStats.totalHalfOpen}`);
      console.log(`   By state:`, finalStats.byState);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-circuit-breaker.js <command> [args]');
      console.log('\nCommands:');
      console.log('  list                    List circuits');
      console.log('  create <name> <service> Create circuit');
      console.log('  status <name>          Get circuit status');
      console.log('  health <name>          Get circuit health');
      console.log('  reset <name>           Reset circuit');
      console.log('  stats                  Get statistics');
      console.log('  demo                   Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentCircuitBreaker;
