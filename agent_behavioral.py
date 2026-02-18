"""Agent Behavioral Module

Behavioral biometrics and pattern analysis for agents including keystroke dynamics,
mouse behavior analysis, navigation patterns, and behavioral profiling.
"""
import time
import uuid
import threading
import hashlib
import statistics
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class BehavioralStatus(str, Enum):
    """Behavioral verification status."""
    ENROLLED = "enrolled"
    PENDING = "pending"
    VERIFIED = "verified"
    FAILED = "failed"
    ANOMALY = "anomaly"
    EXPIRED = "expired"


class BehavioralAction(str, Enum):
    """Behavioral action types."""
    ENROLL = "enroll"
    VERIFY = "verify"
    ANALYZE = "analyze"
    DELETE = "delete"


class BehavioralType(str, Enum):
    """Behavioral biometric types."""
    KEYSTROKE = "keystroke"
    MOUSE = "mouse"
    TOUCH = "touch"
    NAVIGATION = "navigation"
    TIMING = "timing"
    COMBINED = "combined"


@dataclass
class KeystrokePattern:
    """Keystroke pattern data."""
    key: str
    press_time: float
    release_time: float
    hold_duration: float = 0.0
    latency: float = 0.0


@dataclass
class MousePattern:
    """Mouse behavior pattern data."""
    x: float
    y: float
    timestamp: float
    event_type: str = "move"  # move, click, scroll
    button: str = ""


@dataclass
class BehavioralTemplate:
    """Behavioral biometric template."""
    id: str
    agent_id: str
    behavioral_type: BehavioralType
    template_data: str  # In production, this would be actual embeddings
    created_at: float
    expires_at: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BehavioralVerification:
    """Behavioral verification record."""
    id: str
    agent_id: str
    action: BehavioralAction
    behavioral_type: BehavioralType
    status: BehavioralStatus
    confidence: float = 0.0
    anomaly_score: float = 0.0
    created_at: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BehavioralConfig:
    """Behavioral configuration."""
    min_confidence: float = 0.8
    anomaly_threshold: float = 0.7
    template_expiry: int = 31536000  # 1 year
    max_retries: int = 3
    enable_keystroke: bool = True
    enable_mouse: bool = True
    enable_navigation: bool = True
    sample_size: int = 50


class BehavioralManager:
    """Behavioral biometrics management engine."""

    def __init__(self, config: BehavioralConfig = None):
        self._lock = threading.RLock()
        self._config = config or BehavioralConfig()
        self._templates: Dict[str, BehavioralTemplate] = {}
        self._agent_templates: Dict[str, List[str]] = defaultdict(list)
        self._verifications: List[BehavioralVerification] = []
        self._keystroke_samples: Dict[str, List[KeystrokePattern]] = defaultdict(list)
        self._mouse_samples: Dict[str, List[MousePattern]] = defaultdict(list)
        self._navigation_samples: Dict[str, List[Dict]] = defaultdict(list)
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def _calculate_keystroke_features(self, patterns: List[KeystrokePattern]) -> Dict[str, float]:
        """Calculate keystroke features."""
        if not patterns:
            return {}

        hold_durations = [p.hold_duration for p in patterns if p.hold_duration > 0]
        latencies = [p.latency for p in patterns if p.latency > 0]

        features = {}
        if hold_durations:
            features["mean_hold"] = statistics.mean(hold_durations)
            features["std_hold"] = statistics.stdev(hold_durations) if len(hold_durations) > 1 else 0
        if latencies:
            features["mean_latency"] = statistics.mean(latencies)
            features["std_latency"] = statistics.stdev(latencies) if len(latencies) > 1 else 0

        return features

    def _calculate_mouse_features(self, patterns: List[MousePattern]) -> Dict[str, float]:
        """Calculate mouse behavior features."""
        if not patterns:
            return {}

        # Calculate movement speed
        movements = []
        for i in range(1, len(patterns)):
            prev = patterns[i-1]
            curr = patterns[i]
            dt = curr.timestamp - prev.timestamp
            if dt > 0:
                dist = ((curr.x - prev.x)**2 + (curr.y - prev.y)**2)**0.5
                movements.append(dist / dt)

        features = {}
        if movements:
            features["mean_speed"] = statistics.mean(movements)
            features["std_speed"] = statistics.stdev(movements) if len(movements) > 1 else 0
            features["max_speed"] = max(movements)

        # Count event types
        event_counts = defaultdict(int)
        for p in patterns:
            event_counts[p.event_type] += 1
        features["click_ratio"] = event_counts.get("click", 0) / len(patterns) if patterns else 0

        return features

    def enroll(
        self,
        agent_id: str,
        behavioral_type: BehavioralType,
        template_data: str,
        metadata: Dict[str, Any] = None
    ) -> BehavioralTemplate:
        """Enroll behavioral template."""
        with self._lock:
            current_time = time.time()

            # Generate template ID
            template_id = hashlib.sha256(
                f"{agent_id}{behavioral_type.value}{current_time}".encode()
            ).hexdigest()[:16]

            template = BehavioralTemplate(
                id=template_id,
                agent_id=agent_id,
                behavioral_type=behavioral_type,
                template_data=template_data,
                created_at=current_time,
                expires_at=current_time + self._config.template_expiry,
                metadata=metadata or {}
            )

            self._templates[template_id] = template
            self._agent_templates[agent_id].append(template_id)

            return template

    def verify(
        self,
        agent_id: str,
        behavioral_type: BehavioralType,
        verification_data: str,
        metadata: Dict[str, Any] = None
    ) -> BehavioralVerification:
        """Verify behavioral pattern."""
        with self._lock:
            current_time = time.time()

            # Check if agent has templates
            template_ids = self._agent_templates.get(agent_id, [])
            if not template_ids:
                verification = BehavioralVerification(
                    id=str(uuid.uuid4())[:12],
                    agent_id=agent_id,
                    action=BehavioralAction.VERIFY,
                    behavioral_type=behavioral_type,
                    status=BehavioralStatus.FAILED,
                    confidence=0.0,
                    anomaly_score=1.0,
                    created_at=current_time,
                    metadata={"error": "No templates enrolled"}
                )
                self._verifications.append(verification)
                return verification

            # Simulate verification (in production, would use actual ML model)
            confidence = 0.85 + (hash(verification_data) % 15) / 100
            anomaly_score = 0.15 - (hash(verification_data) % 15) / 100

            if confidence >= self._config.min_confidence:
                if anomaly_score >= self._config.anomaly_threshold:
                    status = BehavioralStatus.ANOMALY
                else:
                    status = BehavioralStatus.VERIFIED
            else:
                status = BehavioralStatus.FAILED

            verification = BehavioralVerification(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                action=BehavioralAction.VERIFY,
                behavioral_type=behavioral_type,
                status=status,
                confidence=confidence,
                anomaly_score=anomaly_score,
                created_at=current_time,
                metadata=metadata or {}
            )

            self._verifications.append(verification)

            # Keep only last 1000 verifications
            if len(self._verifications) > 1000:
                self._verifications = self._verifications[-500:]

            # Run hooks
            for hook in self._hooks.get("verification", []):
                try:
                    hook(verification)
                except Exception:
                    pass

            return verification

    def analyze_keystroke(
        self,
        agent_id: str,
        patterns: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze keystroke patterns."""
        with self._lock:
            # Convert to KeystrokePattern objects
            keystrokes = []
            for p in patterns:
                keystrokes.append(KeystrokePattern(
                    key=p.get("key", ""),
                    press_time=p.get("press_time", 0),
                    release_time=p.get("release_time", 0),
                    hold_duration=p.get("hold_duration", 0),
                    latency=p.get("latency", 0)
                ))

            # Calculate features
            features = self._calculate_keystroke_features(keystrokes)

            # Store sample
            self._keystroke_samples[agent_id].extend(keystrokes)
            if len(self._keystroke_samples[agent_id]) > self._config.sample_size * 2:
                self._keystroke_samples[agent_id] = self._keystroke_samples[agent_id][-self._config.sample_size:]

            return {
                "agent_id": agent_id,
                "type": BehavioralType.KEYSTROKE.value,
                "features": features,
                "sample_count": len(keystrokes)
            }

    def analyze_mouse(
        self,
        agent_id: str,
        patterns: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze mouse behavior patterns."""
        with self._lock:
            # Convert to MousePattern objects
            mouse_patterns = []
            for p in patterns:
                mouse_patterns.append(MousePattern(
                    x=p.get("x", 0),
                    y=p.get("y", 0),
                    timestamp=p.get("timestamp", 0),
                    event_type=p.get("event_type", "move"),
                    button=p.get("button", "")
                ))

            # Calculate features
            features = self._calculate_mouse_features(mouse_patterns)

            # Store sample
            self._mouse_samples[agent_id].extend(mouse_patterns)
            if len(self._mouse_samples[agent_id]) > self._config.sample_size * 2:
                self._mouse_samples[agent_id] = self._mouse_samples[agent_id][-self._config.sample_size:]

            return {
                "agent_id": agent_id,
                "type": BehavioralType.MOUSE.value,
                "features": features,
                "sample_count": len(mouse_patterns)
            }

    def analyze_navigation(
        self,
        agent_id: str,
        patterns: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze navigation patterns."""
        with self._lock:
            # Store navigation sample
            self._navigation_samples[agent_id].extend(patterns)
            if len(self._navigation_samples[agent_id]) > self._config.sample_size * 2:
                self._navigation_samples[agent_id] = self._navigation_samples[agent_id][-self._config.sample_size:]

            # Calculate basic features
            page_counts = defaultdict(int)
            transition_counts = defaultdict(int)
            for p in patterns:
                if "page" in p:
                    page_counts[p["page"]] += 1
                if "from_page" in p and "to_page" in p:
                    transition_counts[f"{p['from_page']}->{p['to_page']}"] += 1

            return {
                "agent_id": agent_id,
                "type": BehavioralType.NAVIGATION.value,
                "unique_pages": len(page_counts),
                "total_transitions": len(transition_counts),
                "sample_count": len(patterns)
            }

    def delete_template(self, template_id: str) -> bool:
        """Delete behavioral template."""
        with self._lock:
            template = self._templates.get(template_id)
            if not template:
                return False

            del self._templates[template_id]
            if template.agent_id in self._agent_templates:
                if template_id in self._agent_templates[template.agent_id]:
                    self._agent_templates[template.agent_id].remove(template_id)

            return True

    def delete_agent_templates(self, agent_id: str) -> int:
        """Delete all templates for an agent."""
        with self._lock:
            template_ids = self._agent_templates.get(agent_id, [])
            count = len(template_ids)

            for template_id in template_ids:
                if template_id in self._templates:
                    del self._templates[template_id]

            self._agent_templates[agent_id] = []
            return count

    def get_template(self, template_id: str) -> Optional[BehavioralTemplate]:
        """Get behavioral template."""
        with self._lock:
            return self._templates.get(template_id)

    def get_agent_templates(self, agent_id: str) -> List[BehavioralTemplate]:
        """Get all templates for an agent."""
        with self._lock:
            template_ids = self._agent_templates.get(agent_id, [])
            return [
                self._templates[tid]
                for tid in template_ids
                if tid in self._templates
            ]

    def get_verifications(
        self,
        agent_id: str = None,
        status: BehavioralStatus = None,
        behavioral_type: BehavioralType = None,
        limit: int = 100
    ) -> List[BehavioralVerification]:
        """Get verification records."""
        with self._lock:
            verifications = self._verifications

            if agent_id:
                verifications = [v for v in verifications if v.agent_id == agent_id]
            if status:
                verifications = [v for v in verifications if v.status == status]
            if behavioral_type:
                verifications = [v for v in verifications if v.behavioral_type == behavioral_type]

            return verifications[-limit:]

    def get_stats(self) -> Dict[str, Any]:
        """Get behavioral biometrics statistics."""
        with self._lock:
            total = len(self._verifications)
            verified = sum(1 for v in self._verifications if v.status == BehavioralStatus.VERIFIED)
            failed = sum(1 for v in self._verifications if v.status == BehavioralStatus.FAILED)
            anomalies = sum(1 for v in self._verifications if v.status == BehavioralStatus.ANOMALY)

            return {
                "total_templates": len(self._templates),
                "total_verifications": total,
                "verified": verified,
                "failed": failed,
                "anomalies": anomalies,
                "success_rate": verified / total if total > 0 else 0,
                "anomaly_rate": anomalies / total if total > 0 else 0
            }

    def update_config(
        self,
        min_confidence: float = None,
        anomaly_threshold: float = None,
        template_expiry: int = None,
        max_retries: int = None,
        enable_keystroke: bool = None,
        enable_mouse: bool = None,
        enable_navigation: bool = None,
        sample_size: int = None
    ):
        """Update behavioral configuration."""
        with self._lock:
            if min_confidence is not None:
                self._config.min_confidence = min_confidence
            if anomaly_threshold is not None:
                self._config.anomaly_threshold = anomaly_threshold
            if template_expiry is not None:
                self._config.template_expiry = template_expiry
            if max_retries is not None:
                self._config.max_retries = max_retries
            if enable_keystroke is not None:
                self._config.enable_keystroke = enable_keystroke
            if enable_mouse is not None:
                self._config.enable_mouse = enable_mouse
            if enable_navigation is not None:
                self._config.enable_navigation = enable_navigation
            if sample_size is not None:
                self._config.sample_size = sample_size

    def get_config(self) -> BehavioralConfig:
        """Get behavioral configuration."""
        return self._config


class AgentBehavioral:
    """Agent behavioral biometrics handling system."""

    def __init__(self, config: BehavioralConfig = None):
        self._manager = BehavioralManager(config)

    def enroll(
        self,
        agent_id: str,
        behavioral_type: str,
        template_data: str,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Enroll behavioral template."""
        btype = BehavioralType(behavioral_type)
        template = self._manager.enroll(agent_id, btype, template_data, metadata)
        return {
            "template_id": template.id,
            "agent_id": template.agent_id,
            "behavioral_type": template.behavioral_type.value,
            "created_at": template.created_at,
            "expires_at": template.expires_at
        }

    def verify(
        self,
        agent_id: str,
        behavioral_type: str,
        verification_data: str,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Verify behavioral pattern."""
        btype = BehavioralType(behavioral_type)
        verification = self._manager.verify(agent_id, btype, verification_data, metadata)
        return {
            "verification_id": verification.id,
            "agent_id": verification.agent_id,
            "behavioral_type": verification.behavioral_type.value,
            "status": verification.status.value,
            "confidence": verification.confidence,
            "anomaly_score": verification.anomaly_score,
            "created_at": verification.created_at
        }

    def analyze_keystroke(
        self,
        agent_id: str,
        patterns: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze keystroke patterns."""
        return self._manager.analyze_keystroke(agent_id, patterns)

    def analyze_mouse(
        self,
        agent_id: str,
        patterns: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze mouse behavior patterns."""
        return self._manager.analyze_mouse(agent_id, patterns)

    def analyze_navigation(
        self,
        agent_id: str,
        patterns: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Analyze navigation patterns."""
        return self._manager.analyze_navigation(agent_id, patterns)

    def delete_template(self, template_id: str) -> bool:
        """Delete behavioral template."""
        return self._manager.delete_template(template_id)

    def delete_agent_templates(self, agent_id: str) -> int:
        """Delete all templates for an agent."""
        return self._manager.delete_agent_templates(agent_id)

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        """Get behavioral template."""
        template = self._manager.get_template(template_id)
        if not template:
            return None
        return {
            "id": template.id,
            "agent_id": template.agent_id,
            "behavioral_type": template.behavioral_type.value,
            "created_at": template.created_at,
            "expires_at": template.expires_at,
            "metadata": template.metadata
        }

    def get_agent_templates(self, agent_id: str) -> List[Dict[str, Any]]:
        """Get all templates for an agent."""
        templates = self._manager.get_agent_templates(agent_id)
        return [
            {
                "id": t.id,
                "agent_id": t.agent_id,
                "behavioral_type": t.behavioral_type.value,
                "created_at": t.created_at,
                "expires_at": t.expires_at,
                "metadata": t.metadata
            }
            for t in templates
        ]

    def get_verifications(
        self,
        agent_id: str = None,
        status: str = None,
        behavioral_type: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get verification records."""
        status_enum = BehavioralStatus(status) if status else None
        btype_enum = BehavioralType(behavioral_type) if behavioral_type else None
        verifications = self._manager.get_verifications(agent_id, status_enum, btype_enum, limit)
        return [
            {
                "id": v.id,
                "agent_id": v.agent_id,
                "action": v.action.value,
                "behavioral_type": v.behavioral_type.value,
                "status": v.status.value,
                "confidence": v.confidence,
                "anomaly_score": v.anomaly_score,
                "created_at": v.created_at,
                "metadata": v.metadata
            }
            for v in verifications
        ]

    def get_stats(self) -> Dict[str, Any]:
        """Get behavioral biometrics statistics."""
        return self._manager.get_stats()

    def update_config(
        self,
        min_confidence: float = None,
        anomaly_threshold: float = None,
        template_expiry: int = None,
        max_retries: int = None,
        enable_keystroke: bool = None,
        enable_mouse: bool = None,
        enable_navigation: bool = None,
        sample_size: int = None
    ) -> Dict[str, Any]:
        """Update behavioral configuration."""
        self._manager.update_config(
            min_confidence=min_confidence,
            anomaly_threshold=anomaly_threshold,
            template_expiry=template_expiry,
            max_retries=max_retries,
            enable_keystroke=enable_keystroke,
            enable_mouse=enable_mouse,
            enable_navigation=enable_navigation,
            sample_size=sample_size
        )
        return self.get_config()

    def get_config(self) -> Dict[str, Any]:
        """Get behavioral configuration."""
        config = self._manager.get_config()
        return {
            "min_confidence": config.min_confidence,
            "anomaly_threshold": config.anomaly_threshold,
            "template_expiry": config.template_expiry,
            "max_retries": config.max_retries,
            "enable_keystroke": config.enable_keystroke,
            "enable_mouse": config.enable_mouse,
            "enable_navigation": config.enable_navigation,
            "sample_size": config.sample_size
        }


# Global instance
agent_behavioral = AgentBehavioral()
