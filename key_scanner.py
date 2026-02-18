"""Key Scanner Module

Scan code repository for leaked API keys, secrets, tokens, and sensitive information.
"""
import os
import re
import math
import hashlib
import threading
from typing import Dict, List, Optional, Set
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
import json


class Severity(str, Enum):
    """Severity levels for detected secrets."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"
    INFO = "info"


@dataclass
class SecretPattern:
    """Secret pattern definition."""
    name: str
    pattern: str
    severity: Severity
    description: str
    validator: Optional[callable] = None


@dataclass
class ScanResult:
    """Scan result for a single file."""
    file_path: str
    line_number: int
    line_content: str
    pattern_name: str
    severity: Severity
    description: str
    redacted_content: str = ""


@dataclass
class ScanReport:
    """Complete scan report."""
    id: str
    scan_path: str
    timestamp: float
    files_scanned: int
    secrets_found: int
    results: List[ScanResult]
    severity_counts: Dict[str, int] = field(default_factory=dict)


class KeyScanner:
    """Scan code repository for leaked secrets."""

    # Common secret patterns
    PATTERNS = [
        # AWS
        SecretPattern(
            name="AWS Access Key",
            pattern=r'(?:aws_access_key_id|aws_secret_access_key|aws_session_token)\s*[:=]\s*["\']?([A-Z0-9]{20})["\']?',
            severity=Severity.CRITICAL,
            description="AWS credentials found"
        ),
        SecretPattern(
            name="AWS Secret Key",
            pattern=r'["\'][A-Za-z0-9/+=]{40}["\']',
            severity=Severity.CRITICAL,
            description="Potential AWS secret key"
        ),

        # GitHub/GitLab tokens
        SecretPattern(
            name="GitHub Token",
            pattern=r'(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}',
            severity=Severity.CRITICAL,
            description="GitHub personal access token"
        ),
        SecretPattern(
            name="GitLab Token",
            pattern=r'glpat-[0-9a-zA-Z\-]{20}',
            severity=Severity.CRITICAL,
            description="GitLab personal access token"
        ),

        # Generic API keys
        SecretPattern(
            name="Generic API Key",
            pattern=r'(?:api[_-]?key|apikey|api_secret|secret_key)\s*[:=]\s*["\']?([a-zA-Z0-9]{16,64})["\']?',
            severity=Severity.HIGH,
            description="Generic API key pattern"
        ),
        SecretPattern(
            name="Generic Secret",
            pattern=r'(?:secret|token|password|passwd|pwd)\s*[:=]\s*["\']?([a-zA-Z0-9_\-]{8,64})["\']?',
            severity=Severity.MEDIUM,
            description="Potential secret or token"
        ),

        # JWT
        SecretPattern(
            name="JWT Token",
            pattern=r'eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+',
            severity=Severity.HIGH,
            description="JSON Web Token"
        ),

        # Private keys
        SecretPattern(
            name="RSA Private Key",
            pattern=r'-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----',
            severity=Severity.CRITICAL,
            description="Private key file"
        ),
        SecretPattern(
            name="SSH Private Key",
            pattern=r'-----BEGIN OPENSSH PRIVATE KEY-----',
            severity=Severity.CRITICAL,
            description="SSH private key"
        ),

        # Database connection strings
        SecretPattern(
            name="Database URL",
            pattern=r'(?:mongodb|mysql|postgresql|redis)://[^:\s]+:[^@\s]+@',
            severity=Severity.CRITICAL,
            description="Database connection string with credentials"
        ),

        # Slack tokens
        SecretPattern(
            name="Slack Token",
            pattern=r'xox[baprs]-[0-9]{10,13}-[0-9]{10,13}[a-zA-Z0-9-]*',
            severity=Severity.HIGH,
            description="Slack API token"
        ),

        # Stripe keys
        SecretPattern(
            name="Stripe Key",
            pattern=r'sk_live_[0-9a-zA-Z]{24}',
            severity=Severity.CRITICAL,
            description="Stripe live secret key"
        ),

        # OpenAI API key
        SecretPattern(
            name="OpenAI API Key",
            pattern=r'sk-[A-Za-z0-9]{48,}',
            severity=Severity.CRITICAL,
            description="OpenAI API key"
        ),

        # Bearer tokens
        SecretPattern(
            name="Bearer Token",
            pattern=r'Bearer\s+[A-Za-z0-9\-_\.=]+',
            severity=Severity.HIGH,
            description="Bearer authorization token"
        ),

        # Basic auth
        SecretPattern(
            name="Basic Auth",
            pattern=r'Basic\s+[A-Za-z0-9+/=]{20,}',
            severity=Severity.HIGH,
            description="Basic authentication header"
        ),
    ]

    # File extensions to scan
    SCANNABLE_EXTENSIONS = {
        '.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.go', '.rb',
        '.php', '.cs', '.cpp', '.c', '.h', '.yml', '.yaml', '.json',
        '.xml', '.env', '.ini', '.conf', '.config', '.sh', '.bash',
        '.zsh', '.sql', '.gradle', '.properties', '.toml', '.cfg'
    }

    # Directories to skip
    SKIP_DIRECTORIES = {
        'node_modules', '.git', '__pycache__', 'venv', '.venv',
        'env', '.envs', 'dist', 'build', '.idea', '.vscode',
        'vendor', 'packages', '.tox', '.pytest_cache', '.mypy_cache'
    }

    def __init__(self):
        self._lock = threading.RLock()
        self._reports: Dict[str, ScanReport] = {}
        self._current_scan: Optional[str] = None

    def _calculate_entropy(self, string: str) -> float:
        """Calculate Shannon entropy of a string."""
        if not string:
            return 0.0

        import collections
        freq = collections.Counter(string)
        entropy = 0.0
        length = len(string)

        for count in freq.values():
            probability = count / length
            entropy -= probability * math.log2(probability)

        return entropy

    def _redact_secret(self, content: str, pattern: str) -> str:
        """Redact secret in content."""
        try:
            redacted = re.sub(pattern, '***REDACTED***', content, flags=re.IGNORECASE)
            return redacted
        except:
            return content[:50] + "***REDACTED***"

    def _should_scan_file(self, file_path: str) -> bool:
        """Check if file should be scanned."""
        path = Path(file_path)

        # Check extension
        if path.suffix.lower() not in self.SCANNABLE_EXTENSIONS:
            return False

        # Check directory
        for skip_dir in self.SKIP_DIRECTORIES:
            if skip_dir in path.parts:
                return False

        return True

    def scan_file(self, file_path: str) -> List[ScanResult]:
        """Scan a single file for secrets."""
        results = []

        if not self._should_scan_file(file_path):
            return results

        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                lines = f.readlines()
        except Exception:
            return results

        for line_num, line in enumerate(lines, 1):
            # Skip comments that are clearly not secrets
            if line.strip().startswith('#') or line.strip().startswith('//'):
                continue

            for secret_pattern in self.PATTERNS:
                try:
                    matches = re.finditer(secret_pattern.pattern, line, re.IGNORECASE)
                    for match in matches:
                        redacted = self._redact_secret(line.strip(), secret_pattern.pattern)

                        result = ScanResult(
                            file_path=file_path,
                            line_number=line_num,
                            line_content=line.strip(),
                            pattern_name=secret_pattern.name,
                            severity=secret_pattern.severity,
                            description=secret_pattern.description,
                            redacted_content=redacted
                        )
                        results.append(result)
                except re.error:
                    continue

        return results

    def scan_directory(
        self,
        directory: str,
        file_pattern: str = "*",
        recursive: bool = True
    ) -> ScanReport:
        """Scan a directory for secrets."""
        import uuid

        report_id = str(uuid.uuid4())[:12]
        all_results: List[ScanResult] = []
        files_scanned = 0

        with self._lock:
            self._current_scan = report_id

        try:
            path = Path(directory)

            if not path.exists():
                return ScanReport(
                    id=report_id,
                    scan_path=directory,
                    timestamp=datetime.now().timestamp(),
                    files_scanned=0,
                    secrets_found=0,
                    results=[]
                )

            # Collect files to scan
            files_to_scan = []

            if recursive:
                for file_path in path.rglob(f"*{file_pattern}"):
                    if file_path.is_file():
                        files_to_scan.append(str(file_path))
            else:
                for file_path in path.glob(f"*{file_pattern}"):
                    if file_path.is_file():
                        files_to_scan.append(str(file_path))

            # Scan files concurrently
            def scan_worker(files: List[str]):
                nonlocal all_results, files_scanned
                for f in files:
                    with self._lock:
                        if self._current_scan != report_id:
                            return

                    results = self.scan_file(f)
                    if results:
                        all_results.extend(results)
                    files_scanned += 1

            # Split files for parallel scanning
            chunk_size = max(1, len(files_to_scan) // 4)
            chunks = [files_to_scan[i:i + chunk_size]
                     for i in range(0, len(files_to_scan), chunk_size)]

            threads = []
            for chunk in chunks:
                t = threading.Thread(target=scan_worker, args=(chunk,))
                t.start()
                threads.append(t)

            for t in threads:
                t.join()

        finally:
            with self._lock:
                self._current_scan = None

        # Calculate severity counts
        severity_counts = {s.value: 0 for s in Severity}
        for result in all_results:
            severity_counts[result.severity.value] += 1

        report = ScanReport(
            id=report_id,
            scan_path=directory,
            timestamp=datetime.now().timestamp(),
            files_scanned=files_scanned,
            secrets_found=len(all_results),
            results=all_results,
            severity_counts=severity_counts
        )

        with self._lock:
            self._reports[report_id] = report

        return report

    def get_report(self, report_id: str) -> Optional[ScanReport]:
        """Get a scan report by ID."""
        with self._lock:
            return self._reports.get(report_id)

    def get_reports(self, limit: int = 50) -> List[Dict]:
        """Get recent scan reports."""
        with self._lock:
            reports = sorted(
                self._reports.values(),
                key=lambda x: x.timestamp,
                reverse=True
            )

        return [
            {
                "id": r.id,
                "scan_path": r.scan_path,
                "timestamp": r.timestamp,
                "files_scanned": r.files_scanned,
                "secrets_found": r.secrets_found,
                "severity_counts": r.severity_counts
            }
            for r in reports[:limit]
        ]

    def cancel_scan(self) -> bool:
        """Cancel current scan."""
        with self._lock:
            if self._current_scan:
                self._current_scan = None
                return True
        return False

    def get_stats(self) -> Dict:
        """Get scanner statistics."""
        with self._lock:
            total_scans = len(self._reports)
            total_secrets = sum(r.secrets_found for r in self._reports.values())

            severity_totals = {s.value: 0 for s in Severity}
            for r in self._reports.values():
                for sev, count in r.severity_counts.items():
                    severity_totals[sev] += count

            return {
                "total_scans": total_scans,
                "total_secrets_found": total_secrets,
                "severity_totals": severity_totals,
                "patterns_count": len(self.PATTERNS)
            }


# Global key scanner instance
key_scanner = KeyScanner()
