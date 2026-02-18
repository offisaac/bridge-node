/**
 * Agent Sensor - Sensor Management Agent
 *
 * Manages sensors, readings, thresholds, and sensor data processing.
 *
 * Usage: node agent-sensor.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   add     - Add sensor
 *   list    - List sensors
 */

class Sensor {
  constructor(config) {
    this.id = `sensor-${Date.now()}`;
    this.name = config.name;
    this.type = config.type; // temperature, humidity, pressure, motion, light, proximity, accelerometer
    this.unit = config.unit || this.getDefaultUnit(config.type);
    this.location = config.location || 'Unknown';
    this.status = 'inactive'; // active, inactive, error, calibrating
    this.value = null;
    this.lastReading = null;
    this.readings = [];
    this.threshold = config.threshold || null;
    this.alertEnabled = config.alertEnabled || false;
    this.calibration = config.calibration || { offset: 0, scale: 1 };
    this.createdAt = Date.now();
  }

  getDefaultUnit(type) {
    const units = {
      temperature: '°C',
      humidity: '%',
      pressure: 'hPa',
      light: 'lux',
      proximity: 'cm',
      accelerometer: 'g',
      gyroscope: '°/s',
      voltage: 'V',
      current: 'A',
      ph: 'pH'
    };
    return units[type] || 'unit';
  }

  activate() {
    this.status = 'active';
  }

  deactivate() {
    this.status = 'inactive';
  }

  setError() {
    this.status = 'error';
  }

  calibrate(offset, scale) {
    this.calibration = { offset, scale };
    this.status = 'calibrating';
    console.log(`   Calibrating sensor: ${this.name} (offset: ${offset}, scale: ${scale})`);
  }

  read(value) {
    const rawValue = value;
    const calibratedValue = (value + this.calibration.offset) * this.calibration.scale;

    this.value = calibratedValue;
    this.lastReading = Date.now();

    const reading = {
      timestamp: this.lastReading,
      raw: rawValue,
      calibrated: calibratedValue,
      unit: this.unit
    };

    this.readings.push(reading);

    // Keep only last 100 readings
    if (this.readings.length > 100) {
      this.readings.shift();
    }

    return reading;
  }

  checkThreshold(value) {
    if (!this.threshold || !this.alertEnabled) return { triggered: false };

    const { min, max, condition } = this.threshold;
    let triggered = false;
    let reason = '';

    if (condition === 'range') {
      if (value < min || value > max) {
        triggered = true;
        reason = `Value ${value} outside range [${min}, ${max}]`;
      }
    } else if (condition === 'above' && value > max) {
      triggered = true;
      reason = `Value ${value} above threshold ${max}`;
    } else if (condition === 'below' && value < min) {
      triggered = true;
      reason = `Value ${value} below threshold ${min}`;
    }

    return { triggered, reason };
  }
}

class SensorAlert {
  constructor(config) {
    this.id = `alert-${Date.now()}`;
    this.sensorId = config.sensorId;
    this.sensorName = config.sensorName;
    this.type = config.type; // threshold, offline, error, anomaly
    this.message = config.message;
    this.severity = config.severity || 'warning'; // info, warning, critical
    this.value = config.value;
    this.threshold = config.threshold;
    this.timestamp = Date.now();
    this.acknowledged = false;
  }

  acknowledge() {
    this.acknowledged = true;
  }
}

class SensorAgent {
  constructor(config = {}) {
    this.sensors = new Map();
    this.alerts = new Map();
    this.stats = {
      sensorsRegistered: 0,
      readingsTaken: 0,
      alertsTriggered: 0
    };
    this.initDemoSensors();
  }

  initDemoSensors() {
    // Create demo sensors
  }

  addSensor(config) {
    const sensor = new Sensor(config);
    this.sensors.set(sensor.id, sensor);
    this.stats.sensorsRegistered++;
    console.log(`   Added sensor: ${sensor.name} (${sensor.type})`);
    return sensor;
  }

  registerSensor(config) {
    return this.addSensor(config);
  }

  activateSensor(sensorId) {
    const sensor = this.sensors.get(sensorId);
    if (!sensor) {
      return { success: false, reason: 'Sensor not found' };
    }
    sensor.activate();
    console.log(`   Activated sensor: ${sensor.name}`);
    return { success: true, sensor };
  }

  deactivateSensor(sensorId) {
    const sensor = this.sensors.get(sensorId);
    if (!sensor) {
      return { success: false, reason: 'Sensor not found' };
    }
    sensor.deactivate();
    console.log(`   Deactivated sensor: ${sensor.name}`);
    return { success: true, sensor };
  }

  setThreshold(sensorId, threshold) {
    const sensor = this.sensors.get(sensorId);
    if (!sensor) {
      return { success: false, reason: 'Sensor not found' };
    }
    sensor.threshold = threshold;
    sensor.alertEnabled = true;
    console.log(`   Set threshold for ${sensor.name}`);
    return { success: true };
  }

  readSensor(sensorId, value) {
    const sensor = this.sensors.get(sensorId);
    if (!sensor) {
      return { success: false, reason: 'Sensor not found' };
    }

    if (sensor.status !== 'active') {
      return { success: false, reason: 'Sensor not active' };
    }

    const reading = sensor.read(value);
    this.stats.readingsTaken++;

    // Check threshold
    const thresholdCheck = sensor.checkThreshold(reading.calibrated);
    if (thresholdCheck.triggered) {
      const alert = new SensorAlert({
        sensorId: sensor.id,
        sensorName: sensor.name,
        type: 'threshold',
        message: thresholdCheck.reason,
        severity: 'warning',
        value: reading.calibrated,
        threshold: sensor.threshold
      });
      this.alerts.set(alert.id, alert);
      this.stats.alertsTriggered++;
      console.log(`   ALERT: ${sensor.name} - ${thresholdCheck.reason}`);
      return { success: true, reading, alert };
    }

    console.log(`   Read ${sensor.name}: ${reading.calibrated.toFixed(2)}${sensor.unit}`);
    return { success: true, reading };
  }

  getSensor(sensorId) {
    return this.sensors.get(sensorId);
  }

  listSensors(status = null) {
    const sensors = Array.from(this.sensors.values());
    if (status) {
      return sensors.filter(s => s.status === status);
    }
    return sensors;
  }

  listSensorsByType(type) {
    return Array.from(this.sensors.values()).filter(s => s.type === type);
  }

  getSensorReadings(sensorId, limit = 10) {
    const sensor = this.sensors.get(sensorId);
    if (!sensor) return [];
    return sensor.readings.slice(-limit);
  }

  listAlerts(acknowledged = null) {
    const alerts = Array.from(this.alerts.values());
    if (acknowledged !== null) {
      return alerts.filter(a => a.acknowledged === acknowledged);
    }
    return alerts;
  }

  acknowledgeAlert(alertId) {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return { success: false, reason: 'Alert not found' };
    }
    alert.acknowledge();
    console.log(`   Acknowledged alert: ${alert.id}`);
    return { success: true };
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new SensorAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Sensor Demo\n');

    // 1. Add Sensors
    console.log('1. Add Sensors:');
    const s1 = agent.addSensor({
      name: 'Living Room Temp',
      type: 'temperature',
      location: 'Living Room',
      threshold: { min: 18, max: 28, condition: 'range' }
    });
    const s2 = agent.addSensor({
      name: 'Kitchen Humidity',
      type: 'humidity',
      location: 'Kitchen',
      threshold: { min: 30, max: 70, condition: 'range' }
    });
    const s3 = agent.addSensor({
      name: 'Front Door Motion',
      type: 'motion',
      location: 'Front Door'
    });
    const s4 = agent.addSensor({
      name: 'Bedroom Light',
      type: 'light',
      location: 'Bedroom',
      threshold: { min: 0, max: 500, condition: 'range' }
    });
    const s5 = agent.addSensor({
      name: 'Pressure Sensor',
      type: 'pressure',
      location: 'Basement',
      threshold: { min: 980, max: 1040, condition: 'range' }
    });

    // 2. Activate Sensors
    console.log('\n2. Activate Sensors:');
    agent.activateSensor(s1.id);
    agent.activateSensor(s2.id);
    agent.activateSensor(s3.id);
    agent.activateSensor(s4.id);
    agent.activateSensor(s5.id);

    // 3. Read Sensors
    console.log('\n3. Read Sensors:');
    agent.readSensor(s1.id, 22.5);
    agent.readSensor(s1.id, 25.0);
    agent.readSensor(s1.id, 30.5); // Above threshold!
    agent.readSensor(s2.id, 45);
    agent.readSensor(s2.id, 75); // Above threshold!
    agent.readSensor(s3.id, 1); // Motion detected
    agent.readSensor(s4.id, 200);
    agent.readSensor(s5.id, 1013);

    // 4. List Active Sensors
    console.log('\n4. Active Sensors:');
    const activeSensors = agent.listSensors('active');
    activeSensors.forEach(s => {
      console.log(`   ${s.name}: ${s.value?.toFixed(2) || 'N/A'}${s.unit}`);
    });

    // 5. Calibrate Sensor
    console.log('\n5. Calibrate Sensor:');
    agent.setThreshold(s1.id, { min: 20, max: 26, condition: 'range' });
    agent.readSensor(s1.id, 25.0);

    // 6. Sensor Readings History
    console.log('\n6. Sensor History:');
    const history = agent.getSensorReadings(s1.id);
    console.log(`   ${s1.name}: ${history.length} readings`);

    // 7. List Alerts
    console.log('\n7. Active Alerts:');
    const alerts = agent.listAlerts(false);
    alerts.forEach(a => {
      console.log(`   [${a.severity.toUpperCase()}] ${a.sensorName}: ${a.message}`);
    });

    // 8. Acknowledge Alert
    console.log('\n8. Acknowledge Alert:');
    if (alerts.length > 0) {
      agent.acknowledgeAlert(alerts[0].id);
    }

    // 9. Statistics
    console.log('\n9. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total Sensors: ${stats.sensorsRegistered}`);
    console.log(`   Readings Taken: ${stats.readingsTaken}`);
    console.log(`   Alerts Triggered: ${stats.alertsTriggered}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'add':
    console.log('Adding test sensor...');
    const s = agent.addSensor({
      name: 'Test Sensor',
      type: 'temperature',
      location: 'Test Lab'
    });
    console.log(`Added sensor: ${s.id}`);
    break;

  case 'list':
    console.log('Listing sensors...');
    for (const s of agent.sensors.values()) {
      console.log(`   ${s.name}: ${s.status} (${s.type})`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-sensor.js [demo|add|list]');
}
