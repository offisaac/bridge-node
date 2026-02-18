"""
Agent Leaderboard Module

Provides comprehensive leaderboard system for tracking and ranking agents across multiple metrics,
categories, time periods, and custom criteria.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional
from threading import RLock
import uuid


class LeaderboardType(Enum):
    """Leaderboard types."""
    POINTS = "points"
    TASKS = "tasks"
    PERFORMANCE = "performance"
    QUALITY = "quality"
    COLLABORATION = "collaboration"
    INNOVATION = "innovation"
    CUSTOM = "custom"


class TimePeriod(Enum):
    """Time periods for leaderboard."""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    ALL_TIME = "all_time"


class RankingMetric(Enum):
    """Ranking metrics."""
    SCORE = "score"
    COUNT = "count"
    AVERAGE = "average"
    PERCENTAGE = "percentage"
    WEIGHTED = "weighted"


class LeaderboardStatus(Enum):
    """Leaderboard status."""
    ACTIVE = "active"
    ARCHIVED = "archived"
    FROZEN = "frozen"


@dataclass
class LeaderboardEntry:
    """Leaderboard entry."""
    id: str = field(default_factory=lambda: f"LBE-{uuid.uuid4().hex[:8].upper()}")
    agent_id: str = ""
    rank: int = 0
    score: float = 0.0
    previous_rank: int = 0
    rank_change: int = 0
    metadata: dict = field(default_factory=dict)
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class Leaderboard:
    """Leaderboard definition."""
    id: str = field(default_factory=lambda: f"LB-{uuid.uuid4().hex[:8].upper()}")
    name: str = ""
    description: str = ""
    leaderboard_type: LeaderboardType = LeaderboardType.POINTS
    time_period: TimePeriod = TimePeriod.ALL_TIME
    metric: RankingMetric = RankingMetric.SCORE
    entries: list = field(default_factory=list)
    size_limit: int = 100
    is_public: bool = True
    status: LeaderboardStatus = LeaderboardStatus.ACTIVE
    created_by: str = ""
    tags: list = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())
    archived_at: Optional[str] = None


@dataclass
class LeaderboardSnapshot:
    """Leaderboard snapshot for historical tracking."""
    id: str = field(default_factory=lambda: f"LBS-{uuid.uuid4().hex[:8].upper()}")
    leaderboard_id: str = ""
    entries: list = field(default_factory=list)
    snapshot_date: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class LeaderboardFilter:
    """Leaderboard filter criteria."""
    agent_ids: list = field(default_factory=list)
    tags: list = field(default_factory=list)
    categories: list = field(default_factory=list)
    min_score: float = 0.0
    max_score: float = float('inf')


@dataclass
class LeaderboardCriteria:
    """Ranking criteria."""
    metric: str = ""
    weight: float = 1.0
    aggregation: str = "sum"
    conditions: dict = field(default_factory=dict)


@dataclass
class AgentRanking:
    """Agent ranking summary."""
    agent_id: str = ""
    total_rankings: int = 0
    best_rank: int = 0
    worst_rank: int = 0
    average_rank: float = 0.0
    rank_improvements: int = 0
    rank_declines: int = 0


@dataclass
class LeaderboardMetrics:
    """Leaderboard metrics."""
    leaderboard_id: str = ""
    total_participants: int = 0
    total_entries: int = 0
    avg_score: float = 0.0
    highest_score: float = 0.0
    lowest_score: float = 0.0
    score_distribution: dict = field(default_factory=dict)


@dataclass
class LeaderboardConfig:
    """Leaderboard configuration."""
    default_size_limit: int = 100
    max_leaderboards: int = 50
    enable_snapshots: bool = True
    snapshot_interval_hours: int = 24
    auto_archive_days: int = 90
    enable_rank_change_notifications: bool = True
    default_time_period: TimePeriod = TimePeriod.WEEKLY


@dataclass
class LeaderboardReport:
    """Leaderboard report."""
    leaderboard_id: str = ""
    period_start: str = ""
    period_end: str = ""
    top_agents: list = field(default_factory=list)
    most_improved: list = field(default_factory=list)
    new_entries: list = field(default_factory=list)
    trends: dict = field(default_factory=dict)


class LeaderboardManager:
    """Manages agent leaderboards."""

    def __init__(self):
        self._leaderboards: dict[str, Leaderboard] = {}
        self._snapshots: dict[str, List[LeaderboardSnapshot]] = {}
        self._agent_rankings: dict[str, List[AgentRanking]] = {}
        self._lock = RLock()
        self._config = LeaderboardConfig()

    def create_leaderboard(self, name: str, leaderboard_type: LeaderboardType = LeaderboardType.POINTS,
                          description: str = "", **kwargs) -> Leaderboard:
        """Create a leaderboard."""
        leaderboard = Leaderboard(
            name=name,
            description=description,
            leaderboard_type=leaderboard_type,
            **kwargs
        )
        self._leaderboards[leaderboard.id] = leaderboard
        self._snapshots[leaderboard.id] = []
        return leaderboard

    def get_leaderboard(self, leaderboard_id: str) -> Optional[Leaderboard]:
        """Get a leaderboard."""
        return self._leaderboards.get(leaderboard_id)

    def get_all_leaderboards(self, status: LeaderboardStatus = None) -> List[Leaderboard]:
        """Get all leaderboards."""
        leaderboards = list(self._leaderboards.values())
        if status:
            leaderboards = [lb for lb in leaderboards if lb.status == status]
        return leaderboards

    def update_leaderboard(self, leaderboard_id: str, **kwargs) -> Optional[Leaderboard]:
        """Update a leaderboard."""
        with self._lock:
            leaderboard = self._leaderboards.get(leaderboard_id)
            if not leaderboard:
                return None
            for key, value in kwargs.items():
                if hasattr(leaderboard, key):
                    setattr(leaderboard, key, value)
            leaderboard.updated_at = datetime.now().isoformat()
            return leaderboard

    def delete_leaderboard(self, leaderboard_id: str) -> bool:
        """Delete a leaderboard."""
        with self._lock:
            if leaderboard_id in self._leaderboards:
                del self._leaderboards[leaderboard_id]
                if leaderboard_id in self._snapshots:
                    del self._snapshots[leaderboard_id]
                return True
            return False

    def archive_leaderboard(self, leaderboard_id: str) -> Optional[Leaderboard]:
        """Archive a leaderboard."""
        leaderboard = self._leaderboards.get(leaderboard_id)
        if not leaderboard:
            return None
        leaderboard.status = LeaderboardStatus.ARCHIVED
        leaderboard.archived_at = datetime.now().isoformat()
        return leaderboard

    def update_entry(self, leaderboard_id: str, agent_id: str, score: float,
                   metadata: dict = None) -> Optional[LeaderboardEntry]:
        """Update an entry in the leaderboard."""
        with self._lock:
            leaderboard = self._leaderboards.get(leaderboard_id)
            if not leaderboard:
                return None

            # Find existing entry
            existing_entry = None
            for entry in leaderboard.entries:
                if entry.agent_id == agent_id:
                    existing_entry = entry
                    break

            if existing_entry:
                existing_entry.previous_rank = existing_entry.rank
                existing_entry.score = score
                existing_entry.rank_change = existing_entry.previous_rank - existing_entry.rank
                if metadata:
                    existing_entry.metadata.update(metadata)
                existing_entry.updated_at = datetime.now().isoformat()
            else:
                # Create new entry
                entry = LeaderboardEntry(
                    agent_id=agent_id,
                    score=score,
                    metadata=metadata or {}
                )
                leaderboard.entries.append(entry)

            # Recalculate ranks
            self._recalculate_ranks(leaderboard)

            return existing_entry or entry

    def _recalculate_ranks(self, leaderboard: Leaderboard):
        """Recalculate ranks based on scores."""
        # Sort by score descending
        sorted_entries = sorted(leaderboard.entries, key=lambda e: e.score, reverse=True)

        # Apply size limit
        if leaderboard.size_limit > 0:
            sorted_entries = sorted_entries[:leaderboard.size_limit]

        # Update ranks
        for rank, entry in enumerate(sorted_entries, 1):
            if entry.rank != rank:
                entry.previous_rank = entry.rank
                entry.rank_change = entry.previous_rank - rank if entry.previous_rank else 0
            entry.rank = rank

        # Keep only entries within limit
        leaderboard.entries = sorted_entries

    def remove_entry(self, leaderboard_id: str, agent_id: str) -> bool:
        """Remove an entry from leaderboard."""
        leaderboard = self._leaderboards.get(leaderboard_id)
        if not leaderboard:
            return False

        original_count = len(leaderboard.entries)
        leaderboard.entries = [e for e in leaderboard.entries if e.agent_id != agent_id]

        if len(leaderboard.entries) < original_count:
            self._recalculate_ranks(leaderboard)
            return True
        return False

    def get_entry(self, leaderboard_id: str, agent_id: str) -> Optional[LeaderboardEntry]:
        """Get an entry from leaderboard."""
        leaderboard = self._leaderboards.get(leaderboard_id)
        if not leaderboard:
            return None
        for entry in leaderboard.entries:
            if entry.agent_id == agent_id:
                return entry
        return None

    def get_top_entries(self, leaderboard_id: str, limit: int = 10) -> List[LeaderboardEntry]:
        """Get top N entries from leaderboard."""
        leaderboard = self._leaderboards.get(leaderboard_id)
        if not leaderboard:
            return []
        return sorted(leaderboard.entries, key=lambda e: e.score, reverse=True)[:limit]

    def get_rank(self, leaderboard_id: str, agent_id: str) -> Optional[int]:
        """Get rank of an agent."""
        entry = self.get_entry(leaderboard_id, agent_id)
        return entry.rank if entry else None

    def get_rankings_around(self, leaderboard_id: str, agent_id: str,
                          range_size: int = 5) -> List[LeaderboardEntry]:
        """Get entries around a specific agent."""
        leaderboard = self._leaderboards.get(leaderboard_id)
        if not leaderboard:
            return []

        # Find agent's position
        agent_rank = None
        for i, entry in enumerate(leaderboard.entries):
            if entry.agent_id == agent_id:
                agent_rank = i
                break

        if agent_rank is None:
            return []

        # Get range around agent
        start = max(0, agent_rank - range_size)
        end = min(len(leaderboard.entries), agent_rank + range_size + 1)

        return leaderboard.entries[start:end]

    # Snapshot management
    def create_snapshot(self, leaderboard_id: str) -> Optional[LeaderboardSnapshot]:
        """Create a snapshot of the leaderboard."""
        leaderboard = self._leaderboards.get(leaderboard_id)
        if not leaderboard:
            return None

        snapshot = LeaderboardSnapshot(
            leaderboard_id=leaderboard_id,
            entries=list(leaderboard.entries)
        )

        if leaderboard_id not in self._snapshots:
            self._snapshots[leaderboard_id] = []
        self._snapshots[leaderboard_id].append(snapshot)

        return snapshot

    def get_snapshots(self, leaderboard_id: str, limit: int = 30) -> List[LeaderboardSnapshot]:
        """Get snapshots for a leaderboard."""
        snapshots = self._snapshots.get(leaderboard_id, [])
        return sorted(snapshots, key=lambda s: s.snapshot_date, reverse=True)[:limit]

    def compare_snapshots(self, leaderboard_id: str, snapshot1_id: str,
                         snapshot2_id: str) -> dict:
        """Compare two snapshots."""
        snapshots = self._snapshots.get(leaderboard_id, [])
        s1 = None
        s2 = None

        for s in snapshots:
            if s.id == snapshot1_id:
                s1 = s
            if s.id == snapshot2_id:
                s2 = s

        if not s1 or not s2:
            return {"error": "Snapshot not found"}

        # Build comparison
        changes = []
        for entry2 in s2.entries:
            entry1 = None
            for e in s1.entries:
                if e.agent_id == entry2.agent_id:
                    entry1 = e
                    break

            if entry1:
                change = entry2.rank - entry1.rank
                if change != 0:
                    changes.append({
                        "agent_id": entry2.agent_id,
                        "old_rank": entry1.rank,
                        "new_rank": entry2.rank,
                        "change": change
                    })

        return {
            "snapshot1_date": s1.snapshot_date,
            "snapshot2_date": s2.snapshot_date,
            "changes": changes
        }

    # Query methods
    def query_leaderboards(self, leaderboard_type: LeaderboardType = None,
                          time_period: TimePeriod = None,
                          tags: list = None) -> List[Leaderboard]:
        """Query leaderboards by criteria."""
        results = list(self._leaderboards.values())

        if leaderboard_type:
            results = [lb for lb in results if lb.leaderboard_type == leaderboard_type]
        if time_period:
            results = [lb for lb in results if lb.time_period == time_period]
        if tags:
            results = [lb for lb in results if any(t in lb.tags for t in tags)]

        return results

    def get_agent_rankings(self, agent_id: str) -> List[AgentRanking]:
        """Get all rankings for an agent."""
        rankings = []
        for leaderboard in self._leaderboards.values():
            for entry in leaderboard.entries:
                if entry.agent_id == agent_id:
                    ranking = AgentRanking(
                        agent_id=agent_id,
                        total_rankings=1,
                        best_rank=entry.rank,
                        worst_rank=entry.rank,
                        average_rank=float(entry.rank)
                    )
                    rankings.append(ranking)
        return rankings

    # Metrics
    def get_metrics(self, leaderboard_id: str) -> Optional[LeaderboardMetrics]:
        """Get metrics for a leaderboard."""
        leaderboard = self._leaderboards.get(leaderboard_id)
        if not leaderboard:
            return None

        entries = leaderboard.entries
        if not entries:
            return LeaderboardMetrics(leaderboard_id=leaderboard_id)

        scores = [e.score for e in entries]
        avg_score = sum(scores) / len(scores)

        # Score distribution
        sorted_scores = sorted(scores, reverse=True)
        threshold_10 = sorted_scores[len(scores)//10] if scores else 0
        threshold_25 = sorted_scores[len(scores)//4] if scores else 0
        threshold_bottom = sorted(scores)[len(scores)//4] if scores else 0

        distribution = {
            "top_10_percent": len([s for s in scores if s >= threshold_10]),
            "top_25_percent": len([s for s in scores if s >= threshold_25]),
            "bottom_25_percent": len([s for s in scores if s <= threshold_bottom])
        }

        return LeaderboardMetrics(
            leaderboard_id=leaderboard_id,
            total_participants=len(set(e.agent_id for e in entries)),
            total_entries=len(entries),
            avg_score=avg_score,
            highest_score=max(scores) if scores else 0.0,
            lowest_score=min(scores) if scores else 0.0,
            score_distribution=distribution
        )

    def generate_report(self, leaderboard_id: str, period_start: str = None,
                       period_end: str = None) -> LeaderboardReport:
        """Generate a leaderboard report."""
        leaderboard = self._leaderboards.get(leaderboard_id)
        if not leaderboard:
            return LeaderboardReport(leaderboard_id=leaderboard_id)

        # Top agents
        top_agents = [{"agent_id": e.agent_id, "rank": e.rank, "score": e.score}
                     for e in sorted(leaderboard.entries, key=lambda x: x.rank)[:10]]

        # Most improved (by rank change)
        most_improved = sorted(leaderboard.entries,
                              key=lambda e: e.rank_change,
                              reverse=True)[:5]

        # Trends (simplified)
        trends = {
            "total_entries": len(leaderboard.entries),
            "avg_score": sum(e.score for e in leaderboard.entries) / len(leaderboard.entries) if leaderboard.entries else 0
        }

        return LeaderboardReport(
            leaderboard_id=leaderboard_id,
            period_start=period_start or "",
            period_end=period_end or "",
            top_agents=top_agents,
            most_improved=[{"agent_id": e.agent_id, "rank_change": e.rank_change} for e in most_improved],
            trends=trends
        )

    def get_config(self) -> dict:
        """Get configuration."""
        return {
            "default_size_limit": self._config.default_size_limit,
            "max_leaderboards": self._config.max_leaderboards,
            "enable_snapshots": self._config.enable_snapshots,
            "snapshot_interval_hours": self._config.snapshot_interval_hours,
            "auto_archive_days": self._config.auto_archive_days,
            "enable_rank_change_notifications": self._config.enable_rank_change_notifications,
            "default_time_period": self._config.default_time_period.value
        }

    def update_config(self, **kwargs):
        """Update configuration."""
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self._config, key):
                    if key == "default_time_period" and isinstance(value, str):
                        value = TimePeriod(value)
                    setattr(self._config, key, value)


class AgentLeaderboard:
    """Public API for agent leaderboard."""

    def __init__(self):
        self.manager = LeaderboardManager()

    # Leaderboard management
    def create(self, name: str, **kwargs) -> Leaderboard:
        """Create a leaderboard."""
        return self.manager.create_leaderboard(name, **kwargs)

    def get(self, leaderboard_id: str) -> Optional[Leaderboard]:
        """Get a leaderboard."""
        return self.manager.get_leaderboard(leaderboard_id)

    def list(self, **kwargs) -> List[Leaderboard]:
        """List leaderboards."""
        return self.manager.get_all_leaderboards(**kwargs)

    def update(self, leaderboard_id: str, **kwargs) -> Optional[Leaderboard]:
        """Update a leaderboard."""
        return self.manager.update_leaderboard(leaderboard_id, **kwargs)

    def delete(self, leaderboard_id: str) -> bool:
        """Delete a leaderboard."""
        return self.manager.delete_leaderboard(leaderboard_id)

    def archive(self, leaderboard_id: str) -> Optional[Leaderboard]:
        """Archive a leaderboard."""
        return self.manager.archive_leaderboard(leaderboard_id)

    # Entry management
    def update_score(self, leaderboard_id: str, agent_id: str, score: float, **kwargs) -> Optional[LeaderboardEntry]:
        """Update agent score."""
        return self.manager.update_entry(leaderboard_id, agent_id, score, **kwargs)

    def remove(self, leaderboard_id: str, agent_id: str) -> bool:
        """Remove entry."""
        return self.manager.remove_entry(leaderboard_id, agent_id)

    def get_entry(self, leaderboard_id: str, agent_id: str) -> Optional[LeaderboardEntry]:
        """Get entry."""
        return self.manager.get_entry(leaderboard_id, agent_id)

    def get_top(self, leaderboard_id: str, limit: int = 10) -> List[LeaderboardEntry]:
        """Get top entries."""
        return self.manager.get_top_entries(leaderboard_id, limit)

    def get_rank(self, leaderboard_id: str, agent_id: str) -> Optional[int]:
        """Get agent rank."""
        return self.manager.get_rank(leaderboard_id, agent_id)

    def get_nearby(self, leaderboard_id: str, agent_id: str, **kwargs) -> List[LeaderboardEntry]:
        """Get entries around agent."""
        return self.manager.get_rankings_around(leaderboard_id, agent_id, **kwargs)

    # Snapshots
    def snapshot(self, leaderboard_id: str) -> Optional[LeaderboardSnapshot]:
        """Create snapshot."""
        return self.manager.create_snapshot(leaderboard_id)

    def get_snapshots(self, leaderboard_id: str, **kwargs) -> List[LeaderboardSnapshot]:
        """Get snapshots."""
        return self.manager.get_snapshots(leaderboard_id, **kwargs)

    def compare(self, leaderboard_id: str, snapshot1: str, snapshot2: str) -> dict:
        """Compare snapshots."""
        return self.manager.compare_snapshots(leaderboard_id, snapshot1, snapshot2)

    # Query
    def query(self, **kwargs) -> List[Leaderboard]:
        """Query leaderboards."""
        return self.manager.query_leaderboards(**kwargs)

    def get_agent_rankings(self, agent_id: str) -> List[AgentRanking]:
        """Get agent rankings."""
        return self.manager.get_agent_rankings(agent_id)

    # Metrics & Reports
    def metrics(self, leaderboard_id: str) -> Optional[LeaderboardMetrics]:
        """Get metrics."""
        return self.manager.get_metrics(leaderboard_id)

    def report(self, leaderboard_id: str, **kwargs) -> LeaderboardReport:
        """Generate report."""
        return self.manager.generate_report(leaderboard_id, **kwargs)

    # Config
    def config(self) -> dict:
        """Get config."""
        return self.manager.get_config()

    def update_config(self, **kwargs):
        """Update config."""
        self.manager.update_config(**kwargs)


# Global instance
agent_leaderboard = AgentLeaderboard()
