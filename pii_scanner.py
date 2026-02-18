"""PII Scanner Module

Scan for Personally Identifiable Information in text and files.
"""
import re
import threading
import uuid
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class PIIType(str, Enum):
    """PII types."""
    EMAIL = "email"
    PHONE = "phone"
    SSN = "ssn"
    CREDIT_CARD = "credit_card"
    IP_ADDRESS = "ip_address"
    ADDRESS = "address"
    DATE_OF_BIRTH = "date_of_birth"
    NAME = "name"
    PASSPORT = "passport"
    DRIVER_LICENSE = "driver_license"
    BANK_ACCOUNT = "bank_account"


class Severity(str, Enum):
    """Severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


@dataclass
class PIIDetection:
    """PII detection result."""
    id: str
    pii_type: PIIType
    value: str
    redacted_value: str
    severity: Severity
    location: str
    line_number: int = 0


@dataclass
class ScanReport:
    """PII scan report."""
    id: str
    file_path: str
    scanned_at: float
    total_findings: int
    findings: List[PIIDetection]
    suggestions: List[str]


class PIIScanner:
    """Scan for PII in text and files."""

    PATTERNS = {
        PIIType.EMAIL: (r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', Severity.HIGH),
        PIIType.PHONE: (r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b', Severity.MEDIUM),
        PIIType.SSN: (r'\b\d{3}-\d{2}-\d{4}\b', Severity.CRITICAL),
        PIIType.CREDIT_CARD: (r'\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b', Severity.CRITICAL),
        PIIType.IP_ADDRESS: (r'\b(?:\d{1,3}\.){3}\d{1,3}\b', Severity.LOW),
        PIIType.DATE_OF_BIRTH: (r'\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b', Severity.MEDIUM),
        PIIType.PASSPORT: (r'\b[A-Z]{1,2}\d{6,9}\b', Severity.HIGH),
        PIIType.DRIVER_LICENSE: (r'\b[A-Z]{1,2}\d{5,8}\b', Severity.HIGH),
    }

    def __init__(self):
        self._lock = threading.RLock()
        self._reports: Dict[str, ScanReport] = {}

    def _redact(self, value: str) -> str:
        """Redact PII value."""
        if len(value) <= 4:
            return "*" * len(value)
        return value[:2] + "*" * (len(value) - 4) + value[-2:]

    def scan_text(self, text: str, location: str = "text") -> List[PIIDetection]:
        """Scan text for PII."""
        findings = []

        for pii_type, (pattern, severity) in self.PATTERNS.items():
            matches = re.finditer(pattern, text)
            for match in matches:
                value = match.group()
                findings.append(PIIDetection(
                    id=str(uuid.uuid4())[:12],
                    pii_type=pii_type,
                    value=value,
                    redacted_value=self._redact(value),
                    severity=severity,
                    location=location,
                    line_number=1
                ))

        return findings

    def scan_file(self, file_path: str) -> ScanReport:
        """Scan a file for PII."""
        findings = []

        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()

            for line_num, line in enumerate(lines, 1):
                line_findings = self.scan_text(line, file_path)
                for finding in line_findings:
                    finding.line_number = line_num
                    findings.append(finding)

        except Exception as e:
            pass

        # Generate suggestions
        suggestions = []
        types_found = set(f.pii_type for f in findings)
        if PIIType.EMAIL in types_found:
            suggestions.append("Implement email masking for user data")
        if PIIType.SSN in types_found:
            suggestions.append("SSN found - ensure compliance with data protection regulations")
        if PIIType.CREDIT_CARD in types_found:
            suggestions.append("Use tokenization for payment data")

        report = ScanReport(
            id=str(uuid.uuid4())[:12],
            file_path=file_path,
            scanned_at=datetime.now().timestamp(),
            total_findings=len(findings),
            findings=findings,
            suggestions=suggestions
        )

        with self._lock:
            self._reports[report.id] = report

        return report

    def get_report(self, report_id: str) -> Optional[ScanReport]:
        """Get a scan report."""
        with self._lock:
            return self._reports.get(report_id)

    def get_reports(self, limit: int = 50) -> List[Dict]:
        """Get scan reports."""
        with self._lock:
            reports = sorted(self._reports.values(), key=lambda x: x.scanned_at, reverse=True)

        return [
            {"id": r.id, "file_path": r.file_path, "scanned_at": r.scanned_at,
             "total_findings": r.total_findings}
            for r in reports[:limit]
        ]

    def get_stats(self) -> Dict:
        """Get scanner statistics."""
        with self._lock:
            total = len(self._reports)
            total_findings = sum(r.total_findings for r in self._reports.values())

            by_type = {}
            by_severity = {"critical": 0, "high": 0, "medium": 0, "low": 0}

            for r in self._reports.values():
                for f in r.findings:
                    by_type[f.pii_type.value] = by_type.get(f.pii_type.value, 0) + 1
                    by_severity[f.severity.value] += 1

            return {
                "total_scans": total,
                "total_findings": total_findings,
                "by_type": by_type,
                "by_severity": by_severity
            }


# Global PII scanner
pii_scanner = PIIScanner()
