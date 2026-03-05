"""Agent Load Balancer 2 Module

Advanced load balancing strategies for agent task distribution including
weighted routing, health-based routing, geographic routing, and adaptive load balancing.
"""
import time
import uuid
import threading
import hashlib
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
import random


class LBAlgorithm(str, Enum):
    """Load balancing algorithms."""
    ROUND_ROBIN = "round_robin"
    LEAST_CONNECTIONS = "least_connections"
    LEAST_RESPONSE_TIME = "least_response_time"
    WEIGHTED = "weighted"
    IP_HASH = "ip_hash"
    RANDOM = "random"
    ADAPTIVE = "adaptive"
    GEOGRAPHIC = "geographic"
    HEALTH_BASED = "health_based"


class HealthCheckStatus(str, Enum):
    """Health check status."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class LBEndpoint:
    """Load balancer endpoint (backend)."""
    id: str
    name: str
    address: str
    port: int = 80
    weight: int = 1
    max_connections: int = 100
    health_check_url: str = ""
    region: str = "default"
    is_enabled: bool = True
    health_status: HealthCheckStatus = HealthCheckStatus.UNKNOWN
    response_time: float = 0.0
    request_count: int = 0
    error_count: int = 0
    last_check: float = field(default_factory=time.time)
    consecutive_failures: int = 0


@dataclass
class LBConfig:
    """Load balancer configuration."""
    name: str
    algorithm: LBAlgorithm = LBAlgorithm.ROUND_ROBIN
    health_check_interval: float = 30.0
    health_check_timeout: float = 5.0
    health_check_threshold: int = 3
    connection_timeout: float = 30.0
    idle_timeout: float = 60.0
    max_retries: int = 3
    enable_failover: bool = True
    enable_rate_limiting: bool = False
    rate_limit: int = 1000


@dataclass
class LBRule:
    """Load balancing rule."""
    id: str
    name: str
    match_type: str  # header, path, query, cookie, ip
    match_pattern: str
    target_endpoints: List[str] = field(default_factory=list)
    weight: int = 1
    is_enabled: bool = True


@dataclass
class LBStats:
    """Load balancer statistics."""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    redirected_requests: int = 0
    avg_response_time: float = 0.0
    total_response_time: float = 0.0
    active_connections: int = 0


class LoadBalancer:
    """Load balancer for agent endpoints."""

    def __init__(self, config: LBConfig):
        self.config = config
        self._lock = threading.RLock()
        self._endpoints: Dict[str, LBEndpoint] = {}
        self._rules: Dict[str, LBRule] = {}
        self._stats = LBStats()
        self._health_checks: Dict[str, float] = {}
        self._last_endpoint_index = 0
        self._connection_counts: Dict[str, int] = defaultdict(int)

    def add_endpoint(
        self,
        name: str,
        address: str,
        port: int = 80,
        weight: int = 1,
        max_connections: int = 100,
        health_check_url: str = "",
        region: str = "default"
    ) -> str:
        """Add an endpoint to the load balancer."""
        with self._lock:
            endpoint_id = str(uuid.uuid4())[:8]

            endpoint = LBEndpoint(
                id=endpoint_id,
                name=name,
                address=address,
                port=port,
                weight=weight,
                max_connections=max_connections,
                health_check_url=health_check_url,
                region=region
            )

            self._endpoints[endpoint_id] = endpoint
            self._health_checks[endpoint_id] = time.time()

            return endpoint_id

    def remove_endpoint(self, endpoint_id: str) -> bool:
        """Remove an endpoint from the load balancer."""
        with self._lock:
            if endpoint_id in self._endpoints:
                del self._endpoints[endpoint_id]
                if endpoint_id in self._connection_counts:
                    del self._connection_counts[endpoint_id]
                return True
            return False

    def get_endpoint(self, endpoint_id: str) -> Optional[LBEndpoint]:
        """Get endpoint by ID."""
        with self._lock:
            return self._endpoints.get(endpoint_id)

    def list_endpoints(self, enabled_only: bool = False) -> List[LBEndpoint]:
        """List all endpoints."""
        with self._lock:
            endpoints = list(self._endpoints.values())
            if enabled_only:
                endpoints = [e for e in endpoints if e.is_enabled]
            return endpoints

    def update_endpoint(
        self,
        endpoint_id: str,
        name: str = None,
        address: str = None,
        port: int = None,
        weight: int = None,
        max_connections: int = None,
        is_enabled: bool = None
    ) -> bool:
        """Update an endpoint."""
        with self._lock:
            endpoint = self._endpoints.get(endpoint_id)
            if not endpoint:
                return False

            if name is not None:
                endpoint.name = name
            if address is not None:
                endpoint.address = address
            if port is not None:
                endpoint.port = port
            if weight is not None:
                endpoint.weight = weight
            if max_connections is not None:
                endpoint.max_connections = max_connections
            if is_enabled is not None:
                endpoint.is_enabled = is_enabled

            return True

    def add_rule(
        self,
        name: str,
        match_type: str,
        match_pattern: str,
        target_endpoints: List[str] = None,
        weight: int = 1
    ) -> str:
        """Add a load balancing rule."""
        with self._lock:
            rule_id = str(uuid.uuid4())[:8]

            rule = LBRule(
                id=rule_id,
                name=name,
                match_type=match_type,
                match_pattern=match_pattern,
                target_endpoints=target_endpoints or [],
                weight=weight
            )

            self._rules[rule_id] = rule
            return rule_id

    def remove_rule(self, rule_id: str) -> bool:
        """Remove a rule."""
        with self._lock:
            if rule_id in self._rules:
                del self._rules[rule_id]
                return True
            return False

    def list_rules(self) -> List[LBRule]:
        """List all rules."""
        with self._lock:
            return list(self._rules.values())

    def select_endpoint(
        self,
        client_ip: str = "",
        headers: Dict[str, str] = None,
        path: str = "",
        query: str = ""
    ) -> Optional[LBEndpoint]:
        """Select an endpoint based on the configured algorithm."""
        with self._lock:
            enabled_endpoints = [e for e in self._endpoints.values() if e.is_enabled]

            if not enabled_endpoints:
                return None

            # Filter healthy endpoints if health-based
            if self.config.algorithm == LBAlgorithm.HEALTH_BASED:
                enabled_endpoints = [
                    e for e in enabled_endpoints
                    if e.health_status in (HealthCheckStatus.HEALTHY, HealthCheckStatus.UNKNOWN)
                ]
                if not enabled_endpoints:
                    return None

            # Apply rules first
            matched_rule = self._match_rule(headers, path, query, client_ip)
            if matched_rule and matched_rule.target_endpoints:
                target_ids = matched_rule.target_endpoints
                enabled_endpoints = [
                    e for e in enabled_endpoints
                    if e.id in target_ids
                ]
                if not enabled_endpoints:
                    return None

            # Select based on algorithm
            if self.config.algorithm == LBAlgorithm.ROUND_ROBIN:
                return self._round_robin_select(enabled_endpoints)
            elif self.config.algorithm == LBAlgorithm.LEAST_CONNECTIONS:
                return self._least_connections_select(enabled_endpoints)
            elif self.config.algorithm == LBAlgorithm.LEAST_RESPONSE_TIME:
                return self._least_response_time_select(enabled_endpoints)
            elif self.config.algorithm == LBAlgorithm.WEIGHTED:
                return self._weighted_select(enabled_endpoints)
            elif self.config.algorithm == LBAlgorithm.IP_HASH:
                return self._ip_hash_select(enabled_endpoints, client_ip)
            elif self.config.algorithm == LBAlgorithm.RANDOM:
                return self._random_select(enabled_endpoints)
            elif self.config.algorithm == LBAlgorithm.ADAPTIVE:
                return self._adaptive_select(enabled_endpoints)
            elif self.config.algorithm == LBAlgorithm.GEOGRAPHIC:
                return self._geographic_select(enabled_endpoints, headers)
            else:
                return enabled_endpoints[0]

    def _match_rule(
        self,
        headers: Dict[str, str],
        path: str,
        query: str,
        client_ip: str
    ) -> Optional[LBRule]:
        """Match a rule based on request attributes."""
        for rule in self._rules.values():
            if not rule.is_enabled:
                continue

            if rule.match_type == "header":
                header_name = rule.match_pattern.split(":")[0] if ":" in rule.match_pattern else rule.match_pattern
                if headers and header_name in headers:
                    return rule
            elif rule.match_type == "path":
                if path and rule.match_pattern in path:
                    return rule
            elif rule.match_type == "query":
                if query and rule.match_pattern in query:
                    return rule
            elif rule.match_type == "ip":
                if client_ip and rule.match_pattern in client_ip:
                    return rule

        return None

    def _round_robin_select(self, endpoints: List[LBEndpoint]) -> LBEndpoint:
        """Round robin selection."""
        index = self._last_endpoint_index % len(endpoints)
        self._last_endpoint_index = (self._last_endpoint_index + 1) % len(endpoints)
        return endpoints[index]

    def _least_connections_select(self, endpoints: List[LBEndpoint]) -> LBEndpoint:
        """Select endpoint with least connections."""
        return min(endpoints, key=lambda e: self._connection_counts.get(e.id, 0))

    def _least_response_time_select(self, endpoints: List[LBEndpoint]) -> LBEndpoint:
        """Select endpoint with least response time."""
        return min(endpoints, key=lambda e: e.response_time)

    def _weighted_select(self, endpoints: List[LBEndpoint]) -> LBEndpoint:
        """Weighted selection based on endpoint weight."""
        weights = [e.weight for e in endpoints]
        total_weight = sum(weights)
        if total_weight == 0:
            return random.choice(endpoints)

        rand = random.randint(1, total_weight)
        cumulative = 0

        for endpoint in endpoints:
            cumulative += endpoint.weight
            if rand <= cumulative:
                return endpoint

        return endpoints[-1]

    def _ip_hash_select(self, endpoints: List[LBEndpoint], client_ip: str) -> LBEndpoint:
        """IP hash-based selection."""
        if not client_ip:
            return random.choice(endpoints)

        hash_value = int(hashlib.md5(client_ip.encode()).hexdigest(), 16)
        index = hash_value % len(endpoints)
        return endpoints[index]

    def _random_select(self, endpoints: List[LBEndpoint]) -> LBEndpoint:
        """Random selection."""
        return random.choice(endpoints)

    def _adaptive_select(self, endpoints: List[LBEndpoint]) -> LBEndpoint:
        """Adaptive selection based on health and load."""
        # Score each endpoint based on multiple factors
        scored_endpoints = []

        for endpoint in endpoints:
            health_score = 1.0 if endpoint.health_status == HealthCheckStatus.HEALTHY else 0.5
            connection_ratio = 1.0 - (self._connection_counts.get(endpoint.id, 0) / endpoint.max_connections)
            response_score = 1.0 / (1.0 + endpoint.response_time)

            total_score = health_score * 0.4 + connection_ratio * 0.3 + response_score * 0.3
            scored_endpoints.append((endpoint, total_score))

        scored_endpoints.sort(key=lambda x: x[1], reverse=True)
        return scored_endpoints[0][0]

    def _geographic_select(self, endpoints: List[LBEndpoint], headers: Dict[str, str]) -> LBEndpoint:
        """Geographic-based selection."""
        # Simple geo selection - in production, use MaxMind or similar
        client_region = "default"

        if headers:
            # Check for region headers
            if "x-region" in headers:
                client_region = headers["x-region"]
            elif "cf-ipcountry" in headers:
                client_region = headers["cf-ipcountry"]

        # Find endpoints in same region
        same_region = [e for e in endpoints if e.region == client_region]
        if same_region:
            return self._least_connections_select(same_region)

        # Fall back to least connections
        return self._least_connections_select(endpoints)

    def record_request(self, endpoint_id: str, success: bool = True, response_time: float = 0.0):
        """Record request statistics."""
        with self._lock:
            endpoint = self._endpoints.get(endpoint_id)
            if not endpoint:
                return

            endpoint.request_count += 1
            if not success:
                endpoint.error_count += 1
                endpoint.consecutive_failures += 1
            else:
                endpoint.consecutive_failures = 0
                # Update response time with exponential moving average
                if response_time > 0:
                    endpoint.response_time = 0.7 * endpoint.response_time + 0.3 * response_time

            # Update stats
            self._stats.total_requests += 1
            if success:
                self._stats.successful_requests += 1
                self._stats.total_response_time += response_time
                if self._stats.successful_requests > 0:
                    self._stats.avg_response_time = (
                        self._stats.total_response_time / self._stats.successful_requests
                    )
            else:
                self._stats.failed_requests += 1

    def increment_connections(self, endpoint_id: str):
        """Increment connection count for an endpoint."""
        with self._lock:
            self._connection_counts[endpoint_id] += 1
            self._stats.active_connections = sum(self._connection_counts.values())

    def decrement_connections(self, endpoint_id: str):
        """Decrement connection count for an endpoint."""
        with self._lock:
            if self._connection_counts[endpoint_id] > 0:
                self._connection_counts[endpoint_id] -= 1
            self._stats.active_connections = sum(self._connection_counts.values())

    def get_stats(self) -> Dict[str, Any]:
        """Get load balancer statistics."""
        with self._lock:
            return {
                "total_requests": self._stats.total_requests,
                "successful_requests": self._stats.successful_requests,
                "failed_requests": self._stats.failed_requests,
                "avg_response_time": round(self._stats.avg_response_time, 3),
                "active_connections": self._stats.active_connections,
                "endpoint_count": len(self._endpoints),
                "enabled_endpoints": len([e for e in self._endpoints.values() if e.is_enabled])
            }


class AgentLoadBalancer2:
    """Agent load balancer management system."""

    def __init__(self):
        self._lock = threading.RLock()
        self._load_balancers: Dict[str, LoadBalancer] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def create_load_balancer(
        self,
        name: str,
        algorithm: LBAlgorithm = LBAlgorithm.ROUND_ROBIN,
        health_check_interval: float = 30.0,
        health_check_timeout: float = 5.0,
        health_check_threshold: int = 3,
        connection_timeout: float = 30.0,
        idle_timeout: float = 60.0,
        max_retries: int = 3,
        enable_failover: bool = True,
        enable_rate_limiting: bool = False,
        rate_limit: int = 1000
    ) -> str:
        """Create a new load balancer."""
        with self._lock:
            lb_id = str(uuid.uuid4())[:8]

            config = LBConfig(
                name=name,
                algorithm=algorithm,
                health_check_interval=health_check_interval,
                health_check_timeout=health_check_timeout,
                health_check_threshold=health_check_threshold,
                connection_timeout=connection_timeout,
                idle_timeout=idle_timeout,
                max_retries=max_retries,
                enable_failover=enable_failover,
                enable_rate_limiting=enable_rate_limiting,
                rate_limit=rate_limit
            )

            lb = LoadBalancer(config)
            self._load_balancers[lb_id] = lb
            return lb_id

    def get_load_balancer(self, lb_id: str) -> Optional[LoadBalancer]:
        """Get load balancer by ID."""
        with self._lock:
            return self._load_balancers.get(lb_id)

    def delete_load_balancer(self, lb_id: str) -> bool:
        """Delete a load balancer."""
        with self._lock:
            if lb_id in self._load_balancers:
                del self._load_balancers[lb_id]
                return True
            return False

    def list_load_balancers(self) -> List[Dict[str, Any]]:
        """List all load balancers."""
        with self._lock:
            return [
                {
                    "id": lb_id,
                    "name": lb.config.name,
                    "algorithm": lb.config.algorithm.value,
                    "endpoint_count": len(lb._endpoints),
                    "stats": lb.get_stats()
                }
                for lb_id, lb in self._load_balancers.items()
            ]

    def add_endpoint(
        self,
        lb_id: str,
        name: str,
        address: str,
        port: int = 80,
        weight: int = 1,
        max_connections: int = 100,
        health_check_url: str = "",
        region: str = "default"
    ) -> Optional[str]:
        """Add an endpoint to a load balancer."""
        lb = self.get_load_balancer(lb_id)
        if not lb:
            return None
        return lb.add_endpoint(name, address, port, weight, max_connections, health_check_url, region)

    def remove_endpoint(self, lb_id: str, endpoint_id: str) -> bool:
        """Remove an endpoint from a load balancer."""
        lb = self.get_load_balancer(lb_id)
        if not lb:
            return False
        return lb.remove_endpoint(endpoint_id)

    def get_endpoints(self, lb_id: str) -> List[Dict[str, Any]]:
        """Get endpoints for a load balancer."""
        lb = self.get_load_balancer(lb_id)
        if not lb:
            return []

        endpoints = lb.list_endpoints()
        return [
            {
                "id": e.id,
                "name": e.name,
                "address": e.address,
                "port": e.port,
                "weight": e.weight,
                "region": e.region,
                "is_enabled": e.is_enabled,
                "health_status": e.health_status.value,
                "response_time": round(e.response_time, 3),
                "request_count": e.request_count,
                "error_count": e.error_count
            }
            for e in endpoints
        ]

    def update_endpoint(
        self,
        lb_id: str,
        endpoint_id: str,
        name: str = None,
        address: str = None,
        port: int = None,
        weight: int = None,
        max_connections: int = None,
        is_enabled: bool = None
    ) -> bool:
        """Update an endpoint."""
        lb = self.get_load_balancer(lb_id)
        if not lb:
            return False
        return lb.update_endpoint(endpoint_id, name, address, port, weight, max_connections, is_enabled)

    def add_rule(
        self,
        lb_id: str,
        name: str,
        match_type: str,
        match_pattern: str,
        target_endpoints: List[str] = None,
        weight: int = 1
    ) -> Optional[str]:
        """Add a rule to a load balancer."""
        lb = self.get_load_balancer(lb_id)
        if not lb:
            return None
        return lb.add_rule(name, match_type, match_pattern, target_endpoints, weight)

    def remove_rule(self, lb_id: str, rule_id: str) -> bool:
        """Remove a rule from a load balancer."""
        lb = self.get_load_balancer(lb_id)
        if not lb:
            return False
        return lb.remove_rule(rule_id)

    def get_rules(self, lb_id: str) -> List[Dict[str, Any]]:
        """Get rules for a load balancer."""
        lb = self.get_load_balancer(lb_id)
        if not lb:
            return []

        rules = lb.list_rules()
        return [
            {
                "id": r.id,
                "name": r.name,
                "match_type": r.match_type,
                "match_pattern": r.match_pattern,
                "target_endpoints": r.target_endpoints,
                "weight": r.weight,
                "is_enabled": r.is_enabled
            }
            for r in rules
        ]

    def select_endpoint(
        self,
        lb_id: str,
        client_ip: str = "",
        headers: Dict[str, str] = None,
        path: str = "",
        query: str = ""
    ) -> Optional[Dict[str, Any]]:
        """Select an endpoint from a load balancer."""
        lb = self.get_load_balancer(lb_id)
        if not lb:
            return None

        endpoint = lb.select_endpoint(client_ip, headers, path, query)
        if not endpoint:
            return None

        lb.increment_connections(endpoint.id)

        return {
            "endpoint_id": endpoint.id,
            "name": endpoint.name,
            "address": endpoint.address,
            "port": endpoint.port
        }

    def release_endpoint(self, lb_id: str, endpoint_id: str):
        """Release an endpoint after request completion."""
        lb = self.get_load_balancer(lb_id)
        if lb:
            lb.decrement_connections(endpoint_id)

    def record_request(
        self,
        lb_id: str,
        endpoint_id: str,
        success: bool = True,
        response_time: float = 0.0
    ):
        """Record request statistics."""
        lb = self.get_load_balancer(lb_id)
        if lb:
            lb.record_request(endpoint_id, success, response_time)

    def get_stats(self, lb_id: str) -> Optional[Dict[str, Any]]:
        """Get statistics for a load balancer."""
        lb = self.get_load_balancer(lb_id)
        if not lb:
            return None
        return lb.get_stats()

    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics for all load balancers."""
        return {
            lb_id: lb.get_stats()
            for lb_id, lb in self._load_balancers.items()
        }

    def register_hook(self, event_type: str, handler: Callable):
        """Register an event hook."""
        self._hooks[event_type].append(handler)


# Global load balancer instance
agent_lb2 = AgentLoadBalancer2()
