# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0] - 2024-03-05

### Fixed
- Token-based authentication for all API calls
- 401 errors when accessing via Tailscale/VPN
- Token validation on page load
- Login modal not showing when token is invalid
- SSE endpoint authentication via query param

### Security
- All API requests now require authentication
- Token stored in localStorage with validation

## [1.1.0] - 2024-03-05

### Added
- Premium minimal light theme (Notion/Linear style)
- Comprehensive English and Chinese README documentation
- MIT License
- Docker deployment support
- Kubernetes manifests
- GitHub Actions CI/CD workflow ready

### Fixed
- Authentication bypass vulnerability
- Command whitelist security issues
- Login failure tracking
- Memory leak in command states
- Thread safety in caches
- Light mode card header styling

### Changed
- Default authentication to required (security improvement)
- Light theme colors to match modern design trends

## [1.0.0] - 2024-02-XX

### Added
- Initial release
- SSH tunnel web interface
- File transfer with chunked uploads
- Command console with predefined commands
- Log tailer with regex filtering
- WebSocket-based real-time monitoring
- Dark/Light theme support
