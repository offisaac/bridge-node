"""IP Whitelist Module

IP whitelist management for API access control.
"""
import threading
import ipaddress
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid


class WhitelistStatus(str, Enum):
    """Whitelist entry status."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    EXPIRED = "expired"


@dataclass
class WhitelistEntry:
    """IP whitelist entry."""
    id: str
    ip_address: str  # Can be single IP or CIDR
    description: str
    status: WhitelistStatus
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    expires_at: Optional[str] = None
    metadata: Dict = field(default_factory=dict)


class IPWhitelist:
    """IP whitelist manager."""

    def __init__(self):
        self._lock = threading.RLock()
        self._entries: Dict[str, WhitelistEntry] = {}

    def add_entry(
        self,
        ip_address: str,
        description: str = "",
        expires_at: str = None
    ) -> str:
        """Add an IP to the whitelist."""
        entry_id = str(uuid.uuid4())[:8]

        # Validate IP/CIDR
        try:
            ipaddress.ip_network(ip_address, strict=False)
        except ValueError:
            raise ValueError(f"Invalid IP address or CIDR: {ip_address}")

        entry = WhitelistEntry(
            id=entry_id,
            ip_address=ip_address,
            description=description,
            status=WhitelistStatus.ACTIVE,
            expires_at=expires_at
        )

        with self._lock:
            self._entries[entry_id] = entry

        return entry_id

    def remove_entry(self, entry_id: str) -> bool:
        """Remove an entry from the whitelist."""
        with self._lock:
            if entry_id in self._entries:
                del self._entries[entry_id]
                return True
            return False

    def update_entry(
        self,
        entry_id: str,
        status: WhitelistStatus = None,
        description: str = None
    ) -> bool:
        """Update a whitelist entry."""
        with self._lock:
            if entry_id not in self._entries:
                return False

            entry = self._entries[entry_id]
            if status:
                entry.status = status
            if description:
                entry.description = description

            return True

    def get_entry(self, entry_id: str) -> Optional[Dict]:
        """Get a whitelist entry."""
        with self._lock:
            entry = self._entries.get(entry_id)
            if not entry:
                return None

            return {
                "id": entry.id,
                "ip_address": entry.ip_address,
                "description": entry.description,
                "status": entry.status.value,
                "created_at": entry.created_at,
                "expires_at": entry.expires_at
            }

    def get_entries(self, status: WhitelistStatus = None) -> List[Dict]:
        """Get all whitelist entries."""
        with self._lock:
            entries = list(self._entries.values())

        if status:
            entries = [e for e in entries if e.status == status]

        return [
            {
                "id": e.id,
                "ip_address": e.ip_address,
                "description": e.description,
                "status": e.status.value,
                "created_at": e.created_at,
                "expires_at": e.expires_at
            }
            for e in entries
        ]

    def is_allowed(self, ip_address: str) -> bool:
        """Check if an IP is allowed."""
        with self._lock:
            for entry in self._entries.values():
                if entry.status != WhitelistStatus.ACTIVE:
                    continue

                # Check expiration
                if entry.expires_at:
                    expires = datetime.fromisoformat(entry.expires_at)
                    if expires < datetime.now():
                        continue

                # Check IP match
                try:
                    request_ip = ipaddress.ip_address(ip_address)
                    whitelist_net = ipaddress.ip_network(entry.ip_address, strict=False)
                    if request_ip in whitelist_net:
                        return True
                except ValueError:
                    continue

        return False

    def check_access(self, ip_address: str) -> Dict:
        """Check access for an IP."""
        allowed = self.is_allowed(ip_address)
        return {
            "ip_address": ip_address,
            "allowed": allowed,
            "timestamp": datetime.now().isoformat()
        }

    def get_stats(self) -> Dict:
        """Get whitelist statistics."""
        with self._lock:
            total = len(self._entries)
            by_status = {}

            for entry in self._entries.values():
                status = entry.status.value
                by_status[status] = by_status.get(status, 0) + 1

            return {
                "total_entries": total,
                "by_status": by_status
            }


# Global IP whitelist
ip_whitelist = IPWhitelist()

# Add default entries
def init_default_whitelist():
    """Initialize default whitelist entries."""
    ip_whitelist.add_entry(
        ip_address="127.0.0.1",
        description="Localhost"
    )
    ip_whitelist.add_entry(
        ip_address="::1",
        description="Localhost IPv6"
    )


init_default_whitelist()
