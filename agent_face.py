"""Agent Face Module

Face recognition and biometric verification for agents including face detection,
liveness detection, face matching, and facial biometric enrollment.
"""
import time
import uuid
import threading
import hashlib
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class FaceStatus(str, Enum):
    """Face verification status."""
    ENROLLED = "enrolled"
    PENDING = "pending"
    VERIFIED = "verified"
    FAILED = "failed"
    EXPIRED = "expired"


class FaceAction(str, Enum):
    """Face action types."""
    ENROLL = "enroll"
    VERIFY = "verify"
    SEARCH = "search"
    DELETE = "delete"


@dataclass
class FaceTemplate:
    """Face template data."""
    id: str
    agent_id: str
    template_data: str  # In production, this would be actual embedding
    created_at: float
    expires_at: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FaceVerification:
    """Face verification record."""
    id: str
    agent_id: str
    action: FaceAction
    status: FaceStatus
    confidence: float = 0.0
    liveness_score: float = 0.0
    created_at: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class FaceConfig:
    """Face configuration."""
    min_confidence: float = 0.8
    liveness_threshold: float = 0.9
    template_expiry: int = 31536000  # 1 year
    max_retries: int = 3
    enable_liveness: bool = True
    detection_model: str = "default"


class FaceManager:
    """Face recognition management engine."""

    def __init__(self, config: FaceConfig = None):
        self._lock = threading.RLock()
        self._config = config or FaceConfig()
        self._templates: Dict[str, FaceTemplate] = {}
        self._agent_templates: Dict[str, List[str]] = defaultdict(list)
        self._verifications: List[FaceVerification] = []
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def enroll(
        self,
        agent_id: str,
        template_data: str,
        metadata: Dict[str, Any] = None
    ) -> FaceTemplate:
        """Enroll face template."""
        with self._lock:
            current_time = time.time()

            # Generate template ID
            template_id = hashlib.sha256(
                f"{agent_id}{current_time}".encode()
            ).hexdigest()[:16]

            template = FaceTemplate(
                id=template_id,
                agent_id=agent_id,
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
        verification_data: str,
        liveness_data: float = 0.0,
        metadata: Dict[str, Any] = None
    ) -> FaceVerification:
        """Verify face."""
        with self._lock:
            current_time = time.time()

            # Check if agent has templates
            template_ids = self._agent_templates.get(agent_id, [])
            if not template_ids:
                verification = FaceVerification(
                    id=str(uuid.uuid4())[:12],
                    agent_id=agent_id,
                    action=FaceAction.VERIFY,
                    status=FaceStatus.FAILED,
                    confidence=0.0,
                    liveness_score=liveness_data,
                    created_at=current_time,
                    metadata={"error": "No templates enrolled"}
                )
                self._verifications.append(verification)
                return verification

            # Simulate verification (in production, would use actual ML model)
            confidence = 0.85 + (hash(verification_data) % 15) / 100
            liveness_passed = liveness_data >= self._config.liveness_threshold

            if confidence >= self._config.min_confidence and (
                not self._config.enable_liveness or liveness_passed
            ):
                status = FaceStatus.VERIFIED
            else:
                status = FaceStatus.FAILED

            verification = FaceVerification(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                action=FaceAction.VERIFY,
                status=status,
                confidence=confidence,
                liveness_score=liveness_data,
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

    def search(
        self,
        verification_data: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search for matching face."""
        with self._lock:
            results = []

            # Simulate search (in production, would use actual similarity search)
            for template_id, template in self._templates.items():
                if template.expires_at > 0 and time.time() > template.expires_at:
                    continue

                # Simulate similarity score
                similarity = 0.7 + (hash(verification_data + template_id) % 30) / 100

                if similarity >= self._config.min_confidence:
                    results.append({
                        "template_id": template_id,
                        "agent_id": template.agent_id,
                        "similarity": similarity,
                        "created_at": template.created_at
                    })

            results.sort(key=lambda x: x["similarity"], reverse=True)
            return results[:limit]

    def delete_template(self, template_id: str) -> bool:
        """Delete face template."""
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

    def get_template(self, template_id: str) -> Optional[FaceTemplate]:
        """Get face template."""
        with self._lock:
            return self._templates.get(template_id)

    def get_agent_templates(self, agent_id: str) -> List[FaceTemplate]:
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
        status: FaceStatus = None,
        limit: int = 100
    ) -> List[FaceVerification]:
        """Get verification records."""
        with self._lock:
            verifications = self._verifications

            if agent_id:
                verifications = [v for v in verifications if v.agent_id == agent_id]
            if status:
                verifications = [v for v in verifications if v.status == status]

            return verifications[-limit:]

    def get_stats(self) -> Dict[str, Any]:
        """Get face recognition statistics."""
        with self._lock:
            total = len(self._verifications)
            verified = sum(1 for v in self._verifications if v.status == FaceStatus.VERIFIED)
            failed = sum(1 for v in self._verifications if v.status == FaceStatus.FAILED)

            return {
                "total_templates": len(self._templates),
                "total_verifications": total,
                "verified": verified,
                "failed": failed,
                "success_rate": verified / total if total > 0 else 0
            }

    def update_config(
        self,
        min_confidence: float = None,
        liveness_threshold: float = None,
        template_expiry: int = None,
        max_retries: int = None,
        enable_liveness: bool = None,
        detection_model: str = None
    ):
        """Update face configuration."""
        with self._lock:
            if min_confidence is not None:
                self._config.min_confidence = min_confidence
            if liveness_threshold is not None:
                self._config.liveness_threshold = liveness_threshold
            if template_expiry is not None:
                self._config.template_expiry = template_expiry
            if max_retries is not None:
                self._config.max_retries = max_retries
            if enable_liveness is not None:
                self._config.enable_liveness = enable_liveness
            if detection_model is not None:
                self._config.detection_model = detection_model

    def get_config(self) -> FaceConfig:
        """Get face configuration."""
        return self._config


class AgentFace:
    """Agent face recognition handling system."""

    def __init__(self, config: FaceConfig = None):
        self._manager = FaceManager(config)

    def enroll(
        self,
        agent_id: str,
        template_data: str,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Enroll face template."""
        template = self._manager.enroll(agent_id, template_data, metadata)
        return {
            "template_id": template.id,
            "agent_id": template.agent_id,
            "created_at": template.created_at,
            "expires_at": template.expires_at
        }

    def verify(
        self,
        agent_id: str,
        verification_data: str,
        liveness_score: float = 0.0,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Verify face."""
        verification = self._manager.verify(
            agent_id, verification_data, liveness_score, metadata
        )
        return {
            "verification_id": verification.id,
            "agent_id": verification.agent_id,
            "status": verification.status.value,
            "confidence": verification.confidence,
            "liveness_score": verification.liveness_score,
            "created_at": verification.created_at
        }

    def search(
        self,
        verification_data: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search for matching face."""
        return self._manager.search(verification_data, limit)

    def delete_template(self, template_id: str) -> bool:
        """Delete face template."""
        return self._manager.delete_template(template_id)

    def delete_agent_templates(self, agent_id: str) -> int:
        """Delete all templates for an agent."""
        return self._manager.delete_agent_templates(agent_id)

    def get_template(self, template_id: str) -> Optional[Dict[str, Any]]:
        """Get face template."""
        template = self._manager.get_template(template_id)
        if not template:
            return None
        return {
            "id": template.id,
            "agent_id": template.agent_id,
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
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get verification records."""
        status_enum = FaceStatus(status) if status else None
        verifications = self._manager.get_verifications(agent_id, status_enum, limit)
        return [
            {
                "id": v.id,
                "agent_id": v.agent_id,
                "action": v.action.value,
                "status": v.status.value,
                "confidence": v.confidence,
                "liveness_score": v.liveness_score,
                "created_at": v.created_at,
                "metadata": v.metadata
            }
            for v in verifications
        ]

    def get_stats(self) -> Dict[str, Any]:
        """Get face recognition statistics."""
        return self._manager.get_stats()

    def update_config(
        self,
        min_confidence: float = None,
        liveness_threshold: float = None,
        template_expiry: int = None,
        max_retries: int = None,
        enable_liveness: bool = None,
        detection_model: str = None
    ) -> Dict[str, Any]:
        """Update face configuration."""
        self._manager.update_config(
            min_confidence=min_confidence,
            liveness_threshold=liveness_threshold,
            template_expiry=template_expiry,
            max_retries=max_retries,
            enable_liveness=enable_liveness,
            detection_model=detection_model
        )
        return self.get_config()

    def get_config(self) -> Dict[str, Any]:
        """Get face configuration."""
        config = self._manager.get_config()
        return {
            "min_confidence": config.min_confidence,
            "liveness_threshold": config.liveness_threshold,
            "template_expiry": config.template_expiry,
            "max_retries": config.max_retries,
            "enable_liveness": config.enable_liveness,
            "detection_model": config.detection_model
        }


# Global instance
agent_face = AgentFace()
