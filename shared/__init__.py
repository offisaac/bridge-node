"""Shared Module

Unified definitions for all agent modules.
"""
from .enums import (
    QueueType,
    TaskState,
    QueueStatus,
    DeliveryMode,
    ConsumerType,
    PriorityLevel,
    QueueStrategy,
)

from .dataclasses import (
    QueueConfig,
    QueueTask,
    QueueMetrics,
    TaskConfig,
)

__all__ = [
    # Enums
    "QueueType",
    "TaskState",
    "QueueStatus",
    "DeliveryMode",
    "ConsumerType",
    "PriorityLevel",
    "QueueStrategy",
    # Dataclasses
    "QueueConfig",
    "QueueTask",
    "QueueMetrics",
    "TaskConfig",
]
