"""Agent Warmup Module

Agent startup warmup system with preloading and readiness verification.
"""
import time
import threading
import uuid
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from collections import defaultdict


class WarmupState(str, Enum):
    """Warmup states."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    READY = "ready"
    FAILED = "failed"
    TIMEOUT = "timeout"


class WarmupPhase(str, Enum):
    """Warmup phases."""
    INITIALIZATION = "initialization"
    CONFIGURATION = "configuration"
    RESOURCE_LOADING = "resource_loading"
    DEPENDENCY_CHECK = "dependency_check"
    HEALTH_CHECK = "health_check"
    READINESS = "readiness"


class ResourceType(str, Enum):
    """Resource types for warmup."""
    MEMORY = "memory"
    NETWORK = "network"
    DATABASE = "database"
    CACHE = "cache"
    MODEL = "model"
    CONFIG = "config"


@dataclass
class WarmupTask:
    """Individual warmup task."""
    id: str
    phase: WarmupPhase
    name: str
    description: str
    resource_type: ResourceType
    status: WarmupState
    started_at: float = 0
    completed_at: float = 0
    duration_ms: int = 0
    error: str = ""
    retry_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentWarmup:
    """Agent warmup configuration."""
    agent_id: str
    state: WarmupState
    started_at: float = 0
    completed_at: float = 0
    total_duration_ms: int = 0
    tasks: List[WarmupTask] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class WarmupConfig:
    """Warmup configuration."""
    timeout_seconds: int = 300
    retry_enabled: bool = True
    max_retries: int = 3
    parallel_execution: bool = True
    health_check_interval: int = 5


class AgentWarmupManager:
    """Manage agent warmup."""

    def __init__(self):
        self._lock = threading.RLock()
        self._warmups: Dict[str, AgentWarmup] = {}
        self._warmup_tasks: Dict[str, List[WarmupTask]] = defaultdict(list)
        self._config = WarmupConfig()
        self._task_handlers: Dict[str, Callable] = {}
        self._default_tasks = self._create_default_tasks()

    def _create_default_tasks(self) -> List[Dict]:
        """Create default warmup tasks."""
        return [
            {
                "phase": WarmupPhase.INITIALIZATION,
                "name": "initialize_agent",
                "description": "Initialize agent context and state",
                "resource_type": ResourceType.MEMORY
            },
            {
                "phase": WarmupPhase.CONFIGURATION,
                "name": "load_config",
                "description": "Load agent configuration",
                "resource_type": ResourceType.CONFIG
            },
            {
                "phase": WarmupPhase.RESOURCE_LOADING,
                "name": "load_resources",
                "description": "Load required resources",
                "resource_type": ResourceType.MEMORY
            },
            {
                "phase": WarmupPhase.DEPENDENCY_CHECK,
                "name": "check_dependencies",
                "description": "Verify all dependencies are available",
                "resource_type": ResourceType.NETWORK
            },
            {
                "phase": WarmupPhase.HEALTH_CHECK,
                "name": "health_check",
                "description": "Perform health checks",
                "resource_type": ResourceType.MEMORY
            },
            {
                "phase": WarmupPhase.READINESS,
                "name": "verify_readiness",
                "description": "Verify agent is ready to serve",
                "resource_type": ResourceType.MEMORY
            }
        ]

    def configure(self, timeout_seconds: int = 300, retry_enabled: bool = True, max_retries: int = 3, parallel_execution: bool = True):
        """Configure warmup settings."""
        with self._lock:
            self._config = WarmupConfig(
                timeout_seconds=timeout_seconds,
                retry_enabled=retry_enabled,
                max_retries=max_retries,
                parallel_execution=parallel_execution
            )

    def register_task_handler(self, task_name: str, handler: Callable):
        """Register a task handler."""
        with self._lock:
            self._task_handlers[task_name] = handler

    def start_warmup(
        self,
        agent_id: str,
        custom_tasks: List[Dict] = None,
        metadata: Dict[str, Any] = None
    ) -> str:
        """Start warmup for an agent."""
        with self._lock:
            # Check if already warming up
            existing = self._warmups.get(agent_id)
            if existing and existing.state == WarmupState.IN_PROGRESS:
                return None

            warmup_id = str(uuid.uuid4())[:12]
            tasks = custom_tasks or self._default_tasks

            warmup = AgentWarmup(
                agent_id=agent_id,
                state=WarmupState.IN_PROGRESS,
                started_at=time.time(),
                metadata=metadata or {}
            )

            # Create warmup tasks
            for task_def in tasks:
                task = WarmupTask(
                    id=str(uuid.uuid4())[:12],
                    phase=task_def["phase"],
                    name=task_def["name"],
                    description=task_def["description"],
                    resource_type=task_def["resource_type"],
                    status=WarmupState.PENDING,
                    metadata=task_def.get("metadata", {})
                )
                warmup.tasks.append(task)
                self._warmup_tasks[warmup_id].append(task)

            self._warmups[warmup_id] = warmup
            self._warmups[agent_id] = warmup  # Index by agent_id too

            # Start warmup in background
            threading.Thread(target=self._run_warmup, args=(warmup_id, agent_id), daemon=True).start()

            return warmup_id

    def _run_warmup(self, warmup_id: str, agent_id: str):
        """Run warmup tasks."""
        warmup = self._warmups.get(warmup_id)
        if not warmup:
            return

        start_time = time.time()

        for task in warmup.tasks:
            # Check timeout
            if time.time() - start_time > self._config.timeout_seconds:
                task.status = WarmupState.TIMEOUT
                task.error = "Warmup timeout exceeded"
                continue

            task.status = WarmupState.IN_PROGRESS
            task.started_at = time.time()

            # Execute task
            try:
                handler = self._task_handlers.get(task.name)
                if handler:
                    handler(agent_id, task.metadata)
                # Simulate successful task (in real implementation, handler would do the work)
                task.status = WarmupState.READY
            except Exception as e:
                task.status = WarmupState.FAILED
                task.error = str(e)
                if self._config.retry_enabled and task.retry_count < self._config.max_retries:
                    task.retry_count += 1
                    task.status = WarmupState.PENDING

            task.completed_at = time.time()
            task.duration_ms = int((task.completed_at - task.started_at) * 1000) if task.started_at else 0

        # Update warmup state
        failed_tasks = [t for t in warmup.tasks if t.status == WarmupState.FAILED]
        if failed_tasks:
            warmup.state = WarmupState.FAILED
        else:
            warmup.state = WarmupState.READY

        warmup.completed_at = time.time()
        warmup.total_duration_ms = int((warmup.completed_at - warmup.started_at) * 1000)

    def get_warmup(self, warmup_id: str = None, agent_id: str = None) -> Optional[Dict]:
        """Get warmup status."""
        with self._lock:
            if warmup_id:
                warmup = self._warmups.get(warmup_id)
            elif agent_id:
                warmup = self._warmups.get(agent_id)
            else:
                return None

            if not warmup:
                return None

            return {
                "agent_id": warmup.agent_id,
                "state": warmup.state.value,
                "started_at": warmup.started_at,
                "completed_at": warmup.completed_at,
                "total_duration_ms": warmup.total_duration_ms,
                "tasks": [
                    {
                        "id": t.id,
                        "phase": t.phase.value,
                        "name": t.name,
                        "description": t.description,
                        "status": t.status.value,
                        "started_at": t.started_at,
                        "completed_at": t.completed_at,
                        "duration_ms": t.duration_ms,
                        "error": t.error,
                        "retry_count": t.retry_count
                    }
                    for t in warmup.tasks
                ],
                "metadata": warmup.metadata
            }

    def get_agent_warmup(self, agent_id: str) -> Optional[Dict]:
        """Get warmup status for agent."""
        return self.get_warmup(agent_id=agent_id)

    def is_ready(self, agent_id: str) -> bool:
        """Check if agent is ready."""
        with self._lock:
            warmup = self._warmups.get(agent_id)
            if not warmup:
                return False
            return warmup.state == WarmupState.READY

    def get_ready_agents(self) -> List[str]:
        """Get list of ready agents."""
        with self._lock:
            return [
                agent_id for agent_id, warmup in self._warmups.items()
                if isinstance(agent_id, str) and warmup.state == WarmupState.READY
            ]

    def cancel_warmup(self, agent_id: str) -> bool:
        """Cancel warmup for an agent."""
        with self._lock:
            warmup = self._warmups.get(agent_id)
            if not warmup or warmup.state != WarmupState.IN_PROGRESS:
                return False

            for task in warmup.tasks:
                if task.status == WarmupState.PENDING or task.status == WarmupState.IN_PROGRESS:
                    task.status = WarmupState.FAILED
                    task.error = "Warmup cancelled"

            warmup.state = WarmupState.FAILED
            warmup.completed_at = time.time()
            warmup.total_duration_ms = int((warmup.completed_at - warmup.started_at) * 1000)
            return True

    def restart_warmup(self, agent_id: str) -> str:
        """Restart warmup for an agent."""
        with self._lock:
            # Cancel existing if any
            self.cancel_warmup(agent_id)
            # Start new warmup
            return self.start_warmup(agent_id)

    def get_statistics(self) -> Dict:
        """Get warmup statistics."""
        with self._lock:
            total = len(self._warmups)
            ready = sum(1 for w in self._warmups.values() if w.state == WarmupState.READY)
            in_progress = sum(1 for w in self._warmups.values() if w.state == WarmupState.IN_PROGRESS)
            failed = sum(1 for w in self._warmups.values() if w.state == WarmupState.FAILED)

            by_phase = defaultdict(int)
            total_duration = 0
            for warmup in self._warmups.values():
                total_duration += warmup.total_duration_ms
                for task in warmup.tasks:
                    by_phase[task.phase.value] += 1

            avg_duration = int(total_duration / total) if total > 0 else 0

            return {
                "total_warmups": total,
                "ready_agents": ready,
                "in_progress": in_progress,
                "failed": failed,
                "average_duration_ms": avg_duration,
                "tasks_by_phase": dict(by_phase)
            }


# Global agent warmup instance
agent_warmup = AgentWarmupManager()
