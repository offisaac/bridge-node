"""BridgeNode Tunnel Monitor - Heartbeat monitoring for SSH tunnel"""
import asyncio
import time
from typing import Dict, Optional
from datetime import datetime


class TunnelMonitor:
    """Monitor SSH tunnel connection status."""

    def __init__(self):
        self.last_ping: Optional[float] = None
        self.last_pong: Optional[float] = None
        self.latency_ms: Optional[float] = None
        self.connected: bool = False

    async def heartbeat(self, websocket):
        """Send periodic heartbeat messages."""
        while True:
            try:
                self.last_ping = time.time() * 1000  # milliseconds for JavaScript Date.now()
                await websocket.send_json({
                    "type": "ping",
                    "timestamp": self.last_ping
                })
                await asyncio.sleep(5)
            except Exception:
                break

    def record_pong(self, timestamp: float):
        """Record pong response and calculate latency."""
        if self.last_ping:
            self.latency_ms = timestamp - self.last_ping
            self.connected = True

    def get_status(self) -> Dict:
        """Get current tunnel status."""
        return {
            "connected": self.connected,
            "latency_ms": round(self.latency_ms, 2) if self.latency_ms else None,
            "last_ping": self.last_ping,
            "last_pong": self.last_pong,
            "timestamp": datetime.now().isoformat()
        }


# Global monitor instance
tunnel_monitor = TunnelMonitor()
