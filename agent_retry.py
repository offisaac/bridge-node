"""Agent Retry Module

Agent automatic retry logic with backoff strategies and failure handling.
"""
import time
import threading
import uuid
import random
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from collections import defaultdict


class RetryStrategy(str, Enum):
    """Retry strategies."""
    FIXED = "fixed"
    LINEAR = "linear"
    EXPONENTIAL = "exponential"
    FIBONACCI = "fibonacci"
    EXPONENTIAL_WITH_JITTER = "exponential_with_jitter"
    LINEAR_WITH_JITTER = "linear_with_jitter"


class RetryState(str, Enum):
    """Retry states."""
    PENDING = "pending"
    RETRYING = "retrying"
    SUCCESS = "success"
    FAILED = "failed"
    CANCELLED = "cancelled"
    EXHAUSTED = "exhausted"


class RetryAction(str, Enum):
    """Actions that can be retried."""
    API_CALL = "api_call"
    TASK_EXECUTION = "task_execution"
    DATA_SYNC = "data_sync"
    NETWORK_REQUEST = "network_request"
    DATABASE_OPERATION = "database_operation"


@dataclass
class RetryPolicy:
    """Retry policy configuration."""
    max_attempts: int = 3
    initial_delay_ms: int = 1000
    max_delay_ms: int = 60000
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL
    retryable_errors: List[str] = field(default_factory=list)
    non_retryable_errors: List[str] = field(default_factory=list)
    timeout_seconds: int = 300


@dataclass
class RetryAttempt:
    """Individual retry attempt."""
    attempt_number: int
    started_at: float
    completed_at: float = 0
    duration_ms: int = 0
    success: bool = False
    error: str = ""
    error_type: str = ""


@dataclass
class RetryTask:
    """Retry task definition."""
    id: str
    agent_id: str
    action: RetryAction
    payload: Dict[str, Any]
    policy: RetryPolicy
    state: RetryState
    attempts: List[RetryAttempt] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    started_at: float = 0
    completed_at: float = 0
    total_duration_ms: int = 0
    result: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)


class AgentRetryManager:
    """Manage agent retry logic."""

    def __init__(self):
        self._lock = threading.RLock()
        self._retry_tasks: Dict[str, RetryTask] = {}
        self._agent_retries: Dict[str, List[str]] = defaultdict(list)
        self._task_handlers: Dict[str, Callable] = {}
        self._default_policy = RetryPolicy()

    def configure_default(
        self,
        max_attempts: int = 3,
        initial_delay_ms: int = 1000,
        max_delay_ms: int = 60000,
        strategy: str = "exponential"
    ):
        """Configure default retry policy."""
        with self._lock:
            self._default_policy = RetryPolicy(
                max_attempts=max_attempts,
                initial_delay_ms=initial_delay_ms,
                max_delay_ms=max_delay_ms,
                strategy=RetryStrategy(strategy)
            )

    def register_handler(self, action: RetryAction, handler: Callable):
        """Register a retry handler for an action type."""
        with self._lock:
            self._task_handlers[action.value] = handler

    def _calculate_delay(self, policy: RetryPolicy, attempt: int) -> float:
        """Calculate delay based on strategy."""
        delay_ms = policy.initial_delay_ms

        if policy.strategy == RetryStrategy.FIXED:
            delay_ms = policy.initial_delay_ms
        elif policy.strategy == RetryStrategy.LINEAR:
            delay_ms = policy.initial_delay_ms * attempt
        elif policy.strategy == RetryStrategy.EXPONENTIAL:
            delay_ms = policy.initial_delay_ms * (2 ** (attempt - 1))
        elif policy.strategy == RetryStrategy.FIBONACCI:
            a, b = 1, 1
            for _ in range(attempt - 1):
                a, b = b, a + b
            delay_ms = policy.initial_delay_ms * a
        elif policy.strategy == RetryStrategy.EXPONENTIAL_WITH_JITTER:
            base_delay = policy.initial_delay_ms * (2 ** (attempt - 1))
            jitter = random.uniform(0, 0.3) * base_delay
            delay_ms = base_delay + jitter
        elif policy.strategy == RetryStrategy.LINEAR_WITH_JITTER:
            base_delay = policy.initial_delay_ms * attempt
            jitter = random.uniform(0, 0.3) * base_delay
            delay_ms = base_delay + jitter

        # Cap at max delay
        return min(delay_ms, policy.max_delay_ms) / 1000.0

    def _is_retryable(self, error: str, policy: RetryPolicy) -> bool:
        """Check if error is retryable."""
        # Check non-retryable list first
        for non_retryable in policy.non_retryable_errors:
            if non_retryable.lower() in error.lower():
                return False

        # If retryable_errors is empty, all errors are retryable
        if not policy.retryable_errors:
            return True

        # Check retryable list
        for retryable in policy.retryable_errors:
            if retryable.lower() in error.lower():
                return True

        return False

    def start_retry(
        self,
        agent_id: str,
        action: str,
        payload: Dict[str, Any],
        policy: RetryPolicy = None,
        metadata: Dict[str, Any] = None
    ) -> str:
        """Start a retryable task."""
        with self._lock:
            task_id = str(uuid.uuid4())[:12]
            policy = policy or self._default_policy

            task = RetryTask(
                id=task_id,
                agent_id=agent_id,
                action=RetryAction(action),
                payload=payload,
                policy=policy,
                state=RetryState.PENDING,
                started_at=time.time(),
                metadata=metadata or {}
            )

            self._retry_tasks[task_id] = task
            self._agent_retries[agent_id].append(task_id)

            # Start execution in background
            threading.Thread(target=self._execute_with_retry, args=(task_id,), daemon=True).start()

            return task_id

    def _execute_with_retry(self, task_id: str):
        """Execute task with retry logic."""
        task = self._retry_tasks.get(task_id)
        if not task:
            return

        task.state = RetryState.RETRYING
        task.started_at = time.time()

        for attempt_num in range(1, task.policy.max_attempts + 1):
            # Check if task was cancelled
            if task.state == RetryState.CANCELLED:
                return

            attempt = RetryAttempt(
                attempt_number=attempt_num,
                started_at=time.time()
            )

            try:
                # Get and execute handler
                handler = self._task_handlers.get(task.action.value)
                if handler:
                    result = handler(task.payload, attempt_num)
                else:
                    # Simulate execution if no handler
                    time.sleep(0.1)
                    result = {"status": "success", "message": "Simulated success"}

                # Success
                attempt.success = True
                attempt.completed_at = time.time()
                attempt.duration_ms = int((attempt.completed_at - attempt.started_at) * 1000)
                task.attempts.append(attempt)
                task.result = result
                task.state = RetryState.SUCCESS
                task.completed_at = time.time()
                task.total_duration_ms = int((task.completed_at - task.started_at) * 1000)
                return

            except Exception as e:
                error_msg = str(e)
                attempt.success = False
                attempt.error = error_msg
                attempt.error_type = type(e).__name__
                attempt.completed_at = time.time()
                attempt.duration_ms = int((attempt.completed_at - attempt.started_at) * 1000)
                task.attempts.append(attempt)

                # Check if should retry
                if not self._is_retryable(error_msg, task.policy):
                    task.state = RetryState.FAILED
                    task.completed_at = time.time()
                    task.total_duration_ms = int((task.completed_at - task.started_at) * 1000)
                    return

                # Check if more attempts available
                if attempt_num < task.policy.max_attempts:
                    delay = self._calculate_delay(task.policy, attempt_num)
                    time.sleep(delay)

        # All attempts exhausted
        task.state = RetryState.EXHAUSTED
        task.completed_at = time.time()
        task.total_duration_ms = int((task.completed_at - task.started_at) * 1000)

    def get_retry_task(self, task_id: str) -> Optional[Dict]:
        """Get retry task status."""
        with self._lock:
            task = self._retry_tasks.get(task_id)
            if not task:
                return None

            return {
                "id": task.id,
                "agent_id": task.agent_id,
                "action": task.action.value,
                "state": task.state.value,
                "policy": {
                    "max_attempts": task.policy.max_attempts,
                    "initial_delay_ms": task.policy.initial_delay_ms,
                    "max_delay_ms": task.policy.max_delay_ms,
                    "strategy": task.policy.strategy.value
                },
                "attempts": [
                    {
                        "attempt_number": a.attempt_number,
                        "started_at": a.started_at,
                        "completed_at": a.completed_at,
                        "duration_ms": a.duration_ms,
                        "success": a.success,
                        "error": a.error,
                        "error_type": a.error_type
                    }
                    for a in task.attempts
                ],
                "created_at": task.created_at,
                "started_at": task.started_at,
                "completed_at": task.completed_at,
                "total_duration_ms": task.total_duration_ms,
                "result": task.result,
                "metadata": task.metadata
            }

    def get_agent_retries(self, agent_id: str, limit: int = 100) -> List[Dict]:
        """Get retry tasks for an agent."""
        with self._lock:
            task_ids = self._agent_retries.get(agent_id, [])[:limit]
            return [self.get_retry_task(tid) for tid in task_ids if tid in self._retry_tasks]

    def cancel_retry(self, task_id: str) -> bool:
        """Cancel a retry task."""
        with self._lock:
            task = self._retry_tasks.get(task_id)
            if not task:
                return False

            if task.state in (RetryState.SUCCESS, RetryState.FAILED, RetryState.EXHAUSTED):
                return False

            task.state = RetryState.CANCELLED
            task.completed_at = time.time()
            return True

    def get_statistics(self) -> Dict:
        """Get retry statistics."""
        with self._lock:
            total = len(self._retry_tasks)
            success = sum(1 for t in self._retry_tasks.values() if t.state == RetryState.SUCCESS)
            failed = sum(1 for t in self._retry_tasks.values() if t.state == RetryState.FAILED)
            exhausted = sum(1 for t in self._retry_tasks.values() if t.state == RetryState.EXHAUSTED)
            cancelled = sum(1 for t in self._retry_tasks.values() if t.state == RetryState.CANCELLED)
            retrying = sum(1 for t in self._retry_tasks.values() if t.state == RetryState.RETRYING)

            total_attempts = sum(len(t.attempts) for t in self._retry_tasks.values())
            avg_attempts = total_attempts / total if total > 0 else 0

            total_duration = sum(t.total_duration_ms for t in self._retry_tasks.values())
            avg_duration = total_duration / total if total > 0 else 0

            by_action = defaultdict(int)
            by_strategy = defaultdict(int)
            for task in self._retry_tasks.values():
                by_action[task.action.value] += 1
                by_strategy[task.policy.strategy.value] += 1

            return {
                "total_tasks": total,
                "success": success,
                "failed": failed,
                "exhausted": exhausted,
                "cancelled": cancelled,
                "retrying": retrying,
                "success_rate_percent": round(success / total * 100, 2) if total > 0 else 0,
                "total_attempts": total_attempts,
                "avg_attempts_per_task": round(avg_attempts, 2),
                "avg_duration_ms": int(avg_duration),
                "tasks_by_action": dict(by_action),
                "tasks_by_strategy": dict(by_strategy),
                "agents_with_retries": len(self._agent_retries)
            }


# Global agent retry instance
agent_retry = AgentRetryManager()
