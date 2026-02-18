"""Agent Audit Module

Agent audit trail system for compliance and monitoring.
"""
import time
import threading
import uuid
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from collections import defaultdict


class AuditAction(str, Enum):
    """Audit action types."""
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    LOGIN = "login"
    LOGOUT = "logout"
    EXECUTE = "execute"
    APPROVE = "approve"
    REJECT = "reject"
    SUSPEND = "suspend"
    RESUME = "resume"


class AuditResource(str, Enum):
    """Audit resource types."""
    AGENT = "agent"
    TASK = "task"
    WORKFLOW = "workflow"
    SESSION = "session"
    CONFIG = "config"
    DATA = "data"
    USER = "user"
    ROLE = "role"
    PERMISSION = "permission"


class AuditStatus(str, Enum):
    """Audit status."""
    SUCCESS = "success"
    FAILURE = "failure"
    PENDING = "pending"


@dataclass
class AuditEntry:
    """Audit entry."""
    id: str
    timestamp: float
    agent_id: str
    action: AuditAction
    resource: AuditResource
    resource_id: str
    status: AuditStatus
    user_id: str = ""
    ip_address: str = ""
    user_agent: str = ""
    details: Dict[str, Any] = field(default_factory=dict)
    duration_ms: int = 0
    error_message: str = ""


@dataclass
class AuditSummary:
    """Audit summary."""
    total_entries: int = 0
    by_action: Dict[str, int] = field(default_factory=dict)
    by_resource: Dict[str, int] = field(default_factory=dict)
    by_status: Dict[str, int] = field(default_factory=dict)
    by_agent: Dict[str, int] = field(default_factory=dict)


class AgentAuditManager:
    """Manage agent audit trail."""

    def __init__(self):
        self._lock = threading.RLock()
        self._entries: List[AuditEntry] = []
        self._max_entries = 100000
        self._retention_days = 90

    def log(
        self,
        agent_id: str,
        action: AuditAction,
        resource: AuditResource,
        resource_id: str,
        status: AuditStatus,
        user_id: str = "",
        ip_address: str = "",
        user_agent: str = "",
        details: Dict[str, Any] = None,
        duration_ms: int = 0,
        error_message: str = ""
    ) -> str:
        """Log an audit entry."""
        with self._lock:
            entry_id = str(uuid.uuid4())[:12]
            entry = AuditEntry(
                id=entry_id,
                timestamp=time.time(),
                agent_id=agent_id,
                action=action,
                resource=resource,
                resource_id=resource_id,
                status=status,
                user_id=user_id,
                ip_address=ip_address,
                user_agent=user_agent,
                details=details or {},
                duration_ms=duration_ms,
                error_message=error_message
            )
            self._entries.append(entry)

            # Cleanup old entries
            if len(self._entries) > self._max_entries:
                self._entries = self._entries[-self._max_entries:]

            return entry_id

    def query(
        self,
        agent_id: str = None,
        action: AuditAction = None,
        resource: AuditResource = None,
        resource_id: str = None,
        status: AuditStatus = None,
        start_time: float = None,
        end_time: float = None,
        limit: int = 100
    ) -> List[Dict]:
        """Query audit entries."""
        with self._lock:
            results = self._entries

            if agent_id:
                results = [e for e in results if e.agent_id == agent_id]
            if action:
                results = [e for e in results if e.action == action]
            if resource:
                results = [e for e in results if e.resource == resource]
            if resource_id:
                results = [e for e in results if e.resource_id == resource_id]
            if status:
                results = [e for e in results if e.status == status]
            if start_time:
                results = [e for e in results if e.timestamp >= start_time]
            if end_time:
                results = [e for e in results if e.timestamp <= end_time]

            results = sorted(results, key=lambda x: x.timestamp, reverse=True)
            return results[:limit]

    def get_entries_by_agent(self, agent_id: str, limit: int = 100) -> List[Dict]:
        """Get entries for specific agent."""
        return self.query(agent_id=agent_id, limit=limit)

    def get_entries_by_resource(
        self, resource: AuditResource, resource_id: str, limit: int = 100
    ) -> List[Dict]:
        """Get entries for specific resource."""
        return self.query(resource=resource, resource_id=resource_id, limit=limit)

    def get_failed_entries(self, limit: int = 100) -> List[Dict]:
        """Get failed audit entries."""
        return self.query(status=AuditStatus.FAILURE, limit=limit)

    def get_summary(
        self,
        start_time: float = None,
        end_time: float = None
    ) -> AuditSummary:
        """Get audit summary."""
        with self._lock:
            entries = self._entries
            if start_time:
                entries = [e for e in entries if e.timestamp >= start_time]
            if end_time:
                entries = [e for e in entries if e.timestamp <= end_time]

            summary = AuditSummary(total_entries=len(entries))

            for entry in entries:
                summary.by_action[entry.action.value] = summary.by_action.get(entry.action.value, 0) + 1
                summary.by_resource[entry.resource.value] = summary.by_resource.get(entry.resource.value, 0) + 1
                summary.by_status[entry.status.value] = summary.by_status.get(entry.status.value, 0) + 1
                summary.by_agent[entry.agent_id] = summary.by_agent.get(entry.agent_id, 0) + 1

            return summary

    def get_timeline(
        self,
        agent_id: str = None,
        resource: AuditResource = None,
        interval_minutes: int = 60
    ) -> List[Dict]:
        """Get audit timeline."""
        with self._lock:
            entries = self._entries
            if agent_id:
                entries = [e for e in entries if e.agent_id == agent_id]
            if resource:
                entries = [e for e in entries if e.resource == resource]

            if not entries:
                return []

            # Group by time intervals
            interval_seconds = interval_minutes * 60
            min_time = min(e.timestamp for e in entries)
            max_time = max(e.timestamp for e in entries)

            timeline = []
            current = min_time
            while current <= max_time:
                next_interval = current + interval_seconds
                count = sum(1 for e in entries if current <= e.timestamp < next_interval)
                if count > 0:
                    timeline.append({
                        "timestamp": current,
                        "count": count,
                        "interval_minutes": interval_minutes
                    })
                current = next_interval

            return timeline

    def get_statistics(self) -> Dict:
        """Get audit statistics."""
        with self._lock:
            summary = self.get_summary()
            now = time.time()
            day_ago = now - 86400
            week_ago = now - 604800

            return {
                "total_entries": summary.total_entries,
                "last_24h": len([e for e in self._entries if e.timestamp >= day_ago]),
                "last_week": len([e for e in self._entries if e.timestamp >= week_ago]),
                "by_action": summary.by_action,
                "by_resource": summary.by_resource,
                "by_status": summary.by_status,
                "by_agent": summary.by_agent,
                "retention_days": self._retention_days
            }

    def cleanup_old_entries(self) -> int:
        """Clean up old entries based on retention policy."""
        with self._lock:
            cutoff = time.time() - (self._retention_days * 86400)
            old_entries = [e for e in self._entries if e.timestamp < cutoff]
            self._entries = [e for e in self._entries if e.timestamp >= cutoff]
            return len(old_entries)

    def export(
        self,
        format: str = "json",
        start_time: float = None,
        end_time: float = None
    ) -> str:
        """Export audit entries."""
        entries = self.query(start_time=start_time, end_time=end_time, limit=self._max_entries)

        if format == "json":
            import json
            return json.dumps([
                {
                    "id": e.id,
                    "timestamp": e.timestamp,
                    "agent_id": e.agent_id,
                    "action": e.action.value,
                    "resource": e.resource.value,
                    "resource_id": e.resource_id,
                    "status": e.status.value,
                    "user_id": e.user_id,
                    "ip_address": e.ip_address,
                    "details": e.details,
                    "duration_ms": e.duration_ms
                }
                for e in entries
            ], indent=2)
        else:
            # CSV format
            lines = ["id,timestamp,agent_id,action,resource,resource_id,status,user_id,ip_address,duration_ms"]
            for e in entries:
                lines.append(f"{e.id},{e.timestamp},{e.agent_id},{e.action.value},{e.resource.value},{e.resource_id},{e.status.value},{e.user_id},{e.ip_address},{e.duration_ms}")
            return "\n".join(lines)


# Global agent audit manager
agent_audit = AgentAuditManager()
