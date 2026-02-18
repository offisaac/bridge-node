"""Tests for websocket module"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestConnectionManager:
    """Test ConnectionManager class."""

    def setup_method(self):
        """Create fresh manager for each test."""
        from websocket_manager import ConnectionManager
        self.manager = ConnectionManager()

    def test_init(self):
        """Test manager initialization."""
        assert self.manager.active_connections is not None
        assert len(self.manager.active_connections) == 0

    def test_disconnect_empty(self):
        """Test disconnect with no connections."""
        mock_ws = MagicMock()
        # Should not raise
        self.manager.disconnect(mock_ws)

    @pytest.mark.asyncio
    async def test_connect(self):
        """Test connecting a WebSocket."""
        mock_websocket = AsyncMock()
        await self.manager.connect(mock_websocket)
        mock_websocket.accept.assert_called_once()
        assert mock_websocket in self.manager.active_connections

    @pytest.mark.asyncio
    async def test_disconnect(self):
        """Test disconnecting a WebSocket."""
        mock_websocket = AsyncMock()
        await self.manager.connect(mock_websocket)
        assert mock_websocket in self.manager.active_connections

        self.manager.disconnect(mock_websocket)
        assert mock_websocket not in self.manager.active_connections

    @pytest.mark.asyncio
    async def test_send_personal_message(self):
        """Test sending personal message."""
        mock_websocket = AsyncMock()
        message = {"type": "test", "data": "hello"}

        await self.manager.send_personal_message(message, mock_websocket)
        mock_websocket.send_json.assert_called_once_with(message)

    @pytest.mark.asyncio
    async def test_send_personal_message_disconnect_on_error(self):
        """Test sending message disconnects on error."""
        mock_websocket = AsyncMock()
        mock_websocket.send_json.side_effect = Exception("Send failed")

        message = {"type": "test"}
        await self.manager.send_personal_message(message, mock_websocket)
        # Should have disconnected
        assert mock_websocket not in self.manager.active_connections

    @pytest.mark.asyncio
    async def test_broadcast_empty(self):
        """Test broadcasting to empty connections."""
        message = {"type": "broadcast"}
        # Should not raise
        await self.manager.broadcast(message)

    @pytest.mark.asyncio
    async def test_broadcast_multiple(self):
        """Test broadcasting to multiple connections."""
        # Create mock connections
        mock_ws1 = AsyncMock()
        mock_ws2 = AsyncMock()

        # Manually add to connections (can't use connect as it's async)
        self.manager.active_connections.add(mock_ws1)
        self.manager.active_connections.add(mock_ws2)

        message = {"type": "broadcast", "data": "test"}
        await self.manager.broadcast(message)

        mock_ws1.send_json.assert_called_once_with(message)
        mock_ws2.send_json.assert_called_once_with(message)

    @pytest.mark.asyncio
    async def test_broadcast_removes_disconnected(self):
        """Test broadcast removes disconnected clients."""
        mock_ws1 = AsyncMock()
        mock_ws2 = AsyncMock()

        # Make one fail
        mock_ws1.send_json.side_effect = Exception("Connection lost")

        self.manager.active_connections.add(mock_ws1)
        self.manager.active_connections.add(mock_ws2)

        message = {"type": "broadcast"}
        await self.manager.broadcast(message)

        # Should have removed the failed connection
        assert mock_ws1 not in self.manager.active_connections
        # Should still have the working one
        assert mock_ws2 in self.manager.active_connections

    @pytest.mark.asyncio
    async def test_send_ping(self):
        """Test sending ping."""
        mock_ws = AsyncMock()
        self.manager.active_connections.add(mock_ws)

        await self.manager.send_ping()

        mock_ws.send_json.assert_called_once()
        call_args = mock_ws.send_json.call_args[0][0]
        assert call_args["type"] == "ping"
        assert "timestamp" in call_args
