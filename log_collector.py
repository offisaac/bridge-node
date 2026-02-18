"""Log Collector Module

Centralized log collection and aggregation.
"""
import threading
import time
import json
import re
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid
from collections import defaultdict


class LogLevel(str, Enum):
    """Log levels."""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class LogSource(str, Enum):
    """Log sources."""
    APPLICATION = "application"
    SYSTEM = "system"
    SECURITY = "security"
    AUDIT = "audit"
    ACCESS = "access"
    PERFORMANCE = "performance"
    CUSTOM = "custom"


@dataclass
class LogEntry:
    """Log entry."""
    id: str
    message: str
    level: LogLevel
    source: LogSource
    timestamp: float
    service: str = ""
    host: str = ""
    user: str = ""
    trace_id: str = ""
    span_id: str = ""
    metadata: Dict = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)


class LogAggregator:
    """Centralized log collection and aggregation."""

    def __init__(self):
        self._lock = threading.RLock()
        self._logs: List[LogEntry] = []
        self._max_logs = 100000
        self._patterns: Dict[str, re.Pattern] = {}
        self._indexes: Dict[str, Dict[str, List[int]]] = defaultdict(dict)

    def ingest_log(
        self,
        message: str,
        level: LogLevel,
        source: LogSource,
        service: str = "",
        host: str = "",
        user: str = "",
        trace_id: str = "",
        span_id: str = "",
        metadata: Dict = None,
        tags: List[str] = None
    ) -> str:
        """Ingest a log entry."""
        log_id = str(uuid.uuid4())[:12]

        entry = LogEntry(
            id=log_id,
            message=message,
            level=level,
            source=source,
            timestamp=time.time(),
            service=service,
            host=host,
            user=user,
            trace_id=trace_id,
            span_id=span_id,
            metadata=metadata or {},
            tags=tags or []
        )

        with self._lock:
            idx = len(self._logs)
            self._logs.append(entry)

            # Update indexes
            self._update_indexes(entry, idx)

            # Trim old logs
            if len(self._logs) > self._max_logs:
                self._logs = self._logs[-self._max_logs:]

        return log_id

    def _update_indexes(self, entry: LogEntry, idx: int):
        """Update search indexes."""
        # Index by level
        if entry.level.value not in self._indexes["level"]:
            self._indexes["level"][entry.level.value] = []
        self._indexes["level"][entry.level.value].append(idx)

        # Index by source
        if entry.source.value not in self._indexes["source"]:
            self._indexes["source"][entry.source.value] = []
        self._indexes["source"][entry.source.value].append(idx)

        # Index by service
        if entry.service:
            if entry.service not in self._indexes["service"]:
                self._indexes["service"][entry.service] = []
            self._indexes["service"][entry.service].append(idx)

        # Index by host
        if entry.host:
            if entry.host not in self._indexes["host"]:
                self._indexes["host"][entry.host] = []
            self._indexes["host"][entry.host].append(idx)

        # Index by trace_id
        if entry.trace_id:
            if entry.trace_id not in self._indexes["trace"]:
                self._indexes["trace"][entry.trace_id] = []
            self._indexes["trace"][entry.trace_id].append(idx)

    def query_logs(
        self,
        level: LogLevel = None,
        source: LogSource = None,
        service: str = None,
        host: str = None,
        trace_id: str = None,
        search: str = None,
        start_time: float = None,
        end_time: float = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """Query logs with filters."""
        with self._lock:
            logs = list(self._logs)

        # Apply filters
        if level:
            logs = [l for l in logs if l.level == level]
        if source:
            logs = [l for l in logs if l.source == source]
        if service:
            logs = [l for l in logs if l.service == service]
        if host:
            logs = [l for l in logs if l.host == host]
        if trace_id:
            logs = [l for l in logs if l.trace_id == trace_id]
        if search:
            search_lower = search.lower()
            logs = [l for l in logs if search_lower in l.message.lower()]
        if start_time:
            logs = [l for l in logs if l.timestamp >= start_time]
        if end_time:
            logs = [l for l in logs if l.timestamp <= end_time]

        logs.sort(key=lambda x: x.timestamp, reverse=True)

        return [self._serialize_log(l) for l in logs[offset:offset + limit]]

    def get_logs_by_trace(self, trace_id: str) -> List[Dict]:
        """Get all logs for a trace."""
        return self.query_logs(trace_id=trace_id, limit=1000)

    def get_log_stats(self, time_window: int = 3600) -> Dict:
        """Get log statistics."""
        now = time.time()
        cutoff = now - time_window

        with self._lock:
            logs = [l for l in self._logs if l.timestamp >= cutoff]

        if not logs:
            return {
                "total": 0,
                "by_level": {},
                "by_source": {},
                "by_service": {},
                "rate_per_second": 0
            }

        by_level = defaultdict(int)
        by_source = defaultdict(int)
        by_service = defaultdict(int)

        for log in logs:
            by_level[log.level.value] += 1
            by_source[log.source.value] += 1
            if log.service:
                by_service[log.service] += 1

        return {
            "total": len(logs),
            "by_level": dict(by_level),
            "by_source": dict(by_source),
            "by_service": dict(by_service),
            "rate_per_second": len(logs) / time_window if time_window > 0 else 0
        }

    def get_timeline(self, time_window: int = 3600, group_by: str = "minute") -> List[Dict]:
        """Get log timeline."""
        now = time.time()
        cutoff = now - time_window

        with self._lock:
            logs = [l for l in self._logs if l.timestamp >= cutoff]

        # Determine group size
        if group_by == "second":
            group_size = 1
        elif group_by == "minute":
            group_size = 60
        elif group_by == "hour":
            group_size = 3600
        else:
            group_size = 60

        timeline = {}
        for log in logs:
            key = int(log.timestamp / group_size) * group_size

            if key not in timeline:
                timeline[key] = {
                    "timestamp": key,
                    "count": 0,
                    "by_level": defaultdict(int)
                }

            timeline[key]["count"] += 1
            timeline[key]["by_level"][log.level.value] += 1

        # Convert defaultdicts
        for key in timeline:
            timeline[key]["by_level"] = dict(timeline[key]["by_level"])

        return sorted(timeline.values(), key=lambda x: x["timestamp"])

    def detect_anomalies(self, time_window: int = 300) -> List[Dict]:
        """Detect log anomalies."""
        now = time.time()
        cutoff = now - time_window

        with self._lock:
            recent_logs = [l for l in self._logs if l.timestamp >= cutoff]
            all_logs = list(self._logs)

        if not recent_logs:
            return []

        # Calculate baseline
        baseline = len(all_logs) / max(1, time.time() - min(l.timestamp for l in all_logs if hasattr(l, 'timestamp') and l.timestamp))
        recent_rate = len(recent_logs) / (time_window / 3600)

        anomalies = []

        # Check for rate spike
        if recent_rate > baseline * 3:
            anomalies.append({
                "type": "rate_spike",
                "description": f"Log rate increased significantly: {recent_rate:.2f}/s vs baseline {baseline:.2f}/s",
                "severity": "high"
            })

        # Check for error spike
        recent_errors = sum(1 for l in recent_logs if l.level in [LogLevel.ERROR, LogLevel.CRITICAL])
        if recent_errors > 10:
            anomalies.append({
                "type": "error_spike",
                "description": f"High error count: {recent_errors} errors in {time_window}s",
                "severity": "critical"
            })

        # Check for keyword patterns
        error_keywords = ["exception", "fail", "timeout", "crash", "panic"]
        for keyword in error_keywords:
            count = sum(1 for l in recent_logs if keyword in l.message.lower())
            if count > 5:
                anomalies.append({
                    "type": "keyword_spike",
                    "description": f"Keyword '{keyword}' appeared {count} times",
                    "severity": "medium"
                })

        return anomalies

    def search_pattern(self, pattern: str, limit: int = 100) -> List[Dict]:
        """Search logs by regex pattern."""
        try:
            regex = re.compile(pattern, re.IGNORECASE)
        except re.error:
            return []

        with self._lock:
            matches = [l for l in self._logs if regex.search(l.message)]

        matches.sort(key=lambda x: x.timestamp, reverse=True)

        return [self._serialize_log(l) for l in matches[:limit]]

    def get_services(self) -> List[str]:
        """Get list of services with logs."""
        with self._lock:
            services = set(l.service for l in self._logs if l.service)
        return sorted(list(services))

    def get_hosts(self) -> List[str]:
        """Get list of hosts with logs."""
        with self._lock:
            hosts = set(l.host for l in self._logs if l.host)
        return sorted(list(hosts))

    def clear_logs(self, before_timestamp: float = None):
        """Clear old logs."""
        with self._lock:
            if before_timestamp:
                self._logs = [l for l in self._logs if l.timestamp >= before_timestamp]
            else:
                self._logs.clear()
                self._indexes.clear()

    def _serialize_log(self, log: LogEntry) -> Dict:
        """Serialize a log entry."""
        return {
            "id": log.id,
            "message": log.message,
            "level": log.level.value,
            "source": log.source.value,
            "timestamp": log.timestamp,
            "service": log.service,
            "host": log.host,
            "user": log.user,
            "trace_id": log.trace_id,
            "span_id": log.span_id,
            "metadata": log.metadata,
            "tags": log.tags
        }

    def export_logs(
        self,
        start_time: float = None,
        end_time: float = None,
        format: str = "json",
        limit: int = 10000
    ) -> str:
        """Export logs."""
        logs = self.query_logs(
            start_time=start_time,
            end_time=end_time,
            limit=limit
        )

        if format == "json":
            return json.dumps(logs, indent=2)
        elif format == "csv":
            if not logs:
                return ""

            headers = ["timestamp", "level", "source", "service", "host", "message"]
            lines = [",".join(headers)]

            for log in logs:
                row = [
                    str(log.get("timestamp", "")),
                    log.get("level", ""),
                    log.get("source", ""),
                    log.get("service", ""),
                    log.get("host", ""),
                    log.get("message", "").replace(",", ";").replace("\n", " ")
                ]
                lines.append(",".join(row))

            return "\n".join(lines)

        return str(logs)


# Global log aggregator
log_collector = LogAggregator()


# Initialize with sample logs
def init_sample_logs():
    """Initialize sample log entries."""
    log_collector.ingest_log(
        message="Application started successfully",
        level=LogLevel.INFO,
        source=LogSource.APPLICATION,
        service="api-gateway",
        host="server-01",
        tags=["startup"]
    )

    log_collector.ingest_log(
        message="User login successful",
        level=LogLevel.INFO,
        source=LogSource.AUDIT,
        service="auth-service",
        host="server-01",
        user="admin",
        metadata={"ip": "192.168.1.100"}
    )

    log_collector.ingest_log(
        message="High memory usage detected",
        level=LogLevel.WARNING,
        source=LogSource.PERFORMANCE,
        service="api-gateway",
        host="server-02",
        metadata={"memory_percent": 87}
    )

    log_collector.ingest_log(
        message="Request timeout for /api/users",
        level=LogLevel.ERROR,
        source=LogSource.APPLICATION,
        service="api-gateway",
        host="server-01",
        trace_id="abc123",
        metadata={"endpoint": "/api/users", "timeout_ms": 5000}
    )


init_sample_logs()
