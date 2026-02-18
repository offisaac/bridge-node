"""A/B Testing Framework Module

Feature flag and experiment framework for controlled rollouts and testing.
"""
import uuid
import hashlib
import random
import threading
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from collections import defaultdict


class ExperimentStatus(str, Enum):
    """Experiment status."""
    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class TargetAudience(str, Enum):
    """Target audience for experiments."""
    ALL = "all"
    PERCENTAGE = "percentage"
    USER_IDS = "user_ids"
    USER_SEGMENTS = "user_segments"


@dataclass
class Variant:
    """Experiment variant (A/B/etc)."""
    id: str
    name: str
    description: str = ""
    weight: float = 50.0  # Percentage of traffic
    config: Dict[str, Any] = field(default_factory=dict)


@dataclass
class Experiment:
    """A/B test experiment."""
    id: str
    name: str
    description: str = ""
    status: ExperimentStatus = ExperimentStatus.DRAFT
    variants: List[Variant] = field(default_factory=list)
    target_audience: TargetAudience = TargetAudience.ALL
    target_percentage: float = 100.0
    target_user_ids: List[str] = field(default_factory=list)
    target_segments: List[str] = field(default_factory=list)
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    metrics: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ExperimentResult:
    """Result of an experiment assignment."""
    experiment_id: str
    variant_id: str
    variant_name: str
    assigned_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class Metric:
    """Experiment metric tracking."""
    name: str
    value: float
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())


class ABTestingFramework:
    """A/B Testing Framework manager."""

    def __init__(self):
        self.experiments: Dict[str, Experiment] = {}
        self.assignments: Dict[str, List[ExperimentResult]] = defaultdict(list)
        self.metrics: Dict[str, List[Metric]] = defaultdict(list)
        self._lock = threading.RLock()

        # Initialize default experiment
        self._init_default_experiments()

    def _init_default_experiments(self):
        """Initialize default experiments."""
        # Default control variant
        control = Variant(
            id="control",
            name="Control",
            description="Default control group",
            weight=50.0
        )
        # Default treatment variant
        treatment = Variant(
            id="treatment",
            name="Treatment",
            description="Treatment group",
            weight=50.0
        )

        # Create default experiment
        default_exp = Experiment(
            id="default",
            name="Default Experiment",
            description="Default A/B test template",
            status=ExperimentStatus.DRAFT,
            variants=[control, treatment]
        )
        self.experiments["default"] = default_exp

    def create_experiment(
        self,
        name: str,
        description: str = "",
        variants: List[Dict[str, Any]] = None,
        target_audience: str = "all",
        target_percentage: float = 100.0
    ) -> Experiment:
        """Create a new experiment."""
        with self._lock:
            experiment_id = str(uuid.uuid4())[:8]

            # Create variants
            variant_objects = []
            if variants:
                for v in variants:
                    variant_objects.append(Variant(
                        id=v.get("id", str(uuid.uuid4())[:8]),
                        name=v.get("name", ""),
                        description=v.get("description", ""),
                        weight=v.get("weight", 50.0),
                        config=v.get("config", {})
                    ))
            else:
                # Default A/B variants
                variant_objects = [
                    Variant(id="control", name="Control", weight=50.0),
                    Variant(id="treatment", name="Treatment", weight=50.0)
                ]

            # Normalize weights
            total_weight = sum(v.weight for v in variant_objects)
            if total_weight != 100.0:
                for v in variant_objects:
                    v.weight = (v.weight / total_weight) * 100

            experiment = Experiment(
                id=experiment_id,
                name=name,
                description=description,
                status=ExperimentStatus.DRAFT,
                variants=variant_objects,
                target_audience=TargetAudience(target_audience),
                target_percentage=target_percentage
            )

            self.experiments[experiment_id] = experiment
            return experiment

    def update_experiment(self, experiment_id: str, **kwargs) -> bool:
        """Update an experiment."""
        with self._lock:
            if experiment_id not in self.experiments:
                return False

            experiment = self.experiments[experiment_id]
            for key, value in kwargs.items():
                if hasattr(experiment, key):
                    setattr(experiment, key, value)
            experiment.updated_at = datetime.now().isoformat()
            return True

    def delete_experiment(self, experiment_id: str) -> bool:
        """Delete an experiment."""
        with self._lock:
            if experiment_id in self.experiments:
                del self.experiments[experiment_id]
                return True
            return False

    def get_experiment(self, experiment_id: str) -> Optional[Experiment]:
        """Get experiment by ID."""
        with self._lock:
            return self.experiments.get(experiment_id)

    def list_experiments(
        self,
        status: ExperimentStatus = None,
        limit: int = 50
    ) -> List[Experiment]:
        """List experiments with optional status filter."""
        with self._lock:
            experiments = list(self.experiments.values())
            if status:
                experiments = [e for e in experiments if e.status == status]
            return sorted(
                experiments,
                key=lambda x: x.created_at,
                reverse=True
            )[:limit]

    def start_experiment(self, experiment_id: str) -> bool:
        """Start an experiment."""
        return self.update_experiment(
            experiment_id,
            status=ExperimentStatus.RUNNING,
            start_time=datetime.now().isoformat()
        )

    def pause_experiment(self, experiment_id: str) -> bool:
        """Pause an experiment."""
        return self.update_experiment(
            experiment_id,
            status=ExperimentStatus.PAUSED
        )

    def complete_experiment(self, experiment_id: str) -> bool:
        """Complete an experiment."""
        return self.update_experiment(
            experiment_id,
            status=ExperimentStatus.COMPLETED,
            end_time=datetime.now().isoformat()
        )

    def assign_variant(
        self,
        experiment_id: str,
        user_id: str = None,
        session_id: str = None,
        user_segment: str = None
    ) -> Optional[ExperimentResult]:
        """Assign user to experiment variant."""
        with self._lock:
            experiment = self.experiments.get(experiment_id)
            if not experiment or experiment.status != ExperimentStatus.RUNNING:
                return None

            # Check target audience
            if not self._is_in_target_audience(
                experiment, user_id, session_id, user_segment
            ):
                return None

            # Determine variant using deterministic hashing
            assignment_key = user_id or session_id or str(random.random())
            variant = self._select_variant(experiment, assignment_key)

            # Record assignment
            result = ExperimentResult(
                experiment_id=experiment_id,
                variant_id=variant.id,
                variant_name=variant.name
            )

            # Store assignment
            key = user_id or session_id or "anonymous"
            self.assignments[key].append(result)

            return result

    def _is_in_target_audience(
        self,
        experiment: Experiment,
        user_id: str,
        session_id: str,
        user_segment: str
    ) -> bool:
        """Check if user is in target audience."""
        if experiment.target_audience == TargetAudience.ALL:
            return True

        elif experiment.target_audience == TargetAudience.PERCENTAGE:
            # Use hash to deterministically select percentage
            key = user_id or session_id or "anonymous"
            hash_val = int(hashlib.md5(key.encode()).hexdigest(), 16) % 100
            return hash_val < experiment.target_percentage

        elif experiment.target_audience == TargetAudience.USER_IDS:
            return user_id in experiment.target_user_ids

        elif experiment.target_audience == TargetAudience.USER_SEGMENTS:
            return user_segment in experiment.target_segments

        return True

    def _select_variant(self, experiment: Experiment, assignment_key: str) -> Variant:
        """Select variant using deterministic hashing."""
        # Create deterministic hash
        hash_input = f"{experiment.id}:{assignment_key}"
        hash_val = int(hashlib.md5(hash_input.encode()).hexdigest(), 16) % 100

        # Find variant based on cumulative weights
        cumulative = 0
        for variant in experiment.variants:
            cumulative += variant.weight
            if hash_val < cumulative:
                return variant

        # Fallback to first variant
        return experiment.variants[0]

    def get_variant_config(self, experiment_id: str, variant_id: str) -> Optional[Dict]:
        """Get variant configuration."""
        with self._lock:
            experiment = self.experiments.get(experiment_id)
            if not experiment:
                return None

            for variant in experiment.variants:
                if variant.id == variant_id:
                    return variant.config
            return None

    def track_metric(
        self,
        experiment_id: str,
        variant_id: str,
        metric_name: str,
        value: float
    ):
        """Track a metric for an experiment variant."""
        with self._lock:
            key = f"{experiment_id}:{variant_id}:{metric_name}"
            metric = Metric(name=metric_name, value=value)
            self.metrics[key].append(metric)

            # Update experiment metrics
            experiment = self.experiments.get(experiment_id)
            if experiment:
                if metric_name not in experiment.metrics:
                    experiment.metrics[metric_name] = {}
                if variant_id not in experiment.metrics[metric_name]:
                    experiment.metrics[metric_name][variant_id] = []
                experiment.metrics[metric_name][variant_id].append(value)

    def get_metrics(
        self,
        experiment_id: str,
        metric_name: str = None
    ) -> Dict[str, List[float]]:
        """Get metrics for an experiment."""
        with self._lock:
            experiment = self.experiments.get(experiment_id)
            if not experiment:
                return {}

            if metric_name:
                return experiment.metrics.get(metric_name, {})
            return experiment.metrics

    def get_statistics(self, experiment_id: str) -> Dict[str, Any]:
        """Get experiment statistics."""
        with self._lock:
            experiment = self.experiments.get(experiment_id)
            if not experiment:
                return {}

            stats = {
                "experiment_id": experiment_id,
                "name": experiment.name,
                "status": experiment.status.value,
                "variants": []
            }

            # Count assignments per variant
            variant_counts = defaultdict(int)
            for assignments in self.assignments.values():
                for result in assignments:
                    if result.experiment_id == experiment_id:
                        variant_counts[result.variant_id] += 1

            # Build variant stats
            for variant in experiment.variants:
                variant_stat = {
                    "id": variant.id,
                    "name": variant.name,
                    "weight": variant.weight,
                    "assignments": variant_counts.get(variant.id, 0),
                    "metrics": {}
                }

                # Add metric stats
                if variant.id in experiment.metrics:
                    for metric_name, values in experiment.metrics[variant.id].items():
                        variant_stat["metrics"][metric_name] = {
                            "count": len(values),
                            "sum": sum(values),
                            "mean": sum(values) / len(values) if values else 0
                        }

                stats["variants"].append(variant_stat)

            return stats


# Global A/B testing framework instance
ab_framework = ABTestingFramework()
