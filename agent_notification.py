"""
Agent Notification Center Module

Provides agent notification center and management system.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional
import threading


class NotificationStatus(Enum):
    """Notification status enumeration"""
    UNREAD = "unread"
    READ = "read"
    ARCHIVED = "archived"
    DELETED = "deleted"


class NotificationPriority(Enum):
    """Notification priority enumeration"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class NotificationCategory(Enum):
    """Notification category enumeration"""
    SYSTEM = "system"
    TASK = "task"
    MESSAGE = "message"
    ALERT = "alert"
    REMINDER = "reminder"
    UPDATE = "update"
    WARNING = "warning"
    SUCCESS = "success"
    ERROR = "error"
    INFO = "info"


class NotificationChannel(Enum):
    """Notification delivery channel"""
    IN_APP = "in_app"
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"
    WEBHOOK = "webhook"


class NotificationType(Enum):
    """Notification type enumeration"""
    INFO = "info"
    TASK_ASSIGNED = "task_assigned"
    TASK_COMPLETED = "task_completed"
    TASK_UPDATED = "task_updated"
    TASK_DUE_SOON = "task_due_soon"
    TASK_OVERDUE = "task_overdue"
    MESSAGE_RECEIVED = "message_received"
    MENTION = "mention"
    COMMENT = "comment"
    SHARE = "share"
    APPROVAL_REQUIRED = "approval_required"
    APPROVAL_COMPLETED = "approval_completed"
    REVIEW_REQUESTED = "review_requested"
    MEETING_REMINDER = "meeting_reminder"
    DEADLINE_APPROACHING = "deadline_approaching"
    SYSTEM_ALERT = "system_alert"
    SECURITY_ALERT = "security_alert"
    CUSTOM = "custom"


@dataclass
class Notification:
    """Notification entry"""
    notification_id: str
    title: str
    body: str = ""
    agent_id: str = ""
    sender_id: str = ""
    sender_name: str = ""

    notification_type: NotificationType = NotificationType.INFO
    category: NotificationCategory = NotificationCategory.INFO
    priority: NotificationPriority = NotificationPriority.NORMAL
    status: NotificationStatus = NotificationStatus.UNREAD

    channel: NotificationChannel = NotificationChannel.IN_APP

    action_url: str = ""
    action_label: str = ""

    related_to_id: str = ""
    related_to_type: str = ""

    metadata: dict = field(default_factory=dict)

    expires_at: Optional[datetime] = None
    read_at: Optional[datetime] = None
    archived_at: Optional[datetime] = None

    tags: List[str] = field(default_factory=list)

    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class NotificationPreference:
    """Notification preference for agent"""
    agent_id: str
    channel: NotificationChannel
    enabled: bool = True
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "08:00"
    email_digest: str = "instant"  # instant, hourly, daily, weekly
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class NotificationTemplate:
    """Notification template"""
    template_id: str
    name: str
    notification_type: NotificationType
    category: NotificationCategory
    title_template: str
    body_template: str = ""
    priority: NotificationPriority = NotificationPriority.NORMAL
    default_channel: NotificationChannel = NotificationChannel.IN_APP
    tags: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class NotificationGroup:
    """Grouped notifications"""
    group_id: str
    title: str
    notification_ids: List[str] = field(default_factory=list)
    agent_id: str = ""
    category: NotificationCategory = NotificationCategory.INFO
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class NotificationStats:
    """Notification statistics"""
    agent_id: str
    total_notifications: int = 0
    unread_count: int = 0
    read_count: int = 0
    archived_count: int = 0
    by_category: dict = field(default_factory=dict)
    by_priority: dict = field(default_factory=dict)
    by_type: dict = field(default_factory=dict)


@dataclass
class NotificationFilter:
    """Notification filter criteria"""
    agent_id: str = ""
    status: Optional[NotificationStatus] = None
    category: Optional[NotificationCategory] = None
    priority: Optional[NotificationPriority] = None
    notification_type: Optional[NotificationType] = None
    channel: Optional[NotificationChannel] = None
    created_after: Optional[datetime] = None
    created_before: Optional[datetime] = None
    tags: List[str] = field(default_factory=list)


class NotificationManager:
    """Manages agent notifications"""

    def __init__(self):
        self._notifications: dict[str, Notification] = {}
        self._preferences: dict[str, List[NotificationPreference]] = {}
        self._templates: dict[str, NotificationTemplate] = {}
        self._groups: dict[str, NotificationGroup] = {}
        self._lock = threading.RLock()
        self._initialize_sample_data()

    def _initialize_sample_data(self):
        """Initialize sample templates"""
        templates = [
            NotificationTemplate(
                template_id="template_001",
                name="Task Assigned",
                notification_type=NotificationType.TASK_ASSIGNED,
                category=NotificationCategory.TASK,
                title_template="New Task Assigned: {task_title}",
                body_template="You have been assigned to task '{task_title}'. Due date: {due_date}",
                priority=NotificationPriority.HIGH,
                tags=["task", "assignment"]
            ),
            NotificationTemplate(
                template_id="template_002",
                name="Task Completed",
                notification_type=NotificationType.TASK_COMPLETED,
                category=NotificationCategory.TASK,
                title_template="Task Completed: {task_title}",
                body_template="Task '{task_title}' has been completed by {assignee}.",
                priority=NotificationPriority.NORMAL,
                tags=["task", "completion"]
            ),
            NotificationTemplate(
                template_id="template_003",
                name="Meeting Reminder",
                notification_type=NotificationType.MEETING_REMINDER,
                category=NotificationCategory.REMINDER,
                title_template="Meeting Reminder: {meeting_title}",
                body_template="You have a meeting '{meeting_title}' in {minutes} minutes.",
                priority=NotificationPriority.HIGH,
                tags=["meeting", "reminder"]
            ),
            NotificationTemplate(
                template_id="template_004",
                name="Mention",
                notification_type=NotificationType.MENTION,
                category=NotificationCategory.MESSAGE,
                title_template="You were mentioned by {sender_name}",
                body_template="{sender_name} mentioned you in {context}: {preview}",
                priority=NotificationPriority.NORMAL,
                tags=["mention", "message"]
            ),
        ]
        for template in templates:
            self._templates[template.template_id] = template

    # Notification CRUD
    def create_notification(
        self,
        notification_id: str,
        title: str,
        body: str = "",
        agent_id: str = "",
        sender_id: str = "",
        sender_name: str = "",
        notification_type: NotificationType = NotificationType.INFO,
        category: NotificationCategory = NotificationCategory.INFO,
        priority: NotificationPriority = NotificationPriority.NORMAL,
        channel: NotificationChannel = NotificationChannel.IN_APP,
        action_url: str = "",
        action_label: str = "",
        related_to_id: str = "",
        related_to_type: str = "",
        metadata: dict = None,
        expires_at: datetime = None,
        tags: List[str] = None
    ) -> Notification:
        """Create a new notification"""
        with self._lock:
            notification = Notification(
                notification_id=notification_id,
                title=title,
                body=body,
                agent_id=agent_id,
                sender_id=sender_id,
                sender_name=sender_name,
                notification_type=notification_type,
                category=category,
                priority=priority,
                channel=channel,
                action_url=action_url,
                action_label=action_label,
                related_to_id=related_to_id,
                related_to_type=related_to_type,
                metadata=metadata or {},
                expires_at=expires_at,
                tags=tags or []
            )
            self._notifications[notification_id] = notification
            return notification

    def get_notification(self, notification_id: str) -> Optional[Notification]:
        """Get notification by ID"""
        with self._lock:
            return self._notifications.get(notification_id)

    def update_notification(
        self,
        notification_id: str,
        title: str = None,
        body: str = None,
        status: NotificationStatus = None,
        read_at: datetime = None,
        archived_at: datetime = None,
        action_url: str = None,
        action_label: str = None,
        tags: List[str] = None
    ) -> Optional[Notification]:
        """Update notification"""
        with self._lock:
            notification = self._notifications.get(notification_id)
            if not notification:
                return None

            if title is not None:
                notification.title = title
            if body is not None:
                notification.body = body
            if status is not None:
                notification.status = status
                if status == NotificationStatus.READ and read_at is None:
                    notification.read_at = datetime.now()
                elif status == NotificationStatus.ARCHIVED and archived_at is None:
                    notification.archived_at = datetime.now()
            if read_at is not None:
                notification.read_at = read_at
            if archived_at is not None:
                notification.archived_at = archived_at
            if action_url is not None:
                notification.action_url = action_url
            if action_label is not None:
                notification.action_label = action_label
            if tags is not None:
                notification.tags = tags

            return notification

    def delete_notification(self, notification_id: str) -> bool:
        """Delete notification"""
        with self._lock:
            if notification_id in self._notifications:
                del self._notifications[notification_id]
                return True
            return False

    def list_notifications(
        self,
        agent_id: str = "",
        status: NotificationStatus = None,
        category: NotificationCategory = None,
        priority: NotificationPriority = None,
        notification_type: NotificationType = None,
        channel: NotificationChannel = None,
        include_archived: bool = False,
        limit: int = 100,
        offset: int = 0
    ) -> List[Notification]:
        """List notifications with filters"""
        with self._lock:
            notifications = list(self._notifications.values())

            if agent_id:
                notifications = [n for n in notifications if n.agent_id == agent_id]
            if status:
                notifications = [n for n in notifications if n.status == status]
            elif not include_archived:
                notifications = [n for n in notifications if n.status != NotificationStatus.ARCHIVED]
            if category:
                notifications = [n for n in notifications if n.category == category]
            if priority:
                notifications = [n for n in notifications if n.priority == priority]
            if notification_type:
                notifications = [n for n in notifications if n.notification_type == notification_type]
            if channel:
                notifications = [n for n in notifications if n.channel == channel]

            # Sort by priority and date
            notifications.sort(key=lambda n: (n.priority.value, n.created_at), reverse=True)

            return notifications[offset:offset + limit]

    # Status management
    def mark_as_read(self, notification_id: str) -> Optional[Notification]:
        """Mark notification as read"""
        with self._lock:
            notification = self._notifications.get(notification_id)
            if notification:
                notification.status = NotificationStatus.READ
                notification.read_at = datetime.now()
                return notification
            return None

    def mark_all_as_read(self, agent_id: str) -> int:
        """Mark all notifications as read for agent"""
        with self._lock:
            count = 0
            for notification in self._notifications.values():
                if notification.agent_id == agent_id and notification.status == NotificationStatus.UNREAD:
                    notification.status = NotificationStatus.READ
                    notification.read_at = datetime.now()
                    count += 1
            return count

    def archive_notification(self, notification_id: str) -> Optional[Notification]:
        """Archive notification"""
        with self._lock:
            notification = self._notifications.get(notification_id)
            if notification:
                notification.status = NotificationStatus.ARCHIVED
                notification.archived_at = datetime.now()
                return notification
            return None

    def archive_all(self, agent_id: str) -> int:
        """Archive all notifications for agent"""
        with self._lock:
            count = 0
            for notification in self._notifications.values():
                if notification.agent_id == agent_id:
                    notification.status = NotificationStatus.ARCHIVED
                    notification.archived_at = datetime.now()
                    count += 1
            return count

    def unread_notification(self, notification_id: str) -> Optional[Notification]:
        """Mark notification as unread"""
        with self._lock:
            notification = self._notifications.get(notification_id)
            if notification:
                notification.status = NotificationStatus.UNREAD
                notification.read_at = None
                return notification
            return None

    # Bulk operations
    def bulk_delete(self, notification_ids: List[str]) -> int:
        """Bulk delete notifications"""
        with self._lock:
            count = 0
            for notification_id in notification_ids:
                if notification_id in self._notifications:
                    del self._notifications[notification_id]
                    count += 1
            return count

    def bulk_archive(self, notification_ids: List[str]) -> int:
        """Bulk archive notifications"""
        with self._lock:
            count = 0
            for notification_id in notification_ids:
                notification = self._notifications.get(notification_id)
                if notification:
                    notification.status = NotificationStatus.ARCHIVED
                    notification.archived_at = datetime.now()
                    count += 1
            return count

    # Preferences
    def set_preference(
        self,
        agent_id: str,
        channel: NotificationChannel,
        enabled: bool = True,
        quiet_hours_start: str = "22:00",
        quiet_hours_end: str = "08:00",
        email_digest: str = "instant"
    ) -> NotificationPreference:
        """Set notification preference"""
        with self._lock:
            pref = NotificationPreference(
                agent_id=agent_id,
                channel=channel,
                enabled=enabled,
                quiet_hours_start=quiet_hours_start,
                quiet_hours_end=quiet_hours_end,
                email_digest=email_digest
            )

            if agent_id not in self._preferences:
                self._preferences[agent_id] = []

            # Update or add
            existing = [p for p in self._preferences[agent_id] if p.channel == channel]
            if existing:
                existing[0].enabled = enabled
                existing[0].quiet_hours_start = quiet_hours_start
                existing[0].quiet_hours_end = quiet_hours_end
                existing[0].email_digest = email_digest
                existing[0].updated_at = datetime.now()
            else:
                self._preferences[agent_id].append(pref)

            return pref

    def get_preferences(self, agent_id: str) -> List[NotificationPreference]:
        """Get notification preferences for agent"""
        with self._lock:
            return self._preferences.get(agent_id, [])

    def is_channel_enabled(self, agent_id: str, channel: NotificationChannel) -> bool:
        """Check if channel is enabled for agent"""
        with self._lock:
            prefs = self._preferences.get(agent_id, [])
            for pref in prefs:
                if pref.channel == channel:
                    return pref.enabled
            return True  # Default to enabled

    # Templates
    def get_template(self, template_id: str) -> Optional[NotificationTemplate]:
        """Get notification template"""
        with self._lock:
            return self._templates.get(template_id)

    def list_templates(self, notification_type: NotificationType = None) -> List[NotificationTemplate]:
        """List notification templates"""
        with self._lock:
            templates = list(self._templates.values())
            if notification_type:
                templates = [t for t in templates if t.notification_type == notification_type]
            return templates

    def create_from_template(
        self,
        template_id: str,
        notification_id: str,
        agent_id: str,
        sender_id: str = "",
        sender_name: str = "",
        **template_vars
    ) -> Optional[Notification]:
        """Create notification from template"""
        with self._lock:
            template = self._templates.get(template_id)
            if not template:
                return None

            title = template.title_template
            body = template.body_template

            # Replace template variables
            for key, value in template_vars.items():
                placeholder = f"{{{key}}}"
                title = title.replace(placeholder, str(value))
                body = body.replace(placeholder, str(value))

            return self.create_notification(
                notification_id=notification_id,
                title=title,
                body=body,
                agent_id=agent_id,
                sender_id=sender_id,
                sender_name=sender_name,
                notification_type=template.notification_type,
                category=template.category,
                priority=template.priority,
                channel=template.default_channel,
                tags=template.tags
            )

    # Statistics
    def get_statistics(self, agent_id: str) -> NotificationStats:
        """Get notification statistics"""
        with self._lock:
            notifications = self.list_notifications(agent_id=agent_id, include_archived=True, limit=10000)

            stats = NotificationStats(agent_id=agent_id)
            stats.total_notifications = len(notifications)
            stats.unread_count = len([n for n in notifications if n.status == NotificationStatus.UNREAD])
            stats.read_count = len([n for n in notifications if n.status == NotificationStatus.READ])
            stats.archived_count = len([n for n in notifications if n.status == NotificationStatus.ARCHIVED])

            # By category
            for n in notifications:
                c = n.category.value
                stats.by_category[c] = stats.by_category.get(c, 0) + 1

            # By priority
            for n in notifications:
                p = n.priority.value
                stats.by_priority[p] = stats.by_priority.get(p, 0) + 1

            # By type
            for n in notifications:
                t = n.notification_type.value
                stats.by_type[t] = stats.by_type.get(t, 0) + 1

            return stats

    # Unread count
    def get_unread_count(self, agent_id: str) -> int:
        """Get unread notification count"""
        with self._lock:
            count = 0
            for notification in self._notifications.values():
                if notification.agent_id == agent_id and notification.status == NotificationStatus.UNREAD:
                    count += 1
            return count

    # Cleanup
    def delete_expired(self) -> int:
        """Delete expired notifications"""
        with self._lock:
            now = datetime.now()
            count = 0
            expired_ids = [
                nid for nid, n in self._notifications.items()
                if n.expires_at and n.expires_at < now
            ]
            for nid in expired_ids:
                del self._notifications[nid]
                count += 1
            return count

    # Quick send helpers
    def send_task_notification(
        self,
        notification_id: str,
        agent_id: str,
        task_title: str,
        notification_type: NotificationType,
        sender_id: str = "",
        sender_name: str = ""
    ) -> Notification:
        """Send task-related notification"""
        templates = {
            NotificationType.TASK_ASSIGNED: ("New Task Assigned", f"You have been assigned to task: {task_title}"),
            NotificationType.TASK_COMPLETED: ("Task Completed", f"Task '{task_title}' has been completed."),
            NotificationType.TASK_UPDATED: ("Task Updated", f"Task '{task_title}' has been updated."),
            NotificationType.TASK_DUE_SOON: ("Task Due Soon", f"Task '{task_title}' is due soon."),
            NotificationType.TASK_OVERDUE: ("Task Overdue", f"Task '{task_title}' is overdue!"),
        }

        title, body = templates.get(notification_type, ("Task Notification", task_title))

        return self.create_notification(
            notification_id=notification_id,
            title=title,
            body=body,
            agent_id=agent_id,
            sender_id=sender_id,
            sender_name=sender_name,
            notification_type=notification_type,
            category=NotificationCategory.TASK,
            priority=NotificationPriority.HIGH if notification_type in [NotificationType.TASK_OVERDUE] else NotificationPriority.NORMAL,
            related_to_id=notification_id.replace("notif_", ""),
            related_to_type="task"
        )

    def send_alert(
        self,
        notification_id: str,
        agent_id: str,
        title: str,
        body: str,
        priority: NotificationPriority = NotificationPriority.HIGH
    ) -> Notification:
        """Send alert notification"""
        return self.create_notification(
            notification_id=notification_id,
            title=title,
            body=body,
            agent_id=agent_id,
            notification_type=NotificationType.SYSTEM_ALERT,
            category=NotificationCategory.ALERT,
            priority=priority
        )


# Global instance
agent_notification = NotificationManager()
