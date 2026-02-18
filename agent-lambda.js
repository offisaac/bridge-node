/**
 * Agent Lambda - AWS Lambda Agent
 *
 * Provides AWS Lambda-specific capabilities.
 *
 * Usage: node agent-lambda.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   create     - Create Lambda function
 *   invoke     - Invoke function
 */

class LambdaFunction {
  constructor(config) {
    this.id = `lambda-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.runtime = config.runtime;
    this.handler = config.handler;
    this.memory = config.memory || 128;
    this.timeout = config.timeout || 30;
    this.role = config.role;
    this.layers = config.layers || [];
    this.environment = config.environment || {};
  }
}

class LambdaInvocation {
  constructor(config) {
    this.id = `inv-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.functionName = config.functionName;
    this.payload = config.payload;
    this.invocationType = config.invocationType || 'RequestResponse';
    this.startTime = Date.now();
    this.statusCode = null;
    this.response = null;
  }

  complete(statusCode, response) {
    this.statusCode = statusCode;
    this.response = response;
    return this;
  }

  duration() {
    return Date.now() - this.startTime;
  }
}

class LambdaLayer {
  constructor(config) {
    this.id = `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.version = config.version;
    this.arn = config.arn;
  }
}

class LambdaAgent {
  constructor(config = {}) {
    this.name = config.name || 'LambdaAgent';
    this.version = config.version || '1.0';
    this.functions = new Map();
    this.invocations = new Map();
    this.layers = new Map();
    this.stats = {
      functionsCreated: 0,
      invocations: 0,
      coldStarts: 0
    };
    this.initDefaults();
  }

  initDefaults() {
    const defaults = [
      new LambdaFunction({ name: 'hello-world', runtime: 'nodejs18.x', handler: 'index.handler', memory: 128, timeout: 30, role: 'lambda-role' }),
      new LambdaFunction({ name: 'image-processor', runtime: 'python3.10', handler: 'processor.handler', memory: 512, timeout: 60, role: 'lambda-role' }),
      new LambdaFunction({ name: 'api-handler', runtime: 'nodejs18.x', handler: 'api.handler', memory: 256, timeout: 30, role: 'lambda-role', environment: { STAGE: 'production' } })
    ];
    defaults.forEach(f => {
      this.functions.set(f.id, f);
      this.stats.functionsCreated++;
    });
  }

  create(name, runtime, handler, memory, timeout, role) {
    const fn = new LambdaFunction({ name, runtime, handler, memory, timeout, role });
    this.functions.set(fn.id, fn);
    this.stats.functionsCreated++;
    return fn;
  }

  invoke(functionId, payload, invocationType = 'RequestResponse') {
    const fn = this.functions.get(functionId);
    if (!fn) return null;

    const invocation = new LambdaInvocation({
      functionName: fn.name,
      payload,
      invocationType
    });
    this.invocations.set(invocation.id, invocation);
    this.stats.invocations++;

    // Simulate cold start
    const isColdStart = Math.random() > 0.7; // 30% cold start
    if (isColdStart) {
      this.stats.coldStarts++;
    }

    // Simulate response
    const success = Math.random() > 0.05;
    const statusCode = success ? 200 : 500;
    const response = success ? { result: 'ok' } : { error: 'Internal error' };

    invocation.complete(statusCode, response);
    return invocation;
  }

  listFunctions() {
    return Array.from(this.functions.values());
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const lambda = new LambdaAgent();

switch (command) {
  case 'demo': {
    console.log('=== Agent Lambda Demo\n');

    // 1. Lambda Functions
    console.log('1. Lambda Functions:');
    const funcs = lambda.listFunctions();
    funcs.forEach(f => {
      console.log(`   ${f.name}: ${f.runtime} (${f.memory}MB, ${f.timeout}s)`);
    });

    // 2. Create Function
    console.log('\n2. Create Lambda Function:');
    const newFn = lambda.create('data-processor', 'nodejs18.x', 'processor.handler', 256, 60, 'lambda-role');
    console.log(`   Created: ${newFn.name} (${newFn.runtime})`);

    // 3. Invoke Functions
    console.log('\n3. Invoke Functions:');
    const inv1 = lambda.invoke(funcs[0].id, { key: 'value' });
    console.log(`   ${inv1.functionName}: ${inv1.statusCode} (${inv1.duration()}ms)`);
    const inv2 = lambda.invoke(newFn.id, { action: 'process' });
    console.log(`   ${inv2.functionName}: ${inv2.statusCode} (${inv2.duration()}ms)`);

    // 4. Runtimes
    console.log('\n4. Supported Runtimes:');
    console.log(`   Node.js: 18.x, 16.x, 14.x`);
    console.log(`   Python: 3.11, 3.10, 3.9`);
    console.log(`   Java: 17, 11`);
    console.log(`   Go: 1.x`);
    console.log(`   .NET: 6, 7`);

    // 5. Configuration
    console.log('\n5. Function Configuration:');
    console.log(`   Memory: 128MB - 10240MB`);
    console.log(`   Timeout: 1s - 900s`);
    console.log(`   Ephemeral storage: 512MB - 10240MB`);

    // 6. Cold Start
    console.log('\n6. Cold Start Optimization:');
    console.log(`   Provisioned concurrency`);
    console.log(`   Snap start (Java)`);
    console.log(`   Lazy loading`);

    // 7. Layers
    console.log('\n7. Lambda Layers:');
    console.log(`   Share common code`);
    console.log(`   Reduce function size`);
    console.log(`   Standardized dependencies`);

    // 8. Event Sources
    console.log('\n8. Event Sources:');
    console.log(`   API Gateway: HTTP`);
    console.log(`   S3: Object triggers`);
    console.log(`   DynamoDB: Stream`);
    console.log(`   SQS: Queue messages`);
    console.log(`   CloudWatch: Scheduled`);

    // 9. VPC
    console.log('\n9. VPC Support:');
    console.log(`   Private subnet access`);
    console.log(`   NAT gateway for internet`);
    console.log(`   VPC endpoints`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = lambda.getStats();
    console.log(`   Functions: ${stats.functionsCreated}`);
    console.log(`   Invocations: ${stats.invocations}`);
    console.log(`   Cold starts: ${stats.coldStarts}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'create': {
    const name = args[1] || 'my-function';
    const runtime = args[2] || 'nodejs18.x';
    const fn = lambda.create(name, runtime, 'index.handler', 128, 30, 'lambda-role');
    console.log(`Created: ${fn.name}`);
    break;
  }

  case 'invoke': {
    const funcs = lambda.listFunctions();
    if (funcs.length > 0) {
      const inv = lambda.invoke(funcs[0].id, {});
      console.log(`${inv.functionName}: ${inv.statusCode}`);
    }
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-lambda.js [demo|create|invoke]');
  }
}
