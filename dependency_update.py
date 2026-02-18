"""Dependency Update Automation Module

Automated dependency management with vulnerability scanning,
compatibility checking, and automatic updates.
"""
import os
import json
import subprocess
import threading
import re
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path


class UpdateStatus(str, Enum):
    """Update status."""
    PENDING = "pending"
    SCANNING = "scanning"
    VULNERABLE = "vulnerable"
    COMPATIBLE = "compatible"
    UPDATING = "updating"
    UPDATED = "updated"
    FAILED = "failed"
    SKIPPED = "skipped"


class VulnerabilitySeverity(str, Enum):
    """Vulnerability severity levels."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    NONE = "none"


@dataclass
class Package:
    """Package information."""
    name: str
    version: str
    latest_version: Optional[str] = None
    required_version: Optional[str] = None
    is_outdated: bool = False
    vulnerabilities: List[Dict] = field(default_factory=list)


@dataclass
class DependencyReport:
    """Dependency analysis report."""
    total_packages: int = 0
    outdated_packages: int = 0
    vulnerable_packages: int = 0
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0
    packages: List[Package] = field(default_factory=list)
    scan_time: str = field(default_factory=lambda: datetime.now().isoformat())
    recommendations: List[str] = field(default_factory=list)


@dataclass
class UpdateTask:
    """Dependency update task."""
    task_id: str
    package_name: str
    from_version: str
    to_version: str
    status: UpdateStatus = UpdateStatus.PENDING
    changelog: str = ""
    breaking_changes: List[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: Optional[str] = None
    error: Optional[str] = None


class DependencyAnalyzer:
    """Dependency analysis and update manager."""

    def __init__(self, requirements_file: str = "requirements.txt"):
        self.requirements_file = requirements_file
        self.packages: Dict[str, Package] = {}
        self.update_tasks: Dict[str, UpdateTask] = {}
        self._lock = threading.RLock()
        self._scan_callbacks: List[Callable] = []

    def register_scan_callback(self, callback: Callable):
        """Register callback to be called after scan."""
        self._scan_callbacks.append(callback)

    def parse_requirements(self) -> Dict[str, str]:
        """Parse requirements.txt file."""
        requirements = {}
        if os.path.exists(self.requirements_file):
            with open(self.requirements_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#'):
                        # Handle ==, >=, <=, >, <, !=
                        match = re.match(r'^([a-zA-Z0-9_-]+)([<>=!~]+)?(.+)?$', line)
                        if match:
                            name, op, version = match.groups()
                            requirements[name] = line
        return requirements

    def get_installed_packages(self) -> Dict[str, str]:
        """Get currently installed packages."""
        try:
            result = subprocess.run(
                ["pip", "list", "--format=json"],
                capture_output=True,
                text=True,
                timeout=30
            )
            if result.returncode == 0:
                packages = json.loads(result.stdout)
                return {p['name'].lower(): p['version'] for p in packages}
        except Exception as e:
            print(f"Error getting installed packages: {e}")
        return {}

    def check_package_updates(self) -> List[Package]:
        """Check for package updates."""
        requirements = self.parse_requirements()
        installed = self.get_installed_packages()
        updated_packages = []

        # Use pip to check for updates
        try:
            result = subprocess.run(
                ["pip", "list", "--outdated", "--format=json"],
                capture_output=True,
                text=True,
                timeout=60
            )
            if result.returncode == 0:
                outdated = json.loads(result.stdout)
                for pkg in outdated:
                    name = pkg['name'].lower()
                    package = Package(
                        name=name,
                        version=pkg['version'],
                        latest_version=pkg['latest_version'],
                        required_version=requirements.get(name, ""),
                        is_outdated=True
                    )
                    self.packages[name] = package
                    updated_packages.append(package)
        except Exception as e:
            print(f"Error checking updates: {e}")

        # Add installed but not outdated packages
        for name, version in installed.items():
            if name not in self.packages:
                package = Package(
                    name=name,
                    version=version,
                    is_outdated=False
                )
                self.packages[name] = package

        return updated_packages

    def check_vulnerabilities(self, package_name: str = None) -> Dict[str, List[Dict]]:
        """Check for known vulnerabilities using pip-audit or safety."""
        vulnerabilities = {}

        # Try pip-audit first
        try:
            result = subprocess.run(
                ["pip-audit", "--format=json"],
                capture_output=True,
                text=True,
                timeout=120
            )
            if result.returncode == 0:
                data = json.loads(result.stdout)
                for dep in data.get("dependencies", []):
                    pkg_name = dep["name"].lower()
                    vulns = dep.get("vulns", [])
                    if vulns:
                        vulnerabilities[pkg_name] = vulns
                        if pkg_name in self.packages:
                            self.packages[pkg_name].vulnerabilities = vulns
                return vulnerabilities
        except FileNotFoundError:
            pass
        except Exception as e:
            print(f"pip-audit error: {e}")

        # Fallback: try safety
        try:
            result = subprocess.run(
                ["safety", "check", "--json"],
                capture_output=True,
                text=True,
                timeout=120
            )
            if result.returncode == 0 and result.stdout:
                data = json.loads(result.stdout)
                for vuln in data:
                    pkg_name = vuln.get("package", "").lower()
                    if pkg_name not in vulnerabilities:
                        vulnerabilities[pkg_name] = []
                    vulnerabilities[pkg_name].append({
                        "id": vuln.get("id", ""),
                        "vulnerability_id": vuln.get("vulnerability_id", ""),
                        "severity": vuln.get("severity", "UNKNOWN"),
                        "description": vuln.get("description", ""),
                        "advisory": vuln.get("advisory", "")
                    })
        except FileNotFoundError:
            pass
        except Exception as e:
            print(f"safety error: {e}")

        return vulnerabilities

    def scan_dependencies(self) -> DependencyReport:
        """Full dependency scan including updates and vulnerabilities."""
        report = DependencyReport()

        # Check for updates
        outdated = self.check_package_updates()
        report.outdated_packages = len(outdated)

        # Check for vulnerabilities
        vulnerabilities = self.check_vulnerabilities()

        # Build report
        for name, package in self.packages.items():
            report.packages.append(package)
            if package.vulnerabilities:
                report.vulnerable_packages += 1
                for vuln in package.vulnerabilities:
                    severity = vuln.get("severity", "").lower()
                    if severity == "critical":
                        report.critical_count += 1
                    elif severity == "high":
                        report.high_count += 1
                    elif severity == "medium":
                        report.medium_count += 1
                    elif severity == "low":
                        report.low_count += 1

        report.total_packages = len(self.packages)

        # Generate recommendations
        if report.vulnerable_packages > 0:
            report.recommendations.append(
                f"Found {report.vulnerable_packages} vulnerable packages - prioritize updates"
            )
        if report.critical_count > 0:
            report.recommendations.append(
                f"Critical vulnerabilities found: {report.critical_count} - update immediately"
            )
        if report.outdated_packages > 0:
            report.recommendations.append(
                f"{report.outdated_packages} packages have updates available"
            )

        # Run callbacks
        for callback in self._scan_callbacks:
            try:
                callback(report)
            except Exception as e:
                print(f"Callback error: {e}")

        return report

    def update_package(self, package_name: str, version: str = None) -> UpdateTask:
        """Update a specific package."""
        import uuid
        task_id = str(uuid.uuid4())[:8]

        package = self.packages.get(package_name.lower())
        if not package:
            task = UpdateTask(
                task_id=task_id,
                package_name=package_name,
                from_version="unknown",
                to_version=version or "latest",
                status=UpdateStatus.FAILED,
                error="Package not found"
            )
            self.update_tasks[task_id] = task
            return task

        from_version = package.version
        to_version = version or package.latest_version or "latest"

        task = UpdateTask(
            task_id=task_id,
            package_name=package_name,
            from_version=from_version,
            to_version=to_version,
            status=UpdateStatus.UPDATING
        )
        self.update_tasks[task_id] = task

        try:
            # Perform update
            cmd = ["pip", "install", "--upgrade"]
            if version:
                cmd.append(f"{package_name}=={version}")
            else:
                cmd.append(package_name)

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode == 0:
                task.status = UpdateStatus.UPDATED
                task.completed_at = datetime.now().isoformat()
                # Refresh package info
                self.check_package_updates()
            else:
                task.status = UpdateStatus.FAILED
                task.error = result.stderr[:500]
        except Exception as e:
            task.status = UpdateStatus.FAILED
            task.error = str(e)

        return task

    def auto_update(self, exclude_packages: List[str] = None) -> List[UpdateTask]:
        """Automatically update all outdated packages."""
        exclude = set(exclude_packages or [])
        tasks = []

        for name, package in self.packages.items():
            if package.is_outdated and name not in exclude:
                task = self.update_package(name)
                tasks.append(task)

        return tasks

    def get_update_task(self, task_id: str) -> Optional[UpdateTask]:
        """Get update task by ID."""
        return self.update_tasks.get(task_id)

    def list_update_tasks(self, status: UpdateStatus = None) -> List[UpdateTask]:
        """List update tasks."""
        tasks = list(self.update_tasks.values())
        if status:
            tasks = [t for t in tasks if t.status == status]
        return sorted(tasks, key=lambda x: x.created_at, reverse=True)

    def check_compatibility(self, package_name: str, target_version: str = None) -> Dict[str, Any]:
        """Check if package update is compatible."""
        package = self.packages.get(package_name.lower())
        if not package:
            return {"compatible": False, "reason": "Package not found"}

        version = target_version or package.latest_version
        if not version:
            return {"compatible": False, "reason": "No update available"}

        # Try pip check
        try:
            # Check if update would break dependencies
            result = subprocess.run(
                ["pip", "install", "--dry-run", f"{package_name}=={version}"],
                capture_output=True,
                text=True,
                timeout=60
            )

            # Check for conflicts
            if "ERROR" in result.stderr or "conflict" in result.stderr.lower():
                return {
                    "compatible": False,
                    "reason": "Dependency conflict detected",
                    "details": result.stderr[:500]
                }

            return {"compatible": True, "version": version}
        except Exception as e:
            return {"compatible": False, "reason": str(e)}

    def export_report(self, format: str = "json") -> str:
        """Export dependency report."""
        report = self.scan_dependencies()

        if format == "json":
            return json.dumps({
                "total_packages": report.total_packages,
                "outdated_packages": report.outdated_packages,
                "vulnerable_packages": report.vulnerable_packages,
                "vulnerabilities": {
                    "critical": report.critical_count,
                    "high": report.high_count,
                    "medium": report.medium_count,
                    "low": report.low_count
                },
                "packages": [
                    {
                        "name": p.name,
                        "version": p.version,
                        "latest_version": p.latest_version,
                        "is_outdated": p.is_outdated,
                        "vulnerabilities": len(p.vulnerabilities)
                    }
                    for p in report.packages
                ],
                "recommendations": report.recommendations,
                "scan_time": report.scan_time
            }, indent=2)

        return str(report)


# Global dependency analyzer instance
dependency_analyzer = DependencyAnalyzer()
