"""Change Calendar Module

Team change calendar and coordination for tracking scheduled changes, maintenance windows, and deployments.
"""
import time
import threading
import uuid
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum


class ChangeType(str, Enum):
    """Types of changes."""
    DEPLOYMENT = "deployment"
    MAINTENANCE = "maintenance"
    CONFIG_CHANGE = "config_change"
    INFRASTRUCTURE = "infrastructure"
    DATABASE = "database"
    SECURITY = "security"
    ROLLBACK = "rollback"
    INCIDENT = "incident"
    OTHER = "other"


class ChangeStatus(str, Enum):
    """Change status."""
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


class ChangePriority(str, Enum):
    """Change priority."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class ChangeRisk(str, Enum):
    """Change risk level."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


@dataclass
class Change:
    """Change entry."""
    id: str
    title: str
    description: str
    change_type: ChangeType
    status: ChangeStatus
    priority: ChangePriority
    risk: ChangeRisk
    service: str
    owner: str
    start_time: float
    end_time: float
    created_at: float
    updated_at: float
    created_by: str
    affected_components: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)
    rollback_plan: str = ""
    approval_required: bool = False
    approved_by: str = ""
    tags: List[str] = field(default_factory=list)
    metadata: Dict = field(default_factory=dict)


@dataclass
class MaintenanceWindow:
    """Maintenance window."""
    id: str
    name: str
    description: str
    start_time: float
    end_time: float
    services: List[str]
    type: str  # "scheduled", "emergency"
    status: str
    created_by: str


@dataclass
class ChangeCalendar:
    """Change calendar data."""
    changes: List[Change]
    maintenance_windows: List[MaintenanceWindow]
    blocked_dates: List[Dict]


class ChangeCalendarManager:
    """Manage team change calendar."""

    def __init__(self):
        self._lock = threading.RLock()
        self._changes: Dict[str, Change] = {}
        self._maintenance_windows: Dict[str, MaintenanceWindow] = {}
        self._blocked_dates: Dict[str, Dict] = {}

    def create_change(
        self,
        title: str,
        description: str,
        change_type: ChangeType,
        service: str,
        owner: str,
        start_time: float,
        end_time: float,
        created_by: str,
        priority: ChangePriority = ChangePriority.MEDIUM,
        risk: ChangeRisk = ChangeRisk.MEDIUM,
        affected_components: List[str] = None,
        dependencies: List[str] = None,
        rollback_plan: str = "",
        approval_required: bool = False,
        tags: List[str] = None,
        metadata: Dict = None
    ) -> str:
        """Create a new change entry."""
        change_id = str(uuid.uuid4())[:12]
        now = time.time()

        change = Change(
            id=change_id,
            title=title,
            description=description,
            change_type=change_type,
            status=ChangeStatus.SCHEDULED,
            priority=priority,
            risk=risk,
            service=service,
            owner=owner,
            start_time=start_time,
            end_time=end_time,
            created_at=now,
            updated_at=now,
            created_by=created_by,
            affected_components=affected_components or [],
            dependencies=dependencies or [],
            rollback_plan=rollback_plan,
            approval_required=approval_required,
            tags=tags or [],
            metadata=metadata or {}
        )

        with self._lock:
            self._changes[change_id] = change

        return change_id

    def update_change(
        self,
        change_id: str,
        title: str = None,
        description: str = None,
        status: ChangeStatus = None,
        priority: ChangePriority = None,
        risk: ChangeRisk = None,
        owner: str = None,
        start_time: float = None,
        end_time: float = None,
        approved_by: str = None,
        tags: List[str] = None
    ) -> bool:
        """Update a change entry."""
        with self._lock:
            change = self._changes.get(change_id)
            if not change:
                return False

            if title is not None:
                change.title = title
            if description is not None:
                change.description = description
            if status is not None:
                change.status = status
            if priority is not None:
                change.priority = priority
            if risk is not None:
                change.risk = risk
            if owner is not None:
                change.owner = owner
            if start_time is not None:
                change.start_time = start_time
            if end_time is not None:
                change.end_time = end_time
            if approved_by is not None:
                change.approved_by = approved_by
            if tags is not None:
                change.tags = tags

            change.updated_at = time.time()

            return True

    def delete_change(self, change_id: str) -> bool:
        """Delete a change entry."""
        with self._lock:
            if change_id in self._changes:
                del self._changes[change_id]
                return True
            return False

    def get_change(self, change_id: str) -> Optional[Change]:
        """Get a change entry."""
        with self._lock:
            return self._changes.get(change_id)

    def get_changes(
        self,
        service: str = None,
        owner: str = None,
        change_type: ChangeType = None,
        status: ChangeStatus = None,
        priority: ChangePriority = None,
        start_time: float = None,
        end_time: float = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Change]:
        """Get changes with filters."""
        with self._lock:
            changes = list(self._changes.values())

        # Apply filters
        if service:
            changes = [c for c in changes if c.service == service]
        if owner:
            changes = [c for c in changes if c.owner == owner]
        if change_type:
            changes = [c for c in changes if c.change_type == change_type]
        if status:
            changes = [c for c in changes if c.status == status]
        if priority:
            changes = [c for c in changes if c.priority == priority]
        if start_time:
            changes = [c for c in changes if c.start_time >= start_time]
        if end_time:
            changes = [c for c in changes if c.end_time <= end_time]

        # Sort by start time
        changes.sort(key=lambda x: x.start_time)

        return changes[offset:offset + limit]

    def get_upcoming_changes(
        self,
        days: int = 7,
        service: str = None
    ) -> List[Change]:
        """Get upcoming changes within specified days."""
        now = time.time()
        end_time = now + (days * 86400)

        return self.get_changes(
            start_time=now,
            end_time=end_time,
            service=service,
            status=ChangeStatus.SCHEDULED,
            limit=50
        )

    def get_conflicts(
        self,
        change_id: str
    ) -> List[Change]:
        """Get changes that conflict with specified change."""
        change = self.get_change(change_id)
        if not change:
            return []

        all_changes = self.get_changes(
            start_time=change.start_time - 3600,  # 1 hour buffer
            end_time=change.end_time + 3600,
            status=ChangeStatus.SCHEDULED
        )

        return [c for c in all_changes if c.id != change_id]

    def create_maintenance_window(
        self,
        name: str,
        description: str,
        start_time: float,
        end_time: float,
        services: List[str],
        created_by: str,
        window_type: str = "scheduled"
    ) -> str:
        """Create a maintenance window."""
        window_id = str(uuid.uuid4())[:12]

        window = MaintenanceWindow(
            id=window_id,
            name=name,
            description=description,
            start_time=start_time,
            end_time=end_time,
            services=services,
            type=window_type,
            status="scheduled",
            created_by=created_by
        )

        with self._lock:
            self._maintenance_windows[window_id] = window

        return window_id

    def get_maintenance_windows(
        self,
        service: str = None,
        start_time: float = None,
        end_time: float = None,
        window_type: str = None
    ) -> List[MaintenanceWindow]:
        """Get maintenance windows."""
        with self._lock:
            windows = list(self._maintenance_windows.values())

        if service:
            windows = [w for w in windows if service in w.services]
        if start_time:
            windows = [w for w in windows if w.start_time >= start_time]
        if end_time:
            windows = [w for w in windows if w.end_time <= end_time]
        if window_type:
            windows = [w for w in windows if w.type == window_type]

        return sorted(windows, key=lambda x: x.start_time)

    def add_blocked_date(
        self,
        date: str,  # YYYY-MM-DD format
        reason: str,
        blocked_by: str
    ) -> str:
        """Add a blocked date (e.g., holidays, blackout periods)."""
        blocked_id = str(uuid.uuid4())[:12]

        with self._lock:
            self._blocked_dates[date] = {
                "id": blocked_id,
                "date": date,
                "reason": reason,
                "blocked_by": blocked_by,
                "created_at": time.time()
            }

        return blocked_id

    def get_blocked_dates(
        self,
        start_date: str = None,
        end_date: str = None
    ) -> List[Dict]:
        """Get blocked dates."""
        with self._lock:
            dates = list(self._blocked_dates.values())

        if start_date:
            dates = [d for d in dates if d["date"] >= start_date]
        if end_date:
            dates = [d for d in dates if d["date"] <= end_date]

        return sorted(dates, key=lambda x: x["date"])

    def get_calendar(
        self,
        start_time: float,
        end_time: float,
        service: str = None
    ) -> ChangeCalendar:
        """Get calendar view with all changes and maintenance windows."""
        changes = self.get_changes(
            start_time=start_time,
            end_time=end_time,
            service=service
        )

        windows = self.get_maintenance_windows(
            start_time=start_time,
            end_time=end_time
        )

        # Get blocked dates in range
        start_date = datetime.fromtimestamp(start_time).strftime('%Y-%m-%d')
        end_date = datetime.fromtimestamp(end_time).strftime('%Y-%m-%d')
        blocked = self.get_blocked_dates(start_date, end_date)

        return ChangeCalendar(
            changes=changes,
            maintenance_windows=windows,
            blocked_dates=blocked
        )

    def get_statistics(self) -> Dict:
        """Get change calendar statistics."""
        with self._lock:
            changes = list(self._changes.values())

        by_status = {}
        by_type = {}
        by_priority = {}
        by_service = {}

        for change in changes:
            by_status[change.status.value] = by_status.get(change.status.value, 0) + 1
            by_type[change.change_type.value] = by_type.get(change.change_type.value, 0) + 1
            by_priority[change.priority.value] = by_priority.get(change.priority.value, 0) + 1
            by_service[change.service] = by_service.get(change.service, 0) + 1

        # Upcoming
        now = time.time()
        upcoming = sum(1 for c in changes if c.status == ChangeStatus.SCHEDULED and c.start_time > now)
        in_progress = sum(1 for c in changes if c.status == ChangeStatus.IN_PROGRESS)

        return {
            "total_changes": len(changes),
            "upcoming_changes": upcoming,
            "in_progress": in_progress,
            "by_status": by_status,
            "by_type": by_type,
            "by_priority": by_priority,
            "by_service": by_service,
            "maintenance_windows": len(self._maintenance_windows),
            "blocked_dates": len(self._blocked_dates)
        }


# Global change calendar manager
change_calendar = ChangeCalendarManager()
