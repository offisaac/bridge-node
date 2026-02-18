"""Agent Failover Module

Agent failover and recovery system for high availability.
"""
import time
import threading
import uuid
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from collections import defaultdict


class AgentState(str, Enum):
    """Agent states."""
    ACTIVE = "active"
    STANDBY = "standby"
    FAILING = "failing"
    FAILED = "failed"
    RECOVERING = "recovering"
    DRAINING = "draining"


class FailoverStrategy(str, Enum):
    """Failover strategies."""
    AUTOMATIC = "automatic"
    MANUAL = "manual"
    SEMI_AUTOMATIC = "semi_automatic"


class HealthStatus(str, Enum):
    """Health check status."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"


@dataclass
class Agent:
    """Agent information."""
    id: str
    name: str
    state: AgentState
    health: HealthStatus
    priority: int
    endpoint: str
    metadata: Dict[str, Any] = field(default_factory=dict)
    last_heartbeat: float = 0
    consecutive_failures: int = 0
    total_failovers: int = 0
    uptime_seconds: float = 0
    started_at: float = 0


@dataclass
class FailoverEvent:
    """Failover event record."""
    id: str
    from_agent_id: str
    to_agent_id: str
    triggered_by: str
    timestamp: float
    duration_ms: int
    success: bool
    error_message: str = ""


@dataclass
class HealthCheck:
    """Health check configuration."""
    interval_seconds: int = 30
    timeout_seconds: int = 5
    failure_threshold: int = 3
    recovery_threshold: int = 2


class AgentFailoverManager:
    """Manage agent failover and recovery."""

    def __init__(self):
        self._lock = threading.RLock()
        self._agents: Dict[str, Agent] = {}
        self._failover_events: List[FailoverEvent] = []
        self._health_check = HealthCheck()
        self._strategy = FailoverStrategy.AUTOMATIC
        self._callbacks: Dict[str, Callable] = {}
        self._last_check = 0
        self._max_events = 1000

    def register_agent(
        self,
        agent_id: str,
        name: str,
        endpoint: str,
        priority: int = 0,
        metadata: Dict[str, Any] = None
    ) -> str:
        """Register an agent."""
        with self._lock:
            agent = Agent(
                id=agent_id,
                name=name,
                state=AgentState.STANDBY,
                health=HealthStatus.HEALTHY,
                priority=priority,
                endpoint=endpoint,
                metadata=metadata or {},
                last_heartbeat=time.time(),
                started_at=time.time()
            )
            self._agents[agent_id] = agent
            return agent_id

    def unregister_agent(self, agent_id: str) -> bool:
        """Unregister an agent."""
        with self._lock:
            if agent_id in self._agents:
                del self._agents[agent_id]
                return True
            return False

    def get_agent(self, agent_id: str) -> Optional[Dict]:
        """Get agent information."""
        with self._lock:
            agent = self._agents.get(agent_id)
            if not agent:
                return None
            return {
                "id": agent.id,
                "name": agent.name,
                "state": agent.state.value,
                "health": agent.health.value,
                "priority": agent.priority,
                "endpoint": agent.endpoint,
                "last_heartbeat": agent.last_heartbeat,
                "consecutive_failures": agent.consecutive_failures,
                "total_failovers": agent.total_failovers,
                "uptime_seconds": agent.uptime_seconds,
                "metadata": agent.metadata
            }

    def get_all_agents(self, state: AgentState = None) -> List[Dict]:
        """Get all agents."""
        with self._lock:
            agents = list(self._agents.values())
            if state:
                agents = [a for a in agents if a.state == state]
            return sorted(
                [{"id": a.id, "name": a.name, "state": a.state.value,
                  "health": a.health.value, "priority": a.priority,
                  "endpoint": a.endpoint} for a in agents],
                key=lambda x: x["priority"],
                reverse=True
            )

    def heartbeat(self, agent_id: str) -> bool:
        """Record agent heartbeat."""
        with self._lock:
            agent = self._agents.get(agent_id)
            if not agent:
                return False
            agent.last_heartbeat = time.time()
            agent.consecutive_failures = 0
            if agent.health == HealthStatus.UNHEALTHY:
                agent.health = HealthStatus.DEGRADED
            return True

    def set_agent_state(self, agent_id: str, state: AgentState) -> bool:
        """Set agent state."""
        with self._lock:
            agent = self._agents.get(agent_id)
            if not agent:
                return False
            old_state = agent.state
            agent.state = state

            # Update health based on state
            if state == AgentState.ACTIVE:
                agent.health = HealthStatus.HEALTHY
            elif state == AgentState.FAILED:
                agent.health = HealthStatus.UNHEALTHY

            return True

    def set_strategy(self, strategy: FailoverStrategy):
        """Set failover strategy."""
        self._strategy = strategy

    def trigger_failover(self, from_agent_id: str, to_agent_id: str = None) -> Optional[Dict]:
        """Manually trigger failover."""
        with self._lock:
            from_agent = self._agents.get(from_agent_id)
            if not from_agent:
                return None

            # Find target agent
            if not to_agent_id:
                candidates = [
                    a for a in self._agents.values()
                    if a.id != from_agent_id and a.state in (AgentState.ACTIVE, AgentState.STANDBY)
                ]
                if not candidates:
                    return None
                candidates.sort(key=lambda x: x.priority, reverse=True)
                to_agent = candidates[0]
                to_agent_id = to_agent.id
            else:
                to_agent = self._agents.get(to_agent_id)
                if not to_agent:
                    return None

            # Perform failover
            start_time = time.time()
            event_id = str(uuid.uuid4())[:12]

            # Execute callbacks
            success = True
            error_msg = ""
            try:
                # Notify source agent
                if "on_failover_from" in self._callbacks:
                    self._callbacks["on_failover_from"](from_agent_id, to_agent_id)

                # Notify target agent
                if "on_failover_to" in self._callbacks:
                    self._callbacks["on_failover_to"](from_agent_id, to_agent_id)

                # Update states
                from_agent.state = AgentState.FAILED
                to_agent.state = AgentState.ACTIVE
                to_agent.total_failovers += 1

            except Exception as e:
                success = False
                error_msg = str(e)

            duration_ms = int((time.time() - start_time) * 1000)

            event = FailoverEvent(
                id=event_id,
                from_agent_id=from_agent_id,
                to_agent_id=to_agent_id,
                triggered_by="manual",
                timestamp=time.time(),
                duration_ms=duration_ms,
                success=success,
                error_message=error_msg
            )
            self._failover_events.append(event)
            if len(self._failover_events) > self._max_events:
                self._failover_events = self._failover_events[-self._max_events:]

            return {
                "event_id": event_id,
                "from_agent": from_agent_id,
                "to_agent": to_agent_id,
                "success": success,
                "duration_ms": duration_ms
            }

    def check_health(self) -> Dict:
        """Check health of all agents and trigger automatic failover."""
        with self._lock:
            now = time.time()
            results = {"checked": [], "failovers": [], "errors": []}

            for agent in self._agents.values():
                results["checked"].append(agent.id)

                # Check heartbeat timeout
                if now - agent.last_heartbeat > self._health_check.interval_seconds * 2:
                    agent.consecutive_failures += 1

                    if agent.consecutive_failures >= self._health_check.failure_threshold:
                        agent.health = HealthStatus.UNHEALTHY
                        agent.state = AgentState.FAILING

                        # Trigger automatic failover if enabled
                        if self._strategy == FailoverStrategy.AUTOMATIC:
                            # Find replacement
                            candidates = [
                                a for a in self._agents.values()
                                if a.id != agent.id and a.state == AgentState.STANDBY
                            ]
                            if candidates:
                                candidates.sort(key=lambda x: x.priority, reverse=True)
                                target = candidates[0]

                                # Perform failover
                                event_id = str(uuid.uuid4())[:12]
                                start_time = time.time()

                                try:
                                    agent.state = AgentState.FAILED
                                    target.state = AgentState.ACTIVE
                                    target.total_failovers += 1

                                    event = FailoverEvent(
                                        id=event_id,
                                        from_agent_id=agent.id,
                                        to_agent_id=target.id,
                                        triggered_by="health_check",
                                        timestamp=now,
                                        duration_ms=int((time.time() - start_time) * 1000),
                                        success=True
                                    )
                                    self._failover_events.append(event)
                                    results["failovers"].append({
                                        "from": agent.id,
                                        "to": target.id
                                    })

                                except Exception as e:
                                    results["errors"].append(str(e))

            self._last_check = now
            return results

    def recover_agent(self, agent_id: str) -> bool:
        """Recover a failed agent."""
        with self._lock:
            agent = self._agents.get(agent_id)
            if not agent:
                return False

            agent.state = AgentState.RECOVERING

            try:
                # Execute recovery callbacks
                if "on_recover" in self._callbacks:
                    self._callbacks["on_recover"](agent_id)

                agent.state = AgentState.STANDBY
                agent.health = HealthStatus.DEGRADED
                agent.consecutive_failures = 0
                return True

            except Exception:
                agent.state = AgentState.FAILED
                return False

    def drain_agent(self, agent_id: str) -> bool:
        """Drain an agent (graceful shutdown)."""
        with self._lock:
            agent = self._agents.get(agent_id)
            if not agent:
                return False

            agent.state = AgentState.DRAINING

            # Execute drain callbacks
            if "on_drain" in self._callbacks:
                try:
                    self._callbacks["on_drain"](agent_id)
                except Exception:
                    return False

            return True

    def register_callback(self, event: str, callback: Callable):
        """Register a callback for failover events."""
        self._callbacks[event] = callback

    def get_failover_events(self, limit: int = 100) -> List[Dict]:
        """Get failover events."""
        with self._lock:
            events = sorted(self._failover_events, key=lambda x: x.timestamp, reverse=True)
            return [
                {"id": e.id, "from_agent": e.from_agent_id, "to_agent": e.to_agent_id,
                 "triggered_by": e.triggered_by, "timestamp": e.timestamp,
                 "duration_ms": e.duration_ms, "success": e.success, "error": e.error_message}
                for e in events[:limit]
            ]

    def get_statistics(self) -> Dict:
        """Get failover statistics."""
        with self._lock:
            total = len(self._failover_events)
            successful = sum(1 for e in self._failover_events if e.success)
            failed = total - successful

            states = defaultdict(int)
            health_counts = defaultdict(int)

            for agent in self._agents.values():
                states[agent.state.value] += 1
                health_counts[agent.health.value] += 1

            return {
                "total_agents": len(self._agents),
                "active_agents": states["active"],
                "standby_agents": states["standby"],
                "failed_agents": states["failed"],
                "total_failovers": total,
                "successful_failovers": successful,
                "failed_failovers": failed,
                "strategy": self._strategy.value,
                "health_counts": dict(health_counts),
                "last_check": self._last_check
            }


# Global agent failover manager
agent_failover = AgentFailoverManager()
