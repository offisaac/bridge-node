"""Change Tracker Module

Infrastructure change tracking and auditing.
"""
import threading
import time
import json
import hashlib
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid


class ChangeType(str, Enum):
    """Types of changes."""
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    CONFIG_CHANGE = "config_change"
    DEPLOYMENT = "deployment"
    SCALING = "scaling"
    SECURITY_CHANGE = "security_change"
    PERMISSION_CHANGE = "permission_change"
    SCHEMA_CHANGE = "schema_change"


class ChangeSeverity(str, Enum):
    """Change severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class ChangeStatus(str, Enum):
    """Change status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


@dataclass
class ChangeRecord:
    """Change record."""
    id: str
    change_type: ChangeType
    resource_type: str
    resource_id: str
    severity: ChangeSeverity
    status: ChangeStatus
    description: str
    changes: Dict
    actor: str
    source: str
    timestamp: float
    completed_at: Optional[float] = None
    metadata: Dict = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)


class ChangeTracker:
    """Infrastructure change tracking."""

    def __init__(self):
        self._lock = threading.RLock()
        self._changes: List[ChangeRecord] = []
        self._resources: Dict[str, Dict] = {}
        self._max_changes = 10000
        self._callbacks: List[callable] = []

    def record_change(
        self,
        change_type: ChangeType,
        resource_type: str,
        resource_id: str,
        description: str,
        changes: Dict,
        actor: str = "system",
        source: str = "api",
        severity: ChangeSeverity = ChangeSeverity.MEDIUM,
        metadata: Dict = None,
        tags: List[str] = None
    ) -> str:
        """Record a change."""
        change_id = str(uuid.uuid4())[:12]

        record = ChangeRecord(
            id=change_id,
            change_type=change_type,
            resource_type=resource_type,
            resource_id=resource_id,
            severity=severity,
            status=ChangeStatus.PENDING,
            description=description,
            changes=changes,
            actor=actor,
            source=source,
            timestamp=time.time(),
            metadata=metadata or {},
            tags=tags or []
        )

        with self._lock:
            self._changes.append(record)
            self._update_resource_state(resource_type, resource_id, changes, change_type)

            # Trim old changes if needed
            if len(self._changes) > self._max_changes:
                self._changes = self._changes[-self._max_changes:]

        # Trigger callbacks
        self._trigger_callbacks(record)

        return change_id

    def _update_resource_state(
        self,
        resource_type: str,
        resource_id: str,
        changes: Dict,
        change_type: ChangeType
    ):
        """Update resource state tracking."""
        key = f"{resource_type}:{resource_id}"

        if change_type == ChangeType.DELETE:
            if key in self._resources:
                del self._resources[key]
        else:
            if key not in self._resources:
                self._resources[key] = {}

            self._resources[key].update(changes)
            self._resources[key]["_last_change"] = time.time()

    def update_change_status(
        self,
        change_id: str,
        status: ChangeStatus,
        metadata: Dict = None
    ) -> bool:
        """Update change status."""
        with self._lock:
            for change in self._changes:
                if change.id == change_id:
                    change.status = status
                    if status == ChangeStatus.COMPLETED or status == ChangeStatus.FAILED:
                        change.completed_at = time.time()
                    if metadata:
                        change.metadata.update(metadata)
                    return True
            return False

    def get_change(self, change_id: str) -> Optional[Dict]:
        """Get a specific change."""
        with self._lock:
            for change in self._changes:
                if change.id == change_id:
                    return self._serialize_change(change)
            return None

    def get_changes(
        self,
        resource_type: str = None,
        resource_id: str = None,
        change_type: ChangeType = None,
        severity: ChangeSeverity = None,
        status: ChangeStatus = None,
        actor: str = None,
        start_time: float = None,
        end_time: float = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """Get changes with filters."""
        with self._lock:
            changes = list(self._changes)

        # Apply filters
        if resource_type:
            changes = [c for c in changes if c.resource_type == resource_type]
        if resource_id:
            changes = [c for c in changes if c.resource_id == resource_id]
        if change_type:
            changes = [c for c in changes if c.change_type == change_type]
        if severity:
            changes = [c for c in changes if c.severity == severity]
        if status:
            changes = [c for c in changes if c.status == status]
        if actor:
            changes = [c for c in changes if c.actor == actor]
        if start_time:
            changes = [c for c in changes if c.timestamp >= start_time]
        if end_time:
            changes = [c for c in changes if c.timestamp <= end_time]

        # Sort by timestamp descending
        changes.sort(key=lambda x: x.timestamp, reverse=True)

        return [self._serialize_change(c) for c in changes[offset:offset + limit]]

    def get_changes_by_resource(self, resource_type: str, resource_id: str) -> List[Dict]:
        """Get all changes for a specific resource."""
        return self.get_changes(resource_type=resource_type, resource_id=resource_id)

    def get_timeline(
        self,
        start_time: float = None,
        end_time: float = None,
        group_by: str = "hour"
    ) -> List[Dict]:
        """Get change timeline."""
        changes = self.get_changes(start_time=start_time, end_time=end_time, limit=10000)

        # Group by time
        timeline = {}
        for change in changes:
            ts = change["timestamp"]
            if group_by == "hour":
                key = int(ts // 3600) * 3600
            elif group_by == "day":
                key = int(ts // 86400) * 86400
            else:
                key = int(ts)

            if key not in timeline:
                timeline[key] = {
                    "timestamp": key,
                    "count": 0,
                    "by_type": {},
                    "by_severity": {}
                }

            timeline[key]["count"] += 1

            ctype = change["change_type"]
            timeline[key]["by_type"][ctype] = timeline[key]["by_type"].get(ctype, 0) + 1

            severity = change["severity"]
            timeline[key]["by_severity"][severity] = timeline[key]["by_severity"].get(severity, 0) + 1

        return sorted(timeline.values(), key=lambda x: x["timestamp"])

    def get_impact_analysis(self, change_id: str) -> Dict:
        """Analyze impact of a change."""
        change = self.get_change(change_id)
        if not change:
            return {}

        # Find related changes
        related = self.get_changes(
            resource_type=change["resource_type"],
            resource_id=change["resource_id"],
            limit=10
        )

        return {
            "change": change,
            "related_changes": related,
            "resource_state": self._resources.get(
                f"{change['resource_type']}:{change['resource_id']}",
                {}
            )
        }

    def rollback_change(self, change_id: str) -> bool:
        """Record a rollback for a change."""
        change = self.get_change(change_id)
        if not change:
            return False

        rollback_id = self.record_change(
            change_type=ChangeType.UPDATE,
            resource_type=change["resource_type"],
            resource_id=change["resource_id"],
            description=f"Rollback of change {change_id}",
            changes={"rolled_back": change_id},
            actor="system",
            source="rollback",
            severity=ChangeSeverity.HIGH,
            metadata={"original_change_id": change_id}
        )

        self.update_change_status(change_id, ChangeStatus.ROLLED_BACK)
        return rollback_id

    def get_stats(self) -> Dict:
        """Get change statistics."""
        with self._lock:
            changes = list(self._changes)

        total = len(changes)
        by_type = {}
        by_severity = {}
        by_status = {}
        by_actor = {}
        by_source = {}

        for c in changes:
            by_type[c.change_type.value] = by_type.get(c.change_type.value, 0) + 1
            by_severity[c.severity.value] = by_severity.get(c.severity.value, 0) + 1
            by_status[c.status.value] = by_status.get(c.status.value, 0) + 1
            by_actor[c.actor] = by_actor.get(c.actor, 0) + 1
            by_source[c.source] = by_source.get(c.source, 0) + 1

        return {
            "total_changes": total,
            "by_type": by_type,
            "by_severity": by_severity,
            "by_status": by_status,
            "by_actor": by_actor,
            "by_source": by_source,
            "tracked_resources": len(self._resources)
        }

    def add_callback(self, callback: callable):
        """Add a change callback."""
        self._callbacks.append(callback)

    def _trigger_callbacks(self, change: ChangeRecord):
        """Trigger change callbacks."""
        for callback in self._callbacks:
            try:
                callback(change)
            except Exception:
                pass

    def _serialize_change(self, change: ChangeRecord) -> Dict:
        """Serialize a change record."""
        return {
            "id": change.id,
            "change_type": change.change_type.value,
            "resource_type": change.resource_type,
            "resource_id": change.resource_id,
            "severity": change.severity.value,
            "status": change.status.value,
            "description": change.description,
            "changes": change.changes,
            "actor": change.actor,
            "source": change.source,
            "timestamp": change.timestamp,
            "completed_at": change.completed_at,
            "metadata": change.metadata,
            "tags": change.tags
        }

    def export_changes(
        self,
        start_time: float = None,
        end_time: float = None,
        format: str = "json"
    ) -> str:
        """Export changes."""
        changes = self.get_changes(start_time=start_time, end_time=end_time, limit=100000)

        if format == "json":
            return json.dumps(changes, indent=2)
        elif format == "csv":
            if not changes:
                return ""

            headers = ["id", "change_type", "resource_type", "resource_id", "severity",
                      "status", "description", "actor", "source", "timestamp"]
            lines = [",".join(headers)]

            for c in changes:
                row = [str(c.get(h, "")) for h in headers]
                lines.append(",".join(row))

            return "\n".join(lines)

        return str(changes)


# Global change tracker
change_tracker = ChangeTracker()


# Initialize with sample changes
def init_sample_changes():
    """Initialize sample change records."""
    change_tracker.record_change(
        change_type=ChangeType.CREATE,
        resource_type="service",
        resource_id="api-gateway",
        description="Created new API gateway service",
        changes={"endpoint": "/api/v1", "port": 8080},
        actor="admin",
        source="manual",
        severity=ChangeSeverity.HIGH,
        tags=["production", "critical"]
    )

    change_tracker.record_change(
        change_type=ChangeType.CONFIG_CHANGE,
        resource_type="config",
        resource_id="rate-limit",
        description="Updated rate limit configuration",
        changes={"requests_per_minute": 1000},
        actor="admin",
        source="api",
        severity=ChangeSeverity.MEDIUM
    )

    change_tracker.record_change(
        change_type=ChangeType.DEPLOYMENT,
        resource_type="deployment",
        resource_id="v2.1.0",
        description="Deployed version 2.1.0",
        changes={"version": "2.1.0", "environment": "staging"},
        actor="ci/cd",
        source="pipeline",
        severity=ChangeSeverity.INFO,
        tags=["deployment", "staging"]
    )


init_sample_changes()
