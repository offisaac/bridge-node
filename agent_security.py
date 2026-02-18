"""Agent Security Module

Agent security and authentication system.
"""
import time
import hashlib
import hmac
import secrets
import threading
import uuid
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from collections import defaultdict


class AuthMethod(str, Enum):
    """Authentication methods."""
    API_KEY = "api_key"
    JWT = "jwt"
    OAUTH2 = "oauth2"
    CERTIFICATE = "certificate"
    TOKEN = "token"


class PermissionLevel(str, Enum):
    """Permission levels."""
    ADMIN = "admin"
    WRITE = "write"
    READ = "read"
    NONE = "none"


class SecurityEventType(str, Enum):
    """Security event types."""
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    PERMISSION_DENIED = "permission_denied"
    TOKEN_REFRESHED = "token_refreshed"
    API_KEY_CREATED = "api_key_created"
    API_KEY_REVOKED = "api_key_revoked"
    CERTIFICATE_ISSUED = "certificate_issued"
    CERTIFICATE_REVOKED = "certificate_revoked"


@dataclass
class AgentCredentials:
    """Agent credentials."""
    agent_id: str
    auth_method: AuthMethod
    credential_id: str
    created_at: float
    expires_at: float = 0
    last_used: float = 0
    is_active: bool = True


@dataclass
class AgentSession:
    """Agent session."""
    session_id: str
    agent_id: str
    created_at: float
    expires_at: float
    last_activity: float
    ip_address: str = ""
    user_agent: str = ""


@dataclass
class SecurityEvent:
    """Security event."""
    id: str
    event_type: SecurityEventType
    agent_id: str
    timestamp: float
    ip_address: str = ""
    success: bool = True
    details: str = ""


@dataclass
class AgentPermission:
    """Agent permission."""
    agent_id: str
    resource: str
    permission: PermissionLevel
    granted_at: float
    granted_by: str = ""


class AgentSecurityManager:
    """Manage agent security and authentication."""

    def __init__(self):
        self._lock = threading.RLock()
        self._credentials: Dict[str, AgentCredentials] = {}
        self._sessions: Dict[str, AgentSession] = {}
        self._permissions: Dict[str, List[AgentPermission]] = defaultdict(list)
        self._events: List[SecurityEvent] = []
        self._api_keys: Dict[str, str] = {}  # key -> agent_id
        self._jwt_secrets: Dict[str, str] = {}  # agent_id -> secret
        self._max_sessions = 10000
        self._max_events = 5000
        self._session_timeout = 3600  # 1 hour

    def create_api_key(self, agent_id: str, expires_in: int = 86400) -> str:
        """Create API key for agent."""
        with self._lock:
            api_key = f"sk_{secrets.token_urlsafe(32)}"
            credential_id = str(uuid.uuid4())[:12]
            expires_at = time.time() + expires_in if expires_in > 0 else 0

            cred = AgentCredentials(
                agent_id=agent_id,
                auth_method=AuthMethod.API_KEY,
                credential_id=credential_id,
                created_at=time.time(),
                expires_at=expires_at
            )

            self._credentials[credential_id] = cred
            self._api_keys[api_key] = credential_id

            # Log event
            self._log_event(SecurityEventType.API_KEY_CREATED, agent_id, f"Key: {credential_id}")

            return api_key

    def revoke_api_key(self, credential_id: str) -> bool:
        """Revoke API key."""
        with self._lock:
            if credential_id in self._credentials:
                self._credentials[credential_id].is_active = False
                agent_id = self._credentials[credential_id].agent_id
                self._log_event(SecurityEventType.API_KEY_REVOKED, agent_id, f"Key: {credential_id}")
                return True
            return False

    def verify_api_key(self, api_key: str) -> Optional[str]:
        """Verify API key and return agent_id."""
        with self._lock:
            credential_id = self._api_keys.get(api_key)
            if not credential_id:
                return None

            cred = self._credentials.get(credential_id)
            if not cred or not cred.is_active:
                return None

            if cred.expires_at > 0 and time.time() > cred.expires_at:
                return None

            cred.last_used = time.time()
            return cred.agent_id

    def create_jwt_secret(self, agent_id: str) -> str:
        """Create JWT secret for agent."""
        with self._lock:
            secret = secrets.token_urlsafe(32)
            self._jwt_secrets[agent_id] = secret
            return secret

    def verify_jwt(self, agent_id: str, token: str) -> bool:
        """Verify JWT token."""
        with self._lock:
            secret = self._jwt_secrets.get(agent_id)
            if not secret:
                return False

            # Simple verification (in production, use proper JWT library)
            expected = hmac.new(
                secret.encode(),
                f"{agent_id}".encode(),
                hashlib.sha256
            ).hexdigest()

            return hmac.compare_digest(token, expected)

    def create_session(
        self,
        agent_id: str,
        ip_address: str = "",
        user_agent: str = "",
        expires_in: int = 3600
    ) -> str:
        """Create agent session."""
        with self._lock:
            session_id = str(uuid.uuid4())
            now = time.time()

            session = AgentSession(
                session_id=session_id,
                agent_id=agent_id,
                created_at=now,
                expires_at=now + expires_in,
                last_activity=now,
                ip_address=ip_address,
                user_agent=user_agent
            )

            self._sessions[session_id] = session

            # Cleanup old sessions
            if len(self._sessions) > self._max_sessions:
                self._cleanup_sessions()

            self._log_event(SecurityEventType.LOGIN, agent_id, f"Session: {session_id}")
            return session_id

    def verify_session(self, session_id: str) -> Optional[str]:
        """Verify session and return agent_id."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None

            if time.time() > session.expires_at:
                del self._sessions[session_id]
                return None

            session.last_activity = time.time()
            return session.agent_id

    def refresh_session(self, session_id: str, expires_in: int = 3600) -> bool:
        """Refresh session."""
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return False

            session.expires_at = time.time() + expires_in
            session.last_activity = time.time()
            return True

    def destroy_session(self, session_id: str) -> bool:
        """Destroy session."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                agent_id = session.agent_id
                del self._sessions[session_id]
                self._log_event(SecurityEventType.LOGOUT, agent_id, f"Session: {session_id}")
                return True
            return False

    def grant_permission(
        self,
        agent_id: str,
        resource: str,
        permission: PermissionLevel,
        granted_by: str = "system"
    ) -> bool:
        """Grant permission to agent."""
        with self._lock:
            perm = AgentPermission(
                agent_id=agent_id,
                resource=resource,
                permission=permission,
                granted_at=time.time(),
                granted_by=granted_by
            )
            self._permissions[agent_id].append(perm)
            return True

    def revoke_permission(self, agent_id: str, resource: str) -> bool:
        """Revoke permission from agent."""
        with self._lock:
            if agent_id in self._permissions:
                self._permissions[agent_id] = [
                    p for p in self._permissions[agent_id]
                    if p.resource != resource
                ]
                return True
            return False

    def check_permission(self, agent_id: str, resource: str, required: PermissionLevel) -> bool:
        """Check if agent has permission."""
        with self._lock:
            perms = self._permissions.get(agent_id, [])
            for perm in perms:
                if perm.resource == resource or perm.resource == "*":
                    if perm.permission == PermissionLevel.ADMIN:
                        return True
                    if perm.permission == required:
                        return True
                    if perm.permission == PermissionLevel.NONE:
                        return False
            return False

    def get_permissions(self, agent_id: str) -> List[Dict]:
        """Get agent permissions."""
        with self._lock:
            return [
                {"resource": p.resource, "permission": p.permission.value, "granted_at": p.granted_at}
                for p in self._permissions.get(agent_id, [])
            ]

    def _cleanup_sessions(self):
        """Clean up expired sessions."""
        now = time.time()
        expired = [sid for sid, s in self._sessions.items() if now > s.expires_at]
        for sid in expired:
            del self._sessions[sid]

    def _log_event(self, event_type: SecurityEventType, agent_id: str, details: str = ""):
        """Log security event."""
        event = SecurityEvent(
            id=str(uuid.uuid4())[:12],
            event_type=event_type,
            agent_id=agent_id,
            timestamp=time.time(),
            success=True,
            details=details
        )
        self._events.append(event)
        if len(self._events) > self._max_events:
            self._events = self._events[-self._max_events:]

    def get_events(self, agent_id: str = None, limit: int = 100) -> List[Dict]:
        """Get security events."""
        with self._lock:
            events = self._events
            if agent_id:
                events = [e for e in events if e.agent_id == agent_id]
            events = sorted(events, key=lambda x: x.timestamp, reverse=True)
            return [
                {"id": e.id, "type": e.event_type.value, "agent_id": e.agent_id,
                 "timestamp": e.timestamp, "success": e.success, "details": e.details}
                for e in events[:limit]
            ]

    def get_statistics(self) -> Dict:
        """Get security statistics."""
        with self._lock:
            return {
                "total_credentials": len(self._credentials),
                "active_sessions": len(self._sessions),
                "total_api_keys": len(self._api_keys),
                "total_agents_with_permissions": len(self._permissions),
                "total_events": len(self._events),
                "by_event_type": self._count_events_by_type()
            }

    def _count_events_by_type(self) -> Dict:
        """Count events by type."""
        counts = defaultdict(int)
        for event in self._events:
            counts[event.event_type.value] += 1
        return dict(counts)


# Global agent security manager
agent_security = AgentSecurityManager()
