"""Tracing UI Module

Distributed tracing visualization UI.
"""
import threading
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid


class SpanKind(str, Enum):
    """Span kind."""
    SERVER = "server"
    CLIENT = "client"
    INTERNAL = "internal"


class SpanStatus(str, Enum):
    """Span status."""
    OK = "ok"
    ERROR = "error"


@dataclass
class Span:
    """Trace span."""
    id: str
    trace_id: str
    parent_id: str
    operation_name: str
    service_name: str
    kind: SpanKind
    start_time: str
    end_time: Optional[str] = None
    duration_ms: int = 0
    status: SpanStatus = SpanStatus.OK
    tags: Dict = field(default_factory=dict)
    logs: List[Dict] = field(default_factory=list)


@dataclass
class Trace:
    """Distributed trace."""
    trace_id: str
    spans: List[Span]
    start_time: str
    end_time: Optional[str] = None
    duration_ms: int = 0


class TracingUI:
    """Distributed tracing visualization."""

    def __init__(self, max_traces: int = 10000):
        self.max_traces = max_traces
        self._lock = threading.RLock()
        self._traces: Dict[str, Trace] = {}
        self._spans: Dict[str, List[Span]] = {}

    def start_span(
        self,
        trace_id: str,
        parent_id: str,
        operation_name: str,
        service_name: str,
        kind: SpanKind = SpanKind.INTERNAL,
        tags: Dict = None
    ) -> str:
        """Start a span."""
        span_id = str(uuid.uuid4())[:8]

        span = Span(
            id=span_id,
            trace_id=trace_id,
            parent_id=parent_id,
            operation_name=operation_name,
            service_name=service_name,
            kind=kind,
            start_time=datetime.now().isoformat(),
            tags=tags or {}
        )

        with self._lock:
            if trace_id not in self._spans:
                self._spans[trace_id] = []
            self._spans[trace_id].append(span)

        return span_id

    def end_span(
        self,
        trace_id: str,
        span_id: str,
        status: SpanStatus = SpanStatus.OK,
        logs: List[Dict] = None
    ):
        """End a span."""
        with self._lock:
            spans = self._spans.get(trace_id, [])
            span = next((s for s in spans if s.id == span_id), None)

            if span:
                span.end_time = datetime.now().isoformat()
                span.status = status
                span.logs = logs or []

                # Calculate duration
                start = datetime.fromisoformat(span.start_time)
                end = datetime.fromisoformat(span.end_time)
                span.duration_ms = int((end - start).total_seconds() * 1000)

                # Update trace
                if trace_id not in self._traces:
                    self._traces[trace_id] = Trace(
                        trace_id=trace_id,
                        spans=spans,
                        start_time=span.start_time
                    )
                self._traces[trace_id].end_time = span.end_time
                self._traces[trace_id].duration_ms = sum(s.duration_ms for s in spans)

    def get_trace(self, trace_id: str) -> Optional[Dict]:
        """Get trace by ID."""
        with self._lock:
            trace = self._traces.get(trace_id)
            if not trace:
                return None

            return {
                "trace_id": trace.trace_id,
                "duration_ms": trace.duration_ms,
                "start_time": trace.start_time,
                "end_time": trace.end_time,
                "spans": [
                    {
                        "id": s.id,
                        "parent_id": s.parent_id,
                        "operation_name": s.operation_name,
                        "service_name": s.service_name,
                        "kind": s.kind.value,
                        "start_time": s.start_time,
                        "end_time": s.end_time,
                        "duration_ms": s.duration_ms,
                        "status": s.status.value,
                        "tags": s.tags,
                        "logs": s.logs
                    }
                    for s in trace.spans
                ]
            }

    def get_traces(
        self,
        service_name: str = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get traces with filters."""
        with self._lock:
            traces = list(self._traces.values())

        if service_name:
            traces = [
                t for t in traces
                if any(s.service_name == service_name for s in t.spans)
            ]

        traces = sorted(traces, key=lambda x: x.start_time, reverse=True)

        return [
            {
                "trace_id": t.trace_id,
                "duration_ms": t.duration_ms,
                "span_count": len(t.spans),
                "start_time": t.start_time,
                "services": list(set(s.service_name for s in t.spans))
            }
            for t in traces[:limit]
        ]

    def get_services(self) -> List[Dict]:
        """Get all services with spans."""
        with self._lock:
            services = {}
            for trace in self._traces.values():
                for span in trace.spans:
                    if span.service_name not in services:
                        services[span.service_name] = {"spans": 0, "traces": set()}
                    services[span.service_name]["spans"] += 1
                    services[span.service_name]["traces"].add(trace.trace_id)

            return [
                {
                    "name": name,
                    "spans": data["spans"],
                    "traces": len(data["traces"])
                }
                for name, data in services.items()
            ]

    def get_stats(self) -> Dict:
        """Get tracing statistics."""
        with self._lock:
            total_traces = len(self._traces)
            total_spans = sum(len(spans) for spans in self._spans.values())

            by_service = {}
            by_status = {"ok": 0, "error": 0}

            for spans in self._spans.values():
                for span in spans:
                    by_service[span.service_name] = by_service.get(span.service_name, 0) + 1
                    status_key = span.status.value
                    by_status[status_key] = by_status.get(status_key, 0) + 1

            return {
                "total_traces": total_traces,
                "total_spans": total_spans,
                "by_service": by_service,
                "by_status": by_status
            }

    def generate_html_dashboard(self) -> str:
        """Generate HTML tracing dashboard."""
        stats = self.get_stats()
        traces = self.get_traces(limit=20)

        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Tracing UI</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }}
        h1 {{ color: #333; }}
        .stats {{ display: flex; gap: 20px; margin-bottom: 20px; }}
        .stat-card {{ background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }}
        .stat-card h3 {{ margin: 0 0 10px 0; color: #666; font-size: 14px; }}
        .stat-card .value {{ font-size: 36px; font-weight: bold; }}
        table {{ width: 100%; border-collapse: collapse; background: white; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
        th {{ background: #f8f8f8; }}
        .trace-id {{ font-family: monospace; color: #666; }}
        .service-tag {{ background: #e3f2fd; padding: 2px 8px; border-radius: 4px; font-size: 12px; }}
    </style>
    <meta http-equiv="refresh" content="10">
</head>
<body>
    <h1>Distributed Tracing UI</h1>

    <div class="stats">
        <div class="stat-card">
            <h3>TOTAL TRACES</h3>
            <div class="value">{stats['total_traces']}</div>
        </div>
        <div class="stat-card">
            <h3>TOTAL SPANS</h3>
            <div class="value">{stats['total_spans']}</div>
        </div>
        <div class="stat-card">
            <h3>SERVICES</h3>
            <div class="value">{len(stats['by_service'])}</div>
        </div>
        <div class="stat-card">
            <h3>ERRORS</h3>
            <div class="value" style="color: #f44336;">{stats['by_status'].get('error', 0)}</div>
        </div>
    </div>

    <h2>Recent Traces</h2>
    <table>
        <thead>
            <tr>
                <th>Trace ID</th>
                <th>Duration</th>
                <th>Spans</th>
                <th>Services</th>
                <th>Start Time</th>
            </tr>
        </thead>
        <tbody>
"""

        for trace in traces:
            services = " ".join(f'<span class="service-tag">{s}</span>' for s in trace["services"])
            html += f"""
            <tr>
                <td class="trace-id">{trace['trace_id']}</td>
                <td>{trace['duration_ms']}ms</td>
                <td>{trace['span_count']}</td>
                <td>{services}</td>
                <td>{trace['start_time']}</td>
            </tr>
"""

        html += """
        </tbody>
    </table>
</body>
</html>"""

        return html


# Global tracing UI
tracing_ui = TracingUI()
