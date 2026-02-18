"""Agent Namespace Module

Namespace isolation system for agents including resource isolation, quota management,
access control, and namespace-level monitoring.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class NamespaceStatus(str, Enum):
    """Namespace status."""
    ACTIVE = "active"
    SUSPENDED = "suspended"
    ARCHIVED = "archived"


class QuotaType(str, Enum):
    """Quota types."""
    CPU = "cpu"
    MEMORY = "memory"
    STORAGE = "storage"
    BANDWIDTH = "bandwidth"
    API_CALLS = "api_calls"
    CONCURRENT_REQUESTS = "concurrent_requests"


class ResourceLimitType(str, Enum):
    """Resource limit types."""
    HARD = "hard"
    SOFT = "soft"
    BURST = "burst"


@dataclass
class ResourceQuota:
    """Resource quota for a namespace."""
    quota_type: QuotaType
    limit: float
    used: float = 0.0
    unit: str = ""


@dataclass
class ResourceLimit:
    """Resource limit configuration."""
    quota_type: QuotaType
    limit: float
    limit_type: ResourceLimitType = ResourceLimitType.HARD
    unit: str = ""


@dataclass
class NamespaceConfig:
    """Namespace configuration."""
    name: str
    description: str = ""
    parent_namespace: str = ""
    isolation_level: str = "full"  # full, partial, shared
    default_ttl: int = 3600
    enable_quota_enforcement: bool = True
    enable_monitoring: bool = True
    enable_logging: bool = True


@dataclass
class Namespace:
    """Namespace instance."""
    id: str
    name: str
    config: NamespaceConfig
    status: NamespaceStatus = NamespaceStatus.ACTIVE
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    quotas: List[ResourceQuota] = field(default_factory=list)
    resource_limits: List[ResourceLimit] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)


@dataclass
class NamespaceStats:
    """Namespace statistics."""
    total_requests: int = 0
    active_agents: int = 0
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    storage_usage: float = 0.0
    bandwidth_usage: float = 0.0
    api_calls: int = 0
    avg_response_time: float = 0.0


@dataclass
class NamespaceUser:
    """User within a namespace."""
    id: str
    username: str
    role: str = "member"  # admin, member, viewer
    permissions: List[str] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)


class NamespaceManager:
    """Namespace manager for resource isolation."""

    def __init__(self, config: NamespaceConfig):
        self.config = config
        self._lock = threading.RLock()
        self._id = str(uuid.uuid4())[:8]
        self._users: Dict[str, NamespaceUser] = {}
        self._agents: Dict[str, Any] = {}
        self._resources: Dict[str, Any] = {}
        self._stats = NamespaceStats()
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._quota_enforcement_enabled = config.enable_quota_enforcement
        self._monitoring_enabled = config.enable_monitoring

    def get_id(self) -> str:
        """Get namespace ID."""
        return self._id

    def add_user(self, username: str, role: str = "member", permissions: List[str] = None) -> str:
        """Add a user to the namespace."""
        with self._lock:
            user_id = str(uuid.uuid4())[:8]

            user = NamespaceUser(
                id=user_id,
                username=username,
                role=role,
                permissions=permissions or []
            )

            self._users[user_id] = user
            return user_id

    def remove_user(self, user_id: str) -> bool:
        """Remove a user from the namespace."""
        with self._lock:
            if user_id in self._users:
                del self._users[user_id]
                return True
            return False

    def get_user(self, user_id: str) -> Optional[NamespaceUser]:
        """Get user by ID."""
        with self._lock:
            return self._users.get(user_id)

    def list_users(self) -> List[NamespaceUser]:
        """List all users in the namespace."""
        with self._lock:
            return list(self._users.values())

    def update_user(self, user_id: str, role: str = None, permissions: List[str] = None) -> bool:
        """Update user permissions."""
        with self._lock:
            user = self._users.get(user_id)
            if not user:
                return False

            if role is not None:
                user.role = role
            if permissions is not None:
                user.permissions = permissions

            return True

    def add_agent(self, agent_id: str, agent_data: Any):
        """Add an agent to the namespace."""
        with self._lock:
            self._agents[agent_id] = agent_data
            self._stats.active_agents = len(self._agents)

    def remove_agent(self, agent_id: str) -> bool:
        """Remove an agent from the namespace."""
        with self._lock:
            if agent_id in self._agents:
                del self._agents[agent_id]
                self._stats.active_agents = len(self._agents)
                return True
            return False

    def list_agents(self) -> List[str]:
        """List all agents in the namespace."""
        with self._lock:
            return list(self._agents.keys())

    def add_resource(self, resource_id: str, resource_data: Any):
        """Add a resource to the namespace."""
        with self._lock:
            self._resources[resource_id] = resource_data

    def remove_resource(self, resource_id: str) -> bool:
        """Remove a resource from the namespace."""
        with self._lock:
            if resource_id in self._resources:
                del self._resources[resource_id]
                return True
            return False

    def list_resources(self) -> Dict[str, Any]:
        """List all resources in the namespace."""
        with self._lock:
            return dict(self._resources)

    def check_quota(self, quota_type: QuotaType, amount: float) -> bool:
        """Check if quota is available."""
        if not self._quota_enforcement_enabled:
            return True

        with self._lock:
            for quota in self._stats.__dataclass_fields__:
                if quota == quota_type.value:
                    current = getattr(self._stats, quota, 0)
                    limit = self._get_quota_limit(quota_type)
                    if limit > 0 and current + amount > limit:
                        return False
            return True

    def consume_quota(self, quota_type: QuotaType, amount: float) -> bool:
        """Consume quota."""
        if not self._quota_enforcement_enabled:
            return True

        if not self.check_quota(quota_type, amount):
            return False

        with self._lock:
            # Update the appropriate stat
            if quota_type == QuotaType.CPU:
                self._stats.cpu_usage += amount
            elif quota_type == QuotaType.MEMORY:
                self._stats.memory_usage += amount
            elif quota_type == QuotaType.STORAGE:
                self._stats.storage_usage += amount
            elif quota_type == QuotaType.BANDWIDTH:
                self._stats.bandwidth_usage += amount
            elif quota_type == QuotaType.API_CALLS:
                self._stats.api_calls += int(amount)

            self._stats.total_requests += 1
            return True

    def release_quota(self, quota_type: QuotaType, amount: float):
        """Release quota."""
        with self._lock:
            if quota_type == QuotaType.CPU:
                self._stats.cpu_usage = max(0, self._stats.cpu_usage - amount)
            elif quota_type == QuotaType.MEMORY:
                self._stats.memory_usage = max(0, self._stats.memory_usage - amount)
            elif quota_type == QuotaType.STORAGE:
                self._stats.storage_usage = max(0, self._stats.storage_usage - amount)
            elif quota_type == QuotaType.BANDWIDTH:
                self._stats.bandwidth_usage = max(0, self._stats.bandwidth_usage - amount)
            elif quota_type == QuotaType.API_CALLS:
                self._stats.api_calls = max(0, self._stats.api_calls - int(amount))

    def _get_quota_limit(self, quota_type: QuotaType) -> float:
        """Get quota limit for a type."""
        return 0  # Default unlimited

    def record_request(self, response_time: float = 0.0):
        """Record request statistics."""
        if not self._monitoring_enabled:
            return

        with self._lock:
            self._stats.total_requests += 1
            if response_time > 0:
                total = self._stats.avg_response_time * (self._stats.total_requests - 1) + response_time
                self._stats.avg_response_time = total / self._stats.total_requests

    def get_stats(self) -> Dict[str, Any]:
        """Get namespace statistics."""
        with self._lock:
            return {
                "total_requests": self._stats.total_requests,
                "active_agents": self._stats.active_agents,
                "cpu_usage": self._stats.cpu_usage,
                "memory_usage": self._stats.memory_usage,
                "storage_usage": self._stats.storage_usage,
                "bandwidth_usage": self._stats.bandwidth_usage,
                "api_calls": self._stats.api_calls,
                "avg_response_time_ms": round(self._stats.avg_response_time, 3)
            }

    def suspend(self):
        """Suspend the namespace."""
        with self._lock:
            self.config.enable_quota_enforcement = False

    def activate(self):
        """Activate the namespace."""
        with self._lock:
            self.config.enable_quota_enforcement = True


class AgentNamespace:
    """Agent namespace management system."""

    def __init__(self):
        self._lock = threading.RLock()
        self._namespaces: Dict[str, NamespaceManager] = {}
        self._namespace_ids: Dict[str, str] = {}  # name -> id
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def create_namespace(
        self,
        name: str,
        description: str = "",
        parent_namespace: str = "",
        isolation_level: str = "full",
        default_ttl: int = 3600,
        enable_quota_enforcement: bool = True,
        enable_monitoring: bool = True,
        enable_logging: bool = True
    ) -> str:
        """Create a new namespace."""
        with self._lock:
            if name in self._namespace_ids:
                return None  # Namespace already exists

            config = NamespaceConfig(
                name=name,
                description=description,
                parent_namespace=parent_namespace,
                isolation_level=isolation_level,
                default_ttl=default_ttl,
                enable_quota_enforcement=enable_quota_enforcement,
                enable_monitoring=enable_monitoring,
                enable_logging=enable_logging
            )

            namespace = NamespaceManager(config)
            namespace_id = namespace.get_id()

            self._namespaces[namespace_id] = namespace
            self._namespace_ids[name] = namespace_id

            return namespace_id

    def get_namespace(self, namespace_id: str) -> Optional[NamespaceManager]:
        """Get namespace by ID."""
        with self._lock:
            return self._namespaces.get(namespace_id)

    def get_namespace_by_name(self, name: str) -> Optional[NamespaceManager]:
        """Get namespace by name."""
        with self._lock:
            namespace_id = self._namespace_ids.get(name)
            if namespace_id:
                return self._namespaces.get(namespace_id)
            return None

    def delete_namespace(self, namespace_id: str) -> bool:
        """Delete a namespace."""
        with self._lock:
            namespace = self._namespaces.get(namespace_id)
            if not namespace:
                return False

            # Remove from name index
            name = namespace.config.name
            if name in self._namespace_ids:
                del self._namespace_ids[name]

            del self._namespaces[namespace_id]
            return True

    def list_namespaces(self) -> List[Dict[str, Any]]:
        """List all namespaces."""
        with self._lock:
            return [
                {
                    "id": ns_id,
                    "name": ns.config.name,
                    "description": ns.config.description,
                    "isolation_level": ns.config.isolation_level,
                    "status": "active",
                    "created_at": ns.config.created_at if hasattr(ns.config, 'created_at') else ns._id,
                    "stats": ns.get_stats()
                }
                for ns_id, ns in self._namespaces.items()
            ]

    def add_user(
        self,
        namespace_id: str,
        username: str,
        role: str = "member",
        permissions: List[str] = None
    ) -> Optional[str]:
        """Add a user to a namespace."""
        namespace = self.get_namespace(namespace_id)
        if not namespace:
            return None
        return namespace.add_user(username, role, permissions)

    def remove_user(self, namespace_id: str, user_id: str) -> bool:
        """Remove a user from a namespace."""
        namespace = self.get_namespace(namespace_id)
        if not namespace:
            return False
        return namespace.remove_user(user_id)

    def get_users(self, namespace_id: str) -> List[Dict[str, Any]]:
        """Get users in a namespace."""
        namespace = self.get_namespace(namespace_id)
        if not namespace:
            return []

        users = namespace.list_users()
        return [
            {
                "id": u.id,
                "username": u.username,
                "role": u.role,
                "permissions": u.permissions,
                "created_at": u.created_at
            }
            for u in users
        ]

    def add_agent(self, namespace_id: str, agent_id: str, agent_data: Any = None) -> bool:
        """Add an agent to a namespace."""
        namespace = self.get_namespace(namespace_id)
        if not namespace:
            return False
        namespace.add_agent(agent_id, agent_data or {})
        return True

    def remove_agent(self, namespace_id: str, agent_id: str) -> bool:
        """Remove an agent from a namespace."""
        namespace = self.get_namespace(namespace_id)
        if not namespace:
            return False
        return namespace.remove_agent(agent_id)

    def list_agents(self, namespace_id: str) -> List[str]:
        """List agents in a namespace."""
        namespace = self.get_namespace(namespace_id)
        if not namespace:
            return []
        return namespace.list_agents()

    def check_quota(self, namespace_id: str, quota_type: QuotaType, amount: float) -> bool:
        """Check quota in a namespace."""
        namespace = self.get_namespace(namespace_id)
        if not namespace:
            return False
        return namespace.check_quota(quota_type, amount)

    def consume_quota(self, namespace_id: str, quota_type: QuotaType, amount: float) -> bool:
        """Consume quota in a namespace."""
        namespace = self.get_namespace(namespace_id)
        if not namespace:
            return False
        return namespace.consume_quota(quota_type, amount)

    def release_quota(self, namespace_id: str, quota_type: QuotaType, amount: float):
        """Release quota in a namespace."""
        namespace = self.get_namespace(namespace_id)
        if namespace:
            namespace.release_quota(quota_type, amount)

    def record_request(self, namespace_id: str, response_time: float = 0.0):
        """Record request in a namespace."""
        namespace = self.get_namespace(namespace_id)
        if namespace:
            namespace.record_request(response_time)

    def get_stats(self, namespace_id: str) -> Optional[Dict[str, Any]]:
        """Get namespace statistics."""
        namespace = self.get_namespace(namespace_id)
        if not namespace:
            return None
        return namespace.get_stats()

    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics for all namespaces."""
        return {
            ns_id: ns.get_stats()
            for ns_id, ns in self._namespaces.items()
        }

    def suspend_namespace(self, namespace_id: str) -> bool:
        """Suspend a namespace."""
        namespace = self.get_namespace(namespace_id)
        if not namespace:
            return False
        namespace.suspend()
        return True

    def activate_namespace(self, namespace_id: str) -> bool:
        """Activate a namespace."""
        namespace = self.get_namespace(namespace_id)
        if not namespace:
            return False
        namespace.activate()
        return True


# Global namespace instance
agent_namespace = AgentNamespace()
