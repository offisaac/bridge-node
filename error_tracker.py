"""Error Tracker Module

Track and analyze error rates with alerting.
"""
import time
import threading
import uuid
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class ErrorSeverity(str, Enum):
    """Error severity."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ErrorEvent:
    """Error event."""
    id: str
    error_type: str
    message: str
    severity: ErrorSeverity
    timestamp: float
    service: str = ""
    endpoint: str = ""
    user_id: str = ""


@dataclass
class ErrorStats:
    """Error statistics."""
    total_errors: int = 0
    by_type: Dict[str, int] = field(default_factory=dict)
    by_service: Dict[str, int] = field(default_factory=dict)
    by_severity: Dict[str, int] = field(default_factory=dict)
    recent_rate: float = 0.0


class ErrorTracker:
    """Track error rates."""

    def __init__(self):
        self._lock = threading.RLock()
        self._errors: List[ErrorEvent] = []
        self._max_errors = 10000
        self._window_seconds = 300  # 5 minutes

    def record(self, error_type: str, message: str, severity: ErrorSeverity = ErrorSeverity.MEDIUM,
               service: str = "", endpoint: str = "", user_id: str = "") -> str:
        """Record an error."""
        event_id = str(uuid.uuid4())[:12]

        event = ErrorEvent(
            id=event_id,
            error_type=error_type,
            message=message,
            severity=severity,
            timestamp=time.time(),
            service=service,
            endpoint=endpoint,
            user_id=user_id
        )

        with self._lock:
            self._errors.append(event)
            if len(self._errors) > self._max_errors:
                self._errors = self._errors[-self._max_errors:]

        return event_id

    def get_stats(self, service: str = None) -> ErrorStats:
        """Get error statistics."""
        with self._lock:
            now = time.time()
            window_errors = [e for e in self._errors if now - e.timestamp < self._window_seconds]

            stats = ErrorStats(total_errors=len(self._errors))

            for e in window_errors:
                if service and e.service != service:
                    continue
                stats.by_type[e.error_type] = stats.by_type.get(e.error_type, 0) + 1
                if e.service:
                    stats.by_service[e.service] = stats.by_service.get(e.service, 0) + 1
                stats.by_severity[e.severity.value] = stats.by_severity.get(e.severity.value, 0) + 1

            if window_errors:
                stats.recent_rate = len(window_errors) / (self._window_seconds / 60)

            return stats

    def get_recent_errors(self, limit: int = 100) -> List[Dict]:
        """Get recent errors."""
        with self._lock:
            errors = sorted(self._errors, key=lambda x: x.timestamp, reverse=True)

        return [
            {"id": e.id, "type": e.error_type, "message": e.message,
             "severity": e.severity.value, "timestamp": e.timestamp, "service": e.service}
            for e in errors[:limit]
        ]


# Global error tracker
error_tracker = ErrorTracker()
