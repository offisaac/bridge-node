"""Performance Analyzer Module

Application performance analysis and profiling.
"""
import threading
import time
import json
import psutil
import os
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid
import functools


class MetricType(str, Enum):
    """Metric types."""
    CPU = "cpu"
    MEMORY = "memory"
    DISK = "disk"
    NETWORK = "network"
    REQUEST = "request"
    DATABASE = "database"
    CACHE = "cache"
    CUSTOM = "custom"


class AlertLevel(str, Enum):
    """Alert levels."""
    NORMAL = "normal"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class PerformanceMetric:
    """Performance metric."""
    id: str
    name: str
    metric_type: MetricType
    value: float
    unit: str
    timestamp: float
    tags: Dict = field(default_factory=dict)
    metadata: Dict = field(default_factory=dict)


@dataclass
class ProfileSession:
    """Profile session."""
    id: str
    name: str
    start_time: float
    end_time: Optional[float] = None
    samples: List[Dict] = field(default_factory=list)
    metadata: Dict = field(default_factory=dict)


@dataclass
class RequestProfile:
    """Request profile."""
    id: str
    method: str
    path: str
    duration: float
    timestamp: float
    status_code: int
    memory_delta: float = 0
    cpu_time: float = 0
    database_time: float = 0
    cache_hits: int = 0
    cache_misses: int = 0
    metadata: Dict = field(default_factory=dict)


class PerformanceAnalyzer:
    """Application performance analyzer."""

    def __init__(self):
        self._lock = threading.RLock()
        self._metrics: List[PerformanceMetric] = []
        self._sessions: Dict[str, ProfileSession] = {}
        self._current_session: Optional[str] = None
        self._request_profiles: List[RequestProfile] = []
        self._max_metrics = 10000
        self._max_profiles = 5000
        self._thresholds: Dict[str, float] = {
            "cpu_percent": 80.0,
            "memory_percent": 85.0,
            "disk_percent": 90.0,
            "response_time_ms": 1000.0,
            "error_rate": 0.05
        }
        self._callbacks: List[callable] = []

    def record_metric(
        self,
        name: str,
        metric_type: MetricType,
        value: float,
        unit: str = "",
        tags: Dict = None,
        metadata: Dict = None
    ) -> str:
        """Record a performance metric."""
        metric = PerformanceMetric(
            id=str(uuid.uuid4())[:12],
            name=name,
            metric_type=metric_type,
            value=value,
            unit=unit,
            timestamp=time.time(),
            tags=tags or {},
            metadata=metadata or {}
        )

        with self._lock:
            self._metrics.append(metric)

            # Check thresholds
            self._check_thresholds(metric)

            # Trim old metrics
            if len(self._metrics) > self._max_metrics:
                self._metrics = self._metrics[-self._max_metrics:]

        return metric.id

    def _check_thresholds(self, metric: PerformanceMetric):
        """Check if metric exceeds thresholds."""
        threshold_key = f"{metric.metric_type.value}_percent" if metric.unit == "%" else metric.name

        if threshold_key in self._thresholds:
            threshold = self._thresholds[threshold_key]
            if metric.value > threshold:
                level = AlertLevel.CRITICAL if metric.value > threshold * 1.2 else AlertLevel.WARNING

                for callback in self._callbacks:
                    try:
                        callback(metric, level, threshold)
                    except Exception:
                        pass

    def get_metrics(
        self,
        metric_type: MetricType = None,
        name: str = None,
        start_time: float = None,
        end_time: float = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get metrics with filters."""
        with self._lock:
            metrics = list(self._metrics)

        if metric_type:
            metrics = [m for m in metrics if m.metric_type == metric_type]
        if name:
            metrics = [m for m in metrics if m.name == name]
        if start_time:
            metrics = [m for m in metrics if m.timestamp >= start_time]
        if end_time:
            metrics = [m for m in metrics if m.timestamp <= end_time]

        metrics.sort(key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "id": m.id,
                "name": m.name,
                "type": m.metric_type.value,
                "value": m.value,
                "unit": m.unit,
                "timestamp": m.timestamp,
                "tags": m.tags,
                "metadata": m.metadata
            }
            for m in metrics[:limit]
        ]

    def get_system_metrics(self) -> Dict:
        """Get current system metrics."""
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        network = psutil.net_io_counters()

        return {
            "cpu": {
                "percent": cpu_percent,
                "count": psutil.cpu_count(),
                "status": self._get_status(cpu_percent, "cpu_percent")
            },
            "memory": {
                "percent": memory.percent,
                "used_mb": memory.used / (1024 * 1024),
                "available_mb": memory.available / (1024 * 1024),
                "status": self._get_status(memory.percent, "memory_percent")
            },
            "disk": {
                "percent": disk.percent,
                "used_gb": disk.used / (1024 * 1024 * 1024),
                "free_gb": disk.free / (1024 * 1024 * 1024),
                "status": self._get_status(disk.percent, "disk_percent")
            },
            "network": {
                "bytes_sent": network.bytes_sent,
                "bytes_recv": network.bytes_recv,
                "packets_sent": network.packets_sent,
                "packets_recv": network.packets_recv
            },
            "timestamp": time.time()
        }

    def _get_status(self, value: float, metric_key: str) -> str:
        """Get status based on threshold."""
        threshold = self._thresholds.get(metric_key, 100)
        if value > threshold * 1.2:
            return AlertLevel.CRITICAL.value
        elif value > threshold:
            return AlertLevel.WARNING.value
        return AlertLevel.NORMAL.value

    def start_profiling(self, name: str = None) -> str:
        """Start a profiling session."""
        session_id = str(uuid.uuid4())[:12]

        session = ProfileSession(
            id=session_id,
            name=name or f"session-{session_id}",
            start_time=time.time()
        )

        with self._lock:
            self._sessions[session_id] = session
            self._current_session = session_id

        return session_id

    def sample_profiling(self, session_id: str = None) -> bool:
        """Take a sample of current profiling data."""
        sid = session_id or self._current_session

        with self._lock:
            if sid not in self._sessions:
                return False

            session = self._sessions[sid]

            sample = {
                "timestamp": time.time(),
                "cpu_percent": psutil.cpu_percent(interval=0.01),
                "memory_percent": psutil.virtual_memory().percent,
                "threads": len(psutil.Process().threads())
            }

            session.samples.append(sample)
            return True

    def stop_profiling(self, session_id: str = None) -> Optional[Dict]:
        """Stop a profiling session."""
        sid = session_id or self._current_session

        with self._lock:
            if sid not in self._sessions:
                return None

            session = self._sessions[sid]
            session.end_time = time.time()

            # Calculate statistics
            if session.samples:
                cpu_values = [s["cpu_percent"] for s in session.samples]
                mem_values = [s["memory_percent"] for s in session.samples]

                stats = {
                    "id": session.id,
                    "name": session.name,
                    "duration": session.end_time - session.start_time,
                    "samples": len(session.samples),
                    "cpu_avg": sum(cpu_values) / len(cpu_values),
                    "cpu_max": max(cpu_values),
                    "memory_avg": sum(mem_values) / len(mem_values),
                    "memory_max": max(mem_values)
                }
            else:
                stats = {
                    "id": session.id,
                    "name": session.name,
                    "duration": session.end_time - session.start_time,
                    "samples": 0
                }

            self._current_session = None
            return stats

    def record_request(
        self,
        method: str,
        path: str,
        duration: float,
        status_code: int,
        metadata: Dict = None
    ) -> str:
        """Record a request profile."""
        profile = RequestProfile(
            id=str(uuid.uuid4())[:12],
            method=method,
            path=path,
            duration=duration,
            timestamp=time.time(),
            status_code=status_code,
            metadata=metadata or {}
        )

        with self._lock:
            self._request_profiles.append(profile)

            # Trim old profiles
            if len(self._request_profiles) > self._max_profiles:
                self._request_profiles = self._request_profiles[-self._max_profiles:]

            # Check response time threshold
            if duration > self._thresholds.get("response_time_ms", 1000):
                for callback in self._callbacks:
                    try:
                        callback(profile, AlertLevel.WARNING, "response_time")
                    except Exception:
                        pass

        return profile.id

    def get_request_profiles(
        self,
        method: str = None,
        path: str = None,
        start_time: float = None,
        end_time: float = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get request profiles."""
        with self._lock:
            profiles = list(self._request_profiles)

        if method:
            profiles = [p for p in profiles if p.method == method]
        if path:
            profiles = [p for p in profiles if path in p.path]
        if start_time:
            profiles = [p for p in profiles if p.timestamp >= start_time]
        if end_time:
            profiles = [p for p in profiles if p.timestamp <= end_time]

        profiles.sort(key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "id": p.id,
                "method": p.method,
                "path": p.path,
                "duration": p.duration,
                "timestamp": p.timestamp,
                "status_code": p.status_code,
                "metadata": p.metadata
            }
            for p in profiles[:limit]
        ]

    def get_request_stats(self, time_window: int = 3600) -> Dict:
        """Get request statistics."""
        now = time.time()
        cutoff = now - time_window

        with self._lock:
            profiles = [p for p in self._request_profiles if p.timestamp >= cutoff]

        if not profiles:
            return {
                "total_requests": 0,
                "avg_duration_ms": 0,
                "p50_ms": 0,
                "p95_ms": 0,
                "p99_ms": 0,
                "error_rate": 0,
                "requests_per_second": 0
            }

        durations = sorted([p.duration for p in profiles])
        total = len(profiles)
        errors = sum(1 for p in profiles if p.status_code >= 400)

        return {
            "total_requests": total,
            "avg_duration_ms": sum(durations) / total,
            "p50_ms": durations[int(total * 0.5)],
            "p95_ms": durations[int(total * 0.95)],
            "p99_ms": durations[int(total * 0.99)],
            "error_rate": errors / total,
            "requests_per_second": total / time_window,
            "time_window_seconds": time_window
        }

    def get_slow_requests(self, limit: int = 10) -> List[Dict]:
        """Get slowest requests."""
        with self._lock:
            profiles = sorted(self._request_profiles, key=lambda x: x.duration, reverse=True)

        return [
            {
                "id": p.id,
                "method": p.method,
                "path": p.path,
                "duration": p.duration,
                "timestamp": p.timestamp,
                "status_code": p.status_code
            }
            for p in profiles[:limit]
        ]

    def set_threshold(self, metric: str, value: float):
        """Set alert threshold."""
        with self._lock:
            self._thresholds[metric] = value

    def get_thresholds(self) -> Dict:
        """Get alert thresholds."""
        with self._lock:
            return dict(self._thresholds)

    def add_callback(self, callback: callable):
        """Add alert callback."""
        self._callbacks.append(callback)

    def get_stats(self) -> Dict:
        """Get performance analyzer statistics."""
        with self._lock:
            return {
                "total_metrics": len(self._metrics),
                "active_sessions": len([s for s in self._sessions.values() if s.end_time is None]),
                "total_sessions": len(self._sessions),
                "total_profiles": len(self._request_profiles),
                "thresholds": self._thresholds
            }


# Global performance analyzer
performance_analyzer = PerformanceAnalyzer()


# Initialize with system metrics collection
def init_performance_analyzer():
    """Initialize performance analyzer."""
    # Record initial system metrics
    perf_analyzer = PerformanceAnalyzer()
    perf_analyzer.record_metric(
        name="system_cpu",
        metric_type=MetricType.CPU,
        value=psutil.cpu_percent(),
        unit="%"
    )
    perf_analyzer.record_metric(
        name="system_memory",
        metric_type=MetricType.MEMORY,
        value=psutil.virtual_memory().percent,
        unit="%"
    )

    return perf_analyzer


# Create global instance
perf_analyzer = PerformanceAnalyzer()
