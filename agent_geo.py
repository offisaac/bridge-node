"""Agent Geo Module

Geo-restrictions and location-based access control for agents including
country blocking, IP whitelisting, region-based access, and location verification.
"""
import time
import uuid
import threading
import json
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class GeoAction(str, Enum):
    """Geo action types."""
    ALLOW = "allow"
    BLOCK = "block"
    FLAG = "flag"
    LOG = "log"
    CHALLENGE = "challenge"


class GeoStatus(str, Enum):
    """Geo status types."""
    ALLOWED = "allowed"
    BLOCKED = "blocked"
    FLAGGED = "flagged"
    UNKNOWN = "unknown"
    PENDING = "pending"


class GeoLevel(str, Enum):
    """Geo verification levels."""
    COUNTRY = "country"
    REGION = "region"
    CITY = "city"
    ISP = "isp"
    ASN = "asn"


@dataclass
class GeoRule:
    """Geo restriction rule."""
    id: str
    name: str
    country_code: str = ""
    region: str = ""
    city: str = ""
    ip_range: str = ""
    asn: int = 0
    action: GeoAction = GeoAction.ALLOW
    enabled: bool = True
    priority: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GeoCheck:
    """Geo check record."""
    id: str
    agent_id: str
    ip_address: str
    country_code: str
    region: str = ""
    city: str = ""
    isp: str = ""
    asn: int = 0
    status: GeoStatus = GeoStatus.UNKNOWN
    timestamp: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GeoConfig:
    """Geo configuration."""
    default_action: GeoAction = GeoAction.ALLOW
    enable_logging: bool = True
    enable_challenge: bool = False
    challenge_threshold: int = 3
    cache_ttl: int = 3600
    block_unknown: bool = False
    verify_level: GeoLevel = GeoLevel.COUNTRY


@dataclass
class Location:
    """Geographic location."""
    latitude: float = 0.0
    longitude: float = 0.0
    country_code: str = ""
    country_name: str = ""
    region: str = ""
    city: str = ""
    isp: str = ""
    asn: int = 0
    timezone: str = ""


class GeoManager:
    """Geo restriction management engine."""

    def __init__(self, config: GeoConfig = None):
        self._lock = threading.RLock()
        self._config = config or GeoConfig()
        self._rules: Dict[str, GeoRule] = {}
        self._checks: List[GeoCheck] = []
        self._cache: Dict[str, Location] = {}
        self._cache_time: Dict[str, float] = {}
        self._country_stats: Dict[str, int] = defaultdict(int)
        self._ip_stats: Dict[str, int] = defaultdict(int)
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_rule(self, rule: GeoRule) -> bool:
        """Add geo rule."""
        with self._lock:
            self._rules[rule.id] = rule
            return True

    def remove_rule(self, rule_id: str) -> bool:
        """Remove geo rule."""
        with self._lock:
            if rule_id in self._rules:
                del self._rules[rule_id]
                return True
            return False

    def get_rule(self, rule_id: str) -> Optional[GeoRule]:
        """Get geo rule."""
        with self._lock:
            return self._rules.get(rule_id)

    def list_rules(self) -> List[GeoRule]:
        """List all geo rules."""
        with self._lock:
            return list(self._rules.values())

    def check_location(
        self,
        agent_id: str,
        ip_address: str,
        location: Location = None
    ) -> GeoCheck:
        """Check agent location against rules."""
        with self._lock:
            current_time = time.time()

            # Check cache first
            if ip_address in self._cache:
                cache_age = current_time - self._cache_time.get(ip_address, 0)
                if cache_age < self._config.cache_ttl:
                    location = self._cache[ip_address]

            # Create check record
            check = GeoCheck(
                id=str(uuid.uuid4())[:12],
                agent_id=agent_id,
                ip_address=ip_address,
                country_code=location.country_code if location else "",
                region=location.region if location else "",
                city=location.city if location else "",
                isp=location.isp if location else "",
                asn=location.asn if location else 0,
                timestamp=current_time
            )

            # Sort rules by priority
            sorted_rules = sorted(
                self._rules.values(),
                key=lambda r: r.priority,
                reverse=True
            )

            # Check against rules
            status = None
            matched_rule = None

            for rule in sorted_rules:
                if not rule.enabled:
                    continue

                # Match criteria
                matched = False

                if rule.country_code and rule.country_code == check.country_code:
                    matched = True
                elif rule.region and rule.region == check.region:
                    matched = True
                elif rule.city and rule.city == check.city:
                    matched = True
                elif rule.asn and rule.asn == check.asn:
                    matched = True
                elif rule.ip_range:
                    # Simple IP range check (CIDR not implemented)
                    if ip_address.startswith(rule.ip_range):
                        matched = True

                if matched:
                    if rule.action == GeoAction.ALLOW:
                        status = GeoStatus.ALLOWED
                    elif rule.action == GeoAction.BLOCK:
                        status = GeoStatus.BLOCKED
                    elif rule.action == GeoAction.FLAG:
                        status = GeoStatus.FLAGGED
                    matched_rule = rule
                    break

            # Default action if no rule matched
            if status is None:
                if self._config.default_action == GeoAction.ALLOW:
                    status = GeoStatus.ALLOWED
                elif self._config.default_action == GeoAction.BLOCK:
                    status = GeoStatus.BLOCKED
                else:
                    status = GeoStatus.UNKNOWN

            check.status = status

            # Update stats
            self._checks.append(check)
            if len(self._checks) > 10000:
                self._checks = self._checks[-5000:]

            if check.country_code:
                self._country_stats[check.country_code] += 1
            self._ip_stats[ip_address] += 1

            # Cache location
            if location:
                self._cache[ip_address] = location
                self._cache_time[ip_address] = current_time

            # Run hooks
            if matched_rule and matched_rule.action in [GeoAction.BLOCK, GeoAction.FLAG]:
                for hook in self._hooks.get("geo_check", []):
                    try:
                        hook(check, matched_rule)
                    except Exception:
                        pass

            return check

    def get_checks(
        self,
        agent_id: str = None,
        status: GeoStatus = None,
        limit: int = 100
    ) -> List[GeoCheck]:
        """Get geo check records."""
        with self._lock:
            checks = self._checks

            if agent_id:
                checks = [c for c in checks if c.agent_id == agent_id]
            if status:
                checks = [c for c in checks if c.status == status]

            return checks[-limit:]

    def get_country_stats(self) -> Dict[str, int]:
        """Get country statistics."""
        with self._lock:
            return dict(self._country_stats)

    def get_ip_stats(self) -> Dict[str, int]:
        """Get IP statistics."""
        with self._lock:
            return dict(self._ip_stats)

    def clear_cache(self) -> int:
        """Clear location cache."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            self._cache_time.clear()
            return count

    def add_hook(self, event: str, callback: Callable):
        """Add geo check hook."""
        with self._lock:
            self._hooks[event].append(callback)

    def get_config(self) -> GeoConfig:
        """Get geo configuration."""
        return self._config


class AgentGeo:
    """Agent geo-restrictions handling system."""

    def __init__(self, config: GeoConfig = None):
        self._manager = GeoManager(config)

    def add_rule(
        self,
        rule_id: str,
        name: str,
        country_code: str = "",
        region: str = "",
        city: str = "",
        ip_range: str = "",
        asn: int = 0,
        action: str = "allow",
        enabled: bool = True,
        priority: int = 0,
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Add geo rule."""
        rule = GeoRule(
            id=rule_id,
            name=name,
            country_code=country_code,
            region=region,
            city=city,
            ip_range=ip_range,
            asn=asn,
            action=GeoAction(action),
            enabled=enabled,
            priority=priority,
            metadata=metadata or {}
        )
        self._manager.add_rule(rule)
        return {"rule_id": rule_id, "success": True}

    def remove_rule(self, rule_id: str) -> bool:
        """Remove geo rule."""
        return self._manager.remove_rule(rule_id)

    def get_rule(self, rule_id: str) -> Optional[Dict[str, Any]]:
        """Get geo rule."""
        rule = self._manager.get_rule(rule_id)
        if not rule:
            return None
        return {
            "id": rule.id,
            "name": rule.name,
            "country_code": rule.country_code,
            "region": rule.region,
            "city": rule.city,
            "ip_range": rule.ip_range,
            "asn": rule.asn,
            "action": rule.action.value,
            "enabled": rule.enabled,
            "priority": rule.priority,
            "metadata": rule.metadata
        }

    def list_rules(self) -> List[Dict[str, Any]]:
        """List all geo rules."""
        rules = self._manager.list_rules()
        return [
            {
                "id": r.id,
                "name": r.name,
                "country_code": r.country_code,
                "region": r.region,
                "city": r.city,
                "ip_range": r.ip_range,
                "asn": r.asn,
                "action": r.action.value,
                "enabled": r.enabled,
                "priority": r.priority,
                "metadata": r.metadata
            }
            for r in rules
        ]

    def check_location(
        self,
        agent_id: str,
        ip_address: str,
        country_code: str = "",
        region: str = "",
        city: str = "",
        isp: str = "",
        asn: int = 0,
        latitude: float = 0.0,
        longitude: float = 0.0
    ) -> Dict[str, Any]:
        """Check agent location."""
        location = Location(
            latitude=latitude,
            longitude=longitude,
            country_code=country_code,
            region=region,
            city=city,
            isp=isp,
            asn=asn
        )
        check = self._manager.check_location(agent_id, ip_address, location)
        return {
            "id": check.id,
            "agent_id": check.agent_id,
            "ip_address": check.ip_address,
            "country_code": check.country_code,
            "region": check.region,
            "city": check.city,
            "status": check.status.value,
            "timestamp": check.timestamp,
            "metadata": check.metadata
        }

    def get_checks(
        self,
        agent_id: str = None,
        status: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get geo check records."""
        status_enum = GeoStatus(status) if status else None
        checks = self._manager.get_checks(agent_id, status_enum, limit)
        return [
            {
                "id": c.id,
                "agent_id": c.agent_id,
                "ip_address": c.ip_address,
                "country_code": c.country_code,
                "region": c.region,
                "city": c.city,
                "status": c.status.value,
                "timestamp": c.timestamp,
                "metadata": c.metadata
            }
            for c in checks
        ]

    def get_country_stats(self) -> Dict[str, int]:
        """Get country statistics."""
        return self._manager.get_country_stats()

    def get_ip_stats(self) -> Dict[str, int]:
        """Get IP statistics."""
        return self._manager.get_ip_stats()

    def clear_cache(self) -> int:
        """Clear location cache."""
        return self._manager.clear_cache()

    def update_config(
        self,
        default_action: str = None,
        enable_logging: bool = None,
        enable_challenge: bool = None,
        challenge_threshold: int = None,
        cache_ttl: int = None,
        block_unknown: bool = None,
        verify_level: str = None
    ) -> Dict[str, Any]:
        """Update geo configuration."""
        config = self._manager.get_config()

        if default_action:
            config.default_action = GeoAction(default_action)
        if enable_logging is not None:
            config.enable_logging = enable_logging
        if enable_challenge is not None:
            config.enable_challenge = enable_challenge
        if challenge_threshold is not None:
            config.challenge_threshold = challenge_threshold
        if cache_ttl is not None:
            config.cache_ttl = cache_ttl
        if block_unknown is not None:
            config.block_unknown = block_unknown
        if verify_level:
            config.verify_level = GeoLevel(verify_level)

        return {
            "default_action": config.default_action.value,
            "enable_logging": config.enable_logging,
            "enable_challenge": config.enable_challenge,
            "challenge_threshold": config.challenge_threshold,
            "cache_ttl": config.cache_ttl,
            "block_unknown": config.block_unknown,
            "verify_level": config.verify_level.value
        }

    def get_config(self) -> Dict[str, Any]:
        """Get geo configuration."""
        config = self._manager.get_config()
        return {
            "default_action": config.default_action.value,
            "enable_logging": config.enable_logging,
            "enable_challenge": config.enable_challenge,
            "challenge_threshold": config.challenge_threshold,
            "cache_ttl": config.cache_ttl,
            "block_unknown": config.block_unknown,
            "verify_level": config.verify_level.value
        }


# Global instance
agent_geo = AgentGeo()
