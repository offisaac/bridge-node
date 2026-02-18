"""Agent Termination Module

Agent termination process handling including graceful shutdown, resource cleanup,
termination requests, approval workflows, and post-termination analytics.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class TerminationType(str, Enum):
    """Termination types."""
    MANUAL = "manual"
    SCHEDULED = "scheduled"
    POLICY_VIOLATION = "policy_violation"
    LICENSE_EXPIRED = "license_expired"
    IDLE_TIMEOUT = "idle_timeout"
    RESOURCE_LIMIT = "resource_limit"
    SECURITY_BREACH = "security_breach"
    USER_REQUEST = "user_request"
    SYSTEM_SHUTDOWN = "system_shutdown"
    UPGRADE = "upgrade"


class TerminationStatus(str, Enum):
    """Termination status."""
    PENDING = "pending"
    APPROVED = "approved"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"
    BLOCKED = "blocked"


class TerminationPriority(str, Enum):
    """Termination priority."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class CleanupLevel(str, Enum):
    """Resource cleanup levels."""
    NONE = "none"
    MINIMAL = "minimal"
    STANDARD = "standard"
    COMPLETE = "complete"
    SECURE = "secure"


@dataclass
class TerminationRule:
    """Termination rule."""
    id: str
    name: str
    termination_type: TerminationType
    priority: TerminationPriority
    grace_period_seconds: int = 300
    cleanup_level: CleanupLevel = CleanupLevel.STANDARD
    require_approval: bool = True
    approver_roles: List[str] = field(default_factory=list)
    notify_before_seconds: int = 60
    enable_rollback: bool = False
    rollback_window_seconds: int = 300
    enabled: bool = True


@dataclass
class TerminationRequest:
    """Termination request."""
    id: str
    agent_id: str
    termination_type: TerminationType
    priority: TerminationPriority
    status: TerminationStatus
    requested_by: str
    requested_at: float
    approved_by: str = ""
    approved_at: float = 0.0
    started_at: float = 0.0
    completed_at: float = 0.0
    reason: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TerminationEvent:
    """Termination event."""
    id: str
    termination_id: str
    agent_id: str
    event_type: str  # requested, approved, started, completed, failed, cancelled
    timestamp: float
    actor: str = ""
    details: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CleanupTask:
    """Cleanup task."""
    id: str
    termination_id: str
    resource_type: str  # memory, disk, network, database, cache, etc.
    status: str  # pending, in_progress, completed, failed
    started_at: float = 0.0
    completed_at: float = 0.0
    result: str = ""


@dataclass
class TerminationConfig:
    """Termination configuration."""
    default_grace_period: int = 300
    default_cleanup_level: CleanupLevel = CleanupLevel.STANDARD
    check_interval: int = 30
    enable_auto_cleanup: bool = True
    max_concurrent_terminations: int = 10
    enable_rollback: bool = True
    rollback_window: int = 300
    enable_approval_workflow: bool = True
    default_approvers: List[str] = field(default_factory=list)
    enable_notifications: bool = True
    cleanup_timeout: int = 600


@dataclass
class TerminationStats:
    """Termination statistics."""
    total_terminations: int = 0
    completed_terminations: int = 0
    failed_terminations: int = 0
    cancelled_terminations: int = 0
    average_duration: float = 0.0
    total_cleanup_time: float = 0.0


class TerminationManager:
    """Termination management engine."""

    def __init__(self, config: TerminationConfig = None):
        self._lock = threading.RLock()
        self._config = config or TerminationConfig()
        self._requests: Dict[str, TerminationRequest] = {}
        self._rules: Dict[str, TerminationRule] = {}
        self._events: List[TerminationEvent] = []
        self._cleanup_tasks: Dict[str, List[CleanupTask]] = defaultdict(list)
        self._stats = TerminationStats()
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._active_terminations: Dict[str, bool] = {}
        self._default_rule()

    def _default_rule(self):
        """Create default termination rule."""
        rule = TerminationRule(
            id="default",
            name="Default Rule",
            termination_type=TerminationType.MANUAL,
            priority=TerminationPriority.NORMAL,
            grace_period_seconds=self._config.default_grace_period,
            cleanup_level=self._config.default_cleanup_level,
            require_approval=self._config.enable_approval_workflow,
            approver_roles=self._config.default_approvers,
            enabled=True
        )
        self._rules["default"] = rule

    def create_request(
        self,
        agent_id: str,
        termination_type: TerminationType,
        requested_by: str,
        reason: str = "",
        priority: TerminationPriority = TerminationPriority.NORMAL,
        metadata: Dict[str, Any] = None
    ) -> TerminationRequest:
        """Create termination request."""
        with self._lock:
            # Check concurrent terminations
            active_count = sum(1 for t in self._requests.values()
                            if t.status == TerminationStatus.IN_PROGRESS)
            if active_count >= self._config.max_concurrent_terminations:
                raise Exception("Max concurrent terminations reached")

            request = TerminationRequest(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                termination_type=termination_type,
                priority=priority,
                status=TerminationStatus.PENDING,
                requested_by=requested_by,
                requested_at=time.time(),
                reason=reason,
                metadata=metadata or {}
            )
            self._requests[request.id] = request
            self._add_event(request.id, request.agent_id, "requested", requested_by, reason)

            return request

    def approve_request(
        self,
        termination_id: str,
        approved_by: str
    ) -> Optional[TerminationRequest]:
        """Approve termination request."""
        with self._lock:
            request = self._requests.get(termination_id)
            if not request:
                return None

            if request.status != TerminationStatus.PENDING:
                return None

            request.status = TerminationStatus.APPROVED
            request.approved_by = approved_by
            request.approved_at = time.time()

            self._add_event(termination_id, request.agent_id, "approved", approved_by)
            return request

    def reject_request(
        self,
        termination_id: str,
        rejected_by: str,
        reason: str
    ) -> Optional[TerminationRequest]:
        """Reject termination request."""
        with self._lock:
            request = self._requests.get(termination_id)
            if not request:
                return None

            request.status = TerminationStatus.CANCELLED
            self._add_event(termination_id, request.agent_id, "rejected", rejected_by, reason)
            return request

    def start_termination(self, termination_id: str) -> Optional[TerminationRequest]:
        """Start termination process."""
        with self._lock:
            request = self._requests.get(termination_id)
            if not request:
                return None

            if request.status not in [TerminationStatus.APPROVED, TerminationStatus.PENDING]:
                if request.status != TerminationStatus.PENDING or not self._config.enable_approval_workflow:
                    return None

            request.status = TerminationStatus.IN_PROGRESS
            request.started_at = time.time()
            self._active_terminations[request.agent_id] = True

            # Create cleanup tasks
            self._create_cleanup_tasks(request)

            self._add_event(termination_id, request.agent_id, "started", "system")
            return request

    def _create_cleanup_tasks(self, request: TerminationRequest):
        """Create cleanup tasks for termination."""
        resource_types = ["memory", "disk", "network", "database", "cache", "process"]
        tasks = []

        for resource in resource_types:
            task = CleanupTask(
                id=str(uuid.uuid4())[:12],
                termination_id=request.id,
                resource_type=resource,
                status="pending"
            )
            tasks.append(task)

        self._cleanup_tasks[request.id] = tasks

    def complete_cleanup_task(
        self,
        termination_id: str,
        resource_type: str,
        result: str = "completed"
    ) -> bool:
        """Complete a cleanup task."""
        with self._lock:
            tasks = self._cleanup_tasks.get(termination_id, [])
            for task in tasks:
                if task.resource_type == resource_type and task.status == "pending":
                    task.status = "completed"
                    task.completed_at = time.time()
                    task.result = result
                    return True
            return False

    def complete_termination(
        self,
        termination_id: str,
        success: bool = True
    ) -> Optional[TerminationRequest]:
        """Complete termination process."""
        with self._lock:
            request = self._requests.get(termination_id)
            if not request:
                return None

            request.status = TerminationStatus.COMPLETED if success else TerminationStatus.FAILED
            request.completed_at = time.time()
            self._active_terminations[request.agent_id] = False

            # Update stats
            duration = request.completed_at - request.started_at
            self._stats.total_terminations += 1
            if success:
                self._stats.completed_terminations += 1
                self._stats.total_cleanup_time += duration
                if self._stats.completed_terminations > 0:
                    self._stats.average_duration = (
                        self._stats.total_cleanup_time / self._stats.completed_terminations
                    )
            else:
                self._stats.failed_terminations += 1

            self._add_event(termination_id, request.agent_id, "completed", "system")
            return request

    def cancel_termination(
        self,
        termination_id: str,
        cancelled_by: str
    ) -> Optional[TerminationRequest]:
        """Cancel termination process."""
        with self._lock:
            request = self._requests.get(termination_id)
            if not request:
                return None

            if request.status == TerminationStatus.COMPLETED:
                return None

            request.status = TerminationStatus.CANCELLED
            request.completed_at = time.time()
            self._active_terminations[request.agent_id] = False
            self._stats.cancelled_terminations += 1

            self._add_event(termination_id, request.agent_id, "cancelled", cancelled_by)
            return request

    def rollback_termination(self, termination_id: str) -> Optional[TerminationRequest]:
        """Rollback termination if within window."""
        with self._lock:
            request = self._requests.get(termination_id)
            if not request:
                return None

            if not self._config.enable_rollback:
                return None

            if request.status != TerminationStatus.COMPLETED:
                return None

            # Check if within rollback window
            time_since_completion = time.time() - request.completed_at
            if time_since_completion > self._config.rollback_window:
                return None

            # Reset status
            request.status = TerminationStatus.PENDING
            self._active_terminations[request.agent_id] = False

            self._add_event(termination_id, request.agent_id, "rolled_back", "system")
            return request

    def get_request(self, termination_id: str) -> Optional[TerminationRequest]:
        """Get termination request."""
        with self._lock:
            return self._requests.get(termination_id)

    def get_agent_termination(self, agent_id: str) -> Optional[TerminationRequest]:
        """Get active termination for agent."""
        with self._lock:
            for request in self._requests.values():
                if request.agent_id == agent_id and request.status in [
                    TerminationStatus.PENDING,
                    TerminationStatus.APPROVED,
                    TerminationStatus.IN_PROGRESS
                ]:
                    return request
            return None

    def get_pending_requests(self) -> List[TerminationRequest]:
        """Get pending termination requests."""
        with self._lock:
            return [r for r in self._requests.values()
                   if r.status == TerminationStatus.PENDING]

    def get_in_progress_terminations(self) -> List[TerminationRequest]:
        """Get in-progress terminations."""
        with self._lock:
            return [r for r in self._requests.values()
                   if r.status == TerminationStatus.IN_PROGRESS]

    def get_events(
        self,
        termination_id: str = None,
        agent_id: str = None,
        limit: int = 100
    ) -> List[TerminationEvent]:
        """Get termination events."""
        with self._lock:
            events = self._events
            if termination_id:
                events = [e for e in events if e.termination_id == termination_id]
            if agent_id:
                events = [e for e in events if e.agent_id == agent_id]
            return events[-limit:]

    def get_stats(self) -> Dict[str, Any]:
        """Get termination statistics."""
        with self._lock:
            return {
                "total_terminations": self._stats.total_terminations,
                "completed_terminations": self._stats.completed_terminations,
                "failed_terminations": self._stats.failed_terminations,
                "cancelled_terminations": self._stats.cancelled_terminations,
                "average_duration": self._stats.average_duration,
                "active_terminations": len(self._active_terminations)
            }

    def get_config(self) -> Dict[str, Any]:
        """Get termination configuration."""
        return {
            "default_grace_period": self._config.default_grace_period,
            "default_cleanup_level": self._config.default_cleanup_level.value,
            "max_concurrent_terminations": self._config.max_concurrent_terminations,
            "enable_rollback": self._config.enable_rollback,
            "rollback_window": self._config.rollback_window,
            "enable_approval_workflow": self._config.enable_approval_workflow,
            "cleanup_timeout": self._config.cleanup_timeout
        }

    def update_config(
        self,
        default_grace_period: int = None,
        default_cleanup_level: CleanupLevel = None,
        max_concurrent_terminations: int = None,
        enable_rollback: bool = None,
        rollback_window: int = None,
        enable_approval_workflow: bool = None
    ):
        """Update termination configuration."""
        with self._lock:
            if default_grace_period is not None:
                self._config.default_grace_period = default_grace_period
            if default_cleanup_level is not None:
                self._config.default_cleanup_level = default_cleanup_level
            if max_concurrent_terminations is not None:
                self._config.max_concurrent_terminations = max_concurrent_terminations
            if enable_rollback is not None:
                self._config.enable_rollback = enable_rollback
            if rollback_window is not None:
                self._config.rollback_window = rollback_window
            if enable_approval_workflow is not None:
                self._config.enable_approval_workflow = enable_approval_workflow

    def add_rule(self, rule: TerminationRule) -> str:
        """Add termination rule."""
        with self._lock:
            self._rules[rule.id] = rule
            return rule.id

    def get_rule(self, rule_id: str) -> Optional[TerminationRule]:
        """Get termination rule."""
        with self._lock:
            return self._rules.get(rule_id)

    def get_rules(self) -> List[TerminationRule]:
        """Get all termination rules."""
        with self._lock:
            return list(self._rules.values())

    def _add_event(
        self,
        termination_id: str,
        agent_id: str,
        event_type: str,
        actor: str = "",
        details: str = ""
    ):
        """Add termination event."""
        event = TerminationEvent(
            id=str(uuid.uuid4())[:12],
            termination_id=termination_id,
            agent_id=agent_id,
            event_type=event_type,
            timestamp=time.time(),
            actor=actor,
            details=details
        )
        self._events.append(event)

    def register_hook(self, event: str, callback: Callable):
        """Register event hook."""
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        """Trigger event hook."""
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


class AgentTermination:
    """Main Agent Termination coordinating all termination operations."""

    def __init__(self):
        self.manager = TerminationManager()
        self._lock = threading.RLock()

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "termination_active": True,
                "pending_requests": len(self.manager.get_pending_requests()),
                "in_progress": len(self.manager.get_in_progress_terminations()),
                "stats": self.manager.get_stats()
            }


# Global instance
agent_termination = AgentTermination()
