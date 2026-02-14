"""BridgeNode Configuration Module"""
import os
import socket
from typing import List

# Server Configuration
HOST = "127.0.0.1"
DEFAULT_PORT = 8080

# Get port from environment or CLI
PORT = int(os.getenv("PORT", DEFAULT_PORT))

# CORS Configuration
CORS_ORIGINS = [
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:8888",
    "http://127.0.0.1:8888",
]

# Token Configuration
TOKEN_EXPIRY_HOURS = 24

# Upload Configuration
UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
MAX_UPLOAD_SIZE = 100 * 1024 * 1024  # 100MB
CHUNK_SIZE = 1024 * 1024  # 1MB chunks

# Log Configuration
LOG_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "logs")
LOG_LINES_DEFAULT = 100

# WebSocket Configuration
WS_HEARTBEAT_INTERVAL = 5  # seconds


async def find_available_port(start: int = 8080, max_attempts: int = 10) -> int:
    """Find an available port starting from start port."""
    for port in range(start, start + max_attempts):
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind((HOST, port))
            sock.close()
            return port
        except OSError:
            continue
    raise RuntimeError(f"No available port found in range {start}-{start + max_attempts - 1}")


def ensure_directories():
    """Ensure required directories exist."""
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    os.makedirs(LOG_DIR, exist_ok=True)
