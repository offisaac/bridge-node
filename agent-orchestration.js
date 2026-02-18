/**
 * Agent Container Orchestration Manager
 * Manages containerized agent deployment and orchestration
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentOrchestrator {
  constructor(options = {}) {
    this.clusters = new Map();
    this.containers = new Map();
    this.services = new Map();
    this.deployments = new Map();
    this.configMaps = new Map();
    this.namespaces = new Map();

    // Default namespace
    this.namespaces.set('default', {
      name: 'default',
      labels: { 'istio-injection': 'enabled' },
      createdAt: new Date().toISOString()
    });

    this.imagePullPolicy = options.imagePullPolicy || 'IfNotPresent';
    this.replicaSetStrategy = options.replicaSetStrategy || 'RollingUpdate';
  }

  createNamespace(name, labels = {}) {
    if (this.namespaces.has(name)) {
      throw new Error(`Namespace already exists: ${name}`);
    }

    const namespace = {
      name,
      labels: { ...labels },
      status: 'active',
      createdAt: new Date().toISOString()
    };

    this.namespaces.set(name, namespace);
    console.log(`Namespace created: ${name}`);
    return namespace;
  }

  deleteNamespace(name) {
    if (name === 'default') {
      throw new Error('Cannot delete default namespace');
    }

    const ns = this.namespaces.get(name);
    if (!ns) {
      throw new Error(`Namespace not found: ${name}`);
    }

    // Check for resources
    const containersInNs = Array.from(this.containers.values()).filter(c => c.namespace === name);
    if (containersInNs.length > 0) {
      throw new Error(`Cannot delete namespace with ${containersInNs.length} containers`);
    }

    this.namespaces.delete(name);
    console.log(`Namespace deleted: ${name}`);
    return { success: true, name };
  }

  createCluster(clusterConfig) {
    const { id, name, region, nodes = 3 } = clusterConfig;
    const cluster = {
      id: id || `cluster-${Date.now()}`,
      name: name || id,
      region: region || 'us-east-1',
      status: 'healthy',
      nodes,
      nodePool: [],
      resources: { cpu: nodes * 4000, memory: nodes * 16384 }, // mCore, MiB
      createdAt: new Date().toISOString()
    };

    // Initialize node pool
    for (let i = 0; i < nodes; i++) {
      cluster.nodePool.push({
        id: `${cluster.id}-node-${i}`,
        role: i === 0 ? 'master' : 'worker',
        status: 'ready',
        cpu: 4000,
        memory: 16384,
        pods: 0,
        maxPods: 110
      });
    }

    this.clusters.set(cluster.id, cluster);
    console.log(`Cluster created: ${cluster.name} with ${nodes} nodes`);
    return cluster;
  }

  deleteCluster(clusterId) {
    const cluster = this.clusters.get(clusterId);
    if (!cluster) {
      throw new Error(`Cluster not found: ${clusterId}`);
    }

    const containersInCluster = Array.from(this.containers.values())
      .filter(c => c.clusterId === clusterId);
    if (containersInCluster.length > 0) {
      throw new Error(`Cannot delete cluster with ${containersInCluster.length} containers`);
    }

    this.clusters.delete(clusterId);
    console.log(`Cluster deleted: ${clusterId}`);
    return { success: true, clusterId };
  }

  createDeployment(deploymentConfig) {
    const {
      name,
      namespace = 'default',
      image,
      replicas = 1,
      resources = {},
      env = [],
      ports = [],
      volumes = []
    } = deploymentConfig;

    const deploymentId = `${namespace}-${name}`;
    const cluster = this._getClusterForNamespace(namespace);

    const deployment = {
      id: deploymentId,
      name,
      namespace,
      clusterId: cluster.id,
      image,
      replicas,
      availableReplicas: 0,
      readyReplicas: 0,
      strategy: this.replicaSetStrategy,
      revision: 1,
      resources: {
        requests: resources.requests || { cpu: '100m', memory: '128Mi' },
        limits: resources.limits || { cpu: '500m', memory: '512Mi' }
      },
      env,
      ports,
      volumes,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };

    this.deployments.set(deploymentId, deployment);

    // Create replica set and containers
    this._scaleDeployment(deploymentId, replicas);

    console.log(`Deployment created: ${deploymentId} with ${replicas} replicas`);
    return deployment;
  }

  _getClusterForNamespace(namespace) {
    const clusters = Array.from(this.clusters.values());
    if (clusters.length === 0) {
      // Create default cluster if none exists
      return this.createCluster({ id: 'default', name: 'default-cluster', nodes: 3 });
    }
    return clusters[0];
  }

  _scaleDeployment(deploymentId, replicas) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const cluster = this.clusters.get(deployment.clusterId);
    const currentReplicas = deployment.replicas;

    // Adjust replicas
    deployment.replicas = replicas;
    deployment.readyReplicas = replicas;
    deployment.availableReplicas = replicas;
    deployment.status = 'available';

    // Create or remove containers
    if (replicas > currentReplicas) {
      // Scale up
      for (let i = currentReplicas; i < replicas; i++) {
        const containerId = `${deploymentId}-${crypto.randomBytes(4).toString('hex')}`;
        const container = {
          id: containerId,
          name: `${deployment.name}-${i}`,
          deploymentId,
          namespace: deployment.namespace,
          clusterId: deployment.clusterId,
          image: deployment.image,
          status: 'running',
          restarts: 0,
          createdAt: new Date().toISOString(),
          resources: deployment.resources
        };

        this.containers.set(containerId, container);

        // Update node
        const node = cluster.nodePool.find(n => n.role === 'worker' && n.pods < n.maxPods);
        if (node) node.pods++;
      }
    } else if (replicas < currentReplicas) {
      // Scale down
      const containers = Array.from(this.containers.values())
        .filter(c => c.deploymentId === deploymentId);

      for (let i = replicas; i < currentReplicas; i++) {
        const container = containers[i];
        if (container) {
          this.containers.delete(container.id);
          const node = cluster.nodePool.find(n => n.pods > 0);
          if (node) node.pods--;
        }
      }
    }

    console.log(`Deployment scaled: ${deploymentId} to ${replicas} replicas`);
    return deployment;
  }

  scaleDeployment(deploymentId, replicas) {
    return this._scaleDeployment(deploymentId, replicas);
  }

  updateDeployment(deploymentId, updates) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    // Apply updates
    if (updates.image) {
      deployment.image = updates.image;
      deployment.revision++;
    }
    if (updates.resources) {
      deployment.resources = { ...deployment.resources, ...updates.resources };
    }
    if (updates.env) {
      deployment.env = [...deployment.env, ...updates.env];
    }

    // Rolling update
    if (deployment.strategy === 'RollingUpdate') {
      const oldContainers = Array.from(this.containers.values())
        .filter(c => c.deploymentId === deploymentId);

      // Create new containers with new image
      for (let i = 0; i < deployment.replicas; i++) {
        const newId = `${deploymentId}-${crypto.randomBytes(4).toString('hex')}`;
        const newContainer = {
          id: newId,
          name: `${deployment.name}-${i}`,
          deploymentId,
          namespace: deployment.namespace,
          clusterId: deployment.clusterId,
          image: deployment.image,
          status: 'running',
          restarts: 0,
          createdAt: new Date().toISOString(),
          resources: deployment.resources
        };

        this.containers.set(newId, newContainer);
      }

      // Remove old containers
      for (const container of oldContainers) {
        this.containers.delete(container.id);
      }
    }

    console.log(`Deployment updated: ${deploymentId} to revision ${deployment.revision}`);
    return deployment;
  }

  deleteDeployment(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    // Delete containers
    const containers = Array.from(this.containers.values())
      .filter(c => c.deploymentId === deploymentId);

    for (const container of containers) {
      this.containers.delete(container.id);
    }

    this.deployments.delete(deploymentId);
    console.log(`Deployment deleted: ${deploymentId}`);
    return { success: true, deploymentId };
  }

  createService(serviceConfig) {
    const { name, namespace = 'default', selector, ports, type = 'ClusterIP' } = serviceConfig;
    const serviceId = `${namespace}-${name}`;

    const service = {
      id: serviceId,
      name,
      namespace,
      selector: selector || { app: name },
      ports: ports || [{ port: 80, targetPort: 8080, protocol: 'TCP' }],
      type,
      clusterIP: `10.0.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
      createdAt: new Date().toISOString()
    };

    this.services.set(serviceId, service);
    console.log(`Service created: ${serviceId} (${type})`);
    return service;
  }

  deleteService(serviceId) {
    if (!this.services.has(serviceId)) {
      throw new Error(`Service not found: ${serviceId}`);
    }

    this.services.delete(serviceId);
    console.log(`Service deleted: ${serviceId}`);
    return { success: true, serviceId };
  }

  createConfigMap(name, data, namespace = 'default') {
    const configMapId = `${namespace}-${name}`;

    const configMap = {
      id: configMapId,
      name,
      namespace,
      data,
      createdAt: new Date().toISOString()
    };

    this.configMaps.set(configMapId, configMap);
    console.log(`ConfigMap created: ${configMapId}`);
    return configMap;
  }

  getDeploymentStatus(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const containers = Array.from(this.containers.values())
      .filter(c => c.deploymentId === deploymentId);

    const running = containers.filter(c => c.status === 'running').length;
    const failed = containers.filter(c => c.status === 'failed').length;

    return {
      id: deployment.id,
      name: deployment.name,
      namespace: deployment.namespace,
      replicas: deployment.replicas,
      availableReplicas: deployment.availableReplicas,
      readyReplicas: deployment.readyReplicas,
      revision: deployment.revision,
      status: deployment.status,
      containers: containers.length,
      running,
      failed,
      createdAt: deployment.createdAt
    };
  }

  getContainerStatus(containerId) {
    const container = this.containers.get(containerId);
    if (!container) {
      throw new Error(`Container not found: ${containerId}`);
    }

    return {
      id: container.id,
      name: container.name,
      deploymentId: container.deploymentId,
      namespace: container.namespace,
      clusterId: container.clusterId,
      image: container.image,
      status: container.status,
      restarts: container.restarts,
      resources: container.resources,
      createdAt: container.createdAt
    };
  }

  listDeployments(namespace = null) {
    const deps = Array.from(this.deployments.values());
    if (namespace) {
      return deps.filter(d => d.namespace === namespace);
    }
    return deps;
  }

  listServices(namespace = null) {
    const svcs = Array.from(this.services.values());
    if (namespace) {
      return svcs.filter(s => s.namespace === namespace);
    }
    return svcs;
  }

  listContainers(namespace = null) {
    const containers = Array.from(this.containers.values());
    if (namespace) {
      return containers.filter(c => c.namespace === namespace);
    }
    return containers;
  }

  listClusters() {
    return Array.from(this.clusters.values()).map(c => ({
      id: c.id,
      name: c.name,
      region: c.region,
      status: c.status,
      nodes: c.nodes,
      nodePool: c.nodePool.map(n => ({
        id: n.id,
        role: n.role,
        status: n.status,
        pods: n.pods,
        maxPods: n.maxPods
      }))
    }));
  }

  rollbackDeployment(deploymentId) {
    const deployment = this.deployments.get(deploymentId);
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    if (deployment.revision <= 1) {
      throw new Error('No previous revision to rollback to');
    }

    deployment.revision--;
    console.log(`Deployment rolled back: ${deploymentId} to revision ${deployment.revision}`);
    return deployment;
  }

  restartContainer(containerId) {
    const container = this.containers.get(containerId);
    if (!container) {
      throw new Error(`Container not found: ${containerId}`);
    }

    container.restarts++;
    container.status = 'restarting';
    setTimeout(() => {
      container.status = 'running';
    }, 100);

    console.log(`Container restarted: ${containerId} (restarts: ${container.restarts})`);
    return container;
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const orchestrator = new AgentOrchestrator({
    replicaSetStrategy: 'RollingUpdate'
  });

  switch (command) {
    case 'create-deployment':
      const name = args[1] || 'my-agent';
      const deployment = orchestrator.createDeployment({
        name,
        image: `agents/${name}:latest`,
        replicas: 3,
        ports: [{ containerPort: 8080 }]
      });
      console.log('Deployment created:', deployment.id);
      break;

    case 'scale':
      const depId = args[1];
      const replicas = parseInt(args[2]);
      if (!depId || !replicas) {
        console.log('Usage: node agent-orchestration.js scale <deployment-id> <replicas>');
        process.exit(1);
      }
      orchestrator.scaleDeployment(depId, replicas);
      console.log('Scaled to', replicas);
      break;

    case 'list-deployments':
      console.log('Deployments:', orchestrator.listDeployments());
      break;

    case 'list-containers':
      console.log('Containers:', orchestrator.listContainers());
      break;

    case 'list-clusters':
      console.log('Clusters:', orchestrator.listClusters());
      break;

    case 'status':
      const statusDepId = args[1];
      if (!statusDepId) {
        console.log('Usage: node agent-orchestration.js status <deployment-id>');
        process.exit(1);
      }
      console.log('Status:', orchestrator.getDeploymentStatus(statusDepId));
      break;

    case 'demo':
      console.log('=== Agent Container Orchestration Demo ===\n');

      // Create namespace
      console.log('1. Creating namespace...');
      const ns = orchestrator.createNamespace('agents', { env: 'production' });
      console.log('   Created:', ns.name);

      // Create cluster
      console.log('\n2. Creating cluster...');
      const cluster = orchestrator.createCluster({
        id: 'prod-cluster',
        name: 'Production Cluster',
        region: 'us-east-1',
        nodes: 5
      });
      console.log('   Created cluster with', cluster.nodes, 'nodes');

      // Create deployment
      console.log('\n3. Creating deployment...');
      const dataDeployment = orchestrator.createDeployment({
        name: 'data-processor',
        namespace: 'agents',
        image: 'agents/data-processor:v2.1.0',
        replicas: 3,
        resources: {
          requests: { cpu: '200m', memory: '256Mi' },
          limits: { cpu: '1000m', memory: '1Gi' }
        },
        ports: [{ containerPort: 8080 }]
      });
      console.log('   Created deployment:', dataDeployment.id);
      console.log('   Replicas:', dataDeployment.replicas);

      // Create service
      console.log('\n4. Creating service...');
      const service = orchestrator.createService({
        name: 'data-processor-svc',
        namespace: 'agents',
        selector: { app: 'data-processor' },
        ports: [{ port: 80, targetPort: 8080 }],
        type: 'LoadBalancer'
      });
      console.log('   Created service:', service.id);
      console.log('   Cluster IP:', service.clusterIP);

      // Create ConfigMap
      console.log('\n5. Creating ConfigMap...');
      const configMap = orchestrator.createConfigMap('agent-config', {
        'log-level': 'info',
        'max-retries': '3',
        'timeout': '30s'
      }, 'agents');
      console.log('   Created ConfigMap:', configMap.id);

      // Scale deployment
      console.log('\n6. Scaling deployment to 5 replicas...');
      orchestrator.scaleDeployment(dataDeployment.id, 5);
      console.log('   Scaled to 5 replicas');

      // List deployments
      console.log('\n7. All deployments:');
      console.log('   ', JSON.stringify(orchestrator.listDeployments(), null, 2));

      // Get status
      console.log('\n8. Deployment status:');
      const status = orchestrator.getDeploymentStatus(dataDeployment.id);
      console.log('   Replicas:', status.replicas);
      console.log('   Ready:', status.readyReplicas);
      console.log('   Revision:', status.revision);

      // List containers
      console.log('\n9. Containers running:');
      console.log('   Count:', orchestrator.listContainers('agents').length);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-orchestration.js <command> [args]');
      console.log('\nCommands:');
      console.log('  create-deployment [name]    Create a deployment');
      console.log('  scale <id> <replicas>        Scale deployment');
      console.log('  list-deployments             List deployments');
      console.log('  list-containers              List containers');
      console.log('  list-clusters                List clusters');
      console.log('  status <deployment-id>        Get deployment status');
      console.log('  demo                         Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentOrchestrator;
