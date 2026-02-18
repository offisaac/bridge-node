"""Agent Evaluation Module

Agent performance evaluation system including metrics tracking, scoring,
evaluation criteria management, and performance reporting.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class EvaluationType(str, Enum):
    """Evaluation types."""
    PERFORMANCE = "performance"
    QUALITY = "quality"
    RELIABILITY = "reliability"
    PRODUCTIVITY = "productivity"
    COLLABORATION = "collaboration"
    INNOVATION = "innovation"
    CUSTOM = "custom"


class EvaluationStatus(str, Enum):
    """Evaluation status."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


class EvaluationPeriod(str, Enum):
    """Evaluation period."""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUAL = "annual"
    AD_HOC = "ad_hoc"


class ScoreLevel(str, Enum):
    """Score levels."""
    EXCELLENT = "excellent"
    GOOD = "good"
    AVERAGE = "average"
    BELOW_AVERAGE = "below_average"
    POOR = "poor"


@dataclass
class EvaluationCriteria:
    """Evaluation criteria definition."""
    id: str
    name: str
    description: str
    weight: float
    max_score: float
    evaluation_type: EvaluationType
    enabled: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EvaluationScore:
    """Evaluation score record."""
    criteria_id: str
    score: float
    feedback: str = ""
    evidence: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentEvaluation:
    """Agent evaluation record."""
    id: str
    agent_id: str
    evaluation_type: EvaluationType
    period: EvaluationPeriod
    status: EvaluationStatus
    created_at: float
    completed_at: float = 0.0
    evaluated_by: str = ""
    scores: List[EvaluationScore] = field(default_factory=list)
    total_score: float = 0.0
    score_level: ScoreLevel = ScoreLevel.AVERAGE
    summary: str = ""
    recommendations: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EvaluationMetrics:
    """Agent evaluation metrics."""
    agent_id: str
    total_evaluations: int = 0
    average_score: float = 0.0
    highest_score: float = 0.0
    lowest_score: float = 0.0
    last_evaluation: float = 0.0
    improvement_rate: float = 0.0
    trend: str = "stable"  # improving, declining, stable


@dataclass
class EvaluationConfig:
    """Evaluation configuration."""
    default_period: EvaluationPeriod = EvaluationPeriod.MONTHLY
    min_score: float = 0.0
    max_score: float = 100.0
    passing_score: float = 70.0
    enable_auto_evaluation: bool = False
    evaluation_interval: int = 86400
    enable_notifications: bool = True
    require_approval: bool = False


@dataclass
class EvaluationReport:
    """Evaluation report."""
    id: str
    agent_id: str
    period: EvaluationPeriod
    generated_at: float
    metrics: EvaluationMetrics
    trends: Dict[str, Any] = field(default_factory=dict)
    highlights: List[str] = field(default_factory=list)
    areas_for_improvement: List[str] = field(default_factory=list)


class EvaluationManager:
    """Evaluation management engine."""

    def __init__(self, config: EvaluationConfig = None):
        self._lock = threading.RLock()
        self._config = config or EvaluationConfig()
        self._evaluations: Dict[str, AgentEvaluation] = {}
        self._criteria: Dict[str, EvaluationCriteria] = {}
        self._agent_metrics: Dict[str, EvaluationMetrics] = {}
        self._reports: List[EvaluationReport] = []
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._default_criteria()

    def _default_criteria(self):
        """Create default evaluation criteria."""
        default_criteria = [
            EvaluationCriteria(
                id="perf-001",
                name="Task Completion Rate",
                description="Percentage of tasks completed successfully",
                weight=0.2,
                max_score=100.0,
                evaluation_type=EvaluationType.PERFORMANCE
            ),
            EvaluationCriteria(
                id="perf-002",
                name="Response Time",
                description="Average response time to requests",
                weight=0.15,
                max_score=100.0,
                evaluation_type=EvaluationType.PERFORMANCE
            ),
            EvaluationCriteria(
                id="qual-001",
                name="Code Quality",
                description="Quality of code produced",
                weight=0.15,
                max_score=100.0,
                evaluation_type=EvaluationType.QUALITY
            ),
            EvaluationCriteria(
                id="qual-002",
                name="Bug Rate",
                description="Number of bugs introduced per task",
                weight=0.1,
                max_score=100.0,
                evaluation_type=EvaluationType.QUALITY
            ),
            EvaluationCriteria(
                id="rel-001",
                name="Uptime",
                description="System availability and reliability",
                weight=0.1,
                max_score=100.0,
                evaluation_type=EvaluationType.RELIABILITY
            ),
            EvaluationCriteria(
                id="prod-001",
                name="Throughput",
                description="Number of tasks completed per period",
                weight=0.15,
                max_score=100.0,
                evaluation_type=EvaluationType.PRODUCTIVITY
            ),
            EvaluationCriteria(
                id="collab-001",
                name="Collaboration",
                description="Effectiveness in working with other agents",
                weight=0.1,
                max_score=100.0,
                evaluation_type=EvaluationType.COLLABORATION
            ),
            EvaluationCriteria(
                id="innov-001",
                name="Innovation",
                description="New ideas and improvements proposed",
                weight=0.05,
                max_score=100.0,
                evaluation_type=EvaluationType.INNOVATION
            ),
        ]
        for criteria in default_criteria:
            self._criteria[criteria.id] = criteria

    def create_evaluation(
        self,
        agent_id: str,
        evaluation_type: EvaluationType,
        period: EvaluationPeriod = None,
        evaluated_by: str = ""
    ) -> AgentEvaluation:
        """Create a new evaluation."""
        with self._lock:
            evaluation = AgentEvaluation(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                evaluation_type=evaluation_type,
                period=period or self._config.default_period,
                status=EvaluationStatus.PENDING,
                created_at=time.time(),
                evaluated_by=evaluated_by
            )
            self._evaluations[evaluation.id] = evaluation
            return evaluation

    def add_score(
        self,
        evaluation_id: str,
        criteria_id: str,
        score: float,
        feedback: str = "",
        evidence: Dict[str, Any] = None
    ) -> bool:
        """Add score to evaluation."""
        with self._lock:
            evaluation = self._evaluations.get(evaluation_id)
            if not evaluation:
                return False

            if evaluation.status == EvaluationStatus.COMPLETED:
                return False

            criteria = self._criteria.get(criteria_id)
            if not criteria or not criteria.enabled:
                return False

            # Validate score
            if score < 0:
                score = 0
            elif score > criteria.max_score:
                score = criteria.max_score

            eval_score = EvaluationScore(
                criteria_id=criteria_id,
                score=score,
                feedback=feedback,
                evidence=evidence or {}
            )
            evaluation.scores.append(eval_score)
            return True

    def complete_evaluation(
        self,
        evaluation_id: str,
        summary: str = "",
        recommendations: List[str] = None
    ) -> Optional[AgentEvaluation]:
        """Complete an evaluation."""
        with self._lock:
            evaluation = self._evaluations.get(evaluation_id)
            if not evaluation:
                return None

            if evaluation.status == EvaluationStatus.COMPLETED:
                return evaluation

            # Calculate total score
            total_weight = 0.0
            weighted_score = 0.0

            for eval_score in evaluation.scores:
                criteria = self._criteria.get(eval_score.criteria_id)
                if criteria:
                    normalized_score = (eval_score.score / criteria.max_score) * 100
                    weighted_score += normalized_score * criteria.weight
                    total_weight += criteria.weight

            if total_weight > 0:
                evaluation.total_score = weighted_score / total_weight
            else:
                evaluation.total_score = 0.0

            # Determine score level
            evaluation.score_level = self._get_score_level(evaluation.total_score)
            evaluation.status = EvaluationStatus.COMPLETED
            evaluation.completed_at = time.time()
            evaluation.summary = summary
            evaluation.recommendations = recommendations or []

            # Update agent metrics
            self._update_agent_metrics(evaluation.agent_id)

            return evaluation

    def _get_score_level(self, score: float) -> ScoreLevel:
        """Get score level based on total score."""
        if score >= 90:
            return ScoreLevel.EXCELLENT
        elif score >= 75:
            return ScoreLevel.GOOD
        elif score >= 60:
            return ScoreLevel.AVERAGE
        elif score >= 40:
            return ScoreLevel.BELOW_AVERAGE
        else:
            return ScoreLevel.POOR

    def _update_agent_metrics(self, agent_id: str):
        """Update agent evaluation metrics."""
        agent_evals = [
            e for e in self._evaluations.values()
            if e.agent_id == agent_id and e.status == EvaluationStatus.COMPLETED
        ]

        if not agent_evals:
            return

        scores = [e.total_score for e in agent_evals]
        metrics = self._agent_metrics.get(agent_id, EvaluationMetrics(agent_id=agent_id))

        metrics.total_evaluations = len(agent_evals)
        metrics.average_score = sum(scores) / len(scores)
        metrics.highest_score = max(scores)
        metrics.lowest_score = min(scores)
        metrics.last_evaluation = agent_evals[-1].completed_at

        # Calculate improvement rate
        if len(scores) >= 2:
            recent_avg = sum(scores[-3:]) / min(len(scores), 3)
            earlier_avg = sum(scores[:3]) / min(len(scores[:3]), 3)
            if earlier_avg > 0:
                metrics.improvement_rate = ((recent_avg - earlier_avg) / earlier_avg) * 100

        # Determine trend
        if len(scores) >= 3:
            recent_trend = scores[-1] - scores[-3]
            if recent_trend > 5:
                metrics.trend = "improving"
            elif recent_trend < -5:
                metrics.trend = "declining"
            else:
                metrics.trend = "stable"

        self._agent_metrics[agent_id] = metrics

    def get_evaluation(self, evaluation_id: str) -> Optional[AgentEvaluation]:
        """Get evaluation by ID."""
        with self._lock:
            return self._evaluations.get(evaluation_id)

    def get_agent_evaluations(
        self,
        agent_id: str,
        status: EvaluationStatus = None,
        limit: int = 100
    ) -> List[AgentEvaluation]:
        """Get evaluations for an agent."""
        with self._lock:
            evaluations = [
                e for e in self._evaluations.values()
                if e.agent_id == agent_id
            ]
            if status:
                evaluations = [e for e in evaluations if e.status == status]

            evaluations.sort(key=lambda x: x.created_at, reverse=True)
            return evaluations[:limit]

    def get_agent_metrics(self, agent_id: str) -> Optional[EvaluationMetrics]:
        """Get agent evaluation metrics."""
        with self._lock:
            return self._agent_metrics.get(agent_id)

    def get_all_metrics(self) -> List[EvaluationMetrics]:
        """Get all agent metrics."""
        with self._lock:
            return list(self._agent_metrics.values())

    def add_criteria(self, criteria: EvaluationCriteria) -> str:
        """Add evaluation criteria."""
        with self._lock:
            self._criteria[criteria.id] = criteria
            return criteria.id

    def get_criteria(self, criteria_id: str = None) -> List[EvaluationCriteria]:
        """Get evaluation criteria."""
        with self._lock:
            if criteria_id:
                criteria = self._criteria.get(criteria_id)
                return [criteria] if criteria else []
            return list(self._criteria.values())

    def enable_criteria(self, criteria_id: str, enabled: bool = True) -> bool:
        """Enable or disable criteria."""
        with self._lock:
            criteria = self._criteria.get(criteria_id)
            if not criteria:
                return False
            criteria.enabled = enabled
            return True

    def generate_report(
        self,
        agent_id: str,
        period: EvaluationPeriod
    ) -> Optional[EvaluationReport]:
        """Generate evaluation report."""
        with self._lock:
            metrics = self._agent_metrics.get(agent_id)
            if not metrics:
                return None

            # Get evaluations for period
            evaluations = [
                e for e in self._evaluations.values()
                if e.agent_id == agent_id
                and e.period == period
                and e.status == EvaluationStatus.COMPLETED
            ]

            # Generate trends
            trends = {}
            if len(evaluations) >= 2:
                scores = [e.total_score for e in evaluations]
                trends["score_change"] = scores[-1] - scores[0]
                trends["avg_by_type"] = {}
                for e in evaluations:
                    eval_type = e.evaluation_type.value
                    if eval_type not in trends["avg_by_type"]:
                        trends["avg_by_type"][eval_type] = []
                    trends["avg_by_type"][eval_type].append(e.total_score)
                for k, v in trends["avg_by_type"].items():
                    trends["avg_by_type"][k] = sum(v) / len(v) if v else 0

            # Generate highlights and areas for improvement
            highlights = []
            areas_for_improvement = []

            if metrics.improvement_rate > 10:
                highlights.append(f"Performance improved by {metrics.improvement_rate:.1f}%")
            if metrics.average_score >= 80:
                highlights.append(f"Average score of {metrics.average_score:.1f} is above target")
            if metrics.trend == "improving":
                highlights.append("Consistent upward trend in performance")

            if metrics.average_score < 70:
                areas_for_improvement.append("Focus on improving overall performance metrics")
            if metrics.trend == "declining":
                areas_for_improvement.append("Address declining performance trend")
            if metrics.total_evaluations < 3:
                areas_for_improvement.append("Complete more evaluations for better insights")

            report = EvaluationReport(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                period=period,
                generated_at=time.time(),
                metrics=metrics,
                trends=trends,
                highlights=highlights,
                areas_for_improvement=areas_for_improvement
            )

            self._reports.append(report)
            return report

    def get_reports(
        self,
        agent_id: str = None,
        limit: int = 100
    ) -> List[EvaluationReport]:
        """Get evaluation reports."""
        with self._lock:
            reports = self._reports
            if agent_id:
                reports = [r for r in reports if r.agent_id == agent_id]
            reports.sort(key=lambda x: x.generated_at, reverse=True)
            return reports[:limit]

    def cancel_evaluation(self, evaluation_id: str) -> Optional[AgentEvaluation]:
        """Cancel an evaluation."""
        with self._lock:
            evaluation = self._evaluations.get(evaluation_id)
            if not evaluation:
                return None

            if evaluation.status == EvaluationStatus.COMPLETED:
                return None

            evaluation.status = EvaluationStatus.CANCELLED
            return evaluation

    def delete_evaluation(self, evaluation_id: str) -> bool:
        """Delete an evaluation."""
        with self._lock:
            if evaluation_id in self._evaluations:
                del self._evaluations[evaluation_id]
                return True
            return False

    def get_pending_evaluations(self) -> List[AgentEvaluation]:
        """Get all pending evaluations."""
        with self._lock:
            return [
                e for e in self._evaluations.values()
                if e.status == EvaluationStatus.PENDING
            ]

    def get_stats(self) -> Dict[str, Any]:
        """Get evaluation statistics."""
        with self._lock:
            total = len(self._evaluations)
            completed = sum(
                1 for e in self._evaluations.values()
                if e.status == EvaluationStatus.COMPLETED
            )
            pending = sum(
                1 for e in self._evaluations.values()
                if e.status == EvaluationStatus.PENDING
            )

            avg_score = 0.0
            completed_evals = [
                e for e in self._evaluations.values()
                if e.status == EvaluationStatus.COMPLETED
            ]
            if completed_evals:
                avg_score = sum(e.total_score for e in completed_evals) / len(completed_evals)

            return {
                "total_evaluations": total,
                "completed_evaluations": completed,
                "pending_evaluations": pending,
                "average_score": avg_score,
                "total_agents_evaluated": len(self._agent_metrics),
                "total_criteria": len(self._criteria),
                "enabled_criteria": sum(1 for c in self._criteria.values() if c.enabled)
            }

    def register_hook(self, event: str, callback: Callable):
        """Register event hook."""
        self._hooks[event].append(callback)

    def _trigger_hook(self, event: str, data: Any):
        """Trigger event hook."""
        for callback in self._hooks.get(event, []):
            try:
                callback(data)
            except Exception:
                pass


class AgentEvaluation:
    """Main Agent Evaluation coordinating all evaluation operations."""

    def __init__(self, config: EvaluationConfig = None):
        self.manager = EvaluationManager(config)
        self._lock = threading.RLock()

    def create_evaluation(
        self,
        agent_id: str,
        evaluation_type: str = "performance",
        period: str = None,
        evaluated_by: str = ""
    ) -> Dict[str, Any]:
        """Create a new evaluation."""
        eval_obj = self.manager.create_evaluation(
            agent_id=agent_id,
            evaluation_type=EvaluationType(evaluation_type),
            period=EvaluationPeriod(period) if period else None,
            evaluated_by=evaluated_by
        )
        return {
            "id": eval_obj.id,
            "agent_id": eval_obj.agent_id,
            "evaluation_type": eval_obj.evaluation_type.value,
            "period": eval_obj.period.value,
            "status": eval_obj.status.value,
            "created_at": eval_obj.created_at
        }

    def add_score(
        self,
        evaluation_id: str,
        criteria_id: str,
        score: float,
        feedback: str = "",
        evidence: Dict[str, Any] = None
    ) -> bool:
        """Add score to evaluation."""
        return self.manager.add_score(evaluation_id, criteria_id, score, feedback, evidence)

    def complete_evaluation(
        self,
        evaluation_id: str,
        summary: str = "",
        recommendations: List[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Complete an evaluation."""
        eval_obj = self.manager.complete_evaluation(evaluation_id, summary, recommendations)
        if not eval_obj:
            return None

        return {
            "id": eval_obj.id,
            "agent_id": eval_obj.agent_id,
            "evaluation_type": eval_obj.evaluation_type.value,
            "period": eval_obj.period.value,
            "status": eval_obj.status.value,
            "total_score": eval_obj.total_score,
            "score_level": eval_obj.score_level.value,
            "summary": eval_obj.summary,
            "completed_at": eval_obj.completed_at
        }

    def get_evaluation(self, evaluation_id: str) -> Optional[Dict[str, Any]]:
        """Get evaluation by ID."""
        eval_obj = self.manager.get_evaluation(evaluation_id)
        if not eval_obj:
            return None

        return {
            "id": eval_obj.id,
            "agent_id": eval_obj.agent_id,
            "evaluation_type": eval_obj.evaluation_type.value,
            "period": eval_obj.period.value,
            "status": eval_obj.status.value,
            "total_score": eval_obj.total_score,
            "score_level": eval_obj.score_level.value,
            "created_at": eval_obj.created_at,
            "completed_at": eval_obj.completed_at,
            "summary": eval_obj.summary,
            "recommendations": eval_obj.recommendations
        }

    def get_agent_evaluations(
        self,
        agent_id: str,
        status: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get evaluations for an agent."""
        eval_status = EvaluationStatus(status) if status else None
        evaluations = self.manager.get_agent_evaluations(agent_id, eval_status, limit)

        return [
            {
                "id": e.id,
                "agent_id": e.agent_id,
                "evaluation_type": e.evaluation_type.value,
                "period": e.period.value,
                "status": e.status.value,
                "total_score": e.total_score,
                "score_level": e.score_level.value,
                "created_at": e.created_at,
                "completed_at": e.completed_at
            }
            for e in evaluations
        ]

    def get_agent_metrics(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Get agent evaluation metrics."""
        metrics = self.manager.get_agent_metrics(agent_id)
        if not metrics:
            return None

        return {
            "agent_id": metrics.agent_id,
            "total_evaluations": metrics.total_evaluations,
            "average_score": metrics.average_score,
            "highest_score": metrics.highest_score,
            "lowest_score": metrics.lowest_score,
            "last_evaluation": metrics.last_evaluation,
            "improvement_rate": metrics.improvement_rate,
            "trend": metrics.trend
        }

    def get_all_metrics(self) -> List[Dict[str, Any]]:
        """Get all agent metrics."""
        return [
            {
                "agent_id": m.agent_id,
                "total_evaluations": m.total_evaluations,
                "average_score": m.average_score,
                "highest_score": m.highest_score,
                "lowest_score": m.lowest_score,
                "last_evaluation": m.last_evaluation,
                "improvement_rate": m.improvement_rate,
                "trend": m.trend
            }
            for m in self.manager.get_all_metrics()
        ]

    def generate_report(
        self,
        agent_id: str,
        period: str = "monthly"
    ) -> Optional[Dict[str, Any]]:
        """Generate evaluation report."""
        report = self.manager.generate_report(agent_id, EvaluationPeriod(period))
        if not report:
            return None

        return {
            "id": report.id,
            "agent_id": report.agent_id,
            "period": report.period.value,
            "generated_at": report.generated_at,
            "metrics": {
                "total_evaluations": report.metrics.total_evaluations,
                "average_score": report.metrics.average_score,
                "highest_score": report.metrics.highest_score,
                "lowest_score": report.metrics.lowest_score,
                "improvement_rate": report.metrics.improvement_rate,
                "trend": report.metrics.trend
            },
            "trends": report.trends,
            "highlights": report.highlights,
            "areas_for_improvement": report.areas_for_improvement
        }

    def get_stats(self) -> Dict[str, Any]:
        """Get evaluation statistics."""
        return self.manager.get_stats()

    def get_criteria(self, criteria_id: str = None) -> List[Dict[str, Any]]:
        """Get evaluation criteria."""
        criteria_list = self.manager.get_criteria(criteria_id)
        return [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "weight": c.weight,
                "max_score": c.max_score,
                "evaluation_type": c.evaluation_type.value,
                "enabled": c.enabled
            }
            for c in criteria_list
        ]


# Global instance
agent_evaluation = AgentEvaluation()
