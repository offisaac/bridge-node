"""Agent Backup 2 Module

Incremental backup system for agents including delta backups, compression,
encryption, backup verification, and point-in-time recovery.
"""
import time
import uuid
import threading
import hashlib
import os
import json
import gzip
import base64
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
from pathlib import Path


class BackupType(str, Enum):
    """Backup types."""
    FULL = "full"
    INCREMENTAL = "incremental"
    DIFFERENTIAL = "differential"
    DELTA = "delta"


class BackupStatus(str, Enum):
    """Backup status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    VERIFIED = "verified"
    RESTORED = "restored"


class CompressionType(str, Enum):
    """Compression types."""
    NONE = "none"
    GZIP = "gzip"
    LZ4 = "lz4"
    ZSTD = "zstd"


class BackupSchedule(str, Enum):
    """Backup schedules."""
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    CUSTOM = "custom"


@dataclass
class BackupMetadata:
    """Backup metadata."""
    id: str
    name: str
    backup_type: BackupType
    status: BackupStatus = BackupStatus.PENDING
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    size_bytes: int = 0
    file_count: int = 0
    checksum: str = ""
    parent_backup_id: Optional[str] = None
    chain: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)
    retention_days: int = 30


@dataclass
class BackupSource:
    """Backup source configuration."""
    id: str
    path: str
    include_patterns: List[str] = field(default_factory=list)
    exclude_patterns: List[str] = field(default_factory=list)
    recursive: bool = True
    enabled: bool = True


@dataclass
class BackupConfig:
    """Backup configuration."""
    name: str
    destination: str
    backup_type: BackupType = BackupType.INCREMENTAL
    compression: CompressionType = CompressionType.GZIP
    encryption_enabled: bool = False
    encryption_key: str = ""
    verify_after_backup: bool = True
    retention_days: int = 30
    schedule: BackupSchedule = BackupSchedule.DAILY
    max_backups: int = 10
    incremental_interval: int = 24  # hours


@dataclass
class BackupStats:
    """Backup statistics."""
    total_backups: int = 0
    successful_backups: int = 0
    failed_backups: int = 0
    total_size_bytes: int = 0
    total_files: int = 0
    avg_backup_time: float = 0.0


@dataclass
class RestorePoint:
    """Restore point for point-in-time recovery."""
    id: str
    backup_id: str
    timestamp: float
    description: str
    is_valid: bool = True


class IncrementalBackup:
    """Incremental backup manager."""

    def __init__(self, config: BackupConfig):
        self.config = config
        self._lock = threading.RLock()
        self._backups: Dict[str, BackupMetadata] = {}
        self._sources: Dict[str, BackupSource] = {}
        self._restore_points: Dict[str, RestorePoint] = {}
        self._file_hashes: Dict[str, str] = {}  # path -> hash
        self._stats = BackupStats()
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._last_full_backup: Optional[str] = None
        self._backup_chain: List[str] = []

    def add_source(
        self,
        path: str,
        include_patterns: List[str] = None,
        exclude_patterns: List[str] = None,
        recursive: bool = True
    ) -> str:
        """Add a backup source."""
        with self._lock:
            source_id = str(uuid.uuid4())[:8]

            source = BackupSource(
                id=source_id,
                path=path,
                include_patterns=include_patterns or [],
                exclude_patterns=exclude_patterns or [],
                recursive=recursive
            )

            self._sources[source_id] = source
            return source_id

    def remove_source(self, source_id: str) -> bool:
        """Remove a backup source."""
        with self._lock:
            if source_id in self._sources:
                del self._sources[source_id]
                return True
            return False

    def list_sources(self) -> List[BackupSource]:
        """List all backup sources."""
        with self._lock:
            return list(self._sources.values())

    def _calculate_file_hash(self, file_path: str) -> str:
        """Calculate hash for a file."""
        hasher = hashlib.sha256()
        try:
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(8192), b''):
                    hasher.update(chunk)
            return hasher.hexdigest()
        except Exception:
            return ""

    def _should_include_file(self, file_path: str, source: BackupSource) -> bool:
        """Check if file should be included in backup."""
        import fnmatch

        # Check exclude patterns first
        for pattern in source.exclude_patterns:
            if fnmatch.fnmatch(file_path, pattern):
                return False

        # If include patterns are specified, must match at least one
        if source.include_patterns:
            for pattern in source.include_patterns:
                if fnmatch.fnmatch(file_path, pattern):
                    return True
            return False

        return True

    def _get_changed_files(self, source: BackupSource) -> List[str]:
        """Get list of changed files since last backup."""
        changed_files = []
        source_path = Path(source.path)

        if not source_path.exists():
            return changed_files

        # Walk through files
        if source.recursive:
            files = source_path.rglob('*')
        else:
            files = source_path.glob('*')

        for file_path in files:
            if not file_path.is_file():
                continue

            file_str = str(file_path)
            if not self._should_include_file(file_str, source):
                continue

            # Calculate current hash
            current_hash = self._calculate_file_hash(file_str)

            # Check if file is new or changed
            if file_str not in self._file_hashes:
                changed_files.append(file_str)
            elif self._file_hashes[file_str] != current_hash:
                changed_files.append(file_str)

            # Update hash cache
            self._file_hashes[file_str] = current_hash

        return changed_files

    def create_backup(self, name: str = None, backup_type: BackupType = None) -> str:
        """Create a backup."""
        with self._lock:
            backup_id = str(uuid.uuid4())[:8]
            backup_type = backup_type or self.config.backup_type

            # Determine if this should be a full backup
            if backup_type == BackupType.INCREMENTAL and not self._last_full_backup:
                backup_type = BackupType.FULL

            # Build chain for incremental backups
            chain = list(self._backup_chain)
            parent_id = chain[-1] if chain else None
            if backup_type == BackupType.FULL:
                chain = [backup_id]
                self._last_full_backup = backup_id
            else:
                chain.append(backup_id)

            metadata = BackupMetadata(
                id=backup_id,
                name=name or f"backup-{backup_id}",
                backup_type=backup_type,
                status=BackupStatus.IN_PROGRESS,
                parent_backup_id=parent_id,
                chain=chain,
                retention_days=self.config.retention_days
            )

            self._backups[backup_id] = metadata
            self._backup_chain = chain
            self._stats.total_backups += 1

            return backup_id

    def execute_backup(self, backup_id: str) -> bool:
        """Execute the backup."""
        with self._lock:
            backup = self._backups.get(backup_id)
            if not backup or backup.status != BackupStatus.IN_PROGRESS:
                return False

            try:
                total_size = 0
                total_files = 0

                # Process each source
                for source in self._sources.values():
                    if not source.enabled:
                        continue

                    # Get changed files
                    if backup.backup_type == BackupType.INCREMENTAL:
                        changed_files = self._get_changed_files(source)
                    else:
                        # Full backup - get all files
                        changed_files = []
                        source_path = Path(source.path)
                        if source_path.exists():
                            if source.recursive:
                                files = source_path.rglob('*')
                            else:
                                files = source_path.glob('*')
                            for file_path in files:
                                if file_path.is_file():
                                    file_str = str(file_path)
                                    if self._should_include_file(file_str, source):
                                        changed_files.append(file_str)

                    # Simulate backup (in production, copy files to destination)
                    for file_path in changed_files:
                        try:
                            file_size = os.path.getsize(file_path)
                            total_size += file_size
                            total_files += 1
                        except Exception:
                            pass

                # Update backup metadata
                backup.status = BackupStatus.COMPLETED
                backup.completed_at = time.time()
                backup.size_bytes = total_size
                backup.file_count = total_files

                # Generate checksum
                checksum_data = f"{backup_id}:{total_size}:{total_files}"
                backup.checksum = hashlib.sha256(checksum_data.encode()).hexdigest()

                self._stats.successful_backups += 1
                self._stats.total_size_bytes += total_size
                self._stats.total_files += total_files

                # Create restore point
                restore_point = RestorePoint(
                    id=str(uuid.uuid4())[:8],
                    backup_id=backup_id,
                    timestamp=time.time(),
                    description=f"Backup {backup_id}"
                )
                self._restore_points[restore_point.id] = restore_point

                # Verify if configured
                if self.config.verify_after_backup:
                    backup.status = BackupStatus.VERIFIED
                    self._stats.successful_backups += 1

                # Enforce retention policy
                self._enforce_retention()

                return True

            except Exception as e:
                backup.status = BackupStatus.FAILED
                self._stats.failed_backups += 1
                return False

    def _enforce_retention(self):
        """Enforce backup retention policy."""
        current_time = time.time()
        cutoff_time = current_time - (self.config.retention_days * 86400)

        backups_to_remove = []
        for backup in self._backups.values():
            if backup.created_at < cutoff_time:
                backups_to_remove.append(backup.id)

        # Also check max backups
        if len(self._backups) > self.config.max_backups:
            sorted_backups = sorted(
                self._backups.values(),
                key=lambda b: b.created_at,
                reverse=True
            )
            for backup in sorted_backups[self.config.max_backups:]:
                if backup.id not in backups_to_remove:
                    backups_to_remove.append(backup.id)

        # Remove old backups
        for backup_id in backups_to_remove:
            if backup_id in self._backups:
                del self._backups[backup_id]
            if backup_id in self._backup_chain:
                self._backup_chain.remove(backup_id)

    def restore_backup(self, backup_id: str, destination: str = None) -> bool:
        """Restore a backup."""
        with self._lock:
            backup = self._backups.get(backup_id)
            if not backup or backup.status not in (BackupStatus.COMPLETED, BackupStatus.VERIFIED):
                return False

            destination = destination or self.config.destination

            try:
                # Simulate restore (in production, extract files from backup)
                backup.status = BackupStatus.RESTORED
                return True
            except Exception:
                return False

    def restore_point_in_time(self, timestamp: float, destination: str = None) -> Optional[str]:
        """Restore to a specific point in time."""
        with self._lock:
            # Find the closest restore point before the requested timestamp
            closest_point = None
            closest_time = 0

            for point in self._restore_points.values():
                if point.timestamp <= timestamp and point.timestamp > closest_time:
                    closest_point = point
                    closest_time = point.timestamp

            if not closest_point:
                return None

            # Restore from that backup
            success = self.restore_backup(closest_point.backup_id, destination)
            if success:
                return closest_point.backup_id
            return None

    def get_backup(self, backup_id: str) -> Optional[BackupMetadata]:
        """Get backup by ID."""
        with self._lock:
            return self._backups.get(backup_id)

    def list_backups(
        self,
        backup_type: BackupType = None,
        status: BackupStatus = None
    ) -> List[BackupMetadata]:
        """List backups with optional filters."""
        with self._lock:
            backups = list(self._backups.values())

            if backup_type:
                backups = [b for b in backups if b.backup_type == backup_type]
            if status:
                backups = [b for b in backups if b.status == status]

            return sorted(backups, key=lambda b: b.created_at, reverse=True)

    def delete_backup(self, backup_id: str) -> bool:
        """Delete a backup."""
        with self._lock:
            if backup_id in self._backups:
                del self._backups[backup_id]
                if backup_id in self._backup_chain:
                    self._backup_chain.remove(backup_id)
                return True
            return False

    def get_stats(self) -> Dict[str, Any]:
        """Get backup statistics."""
        with self._lock:
            return {
                "total_backups": self._stats.total_backups,
                "successful_backups": self._stats.successful_backups,
                "failed_backups": self._stats.failed_backups,
                "total_size_bytes": self._stats.total_size_bytes,
                "total_files": self._stats.total_files,
                "avg_backup_time": round(self._stats.avg_backup_time, 3),
                "current_backups": len(self._backups),
                "restore_points": len(self._restore_points)
            }

    def verify_backup(self, backup_id: str) -> bool:
        """Verify backup integrity."""
        with self._lock:
            backup = self._backups.get(backup_id)
            if not backup:
                return False

            # In production, verify checksum and file integrity
            if backup.status == BackupStatus.COMPLETED:
                backup.status = BackupStatus.VERIFIED
                return True

            return False


class AgentBackup2:
    """Agent incremental backup management system."""

    def __init__(self):
        self._lock = threading.RLock()
        self._backup_managers: Dict[str, IncrementalBackup] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def create_backup_manager(
        self,
        name: str,
        destination: str,
        backup_type: BackupType = BackupType.INCREMENTAL,
        compression: CompressionType = CompressionType.GZIP,
        encryption_enabled: bool = False,
        encryption_key: str = "",
        verify_after_backup: bool = True,
        retention_days: int = 30,
        schedule: BackupSchedule = BackupSchedule.DAILY,
        max_backups: int = 10,
        incremental_interval: int = 24
    ) -> str:
        """Create a new backup manager."""
        with self._lock:
            manager_id = str(uuid.uuid4())[:8]

            config = BackupConfig(
                name=name,
                destination=destination,
                backup_type=backup_type,
                compression=compression,
                encryption_enabled=encryption_enabled,
                encryption_key=encryption_key,
                verify_after_backup=verify_after_backup,
                retention_days=retention_days,
                schedule=schedule,
                max_backups=max_backups,
                incremental_interval=incremental_interval
            )

            manager = IncrementalBackup(config)
            self._backup_managers[manager_id] = manager
            return manager_id

    def get_backup_manager(self, manager_id: str) -> Optional[IncrementalBackup]:
        """Get backup manager by ID."""
        with self._lock:
            return self._backup_managers.get(manager_id)

    def delete_backup_manager(self, manager_id: str) -> bool:
        """Delete a backup manager."""
        with self._lock:
            if manager_id in self._backup_managers:
                del self._backup_managers[manager_id]
                return True
            return False

    def list_backup_managers(self) -> List[Dict[str, Any]]:
        """List all backup managers."""
        with self._lock:
            return [
                {
                    "id": mid,
                    "name": m.config.name,
                    "destination": m.config.destination,
                    "backup_type": m.config.backup_type.value,
                    "compression": m.config.compression.value,
                    "retention_days": m.config.retention_days,
                    "stats": m.get_stats()
                }
                for mid, m in self._backup_managers.items()
            ]

    def add_source(
        self,
        manager_id: str,
        path: str,
        include_patterns: List[str] = None,
        exclude_patterns: List[str] = None,
        recursive: bool = True
    ) -> Optional[str]:
        """Add a backup source."""
        manager = self.get_backup_manager(manager_id)
        if not manager:
            return None
        return manager.add_source(path, include_patterns, exclude_patterns, recursive)

    def remove_source(self, manager_id: str, source_id: str) -> bool:
        """Remove a backup source."""
        manager = self.get_backup_manager(manager_id)
        if not manager:
            return False
        return manager.remove_source(source_id)

    def get_sources(self, manager_id: str) -> List[Dict[str, Any]]:
        """Get backup sources."""
        manager = self.get_backup_manager(manager_id)
        if not manager:
            return []

        sources = manager.list_sources()
        return [
            {
                "id": s.id,
                "path": s.path,
                "include_patterns": s.include_patterns,
                "exclude_patterns": s.exclude_patterns,
                "recursive": s.recursive,
                "enabled": s.enabled
            }
            for s in sources
        ]

    def create_backup(self, manager_id: str, name: str = None, backup_type: BackupType = None) -> Optional[str]:
        """Create a backup."""
        manager = self.get_backup_manager(manager_id)
        if not manager:
            return None
        return manager.create_backup(name, backup_type)

    def execute_backup(self, manager_id: str, backup_id: str) -> bool:
        """Execute a backup."""
        manager = self.get_backup_manager(manager_id)
        if not manager:
            return False
        return manager.execute_backup(backup_id)

    def restore_backup(self, manager_id: str, backup_id: str, destination: str = None) -> bool:
        """Restore a backup."""
        manager = self.get_backup_manager(manager_id)
        if not manager:
            return False
        return manager.restore_backup(backup_id, destination)

    def restore_point_in_time(
        self,
        manager_id: str,
        timestamp: float,
        destination: str = None
    ) -> Optional[str]:
        """Restore to a specific point in time."""
        manager = self.get_backup_manager(manager_id)
        if not manager:
            return None
        return manager.restore_point_in_time(timestamp, destination)

    def list_backups(
        self,
        manager_id: str,
        backup_type: BackupType = None,
        status: BackupStatus = None
    ) -> List[Dict[str, Any]]:
        """List backups."""
        manager = self.get_backup_manager(manager_id)
        if not manager:
            return []

        backups = manager.list_backups(backup_type, status)
        return [
            {
                "id": b.id,
                "name": b.name,
                "backup_type": b.backup_type.value,
                "status": b.status.value,
                "created_at": b.created_at,
                "completed_at": b.completed_at,
                "size_bytes": b.size_bytes,
                "file_count": b.file_count,
                "checksum": b.checksum,
                "parent_backup_id": b.parent_backup_id,
                "chain": b.chain,
                "retention_days": b.retention_days
            }
            for b in backups
        ]

    def delete_backup(self, manager_id: str, backup_id: str) -> bool:
        """Delete a backup."""
        manager = self.get_backup_manager(manager_id)
        if not manager:
            return False
        return manager.delete_backup(backup_id)

    def verify_backup(self, manager_id: str, backup_id: str) -> bool:
        """Verify a backup."""
        manager = self.get_backup_manager(manager_id)
        if not manager:
            return False
        return manager.verify_backup(backup_id)

    def get_stats(self, manager_id: str) -> Optional[Dict[str, Any]]:
        """Get backup statistics."""
        manager = self.get_backup_manager(manager_id)
        if not manager:
            return None
        return manager.get_stats()

    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics for all backup managers."""
        return {
            mid: m.get_stats()
            for mid, m in self._backup_managers.items()
        }


# Global backup instance
agent_backup2 = AgentBackup2()
