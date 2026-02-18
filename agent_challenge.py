"""
Agent Challenge Module

Provides challenge management system for agents.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional
import threading


class ChallengeStatus(Enum):
    """Challenge status enumeration"""
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class ChallengeType(Enum):
    """Challenge type enumeration"""
    SKILL = "skill"
    SPEED = "speed"
    QUALITY = "quality"
    COLLABORATION = "collaboration"
    CREATIVITY = "creativity"
    ENDURANCE = "endurance"
    INNOVATION = "innovation"
    TEAM = "team"
    MILESTONE = "milestone"


class ChallengeDifficulty(Enum):
    """Challenge difficulty enumeration"""
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"
    EXPERT = "expert"
    LEGENDARY = "legendary"


class ParticipationStatus(Enum):
    """Participation status enumeration"""
    REGISTERED = "registered"
    IN_PROGRESS = "in_progress"
    SUBMITTED = "submitted"
    EVALUATING = "evaluating"
    COMPLETED = "completed"
    DISQUALIFIED = "disqualified"


class EvaluationMetric(Enum):
    """Evaluation metric enumeration"""
    ACCURACY = "accuracy"
    SPEED = "speed"
    COMPLETION = "completion"
    CREATIVITY = "creativity"
    EFFICIENCY = "efficiency"
    INNOVATION = "innovation"
    QUALITY = "quality"
    COLLABORATION = "collaboration"


@dataclass
class Challenge:
    """Challenge definition"""
    id: str
    name: str
    description: str
    type: ChallengeType
    difficulty: ChallengeDifficulty
    status: ChallengeStatus = ChallengeStatus.DRAFT
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    registration_deadline: Optional[datetime] = None
    max_participants: Optional[int] = None
    min_participants: int = 1
    reward_points: int = 0
    badges: List[str] = field(default_factory=list)
    requirements: List[str] = field(default_factory=list)
    evaluation_criteria: List[str] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class ChallengeParticipant:
    """Challenge participant"""
    id: str
    challenge_id: str
    agent_id: str
    status: ParticipationStatus = ParticipationStatus.REGISTERED
    score: float = 0.0
    submission: Optional[str] = None
    feedback: Optional[str] = None
    rank: Optional[int] = None
    evaluation_metrics: dict = field(default_factory=dict)
    registered_at: datetime = field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None


@dataclass
class ChallengeTemplate:
    """Challenge template for reusable challenges"""
    id: str
    name: str
    description: str
    type: ChallengeType
    difficulty: ChallengeDifficulty
    default_duration_hours: int
    default_reward_points: int
    default_badges: List[str] = field(default_factory=list)
    default_requirements: List[str] = field(default_factory=list)
    default_evaluation_criteria: List[str] = field(default_factory=list)
    usage_count: int = 0
    created_at: datetime = field(default_factory=datetime.now)


@dataclass
class ChallengeMilestone:
    """Challenge milestone for progress tracking"""
    id: str
    challenge_id: str
    name: str
    description: str
    target_value: float
    bonus_points: int = 0
    bonus_badges: List[str] = field(default_factory=list)
    achieved_by: List[str] = field(default_factory=list)
    achieved_at: Optional[datetime] = None


@dataclass
class ChallengeResult:
    """Challenge result after completion"""
    id: str
    challenge_id: str
    participant_id: str
    agent_id: str
    final_score: float
    rank: int
    percentile: float
    badges_earned: List[str] = field(default_factory=list)
    points_earned: int = 0
    feedback: str = ""
    evaluation_details: dict = field(default_factory=dict)
    completed_at: datetime = field(default_factory=datetime.now)


@dataclass
class ChallengeConfig:
    """Challenge configuration"""
    max_concurrent_challenges: int = 10
    default_registration_deadline_hours: int = 24
    enable_team_challenges: bool = True
    enable_milestones: bool = True
    auto_evaluate: bool = False
    require_verification: bool = True
    leaderboard_integration: bool = True


@dataclass
class ChallengeReport:
    """Challenge analytics report"""
    challenge_id: str
    total_participants: int
    completed_count: int
    average_score: float
    highest_score: float
    lowest_score: float
    median_score: float
    average_completion_time_hours: float
    participation_rate: float
    milestone_achievements: List[dict] = field(default_factory=list)
    top_performers: List[dict] = field(default_factory=list)
    generated_at: datetime = field(default_factory=datetime.now)


class ChallengeManager:
    """Manages agent challenges"""

    def __init__(self, config: Optional[ChallengeConfig] = None):
        self.config = config or ChallengeConfig()
        self._challenges: dict[str, Challenge] = {}
        self._participants: dict[str, dict[str, ChallengeParticipant]] = {}  # challenge_id -> {agent_id -> participant}
        self._templates: dict[str, ChallengeTemplate] = {}
        self._milestones: dict[str, dict[str, ChallengeMilestone]] = {}  # challenge_id -> {milestone_id -> milestone}
        self._results: dict[str, List[ChallengeResult]] = {}  # challenge_id -> [results]
        self._lock = threading.RLock()

    # Challenge CRUD
    def create_challenge(
        self,
        id: str,
        name: str,
        description: str,
        type: ChallengeType,
        difficulty: ChallengeDifficulty,
        **kwargs
    ) -> Challenge:
        """Create a new challenge"""
        with self._lock:
            challenge = Challenge(
                id=id,
                name=name,
                description=description,
                type=type,
                difficulty=difficulty,
                **kwargs
            )
            self._challenges[id] = challenge
            self._participants[id] = {}
            self._milestones[id] = {}
            self._results[id] = []
            return challenge

    def get_challenge(self, challenge_id: str) -> Optional[Challenge]:
        """Get challenge by ID"""
        with self._lock:
            return self._challenges.get(challenge_id)

    def update_challenge(self, challenge_id: str, **kwargs) -> Optional[Challenge]:
        """Update challenge"""
        with self._lock:
            challenge = self._challenges.get(challenge_id)
            if not challenge:
                return None
            for key, value in kwargs.items():
                if hasattr(challenge, key):
                    setattr(challenge, key, value)
            challenge.updated_at = datetime.now()
            return challenge

    def delete_challenge(self, challenge_id: str) -> bool:
        """Delete challenge"""
        with self._lock:
            if challenge_id in self._challenges:
                del self._challenges[challenge_id]
                del self._participants[challenge_id]
                del self._milestones[challenge_id]
                del self._results[challenge_id]
                return True
            return False

    def list_challenges(
        self,
        status: Optional[ChallengeStatus] = None,
        type: Optional[ChallengeType] = None,
        difficulty: Optional[ChallengeDifficulty] = None
    ) -> List[Challenge]:
        """List challenges with optional filters"""
        with self._lock:
            challenges = list(self._challenges.values())
            if status:
                challenges = [c for c in challenges if c.status == status]
            if type:
                challenges = [c for c in challenges if c.type == type]
            if difficulty:
                challenges = [c for c in challenges if c.difficulty == difficulty]
            return challenges

    # Participant management
    def register_participant(
        self,
        challenge_id: str,
        agent_id: str,
        participant_id: str
    ) -> Optional[ChallengeParticipant]:
        """Register an agent for a challenge"""
        with self._lock:
            challenge = self._challenges.get(challenge_id)
            if not challenge:
                return None
            if challenge.max_participants and len(self._participants[challenge_id]) >= challenge.max_participants:
                return None
            participant = ChallengeParticipant(
                id=participant_id,
                challenge_id=challenge_id,
                agent_id=agent_id
            )
            self._participants[challenge_id][agent_id] = participant
            return participant

    def get_participant(self, challenge_id: str, agent_id: str) -> Optional[ChallengeParticipant]:
        """Get participant"""
        with self._lock:
            return self._participants.get(challenge_id, {}).get(agent_id)

    def update_participant(
        self,
        challenge_id: str,
        agent_id: str,
        **kwargs
    ) -> Optional[ChallengeParticipant]:
        """Update participant"""
        with self._lock:
            participant = self._participants.get(challenge_id, {}).get(agent_id)
            if not participant:
                return None
            for key, value in kwargs.items():
                if hasattr(participant, key):
                    setattr(participant, key, value)
            return participant

    def remove_participant(self, challenge_id: str, agent_id: str) -> bool:
        """Remove participant from challenge"""
        with self._lock:
            if challenge_id in self._participants and agent_id in self._participants[challenge_id]:
                del self._participants[challenge_id][agent_id]
                return True
            return False

    def list_participants(self, challenge_id: str) -> List[ChallengeParticipant]:
        """List all participants for a challenge"""
        with self._lock:
            return list(self._participants.get(challenge_id, {}).values())

    # Challenge templates
    def create_template(
        self,
        id: str,
        name: str,
        description: str,
        type: ChallengeType,
        difficulty: ChallengeDifficulty,
        default_duration_hours: int,
        default_reward_points: int,
        **kwargs
    ) -> ChallengeTemplate:
        """Create challenge template"""
        with self._lock:
            template = ChallengeTemplate(
                id=id,
                name=name,
                description=description,
                type=type,
                difficulty=difficulty,
                default_duration_hours=default_duration_hours,
                default_reward_points=default_reward_points,
                **kwargs
            )
            self._templates[id] = template
            return template

    def get_template(self, template_id: str) -> Optional[ChallengeTemplate]:
        """Get template"""
        with self._lock:
            return self._templates.get(template_id)

    def create_challenge_from_template(
        self,
        template_id: str,
        challenge_id: str,
        name: str,
        description: str,
        **kwargs
    ) -> Optional[Challenge]:
        """Create challenge from template"""
        with self._lock:
            template = self._templates.get(template_id)
            if not template:
                return None
            template.usage_count += 1
            return self.create_challenge(
                id=challenge_id,
                name=name,
                description=description,
                type=template.type,
                difficulty=template.difficulty,
                reward_points=kwargs.get('reward_points', template.default_reward_points),
                badges=kwargs.get('badges', template.default_badges),
                requirements=kwargs.get('requirements', template.default_requirements),
                evaluation_criteria=kwargs.get('evaluation_criteria', template.default_evaluation_criteria),
                **kwargs
            )

    # Milestones
    def add_milestone(
        self,
        challenge_id: str,
        milestone_id: str,
        name: str,
        description: str,
        target_value: float,
        **kwargs
    ) -> Optional[ChallengeMilestone]:
        """Add milestone to challenge"""
        with self._lock:
            if challenge_id not in self._challenges:
                return None
            milestone = ChallengeMilestone(
                id=milestone_id,
                challenge_id=challenge_id,
                name=name,
                description=description,
                target_value=target_value,
                **kwargs
            )
            self._milestones[challenge_id][milestone_id] = milestone
            return milestone

    def get_milestone(self, challenge_id: str, milestone_id: str) -> Optional[ChallengeMilestone]:
        """Get milestone"""
        with self._lock:
            return self._milestones.get(challenge_id, {}).get(milestone_id)

    def check_milestone_achievement(
        self,
        challenge_id: str,
        milestone_id: str,
        agent_id: str,
        current_value: float
    ) -> Optional[ChallengeMilestone]:
        """Check and update milestone achievement"""
        with self._lock:
            milestone = self._milestones.get(challenge_id, {}).get(milestone_id)
            if not milestone:
                return None
            if current_value >= milestone.target_value and agent_id not in milestone.achieved_by:
                milestone.achieved_by.append(agent_id)
                milestone.achieved_at = datetime.now()
            return milestone

    # Results
    def create_result(
        self,
        result_id: str,
        challenge_id: str,
        participant_id: str,
        agent_id: str,
        final_score: float,
        rank: int,
        percentile: float,
        **kwargs
    ) -> ChallengeResult:
        """Create challenge result"""
        with self._lock:
            result = ChallengeResult(
                id=result_id,
                challenge_id=challenge_id,
                participant_id=participant_id,
                agent_id=agent_id,
                final_score=final_score,
                rank=rank,
                percentile=percentile,
                **kwargs
            )
            self._results[challenge_id].append(result)
            return result

    def get_results(self, challenge_id: str) -> List[ChallengeResult]:
        """Get all results for a challenge"""
        with self._lock:
            return self._results.get(challenge_id, [])

    def get_agent_results(self, agent_id: str) -> List[ChallengeResult]:
        """Get all results for an agent"""
        with self._lock:
            results = []
            for challenge_results in self._results.values():
                results.extend([r for r in challenge_results if r.agent_id == agent_id])
            return results

    # Analytics
    def generate_report(self, challenge_id: str) -> Optional[ChallengeReport]:
        """Generate challenge report"""
        with self._lock:
            challenge = self._challenges.get(challenge_id)
            if not challenge:
                return None

            results = self._results.get(challenge_id, [])
            participants = self._participants.get(challenge_id, {})

            if not results:
                return None

            scores = [r.final_score for r in results]
            sorted_scores = sorted(scores)

            report = ChallengeReport(
                challenge_id=challenge_id,
                total_participants=len(participants),
                completed_count=len([p for p in participants.values() if p.status == ParticipationStatus.COMPLETED]),
                average_score=sum(scores) / len(scores) if scores else 0.0,
                highest_score=max(scores) if scores else 0.0,
                lowest_score=min(scores) if scores else 0.0,
                median_score=sorted_scores[len(sorted_scores) // 2] if sorted_scores else 0.0,
                average_completion_time_hours=0.0,  # Would need started/submitted times
                participation_rate=len(participants) / challenge.max_participants if challenge.max_participants else 0.0,
                milestone_achievements=[
                    {
                        "milestone_id": m.id,
                        "name": m.name,
                        "achieved_count": len(m.achieved_by)
                    }
                    for m in self._milestones.get(challenge_id, {}).values()
                ],
                top_performers=[
                    {
                        "agent_id": r.agent_id,
                        "rank": r.rank,
                        "score": r.final_score
                    }
                    for r in sorted(results, key=lambda x: x.final_score, reverse=True)[:5]
                ]
            )
            return report

    def get_challenge_stats(self, challenge_id: str) -> dict:
        """Get challenge statistics"""
        with self._lock:
            challenge = self._challenges.get(challenge_id)
            if not challenge:
                return {}

            participants = self._participants.get(challenge_id, {})
            results = self._results.get(challenge_id, [])

            return {
                "challenge_id": challenge_id,
                "name": challenge.name,
                "status": challenge.status.value,
                "total_participants": len(participants),
                "registered": len([p for p in participants.values() if p.status == ParticipationStatus.REGISTERED]),
                "in_progress": len([p for p in participants.values() if p.status == ParticipationStatus.IN_PROGRESS]),
                "completed": len([p for p in participants.values() if p.status == ParticipationStatus.COMPLETED]),
                "total_results": len(results),
                "milestones": len(self._milestones.get(challenge_id, {})),
                "average_score": sum([r.final_score for r in results]) / len(results) if results else 0.0
            }


# Global instance
agent_challenge = ChallengeManager()
