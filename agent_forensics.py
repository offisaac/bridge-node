"""Agent Forensics Module

Digital forensics and incident investigation for agents including evidence collection,
chain of custody, forensic analysis, and investigation management.
"""
import time
import uuid
import threading
import hashlib
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class ForensicStatus(str, Enum):
    """Forensic investigation status."""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    EVIDENCE_COLLECTED = "evidence_collected"
    ANALYZING = "analyzing"
    COMPLETED = "completed"
    CLOSED = "closed"
    ARCHIVED = "archived"


class EvidenceType(str, Enum):
    """Evidence type types."""
    MEMORY = "memory"
    DISK = "disk"
    NETWORK = "network"
    LOG = "log"
    PROCESS = "process"
    FILE = "file"
    REGISTRY = "registry"
    METADATA = "metadata"
    TIMELINE = "timeline"
    ARTIFACT = "artifact"


class ForensicAction(str, Enum):
    """Forensic action types."""
    COLLECT = "collect"
    ANALYZE = "analyze"
    EXTRACT = "extract"
    HASH = "hash"
    CHAIN = "chain"
    EXPORT = "export"


class SeverityLevel(str, Enum):
    """Severity level for incidents."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


@dataclass
class Evidence:
    """Evidence data."""
    id: str
    case_id: str
    evidence_type: EvidenceType
    name: str
    description: str
    hash_value: str
    collected_at: float
    collected_by: str
    location: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)


@dataclass
class ChainOfCustody:
    """Chain of custody record."""
    id: str
    evidence_id: str
    action: str
    performed_by: str
    timestamp: float
    location: str
    notes: str
    hash_before: str = ""
    hash_after: str = ""


@dataclass
class ForensicCase:
    """Forensic case data."""
    id: str
    title: str
    description: str
    status: ForensicStatus
    severity: SeverityLevel
    created_at: float
    updated_at: float
    created_by: str
    assigned_to: str
    agent_id: str = ""
    incident_time: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)
    tags: List[str] = field(default_factory=list)


@dataclass
class ForensicAnalysis:
    """Forensic analysis record."""
    id: str
    case_id: str
    analysis_type: str
    findings: str
    conclusion: str
    confidence: float = 0.0
    created_at: float = 0.0
    analyzed_by: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ForensicConfig:
    """Forensic configuration."""
    evidence_retention_days: int = 90
    enable_chain_verification: bool = True
    hash_algorithm: str = "sha256"
    auto_collect_logs: bool = True
    max_evidence_size_mb: int = 1000
    enable_timeline: bool = True


class ForensicManager:
    """Forensic management engine."""

    def __init__(self, config: ForensicConfig = None):
        self._lock = threading.RLock()
        self._config = config or ForensicConfig()
        self._cases: Dict[str, ForensicCase] = {}
        self._evidence: Dict[str, Evidence] = {}
        self._case_evidence: Dict[str, List[str]] = defaultdict(list)
        self._custody: Dict[str, List[ChainOfCustody]] = defaultdict(list)
        self._analyses: Dict[str, List[ForensicAnalysis]] = defaultdict(list)
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def create_case(
        self,
        title: str,
        description: str,
        severity: str,
        created_by: str,
        assigned_to: str = None,
        agent_id: str = None,
        incident_time: float = None,
        metadata: Dict[str, Any] = None,
        tags: List[str] = None
    ) -> ForensicCase:
        """Create forensic case."""
        with self._lock:
            current_time = time.time()

            case = ForensicCase(
                id=str(uuid.uuid4())[:12],
                title=title,
                description=description,
                status=ForensicStatus.OPEN,
                severity=SeverityLevel(severity),
                created_at=current_time,
                updated_at=current_time,
                created_by=created_by,
                assigned_to=assigned_to or created_by,
                agent_id=agent_id or "",
                incident_time=incident_time or current_time,
                metadata=metadata or {},
                tags=tags or []
            )

            self._cases[case.id] = case

            # Run hooks
            for hook in self._hooks.get("case_created", []):
                try:
                    hook(case)
                except Exception:
                    pass

            return case

    def update_case(
        self,
        case_id: str,
        status: str = None,
        assigned_to: str = None,
        title: str = None,
        description: str = None,
        tags: List[str] = None
    ) -> Optional[ForensicCase]:
        """Update forensic case."""
        with self._lock:
            case = self._cases.get(case_id)
            if not case:
                return None

            if status:
                case.status = ForensicStatus(status)
            if assigned_to:
                case.assigned_to = assigned_to
            if title:
                case.title = title
            if description:
                case.description = description
            if tags:
                case.tags = tags

            case.updated_at = time.time()

            return case

    def get_case(self, case_id: str) -> Optional[ForensicCase]:
        """Get forensic case."""
        with self._lock:
            return self._cases.get(case_id)

    def get_cases(
        self,
        status: ForensicStatus = None,
        severity: SeverityLevel = None,
        assigned_to: str = None,
        limit: int = 100
    ) -> List[ForensicCase]:
        """Get forensic cases."""
        with self._lock:
            cases = list(self._cases.values())

            if status:
                cases = [c for c in cases if c.status == status]
            if severity:
                cases = [c for c in cases if c.severity == severity]
            if assigned_to:
                cases = [c for c in cases if c.assigned_to == assigned_to]

            cases.sort(key=lambda x: x.created_at, reverse=True)
            return cases[:limit]

    def add_evidence(
        self,
        case_id: str,
        evidence_type: str,
        name: str,
        description: str,
        data: str,
        collected_by: str,
        location: str,
        metadata: Dict[str, Any] = None,
        tags: List[str] = None
    ) -> Optional[Evidence]:
        """Add evidence to case."""
        with self._lock:
            case = self._cases.get(case_id)
            if not case:
                return None

            # Calculate hash
            hash_value = hashlib.sha256(data.encode()).hexdigest()

            evidence = Evidence(
                id=str(uuid.uuid4())[:12],
                case_id=case_id,
                evidence_type=EvidenceType(evidence_type),
                name=name,
                description=description,
                hash_value=hash_value,
                collected_at=time.time(),
                collected_by=collected_by,
                location=location,
                metadata=metadata or {},
                tags=tags or []
            )

            self._evidence[evidence.id] = evidence
            self._case_evidence[case_id].append(evidence.id)

            # Add chain of custody entry
            self._add_custody_entry(
                evidence.id,
                ForensicAction.COLLECT.value,
                collected_by,
                location,
                f"Evidence collected: {name}"
            )

            # Update case status
            case.status = ForensicStatus.EVIDENCE_COLLECTED
            case.updated_at = time.time()

            return evidence

    def _add_custody_entry(
        self,
        evidence_id: str,
        action: str,
        performed_by: str,
        location: str,
        notes: str,
        hash_before: str = "",
        hash_after: str = ""
    ):
        """Add chain of custody entry."""
        entry = ChainOfCustody(
            id=str(uuid.uuid4())[:12],
            evidence_id=evidence_id,
            action=action,
            performed_by=performed_by,
            timestamp=time.time(),
            location=location,
            notes=notes,
            hash_before=hash_before,
            hash_after=hash_after
        )
        self._custody[evidence_id].append(entry)

    def get_evidence(self, evidence_id: str) -> Optional[Evidence]:
        """Get evidence."""
        with self._lock:
            return self._evidence.get(evidence_id)

    def get_case_evidence(self, case_id: str) -> List[Evidence]:
        """Get evidence for case."""
        with self._lock:
            evidence_ids = self._case_evidence.get(case_id, [])
            return [self._evidence[eid] for eid in evidence_ids if eid in self._evidence]

    def get_custody_chain(self, evidence_id: str) -> List[ChainOfCustody]:
        """Get chain of custody for evidence."""
        with self._lock:
            return self._custody.get(evidence_id, [])

    def verify_chain(self, evidence_id: str) -> bool:
        """Verify chain of custody."""
        if not self._config.enable_chain_verification:
            return True

        custody = self._custody.get(evidence_id, [])
        if not custody:
            return False

        # Verify hash continuity
        for i in range(len(custody) - 1):
            current = custody[i]
            next_entry = custody[i + 1]
            if current.hash_after and current.hash_after != next_entry.hash_before:
                return False

        return True

    def add_analysis(
        self,
        case_id: str,
        analysis_type: str,
        findings: str,
        conclusion: str,
        analyzed_by: str,
        confidence: float = 0.0,
        metadata: Dict[str, Any] = None
    ) -> Optional[ForensicAnalysis]:
        """Add forensic analysis."""
        with self._lock:
            case = self._cases.get(case_id)
            if not case:
                return None

            analysis = ForensicAnalysis(
                id=str(uuid.uuid4())[:12],
                case_id=case_id,
                analysis_type=analysis_type,
                findings=findings,
                conclusion=conclusion,
                confidence=confidence,
                created_at=time.time(),
                analyzed_by=analyzed_by,
                metadata=metadata or {}
            )

            self._analyses[case_id].append(analysis)

            # Update case status
            case.status = ForensicStatus.ANALYZING
            case.updated_at = time.time()

            return analysis

    def get_case_analyses(self, case_id: str) -> List[ForensicAnalysis]:
        """Get analyses for case."""
        with self._lock:
            return self._analyses.get(case_id, [])

    def close_case(self, case_id: str, notes: str = None) -> Optional[ForensicCase]:
        """Close forensic case."""
        with self._lock:
            case = self._cases.get(case_id)
            if not case:
                return None

            case.status = ForensicStatus.CLOSED
            case.updated_at = time.time()

            if notes:
                case.metadata["close_notes"] = notes

            return case

    def get_stats(self) -> Dict[str, Any]:
        """Get forensic statistics."""
        with self._lock:
            total_cases = len(self._cases)
            by_status = defaultdict(int)
            by_severity = defaultdict(int)
            total_evidence = len(self._evidence)

            for c in self._cases.values():
                by_status[c.status.value] += 1
                by_severity[c.severity.value] += 1

            return {
                "total_cases": total_cases,
                "total_evidence": total_evidence,
                "by_status": dict(by_status),
                "by_severity": dict(by_severity)
            }

    def update_config(
        self,
        evidence_retention_days: int = None,
        enable_chain_verification: bool = None,
        hash_algorithm: str = None,
        auto_collect_logs: bool = None,
        max_evidence_size_mb: int = None,
        enable_timeline: bool = None
    ):
        """Update forensic configuration."""
        with self._lock:
            if evidence_retention_days is not None:
                self._config.evidence_retention_days = evidence_retention_days
            if enable_chain_verification is not None:
                self._config.enable_chain_verification = enable_chain_verification
            if hash_algorithm is not None:
                self._config.hash_algorithm = hash_algorithm
            if auto_collect_logs is not None:
                self._config.auto_collect_logs = auto_collect_logs
            if max_evidence_size_mb is not None:
                self._config.max_evidence_size_mb = max_evidence_size_mb
            if enable_timeline is not None:
                self._config.enable_timeline = enable_timeline

    def get_config(self) -> ForensicConfig:
        """Get forensic configuration."""
        return self._config


class AgentForensics:
    """Agent forensics handling system."""

    def __init__(self, config: ForensicConfig = None):
        self._manager = ForensicManager(config)

    def create_case(
        self,
        title: str,
        description: str,
        severity: str,
        created_by: str,
        assigned_to: str = None,
        agent_id: str = None,
        incident_time: float = None,
        metadata: Dict[str, Any] = None,
        tags: List[str] = None
    ) -> Dict[str, Any]:
        """Create forensic case."""
        case = self._manager.create_case(
            title, description, severity, created_by,
            assigned_to, agent_id, incident_time, metadata, tags
        )
        return {
            "id": case.id,
            "title": case.title,
            "description": case.description,
            "status": case.status.value,
            "severity": case.severity.value,
            "created_at": case.created_at,
            "updated_at": case.updated_at,
            "created_by": case.created_by,
            "assigned_to": case.assigned_to
        }

    def update_case(
        self,
        case_id: str,
        status: str = None,
        assigned_to: str = None,
        title: str = None,
        description: str = None,
        tags: List[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Update forensic case."""
        case = self._manager.update_case(case_id, status, assigned_to, title, description, tags)
        if not case:
            return None
        return {
            "id": case.id,
            "title": case.title,
            "status": case.status.value,
            "assigned_to": case.assigned_to,
            "updated_at": case.updated_at
        }

    def get_case(self, case_id: str) -> Optional[Dict[str, Any]]:
        """Get forensic case."""
        case = self._manager.get_case(case_id)
        if not case:
            return None
        return {
            "id": case.id,
            "title": case.title,
            "description": case.description,
            "status": case.status.value,
            "severity": case.severity.value,
            "created_at": case.created_at,
            "updated_at": case.updated_at,
            "created_by": case.created_by,
            "assigned_to": case.assigned_to,
            "agent_id": case.agent_id,
            "metadata": case.metadata,
            "tags": case.tags
        }

    def get_cases(
        self,
        status: str = None,
        severity: str = None,
        assigned_to: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get forensic cases."""
        status_enum = ForensicStatus(status) if status else None
        severity_enum = SeverityLevel(severity) if severity else None
        cases = self._manager.get_cases(status_enum, severity_enum, assigned_to, limit)
        return [
            {
                "id": c.id,
                "title": c.title,
                "status": c.status.value,
                "severity": c.severity.value,
                "created_at": c.created_at,
                "assigned_to": c.assigned_to
            }
            for c in cases
        ]

    def add_evidence(
        self,
        case_id: str,
        evidence_type: str,
        name: str,
        description: str,
        data: str,
        collected_by: str,
        location: str,
        metadata: Dict[str, Any] = None,
        tags: List[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Add evidence to case."""
        evidence = self._manager.add_evidence(
            case_id, evidence_type, name, description, data,
            collected_by, location, metadata, tags
        )
        if not evidence:
            return None
        return {
            "id": evidence.id,
            "case_id": evidence.case_id,
            "evidence_type": evidence.evidence_type.value,
            "name": evidence.name,
            "hash_value": evidence.hash_value,
            "collected_at": evidence.collected_at,
            "collected_by": evidence.collected_by,
            "location": evidence.location
        }

    def get_evidence(self, evidence_id: str) -> Optional[Dict[str, Any]]:
        """Get evidence."""
        evidence = self._manager.get_evidence(evidence_id)
        if not evidence:
            return None
        return {
            "id": evidence.id,
            "case_id": evidence.case_id,
            "evidence_type": evidence.evidence_type.value,
            "name": evidence.name,
            "description": evidence.description,
            "hash_value": evidence.hash_value,
            "collected_at": evidence.collected_at,
            "collected_by": evidence.collected_by,
            "location": evidence.location,
            "metadata": evidence.metadata,
            "tags": evidence.tags
        }

    def get_case_evidence(self, case_id: str) -> List[Dict[str, Any]]:
        """Get evidence for case."""
        evidence_list = self._manager.get_case_evidence(case_id)
        return [
            {
                "id": e.id,
                "evidence_type": e.evidence_type.value,
                "name": e.name,
                "hash_value": e.hash_value,
                "collected_at": e.collected_at,
                "collected_by": e.collected_by
            }
            for e in evidence_list
        ]

    def get_custody_chain(self, evidence_id: str) -> List[Dict[str, Any]]:
        """Get chain of custody for evidence."""
        custody = self._manager.get_custody_chain(evidence_id)
        return [
            {
                "id": c.id,
                "evidence_id": c.evidence_id,
                "action": c.action,
                "performed_by": c.performed_by,
                "timestamp": c.timestamp,
                "location": c.location,
                "notes": c.notes
            }
            for c in custody
        ]

    def verify_chain(self, evidence_id: str) -> bool:
        """Verify chain of custody."""
        return self._manager.verify_chain(evidence_id)

    def add_analysis(
        self,
        case_id: str,
        analysis_type: str,
        findings: str,
        conclusion: str,
        analyzed_by: str,
        confidence: float = 0.0,
        metadata: Dict[str, Any] = None
    ) -> Optional[Dict[str, Any]]:
        """Add forensic analysis."""
        analysis = self._manager.add_analysis(
            case_id, analysis_type, findings, conclusion,
            analyzed_by, confidence, metadata
        )
        if not analysis:
            return None
        return {
            "id": analysis.id,
            "case_id": analysis.case_id,
            "analysis_type": analysis.analysis_type,
            "findings": analysis.findings,
            "conclusion": analysis.conclusion,
            "confidence": analysis.confidence,
            "created_at": analysis.created_at,
            "analyzed_by": analysis.analyzed_by
        }

    def get_case_analyses(self, case_id: str) -> List[Dict[str, Any]]:
        """Get analyses for case."""
        analyses = self._manager.get_case_analyses(case_id)
        return [
            {
                "id": a.id,
                "case_id": a.case_id,
                "analysis_type": a.analysis_type,
                "findings": a.findings,
                "conclusion": a.conclusion,
                "confidence": a.confidence,
                "created_at": a.created_at,
                "analyzed_by": a.analyzed_by
            }
            for a in analyses
        ]

    def close_case(self, case_id: str, notes: str = None) -> Optional[Dict[str, Any]]:
        """Close forensic case."""
        case = self._manager.close_case(case_id, notes)
        if not case:
            return None
        return {
            "id": case.id,
            "status": case.status.value,
            "updated_at": case.updated_at
        }

    def get_stats(self) -> Dict[str, Any]:
        """Get forensic statistics."""
        return self._manager.get_stats()

    def update_config(
        self,
        evidence_retention_days: int = None,
        enable_chain_verification: bool = None,
        hash_algorithm: str = None,
        auto_collect_logs: bool = None,
        max_evidence_size_mb: int = None,
        enable_timeline: bool = None
    ) -> Dict[str, Any]:
        """Update forensic configuration."""
        self._manager.update_config(
            evidence_retention_days,
            enable_chain_verification,
            hash_algorithm,
            auto_collect_logs,
            max_evidence_size_mb,
            enable_timeline
        )
        return self.get_config()

    def get_config(self) -> Dict[str, Any]:
        """Get forensic configuration."""
        config = self._manager.get_config()
        return {
            "evidence_retention_days": config.evidence_retention_days,
            "enable_chain_verification": config.enable_chain_verification,
            "hash_algorithm": config.hash_algorithm,
            "auto_collect_logs": config.auto_collect_logs,
            "max_evidence_size_mb": config.max_evidence_size_mb,
            "enable_timeline": config.enable_timeline
        }


# Global instance
agent_forensics = AgentForensics()
