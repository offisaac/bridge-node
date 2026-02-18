/**
 * Agent Renewable - Renewable Energy Management Agent
 *
 * Manages solar, wind, hydro, and other renewable energy sources.
 *
 * Usage: node agent-renewable.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   source  - List sources
 *   list    - List all renewable data
 */

let renewIdCounter = 0;
class RenewableSource {
  constructor(config) {
    this.id = `renew-${Date.now()}-${++renewIdCounter}`;
    this.name = config.name;
    this.type = config.type; // solar, wind, hydro, geothermal, biomass
    this.capacity = config.capacity || 0; // kW
    this.currentOutput = config.currentOutput || 0;
    this.location = config.location;
    this.status = 'active'; // active, inactive, maintenance
    this.efficiency = config.efficiency || 0; // percentage
    this.installedDate = config.installedDate || Date.now();
  }

  updateOutput(output) {
    this.currentOutput = Math.min(output, this.capacity);
    this.efficiency = (this.currentOutput / this.capacity * 100).toFixed(2);
  }
}

class SolarArray extends RenewableSource {
  constructor(config) {
    super({ ...config, type: 'solar' });
    this.panels = config.panels || 0;
    this.tiltAngle = config.tiltAngle || 30;
    this.tracking = config.tracking || false; // fixed, single-axis, dual-axis
  }

  calculateOutput(irradiance, temp) {
    // Simplified calculation
    const efficiency = 0.18 - (temp - 25) * 0.004;
    const output = this.panels * 0.4 * irradiance * efficiency;
    this.updateOutput(output);
    return output;
  }
}

class WindTurbine extends RenewableSource {
  constructor(config) {
    super({ ...config, type: 'wind' });
    this.rotorDiameter = config.rotorDiameter || 0;
    this.cutInSpeed = config.cutInSpeed || 3; // m/s
    this.cutOutSpeed = config.cutOutSpeed || 25;
    this.currentWindSpeed = 0;
  }

  calculateOutput(windSpeed) {
    this.currentWindSpeed = windSpeed;
    let output = 0;

    if (windSpeed < this.cutInSpeed || windSpeed > this.cutOutSpeed) {
      output = 0;
    } else if (windSpeed < this.ratedSpeed) {
      output = this.capacity * Math.pow((windSpeed - this.cutInSpeed) / (this.ratedSpeed - this.cutInSpeed), 3);
    } else {
      output = this.capacity;
    }

    this.updateOutput(output);
    return output;
  }
}

class HydroPlant extends RenewableSource {
  constructor(config) {
    super({ ...config, type: 'hydro' });
    this.head = config.head || 0; // meters
    this.flowRate = config.flowRate || 0; // m3/s
    this.turbineType = config.turbineType || 'francis';
  }

  calculateOutput() {
    const output = 9.81 * this.head * this.flowRate * 0.85; // kW
    this.updateOutput(output);
    return output;
  }
}

let storageIdCounter = 0;
class EnergyStorage {
  constructor(config) {
    this.id = `storage-${Date.now()}-${++storageIdCounter}`;
    this.name = config.name;
    this.type = config.type; // battery, pumped, compressed
    this.capacity = config.capacity || 0; // kWh
    this.currentCharge = config.currentCharge || 0;
    this.maxChargeRate = config.maxChargeRate || 0;
    this.maxDischargeRate = config.maxDischargeRate || 0;
    this.efficiency = config.efficiency || 0.9;
  }

  charge(amount) {
    const actual = Math.min(amount, this.maxChargeRate, this.capacity - this.currentCharge);
    this.currentCharge += actual * this.efficiency;
    return actual;
  }

  discharge(amount) {
    const actual = Math.min(amount, this.maxDischargeRate, this.currentCharge);
    this.currentCharge -= actual / this.efficiency;
    return actual;
  }

  getChargeLevel() {
    return (this.currentCharge / this.capacity * 100).toFixed(2);
  }
}

let creditIdCounter = 0;
class CarbonCredit {
  constructor(config) {
    this.id = `credit-${Date.now()}-${++creditIdCounter}`;
    this.sourceId = config.sourceId;
    this.amount = config.amount; // tons CO2
    this.price = config.price || 0; // per ton
    this.status = 'available'; // available, sold, retired
    this.createdAt = Date.now();
  }

  sell() {
    this.status = 'sold';
  }

  retire() {
    this.status = 'retired';
  }
}

class RenewableAgent {
  constructor(config = {}) {
    this.sources = new Map();
    this.storage = new Map();
    this.credits = new Map();
    this.stats = {
      totalCapacity: 0,
      totalOutput: 0,
      sourcesActive: 0,
      carbonOffset: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    // Demo sources
    const sources = [
      new SolarArray({ name: 'Desert Solar Farm', location: 'Arizona', capacity: 500, panels: 1500, efficiency: 85 }),
      new WindTurbine({ name: 'Coastal Wind Farm', location: 'Oregon', capacity: 300, rotorDiameter: 120, ratedSpeed: 12 }),
      new HydroPlant({ name: 'Mountain Hydro', location: 'Colorado', capacity: 200, head: 150, flowRate: 20 })
    ];

    sources.forEach(s => {
      this.sources.set(s.id, s);
      this.stats.totalCapacity += s.capacity;
      if (s.status === 'active') this.stats.sourcesActive++;
    });

    // Demo storage
    const battery = new EnergyStorage({
      name: 'Grid Battery',
      type: 'battery',
      capacity: 1000,
      currentCharge: 750,
      maxChargeRate: 200,
      maxDischargeRate: 250
    });
    this.storage.set(battery.id, battery);
  }

  addSource(config) {
    let source;
    switch (config.type) {
      case 'solar':
        source = new SolarArray(config);
        break;
      case 'wind':
        source = new WindTurbine(config);
        break;
      case 'hydro':
        source = new HydroPlant(config);
        break;
      default:
        source = new RenewableSource(config);
    }

    this.sources.set(source.id, source);
    this.stats.totalCapacity += source.capacity;
    if (source.status === 'active') this.stats.sourcesActive++;
    console.log(`   Added renewable source: ${source.name} (${source.type})`);
    return source;
  }

  addStorage(config) {
    const storage = new EnergyStorage(config);
    this.storage.set(storage.id, storage);
    console.log(`   Added energy storage: ${storage.name}`);
    return storage;
  }

  generateCarbonCredits() {
    let totalOutput = 0;
    this.sources.forEach(source => {
      totalOutput += source.currentOutput;
    });

    // Simplified: 0.4 kg CO2 offset per kWh
    const offset = totalOutput * 0.0004;
    this.stats.carbonOffset += offset;

    const credit = new CarbonCredit({
      sourceId: 'grid',
      amount: offset,
      price: 50
    });

    this.credits.set(credit.id, credit);
    return credit;
  }

  chargeStorage(storageId, amount) {
    const storage = this.storage.get(storageId);
    if (!storage) {
      return { success: false, reason: 'Storage not found' };
    }

    const charged = storage.charge(amount);
    return { success: true, charged, level: storage.getChargeLevel() };
  }

  dischargeStorage(storageId, amount) {
    const storage = this.storage.get(storageId);
    if (!storage) {
      return { success: false, reason: 'Storage not found' };
    }

    const discharged = storage.discharge(amount);
    return { success: true, discharged, level: storage.getChargeLevel() };
  }

  getTotalOutput() {
    let total = 0;
    this.sources.forEach(source => {
      if (source.status === 'active') {
        total += source.currentOutput;
      }
    });
    this.stats.totalOutput = total;
    return total;
  }

  getRenewablePercentage() {
    const total = this.stats.totalCapacity;
    const output = this.getTotalOutput();
    if (total === 0) return 0;
    return (output / total * 100).toFixed(2);
  }

  listSources(type = null) {
    if (type) {
      return Array.from(this.sources.values()).filter(s => s.type === type);
    }
    return Array.from(this.sources.values());
  }

  getStats() {
    return {
      ...this.stats,
      totalOutput: this.getTotalOutput(),
      renewablePercentage: this.getRenewablePercentage(),
      storageCapacity: Array.from(this.storage.values()).reduce((sum, s) => sum + s.capacity, 0),
      creditsAvailable: Array.from(this.credits.values()).filter(c => c.status === 'available').length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const renewable = new RenewableAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Renewable Demo\n');

    // 1. List Sources
    console.log('1. Renewable Sources:');
    const sources = renewable.listSources();
    sources.forEach(s => {
      console.log(`   - ${s.name}: ${s.currentOutput}/${s.capacity} kW (${s.type})`);
    });

    // 2. Add Source
    console.log('\n2. Add Renewable Source:');
    renewable.addSource({
      name: 'Rooftop Solar',
      type: 'solar',
      location: 'Office Building',
      capacity: 50,
      panels: 150,
      efficiency: 90
    });

    // 3. Calculate Solar Output
    console.log('\n3. Solar Output:');
    const solar = renewable.listSources('solar')[0];
    const solarOutput = solar.calculateOutput(1000, 28); // irradiance, temp
    console.log(`   Output: ${solarOutput.toFixed(2)} kW`);

    // 4. Calculate Wind Output
    console.log('\n4. Wind Output:');
    const wind = renewable.listSources('wind')[0];
    const windOutput = wind.calculateOutput(10);
    console.log(`   Output: ${windOutput.toFixed(2)} kW at ${wind.currentWindSpeed} m/s`);

    // 5. Calculate Hydro Output
    console.log('\n5. Hydro Output:');
    const hydro = renewable.listSources('hydro')[0];
    const hydroOutput = hydro.calculateOutput();
    console.log(`   Output: ${hydroOutput.toFixed(2)} kW`);

    // 6. Storage
    console.log('\n6. Energy Storage:');
    const storage = Array.from(renewable.storage.values())[0];
    console.log(`   Charge Level: ${storage.getChargeLevel()}%`);

    // 7. Charge Storage
    console.log('\n7. Charge Storage:');
    const charge = renewable.chargeStorage(storage.id, 150);
    console.log(`   Charged: ${charge.charged} kWh, Level: ${charge.level}%`);

    // 8. Discharge Storage
    console.log('\n8. Discharge Storage:');
    const discharge = renewable.dischargeStorage(storage.id, 100);
    console.log(`   Discharged: ${discharge.discharged} kWh, Level: ${discharge.level}%`);

    // 9. Carbon Credits
    console.log('\n9. Carbon Credits:');
    const credit = renewable.generateCarbonCredits();
    console.log(`   Generated: ${credit.amount.toFixed(4)} tons CO2 offset`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = renewable.getStats();
    console.log(`   Total Capacity: ${stats.totalCapacity} kW`);
    console.log(`   Total Output: ${stats.totalOutput.toFixed(2)} kW`);
    console.log(`   Renewable %: ${stats.renewablePercentage}%`);
    console.log(`   Carbon Offset: ${stats.carbonOffset.toFixed(4)} tons`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'source':
    console.log('Renewable Sources:');
    renewable.listSources().forEach(s => {
      console.log(`  ${s.name}: ${s.type} (${s.currentOutput}/${s.capacity} kW)`);
    });
    break;

  case 'list':
    console.log('Renewable Energy Data:');
    console.log(`Sources: ${renewable.sources.size}`);
    console.log(`Storage: ${renewable.storage.size}`);
    console.log(`Credits: ${renewable.credits.size}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-renewable.js [demo|source|list]');
}
