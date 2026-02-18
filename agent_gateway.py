"""Agent Gateway Module

Agent API gateway service with routing, rate limiting, and authentication.
"""
import time
import threading
import uuid
import hashlib
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from collections import defaultdict
from fastapi import HTTPException


class GatewayState(str, Enum):
    """Gateway states."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    DEGRADED = "degraded"


class RouteMethod(str, Enum):
    """HTTP methods."""
    GET = "get"
    POST = "post"
    PUT = "put"
    DELETE = "delete"
    PATCH = "patch"


@dataclass
class RateLimitConfig:
    """Rate limit configuration."""
    requests_per_second: int = 100
    requests_per_minute: int = 1000
    requests_per_hour: int = 10000
    burst_size: int = 10


@dataclass
class AuthConfig:
    """Authentication configuration."""
    api_key_required: bool = False
    jwt_required: bool = False
    oauth_required: bool = False


@dataclass
class Route:
    """API route definition."""
    id: str
    path: str
    method: RouteMethod
    agent_id: str
    target_url: str
    auth_required: bool = False
    rate_limit: RateLimitConfig = field(default_factory=RateLimitConfig)
    timeout_seconds: int = 30
    retry_enabled: bool = True
    cache_enabled: bool = False
    cache_ttl: int = 300
    enabled: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GatewayStats:
    """Gateway statistics."""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    blocked_requests: int = 0
    avg_response_time_ms: int = 0


class AgentGateway:
    """Manage agent API gateway."""

    def __init__(self):
        self._lock = threading.RLock()
        self._routes: Dict[str, Route] = {}
        self._route_by_path: Dict[str, List[Route]] = defaultdict(list)
        self._agent_routes: Dict[str, List[str]] = defaultdict(list)
        self._stats = GatewayStats()
        self._state = GatewayState.ACTIVE
        self._request_counts: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self._reset_interval = time.time()

    def configure(
        self,
        api_key_required: bool = False,
        jwt_required: bool = False,
        oauth_required: bool = False
    ):
        """Configure gateway authentication."""
        # Global auth config would be stored here
        pass

    def create_route(
        self,
        path: str,
        method: str,
        agent_id: str,
        target_url: str,
        auth_required: bool = False,
        requests_per_second: int = 100,
        requests_per_minute: int = 1000,
        requests_per_hour: int = 10000,
        burst_size: int = 10,
        timeout_seconds: int = 30,
        retry_enabled: bool = True,
        cache_enabled: bool = False,
        cache_ttl: int = 300,
        metadata: Dict[str, Any] = None
    ) -> str:
        """Create a new route."""
        with self._lock:
            route_id = str(uuid.uuid4())[:12]
            rate_limit = RateLimitConfig(
                requests_per_second=requests_per_second,
                requests_per_minute=requests_per_minute,
                requests_per_hour=requests_per_hour,
                burst_size=burst_size
            )

            route = Route(
                id=route_id,
                path=path,
                method=RouteMethod(method.lower()),
                agent_id=agent_id,
                target_url=target_url,
                auth_required=auth_required,
                rate_limit=rate_limit,
                timeout_seconds=timeout_seconds,
                retry_enabled=retry_enabled,
                cache_enabled=cache_enabled,
                cache_ttl=cache_ttl,
                metadata=metadata or {}
            )

            self._routes[route_id] = route
            self._route_by_path[path].append(route)
            self._agent_routes[agent_id].append(route_id)

            return route_id

    def get_route(self, route_id: str) -> Optional[Dict]:
        """Get route by ID."""
        with self._lock:
            route = self._routes.get(route_id)
            if not route:
                return None
            return {
                "id": route.id,
                "path": route.path,
                "method": route.method.value,
                "agent_id": route.agent_id,
                "target_url": route.target_url,
                "auth_required": route.auth_required,
                "rate_limit": {
                    "requests_per_second": route.rate_limit.requests_per_second,
                    "requests_per_minute": route.rate_limit.requests_per_minute,
                    "requests_per_hour": route.rate_limit.requests_per_hour,
                    "burst_size": route.rate_limit.burst_size
                },
                "timeout_seconds": route.timeout_seconds,
                "retry_enabled": route.retry_enabled,
                "cache_enabled": route.cache_enabled,
                "cache_ttl": route.cache_ttl,
                "enabled": route.enabled,
                "metadata": route.metadata
            }

    def get_routes(self, agent_id: str = None, enabled: bool = None, limit: int = 100) -> List[Dict]:
        """Get routes."""
        with self._lock:
            routes = list(self._routes.values())
            if agent_id:
                routes = [r for r in routes if r.agent_id == agent_id]
            if enabled is not None:
                routes = [r for r in routes if r.enabled == enabled]
            routes = routes[:limit]
            return [
                {"id": r.id, "path": r.path, "method": r.method.value,
                 "agent_id": r.agent_id, "enabled": r.enabled}
                for r in routes
            ]

    def update_route(
        self,
        route_id: str,
        path: str = None,
        method: str = None,
        target_url: str = None,
        auth_required: bool = None,
        enabled: bool = None,
        timeout_seconds: int = None,
        retry_enabled: bool = None,
        cache_enabled: bool = None,
        cache_ttl: int = None
    ) -> bool:
        """Update a route."""
        with self._lock:
            route = self._routes.get(route_id)
            if not route:
                return False

            if path is not None:
                route.path = path
            if method is not None:
                route.method = RouteMethod(method.lower())
            if target_url is not None:
                route.target_url = target_url
            if auth_required is not None:
                route.auth_required = auth_required
            if enabled is not None:
                route.enabled = enabled
            if timeout_seconds is not None:
                route.timeout_seconds = timeout_seconds
            if retry_enabled is not None:
                route.retry_enabled = retry_enabled
            if cache_enabled is not None:
                route.cache_enabled = cache_enabled
            if cache_ttl is not None:
                route.cache_ttl = cache_ttl

            return True

    def delete_route(self, route_id: str) -> bool:
        """Delete a route."""
        with self._lock:
            route = self._routes.get(route_id)
            if not route:
                return False

            del self._routes[route_id]
            if route_id in self._route_by_path[route.path]:
                self._route_by_path[route.path].remove(route_id)
            if route_id in self._agent_routes[route.agent_id]:
                self._agent_routes[route.agent_id].remove(route_id)

            return True

    def enable_route(self, route_id: str) -> bool:
        """Enable a route."""
        with self._lock:
            route = self._routes.get(route_id)
            if not route:
                return False
            route.enabled = True
            return True

    def disable_route(self, route_id: str) -> bool:
        """Disable a route."""
        with self._lock:
            route = self._routes.get(route_id)
            if not route:
                return False
            route.enabled = False
            return True

    def _check_rate_limit(self, client_id: str, route: Route) -> bool:
        """Check if request is within rate limit."""
        current_time = time.time()

        # Reset counters periodically
        if current_time - self._reset_interval > 3600:
            self._request_counts.clear()
            self._reset_interval = current_time

        counts = self._request_counts[client_id]

        # Check second limit
        second_key = f"second_{int(current_time)}"
        if counts.get(second_key, 0) >= route.rate_limit.requests_per_second:
            return False

        # Check minute limit
        minute_key = f"minute_{int(current_time / 60)}"
        if counts.get(minute_key, 0) >= route.rate_limit.requests_per_minute:
            return False

        # Check hour limit
        hour_key = f"hour_{int(current_time / 3600)}"
        if counts.get(hour_key, 0) >= route.rate_limit.requests_per_hour:
            return False

        # Increment counters
        counts[second_key] = counts.get(second_key, 0) + 1
        counts[minute_key] = counts.get(minute_key, 0) + 1
        counts[hour_key] = counts.get(hour_key, 0) + 1

        return True

    def route_request(
        self,
        route_id: str,
        client_id: str,
        path: str,
        method: str,
        headers: Dict[str, str] = None,
        body: Any = None
    ) -> Dict:
        """Route a request through the gateway."""
        with self._lock:
            route = self._routes.get(route_id)
            if not route:
                raise HTTPException(status_code=404, detail="Route not found")

            if not route.enabled:
                raise HTTPException(status_code=503, detail="Route is disabled")

            # Check rate limit
            if not self._check_rate_limit(client_id, route):
                self._stats.blocked_requests += 1
                raise HTTPException(status_code=429, detail="Rate limit exceeded")

            # Check auth
            if route.auth_required:
                if not headers or not headers.get("Authorization"):
                    raise HTTPException(status_code=401, detail="Authentication required")

            # Record request
            self._stats.total_requests += 1

            # Simulate request routing (in real implementation, would forward to target)
            response = {
                "status_code": 200,
                "route_id": route_id,
                "agent_id": route.agent_id,
                "target_url": route.target_url,
                "message": "Request routed successfully"
            }

            self._stats.successful_requests += 1
            return response

    def find_route(self, path: str, method: str) -> Optional[Route]:
        """Find route by path and method."""
        with self._lock:
            routes = self._route_by_path.get(path, [])
            for route in routes:
                if route.method.value == method.lower() and route.enabled:
                    return route
            return None

    def set_state(self, state: str) -> bool:
        """Set gateway state."""
        with self._lock:
            try:
                self._state = GatewayState(state)
                return True
            except:
                return False

    def get_statistics(self) -> Dict:
        """Get gateway statistics."""
        with self._lock:
            total = self._stats.total_requests
            success_rate = (self._stats.successful_requests / total * 100) if total > 0 else 0

            by_method = defaultdict(int)
            for route in self._routes.values():
                by_method[route.method.value] += 1

            by_agent = defaultdict(int)
            for agent_id in self._agent_routes.keys():
                by_agent[agent_id] = len(self._agent_routes[agent_id])

            return {
                "state": self._state.value,
                "total_routes": len(self._routes),
                "enabled_routes": sum(1 for r in self._routes.values() if r.enabled),
                "total_requests": self._stats.total_requests,
                "successful_requests": self._stats.successful_requests,
                "failed_requests": self._stats.failed_requests,
                "blocked_requests": self._stats.blocked_requests,
                "success_rate_percent": round(success_rate, 2),
                "routes_by_method": dict(by_method),
                "agents_with_routes": len(self._agent_routes)
            }


# Global agent gateway instance
agent_gateway = AgentGateway()
