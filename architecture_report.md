# Bridge-node Backend Architecture Report

**Generated:** 2026-02-18
**Analyzer:** Backend-Developer Expert
**Focus:** WebSocket, API Design, Middleware, Performance

---

## 1. Executive Summary

Bridge-node is a FastAPI-based SSH tunnel web interaction middleware with WebSocket support. The application provides terminal emulation, file operations, and context management through 60+ API endpoints.

| Aspect | Status | Rating |
|--------|--------|--------|
| API Design | Functional | 7/10 |
| WebSocket Management | Basic | 5/10 |
| Error Handling | Inconsistent | 4/10 |
| Performance | Needs Optimization | 5/10 |
| Security | Adequate | 7/10 |

---

## 2. Architecture Overview

### 2.1 Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| Web Framework | FastAPI | Latest |
| ASGI Server | uvicorn | Latest |
| WebSocket | Native FastAPI | - |
| Authentication | Token-based (in-memory) | - |
| Configuration | Python env variables | - |

### 2.2 Core Modules

| Module | Purpose | LOC |
|--------|---------|-----|
| server.py | Main application | 2900+ |
| websocket_manager.py | Connection management | 52 |
| tunnel_monitor.py | SSH tunnel heartbeat | 49 |
| log_tailer.py | Log file streaming | 89 |
| file_transfer.py | File operations | - |
| auth.py | Authentication | 47 |
| config.py | Configuration | 57 |

### 2.3 API Endpoint Distribution

```
/api/auth/*       - Authentication (2 endpoints)
/api/command/*    - Command execution (4 endpoints)
/api/files/*      - File upload/download (6 endpoints)
/api/ssh/*        - SSH operations (4 endpoints)
/api/remote/*     - Remote file operations (12 endpoints)
/api/context/*    - Context management (5 endpoints)
/api/claude/*     - Claude integration (10 endpoints)
/api/local/*      - Local operations (2 endpoints)
/ws/*             - WebSocket (2 endpoints)
```

---

## 3. Detailed Analysis

### 3.1 WebSocket Management

#### Current Implementation
- **Endpoint 1:** `/ws/terminal` - Terminal emulation
- **Endpoint 2:** `/ws/monitor` - Real-time monitoring
- **Connection Manager:** Simple `Set` based storage

#### Issues Identified

| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| No ping/pong timeout | High | server.py:2671 | Stale connections not detected |
| Blocking file read in watch | High | log_tailer.py:71 | Event loop blocking |
| No connection limits | Medium | websocket_manager.py | DoS vulnerability |
| Memory leak potential | Medium | server.py:2665 | Sessions never cleaned |

#### Code Issue Example

```python
# log_tailer.py:70-82 - BLOCKING READ IN ASYNC CONTEXT
while True:
    line = f.readline()  # BLOCKING - should use aiofiles
    if line:
        ...
    else:
        await asyncio.sleep(0.5)  # Inefficient polling
```

#### Recommendations

1. **Add ping/pong with timeout:**
```python
# Add to /ws/monitor
try:
    await asyncio.wait_for(websocket.receive_json(), timeout=30)
except asyncio.TimeoutError:
    await manager.disconnect(websocket)
```

2. **Replace blocking file read:**
```python
# Use aiofiles instead
import aiofiles

async with aiofiles.open(filepath, 'r') as f:
    await f.seek(start_pos)
    while True:
        line = await f.readline()
        if not line:
            await asyncio.sleep(0.1)
```

3. **Add connection limits:**
```python
MAX_CONNECTIONS = 100

@app.websocket("/ws/monitor")
async def websocket_monitor(websocket: WebSocket):
    if len(manager.active_connections) >= MAX_CONNECTIONS:
        await websocket.close(code=1013)
        return
```

---

### 3.2 API Routing Design

#### Current Patterns

- **RESTful:** Mostly RESTful with proper HTTP methods
- **Versioning:** Not implemented (should add `/api/v1/`)
- **Response Format:** Inconsistent across endpoints

#### Issues

| Issue | Severity | Location | Example |
|-------|----------|----------|---------|
| No global error handler | High | server.py | Each endpoint has own try/catch |
| Inconsistent responses | Medium | Throughout | Some return `dict`, some return `Response` |
| No request validation | Medium | Most endpoints | Missing Pydantic models |
| Bare except clauses | Medium | 13 locations | `except:` instead of specific exceptions |

#### Code Issue Examples

```python
# server.py:844 - BARE EXCEPT
try:
    ...
except:  # BAD - catches everything including KeyboardInterrupt
    ...

# Should be:
except ValueError as e:
    logger.warning(f"Validation error: {e}")
except TimeoutError:
    ...
except Exception as e:
    logger.error(f"Unexpected error: {e}")
```

#### Recommendations

1. **Add global exception handler:**
```python
from fastapi import Request
from fastapi.responses import JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "path": str(request.url)}
    )
```

2. **Standardize response format:**
```python
class ApiResponse(BaseModel):
    data: Any = None
    error: Optional[str] = None
    meta: dict = {}
```

---

### 3.3 Middleware Usage

#### Current Middleware

| Middleware | Status | Config |
|------------|--------|--------|
| CORS | ✅ Enabled | 6 origins allowed |
| Security Headers | ❌ Missing | No helmet |
| Compression | ❌ Missing | No gzip |
| Rate Limiting | ❌ Missing | Not implemented |
| Request Logging | ❌ Missing | Manual in each endpoint |

#### Recommendations

1. **Add security headers:**
```python
from fastapi.middleware.trustedhost import TrustedHostMiddleware

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=["localhost", "127.0.0.1"]
)
```

2. **Add compression:**
```python
from fastapi.middleware.gzip import GZipMiddleware
app.add_middleware(GZipMiddleware, minimum_size=1000)
```

---

### 3.4 Synchronous/Blocking Calls

#### Problematic Areas

| Location | Type | Risk |
|----------|------|------|
| server.py:2613 | subprocess.Popen | Event loop blocking |
| server.py:405 | subprocess.Popen | Event loop blocking |
| log_tailer.py:33,65 | open() file read | Event loop blocking |
| auth.py:16-31 | In-memory token | Race condition possible |

#### Code Example - Blocking Subprocess

```python
# server.py:2613-2634 - BLOCKING IN ASYNC
process = subprocess.Popen(...)  # BLOCKING
for line in iter(process.stdout.readline, ''):  # BLOCKING
    await websocket.send_json(...)
process.wait()  # BLOCKING
```

#### Recommendations

1. **Use asyncio.subprocess:**
```python
# Instead of subprocess.Popen, use:
process = await asyncio.create_subprocess_exec(
    *cmd_args,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.STDOUT
)

while True:
    line = await process.stdout.readline()
    if not line:
        break
    await websocket.send_json(...)
```

2. **Use aiofiles for file operations:**
```python
import aiofiles

async with aiofiles.open(filepath, 'r') as f:
    content = await f.read()
```

---

### 3.5 Error Handling

#### Current State

- 40+ try/catch blocks throughout
- 13 bare `except:` clauses
- No centralized error logging
- Inconsistent error messages

#### Recommendations

1. **Create custom exception hierarchy:**
```python
class BridgeNodeError(Exception):
    """Base exception"""
    status_code = 500

class AuthenticationError(BridgeNodeError):
    status_code = 401

class ValidationError(BridgeNodeError):
    status_code = 400
```

2. **Add error logging:**
```python
import logging

logger = logging.getLogger("bridge-node")

@app.exception_handler(BridgeNodeError)
async def handle_bridge_error(request, exc):
    logger.error(f"{exc.__class__.__name__}: {exc}", exc_info=True)
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc)})
```

---

### 3.6 Memory Leak Risks

#### Identified Risks

| Risk | Location | Description |
|------|----------|-------------|
| Terminal sessions | server.py:2480 | Never cleaned up on disconnect |
| Command history | server.py:2516 | Capped at 100, but sessions persist |
| File positions | log_tailer.py:12 | Grows indefinitely |
| Active processes | server.py:359 | Dict with potential orphans |

#### Recommendations

1. **Add session cleanup:**
```python
# In websocket disconnect handler
@app.websocket("/ws/terminal")
async def websocket_terminal(websocket: WebSocket):
    ...
    finally:
        if session_id:
            terminal_manager.cleanup_session(session_id)  # Add this method
```

2. **Add TTL-based cleanup:**
```python
# In TerminalManager
def cleanup_session(self, session_id: str):
    if session_id in self.sessions:
        del self.sessions[session_id]
    if session_id in self.command_history:
        del self.command_history[session_id]
```

3. **Periodic cleanup task:**
```python
async def cleanup_expired_sessions():
    while True:
        await asyncio.sleep(300)  # Every 5 minutes
        # Remove sessions older than 1 hour
        cutoff = time.time() - 3600
        for sid, session in list(terminal_manager.sessions.items()):
            if session.get("created_at", 0) < cutoff:
                terminal_manager.cleanup_session(sid)
```

---

### 3.7 Database/Cache Usage

#### Current State

- **Database:** None (in-memory only)
- **Cache:** None
- **Persistence:** JSON files for context registry

#### Issues

| Issue | Impact |
|-------|--------|
| No persistent storage | Data lost on restart |
| No caching | Repeated expensive operations |
| No connection pooling | Resource inefficiency |

#### Recommendations

1. **Add SQLite for persistence:**
```python
import sqlite3

# For context registry
conn = sqlite3.connect("bridge-node.db")
```

2. **Add Redis for caching:**
```python
import redis
cache = redis.Redis(host='localhost', port=6379)
```

---

## 4. Optimization Priorities

### Quick Wins (1-2 hours)

| Priority | Task | Impact |
|----------|------|--------|
| 1 | Add helmet middleware | Security |
| 2 | Fix bare except clauses | Reliability |
| 3 | Add /health endpoint | Observability |
| 4 | Add request ID logging | Debugging |

### Medium Effort (1 day)

| Priority | Task | Impact |
|----------|------|--------|
| 5 | Global exception handler | Consistency |
| 6 | Replace blocking subprocess | Performance |
| 7 | Add aiofiles for log tailing | Performance |
| 8 | Add connection limits | Security |

### Long-term (1 week)

| Priority | Task | Impact |
|----------|------|--------|
| 9 | JWT authentication | Security |
| 10 | Redis rate limiting | Security |
| 11 | Database persistence | Reliability |
| 12 | WebSocket reconnection | UX |

---

## 5. Security Considerations

### Current Security Measures

| Measure | Status |
|---------|--------|
| CORS | ✅ Configured |
| Command whitelist | ✅ Implemented |
| Shell injection prevention | ✅ shlex.split() |
| Token authentication | ⚠️ Basic |

### Missing Security

- No rate limiting
- No request size limits
- No IP whitelisting
- Token not revocable

---

## 6. Performance Metrics

### Baseline Targets

| Metric | Current | Target |
|--------|---------|--------|
| Response time (p95) | Unknown | < 200ms |
| WebSocket latency | Unknown | < 50ms |
| Memory usage | Unknown | < 200MB |
| Concurrent connections | Limited | 100+ |

---

## 7. Appendix

### File Locations

| File | Path |
|------|------|
| Main server | `/home/pengxiang/bridge-node/server.py` |
| WebSocket manager | `/home/pengxiang/bridge-node/websocket_manager.py` |
| Log tailer | `/home/pengxiang/bridge-node/log_tailer.py` |
| Tunnel monitor | `/home/pengxiang/bridge-node/tunnel_monitor.py` |
| Auth | `/home/pengxiang/bridge-node/auth.py` |
| Config | `/home/pengxiang/bridge-node/config.py` |

### Key Dependencies

```
fastapi
uvicorn
pydantic
aiofiles
sse-starlette
websockets
```
