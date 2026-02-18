/**
 * Agent State Machine
 * State machine engine for Universal-Narrator-Core
 */

const crypto = require('crypto');

class AgentStateMachine {
  constructor(options = {}) {
    this.machines = new Map();
    this.definitions = new Map();
    this.history = new Map();

    this.config = {
      maxHistory: options.maxHistory || 100,
      enablePersistence: options.enablePersistence !== false,
      autoStart: options.autoStart !== false
    };

    // Initialize default state machine definitions
    this._initDefaultDefinitions();
  }

  _initDefaultDefinitions() {
    const defaultDefinitions = [
      {
        name: 'narrator-workflow',
        initialState: 'idle',
        states: ['idle', 'initializing', 'running', 'paused', 'completed', 'failed'],
        events: [
          { name: 'start', from: 'idle', to: 'initializing' },
          { name: 'init-complete', from: 'initializing', to: 'running' },
          { name: 'pause', from: 'running', to: 'paused' },
          { name: 'resume', from: 'paused', to: 'running' },
          { name: 'complete', from: 'running', to: 'completed' },
          { name: 'fail', from: ['initializing', 'running', 'paused'], to: 'failed' },
          { name: 'reset', from: ['completed', 'failed'], to: 'idle' }
        ]
      },
      {
        name: 'deployment',
        initialState: 'created',
        states: ['created', 'validated', 'deployed', 'rolling-back', 'rolled-back', 'failed'],
        events: [
          { name: 'validate', from: 'created', to: 'validated' },
          { name: 'deploy', from: 'validated', to: 'deployed' },
          { name: 'rollback', from: 'deployed', to: 'rolling-back' },
          { name: 'rollback-complete', from: 'rolling-back', to: 'rolled-back' },
          { name: 'fail', from: ['created', 'validated', 'deployed', 'rolling-back'], to: 'failed' },
          { name: 'redeploy', from: ['rolled-back', 'failed'], to: 'created' }
        ]
      },
      {
        name: 'order-processing',
        initialState: 'pending',
        states: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
        events: [
          { name: 'confirm', from: 'pending', to: 'confirmed' },
          { name: 'process', from: 'confirmed', to: 'processing' },
          { name: 'ship', from: 'processing', to: 'shipped' },
          { name: 'deliver', from: 'shipped', to: 'delivered' },
          { name: 'cancel', from: ['pending', 'confirmed'], to: 'cancelled' }
        ]
      }
    ];

    defaultDefinitions.forEach(def => this.defineMachine(def));
  }

  defineMachine(definition) {
    const { name, initialState, states, events } = definition;

    const machine = {
      id: `machine-${name}`,
      name,
      initialState,
      states: states || [],
      events: events || [],
      createdAt: new Date().toISOString()
    };

    // Validate
    if (!states.includes(initialState)) {
      throw new Error(`Initial state '${initialState}' not in states`);
    }

    // Build state transitions map
    machine.transitions = new Map();
    states.forEach(state => {
      machine.transitions.set(state, []);
    });

    events.forEach(event => {
      const fromStates = Array.isArray(event.from) ? event.from : [event.from];
      fromStates.forEach(fromState => {
        const transitions = machine.transitions.get(fromState) || [];
        transitions.push({
          event: event.name,
          to: event.to,
          condition: event.condition || null
        });
        machine.transitions.set(fromState, transitions);
      });
    });

    this.definitions.set(name, machine);
    console.log(`State machine defined: ${name} (initial: ${initialState}, states: ${states.length})`);
    return machine;
  }

  getDefinition(name) {
    const definition = this.definitions.get(name);
    if (!definition) {
      throw new Error(`State machine definition not found: ${name}`);
    }
    return definition;
  }

  listDefinitions() {
    return Array.from(this.definitions.values()).map(m => ({
      name: m.name,
      initialState: m.initialState,
      states: m.states,
      events: m.events.map(e => e.name)
    }));
  }

  createInstance(instanceId, machineName, initialData = {}) {
    const definition = this.getDefinition(machineName);

    const instance = {
      id: instanceId || `instance-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      machineName,
      currentState: definition.initialState,
      previousState: null,
      data: initialData,
      history: [],
      createdAt: new Date().toISOString(),
      updatedAt: Date.now(),
      status: 'active'
    };

    this.machines.set(instance.id, instance);
    this._recordHistory(instance, 'created', null, definition.initialState);

    console.log(`[StateMachine] Created instance ${instance.id} of ${machineName} in state '${definition.initialState}'`);
    return instance;
  }

  getInstance(instanceId) {
    const instance = this.machines.get(instanceId);
    if (!instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }
    return instance;
  }

  listInstances(filter) {
    let instances = Array.from(this.machines.values());

    if (filter) {
      if (filter.machineName) {
        instances = instances.filter(i => i.machineName === filter.machineName);
      }
      if (filter.currentState) {
        instances = instances.filter(i => i.currentState === filter.currentState);
      }
      if (filter.status) {
        instances = instances.filter(i => i.status === filter.status);
      }
    }

    return instances;
  }

  trigger(instanceId, eventName, eventData = {}) {
    const instance = this.getInstance(instanceId);
    const definition = this.getDefinition(instance.machineName);

    const currentTransitions = definition.transitions.get(instance.currentState) || [];
    const transition = currentTransitions.find(t => t.event === eventName);

    if (!transition) {
      throw new Error(`Invalid event '${eventName}' for state '${instance.currentState}'`);
    }

    // Check condition if present
    if (transition.condition) {
      const conditionMet = this._evaluateCondition(transition.condition, instance.data, eventData);
      if (!conditionMet) {
        console.log(`[StateMachine] Condition not met for event '${eventName}' on ${instanceId}`);
        return { success: false, reason: 'condition_not_met' };
      }
    }

    // Perform transition
    const previousState = instance.currentState;
    instance.previousState = previousState;
    instance.currentState = transition.to;
    instance.updatedAt = Date.now();
    instance.data = { ...instance.data, ...eventData };

    this._recordHistory(instance, eventName, previousState, transition.to);

    console.log(`[StateMachine] Instance ${instanceId}: ${previousState} --${eventName}--> ${transition.to}`);

    return {
      success: true,
      previousState,
      currentState: transition.to,
      event: eventName
    };
  }

  _evaluateCondition(condition, data, eventData) {
    // Simple condition evaluation
    if (typeof condition === 'function') {
      return condition(data, eventData);
    }
    return true;
  }

  _recordHistory(instance, event, from, to) {
    const entry = {
      timestamp: Date.now(),
      event,
      from,
      to,
      data: { ...instance.data }
    };

    instance.history.push(entry);

    // Trim history if needed
    if (instance.history.length > this.config.maxHistory) {
      instance.history = instance.history.slice(-this.config.maxHistory);
    }

    // Also store in global history
    if (!this.history.has(instance.id)) {
      this.history.set(instance.id, []);
    }
    this.history.get(instance.id).push({ ...entry, instanceId: instance.id });
  }

  getHistory(instanceId, limit = 50) {
    const instance = this.getInstance(instanceId);
    return instance.history.slice(-limit);
  }

  canTrigger(instanceId, eventName) {
    const instance = this.getInstance(instanceId);
    const definition = this.getDefinition(instance.machineName);

    const currentTransitions = definition.transitions.get(instance.currentState) || [];
    return currentTransitions.some(t => t.event === eventName);
  }

  getAvailableEvents(instanceId) {
    const instance = this.getInstance(instanceId);
    const definition = this.getDefinition(instance.machineName);

    const currentTransitions = definition.transitions.get(instance.currentState) || [];
    return currentTransitions.map(t => t.event);
  }

  reset(instanceId) {
    const instance = this.getInstance(instanceId);
    const definition = this.getDefinition(instance.machineName);

    instance.currentState = definition.initialState;
    instance.previousState = null;
    instance.updatedAt = Date.now();

    this._recordHistory(instance, 'reset', null, definition.initialState);

    console.log(`[StateMachine] Instance ${instanceId} reset to '${definition.initialState}'`);
    return instance;
  }

  deleteInstance(instanceId) {
    const deleted = this.machines.delete(instanceId);
    if (deleted) {
      console.log(`[StateMachine] Deleted instance ${instanceId}`);
    }
    return deleted;
  }

  getStatistics() {
    const byMachine = {};
    const byState = {};

    for (const instance of this.machines.values()) {
      byMachine[instance.machineName] = (byMachine[instance.machineName] || 0) + 1;
      byState[instance.currentState] = (byState[instance.currentState] || 0) + 1;
    }

    return {
      totalInstances: this.machines.size,
      definitions: this.definitions.size,
      byMachine,
      byState
    };
  }

  shutdown() {
    console.log('State machine shut down');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const sm = new AgentStateMachine({
    maxHistory: 100,
    autoStart: true
  });

  switch (command) {
    case 'list-definitions':
      const definitions = sm.listDefinitions();
      console.log('State Machine Definitions:');
      definitions.forEach(d => {
        console.log(`  - ${d.name}: ${d.states.join(' -> ')}`);
        console.log(`    Initial: ${d.initialState}, Events: ${d.events.join(', ')}`);
      });
      break;

    case 'create':
      const instance = sm.createInstance(args[1], args[2] || 'narrator-workflow', {});
      console.log('Instance created:', instance.id);
      break;

    case 'trigger':
      const result = sm.trigger(args[1], args[2], {});
      console.log('Trigger result:', result);
      break;

    case 'events':
      const events = sm.getAvailableEvents(args[1]);
      console.log('Available events:', events);
      break;

    case 'list':
      const instances = sm.listInstances(
        args[1] ? { machineName: args[1] } : undefined
      );
      console.log('Instances:');
      instances.forEach(i => console.log(`  - ${i.id}: ${i.machineName} [${i.currentState}]`));
      break;

    case 'history':
      const history = sm.getHistory(args[1]);
      console.log('History:');
      history.forEach(h => console.log(`  - ${h.event}: ${h.from} -> ${h.to}`));
      break;

    case 'stats':
      const stats = sm.getStatistics();
      console.log('State Machine Statistics:', stats);
      break;

    case 'demo':
      console.log('=== Agent State Machine Demo ===\n');

      // List definitions
      console.log('1. State Machine Definitions:');
      const defs = sm.listDefinitions();
      defs.forEach(d => {
        console.log(`   - ${d.name}:`);
        console.log(`     States: ${d.states.join(' -> ')}`);
        console.log(`     Initial: ${d.initialState}`);
      });

      // Create instances
      console.log('\n2. Creating Instances:');

      const narrator1 = sm.createInstance('narrator-1', 'narrator-workflow', { sessionId: 'sess-001' });
      console.log(`   Created narrator-1: ${narrator1.machineName} [${narrator1.currentState}]`);

      const narrator2 = sm.createInstance('narrator-2', 'narrator-workflow', { sessionId: 'sess-002' });
      console.log(`   Created narrator-2: ${narrator2.machineName} [${narrator2.currentState}]`);

      const deployment1 = sm.createInstance('deploy-1', 'deployment', { app: 'web-app' });
      console.log(`   Created deploy-1: ${deployment1.machineName} [${deployment1.currentState}]`);

      const order1 = sm.createInstance('order-1', 'order-processing', { items: 3 });
      console.log(`   Created order-1: ${order1.machineName} [${order1.currentState}]`);

      // Trigger events
      console.log('\n3. Triggering Events:');

      // Narrator workflow
      console.log('\n   Narrator-1 workflow:');
      let r = sm.trigger('narrator-1', 'start', { user: 'alice' });
      console.log(`     start: ${r.previousState} -> ${r.currentState}`);

      r = sm.trigger('narrator-1', 'init-complete', { config: {} });
      console.log(`     init-complete: ${r.previousState} -> ${r.currentState}`);

      r = sm.trigger('narrator-1', 'complete', { result: 'success' });
      console.log(`     complete: ${r.previousState} -> ${r.currentState}`);

      // Narrator-2 workflow (with pause)
      console.log('\n   Narrator-2 workflow:');
      r = sm.trigger('narrator-2', 'start', { user: 'bob' });
      console.log(`     start: ${r.previousState} -> ${r.currentState}`);

      r = sm.trigger('narrator-2', 'init-complete', {});
      console.log(`     init-complete: ${r.previousState} -> ${r.currentState}`);

      r = sm.trigger('narrator-2', 'pause', {});
      console.log(`     pause: ${r.previousState} -> ${r.currentState}`);

      r = sm.trigger('narrator-2', 'resume', {});
      console.log(`     resume: ${r.previousState} -> ${r.currentState}`);

      r = sm.trigger('narrator-2', 'complete', { result: 'success' });
      console.log(`     complete: ${r.previousState} -> ${r.currentState}`);

      // Deployment workflow
      console.log('\n   Deploy-1 workflow:');
      r = sm.trigger('deploy-1', 'validate', { checks: ['security', 'performance'] });
      console.log(`     validate: ${r.previousState} -> ${r.currentState}`);

      r = sm.trigger('deploy-1', 'deploy', { version: '1.0.0' });
      console.log(`     deploy: ${r.previousState} -> ${r.currentState}`);

      // Order processing
      console.log('\n   Order-1 workflow:');
      r = sm.trigger('order-1', 'confirm', { customer: 'customer-123' });
      console.log(`     confirm: ${r.previousState} -> ${r.currentState}`);

      r = sm.trigger('order-1', 'process', {});
      console.log(`     process: ${r.previousState} -> ${r.currentState}`);

      r = sm.trigger('order-1', 'ship', { tracking: 'TRACK-001' });
      console.log(`     ship: ${r.previousState} -> ${r.currentState}`);

      r = sm.trigger('order-1', 'deliver', {});
      console.log(`     deliver: ${r.previousState} -> ${r.currentState}`);

      // Check available events
      console.log('\n4. Available Events:');
      console.log(`   narrator-1: ${sm.getAvailableEvents('narrator-1').join(', ')}`);
      console.log(`   deploy-1: ${sm.getAvailableEvents('deploy-1').join(', ')}`);
      console.log(`   order-1: ${sm.getAvailableEvents('order-1').join(', ')}`);

      // List instances
      console.log('\n5. Instance States:');
      const allInstances = sm.listInstances();
      allInstances.forEach(i => {
        console.log(`   - ${i.id}: ${i.machineName} [${i.currentState}]`);
      });

      // History
      console.log('\n6. Narrator-1 History:');
      const narrator1History = sm.getHistory('narrator-1');
      narrator1History.forEach(h => {
        console.log(`   - ${h.event}: ${h.from} -> ${h.to}`);
      });

      // Statistics
      console.log('\n7. Statistics:');
      const finalStats = sm.getStatistics();
      console.log(`   Total instances: ${finalStats.totalInstances}`);
      console.log(`   Definitions: ${finalStats.definitions}`);
      console.log(`   By machine:`, finalStats.byMachine);
      console.log(`   By state:`, finalStats.byState);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-state-machine.js <command> [args]');
      console.log('\nCommands:');
      console.log('  list-definitions         List state machine definitions');
      console.log('  create <id> <machine>   Create instance');
      console.log('  trigger <id> <event>   Trigger event');
      console.log('  events <id>            Get available events');
      console.log('  list [machine]         List instances');
      console.log('  history <id>           Get instance history');
      console.log('  stats                  Get statistics');
      console.log('  demo                   Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentStateMachine;
