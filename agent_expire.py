"""Agent Expire Module

Agent expiration handling system including TTL management, auto-expiration,
expiration notifications, and cleanup of expired agents.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class ExpireType(str, Enum):
    """Expiration types."""
    TTL = "ttl"
    SCHEDULED = "scheduled"
    IDLE = "idle"
    MANUAL = "manual"
    INACTIVITY = "inactivity"
    LICENSE = "license"
    QUOTA = "quota"


class ExpireStatus(str, Enum):
    """Expiration status."""
    ACTIVE = "active"
    EXPIRING = "expiring"
    EXPIRED = "expired"
    EXTENDED = "extended"
    RENEWED = "renewed"


class ExpireAction(str, Enum):
    """Actions to take on expiration."""
    NOTIFY = "notify"
    SUSPEND = "suspend"
    TERMINATE = "terminate"
    ARCHIVE = "archive"
    DELETE = "delete"
    RENEW = "renew"


@dataclass
class ExpirationRule:
    """Expiration rule."""
    id: str
    name: str
    expire_type: ExpireType
    ttl_seconds: int = 86400
    grace_period_seconds: int = 3600
    actions: List[ExpireAction] = field(default_factory=list)
    notify_before_seconds: int = 3600
    auto_renew: bool = False
    max_renewals: int = 0
    enabled: bool = True


@dataclass
class AgentExpiration:
    """Agent expiration record."""
    agent_id: str
    expire_type: ExpireType
    created_at: float
    expires_at: float
    last_activity: float = 0.0
    status: ExpireStatus = ExpireStatus.ACTIVE
    renewal_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ExpirationEvent:
    """Expiration event."""
    id: str
    agent_id: str
    event_type: str  # expiring, expired, renewed, extended
    timestamp: float
    expires_at: float
    action_taken: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ExpirationConfig:
    """Expiration configuration."""
    default_ttl: int = 86400
    grace_period: int = 3600
    check_interval: int = 60
    enable_auto_cleanup: bool = True
    max_expired_age: int = 604800
    enable_notifications: bool = True
    default_actions: List[ExpireAction] = field(default_factory=lambda: [ExpireAction.NOTIFY])
    enable_extension: bool = True
    max_extensions: int = 3
    extension_ttl: int = 86400


class ExpirationManager:
    """Expiration management engine."""

    def __init__(self, config: ExpirationConfig = None):
        self._lock = threading.RLock()
        self._config = config or ExpirationConfig()
        self._expirations: Dict[str, AgentExpiration] = {}
        self._rules: Dict[str, ExpirationRule] = {}
        self._events: List[ExpirationEvent] = []
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._extensions: Dict[str, int] = {}  # agent_id -> extension_count

    def set_expiration(
        self,
        agent_id: str,
        expire_type: ExpireType,
        ttl_seconds: int = None,
        metadata: Dict[str, Any] = None
    ) -> AgentExpiration:
        """Set agent expiration."""
        with self._lock:
            current_time = time.time()
            ttl = ttl_seconds or self._config.default_ttl

            expiration = AgentExpiration(
                agent_id=agent_id,
                expire_type=expire_type,
                created_at=current_time,
                expires_at=current_time + ttl,
                last_activity=current_time,
                metadata=metadata or {}
            )

            self._expirations[agent_id] = expiration

            # Create event
            event = ExpirationEvent(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                event_type="set",
                timestamp=current_time,
                expires_at=expiration.expires_at
            )
            self._events.append(event)

            return expiration

    def get_expiration(self, agent_id: str) -> Optional[AgentExpiration]:
        """Get agent expiration."""
        with self._lock:
            return self._expirations.get(agent_id)

    def update_activity(self, agent_id: str) -> bool:
        """Update last activity time."""
        with self._lock:
            expiration = self._expirations.get(agent_id)
            if expiration:
                expiration.last_activity = time.time()
                return True
            return False

    def check_expiration(self, agent_id: str) -> Optional[ExpireStatus]:
        """Check agent expiration status."""
        with self._lock:
            expiration = self._expirations.get(agent_id)
            if not expiration:
                return None

            current_time = time.time()

            if expiration.status == ExpireStatus.EXPIRED:
                return ExpireStatus.EXPIRED

            # Check if expired
            if current_time >= expiration.expires_at:
                expiration.status = ExpireStatus.EXPIRED

                # Create expired event
                event = ExpirationEvent(
                    id=str(uuid.uuid4())[:12],
                    agent_id=agent_id,
                    event_type="expired",
                    timestamp=current_time,
                    expires_at=expiration.expires_at
                )
                self._events.append(event)

                return ExpireStatus.EXPIRED

            # Check if expiring soon (within notify window)
            notify_window = self._config.grace_period
            if current_time >= expiration.expires_at - notify_window:
                if expiration.status != ExpireStatus.EXPIRING:
                    expiration.status = ExpireStatus.EXPIRING

                    # Create expiring event
                    event = ExpirationEvent(
                        id=str(uuid.uuid4())[:12],
                        agent_id=agent_id,
                        event_type="expiring",
                        timestamp=current_time,
                        expires_at=expiration.expires_at
                    )
                    self._events.append(event)

                return ExpireStatus.EXPIRING

            return ExpireStatus.ACTIVE

    def extend_expiration(
        self,
        agent_id: str,
        ttl_seconds: int = None,
        metadata: Dict[str, Any] = None
    ) -> bool:
        """Extend agent expiration."""
        with self._lock:
            expiration = self._expirations.get(agent_id)
            if not expiration:
                return False

            # Check max extensions
            current_extensions = self._extensions.get(agent_id, 0)
            if current_extensions >= self._config.max_extensions:
                return False

            ttl = ttl_seconds or self._config.extension_ttl
            current_time = time.time()

            # Extend
            expiration.expires_at = current_time + ttl
            expiration.status = ExpireStatus.EXTENDED
            expiration.renewal_count += 1

            self._extensions[agent_id] = current_extensions + 1

            # Create event
            event = ExpirationEvent(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                event_type="extended",
                timestamp=current_time,
                expires_at=expiration.expires_at,
                metadata={"ttl_seconds": ttl, "renewal_count": expiration.renewal_count}
            )
            self._events.append(event)

            return True

    def renew_expiration(
        self,
        agent_id: str,
        ttl_seconds: int = None
    ) -> bool:
        """Renew agent expiration (reset to full TTL)."""
        with self._lock:
            expiration = self._expirations.get(agent_id)
            if not expiration:
                return False

            ttl = ttl_seconds or self._config.default_ttl
            current_time = time.time()

            expiration.expires_at = current_time + ttl
            expiration.status = ExpireStatus.RENEWED
            expiration.renewal_count += 1

            # Reset extension count
            self._extensions[agent_id] = 0

            # Create event
            event = ExpirationEvent(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                event_type="renewed",
                timestamp=current_time,
                expires_at=expiration.expires_at,
                metadata={"ttl_seconds": ttl, "renewal_count": expiration.renewal_count}
            )
            self._events.append(event)

            return True

    def remove_expiration(self, agent_id: str) -> bool:
        """Remove agent expiration."""
        with self._lock:
            if agent_id in self._expirations:
                del self._expirations[agent_id]
                if agent_id in self._extensions:
                    del self._extensions[agent_id]
                return True
            return False

    def get_expiring_soon(self, seconds: int = None) -> List[AgentExpiration]:
        """Get agents expiring within time window."""
        with self._lock:
            window = seconds or self._config.grace_period
            current_time = time.time()

            expiring = []
            for exp in self._expirations.values():
                if exp.expires_at - current_time <= window:
                    expiring.append(exp)

            return expiring

    def get_expired(self) -> List[AgentExpiration]:
        """Get all expired agents."""
        with self._lock:
            current_time = time.time()
            return [
                exp for exp in self._expirations.values()
                if exp.expires_at < current_time
            ]

    def cleanup_expired(self) -> int:
        """Clean up expired agents."""
        with self._lock:
            if not self._config.enable_auto_cleanup:
                return 0

            current_time = time.time()
            count = 0

            expired = [
                agent_id for agent_id, exp in self._expirations.items()
                if exp.expires_at < current_time - self._config.max_expired_age
            ]

            for agent_id in expired:
                del self._expirations[agent_id]
                if agent_id in self._extensions:
                    del self._extensions[agent_id]
                count += 1

            return count

    def get_events(
        self,
        agent_id: str = None,
        event_type: str = None,
        limit: int = 100
    ) -> List[ExpirationEvent]:
        """Get expiration events."""
        with self._lock:
            events = self._events

            if agent_id:
                events = [e for e in events if e.agent_id == agent_id]
            if event_type:
                events = [e for e in events if e.event_type == event_type]

            return events[-limit:]

    def add_rule(self, rule: ExpirationRule):
        """Add expiration rule."""
        with self._lock:
            self._rules[rule.id] = rule

    def remove_rule(self, rule_id: str) -> bool:
        """Remove expiration rule."""
        with self._lock:
            if rule_id in self._rules:
                del self._rules[rule_id]
                return True
            return False

    def get_rule(self, rule_id: str) -> Optional[ExpirationRule]:
        """Get expiration rule."""
        with self._lock:
            return self._rules.get(rule_id)

    def list_rules(self) -> List[ExpirationRule]:
        """List all expiration rules."""
        with self._lock:
            return list(self._rules.values())


class AgentExpire:
    """Agent expiration handling system."""

    def __init__(self, config: ExpirationConfig = None):
        self._manager = ExpirationManager(config)
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def set_expiration(
        self,
        agent_id: str,
        expire_type: str = "ttl",
        ttl_seconds: int = None,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Set agent expiration."""
        expiration = self._manager.set_expiration(
            agent_id=agent_id,
            expire_type=ExpireType(expire_type),
            ttl_seconds=ttl_seconds,
            metadata=metadata
        )
        return {
            "agent_id": expiration.agent_id,
            "expire_type": expiration.expire_type.value,
            "created_at": expiration.created_at,
            "expires_at": expiration.expires_at,
            "status": expiration.status.value
        }

    def get_expiration(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Get agent expiration."""
        expiration = self._manager.get_expiration(agent_id)
        if not expiration:
            return None

        return {
            "agent_id": expiration.agent_id,
            "expire_type": expiration.expire_type.value,
            "created_at": expiration.created_at,
            "expires_at": expiration.expires_at,
            "last_activity": expiration.last_activity,
            "status": expiration.status.value,
            "renewal_count": expiration.renewal_count,
            "metadata": expiration.metadata
        }

    def update_activity(self, agent_id: str) -> bool:
        """Update last activity time."""
        return self._manager.update_activity(agent_id)

    def check_expiration(self, agent_id: str) -> Optional[str]:
        """Check agent expiration status."""
        status = self._manager.check_expiration(agent_id)
        return status.value if status else None

    def extend_expiration(
        self,
        agent_id: str,
        ttl_seconds: int = None,
        metadata: Dict[str, Any] = None
    ) -> bool:
        """Extend agent expiration."""
        return self._manager.extend_expiration(agent_id, ttl_seconds, metadata)

    def renew_expiration(self, agent_id: str, ttl_seconds: int = None) -> bool:
        """Renew agent expiration."""
        return self._manager.renew_expiration(agent_id, ttl_seconds)

    def remove_expiration(self, agent_id: str) -> bool:
        """Remove agent expiration."""
        return self._manager.remove_expiration(agent_id)

    def get_expiring_soon(self, seconds: int = None) -> List[Dict[str, Any]]:
        """Get agents expiring soon."""
        expiring = self._manager.get_expiring_soon(seconds)
        return [
            {
                "agent_id": e.agent_id,
                "expire_type": e.expire_type.value,
                "expires_at": e.expires_at,
                "status": e.status.value
            }
            for e in expiring
        ]

    def get_expired(self) -> List[Dict[str, Any]]:
        """Get expired agents."""
        expired = self._manager.get_expired()
        return [
            {
                "agent_id": e.agent_id,
                "expire_type": e.expire_type.value,
                "expires_at": e.expires_at,
                "status": e.status.value
            }
            for e in expired
        ]

    def cleanup_expired(self) -> int:
        """Clean up expired agents."""
        return self._manager.cleanup_expired()

    def get_events(
        self,
        agent_id: str = None,
        event_type: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get expiration events."""
        events = self._manager.get_events(agent_id, event_type, limit)
        return [
            {
                "id": e.id,
                "agent_id": e.agent_id,
                "event_type": e.event_type,
                "timestamp": e.timestamp,
                "expires_at": e.expires_at,
                "action_taken": e.action_taken,
                "metadata": e.metadata
            }
            for e in events
        ]

    def get_all_expirations(self) -> List[Dict[str, Any]]:
        """Get all agent expirations."""
        return [
            self.get_expiration(agent_id)
            for agent_id in self._manager._expirations.keys()
        ]


# Global instance
agent_expire = AgentExpire()
