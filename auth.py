"""BridgeNode Authentication Module - Simple Username/Password"""
import secrets
from datetime import datetime, timedelta
from typing import Optional

# Simple hardcoded credentials (can be moved to config/env)
DEFAULT_USERNAME = "admin"
DEFAULT_PASSWORD = "password"

# Token storage
_token: Optional[str] = None
_token_expiry: Optional[datetime] = None


def generate_token() -> str:
    """Generate a new access token."""
    global _token, _token_expiry
    _token = secrets.token_urlsafe(32)
    _token_expiry = datetime.now() + timedelta(hours=24)
    return _token


def verify_token(token: str) -> bool:
    """Verify if token is valid and not expired."""
    global _token, _token_expiry
    if not _token or not _token_expiry:
        return False
    if datetime.now() > _token_expiry:
        return False
    return token == _token


def verify_credentials(username: str, password: str) -> bool:
    """Verify username and password."""
    return username == DEFAULT_USERNAME and password == DEFAULT_PASSWORD


def get_current_token() -> Optional[str]:
    """Get current token."""
    return _token


def get_token_expiry() -> Optional[datetime]:
    """Get token expiry time."""
    return _token_expiry
