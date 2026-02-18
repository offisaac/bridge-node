"""
Agent Competency Matrix Module

Provides competency tracking, skill assessment, and proficiency management for agents.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional
from threading import RLock
import uuid


class CompetencyStatus(Enum):
    """Competency status enumeration."""
    ASSESSING = "assessing"
    VERIFIED = "verified"
    EXPIRED = "expired"
    PENDING = "pending"


class ProficiencyLevel(Enum):
    """Proficiency levels."""
    NOVICE = 1
    BEGINNER = 2
    INTERMEDIATE = 3
    ADVANCED = 4
    EXPERT = 5
    MASTER = 6


class AssessmentType(Enum):
    """Assessment types."""
    SELF = "self"
    PEER = "peer"
    MANAGER = "manager"
    AUTOMATED = "automated"
    CERTIFICATION = "certification"


class SkillCategory(Enum):
    """Skill categories."""
    TECHNICAL = "technical"
    DOMAIN = "domain"
    SOFT = "soft"
    PROCESS = "process"
    TOOL = "tool"
    LANGUAGE = "language"


@dataclass
class Competency:
    """Competency definition."""
    id: str = field(default_factory=lambda: f"COMP-{uuid.uuid4().hex[:8].upper()}")
    agent_id: str = ""
    skill_name: str = ""
    skill_category: SkillCategory = SkillCategory.TECHNICAL
    proficiency_level: ProficiencyLevel = ProficiencyLevel.NOVICE
    status: CompetencyStatus = CompetencyStatus.PENDING
    assessed_by: str = ""
    assessed_at: Optional[str] = None
    valid_until: Optional[str] = None
    evidence: list = field(default_factory=list)
    notes: str = ""
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class SkillDefinition:
    """Skill definition template."""
    id: str = field(default_factory=lambda: f"SKILL-{uuid.uuid4().hex[:8].upper()}")
    name: str = ""
    category: SkillCategory = SkillCategory.TECHNICAL
    description: str = ""
    proficiency_descriptions: dict = field(default_factory=dict)
    certifications: list = field(default_factory=list)
    related_skills: list = field(default_factory=list)


@dataclass
class Assessment:
    """Competency assessment."""
    id: str = field(default_factory=lambda: f"ASSESS-{uuid.uuid4().hex[:8].upper()}")
    competency_id: str = ""
    agent_id: str = ""
    assessor_id: str = ""
    assessment_type: AssessmentType = AssessmentType.SELF
    proficiency_level: ProficiencyLevel = ProficiencyLevel.NOVICE
    score: float = 0.0
    max_score: float = 100.0
    feedback: str = ""
    evidence: list = field(default_factory=list)
    assessed_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class CompetencyMetrics:
    """Competency metrics summary."""
    agent_id: str = ""
    total_skills: int = 0
    verified_skills: int = 0
    pending_skills: int = 0
    average_proficiency: float = 0.0
    skill_gaps: list = field(default_factory=list)
    strongest_area: str = ""
    weakest_area: str = ""


@dataclass
class CompetencyConfig:
    """Competency configuration."""
    verification_required: bool = True
    certification_weight: float = 0.3
    peer_review_weight: float = 0.2
    self_assessment_weight: float = 0.1
    automated_weight: float = 0.4
    expiry_months: int = 12
    min_proficiency_for_verified: ProficiencyLevel = ProficiencyLevel.INTERMEDIATE


@dataclass
class CompetencyReport:
    """Competency report."""
    agent_id: str = ""
    total_competencies: int = 0
    verified_count: int = 0
    pending_count: int = 0
    average_proficiency: float = 0.0
    skill_matrix: dict = field(default_factory=dict)
    recommendations: list = field(default_factory=list)
    upcoming_expirations: list = field(default_factory=list)


class CompetencyManager:
    """Manages agent competencies."""

    def __init__(self):
        self._competencies: dict[str, Competency] = {}
        self._assessments: dict[str, List[Assessment]] = {}
        self._skill_definitions: dict[str, SkillDefinition] = {}
        self._lock = RLock()
        self._config = CompetencyConfig()
        self._initialize_default_skills()

    def _initialize_default_skills(self):
        """Initialize default skill definitions."""
        default_skills = [
            SkillDefinition(name="Python", category=SkillCategory.TECHNICAL,
                          proficiency_descriptions={"1": "Can read simple code", "3": "Can write production code",
                                                   "5": "Can design frameworks", "6": "Can create new paradigms"}),
            SkillDefinition(name="API Design", category=SkillCategory.TECHNICAL,
                          proficiency_descriptions={"1": "Understands basic APIs", "3": "Can design REST APIs",
                                                   "5": "Can design complex API systems"}),
            SkillDefinition(name="Testing", category=SkillCategory.TECHNICAL,
                          proficiency_descriptions={"1": "Can run tests", "3": "Can write unit tests",
                                                   "5": "Can design test strategies"}),
            SkillDefinition(name="Problem Solving", category=SkillCategory.SOFT,
                          proficiency_descriptions={"1": "Needs guidance", "3": "Can solve known problems",
                                                   "5": "Can tackle novel problems"}),
            SkillDefinition(name="Communication", category=SkillCategory.SOFT,
                          proficiency_descriptions={"1": "Basic communication", "3": "Clear written communication",
                                                   "5": "Excellent presentation skills"}),
            SkillDefinition(name="Domain Knowledge", category=SkillCategory.DOMAIN,
                          proficiency_descriptions={"1": "Basic domain understanding", "3": "Good domain expertise",
                                                   "5": "Subject matter expert"}),
        ]
        for skill in default_skills:
            self._skill_definitions[skill.name] = skill

    def add_skill_definition(self, name: str, category: SkillCategory = SkillCategory.TECHNICAL,
                            description: str = "", proficiency_descriptions: dict = None) -> SkillDefinition:
        """Add a skill definition."""
        skill = SkillDefinition(
            name=name,
            category=category,
            description=description,
            proficiency_descriptions=proficiency_descriptions or {}
        )
        self._skill_definitions[skill.name] = skill
        return skill

    def get_skill_definitions(self) -> List[SkillDefinition]:
        """Get all skill definitions."""
        return list(self._skill_definitions.values())

    def register_competency(self, agent_id: str, skill_name: str,
                          skill_category: SkillCategory = SkillCategory.TECHNICAL) -> Optional[Competency]:
        """Register a new competency for an agent."""
        with self._lock:
            # Check if already exists
            existing = self._get_competency_by_agent_skill(agent_id, skill_name)
            if existing:
                return existing

            competency = Competency(
                agent_id=agent_id,
                skill_name=skill_name,
                skill_category=skill_category
            )
            self._competencies[competency.id] = competency
            self._assessments[competency.id] = []
            return competency

    def _get_competency_by_agent_skill(self, agent_id: str, skill_name: str) -> Optional[Competency]:
        """Get competency by agent and skill."""
        for comp in self._competencies.values():
            if comp.agent_id == agent_id and comp.skill_name == skill_name:
                return comp
        return None

    def get_competency(self, competency_id: str) -> Optional[Competency]:
        """Get competency by ID."""
        return self._competencies.get(competency_id)

    def get_agent_competencies(self, agent_id: str, status: CompetencyStatus = None) -> List[Competency]:
        """Get all competencies for an agent."""
        with self._lock:
            comps = [c for c in self._competencies.values() if c.agent_id == agent_id]
            if status:
                comps = [c for c in comps if c.status == status]
            return sorted(comps, key=lambda c: c.proficiency_level.value, reverse=True)

    def add_assessment(self, competency_id: str, assessor_id: str,
                      assessment_type: AssessmentType, proficiency_level: ProficiencyLevel,
                      score: float, max_score: float = 100.0,
                      feedback: str = "", evidence: list = None) -> Optional[Assessment]:
        """Add an assessment to a competency."""
        with self._lock:
            competency = self._competencies.get(competency_id)
            if not competency:
                return None

            assessment = Assessment(
                competency_id=competency_id,
                agent_id=competency.agent_id,
                assessor_id=assessor_id,
                assessment_type=assessment_type,
                proficiency_level=proficiency_level,
                score=score,
                max_score=max_score,
                feedback=feedback,
                evidence=evidence or []
            )

            # Calculate weighted proficiency
            competency.assessed_by = assessor_id
            competency.assessed_at = assessment.assessed_at
            competency.proficiency_level = proficiency_level

            # Determine status based on assessment type
            if assessment_type == AssessmentType.CERTIFICATION:
                competency.status = CompetencyStatus.VERIFIED
                competency.notes = f"Certified: {feedback}"
            elif assessment_type == AssessmentType.PEER and score >= 70:
                competency.status = CompetencyStatus.VERIFIED
            else:
                competency.status = CompetencyStatus.ASSESSING

            competency.updated_at = datetime.now().isoformat()
            self._assessments[competency_id].append(assessment)
            return assessment

    def verify_competency(self, competency_id: str) -> Optional[Competency]:
        """Manually verify a competency."""
        with self._lock:
            competency = self._competencies.get(competency_id)
            if not competency:
                return None
            competency.status = CompetencyStatus.VERIFIED
            competency.updated_at = datetime.now().isoformat()
            return competency

    def expire_competency(self, competency_id: str) -> Optional[Competency]:
        """Expire a competency."""
        with self._lock:
            competency = self._competencies.get(competency_id)
            if not competency:
                return None
            competency.status = CompetencyStatus.EXPIRED
            competency.updated_at = datetime.now().isoformat()
            return competency

    def get_assessments(self, competency_id: str) -> List[Assessment]:
        """Get assessments for a competency."""
        return self._assessments.get(competency_id, [])

    def get_metrics(self, agent_id: str) -> CompetencyMetrics:
        """Get competency metrics for an agent."""
        with self._lock:
            comps = self.get_agent_competencies(agent_id)
            if not comps:
                return CompetencyMetrics(agent_id=agent_id)

            total = len(comps)
            verified = len([c for c in comps if c.status == CompetencyStatus.VERIFIED])
            pending = len([c for c in comps if c.status == CompetencyStatus.PENDING])
            avg_prof = sum(c.proficiency_level.value for c in comps) / total if total > 0 else 0

            # Find skill gaps (skills with low proficiency)
            skill_gaps = [c.skill_name for c in comps if c.proficiency_level.value <= 2]

            # Find strongest and weakest areas
            by_category = {}
            for c in comps:
                cat = c.skill_category.value
                if cat not in by_category:
                    by_category[cat] = []
                by_category[cat].append(c.proficiency_level.value)

            strongest = max(by_category.items(), key=lambda x: sum(x[1])/len(x[1]) if x[1] else 0)
            weakest = min(by_category.items(), key=lambda x: sum(x[1])/len(x[1]) if x[1] else 0)

            return CompetencyMetrics(
                agent_id=agent_id,
                total_skills=total,
                verified_skills=verified,
                pending_skills=pending,
                average_proficiency=avg_prof,
                skill_gaps=skill_gaps,
                strongest_area=strongest[0] if strongest[1] else "",
                weakest_area=weakest[0] if weakest[1] else ""
            )

    def generate_report(self, agent_id: str) -> CompetencyReport:
        """Generate competency report."""
        with self._lock:
            comps = self.get_agent_competencies(agent_id)
            if not comps:
                return CompetencyReport(agent_id=agent_id)

            verified = [c for c in comps if c.status == CompetencyStatus.VERIFIED]
            pending = [c for c in comps if c.status == CompetencyStatus.PENDING]
            avg_prof = sum(c.proficiency_level.value for c in comps) / len(comps)

            # Build skill matrix by category
            skill_matrix = {}
            for c in comps:
                cat = c.skill_category.value
                if cat not in skill_matrix:
                    skill_matrix[cat] = {}
                skill_matrix[cat][c.skill_name] = c.proficiency_level.value

            # Find upcoming expirations (competencies close to expiry date)
            upcoming_expirations = []
            now = datetime.now()
            for c in comps:
                if c.valid_until:
                    exp_date = datetime.fromisoformat(c.valid_until)
                    days_until = (exp_date - now).days
                    if 0 < days_until <= 30:
                        upcoming_expirations.append({"skill": c.skill_name, "expires": c.valid_until})

            # Recommendations
            recommendations = []
            if len(pending) > len(verified):
                recommendations.append("Complete pending competency assessments")
            low_skills = [c.skill_name for c in comps if c.proficiency_level.value <= 2]
            if low_skills:
                recommendations.append(f"Focus on improving: {', '.join(low_skills[:3])}")
            if avg_prof < 3:
                recommendations.append("Aim for intermediate proficiency in core skills")

            return CompetencyReport(
                agent_id=agent_id,
                total_competencies=len(comps),
                verified_count=len(verified),
                pending_count=len(pending),
                average_proficiency=avg_prof,
                skill_matrix=skill_matrix,
                recommendations=recommendations,
                upcoming_expirations=upcoming_expirations
            )

    def get_config(self) -> dict:
        """Get configuration."""
        return {
            "verification_required": self._config.verification_required,
            "certification_weight": self._config.certification_weight,
            "peer_review_weight": self._config.peer_review_weight,
            "self_assessment_weight": self._config.self_assessment_weight,
            "automated_weight": self._config.automated_weight,
            "expiry_months": self._config.expiry_months,
            "min_proficiency_for_verified": self._config.min_proficiency_for_verified.value
        }

    def update_config(self, **kwargs):
        """Update configuration."""
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self._config, key):
                    if key == "min_proficiency_for_verified" and isinstance(value, int):
                        value = ProficiencyLevel(value)
                    setattr(self._config, key, value)


class AgentCompetency:
    """Public API for agent competency."""

    def __init__(self):
        self.manager = CompetencyManager()

    def register(self, agent_id: str, skill_name: str, **kwargs) -> Optional[Competency]:
        """Register a competency."""
        return self.manager.register_competency(agent_id, skill_name, **kwargs)

    def get(self, competency_id: str) -> Optional[Competency]:
        """Get competency by ID."""
        return self.manager.get_competency(competency_id)

    def list(self, agent_id: str, status: CompetencyStatus = None) -> List[Competency]:
        """List agent competencies."""
        return self.manager.get_agent_competencies(agent_id, status)

    def assess(self, competency_id: str, assessor_id: str, assessment_type: AssessmentType,
              proficiency_level: ProficiencyLevel, score: float, **kwargs) -> Optional[Assessment]:
        """Add assessment."""
        return self.manager.add_assessment(competency_id, assessor_id, assessment_type,
                                         proficiency_level, score, **kwargs)

    def verify(self, competency_id: str) -> Optional[Competency]:
        """Verify competency."""
        return self.manager.verify_competency(competency_id)

    def expire(self, competency_id: str) -> Optional[Competency]:
        """Expire competency."""
        return self.manager.expire_competency(competency_id)

    def metrics(self, agent_id: str) -> CompetencyMetrics:
        """Get metrics."""
        return self.manager.get_metrics(agent_id)

    def report(self, agent_id: str) -> CompetencyReport:
        """Generate report."""
        return self.manager.generate_report(agent_id)

    def skills(self) -> List[SkillDefinition]:
        """Get skill definitions."""
        return self.manager.get_skill_definitions()


# Global instance
agent_competency = AgentCompetency()
