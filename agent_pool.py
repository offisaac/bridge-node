"""Agent Pool Module

Agent connection pool manager with lifecycle management, health checks,
resource allocation, and auto-scaling capabilities.
"""
import time
import threading
import uuid
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from collections import defaultdict
from queue import Queue, Empty
import random


class PoolState(str, Enum):
    """Pool states."""
    INITIALIZING = "initializing"
    ACTIVE = "active"
    DEGRADED = "degraded"
    DRAINING = "draining"
    TERMINATED = "terminated"


class ConnectionState(str, Enum):
    """Connection states."""
    IDLE = "idle"
    ACTIVE = "active"
    HEALTH_CHECK = "health_check"
    RECYCLING = "recycling"
    TERMINATED = "terminated"


class PoolStrategy(str, Enum):
    """Pool allocation strategies."""
    FIFO = "fifo"
    LIFO = "lifo"
    LRU = "lru"
    LFU = "lfu"
    RANDOM = "random"
    PRIORITY = "priority"


@dataclass
class PoolConfig:
    """Pool configuration."""
    min_size: int = 1
    max_size: int = 10
    initial_size: int = 2
    max_idle_time: int = 300  # seconds
    max_lifetime: int = 3600  # seconds
    health_check_interval: int = 60  # seconds
    health_check_timeout: int = 5  # seconds
    eviction_interval: int = 30  # seconds
    wait_timeout: int = 30  # seconds
    validation_query: str = None
    validation_on_borrow: bool = True
    validation_on_return: bool = False
    test_on_create: bool = False
    auto_scaling_enabled: bool = False
    scale_up_threshold: float = 0.8  # 80% utilization
    scale_down_threshold: float = 0.2  # 20% utilization
    scale_up_cooldown: int = 60  # seconds
    scale_down_cooldown: int = 300  # seconds


@dataclass
class AgentConnection:
    """Agent connection wrapper."""
    id: str
    agent_id: str
    connection: Any  # Actual connection object
    state: ConnectionState
    created_at: float
    last_used_at: float
    last_health_check: float = 0
    use_count: int = 0
    error_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PoolStats:
    """Pool statistics."""
    total_connections: int = 0
    active_connections: int = 0
    idle_connections: int = 0
    waiting_requests: int = 0
    total_acquired: int = 0
    total_released: int = 0
    total_created: int = 0
    total_destroyed: int = 0
    health_check_failures: int = 0
    timeout_errors: int = 0
    avg_wait_time_ms: float = 0
    avg_usage_time_ms: float = 0


class AgentPool:
    """Manage agent connection pool."""

    def __init__(self, agent_id: str, config: PoolConfig = None, factory: Callable = None):
        self._lock = threading.RLock()
        self._agent_id = agent_id
        self._config = config or PoolConfig()
        self._factory = factory or self._default_factory

        self._connections: Dict[str, AgentConnection] = {}
        self._idle_queue: List[str] = []
        self._active_connections: Dict[str, AgentConnection] = {}
        self._waiting_queue: Queue = Queue()

        self._state = PoolState.INITIALIZING
        self._stats = PoolStats()

        self._last_scale_up = 0
        self._last_scale_down = 0

        # Background threads
        self._monitor_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()

        # Initialize pool
        self._initialize()

    def _default_factory(self) -> Any:
        """Default connection factory."""
        return {"created_at": time.time()}

    def _initialize(self):
        """Initialize the pool."""
        with self._lock:
            # Create initial connections
            for _ in range(self._config.initial_size):
                conn = self._create_connection()
                if conn:
                    self._connections[conn.id] = conn
                    self._idle_queue.append(conn.id)

            self._state = PoolState.ACTIVE
            self._start_monitor()

    def _create_connection(self) -> Optional[AgentConnection]:
        """Create a new connection."""
        try:
            conn_obj = self._factory()
            conn = AgentConnection(
                id=str(uuid.uuid4())[:12],
                agent_id=self._agent_id,
                connection=conn_obj,
                state=ConnectionState.IDLE,
                created_at=time.time(),
                last_used_at=time.time()
            )
            self._stats.total_created += 1
            return conn
        except Exception as e:
            return None

    def _start_monitor(self):
        """Start background monitor thread."""
        if self._monitor_thread and self._monitor_thread.is_alive():
            return
        self._stop_event.clear()
        self._monitor_thread = threading.Thread(target=self._run_monitor, daemon=True)
        self._monitor_thread.start()

    def _run_monitor(self):
        """Background monitoring loop."""
        while not self._stop_event.is_set():
            try:
                self._health_check()
                self._evict_idle()
                self._auto_scale()
            except Exception:
                pass
            time.sleep(5)

    def _health_check(self):
        """Perform health checks on connections."""
        current_time = time.time()
        if current_time - self._config.health_check_interval < self._last_health_check:
            return

        with self._lock:
            for conn_id, conn in list(self._connections.items()):
                if conn.state == ConnectionState.ACTIVE:
                    continue

                # Check if health check needed
                if current_time - conn.last_health_check < self._config.health_check_interval:
                    continue

                conn.last_health_check = current_time
                conn.state = ConnectionState.HEALTH_CHECK

                # Simple health check - verify connection is alive
                if conn.connection is None:
                    self._destroy_connection(conn_id)
                    self._stats.health_check_failures += 1
                else:
                    conn.state = ConnectionState.IDLE

    def _evict_idle(self):
        """Evict idle connections beyond min_size."""
        current_time = time.time()
        if current_time - self._config.eviction_interval < getattr(self, '_last_eviction', 0):
            return
        self._last_eviction = current_time

        with self._lock:
            # Calculate how many to evict
            idle_count = len(self._idle_queue)
            min_idle = self._config.min_size

            if idle_count <= min_idle:
                return

            # Evict oldest idle connections
            to_evict = idle_count - min_idle
            for _ in range(to_evict):
                if not self._idle_queue:
                    break
                conn_id = self._idle_queue.pop(0)
                if conn_id in self._connections:
                    self._destroy_connection(conn_id)

    def _auto_scale(self):
        """Auto-scale pool based on demand."""
        if not self._config.auto_scaling_enabled:
            return

        current_time = time.time()
        utilization = self.get_utilization()

        # Scale up
        if utilization > self._config.scale_up_threshold:
            if current_time - self._last_scale_up > self._config.scale_up_cooldown:
                if len(self._connections) < self._config.max_size:
                    conn = self._create_connection()
                    if conn:
                        self._connections[conn.id] = conn
                        self._idle_queue.append(conn.id)
                        self._last_scale_up = current_time

        # Scale down
        elif utilization < self._config.scale_down_threshold:
            if current_time - self._last_scale_down > self._config.scale_down_cooldown:
                if len(self._connections) > self._config.min_size:
                    if self._idle_queue:
                        conn_id = self._idle_queue.pop(0)
                        self._destroy_connection(conn_id)
                        self._last_scale_down = current_time

    def _destroy_connection(self, conn_id: str):
        """Destroy a connection."""
        if conn_id in self._connections:
            conn = self._connections[conn_id]
            conn.state = ConnectionState.TERMINATED
            del self._connections[conn_id]
            self._stats.total_destroyed += 1

    def acquire(self, timeout: float = None) -> Optional[AgentConnection]:
        """Acquire a connection from the pool."""
        timeout = timeout or self._config.wait_timeout
        start_time = time.time()

        while True:
            conn = self._try_acquire()
            if conn:
                return conn

            # Check timeout
            if time.time() - start_time > timeout:
                self._stats.timeout_errors += 1
                return None

            # Wait for available connection
            try:
                time.sleep(0.01)
            except Exception:
                return None

    def _try_acquire(self) -> Optional[AgentConnection]:
        """Try to acquire a connection without blocking."""
        with self._lock:
            # Check if we can create a new connection
            if len(self._connections) < self._config.max_size:
                if not self._idle_queue:
                    # Create new connection
                    conn = self._create_connection()
                    if conn:
                        self._connections[conn.id] = conn
                        self._active_connections[conn.id] = conn
                        conn.state = ConnectionState.ACTIVE
                        conn.last_used_at = time.time()
                        conn.use_count += 1
                        self._stats.total_acquired += 1
                        return conn

            # Get from idle queue
            if self._idle_queue:
                # Apply pool strategy
                conn_id = self._apply_strategy()
                if conn_id:
                    conn = self._connections.get(conn_id)
                    if conn and conn.state == ConnectionState.IDLE:
                        # Validate if needed
                        if self._config.validation_on_borrow:
                            if not self._validate_connection(conn):
                                self._destroy_connection(conn_id)
                                self._stats.health_check_failures += 1
                                return self._try_acquire()  # Retry

                        conn.state = ConnectionState.ACTIVE
                        conn.last_used_at = time.time()
                        conn.use_count += 1
                        self._active_connections[conn.id] = conn
                        self._stats.total_acquired += 1
                        return conn

            return None

    def _apply_strategy(self) -> Optional[str]:
        """Apply pool selection strategy."""
        if not self._idle_queue:
            return None

        strategy = PoolStrategy.FIFO  # Default

        if strategy == PoolStrategy.FIFO:
            return self._idle_queue.pop(0)
        elif strategy == PoolStrategy.LIFO:
            return self._idle_queue.pop()
        elif strategy == PoolStrategy.LRU:
            # Least recently used
            conns = [(cid, self._connections[cid].last_used_at) for cid in self._idle_queue]
            conns.sort(key=lambda x: x[1])
            conn_id = conns[0][0]
            self._idle_queue.remove(conn_id)
            return conn_id
        elif strategy == PoolStrategy.LFU:
            # Least frequently used
            conns = [(cid, self._connections[cid].use_count) for cid in self._idle_queue]
            conns.sort(key=lambda x: x[1])
            conn_id = conns[0][0]
            self._idle_queue.remove(conn_id)
            return conn_id
        elif strategy == PoolStrategy.RANDOM:
            idx = random.randint(0, len(self._idle_queue) - 1)
            return self._idle_queue.pop(idx)

        return self._idle_queue.pop(0)

    def _validate_connection(self, conn: AgentConnection) -> bool:
        """Validate a connection."""
        # Simple validation - check if connection object exists
        if conn.connection is None:
            return False

        # If validation query configured, would execute here
        if self._config.validation_query:
            pass  # Execute validation query

        # Check max lifetime
        if time.time() - conn.created_at > self._config.max_lifetime:
            return False

        return True

    def release(self, conn: AgentConnection):
        """Release a connection back to the pool."""
        with self._lock:
            if conn.id not in self._connections:
                return

            conn_id = conn.id

            # Validate on return
            if self._config.validation_on_return:
                if not self._validate_connection(conn):
                    self._destroy_connection(conn_id)
                    return

            # Check max idle time
            if time.time() - conn.last_used_at > self._config.max_idle_time:
                self._destroy_connection(conn_id)
                return

            # Return to pool
            conn.state = ConnectionState.IDLE
            if conn_id in self._active_connections:
                del self._active_connections[conn_id]
            self._idle_queue.append(conn_id)
            self._stats.total_released += 1

    def get_connection(self, conn_id: str) -> Optional[AgentConnection]:
        """Get a specific connection."""
        with self._lock:
            return self._connections.get(conn_id)

    def get_stats(self) -> Dict:
        """Get pool statistics."""
        with self._lock:
            return {
                "agent_id": self._agent_id,
                "state": self._state.value,
                "total_connections": len(self._connections),
                "active_connections": len(self._active_connections),
                "idle_connections": len(self._idle_queue),
                "waiting_requests": self._waiting_queue.qsize(),
                "config": {
                    "min_size": self._config.min_size,
                    "max_size": self._config.max_size,
                    "max_idle_time": self._config.max_idle_time,
                    "max_lifetime": self._config.max_lifetime,
                    "auto_scaling": self._config.auto_scaling_enabled
                },
                "stats": {
                    "total_acquired": self._stats.total_acquired,
                    "total_released": self._stats.total_released,
                    "total_created": self._stats.total_created,
                    "total_destroyed": self._stats.total_destroyed,
                    "health_check_failures": self._stats.health_check_failures,
                    "timeout_errors": self._stats.timeout_errors
                }
            }

    def get_utilization(self) -> float:
        """Get pool utilization."""
        with self._lock:
            if not self._connections:
                return 0.0
            return len(self._active_connections) / len(self._connections)

    def close(self):
        """Close the pool."""
        self._stop_event.set()
        with self._lock:
            self._state = PoolState.DRAINING
            # Close all connections
            for conn_id in list(self._connections.keys()):
                self._destroy_connection(conn_id)
            self._state = PoolState.TERMINATED


class PoolManager:
    """Manage multiple agent pools."""

    def __init__(self):
        self._lock = threading.RLock()
        self._pools: Dict[str, AgentPool] = {}
        self._default_config = PoolConfig()

    def create_pool(
        self,
        agent_id: str,
        config: PoolConfig = None,
        factory: Callable = None
    ) -> AgentPool:
        """Create a new pool."""
        with self._lock:
            if agent_id in self._pools:
                return self._pools[agent_id]

            pool_config = config or self._default_config
            pool = AgentPool(agent_id, pool_config, factory)
            self._pools[agent_id] = pool
            return pool

    def get_pool(self, agent_id: str) -> Optional[AgentPool]:
        """Get a pool by agent ID."""
        with self._lock:
            return self._pools.get(agent_id)

    def get_or_create_pool(
        self,
        agent_id: str,
        config: PoolConfig = None,
        factory: Callable = None
    ) -> AgentPool:
        """Get or create a pool."""
        with self._lock:
            if agent_id not in self._pools:
                return self.create_pool(agent_id, config, factory)
            return self._pools[agent_id]

    def close_pool(self, agent_id: str) -> bool:
        """Close a pool."""
        with self._lock:
            pool = self._pools.get(agent_id)
            if not pool:
                return False
            pool.close()
            del self._pools[agent_id]
            return True

    def get_all_pools(self) -> List[Dict]:
        """Get all pools."""
        with self._lock:
            return [
                {"agent_id": agent_id, "state": pool._state.value}
                for agent_id, pool in self._pools.items()
            ]

    def get_total_stats(self) -> Dict:
        """Get aggregated statistics."""
        with self._lock:
            total_connections = 0
            total_active = 0
            total_idle = 0

            for pool in self._pools.values():
                total_connections += len(pool._connections)
                total_active += len(pool._active_connections)
                total_idle += len(pool._idle_queue)

            return {
                "total_pools": len(self._pools),
                "total_connections": total_connections,
                "total_active": total_active,
                "total_idle": total_idle,
                "utilization": total_active / total_connections if total_connections > 0 else 0
            }

    def close_all(self):
        """Close all pools."""
        with self._lock:
            for pool in self._pools.values():
                pool.close()
            self._pools.clear()


# Global pool manager instance
agent_pool_manager = PoolManager()
