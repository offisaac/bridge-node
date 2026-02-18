"""Agent Rollback Module

Agent state rollback system for recovery and undo operations.
"""
import time
import threading
import uuid
import json
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from collections import defaultdict


class RollbackType(str, Enum):
    """Rollback types."""
    STATE = "state"
    CONFIG = "config"
    DATA = "data"
    SESSION = "session"
    TASK = "task"


class RollbackStatus(str, Enum):
    """Rollback status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class SnapshotType(str, Enum):
    """Snapshot types."""
    MANUAL = "manual"
    AUTOMATIC = "automatic"
    SCHEDULED = "scheduled"


@dataclass
class Snapshot:
    """State snapshot."""
    id: str
    agent_id: str
    snapshot_type: SnapshotType
    timestamp: float
    state: Dict[str, Any]
    description: str
    size_bytes: int = 0


@dataclass
class Rollback:
    """Rollback record."""
    id: str
    agent_id: str
    from_snapshot_id: str
    to_snapshot_id: str
    rollback_type: RollbackType
    status: RollbackStatus
    created_at: float
    completed_at: float = 0
    duration_ms: int = 0
    success: bool = True
    error_message: str = ""
    affected_keys: List[str] = field(default_factory=list)


class AgentRollbackManager:
    """Manage agent state rollback."""

    def __init__(self):
        self._lock = threading.RLock()
        self._snapshots: Dict[str, Snapshot] = {}
        self._agent_snapshots: Dict[str, List[str]] = defaultdict(list)  # agent_id -> [snapshot_ids]
        self._rollbacks: Dict[str, Rollback] = {}
        self._max_snapshots_per_agent = 100
        self._max_rollbacks = 5000

    def create_snapshot(
        self,
        agent_id: str,
        state: Dict[str, Any],
        snapshot_type: SnapshotType = SnapshotType.MANUAL,
        description: str = ""
    ) -> str:
        """Create a snapshot of agent state."""
        with self._lock:
            snapshot_id = str(uuid.uuid4())[:12]
            state_json = json.dumps(state)
            size_bytes = len(state_json.encode())

            snapshot = Snapshot(
                id=snapshot_id,
                agent_id=agent_id,
                snapshot_type=snapshot_type,
                timestamp=time.time(),
                state=state,
                description=description,
                size_bytes=size_bytes
            )

            self._snapshots[snapshot_id] = snapshot
            self._agent_snapshots[agent_id].append(snapshot_id)

            # Cleanup old snapshots
            if len(self._agent_snapshots[agent_id]) > self._max_snapshots_per_agent:
                oldest = self._agent_snapshots[agent_id][0]
                del self._snapshots[oldest]
                self._agent_snapshots[agent_id] = self._agent_snapshots[agent_id][1:]

            return snapshot_id

    def get_snapshot(self, snapshot_id: str) -> Optional[Dict]:
        """Get snapshot by ID."""
        with self._lock:
            snapshot = self._snapshots.get(snapshot_id)
            if not snapshot:
                return None
            return {
                "id": snapshot.id,
                "agent_id": snapshot.agent_id,
                "type": snapshot.snapshot_type.value,
                "timestamp": snapshot.timestamp,
                "state": snapshot.state,
                "description": snapshot.description,
                "size_bytes": snapshot.size_bytes
            }

    def get_snapshots(self, agent_id: str, limit: int = 50) -> List[Dict]:
        """Get snapshots for agent."""
        with self._lock:
            snapshot_ids = self._agent_snapshots.get(agent_id, [])
            snapshots = [self._snapshots[sid] for sid in snapshot_ids if sid in self._snapshots]
            snapshots = sorted(snapshots, key=lambda x: x.timestamp, reverse=True)
            return [
                {"id": s.id, "type": s.snapshot_type.value, "timestamp": s.timestamp,
                 "description": s.description, "size_bytes": s.size_bytes}
                for s in snapshots[:limit]
            ]

    def delete_snapshot(self, snapshot_id: str) -> bool:
        """Delete a snapshot."""
        with self._lock:
            snapshot = self._snapshots.get(snapshot_id)
            if not snapshot:
                return False

            agent_id = snapshot.agent_id
            del self._snapshots[snapshot_id]
            if snapshot_id in self._agent_snapshots[agent_id]:
                self._agent_snapshots[agent_id].remove(snapshot_id)
            return True

    def rollback(
        self,
        agent_id: str,
        from_snapshot_id: str,
        to_snapshot_id: str,
        rollback_type: RollbackType = RollbackType.STATE
    ) -> Optional[Dict]:
        """Perform rollback to a snapshot."""
        with self._lock:
            from_snapshot = self._snapshots.get(from_snapshot_id)
            to_snapshot = self._snapshots.get(to_snapshot_id)

            if not from_snapshot or not to_snapshot:
                return None

            rollback_id = str(uuid.uuid4())[:12]
            start_time = time.time()

            rollback = Rollback(
                id=rollback_id,
                agent_id=agent_id,
                from_snapshot_id=from_snapshot_id,
                to_snapshot_id=to_snapshot_id,
                rollback_type=rollback_type,
                status=RollbackStatus.IN_PROGRESS,
                created_at=start_time
            )

            try:
                # Calculate affected keys
                from_keys = set(from_snapshot.state.keys())
                to_keys = set(to_snapshot.state.keys())
                rollback.affected_keys = list(to_keys)

                # Update status
                rollback.status = RollbackStatus.COMPLETED
                rollback.success = True

            except Exception as e:
                rollback.status = RollbackStatus.FAILED
                rollback.success = False
                rollback.error_message = str(e)

            rollback.completed_at = time.time()
            rollback.duration_ms = int((rollback.completed_at - rollback.created_at) * 1000)

            self._rollbacks[rollback_id] = rollback
            if len(self._rollbacks) > self._max_rollbacks:
                oldest = min(self._rollbacks.keys(), key=lambda k: self._rollbacks[k].created_at)
                del self._rollbacks[oldest]

            return {
                "rollback_id": rollback_id,
                "agent_id": agent_id,
                "from_snapshot": from_snapshot_id,
                "to_snapshot": to_snapshot_id,
                "success": rollback.success,
                "duration_ms": rollback.duration_ms,
                "affected_keys": rollback.affected_keys
            }

    def get_rollback(self, rollback_id: str) -> Optional[Dict]:
        """Get rollback by ID."""
        with self._lock:
            rollback = self._rollbacks.get(rollback_id)
            if not rollback:
                return None
            return {
                "id": rollback.id,
                "agent_id": rollback.agent_id,
                "from_snapshot": rollback.from_snapshot_id,
                "to_snapshot": rollback.to_snapshot_id,
                "type": rollback.rollback_type.value,
                "status": rollback.status.value,
                "created_at": rollback.created_at,
                "completed_at": rollback.completed_at,
                "duration_ms": rollback.duration_ms,
                "success": rollback.success,
                "error_message": rollback.error_message,
                "affected_keys": rollback.affected_keys
            }

    def get_rollbacks(self, agent_id: str = None, limit: int = 100) -> List[Dict]:
        """Get rollback history."""
        with self._lock:
            rollbacks = list(self._rollbacks.values())
            if agent_id:
                rollbacks = [r for r in rollbacks if r.agent_id == agent_id]
            rollbacks = sorted(rollbacks, key=lambda x: x.created_at, reverse=True)
            return [
                {"id": r.id, "agent_id": r.agent_id, "from_snapshot": r.from_snapshot_id,
                 "to_snapshot": r.to_snapshot_id, "type": r.rollback_type.value,
                 "status": r.status.value, "created_at": r.created_at, "success": r.success}
                for r in rollbacks[:limit]
            ]

    def get_statistics(self) -> Dict:
        """Get rollback statistics."""
        with self._lock:
            total_rollbacks = len(self._rollbacks)
            successful = sum(1 for r in self._rollbacks.values() if r.success)
            failed = total_rollbacks - successful

            total_snapshots = len(self._snapshots)
            by_type = defaultdict(int)
            by_status = defaultdict(int)

            for s in self._snapshots.values():
                by_type[s.snapshot_type.value] += 1

            for r in self._rollbacks.values():
                by_status[r.status.value] += 1

            return {
                "total_snapshots": total_snapshots,
                "total_rollbacks": total_rollbacks,
                "successful_rollbacks": successful,
                "failed_rollbacks": failed,
                "snapshots_by_type": dict(by_type),
                "rollbacks_by_status": dict(by_status),
                "agents_with_snapshots": len(self._agent_snapshots)
            }


# Global agent rollback manager
agent_rollback = AgentRollbackManager()
