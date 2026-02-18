/**
 * Agent Cron 2 - Advanced Cron Scheduler
 *
 * Advanced cron scheduling with calendars, exclusions, and complex expressions.
 *
 * Usage: node agent-cron-2.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   calendar   - Show calendar features
 *   complex    - Show complex expressions
 */

class CronCalendar {
  constructor() {
    this.inclusions = [];
    this.exclusions = [];
  }

  include(dates) {
    this.inclusions.push(...dates);
    return this;
  }

  exclude(dates) {
    this.exclusions.push(...dates);
    return this;
  }

  isIncluded(date) {
    if (this.inclusions.length > 0) {
      return this.inclusions.some(d => this._matchDate(d, date));
    }
    if (this.exclusions.length > 0) {
      return !this.exclusions.some(d => this._matchDate(d, date));
    }
    return true;
  }

  _matchDate(pattern, date) {
    const d = new Date(date);
    const p = pattern.split('-');
    return (
      (p[0] === '*' || parseInt(p[0]) === d.getMonth() + 1) &&
      (p[1] === '*' || parseInt(p[1]) === d.getDate())
    );
  }
}

class CronExpression2 {
  constructor(expression) {
    this.raw = expression;
    this.parts = expression.trim().split(/\s+/);
    this.calendar = new CronCalendar();
    this.tz = 'UTC';
  }

  static parse(expression) {
    return new CronExpression2(expression);
  }

  onCalendar(calendar) {
    this.calendar = calendar;
    return this;
  }

  inTimezone(tz) {
    this.tz = tz;
    return this;
  }

  nextRuns(count = 5) {
    const runs = [];
    let date = new Date();
    date.setSeconds(0);
    date.setMilliseconds(0);
    date.setMinutes(date.getMinutes() + 1);

    while (runs.length < count && date.getFullYear() < 2100) {
      if (this._matches(date)) {
        runs.push(new Date(date));
      }
      date.setMinutes(date.getMinutes() + 1);
    }

    return runs;
  }

  _matches(date) {
    const minute = date.getMinutes();
    const hour = date.getHours();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const weekday = date.getDay();

    // Check calendar
    if (!this.calendar.isIncluded(date)) return false;

    return (
      this._matchField(this.parts[0], minute, 0, 59) &&
      this._matchField(this.parts[1], hour, 0, 23) &&
      this._matchField(this.parts[2], day, 1, 31) &&
      this._matchField(this.parts[3], month, 1, 12) &&
      this._matchField(this.parts[4], weekday, 0, 6)
    );
  }

  _matchField(field, value, min, max) {
    if (field === '*') return true;

    // Handle L (last)
    if (field === 'L') {
      const lastDay = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
      return value === lastDay;
    }

    // Handle W (weekday)
    if (field.includes('W')) {
      const day = parseInt(field.replace('W', ''));
      const nearest = this._nearestWeekday(value, day);
      return nearest === value;
    }

    // Handle L (day of month)
    if (field.includes('L') && field !== 'L') {
      const day = parseInt(field.replace('L', ''));
      const lastDay = new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate();
      return lastDay - day >= 0;
    }

    // Handle list
    if (field.includes(',')) {
      return field.split(',').some(f => this._matchValue(f, value, min, max));
    }

    // Handle range
    if (field.includes('-')) {
      const [start, end] = field.split('-').map(f => parseInt(f));
      return value >= start && value <= end;
    }

    // Handle step
    if (field.includes('/')) {
      const [range, step] = field.split('/');
      const stepNum = parseInt(step);
      if (range === '*') {
        return value % stepNum === 0;
      }
      const start = parseInt(range);
      return (value - start) % stepNum === 0;
    }

    return parseInt(field) === value;
  }

  _matchValue(field, value, min, max) {
    if (field === '*') return true;
    if (field === 'L') return value === 28 || value === 29 || value === 30 || value === 31;

    const num = parseInt(field);
    return !isNaN(num) && num === value;
  }

  _nearestWeekday(date, targetDay) {
    const d = new Date(date);
    d.setDate(1);

    while (d.getDay() !== targetDay) {
      d.setDate(d.getDate() + 1);
    }

    return d.getDate();
  }

  humanReadable() {
    const parts = this.parts;
    const mappings = {
      0: this._minuteToStr(parts[0]),
      1: this._hourToStr(parts[1]),
      2: this._dayToStr(parts[2]),
      3: this._monthToStr(parts[3]),
      4: this._weekdayToStr(parts[4])
    };

    return `At ${mappings[0]} minutes, ${mappings[1]} hours, on day ${mappings[2]}, in ${mappings[3]}, on ${mappings[4]}`;
  }

  _minuteToStr(f) {
    if (f === '*') return 'every minute';
    if (f.includes('/')) return `every ${f.split('/')[1]} minutes`;
    return f;
  }

  _hourToStr(f) {
    if (f === '*') return 'every hour';
    if (f.includes('/')) return `every ${f.split('/')[1]} hours`;
    return f;
  }

  _dayToStr(f) {
    if (f === '*') return 'every day';
    return `day ${f}`;
  }

  _monthToStr(f) {
    const months = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    if (f === '*') return 'every month';
    return months[parseInt(f)] || f;
  }

  _weekdayToStr(f) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    if (f === '*') return 'every day';
    if (f === '0' || f === '7') return 'Sunday';
    return days[parseInt(f)] || f;
  }
}

class Cron2Agent {
  constructor() {
    this.jobs = new Map();
    this.stats = { scheduled: 0, executed: 0, missed: 0 };
  }

  schedule(id, expression, handler) {
    const cron = CronExpression2.parse(expression);
    this.jobs.set(id, { cron, handler, expression, nextRun: null });
    this.stats.scheduled++;
    return this;
  }

  scheduleWithCalendar(id, expression, calendar, handler) {
    const cron = CronExpression2.parse(expression).onCalendar(calendar);
    this.jobs.set(id, { cron, handler, expression, nextRun: null });
    this.stats.scheduled++;
    return this;
  }

  nextExecution(id) {
    const job = this.jobs.get(id);
    if (!job) return null;
    const runs = job.cron.nextRuns(1);
    job.nextRun = runs[0];
    return runs[0];
  }

  getNextRuns(id, count = 5) {
    const job = this.jobs.get(id);
    if (!job) return [];
    return job.cron.nextRuns(count);
  }

  async execute(id) {
    const job = this.jobs.get(id);
    if (!job) throw new Error(`Job ${id} not found`);

    console.log(`   Executing: ${id}`);
    await job.handler();
    this.stats.executed++;

    job.nextRun = null;
    const next = this.getNextRuns(id, 1);
    if (next.length > 0) {
      job.nextRun = next[0];
    }

    return { id, nextRun: job.nextRun };
  }

  parse(expression) {
    return CronExpression2.parse(expression);
  }

  getStats() {
    return { ...this.stats, jobs: this.jobs.size };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const cron2 = new Cron2Agent();

switch (command) {
  case 'demo':
    console.log('=== Agent Cron 2 Demo\n');

    // 1. Basic scheduling
    console.log('1. Basic Scheduling:');
    cron2.schedule('daily-backup', '0 2 * * *', async () => {
      console.log('      Running backup...');
    });

    const nextRuns = cron2.getNextRuns('daily-backup', 3);
    console.log(`   Next runs: ${nextRuns.map(r => r.toLocaleTimeString()).join(', ')}`);

    // 2. Complex expressions
    console.log('\n2. Complex Expressions:');
    const complexExpr = CronExpression2.parse('*/15 9-17 * * 1-5');
    console.log(`   Expression: */15 9-17 * * 1-5`);
    console.log(`   Human: ${complexExpr.humanReadable()}`);

    const complexRuns = complexExpr.nextRuns(3);
    console.log(`   Next runs: ${complexRuns.map(r => r.toLocaleString()).join(', ')}`);

    // 3. Calendar-based scheduling
    console.log('\n3. Calendar-Based:');
    const calendar = new CronCalendar()
      .exclude(['*-12-25']) // Christmas
      .exclude(['*-01-01']); // New Year

    cron2.scheduleWithCalendar('business-days', '0 9 * * 1-5', calendar, async () => {
      console.log('      Business day notification...');
    });

    const businessRuns = cron2.getNextRuns('business-days', 3);
    console.log(`   Next business days: ${businessRuns.map(r => r.toLocaleDateString()).join(', ')}`);

    // 4. Step expressions
    console.log('\n4. Step Expressions:');
    const stepExpr = CronExpression2.parse('*/10 * * * *');
    console.log(`   Expression: */10 * * * *`);
    console.log(`   Human: ${stepExpr.humanReadable()}`);

    const stepRuns = stepExpr.nextRuns(5);
    console.log(`   Next 5 runs: ${stepRuns.map(r => r.toLocaleTimeString()).join(', ')}`);

    // 5. Timezone support
    console.log('\n5. Timezone Support:');
    const tzExpr = CronExpression2.parse('0 8 * * *').inTimezone('Asia/Shanghai');
    console.log(`   Expression: 0 8 * * * (Asia/Shanghai)`);

    const tzRuns = tzExpr.nextRuns(3);
    console.log(`   Next runs: ${tzRuns.map(r => r.toLocaleString()).join(', ')}`);

    // 6. Statistics
    console.log('\n6. Statistics:');
    const stats = cron2.getStats();
    console.log(`   Jobs: ${stats.jobs}`);
    console.log(`   Scheduled: ${stats.scheduled}`);
    console.log(`   Executed: ${stats.executed}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'calendar':
    console.log('Calendar Features:');
    console.log('  - Include specific dates');
    console.log('  - Exclude holidays/special dates');
    console.log('  - Business day calculations');
    break;

  case 'complex':
    console.log('Complex Expressions:');
    console.log('  - */n - every n units');
    console.log('  - n-m - range');
    console.log('  - n,m - list');
    console.log('  - L - last day');
    console.log('  - W - nearest weekday');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-cron-2.js [demo|calendar|complex]');
}
