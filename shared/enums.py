"""Shared Enums Module

Unified enum definitions across all agent modules.
"""
from enum import Enum


class QueueType(str, Enum):
    """Queue types."""
    FIFO = "fifo"
    LIFO = "lifo"
    PRIORITY = "priority"
    DELAYED = "delayed"
    RABBITMQ = "rabbitmq"
    KAFKA = "kafka"


class TaskState(str, Enum):
    """Task queue states."""
    QUEUED = "queued"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"
    PENDING = "pending"
    RUNNING = "running"
    RETRY = "retry"
    PAUSED = "paused"
    BLOCKED = "blocked"


class QueueStatus(str, Enum):
    """Queue status."""
    ACTIVE = "active"
    PAUSED = "paused"
    DRAINING = "draining"
    STOPPED = "stopped"
    INITIALIZING = "initializing"
    ERROR = "error"


class DeliveryMode(str, Enum):
    """Message delivery modes."""
    PERSISTENT = "persistent"
    NON_PERSISTENT = "non_persistent"


class ConsumerType(str, Enum):
    """Consumer types."""
    FIFO = "fifo"
    BROADCAST = "broadcast"
    PARTITIONED = "partitioned"


class PriorityLevel(str, Enum):
    """Priority levels for task queue."""
    CRITICAL = "critical"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"
    BATCH = "batch"


class QueueStrategy(str, Enum):
    """Queue selection strategies."""
    PRIORITY = "priority"
    FAIR_SHARE = "fair_share"
    ROUND_ROBIN = "round_robin"
    FIFO = "fifo"
    LIFO = "lifo"
