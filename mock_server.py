"""Mock Server Module

API Mock server for testing.
"""
import threading
import json
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid
import re


class MockResponseStatus(str, Enum):
    """Mock response status codes."""
    OK = 200
    CREATED = 201
    NO_CONTENT = 204
    BAD_REQUEST = 400
    UNAUTHORIZED = 401
    FORBIDDEN = 403
    NOT_FOUND = 404
    SERVER_ERROR = 500


@dataclass
class MockEndpoint:
    """Mock API endpoint."""
    id: str
    path: str
    method: str
    response_status: int
    response_body: Dict
    response_headers: Dict = field(default_factory=dict)
    delay_ms: int = 0
    enabled: bool = True
    description: str = ""
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class MockRequest:
    """Mock request record."""
    id: str
    endpoint_id: str
    path: str
    method: str
    headers: Dict
    body: Any
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


class MockServer:
    """API Mock server for testing."""

    def __init__(self):
        self._lock = threading.RLock()
        self._endpoints: Dict[str, MockEndpoint] = {}
        self._requests: List[MockRequest] = []
        self._max_requests = 1000

    def add_endpoint(
        self,
        path: str,
        method: str,
        response_status: int = 200,
        response_body: Dict = None,
        response_headers: Dict = None,
        delay_ms: int = 0,
        description: str = ""
    ) -> str:
        """Add a mock endpoint."""
        endpoint_id = str(uuid.uuid4())[:8]

        endpoint = MockEndpoint(
            id=endpoint_id,
            path=path,
            method=method.upper(),
            response_status=response_status,
            response_body=response_body or {},
            response_headers=response_headers or {},
            delay_ms=delay_ms,
            description=description
        )

        with self._lock:
            self._endpoints[endpoint_id] = endpoint

        return endpoint_id

    def update_endpoint(
        self,
        endpoint_id: str,
        response_status: int = None,
        response_body: Dict = None,
        enabled: bool = None
    ) -> bool:
        """Update a mock endpoint."""
        with self._lock:
            if endpoint_id not in self._endpoints:
                return False

            endpoint = self._endpoints[endpoint_id]
            if response_status is not None:
                endpoint.response_status = response_status
            if response_body is not None:
                endpoint.response_body = response_body
            if enabled is not None:
                endpoint.enabled = enabled

            return True

    def delete_endpoint(self, endpoint_id: str) -> bool:
        """Delete a mock endpoint."""
        with self._lock:
            if endpoint_id in self._endpoints:
                del self._endpoints[endpoint_id]
                return True
            return False

    def get_endpoint(self, endpoint_id: str) -> Optional[Dict]:
        """Get endpoint by ID."""
        with self._lock:
            endpoint = self._endpoints.get(endpoint_id)
            if not endpoint:
                return None

            return {
                "id": endpoint.id,
                "path": endpoint.path,
                "method": endpoint.method,
                "response_status": endpoint.response_status,
                "response_body": endpoint.response_body,
                "response_headers": endpoint.response_headers,
                "delay_ms": endpoint.delay_ms,
                "enabled": endpoint.enabled,
                "description": endpoint.description,
                "created_at": endpoint.created_at
            }

    def get_endpoints(self, method: str = None) -> List[Dict]:
        """Get all endpoints."""
        with self._lock:
            endpoints = list(self._endpoints.values())

        if method:
            endpoints = [e for e in endpoints if e.method == method.upper()]

        return [
            {
                "id": e.id,
                "path": e.path,
                "method": e.method,
                "response_status": e.response_status,
                "enabled": e.enabled,
                "description": e.description
            }
            for e in endpoints
        ]

    def match_request(self, path: str, method: str) -> Optional[MockEndpoint]:
        """Match a request to an endpoint."""
        with self._lock:
            # Find matching endpoint
            for endpoint in self._endpoints.values():
                if not endpoint.enabled:
                    continue

                if endpoint.method != method.upper():
                    continue

                # Match path (support wildcards)
                if self._match_path(endpoint.path, path):
                    # Record request
                    self._record_request(endpoint.id, path, method, {}, None)
                    return endpoint

        return None

    def _match_path(self, pattern: str, path: str) -> bool:
        """Match path against pattern with wildcards."""
        # Convert wildcard to regex
        regex = pattern.replace("*", ".*")
        regex = f"^{regex}$"
        return bool(re.match(regex, path))

    def _record_request(
        self,
        endpoint_id: str,
        path: str,
        method: str,
        headers: Dict,
        body: Any
    ):
        """Record a request."""
        request = MockRequest(
            id=str(uuid.uuid4())[:8],
            endpoint_id=endpoint_id,
            path=path,
            method=method,
            headers=headers,
            body=body
        )

        with self._lock:
            self._requests.append(request)
            if len(self._requests) > self._max_requests:
                self._requests = self._requests[-self._max_requests:]

    def get_requests(self, endpoint_id: str = None, limit: int = 100) -> List[Dict]:
        """Get recorded requests."""
        with self._lock:
            requests = self._requests.copy()

        if endpoint_id:
            requests = [r for r in requests if r.endpoint_id == endpoint_id]

        requests = sorted(requests, key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "id": r.id,
                "endpoint_id": r.endpoint_id,
                "path": r.path,
                "method": r.method,
                "timestamp": r.timestamp
            }
            for r in requests[:limit]
        ]

    def clear_requests(self):
        """Clear recorded requests."""
        with self._lock:
            self._requests.clear()

    def get_stats(self) -> Dict:
        """Get mock server statistics."""
        with self._lock:
            total_endpoints = len(self._endpoints)
            enabled_endpoints = sum(1 for e in self._endpoints.values() if e.enabled)
            total_requests = len(self._requests)

            by_method = {}
            for e in self._endpoints.values():
                by_method[e.method] = by_method.get(e.method, 0) + 1

            return {
                "total_endpoints": total_endpoints,
                "enabled_endpoints": enabled_endpoints,
                "total_requests": total_requests,
                "by_method": by_method
            }


# Global mock server
mock_server = MockServer()

# Add default mock endpoints
def init_default_mocks():
    """Initialize default mock endpoints."""
    mock_server.add_endpoint(
        path="/api/users",
        method="GET",
        response_status=200,
        response_body={"users": [{"id": 1, "name": "John"}]},
        description="Get all users"
    )
    mock_server.add_endpoint(
        path="/api/users",
        method="POST",
        response_status=201,
        response_body={"id": 2, "name": "New User"},
        description="Create user"
    )
    mock_server.add_endpoint(
        path="/api/health",
        method="GET",
        response_status=200,
        response_body={"status": "healthy"},
        description="Health check"
    )


init_default_mocks()
