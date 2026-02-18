"""Agent Cost Tracking Module

Cost tracking system for agents including cost collection, allocation, analysis,
forecasting, and cost optimization recommendations.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class CostCategory(str, Enum):
    """Cost categories."""
    COMPUTE = "compute"
    STORAGE = "storage"
    NETWORK = "network"
    DATABASE = "database"
    API_CALLS = "api_calls"
    DATA_TRANSFER = "data_transfer"
    THIRD_PARTY = "third_party"
    OTHER = "other"


class CostUnit(str, Enum):
    """Cost units."""
    HOUR = "hour"
    REQUEST = "request"
    GB = "gb"
    GB_HOUR = "gb_hour"
    TRANSACTION = "transaction"
    ITEM = "item"


class CostAggregation(str, Enum):
    """Cost aggregation methods."""
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class ForecastMethod(str, Enum):
    """Cost forecasting methods."""
    LINEAR = "linear"
    EXPONENTIAL = "exponential"
    MOVING_AVERAGE = "moving_average"


@dataclass
class CostEntry:
    """Individual cost entry."""
    id: str
    amount: float
    currency: str = "USD"
    category: CostCategory = CostCategory.OTHER
    description: str = ""
    agent_id: str = ""
    resource_id: str = ""
    timestamp: float = field(default_factory=time.time)


@dataclass
class CostAllocation:
    """Cost allocation rule."""
    id: str
    name: str
    category: CostCategory
    agent_id: str = ""
    namespace_id: str = ""
    percentage: float = 100.0
    enabled: bool = True


@dataclass
class CostConfig:
    """Cost tracking configuration."""
    currency: str = "USD"
    track_by_agent: bool = True
    track_by_category: bool = True
    track_by_namespace: bool = True
    enable_forecasting: bool = True
    forecast_window_days: int = 30


@dataclass
class CostSummary:
    """Cost summary data."""
    total_cost: float = 0.0
    by_category: Dict[str, float] = field(default_factory=dict)
    by_agent: Dict[str, float] = field(default_factory=dict)
    by_namespace: Dict[str, float] = field(default_factory=dict)


@dataclass
class CostForecast:
    """Cost forecast data."""
    method: ForecastMethod
    predicted_cost: float
    confidence: float = 0.0
    trend: str = "stable"  # increasing, decreasing, stable


@dataclass
class CostReport:
    """Cost report configuration."""
    id: str
    name: str
    aggregation: CostAggregation = CostAggregation.DAILY
    start_date: float = 0.0
    end_date: float = 0.0
    categories: List[CostCategory] = field(default_factory=list)
    group_by: List[str] = field(default_factory=list)


class CostTracker:
    """Cost tracking engine."""

    def __init__(self, config: CostConfig):
        self.config = config
        self._lock = threading.RLock()
        self._entries: List[CostEntry] = []
        self._allocations: Dict[str, CostAllocation] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_entry(
        self,
        amount: float,
        currency: str = "USD",
        category: CostCategory = CostCategory.OTHER,
        description: str = "",
        agent_id: str = "",
        resource_id: str = ""
    ) -> str:
        """Add a cost entry."""
        with self._lock:
            entry_id = str(uuid.uuid4())[:8]

            entry = CostEntry(
                id=entry_id,
                amount=amount,
                currency=currency,
                category=category,
                description=description,
                agent_id=agent_id,
                resource_id=resource_id
            )

            self._entries.append(entry)
            return entry_id

    def add_allocation(
        self,
        name: str,
        category: CostCategory,
        agent_id: str = "",
        namespace_id: str = "",
        percentage: float = 100.0
    ) -> str:
        """Add a cost allocation rule."""
        with self._lock:
            allocation_id = str(uuid.uuid4())[:8]

            allocation = CostAllocation(
                id=allocation_id,
                name=name,
                category=category,
                agent_id=agent_id,
                namespace_id=namespace_id,
                percentage=percentage
            )

            self._allocations[allocation_id] = allocation
            return allocation_id

    def remove_allocation(self, allocation_id: str) -> bool:
        """Remove an allocation rule."""
        with self._lock:
            if allocation_id in self._allocations:
                del self._allocations[allocation_id]
                return True
            return False

    def get_entries(
        self,
        start_time: float = None,
        end_time: float = None,
        category: CostCategory = None,
        agent_id: str = None
    ) -> List[CostEntry]:
        """Get cost entries with filters."""
        with self._lock:
            entries = self._entries

            if start_time:
                entries = [e for e in entries if e.timestamp >= start_time]
            if end_time:
                entries = [e for e in entries if e.timestamp <= end_time]
            if category:
                entries = [e for e in entries if e.category == category]
            if agent_id:
                entries = [e for e in entries if e.agent_id == agent_id]

            return entries

    def get_summary(
        self,
        start_time: float = None,
        end_time: float = None
    ) -> CostSummary:
        """Get cost summary."""
        with self._lock:
            entries = self.get_entries(start_time, end_time)

            summary = CostSummary()

            for entry in entries:
                summary.total_cost += entry.amount

                # By category
                cat = entry.category.value
                summary.by_category[cat] = summary.by_category.get(cat, 0) + entry.amount

                # By agent
                if entry.agent_id:
                    summary.by_agent[entry.agent_id] = summary.by_agent.get(entry.agent_id, 0) + entry.amount

            return summary

    def get_by_category(
        self,
        start_time: float = None,
        end_time: float = None
    ) -> Dict[str, float]:
        """Get costs grouped by category."""
        summary = self.get_summary(start_time, end_time)
        return summary.by_category

    def get_by_agent(
        self,
        start_time: float = None,
        end_time: float = None
    ) -> Dict[str, float]:
        """Get costs grouped by agent."""
        summary = self.get_summary(start_time, end_time)
        return summary.by_agent

    def get_trend(
        self,
        days: int = 30,
        aggregation: CostAggregation = CostAggregation.DAILY
    ) -> List[Dict[str, Any]]:
        """Get cost trend over time."""
        with self._lock:
            end_time = time.time()
            start_time = end_time - (days * 86400)

            entries = self.get_entries(start_time, end_time)

            # Group by time period
            grouped = defaultdict(float)
            for entry in entries:
                if aggregation == CostAggregation.HOURLY:
                    period = int(entry.timestamp / 3600)
                elif aggregation == CostAggregation.DAILY:
                    period = int(entry.timestamp / 86400)
                elif aggregation == CostAggregation.WEEKLY:
                    period = int(entry.timestamp / (86400 * 7))
                else:  # monthly
                    period = int(entry.timestamp / (86400 * 30))

                grouped[period] += entry.amount

            # Convert to sorted list
            result = []
            sorted_periods = sorted(grouped.keys())
            for period in sorted_periods:
                result.append({
                    "period": period,
                    "cost": grouped[period]
                })

            return result

    def forecast(
        self,
        method: ForecastMethod = ForecastMethod.LINEAR,
        days: int = 30
    ) -> CostForecast:
        """Forecast future costs."""
        with self._lock:
            # Get historical data
            trend = self.get_trend(days=days, aggregation=CostAggregation.DAILY)

            if len(trend) < 2:
                return CostForecast(
                    method=method,
                    predicted_cost=0.0,
                    confidence=0.0,
                    trend="stable"
                )

            # Simple linear regression
            costs = [t["cost"] for t in trend]
            n = len(costs)

            # Calculate average
            avg_cost = sum(costs) / n

            if method == ForecastMethod.LINEAR:
                # Simple moving average for prediction
                recent_avg = sum(costs[-7:]) / min(7, n)  # Last 7 days average
                predicted = recent_avg * days

            elif method == ForecastMethod.EXPONENTIAL:
                # Weighted average (more weight to recent)
                weights = list(range(1, n + 1))
                weighted_sum = sum(c * w for c, w in zip(costs, weights))
                weight_total = sum(weights)
                exp_avg = weighted_sum / weight_total
                predicted = exp_avg * days

            else:  # MOVING_AVERAGE
                window = min(7, n)
                moving_avg = sum(costs[-window:]) / window
                predicted = moving_avg * days

            # Calculate trend
            if n >= 2:
                first_half = sum(costs[:n//2]) / (n//2)
                second_half = sum(costs[n//2:]) / (n - n//2)

                if second_half > first_half * 1.1:
                    trend = "increasing"
                elif second_half < first_half * 0.9:
                    trend = "decreasing"
                else:
                    trend = "stable"
            else:
                trend = "stable"

            # Simple confidence based on data consistency
            if avg_cost > 0:
                variance = sum((c - avg_cost) ** 2 for c in costs) / n
                std_dev = variance ** 0.5
                confidence = max(0, min(100, 100 - (std_dev / avg_cost * 100)))
            else:
                confidence = 0

            return CostForecast(
                method=method,
                predicted_cost=predicted,
                confidence=confidence,
                trend=trend
            )


class AgentCostTracking:
    """Agent cost tracking management system."""

    def __init__(self):
        self._lock = threading.RLock()
        self._tracker: Optional[CostTracker] = None
        self._config = CostConfig()
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def initialize(self, config: CostConfig = None):
        """Initialize cost tracking."""
        with self._lock:
            if config:
                self._config = config
            self._tracker = CostTracker(self._config)

    def add_cost_entry(
        self,
        amount: float,
        currency: str = "USD",
        category: CostCategory = CostCategory.OTHER,
        description: str = "",
        agent_id: str = "",
        resource_id: str = ""
    ) -> str:
        """Add a cost entry."""
        if not self._tracker:
            self.initialize()

        return self._tracker.add_entry(
            amount, currency, category, description, agent_id, resource_id
        )

    def add_allocation(
        self,
        name: str,
        category: CostCategory,
        agent_id: str = "",
        namespace_id: str = "",
        percentage: float = 100.0
    ) -> str:
        """Add a cost allocation."""
        if not self._tracker:
            self.initialize()

        return self._tracker.add_allocation(
            name, category, agent_id, namespace_id, percentage
        )

    def remove_allocation(self, allocation_id: str) -> bool:
        """Remove an allocation."""
        if not self._tracker:
            return False
        return self._tracker.remove_allocation(allocation_id)

    def get_cost_entries(
        self,
        start_time: float = None,
        end_time: float = None,
        category: CostCategory = None,
        agent_id: str = None
    ) -> List[Dict[str, Any]]:
        """Get cost entries."""
        if not self._tracker:
            return []

        entries = self._tracker.get_entries(start_time, end_time, category, agent_id)
        return [
            {
                "id": e.id,
                "amount": e.amount,
                "currency": e.currency,
                "category": e.category.value,
                "description": e.description,
                "agent_id": e.agent_id,
                "resource_id": e.resource_id,
                "timestamp": e.timestamp
            }
            for e in entries
        ]

    def get_cost_summary(
        self,
        start_time: float = None,
        end_time: float = None
    ) -> Dict[str, Any]:
        """Get cost summary."""
        if not self._tracker:
            return {}

        summary = self._tracker.get_summary(start_time, end_time)
        return {
            "total_cost": summary.total_cost,
            "by_category": summary.by_category,
            "by_agent": summary.by_agent,
            "by_namespace": summary.by_namespace
        }

    def get_cost_by_category(
        self,
        start_time: float = None,
        end_time: float = None
    ) -> Dict[str, float]:
        """Get costs by category."""
        if not self._tracker:
            return {}
        return self._tracker.get_by_category(start_time, end_time)

    def get_cost_by_agent(
        self,
        start_time: float = None,
        end_time: float = None
    ) -> Dict[str, float]:
        """Get costs by agent."""
        if not self._tracker:
            return {}
        return self._tracker.get_by_agent(start_time, end_time)

    def get_cost_trend(
        self,
        days: int = 30,
        aggregation: CostAggregation = CostAggregation.DAILY
    ) -> List[Dict[str, Any]]:
        """Get cost trend."""
        if not self._tracker:
            return []
        return self._tracker.get_trend(days, aggregation)

    def forecast_cost(
        self,
        method: ForecastMethod = ForecastMethod.LINEAR,
        days: int = 30
    ) -> Dict[str, Any]:
        """Forecast costs."""
        if not self._tracker:
            return {}

        forecast = self._tracker.forecast(method, days)
        return {
            "method": forecast.method.value,
            "predicted_cost": forecast.predicted_cost,
            "confidence": forecast.confidence,
            "trend": forecast.trend,
            "forecast_days": days
        }

    def get_optimization_recommendations(self) -> List[Dict[str, Any]]:
        """Get cost optimization recommendations."""
        if not self._tracker:
            return []

        recommendations = []
        summary = self._tracker.get_summary()

        # Analyze by category
        for category, cost in summary.by_category.items():
            if cost > 1000:  # High cost category
                recommendations.append({
                    "type": "review",
                    "category": category,
                    "message": f"Review {category} costs - currently at ${cost:.2f}",
                    "potential_savings": cost * 0.1  # Assume 10% potential savings
                })

        # Check for unused agents
        agent_costs = summary.by_agent
        for agent_id, cost in agent_costs.items():
            if cost < 10:  # Low usage agent
                recommendations.append({
                    "type": "optimize",
                    "agent_id": agent_id,
                    "message": f"Agent {agent_id} has low usage (${cost:.2f})",
                    "potential_savings": cost * 0.5
                })

        return recommendations


# Global cost tracking instance
agent_cost_tracking = AgentCostTracking()
