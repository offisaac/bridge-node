"""Traffic Mirror Module

Traffic mirroring for testing.
"""
import threading
import json
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid


class MirrorStatus(str, Enum):
    """Mirror status."""
    ACTIVE = "active"
    PAUSED = "paused"
    STOPPED = "stopped"


@dataclass
class MirrorTarget:
    """Mirror target configuration."""
    id: str
    name: str
    url: str
    enabled: bool = True
    headers: Dict = field(default_factory=dict)


@dataclass
class MirroredRequest:
    """Mirrored request record."""
    id: str
    timestamp: str
    method: str
    path: str
    headers: Dict
    body: Any
    target: str


class TrafficMirror:
    """Traffic mirroring for testing."""

    def __init__(self):
        self._lock = threading.RLock()
        self._targets: Dict[str, MirrorTarget] = {}
        self._requests: List[MirroredRequest] = []
        self._max_requests = 10000
        self._status = MirrorStatus.STOPPED

    def add_target(
        self,
        name: str,
        url: str,
        headers: Dict = None
    ) -> str:
        """Add a mirror target."""
        target_id = str(uuid.uuid4())[:8]

        target = MirrorTarget(
            id=target_id,
            name=name,
            url=url,
            headers=headers or {}
        )

        with self._lock:
            self._targets[target_id] = target

        return target_id

    def remove_target(self, target_id: str) -> bool:
        """Remove a mirror target."""
        with self._lock:
            if target_id in self._targets:
                del self._targets[target_id]
                return True
            return False

    def get_targets(self) -> List[Dict]:
        """Get all mirror targets."""
        with self._lock:
            return [
                {
                    "id": t.id,
                    "name": t.name,
                    "url": t.url,
                    "enabled": t.enabled
                }
                for t in self._targets.values()
            ]

    def mirror_request(
        self,
        method: str,
        path: str,
        headers: Dict,
        body: Any = None
    ):
        """Mirror a request to all enabled targets."""
        if self._status != MirrorStatus.ACTIVE:
            return

        with self._lock:
            targets = [t for t in self._targets.values() if t.enabled]

        # Record request
        request = MirroredRequest(
            id=str(uuid.uuid4())[:8],
            timestamp=datetime.now().isoformat(),
            method=method,
            path=path,
            headers=headers,
            body=body,
            target=", ".join(t.name for t in targets)
        )

        with self._lock:
            self._requests.append(request)
            if len(self._requests) > self._max_requests:
                self._requests = self._requests[-self._max_requests:]

        # In production, this would send to actual targets
        # For now, we just log
        for target in targets:
            print(f"[MIRROR] {method} {path} -> {target.url}")

    def start_mirroring(self):
        """Start traffic mirroring."""
        self._status = MirrorStatus.ACTIVE

    def pause_mirroring(self):
        """Pause traffic mirroring."""
        self._status = MirrorStatus.PAUSED

    def stop_mirroring(self):
        """Stop traffic mirroring."""
        self._status = MirrorStatus.STOPPED

    def get_status(self) -> str:
        """Get mirroring status."""
        return self._status.value

    def get_requests(self, limit: int = 100) -> List[Dict]:
        """Get mirrored requests."""
        with self._lock:
            requests = sorted(self._requests, key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "id": r.id,
                "timestamp": r.timestamp,
                "method": r.method,
                "path": r.path,
                "target": r.target
            }
            for r in requests[:limit]
        ]

    def get_stats(self) -> Dict:
        """Get mirror statistics."""
        with self._lock:
            total = len(self._requests)
            enabled_targets = sum(1 for t in self._targets.values() if t.enabled)

            return {
                "status": self._status.value,
                "total_targets": len(self._targets),
                "enabled_targets": enabled_targets,
                "mirrored_requests": total
            }


# Global traffic mirror
traffic_mirror = TrafficMirror()
