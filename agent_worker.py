"""Agent Worker Module

Worker thread pool management for agent tasks including worker lifecycle,
task queue, concurrency control, worker scaling, and worker health monitoring.
"""
import time
import uuid
import threading
import asyncio
from typing import Dict, List, Optional, Any, Callable, Union
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict, deque
import queue
import json


class WorkerState(str, Enum):
    """Worker states."""
    IDLE = "idle"
    RUNNING = "running"
    BUSY = "busy"
    STOPPING = "stopping"
    STOPPED = "stopped"
    ERROR = "error"


class TaskPriority(int, Enum):
    """Task priority levels."""
    LOW = 0
    NORMAL = 1
    HIGH = 2
    CRITICAL = 3


class WorkerStrategy(str, Enum):
    """Worker allocation strategies."""
    ROUND_ROBIN = "round_robin"
    LEAST_LOADED = "least_loaded"
    MOST_LOADED = "most_loaded"
    RANDOM = "random"
    PRIORITY = "priority"


@dataclass
class WorkerTask:
    """Worker task representation."""
    id: str
    func: Callable
    args: tuple = field(default_factory=tuple)
    kwargs: Dict[str, Any] = field(default_factory=dict)
    priority: TaskPriority = TaskPriority.NORMAL
    timeout: float = 30.0
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    result: Any = None
    error: Optional[str] = None
    status: str = "pending"  # pending, running, completed, failed, timeout


@dataclass
class WorkerConfig:
    """Worker configuration."""
    name: str
    min_workers: int = 1
    max_workers: int = 10
    queue_size: int = 100
    task_timeout: float = 30.0
    idle_timeout: float = 300.0
    health_check_interval: float = 60.0
    auto_scale: bool = True
    scale_up_threshold: float = 0.8
    scale_down_threshold: float = 0.2
    strategy: WorkerStrategy = WorkerStrategy.LEAST_LOADED


@dataclass
class Worker:
    """Worker instance."""
    id: str
    name: str
    state: WorkerState = WorkerState.IDLE
    current_task: Optional[WorkerTask] = None
    tasks_completed: int = 0
    tasks_failed: int = 0
    total_runtime: float = 0.0
    created_at: float = field(default_factory=time.time)
    last_active: float = field(default_factory=time.time)
    thread: Optional[threading.Thread] = None


@dataclass
class WorkerStats:
    """Worker statistics."""
    total_tasks: int = 0
    completed_tasks: int = 0
    failed_tasks: int = 0
    timeout_tasks: int = 0
    avg_execution_time: float = 0.0
    total_runtime: float = 0.0
    peak_workers: int = 0


class WorkerPool:
    """Worker pool for managing worker threads."""

    def __init__(self, config: WorkerConfig):
        self.config = config
        self._lock = threading.RLock()
        self._workers: Dict[str, Worker] = {}
        self._task_queue: queue.PriorityQueue = queue.PriorityQueue(maxsize=config.queue_size)
        self._running = False
        self._stats = WorkerStats()
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._task_results: Dict[str, Any] = {}
        self._worker_health: Dict[str, float] = {}

    def start(self):
        """Start the worker pool."""
        with self._lock:
            if self._running:
                return

            self._running = True

            # Start initial workers
            for i in range(self.config.min_workers):
                self._spawn_worker()

    def stop(self):
        """Stop the worker pool."""
        with self._lock:
            self._running = False

            # Signal all workers to stop
            for worker in self._workers.values():
                worker.state = WorkerState.STOPPING

            # Wait for workers to finish
            for worker in list(self._workers.values()):
                if worker.thread and worker.thread.is_alive():
                    worker.thread.join(timeout=5.0)

            self._workers.clear()

    def _spawn_worker(self) -> Worker:
        """Spawn a new worker."""
        worker_id = str(uuid.uuid4())[:8]
        worker_name = f"{self.config.name}-worker-{worker_id}"

        worker = Worker(
            id=worker_id,
            name=worker_name,
            state=WorkerState.IDLE
        )

        thread = threading.Thread(
            target=self._worker_loop,
            args=(worker,),
            daemon=True
        )
        thread.start()
        worker.thread = thread

        self._workers[worker_id] = worker
        self._worker_health[worker_id] = time.time()

        if len(self._workers) > self._stats.peak_workers:
            self._stats.peak_workers = len(self._workers)

        self._emit_event("worker_spawned", {"worker_id": worker_id, "name": worker_name})
        return worker

    def _worker_loop(self, worker: Worker):
        """Main worker loop."""
        while self._running and worker.state != WorkerState.STOPPING:
            try:
                # Get task from queue with timeout
                task = self._task_queue.get(timeout=1.0)

                # Execute task
                worker.state = WorkerState.BUSY
                worker.current_task = task
                task.status = "running"
                task.started_at = time.time()

                self._emit_event("task_started", {
                    "worker_id": worker.id,
                    "task_id": task.id
                })

                start_time = time.time()
                try:
                    # Execute with timeout
                    result = task.func(*task.args, **task.kwargs)
                    task.result = result
                    task.status = "completed"
                    task.completed_at = time.time()

                    worker.tasks_completed += 1
                    self._stats.completed_tasks += 1
                    self._task_results[task.id] = result

                except Exception as e:
                    task.error = str(e)
                    task.status = "failed"
                    task.completed_at = time.time()

                    worker.tasks_failed += 1
                    self._stats.failed_tasks += 1
                    self._task_results[task.id] = None

                    self._emit_event("task_failed", {
                        "worker_id": worker.id,
                        "task_id": task.id,
                        "error": str(e)
                    })

                execution_time = time.time() - start_time
                worker.total_runtime += execution_time
                self._stats.total_runtime += execution_time

                # Update stats
                if self._stats.completed_tasks > 0:
                    self._stats.avg_execution_time = (
                        self._stats.total_runtime / self._stats.completed_tasks
                    )

                worker.current_task = None
                worker.last_active = time.time()
                worker.state = WorkerState.IDLE

                self._task_queue.task_done()

                self._emit_event("task_completed", {
                    "worker_id": worker.id,
                    "task_id": task.id,
                    "execution_time": execution_time
                })

            except queue.Empty:
                # No task available, check idle timeout
                if time.time() - worker.last_active > self.config.idle_timeout:
                    if len(self._workers) > self.config.min_workers:
                        worker.state = WorkerState.STOPPING
                        break
                continue

            except Exception as e:
                worker.state = WorkerState.ERROR
                self._emit_event("worker_error", {
                    "worker_id": worker.id,
                    "error": str(e)
                })

        worker.state = WorkerState.STOPPED
        self._emit_event("worker_stopped", {"worker_id": worker.id})

    def submit_task(
        self,
        func: Callable,
        args: tuple = None,
        kwargs: Dict[str, Any] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
        timeout: float = None
    ) -> str:
        """Submit a task to the worker pool."""
        task_id = str(uuid.uuid4())[:8]

        task = WorkerTask(
            id=task_id,
            func=func,
            args=args or (),
            kwargs=kwargs or {},
            priority=priority,
            timeout=timeout or self.config.task_timeout,
            created_at=time.time()
        )

        self._task_queue.put((priority.value, task))
        self._stats.total_tasks += 1

        self._emit_event("task_submitted", {
            "task_id": task_id,
            "priority": priority.name
        })

        # Auto-scale if enabled
        if self.config.auto_scale:
            self._check_scaling()

        return task_id

    def _check_scaling(self):
        """Check and perform auto-scaling."""
        queue_load = self._task_queue.qsize() / self.config.queue_size

        # Scale up
        if queue_load > self.config.scale_up_threshold:
            if len(self._workers) < self.config.max_workers:
                self._spawn_worker()

        # Scale down
        elif queue_load < self.config.scale_down_threshold:
            if len(self._workers) > self.config.min_workers:
                # Find idle workers to terminate
                for worker in self._workers.values():
                    if worker.state == WorkerState.IDLE:
                        worker.state = WorkerState.STOPPING
                        break

    def get_task_result(self, task_id: str, timeout: float = None) -> Any:
        """Get task result, waiting if necessary."""
        timeout = timeout or self.config.task_timeout
        start_time = time.time()

        while time.time() - start_time < timeout:
            if task_id in self._task_results:
                result = self._task_results.pop(task_id)
                return result
            time.sleep(0.1)

        return None

    def get_worker(self, worker_id: str) -> Optional[Worker]:
        """Get worker by ID."""
        with self._lock:
            return self._workers.get(worker_id)

    def list_workers(self, state: WorkerState = None) -> List[Worker]:
        """List workers, optionally filtered by state."""
        with self._lock:
            workers = list(self._workers.values())
            if state:
                workers = [w for w in workers if w.state == state]
            return workers

    def get_stats(self) -> Dict[str, Any]:
        """Get worker pool statistics."""
        with self._lock:
            return {
                "total_tasks": self._stats.total_tasks,
                "completed_tasks": self._stats.completed_tasks,
                "failed_tasks": self._stats.failed_tasks,
                "timeout_tasks": self._stats.timeout_tasks,
                "avg_execution_time": round(self._stats.avg_execution_time, 3),
                "total_runtime": round(self._stats.total_runtime, 3),
                "peak_workers": self._stats.peak_workers,
                "current_workers": len(self._workers),
                "queue_size": self._task_queue.qsize(),
                "queue_capacity": self.config.queue_size
            }

    def register_hook(self, event_type: str, handler: Callable):
        """Register an event hook."""
        self._hooks[event_type].append(handler)

    def _emit_event(self, event_type: str, data: Dict[str, Any]):
        """Emit a worker pool event."""
        for handler in self._hooks.get(event_type, []):
            try:
                handler(data)
            except Exception:
                pass


class AgentWorker:
    """Agent worker management system."""

    def __init__(self):
        self._lock = threading.RLock()
        self._pools: Dict[str, WorkerPool] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def create_pool(
        self,
        name: str,
        min_workers: int = 1,
        max_workers: int = 10,
        queue_size: int = 100,
        task_timeout: float = 30.0,
        idle_timeout: float = 300.0,
        health_check_interval: float = 60.0,
        auto_scale: bool = True,
        scale_up_threshold: float = 0.8,
        scale_down_threshold: float = 0.2,
        strategy: WorkerStrategy = WorkerStrategy.LEAST_LOADED
    ) -> str:
        """Create a new worker pool."""
        with self._lock:
            pool_id = str(uuid.uuid4())[:8]

            config = WorkerConfig(
                name=name,
                min_workers=min_workers,
                max_workers=max_workers,
                queue_size=queue_size,
                task_timeout=task_timeout,
                idle_timeout=idle_timeout,
                health_check_interval=health_check_interval,
                auto_scale=auto_scale,
                scale_up_threshold=scale_up_threshold,
                scale_down_threshold=scale_down_threshold,
                strategy=strategy
            )

            pool = WorkerPool(config)
            pool.start()

            self._pools[pool_id] = pool
            return pool_id

    def get_pool(self, pool_id: str) -> Optional[WorkerPool]:
        """Get pool by ID."""
        with self._lock:
            return self._pools.get(pool_id)

    def delete_pool(self, pool_id: str) -> bool:
        """Delete a worker pool."""
        with self._lock:
            pool = self._pools.get(pool_id)
            if not pool:
                return False

            pool.stop()
            del self._pools[pool_id]
            return True

    def list_pools(self) -> List[Dict[str, Any]]:
        """List all worker pools."""
        with self._lock:
            return [
                {
                    "id": pid,
                    "name": pool.config.name,
                    "min_workers": pool.config.min_workers,
                    "max_workers": pool.config.max_workers,
                    "current_workers": len(pool._workers),
                    "stats": pool.get_stats()
                }
                for pid, pool in self._pools.items()
            ]

    def submit_task(
        self,
        pool_id: str,
        func: Callable,
        args: tuple = None,
        kwargs: Dict[str, Any] = None,
        priority: TaskPriority = TaskPriority.NORMAL,
        timeout: float = None
    ) -> Optional[str]:
        """Submit a task to a pool."""
        pool = self.get_pool(pool_id)
        if not pool:
            return None

        return pool.submit_task(func, args, kwargs, priority, timeout)

    def get_task_result(self, pool_id: str, task_id: str, timeout: float = None) -> Any:
        """Get task result from a pool."""
        pool = self.get_pool(pool_id)
        if not pool:
            return None

        return pool.get_task_result(task_id, timeout)

    def get_pool_stats(self, pool_id: str) -> Optional[Dict[str, Any]]:
        """Get pool statistics."""
        pool = self.get_pool(pool_id)
        if not pool:
            return None

        return pool.get_stats()

    def get_pool_workers(self, pool_id: str) -> List[Dict[str, Any]]:
        """Get workers in a pool."""
        pool = self.get_pool(pool_id)
        if not pool:
            return []

        workers = pool.list_workers()
        return [
            {
                "id": w.id,
                "name": w.name,
                "state": w.state.value,
                "tasks_completed": w.tasks_completed,
                "tasks_failed": w.tasks_failed,
                "total_runtime": round(w.total_runtime, 3),
                "current_task_id": w.current_task.id if w.current_task else None
            }
            for w in workers
        ]

    def scale_pool(
        self,
        pool_id: str,
        min_workers: int = None,
        max_workers: int = None
    ) -> bool:
        """Scale a worker pool."""
        pool = self.get_pool(pool_id)
        if not pool:
            return False

        with pool._lock:
            if min_workers is not None:
                pool.config.min_workers = min_workers
            if max_workers is not None:
                pool.config.max_workers = max_workers

            # Adjust worker count
            current_count = len(pool._workers)
            if current_count < pool.config.min_workers:
                for _ in range(pool.config.min_workers - current_count):
                    pool._spawn_worker()
            elif current_count > pool.config.max_workers:
                # Mark excess workers for termination
                excess = current_count - pool.config.max_workers
                idle_workers = [w for w in pool._workers.values() if w.state == WorkerState.IDLE]
                for worker in idle_workers[:excess]:
                    worker.state = WorkerState.STOPPING

        return True

    def pause_pool(self, pool_id: str) -> bool:
        """Pause a worker pool (stop accepting new tasks)."""
        pool = self.get_pool(pool_id)
        if not pool:
            return False

        with pool._lock:
            for worker in pool._workers.values():
                worker.state = WorkerState.STOPPING

        return True

    def resume_pool(self, pool_id: str) -> bool:
        """Resume a paused worker pool."""
        pool = self.get_pool(pool_id)
        if not pool:
            return False

        with pool._lock:
            pool._running = True
            current_count = len(pool._workers)
            if current_count < pool.config.min_workers:
                for _ in range(pool.config.min_workers - current_count):
                    pool._spawn_worker()

        return True

    def register_hook(self, event_type: str, handler: Callable):
        """Register an event hook."""
        self._hooks[event_type].append(handler)

    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics for all pools."""
        return {
            pid: pool.get_stats()
            for pid, pool in self._pools.items()
        }


# Global worker instance
agent_worker = AgentWorker()
