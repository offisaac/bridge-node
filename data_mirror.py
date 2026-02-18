"""Data Mirror Module

Implement service-to-service data mirroring with sync and async modes.
"""
import time
import threading
import uuid
import asyncio
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class MirrorMode(str, Enum):
    """Mirror modes."""
    SYNC = "sync"
    ASYNC = "async"
    BATCH = "batch"
    STREAM = "stream"


class MirrorStatus(str, Enum):
    """Mirror status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PAUSED = "paused"


@dataclass
class MirrorTask:
    """Data mirror task."""
    id: str
    source_service: str
    target_service: str
    mode: MirrorMode
    status: MirrorStatus
    created_at: float
    started_at: float = 0
    completed_at: float = 0
    records_mirrored: int = 0
    errors: List[str] = field(default_factory=list)


@dataclass
class MirrorConfig:
    """Mirror configuration."""
    id: str
    name: str
    source_endpoint: str
    target_endpoint: str
    mode: MirrorMode
    batch_size: int = 100
    interval_seconds: int = 60
    enabled: bool = True


class DataMirror:
    """Data mirroring between services."""

    def __init__(self):
        self._lock = threading.RLock()
        self._tasks: Dict[str, MirrorTask] = {}
        self._configs: Dict[str, MirrorConfig] = {}
        self._callbacks: Dict[str, Callable] = {}

    def create_config(
        self,
        name: str,
        source_endpoint: str,
        target_endpoint: str,
        mode: MirrorMode = MirrorMode.ASYNC,
        batch_size: int = 100,
        interval_seconds: int = 60
    ) -> str:
        """Create a mirror configuration."""
        config_id = str(uuid.uuid4())[:12]

        config = MirrorConfig(
            id=config_id,
            name=name,
            source_endpoint=source_endpoint,
            target_endpoint=target_endpoint,
            mode=mode,
            batch_size=batch_size,
            interval_seconds=interval_seconds
        )

        with self._lock:
            self._configs[config_id] = config

        return config_id

    def start_mirror(self, config_id: str) -> Optional[str]:
        """Start a mirror task."""
        with self._lock:
            config = self._configs.get(config_id)
            if not config:
                return None

        task_id = str(uuid.uuid4())[:12]
        task = MirrorTask(
            id=task_id,
            source_service=config.source_endpoint,
            target_service=config.target_endpoint,
            mode=config.mode,
            status=MirrorStatus.RUNNING,
            created_at=time.time(),
            started_at=time.time()
        )

        with self._lock:
            self._tasks[task_id] = task

        return task_id

    def stop_mirror(self, task_id: str) -> bool:
        """Stop a mirror task."""
        with self._lock:
            task = self._tasks.get(task_id)
            if not task:
                return False
            task.status = MirrorStatus.PAUSED
            return True

    def get_task(self, task_id: str) -> Optional[MirrorTask]:
        """Get a mirror task."""
        with self._lock:
            return self._tasks.get(task_id)

    def get_tasks(self, status: MirrorStatus = None) -> List[MirrorTask]:
        """Get mirror tasks."""
        with self._lock:
            tasks = list(self._tasks.values())

        if status:
            tasks = [t for t in tasks if t.status == status]

        return sorted(tasks, key=lambda x: x.created_at, reverse=True)

    def get_configs(self) -> List[Dict]:
        """Get mirror configurations."""
        with self._lock:
            return [
                {"id": c.id, "name": c.name, "source_endpoint": c.source_endpoint,
                 "target_endpoint": c.target_endpoint, "mode": c.mode.value, "enabled": c.enabled}
                for c in self._configs.values()
            ]

    def get_stats(self) -> Dict:
        """Get mirror statistics."""
        with self._lock:
            total = len(self._tasks)
            running = sum(1 for t in self._tasks.values() if t.status == MirrorStatus.RUNNING)
            completed = sum(1 for t in self._tasks.values() if t.status == MirrorStatus.COMPLETED)
            failed = sum(1 for t in self._tasks.values() if t.status == MirrorStatus.FAILED)

            return {
                "total_tasks": total,
                "running": running,
                "completed": completed,
                "failed": failed,
                "configs": len(self._configs)
            }


# Global data mirror
data_mirror = DataMirror()
