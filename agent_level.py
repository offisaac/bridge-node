"""Agent Level Module

Agent leveling system including tier management, experience tracking,
level-up logic, perks/benefits, and progression analytics.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class LevelTier(str, Enum):
    """Level tier ranks."""
    NOVICE = "novice"
    JUNIOR = "junior"
    INTERMEDIATE = "intermediate"
    SENIOR = "senior"
    EXPERT = "expert"
    MASTER = "master"
    LEGEND = "legend"
    MYTHIC = "mythic"


class LevelStatus(str, Enum):
    """Agent level status."""
    ACTIVE = "active"
    FROZEN = "frozen"
    MAXED = "maxed"
    PROBATION = "probation"


class PointSource(str, Enum):
    """Experience point sources."""
    TASK_COMPLETION = "task_completion"
    QUALITY_BONUS = "quality_bonus"
    SPEED_BONUS = "speed_bonus"
    COLLABORATION = "collaboration"
    MENTORING = "mentoring"
    INNOVATION = "innovation"
    STREAK = "streak"
    MILESTONE = "milestone"
    PENALTY = "penalty"
    MANUAL_ADJUSTMENT = "manual_adjustment"


@dataclass
class LevelConfig:
    """Level system configuration."""
    base_xp: int = 100
    multiplier: float = 1.5
    max_level: int = 100
    min_level: int = 1
    streak_bonus_multiplier: float = 0.1
    collaboration_bonus: int = 50
    mentoring_bonus: int = 75
    enable_decay: bool = False
    decay_rate: float = 0.01
    decay_interval: int = 86400
    enable_auto_levelup: bool = True
    grace_period_seconds: int = 300


@dataclass
class LevelThreshold:
    """Level threshold definition."""
    level: int
    tier: LevelTier
    xp_required: int
    perks: List[str] = field(default_factory=list)
    benefits: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AgentLevel:
    """Agent level record."""
    agent_id: str
    level: int
    current_xp: int
    total_xp: int
    tier: LevelTier
    status: LevelStatus
    streak_days: int
    last_activity: float
    created_at: float
    updated_at: float
    level_up_at: float = 0.0
    frozen_at: float = 0.0


@dataclass
class XPTransaction:
    """Experience point transaction."""
    id: str
    agent_id: str
    amount: int
    source: PointSource
    timestamp: float
    reason: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class LevelEvent:
    """Level change event."""
    id: str
    agent_id: str
    event_type: str  # level_up, tier_change, streak, penalty
    timestamp: float
    old_level: int = 0
    new_level: int = 0
    old_tier: str = ""
    new_tier: str = ""
    details: str = ""


@dataclass
class PerkDefinition:
    """Perk definition."""
    id: str
    name: str
    description: str
    tier_required: LevelTier
    level_required: int
    is_passive: bool = True
    cooldown_seconds: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


class LevelManager:
    """Level management engine."""

    def __init__(self, config: LevelConfig = None):
        self._lock = threading.RLock()
        self._config = config or LevelConfig()
        self._levels: Dict[str, AgentLevel] = {}
        self._transactions: List[XPTransaction] = []
        self._events: List[LevelEvent] = []
        self._perks: Dict[str, PerkDefinition] = {}
        self._agent_perks: Dict[str, List[str]] = defaultdict(list)
        self._thresholds: Dict[int, LevelThreshold] = {}
        self._default_thresholds()

    def _default_thresholds(self):
        """Create default level thresholds."""
        tier_order = [
            (1, LevelTier.NOVICE, 0, ["Basic Access"]),
            (5, LevelTier.JUNIOR, 500, ["Priority Queue"]),
            (10, LevelTier.INTERMEDIATE, 2000, ["Extended Timeout"]),
            (20, LevelTier.SENIOR, 8000, ["Priority Support"]),
            (35, LevelTier.EXPERT, 25000, ["Custom Workflows"]),
            (50, LevelTier.MASTER, 75000, ["API Access", "Webhook Integration"]),
            (75, LevelTier.LEGEND, 200000, ["Dedicated Resources", "SLA Priority"]),
            (100, LevelTier.MYTHIC, 500000, ["Custom Integrations", "White-glove Support"]),
        ]
        for level, tier, xp, perks in tier_order:
            self._thresholds[level] = LevelThreshold(
                level=level,
                tier=tier,
                xp_required=xp,
                perks=perks,
                benefits={}
            )

    def _calculate_xp_for_level(self, level: int) -> int:
        """Calculate XP required for a specific level."""
        if level <= 1:
            return 0
        total = 0
        for l in range(1, level):
            total += int(self._config.base_xp * (self._config.multiplier ** (l - 1)))
        return total

    def _get_tier_for_level(self, level: int) -> LevelTier:
        """Get tier for a given level."""
        if level >= 100:
            return LevelTier.MYTHIC
        elif level >= 75:
            return LevelTier.LEGEND
        elif level >= 50:
            return LevelTier.MASTER
        elif level >= 35:
            return LevelTier.EXPERT
        elif level >= 20:
            return LevelTier.SENIOR
        elif level >= 10:
            return LevelTier.INTERMEDIATE
        elif level >= 5:
            return LevelTier.JUNIOR
        else:
            return LevelTier.NOVICE

    def initialize_agent(self, agent_id: str) -> AgentLevel:
        """Initialize agent at level 1."""
        with self._lock:
            if agent_id in self._levels:
                return self._levels[agent_id]

            current_time = time.time()
            level = AgentLevel(
                agent_id=agent_id,
                level=1,
                current_xp=0,
                total_xp=0,
                tier=LevelTier.NOVICE,
                status=LevelStatus.ACTIVE,
                streak_days=0,
                last_activity=current_time,
                created_at=current_time,
                updated_at=current_time
            )
            self._levels[agent_id] = level
            return level

    def add_xp(
        self,
        agent_id: str,
        amount: int,
        source: PointSource,
        reason: str = ""
    ) -> Optional[AgentLevel]:
        """Add XP to agent."""
        with self._lock:
            level = self._levels.get(agent_id)
            if not level:
                level = self.initialize_agent(agent_id)

            if level.status == LevelStatus.FROZEN:
                return None

            if level.status == LevelStatus.MAXED:
                return level

            # Apply streak bonus
            actual_amount = amount
            if source != PointSource.PENALTY and level.streak_days > 0:
                streak_bonus = int(amount * self._config.streak_bonus_multiplier * level.streak_days)
                actual_amount += streak_bonus

            current_time = time.time()
            level.current_xp += actual_amount
            level.total_xp += actual_amount
            level.last_activity = current_time
            level.updated_at = current_time

            # Create transaction
            transaction = XPTransaction(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                amount=actual_amount,
                source=source,
                timestamp=current_time,
                reason=reason
            )
            self._transactions.append(transaction)

            # Check for level up
            if self._config.enable_auto_levelup:
                return self._check_level_up(agent_id)

            return level

    def _check_level_up(self, agent_id: str) -> AgentLevel:
        """Check and process level up."""
        level = self._levels[agent_id]
        leveled_up = False

        while level.level < self._config.max_level:
            xp_for_next = self._calculate_xp_for_level(level.level + 1)
            if level.current_xp >= xp_for_next:
                old_level = level.level
                old_tier = level.tier.value

                level.level += 1
                level.tier = self._get_tier_for_level(level.level)
                level.updated_at = time.time()
                level.level_up_at = time.time()

                # Add new perks
                threshold = self._thresholds.get(level.level)
                if threshold:
                    for perk in threshold.perks:
                        if perk not in self._agent_perks[agent_id]:
                            self._agent_perks[agent_id].append(perk)

                # Create level up event
                event = LevelEvent(
                    id=str(uuid.uuid4())[:12],
                    agent_id=agent_id,
                    event_type="level_up",
                    timestamp=time.time(),
                    old_level=old_level,
                    new_level=level.level,
                    old_tier=old_tier,
                    new_tier=level.tier.value,
                    details=f"Leveled up from {old_level} to {level.level}"
                )
                self._events.append(event)
                leveled_up = True
            else:
                break

        if level.level >= self._config.max_level:
            level.status = LevelStatus.MAXED

        return level

    def remove_xp(
        self,
        agent_id: str,
        amount: int,
        reason: str = ""
    ) -> Optional[AgentLevel]:
        """Remove XP from agent (penalty)."""
        return self.add_xp(
            agent_id,
            -abs(amount),
            PointSource.PENALTY,
            reason
        )

    def set_level(
        self,
        agent_id: str,
        level: int,
        reason: str = ""
    ) -> Optional[AgentLevel]:
        """Set agent level directly."""
        with self._lock:
            level_obj = self._levels.get(agent_id)
            if not level_obj:
                level_obj = self.initialize_agent(agent_id)

            old_level = level_obj.level
            old_tier = level_obj.tier.value

            level_obj.level = max(self._config.min_level, min(level, self._config.max_level))
            level_obj.tier = self._get_tier_for_level(level_obj.level)
            level_obj.current_xp = self._calculate_xp_for_level(level_obj.level)
            level_obj.updated_at = time.time()

            if level_obj.level >= self._config.max_level:
                level_obj.status = LevelStatus.MAXED

            # Create event
            event = LevelEvent(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                event_type="level_set",
                timestamp=time.time(),
                old_level=old_level,
                new_level=level_obj.level,
                old_tier=old_tier,
                new_tier=level_obj.tier.value,
                details=reason or f"Level set to {level_obj.level}"
            )
            self._events.append(event)

            return level_obj

    def freeze_level(self, agent_id: str) -> Optional[AgentLevel]:
        """Freeze agent level."""
        with self._lock:
            level = self._levels.get(agent_id)
            if not level:
                return None

            level.status = LevelStatus.FROZEN
            level.frozen_at = time.time()
            level.updated_at = time.time()

            event = LevelEvent(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                event_type="frozen",
                timestamp=time.time(),
                old_level=level.level,
                new_level=level.level,
                details="Level frozen"
            )
            self._events.append(event)
            return level

    def unfreeze_level(self, agent_id: str) -> Optional[AgentLevel]:
        """Unfreeze agent level."""
        with self._lock:
            level = self._levels.get(agent_id)
            if not level:
                return None

            level.status = LevelStatus.ACTIVE
            level.updated_at = time.time()

            event = LevelEvent(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                event_type="unfrozen",
                timestamp=time.time(),
                old_level=level.level,
                new_level=level.level,
                details="Level unfrozen"
            )
            self._events.append(event)
            return level

    def update_streak(self, agent_id: str) -> bool:
        """Update agent streak days."""
        with self._lock:
            level = self._levels.get(agent_id)
            if not level:
                level = self.initialize_agent(agent_id)

            current_time = time.time()
            time_since_last = current_time - level.last_activity

            # Check if streak continues (within 48 hours)
            if time_since_last < 172800:  # 48 hours
                if current_time - level.last_activity > 86400:  # New day
                    level.streak_days += 1
                    level.last_activity = current_time

                    # Streak milestone bonus
                    if level.streak_days % 7 == 0:
                        self.add_xp(
                            agent_id,
                            level.streak_days * 10,
                            PointSource.STREAK,
                            f"{level.streak_days} day streak"
                        )

                    event = LevelEvent(
                        id=str(uuid.uuid4())[:12],
                        agent_id=agent_id,
                        event_type="streak",
                        timestamp=current_time,
                        old_level=level.level,
                        new_level=level.level,
                        details=f"Streak: {level.streak_days} days"
                    )
                    self._events.append(event)
                    return True
            else:
                level.streak_days = 0

            level.last_activity = current_time
            return False

    def get_level(self, agent_id: str) -> Optional[AgentLevel]:
        """Get agent level."""
        with self._lock:
            return self._levels.get(agent_id)

    def get_all_levels(self) -> List[AgentLevel]:
        """Get all agent levels."""
        with self._lock:
            return list(self._levels.values())

    def get_leaderboard(self, limit: int = 10) -> List[AgentLevel]:
        """Get top agents by level."""
        with self._lock:
            sorted_levels = sorted(
                self._levels.values(),
                key=lambda x: (x.level, x.current_xp),
                reverse=True
            )
            return sorted_levels[:limit]

    def get_transactions(
        self,
        agent_id: str = None,
        limit: int = 100
    ) -> List[XPTransaction]:
        """Get XP transactions."""
        with self._lock:
            transactions = self._transactions
            if agent_id:
                transactions = [t for t in transactions if t.agent_id == agent_id]
            return transactions[-limit:]

    def get_events(
        self,
        agent_id: str = None,
        event_type: str = None,
        limit: int = 100
    ) -> List[LevelEvent]:
        """Get level events."""
        with self._lock:
            events = self._events
            if agent_id:
                events = [e for e in events if e.agent_id == agent_id]
            if event_type:
                events = [e for e in events if e.event_type == event_type]
            return events[-limit:]

    def get_perks(self, agent_id: str) -> List[str]:
        """Get agent perks."""
        with self._lock:
            return self._agent_perks.get(agent_id, [])

    def get_level_progress(self, agent_id: str) -> Optional[Dict[str, Any]]:
        """Get agent level progress."""
        with self._lock:
            level = self._levels.get(agent_id)
            if not level:
                return None

            xp_for_next = self._calculate_xp_for_level(level.level + 1)
            xp_for_current = self._calculate_xp_for_level(level.level)
            current_level_xp = level.current_xp - xp_for_current
            needed_xp = xp_for_next - xp_for_current

            return {
                "agent_id": agent_id,
                "level": level.level,
                "tier": level.tier.value,
                "status": level.status.value,
                "current_xp": level.current_xp,
                "total_xp": level.total_xp,
                "xp_for_next_level": xp_for_next,
                "progress_percent": (current_level_xp / needed_xp * 100) if needed_xp > 0 else 100,
                "xp_needed": needed_xp - current_level_xp,
                "streak_days": level.streak_days,
                "perks": self._agent_perks.get(agent_id, [])
            }

    def get_stats(self) -> Dict[str, Any]:
        """Get level system statistics."""
        with self._lock:
            if not self._levels:
                return {
                    "total_agents": 0,
                    "average_level": 0,
                    "max_level": 0,
                    "tier_distribution": {}
                }

            tiers = {}
            for level in self._levels.values():
                tier = level.tier.value
                tiers[tier] = tiers.get(tier, 0) + 1

            return {
                "total_agents": len(self._levels),
                "average_level": sum(l.level for l in self._levels.values()) / len(self._levels),
                "max_level": max(l.level for l in self._levels.values()),
                "total_xp": sum(l.total_xp for l in self._levels.values()),
                "tier_distribution": tiers,
                "active_count": sum(1 for l in self._levels.values() if l.status == LevelStatus.ACTIVE),
                "frozen_count": sum(1 for l in self._levels.values() if l.status == LevelStatus.FROZEN)
            }

    def add_perk(self, perk: PerkDefinition):
        """Add perk definition."""
        with self._lock:
            self._perks[perk.id] = perk

    def assign_perk(self, agent_id: str, perk_id: str) -> bool:
        """Assign perk to agent."""
        with self._lock:
            perk = self._perks.get(perk_id)
            if not perk:
                return False

            level = self._levels.get(agent_id)
            if not level:
                return False

            if level.level < perk.level_required:
                return False

            if level.tier.value not in [tier.value for tier in LevelTier] and level.tier != perk.tier_required:
                return False

            if perk_id not in self._agent_perks[agent_id]:
                self._agent_perks[agent_id].append(perk_id)
                return True
            return False


class AgentLevel:
    """Main Agent Level coordinating all level operations."""

    def __init__(self, config: LevelConfig = None):
        self.manager = LevelManager(config)
        self._lock = threading.RLock()

    def get_status(self) -> Dict[str, Any]:
        with self._lock:
            return {
                "level_active": True,
                "stats": self.manager.get_stats()
            }


# Global instance
agent_level = AgentLevel()
