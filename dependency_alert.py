"""Dependency Alert Module

Monitor package dependencies for known CVEs and security vulnerabilities.
"""
import time
import threading
import uuid
import json
import re
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class Severity(str, Enum):
    """Vulnerability severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    UNKNOWN = "unknown"


class AlertStatus(str, Enum):
    """Alert status."""
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    FALSE_POSITIVE = "false_positive"


@dataclass
class Vulnerability:
    """Vulnerability information."""
    id: str  # CVE ID
    package: str
    current_version: str
    vulnerable_versions: str
    severity: Severity
    title: str
    description: str
    published_date: str
    fixed_version: str = ""
    cwe: str = ""
    cvss_score: float = 0.0


@dataclass
class Dependency:
    """Dependency information."""
    name: str
    version: str
    ecosystem: str  # pip, npm, maven, etc.
    file_path: str
    is_dev: bool = False
    transitive: bool = False


@dataclass
class DependencyAlert:
    """Dependency vulnerability alert."""
    id: str
    vulnerability_id: str
    package_name: str
    current_version: str
    fixed_version: str
    severity: Severity
    status: AlertStatus
    detected_at: float
    acknowledged_at: float = None
    acknowledged_by: str = ""
    resolved_at: float = None
    notes: str = ""


@dataclass
class ScanResult:
    """Dependency scan result."""
    id: str
    scan_path: str
    scanned_at: float
    dependencies_count: int
    vulnerabilities_found: int
    alerts: List[DependencyAlert]
    ecosystem: str


class DependencyAlertManager:
    """Manage dependency vulnerability alerts."""

    # Common dependency file patterns
    DEPENDENCY_FILES = {
        "pip": ["requirements.txt", "Pipfile", "Pipfile.lock", "pyproject.toml", "setup.py"],
        "npm": ["package.json", "package-lock.json", "yarn.lock"],
        "maven": ["pom.xml", "build.gradle"],
        "go": ["go.mod", "go.sum"],
        "ruby": ["Gemfile", "Gemfile.lock"],
        "nuget": ["packages.config", "*.csproj"],
        "cargo": ["Cargo.toml", "Cargo.lock"],
    }

    # Mock vulnerability database (in production, would query real CVE databases)
    KNOWN_VULNERABILITIES = {
        "requests": {
            "2.20.0": {"cve": "CVE-2018-18074", "severity": Severity.HIGH, "fixed": "2.21.0"},
            "<2.20.0": {"cve": "CVE-2018-18074", "severity": Severity.HIGH, "fixed": "2.20.0"},
        },
        "urllib3": {
            "<1.24.2": {"cve": "CVE-2019-11236", "severity": Severity.MEDIUM, "fixed": "1.24.2"},
            "<1.25.9": {"cve": "CVE-2020-26137", "severity": Severity.HIGH, "fixed": "1.25.9"},
        },
        "django": {
            "<3.2.10": {"cve": "CVE-2021-44420", "severity": Severity.HIGH, "fixed": "3.2.10"},
            "<4.0.2": {"cve": "CVE-2022-28346", "severity": Severity.HIGH, "fixed": "4.0.2"},
        },
        "flask": {
            "<2.2.5": {"cve": "CVE-2023-30861", "severity": Severity.HIGH, "fixed": "2.2.5"},
        },
        "numpy": {
            "<1.22.0": {"cve": "CVE-2021-41496", "severity": Severity.MEDIUM, "fixed": "1.22.0"},
        },
        "pandas": {
            "<1.3.5": {"cve": "CVE-2022-22818", "severity": Severity.HIGH, "fixed": "1.3.5"},
        },
        "jquery": {
            "<3.5.0": {"cve": "CVE-2020-11022", "severity": Severity.HIGH, "fixed": "3.5.0"},
        },
        "lodash": {
            "<4.17.21": {"cve": "CVE-2021-23337", "severity": Severity.HIGH, "fixed": "4.17.21"},
        },
        "axios": {
            "<0.21.1": {"cve": "CVE-2021-3749", "severity": Severity.HIGH, "fixed": "0.21.1"},
        },
    }

    def __init__(self):
        self._lock = threading.RLock()
        self._alerts: Dict[str, DependencyAlert] = {}
        self._scan_results: Dict[str, ScanResult] = {}
        self._dependencies: Dict[str, List[Dependency]] = {}

    def _detect_ecosystem(self, file_path: str) -> Optional[str]:
        """Detect ecosystem from file path."""
        path = file_path.lower()

        for ecosystem, files in self.DEPENDENCY_FILES.items():
            for f in files:
                if f.lower() in path:
                    return ecosystem

        # Check file extension
        if path.endswith('.txt'):
            return "pip"
        elif path.endswith(('.json', '.lock')):
            return "npm"
        elif path.endswith('.xml'):
            return "maven"
        elif path.endswith('.gradle'):
            return "maven"
        elif path.endswith('.toml'):
            return "pip"

        return None

    def _parse_requirements_txt(self, content: str) -> List[Dependency]:
        """Parse requirements.txt format."""
        deps = []

        for line in content.splitlines():
            line = line.strip()

            # Skip comments and empty lines
            if not line or line.startswith('#') or line.startswith('-'):
                continue

            # Parse package==version format
            match = re.match(r'^([a-zA-Z0-9_-]+)\s*([=<>!~]+)\s*([0-9a-zA-Z._-]+)', line)
            if match:
                name = match.group(1)
                version = match.group(3)
                deps.append(Dependency(
                    name=name,
                    version=version,
                    ecosystem="pip",
                    file_path="requirements.txt"
                ))

        return deps

    def _parse_package_json(self, content: str) -> List[Dependency]:
        """Parse package.json format."""
        deps = []

        try:
            data = json.loads(content)

            # Parse dependencies
            for key in ['dependencies', 'devDependencies']:
                if key in data:
                    is_dev = (key == 'devDependencies')
                    for name, version in data[key].items():
                        # Handle version ranges like ^1.0.0, ~1.0.0, >=1.0.0
                        version_str = version.lstrip('^~>=')

                        deps.append(Dependency(
                            name=name,
                            version=version_str,
                            ecosystem="npm",
                            file_path="package.json",
                            is_dev=is_dev
                        ))

        except json.JSONDecodeError:
            pass

        return deps

    def _parse_pipfile(self, content: str) -> List[Dependency]:
        """Parse Pipfile format."""
        deps = []

        try:
            data = json.loads(content)

            for key in ['packages', 'dev-packages']:
                if key in data:
                    is_dev = (key == 'dev-packages')
                    for name, version in data[key].items():
                        version_str = str(version).lstrip('=') if version else "*"

                        deps.append(Dependency(
                            name=name,
                            version=version_str,
                            ecosystem="pip",
                            file_path="Pipfile",
                            is_dev=is_dev
                        ))

        except json.JSONDecodeError:
            pass

        return deps

    def _parse_dependencies(self, file_path: str) -> List[Dependency]:
        """Parse dependency file."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception:
            return []

        ecosystem = self._detect_ecosystem(file_path)

        if not ecosystem:
            return []

        if ecosystem == "pip":
            if "requirements" in file_path.lower():
                return self._parse_requirements_txt(content)
            elif "pipfile" in file_path.lower():
                return self._parse_pipfile(content)

        elif ecosystem == "npm":
            if "package.json" in file_path.lower():
                return self._parse_package_json(content)

        return []

    def _check_vulnerability(self, package: str, version: str) -> Optional[Dict]:
        """Check if package version has known vulnerabilities."""
        package_lower = package.lower()

        if package_lower not in self.KNOWN_VULNERABILITIES:
            return None

        vulnerabilities = self.KNOWN_VULNERABILITIES[package_lower]

        for version_pattern, vuln_info in vulnerabilities.items():
            # Simple version check (in production, use proper semver)
            if version_pattern.startswith('<'):
                fixed_version = version_pattern[1:]
                # Check if current version is less than fixed version
                if self._version_compare(version, fixed_version) < 0:
                    return vuln_info
            elif version_pattern.startswith('<='):
                fixed_version = version_pattern[2:]
                if self._version_compare(version, fixed_version) <= 0:
                    return vuln_info
            else:
                # Exact version match
                if version == version_pattern:
                    return vuln_info

        return None

    def _version_compare(self, v1: str, v2: str) -> int:
        """Compare two version strings. Returns -1, 0, or 1."""
        parts1 = [int(x) for x in v1.split('.')[:3]]
        parts2 = [int(x) for x in v2.split('.')[:3]]

        # Pad with zeros
        while len(parts1) < 3:
            parts1.append(0)
        while len(parts2) < 3:
            parts2.append(0)

        for i in range(3):
            if parts1[i] < parts2[i]:
                return -1
            elif parts1[i] > parts2[i]:
                return 1

        return 0

    def scan_directory(self, directory: str, recursive: bool = True) -> ScanResult:
        """Scan directory for dependency files and check vulnerabilities."""
        import os
        from pathlib import Path

        scan_id = str(uuid.uuid4())[:12]
        all_alerts: List[DependencyAlert] = []
        total_deps = 0

        path = Path(directory)
        ecosystem = None

        if not path.exists():
            return ScanResult(
                id=scan_id,
                scan_path=directory,
                scanned_at=time.time(),
                dependencies_count=0,
                vulnerabilities_found=0,
                alerts=[],
                ecosystem=""
            )

        # Find all dependency files
        dep_files = []

        if recursive:
            for root, dirs, files in os.walk(directory):
                # Skip common non-dependency directories
                dirs[:] = [d for d in dirs if d not in ['node_modules', '.git', '__pycache__', 'venv', '.venv']]

                for f in files:
                    file_path = os.path.join(root, f)
                    eco = self._detect_ecosystem(file_path)
                    if eco:
                        dep_files.append((file_path, eco))
        else:
            for f in path.iterdir():
                if f.is_file():
                    eco = self._detect_ecosystem(str(f))
                    if eco:
                        dep_files.append((str(f), eco))

        # Parse each dependency file
        for file_path, eco in dep_files:
            ecosystem = eco
            deps = self._parse_dependencies(file_path)
            total_deps += len(deps)

            for dep in deps:
                vuln = self._check_vulnerability(dep.name, dep.version)

                if vuln:
                    alert_id = str(uuid.uuid4())[:12]

                    alert = DependencyAlert(
                        id=alert_id,
                        vulnerability_id=vuln["cve"],
                        package_name=dep.name,
                        current_version=dep.version,
                        fixed_version=vuln.get("fixed", "unknown"),
                        severity=vuln["severity"],
                        status=AlertStatus.ACTIVE,
                        detected_at=time.time()
                    )

                    all_alerts.append(alert)

                    with self._lock:
                        self._alerts[alert_id] = alert

        result = ScanResult(
            id=scan_id,
            scan_path=directory,
            scanned_at=time.time(),
            dependencies_count=total_deps,
            vulnerabilities_found=len(all_alerts),
            alerts=all_alerts,
            ecosystem=ecosystem or "unknown"
        )

        with self._lock:
            self._scan_results[scan_id] = result

        return result

    def get_alerts(
        self,
        status: AlertStatus = None,
        severity: Severity = None,
        package: str = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[DependencyAlert]:
        """Get alerts with filters."""
        with self._lock:
            alerts = list(self._alerts.values())

        if status:
            alerts = [a for a in alerts if a.status == status]
        if severity:
            alerts = [a for a in alerts if a.severity == severity]
        if package:
            alerts = [a for a in alerts if a.package_name == package]

        alerts.sort(key=lambda x: x.detected_at, reverse=True)

        return alerts[offset:offset + limit]

    def acknowledge_alert(
        self,
        alert_id: str,
        acknowledged_by: str,
        notes: str = ""
    ) -> bool:
        """Acknowledge an alert."""
        with self._lock:
            alert = self._alerts.get(alert_id)
            if not alert:
                return False

            alert.status = AlertStatus.ACKNOWLEDGED
            alert.acknowledged_at = time.time()
            alert.acknowledged_by = acknowledged_by
            if notes:
                alert.notes = notes

            return True

    def resolve_alert(
        self,
        alert_id: str,
        notes: str = ""
    ) -> bool:
        """Resolve an alert."""
        with self._lock:
            alert = self._alerts.get(alert_id)
            if not alert:
                return False

            alert.status = AlertStatus.RESOLVED
            alert.resolved_at = time.time()
            if notes:
                alert.notes = notes

            return True

    def mark_false_positive(
        self,
        alert_id: str,
        notes: str = ""
    ) -> bool:
        """Mark alert as false positive."""
        with self._lock:
            alert = self._alerts.get(alert_id)
            if not alert:
                return False

            alert.status = AlertStatus.FALSE_POSITIVE
            if notes:
                alert.notes = notes

            return True

    def get_alert(self, alert_id: str) -> Optional[DependencyAlert]:
        """Get a specific alert."""
        with self._lock:
            return self._alerts.get(alert_id)

    def get_scan_result(self, scan_id: str) -> Optional[ScanResult]:
        """Get scan result."""
        with self._lock:
            return self._scan_results.get(scan_id)

    def get_scan_results(self, limit: int = 50) -> List[Dict]:
        """Get recent scan results."""
        with self._lock:
            results = sorted(
                self._scan_results.values(),
                key=lambda x: x.scanned_at,
                reverse=True
            )

        return [
            {
                "id": r.id,
                "scan_path": r.scan_path,
                "scanned_at": r.scanned_at,
                "dependencies_count": r.dependencies_count,
                "vulnerabilities_found": r.vulnerabilities_found,
                "ecosystem": r.ecosystem
            }
            for r in results[:limit]
        ]

    def get_statistics(self) -> Dict:
        """Get alert statistics."""
        with self._lock:
            alerts = list(self._alerts.values())

        by_status = {}
        by_severity = {}
        by_package = {}

        for alert in alerts:
            by_status[alert.status.value] = by_status.get(alert.status.value, 0) + 1
            by_severity[alert.severity.value] = by_severity.get(alert.severity.value, 0) + 1
            by_package[alert.package_name] = by_package.get(alert.package_name, 0) + 1

        return {
            "total_alerts": len(alerts),
            "active_alerts": sum(1 for a in alerts if a.status == AlertStatus.ACTIVE),
            "acknowledged_alerts": sum(1 for a in alerts if a.status == AlertStatus.ACKNOWLEDGED),
            "resolved_alerts": sum(1 for a in alerts if a.status == AlertStatus.RESOLVED),
            "by_status": by_status,
            "by_severity": by_severity,
            "by_package": by_package,
            "total_scans": len(self._scan_results)
        }


# Global dependency alert manager
dependency_alert = DependencyAlertManager()
