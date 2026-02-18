/**
 * Agent Game Day Module
 *
 * Provides game day simulation for testing system resilience.
 * Usage: node agent-gameday.js [command] [options]
 *
 * Commands:
 *   scenarios                List available game day scenarios
 *   run <scenario>          Run a specific scenario
 *   schedule <scenario>    Schedule a game day
 *   status                  Show game day status
 *   results                 Show game day results
 *   demo                    Run demo
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SCENARIOS_DB = path.join(DATA_DIR, 'gameday-scenarios.json');
const RESULTS_DB = path.join(DATA_DIR, 'gameday-results.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadJSON(file, defaultVal = {}) {
  ensureDataDir();
  if (!fs.existsSync(file)) {
    return defaultVal;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch {
    return defaultVal;
  }
}

function saveJSON(file, data) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/**
 * Scenario Manager
 */
class ScenarioManager {
  constructor() {
    this.scenarios = loadJSON(SCENARIOS_DB, {
      'network-failure': {
        name: 'Network Failure',
        description: 'Simulate network partition and latency',
        duration: 300,
        chaos: ['network-latency', 'packet-loss', 'dns-failure'],
        impact: 'high',
        steps: [
          { action: 'inject-latency', target: 'all', value: '5000ms' },
          { action: 'drop-packets', target: 'all', percentage: 30 },
          { action: 'block-dns', target: 'dns-server' }
        ]
      },
      'database-outage': {
        name: 'Database Outage',
        description: 'Simulate primary database failure',
        duration: 180,
        chaos: ['database-failure', 'connection-timeout'],
        impact: 'critical',
        steps: [
          { action: 'kill-database', target: 'primary-db' },
          { action: 'failover', target: 'replica-db' },
          { action: 'verify-readiness', target: 'replica-db' }
        ]
      },
      'service-crash': {
        name: 'Service Crash',
        description: 'Simulate critical service crash',
        duration: 120,
        chaos: ['process-kill', 'memory-exhaustion'],
        impact: 'high',
        steps: [
          { action: 'kill-service', target: 'api-gateway' },
          { action: 'alert-oncall', target: 'pagerduty' },
          { action: 'verify-fallback', target: 'backup-gateway' }
        ]
      },
      'load-spike': {
        name: 'Load Spike',
        description: 'Simulate sudden traffic increase',
        duration: 600,
        chaos: ['high-load', 'cpu-saturation'],
        impact: 'medium',
        steps: [
          { action: 'increase-traffic', target: 'all', multiplier: 10 },
          { action: 'monitor-metrics', target: 'all' },
          { action: 'scale-services', target: 'auto-scaler' }
        ]
      },
      'security-incident': {
        name: 'Security Incident',
        description: 'Simulate security breach attempt',
        duration: 240,
        chaos: ['ddos', 'unauthorized-access'],
        impact: 'critical',
        steps: [
          { action: 'simulate-ddos', target: 'gateway', requests: 100000 },
          { action: 'test-throttling', target: 'rate-limiter' },
          { action: 'verify-alerts', target: 'security-team' }
        ]
      }
    });
  }

  list() {
    return Object.values(this.scenarios);
  }

  get(name) {
    return this.scenarios[name];
  }

  create(name, options) {
    this.scenarios[name] = {
      name: options.name || name,
      description: options.description || '',
      duration: options.duration || 300,
      chaos: options.chaos || [],
      impact: options.impact || 'medium',
      steps: options.steps || []
    };
    saveJSON(SCENARIOS_DB, this.scenarios);
    return this.scenarios[name];
  }

  delete(name) {
    delete this.scenarios[name];
    saveJSON(SCENARIOS_DB, this.scenarios);
    return true;
  }
}

/**
 * Game Day Executor
 */
class GameDayExecutor {
  constructor() {
    this.scenarios = new ScenarioManager();
    this.results = loadJSON(RESULTS_DB, []);
    this.currentRun = null;
  }

  async runScenario(scenarioName) {
    const scenario = this.scenarios.get(scenarioName);
    if (!scenario) {
      return { success: false, reason: 'Scenario not found' };
    }

    console.log(`\n=== Starting Game Day: ${scenario.name} ===\n`);
    console.log(`Description: ${scenario.description}`);
    console.log(`Duration: ${scenario.duration}s`);
    console.log(`Impact: ${scenario.impact}`);
    console.log(`Chaos types: ${scenario.chaos.join(', ')}\n`);

    this.currentRun = {
      scenario: scenarioName,
      startTime: Date.now(),
      status: 'running',
      steps: [],
      logs: []
    };

    // Execute steps
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      console.log(`Step ${i + 1}/${scenario.steps.length}: ${step.action} on ${step.target}`);

      await this.executeStep(step);

      this.currentRun.steps.push({
        ...step,
        executedAt: Date.now(),
        status: 'success'
      });

      // Simulate delay between steps
      await new Promise(r => setTimeout(r, 500));
    }

    // Complete
    this.currentRun.endTime = Date.now();
    this.currentRun.status = 'completed';
    this.currentRun.duration = this.currentRun.endTime - this.currentRun.startTime;

    // Save results
    this.results.unshift({ ...this.currentRun });
    if (this.results.length > 50) {
      this.results = this.results.slice(0, 50);
    }
    saveJSON(RESULTS_DB, this.results);

    console.log(`\n=== Game Day Complete ===`);
    console.log(`Duration: ${(this.currentRun.duration / 1000).toFixed(1)}s`);
    console.log(`Steps completed: ${this.currentRun.steps.length}`);

    return {
      success: true,
      scenario: scenarioName,
      duration: this.currentRun.duration,
      steps: this.currentRun.steps.length
    };
  }

  async executeStep(step) {
    console.log(`  -> Executing: ${step.action}`);

    // Simulate different chaos actions
    switch (step.action) {
      case 'inject-latency':
        console.log(`  -> Injecting ${step.value} latency to ${step.target}`);
        break;
      case 'drop-packets':
        console.log(`  -> Dropping ${step.percentage}% packets from ${step.target}`);
        break;
      case 'kill-database':
        console.log(`  -> Killing database: ${step.target}`);
        break;
      case 'failover':
        console.log(`  -> Triggering failover to ${step.target}`);
        break;
      case 'kill-service':
        console.log(`  -> Killing service: ${step.target}`);
        break;
      case 'increase-traffic':
        console.log(`  -> Increasing traffic by ${step.multiplier}x`);
        break;
      case 'simulate-ddos':
        console.log(`  -> Simulating ${step.requests} requests`);
        break;
      default:
        console.log(`  -> Action: ${step.action}`);
    }

    // Simulate execution time
    await new Promise(r => setTimeout(r, Math.random() * 500 + 200));
  }

  getResults(limit = 10) {
    return this.results.slice(0, limit);
  }

  getStatus() {
    if (this.currentRun && this.currentRun.status === 'running') {
      const elapsed = Date.now() - this.currentRun.startTime;
      return {
        status: 'running',
        scenario: this.currentRun.scenario,
        elapsed: elapsed,
        stepsCompleted: this.currentRun.steps.length
      };
    }
    return { status: 'idle' };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Game Day Demo ===\n');

  const executor = new GameDayExecutor();

  // Show scenarios
  console.log('1. Available Scenarios:');
  executor.scenarios.list().forEach(s => {
    console.log(`   - ${s.name} (${s.impact} impact, ${s.duration}s)`);
    console.log(`     ${s.description}`);
    console.log(`     Chaos: ${s.chaos.join(', ')}`);
  });

  // Run a scenario
  console.log('\n2. Running "Service Crash" scenario:');
  await executor.runScenario('service-crash');

  // Show status
  console.log('\n3. Current Status:');
  const status = executor.getStatus();
  console.log(`   Status: ${status.status}`);

  // Run another scenario
  console.log('\n4. Running "Network Failure" scenario:');
  await executor.runScenario('network-failure');

  // Show results
  console.log('\n5. Recent Game Day Results:');
  const results = executor.getResults(5);
  results.forEach((r, i) => {
    console.log(`   ${i + 1}. ${r.scenario}: ${r.status} (${(r.duration / 1000).toFixed(1)}s)`);
  });

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'scenarios') {
  const mgr = new ScenarioManager();
  console.log('Available Game Day Scenarios:');
  mgr.list().forEach(s => {
    console.log(`  ${s.name}: ${s.description}`);
  });
} else if (cmd === 'run') {
  const scenario = args[1];
  if (scenario) {
    const executor = new GameDayExecutor();
    executor.runScenario(scenario).then(r => {
      console.log(JSON.stringify(r, null, 2));
    });
  } else {
    console.log('Usage: run <scenario>');
  }
} else if (cmd === 'status') {
  const executor = new GameDayExecutor();
  console.log(JSON.stringify(executor.getStatus(), null, 2));
} else if (cmd === 'results') {
  const executor = new GameDayExecutor();
  console.log('Recent Results:');
  executor.getResults(10).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.scenario}: ${r.status} (${(r.duration / 1000).toFixed(1)}s)`);
  });
} else if (cmd === 'demo') {
  demo();
} else {
  console.log('Agent Game Day');
  console.log('Usage: node agent-gameday.js [command]');
  console.log('Commands:');
  console.log('  scenarios          List available scenarios');
  console.log('  run <scenario>     Run a specific scenario');
  console.log('  status             Show game day status');
  console.log('  results            Show game day results');
  console.log('  demo               Run demo');
}
