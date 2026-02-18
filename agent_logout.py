"""Agent Logout Module

Logout propagation system for agents including session termination,
token revocation, cache invalidation, and multi-service logout coordination.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class LogoutType(str, Enum):
    """Logout types."""
    MANUAL = "manual"
    TIMEOUT = "timeout"
    INACTIVITY = "inactivity"
    SECURITY = "security"
    ADMIN = "admin"
    FORCE = "force"
    SESSION_EXPIRED = "session_expired"


class LogoutStatus(str, Enum):
    """Logout status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"


class SessionState(str, Enum):
    """Session state."""
    ACTIVE = "active"
    IDLE = "idle"
    TERMINATED = "terminated"
    EXPIRED = "expired"


@dataclass
class LogoutTarget:
    """Logout target service/component."""
    name: str
    service_type: str
    endpoint: str = ""
    priority: int = 0
    timeout: int = 30
    required: bool = True
    retry_count: int = 3


@dataclass
class LogoutResult:
    """Result of logout operation on a target."""
    target_name: str
    success: bool
    error: str = ""
    duration_ms: float = 0.0


@dataclass
class Session:
    """User/agent session."""
    id: str
    agent_id: str
    user_id: str
    created_at: float
    last_activity: float
    expires_at: float
    state: SessionState = SessionState.ACTIVE
    ip_address: str = ""
    user_agent: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LogoutRequest:
    """Logout request."""
    id: str
    agent_id: str
    user_id: str
    session_id: str = ""
    logout_type: LogoutType = LogoutType.MANUAL
    reason: str = ""
    created_at: float = field(default_factory=time.time)
    initiated_by: str = ""


@dataclass
class LogoutResponse:
    """Logout response."""
    request_id: str
    agent_id: str
    status: LogoutStatus
    results: List[LogoutResult] = field(default_factory=list)
    total_duration_ms: float = 0.0
    completed_at: float = 0.0
    error: str = ""


@dataclass
class LogoutConfig:
    """Logout configuration."""
    enable_token_revocation: bool = True
    enable_session_termination: bool = True
    enable_cache_invalidation: bool = True
    enable_event_broadcast: bool = True
    enable_hook_execution: bool = True
    default_timeout: int = 30
    max_concurrent_targets: int = 10
    continue_on_failure: bool = True
    cleanup_tokens: bool = True
    cleanup_sessions: bool = True
    invalidate_caches: bool = True


class LogoutManager:
    """Logout management engine."""

    def __init__(self, config: LogoutConfig = None):
        self._lock = threading.RLock()
        self._config = config or LogoutConfig()
        self._sessions: Dict[str, Session] = {}
        self._logout_history: List[LogoutResponse] = []
        self._targets: Dict[str, LogoutTarget] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._agent_sessions: Dict[str, List[str]] = defaultdict(list)  # agent_id -> session_ids

    def add_target(self, target: LogoutTarget):
        """Add a logout target service."""
        with self._lock:
            self._targets[target.name] = target

    def remove_target(self, name: str) -> bool:
        """Remove a logout target."""
        with self._lock:
            if name in self._targets:
                del self._targets[name]
                return True
            return False

    def list_targets(self) -> List[LogoutTarget]:
        """List all logout targets."""
        with self._lock:
            return list(self._targets.values())

    def create_session(
        self,
        agent_id: str,
        user_id: str,
        ttl: int = 3600,
        ip_address: str = "",
        user_agent: str = "",
        metadata: Dict[str, Any] = None
    ) -> str:
        """Create a new session."""
        with self._lock:
            session_id = str(uuid.uuid4())[:16]
            current_time = time.time()

            session = Session(
                id=session_id,
                agent_id=agent_id,
                user_id=user_id,
                created_at=current_time,
                last_activity=current_time,
                expires_at=current_time + ttl,
                ip_address=ip_address,
                user_agent=user_agent,
                metadata=metadata or {}
            )

            self._sessions[session_id] = session
            self._agent_sessions[agent_id].append(session_id)

            return session_id

    def get_session(self, session_id: str) -> Optional[Session]:
        """Get session by ID."""
        with self._lock:
            return self._sessions.get(session_id)

    def update_session_activity(self, session_id: str) -> bool:
        """Update session last activity time."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.last_activity = time.time()
                return True
            return False

    def list_agent_sessions(self, agent_id: str) -> List[Session]:
        """List all sessions for an agent."""
        with self._lock:
            session_ids = self._agent_sessions.get(agent_id, [])
            return [
                self._sessions[sid] for sid in session_ids
                if sid in self._sessions
            ]

    def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions."""
        with self._lock:
            current_time = time.time()
            expired = [
                sid for sid, session in self._sessions.items()
                if session.expires_at < current_time
            ]

            for sid in expired:
                session = self._sessions[sid]
                if session.agent_id in self._agent_sessions:
                    self._agent_sessions[session.agent_id].remove(sid)
                del self._sessions[sid]

            return len(expired)

    def _execute_logout_target(
        self,
        target: LogoutTarget,
        agent_id: str,
        session_id: str,
        token: str = None
    ) -> LogoutResult:
        """Execute logout on a single target."""
        start_time = time.time()

        # Simulate target logout (in real implementation, call actual service)
        try:
            # In production, this would call the actual service endpoint
            # For now, we simulate the operation
            time.sleep(0.01)  # Simulate network latency

            return LogoutResult(
                target_name=target.name,
                success=True,
                duration_ms=(time.time() - start_time) * 1000
            )
        except Exception as e:
            return LogoutResult(
                target_name=target.name,
                success=False,
                error=str(e),
                duration_ms=(time.time() - start_time) * 1000
            )

    def execute_logout(
        self,
        agent_id: str,
        user_id: str = "",
        session_id: str = "",
        logout_type: LogoutType = LogoutType.MANUAL,
        reason: str = "",
        initiated_by: str = ""
    ) -> LogoutResponse:
        """Execute logout for an agent."""
        with self._lock:
            request_id = str(uuid.uuid4())[:12]
            start_time = time.time()

            # Collect targets to logout
            targets = sorted(self._targets.values(), key=lambda t: t.priority)

            results: List[LogoutResult] = []
            all_success = True
            any_success = False

            for target in targets:
                result = self._execute_logout_target(
                    target, agent_id, session_id
                )
                results.append(result)

                if result.success:
                    any_success = True
                else:
                    all_success = False
                    if target.required and not self._config.continue_on_failure:
                        break

            # Determine status
            if all_success:
                status = LogoutStatus.COMPLETED
            elif any_success:
                status = LogoutStatus.PARTIAL
            else:
                status = LogoutStatus.FAILED

            # Terminate sessions if configured
            if self._config.enable_session_termination and session_id:
                if session_id in self._sessions:
                    self._sessions[session_id].state = SessionState.TERMINATED

            # Also terminate all sessions for this agent
            if self._config.cleanup_sessions:
                session_ids = self._agent_sessions.get(agent_id, [])
                for sid in session_ids:
                    if sid in self._sessions:
                        self._sessions[sid].state = SessionState.TERMINATED

            response = LogoutResponse(
                request_id=request_id,
                agent_id=agent_id,
                status=status,
                results=results,
                total_duration_ms=(time.time() - start_time) * 1000,
                completed_at=time.time()
            )

            self._logout_history.append(response)

            return response

    def get_logout_history(
        self,
        agent_id: str = None,
        limit: int = 100
    ) -> List[LogoutResponse]:
        """Get logout history."""
        with self._lock:
            if agent_id:
                history = [r for r in self._logout_history if r.agent_id == agent_id]
            else:
                history = self._logout_history

            return history[-limit:]

    def get_session_count(self, agent_id: str = None) -> int:
        """Get session count."""
        with self._lock:
            if agent_id:
                return len(self._agent_sessions.get(agent_id, []))
            return len(self._sessions)


class AgentLogout:
    """Agent logout propagation system."""

    def __init__(self, config: LogoutConfig = None):
        self._manager = LogoutManager(config)
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_target(
        self,
        name: str,
        service_type: str,
        endpoint: str = "",
        priority: int = 0,
        timeout: int = 30,
        required: bool = True
    ):
        """Add a logout target."""
        target = LogoutTarget(
            name=name,
            service_type=service_type,
            endpoint=endpoint,
            priority=priority,
            timeout=timeout,
            required=required
        )
        self._manager.add_target(target)

    def remove_target(self, name: str) -> bool:
        """Remove a logout target."""
        return self._manager.remove_target(name)

    def list_targets(self) -> List[Dict[str, Any]]:
        """List all logout targets."""
        targets = self._manager.list_targets()
        return [
            {
                "name": t.name,
                "service_type": t.service_type,
                "endpoint": t.endpoint,
                "priority": t.priority,
                "timeout": t.timeout,
                "required": t.required
            }
            for t in targets
        ]

    def create_session(
        self,
        agent_id: str,
        user_id: str,
        ttl: int = 3600,
        ip_address: str = "",
        user_agent: str = "",
        metadata: Dict[str, Any] = None
    ) -> str:
        """Create a new session."""
        return self._manager.create_session(
            agent_id, user_id, ttl, ip_address, user_agent, metadata
        )

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Get session by ID."""
        session = self._manager.get_session(session_id)
        if not session:
            return None

        return {
            "id": session.id,
            "agent_id": session.agent_id,
            "user_id": session.user_id,
            "created_at": session.created_at,
            "last_activity": session.last_activity,
            "expires_at": session.expires_at,
            "state": session.state.value,
            "ip_address": session.ip_address,
            "user_agent": session.user_agent,
            "metadata": session.metadata
        }

    def update_session_activity(self, session_id: str) -> bool:
        """Update session activity."""
        return self._manager.update_session_activity(session_id)

    def list_agent_sessions(self, agent_id: str) -> List[Dict[str, Any]]:
        """List all sessions for an agent."""
        sessions = self._manager.list_agent_sessions(agent_id)
        return [
            {
                "id": s.id,
                "agent_id": s.agent_id,
                "user_id": s.user_id,
                "created_at": s.created_at,
                "last_activity": s.last_activity,
                "expires_at": s.expires_at,
                "state": s.state.value,
                "ip_address": s.ip_address,
                "user_agent": s.user_agent
            }
            for s in sessions
        ]

    def logout(
        self,
        agent_id: str,
        user_id: str = "",
        session_id: str = "",
        logout_type: str = "manual",
        reason: str = "",
        initiated_by: str = ""
    ) -> Dict[str, Any]:
        """Execute logout for an agent."""
        response = self._manager.execute_logout(
            agent_id=agent_id,
            user_id=user_id,
            session_id=session_id,
            logout_type=LogoutType(logout_type),
            reason=reason,
            initiated_by=initiated_by
        )

        return {
            "request_id": response.request_id,
            "agent_id": response.agent_id,
            "status": response.status.value,
            "results": [
                {
                    "target_name": r.target_name,
                    "success": r.success,
                    "error": r.error,
                    "duration_ms": r.duration_ms
                }
                for r in response.results
            ],
            "total_duration_ms": response.total_duration_ms,
            "completed_at": response.completed_at,
            "error": response.error
        }

    def logout_all_sessions(
        self,
        agent_id: str,
        logout_type: str = "admin",
        reason: str = "",
        initiated_by: str = ""
    ) -> Dict[str, Any]:
        """Logout all sessions for an agent."""
        sessions = self._manager.list_agent_sessions(agent_id)

        all_results = []
        any_success = False
        all_success = True

        for session in sessions:
            response = self._manager.execute_logout(
                agent_id=agent_id,
                user_id=session.user_id,
                session_id=session.id,
                logout_type=LogoutType(logout_type),
                reason=reason,
                initiated_by=initiated_by
            )

            if response.status == LogoutStatus.COMPLETED:
                any_success = True
            else:
                all_success = False

            all_results.extend(response.results)

        status = LogoutStatus.COMPLETED if all_success else (
            LogoutStatus.PARTIAL if any_success else LogoutStatus.FAILED
        )

        return {
            "agent_id": agent_id,
            "sessions_terminated": len(sessions),
            "status": status.value,
            "results": [
                {
                    "target_name": r.target_name,
                    "success": r.success,
                    "error": r.error
                }
                for r in all_results
            ]
        }

    def get_logout_history(
        self,
        agent_id: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get logout history."""
        history = self._manager.get_logout_history(agent_id, limit)
        return [
            {
                "request_id": h.request_id,
                "agent_id": h.agent_id,
                "status": h.status.value,
                "results": [
                    {
                        "target_name": r.target_name,
                        "success": r.success,
                        "error": r.error,
                        "duration_ms": r.duration_ms
                    }
                    for r in h.results
                ],
                "total_duration_ms": h.total_duration_ms,
                "completed_at": h.completed_at,
                "error": h.error
            }
            for h in history
        ]

    def get_session_count(self, agent_id: str = None) -> int:
        """Get session count."""
        return self._manager.get_session_count(agent_id)

    def cleanup_expired_sessions(self) -> int:
        """Clean up expired sessions."""
        return self._manager.cleanup_expired_sessions()


# Global logout instance
agent_logout = AgentLogout()
