"""
Agent Followup Module

Provides agent follow-up tracking and management system.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional
import threading


class FollowUpStatus(Enum):
    """Follow-up status enumeration"""
    PENDING = "pending"
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    OVERDUE = "overdue"
    ESCALATED = "escalated"


class FollowUpPriority(Enum):
    """Follow-up priority enumeration"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"
    CRITICAL = "critical"


class FollowUpType(Enum):
    """Follow-up type enumeration"""
    TASK = "task"
    MEETING = "meeting"
    CALL = "call"
    EMAIL = "email"
    DOCUMENT = "document"
    REVIEW = "review"
    APPROVAL = "approval"
    FEEDBACK = "feedback"
    CHECKIN = "checkin"
    REMINDER = "reminder"


class FollowUpCategory(Enum):
    """Follow-up category enumeration"""
    CLIENT = "client"
    INTERNAL = "internal"
    PROJECT = "project"
    PERSONAL = "personal"
    ADMINISTRATIVE = "administrative"
    SALES = "sales"
    SUPPORT = "support"
    DEVELOPMENT = "development"


class RecurrencePattern(Enum):
    """Recurrence pattern enumeration"""
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


@dataclass
class FollowUp:
    """Follow-up entry"""
    followup_id: str
    title: str
    description: str = ""
    agent_id: str = ""
    created_by: str = ""
    assigned_to: str = ""
    related_to_id: str = ""  # Related entity ID (task, project, client, etc.)
    related_to_type: str = ""  # Type of related entity

    followup_type: FollowUpType = FollowUpType.TASK
    category: FollowUpCategory = FollowUpCategory.INTERNAL
    priority: FollowUpPriority = FollowUpPriority.MEDIUM
    status: FollowUpStatus = FollowUpStatus.PENDING

    due_date: Optional[datetime] = None
    scheduled_date: Optional[datetime] = None
    completed_date: Optional[datetime] = None

    recurrence: RecurrencePattern = RecurrencePattern.NONE
    recurrence_end_date: Optional[datetime] = None

    reminder_dates: List[datetime] = field(default_factory=list)

    notes: str = ""
    outcomes: str = ""
    attachments: List[str] = field(default_factory=list)

    tags: List[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)

    escalate_after: Optional[datetime] = None
    escalation_level: int = 0

    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class FollowUpTemplate:
    """Follow-up template"""
    template_id: str
    name: str
    description: str = ""
    followup_type: FollowUpType = FollowUpType.TASK
    category: FollowUpCategory = FollowUpCategory.INTERNAL
    default_priority: FollowUpPriority = FollowUpPriority.MEDIUM
    default_due_days: int = 7
    default_reminder_days: List[int] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class FollowUpLog:
    """Follow-up activity log"""
    log_id: str
    followup_id: str
    action: str  # created, updated, completed, cancelled, etc.
    old_status: Optional[FollowUpStatus] = None
    new_status: Optional[FollowUpStatus] = None
    comment: str = ""
    performed_by: str = ""
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class FollowUpStatistics:
    """Follow-up statistics"""
    agent_id: str
    total_followups: int = 0
    completed_followups: int = 0
    pending_followups: int = 0
    overdue_followups: int = 0
    cancelled_followups: int = 0
    average_completion_days: float = 0.0
    followups_by_priority: dict = field(default_factory=dict)
    followups_by_type: dict = field(default_factory=dict)
    followups_by_category: dict = field(default_factory=dict)


@dataclass
class FollowUpReminder:
    """Follow-up reminder"""
    reminder_id: str
    followup_id: str
    reminder_date: datetime
    is_sent: bool = False
    sent_at: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class FollowUpFilter:
    """Follow-up filter criteria"""
    agent_id: str = ""
    status: Optional[FollowUpStatus] = None
    priority: Optional[FollowUpPriority] = None
    followup_type: Optional[FollowUpType] = None
    category: Optional[FollowUpCategory] = None
    assigned_to: str = ""
    created_by: str = ""
    due_before: Optional[datetime] = None
    due_after: Optional[datetime] = None
    tags: List[str] = field(default_factory=list)
    related_to_id: str = ""
    related_to_type: str = ""


class FollowUpManager:
    """Manages agent follow-ups"""

    def __init__(self):
        self._followups: dict[str, FollowUp] = {}
        self._templates: dict[str, FollowUpTemplate] = {}
        self._logs: dict[str, List[FollowUpLog]] = {}
        self._reminders: dict[str, List[FollowUpReminder]] = {}
        self._lock = threading.RLock()
        self._initialize_sample_data()

    def _initialize_sample_data(self):
        """Initialize sample templates"""
        templates = [
            FollowUpTemplate(
                template_id="template_001",
                name="Weekly Check-in",
                description="Regular weekly check-in follow-up",
                followup_type=FollowUpType.CHECKIN,
                category=FollowUpCategory.INTERNAL,
                default_priority=FollowUpPriority.MEDIUM,
                default_due_days=7,
                default_reminder_days=[1, 3]
            ),
            FollowUpTemplate(
                template_id="template_002",
                name="Client Follow-up",
                description="Follow up with client after meeting",
                followup_type=FollowUpType.CALL,
                category=FollowUpCategory.CLIENT,
                default_priority=FollowUpPriority.HIGH,
                default_due_days=3,
                default_reminder_days=[1]
            ),
            FollowUpTemplate(
                template_id="template_003",
                name="Task Review",
                description="Review task completion",
                followup_type=FollowUpType.REVIEW,
                category=FollowUpCategory.PROJECT,
                default_priority=FollowUpPriority.MEDIUM,
                default_due_days=5,
                default_reminder_days=[2]
            ),
        ]
        for template in templates:
            self._templates[template.template_id] = template

    # Follow-up CRUD
    def create_followup(
        self,
        followup_id: str,
        title: str,
        description: str = "",
        agent_id: str = "",
        created_by: str = "",
        assigned_to: str = "",
        followup_type: FollowUpType = FollowUpType.TASK,
        category: FollowUpCategory = FollowUpCategory.INTERNAL,
        priority: FollowUpPriority = FollowUpPriority.MEDIUM,
        due_date: Optional[datetime] = None,
        scheduled_date: Optional[datetime] = None,
        recurrence: RecurrencePattern = RecurrencePattern.NONE,
        tags: List[str] = None,
        related_to_id: str = "",
        related_to_type: str = ""
    ) -> FollowUp:
        """Create a new follow-up"""
        with self._lock:
            followup = FollowUp(
                followup_id=followup_id,
                title=title,
                description=description,
                agent_id=agent_id,
                created_by=created_by,
                assigned_to=assigned_to,
                followup_type=followup_type,
                category=category,
                priority=priority,
                due_date=due_date,
                scheduled_date=scheduled_date,
                recurrence=recurrence,
                tags=tags or [],
                related_to_id=related_to_id,
                related_to_type=related_to_type
            )

            # Generate reminder dates if due date is set
            if due_date:
                reminder_dates = []
                for days_before in [3, 1]:
                    reminder_date = due_date - timedelta(days=days_before)
                    if reminder_date > datetime.now():
                        reminder_dates.append(reminder_date)
                followup.reminder_dates = reminder_dates

            self._followups[followup_id] = followup

            # Log creation
            self._add_log(followup_id, "created", performed_by=created_by)

            return followup

    def get_followup(self, followup_id: str) -> Optional[FollowUp]:
        """Get follow-up by ID"""
        with self._lock:
            return self._followups.get(followup_id)

    def update_followup(
        self,
        followup_id: str,
        title: str = None,
        description: str = None,
        assigned_to: str = None,
        priority: FollowUpPriority = None,
        status: FollowUpStatus = None,
        due_date: datetime = None,
        scheduled_date: datetime = None,
        notes: str = None,
        outcomes: str = None,
        tags: List[str] = None,
        metadata: dict = None
    ) -> Optional[FollowUp]:
        """Update follow-up"""
        with self._lock:
            followup = self._followups.get(followup_id)
            if not followup:
                return None

            old_status = followup.status

            if title is not None:
                followup.title = title
            if description is not None:
                followup.description = description
            if assigned_to is not None:
                followup.assigned_to = assigned_to
            if priority is not None:
                followup.priority = priority
            if status is not None:
                followup.status = status
                if status == FollowUpStatus.COMPLETED:
                    followup.completed_date = datetime.now()
                # Check for overdue
                if followup.due_date and followup.due_date < datetime.now():
                    if followup.status not in [FollowUpStatus.COMPLETED, FollowUpStatus.CANCELLED]:
                        followup.status = FollowUpStatus.OVERDUE
            if due_date is not None:
                followup.due_date = due_date
            if scheduled_date is not None:
                followup.scheduled_date = scheduled_date
            if notes is not None:
                followup.notes = notes
            if outcomes is not None:
                followup.outcomes = outcomes
            if tags is not None:
                followup.tags = tags
            if metadata is not None:
                followup.metadata.update(metadata)

            followup.updated_at = datetime.now()

            # Log status change
            if old_status != followup.status:
                self._add_log(
                    followup_id,
                    "status_changed",
                    old_status=old_status,
                    new_status=followup.status
                )

            return followup

    def delete_followup(self, followup_id: str) -> bool:
        """Delete follow-up"""
        with self._lock:
            if followup_id in self._followups:
                self._add_log(followup_id, "deleted")
                del self._followups[followup_id]
                return True
            return False

    def list_followups(
        self,
        agent_id: str = "",
        status: FollowUpStatus = None,
        priority: FollowUpPriority = None,
        followup_type: FollowUpType = None,
        category: FollowUpCategory = None,
        assigned_to: str = "",
        due_before: datetime = None,
        due_after: datetime = None,
        tags: List[str] = None,
        include_completed: bool = True
    ) -> List[FollowUp]:
        """List follow-ups with filters"""
        with self._lock:
            followups = list(self._followups.values())

            if agent_id:
                followups = [f for f in followups if f.agent_id == agent_id]
            if status:
                followups = [f for f in followups if f.status == status]
            elif not include_completed:
                followups = [f for f in followups if f.status != FollowUpStatus.COMPLETED]
            if priority:
                followups = [f for f in followups if f.priority == priority]
            if followup_type:
                followups = [f for f in followups if f.followup_type == followup_type]
            if category:
                followups = [f for f in followups if f.category == category]
            if assigned_to:
                followups = [f for f in followups if f.assigned_to == assigned_to]
            if due_before:
                followups = [f for f in followups if f.due_date and f.due_date <= due_before]
            if due_after:
                followups = [f for f in followups if f.due_date and f.due_date >= due_after]
            if tags:
                followups = [f for f in followups if any(t in f.tags for t in tags)]

            return sorted(followups, key=lambda f: (f.due_date or datetime.max, f.priority.value))

    # Status management
    def complete_followup(self, followup_id: str, outcomes: str = "") -> Optional[FollowUp]:
        """Mark follow-up as completed"""
        with self._lock:
            followup = self._followups.get(followup_id)
            if followup:
                followup.status = FollowUpStatus.COMPLETED
                followup.completed_date = datetime.now()
                followup.outcomes = outcomes
                followup.updated_at = datetime.now()
                self._add_log(followup_id, "completed")

                # Handle recurrence
                if followup.recurrence != RecurrencePattern.NONE:
                    self._create_recurring_followup(followup)

                return followup
            return None

    def cancel_followup(self, followup_id: str) -> Optional[FollowUp]:
        """Cancel follow-up"""
        with self._lock:
            followup = self._followups.get(followup_id)
            if followup:
                followup.status = FollowUpStatus.CANCELLED
                followup.updated_at = datetime.now()
                self._add_log(followup_id, "cancelled")
                return followup
            return None

    def escalate_followup(self, followup_id: str) -> Optional[FollowUp]:
        """Escalate follow-up"""
        with self._lock:
            followup = self._followups.get(followup_id)
            if followup:
                followup.escalation_level += 1
                followup.status = FollowUpStatus.ESCALATED
                followup.updated_at = datetime.now()
                self._add_log(followup_id, "escalated")
                return followup
            return None

    def _create_recurring_followup(self, original: FollowUp):
        """Create next recurring follow-up"""
        if not original.recurrence_end_date:
            return

        # Calculate next due date
        if original.due_date:
            if original.recurrence == RecurrencePattern.DAILY:
                next_due = original.due_date + timedelta(days=1)
            elif original.recurrence == RecurrencePattern.WEEKLY:
                next_due = original.due_date + timedelta(weeks=1)
            elif original.recurrence == RecurrencePattern.BIWEEKLY:
                next_due = original.due_date + timedelta(weeks=2)
            elif original.recurrence == RecurrencePattern.MONTHLY:
                next_due = original.due_date + timedelta(days=30)
            elif original.recurrence == RecurrencePattern.QUARTERLY:
                next_due = original.due_date + timedelta(days=90)
            elif original.recurrence == RecurrencePattern.YEARLY:
                next_due = original.due_date + timedelta(days=365)
            else:
                return

            if next_due <= original.recurrence_end_date:
                # Create new follow-up
                new_id = f"{original.followup_id}_recurring_{next_due.timestamp()}"
                self.create_followup(
                    followup_id=new_id,
                    title=original.title,
                    description=original.description,
                    agent_id=original.agent_id,
                    created_by=original.created_by,
                    assigned_to=original.assigned_to,
                    followup_type=original.followup_type,
                    category=original.category,
                    priority=original.priority,
                    due_date=next_due,
                    recurrence=original.recurrence,
                    tags=original.tags.copy(),
                    related_to_id=original.related_to_id,
                    related_to_type=original.related_to_type
                )

    # Templates
    def create_from_template(
        self,
        template_id: str,
        followup_id: str,
        agent_id: str = "",
        created_by: str = "",
        assigned_to: str = "",
        due_date: Optional[datetime] = None,
        **kwargs
    ) -> Optional[FollowUp]:
        """Create follow-up from template"""
        with self._lock:
            template = self._templates.get(template_id)
            if not template:
                return None

            if due_date is None:
                due_date = datetime.now() + timedelta(days=template.default_due_days)

            return self.create_followup(
                followup_id=followup_id,
                title=kwargs.get("title", template.name),
                description=kwargs.get("description", template.description),
                agent_id=agent_id,
                created_by=created_by,
                assigned_to=assigned_to,
                followup_type=kwargs.get("followup_type", template.followup_type),
                category=kwargs.get("category", template.category),
                priority=kwargs.get("priority", template.default_priority),
                due_date=due_date,
                tags=kwargs.get("tags", template.tags)
            )

    def get_template(self, template_id: str) -> Optional[FollowUpTemplate]:
        """Get template by ID"""
        with self._lock:
            return self._templates.get(template_id)

    def list_templates(self, followup_type: FollowUpType = None) -> List[FollowUpTemplate]:
        """List templates"""
        with self._lock:
            templates = list(self._templates.values())
            if followup_type:
                templates = [t for t in templates if t.followup_type == followup_type]
            return templates

    # Activity logs
    def _add_log(
        self,
        followup_id: str,
        action: str,
        old_status: FollowUpStatus = None,
        new_status: FollowUpStatus = None,
        performed_by: str = "",
        comment: str = ""
    ):
        """Add activity log"""
        log = FollowUpLog(
            log_id=f"{followup_id}_log_{datetime.now().timestamp()}",
            followup_id=followup_id,
            action=action,
            old_status=old_status,
            new_status=new_status,
            performed_by=performed_by,
            comment=comment
        )
        if followup_id not in self._logs:
            self._logs[followup_id] = []
        self._logs[followup_id].append(log)

    def get_logs(self, followup_id: str, limit: int = 50) -> List[FollowUpLog]:
        """Get follow-up logs"""
        with self._lock:
            logs = self._logs.get(followup_id, [])
            return logs[-limit:]

    # Statistics
    def get_statistics(self, agent_id: str = "") -> FollowUpStatistics:
        """Get follow-up statistics"""
        with self._lock:
            followups = self.list_followups(agent_id=agent_id, include_completed=True)

            stats = FollowUpStatistics(agent_id=agent_id)
            stats.total_followups = len(followups)
            stats.completed_followups = len([f for f in followups if f.status == FollowUpStatus.COMPLETED])
            stats.pending_followups = len([f for f in followups if f.status == FollowUpStatus.PENDING])
            stats.overdue_followups = len([f for f in followups if f.status == FollowUpStatus.OVERDUE])
            stats.cancelled_followups = len([f for f in followups if f.status == FollowUpStatus.CANCELLED])

            # By priority
            for f in followups:
                p = f.priority.value
                stats.followups_by_priority[p] = stats.followups_by_priority.get(p, 0) + 1

            # By type
            for f in followups:
                t = f.followup_type.value
                stats.followups_by_type[t] = stats.followups_by_type.get(t, 0) + 1

            # By category
            for f in followups:
                c = f.category.value
                stats.followups_by_category[c] = stats.followups_by_category.get(c, 0) + 1

            # Average completion time
            completed = [f for f in followups if f.completed_date and f.created_at]
            if completed:
                total_days = sum((f.completed_date - f.created_at).days for f in completed)
                stats.average_completion_days = total_days / len(completed)

            return stats

    # Overdue management
    def get_overdue_followups(self, agent_id: str = "") -> List[FollowUp]:
        """Get overdue follow-ups"""
        with self._lock:
            now = datetime.now()
            followups = self.list_followups(
                agent_id=agent_id,
                status=None,
                include_completed=False
            )
            return [f for f in followups if f.due_date and f.due_date < now]

    def check_and_update_overdue(self) -> List[FollowUp]:
        """Check and update overdue follow-ups"""
        with self._lock:
            now = datetime.now()
            overdue = []
            for followup in self._followups.values():
                if followup.due_date and followup.due_date < now:
                    if followup.status not in [FollowUpStatus.COMPLETED, FollowUpStatus.CANCELLED]:
                        followup.status = FollowUpStatus.OVERDUE
                        followup.updated_at = now
                        overdue.append(followup)
            return overdue

    # Due soon
    def get_due_soon(self, days: int = 3, agent_id: str = "") -> List[FollowUp]:
        """Get follow-ups due within specified days"""
        with self._lock:
            now = datetime.now()
            future = now + timedelta(days=days)
            followups = self.list_followups(
                agent_id=agent_id,
                status=None,
                include_completed=False
            )
            return [f for f in followups if f.due_date and now < f.due_date <= future]

    # Bulk operations
    def bulk_update_status(
        self,
        followup_ids: List[str],
        status: FollowUpStatus
    ) -> int:
        """Bulk update follow-up status"""
        with self._lock:
            count = 0
            for followup_id in followup_ids:
                followup = self._followups.get(followup_id)
                if followup:
                    old_status = followup.status
                    followup.status = status
                    followup.updated_at = datetime.now()
                    if status == FollowUpStatus.COMPLETED:
                        followup.completed_date = datetime.now()
                    self._add_log(followup_id, "bulk_status_changed", old_status=old_status, new_status=status)
                    count += 1
            return count

    def bulk_assign(
        self,
        followup_ids: List[str],
        assigned_to: str
    ) -> int:
        """Bulk assign follow-ups"""
        with self._lock:
            count = 0
            for followup_id in followup_ids:
                followup = self._followups.get(followup_id)
                if followup:
                    followup.assigned_to = assigned_to
                    followup.updated_at = datetime.now()
                    self._add_log(followup_id, "bulk_assigned", comment=f"Assigned to {assigned_to}")
                    count += 1
            return count


# Global instance
agent_followup = FollowUpManager()
