"""Rate Limit Dashboard Module

Dashboard data provider for rate limiting visualization.
"""
import time
import threading
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import defaultdict
from enum import Enum


class TimeRange(str, Enum):
    """Time range for dashboard data."""
    LAST_1H = "1h"
    LAST_24H = "24h"
    LAST_7D = "7d"
    LAST_30D = "30d"


@dataclass
class RateLimitStats:
    """Rate limit statistics."""
    total_requests: int = 0
    allowed_requests: int = 0
    rejected_requests: int = 0
    current_rate: float = 0.0
    avg_rate: float = 0.0
    peak_rate: float = 0.0
    unique_tokens: int = 0
    unique_ips: int = 0


@dataclass
class EndpointStats:
    """Per-endpoint rate limit statistics."""
    endpoint: str
    total_requests: int = 0
    rejected: int = 0
    avg_latency_ms: float = 0.0
    last_request: Optional[str] = None


@dataclass
class CircuitBreakerStats:
    """Circuit breaker statistics."""
    endpoint: str
    state: str  # closed, open, half_open
    failure_count: int = 0
    success_count: int = 0
    last_failure: Optional[str] = None
    next_attempt: Optional[str] = None


class RateLimitDashboard:
    """Dashboard data provider for rate limiting."""

    def __init__(self):
        self._lock = threading.RLock()
        self._request_history: List[Dict] = []
        self._max_history = 10000
        self._endpoint_stats: Dict[str, EndpointStats] = {}
        self._token_stats: Dict[str, Dict] = {}
        self._ip_stats: Dict[str, Dict] = {}

    def record_request(
        self,
        endpoint: str,
        token: str,
        ip: str,
        allowed: bool,
        latency_ms: float = 0
    ):
        """Record a request for dashboard."""
        with self._lock:
            now = datetime.now()
            record = {
                "timestamp": now.isoformat(),
                "endpoint": endpoint,
                "token": token,
                "ip": ip,
                "allowed": allowed,
                "latency_ms": latency_ms
            }
            self._request_history.append(record)

            # Trim history
            if len(self._request_history) > self._max_history:
                self._request_history = self._request_history[-self._max_history:]

            # Update endpoint stats
            if endpoint not in self._endpoint_stats:
                self._endpoint_stats[endpoint] = EndpointStats(endpoint=endpoint)
            stats = self._endpoint_stats[endpoint]
            stats.total_requests += 1
            if not allowed:
                stats.rejected += 1
            stats.last_request = now.isoformat()

            # Update token stats
            if token not in self._token_stats:
                self._token_stats[token] = {"requests": 0, "rejected": 0}
            self._token_stats[token]["requests"] += 1
            if not allowed:
                self._token_stats[token]["rejected"] += 1

            # Update IP stats
            if ip not in self._ip_stats:
                self._ip_stats[ip] = {"requests": 0, "rejected": 0}
            self._ip_stats[ip]["requests"] += 1
            if not allowed:
                self._ip_stats[ip]["rejected"] += 1

    def get_overall_stats(self) -> RateLimitStats:
        """Get overall rate limit statistics."""
        with self._lock:
            stats = RateLimitStats()
            stats.total_requests = len(self._request_history)
            stats.allowed_requests = sum(1 for r in self._request_history if r["allowed"])
            stats.rejected_requests = stats.total_requests - stats.allowed_requests
            stats.unique_tokens = len(self._token_stats)
            stats.unique_ips = len(self._ip_stats)

            # Calculate current rate (last 5 minutes)
            now = datetime.now()
            recent = [
                r for r in self._request_history
                if datetime.fromisoformat(r["timestamp"]) > now - timedelta(minutes=5)
            ]
            if recent:
                stats.current_rate = len(recent) / 5.0  # requests per minute

            # Calculate peak rate (1 minute window)
            if self._request_history:
                # Group by minute
                minute_counts = defaultdict(int)
                for r in self._request_history:
                    ts = datetime.fromisoformat(r["timestamp"])
                    minute_key = ts.strftime("%Y-%m-%d %H:%M")
                    minute_counts[minute_key] += 1
                if minute_counts:
                    stats.peak_rate = max(minute_counts.values()) if minute_counts else 0

            # Avg rate
            if stats.total_requests > 0 and self._request_history:
                first_ts = datetime.fromisoformat(self._request_history[0]["timestamp"])
                last_ts = datetime.fromisoformat(self._request_history[-1]["timestamp"])
                duration_minutes = (last_ts - first_ts).total_seconds() / 60
                if duration_minutes > 0:
                    stats.avg_rate = stats.total_requests / duration_minutes

            return stats

    def get_endpoint_stats(self, limit: int = 20) -> List[Dict]:
        """Get per-endpoint statistics."""
        with self._lock:
            results = []
            for endpoint, stats in self._endpoint_stats.items():
                results.append({
                    "endpoint": endpoint,
                    "total_requests": stats.total_requests,
                    "rejected": stats.rejected,
                    "rejection_rate": stats.rejected / stats.total_requests if stats.total_requests > 0 else 0,
                    "last_request": stats.last_request
                })
            return sorted(results, key=lambda x: x["total_requests"], reverse=True)[:limit]

    def get_top_tokens(self, limit: int = 10) -> List[Dict]:
        """Get top tokens by request count."""
        with self._lock:
            results = []
            for token, stats in self._token_stats.items():
                results.append({
                    "token": token[:16] + "..." if len(token) > 16 else token,
                    "requests": stats["requests"],
                    "rejected": stats["rejected"],
                    "rejection_rate": stats["rejected"] / stats["requests"] if stats["requests"] > 0 else 0
                })
            return sorted(results, key=lambda x: x["requests"], reverse=True)[:limit]

    def get_top_ips(self, limit: int = 10) -> List[Dict]:
        """Get top IPs by request count."""
        with self._lock:
            results = []
            for ip, stats in self._ip_stats.items():
                results.append({
                    "ip": ip,
                    "requests": stats["requests"],
                    "rejected": stats["rejected"],
                    "rejection_rate": stats["rejected"] / stats["requests"] if stats["requests"] > 0 else 0
                })
            return sorted(results, key=lambda x: x["requests"], reverse=True)[:limit]

    def get_time_series(
        self,
        time_range: TimeRange = TimeRange.LAST_1H,
        interval: str = "minute"
    ) -> List[Dict]:
        """Get time series data for charts."""
        with self._lock:
            now = datetime.now()
            delta_map = {
                TimeRange.LAST_1H: timedelta(hours=1),
                TimeRange.LAST_24H: timedelta(hours=24),
                TimeRange.LAST_7D: timedelta(days=7),
                TimeRange.LAST_30D: timedelta(days=30),
            }
            start_time = now - delta_map.get(time_range, timedelta(hours=1))

            # Filter by time range
            filtered = [
                r for r in self._request_history
                if datetime.fromisoformat(r["timestamp"]) > start_time
            ]

            # Group by interval
            if interval == "minute":
                key_format = "%Y-%m-%d %H:%M"
            elif interval == "hour":
                key_format = "%Y-%m-%d %H"
            else:
                key_format = "%Y-%m-%d"

            grouped = defaultdict(lambda: {"total": 0, "allowed": 0, "rejected": 0})
            for r in filtered:
                ts = datetime.fromisoformat(r["timestamp"])
                key = ts.strftime(key_format)
                grouped[key]["total"] += 1
                if r["allowed"]:
                    grouped[key]["allowed"] += 1
                else:
                    grouped[key]["rejected"] += 1

            results = []
            for key in sorted(grouped.keys()):
                results.append({
                    "timestamp": key,
                    "total": grouped[key]["total"],
                    "allowed": grouped[key]["allowed"],
                    "rejected": grouped[key]["rejected"]
                })
            return results

    def get_circuit_breakers(self) -> List[Dict]:
        """Get circuit breaker status."""
        try:
            from advanced_rate_limiter import advanced_rate_limiter
            circuits = advanced_rate_limiter.get_all_circuits()
            results = []
            for key, status in circuits.items():
                results.append({
                    "endpoint": key,
                    "state": status.get("state", "unknown"),
                    "failure_count": status.get("failure_count", 0),
                    "success_count": status.get("success_count", 0),
                    "last_failure": status.get("last_failure_time")
                })
            return results
        except Exception:
            return []

    def get_config(self) -> Dict:
        """Get rate limit configuration."""
        try:
            from rate_limiter import rate_limiter
            return {
                "enabled": True,
                "default_limit": 100,
                "window_seconds": 60
            }
        except Exception:
            return {"enabled": False}


# Global dashboard instance
rate_limit_dashboard = RateLimitDashboard()
