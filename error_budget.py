"""Error Budget Module

Error budget calculator and alerting based on SLO (Service Level Objectives) compliance tracking.
"""
import time
import threading
import uuid
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum


class BudgetStatus(str, Enum):
    """Budget status."""
    HEALTHY = "healthy"
    WARNING = "warning"
    CRITICAL = "critical"
    EXHAUSTED = "exhausted"


class AlertState(str, Enum):
    """Alert states."""
    OK = "ok"
    WARNING = "warning"
    CRITICAL = "critical"
    FIRED = "fired"
    RESOLVED = "resolved"


@dataclass
class SLOConfig:
    """SLO (Service Level Objective) configuration."""
    id: str
    name: str
    service: str
    target_availability: float  # e.g., 99.9 for 99.9%
    window_days: int  # Rolling window in days
    error_budget_percent: float  # Allowed error budget percentage
    created_at: float = field(default_factory=time.time)
    enabled: bool = True


@dataclass
class ErrorBudget:
    """Error budget data."""
    slo_id: str
    total_budget_seconds: float
    used_seconds: float
    remaining_seconds: float
    availability: float
    status: BudgetStatus
    period_start: float
    period_end: float


@dataclass
class BudgetAlert:
    """Budget alert."""
    id: str
    slo_id: str
    alert_type: str  # "warning", "critical", "exhausted"
    state: AlertState
    message: str
    threshold: float
    current_value: float
    fired_at: float = None
    resolved_at: float = None


@dataclass
class BudgetReport:
    """Budget report."""
    id: str
    slo_id: str
    slo_name: str
    period_start: float
    period_end: float
    target_availability: float
    actual_availability: float
    total_requests: int
    error_requests: int
    error_budget_used_percent: float
    error_budget_remaining_percent: float
    status: BudgetStatus
    burn_rate: float  # How fast budget is consumed
    alerts: List[BudgetAlert] = field(default_factory=list)


class ErrorBudgetCalculator:
    """Error budget calculator with alerting."""

    def __init__(self):
        self._lock = threading.RLock()
        self._slos: Dict[str, SLOConfig] = {}
        self._alerts: Dict[str, BudgetAlert] = {}
        self._reports: Dict[str, BudgetReport] = {}
        self._metrics: Dict[str, Dict] = {}  # service -> metrics

    def create_slo(
        self,
        name: str,
        service: str,
        target_availability: float,
        window_days: int = 30,
        error_budget_percent: float = 0.1
    ) -> str:
        """Create a new SLO."""
        slo_id = str(uuid.uuid4())[:12]

        slo = SLOConfig(
            id=slo_id,
            name=name,
            service=service,
            target_availability=target_availability,
            window_days=window_days,
            error_budget_percent=error_budget_percent
        )

        with self._lock:
            self._slos[slo_id] = slo

        return slo_id

    def update_slo(
        self,
        slo_id: str,
        name: str = None,
        target_availability: float = None,
        window_days: int = None,
        enabled: bool = None
    ) -> bool:
        """Update SLO configuration."""
        with self._lock:
            slo = self._slos.get(slo_id)
            if not slo:
                return False

            if name is not None:
                slo.name = name
            if target_availability is not None:
                slo.target_availability = target_availability
            if window_days is not None:
                slo.window_days = window_days
            if enabled is not None:
                slo.enabled = enabled

            return True

    def delete_slo(self, slo_id: str) -> bool:
        """Delete an SLO."""
        with self._lock:
            if slo_id in self._slos:
                del self._slos[slo_id]
                return True
            return False

    def record_metrics(self, service: str, total_requests: int, error_requests: int, timestamp: float = None):
        """Record request metrics for a service."""
        timestamp = timestamp or time.time()

        with self._lock:
            if service not in self._metrics:
                self._metrics[service] = {
                    "total_requests": 0,
                    "error_requests": 0,
                    "samples": []
                }

            self._metrics[service]["total_requests"] += total_requests
            self._metrics[service]["error_requests"] += error_requests
            self._metrics[service]["samples"].append({
                "timestamp": timestamp,
                "total": total_requests,
                "errors": error_requests
            })

            # Keep only last 30 days of samples
            cutoff = timestamp - (30 * 86400)
            self._metrics[service]["samples"] = [
                s for s in self._metrics[service]["samples"]
                if s["timestamp"] > cutoff
            ]

    def calculate_budget(self, slo_id: str) -> Optional[ErrorBudget]:
        """Calculate current error budget for an SLO."""
        with self._lock:
            slo = self._slos.get(slo_id)
            if not slo:
                return None

            service = slo.service
            if service not in self._metrics:
                return ErrorBudget(
                    slo_id=slo_id,
                    total_budget_seconds=0,
                    used_seconds=0,
                    remaining_seconds=0,
                    availability=100.0,
                    status=BudgetStatus.HEALTHY,
                    period_start=time.time() - (slo.window_days * 86400),
                    period_end=time.time()
                )

            metrics = self._metrics[service]
            total_requests = metrics["total_requests"]
            error_requests = metrics["error_requests"]

            if total_requests == 0:
                availability = 100.0
            else:
                availability = ((total_requests - error_requests) / total_requests) * 100

            # Calculate time window
            now = time.time()
            window_seconds = slo.window_days * 86400
            period_start = now - window_seconds

            # Calculate error budget
            # target_availability = 99.9% means allowed error is 0.1%
            allowed_error_rate = 100.0 - slo.target_availability
            total_budget_seconds = (allowed_error_rate / 100.0) * window_seconds
            used_seconds = (error_requests / max(1, total_requests)) * window_seconds
            remaining_seconds = max(0, total_budget_seconds - used_seconds)

            # Determine status
            remaining_percent = (remaining_seconds / total_budget_seconds) * 100 if total_budget_seconds > 0 else 100

            if remaining_percent <= 0:
                status = BudgetStatus.EXHAUSTED
            elif remaining_percent <= 10:
                status = BudgetStatus.CRITICAL
            elif remaining_percent <= 30:
                status = BudgetStatus.WARNING
            else:
                status = BudgetStatus.HEALTHY

            return ErrorBudget(
                slo_id=slo_id,
                total_budget_seconds=total_budget_seconds,
                used_seconds=used_seconds,
                remaining_seconds=remaining_seconds,
                availability=availability,
                status=status,
                period_start=period_start,
                period_end=now
            )

    def _check_alerts(self, slo: SLOConfig, budget: ErrorBudget) -> List[BudgetAlert]:
        """Check and generate alerts for budget status."""
        alerts = []
        remaining_percent = (budget.remaining_seconds / budget.total_budget_seconds) * 100 if budget.total_budget_seconds > 0 else 100
        used_percent = 100 - remaining_percent

        alert_configs = [
            ("exhausted", 0, AlertState.CRITICAL, "Error budget exhausted"),
            ("critical", 90, AlertState.CRITICAL, "Error budget critically low"),
            ("warning", 70, AlertState.WARNING, "Error budget warning threshold"),
        ]

        for alert_type, threshold, state, message in alert_configs:
            # Check if alert already exists
            alert_key = f"{slo.id}_{alert_type}"
            existing_alert = self._alerts.get(alert_key)

            if remaining_percent <= threshold:
                if existing_alert and existing_alert.state in [AlertState.WARNING, AlertState.CRITICAL, AlertState.FIRED]:
                    # Alert already fired
                    continue

                alert_id = alert_key if existing_alert else str(uuid.uuid4())[:12]

                alert = BudgetAlert(
                    id=alert_id,
                    slo_id=slo.id,
                    alert_type=alert_type,
                    state=AlertState.FIRED,
                    message=f"{slo.name}: {message} ({remaining_percent:.1f}% remaining)",
                    threshold=threshold,
                    current_value=remaining_percent,
                    fired_at=time.time()
                )

                alerts.append(alert)
                self._alerts[alert_key] = alert

            elif existing_alert and existing_alert.state == AlertState.FIRED:
                # Resolve the alert
                existing_alert.state = AlertState.RESOLVED
                existing_alert.resolved_at = time.time()

        return alerts

    def check_slo(self, slo_id: str) -> Optional[BudgetReport]:
        """Check SLO and generate report."""
        import uuid

        with self._lock:
            slo = self._slos.get(slo_id)
            if not slo:
                return None

        budget = self.calculate_budget(slo_id)
        if not budget:
            return None

        # Generate alerts
        alerts = self._check_alerts(slo, budget)

        # Calculate burn rate (how fast budget is consumed)
        # Simple calculation: current error rate / allowed error rate
        if budget.total_budget_seconds > 0:
            burn_rate = budget.used_seconds / (budget.total_budget_seconds * 0.1)  # Approximate
        else:
            burn_rate = 0

        # Get metrics
        with self._lock:
            metrics = self._metrics.get(slo.service, {})
            total_requests = metrics.get("total_requests", 0)
            error_requests = metrics.get("error_requests", 0)

        used_percent = 100 - ((budget.remaining_seconds / budget.total_budget_seconds) * 100) if budget.total_budget_seconds > 0 else 0

        report = BudgetReport(
            id=str(uuid.uuid4())[:12],
            slo_id=slo.id,
            slo_name=slo.name,
            period_start=budget.period_start,
            period_end=budget.period_end,
            target_availability=slo.target_availability,
            actual_availability=budget.availability,
            total_requests=total_requests,
            error_requests=error_requests,
            error_budget_used_percent=used_percent,
            error_budget_remaining_percent=100 - used_percent,
            status=budget.status,
            burn_rate=burn_rate,
            alerts=alerts
        )

        with self._lock:
            self._reports[report.id] = report

        return report

    def get_slo(self, slo_id: str) -> Optional[SLOConfig]:
        """Get SLO configuration."""
        with self._lock:
            return self._slos.get(slo_id)

    def get_slos(self, service: str = None, enabled: bool = None) -> List[SLOConfig]:
        """Get SLOs with filters."""
        with self._lock:
            slos = list(self._slos.values())

        if service:
            slos = [s for s in slos if s.service == service]
        if enabled is not None:
            slos = [s for s in slos if s.enabled == enabled]

        return slos

    def get_budget(self, slo_id: str) -> Optional[ErrorBudget]:
        """Get current error budget."""
        return self.calculate_budget(slo_id)

    def get_alerts(self, slo_id: str = None, state: AlertState = None) -> List[BudgetAlert]:
        """Get alerts."""
        with self._lock:
            alerts = list(self._alerts.values())

        if slo_id:
            alerts = [a for a in alerts if a.slo_id == slo_id]
        if state:
            alerts = [a for a in alerts if a.state == state]

        return sorted(alerts, key=lambda x: x.fired_at or 0, reverse=True)

    def get_report(self, report_id: str) -> Optional[BudgetReport]:
        """Get a budget report."""
        with self._lock:
            return self._reports.get(report_id)

    def get_reports(self, slo_id: str = None, limit: int = 50) -> List[Dict]:
        """Get recent budget reports."""
        with self._lock:
            reports = sorted(
                self._reports.values(),
                key=lambda x: x.period_end,
                reverse=True
            )

        if slo_id:
            reports = [r for r in reports if r.slo_id == slo_id]

        return [
            {
                "id": r.id,
                "slo_id": r.slo_id,
                "slo_name": r.slo_name,
                "period_start": r.period_start,
                "period_end": r.period_end,
                "target_availability": r.target_availability,
                "actual_availability": r.actual_availability,
                "error_budget_used_percent": r.error_budget_used_percent,
                "status": r.status.value
            }
            for r in reports[:limit]
        ]

    def get_stats(self) -> Dict:
        """Get error budget statistics."""
        with self._lock:
            total_slos = len(self._slos)
            enabled_slos = sum(1 for s in self._slos.values() if s.enabled)
            total_alerts = len(self._alerts)
            firing_alerts = sum(1 for a in self._alerts.values() if a.state == AlertState.FIRED)

            # Calculate overall health
            budgets = [self.calculate_budget(s.id) for s in self._slos.values() if s.enabled]
            healthy = sum(1 for b in budgets if b and b.status == BudgetStatus.HEALTHY)
            warning = sum(1 for b in budgets if b and b.status == BudgetStatus.WARNING)
            critical = sum(1 for b in budgets if b and b.status == BudgetStatus.CRITICAL)
            exhausted = sum(1 for b in budgets if b and b.status == BudgetStatus.EXHAUSTED)

            return {
                "total_slos": total_slos,
                "enabled_slos": enabled_slos,
                "total_alerts": total_alerts,
                "firing_alerts": firing_alerts,
                "budget_health": {
                    "healthy": healthy,
                    "warning": warning,
                    "critical": critical,
                    "exhausted": exhausted
                }
            }


# Global error budget calculator instance
error_budget = ErrorBudgetCalculator()
