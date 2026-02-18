"""Audit Trail Viewer Module

Web UI data provider for viewing audit logs and tracing.
"""
import threading
import time
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import defaultdict


@dataclass
class AuditEntry:
    """Audit log entry."""
    id: str
    timestamp: str
    event_type: str
    user: str
    action: str
    resource: str
    status: str
    ip_address: str = ""
    metadata: Dict = field(default_factory=dict)


class AuditTrailViewer:
    """Audit trail viewer data provider."""

    def __init__(self):
        self._lock = threading.RLock()
        self._entries: List[AuditEntry] = []
        self._max_entries = 10000

    def add_entry(self, entry: AuditEntry):
        """Add an audit entry."""
        with self._lock:
            self._entries.append(entry)
            if len(self._entries) > self._max_entries:
                self._entries = self._entries[-self._max_entries:]

    def get_entries(
        self,
        event_type: str = None,
        user: str = None,
        action: str = None,
        start_time: str = None,
        end_time: str = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get audit entries with filters."""
        with self._lock:
            entries = self._entries.copy()

        if event_type:
            entries = [e for e in entries if e.event_type == event_type]
        if user:
            entries = [e for e in entries if e.user == user]
        if action:
            entries = [e for e in entries if action.lower() in e.action.lower()]

        if start_time:
            entries = [e for e in entries if e.timestamp >= start_time]
        if end_time:
            entries = [e for e in entries if e.timestamp <= end_time]

        entries = sorted(entries, key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "id": e.id,
                "timestamp": e.timestamp,
                "event_type": e.event_type,
                "user": e.user,
                "action": e.action,
                "resource": e.resource,
                "status": e.status,
                "ip_address": e.ip_address,
                "metadata": e.metadata
            }
            for e in entries[:limit]
        ]

    def get_timeline(
        self,
        start_time: str = None,
        interval: str = "hour"
    ) -> List[Dict]:
        """Get timeline data for visualization."""
        with self._lock:
            entries = self._entries.copy()

        if start_time:
            entries = [e for e in entries if e.timestamp >= start_time]

        # Group by time interval
        grouped = defaultdict(lambda: {"count": 0, "success": 0, "failed": 0})

        for entry in entries:
            ts = datetime.fromisoformat(entry.timestamp)
            if interval == "hour":
                key = ts.strftime("%Y-%m-%d %H:00")
            elif interval == "day":
                key = ts.strftime("%Y-%m-%d")
            else:
                key = ts.strftime("%Y-%m-%d %H:%M")

            grouped[key]["count"] += 1
            if entry.status == "success":
                grouped[key]["success"] += 1
            else:
                grouped[key]["failed"] += 1

        return [
            {"timestamp": k, "count": v["count"], "success": v["success"], "failed": v["failed"]}
            for k, v in sorted(grouped.items())
        ]

    def get_stats(self) -> Dict:
        """Get audit statistics."""
        with self._lock:
            total = len(self._entries)
            by_type = defaultdict(int)
            by_user = defaultdict(int)
            by_action = defaultdict(int)
            by_status = defaultdict(int)

            for entry in self._entries:
                by_type[entry.event_type] += 1
                by_user[entry.user] += 1
                by_action[entry.action] += 1
                by_status[entry.status] += 1

            # Recent activity (last hour)
            recent = [
                e for e in self._entries
                if datetime.fromisoformat(e.timestamp) > datetime.now() - timedelta(hours=1)
            ]

            return {
                "total_entries": total,
                "by_type": dict(by_type),
                "by_user": dict(by_user),
                "by_action": dict(by_action),
                "by_status": dict(by_status),
                "last_hour_count": len(recent)
            }

    def get_user_activity(self, user: str = None, limit: int = 10) -> List[Dict]:
        """Get user activity summary."""
        with self._lock:
            user_counts = defaultdict(lambda: {"actions": 0, "failed": 0, "last_action": ""})

            for entry in self._entries:
                user_counts[entry.user]["actions"] += 1
                if entry.status != "success":
                    user_counts[entry.user]["failed"] += 1
                if not user_counts[entry.user]["last_action"] or entry.timestamp > user_counts[entry.user]["last_action"]:
                    user_counts[entry.user]["last_action"] = entry.timestamp

            results = [
                {
                    "user": user,
                    "actions": data["actions"],
                    "failed": data["failed"],
                    "success_rate": (data["actions"] - data["failed"]) / data["actions"] if data["actions"] > 0 else 0,
                    "last_action": data["last_action"]
                }
                for user, data in user_counts.items()
            ]

            return sorted(results, key=lambda x: x["actions"], reverse=True)[:limit]

    def generate_html_dashboard(self) -> str:
        """Generate HTML dashboard for audit trail viewer."""
        stats = self.get_stats()
        entries = self.get_entries(limit=50)
        timeline = self.get_timeline(interval="hour")

        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Audit Trail Viewer</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }}
        h1 {{ color: #333; }}
        .stats {{ display: flex; gap: 20px; margin-bottom: 20px; }}
        .stat-card {{ background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }}
        .stat-card h3 {{ margin: 0 0 10px 0; color: #666; }}
        .stat-card .value {{ font-size: 24px; font-weight: bold; color: #333; }}
        table {{ width: 100%; border-collapse: collapse; background: white; }}
        th, td {{ padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }}
        th {{ background: #f8f8f8; }}
        .status-success {{ color: green; }}
        .status-failed {{ color: red; }}
        .filter-bar {{ margin-bottom: 20px; }}
        .filter-bar input, .filter-bar select {{ padding: 8px; margin-right: 10px; }}
    </style>
</head>
<body>
    <h1>Audit Trail Viewer</h1>

    <div class="stats">
        <div class="stat-card">
            <h3>Total Entries</h3>
            <div class="value">{stats['total_entries']}</div>
        </div>
        <div class="stat-card">
            <h3>Last Hour</h3>
            <div class="value">{stats['last_hour_count']}</div>
        </div>
        <div class="stat-card">
            <h3>Event Types</h3>
            <div class="value">{len(stats['by_type'])}</div>
        </div>
        <div class="stat-card">
            <h3>Active Users</h3>
            <div class="value">{len(stats['by_user'])}</div>
        </div>
    </div>

    <div class="filter-bar">
        <input type="text" id="searchInput" placeholder="Search..." onkeyup="filterTable()">
        <select id="statusFilter" onchange="filterTable()">
            <option value="">All Status</option>
            <option value="success">Success</option>
            <option value="failed">Failed</option>
        </select>
    </div>

    <table id="auditTable">
        <thead>
            <tr>
                <th>Timestamp</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Status</th>
                <th>IP Address</th>
            </tr>
        </thead>
        <tbody>
"""

        for entry in entries:
            status_class = "status-success" if entry["status"] == "success" else "status-failed"
            html += f"""
            <tr>
                <td>{entry['timestamp']}</td>
                <td>{entry['user']}</td>
                <td>{entry['action']}</td>
                <td>{entry['resource']}</td>
                <td class="{status_class}">{entry['status']}</td>
                <td>{entry['ip_address']}</td>
            </tr>
"""

        html += """
        </tbody>
    </table>

    <script>
        function filterTable() {
            const input = document.getElementById('searchInput');
            const filter = input.value.toLowerCase();
            const statusFilter = document.getElementById('statusFilter').value;
            const table = document.getElementById('auditTable');
            const rows = table.getElementsByTagName('tr');

            for (let i = 1; i < rows.length; i++) {
                const cells = rows[i].getElementsByTagName('td');
                let show = true;

                if (filter) {
                    show = false;
                    for (let j = 0; j < cells.length; j++) {
                        if (cells[j].textContent.toLowerCase().indexOf(filter) > -1) {
                            show = true;
                            break;
                        }
                    }
                }

                if (statusFilter && show) {
                    const statusCell = cells[4];
                    if (!statusCell.textContent.toLowerCase().includes(statusFilter)) {
                        show = false;
                    }
                }

                rows[i].style.display = show ? '' : 'none';
            }
        }
    </script>
</body>
</html>"""

        return html


# Global audit trail viewer
audit_trail_viewer = AuditTrailViewer()
