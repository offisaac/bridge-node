"""Notification Center Module

Centralized multi-channel notification system.
"""
import threading
import json
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid


class NotificationChannel(str, Enum):
    """Notification channels."""
    EMAIL = "email"
    SMS = "sms"
    WEBHOOK = "webhook"
    PUSH = "push"
    SLACK = "slack"
    DISCORD = "discord"
    DINGTALK = "dingtalk"


class NotificationPriority(str, Enum):
    """Notification priority."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class NotificationStatus(str, Enum):
    """Notification status."""
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    DELIVERED = "delivered"


@dataclass
class Notification:
    """Notification."""
    id: str
    channel: NotificationChannel
    priority: NotificationPriority
    title: str
    message: str
    recipient: str
    status: NotificationStatus
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    sent_at: Optional[str] = None
    metadata: Dict = field(default_factory=dict)
    error: Optional[str] = None


@dataclass
class NotificationTemplate:
    """Notification template."""
    id: str
    name: str
    channel: NotificationChannel
    title_template: str
    message_template: str
    variables: List[str] = field(default_factory=list)


class NotificationCenter:
    """Centralized notification system."""

    def __init__(self, max_notifications: int = 10000):
        self.max_notifications = max_notifications
        self._lock = threading.RLock()
        self._notifications: List[Notification] = []
        self._templates: Dict[str, NotificationTemplate] = {}
        self._handlers: Dict[NotificationChannel, Callable] = {}

    def register_handler(self, channel: NotificationChannel, handler: Callable):
        """Register a notification handler."""
        self._handlers[channel] = handler

    def add_template(self, template: NotificationTemplate):
        """Add a notification template."""
        self._templates[template.id] = template

    def create_notification(
        self,
        channel: NotificationChannel,
        recipient: str,
        title: str,
        message: str,
        priority: NotificationPriority = NotificationPriority.NORMAL,
        metadata: Dict = None
    ) -> str:
        """Create a notification."""
        notification = Notification(
            id=str(uuid.uuid4())[:8],
            channel=channel,
            priority=priority,
            title=title,
            message=message,
            recipient=recipient,
            status=NotificationStatus.PENDING,
            metadata=metadata or {}
        )

        with self._lock:
            self._notifications.append(notification)
            if len(self._notifications) > self.max_notifications:
                self._notifications = self._notifications[-self.max_notifications:]

        return notification.id

    def send_notification(self, notification_id: str) -> bool:
        """Send a notification."""
        with self._lock:
            notification = next(
                (n for n in self._notifications if n.id == notification_id),
                None
            )
            if not notification:
                return False

        # Get handler
        handler = self._handlers.get(notification.channel)

        try:
            if handler:
                result = handler(notification)
                notification.status = NotificationStatus.SENT if result else NotificationStatus.FAILED
            else:
                # Simulate sending
                notification.status = NotificationStatus.SENT

            notification.sent_at = datetime.now().isoformat()
            return notification.status == NotificationStatus.SENT

        except Exception as e:
            notification.status = NotificationStatus.FAILED
            notification.error = str(e)
            return False

    def send(
        self,
        channel: NotificationChannel,
        recipient: str,
        title: str,
        message: str,
        priority: NotificationPriority = NotificationPriority.NORMAL,
        wait: bool = True
    ) -> str:
        """Create and optionally send a notification."""
        notification_id = self.create_notification(
            channel=channel,
            recipient=recipient,
            title=title,
            message=message,
            priority=priority
        )

        if wait:
            self.send_notification(notification_id)

        return notification_id

    def get_notification(self, notification_id: str) -> Optional[Dict]:
        """Get notification by ID."""
        with self._lock:
            notification = next(
                (n for n in self._notifications if n.id == notification_id),
                None
            )
            if not notification:
                return None

            return {
                "id": notification.id,
                "channel": notification.channel.value,
                "priority": notification.priority.value,
                "title": notification.title,
                "message": notification.message,
                "recipient": notification.recipient,
                "status": notification.status.value,
                "created_at": notification.created_at,
                "sent_at": notification.sent_at,
                "error": notification.error
            }

    def get_notifications(
        self,
        channel: NotificationChannel = None,
        status: NotificationStatus = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get notifications with filters."""
        with self._lock:
            notifications = self._notifications.copy()

        if channel:
            notifications = [n for n in notifications if n.channel == channel]
        if status:
            notifications = [n for n in notifications if n.status == status]

        notifications = sorted(notifications, key=lambda x: x.created_at, reverse=True)

        return [
            {
                "id": n.id,
                "channel": n.channel.value,
                "priority": n.priority.value,
                "title": n.title,
                "recipient": n.recipient,
                "status": n.status.value,
                "created_at": n.created_at,
                "sent_at": n.sent_at
            }
            for n in notifications[:limit]
        ]

    def get_stats(self) -> Dict:
        """Get notification statistics."""
        with self._lock:
            total = len(self._notifications)
            by_channel = {}
            by_status = {}
            by_priority = {}

            for n in self._notifications:
                channel = n.channel.value
                status = n.status.value
                priority = n.priority.value

                by_channel[channel] = by_channel.get(channel, 0) + 1
                by_status[status] = by_status.get(status, 0) + 1
                by_priority[priority] = by_priority.get(priority, 0) + 1

            return {
                "total": total,
                "by_channel": by_channel,
                "by_status": by_status,
                "by_priority": by_priority
            }


# Default handlers
def email_handler(notification: Notification) -> bool:
    """Handle email notifications."""
    print(f"[EMAIL] To: {notification.recipient}, Subject: {notification.title}")
    return True


def sms_handler(notification: Notification) -> bool:
    """Handle SMS notifications."""
    print(f"[SMS] To: {notification.recipient}, Message: {notification.message[:50]}")
    return True


def webhook_handler(notification: Notification) -> bool:
    """Handle webhook notifications."""
    print(f"[WEBHOOK] To: {notification.recipient}, Title: {notification.title}")
    return True


def slack_handler(notification: Notification) -> bool:
    """Handle Slack notifications."""
    print(f"[SLACK] To: {notification.recipient}, Title: {notification.title}")
    return True


# Global notification center
notification_center = NotificationCenter()

# Register default handlers
notification_center.register_handler(NotificationChannel.EMAIL, email_handler)
notification_center.register_handler(NotificationChannel.SMS, sms_handler)
notification_center.register_handler(NotificationChannel.WEBHOOK, webhook_handler)
notification_center.register_handler(NotificationChannel.SLACK, slack_handler)
