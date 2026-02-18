"""Tests for shared enums module."""
import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from shared.enums import (
    QueueType,
    TaskState,
    QueueStatus,
    DeliveryMode,
    ConsumerType,
    PriorityLevel,
    QueueStrategy,
)


class TestQueueType:
    """Test QueueType enum."""

    def test_queue_type_values(self):
        """Test QueueType has correct values."""
        assert QueueType.FIFO.value == "fifo"
        assert QueueType.LIFO.value == "lifo"
        assert QueueType.PRIORITY.value == "priority"
        assert QueueType.DELAYED.value == "delayed"
        assert QueueType.RABBITMQ.value == "rabbitmq"
        assert QueueType.KAFKA.value == "kafka"

    def test_queue_type_is_string_enum(self):
        """Test QueueType inherits from str."""
        assert isinstance(QueueType.FIFO, str)


class TestTaskState:
    """Test TaskState enum."""

    def test_task_state_values(self):
        """Test TaskState has correct values."""
        assert TaskState.QUEUED.value == "queued"
        assert TaskState.PROCESSING.value == "processing"
        assert TaskState.COMPLETED.value == "completed"
        assert TaskState.FAILED.value == "failed"
        assert TaskState.TIMEOUT.value == "timeout"

    def test_task_state_is_string_enum(self):
        """Test TaskState inherits from str."""
        assert isinstance(TaskState.COMPLETED, str)


class TestQueueStatus:
    """Test QueueStatus enum."""

    def test_queue_status_values(self):
        """Test QueueStatus has correct values."""
        assert QueueStatus.ACTIVE.value == "active"
        assert QueueStatus.PAUSED.value == "paused"
        assert QueueStatus.STOPPED.value == "stopped"


class TestPriorityLevel:
    """Test PriorityLevel enum."""

    def test_priority_level_values(self):
        """Test PriorityLevel has correct values."""
        assert PriorityLevel.LOW.value == "low"
        assert PriorityLevel.NORMAL.value == "normal"
        assert PriorityLevel.HIGH.value == "high"
        assert PriorityLevel.CRITICAL.value == "critical"
