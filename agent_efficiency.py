"""Agent Efficiency Module

Efficiency scoring system for agents including performance metrics, resource utilization scoring,
efficiency trends, and optimization recommendations.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class EfficiencyCategory(str, Enum):
    """Efficiency categories."""
    PERFORMANCE = "performance"
    RESOURCE_UTILIZATION = "resource_utilization"
    COST_EFFICIENCY = "cost_efficiency"
    RESPONSE_TIME = "response_time"
    THROUGHPUT = "throughput"
    AVAILABILITY = "availability"


class EfficiencyLevel(str, Enum):
    """Efficiency levels."""
    EXCELLENT = "excellent"  # 90-100
    GOOD = "good"  # 70-89
    FAIR = "fair"  # 50-69
    POOR = "poor"  # 30-49
    CRITICAL = "critical"  # 0-29


@dataclass
class EfficiencyScore:
    """Efficiency score."""
    category: EfficiencyCategory
    score: float
    weight: float = 1.0
    metrics: Dict[str, float] = field(default_factory=dict)


@dataclass
class AgentEfficiency:
    """Agent efficiency record."""
    agent_id: str
    agent_name: str
    overall_score: float
    category_scores: List[EfficiencyScore]
    level: EfficiencyLevel
    timestamp: float = field(default_factory=time.time)


@dataclass
class EfficiencyMetrics:
    """Efficiency metrics."""
    response_time_ms: float = 0.0
    throughput_rps: float = 0.0
    error_rate: float = 0.0
    cpu_usage: float = 0.0
    memory_usage: float = 0.0
    cost_per_request: float = 0.0
    uptime_percent: float = 100.0


@dataclass
class EfficiencyConfig:
    """Efficiency scoring configuration."""
    enable_cost_analysis: bool = True
    enable_trends: bool = True
    history_retention_days: int = 30
    scoring_weights: Dict[str, float] = field(default_factory=lambda: {
        "performance": 0.25,
        "resource_utilization": 0.25,
        "cost_efficiency": 0.2,
        "response_time": 0.15,
        "throughput": 0.1,
        "availability": 0.05
    })


@dataclass
class EfficiencyTrend:
    """Efficiency trend data."""
    period: str
    avg_score: float
    trend_direction: str  # improving, declining, stable
    change_percent: float


class EfficiencyScorer:
    """Efficiency scoring engine."""

    def __init__(self, config: EfficiencyConfig):
        self.config = config
        self._lock = threading.RLock()
        self._agent_metrics: Dict[str, EfficiencyMetrics] = {}
        self._historical_scores: Dict[str, List[AgentEfficiency]] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def update_agent_metrics(
        self,
        agent_id: str,
        agent_name: str = "",
        response_time_ms: float = None,
        throughput_rps: float = None,
        error_rate: float = None,
        cpu_usage: float = None,
        memory_usage: float = None,
        cost_per_request: float = None,
        uptime_percent: float = None
    ):
        """Update agent metrics."""
        with self._lock:
            if agent_id not in self._agent_metrics:
                self._agent_metrics[agent_id] = EfficiencyMetrics()

            metrics = self._agent_metrics[agent_id]

            if response_time_ms is not None:
                metrics.response_time_ms = response_time_ms
            if throughput_rps is not None:
                metrics.throughput_rps = throughput_rps
            if error_rate is not None:
                metrics.error_rate = error_rate
            if cpu_usage is not None:
                metrics.cpu_usage = cpu_usage
            if memory_usage is not None:
                metrics.memory_usage = memory_usage
            if cost_per_request is not None:
                metrics.cost_per_request = cost_per_request
            if uptime_percent is not None:
                metrics.uptime_percent = uptime_percent

            # Update agent name if provided
            if agent_name:
                self._agent_metrics[agent_id].agent_name = agent_name

    def _calculate_performance_score(self, metrics: EfficiencyMetrics) -> EfficiencyScore:
        """Calculate performance score."""
        # Based on response time, throughput, and error rate
        score = 100.0

        # Response time scoring (lower is better)
        if metrics.response_time_ms > 0:
            if metrics.response_time_ms < 50:
                score += 20
            elif metrics.response_time_ms < 100:
                score += 15
            elif metrics.response_time_ms < 500:
                score += 10
            elif metrics.response_time_ms < 1000:
                score += 5
            else:
                score -= 20

        # Throughput scoring (higher is better)
        if metrics.throughput_rps > 0:
            if metrics.throughput_rps > 1000:
                score += 20
            elif metrics.throughput_rps > 500:
                score += 15
            elif metrics.throughput_rps > 100:
                score += 10
            elif metrics.throughput_rps > 10:
                score += 5

        # Error rate scoring (lower is better)
        if metrics.error_rate > 0:
            if metrics.error_rate < 0.1:
                score += 20
            elif metrics.error_rate < 1.0:
                score += 10
            elif metrics.error_rate < 5.0:
                score += 5
            else:
                score -= 30

        return EfficiencyScore(
            category=EfficiencyCategory.PERFORMANCE,
            score=max(0, min(100, score)),
            weight=self.config.scoring_weights.get("performance", 0.25),
            metrics={
                "response_time": metrics.response_time_ms,
                "throughput": metrics.throughput_rps,
                "error_rate": metrics.error_rate
            }
        )

    def _calculate_resource_score(self, metrics: EfficiencyMetrics) -> EfficiencyScore:
        """Calculate resource utilization score."""
        score = 100.0

        # CPU usage (higher utilization is better, but not too high)
        if metrics.cpu_usage > 0:
            if 50 <= metrics.cpu_usage <= 80:
                score += 25
            elif 30 <= metrics.cpu_usage < 50 or 80 < metrics.cpu_usage <= 90:
                score += 15
            elif 10 <= metrics.cpu_usage < 30:
                score += 10
            elif metrics.cpu_usage > 90:
                score -= 20

        # Memory usage
        if metrics.memory_usage > 0:
            if 40 <= metrics.memory_usage <= 70:
                score += 25
            elif 20 <= metrics.memory_usage < 40 or 70 < metrics.memory_usage <= 85:
                score += 15
            elif 10 <= metrics.memory_usage < 20:
                score += 10
            elif metrics.memory_usage > 85:
                score -= 20

        return EfficiencyScore(
            category=EfficiencyCategory.RESOURCE_UTILIZATION,
            score=max(0, min(100, score)),
            weight=self.config.scoring_weights.get("resource_utilization", 0.25),
            metrics={
                "cpu_usage": metrics.cpu_usage,
                "memory_usage": metrics.memory_usage
            }
        )

    def _calculate_cost_efficiency_score(self, metrics: EfficiencyMetrics) -> EfficiencyScore:
        """Calculate cost efficiency score."""
        score = 100.0

        if metrics.cost_per_request > 0:
            # Lower cost per request is better
            if metrics.cost_per_request < 0.001:
                score += 30
            elif metrics.cost_per_request < 0.01:
                score += 20
            elif metrics.cost_per_request < 0.1:
                score += 10
            elif metrics.cost_per_request > 1.0:
                score -= 30

        return EfficiencyScore(
            category=EfficiencyCategory.COST_EFFICIENCY,
            score=max(0, min(100, score)),
            weight=self.config.scoring_weights.get("cost_efficiency", 0.2),
            metrics={"cost_per_request": metrics.cost_per_request}
        )

    def _calculate_response_time_score(self, metrics: EfficiencyMetrics) -> EfficiencyScore:
        """Calculate response time score."""
        score = 0.0

        if metrics.response_time_ms > 0:
            if metrics.response_time_ms < 50:
                score = 100.0
            elif metrics.response_time_ms < 100:
                score = 90.0
            elif metrics.response_time_ms < 200:
                score = 75.0
            elif metrics.response_time_ms < 500:
                score = 60.0
            elif metrics.response_time_ms < 1000:
                score = 45.0
            elif metrics.response_time_ms < 2000:
                score = 30.0
            else:
                score = 15.0

        return EfficiencyScore(
            category=EfficiencyCategory.RESPONSE_TIME,
            score=score,
            weight=self.config.scoring_weights.get("response_time", 0.15),
            metrics={"response_time_ms": metrics.response_time_ms}
        )

    def _calculate_throughput_score(self, metrics: EfficiencyMetrics) -> EfficiencyScore:
        """Calculate throughput score."""
        score = 0.0

        if metrics.throughput_rps > 0:
            if metrics.throughput_rps > 1000:
                score = 100.0
            elif metrics.throughput_rps > 500:
                score = 85.0
            elif metrics.throughput_rps > 100:
                score = 70.0
            elif metrics.throughput_rps > 50:
                score = 55.0
            elif metrics.throughput_rps > 10:
                score = 40.0
            else:
                score = 25.0

        return EfficiencyScore(
            category=EfficiencyCategory.THROUGHPUT,
            score=score,
            weight=self.config.scoring_weights.get("throughput", 0.1),
            metrics={"throughput_rps": metrics.throughput_rps}
        )

    def _calculate_availability_score(self, metrics: EfficiencyMetrics) -> EfficiencyScore:
        """Calculate availability score."""
        score = 0.0

        if metrics.uptime_percent > 0:
            score = metrics.uptime_percent

        return EfficiencyScore(
            category=EfficiencyCategory.AVAILABILITY,
            score=score,
            weight=self.config.scoring_weights.get("availability", 0.05),
            metrics={"uptime_percent": metrics.uptime_percent}
        )

    def calculate_efficiency(self, agent_id: str, agent_name: str = "") -> Optional[AgentEfficiency]:
        """Calculate overall efficiency score for an agent."""
        with self._lock:
            metrics = self._agent_metrics.get(agent_id)
            if not metrics:
                return None

            # Calculate category scores
            category_scores = []
            category_scores.append(self._calculate_performance_score(metrics))
            category_scores.append(self._calculate_resource_score(metrics))
            category_scores.append(self._calculate_cost_efficiency_score(metrics))
            category_scores.append(self._calculate_response_time_score(metrics))
            category_scores.append(self._calculate_throughput_score(metrics))
            category_scores.append(self._calculate_availability_score(metrics))

            # Calculate weighted overall score
            total_weight = sum(s.weight for s in category_scores)
            overall_score = sum(s.score * s.weight for s in category_scores) / total_weight if total_weight > 0 else 0

            # Determine efficiency level
            if overall_score >= 90:
                level = EfficiencyLevel.EXCELLENT
            elif overall_score >= 70:
                level = EfficiencyLevel.GOOD
            elif overall_score >= 50:
                level = EfficiencyLevel.FAIR
            elif overall_score >= 30:
                level = EfficiencyLevel.POOR
            else:
                level = EfficiencyLevel.CRITICAL

            efficiency = AgentEfficiency(
                agent_id=agent_id,
                agent_name=agent_name or agent_id,
                overall_score=overall_score,
                category_scores=category_scores,
                level=level
            )

            # Store in history
            if agent_id not in self._historical_scores:
                self._historical_scores[agent_id] = []
            self._historical_scores[agent_id].append(efficiency)

            # Keep only recent history
            cutoff = time.time() - (self.config.history_retention_days * 86400)
            self._historical_scores[agent_id] = [
                e for e in self._historical_scores[agent_id]
                if e.timestamp >= cutoff
            ]

            return efficiency

    def get_agent_efficiency(self, agent_id: str) -> Optional[AgentEfficiency]:
        """Get current efficiency for an agent."""
        with self._lock:
            history = self._historical_scores.get(agent_id, [])
            if history:
                return history[-1]
            return None

    def get_efficiency_history(self, agent_id: str) -> List[AgentEfficiency]:
        """Get efficiency history for an agent."""
        with self._lock:
            return list(self._historical_scores.get(agent_id, []))

    def get_efficiency_trends(self, agent_id: str, periods: int = 7) -> List[EfficiencyTrend]:
        """Get efficiency trends."""
        with self._lock:
            history = self._historical_scores.get(agent_id, [])
            if len(history) < 2:
                return []

            trends = []
            period_size = max(1, len(history) // periods)

            for i in range(periods):
                start_idx = i * period_size
                end_idx = start_idx + period_size
                period_data = history[start_idx:end_idx]

                if not period_data:
                    continue

                avg_score = sum(e.overall_score for e in period_data) / len(period_data)

                # Determine trend direction
                if i == 0:
                    direction = "stable"
                    change = 0.0
                else:
                    prev_avg = trends[-1].avg_score if trends else avg_score
                    if avg_score > prev_avg * 1.05:
                        direction = "improving"
                    elif avg_score < prev_avg * 0.95:
                        direction = "declining"
                    else:
                        direction = "stable"

                    change = ((avg_score - prev_avg) / prev_avg * 100) if prev_avg > 0 else 0

                trends.append(EfficiencyTrend(
                    period=f"period_{i+1}",
                    avg_score=avg_score,
                    trend_direction=direction,
                    change_percent=change
                ))

            return trends

    def get_metrics(self, agent_id: str) -> Optional[Dict[str, float]]:
        """Get metrics for an agent."""
        with self._lock:
            metrics = self._agent_metrics.get(agent_id)
            if not metrics:
                return None

            return {
                "response_time_ms": metrics.response_time_ms,
                "throughput_rps": metrics.throughput_rps,
                "error_rate": metrics.error_rate,
                "cpu_usage": metrics.cpu_usage,
                "memory_usage": metrics.memory_usage,
                "cost_per_request": metrics.cost_per_request,
                "uptime_percent": metrics.uptime_percent
            }

    def get_all_metrics(self) -> Dict[str, Dict[str, float]]:
        """Get metrics for all agents."""
        with self._lock:
            return {
                aid: self.get_metrics(aid)
                for aid in self._agent_metrics.keys()
            }

    def get_leaderboard(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get efficiency leaderboard."""
        with self._lock:
            leaderboard = []

            for agent_id in self._agent_metrics.keys():
                efficiency = self.calculate_efficiency(agent_id)
                if efficiency:
                    leaderboard.append({
                        "agent_id": agent_id,
                        "agent_name": efficiency.agent_name,
                        "overall_score": efficiency.overall_score,
                        "level": efficiency.level.value
                    })

            # Sort by score descending
            leaderboard.sort(key=lambda x: x["overall_score"], reverse=True)
            return leaderboard[:limit]


class AgentEfficiency:
    """Agent efficiency management system."""

    def __init__(self):
        self._lock = threading.RLock()
        self._scorer = EfficiencyScorer(EfficiencyConfig())

    def update_agent_metrics(
        self,
        agent_id: str,
        agent_name: str = "",
        response_time_ms: float = None,
        throughput_rps: float = None,
        error_rate: float = None,
        cpu_usage: float = None,
        memory_usage: float = None,
        cost_per_request: float = None,
        uptime_percent: float = None
    ):
        """Update agent metrics."""
        self._scorer.update_agent_metrics(
            agent_id, agent_name, response_time_ms, throughput_rps,
            error_rate, cpu_usage, memory_usage, cost_per_request, uptime_percent
        )

    def calculate_efficiency(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Calculate efficiency for an agent."""
        efficiency = self._scorer.calculate_efficiency(agent_id)
        if not efficiency:
            return None

        return {
            "agent_id": efficiency.agent_id,
            "agent_name": efficiency.agent_name,
            "overall_score": efficiency.overall_score,
            "level": efficiency.level.value,
            "category_scores": [
                {
                    "category": cs.category.value,
                    "score": cs.score,
                    "weight": cs.weight,
                    "metrics": cs.metrics
                }
                for cs in efficiency.category_scores
            ],
            "timestamp": efficiency.timestamp
        }

    def get_efficiency(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Get current efficiency for an agent."""
        efficiency = self._scorer.get_agent_efficiency(agent_id)
        if not efficiency:
            return None

        return {
            "agent_id": efficiency.agent_id,
            "agent_name": efficiency.agent_name,
            "overall_score": efficiency.overall_score,
            "level": efficiency.level.value,
            "timestamp": efficiency.timestamp
        }

    def get_efficiency_history(self, agent_id: str) -> List[Dict[str, Any]]:
        """Get efficiency history."""
        history = self._scorer.get_efficiency_history(agent_id)
        return [
            {
                "agent_id": e.agent_id,
                "overall_score": e.overall_score,
                "level": e.level.value,
                "timestamp": e.timestamp
            }
            for e in history
        ]

    def get_efficiency_trends(self, agent_id: str, periods: int = 7) -> List[Dict[str, Any]]:
        """Get efficiency trends."""
        trends = self._scorer.get_efficiency_trends(agent_id, periods)
        return [
            {
                "period": t.period,
                "avg_score": t.avg_score,
                "trend_direction": t.trend_direction,
                "change_percent": t.change_percent
            }
            for t in trends
        ]

    def get_metrics(self, agent_id: str) -> Optional[Dict[str, float]]:
        """Get agent metrics."""
        return self._scorer.get_metrics(agent_id)

    def get_all_metrics(self) -> Dict[str, Dict[str, float]]:
        """Get all metrics."""
        return self._scorer.get_all_metrics()

    def get_leaderboard(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Get efficiency leaderboard."""
        return self._scorer.get_leaderboard(limit)


# Global efficiency instance
agent_efficiency = AgentEfficiency()
