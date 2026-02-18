/**
 * Agent Event Sourcing
 * Event sourcing storage for Universal-Narrator-Core
 */

const crypto = require('crypto');

class AgentEventSourcing {
  constructor(options = {}) {
    this.streams = new Map();
    this.snapshots = new Map();
    this.projections = new Map();

    this.config = {
      snapshotInterval: options.snapshotInterval || 100,
      retentionPeriod: options.retentionPeriod || null,
      maxEventsPerStream: options.maxEventsPerStream || 10000
    };

    this.stats = {
      totalEventsAppended: 0,
      totalSnapshotsCreated: 0,
      totalProjectionsUpdated: 0
    };

    // Initialize default projections
    this._initDefaultProjections();
  }

  _initDefaultProjections() {
    const defaultProjections = [
      {
        name: 'account-balance',
        handler: (state, event) => {
          if (!state) state = { balance: 0 };
          switch (event.type) {
            case 'deposit':
              state.balance += event.data.amount;
              break;
            case 'withdrawal':
              state.balance -= event.data.amount;
              break;
          }
          return state;
        }
      },
      {
        name: 'order-status',
        handler: (state, event) => {
          if (!state) state = { items: [], status: 'created' };
          switch (event.type) {
            case 'item-added':
              state.items.push(event.data);
              break;
            case 'order-confirmed':
              state.status = 'confirmed';
              break;
            case 'order-shipped':
              state.status = 'shipped';
              break;
            case 'order-delivered':
              state.status = 'delivered';
              break;
          }
          return state;
        }
      }
    ];

    defaultProjections.forEach(proj => this.registerProjection(proj));
  }

  registerProjection(projection) {
    const { name, handler } = projection;

    this.projections.set(name, {
      name,
      handler,
      version: 0,
      state: null,
      createdAt: new Date().toISOString()
    });

    console.log(`Projection registered: ${name}`);
    return this.projections.get(name);
  }

  createStream(streamId, aggregateId) {
    const stream = {
      id: streamId || `stream-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      aggregateId,
      events: [],
      version: 0,
      createdAt: new Date().toISOString(),
      updatedAt: Date.now()
    };

    this.streams.set(stream.id, stream);
    console.log(`Event stream created: ${stream.id} for aggregate ${aggregateId}`);
    return stream;
  }

  getStream(streamId) {
    const stream = this.streams.get(streamId);
    if (!stream) {
      throw new Error(`Stream not found: ${streamId}`);
    }
    return stream;
  }

  appendEvent(streamId, eventType, data, options = {}) {
    const stream = this.getStream(streamId);

    const event = {
      id: `evt-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
      streamId,
      aggregateId: stream.aggregateId,
      type: eventType,
      data,
      metadata: options.metadata || {},
      version: stream.version + 1,
      timestamp: Date.now(),
      cause: options.cause || null
    };

    stream.events.push(event);
    stream.version = event.version;
    stream.updatedAt = Date.now();
    this.stats.totalEventsAppended++;

    // Update projections
    this._updateProjections(event);

    // Create snapshot if needed
    if (stream.events.length % this.config.snapshotInterval === 0) {
      this._createSnapshot(stream);
    }

    // Trim events if needed
    if (stream.events.length > this.config.maxEventsPerStream) {
      stream.events = stream.events.slice(-this.config.maxEventsPerStream);
    }

    console.log(`[EventSourcing] Appended event ${event.id} to ${streamId} (version ${event.version})`);
    return event;
  }

  _updateProjections(event) {
    for (const [name, projection] of this.projections) {
      try {
        projection.state = projection.handler(projection.state, event);
        projection.version++;
        this.stats.totalProjectionsUpdated++;
      } catch (error) {
        console.error(`[EventSourcing] Projection ${name} error:`, error);
      }
    }
  }

  _createSnapshot(stream) {
    const snapshot = {
      id: `snap-${Date.now()}-${crypto.randomBytes(2).toString('hex')}`,
      streamId: stream.id,
      aggregateId: stream.aggregateId,
      state: this._rebuildState(stream),
      version: stream.version,
      timestamp: Date.now()
    };

    this.snapshots.set(stream.id, snapshot);
    this.stats.totalSnapshotsCreated++;

    console.log(`[EventSourcing] Created snapshot for ${stream.id} at version ${snapshot.version}`);
    return snapshot;
  }

  _rebuildState(stream, fromVersion = 0) {
    let state = null;

    for (const event of stream.events) {
      if (event.version <= fromVersion) continue;

      switch (event.type) {
        case 'deposit':
          if (!state) state = { balance: 0 };
          state.balance += event.data.amount;
          break;
        case 'withdrawal':
          if (!state) state = { balance: 0 };
          state.balance -= event.data.amount;
          break;
        case 'item-added':
          if (!state) state = { items: [], status: 'created' };
          state.items.push(event.data);
          break;
        case 'order-confirmed':
          if (!state) state = { items: [], status: 'created' };
          state.status = 'confirmed';
          break;
        case 'order-shipped':
          if (!state) state = { items: [], status: 'created' };
          state.status = 'shipped';
          break;
        case 'order-delivered':
          if (!state) state = { items: [], status: 'created' };
          state.status = 'delivered';
          break;
        default:
          if (!state) state = {};
          state[`_${event.type}`] = event.data;
      }
    }

    return state;
  }

  getEvents(streamId, options = {}) {
    const stream = this.getStream(streamId);
    let events = stream.events;

    if (options.fromVersion !== undefined) {
      events = events.filter(e => e.version > options.fromVersion);
    }
    if (options.toVersion !== undefined) {
      events = events.filter(e => e.version <= options.toVersion);
    }
    if (options.eventType) {
      events = events.filter(e => e.type === options.eventType);
    }
    if (options.limit) {
      events = events.slice(-options.limit);
    }

    return events;
  }

  getSnapshot(streamId) {
    return this.snapshots.get(streamId);
  }

  rebuildFromSnapshot(streamId) {
    const snapshot = this.getSnapshot(streamId);
    if (!snapshot) {
      throw new Error(`No snapshot found for stream: ${streamId}`);
    }

    const stream = this.getStream(streamId);
    return this._rebuildState(stream, snapshot.version);
  }

  getProjection(projectionName) {
    const projection = this.projections.get(projectionName);
    if (!projection) {
      throw new Error(`Projection not found: ${projectionName}`);
    }
    return projection;
  }

  listProjections() {
    return Array.from(this.projections.values()).map(p => ({
      name: p.name,
      version: p.version,
      state: p.state
    }));
  }

  getStreamInfo(streamId) {
    const stream = this.getStream(streamId);
    return {
      id: stream.id,
      aggregateId: stream.aggregateId,
      version: stream.version,
      eventCount: stream.events.length,
      createdAt: stream.createdAt,
      updatedAt: stream.updatedAt,
      hasSnapshot: this.snapshots.has(streamId)
    };
  }

  listStreams() {
    return Array.from(this.streams.values()).map(s => ({
      id: s.id,
      aggregateId: s.aggregateId,
      version: s.version,
      eventCount: s.events.length
    }));
  }

  deleteStream(streamId) {
    const deleted = this.streams.delete(streamId);
    if (deleted) {
      this.snapshots.delete(streamId);
      console.log(`[EventSourcing] Deleted stream ${streamId}`);
    }
    return deleted;
  }

  getStatistics() {
    return {
      totalStreams: this.streams.size,
      totalEvents: this.stats.totalEventsAppended,
      totalSnapshots: this.stats.totalSnapshotsCreated,
      projections: this.stats.totalProjectionsUpdated,
      projectionsRegistered: this.projections.size
    };
  }

  shutdown() {
    console.log('Event sourcing shut down');
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const es = new AgentEventSourcing({
    snapshotInterval: 5,
    maxEventsPerStream: 1000
  });

  switch (command) {
    case 'list-streams':
      const streams = es.listStreams();
      console.log('Streams:');
      streams.forEach(s => console.log(`  - ${s.id}: ${s.aggregateId} (v${s.version}, ${s.eventCount} events)`));
      break;

    case 'create-stream':
      const stream = es.createStream(args[1], args[2] || 'aggregate-1');
      console.log('Stream created:', stream.id);
      break;

    case 'append':
      const event = es.appendEvent(args[1], args[2], { data: args[3] || 'test' });
      console.log('Event appended:', event.id);
      break;

    case 'events':
      const events = es.getEvents(args[1]);
      console.log('Events:');
      events.forEach(e => console.log(`  - [v${e.version}] ${e.type}: ${JSON.stringify(e.data)}`));
      break;

    case 'snapshot':
      const snapshot = es.getSnapshot(args[1]);
      console.log('Snapshot:', snapshot);
      break;

    case 'projections':
      const projections = es.listProjections();
      console.log('Projections:');
      projections.forEach(p => console.log(`  - ${p.name}: v${p.version} - ${JSON.stringify(p.state)}`));
      break;

    case 'stats':
      const stats = es.getStatistics();
      console.log('Event Sourcing Statistics:', stats);
      break;

    case 'demo':
      console.log('=== Agent Event Sourcing Demo ===\n');

      console.log('1. Registered Projections:');
      const projList = es.listProjections();
      projList.forEach(p => {
        console.log(`   - ${p.name}: ${JSON.stringify(p.state)}`);
      });

      console.log('\n2. Creating Event Streams:');
      const accountStream = es.createStream('account-001', 'account:user-123');
      console.log(`   Created: ${accountStream.id} (aggregate: ${accountStream.aggregateId})`);

      const orderStream = es.createStream('order-001', 'order:order-456');
      console.log(`   Created: ${orderStream.id} (aggregate: ${orderStream.aggregateId})`);

      console.log('\n3. Appending Events:');
      es.appendEvent('account-001', 'deposit', { amount: 1000, description: 'Initial deposit' });
      console.log('   account-001: deposited 1000');

      es.appendEvent('account-001', 'deposit', { amount: 500, description: 'Bonus' });
      console.log('   account-001: deposited 500');

      es.appendEvent('account-001', 'withdrawal', { amount: 200, description: 'Withdrawal' });
      console.log('   account-001: withdrew 200');

      es.appendEvent('account-001', 'deposit', { amount: 100, description: 'Refund' });
      console.log('   account-001: deposited 100');

      es.appendEvent('account-001', 'withdrawal', { amount: 50, description: 'Fee' });
      console.log('   account-001: withdrew 50');

      es.appendEvent('account-001', 'deposit', { amount: 75, description: 'Deposit' });
      console.log('   account-001: deposited 75 (snapshot created)');

      es.appendEvent('order-001', 'item-added', { itemId: 'item-1', name: 'Laptop', price: 999 });
      console.log('   order-001: added Laptop');

      es.appendEvent('order-001', 'item-added', { itemId: 'item-2', name: 'Mouse', price: 29 });
      console.log('   order-001: added Mouse');

      es.appendEvent('order-001', 'order-confirmed', { customerId: 'cust-123' });
      console.log('   order-001: confirmed');

      es.appendEvent('order-001', 'order-shipped', { trackingNumber: 'TRACK-123' });
      console.log('   order-001: shipped');

      es.appendEvent('order-001', 'order-delivered', {});
      console.log('   order-001: delivered');

      console.log('\n4. Events in account-001:');
      const accountEvents = es.getEvents('account-001');
      accountEvents.forEach(e => {
        console.log(`   [v${e.version}] ${e.type}: ${JSON.stringify(e.data)}`);
      });

      console.log('\n5. Events in order-001:');
      const orderEvents = es.getEvents('order-001');
      orderEvents.forEach(e => {
        console.log(`   [v${e.version}] ${e.type}: ${JSON.stringify(e.data)}`);
      });

      console.log('\n6. Snapshots:');
      const accSnapshot = es.getSnapshot('account-001');
      if (accSnapshot) {
        console.log(`   account-001: version ${accSnapshot.version}, state: ${JSON.stringify(accSnapshot.state)}`);
      }

      const ordSnapshot = es.getSnapshot('order-001');
      if (ordSnapshot) {
        console.log(`   order-001: version ${ordSnapshot.version}, state: ${JSON.stringify(ordSnapshot.state)}`);
      }

      console.log('\n7. Projections:');
      const finalProj = es.listProjections();
      finalProj.forEach(p => {
        console.log(`   - ${p.name}: ${JSON.stringify(p.state)}`);
      });

      console.log('\n8. Stream Information:');
      const accInfo = es.getStreamInfo('account-001');
      console.log(`   account-001: ${accInfo.eventCount} events, version ${accInfo.version}, snapshot: ${accInfo.hasSnapshot}`);

      const ordInfo = es.getStreamInfo('order-001');
      console.log(`   order-001: ${ordInfo.eventCount} events, version ${ordInfo.version}, snapshot: ${ordInfo.hasSnapshot}`);

      console.log('\n9. Statistics:');
      const finalStats = es.getStatistics();
      console.log(`   Total streams: ${finalStats.totalStreams}`);
      console.log(`   Total events: ${finalStats.totalEvents}`);
      console.log(`   Total snapshots: ${finalStats.totalSnapshots}`);
      console.log(`   Projections updated: ${finalStats.projections}`);
      console.log(`   Projections registered: ${finalStats.projectionsRegistered}`);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-event-sourcing.js <command> [args]');
      console.log('\nCommands:');
      console.log('  list-streams           List event streams');
      console.log('  create-stream <id>    Create event stream');
      console.log('  append <stream> <type> Append event');
      console.log('  events <stream>       Get stream events');
      console.log('  snapshot <stream>    Get snapshot');
      console.log('  projections           List projections');
      console.log('  stats                Get statistics');
      console.log('  demo                 Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentEventSourcing;
