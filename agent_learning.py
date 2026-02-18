"""
Agent Learning Module

Provides learning management, skill acquisition tracking, and knowledge development for agents.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional
from threading import RLock
import uuid


class LearningStatus(Enum):
    """Learning status enumeration."""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    PAUSED = "paused"
    FAILED = "failed"
    EXPIRED = "expired"


class LearningMethod(Enum):
    """Learning methods."""
    SUPERVISED = "supervised"
    SELF_STUDY = "self_study"
    MENTORSHIP = "mentorship"
    PROJECT_BASED = "project_based"
    IMMERSIVE = "immersive"
    MICROLEARNING = "microlearning"
    SOCIAL_LEARNING = "social_learning"
    EXPERIENTIAL = "experiential"


class LearningType(Enum):
    """Types of learning."""
    TECHNICAL = "technical"
    SOFT_SKILLS = "soft_skills"
    DOMAIN = "domain"
    PROCESS = "process"
    TOOL = "tool"
    CERTIFICATION = "certification"
    ON_THE_JOB = "on_the_job"


class LearningSource(Enum):
    """Learning sources."""
    INTERNAL = "internal"
    EXTERNAL = "external"
    THIRD_PARTY = "third_party"
    COMMUNITY = "community"
    SELF_GENERATED = "self_generated"


class ProgressMetric(Enum):
    """Progress measurement types."""
    PERCENTAGE = "percentage"
    MILESTONE = "milestone"
    TIME_BASED = "time_based"
    COMPETENCY_BASED = "competency_based"
    PROJECT_BASED = "project_based"


@dataclass
class LearningResource:
    """Learning resource."""
    id: str = field(default_factory=lambda: f"LR-{uuid.uuid4().hex[:8].upper()}")
    name: str = ""
    type: str = ""
    url: str = ""
    description: str = ""
    duration_hours: float = 0.0
    difficulty: str = "beginner"
    prerequisites: list = field(default_factory=list)
    tags: list = field(default_factory=list)
    rating: float = 0.0
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class LearningPlan:
    """Learning plan."""
    id: str = field(default_factory=lambda: f"LP-{uuid.uuid4().hex[:8].upper()}")
    agent_id: str = ""
    title: str = ""
    description: str = ""
    learning_type: LearningType = LearningType.TECHNICAL
    target_skills: list = field(default_factory=list)
    resources: list = field(default_factory=list)
    estimated_hours: float = 0.0
    actual_hours: float = 0.0
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    target_completion: Optional[str] = None
    status: LearningStatus = LearningStatus.NOT_STARTED


@dataclass
class LearningProgress:
    """Learning progress tracking."""
    id: str = field(default_factory=lambda: f"PROG-{uuid.uuid4().hex[:8].upper()}")
    agent_id: str = ""
    plan_id: str = ""
    progress_percentage: float = 0.0
    current_stage: str = ""
    completed_stages: list = field(default_factory=list)
    pending_stages: list = field(default_factory=list)
    milestones_reached: list = field(default_factory=list)
    time_spent_hours: float = 0.0
    last_activity: Optional[str] = None
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class LearningSession:
    """Learning session record."""
    id: str = field(default_factory=lambda: f"LS-{uuid.uuid4().hex[:8].upper()}")
    agent_id: str = ""
    plan_id: str = ""
    resource_id: str = ""
    method: LearningMethod = LearningMethod.SELF_STUDY
    duration_minutes: float = 0.0
    notes: str = ""
    reflection: str = ""
    completed: bool = False
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class LearningPath:
    """Learning path with multiple plans."""
    id: str = field(default_factory=lambda: f"PATH-{uuid.uuid4().hex[:8].upper()}")
    name: str = ""
    description: str = ""
    plans: list = field(default_factory=list)
    prerequisites: list = field(default_factory=list)
    estimated_total_hours: float = 0.0
    target_roles: list = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class Mentorship:
    """Mentorship relationship."""
    id: str = field(default_factory=lambda: f"MENT-{uuid.uuid4().hex[:8].upper()}")
    mentee_id: str = ""
    mentor_id: str = ""
    topic: str = ""
    goals: list = field(default_factory=list)
    sessions_completed: int = 0
    sessions_total: int = 0
    status: str = "active"
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())
    ended_at: Optional[str] = None


@dataclass
class LearningMetrics:
    """Learning metrics summary."""
    agent_id: str = ""
    total_plans: int = 0
    completed_plans: int = 0
    in_progress_plans: int = 0
    total_hours: float = 0.0
    skills_acquired: list = field(default_factory=list)
    certifications_earned: list = field(default_factory=list)
    average_progress: float = 0.0
    learning_streak: int = 0
    last_learning_date: Optional[str] = None


@dataclass
class LearningConfig:
    """Learning configuration."""
    default_learning_method: LearningMethod = LearningMethod.SELF_STUDY
    auto_recommend_resources: bool = True
    progress_check_interval_days: int = 7
    require_mentorship: bool = False
    min_session_duration_minutes: float = 15.0
    enable_social_learning: bool = True
    certification_validity_months: int = 24


@dataclass
class LearningReport:
    """Learning report."""
    agent_id: str = ""
    period_start: str = ""
    period_end: str = ""
    plans_started: int = 0
    plans_completed: int = 0
    hours_spent: float = 0.0
    skills_developed: list = field(default_factory=list)
    certifications_obtained: list = field(default_factory=list)
    learning_path_progress: dict = field(default_factory=dict)
    recommendations: list = field(default_factory=list)


class LearningManager:
    """Manages agent learning."""

    def __init__(self):
        self._plans: dict[str, LearningPlan] = {}
        self._progress: dict[str, LearningProgress] = {}
        self._sessions: dict[str, List[LearningSession]] = {}
        self._resources: dict[str, LearningResource] = {}
        self._paths: dict[str, LearningPath] = {}
        self._mentorships: dict[str, Mentorship] = {}
        self._lock = RLock()
        self._config = LearningConfig()
        self._initialize_default_resources()

    def _initialize_default_resources(self):
        """Initialize default learning resources."""
        default_resources = [
            LearningResource(
                name="Python Fundamentals",
                type="course",
                description="Basic Python programming",
                duration_hours=20.0,
                difficulty="beginner",
                tags=["python", "programming", "basics"]
            ),
            LearningResource(
                name="API Design Best Practices",
                type="course",
                description="RESTful API design principles",
                duration_hours=10.0,
                difficulty="intermediate",
                tags=["api", "design", "rest"]
            ),
            LearningResource(
                name="System Design",
                type="course",
                description="Large-scale system architecture",
                duration_hours=30.0,
                difficulty="advanced",
                tags=["architecture", "design", "scalability"]
            ),
        ]
        for resource in default_resources:
            self._resources[resource.id] = resource

    def add_resource(self, name: str, resource_type: str = "", url: str = "",
                   description: str = "", duration_hours: float = 0.0,
                   difficulty: str = "beginner", **kwargs) -> LearningResource:
        """Add a learning resource."""
        resource = LearningResource(
            name=name,
            type=resource_type,
            url=url,
            description=description,
            duration_hours=duration_hours,
            difficulty=difficulty,
            **kwargs
        )
        self._resources[resource.id] = resource
        return resource

    def get_resource(self, resource_id: str) -> Optional[LearningResource]:
        """Get a learning resource."""
        return self._resources.get(resource_id)

    def get_all_resources(self, tags: list = None) -> List[LearningResource]:
        """Get all learning resources."""
        resources = list(self._resources.values())
        if tags:
            resources = [r for r in resources if any(t in r.tags for t in tags)]
        return resources

    def create_plan(self, agent_id: str, title: str, description: str = "",
                   learning_type: LearningType = LearningType.TECHNICAL,
                   target_skills: list = None, resource_ids: list = None,
                   estimated_hours: float = 0.0, target_completion: str = None) -> LearningPlan:
        """Create a learning plan."""
        with self._lock:
            plan = LearningPlan(
                agent_id=agent_id,
                title=title,
                description=description,
                learning_type=learning_type,
                target_skills=target_skills or [],
                resources=resource_ids or [],
                estimated_hours=estimated_hours,
                target_completion=target_completion,
                status=LearningStatus.NOT_STARTED
            )
            self._plans[plan.id] = plan
            self._progress[plan.id] = LearningProgress(
                agent_id=agent_id,
                plan_id=plan.id,
                pending_stages=target_skills or []
            )
            self._sessions[plan.id] = []
            return plan

    def get_plan(self, plan_id: str) -> Optional[LearningPlan]:
        """Get a learning plan."""
        return self._plans.get(plan_id)

    def get_agent_plans(self, agent_id: str, status: LearningStatus = None) -> List[LearningPlan]:
        """Get all plans for an agent."""
        plans = [p for p in self._plans.values() if p.agent_id == agent_id]
        if status:
            plans = [p for p in plans if p.status == status]
        return plans

    def update_plan(self, plan_id: str, **kwargs) -> Optional[LearningPlan]:
        """Update a learning plan."""
        with self._lock:
            plan = self._plans.get(plan_id)
            if not plan:
                return None
            for key, value in kwargs.items():
                if hasattr(plan, key):
                    setattr(plan, key, value)
            return plan

    def start_plan(self, plan_id: str) -> Optional[LearningPlan]:
        """Start a learning plan."""
        return self.update_plan(plan_id, status=LearningStatus.IN_PROGRESS)

    def complete_plan(self, plan_id: str) -> Optional[LearningPlan]:
        """Complete a learning plan."""
        with self._lock:
            plan = self.update_plan(plan_id, status=LearningStatus.COMPLETED)
            if plan:
                progress = self._progress.get(plan_id)
                if progress:
                    progress.progress_percentage = 100.0
                    progress.current_stage = "Completed"
                    progress.updated_at = datetime.now().isoformat()
            return plan

    def pause_plan(self, plan_id: str) -> Optional[LearningPlan]:
        """Pause a learning plan."""
        return self.update_plan(plan_id, status=LearningStatus.PAUSED)

    def fail_plan(self, plan_id: str) -> Optional[LearningPlan]:
        """Mark a learning plan as failed."""
        return self.update_plan(plan_id, status=LearningStatus.FAILED)

    def update_progress(self, plan_id: str, progress_percentage: float = None,
                       current_stage: str = None, add_milestone: str = None) -> Optional[LearningProgress]:
        """Update learning progress."""
        with self._lock:
            progress = self._progress.get(plan_id)
            if not progress:
                return None

            if progress_percentage is not None:
                progress.progress_percentage = min(100.0, max(0.0, progress_percentage))
                if progress_percentage >= 100.0:
                    plan = self._plans.get(plan_id)
                    if plan and plan.status == LearningStatus.IN_PROGRESS:
                        plan.status = LearningStatus.COMPLETED

            if current_stage:
                if current_stage not in progress.completed_stages:
                    progress.completed_stages.append(current_stage)
                if current_stage in progress.pending_stages:
                    progress.pending_stages.remove(current_stage)
                progress.current_stage = current_stage

            if add_milestone:
                if add_milestone not in progress.milestones_reached:
                    progress.milestones_reached.append(add_milestone)

            progress.updated_at = datetime.now().isoformat()
            return progress

    def get_progress(self, plan_id: str) -> Optional[LearningProgress]:
        """Get learning progress for a plan."""
        return self._progress.get(plan_id)

    def log_session(self, agent_id: str, plan_id: str, resource_id: str = "",
                  method: LearningMethod = LearningMethod.SELF_STUDY,
                  duration_minutes: float = 0.0, notes: str = "",
                  reflection: str = "", completed: bool = False) -> LearningSession:
        """Log a learning session."""
        with self._lock:
            session = LearningSession(
                agent_id=agent_id,
                plan_id=plan_id,
                resource_id=resource_id,
                method=method,
                duration_minutes=duration_minutes,
                notes=notes,
                reflection=reflection,
                completed=completed
            )

            if plan_id not in self._sessions:
                self._sessions[plan_id] = []
            self._sessions[plan_id].append(session)

            # Update progress time spent
            progress = self._progress.get(plan_id)
            if progress:
                progress.time_spent_hours += duration_minutes / 60.0
                progress.last_activity = session.timestamp
                progress.updated_at = datetime.now().isoformat()

            # Update plan actual hours
            plan = self._plans.get(plan_id)
            if plan:
                plan.actual_hours += duration_minutes / 60.0

            return session

    def get_sessions(self, plan_id: str) -> List[LearningSession]:
        """Get sessions for a plan."""
        return self._sessions.get(plan_id, [])

    def create_learning_path(self, name: str, description: str = "",
                           plan_ids: list = None, estimated_hours: float = 0.0,
                           target_roles: list = None) -> LearningPath:
        """Create a learning path."""
        path = LearningPath(
            name=name,
            description=description,
            plans=plan_ids or [],
            estimated_total_hours=estimated_hours,
            target_roles=target_roles or []
        )
        self._paths[path.id] = path
        return path

    def get_learning_path(self, path_id: str) -> Optional[LearningPath]:
        """Get a learning path."""
        return self._paths.get(path_id)

    def get_all_paths(self) -> List[LearningPath]:
        """Get all learning paths."""
        return list(self._paths.values())

    def assign_learning_path(self, agent_id: str, path_id: str) -> List[LearningPlan]:
        """Assign a learning path to an agent."""
        path = self._paths.get(path_id)
        if not path:
            return []

        plans = []
        for plan_id in path.plans:
            plan = self._plans.get(plan_id)
            if plan:
                plan.agent_id = agent_id
                plan.status = LearningStatus.NOT_STARTED
                plans.append(plan)
        return plans

    def start_mentorship(self, mentee_id: str, mentor_id: str, topic: str = "",
                        goals: list = None, sessions_total: int = 10) -> Mentorship:
        """Start a mentorship relationship."""
        mentorship = Mentorship(
            mentee_id=mentee_id,
            mentor_id=mentor_id,
            topic=topic,
            goals=goals or [],
            sessions_total=sessions_total
        )
        self._mentorships[mentorship.id] = mentorship
        return mentorship

    def get_mentorship(self, mentorship_id: str) -> Optional[Mentorship]:
        """Get a mentorship."""
        return self._mentorships.get(mentorship_id)

    def update_mentorship(self, mentorship_id: str, **kwargs) -> Optional[Mentorship]:
        """Update a mentorship."""
        mentorship = self._mentorships.get(mentorship_id)
        if not mentorship:
            return None
        for key, value in kwargs.items():
            if hasattr(mentorship, key):
                setattr(mentorship, key, value)
        return mentorship

    def complete_mentorship_session(self, mentorship_id: str) -> Optional[Mentorship]:
        """Complete a mentorship session."""
        mentorship = self._mentorships.get(mentorship_id)
        if mentorship:
            mentorship.sessions_completed += 1
            if mentorship.sessions_completed >= mentorship.sessions_total:
                mentorship.status = "completed"
                mentorship.ended_at = datetime.now().isoformat()
        return mentorship

    def get_agent_mentorships(self, agent_id: str) -> List[Mentorship]:
        """Get all mentorships for an agent."""
        return [m for m in self._mentorships.values()
                if m.mentee_id == agent_id or m.mentor_id == agent_id]

    def get_metrics(self, agent_id: str) -> LearningMetrics:
        """Get learning metrics for an agent."""
        with self._lock:
            plans = self.get_agent_plans(agent_id)
            sessions = []
            for plan_id in [p.id for p in plans]:
                sessions.extend(self._sessions.get(plan_id, []))

            total_hours = sum(s.duration_minutes / 60.0 for s in sessions)
            completed = len([p for p in plans if p.status == LearningStatus.COMPLETED])
            in_progress = len([p for p in plans if p.status == LearningStatus.IN_PROGRESS])

            skills = []
            for plan in plans:
                skills.extend(plan.target_skills)

            avg_progress = 0.0
            if plans:
                progress_values = [self._progress.get(p.id, LearningProgress()).progress_percentage
                                 for p in plans]
                avg_progress = sum(progress_values) / len(progress_values)

            return LearningMetrics(
                agent_id=agent_id,
                total_plans=len(plans),
                completed_plans=completed,
                in_progress_plans=in_progress,
                total_hours=total_hours,
                skills_acquired=list(set(skills)),
                average_progress=avg_progress
            )

    def generate_report(self, agent_id: str, period_start: str = None,
                       period_end: str = None) -> LearningReport:
        """Generate a learning report."""
        plans = self.get_agent_plans(agent_id)
        sessions = []
        for plan_id in [p.id for p in plans]:
            sessions.extend(self._sessions.get(plan_id, []))

        start_date = datetime.fromisoformat(period_start) if period_start else datetime.min
        end_date = datetime.fromisoformat(period_end) if period_end else datetime.now()

        filtered_sessions = [s for s in sessions
                           if start_date <= datetime.fromisoformat(s.timestamp) <= end_date]

        hours = sum(s.duration_minutes / 60.0 for s in filtered_sessions)
        skills = []
        certifications = []
        for plan in plans:
            if plan.status == LearningStatus.COMPLETED:
                skills.extend(plan.target_skills)
                if plan.learning_type == LearningType.CERTIFICATION:
                    certifications.append(plan.title)

        recommendations = []
        if hours < 5:
            recommendations.append("Increase learning time to at least 5 hours per week")
        in_progress = [p for p in plans if p.status == LearningStatus.IN_PROGRESS]
        if in_progress:
            recommendations.append(f"Complete {len(in_progress)} in-progress learning plans")

        return LearningReport(
            agent_id=agent_id,
            period_start=period_start or "",
            period_end=period_end or "",
            plans_started=len([p for p in plans]),
            plans_completed=len([p for p in plans if p.status == LearningStatus.COMPLETED]),
            hours_spent=hours,
            skills_developed=list(set(skills)),
            certifications_obtained=certifications,
            recommendations=recommendations
        )

    def get_config(self) -> dict:
        """Get configuration."""
        return {
            "default_learning_method": self._config.default_learning_method.value,
            "auto_recommend_resources": self._config.auto_recommend_resources,
            "progress_check_interval_days": self._config.progress_check_interval_days,
            "require_mentorship": self._config.require_mentorship,
            "min_session_duration_minutes": self._config.min_session_duration_minutes,
            "enable_social_learning": self._config.enable_social_learning,
            "certification_validity_months": self._config.certification_validity_months
        }

    def update_config(self, **kwargs):
        """Update configuration."""
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self._config, key):
                    if key == "default_learning_method" and isinstance(value, str):
                        value = LearningMethod(value)
                    setattr(self._config, key, value)


class AgentLearning:
    """Public API for agent learning."""

    def __init__(self):
        self.manager = LearningManager()

    # Resources
    def add_resource(self, **kwargs) -> LearningResource:
        """Add a learning resource."""
        return self.manager.add_resource(**kwargs)

    def get_resource(self, resource_id: str) -> Optional[LearningResource]:
        """Get a resource."""
        return self.manager.get_resource(resource_id)

    def list_resources(self, tags: list = None) -> List[LearningResource]:
        """List resources."""
        return self.manager.get_all_resources(tags)

    # Plans
    def create_plan(self, agent_id: str, title: str, **kwargs) -> LearningPlan:
        """Create a learning plan."""
        return self.manager.create_plan(agent_id, title, **kwargs)

    def get_plan(self, plan_id: str) -> Optional[LearningPlan]:
        """Get a plan."""
        return self.manager.get_plan(plan_id)

    def list_plans(self, agent_id: str, status: LearningStatus = None) -> List[LearningPlan]:
        """List plans."""
        return self.manager.get_agent_plans(agent_id, status)

    def start_plan(self, plan_id: str) -> Optional[LearningPlan]:
        """Start a plan."""
        return self.manager.start_plan(plan_id)

    def complete_plan(self, plan_id: str) -> Optional[LearningPlan]:
        """Complete a plan."""
        return self.manager.complete_plan(plan_id)

    def pause_plan(self, plan_id: str) -> Optional[LearningPlan]:
        """Pause a plan."""
        return self.manager.pause_plan(plan_id)

    def update_progress(self, plan_id: str, **kwargs) -> Optional[LearningProgress]:
        """Update progress."""
        return self.manager.update_progress(plan_id, **kwargs)

    # Sessions
    def log_session(self, agent_id: str, plan_id: str, **kwargs) -> LearningSession:
        """Log a session."""
        return self.manager.log_session(agent_id, plan_id, **kwargs)

    def get_sessions(self, plan_id: str) -> List[LearningSession]:
        """Get sessions."""
        return self.manager.get_sessions(plan_id)

    # Learning Paths
    def create_path(self, name: str, **kwargs) -> LearningPath:
        """Create a learning path."""
        return self.manager.create_learning_path(name, **kwargs)

    def get_path(self, path_id: str) -> Optional[LearningPath]:
        """Get a learning path."""
        return self.manager.get_learning_path(path_id)

    def list_paths(self) -> List[LearningPath]:
        """List all paths."""
        return self.manager.get_all_paths()

    def assign_path(self, agent_id: str, path_id: str) -> List[LearningPlan]:
        """Assign a path to an agent."""
        return self.manager.assign_learning_path(agent_id, path_id)

    # Mentorship
    def start_mentorship(self, mentee_id: str, mentor_id: str, **kwargs) -> Mentorship:
        """Start mentorship."""
        return self.manager.start_mentorship(mentee_id, mentor_id, **kwargs)

    def get_mentorship(self, mentorship_id: str) -> Optional[Mentorship]:
        """Get mentorship."""
        return self.manager.get_mentorship(mentorship_id)

    def complete_session(self, mentorship_id: str) -> Optional[Mentorship]:
        """Complete mentorship session."""
        return self.manager.complete_mentorship_session(mentorship_id)

    def list_mentorships(self, agent_id: str) -> List[Mentorship]:
        """List mentorships."""
        return self.manager.get_agent_mentorships(agent_id)

    # Metrics & Reports
    def metrics(self, agent_id: str) -> LearningMetrics:
        """Get metrics."""
        return self.manager.get_metrics(agent_id)

    def report(self, agent_id: str, **kwargs) -> LearningReport:
        """Generate report."""
        return self.manager.generate_report(agent_id, **kwargs)

    # Config
    def config(self) -> dict:
        """Get config."""
        return self.manager.get_config()

    def update_config(self, **kwargs):
        """Update config."""
        self.manager.update_config(**kwargs)


# Global instance
agent_learning = AgentLearning()
