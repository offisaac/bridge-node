"""Circuit Breaker Dashboard Module

Visual dashboard for monitoring circuit breakers.
"""
import threading
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum


class CircuitState(str, Enum):
    """Circuit breaker states."""
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitInfo:
    """Circuit breaker information."""
    name: str
    state: CircuitState
    failure_count: int = 0
    success_count: int = 0
    last_failure_time: Optional[str] = None
    last_success_time: Optional[str] = None
    next_attempt_time: Optional[str] = None
    total_requests: int = 0


class CircuitBreakerDashboard:
    """Dashboard for circuit breaker monitoring."""

    def __init__(self):
        self._lock = threading.RLock()
        self._circuits: Dict[str, CircuitInfo] = {}

    def register_circuit(self, name: str):
        """Register a circuit breaker."""
        with self._lock:
            if name not in self._circuits:
                self._circuits[name] = CircuitInfo(name=name, state=CircuitState.CLOSED)

    def update_circuit(self, name: str, **kwargs):
        """Update circuit breaker info."""
        with self._lock:
            if name not in self._circuits:
                self.register_circuit(name)
            circuit = self._circuits[name]
            for key, value in kwargs.items():
                if hasattr(circuit, key):
                    setattr(circuit, key, value)

    def get_circuit(self, name: str) -> Optional[Dict]:
        """Get circuit breaker info."""
        with self._lock:
            circuit = self._circuits.get(name)
            if not circuit:
                return None
            return {
                "name": circuit.name,
                "state": circuit.state.value,
                "failure_count": circuit.failure_count,
                "success_count": circuit.success_count,
                "last_failure_time": circuit.last_failure_time,
                "last_success_time": circuit.last_success_time,
                "next_attempt_time": circuit.next_attempt_time,
                "total_requests": circuit.total_requests
            }

    def get_all_circuits(self) -> List[Dict]:
        """Get all circuit breakers."""
        with self._lock:
            results = []
            for name, circuit in self._circuits.items():
                results.append({
                    "name": circuit.name,
                    "state": circuit.state.value,
                    "failure_count": circuit.failure_count,
                    "success_count": circuit.success_count,
                    "total_requests": circuit.total_requests
                })
            return results

    def get_stats(self) -> Dict:
        """Get circuit breaker statistics."""
        with self._lock:
            total = len(self._circuits)
            closed = sum(1 for c in self._circuits.values() if c.state == CircuitState.CLOSED)
            open_ = sum(1 for c in self._circuits.values() if c.state == CircuitState.OPEN)
            half_open = sum(1 for c in self._circuits.values() if c.state == CircuitState.HALF_OPEN)

            return {
                "total_circuits": total,
                "closed": closed,
                "open": open_,
                "half_open": half_open,
                "health_score": (closed / total * 100) if total > 0 else 100
            }

    def get_circuits_by_state(self, state: CircuitState) -> List[Dict]:
        """Get circuit breakers by state."""
        with self._lock:
            return [
                {"name": c.name, "state": c.state.value, "failure_count": c.failure_count}
                for c in self._circuits.values() if c.state == state
            ]

    def generate_html_dashboard(self) -> str:
        """Generate HTML dashboard for circuit breakers."""
        stats = self.get_stats()
        circuits = self.get_all_circuits()

        # Color coding based on state
        state_colors = {
            "closed": "#4caf50",  # green
            "open": "#f44336",     # red
            "half_open": "#ff9800" # orange
        }

        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Circuit Breaker Dashboard</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }}
        h1 {{ color: #333; }}
        .stats {{ display: flex; gap: 20px; margin-bottom: 20px; }}
        .stat-card {{ background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); text-align: center; }}
        .stat-card h3 {{ margin: 0 0 10px 0; color: #666; font-size: 14px; }}
        .stat-card .value {{ font-size: 36px; font-weight: bold; }}
        .stat-card.closed .value {{ color: #4caf50; }}
        .stat-card.open .value {{ color: #f44336; }}
        .stat-card.half-open .value {{ color: #ff9800; }}
        .circuit-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }}
        .circuit-card {{ background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .circuit-header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }}
        .circuit-name {{ font-size: 18px; font-weight: bold; }}
        .circuit-state {{ padding: 5px 10px; border-radius: 4px; color: white; font-weight: bold; }}
        .state-closed {{ background: #4caf50; }}
        .state-open {{ background: #f44336; }}
        .state-half_open {{ background: #ff9800; }}
        .circuit-stats {{ display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }}
        .circuit-stat {{ text-align: center; padding: 10px; background: #f9f9f9; border-radius: 4px; }}
        .circuit-stat label {{ display: block; color: #666; font-size: 12px; }}
        .circuit-stat value {{ display: block; font-size: 20px; font-weight: bold; }}
    </style>
    <meta http-equiv="refresh" content="10">
</head>
<body>
    <h1>Circuit Breaker Dashboard</h1>

    <div class="stats">
        <div class="stat-card closed">
            <h3>CLOSED</h3>
            <div class="value">{stats['closed']}</div>
        </div>
        <div class="stat-card open">
            <h3>OPEN</h3>
            <div class="value">{stats['open']}</div>
        </div>
        <div class="stat-card half-open">
            <h3>HALF OPEN</h3>
            <div class="value">{stats['half_open']}</div>
        </div>
        <div class="stat-card">
            <h3>HEALTH SCORE</h3>
            <div class="value">{stats['health_score']:.1f}%</div>
        </div>
    </div>

    <h2>Circuit Breakers</h2>
    <div class="circuit-grid">
"""

        for circuit in circuits:
            state_class = f"state-{circuit['state']}"
            html += f"""
        <div class="circuit-card">
            <div class="circuit-header">
                <span class="circuit-name">{circuit['name']}</span>
                <span class="circuit-state {state_class}">{circuit['state'].upper()}</span>
            </div>
            <div class="circuit-stats">
                <div class="circuit-stat">
                    <label>Failures</label>
                    <value>{circuit['failure_count']}</value>
                </div>
                <div class="circuit-stat">
                    <label>Success</label>
                    <value>{circuit['success_count']}</value>
                </div>
                <div class="circuit-stat">
                    <label>Total</label>
                    <value>{circuit['total_requests']}</value>
                </div>
                <div class="circuit-stat">
                    <label>Success Rate</label>
                    <value>{circuit['success_count'] / circuit['total_requests'] * 100 if circuit['total_requests'] > 0 else 0:.1f}%</value>
                </div>
            </div>
        </div>
"""

        html += """
    </div>
</body>
</html>"""

        return html


# Global dashboard instance
circuit_breaker_dashboard = CircuitBreakerDashboard()
