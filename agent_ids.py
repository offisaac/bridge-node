"""Agent IDS Module

Intrusion Detection System for agents including threat detection, signature matching,
alert management, traffic analysis, and real-time monitoring.
"""
import time
import uuid
import threading
import hashlib
import re
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class IDSMType(str, Enum):
    """IDS type types."""
    NETWORK = "network"
    HOST = "host"
    HYBRID = "hybrid"
    BEHAVIORAL = "behavioral"


class AlertSeverity(str, Enum):
    """Alert severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class AlertStatus(str, Enum):
    """Alert status types."""
    NEW = "new"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    FALSE_POSITIVE = "false_positive"


class SignatureStatus(str, Enum):
    """Signature status types."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    TESTING = "testing"


class AttackCategory(str, Enum):
    """Attack category types."""
    PORT_SCAN = "port_scan"
    DOS = "dos"
    DDOS = "ddos"
    MALWARE = "malware"
    EXPLOIT = "exploit"
    BRUTE_FORCE = "brute_force"
    INJECTION = "injection"
    PRIVILEGE_ESCALATION = "privilege_escalation"
    LATERAL_MOVEMENT = "lateral_movement"
    DATA_EXFILTRATION = "data_exfiltration"
    ZERO_DAY = "zero_day"
    UNKNOWN = "unknown"


@dataclass
class IDSSignature:
    """IDS signature data."""
    id: str
    name: str
    pattern: str
    attack_category: AttackCategory
    severity: AlertSeverity
    status: SignatureStatus
    created_at: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class NetworkFlow:
    """Network flow data."""
    id: str
    source_ip: str
    destination_ip: str
    source_port: int
    destination_port: int
    protocol: str
    bytes_sent: int
    bytes_received: int
    packets: int
    duration: float
    timestamp: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class IDSAlert:
    """IDS alert data."""
    id: str
    signature_id: str
    signature_name: str
    attack_category: AttackCategory
    severity: AlertSeverity
    status: AlertStatus
    source_ip: str
    destination_ip: str
    description: str
    timestamp: float
    acknowledged_at: float = 0.0
    resolved_at: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class IDSConfig:
    """IDS configuration."""
    ids_type: IDSMType = IDSMType.HYBRID
    enable_network_monitoring: bool = True
    enable_host_monitoring: bool = True
    enable_behavioral_analysis: bool = True
    alert_threshold: int = 1
    auto_acknowledge: bool = False
    retention_days: int = 30
    enable_auto_block: bool = False
    block_duration: int = 3600  # seconds


class IDSManager:
    """IDS management engine."""

    def __init__(self, config: IDSConfig = None):
        self._lock = threading.RLock()
        self._config = config or IDSConfig()
        self._signatures: Dict[str, IDSSignature] = {}
        self._alerts: List[IDSAlert] = []
        self._flows: Dict[str, NetworkFlow] = {}
        self._ip_activity: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"connections": 0, "alerts": 0, "first_seen": 0, "last_seen": 0})
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._compile_patterns()

    def _compile_patterns(self):
        """Compile default attack patterns."""
        self._patterns = {
            AttackCategory.PORT_SCAN: [
                r"(?i)port\s+\d+\s+open",
                r"(?i)scanning\s+\d+\s+ports",
                r"(?i)nmap\s+-",
            ],
            AttackCategory.DOS: [
                r"(?i)multiple\s+connections\s+from\s+same\s+ip",
                r"(?i)connection\s+refused\s+flood",
                r"(?i)syn\s+flood",
            ],
            AttackCategory.BRUTE_FORCE: [
                r"(?i)failed\s+login.*\d+\s+times",
                r"(?i)authentication\s+failure",
                r"(?i)invalid\s+password.*\d+",
            ],
            AttackCategory.INJECTION: [
                r"(?i)<script[^>]*>.*?</script>",
                r"(?i)union\s+select",
                r"(?i)../",
            ],
            AttackCategory.MALWARE: [
                r"(?i)malicious\s+executable",
                r"(?i)virus\s+detected",
                r"(?i)trojan",
            ],
        }

    def add_signature(
        self,
        name: str,
        pattern: str,
        attack_category: str,
        severity: str,
        metadata: Dict[str, Any] = None
    ) -> IDSSignature:
        """Add IDS signature."""
        with self._lock:
            signature = IDSSignature(
                id=str(uuid.uuid4())[:12],
                name=name,
                pattern=pattern,
                attack_category=AttackCategory(attack_category),
                severity=AlertSeverity(severity),
                status=SignatureStatus.ACTIVE,
                created_at=time.time(),
                metadata=metadata or {}
            )
            self._signatures[signature.id] = signature
            return signature

    def get_signature(self, signature_id: str) -> Optional[IDSSignature]:
        """Get IDS signature."""
        with self._lock:
            return self._signatures.get(signature_id)

    def get_signatures(
        self,
        attack_category: str = None,
        status: str = None,
        limit: int = 100
    ) -> List[IDSSignature]:
        """Get IDS signatures."""
        with self._lock:
            signatures = list(self._signatures.values())
            if attack_category:
                signatures = [s for s in signatures if s.attack_category.value == attack_category]
            if status:
                signatures = [s for s in signatures if s.status.value == status]
            return signatures[:limit]

    def update_signature(
        self,
        signature_id: str,
        name: str = None,
        pattern: str = None,
        attack_category: str = None,
        severity: str = None,
        status: str = None
    ) -> Optional[IDSSignature]:
        """Update IDS signature."""
        with self._lock:
            signature = self._signatures.get(signature_id)
            if not signature:
                return None

            if name is not None:
                signature.name = name
            if pattern is not None:
                signature.pattern = pattern
            if attack_category is not None:
                signature.attack_category = AttackCategory(attack_category)
            if severity is not None:
                signature.severity = AlertSeverity(severity)
            if status is not None:
                signature.status = SignatureStatus(status)

            return signature

    def delete_signature(self, signature_id: str) -> bool:
        """Delete IDS signature."""
        with self._lock:
            if signature_id in self._signatures:
                del self._signatures[signature_id]
                return True
            return False

    def record_flow(
        self,
        source_ip: str,
        destination_ip: str,
        source_port: int,
        destination_port: int,
        protocol: str,
        bytes_sent: int = 0,
        bytes_received: int = 0,
        packets: int = 0,
        duration: float = 0.0,
        metadata: Dict[str, Any] = None
    ) -> NetworkFlow:
        """Record network flow."""
        with self._lock:
            flow = NetworkFlow(
                id=str(uuid.uuid4())[:12],
                source_ip=source_ip,
                destination_ip=destination_ip,
                source_port=source_port,
                destination_port=destination_port,
                protocol=protocol,
                bytes_sent=bytes_sent,
                bytes_received=bytes_received,
                packets=packets,
                duration=duration,
                timestamp=time.time(),
                metadata=metadata or {}
            )
            self._flows[flow.id] = flow

            # Update IP activity
            for ip in [source_ip, destination_ip]:
                activity = self._ip_activity[ip]
                if activity["first_seen"] == 0:
                    activity["first_seen"] = time.time()
                activity["last_seen"] = time.time()
                activity["connections"] += 1

            # Keep only last 10000 flows
            if len(self._flows) > 10000:
                oldest = sorted(self._flows.items(), key=lambda x: x[1].timestamp)[:1000]
                for fid, _ in oldest:
                    del self._flows[fid]

            return flow

    def get_flow(self, flow_id: str) -> Optional[NetworkFlow]:
        """Get network flow."""
        with self._lock:
            return self._flows.get(flow_id)

    def get_flows(
        self,
        source_ip: str = None,
        destination_ip: str = None,
        limit: int = 100
    ) -> List[NetworkFlow]:
        """Get network flows."""
        with self._lock:
            flows = list(self._flows.values())
            if source_ip:
                flows = [f for f in flows if f.source_ip == source_ip]
            if destination_ip:
                flows = [f for f in flows if f.destination_ip == destination_ip]
            return flows[-limit:]

    def analyze_flow(
        self,
        source_ip: str,
        destination_ip: str,
        source_port: int,
        destination_port: int,
        protocol: str,
        payload: str = ""
    ) -> List[IDSAlert]:
        """Analyze network flow for threats."""
        with self._lock:
            alerts = []
            current_time = time.time()

            # Check against patterns
            combined_content = f"{source_ip}:{source_port} {destination_ip}:{destination_port} {payload}"

            for signature in self._signatures.values():
                if signature.status != SignatureStatus.ACTIVE:
                    continue

                try:
                    if re.search(signature.pattern, combined_content, re.IGNORECASE):
                        alert = IDSAlert(
                            id=str(uuid.uuid4())[:12],
                            signature_id=signature.id,
                            signature_name=signature.name,
                            attack_category=signature.attack_category,
                            severity=signature.severity,
                            status=AlertStatus.NEW,
                            source_ip=source_ip,
                            destination_ip=destination_ip,
                            description=f"Detected {signature.name}",
                            timestamp=current_time
                        )
                        self._alerts.append(alert)
                        alerts.append(alert)

                        # Update IP activity
                        activity = self._ip_activity[source_ip]
                        activity["alerts"] += 1

                        # Run hooks
                        for hook in self._hooks.get("alert", []):
                            try:
                                hook(alert)
                            except Exception:
                                pass
                except re.error:
                    pass

            # Check for suspicious patterns
            activity = self._ip_activity.get(source_ip, {})
            connections = activity.get("connections", 0)

            # Detect potential port scan
            if connections > 50:
                alert = IDSAlert(
                    id=str(uuid.uuid4())[:12],
                    signature_id="",
                    signature_name="Potential Port Scan",
                    attack_category=AttackCategory.PORT_SCAN,
                    severity=AlertSeverity.MEDIUM,
                    status=AlertStatus.NEW,
                    source_ip=source_ip,
                    destination_ip=destination_ip,
                    description=f"High connection count from {source_ip}: {connections} connections",
                    timestamp=current_time
                )
                self._alerts.append(alert)
                alerts.append(alert)

            # Keep only last 5000 alerts
            if len(self._alerts) > 5000:
                self._alerts = self._alerts[-2500:]

            return alerts

    def get_alerts(
        self,
        severity: str = None,
        status: str = None,
        attack_category: str = None,
        limit: int = 100
    ) -> List[IDSAlert]:
        """Get IDS alerts."""
        with self._lock:
            alerts = self._alerts
            if severity:
                alerts = [a for a in alerts if a.severity.value == severity]
            if status:
                alerts = [a for a in alerts if a.status.value == status]
            if attack_category:
                alerts = [a for a in alerts if a.attack_category.value == attack_category]
            return alerts[-limit:]

    def get_alert(self, alert_id: str) -> Optional[IDSAlert]:
        """Get IDS alert by ID."""
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id:
                    return alert
            return None

    def acknowledge_alert(self, alert_id: str) -> bool:
        """Acknowledge IDS alert."""
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id:
                    alert.status = AlertStatus.ACKNOWLEDGED
                    alert.acknowledged_at = time.time()
                    return True
            return False

    def resolve_alert(self, alert_id: str) -> bool:
        """Resolve IDS alert."""
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id:
                    alert.status = AlertStatus.RESOLVED
                    alert.resolved_at = time.time()
                    return True
            return False

    def mark_false_positive(self, alert_id: str) -> bool:
        """Mark alert as false positive."""
        with self._lock:
            for alert in self._alerts:
                if alert.id == alert_id:
                    alert.status = AlertStatus.FALSE_POSITIVE
                    return True
            return False

    def get_ip_activity(self, ip: str = None, limit: int = 100) -> List[Dict[str, Any]]:
        """Get IP activity."""
        with self._lock:
            if ip:
                activity = self._ip_activity.get(ip, {})
                return [{"ip": ip, **activity}]
            else:
                sorted_activity = sorted(
                    self._ip_activity.items(),
                    key=lambda x: x[1]["alerts"],
                    reverse=True
                )[:limit]
                return [{"ip": ip, **activity} for ip, activity in sorted_activity]

    def get_stats(self) -> Dict[str, Any]:
        """Get IDS statistics."""
        with self._lock:
            total_alerts = len(self._alerts)
            by_severity = defaultdict(int)
            by_status = defaultdict(int)
            by_category = defaultdict(int)

            for alert in self._alerts:
                by_severity[alert.severity.value] += 1
                by_status[alert.status.value] += 1
                by_category[alert.attack_category.value] += 1

            return {
                "total_signatures": len(self._signatures),
                "active_signatures": sum(1 for s in self._signatures.values() if s.status == SignatureStatus.ACTIVE),
                "total_alerts": total_alerts,
                "new_alerts": sum(1 for a in self._alerts if a.status == AlertStatus.NEW),
                "by_severity": dict(by_severity),
                "by_status": dict(by_status),
                "by_category": dict(by_category),
                "total_flows": len(self._flows),
                "unique_ips": len(self._ip_activity),
                "ids_type": self._config.ids_type.value
            }

    def update_config(
        self,
        ids_type: str = None,
        enable_network_monitoring: bool = None,
        enable_host_monitoring: bool = None,
        enable_behavioral_analysis: bool = None,
        alert_threshold: int = None,
        auto_acknowledge: bool = None,
        retention_days: int = None,
        enable_auto_block: bool = None,
        block_duration: int = None
    ):
        """Update IDS configuration."""
        with self._lock:
            if ids_type is not None:
                self._config.ids_type = IDSMType(ids_type)
            if enable_network_monitoring is not None:
                self._config.enable_network_monitoring = enable_network_monitoring
            if enable_host_monitoring is not None:
                self._config.enable_host_monitoring = enable_host_monitoring
            if enable_behavioral_analysis is not None:
                self._config.enable_behavioral_analysis = enable_behavioral_analysis
            if alert_threshold is not None:
                self._config.alert_threshold = alert_threshold
            if auto_acknowledge is not None:
                self._config.auto_acknowledge = auto_acknowledge
            if retention_days is not None:
                self._config.retention_days = retention_days
            if enable_auto_block is not None:
                self._config.enable_auto_block = enable_auto_block
            if block_duration is not None:
                self._config.block_duration = block_duration

    def get_config(self) -> IDSConfig:
        """Get IDS configuration."""
        return self._config


class AgentIDS:
    """Agent IDS handling system."""

    def __init__(self, config: IDSConfig = None):
        self._manager = IDSManager(config)

    def add_signature(
        self,
        name: str,
        pattern: str,
        attack_category: str,
        severity: str,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Add IDS signature."""
        signature = self._manager.add_signature(name, pattern, attack_category, severity, metadata)
        return {
            "id": signature.id,
            "name": signature.name,
            "attack_category": signature.attack_category.value,
            "severity": signature.severity.value,
            "status": signature.status.value,
            "created_at": signature.created_at
        }

    def get_signature(self, signature_id: str) -> Optional[Dict[str, Any]]:
        """Get IDS signature."""
        signature = self._manager.get_signature(signature_id)
        if not signature:
            return None
        return {
            "id": signature.id,
            "name": signature.name,
            "pattern": signature.pattern,
            "attack_category": signature.attack_category.value,
            "severity": signature.severity.value,
            "status": signature.status.value,
            "created_at": signature.created_at,
            "metadata": signature.metadata
        }

    def get_signatures(
        self,
        attack_category: str = None,
        status: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get IDS signatures."""
        signatures = self._manager.get_signatures(attack_category, status, limit)
        return [
            {
                "id": s.id,
                "name": s.name,
                "attack_category": s.attack_category.value,
                "severity": s.severity.value,
                "status": s.status.value,
                "created_at": s.created_at
            }
            for s in signatures
        ]

    def update_signature(
        self,
        signature_id: str,
        name: str = None,
        pattern: str = None,
        attack_category: str = None,
        severity: str = None,
        status: str = None
    ) -> Optional[Dict[str, Any]]:
        """Update IDS signature."""
        signature = self._manager.update_signature(signature_id, name, pattern, attack_category, severity, status)
        if not signature:
            return None
        return {
            "id": signature.id,
            "name": signature.name,
            "attack_category": signature.attack_category.value,
            "severity": signature.severity.value,
            "status": signature.status.value,
            "created_at": signature.created_at
        }

    def delete_signature(self, signature_id: str) -> bool:
        """Delete IDS signature."""
        return self._manager.delete_signature(signature_id)

    def record_flow(
        self,
        source_ip: str,
        destination_ip: str,
        source_port: int,
        destination_port: int,
        protocol: str,
        bytes_sent: int = 0,
        bytes_received: int = 0,
        packets: int = 0,
        duration: float = 0.0,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Record network flow."""
        flow = self._manager.record_flow(
            source_ip, destination_ip, source_port, destination_port,
            protocol, bytes_sent, bytes_received, packets, duration, metadata
        )
        return {
            "id": flow.id,
            "source_ip": flow.source_ip,
            "destination_ip": flow.destination_ip,
            "source_port": flow.source_port,
            "destination_port": flow.destination_port,
            "protocol": flow.protocol,
            "timestamp": flow.timestamp
        }

    def get_flow(self, flow_id: str) -> Optional[Dict[str, Any]]:
        """Get network flow."""
        flow = self._manager.get_flow(flow_id)
        if not flow:
            return None
        return {
            "id": flow.id,
            "source_ip": flow.source_ip,
            "destination_ip": flow.destination_ip,
            "source_port": flow.source_port,
            "destination_port": flow.destination_port,
            "protocol": flow.protocol,
            "bytes_sent": flow.bytes_sent,
            "bytes_received": flow.bytes_received,
            "packets": flow.packets,
            "duration": flow.duration,
            "timestamp": flow.timestamp
        }

    def get_flows(
        self,
        source_ip: str = None,
        destination_ip: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get network flows."""
        flows = self._manager.get_flows(source_ip, destination_ip, limit)
        return [
            {
                "id": f.id,
                "source_ip": f.source_ip,
                "destination_ip": f.destination_ip,
                "source_port": f.source_port,
                "destination_port": f.destination_port,
                "protocol": f.protocol,
                "bytes_sent": f.bytes_sent,
                "bytes_received": f.bytes_received,
                "timestamp": f.timestamp
            }
            for f in flows
        ]

    def analyze_flow(
        self,
        source_ip: str,
        destination_ip: str,
        source_port: int,
        destination_port: int,
        protocol: str,
        payload: str = ""
    ) -> List[Dict[str, Any]]:
        """Analyze network flow for threats."""
        alerts = self._manager.analyze_flow(
            source_ip, destination_ip, source_port, destination_port, protocol, payload
        )
        return [
            {
                "id": a.id,
                "signature_name": a.signature_name,
                "attack_category": a.attack_category.value,
                "severity": a.severity.value,
                "status": a.status.value,
                "source_ip": a.source_ip,
                "destination_ip": a.destination_ip,
                "description": a.description,
                "timestamp": a.timestamp
            }
            for a in alerts
        ]

    def get_alerts(
        self,
        severity: str = None,
        status: str = None,
        attack_category: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get IDS alerts."""
        alerts = self._manager.get_alerts(severity, status, attack_category, limit)
        return [
            {
                "id": a.id,
                "signature_name": a.signature_name,
                "attack_category": a.attack_category.value,
                "severity": a.severity.value,
                "status": a.status.value,
                "source_ip": a.source_ip,
                "destination_ip": a.destination_ip,
                "description": a.description,
                "timestamp": a.timestamp,
                "acknowledged_at": a.acknowledged_at,
                "resolved_at": a.resolved_at
            }
            for a in alerts
        ]

    def get_alert(self, alert_id: str) -> Optional[Dict[str, Any]]:
        """Get IDS alert by ID."""
        alert = self._manager.get_alert(alert_id)
        if not alert:
            return None
        return {
            "id": alert.id,
            "signature_name": alert.signature_name,
            "attack_category": alert.attack_category.value,
            "severity": alert.severity.value,
            "status": alert.status.value,
            "source_ip": alert.source_ip,
            "destination_ip": alert.destination_ip,
            "description": alert.description,
            "timestamp": alert.timestamp,
            "acknowledged_at": alert.acknowledged_at,
            "resolved_at": alert.resolved_at
        }

    def acknowledge_alert(self, alert_id: str) -> bool:
        """Acknowledge IDS alert."""
        return self._manager.acknowledge_alert(alert_id)

    def resolve_alert(self, alert_id: str) -> bool:
        """Resolve IDS alert."""
        return self._manager.resolve_alert(alert_id)

    def mark_false_positive(self, alert_id: str) -> bool:
        """Mark alert as false positive."""
        return self._manager.mark_false_positive(alert_id)

    def get_ip_activity(
        self,
        ip: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get IP activity."""
        return self._manager.get_ip_activity(ip, limit)

    def get_stats(self) -> Dict[str, Any]:
        """Get IDS statistics."""
        return self._manager.get_stats()

    def update_config(
        self,
        ids_type: str = None,
        enable_network_monitoring: bool = None,
        enable_host_monitoring: bool = None,
        enable_behavioral_analysis: bool = None,
        alert_threshold: int = None,
        auto_acknowledge: bool = None,
        retention_days: int = None,
        enable_auto_block: bool = None,
        block_duration: int = None
    ) -> Dict[str, Any]:
        """Update IDS configuration."""
        self._manager.update_config(
            ids_type=ids_type,
            enable_network_monitoring=enable_network_monitoring,
            enable_host_monitoring=enable_host_monitoring,
            enable_behavioral_analysis=enable_behavioral_analysis,
            alert_threshold=alert_threshold,
            auto_acknowledge=auto_acknowledge,
            retention_days=retention_days,
            enable_auto_block=enable_auto_block,
            block_duration=block_duration
        )
        return self.get_config()

    def get_config(self) -> Dict[str, Any]:
        """Get IDS configuration."""
        config = self._manager.get_config()
        return {
            "ids_type": config.ids_type.value,
            "enable_network_monitoring": config.enable_network_monitoring,
            "enable_host_monitoring": config.enable_host_monitoring,
            "enable_behavioral_analysis": config.enable_behavioral_analysis,
            "alert_threshold": config.alert_threshold,
            "auto_acknowledge": config.auto_acknowledge,
            "retention_days": config.retention_days,
            "enable_auto_block": config.enable_auto_block,
            "block_duration": config.block_duration
        }


# Global instance
agent_ids = AgentIDS()
