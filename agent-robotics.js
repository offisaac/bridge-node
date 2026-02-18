/**
 * Agent Robotics - Robotics Management Agent
 *
 * Manages robots, robot tasks, kinematics, and robot fleet operations.
 *
 * Usage: node agent-robotics.js [command]
 * Commands:
 *   demo    - Run demonstration
 *   add     - Add robot
 *   list    - List robots
 */

class Robot {
  constructor(config) {
    this.id = `robot-${Date.now()}`;
    this.name = config.name;
    this.type = config.type; // industrial, collaborative, mobile, aerial, humanoid, quadruped
    this.manufacturer = config.manufacturer || 'Unknown';
    this.model = config.model || 'Generic';
    this.status = 'idle'; // idle, running, paused, error, maintenance
    this.battery = config.battery || 100; // percentage
    this.position = config.position || { x: 0, y: 0, z: 0 };
    this.joints = config.joints || [];
    this.endEffectors = config.endEffectors || [];
    this.currentTask = null;
    this.taskHistory = [];
    this.sensors = config.sensors || [];
    this.metadata = config.metadata || {};
    this.createdAt = Date.now();
  }

  startTask(taskId) {
    this.status = 'running';
    this.currentTask = taskId;
    console.log(`   Robot ${this.name} started task: ${taskId}`);
  }

  pauseTask() {
    if (this.status === 'running') {
      this.status = 'paused';
      console.log(`   Robot ${this.name} paused task`);
    }
  }

  resumeTask() {
    if (this.status === 'paused') {
      this.status = 'running';
      console.log(`   Robot ${this.name} resumed task`);
    }
  }

  completeTask(taskId) {
    this.status = 'idle';
    this.taskHistory.push(taskId);
    this.currentTask = null;
    console.log(`   Robot ${this.name} completed task: ${taskId}`);
  }

  goToPosition(x, y, z) {
    this.position = { x, y, z };
    console.log(`   Robot ${this.name} moved to (${x}, ${y}, ${z})`);
  }

  setBattery(level) {
    this.battery = Math.max(0, Math.min(100, level));
  }

  needsCharging() {
    return this.battery < 20;
  }
}

class RobotTask {
  constructor(config) {
    this.id = `task-${Date.now()}`;
    this.name = config.name;
    this.type = config.type; // pick, place, weld, inspect, navigate, assemble
    this.robotId = config.robotId;
    this.status = 'pending'; // pending, running, completed, failed, cancelled
    this.priority = config.priority || 'normal'; // low, normal, high, critical
    this.progress = 0; // 0-100
    this.startTime = null;
    this.endTime = null;
    this.parameters = config.parameters || {};
    this.result = null;
    this.error = null;
  }

  start() {
    this.status = 'running';
    this.startTime = Date.now();
  }

  updateProgress(progress) {
    this.progress = Math.min(100, Math.max(0, progress));
    if (this.progress === 100) {
      this.complete();
    }
  }

  complete() {
    this.status = 'completed';
    this.endTime = Date.now();
    this.progress = 100;
  }

  fail(error) {
    this.status = 'failed';
    this.error = error;
    this.endTime = Date.now();
  }

  cancel() {
    this.status = 'cancelled';
    this.endTime = Date.now();
  }
}

class KinematicsModel {
  constructor(config) {
    this.id = `kinematics-${Date.now()}`;
    this.type = config.type; // forward, inverse
    this.dof = config.dof || 6; // degrees of freedom
    this.jointLimits = config.jointLimits || [];
    this.speedLimits = config.speedLimits || [];
  }

  forwardKinematics(jointAngles) {
    // Simplified forward kinematics calculation
    const position = {
      x: Math.sin(jointAngles[0] || 0) * 1.0,
      y: Math.cos(jointAngles[0] || 0) * 0.5,
      z: (jointAngles[1] || 0) * 0.1
    };
    return position;
  }

  inverseKinematics(targetPosition) {
    // Simplified inverse kinematics
    const jointAngles = [
      Math.atan2(targetPosition.y, targetPosition.x),
      targetPosition.z * 0.5,
      0, 0, 0, 0
    ];
    return jointAngles;
  }
}

class RobotAgent {
  constructor(config = {}) {
    this.robots = new Map();
    this.tasks = new Map();
    this.kinematics = new Map();
    this.stats = {
      robotsRegistered: 0,
      tasksCompleted: 0,
      tasksFailed: 0
    };
    this.initDemoRobots();
    this.initKinematics();
  }

  initDemoRobots() {
    // Create demo robots
  }

  initKinematics() {
    const models = [
      { type: 'forward', dof: 6 },
      { type: 'inverse', dof: 6 }
    ];
    models.forEach(m => {
      const model = new KinematicsModel(m);
      this.kinematics.set(m.type, model);
    });
  }

  addRobot(config) {
    const robot = new Robot(config);
    this.robots.set(robot.id, robot);
    this.stats.robotsRegistered++;
    console.log(`   Added robot: ${robot.name} (${robot.type})`);
    return robot;
  }

  registerRobot(config) {
    return this.addRobot(config);
  }

  assignTask(robotId, taskConfig) {
    const robot = this.robots.get(robotId);
    if (!robot) {
      return { success: false, reason: 'Robot not found' };
    }

    const task = new RobotTask({
      ...taskConfig,
      robotId
    });

    this.tasks.set(task.id, task);
    robot.startTask(task.id);
    task.start();

    console.log(`   Assigned task to ${robot.name}: ${task.name}`);
    return { success: true, task };
  }

  updateTaskProgress(taskId, progress) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, reason: 'Task not found' };
    }

    task.updateProgress(progress);

    if (task.progress === 100) {
      const robot = this.robots.get(task.robotId);
      if (robot) {
        robot.completeTask(task.id);
        this.stats.tasksCompleted++;
      }
    }

    return { success: true, task };
  }

  cancelTask(taskId) {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, reason: 'Task not found' };
    }

    task.cancel();

    const robot = this.robots.get(task.robotId);
    if (robot) {
      robot.status = 'idle';
      robot.currentTask = null;
    }

    console.log(`   Cancelled task: ${task.name}`);
    return { success: true };
  }

  moveRobot(robotId, x, y, z) {
    const robot = this.robots.get(robotId);
    if (!robot) {
      return { success: false, reason: 'Robot not found' };
    }

    robot.goToPosition(x, y, z);
    return { success: true, position: robot.position };
  }

  getRobot(robotId) {
    return this.robots.get(robotId);
  }

  listRobots(status = null) {
    const robots = Array.from(this.robots.values());
    if (status) {
      return robots.filter(r => r.status === status);
    }
    return robots;
  }

  listRobotsByType(type) {
    return Array.from(this.robots.values()).filter(r => r.type === type);
  }

  listTasks(status = null) {
    const tasks = Array.from(this.tasks.values());
    if (status) {
      return tasks.filter(t => t.status === status);
    }
    return tasks;
  }

  getRobotTasks(robotId) {
    return Array.from(this.tasks.values()).filter(t => t.robotId === robotId);
  }

  computeKinematics(type, params) {
    const model = this.kinematics.get(type);
    if (!model) {
      return { success: false, reason: 'Kinematics model not found' };
    }

    let result;
    if (type === 'forward') {
      result = model.forwardKinematics(params.jointAngles);
    } else {
      result = model.inverseKinematics(params.position);
    }

    return { success: true, result };
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const agent = new RobotAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Robotics Demo\n');

    // 1. Add Robots
    console.log('1. Add Robots:');
    const r1 = agent.addRobot({
      name: 'Assembly Arm #1',
      type: 'industrial',
      manufacturer: 'ABB',
      model: 'IRB 6700',
      position: { x: 0, y: 0, z: 0 },
      joints: [0, 0, 0, 0, 0, 0]
    });
    const r2 = agent.addRobot({
      name: 'Cobot #1',
      type: 'collaborative',
      manufacturer: 'Universal Robots',
      model: 'UR10',
      position: { x: 2, y: 1, z: 0 }
    });
    const r3 = agent.addRobot({
      name: 'Warehouse Bot #1',
      type: 'mobile',
      manufacturer: 'MiR',
      model: 'MiR250',
      position: { x: 5, y: 5, z: 0 }
    });
    const r4 = agent.addRobot({
      name: 'Drone #1',
      type: 'aerial',
      manufacturer: 'DJI',
      model: 'Matrice 300',
      position: { x: 0, y: 0, z: 10 }
    });

    // 2. Assign Tasks
    console.log('\n2. Assign Tasks:');
    const t1 = agent.assignTask(r1.id, {
      name: 'Weld Car Body',
      type: 'weld',
      priority: 'high',
      parameters: { speed: 0.5, temperature: 200 }
    });
    const t2 = agent.assignTask(r2.id, {
      name: 'Pick Component A',
      type: 'pick',
      priority: 'normal',
      parameters: { object: 'component_a', location: 'bin_1' }
    });
    const t3 = agent.assignTask(r3.id, {
      name: 'Navigate to Station B',
      type: 'navigate',
      priority: 'normal',
      parameters: { target: 'station_b' }
    });

    // 3. Update Task Progress
    console.log('\n3. Update Task Progress:');
    agent.updateTaskProgress(t1.task.id, 25);
    agent.updateTaskProgress(t1.task.id, 50);
    agent.updateTaskProgress(t1.task.id, 75);
    agent.updateTaskProgress(t1.task.id, 100);

    // 4. Move Robot
    console.log('\n4. Move Robot:');
    agent.moveRobot(r1.id, 1.5, 2.0, 0.5);

    // 5. Forward Kinematics
    console.log('\n5. Forward Kinematics:');
    const fk = agent.computeKinematics('forward', {
      jointAngles: [0.5, 0.3, 0.2, 0, 0, 0]
    });
    console.log(`   Calculated position: (${fk.result.x.toFixed(3)}, ${fk.result.y.toFixed(3)}, ${fk.result.z.toFixed(3)})`);

    // 6. Inverse Kinematics
    console.log('\n6. Inverse Kinematics:');
    const ik = agent.computeKinematics('inverse', {
      position: { x: 0.5, y: 0.8, z: 0.2 }
    });
    console.log(`   Calculated joints: [${ik.result.slice(0,3).join(', ')}]`);

    // 7. List Active Robots
    console.log('\n7. Robot Fleet Status:');
    const robots = agent.listRobots();
    robots.forEach(r => {
      console.log(`   ${r.name}: ${r.status} (battery: ${r.battery}%)`);
    });

    // 8. Battery Check
    console.log('\n8. Battery Status:');
    r3.setBattery(15);
    const lowBattery = robots.filter(r => r.needsCharging());
    if (lowBattery.length > 0) {
      console.log(`   Robots needing charge: ${lowBattery.map(r => r.name).join(', ')}`);
    }

    // 9. Task History
    console.log('\n9. Task History:');
    const completedTasks = agent.listTasks('completed');
    console.log(`   Completed: ${completedTasks.length}`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = agent.getStats();
    console.log(`   Total Robots: ${stats.robotsRegistered}`);
    console.log(`   Tasks Completed: ${stats.tasksCompleted}`);
    console.log(`   Tasks Failed: ${stats.tasksFailed}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'add':
    console.log('Adding test robot...');
    const r = agent.addRobot({
      name: 'Test Robot',
      type: 'industrial',
      location: 'Test Lab'
    });
    console.log(`Added robot: ${r.id}`);
    break;

  case 'list':
    console.log('Listing robots...');
    for (const r of agent.robots.values()) {
      console.log(`   ${r.name}: ${r.status} (${r.type})`);
    }
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-robotics.js [demo|add|list]');
}
