"""Agent WAF Module

Web Application Firewall for agents including rule management, request filtering,
attack detection, logging, and real-time protection.
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


class WAFMode(str, Enum):
    """WAF mode types."""
    BLOCKING = "blocking"
    MONITORING = "monitoring"
    LEARNING = "learning"
    DISABLED = "disabled"


class WAFAction(str, Enum):
    """WAF action types."""
    ALLOW = "allow"
    BLOCK = "block"
    LOG = "log"
    CHALLENGE = "challenge"
    REDIRECT = "redirect"


class ThreatCategory(str, Enum):
    """Threat category types."""
    SQL_INJECTION = "sql_injection"
    XSS = "xss"
    CSRF = "csrf"
    LFI = "lfi"
    RFI = "rfi"
    COMMAND_INJECTION = "command_injection"
    PATH_TRAVERSAL = "path_traversal"
    DDoS = "ddos"
    BOT = "bot"
    SCANNING = "scanning"
    UNKNOWN = "unknown"


class RuleStatus(str, Enum):
    """Rule status types."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    TESTING = "testing"
    DISABLED = "disabled"


@dataclass
class WAFRule:
    """WAF rule data."""
    id: str
    name: str
    pattern: str
    threat_category: ThreatCategory
    action: WAFAction
    severity: str  # critical, high, medium, low, info
    status: RuleStatus
    created_at: float
    expires_at: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class WAFRequest:
    """WAF request data."""
    id: str
    method: str
    path: str
    headers: Dict[str, str]
    body: str
    client_ip: str
    user_agent: str
    timestamp: float
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class WAFEvent:
    """WAF security event."""
    id: str
    request_id: str
    rule_id: str
    rule_name: str
    threat_category: ThreatCategory
    action: WAFAction
    severity: str
    blocked: bool
    timestamp: float
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class WAFConfig:
    """WAF configuration."""
    mode: WAFMode = WAFMode.BLOCKING
    max_request_size: int = 10485760  # 10MB
    request_timeout: int = 30
    ip_whitelist: List[str] = field(default_factory=list)
    ip_blacklist: List[str] = field(default_factory=list)
    rate_limit_requests: int = 100
    rate_limit_window: int = 60  # seconds
    enable_sql_injection: bool = True
    enable_xss: bool = True
    enable_csrf: bool = True
    enable_lfi: bool = True
    enable_rfi: bool = True
    enable_command_injection: bool = True
    enable_path_traversal: bool = True


class WAFManager:
    """WAF management engine."""

    def __init__(self, config: WAFConfig = None):
        self._lock = threading.RLock()
        self._config = config or WAFConfig()
        self._rules: Dict[str, WAFRule] = {}
        self._events: List[WAFEvent] = []
        self._requests: Dict[str, WAFRequest] = {}
        self._ip_stats: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"requests": 0, "blocked": 0, "first_seen": 0, "last_seen": 0})
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._compile_patterns()

    def _compile_patterns(self):
        """Compile default attack patterns."""
        self._patterns = {
            ThreatCategory.SQL_INJECTION: [
                r"(?i)(union\s+select|select\s+.*\s+from|insert\s+into|delete\s+from|drop\s+table|exec\s+|execute\s+)",
                r"(?i)(or\s+1\s*=\s*1|and\s+1\s*=\s*1|'|;|--|\/\*|\*\/)",
                r"(?i)(union\s+all\s+select|having\s+\d+=\d+|benchmark\(|sleep\()",
            ],
            ThreatCategory.XSS: [
                r"(?i)<script[^>]*>.*?</script>",
                r"(?i)javascript:",
                r"(?i)on(load|error|click|mouse\w+)\s*=",
                r"<img[^>]+src=[\"']?",
                r"<iframe[^>]*>",
            ],
            ThreatCategory.COMMAND_INJECTION: [
                r"[;&|`$]",
                r"\|\s*\w+",
                r"&&\s*\w+",
                r"\$\(.*\)",
                r"`.*`",
            ],
            ThreatCategory.PATH_TRAVERSAL: [
                r"\.\.[\\/]",
                r"\.\.%2f",
                r"%2e%2e",
                r"\/etc\/passwd",
                r"\/windows\/system32",
            ],
            ThreatCategory.LFI: [
                r"\.\.[\\/]",
                r"%2e%2e",
                r"(?i)\/proc\/self",
                r"(?i)\/etc\/shadow",
            ],
            ThreatCategory.RFI: [
                r"(?i)http[s]?:\/\/",
                r"(?i)ftp:\/\/",
            ],
        }

    def add_rule(
        self,
        name: str,
        pattern: str,
        threat_category: str,
        action: str,
        severity: str,
        metadata: Dict[str, Any] = None
    ) -> WAFRule:
        """Add WAF rule."""
        with self._lock:
            rule = WAFRule(
                id=str(uuid.uuid4())[:12],
                name=name,
                pattern=pattern,
                threat_category=ThreatCategory(threat_category),
                action=WAFAction(action),
                severity=severity,
                status=RuleStatus.ACTIVE,
                created_at=time.time(),
                metadata=metadata or {}
            )
            self._rules[rule.id] = rule
            return rule

    def get_rule(self, rule_id: str) -> Optional[WAFRule]:
        """Get WAF rule."""
        with self._lock:
            return self._rules.get(rule_id)

    def get_rules(
        self,
        threat_category: str = None,
        status: str = None,
        limit: int = 100
    ) -> List[WAFRule]:
        """Get WAF rules."""
        with self._lock:
            rules = list(self._rules.values())
            if threat_category:
                rules = [r for r in rules if r.threat_category.value == threat_category]
            if status:
                rules = [r for r in rules if r.status.value == status]
            return rules[:limit]

    def update_rule(
        self,
        rule_id: str,
        name: str = None,
        pattern: str = None,
        threat_category: str = None,
        action: str = None,
        severity: str = None,
        status: str = None
    ) -> Optional[WAFRule]:
        """Update WAF rule."""
        with self._lock:
            rule = self._rules.get(rule_id)
            if not rule:
                return None

            if name is not None:
                rule.name = name
            if pattern is not None:
                rule.pattern = pattern
            if threat_category is not None:
                rule.threat_category = ThreatCategory(threat_category)
            if action is not None:
                rule.action = WAFAction(action)
            if severity is not None:
                rule.severity = severity
            if status is not None:
                rule.status = RuleStatus(status)

            return rule

    def delete_rule(self, rule_id: str) -> bool:
        """Delete WAF rule."""
        with self._lock:
            if rule_id in self._rules:
                del self._rules[rule_id]
                return True
            return False

    def check_request(
        self,
        method: str,
        path: str,
        headers: Dict[str, str] = None,
        body: str = "",
        client_ip: str = "",
        user_agent: str = ""
    ) -> Dict[str, Any]:
        """Check request against WAF rules."""
        with self._lock:
            # Check mode
            if self._config.mode == WAFMode.DISABLED:
                return {"allowed": True, "events": []}

            # Create request record
            request_id = str(uuid.uuid4())[:12]
            request = WAFRequest(
                id=request_id,
                method=method,
                path=path,
                headers=headers or {},
                body=body,
                client_ip=client_ip,
                user_agent=user_agent,
                timestamp=time.time()
            )
            self._requests[request_id] = request

            # Update IP stats
            if client_ip:
                stats = self._ip_stats[client_ip]
                if stats["first_seen"] == 0:
                    stats["first_seen"] = time.time()
                stats["last_seen"] = time.time()
                stats["requests"] += 1

            # Check IP blacklist/whitelist
            if client_ip:
                if client_ip in self._config.ip_blacklist:
                    event = self._create_event(request_id, None, "IP Blacklisted", ThreatCategory.UNKNOWN, WAFAction.BLOCK, "critical", True)
                    return {"allowed": False, "events": [event], "reason": "IP blacklisted"}

                if client_ip in self._config.ip_whitelist:
                    return {"allowed": True, "events": []}

            # Rate limiting
            if client_ip and self._config.rate_limit_requests > 0:
                stats = self._ip_stats[client_ip]
                window_start = time.time() - self._config.rate_limit_window
                # Simplified rate limit check
                if stats["requests"] > self._config.rate_limit_requests:
                    stats["blocked"] += 1
                    event = self._create_event(request_id, None, "Rate Limit Exceeded", ThreatCategory.DDoS, WAFAction.BLOCK, "high", True)
                    return {"allowed": False, "events": [event], "reason": "Rate limit exceeded"}

            # Check request size
            if len(body) > self._config.max_request_size:
                event = self._create_event(request_id, None, "Request Too Large", ThreatCategory.UNKNOWN, WAFAction.BLOCK, "medium", True)
                return {"allowed": False, "events": [event], "reason": "Request size exceeded"}

            # Analyze request
            events = []
            blocked = False

            # Check path and body against patterns
            combined_content = f"{path} {body}"

            # Check against built-in patterns
            for category, patterns in self._patterns.items():
                # Check if this category is enabled
                if not self._is_category_enabled(category):
                    continue

                for pattern in patterns:
                    try:
                        if re.search(pattern, combined_content, re.IGNORECASE):
                            action = WAFAction.BLOCK if self._config.mode == WAFMode.BLOCKING else WAFAction.LOG
                            severity = "high"

                            event = self._create_event(request_id, None, f"Detected {category.value}", category, action, severity, action == WAFAction.BLOCK)
                            events.append(event)

                            if action == WAFAction.BLOCK:
                                blocked = True
                            break
                    except re.error:
                        pass

            # Check against custom rules
            for rule in self._rules.values():
                if rule.status != RuleStatus.ACTIVE:
                    continue

                if not self._is_category_enabled(rule.threat_category):
                    continue

                try:
                    if re.search(rule.pattern, combined_content, re.IGNORECASE):
                        action = rule.action
                        event = self._create_event(request_id, rule.id, rule.name, rule.threat_category, action, rule.severity, action == WAFAction.BLOCK)
                        events.append(event)

                        if action == WAFAction.BLOCK:
                            blocked = True
                except re.error:
                    pass

            # Run hooks for blocked requests
            if blocked:
                for event in events:
                    if event.blocked:
                        for hook in self._hooks.get("blocked", []):
                            try:
                                hook(event)
                            except Exception:
                                pass

            return {
                "allowed": not blocked,
                "events": events,
                "request_id": request_id
            }

    def _is_category_enabled(self, category: ThreatCategory) -> bool:
        """Check if threat category is enabled."""
        enabled_map = {
            ThreatCategory.SQL_INJECTION: self._config.enable_sql_injection,
            ThreatCategory.XSS: self._config.enable_xss,
            ThreatCategory.CSRF: self._config.enable_csrf,
            ThreatCategory.LFI: self._config.enable_lfi,
            ThreatCategory.RFI: self._config.enable_rfi,
            ThreatCategory.COMMAND_INJECTION: self._config.enable_command_injection,
            ThreatCategory.PATH_TRAVERSAL: self._config.enable_path_traversal,
        }
        return enabled_map.get(category, True)

    def _create_event(
        self,
        request_id: str,
        rule_id: str,
        rule_name: str,
        threat_category: ThreatCategory,
        action: WAFAction,
        severity: str,
        blocked: bool
    ) -> WAFEvent:
        """Create WAF event."""
        event = WAFEvent(
            id=str(uuid.uuid4())[:12],
            request_id=request_id,
            rule_id=rule_id or "",
            rule_name=rule_name,
            threat_category=threat_category,
            action=action,
            severity=severity,
            blocked=blocked,
            timestamp=time.time()
        )
        self._events.append(event)

        # Keep only last 1000 events
        if len(self._events) > 1000:
            self._events = self._events[-500:]

        return event

    def get_events(
        self,
        threat_category: str = None,
        action: str = None,
        limit: int = 100
    ) -> List[WAFEvent]:
        """Get WAF events."""
        with self._lock:
            events = self._events
            if threat_category:
                events = [e for e in events if e.threat_category.value == threat_category]
            if action:
                events = [e for e in events if e.action.value == action]
            return events[-limit:]

    def get_request(self, request_id: str) -> Optional[WAFRequest]:
        """Get request by ID."""
        with self._lock:
            return self._requests.get(request_id)

    def get_ip_stats(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get IP statistics."""
        with self._lock:
            stats = sorted(
                self._ip_stats.items(),
                key=lambda x: x[1]["requests"],
                reverse=True
            )[:limit]
            return [
                {
                    "ip": ip,
                    "requests": s["requests"],
                    "blocked": s["blocked"],
                    "first_seen": s["first_seen"],
                    "last_seen": s["last_seen"]
                }
                for ip, s in stats
            ]

    def add_to_blacklist(self, ip: str):
        """Add IP to blacklist."""
        with self._lock:
            if ip not in self._config.ip_blacklist:
                self._config.ip_blacklist.append(ip)

    def remove_from_blacklist(self, ip: str) -> bool:
        """Remove IP from blacklist."""
        with self._lock:
            if ip in self._config.ip_blacklist:
                self._config.ip_blacklist.remove(ip)
                return True
            return False

    def add_to_whitelist(self, ip: str):
        """Add IP to whitelist."""
        with self._lock:
            if ip not in self._config.ip_whitelist:
                self._config.ip_whitelist.append(ip)

    def remove_from_whitelist(self, ip: str) -> bool:
        """Remove IP from whitelist."""
        with self._lock:
            if ip in self._config.ip_whitelist:
                self._config.ip_whitelist.remove(ip)
                return True
            return False

    def get_stats(self) -> Dict[str, Any]:
        """Get WAF statistics."""
        with self._lock:
            total_events = len(self._events)
            blocked = sum(1 for e in self._events if e.blocked)
            by_category = defaultdict(int)
            by_action = defaultdict(int)

            for e in self._events:
                by_category[e.threat_category.value] += 1
                by_action[e.action.value] += 1

            return {
                "total_rules": len(self._rules),
                "active_rules": sum(1 for r in self._rules.values() if r.status == RuleStatus.ACTIVE),
                "total_events": total_events,
                "blocked_events": blocked,
                "allowed_events": total_events - blocked,
                "by_category": dict(by_category),
                "by_action": dict(by_action),
                "mode": self._config.mode.value,
                "unique_ips": len(self._ip_stats)
            }

    def update_config(
        self,
        mode: str = None,
        max_request_size: int = None,
        request_timeout: int = None,
        rate_limit_requests: int = None,
        rate_limit_window: int = None,
        enable_sql_injection: bool = None,
        enable_xss: bool = None,
        enable_csrf: bool = None,
        enable_lfi: bool = None,
        enable_rfi: bool = None,
        enable_command_injection: bool = None,
        enable_path_traversal: bool = None
    ):
        """Update WAF configuration."""
        with self._lock:
            if mode is not None:
                self._config.mode = WAFMode(mode)
            if max_request_size is not None:
                self._config.max_request_size = max_request_size
            if request_timeout is not None:
                self._config.request_timeout = request_timeout
            if rate_limit_requests is not None:
                self._config.rate_limit_requests = rate_limit_requests
            if rate_limit_window is not None:
                self._config.rate_limit_window = rate_limit_window
            if enable_sql_injection is not None:
                self._config.enable_sql_injection = enable_sql_injection
            if enable_xss is not None:
                self._config.enable_xss = enable_xss
            if enable_csrf is not None:
                self._config.enable_csrf = enable_csrf
            if enable_lfi is not None:
                self._config.enable_lfi = enable_lfi
            if enable_rfi is not None:
                self._config.enable_rfi = enable_rfi
            if enable_command_injection is not None:
                self._config.enable_command_injection = enable_command_injection
            if enable_path_traversal is not None:
                self._config.enable_path_traversal = enable_path_traversal

    def get_config(self) -> WAFConfig:
        """Get WAF configuration."""
        return self._config


class AgentWAF:
    """Agent WAF handling system."""

    def __init__(self, config: WAFConfig = None):
        self._manager = WAFManager(config)

    def add_rule(
        self,
        name: str,
        pattern: str,
        threat_category: str,
        action: str,
        severity: str,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Add WAF rule."""
        rule = self._manager.add_rule(name, pattern, threat_category, action, severity, metadata)
        return {
            "id": rule.id,
            "name": rule.name,
            "threat_category": rule.threat_category.value,
            "action": rule.action.value,
            "severity": rule.severity,
            "status": rule.status.value,
            "created_at": rule.created_at
        }

    def get_rule(self, rule_id: str) -> Optional[Dict[str, Any]]:
        """Get WAF rule."""
        rule = self._manager.get_rule(rule_id)
        if not rule:
            return None
        return {
            "id": rule.id,
            "name": rule.name,
            "pattern": rule.pattern,
            "threat_category": rule.threat_category.value,
            "action": rule.action.value,
            "severity": rule.severity,
            "status": rule.status.value,
            "created_at": rule.created_at,
            "metadata": rule.metadata
        }

    def get_rules(
        self,
        threat_category: str = None,
        status: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get WAF rules."""
        rules = self._manager.get_rules(threat_category, status, limit)
        return [
            {
                "id": r.id,
                "name": r.name,
                "threat_category": r.threat_category.value,
                "action": r.action.value,
                "severity": r.severity,
                "status": r.status.value,
                "created_at": r.created_at
            }
            for r in rules
        ]

    def update_rule(
        self,
        rule_id: str,
        name: str = None,
        pattern: str = None,
        threat_category: str = None,
        action: str = None,
        severity: str = None,
        status: str = None
    ) -> Optional[Dict[str, Any]]:
        """Update WAF rule."""
        rule = self._manager.update_rule(rule_id, name, pattern, threat_category, action, severity, status)
        if not rule:
            return None
        return {
            "id": rule.id,
            "name": rule.name,
            "threat_category": rule.threat_category.value,
            "action": rule.action.value,
            "severity": rule.severity,
            "status": rule.status.value,
            "created_at": rule.created_at
        }

    def delete_rule(self, rule_id: str) -> bool:
        """Delete WAF rule."""
        return self._manager.delete_rule(rule_id)

    def check_request(
        self,
        method: str,
        path: str,
        headers: Dict[str, str] = None,
        body: str = "",
        client_ip: str = "",
        user_agent: str = ""
    ) -> Dict[str, Any]:
        """Check request against WAF rules."""
        result = self._manager.check_request(method, path, headers, body, client_ip, user_agent)
        return {
            "allowed": result["allowed"],
            "request_id": result.get("request_id"),
            "reason": result.get("reason"),
            "events": [
                {
                    "id": e.id,
                    "rule_name": e.rule_name,
                    "threat_category": e.threat_category.value,
                    "action": e.action.value,
                    "severity": e.severity,
                    "blocked": e.blocked,
                    "timestamp": e.timestamp
                }
                for e in result.get("events", [])
            ]
        }

    def get_events(
        self,
        threat_category: str = None,
        action: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get WAF events."""
        events = self._manager.get_events(threat_category, action, limit)
        return [
            {
                "id": e.id,
                "request_id": e.request_id,
                "rule_id": e.rule_id,
                "rule_name": e.rule_name,
                "threat_category": e.threat_category.value,
                "action": e.action.value,
                "severity": e.severity,
                "blocked": e.blocked,
                "timestamp": e.timestamp
            }
            for e in events
        ]

    def get_request(self, request_id: str) -> Optional[Dict[str, Any]]:
        """Get request by ID."""
        request = self._manager.get_request(request_id)
        if not request:
            return None
        return {
            "id": request.id,
            "method": request.method,
            "path": request.path,
            "headers": request.headers,
            "body": request.body,
            "client_ip": request.client_ip,
            "user_agent": request.user_agent,
            "timestamp": request.timestamp
        }

    def get_ip_stats(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get IP statistics."""
        return self._manager.get_ip_stats(limit)

    def add_to_blacklist(self, ip: str):
        """Add IP to blacklist."""
        self._manager.add_to_blacklist(ip)

    def remove_from_blacklist(self, ip: str) -> bool:
        """Remove IP from blacklist."""
        return self._manager.remove_from_blacklist(ip)

    def add_to_whitelist(self, ip: str):
        """Add IP to whitelist."""
        self._manager.add_to_whitelist(ip)

    def remove_from_whitelist(self, ip: str) -> bool:
        """Remove IP from whitelist."""
        return self._manager.remove_from_whitelist(ip)

    def get_stats(self) -> Dict[str, Any]:
        """Get WAF statistics."""
        return self._manager.get_stats()

    def update_config(
        self,
        mode: str = None,
        max_request_size: int = None,
        request_timeout: int = None,
        rate_limit_requests: int = None,
        rate_limit_window: int = None,
        enable_sql_injection: bool = None,
        enable_xss: bool = None,
        enable_csrf: bool = None,
        enable_lfi: bool = None,
        enable_rfi: bool = None,
        enable_command_injection: bool = None,
        enable_path_traversal: bool = None
    ) -> Dict[str, Any]:
        """Update WAF configuration."""
        self._manager.update_config(
            mode=mode,
            max_request_size=max_request_size,
            request_timeout=request_timeout,
            rate_limit_requests=rate_limit_requests,
            rate_limit_window=rate_limit_window,
            enable_sql_injection=enable_sql_injection,
            enable_xss=enable_xss,
            enable_csrf=enable_csrf,
            enable_lfi=enable_lfi,
            enable_rfi=enable_rfi,
            enable_command_injection=enable_command_injection,
            enable_path_traversal=enable_path_traversal
        )
        return self.get_config()

    def get_config(self) -> Dict[str, Any]:
        """Get WAF configuration."""
        config = self._manager.get_config()
        return {
            "mode": config.mode.value,
            "max_request_size": config.max_request_size,
            "request_timeout": config.request_timeout,
            "ip_whitelist": config.ip_whitelist,
            "ip_blacklist": config.ip_blacklist,
            "rate_limit_requests": config.rate_limit_requests,
            "rate_limit_window": config.rate_limit_window,
            "enable_sql_injection": config.enable_sql_injection,
            "enable_xss": config.enable_xss,
            "enable_csrf": config.enable_csrf,
            "enable_lfi": config.enable_lfi,
            "enable_rfi": config.enable_rfi,
            "enable_command_injection": config.enable_command_injection,
            "enable_path_traversal": config.enable_path_traversal
        }


# Global instance
agent_waf = AgentWAF()
