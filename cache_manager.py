"""
Unified Cache Manager for BridgeNode

Provides a simple, thread-safe caching mechanism with TTL support.
"""
import threading
import time
from typing import Any, Optional


class SimpleCache:
    """Thread-safe cache with TTL support."""

    def __init__(self, ttl: int = 60):
        """
        Initialize cache.

        Args:
            ttl: Time-to-live in seconds (default: 60)
        """
        self._cache = {"data": None, "timestamp": 0}
        self._lock = threading.Lock()
        self._ttl = ttl

    @property
    def ttl(self) -> int:
        return self._ttl

    @ttl.setter
    def ttl(self, value: int):
        self._ttl = value

    def get(self) -> Optional[Any]:
        """Get cached data if still valid."""
        with self._lock:
            now = time.time()
            if self._cache["data"] and (now - self._cache["timestamp"]) < self._ttl:
                return self._cache["data"]
            return None

    def set(self, data: Any) -> None:
        """Set cached data."""
        with self._lock:
            self._cache = {"data": data, "timestamp": time.time()}

    def invalidate(self) -> None:
        """Clear cached data."""
        with self._lock:
            self._cache = {"data": None, "timestamp": 0}

    def is_valid(self) -> bool:
        """Check if cache has valid data."""
        with self._lock:
            now = time.time()
            return self._cache["data"] is not None and (now - self._cache["timestamp"]) < self._ttl


# Pre-configured cache instances
status_cache = SimpleCache(ttl=10)      # 10 seconds - status changes frequently
rate_limit_cache = SimpleCache(ttl=60)  # 60 seconds - config rarely changes
context_list_cache = SimpleCache(ttl=30)  # 30 seconds - moderate TTL
