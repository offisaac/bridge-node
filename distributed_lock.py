#!/usr/bin/env python3
"""
Distributed Lock Service - 分布式锁服务
基于 Redis 实现，支持多进程协同

功能:
- 互斥锁
- 可重入锁
- 公平锁 (FIFO 队列)
- 自动续期 (Watch Dog)
- 锁超时
- 分布式信号量
"""

import time
import uuid
import threading
import asyncio
from contextlib import contextmanager
from datetime import datetime, timedelta
from typing import Optional, List, Callable
from dataclasses import dataclass
import redis
import json


@dataclass
class LockConfig:
    """锁配置"""
    name: str
    timeout: int = 30          # 锁超时时间(秒)
    retry_times: int = 3       # 重试次数
    retry_delay: float = 0.2   # 重试延迟(秒)
    blocking: bool = False     # 是否阻塞等待
    blocking_timeout: float = None  # 阻塞超时


class LockAcquisitionError(Exception):
    """锁获取失败异常"""
    pass


class DistributedLock:
    """分布式锁"""

    def __init__(self, redis_client: redis.Redis, key: str, config: LockConfig = None):
        self.redis = redis_client
        self.key = f"lock:{key}"
        self.config = config or LockConfig(name=key)
        self.token = str(uuid.uuid4())
        self._local_lock = threading.Lock()

    def acquire(self) -> bool:
        """获取锁"""
        config = self.config
        retry_count = 0

        while True:
            # 尝试获取锁
            acquired = self._try_acquire()

            if acquired:
                return True

            retry_count += 1

            if not config.blocking:
                # 非阻塞模式
                if retry_count >= config.retry_times:
                    return False
            else:
                # 阻塞模式
                if config.blocking_timeout:
                    elapsed = retry_count * config.retry_delay
                    if elapsed >= config.blocking_timeout:
                        return False

            # 等待后重试
            time.sleep(config.retry_delay)

        return False

    def _try_acquire(self) -> bool:
        """尝试获取锁"""
        # 使用 SET NX EX 原子操作
        result = self.redis.set(
            self.key,
            self.token,
            nx=True,
            ex=self.config.timeout
        )

        if result:
            # 启动 Watch Dog 续期线程
            self._start_watch_dog()

        return bool(result)

    def _start_watch_dog(self):
        """启动看门狗线程自动续期"""
        def watchdog():
            while self.is_locked():
                # 检查锁是否快过期
                ttl = self.redis.ttl(self.key)
                if ttl > 0 and ttl < self.config.timeout // 2:
                    # 续期
                    self.redis.expire(self.key, self.config.timeout)
                time.sleep(self.config.timeout // 4)

        self._watchdog_thread = threading.Thread(target=watchdog, daemon=True)
        self._watchdog_thread.start()

    def release(self) -> bool:
        """释放锁"""
        if not self.is_locked():
            return False

        # 使用 Lua 脚本确保原子性
        lua_script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """

        try:
            result = self.redis.eval(lua_script, 1, self.key, self.token)
            return bool(result)
        except Exception:
            pass
            return False

    def is_locked(self) -> bool:
        """检查锁是否被持有"""
        return bool(self.redis.exists(self.key))

    def extend(self, timeout: int = None) -> bool:
        """延长锁的过期时间"""
        if not self.is_locked():
            return False

        timeout = timeout or self.config.timeout

        lua_script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("expire", KEYS[1], ARGV[2])
        else
            return 0
        end
        """

        result = self.redis.eval(lua_script, 1, self.key, self.token, timeout)
        return bool(result)

    def __enter__(self):
        """上下文管理器入口"""
        if not self.acquire():
            raise LockAcquisitionError(f"Failed to acquire lock: {self.key}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器出口"""
        self.release()
        return False


class ReentrantLock:
    """可重入分布式锁"""

    def __init__(self, redis_client: redis.Redis, key: str, config: LockConfig = None):
        self.redis = redis_client
        self.key = f"rlock:{key}"
        self.config = config or LockConfig(name=key)
        self.token = str(uuid.uuid4())
        self._thread_local = threading.local()

    def acquire(self) -> bool:
        # 检查本地线程是否已持有锁
        if getattr(self._thread_local, 'locked', False):
            # 重入，增加计数
            self._thread_local.count = getattr(self._thread_local, 'count', 0) + 1
            return True

        # 尝试获取锁
        lock = DistributedLock(self.redis, self.key, self.config)
        if lock.acquire():
            self._thread_local.locked = True
            self._thread_local.count = 1
            self._thread_local.token = lock.token
            return True

        return False

    def release(self) -> bool:
        if not getattr(self._thread_local, 'locked', False):
            return True

        self._thread_local.count -= 1

        if self._thread_local.count > 0:
            # 还有重入计数，不释放锁
            return True

        # 最终释放
        lock = DistributedLock(
            self.redis,
            self.key,
            self.config
        )
        lock.token = self._thread_local.token
        result = lock.release()

        self._thread_local.locked = False
        self._thread_local.count = 0

        return result

    def is_locked(self) -> bool:
        return getattr(self._thread_local, 'locked', False)

    def __enter__(self):
        if not self.acquire():
            raise LockAcquisitionError(f"Failed to acquire reentrant lock: {self.key}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
        return False


class FairLock:
    """公平锁 - FIFO 队列"""

    def __init__(self, redis_client: redis.Redis, key: str, config: LockConfig = None):
        self.redis = redis_client
        self.key = f"fairlock:{key}"
        self.config = config or LockConfig(name=key)
        self.token = str(uuid.uuid4())
        self.queue_key = f"{self.key}:queue"
        self.lock_key = f"{self.key}:lock"

    def acquire(self) -> bool:
        # 加入等待队列
        queue_position = self.redis.rpush(self.queue_key, self.token)

        try:
            # 等待直到成为队首
            while True:
                # 检查是否是队首
                first = self.redis.lindex(self.queue_key, 0)

                if first.decode() if isinstance(first, bytes) else first != self.token:
                    if not self.config.blocking:
                        return False
                    time.sleep(self.config.retry_delay)
                    continue

                # 尝试获取锁
                result = self.redis.set(
                    self.lock_key,
                    self.token,
                    nx=True,
                    ex=self.config.timeout
                )

                if result:
                    # 成功获取锁，从队列中移除
                    self.redis.lpop(self.queue_key)
                    return True

                if not self.config.blocking:
                    return False

                time.sleep(self.config.retry_delay)

        except Exception as e:
            # 清理队列
            self._remove_from_queue()
            raise

    def _remove_from_queue(self):
        """从队列中移除"""
        self.redis.lrem(self.queue_key, 1, self.token)

    def release(self) -> bool:
        lua_script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """

        result = self.redis.eval(lua_script, 1, self.lock_key, self.token)
        return bool(result)

    def is_locked(self) -> bool:
        return bool(self.redis.exists(self.lock_key))

    def __enter__(self):
        if not self.acquire():
            raise LockAcquisitionError(f"Failed to acquire fair lock: {self.key}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
        return False


class Semaphore:
    """分布式信号量"""

    def __init__(self, redis_client: redis.Redis, key: str, limit: int):
        self.redis = redis_client
        self.key = f"semaphore:{key}"
        self.limit = limit
        self.token = str(uuid.uuid4())

    def acquire(self, timeout: float = None) -> bool:
        start_time = time.time()

        while True:
            # 获取当前信号量计数
            count = self.redis.scard(self.key)

            if count < self.limit:
                # 还有名额，直接获取
                if self.redis.sadd(self.key, self.token):
                    return True

            # 检查超时
            if timeout and (time.time() - start_time) >= timeout:
                return False

            time.sleep(0.1)

    def release(self) -> bool:
        """释放信号量"""
        return bool(self.redis.srem(self.key, self.token))

    def available(self) -> int:
        """可用信号量数量"""
        return max(0, self.limit - self.redis.scard(self.key))

    def __enter__(self):
        if not self.acquire():
            raise LockAcquisitionError(f"Failed to acquire semaphore: {self.key}")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
        return False


class LockManager:
    """锁管理器 - 统一管理所有锁"""

    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self._locks = {}

    def lock(self, key: str, config: LockConfig = None) -> DistributedLock:
        """获取互斥锁"""
        config = config or LockConfig(name=key)
        lock = DistributedLock(self.redis, key, config)
        return lock

    def reentrant_lock(self, key: str, config: LockConfig = None) -> ReentrantLock:
        """获取可重入锁"""
        config = config or LockConfig(name=key)
        return ReentrantLock(self.redis, key, config)

    def fair_lock(self, key: str, config: LockConfig = None) -> FairLock:
        """获取公平锁"""
        config = config or LockConfig(name=key)
        return FairLock(self.redis, key, config)

    def semaphore(self, key: str, limit: int) -> Semaphore:
        """获取信号量"""
        return Semaphore(self.redis, key, limit)

    @contextmanager
    def scoped_lock(self, key: str, timeout: int = 30):
        """作用域锁 - 自动获取和释放"""
        lock = self.lock(key, LockConfig(name=key, timeout=timeout))
        try:
            lock.acquire()
            yield lock
        finally:
            lock.release()

    def get_lock_info(self, key: str) -> dict:
        """获取锁信息"""
        lock_key = f"lock:{key}"

        if not self.redis.exists(lock_key):
            return {"exists": False}

        ttl = self.redis.ttl(lock_key)
        value = self.redis.get(lock_key)

        return {
            "exists": True,
            "token": value.decode() if value else None,
            "ttl": ttl,
            "expires_at": (datetime.now() + timedelta(seconds=ttl)).isoformat() if ttl > 0 else None
        }

    def list_locks(self, pattern: str = "lock:*") -> List[dict]:
        """列出所有锁"""
        locks = []

        for key in self.redis.scan_iter(match=pattern):
            key_str = key.decode() if isinstance(key, bytes) else key
            ttl = self.redis.ttl(key)
            value = self.redis.get(key)

            locks.append({
                "key": key_str,
                "token": value.decode() if value else None,
                "ttl": ttl,
            })

        return locks


# ========== Async Support ==========

class AsyncDistributedLock:
    """异步分布式锁"""

    def __init__(self, redis_client, key: str, config: LockConfig = None):
        self.redis = redis_client
        self.key = f"lock:{key}"
        self.config = config or LockConfig(name=key)
        self.token = str(uuid.uuid4())

    async def acquire(self) -> bool:
        result = await self.redis.set(
            self.key,
            self.token,
            nx=True,
            ex=self.config.timeout
        )
        return bool(result)

    async def release(self) -> bool:
        lua_script = """
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
        """

        result = await self.redis.eval(lua_script, 1, self.key, self.token)
        return bool(result)

    async def __aenter__(self):
        if not await self.acquire():
            raise LockAcquisitionError(f"Failed to acquire lock: {self.key}")
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.release()
        return False


# ========== Factory ==========

def create_lock_manager(redis_url: str = "redis://localhost:6379", **kwargs) -> LockManager:
    """创建锁管理器"""
    client = redis.from_url(redis_url, **kwargs)
    return LockManager(client)


# ========== CLI ==========

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Distributed Lock CLI")
    parser.add_argument("--redis", default="redis://localhost:6379", help="Redis URL")
    parser.add_argument("command", choices=["lock", "unlock", "list", "info"])
    parser.add_argument("key", nargs="?", help="Lock key")

    args = parser.parse_args()

    manager = create_lock_manager(args.redis)

    if args.command == "lock":
        with manager.scoped_lock(args.key):
            print(f"Lock acquired: {args.key}")
            input("Press Enter to release...")

    elif args.command == "unlock":
        lock = manager.lock(args.key)
        if lock.release():
            print(f"Lock released: {args.key}")
        else:
            print(f"Failed to release lock: {args.key}")

    elif args.command == "list":
        locks = manager.list_locks()
        for lock in locks:
            print(f"{lock['key']}: ttl={lock['ttl']}")

    elif args.command == "info":
        info = manager.get_lock_info(args.key)
        print(info)
