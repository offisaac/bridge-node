"""
Agent Reward Module

Provides reward management, point systems, badges, achievements, and recognition for agents.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional
from threading import RLock
import uuid


class RewardType(Enum):
    """Reward types."""
    POINTS = "points"
    BADGE = "badge"
    ACHIEVEMENT = "achievement"
    RECOGNITION = "recognition"
    GIFT = "gift"
    BONUS = "bonus"
    PERK = "perk"
    TITLE = "title"
    VIRTUAL_CURRENCY = "virtual_currency"


class RewardStatus(Enum):
    """Reward status."""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    REVOKED = "revoked"
    EXPIRED = "expired"
    REDEEMED = "redeemed"


class RewardCategory(Enum):
    """Reward categories."""
    PERFORMANCE = "performance"
    MILESTONE = "milestone"
    COLLABORATION = "collaboration"
    INNOVATION = "innovation"
    LEADERSHIP = "leadership"
    CUSTOMER_SERVICE = "customer_service"
    LEARNING = "learning"
    COMMUNITY = "community"
    SPECIAL = "special"


class BadgeLevel(Enum):
    """Badge levels."""
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "platinum"
    PLATINUM = "platinum"
    DIAMOND = "diamond"


class PointSource(Enum):
    """Point sources."""
    TASK_COMPLETION = "task_completion"
    QUALITY_WORK = "quality_work"
    PEER_REVIEW = "peer_review"
    MENTORING = "mentoring"
    INNOVATION = "innovation"
    LEADERSHIP = "leadership"
    CUSTOMER_SATISFACTION = "customer_satisfaction"
    LEARNING = "learning"
    STREAK = "streak"
    BONUS = "bonus"
    PENALTY = "penalty"


class RedemptionStatus(Enum):
    """Redemption status."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class Badge:
    """Badge definition."""
    id: str = field(default_factory=lambda: f"BADGE-{uuid.uuid4().hex[:8].upper()}")
    name: str = ""
    description: str = ""
    icon: str = ""
    category: RewardCategory = RewardCategory.PERFORMANCE
    level: BadgeLevel = BadgeLevel.BRONZE
    points_required: int = 0
    criteria: str = ""
    tags: list = field(default_factory=list)
    rarity: str = "common"
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class Achievement:
    """Achievement definition."""
    id: str = field(default_factory=lambda: f"ACH-{uuid.uuid4().hex[:8].upper()}")
    name: str = ""
    description: str = ""
    category: RewardCategory = RewardCategory.PERFORMANCE
    points: int = 0
    badge_id: str = ""
    criteria: dict = field(default_factory=dict)
    milestones: list = field(default_factory=list)
    secret: bool = False
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class Reward:
    """Reward definition."""
    id: str = field(default_factory=lambda: f"REW-{uuid.uuid4().hex[:8].upper()}")
    name: str = ""
    description: str = ""
    reward_type: RewardType = RewardType.POINTS
    category: RewardCategory = RewardCategory.PERFORMANCE
    value: int = 0
    points_cost: int = 0
    status: RewardStatus = RewardStatus.PENDING
    recipient_id: str = ""
    granted_by: str = ""
    granted_at: Optional[str] = None
    expires_at: Optional[str] = None
    metadata: dict = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class PointTransaction:
    """Point transaction."""
    id: str = field(default_factory=lambda: f"PT-{uuid.uuid4().hex[:8].upper()}")
    agent_id: str = ""
    amount: int = 0
    source: PointSource = PointSource.TASK_COMPLETION
    description: str = ""
    reference_id: str = ""
    reference_type: str = ""
    balance_after: int = 0
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class PointPolicy:
    """Point policy."""
    id: str = field(default_factory=lambda: f"PP-{uuid.uuid4().hex[:8].upper()}")
    name: str = ""
    source: PointSource = PointSource.TASK_COMPLETION
    points: int = 0
    description: str = ""
    conditions: dict = field(default_factory=dict)
    active: bool = True
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class Redemption:
    """Redemption record."""
    id: str = field(default_factory=lambda: f"RED-{uuid.uuid4().hex[:8].upper()}")
    agent_id: str = ""
    reward_id: str = ""
    points_spent: int = 0
    status: RedemptionStatus = RedemptionStatus.PENDING
    redeemed_at: str = field(default_factory=lambda: datetime.now().isoformat())
    processed_at: Optional[str] = None
    notes: str = ""


@dataclass
class Leaderboard:
    """Leaderboard entry."""
    id: str = field(default_factory=lambda: f"LB-{uuid.uuid4().hex[:8].upper()}")
    name: str = ""
    description: str = ""
    period: str = "all_time"
    metric: str = "points"
    entries: list = field(default_factory=list)
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class RewardMetrics:
    """Reward metrics."""
    agent_id: str = ""
    total_points_earned: int = 0
    total_points_spent: int = 0
    current_balance: int = 0
    badges_earned: int = 0
    achievements_unlocked: int = 0
    rewards_received: int = 0
    redemption_count: int = 0
    streak_days: int = 0
    last_earned: Optional[str] = None


@dataclass
class RewardConfig:
    """Reward configuration."""
    initial_points: int = 100
    max_points_per_day: int = 1000
    points_expiry_days: int = 365
    allow_negative_balance: bool = False
    auto_approve_rewards: bool = False
    enable_streaks: bool = True
    streak_bonus_multiplier: float = 1.5
    enable_leaderboards: bool = True
    leaderboard_update_interval_hours: int = 24


@dataclass
class RewardReport:
    """Reward report."""
    agent_id: str = ""
    period_start: str = ""
    period_end: str = ""
    points_earned: int = 0
    points_spent: int = 0
    badges_earned: list = field(default_factory=list)
    achievements_unlocked: list = field(default_factory=list)
    rewards_received: int = 0
    rank_change: int = 0
    recommendations: list = field(default_factory=list)


class RewardManager:
    """Manages agent rewards."""

    def __init__(self):
        self._rewards: dict[str, Reward] = {}
        self._badges: dict[str, Badge] = {}
        self._achievements: dict[str, Achievement] = {}
        self._transactions: dict[str, List[PointTransaction]] = {}
        self._policies: dict[str, PointPolicy] = {}
        self._redemptions: dict[str, List[Redemption]] = {}
        self._agent_balances: dict[str, int] = {}
        self._agent_badges: dict[str, List[str]] = {}
        self._agent_achievements: dict[str, List[str]] = {}
        self._leaderboards: dict[str, Leaderboard] = {}
        self._lock = RLock()
        self._config = RewardConfig()
        self._initialize_defaults()

    def _initialize_defaults(self):
        """Initialize default badges, achievements, and policies."""
        # Default badges
        default_badges = [
            Badge(name="First Step", description="Complete first task", level=BadgeLevel.BRONZE, points_required=1, rarity="common"),
            Badge(name="Rising Star", description="Complete 10 tasks", level=BadgeLevel.SILVER, points_required=100, rarity="uncommon"),
            Badge(name="Top Performer", description="Complete 50 tasks", level=BadgeLevel.GOLD, points_required=500, rarity="rare"),
            Badge(name="Legend", description="Complete 100 tasks", level=BadgeLevel.DIAMOND, points_required=1000, rarity="legendary"),
            Badge(name="Team Player", description="Collaborate with team members", category=RewardCategory.COLLABORATION, rarity="common"),
            Badge(name="Innovator", description="Submit innovative ideas", category=RewardCategory.INNOVATION, rarity="rare"),
        ]
        for badge in default_badges:
            self._badges[badge.id] = badge

        # Default achievements
        default_achievements = [
            Achievement(name="Quick Learner", description="Complete 5 learning modules", points=50, category=RewardCategory.LEARNING),
            Achievement(name="Perfect Week", description="Complete all tasks in a week", points=100, category=RewardCategory.PERFORMANCE),
            Achievement(name="Mentor", description="Help 3 other agents", points=150, category=RewardCategory.LEADERSHIP),
        ]
        for ach in default_achievements:
            self._achievements[ach.id] = ach

        # Default point policies
        default_policies = [
            PointPolicy(name="Task Completion", source=PointSource.TASK_COMPLETION, points=10),
            PointPolicy(name="Quality Work", source=PointSource.QUALITY_WORK, points=20),
            PointPolicy(name="Innovation", source=PointSource.INNOVATION, points=50),
            PointPolicy(name="Streak Bonus", source=PointSource.STREAK, points=15, conditions={"min_streak_days": 3}),
        ]
        for policy in default_policies:
            self._policies[policy.id] = policy

    # Badge management
    def create_badge(self, name: str, description: str = "", **kwargs) -> Badge:
        """Create a badge."""
        badge = Badge(name=name, description=description, **kwargs)
        self._badges[badge.id] = badge
        return badge

    def get_badge(self, badge_id: str) -> Optional[Badge]:
        """Get a badge."""
        return self._badges.get(badge_id)

    def get_all_badges(self) -> List[Badge]:
        """Get all badges."""
        return list(self._badges.values())

    def award_badge(self, agent_id: str, badge_id: str) -> Optional[Badge]:
        """Award a badge to an agent."""
        badge = self._badges.get(badge_id)
        if not badge:
            return None

        if agent_id not in self._agent_badges:
            self._agent_badges[agent_id] = []

        if badge_id not in self._agent_badges[agent_id]:
            self._agent_badges[agent_id].append(badge_id)
            # Add points for earning badge
            self.add_points(agent_id, badge.points_required, PointSource.BONUS, f"Badge: {badge.name}")

        return badge

    def get_agent_badges(self, agent_id: str) -> List[Badge]:
        """Get badges for an agent."""
        badge_ids = self._agent_badges.get(agent_id, [])
        return [self._badges.get(bid) for bid in badge_ids if bid in self._badges]

    # Achievement management
    def create_achievement(self, name: str, description: str = "", **kwargs) -> Achievement:
        """Create an achievement."""
        achievement = Achievement(name=name, description=description, **kwargs)
        self._achievements[achievement.id] = achievement
        return achievement

    def get_achievement(self, achievement_id: str) -> Optional[Achievement]:
        """Get an achievement."""
        return self._achievements.get(achievement_id)

    def get_all_achievements(self) -> List[Achievement]:
        """Get all achievements."""
        return list(self._achievements.values())

    def unlock_achievement(self, agent_id: str, achievement_id: str) -> Optional[Achievement]:
        """Unlock an achievement for an agent."""
        achievement = self._achievements.get(achievement_id)
        if not achievement:
            return None

        if agent_id not in self._agent_achievements:
            self._agent_achievements[agent_id] = []

        if achievement_id not in self._agent_achievements[agent_id]:
            self._agent_achievements[agent_id].append(achievement_id)
            # Add points for achievement
            self.add_points(agent_id, achievement.points, PointSource.BONUS, f"Achievement: {achievement.name}")

        return achievement

    def get_agent_achievements(self, agent_id: str) -> List[Achievement]:
        """Get achievements for an agent."""
        achievement_ids = self._agent_achievements.get(agent_id, [])
        return [self._achievements.get(aid) for aid in achievement_ids if aid in self._achievements]

    # Points management
    def add_points(self, agent_id: str, amount: int, source: PointSource, description: str = "",
                  reference_id: str = "", reference_type: str = "") -> PointTransaction:
        """Add points to an agent."""
        with self._lock:
            if agent_id not in self._agent_balances:
                self._agent_balances[agent_id] = self._config.initial_points

            # Check max points per day
            today = datetime.now().date()
            daily_total = 0
            if agent_id in self._transactions:
                for tx in self._transactions[agent_id]:
                    if tx.source == source:
                        tx_date = datetime.fromisoformat(tx.timestamp).date()
                        if tx_date == today:
                            daily_total += tx.amount

            if daily_total + amount > self._config.max_points_per_day:
                amount = max(0, self._config.max_points_per_day - daily_total)

            self._agent_balances[agent_id] += amount

            transaction = PointTransaction(
                agent_id=agent_id,
                amount=amount,
                source=source,
                description=description,
                reference_id=reference_id,
                reference_type=reference_type,
                balance_after=self._agent_balances[agent_id]
            )

            if agent_id not in self._transactions:
                self._transactions[agent_id] = []
            self._transactions[agent_id].append(transaction)

            return transaction

    def deduct_points(self, agent_id: str, amount: int, description: str = "") -> Optional[PointTransaction]:
        """Deduct points from an agent."""
        current = self._agent_balances.get(agent_id, 0)

        if not self._config.allow_negative_balance and current < amount:
            return None

        self._agent_balances[agent_id] = current - amount

        transaction = PointTransaction(
            agent_id=agent_id,
            amount=-amount,
            source=PointSource.PENALTY,
            description=description,
            balance_after=self._agent_balances[agent_id]
        )

        if agent_id not in self._transactions:
            self._transactions[agent_id] = []
        self._transactions[agent_id].append(transaction)

        return transaction

    def get_balance(self, agent_id: str) -> int:
        """Get agent point balance."""
        return self._agent_balances.get(agent_id, self._config.initial_points)

    def get_transaction_history(self, agent_id: str, limit: int = 100) -> List[PointTransaction]:
        """Get transaction history."""
        transactions = self._transactions.get(agent_id, [])
        return sorted(transactions, key=lambda x: x.timestamp, reverse=True)[:limit]

    # Reward management
    def create_reward(self, name: str, reward_type: RewardType = RewardType.POINTS,
                     value: int = 0, **kwargs) -> Reward:
        """Create a reward."""
        reward = Reward(
            name=name,
            reward_type=reward_type,
            value=value,
            **kwargs
        )
        self._rewards[reward.id] = reward
        return reward

    def get_reward(self, reward_id: str) -> Optional[Reward]:
        """Get a reward."""
        return self._rewards.get(reward_id)

    def get_all_rewards(self) -> List[Reward]:
        """Get all rewards."""
        return list(self._rewards.values())

    def grant_reward(self, agent_id: str, reward_id: str, granted_by: str = "") -> Optional[Reward]:
        """Grant a reward to an agent."""
        reward = self._rewards.get(reward_id)
        if not reward:
            return None

        reward.recipient_id = agent_id
        reward.granted_by = granted_by
        reward.granted_at = datetime.now().isoformat()
        reward.status = RewardStatus.APPROVED

        return reward

    def get_agent_rewards(self, agent_id: str, status: RewardStatus = None) -> List[Reward]:
        """Get rewards for an agent."""
        rewards = [r for r in self._rewards.values() if r.recipient_id == agent_id]
        if status:
            rewards = [r for r in rewards if r.status == status]
        return rewards

    # Redemption management
    def redeem_reward(self, agent_id: str, reward_id: str) -> Optional[Redemption]:
        """Redeem a reward."""
        reward = self._rewards.get(reward_id)
        if not reward:
            return None

        if reward.points_cost > 0:
            balance = self.get_balance(agent_id)
            if balance < reward.points_cost:
                return None

            # Deduct points
            self.deduct_points(agent_id, reward.points_cost, f"Redeemed: {reward.name}")

        redemption = Redemption(
            agent_id=agent_id,
            reward_id=reward_id,
            points_spent=reward.points_cost
        )

        if agent_id not in self._redemptions:
            self._redemptions[agent_id] = []
        self._redemptions[agent_id].append(redemption)

        # Update reward status
        reward.status = RewardStatus.REDEEMED

        return redemption

    def get_redemption_history(self, agent_id: str) -> List[Redemption]:
        """Get redemption history."""
        return self._redemptions.get(agent_id, [])

    # Point policies
    def create_policy(self, name: str, source: PointSource, points: int, **kwargs) -> PointPolicy:
        """Create a point policy."""
        policy = PointPolicy(name=name, source=source, points=points, **kwargs)
        self._policies[policy.id] = policy
        return policy

    def get_policy(self, policy_id: str) -> Optional[PointPolicy]:
        """Get a policy."""
        return self._policies.get(policy_id)

    def get_policies(self) -> List[PointPolicy]:
        """Get all policies."""
        return list(self._policies.values())

    # Leaderboard
    def get_leaderboard(self, period: str = "all_time") -> Leaderboard:
        """Get leaderboard."""
        with self._lock:
            # Sort agents by balance
            sorted_agents = sorted(
                self._agent_balances.items(),
                key=lambda x: x[1],
                reverse=True
            )

            entries = []
            for rank, (agent_id, balance) in enumerate(sorted_agents, 1):
                entries.append({
                    "rank": rank,
                    "agent_id": agent_id,
                    "points": balance,
                    "badges": len(self._agent_badges.get(agent_id, [])),
                    "achievements": len(self._agent_achievements.get(agent_id, []))
                })

            leaderboard = Leaderboard(
                name="Points Leaderboard",
                period=period,
                metric="points",
                entries=entries
            )

            return leaderboard

    # Metrics
    def get_metrics(self, agent_id: str) -> RewardMetrics:
        """Get reward metrics for an agent."""
        balance = self.get_balance(agent_id)
        transactions = self._transactions.get(agent_id, [])

        total_earned = sum(tx.amount for tx in transactions if tx.amount > 0)
        total_spent = sum(abs(tx.amount) for tx in transactions if tx.amount < 0)

        badges = self._agent_badges.get(agent_id, [])
        achievements = self._agent_achievements.get(agent_id, [])
        rewards = self.get_agent_rewards(agent_id, RewardStatus.APPROVED)
        redemptions = self._redemptions.get(agent_id, [])

        # Calculate streak (simplified)
        streak = 0
        last_earned = None
        if transactions:
            sorted_tx = sorted(transactions, key=lambda x: x.timestamp, reverse=True)
            if sorted_tx and sorted_tx[0].amount > 0:
                last_earned = sorted_tx[0].timestamp

        return RewardMetrics(
            agent_id=agent_id,
            total_points_earned=total_earned,
            total_points_spent=total_spent,
            current_balance=balance,
            badges_earned=len(badges),
            achievements_unlocked=len(achievements),
            rewards_received=len(rewards),
            redemption_count=len(redemptions),
            streak_days=streak,
            last_earned=last_earned
        )

    def generate_report(self, agent_id: str, period_start: str = None, period_end: str = None) -> RewardReport:
        """Generate a reward report."""
        metrics = self.get_metrics(agent_id)
        badges = self.get_agent_badges(agent_id)
        achievements = self.get_agent_achievements(agent_id)

        # Get leaderboard rank
        leaderboard = self.get_leaderboard()
        rank = 0
        for entry in leaderboard.entries:
            if entry["agent_id"] == agent_id:
                rank = entry["rank"]
                break

        # Calculate rank change (simplified)
        rank_change = 0

        recommendations = []
        if metrics.streak_days > 0:
            recommendations.append("Keep the streak going for bonus points!")
        if metrics.current_balance > 500:
            recommendations.append("Consider redeeming points for rewards")
        if len(badges) < 3:
            recommendations.append("Complete more tasks to earn badges")

        return RewardReport(
            agent_id=agent_id,
            period_start=period_start or "",
            period_end=period_end or "",
            points_earned=metrics.total_points_earned,
            points_spent=metrics.total_points_spent,
            badges_earned=[b.name for b in badges],
            achievements_unlocked=[a.name for a in achievements],
            rewards_received=metrics.rewards_received,
            rank_change=rank_change,
            recommendations=recommendations
        )

    def get_config(self) -> dict:
        """Get configuration."""
        return {
            "initial_points": self._config.initial_points,
            "max_points_per_day": self._config.max_points_per_day,
            "points_expiry_days": self._config.points_expiry_days,
            "allow_negative_balance": self._config.allow_negative_balance,
            "auto_approve_rewards": self._config.auto_approve_rewards,
            "enable_streaks": self._config.enable_streaks,
            "streak_bonus_multiplier": self._config.streak_bonus_multiplier,
            "enable_leaderboards": self._config.enable_leaderboards,
            "leaderboard_update_interval_hours": self._config.leaderboard_update_interval_hours
        }

    def update_config(self, **kwargs):
        """Update configuration."""
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self._config, key):
                    if key == "source" and isinstance(value, str):
                        value = PointSource(value)
                    setattr(self._config, key, value)


class AgentReward:
    """Public API for agent reward."""

    def __init__(self):
        self.manager = RewardManager()

    # Badges
    def create_badge(self, name: str, **kwargs) -> Badge:
        """Create a badge."""
        return self.manager.create_badge(name, **kwargs)

    def get_badge(self, badge_id: str) -> Optional[Badge]:
        """Get a badge."""
        return self.manager.get_badge(badge_id)

    def list_badges(self) -> List[Badge]:
        """List all badges."""
        return self.manager.get_all_badges()

    def award_badge(self, agent_id: str, badge_id: str) -> Optional[Badge]:
        """Award a badge."""
        return self.manager.award_badge(agent_id, badge_id)

    def get_agent_badges(self, agent_id: str) -> List[Badge]:
        """Get agent badges."""
        return self.manager.get_agent_badges(agent_id)

    # Achievements
    def create_achievement(self, name: str, **kwargs) -> Achievement:
        """Create an achievement."""
        return self.manager.create_achievement(name, **kwargs)

    def get_achievement(self, achievement_id: str) -> Optional[Achievement]:
        """Get an achievement."""
        return self.manager.get_achievement(achievement_id)

    def list_achievements(self) -> List[Achievement]:
        """List all achievements."""
        return self.manager.get_all_achievements()

    def unlock_achievement(self, agent_id: str, achievement_id: str) -> Optional[Achievement]:
        """Unlock an achievement."""
        return self.manager.unlock_achievement(agent_id, achievement_id)

    def get_agent_achievements(self, agent_id: str) -> List[Achievement]:
        """Get agent achievements."""
        return self.manager.get_agent_achievements(agent_id)

    # Points
    def add_points(self, agent_id: str, amount: int, **kwargs) -> PointTransaction:
        """Add points."""
        return self.manager.add_points(agent_id, amount, **kwargs)

    def deduct_points(self, agent_id: str, amount: int, **kwargs) -> Optional[PointTransaction]:
        """Deduct points."""
        return self.manager.deduct_points(agent_id, amount, **kwargs)

    def get_balance(self, agent_id: str) -> int:
        """Get point balance."""
        return self.manager.get_balance(agent_id)

    def get_transactions(self, agent_id: str, **kwargs) -> List[PointTransaction]:
        """Get transaction history."""
        return self.manager.get_transaction_history(agent_id, **kwargs)

    # Rewards
    def create_reward(self, name: str, **kwargs) -> Reward:
        """Create a reward."""
        return self.manager.create_reward(name, **kwargs)

    def get_reward(self, reward_id: str) -> Optional[Reward]:
        """Get a reward."""
        return self.manager.get_reward(reward_id)

    def list_rewards(self) -> List[Reward]:
        """List all rewards."""
        return self.manager.get_all_rewards()

    def grant_reward(self, agent_id: str, reward_id: str, **kwargs) -> Optional[Reward]:
        """Grant a reward."""
        return self.manager.grant_reward(agent_id, reward_id, **kwargs)

    def get_agent_rewards(self, agent_id: str, **kwargs) -> List[Reward]:
        """Get agent rewards."""
        return self.manager.get_agent_rewards(agent_id, **kwargs)

    # Redemptions
    def redeem(self, agent_id: str, reward_id: str) -> Optional[Redemption]:
        """Redeem a reward."""
        return self.manager.redeem_reward(agent_id, reward_id)

    def get_redemptions(self, agent_id: str) -> List[Redemption]:
        """Get redemption history."""
        return self.manager.get_redemption_history(agent_id)

    # Policies
    def create_policy(self, name: str, points: int, **kwargs) -> PointPolicy:
        """Create a policy."""
        return self.manager.create_policy(name, points=points, **kwargs)

    def list_policies(self) -> List[PointPolicy]:
        """List policies."""
        return self.manager.get_policies()

    # Leaderboard
    def leaderboard(self, **kwargs) -> Leaderboard:
        """Get leaderboard."""
        return self.manager.get_leaderboard(**kwargs)

    # Metrics & Reports
    def metrics(self, agent_id: str) -> RewardMetrics:
        """Get metrics."""
        return self.manager.get_metrics(agent_id)

    def report(self, agent_id: str, **kwargs) -> RewardReport:
        """Generate report."""
        return self.manager.generate_report(agent_id, **kwargs)

    # Config
    def config(self) -> dict:
        """Get config."""
        return self.manager.get_config()

    def update_config(self, **kwargs):
        """Update config."""
        self.manager.update_config(**kwargs)


# Global instance
agent_reward = AgentReward()
