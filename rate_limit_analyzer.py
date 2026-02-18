"""Rate Limit Analyzer Module

API rate limit pattern analysis and visualization.
"""
import threading
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import defaultdict


@dataclass
class RateLimitPattern:
    """Rate limit pattern."""
    endpoint: str
    method: str
    avg_requests_per_minute: float
    peak_requests_per_minute: float
    unique_users: int
    unique_ips: int
    rejection_rate: float
    time_window: str


@dataclass
class RateLimitInsight:
    """Rate limit insight."""
    type: str  # spike, bottleneck, unusual
    severity: str  # low, medium, high
    description: str
    endpoint: str
    recommendation: str


class RateLimitAnalyzer:
    """API rate limit pattern analyzer."""

    def __init__(self):
        self._lock = threading.RLock()
        self._requests: List[Dict] = []
        self._max_requests = 50000

    def record_request(
        self,
        endpoint: str,
        method: str,
        user_id: str,
        ip: str,
        allowed: bool,
        rate_limit: int
    ):
        """Record a request for analysis."""
        record = {
            "timestamp": datetime.now(),
            "endpoint": endpoint,
            "method": method,
            "user_id": user_id,
            "ip": ip,
            "allowed": allowed,
            "rate_limit": rate_limit
        }

        with self._lock:
            self._requests.append(record)
            if len(self._requests) > self._max_requests:
                self._requests = self._requests[-self._max_requests:]

    def analyze_patterns(self, time_window_minutes: int = 60) -> List[RateLimitPattern]:
        """Analyze rate limit patterns."""
        with self._lock:
            if not self._requests:
                return []

            # Filter by time window
            cutoff = datetime.now() - timedelta(minutes=time_window_minutes)
            recent = [r for r in self._requests if r["timestamp"] > cutoff]

            if not recent:
                return []

            # Group by endpoint+method
            by_endpoint = defaultdict(lambda: {
                "requests": 0,
                "allowed": 0,
                "rejected": 0,
                "users": set(),
                "ips": set(),
                "timestamps": []
            })

            for r in recent:
                key = f"{r['method']}:{r['endpoint']}"
                by_endpoint[key]["requests"] += 1
                if r["allowed"]:
                    by_endpoint[key]["allowed"] += 1
                else:
                    by_endpoint[key]["rejected"] += 1
                by_endpoint[key]["users"].add(r["user_id"])
                by_endpoint[key]["ips"].add(r["ip"])
                by_endpoint[key]["timestamps"].append(r["timestamp"])

            patterns = []
            for key, data in by_endpoint.items():
                method, endpoint = key.split(":", 1)

                # Calculate rates
                total = data["requests"]
                window_minutes = time_window_minutes
                avg_rate = total / window_minutes

                # Find peak (1-minute window)
                timestamps = sorted(data["timestamps"])
                if timestamps:
                    minute_counts = defaultdict(int)
                    for ts in timestamps:
                        minute_key = ts.strftime("%Y-%m-%d %H:%M")
                        minute_counts[minute_key] += 1
                    peak_rate = max(minute_counts.values()) if minute_counts else 0
                else:
                    peak_rate = 0

                rejection_rate = data["rejected"] / total if total > 0 else 0

                patterns.append(RateLimitPattern(
                    endpoint=endpoint,
                    method=method,
                    avg_requests_per_minute=avg_rate,
                    peak_requests_per_minute=peak_rate,
                    unique_users=len(data["users"]),
                    unique_ips=len(data["ips"]),
                    rejection_rate=rejection_rate,
                    time_window=f"{time_window_minutes}m"
                ))

            return sorted(patterns, key=lambda x: x.avg_requests_per_minute, reverse=True)

    def detect_insights(self) -> List[RateLimitInsight]:
        """Detect rate limit insights."""
        patterns = self.analyze_patterns()
        insights = []

        for pattern in patterns:
            # High rejection rate
            if pattern.rejection_rate > 0.1:
                insights.append(RateLimitInsight(
                    type="high_rejection",
                    severity="high" if pattern.rejection_rate > 0.3 else "medium",
                    description=f"High rejection rate: {pattern.rejection_rate*100:.1f}% on {pattern.method} {pattern.endpoint}",
                    endpoint=pattern.endpoint,
                    recommendation="Increase rate limit or optimize client usage"
                ))

            # High peak rate
            if pattern.peak_requests_per_minute > pattern.avg_requests_per_minute * 3:
                insights.append(RateLimitInsight(
                    type="spike",
                    severity="medium",
                    description=f"Request spike detected: {pattern.peak_requests_per_minute} req/min (avg: {pattern.avg_requests_per_minute:.1f})",
                    endpoint=pattern.endpoint,
                    recommendation="Consider implementing gradual rollout or caching"
                ))

            # High concentration from single user/IP
            if pattern.unique_users == 1 and pattern.avg_requests_per_minute > 10:
                insights.append(RateLimitInsight(
                    type="single_user",
                    severity="low",
                    description=f"High usage from single user on {pattern.endpoint}",
                    endpoint=pattern.endpoint,
                    recommendation="Review for potential abuse or legitimate batch processing"
                ))

        return insights

    def get_top_endpoints(self, limit: int = 10) -> List[Dict]:
        """Get top endpoints by request count."""
        patterns = self.analyze_patterns()
        return [
            {
                "endpoint": p.endpoint,
                "method": p.method,
                "avg_requests_per_minute": p.avg_requests_per_minute,
                "peak_requests_per_minute": p.peak_requests_per_minute,
                "rejection_rate": p.rejection_rate,
                "unique_users": p.unique_users
            }
            for p in patterns[:limit]
        ]

    def get_time_series(self, interval_minutes: int = 5) -> List[Dict]:
        """Get time series data for rate limits."""
        with self._lock:
            if not self._requests:
                return []

            # Get recent 24 hours
            cutoff = datetime.now() - timedelta(hours=24)
            recent = [r for r in self._requests if r["timestamp"] > cutoff]

            # Group by interval
            grouped = defaultdict(lambda: {"total": 0, "allowed": 0, "rejected": 0})
            for r in recent:
                ts = r["timestamp"]
                minute = (ts.minute // interval_minutes) * interval_minutes
                key = ts.replace(minute=minute, second=0, microsecond=0)
                grouped[key]["total"] += 1
                if r["allowed"]:
                    grouped[key]["allowed"] += 1
                else:
                    grouped[key]["rejected"] += 1

            return [
                {
                    "timestamp": k.isoformat(),
                    "total": v["total"],
                    "allowed": v["allowed"],
                    "rejected": v["rejected"],
                    "rejection_rate": v["rejected"] / v["total"] if v["total"] > 0 else 0
                }
                for k, v in sorted(grouped.items())
            ]

    def get_stats(self) -> Dict:
        """Get rate limit analysis statistics."""
        with self._lock:
            total = len(self._requests)
            allowed = sum(1 for r in self._requests if r["allowed"])
            rejected = total - allowed

            unique_endpoints = len(set(r["endpoint"] for r in self._requests))
            unique_users = len(set(r["user_id"] for r in self._requests))
            unique_ips = len(set(r["ip"] for r in self._requests))

            return {
                "total_requests": total,
                "allowed_requests": allowed,
                "rejected_requests": rejected,
                "rejection_rate": rejected / total if total > 0 else 0,
                "unique_endpoints": unique_endpoints,
                "unique_users": unique_users,
                "unique_ips": unique_ips
            }


# Global rate limit analyzer
rate_limit_analyzer = RateLimitAnalyzer()
