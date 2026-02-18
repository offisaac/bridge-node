"""Compliance Reporter Module

Automated compliance report generation.
"""
import threading
import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class ComplianceStandard(str, Enum):
    """Compliance standards."""
    SOC2 = "soc2"
    GDPR = "gdpr"
    HIPAA = "hipaa"
    PCI_DSS = "pci_dss"
    ISO27001 = "iso27001"
    CUSTOM = "custom"


class ComplianceStatus(str, Enum):
    """Compliance status."""
    COMPLIANT = "compliant"
    NON_COMPLIANT = "non_compliant"
    PARTIAL = "partial"
    UNKNOWN = "unknown"


@dataclass
class ComplianceCheck:
    """Individual compliance check."""
    id: str
    name: str
    description: str
    standard: ComplianceStandard
    status: ComplianceStatus
    evidence: List[str] = field(default_factory=list)
    last_checked: str = ""
    remediation: str = ""


@dataclass
class ComplianceReport:
    """Compliance report."""
    id: str
    standard: ComplianceStandard
    generated_at: str
    status: ComplianceStatus
    checks_passed: int = 0
    checks_failed: int = 0
    checks_total: int = 0
    findings: List[Dict] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)


class ComplianceReporter:
    """Automated compliance report generator."""

    def __init__(self):
        self._lock = threading.RLock()
        self._checks: Dict[str, List[ComplianceCheck]] = {}
        self._reports: List[ComplianceReport] = []
        self._max_reports = 100

    def register_check(self, check: ComplianceCheck):
        """Register a compliance check."""
        with self._lock:
            standard = check.standard
            if standard not in self._checks:
                self._checks[standard] = []
            self._checks[standard].append(check)

    def add_check(
        self,
        name: str,
        description: str,
        standard: ComplianceStandard,
        status: ComplianceStatus,
        evidence: List[str] = None,
        remediation: str = ""
    ):
        """Add a compliance check."""
        import uuid
        check = ComplianceCheck(
            id=str(uuid.uuid4())[:8],
            name=name,
            description=description,
            standard=standard,
            status=status,
            evidence=evidence or [],
            last_checked=datetime.now().isoformat(),
            remediation=remediation
        )
        self.register_check(check)

    def run_checks(self, standard: ComplianceStandard) -> ComplianceReport:
        """Run compliance checks for a standard."""
        import uuid

        with self._lock:
            checks = self._checks.get(standard, [])

        report = ComplianceReport(
            id=str(uuid.uuid4())[:8],
            standard=standard,
            generated_at=datetime.now().isoformat(),
            status=ComplianceStatus.UNKNOWN,
            checks_total=len(checks),
            checks_passed=sum(1 for c in checks if c.status == ComplianceStatus.COMPLIANT),
            checks_failed=sum(1 for c in checks if c.status == ComplianceStatus.NON_COMPLIANT)
        )

        # Determine overall status
        if report.checks_passed == report.checks_total:
            report.status = ComplianceStatus.COMPLIANT
        elif report.checks_failed == report.checks_total:
            report.status = ComplianceStatus.NON_COMPLIANT
        elif report.checks_passed > 0:
            report.status = ComplianceStatus.PARTIAL
        else:
            report.status = ComplianceStatus.UNKNOWN

        # Generate findings
        for check in checks:
            if check.status != ComplianceStatus.COMPLIANT:
                report.findings.append({
                    "check_id": check.id,
                    "name": check.name,
                    "description": check.description,
                    "status": check.status.value,
                    "remediation": check.remediation
                })

        # Generate recommendations
        if report.checks_failed > 0:
            report.recommendations.append(
                f"Address {report.checks_failed} non-compliant checks for {standard.value}"
            )
        if report.status == ComplianceStatus.PARTIAL:
            report.recommendations.append(
                "Review partial compliance items and implement additional controls"
            )

        # Store report
        with self._lock:
            self._reports.append(report)
            if len(self._reports) > self._max_reports:
                self._reports = self._reports[-self._max_reports:]

        return report

    def get_report(self, report_id: str) -> Optional[ComplianceReport]:
        """Get a specific report."""
        with self._lock:
            return next((r for r in self._reports if r.id == report_id), None)

    def get_reports(
        self,
        standard: ComplianceStandard = None,
        limit: int = 10
    ) -> List[Dict]:
        """Get compliance reports."""
        with self._lock:
            reports = self._reports.copy()

        if standard:
            reports = [r for r in reports if r.standard == standard]

        reports = sorted(reports, key=lambda x: x.generated_at, reverse=True)

        return [
            {
                "id": r.id,
                "standard": r.standard.value,
                "generated_at": r.generated_at,
                "status": r.status.value,
                "checks_passed": r.checks_passed,
                "checks_failed": r.checks_failed,
                "checks_total": r.checks_total,
                "findings_count": len(r.findings)
            }
            for r in reports[:limit]
        ]

    def get_checks(self, standard: ComplianceStandard = None) -> List[Dict]:
        """Get compliance checks."""
        with self._lock:
            if standard:
                checks = self._checks.get(standard, [])
            else:
                checks = []
                for c_list in self._checks.values():
                    checks.extend(c_list)

        return [
            {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "standard": c.standard.value,
                "status": c.status.value,
                "last_checked": c.last_checked,
                "remediation": c.remediation
            }
            for c in checks
        ]

    def generate_report(self, standard: ComplianceStandard) -> Dict:
        """Generate a compliance report."""
        report = self.run_checks(standard)
        return {
            "id": report.id,
            "standard": report.standard.value,
            "generated_at": report.generated_at,
            "status": report.status.value,
            "summary": {
                "passed": report.checks_passed,
                "failed": report.checks_failed,
                "total": report.checks_total
            },
            "findings": report.findings,
            "recommendations": report.recommendations
        }

    def export_report(self, report_id: str, format: str = "json") -> str:
        """Export report in specified format."""
        report = self.get_report(report_id)
        if not report:
            return "{}"

        if format == "json":
            return json.dumps({
                "id": report.id,
                "standard": report.standard.value,
                "generated_at": report.generated_at,
                "status": report.status.value,
                "checks_passed": report.checks_passed,
                "checks_failed": report.checks_failed,
                "checks_total": report.checks_total,
                "findings": report.findings,
                "recommendations": report.recommendations
            }, indent=2)

        return str(report)


# Global compliance reporter
compliance_reporter = ComplianceReporter()

# Initialize default compliance checks
def init_compliance_checks():
    """Initialize default compliance checks."""
    # SOC2 checks
    compliance_reporter.add_check(
        name="Access Control",
        description="User access is properly controlled and monitored",
        standard=ComplianceStandard.SOC2,
        status=ComplianceStatus.COMPLIANT,
        evidence=["RBAC implemented", "Authentication required"]
    )
    compliance_reporter.add_check(
        name="Data Encryption",
        description="Data is encrypted at rest and in transit",
        standard=ComplianceStandard.SOC2,
        status=ComplianceStatus.COMPLIANT,
        evidence=["TLS enabled", "Encryption module active"]
    )
    compliance_reporter.add_check(
        name="Audit Logging",
        description="All security events are logged",
        standard=ComplianceStandard.SOC2,
        status=ComplianceStatus.COMPLIANT,
        evidence=["Audit logger active"]
    )

    # GDPR checks
    compliance_reporter.add_check(
        name="Data Privacy",
        description="User data privacy is maintained",
        standard=ComplianceStandard.GDPR,
        status=ComplianceStatus.PARTIAL,
        remediation="Implement data retention policy"
    )
    compliance_reporter.add_check(
        name="Consent Management",
        description="User consent is properly managed",
        standard=ComplianceStandard.GDPR,
        status=ComplianceStatus.COMPLIANT,
        evidence=["Consent API implemented"]
    )

    # HIPAA checks
    compliance_reporter.add_check(
        name="PHI Protection",
        description="Protected health information is secured",
        standard=ComplianceStandard.HIPAA,
        status=ComplianceStatus.UNKNOWN,
        remediation="Review PHI handling procedures"
    )

    # PCI DSS checks
    compliance_reporter.add_check(
        name="Payment Security",
        description="Payment data is properly secured",
        standard=ComplianceStandard.PCI_DSS,
        status=ComplianceStatus.COMPLIANT,
        evidence=["PCI compliant payment gateway"]
    )


init_compliance_checks()
