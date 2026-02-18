"""Agent Timeout Module

Agent timeout management with configurable timeouts and handling.
"""
import time
import threading
import uuid
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from collections import defaultdict


class TimeoutStrategy(str, Enum):
    """Timeout strategies."""
    HARD = "hard"
    SOFT = "soft"
    GRACEFUL = "graceful"
    EXTENDABLE = "extendable"


class TimeoutState(str, Enum):
    """Timeout states."""
    ACTIVE = "active"
    TIMEOUT = "timeout"
    EXTENDED = "extended"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TimeoutScope(str, Enum):
    """Timeout scopes."""
    REQUEST = "request"
    TASK = "task"
    SESSION = "session"
    IDLE = "idle"


@dataclass
class TimeoutPolicy:
    """Timeout policy configuration."""
    default_timeout_seconds: int = 300
    max_timeout_seconds: int = 3600
    warning_threshold_percent: float = 0.8
    strategy: TimeoutStrategy = TimeoutStrategy.GRACEFUL
    enable_extension: bool = True
    max_extensions: int = 3
    extension_increment_seconds: int = 60


@dataclass
class TimeoutEntry:
    """Timeout entry."""
    id: str
    agent_id: str
    scope: TimeoutScope
    state: TimeoutState
    started_at: float
    expires_at: float
    warning_at: float = 0
    extended_count: int = 0
    last_extension: float = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


class AgentTimeoutManager:
    """Manage agent timeouts."""

    def __init__(self):
        self._lock = threading.RLock()
        self._timeouts: Dict[str, TimeoutEntry] = {}
        self._agent_timeouts: Dict[str, List[str]] = defaultdict(list)
        self._policy = TimeoutPolicy()
        self._timeout_callbacks: Dict[str, Callable] = {}
        self._warning_callbacks: Dict[str, Callable] = {}
        self._monitor_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._check_interval = 1.0

    def configure(
        self,
        default_timeout_seconds: int = 300,
        max_timeout_seconds: int = 3600,
        warning_threshold_percent: float = 0.8,
        strategy: str = "graceful",
        enable_extension: bool = True,
        max_extensions: int = 3,
        extension_increment_seconds: int = 60
    ):
        """Configure timeout policy."""
        with self._lock:
            self._policy = TimeoutPolicy(
                default_timeout_seconds=default_timeout_seconds,
                max_timeout_seconds=max_timeout_seconds,
                warning_threshold_percent=warning_threshold_percent,
                strategy=TimeoutStrategy(strategy),
                enable_extension=enable_extension,
                max_extensions=max_extensions,
                extension_increment_seconds=extension_increment_seconds
            )

    def register_timeout_callback(self, scope: TimeoutScope, callback: Callable):
        """Register timeout callback for a scope."""
        with self._lock:
            self._timeout_callbacks[scope.value] = callback

    def register_warning_callback(self, scope: TimeoutScope, callback: Callable):
        """Register warning callback for a scope."""
        with self._lock:
            self._warning_callbacks[scope.value] = callback

    def _start_monitor(self):
        """Start timeout monitor thread."""
        if self._monitor_thread and self._monitor_thread.is_alive():
            return
        self._stop_event.clear()
        self._monitor_thread = threading.Thread(target=self._run_monitor, daemon=True)
        self._monitor_thread.start()

    def _run_monitor(self):
        """Monitor timeouts."""
        while not self._stop_event.is_set():
            current_time = time.time()
            with self._lock:
                for timeout_id, entry in list(self._timeouts.items()):
                    if entry.state not in (TimeoutState.ACTIVE, TimeoutState.EXTENDED):
                        continue

                    # Check warning threshold
                    if entry.warning_at > 0 and current_time >= entry.warning_at and entry.state == TimeoutState.ACTIVE:
                        callback = self._warning_callbacks.get(entry.scope.value)
                        if callback:
                            try:
                                callback(entry.agent_id, timeout_id, entry.metadata)
                            except:
                                pass

                    # Check timeout
                    if current_time >= entry.expires_at:
                        entry.state = TimeoutState.TIMEOUT
                        callback = self._timeout_callbacks.get(entry.scope.value)
                        if callback:
                            try:
                                callback(entry.agent_id, timeout_id, entry.metadata)
                            except:
                                pass
            time.sleep(self._check_interval)

    def start_timeout(
        self,
        agent_id: str,
        scope: str,
        timeout_seconds: int = None,
        metadata: Dict[str, Any] = None
    ) -> str:
        """Start a timeout for an agent."""
        with self._lock:
            self._start_monitor()

            timeout_id = str(uuid.uuid4())[:12]
            timeout_seconds = timeout_seconds or self._policy.default_timeout_seconds
            timeout_seconds = min(timeout_seconds, self._policy.max_timeout_seconds)

            current_time = time.time()
            warning_at = current_time + (timeout_seconds * self._policy.warning_threshold_percent)

            entry = TimeoutEntry(
                id=timeout_id,
                agent_id=agent_id,
                scope=TimeoutScope(scope),
                state=TimeoutState.ACTIVE,
                started_at=current_time,
                expires_at=current_time + timeout_seconds,
                warning_at=warning_at,
                metadata=metadata or {}
            )

            self._timeouts[timeout_id] = entry
            self._agent_timeouts[agent_id].append(timeout_id)

            return timeout_id

    def extend_timeout(
        self,
        timeout_id: str,
        additional_seconds: int = None
    ) -> bool:
        """Extend a timeout."""
        with self._lock:
            entry = self._timeouts.get(timeout_id)
            if not entry:
                return False

            if entry.state != TimeoutState.ACTIVE and entry.state != TimeoutState.EXTENDED:
                return False

            if not self._policy.enable_extension:
                return False

            if entry.extended_count >= self._policy.max_extensions:
                return False

            additional_seconds = additional_seconds or self._policy.extension_increment_seconds
            additional_seconds = min(additional_seconds, self._policy.max_timeout_seconds)

            entry.expires_at += additional_seconds
            entry.extended_count += 1
            entry.last_extension = time.time()
            entry.state = TimeoutState.EXTENDED

            # Update warning time
            entry.warning_at = entry.started_at + (entry.expires_at - entry.started_at) * self._policy.warning_threshold_percent

            return True

    def complete_timeout(self, timeout_id: str) -> bool:
        """Mark a timeout as completed."""
        with self._lock:
            entry = self._timeouts.get(timeout_id)
            if not entry:
                return False

            entry.state = TimeoutState.COMPLETED
            return True

    def cancel_timeout(self, timeout_id: str) -> bool:
        """Cancel a timeout."""
        with self._lock:
            entry = self._timeouts.get(timeout_id)
            if not entry:
                return False

            entry.state = TimeoutState.CANCELLED
            return True

    def get_timeout(self, timeout_id: str) -> Optional[Dict]:
        """Get timeout entry."""
        with self._lock:
            entry = self._timeouts.get(timeout_id)
            if not entry:
                return None

            remaining = max(0, entry.expires_at - time.time())
            return {
                "id": entry.id,
                "agent_id": entry.agent_id,
                "scope": entry.scope.value,
                "state": entry.state.value,
                "started_at": entry.started_at,
                "expires_at": entry.expires_at,
                "remaining_seconds": int(remaining),
                "extended_count": entry.extended_count,
                "last_extension": entry.last_extension,
                "metadata": entry.metadata
            }

    def get_agent_timeouts(self, agent_id: str) -> List[Dict]:
        """Get all timeouts for an agent."""
        with self._lock:
            timeout_ids = self._agent_timeouts.get(agent_id, [])
            timeouts = []
            for tid in timeout_ids:
                entry = self.get_timeout(tid)
                if entry:
                    timeouts.append(entry)
            return timeouts

    def get_active_timeouts(self, limit: int = 100) -> List[Dict]:
        """Get all active timeouts."""
        with self._lock:
            active = [
                self.get_timeout(tid)
                for tid, entry in self._timeouts.items()
                if entry.state in (TimeoutState.ACTIVE, TimeoutState.EXTENDED)
            ]
            return [t for t in timeouts if t][:limit]

    def get_timeouts_by_scope(self, scope: str, limit: int = 100) -> List[Dict]:
        """Get timeouts by scope."""
        with self._lock:
            timeouts = [
                self.get_timeout(tid)
                for tid, entry in self._timeouts.items()
                if entry.scope.value == scope
            ]
            return [t for t in timeouts if t][:limit]

    def get_statistics(self) -> Dict:
        """Get timeout statistics."""
        with self._lock:
            total = len(self._timeouts)
            active = sum(1 for e in self._timeouts.values() if e.state == TimeoutState.ACTIVE)
            extended = sum(1 for e in self._timeouts.values() if e.state == TimeoutState.EXTENDED)
            timeout = sum(1 for e in self._timeouts.values() if e.state == TimeoutState.TIMEOUT)
            completed = sum(1 for e in self._timeouts.values() if e.state == TimeoutState.COMPLETED)
            cancelled = sum(1 for e in self._timeouts.values() if e.state == TimeoutState.CANCELLED)

            total_extensions = sum(e.extended_count for e in self._timeouts.values())

            by_scope = defaultdict(int)
            for entry in self._timeouts.values():
                by_scope[entry.scope.value] += 1

            return {
                "total_timeouts": total,
                "active": active,
                "extended": extended,
                "timeout": timeout,
                "completed": completed,
                "cancelled": cancelled,
                "total_extensions": total_extensions,
                "timeouts_by_scope": dict(by_scope),
                "agents_with_timeouts": len(self._agent_timeouts),
                "policy": {
                    "default_timeout_seconds": self._policy.default_timeout_seconds,
                    "max_timeout_seconds": self._policy.max_timeout_seconds,
                    "strategy": self._policy.strategy.value,
                    "enable_extension": self._policy.enable_extension,
                    "max_extensions": self._policy.max_extensions
                }
            }

    def shutdown(self):
        """Shutdown timeout manager."""
        self._stop_event.set()
        if self._monitor_thread:
            self._monitor_thread.join(timeout=5)


# Global agent timeout instance
agent_timeout = AgentTimeoutManager()
