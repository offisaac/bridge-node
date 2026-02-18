"""Agent Antivirus Module

Antivirus and malware detection for agents including threat detection, signature matching,
behavioral analysis, quarantine management, and real-time protection.
"""
import time
import uuid
import threading
import hashlib
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class ThreatStatus(str, Enum):
    """Threat status types."""
    CLEAN = "clean"
    INFECTED = "infected"
    SUSPICIOUS = "suspicious"
    QUARANTINED = "quarantined"
    BLOCKED = "blocked"
    UNKNOWN = "unknown"


class ThreatSeverity(str, Enum):
    """Threat severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class ScanType(str, Enum):
    """Scan type types."""
    QUICK = "quick"
    FULL = "full"
    CUSTOM = "custom"
    REAL_TIME = "real_time"
    SCHEDULED = "scheduled"


class ScanStatus(str, Enum):
    """Scan status types."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


@dataclass
class ThreatSignature:
    """Threat signature data."""
    id: str
    name: str
    signature_hash: str
    threat_type: str
    severity: ThreatSeverity
    created_at: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DetectedThreat:
    """Detected threat record."""
    id: str
    file_path: str
    threat_name: str
    threat_type: str
    severity: ThreatSeverity
    status: ThreatStatus
    detected_at: float
    quarantined: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ScanResult:
    """Scan result record."""
    id: str
    scan_type: ScanType
    status: ScanStatus
    started_at: float
    completed_at: float = 0.0
    files_scanned: int = 0
    threats_found: int = 0
    threats_detected: List[Dict] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class QuarantineItem:
    """Quarantine item record."""
    id: str
    original_path: str
    threat_name: str
    quarantined_at: float
    quarantined_by: str
    status: str = "quarantined"
    notes: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AntivirusConfig:
    """Antivirus configuration."""
    real_time_protection: bool = True
    scan_on_access: bool = True
    quarantine_enabled: bool = True
    auto_update: bool = True
    max_quarantine_size: int = 1000
    scan_timeout: int = 300
    exclude_paths: List[str] = field(default_factory=list)


class AntivirusManager:
    """Antivirus management engine."""

    def __init__(self, config: AntivirusConfig = None):
        self._lock = threading.RLock()
        self._config = config or AntivirusConfig()
        self._signatures: Dict[str, ThreatSignature] = {}
        self._threats: List[DetectedThreat] = []
        self._scans: List[ScanResult] = []
        self._quarantine: Dict[str, QuarantineItem] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._scan_in_progress = False

    def add_signature(
        self,
        name: str,
        signature_hash: str,
        threat_type: str,
        severity: str,
        metadata: Dict[str, Any] = None
    ) -> ThreatSignature:
        """Add threat signature."""
        with self._lock:
            signature = ThreatSignature(
                id=str(uuid.uuid4())[:12],
                name=name,
                signature_hash=signature_hash,
                threat_type=threat_type,
                severity=ThreatSeverity(severity),
                created_at=time.time(),
                metadata=metadata or {}
            )
            self._signatures[signature.id] = signature
            return signature

    def get_signature(self, signature_id: str) -> Optional[ThreatSignature]:
        """Get threat signature."""
        with self._lock:
            return self._signatures.get(signature_id)

    def get_signatures(self, threat_type: str = None) -> List[ThreatSignature]:
        """Get threat signatures."""
        with self._lock:
            signatures = list(self._signatures.values())
            if threat_type:
                signatures = [s for s in signatures if s.threat_type == threat_type]
            return signatures

    def scan_file(
        self,
        file_path: str,
        file_content: str = None
    ) -> DetectedThreat:
        """Scan a file for threats."""
        with self._lock:
            # Calculate file hash
            file_hash = hashlib.sha256((file_content or "").encode()).hexdigest()

            # Check against signatures
            for signature in self._signatures.values():
                if signature.signature_hash == file_hash:
                    threat = DetectedThreat(
                        id=str(uuid.uuid4())[:12],
                        file_path=file_path,
                        threat_name=signature.name,
                        threat_type=signature.threat_type,
                        severity=signature.severity,
                        status=ThreatStatus.INFECTED,
                        detected_at=time.time()
                    )
                    self._threats.append(threat)

                    # Quarantine if enabled
                    if self._config.quarantine_enabled:
                        self._quarantine_item(threat, file_path)

                    # Run hooks
                    for hook in self._hooks.get("threat_detected", []):
                        try:
                            hook(threat)
                        except Exception:
                            pass

                    return threat

            # No threat found
            return DetectedThreat(
                id=str(uuid.uuid4())[:12],
                file_path=file_path,
                threat_name="Clean",
                threat_type="none",
                severity=ThreatSeverity.INFO,
                status=ThreatStatus.CLEAN,
                detected_at=time.time()
            )

    def _quarantine_item(self, threat: DetectedThreat, original_path: str):
        """Quarantine infected file."""
        item = QuarantineItem(
            id=str(uuid.uuid4())[:12],
            original_path=original_path,
            threat_name=threat.threat_name,
            quarantined_at=time.time(),
            quarantined_by="system"
        )
        self._quarantine[item.id] = item
        threat.quarantined = True

    def start_scan(
        self,
        scan_type: str,
        file_paths: List[str] = None
    ) -> ScanResult:
        """Start a scan."""
        with self._lock:
            if self._scan_in_progress:
                return None

            scan = ScanResult(
                id=str(uuid.uuid4())[:12],
                scan_type=ScanType(scan_type),
                status=ScanStatus.RUNNING,
                started_at=time.time()
            )
            self._scans.append(scan)
            self._scan_in_progress = True

            # Simulate scan
            scan.files_scanned = len(file_paths) if file_paths else 0

            # Check for threats in files
            if file_paths:
                for path in file_paths:
                    threat = self.scan_file(path)
                    if threat.status != ThreatStatus.CLEAN:
                        scan.threats_detected.append({
                            "id": threat.id,
                            "file_path": threat.file_path,
                            "threat_name": threat.threat_name,
                            "severity": threat.severity.value
                        })
                        scan.threats_found += 1

            # Complete scan
            scan.status = ScanStatus.COMPLETED
            scan.completed_at = time.time()
            self._scan_in_progress = False

            return scan

    def get_scan(self, scan_id: str) -> Optional[ScanResult]:
        """Get scan result."""
        with self._lock:
            for scan in self._scans:
                if scan.id == scan_id:
                    return scan
            return None

    def get_scans(
        self,
        status: ScanStatus = None,
        limit: int = 100
    ) -> List[ScanResult]:
        """Get scan results."""
        with self._lock:
            scans = self._scans
            if status:
                scans = [s for s in scans if s.status == status]
            return scans[-limit:]

    def get_threats(
        self,
        status: ThreatStatus = None,
        severity: ThreatSeverity = None,
        limit: int = 100
    ) -> List[DetectedThreat]:
        """Get detected threats."""
        with self._lock:
            threats = self._threats
            if status:
                threats = [t for t in threats if t.status == status]
            if severity:
                threats = [t for t in threats if t.severity == severity]
            return threats[-limit:]

    def get_quarantine(self, limit: int = 100) -> List[QuarantineItem]:
        """Get quarantine items."""
        with self._lock:
            items = list(self._quarantine.values())
            return items[:limit]

    def restore_from_quarantine(self, item_id: str) -> bool:
        """Restore item from quarantine."""
        with self._lock:
            if item_id in self._quarantine:
                del self._quarantine[item_id]
                return True
            return False

    def delete_quarantine_item(self, item_id: str) -> bool:
        """Delete quarantine item permanently."""
        with self._lock:
            if item_id in self._quarantine:
                del self._quarantine[item_id]
                return True
            return False

    def get_stats(self) -> Dict[str, Any]:
        """Get antivirus statistics."""
        with self._lock:
            total_threats = len(self._threats)
            by_status = defaultdict(int)
            by_severity = defaultdict(int)

            for t in self._threats:
                by_status[t.status.value] += 1
                by_severity[t.severity.value] += 1

            return {
                "total_signatures": len(self._signatures),
                "total_threats": total_threats,
                "total_scans": len(self._scans),
                "quarantine_size": len(self._quarantine),
                "by_status": dict(by_status),
                "by_severity": dict(by_severity),
                "scan_in_progress": self._scan_in_progress
            }

    def update_config(
        self,
        real_time_protection: bool = None,
        scan_on_access: bool = None,
        quarantine_enabled: bool = None,
        auto_update: bool = None,
        max_quarantine_size: int = None,
        scan_timeout: int = None,
        exclude_paths: List[str] = None
    ):
        """Update antivirus configuration."""
        with self._lock:
            if real_time_protection is not None:
                self._config.real_time_protection = real_time_protection
            if scan_on_access is not None:
                self._config.scan_on_access = scan_on_access
            if quarantine_enabled is not None:
                self._config.quarantine_enabled = quarantine_enabled
            if auto_update is not None:
                self._config.auto_update = auto_update
            if max_quarantine_size is not None:
                self._config.max_quarantine_size = max_quarantine_size
            if scan_timeout is not None:
                self._config.scan_timeout = scan_timeout
            if exclude_paths is not None:
                self._config.exclude_paths = exclude_paths

    def get_config(self) -> AntivirusConfig:
        """Get antivirus configuration."""
        return self._config


class AgentAntivirus:
    """Agent antivirus handling system."""

    def __init__(self, config: AntivirusConfig = None):
        self._manager = AntivirusManager(config)

    def add_signature(
        self,
        name: str,
        signature_hash: str,
        threat_type: str,
        severity: str,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Add threat signature."""
        signature = self._manager.add_signature(name, signature_hash, threat_type, severity, metadata)
        return {
            "id": signature.id,
            "name": signature.name,
            "threat_type": signature.threat_type,
            "severity": signature.severity.value,
            "created_at": signature.created_at
        }

    def get_signature(self, signature_id: str) -> Optional[Dict[str, Any]]:
        """Get threat signature."""
        signature = self._manager.get_signature(signature_id)
        if not signature:
            return None
        return {
            "id": signature.id,
            "name": signature.name,
            "signature_hash": signature.signature_hash,
            "threat_type": signature.threat_type,
            "severity": signature.severity.value,
            "created_at": signature.created_at,
            "metadata": signature.metadata
        }

    def get_signatures(self, threat_type: str = None) -> List[Dict[str, Any]]:
        """Get threat signatures."""
        signatures = self._manager.get_signatures(threat_type)
        return [
            {
                "id": s.id,
                "name": s.name,
                "threat_type": s.threat_type,
                "severity": s.severity.value,
                "created_at": s.created_at
            }
            for s in signatures
        ]

    def scan_file(self, file_path: str, file_content: str = None) -> Dict[str, Any]:
        """Scan a file for threats."""
        threat = self._manager.scan_file(file_path, file_content)
        return {
            "id": threat.id,
            "file_path": threat.file_path,
            "threat_name": threat.threat_name,
            "threat_type": threat.threat_type,
            "severity": threat.severity.value,
            "status": threat.status.value,
            "detected_at": threat.detected_at,
            "quarantined": threat.quarantined
        }

    def start_scan(
        self,
        scan_type: str,
        file_paths: List[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Start a scan."""
        scan = self._manager.start_scan(scan_type, file_paths)
        if not scan:
            return {"error": "Scan already in progress"}
        return {
            "id": scan.id,
            "scan_type": scan.scan_type.value,
            "status": scan.status.value,
            "started_at": scan.started_at,
            "completed_at": scan.completed_at,
            "files_scanned": scan.files_scanned,
            "threats_found": scan.threats_found,
            "threats_detected": scan.threats_detected
        }

    def get_scan(self, scan_id: str) -> Optional[Dict[str, Any]]:
        """Get scan result."""
        scan = self._manager.get_scan(scan_id)
        if not scan:
            return None
        return {
            "id": scan.id,
            "scan_type": scan.scan_type.value,
            "status": scan.status.value,
            "started_at": scan.started_at,
            "completed_at": scan.completed_at,
            "files_scanned": scan.files_scanned,
            "threats_found": scan.threats_found,
            "threats_detected": scan.threats_detected
        }

    def get_scans(
        self,
        status: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get scan results."""
        status_enum = ScanStatus(status) if status else None
        scans = self._manager.get_scans(status_enum, limit)
        return [
            {
                "id": s.id,
                "scan_type": s.scan_type.value,
                "status": s.status.value,
                "started_at": s.started_at,
                "completed_at": s.completed_at,
                "files_scanned": s.files_scanned,
                "threats_found": s.threats_found
            }
            for s in scans
        ]

    def get_threats(
        self,
        status: str = None,
        severity: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get detected threats."""
        status_enum = ThreatStatus(status) if status else None
        severity_enum = ThreatSeverity(severity) if severity else None
        threats = self._manager.get_threats(status_enum, severity_enum, limit)
        return [
            {
                "id": t.id,
                "file_path": t.file_path,
                "threat_name": t.threat_name,
                "threat_type": t.threat_type,
                "severity": t.severity.value,
                "status": t.status.value,
                "detected_at": t.detected_at,
                "quarantined": t.quarantined
            }
            for t in threats
        ]

    def get_quarantine(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get quarantine items."""
        items = self._manager.get_quarantine(limit)
        return [
            {
                "id": i.id,
                "original_path": i.original_path,
                "threat_name": i.threat_name,
                "quarantined_at": i.quarantined_at,
                "status": i.status
            }
            for i in items
        ]

    def restore_from_quarantine(self, item_id: str) -> bool:
        """Restore item from quarantine."""
        return self._manager.restore_from_quarantine(item_id)

    def delete_quarantine_item(self, item_id: str) -> bool:
        """Delete quarantine item permanently."""
        return self._manager.delete_quarantine_item(item_id)

    def get_stats(self) -> Dict[str, Any]:
        """Get antivirus statistics."""
        return self._manager.get_stats()

    def update_config(
        self,
        real_time_protection: bool = None,
        scan_on_access: bool = None,
        quarantine_enabled: bool = None,
        auto_update: bool = None,
        max_quarantine_size: int = None,
        scan_timeout: int = None,
        exclude_paths: List[str] = None
    ) -> Dict[str, Any]:
        """Update antivirus configuration."""
        self._manager.update_config(
            real_time_protection=real_time_protection,
            scan_on_access=scan_on_access,
            quarantine_enabled=quarantine_enabled,
            auto_update=auto_update,
            max_quarantine_size=max_quarantine_size,
            scan_timeout=scan_timeout,
            exclude_paths=exclude_paths
        )
        return self.get_config()

    def get_config(self) -> Dict[str, Any]:
        """Get antivirus configuration."""
        config = self._manager.get_config()
        return {
            "real_time_protection": config.real_time_protection,
            "scan_on_access": config.scan_on_access,
            "quarantine_enabled": config.quarantine_enabled,
            "auto_update": config.auto_update,
            "max_quarantine_size": config.max_quarantine_size,
            "scan_timeout": config.scan_timeout,
            "exclude_paths": config.exclude_paths
        }


# Global instance
agent_antivirus = AgentAntivirus()
