# BridgeNode

<div align="center">

[![PyPI Version](https://img.shields.io/pypi/v/bridgenode)](https://pypi.org/project/bridgenode/)
[![Python Versions](https://img.shields.io/pypi/pyversions/bridgenode)](https://pypi.org/project/bridgenode/)
[![License](https://img.shields.io/pypi/l/bridgenode)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/offisaac/bridge-node)](https://github.com/offisaac/bridge-node/stargazers)

**English** | [中文](README_zh.md)

A modern SSH Tunnel Web Interface for seamless local-cluster data exchange, real-time monitoring, and file transfers.

</div>

## Overview

BridgeNode is a FastAPI-based web middleware that provides a beautiful web interface for interacting with remote servers through SSH tunnels. It enables developers and system administrators to:

- 📁 **File Transfer** - Drag-and-drop upload/download with chunked transfer for large files
- 📊 **Real-time Monitoring** - WebSocket-powered live tunnel status and system metrics
- 📝 **Log Tail** - Stream remote log files in real-time
- 💻 **Command Console** - Execute predefined or custom commands on remote servers
- 🎨 **Beautiful UI** - Dark/Light theme with modern design (Notion/Linear inspired)

## Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/offisaac/bridge-node.git
cd bridge-node

# Install dependencies
pip install -r requirements.txt
```

### Configuration

Set required environment variables:

```bash
# Required: Set your credentials
export BRIDGENODE_USERNAME=admin
export BRIDGENODE_PASSWORD=your_secure_password

# Optional: Customize port (default: 8080)
export PORT=8080

# Optional: Enable anonymous access (not recommended for production)
export BRIDGENODE_OPTIONAL_AUTH=1
```

### Run

```bash
python server.py --port 8080
```

### Access

Open your browser: `http://localhost:8080`

Create an SSH tunnel to access remote servers:

```bash
# Local access
ssh -L 8080:localhost:8080 user@your-cluster -N -f

# Or use the helper script
./scripts/generate_ssh.sh -u your_user -h your_host -p 8080
```

## Features

### File Manager
- Browse remote directories
- Drag-and-drop file upload with chunked transfer
- Download files with progress tracking
- Support for large files ( resumable uploads)

### Command Console
- Predefined quick commands (top, ps, nvidia-smi, etc.)
- Custom command execution with output streaming
- Command history and favorites

### Log Tailer
- Real-time log file streaming
- Regex filtering
- Multi-file monitoring support

### System Monitor
- Live SSH tunnel status via WebSocket
- CPU, Memory, GPU monitoring
- Connection health checks

### Modern UI
- Dark/Light theme toggle
- Responsive design
- Keyboard shortcuts
- Clipboard monitoring

## API Reference

### Authentication

```bash
# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "your_password"}'

# Response
{"success": true, "token": "your_jwt_token"}
```

### File Operations

```bash
# List files
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8080/api/files/list?path=/home/user

# Upload (chunked)
curl -X POST http://localhost:8080/api/files/upload/init \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"filename": "largefile.zip", "size": 104857600}'
```

### Command Execution

```bash
# Execute predefined command
curl -X POST http://localhost:8080/api/command \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"command": "nvidia-smi"}'
```

### WebSocket

```bash
# Connect to monitor stream
wscat -c ws://localhost:8080/ws/monitor
```

For full API documentation, see [API_CONTRACT.md](API_CONTRACT.md).

## Project Structure

```
bridge-node/
├── server.py              # FastAPI main server
├── config.py              # Configuration management
├── auth.py                # Authentication & JWT
├── tunnel_monitor.py      # SSH tunnel heartbeat
├── log_tailer.py         # Real-time log streaming
├── file_transfer.py       # Chunked file transfer
├── websocket_manager.py   # WebSocket connections
├── rate_limiter.py       # API rate limiting
├── static/
│   ├── index.html        # Main SPA
│   ├── styles/           # CSS stylesheets
│   └── js/               # JavaScript modules
├── scripts/
│   └── generate_ssh.sh   # SSH tunnel generator
├── tests/                # Test suite
├── k8s/                  # Kubernetes manifests
├── LICENSE               # MIT License
├── README.md             # English documentation
└── requirements.txt      # Python dependencies
```

## Deployment

### Docker

```dockerfile
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .
EXPOSE 8080

ENV BRIDGENODE_USERNAME=admin
ENV BRIDGENODE_PASSWORD=change_me

CMD ["python", "server.py", "--host", "0.0.0.0"]
```

```bash
docker build -t bridgenode .
docker run -d -p 8080:8080 \
  -e BRIDGENODE_USERNAME=admin \
  -e BRIDGENODE_PASSWORD=your_password \
  bridgenode
```

### Kubernetes

```bash
kubectl apply -f k8s/
```

See [k8s/](k8s/) directory for full manifests.

## Security

- JWT-based authentication
- Rate limiting on all endpoints
- Command whitelist for execution safety
- Path traversal prevention
- CORS configuration

**Important**: Change default credentials in production!

## Development

```bash
# Install dev dependencies
pip install -r requirements.txt

# Run tests
pytest tests/ -v

# Run with auto-reload
uvicorn server:app --reload
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](COLLABORATE.md) first.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file.

## Acknowledgments

- [FastAPI](https://fastapi.tiangolo.com/) - Web framework
- [Uvicorn](https://www.uvicorn.org/) - ASGI server
- [WebSockets](https://websockets.readthedocs.io/) - Real-time communication

---

<div align="center">

Made with ❤️ by [offisaac](https://github.com/offisaac)

</div>
