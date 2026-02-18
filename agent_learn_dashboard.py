"""
Agent Learn Dashboard Module

Provides learning analytics dashboard for agents.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional
import threading


class DashboardType(Enum):
    """Dashboard type enumeration"""
    OVERVIEW = "overview"
    SKILLS = "skills"
    PROGRESS = "progress"
    ACHIEVEMENTS = "achievements"
    COMPARISON = "comparison"
    CUSTOM = "custom"


class ChartType(Enum):
    """Chart type enumeration"""
    LINE = "line"
    BAR = "bar"
    PIE = "pie"
    RADAR = "radar"
    GAUGE = "gauge"
    HEATMAP = "heatmap"
    SCATTER = "scatter"
    AREA = "area"


class TimeRange(Enum):
    """Time range enumeration"""
    DAY = "day"
    WEEK = "week"
    MONTH = "month"
    QUARTER = "quarter"
    YEAR = "year"
    ALL = "all"


class MetricType(Enum):
    """Metric type enumeration"""
    XP_EARNED = "xp_earned"
    TASKS_COMPLETED = "tasks_completed"
    SKILL_PROGRESS = "skill_progress"
    LEARNING_TIME = "learning_time"
    ASSESSMENT_SCORE = "assessment_score"
    COURSE_PROGRESS = "course_progress"
    MILESTONES = "milestones"
    STREAK = "streak"


class WidgetType(Enum):
    """Widget type enumeration"""
    STAT_CARD = "stat_card"
    CHART = "chart"
    TABLE = "table"
    PROGRESS_BAR = "progress_bar"
    LEADERBOARD = "leaderboard"
    ACTIVITY_FEED = "activity_feed"


@dataclass
class Widget:
    """Dashboard widget"""
    id: str
    type: WidgetType
    title: str
    metric: MetricType
    chart_type: Optional[ChartType] = None
    position_x: int = 0
    position_y: int = 0
    width: int = 1
    height: int = 1
    config: dict = field(default_factory=dict)


@dataclass
class ChartData:
    """Chart data point"""
    label: str
    value: float
    metadata: dict = field(default_factory=dict)


@dataclass
class Chart:
    """Chart configuration and data"""
    id: str
    type: ChartType
    title: str
    labels: List[str] = field(default_factory=list)
    datasets: List[dict] = field(default_factory=list)
    options: dict = field(default_factory=dict)


@dataclass
class LearningMetrics:
    """Learning metrics for an agent"""
    agent_id: str
    total_xp: int = 0
    level: int = 1
    tasks_completed: int = 0
    skills_acquired: int = 0
    courses_completed: int = 0
    assessments_taken: int = 0
    average_score: float = 0.0
    learning_time_hours: float = 0.0
    current_streak: int = 0
    longest_streak: int = 0
    badges_earned: int = 0
    milestones_reached: int = 0
    rank: Optional[int] = None
    percentile: Optional[float] = None
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class SkillProgress:
    """Skill progress tracking"""
    skill_id: str
    skill_name: str
    category: str
    proficiency_level: float = 0.0
    xp_invested: int = 0
    assessments_taken: int = 0
    last_practiced: Optional[datetime] = None


@dataclass
class LearningActivity:
    """Learning activity record"""
    id: str
    agent_id: str
    activity_type: str
    description: str
    xp_earned: int = 0
    skill_id: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class DashboardConfig:
    """Dashboard configuration"""
    default_time_range: TimeRange = TimeRange.WEEK
    refresh_interval_seconds: int = 60
    enable_notifications: bool = True
    enable_export: bool = True
    max_widgets: int = 12
    theme: str = "default"


@dataclass
class Dashboard:
    """Dashboard definition"""
    id: str
    name: str
    type: DashboardType
    agent_id: str
    widgets: List[Widget] = field(default_factory=list)
    time_range: TimeRange = TimeRange.WEEK
    is_default: bool = False
    is_public: bool = False
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class DashboardReport:
    """Dashboard analytics report"""
    dashboard_id: str
    total_views: int = 0
    unique_viewers: int = 0
    average_view_duration: float = 0.0
    most_viewed_widget: Optional[str] = None
    generated_at: datetime = field(default_factory=datetime.now)


class LearnDashboardManager:
    """Manages agent learning dashboards"""

    def __init__(self, config: Optional[DashboardConfig] = None):
        self.config = config or DashboardConfig()
        self._dashboards: dict[str, Dashboard] = {}
        self._metrics: dict[str, LearningMetrics] = {}
        self._skill_progress: dict[str, dict[str, SkillProgress]] = {}  # agent_id -> {skill_id -> progress}
        self._activities: dict[str, List[LearningActivity]] = {}  # agent_id -> [activities]
        self._views: dict[str, int] = {}  # dashboard_id -> view_count
        self._lock = threading.RLock()

    # Dashboard CRUD
    def create_dashboard(
        self,
        id: str,
        name: str,
        type: DashboardType,
        agent_id: str,
        **kwargs
    ) -> Dashboard:
        """Create a new dashboard"""
        with self._lock:
            dashboard = Dashboard(
                id=id,
                name=name,
                type=type,
                agent_id=agent_id,
                **kwargs
            )
            self._dashboards[id] = dashboard
            return dashboard

    def get_dashboard(self, dashboard_id: str) -> Optional[Dashboard]:
        """Get dashboard by ID"""
        with self._lock:
            return self._dashboards.get(dashboard_id)

    def update_dashboard(self, dashboard_id: str, **kwargs) -> Optional[Dashboard]:
        """Update dashboard"""
        with self._lock:
            dashboard = self._dashboards.get(dashboard_id)
            if not dashboard:
                return None
            for key, value in kwargs.items():
                if hasattr(dashboard, key):
                    setattr(dashboard, key, value)
            dashboard.updated_at = datetime.now()
            return dashboard

    def delete_dashboard(self, dashboard_id: str) -> bool:
        """Delete dashboard"""
        with self._lock:
            if dashboard_id in self._dashboards:
                del self._dashboards[dashboard_id]
                return True
            return False

    def list_dashboards(self, agent_id: Optional[str] = None, type: Optional[DashboardType] = None) -> List[Dashboard]:
        """List dashboards"""
        with self._lock:
            dashboards = list(self._dashboards.values())
            if agent_id:
                dashboards = [d for d in dashboards if d.agent_id == agent_id]
            if type:
                dashboards = [d for d in dashboards if d.type == type]
            return dashboards

    # Widget management
    def add_widget(self, dashboard_id: str, widget: Widget) -> Optional[Dashboard]:
        """Add widget to dashboard"""
        with self._lock:
            dashboard = self._dashboards.get(dashboard_id)
            if not dashboard:
                return None
            if len(dashboard.widgets) >= self.config.max_widgets:
                return None
            dashboard.widgets.append(widget)
            dashboard.updated_at = datetime.now()
            return dashboard

    def remove_widget(self, dashboard_id: str, widget_id: str) -> Optional[Dashboard]:
        """Remove widget from dashboard"""
        with self._lock:
            dashboard = self._dashboards.get(dashboard_id)
            if not dashboard:
                return None
            dashboard.widgets = [w for w in dashboard.widgets if w.id != widget_id]
            dashboard.updated_at = datetime.now()
            return dashboard

    # Metrics management
    def update_metrics(self, agent_id: str, **kwargs) -> LearningMetrics:
        """Update learning metrics"""
        with self._lock:
            if agent_id not in self._metrics:
                self._metrics[agent_id] = LearningMetrics(agent_id=agent_id)
            metrics = self._metrics[agent_id]
            for key, value in kwargs.items():
                if hasattr(metrics, key):
                    setattr(metrics, key, value)
            metrics.updated_at = datetime.now()
            return metrics

    def get_metrics(self, agent_id: str) -> Optional[LearningMetrics]:
        """Get learning metrics"""
        with self._lock:
            return self._metrics.get(agent_id)

    # Skill progress
    def update_skill_progress(
        self,
        agent_id: str,
        skill_id: str,
        skill_name: str,
        category: str,
        **kwargs
    ) -> SkillProgress:
        """Update skill progress"""
        with self._lock:
            if agent_id not in self._skill_progress:
                self._skill_progress[agent_id] = {}
            if skill_id not in self._skill_progress[agent_id]:
                self._skill_progress[agent_id][skill_id] = SkillProgress(
                    skill_id=skill_id,
                    skill_name=skill_name,
                    category=category
                )
            progress = self._skill_progress[agent_id][skill_id]
            for key, value in kwargs.items():
                if hasattr(progress, key):
                    setattr(progress, key, value)
            return progress

    def get_skill_progress(self, agent_id: str) -> List[SkillProgress]:
        """Get all skill progress for agent"""
        with self._lock:
            return list(self._skill_progress.get(agent_id, {}).values())

    # Activities
    def add_activity(
        self,
        activity_id: str,
        agent_id: str,
        activity_type: str,
        description: str,
        **kwargs
    ) -> LearningActivity:
        """Add learning activity"""
        with self._lock:
            activity = LearningActivity(
                id=activity_id,
                agent_id=agent_id,
                activity_type=activity_type,
                description=description,
                **kwargs
            )
            if agent_id not in self._activities:
                self._activities[agent_id] = []
            self._activities[agent_id].append(activity)
            return activity

    def get_activities(self, agent_id: str, limit: int = 100) -> List[LearningActivity]:
        """Get learning activities"""
        with self._lock:
            activities = self._activities.get(agent_id, [])
            return activities[-limit:]

    # Analytics
    def get_overview_data(self, agent_id: str) -> dict:
        """Get overview dashboard data"""
        with self._lock:
            metrics = self._metrics.get(agent_id, LearningMetrics(agent_id=agent_id))
            activities = self._activities.get(agent_id, [])[-10:]
            skills = self._skill_progress.get(agent_id, {})

            return {
                "metrics": {
                    "total_xp": metrics.total_xp,
                    "level": metrics.level,
                    "tasks_completed": metrics.tasks_completed,
                    "skills_acquired": metrics.skills_acquired,
                    "current_streak": metrics.current_streak,
                    "badges_earned": metrics.badges_earned
                },
                "recent_activities": [
                    {
                        "type": a.activity_type,
                        "description": a.description,
                        "xp_earned": a.xp_earned,
                        "timestamp": a.timestamp.isoformat()
                    }
                    for a in activities
                ],
                "skill_count": len(skills),
                "progress_percentage": min(metrics.level * 10, 100)
            }

    def get_skill_chart_data(self, agent_id: str, chart_type: ChartType = ChartType.RADAR) -> Chart:
        """Get skill progress chart data"""
        with self._lock:
            skills = self._skill_progress.get(agent_id, {})
            labels = [s.skill_name for s in skills.values()]
            values = [s.proficiency_level for s in skills.values()]

            chart = Chart(
                id=f"skill_chart_{agent_id}",
                type=chart_type,
                title="Skill Progress",
                labels=labels,
                datasets=[{
                    "label": "Proficiency",
                    "data": values,
                    "backgroundColor": "rgba(54, 162, 235, 0.2)",
                    "borderColor": "rgba(54, 162, 235, 1)"
                }]
            )
            return chart

    def get_progress_chart_data(self, agent_id: str, time_range: TimeRange = TimeRange.WEEK) -> Chart:
        """Get progress over time chart data"""
        with self._lock:
            activities = self._activities.get(agent_id, [])
            xp_by_day = {}

            for activity in activities:
                day_key = activity.timestamp.date().isoformat()
                xp_by_day[day_key] = xp_by_day.get(day_key, 0) + activity.xp_earned

            labels = sorted(xp_by_day.keys())
            values = [xp_by_day.get(label, 0) for label in labels]

            chart = Chart(
                id=f"progress_chart_{agent_id}",
                type=ChartType.LINE,
                title="XP Progress Over Time",
                labels=labels[-14:],
                datasets=[{
                    "label": "XP Earned",
                    "data": values[-14:],
                    "backgroundColor": "rgba(75, 192, 192, 0.2)",
                    "borderColor": "rgba(75, 192, 192, 1)",
                    "fill": True
                }]
            )
            return chart

    def get_comparison_data(self, agent_id: str, comparison_agent_ids: List[str]) -> dict:
        """Get comparison data for multiple agents"""
        with self._lock:
            all_metrics = [self._metrics.get(agent_id, LearningMetrics(agent_id=agent_id))]
            for comp_id in comparison_agent_ids:
                all_metrics.append(self._metrics.get(comp_id, LearningMetrics(agent_id=comp_id)))

            return {
                "agents": [
                    {
                        "agent_id": m.agent_id,
                        "total_xp": m.total_xp,
                        "level": m.level,
                        "tasks_completed": m.tasks_completed,
                        "skills_acquired": m.skills_acquired,
                        "average_score": m.average_score
                    }
                    for m in all_metrics
                ]
            }

    # View tracking
    def track_view(self, dashboard_id: str):
        """Track dashboard view"""
        with self._lock:
            self._views[dashboard_id] = self._views.get(dashboard_id, 0) + 1

    def get_view_count(self, dashboard_id: str) -> int:
        """Get dashboard view count"""
        with self._lock:
            return self._views.get(dashboard_id, 0)

    # Report generation
    def generate_report(self, dashboard_id: str) -> Optional[DashboardReport]:
        """Generate dashboard report"""
        with self._lock:
            dashboard = self._dashboards.get(dashboard_id)
            if not dashboard:
                return None

            return DashboardReport(
                dashboard_id=dashboard_id,
                total_views=self._views.get(dashboard_id, 0),
                unique_viewers=0,
                average_view_duration=0.0,
                most_viewed_widget=dashboard.widgets[0].id if dashboard.widgets else None
            )

    # Default dashboards
    def create_default_dashboards(self, agent_id: str):
        """Create default dashboards for agent"""
        with self._lock:
            # Overview dashboard
            overview = self.create_dashboard(
                id=f"overview_{agent_id}",
                name="Learning Overview",
                type=DashboardType.OVERVIEW,
                agent_id=agent_id,
                is_default=True
            )

            # Skills dashboard
            skills = self.create_dashboard(
                id=f"skills_{agent_id}",
                name="Skills Progress",
                type=DashboardType.SKILLS,
                agent_id=agent_id
            )

            # Progress dashboard
            progress = self.create_dashboard(
                id=f"progress_{agent_id}",
                name="Learning Progress",
                type=DashboardType.PROGRESS,
                agent_id=agent_id
            )

            return [overview, skills, progress]


# Global instance
agent_learn_dashboard = LearnDashboardManager()
