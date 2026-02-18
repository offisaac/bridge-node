/**
 * Agent IoT - Internet of Things Management Agent
 *
 * Manages IoT devices, device provisioning, telemetry, and IoT workflows.
 *
 * Usage: node agent-iot.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   device  - Add device
 *   list    - List devices
 */

class IoTDevice {
  constructor(config) {
    this.id = `device-${Date.now()}`;
    this.name = config.name;
    this.type = config.type; // sensor, actuator, gateway, controller, wearable
    this.manufacturer = config.manufacturer || 'Unknown';
    this.model = config.model || 'Generic';
    this.serialNumber = config.serialNumber || `SN-${Date.now()}`;
    this.firmware = config.firmware || '1.0.0';
    this.status = 'offline'; // online, offline, error, maintenance
    this.location = config.location || null;
    this.metadata = config.metadata || {};
    this.telemetry = {};
    this.lastSeen = null;
    this.createdAt = Date.now();
  }

  comeOnline() {
    this.status = 'online';
    this.lastSeen = Date.now();
  }

  goOffline() {
    this.status = 'offline';
  }

  setError(error) {
    this.status = 'error';
    this.metadata.lastError = error;
  }

  updateTelemetry(data) {
    this.telemetry = { ...this.telemetry, ...data };
    this.lastSeen = Date.now();
    this.status = 'online';
  }
}

class IoTGateway {
  constructor(config) {
    this.id = `gateway-${Date.now()}`;
    this.name = config.name;
    this.protocol = config.protocol || 'mqtt'; // mqtt, http, coap, websocket
    this.host = config.host || 'localhost';
    this.port = config.port || 1883;
    this.devices = [];
    this.status = 'active';
    this.connectedAt = Date.now();
  }

  addDevice(deviceId) {
    if (!this.devices.includes(deviceId)) {
      this.devices.push(deviceId);
    }
  }

  removeDevice(deviceId) {
    this.devices = this.devices.filter(id => id !== deviceId);
  }
}

class TelemetryData {
  constructor(config) {
    this.id = `telemetry-${Date.now()}`;
    this.deviceId = config.deviceId;
    this.timestamp = config.timestamp || Date.now();
    this.metrics = config.metrics || {};
    this.location = config.location || null;
    this.battery = config.battery || null; // percentage
    this.signal = config.signal || null; // dBm
  }
}

class IoTAgent {
  constructor(config = {}) {
    this.devices = new Map();
    this.gateways = new Map();
    this.telemetry = new Map();
    this.deviceProfiles = new Map();
    this.stats = {
      devicesRegistered: 0,
      devicesOnline: 0,
      messagesReceived: 0
    };
    this.initProfiles();
    this.initDemoDevices();
  }

  initProfiles() {
    const profiles = [
      { name: 'Temperature Sensor', type: 'sensor', metrics: ['temperature', 'humidity'] },
      { name: 'Smart Light', type: 'actuator', metrics: ['power', 'brightness'] },
      { name: 'Security Camera', type: 'sensor', metrics: ['motion', 'video'] },
      { name: 'Smart Thermostat', type: 'controller', metrics: ['temperature', 'setpoint', 'mode'] },
      { name: 'Wearable Device', type: 'wearable', metrics: ['heartRate', 'steps', 'sleep'] }
    ];
    profiles.forEach(p => this.deviceProfiles.set(p.name, p));
  }

  initDemoDevices() {
    // Create demo devices
  }

  registerDevice(config) {
    const device = new IoTDevice(config);
    this.devices.set(device.id, device);
    this.stats.devicesRegistered++;
    console.log(`   Registered device: ${device.name} (${device.type})`);
    return device;
  }

  addDevice(config) {
    return this.registerDevice(config);
  }

  deviceOnline(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, reason: 'Device not found' };
    }
    device.comeOnline();
    this.stats.devicesOnline++;
    console.log(`   Device online: ${device.name}`);
    return { success: true, device };
  }

  deviceOffline(deviceId) {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, reason: 'Device not found' };
    }
    device.goOffline();
    console.log(`   Device offline: ${device.name}`);
    return { success: true, device };
  }

  sendTelemetry(deviceId, data) {
    const device = this.devices.get(deviceId);
    if (!device) {
      return { success: false, reason: 'Device not found' };
    }

    const telemetry = new TelemetryData({
      deviceId,
      metrics: data,
      battery: data.battery,
      signal: data.signal,
      location: device.location
    });

    device.updateTelemetry(data);
    this.telemetry.set(telemetry.id, telemetry);
    this.stats.messagesReceived++;

    console.log(`   Telemetry received from ${device.name}`);
    return { success: true, telemetry };
  }

  registerGateway(config) {
    const gateway = new IoTGateway(config);
    this.gateways.set(gateway.id, gateway);
    console.log(`   Registered gateway: ${gateway.name} (${gateway.protocol})`);
    return gateway;
  }

  addDeviceToGateway(deviceId, gatewayId) {
    const device = this.devices.get(deviceId);
    const gateway = this.gateways.get(gatewayId);

    if (!device || !gateway) {
      return { success: false, reason: 'Device or gateway not found' };
    }

    gateway.addDevice(deviceId);
    console.log(`   Added ${device.name} to gateway ${gateway.name}`);
    return { success: true };
  }

  getDevice(deviceId) {
    return this.devices.get(deviceId);
  }

  getDeviceTelemetry(deviceId, limit = 10) {
    return Array.from(this.telemetry.values())
      .filter(t => t.deviceId === deviceId)
      .slice(-limit);
  }

  listDevices(status = null) {
    const devices = Array.from(this.devices.values());
    if (status) {
      return devices.filter(d => d.status === status);
    }
    return devices;
  }

  listDevicesByType(type) {
    return Array.from(this.devices.values()).filter(d => d.type === type);
  }

  listGateways() {
    return Array.from(this.gateways.values());
  }

  getStats() {
    return {
      ...this.stats,
      devicesOffline: this.stats.devicesRegistered - this.stats.devicesOnline,
      gateways: this.gateways.size
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new IoTAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent IoT Demo\n');

    // 1. Show Device Profiles
    console.log('1. Device Profiles:');
    for (const profile of agent.deviceProfiles.values()) {
      console.log(`   ${profile.name}: ${profile.type} - ${profile.metrics.join(', ')}`);
    }

    // 2. Register Devices
    console.log('\n2. Register IoT Devices:');
    const dev1 = agent.registerDevice({
      name: 'Living Room Sensor',
      type: 'sensor',
      manufacturer: 'SmartHome Inc',
      model: 'TH-100',
      location: 'Living Room'
    });
    const dev2 = agent.registerDevice({
      name: 'Front Door Camera',
      type: 'sensor',
      manufacturer: 'SecureCam',
      model: 'SC-2000',
      location: 'Front Door'
    });
    const dev3 = agent.registerDevice({
      name: 'Kitchen Light',
      type: 'actuator',
      manufacturer: 'LumiLED',
      model: 'LL-Smart',
      location: 'Kitchen'
    });
    const dev4 = agent.registerDevice({
      name: 'Bedroom Thermostat',
      type: 'controller',
      manufacturer: 'ThermoSmart',
      model: 'TS-500',
      location: 'Bedroom'
    });

    // 3. Device Online
    console.log('\n3. Bring Devices Online:');
    agent.deviceOnline(dev1.id);
    agent.deviceOnline(dev2.id);
    agent.deviceOnline(dev3.id);
    agent.deviceOnline(dev4.id);

    // 4. Send Telemetry
    console.log('\n4. Receive Telemetry:');
    agent.sendTelemetry(dev1.id, { temperature: 22.5, humidity: 45, battery: 85, signal: -45 });
    agent.sendTelemetry(dev1.id, { temperature: 23.0, humidity: 44, battery: 84 });
    agent.sendTelemetry(dev2.id, { motion: true, battery: 92, signal: -50 });
    agent.sendTelemetry(dev3.id, { power: 12, brightness: 75 });
    agent.sendTelemetry(dev4.id, { temperature: 22.0, setpoint: 23.0, mode: 'heating' });

    // 5. Register Gateway
    console.log('\n5. Register Gateway:');
    const gw = agent.registerGateway({
      name: 'Home Hub',
      protocol: 'mqtt',
      host: 'mqtt.smarthome.local',
      port: 1883
    });

    // 6. Add Devices to Gateway
    console.log('\n6. Connect Devices to Gateway:');
    agent.addDeviceToGateway(dev1.id, gw.id);
    agent.addDeviceToGateway(dev2.id, gw.id);

    // 7. Get Device Telemetry
    console.log('\n7. Device Telemetry History:');
    const history = agent.getDeviceTelemetry(dev1.id);
    console.log(`   ${dev1.name}: ${history.length} readings`);

    // 8. List All Devices
    console.log('\n8. All Devices:');
    const devices = agent.listDevices();
    devices.forEach(d => {
      console.log(`   ${d.name}: ${d.status} (${d.type})`);
    });

    // 9. Statistics
    console.log('\n9. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total Devices: ${stats.devicesRegistered}`);
    console.log(`   Online: ${stats.devicesOnline}`);
    console.log(`   Offline: ${stats.devicesOffline}`);
    console.log(`   Gateways: ${stats.gateways}`);
    console.log(`   Messages Received: ${stats.messagesReceived}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'device':
    console.log('Adding test device...');
    const d = agent.addDevice({
      name: 'Test Device',
      type: 'sensor',
      location: 'Test Lab'
    });
    console.log(`Added device: ${d.id}`);
    break;

  case 'list':
    console.log('Listing devices...');
    for (const d of agent.devices.values()) {
      console.log(`   ${d.name}: ${d.status} (${d.type})`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-iot.js [demo|device|list]');
}
