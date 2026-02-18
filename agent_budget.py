"""Agent Budget Module

Budget allocation and tracking system for agents including budget creation,
spending tracking, alerts, and budget reconciliation.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class BudgetPeriod(str, Enum):
    """Budget periods."""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    CUSTOM = "custom"


class BudgetStatus(str, Enum):
    """Budget status."""
    ACTIVE = "active"
    EXCEEDED = "exceeded"
    DEPLETED = "depleted"
    FROZEN = "frozen"
    ARCHIVED = "archived"


class TransactionType(str, Enum):
    """Transaction types."""
    CREDIT = "credit"
    DEBIT = "debit"
    ALLOCATION = "allocation"
    ADJUSTMENT = "adjustment"
    REFUND = "refund"


class AlertLevel(str, Enum):
    """Alert levels."""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


@dataclass
class BudgetAllocation:
    """Budget allocation for a category or agent."""
    id: str
    name: str
    allocated_amount: float
    spent_amount: float = 0.0
    currency: str = "USD"
    tags: List[str] = field(default_factory=list)


@dataclass
class BudgetTransaction:
    """Budget transaction record."""
    id: str
    transaction_type: TransactionType
    amount: float
    currency: str = "USD"
    description: str = ""
    category: str = ""
    agent_id: str = ""
    created_at: float = field(default_factory=time.time)


@dataclass
class BudgetAlert:
    """Budget alert configuration."""
    id: str
    alert_level: AlertLevel
    threshold_percent: float
    enabled: bool = True
    message: str = ""


@dataclass
class BudgetConfig:
    """Budget configuration."""
    name: str
    total_amount: float
    currency: str = "USD"
    period: BudgetPeriod = BudgetPeriod.MONTHLY
    rollover_enabled: bool = False
    auto_freeze: bool = True
    freeze_threshold: float = 1.0  # 100%
    alert_enabled: bool = True
    enable_overspending: bool = False


@dataclass
class Budget:
    """Budget instance."""
    id: str
    name: str
    config: BudgetConfig
    status: BudgetStatus = BudgetStatus.ACTIVE
    spent_amount: float = 0.0
    remaining_amount: float = 0.0
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    period_start: float = field(default_factory=time.time)
    period_end: float = 0.0
    allocations: List[BudgetAllocation] = field(default_factory=list)
    transactions: List[BudgetTransaction] = field(default_factory=list)
    alerts: List[BudgetAlert] = field(default_factory=list)


@dataclass
class BudgetStats:
    """Budget statistics."""
    total_budgets: int = 0
    active_budgets: int = 0
    total_allocated: float = 0.0
    total_spent: float = 0.0
    total_alerts: int = 0
    avg_utilization: float = 0.0


class BudgetManager:
    """Budget manager for allocation and tracking."""

    def __init__(self, config: BudgetConfig):
        self.config = config
        self._lock = threading.RLock()
        self._id = str(uuid.uuid4())[:8]
        self._transactions: List[BudgetTransaction] = []
        self._alerts_triggered: List[Dict[str, Any]] = []
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def get_id(self) -> str:
        """Get budget ID."""
        return self._id

    def add_allocation(self, name: str, allocated_amount: float, currency: str = "USD", tags: List[str] = None) -> str:
        """Add a budget allocation."""
        with self._lock:
            allocation_id = str(uuid.uuid4())[:8]

            allocation = BudgetAllocation(
                id=allocation_id,
                name=name,
                allocated_amount=allocated_amount,
                currency=currency,
                tags=tags or []
            )

            return allocation_id

    def add_transaction(
        self,
        transaction_type: TransactionType,
        amount: float,
        currency: str = "USD",
        description: str = "",
        category: str = "",
        agent_id: str = ""
    ) -> str:
        """Add a transaction."""
        with self._lock:
            transaction_id = str(uuid.uuid4())[:8]

            transaction = BudgetTransaction(
                id=transaction_id,
                transaction_type=transaction_type,
                amount=amount,
                currency=currency,
                description=description,
                category=category,
                agent_id=agent_id
            )

            self._transactions.append(transaction)
            return transaction_id

    def add_alert(
        self,
        alert_level: AlertLevel,
        threshold_percent: float,
        message: str = ""
    ) -> str:
        """Add an alert configuration."""
        with self._lock:
            alert_id = str(uuid.uuid4())[:8]

            alert = BudgetAlert(
                id=alert_id,
                alert_level=alert_level,
                threshold_percent=threshold_percent,
                message=message
            )

            return alert_id

    def get_transactions(self) -> List[BudgetTransaction]:
        """Get all transactions."""
        with self._lock:
            return list(self._transactions)

    def get_transactions_by_category(self, category: str) -> List[BudgetTransaction]:
        """Get transactions by category."""
        with self._lock:
            return [t for t in self._transactions if t.category == category]

    def get_transactions_by_agent(self, agent_id: str) -> List[BudgetTransaction]:
        """Get transactions by agent."""
        with self._lock:
            return [t for t in self._transactions if t.agent_id == agent_id]

    def calculate_spending(self) -> float:
        """Calculate total spending."""
        with self._lock:
            total = 0.0
            for t in self._transactions:
                if t.transaction_type == TransactionType.DEBIT:
                    total += t.amount
            return total

    def check_budget_status(self) -> BudgetStatus:
        """Check current budget status."""
        with self._lock:
            if self.config.total_amount <= 0:
                return BudgetStatus.DEPLETED

            spent = self.calculate_spending()
            utilization = spent / self.config.total_amount

            if utilization >= 1.0:
                return BudgetStatus.EXCEEDED if not self.config.enable_overspending else BudgetStatus.DEPLETED
            elif utilization >= self.config.freeze_threshold:
                return BudgetStatus.FROZEN if self.config.auto_freeze else BudgetStatus.ACTIVE

            return BudgetStatus.ACTIVE

    def get_utilization(self) -> float:
        """Get budget utilization percentage."""
        with self._lock:
            if self.config.total_amount <= 0:
                return 0.0
            spent = self.calculate_spending()
            return (spent / self.config.total_amount) * 100

    def check_alerts(self) -> List[Dict[str, Any]]:
        """Check and trigger alerts."""
        triggered = []
        utilization = self.get_utilization()

        for alert in self._alerts_triggered:
            if not alert.enabled:
                continue

            if utilization >= alert.threshold_percent:
                triggered.append({
                    "alert_id": alert.id,
                    "level": alert.alert_level.value,
                    "message": alert.message or f"Budget utilization at {utilization:.1f}%",
                    "threshold": alert.threshold_percent,
                    "current": utilization,
                    "timestamp": time.time()
                })

        return triggered

    def reset_period(self):
        """Reset budget for new period."""
        with self._lock:
            self._transactions.clear()
            self._alerts_triggered.clear()


class AgentBudget:
    """Agent budget management system."""

    def __init__(self):
        self._lock = threading.RLock()
        self._budgets: Dict[str, BudgetManager] = {}
        self._budget_configs: Dict[str, BudgetConfig] = {}
        self._stats = BudgetStats()
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def create_budget(
        self,
        name: str,
        total_amount: float,
        currency: str = "USD",
        period: BudgetPeriod = BudgetPeriod.MONTHLY,
        rollover_enabled: bool = False,
        auto_freeze: bool = True,
        freeze_threshold: float = 1.0,
        alert_enabled: bool = True,
        enable_overspending: bool = False
    ) -> str:
        """Create a new budget."""
        with self._lock:
            budget_id = str(uuid.uuid4())[:8]

            config = BudgetConfig(
                name=name,
                total_amount=total_amount,
                currency=currency,
                period=period,
                rollover_enabled=rollover_enabled,
                auto_freeze=auto_freeze,
                freeze_threshold=freeze_threshold,
                alert_enabled=alert_enabled,
                enable_overspending=enable_overspending
            )

            budget = BudgetManager(config)
            self._budgets[budget_id] = budget
            self._budget_configs[budget_id] = config
            self._stats.total_budgets += 1
            self._stats.active_budgets += 1

            return budget_id

    def get_budget(self, budget_id: str) -> Optional[BudgetManager]:
        """Get budget by ID."""
        with self._lock:
            return self._budgets.get(budget_id)

    def delete_budget(self, budget_id: str) -> bool:
        """Delete a budget."""
        with self._lock:
            if budget_id in self._budgets:
                del self._budgets[budget_id]
                if budget_id in self._budget_configs:
                    del self._budget_configs[budget_id]
                self._stats.total_budgets = max(0, self._stats.total_budgets - 1)
                self._stats.active_budgets = max(0, self._stats.active_budgets - 1)
                return True
            return False

    def list_budgets(self) -> List[Dict[str, Any]]:
        """List all budgets."""
        with self._lock:
            return [
                {
                    "id": bid,
                    "name": bc.name,
                    "total_amount": bc.total_amount,
                    "currency": bc.currency,
                    "period": bc.period.value,
                    "spent": b.calculate_spending(),
                    "remaining": bc.total_amount - b.calculate_spending(),
                    "utilization": b.get_utilization(),
                    "status": b.check_budget_status().value
                }
                for bid, (b, bc) in zip(self._budgets.keys(), [
                    (self._budgets[bid], self._budget_configs[bid])
                    for bid in self._budgets.keys()
                ])
            ]

    def add_transaction(
        self,
        budget_id: str,
        transaction_type: TransactionType,
        amount: float,
        currency: str = "USD",
        description: str = "",
        category: str = "",
        agent_id: str = ""
    ) -> Optional[str]:
        """Add a transaction to a budget."""
        budget = self.get_budget(budget_id)
        if not budget:
            return None
        return budget.add_transaction(
            transaction_type, amount, currency, description, category, agent_id
        )

    def get_transactions(self, budget_id: str) -> List[Dict[str, Any]]:
        """Get transactions for a budget."""
        budget = self.get_budget(budget_id)
        if not budget:
            return []

        transactions = budget.get_transactions()
        return [
            {
                "id": t.id,
                "type": t.transaction_type.value,
                "amount": t.amount,
                "currency": t.currency,
                "description": t.description,
                "category": t.category,
                "agent_id": t.agent_id,
                "created_at": t.created_at
            }
            for t in transactions
        ]

    def get_transactions_by_category(self, budget_id: str, category: str) -> List[Dict[str, Any]]:
        """Get transactions by category."""
        budget = self.get_budget(budget_id)
        if not budget:
            return []

        transactions = budget.get_transactions_by_category(category)
        return [
            {
                "id": t.id,
                "type": t.transaction_type.value,
                "amount": t.amount,
                "currency": t.currency,
                "description": t.description,
                "created_at": t.created_at
            }
            for t in transactions
        ]

    def get_transactions_by_agent(self, budget_id: str, agent_id: str) -> List[Dict[str, Any]]:
        """Get transactions by agent."""
        budget = self.get_budget(budget_id)
        if not budget:
            return []

        transactions = budget.get_transactions_by_agent(agent_id)
        return [
            {
                "id": t.id,
                "type": t.transaction_type.value,
                "amount": t.amount,
                "currency": t.currency,
                "description": t.description,
                "category": t.category,
                "created_at": t.created_at
            }
            for t in transactions
        ]

    def get_budget_status(self, budget_id: str) -> Optional[str]:
        """Get budget status."""
        budget = self.get_budget(budget_id)
        if not budget:
            return None
        return budget.check_budget_status().value

    def get_utilization(self, budget_id: str) -> Optional[float]:
        """Get budget utilization."""
        budget = self.get_budget(budget_id)
        if not budget:
            return None
        return budget.get_utilization()

    def check_alerts(self, budget_id: str) -> List[Dict[str, Any]]:
        """Check budget alerts."""
        budget = self.get_budget(budget_id)
        if not budget:
            return []
        return budget.check_alerts()

    def get_stats(self) -> Dict[str, Any]:
        """Get budget statistics."""
        with self._lock:
            total_allocated = sum(bc.total_amount for bc in self._budget_configs.values())
            total_spent = sum(b.calculate_spending() for b in self._budgets.values())

            utilization = 0.0
            if self._stats.total_budgets > 0:
                utilization = (total_spent / total_allocated * 100) if total_allocated > 0 else 0.0

            return {
                "total_budgets": self._stats.total_budgets,
                "active_budgets": self._stats.active_budgets,
                "total_allocated": total_allocated,
                "total_spent": total_spent,
                "total_remaining": total_allocated - total_spent,
                "avg_utilization": round(utilization, 2)
            }

    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics for all budgets."""
        return {
            bid: {
                "name": bc.name,
                "total_amount": bc.total_amount,
                "spent": b.calculate_spending(),
                "remaining": bc.total_amount - b.calculate_spending(),
                "utilization": b.get_utilization(),
                "status": b.check_budget_status().value
            }
            for bid, (b, bc) in zip(self._budgets.keys(), [
                (self._budgets[bid], self._budget_configs[bid])
                for bid in self._budgets.keys()
            ])
        }

    def allocate_budget(
        self,
        budget_id: str,
        name: str,
        amount: float,
        currency: str = "USD",
        tags: List[str] = None
    ) -> Optional[str]:
        """Allocate budget to a category or agent."""
        budget = self.get_budget(budget_id)
        if not budget:
            return None

        allocation_id = budget.add_allocation(name, amount, currency, tags)

        # Add allocation transaction
        budget.add_transaction(
            TransactionType.ALLOCATION,
            amount,
            currency,
            f"Budget allocation: {name}",
            name
        )

        return allocation_id

    def reset_budget_period(self, budget_id: str) -> bool:
        """Reset budget for new period."""
        budget = self.get_budget(budget_id)
        if not budget:
            return False

        budget.reset_period()
        return True


# Global budget instance
agent_budget = AgentBudget()
