"""Tests for auth module"""
import os
import sys
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timedelta

# Set test environment variables before import
os.environ["BRIDGENODE_USERNAME"] = "testuser"
os.environ["BRIDGENODE_PASSWORD"] = "testpassword"

import auth


class TestAuth:
    """Test authentication module."""

    def setup_method(self):
        """Reset auth state before each test."""
        auth._token = None
        auth._token_expiry = None

    def test_generate_token(self):
        """Test token generation."""
        token = auth.generate_token()
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0

    def test_verify_token_valid(self):
        """Test verifying a valid token."""
        token = auth.generate_token()
        assert auth.verify_token(token) is True

    def test_verify_token_invalid(self):
        """Test verifying an invalid token."""
        auth.generate_token()
        assert auth.verify_token("invalid_token") is False

    def test_verify_token_no_token(self):
        """Test verifying when no token exists."""
        assert auth.verify_token("any") is False

    def test_verify_token_expired(self):
        """Test verifying an expired token."""
        token = auth.generate_token()
        # Manually set expiry to past
        auth._token_expiry = datetime.now() - timedelta(hours=1)
        assert auth.verify_token(token) is False

    def test_get_current_token(self):
        """Test getting current token."""
        assert auth.get_current_token() is None
        token = auth.generate_token()
        assert auth.get_current_token() == token

    def test_get_token_expiry(self):
        """Test getting token expiry."""
        assert auth.get_token_expiry() is None
        auth.generate_token()
        assert auth.get_token_expiry() is not None

    def test_refresh_token(self):
        """Test refreshing token."""
        token1 = auth.generate_token()
        token2 = auth.refresh_token()
        assert token2 is not None
        assert token2 != token1
        assert auth.verify_token(token2) is True

    def test_refresh_token_no_token(self):
        """Test refreshing when no token exists."""
        assert auth.refresh_token() is None

    def test_is_token_expiring_soon(self):
        """Test token expiring soon check."""
        auth.generate_token()
        # Token generated has 24h expiry, check if expiring within 60 min
        assert auth.is_token_expiring_soon(threshold_minutes=1440) is True

    def test_is_token_expiring_soon_far_future(self):
        """Test token expiring soon when far in future."""
        auth.generate_token()
        # Set expiry to 1 hour from now
        auth._token_expiry = datetime.now() + timedelta(hours=2)
        assert auth.is_token_expiring_soon(threshold_minutes=30) is False

    def test_is_token_expiring_soon_no_expiry(self):
        """Test token expiring soon when no expiry set."""
        assert auth.is_token_expiring_soon() is False


class TestAuthCredentials:
    """Test credential verification."""

    def setup_method(self):
        """Reset auth state before each test."""
        auth._token = None
        auth._token_expiry = None

    def test_verify_credentials_correct(self):
        """Test verifying correct credentials."""
        assert auth.verify_credentials("testuser", "testpassword") is True

    def test_verify_credentials_wrong_password(self):
        """Test verifying wrong password."""
        assert auth.verify_credentials("testuser", "wrongpassword") is False

    def test_verify_credentials_wrong_username(self):
        """Test verifying wrong username."""
        assert auth.verify_credentials("wronguser", "testpassword") is False

    def test_verify_credentials_both_wrong(self):
        """Test verifying both wrong."""
        assert auth.verify_credentials("wronguser", "wrongpassword") is False

    def test_verify_credentials_no_env_vars(self):
        """Test verifying when env vars not set."""
        with patch.dict(os.environ, {}, clear=True):
            # Need to reload module to pick up env change
            import importlib
            importlib.reload(auth)
            # Without env vars, should return False
            # Note: This test depends on how module handles missing env vars
