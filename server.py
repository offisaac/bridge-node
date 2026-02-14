"""BridgeNode - SSH Tunnel Web Interaction Middleware"""
import argparse
import asyncio
import os
import secrets
import subprocess
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse
from pydantic import BaseModel

from config import HOST, DEFAULT_PORT, CORS_ORIGINS, find_available_port, ensure_directories
import auth
from tunnel_monitor import tunnel_monitor
from log_tailer import log_tailer
from file_transfer import file_transfer
from websocket_manager import manager

# Ensure directories exist
ensure_directories()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    token = auth.generate_token()
    print(f"\n{'='*50}")
    print(f"BridgeNode v1.0.0")
    print(f"{'='*50}")
    print(f"Server running at: http://{HOST}:{PORT}")
    print(f"Token: {token}")
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


# Simple auth dependency - just check if credentials provided match
async def simple_auth(authorization: str = Header(None)):
    """Simple authentication - accept any valid credentials in header or just allow for now."""
    # Skip auth for development - can be enabled later
    # Return the token string (strip "Bearer " prefix if present)
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    return authorization if authorization else "anonymous"


# API Routes
@app.get("/")
async def root():
    """Serve the frontend."""
    index_path = os.path.join(os.path.dirname(__file__), "static", "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>BridgeNode Server Running</h1>")


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


@app.post("/api/command")
async def send_command(request: CommandRequest, token: str = Depends(simple_auth)):
    """Execute a shell command on the server."""
    try:
        # Execute the command
        result = subprocess.run(
            request.command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30
        )

        return {
            "success": result.returncode == 0,
            "command": request.command,
            "result": result.stdout,
            "error": result.stderr if result.stderr else None,
            "exit_code": result.returncode
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=408, detail="Command execution timed out")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/logs")
async def get_logs(request: LogRequest, token: str = Depends(simple_auth)):
    """Get log content."""
    # Expand home directory
    filepath = os.path.expanduser(request.filepath)
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

        expanded_path = os.path.expanduser(path)

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


# Remote File Browser
@app.get("/api/remote/list")
async def list_remote_files(path: str = "/home", token: str = Depends(simple_auth)):
    """List files in remote directory."""
    try:
        expanded_path = os.path.expanduser(path)
        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="Path not found")

        items = []
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

        expanded_path = os.path.expanduser(path)
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
        expanded_path = os.path.expanduser(path)
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
        expanded_path = os.path.expanduser(path)
        os.makedirs(expanded_path, exist_ok=True)
        return {"success": True, "path": expanded_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/remote/delete")
async def delete_path(path: str, token: str = Depends(simple_auth)):
    """Delete a file or directory."""
    try:
        expanded_path = os.path.expanduser(path)
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
        expanded_old = os.path.expanduser(old_path)
        if not os.path.exists(expanded_old):
            raise HTTPException(status_code=404, detail="Source path not found")

        parent_dir = os.path.dirname(expanded_old)
        new_path = os.path.join(parent_dir, new_name)
        os.rename(expanded_old, new_path)

        return {"success": True, "old_path": expanded_old, "new_path": new_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/remote/search")
async def search_files(path: str, query: str, recursive: bool = False, token: str = Depends(simple_auth)):
    """Search for files by name."""
    try:
        expanded_path = os.path.expanduser(path)
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
        expanded_path = os.path.expanduser(path)
        if not os.path.exists(expanded_path):
            raise HTTPException(status_code=404, detail="Path not found")

        total_size = 0
        if os.path.isdir(expanded_path):
            for root, dirs, files in os.walk(expanded_path):
                for name in files:
                    try:
                        full_path = os.path.join(root, name)
                        total_size += os.path.getsize(full_path)
                    except:
                        pass
        else:
            total_size = os.path.getsize(expanded_path)

        return {"path": expanded_path, "size": total_size, "size_formatted": format_size(total_size)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# Upload file to remote server
@app.post("/api/remote/upload")
async def upload_to_remote(
    path: str,
    token: str = Depends(simple_auth)
):
    """Upload a file to remote server."""
    try:
        expanded_path = os.path.expanduser(path)
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
        expanded_path = os.path.expanduser(path)
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


# Local File Browser (for browsing server's local files)
@app.get("/api/local/list")
async def list_local_files(path: str = "~/downloads", token: str = Depends(simple_auth)):
    """List files in local directory (on the server)."""
    try:
        expanded_path = os.path.expanduser(path)
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


# Claude Output Push API - 接收Claude的回复并推送到前端
class ClaudeOutputRequest(BaseModel):
    content: str
    label: str = "Claude Output"

@app.post("/api/claude/push")
async def push_claude_output(request: ClaudeOutputRequest, token: str = Depends(simple_auth)):
    """接收Claude的回复并通过WebSocket推送到前端"""
    output_data = {
        "type": "claude_output",
        "content": request.content,
        "label": request.label,
        "timestamp": datetime.now().isoformat()
    }
    print(f"[PUSH] Received: {output_data}")
    # 通过WebSocket广播到所有连接的客户端
    try:
        await manager.broadcast(output_data)
        print(f"[PUSH] Broadcast completed")
    except Exception as e:
        print(f"[PUSH ERROR] Broadcast error: {e}")
        import traceback
        traceback.print_exc()
    return {"success": True, "message": "Output pushed to clients"}


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
