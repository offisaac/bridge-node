/**
 * Agent Blue Green - Blue-Green Deployment Module
 *
 * Manages blue-green deployments with instant rollback capability.
 *
 * Usage: node agent-blue-green.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   status     - Show deployment status
 *   switch     - Switch active environment
 */

class Environment {
  constructor(name, config = {}) {
    this.name = name;
    this.version = config.version || '1.0';
    this.instances = config.instances || 1;
    this.replicas = config.replicas || 1;
    this.resources = config.resources || { cpu: '500m', memory: '512Mi' };
    this.healthCheck = config.healthCheck || null;
    this.ready = config.ready !== false;
    this.traffic = config.traffic || 0;
    this.metadata = config.metadata || {};
  }
}

class BlueGreenDeployment {
  constructor() {
    this.environments = new Map();
    this.activeEnvironment = 'blue';
    this.deployments = new Map();
    this.rollbacks = [];
    this._initSampleData();
  }

  _initSampleData() {
    // Sample blue-green environments
    this.environments.set('blue', new Environment('blue', {
      version: '2.1.0',
      instances: 3,
      replicas: 3,
      traffic: 100,
      ready: true,
      resources: { cpu: '1000m', memory: '1Gi' }
    }));

    this.environments.set('green', new Environment('green', {
      version: '2.2.0',
      instances: 3,
      replicas: 3,
      traffic: 0,
      ready: true,
      resources: { cpu: '1000m', memory: '1Gi' }
    }));

    // Sample deployment history
    this.deployments.set('deploy-001', {
      id: 'deploy-001',
      environment: 'blue',
      version: '2.1.0',
      status: 'completed',
      startedAt: '2026-02-15T10:00:00Z',
      completedAt: '2026-02-15T10:05:00Z',
      duration: 300,
      instances: 3,
      success: true
    });

    this.deployments.set('deploy-002', {
      id: 'deploy-002',
      environment: 'green',
      version: '2.0.0',
      status: 'rolled-back',
      startedAt: '2026-02-14T14:00:00Z',
      completedAt: '2026-02-14T14:03:00Z',
      duration: 180,
      instances: 3,
      success: false,
      rollbackReason: 'Health check failures'
    });
  }

  // Deploy to environment
  deploy(environmentName, version, config = {}) {
    if (!this.environments.has(environmentName)) {
      this.environments.set(environmentName, new Environment(environmentName));
    }

    const env = this.environments.get(environmentName);
    env.version = version;
    env.ready = false;
    env.traffic = 0;

    if (config.instances) env.instances = config.instances;
    if (config.replicas) env.replicas = config.replicas;
    if (config.resources) env.resources = config.resources;

    const deployment = {
      id: `deploy-${Date.now()}`,
      environment: environmentName,
      version,
      status: 'deploying',
      startedAt: new Date().toISOString(),
      config
    };

    this.deployments.set(deployment.id, deployment);
    return deployment;
  }

  // Mark deployment complete
  completeDeployment(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    deployment.status = 'completed';
    deployment.completedAt = new Date().toISOString();
    deployment.duration = (new Date(deployment.completedAt) - new Date(deployment.startedAt)) / 1000;
    deployment.success = true;

    const env = this.environments.get(deployment.environment);
    if (env) {
      env.ready = true;
    }

    return deployment;
  }

  // Switch traffic
  switchTraffic(targetEnvironment) {
    if (!this.environments.has(targetEnvironment)) {
      throw new Error(`Environment ${targetEnvironment} not found`);
    }

    const currentActive = this.activeEnvironment;
    const target = this.environments.get(targetEnvironment);

    if (!target.ready) {
      throw new Error(`Target environment ${targetEnvironment} is not ready`);
    }

    // Update traffic
    this.environments.get(currentActive).traffic = 0;
    target.traffic = 100;

    this.activeEnvironment = targetEnvironment;

    return {
      previous: currentActive,
      current: targetEnvironment,
      version: target.version
    };
  }

  // Rollback
  rollback(targetEnvironment = null) {
    const rollbackTarget = targetEnvironment || (this.activeEnvironment === 'blue' ? 'blue' : 'green');

    if (!this.environments.has(rollbackTarget)) {
      throw new Error(`Environment ${rollbackTarget} not found`);
    }

    const env = this.environments.get(rollbackTarget);
    if (!env.ready) {
      throw new Error(`Cannot rollback to ${rollbackTarget} - not ready`);
    }

    const previousActive = this.activeEnvironment;

    // Record rollback
    this.rollbacks.push({
      id: `rollback-${Date.now()}`,
      from: previousActive,
      to: rollbackTarget,
      version: env.version,
      timestamp: new Date().toISOString()
    });

    // Switch traffic
    this.environments.get(previousActive).traffic = 0;
    env.traffic = 100;
    this.activeEnvironment = rollbackTarget;

    return {
      previous: previousActive,
      current: rollbackTarget,
      version: env.version
    };
  }

  // Get environment status
  getStatus(environmentName) {
    return this.environments.get(environmentName) || null;
  }

  // Get active environment
  getActive() {
    return {
      name: this.activeEnvironment,
      ...this.environments.get(this.activeEnvironment)
    };
  }

  // List environments
  listEnvironments() {
    return Array.from(this.environments.values()).map(env => ({
      ...env,
      isActive: env.name === this.activeEnvironment
    }));
  }

  // Get deployment history
  getHistory(limit = 10) {
    return Array.from(this.deployments.values())
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .slice(0, limit);
  }

  // Get rollbacks
  getRollbacks() {
    return this.rollbacks;
  }

  // Health check
  healthCheck(environmentName) {
    const env = this.environments.get(environmentName);
    if (!env) {
      return { status: 'unknown', message: 'Environment not found' };
    }

    // Simulate health check
    const isHealthy = env.ready && env.instances > 0;

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      environment: environmentName,
      version: env.version,
      instances: env.instances,
      ready: env.ready
    };
  }

  // Get statistics
  getStats() {
    const envs = this.listEnvironments();
    const active = envs.find(e => e.isActive);

    return {
      totalEnvironments: envs.length,
      activeEnvironment: active?.name,
      activeVersion: active?.version,
      totalDeployments: this.deployments.size,
      completedDeployments: Array.from(this.deployments.values()).filter(d => d.status === 'completed').length,
      rollbacks: this.rollbacks.length
    };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const blueGreen = new BlueGreenDeployment();

switch (command) {
  case 'demo':
    console.log('=== Agent Blue Green Demo\n');

    // 1. List environments
    console.log('1. List Environments:');
    const envs = blueGreen.listEnvironments();
    envs.forEach(e => {
      console.log(`   ${e.name} [v${e.version}] traffic=${e.traffic}% ${e.isActive ? '(ACTIVE)' : ''}`);
    });

    // 2. Get active environment
    console.log('\n2. Get Active Environment:');
    const active = blueGreen.getActive();
    console.log(`   Active: ${active.name} (v${active.version})`);

    // 3. Deploy to green
    console.log('\n3. Deploy to Green:');
    const deploy = blueGreen.deploy('green', '2.3.0', {
      instances: 5,
      resources: { cpu: '2000m', memory: '2Gi' }
    });
    console.log(`   Deployment: ${deploy.id} to green (v${deploy.version})`);
    console.log(`   Status: ${deploy.status}`);

    // 4. Complete deployment
    console.log('\n4. Complete Deployment:');
    const completed = blueGreen.completeDeployment(deploy.id);
    console.log(`   Deployment: ${completed.id}`);
    console.log(`   Status: ${completed.status}`);
    console.log(`   Duration: ${completed.duration}s`);

    // 5. Health check
    console.log('\n5. Health Check:');
    const health = blueGreen.healthCheck('green');
    console.log(`   Green: ${health.status} (v${health.version})`);

    // 6. Switch traffic to green
    console.log('\n6. Switch Traffic:');
    const switched = blueGreen.switchTraffic('green');
    console.log(`   Switched: ${switched.previous} -> ${switched.current}`);
    console.log(`   Version: ${switched.version}`);

    // 7. List environments after switch
    console.log('\n7. Environment Status After Switch:');
    const envsAfter = blueGreen.listEnvironments();
    envsAfter.forEach(e => {
      console.log(`   ${e.name}: traffic=${e.traffic}% ${e.isActive ? '(ACTIVE)' : ''}`);
    });

    // 8. Deployment history
    console.log('\n8. Deployment History:');
    const history = blueGreen.getHistory(5);
    history.forEach(d => {
      console.log(`   ${d.id}: ${d.environment} v${d.version} [${d.status}]`);
    });

    // 9. Rollback
    console.log('\n9. Rollback:');
    const rollback = blueGreen.rollback();
    console.log(`   Rolled back: ${rollback.previous} -> ${rollback.current}`);
    console.log(`   Version: ${rollback.version}`);

    // 10. Get statistics
    console.log('\n10. Get Statistics:');
    const stats = blueGreen.getStats();
    console.log(`    Active: ${stats.activeEnvironment} (v${stats.activeVersion})`);
    console.log(`    Total deployments: ${stats.totalDeployments}`);
    console.log(`    Completed: ${stats.completedDeployments}`);
    console.log(`    Rollbacks: ${stats.rollbacks}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'status':
    console.log('Blue-Green Status:');
    const status = blueGreen.listEnvironments();
    status.forEach(e => {
      console.log(`  ${e.name}: v${e.version} traffic=${e.traffic}% ${e.isActive ? '(ACTIVE)' : ''}`);
    });
    break;

  case 'switch':
    const target = args[1] || 'green';
    const result = blueGreen.switchTraffic(target);
    console.log(`Switched to ${result.current} (v${result.version})`);
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-blue-green.js [demo|status|switch]');
}
