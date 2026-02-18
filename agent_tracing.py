"""Agent Tracing Module

Distributed tracing utilities for agent services including trace context management,
span operations, trace sampling, and integration with distributed tracing systems.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
import json


class TraceStatus(str, Enum):
    """Trace status."""
    OK = "ok"
    ERROR = "error"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"


class TraceLevel(str, Enum):
    """Trace detail level."""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class SamplingStrategy(str, Enum):
    """Sampling strategy."""
    ALWAYS = "always"
    NEVER = "never"
    PROBABILISTIC = "probabilistic"
    RATE_LIMITED = "rate_limited"


@dataclass
class SpanContext:
    """Span context for distributed tracing."""
    trace_id: str
    span_id: str
    parent_id: Optional[str] = None
    sampled: bool = True
    baggage: Dict[str, str] = field(default_factory=dict)


@dataclass
class Span:
    """Represents a single operation in a trace."""
    name: str
    span_id: str
    trace_id: str
    parent_id: Optional[str] = None
    start_time: float = field(default_factory=time.time)
    end_time: Optional[float] = None
    status: TraceStatus = TraceStatus.OK
    level: TraceLevel = TraceLevel.INFO
    tags: Dict[str, Any] = field(default_factory=dict)
    logs: List[Dict] = field(default_factory=list)
    metrics: Dict[str, float] = field(default_factory=dict)

    def add_tag(self, key: str, value: Any):
        """Add a tag to the span."""
        self.tags[key] = value

    def add_log(self, message: str, level: TraceLevel = TraceLevel.INFO, **kwargs):
        """Add a log event to the span."""
        self.logs.append({
            "timestamp": time.time(),
            "message": message,
            "level": level.value,
            **kwargs
        })

    def set_metric(self, key: str, value: float):
        """Set a metric value."""
        self.metrics[key] = value

    def finish(self, status: TraceStatus = TraceStatus.OK):
        """Finish the span."""
        self.end_time = time.time()
        self.status = status

    def duration_ms(self) -> float:
        """Get duration in milliseconds."""
        if self.end_time:
            return (self.end_time - self.start_time) * 1000
        return (time.time() - self.start_time) * 1000


@dataclass
class Trace:
    """Represents a complete trace."""
    trace_id: str
    spans: List[Span] = field(default_factory=list)
    start_time: float = field(default_factory=time.time)
    end_time: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def add_span(self, span: Span):
        """Add a span to the trace."""
        self.spans.append(span)

    def finish(self):
        """Finish the trace."""
        self.end_time = time.time()
        if self.spans:
            # Set end time to the latest span end time
            span_ends = [s.end_time for s in self.spans if s.end_time]
            if span_ends:
                self.end_time = max(span_ends)

    def duration_ms(self) -> float:
        """Get total duration in milliseconds."""
        if self.end_time:
            return (self.end_time - self.start_time) * 1000
        if self.spans:
            return max(s.duration_ms() for s in self.spans)
        return 0

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "trace_id": self.trace_id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "duration_ms": self.duration_ms(),
            "span_count": len(self.spans),
            "metadata": self.metadata,
            "spans": [
                {
                    "name": s.name,
                    "span_id": s.span_id,
                    "trace_id": s.trace_id,
                    "parent_id": s.parent_id,
                    "start_time": s.start_time,
                    "end_time": s.end_time,
                    "duration_ms": s.duration_ms(),
                    "status": s.status.value,
                    "level": s.level.value,
                    "tags": s.tags,
                    "logs": s.logs,
                    "metrics": s.metrics
                }
                for s in self.spans
            ]
        }


@dataclass
class SamplingConfig:
    """Sampling configuration."""
    strategy: SamplingStrategy = SamplingStrategy.PROBABILISTIC
    probability: float = 0.1
    rate_limit: int = 100  # traces per second
    min_duration_ms: float = 0  # always sample traces longer than this


@dataclass
class TracingStats:
    """Tracing statistics."""
    total_traces: int = 0
    sampled_traces: int = 0
    dropped_traces: int = 0
    total_spans: int = 0
    active_traces: int = 0
    error_traces: int = 0
    avg_trace_duration_ms: float = 0


class AgentTracing:
    """Distributed tracing utility for agents."""

    def __init__(self, config: SamplingConfig = None):
        self._config = config or SamplingConfig()
        self._lock = threading.RLock()
        self._traces: Dict[str, Trace] = {}
        self._active_spans: Dict[str, Span] = {}
        self._stats = TracingStats()
        self._sampled_ids: set = set()
        self._rate_limit_counter = 0
        self._rate_limit_reset_time = time.time()
        self._hooks: List[Callable] = []

    def configure(self, config: SamplingConfig):
        """Update configuration."""
        with self._lock:
            self._config = config

    def _should_sample(self, trace_id: str) -> bool:
        """Determine if a trace should be sampled."""
        with self._lock:
            if self._config.strategy == SamplingStrategy.ALWAYS:
                return True
            elif self._config.strategy == SamplingStrategy.NEVER:
                return False
            elif self._config.strategy == SamplingStrategy.PROBABILISTIC:
                # Simple hash-based sampling for consistency
                hash_val = int(trace_id[:8], 16) % 1000
                return hash_val < (self._config.probability * 1000)
            elif self._config.strategy == SamplingStrategy.RATE_LIMITED:
                self._rate_limit_counter += 1
                now = time.time()
                if now - self._rate_limit_reset_time >= 1.0:
                    self._rate_limit_counter = 0
                    self._rate_limit_reset_time = now
                return self._rate_limit_counter <= self._config.rate_limit
            return True

    def start_trace(
        self,
        name: str,
        trace_id: str = None,
        parent_id: str = None,
        metadata: Dict[str, Any] = None
    ) -> Optional[Trace]:
        """Start a new trace."""
        trace_id = trace_id or str(uuid.uuid4()).replace("-", "")
        sampled = self._should_sample(trace_id)

        with self._lock:
            if not sampled:
                self._stats.dropped_traces += 1
                return None

            trace = Trace(trace_id=trace_id, metadata=metadata or {})
            self._traces[trace_id] = trace
            self._stats.total_traces += 1
            self._stats.sampled_traces += 1
            self._stats.active_traces += 1

            # Create root span
            span = self.start_span(
                name=name,
                trace_id=trace_id,
                parent_id=parent_id
            )

            return trace

    def start_span(
        self,
        name: str,
        trace_id: str = None,
        parent_id: str = None,
        tags: Dict[str, Any] = None
    ) -> Optional[Span]:
        """Start a new span."""
        with self._lock:
            if trace_id and trace_id not in self._traces:
                # Trace was dropped by sampling
                return None

            span_id = str(uuid.uuid4()).replace("-", "")[:16]
            trace_id = trace_id or str(uuid.uuid4()).replace("-", "")

            span = Span(
                name=name,
                span_id=span_id,
                trace_id=trace_id,
                parent_id=parent_id,
                tags=tags or {}
            )

            self._active_spans[span_id] = span

            if trace_id in self._traces:
                self._traces[trace_id].add_span(span)

            self._stats.total_spans += 1

            return span

    def finish_span(
        self,
        span_id: str,
        status: TraceStatus = TraceStatus.OK,
        tags: Dict[str, Any] = None
    ) -> Optional[Span]:
        """Finish a span."""
        with self._lock:
            if span_id not in self._active_spans:
                return None

            span = self._active_spans.pop(span_id)
            span.finish(status)

            if tags:
                span.tags.update(tags)

            # Calculate duration metric
            span.set_metric("duration_ms", span.duration_ms())

            # Check if trace is complete
            if span.parent_id is None:
                # Root span finished, finish trace
                trace_id = span.trace_id
                if trace_id in self._traces:
                    self._traces[trace_id].finish()
                    self._stats.active_traces -= 1
                    if status == TraceStatus.ERROR:
                        self._stats.error_traces += 1

                    # Update average duration
                    trace = self._traces[trace_id]
                    if self._stats.sampled_traces > 1:
                        self._stats.avg_trace_duration_ms = (
                            (self._stats.avg_trace_duration_ms * (self._stats.sampled_traces - 1) +
                             trace.duration_ms()) / self._stats.sampled_traces
                        )

                    # Execute hooks
                    for hook in self._hooks:
                        try:
                            hook(trace)
                        except Exception:
                            pass

            return span

    def inject_context(self, trace_id: str, span_id: str) -> Dict[str, str]:
        """Inject trace context into carrier for propagation."""
        return {
            "trace_id": trace_id,
            "span_id": span_id,
            "sampled": "1"
        }

    def extract_context(self, carrier: Dict[str, str]) -> Optional[SpanContext]:
        """Extract trace context from carrier."""
        trace_id = carrier.get("trace_id")
        span_id = carrier.get("span_id")
        if not trace_id:
            return None

        return SpanContext(
            trace_id=trace_id,
            span_id=span_id or str(uuid.uuid4()).replace("-", "")[:16],
            parent_id=span_id,
            sampled=carrier.get("sampled", "1") == "1"
        )

    def get_trace(self, trace_id: str) -> Optional[Trace]:
        """Get a trace by ID."""
        with self._lock:
            return self._traces.get(trace_id)

    def get_active_traces(self) -> List[Trace]:
        """Get all active traces."""
        with self._lock:
            return [t for t in self._traces.values() if t.end_time is None]

    def get_completed_traces(
        self,
        limit: int = 100,
        offset: int = 0
    ) -> List[Trace]:
        """Get completed traces."""
        with self._lock:
            completed = [t for t in self._traces.values() if t.end_time is not None]
            completed.sort(key=lambda t: t.end_time, reverse=True)
            return completed[offset:offset + limit]

    def register_hook(self, hook: Callable[[Trace], None]):
        """Register a callback hook for completed traces."""
        with self._lock:
            self._hooks.append(hook)

    def clear_traces(self, older_than_seconds: float = None):
        """Clear old traces from memory."""
        with self._lock:
            now = time.time()
            if older_than_seconds is None:
                self._traces.clear()
                self._stats = TracingStats()
            else:
                to_remove = []
                for trace_id, trace in self._traces.items():
                    if trace.end_time and (now - trace.end_time) > older_than_seconds:
                        to_remove.append(trace_id)
                for trace_id in to_remove:
                    del self._traces[trace_id]

    def get_stats(self) -> Dict:
        """Get tracing statistics."""
        with self._lock:
            return {
                "total_traces": self._stats.total_traces,
                "sampled_traces": self._stats.sampled_traces,
                "dropped_traces": self._stats.dropped_traces,
                "total_spans": self._stats.total_spans,
                "active_traces": self._stats.active_traces,
                "error_traces": self._stats.error_traces,
                "avg_trace_duration_ms": round(self._stats.avg_trace_duration_ms, 2),
                "sampling_strategy": self._config.strategy.value,
                "sampling_probability": self._config.probability,
                "active_spans": len(self._active_spans)
            }

    def export_json(self, trace_id: str) -> Optional[str]:
        """Export trace as JSON."""
        trace = self.get_trace(trace_id)
        if trace:
            return json.dumps(trace.to_dict(), indent=2)
        return None

    def get_trace_summary(self, limit: int = 50) -> List[Dict]:
        """Get trace summaries."""
        with self._lock:
            traces = list(self._traces.values())
            traces.sort(key=lambda t: t.start_time, reverse=True)
            summaries = []
            for trace in traces[:limit]:
                summaries.append({
                    "trace_id": trace.trace_id,
                    "start_time": trace.start_time,
                    "end_time": trace.end_time,
                    "duration_ms": trace.duration_ms(),
                    "span_count": len(trace.spans),
                    "status": "complete" if trace.end_time else "active"
                })
            return summaries


# Global tracing instance
agent_tracing = AgentTracing()
