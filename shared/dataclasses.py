"""Shared Dataclasses Module

Unified dataclass definitions across all agent modules.
"""
from dataclasses import dataclass, field
from typing import Dict, Any, Optional
import time

from .enums import QueueType, TaskState, QueueStatus


@dataclass
class QueueConfig:
    """Queue configuration."""
    queue_type: QueueType
    max_size: int = 10000
    max_retries: int = 3
    visibility_timeout: int = 300
    delay_seconds: int = 0
    priority_levels: int = 10


@dataclass
class QueueTask:
    """Task in queue."""
    id: str
    agent_id: str
    task_type: str
    payload: Dict[str, Any]
    priority: int = 0
    state: TaskState = TaskState.QUEUED
    created_at: float = field(default_factory=time.time)
    scheduled_at: float = 0
    started_at: float = 0
    completed_at: float = 0
    retry_count: int = 0
    max_retries: int = 3
    visibility_timeout: int = 300
    result: Dict[str, Any] = field(default_factory=dict)
    error: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class QueueMetrics:
    """Queue metrics."""
    enqueued_count: int = 0
    dequeued_count: int = 0
    completed_count: int = 0
    failed_count: int = 0
    timeout_count: int = 0
    retry_count: int = 0
    avg_wait_time_ms: int = 0
    avg_process_time_ms: int = 0


@dataclass
class TaskConfig:
    """Task configuration."""
    task_type: str
    timeout: int = 300
    retry_policy: str = "default"
    priority: int = 0
    max_retries: int = 3
    metadata: Dict[str, Any] = field(default_factory=dict)
