/**
 * Agent Utilities - Utilities Management Agent
 *
 * Manages utility services like water, gas, electricity, and waste.
 *
 * Usage: node agent-utilities.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   service - List services
 *   list    - List all utilities
 */

class UtilityService {
  static idCounter = 0;
  constructor(config) {
    this.id = `util-${Date.now()}-${++UtilityService.idCounter}`;
    this.name = config.name;
    this.type = config.type; // water, gas, electricity, waste, internet
    this.provider = config.provider;
    this.accountNumber = config.accountNumber || this.generateAccount();
    this.status = 'active'; // active, suspended, disconnected
    this.consumption = 0;
    this.unit = config.unit || 'units';
  }

  generateAccount() {
    return 'ACCT' + Math.floor(Math.random() * 1000000);
  }

  updateConsumption(amount) {
    this.consumption += amount;
  }

  suspend() {
    this.status = 'suspended';
  }

  reconnect() {
    this.status = 'active';
  }

  disconnect() {
    this.status = 'disconnected';
  }
}

class WaterUtility extends UtilityService {
  constructor(config) {
    super({ ...config, type: 'water', unit: 'gallons' });
    this.meterReading = config.meterReading || 0;
    this.usageRate = config.usageRate || 0.005; // per gallon
  }

  updateMeter(reading) {
    const previous = this.meterReading;
    this.meterReading = reading;
    const usage = reading - previous;
    this.consumption = reading;
    return usage;
  }
}

class GasUtility extends UtilityService {
  constructor(config) {
    super({ ...config, type: 'gas', unit: 'therms' });
    this.pressure = config.pressure || 0;
    this.usageRate = config.usageRate || 1.50; // per therm
  }

  updatePressure(pressure) {
    this.pressure = pressure;
  }
}

class ElectricityUtility extends UtilityService {
  constructor(config) {
    super({ ...config, type: 'electricity', unit: 'kWh' });
    this.voltage = config.voltage || 120;
    this.usageRate = config.usageRate || 0.12; // per kWh
    this.peakUsage = 0;
  }

  recordUsage(kwh) {
    this.consumption += kwh;
    if (kwh > this.peakUsage) {
      this.peakUsage = kwh;
    }
  }
}

class WasteUtility extends UtilityService {
  constructor(config) {
    super({ ...config, type: 'waste', unit: 'lbs' });
    this.recycling = config.recycling || 0;
    this.composting = config.composting || 0;
    this.landfill = config.landfill || 0;
  }

  recordWaste(amount, category) {
    this.consumption += amount;
    if (category === 'recycling') this.recycling += amount;
    else if (category === 'composting') this.composting += amount;
    else this.landfill += amount;
  }

  getRecyclingRate() {
    if (this.consumption === 0) return 0;
    return ((this.recycling + this.composting) / this.consumption * 100).toFixed(2);
  }
}

class Bill {
  constructor(config) {
    this.id = `bill-${Date.now()}`;
    this.serviceId = config.serviceId;
    this.period = config.period;
    this.amount = config.amount;
    this.status = 'pending'; // pending, paid, overdue
    this.dueDate = config.dueDate;
  }

  pay() {
    this.status = 'paid';
  }

  markOverdue() {
    this.status = 'overdue';
  }
}

class UtilitiesAgent {
  constructor(config = {}) {
    this.services = new Map();
    this.bills = new Map();
    this.stats = {
      totalServices: 0,
      activeServices: 0,
      totalConsumption: 0,
      totalBills: 0
    };
    this.initDemoData();
  }

  initDemoData() {
    console.log('Initializing demo data...');
    // Demo utilities
    const services = [
      new WaterUtility({ name: 'City Water', provider: 'Water Dept', meterReading: 45000 }),
      new ElectricityUtility({ name: 'Power Grid', provider: 'Electric Co', consumption: 2500 }),
      new GasUtility({ name: 'Gas Service', provider: 'Gas Corp', pressure: 25 }),
      new WasteUtility({ name: 'Waste Management', provider: 'Clean Co', consumption: 1200 })
    ];

    console.log('Services array length:', services.length);
    services.forEach(s => {
      console.log('Adding service:', s.name, s.type);
      this.services.set(s.id, s);
      this.stats.totalServices++;
      if (s.status === 'active') this.stats.activeServices++;
    });
    console.log('Total services in map:', this.services.size);
  }

  addService(config) {
    let service;
    switch (config.type) {
      case 'water':
        service = new WaterUtility(config);
        break;
      case 'gas':
        service = new GasUtility(config);
        break;
      case 'electricity':
        service = new ElectricityUtility(config);
        break;
      case 'waste':
        service = new WasteUtility(config);
        break;
      default:
        service = new UtilityService(config);
    }

    this.services.set(service.id, service);
    this.stats.totalServices++;
    if (service.status === 'active') this.stats.activeServices++;
    console.log(`   Added utility: ${service.name} (${service.type})`);
    return service;
  }

  createBill(serviceId, period, amount, dueDate) {
    const service = this.services.get(serviceId);
    if (!service) {
      return { success: false, reason: 'Service not found' };
    }

    const bill = new Bill({
      serviceId,
      period,
      amount,
      dueDate
    });

    this.bills.set(bill.id, bill);
    this.stats.totalBills++;
    console.log(`   Created bill: $${amount} for ${service.name}`);
    return bill;
  }

  payBill(billId) {
    const bill = this.bills.get(billId);
    if (!bill) {
      return { success: false, reason: 'Bill not found' };
    }

    bill.pay();
    return { success: true, bill };
  }

  getService(serviceId) {
    return this.services.get(serviceId);
  }

  listServices(type = null) {
    if (type) {
      return Array.from(this.services.values()).filter(s => s.type === type);
    }
    return Array.from(this.services.values());
  }

  getConsumptionSummary() {
    let water = 0, electricity = 0, gas = 0, waste = 0;

    this.services.forEach(s => {
      switch (s.type) {
        case 'water': water += s.consumption; break;
        case 'electricity': electricity += s.consumption; break;
        case 'gas': gas += s.consumption; break;
        case 'waste': waste += s.consumption; break;
      }
    });

    return { water, electricity, gas, waste };
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const utilities = new UtilitiesAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Utilities Demo\n');

    // 1. List Services
    console.log('1. Utility Services:');
    const services = utilities.listServices();
    services.forEach(s => {
      console.log(`   - ${s.name}: ${s.type} (${s.status})`);
    });

    // 2. Add Service
    console.log('\n2. Add Utility Service:');
    utilities.addService({
      name: 'Fiber Internet',
      provider: 'NetFast',
      type: 'internet',
      consumption: 0
    });

    // 3. Water Usage
    console.log('\n3. Water Utility:');
    const water = utilities.listServices('water')[0];
    const usage = water.updateMeter(45500);
    console.log(`   Usage: ${usage} gallons, Total: ${water.consumption} gallons`);

    // 4. Electricity Usage
    console.log('\n4. Electricity Utility:');
    const electric = utilities.listServices('electricity')[0];
    electric.recordUsage(125);
    console.log(`   New consumption: ${electric.consumption} kWh, Peak: ${electric.peakUsage} kWh`);

    // 5. Waste Management
    console.log('\n5. Waste Management:');
    const waste = utilities.listServices('waste')[0];
    waste.recordWaste(150, 'recycling');
    waste.recordWaste(80, 'composting');
    console.log(`   Recycling rate: ${waste.getRecyclingRate()}%`);

    // 6. Create Bill
    console.log('\n6. Create Bill:');
    const bill = utilities.createBill(electric.id, 'March 2024', 150.00, '2024-04-01');
    console.log(`   Bill created: $${bill.amount}`);

    // 7. Pay Bill
    console.log('\n7. Pay Bill:');
    utilities.payBill(bill.id);
    console.log(`   Status: ${bill.status}`);

    // 8. Consumption Summary
    console.log('\n8. Consumption Summary:');
    const summary = utilities.getConsumptionSummary();
    console.log(`   Water: ${summary.water} gallons`);
    console.log(`   Electricity: ${summary.electricity} kWh`);
    console.log(`   Waste: ${summary.waste} lbs`);

    // 9. List Bills
    console.log('\n9. Bills:');
    console.log(`   Total: ${utilities.bills.size}`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = utilities.getStats();
    console.log(`   Total Services: ${stats.totalServices}`);
    console.log(`   Active Services: ${stats.activeServices}`);
    console.log(`   Total Bills: ${stats.totalBills}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'service':
    console.log('Utility Services:');
    utilities.listServices().forEach(s => {
      console.log(`  ${s.name}: ${s.type} [${s.status}]`);
    });
    break;

  case 'list':
    console.log('All Utilities:');
    console.log(`Services: ${utilities.services.size}`);
    console.log(`Bills: ${utilities.bills.size}`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-utilities.js [demo|service|list]');
}
