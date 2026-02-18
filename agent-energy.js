/**
 * Agent Energy - Energy Management Agent
 *
 * Manages energy consumption, production, and distribution.
 *
 * Usage: node agent-energy.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   meter   - List meters
 *   list    - List all energy data
 */

class EnergyMeter {
  constructor(config) {
    this.id = `meter-${Date.now()}`;
    this.name = config.name;
    this.location = config.location;
    this.type = config.type; // residential, commercial, industrial
    this.currentReading = config.currentReading || 0;
    this.unit = config.unit || 'kWh';
    this.lastUpdated = Date.now();
  }

  updateReading(reading) {
    this.currentReading = reading;
    this.lastUpdated = Date.now();
  }
}

class EnergySource {
  constructor(config) {
    this.id = `source-${Date.now()}`;
    this.name = config.name;
    this.type = config.type; // grid, solar, wind, generator, battery
    this.capacity = config.capacity || 0; // kW
    this.currentOutput = config.currentOutput || 0;
    this.status = 'active'; // active, inactive, maintenance
  }

  updateOutput(output) {
    this.currentOutput = Math.min(output, this.capacity);
  }
}

class EnergyConsumption {
  constructor(config) {
    this.id = `consumption-${Date.now()}`;
    this.meterId = config.meterId;
    this.timestamp = Date.now();
    this.value = config.value; // kWh
    this.cost = config.cost || 0;
    this.period = config.period || 'hourly'; // hourly, daily, monthly
  }
}

class BillingCycle {
  constructor(config) {
    this.id = `billing-${Date.now()}`;
    this.startDate = config.startDate;
    this.endDate = config.endDate;
    this.totalConsumption = 0;
    this.totalCost = 0;
    this.readings = [];
  }

  addReading(reading) {
    this.readings.push(reading);
    this.totalConsumption += reading.value;
    this.totalCost += reading.cost;
  }
}

class EnergyAgent {
  constructor(config = {}) {
    this.meters = new Map();
    this.sources = new Map();
    this.consumption = new Map();
    this.billingCycles = new Map();
    this.stats = {
      totalConsumption: 0,
      totalCost: 0,
      peakDemand: 0,
      sourcesActive: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo meters
    const meters = [
      { name: 'Main Building', location: 'HQ Building', type: 'commercial', currentReading: 15420 },
      { name: 'Factory Floor A', location: 'Industrial Zone', type: 'industrial', currentReading: 89750 },
      { name: 'Office Block B', location: 'Campus', type: 'commercial', currentReading: 5230 }
    ];

    meters.forEach(m => {
      const meter = new EnergyMeter(m);
      this.meters.set(meter.id, meter);
    });

    // Demo sources
    const sources = [
      { name: 'City Grid', type: 'grid', capacity: 1000, currentOutput: 750 },
      { name: 'Rooftop Solar', type: 'solar', capacity: 200, currentOutput: 180 },
      { name: 'Wind Turbine', type: 'wind', capacity: 150, currentOutput: 95 }
    ];

    sources.forEach(s => {
      const source = new EnergySource(s);
      this.sources.set(source.id, source);
      if (source.status === 'active') {
        this.stats.sourcesActive++;
      }
    });
  }

  addMeter(config) {
    const meter = new EnergyMeter(config);
    this.meters.set(meter.id, meter);
    console.log(`   Added meter: ${meter.name} at ${meter.location}`);
    return meter;
  }

  addSource(config) {
    const source = new EnergySource(config);
    this.sources.set(source.id, source);
    if (source.status === 'active') {
      this.stats.sourcesActive++;
    }
    console.log(`   Added energy source: ${source.name} (${source.type})`);
    return source;
  }

  recordConsumption(meterId, value, cost) {
    const meter = this.meters.get(meterId);
    if (!meter) {
      return { success: false, reason: 'Meter not found' };
    }

    meter.updateReading(meter.currentReading + value);

    const consumption = new EnergyConsumption({
      meterId,
      value,
      cost
    });

    this.consumption.set(consumption.id, consumption);
    this.stats.totalConsumption += value;
    this.stats.totalCost += cost;

    if (value > this.stats.peakDemand) {
      this.stats.peakDemand = value;
    }

    return { success: true, consumption };
  }

  getTotalProduction() {
    let total = 0;
    this.sources.forEach(source => {
      if (source.status === 'active') {
        total += source.currentOutput;
      }
    });
    return total;
  }

  getConsumptionByType(type) {
    let total = 0;
    this.meters.forEach(meter => {
      if (meter.type === type) {
        total += meter.currentReading;
      }
    });
    return total;
  }

  calculateEfficiency() {
    const production = this.getTotalProduction();
    const consumption = this.stats.totalConsumption;
    if (consumption === 0) return 0;
    return ((production / consumption) * 100).toFixed(2);
  }

  listMeters(type = null) {
    if (type) {
      return Array.from(this.meters.values()).filter(m => m.type === type);
    }
    return Array.from(this.meters.values());
  }

  getStats() {
    return {
      ...this.stats,
      totalProduction: this.getTotalProduction(),
      efficiency: this.calculateEfficiency(),
      meters: this.meters.size,
      sources: this.sources.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const energy = new EnergyAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Energy Demo\n');

    // 1. List Meters
    console.log('1. Energy Meters:');
    const meters = energy.listMeters();
    meters.forEach(m => {
      console.log(`   - ${m.name}: ${m.currentReading} ${m.unit} (${m.type})`);
    });

    // 2. Add Meter
    console.log('\n2. Add Meter:');
    energy.addMeter({
      name: 'Warehouse C',
      location: 'Logistics Center',
      type: 'industrial',
      currentReading: 12500
    });

    // 3. List Sources
    console.log('\n3. Energy Sources:');
    const sources = Array.from(energy.sources.values());
    sources.forEach(s => {
      console.log(`   - ${s.name}: ${s.currentOutput}/${s.capacity} kW (${s.status})`);
    });

    // 4. Add Source
    console.log('\n4. Add Energy Source:');
    energy.addSource({
      name: 'Battery Storage',
      type: 'battery',
      capacity: 500,
      currentOutput: 350
    });

    // 5. Record Consumption
    console.log('\n5. Record Consumption:');
    const meter = meters[0];
    energy.recordConsumption(meter.id, 150, 22.50);
    console.log(`   Recorded: 150 kWh, Cost: $22.50`);

    // 6. Get Total Production
    console.log('\n6. Energy Production:');
    const production = energy.getTotalProduction();
    console.log(`   Total: ${production} kW`);

    // 7. Consumption by Type
    console.log('\n7. Consumption by Type:');
    const commercial = energy.getConsumptionByType('commercial');
    const industrial = energy.getConsumptionByType('industrial');
    console.log(`   Commercial: ${commercial} kWh`);
    console.log(`   Industrial: ${industrial} kWh`);

    // 8. Calculate Efficiency
    console.log('\n8. Energy Efficiency:');
    const efficiency = energy.calculateEfficiency();
    console.log(`   Efficiency: ${efficiency}%`);

    // 9. Peak Demand
    console.log('\n9. Peak Demand:');
    console.log(`   Peak: ${energy.stats.peakDemand} kWh`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = energy.getStats();
    console.log(`   Total Consumption: ${stats.totalConsumption} kWh`);
    console.log(`   Total Cost: $${stats.totalCost}`);
    console.log(`   Active Sources: ${stats.sourcesActive}`);
    console.log(`   Efficiency: ${stats.efficiency}%`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'meter':
    console.log('Energy Meters:');
    energy.listMeters().forEach(m => {
      console.log(`  ${m.name}: ${m.currentReading} ${m.unit}`);
    });
    break;

  case 'list':
    console.log('All Energy Data:');
    console.log(`Meters: ${energy.meters.size}`);
    console.log(`Sources: ${energy.sources.size}`);
    console.log(`Consumption Records: ${energy.consumption.size}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-energy.js [demo|meter|list]');
}
