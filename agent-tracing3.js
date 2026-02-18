/**
 * Agent Tracing3 - Distributed Tracing Agent
 *
 * Provides distributed tracing with spans, traces, and analysis.
 *
 * Usage: node agent-tracing3.js [command]
 * Commands:
 *   demo       - Run demonstration
 *   trace      - Create test trace
 *   analyze    - Analyze traces
 */

class TraceSpan {
  constructor(config) {
    this.id = `span-${Math.random().toString(36).substr(2, 9)}`;
    this.traceId = config.traceId;
    this.parentId = config.parentId;
    this.name = config.name;
    this.service = config.service;
    this.startTime = Date.now();
    this.endTime = null;
    this.tags = config.tags || {};
    this.status = 'ok';
  }

  finish() {
    this.endTime = Date.now();
  }

  duration() {
    if (!this.endTime) return Date.now() - this.startTime;
    return this.endTime - this.startTime;
  }

  setTag(key, value) {
    this.tags[key] = value;
  }

  setError(error) {
    this.status = 'error';
    this.tags.error = error;
  }
}

class Trace {
  constructor(config) {
    this.id = `trace-${Math.random().toString(36).substr(2, 9)}`;
    this.name = config.name;
    this.spans = [];
    this.startTime = Date.now();
    this.endTime = null;
  }

  addSpan(span) {
    this.spans.push(span);
  }

  finish() {
    this.endTime = Date.now();
    this.spans.forEach(s => {
      if (!s.endTime) s.finish();
    });
  }

  duration() {
    if (!this.endTime) return Date.now() - this.startTime;
    return this.endTime - this.startTime;
  }

  getSpanCount() {
    return this.spans.length;
  }
}

class ServiceMap {
  constructor() {
    this.services = new Map();
    this.edges = [];
  }

  addService(name) {
    if (!this.services.has(name)) {
      this.services.set(name, { name, spanCount: 0, avgDuration: 0 });
    }
  }

  addEdge(from, to) {
    this.edges.push({ from, to });
    this.addService(from);
    this.addService(to);
  }

  getServices() {
    return Array.from(this.services.values());
  }
}

class Tracing3Agent {
  constructor(config = {}) {
    this.name = config.name || 'Tracing3Agent';
    this.version = config.version || '3.0';
    this.traces = new Map();
    this.serviceMap = new ServiceMap();
    this.stats = {
      tracesCreated: 0,
      spansCreated: 0,
      tracesAnalyzed: 0
    };
  }

  startTrace(name) {
    const trace = new Trace({ name });
    this.traces.set(trace.id, trace);
    this.stats.tracesCreated++;
    return trace;
  }

  startSpan(traceId, name, service, parentId = null) {
    const span = new TraceSpan({
      traceId,
      parentId,
      name,
      service
    });
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.addSpan(span);
    }
    this.stats.spansCreated++;
    this.serviceMap.addService(service);
    return span;
  }

  finishSpan(span) {
    span.finish();
  }

  finishTrace(traceId) {
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.finish();
      // Build service map
      trace.spans.forEach((span, idx) => {
        if (idx > 0) {
          this.serviceMap.addEdge(trace.spans[idx - 1].service, span.service);
        }
      });
    }
    return trace;
  }

  getTrace(traceId) {
    return this.traces.get(traceId);
  }

  analyzeTrace(traceId) {
    this.stats.tracesAnalyzed++;
    const trace = this.traces.get(traceId);
    if (!trace) return null;

    const spans = trace.spans;
    const durations = spans.map(s => s.duration());

    return {
      traceId: trace.id,
      name: trace.name,
      duration: trace.duration(),
      spanCount: spans.length,
      services: [...new Set(spans.map(s => s.service))],
      slowestSpan: spans.reduce((a, b) => a.duration() > b.duration() ? a : b),
      errorCount: spans.filter(s => s.status === 'error').length,
      percentiles: this.calculatePercentiles(durations)
    };
  }

  calculatePercentiles(values) {
    if (values.length === 0) return {};
    const sorted = [...values].sort((a, b) => a - b);
    return {
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  getStats() {
    return { ...this.stats };
  }
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || 'demo';

const tracing = new Tracing3Agent();

switch (command) {
  case 'demo': {
    console.log('=== Agent Tracing3 Demo\n');

    // 1. Create Trace
    console.log('1. Create Trace:');
    const trace = tracing.startTrace('API Request');
    console.log(`   Trace ID: ${trace.id}`);

    // 2. Create Spans
    console.log('\n2. Create Spans:');
    const span1 = tracing.startSpan(trace.id, 'handle_request', 'api-gateway');
    console.log(`   Span: handle_request (api-gateway)`);

    const span2 = tracing.startSpan(trace.id, 'authenticate', 'auth-service', span1.id);
    console.log(`   Span: authenticate (auth-service)`);

    tracing.finishSpan(span2);
    console.log(`   Finished: authenticate (${span2.duration()}ms)`);

    const span3 = tracing.startSpan(trace.id, 'query_database', 'database', span1.id);
    console.log(`   Span: query_database (database)`);

    tracing.finishSpan(span3);
    console.log(`   Finished: query_database (${span3.duration()}ms)`);

    const span4 = tracing.startSpan(trace.id, 'format_response', 'api-gateway', span1.id);
    console.log(`   Span: format_response (api-gateway)`);

    tracing.finishSpan(span4);
    tracing.finishSpan(span1);

    // 3. Finish Trace
    console.log('\n3. Finish Trace:');
    tracing.finishTrace(trace.id);
    console.log(`   Total duration: ${trace.duration()}ms`);
    console.log(`   Spans: ${trace.getSpanCount()}`);

    // 4. Analyze Trace
    console.log('\n4. Analyze Trace:');
    const analysis = tracing.analyzeTrace(trace.id);
    console.log(`   Duration: ${analysis.duration}ms`);
    console.log(`   Span count: ${analysis.spanCount}`);
    console.log(`   Services: ${analysis.services.join(', ')}`);
    console.log(`   Slowest: ${analysis.slowestSpan.name} (${analysis.slowestSpan.duration()}ms)`);
    console.log(`   Errors: ${analysis.errorCount}`);
    console.log(`   Percentiles: p50=${analysis.percentiles.p50}ms, p95=${analysis.percentiles.p95}ms`);

    // 5. Service Map
    console.log('\n5. Service Map:');
    const services = tracing.serviceMap.getServices();
    services.forEach(s => {
      console.log(`   ${s.name}`);
    });
    console.log(`   Edges: ${tracing.serviceMap.edges.length}`);

    // 6. Distributed Tracing
    console.log('\n6. Distributed Tracing:');
    console.log(`   Cross-service request tracing`);
    console.log(`   Context propagation (Trace ID, Span ID)`);
    console.log(`   Asynchronous processing`);

    // 7. Trace Context
    console.log('\n7. Trace Context:');
    console.log(`   HTTP headers: X-Trace-ID, X-Span-ID`);
    console.log(`   Message headers: trace_id, span_id`);
    console.log(`   Binary format: W3C Trace Context`);

    // 8. Additional Traces
    console.log('\n8. Additional Traces:');
    const trace2 = tracing.startTrace('Background Job');
    const s1 = tracing.startSpan(trace2.id, 'process_queue', 'worker');
    const s2 = tracing.startSpan(trace2.id, 'fetch_data', 'worker', s1.id);
    tracing.finishSpan(s2);
    tracing.finishSpan(s1);
    tracing.finishTrace(trace2);
    console.log(`   Created: ${trace2.name} (${trace2.duration()}ms)`);

    // 9. Sampling
    console.log('\n9. Sampling Strategies:');
    console.log(`   Probabilistic: 1% - 100%`);
    console.log(`   Rate limiting: N traces/second`);
    console.log(`   Priority: error traces always sampled`);

    // 10. Statistics
    console.log('\n10. Statistics:');
    const stats = tracing.getStats();
    console.log(`   Traces created: ${stats.tracesCreated}`);
    console.log(`   Spans created: ${stats.spansCreated}`);
    console.log(`   Traces analyzed: ${stats.tracesAnalyzed}`);

    console.log('\n=== Demo Complete ===');
    break;
  }

  case 'trace': {
    const traceName = args[1] || 'test-trace';
    const trace = tracing.startTrace(traceName);
    const span = tracing.startSpan(trace.id, 'test-span', 'test-service');
    tracing.finishSpan(span);
    tracing.finishTrace(trace.id);
    console.log(`Created trace: ${trace.id} (${trace.duration()}ms)`);
    break;
  }

  case 'analyze': {
    const traceId = args[1];
    if (traceId) {
      const analysis = tracing.analyzeTrace(traceId);
      console.log(JSON.stringify(analysis, null, 2));
    } else {
      console.log('Usage: node agent-tracing3.js analyze <trace-id>');
    }
    break;
  }

  default: {
    console.log(`Unknown command: ${command}`);
    console.log('Usage: node agent-tracing3.js [demo|trace|analyze]');
  }
}
