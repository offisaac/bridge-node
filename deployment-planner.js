/**
 * Deployment Planner - 部署规划器
 * 可视化部署规划和依赖映射
 */

const fs = require('fs');
const path = require('path');

// ========== Deployment Types ==========

const DeploymentPhase = {
  PLANNING: 'planning',
  READY: 'ready',
  DEPLOYING: 'deploying',
  COMPLETED: 'completed',
  FAILED: 'failed',
  ROLLED_BACK: 'rolled_back'
};

const DependencyType = {
  REQUIRED: 'required',
  OPTIONAL: 'optional',
  BLOCKS: 'blocks'
};

// ========== Deployment Task ==========

class DeploymentTask {
  constructor(id, config = {}) {
    this.id = id;
    this.name = config.name;
    this.description = config.description || '';
    this.service = config.service;
    this.version = config.version;
    this.phase = config.phase || 1;
    this.dependencies = config.dependencies || [];
    this.estimatedDuration = config.estimatedDuration || 300; // seconds
    this.actualDuration = null;
    this.status = DeploymentPhase.PLANNING;
    this.startedAt = null;
    this.completedAt = null;
    this.metadata = config.metadata || {};
  }

  addDependency(taskId, type = DependencyType.REQUIRED) {
    this.dependencies.push({ taskId, type });
    return this;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      service: this.service,
      version: this.version,
      phase: this.phase,
      dependencies: this.dependencies,
      estimatedDuration: this.estimatedDuration,
      actualDuration: this.actualDuration,
      status: this.status,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      metadata: this.metadata
    };
  }
}

// ========== Dependency Graph ==========

class DependencyGraph {
  constructor() {
    this.nodes = new Map(); // taskId -> DeploymentTask
    this.edges = []; // { from, to, type }
  }

  addNode(task) {
    this.nodes.set(task.id, task);
    return this;
  }

  addEdge(fromId, toId, type = DependencyType.REQUIRED) {
    this.edges.push({ from: fromId, to: toId, type });
    return this;
  }

  getTopologicalOrder() {
    const visited = new Set();
    const result = [];
    const visiting = new Set();

    const visit = (nodeId) => {
      if (visiting.has(nodeId)) {
        throw new Error(`Circular dependency detected involving task ${nodeId}`);
      }

      if (visited.has(nodeId)) return;

      visiting.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (node) {
        // Visit dependencies first
        for (const dep of node.dependencies) {
          visit(dep.taskId);
        }
      }

      visiting.delete(nodeId);
      visited.add(nodeId);
      if (node) result.push(node);
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        visit(nodeId);
      }
    }

    return result;
  }

  getDependents(taskId) {
    const dependents = [];
    for (const edge of this.edges) {
      if (edge.from === taskId) {
        dependents.push(this.nodes.get(edge.to));
      }
    }
    return dependents.filter(Boolean);
  }

  getDependencies(taskId) {
    const task = this.nodes.get(taskId);
    if (!task) return [];

    return task.dependencies
      .map(dep => this.nodes.get(dep.taskId))
      .filter(Boolean);
  }

  detectCycles() {
    const visited = new Set();
    const recursionStack = new Set();
    const cycles = [];

    const dfs = (nodeId, path) => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const task = this.nodes.get(nodeId);
      if (task) {
        for (const dep of task.dependencies) {
          if (!visited.has(dep.taskId)) {
            const cycle = dfs(dep.taskId, [...path, nodeId]);
            if (cycle) return cycle;
          } else if (recursionStack.has(dep.taskId)) {
            return [...path, nodeId, dep.taskId];
          }
        }
      }

      recursionStack.delete(nodeId);
      return null;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        const cycle = dfs(nodeId, []);
        if (cycle) cycles.push(cycle);
      }
    }

    return cycles;
  }
}

// ========== Deployment Plan ==========

class DeploymentPlan {
  constructor(name, config = {}) {
    this.id = config.id || require('crypto').randomUUID();
    this.name = name;
    this.description = config.description || '';
    this.tasks = new Map();
    this.graph = new DependencyGraph();
    this.status = DeploymentPhase.PLANNING;
    this.createdAt = config.createdAt || new Date().toISOString();
    this.startedAt = null;
    this.completedAt = null;
    this.metadata = config.metadata || {};
  }

  addTask(task) {
    this.tasks.set(task.id, task);
    this.graph.addNode(task);
    return this;
  }

  addDependency(fromId, toId, type = DependencyType.REQUIRED) {
    const fromTask = this.tasks.get(fromId);
    if (fromTask) {
      fromTask.addDependency(toId, type);
    }
    this.graph.addEdge(fromId, toId, type);
    return this;
  }

  validate() {
    const errors = [];

    // Check for cycles
    const cycles = this.graph.detectCycles();
    if (cycles.length > 0) {
      errors.push(`Circular dependencies detected: ${cycles.join(', ')}`);
    }

    // Check for missing dependencies
    for (const [id, task] of this.tasks) {
      for (const dep of task.dependencies) {
        if (!this.tasks.has(dep.taskId)) {
          errors.push(`Task ${id} depends on non-existent task ${dep.taskId}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  getExecutionOrder() {
    return this.graph.getTopologicalOrder();
  }

  getCriticalPath() {
    const order = this.getExecutionOrder();
    const durations = new Map();

    // Calculate earliest start times
    for (const task of order) {
      let maxDuration = 0;
      for (const dep of task.dependencies) {
        const depTask = this.tasks.get(dep.taskId);
        if (depTask) {
          const depEnd = (durations.get(dep.taskId) || 0) + depTask.estimatedDuration;
          maxDuration = Math.max(maxDuration, depEnd);
        }
      }
      durations.set(task.id, maxDuration);
    }

    // Find critical path
    const criticalPath = [];
    let current = order[order.length - 1];

    while (current) {
      criticalPath.unshift(current);

      let next = null;
      let minStart = Infinity;

      // Find dependent that starts as early as possible
      for (const [id, startTime] of durations) {
        const task = this.tasks.get(id);
        if (task) {
          for (const dep of task.dependencies) {
            if (dep.taskId === current.id && startTime < minStart) {
              minStart = startTime;
              next = task;
            }
          }
        }
      }

      current = next;
    }

    return criticalPath;
  }

  getTotalDuration() {
    const order = this.getExecutionOrder();
    let maxEnd = 0;

    for (const task of order) {
      let end = task.estimatedDuration;
      for (const dep of task.dependencies) {
        const depTask = this.tasks.get(dep.taskId);
        if (depTask) {
          const depEnd = depTask.estimatedDuration;
          end = Math.max(end, depEnd);
        }
      }
      maxEnd = Math.max(maxEnd, end);
    }

    return maxEnd;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      tasks: Array.from(this.tasks.values()).map(t => t.toJSON()),
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      metadata: this.metadata,
      validation: this.validate(),
      totalDuration: this.getTotalDuration()
    };
  }

  generateVisualization() {
    // Generate ASCII visualization
    let output = '';
    output += `Deployment Plan: ${this.name}\n`;
    output += `=${'='.repeat(40)}\n\n`;
    output += `Total Duration: ${Math.ceil(this.getTotalDuration() / 60)} minutes\n`;
    output += `Total Tasks: ${this.tasks.size}\n`;
    output += `Status: ${this.status}\n\n`;

    const order = this.getExecutionOrder();
    const criticalPath = this.getCriticalPath();
    const criticalIds = new Set(criticalPath.map(t => t.id));

    output += 'Execution Order:\n';
    output += '-'.repeat(40) + '\n';

    let time = 0;
    for (const task of order) {
      const isCritical = criticalIds.has(task.id);
      const prefix = isCritical ? '*' : ' ';
      const phaseStr = `[Phase ${task.phase}]`;
      output += `${prefix} ${phaseStr} ${task.name} (${task.estimatedDuration}s)\n`;

      if (task.dependencies.length > 0) {
        const deps = task.dependencies.map(d => this.tasks.get(d.taskId)?.name || d.taskId).join(', ');
        output += `   Depends on: ${deps}\n`;
      }

      time += task.estimatedDuration;
    }

    output += '\nCritical Path:\n';
    output += '-'.repeat(40) + '\n';
    output += criticalPath.map(t => t.name).join(' -> ') + '\n';

    return output;
  }
}

// ========== Deployment Planner ==========

class DeploymentPlanner {
  constructor(options = {}) {
    this.plansDir = options.plansDir || './deployment-plans';
    this.plans = new Map();

    this._init();
  }

  _init() {
    if (!fs.existsSync(this.plansDir)) {
      fs.mkdirSync(this.plansDir, { recursive: true });
    }

    this._loadPlans();
  }

  // ========== Plan Management ==========

  createPlan(name, config = {}) {
    const plan = new DeploymentPlan(name, config);
    this.plans.set(plan.id, plan);
    this._savePlan(plan);
    return plan;
  }

  getPlan(id) {
    return this.plans.get(id);
  }

  listPlans(filters = {}) {
    let plans = Array.from(this.plans.values());

    if (filters.status) {
      plans = plans.filter(p => p.status === filters.status);
    }

    return plans.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // ========== Task Management ==========

  addTask(planId, task) {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    plan.addTask(task);
    this._savePlan(plan);
    return plan;
  }

  addDependency(planId, fromId, toId, type = DependencyType.REQUIRED) {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    plan.addDependency(fromId, toId, type);
    this._savePlan(plan);
    return plan;
  }

  // ========== Validation ==========

  validatePlan(planId) {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    return plan.validate();
  }

  // ========== Visualization ==========

  generateVisualization(planId) {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    return plan.generateVisualization();
  }

  generateDOT(planId) {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    let dot = 'digraph deployment {\n';
    dot += '  rankdir=LR;\n';
    dot += '  node [shape=box];\n\n';

    // Add nodes
    for (const [id, task] of plan.tasks) {
      const label = `${task.name}\\n(${task.estimatedDuration}s)`;
      dot += `  "${id}" [label="${label}"];\n`;
    }

    dot += '\n';

    // Add edges
    for (const task of plan.tasks.values()) {
      for (const dep of task.dependencies) {
        const style = dep.type === DependencyType.REQUIRED ? 'solid' : 'dashed';
        dot += `  "${dep.taskId}" -> "${task.id}" [style=${style}];\n`;
      }
    }

    dot += '}\n';
    return dot;
  }

  // ========== Persistence =========-

  _loadPlans() {
    if (!fs.existsSync(this.plansDir)) return;

    const files = fs.readdirSync(this.plansDir).filter(f => f.endsWith('.json'));
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.plansDir, file), 'utf8'));
        const plan = new DeploymentPlan(data.name, data);

        for (const taskData of data.tasks || []) {
          const task = new DeploymentTask(taskData.id, taskData);
          plan.addTask(task);
        }

        this.plans.set(plan.id, plan);
      } catch (err) {
        console.error(`Failed to load plan ${file}:`, err);
      }
    }
  }

  _savePlan(plan) {
    const file = path.join(this.plansDir, `${plan.id}.json`);
    fs.writeFileSync(file, JSON.stringify(plan.toJSON(), null, 2));
  }

  // ========== Statistics ==========

  getStats() {
    const plans = Array.from(this.plans.values());

    return {
      totalPlans: plans.length,
      planning: plans.filter(p => p.status === DeploymentPhase.PLANNING).length,
      ready: plans.filter(p => p.status === DeploymentPhase.READY).length,
      deploying: plans.filter(p => p.status === DeploymentPhase.DEPLOYING).length,
      completed: plans.filter(p => p.status === DeploymentPhase.COMPLETED).length,
      failed: plans.filter(p => p.status === DeploymentPhase.FAILED).length
    };
  }
}

// ========== Export ==========

module.exports = {
  DeploymentPlanner,
  DeploymentPlan,
  DeploymentTask,
  DependencyGraph,
  DeploymentPhase,
  DependencyType
};
