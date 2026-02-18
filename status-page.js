/**
 * Status Page Generator - 状态页模块
 * 公共状态页生成器，显示服务状态
 */

const fs = require('fs');
const path = require('path');

// ========== Data Models ==========

class ServiceStatus {
  constructor(data = {}) {
    this.id = data.id || `service_${Date.now()}`;
    this.name = data.name;
    this.description = data.description || '';
    this.category = data.category || 'core'; // core, supporting, external
    this.status = data.status || 'operational'; // operational, degraded, partial_outage, major_outage, maintenance
    this.uptime = data.uptime || 100; // percentage
    this.latency = data.latency || 0; // ms
    this.lastChecked = data.lastChecked || Date.now();
    this.incidentHistory = data.incidentHistory || [];
    this.metadata = data.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      category: this.category,
      status: this.status,
      uptime: this.uptime,
      latency: this.latency,
      lastChecked: this.lastChecked,
      incidentHistory: this.incidentHistory,
      metadata: this.metadata
    };
  }

  updateStatus(newStatus) {
    this.status = newStatus;
    this.lastChecked = Date.now();
    return this;
  }
}

class Incident {
  constructor(data = {}) {
    this.id = data.id || `incident_${Date.now()}`;
    this.title = data.title;
    this.description = data.description;
    this.severity = data.severity || 'low'; // low, medium, high, critical
    this.status = data.status || 'investigating'; // investigating, identified, monitoring, resolved
    this.services = data.services || []; // service IDs
    this.startTime = data.startTime || Date.now();
    this.endTime = data.endTime || null;
    this.updates = data.updates || [];
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      description: this.description,
      severity: this.severity,
      status: this.status,
      services: this.services,
      startTime: this.startTime,
      endTime: this.endTime,
      updates: this.updates
    };
  }

  addUpdate(message) {
    this.updates.push({
      timestamp: Date.now(),
      message,
      status: this.status
    });
  }

  resolve() {
    this.status = 'resolved';
    this.endTime = Date.now();
    return this;
  }
}

class StatusPage {
  constructor(data = {}) {
    this.id = data.id || 'default';
    this.name = data.name || 'Status Page';
    this.description = data.description || 'System Status';
    this.brandColor = data.brandColor || '#007bff';
    this.logoUrl = data.logoUrl || null;
    this.timezone = data.timezone || 'UTC';
    this.modules = data.modules || ['status', 'history', 'components'];
    this.customCss = data.customCss || '';
    this.showUptime = data.showUptime !== false;
    this.showLatency = data.showLatency !== false;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      brandColor: this.brandColor,
      logoUrl: this.logoUrl,
      timezone: this.timezone,
      modules: this.modules,
      customCss: this.customCss,
      showUptime: this.showUptime,
      showLatency: this.showLatency
    };
  }
}

// ========== Main Status Page Class ==========

class StatusPageManager {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './status-page-data';
    this.services = new Map();
    this.incidents = [];
    this.statusPage = new StatusPage();

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
  }

  _loadData() {
    const servicesFile = path.join(this.storageDir, 'services.json');
    if (fs.existsSync(servicesFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(servicesFile, 'utf8'));
        for (const s of data) {
          this.services.set(s.id, new ServiceStatus(s));
        }
      } catch (e) {
        console.error('Failed to load services:', e);
      }
    }

    const incidentsFile = path.join(this.storageDir, 'incidents.json');
    if (fs.existsSync(incidentsFile)) {
      try {
        this.incidents = JSON.parse(fs.readFileSync(incidentsFile, 'utf8')).map(
          i => new Incident(i)
        );
      } catch (e) {
        console.error('Failed to load incidents:', e);
      }
    }

    const pageFile = path.join(this.storageDir, 'status-page.json');
    if (fs.existsSync(pageFile)) {
      try {
        this.statusPage = new StatusPage(JSON.parse(fs.readFileSync(pageFile, 'utf8')));
      } catch (e) {
        console.error('Failed to load status page config:', e);
      }
    }
  }

  _saveServices() {
    const data = Array.from(this.services.values()).map(s => s.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'services.json'),
      JSON.stringify(data, null, 2)
    );
  }

  _saveIncidents() {
    const data = this.incidents.map(i => i.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'incidents.json'),
      JSON.stringify(data, null, 2)
    );
  }

  _saveStatusPage() {
    fs.writeFileSync(
      path.join(this.storageDir, 'status-page.json'),
      JSON.stringify(this.statusPage.toJSON(), null, 2)
    );
  }

  // ========== Service Management ==========

  addService(data) {
    const service = new ServiceStatus(data);
    this.services.set(service.id, service);
    this._saveServices();
    return service;
  }

  getService(id) {
    return this.services.get(id) || null;
  }

  listServices(filters = {}) {
    let result = Array.from(this.services.values());

    if (filters.category) {
      result = result.filter(s => s.category === filters.category);
    }

    if (filters.status) {
      result = result.filter(s => s.status === filters.status);
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  }

  updateServiceStatus(id, status, latency = null) {
    const service = this.services.get(id);
    if (!service) {
      throw new Error(`Service not found: ${id}`);
    }

    service.updateStatus(status);
    if (latency !== null) {
      service.latency = latency;
    }
    this._saveServices();
    return service;
  }

  deleteService(id) {
    this.services.delete(id);
    this._saveServices();
  }

  // ========== Incident Management ==========

  createIncident(data) {
    const incident = new Incident(data);
    this.incidents.push(incident);
    this._saveIncidents();

    // Update affected services
    for (const serviceId of incident.services) {
      const service = this.services.get(serviceId);
      if (service) {
        if (incident.severity === 'critical') {
          service.updateStatus('major_outage');
        } else if (incident.severity === 'high') {
          service.updateStatus('partial_outage');
        } else {
          service.updateStatus('degraded');
        }
      }
    }
    this._saveServices();

    return incident;
  }

  getIncident(id) {
    return this.incidents.find(i => i.id === id) || null;
  }

  listIncidents(filters = {}) {
    let result = [...this.incidents];

    if (filters.status) {
      result = result.filter(i => i.status === filters.status);
    }

    if (filters.severity) {
      result = result.filter(i => i.severity === filters.severity);
    }

    if (filters.serviceId) {
      result = result.filter(i => i.services.includes(filters.serviceId));
    }

    return result.sort((a, b) => b.startTime - a.startTime);
  }

  updateIncident(id, updates) {
    const incident = this.incidents.find(i => i.id === id);
    if (!incident) {
      throw new Error(`Incident not found: ${id}`);
    }

    if (updates.status) incident.status = updates.status;
    if (updates.message) incident.addUpdate(updates.message);
    if (updates.resolve) {
      incident.resolve();
      // Restore service statuses
      for (const serviceId of incident.services) {
        const service = this.services.get(serviceId);
        if (service) {
          service.updateStatus('operational');
        }
      }
      this._saveServices();
    }

    this._saveIncidents();
    return incident;
  }

  // ========== Status Page Configuration ==========

  configureStatusPage(config) {
    this.statusPage = new StatusPage({
      ...this.statusPage.toJSON(),
      ...config
    });
    this._saveStatusPage();
    return this.statusPage;
  }

  // ========== Status Calculation ==========

  getOverallStatus() {
    const services = Array.from(this.services.values());
    if (services.length === 0) return 'unknown';

    const hasMajor = services.some(s => s.status === 'major_outage');
    if (hasMajor) return 'major_outage';

    const hasPartial = services.some(s => s.status === 'partial_outage');
    if (hasPartial) return 'partial_outage';

    const hasDegraded = services.some(s => s.status === 'degraded');
    if (hasDegraded) return 'degraded';

    const hasMaintenance = services.some(s => s.status === 'maintenance');
    if (hasMaintenance) return 'maintenance';

    return 'operational';
  }

  // ========== HTML Generation ==========

  generateHTML() {
    const services = this.listServices();
    const incidents = this.listIncidents({ status: 'investigating' });
    const pastIncidents = this.listIncidents().slice(0, 10);
    const overallStatus = this.getOverallStatus();

    const statusColors = {
      operational: '#22c55e',
      degraded: '#f59e0b',
      partial_outage: '#ef4444',
      major_outage: '#dc2626',
      maintenance: '#6b7280'
    };

    const statusLabels = {
      operational: 'Operational',
      degraded: 'Degraded Performance',
      partial_outage: 'Partial Outage',
      major_outage: 'Major Outage',
      maintenance: 'Maintenance'
    };

    // Group services by category
    const categories = {};
    for (const service of services) {
      if (!categories[service.category]) {
        categories[service.category] = [];
      }
      categories[service.category].push(service);
    }

    const categoryLabels = {
      core: 'Core Services',
      supporting: 'Supporting Services',
      external: 'External Services'
    };

    let servicesHTML = '';
    for (const [category, categoryServices] of Object.entries(categories)) {
      servicesHTML += `
        <div class="category">
          <h3>${categoryLabels[category] || category}</h3>
          <div class="service-list">
            ${categoryServices.map(s => `
              <div class="service-item">
                <div class="service-info">
                  <span class="service-name">${s.name}</span>
                  <span class="service-desc">${s.description}</span>
                </div>
                <div class="service-status" style="color: ${statusColors[s.status]}">
                  ${statusLabels[s.status]}
                  ${this.statusPage.showUptime ? `<span class="uptime">${s.uptime}% uptime</span>` : ''}
                  ${this.statusPage.showLatency && s.latency ? `<span class="latency">${s.latency}ms</span>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    let incidentsHTML = '';
    if (incidents.length > 0) {
      incidentsHTML = `
        <div class="active-incidents">
          <h2>Active Incidents</h2>
          ${incidents.map(i => `
            <div class="incident incident-${i.severity}">
              <div class="incident-header">
                <span class="incident-title">${i.title}</span>
                <span class="incident-status">${i.status}</span>
              </div>
              <p>${i.description}</p>
              <div class="incident-updates">
                ${i.updates.map(u => `
                  <div class="update">
                    <span class="update-time">${new Date(u.timestamp).toLocaleString()}</span>
                    <span class="update-message">${u.message}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      `;
    }

    let historyHTML = '';
    if (pastIncidents.length > 0) {
      historyHTML = `
        <div class="past-incidents">
          <h2>Past Incidents</h2>
          ${pastIncidents.map(i => `
            <div class="incident incident-${i.severity}">
              <div class="incident-header">
                <span class="incident-title">${i.title}</span>
                <span class="incident-status">${i.status}</span>
              </div>
              <p>${i.description}</p>
              <span class="incident-time">
                ${new Date(i.startTime).toLocaleString()} - ${i.endTime ? new Date(i.endTime).toLocaleString() : 'Ongoing'}
              </span>
            </div>
          `).join('')}
        </div>
      `;
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.statusPage.name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f8fafc;
      color: #1e293b;
      line-height: 1.6;
    }
    .container { max-width: 900px; margin: 0 auto; padding: 20px; }
    header {
      text-align: center;
      padding: 40px 0;
      border-bottom: 1px solid #e2e8f0;
    }
    .logo { font-size: 24px; font-weight: bold; color: ${this.statusPage.brandColor}; }
    .overall-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      border-radius: 20px;
      background: ${statusColors[overallStatus]}20;
      color: ${statusColors[overallStatus]};
      font-weight: 600;
      margin-top: 16px;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: ${statusColors[overallStatus]};
    }
    main { padding: 20px 0; }
    h2 { margin: 30px 0 15px; font-size: 18px; }
    h3 { margin: 20px 0 10px; font-size: 14px; text-transform: uppercase; color: #64748b; }
    .category { margin-bottom: 20px; }
    .service-list { background: white; border-radius: 8px; overflow: hidden; }
    .service-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 15px 20px;
      border-bottom: 1px solid #e2e8f0;
    }
    .service-item:last-child { border-bottom: none; }
    .service-info { display: flex; flex-direction: column; }
    .service-name { font-weight: 600; }
    .service-desc { font-size: 14px; color: #64748b; }
    .service-status { text-align: right; font-weight: 500; }
    .uptime, .latency { display: block; font-size: 12px; color: #94a3b8; font-weight: normal; }
    .incident { background: white; border-radius: 8px; padding: 20px; margin-bottom: 15px; border-left: 4px solid; }
    .incident-low { border-color: #f59e0b; }
    .incident-medium { border-color: #f97316; }
    .incident-high { border-color: #ef4444; }
    .incident-critical { border-color: #dc2626; }
    .incident-header { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .incident-title { font-weight: 600; }
    .incident-status { text-transform: capitalize; font-size: 14px; color: #64748b; }
    .incident-time { font-size: 12px; color: #94a3b8; }
    .update { padding: 10px 0; border-top: 1px solid #e2e8f0; }
    .update-time { font-size: 12px; color: #64748b; }
    footer { text-align: center; padding: 30px; color: #94a3b8; font-size: 14px; }
    ${this.statusPage.customCss}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="logo">${this.statusPage.name}</div>
      <p>${this.statusPage.description}</p>
      <div class="overall-status">
        <span class="status-dot"></span>
        ${statusLabels[overallStatus]}
      </div>
    </header>

    <main>
      ${incidentsHTML}

      <h2>System Status</h2>
      ${servicesHTML}

      ${historyHTML}
    </main>

    <footer>
      <p>Last updated: ${new Date().toLocaleString(this.statusPage.timezone)}</p>
    </footer>
  </div>
</body>
</html>`;
  }

  // ========== JSON API ==========

  getStatusJSON() {
    return {
      page: this.statusPage.toJSON(),
      overall: this.getOverallStatus(),
      services: this.listServices().map(s => s.toJSON()),
      activeIncidents: this.listIncidents({ status: 'investigating' }).map(i => i.toJSON())
    };
  }

  // ========== Statistics ==========

  getStats() {
    const services = this.listServices();
    const serviceCount = services.length;
    const operationalCount = services.filter(s => s.status === 'operational').length;

    const statusCounts = {};
    for (const s of services) {
      statusCounts[s.status] = (statusCounts[s.status] || 0) + 1;
    }

    const activeIncidents = this.incidents.filter(i => i.status !== 'resolved').length;
    const resolvedIncidents = this.incidents.filter(i => i.status === 'resolved').length;

    return {
      totalServices: serviceCount,
      operationalServices: operationalCount,
      overallUptime: serviceCount > 0 ? (operationalCount / serviceCount * 100).toFixed(2) + '%' : 'N/A',
      byStatus: statusCounts,
      activeIncidents,
      resolvedIncidents,
      totalIncidents: this.incidents.length
    };
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const manager = new StatusPageManager();

  switch (command) {
    case 'status':
      console.log('System Status:');
      console.log('==============');
      console.log(JSON.stringify(manager.getStatusJSON(), null, 2));
      break;

    case 'services':
      console.log('Services:');
      console.log('=========');
      for (const s of manager.listServices()) {
        console.log(`[${s.status}] ${s.name} - ${s.description}`);
      }
      break;

    case 'add-service':
      const service = manager.addService({
        name: args[1] || 'New Service',
        description: args[2] || '',
        category: args[3] || 'core',
        status: 'operational',
        uptime: 99.9
      });
      console.log(`Added service: ${service.id}`);
      break;

    case 'update-status':
      const serviceId = args[1];
      const newStatus = args[2] || 'operational';
      const latency = args[3] ? parseInt(args[3]) : null;
      manager.updateServiceStatus(serviceId, newStatus, latency);
      console.log(`Updated service ${serviceId} status to ${newStatus}`);
      break;

    case 'incidents':
      console.log('Incidents:');
      console.log('==========');
      for (const i of manager.listIncidents()) {
        console.log(`[${i.status}] ${i.title} - ${i.severity}`);
      }
      break;

    case 'create-incident':
      const incident = manager.createIncident({
        title: args[1] || 'New Incident',
        description: args[2] || 'Investigating...',
        severity: args[3] || 'medium',
        services: args[4] ? args[4].split(',') : []
      });
      console.log(`Created incident: ${incident.id}`);
      break;

    case 'resolve-incident':
      manager.updateIncident(args[1], { resolve: true, message: 'Issue resolved' });
      console.log(`Resolved incident ${args[1]}`);
      break;

    case 'html':
      const html = manager.generateHTML();
      fs.writeFileSync('status.html', html);
      console.log('Generated status.html');
      break;

    case 'stats':
      console.log('Status Page Statistics:');
      console.log('======================');
      console.log(JSON.stringify(manager.getStats(), null, 2));
      break;

    case 'demo':
      // Add demo services
      manager.addService({ name: 'API Gateway', description: 'Main API endpoint', category: 'core', status: 'operational', uptime: 99.99, latency: 45 });
      manager.addService({ name: 'User Service', description: 'User authentication and management', category: 'core', status: 'operational', uptime: 99.95, latency: 32 });
      manager.addService({ name: 'Payment Service', description: 'Payment processing', category: 'core', status: 'operational', uptime: 99.98, latency: 120 });
      manager.addService({ name: 'Database', description: 'Primary database cluster', category: 'core', status: 'operational', uptime: 99.999, latency: 5 });
      manager.addService({ name: 'Cache Layer', description: 'Redis cache cluster', category: 'supporting', status: 'operational', uptime: 99.9, latency: 2 });
      manager.addService({ name: 'CDN', description: 'Content delivery network', category: 'external', status: 'operational', uptime: 99.99, latency: 15 });
      manager.addService({ name: 'Email Service', description: 'Email delivery', category: 'external', status: 'degraded', uptime: 98.5, latency: 500 });

      // Create an incident
      manager.createIncident({
        title: 'Email Service Degradation',
        description: 'Email delivery is experiencing delays due to high volume.',
        severity: 'medium',
        services: ['service_1771301447238']
      });

      // Configure status page
      manager.configureStatusPage({
        name: 'Acme Corp Status',
        description: 'Real-time system status',
        brandColor: '#2563eb'
      });

      console.log('Demo data created');
      console.log('\nOverall Status:', manager.getOverallStatus());
      console.log('Services:', manager.listServices().map(s => `${s.name}: ${s.status}`));
      console.log('\nActive Incidents:', manager.listIncidents({ status: 'investigating' }).map(i => i.title));

      // Generate HTML
      const htmlContent = manager.generateHTML();
      fs.writeFileSync('status.html', htmlContent);
      console.log('\nGenerated status.html');
      break;

    default:
      console.log('Usage:');
      console.log('  node status-page.js status                      - Get full status JSON');
      console.log('  node status-page.js services                   - List all services');
      console.log('  node status-page.js add-service <name> <desc> <category>');
      console.log('  node status-page.js update-status <id> <status> [latency]');
      console.log('  node status-page.js incidents                  - List incidents');
      console.log('  node status-page.js create-incident <title> <desc> <severity> <services>');
      console.log('  node status-page.js resolve-incident <id>');
      console.log('  node status-page.js html                       - Generate HTML status page');
      console.log('  node status-page.js stats                      - Show statistics');
      console.log('  node status-page.js demo                       - Run demo');
  }
}

if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  ServiceStatus,
  Incident,
  StatusPage,
  StatusPageManager
};
