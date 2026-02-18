"""BridgeNode Metrics and Observability Module

基于 Prometheus 的指标收集和可观测性系统
支持 OpenTelemetry 风格的指标导出
"""
import os
import time
import json
import threading
import logging
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from collections import defaultdict
import hashlib


logger = logging.getLogger(__name__)


class MetricType(str, Enum):
    """Metric types."""
    COUNTER = "counter"
    GAUGE = "gauge"
    HISTOGRAM = "histogram"
    SUMMARY = "summary"


@dataclass
class Metric:
    """Base metric representation."""
    name: str
    value: float
    labels: Dict[str, str] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)


class Counter:
    """Prometheus-style counter metric."""

    def __init__(self, name: str, description: str = "", labels: List[str] = None):
        self.name = name
        self.description = description
        self.labels = labels or []
        self._values: Dict[tuple, float] = {}
        self._lock = threading.RLock()

    def _get_key(self, label_values: Dict[str, str]) -> tuple:
        return tuple(sorted(label_values.items()))

    def inc(self, amount: float = 1, **label_values):
        """Increment counter."""
        with self._lock:
            key = self._get_key(label_values)
            self._values[key] = self._values.get(key, 0) + amount

    def get(self, **label_values) -> float:
        """Get counter value."""
        with self._lock:
            key = self._get_key(label_values)
            return self._values.get(key, 0)

    def get_all(self) -> List[Metric]:
        """Get all label combinations."""
        with self._lock:
            return [
                Metric(name=self.name, value=v, labels=dict(k))
                for k, v in self._values.items()
            ]


class Gauge:
    """Prometheus-style gauge metric."""

    def __init__(self, name: str, description: str = "", labels: List[str] = None):
        self.name = name
        self.description = description
        self.labels = labels or []
        self._values: Dict[tuple, float] = {}
        self._lock = threading.RLock()

    def _get_key(self, label_values: Dict[str, str]) -> tuple:
        return tuple(sorted(label_values.items()))

    def set(self, value: float, **label_values):
        """Set gauge value."""
        with self._lock:
            key = self._get_key(label_values)
            self._values[key] = value

    def inc(self, amount: float = 1, **label_values):
        """Increment gauge."""
        with self._lock:
            key = self._get_key(label_values)
            self._values[key] = self._values.get(key, 0) + amount

    def dec(self, amount: float = 1, **label_values):
        """Decrement gauge."""
        with self._lock:
            key = self._get_key(label_values)
            self._values[key] = self._values.get(key, 0) - amount

    def get(self, **label_values) -> float:
        """Get gauge value."""
        with self._lock:
            key = self._get_key(label_values)
            return self._values.get(key, 0)

    def get_all(self) -> List[Metric]:
        """Get all label combinations."""
        with self._lock:
            return [
                Metric(name=self.name, value=v, labels=dict(k))
                for k, v in self._values.items()
            ]


class Histogram:
    """Prometheus-style histogram metric."""

    def __init__(
        self,
        name: str,
        description: str = "",
        buckets: List[float] = None,
        labels: List[str] = None
    ):
        self.name = name
        self.description = description
        self.buckets = buckets or [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
        self.labels = labels or []
        self._data: Dict[tuple, Dict] = {}
        self._lock = threading.RLock()

    def _get_key(self, label_values: Dict[str, str]) -> tuple:
        return tuple(sorted(label_values.items()))

    def observe(self, value: float, **label_values):
        """Observe a value."""
        with self._lock:
            key = self._get_key(label_values)
            if key not in self._data:
                self._data[key] = {
                    "sum": 0,
                    "count": 0,
                    "buckets": {b: 0 for b in self.buckets}
                }

            data = self._data[key]
            data["sum"] += value
            data["count"] += 1
            for bucket in self.buckets:
                if value <= bucket:
                    data["buckets"][bucket] += 1

    def get_all(self) -> List[Metric]:
        """Get histogram metrics."""
        with self._lock:
            metrics = []
            for key, data in self._data.items():
                labels = dict(key)
                metrics.append(Metric(name=f"{self.name}_sum", value=data["sum"], labels=labels))
                metrics.append(Metric(name=f"{self.name}_count", value=data["count"], labels=labels))
                for bucket, count in data["buckets"].items():
                    bucket_labels = {**labels, "le": str(bucket)}
                    metrics.append(Metric(name=f"{self.name}_bucket", value=count, labels=bucket_labels))
            return metrics


class MetricsRegistry:
    """Central metrics registry."""

    def __init__(self):
        self._counters: Dict[str, Counter] = {}
        self._gauges: Dict[str, Gauge] = {}
        self._histograms: Dict[str, Histogram] = {}
        self._lock = threading.RLock()

    def counter(self, name: str, description: str = "", labels: List[str] = None) -> Counter:
        """Get or create a counter."""
        with self._lock:
            if name not in self._counters:
                self._counters[name] = Counter(name, description, labels)
            return self._counters[name]

    def gauge(self, name: str, description: str = "", labels: List[str] = None) -> Gauge:
        """Get or create a gauge."""
        with self._lock:
            if name not in self._gauges:
                self._gauges[name] = Gauge(name, description, labels)
            return self._gauges[name]

    def histogram(self, name: str, description: str = "", buckets: List[float] = None, labels: List[str] = None) -> Histogram:
        """Get or create a histogram."""
        with self._lock:
            if name not in self._histograms:
                self._histograms[name] = Histogram(name, description, buckets, labels)
            return self._histograms[name]

    def get_all_metrics(self) -> List[Metric]:
        """Get all registered metrics."""
        with self._lock:
            metrics = []
            for counter in self._counters.values():
                metrics.extend(counter.get_all())
            for gauge in self._gauges.values():
                metrics.extend(gauge.get_all())
            for histogram in self._histograms.values():
                metrics.extend(histogram.get_all())
            return metrics

    def clear(self):
        """Clear all metrics."""
        with self._lock:
            self._counters.clear()
            self._gauges.clear()
            self._histograms.clear()

    def export_prometheus(self) -> str:
        """Export metrics in Prometheus format."""
        lines = []
        for metric in self.get_all_metrics():
            labels_str = ",".join(f'{k}="{v}"' for k, v in metric.labels.items())
            if labels_str:
                lines.append(f'{metric.name}{{{labels_str}}} {metric.value}')
            else:
                lines.append(f"{metric.name} {metric.value}")
        return "\n".join(lines) + "\n"


# Global metrics registry
metrics_registry = MetricsRegistry()


# ============================================================
# Predefined metrics
# ============================================================

# Request metrics
http_requests_total = metrics_registry.counter(
    "http_requests_total",
    "Total number of HTTP requests",
    ["method", "endpoint", "status"]
)

http_request_duration_seconds = metrics_registry.histogram(
    "http_request_duration_seconds",
    "HTTP request duration in seconds",
    labels=["method", "endpoint"]
)

# System metrics
system_cpu_usage = metrics_registry.gauge(
    "system_cpu_usage",
    "Current CPU usage percentage"
)

system_memory_usage = metrics_registry.gauge(
    "system_memory_usage",
    "Current memory usage percentage"
)

system_disk_usage = metrics_registry.gauge(
    "system_disk_usage",
    "Current disk usage percentage"
)

# Application metrics
app_requests_active = metrics_registry.gauge(
    "app_requests_active",
    "Number of active requests"
)

app_errors_total = metrics_registry.counter(
    "app_errors_total",
    "Total number of errors",
    ["type", "endpoint"]
)

app_uptime_seconds = metrics_registry.gauge(
    "app_uptime_seconds",
    "Application uptime in seconds"
)

# Business metrics
news_fetches_total = metrics_registry.counter(
    "news_fetches_total",
    "Total number of news fetches",
    ["category", "status"]
)

persist_operations_total = metrics_registry.counter(
    "persist_operations_total",
    "Total number of persistence operations",
    ["operation", "status"]
)


# ============================================================
# Metrics collection utilities
# ============================================================

def record_request(method: str, endpoint: str, status: int, duration_ms: float):
    """Record an HTTP request."""
    http_requests_total.inc(1, method=method, endpoint=endpoint, status=str(status))
    http_request_duration_seconds.observe(duration_ms / 1000, method=method, endpoint=endpoint)


def record_error(error_type: str, endpoint: str = "unknown"):
    """Record an error."""
    app_errors_total.inc(1, type=error_type, endpoint=endpoint)


def update_system_metrics(cpu: float, memory: float, disk: float):
    """Update system metrics."""
    system_cpu_usage.set(cpu)
    system_memory_usage.set(memory)
    system_disk_usage.set(disk)


def record_news_fetch(category: str, success: bool):
    """Record news fetch operation."""
    status = "success" if success else "failure"
    news_fetches_total.inc(1, category=category, status=status)


def record_persist_operation(operation: str, success: bool):
    """Record persistence operation."""
    status = "success" if success else "failure"
    persist_operations_total.inc(1, operation=operation, status=status)


# ============================================================
# Health check system
# ============================================================

class HealthStatus(str, Enum):
    """Health check status."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class HealthCheck:
    """Health check result."""
    name: str
    status: HealthStatus
    message: str = ""
    latency_ms: float = 0
    details: Dict[str, Any] = field(default_factory=dict)


class HealthChecker:
    """Health check manager."""

    def __init__(self):
        self._checks: Dict[str, Callable[[], HealthCheck]] = {}
        self._lock = threading.RLock()

    def register(self, name: str, check_fn: Callable[[], HealthCheck]):
        """Register a health check."""
        with self._lock:
            self._checks[name] = check_fn

    def run_all(self) -> Dict[str, Any]:
        """Run all health checks."""
        results = {}
        overall = HealthStatus.HEALTHY

        for name, check_fn in self._checks.items():
            try:
                start = time.time()
                result = check_fn()
                result.latency_ms = (time.time() - start) * 1000
                results[name] = result
            except Exception as e:
                results[name] = HealthCheck(
                    name=name,
                    status=HealthStatus.UNHEALTHY,
                    message=str(e)
                )

            # Determine overall status
            if results[name].status == HealthStatus.UNHEALTHY:
                overall = HealthStatus.UNHEALTHY
            elif results[name].status == HealthStatus.DEGRADED and overall == HealthStatus.HEALTHY:
                overall = HealthStatus.DEGRADED

        return {
            "status": overall.value,
            "checks": {
                name: {
                    "status": result.status.value,
                    "message": result.message,
                    "latency_ms": round(result.latency_ms, 2),
                    "details": result.details
                }
                for name, result in results.items()
            },
            "timestamp": datetime.now().isoformat()
        }


# Global health checker
health_checker = HealthChecker()


# ============================================================
# Logging utilities
# ============================================================

class StructuredLogger:
    """Structured JSON logger."""

    def __init__(self, name: str = "bridgenode"):
        self.logger = logging.getLogger(name)
        self._setup_handler()

    def _setup_handler(self):
        """Setup JSON log handler."""
        if not self.logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(logging.Formatter('%(message)s'))
            self.logger.addHandler(handler)
            self.logger.setLevel(logging.INFO)

    def _log(self, level: str, message: str, **kwargs):
        """Log a structured message."""
        log_data = {
            "timestamp": datetime.now().isoformat(),
            "level": level,
            "message": message,
            **kwargs
        }
        self.logger.info(json.dumps(log_data))

    def info(self, message: str, **kwargs):
        """Log info message."""
        self._log("info", message, **kwargs)

    def warning(self, message: str, **kwargs):
        """Log warning message."""
        self._log("warning", message, **kwargs)

    def error(self, message: str, **kwargs):
        """Log error message."""
        self._log("error", message, **kwargs)

    def debug(self, message: str, **kwargs):
        """Log debug message."""
        self._log("debug", message, **kwargs)


# Global structured logger
structured_logger = StructuredLogger()


# ============================================================
# Observability helpers
# ============================================================

def get_app_info() -> Dict[str, Any]:
    """Get application information."""
    return {
        "name": "BridgeNode",
        "version": "1.0.0",
        "start_time": datetime.now().isoformat(),
        "metrics": {
            "counters": len(metrics_registry._counters),
            "gauges": len(metrics_registry._gauges),
            "histograms": len(metrics_registry._histograms)
        }
    }
