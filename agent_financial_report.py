"""Agent Financial Report Module

Financial reporting system for agents including report generation, revenue tracking,
expense tracking, profit analysis, and financial dashboards.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class ReportType(str, Enum):
    """Financial report types."""
    INCOME_STATEMENT = "income_statement"
    BALANCE_SHEET = "balance_sheet"
    CASH_FLOW = "cash_flow"
    PROFIT_LOSS = "profit_loss"
    REVENUE_ANALYSIS = "revenue_analysis"
    EXPENSE_ANALYSIS = "expense_analysis"
    BUDGET_VARIANCE = "budget_variance"
    CUSTOM = "custom"


class ReportPeriod(str, Enum):
    """Report periods."""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"


class ReportFormat(str, Enum):
    """Report output formats."""
    JSON = "json"
    CSV = "csv"
    PDF = "pdf"
    HTML = "html"


class TransactionCategory(str, Enum):
    """Financial transaction categories."""
    REVENUE = "revenue"
    EXPENSE = "expense"
    INVESTMENT = "investment"
    DEPRECIATION = "depreciation"
    TAX = "tax"
    OTHER = "other"


@dataclass
class FinancialTransaction:
    """Financial transaction record."""
    id: str
    transaction_type: TransactionCategory
    amount: float
    currency: str = "USD"
    description: str = ""
    agent_id: str = ""
    project_id: str = ""
    timestamp: float = field(default_factory=time.time)


@dataclass
class RevenueEntry:
    """Revenue entry."""
    id: str
    source: str
    amount: float
    currency: str = "USD"
    category: str = ""
    agent_id: str = ""
    timestamp: float = field(default_factory=time.time)


@dataclass
class ExpenseEntry:
    """Expense entry."""
    id: str
    vendor: str
    amount: float
    currency: str = "USD"
    category: str = ""
    agent_id: str = ""
    timestamp: float = field(default_factory=time.time)


@dataclass
class ReportConfig:
    """Report configuration."""
    name: str
    report_type: ReportType
    period: ReportPeriod = ReportPeriod.MONTHLY
    start_date: float = 0.0
    end_date: float = 0.0
    group_by: List[str] = field(default_factory=list)
    include_charts: bool = True
    currency: str = "USD"


@dataclass
class ReportData:
    """Report data container."""
    report_id: str
    name: str
    report_type: ReportType
    period: ReportPeriod
    generated_at: float = field(default_factory=time.time)
    start_date: float = 0.0
    end_date: float = 0.0
    data: Dict[str, Any] = field(default_factory=dict)
    summary: Dict[str, float] = field(default_factory=dict)


@dataclass
class FinancialMetrics:
    """Financial metrics."""
    total_revenue: float = 0.0
    total_expenses: float = 0.0
    net_profit: float = 0.0
    profit_margin: float = 0.0
    revenue_growth: float = 0.0
    expense_growth: float = 0.0


class FinancialReportGenerator:
    """Financial report generation engine."""

    def __init__(self):
        self._lock = threading.RLock()
        self._transactions: List[FinancialTransaction] = []
        self._revenues: List[RevenueEntry] = []
        self._expenses: List[ExpenseEntry] = []
        self._reports: Dict[str, ReportData] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_transaction(
        self,
        transaction_type: TransactionCategory,
        amount: float,
        currency: str = "USD",
        description: str = "",
        agent_id: str = "",
        project_id: str = ""
    ) -> str:
        """Add a financial transaction."""
        with self._lock:
            transaction_id = str(uuid.uuid4())[:8]

            transaction = FinancialTransaction(
                id=transaction_id,
                transaction_type=transaction_type,
                amount=amount,
                currency=currency,
                description=description,
                agent_id=agent_id,
                project_id=project_id
            )

            self._transactions.append(transaction)

            # Also add to revenues or expenses
            if transaction_type == TransactionCategory.REVENUE:
                self._revenues.append(RevenueEntry(
                    id=transaction_id,
                    source=description or "unknown",
                    amount=amount,
                    currency=currency,
                    agent_id=agent_id
                ))
            elif transaction_type == TransactionCategory.EXPENSE:
                self._expenses.append(ExpenseEntry(
                    id=transaction_id,
                    vendor=description or "unknown",
                    amount=amount,
                    currency=currency,
                    agent_id=agent_id
                ))

            return transaction_id

    def add_revenue(
        self,
        source: str,
        amount: float,
        currency: str = "USD",
        category: str = "",
        agent_id: str = ""
    ) -> str:
        """Add a revenue entry."""
        with self._lock:
            revenue_id = str(uuid.uuid4())[:8]

            revenue = RevenueEntry(
                id=revenue_id,
                source=source,
                amount=amount,
                currency=currency,
                category=category,
                agent_id=agent_id
            )

            self._revenues.append(revenue)
            return revenue_id

    def add_expense(
        self,
        vendor: str,
        amount: float,
        currency: str = "USD",
        category: str = "",
        agent_id: str = ""
    ) -> str:
        """Add an expense entry."""
        with self._lock:
            expense_id = str(uuid.uuid4())[:8]

            expense = ExpenseEntry(
                id=expense_id,
                vendor=vendor,
                amount=amount,
                currency=currency,
                category=category,
                agent_id=agent_id
            )

            self._expenses.append(expense)
            return expense_id

    def get_transactions(
        self,
        start_time: float = None,
        end_time: float = None,
        transaction_type: TransactionCategory = None
    ) -> List[FinancialTransaction]:
        """Get transactions with filters."""
        with self._lock:
            transactions = self._transactions

            if start_time:
                transactions = [t for t in transactions if t.timestamp >= start_time]
            if end_time:
                transactions = [t for t in transactions if t.timestamp <= end_time]
            if transaction_type:
                transactions = [t for t in transactions if t.transaction_type == transaction_type]

            return transactions

    def get_revenues(
        self,
        start_time: float = None,
        end_time: float = None,
        agent_id: str = None
    ) -> List[RevenueEntry]:
        """Get revenue entries."""
        with self._lock:
            revenues = self._revenues

            if start_time:
                revenues = [r for r in revenues if r.timestamp >= start_time]
            if end_time:
                revenues = [r for r in revenues if r.timestamp <= end_time]
            if agent_id:
                revenues = [r for r in revenues if r.agent_id == agent_id]

            return revenues

    def get_expenses(
        self,
        start_time: float = None,
        end_time: float = None,
        agent_id: str = None
    ) -> List[ExpenseEntry]:
        """Get expense entries."""
        with self._lock:
            expenses = self._expenses

            if start_time:
                expenses = [e for e in expenses if e.timestamp >= start_time]
            if end_time:
                expenses = [e for e in expenses if e.timestamp <= end_time]
            if agent_id:
                expenses = [e for e in expenses if e.agent_id == agent_id]

            return expenses

    def calculate_metrics(
        self,
        start_time: float = None,
        end_time: float = None
    ) -> FinancialMetrics:
        """Calculate financial metrics."""
        revenues = self.get_revenues(start_time, end_time)
        expenses = self.get_expenses(start_time, end_time)

        total_revenue = sum(r.amount for r in revenues)
        total_expenses = sum(e.amount for e in expenses)
        net_profit = total_revenue - total_expenses

        profit_margin = 0.0
        if total_revenue > 0:
            profit_margin = (net_profit / total_revenue) * 100

        # Calculate growth (simplified - comparing halves of period)
        if start_time and end_time:
            mid_time = (start_time + end_time) / 2
            first_half_rev = sum(r.amount for r in revenues if r.timestamp < mid_time)
            second_half_rev = sum(r.amount for r in revenues if r.timestamp >= mid_time)

            revenue_growth = 0.0
            if first_half_rev > 0:
                revenue_growth = ((second_half_rev - first_half_rev) / first_half_rev) * 100

            first_half_exp = sum(e.amount for e in expenses if e.timestamp < mid_time)
            second_half_exp = sum(e.amount for e in expenses if e.timestamp >= mid_time)

            expense_growth = 0.0
            if first_half_exp > 0:
                expense_growth = ((second_half_exp - first_half_exp) / first_half_exp) * 100
        else:
            revenue_growth = 0.0
            expense_growth = 0.0

        return FinancialMetrics(
            total_revenue=total_revenue,
            total_expenses=total_expenses,
            net_profit=net_profit,
            profit_margin=profit_margin,
            revenue_growth=revenue_growth,
            expense_growth=expense_growth
        )

    def generate_income_statement(
        self,
        start_time: float,
        end_time: float,
        group_by: List[str] = None
    ) -> ReportData:
        """Generate income statement."""
        revenues = self.get_revenues(start_time, end_time)
        expenses = self.get_expenses(start_time, end_time)

        total_revenue = sum(r.amount for r in revenues)
        total_expenses = sum(e.amount for e in expenses)
        net_profit = total_revenue - total_expenses

        # Group revenues by source
        revenue_by_source = defaultdict(float)
        for r in revenues:
            revenue_by_source[r.source] += r.amount

        # Group expenses by vendor
        expense_by_vendor = defaultdict(float)
        for e in expenses:
            expense_by_vendor[e.vendor] += e.amount

        report_id = str(uuid.uuid4())[:8]
        report = ReportData(
            report_id=report_id,
            name="Income Statement",
            report_type=ReportType.INCOME_STATEMENT,
            period=ReportPeriod.MONTHLY,
            start_date=start_time,
            end_date=end_time,
            data={
                "revenues": dict(revenue_by_source),
                "expenses": dict(expense_by_vendor)
            },
            summary={
                "total_revenue": total_revenue,
                "total_expenses": total_expenses,
                "net_profit": net_profit,
                "profit_margin": (net_profit / total_revenue * 100) if total_revenue > 0 else 0
            }
        )

        self._reports[report_id] = report
        return report

    def generate_profit_loss_report(
        self,
        start_time: float,
        end_time: float
    ) -> ReportData:
        """Generate profit and loss report."""
        revenues = self.get_revenues(start_time, end_time)
        expenses = self.get_expenses(start_time, end_time)

        # Group by category
        revenue_by_category = defaultdict(float)
        for r in revenues:
            cat = r.category or "other"
            revenue_by_category[cat] += r.amount

        expense_by_category = defaultdict(float)
        for e in expenses:
            cat = e.category or "other"
            expense_by_category[cat] += e.amount

        total_revenue = sum(r.amount for r in revenues)
        total_expenses = sum(e.amount for e in expenses)

        report_id = str(uuid.uuid4())[:8]
        report = ReportData(
            report_id=report_id,
            name="Profit & Loss Report",
            report_type=ReportType.PROFIT_LOSS,
            period=ReportPeriod.MONTHLY,
            start_date=start_time,
            end_date=end_time,
            data={
                "revenue_by_category": dict(revenue_by_category),
                "expense_by_category": dict(expense_by_category)
            },
            summary={
                "total_revenue": total_revenue,
                "total_expenses": total_expenses,
                "gross_profit": total_revenue - sum(e.amount for e in expenses if e.category == "cost_of_goods"),
                "net_profit": total_revenue - total_expenses
            }
        )

        self._reports[report_id] = report
        return report

    def generate_revenue_analysis(
        self,
        start_time: float,
        end_time: float
    ) -> ReportData:
        """Generate revenue analysis report."""
        revenues = self.get_revenues(start_time, end_time)

        # Group by source
        by_source = defaultdict(float)
        # Group by agent
        by_agent = defaultdict(float)
        # Group by category
        by_category = defaultdict(float)

        for r in revenues:
            by_source[r.source] += r.amount
            if r.agent_id:
                by_agent[r.agent_id] += r.amount
            if r.category:
                by_category[r.category] += r.amount

        total = sum(r.amount for r in revenues)

        report_id = str(uuid.uuid4())[:8]
        report = ReportData(
            report_id=report_id,
            name="Revenue Analysis",
            report_type=ReportType.REVENUE_ANALYSIS,
            period=ReportPeriod.MONTHLY,
            start_date=start_time,
            end_date=end_time,
            data={
                "by_source": dict(by_source),
                "by_agent": dict(by_agent),
                "by_category": dict(by_category)
            },
            summary={
                "total_revenue": total,
                "sources_count": len(by_source),
                "agents_count": len(by_agent)
            }
        )

        self._reports[report_id] = report
        return report

    def generate_expense_analysis(
        self,
        start_time: float,
        end_time: float
    ) -> ReportData:
        """Generate expense analysis report."""
        expenses = self.get_expenses(start_time, end_time)

        # Group by vendor
        by_vendor = defaultdict(float)
        # Group by agent
        by_agent = defaultdict(float)
        # Group by category
        by_category = defaultdict(float)

        for e in expenses:
            by_vendor[e.vendor] += e.amount
            if e.agent_id:
                by_agent[e.agent_id] += e.amount
            if e.category:
                by_category[e.category] += e.amount

        total = sum(e.amount for e in expenses)

        report_id = str(uuid.uuid4())[:8]
        report = ReportData(
            report_id=report_id,
            name="Expense Analysis",
            report_type=ReportType.EXPENSE_ANALYSIS,
            period=ReportPeriod.MONTHLY,
            start_date=start_time,
            end_date=end_time,
            data={
                "by_vendor": dict(by_vendor),
                "by_agent": dict(by_agent),
                "by_category": dict(by_category)
            },
            summary={
                "total_expenses": total,
                "vendors_count": len(by_vendor),
                "agents_count": len(by_agent)
            }
        )

        self._reports[report_id] = report
        return report

    def get_report(self, report_id: str) -> Optional[ReportData]:
        """Get a generated report."""
        with self._lock:
            return self._reports.get(report_id)

    def list_reports(self) -> List[ReportData]:
        """List all generated reports."""
        with self._lock:
            return list(self._reports.values())


class AgentFinancialReport:
    """Agent financial report management system."""

    def __init__(self):
        self._lock = threading.RLock()
        self._generator = FinancialReportGenerator()
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_transaction(
        self,
        transaction_type: TransactionCategory,
        amount: float,
        currency: str = "USD",
        description: str = "",
        agent_id: str = "",
        project_id: str = ""
    ) -> str:
        """Add a financial transaction."""
        return self._generator.add_transaction(
            transaction_type, amount, currency, description, agent_id, project_id
        )

    def add_revenue(
        self,
        source: str,
        amount: float,
        currency: str = "USD",
        category: str = "",
        agent_id: str = ""
    ) -> str:
        """Add a revenue entry."""
        return self._generator.add_revenue(source, amount, currency, category, agent_id)

    def add_expense(
        self,
        vendor: str,
        amount: float,
        currency: str = "USD",
        category: str = "",
        agent_id: str = ""
    ) -> str:
        """Add an expense entry."""
        return self._generator.add_expense(vendor, amount, currency, category, agent_id)

    def get_transactions(
        self,
        start_time: float = None,
        end_time: float = None,
        transaction_type: TransactionCategory = None
    ) -> List[Dict[str, Any]]:
        """Get transactions."""
        transactions = self._generator.get_transactions(start_time, end_time, transaction_type)
        return [
            {
                "id": t.id,
                "type": t.transaction_type.value,
                "amount": t.amount,
                "currency": t.currency,
                "description": t.description,
                "agent_id": t.agent_id,
                "project_id": t.project_id,
                "timestamp": t.timestamp
            }
            for t in transactions
        ]

    def get_revenues(
        self,
        start_time: float = None,
        end_time: float = None,
        agent_id: str = None
    ) -> List[Dict[str, Any]]:
        """Get revenues."""
        revenues = self._generator.get_revenues(start_time, end_time, agent_id)
        return [
            {
                "id": r.id,
                "source": r.source,
                "amount": r.amount,
                "currency": r.currency,
                "category": r.category,
                "agent_id": r.agent_id,
                "timestamp": r.timestamp
            }
            for r in revenues
        ]

    def get_expenses(
        self,
        start_time: float = None,
        end_time: float = None,
        agent_id: str = None
    ) -> List[Dict[str, Any]]:
        """Get expenses."""
        expenses = self._generator.get_expenses(start_time, end_time, agent_id)
        return [
            {
                "id": e.id,
                "vendor": e.vendor,
                "amount": e.amount,
                "currency": e.currency,
                "category": e.category,
                "agent_id": e.agent_id,
                "timestamp": e.timestamp
            }
            for e in expenses
        ]

    def get_metrics(
        self,
        start_time: float = None,
        end_time: float = None
    ) -> Dict[str, float]:
        """Get financial metrics."""
        metrics = self._generator.calculate_metrics(start_time, end_time)
        return {
            "total_revenue": metrics.total_revenue,
            "total_expenses": metrics.total_expenses,
            "net_profit": metrics.net_profit,
            "profit_margin": metrics.profit_margin,
            "revenue_growth": metrics.revenue_growth,
            "expense_growth": metrics.expense_growth
        }

    def generate_income_statement(
        self,
        start_time: float,
        end_time: float,
        group_by: List[str] = None
    ) -> Dict[str, Any]:
        """Generate income statement."""
        report = self._generator.generate_income_statement(start_time, end_time, group_by)
        return {
            "report_id": report.report_id,
            "name": report.name,
            "type": report.report_type.value,
            "generated_at": report.generated_at,
            "data": report.data,
            "summary": report.summary
        }

    def generate_profit_loss(
        self,
        start_time: float,
        end_time: float
    ) -> Dict[str, Any]:
        """Generate profit and loss report."""
        report = self._generator.generate_profit_loss_report(start_time, end_time)
        return {
            "report_id": report.report_id,
            "name": report.name,
            "type": report.report_type.value,
            "generated_at": report.generated_at,
            "data": report.data,
            "summary": report.summary
        }

    def generate_revenue_analysis(
        self,
        start_time: float,
        end_time: float
    ) -> Dict[str, Any]:
        """Generate revenue analysis."""
        report = self._generator.generate_revenue_analysis(start_time, end_time)
        return {
            "report_id": report.report_id,
            "name": report.name,
            "type": report.report_type.value,
            "generated_at": report.generated_at,
            "data": report.data,
            "summary": report.summary
        }

    def generate_expense_analysis(
        self,
        start_time: float,
        end_time: float
    ) -> Dict[str, Any]:
        """Generate expense analysis."""
        report = self._generator.generate_expense_analysis(start_time, end_time)
        return {
            "report_id": report.report_id,
            "name": report.name,
            "type": report.report_type.value,
            "generated_at": report.generated_at,
            "data": report.data,
            "summary": report.summary
        }

    def get_report(self, report_id: str) -> Optional[Dict[str, Any]]:
        """Get a generated report."""
        report = self._generator.get_report(report_id)
        if not report:
            return None
        return {
            "report_id": report.report_id,
            "name": report.name,
            "type": report.report_type.value,
            "generated_at": report.generated_at,
            "data": report.data,
            "summary": report.summary
        }

    def list_reports(self) -> List[Dict[str, Any]]:
        """List all generated reports."""
        reports = self._generator.list_reports()
        return [
            {
                "report_id": r.report_id,
                "name": r.name,
                "type": r.report_type.value,
                "generated_at": r.generated_at,
                "summary": r.summary
            }
            for r in reports
        ]


# Global financial report instance
agent_financial_report = AgentFinancialReport()
