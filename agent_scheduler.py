"""Agent Scheduler Module

Agent task scheduling system with cron, delayed execution, and recurring tasks.
"""
import time
import threading
import uuid
import json
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from collections import defaultdict
import croniter


class ScheduleType(str, Enum):
    """Schedule types."""
    CRON = "cron"
    INTERVAL = "interval"
    DELAYED = "delayed"
    ONE_TIME = "one_time"
    RECURRING = "recurring"


class TaskStatus(str, Enum):
    """Task execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    SCHEDULED = "scheduled"


class TaskPriority(str, Enum):
    """Task priority levels."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


@dataclass
class ScheduleConfig:
    """Schedule configuration."""
    schedule_type: ScheduleType
    cron_expression: str = ""
    interval_seconds: int = 0
    delay_seconds: int = 0
    start_time: float = 0
    end_time: float = 0
    timezone: str = "UTC"


@dataclass
class ScheduledTask:
    """Scheduled task definition."""
    id: str
    agent_id: str
    name: str
    description: str
    task_type: str
    payload: Dict[str, Any]
    schedule: ScheduleConfig
    priority: TaskPriority = TaskPriority.NORMAL
    enabled: bool = True
    max_retries: int = 3
    timeout_seconds: int = 300
    created_at: float = field(default_factory=time.time)
    last_run: float = 0
    next_run: float = 0
    run_count: int = 0


@dataclass
class TaskExecution:
    """Task execution record."""
    id: str
    task_id: str
    agent_id: str
    status: TaskStatus
    started_at: float
    completed_at: float = 0
    duration_ms: int = 0
    result: Dict[str, Any] = field(default_factory=dict)
    error: str = ""
    retry_count: int = 0


class AgentScheduler:
    """Manage agent task scheduling."""

    def __init__(self):
        self._lock = threading.RLock()
        self._tasks: Dict[str, ScheduledTask] = {}
        self._agent_tasks: Dict[str, List[str]] = defaultdict(list)
        self._executions: Dict[str, TaskExecution] = {}
        self._task_queue: List[str] = []
        self._running_tasks: Dict[str, TaskExecution] = {}
        self._max_tasks = 10000
        self._max_executions = 50000
        self._scheduler_thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._check_interval = 1.0  # Check every second

    def _start_scheduler(self):
        """Start the scheduler background thread."""
        if self._scheduler_thread and self._scheduler_thread.is_alive():
            return
        self._stop_event.clear()
        self._scheduler_thread = threading.Thread(target=self._run_scheduler, daemon=True)
        self._scheduler_thread.start()

    def _run_scheduler(self):
        """Main scheduler loop."""
        while not self._stop_event.is_set():
            current_time = time.time()
            with self._lock:
                for task_id, task in list(self._tasks.items()):
                    if not task.enabled:
                        continue
                    if task.next_run <= current_time:
                        self._queue_task(task)
            time.sleep(self._check_interval)

    def _queue_task(self, task: ScheduledTask):
        """Queue a task for execution."""
        if task.id not in self._task_queue:
            self._task_queue.append(task.id)
        task.last_run = time.time()
        task.next_run = self._calculate_next_run(task)
        task.run_count += 1

    def _calculate_next_run(self, task: ScheduledTask) -> float:
        """Calculate next run time based on schedule type."""
        schedule = task.schedule
        if schedule.schedule_type == ScheduleType.CRON and schedule.cron_expression:
            try:
                cron = croniter.croniter(schedule.cron_expression, time.time())
                return cron.get_next()
            except:
                pass
        elif schedule.schedule_type == ScheduleType.INTERVAL:
            return time.time() + schedule.interval_seconds
        elif schedule.schedule_type == ScheduleType.DELAYED:
            return 0  # One-time, don't reschedule
        elif schedule.schedule_type == ScheduleType.RECURRING:
            if schedule.interval_seconds:
                return time.time() + schedule.interval_seconds
        return 0

    def create_task(
        self,
        agent_id: str,
        name: str,
        task_type: str,
        payload: Dict[str, Any],
        schedule: ScheduleConfig,
        description: str = "",
        priority: TaskPriority = TaskPriority.NORMAL,
        max_retries: int = 3,
        timeout_seconds: int = 300
    ) -> str:
        """Create a new scheduled task."""
        with self._lock:
            self._start_scheduler()
            task_id = str(uuid.uuid4())[:12]

            task = ScheduledTask(
                id=task_id,
                agent_id=agent_id,
                name=name,
                description=description,
                task_type=task_type,
                payload=payload,
                schedule=schedule,
                priority=priority,
                max_retries=max_retries,
                timeout_seconds=timeout_seconds,
                next_run=self._calculate_next_run(ScheduleConfig(schedule_type=ScheduleType.DELAYED)) or time.time()
            )

            if schedule.schedule_type == ScheduleType.DELAYED:
                task.next_run = time.time() + schedule.delay_seconds
            elif schedule.start_time:
                task.next_run = schedule.start_time

            self._tasks[task_id] = task
            self._agent_tasks[agent_id].append(task_id)

            # Cleanup old tasks
            if len(self._tasks) > self._max_tasks:
                oldest = min(self._tasks.keys(), key=lambda k: self._tasks[k].created_at)
                self._delete_task_internal(oldest)

            return task_id

    def _delete_task_internal(self, task_id: str):
        """Internal method to delete a task."""
        task = self._tasks.get(task_id)
        if task:
            del self._tasks[task_id]
            if task_id in self._agent_tasks[task.agent_id]:
                self._agent_tasks[task.agent_id].remove(task_id)

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
                "payload": task.payload,
                "schedule": {
                    "type": task.schedule.schedule_type.value,
                    "cron": task.schedule.cron_expression,
                    "interval": task.schedule.interval_seconds,
                    "delay": task.schedule.delay_seconds,
                    "start_time": task.schedule.start_time,
                    "end_time": task.schedule.end_time
                },
                "priority": task.priority.value,
                "enabled": task.enabled,
                "max_retries": task.max_retries,
                "timeout_seconds": task.timeout_seconds,
                "created_at": task.created_at,
                "last_run": task.last_run,
                "next_run": task.next_run,
                "run_count": task.run_count
            }

    def get_tasks(self, agent_id: str = None, enabled: bool = None, limit: int = 100) -> List[Dict]:
        """Get scheduled tasks."""
        with self._lock:
            tasks = list(self._tasks.values())
            if agent_id:
                tasks = [t for t in tasks if t.agent_id == agent_id]
            if enabled is not None:
                tasks = [t for t in tasks if t.enabled == enabled]
            tasks = sorted(tasks, key=lambda t: t.next_run)
            return [
                {"id": t.id, "agent_id": t.agent_id, "name": t.name, "task_type": t.task_type,
                 "priority": t.priority.value, "enabled": t.enabled, "next_run": t.next_run,
                 "last_run": t.last_run, "run_count": t.run_count}
                for t in tasks[:limit]
            ]

    def update_task(
        self,
        task_id: str,
        name: str = None,
        description: str = None,
        payload: Dict[str, Any] = None,
        priority: TaskPriority = None,
        enabled: bool = None,
        max_retries: int = None,
        timeout_seconds: int = None
    ) -> bool:
        """Update a scheduled task."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return False
            if name is not None:
                task.name = name
            if description is not None:
                task.description = description
            if payload is not None:
                task.payload = payload
            if priority is not None:
                task.priority = priority
            if enabled is not None:
                task.enabled = enabled
            if max_retries is not None:
                task.max_retries = max_retries
            if timeout_seconds is not None:
                task.timeout_seconds = timeout_seconds
            return True

    def delete_task(self, task_id: str) -> bool:
        """Delete a scheduled task."""
        with self._lock:
            if task_id not in self._tasks:
                return False
            self._delete_task_internal(task_id)
            return True

    def enable_task(self, task_id: str) -> bool:
        """Enable a scheduled task."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return False
            task.enabled = True
            if task.next_run == 0:
                task.next_run = self._calculate_next_run(task) or time.time()
            return True

    def disable_task(self, task_id: str) -> bool:
        """Disable a scheduled task."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return False
            task.enabled = False
            return True

    def get_pending_tasks(self, limit: int = 50) -> List[Dict]:
        """Get pending tasks from queue."""
        with self._lock:
            pending = []
            for task_id in self._task_queue[:limit]:
                task = self._tasks.get(task_id)
                if task and task.enabled:
                    pending.append({
                        "task_id": task.id,
                        "agent_id": task.agent_id,
                        "name": task.name,
                        "task_type": task.task_type,
                        "payload": task.payload,
                        "priority": task.priority.value,
                        "timeout_seconds": task.timeout_seconds
                    })
            return pending

    def start_task(self, task_id: str) -> Optional[Dict]:
        """Manually start a task."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None

            execution_id = str(uuid.uuid4())[:12]
            execution = TaskExecution(
                id=execution_id,
                task_id=task_id,
                agent_id=task.agent_id,
                status=TaskStatus.RUNNING,
                started_at=time.time()
            )
            self._executions[execution_id] = execution
            self._running_tasks[task_id] = execution

            # Remove from queue
            if task_id in self._task_queue:
                self._task_queue.remove(task_id)

            return {
                "execution_id": execution_id,
                "task_id": task_id,
                "agent_id": task.agent_id,
                "task_type": task.task_type,
                "payload": task.payload,
                "timeout_seconds": task.timeout_seconds
            }

    def complete_task(
        self,
        execution_id: str,
        result: Dict[str, Any],
        status: TaskStatus = TaskStatus.COMPLETED
    ) -> bool:
        """Mark task execution as completed."""
        with self._lock:
            execution = self._executions.get(execution_id)
            if not execution:
                return False

            execution.status = status
            execution.completed_at = time.time()
            execution.duration_ms = int((execution.completed_at - execution.started_at) * 1000)
            execution.result = result

            if execution.task_id in self._running_tasks:
                del self._running_tasks[execution.task_id]

            # Cleanup old executions
            if len(self._executions) > self._max_executions:
                oldest = min(self._executions.keys(), key=lambda k: self._executions[k].started_at)
                del self._executions[oldest]

            return True

    def fail_task(self, execution_id: str, error: str) -> bool:
        """Mark task execution as failed."""
        with self._lock:
            execution = self._executions.get(execution_id)
            if not execution:
                return False

            execution.status = TaskStatus.FAILED
            execution.completed_at = time.time()
            execution.duration_ms = int((execution.completed_at - execution.started_at) * 1000)
            execution.error = error

            if execution.task_id in self._running_tasks:
                del self._running_tasks[execution.task_id]

            return True

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
                "status": execution.status.value,
                "started_at": execution.started_at,
                "completed_at": execution.completed_at,
                "duration_ms": execution.duration_ms,
                "result": execution.result,
                "error": execution.error,
                "retry_count": execution.retry_count
            }

    def get_executions(
        self,
        task_id: str = None,
        agent_id: str = None,
        status: TaskStatus = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get execution history."""
        with self._lock:
            executions = list(self._executions.values())
            if task_id:
                executions = [e for e in executions if e.task_id == task_id]
            if agent_id:
                executions = [e for e in executions if e.agent_id == agent_id]
            if status:
                executions = [e for e in executions if e.status == status]
            executions = sorted(executions, key=lambda e: e.started_at, reverse=True)
            return [
                {"id": e.id, "task_id": e.task_id, "agent_id": e.agent_id, "status": e.status.value,
                 "started_at": e.started_at, "completed_at": e.completed_at, "duration_ms": e.duration_ms,
                 "error": e.error}
                for e in executions[:limit]
            ]

    def get_statistics(self) -> Dict:
        """Get scheduler statistics."""
        with self._lock:
            total_tasks = len(self._tasks)
            enabled_tasks = sum(1 for t in self._tasks.values() if t.enabled)
            total_executions = len(self._executions)
            running = sum(1 for e in self._executions.values() if e.status == TaskStatus.RUNNING)
            completed = sum(1 for e in self._executions.values() if e.status == TaskStatus.COMPLETED)
            failed = sum(1 for e in self._executions.values() if e.status == TaskStatus.FAILED)

            by_priority = defaultdict(int)
            by_type = defaultdict(int)
            for t in self._tasks.values():
                by_priority[t.priority.value] += 1
                by_type[t.schedule.schedule_type.value] += 1

            return {
                "total_tasks": total_tasks,
                "enabled_tasks": enabled_tasks,
                "total_executions": total_executions,
                "running_tasks": running,
                "completed_tasks": completed,
                "failed_tasks": failed,
                "pending_queue_size": len(self._task_queue),
                "tasks_by_priority": dict(by_priority),
                "tasks_by_type": dict(by_type),
                "agents_with_tasks": len(self._agent_tasks)
            }

    def shutdown(self):
        """Shutdown the scheduler."""
        self._stop_event.set()
        if self._scheduler_thread:
            self._scheduler_thread.join(timeout=5)


# Global agent scheduler instance
agent_scheduler = AgentScheduler()
