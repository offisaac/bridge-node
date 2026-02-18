/**
 * Report Scheduler - 报告调度
 * 实现自动化报告生成和调度
 */

const fs = require('fs');
const path = require('path');

// ========== Report Types ==========

const ReportFormat = {
  JSON: 'json',
  HTML: 'html',
  PDF: 'pdf',
  CSV: 'csv',
  MARKDOWN: 'markdown'
};

const ReportFrequency = {
  HOURLY: 'hourly',
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  ONCE: 'once'
};

const ReportStatus = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// ========== Report Template ==========

class ReportTemplate {
  constructor(config) {
    this.id = config.id || `template_${Date.now()}`;
    this.name = config.name;
    this.description = config.description || '';
    this.type = config.type;
    this.format = config.format || ReportFormat.JSON;
    this.query = config.query || null;
    this.transformer = config.transformer || null;
    this.sections = config.sections || [];
    this.metadata = config.metadata || {};
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      format: this.format,
      query: this.query,
      transformer: this.transformer,
      sections: this.sections,
      metadata: this.metadata
    };
  }
}

// ========== Scheduled Report ==========

class ScheduledReport {
  constructor(config) {
    this.id = config.id || `scheduled_${Date.now()}`;
    this.name = config.name;
    this.templateId = config.templateId;
    this.template = config.template || null;
    this.frequency = config.frequency || ReportFrequency.DAILY;
    this.cronExpression = config.cronExpression || null;
    this.timeOfDay = config.timeOfDay || '09:00'; // HH:mm format
    this.dayOfWeek = config.dayOfWeek || 1; // Monday = 1
    this.dayOfMonth = config.dayOfMonth || 1;
    this.recipients = config.recipients || [];
    this.channels = config.channels || ['email']; // email, slack, webhook
    this.enabled = config.enabled !== false;
    this.lastRun = null;
    this.nextRun = null;
    this.status = ReportStatus.PENDING;
    this.createdAt = config.createdAt || Date.now();
  }

  calculateNextRun(fromDate = new Date()) {
    const now = new Date(fromDate);
    let next = new Date(now);

    switch (this.frequency) {
      case ReportFrequency.HOURLY:
        next.setHours(next.getHours() + 1);
        next.setMinutes(0);
        next.setSeconds(0);
        break;

      case ReportFrequency.DAILY:
        const [hours, minutes] = this.timeOfDay.split(':').map(Number);
        next.setHours(hours, minutes, 0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        break;

      case ReportFrequency.WEEKLY:
        const [hoursW, minutesW] = this.timeOfDay.split(':').map(Number);
        next.setHours(hoursW, minutesW, 0, 0);
        const daysUntilWeek = (this.dayOfWeek - now.getDay() + 7) % 7;
        if (daysUntilWeek === 0 && next <= now) {
          next.setDate(next.getDate() + 7);
        } else {
          next.setDate(next.getDate() + daysUntilWeek);
        }
        break;

      case ReportFrequency.MONTHLY:
        const [hoursM, minutesM] = this.timeOfDay.split(':').map(Number);
        next.setHours(hoursM, minutesM, 0, 0);
        next.setDate(this.dayOfMonth);
        if (next <= now) {
          next.setMonth(next.getMonth() + 1);
        }
        break;

      case ReportFrequency.QUARTERLY:
        const quarter = Math.floor(now.getMonth() / 3);
        next.setMonth((quarter + 1) * 3);
        next.setDate(1);
        const [hoursQ, minutesQ] = this.timeOfDay.split(':').map(Number);
        next.setHours(hoursQ, minutesQ, 0, 0);
        break;

      case ReportFrequency.ONCE:
        // Already run
        break;
    }

    this.nextRun = next.toISOString();
    return this.nextRun;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      templateId: this.templateId,
      frequency: this.frequency,
      cronExpression: this.cronExpression,
      timeOfDay: this.timeOfDay,
      dayOfWeek: this.dayOfWeek,
      dayOfMonth: this.dayOfMonth,
      recipients: this.recipients,
      channels: this.channels,
      enabled: this.enabled,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      status: this.status,
      createdAt: this.createdAt
    };
  }
}

// ========== Report Instance ==========

class ReportInstance {
  constructor(config) {
    this.id = config.id || `instance_${Date.now()}`;
    this.scheduleId = config.scheduleId;
    this.templateId = config.templateId;
    this.template = config.template || null;
    this.status = config.status || ReportStatus.PENDING;
    this.startedAt = config.startedAt || null;
    this.completedAt = config.completedAt || null;
    this.outputPath = config.outputPath || null;
    this.outputFormat = config.outputFormat || ReportFormat.JSON;
    this.data = config.data || null;
    this.error = config.error || null;
    this.metadata = config.metadata || {};
  }

  start() {
    this.status = ReportStatus.RUNNING;
    this.startedAt = Date.now();
  }

  complete(data, outputPath) {
    this.status = ReportStatus.COMPLETED;
    this.completedAt = Date.now();
    this.data = data;
    this.outputPath = outputPath;
  }

  fail(error) {
    this.status = ReportStatus.FAILED;
    this.completedAt = Date.now();
    this.error = error;
  }

  getDuration() {
    if (!this.startedAt) return null;
    const end = this.completedAt || Date.now();
    return end - this.startedAt;
  }

  toJSON() {
    return {
      id: this.id,
      scheduleId: this.scheduleId,
      templateId: this.templateId,
      status: this.status,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      outputPath: this.outputPath,
      outputFormat: this.outputFormat,
      error: this.error,
      duration: this.getDuration(),
      metadata: this.metadata
    };
  }
}

// ========== Report Generator ==========

class ReportGenerator {
  constructor(manager) {
    this.manager = manager;
  }

  async generate(template, options = {}) {
    const data = await this._fetchData(template);
    const transformed = await this._transformData(data, template);
    const output = await this._formatOutput(transformed, template, options);

    return {
      data: transformed,
      output,
      format: template.format
    };
  }

  async _fetchData(template) {
    if (!template.query) {
      // Generate sample data for demo
      return {
        generated: true,
        timestamp: new Date().toISOString(),
        sections: template.sections || []
      };
    }

    // In real implementation, execute query
    return { query: template.query, timestamp: new Date().toISOString() };
  }

  async _transformData(data, template) {
    if (!template.transformer) {
      return data;
    }

    // Apply custom transformer if provided
    return data;
  }

  async _formatOutput(data, template, options) {
    switch (template.format) {
      case ReportFormat.JSON:
        return JSON.stringify(data, null, 2);

      case ReportFormat.CSV:
        return this._toCSV(data);

      case ReportFormat.HTML:
        return this._toHTML(data, template);

      case ReportFormat.MARKDOWN:
        return this._toMarkdown(data, template);

      default:
        return JSON.stringify(data, null, 2);
    }
  }

  _toCSV(data) {
    // Simple CSV conversion
    if (Array.isArray(data)) {
      const headers = Object.keys(data[0] || {});
      const rows = data.map(item => headers.map(h => item[h]).join(','));
      return [headers.join(','), ...rows].join('\n');
    }
    return 'No data';
  }

  _toHTML(data, template) {
    return `<!DOCTYPE html>
<html>
<head><title>${template.name}</title></head>
<body>
<h1>${template.name}</h1>
<pre>${JSON.stringify(data, null, 2)}</pre>
</body>
</html>`;
  }

  _toMarkdown(data, template) {
    return `# ${template.name}

Generated: ${new Date().toISOString()}

\`\`\`json
${JSON.stringify(data, null, 2)}
\`\`\``;
  }
}

// ========== Report Scheduler ==========

class ReportScheduler {
  constructor(options = {}) {
    this.templates = new Map(); // id -> ReportTemplate
    this.schedules = new Map(); // id -> ScheduledReport
    this.instances = new Map(); // id -> ReportInstance
    this.storageDir = options.storageDir || './report-scheduler-data';
    this.outputDir = options.outputDir || './reports';
    this.generator = new ReportGenerator(this);

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    this._loadData();
    this._calculateAllNextRuns();
  }

  // ========== Template Management ==========

  createTemplate(config) {
    const template = new ReportTemplate({
      id: config.id || `template_${Date.now()}`,
      ...config
    });

    this.templates.set(template.id, template);
    this._saveData();
    return template;
  }

  getTemplate(id) {
    return this.templates.get(id);
  }

  listTemplates() {
    return Array.from(this.templates.values());
  }

  deleteTemplate(id) {
    this.templates.delete(id);
    this._saveData();
  }

  // ========== Schedule Management ==========

  createSchedule(config) {
    const schedule = new ScheduledReport({
      id: config.id || `scheduled_${Date.now()}`,
      templateId: config.templateId,
      ...config
    });

    // Validate template exists
    if (!this.templates.has(schedule.templateId)) {
      throw new Error(`Template not found: ${schedule.templateId}`);
    }

    schedule.template = this.templates.get(schedule.templateId);
    schedule.calculateNextRun();

    this.schedules.set(schedule.id, schedule);
    this._saveData();
    return schedule;
  }

  getSchedule(id) {
    return this.schedules.get(id);
  }

  listSchedules(filters = {}) {
    let result = Array.from(this.schedules.values());

    if (filters.enabled !== undefined) {
      result = result.filter(s => s.enabled === filters.enabled);
    }

    if (filters.frequency) {
      result = result.filter(s => s.frequency === filters.frequency);
    }

    return result.sort((a, b) => new Date(a.nextRun) - new Date(b.nextRun));
  }

  updateSchedule(id, updates) {
    const existing = this.schedules.get(id);
    if (!existing) {
      throw new Error(`Schedule not found: ${id}`);
    }

    const updated = new ScheduledReport({
      ...existing.toJSON(),
      ...updates,
      id: existing.id,
      template: existing.template
    });

    if (updates.frequency || updates.timeOfDay) {
      updated.calculateNextRun();
    }

    this.schedules.set(id, updated);
    this._saveData();
    return updated;
  }

  deleteSchedule(id) {
    this.schedules.delete(id);
    this._saveData();
  }

  enableSchedule(id) {
    return this.updateSchedule(id, { enabled: true });
  }

  disableSchedule(id) {
    return this.updateSchedule(id, { enabled: false });
  }

  // ========== Report Generation ==========

  async generateReport(scheduleId) {
    const schedule = this.schedules.get(scheduleId);
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const instance = new ReportInstance({
      scheduleId,
      templateId: schedule.templateId,
      template: schedule.template,
      outputFormat: schedule.template.format
    });

    this.instances.set(instance.id, instance);

    try {
      instance.start();

      const result = await this.generator.generate(schedule.template);

      // Save output
      const filename = `${schedule.name.replace(/\s+/g, '_')}_${Date.now()}.${schedule.template.format}`;
      const outputPath = path.join(this.outputDir, filename);
      fs.writeFileSync(outputPath, result.output);

      instance.complete(result.data, outputPath);

      // Update schedule
      schedule.lastRun = Date.now();
      schedule.calculateNextRun();
      schedule.status = ReportStatus.COMPLETED;

      this._saveData();

      return instance;
    } catch (error) {
      instance.fail(error.message);
      schedule.status = ReportStatus.FAILED;
      this._saveData();
      throw error;
    }
  }

  // ========== Pending Reports ==========

  getPendingReports() {
    const now = Date.now();
    const pending = [];

    for (const schedule of this.schedules.values()) {
      if (!schedule.enabled) continue;
      if (!schedule.nextRun) continue;

      const nextRun = new Date(schedule.nextRun).getTime();
      if (nextRun <= now) {
        pending.push(schedule);
      }
    }

    return pending.sort((a, b) =>
      new Date(a.nextRun).getTime() - new Date(b.nextRun).getTime()
    );
  }

  // ========== Instance Management ==========

  getInstance(id) {
    return this.instances.get(id);
  }

  listInstances(filters = {}) {
    let result = Array.from(this.instances.values());

    if (filters.scheduleId) {
      result = result.filter(i => i.scheduleId === filters.scheduleId);
    }

    if (filters.status) {
      result = result.filter(i => i.status === filters.status);
    }

    return result.sort((a, b) => b.startedAt - a.startedAt);
  }

  // ========== Helper Methods ==========

  _calculateAllNextRuns() {
    for (const schedule of this.schedules.values()) {
      if (schedule.enabled && !schedule.nextRun) {
        schedule.calculateNextRun();
      }
    }
  }

  // ========== Statistics ==========

  getStats() {
    return {
      templates: this.templates.size,
      schedules: this.schedules.size,
      enabledSchedules: Array.from(this.schedules.values()).filter(s => s.enabled).length,
      instances: this.instances.size,
      completed: Array.from(this.instances.values()).filter(i => i.status === ReportStatus.COMPLETED).length,
      failed: Array.from(this.instances.values()).filter(i => i.status === ReportStatus.FAILED).length,
      pendingReports: this.getPendingReports().length
    };
  }

  // ========== Persistence ==========

  _loadData() {
    const file = path.join(this.storageDir, 'reports.json');
    if (!fs.existsSync(file)) return;

    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));

      for (const t of data.templates || []) {
        this.templates.set(t.id, new ReportTemplate(t));
      }

      for (const s of data.schedules || []) {
        const schedule = new ScheduledReport(s);
        if (s.templateId && this.templates.has(s.templateId)) {
          schedule.template = this.templates.get(s.templateId);
        }
        this.schedules.set(schedule.id, schedule);
      }
    } catch (err) {
      console.error('Failed to load report data:', err);
    }
  }

  _saveData() {
    const data = {
      templates: Array.from(this.templates.values()).map(t => t.toJSON()),
      schedules: Array.from(this.schedules.values()).map(s => s.toJSON())
    };

    fs.writeFileSync(
      path.join(this.storageDir, 'reports.json'),
      JSON.stringify(data, null, 2)
    );
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const scheduler = new ReportScheduler();

  switch (command) {
    case 'templates':
      console.log('Report Templates:');
      console.log('=================');
      for (const t of scheduler.listTemplates()) {
        console.log(`\n${t.name} (${t.id})`);
        console.log(`  Type: ${t.type}`);
        console.log(`  Format: ${t.format}`);
      }
      break;

    case 'add-template':
      const template = scheduler.createTemplate({
        name: args[1] || 'Daily Summary',
        type: 'summary',
        format: ReportFormat.JSON,
        sections: ['overview', 'metrics', 'alerts']
      });
      console.log(`Created template: ${template.id}`);
      break;

    case 'schedules':
      console.log('Scheduled Reports:');
      console.log('=================');
      for (const s of scheduler.listSchedules()) {
        console.log(`\n${s.name} [${s.enabled ? 'enabled' : 'disabled'}]`);
        console.log(`  Frequency: ${s.frequency}`);
        console.log(`  Next Run: ${s.nextRun}`);
        console.log(`  Last Run: ${s.lastRun || 'Never'}`);
      }
      break;

    case 'add-schedule':
      // Create a template first if needed
      let tmplId = args[1];
      if (!tmplId) {
        const tmpl = scheduler.createTemplate({
          name: 'Test Report',
          type: 'test',
          format: ReportFormat.JSON
        });
        tmplId = tmpl.id;
      }

      const schedule = scheduler.createSchedule({
        name: args[2] || 'Daily Report',
        templateId: tmplId,
        frequency: ReportFrequency.DAILY,
        timeOfDay: '09:00',
        recipients: ['team@example.com']
      });
      console.log(`Created schedule: ${schedule.id}`);
      console.log(`Next run: ${schedule.nextRun}`);
      break;

    case 'run':
      const schedId = args[1];
      if (schedId) {
        console.log(`Running report for schedule ${schedId}...`);
        scheduler.generateReport(schedId).then(instance => {
          console.log(`Report generated: ${instance.outputPath}`);
        }).catch(err => {
          console.error('Failed:', err.message);
        });
      }
      break;

    case 'pending':
      console.log('Pending Reports:');
      console.log('===============');
      const pending = scheduler.getPendingReports();
      console.log(`Found ${pending.length} pending reports`);
      for (const p of pending) {
        console.log(`  ${p.name} (next: ${p.nextRun})`);
      }
      break;

    case 'instances':
      const instances = scheduler.listInstances({ limit: 10 });
      console.log('Recent Report Instances:');
      console.log('=======================');
      for (const i of instances) {
        console.log(`\n${i.id} - ${i.status}`);
        console.log(`  Duration: ${i.getDuration()}ms`);
        console.log(`  Output: ${i.outputPath}`);
      }
      break;

    case 'stats':
      console.log('Report Scheduler Statistics:');
      console.log('===========================');
      console.log(JSON.stringify(scheduler.getStats(), null, 2));
      break;

    default:
      console.log('Usage:');
      console.log('  node report-scheduler.js templates            - List templates');
      console.log('  node report-scheduler.js add-template <name>  - Add template');
      console.log('  node report-scheduler.js schedules            - List schedules');
      console.log('  node report-scheduler.js add-schedule <templateId> <name> - Add schedule');
      console.log('  node report-scheduler.js run <scheduleId>     - Run report now');
      console.log('  node report-scheduler.js pending             - List pending reports');
      console.log('  node report-scheduler.js instances            - List recent instances');
      console.log('  node report-scheduler.js stats                - Show statistics');
      console.log('\nFrequencies:', Object.values(ReportFrequency).join(', '));
      console.log('Formats:', Object.values(ReportFormat).join(', '));
  }
}

// Run if called directly
if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  ReportScheduler,
  ReportTemplate,
  ScheduledReport,
  ReportInstance,
  ReportGenerator,
  ReportFormat,
  ReportFrequency,
  ReportStatus
};
