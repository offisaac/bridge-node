"""Agent Queue Module

Agent task queue manager with priority queuing, dead letter queue, and monitoring.
"""
import time
import threading
import uuid
import json
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from collections import defaultdict
import heapq

from shared import (
    QueueType,
    TaskState,
    QueueStatus,
    QueueConfig,
    QueueTask,
    QueueMetrics,
)


class AgentQueue:
    """Manage agent task queues."""

    def __init__(self):
        self._lock = threading.RLock()
        self._queues: Dict[str, Dict] = {}
        self._tasks: Dict[str, QueueTask] = {}
        self._agent_queues: Dict[str, List[str]] = defaultdict(list)
        self._dead_letter: List[str] = []
        self._max_dead_letter = 5000
        self._default_config = QueueConfig(QueueType.FIFO)

    def create_queue(
        self,
        name: str,
        queue_type: str = "fifo",
        max_size: int = 10000,
        max_retries: int = 3,
        visibility_timeout: int = 300,
        delay_seconds: int = 0,
        priority_levels: int = 10
    ) -> str:
        """Create a new queue."""
        with self._lock:
            if name in self._queues:
                return name

            q_type = QueueType(queue_type)
            config = QueueConfig(
                queue_type=q_type,
                max_size=max_size,
                max_retries=max_retries,
                visibility_timeout=visibility_timeout,
                delay_seconds=delay_seconds,
                priority_levels=priority_levels
            )

            self._queues[name] = {
                "name": name,
                "config": config,
                "status": QueueStatus.ACTIVE,
                "task_ids": [],
                "priority_heap": [],
                "metrics": QueueMetrics()
            }
            return name

    def get_queue(self, name: str) -> Optional[Dict]:
        """Get queue info."""
        with self._lock:
            queue = self._queues.get(name)
            if not queue:
                return None
            return {
                "name": queue["name"],
                "type": queue["config"].queue_type.value,
                "max_size": queue["config"].max_size,
                "max_retries": queue["config"].max_retries,
                "visibility_timeout": queue["config"].visibility_timeout,
                "status": queue["status"].value,
                "size": len(queue["task_ids"]),
                "metrics": {
                    "enqueued": queue["metrics"].enqueued_count,
                    "dequeued": queue["metrics"].dequeued_count,
                    "completed": queue["metrics"].completed_count,
                    "failed": queue["metrics"].failed_count,
                    "timeout": queue["metrics"].timeout_count,
                    "retry": queue["metrics"].retry_count
                }
            }

    def list_queues(self) -> List[Dict]:
        """List all queues."""
        with self._lock:
            return [self.get_queue(name) for name in self._queues.keys()]

    def delete_queue(self, name: str) -> bool:
        """Delete a queue."""
        with self._lock:
            if name not in self._queues:
                return False
            queue = self._queues[name]
            for task_id in queue["task_ids"]:
                if task_id in self._tasks:
                    del self._tasks[task_id]
            del self._queues[name]
            return True

    def enqueue(
        self,
        queue_name: str,
        agent_id: str,
        task_type: str,
        payload: Dict[str, Any],
        priority: int = 0,
        delay_seconds: int = 0,
        max_retries: int = None,
        metadata: Dict[str, Any] = None
    ) -> Optional[str]:
        """Add task to queue."""
        with self._lock:
            queue = self._queues.get(queue_name)
            if not queue:
                return None

            if len(queue["task_ids"]) >= queue["config"].max_size:
                return None

            task_id = str(uuid.uuid4())[:12]
            visibility_timeout = queue["config"].visibility_timeout
            max_retries = max_retries or queue["config"].max_retries

            task = QueueTask(
                id=task_id,
                agent_id=agent_id,
                task_type=task_type,
                payload=payload,
                priority=priority,
                scheduled_at=time.time() + delay_seconds,
                max_retries=max_retries,
                visibility_timeout=visibility_timeout,
                metadata=metadata or {}
            )

            self._tasks[task_id] = task
            queue["task_ids"].append(task_id)
            queue["metrics"].enqueued_count += 1

            if queue["config"].queue_type == QueueType.PRIORITY:
                heapq.heappush(queue["priority_heap"], (-priority, task_id))

            self._agent_queues[agent_id].append(task_id)
            return task_id

    def dequeue(self, queue_name: str, agent_id: str = None) -> Optional[Dict]:
        """Get next task from queue."""
        with self._lock:
            queue = self._queues.get(queue_name)
            if not queue:
                return None

            if queue["status"] != QueueStatus.ACTIVE:
                return None

            current_time = time.time()
            task_id = None

            if queue["config"].queue_type == QueueType.PRIORITY:
                while queue["priority_heap"]:
                    _, tid = heapq.heappop(queue["priority_heap"])
                    task = self._tasks.get(tid)
                    if task and task.state == TaskState.QUEUED and task.scheduled_at <= current_time:
                        task_id = tid
                        break
            else:
                for tid in queue["task_ids"]:
                    task = self._tasks.get(tid)
                    if task and task.state == TaskState.QUEUED and task.scheduled_at <= current_time:
                        task_id = tid
                        break

            if not task_id:
                return None

            task = self._tasks[task_id]
            task.state = TaskState.PROCESSING
            task.started_at = current_time

            queue["task_ids"].remove(task_id)
            queue["metrics"].dequeued_count += 1

            return {
                "task_id": task.id,
                "agent_id": task.agent_id,
                "task_type": task.task_type,
                "payload": task.payload,
                "priority": task.priority,
                "retry_count": task.retry_count,
                "visibility_timeout": task.visibility_timeout,
                "metadata": task.metadata
            }

    def complete(
        self,
        task_id: str,
        result: Dict[str, Any]
    ) -> bool:
        """Mark task as completed."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return False

            task.state = TaskState.COMPLETED
            task.completed_at = time.time()
            task.result = result

            for queue in self._queues.values():
                if task_id in queue["metrics"].__dict__:
                    queue["metrics"].completed_count += 1

            return True

    def fail(
        self,
        task_id: str,
        error: str,
        to_dead_letter: bool = False
    ) -> bool:
        """Mark task as failed."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return False

            if to_dead_letter or task.retry_count >= task.max_retries:
                task.state = TaskState.FAILED
                self._dead_letter.append(task_id)
                if len(self._dead_letter) > self._max_dead_letter:
                    self._dead_letter.pop(0)
            else:
                task.retry_count += 1
                task.state = TaskState.QUEUED
                task.scheduled_at = time.time()

                for queue in self._queues.values():
                    if queue["config"].queue_type == QueueType.PRIORITY:
                        heapq.heappush(queue["priority_heap"], (-task.priority, task_id))
                    else:
                        queue["task_ids"].append(task_id)

                for q in self._queues.values():
                    q["metrics"].retry_count += 1

            task.error = error
            task.completed_at = time.time()
            return True

    def cancel(self, task_id: str) -> bool:
        """Cancel a task."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return False

            task.state = TaskState.CANCELLED
            task.completed_at = time.time()
            return True

    def get_task(self, task_id: str) -> Optional[Dict]:
        """Get task info."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return None
            return {
                "id": task.id,
                "agent_id": task.agent_id,
                "task_type": task.task_type,
                "payload": task.payload,
                "priority": task.priority,
                "state": task.state.value,
                "created_at": task.created_at,
                "scheduled_at": task.scheduled_at,
                "started_at": task.started_at,
                "completed_at": task.completed_at,
                "retry_count": task.retry_count,
                "max_retries": task.max_retries,
                "result": task.result,
                "error": task.error,
                "metadata": task.metadata
            }

    def get_queue_tasks(
        self,
        queue_name: str,
        state: TaskState = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get tasks in a queue."""
        with self._lock:
            queue = self._queues.get(queue_name)
            if not queue:
                return []

            tasks = []
            for task_id in queue["task_ids"]:
                task = self._tasks.get(task_id)
                if task:
                    if state is None or task.state == state:
                        tasks.append(self.get_task(task_id))
                        if len(tasks) >= limit:
                            break
            return tasks

    def get_agent_tasks(
        self,
        agent_id: str,
        state: TaskState = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get tasks for an agent."""
        with self._lock:
            task_ids = self._agent_queues.get(agent_id, [])
            tasks = []
            for task_id in task_ids:
                task = self._tasks.get(task_id)
                if task:
                    if state is None or task.state == state:
                        tasks.append(self.get_task(task_id))
                        if len(tasks) >= limit:
                            break
            return tasks

    def get_dead_letter(self, limit: int = 100) -> List[Dict]:
        """Get dead letter queue tasks."""
        with self._lock:
            return [self.get_task(tid) for tid in self._dead_letter[-limit:] if tid in self._tasks]

    def requeue_dead_letter(self, task_id: str, queue_name: str) -> bool:
        """Requeue a task from dead letter."""
        with self._lock:
            if task_id not in self._dead_letter:
                return False

            task = self._tasks.get(task_id)
            if not task:
                return False

            self._dead_letter.remove(task_id)
            task.retry_count = 0
            task.state = TaskState.QUEUED
            task.error = ""
            task.result = {}

            queue = self._queues.get(queue_name)
            if not queue:
                return False

            queue["task_ids"].append(task_id)
            return True

    def pause_queue(self, queue_name: str) -> bool:
        """Pause a queue."""
        with self._lock:
            queue = self._queues.get(queue_name)
            if not queue:
                return False
            queue["status"] = QueueStatus.PAUSED
            return True

    def resume_queue(self, queue_name: str) -> bool:
        """Resume a queue."""
        with self._lock:
            queue = self._queues.get(queue_name)
            if not queue:
                return False
            queue["status"] = QueueStatus.ACTIVE
            return True

    def drain_queue(self, queue_name: str) -> int:
        """Drain a queue (get all tasks)."""
        with self._lock:
            queue = self._queues.get(queue_name)
            if not queue:
                return 0

            queue["status"] = QueueStatus.DRAINING
            count = len(queue["task_ids"])
            return count

    def get_statistics(self) -> Dict:
        """Get queue statistics."""
        with self._lock:
            total_tasks = len(self._tasks)
            queued = sum(1 for t in self._tasks.values() if t.state == TaskState.QUEUED)
            processing = sum(1 for t in self._tasks.values() if t.state == TaskState.PROCESSING)
            completed = sum(1 for t in self._tasks.values() if t.state == TaskState.COMPLETED)
            failed = sum(1 for t in self._tasks.values() if t.state == TaskState.FAILED)
            dead_letter = len(self._dead_letter)

            by_state = defaultdict(int)
            for t in self._tasks.values():
                by_state[t.state.value] += 1

            return {
                "total_tasks": total_tasks,
                "queued_tasks": queued,
                "processing_tasks": processing,
                "completed_tasks": completed,
                "failed_tasks": failed,
                "dead_letter_size": dead_letter,
                "total_queues": len(self._queues),
                "active_queues": sum(1 for q in self._queues.values() if q["status"] == QueueStatus.ACTIVE),
                "tasks_by_state": dict(by_state),
                "agents_with_tasks": len(self._agent_queues)
            }


# Global agent queue instance
agent_queue = AgentQueue()
