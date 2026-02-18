"""Agent Cache Module

Agent result caching system with TTL, invalidation, and statistics.
"""
import time
import threading
import uuid
import hashlib
import json
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from collections import defaultdict


class CacheType(str, Enum):
    """Cache types."""
    MEMORY = "memory"
    PERSISTENT = "persistent"
    DISTRIBUTED = "distributed"


class CacheStrategy(str, Enum):
    """Cache strategies."""
    LRU = "lru"
    LFU = "lfu"
    FIFO = "fifo"
    TTL = "ttl"


@dataclass
class CacheConfig:
    """Cache configuration."""
    cache_type: CacheType
    max_size: int = 10000
    default_ttl: int = 3600
    strategy: CacheStrategy = CacheStrategy.LRU
    eviction_threshold: float = 0.9
    enable_stats: bool = True


@dataclass
class CacheEntry:
    """Cache entry."""
    key: str
    value: Any
    agent_id: str
    created_at: float
    expires_at: float
    access_count: int = 0
    last_accessed: float = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CacheStats:
    """Cache statistics."""
    hits: int = 0
    misses: int = 0
    evictions: int = 0
    expirations: int = 0
    invalidations: int = 0
    total_size_bytes: int = 0


class AgentCache:
    """Manage agent result caching."""

    def __init__(self):
        self._lock = threading.RLock()
        self._cache: Dict[str, CacheEntry] = {}
        self._agent_cache: Dict[str, List[str]] = defaultdict(list)
        self._config = CacheConfig(CacheType.MEMORY)
        self._stats = CacheStats()
        self._access_order: List[str] = []
        self._hit_counts: Dict[str, int] = defaultdict(int)

    def configure(self, cache_type: str = "memory", max_size: int = 10000, default_ttl: int = 3600, strategy: str = "lru"):
        """Configure cache."""
        with self._lock:
            self._config = CacheConfig(
                cache_type=CacheType(cache_type),
                max_size=max_size,
                default_ttl=default_ttl,
                strategy=CacheStrategy(strategy)
            )

    def _generate_key(self, agent_id: str, key: str) -> str:
        """Generate cache key."""
        combined = f"{agent_id}:{key}"
        return hashlib.sha256(combined.encode()).hexdigest()[:32]

    def _evict(self):
        """Evict entries based on strategy."""
        if len(self._cache) < self._config.max_size:
            return

        current_time = time.time()
        to_evict = []

        if self._config.strategy == CacheStrategy.LRU:
            # Evict least recently used
            for key, entry in self._cache.items():
                if entry.last_accessed == 0:
                    entry.last_accessed = entry.created_at
            to_evict = sorted(self._cache.keys(), key=lambda k: self._cache[k].last_accessed)[:int(self._config.max_size * 0.1)]
        elif self._config.strategy == CacheStrategy.LFU:
            # Evict least frequently used
            to_evict = sorted(self._cache.keys(), key=lambda k: self._hit_counts.get(k, 0))[:int(self._config.max_size * 0.1)]
        elif self._config.strategy == CacheStrategy.FIFO:
            # Evict oldest
            to_evict = sorted(self._cache.keys(), key=lambda k: self._cache[k].created_at)[:int(self._config.max_size * 0.1)]
        elif self._config.strategy == CacheStrategy.TTL:
            # Evict expired first
            for key, entry in self._cache.items():
                if entry.expires_at <= current_time:
                    to_evict.append(key)
            if not to_evict:
                to_evict = sorted(self._cache.keys(), key=lambda k: self._cache[k].created_at)[:int(self._config.max_size * 0.1)]

        for key in to_evict:
            if key in self._cache:
                entry = self._cache[key]
                del self._cache[key]
                if key in self._agent_cache[entry.agent_id]:
                    self._agent_cache[entry.agent_id].remove(key)
                self._stats.evictions += 1

    def _check_expiration(self):
        """Remove expired entries."""
        current_time = time.time()
        expired = [key for key, entry in self._cache.items() if entry.expires_at <= current_time]
        for key in expired:
            if key in self._cache:
                entry = self._cache[key]
                del self._cache[key]
                if key in self._agent_cache[entry.agent_id]:
                    self._agent_cache[entry.agent_id].remove(key)
                self._stats.expirations += 1

    def set(
        self,
        agent_id: str,
        key: str,
        value: Any,
        ttl: int = None,
        metadata: Dict[str, Any] = None
    ) -> str:
        """Set cache entry."""
        with self._lock:
            self._check_expiration()

            cache_key = self._generate_key(agent_id, key)
            ttl = ttl or self._config.default_ttl
            current_time = time.time()

            entry = CacheEntry(
                key=cache_key,
                value=value,
                agent_id=agent_id,
                created_at=current_time,
                expires_at=current_time + ttl,
                metadata=metadata or {}
            )

            # Remove old key if exists
            if cache_key in self._cache:
                old_entry = self._cache[cache_key]
                if cache_key in self._agent_cache[old_entry.agent_id]:
                    self._agent_cache[old_entry.agent_id].remove(cache_key)

            self._cache[cache_key] = entry
            self._agent_cache[agent_id].append(cache_key)

            # Evict if needed
            self._evict()

            return cache_key

    def get(self, agent_id: str, key: str) -> Optional[Any]:
        """Get cache entry."""
        with self._lock:
            self._check_expiration()

            cache_key = self._generate_key(agent_id, key)
            entry = self._cache.get(cache_key)

            if not entry:
                self._stats.misses += 1
                return None

            if entry.expires_at <= time.time():
                del self._cache[cache_key]
                if cache_key in self._agent_cache[agent_id]:
                    self._agent_cache[agent_id].remove(cache_key)
                self._stats.expirations += 1
                self._stats.misses += 1
                return None

            entry.access_count += 1
            entry.last_accessed = time.time()
            self._hit_counts[cache_key] = entry.access_count
            self._stats.hits += 1
            return entry.value

    def delete(self, agent_id: str, key: str) -> bool:
        """Delete cache entry."""
        with self._lock:
            cache_key = self._generate_key(agent_id, key)
            if cache_key in self._cache:
                del self._cache[cache_key]
                if cache_key in self._agent_cache[agent_id]:
                    self._agent_cache[agent_id].remove(cache_key)
                if cache_key in self._hit_counts:
                    del self._hit_counts[cache_key]
                self._stats.invalidations += 1
                return True
            return False

    def clear_agent(self, agent_id: str) -> int:
        """Clear all cache for an agent."""
        with self._lock:
            keys = list(self._agent_cache.get(agent_id, []))
            count = 0
            for key in keys:
                if key in self._cache:
                    del self._cache[key]
                    count += 1
            self._agent_cache[agent_id] = []
            for key in keys:
                if key in self._hit_counts:
                    del self._hit_counts[key]
            self._stats.invalidations += count
            return count

    def clear_all(self) -> int:
        """Clear all cache."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            self._agent_cache.clear()
            self._hit_counts.clear()
            return count

    def invalidate_pattern(self, agent_id: str, pattern: str) -> int:
        """Invalidate entries matching pattern."""
        with self._lock:
            keys = list(self._agent_cache.get(agent_id, []))
            count = 0
            for key in keys:
                entry = self._cache.get(key)
                if entry and pattern in entry.value:
                    del self._cache[key]
                    self._agent_cache[agent_id].remove(key)
                    if key in self._hit_counts:
                        del self._hit_counts[key]
                    count += 1
            self._stats.invalidations += count
            return count

    def exists(self, agent_id: str, key: str) -> bool:
        """Check if key exists."""
        with self._lock:
            cache_key = self._generate_key(agent_id, key)
            entry = self._cache.get(cache_key)
            if not entry:
                return False
            if entry.expires_at <= time.time():
                del self._cache[cache_key]
                if cache_key in self._agent_cache[agent_id]:
                    self._agent_cache[agent_id].remove(cache_key)
                return False
            return True

    def get_metadata(self, agent_id: str, key: str) -> Optional[Dict]:
        """Get cache entry metadata."""
        with self._lock:
            cache_key = self._generate_key(agent_id, key)
            entry = self._cache.get(cache_key)
            if not entry:
                return None
            return {
                "key": key,
                "agent_id": entry.agent_id,
                "created_at": entry.created_at,
                "expires_at": entry.expires_at,
                "ttl_remaining": max(0, entry.expires_at - time.time()),
                "access_count": entry.access_count,
                "last_accessed": entry.last_accessed,
                "metadata": entry.metadata
            }

    def get_agent_entries(self, agent_id: str, limit: int = 100) -> List[Dict]:
        """Get all cache entries for an agent."""
        with self._lock:
            keys = self._agent_cache.get(agent_id, [])[:limit]
            entries = []
            for key in keys:
                entry = self._cache.get(key)
                if entry:
                    entries.append({
                        "key": entry.key,
                        "created_at": entry.created_at,
                        "expires_at": entry.expires_at,
                        "ttl_remaining": max(0, entry.expires_at - time.time()),
                        "access_count": entry.access_count
                    })
            return entries

    def get_statistics(self) -> Dict:
        """Get cache statistics."""
        with self._lock:
            total_requests = self._stats.hits + self._stats.misses
            hit_rate = (self._stats.hits / total_requests * 100) if total_requests > 0 else 0

            total_size = sum(len(json.dumps(entry.value).encode()) for entry in self._cache.values())

            by_agent = {}
            for agent_id, keys in self._agent_cache.items():
                by_agent[agent_id] = len(keys)

            return {
                "total_entries": len(self._cache),
                "total_agents": len(self._agent_cache),
                "hits": self._stats.hits,
                "misses": self._stats.misses,
                "hit_rate_percent": round(hit_rate, 2),
                "evictions": self._stats.evictions,
                "expirations": self._stats.expirations,
                "invalidations": self._stats.invalidations,
                "total_size_bytes": total_size,
                "max_size": self._config.max_size,
                "usage_percent": round(len(self._cache) / self._config.max_size * 100, 2) if self._config.max_size > 0 else 0,
                "entries_by_agent": by_agent,
                "config": {
                    "cache_type": self._config.cache_type.value,
                    "strategy": self._config.strategy.value,
                    "default_ttl": self._config.default_ttl
                }
            }


# Global agent cache instance
agent_cache = AgentCache()
