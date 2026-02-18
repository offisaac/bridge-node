"""Log Analyzer Module

AI-powered log analysis and anomaly detection.
"""
import re
import threading
import time
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from collections import defaultdict
import uuid


class LogLevel(str, Enum):
    """Log levels."""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class AnomalyType(str, Enum):
    """Types of anomalies detected."""
    SPIKE = "spike"
    PATTERN = "pattern"
    ERROR_RATE = "error_rate"
    LATENCY = "latency"
    UNUSUAL = "unusual"


@dataclass
class LogEntry:
    """Log entry."""
    id: str
    timestamp: str
    level: str
    message: str
    source: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LogPattern:
    """Detected log pattern."""
    pattern: str
    count: int
    first_seen: str
    last_seen: str
    severity: str


@dataclass
class Anomaly:
    """Detected anomaly."""
    id: str
    type: AnomalyType
    severity: str
    description: str
    timestamp: str
    details: Dict[str, Any] = field(default_factory=dict)


class LogAnalyzer:
    """AI-powered log analyzer."""

    def __init__(self, max_entries: int = 50000):
        self.max_entries = max_entries
        self._lock = threading.RLock()
        self._logs: List[LogEntry] = []
        self._patterns: List[LogPattern] = []
        self._anomalies: List[Anomaly] = []

        # Thresholds for anomaly detection
        self.error_rate_threshold = 0.1  # 10% errors
        self.latency_threshold_ms = 1000
        self.spike_multiplier = 3.0  # 3x normal

    def ingest_log(
        self,
        message: str,
        level: str = "info",
        source: str = "",
        metadata: Dict[str, Any] = None
    ):
        """Ingest a log entry."""
        entry = LogEntry(
            id=str(uuid.uuid4())[:8],
            timestamp=datetime.now().isoformat(),
            level=level.lower(),
            message=message,
            source=source,
            metadata=metadata or {}
        )

        with self._lock:
            self._logs.append(entry)

            # Trim logs
            if len(self._logs) > self.max_entries:
                self._logs = self._logs[-self.max_entries:]

        # Check for anomalies
        self._check_anomalies(entry)

    def _check_anomalies(self, entry: LogEntry):
        """Check for anomalies after adding entry."""
        now = datetime.now()
        recent_window = now - timedelta(minutes=5)
        older_window = now - timedelta(minutes=10)

        # Get recent logs
        recent_logs = [
            l for l in self._logs
            if datetime.fromisoformat(l.timestamp) > recent_window
        ]
        older_logs = [
            l for l in self._logs
            if older_window < datetime.fromisoformat(l.timestamp) <= recent_window
        ]

        # Check error rate spike
        if len(older_logs) > 0:
            recent_error_rate = sum(1 for l in recent_logs if l.level == "error") / len(recent_logs)
            older_error_rate = sum(1 for l in older_logs if l.level == "error") / len(older_logs)

            if older_error_rate > 0 and recent_error_rate > older_error_rate * self.spike_multiplier:
                self._record_anomaly(
                    AnomalyType.ERROR_RATE,
                    "high",
                    f"Error rate spike detected: {recent_error_rate*100:.1f}% (was {older_error_rate*100:.1f}%)",
                    {"recent_rate": recent_error_rate, "older_rate": older_error_rate}
                )

        # Check for unusual error count
        error_count = sum(1 for l in recent_logs if l.level in ["error", "critical"])
        if error_count >= 10:
            self._record_anomaly(
                AnomalyType.SPIKE,
                "high",
                f"High error count: {error_count} errors in last 5 minutes",
                {"error_count": error_count}
            )

        # Check for specific error patterns
        error_keywords = ["exception", "fail", "timeout", "crash", "out of memory"]
        for keyword in error_keywords:
            if keyword in entry.message.lower() and entry.level in ["error", "critical"]:
                self._detect_pattern(entry, keyword)

    def _detect_pattern(self, entry: LogEntry, keyword: str):
        """Detect patterns in errors."""
        # Simple pattern extraction
        pattern = re.sub(r'\d+\.\d+\.\d+\.\d+', '<IP>', entry.message)
        pattern = re.sub(r'\d+', '<N>', pattern)

        # Check if pattern exists
        existing = next((p for p in self._patterns if p.pattern == pattern), None)

        if existing:
            existing.count += 1
            existing.last_seen = entry.timestamp
        else:
            self._patterns.append(LogPattern(
                pattern=pattern,
                count=1,
                first_seen=entry.timestamp,
                last_seen=entry.timestamp,
                severity=entry.level
            ))

        # Alert on repeated patterns
        if existing and existing.count >= 5:
            self._record_anomaly(
                AnomalyType.PATTERN,
                "medium",
                f"Repeated error pattern: {keyword}",
                {"pattern": pattern, "count": existing.count}
            )

    def _record_anomaly(self, atype: AnomalyType, severity: str, description: str, details: Dict):
        """Record an anomaly."""
        anomaly = Anomaly(
            id=str(uuid.uuid4())[:8],
            type=atype,
            severity=severity,
            description=description,
            timestamp=datetime.now().isoformat(),
            details=details
        )
        self._anomalies.append(anomaly)

        # Keep last 100 anomalies
        if len(self._anomalies) > 100:
            self._anomalies = self._anomalies[-100:]

    def get_logs(
        self,
        level: str = None,
        source: str = None,
        search: str = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get logs with filters."""
        with self._lock:
            logs = self._logs.copy()

        if level:
            logs = [l for l in logs if l.level == level.lower()]
        if source:
            logs = [l for l in logs if l.source == source]
        if search:
            logs = [l for l in logs if search.lower() in l.message.lower()]

        logs = sorted(logs, key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "id": l.id,
                "timestamp": l.timestamp,
                "level": l.level,
                "message": l.message,
                "source": l.source,
                "metadata": l.metadata
            }
            for l in logs[:limit]
        ]

    def get_patterns(self, limit: int = 20) -> List[Dict]:
        """Get detected log patterns."""
        with self._lock:
            patterns = sorted(self._patterns, key=lambda x: x.count, reverse=True)

        return [
            {
                "pattern": p.pattern,
                "count": p.count,
                "first_seen": p.first_seen,
                "last_seen": p.last_seen,
                "severity": p.severity
            }
            for p in patterns[:limit]
        ]

    def get_anomalies(self, limit: int = 50) -> List[Dict]:
        """Get detected anomalies."""
        with self._lock:
            anomalies = sorted(self._anomalies, key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "id": a.id,
                "type": a.type.value,
                "severity": a.severity,
                "description": a.description,
                "timestamp": a.timestamp,
                "details": a.details
            }
            for a in anomalies[:limit]
        ]

    def get_stats(self) -> Dict:
        """Get log statistics."""
        with self._lock:
            total = len(self._logs)
            by_level = defaultdict(int)
            by_source = defaultdict(int)

            for log in self._logs:
                by_level[log.level] += 1
                if log.source:
                    by_source[log.source] += 1

            return {
                "total_logs": total,
                "by_level": dict(by_level),
                "by_source": dict(by_source),
                "patterns_count": len(self._patterns),
                "anomalies_count": len(self._anomalies)
            }

    def analyze(self) -> Dict:
        """Perform AI-powered analysis."""
        stats = self.get_stats()

        # Generate insights
        insights = []

        # Check error rate
        if stats["total_logs"] > 0:
            error_rate = stats["by_level"].get("error", 0) / stats["total_logs"]
            if error_rate > 0.05:
                insights.append({
                    "type": "error_rate",
                    "severity": "high" if error_rate > 0.1 else "medium",
                    "message": f"Error rate is {error_rate*100:.1f}%",
                    "recommendation": "Investigate recent errors"
                })

        # Check for pattern insights
        if self._patterns:
            top_pattern = max(self._patterns, key=lambda x: x.count)
            if top_pattern.count > 10:
                insights.append({
                    "type": "pattern",
                    "severity": "medium",
                    "message": f"Repeated pattern: {top_pattern.pattern[:50]}...",
                    "recommendation": "Consider fixing root cause"
                })

        # Check for anomaly insights
        recent_anomalies = [
            a for a in self._anomalies
            if datetime.fromisoformat(a.timestamp) > datetime.now() - timedelta(hours=1)
        ]
        if recent_anomalies:
            insights.append({
                "type": "anomaly",
                "severity": "high",
                "message": f"{len(recent_anomalies)} anomalies in last hour",
                "recommendation": "Review anomaly details"
            })

        return {
            "stats": stats,
            "insights": insights,
            "recommendations": [i["recommendation"] for i in insights]
        }


# Global log analyzer instance
log_analyzer = LogAnalyzer()
