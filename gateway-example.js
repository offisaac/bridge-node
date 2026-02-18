/**
 * API Gateway Server Example
 * 演示如何使用 API Gateway 中间件
 */

const express = require('express');
const {
  authenticateJWT,
  optionalAuth,
  generateToken,
  rateLimiter,
  ipRateLimiter,
  userRateLimiter,
  authenticateApiKey,
  registerApiKey,
  validateBody,
  RequestRouter,
  LoadBalancer,
  CircuitBreaker,
  config
} = require('./api-gateway');

const app = express();
app.use(express.json());

// ========== Setup API Keys ==========

const apiKey = registerApiKey('test-app', 'test-api-key-123', 1000);
console.log(`Registered API key: ${apiKey}`);

// ========== Routes ==========

// Health check (no auth)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Login (no auth, rate limited)
app.post('/auth/login',
  rateLimiter({ max: 10, windowMs: 60 * 1000 }),
  validateBody({
    username: { required: true, type: 'string', minLength: 3 },
    password: { required: true, type: 'string', minLength: 6 }
  }),
  (req, res) => {
    const { username, password } = req.body;

    // Simplified login (use proper auth in production)
    if (username === 'admin' && password === 'password') {
      const token = generateToken({ id: '1', username: 'admin', role: 'admin' });
      res.json({ token, expiresIn: config.jwtExpiry });
    } else {
      res.status(401).json({ error: 'Invalid credentials' });
    }
  }
);

// Protected route (JWT required)
app.get('/api/users',
  authenticateJWT,
  (req, res) => {
    res.json({ users: [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }] });
  }
);

// API Key protected route
app.get('/api/data',
  authenticateApiKey,
  (req, res) => {
    res.json({ data: 'Protected data', apiKeyName: req.apiKey.name });
  }
);

// IP rate limited route
app.get('/api/public',
  ipRateLimiter,
  (req, res) => {
    res.json({ message: 'Public endpoint with IP rate limiting' });
  }
);

// User rate limited route
app.get('/api/user/dashboard',
  authenticateJWT,
  userRateLimiter,
  (req, res) => {
    res.json({ dashboard: 'User dashboard', user: req.user });
  }
);

// Request validation example
app.post('/api/create',
  authenticateJWT,
  validateBody({
    name: { required: true, type: 'string', minLength: 1, maxLength: 100 },
    email: { required: true, type: 'string', pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
    age: { type: 'number', min: 0, max: 150 }
  }),
  (req, res) => {
    res.json({ success: true, item: req.body });
  }
);

// ========== Load Balancer Example ==========

const lb = new LoadBalancer('round-robin');
lb.addBackend('http://localhost:8001', 2);
lb.addBackend('http://localhost:8002', 1);

app.get('/api/proxy/:service',
  authenticateJWT,
  async (req, res) => {
    const backend = lb.selectBackend();

    if (!backend) {
      return res.status(503).json({ error: 'No healthy backends' });
    }

    lb.recordRequest(backend.url);

    try {
      // In production, proxy to backend
      // const response = await fetch(`${backend.url}${req.path}`);
      res.json({
        proxied: true,
        backend: backend.url,
        path: req.path
      });
    } catch (error) {
      lb.recordRequest(backend.url, false);
      res.status(502).json({ error: 'Backend error' });
    } finally {
      lb.recordResponse(backend.url);
    }
  }
);

// ========== Circuit Breaker Example ==========

const serviceCircuitBreaker = new CircuitBreaker({
  name: 'external-service',
  failureThreshold: 3,
  successThreshold: 2,
  timeout: 30000
});

app.get('/api/external',
  authenticateJWT,
  async (req, res) => {
    try {
      const result = await serviceCircuitBreaker.execute(async () => {
        // Simulate external call
        // const response = await fetch('http://external-api.example.com/data');
        return { data: 'External data' };
      });

      res.json({ success: true, data: result });
    } catch (error) {
      const state = serviceCircuitBreaker.getState();
      res.status(503).json({
        error: 'Service unavailable',
        circuitBreaker: state
      });
    }
  }
);

// ========== Stats Endpoint ==========

app.get('/gateway/stats', (req, res) => {
  res.json({
    loadBalancer: lb.getStats(),
    circuitBreaker: serviceCircuitBreaker.getState()
  });
});

// ========== Start Server ==========

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`API Gateway running on port ${PORT}`);
  console.log(`JWT Secret: ${config.jwtSecret}`);
  console.log(`Test API Key: ${apiKey}`);
  console.log(`Generate test token: node -e "console.log(require('./api-gateway').generateToken({id:1}))"`);
});
