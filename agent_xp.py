"""
Agent XP (Experience Points) Module

Provides experience points management system for agents.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional
import threading


class XPStatus(Enum):
    """XP status enumeration"""
    ACTIVE = "active"
    FROZEN = "frozen"
    EXPIRED = "expired"


class XPEventType(Enum):
    """XP event type enumeration"""
    TASK_COMPLETED = "task_completed"
    TASK_EXCELLENT = "task_excellent"
    TASK_FAILED = "task_failed"
    CODE_REVIEW = "code_review"
    BUG_FIX = "bug_fix"
    FEATURE_IMPLEMENTED = "feature_implemented"
    DOCUMENTATION = "documentation"
    MENTORING = "mentoring"
    COLLABORATION = "collaboration"
    INNOVATION = "innovation"
    STREAK_BONUS = "streak_bonus"
    MILESTONE_REACHED = "milestone_reached"
    LEVEL_UP = "level_up"
    PENALTY = "penalty"


class XPMultiplier(Enum):
    """XP multiplier types"""
    NONE = 1.0
    BONUS = 1.5
    DOUBLE = 2.0
    TRIPLE = 3.0
    LEGENDARY = 5.0


class XPGainType(Enum):
    """XP gain type enumeration"""
    BASE = "base"
    BONUS = "bonus"
    PENALTY = "penalty"
    ADJUSTMENT = "adjustment"
    STREAK = "streak"
    MILESTONE = "milestone"


@dataclass
class XPEvent:
    """XP gain/loss event"""
    id: str
    agent_id: str
    event_type: XPEventType
    amount: int
    multiplier: XPMultiplier = XPMultiplier.NONE
    gain_type: XPGainType = XPGainType.BASE
    reason: str = ""
    source: str = ""
    related_task_id: Optional[str] = None
    related_badge_id: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class XPBalance:
    """Agent XP balance"""
    agent_id: str
    total_xp: int = 0
    current_xp: int = 0
    lifetime_xp: int = 0
    streak_days: int = 0
    last_activity_date: Optional[datetime] = None
    status: XPStatus = XPStatus.ACTIVE
    multipliers: dict = field(default_factory=dict)
    bonus_xp: int = 0
    penalty_xp: int = 0
    updated_at: datetime = field(default_factory=datetime.now)


@dataclass
class XPLevel:
    """XP level definition"""
    level: int
    xp_required: int
    title: str
    perks: List[str] = field(default_factory=list)
    color: str = "#FFFFFF"


@dataclass
class XPRule:
    """XP gain rule"""
    id: str
    event_type: XPEventType
    base_xp: int
    multiplier: XPMultiplier = XPMultiplier.NONE
    conditions: dict = field(default_factory=dict)
    description: str = ""
    is_active: bool = True


@dataclass
class XPStreak:
    """XP streak tracking"""
    agent_id: str
    current_streak: int = 0
    longest_streak: int = 0
    streak_bonus_xp: int = 0
    last_streak_date: Optional[datetime] = None
    streak_multiplier: float = 1.0
    streak_history: List[dict] = field(default_factory=list)


@dataclass
class XPMilestone:
    """XP milestone"""
    id: str
    name: str
    target_xp: int
    reward_xp: int = 0
    reward_badge: Optional[str] = None
    description: str = ""
    achieved_by: List[str] = field(default_factory=list)
    achieved_at: Optional[datetime] = None


@dataclass
class XPAuditLog:
    """XP audit log entry"""
    id: str
    agent_id: str
    action: str
    amount: int
    balance_before: int
    balance_after: int
    reason: str = ""
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class XPConfig:
    """XP system configuration"""
    max_xp_per_day: int = 10000
    streak_bonus_per_day: int = 50
    max_streak_bonus: int = 500
    penalty_decay_days: int = 30
    level_decay_enabled: bool = False
    negative_xp_allowed: bool = False
    bonus_xp_expiry_days: int = 7


@dataclass
class XPReport:
    """XP analytics report"""
    agent_id: str
    total_xp_earned: int
    total_xp_spent: int
    current_xp: int
    xp_by_event_type: dict
    xp_by_day: dict
    average_daily_xp: float
    streak_info: dict
    level: int
    next_level_xp: int
    generated_at: datetime = field(default_factory=datetime.now)


class XPManager:
    """Manages agent experience points"""

    def __init__(self, config: Optional[XPConfig] = None):
        self.config = config or XPConfig()
        self._balances: dict[str, XPBalance] = {}
        self._events: dict[str, List[XPEvent]] = {}  # agent_id -> [events]
        self._rules: dict[str, XPRule] = {}
        self._levels: List[XPLevel] = []
        self._milestones: dict[str, XPMilestone] = {}
        self._streaks: dict[str, XPStreak] = {}
        self._audit_logs: List[XPAuditLog] = []
        self._lock = threading.RLock()
        self._initialize_default_levels()
        self._initialize_default_rules()

    def _initialize_default_levels(self):
        """Initialize default XP levels"""
        levels = [
            XPLevel(1, 0, "Novice", ["Basic access"], "#808080"),
            XPLevel(2, 100, "Apprentice", ["Extended access"], "#00FF00"),
            XPLevel(3, 300, "Journeyman", ["Priority queue"], "#0000FF"),
            XPLevel(4, 600, "Expert", ["Advanced features"], "#FF00FF"),
            XPLevel(5, 1000, "Master", ["Full access", "Priority support"], "#FFD700"),
            XPLevel(6, 1500, "Grandmaster", ["Beta features"], "#FFA500"),
            XPLevel(7, 2500, "Legend", ["VIP support", "Custom perks"], "#FF0000"),
            XPLevel(8, 4000, "Mythic", ["Early access"], "#9400D3"),
            XPLevel(9, 6000, "Eternal", ["Lifetime achievement"], "#00CED1"),
            XPLevel(10, 10000, "Transcendent", ["All perks unlocked"], "#FFFFFF"),
        ]
        self._levels = levels

    def _initialize_default_rules(self):
        """Initialize default XP rules"""
        rules = [
            XPRule("rule_001", XPEventType.TASK_COMPLETED, 10, description="Complete a task"),
            XPRule("rule_002", XPEventType.TASK_EXCELLENT, 25, XPMultiplier.BONUS, description="Excellent task completion"),
            XPRule("rule_003", XPEventType.TASK_FAILED, -5, description="Task failed"),
            XPRule("rule_004", XPEventType.CODE_REVIEW, 15, description="Complete code review"),
            XPRule("rule_005", XPEventType.BUG_FIX, 20, description="Fix a bug"),
            XPRule("rule_006", XPEventType.FEATURE_IMPLEMENTED, 50, XPMultiplier.DOUBLE, description="Implement new feature"),
            XPRule("rule_007", XPEventType.DOCUMENTATION, 10, description="Write documentation"),
            XPRule("rule_008", XPEventType.MENTORING, 25, description="Mentor other agents"),
            XPRule("rule_009", XPEventType.COLLABORATION, 15, description="Collaborate on task"),
            XPRule("rule_010", XPEventType.INNOVATION, 100, XPMultiplier.LEGENDARY, description="Innovate solution"),
            XPRule("rule_011", XPEventType.STREAK_BONUS, 50, description="Daily streak bonus"),
            XPRule("rule_012", XPEventType.MILESTONE_REACHED, 100, XPMultiplier.DOUBLE, description="Reach milestone"),
        ]
        for rule in rules:
            self._rules[rule.id] = rule

    # Balance management
    def get_or_create_balance(self, agent_id: str) -> XPBalance:
        """Get or create XP balance for agent"""
        with self._lock:
            if agent_id not in self._balances:
                self._balances[agent_id] = XPBalance(agent_id=agent_id)
                self._events[agent_id] = []
                self._streaks[agent_id] = XPStreak(agent_id=agent_id)
            return self._balances[agent_id]

    def get_balance(self, agent_id: str) -> Optional[XPBalance]:
        """Get XP balance for agent"""
        with self._lock:
            return self._balances.get(agent_id)

    def add_xp(
        self,
        agent_id: str,
        amount: int,
        event_type: XPEventType,
        reason: str = "",
        source: str = "",
        multiplier: XPMultiplier = XPMultiplier.NONE,
        gain_type: XPGainType = XPGainType.BASE,
        related_task_id: Optional[str] = None,
        related_badge_id: Optional[str] = None,
        event_id: Optional[str] = None
    ) -> XPBalance:
        """Add XP to agent"""
        with self._lock:
            balance = self.get_or_create_balance(event_id or f"{agent_id}_{datetime.now().timestamp()}")

            balance_before = balance.total_xp
            final_amount = amount * multiplier.value

            if final_amount > 0:
                balance.bonus_xp += final_amount - amount if gain_type == XPGainType.BONUS else 0
                balance.total_xp += final_amount
                balance.current_xp += final_amount
                balance.lifetime_xp += final_amount
            else:
                balance.penalty_xp += abs(final_amount)
                balance.total_xp += final_amount
                if not self.config.negative_xp_allowed and balance.total_xp < 0:
                    balance.total_xp = 0

            balance.updated_at = datetime.now()
            self._balances[agent_id] = balance

            event = XPEvent(
                id=event_id or f"{agent_id}_{datetime.now().timestamp()}",
                agent_id=agent_id,
                event_type=event_type,
                amount=final_amount,
                multiplier=multiplier,
                gain_type=gain_type,
                reason=reason,
                source=source,
                related_task_id=related_task_id,
                related_badge_id=related_badge_id
            )
            if agent_id not in self._events:
                self._events[agent_id] = []
            self._events[agent_id].append(event)

            audit_log = XPAuditLog(
                id=f"audit_{event.id}",
                agent_id=agent_id,
                action="add_xp",
                amount=final_amount,
                balance_before=balance_before,
                balance_after=balance.total_xp,
                reason=reason
            )
            self._audit_logs.append(audit_log)

            return balance

    def spend_xp(self, agent_id: str, amount: int, reason: str = "") -> Optional[XPBalance]:
        """Spend XP (for purchases, etc.)"""
        with self._lock:
            balance = self._balances.get(agent_id)
            if not balance or balance.current_xp < amount:
                return None

            balance_before = balance.current_xp
            balance.current_xp -= amount
            balance.updated_at = datetime.now()

            audit_log = XPAuditLog(
                id=f"audit_{agent_id}_{datetime.now().timestamp()}",
                agent_id=agent_id,
                action="spend_xp",
                amount=-amount,
                balance_before=balance_before,
                balance_after=balance.current_xp,
                reason=reason
            )
            self._audit_logs.append(audit_log)

            return balance

    # Event management
    def get_events(self, agent_id: str, limit: int = 100) -> List[XPEvent]:
        """Get XP events for agent"""
        with self._lock:
            events = self._events.get(agent_id, [])
            return events[-limit:]

    def get_events_by_type(self, agent_id: str, event_type: XPEventType) -> List[XPEvent]:
        """Get XP events by type"""
        with self._lock:
            return [e for e in self._events.get(agent_id, []) if e.event_type == event_type]

    # Level management
    def get_level(self, agent_id: str) -> int:
        """Get current level for agent"""
        with self._lock:
            balance = self._balances.get(agent_id)
            if not balance:
                return 1
            return self._calculate_level(balance.total_xp)

    def _calculate_level(self, total_xp: int) -> int:
        """Calculate level from XP"""
        level = 1
        for lvl in self._levels:
            if total_xp >= lvl.xp_required:
                level = lvl.level
            else:
                break
        return level

    def get_level_info(self, agent_id: str) -> dict:
        """Get detailed level info"""
        with self._lock:
            balance = self.get_or_create_balance(agent_id)
            current_level = self._calculate_level(balance.total_xp)

            current_level_obj = next((l for l in self._levels if l.level == current_level), None)
            next_level_obj = next((l for l in self._levels if l.level == current_level + 1), None)

            xp_in_current_level = balance.total_xp - (current_level_obj.xp_required if current_level_obj else 0)
            xp_for_next_level = (next_level_obj.xp_required if next_level_obj else 0) - (current_level_obj.xp_required if current_level_obj else 0)

            return {
                "agent_id": agent_id,
                "current_level": current_level,
                "current_title": current_level_obj.title if current_level_obj else "Unknown",
                "current_perks": current_level_obj.perks if current_level_obj else [],
                "next_level": current_level + 1 if next_level_obj else None,
                "next_title": next_level_obj.title if next_level_obj else None,
                "next_perks": next_level_obj.perks if next_level_obj else [],
                "xp_in_current_level": xp_in_current_level,
                "xp_for_next_level": xp_for_next_level,
                "progress_percentage": (xp_in_current_level / xp_for_next_level * 100) if xp_for_next_level > 0 else 100
            }

    # Streak management
    def get_streak(self, agent_id: str) -> XPStreak:
        """Get streak info"""
        with self._lock:
            if agent_id not in self._streaks:
                self._streaks[agent_id] = XPStreak(agent_id=agent_id)
            return self._streaks[agent_id]

    def update_streak(self, agent_id: str) -> XPStreak:
        """Update streak for agent activity"""
        with self._lock:
            streak = self.get_streak(agent_id)
            today = datetime.now().date()

            if streak.last_streak_date:
                last_date = streak.last_streak_date.date()
                days_diff = (today - last_date).days

                if days_diff == 0:
                    return streak
                elif days_diff == 1:
                    streak.current_streak += 1
                    streak.streak_bonus_xp = min(
                        streak.current_streak * self.config.streak_bonus_per_day,
                        self.config.max_streak_bonus
                    )
                    streak.streak_multiplier = 1.0 + (streak.current_streak * 0.1)
                else:
                    streak.current_streak = 1
                    streak.streak_bonus_xp = self.config.streak_bonus_per_day
                    streak.streak_multiplier = 1.0

            streak.last_streak_date = datetime.now()
            if streak.current_streak > streak.longest_streak:
                streak.longest_streak = streak.current_streak

            streak.streak_history.append({
                "date": today.isoformat(),
                "streak": streak.current_streak,
                "bonus": streak.streak_bonus_xp
            })

            self._streaks[agent_id] = streak
            return streak

    # Rules management
    def add_rule(self, rule: XPRule) -> XPRule:
        """Add XP rule"""
        with self._lock:
            self._rules[rule.id] = rule
            return rule

    def get_rule(self, rule_id: str) -> Optional[XPRule]:
        """Get XP rule"""
        with self._lock:
            return self._rules.get(rule_id)

    def get_rule_by_event_type(self, event_type: XPEventType) -> Optional[XPRule]:
        """Get XP rule by event type"""
        with self._lock:
            for rule in self._rules.values():
                if rule.event_type == event_type:
                    return rule
            return None

    def apply_rule(self, agent_id: str, event_type: XPEventType, **kwargs) -> XPBalance:
        """Apply XP rule to agent"""
        rule = self.get_rule_by_event_type(event_type)
        if not rule or not rule.is_active:
            return self.get_or_create_balance(agent_id)

        return self.add_xp(
            agent_id=agent_id,
            amount=rule.base_xp,
            event_type=event_type,
            multiplier=rule.multiplier,
            reason=kwargs.get("reason", rule.description),
            source=kwargs.get("source", ""),
            related_task_id=kwargs.get("related_task_id"),
            related_badge_id=kwargs.get("related_badge_id")
        )

    # Milestones
    def add_milestone(self, milestone: XPMilestone) -> XPMilestone:
        """Add XP milestone"""
        with self._lock:
            self._milestones[milestone.id] = milestone
            return milestone

    def get_milestone(self, milestone_id: str) -> Optional[XPMilestone]:
        """Get milestone"""
        with self._lock:
            return self._milestones.get(milestone_id)

    def check_milestones(self, agent_id: str) -> List[XPMilestone]:
        """Check and award milestone rewards"""
        with self._lock:
            balance = self._balances.get(agent_id)
            if not balance:
                return []

            achieved = []
            for milestone in self._milestones.values():
                if balance.total_xp >= milestone.target_xp and agent_id not in milestone.achieved_by:
                    milestone.achieved_by.append(agent_id)
                    milestone.achieved_at = datetime.now()
                    achieved.append(milestone)

                    if milestone.reward_xp > 0:
                        self.add_xp(
                            agent_id=agent_id,
                            amount=milestone.reward_xp,
                            event_type=XPEventType.MILESTONE_REACHED,
                            reason=f"Milestone: {milestone.name}",
                            gain_type=XPGainType.MILESTONE
                        )

            return achieved

    # Audit
    def get_audit_logs(self, agent_id: Optional[str] = None, limit: int = 100) -> List[XPAuditLog]:
        """Get audit logs"""
        with self._lock:
            logs = self._audit_logs
            if agent_id:
                logs = [l for l in logs if l.agent_id == agent_id]
            return logs[-limit:]

    # Analytics
    def generate_report(self, agent_id: str) -> Optional[XPReport]:
        """Generate XP report"""
        with self._lock:
            balance = self._balances.get(agent_id)
            if not balance:
                return None

            events = self._events.get(agent_id, [])
            xp_by_type = {}
            xp_by_day = {}

            for event in events:
                type_key = event.event_type.value
                xp_by_type[type_key] = xp_by_type.get(type_key, 0) + event.amount

                day_key = event.timestamp.date().isoformat()
                xp_by_day[day_key] = xp_by_day.get(day_key, 0) + event.amount

            days_with_activity = len(xp_by_day)
            average_daily = sum(xp_by_day.values()) / days_with_activity if days_with_activity > 0 else 0.0

            streak = self._streaks.get(agent_id, XPStreak(agent_id=agent_id))

            return XPReport(
                agent_id=agent_id,
                total_xp_earned=balance.lifetime_xp,
                total_xp_spent=balance.lifetime_xp - balance.current_xp,
                current_xp=balance.current_xp,
                xp_by_event_type=xp_by_type,
                xp_by_day=xp_by_day,
                average_daily_xp=average_daily,
                streak_info={
                    "current_streak": streak.current_streak,
                    "longest_streak": streak.longest_streak,
                    "streak_bonus_xp": streak.streak_bonus_xp
                },
                level=self._calculate_level(balance.total_xp),
                next_level_xp=next((l.xp_required for l in self._levels if l.xp_required > balance.total_xp), balance.total_xp)
            )

    def get_leaderboard(self, limit: int = 10) -> List[dict]:
        """Get XP leaderboard"""
        with self._lock:
            sorted_agents = sorted(
                self._balances.values(),
                key=lambda b: b.total_xp,
                reverse=True
            )[:limit]

            return [
                {
                    "rank": i + 1,
                    "agent_id": b.agent_id,
                    "total_xp": b.total_xp,
                    "level": self._calculate_level(b.total_xp)
                }
                for i, b in enumerate(sorted_agents)
            ]


# Global instance
agent_xp = XPManager()
