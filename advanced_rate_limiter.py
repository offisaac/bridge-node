"""BridgeNode Advanced Rate Limiter with Circuit Breaker

高级限流器 - 限流 + 熔断机制 + 分布式限流
支持滑动窗口、令牌桶、熔断器模式、Redis分布式限流
"""
import time
import collections
from typing import Dict, Optional, Tuple, List
from dataclasses import dataclass, field
from enum import Enum
import threading


class CircuitState(str, Enum):
    """Circuit breaker states."""
    CLOSED = "closed"      # 正常
    OPEN = "open"         # 熔断中
    HALF_OPEN = "half_open"  # 半开


class LimiterStrategy(str, Enum):
    """Rate limiting strategies."""
    SLIDING_WINDOW = "sliding_window"
    TOKEN_BUCKET = "token_bucket"
    FIXED_WINDOW = "fixed_window"


@dataclass
class CircuitBreaker:
    """Circuit breaker for service protection."""
    failure_threshold: int = 5        # 失败次数阈值
    success_threshold: int = 2        # 成功次数恢复阈值
    timeout_seconds: int = 30          # 熔断超时时间
    half_open_max_calls: int = 3     # 半开状态最大调用次数

    state: CircuitState = CircuitState.CLOSED
    failure_count: int = 0
    success_count: int = 0
    last_failure_time: float = 0
    half_open_calls: int = 0

    def record_success(self):
        """Record successful call."""
        if self.state == CircuitState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= self.success_threshold:
                self._reset()
        elif self.state == CircuitState.CLOSED:
            self.failure_count = 0

    def record_failure(self):
        """Record failed call."""
        self.failure_count += 1
        self.last_failure_time = time.time()

        if self.state == CircuitState.CLOSED:
            if self.failure_count >= self.failure_threshold:
                self._trip()

        elif self.state == CircuitState.HALF_OPEN:
            self._trip()

    def can_execute(self) -> bool:
        """Check if execution is allowed."""
        now = time.time()

        if self.state == CircuitState.CLOSED:
            return True

        elif self.state == CircuitState.OPEN:
            # Check timeout
            if now - self.last_failure_time > self.timeout_seconds:
                self._half_open()
                return True
            return False

        elif self.state == CircuitState.HALF_OPEN:
            if self.half_open_calls < self.half_open_max_calls:
                self.half_open_calls += 1
                return True
            return False

        return False

    def _trip(self):
        """Trip the circuit breaker."""
        self.state = CircuitState.OPEN
        self.success_count = 0

    def _half_open(self):
        """Move to half-open state."""
        self.state = CircuitState.HALF_OPEN
        self.half_open_calls = 0
        self.success_count = 0

    def _reset(self):
        """Reset circuit breaker to closed state."""
        self.state = CircuitState.CLOSED
        self.failure_count = 0
        self.success_count = 0
        self.half_open_calls = 0


@dataclass
class TokenBucket:
    """Token bucket algorithm implementation."""
    capacity: int = 100        # 桶容量
    refill_rate: float = 10.0  # 每秒补充令牌数
    tokens: float = 0
    last_refill: float = field(default_factory=time.time)

    def _refill(self):
        """Refill tokens based on time elapsed."""
        now = time.time()
        elapsed = now - self.last_refill
        self.tokens = min(self.capacity, self.tokens + elapsed * self.refill_rate)
        self.last_refill = now

    def consume(self, tokens: int = 1) -> bool:
        """Try to consume tokens."""
        self._refill()
        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False


class AdvancedRateLimiter:
    """高级限流器 - 集成多种限流策略和熔断器"""

    def __init__(
        self,
        requests_per_minute: int = 60,
        requests_per_hour: int = 1000,
        burst_limit: int = 10,
        strategy: LimiterStrategy = LimiterStrategy.SLIDING_WINDOW
    ):
        # Basic rate limiting
        self.requests_per_minute = requests_per_minute
        self.requests_per_hour = requests_per_hour
        self.burst_limit = burst_limit
        self.strategy = strategy

        # Token/IP tracking
        self.token_requests: Dict[str, collections.deque] = {}
        self.token_lock = threading.Lock()
        self.ip_requests: Dict[str, collections.deque] = {}
        self.ip_lock = threading.Lock()

        # Token bucket per client
        self.token_buckets: Dict[str, TokenBucket] = {}
        self.bucket_lock = threading.Lock()

        # Circuit breakers
        self.circuits: Dict[str, CircuitBreaker] = {}
        self.circuit_lock = threading.Lock()

        # Config
        self._enabled = True

        # Statistics
        self.total_requests = 0
        self.blocked_requests = 0
        self.circuit_trips = 0

    def _get_or_create_deque(
        self,
        store: Dict[str, collections.deque],
        lock: threading.Lock,
        key: str
    ) -> collections.deque:
        """Get or create a deque."""
        with lock:
            if key not in store:
                store[key] = collections.deque()
            return store[key]

    def _get_or_create_bucket(
        self,
        key: str,
        capacity: int = None
    ) -> TokenBucket:
        """Get or create token bucket."""
        with self.bucket_lock:
            if key not in self.token_buckets:
                self.token_buckets[key] = TokenBucket(
                    capacity=capacity or self.burst_limit,
                    refill_rate=self.requests_per_minute / 60.0
                )
            return self.token_buckets[key]

    def _get_or_create_circuit(self, key: str) -> CircuitBreaker:
        """Get or create circuit breaker."""
        with self.circuit_lock:
            if key not in self.circuits:
                self.circuits[key] = CircuitBreaker()
            return self.circuits[key]

    def check(
        self,
        token: str = None,
        ip: str = None,
        endpoint: str = None
    ) -> Tuple[bool, Optional[str]]:
        """Check if request is allowed."""
        if not self._enabled:
            return True, None

        self.total_requests += 1

        # Check circuit breaker for endpoint
        circuit_key = endpoint or "default"
        circuit = self._get_or_create_circuit(circuit_key)

        if not circuit.can_execute():
            self.blocked_requests += 1
            return False, f"Circuit breaker open for {circuit_key}"

        # Strategy-based rate limiting
        if self.strategy == LimiterStrategy.TOKEN_BUCKET:
            allowed = self._check_token_bucket(token or ip)
        else:
            allowed, error = self._check_sliding_window(token, ip)
            if not allowed:
                self.blocked_requests += 1
                return False, error

        if not allowed:
            self.blocked_requests += 1
            return False, "Rate limit exceeded"

        # Record success in circuit
        circuit.record_success()

        return True, None

    def _check_token_bucket(self, key: str) -> bool:
        """Check using token bucket algorithm."""
        bucket = self._get_or_create_bucket(key)
        return bucket.consume()

    def _check_sliding_window(
        self,
        token: str = None,
        ip: str = None
    ) -> Tuple[bool, Optional[str]]:
        """Check using sliding window algorithm."""
        now = time.time()

        # Token-based limiting
        if token:
            timestamps = self._get_or_create_deque(self.token_requests, self.token_lock, token)
            self._clean_old_requests(timestamps, 60)
            self._clean_old_requests(timestamps, 3600)

            # Check minute limit
            minute_requests = [t for t in timestamps if t > now - 60]
            if len(minute_requests) >= self.requests_per_minute:
                return False, f"Rate limit: {self.requests_per_minute} req/min"

            # Check burst
            burst_requests = [t for t in timestamps if t > now - 1]
            if len(burst_requests) >= self.burst_limit:
                return False, f"Burst limit: {self.burst_limit} req/sec"

            timestamps.append(now)

        # IP-based limiting
        if ip:
            timestamps = self._get_or_create_deque(self.ip_requests, self.ip_lock, ip)
            self._clean_old_requests(timestamps, 60)
            self._clean_old_requests(timestamps, 3600)

            minute_requests = [t for t in timestamps if t > now - 60]
            if len(minute_requests) >= self.requests_per_minute:
                return False, f"IP rate limit: {self.requests_per_minute} req/min"

            timestamps.append(now)

        return True, None

    def _clean_old_requests(self, timestamps: collections.deque, max_age: int):
        """Remove old timestamps."""
        now = time.time()
        while timestamps and timestamps[0] < now - max_age:
            timestamps.popleft()

    def record_error(self, endpoint: str = None):
        """Record an error for circuit breaker."""
        circuit_key = endpoint or "default"
        circuit = self._get_or_create_circuit(circuit_key)
        circuit.record_failure()
        if circuit.state == CircuitState.OPEN:
            self.circuit_trips += 1

    def get_circuit_status(self, endpoint: str = None) -> Dict:
        """Get circuit breaker status."""
        circuit_key = endpoint or "default"
        circuit = self._get_or_create_circuit(circuit_key)

        return {
            "endpoint": circuit_key,
            "state": circuit.state.value,
            "failure_count": circuit.failure_count,
            "success_count": circuit.success_count,
            "last_failure_time": circuit.last_failure_time
        }

    def get_all_circuits(self) -> Dict:
        """Get all circuit breakers status."""
        with self.circuit_lock:
            return {
                key: self.get_circuit_status(key)
                for key in self.circuits.keys()
            }

    def reset_circuit(self, endpoint: str = None):
        """Manually reset a circuit breaker."""
        circuit_key = endpoint or "default"
        circuit = self._get_or_create_circuit(circuit_key)
        circuit._reset()

    def get_stats(self, token: str = None, ip: str = None) -> Dict:
        """Get rate limiter statistics."""
        return {
            "enabled": self._enabled,
            "strategy": self.strategy.value,
            "total_requests": self.total_requests,
            "blocked_requests": self.blocked_requests,
            "block_rate": round(self.blocked_requests / max(self.total_requests, 1) * 100, 2),
            "circuit_trips": self.circuit_trips,
            "circuits": self.get_all_circuits(),
            "token_clients": len(self.token_requests),
            "ip_clients": len(self.ip_requests)
        }

    def set_config(
        self,
        requests_per_minute: int = None,
        requests_per_hour: int = None,
        burst_limit: int = None,
        strategy: LimiterStrategy = None,
        enabled: bool = None
    ):
        """Update rate limiter configuration."""
        if requests_per_minute is not None:
            self.requests_per_minute = requests_per_minute
        if requests_per_hour is not None:
            self.requests_per_hour = requests_per_hour
        if burst_limit is not None:
            self.burst_limit = burst_limit
        if strategy is not None:
            self.strategy = strategy
        if enabled is not None:
            self._enabled = enabled

    def reset(self, token: str = None, ip: str = None):
        """Reset rate limit for token or IP."""
        if token:
            with self.token_lock:
                if token in self.token_requests:
                    del self.token_requests[token]

        if ip:
            with self.ip_lock:
                if ip in self.ip_requests:
                    del self.ip_requests[ip]


# Global advanced rate limiter
advanced_rate_limiter = AdvancedRateLimiter()


# ============================================================
# Distributed Rate Limiter (Redis-based)
# ============================================================

class DistributedRateLimiter:
    """基于Redis的分布式限流器"""

    def __init__(
        self,
        redis_host: str = "localhost",
        redis_port: int = 6379,
        redis_db: int = 1,
        redis_password: str = None
    ):
        self.redis_host = redis_host
        self.redis_port = redis_port
        self.redis_db = redis_db
        self.redis_password = redis_password
        self._client = None
        self._enabled = False
        self._connect()

    def _connect(self):
        """Connect to Redis."""
        try:
            import redis
            self._client = redis.Redis(
                host=self.redis_host,
                port=self.redis_port,
                db=self.redis_db,
                password=self.redis_password,
                decode_responses=True
            )
            self._client.ping()
            self._enabled = True
            print("[DistributedRateLimiter] Connected to Redis")
        except ImportError:
            print("[DistributedRateLimiter] Redis not available, distributed rate limiting disabled")
            self._enabled = False
        except Exception as e:
            print(f"[DistributedRateLimiter] Redis connection failed: {e}")
            self._enabled = False

    def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, int]:
        """Check rate limit using sliding window log algorithm.

        Args:
            key: Rate limit key (e.g., "user:123" or "ip:192.168.1.1")
            max_requests: Maximum requests allowed in window
            window_seconds: Time window in seconds

        Returns:
            (allowed, remaining_requests)
        """
        if not self._enabled or not self._client:
            return True, max_requests

        try:
            now = time.time()
            window_key = f"rate_limit:{key}"

            # Remove old entries
            self._client.zremrangebyscore(
                window_key, 0, now - window_seconds
            )

            # Count current requests
            current_count = self._client.zcard(window_key)

            if current_count >= max_requests:
                return False, 0

            # Add new request
            self._client.zadd(window_key, {str(now): now})
            self._client.expire(window_key, window_seconds)

            return True, max_requests - current_count - 1

        except Exception as e:
            print(f"[DistributedRateLimiter] Error: {e}")
            return True, max_requests  # Fail open

    def check_token_bucket(
        self,
        key: str,
        capacity: int,
        refill_rate: float
    ) -> Tuple[bool, float]:
        """Check rate limit using token bucket algorithm.

        Args:
            key: Rate limit key
            capacity: Bucket capacity
            refill_rate: Tokens per second

        Returns:
            (allowed, tokens_remaining)
        """
        if not self._enabled or not self._client:
            return True, capacity

        try:
            now = time.time()
            bucket_key = f"token_bucket:{key}"

            # Get last refill time and tokens
            last_refill = float(self._client.hget(bucket_key, "last_refill") or 0)
            tokens = float(self._client.hget(bucket_key, "tokens") or capacity)

            # Refill tokens
            if last_refill > 0:
                elapsed = now - last_refill
                tokens = min(capacity, tokens + elapsed * refill_rate)

            # Check if can consume
            if tokens >= 1:
                tokens -= 1
                allowed = True
            else:
                allowed = False

            # Save state
            self._client.hset(bucket_key, mapping={
                "last_refill": str(now),
                "tokens": str(tokens)
            })
            self._client.expire(bucket_key, int(capacity / refill_rate) + 10)

            return allowed, tokens

        except Exception as e:
            print(f"[DistributedRateLimiter] Error: {e}")
            return True, capacity

    def get_rate_limit_info(self, key: str, window_seconds: int) -> Dict:
        """Get current rate limit info for a key."""
        if not self._enabled or not self._client:
            return {"enabled": False}

        try:
            now = time.time()
            window_key = f"rate_limit:{key}"

            # Clean old entries
            self._client.zremrangebyscore(
                window_key, 0, now - window_seconds
            )

            current_count = self._client.zcard(window_key)

            # Get oldest request time
            oldest = self._client.zrange(window_key, 0, 0, withscores=True)
            oldest_time = oldest[0][1] if oldest else now

            return {
                "enabled": True,
                "current_requests": current_count,
                "oldest_request_age": round(now - oldest_time, 2),
                "reset_in": round(window_seconds - (now - oldest_time), 2) if oldest else window_seconds
            }

        except Exception as e:
            return {"enabled": False, "error": str(e)}

    def reset_key(self, key: str) -> bool:
        """Reset rate limit for a key."""
        if not self._enabled or not self._client:
            return False

        try:
            self._client.delete(f"rate_limit:{key}")
            self._client.delete(f"token_bucket:{key}")
            return True
        except Exception:
            return False

    def get_stats(self) -> Dict:
        """Get distributed rate limiter stats."""
        if not self._enabled:
            return {
                "enabled": False,
                "reason": "Redis not available"
            }

        try:
            # Count keys
            rate_limit_keys = self._client.keys("rate_limit:*")
            token_bucket_keys = self._client.keys("token_bucket:*")

            return {
                "enabled": True,
                "redis_host": self.redis_host,
                "redis_port": self.redis_port,
                "rate_limit_keys": len(rate_limit_keys),
                "token_bucket_keys": len(token_bucket_keys)
            }
        except Exception as e:
            return {
                "enabled": False,
                "error": str(e)
            }


# Global distributed rate limiter
distributed_rate_limiter = DistributedRateLimiter()
