"""Agent Integration Module

Integration framework for agent services including connector management, protocol adapters,
data transformation, connection pooling, and integration lifecycle management.
"""
import time
import uuid
import threading
import asyncio
from typing import Dict, List, Optional, Any, Callable, Union
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
import json


class IntegrationType(str, Enum):
    """Integration types."""
    REST = "rest"
    GRAPHQL = "graphql"
    WEBSOCKET = "websocket"
    DATABASE = "database"
    QUEUE = "queue"
    STREAM = "stream"
    FILE = "file"
    API = "api"
    CUSTOM = "custom"


class ConnectionState(str, Enum):
    """Connection state."""
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    CONNECTED = "connected"
    ERROR = "error"
    RECONNECTING = "reconnecting"


class Protocol(str, Enum):
    """Protocol types."""
    HTTP = "http"
    HTTPS = "https"
    WS = "ws"
    WSS = "wss"
    TCP = "tcp"
    UDP = "udp"
    MQTT = "mqtt"
    AMQP = "amqp"


@dataclass
class IntegrationConfig:
    """Integration configuration."""
    name: str
    integration_type: IntegrationType
    protocol: Protocol
    host: str = "localhost"
    port: int = 80
    path: str = ""
    timeout: int = 30
    retry_count: int = 3
    retry_delay: float = 1.0
    headers: Dict[str, str] = field(default_factory=dict)
    query_params: Dict[str, str] = field(default_factory=dict)
    auth: Dict[str, Any] = field(default_factory=dict)
    ssl_enabled: bool = False
    pool_size: int = 10
    max_retries: int = 3


@dataclass
class IntegrationConnection:
    """Integration connection status."""
    id: str
    integration_id: str
    state: ConnectionState
    created_at: float = field(default_factory=time.time)
    last_connected: float = None
    last_error: str = None
    metrics: Dict[str, Any] = field(default_factory=dict)


@dataclass
class IntegrationMetrics:
    """Integration metrics."""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    avg_response_time_ms: float = 0
    total_bytes_sent: int = 0
    total_bytes_received: int = 0


@dataclass
class Integration:
    """Integration definition."""
    id: str
    name: str
    integration_type: IntegrationType
    config: IntegrationConfig
    enabled: bool = True
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    tags: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class IntegrationEvent:
    """Integration event."""
    id: str
    integration_id: str
    event_type: str
    timestamp: float = field(default_factory=time.time)
    data: Dict[str, Any] = field(default_factory=dict)


class AgentIntegration:
    """Integration framework for agents."""

    def __init__(self):
        self._lock = threading.RLock()
        self._integrations: Dict[str, Integration] = {}
        self._connections: Dict[str, IntegrationConnection] = {}
        self._adapters: Dict[str, Any] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._metrics: Dict[str, IntegrationMetrics] = {}
        self._event_handlers: Dict[str, List[Callable]] = defaultdict(list)

    def create_integration(
        self,
        name: str,
        integration_type: IntegrationType,
        protocol: Protocol = Protocol.HTTPS,
        host: str = "localhost",
        port: int = 80,
        path: str = "",
        timeout: int = 30,
        retry_count: int = 3,
        retry_delay: float = 1.0,
        headers: Dict[str, str] = None,
        query_params: Dict[str, str] = None,
        auth: Dict[str, Any] = None,
        ssl_enabled: bool = False,
        pool_size: int = 10,
        max_retries: int = 3,
        tags: List[str] = None,
        metadata: Dict[str, Any] = None
    ) -> Integration:
        """Create a new integration."""
        with self._lock:
            integration_id = str(uuid.uuid4())[:8]

            config = IntegrationConfig(
                name=name,
                integration_type=integration_type,
                protocol=protocol,
                host=host,
                port=port,
                path=path,
                timeout=timeout,
                retry_count=retry_count,
                retry_delay=retry_delay,
                headers=headers or {},
                query_params=query_params or {},
                auth=auth or {},
                ssl_enabled=ssl_enabled,
                pool_size=pool_size,
                max_retries=max_retries
            )

            integration = Integration(
                id=integration_id,
                name=name,
                integration_type=integration_type,
                config=config,
                tags=tags or [],
                metadata=metadata or {}
            )

            self._integrations[integration_id] = integration
            self._metrics[integration_id] = IntegrationMetrics()

            return integration

    def get_integration(self, integration_id: str) -> Optional[Integration]:
        """Get integration by ID."""
        with self._lock:
            return self._integrations.get(integration_id)

    def update_integration(
        self,
        integration_id: str,
        name: str = None,
        enabled: bool = None,
        tags: List[str] = None,
        metadata: Dict[str, Any] = None
    ) -> Optional[Integration]:
        """Update integration."""
        with self._lock:
            integration = self._integrations.get(integration_id)
            if not integration:
                return None

            if name is not None:
                integration.config.name = name
            if enabled is not None:
                integration.enabled = enabled
            if tags is not None:
                integration.tags = tags
            if metadata is not None:
                integration.metadata.update(metadata)

            integration.updated_at = time.time()
            return integration

    def delete_integration(self, integration_id: str) -> bool:
        """Delete an integration."""
        with self._lock:
            if integration_id in self._integrations:
                del self._integrations[integration_id]
                if integration_id in self._metrics:
                    del self._metrics[integration_id]
                return True
            return False

    def list_integrations(
        self,
        integration_type: IntegrationType = None,
        enabled: bool = None,
        tags: List[str] = None
    ) -> List[Integration]:
        """List integrations with optional filters."""
        with self._lock:
            result = list(self._integrations.values())

            if integration_type:
                result = [i for i in result if i.integration_type == integration_type]
            if enabled is not None:
                result = [i for i in result if i.enabled == enabled]
            if tags:
                result = [i for i in result if any(t in i.tags for t in tags)]

            result.sort(key=lambda i: i.updated_at, reverse=True)
            return result

    def connect(self, integration_id: str) -> bool:
        """Connect to an integration."""
        with self._lock:
            integration = self._integrations.get(integration_id)
            if not integration:
                return False

            connection_id = str(uuid.uuid4())[:8]
            connection = IntegrationConnection(
                id=connection_id,
                integration_id=integration_id,
                state=ConnectionState.CONNECTING
            )

            # Simulate connection attempt
            try:
                # In real implementation, this would establish actual connection
                connection.state = ConnectionState.CONNECTED
                connection.last_connected = time.time()
                self._connections[connection_id] = connection

                # Emit event
                self._emit_event(integration_id, "connected", {"connection_id": connection_id})
                return True

            except Exception as e:
                connection.state = ConnectionState.ERROR
                connection.last_error = str(e)
                self._connections[connection_id] = connection
                return False

    def disconnect(self, integration_id: str) -> bool:
        """Disconnect from an integration."""
        with self._lock:
            # Find and disconnect all connections for this integration
            disconnected = False
            for conn_id, conn in list(self._connections.items()):
                if conn.integration_id == integration_id:
                    conn.state = ConnectionState.DISCONNECTED
                    disconnected = True

            if disconnected:
                self._emit_event(integration_id, "disconnected", {})
            return disconnected

    def get_connection_status(self, integration_id: str) -> Optional[IntegrationConnection]:
        """Get connection status for an integration."""
        with self._lock:
            for conn in self._connections.values():
                if conn.integration_id == integration_id:
                    return conn
            return None

    def register_adapter(self, integration_type: IntegrationType, adapter: Any):
        """Register a protocol adapter."""
        with self._lock:
            self._adapters[integration_type.value] = adapter

    def get_adapter(self, integration_type: IntegrationType) -> Optional[Any]:
        """Get a registered adapter."""
        with self._lock:
            return self._adapters.get(integration_type.value)

    def register_hook(self, event_type: str, handler: Callable):
        """Register an event hook."""
        with self._lock:
            self._hooks[event_type].append(handler)

    def _emit_event(self, integration_id: str, event_type: str, data: Dict[str, Any]):
        """Emit an integration event."""
        event = IntegrationEvent(
            id=str(uuid.uuid4())[:8],
            integration_id=integration_id,
            event_type=event_type,
            data=data
        )

        # Call registered hooks
        for handler in self._hooks.get(event_type, []):
            try:
                handler(event)
            except Exception:
                pass

        # Call event-specific handlers
        for handler in self._event_handlers.get(integration_id, []):
            try:
                handler(event)
            except Exception:
                pass

    def register_event_handler(self, integration_id: str, handler: Callable):
        """Register an event handler for a specific integration."""
        with self._lock:
            self._event_handlers[integration_id].append(handler)

    def record_request(
        self,
        integration_id: str,
        success: bool,
        response_time_ms: float,
        bytes_sent: int = 0,
        bytes_received: int = 0
    ):
        """Record request metrics."""
        with self._lock:
            metrics = self._metrics.get(integration_id)
            if not metrics:
                return

            metrics.total_requests += 1
            if success:
                metrics.successful_requests += 1
            else:
                metrics.failed_requests += 1

            # Update average response time
            if metrics.total_requests > 1:
                metrics.avg_response_time_ms = (
                    (metrics.avg_response_time_ms * (metrics.total_requests - 1) + response_time_ms)
                    / metrics.total_requests
                )

            metrics.total_bytes_sent += bytes_sent
            metrics.total_bytes_received += bytes_received

    def get_metrics(self, integration_id: str) -> Optional[Dict]:
        """Get integration metrics."""
        with self._lock:
            metrics = self._metrics.get(integration_id)
            if not metrics:
                return None

            return {
                "total_requests": metrics.total_requests,
                "successful_requests": metrics.successful_requests,
                "failed_requests": metrics.failed_requests,
                "success_rate": round(
                    metrics.successful_requests / metrics.total_requests * 100, 2
                ) if metrics.total_requests > 0 else 0,
                "avg_response_time_ms": round(metrics.avg_response_time_ms, 2),
                "total_bytes_sent": metrics.total_bytes_sent,
                "total_bytes_received": metrics.total_bytes_received
            }

    def get_all_metrics(self) -> Dict[str, Dict]:
        """Get metrics for all integrations."""
        with self._lock:
            return {
                iid: self.get_metrics(iid)
                for iid in self._integrations.keys()
            }

    def test_connection(self, integration_id: str) -> Dict:
        """Test connection to an integration."""
        integration = self.get_integration(integration_id)
        if not integration:
            return {"success": False, "error": "Integration not found"}

        # Simulate connection test
        try:
            # In real implementation, this would test actual connectivity
            return {
                "success": True,
                "integration_id": integration_id,
                "integration_type": integration.integration_type.value,
                "protocol": integration.config.protocol.value,
                "host": integration.config.host,
                "port": integration.config.port,
                "response_time_ms": 0
            }
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    def get_integration_url(self, integration_id: str) -> Optional[str]:
        """Get full URL for an integration."""
        integration = self.get_integration(integration_id)
        if not integration:
            return None

        config = integration.config
        protocol = "https" if config.ssl_enabled else "http"
        return f"{protocol}://{config.host}:{config.port}{config.path}"

    def clone_integration(
        self,
        integration_id: str,
        new_name: str = None
    ) -> Optional[Integration]:
        """Clone an integration."""
        original = self.get_integration(integration_id)
        if not original:
            return None

        config = original.config
        return self.create_integration(
            name=new_name or f"{config.name} (Copy)",
            integration_type=original.integration_type,
            protocol=config.protocol,
            host=config.host,
            port=config.port,
            path=config.path,
            timeout=config.timeout,
            retry_count=config.retry_count,
            retry_delay=config.retry_delay,
            headers=dict(config.headers),
            query_params=dict(config.query_params),
            auth=dict(config.auth),
            ssl_enabled=config.ssl_enabled,
            pool_size=config.pool_size,
            max_retries=config.max_retries,
            tags=list(original.tags),
            metadata=dict(original.metadata)
        )


# Global integration instance
agent_integration = AgentIntegration()
