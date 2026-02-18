"""
pytest configuration for bridge-node tests
"""
import sys
import os

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest


@pytest.fixture
def mock_config():
    """Mock configuration for tests"""
    return {
        "BRIDGENODE_HOST": "127.0.0.1",
        "BRIDGENODE_PORT": 8888,
        "BRIDGENODE_OPTIONAL_AUTH": "0",
        "BRIDGENODE_SECRET_KEY": "test-secret-key",
        "BRIDGENODE_JWT_SECRET": "test-jwt-secret",
    }


@pytest.fixture
def app_config():
    """Full app configuration for testing"""
    return {
        "host": "127.0.0.1",
        "port": 8888,
        "debug": True,
        "optional_auth": False,
        "secret_key": "test-secret-key-for-testing",
        "jwt_secret": "test-jwt-secret-key",
    }
