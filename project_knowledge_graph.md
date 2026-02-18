# BridgeNode Project Knowledge Graph

## Project Overview
- **Project Name**: BridgeNode
- **Type**: SSH Tunnel Web Interaction Middleware
- **Main Entry**: `/home/pengxiang/bridge-node/server.py`
- **Port**: 8888 (default)
- **Framework**: FastAPI + uvicorn

## Directory Structure

```
bridge-node/
├── server.py                 # Main application (746KB+, 190+ API endpoints)
├── config.py                 # Configuration management
├── auth.py                   # Authentication
├── rbac.py                   # Role-Based Access Control
├── static/
│   ├── index.html            # Main UI
│   ├── console.html          # Console interface
│   ├── terminal.html         # Terminal interface
│   ├── tunnel-config.html    # Tunnel configuration
│   ├── monitor.html          # Monitoring UI
│   ├── recordings.html       # Session recordings
│   ├── backup.html           # Backup management
│   └── ...
├── scripts/                  # Utility scripts
├── .collab/                  # Collaboration state
└── *.py                      # 100+ module files
```

## Core Modules

### Security Modules
| Module | File | Purpose |
|--------|------|---------|
| auth | auth.py | User authentication |
| rbac | rbac.py | Role-based permissions |
| security_logger | security_logger.py | Security event logging |
| csrf_protector | csrf_protector.py | CSRF protection |
| ip_whitelist | ip_whitelist.py | IP filtering |
| encryption | encryption.py | Data encryption |
| circuit_breaker | circuit_breaker.py | Fault tolerance |

### Tunnel & Connection
| Module | File | Purpose |
|--------|------|---------|
| tunnel_monitor | tunnel_monitor.py | SSH tunnel monitoring |
| tunnel_config | tunnel_config.py | Tunnel configuration |
| session_manager | session_manager.py | Session lifecycle |
| log_tailer | log_tailer.py | Log streaming |

### Agent Management (50+ modules)
| Module Prefix | Count | Purpose |
|---------------|-------|---------|
| agent_* | 50+ | Agent lifecycle, scheduling, failover, etc. |

### Monitoring & Analytics
| Module | File | Purpose |
|--------|------|---------|
| monitoring | monitoring.py | System monitoring |
| metrics_observability | metrics_observability.py | Prometheus metrics |
| alert_dashboard | alert_dashboard.py | Alert visualization |

## API Endpoints Summary

### Authentication & Security
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/login` | POST | User login |
| `/api/auth/token` | GET | Get token |
| `/api/auth/token/refresh` | POST | Refresh token |
| `/api/auth/sessions` | GET | List sessions |
| `/api/rbac/roles` | GET | List roles |
| `/api/rbac/check` | GET | Check permission |
| `/api/security/logs` | GET | Security logs |
| `/api/whitelist/config` | GET/POST | IP whitelist |

### Configuration
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/config` | GET | Get config |
| `/api/dynamic-config/{key}` | GET/POST | Dynamic config |
| `/api/rate-limit/config` | GET/POST | Rate limit config |

### Tunnel Management
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ssh/config` | POST | SSH config |
| `/api/remote/fetch-file` | GET | Fetch remote file |

### Batch Operations
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/batch/command` | POST | Execute batch commands |
| `/api/batch/operations` | POST | Batch operations |

### Files
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/files/upload/init` | POST | Init upload |
| `/api/files/upload/chunk` | POST | Upload chunk |
| `/api/files/upload/complete` | POST | Complete upload |
| `/api/files/list` | GET | List files |
| `/api/files/download/{filename}` | GET | Download file |

### Monitoring
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/health/detailed` | GET | Detailed health |
| `/metrics` | GET | Prometheus metrics |
| `/api/status` | GET | System status |

### Recordings
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/recordings` | GET | List recordings |
| `/api/recordings/{id}` | GET | Get recording |
| `/api/recordings/{id}/playback` | GET | Playback |

### Plugins & Gateway
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/plugins/list` | GET | List plugins |
| `/api/plugins/{name}/load` | POST | Load plugin |
| `/api/gateway/routes` | GET/POST | Gateway routes |

## Data Flow

```
Client (Browser)
    │
    ▼
FastAPI (server.py)
    │
    ├─▶ WebSocket (/ws)
    │       │
    │       ▼
    │   websocket_manager.py
    │       │
    │       ▼
    │   tunnel_monitor.py
    │       │
    │       ▼
    │   SSH Tunnel
    │
    ├─▶ REST API
    │       │
    │       ├─▶ auth.py (authentication)
    │       ├─▶ rbac.py (authorization)
    │       ├─▶ session_manager.py (sessions)
    │       ├─▶ tunnel_config.py (tunnels)
    │       └─▶ [50+ agent modules]
    │
    └─▶ Static Files (HTML/JS/CSS)
```

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `terminal_output` | Server→Client | Terminal output |
| `terminal_input` | Client→Server | Terminal input |
| `tunnel_status` | Server→Client | Tunnel status update |
| `session_update` | Server→Client | Session state change |

## Key Classes in server.py

### FastAPI App
- `app`: Main FastAPI application instance

### Imported Managers
- `tunnel_manager`: TunnelConfig - Tunnel lifecycle
- `session_manager`: Session management
- `websocket_manager`: WebSocket connections
- `rate_limiter`: Rate limiting
- `plugin_manager`: Plugin system
- `monitoring_system`: System monitoring
- `security_logger`: Security logging
- `audit_logger`: Audit trail

## Configuration

### Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `CLUSTER_UPLOAD_DIR` | `/tmp/cluster_uploads` | Upload directory |
| `HOST` | `0.0.0.0` | Bind host |
| `DEFAULT_PORT` | `8888` | Default port |

### CORS Settings
- Origins: Configurable
- Methods: GET, POST, PUT, DELETE, OPTIONS
- Headers: Authorization, Content-Type

## Security Features

1. **CSRF Protection**: Token-based
2. **Rate Limiting**: Per-IP, distributed support
3. **IP Whitelist**: Configurable
4. **RBAC**: Role-based permissions
5. **Encryption**: SSH config encryption
6. **Audit Logging**: All operations logged
7. **Circuit Breaker**: Fault tolerance

## Start Commands

```bash
# Default port
python server.py

# Custom port
python server.py --port 8888

# With SSL
python server.py --ssl
```

## Dependencies

- fastapi
- uvicorn
- pydantic
- sse_starlette
- aiofiles
- websockets
