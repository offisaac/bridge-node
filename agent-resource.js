/**
 * Agent Resource Module
 *
 * Provides resource planning and allocation management.
 * Usage: node agent-resource.js [command] [options]
 *
 * Commands:
 *   demo                    Run demo
 *   status                 Show resource stats
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = __dirname + '/data';

/**
 * Resource Type
 */
const ResourceType = {
  HUMAN: 'human',
  EQUIPMENT: 'equipment',
  INFRASTRUCTURE: 'infrastructure',
  SOFTWARE: 'software',
  BUDGET: 'budget'
};

/**
 * Resource Status
 */
const ResourceStatus = {
  AVAILABLE: 'available',
  ALLOCATED: 'allocated',
  RESERVED: 'reserved',
  UNAVAILABLE: 'unavailable',
  MAINTENANCE: 'maintenance'
};

/**
 * Resource
 */
class Resource {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.name = config.name;
    this.type = config.type;
    this.status = config.status || ResourceStatus.AVAILABLE;
    this.capacity = config.capacity || 100; // percentage or hours
    this.capacityUnit = config.capacityUnit || 'percentage';
    this.costPerUnit = config.costPerUnit || 0;
    this.owner = config.owner || null;
    this.tags = config.tags || [];
    this.metadata = config.metadata || {};
  }

  isAvailable() {
    return this.status === ResourceStatus.AVAILABLE || this.status === ResourceStatus.RESERVED;
  }

  getAvailableCapacity(allocated) {
    if (this.capacityUnit === 'percentage') {
      return Math.max(0, this.capacity - allocated);
    }
    return Math.max(0, this.capacity - allocated);
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      status: this.status,
      capacity: this.capacity,
      capacityUnit: this.capacityUnit,
      costPerUnit: this.costPerUnit
    };
  }
}

/**
 * Resource Allocation
 */
class ResourceAllocation {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.resourceId = config.resourceId;
    this.projectId = config.projectId;
    this.projectName = config.projectName;
    this.requestedBy = config.requestedBy;
    this.allocatedAmount = config.allocatedAmount;
    this.allocatedUnit = config.allocatedUnit || 'percentage';
    this.startDate = config.startDate;
    this.endDate = config.endDate;
    this.status = config.status || 'pending';
    this.priority = config.priority || 'normal';
    this.createdAt = Date.now();
  }

  isActive() {
    const now = Date.now();
    return this.status === 'approved' &&
           (!this.endDate || now <= this.endDate);
  }

  toJSON() {
    return {
      id: this.id,
      resourceId: this.resourceId,
      projectId: this.projectId,
      projectName: this.projectName,
      allocatedAmount: this.allocatedAmount,
      allocatedUnit: this.allocatedUnit,
      startDate: this.startDate,
      endDate: this.endDate,
      status: this.status,
      priority: this.priority
    };
  }
}

/**
 * Resource Request
 */
class ResourceRequest {
  constructor(config) {
    this.id = config.id || crypto.randomUUID();
    this.resourceType = config.resourceType;
    this.projectId = config.projectId;
    this.projectName = config.projectName;
    this.requestedBy = config.requestedBy;
    this.requestedAmount = config.requestedAmount;
    this.requestedUnit = config.requestedUnit || 'percentage';
    this.startDate = config.startDate;
    this.endDate = config.endDate;
    this.priority = config.priority || 'normal';
    this.status = config.status || 'pending';
    this.approvedBy = config.approvedBy || null;
    this.notes = config.notes || '';
    this.createdAt = Date.now();
  }

  toJSON() {
    return {
      id: this.id,
      resourceType: this.resourceType,
      projectId: this.projectId,
      projectName: this.projectName,
      requestedAmount: this.requestedAmount,
      requestedUnit: this.requestedUnit,
      startDate: this.startDate,
      endDate: this.endDate,
      priority: this.priority,
      status: this.status
    };
  }
}

/**
 * Resource Manager
 */
class ResourceManager {
  constructor(config = {}) {
    this.storageDir = config.storageDir || DATA_DIR;
    this.resources = new Map();
    this.allocations = new Map();
    this.requests = new Map();
    this.stats = {
      totalResources: 0,
      availableResources: 0,
      totalAllocations: 0,
      pendingRequests: 0,
      fulfilledRequests: 0,
      rejectedRequests: 0
    };

    this._init();
  }

  _init() {
    this._createSampleData();
  }

  _createSampleData() {
    // Sample resources
    const resources = [
      new Resource({
        name: 'Engineering Team A',
        type: ResourceType.HUMAN,
        capacity: 100,
        capacityUnit: 'percentage',
        owner: 'John Manager',
        tags: ['engineering', 'development']
      }),
      new Resource({
        name: 'Design Team',
        type: ResourceType.HUMAN,
        capacity: 80,
        capacityUnit: 'percentage',
        owner: 'Jane Design',
        tags: ['design', 'ux']
      }),
      new Resource({
        name: 'Dev Server Cluster',
        type: ResourceType.INFRASTRUCTURE,
        capacity: 500,
        capacityUnit: 'hours',
        costPerUnit: 10,
        tags: ['infrastructure', 'dev']
      }),
      new Resource({
        name: 'Cloud Storage 1TB',
        type: ResourceType.INFRASTRUCTURE,
        capacity: 1000,
        capacityUnit: 'GB',
        costPerUnit: 0.1,
        tags: ['storage', 'cloud']
      }),
      new Resource({
        name: 'QA Automation License',
        type: ResourceType.SOFTWARE,
        capacity: 10,
        capacityUnit: 'percentage',
        costPerUnit: 50,
        tags: ['qa', 'automation']
      }),
      new Resource({
        name: 'Project Budget Q1',
        type: ResourceType.BUDGET,
        capacity: 50000,
        capacityUnit: 'USD',
        tags: ['budget', 'quarterly']
      })
    ];

    for (const res of resources) {
      this.resources.set(res.id, res);
    }

    // Sample allocations
    const allocations = [
      new ResourceAllocation({
        resourceId: resources[0].id,
        projectId: 'proj-001',
        projectName: 'Website Redesign',
        requestedBy: 'user-001',
        allocatedAmount: 60,
        allocatedUnit: 'percentage',
        startDate: Date.now() - 30 * 24 * 60 * 60 * 1000,
        endDate: Date.now() + 60 * 24 * 60 * 60 * 1000,
        status: 'approved',
        priority: 'high'
      }),
      new ResourceAllocation({
        resourceId: resources[1].id,
        projectId: 'proj-001',
        projectName: 'Website Redesign',
        requestedBy: 'user-001',
        allocatedAmount: 40,
        allocatedUnit: 'percentage',
        startDate: Date.now() - 15 * 24 * 60 * 60 * 1000,
        endDate: Date.now() + 45 * 24 * 60 * 60 * 1000,
        status: 'approved',
        priority: 'normal'
      }),
      new ResourceAllocation({
        resourceId: resources[2].id,
        projectId: 'proj-002',
        projectName: 'Mobile App',
        requestedBy: 'user-002',
        allocatedAmount: 200,
        allocatedUnit: 'hours',
        startDate: Date.now(),
        endDate: Date.now() + 90 * 24 * 60 * 60 * 1000,
        status: 'approved',
        priority: 'normal'
      })
    ];

    for (const alloc of allocations) {
      this.allocations.set(alloc.id, alloc);
    }

    // Sample requests
    const requests = [
      new ResourceRequest({
        resourceType: ResourceType.HUMAN,
        projectId: 'proj-003',
        projectName: 'Data Pipeline',
        requestedBy: 'user-003',
        requestedAmount: 25,
        requestedUnit: 'percentage',
        startDate: Date.now() + 14 * 24 * 60 * 60 * 1000,
        endDate: Date.now() + 90 * 24 * 60 * 60 * 1000,
        priority: 'high',
        notes: 'Need additional engineering support for data pipeline'
      }),
      new ResourceRequest({
        resourceType: ResourceType.INFRASTRUCTURE,
        projectId: 'proj-002',
        projectName: 'Mobile App',
        requestedBy: 'user-002',
        requestedAmount: 100,
        requestedUnit: 'hours',
        startDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
        endDate: Date.now() + 60 * 24 * 60 * 60 * 1000,
        priority: 'normal',
        notes: 'Additional dev server capacity for testing'
      })
    ];

    for (const req of requests) {
      this.requests.set(req.id, req);
    }

    this._updateStats();
  }

  _updateStats() {
    this.stats.totalResources = this.resources.size;
    this.stats.availableResources = Array.from(this.resources.values()).filter(r => r.isAvailable()).length;
    this.stats.totalAllocations = this.allocations.size;
    this.stats.pendingRequests = Array.from(this.requests.values()).filter(r => r.status === 'pending').length;
    this.stats.fulfilledRequests = Array.from(this.requests.values()).filter(r => r.status === 'fulfilled').length;
    this.stats.rejectedRequests = Array.from(this.requests.values()).filter(r => r.status === 'rejected').length;
  }

  /**
   * Get resources by type
   */
  getResourcesByType(type) {
    const results = [];
    for (const res of this.resources.values()) {
      if (res.type === type) {
        results.push(res);
      }
    }
    return results;
  }

  /**
   * Get available resources
   */
  getAvailableResources(type = null) {
    const results = [];
    for (const res of this.resources.values()) {
      if (res.isAvailable()) {
        if (!type || res.type === type) {
          results.push(res);
        }
      }
    }
    return results;
  }

  /**
   * Get resource utilization
   */
  getResourceUtilization(resourceId) {
    const resource = this.resources.get(resourceId);
    if (!resource) return null;

    let allocated = 0;
    for (const alloc of this.allocations.values()) {
      if (alloc.resourceId === resourceId && alloc.isActive()) {
        allocated += alloc.allocatedAmount;
      }
    }

    const utilization = resource.capacity > 0 ? (allocated / resource.capacity) * 100 : 0;

    return {
      resource: resource.toJSON(),
      allocated,
      available: resource.getAvailableCapacity(allocated),
      utilizationPercent: Math.round(utilization)
    };
  }

  /**
   * Create allocation
   */
  createAllocation(config) {
    const resource = this.resources.get(config.resourceId);
    if (!resource) {
      return { success: false, reason: 'Resource not found' };
    }

    // Check capacity
    const utilization = this.getResourceUtilization(config.resourceId);
    if (utilization.available < config.allocatedAmount) {
      return { success: false, reason: 'Insufficient capacity available' };
    }

    const allocation = new ResourceAllocation(config);
    this.allocations.set(allocation.id, allocation);

    // Update resource status
    resource.status = ResourceStatus.ALLOCATED;

    this._updateStats();

    return {
      success: true,
      allocationId: allocation.id,
      allocation: allocation.toJSON()
    };
  }

  /**
   * Create resource request
   */
  createRequest(config) {
    const request = new ResourceRequest(config);
    this.requests.set(request.id, request);
    this._updateStats();
    return {
      success: true,
      requestId: request.id,
      request: request.toJSON()
    };
  }

  /**
   * Approve request
   */
  approveRequest(requestId, approvedBy) {
    const request = this.requests.get(requestId);
    if (!request) {
      return { success: false, reason: 'Request not found' };
    }

    // Find available resource
    const available = this.getAvailableResources(request.resourceType);
    if (available.length === 0) {
      return { success: false, reason: 'No available resources of this type' };
    }

    // Create allocation
    const allocation = this.createAllocation({
      resourceId: available[0].id,
      projectId: request.projectId,
      projectName: request.projectName,
      requestedBy: request.requestedBy,
      allocatedAmount: request.requestedAmount,
      allocatedUnit: request.requestedUnit,
      startDate: request.startDate,
      endDate: request.endDate,
      status: 'approved',
      priority: request.priority
    });

    if (!allocation.success) {
      return allocation;
    }

    // Update request status
    request.status = 'fulfilled';
    request.approvedBy = approvedBy;

    this._updateStats();

    return {
      success: true,
      requestId: request.id,
      allocationId: allocation.allocationId,
      resourceId: available[0].id
    };
  }

  /**
   * Reject request
   */
  rejectRequest(requestId, reason) {
    const request = this.requests.get(requestId);
    if (!request) {
      return { success: false, reason: 'Request not found' };
    }

    request.status = 'rejected';
    request.notes = reason;

    this._updateStats();

    return {
      success: true,
      requestId: request.id,
      reason
    };
  }

  /**
   * Get project allocations
   */
  getProjectAllocations(projectId) {
    const results = [];
    for (const alloc of this.allocations.values()) {
      if (alloc.projectId === projectId) {
        const resource = this.resources.get(alloc.resourceId);
        results.push({
          ...alloc.toJSON(),
          resourceName: resource ? resource.name : 'Unknown'
        });
      }
    }
    return results;
  }

  /**
   * Get resource capacity forecast
   */
  getCapacityForecast(resourceId, startDate, endDate) {
    const resource = this.resources.get(resourceId);
    if (!resource) return null;

    const forecast = [];
    let currentDate = startDate;

    while (currentDate <= endDate) {
      let allocated = 0;

      for (const alloc of this.allocations.values()) {
        if (alloc.resourceId === resourceId &&
            alloc.startDate <= currentDate &&
            (!alloc.endDate || alloc.endDate >= currentDate)) {
          allocated += alloc.allocatedAmount;
        }
      }

      const available = resource.getAvailableCapacity(allocated);
      const utilization = resource.capacity > 0 ? (allocated / resource.capacity) * 100 : 0;

      forecast.push({
        date: currentDate,
        allocated,
        available,
        utilizationPercent: Math.round(utilization)
      });

      currentDate += 7 * 24 * 60 * 60 * 1000; // Weekly
    }

    return forecast;
  }

  /**
   * Get pending requests
   */
  getPendingRequests() {
    const results = [];
    for (const req of this.requests.values()) {
      if (req.status === 'pending') {
        results.push(req);
      }
    }
    return results;
  }

  /**
   * Get stats
   */
  getStats() {
    this._updateStats();
    return {
      ...this.stats,
      resourcesByType: {
        human: this.getResourcesByType(ResourceType.HUMAN).length,
        equipment: this.getResourcesByType(ResourceType.EQUIPMENT).length,
        infrastructure: this.getResourcesByType(ResourceType.INFRASTRUCTURE).length,
        software: this.getResourcesByType(ResourceType.SOFTWARE).length,
        budget: this.getResourcesByType(ResourceType.BUDGET).length
      }
    };
  }
}

/**
 * Demo
 */
async function demo() {
  console.log('=== Agent Resource Demo\n');

  const manager = new ResourceManager();

  // Show resources
  console.log('1. Resources:');
  for (const res of manager.resources.values()) {
    console.log(`   ${res.name} (${res.type})`);
    console.log(`      Capacity: ${res.capacity} ${res.capacityUnit}`);
    console.log(`      Status: ${res.status}`);
  }

  // Show available resources
  console.log('\n2. Available Resources:');
  const available = manager.getAvailableResources();
  for (const res of available) {
    console.log(`   ${res.name} (${res.type})`);
  }

  // Resource utilization
  console.log('\n3. Resource Utilization:');
  const engTeam = Array.from(manager.resources.values())[0];
  const util = manager.getResourceUtilization(engTeam.id);
  console.log(`   ${engTeam.name}:`);
  console.log(`      Allocated: ${util.allocated} ${engTeam.capacityUnit}`);
  console.log(`      Available: ${util.available} ${engTeam.capacityUnit}`);
  console.log(`      Utilization: ${util.utilizationPercent}%`);

  // Project allocations
  console.log('\n4. Project Allocations (proj-001):');
  const projAllocs = manager.getProjectAllocations('proj-001');
  for (const alloc of projAllocs) {
    console.log(`   ${alloc.resourceName}: ${alloc.allocatedAmount} ${alloc.allocatedUnit}`);
  }

  // Create allocation
  console.log('\n5. Creating New Allocation:');
  const storageRes = Array.from(manager.resources.values())[3]; // Cloud Storage
  const newAlloc = manager.createAllocation({
    resourceId: storageRes.id,
    projectId: 'proj-002',
    projectName: 'Mobile App',
    requestedBy: 'user-002',
    allocatedAmount: 200,
    allocatedUnit: 'GB',
    startDate: Date.now(),
    endDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
    status: 'approved',
    priority: 'normal'
  });
  console.log(`   Success: ${newAlloc.success}`);
  if (newAlloc.success) {
    console.log(`   Allocation ID: ${newAlloc.allocationId}`);
  } else {
    console.log(`   Reason: ${newAlloc.reason}`);
  }

  // Create request
  console.log('\n6. Creating Resource Request:');
  const newReq = manager.createRequest({
    resourceType: ResourceType.SOFTWARE,
    projectId: 'proj-003',
    projectName: 'Data Pipeline',
    requestedBy: 'user-003',
    requestedAmount: 5,
    requestedUnit: 'percentage',
    startDate: Date.now() + 30 * 24 * 60 * 60 * 1000,
    endDate: Date.now() + 120 * 24 * 60 * 60 * 1000,
    priority: 'high',
    notes: 'Additional QA license needed'
  });
  console.log(`   Success: ${newReq.success}`);
  console.log(`   Request ID: ${newReq.requestId}`);

  // Approve request
  console.log('\n7. Approving Resource Request:');
  const pendingReq = manager.getPendingRequests()[0];
  if (pendingReq) {
    const approveResult = manager.approveRequest(pendingReq.id, 'manager-001');
    console.log(`   Success: ${approveResult.success}`);
    if (approveResult.success) {
      console.log(`   Allocated to: ${approveResult.resourceId}`);
    }
  }

  // Capacity forecast
  console.log('\n8. Capacity Forecast (Engineering Team, next 8 weeks):');
  const forecast = manager.getCapacityForecast(
    engTeam.id,
    Date.now(),
    Date.now() + 56 * 24 * 60 * 60 * 1000
  );
  for (const f of forecast) {
    console.log(`   ${new Date(f.date).toLocaleDateString()}: ${f.utilizationPercent}% utilized`);
  }

  // Pending requests
  console.log('\n9. Pending Requests:');
  const pending = manager.getPendingRequests();
  console.log(`   Count: ${pending.length}`);
  for (const req of pending) {
    console.log(`   - ${req.projectName}: ${req.requestedAmount} ${req.requestedUnit} (${req.priority})`);
  }

  // Stats
  console.log('\n10. Statistics:');
  const stats = manager.getStats();
  console.log(`    Total Resources: ${stats.totalResources}`);
  console.log(`    Available Resources: ${stats.availableResources}`);
  console.log(`    Total Allocations: ${stats.totalAllocations}`);
  console.log(`    Pending Requests: ${stats.pendingRequests}`);
  console.log(`    Fulfilled Requests: ${stats.fulfilledRequests}`);
  console.log(`    Resources by Type:`);
  for (const [type, count] of Object.entries(stats.resourcesByType)) {
    console.log(`      ${type}: ${count}`);
  }

  console.log('\n=== Demo Complete ===');
}

// CLI
const args = process.argv.slice(2);
const cmd = args[0];

if (cmd === 'demo') {
  demo();
} else if (cmd === 'status') {
  const manager = new ResourceManager();
  console.log(JSON.stringify(manager.getStats(), null, 2));
} else {
  console.log('Agent Resource Module');
  console.log('Usage: node agent-resource.js [command]');
  console.log('Commands:');
  console.log('  demo                Run demo');
  console.log('  status             Show stats');
}
