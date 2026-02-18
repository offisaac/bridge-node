"""Bulkhead Pattern Module

Thread pool isolation for resource protection.
"""
import time
import threading
import uuid
import queue
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class BulkheadState(str, Enum):
    """Bulkhead states."""
    NORMAL = "normal"
    DEGRADED = "degraded"
    ISOLATED = "isolated"


@dataclass
class ThreadPool:
    """Thread pool configuration."""
    name: str
    max_size: int
    current_size: int = 0
    queue_size: int = 0
    active_tasks: int = 0
    completed_tasks: int = 0
    rejected_tasks: int = 0


class BulkheadPattern:
    """Thread pool isolation pattern."""

    def __init__(self):
        self._lock = threading.RLock()
        self._pools: Dict[str, ThreadPool] = {}
        self._queues: Dict[str, queue.Queue] = {}

    def create_pool(self, name: str, max_size: int, queue_size: int = 100) -> str:
        """Create a thread pool."""
        with self._lock:
            pool = ThreadPool(name=name, max_size=max_size)
            self._pools[name] = pool
            self._queues[name] = queue.Queue(maxsize=queue_size)
        return name

    def execute(self, pool_name: str, func: Callable, *args, **kwargs) -> Any:
        """Execute function in pool."""
        with self._lock:
            pool = self._pools.get(pool_name)
            queue = self._queues.get(pool_name)
            if not pool or not queue:
                raise ValueError(f"Pool {pool_name} not found")

        # Check if we can execute
        if pool.active_tasks >= pool.max_size:
            if queue.full():
                pool.rejected_tasks += 1
                raise Exception(f"Pool {pool_name} is at capacity")
            pool.queue_size += 1

        try:
            pool.active_tasks += 1
            result = func(*args, **kwargs)
            pool.completed_tasks += 1
            return result
        finally:
            pool.active_tasks -= 1
            if pool.queue_size > 0:
                pool.queue_size -= 1

    def get_pool(self, name: str) -> Optional[Dict]:
        """Get pool status."""
        with self._lock:
            pool = self._pools.get(name)
            if not pool:
                return None
            return {
                "name": pool.name,
                "max_size": pool.max_size,
                "current_size": pool.current_size,
                "active_tasks": pool.active_tasks,
                "completed_tasks": pool.completed_tasks,
                "rejected_tasks": pool.rejected_tasks,
                "utilization": pool.active_tasks / max(1, pool.max_size)
            }

    def get_stats(self) -> Dict:
        """Get all pool stats."""
        with self._lock:
            return {
                "total_pools": len(self._pools),
                "pools": {name: self.get_pool(name) for name in self._pools}
            }


# Global bulkhead pattern
bulkhead_pattern = BulkheadPattern()
