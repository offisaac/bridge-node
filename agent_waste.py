"""Agent Waste Module

Waste detection system for agents including idle resource detection, unused capacity analysis,
cost optimization recommendations, and resource efficiency scoring.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class WasteType(str, Enum):
    """Types of waste."""
    IDLE_RESOURCE = "idle_resource"
    UNUSED_CAPACITY = "unused_capacity"
    OVER_PROVISIONED = "over_provisioned"
    DUPLICATE_WORK = "duplicate_work"
    INEFFICIENT_PROCESS = "inefficient_process"
    ORPHANED_RESOURCE = "orphaned_resource"
    UNOPTIMIZED_STORAGE = "unoptimized_storage"
    UNUSED_LICENSE = "unused_license"


class WasteSeverity(str, Enum):
    """Waste severity levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ResourceCategory(str, Enum):
    """Resource categories."""
    COMPUTE = "compute"
    STORAGE = "storage"
    NETWORK = "network"
    DATABASE = "database"
    LICENSE = "license"
    API = "api"
    OTHER = "other"


@dataclass
class WasteDetection:
    """Detected waste item."""
    id: str
    waste_type: WasteType
    resource_id: str
    resource_name: str
    category: ResourceCategory
    severity: WasteSeverity
    description: str
    potential_savings: float
    currency: str = "USD"
    detected_at: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ResourceUsage:
    """Resource usage data."""
    resource_id: str
    resource_name: str
    category: ResourceCategory
    allocated: float
    used: float = 0.0
    idle_time: float = 0.0
    last_used: float = 0.0
    efficiency_score: float = 100.0


@dataclass
class WasteConfig:
    """Waste detection configuration."""
    idle_threshold_hours: float = 24.0
    utilization_threshold_percent: float = 10.0
    min_potential_savings: float = 10.0
    enable_cost_analysis: bool = True
    enable_recommendations: bool = True
    scan_interval_hours: float = 1.0


@dataclass
class WasteReport:
    """Waste analysis report."""
    id: str
    generated_at: float = field(default_factory=time.time)
    total_waste_items: int = 0
    total_potential_savings: float = 0.0
    waste_by_type: Dict[str, int] = field(default_factory=dict)
    waste_by_severity: Dict[str, int] = field(default_factory=dict)
    recommendations: List[str] = field(default_factory=list)


@dataclass
class EfficiencyMetrics:
    """Resource efficiency metrics."""
    overall_efficiency: float = 100.0
    wasted_resources: int = 0
    idle_resources: int = 0
    over_provisioned: int = 0
    avg_utilization: float = 0.0


class WasteDetector:
    """Waste detection engine."""

    def __init__(self, config: WasteConfig):
        self.config = config
        self._lock = threading.RLock()
        self._resources: Dict[str, ResourceUsage] = {}
        self._waste_items: List[WasteDetection] = []
        self._historical_waste: List[WasteReport] = []
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_resource(
        self,
        resource_id: str,
        resource_name: str,
        category: ResourceCategory,
        allocated: float,
        used: float = 0.0,
        idle_time: float = 0.0,
        last_used: float = 0.0
    ):
        """Add a resource to track."""
        with self._lock:
            # Calculate efficiency score
            efficiency = 100.0
            if allocated > 0:
                efficiency = (used / allocated) * 100

            resource = ResourceUsage(
                resource_id=resource_id,
                resource_name=resource_name,
                category=category,
                allocated=allocated,
                used=used,
                idle_time=idle_time,
                last_used=last_used,
                efficiency_score=efficiency
            )

            self._resources[resource_id] = resource

    def remove_resource(self, resource_id: str) -> bool:
        """Remove a resource."""
        with self._lock:
            if resource_id in self._resources:
                del self._resources[resource_id]
                return True
            return False

    def update_resource_usage(
        self,
        resource_id: str,
        used: float = None,
        idle_time: float = None,
        last_used: float = None
    ) -> bool:
        """Update resource usage."""
        with self._lock:
            resource = self._resources.get(resource_id)
            if not resource:
                return False

            if used is not None:
                resource.used = used
            if idle_time is not None:
                resource.idle_time = idle_time
            if last_used is not None:
                resource.last_used = last_used

            # Recalculate efficiency
            if resource.allocated > 0:
                resource.efficiency_score = (resource.used / resource.allocated) * 100

            return True

    def detect_idle_resources(self) -> List[WasteDetection]:
        """Detect idle resources."""
        waste_items = []

        with self._lock:
            for resource in self._resources.values():
                # Check if resource is idle
                is_idle = (
                    resource.idle_time >= self.config.idle_threshold_hours * 3600 or
                    (time.time() - resource.last_used) >= self.config.idle_threshold_hours * 3600
                )

                if is_idle:
                    # Calculate potential savings (assume hourly cost = allocated / 30 days)
                    hourly_cost = resource.allocated / (30 * 24)
                    potential_savings = hourly_cost * self.config.idle_threshold_hours

                    if potential_savings >= self.config.min_potential_savings:
                        severity = WasteSeverity.LOW
                        if resource.idle_time >= 168 * 3600:  # 1 week
                            severity = WasteSeverity.HIGH
                        elif resource.idle_time >= 72 * 3600:  # 3 days
                            severity = WasteSeverity.MEDIUM

                        waste = WasteDetection(
                            id=str(uuid.uuid4())[:8],
                            waste_type=WasteType.IDLE_RESOURCE,
                            resource_id=resource.resource_id,
                            resource_name=resource.resource_name,
                            category=resource.category,
                            severity=severity,
                            description=f"Resource idle for {resource.idle_time / 3600:.1f} hours",
                            potential_savings=potential_savings,
                            metadata={"idle_hours": resource.idle_time / 3600}
                        )
                        waste_items.append(waste)

        return waste_items

    def detect_unused_capacity(self) -> List[WasteDetection]:
        """Detect unused capacity."""
        waste_items = []

        with self._lock:
            for resource in self._resources.values():
                utilization = 0.0
                if resource.allocated > 0:
                    utilization = (resource.used / resource.allocated) * 100

                # Check if utilization is below threshold
                if utilization < self.config.utilization_threshold_percent and resource.allocated > 0:
                    unused_amount = resource.allocated - resource.used
                    potential_savings = (unused_amount / resource.allocated) * resource.allocated * 0.5  # Assume 50% cost reduction

                    if potential_savings >= self.config.min_potential_savings:
                        severity = WasteSeverity.LOW
                        if utilization < 5:
                            severity = WasteSeverity.HIGH
                        elif utilization < 10:
                            severity = WasteSeverity.MEDIUM

                        waste = WasteDetection(
                            id=str(uuid.uuid4())[:8],
                            waste_type=WasteType.UNUSED_CAPACITY,
                            resource_id=resource.resource_id,
                            resource_name=resource.resource_name,
                            category=resource.category,
                            severity=severity,
                            description=f"Only {utilization:.1f}% capacity utilized",
                            potential_savings=potential_savings,
                            metadata={
                                "utilization": utilization,
                                "unused_amount": unused_amount
                            }
                        )
                        waste_items.append(waste)

        return waste_items

    def detect_over_provisioned(self) -> List[WasteDetection]:
        """Detect over-provisioned resources."""
        waste_items = []

        with self._lock:
            for resource in self._resources.values():
                # If allocated is much higher than used
                if resource.allocated > 0 and resource.used > 0:
                    ratio = resource.allocated / resource.used

                    if ratio > 3:  # Allocated 3x more than used
                        unused = resource.allocated - resource.used
                        potential_savings = unused * 0.7  # Assume 70% cost savings

                        if potential_savings >= self.config.min_potential_savings:
                            severity = WasteSeverity.MEDIUM
                            if ratio > 10:
                                severity = WasteSeverity.CRITICAL
                            elif ratio > 5:
                                severity = WasteSeverity.HIGH

                            waste = WasteDetection(
                                id=str(uuid.uuid4())[:8],
                                waste_type=WasteType.OVER_PROVISIONED,
                                resource_id=resource.resource_id,
                                resource_name=resource.resource_name,
                                category=resource.category,
                                severity=severity,
                                description=f"Resource provisioned {ratio:.1f}x above usage",
                                potential_savings=potential_savings,
                                metadata={
                                    "ratio": ratio,
                                    "unused": unused
                                }
                            )
                            waste_items.append(waste)

        return waste_items

    def scan_all(self) -> List[WasteDetection]:
        """Scan for all types of waste."""
        waste_items = []

        # Detect all waste types
        waste_items.extend(self.detect_idle_resources())
        waste_items.extend(self.detect_unused_capacity())
        waste_items.extend(self.detect_over_provisioned())

        with self._lock:
            self._waste_items = waste_items

        return waste_items

    def get_waste_items(self, waste_type: WasteType = None, severity: WasteSeverity = None) -> List[WasteDetection]:
        """Get waste items with optional filters."""
        with self._lock:
            items = self._waste_items

            if waste_type:
                items = [w for w in items if w.waste_type == waste_type]
            if severity:
                items = [w for w in items if w.severity == severity]

            return items

    def get_efficiency_metrics(self) -> EfficiencyMetrics:
        """Calculate efficiency metrics."""
        with self._lock:
            metrics = EfficiencyMetrics()

            if not self._resources:
                return metrics

            total_efficiency = 0.0
            for resource in self._resources.values():
                total_efficiency += resource.efficiency_score

                if resource.efficiency_score < self.config.utilization_threshold_percent:
                    metrics.wasted_resources += 1
                    metrics.idle_resources += 1

                if resource.allocated > 0 and resource.used > 0:
                    if (resource.allocated / resource.used) > 3:
                        metrics.over_provisioned += 1

            metrics.avg_utilization = total_efficiency / len(self._resources)
            metrics.overall_efficiency = metrics.avg_utilization

            return metrics

    def generate_report(self) -> WasteReport:
        """Generate waste analysis report."""
        with self._lock:
            # Scan for waste
            self.scan_all()

            # Count by type
            waste_by_type = defaultdict(int)
            waste_by_severity = defaultdict(int)
            total_savings = 0.0

            for waste in self._waste_items:
                waste_by_type[waste.waste_type.value] += 1
                waste_by_severity[waste.severity.value] += 1
                total_savings += waste.potential_savings

            # Generate recommendations
            recommendations = self._generate_recommendations()

            report = WasteReport(
                id=str(uuid.uuid4())[:8],
                total_waste_items=len(self._waste_items),
                total_potential_savings=total_savings,
                waste_by_type=dict(waste_by_type),
                waste_by_severity=dict(waste_by_severity),
                recommendations=recommendations
            )

            self._historical_waste.append(report)
            return report

    def _generate_recommendations(self) -> List[str]:
        """Generate waste reduction recommendations."""
        recommendations = []

        with self._lock:
            # Analyze waste items and generate specific recommendations
            idle_count = sum(1 for w in self._waste_items if w.waste_type == WasteType.IDLE_RESOURCE)
            unused_count = sum(1 for w in self._waste_items if w.waste_type == WasteType.UNUSED_CAPACITY)
            over_count = sum(1 for w in self._waste_items if w.waste_type == WasteType.OVER_PROVISIONED)

            if idle_count > 0:
                recommendations.append(f"Terminate or scale down {idle_count} idle resources")

            if unused_count > 0:
                recommendations.append(f"Right-size {unused_count} underutilized resources")

            if over_count > 0:
                recommendations.append(f"Reduce allocation for {over_count} over-provisioned resources")

            # Cost-based recommendations
            high_severity = sum(1 for w in self._waste_items if w.severity in (WasteSeverity.HIGH, WasteSeverity.CRITICAL))
            if high_severity > 0:
                recommendations.append(f"Prioritize addressing {high_severity} high/critical severity waste items")

            if not recommendations:
                recommendations.append("No waste detected - resources are well optimized")

        return recommendations

    def get_resources(self) -> List[ResourceUsage]:
        """Get all tracked resources."""
        with self._lock:
            return list(self._resources.values())

    def get_historical_reports(self) -> List[WasteReport]:
        """Get historical waste reports."""
        with self._lock:
            return list(self._historical_waste)


class AgentWaste:
    """Agent waste detection management system."""

    def __init__(self):
        self._lock = threading.RLock()
        self._detector = WasteDetector(WasteConfig())
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_resource(
        self,
        resource_id: str,
        resource_name: str,
        category: ResourceCategory,
        allocated: float,
        used: float = 0.0,
        idle_time: float = 0.0,
        last_used: float = 0.0
    ):
        """Add a resource to track."""
        self._detector.add_resource(
            resource_id, resource_name, category, allocated, used, idle_time, last_used
        )

    def remove_resource(self, resource_id: str) -> bool:
        """Remove a resource."""
        return self._detector.remove_resource(resource_id)

    def update_resource_usage(
        self,
        resource_id: str,
        used: float = None,
        idle_time: float = None,
        last_used: float = None
    ) -> bool:
        """Update resource usage."""
        return self._detector.update_resource_usage(resource_id, used, idle_time, last_used)

    def scan_for_waste(self) -> List[Dict[str, Any]]:
        """Scan for waste."""
        waste_items = self._detector.scan_all()
        return [
            {
                "id": w.id,
                "waste_type": w.waste_type.value,
                "resource_id": w.resource_id,
                "resource_name": w.resource_name,
                "category": w.category.value,
                "severity": w.severity.value,
                "description": w.description,
                "potential_savings": w.potential_savings,
                "currency": w.currency,
                "detected_at": w.detected_at
            }
            for w in waste_items
        ]

    def get_waste_items(
        self,
        waste_type: WasteType = None,
        severity: WasteSeverity = None
    ) -> List[Dict[str, Any]]:
        """Get waste items."""
        items = self._detector.get_waste_items(waste_type, severity)
        return [
            {
                "id": w.id,
                "waste_type": w.waste_type.value,
                "resource_id": w.resource_id,
                "resource_name": w.resource_name,
                "category": w.category.value,
                "severity": w.severity.value,
                "description": w.description,
                "potential_savings": w.potential_savings,
                "currency": w.currency
            }
            for w in items
        ]

    def get_efficiency_metrics(self) -> Dict[str, Any]:
        """Get efficiency metrics."""
        metrics = self._detector.get_efficiency_metrics()
        return {
            "overall_efficiency": metrics.overall_efficiency,
            "wasted_resources": metrics.wasted_resources,
            "idle_resources": metrics.idle_resources,
            "over_provisioned": metrics.over_provisioned,
            "avg_utilization": metrics.avg_utilization
        }

    def generate_report(self) -> Dict[str, Any]:
        """Generate waste report."""
        report = self._detector.generate_report()
        return {
            "id": report.id,
            "generated_at": report.generated_at,
            "total_waste_items": report.total_waste_items,
            "total_potential_savings": report.total_potential_savings,
            "waste_by_type": report.waste_by_type,
            "waste_by_severity": report.waste_by_severity,
            "recommendations": report.recommendations
        }

    def get_resources(self) -> List[Dict[str, Any]]:
        """Get all resources."""
        resources = self._detector.get_resources()
        return [
            {
                "resource_id": r.resource_id,
                "resource_name": r.resource_name,
                "category": r.category.value,
                "allocated": r.allocated,
                "used": r.used,
                "idle_time": r.idle_time,
                "efficiency_score": r.efficiency_score
            }
            for r in resources
        ]

    def get_historical_reports(self) -> List[Dict[str, Any]]:
        """Get historical reports."""
        reports = self._detector.get_historical_reports()
        return [
            {
                "id": r.id,
                "generated_at": r.generated_at,
                "total_waste_items": r.total_waste_items,
                "total_potential_savings": r.total_potential_savings,
                "waste_by_type": r.waste_by_type,
                "waste_by_severity": r.waste_by_severity
            }
            for r in reports
        ]


# Global waste instance
agent_waste = AgentWaste()
