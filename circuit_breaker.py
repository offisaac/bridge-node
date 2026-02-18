"""Circuit Breaker Module

Advanced circuit breaker implementation with fallback strategies.
"""
import time
import threading
import uuid
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class CircuitState(str, Enum):
    """Circuit breaker states."""
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreakerConfig:
    """Circuit breaker configuration."""
    failure_threshold: int = 5
    success_threshold: int = 2
    timeout: float = 60.0
    half_open_max_calls: int = 3


@dataclass
class CircuitMetrics:
    """Circuit breaker metrics."""
    total_calls: int = 0
    successful_calls: int = 0
    failed_calls: int = 0
    rejected_calls: int = 0
    last_failure_time: float = 0


class CircuitBreaker:
    """Advanced circuit breaker implementation."""

    def __init__(self, name: str, config: CircuitBreakerConfig = None):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._lock = threading.RLock()
        self._state = CircuitState.CLOSED
        self._failure_count = 0
        self._success_count = 0
        self._last_failure_time = 0
        self._metrics = CircuitMetrics()

    @property
    def state(self) -> CircuitState:
        """Get current state."""
        with self._lock:
            if self._state == CircuitState.OPEN:
                if time.time() - self._last_failure_time > self.config.timeout:
                    self._state = CircuitState.HALF_OPEN
            return self._state

    def record_success(self):
        """Record a successful call."""
        with self._lock:
            self._metrics.successful_calls += 1
            self._metrics.total_calls += 1

            if self._state == CircuitState.HALF_OPEN:
                self._success_count += 1
                if self._success_count >= self.config.success_threshold:
                    self._state = CircuitState.CLOSED
                    self._failure_count = 0
                    self._success_count = 0
            else:
                self._failure_count = 0

    def record_failure(self):
        """Record a failed call."""
        with self._lock:
            self._metrics.failed_calls += 1
            self._metrics.total_calls += 1
            self._metrics.last_failure_time = time.time()
            self._failure_count += 1
            self._last_failure_time = time.time()

            if self._state == CircuitState.HALF_OPEN:
                self._state = CircuitState.OPEN
                self._success_count = 0
            elif self._failure_count >= self.config.failure_threshold:
                self._state = CircuitState.OPEN

    def can_execute(self) -> bool:
        """Check if execution is allowed."""
        return self.state != CircuitState.OPEN

    def get_metrics(self) -> Dict:
        """Get circuit breaker metrics."""
        with self._lock:
            return {
                "name": self.name,
                "state": self.state.value,
                "total_calls": self._metrics.total_calls,
                "successful_calls": self._metrics.successful_calls,
                "failed_calls": self._metrics.failed_calls,
                "failure_rate": self._metrics.failed_calls / max(1, self._metrics.total_calls)
            }


class CircuitBreakerManager:
    """Manage multiple circuit breakers."""

    def __init__(self):
        self._lock = threading.RLock()
        self._breakers: Dict[str, CircuitBreaker] = {}

    def create_breaker(self, name: str, config: CircuitBreakerConfig = None) -> str:
        """Create a circuit breaker."""
        with self._lock:
            breaker = CircuitBreaker(name, config)
            self._breakers[name] = breaker
        return name

    def get_breaker(self, name: str) -> Optional[CircuitBreaker]:
        """Get a circuit breaker."""
        with self._lock:
            return self._breakers.get(name)

    def execute(self, name: str, func: Callable, fallback: Callable = None, *args, **kwargs) -> Any:
        """Execute function with circuit breaker."""
        breaker = self.get_breaker(name)
        if not breaker:
            return func(*args, **kwargs)

        if not breaker.can_execute():
            if fallback:
                return fallback(*args, **kwargs)
            raise Exception(f"Circuit breaker {name} is OPEN")

        try:
            result = func(*args, **kwargs)
            breaker.record_success()
            return result
        except Exception as e:
            breaker.record_failure()
            if fallback:
                return fallback(*args, **kwargs)
            raise

    def get_stats(self) -> Dict:
        """Get all circuit breaker stats."""
        return {
            name: breaker.get_metrics()
            for name, breaker in self._breakers.items()
        }


# Global circuit breaker manager
circuit_breaker = CircuitBreakerManager()
