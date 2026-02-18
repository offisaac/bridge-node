/**
 * Agent Kubernetes - Kubernetes Management Agent
 *
 * K8s cluster management, namespaces, nodes, RBAC.
 *
 * Usage: node agent-kubernetes.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   cluster    - Show cluster features
 *   rbac       - Show RBAC features
 */

class K8sNamespace {
  constructor(name, labels = {}) {
    this.name = name;
    this.labels = labels;
    this.status = 'Active';
    this.created = Date.now();
    this.resourceQuota = {};
    this.limitRange = {};
  }
}

class K8sNode {
  constructor(name, role, resources) {
    this.name = name;
    this.role = role; // master, worker
    this.status = 'Ready';
    this.resources = {
      cpu: resources.cpu || 4,
      memory: resources.memory || 8192,
      pods: resources.pods || 110
    };
    this.allocatable = { ...this.resources };
    this.conditions = [
      { type: 'Ready', status: 'True' },
      { type: 'MemoryPressure', status: 'False' },
      { type: 'DiskPressure', status: 'False' }
    ];
    this.created = Date.now();
  }

  isReady() {
    return this.status === 'Ready' && this.conditions[0].status === 'True';
  }
}

class K8sResourceQuota {
  constructor(namespace, quota) {
    this.namespace = namespace;
    this.hard = quota;
    this.used = {};
  }
}

class K8sRole {
  constructor(name, rules) {
    this.name = name;
    this.rules = rules;
    this.type = 'Role';
  }
}

class K8sRoleBinding {
  constructor(name, roleRef, subjects) {
    this.name = name;
    this.roleRef = roleRef;
    this.subjects = subjects;
  }
}

class K8sServiceAccount {
  constructor(name, namespace = 'default') {
    this.name = name;
    this.namespace = namespace;
    this.secrets = [];
    this.imagePullSecrets = [];
    this.created = Date.now();
  }
}

class K8sAgent {
  constructor() {
    this.namespaces = new Map();
    this.nodes = new Map();
    this.pods = new Map();
    this.services = new Map();
    this.deployments = new Map();
    this.roles = new Map();
    this.roleBindings = new Map();
    this.serviceAccounts = new Map();
    this.resourceQuotas = new Map();
    this.stats = {
      namespaces: 0,
      nodes: 0,
      pods: 0,
      services: 0,
      deployments: 0
    };
  }

  // Namespace operations
  createNamespace(name, labels = {}) {
    const ns = new K8sNamespace(name, labels);
    this.namespaces.set(name, ns);
    this.stats.namespaces++;
    return ns;
  }

  getNamespace(name) {
    return this.namespaces.get(name);
  }

  listNamespaces() {
    return Array.from(this.namespaces.values()).map(ns => ({
      name: ns.name,
      status: ns.status,
      labels: ns.labels,
      created: ns.created
    }));
  }

  deleteNamespace(name) {
    if (this.namespaces.delete(name)) {
      this.stats.namespaces--;
      return { deleted: true };
    }
    throw new Error(`Namespace ${name} not found`);
  }

  // Node operations
  addNode(name, role, resources) {
    const node = new K8sNode(name, role, resources);
    this.nodes.set(name, node);
    this.stats.nodes++;
    console.log(`   Added node: ${name} (${role})`);
    return node;
  }

  listNodes() {
    return Array.from(this.nodes.values()).map(n => ({
      name: n.name,
      role: n.role,
      status: n.status,
      resources: n.resources,
      ready: n.isReady()
    }));
  }

  getNodeStatus(name) {
    const node = this.nodes.get(name);
    if (!node) throw new Error(`Node ${name} not found`);
    return {
      name: node.name,
      status: node.status,
      conditions: node.conditions,
      allocatable: node.allocatable
    };
  }

  drainNode(name) {
    const node = this.nodes.get(name);
    if (!node) throw new Error(`Node ${name} not found`);
    console.log(`   Draining node: ${name}`);
    return { drained: true };
  }

  // Pod operations
  createPod(name, namespace, spec) {
    const pod = {
      name,
      namespace,
      spec,
      status: 'Running',
      nodeName: spec.nodeSelector ? 'worker-1' : null,
      created: Date.now()
    };
    this.pods.set(`${namespace}/${name}`, pod);
    this.stats.pods++;
    console.log(`   Created pod: ${namespace}/${name}`);
    return pod;
  }

  listPods(namespace = null) {
    const pods = Array.from(this.pods.values());
    if (namespace) {
      return pods.filter(p => p.namespace === namespace);
    }
    return pods;
  }

  getPod(name, namespace) {
    return this.pods.get(`${namespace}/${name}`);
  }

  deletePod(name, namespace) {
    const key = `${namespace}/${name}`;
    if (this.pods.delete(key)) {
      this.stats.pods--;
      return { deleted: true };
    }
    throw new Error(`Pod ${namespace}/${name} not found`);
  }

  // Service operations
  createService(name, namespace, spec) {
    const service = {
      name,
      namespace,
      spec,
      clusterIP: `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.1`,
      created: Date.now()
    };
    this.services.set(`${namespace}/${name}`, service);
    this.stats.services++;
    console.log(`   Created service: ${namespace}/${name}`);
    return service;
  }

  listServices(namespace = null) {
    const services = Array.from(this.services.values());
    if (namespace) {
      return services.filter(s => s.namespace === namespace);
    }
    return services;
  }

  // Deployment operations
  createDeployment(name, namespace, spec) {
    const deployment = {
      name,
      namespace,
      spec,
      replicas: spec.replicas || 1,
      readyReplicas: spec.replicas || 1,
      created: Date.now()
    };
    this.deployments.set(`${namespace}/${name}`, deployment);
    this.stats.deployments++;
    console.log(`   Created deployment: ${namespace}/${name}`);
    return deployment;
  }

  listDeployments(namespace = null) {
    const deps = Array.from(this.deployments.values());
    if (namespace) {
      return deps.filter(d => d.namespace === namespace);
    }
    return deps;
  }

  scaleDeployment(name, namespace, replicas) {
    const deployment = this.deployments.get(`${namespace}/${name}`);
    if (!deployment) throw new Error(`Deployment ${namespace}/${name} not found`);
    deployment.replicas = replicas;
    console.log(`   Scaled deployment: ${namespace}/${name} to ${replicas} replicas`);
    return deployment;
  }

  // RBAC operations
  createRole(name, rules) {
    const role = new K8sRole(name, rules);
    this.roles.set(name, role);
    console.log(`   Created role: ${name}`);
    return role;
  }

  createRoleBinding(name, roleRef, subjects) {
    const binding = new K8sRoleBinding(name, roleRef, subjects);
    this.roleBindings.set(name, binding);
    console.log(`   Created role binding: ${name}`);
    return binding;
  }

  createServiceAccount(name, namespace = 'default') {
    const sa = new K8sServiceAccount(name, namespace);
    this.serviceAccounts.set(`${namespace}/${name}`, sa);
    console.log(`   Created service account: ${namespace}/${name}`);
    return sa;
  }

  // Resource quota
  createResourceQuota(name, namespace, quota) {
    const rq = new K8sResourceQuota(namespace, quota);
    this.resourceQuotas.set(`${namespace}/${name}`, rq);
    console.log(`   Created resource quota: ${namespace}/${name}`);
    return rq;
  }

  // Cluster info
  getClusterInfo() {
    return {
      version: '1.28.0',
      apiServer: 'https://kubernetes:6443',
      nodes: this.nodes.size,
      namespaces: this.namespaces.size,
      pods: this.pods.size,
      services: this.services.size,
      deployments: this.deployments.size
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const k8s = new K8sAgent();

switch (command) {
  case 'demo':
    console.log('=== Agent Kubernetes Demo\n');

    // 1. Create namespaces
    console.log('1. Namespace Management:');
    k8s.createNamespace('production', { env: 'prod', team: 'platform' });
    k8s.createNamespace('staging', { env: 'staging', team: 'platform' });
    k8s.createNamespace('development', { env: 'dev', team: 'developers' });
    const namespaces = k8s.listNamespaces();
    console.log(`   Total: ${namespaces.length}`);

    // 2. Add nodes
    console.log('\n2. Node Management:');
    k8s.addNode('master-1', 'master', { cpu: 8, memory: 16384, pods: 110 });
    k8s.addNode('worker-1', 'worker', { cpu: 4, memory: 8192, pods: 110 });
    k8s.addNode('worker-2', 'worker', { cpu: 4, memory: 8192, pods: 110 });
    const nodes = k8s.listNodes();
    console.log(`   Ready nodes: ${nodes.filter(n => n.ready).length}`);

    // 3. Create pods
    console.log('\n3. Pod Management:');
    k8s.createPod('nginx-0', 'production', {
      image: 'nginx:latest',
      replicas: 1,
      ports: [80]
    });
    k8s.createPod('postgres-0', 'production', {
      image: 'postgres:15',
      replicas: 1,
      ports: [5432]
    });
    k8s.createPod('redis-0', 'staging', {
      image: 'redis:7',
      replicas: 1,
      ports: [6379]
    });
    const pods = k8s.listPods();
    console.log(`   Total pods: ${pods.length}`);

    // 4. Create services
    console.log('\n4. Service Management:');
    k8s.createService('nginx-svc', 'production', {
      type: 'ClusterIP',
      selector: { app: 'nginx' },
      ports: [{ port: 80, targetPort: 80 }]
    });
    k8s.createService('postgres-svc', 'production', {
      type: 'ClusterIP',
      selector: { app: 'postgres' },
      ports: [{ port: 5432, targetPort: 5432 }]
    });
    const services = k8s.listServices();
    console.log(`   Total services: ${services.length}`);

    // 5. Create deployments
    console.log('\n5. Deployment Management:');
    k8s.createDeployment('nginx', 'production', {
      image: 'nginx:latest',
      replicas: 3,
      ports: [80]
    });
    k8s.createDeployment('api', 'production', {
      image: 'myapi:v1',
      replicas: 5,
      ports: [8080]
    });
    const deployments = k8s.listDeployments();
    console.log(`   Total: ${deployments.length}`);

    // 6. Scale deployment
    console.log('\n6. Scaling:');
    k8s.scaleDeployment('nginx', 'production', 5);
    k8s.scaleDeployment('api', 'production', 10);

    // 7. RBAC
    console.log('\n7. RBAC:');
    k8s.createRole('pod-reader', [
      { verbs: ['get', 'list'], resources: ['pods'], apiGroups: [''] }
    ]);
    k8s.createRoleBinding('alice-pod-reader', { kind: 'Role', name: 'pod-reader' }, [
      { kind: 'User', name: 'alice' }
    ]);
    k8s.createServiceAccount('deploy-bot', 'production');

    // 8. Resource quota
    console.log('\n8. Resource Quota:');
    k8s.createResourceQuota('compute-quota', 'production', {
      'limits.cpu': '10',
      'limits.memory': '20Gi',
      'requests.cpu': '5',
      'requests.memory': '10Gi'
    });

    // 9. Cluster info
    console.log('\n9. Cluster Information:');
    const clusterInfo = k8s.getClusterInfo();
    console.log(`   Version: ${clusterInfo.version}`);
    console.log(`   Nodes: ${clusterInfo.nodes}`);
    console.log(`   Namespaces: ${clusterInfo.namespaces}`);
    console.log(`   Pods: ${clusterInfo.pods}`);

    // 10. Stats
    console.log('\n10. Statistics:');
    const stats = k8s.getStats();
    console.log(`   Namespaces: ${stats.namespaces}`);
    console.log(`   Nodes: ${stats.nodes}`);
    console.log(`   Pods: ${stats.pods}`);
    console.log(`   Services: ${stats.services}`);
    console.log(`   Deployments: ${stats.deployments}`);

    console.log('\n=== Demo Complete ===');
    break;

  case 'cluster':
    console.log('Cluster Features:');
    console.log('  - Multi-node cluster management');
    console.log('  - Namespace isolation');
    console.log('  - Resource quotas and limits');
    console.log('  - Node scheduling and draining');
    break;

  case 'rbac':
    console.log('RBAC Features:');
    console.log('  - Roles and ClusterRoles');
    console.log('  - RoleBindings and ClusterRoleBindings');
    console.log('  - ServiceAccounts');
    console.log('  - User, Group, and ServiceAccount subjects');
    break;

  default:
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-kubernetes.js [demo|cluster|rbac]');
}
