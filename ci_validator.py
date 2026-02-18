"""CI Validator Module

Validate CI/CD pipeline configurations for common issues, security vulnerabilities, and best practices.
"""
import os
import re
import yaml
import json
import threading
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path


class Severity(str, Enum):
    """Severity levels for validation issues."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


class Category(str, Enum):
    """Validation categories."""
    SECURITY = "security"
    PERFORMANCE = "performance"
    RELIABILITY = "reliability"
    BEST_PRACTICE = "best_practice"
    CONFIGURATION = "configuration"


@dataclass
class ValidationRule:
    """Validation rule definition."""
    id: str
    name: str
    description: str
    category: Category
    severity: Severity
    pattern: Optional[str] = None
    check_function: Optional[callable] = None


@dataclass
class ValidationIssue:
    """Validation issue found in CI config."""
    rule_id: str
    rule_name: str
    message: str
    severity: Severity
    category: Category
    file_path: str = ""
    line_number: int = 0
    suggestion: str = ""


@dataclass
class ValidationReport:
    """Complete validation report."""
    id: str
    config_path: str
    config_type: str
    timestamp: float
    issues: List[ValidationIssue]
    passed_checks: int = 0
    score: int = 100


class CIValidator:
    """Validate CI/CD pipeline configurations."""

    # Supported CI systems
    SUPPORTED_CONFIGS = {
        '.github/workflows': 'github-actions',
        '.gitlab-ci.yml': 'gitlab',
        'Jenkinsfile': 'jenkins',
        'azure-pipelines.yml': 'azure',
        '.circleci/config.yml': 'circleci',
        'travis.yml': 'travis',
    }

    def __init__(self):
        self._lock = threading.RLock()
        self._reports: Dict[str, ValidationReport] = {}
        self._rules = self._init_rules()

    def _init_rules(self) -> List[ValidationRule]:
        """Initialize validation rules."""
        return [
            # Security rules
            ValidationRule(
                id="SEC001",
                name="Hardcoded Secrets",
                description="Check for hardcoded secrets in CI config",
                category=Category.SECURITY,
                severity=Severity.CRITICAL,
                pattern=r'(?:password|secret|token|api_key)\s*[:=]\s*["\'][^"\']+["\']'
            ),
            ValidationRule(
                id="SEC002",
                name="Unencrypted Secrets",
                description="Ensure secrets are encrypted or use secrets management",
                category=Category.SECURITY,
                severity=Severity.HIGH
            ),
            ValidationRule(
                id="SEC003",
                name="World-Writable Permissions",
                description="Check for overly permissive file permissions",
                category=Category.SECURITY,
                severity=Severity.HIGH,
                pattern=r'umask\s+0[0-7]{2}'
            ),
            ValidationRule(
                id="SEC004",
                name="Untrusted Script Execution",
                description="Check for execution of untrusted scripts",
                category=Category.SECURITY,
                severity=Severity.HIGH
            ),

            # Performance rules
            ValidationRule(
                id="PERF001",
                name="No Cache Configuration",
                description="Check if caching is configured",
                category=Category.PERFORMANCE,
                severity=Severity.MEDIUM
            ),
            ValidationRule(
                id="PERF002",
                name="No Parallel Jobs",
                description="Check if parallel execution is configured",
                category=Category.PERFORMANCE,
                severity=Severity.LOW
            ),
            ValidationRule(
                id="PERF003",
                name="Unnecessary Step",
                description="Check for redundant or unnecessary steps",
                category=Category.PERFORMANCE,
                severity=Severity.LOW
            ),

            # Reliability rules
            ValidationRule(
                id="REL001",
                name="No Timeout",
                description="Check if steps have timeout configured",
                category=Category.RELIABILITY,
                severity=Severity.MEDIUM
            ),
            ValidationRule(
                id="REL002",
                name="No Retry Configuration",
                description="Check if failed steps are configured to retry",
                category=Category.RELIABILITY,
                severity=Severity.LOW
            ),
            ValidationRule(
                id="REL003",
                name="No Failure Notification",
                description="Check if failures trigger notifications",
                category=Category.RELIABILITY,
                severity=Severity.LOW
            ),

            # Best practice rules
            ValidationRule(
                id="BP001",
                name="No Environment Specified",
                description="Check if environment is specified",
                category=Category.BEST_PRACTICE,
                severity=Severity.LOW
            ),
            ValidationRule(
                id="BP002",
                name="No Version Pinning",
                description="Check if actions/dependencies are pinned",
                category=Category.BEST_PRACTICE,
                severity=Severity.MEDIUM,
                pattern=r'uses:\s*\S+@main'
            ),
            ValidationRule(
                id="BP003",
                name="No Working Directory",
                description="Check if working directory is specified",
                category=Category.BEST_PRACTICE,
                severity=Severity.LOW
            ),
            ValidationRule(
                id="BP004",
                name="Long Running Job",
                description="Check for jobs that may run too long",
                category=Category.BEST_PRACTICE,
                severity=Severity.INFO
            ),
        ]

    def _detect_config_type(self, file_path: str) -> Optional[str]:
        """Detect CI config type from file path."""
        path = Path(file_path)
        name = path.name.lower()
        parent = path.parent.name.lower()

        if parent == '.github' and name == 'workflows':
            return 'github-actions'
        elif name == '.gitlab-ci.yml':
            return 'gitlab'
        elif name == 'jenkinsfile':
            return 'jenkins'
        elif name == 'azure-pipelines.yml':
            return 'azure'
        elif name == 'config.yml' and parent == '.circleci':
            return 'circleci'
        elif name == 'travis.yml':
            return 'travis'

        return None

    def _parse_yaml(self, content: str) -> Optional[Dict]:
        """Parse YAML content."""
        try:
            return yaml.safe_load(content)
        except yaml.YAMLError:
            return None

    def _parse_json(self, content: str) -> Optional[Dict]:
        """Parse JSON content."""
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return None

    def _check_hardcoded_secrets(self, content: str) -> List[ValidationIssue]:
        """Check for hardcoded secrets."""
        issues = []
        for line_num, line in enumerate(content.splitlines(), 1):
            for rule in self._rules:
                if rule.pattern and 'secret' in rule.name.lower():
                    matches = re.finditer(rule.pattern, line, re.IGNORECASE)
                    for match in matches:
                        issues.append(ValidationIssue(
                            rule_id=rule.id,
                            rule_name=rule.name,
                            message=f"Potential hardcoded secret found",
                            severity=rule.severity,
                            category=rule.category,
                            line_number=line_num,
                            suggestion="Use secrets management or environment variables"
                        ))
        return issues

    def _check_version_pinning(self, content: str, config_type: str) -> List[ValidationIssue]:
        """Check for version pinning in actions."""
        issues = []

        if config_type == 'github-actions':
            for line_num, line in enumerate(content.splitlines(), 1):
                if 'uses:' in line and '@main' in line:
                    issues.append(ValidationIssue(
                        rule_id="BP002",
                        rule_name="No Version Pinning",
                        message=f"Action uses '@main' branch instead of specific version",
                        severity=Severity.MEDIUM,
                        category=Category.BEST_PRACTICE,
                        line_number=line_num,
                        suggestion="Pin to specific version or commit SHA"
                    ))
                elif 'uses:' in line and '@master' in line:
                    issues.append(ValidationIssue(
                        rule_id="BP002",
                        rule_name="No Version Pinning",
                        message=f"Action uses '@master' branch instead of specific version",
                        severity=Severity.MEDIUM,
                        category=Category.BEST_PRACTICE,
                        line_number=line_num,
                        suggestion="Pin to specific version or commit SHA"
                    ))

        return issues

    def _check_timeout(self, content: str, config_type: str) -> List[ValidationIssue]:
        """Check for timeout configuration."""
        issues = []

        if config_type == 'github-actions':
            if 'timeout-minutes' not in content:
                issues.append(ValidationIssue(
                    rule_id="REL001",
                    rule_name="No Timeout",
                    message="No timeout specified for workflow",
                    severity=Severity.MEDIUM,
                    category=Category.RELIABILITY,
                    suggestion="Add timeout-minutes to prevent hanging jobs"
                ))

        return issues

    def _check_caching(self, content: str, config_type: str) -> List[ValidationIssue]:
        """Check for cache configuration."""
        issues = []

        if config_type == 'github-actions':
            cache_keywords = ['cache:', 'cache-dependency-path', 'restore-cache', 'save-cache']
            if not any(kw in content for kw in cache_keywords):
                issues.append(ValidationIssue(
                    rule_id="PERF001",
                    name="No Cache Configuration",
                    message="No caching configuration found",
                    severity=Severity.MEDIUM,
                    category=Category.PERFORMANCE,
                    suggestion="Add caching for dependencies to improve performance"
                ))

        return issues

    def _check_notifications(self, content: str, config_type: str) -> List[ValidationIssue]:
        """Check for failure notifications."""
        issues = []

        notify_keywords = ['notify:', 'slack', 'email', 'webhook', 'on-failure']

        # For GitHub Actions
        if config_type == 'github-actions':
            if 'on:' in content:
                # Check if failure notification is configured
                has_failure_notify = 'on-failure' in content or 'failure' in content
                if not has_failure_notify:
                    # This is just informational
                    pass

        return issues

    def validate_file(self, file_path: str) -> ValidationReport:
        """Validate a CI configuration file."""
        import uuid

        report_id = str(uuid.uuid4())[:12]
        all_issues: List[ValidationIssue] = []

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
        except Exception as e:
            return ValidationReport(
                id=report_id,
                config_path=file_path,
                config_type="unknown",
                timestamp=datetime.now().timestamp(),
                issues=[ValidationIssue(
                    rule_id="ERR001",
                    rule_name="File Read Error",
                    message=f"Failed to read file: {str(e)}",
                    severity=Severity.HIGH,
                    category=Category.CONFIGURATION
                )]
            )

        config_type = self._detect_config_type(file_path)

        if not config_type:
            return ValidationReport(
                id=report_id,
                config_path=file_path,
                config_type="unknown",
                timestamp=datetime.now().timestamp(),
                issues=[ValidationIssue(
                    rule_id="ERR002",
                    rule_name="Unknown Config Type",
                    message="Unable to detect CI configuration type",
                    severity=Severity.MEDIUM,
                    category=Category.CONFIGURATION
                )]
            )

        # Run validation checks
        all_issues.extend(self._check_hardcoded_secrets(content))
        all_issues.extend(self._check_version_pinning(content, config_type))
        all_issues.extend(self._check_timeout(content, config_type))
        all_issues.extend(self._check_caching(content, config_type))
        all_issues.extend(self._check_notifications(content, config_type))

        # Update file path and line numbers
        for issue in all_issues:
            issue.file_path = file_path

        # Calculate score
        score = 100
        for issue in all_issues:
            if issue.severity == Severity.CRITICAL:
                score -= 20
            elif issue.severity == Severity.HIGH:
                score -= 10
            elif issue.severity == Severity.MEDIUM:
                score -= 5
            elif issue.severity == Severity.LOW:
                score -= 2

        score = max(0, score)

        report = ValidationReport(
            id=report_id,
            config_path=file_path,
            config_type=config_type,
            timestamp=datetime.now().timestamp(),
            issues=all_issues,
            passed_checks=len(self._rules) - len(all_issues),
            score=score
        )

        with self._lock:
            self._reports[report_id] = report

        return report

    def validate_directory(self, directory: str) -> List[ValidationReport]:
        """Validate all CI configs in a directory."""
        reports = []
        path = Path(directory)

        if not path.exists():
            return reports

        # Find all CI config files
        for file_path in path.rglob('*'):
            if file_path.is_file():
                config_type = self._detect_config_type(str(file_path))
                if config_type:
                    report = self.validate_file(str(file_path))
                    reports.append(report)

        return reports

    def get_report(self, report_id: str) -> Optional[ValidationReport]:
        """Get a validation report."""
        with self._lock:
            return self._reports.get(report_id)

    def get_reports(self, limit: int = 50) -> List[Dict]:
        """Get recent validation reports."""
        with self._lock:
            reports = sorted(
                self._reports.values(),
                key=lambda x: x.timestamp,
                reverse=True
            )

        return [
            {
                "id": r.id,
                "config_path": r.config_path,
                "config_type": r.config_type,
                "timestamp": r.timestamp,
                "score": r.score,
                "issues_count": len(r.issues),
                "passed_checks": r.passed_checks
            }
            for r in reports[:limit]
        ]

    def get_rules(self) -> List[Dict]:
        """Get all validation rules."""
        return [
            {
                "id": r.id,
                "name": r.name,
                "description": r.description,
                "category": r.category.value,
                "severity": r.severity.value
            }
            for r in self._rules
        ]

    def get_stats(self) -> Dict:
        """Get validator statistics."""
        with self._lock:
            total_reports = len(self._reports)
            avg_score = sum(r.score for r in self._reports.values()) / max(1, total_reports)

            issues_by_severity = {s.value: 0 for s in Severity}
            issues_by_category = {c.value: 0 for c in Category}

            for r in self._reports.values():
                for issue in r.issues:
                    issues_by_severity[issue.severity.value] += 1
                    issues_by_category[issue.category.value] += 1

            return {
                "total_reports": total_reports,
                "average_score": round(avg_score, 2),
                "issues_by_severity": issues_by_severity,
                "issues_by_category": issues_by_category,
                "rules_count": len(self._rules)
            }


# Global CI validator instance
ci_validator = CIValidator()
