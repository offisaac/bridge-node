"""Agent CDN Module

CDN integration for agents including cache management, content distribution,
origin configuration, and CDN performance monitoring.
"""
import time
import uuid
import threading
import hashlib
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class CDNProvider(str, Enum):
    """Supported CDN providers."""
    CLOUDFLARE = "cloudflare"
    AWS_CLOUDFRONT = "aws_cloudfront"
    AZURE_CDN = "azure_cdn"
    GOOGLE_CDN = "google_cdn"
    FASTLY = "fastly"
    AKAMAI = "akamai"
    CUSTOM = "custom"


class CacheBehavior(str, Enum):
    """Cache behavior options."""
    FOLLOW_ORIGIN = "follow_origin"
    CACHE_ALL = "cache_all"
    NO_CACHE = "no_cache"
    BYPASS = "bypass"
    STALE_WHILE_REVALIDATE = "stale_while_revalidate"


class InvalidationType(str, Enum):
    """Cache invalidation types."""
    PATH = "path"
    TAG = "tag"
    WILDCARD = "wildcard"
    ALL = "all"


class CertificateType(str, Enum):
    """SSL certificate types."""
    DEDICATED = "dedicated"
    SHARED = "shared"
    CUSTOM = "custom"
    LETS_ENCRYPT = "lets_encrypt"


@dataclass
class CDNOrigin:
    """CDN origin server configuration."""
    id: str
    name: str
    hostname: str
    port: int = 80
    https: bool = True
    weight: int = 1
    is_backup: bool = False
    health_check_enabled: bool = True
    timeout: float = 30.0


@dataclass
class CDNCacheRule:
    """CDN cache rule."""
    id: str
    path_pattern: str
    cache_behavior: CacheBehavior = CacheBehavior.FOLLOW_ORIGIN
    ttl: int = 3600  # seconds
    stale_ttl: int = 86400
    cookies: str = ""
    query_string: str = "ignore_all"  # ignore_all, ignore_some, include_all
    enabled: bool = True


@dataclass
class CDNConfig:
    """CDN configuration."""
    name: str
    provider: CDNProvider
    zone_id: str = ""
    domain: str = ""
    certificate_type: CertificateType = CertificateType.SHARED
    ssl_enabled: bool = True
    http2_enabled: bool = True
    http3_enabled: bool = False
    min_ttl: int = 0
    max_ttl: int = 31536000
    default_ttl: int = 3600
    enable_compression: bool = True
    compression_types: List[str] = field(default_factory=lambda: ["gzip", "brotli"])
    enable_geo_location: bool = True


@dataclass
class CDNStats:
    """CDN statistics."""
    total_requests: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    bandwidth_gb: float = 0.0
    avg_response_time: float = 0.0
    total_errors: int = 0
    origin_requests: int = 0


@dataclass
class CDNInvalidation:
    """CDN cache invalidation."""
    id: str
    status: str = "pending"
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    items_count: int = 0


@dataclass
class CDNMetric:
    """CDN metric data point."""
    timestamp: float
    requests: int = 0
    bandwidth: float = 0.0
    cache_hit_ratio: float = 0.0
    avg_latency: float = 0.0
    errors: int = 0


class CDNManager:
    """CDN manager for content distribution."""

    def __init__(self, config: CDNConfig):
        self.config = config
        self._lock = threading.RLock()
        self._origins: Dict[str, CDNOrigin] = {}
        self._cache_rules: Dict[str, CDNCacheRule] = {}
        self._invalidations: Dict[str, CDNInvalidation] = {}
        self._metrics: List[CDNMetric] = []
        self._stats = CDNStats()
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def add_origin(
        self,
        name: str,
        hostname: str,
        port: int = 80,
        https: bool = True,
        weight: int = 1,
        is_backup: bool = False,
        health_check_enabled: bool = True,
        timeout: float = 30.0
    ) -> str:
        """Add an origin server."""
        with self._lock:
            origin_id = str(uuid.uuid4())[:8]

            origin = CDNOrigin(
                id=origin_id,
                name=name,
                hostname=hostname,
                port=port,
                https=https,
                weight=weight,
                is_backup=is_backup,
                health_check_enabled=health_check_enabled,
                timeout=timeout
            )

            self._origins[origin_id] = origin
            return origin_id

    def remove_origin(self, origin_id: str) -> bool:
        """Remove an origin server."""
        with self._lock:
            if origin_id in self._origins:
                del self._origins[origin_id]
                return True
            return False

    def get_origin(self, origin_id: str) -> Optional[CDNOrigin]:
        """Get origin by ID."""
        with self._lock:
            return self._origins.get(origin_id)

    def list_origins(self) -> List[CDNOrigin]:
        """List all origins."""
        with self._lock:
            return list(self._origins.values())

    def update_origin(
        self,
        origin_id: str,
        name: str = None,
        hostname: str = None,
        port: int = None,
        https: bool = None,
        weight: int = None,
        is_backup: bool = None
    ) -> bool:
        """Update an origin."""
        with self._lock:
            origin = self._origins.get(origin_id)
            if not origin:
                return False

            if name is not None:
                origin.name = name
            if hostname is not None:
                origin.hostname = hostname
            if port is not None:
                origin.port = port
            if https is not None:
                origin.https = https
            if weight is not None:
                origin.weight = weight
            if is_backup is not None:
                origin.is_backup = is_backup

            return True

    def add_cache_rule(
        self,
        path_pattern: str,
        cache_behavior: CacheBehavior = CacheBehavior.FOLLOW_ORIGIN,
        ttl: int = 3600,
        stale_ttl: int = 86400,
        cookies: str = "",
        query_string: str = "ignore_all"
    ) -> str:
        """Add a cache rule."""
        with self._lock:
            rule_id = str(uuid.uuid4())[:8]

            rule = CDNCacheRule(
                id=rule_id,
                path_pattern=path_pattern,
                cache_behavior=cache_behavior,
                ttl=ttl,
                stale_ttl=stale_ttl,
                cookies=cookies,
                query_string=query_string
            )

            self._cache_rules[rule_id] = rule
            return rule_id

    def remove_cache_rule(self, rule_id: str) -> bool:
        """Remove a cache rule."""
        with self._lock:
            if rule_id in self._cache_rules:
                del self._cache_rules[rule_id]
                return True
            return False

    def list_cache_rules(self) -> List[CDNCacheRule]:
        """List all cache rules."""
        with self._lock:
            return list(self._cache_rules.values())

    def update_cache_rule(
        self,
        rule_id: str,
        path_pattern: str = None,
        cache_behavior: CacheBehavior = None,
        ttl: int = None,
        stale_ttl: int = None,
        cookies: str = None,
        query_string: str = None,
        enabled: bool = None
    ) -> bool:
        """Update a cache rule."""
        with self._lock:
            rule = self._cache_rules.get(rule_id)
            if not rule:
                return False

            if path_pattern is not None:
                rule.path_pattern = path_pattern
            if cache_behavior is not None:
                rule.cache_behavior = cache_behavior
            if ttl is not None:
                rule.ttl = ttl
            if stale_ttl is not None:
                rule.stale_ttl = stale_ttl
            if cookies is not None:
                rule.cookies = cookies
            if query_string is not None:
                rule.query_string = query_string
            if enabled is not None:
                rule.enabled = enabled

            return True

    def create_invalidation(
        self,
        invalidation_type: InvalidationType,
        paths: List[str] = None,
        tags: List[str] = None
    ) -> str:
        """Create a cache invalidation."""
        with self._lock:
            invalidation_id = str(uuid.uuid4())[:8]

            invalidation = CDNInvalidation(
                id=invalidation_id,
                status="in_progress",
                items_count=len(paths) if paths else len(tags) if tags else 0
            )

            self._invalidations[invalidation_id] = invalidation

            # Simulate invalidation completion
            time.sleep(0.1)
            invalidation.status = "completed"
            invalidation.completed_at = time.time()

            return invalidation_id

    def get_invalidation(self, invalidation_id: str) -> Optional[CDNInvalidation]:
        """Get invalidation by ID."""
        with self._lock:
            return self._invalidations.get(invalidation_id)

    def list_invalidations(self) -> List[CDNInvalidation]:
        """List all invalidations."""
        with self._lock:
            return list(self._invalidations.values())

    def record_request(self, is_cache_hit: bool, response_time: float = 0.0, bandwidth: float = 0.0):
        """Record request statistics."""
        with self._lock:
            self._stats.total_requests += 1

            if is_cache_hit:
                self._stats.cache_hits += 1
            else:
                self._stats.cache_misses += 1
                self._stats.origin_requests += 1

            if response_time > 0:
                # Update average response time
                total = self._stats.avg_response_time * (self._stats.total_requests - 1) + response_time
                self._stats.avg_response_time = total / self._stats.total_requests

            self._stats.bandwidth_gb += bandwidth / (1024 * 1024 * 1024)

    def get_stats(self) -> Dict[str, Any]:
        """Get CDN statistics."""
        with self._lock:
            cache_hit_ratio = 0.0
            if self._stats.total_requests > 0:
                cache_hit_ratio = self._stats.cache_hits / self._stats.total_requests

            return {
                "total_requests": self._stats.total_requests,
                "cache_hits": self._stats.cache_hits,
                "cache_misses": self._stats.cache_misses,
                "cache_hit_ratio": round(cache_hit_ratio * 100, 2),
                "bandwidth_gb": round(self._stats.bandwidth_gb, 3),
                "avg_response_time_ms": round(self._stats.avg_response_time, 3),
                "total_errors": self._stats.total_errors,
                "origin_requests": self._stats.origin_requests
            }

    def add_metric(self, metric: CDNMetric):
        """Add a metric data point."""
        with self._lock:
            self._metrics.append(metric)
            # Keep only last 1000 metrics
            if len(self._metrics) > 1000:
                self._metrics = self._metrics[-1000:]

    def get_metrics(self, start_time: float = None, end_time: float = None) -> List[Dict[str, Any]]:
        """Get CDN metrics."""
        with self._lock:
            metrics = self._metrics

            if start_time:
                metrics = [m for m in metrics if m.timestamp >= start_time]
            if end_time:
                metrics = [m for m in metrics if m.timestamp <= end_time]

            return [
                {
                    "timestamp": m.timestamp,
                    "requests": m.requests,
                    "bandwidth": m.bandwidth,
                    "cache_hit_ratio": m.cache_hit_ratio,
                    "avg_latency": m.avg_latency,
                    "errors": m.errors
                }
                for m in metrics
            ]

    def purge_all(self) -> str:
        """Purge all cached content."""
        return self.create_invalidation(InvalidationType.ALL)


class AgentCDN:
    """Agent CDN management system."""

    def __init__(self):
        self._lock = threading.RLock()
        self._cdns: Dict[str, CDNManager] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def create_cdn(
        self,
        name: str,
        provider: CDNProvider,
        zone_id: str = "",
        domain: str = "",
        certificate_type: CertificateType = CertificateType.SHARED,
        ssl_enabled: bool = True,
        http2_enabled: bool = True,
        http3_enabled: bool = False,
        min_ttl: int = 0,
        max_ttl: int = 31536000,
        default_ttl: int = 3600,
        enable_compression: bool = True,
        compression_types: List[str] = None,
        enable_geo_location: bool = True
    ) -> str:
        """Create a new CDN."""
        with self._lock:
            cdn_id = str(uuid.uuid4())[:8]

            config = CDNConfig(
                name=name,
                provider=provider,
                zone_id=zone_id,
                domain=domain,
                certificate_type=certificate_type,
                ssl_enabled=ssl_enabled,
                http2_enabled=http2_enabled,
                http3_enabled=http3_enabled,
                min_ttl=min_ttl,
                max_ttl=max_ttl,
                default_ttl=default_ttl,
                enable_compression=enable_compression,
                compression_types=compression_types or ["gzip", "brotli"],
                enable_geo_location=enable_geo_location
            )

            cdn = CDNManager(config)
            self._cdns[cdn_id] = cdn
            return cdn_id

    def get_cdn(self, cdn_id: str) -> Optional[CDNManager]:
        """Get CDN by ID."""
        with self._lock:
            return self._cdns.get(cdn_id)

    def delete_cdn(self, cdn_id: str) -> bool:
        """Delete a CDN."""
        with self._lock:
            if cdn_id in self._cdns:
                del self._cdns[cdn_id]
                return True
            return False

    def list_cdns(self) -> List[Dict[str, Any]]:
        """List all CDNs."""
        with self._lock:
            return [
                {
                    "id": cdn_id,
                    "name": cdn.config.name,
                    "provider": cdn.config.provider.value,
                    "domain": cdn.config.domain,
                    "stats": cdn.get_stats()
                }
                for cdn_id, cdn in self._cdns.items()
            ]

    def add_origin(
        self,
        cdn_id: str,
        name: str,
        hostname: str,
        port: int = 80,
        https: bool = True,
        weight: int = 1,
        is_backup: bool = False,
        health_check_enabled: bool = True,
        timeout: float = 30.0
    ) -> Optional[str]:
        """Add an origin to a CDN."""
        cdn = self.get_cdn(cdn_id)
        if not cdn:
            return None
        return cdn.add_origin(name, hostname, port, https, weight, is_backup, health_check_enabled, timeout)

    def remove_origin(self, cdn_id: str, origin_id: str) -> bool:
        """Remove an origin from a CDN."""
        cdn = self.get_cdn(cdn_id)
        if not cdn:
            return False
        return cdn.remove_origin(origin_id)

    def get_origins(self, cdn_id: str) -> List[Dict[str, Any]]:
        """Get origins for a CDN."""
        cdn = self.get_cdn(cdn_id)
        if not cdn:
            return []

        origins = cdn.list_origins()
        return [
            {
                "id": o.id,
                "name": o.name,
                "hostname": o.hostname,
                "port": o.port,
                "https": o.https,
                "weight": o.weight,
                "is_backup": o.is_backup
            }
            for o in origins
        ]

    def add_cache_rule(
        self,
        cdn_id: str,
        path_pattern: str,
        cache_behavior: CacheBehavior = CacheBehavior.FOLLOW_ORIGIN,
        ttl: int = 3600,
        stale_ttl: int = 86400,
        cookies: str = "",
        query_string: str = "ignore_all"
    ) -> Optional[str]:
        """Add a cache rule to a CDN."""
        cdn = self.get_cdn(cdn_id)
        if not cdn:
            return None
        return cdn.add_cache_rule(path_pattern, cache_behavior, ttl, stale_ttl, cookies, query_string)

    def remove_cache_rule(self, cdn_id: str, rule_id: str) -> bool:
        """Remove a cache rule from a CDN."""
        cdn = self.get_cdn(cdn_id)
        if not cdn:
            return False
        return cdn.remove_cache_rule(rule_id)

    def get_cache_rules(self, cdn_id: str) -> List[Dict[str, Any]]:
        """Get cache rules for a CDN."""
        cdn = self.get_cdn(cdn_id)
        if not cdn:
            return []

        rules = cdn.list_cache_rules()
        return [
            {
                "id": r.id,
                "path_pattern": r.path_pattern,
                "cache_behavior": r.cache_behavior.value,
                "ttl": r.ttl,
                "stale_ttl": r.stale_ttl,
                "enabled": r.enabled
            }
            for r in rules
        ]

    def create_invalidation(
        self,
        cdn_id: str,
        invalidation_type: InvalidationType,
        paths: List[str] = None,
        tags: List[str] = None
    ) -> Optional[str]:
        """Create a cache invalidation."""
        cdn = self.get_cdn(cdn_id)
        if not cdn:
            return None
        return cdn.create_invalidation(invalidation_type, paths, tags)

    def purge_all(self, cdn_id: str) -> Optional[str]:
        """Purge all cached content."""
        cdn = self.get_cdn(cdn_id)
        if not cdn:
            return None
        return cdn.purge_all()

    def get_invalidations(self, cdn_id: str) -> List[Dict[str, Any]]:
        """Get invalidations for a CDN."""
        cdn = self.get_cdn(cdn_id)
        if not cdn:
            return []

        invalidations = cdn.list_invalidations()
        return [
            {
                "id": i.id,
                "status": i.status,
                "created_at": i.created_at,
                "completed_at": i.completed_at,
                "items_count": i.items_count
            }
            for i in invalidations
        ]

    def record_request(self, cdn_id: str, is_cache_hit: bool, response_time: float = 0.0, bandwidth: float = 0.0):
        """Record request statistics."""
        cdn = self.get_cdn(cdn_id)
        if cdn:
            cdn.record_request(is_cache_hit, response_time, bandwidth)

    def get_stats(self, cdn_id: str) -> Optional[Dict[str, Any]]:
        """Get CDN statistics."""
        cdn = self.get_cdn(cdn_id)
        if not cdn:
            return None
        return cdn.get_stats()

    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics for all CDNs."""
        return {
            cdn_id: cdn.get_stats()
            for cdn_id, cdn in self._cdns.items()
        }

    def get_metrics(self, cdn_id: str, start_time: float = None, end_time: float = None) -> List[Dict[str, Any]]:
        """Get CDN metrics."""
        cdn = self.get_cdn(cdn_id)
        if not cdn:
            return []
        return cdn.get_metrics(start_time, end_time)


# Global CDN instance
agent_cdn = AgentCDN()
