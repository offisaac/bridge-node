"""Workflow Monitor Module

Visual workflow execution monitoring dashboard.
"""
import threading
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid


class WorkflowStatus(str, Enum):
    """Workflow execution status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class TaskStatus(str, Enum):
    """Task status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


@dataclass
class WorkflowExecution:
    """Workflow execution record."""
    id: str
    workflow_id: str
    workflow_name: str
    status: WorkflowStatus
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: Optional[str] = None
    current_task: str = ""
    progress: float = 0.0
    metadata: Dict = field(default_factory=dict)


@dataclass
class TaskExecution:
    """Task execution record."""
    id: str
    execution_id: str
    task_name: str
    status: TaskStatus
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: Optional[str] = None
    duration_ms: int = 0
    error: Optional[str] = None


class WorkflowMonitor:
    """Workflow execution monitoring dashboard."""

    def __init__(self):
        self._lock = threading.RLock()
        self._executions: Dict[str, WorkflowExecution] = {}
        self._tasks: Dict[str, List[TaskExecution]] = {}

    def start_workflow(
        self,
        workflow_id: str,
        workflow_name: str,
        metadata: Dict = None
    ) -> str:
        """Start a workflow execution."""
        execution_id = str(uuid.uuid4())[:8]

        execution = WorkflowExecution(
            id=execution_id,
            workflow_id=workflow_id,
            workflow_name=workflow_name,
            status=WorkflowStatus.RUNNING,
            metadata=metadata or {}
        )

        with self._lock:
            self._executions[execution_id] = execution
            self._tasks[execution_id] = []

        return execution_id

    def update_workflow(
        self,
        execution_id: str,
        status: WorkflowStatus = None,
        current_task: str = None,
        progress: float = None
    ):
        """Update workflow execution."""
        with self._lock:
            if execution_id not in self._executions:
                return False

            execution = self._executions[execution_id]
            if status:
                execution.status = status
                if status in [WorkflowStatus.COMPLETED, WorkflowStatus.FAILED, WorkflowStatus.CANCELLED]:
                    execution.completed_at = datetime.now().isoformat()
            if current_task:
                execution.current_task = current_task
            if progress is not None:
                execution.progress = progress

            return True

    def complete_workflow(
        self,
        execution_id: str,
        status: WorkflowStatus = WorkflowStatus.COMPLETED
    ):
        """Complete a workflow execution."""
        self.update_workflow(execution_id, status=status, progress=100.0)

    def start_task(
        self,
        execution_id: str,
        task_name: str
    ) -> str:
        """Start a task execution."""
        task_id = str(uuid.uuid4())[:8]

        task = TaskExecution(
            id=task_id,
            execution_id=execution_id,
            task_name=task_name,
            status=TaskStatus.RUNNING
        )

        with self._lock:
            if execution_id in self._tasks:
                self._tasks[execution_id].append(task)

        return task_id

    def complete_task(
        self,
        task_id: str,
        execution_id: str,
        status: TaskStatus = TaskStatus.COMPLETED,
        error: str = None
    ):
        """Complete a task execution."""
        with self._lock:
            if execution_id not in self._tasks:
                return False

            tasks = self._tasks[execution_id]
            task = next((t for t in tasks if t.id == task_id), None)

            if task:
                task.status = status
                task.completed_at = datetime.now().isoformat()
                if task.started_at and task.completed_at:
                    start = datetime.fromisoformat(task.started_at)
                    end = datetime.fromisoformat(task.completed_at)
                    task.duration_ms = int((end - start).total_seconds() * 1000)
                if error:
                    task.error = error

            return True

    def get_execution(self, execution_id: str) -> Optional[Dict]:
        """Get workflow execution."""
        with self._lock:
            execution = self._executions.get(execution_id)
            if not execution:
                return None

            return {
                "id": execution.id,
                "workflow_id": execution.workflow_id,
                "workflow_name": execution.workflow_name,
                "status": execution.status.value,
                "started_at": execution.started_at,
                "completed_at": execution.completed_at,
                "current_task": execution.current_task,
                "progress": execution.progress,
                "metadata": execution.metadata
            }

    def get_executions(
        self,
        status: WorkflowStatus = None,
        workflow_name: str = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get workflow executions."""
        with self._lock:
            executions = list(self._executions.values())

        if status:
            executions = [e for e in executions if e.status == status]
        if workflow_name:
            executions = [e for e in executions if e.workflow_name == workflow_name]

        executions = sorted(executions, key=lambda x: x.started_at, reverse=True)

        return [
            {
                "id": e.id,
                "workflow_id": e.workflow_id,
                "workflow_name": e.workflow_name,
                "status": e.status.value,
                "started_at": e.started_at,
                "completed_at": e.completed_at,
                "progress": e.progress
            }
            for e in executions[:limit]
        ]

    def get_tasks(self, execution_id: str) -> List[Dict]:
        """Get tasks for an execution."""
        with self._lock:
            tasks = self._tasks.get(execution_id, [])

        return [
            {
                "id": t.id,
                "task_name": t.task_name,
                "status": t.status.value,
                "started_at": t.started_at,
                "completed_at": t.completed_at,
                "duration_ms": t.duration_ms,
                "error": t.error
            }
            for t in tasks
        ]

    def get_stats(self) -> Dict:
        """Get workflow monitoring statistics."""
        with self._lock:
            total = len(self._executions)
            by_status = {}
            running_count = 0

            for execution in self._executions.values():
                status = execution.status.value
                by_status[status] = by_status.get(status, 0) + 1
                if execution.status == WorkflowStatus.RUNNING:
                    running_count += 1

            # Task stats
            total_tasks = sum(len(tasks) for tasks in self._tasks.values())
            completed_tasks = sum(
                1 for tasks in self._tasks.values()
                for t in tasks if t.status == TaskStatus.COMPLETED
            )

            return {
                "total_executions": total,
                "by_status": by_status,
                "running": running_count,
                "total_tasks": total_tasks,
                "completed_tasks": completed_tasks
            }

    def generate_html_dashboard(self) -> str:
        """Generate HTML dashboard."""
        stats = self.get_stats()
        executions = self.get_executions(limit=20)

        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Workflow Monitor</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }}
        h1 {{ color: #333; }}
        .stats {{ display: flex; gap: 20px; margin-bottom: 20px; }}
        .stat-card {{ background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }}
        .stat-card h3 {{ margin: 0 0 10px 0; color: #666; font-size: 14px; }}
        .stat-card .value {{ font-size: 36px; font-weight: bold; }}
        .running {{ color: #2196f3; }}
        .completed {{ color: #4caf50; }}
        .failed {{ color: #f44336; }}
        table {{ width: 100%; border-collapse: collapse; background: white; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
        th {{ background: #f8f8f8; }}
        .progress-bar {{ background: #e0e0e0; height: 20px; border-radius: 4px; overflow: hidden; }}
        .progress-fill {{ background: #4caf50; height: 100%; }}
    </style>
    <meta http-equiv="refresh" content="5">
</head>
<body>
    <h1>Workflow Monitor</h1>

    <div class="stats">
        <div class="stat-card">
            <h3>RUNNING</h3>
            <div class="value running">{stats.get('running', 0)}</div>
        </div>
        <div class="stat-card">
            <h3>COMPLETED</h3>
            <div class="value completed">{stats['by_status'].get('completed', 0)}</div>
        </div>
        <div class="stat-card">
            <h3>FAILED</h3>
            <div class="value failed">{stats['by_status'].get('failed', 0)}</div>
        </div>
        <div class="stat-card">
            <h3>TOTAL TASKS</h3>
            <div class="value">{stats['total_tasks']}</div>
        </div>
    </div>

    <h2>Recent Executions</h2>
    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Workflow</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Started</th>
            </tr>
        </thead>
        <tbody>
"""

        for ex in executions:
            status_class = ex['status']
            html += f"""
            <tr>
                <td>{ex['id']}</td>
                <td>{ex['workflow_name']}</td>
                <td class="{status_class}">{ex['status']}</td>
                <td>
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: {ex['progress']}%"></div>
                    </div>
                </td>
                <td>{ex['started_at']}</td>
            </tr>
"""

        html += """
        </tbody>
    </table>
</body>
</html>"""

        return html


# Global workflow monitor
workflow_monitor = WorkflowMonitor()
