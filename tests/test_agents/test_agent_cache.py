"""Tests for agent_cache module"""
import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


class TestAgentCache:
    """Test AgentCache class."""

    def test_agent_cache_init(self):
        """Test AgentCache initialization."""
        from agent_cache import AgentCache
        cache = AgentCache()
        assert cache is not None
        assert hasattr(cache, 'configure')
        assert hasattr(cache, 'set')
        assert hasattr(cache, 'get')

    def test_agent_cache_configure(self):
        """Test cache configuration."""
        from agent_cache import AgentCache
        cache = AgentCache()
        cache.configure(cache_type="memory", max_size=1000, default_ttl=600)
        # Should not raise

    def test_agent_cache_set_get(self):
        """Test setting and getting cache values."""
        from agent_cache import AgentCache
        cache = AgentCache()
        cache.configure(cache_type="memory", max_size=1000, default_ttl=600)
        cache.set("agent1", "key1", "value1")
        result = cache.get("agent1", "key1")
        assert result == "value1"

    def test_agent_cache_delete(self):
        """Test deleting cache values."""
        from agent_cache import AgentCache
        cache = AgentCache()
        cache.configure(cache_type="memory", max_size=1000, default_ttl=600)
        cache.set("agent1", "key1", "value1")
        result = cache.delete("agent1", "key1")
        assert result is True
        assert cache.get("agent1", "key1") is None

    def test_agent_cache_clear_agent(self):
        """Test clearing agent cache."""
        from agent_cache import AgentCache
        cache = AgentCache()
        cache.configure(cache_type="memory", max_size=1000, default_ttl=600)
        cache.set("agent1", "key1", "value1")
        count = cache.clear_agent("agent1")
        assert count >= 0

    def test_agent_cache_clear_all(self):
        """Test clearing all cache."""
        from agent_cache import AgentCache
        cache = AgentCache()
        cache.configure(cache_type="memory", max_size=1000, default_ttl=600)
        cache.set("agent1", "key1", "value1")
        count = cache.clear_all()
        assert count >= 0

    def test_agent_cache_exists(self):
        """Test checking if key exists."""
        from agent_cache import AgentCache
        cache = AgentCache()
        cache.configure(cache_type="memory", max_size=1000, default_ttl=600)
        cache.set("agent1", "key1", "value1")
        assert cache.exists("agent1", "key1") is True
        assert cache.exists("agent1", "nonexistent") is False

    def test_agent_cache_statistics(self):
        """Test getting cache statistics."""
        from agent_cache import AgentCache
        cache = AgentCache()
        cache.configure(cache_type="memory", max_size=1000, default_ttl=600)
        stats = cache.get_statistics()
        assert isinstance(stats, dict)


class TestCacheEnums:
    """Test cache enums."""

    def test_cache_type_enum(self):
        """Test CacheType enum."""
        from agent_cache import CacheType
        # Just test that MEMORY exists and is a string enum
        assert CacheType.MEMORY.value == "memory"
        assert isinstance(CacheType.MEMORY, str)

    def test_cache_strategy_enum(self):
        """Test CacheStrategy enum."""
        from agent_cache import CacheStrategy
        assert CacheStrategy.LRU.value == "lru"
        assert CacheStrategy.LFU.value == "lfu"
        assert CacheStrategy.FIFO.value == "fifo"
