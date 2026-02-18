"""
Agent Recommend Module

Provides course recommendation system for agents based on skills, roles, and performance.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional
import threading


class RecommendationType(Enum):
    """Recommendation type enumeration"""
    SKILL_BASED = "skill_based"
    ROLE_BASED = "role_based"
    PERFORMANCE_BASED = "performance_based"
    CAREER_PATH = "career_path"
    GAP_ANALYSIS = "gap_analysis"
    POPULAR = "popular"
    TRENDING = "trending"
    COLLABORATIVE = "collaborative"


class CourseStatus(Enum):
    """Course status enumeration"""
    DRAFT = "draft"
    PUBLISHED = "published"
    ARCHIVED = "archived"
    UNDER_REVIEW = "under_review"


class CourseDifficulty(Enum):
    """Course difficulty enumeration"""
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"
    EXPERT = "expert"


class EnrollmentStatus(Enum):
    """Enrollment status enumeration"""
    NOT_ENROLLED = "not_enrolled"
    ENROLLED = "enrolled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    DROPPED = "dropped"


@dataclass
class Course:
    """Course definition"""
    id: str
    title: str
    description: str
    category: str
    difficulty: CourseDifficulty
    duration_hours: float
    skills: List[str] = field(default_factory=list)
    prerequisites: List[str] = field(default_factory=list)
    instructor: str = ""
    rating: float = 0.0
    enrollment_count: int = 0
    status: CourseStatus = CourseStatus.DRAFT
    tags: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class CourseModule:
    """Course module/section"""
    id: str
    course_id: str
    title: str
    description: str
    order: int
    duration_hours: float
    skills: List[str] = field(default_factory=list)
    resources: List[str] = field(default_factory=list)


@dataclass
class Enrollment:
    """Agent course enrollment"""
    id: str
    agent_id: str
    course_id: str
    status: EnrollmentStatus = EnrollmentStatus.NOT_ENROLLED
    progress_percent: float = 0.0
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    last_accessed_at: Optional[datetime] = None
    time_spent_hours: float = 0.0
    score: Optional[float] = None
    certificate_earned: bool = False
    certificate_url: str = ""


@dataclass
class AgentProfile:
    """Agent learning profile for recommendations"""
    agent_id: str
    current_role: str = ""
    target_role: str = ""
    skills: dict[str, float] = field(default_factory=dict)  # skill_id -> proficiency
    completed_courses: List[str] = field(default_factory=list)
    enrolled_courses: List[str] = field(default_factory=list)
    interests: List[str] = field(default_factory=list)
    learning_history: List[str] = field(default_factory=list)  # course_ids
    performance_metrics: dict = field(default_factory=dict)
    career_goals: List[str] = field(default_factory=list)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class Recommendation:
    """Course recommendation"""
    id: str
    agent_id: str
    course_id: str
    recommendation_type: RecommendationType
    score: float
    reason: str
    priority: int = 0
    expires_at: Optional[datetime] = None
    dismissed: bool = False
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class LearningPath:
    """Learning path with multiple courses"""
    id: str
    agent_id: str
    title: str
    description: str
    target_role: str
    courses: List[str] = field(default_factory=list)
    estimated_duration_hours: float = 0.0
    progress_percent: float = 0.0
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class RecommendationConfig:
    """Recommendation engine configuration"""
    max_recommendations: int = 10
    min_score_threshold: float = 0.3
    skill_weight: float = 0.4
    role_weight: float = 0.3
    performance_weight: float = 0.2
    trending_window_days: int = 30
    collaborative_threshold: int = 5
    enable_career_path: bool = True
    enable_gap_analysis: bool = True
    recency_boost_days: int = 7


@dataclass
class RecommendationReport:
    """Recommendation analytics report"""
    agent_id: str
    total_recommendations: int = 0
    accepted_count: int = 0
    dismissed_count: int = 0
    completion_rate: float = 0.0
    satisfaction_score: float = 0.0
    generated_at: datetime = field(default_factory=datetime.now)


class RecommendManager:
    """Manages course recommendations for agents"""

    def __init__(self, config: Optional[RecommendationConfig] = None):
        self.config = config or RecommendationConfig()
        self._courses: dict[str, Course] = {}
        self._course_modules: dict[str, List[CourseModule]] = {}  # course_id -> modules
        self._enrollments: dict[str, List[Enrollment]] = {}  # agent_id -> enrollments
        self._agent_profiles: dict[str, AgentProfile] = {}
        self._recommendations: dict[str, List[Recommendation]] = {}  # agent_id -> recommendations
        self._learning_paths: dict[str, List[LearningPath]] = {}  # agent_id -> paths
        self._lock = threading.RLock()

    # Course management
    def create_course(self, id: str, title: str, description: str, category: str,
                      difficulty: CourseDifficulty, duration_hours: float, **kwargs) -> Course:
        """Create a new course"""
        with self._lock:
            course = Course(
                id=id,
                title=title,
                description=description,
                category=category,
                difficulty=difficulty,
                duration_hours=duration_hours,
                **kwargs
            )
            self._courses[id] = course
            return course

    def get_course(self, course_id: str) -> Optional[Course]:
        """Get course by ID"""
        with self._lock:
            return self._courses.get(course_id)

    def update_course(self, course_id: str, **kwargs) -> Optional[Course]:
        """Update course"""
        with self._lock:
            course = self._courses.get(course_id)
            if not course:
                return None
            for key, value in kwargs.items():
                if hasattr(course, key):
                    setattr(course, key, value)
            course.updated_at = datetime.now()
            return course

    def delete_course(self, course_id: str) -> bool:
        """Delete course"""
        with self._lock:
            if course_id in self._courses:
                del self._courses[course_id]
                return True
            return False

    def list_courses(self, category: str = None, difficulty: CourseDifficulty = None,
                     status: CourseStatus = None, limit: int = 100) -> List[Course]:
        """List courses with filters"""
        with self._lock:
            courses = list(self._courses.values())
            if category:
                courses = [c for c in courses if c.category == category]
            if difficulty:
                courses = [c for c in courses if c.difficulty == difficulty]
            if status:
                courses = [c for c in courses if c.status == status]
            return courses[:limit]

    def add_course_module(self, course_id: str, module: CourseModule) -> bool:
        """Add module to course"""
        with self._lock:
            if course_id not in self._courses:
                return False
            if course_id not in self._course_modules:
                self._course_modules[course_id] = []
            self._course_modules[course_id].append(module)
            return True

    def get_course_modules(self, course_id: str) -> List[CourseModule]:
        """Get course modules"""
        with self._lock:
            return self._course_modules.get(course_id, [])

    # Enrollment management
    def enroll_agent(self, agent_id: str, course_id: str) -> Optional[Enrollment]:
        """Enroll agent in course"""
        with self._lock:
            if course_id not in self._courses:
                return None
            if agent_id not in self._enrollments:
                self._enrollments[agent_id] = []
            # Check if already enrolled
            for e in self._enrollments[agent_id]:
                if e.course_id == course_id:
                    return None
            import uuid
            enrollment = Enrollment(
                id=f"enroll_{uuid.uuid4().hex[:8]}",
                agent_id=agent_id,
                course_id=course_id,
                status=EnrollmentStatus.ENROLLED,
                started_at=datetime.now()
            )
            self._enrollments[agent_id].append(enrollment)
            return enrollment

    def get_enrollment(self, agent_id: str, course_id: str) -> Optional[Enrollment]:
        """Get enrollment"""
        with self._lock:
            enrollments = self._enrollments.get(agent_id, [])
            for e in enrollments:
                if e.course_id == course_id:
                    return e
            return None

    def update_enrollment(self, agent_id: str, course_id: str, **kwargs) -> Optional[Enrollment]:
        """Update enrollment"""
        with self._lock:
            enrollment = self.get_enrollment(agent_id, course_id)
            if not enrollment:
                return None
            for key, value in kwargs.items():
                if hasattr(enrollment, key):
                    setattr(enrollment, key, value)
            if kwargs.get("status") == EnrollmentStatus.COMPLETED:
                enrollment.completed_at = datetime.now()
            return enrollment

    def get_agent_enrollments(self, agent_id: str) -> List[Enrollment]:
        """Get all enrollments for agent"""
        with self._lock:
            return self._enrollments.get(agent_id, [])

    # Agent profile management
    def get_or_create_profile(self, agent_id: str) -> AgentProfile:
        """Get or create agent profile"""
        with self._lock:
            if agent_id not in self._agent_profiles:
                self._agent_profiles[agent_id] = AgentProfile(agent_id=agent_id)
            return self._agent_profiles[agent_id]

    def update_profile(self, agent_id: str, **kwargs) -> AgentProfile:
        """Update agent profile"""
        with self._lock:
            profile = self.get_or_create_profile(agent_id)
            for key, value in kwargs.items():
                if hasattr(profile, key):
                    setattr(profile, key, value)
            profile.updated_at = datetime.now()
            return profile

    # Recommendation engine
    def generate_recommendations(self, agent_id: str, limit: int = None) -> List[Recommendation]:
        """Generate personalized recommendations for agent"""
        with self._lock:
            limit = limit or self.config.max_recommendations
            profile = self.get_or_create_profile(agent_id)
            recommendations = []

            # Skill-based recommendations
            skill_recs = self._generate_skill_recommendations(profile)
            recommendations.extend(skill_recs)

            # Role-based recommendations
            role_recs = self._generate_role_recommendations(profile)
            recommendations.extend(role_recs)

            # Performance-based recommendations
            perf_recs = self._generate_performance_recommendations(profile)
            recommendations.extend(perf_recs)

            # Career path recommendations
            if self.config.enable_career_path:
                career_recs = self._generate_career_path_recommendations(profile)
                recommendations.extend(career_recs)

            # Gap analysis recommendations
            if self.config.enable_gap_analysis:
                gap_recs = self._generate_gap_recommendations(profile)
                recommendations.extend(gap_recs)

            # Trending courses
            trending_recs = self._generate_trending_recommendations(profile)
            recommendations.extend(trending_recs)

            # Sort by score and filter
            recommendations.sort(key=lambda r: r.score, reverse=True)
            recommendations = [r for r in recommendations if r.score >= self.config.min_score_threshold]
            recommendations = recommendations[:limit]

            self._recommendations[agent_id] = recommendations
            return recommendations

    def _generate_skill_recommendations(self, profile: AgentProfile) -> List[Recommendation]:
        """Generate skill-based recommendations"""
        recommendations = []
        import uuid
        # Find courses that teach skills the agent doesn't have or needs improvement
        for course in self._courses.values():
            if course.status != CourseStatus.PUBLISHED:
                continue
            if course.id in profile.completed_courses:
                continue
            if course.id in profile.enrolled_courses:
                continue

            # Calculate skill match score
            matching_skills = [s for s in course.skills if s not in profile.skills]
            if matching_skills:
                score = len(matching_skills) / max(len(course.skills), 1) * self.config.skill_weight
                if score >= self.config.min_score_threshold:
                    rec = Recommendation(
                        id=f"rec_{uuid.uuid4().hex[:8]}",
                        agent_id=profile.agent_id,
                        course_id=course.id,
                        recommendation_type=RecommendationType.SKILL_BASED,
                        score=score,
                        reason=f"Learn skills: {', '.join(matching_skills[:3])}"
                    )
                    recommendations.append(rec)
        return recommendations

    def _generate_role_recommendations(self, profile: AgentProfile) -> List[Recommendation]:
        """Generate role-based recommendations"""
        recommendations = []
        import uuid

        if not profile.target_role:
            return recommendations

        # Find courses suitable for target role
        for course in self._courses.values():
            if course.status != CourseStatus.PUBLISHED:
                continue
            if course.id in profile.completed_courses:
                continue
            if course.id in profile.enrolled_courses:
                continue

            # Check if course is relevant for target role (tag matching)
            role_tags = [profile.target_role.lower(), f"role:{profile.target_role.lower()}"]
            relevance = sum(1 for tag in course.tags + [course.category.lower()] if tag in role_tags)

            if relevance > 0:
                score = relevance * self.config.role_weight
                rec = Recommendation(
                    id=f"rec_{uuid.uuid4().hex[:8]}",
                    agent_id=profile.agent_id,
                    course_id=course.id,
                    recommendation_type=RecommendationType.ROLE_BASED,
                    score=score,
                    reason=f"Relevant for {profile.target_role} role"
                )
                recommendations.append(rec)
        return recommendations

    def _generate_performance_recommendations(self, profile: AgentProfile) -> List[Recommendation]:
        """Generate performance-based recommendations"""
        recommendations = []
        import uuid

        # Analyze past performance to recommend courses
        for course in self._courses.values():
            if course.status != CourseStatus.PUBLISHED:
                continue
            if course.id in profile.completed_courses:
                continue

            # Find courses similar to completed ones where agent performed well
            for completed_id in profile.completed_courses:
                completed = self.get_course(completed_id)
                if completed and completed.category == course.category:
                    score = self.config.performance_weight * 0.5
                    rec = Recommendation(
                        id=f"rec_{uuid.uuid4().hex[:8]}",
                        agent_id=profile.agent_id,
                        course_id=course.id,
                        recommendation_type=RecommendationType.PERFORMANCE_BASED,
                        score=score,
                        reason=f"Because you completed {completed.title}"
                    )
                    recommendations.append(rec)
                    break
        return recommendations

    def _generate_career_path_recommendations(self, profile: AgentProfile) -> List[Recommendation]:
        """Generate career path recommendations"""
        recommendations = []
        import uuid

        if not profile.target_role:
            return recommendations

        # Generate learning path based recommendations
        for course in self._courses.values():
            if course.status != CourseStatus.PUBLISHED:
                continue
            if course.id in profile.completed_courses:
                continue

            # Check difficulty progression
            if course.difficulty == CourseDifficulty.BEGINNER and profile.skills:
                score = self.config.skill_weight * 0.3
                rec = Recommendation(
                    id=f"rec_{uuid.uuid4().hex[:8]}",
                    agent_id=profile.agent_id,
                    course_id=course.id,
                    recommendation_type=RecommendationType.CAREER_PATH,
                    score=score,
                    reason=f"Starting point for {profile.target_role} career path"
                )
                recommendations.append(rec)
        return recommendations

    def _generate_gap_analysis_recommendations(self, profile: AgentProfile) -> List[Recommendation]:
        """Generate gap analysis recommendations"""
        recommendations = []
        import uuid

        # Recommend courses to fill skill gaps
        required_skills = set(profile.career_goals)
        current_skills = set(profile.skills.keys())
        gap_skills = required_skills - current_skills

        for course in self._courses.values():
            if course.status != CourseStatus.PUBLISHED:
                continue
            if course.id in profile.completed_courses:
                continue

            course_skills = set(course.skills)
            if course_skills & gap_skills:  # Has some gap skills
                score = len(course_skills & gap_skills) / len(course_skills) * self.config.skill_weight
                rec = Recommendation(
                    id=f"rec_{uuid.uuid4().hex[:8]}",
                    agent_id=profile.agent_id,
                    course_id=course.id,
                    recommendation_type=RecommendationType.GAP_ANALYSIS,
                    score=score,
                    reason=f"Fills skill gaps: {', '.join(list(course_skills & gap_skills)[:2])}"
                )
                recommendations.append(rec)
        return recommendations

    def _generate_trending_recommendations(self, profile: AgentProfile) -> List[Recommendation]:
        """Generate trending course recommendations"""
        recommendations = []
        import uuid

        # Get trending courses by enrollment growth
        trending = sorted(
            [c for c in self._courses.values() if c.status == CourseStatus.PUBLISHED],
            key=lambda c: c.enrollment_count,
            reverse=True
        )[:5]

        for course in trending:
            if course.id in profile.completed_courses:
                continue
            if course.id in profile.enrolled_courses:
                continue

            rec = Recommendation(
                id=f"rec_{uuid.uuid4().hex[:8]}",
                agent_id=profile.agent_id,
                course_id=course.id,
                recommendation_type=RecommendationType.TRENDING,
                score=0.2,
                reason=f"Popular course with {course.enrollment_count} enrollments"
            )
            recommendations.append(rec)
        return recommendations

    def get_recommendations(self, agent_id: str) -> List[Recommendation]:
        """Get cached recommendations"""
        with self._lock:
            return self._recommendations.get(agent_id, [])

    def dismiss_recommendation(self, agent_id: str, recommendation_id: str) -> bool:
        """Dismiss a recommendation"""
        with self._lock:
            recommendations = self._recommendations.get(agent_id, [])
            for rec in recommendations:
                if rec.id == recommendation_id:
                    rec.dismissed = True
                    return True
            return False

    # Learning path management
    def create_learning_path(self, agent_id: str, path_id: str, title: str,
                            description: str, target_role: str, course_ids: List[str]) -> LearningPath:
        """Create a learning path"""
        with self._lock:
            total_duration = sum(
                self._courses.get(cid, Course("", "", "", "", CourseDifficulty.BEGINNER, 0)).duration_hours
                for cid in course_ids
            )
            path = LearningPath(
                id=path_id,
                agent_id=agent_id,
                title=title,
                description=description,
                target_role=target_role,
                courses=course_ids,
                estimated_duration_hours=total_duration
            )
            if agent_id not in self._learning_paths:
                self._learning_paths[agent_id] = []
            self._learning_paths[agent_id].append(path)
            return path

    def get_learning_paths(self, agent_id: str) -> List[LearningPath]:
        """Get learning paths for agent"""
        with self._lock:
            return self._learning_paths.get(agent_id, [])

    def update_learning_path_progress(self, agent_id: str, path_id: str) -> Optional[LearningPath]:
        """Update learning path progress"""
        with self._lock:
            paths = self._learning_paths.get(agent_id, [])
            for path in paths:
                if path.id == path_id:
                    completed = 0
                    enrollments = self._enrollments.get(agent_id, [])
                    for course_id in path.courses:
                        for e in enrollments:
                            if e.course_id == course_id and e.status == EnrollmentStatus.COMPLETED:
                                completed += 1
                    path.progress_percent = (completed / len(path.courses) * 100) if path.courses else 0
                    path.updated_at = datetime.now()
                    return path
            return None

    # Analytics
    def generate_report(self, agent_id: str) -> RecommendationReport:
        """Generate recommendation analytics report"""
        with self._lock:
            recommendations = self._recommendations.get(agent_id, [])
            enrollments = self._enrollments.get(agent_id, [])

            accepted = sum(1 for r in recommendations if not r.dismissed)
            dismissed = sum(1 for r in recommendations if r.dismissed)

            completed_courses = [e for e in enrollments if e.status == EnrollmentStatus.COMPLETED]
            completion_rate = len(completed_courses) / max(len(enrollments), 1) * 100

            return RecommendationReport(
                agent_id=agent_id,
                total_recommendations=len(recommendations),
                accepted_count=accepted,
                dismissed_count=dismissed,
                completion_rate=completion_rate,
                satisfaction_score=accepted / max(len(recommendations), 1) * 5 if recommendations else 0
            )

    def get_popular_courses(self, limit: int = 10) -> List[Course]:
        """Get most popular courses"""
        with self._lock:
            return sorted(
                [c for c in self._courses.values() if c.status == CourseStatus.PUBLISHED],
                key=lambda c: c.enrollment_count,
                reverse=True
            )[:limit]

    def get_course_by_category(self, category: str) -> List[Course]:
        """Get courses by category"""
        with self._lock:
            return [c for c in self._courses.values() if c.category == category and c.status == CourseStatus.PUBLISHED]


# Global instance
agent_recommend = RecommendManager()
