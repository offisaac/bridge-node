"""Tests for agent_security module"""
import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))


class TestAgentSecurityManager:
    """Test AgentSecurityManager class."""

    def test_agent_security_init(self):
        """Test AgentSecurityManager initialization."""
        from agent_security import AgentSecurityManager
        security = AgentSecurityManager()
        assert security is not None
        # Check for actual methods
        assert hasattr(security, 'create_api_key')
        assert hasattr(security, 'verify_api_key')
        assert hasattr(security, 'create_session')


class TestSecurityEnums:
    """Test security enums."""

    def test_auth_method_enum(self):
        """Test AuthMethod enum."""
        from agent_security import AuthMethod
        assert AuthMethod.API_KEY.value == "api_key"
        assert AuthMethod.JWT.value == "jwt"
        assert AuthMethod.OAUTH2.value == "oauth2"

    def test_permission_level_enum(self):
        """Test PermissionLevel enum."""
        from agent_security import PermissionLevel
        assert PermissionLevel.READ.value == "read"
        assert PermissionLevel.WRITE.value == "write"
        assert PermissionLevel.ADMIN.value == "admin"

    def test_security_event_type_enum(self):
        """Test SecurityEventType enum."""
        from agent_security import SecurityEventType
        assert SecurityEventType.LOGIN.value == "login"
        assert SecurityEventType.LOGOUT.value == "logout"
        assert SecurityEventType.PERMISSION_DENIED.value == "permission_denied"
