"""
Agent Goal Tracking Module

Provides goal setting, tracking, and progress monitoring for agents.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional
from threading import RLock
import uuid


class GoalStatus(Enum):
    """Goal status enumeration."""
    DRAFT = "draft"
    ACTIVE = "active"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    BLOCKED = "blocked"


class GoalPriority(Enum):
    """Goal priority levels."""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class GoalCategory(Enum):
    """Goal categories."""
    PERFORMANCE = "performance"
    LEARNING = "learning"
    COLLABORATION = "collaboration"
    INNOVATION = "innovation"
    RELIABILITY = "reliability"
    EFFICIENCY = "efficiency"
    CUSTOM = "custom"


class ProgressTrend(Enum):
    """Progress trend indicators."""
    IMPROVING = "improving"
    STABLE = "stable"
    DECLINING = "declining"
    UNKNOWN = "unknown"


@dataclass
class Goal:
    """Goal definition."""
    id: str = field(default_factory=lambda: f"GOAL-{uuid.uuid4().hex[:8].upper()}")
    agent_id: str = ""
    title: str = ""
    description: str = ""
    category: GoalCategory = GoalCategory.PERFORMANCE
    priority: GoalPriority = GoalPriority.MEDIUM
    status: GoalStatus = GoalStatus.DRAFT
    target_value: float = 0.0
    current_value: float = 0.0
    unit: str = ""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: Optional[str] = None
    milestones: list = field(default_factory=list)
    dependencies: list = field(default_factory=list)
    tags: list = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


@dataclass
class GoalProgress:
    """Goal progress tracking."""
    id: str = field(default_factory=lambda: f"PROG-{uuid.uuid4().hex[:8].upper()}")
    goal_id: str = ""
    value: float = 0.0
    note: str = ""
    recorded_at: str = field(default_factory=lambda: datetime.now().isoformat())
    recorded_by: str = "system"


@dataclass
class Milestone:
    """Milestone within a goal."""
    id: str = field(default_factory=lambda: f"MS-{uuid.uuid4().hex[:8].upper()}")
    title: str = ""
    description: str = ""
    target_value: float = 0.0
    completed: bool = False
    completed_at: Optional[str] = None


@dataclass
class GoalMetrics:
    """Goal metrics summary."""
    agent_id: str = ""
    period: str = ""
    total_goals: int = 0
    active_goals: int = 0
    completed_goals: int = 0
    completion_rate: float = 0.0
    average_progress: float = 0.0
    on_track_goals: int = 0
    at_risk_goals: int = 0
    overdue_goals: int = 0


@dataclass
class GoalConfig:
    """Goal tracking configuration."""
    default_horizon_days: int = 90
    enable_milestones: bool = True
    enable_dependencies: bool = True
    auto_expire: bool = True
    notify_on_blocked: bool = True
    default_priority: GoalPriority = GoalPriority.MEDIUM
    progress_check_interval_hours: int = 24


@dataclass
class GoalReport:
    """Goal progress report."""
    agent_id: str = ""
    period: str = ""
    total_goals: int = 0
    completed: int = 0
    in_progress: int = 0
    blocked: int = 0
    average_completion: float = 0.0
    top_goals: list = field(default_factory=list)
    at_risk_goals: list = field(default_factory=list)
    recommendations: list = field(default_factory=list)


class GoalManager:
    """Manages agent goals."""

    def __init__(self):
        self._goals: dict[str, Goal] = {}
        self._progress: dict[str, List[GoalProgress]] = {}
        self._lock = RLock()
        self._config = GoalConfig()

    def create_goal(self, agent_id: str, title: str, description: str = "",
                    category: GoalCategory = GoalCategory.PERFORMANCE,
                    priority: GoalPriority = GoalPriority.MEDIUM,
                    target_value: float = 100.0, unit: str = "%",
                    end_date: Optional[str] = None, milestones: list = None,
                    tags: list = None, metadata: dict = None) -> Goal:
        """Create a new goal."""
        with self._lock:
            goal = Goal(
                agent_id=agent_id,
                title=title,
                description=description,
                category=category,
                priority=priority,
                target_value=target_value,
                unit=unit,
                end_date=end_date,
                milestones=milestones or [],
                tags=tags or [],
                metadata=metadata or {},
                status=GoalStatus.ACTIVE
            )
            self._goals[goal.id] = goal
            self._progress[goal.id] = []
            return goal

    def get_goal(self, goal_id: str) -> Optional[Goal]:
        """Get goal by ID."""
        return self._goals.get(goal_id)

    def update_goal(self, goal_id: str, **kwargs) -> Optional[Goal]:
        """Update goal attributes."""
        with self._lock:
            goal = self._goals.get(goal_id)
            if not goal:
                return None
            for key, value in kwargs.items():
                if hasattr(goal, key):
                    setattr(goal, key, value)
            goal.updated_at = datetime.now().isoformat()
            return goal

    def update_progress(self, goal_id: str, value: float, note: str = "",
                       recorded_by: str = "system") -> Optional[GoalProgress]:
        """Update goal progress."""
        with self._lock:
            goal = self._goals.get(goal_id)
            if not goal:
                return None
            progress = GoalProgress(
                goal_id=goal_id,
                value=value,
                note=note,
                recorded_by=recorded_by
            )
            goal.current_value = value
            goal.updated_at = datetime.now().isoformat()

            # Check milestones
            for milestone in goal.milestones:
                if not milestone.completed and value >= milestone.target_value:
                    milestone.completed = True
                    milestone.completed_at = datetime.now().isoformat()

            # Check completion
            if value >= goal.target_value:
                goal.status = GoalStatus.COMPLETED
                goal.completed_at = datetime.now().isoformat()

            self._progress[goal_id].append(progress)
            return progress

    def complete_goal(self, goal_id: str) -> Optional[Goal]:
        """Mark goal as completed."""
        with self._lock:
            goal = self._goals.get(goal_id)
            if not goal:
                return None
            goal.status = GoalStatus.COMPLETED
            goal.completed_at = datetime.now().isoformat()
            goal.updated_at = datetime.now().isoformat()
            return goal

    def cancel_goal(self, goal_id: str) -> Optional[Goal]:
        """Cancel a goal."""
        with self._lock:
            goal = self._goals.get(goal_id)
            if not goal:
                return None
            goal.status = GoalStatus.CANCELLED
            goal.updated_at = datetime.now().isoformat()
            return goal

    def block_goal(self, goal_id: str, reason: str = "") -> Optional[Goal]:
        """Block a goal."""
        with self._lock:
            goal = self._goals.get(goal_id)
            if not goal:
                return None
            goal.status = GoalStatus.BLOCKED
            if reason:
                goal.metadata["block_reason"] = reason
            goal.updated_at = datetime.now().isoformat()
            return goal

    def get_agent_goals(self, agent_id: str, status: GoalStatus = None) -> List[Goal]:
        """Get all goals for an agent."""
        with self._lock:
            goals = [g for g in self._goals.values() if g.agent_id == agent_id]
            if status:
                goals = [g for g in goals if g.status == status]
            return sorted(goals, key=lambda g: g.priority.value, reverse=True)

    def get_progress_history(self, goal_id: str) -> List[GoalProgress]:
        """Get progress history for a goal."""
        return self._progress.get(goal_id, [])

    def add_milestone(self, goal_id: str, title: str, description: str = "",
                     target_value: float = 0.0) -> Optional[Milestone]:
        """Add milestone to goal."""
        with self._lock:
            goal = self._goals.get(goal_id)
            if not goal:
                return None
            milestone = Milestone(
                title=title,
                description=description,
                target_value=target_value
            )
            goal.milestones.append(milestone)
            return milestone

    def get_milestones(self, goal_id: str) -> List[Milestone]:
        """Get milestones for a goal."""
        goal = self._goals.get(goal_id)
        return goal.milestones if goal else []

    def get_metrics(self, agent_id: str, period: str = "30d") -> GoalMetrics:
        """Get goal metrics for agent."""
        with self._lock:
            goals = self.get_agent_goals(agent_id)
            if not goals:
                return GoalMetrics(agent_id=agent_id, period=period)

            total = len(goals)
            active = len([g for g in goals if g.status in [GoalStatus.ACTIVE, GoalStatus.IN_PROGRESS]])
            completed = len([g for g in goals if g.status == GoalStatus.COMPLETED])

            total_progress = sum(g.current_value / g.target_value * 100 for g in goals if g.target_value > 0)
            avg_progress = total_progress / total if total > 0 else 0

            on_track = len([g for g in goals if g.status == GoalStatus.ACTIVE and
                          (g.current_value / g.target_value * 100 >= 50 if g.target_value > 0 else False)])
            at_risk = len([g for g in goals if g.status == GoalStatus.BLOCKED])

            return GoalMetrics(
                agent_id=agent_id,
                period=period,
                total_goals=total,
                active_goals=active,
                completed_goals=completed,
                completion_rate=completed / total * 100 if total > 0 else 0,
                average_progress=avg_progress,
                on_track_goals=on_track,
                at_risk_goals=at_risk,
                overdue_goals=0
            )

    def generate_report(self, agent_id: str, period: str = "30d") -> GoalReport:
        """Generate goal report."""
        with self._lock:
            goals = self.get_agent_goals(agent_id)
            if not goals:
                return GoalReport(agent_id=agent_id, period=period)

            completed = [g for g in goals if g.status == GoalStatus.COMPLETED]
            in_progress = [g for g in goals if g.status == GoalStatus.IN_PROGRESS]
            blocked = [g for g in goals if g.status == GoalStatus.BLOCKED]

            total_completion = sum(
                g.current_value / g.target_value * 100 for g in goals if g.target_value > 0
            )
            avg_completion = total_completion / len(goals) if goals else 0

            # Top goals (highest priority)
            top_goals = sorted(goals, key=lambda g: g.priority.value, reverse=True)[:5]
            top_goals_data = [{"id": g.id, "title": g.title, "progress": g.current_value / g.target_value * 100 if g.target_value > 0 else 0} for g in top_goals]

            # At-risk goals
            at_risk = [g for g in goals if g.status in [GoalStatus.BLOCKED, GoalStatus.EXPIRED]]
            at_risk_data = [{"id": g.id, "title": g.title, "status": g.status.value} for g in at_risk]

            # Recommendations
            recommendations = []
            if avg_completion < 50:
                recommendations.append("Consider breaking down goals into smaller milestones")
            if len(blocked) > 0:
                recommendations.append("Review and unblock stalled goals")
            if len(in_progress) == 0 and len(completed) < len(goals):
                recommendations.append("Set new goals to maintain momentum")

            return GoalReport(
                agent_id=agent_id,
                period=period,
                total_goals=len(goals),
                completed=len(completed),
                in_progress=len(in_progress),
                blocked=len(blocked),
                average_completion=avg_completion,
                top_goals=top_goals_data,
                at_risk_goals=at_risk_data,
                recommendations=recommendations
            )

    def get_config(self) -> dict:
        """Get configuration."""
        return {
            "default_horizon_days": self._config.default_horizon_days,
            "enable_milestones": self._config.enable_milestones,
            "enable_dependencies": self._config.enable_dependencies,
            "auto_expire": self._config.auto_expire,
            "notify_on_blocked": self._config.notify_on_blocked,
            "default_priority": self._config.default_priority.value,
            "progress_check_interval_hours": self._config.progress_check_interval_hours
        }

    def update_config(self, **kwargs):
        """Update configuration."""
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self._config, key):
                    setattr(self._config, key, value)


class AgentGoal:
    """Public API for agent goal tracking."""

    def __init__(self):
        self.manager = GoalManager()

    def create(self, agent_id: str, title: str, **kwargs) -> Goal:
        """Create a new goal."""
        return self.manager.create_goal(agent_id, title, **kwargs)

    def get(self, goal_id: str) -> Optional[Goal]:
        """Get goal by ID."""
        return self.manager.get_goal(goal_id)

    def update(self, goal_id: str, **kwargs) -> Optional[Goal]:
        """Update goal."""
        return self.manager.update_goal(goal_id, **kwargs)

    def progress(self, goal_id: str, value: float, **kwargs) -> Optional[GoalProgress]:
        """Update progress."""
        return self.manager.update_progress(goal_id, value, **kwargs)

    def complete(self, goal_id: str) -> Optional[Goal]:
        """Complete goal."""
        return self.manager.complete_goal(goal_id)

    def cancel(self, goal_id: str) -> Optional[Goal]:
        """Cancel goal."""
        return self.manager.cancel_goal(goal_id)

    def block(self, goal_id: str, reason: str = "") -> Optional[Goal]:
        """Block goal."""
        return self.manager.block_goal(goal_id, reason)

    def list(self, agent_id: str, status: GoalStatus = None) -> List[Goal]:
        """List agent goals."""
        return self.manager.get_agent_goals(agent_id, status)

    def metrics(self, agent_id: str, period: str = "30d") -> GoalMetrics:
        """Get metrics."""
        return self.manager.get_metrics(agent_id, period)

    def report(self, agent_id: str, period: str = "30d") -> GoalReport:
        """Generate report."""
        return self.manager.generate_report(agent_id, period)


# Global instance
agent_goal = AgentGoal()
