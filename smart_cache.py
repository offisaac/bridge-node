"""BridgeNode Smart Cache System

智能缓存系统 - 配置驱动的缓存管理
支持缓存预热、模式配置、智能TTL、失效策略
支持多级缓存 (Memory/Redis)
"""
import os
import time
import json
import threading
import hashlib
from typing import Any, Optional, Dict, List, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from collections import defaultdict


class CacheBackendType(str, Enum):
    """Cache backend types."""
    MEMORY = "memory"
    REDIS = "redis"


class CacheMode(str, Enum):
    """Cache operation modes."""
    LAZY = "lazy"           # 懒加载 - 首次访问时加载
    EAGER = "eager"         # 预加载 - 启动时加载
    ADAPTIVE = "adaptive"   # 自适应 - 根据访问模式自动调整


class InvalidationStrategy(str, Enum):
    """Cache invalidation strategies."""
    TTL = "ttl"             # 基于时间
    LRU = "lru"            # 基于最近使用
    ACCESS_COUNT = "access_count"  # 基于访问次数
    MANUAL = "manual"       # 手动失效
    PATTERN = "pattern"     # 基于模式


@dataclass
class CacheProfile:
    """缓存配置文件"""
    name: str
    key_prefix: str
    ttl: int = 3600                    # 默认TTL（秒）
    max_size: int = 1000                # 最大条目数
    mode: CacheMode = CacheMode.LAZY    # 加载模式
    invalidation: InvalidationStrategy = InvalidationStrategy.TTL
    backend: CacheBackendType = CacheBackendType.MEMORY  # 缓存后端
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    preload_keys: List[str] = field(default_factory=list)  # 预加载的key
    invalidation_patterns: List[str] = field(default_factory=list)  # 失效模式
    compute_fn: Optional[Callable] = None  # 计算函数（用于懒加载/预加载）


@dataclass
class CacheStats:
    """缓存统计信息"""
    hits: int = 0
    misses: int = 0
    evictions: int = 0
    invalidations: int = 0
    preload_count: int = 0

    @property
    def hit_rate(self) -> float:
        """命中率"""
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0

    def to_dict(self) -> dict:
        return {
            "hits": self.hits,
            "misses": self.misses,
            "evictions": self.evictions,
            "invalidations": self.invalidations,
            "preload_count": self.preload_count,
            "hit_rate": round(self.hit_rate * 100, 2)
        }


class SmartCache:
    """智能缓存系统"""

    def __init__(self, profile: CacheProfile):
        self.profile = profile
        self._cache: Dict[str, Any] = {}
        self._metadata: Dict[str, Dict] = {}  # key -> {created_at, accessed_at, access_count, ttl}
        self._lock = threading.RLock()
        self._stats = CacheStats()
        self._initialized = False
        self._redis_client = None

        # Initialize Redis if backend is Redis
        if profile.backend == CacheBackendType.REDIS:
            self._init_redis()

    def _init_redis(self):
        """Initialize Redis client."""
        try:
            import redis
            self._redis_client = redis.Redis(
                host=self.profile.redis_host,
                port=self.profile.redis_port,
                db=self.profile.redis_db,
                decode_responses=True
            )
            self._redis_client.ping()
            print(f"[SmartCache] Redis connected for {self.profile.name}")
        except ImportError:
            print(f"[SmartCache] Redis not available, falling back to memory for {self.profile.name}")
            self._redis_client = None
        except Exception as e:
            print(f"[SmartCache] Redis connection failed: {e}, falling back to memory")
            self._redis_client = None

    def _use_redis(self) -> bool:
        """Check if Redis backend is available."""
        return self._redis_client is not None

    def initialize(self):
        """初始化缓存（预加载模式）"""
        if self._initialized:
            return

        with self._lock:
            if self._initialized:
                return

            if self.profile.mode == CacheMode.EAGER and self.profile.preload_keys:
                for key in self.profile.preload_keys:
                    if self.profile.compute_fn:
                        value = self.profile.compute_fn(key)
                        self.set(key, value)

            self._initialized = True

    def _make_key(self, key: str) -> str:
        """生成带前缀的key"""
        return f"{self.profile.key_prefix}:{key}"

    def _get_meta(self, key: str) -> Optional[Dict]:
        """获取元数据"""
        return self._metadata.get(key)

    def _is_expired(self, key: str) -> bool:
        """检查是否过期"""
        if self.profile.invalidation == InvalidationStrategy.TTL:
            meta = self._get_meta(key)
            if not meta:
                return True
            age = time.time() - meta.get("created_at", 0)
            ttl = meta.get("ttl", self.profile.ttl)
            return age > ttl
        return False

    def get(self, key: str) -> Optional[Any]:
        """获取缓存值"""
        full_key = self._make_key(key)

        with self._lock:
            # 检查过期
            if self._is_expired(full_key):
                self._evict(full_key)
                self._stats.misses += 1
                return None

            if full_key not in self._cache:
                self._stats.misses += 1
                # 懒加载
                if self.profile.mode == CacheMode.LAZY and self.profile.compute_fn:
                    value = self.profile.compute_fn(key)
                    if value is not None:
                        self.set(key, value)
                        return value
                return None

            # 更新访问统计
            if full_key in self._metadata:
                self._metadata[full_key]["accessed_at"] = time.time()
                self._metadata[full_key]["access_count"] = self._metadata[full_key].get("access_count", 0) + 1

            self._stats.hits += 1
            return self._cache[full_key]

    def set(self, key: str, value: Any, ttl: Optional[int] = None):
        """设置缓存值"""
        full_key = self._make_key(key)

        with self._lock:
            # 检查容量
            if len(self._cache) >= self.profile.max_size and full_key not in self._cache:
                self._evict_lru()

            now = time.time()
            self._cache[full_key] = value
            self._metadata[full_key] = {
                "created_at": now,
                "accessed_at": now,
                "access_count": 1,
                "ttl": ttl or self.profile.ttl
            }

    def _evict(self, key: str):
        """驱逐条目"""
        if key in self._cache:
            del self._cache[key]
            del self._metadata[key]
            self._stats.evictions += 1

    def _evict_lru(self):
        """LRU驱逐"""
        if not self._metadata:
            return

        lru_key = min(self._metadata.items(), key=lambda x: x[1].get("accessed_at", 0))[0]
        self._evict(lru_key)

    def _evict_lfu(self):
        """LFU驱逐"""
        if not self._metadata:
            return

        lfu_key = min(self._metadata.items(), key=lambda x: x[1].get("access_count", 0))[0]
        self._evict(lfu_key)

    def delete(self, key: str) -> bool:
        """删除缓存"""
        full_key = self._make_key(key)

        with self._lock:
            if full_key in self._cache:
                self._evict(full_key)
                self._stats.invalidations += 1
                return True
            return False

    def invalidate_pattern(self, pattern: str):
        """按模式失效"""
        with self._lock:
            keys_to_delete = [k for k in self._cache.keys() if pattern in k]
            for key in keys_to_delete:
                self._evict(key)
                self._stats.invalidations += 1

    def clear(self):
        """清空缓存"""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            self._metadata.clear()
            self._stats.invalidations += count

    def get_stats(self) -> dict:
        """获取缓存统计"""
        with self._lock:
            return {
                **self._stats.to_dict(),
                "profile": {
                    "name": self.profile.name,
                    "mode": self.profile.mode.value,
                    "invalidation": self.profile.invalidation.value,
                    "ttl": self.profile.ttl,
                    "max_size": self.profile.max_size
                },
                "current_size": len(self._cache),
                "keys": list(self._cache.keys())[:20]  # 前20个key
            }

    def get_all_keys(self) -> List[str]:
        """获取所有key"""
        with self._lock:
            return list(self._cache.keys())

    def warmup(self, keys: List[str] = None):
        """预热缓存"""
        keys = keys or self.profile.preload_keys

        with self._lock:
            if self.profile.compute_fn:
                for key in keys:
                    if self._make_key(key) not in self._cache:
                        value = self.profile.compute_fn(key)
                        if value is not None:
                            self.set(key, value)
                            self._stats.preload_count += 1


class SmartCacheManager:
    """智能缓存管理器"""

    def __init__(self):
        self._caches: Dict[str, SmartCache] = {}
        self._lock = threading.RLock()

    def create_cache(self, profile: CacheProfile) -> SmartCache:
        """创建缓存实例"""
        with self._lock:
            if profile.name in self._caches:
                return self._caches[profile.name]

            cache = SmartCache(profile)
            self._caches[profile.name] = cache

            if profile.mode == CacheMode.EAGER:
                cache.initialize()

            return cache

    def get_cache(self, name: str) -> Optional[SmartCache]:
        """获取缓存实例"""
        return self._caches.get(name)

    def delete_cache(self, name: str) -> bool:
        """删除缓存实例"""
        with self._lock:
            if name in self._caches:
                del self._caches[name]
                return True
            return False

    def get_all_stats(self) -> dict:
        """获取所有缓存统计"""
        stats = {}
        for name, cache in self._caches.items():
            stats[name] = cache.get_stats()
        return stats

    def clear_all(self):
        """清空所有缓存"""
        for cache in self._caches.values():
            cache.clear()


# 全局智能缓存管理器
smart_cache_manager = SmartCacheManager()


# ============================================================
# 预定义缓存配置
# ============================================================

def create_context_cache(compute_fn: Callable = None) -> SmartCache:
    """创建上下文缓存"""
    profile = CacheProfile(
        name="context",
        key_prefix="ctx",
        ttl=1800,  # 30分钟
        max_size=500,
        mode=CacheMode.LAZY,
        invalidation=InvalidationStrategy.TTL,
        compute_fn=compute_fn
    )
    return smart_cache_manager.create_cache(profile)


def create_session_cache(compute_fn: Callable = None) -> SmartCache:
    """创建会话缓存"""
    profile = CacheProfile(
        name="session",
        key_prefix="sess",
        ttl=3600,  # 1小时
        max_size=1000,
        mode=CacheMode.LAZY,
        invalidation=InvalidationStrategy.TTL,
        compute_fn=compute_fn
    )
    return smart_cache_manager.create_cache(profile)


def create_api_cache(compute_fn: Callable = None) -> SmartCache:
    """创建API缓存"""
    profile = CacheProfile(
        name="api",
        key_prefix="api",
        ttl=300,  # 5分钟
        max_size=2000,
        mode=CacheMode.LAZY,
        invalidation=InvalidationStrategy.TTL,
        compute_fn=compute_fn
    )
    return smart_cache_manager.create_cache(profile)


def create_user_cache(compute_fn: Callable = None) -> SmartCache:
    """创建用户数据缓存"""
    profile = CacheProfile(
        name="user",
        key_prefix="user",
        ttl=600,  # 10分钟
        max_size=500,
        mode=CacheMode.LAZY,
        invalidation=InvalidationStrategy.TTL,
        compute_fn=compute_fn
    )
    return smart_cache_manager.create_cache(profile)
