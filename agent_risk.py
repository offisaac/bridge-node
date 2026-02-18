"""Agent Risk Module

Risk assessment and management for agents including risk scoring, risk categories,
risk mitigation, and risk monitoring.
"""
import time
import uuid
import threading
import hashlib
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class RiskLevel(str, Enum):
    """Risk level types."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    MINIMAL = "minimal"


class RiskCategory(str, Enum):
    """Risk category types."""
    FINANCIAL = "financial"
    OPERATIONAL = "operational"
    COMPLIANCE = "compliance"
    SECURITY = "security"
    REPUTATIONAL = "reputational"
    STRATEGIC = "strategic"
    TECHNICAL = "technical"
    LEGAL = "legal"


class RiskStatus(str, Enum):
    """Risk status types."""
    IDENTIFIED = "identified"
    ASSESSED = "assessed"
    MITIGATING = "mitigating"
    MONITORED = "monitored"
    RESOLVED = "resolved"
    ACCEPTED = "accepted"


@dataclass
class RiskFactor:
    """Risk factor data."""
    id: str
    name: str
    category: RiskCategory
    weight: float = 1.0
    score: float = 0.0
    description: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RiskAssessment:
    """Risk assessment record."""
    id: str
    agent_id: str
    category: RiskCategory
    level: RiskLevel
    score: float
    factors: List[RiskFactor] = field(default_factory=list)
    status: RiskStatus = RiskStatus.IDENTIFIED
    created_at: float = 0.0
    updated_at: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RiskConfig:
    """Risk configuration."""
    critical_threshold: float = 0.8
    high_threshold: float = 0.6
    medium_threshold: float = 0.4
    low_threshold: float = 0.2
    auto_escalate: bool = True
    escalation_threshold: float = 0.75
    enable_monitoring: bool = True
    check_interval: int = 3600


class RiskManager:
    """Risk management engine."""

    def __init__(self, config: RiskConfig = None):
        self._lock = threading.RLock()
        self._config = config or RiskConfig()
        self._assessments: Dict[str, RiskAssessment] = {}
        self._agent_assessments: Dict[str, List[str]] = defaultdict(list)
        self._risk_events: List[Dict] = []
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def _calculate_level(self, score: float) -> RiskLevel:
        """Calculate risk level from score."""
        if score >= self._config.critical_threshold:
            return RiskLevel.CRITICAL
        elif score >= self._config.high_threshold:
            return RiskLevel.HIGH
        elif score >= self._config.medium_threshold:
            return RiskLevel.MEDIUM
        elif score >= self._config.low_threshold:
            return RiskLevel.LOW
        else:
            return RiskLevel.MINIMAL

    def create_assessment(
        self,
        agent_id: str,
        category: RiskCategory,
        factors: List[Dict[str, Any]] = None,
        metadata: Dict[str, Any] = None
    ) -> RiskAssessment:
        """Create a new risk assessment."""
        with self._lock:
            current_time = time.time()

            # Create risk factors
            risk_factors = []
            total_weight = 0.0
            weighted_score = 0.0

            if factors:
                for f in factors:
                    factor = RiskFactor(
                        id=str(uuid.uuid4())[:12],
                        name=f.get("name", ""),
                        category=RiskCategory(f.get("category", "operational")),
                        weight=f.get("weight", 1.0),
                        score=f.get("score", 0.0),
                        description=f.get("description", ""),
                        metadata=f.get("metadata", {})
                    )
                    risk_factors.append(factor)
                    total_weight += factor.weight
                    weighted_score += factor.weight * factor.score

            # Calculate overall score
            score = weighted_score / total_weight if total_weight > 0 else 0.0
            level = self._calculate_level(score)

            assessment = RiskAssessment(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                category=category,
                level=level,
                score=score,
                factors=risk_factors,
                status=RiskStatus.IDENTIFIED,
                created_at=current_time,
                updated_at=current_time,
                metadata=metadata or {}
            )

            self._assessments[assessment.id] = assessment
            self._agent_assessments[agent_id].append(assessment.id)

            # Auto-escalate if needed
            if self._config.auto_escalate and score >= self._config.escalation_threshold:
                assessment.status = RiskStatus.MONITORED
                self._trigger_escalation(assessment)

            return assessment

    def update_assessment(
        self,
        assessment_id: str,
        factors: List[Dict[str, Any]] = None,
        score: float = None,
        status: RiskStatus = None
    ) -> Optional[RiskAssessment]:
        """Update an existing risk assessment."""
        with self._lock:
            assessment = self._assessments.get(assessment_id)
            if not assessment:
                return None

            current_time = time.time()

            # Update factors
            if factors:
                risk_factors = []
                total_weight = 0.0
                weighted_score = 0.0

                for f in factors:
                    factor = RiskFactor(
                        id=str(uuid.uuid4())[:12],
                        name=f.get("name", ""),
                        category=RiskCategory(f.get("category", "operational")),
                        weight=f.get("weight", 1.0),
                        score=f.get("score", 0.0),
                        description=f.get("description", ""),
                        metadata=f.get("metadata", {})
                    )
                    risk_factors.append(factor)
                    total_weight += factor.weight
                    weighted_score += factor.weight * factor.score

                assessment.factors = risk_factors

                # Recalculate score
                if total_weight > 0:
                    assessment.score = weighted_score / total_weight

            # Update score directly
            if score is not None:
                assessment.score = score

            # Update status
            if status:
                assessment.status = status

            # Recalculate level
            assessment.level = self._calculate_level(assessment.score)
            assessment.updated_at = current_time

            return assessment

    def get_assessment(self, assessment_id: str) -> Optional[RiskAssessment]:
        """Get risk assessment by ID."""
        with self._lock:
            return self._assessments.get(assessment_id)

    def get_agent_assessments(
        self,
        agent_id: str,
        category: RiskCategory = None,
        status: RiskStatus = None,
        limit: int = 100
    ) -> List[RiskAssessment]:
        """Get assessments for an agent."""
        with self._lock:
            assessment_ids = self._agent_assessments.get(agent_id, [])
            assessments = [self._assessments.get(aid) for aid in assessment_ids]
            assessments = [a for a in assessments if a is not None]

            if category:
                assessments = [a for a in assessments if a.category == category]
            if status:
                assessments = [a for a in assessments if a.status == status]

            return assessments[:limit]

    def get_all_assessments(
        self,
        level: RiskLevel = None,
        category: RiskCategory = None,
        status: RiskStatus = None,
        limit: int = 100
    ) -> List[RiskAssessment]:
        """Get all risk assessments."""
        with self._lock:
            assessments = list(self._assessments.values())

            if level:
                assessments = [a for a in assessments if a.level == level]
            if category:
                assessments = [a for a in assessments if a.category == category]
            if status:
                assessments = [a for a in assessments if a.status == status]

            return assessments[:limit]

    def delete_assessment(self, assessment_id: str) -> bool:
        """Delete a risk assessment."""
        with self._lock:
            assessment = self._assessments.get(assessment_id)
            if not assessment:
                return False

            del self._assessments[assessment_id]
            if assessment.agent_id in self._agent_assessments:
                if assessment_id in self._agent_assessments[assessment.agent_id]:
                    self._agent_assessments[assessment.agent_id].remove(assessment_id)

            return True

    def _trigger_escalation(self, assessment: RiskAssessment):
        """Trigger risk escalation."""
        for hook in self._hooks.get("escalation", []):
            try:
                hook(assessment)
            except Exception:
                pass

    def log_risk_event(
        self,
        agent_id: str,
        assessment_id: str,
        event_type: str,
        details: Dict[str, Any] = None
    ):
        """Log a risk event."""
        with self._lock:
            event = {
                "id": str(uuid.uuid4())[:12],
                "agent_id": agent_id,
                "assessment_id": assessment_id,
                "event_type": event_type,
                "details": details or {},
                "timestamp": time.time()
            }
            self._risk_events.append(event)

            # Keep only last 1000 events
            if len(self._risk_events) > 1000:
                self._risk_events = self._risk_events[-500:]

    def get_risk_events(
        self,
        agent_id: str = None,
        assessment_id: str = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get risk events."""
        with self._lock:
            events = self._risk_events

            if agent_id:
                events = [e for e in events if e.get("agent_id") == agent_id]
            if assessment_id:
                events = [e for e in events if e.get("assessment_id") == assessment_id]

            return events[:limit]

    def get_stats(self) -> Dict[str, Any]:
        """Get risk management statistics."""
        with self._lock:
            total = len(self._assessments)
            by_level = defaultdict(int)
            by_category = defaultdict(int)
            by_status = defaultdict(int)

            for a in self._assessments.values():
                by_level[a.level.value] += 1
                by_category[a.category.value] += 1
                by_status[a.status.value] += 1

            return {
                "total_assessments": total,
                "by_level": dict(by_level),
                "by_category": dict(by_category),
                "by_status": dict(by_status),
                "total_events": len(self._risk_events)
            }

    def add_hook(self, event: str, callback: Callable):
        """Add risk hook."""
        with self._lock:
            self._hooks[event].append(callback)

    def update_config(
        self,
        critical_threshold: float = None,
        high_threshold: float = None,
        medium_threshold: float = None,
        low_threshold: float = None,
        auto_escalate: bool = None,
        escalation_threshold: float = None,
        enable_monitoring: bool = None,
        check_interval: int = None
    ):
        """Update risk configuration."""
        with self._lock:
            if critical_threshold is not None:
                self._config.critical_threshold = critical_threshold
            if high_threshold is not None:
                self._config.high_threshold = high_threshold
            if medium_threshold is not None:
                self._config.medium_threshold = medium_threshold
            if low_threshold is not None:
                self._config.low_threshold = low_threshold
            if auto_escalate is not None:
                self._config.auto_escalate = auto_escalate
            if escalation_threshold is not None:
                self._config.escalation_threshold = escalation_threshold
            if enable_monitoring is not None:
                self._config.enable_monitoring = enable_monitoring
            if check_interval is not None:
                self._config.check_interval = check_interval

    def get_config(self) -> RiskConfig:
        """Get risk configuration."""
        return self._config


class AgentRisk:
    """Agent risk management handling system."""

    def __init__(self, config: RiskConfig = None):
        self._manager = RiskManager(config)

    def create_assessment(
        self,
        agent_id: str,
        category: str,
        factors: List[Dict[str, Any]] = None,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Create a new risk assessment."""
        cat = RiskCategory(category)
        assessment = self._manager.create_assessment(agent_id, cat, factors, metadata)
        return {
            "id": assessment.id,
            "agent_id": assessment.agent_id,
            "category": assessment.category.value,
            "level": assessment.level.value,
            "score": assessment.score,
            "status": assessment.status.value,
            "created_at": assessment.created_at,
            "updated_at": assessment.updated_at
        }

    def update_assessment(
        self,
        assessment_id: str,
        factors: List[Dict[str, Any]] = None,
        score: float = None,
        status: str = None
    ) -> Optional[Dict[str, Any]]:
        """Update a risk assessment."""
        status_enum = RiskStatus(status) if status else None
        assessment = self._manager.update_assessment(assessment_id, factors, score, status_enum)
        if not assessment:
            return None
        return {
            "id": assessment.id,
            "agent_id": assessment.agent_id,
            "category": assessment.category.value,
            "level": assessment.level.value,
            "score": assessment.score,
            "status": assessment.status.value,
            "created_at": assessment.created_at,
            "updated_at": assessment.updated_at
        }

    def get_assessment(self, assessment_id: str) -> Optional[Dict[str, Any]]:
        """Get risk assessment by ID."""
        assessment = self._manager.get_assessment(assessment_id)
        if not assessment:
            return None
        return {
            "id": assessment.id,
            "agent_id": assessment.agent_id,
            "category": assessment.category.value,
            "level": assessment.level.value,
            "score": assessment.score,
            "status": assessment.status.value,
            "created_at": assessment.created_at,
            "updated_at": assessment.updated_at,
            "metadata": assessment.metadata
        }

    def get_agent_assessments(
        self,
        agent_id: str,
        category: str = None,
        status: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get assessments for an agent."""
        cat_enum = RiskCategory(category) if category else None
        status_enum = RiskStatus(status) if status else None
        assessments = self._manager.get_agent_assessments(agent_id, cat_enum, status_enum, limit)
        return [
            {
                "id": a.id,
                "agent_id": a.agent_id,
                "category": a.category.value,
                "level": a.level.value,
                "score": a.score,
                "status": a.status.value,
                "created_at": a.created_at,
                "updated_at": a.updated_at
            }
            for a in assessments
        ]

    def get_all_assessments(
        self,
        level: str = None,
        category: str = None,
        status: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get all risk assessments."""
        level_enum = RiskLevel(level) if level else None
        cat_enum = RiskCategory(category) if category else None
        status_enum = RiskStatus(status) if status else None
        assessments = self._manager.get_all_assessments(level_enum, cat_enum, status_enum, limit)
        return [
            {
                "id": a.id,
                "agent_id": a.agent_id,
                "category": a.category.value,
                "level": a.level.value,
                "score": a.score,
                "status": a.status.value,
                "created_at": a.created_at,
                "updated_at": a.updated_at
            }
            for a in assessments
        ]

    def delete_assessment(self, assessment_id: str) -> bool:
        """Delete a risk assessment."""
        return self._manager.delete_assessment(assessment_id)

    def get_risk_events(
        self,
        agent_id: str = None,
        assessment_id: str = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get risk events."""
        return self._manager.get_risk_events(agent_id, assessment_id, limit)

    def get_stats(self) -> Dict[str, Any]:
        """Get risk management statistics."""
        return self._manager.get_stats()

    def update_config(
        self,
        critical_threshold: float = None,
        high_threshold: float = None,
        medium_threshold: float = None,
        low_threshold: float = None,
        auto_escalate: bool = None,
        escalation_threshold: float = None,
        enable_monitoring: bool = None,
        check_interval: int = None
    ) -> Dict[str, Any]:
        """Update risk configuration."""
        self._manager.update_config(
            critical_threshold=critical_threshold,
            high_threshold=high_threshold,
            medium_threshold=medium_threshold,
            low_threshold=low_threshold,
            auto_escalate=auto_escalate,
            escalation_threshold=escalation_threshold,
            enable_monitoring=enable_monitoring,
            check_interval=check_interval
        )
        return self.get_config()

    def get_config(self) -> Dict[str, Any]:
        """Get risk configuration."""
        config = self._manager.get_config()
        return {
            "critical_threshold": config.critical_threshold,
            "high_threshold": config.high_threshold,
            "medium_threshold": config.medium_threshold,
            "low_threshold": config.low_threshold,
            "auto_escalate": config.auto_escalate,
            "escalation_threshold": config.escalation_threshold,
            "enable_monitoring": config.enable_monitoring,
            "check_interval": config.check_interval
        }


# Global instance
agent_risk = AgentRisk()
