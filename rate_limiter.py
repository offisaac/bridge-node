"""BridgeNode Rate Limiter - Token and IP based rate limiting"""
import time
import collections
from typing import Dict, Optional
import threading


class RateLimiter:
    """Rate limiter with token-based and IP-based limiting."""

    def __init__(
        self,
        requests_per_minute: int = 60,
        requests_per_hour: int = 1000,
        burst_limit: int = 10
    ):
        """Initialize rate limiter.

        Args:
            requests_per_minute: Maximum requests per minute per client
            requests_per_hour: Maximum requests per hour per client
            burst_limit: Maximum burst requests allowed
        """
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self.burst_limit = burst_limit

        # Token-based tracking: {token: [timestamp1, timestamp2, ...]}
        self.token_requests: Dict[str, collections.deque] = {}
        self.token_lock = threading.Lock()

        # IP-based tracking: {ip: [timestamp1, timestamp2, ...]}
        self.ip_requests: Dict[str, collections.deque] = {}
        self.ip_lock = threading.Lock()

        # Config (can be updated)
        self._enabled = True

    def _clean_old_requests(self, timestamps: collections.deque, max_age: int) -> None:
        """Remove timestamps older than max_age seconds."""
        now = time.time()
        while timestamps and timestamps[0] < now - max_age:
            timestamps.popleft()

    def _get_or_create_deque(
        self,
        store: Dict[str, collections.deque],
        lock: threading.Lock,
        key: str
    ) -> collections.deque:
        """Get or create a deque for tracking requests."""
        with lock:
            if key not in store:
                store[key] = collections.deque()
            return store[key]

    def check_token_rate(self, token: str) -> tuple[bool, Optional[str]]:
        """Check if token-based rate limit is exceeded.

        Returns:
            (allowed, error_message)
        """
        if not self._enabled:
            return True, None

        now = time.time()
        timestamps = self._get_or_create_deque(self.token_requests, self.token_lock, token)

        # Clean old requests
        self._clean_old_requests(timestamps, 60)  # Keep 1 minute of history
        self._clean_old_requests(timestamps, 3600)  # Keep 1 hour of history

        # Check minute limit
        minute_requests = [t for t in timestamps if t > now - 60]
        if len(minute_requests) >= self.requests_per_minute:
            return False, f"Rate limit exceeded: {self.requests_per_minute} requests per minute"

        # Check burst limit
        burst_requests = [t for t in timestamps if t > now - 1]
        if len(burst_requests) >= self.burst_limit:
            return False, f"Burst limit exceeded: {self.burst_limit} requests per second"

        # Add current request
        timestamps.append(now)

        return True, None

    def check_ip_rate(self, ip: str) -> tuple[bool, Optional[str]]:
        """Check if IP-based rate limit is exceeded.

        Returns:
            (allowed, error_message)
        """
        if not self._enabled:
            return True, None

        now = time.time()
        timestamps = self._get_or_create_deque(self.ip_requests, self.ip_lock, ip)

        # Clean old requests
        self._clean_old_requests(timestamps, 60)
        self._clean_old_requests(timestamps, 3600)

        # Check minute limit
        minute_requests = [t for t in timestamps if t > now - 60]
        if len(minute_requests) >= self.requests_per_minute:
            return False, f"Rate limit exceeded: {self.requests_per_minute} requests per minute"

        # Check hour limit
        hour_requests = [t for t in timestamps if t > now - 3600]
        if len(hour_requests) >= self.requests_per_hour:
            return False, f"Rate limit exceeded: {self.requests_per_hour} requests per hour"

        # Add current request
        timestamps.append(now)

        return True, None

    def check(self, token: str, ip: str) -> tuple[bool, Optional[str]]:
        """Check both token and IP rate limits.

        Returns:
            (allowed, error_message)
        """
        # Check token rate first
        allowed, error = self.check_token_rate(token)
        if not allowed:
            return False, error

        # Check IP rate
        allowed, error = self.check_ip_rate(ip)
        if not allowed:
            return False, error

        return True, None

    def get_stats(self, token: str = None, ip: str = None) -> Dict:
        """Get rate limit statistics."""
        stats = {
            "enabled": self._enabled,
            "requests_per_minute": self.requests_per_minute,
            "requests_per_hour": self.requests_per_hour,
            "burst_limit": self.burst_limit
        }

        if token:
            now = time.time()
            with self.token_lock:
                timestamps = self.token_requests.get(token, collections.deque())
            minute_count = len([t for t in timestamps if t > now - 60])
            hour_count = len([t for t in timestamps if t > now - 3600])
            stats["token"] = {
                "requests_last_minute": minute_count,
                "requests_last_hour": hour_count
            }

        if ip:
            now = time.time()
            with self.ip_lock:
                timestamps = self.ip_requests.get(ip, collections.deque())
            minute_count = len([t for t in timestamps if t > now - 60])
            hour_count = len([t for t in timestamps if t > now - 3600])
            stats["ip"] = {
                "requests_last_minute": minute_count,
                "requests_last_hour": hour_count
            }

        return stats

    def set_config(
        self,
        requests_per_minute: int = None,
        requests_per_hour: int = None,
        burst_limit: int = None,
        enabled: bool = None
    ) -> None:
        """Update rate limiter configuration."""
        if requests_per_minute is not None:
            self.requests_per_minute = requests_per_minute
        if requests_per_hour is not None:
            self.requests_per_hour = requests_per_hour
        if burst_limit is not None:
            self.burst_limit = burst_limit
        if enabled is not None:
            self._enabled = enabled

    def reset(self, token: str = None, ip: str = None) -> None:
        """Reset rate limit counters for a specific client."""
        if token:
            with self.token_lock:
                if token in self.token_requests:
                    del self.token_requests[token]

        if ip:
            with self.ip_lock:
                if ip in self.ip_requests:
                    del self.ip_requests[ip]


# Global rate limiter instance
rate_limiter = RateLimiter(
    requests_per_minute=60,
    requests_per_hour=1000,
    burst_limit=10
)
