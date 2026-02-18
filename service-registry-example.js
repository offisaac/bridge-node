/**
 * Service Registry Example
 * 服务注册与发现示例
 */

const { ServiceRegistry, ServiceClient, ServiceStatus } = require('./service-registry');

// ========== Registry Example ==========

function startRegistry() {
  console.log('=== Service Registry Example ===\n');

  const registry = new ServiceRegistry({
    heartbeatInterval: 5000,
    instanceTimeout: 15000
  });

  // Register services
  console.log('1. Registering services:');

  // API Service
  const api1 = registry.register('api-gateway', 'localhost', 3000, {
    version: '1.0.0',
    metadata: { region: 'us-east', env: 'prod' }
  });
  console.log(`   API Gateway: ${api1.url}`);

  const api2 = registry.register('api-gateway', 'localhost', 3001, {
    version: '1.0.0',
    metadata: { region: 'us-east', env: 'prod' }
  });
  console.log(`   API Gateway: ${api2.url}`);

  // Auth Service
  const auth = registry.register('auth-service', 'localhost', 4000, {
    version: '1.0.0',
    metadata: { region: 'us-east', env: 'prod' }
  });
  console.log(`   Auth Service: ${auth.url}`);

  // User Service
  const user = registry.register('user-service', 'localhost', 5000, {
    version: '1.0.0',
    metadata: { region: 'us-west', env: 'prod' }
  });
  console.log(`   User Service: ${user.url}`);

  // List services
  console.log('\n2. List services:');
  const services = registry.listServices();
  services.forEach(s => {
    console.log(`   ${s.name}: ${s.healthyCount}/${s.instanceCount} healthy`);
  });

  // Discovery
  console.log('\n3. Discovery:');
  const apiInstances = registry.getHealthyInstances('api-gateway');
  console.log(`   API Gateway instances: ${apiInstances.length}`);

  const authInstance = registry.selectInstance('auth-service');
  console.log(`   Selected auth: ${authInstance?.url}`);

  // Heartbeat
  console.log('\n4. Heartbeat:');
  registry.heartbeat('api-gateway', api1.instanceId);
  console.log(`   Heartbeat from ${api1.instanceId}`);

  // Set metadata
  console.log('\n5. Service metadata:');
  registry.setServiceMetadata('api-gateway', { owner: 'team-backend' });
  const metadata = registry.getServiceMetadata('api-gateway');
  console.log(`   API Gateway metadata:`, metadata);

  // Events
  registry.on('unhealthy', (data) => {
    console.log('\n   [Event] Unhealthy:', data);
  });

  registry.on('registered', (data) => {
    console.log('\n   [Event] Registered:', data.serviceName);
  });

  // Simulate service call
  console.log('\n6. Simulated service call:');
  const client = new ServiceClient(registry);
  const call = client.callService('auth-service', '/api/health');
  console.log(`   Would call: ${call.url}`);

  // Cleanup after 10 seconds
  setTimeout(() => {
    console.log('\n7. Cleanup:');
    registry.deregister('api-gateway', api1.instanceId);
    console.log(`   Deregistered ${api1.instanceId}`);

    const remaining = registry.getHealthyInstances('api-gateway');
    console.log(`   Remaining API instances: ${remaining.length}`);

    registry.close();
    console.log('\nRegistry closed');
    process.exit(0);
  }, 5000);

  return registry;
}

// ========== Run ==========

startRegistry();
