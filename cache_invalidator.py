"""Cache Invalidator Module

Intelligent cache invalidation strategies with TTL, patterns, and dependency tracking.
"""
import time
import threading
import uuid
import hashlib
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class InvalidationStrategy(str, Enum):
    """Invalidation strategies."""
    TTL = "ttl"
    LRU = "lru"
    LFU = "lfu"
    FIFO = "fifo"
    PATTERN = "pattern"
    DEPENDENCY = "dependency"
    MANUAL = "manual"


@dataclass
class CacheEntry:
    """Cache entry with metadata."""
    key: str
    value: Any
    created_at: float
    accessed_at: float
    access_count: int = 0
    ttl: int = 0  # 0 = no expiration
    tags: List[str] = field(default_factory=list)
    dependencies: List[str] = field(default_factory=list)


@dataclass
class InvalidationRule:
    """Cache invalidation rule."""
    id: str
    pattern: str  # Key pattern to match
    strategy: InvalidationStrategy
    ttl: int = 0
    max_entries: int = 0
    tags: List[str] = field(default_factory=list)


@dataclass
class InvalidationEvent:
    """Cache invalidation event."""
    id: str
    keys: List[str]
    reason: str
    timestamp: float
    strategy: str


class CacheInvalidator:
    """Intelligent cache invalidation manager."""

    def __init__(self):
        self._lock = threading.RLock()
        self._cache: Dict[str, CacheEntry] = {}
        self._rules: Dict[str, InvalidationRule] = {}
        self._events: List[InvalidationEvent] = []
        self._max_events = 1000

    def set(self, key: str, value: Any, ttl: int = 0, tags: List[str] = None, dependencies: List[str] = None) -> str:
        """Set a cache entry."""
        now = time.time()

        entry = CacheEntry(
            key=key,
            value=value,
            created_at=now,
            accessed_at=now,
            access_count=0,
            ttl=ttl,
            tags=tags or [],
            dependencies=dependencies or []
        )

        with self._lock:
            self._cache[key] = entry

        return key

    def get(self, key: str) -> Optional[Any]:
        """Get a cache entry."""
        with self._lock:
            entry = self._cache.get(key)
            if not entry:
                return None

            # Check TTL
            if entry.ttl > 0:
                if time.time() - entry.created_at > entry.ttl:
                    del self._cache[key]
                    return None

            # Update access stats
            entry.accessed_at = time.time()
            entry.access_count += 1

            return entry.value

    def delete(self, key: str) -> bool:
        """Delete a cache entry."""
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                return True
        return False

    def invalidate_by_pattern(self, pattern: str) -> int:
        """Invalidate all keys matching a pattern."""
        import re

        with self._lock:
            keys_to_delete = []

            for key in self._cache:
                # Convert glob pattern to regex
                regex_pattern = pattern.replace('.', r'\.').replace('*', '.*').replace('?', '.')
                if re.match(regex_pattern, key):
                    keys_to_delete.append(key)

            for key in keys_to_delete:
                del self._cache[key]

            # Log event
            if keys_to_delete:
                self._events.append(InvalidationEvent(
                    id=str(uuid.uuid4())[:12],
                    keys=keys_to_delete,
                    reason=f"Pattern: {pattern}",
                    timestamp=time.time(),
                    strategy=InvalidationStrategy.PATTERN.value
                ))

            return len(keys_to_delete)

    def invalidate_by_tags(self, tags: List[str]) -> int:
        """Invalidate all entries with matching tags."""
        with self._lock:
            keys_to_delete = []

            for key, entry in self._cache.items():
                if any(tag in entry.tags for tag in tags):
                    keys_to_delete.append(key)

            for key in keys_to_delete:
                del self._cache[key]

            if keys_to_delete:
                self._events.append(InvalidationEvent(
                    id=str(uuid.uuid4())[:12],
                    keys=keys_to_delete,
                    reason=f"Tags: {tags}",
                    timestamp=time.time(),
                    strategy=InvalidationStrategy.MANUAL.value
                ))

            return len(keys_to_delete)

    def invalidate_by_dependency(self, dependency: str) -> int:
        """Invalidate entries that depend on a key."""
        with self._lock:
            keys_to_delete = []

            for key, entry in self._cache.items():
                if dependency in entry.dependencies:
                    keys_to_delete.append(key)

            for key in keys_to_delete:
                del self._cache[key]

            if keys_to_delete:
                self._events.append(InvalidationEvent(
                    id=str(uuid.uuid4())[:12],
                    keys=keys_to_delete,
                    reason=f"Dependency: {dependency}",
                    timestamp=time.time(),
                    strategy=InvalidationStrategy.DEPENDENCY.value
                ))

            return len(keys_to_delete)

    def cleanup_expired(self) -> int:
        """Remove all expired entries."""
        now = time.time()
        keys_to_delete = []

        with self._lock:
            for key, entry in self._cache.items():
                if entry.ttl > 0 and now - entry.created_at > entry.ttl:
                    keys_to_delete.append(key)

            for key in keys_to_delete:
                del self._cache[key]

        if keys_to_delete:
            self._events.append(InvalidationEvent(
                id=str(uuid.uuid4())[:12],
                keys=keys_to_delete,
                reason="TTL expired",
                timestamp=now,
                strategy=InvalidationStrategy.TTL.value
            ))

        return len(keys_to_delete)

    def evict_lru(self, count: int = 1) -> int:
        """Evict least recently used entries."""
        with self._lock:
            if not self._cache:
                return 0

            # Sort by accessed_at
            sorted_entries = sorted(
                self._cache.items(),
                key=lambda x: x[1].accessed_at
            )

            evicted = 0
            for key, _ in sorted_entries[:count]:
                del self._cache[key]
                evicted += 1

            return evicted

    def create_rule(
        self,
        pattern: str,
        strategy: InvalidationStrategy,
        ttl: int = 0,
        max_entries: int = 0,
        tags: List[str] = None
    ) -> str:
        """Create an invalidation rule."""
        rule_id = str(uuid.uuid4())[:12]

        rule = InvalidationRule(
            id=rule_id,
            pattern=pattern,
            strategy=strategy,
            ttl=ttl,
            max_entries=max_entries,
            tags=tags or []
        )

        with self._lock:
            self._rules[rule_id] = rule

        return rule_id

    def delete_rule(self, rule_id: str) -> bool:
        """Delete an invalidation rule."""
        with self._lock:
            if rule_id in self._rules:
                del self._rules[rule_id]
                return True
        return False

    def get_stats(self) -> Dict:
        """Get cache statistics."""
        with self._lock:
            total_entries = len(self._cache)
            total_size = sum(len(str(e.value)) for e in self._cache.values())

            now = time.time()
            expired = sum(1 for e in self._cache.values() if e.ttl > 0 and now - e.created_at > e.ttl)

            return {
                "total_entries": total_entries,
                "total_size_bytes": total_size,
                "expired_entries": expired,
                "active_rules": len(self._rules),
                "total_events": len(self._events)
            }

    def get_events(self, limit: int = 100) -> List[Dict]:
        """Get invalidation events."""
        with self._lock:
            events = sorted(self._events, key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "id": e.id,
                "keys": e.keys,
                "count": len(e.keys),
                "reason": e.reason,
                "timestamp": e.timestamp,
                "strategy": e.strategy
            }
            for e in events[:limit]
        ]


# Global cache invalidator
cache_invalidator = CacheInvalidator()
