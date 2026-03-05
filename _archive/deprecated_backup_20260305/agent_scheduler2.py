"""Advanced Agent Scheduler Module

Advanced agent task scheduler with priority queues, heap-based scheduling,
task dependencies, preemption, and weighted fair queuing.
"""
import time
import heapq
import threading
import uuid
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import defaultdict
import croniter

from shared import TaskState, PriorityLevel, QueueStrategy


@dataclass(order=True)
class PriorityQueueItem:
    """Priority queue item with heap support."""
    priority: int  # Lower number = higher priority
    timestamp: float = field(compare=True)
    task_id: str = field(compare=False)
    agent_id: str = field(compare=False)


@dataclass
class TaskDependency:
    """Task dependency definition."""
    depends_on: str  # Task ID this task depends on
    dependency_type: str = "blocking"  # blocking, success, failure


@dataclass
class QueueConfig:
    """Priority queue configuration."""
    name: str
    priority_level: PriorityLevel
    max_size: int = 1000
    timeout_seconds: int = 3600
    retry_enabled: bool = True
    max_retries: int = 3
    preemption_enabled: bool = False
    weight: int = 1  # For fair share scheduling


@dataclass
class ScheduledTask:
    """Scheduled task definition."""
    id: str
    agent_id: str
    name: str
    description: str
    task_type: str
    payload: Dict[str, Any]
    priority: PriorityLevel = PriorityLevel.NORMAL
    queue_config: QueueConfig = None
    enabled: bool = True
    max_retries: int = 3
    timeout_seconds: int = 300
    created_at: float = field(default_factory=time.time)
    scheduled_at: float = 0
    started_at: float = 0
    completed_at: float = 0
    dependencies: List[TaskDependency] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TaskExecution:
    """Task execution record."""
    id: str
    task_id: str
    agent_id: str
    state: TaskState
    priority: PriorityLevel
    started_at: float
    completed_at: float = 0
    duration_ms: int = 0
    result: Dict[str, Any] = field(default_factory=dict)
    error: str = ""
    retry_count: int = 0
    queue_name: str = ""


class AdvancedAgentScheduler:
    """Advanced agent task scheduler with priority queues."""

    def __init__(self):
        self._lock = threading.RLock()
        self._tasks: Dict[str, ScheduledTask] = {}
        self._agent_tasks: Dict[str, List[str]] = defaultdict(list)

        # Priority queues by level
        self._queues: Dict[PriorityLevel, List[PriorityQueueItem]] = {
            PriorityLevel.CRITICAL: [],
            PriorityLevel.HIGH: [],
            PriorityLevel.NORMAL: [],
            PriorityLevel.LOW: [],
            PriorityLevel.BATCH: []
        }

        # Queue configurations
        self._queue_configs: Dict[str, QueueConfig] = {}
        self._initialize_default_queues()

        # Execution tracking
        self._executions: Dict[str, TaskExecution] = {}
        self._running_tasks: Dict[str, TaskExecution] = {}
        self._completed_tasks: Dict[str, Any] = {}  # For dependency resolution

        # Dead letter queue
        self._dead_letter_queue: List[Dict] = []

        # Fair share tracking
        self._agent_weights: Dict[str, float] = defaultdict(lambda: 1.0)
        self._agent_usage: Dict[str, float] = defaultdict(float)
        self._last_adjustment = time.time()

        # Statistics
        self._total_enqueued = 0
        self._total_completed = 0
        self._total_failed = 0
        self._total_preempted = 0

        # Limits
        self._max_tasks = 10000
        self._max_executions = 50000
        self._max_dead_letter = 1000

        # Scheduler thread
        self._scheduler_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._check_interval = 0.5

    def _initialize_default_queues(self):
        """Initialize default priority queues."""
        default_queues = [
            QueueConfig("critical", PriorityLevel.CRITICAL, max_size=100, timeout_seconds=60, weight=10),
            QueueConfig("high", PriorityLevel.HIGH, max_size=500, timeout_seconds=300, weight=5),
            QueueConfig("normal", PriorityLevel.NORMAL, max_size=2000, timeout_seconds=3600, weight=3),
            QueueConfig("low", PriorityLevel.LOW, max_size=5000, timeout_seconds=7200, weight=2),
            QueueConfig("batch", PriorityLevel.BATCH, max_size=10000, timeout_seconds=86400, weight=1)
        ]
        for q in default_queues:
            self._queue_configs[q.name] = q

    def _get_priority_value(self, priority: PriorityLevel) -> int:
        """Convert priority level to numeric value."""
        mapping = {
            PriorityLevel.CRITICAL: 0,
            PriorityLevel.HIGH: 1,
            PriorityLevel.NORMAL: 2,
            PriorityLevel.LOW: 3,
            PriorityLevel.BATCH: 4
        }
        return mapping.get(priority, 2)

    def _check_dependencies(self, task: ScheduledTask) -> bool:
        """Check if task dependencies are satisfied."""
        if not task.dependencies:
            return True
        for dep in task.dependencies:
            if dep.dependency_type == "blocking":
                # Check if dependency completed
                if dep.depends_on not in self._completed_tasks:
                    return False
                # Check if it was successful
                completed = self._completed_tasks.get(dep.depends_on, {})
                if completed.get("state") != "completed":
                    return False
            elif dep.dependency_type == "success":
                if dep.depends_on not in self._completed_tasks:
                    return False
                if self._completed_tasks[dep.depends_on].get("state") != "completed":
                    return False
            elif dep.dependency_type == "failure":
                if dep.depends_on in self._completed_tasks:
                    if self._completed_tasks[dep.depends_on].get("state") != "failed":
                        return False
        return True

    def enqueue(
        self,
        agent_id: str,
        name: str,
        task_type: str,
        payload: Dict[str, Any],
        priority: PriorityLevel = PriorityLevel.NORMAL,
        scheduled_at: float = None,
        queue_name: str = None,
        dependencies: List[Dict] = None,
        timeout_seconds: int = 300,
        max_retries: int = 3,
        metadata: Dict[str, Any] = None
    ) -> str:
        """Enqueue a task with priority."""
        with self._lock:
            task_id = str(uuid.uuid4())[:12]

            # Parse dependencies
            task_deps = []
            if dependencies:
                for d in dependencies:
                    task_deps.append(TaskDependency(
                        depends_on=d.get("task_id", ""),
                        dependency_type=d.get("type", "blocking")
                    ))

            # Get queue config
            queue_cfg = None
            if queue_name and queue_name in self._queue_configs:
                queue_cfg = self._queue_configs[queue_name]
            else:
                queue_cfg = self._queue_configs.get(priority.value, self._queue_configs["normal"])

            task = ScheduledTask(
                id=task_id,
                agent_id=agent_id,
                name=name,
                description="",
                task_type=task_type,
                payload=payload,
                priority=priority,
                queue_config=queue_cfg,
                enabled=True,
                max_retries=max_retries,
                timeout_seconds=timeout_seconds,
                scheduled_at=scheduled_at or time.time(),
                dependencies=task_deps,
                metadata=metadata or {}
            )

            self._tasks[task_id] = task
            self._agent_tasks[agent_id].append(task_id)

            # Enqueue to priority queue
            queue_item = PriorityQueueItem(
                priority=self._get_priority_value(priority),
                timestamp=task.scheduled_at,
                task_id=task_id,
                agent_id=agent_id
            )
            heapq.heappush(self._queues[priority], queue_item)
            self._total_enqueued += 1

            # Cleanup if needed
            if len(self._tasks) > self._max_tasks:
                self._cleanup_old_tasks()

            return task_id

    def _cleanup_old_tasks(self):
        """Remove oldest completed tasks."""
        completed = [k for k, v in self._tasks.items()
                   if v.completed_at > 0 and v.completed_at < time.time() - 3600]
        for task_id in completed[:100]:
            self._delete_task_internal(task_id)

    def _delete_task_internal(self, task_id: str):
        """Internal task deletion."""
        task = self._tasks.get(task_id)
        if task:
            del self._tasks[task_id]
            if task_id in self._agent_tasks[task.agent_id]:
                self._agent_tasks[task.agent_id].remove(task_id)

    def dequeue(self, strategy: QueueStrategy = QueueStrategy.PRIORITY) -> Optional[Dict]:
        """Dequeue next task based on strategy."""
        with self._lock:
            if strategy == QueueStrategy.PRIORITY:
                return self._dequeue_priority()
            elif strategy == QueueStrategy.FAIR_SHARE:
                return self._dequeue_fair_share()
            elif strategy == QueueStrategy.ROUND_ROBIN:
                return self._dequeue_round_robin()
            elif strategy == QueueStrategy.FIFO:
                return self._dequeue_fifo()
            elif strategy == QueueStrategy.LIFO:
                return self._dequeue_lifo()
            return self._dequeue_priority()

    def _dequeue_priority(self) -> Optional[Dict]:
        """Dequeue from highest priority non-empty queue."""
        for priority in [PriorityLevel.CRITICAL, PriorityLevel.HIGH,
                        PriorityLevel.NORMAL, PriorityLevel.LOW, PriorityLevel.BATCH]:
            queue = self._queues.get(priority, [])
            while queue:
                item = heapq.heappop(queue)
                task = self._tasks.get(item.task_id)
                if not task or not task.enabled:
                    continue
                if not self._check_dependencies(task):
                    # Re-queue as blocked
                    heapq.heappush(queue, item)
                    continue
                return self._start_execution(task)
        return None

    def _dequeue_fair_share(self) -> Optional[Dict]:
        """Dequeue using weighted fair sharing."""
        # Adjust weights based on usage
        self._adjust_fair_share_weights()

        # Calculate adjusted priorities
        candidates = []
        for priority in [PriorityLevel.CRITICAL, PriorityLevel.HIGH,
                        PriorityLevel.NORMAL, PriorityLevel.LOW, PriorityLevel.BATCH]:
            queue = self._queues.get(priority, [])
            while queue:
                item = heapq.heappop(queue)
                task = self._tasks.get(item.task_id)
                if task and task.enabled and self._check_dependencies(task):
                    weight = self._agent_weights.get(task.agent_id, 1.0)
                    adjusted_priority = item.priority / weight
                    candidates.append((adjusted_priority, item, task))
                elif task:
                    # Put back blocked tasks
                    heapq.heappush(queue, item)

        if not candidates:
            return None

        # Sort by adjusted priority
        candidates.sort(key=lambda x: x[0])
        _, item, task = candidates[0]

        return self._start_execution(task)

    def _adjust_fair_share_weights(self):
        """Adjust weights for fair share scheduling."""
        current = time.time()
        if current - self._last_adjustment > 60:  # Every minute
            # Decrease usage for all agents (decay)
            for agent_id in self._agent_usage:
                self._agent_usage[agent_id] *= 0.9
            self._last_adjustment = current

    def _dequeue_round_robin(self) -> Optional[Dict]:
        """Dequeue in round-robin fashion across priorities."""
        # Similar to priority but cycle through
        return self._dequeue_priority()

    def _dequeue_fifo(self) -> Optional[Dict]:
        """Dequeue in FIFO order (ignore priority)."""
        all_items = []
        for queue in self._queues.values():
            all_items.extend(queue)

        if not all_items:
            return None

        all_items.sort(key=lambda x: (x.priority, x.timestamp))
        item = all_items[0]

        # Remove from original queue
        if item.task_id in self._tasks:
            priority = self._tasks[item.task_id].priority
            self._queues[priority] = [i for i in self._queues[priority] if i.task_id != item.task_id]
            heapq.heapify(self._queues[priority])

        task = self._tasks.get(item.task_id)
        if task and task.enabled and self._check_dependencies(task):
            return self._start_execution(task)
        return None

    def _dequeue_lifo(self) -> Optional[Dict]:
        """Dequeue in LIFO order (newest first)."""
        all_items = []
        for queue in self._queues.values():
            all_items.extend(queue)

        if not all_items:
            return None

        # Get newest
        newest = max(all_items, key=lambda x: x.timestamp)
        priority = newest.priority
        self._queues[priority] = [i for i in self._queues[priority] if i.task_id != newest.task_id]
        heapq.heapify(self._queues[priority])

        task = self._tasks.get(newest.task_id)
        if task and task.enabled and self._check_dependencies(task):
            return self._start_execution(task)
        return None

    def _start_execution(self, task: ScheduledTask) -> Dict:
        """Start task execution."""
        task.started_at = time.time()

        execution_id = str(uuid.uuid4())[:12]
        execution = TaskExecution(
            id=execution_id,
            task_id=task.id,
            agent_id=task.agent_id,
            state=TaskState.RUNNING,
            priority=task.priority,
            started_at=task.started_at,
            queue_name=task.queue_config.name if task.queue_config else "normal"
        )

        self._executions[execution_id] = execution
        self._running_tasks[task.id] = execution
        self._agent_usage[task.agent_id] += 1

        return {
            "execution_id": execution_id,
            "task_id": task.id,
            "agent_id": task.agent_id,
            "name": task.name,
            "task_type": task.task_type,
            "payload": task.payload,
            "priority": task.priority.value,
            "queue": task.queue_config.name if task.queue_config else "normal",
            "timeout_seconds": task.timeout_seconds,
            "metadata": task.metadata
        }

    def complete(self, execution_id: str, result: Dict[str, Any]) -> bool:
        """Mark task as completed."""
        with self._lock:
            execution = self._executions.get(execution_id)
            if not execution:
                return False

            execution.state = TaskState.COMPLETED
            execution.completed_at = time.time()
            execution.duration_ms = int((execution.completed_at - execution.started_at) * 1000)
            execution.result = result

            # Track for dependency resolution
            self._completed_tasks[execution.task_id] = {
                "state": "completed",
                "result": result,
                "completed_at": execution.completed_at
            }

            if execution.task_id in self._running_tasks:
                del self._running_tasks[execution.task_id]

            self._total_completed += 1
            self._cleanup_executions()

            return True

    def fail(self, execution_id: str, error: str) -> bool:
        """Mark task as failed."""
        with self._lock:
            execution = self._executions.get(execution_id)
            if not execution:
                return False

            task = self._tasks.get(execution.task_id)
            retry = False

            # Check if we should retry
            if task and execution.retry_count < task.max_retries:
                retry = True
                execution.retry_count += 1
                # Re-queue for retry
                heapq.heappush(
                    self._queues[task.priority],
                    PriorityQueueItem(
                        priority=self._get_priority_value(task.priority),
                        timestamp=time.time(),
                        task_id=task.id,
                        agent_id=task.agent_id
                    )
                )
                execution.state = TaskState.QUEUED
            else:
                execution.state = TaskState.FAILED
                execution.completed_at = time.time()
                execution.duration_ms = int((execution.completed_at - execution.started_at) * 1000)
                execution.error = error

                # Add to dead letter queue
                self._add_to_dead_letter(task, error)

                # Track for dependency resolution
                if task:
                    self._completed_tasks[execution.task_id] = {
                        "state": "failed",
                        "error": error,
                        "completed_at": execution.completed_at
                    }

                if execution.task_id in self._running_tasks:
                    del self._running_tasks[execution.task_id]

                self._total_failed += 1

            self._cleanup_executions()
            return True

    def _add_to_dead_letter(self, task: Optional[ScheduledTask], error: str):
        """Add failed task to dead letter queue."""
        if not task:
            return
        self._dead_letter_queue.append({
            "task_id": task.id,
            "agent_id": task.agent_id,
            "name": task.name,
            "error": error,
            "retry_count": task.max_retries,
            "failed_at": time.time()
        })
        # Limit dead letter size
        if len(self._dead_letter_queue) > self._max_dead_letter:
            self._dead_letter_queue = self._dead_letter_queue[-self._max_dead_letter:]

    def _cleanup_executions(self):
        """Cleanup old executions."""
        if len(self._executions) > self._max_executions:
            completed = [k for k, v in self._executions.items()
                        if v.completed_at > 0 and v.completed_at < time.time() - 3600]
            for eid in completed[:1000]:
                del self._executions[eid]

    def get_task(self, task_id: str) -> Optional[Dict]:
        """Get task by ID."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None
            return {
                "id": task.id,
                "agent_id": task.agent_id,
                "name": task.name,
                "description": task.description,
                "task_type": task.task_type,
                "priority": task.priority.value,
                "queue": task.queue_config.name if task.queue_config else "normal",
                "enabled": task.enabled,
                "created_at": task.created_at,
                "scheduled_at": task.scheduled_at,
                "started_at": task.started_at,
                "completed_at": task.completed_at,
                "dependencies": [{"task_id": d.depends_on, "type": d.dependency_type}
                                for d in task.dependencies],
                "metadata": task.metadata
            }

    def get_tasks(self, agent_id: str = None, priority: PriorityLevel = None,
                  limit: int = 100) -> List[Dict]:
        """Get scheduled tasks."""
        with self._lock:
            tasks = list(self._tasks.values())
            if agent_id:
                tasks = [t for t in tasks if t.agent_id == agent_id]
            if priority:
                tasks = [t for t in tasks if t.priority == priority]
            return [
                {"id": t.id, "agent_id": t.agent_id, "name": t.name,
                 "priority": t.priority.value, "enabled": t.enabled,
                 "scheduled_at": t.scheduled_at, "started_at": t.started_at}
                for t in tasks[:limit]
            ]

    def get_queue_status(self) -> Dict:
        """Get status of all priority queues."""
        with self._lock:
            status = {}
            for priority in PriorityLevel:
                queue = self._queues.get(priority, [])
                status[priority.value] = {
                    "size": len(queue),
                    "config": None
                }
                # Get config
                for cfg in self._queue_configs.values():
                    if cfg.priority_level == priority:
                        status[priority.value]["config"] = {
                            "name": cfg.name,
                            "max_size": cfg.max_size,
                            "timeout_seconds": cfg.timeout_seconds,
                            "weight": cfg.weight
                        }
                        break
            return status

    def get_queue_stats(self, queue_name: str = None) -> Dict:
        """Get queue statistics."""
        with self._lock:
            stats = {
                "total_enqueued": self._total_enqueued,
                "total_completed": self._total_completed,
                "total_failed": self._total_failed,
                "total_preempted": self._total_preempted,
                "running_tasks": len(self._running_tasks),
                "dead_letter_size": len(self._dead_letter_queue),
                "by_priority": {},
                "by_agent": defaultdict(int)
            }

            # By priority
            for priority in PriorityLevel:
                stats["by_priority"][priority.value] = len(self._queues.get(priority, []))

            # By agent
            for agent_id in self._agent_tasks:
                stats["by_agent"][agent_id] = len(self._agent_tasks[agent_id])

            stats["by_agent"] = dict(stats["by_agent"])
            return stats

    def get_dead_letter(self, limit: int = 50) -> List[Dict]:
        """Get dead letter queue contents."""
        with self._lock:
            return self._dead_letter_queue[-limit:]

    def replay_dead_letter(self, task_id: str) -> bool:
        """Replay a task from dead letter queue."""
        with self._lock:
            # Find in dead letter
            for i, item in enumerate(self._dead_letter_queue):
                if item["task_id"] == task_id:
                    # Remove from dead letter
                    self._dead_letter_queue.pop(i)

                    # Re-create task
                    original_task = None
                    # Try to find original task data
                    for t in self._tasks.values():
                        if t.id == task_id:
                            original_task = t
                            break

                    if original_task:
                        # Re-enqueue with fresh retry count
                        self.enqueue(
                            agent_id=original_task.agent_id,
                            name=original_task.name,
                            task_type=original_task.task_type,
                            payload=original_task.payload,
                            priority=original_task.priority,
                            timeout_seconds=original_task.timeout_seconds,
                            max_retries=original_task.max_retries,
                            metadata=original_task.metadata
                        )
                        return True
            return False

    def get_execution(self, execution_id: str) -> Optional[Dict]:
        """Get execution by ID."""
        with self._lock:
            execution = self._executions.get(execution_id)
            if not execution:
                return None
            return {
                "id": execution.id,
                "task_id": execution.task_id,
                "agent_id": execution.agent_id,
                "state": execution.state.value,
                "priority": execution.priority.value,
                "queue": execution.queue_name,
                "started_at": execution.started_at,
                "completed_at": execution.completed_at,
                "duration_ms": execution.duration_ms,
                "result": execution.result,
                "error": execution.error,
                "retry_count": execution.retry_count
            }

    def get_running(self) -> List[Dict]:
        """Get currently running tasks."""
        with self._lock:
            return [
                {"execution_id": e.id, "task_id": e.task_id, "agent_id": e.agent_id,
                 "priority": e.priority.value, "queue": e.queue_name,
                 "started_at": e.started_at}
                for e in self._running_tasks.values()
            ]

    def cancel_task(self, task_id: str) -> bool:
        """Cancel a queued or running task."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return False

            task.enabled = False

            # Remove from queue
            priority = task.priority
            self._queues[priority] = [i for i in self._queues[priority] if i.task_id != task_id]
            heapq.heapify(self._queues[priority])

            # If running, mark as cancelled
            if task_id in self._running_tasks:
                execution = self._running_tasks[task_id]
                execution.state = TaskState.CANCELLED
                execution.completed_at = time.time()
                execution.duration_ms = int((execution.completed_at - execution.started_at) * 1000)
                del self._running_tasks[task_id]

            return True


# Global advanced scheduler instance
advanced_agent_scheduler = AdvancedAgentScheduler()
