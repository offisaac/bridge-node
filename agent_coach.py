"""
Agent Coach Module

Provides agent coaching scheduling and management system.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional
import threading


class CoachingStatus(Enum):
    """Coaching status enumeration"""
    PENDING = "pending"
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    NO_SHOW = "no_show"


class CoachingType(Enum):
    """Coaching type enumeration"""
    ONE_ON_ONE = "one_on_one"
    GROUP = "group"
    MENTORSHIP = "mentorship"
    PEER = "peer"
    SKILL_WORKSHOP = "skill_workshop"
    PERFORMANCE_COACHING = "performance_coaching"
    CAREER_COACHING = "career_coaching"


class SessionFormat(Enum):
    """Session format enumeration"""
    IN_PERSON = "in_person"
    VIDEO_CALL = "video_call"
    PHONE_CALL = "phone_call"
    CHAT = "chat"
    ASYNCHRONOUS = "asynchronous"


class CoachAvailabilityStatus(Enum):
    """Coach availability status"""
    AVAILABLE = "available"
    BUSY = "busy"
    ON_LEAVE = "on_leave"
    UNAVAILABLE = "unavailable"


@dataclass
class CoachingSession:
    """Coaching session"""
    session_id: str
    coach_id: str
    coachee_id: str
    coaching_type: CoachingType
    title: str
    description: str = ""
    scheduled_at: datetime = field(default_factory=datetime.now)
    duration_minutes: int = 60
    status: CoachingStatus = CoachingStatus.PENDING
    session_format: SessionFormat = SessionFormat.VIDEO_CALL
    meeting_link: str = ""
    notes: str = ""
    outcomes: str = ""
    feedback: str = ""
    rating: Optional[int] = None
    follow_up_required: bool = False
    follow_up_date: Optional[datetime] = None
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class CoachingSchedule:
    """Coaching schedule for a coach"""
    coach_id: str
    available_slots: List[dict] = field(default_factory=list)  # [{"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"}]
    timezone: str = "UTC"
    buffer_minutes: int = 15
    max_sessions_per_day: int = 8
    blocked_dates: List[str] = field(default_factory=list)  # ISO date strings


@dataclass
class CoachProfile:
    """Coach profile"""
    coach_id: str
    name: str
    expertise: List[str] = field(default_factory=list)
    experience_years: int = 0
    certification: List[str] = field(default_factory=list)
    max_coachees: int = 5
    current_coachees: int = 0
    availability_status: CoachAvailabilityStatus = CoachAvailabilityStatus.AVAILABLE
    rating: float = 0.0
    sessions_completed: int = 0
    bio: str = ""
    hourly_rate: float = 0.0
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class CoacheeProfile:
    """Coachee profile"""
    coachee_id: str
    name: str
    role: str = ""
    department: str = ""
    goals: List[str] = field(default_factory=list)
    current_skills: dict = field(default_factory=dict)  # {"skill_name": proficiency_level}
    desired_skills: List[str] = field(default_factory=list)
    coaching_history: List[str] = field(default_factory=list)  # session_ids
    assigned_coach: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class CoachingRelationship:
    """Coaching relationship between coach and coachee"""
    relationship_id: str
    coach_id: str
    coachee_id: str
    coaching_type: CoachingType
    start_date: datetime = field(default_factory=datetime.now)
    end_date: Optional[datetime] = None
    status: str = "active"  # active, paused, terminated
    goals: List[str] = field(default_factory=list)
    progress: dict = field(default_factory=dict)
    meetings_count: int = 0
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class CoachingFeedback:
    """Coaching feedback"""
    feedback_id: str
    session_id: str
    from_coach: bool
    rating: int
    comment: str = ""
    areas_of_improvement: List[str] = field(default_factory=list)
    strengths: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class CoachAvailability:
    """Coach availability slot"""
    slot_id: str
    coach_id: str
    date: str  # ISO date
    start_time: str
    end_time: str
    is_booked: bool = False
    booked_by: Optional[str] = None


@dataclass
class CoachingMetrics:
    """Coaching metrics"""
    coach_id: str
    total_sessions: int = 0
    completed_sessions: int = 0
    cancelled_sessions: int = 0
    average_rating: float = 0.0
    total_coachees: int = 0
    average_session_duration: float = 0.0
    feedback_count: int = 0


class CoachManager:
    """Manages agent coaching"""

    def __init__(self):
        self._sessions: dict[str, CoachingSession] = {}
        self._schedules: dict[str, CoachingSchedule] = {}
        self._coaches: dict[str, CoachProfile] = {}
        self._coachees: dict[str, CoacheeProfile] = {}
        self._relationships: dict[str, CoachingRelationship] = {}
        self._feedback: dict[str, List[CoachingFeedback]] = {}
        self._availability: dict[str, List[CoachAvailability]] = {}
        self._lock = threading.RLock()
        self._initialize_sample_data()

    def _initialize_sample_data(self):
        """Initialize sample coaches and coachees"""
        sample_coaches = [
            CoachProfile(
                coach_id="coach_001",
                name="Sarah Chen",
                expertise=["leadership", "communication", "career development"],
                experience_years=10,
                certification=["ICF PCC", "NLP Master"],
                max_coachees=5,
                rating=4.8,
                bio="Experienced leadership coach with 10+ years in corporate development."
            ),
            CoachProfile(
                coach_id="coach_002",
                name="Michael Roberts",
                expertise=["technical skills", "agile", "team management"],
                experience_years=8,
                certification=["CSP", "SAFe Program Consultant"],
                max_coachees=4,
                rating=4.6,
                bio="Tech industry veteran specializing in agile transformation."
            ),
            CoachProfile(
                coach_id="coach_003",
                name="Emily Watson",
                expertise=["public speaking", "presentation", "communication"],
                experience_years=6,
                certification=["Toastmasters", "Presentation Expert"],
                max_coachees=6,
                rating=4.9,
                bio="Communication expert helping professionals master presentations."
            ),
        ]
        for coach in sample_coaches:
            self._coaches[coach.coach_id] = coach
            self._schedules[coach.coach_id] = CoachingSchedule(
                coach_id=coach.coach_id,
                available_slots=[
                    {"day_of_week": 1, "start_time": "09:00", "end_time": "17:00"},
                    {"day_of_week": 2, "start_time": "09:00", "end_time": "17:00"},
                    {"day_of_week": 3, "start_time": "09:00", "end_time": "17:00"},
                    {"day_of_week": 4, "start_time": "09:00", "end_time": "17:00"},
                    {"day_of_week": 5, "start_time": "09:00", "end_time": "15:00"},
                ]
            )

        sample_coachees = [
            CoacheeProfile(
                coachee_id="agent_001",
                name="Alex Johnson",
                role="Junior Developer",
                department="Engineering",
                goals=["Improve leadership skills", "Learn agile methodologies"],
                current_skills={"python": 4, "java": 3},
                desired_skills=["leadership", "agile", "communication"]
            ),
            CoacheeProfile(
                coachee_id="agent_002",
                name="Jordan Lee",
                role="Team Lead",
                department="Product",
                goals=["Enhance coaching skills", "Better stakeholder management"],
                current_skills={"team_management": 3, "communication": 4},
                desired_skills=["coaching", "strategic thinking"]
            ),
        ]
        for coachee in sample_coachees:
            self._coachees[coachee.coachee_id] = coachee

    # Coach management
    def register_coach(self, coach: CoachProfile) -> CoachProfile:
        """Register a new coach"""
        with self._lock:
            self._coaches[coach.coach_id] = coach
            self._schedules[coach.coach_id] = CoachingSchedule(coach_id=coach.coach_id)
            return coach

    def get_coach(self, coach_id: str) -> Optional[CoachProfile]:
        """Get coach profile"""
        with self._lock:
            return self._coaches.get(coach_id)

    def list_coaches(self, expertise: str = "", availability: str = "") -> List[CoachProfile]:
        """List coaches with optional filters"""
        with self._lock:
            coaches = list(self._coaches.values())
            if expertise:
                coaches = [c for c in coaches if expertise.lower() in [e.lower() for e in c.expertise]]
            if availability:
                coaches = [c for c in coaches if c.availability_status.value == availability]
            return coaches

    def update_coach_availability(self, coach_id: str, status: CoachAvailabilityStatus) -> Optional[CoachProfile]:
        """Update coach availability status"""
        with self._lock:
            coach = self._coaches.get(coach_id)
            if coach:
                coach.availability_status = status
            return coach

    # Coachee management
    def register_coachee(self, coachee: CoacheeProfile) -> CoacheeProfile:
        """Register a new coachee"""
        with self._lock:
            self._coachees[coachee.coachee_id] = coachee
            return coachee

    def get_coachee(self, coachee_id: str) -> Optional[CoacheeProfile]:
        """Get coachee profile"""
        with self._lock:
            return self._coachees.get(coachee_id)

    def list_coachees(self, department: str = "", coach_id: str = "") -> List[CoacheeProfile]:
        """List coachees with optional filters"""
        with self._lock:
            coachees = list(self._coachees.values())
            if department:
                coachees = [c for c in coachees if c.department.lower() == department.lower()]
            if coach_id:
                coachees = [c for c in coachees if c.assigned_coach == coach_id]
            return coachees

    # Coaching session management
    def schedule_session(
        self,
        session_id: str,
        coach_id: str,
        coachee_id: str,
        coaching_type: CoachingType,
        title: str,
        scheduled_at: datetime,
        duration_minutes: int = 60,
        session_format: SessionFormat = SessionFormat.VIDEO_CALL,
        description: str = ""
    ) -> Optional[CoachingSession]:
        """Schedule a coaching session"""
        with self._lock:
            # Verify coach and coachee exist
            if coach_id not in self._coaches or coachee_id not in self._coachees:
                return None

            session = CoachingSession(
                session_id=session_id,
                coach_id=coach_id,
                coachee_id=coachee_id,
                coaching_type=coaching_type,
                title=title,
                description=description,
                scheduled_at=scheduled_at,
                duration_minutes=duration_minutes,
                session_format=session_format,
                status=CoachingStatus.SCHEDULED
            )
            self._sessions[session_id] = session
            return session

    def get_session(self, session_id: str) -> Optional[CoachingSession]:
        """Get coaching session"""
        with self._lock:
            return self._sessions.get(session_id)

    def list_sessions(
        self,
        coach_id: str = "",
        coachee_id: str = "",
        status: CoachingStatus = None
    ) -> List[CoachingSession]:
        """List coaching sessions with filters"""
        with self._lock:
            sessions = list(self._sessions.values())
            if coach_id:
                sessions = [s for s in sessions if s.coach_id == coach_id]
            if coachee_id:
                sessions = [s for s in sessions if s.coachee_id == coachee_id]
            if status:
                sessions = [s for s in sessions if s.status == status]
            return sorted(sessions, key=lambda s: s.scheduled_at)

    def update_session_status(self, session_id: str, status: CoachingStatus) -> Optional[CoachingSession]:
        """Update session status"""
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.status = status
                session.updated_at = datetime.now()
                if status == CoachingStatus.COMPLETED:
                    # Update coach stats
                    coach = self._coaches.get(session.coach_id)
                    if coach:
                        coach.sessions_completed += 1
            return session

    def update_session(
        self,
        session_id: str,
        notes: str = None,
        outcomes: str = None,
        feedback: str = None,
        rating: int = None,
        follow_up_required: bool = None,
        meeting_link: str = None
    ) -> Optional[CoachingSession]:
        """Update session details"""
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                if notes is not None:
                    session.notes = notes
                if outcomes is not None:
                    session.outcomes = outcomes
                if feedback is not None:
                    session.feedback = feedback
                if rating is not None:
                    session.rating = rating
                if follow_up_required is not None:
                    session.follow_up_required = follow_up_required
                    if follow_up_required:
                        session.follow_up_date = datetime.now() + timedelta(days=7)
                if meeting_link is not None:
                    session.meeting_link = meeting_link
                session.updated_at = datetime.now()
            return session

    def cancel_session(self, session_id: str) -> bool:
        """Cancel a coaching session"""
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.status = CoachingStatus.CANCELLED
                session.updated_at = datetime.now()
                return True
            return False

    # Coaching relationship management
    def create_relationship(
        self,
        relationship_id: str,
        coach_id: str,
        coachee_id: str,
        coaching_type: CoachingType,
        goals: List[str] = None
    ) -> Optional[CoachingRelationship]:
        """Create coaching relationship"""
        with self._lock:
            if coach_id not in self._coaches or coachee_id not in self._coachees:
                return None

            relationship = CoachingRelationship(
                relationship_id=relationship_id,
                coach_id=coach_id,
                coachee_id=coachee_id,
                coaching_type=coaching_type,
                goals=goals or []
            )
            self._relationships[relationship_id] = relationship

            # Update coachee's assigned coach
            coachee = self._coachees[coachee_id]
            coachee.assigned_coach = coach_id

            # Update coach's coachee count
            coach = self._coaches[coach_id]
            coach.current_coachees += 1

            return relationship

    def get_relationship(self, relationship_id: str) -> Optional[CoachingRelationship]:
        """Get coaching relationship"""
        with self._lock:
            return self._relationships.get(relationship_id)

    def list_relationships(self, coach_id: str = "", coachee_id: str = "", status: str = "") -> List[CoachingRelationship]:
        """List coaching relationships"""
        with self._lock:
            relationships = list(self._relationships.values())
            if coach_id:
                relationships = [r for r in relationships if r.coach_id == coach_id]
            if coachee_id:
                relationships = [r for r in relationships if r.coachee_id == coachee_id]
            if status:
                relationships = [r for r in relationships if r.status == status]
            return relationships

    def update_relationship_progress(self, relationship_id: str, progress: dict) -> Optional[CoachingRelationship]:
        """Update relationship progress"""
        with self._lock:
            relationship = self._relationships.get(relationship_id)
            if relationship:
                relationship.progress.update(progress)
            return relationship

    # Availability management
    def set_coach_schedule(self, coach_id: str, schedule: CoachingSchedule) -> CoachingSchedule:
        """Set coach schedule"""
        with self._lock:
            self._schedules[coach_id] = schedule
            return schedule

    def get_coach_schedule(self, coach_id: str) -> Optional[CoachingSchedule]:
        """Get coach schedule"""
        with self._lock:
            return self._schedules.get(coach_id)

    def block_date(self, coach_id: str, date: str) -> bool:
        """Block a date for coach"""
        with self._lock:
            schedule = self._schedules.get(coach_id)
            if schedule and date not in schedule.blocked_dates:
                schedule.blocked_dates.append(date)
                return True
            return False

    def get_available_slots(self, coach_id: str, date: str) -> List[dict]:
        """Get available time slots for a coach on a date"""
        with self._lock:
            schedule = self._schedules.get(coach_id)
            if not schedule:
                return []

            # Check if date is blocked
            if date in schedule.blocked_dates:
                return []

            # Parse date
            date_obj = datetime.fromisoformat(date)
            day_of_week = date_obj.weekday()

            # Find available slots for this day
            available = []
            for slot in schedule.available_slots:
                if slot["day_of_week"] == day_of_week:
                    # Generate hourly slots
                    start_hour = int(slot["start_time"].split(":")[0])
                    end_hour = int(slot["end_time"].split(":")[0])
                    for hour in range(start_hour, end_hour):
                        available.append({
                            "date": date,
                            "start_time": f"{hour:02d}:00",
                            "end_time": f"{hour+1:02d}:00",
                            "coach_id": coach_id
                        })

            # Remove booked slots
            availability = self._availability.get(coach_id, [])
            booked = [a.start_time for a in availability if a.date == date and a.is_booked]
            available = [s for s in available if s["start_time"] not in booked]

            return available

    # Feedback management
    def add_feedback(self, feedback: CoachingFeedback) -> CoachingFeedback:
        """Add coaching feedback"""
        with self._lock:
            if feedback.session_id not in self._feedback:
                self._feedback[feedback.session_id] = []
            self._feedback[feedback.session_id].append(feedback)

            # Update session rating
            session = self._sessions.get(feedback.session_id)
            if session:
                session.rating = feedback.rating
                session.feedback = feedback.comment

            return feedback

    def get_feedback(self, session_id: str) -> List[CoachingFeedback]:
        """Get feedback for a session"""
        with self._lock:
            return self._feedback.get(session_id, [])

    def get_coach_feedback(self, coach_id: str) -> List[CoachingFeedback]:
        """Get all feedback for a coach"""
        with self._lock:
            all_feedback = []
            for session_id, feedbacks in self._feedback.items():
                session = self._sessions.get(session_id)
                if session and session.coach_id == coach_id:
                    all_feedback.extend(feedbacks)
            return all_feedback

    # Metrics
    def get_coach_metrics(self, coach_id: str) -> Optional[CoachingMetrics]:
        """Get coaching metrics for a coach"""
        with self._lock:
            coach = self._coaches.get(coach_id)
            if not coach:
                return None

            sessions = self.list_sessions(coach_id=coach_id)
            completed = [s for s in sessions if s.status == CoachingStatus.COMPLETED]
            cancelled = [s for s in sessions if s.status == CoachingStatus.CANCELLED]

            ratings = [s.rating for s in completed if s.rating]
            avg_rating = sum(ratings) / len(ratings) if ratings else 0.0

            durations = [s.duration_minutes for s in completed]
            avg_duration = sum(durations) / len(durations) if durations else 0.0

            return CoachingMetrics(
                coach_id=coach_id,
                total_sessions=len(sessions),
                completed_sessions=len(completed),
                cancelled_sessions=len(cancelled),
                average_rating=avg_rating,
                total_coachees=coach.current_coachees,
                average_session_duration=avg_duration,
                feedback_count=len(self.get_coach_feedback(coach_id))
            )

    # Matchmaking
    def match_coach(self, coachee_id: str) -> List[CoachProfile]:
        """Match best coaches for a coachee"""
        with self._lock:
            coachee = self._coachees.get(coachee_id)
            if not coachee:
                return []

            # Score coaches based on expertise match
            scored_coaches = []
            for coach in self._coaches.values():
                if coach.current_coachees >= coach.max_coachees:
                    continue
                if coach.availability_status != CoachAvailabilityStatus.AVAILABLE:
                    continue

                # Calculate match score
                score = 0
                for desired_skill in coachee.desired_skills:
                    if desired_skill.lower() in [e.lower() for e in coach.expertise]:
                        score += 10

                if score > 0:
                    scored_coaches.append((coach, score + coach.rating))

            # Sort by score
            scored_coaches.sort(key=lambda x: x[1], reverse=True)
            return [c[0] for c in scored_coaches[:5]]


# Global instance
agent_coach = CoachManager()
