"""Agent Bridge Module

Protocol bridge utilities for agent services including protocol translation, message routing,
connection bridging, protocol detection, and bridge configuration management.
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


class BridgeType(str, Enum):
    """Bridge types."""
    HTTP_WS = "http_ws"
    WS_HTTP = "ws_http"
    TCP_HTTP = "tcp_http"
    HTTP_TCP = "http_tcp"
    GRAPHQL_REST = "graphql_rest"
    REST_GRAPHQL = "rest_graphql"
    MQTT_HTTP = "mqtt_http"
    HTTP_MQTT = "http_mqtt"
    CUSTOM = "custom"


class BridgeState(str, Enum):
    """Bridge state."""
    STOPPED = "stopped"
    STARTING = "starting"
    RUNNING = "running"
    STOPPING = "stopping"
    ERROR = "error"


class MessageFormat(str, Enum):
    """Message formats."""
    JSON = "json"
    XML = "xml"
    TEXT = "text"
    BINARY = "binary"
    PROTOBUF = "protobuf"


@dataclass
class BridgeConfig:
    """Bridge configuration."""
    name: str
    bridge_type: BridgeType
    source_config: Dict[str, Any]
    target_config: Dict[str, Any]
    buffer_size: int = 1024
    timeout: int = 30
    auto_reconnect: bool = True
    max_retries: int = 3
    message_format: MessageFormat = MessageFormat.JSON
    encoding: str = "utf-8"


@dataclass
class BridgeConnection:
    """Bridge connection status."""
    id: str
    bridge_id: str
    direction: str  # source or target
    connected: bool = False
    last_activity: float = None
    bytes_transferred: int = 0
    messages_transferred: int = 0


@dataclass
class BridgeMetrics:
    """Bridge metrics."""
    total_messages: int = 0
    successful_translations: int = 0
    failed_translations: int = 0
    avg_translation_time_ms: float = 0
    total_bytes_in: int = 0
    total_bytes_out: int = 0


@dataclass
class Bridge:
    """Bridge definition."""
    id: str
    name: str
    bridge_type: BridgeType
    config: BridgeConfig
    state: BridgeState = BridgeState.STOPPED
    enabled: bool = True
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    tags: List[str] = field(default_factory=list)


@dataclass
class TranslationRule:
    """Message translation rule."""
    id: str
    bridge_id: str
    source_pattern: str = ""
    target_pattern: str = ""
    field_mappings: Dict[str, str] = field(default_factory=dict)
    enabled: bool = True


@dataclass
class BridgeEvent:
    """Bridge event."""
    id: str
    bridge_id: str
    event_type: str
    timestamp: float = field(default_factory=time.time)
    data: Dict[str, Any] = field(default_factory=dict)


class AgentBridge:
    """Protocol bridge utility for agents."""

    def __init__(self):
        self._lock = threading.RLock()
        self._bridges: Dict[str, Bridge] = {}
        self._connections: Dict[str, BridgeConnection] = {}
        self._rules: Dict[str, List[TranslationRule]] = defaultdict(list)
        self._metrics: Dict[str, BridgeMetrics] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._message_handlers: Dict[str, Callable] = {}

    def create_bridge(
        self,
        name: str,
        bridge_type: BridgeType,
        source_config: Dict[str, Any],
        target_config: Dict[str, Any],
        buffer_size: int = 1024,
        timeout: int = 30,
        auto_reconnect: bool = True,
        max_retries: int = 3,
        message_format: MessageFormat = MessageFormat.JSON,
        encoding: str = "utf-8",
        tags: List[str] = None
    ) -> Bridge:
        """Create a new bridge."""
        with self._lock:
            bridge_id = str(uuid.uuid4())[:8]

            config = BridgeConfig(
                name=name,
                bridge_type=bridge_type,
                source_config=source_config,
                target_config=target_config,
                buffer_size=buffer_size,
                timeout=timeout,
                auto_reconnect=auto_reconnect,
                max_retries=max_retries,
                message_format=message_format,
                encoding=encoding
            )

            bridge = Bridge(
                id=bridge_id,
                name=name,
                bridge_type=bridge_type,
                config=config,
                tags=tags or []
            )

            self._bridges[bridge_id] = bridge
            self._metrics[bridge_id] = BridgeMetrics()

            return bridge

    def get_bridge(self, bridge_id: str) -> Optional[Bridge]:
        """Get bridge by ID."""
        with self._lock:
            return self._bridges.get(bridge_id)

    def update_bridge(
        self,
        bridge_id: str,
        name: str = None,
        enabled: bool = None,
        tags: List[str] = None
    ) -> Optional[Bridge]:
        """Update bridge."""
        with self._lock:
            bridge = self._bridges.get(bridge_id)
            if not bridge:
                return None

            if name is not None:
                bridge.config.name = name
            if enabled is not None:
                bridge.enabled = enabled
            if tags is not None:
                bridge.tags = tags

            bridge.updated_at = time.time()
            return bridge

    def delete_bridge(self, bridge_id: str) -> bool:
        """Delete a bridge."""
        with self._lock:
            if bridge_id in self._bridges:
                del self._bridges[bridge_id]
                if bridge_id in self._metrics:
                    del self._metrics[bridge_id]
                if bridge_id in self._rules:
                    del self._rules[bridge_id]
                return True
            return False

    def list_bridges(
        self,
        bridge_type: BridgeType = None,
        enabled: bool = None,
        state: BridgeState = None,
        tags: List[str] = None
    ) -> List[Bridge]:
        """List bridges with filters."""
        with self._lock:
            result = list(self._bridges.values())

            if bridge_type:
                result = [b for b in result if b.bridge_type == bridge_type]
            if enabled is not None:
                result = [b for b in result if b.enabled == enabled]
            if state:
                result = [b for b in result if b.state == state]
            if tags:
                result = [b for b in result if any(t in b.tags for t in tags)]

            result.sort(key=lambda b: b.updated_at, reverse=True)
            return result

    def start_bridge(self, bridge_id: str) -> bool:
        """Start a bridge."""
        with self._lock:
            bridge = self._bridges.get(bridge_id)
            if not bridge:
                return False

            if bridge.state == BridgeState.RUNNING:
                return True

            try:
                bridge.state = BridgeState.STARTING

                # Simulate bridge start
                # In real implementation, this would establish connections

                bridge.state = BridgeState.RUNNING
                self._emit_event(bridge_id, "started", {})
                return True

            except Exception as e:
                bridge.state = BridgeState.ERROR
                self._emit_event(bridge_id, "error", {"error": str(e)})
                return False

    def stop_bridge(self, bridge_id: str) -> bool:
        """Stop a bridge."""
        with self._lock:
            bridge = self._bridges.get(bridge_id)
            if not bridge:
                return False

            bridge.state = BridgeState.STOPPING

            # Simulate bridge stop
            # In real implementation, this would close connections

            bridge.state = BridgeState.STOPPED
            self._emit_event(bridge_id, "stopped", {})
            return True

    def translate_message(
        self,
        bridge_id: str,
        message: Any,
        direction: str = "source_to_target"
    ) -> Optional[Any]:
        """Translate a message through the bridge."""
        with self._lock:
            bridge = self._bridges.get(bridge_id)
            if not bridge or bridge.state != BridgeState.RUNNING:
                return None

            metrics = self._metrics.get(bridge_id)
            start_time = time.time()

            try:
                # Apply translation rules
                translated = self._apply_rules(bridge_id, message)

                # Simulate translation
                if isinstance(translated, str):
                    pass
                elif isinstance(translated, dict):
                    translated = json.dumps(translated)

                translation_time = (time.time() - start_time) * 1000

                if metrics:
                    metrics.total_messages += 1
                    metrics.successful_translations += 1
                    metrics.total_bytes_in += len(str(message))
                    metrics.total_bytes_out += len(str(translated))

                    if metrics.total_messages > 1:
                        metrics.avg_translation_time_ms = (
                            (metrics.avg_translation_time_ms * (metrics.total_messages - 1) + translation_time)
                            / metrics.total_messages
                        )

                # Call message handlers
                handler = self._message_handlers.get(bridge_id)
                if handler:
                    try:
                        handler(translated, direction)
                    except Exception:
                        pass

                return translated

            except Exception as e:
                if metrics:
                    metrics.total_messages += 1
                    metrics.failed_translations += 1
                return None

    def _apply_rules(self, bridge_id: str, message: Any) -> Any:
        """Apply translation rules to message."""
        rules = self._rules.get(bridge_id, [])
        result = message

        for rule in rules:
            if not rule.enabled:
                continue

            # Apply field mappings
            if rule.field_mappings and isinstance(result, dict):
                for source_field, target_field in rule.field_mappings.items():
                    if source_field in result:
                        result[target_field] = result.pop(source_field)

        return result

    def add_translation_rule(
        self,
        bridge_id: str,
        source_pattern: str = "",
        target_pattern: str = "",
        field_mappings: Dict[str, str] = None,
        enabled: bool = True
    ) -> Optional[TranslationRule]:
        """Add a translation rule to a bridge."""
        with self._lock:
            bridge = self._bridges.get(bridge_id)
            if not bridge:
                return None

            rule = TranslationRule(
                id=str(uuid.uuid4())[:8],
                bridge_id=bridge_id,
                source_pattern=source_pattern,
                target_pattern=target_pattern,
                field_mappings=field_mappings or {},
                enabled=enabled
            )

            self._rules[bridge_id].append(rule)
            return rule

    def remove_translation_rule(self, bridge_id: str, rule_id: str) -> bool:
        """Remove a translation rule."""
        with self._lock:
            rules = self._rules.get(bridge_id, [])
            for i, rule in enumerate(rules):
                if rule.id == rule_id:
                    rules.pop(i)
                    return True
            return False

    def get_translation_rules(self, bridge_id: str) -> List[TranslationRule]:
        """Get translation rules for a bridge."""
        with self._lock:
            return list(self._rules.get(bridge_id, []))

    def register_message_handler(self, bridge_id: str, handler: Callable):
        """Register a message handler for a bridge."""
        with self._lock:
            self._message_handlers[bridge_id] = handler

    def get_metrics(self, bridge_id: str) -> Optional[Dict]:
        """Get bridge metrics."""
        with self._lock:
            metrics = self._metrics.get(bridge_id)
            if not metrics:
                return None

            return {
                "total_messages": metrics.total_messages,
                "successful_translations": metrics.successful_translations,
                "failed_translations": metrics.failed_translations,
                "success_rate": round(
                    metrics.successful_translations / metrics.total_messages * 100, 2
                ) if metrics.total_messages > 0 else 0,
                "avg_translation_time_ms": round(metrics.avg_translation_time_ms, 2),
                "total_bytes_in": metrics.total_bytes_in,
                "total_bytes_out": metrics.total_bytes_out
            }

    def get_all_metrics(self) -> Dict[str, Dict]:
        """Get metrics for all bridges."""
        with self._lock:
            return {
                bid: self.get_metrics(bid)
                for bid in self._bridges.keys()
            }

    def get_bridge_stats(self, bridge_id: str) -> Optional[Dict]:
        """Get bridge statistics."""
        bridge = self.get_bridge(bridge_id)
        if not bridge:
            return None

        return {
            "id": bridge.id,
            "name": bridge.name,
            "bridge_type": bridge.bridge_type.value,
            "state": bridge.state.value,
            "enabled": bridge.enabled,
            "created_at": bridge.created_at,
            "updated_at": bridge.updated_at,
            "rule_count": len(self._rules.get(bridge_id, []))
        }

    def register_hook(self, event_type: str, handler: Callable):
        """Register an event hook."""
        with self._lock:
            self._hooks[event_type].append(handler)

    def _emit_event(self, bridge_id: str, event_type: str, data: Dict[str, Any]):
        """Emit a bridge event."""
        event = BridgeEvent(
            id=str(uuid.uuid4())[:8],
            bridge_id=bridge_id,
            event_type=event_type,
            data=data
        )

        for handler in self._hooks.get(event_type, []):
            try:
                handler(event)
            except Exception:
                pass

    def detect_protocol(self, data: Any) -> str:
        """Detect protocol from message data."""
        if isinstance(data, dict):
            if "query" in data or "mutation" in data:
                return "graphql"
            elif "action" in data or "method" in data:
                return "json-rpc"
            return "json"
        elif isinstance(data, str):
            if data.strip().startswith("<"):
                return "xml"
            elif data.strip().startswith("{"):
                return "json"
        return "text"

    def clone_bridge(
        self,
        bridge_id: str,
        new_name: str = None
    ) -> Optional[Bridge]:
        """Clone a bridge."""
        original = self.get_bridge(bridge_id)
        if not original:
            return None

        config = original.config
        return self.create_bridge(
            name=new_name or f"{config.name} (Copy)",
            bridge_type=original.bridge_type,
            source_config=dict(config.source_config),
            target_config=dict(config.target_config),
            buffer_size=config.buffer_size,
            timeout=config.timeout,
            auto_reconnect=config.auto_reconnect,
            max_retries=config.max_retries,
            message_format=config.message_format,
            encoding=config.encoding,
            tags=list(original.tags)
        )


# Global bridge instance
agent_bridge = AgentBridge()
