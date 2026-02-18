/**
 * Agent CRD (Custom Resource Definition) Manager
 * Manages custom resource definitions for agent types
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class AgentCRDManager {
  constructor(options = {}) {
    this.crds = new Map();
    this.customResources = new Map();
    this.apiVersions = new Map();
    this.validationSchemas = new Map();
    this.webhookConfigurations = new Map();

    // Initialize default API group
    this.apiGroups = options.apiGroups || ['agents.example.com', 'workflows.example.com'];
    this.defaultVersion = options.defaultVersion || 'v1';
  }

  createCRD(crdConfig) {
    const {
      name,
      group,
      version,
      kind,
      plural,
      namespaced = true,
      scope = 'Namespaced',
      validation,
      subresources,
      additionalPrinterColumns,
      labels,
      annotations
    } = crdConfig;

    const crdId = `${group}/${version}/${plural}`;
    const crd = {
      id: crdId,
      name,
      group: group || this.apiGroups[0],
      version: version || this.defaultVersion,
      kind,
      plural: plural || `${name}s`,
      scope: scope || (namespaced ? 'Namespaced' : 'Cluster'),
      spec: {
        group: group || this.apiGroups[0],
        versions: [
          {
            name: version || this.defaultVersion,
            served: true,
            storage: true
          }
        ],
        names: {
          plural: plural || `${name}s`,
          singular: name,
          kind: kind || this._capitalize(name),
          shortNames: [],
          categories: ['all', 'agent']
        },
        scope: scope || (namespaced ? 'Namespaced' : 'Cluster'),
        validation: validation || null,
        subresources: subresources || { status: {} },
        additionalPrinterColumns: additionalPrinterColumns || [
          { name: 'Age', type: 'date', JSONPath: '.metadata.creationTimestamp' }
        ]
      },
      status: {
        acceptedNames: {
          plural: plural || `${name}s`,
          singular: name,
          kind: kind || this._capitalize(name),
          shortNames: []
        },
        storedVersions: [version || this.defaultVersion],
        conditions: [
          { type: 'NamesAccepted', status: 'True', reason: 'NoConflicts' }
        ]
      },
      labels: labels || {},
      annotations: annotations || {},
      createdAt: new Date().toISOString()
    };

    this.crds.set(crdId, crd);
    this.apiVersions.set(crdId, { group: crd.group, version: crd.version });

    if (validation) {
      this.validationSchemas.set(crdId, validation);
    }

    console.log(`CRD created: ${crdId} (${crd.kind})`);
    return crd;
  }

  _capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  deleteCRD(crdId) {
    const crd = this.crds.get(crdId);
    if (!crd) {
      throw new Error(`CRD not found: ${crdId}`);
    }

    // Check for existing custom resources
    const resources = Array.from(this.customResources.values())
      .filter(r => r.crdId === crdId);
    if (resources.length > 0) {
      throw new Error(`Cannot delete CRD with ${resources.length} custom resources`);
    }

    this.crds.delete(crdId);
    this.apiVersions.delete(crdId);
    this.validationSchemas.delete(crdId);

    console.log(`CRD deleted: ${crdId}`);
    return { success: true, crdId };
  }

  createCustomResource(resourceConfig) {
    const {
      name,
      crdId,
      namespace,
      spec,
      metadata = {}
    } = resourceConfig;

    const crd = this.crds.get(crdId);
    if (!crd) {
      throw new Error(`CRD not found: ${crdId}`);
    }

    const resourceId = namespace ? `${namespace}/${name}` : name;
    const resource = {
      id: resourceId,
      name,
      namespace: crd.scope === 'Namespaced' ? namespace : null,
      crdId,
      apiVersion: `${crd.group}/${crd.version}`,
      kind: crd.spec.names.kind,
      spec: spec || {},
      metadata: {
        name,
        namespace: crd.scope === 'Namespaced' ? namespace : null,
        uid: crypto.randomUUID(),
        resourceVersion: '1',
        generation: 1,
        creationTimestamp: new Date().toISOString(),
        labels: metadata.labels || {},
        annotations: metadata.annotations || {}
      },
      status: {
        observedGeneration: 1,
        conditions: [
          { type: 'Ready', status: 'True', reason: 'Ready' }
        ]
      }
    };

    this.customResources.set(resourceId, resource);
    console.log(`Custom resource created: ${resourceId} (${crd.kind})`);
    return resource;
  }

  getCustomResource(resourceId) {
    const resource = this.customResources.get(resourceId);
    if (!resource) {
      throw new Error(`Custom resource not found: ${resourceId}`);
    }
    return resource;
  }

  updateCustomResource(resourceId, updates) {
    const resource = this.customResources.get(resourceId);
    if (!resource) {
      throw new Error(`Custom resource not found: ${resourceId}`);
    }

    if (updates.spec) {
      resource.spec = { ...resource.spec, ...updates.spec };
      resource.metadata.resourceVersion = (parseInt(resource.metadata.resourceVersion) + 1).toString();
      resource.metadata.generation = resource.metadata.generation + 1;
    }

    if (updates.metadata) {
      resource.metadata.labels = { ...resource.metadata.labels, ...updates.metadata.labels };
      resource.metadata.annotations = { ...resource.metadata.annotations, ...updates.metadata.annotations };
    }

    if (updates.status) {
      resource.status = { ...resource.status, ...updates.status };
    }

    console.log(`Custom resource updated: ${resourceId}`);
    return resource;
  }

  deleteCustomResource(resourceId) {
    if (!this.customResources.has(resourceId)) {
      throw new Error(`Custom resource not found: ${resourceId}`);
    }

    this.customResources.delete(resourceId);
    console.log(`Custom resource deleted: ${resourceId}`);
    return { success: true, resourceId };
  }

  listCRDs(group = null, version = null) {
    let crds = Array.from(this.crds.values());

    if (group) {
      crds = crds.filter(c => c.group === group);
    }
    if (version) {
      crds = crds.filter(c => c.version === version);
    }

    return crds.map(c => ({
      id: c.id,
      name: c.name,
      group: c.group,
      version: c.version,
      kind: c.kind,
      plural: c.plural,
      scope: c.scope,
      status: c.status.conditions[0]?.status || 'Unknown'
    }));
  }

  listCustomResources(crdId = null, namespace = null) {
    let resources = Array.from(this.customResources.values());

    if (crdId) {
      resources = resources.filter(r => r.crdId === crdId);
    }
    if (namespace) {
      resources = resources.filter(r => r.namespace === namespace);
    }

    return resources.map(r => ({
      id: r.id,
      name: r.name,
      namespace: r.namespace,
      crdId: r.crdId,
      kind: r.kind,
      apiVersion: r.apiVersion,
      status: r.status.conditions[0]?.status || 'Unknown'
    }));
  }

  validateCustomResource(resourceId, data) {
    const resource = this.customResources.get(resourceId);
    if (!resource) {
      throw new Error(`Custom resource not found: ${resourceId}`);
    }

    const schema = this.validationSchemas.get(resource.crdId);
    if (!schema) {
      return { valid: true, errors: [] };
    }

    const errors = [];

    // Basic validation
    if (schema.required) {
      for (const field of schema.required) {
        if (!data[field]) {
          errors.push({ field, message: `Required field missing: ${field}` });
        }
      }
    }

    // Type validation
    if (schema.properties) {
      for (const [field, prop] of Object.entries(schema.properties)) {
        if (data[field] !== undefined) {
          const actualType = typeof data[field];
          if (prop.type && actualType !== prop.type) {
            errors.push({
              field,
              message: `Expected type ${prop.type}, got ${actualType}`
            });
          }
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  patchCustomResource(resourceId, patch) {
    const resource = this.customResources.get(resourceId);
    if (!resource) {
      throw new Error(`Custom resource not found: ${resourceId}`);
    }

    // Apply JSON patch
    if (patch.op === 'replace' && patch.path && patch.value !== undefined) {
      const pathParts = patch.path.split('/').filter(p => p);
      let target = resource;

      for (let i = 0; i < pathParts.length - 1; i++) {
        target = target[pathParts[i]];
      }

      const lastKey = pathParts[pathParts.length - 1];
      target[lastKey] = patch.value;
    }

    resource.metadata.resourceVersion = (parseInt(resource.metadata.resourceVersion) + 1).toString();

    console.log(`Custom resource patched: ${resourceId}`);
    return resource;
  }

  watchCustomResources(crdId, callback) {
    const resources = Array.from(this.customResources.values())
      .filter(r => r.crdId === crdId);

    callback('ADDED', resources);

    // Set up observer for changes
    const observer = {
      crdId,
      callback,
      listeners: new Set()
    };

    console.log(`Watching custom resources for CRD: ${crdId}`);
    return observer;
  }

  stopWatching(observer) {
    console.log(`Stopped watching CRD: ${observer.crdId}`);
  }

  getCRDStatus(crdId) {
    const crd = this.crds.get(crdId);
    if (!crd) {
      throw new Error(`CRD not found: ${crdId}`);
    }

    const resources = Array.from(this.customResources.values())
      .filter(r => r.crdId === crdId);

    const ready = resources.filter(r =>
      r.status.conditions?.some(c => c.type === 'Ready' && c.status === 'True')
    ).length;

    return {
      crdId: crd.id,
      kind: crd.kind,
      plural: crd.plural,
      versions: crd.spec.versions.map(v => v.name),
      scope: crd.scope,
      conditions: crd.status.conditions,
      customResources: {
        total: resources.length,
        ready,
        notReady: resources.length - ready
      }
    };
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const crdManager = new AgentCRDManager({
    apiGroups: ['agents.example.com', 'workflows.example.com'],
    defaultVersion: 'v1'
  });

  switch (command) {
    case 'create-crd':
      const crdName = args[1] || 'agent';
      const crd = crdManager.createCRD({
        name: crdName,
        group: 'agents.example.com',
        version: 'v1',
        kind: 'Agent',
        plural: 'agents',
        namespaced: true,
        validation: {
          type: 'object',
          required: ['spec'],
          properties: {
            spec: {
              type: 'object',
              required: ['image', 'replicas'],
              properties: {
                image: { type: 'string' },
                replicas: { type: 'integer', minimum: 1 },
                env: { type: 'array' }
              }
            }
          }
        }
      });
      console.log('CRD created:', crd.id);
      break;

    case 'create-resource':
      const resCrdId = args[1] || 'agents.example.com/v1/agents';
      const resName = args[2] || 'my-agent';
      const resNamespace = args[3] || 'default';
      const customRes = crdManager.createCustomResource({
        name: resName,
        crdId: resCrdId,
        namespace: resNamespace,
        spec: { image: 'agents/my-agent:latest', replicas: 3 }
      });
      console.log('Resource created:', customRes.id);
      break;

    case 'list-crds':
      console.log('CRDs:', crdManager.listCRDs());
      break;

    case 'list-resources':
      console.log('Custom Resources:', crdManager.listCustomResources());
      break;

    case 'status':
      const statusCrdId = args[1];
      if (!statusCrdId) {
        console.log('Usage: node agent-crd.js status <crd-id>');
        process.exit(1);
      }
      console.log('Status:', crdManager.getCRDStatus(statusCrdId));
      break;

    case 'demo':
      console.log('=== Agent CRD Manager Demo ===\n');

      // Create Agent CRD
      console.log('1. Creating Agent CRD...');
      const agentCRD = crdManager.createCRD({
        name: 'agent',
        group: 'agents.example.com',
        version: 'v1',
        kind: 'Agent',
        plural: 'agents',
        validation: {
          type: 'object',
          required: ['spec'],
          properties: {
            spec: {
              type: 'object',
              required: ['image', 'replicas'],
              properties: {
                image: { type: 'string' },
                replicas: { type: 'integer', minimum: 1 },
                resources: { type: 'object' }
              }
            }
          }
        }
      });
      console.log('   Created CRD:', agentCRD.id);
      console.log('   Kind:', agentCRD.kind);

      // Create Workflow CRD
      console.log('\n2. Creating Workflow CRD...');
      const workflowCRD = crdManager.createCRD({
        name: 'workflow',
        group: 'workflows.example.com',
        version: 'v1',
        kind: 'Workflow',
        plural: 'workflows',
        validation: {
          type: 'object',
          required: ['spec'],
          properties: {
            spec: {
              type: 'object',
              required: ['steps'],
              properties: {
                steps: { type: 'array' },
                timeout: { type: 'string' }
              }
            }
          }
        }
      });
      console.log('   Created CRD:', workflowCRD.id);

      // Create custom resources
      console.log('\n3. Creating custom resources...');
      const agent1 = crdManager.createCustomResource({
        name: 'data-processor',
        crdId: agentCRD.id,
        namespace: 'production',
        spec: { image: 'agents/data-processor:v1', replicas: 3 }
      });
      console.log('   Created Agent:', agent1.id);

      const agent2 = crdManager.createCustomResource({
        name: 'api-gateway',
        crdId: agentCRD.id,
        namespace: 'production',
        spec: { image: 'agents/api-gateway:v2', replicas: 5 }
      });
      console.log('   Created Agent:', agent2.id);

      const workflow1 = crdManager.createCustomResource({
        name: 'daily-etl',
        crdId: workflowCRD.id,
        namespace: 'production',
        spec: { steps: ['extract', 'transform', 'load'], timeout: '1h' }
      });
      console.log('   Created Workflow:', workflow1.id);

      // List CRDs
      console.log('\n4. All CRDs:');
      const crds = crdManager.listCRDs();
      console.log('   ', JSON.stringify(crds, null, 2));

      // List custom resources
      console.log('\n5. Custom resources:');
      const resources = crdManager.listCustomResources();
      console.log('   ', JSON.stringify(resources, null, 2));

      // Validate resource
      console.log('\n6. Validating resource...');
      const validation = crdManager.validateCustomResource(agent1.id, {
        spec: { image: 'agents/test:v1', replicas: 2 }
      });
      console.log('   Valid:', validation.valid);

      // Update resource
      console.log('\n7. Updating resource...');
      const updated = crdManager.updateCustomResource(agent1.id, {
        spec: { replicas: 5 }
      });
      console.log('   Updated replicas:', updated.spec.replicas);

      // Get CRD status
      console.log('\n8. CRD Status:');
      const status = crdManager.getCRDStatus(agentCRD.id);
      console.log('   Custom Resources:', status.customResources);

      console.log('\n=== Demo Complete ===');
      break;

    default:
      console.log('Usage: node agent-crd.js <command> [args]');
      console.log('\nCommands:');
      console.log('  create-crd [name]           Create a CRD');
      console.log('  create-resource <crd-id> <name> [ns]  Create custom resource');
      console.log('  list-crds                    List CRDs');
      console.log('  list-resources               List custom resources');
      console.log('  status <crd-id>              Get CRD status');
      console.log('  demo                         Run demo');
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = AgentCRDManager;
