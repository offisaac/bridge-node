"""Tests for encryption module"""
import os
import pytest
from unittest.mock import patch

# Set test environment variables before import
os.environ["BRIDGENODE_ENCRYPTION_KEY"] = "test-encryption-key-12345"
os.environ["BRIDGENODE_ENCRYPTION_SALT"] = "test-salt"

import encryption


class TestEncryptionManager:
    """Test EncryptionManager class."""

    def setup_method(self):
        """Set up encryption manager for each test."""
        self.manager = encryption.EncryptionManager()

    def test_is_enabled_with_key(self):
        """Test encryption is enabled when key is provided."""
        assert self.manager.is_enabled() is True

    def test_generate_key(self):
        """Test key generation."""
        key = self.manager.generate_key()
        assert key is not None
        assert isinstance(key, str)
        assert len(key) > 0

    def test_encrypt_decrypt(self):
        """Test encryption and decryption."""
        plaintext = "Hello, World!"
        encrypted = self.manager.encrypt(plaintext)
        assert encrypted is not None
        assert encrypted != plaintext

        decrypted = self.manager.decrypt(encrypted)
        assert decrypted == plaintext

    def test_decrypt_none_when_disabled(self):
        """Test decryption returns None when disabled."""
        manager = encryption.EncryptionManager(key=None)
        result = manager.decrypt("test")
        assert result is None

    def test_encrypt_empty_string(self):
        """Test encrypting empty string."""
        result = self.manager.encrypt("")
        # May return None or encrypted empty string
        # Just check it doesn't crash
        assert result is None or isinstance(result, str)

    def test_encrypt_dict(self):
        """Test encrypting dictionary."""
        data = {
            "username": "testuser",
            "password": "secret123",
            "count": 42
        }
        encrypted = self.manager.encrypt_dict(data)
        assert encrypted is not None
        assert encrypted["username"] != data["username"]
        assert encrypted["password"] != data["password"]
        assert encrypted["count"] == 42  # Non-string unchanged

    def test_decrypt_dict(self):
        """Test decrypting dictionary."""
        data = {
            "username": "testuser",
            "password": "secret123"
        }
        encrypted = self.manager.encrypt_dict(data)
        decrypted = self.manager.decrypt_dict(encrypted)
        assert decrypted["username"] == "testuser"
        assert decrypted["password"] == "secret123"


class TestSSHConfigEncryption:
    """Test SSH configuration encryption."""

    def setup_method(self):
        """Set up encryption manager for each test."""
        self.manager = encryption.EncryptionManager()

    def test_encrypt_ssh_config(self):
        """Test SSH config encryption."""
        config = {
            "host": "example.com",
            "user": "testuser",
            "password": "secret123",
            "private_key": "fake-key-data"
        }
        encrypted = encryption.encrypt_ssh_config(config)
        assert encrypted["password"] != "secret123"
        assert encrypted["password_encrypted"] is True
        assert encrypted["private_key_encrypted"] is True

    def test_decrypt_ssh_config(self):
        """Test SSH config decryption."""
        config = {
            "host": "example.com",
            "user": "testuser",
            "password": "secret123",
            "private_key": "fake-key-data"
        }
        encrypted = encryption.encrypt_ssh_config(config)
        decrypted = encryption.decrypt_ssh_config(encrypted)
        assert decrypted["password"] == "secret123"
        assert decrypted["private_key"] == "fake-key-data"

    def test_encrypt_ssh_config_disabled(self):
        """Test SSH config encryption when disabled."""
        with patch.object(encryption.encryption_manager, 'is_enabled', return_value=False):
            config = {"password": "secret"}
            result = encryption.encrypt_ssh_config(config)
            assert result == config


class TestPasswordEncryption:
    """Test password encryption utilities."""

    def setup_method(self):
        """Set up encryption manager for each test."""
        self.manager = encryption.EncryptionManager()

    def test_encrypt_password(self):
        """Test password encryption."""
        encrypted = encryption.encrypt_password("mypassword")
        assert encrypted is not None
        assert encrypted != "mypassword"

    def test_decrypt_password(self):
        """Test password decryption."""
        encrypted = encryption.encrypt_password("mypassword")
        decrypted = encryption.decrypt_password(encrypted)
        assert decrypted == "mypassword"

    def test_encrypt_token(self):
        """Test token encryption."""
        encrypted = encryption.encrypt_token("my-token-123")
        assert encrypted is not None
        assert encrypted != "my-token-123"

    def test_decrypt_token(self):
        """Test token decryption."""
        encrypted = encryption.encrypt_token("my-token-123")
        decrypted = encryption.decrypt_token(encrypted)
        assert decrypted == "my-token-123"
