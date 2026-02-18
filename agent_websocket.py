"""Agent WebSocket Module

WebSocket support for real-time agent communication with connection management,
message handling, room/topic management, heartbeat, and reconnection logic.
"""
import asyncio
import json
import time
import uuid
from typing import Dict, List, Optional, Any, Callable, Set
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
from collections import deque
import threading


class ConnectionState(str, Enum):
    """WebSocket connection states."""
    CONNECTING = "connecting"
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    RECONNECTING = "reconnecting"
    CLOSED = "closed"
    ERROR = "error"


class MessageType(str, Enum):
    """WebSocket message types."""
    TEXT = "text"
    BINARY = "binary"
    PING = "ping"
    PONG = "pong"
    JOIN = "join"
    LEAVE = "leave"
    BROADCAST = "broadcast"
    ACK = "ack"
    ERROR = "error"
    HEARTBEAT = "heartbeat"
    SUBSCRIBE = "subscribe"
    UNSUBSCRIBE = "unsubscribe"


@dataclass
class WebSocketConfig:
    """WebSocket configuration."""
    heartbeat_interval: float = 30.0
    heartbeat_timeout: float = 10.0
    max_message_size: int = 10 * 1024 * 1024  # 10MB
    max_connections: int = 10000
    max_messages_per_second: int = 100
    reconnect_enabled: bool = True
    max_reconnect_attempts: int = 5
    reconnect_delay: float = 1.0
    max_reconnect_delay: float = 60.0
    buffer_size: int = 1000
    compression_enabled: bool = True


@dataclass
class ClientInfo:
    """Client connection information."""
    client_id: str
    connection_time: float
    last_activity: float
    room_ids: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    reconnect_from: str = None
    message_count: int = 0
    bytes_received: int = 0
    bytes_sent: int = 0


@dataclass
class RoomInfo:
    """Room/topic information."""
    room_id: str
    created_at: float
    created_by: str
    max_clients: int = 0  # 0 = unlimited
    metadata: Dict[str, Any] = field(default_factory=dict)
    client_ids: Set[str] = field(default_factory=set)
    message_count: int = 0


@dataclass
class Message:
    """WebSocket message."""
    id: str
    type: MessageType
    content: Any
    sender_id: str
    room_id: str = None
    timestamp: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)
    ack_required: bool = False
    correlation_id: str = None


@dataclass
class WebSocketStats:
    """WebSocket statistics."""
    total_connections: int = 0
    active_connections: int = 0
    total_messages_sent: int = 0
    total_messages_received: int = 0
    total_bytes_sent: int = 0
    total_bytes_received: int = 0
    total_rooms: int = 0
    total_errors: int = 0
    avg_latency_ms: float = 0
    reconnections: int = 0


class RateLimiter:
    """Rate limiter for WebSocket connections."""

    def __init__(self, max_messages: int, window_seconds: float = 1.0):
        self._max_messages = max_messages
        self._window_seconds = window_seconds
        self._messages: deque = deque()
        self._lock = threading.Lock()

    def allow(self) -> bool:
        with self._lock:
            now = time.time()
            cutoff = now - self._window_seconds

            while self._messages and self._messages[0] < cutoff:
                self._messages.popleft()

            if len(self._messages) < self._max_messages:
                self._messages.append(now)
                return True
            return False

    def get_current_count(self) -> int:
        with self._lock:
            now = time.time()
            cutoff = now - self._window_seconds
            return len([m for m in self._messages if m >= cutoff])


class AgentWebSocketManager:
    """WebSocket connection manager for agents."""

    def __init__(self, config: WebSocketConfig = None):
        self._config = config or WebSocketConfig()
        self._lock = threading.RLock()
        self._clients: Dict[str, ClientInfo] = {}
        self._rooms: Dict[str, RoomInfo] = {}
        self._rate_limiters: Dict[str, RateLimiter] = {}
        self._handlers: Dict[MessageType, Callable] = {}
        self._middleware: List[Callable] = []
        self._stats = WebSocketStats()
        self._heartbeat_task: asyncio.Task = None
        self._running = False

        # WebSocket storage (filled by FastAPI)
        self._websocket_connections: Dict[str, Any] = {}

    def set_websocket(self, client_id: str, websocket):
        """Store WebSocket connection."""
        with self._lock:
            self._websocket_connections[client_id] = websocket

    def remove_websocket(self, client_id: str):
        """Remove WebSocket connection."""
        with self._lock:
            self._websocket_connections.pop(client_id, None)

    def get_websocket(self, client_id: str):
        """Get WebSocket connection."""
        return self._websocket_connections.get(client_id)

    async def connect(
        self,
        client_id: str,
        metadata: Dict[str, Any] = None,
        reconnect_from: str = None
    ) -> ClientInfo:
        """Handle new client connection."""
        with self._lock:
            if self._stats.active_connections >= self._config.max_connections:
                raise ValueError("Max connections reached")

            client_info = ClientInfo(
                client_id=client_id,
                connection_time=time.time(),
                last_activity=time.time(),
                metadata=metadata or {},
                reconnect_from=reconnect_from
            )
            self._clients[client_id] = client_info

            # Initialize rate limiter
            self._rate_limiters[client_id] = RateLimiter(
                self._config.max_messages_per_second
            )

            self._stats.total_connections += 1
            self._stats.active_connections += 1

            if reconnect_from:
                self._stats.reconnections += 1

            return client_info

    async def disconnect(self, client_id: str) -> bool:
        """Handle client disconnection."""
        with self._lock:
            client = self._clients.get(client_id)
            if not client:
                return False

            # Leave all rooms
            for room_id in list(client.room_ids):
                self._leave_room_internal(room_id, client_id)

            # Remove rate limiter
            self._rate_limiters.pop(client_id, None)

            # Remove WebSocket
            self._websocket_connections.pop(client_id, None)

            # Update stats
            self._stats.active_connections -= 1
            self._stats.total_messages_sent += client.message_count
            self._stats.total_bytes_received += client.bytes_received
            self._stats.total_bytes_sent += client.bytes_sent

            # Mark as disconnected but keep info
            return True

    def _leave_room_internal(self, room_id: str, client_id: str):
        """Internal method to leave a room."""
        room = self._rooms.get(room_id)
        if room:
            room.client_ids.discard(client_id)
            if client_id in room.client_ids:
                room.client_ids.remove(client_id)

        client = self._clients.get(client_id)
        if client and room_id in client.room_ids:
            client.room_ids.remove(room_id)

    async def create_room(
        self,
        room_id: str,
        created_by: str,
        max_clients: int = 0,
        metadata: Dict[str, Any] = None
    ) -> RoomInfo:
        """Create a new room/topic."""
        with self._lock:
            if room_id in self._rooms:
                raise ValueError(f"Room {room_id} already exists")

            room = RoomInfo(
                room_id=room_id,
                created_at=time.time(),
                created_by=created_by,
                max_clients=max_clients,
                metadata=metadata or {}
            )
            self._rooms[room_id] = room
            self._stats.total_rooms += 1

            return room

    async def delete_room(self, room_id: str) -> bool:
        """Delete a room."""
        with self._lock:
            room = self._rooms.get(room_id)
            if not room:
                return False

            # Remove all clients from room
            for client_id in list(room.client_ids):
                self._leave_room_internal(room_id, client_id)

            del self._rooms[room_id]
            return True

    async def join_room(self, room_id: str, client_id: str) -> bool:
        """Join a client to a room."""
        with self._lock:
            room = self._rooms.get(room_id)
            client = self._clients.get(client_id)

            if not room or not client:
                return False

            if room.max_clients > 0 and len(room.client_ids) >= room.max_clients:
                return False

            if room_id not in client.room_ids:
                client.room_ids.append(room_id)
                room.client_ids.add(client_id)
                room.message_count += 1

            return True

    async def leave_room(self, room_id: str, client_id: str) -> bool:
        """Remove a client from a room."""
        with self._lock:
            self._leave_room_internal(room_id, client_id)
            return True

    async def send_to_client(
        self,
        client_id: str,
        message: Any,
        message_type: MessageType = MessageType.TEXT,
        correlation_id: str = None
    ) -> bool:
        """Send message to a specific client."""
        websocket = self.get_websocket(client_id)
        if not websocket:
            return False

        try:
            msg_data = {
                "id": str(uuid.uuid4()),
                "type": message_type.value,
                "content": message,
                "timestamp": time.time(),
            }
            if correlation_id:
                msg_data["correlation_id"] = correlation_id

            await websocket.send_json(msg_data)

            with self._lock:
                client = self._clients.get(client_id)
                if client:
                    client.message_count += 1
                    self._stats.total_messages_sent += 1

            return True
        except Exception:
            self._stats.total_errors += 1
            return False

    async def broadcast_to_room(
        self,
        room_id: str,
        message: Any,
        message_type: MessageType = MessageType.BROADCAST,
        exclude: Set[str] = None
    ) -> int:
        """Broadcast message to all clients in a room."""
        with self._lock:
            room = self._rooms.get(room_id)
            if not room:
                return 0

            exclude = exclude or set()
            count = 0

            for client_id in list(room.client_ids):
                if client_id not in exclude:
                    if await self.send_to_client(client_id, message, message_type):
                        count += 1

            return count

    async def broadcast_to_all(
        self,
        message: Any,
        message_type: MessageType = MessageType.BROADCAST,
        exclude: Set[str] = None
    ) -> int:
        """Broadcast message to all connected clients."""
        with self._lock:
            exclude = exclude or set()
            count = 0

            for client_id in list(self._clients.keys()):
                if client_id not in exclude:
                    if await self.send_to_client(client_id, message, message_type):
                        count += 1

            return count

    async def send_ping(self, client_id: str) -> bool:
        """Send ping to client."""
        return await self.send_to_client(
            client_id,
            {"timestamp": time.time()},
            MessageType.PING
        )

    async def handle_pong(self, client_id: str, timestamp: float) -> float:
        """Handle pong response and calculate latency."""
        latency = (time.time() - timestamp) * 1000
        with self._lock:
            client = self._clients.get(client_id)
            if client:
                client.last_activity = time.time()
        return latency

    def register_handler(self, message_type: MessageType, handler: Callable):
        """Register message handler."""
        self._handlers[message_type] = handler

    def add_middleware(self, middleware: Callable):
        """Add middleware function."""
        self._middleware.append(middleware)

    async def process_message(
        self,
        client_id: str,
        message_data: Dict[str, Any]
    ) -> Optional[Any]:
        """Process incoming message through middleware and handlers."""
        # Apply middleware
        for middleware in self._middleware:
            message_data = await middleware(client_id, message_data)
            if message_data is None:
                return None

        # Check rate limit
        rate_limiter = self._rate_limiters.get(client_id)
        if rate_limiter and not rate_limiter.allow():
            await self.send_to_client(
                client_id,
                {"error": "Rate limit exceeded"},
                MessageType.ERROR
            )
            return None

        # Update client stats
        with self._lock:
            client = self._clients.get(client_id)
            if client:
                client.last_activity = time.time()
                client.bytes_received += len(json.dumps(message_data))
                self._stats.total_messages_received += 1

        # Get message type
        msg_type = message_data.get("type", "text")
        if isinstance(msg_type, str):
            msg_type = MessageType(msg_type)

        # Find handler
        handler = self._handlers.get(msg_type)
        if handler:
            return await handler(client_id, message_data)

        return None

    def get_client(self, client_id: str) -> Optional[ClientInfo]:
        """Get client information."""
        return self._clients.get(client_id)

    def get_room(self, room_id: str) -> Optional[RoomInfo]:
        """Get room information."""
        return self._rooms.get(room_id)

    def get_clients(self, room_id: str = None) -> List[Dict]:
        """Get list of clients."""
        with self._lock:
            if room_id:
                room = self._rooms.get(room_id)
                if not room:
                    return []
                return [
                    {"client_id": cid, **self._clients[cid].__dict__}
                    for cid in room.client_ids
                    if cid in self._clients
                ]
            return [
                {"client_id": cid, **info.__dict__}
                for cid, info in self._clients.items()
            ]

    def get_rooms(self) -> List[Dict]:
        """Get list of rooms."""
        with self._lock:
            return [
                {"room_id": rid, **room.__dict__}
                for rid, room in self._rooms.items()
            ]

    def get_stats(self) -> Dict:
        """Get WebSocket statistics."""
        with self._lock:
            return {
                "total_connections": self._stats.total_connections,
                "active_connections": self._stats.active_connections,
                "total_messages_sent": self._stats.total_messages_sent,
                "total_messages_received": self._stats.total_messages_received,
                "total_bytes_sent": self._stats.total_bytes_sent,
                "total_bytes_received": self._stats.total_bytes_received,
                "total_rooms": self._stats.total_rooms,
                "total_errors": self._stats.total_errors,
                "avg_latency_ms": round(self._stats.avg_latency_ms, 2),
                "reconnections": self._stats.reconnections,
                "config": {
                    "heartbeat_interval": self._config.heartbeat_interval,
                    "max_connections": self._config.max_connections,
                    "max_messages_per_second": self._config.max_messages_per_second,
                    "reconnect_enabled": self._config.reconnect_enabled,
                }
            }

    async def start_heartbeat(self):
        """Start heartbeat task."""
        if self._heartbeat_task and not self._heartbeat_task.done():
            return

        self._running = True
        self._heartbeat_task = asyncio.create_task(self._heartbeat_loop())

    async def stop_heartbeat(self):
        """Stop heartbeat task."""
        self._running = False
        if self._heartbeat_task:
            self._heartbeat_task.cancel()
            try:
                await self._heartbeat_task
            except asyncio.CancelledError:
                pass

    async def _heartbeat_loop(self):
        """Heartbeat loop to check client connections."""
        while self._running:
            try:
                await asyncio.sleep(self._config.heartbeat_interval)

                with self._lock:
                    now = time.time()
                    timeout = self._config.heartbeat_timeout

                    for client_id, client in list(self._clients.items()):
                        if now - client.last_activity > timeout:
                            # Client timed out
                            await self.disconnect(client_id)

            except asyncio.CancelledError:
                break
            except Exception:
                self._stats.total_errors += 1


# Global WebSocket manager instance
agent_ws_manager = AgentWebSocketManager()
