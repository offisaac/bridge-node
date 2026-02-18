/**
 * Health Check Express Example - 健康检查Express集成示例
 */

const express = require('express');
const {
  HealthCheckService,
  createDatabaseChecker,
  createCacheChecker,
  createExternalChecker,
  createCustomChecker
} = require('./health-check');

// Create health check service
const healthService = new HealthCheckService({
  name: 'bridge-node',
  version: '1.0.0'
});

// Register custom checkers
healthService.register(createDatabaseChecker('postgres', null));
healthService.register(createCacheChecker('redis', null));
healthService.register(createExternalChecker('api-gateway', 'http://localhost:8080'));

// Register custom checker
healthService.register(createCustomChecker('auth-service', async () => {
  // Custom logic to check auth service
  return { status: 'healthy', message: 'Auth service OK' };
}));

// Create Express app
const app = express();

// Register health check endpoints
app.use('/health', healthService.middleware({ detailed: true }));
app.use('/health/live', healthService.livenessProbe());
app.use('/health/ready', healthService.readinessProbe());

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Health check server running on port ${PORT}`);
  console.log('Endpoints:');
  console.log('  /health        - Detailed health check');
  console.log('  /health/live   - Liveness probe');
  console.log('  /health/ready  - Readiness probe');
});

module.exports = app;
