"""Agent Certification Module

Certification tracking system for agents including certification management,
expiration tracking, renewal reminders, and compliance status.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict



class CertificationType:
    """Certification types."""
    SECURITY = "security"
    COMPLIANCE = "compliance"
    TECHNICAL = "technical"
    PROFESSIONAL = "professional"
    VENDOR = "vendor"
    CUSTOM = "custom"


class CertificationStatus(str, Enum):
    """Certification status."""
    ACTIVE = "active"
    EXPIRED = "expired"
    PENDING_RENEWAL = "pending_renewal"
    REVOKED = "revoked"
    IN_PROGRESS = "in_progress"


class ComplianceLevel(str, Enum):
    """Compliance levels."""
    COMPLIANT = "compliant"
    NON_COMPLIANT = "non_compliant"
    PARTIALLY_COMPLIANT = "partially_compliant"
    PENDING_AUDIT = "pending_audit"


@dataclass
class Certification:
    """Certification record."""
    id: str
    name: str
    cert_type: CertificationType
    provider: str
    agent_id: str = ""
    status: CertificationStatus = CertificationStatus.ACTIVE
    issued_date: float = field(default_factory=time.time)
    expiry_date: float = 0.0
    renewal_date: float = 0.0
    certificate_number: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CertificationRequirement:
    """Certification requirement."""
    id: str
    name: str
    cert_type: CertificationType
    description: str
    validity_period_days: int = 365
    renewal_notice_days: int = 30
    mandatory: bool = True


@dataclass
class ComplianceReport:
    """Compliance report."""
    id: str
    generated_at: float = field(default_factory=time.time)
    total_certifications: int = 0
    active_certifications: int = 0
    expired_certifications: int = 0
    pending_renewal: int = 0
    compliance_level: ComplianceLevel = ComplianceLevel.COMPLIANT
    missing_certifications: List[str] = field(default_factory=list)


@dataclass
class RenewalReminder:
    """Renewal reminder."""
    id: str
    certification_id: str
    certification_name: str
    agent_id: str
    reminder_date: float
    sent: bool = False


class CertificationManager:
    """Certification management engine."""

    def __init__(self):
        self._lock = threading.RLock()
        self._certifications: Dict[str, Certification] = {}
        self._requirements: Dict[str, CertificationRequirement] = {}
        self._reminders: List[RenewalReminder] = []
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_certification(
        self,
        name: str,
        cert_type: CertificationType,
        provider: str,
        agent_id: str = "",
        issued_date: float = None,
        expiry_date: float = None,
        certificate_number: str = "",
        metadata: Dict[str, Any] = None
    ) -> str:
        """Add a certification."""
        with self._lock:
            cert_id = str(uuid.uuid4())[:8]

            issued = issued_date or time.time()
            if expiry_date is None:
                # Default 1 year validity
                expiry_date = issued + (365 * 86400)

            # Renewal notice 30 days before expiry
            renewal_date = expiry_date - (30 * 86400)

            cert = Certification(
                id=cert_id,
                name=name,
                cert_type=cert_type,
                provider=provider,
                agent_id=agent_id,
                issued_date=issued,
                expiry_date=expiry_date,
                renewal_date=renewal_date,
                certificate_number=certificate_number,
                metadata=metadata or {}
            )

            self._certifications[cert_id] = cert

            # Create renewal reminder
            if renewal_date > time.time():
                reminder = RenewalReminder(
                    id=str(uuid.uuid4())[:8],
                    certification_id=cert_id,
                    certification_name=name,
                    agent_id=agent_id,
                    reminder_date=renewal_date
                )
                self._reminders.append(reminder)

            return cert_id

    def remove_certification(self, cert_id: str) -> bool:
        """Remove a certification."""
        with self._lock:
            if cert_id in self._certifications:
                del self._certifications[cert_id]
                # Remove related reminders
                self._reminders = [r for r in self._reminders if r.certification_id != cert_id]
                return True
            return False

    def get_certification(self, cert_id: str) -> Optional[Certification]:
        """Get certification by ID."""
        with self._lock:
            return self._certifications.get(cert_id)

    def list_certifications(
        self,
        agent_id: str = None,
        cert_type: CertificationType = None,
        status: CertificationStatus = None
    ) -> List[Certification]:
        """List certifications with filters."""
        with self._lock:
            certs = list(self._certifications.values())

            if agent_id:
                certs = [c for c in certs if c.agent_id == agent_id]
            if cert_type:
                certs = [c for c in certs if c.cert_type == cert_type]
            if status:
                certs = [c for c in certs if c.status == status]

            return certs

    def update_certification(
        self,
        cert_id: str,
        name: str = None,
        status: CertificationStatus = None,
        expiry_date: float = None,
        certificate_number: str = None
    ) -> bool:
        """Update a certification."""
        with self._lock:
            cert = self._certifications.get(cert_id)
            if not cert:
                return False

            if name is not None:
                cert.name = name
            if status is not None:
                cert.status = status
            if expiry_date is not None:
                cert.expiry_date = expiry_date
            if certificate_number is not None:
                cert.certificate_number = certificate_number

            return True

    def check_expirations(self) -> List[Certification]:
        """Check for expired and expiring certifications."""
        with self._lock:
            current_time = time.time()
            expiring = []

            for cert in self._certifications.values():
                if cert.expiry_date < current_time:
                    cert.status = CertificationStatus.EXPIRED
                    expiring.append(cert)
                elif cert.renewal_date < current_time:
                    cert.status = CertificationStatus.PENDING_RENEWAL
                    expiring.append(cert)

            return expiring

    def get_compliance_report(self) -> ComplianceReport:
        """Generate compliance report."""
        with self._lock:
            current_time = time.time()
            report = ComplianceReport(
                id=str(uuid.uuid4())[:8],
                total_certifications=len(self._certifications)
            )

            active = 0
            expired = 0
            pending = 0

            for cert in self._certifications.values():
                if cert.status == CertificationStatus.ACTIVE:
                    active += 1
                elif cert.status == CertificationStatus.EXPIRED:
                    expired += 1
                elif cert.status == CertificationStatus.PENDING_RENEWAL:
                    pending += 1

            report.active_certifications = active
            report.expired_certifications = expired
            report.pending_renewal = pending

            # Determine compliance level
            if expired > 0:
                report.compliance_level = ComplianceLevel.NON_COMPLIANT
            elif pending > 0:
                report.compliance_level = ComplianceLevel.PARTIALLY_COMPLIANT
            else:
                report.compliance_level = ComplianceLevel.COMPLIANT

            return report

    def get_pending_reminders(self) -> List[RenewalReminder]:
        """Get pending renewal reminders."""
        with self._lock:
            current_time = time.time()
            return [
                r for r in self._reminders
                if r.reminder_date <= current_time and not r.sent
            ]

    def mark_reminder_sent(self, reminder_id: str):
        """Mark reminder as sent."""
        with self._lock:
            for reminder in self._reminders:
                if reminder.id == reminder_id:
                    reminder.sent = True
                    break

    def add_requirement(
        self,
        name: str,
        cert_type: CertificationType,
        description: str,
        validity_period_days: int = 365,
        renewal_notice_days: int = 30,
        mandatory: bool = True
    ) -> str:
        """Add a certification requirement."""
        with self._lock:
            req_id = str(uuid.uuid4())[:8]

            requirement = CertificationRequirement(
                id=req_id,
                name=name,
                cert_type=cert_type,
                description=description,
                validity_period_days=validity_period_days,
                renewal_notice_days=renewal_notice_days,
                mandatory=mandatory
            )

            self._requirements[req_id] = requirement
            return req_id

    def remove_requirement(self, req_id: str) -> bool:
        """Remove a requirement."""
        with self._lock:
            if req_id in self._requirements:
                del self._requirements[req_id]
                return True
            return False

    def list_requirements(self) -> List[CertificationRequirement]:
        """List all requirements."""
        with self._lock:
            return list(self._requirements.values())


class AgentCertification:
    """Agent certification management system."""

    def __init__(self):
        self._manager = CertificationManager()
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_certification(
        self,
        name: str,
        cert_type: CertificationType,
        provider: str,
        agent_id: str = "",
        issued_date: float = None,
        expiry_date: float = None,
        certificate_number: str = "",
        metadata: Dict[str, Any] = None
    ) -> str:
        """Add a certification."""
        return self._manager.add_certification(
            name, cert_type, provider, agent_id, issued_date,
            expiry_date, certificate_number, metadata
        )

    def remove_certification(self, cert_id: str) -> bool:
        """Remove a certification."""
        return self._manager.remove_certification(cert_id)

    def get_certification(self, cert_id: str) -> Optional[Dict[str, Any]]:
        """Get certification."""
        cert = self._manager.get_certification(cert_id)
        if not cert:
            return None

        return {
            "id": cert.id,
            "name": cert.name,
            "type": cert.cert_type.value,
            "provider": cert.provider,
            "agent_id": cert.agent_id,
            "status": cert.status.value,
            "issued_date": cert.issued_date,
            "expiry_date": cert.expiry_date,
            "renewal_date": cert.renewal_date,
            "certificate_number": cert.certificate_number,
            "metadata": cert.metadata
        }

    def list_certifications(
        self,
        agent_id: str = None,
        cert_type: CertificationType = None,
        status: CertificationStatus = None
    ) -> List[Dict[str, Any]]:
        """List certifications."""
        certs = self._manager.list_certifications(agent_id, cert_type, status)
        return [
            {
                "id": c.id,
                "name": c.name,
                "type": c.cert_type.value,
                "provider": c.provider,
                "agent_id": c.agent_id,
                "status": c.status.value,
                "issued_date": c.issued_date,
                "expiry_date": c.expiry_date,
                "certificate_number": c.certificate_number
            }
            for c in certs
        ]

    def update_certification(
        self,
        cert_id: str,
        name: str = None,
        status: CertificationStatus = None,
        expiry_date: float = None,
        certificate_number: str = None
    ) -> bool:
        """Update a certification."""
        return self._manager.update_certification(cert_id, name, status, expiry_date, certificate_number)

    def check_expirations(self) -> List[Dict[str, Any]]:
        """Check expiring certifications."""
        certs = self._manager.check_expirations()
        return [
            {
                "id": c.id,
                "name": c.name,
                "type": c.cert_type.value,
                "agent_id": c.agent_id,
                "status": c.status.value,
                "expiry_date": c.expiry_date
            }
            for c in certs
        ]

    def get_compliance_report(self) -> Dict[str, Any]:
        """Get compliance report."""
        report = self._manager.get_compliance_report()
        return {
            "id": report.id,
            "generated_at": report.generated_at,
            "total_certifications": report.total_certifications,
            "active_certifications": report.active_certifications,
            "expired_certifications": report.expired_certifications,
            "pending_renewal": report.pending_renewal,
            "compliance_level": report.compliance_level.value,
            "missing_certifications": report.missing_certifications
        }

    def get_pending_reminders(self) -> List[Dict[str, Any]]:
        """Get pending reminders."""
        reminders = self._manager.get_pending_reminders()
        return [
            {
                "id": r.id,
                "certification_id": r.certification_id,
                "certification_name": r.certification_name,
                "agent_id": r.agent_id,
                "reminder_date": r.reminder_date,
                "sent": r.sent
            }
            for r in reminders
        ]

    def add_requirement(
        self,
        name: str,
        cert_type: CertificationType,
        description: str,
        validity_period_days: int = 365,
        renewal_notice_days: int = 30,
        mandatory: bool = True
    ) -> str:
        """Add a requirement."""
        return self._manager.add_requirement(
            name, cert_type, description, validity_period_days, renewal_notice_days, mandatory
        )

    def remove_requirement(self, req_id: str) -> bool:
        """Remove a requirement."""
        return self._manager.remove_requirement(req_id)

    def list_requirements(self) -> List[Dict[str, Any]]:
        """List requirements."""
        reqs = self._manager.list_requirements()
        return [
            {
                "id": r.id,
                "name": r.name,
                "type": r.cert_type.value,
                "description": r.description,
                "validity_period_days": r.validity_period_days,
                "renewal_notice_days": r.renewal_notice_days,
                "mandatory": r.mandatory
            }
            for r in reqs
        ]

    def get_agent_certifications(self, agent_id: str) -> List[Dict[str, Any]]:
        """Get all certifications for an agent."""
        return self.list_certifications(agent_id=agent_id)

    def get_certifications_by_type(self, cert_type: CertificationType) -> List[Dict[str, Any]]:
        """Get certifications by type."""
        return self.list_certifications(cert_type=cert_type)


# Global certification instance
agent_certification = AgentCertification()
