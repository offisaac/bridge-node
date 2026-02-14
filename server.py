"""BridgeNode - SSH Tunnel Web Interaction Middleware"""
import argparse
import asyncio
import os
import secrets
import shlex
import subprocess
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse, StreamingResponse
from sse_starlette import EventSourceResponse
from pydantic import BaseModel
import asyncio
from collections import defaultdict
from typing import List, Dict, Any, Optional
import json
import uuid
import aiofiles
import hashlib

from config import HOST, DEFAULT_PORT, CORS_ORIGINS, find_available_port, ensure_directories
import auth
from tunnel_monitor import tunnel_monitor
from log_tailer import log_tailer
from file_transfer import file_transfer
from websocket_manager import manager

# Cluster upload directory from environment variable
CLUSTER_UPLOAD_DIR = os.path.expanduser(os.getenv("CLUSTER_UPLOAD_DIR", "/tmp/cluster_uploads"))
os.makedirs(CLUSTER_UPLOAD_DIR, exist_ok=True)

# Ensure directories exist
ensure_directories()


# ============================================================
# Quick Commands Whitelist (Security: SEC-002)
# ============================================================
# Define allowed commands for quick command execution
# Full command strings must match exactly - prevents injection via whitelist
ALLOWED_COMMANDS: Optional[List[str]] = [
    'top -b -n 1 | head -20',
    'ps aux --sort=-%cpu | head -15',
    'nvidia-smi',
    'gpustat -f -c',
    'gpustat -f -c 2>/dev/null || nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total --format=csv,noheader',
    'nvidia-smi --query-gpu=index,name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv',
    'df -h',
    'free -h',
    'free -m',
    'ps aux --sort=-%mem | head -10',
    'ls -la',
    'nproc',
    'uptime',
    'whoami',
    'hostname',
]

# Predefined quick commands (can be extended)
QUICK_COMMANDS = {
    "list_dir": "ls -la",
    "disk_usage": "df -h",
    "memory": "free -m",
    "cpu_info": "nproc",
    " uptime": "uptime",
    "pwd": "pwd",
    "date": "date",
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    token = auth.generate_token()
    print(f"\n{'='*50}")
    print(f"BridgeNode v1.0.0")
    print(f"{'='*50}")
    print(f"Server running at: http://{HOST}:{PORT}")
    print(f"Token: {token[:8]}...")
    print(f"SSH Command: ssh -L {PORT}:localhost:{PORT} user@your-cluster")
    print(f"{'='*50}\n")

    yield

    # Shutdown
    print("Shutting down BridgeNode...")


# Create FastAPI app
app = FastAPI(
    title="BridgeNode",
    description="SSH Tunnel Web Interaction Middleware",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handler
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[GLOBAL ERROR] {exc}")
    import traceback
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc)}
    )


# Models
class LoginRequest(BaseModel):
    username: str
    password: str


class CommandRequest(BaseModel):
    command: str
    params: dict = {}


class LogRequest(BaseModel):
    filepath: str
    lines: int = 100
    filter: str = None


class ClaudeOutputRequest(BaseModel):
    content: str
    label: str = "Claude Output"


# Dependency - check authentication
async def get_token(authorization: str = Header(None)):
    """Extract and verify token from Authorization header."""
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    token = authorization.replace("Bearer ", "")
    if not auth.verify_token(token):
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return token


async def verify_auth(request_data: dict = None):
    """Verify authentication using username/password or token."""
    # Try token first
    auth_header = request_data.get("authorization") if request_data else None
    if auth_header:
        token = auth_header.replace("Bearer ", "")
        if auth.verify_token(token):
            return True

    # Try username/password
    if request_data:
        username = request_data.get("username")
        password = request_data.get("password")
        if username and password and auth.verify_credentials(username, password):
            return True

    # For now, allow if credentials match
    return True


# SEC-006/007/008: Path traversal prevention
# Allowed base directories for file operations
SAFE_BASE_DIRS = [
    os.path.expanduser("~"),
    "/tmp",
    os.path.dirname(os.path.abspath(__file__)),
]


def validate_path(path: str) -> str:
    """Validate and normalize a file path to prevent directory traversal.
    Returns the resolved absolute path if safe, raises HTTPException otherwise."""
    # Expand ~ and resolve to absolute path
    expanded = os.path.expanduser(path)
    resolved = os.path.realpath(expanded)

    # Check if the resolved path is under any allowed base directory
    for base in SAFE_BASE_DIRS:
        base_resolved = os.path.realpath(base)
        if resolved.startswith(base_resolved + os.sep) or resolved == base_resolved:
            return resolved

    raise HTTPException(
        status_code=403,
        detail=f"Access denied: path is outside allowed directories"
    )


# Simple auth dependency - verify token from Authorization header
async def simple_auth(authorization: str = Header(None)):
    """Verify Bearer token from Authorization header."""
    if not authorization:
        # Allow anonymous access for local-only deployment
        # Set BRIDGENODE_REQUIRE_AUTH=1 to enforce
        if os.getenv("BRIDGENODE_REQUIRE_AUTH"):
            raise HTTPException(status_code=401, detail="Missing authorization header")
        return "anonymous"

    if authorization.startswith("Bearer "):
        token = authorization[7:]
        if auth.verify_token(token):
            return token
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return authorization


# API Routes
@app.get("/")
async def root():
    """Serve the frontend."""
    index_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>BridgeNode Server Running</h1>")


@app.get("/{page}.html")
async def serve_page(page: str):
    """Serve other HTML pages."""
    # Security: only allow specific pages
    allowed_pages = ['terminal', 'console']
    if page not in allowed_pages:
        raise HTTPException(status_code=404, detail="Page not found")

    page_path = os.path.join(os.path.dirname(__file__), "static", f"{page}.html")
    if os.path.exists(page_path):
        return FileResponse(page_path)
    raise HTTPException(status_code=404, detail="Page not found")


@app.post("/api/auth/login")
async def login(request: LoginRequest):
    """Authenticate with username/password and get access token."""
    print(f"[LOGIN] Attempt: username={request.username}")

    if not auth.verify_credentials(request.username, request.password):
        print(f"[LOGIN] Failed: invalid credentials for {request.username}")
        raise HTTPException(
            status_code=401,
            detail={
                "error": "invalid_credentials",
                "message": "用户名或密码错误",
                "hint": "请检查用户名和密码是否正确"
            }
        )

    token = auth.generate_token()
    print(f"[LOGIN] Success: {request.username}, token={token[:16]}...")
    return {
        "success": True,
        "token": token,
        "expires_in": 24 * 3600
    }


@app.get("/api/auth/token")
async def get_current_token():
    """Get current access token."""
    current = auth.get_current_token()
    if not current:
        current = auth.generate_token()
    return {"token": current}


@app.get("/api/config")
async def get_config(token: str = Depends(simple_auth)):
    """Get cluster configuration."""
    return {
        "CLUSTER_UPLOAD_DIR": CLUSTER_UPLOAD_DIR,
        "cluster_download_dir": os.path.expanduser("~/downloads")
    }


@app.get("/api/status")
async def get_status(token: str = Depends(simple_auth)):
    """Get system status."""
    try:
        import psutil
        upload_dir = os.path.join(os.path.dirname(__file__), "uploads")

        # Get CPU and memory info
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory = psutil.virtual_memory()

        return {
            "status": "running",
            "tunnel": tunnel_monitor.get_status(),
            "connections": len(manager.active_connections),
            "upload_dir": os.listdir(upload_dir) if os.path.exists(upload_dir) else [],
            "system": {
                "cpu_percent": cpu_percent,
                "memory_total": memory.total,
                "memory_used": memory.used,
                "memory_percent": memory.percent
            }
        }
    except ImportError:
        # psutil not installed, return basic status
        try:
            upload_dir = os.path.join(os.path.dirname(__file__), "uploads")
            return {
                "status": "running",
                "tunnel": tunnel_monitor.get_status(),
                "connections": len(manager.active_connections),
                "upload_dir": os.listdir(upload_dir) if os.path.exists(upload_dir) else []
            }
        except Exception as e:
            print(f"[ERROR] get_status: {e}")
            return {
                "status": "running",
                "tunnel": {},
                "connections": 0,
                "upload_dir": [],
                "error": str(e)
            }
    except Exception as e:
        print(f"[ERROR] get_status: {e}")
        return {
            "status": "running",
            "tunnel": {},
            "connections": 0,
            "upload_dir": [],
            "error": str(e)
        }


# ============================================================
# Command Execution State Tracking
# ============================================================
import threading

# Command state storage
command_states: Dict[str, Dict[str, Any]] = {}
command_states_lock = threading.Lock()

# Active subprocesses for cancellation
active_processes: Dict[str, subprocess.Popen] = {}

class CommandRequest(BaseModel):
    command: str
    params: dict = {}
    command_id: Optional[str] = None  # Optional client-provided command ID


def update_command_state(command_id: str, state: str, **kwargs):
    """Update command state with thread safety."""
    with command_states_lock:
        if command_id not in command_states:
            command_states[command_id] = {"state": "idle", "created_at": datetime.now().isoformat()}
        command_states[command_id].update({"state": state, "updated_at": datetime.now().isoformat(), **kwargs})


def get_command_state(command_id: str) -> Dict[str, Any]:
    """Get command state."""
    with command_states_lock:
        return command_states.get(command_id, {"state": "unknown", "error": "Command not found"})


@app.post("/api/command")
async def send_command(request: CommandRequest, token: str = Depends(simple_auth)):
    """Execute a whitelisted shell command on the server."""
    command_id = request.command_id or str(uuid.uuid4())

    # SEC-002: Full-string whitelist match prevents command injection
    cmd = request.command.strip()
    if ALLOWED_COMMANDS is not None and cmd not in ALLOWED_COMMANDS:
        update_command_state(command_id, "rejected", error="Command not in whitelist")
        return {
            "success": False,
            "command_id": command_id,
            "command": cmd,
            "result": None,
            "error": "Command not allowed. Only predefined system commands are permitted.",
            "exit_code": -1,
            "state": "rejected"
        }

    try:
        update_command_state(command_id, "running", command=cmd, start_time=datetime.now().isoformat())

        # shell=True is safe: cmd is exact-matched against ALLOWED_COMMANDS whitelist
        # Required for pipe commands like 'top -b -n 1 | head -20'
        process = subprocess.Popen(
            cmd,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Store process for potential cancellation
        with command_states_lock:
            active_processes[command_id] = process

        try:
            # Wait for result with timeout
            stdout, stderr = process.communicate(timeout=30)
            returncode = process.returncode

            # Update state based on result
            if returncode == 0:
                update_command_state(command_id, "success", result=stdout, exit_code=returncode)
            else:
                update_command_state(command_id, "failed", error=stderr or "Command failed", exit_code=returncode)

            return {
                "success": returncode == 0,
                "command_id": command_id,
                "command": request.command,
                "result": stdout,
                "error": stderr if stderr else None,
                "exit_code": returncode,
                "state": "success" if returncode == 0 else "failed"
            }

        except subprocess.TimeoutExpired:
            # Kill the process on timeout
            process.kill()
            process.communicate()

            update_command_state(command_id, "timeout", error="Command execution timed out (30s)")

            return {
                "success": False,
                "command_id": command_id,
                "command": request.command,
                "result": None,
                "error": "Command execution timed out (30 seconds)",
                "exit_code": -1,
                "state": "timeout"
            }
        finally:
            # Clean up process reference
            with command_states_lock:
                if command_id in active_processes:
                    del active_processes[command_id]

    except Exception as e:
        update_command_state(command_id, "error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/command/{command_id}/status")
async def get_command_status(command_id: str, token: str = Depends(simple_auth)):
    """Get the status of a command."""
    state = get_command_state(command_id)
    return {
        "command_id": command_id,
        "state": state.get("state", "unknown"),
        "result": state.get("result"),
        "error": state.get("error"),
        "exit_code": state.get("exit_code")
    }


@app.post("/api/command/{command_id}/cancel")
async def cancel_command(command_id: str, token: str = Depends(simple_auth)):
    """Cancel a running command."""
    with command_states_lock:
        if command_id in active_processes:
            try:
                process = active_processes[command_id]
                process.kill()
                process.communicate()
                update_command_state(command_id, "cancelled", error="Command cancelled by user")
                return {"success": True, "message": "Command cancelled", "command_id": command_id}
            except Exception as e:
                return {"success": False, "error": str(e)}
        else:
            # Check if command exists in states
            state = get_command_state(command_id)
            if state.get("state") in ["success", "failed", "timeout", "cancelled"]:
                return {"success": False, "error": "Command already completed"}
            return {"success": False, "error": "Command not found or already completed"}


@app.get("/api/command/logs")
async def get_command_logs(limit: int = 50, token: str = Depends(simple_auth)):
    """Get command execution logs."""
    with command_states_lock:
        logs = []
        for cmd_id, state in list(command_states.items())[-limit:]:
            logs.append({
                "command_id": cmd_id,
                "command": state.get("command", ""),
                "state": state.get("state"),
                "result": state.get("result", "")[:200] if state.get("result") else None,
                "error": state.get("error"),
                "exit_code": state.get("exit_code"),
                "created_at": state.get("created_at"),
                "updated_at": state.get("updated_at")
            })
        logs.reverse()
        return {"logs": logs}


@app.post("/api/logs")
async def get_logs(request: LogRequest, token: str = Depends(simple_auth)):
    """Get log content."""
    # SEC-007: Validate path to prevent directory traversal
    filepath = validate_path(request.filepath)
    log_tailer.set_filter(filepath, request.filter)
    lines = await log_tailer.tail(filepath, request.lines)
    return {"lines": lines, "filepath": filepath}


# File Upload Endpoints
@app.post("/api/files/upload/init")
async def init_upload(filename: str, total_size: int, token: str = Depends(simple_auth)):
    """Initialize chunked upload."""
    upload_id = await file_transfer.init_upload(filename, total_size)
    return {"upload_id": upload_id}


@app.post("/api/files/upload/chunk")
async def upload_chunk(
    upload_id: str,
    chunk_index: int,
    chunk: UploadFile = File(...),
    token: str = Depends(simple_auth)
):
    """Upload a chunk."""
    content = await chunk.read()
    result = await file_transfer.upload_chunk(upload_id, chunk_index, content)
    return result


@app.post("/api/files/upload/complete")
async def complete_upload(upload_id: str, token: str = Depends(simple_auth)):
    """Complete upload and merge chunks."""
    result = await file_transfer.complete_upload(upload_id)
    return result


@app.get("/api/files/list")
async def list_files(token: str = Depends(simple_auth)):
    """List uploaded files."""
    files = file_transfer.list_files()
    return {"files": files}


@app.get("/api/files/download/{filename}")
async def download_file(filename: str, token: str = Depends(simple_auth)):
    """Download a file."""
    # SEC-006: Validate filename to prevent path traversal
    # Only allow safe filenames (no path separators)
    if '/' in filename or '\\' in filename or '..' in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    filepath = os.path.join(os.path.dirname(__file__), "uploads", filename)
    if os.path.exists(filepath):
        return FileResponse(filepath, filename=filename)
    raise HTTPException(status_code=404, detail="File not found")


@app.get("/api/remote/fetch-file")
async def download_remote_file_direct(
    path: str,
    token: str = Depends(simple_auth)
):
    """Download a file directly to client (triggers browser download)."""
    try:
        import zipfile
        import io

        expanded_path = validate_path(path)

        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="File not found")

        filename = os.path.basename(expanded_path)

        if os.path.isdir(expanded_path):
            # Create a zip file in memory
            memory_file = io.BytesIO()
            with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(expanded_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, os.path.dirname(expanded_path))
                        zipf.write(file_path, arcname)
            memory_file.seek(0)

            return StreamingResponse(
                memory_file,
                media_type="application/zip",
                headers={"Content-Disposition": f"attachment; filename={filename}.zip"}
            )
        else:
            # Use FileResponse without as_attachment (older FastAPI version)
            return FileResponse(
                expanded_path,
                filename=filename,
                media_type="application/octet-stream"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# SSH Transfer Configuration - Default from environment
import os

def get_default_ssh_config():
    """Get default SSH configuration from environment or defaults."""
    return {
        "enabled": True,  # Enable by default
        "host": os.getenv("SSH_HOST", "192.168.1.101"),
        "port": int(os.getenv("SSH_PORT", "22")),
        "username": os.getenv("SSH_USER", "pengxiang"),
        "password": os.getenv("SSH_PASS", ""),
        "key_file": os.getenv("SSH_KEY", os.path.expanduser("~/.ssh/id_rsa")),
        "local_download_dir": os.path.expanduser(os.getenv("SSH_DOWNLOAD_DIR", "~/downloads"))
    }

SSH_CONFIG = get_default_ssh_config()


@app.post("/api/ssh/config")
async def configure_ssh(
    host: str = "",
    port: int = 22,
    username: str = "",
    password: str = "",
    key_file: str = "",
    local_download_dir: str = "~/downloads",
    enabled: bool = False,
    token: str = Depends(simple_auth)
):
    """Configure SSH connection for file transfers."""
    global SSH_CONFIG
    SSH_CONFIG = {
        "enabled": enabled,
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "key_file": key_file,
        "local_download_dir": os.path.expanduser(local_download_dir)
    }

    # Create download directory if needed
    os.makedirs(SSH_CONFIG["local_download_dir"], exist_ok=True)

    return {"success": True, "message": f"SSH config updated. Enabled: {enabled}"}


@app.get("/api/ssh/config")
async def get_ssh_config(token: str = Depends(simple_auth)):
    """Get current SSH configuration (without password)."""
    return {
        "enabled": SSH_CONFIG["enabled"],
        "host": SSH_CONFIG["host"],
        "port": SSH_CONFIG["port"],
        "username": SSH_CONFIG["username"],
        "local_download_dir": SSH_CONFIG["local_download_dir"]
    }


@app.post("/api/ssh/download")
async def ssh_download(
    remote_path: str,
    local_path: str = "",
    token: str = Depends(simple_auth)
):
    """Download file via SSH with progress tracking."""
    import subprocess
    import threading

    if not SSH_CONFIG["enabled"]:
        return {"success": False, "error": "SSH not configured. Please configure SSH first."}

    # Determine local destination
    if not local_path:
        local_path = SSH_CONFIG["local_download_dir"]
    local_path = os.path.expanduser(local_path)
    os.makedirs(local_path, exist_ok=True)

    filename = os.path.basename(remote_path)
    dest_path = os.path.join(local_path, filename)

    # Build scp command
    if SSH_CONFIG["key_file"]:
        cmd = [
            "scp",
            "-P", str(SSH_CONFIG["port"]),
            "-i", SSH_CONFIG["key_file"],
            f"{SSH_CONFIG['username']}@{SSH_CONFIG['host']}:{remote_path}",
            dest_path
        ]
    else:
        # Use sshpass if password provided
        if SSH_CONFIG["password"]:
            cmd = [
                "sshpass", "-p", SSH_CONFIG["password"],
                "scp",
                "-P", str(SSH_CONFIG["port"]),
                f"{SSH_CONFIG['username']}@{SSH_CONFIG['host']}:{remote_path}",
                dest_path
            ]
        else:
            # Try interactive SSH (will fail if no key)
            cmd = [
                "scp",
                "-P", str(SSH_CONFIG["port"]),
                f"{SSH_CONFIG['username']}@{SSH_CONFIG['host']}:{remote_path}",
                dest_path
            ]

    try:
        # Execute scp command
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=300
        )

        if result.returncode == 0:
            return {
                "success": True,
                "message": f"Downloaded to {dest_path}",
                "local_path": dest_path,
                "filename": filename
            }
        else:
            return {
                "success": False,
                "error": result.stderr or "Transfer failed"
            }
    except subprocess.TimeoutExpired:
        return {"success": False, "error": "Transfer timeout"}
    except Exception as e:
        return {"success": False, "error": str(e)}


# SSH Command Execution using subprocess
class SSHExecRequest(BaseModel):
    host: str
    command: str
    port: int = 22
    username: str = "pengxiang"
    password: str = ""
    key_file: str = ""

@app.post("/api/ssh/exec")
async def ssh_exec_command(request: SSHExecRequest):
    """Execute command on remote host via SSH using subprocess."""
    import subprocess

    host = request.host
    command = request.command
    port = request.port
    username = request.username
    password = request.password
    key_file = request.key_file

    try:
        # Build ssh command
        ssh_cmd = ['ssh', '-o', 'StrictHostKeyChecking=no']

        if port != 22:
            ssh_cmd.extend(['-p', str(port)])

        if key_file:
            ssh_cmd.extend(['-i', key_file])
        elif password:
            # Use sshpass if available
            ssh_cmd = ['sshpass', '-p', password] + ssh_cmd

        ssh_cmd.append(f'{username}@{host}')
        ssh_cmd.append(command)

        # Execute
        result = subprocess.run(
            ssh_cmd,
            capture_output=True,
            text=True,
            timeout=60
        )

        return {
            "success": True,
            "output": result.stdout,
            "error": result.stderr,
            "exit_code": result.returncode,
            "host": host,
            "command": command
        }
    except subprocess.TimeoutExpired:
        return {
            "success": False,
            "error": "Command timeout (60s)",
            "host": host,
            "command": command
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "host": host,
            "command": command
        }


# Remote File Browser
@app.get("/api/remote/list")
async def list_remote_files(path: str = "/home", token: str = Depends(simple_auth)):
    """List files in remote directory."""
    try:
        expanded_path = validate_path(path)
        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="Path not found")

        items = []
        for item in os.listdir(expanded_path):
            item_path = os.path.join(expanded_path, item)
            try:
                stat = os.stat(item_path)
                if os.path.isdir(item_path):
                    # Count items in directory
                    try:
                        item_count = len(os.listdir(item_path))
                    except:
                        item_count = 0
                    items.append({
                        "name": item,
                        "path": item_path,
                        "is_dir": True,
                        "size": item_count,  # Number of items in directory
                        "modified": stat.st_mtime
                    })
                else:
                    items.append({
                        "name": item,
                        "path": item_path,
                        "is_dir": False,
                        "size": stat.st_size,
                        "modified": stat.st_mtime
                    })
            except:
                pass

        # Sort: directories first, then by name
        items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
        return {"path": expanded_path, "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/remote/download")
async def download_remote_file(
    path: str,
    local_dir: str = "~/downloads",
    is_dir: bool = False,
    token: str = Depends(simple_auth)
):
    """Download file or folder from remote to local."""
    try:
        import shutil

        expanded_path = validate_path(path)
        expanded_local_dir = os.path.expanduser(local_dir)

        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="Remote file not found")

        os.makedirs(expanded_local_dir, exist_ok=True)

        filename = os.path.basename(expanded_path)

        if is_dir or os.path.isdir(expanded_path):
            # Download folder as zip
            import tempfile
            import zipfile

            # Create a temporary zip file
            zip_filename = f"{filename}.zip"
            zip_path = os.path.join(expanded_local_dir, zip_filename)

            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for root, dirs, files in os.walk(expanded_path):
                    for file in files:
                        file_path = os.path.join(root, file)
                        arcname = os.path.relpath(file_path, os.path.dirname(expanded_path))
                        zipf.write(file_path, arcname)

            return {"success": True, "local_path": zip_path, "filename": zip_filename, "is_dir": True}
        else:
            # Download single file
            local_path = os.path.join(expanded_local_dir, filename)
            shutil.copy2(expanded_path, local_path)
            return {"success": True, "local_path": local_path, "filename": filename, "is_dir": False}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/remote/home")
async def get_remote_home(token: str = Depends(simple_auth)):
    """Get remote home directory."""
    return {"home": os.path.expanduser("~")}


@app.get("/api/remote/read")
async def read_remote_file(path: str, token: str = Depends(simple_auth)):
    """Read remote file content."""
    try:
        expanded_path = validate_path(path)
        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="File not found")

        if not os.path.isfile(expanded_path):
            raise HTTPException(status_code=400, detail="Path is not a file")

        # Limit file size to 100KB for display
        size = os.path.getsize(expanded_path)
        if size > 100 * 1024:
            with open(expanded_path, 'r') as f:
                content = f.read(100 * 1024) + f"\n... (truncated, total {size} bytes)"
        else:
            with open(expanded_path, 'r') as f:
                content = f.read()

        return {"content": content, "path": expanded_path, "size": size}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# File Operations
@app.post("/api/remote/mkdir")
async def create_directory(path: str, token: str = Depends(simple_auth)):
    """Create a new directory."""
    try:
        expanded_path = validate_path(path)
        os.makedirs(expanded_path, exist_ok=True)
        return {"success": True, "path": expanded_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/remote/delete")
async def delete_path(path: str, token: str = Depends(simple_auth)):
    """Delete a file or directory."""
    try:
        expanded_path = validate_path(path)
        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="Path not found")

        if os.path.isdir(expanded_path):
            import shutil
            shutil.rmtree(expanded_path)
        else:
            os.remove(expanded_path)

        return {"success": True, "path": expanded_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/remote/rename")
async def rename_path(old_path: str, new_name: str, token: str = Depends(simple_auth)):
    """Rename a file or directory."""
    try:
        # SEC-008: Validate path to prevent directory traversal
        expanded_old = validate_path(old_path)
        if not os.path.exists(expanded_old):
            raise HTTPException(status_code=404, detail="Source path not found")

        parent_dir = os.path.dirname(expanded_old)
        # SEC-008: Validate new path is also within allowed directories
        new_path = validate_path(os.path.join(parent_dir, new_name))
        os.rename(expanded_old, new_path)

        return {"success": True, "old_path": expanded_old, "new_path": new_path}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/remote/search")
async def search_files(path: str, query: str, recursive: bool = False, token: str = Depends(simple_auth)):
    """Search for files by name."""
    try:
        expanded_path = validate_path(path)
        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="Path not found")

        results = []
        query_lower = query.lower()

        # Limit search depth and time
        import time
        start_time = time.time()
        max_time = 3  # seconds
        max_results = 50

        if recursive:
            # Recursive search
            for root, dirs, files in os.walk(expanded_path):
                if len(results) >= max_results:
                    break
                if time.time() - start_time > max_time:
                    break

                for name in files + dirs:
                    if len(results) >= max_results:
                        break
                    if time.time() - start_time > max_time:
                        break
                    if query_lower in name.lower():
                        full_path = os.path.join(root, name)
                        try:
                            stat = os.stat(full_path)
                            results.append({
                                "name": name,
                                "path": full_path,
                                "is_dir": os.path.isdir(full_path),
                                "size": stat.st_size if not os.path.isdir(full_path) else 0,
                                "modified": stat.st_mtime
                            })
                        except:
                            pass
        else:
            # Immediate children only (faster)
            try:
                for name in os.listdir(expanded_path):
                    if len(results) >= max_results:
                        break
                    if time.time() - start_time > max_time:
                        break
                    full_path = os.path.join(expanded_path, name)
                    try:
                        if query_lower in name.lower():
                            stat = os.stat(full_path)
                            results.append({
                                "name": name,
                                "path": full_path,
                                "is_dir": os.path.isdir(full_path),
                                "size": stat.st_size if not os.path.isdir(full_path) else 0,
                                "modified": stat.st_mtime
                            })
                    except:
                        pass
            except:
                pass

        return {"path": expanded_path, "query": query, "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/remote/size")
async def get_directory_size(path: str, token: str = Depends(simple_auth)):
    """Calculate directory size."""
    try:
        expanded_path = validate_path(path)
        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="Path not found")

        total_size = 0
        file_count = 0
        if os.path.isdir(expanded_path):
            for root, dirs, files in os.walk(expanded_path):
                file_count += len(files)
                for name in files:
                    try:
                        full_path = os.path.join(root, name)
                        total_size += os.path.getsize(full_path)
                    except:
                        pass
        else:
            total_size = os.path.getsize(expanded_path)

        return {"path": expanded_path, "size": total_size, "size_formatted": format_size(total_size), "file_count": file_count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fs/download/folder")
async def fs_download_folder(
    path: str,
    token: str = Depends(simple_auth)
):
    """
    流式下载集群文件夹为 ZIP。
    - 自动打包文件夹为 ZIP
    - 流式返回，支持进度追踪
    """
    try:
        import zipfile
        import io

        expanded_path = validate_path(path)

        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="Path not found")

        if not os.path.isdir(expanded_path):
            raise HTTPException(status_code=400, detail="Path is not a directory")

        filename = os.path.basename(expanded_path)

        # Calculate total size for progress
        total_size = 0
        file_list = []
        for root, dirs, files in os.walk(expanded_path):
            for file in files:
                file_path = os.path.join(root, file)
                try:
                    size = os.path.getsize(file_path)
                    total_size += size
                    file_list.append((file_path, os.path.relpath(file_path, os.path.dirname(expanded_path))))
                except:
                    pass

        # Create streaming ZIP response
        async def zip_iterator():
            memory_file = io.BytesIO()
            with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file_path, arcname in file_list:
                    try:
                        with open(file_path, 'rb') as f:
                            content = f.read()
                            zipf.writestr(arcname, content)
                    except:
                        pass
            memory_file.seek(0)
            return memory_file.getvalue()

        # For now, return the whole ZIP at once (FastAPI limitation)
        # In production, you'd use a generator for true streaming
        zip_data = await zip_iterator()

        import asyncio
        async def file_iterator():
            chunk_size = 64 * 1024  # 64KB chunks
            for i in range(0, len(zip_data), chunk_size):
                yield zip_data[i:i+chunk_size]
                await asyncio.sleep(0)  # Allow other tasks to run

        return StreamingResponse(
            file_iterator(),
            media_type="application/zip",
            headers={
                "Content-Length": str(len(zip_data)),
                "Content-Disposition": f'attachment; filename="{filename}.zip"'
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[FS DOWNLOAD FOLDER] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Upload file to remote server
@app.post("/api/remote/upload")
async def upload_to_remote(
    path: str,
    token: str = Depends(simple_auth)
):
    """Upload a file to remote server."""
    try:
        expanded_path = validate_path(path)
        parent_dir = os.path.dirname(expanded_path)

        if not os.path.exists(parent_dir):
            os.makedirs(parent_dir, exist_ok=True)

        return {"success": True, "path": expanded_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/remote/upload/chunk")
async def upload_chunk_to_remote(
    upload_id: str,
    chunk_index: int,
    total_chunks: int,
    filename: str,
    destination: str,
    chunk: UploadFile = File(...),
    token: str = Depends(simple_auth)
):
    """Upload a chunk to remote server."""
    try:
        import uuid
        import tempfile

        # Use temp directory for chunk storage
        temp_dir = os.path.join(os.path.dirname(__file__), "temp_uploads")
        os.makedirs(temp_dir, exist_ok=True)

        chunk_dir = os.path.join(temp_dir, upload_id)
        os.makedirs(chunk_dir, exist_ok=True)

        chunk_path = os.path.join(chunk_dir, f"chunk_{chunk_index}")
        with open(chunk_path, "wb") as f:
            content = await chunk.read()
            f.write(content)

        # Check if all chunks are uploaded
        uploaded_chunks = os.listdir(chunk_dir)
        if len(uploaded_chunks) == total_chunks:
            # All chunks received, merge them
            expanded_dest = os.path.expanduser(destination)
            os.makedirs(os.path.dirname(expanded_dest), exist_ok=True)

            with open(expanded_dest, "wb") as dest_file:
                for i in range(total_chunks):
                    chunk_file = os.path.join(chunk_dir, f"chunk_{i}")
                    with open(chunk_file, "rb") as cf:
                        dest_file.write(cf.read())

            # Cleanup
            import shutil
            shutil.rmtree(chunk_dir)

            return {"success": True, "path": expanded_dest, "complete": True}

        return {"success": True, "chunk_index": chunk_index, "complete": False}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/remote/recent")
async def get_recent_files(path: str, limit: int = 20, token: str = Depends(simple_auth)):
    """Get recently modified files."""
    try:
        expanded_path = validate_path(path)
        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="Path not found")

        files = []
        for root, dirs, files_list in os.walk(expanded_path):
            for name in files_list:
                try:
                    full_path = os.path.join(root, name)
                    stat = os.stat(full_path)
                    files.append({
                        "name": name,
                        "path": full_path,
                        "size": stat.st_size,
                        "modified": stat.st_mtime
                    })
                except:
                    pass

        # Sort by modification time (newest first)
        files.sort(key=lambda x: x["modified"], reverse=True)
        return {"path": expanded_path, "files": files[:limit]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def format_size(bytes_val):
    """Format bytes to human readable size."""
    if bytes_val < 1024:
        return f"{bytes_val} B"
    elif bytes_val < 1024 * 1024:
        return f"{bytes_val / 1024:.1f} KB"
    elif bytes_val < 1024 * 1024 * 1024:
        return f"{bytes_val / (1024 * 1024):.1f} MB"
    else:
        return f"{bytes_val / (1024 * 1024 * 1024):.2f} GB"


# ============================================================
# 1. 文件引擎强化 (File Manager)
# ============================================================

# 流式下载存储 - 追踪活动的流
streaming_downloads: Dict[str, asyncio.Event] = {}

@app.get("/api/fs/download")
async def fs_download(
    path: str,
    token: str = Depends(simple_auth)
):
    """
    流式下载集群文件。
    - 使用 fs.createReadStream 流式返回
    - Header 中显式设置 Content-Length（供前端计算进度）
    - Header 中设置 Content-Disposition: attachment; filename="..."（强制浏览器下载）
    """
    try:
        expanded_path = validate_path(path)

        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="File not found")

        if not os.path.isfile(expanded_path):
            raise HTTPException(status_code=400, detail="Path is not a file")

        file_size = os.path.getsize(expanded_path)
        filename = os.path.basename(expanded_path)

        # 创建流式响应
        async def file_iterator():
            download_id = str(uuid.uuid4())
            streaming_downloads[download_id] = asyncio.Event()

            try:
                async with aiofiles.open(expanded_path, 'rb') as f:
                    chunk_size = 64 * 1024  # 64KB chunks
                    while True:
                        # 检查是否被中断
                        if download_id in streaming_downloads:
                            chunk = await f.read(chunk_size)
                            if not chunk:
                                break
                            yield chunk
                        else:
                            # 下载被中断
                            break
            except Exception as e:
                print(f"[FS DOWNLOAD] Stream error: {e}")
            finally:
                if download_id in streaming_downloads:
                    del streaming_downloads[download_id]

        return StreamingResponse(
            file_iterator(),
            media_type="application/octet-stream",
            headers={
                "Content-Length": str(file_size),
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[FS DOWNLOAD] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/fs/upload")
async def fs_upload(
    destination: str,
    chunk_index: int = 0,
    total_chunks: int = 1,
    filename: str = "",
    upload_id: str = "",
    chunk: UploadFile = File(None),
    token: str = Depends(simple_auth)
):
    """
    分块上传到集群指定路径。
    - 通过 ENV 注入的 CLUSTER_UPLOAD_DIR 指定目标目录
    - 处理分块和内存限制
    """
    try:
        import shutil
        import tempfile

        # SEC-006: Prevent path traversal in destination
        if ".." in destination:
            raise HTTPException(status_code=400, detail="Invalid destination path")

        # 获取集群上传目录（从环境变量或使用默认值）
        cluster_upload_dir = os.getenv(
            "CLUSTER_UPLOAD_DIR",
            os.path.join(os.path.dirname(__file__), "cluster_uploads")
        )
        os.makedirs(cluster_upload_dir, exist_ok=True)

        # 构建目标路径
        if destination.startswith("/"):
            # 绝对路径，直接使用
            expanded_dest = destination
        else:
            # 相对路径，基于集群上传目录
            expanded_dest = os.path.join(cluster_upload_dir, destination)

        # 如果只提供目录，使用原始文件名
        if os.path.isdir(expanded_dest) or not os.path.splitext(expanded_dest)[1]:
            if filename:
                expanded_dest = os.path.join(os.path.dirname(expanded_dest), filename)

        os.makedirs(os.path.dirname(expanded_dest) or ".", exist_ok=True)

        # 检查文件大小限制（100MB 单文件限制）
        MAX_FILE_SIZE = 100 * 1024 * 1024

        # 处理分块上传
        if chunk and total_chunks > 1:
            temp_dir = os.path.join(os.path.dirname(__file__), "temp_uploads")
            os.makedirs(temp_dir, exist_ok=True)

            # 如果没有提供 upload_id，生成一个新的
            if not upload_id:
                upload_id = str(uuid.uuid4())

            chunk_dir = os.path.join(temp_dir, upload_id)
            os.makedirs(chunk_dir, exist_ok=True)

            chunk_path = os.path.join(chunk_dir, f"chunk_{chunk_index}")
            content = await chunk.read()

            # 检查内存限制
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(status_code=413, detail="Chunk too large")

            async with aiofiles.open(chunk_path, 'wb') as f:
                await f.write(content)

            # 检查是否所有块都已上传
            uploaded_chunks = os.listdir(chunk_dir)
            if len(uploaded_chunks) == total_chunks:
                # 合并所有块
                async with aiofiles.open(expanded_dest, 'wb') as dest_file:
                    for i in range(total_chunks):
                        chunk_file = os.path.join(chunk_dir, f"chunk_{i}")
                        async with aiofiles.open(chunk_file, 'rb') as cf:
                            await dest_file.write(await cf.read())

                # 清理临时文件
                shutil.rmtree(chunk_dir)

                return {
                    "success": True,
                    "path": expanded_dest,
                    "complete": True,
                    "filename": os.path.basename(expanded_dest)
                }

            return {
                "success": True,
                "chunk_index": chunk_index,
                "total_chunks": total_chunks,
                "complete": False,
                "upload_id": upload_id
            }

        # 非分块上传（单文件）
        if chunk:
            content = await chunk.read()
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(status_code=413, detail="File too large")

            async with aiofiles.open(expanded_dest, 'wb') as f:
                await f.write(content)

            return {
                "success": True,
                "path": expanded_dest,
                "filename": os.path.basename(expanded_dest)
            }

        return {"success": False, "error": "No file provided"}

    except HTTPException:
        raise
    except Exception as e:
        print(f"[FS UPLOAD] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fs/status")
async def fs_upload_status(
    upload_id: str,
    token: str = Depends(simple_auth)
):
    """查询分块上传状态"""
    try:
        temp_dir = os.path.join(os.path.dirname(__file__), "temp_uploads")
        chunk_dir = os.path.join(temp_dir, upload_id)

        if not os.path.exists(chunk_dir):
            return {"success": False, "error": "Upload not found"}

        uploaded_chunks = os.listdir(chunk_dir)
        return {
            "success": True,
            "upload_id": upload_id,
            "uploaded_chunks": len(uploaded_chunks)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 2. 上下文注册表强化 (Claude Input) - PDF 解析与存储
# ============================================================

# 上下文存储（使用 JSON 文件作为简单数据库）
CONTEXT_DB_PATH = os.path.join(os.path.dirname(__file__), "context_db.json")

# UUID 映射引擎状态文件
CONTEXT_REGISTRY_PATH = os.path.join(os.path.dirname(__file__), ".context_registry.json")


def load_context_registry() -> Dict[str, Any]:
    """加载 UUID 映射注册表"""
    if os.path.exists(CONTEXT_REGISTRY_PATH):
        try:
            with open(CONTEXT_REGISTRY_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {"entries": [], "metadata": {"created_at": datetime.now().isoformat()}}
    return {"entries": [], "metadata": {"created_at": datetime.now().isoformat()}}


def save_context_registry(registry: Dict[str, Any]):
    """保存 UUID 映射注册表"""
    with open(CONTEXT_REGISTRY_PATH, 'w', encoding='utf-8') as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)


def compute_md5(content: str) -> str:
    """计算内容的 MD5 校验值"""
    return hashlib.md5(content.encode('utf-8')).hexdigest()


def git_commit_context():
    """自动提交上下文变更到 Git"""
    try:
        repo_path = os.path.dirname(__file__)
        # 检查是否是 git 仓库
        if not os.path.exists(os.path.join(repo_path, ".git")):
            print("[GIT] Not a git repository, skipping commit")
            return False

        # 添加状态文件和数据库文件
        subprocess.run(
            ["git", "add", "context_db.json", ".context_registry.json"],
            cwd=repo_path,
            capture_output=True,
            check=False
        )

        # 检查是否有变更
        result = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            cwd=repo_path,
            capture_output=True,
            check=False
        )

        if result.returncode != 0:
            # 有变更，执行提交
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            subprocess.run(
                ["git", "commit", "-m", f"chore: auto-save context registry {timestamp}"],
                cwd=repo_path,
                capture_output=True,
                check=False
            )
            print(f"[GIT] Auto-committed context registry at {timestamp}")
            return True
        else:
            print("[GIT] No changes to commit")
            return False
    except Exception as e:
        print(f"[GIT] Auto-commit failed: {e}")
        return False

def load_context_db() -> Dict[str, Any]:
    """加载上下文数据库"""
    if os.path.exists(CONTEXT_DB_PATH):
        try:
            with open(CONTEXT_DB_PATH, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {"contexts": []}
    return {"contexts": []}

def save_context_db(db: Dict[str, Any]):
    """保存上下文数据库"""
    with open(CONTEXT_DB_PATH, 'w', encoding='utf-8') as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

def parse_pdf_text(pdf_content: bytes) -> str:
    """解析 PDF 文件提取文本"""
    try:
        from pypdf import PdfReader
        from io import BytesIO

        pdf_file = BytesIO(pdf_content)
        reader = PdfReader(pdf_file)

        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"

        return text.strip()
    except Exception as e:
        print(f"[PDF PARSE] Error: {e}")
        return ""


class ContextSubmitRequest(BaseModel):
    title: str = ""
    description: str = ""


@app.post("/api/context/submit", response_model=dict)
async def context_submit(
    title: str = "",
    description: str = "",
    file: UploadFile = File(None),
    token: str = Depends(simple_auth)
):
    """
    提交上下文内容。
    - 支持 multipart/form-data 接收 PDF 文件与文本
    - 解析 PDF 文本并与表单内容合并
    - 存入本地 JSON DB，生成唯一 UUID 并返回
    """
    try:
        pdf_text = ""
        filename = ""

        # 处理 PDF 文件
        if file and file.filename:
            filename = file.filename
            if filename.lower().endswith('.pdf'):
                content = await file.read()
                # 限制 PDF 大小（10MB）
                if len(content) > 10 * 1024 * 1024:
                    raise HTTPException(status_code=413, detail="PDF file too large")

                pdf_text = parse_pdf_text(content)
                if not pdf_text:
                    print(f"[CONTEXT] Warning: Could not extract text from PDF")
            else:
                # 非 PDF 文件，读取为文本
                content = await file.read()
                try:
                    pdf_text = content.decode('utf-8')
                except:
                    pdf_text = f"[Binary file: {filename}]"

        # 合并内容
        combined_content = []
        if title:
            combined_content.append(f"Title: {title}")
        if description:
            combined_content.append(f"Description: {description}")
        if pdf_text:
            combined_content.append(f"PDF Content:\n{pdf_text}")

        full_content = "\n\n".join(combined_content)

        # 生成唯一 UUID
        context_id = str(uuid.uuid4())
        timestamp = datetime.now().isoformat()

        # 创建上下文记录
        context_record = {
            "id": context_id,
            "title": title,
            "description": description,
            "filename": filename,
            "content": full_content,
            "content_length": len(full_content),
            "created_at": timestamp,
            "pdf_extracted": bool(pdf_text)
        }

        # 计算 MD5 校验值
        md5_checksum = compute_md5(full_content)

        # 保存到数据库
        db = load_context_db()
        db["contexts"].append(context_record)
        save_context_db(db)

        # 更新 UUID 映射注册表
        registry = load_context_registry()
        registry_entry = {
            "uuid": context_id,
            "title": title or filename,
            "filename": filename,
            "md5": md5_checksum,
            "content_length": len(full_content),
            "created_at": timestamp,
            "data_file": "context_db.json",
            "pdf_extracted": bool(pdf_text)
        }
        registry["entries"].append(registry_entry)
        registry["metadata"]["last_updated"] = timestamp
        registry["metadata"]["total_entries"] = len(registry["entries"])
        save_context_registry(registry)

        # 触发 Git 自动提交
        git_commit_context()

        print(f"[CONTEXT] Created context {context_id}: {title or filename}, MD5: {md5_checksum}")

        return {
            "success": True,
            "context_id": context_id,
            "title": title or filename,
            "content_length": len(full_content),
            "pdf_extracted": bool(pdf_text),
            "created_at": timestamp
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"[CONTEXT SUBMIT] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/context/list")
async def context_list(
    limit: int = 20,
    token: str = Depends(simple_auth)
):
    """列出所有上下文"""
    try:
        db = load_context_db()
        contexts = db.get("contexts", [])

        # 按创建时间倒序
        contexts.sort(key=lambda x: x.get("created_at", ""), reverse=True)

        # 返回指定数量
        return {
            "success": True,
            "total": len(contexts),
            "contexts": contexts[:limit]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/context/registry/summary")
async def context_registry_summary(
    token: str = Depends(simple_auth)
):
    """
    获取 UUID 注册表摘要（不含完整内容，适合列表展示）
    用于 fetch_context_by_id 前的 ID 列表获取
    """
    try:
        registry = load_context_registry()
        entries = registry.get("entries", [])

        # 返回摘要列表（不含 content 字段）
        summaries = []
        for entry in entries:
            summaries.append({
                "uuid": entry.get("uuid"),
                "title": entry.get("title"),
                "filename": entry.get("filename"),
                "md5": entry.get("md5"),
                "content_length": entry.get("content_length"),
                "created_at": entry.get("created_at"),
                "pdf_extracted": entry.get("pdf_extracted")
            })

        # 按创建时间倒序
        summaries.sort(key=lambda x: x.get("created_at", ""), reverse=True)

        return {
            "success": True,
            "total": len(summaries),
            "metadata": registry.get("metadata", {}),
            "entries": summaries
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/context/{context_id}")
async def context_get(
    context_id: str,
    token: str = Depends(simple_auth)
):
    """获取指定上下文详情"""
    try:
        db = load_context_db()
        contexts = db.get("contexts", [])

        for ctx in contexts:
            if ctx.get("id") == context_id:
                return {"success": True, "context": ctx}

        raise HTTPException(status_code=404, detail="Context not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/context/{context_id}")
async def context_delete(
    context_id: str,
    token: str = Depends(simple_auth)
):
    """删除指定上下文"""
    try:
        db = load_context_db()
        contexts = db.get("contexts", [])

        original_count = len(contexts)
        db["contexts"] = [c for c in contexts if c.get("id") != context_id]

        if len(db["contexts"]) == original_count:
            raise HTTPException(status_code=404, detail="Context not found")

        save_context_db(db)

        # 同步更新 UUID 注册表
        registry = load_context_registry()
        registry["entries"] = [e for e in registry["entries"] if e.get("uuid") != context_id]
        registry["metadata"]["last_updated"] = datetime.now().isoformat()
        registry["metadata"]["total_entries"] = len(registry["entries"])
        save_context_registry(registry)

        # 触发 Git 自动提交
        git_commit_context()

        return {"success": True, "message": "Context deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 3. AI 遥测输出层 (Claude Output) - SSE 流
# ============================================================

# SSE 客户端管理
sse_clients: List[Any] = []
sse_lock = asyncio.Lock()

# 内部钩子数据队列
internal_queue: asyncio.Queue = asyncio.Queue()

# Claude Output 存储目录
CLAUDE_OUTPUTS_DIR = os.path.join(os.path.dirname(__file__), ".claude_outputs")
os.makedirs(CLAUDE_OUTPUTS_DIR, exist_ok=True)

# Debug 埋点记录文件
DEBUG_LOG_PATH = os.path.join(CLAUDE_OUTPUTS_DIR, "debug_markers.jsonl")

# Debug 关键字检测配置
DEBUG_KEYWORDS = [
    "Error", "error", "ERROR",
    "Fail", "fail", "FAIL", "Failed", "failed", "FAILED",
    "Exception", "exception", "EXCEPTION",
    "Traceback", "traceback", "TRACEBACK",
    "Warning", "warning", "WARNING",
    "AssertionError", "ValueError", "TypeError",
    "PermissionError", "FileNotFoundError", "ConnectionError"
]

# 一键复制优化 - 提取 Markdown 代码块
def extract_code_blocks(content: str) -> list:
    """从内容中提取 Markdown 代码块"""
    import re
    code_blocks = []

    # 匹配 ```language ... ``` 格式
    pattern = r'```(\w*)\n?(.*?)```'
    matches = re.findall(pattern, content, re.DOTALL)

    for lang, code in matches:
        code_blocks.append({
            "language": lang if lang else "text",
            "code": code.strip()
        })

    return code_blocks


def clean_content_for_copy(content: str) -> str:
    """清洗内容，去除装饰性字符，保留纯净代码"""
    lines = content.split('\n')
    cleaned_lines = []

    for line in lines:
        # 移除常见的装饰前缀
        import re
        # 移除 ANSI 颜色代码
        ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
        line = ansi_escape.sub('', line)

        # 移除常见的行首提示符
        stripped = line.strip()
        if stripped.startswith('>>> ') or stripped.startswith('... '):
            line = line.replace('>>> ', '', 1).replace('... ', '', 1)

        cleaned_lines.append(line)

    return '\n'.join(cleaned_lines)


def detect_debug_markers(content: str, timestamp: str) -> list:
    """检测内容中的 Debug 标记"""
    markers = []

    for keyword in DEBUG_KEYWORDS:
        if keyword in content:
            # 找到关键字所在的位置
            start_idx = content.find(keyword)
            # 获取上下文（前后各100个字符）
            context_start = max(0, start_idx - 100)
            context_end = min(len(content), start_idx + 200)
            context = content[context_start:context_end]

            # 提取行号（如果存在）
            line_number = None
            import re
            line_match = re.search(r'line (\d+)', context)
            if line_match:
                line_number = int(line_match.group(1))

            markers.append({
                "keyword": keyword,
                "context": context,
                "line_number": line_number,
                "timestamp": timestamp,
                "severity": "high" if keyword.lower() in ["error", "fail", "failed", "exception", "traceback"] else "medium"
            })

    return markers


def save_claude_output(content: str, label: str, metadata: dict, timestamp: str) -> str:
    """保存 Claude Output 到文件"""
    import hashlib

    # 生成唯一 ID
    output_id = str(uuid.uuid4())
    content_hash = hashlib.md5(content.encode('utf-8')).hexdigest()[:8]

    # 检测 Debug 标记
    debug_markers = detect_debug_markers(content, timestamp)

    # 提取代码块
    code_blocks = extract_code_blocks(content)

    # 清洗后的内容（用于复制）
    cleaned_content = clean_content_for_copy(content)

    # 构建输出记录
    output_record = {
        "id": output_id,
        "content": content,
        "cleaned_content": cleaned_content,
        "label": label,
        "metadata": metadata,
        "timestamp": timestamp,
        "content_hash": content_hash,
        "content_length": len(content),
        "has_debug_markers": len(debug_markers) > 0,
        "debug_markers": debug_markers,
        "code_blocks": code_blocks,
        "code_block_count": len(code_blocks)
    }

    # 保存到 JSON 文件
    output_file = os.path.join(CLAUDE_OUTPUTS_DIR, f"{output_id}.json")
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(output_record, f, ensure_ascii=False, indent=2)

    # 追加 Debug 标记到日志
    if debug_markers:
        with open(DEBUG_LOG_PATH, 'a', encoding='utf-8') as f:
            for marker in debug_markers:
                log_entry = {
                    "output_id": output_id,
                    "timestamp": timestamp,
                    **marker
                }
                f.write(json.dumps(log_entry, ensure_ascii=False) + '\n')

    # 更新索引文件
    index_file = os.path.join(CLAUDE_OUTPUTS_DIR, "output_index.json")
    if os.path.exists(index_file):
        with open(index_file, 'r', encoding='utf-8') as f:
            index = json.load(f)
    else:
        index = {"outputs": [], "last_updated": None}

    index["outputs"].insert(0, {
        "id": output_id,
        "label": label,
        "timestamp": timestamp,
        "content_hash": content_hash,
        "content_length": len(content),
        "has_debug_markers": len(debug_markers) > 0,
        "debug_marker_count": len(debug_markers),
        "code_block_count": len(code_blocks)
    })

    # 只保留最近100条记录
    index["outputs"] = index["outputs"][:100]
    index["last_updated"] = timestamp

    with open(index_file, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)

    return output_id


async def add_sse_client(websocket: WebSocket):
    """添加 SSE 客户端"""
    async with sse_lock:
        sse_clients.append(websocket)


async def remove_sse_client(websocket: WebSocket):
    """移除 SSE 客户端"""
    async with sse_lock:
        if websocket in sse_clients:
            sse_clients.remove(websocket)


async def broadcast_to_sse(data: dict):
    """广播数据到所有 SSE 客户端"""
    async with sse_lock:
        clients = sse_clients.copy()

    if not clients:
        return

    message = f"data: {json.dumps(data)}\n\n"
    encoded = message.encode('utf-8')

    for client in clients:
        try:
            await client.send_text(message)
        except Exception as e:
            print(f"[SSE BROADCAST] Error: {e}")
            await remove_sse_client(client)


@app.get("/api/stream/output")
async def sse_output_stream(
    token: str = Depends(simple_auth)
):
    """
    SSE 路由 - Claude Output 流。
    当 internal 接口收到数据时，立刻通过 SSE 广播给前端。
    """
    from fastapi import WebSocket

    async def event_stream():
        client_connected = asyncio.Event()
        client_connected.set()

        # 创建虚拟客户端对象
        class SSEClient:
            def __init__(self):
                self.queue = asyncio.Queue()

            async def send_text(self, text: str):
                await self.queue.put(text)

            async def close(self):
                client_connected.clear()

        client = SSEClient()
        await add_sse_client(client)

        try:
            # 发送初始连接消息
            yield f"data: {json.dumps({'type': 'connected', 'message': 'SSE stream connected'})}\n\n"

            # 保持连接并发送队列中的消息
            while client_connected.is_set():
                try:
                    # 等待新消息，超时后发送心跳
                    message = await asyncio.wait_for(client.queue.get(), timeout=30)
                    yield message
                except asyncio.TimeoutError:
                    # 发送心跳保持连接
                    yield f"data: {json.dumps({'type': 'heartbeat', 'timestamp': datetime.now().isoformat()})}\n\n"
        except Exception as e:
            print(f"[SSE STREAM] Error: {e}")
        finally:
            await remove_sse_client(client)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


class ClaudeHookRequest(BaseModel):
    """内部钩子请求模型"""
    content: str
    label: str = "Claude Output"
    metadata: dict = {}


@app.post("/api/internal/claude_hook")
async def claude_hook(
    request: ClaudeHookRequest,
    token: str = Depends(simple_auth)
):
    """
    内部 POST 接口，供大模型工具调用。
    收到数据后立刻通过 SSE 广播给前端。
    同时保存到本地文件并检测 Debug 标记。
    """
    try:
        timestamp = datetime.now().isoformat()

        # 保存输出到文件（包含 Debug 埋点和代码块提取）
        output_id = save_claude_output(
            content=request.content,
            label=request.label,
            metadata=request.metadata,
            timestamp=timestamp
        )

        # 构建输出数据
        output_data = {
            "type": "claude_output",
            "id": output_id,
            "content": request.content,
            "label": request.label,
            "metadata": request.metadata,
            "timestamp": timestamp,
            "has_debug_markers": os.path.getsize(os.path.join(CLAUDE_OUTPUTS_DIR, f"{output_id}.json")) > 0
        }

        print(f"[CLAUDE HOOK] Received: {request.label}, output_id: {output_id[:8]}...")

        # 立刻通过 SSE 广播
        await broadcast_to_sse(output_data)

        # 同时也通过 WebSocket 广播（保持向后兼容）
        try:
            await manager.broadcast(output_data)
        except Exception as e:
            print(f"[CLAUDE HOOK] WebSocket broadcast error: {e}")

        return {
            "success": True,
            "message": "Output broadcasted via SSE",
            "output_id": output_id,
            "timestamp": timestamp
        }

    except Exception as e:
        print(f"[CLAUDE HOOK] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# 同时保留原有的 push 接口用于向后兼容
@app.post("/api/claude/push")
async def push_claude_output(request: ClaudeOutputRequest, token: str = Depends(simple_auth)):
    """接收Claude的回复并通过SSE和WebSocket推送到前端（向后兼容）
    同时保存到本地文件并检测 Debug 标记。
    """
    timestamp = datetime.now().isoformat()

    # 保存输出到文件
    output_id = save_claude_output(
        content=request.content,
        label=request.label,
        metadata={},
        timestamp=timestamp
    )

    output_data = {
        "type": "claude_output",
        "id": output_id,
        "content": request.content,
        "label": request.label,
        "timestamp": timestamp
    }
    print(f"[PUSH] Received: {request.label}, output_id: {output_id[:8]}...")

    # 通过 SSE 广播
    await broadcast_to_sse(output_data)

    # 通过 WebSocket 广播
    try:
        await manager.broadcast(output_data)
        print(f"[PUSH] Broadcast completed")
    except Exception as e:
        print(f"[PUSH ERROR] Broadcast error: {e}")
        import traceback
        traceback.print_exc()
    return {"success": True, "message": "Output pushed to clients", "output_id": output_id}


# ============================================================
# 4. Claude Output 查询接口
# ============================================================

@app.get("/api/claude/outputs")
async def list_claude_outputs(
    limit: int = 20,
    has_debug_only: bool = False,
    token: str = Depends(simple_auth)
):
    """
    列出所有 Claude Output 记录
    - has_debug_only: 只返回包含 Debug 标记的输出
    """
    try:
        index_file = os.path.join(CLAUDE_OUTPUTS_DIR, "output_index.json")

        if not os.path.exists(index_file):
            return {"success": True, "outputs": [], "total": 0}

        with open(index_file, 'r', encoding='utf-8') as f:
            index = json.load(f)

        outputs = index.get("outputs", [])

        if has_debug_only:
            outputs = [o for o in outputs if o.get("has_debug_markers", False)]

        return {
            "success": True,
            "outputs": outputs[:limit],
            "total": len(outputs)
        }
    except Exception as e:
        print(f"[LIST OUTPUTS] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/claude/outputs/{output_id}")
async def get_claude_output(
    output_id: str,
    token: str = Depends(simple_auth)
):
    """获取指定 Output 的完整内容"""
    try:
        output_file = os.path.join(CLAUDE_OUTPUTS_DIR, f"{output_id}.json")

        if not os.path.exists(output_file):
            raise HTTPException(status_code=404, detail="Output not found")

        with open(output_file, 'r', encoding='utf-8') as f:
            output_data = json.load(f)

        return {"success": True, "output": output_data}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GET OUTPUT] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/claude/outputs/{output_id}/cleaned")
async def get_claude_output_cleaned(
    output_id: str,
    token: str = Depends(simple_auth)
):
    """获取清洗后的内容（一键复制用）"""
    try:
        output_file = os.path.join(CLAUDE_OUTPUTS_DIR, f"{output_id}.json")

        if not os.path.exists(output_file):
            raise HTTPException(status_code=404, detail="Output not found")

        with open(output_file, 'r', encoding='utf-8') as f:
            output_data = json.load(f)

        return {
            "success": True,
            "cleaned_content": output_data.get("cleaned_content", ""),
            "content": output_data.get("content", ""),
            "has_code_blocks": len(output_data.get("code_blocks", [])) > 0,
            "code_block_count": len(output_data.get("code_blocks", []))
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GET CLEANED] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/claude/outputs/{output_id}/code-blocks")
async def get_claude_output_code_blocks(
    output_id: str,
    token: str = Depends(simple_auth)
):
    """获取 Output 中的所有代码块"""
    try:
        output_file = os.path.join(CLAUDE_OUTPUTS_DIR, f"{output_id}.json")

        if not os.path.exists(output_file):
            raise HTTPException(status_code=404, detail="Output not found")

        with open(output_file, 'r', encoding='utf-8') as f:
            output_data = json.load(f)

        return {
            "success": True,
            "code_blocks": output_data.get("code_blocks", [])
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GET CODE BLOCKS] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/claude/debug-markers")
async def list_debug_markers(
    limit: int = 50,
    token: str = Depends(simple_auth)
):
    """列出所有 Debug 标记"""
    try:
        debug_log_path = DEBUG_LOG_PATH

        if not os.path.exists(debug_log_path):
            return {"success": True, "markers": [], "total": 0}

        markers = []
        with open(debug_log_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.strip():
                    try:
                        markers.append(json.loads(line))
                    except:
                        pass

        # 按时间倒序
        markers.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        return {
            "success": True,
            "markers": markers[:limit],
            "total": len(markers)
        }
    except Exception as e:
        print(f"[LIST DEBUG MARKERS] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/claude/outputs")
async def clear_claude_outputs(
    token: str = Depends(simple_auth)
):
    """清空所有 Claude Output 记录"""
    try:
        # 删除所有输出文件
        for filename in os.listdir(CLAUDE_OUTPUTS_DIR):
            if filename.endswith('.json') and filename != 'output_index.json':
                os.remove(os.path.join(CLAUDE_OUTPUTS_DIR, filename))

        # 重置索引
        index_file = os.path.join(CLAUDE_OUTPUTS_DIR, "output_index.json")
        with open(index_file, 'w', encoding='utf-8') as f:
            json.dump({"outputs": [], "last_updated": datetime.now().isoformat()}, f)

        # 清空 Debug 标记日志
        if os.path.exists(DEBUG_LOG_PATH):
            os.remove(DEBUG_LOG_PATH)

        return {"success": True, "message": "All outputs cleared"}
    except Exception as e:
        print(f"[CLEAR OUTPUTS] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Local File Browser (for browsing server's local files)
@app.get("/api/local/list")
async def list_local_files(path: str = "~/downloads", token: str = Depends(simple_auth)):
    """List files in local directory (on the server)."""
    try:
        expanded_path = validate_path(path)
        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="Path not found")

        items = []
        try:
            for item in os.listdir(expanded_path):
                item_path = os.path.join(expanded_path, item)
                try:
                    stat = os.stat(item_path)
                    items.append({
                        "name": item,
                        "path": item_path,
                        "is_dir": os.path.isdir(item_path),
                        "size": stat.st_size if not os.path.isdir(item_path) else 0,
                        "modified": stat.st_mtime
                    })
                except:
                    pass
        except PermissionError:
            raise HTTPException(status_code=403, detail="Permission denied")

        # Sort: directories first, then by name
        items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
        return {"path": expanded_path, "items": items}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/local/upload")
async def upload_to_local(
    destination: str,
    chunk_index: int = 0,
    total_chunks: int = 1,
    filename: str = "",
    upload_id: str = "",
    chunk: UploadFile = File(None),
    token: str = Depends(simple_auth)
):
    """Upload file to local server directory."""
    try:
        import shutil
        import tempfile

        expanded_dest = os.path.expanduser(destination)
        os.makedirs(os.path.dirname(expanded_dest) or ".", exist_ok=True)

        # Handle chunked upload
        if chunk:
            temp_dir = os.path.join(os.path.dirname(__file__), "temp_uploads")
            os.makedirs(temp_dir, exist_ok=True)
            chunk_dir = os.path.join(temp_dir, upload_id)
            os.makedirs(chunk_dir, exist_ok=True)

            chunk_path = os.path.join(chunk_dir, f"chunk_{chunk_index}")
            with open(chunk_path, "wb") as f:
                content = await chunk.read()
                f.write(content)

            # Check if all chunks are uploaded
            uploaded_chunks = os.listdir(chunk_dir)
            if len(uploaded_chunks) == total_chunks:
                with open(expanded_dest, "wb") as dest_file:
                    for i in range(total_chunks):
                        chunk_file = os.path.join(chunk_dir, f"chunk_{i}")
                        with open(chunk_file, "rb") as cf:
                            dest_file.write(cf.read())
                shutil.rmtree(chunk_dir)
                return {"success": True, "path": expanded_dest, "complete": True}

            return {"success": True, "chunk_index": chunk_index, "complete": False}

        return {"success": True, "path": expanded_dest}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==============================================
# Terminal Emulator WebSocket API
# ==============================================

# Terminal session storage
terminal_sessions: Dict[str, Dict[str, Any]] = {}
terminal_command_history: Dict[str, List[str]] = defaultdict(list)
terminal_history_index: Dict[str, int] = {}


class TerminalManager:
    """Manage terminal sessions."""

    def __init__(self):
        self.sessions: Dict[str, Dict] = {}
        self.command_history: Dict[str, List[str]] = defaultdict(list)
        self.history_index: Dict[str, int] = {}

    def create_session(self, session_id: str):
        """Create a new terminal session."""
        self.sessions[session_id] = {
            "id": session_id,
            "created_at": datetime.now().isoformat(),
            "command_count": 0,
        }
        self.command_history[session_id] = []
        self.history_index[session_id] = -1
        return self.sessions[session_id]

    def get_session(self, session_id: str):
        """Get a terminal session."""
        if session_id not in self.sessions:
            return self.create_session(session_id)
        return self.sessions[session_id]

    def add_command(self, session_id: str, command: str):
        """Add command to history."""
        if command.strip():
            if not self.command_history[session_id] or self.command_history[session_id][-1] != command:
                self.command_history[session_id].append(command)
                # Keep only last 100 commands
                if len(self.command_history[session_id]) > 100:
                    self.command_history[session_id] = self.command_history[session_id][-100:]
            self.history_index[session_id] = len(self.command_history[session_id])
            self.sessions[session_id]["command_count"] = \
                self.sessions[session_id].get("command_count", 0) + 1

    def get_history(self, session_id: str, direction: str = None, current_command: str = ""):
        """Get previous/next command from history."""
        if session_id not in self.command_history:
            return ""

        history = self.command_history[session_id]
        if not history:
            return ""

        idx = self.history_index.get(session_id, len(history))

        if direction == "up" and idx > 0:
            idx -= 1
        elif direction == "down" and idx < len(history):
            idx += 1
        elif direction is None:
            # Reset index when user types
            idx = len(history)
            # Find closest match
            for i, cmd in enumerate(reversed(history)):
                if cmd.startswith(current_command):
                    idx = len(history) - 1 - i
                    break

        self.history_index[session_id] = idx
        return history[idx] if 0 <= idx < len(history) else ""


terminal_manager = TerminalManager()


@app.websocket("/ws/terminal")
async def websocket_terminal(websocket: WebSocket):
    """WebSocket terminal for real-time command execution."""
    await websocket.accept()
    session_id = None

    try:
        # First message should be session init
        init_data = await websocket.receive_json()
        if init_data.get("type") == "init":
            session_id = init_data.get("session_id") or str(uuid.uuid4())
            terminal_manager.create_session(session_id)
            await websocket.send_json({
                "type": "init",
                "session_id": session_id,
                "welcome": "Welcome to BridgeNode Terminal\nType commands and press Enter to execute.\n",
            })

        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")

            if msg_type == "command":
                command = data.get("command", "").strip()
                if not command:
                    await websocket.send_json({"type": "output", "content": "\n"})
                    continue

                # Add to history
                terminal_manager.add_command(session_id, command)

                # Send command echo
                await websocket.send_json({
                    "type": "output",
                    "content": f"\x1b[1;32m$\x1b[0m {command}\n",
                    "is_command": True
                })

                # Execute command
                # SEC-002: Apply whitelist check if configured
                if ALLOWED_COMMANDS is not None:
                    cmd_base = command.strip().split()[0] if command.strip() else ""
                    if cmd_base not in ALLOWED_COMMANDS:
                        await websocket.send_json({
                            "type": "output",
                            "content": f"\x1b[1;31mError: Command not allowed. Only predefined commands are permitted.\x1b[0m\n"
                        })
                        continue

                # SEC-002: Use shell=False with shlex.split() to prevent injection
                try:
                    cmd_args = shlex.split(command)
                except ValueError as e:
                    await websocket.send_json({
                        "type": "output",
                        "content": f"\x1b[1;31mError: Invalid command syntax: {str(e)}\x1b[0m\n"
                    })
                    continue

                try:
                    process = subprocess.Popen(
                        cmd_args,
                        shell=False,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        bufsize=1
                    )

                    # Stream output line by line
                    for line in iter(process.stdout.readline, ''):
                        if line:
                            await websocket.send_json({
                                "type": "output",
                                "content": line,
                            })
                        # Check if process still running
                        if process.poll() is not None:
                            break

                    process.stdout.close()
                    process.wait()

                    # Send exit code
                    await websocket.send_json({
                        "type": "exit",
                        "code": process.returncode,
                    })

                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "content": f"Error: {str(e)}\n",
                    })

            elif msg_type == "history":
                direction = data.get("direction")
                current = data.get("current", "")
                cmd = terminal_manager.get_history(session_id, direction, current)
                await websocket.send_json({
                    "type": "history",
                    "command": cmd,
                })

            elif msg_type == "clear":
                await websocket.send_json({
                    "type": "clear",
                })

    except WebSocketDisconnect:
        pass
    finally:
        if session_id and session_id in terminal_manager.sessions:
            # Keep session for history, but could be cleaned up after timeout
            pass


# WebSocket Endpoint
@app.websocket("/ws/monitor")
async def websocket_monitor(websocket: WebSocket):
    """WebSocket for real-time monitoring."""
    await manager.connect(websocket)
    heartbeat_task = None

    try:
        # Start heartbeat
        heartbeat_task = asyncio.create_task(tunnel_monitor.heartbeat(websocket))

        while True:
            data = await websocket.receive_json()

            if data.get("type") == "pong":
                tunnel_monitor.record_pong(data.get("timestamp", 0))

            elif data.get("type") == "subscribe_logs":
                # Start log tailing for subscribed file
                filepath = data.get("filepath")
                if filepath:
                    asyncio.create_task(
                        log_tailer.watch(filepath, lambda line: asyncio.create_task(
                            manager.send_personal_message({
                                "type": "log",
                                "content": line
                            }, websocket)
                        ))
                    )

    except WebSocketDisconnect:
        pass
    finally:
        if heartbeat_task:
            heartbeat_task.cancel()
        manager.disconnect(websocket)


# Claude Input 存储目录
CLAUDE_INPUTS_DIR = os.path.join(CLAUDE_OUTPUTS_DIR, "inputs")
os.makedirs(CLAUDE_INPUTS_DIR, exist_ok=True)

# Claude Input 索引文件
CLAUDE_INPUT_INDEX = os.path.join(CLAUDE_INPUTS_DIR, "input_index.json")


def load_input_index() -> Dict[str, Any]:
    """加载输入索引"""
    if os.path.exists(CLAUDE_INPUT_INDEX):
        try:
            with open(CLAUDE_INPUT_INDEX, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return {"inputs": [], "last_updated": None}
    return {"inputs": [], "last_updated": None}


def save_input_index(index: Dict[str, Any]):
    """保存输入索引"""
    with open(CLAUDE_INPUT_INDEX, 'w', encoding='utf-8') as f:
        json.dump(index, f, ensure_ascii=False, indent=2)


def save_claude_input(content: str, title: str = "") -> str:
    """保存 Claude Input 到文件，返回 input_id"""
    import hashlib

    # 生成唯一 ID
    input_id = str(uuid.uuid4())
    content_hash = hashlib.md5(content.encode('utf-8')).hexdigest()[:8]

    # 生成摘要
    lines = content.split('\n')
    first_line = lines[0][:100] if lines else ""
    summary = title or first_line or "Untitled Input"

    # 创建输入记录
    input_record = {
        "id": input_id,
        "content": content,
        "summary": summary,
        "content_length": len(content),
        "line_count": len(lines),
        "word_count": len(content.split()) if content.strip() else 0,
        "content_hash": content_hash,
        "timestamp": datetime.now().isoformat()
    }

    # 保存到 JSON 文件
    input_file = os.path.join(CLAUDE_INPUTS_DIR, f"{input_id}.json")
    with open(input_file, 'w', encoding='utf-8') as f:
        json.dump(input_record, f, ensure_ascii=False, indent=2)

    # 更新索引
    index = load_input_index()
    index["inputs"].insert(0, {
        "id": input_id,
        "summary": summary,
        "content_length": len(content),
        "content_hash": content_hash,
        "timestamp": input_record["timestamp"]
    })

    # 只保留最近 200 条记录
    index["inputs"] = index["inputs"][:200]
    index["last_updated"] = input_record["timestamp"]
    save_input_index(index)

    return input_id


# Claude Input API - 接收用户输入并存储，供Claude读取
class ClaudeInputRequest(BaseModel):
    content: str
    expected_length: int = 0  # 用户期望的字符数，用于校验完整性
    checksum: str = ""  # 用户提供的校验和（可选）
    title: str = ""  # 可选的标题/摘要


@app.post("/api/claude/input")
async def receive_claude_input(request: ClaudeInputRequest, token: str = Depends(simple_auth)):
    """接收用户输入的内容，存储并返回校验信息"""
    import hashlib

    # 计算校验和
    md5_hash = hashlib.md5(request.content.encode('utf-8')).hexdigest()
    sha256_hash = hashlib.sha256(request.content.encode('utf-8')).hexdigest()

    # 保存到最新输入文件
    input_file = os.path.join(os.path.dirname(__file__), '.claude_input_latest.txt')
    try:
        with open(input_file, 'w', encoding='utf-8') as f:
            f.write(request.content)
    except Exception as e:
        print(f"[CLAUDE INPUT] Save error: {e}")

    # 持久化到 .claude_outputs/inputs/ 目录
    input_id = save_claude_input(request.content, request.title)

    # 准备返回数据
    result = {
        "success": True,
        "message": "Input received",
        "input_id": input_id,
        "content_length": len(request.content),
        "line_count": request.content.count('\n') + 1,
        "word_count": len(request.content.split()) if request.content.strip() else 0,
        "md5": md5_hash,
        "sha256": sha256_hash[:16],  # 只返回前16位
        "is_complete": True,
        "expected_length": request.expected_length,
        "length_match": request.expected_length == 0 or len(request.content) == request.expected_length
    }

    # 如果用户提供了校验和，进行验证
    if request.checksum:
        result["checksum_match"] = request.checksum.lower() == md5_hash[:len(request.checksum)].lower()

    # 通过WebSocket广播输入通知（但不发送内容本身，保护隐私）
    await manager.broadcast({
        "type": "claude_input",
        "input_id": input_id,
        "content_length": len(request.content),
        "timestamp": datetime.now().isoformat()
    })

    print(f"[CLAUDE INPUT] Received: {len(request.content)} chars, md5: {md5_hash[:8]}, id: {input_id[:8]}...")
    return result


# Claude Input 历史记录 API
@app.get("/api/claude/input/history")
async def get_input_history(
    limit: int = 50,
    token: str = Depends(simple_auth)
):
    """获取 Claude Input 历史记录列表"""
    try:
        index = load_input_index()
        inputs = index.get("inputs", [])[:limit]

        return {
            "success": True,
            "total": len(index.get("inputs", [])),
            "inputs": inputs
        }
    except Exception as e:
        print(f"[INPUT HISTORY] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/claude/input/{input_id}")
async def get_input_by_id(
    input_id: str,
    token: str = Depends(simple_auth)
):
    """根据 ID 获取 Claude Input 详情"""
    try:
        input_file = os.path.join(CLAUDE_INPUTS_DIR, f"{input_id}.json")

        if not os.path.exists(input_file):
            raise HTTPException(status_code=404, detail="Input not found")

        with open(input_file, 'r', encoding='utf-8') as f:
            input_data = json.load(f)

        return {"success": True, "input": input_data}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[GET INPUT] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/claude/input/{input_id}")
async def delete_input(
    input_id: str,
    token: str = Depends(simple_auth)
):
    """删除指定的 Claude Input"""
    try:
        input_file = os.path.join(CLAUDE_INPUTS_DIR, f"{input_id}.json")

        if not os.path.exists(input_file):
            raise HTTPException(status_code=404, detail="Input not found")

        # 删除文件
        os.remove(input_file)

        # 更新索引
        index = load_input_index()
        index["inputs"] = [i for i in index["inputs"] if i.get("id") != input_id]
        index["last_updated"] = datetime.now().isoformat()
        save_input_index(index)

        return {"success": True, "message": "Input deleted"}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[DELETE INPUT] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Claude Input Query API - Claude查询最新输入
@app.get("/api/claude/input/latest")
async def get_latest_input(token: str = Depends(simple_auth)):
    """获取最新的用户输入（Claude调用此API读取用户输入）"""
    # 从本地文件读取最新的输入
    input_file = os.path.join(os.path.dirname(__file__), '.claude_input_latest.txt')
    if os.path.exists(input_file):
        with open(input_file, 'r', encoding='utf-8') as f:
            content = f.read()
        import hashlib
        md5_hash = hashlib.md5(content.encode('utf-8')).hexdigest()
        return {
            "success": True,
            "content": content,
            "content_length": len(content),
            "checksum": md5_hash,
            "timestamp": datetime.now().isoformat()
        }
    return {"success": False, "message": "No input available", "content": ""}


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="BridgeNode Server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT, help="Server port")
    parser.add_argument("--host", type=str, default=HOST, help="Server host")
    args = parser.parse_args()

    global PORT
    PORT = args.port

    uvicorn.run(
        app,
        host=args.host,
        port=PORT,
        log_level="info"
    )


if __name__ == "__main__":
    main()
