/**
 * Review Tool - 复盘工具模块
 * 事件复盘文档编写工具
 */

const fs = require('fs');
const path = require('path');

// ========== Data Models ==========

class Review {
  constructor(data) {
    this.id = data.id || `review_${Date.now()}`;
    this.title = data.title;
    this.incidentId = data.incidentId || null;
    this.incidentTitle = data.incidentTitle || '';
    this.date = data.date || Date.now();
    this.severity = data.severity || 'medium'; // low, medium, high, critical
    this.duration = data.duration || 0; // minutes
    this.status = data.status || 'draft'; // draft, in_progress, completed

    // Timeline
    this.timeline = data.timeline || []; // { time, title, description, actor }

    // Impact
    this.impact = data.impact || {
      usersAffected: 0,
      servicesAffected: [],
      financialImpact: 0,
      reputationalImpact: 'none'
    };

    // Root Cause
    this.rootCause = data.rootCause || {
      category: '', // code, config, infrastructure, process, external
      description: '',
      contributingFactors: []
    };

    // Resolution
    this.resolution = data.resolution || {
      immediate: '',
      shortTerm: [],
      longTerm: []
    };

    // Lessons Learned
    this.lessons = data.lessons || {
      whatWentWell: [],
      whatCouldImprove: [],
      actionItems: []
    };

    // Participants
    this.participants = data.participants || []; // names
    this.reviewers = data.reviewers || [];

    this.createdAt = data.createdAt || Date.now();
    this.updatedAt = data.updatedAt || Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      title: this.title,
      incidentId: this.incidentId,
      incidentTitle: this.incidentTitle,
      date: this.date,
      severity: this.severity,
      duration: this.duration,
      status: this.status,
      timeline: this.timeline,
      impact: this.impact,
      rootCause: this.rootCause,
      resolution: this.resolution,
      lessons: this.lessons,
      participants: this.participants,
      reviewers: this.reviewers,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  addTimelineEntry(entry) {
    this.timeline.push({
      ...entry,
      time: entry.time || Date.now()
    });
    this.timeline.sort((a, b) => a.time - b.time);
    this.updatedAt = Date.now();
    return this;
  }

  addActionItem(item) {
    this.lessons.actionItems.push({
      ...item,
      id: `action_${Date.now()}`,
      status: item.status || 'pending',
      createdAt: Date.now()
    });
    this.updatedAt = Date.now();
    return this;
  }

  update(updates) {
    Object.assign(this, updates);
    this.updatedAt = Date.now();
    return this;
  }
}

// ========== Markdown Generator ==========

class MarkdownGenerator {
  static generateReview(review) {
    const formatDate = (ts) => new Date(ts).toISOString().replace('T', ' ').substring(0, 19);

    return `# ${review.title}

## 基本信息

| 项目 | 内容 |
|------|------|
| ID | ${review.id} |
| 日期 | ${formatDate(review.date)} |
| 严重程度 | ${review.severity} |
| 持续时间 | ${review.duration} 分钟 |
| 状态 | ${review.status} |
${review.incidentId ? `| 事件ID | ${review.incidentId} |` : ''}

## 时间线

${review.timeline.length > 0 ? review.timeline.map(t => `
- **${formatDate(t.time)}** - ${t.title}
  ${t.description ? `- ${t.description}` : ''}
  ${t.actor ? `- 执行人: ${t.actor}` : ''}
`).join('') : '_暂无时间线_'}

## 影响范围

- **受影响用户**: ${review.impact.usersAffected}
- **受影响服务**: ${review.impact.servicesAffected.join(', ') || '无'}
- **经济损失**: ${review.impact.financialImpact > 0 ? `$${review.impact.financialImpact}` : '无'}
- **声誉影响**: ${review.impact.reputationalImpact}

## 根因分析

- **类别**: ${review.rootCause.category || '未分类'}
- **描述**: ${review.rootCause.description || '待填写'}

### 促成因素

${review.rootCause.contributingFactors.length > 0
  ? review.rootCause.contributingFactors.map(f => `- ${f}`).join('\n')
  : '_暂无_'}

## 解决方案

### 立即处理

${review.resolution.immediate || '无'}

### 短期措施

${review.resolution.shortTerm.length > 0
  ? review.resolution.shortTerm.map((s, i) => `${i + 1}. ${s}`).join('\n')
  : '_暂无_'}

### 长期措施

${review.resolution.longTerm.length > 0
  ? review.resolution.longTerm.map((l, i) => `${i + 1}. ${l}`).join('\n')
  : '_暂无_'}

## 经验总结

### 做得好

${review.lessons.whatWentWell.length > 0
  ? review.lessons.whatWentWell.map(w => `- ${w}`).join('\n')
  : '_暂无_'}

### 需要改进

${review.lessons.whatCouldImprove.length > 0
  ? review.lessons.whatCouldImprove.map(i => `- ${i}`).join('\n')
  : '_暂无_'}

### 行动项

${review.lessons.actionItems.length > 0
  ? review.lessons.actionItems.map(a => `- [ ] ${a.description} (${a.owner || '待分配'})`).join('\n')
  : '_暂无行动项_'}

## 参与者

- **参与人**: ${review.participants.join(', ') || '无'}
- **审阅人**: ${review.reviewers.join(', ') || '无'}

---

*文档生成时间: ${formatDate(Date.now())}*
`;
  }
}

// ========== Main Review Tool Class ==========

class ReviewTool {
  constructor(options = {}) {
    this.storageDir = options.storageDir || './review-tool-data';
    this.reviews = new Map();

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    this._loadData();
  }

  _loadData() {
    const reviewsFile = path.join(this.storageDir, 'reviews.json');
    if (fs.existsSync(reviewsFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(reviewsFile, 'utf8'));
        for (const r of data) {
          this.reviews.set(r.id, new Review(r));
        }
      } catch (e) {
        console.error('Failed to load reviews:', e);
      }
    }
  }

  _saveData() {
    const data = Array.from(this.reviews.values()).map(r => r.toJSON());
    fs.writeFileSync(
      path.join(this.storageDir, 'reviews.json'),
      JSON.stringify(data, null, 2)
    );
  }

  // ========== CRUD Operations ==========

  createReview(data) {
    const review = new Review(data);
    this.reviews.set(review.id, review);
    this._saveData();
    return review;
  }

  getReview(id) {
    return this.reviews.get(id) || null;
  }

  listReviews(filters = {}) {
    let result = Array.from(this.reviews.values());

    if (filters.status) {
      result = result.filter(r => r.status === filters.status);
    }

    if (filters.severity) {
      result = result.filter(r => r.severity === filters.severity);
    }

    if (filters.incidentId) {
      result = result.filter(r => r.incidentId === filters.incidentId);
    }

    if (filters.year || filters.month) {
      result = result.filter(r => {
        const d = new Date(r.date);
        if (filters.year && d.getFullYear() !== parseInt(filters.year)) return false;
        if (filters.month && d.getMonth() + 1 !== parseInt(filters.month)) return false;
        return true;
      });
    }

    return result.sort((a, b) => b.date - a.date);
  }

  updateReview(id, updates) {
    const review = this.reviews.get(id);
    if (!review) {
      throw new Error(`Review not found: ${id}`);
    }

    review.update(updates);
    this._saveData();
    return review;
  }

  deleteReview(id) {
    if (!this.reviews.has(id)) {
      throw new Error(`Review not found: ${id}`);
    }
    this.reviews.delete(id);
    this._saveData();
  }

  // ========== Timeline Management ==========

  addTimelineEntry(reviewId, entry) {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }

    review.addTimelineEntry(entry);
    this._saveData();
    return review;
  }

  // ========== Action Items ==========

  addActionItem(reviewId, item) {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }

    review.addActionItem(item);
    this._saveData();
    return review;
  }

  updateActionItem(reviewId, actionId, updates) {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }

    const action = review.lessons.actionItems.find(a => a.id === actionId);
    if (!action) {
      throw new Error(`Action item not found: ${actionId}`);
    }

    Object.assign(action, updates);
    review.updatedAt = Date.now();
    this._saveData();
    return review;
  }

  getActionItems(filters = {}) {
    const allActions = [];
    for (const review of this.reviews.values()) {
      for (const action of review.lessons.actionItems) {
        if (filters.status && action.status !== filters.status) continue;
        allActions.push({
          ...action,
          reviewId: review.id,
          reviewTitle: review.title
        });
      }
    }
    return allActions.sort((a, b) => b.createdAt - a.createdAt);
  }

  // ========== Export ==========

  exportMarkdown(reviewId, outputPath = null) {
    const review = this.reviews.get(reviewId);
    if (!review) {
      throw new Error(`Review not found: ${reviewId}`);
    }

    const markdown = MarkdownGenerator.generateReview(review);

    if (outputPath) {
      fs.writeFileSync(outputPath, markdown, 'utf8');
      return outputPath;
    }

    return markdown;
  }

  exportAllMarkdown(outputDir) {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const exported = [];
    for (const review of this.reviews.values()) {
      const filename = `${review.id}_${review.title.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
      const filepath = path.join(outputDir, filename);
      const markdown = MarkdownGenerator.generateReview(review);
      fs.writeFileSync(filepath, markdown, 'utf8');
      exported.push(filepath);
    }

    return exported;
  }

  // ========== Statistics ==========

  getStats() {
    const reviews = Array.from(this.reviews.values());
    const completed = reviews.filter(r => r.status === 'completed').length;
    const inProgress = reviews.filter(r => r.status === 'in_progress').length;
    const draft = reviews.filter(r => r.status === 'draft').length;

    const severityCounts = {};
    for (const r of reviews) {
      severityCounts[r.severity] = (severityCounts[r.severity] || 0) + 1;
    }

    const actionItems = this.getActionItems();
    const pendingActions = actionItems.filter(a => a.status === 'pending').length;
    const completedActions = actionItems.filter(a => a.status === 'completed').length;

    return {
      totalReviews: reviews.length,
      completed,
      inProgress,
      draft,
      bySeverity: severityCounts,
      totalActionItems: actionItems.length,
      pendingActionItems: pendingActions,
      completedActionItems: completedActions
    };
  }

  // ========== Templates ==========

  getTemplates() {
    return {
      standard: {
        title: '事件复盘报告',
        severity: 'medium',
        timeline: [
          { title: '事件开始', description: '事件被发现或开始' },
          { title: '告警触发', description: '监控系统检测到问题' },
          { title: '响应开始', description: '团队开始响应' },
          { title: '根因确定', description: '找到问题根源' },
          { title: '修复实施', description: '应用修复方案' },
          { title: '事件恢复', description: '服务恢复正常' },
          { title: '复盘完成', description: '完成复盘分析' }
        ]
      },
      quick: {
        title: '快速复盘',
        severity: 'low',
        timeline: [
          { title: '发生了什么', description: '简述事件' },
          { title: '如何解决', description: '解决方案' },
          { title: '学到了什么', description: '经验教训' }
        ]
      }
    };
  }

  createFromTemplate(templateName) {
    const templates = this.getTemplates();
    const template = templates[templateName];
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    return this.createReview({
      title: template.title,
      severity: template.severity,
      timeline: template.timeline.map(t => ({
        ...t,
        time: Date.now()
      }))
    });
  }
}

// ========== CLI ==========

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const tool = new ReviewTool();

  switch (command) {
    case 'list':
      console.log('Reviews:');
      console.log('========');
      for (const r of tool.listReviews()) {
        console.log(`\n[${r.status}] ${r.title}`);
        console.log(`  Severity: ${r.severity} | Date: ${new Date(r.date).toLocaleDateString()}`);
      }
      break;

    case 'get':
      const review = tool.getReview(args[1]);
      if (review) {
        console.log(JSON.stringify(review.toJSON(), null, 2));
      } else {
        console.log(`Review not found: ${args[1]}`);
      }
      break;

    case 'create':
      const newReview = tool.createReview({
        title: args.slice(1).join(' ') || 'New Review',
        severity: 'medium'
      });
      console.log(`Created review: ${newReview.id}`);
      break;

    case 'update':
      tool.updateReview(args[1], {
        status: args[2] || 'completed'
      });
      console.log(`Updated review: ${args[1]}`);
      break;

    case 'timeline':
      tool.addTimelineEntry(args[1], {
        title: args[2] || 'Timeline Entry',
        description: args[3] || '',
        actor: args[4] || 'system'
      });
      console.log('Added timeline entry');
      break;

    case 'action':
      tool.addActionItem(args[1], {
        description: args.slice(2).join(' ') || 'New action item',
        owner: args[3] || ''
      });
      console.log('Added action item');
      break;

    case 'actions':
      console.log('All Action Items:');
      console.log('=================');
      for (const action of tool.getActionItems()) {
        console.log(`\n[${action.status}] ${action.description}`);
        console.log(`  Review: ${action.reviewTitle}`);
        console.log(`  Owner: ${action.owner || 'Unassigned'}`);
      }
      break;

    case 'export':
      const md = tool.exportMarkdown(args[1]);
      console.log(md);
      break;

    case 'export-file':
      tool.exportMarkdown(args[1], args[2]);
      console.log(`Exported to: ${args[2]}`);
      break;

    case 'templates':
      console.log('Available Templates:');
      console.log('====================');
      console.log(JSON.stringify(tool.getTemplates(), null, 2));
      break;

    case 'use-template':
      const templateReview = tool.createFromTemplate(args[1] || 'standard');
      console.log(`Created review from template: ${templateReview.id}`);
      break;

    case 'stats':
      console.log('Review Statistics:');
      console.log('==================');
      console.log(JSON.stringify(tool.getStats(), null, 2));
      break;

    case 'demo':
      // Create demo reviews
      const demo1 = tool.createReview({
        title: 'API Gateway 故障复盘',
        incidentId: 'INC-001',
        incidentTitle: 'API Gateway 高延迟',
        date: Date.now() - 86400000 * 2,
        severity: 'high',
        duration: 45,
        status: 'completed',
        impact: {
          usersAffected: 5000,
          servicesAffected: ['API Gateway', 'User Service'],
          financialImpact: 10000,
          reputationalImpact: 'medium'
        },
        rootCause: {
          category: 'infrastructure',
          description: '数据库连接池配置不当导致连接耗尽',
          contributingFactors: ['监控告警延迟', '文档缺失']
        },
        resolution: {
          immediate: '重启数据库连接池',
          shortTerm: ['增加连接池大小', '优化慢查询'],
          longTerm: ['实施自动扩缩容', '完善监控告警']
        },
        lessons: {
          whatWentWell: ['团队响应迅速', '沟通及时'],
          whatCouldImprove: ['监控覆盖不足', '文档需要更新'],
          actionItems: []
        },
        participants: ['张三', '李四', '王五'],
        reviewers: ['技术总监']
      });

      // Add timeline
      tool.addTimelineEntry(demo1.id, { title: '问题发现', description: '用户报告API响应慢', time: Date.now() - 86400000 * 2 });
      tool.addTimelineEntry(demo1.id, { title: '告警触发', description: '监控系统检测到高延迟', time: Date.now() - 86400000 * 2 + 300000 });
      tool.addTimelineEntry(demo1.id, { title: '开始调查', description: '团队开始排查', time: Date.now() - 86400000 * 2 + 600000 });
      tool.addTimelineEntry(demo1.id, { title: '定位根因', description: '发现数据库连接池问题', time: Date.now() - 86400000 * 2 + 1800000 });
      tool.addTimelineEntry(demo1.id, { title: '应用修复', description: '重启连接池', time: Date.now() - 86400000 * 2 + 2400000 });
      tool.addTimelineEntry(demo1.id, { title: '服务恢复', description: '延迟恢复正常', time: Date.now() - 86400000 * 2 + 2700000 });

      // Add action items
      tool.addActionItem(demo1.id, { description: '增加数据库监控', owner: '张三', status: 'in_progress' });
      tool.addActionItem(demo1.id, { description: '更新连接池配置文档', owner: '李四', status: 'completed' });
      tool.addActionItem(demo1.id, { description: '实施自动扩缩容', owner: '王五', status: 'pending' });

      const demo2 = tool.createReview({
        title: '支付服务告警复盘',
        date: Date.now() - 86400000,
        severity: 'critical',
        duration: 120,
        status: 'in_progress',
        impact: {
          usersAffected: 1000,
          servicesAffected: ['Payment Service'],
          financialImpact: 50000,
          reputationalImpact: 'high'
        },
        rootCause: {
          category: 'code',
          description: '第三方支付API超时处理不当'
        },
        resolution: {
          immediate: '暂时禁用重试机制',
          shortTerm: [],
          longTerm: []
        },
        lessons: {
          whatWentWell: [],
          whatCouldImprove: [],
          actionItems: []
        },
        participants: ['赵六', '钱七']
      });

      console.log('Demo reviews created');
      console.log('\nReviews:', tool.listReviews().map(r => `${r.title} [${r.status}]`));
      console.log('\nAction Items:', tool.getActionItems().length);
      console.log('\nStats:', JSON.stringify(tool.getStats(), null, 2));

      // Export first review as markdown
      console.log('\n--- Exported Markdown (first 50 lines) ---');
      const exported = tool.exportMarkdown(demo1.id);
      console.log(exported.split('\n').slice(0, 50).join('\n'));
      break;

    default:
      console.log('Usage:');
      console.log('  node review-tool.js list                                  - List reviews');
      console.log('  node review-tool.js get <id>                              - Get review');
      console.log('  node review-tool.js create <title>                         - Create review');
      console.log('  node review-tool.js update <id> <status>                  - Update review');
      console.log('  node review-tool.js timeline <id> <title> <desc> <actor>  - Add timeline');
      console.log('  node review-tool.js action <id> <desc> [owner]            - Add action');
      console.log('  node review-tool.js actions                               - List all actions');
      console.log('  node review-tool.js export <id>                           - Export markdown');
      console.log('  node review-tool.js export-file <id> <path>               - Export to file');
      console.log('  node review-tool.js templates                            - Show templates');
      console.log('  node review-tool.js use-template <name>                  - Create from template');
      console.log('  node review-tool.js stats                               - Show statistics');
      console.log('  node review-tool.js demo                                - Run demo');
  }
}

if (require.main === module) {
  main();
}

// ========== Export ==========

module.exports = {
  Review,
  MarkdownGenerator,
  ReviewTool
};
