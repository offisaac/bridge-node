"""Alert Dashboard Module

Centralized alert management dashboard.
"""
import threading
import time
import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid


class AlertSeverity(str, Enum):
    """Alert severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class AlertStatus(str, Enum):
    """Alert status."""
    FIRING = "firing"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    SILENCED = "silenced"


class AlertSource(str, Enum):
    """Alert sources."""
    SYSTEM = "system"
    MONITORING = "monitoring"
    SECURITY = "security"
    PERFORMANCE = "performance"
    CUSTOM = "custom"


@dataclass
class Alert:
    """Alert record."""
    id: str
    title: str
    description: str
    severity: AlertSeverity
    status: AlertStatus
    source: AlertSource
    timestamp: float
    acknowledged_at: Optional[float] = None
    resolved_at: Optional[float] = None
    acknowledged_by: Optional[str] = None
    resolved_by: Optional[str] = None
    tags: Dict = field(default_factory=dict)
    metadata: Dict = field(default_factory=dict)
    annotations: Dict = field(default_factory=dict)


@dataclass
class AlertRule:
    """Alert rule."""
    id: str
    name: str
    condition: str
    severity: AlertSeverity
    enabled: bool
    cooldown_seconds: int
    tags: Dict = field(default_factory=dict)


@dataclass
class Silence:
    """Alert silence."""
    id: str
    matchers: Dict
    start_time: float
    end_time: float
    created_by: str
    reason: str


class AlertDashboard:
    """Centralized alert management dashboard."""

    def __init__(self):
        self._lock = threading.RLock()
        self._alerts: List[Alert] = []
        self._rules: Dict[str, AlertRule] = {}
        self._silences: Dict[str, Silence] = {}
        self._max_alerts = 10000
        self._callbacks: List[callable] = []

    def create_alert(
        self,
        title: str,
        description: str,
        severity: AlertSeverity,
        source: AlertSource,
        tags: Dict = None,
        metadata: Dict = None,
        annotations: Dict = None
    ) -> str:
        """Create a new alert."""
        alert_id = str(uuid.uuid4())[:12]

        alert = Alert(
            id=alert_id,
            title=title,
            description=description,
            severity=severity,
            status=AlertStatus.FIRING,
            source=source,
            timestamp=time.time(),
            tags=tags or {},
            metadata=metadata or {},
            annotations=annotations or {}
        )

        with self._lock:
            self._alerts.append(alert)

            # Trim old alerts
            if len(self._alerts) > self._max_alerts:
                self._alerts = self._alerts[-self._max_alerts:]

        # Trigger callbacks
        self._trigger_callbacks(alert)

        return alert_id

    def acknowledge_alert(
        self,
        alert_id: str,
        acknowledged_by: str
    ) -> bool:
        """Acknowledge an alert."""
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id:
                    alert.status = AlertStatus.ACKNOWLEDGED
                    alert.acknowledged_at = time.time()
                    alert.acknowledged_by = acknowledged_by
                    return True
            return False

    def resolve_alert(
        self,
        alert_id: str,
        resolved_by: str
    ) -> bool:
        """Resolve an alert."""
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id:
                    alert.status = AlertStatus.RESOLVED
                    alert.resolved_at = time.time()
                    alert.resolved_by = resolved_by
                    return True
            return False

    def silence_alert(
        self,
        alert_id: str,
        duration_seconds: int,
        reason: str,
        created_by: str
    ) -> Optional[str]:
        """Silence an alert."""
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id:
                    alert.status = AlertStatus.SILENCED

                    silence_id = str(uuid.uuid4())[:12]
                    silence = Silence(
                        id=silence_id,
                        matchers={"alert_id": alert_id},
                        start_time=time.time(),
                        end_time=time.time() + duration_seconds,
                        created_by=created_by,
                        reason=reason
                    )
                    self._silences[silence_id] = silence
                    return silence_id
            return None

    def get_alert(self, alert_id: str) -> Optional[Dict]:
        """Get a specific alert."""
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id:
                    return self._serialize_alert(alert)
        return None

    def get_alerts(
        self,
        severity: AlertSeverity = None,
        status: AlertStatus = None,
        source: AlertSource = None,
        acknowledged_by: str = None,
        start_time: float = None,
        end_time: float = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """Get alerts with filters."""
        with self._lock:
            alerts = list(self._alerts)

        if severity:
            alerts = [a for a in alerts if a.severity == severity]
        if status:
            alerts = [a for a in alerts if a.status == status]
        if source:
            alerts = [a for a in alerts if a.source == source]
        if acknowledged_by:
            alerts = [a for a in alerts if a.acknowledged_by == acknowledged_by]
        if start_time:
            alerts = [a for a in alerts if a.timestamp >= start_time]
        if end_time:
            alerts = [a for a in alerts if a.timestamp <= end_time]

        alerts.sort(key=lambda a: a.timestamp, reverse=True)

        return [self._serialize_alert(a) for a in alerts[offset:offset + limit]]

    def get_firing_alerts(self) -> List[Dict]:
        """Get all firing alerts."""
        return self.get_alerts(status=AlertStatus.FIRING, limit=1000)

    def get_alert_stats(self) -> Dict:
        """Get alert statistics."""
        with self._lock:
            alerts = list(self._alerts)

        total = len(alerts)
        by_severity = {s.value: 0 for s in AlertSeverity}
        by_status = {s.value: 0 for s in AlertStatus}
        by_source = {}
        firing_count = 0

        for alert in alerts:
            by_severity[alert.severity.value] += 1
            by_status[alert.status.value] += 1
            by_source[alert.source.value] = by_source.get(alert.source.value, 0) + 1

            if alert.status == AlertStatus.FIRING:
                firing_count += 1

        return {
            "total_alerts": total,
            "firing": firing_count,
            "acknowledged": by_status.get(AlertStatus.ACKNOWLEDGED.value, 0),
            "resolved": by_status.get(AlertStatus.RESOLVED.value, 0),
            "by_severity": by_severity,
            "by_source": by_source
        }

    def create_rule(
        self,
        name: str,
        condition: str,
        severity: AlertSeverity,
        cooldown_seconds: int = 300,
        tags: Dict = None
    ) -> str:
        """Create an alert rule."""
        rule_id = str(uuid.uuid4())[:12]

        rule = AlertRule(
            id=rule_id,
            name=name,
            condition=condition,
            severity=severity,
            enabled=True,
            cooldown_seconds=cooldown_seconds,
            tags=tags or {}
        )

        with self._lock:
            self._rules[rule_id] = rule

        return rule_id

    def get_rules(self, enabled: bool = None) -> List[Dict]:
        """Get alert rules."""
        with self._lock:
            rules = list(self._rules.values())

        if enabled is not None:
            rules = [r for r in rules if r.enabled == enabled]

        return [
            {
                "id": r.id,
                "name": r.name,
                "condition": r.condition,
                "severity": r.severity.value,
                "enabled": r.enabled,
                "cooldown_seconds": r.cooldown_seconds,
                "tags": r.tags
            }
            for r in rules
        ]

    def toggle_rule(self, rule_id: str, enabled: bool) -> bool:
        """Enable or disable a rule."""
        with self._lock:
            if rule_id in self._rules:
                self._rules[rule_id].enabled = enabled
                return True
        return False

    def get_timeline(self, time_window: int = 86400) -> List[Dict]:
        """Get alert timeline."""
        now = time.time()
        cutoff = now - time_window

        alerts = self.get_alerts(start_time=cutoff, limit=10000)

        # Group by hour
        timeline = {}
        for alert in alerts:
            hour = int(alert["timestamp"] / 3600) * 3600

            if hour not in timeline:
                timeline[hour] = {
                    "timestamp": hour,
                    "count": 0,
                    "by_severity": {s.value: 0 for s in AlertSeverity},
                    "by_status": {s.value: 0 for s in AlertStatus}
                }

            timeline[hour]["count"] += 1
            timeline[hour]["by_severity"][alert["severity"]] += 1
            timeline[hour]["by_status"][alert["status"]] += 1

        return sorted(timeline.values(), key=lambda x: x["timestamp"])

    def get_dashboard_summary(self) -> Dict:
        """Get dashboard summary."""
        firing = self.get_firing_alerts()

        critical_count = sum(1 for a in firing if a["severity"] == AlertSeverity.CRITICAL.value)
        high_count = sum(1 for a in firing if a["severity"] == AlertSeverity.HIGH.value)

        return {
            "firing_count": len(firing),
            "critical_count": critical_count,
            "high_count": high_count,
            "recent_firing": firing[:5],
            "stats": self.get_alert_stats(),
            "timeline": self.get_timeline(3600)
        }

    def add_callback(self, callback: callable):
        """Add alert callback."""
        self._callbacks.append(callback)

    def _trigger_callbacks(self, alert: Alert):
        """Trigger alert callbacks."""
        for callback in self._callbacks:
            try:
                callback(alert)
            except Exception:
                pass

    def _serialize_alert(self, alert: Alert) -> Dict:
        """Serialize an alert."""
        return {
            "id": alert.id,
            "title": alert.title,
            "description": alert.description,
            "severity": alert.severity.value,
            "status": alert.status.value,
            "source": alert.source.value,
            "timestamp": alert.timestamp,
            "acknowledged_at": alert.acknowledged_at,
            "resolved_at": alert.resolved_at,
            "acknowledged_by": alert.acknowledged_by,
            "resolved_by": alert.resolved_by,
            "tags": alert.tags,
            "metadata": alert.metadata,
            "annotations": alert.annotations
        }


# Global alert dashboard
alert_dashboard = AlertDashboard()


# Initialize with sample alerts
def init_sample_alerts():
    """Initialize sample alerts."""
    alert_dashboard.create_alert(
        title="High CPU Usage",
        description="CPU usage exceeded 90%",
        severity=AlertSeverity.HIGH,
        source=AlertSource.PERFORMANCE,
        tags={"host": "server-01", "metric": "cpu"}
    )

    alert_dashboard.create_alert(
        title="Memory Warning",
        description="Memory usage above 85%",
        severity=AlertSeverity.MEDIUM,
        source=AlertSource.PERFORMANCE,
        tags={"host": "server-02", "metric": "memory"}
    )

    alert_dashboard.create_alert(
        title="Disk Space Low",
        description="Disk usage above 90%",
        severity=AlertSeverity.CRITICAL,
        source=AlertSource.SYSTEM,
        tags={"host": "server-01", "disk": "/"}
    )


init_sample_alerts()
