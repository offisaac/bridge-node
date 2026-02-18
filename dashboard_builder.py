"""Dashboard Builder Module

Interactive dashboard builder for data visualization.
"""
import threading
import time
import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid


class WidgetType(str, Enum):
    """Widget types."""
    CHART = "chart"
    TABLE = "table"
    METRIC = "metric"
    GAUGE = "gauge"
    TEXT = "text"
    STATUS = "status"
    LOG = "log"
    MAP = "map"


class ChartType(str, Enum):
    """Chart types."""
    LINE = "line"
    BAR = "bar"
    PIE = "pie"
    AREA = "area"
    SCATTER = "scatter"


class DataSourceType(str, Enum):
    """Data source types."""
    STATIC = "static"
    API = "api"
    METRICS = "metrics"
    LOGS = "logs"
    ALERTS = "alerts"


@dataclass
class Widget:
    """Dashboard widget."""
    id: str
    type: WidgetType
    title: str
    position_x: int
    position_y: int
    width: int
    height: int
    config: Dict = field(default_factory=dict)
    data_source: Dict = field(default_factory=dict)


@dataclass
class Dashboard:
    """Dashboard."""
    id: str
    name: str
    description: str
    widgets: List[Widget] = field(default_factory=list)
    layout: Dict = field(default_factory=dict)
    created_at: float = 0
    updated_at: float = 0
    created_by: str = ""
    tags: List[str] = field(default_factory=list)
    metadata: Dict = field(default_factory=dict)


class DashboardBuilder:
    """Interactive dashboard builder."""

    def __init__(self):
        self._lock = threading.RLock()
        self._dashboards: Dict[str, Dashboard] = {}
        self._templates: Dict[str, Dict] = {}
        self._default_layout = {
            "columns": 12,
            "row_height": 50,
            "margin": 10
        }

    def create_dashboard(
        self,
        name: str,
        description: str = "",
        created_by: str = "",
        tags: List[str] = None,
        metadata: Dict = None
    ) -> str:
        """Create a new dashboard."""
        dashboard_id = str(uuid.uuid4())[:12]

        dashboard = Dashboard(
            id=dashboard_id,
            name=name,
            description=description,
            created_at=time.time(),
            updated_at=time.time(),
            created_by=created_by,
            tags=tags or [],
            metadata=metadata or {}
        )

        with self._lock:
            self._dashboards[dashboard_id] = dashboard

        return dashboard_id

    def get_dashboard(self, dashboard_id: str) -> Optional[Dict]:
        """Get a dashboard."""
        with self._lock:
            if dashboard_id not in self._dashboards:
                return None
            return self._serialize_dashboard(self._dashboards[dashboard_id])

    def get_dashboards(
        self,
        tag: str = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get all dashboards."""
        with self._lock:
            dashboards = list(self._dashboards.values())

        if tag:
            dashboards = [d for d in dashboards if tag in d.tags]

        dashboards.sort(key=lambda x: x.updated_at, reverse=True)

        return [self._serialize_dashboard(d) for d in dashboards[:limit]]

    def update_dashboard(
        self,
        dashboard_id: str,
        name: str = None,
        description: str = None,
        tags: List[str] = None,
        metadata: Dict = None
    ) -> bool:
        """Update dashboard."""
        with self._lock:
            if dashboard_id not in self._dashboards:
                return False

            dashboard = self._dashboards[dashboard_id]

            if name:
                dashboard.name = name
            if description is not None:
                dashboard.description = description
            if tags is not None:
                dashboard.tags = tags
            if metadata:
                dashboard.metadata.update(metadata)

            dashboard.updated_at = time.time()

        return True

    def delete_dashboard(self, dashboard_id: str) -> bool:
        """Delete a dashboard."""
        with self._lock:
            if dashboard_id not in self._dashboards:
                return False
            del self._dashboards[dashboard_id]
            return True

    def add_widget(
        self,
        dashboard_id: str,
        widget_type: WidgetType,
        title: str,
        position_x: int = 0,
        position_y: int = 0,
        width: int = 4,
        height: int = 3,
        config: Dict = None,
        data_source: Dict = None
    ) -> Optional[str]:
        """Add a widget to dashboard."""
        with self._lock:
            if dashboard_id not in self._dashboards:
                return None

            widget_id = str(uuid.uuid4())[:12]

            widget = Widget(
                id=widget_id,
                type=widget_type,
                title=title,
                position_x=position_x,
                position_y=position_y,
                width=width,
                height=height,
                config=config or {},
                data_source=data_source or {}
            )

            self._dashboards[dashboard_id].widgets.append(widget)
            self._dashboards[dashboard_id].updated_at = time.time()

        return widget_id

    def update_widget(
        self,
        dashboard_id: str,
        widget_id: str,
        title: str = None,
        position_x: int = None,
        position_y: int = None,
        width: int = None,
        height: int = None,
        config: Dict = None,
        data_source: Dict = None
    ) -> bool:
        """Update a widget."""
        with self._lock:
            if dashboard_id not in self._dashboards:
                return False

            dashboard = self._dashboards[dashboard_id]

            for widget in dashboard.widgets:
                if widget.id == widget_id:
                    if title is not None:
                        widget.title = title
                    if position_x is not None:
                        widget.position_x = position_x
                    if position_y is not None:
                        widget.position_y = position_y
                    if width is not None:
                        widget.width = width
                    if height is not None:
                        widget.height = height
                    if config:
                        widget.config.update(config)
                    if data_source:
                        widget.data_source.update(data_source)

                    dashboard.updated_at = time.time()
                    return True

        return False

    def delete_widget(self, dashboard_id: str, widget_id: str) -> bool:
        """Delete a widget."""
        with self._lock:
            if dashboard_id not in self._dashboards:
                return False

            dashboard = self._dashboards[dashboard_id]
            dashboard.widgets = [w for w in dashboard.widgets if w.id != widget_id]
            dashboard.updated_at = time.time()

        return True

    def get_widget(self, dashboard_id: str, widget_id: str) -> Optional[Dict]:
        """Get a widget."""
        with self._lock:
            if dashboard_id not in self._dashboards:
                return None

            dashboard = self._dashboards[dashboard_id]

            for widget in dashboard.widgets:
                if widget.id == widget_id:
                    return self._serialize_widget(widget)

        return None

    def save_template(
        self,
        name: str,
        template: Dict
    ) -> str:
        """Save a dashboard template."""
        template_id = str(uuid.uuid4())[:12]

        with self._lock:
            self._templates[template_id] = {
                "id": template_id,
                "name": name,
                "template": template,
                "created_at": time.time()
            }

        return template_id

    def get_templates(self) -> List[Dict]:
        """Get all templates."""
        with self._lock:
            return [
                {"id": t["id"], "name": t["name"], "created_at": t["created_at"]}
                for t in self._templates.values()
            ]

    def get_template(self, template_id: str) -> Optional[Dict]:
        """Get a template."""
        with self._lock:
            if template_id not in self._templates:
                return None
            return self._templates[template_id]["template"]

    def apply_template(
        self,
        dashboard_id: str,
        template_id: str
    ) -> bool:
        """Apply a template to a dashboard."""
        template = self.get_template(template_id)
        if not template:
            return False

        with self._lock:
            if dashboard_id not in self._dashboards:
                return False

            dashboard = self._dashboards[dashboard_id]

            # Apply template widgets
            for tw in template.get("widgets", []):
                widget = Widget(
                    id=str(uuid.uuid4())[:12],
                    type=WidgetType(tw.get("type", "metric")),
                    title=tw.get("title", ""),
                    position_x=tw.get("x", 0),
                    position_y=tw.get("y", 0),
                    width=tw.get("width", 4),
                    height=tw.get("height", 3),
                    config=tw.get("config", {}),
                    data_source=tw.get("data_source", {})
                )
                dashboard.widgets.append(widget)

            dashboard.updated_at = time.time()

        return True

    def clone_dashboard(
        self,
        dashboard_id: str,
        new_name: str,
        created_by: str = ""
    ) -> Optional[str]:
        """Clone a dashboard."""
        dashboard = self.get_dashboard(dashboard_id)
        if not dashboard:
            return None

        new_id = self.create_dashboard(
            name=new_name,
            description=dashboard.get("description", ""),
            created_by=created_by,
            tags=dashboard.get("tags", [])
        )

        # Copy widgets
        for widget in dashboard.get("widgets", []):
            self.add_widget(
                dashboard_id=new_id,
                widget_type=WidgetType(widget["type"]),
                title=widget["title"],
                position_x=widget.get("position_x", 0),
                position_y=widget.get("position_y", 0),
                width=widget.get("width", 4),
                height=widget.get("height", 3),
                config=widget.get("config", {}),
                data_source=widget.get("data_source", {})
            )

        return new_id

    def export_dashboard(self, dashboard_id: str) -> Optional[str]:
        """Export dashboard as JSON."""
        dashboard = self.get_dashboard(dashboard_id)
        if not dashboard:
            return None
        return json.dumps(dashboard, indent=2)

    def import_dashboard(self, json_str: str) -> Optional[str]:
        """Import dashboard from JSON."""
        try:
            data = json.loads(json_str)
        except json.JSONDecodeError:
            return None

        dashboard_id = self.create_dashboard(
            name=data.get("name", "Imported Dashboard"),
            description=data.get("description", ""),
            created_by=data.get("created_by", ""),
            tags=data.get("tags", [])
        )

        # Import widgets
        for widget in data.get("widgets", []):
            self.add_widget(
                dashboard_id=dashboard_id,
                widget_type=WidgetType(widget.get("type", "metric")),
                title=widget.get("title", ""),
                position_x=widget.get("position_x", 0),
                position_y=widget.get("position_y", 0),
                width=widget.get("width", 4),
                height=widget.get("height", 3),
                config=widget.get("config", {}),
                data_source=widget.get("data_source", {})
            )

        return dashboard_id

    def _serialize_dashboard(self, dashboard: Dashboard) -> Dict:
        """Serialize a dashboard."""
        return {
            "id": dashboard.id,
            "name": dashboard.name,
            "description": dashboard.description,
            "widgets": [self._serialize_widget(w) for w in dashboard.widgets],
            "layout": dashboard.layout,
            "created_at": dashboard.created_at,
            "updated_at": dashboard.updated_at,
            "created_by": dashboard.created_by,
            "tags": dashboard.tags,
            "metadata": dashboard.metadata
        }

    def _serialize_widget(self, widget: Widget) -> Dict:
        """Serialize a widget."""
        return {
            "id": widget.id,
            "type": widget.type.value,
            "title": widget.title,
            "position_x": widget.position_x,
            "position_y": widget.position_y,
            "width": widget.width,
            "height": widget.height,
            "config": widget.config,
            "data_source": widget.data_source
        }


# Global dashboard builder
dashboard_builder = DashboardBuilder()


# Initialize with sample dashboards
def init_sample_dashboards():
    """Initialize sample dashboards."""
    # Create main dashboard
    dashboard_id = dashboard_builder.create_dashboard(
        name="System Overview",
        description="Main system monitoring dashboard",
        tags=["system", "monitoring"]
    )

    # Add widgets
    dashboard_builder.add_widget(
        dashboard_id=dashboard_id,
        widget_type=WidgetType.METRIC,
        title="CPU Usage",
        position_x=0,
        position_y=0,
        width=3,
        height=2,
        config={"unit": "%", "color": "#3498db"},
        data_source={"type": "metrics", "metric": "cpu"}
    )

    dashboard_builder.add_widget(
        dashboard_id=dashboard_id,
        widget_type=WidgetType.METRIC,
        title="Memory Usage",
        position_x=3,
        position_y=0,
        width=3,
        height=2,
        config={"unit": "%", "color": "#9b59b6"},
        data_source={"type": "metrics", "metric": "memory"}
    )

    dashboard_builder.add_widget(
        dashboard_id=dashboard_id,
        widget_type=WidgetType.CHART,
        title="Request Rate",
        position_x=0,
        position_y=2,
        width=6,
        height=4,
        config={"chart_type": "line", "time_range": "1h"},
        data_source={"type": "metrics", "metric": "requests"}
    )

    dashboard_builder.add_widget(
        dashboard_id=dashboard_id,
        widget_type=WidgetType.STATUS,
        title="Active Alerts",
        position_x=6,
        position_y=2,
        width=6,
        height=4,
        config={"severity_filter": ["critical", "high"]},
        data_source={"type": "alerts"}
    )


init_sample_dashboards()
