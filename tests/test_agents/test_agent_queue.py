"""Tests for agent_queue module"""
import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


class TestAgentQueue:
    """Test AgentQueue class."""

    def test_agent_queue_init(self):
        """Test AgentQueue initialization."""
        from agent_queue import AgentQueue
        queue = AgentQueue()
        assert queue is not None
        assert hasattr(queue, 'create_queue')
        assert hasattr(queue, 'get_queue')
        assert hasattr(queue, 'list_queues')

    def test_agent_queue_create(self):
        """Test creating a queue."""
        from agent_queue import AgentQueue
        queue = AgentQueue()
        result = queue.create_queue("test-queue", queue_type="fifo")
        assert result == "test-queue"

    def test_agent_queue_get(self):
        """Test getting queue info."""
        from agent_queue import AgentQueue
        queue = AgentQueue()
        queue.create_queue("test-queue")
        info = queue.get_queue("test-queue")
        assert info is not None
        assert info["name"] == "test-queue"

    def test_agent_queue_list(self):
        """Test listing queues."""
        from agent_queue import AgentQueue
        queue = AgentQueue()
        queue.create_queue("queue1")
        queue.create_queue("queue2")
        queues = queue.list_queues()
        assert len(queues) >= 2

    def test_agent_queue_not_found(self):
        """Test getting non-existent queue."""
        from agent_queue import AgentQueue
        queue = AgentQueue()
        info = queue.get_queue("nonexistent")
        assert info is None


class TestAgentQueuePriority:
    """Test priority queue functionality."""

    def test_priority_queue_create(self):
        """Test creating priority queue."""
        from agent_queue import AgentQueue
        queue = AgentQueue()
        result = queue.create_queue("priority-queue", queue_type="priority", priority_levels=5)
        assert result == "priority-queue"

    def test_lifo_queue_create(self):
        """Test creating LIFO queue."""
        from agent_queue import AgentQueue
        queue = AgentQueue()
        result = queue.create_queue("lifo-queue", queue_type="lifo")
        assert result == "lifo-queue"
