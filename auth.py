"""BridgeNode Authentication Module - Simple Username/Password"""
import os
import secrets
from datetime import datetime, timedelta
from typing import Optional

# Credentials - MUST be set via environment variables
_BRIDGENODE_USERNAME = os.getenv("BRIDGENODE_USERNAME")
_BRIDGENODE_PASSWORD = os.getenv("BRIDGENODE_PASSWORD")

if not _BRIDGENODE_USERNAME or not _BRIDGENODE_PASSWORD:
    raise ValueError(
        "CRITICAL: BRIDGENODE_USERNAME and BRIDGENODE_PASSWORD environment variables must be set! "
        "For security, default credentials have been removed."
    )

DEFAULT_USERNAME = _BRIDGENODE_USERNAME
DEFAULT_PASSWORD = _BRIDGENODE_PASSWORD

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
    return secrets.compare_digest(token, _token)


def verify_credentials(username: str, password: str) -> bool:
    """Verify username and password using constant-time comparison."""
    return secrets.compare_digest(username, DEFAULT_USERNAME) and secrets.compare_digest(password, DEFAULT_PASSWORD)


def get_current_token() -> Optional[str]:
    """Get current token."""
    return _token


def get_token_expiry() -> Optional[datetime]:
    """Get token expiry time."""
    return _token_expiry
