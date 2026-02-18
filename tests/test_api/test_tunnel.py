"""Tests for tunnel_config module"""
import pytest
import os
import json
import tempfile
from unittest.mock import patch, MagicMock

# Mock the config file paths to use temp directory
temp_dir = tempfile.mkdtemp()


class TestTunnelConfig:
    """Test TunnelConfig class."""

    def test_tunnel_config_init(self):
        """Test TunnelConfig initialization."""
        from tunnel_config import TunnelConfig

        config = TunnelConfig(
            id="test-tunnel",
            name="Test Tunnel",
            description="A test tunnel",
            ssh_host="example.com",
            ssh_user="testuser",
            local_port=8080,
            remote_port=80,
            service_type="http"
        )

        assert config.id == "test-tunnel"
        assert config.name == "Test Tunnel"
        assert config.ssh_host == "example.com"
        assert config.local_port == 8080
        assert config.remote_port == 80
        assert config.service_type == "http"

    def test_tunnel_config_defaults(self):
        """Test TunnelConfig default values."""
        from tunnel_config import TunnelConfig

        config = TunnelConfig(
            id="test",
            name="Test",
            description="Test",
            ssh_host="example.com",
            ssh_user="user",
            local_port=3306
        )

        assert config.ssh_port == 22
        assert config.remote_host == "localhost"
        assert config.remote_port == 3306
        assert config.service_type == "custom"
        assert config.auto_connect is False

    def test_to_dict(self):
        """Test converting to dictionary."""
        from tunnel_config import TunnelConfig

        config = TunnelConfig(
            id="test-id",
            name="Test Name",
            description="Test Description",
            ssh_host="example.com",
            ssh_user="testuser",
            local_port=8080,
            remote_port=80,
            service_type="http"
        )

        data = config.to_dict()

        assert data["id"] == "test-id"
        assert data["name"] == "Test Name"
        assert data["ssh_host"] == "example.com"
        assert data["local_port"] == 8080
        assert "created_at" in data
        assert "updated_at" in data

    def test_from_dict(self):
        """Test creating from dictionary."""
        from tunnel_config import TunnelConfig

        data = {
            "id": "from-dict",
            "name": "From Dict",
            "description": "Created from dict",
            "ssh_host": "server.com",
            "ssh_user": "admin",
            "ssh_port": 2222,
            "local_port": 9000,
            "remote_host": "remote.host",
            "remote_port": 5432,
            "service_type": "postgres",
            "auto_connect": True
        }

        config = TunnelConfig.from_dict(data)

        assert config.id == "from-dict"
        assert config.ssh_port == 2222
        assert config.remote_host == "remote.host"
        assert config.remote_port == 5432
        assert config.service_type == "postgres"
        assert config.auto_connect is True

    def test_from_dict_minimal(self):
        """Test creating from minimal dictionary."""
        from tunnel_config import TunnelConfig

        data = {
            "id": "minimal",
            "name": "Minimal",
            "description": "Minimal config",
            "ssh_host": "host.com",
            "ssh_user": "user",
            "local_port": 8080
        }

        config = TunnelConfig.from_dict(data)

        assert config.id == "minimal"
        assert config.ssh_port == 22  # default


class TestDefaultTemplates:
    """Test default tunnel templates."""

    def test_default_templates_exist(self):
        """Test default templates are defined."""
        from tunnel_config import DEFAULT_TEMPLATES

        assert isinstance(DEFAULT_TEMPLATES, list)
        assert len(DEFAULT_TEMPLATES) > 0

    def test_mysql_template(self):
        """Test MySQL template."""
        from tunnel_config import DEFAULT_TEMPLATES

        mysql = next((t for t in DEFAULT_TEMPLATES if t["id"] == "mysql"), None)
        assert mysql is not None
        assert mysql["local_port"] == 3306
        assert mysql["service_type"] == "mysql"

    def test_redis_template(self):
        """Test Redis template."""
        from tunnel_config import DEFAULT_TEMPLATES

        redis = next((t for t in DEFAULT_TEMPLATES if t["id"] == "redis"), None)
        assert redis is not None
        assert redis["local_port"] == 6379
        assert redis["service_type"] == "redis"

    def test_postgres_template(self):
        """Test PostgreSQL template."""
        from tunnel_config import DEFAULT_TEMPLATES

        postgres = next((t for t in DEFAULT_TEMPLATES if t["id"] == "postgres"), None)
        assert postgres is not None
        assert postgres["local_port"] == 5432
        assert postgres["service_type"] == "postgres"

    def test_jupyter_template(self):
        """Test Jupyter template."""
        from tunnel_config import DEFAULT_TEMPLATES

        jupyter = next((t for t in DEFAULT_TEMPLATES if t["id"] == "jupyter"), None)
        assert jupyter is not None
        assert jupyter["local_port"] == 8888
        assert jupyter["service_type"] == "jupyter"


class TestTunnelManager:
    """Test TunnelManager class."""

    def test_tunnel_manager_init(self):
        """Test TunnelManager initialization."""
        from tunnel_config import TunnelManager

        with patch('tunnel_config.TUNNEL_CONFIG_FILE', os.path.join(temp_dir, 'tunnels.json')):
            manager = TunnelManager()
            assert manager is not None

    def test_get_templates(self):
        """Test getting default templates."""
        from tunnel_config import TunnelManager

        with patch('tunnel_config.TUNNEL_CONFIG_FILE', os.path.join(temp_dir, 'tunnels.json')):
            manager = TunnelManager()
            templates = manager.get_templates()
            assert isinstance(templates, list)
            assert len(templates) > 0
