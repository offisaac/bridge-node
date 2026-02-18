"""Tests for auth module."""
import pytest
import os
from unittest.mock import patch


class TestAuth:
    """Test authentication module."""

    def test_get_default_credentials_no_env(self):
        """Test credentials not set raises error."""
        with patch.dict(os.environ, {}, clear=True):
            # Import after clearing env to ensure fresh state
            import importlib
            import auth
            importlib.reload(auth)

            # Should raise ValueError when credentials not set
            with pytest.raises(ValueError) as exc_info:
                auth.get_default_credentials()

            assert "BRIDGENODE_USERNAME" in str(exc_info.value)

    def test_verify_credentials_with_env(self):
        """Test credentials verification with env vars."""
        with patch.dict(os.environ, {
            "BRIDGENODE_USERNAME": "testuser",
            "BRIDGENODE_PASSWORD": "testpass"
        }):
            import importlib
            import auth
            importlib.reload(auth)

            # Correct credentials
            assert auth.verify_credentials("testuser", "testpass") is True

            # Wrong password
            assert auth.verify_credentials("testuser", "wrongpass") is False

            # Wrong username
            assert auth.verify_credentials("wronguser", "testpass") is False

    def test_generate_token(self):
        """Test token generation."""
        import importlib
        import auth
        importlib.reload(auth)

        token1 = auth.generate_token()
        token2 = auth.generate_token()

        # Tokens should be different
        assert token1 != token2
        assert len(token1) > 20  # Token should be reasonably long

    def test_verify_token(self):
        """Test token verification."""
        import importlib
        import auth
        importlib.reload(auth)

        token = auth.generate_token()
        assert auth.verify_token(token) is True
        assert auth.verify_token("invalid_token") is False

    def test_token_expiry(self):
        """Test token expiry check."""
        import importlib
        import auth
        importlib.reload(auth)

        # Generate a token
        auth.generate_token()

        # Token should not be expiring soon
        assert auth.is_token_expiring_soon() is False
