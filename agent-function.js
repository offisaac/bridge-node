/**
 * Agent Function - Function Management Agent
 *
 * Provides generic function management capabilities.
 *
 * Usage: node agent-function.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   create     - Create function
 *   execute    - Execute function
 */

class FunctionDef {
  constructor(config) {
    this.id = `fn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.code = config.code;
    this.language = config.language; // javascript, python, go
    this.inputs = config.inputs || [];
    this.outputs = config.outputs || [];
  }
}

class FunctionExecution {
  constructor(config) {
    this.id = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.function = config.function;
    this.input = config.input;
    this.startTime = Date.now();
    this.endTime = null;
    this.result = null;
  }

  complete(result) {
    this.endTime = Date.now();
    this.result = result;
  }

  duration() {
    return this.endTime ? this.endTime - this.startTime : Date.now() - this.startTime;
  }
}

class FunctionAgent {
  constructor(config = {}) {
    this.name = config.name || 'FunctionAgent';
    this.version = config.version || '1.0';
    this.functions = new Map();
    this.executions = new Map();
    this.stats = {
      functionsCreated: 0,
      executions: 0,
      successRate: 100
    };
    this.initDefaults();
  }

  initDefaults() {
    const defaults = [
      new FunctionDef({ name: 'add', code: 'return a + b', language: 'javascript', inputs: ['a', 'b'], outputs: ['result'] }),
      new FunctionDef({ name: 'multiply', code: 'return a * b', language: 'javascript', inputs: ['a', 'b'], outputs: ['result'] }),
      new FunctionDef({ name: 'uppercase', code: 'return str.toUpperCase()', language: 'javascript', inputs: ['str'], outputs: ['result'] })
    ];
    defaults.forEach(f => {
      this.functions.set(f.id, f);
      this.stats.functionsCreated++;
    });
  }

  create(name, code, language, inputs, outputs) {
    const fn = new FunctionDef({ name, code, language, inputs, outputs });
    this.functions.set(fn.id, fn);
    this.stats.functionsCreated++;
    return fn;
  }

  execute(functionId, input) {
    const fn = this.functions.get(functionId);
    if (!fn) return null;

    const exec = new FunctionExecution({ function: fn, input });
    this.executions.set(exec.id, exec);
    this.stats.executions++;

    // Simulate execution
    let result;
    try {
      // Simple simulation
      result = { success: true, output: 'executed' };
    } catch (e) {
      result = { success: false, error: e.message };
    }

    exec.complete(result);
    return exec;
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

const agent = new FunctionAgent();

switch (command) {
  case 'demo': {
    console.log('=== Agent Function Demo\n');

    // 1. Functions
    console.log('1. Functions:');
    const funcs = agent.listFunctions();
    funcs.forEach(f => {
      console.log(`   ${f.name}: ${f.language} (${f.inputs.join(', ')})`);
    });

    // 2. Create Function
    console.log('\n2. Create Function:');
    const newFn = agent.create('reverse', 'return str.split("").reverse().join("")', 'javascript', ['str'], ['result']);
    console.log(`   Created: ${newFn.name}`);

    // 3. Execute Functions
    console.log('\n3. Execute Functions:');
    const exec1 = agent.execute(funcs[0].id, { a: 5, b: 3 });
    console.log(`   ${exec1.function.name}: ${exec1.result.success ? 'success' : 'failed'} (${exec1.duration()}ms)`);
    const exec2 = agent.execute(newFn.id, { str: 'hello' });
    console.log(`   ${exec2.function.name}: ${exec2.result.success ? 'success' : 'failed'} (${exec2.duration()}ms)`);

    // 4. Function Types
    console.log('\n4. Function Types:');
    console.log(`   Pure functions: No side effects`);
    console.log(`   Async functions: Promise-based`);
    console.log(`   Generator: Yield-based`);

    // 5. Parameters
    console.log('\n5. Parameters:');
    console.log(`   Required: Must be provided`);
    console.log(`   Optional: Default values`);
    console.log(`   Variadic: Rest parameters`);

    // 6. Return Values
    console.log('\n6. Return Values:');
    console.log(`   Single value: Simple return`);
    console.log(`   Multiple: Array or object`);
    console.log(`   Promise: Async result`);

    // 7. Composition
    console.log('\n7. Function Composition:');
    console.log(`   Chaining: func1().then(func2)`);
    console.log(`   Piping: pipe(fn1, fn2)(data)`);
    console.log(`   Currying: add(1)(2)`);

    // 8. Closure
    console.log('\n8. Closures:');
    console.log(`   State: Preserve between calls`);
    console.log(`   Privacy: Private variables`);
    console.log(`   Factory: Create functions`);

    // 9. Higher-Order
    console.log('\n9. Higher-Order Functions:');
    console.log(`   Map: Transform array`);
    console.log(`   Filter: Select elements`);
    console.log(`   Reduce: Aggregate values`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = agent.getStats();
    console.log(`   Functions: ${stats.functionsCreated}`);
    console.log(`   Executions: ${stats.executions}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'create': {
    const name = args[1] || 'new-function';
    const lang = args[2] || 'javascript';
    const code = args[3] || 'return input';
    const fn = agent.create(name, code, lang, ['input'], ['output']);
    console.log(`Created: ${fn.name}`);
    break;
  }

  case 'execute': {
    const funcs = agent.listFunctions();
    if (funcs.length > 0) {
      const exec = agent.execute(funcs[0].id, {});
      console.log(`${exec.function.name}: ${JSON.stringify(exec.result)}`);
    }
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-function.js [demo|create|execute]');
  }
}
