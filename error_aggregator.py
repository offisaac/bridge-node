"""Error Aggregator Module

Centralized error collection and alerting system.
"""
import time
import threading
import traceback
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from collections import defaultdict
import uuid


class ErrorSeverity(str, Enum):
    """Error severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class ErrorCategory(str, Enum):
    """Error categories."""
    RUNTIME = "runtime"
    VALIDATION = "validation"
    AUTHENTICATION = "authorization"
    DATABASE = "database"
    NETWORK = "network"
    EXTERNAL = "external"
    SYSTEM = "system"
    UNKNOWN = "unknown"


@dataclass
class ErrorEvent:
    """Error event data."""
    id: str
    error_type: str
    message: str
    severity: ErrorSeverity
    category: ErrorCategory
    stack_trace: str = ""
    context: Dict[str, Any] = field(default_factory=dict)
    endpoint: str = ""
    method: str = ""
    user_id: str = ""
    ip_address: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    count: int = 1


@dataclass
class ErrorSummary:
    """Error summary for aggregation."""
    error_type: str
    message: str
    severity: ErrorSeverity
    category: ErrorCategory
    count: int
    first_seen: str
    last_seen: str
    affected_endpoints: List[str] = field(default_factory=list)
    affected_users: List[str] = field(default_factory=list)


class ErrorAggregator:
    """Centralized error collection and alerting."""

    def __init__(self, max_events: int = 10000):
        self.max_events = max_events
        self._lock = threading.RLock()
        self._events: List[ErrorEvent] = []
        self._error_groups: Dict[str, ErrorSummary] = {}
        self._alert_callbacks: List[Callable] = []

    def register_alert_callback(self, callback: Callable):
        """Register callback for error alerts."""
        self._alert_callbacks.append(callback)

    def record_error(
        self,
        error_type: str,
        message: str,
        severity: ErrorSeverity = ErrorSeverity.MEDIUM,
        category: ErrorCategory = ErrorCategory.UNKNOWN,
        stack_trace: str = "",
        context: Dict[str, Any] = None,
        endpoint: str = "",
        method: str = "",
        user_id: str = "",
        ip_address: str = ""
    ) -> str:
        """Record an error event."""
        event_id = str(uuid.uuid4())[:8]

        event = ErrorEvent(
            id=event_id,
            error_type=error_type,
            message=message,
            severity=severity,
            category=category,
            stack_trace=stack_trace,
            context=context or {},
            endpoint=endpoint,
            method=method,
            user_id=user_id,
            ip_address=ip_address
        )

        with self._lock:
            self._events.append(event)

            # Trim events
            if len(self._events) > self.max_events:
                self._events = self._events[-self.max_events:]

            # Update error groups
            self._update_error_group(event)

        # Trigger alerts for critical/high errors
        if severity in [ErrorSeverity.CRITICAL, ErrorSeverity.HIGH]:
            self._trigger_alerts(event)

        return event_id

    def _update_error_group(self, event: ErrorEvent):
        """Update error grouping for aggregation."""
        key = f"{event.error_type}:{event.message[:100]}"

        if key not in self._error_groups:
            self._error_groups[key] = ErrorSummary(
                error_type=event.error_type,
                message=event.message,
                severity=event.severity,
                category=event.category,
                count=0,
                first_seen=event.timestamp,
                last_seen=event.timestamp
            )

        group = self._error_groups[key]
        group.count += 1
        group.last_seen = event.timestamp

        if event.endpoint and event.endpoint not in group.affected_endpoints:
            group.affected_endpoints.append(event.endpoint)
        if event.user_id and event.user_id not in group.affected_users:
            group.affected_users.append(event.user_id)

    def _trigger_alerts(self, event: ErrorEvent):
        """Trigger alert callbacks."""
        for callback in self._alert_callbacks:
            try:
                callback(event)
            except Exception as e:
                print(f"Alert callback error: {e}")

    def get_errors(
        self,
        severity: ErrorSeverity = None,
        category: ErrorCategory = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get error events with optional filters."""
        with self._lock:
            events = self._events.copy()

        if severity:
            events = [e for e in events if e.severity == severity]
        if category:
            events = [e for e in events if e.category == category]

        events = sorted(events, key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "id": e.id,
                "error_type": e.error_type,
                "message": e.message,
                "severity": e.severity.value,
                "category": e.category.value,
                "endpoint": e.endpoint,
                "method": e.method,
                "timestamp": e.timestamp,
                "count": e.count
            }
            for e in events[:limit]
        ]

    def get_error_summaries(
        self,
        severity: ErrorSeverity = None,
        limit: int = 20
    ) -> List[Dict]:
        """Get aggregated error summaries."""
        with self._lock:
            summaries = list(self._error_groups.values())

        if severity:
            summaries = [s for s in summaries if s.severity == severity]

        summaries = sorted(summaries, key=lambda x: x.count, reverse=True)

        return [
            {
                "error_type": s.error_type,
                "message": s.message,
                "severity": s.severity.value,
                "category": s.category.value,
                "count": s.count,
                "first_seen": s.first_seen,
                "last_seen": s.last_seen,
                "affected_endpoints": s.affected_endpoints[:5],
                "affected_users": s.affected_users[:5]
            }
            for s in summaries[:limit]
        ]

    def get_stats(self) -> Dict:
        """Get error statistics."""
        with self._lock:
            total = len(self._events)
            by_severity = defaultdict(int)
            by_category = defaultdict(int)

            for event in self._events:
                by_severity[event.severity.value] += 1
                by_category[event.category.value] += 1

            return {
                "total_errors": total,
                "unique_types": len(self._error_groups),
                "by_severity": dict(by_severity),
                "by_category": dict(by_category)
            }

    def clear_errors(self, before: str = None):
        """Clear error events."""
        with self._lock:
            if before:
                self._events = [
                    e for e in self._events
                    if e.timestamp > before
                ]
            else:
                self._events.clear()
                self._error_groups.clear()


# Helper function for recording exceptions
def record_exception(
    aggregator: ErrorAggregator,
    severity: ErrorSeverity = ErrorSeverity.HIGH,
    category: ErrorCategory = ErrorCategory.RUNTIME,
    endpoint: str = "",
    method: str = "",
    user_id: str = "",
    ip_address: str = ""
):
    """Decorator/context manager to record exceptions."""
    def decorator(func):
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                aggregator.record_error(
                    error_type=type(e).__name__,
                    message=str(e),
                    severity=severity,
                    category=category,
                    stack_trace=traceback.format_exc(),
                    endpoint=endpoint,
                    method=method,
                    user_id=user_id,
                    ip_address=ip_address
                )
                raise
        return wrapper

    class ExceptionRecorder:
        def __enter__(self):
            return self
        def __exit__(self, exc_type, exc_val, exc_tb):
            if exc_type is not None:
                aggregator.record_error(
                    error_type=exc_type.__name__,
                    message=str(exc_val),
                    severity=severity,
                    category=category,
                    stack_trace=traceback.format_exc(),
                    endpoint=endpoint,
                    method=method,
                    user_id=user_id,
                    ip_address=ip_address
                )
            return False

    return ExceptionRecorder()


# Global error aggregator
error_aggregator = ErrorAggregator()
