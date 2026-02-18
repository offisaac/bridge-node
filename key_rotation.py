"""Key Rotation Module

Automated key rotation with version tracking and history.
"""
import threading
import time
import secrets
import hashlib
import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import uuid


class KeyType(str, Enum):
    """Key types."""
    API_KEY = "api_key"
    ENCRYPTION = "encryption"
    SIGNING = "signing"
    ACCESS_TOKEN = "access_token"
    REFRESH_TOKEN = "refresh_token"
    WEBHOOK_SECRET = "webhook_secret"


class KeyStatus(str, Enum):
    """Key status."""
    ACTIVE = "active"
    ROTATING = "rotating"
    DEPRECATED = "deprecated"
    REVOKED = "revoked"


class RotationStrategy(str, Enum):
    """Key rotation strategy."""
    IMMEDIATE = "immediate"
    GRACEFUL = "graceful"
    DUAL_STACK = "dual_stack"


@dataclass
class KeyVersion:
    """Key version information."""
    key_id: str
    version: int
    key_hash: str
    status: KeyStatus
    created_at: float
    expires_at: Optional[float] = None
    metadata: Dict = field(default_factory=dict)


@dataclass
class KeyEntry:
    """Key entry with version history."""
    key_name: str
    key_type: KeyType
    rotation_period_days: int
    grace_period_hours: int
    current_version: int
    versions: List[KeyVersion]
    rotation_strategy: RotationStrategy
    auto_rotate: bool
    created_at: float
    last_rotated_at: float
    metadata: Dict = field(default_factory=dict)


class KeyRotationManager:
    """Automated key rotation manager."""

    def __init__(self):
        self._lock = threading.RLock()
        self._keys: Dict[str, KeyEntry] = {}
        self._rotation_tasks: Dict[str, Any] = {}
        self._rotation_callbacks: List[callable] = []

    def create_key(
        self,
        name: str,
        key_type: KeyType,
        rotation_period_days: int = 90,
        grace_period_hours: int = 24,
        rotation_strategy: RotationStrategy = RotationStrategy.GRACEFUL,
        auto_rotate: bool = True,
        metadata: Dict = None,
        key_length: int = 32
    ) -> str:
        """Create a new key with rotation."""
        key_value = secrets.token_hex(key_length)
        key_hash = hashlib.sha256(key_value.encode()).hexdigest()[:16]

        key_id = f"{name}-{key_hash}"

        version = KeyVersion(
            key_id=key_id,
            version=1,
            key_hash=key_hash,
            status=KeyStatus.ACTIVE,
            created_at=time.time(),
            metadata=metadata or {}
        )

        entry = KeyEntry(
            key_name=name,
            key_type=key_type,
            rotation_period_days=rotation_period_days,
            grace_period_hours=grace_period_hours,
            current_version=1,
            versions=[version],
            rotation_strategy=rotation_strategy,
            auto_rotate=auto_rotate,
            created_at=time.time(),
            last_rotated_at=time.time(),
            metadata=metadata or {}
        )

        with self._lock:
            self._keys[name] = entry

        # Trigger callback
        self._trigger_rotation_callback("create", name, key_id, version)

        return key_id

    def rotate_key(
        self,
        name: str,
        force: bool = False,
        key_length: int = 32
    ) -> Optional[str]:
        """Rotate a key."""
        with self._lock:
            if name not in self._keys:
                return None

            entry = self._keys[name]

            # Check if rotation is needed
            if not force:
                days_since_rotation = (time.time() - entry.last_rotated_at) / 86400
                if days_since_rotation < entry.rotation_period_days:
                    return None

            # Generate new key
            key_value = secrets.token_hex(key_length)
            key_hash = hashlib.sha256(key_value.encode()).hexdigest()[:16]

            new_version_num = entry.current_version + 1

            # Mark current version as rotating
            if entry.versions:
                current = entry.versions[-1]
                current.status = KeyStatus.ROTATING

            # Create new version
            expires_at = None
            if entry.rotation_period_days > 0:
                expires_at = time.time() + (entry.rotation_period_days * 86400)

            new_version = KeyVersion(
                key_id=f"{name}-{key_hash}",
                version=new_version_num,
                key_hash=key_hash,
                status=KeyStatus.ACTIVE,
                created_at=time.time(),
                expires_at=expires_at,
                metadata=entry.metadata
            )

            entry.versions.append(new_version)
            entry.current_version = new_version_num
            entry.last_rotated_at = time.time()

            # Trigger callback
            self._trigger_rotation_callback("rotate", name, new_version.key_id, new_version)

            return new_version.key_id

    def revoke_key(self, name: str, version: int = None) -> bool:
        """Revoke a key version."""
        with self._lock:
            if name not in self._keys:
                return False

            entry = self._keys[name]

            if version is None:
                # Revoke all versions
                for v in entry.versions:
                    v.status = KeyStatus.REVOKED
            else:
                # Revoke specific version
                for v in entry.versions:
                    if v.version == version:
                        v.status = KeyStatus.REVOKED

            return True

    def get_key_info(self, name: str) -> Optional[Dict]:
        """Get key information (without exposing the key)."""
        with self._lock:
            if name not in self._keys:
                return None

            entry = self._keys[name]

            return {
                "name": entry.key_name,
                "type": entry.key_type.value,
                "current_version": entry.current_version,
                "rotation_period_days": entry.rotation_period_days,
                "grace_period_hours": entry.grace_period_hours,
                "strategy": entry.rotation_strategy.value,
                "auto_rotate": entry.auto_rotate,
                "versions": [
                    {
                        "version": v.version,
                        "status": v.status.value,
                        "created_at": v.created_at,
                        "expires_at": v.expires_at,
                        "metadata": v.metadata
                    }
                    for v in entry.versions
                ],
                "created_at": entry.created_at,
                "last_rotated_at": entry.last_rotated_at,
                "metadata": entry.metadata
            }

    def get_active_keys(self, key_type: KeyType = None) -> List[Dict]:
        """Get all active keys."""
        with self._lock:
            keys = list(self._keys.values())

        if key_type:
            keys = [k for k in keys if k.key_type == key_type]

        return [
            {
                "name": k.key_name,
                "type": k.key_type.value,
                "current_version": k.current_version,
                "auto_rotate": k.auto_rotate,
                "last_rotated_at": k.last_rotated_at
            }
            for k in keys
        ]

    def get_keys_needing_rotation(self) -> List[Dict]:
        """Get keys that need rotation."""
        with self._lock:
            keys = list(self._keys.values())

        result = []
        for entry in keys:
            if not entry.auto_rotate:
                continue

            days_since_rotation = (time.time() - entry.last_rotated_at) / 86400
            if days_since_rotation >= entry.rotation_period_days:
                result.append({
                    "name": entry.key_name,
                    "type": entry.key_type.value,
                    "days_overdue": days_since_rotation - entry.rotation_period_days,
                    "last_rotated_at": entry.last_rotated_at
                })

        return result

    def verify_key(self, name: str, key_hash: str) -> bool:
        """Verify a key against stored hashes."""
        with self._lock:
            if name not in self._keys:
                return False

            entry = self._keys[name]

            for version in entry.versions:
                if version.status != KeyStatus.ACTIVE:
                    continue

                if version.key_hash == key_hash:
                    return True

            return False

    def add_rotation_callback(self, callback: callable):
        """Add a callback for rotation events."""
        self._rotation_callbacks.append(callback)

    def _trigger_rotation_callback(self, event: str, key_name: str, key_id: str, version: KeyVersion):
        """Trigger rotation callbacks."""
        for callback in self._rotation_callbacks:
            try:
                callback(event, key_name, key_id, version)
            except Exception:
                pass

    def delete_key(self, name: str) -> bool:
        """Delete a key and all its versions."""
        with self._lock:
            if name not in self._keys:
                return False

            del self._keys[name]
            return True

    def get_rotation_stats(self) -> Dict:
        """Get key rotation statistics."""
        with self._lock:
            total_keys = len(self._keys)
            active_versions = 0
            rotating_versions = 0
            deprecated_versions = 0

            for entry in self._keys.values():
                for v in entry.versions:
                    if v.status == KeyStatus.ACTIVE:
                        active_versions += 1
                    elif v.status == KeyStatus.ROTATING:
                        rotating_versions += 1
                    elif v.status == KeyStatus.DEPRECATED:
                        deprecated_versions += 1

            keys_needing_rotation = len(self.get_keys_needing_rotation())

            return {
                "total_keys": total_keys,
                "active_versions": active_versions,
                "rotating_versions": rotating_versions,
                "deprecated_versions": deprecated_versions,
                "keys_needing_rotation": keys_needing_rotation
            }

    def export_keys_config(self) -> Dict:
        """Export keys configuration (without secrets)."""
        with self._lock:
            return {
                name: {
                    "key_type": entry.key_type.value,
                    "rotation_period_days": entry.rotation_period_days,
                    "grace_period_hours": entry.grace_period_hours,
                    "rotation_strategy": entry.rotation_strategy.value,
                    "auto_rotate": entry.auto_rotate,
                    "current_version": entry.current_version,
                    "version_count": len(entry.versions),
                    "created_at": entry.created_at,
                    "last_rotated_at": entry.last_rotated_at,
                    "metadata": entry.metadata
                }
                for name, entry in self._keys.items()
            }


# Global key rotation manager
key_rotation_manager = KeyRotationManager()


# Initialize with default keys
def init_default_keys():
    """Initialize default keys."""
    key_rotation_manager.create_key(
        name="api-gateway-key",
        key_type=KeyType.API_KEY,
        rotation_period_days=90,
        grace_period_hours=24,
        auto_rotate=True,
        metadata={"service": "api-gateway", "environment": "production"}
    )

    key_rotation_manager.create_key(
        name="encryption-master",
        key_type=KeyType.ENCRYPTION,
        rotation_period_days=365,
        grace_period_hours=48,
        rotation_strategy=RotationStrategy.DUAL_STACK,
        auto_rotate=True,
        metadata={"service": "encryption", "environment": "production"}
    )

    key_rotation_manager.create_key(
        name="webhook-signing",
        key_type=KeyType.SIGNING,
        rotation_period_days=30,
        grace_period_hours=12,
        auto_rotate=True,
        metadata={"service": "webhooks"}
    )


init_default_keys()
