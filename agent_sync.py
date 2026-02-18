"""Agent Sync Module

Agent synchronous operations including locks, barriers, semaphores,
events, read-write locks, and condition variables.
"""
import time
import threading
import uuid
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from collections import defaultdict
from contextlib import contextmanager


class SyncType(str, Enum):
    """Synchronization types."""
    LOCK = "lock"
    RW_LOCK = "rw_lock"
    SEMAPHORE = "semaphore"
    BARRIER = "barrier"
    EVENT = "event"
    CONDITION = "condition"
    ONCE = "once"


class LockType(str, Enum):
    """Lock types."""
    REENTRANT = "reentrant"
    NON_REENTRANT = "non_reentrant"
    FAIR = "fair"


class SyncState(str, Enum):
    """Sync object states."""
    INITIAL = "initial"
    LOCKED = "locked"
    UNLOCKED = "unlocked"
    WAITING = "waiting"
    SIGNALED = "signaled"
    TIMEDOUT = "timeout"
    BROADCAST = "broadcast"


@dataclass
class LockConfig:
    """Lock configuration."""
    lock_type: LockType = LockType.REENTRANT
    timeout: float = 30.0
    auto_release: bool = False


@dataclass
class SemaphoreConfig:
    """Semaphore configuration."""
    initial_count: int = 1
    max_count: int = 1
    timeout: float = 30.0


@dataclass
class BarrierConfig:
    """Barrier configuration."""
    parties: int
    timeout: float = 300.0


@dataclass
class RWLockConfig:
    """Read-Write lock configuration."""
    prefer_writer: bool = True
    writer_timeout: float = 30.0
    max_readers: int = 100


@dataclass
class SyncWaiter:
    """Waiter information."""
    id: str
    thread_id: int
    started_at: float
    timeout_at: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SyncStats:
    """Synchronization statistics."""
    total_acquires: int = 0
    total_releases: int = 0
    total_waits: int = 0
    total_timeouts: int = 0
    wait_time_ms: int = 0
    hold_time_ms: int = 0


class AgentLock:
    """Agent mutual exclusion lock."""

    def __init__(self, name: str, config: LockConfig = None):
        self._name = name
        self._config = config or LockConfig()
        self._lock = threading.RLock() if self._config.lock_type == LockType.REENTRANT else threading.Lock()
        self._owner = None
        self._count = 0
        self._stats = SyncStats()
        self._waiters: List[SyncWaiter] = []

    @property
    def name(self) -> str:
        return self._name

    def acquire(self, timeout: float = None) -> bool:
        """Acquire the lock."""
        timeout = timeout or self._config.timeout
        start_time = time.time()

        if self._config.lock_type == LockType.REENTRANT:
            # Reentrant - same thread can acquire multiple times
            self._lock.acquire()
            self._owner = threading.current_thread().ident
            self._count += 1
            self._stats.total_acquires += 1
            return True
        else:
            # Non-reentrant - need to acquire
            acquired = self._lock.acquire(timeout=timeout)
            if acquired:
                self._owner = threading.current_thread().ident
                self._count = 1
                self._stats.total_acquires += 1
            else:
                self._stats.total_timeouts += 1
            return acquired

    def release(self):
        """Release the lock."""
        if self._config.lock_type == LockType.REENTRANT:
            self._count -= 1
            if self._count == 0:
                self._owner = None
                self._lock.release()
        else:
            self._owner = None
            self._lock.release()
        self._stats.total_releases += 1

    def is_locked(self) -> bool:
        """Check if locked."""
        return self._owner is not None

    def get_owner(self) -> Optional[int]:
        """Get owner thread ID."""
        return self._owner

    def get_stats(self) -> Dict:
        """Get lock statistics."""
        return {
            "name": self._name,
            "type": self._config.lock_type.value,
            "is_locked": self.is_locked(),
            "owner": self._owner,
            "count": self._count,
            "total_acquires": self._stats.total_acquires,
            "total_releases": self._stats.total_releases,
            "total_timeouts": self._stats.total_timeouts
        }

    @contextmanager
    def __call__(self, timeout: float = None):
        """Context manager usage."""
        self.acquire(timeout)
        try:
            yield
        finally:
            self.release()


class AgentRWLock:
    """Agent read-write lock."""

    def __init__(self, name: str, config: RWLockConfig = None):
        self._name = name
        self._config = config or RWLockConfig()
        self._read_ready = threading.Condition(threading.Lock())
        self._write_ready = threading.Condition(threading.Lock())
        self._readers = 0
        self._writers_waiting = 0
        self._writer_active = False
        self._stats = SyncStats()

    @property
    def name(self) -> str:
        return self._name

    def acquire_read(self, timeout: float = None) -> bool:
        """Acquire read lock."""
        timeout = timeout or self._config.writer_timeout
        start_time = time.time()

        with self._read_ready:
            # Wait if writers are waiting and prefer writer
            if self._config.prefer_writer and self._writers_waiting > 0:
                if not self._read_ready.wait_for(
                    lambda: self._writers_waiting == 0 or not self._writer_active,
                    timeout=timeout
                ):
                    self._stats.total_timeouts += 1
                    return False

            # Wait if writer is active
            if self._writer_active:
                if not self._read_ready.wait_for(lambda: not self._writer_active, timeout=timeout):
                    self._stats.total_timeouts += 1
                    return False

            self._readers += 1
            self._stats.total_acquires += 1

        wait_time = int((time.time() - start_time) * 1000)
        self._stats.wait_time_ms += wait_time
        return True

    def acquire_write(self, timeout: float = None) -> bool:
        """Acquire write lock."""
        timeout = timeout or self._config.writer_timeout
        start_time = time.time()

        with self._write_ready:
            self._writers_waiting += 1

            try:
                # Wait until no readers and no active writer
                if not self._write_ready.wait_for(
                    lambda: self._readers == 0 and not self._writer_active,
                    timeout=timeout
                ):
                    self._stats.total_timeouts += 1
                    return False

                self._writer_active = True
                self._stats.total_acquires += 1

            finally:
                self._writers_waiting -= 1

        wait_time = int((time.time() - start_time) * 1000)
        self._stats.wait_time_ms += wait_time
        return True

    def release_read(self):
        """Release read lock."""
        with self._read_ready:
            self._readers -= 1
            if self._readers == 0:
                self._write_ready.notify_all()
            self._stats.total_releases += 1

    def release_write(self):
        """Release write lock."""
        with self._write_ready:
            self._writer_active = False
            self._read_ready.notify_all()
            self._write_ready.notify_all()
            self._stats.total_releases += 1

    @contextmanager
    def read_lock(self, timeout: float = None):
        """Context manager for read lock."""
        self.acquire_read(timeout)
        try:
            yield
        finally:
            self.release_read()

    @contextmanager
    def write_lock(self, timeout: float = None):
        """Context manager for write lock."""
        self.acquire_write(timeout)
        try:
            yield
        finally:
            self.release_write()

    def get_stats(self) -> Dict:
        """Get lock statistics."""
        return {
            "name": self._name,
            "readers": self._readers,
            "writers_waiting": self._writers_waiting,
            "writer_active": self._writer_active,
            "total_acquires": self._stats.total_acquires,
            "total_releases": self._stats.total_releases,
            "total_timeouts": self._stats.total_timeouts
        }


class AgentSemaphore:
    """Agent semaphore."""

    def __init__(self, name: str, config: SemaphoreConfig = None):
        self._name = name
        self._config = config or SemaphoreConfig()
        self._semaphore = threading.Semaphore(self._config.initial_count)
        self._max_count = self._config.max_count
        self._stats = SyncStats()

    @property
    def name(self) -> str:
        return self._name

    def acquire(self, timeout: float = None) -> bool:
        """Acquire semaphore."""
        timeout = timeout or self._config.timeout
        start_time = time.time()

        acquired = self._semaphore.acquire(timeout=timeout)
        if acquired:
            self._stats.total_acquires += 1
        else:
            self._stats.total_timeouts += 1

        wait_time = int((time.time() - start_time) * 1000)
        self._stats.wait_time_ms += wait_time
        return acquired

    def release(self):
        """Release semaphore."""
        self._semaphore.release()
        self._stats.total_releases += 1

    def get_count(self) -> int:
        """Get current count (approximate)."""
        return self._semaphore._value

    @contextmanager
    def __call__(self, timeout: float = None):
        """Context manager usage."""
        self.acquire(timeout)
        try:
            yield
        finally:
            self.release()

    def get_stats(self) -> Dict:
        """Get semaphore statistics."""
        return {
            "name": self._name,
            "current_count": self.get_count(),
            "max_count": self._max_count,
            "total_acquires": self._stats.total_acquires,
            "total_releases": self._stats.total_releases,
            "total_timeouts": self._stats.total_timeouts
        }


class AgentBarrier:
    """Agent barrier for synchronization."""

    def __init__(self, name: str, config: BarrierConfig):
        self._name = name
        self._parties = config.parties
        self._timeout = config.timeout
        self._barrier = threading.Barrier(self._parties)
        self._stats = SyncStats()

    @property
    def name(self) -> str:
        return self._name

    def wait(self, timeout: float = None) -> bool:
        """Wait at barrier."""
        timeout = timeout or self._timeout
        start_time = time.time()

        try:
            self._barrier.wait(timeout=timeout)
            self._stats.total_waits += 1
            return True
        except threading.BrokenBarrierError:
            # Reset and return false
            self._barrier.reset()
            self._stats.total_timeouts += 1
            return False
        except Exception:
            self._stats.total_timeouts += 1
            return False

    def reset(self):
        """Reset the barrier."""
        self._barrier.reset()

    def get_stats(self) -> Dict:
        """Get barrier statistics."""
        return {
            "name": self._name,
            "parties": self._parties,
            "total_waits": self._stats.total_waits,
            "total_timeouts": self._stats.total_timeouts
        }


class AgentEvent:
    """Agent event for signaling."""

    def __init__(self, name: str, auto_reset: bool = False):
        self._name = name
        self._event = threading.Event()
        self._auto_reset = auto_reset
        self._stats = SyncStats()

    @property
    def name(self) -> str:
        return self._name

    def set(self):
        """Set the event."""
        self._event.set()
        self._stats.total_waits += 1

    def clear(self):
        """Clear the event."""
        self._event.clear()

    def wait(self, timeout: float = None) -> bool:
        """Wait for event."""
        start_time = time.time()
        result = self._event.wait(timeout=timeout)
        if result:
            self._stats.total_waits += 1
            if self._auto_reset:
                self._event.clear()
        else:
            self._stats.total_timeouts += 1

        wait_time = int((time.time() - start_time) * 1000)
        self._stats.wait_time_ms += wait_time
        return result

    def is_set(self) -> bool:
        """Check if event is set."""
        return self._event.is_set()

    def get_stats(self) -> Dict:
        """Get event statistics."""
        return {
            "name": self._name,
            "is_set": self.is_set(),
            "total_waits": self._stats.total_waits,
            "total_timeouts": self._stats.total_timeouts
        }


class AgentCondition:
    """Agent condition variable."""

    def __init__(self, name: str, lock: AgentLock = None):
        self._name = name
        self._lock = lock or AgentLock(f"{name}_lock")
        self._condition = threading.Condition(self._lock._lock)
        self._stats = SyncStats()

    @property
    def name(self) -> str:
        return self._name

    def wait(self, timeout: float = None) -> bool:
        """Wait for condition."""
        start_time = time.time()
        result = self._condition.wait(timeout=timeout)
        if result:
            self._stats.total_waits += 1
        else:
            self._stats.total_timeouts += 1

        wait_time = int((time.time() - start_time) * 1000)
        self._stats.wait_time_ms += wait_time
        return result

    def notify(self):
        """Notify one waiter."""
        self._condition.notify()

    def notify_all(self):
        """Notify all waiters."""
        self._condition.notify_all()

    def get_stats(self) -> Dict:
        """Get condition statistics."""
        return {
            "name": self._name,
            "total_waits": self._stats.total_waits,
            "total_timeouts": self._stats.total_timeouts
        }


class AgentOnce:
    """Agent once initialization."""

    def __init__(self, name: str):
        self._name = name
        self._once = threading.Once()
        self._executed = False
        self._stats = SyncStats()

    @property
    def name(self) -> str:
        return self._name

    def do(self, func: Callable):
        """Execute function once."""
        self._once.do(func)
        self._executed = True
        self._stats.total_acquires += 1

    def reset(self):
        """Reset once (for testing)."""
        self._once = threading.Once()

    def get_stats(self) -> Dict:
        """Get once statistics."""
        return {
            "name": self._name,
            "executed": self._executed,
            "total_executions": self._stats.total_acquires
        }


class AgentSyncManager:
    """Manage all agent synchronization primitives."""

    def __init__(self):
        self._lock = threading.RLock()
        self._locks: Dict[str, AgentLock] = {}
        self._rw_locks: Dict[str, AgentRWLock] = {}
        self._semaphores: Dict[str, AgentSemaphore] = {}
        self._barriers: Dict[str, AgentBarrier] = {}
        self._events: Dict[str, AgentEvent] = {}
        self._conditions: Dict[str, AgentCondition] = {}
        self._onces: Dict[str, AgentOnce] = {}

    # Lock operations
    def create_lock(self, name: str, config: LockConfig = None) -> AgentLock:
        """Create a lock."""
        with self._lock:
            if name in self._locks:
                return self._locks[name]
            lock = AgentLock(name, config)
            self._locks[name] = lock
            return lock

    def get_lock(self, name: str) -> Optional[AgentLock]:
        """Get a lock."""
        with self._lock:
            return self._locks.get(name)

    def delete_lock(self, name: str) -> bool:
        """Delete a lock."""
        with self._lock:
            if name in self._locks:
                del self._locks[name]
                return True
            return False

    # Read-Write Lock operations
    def create_rw_lock(self, name: str, config: RWLockConfig = None) -> AgentRWLock:
        """Create a read-write lock."""
        with self._lock:
            if name in self._rw_locks:
                return self._rw_locks[name]
            rw_lock = AgentRWLock(name, config)
            self._rw_locks[name] = rw_lock
            return rw_lock

    def get_rw_lock(self, name: str) -> Optional[AgentRWLock]:
        """Get a read-write lock."""
        with self._lock:
            return self._rw_locks.get(name)

    def delete_rw_lock(self, name: str) -> bool:
        """Delete a read-write lock."""
        with self._lock:
            if name in self._rw_locks:
                del self._rw_locks[name]
                return True
            return False

    # Semaphore operations
    def create_semaphore(self, name: str, config: SemaphoreConfig = None) -> AgentSemaphore:
        """Create a semaphore."""
        with self._lock:
            if name in self._semaphores:
                return self._semaphores[name]
            semaphore = AgentSemaphore(name, config)
            self._semaphores[name] = semaphore
            return semaphore

    def get_semaphore(self, name: str) -> Optional[AgentSemaphore]:
        """Get a semaphore."""
        with self._lock:
            return self._semaphores.get(name)

    def delete_semaphore(self, name: str) -> bool:
        """Delete a semaphore."""
        with self._lock:
            if name in self._semaphores:
                del self._semaphores[name]
                return True
            return False

    # Barrier operations
    def create_barrier(self, name: str, parties: int, timeout: float = 300.0) -> AgentBarrier:
        """Create a barrier."""
        with self._lock:
            if name in self._barriers:
                return self._barriers[name]
            config = BarrierConfig(parties=parties, timeout=timeout)
            barrier = AgentBarrier(name, config)
            self._barriers[name] = barrier
            return barrier

    def get_barrier(self, name: str) -> Optional[AgentBarrier]:
        """Get a barrier."""
        with self._lock:
            return self._barriers.get(name)

    def delete_barrier(self, name: str) -> bool:
        """Delete a barrier."""
        with self._lock:
            if name in self._barriers:
                del self._barriers[name]
                return True
            return False

    # Event operations
    def create_event(self, name: str, auto_reset: bool = False) -> AgentEvent:
        """Create an event."""
        with self._lock:
            if name in self._events:
                return self._events[name]
            event = AgentEvent(name, auto_reset)
            self._events[name] = event
            return event

    def get_event(self, name: str) -> Optional[AgentEvent]:
        """Get an event."""
        with self._lock:
            return self._events.get(name)

    def delete_event(self, name: str) -> bool:
        """Delete an event."""
        with self._lock:
            if name in self._events:
                del self._events[name]
                return True
            return False

    # Condition operations
    def create_condition(self, name: str, lock: AgentLock = None) -> AgentCondition:
        """Create a condition."""
        with self._lock:
            if name in self._conditions:
                return self._conditions[name]
            condition = AgentCondition(name, lock)
            self._conditions[name] = condition
            return condition

    def get_condition(self, name: str) -> Optional[AgentCondition]:
        """Get a condition."""
        with self._lock:
            return self._conditions.get(name)

    def delete_condition(self, name: str) -> bool:
        """Delete a condition."""
        with self._lock:
            if name in self._conditions:
                del self._conditions[name]
                return True
            return False

    # Once operations
    def create_once(self, name: str) -> AgentOnce:
        """Create a once."""
        with self._lock:
            if name in self._onces:
                return self._onces[name]
            once = AgentOnce(name)
            self._onces[name] = once
            return once

    def get_once(self, name: str) -> Optional[AgentOnce]:
        """Get a once."""
        with self._lock:
            return self._onces.get(name)

    def delete_once(self, name: str) -> bool:
        """Delete a once."""
        with self._lock:
            if name in self._onces:
                del self._onces[name]
                return True
            return False

    # Utility methods
    def get_all_sync_objects(self) -> Dict[str, int]:
        """Get count of all sync objects."""
        with self._lock:
            return {
                "locks": len(self._locks),
                "rw_locks": len(self._rw_locks),
                "semaphores": len(self._semaphores),
                "barriers": len(self._barriers),
                "events": len(self._events),
                "conditions": len(self._conditions),
                "onces": len(self._onces)
            }

    def clear_all(self):
        """Clear all sync objects."""
        with self._lock:
            self._locks.clear()
            self._rw_locks.clear()
            self._semaphores.clear()
            self._barriers.clear()
            self._events.clear()
            self._conditions.clear()
            self._onces.clear()


# Global sync manager instance
agent_sync_manager = AgentSyncManager()
