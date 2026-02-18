"""Agent Dashboard Module

Dashboard builder utilities for agent services including widget creation, layout management,
data binding, real-time updates, and dashboard export/import.
"""
import time
import uuid
import threading
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
import json


class WidgetType(str, Enum):
    """Widget types."""
    CHART = "chart"
    TABLE = "table"
    STAT = "stat"
    GAUGE = "gauge"
    TEXT = "text"
    IMAGE = "image"
    PROGRESS = "progress"
    HEATMAP = "heatmap"
    TIMELINE = "timeline"
    MAP = "map"


class ChartType(str, Enum):
    """Chart types."""
    LINE = "line"
    BAR = "bar"
    PIE = "pie"
    AREA = "area"
    SCATTER = "scatter"
    DONUT = "donut"


class RefreshStrategy(str, Enum):
    """Widget refresh strategy."""
    MANUAL = "manual"
    INTERVAL = "interval"
    REALTIME = "realtime"


@dataclass
class Widget:
    """Dashboard widget."""
    id: str
    type: WidgetType
    title: str
    position: Dict[str, int]  # x, y, w, h
    config: Dict[str, Any] = field(default_factory=dict)
    data_source: str = None
    refresh_interval: int = 0  # seconds
    refresh_strategy: RefreshStrategy = RefreshStrategy.MANUAL
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def update_config(self, config: Dict[str, Any]):
        """Update widget configuration."""
        self.config.update(config)
        self.updated_at = time.time()

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "type": self.type.value,
            "title": self.title,
            "position": self.position,
            "config": self.config,
            "data_source": self.data_source,
            "refresh_interval": self.refresh_interval,
            "refresh_strategy": self.refresh_strategy.value,
            "created_at": self.created_at,
            "updated_at": self.updated_at
        }


@dataclass
class Dashboard:
    """Dashboard container."""
    id: str
    name: str
    description: str = ""
    widgets: List[Widget] = field(default_factory=list)
    layout: Dict[str, Any] = field(default_factory=dict)
    theme: str = "light"
    variables: Dict[str, Any] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    created_by: str = "system"
    is_public: bool = False
    tags: List[str] = field(default_factory=list)

    def add_widget(self, widget: Widget):
        """Add a widget to the dashboard."""
        self.widgets.append(widget)
        self.updated_at = time.time()

    def remove_widget(self, widget_id: str) -> bool:
        """Remove a widget by ID."""
        for i, w in enumerate(self.widgets):
            if w.id == widget_id:
                self.widgets.pop(i)
                self.updated_at = time.time()
                return True
        return False

    def get_widget(self, widget_id: str) -> Optional[Widget]:
        """Get widget by ID."""
        for w in self.widgets:
            if w.id == widget_id:
                return w
        return None

    def update_layout(self, layout: Dict[str, Any]):
        """Update dashboard layout."""
        self.layout = layout
        self.updated_at = time.time()

    def to_dict(self) -> Dict:
        """Convert to dictionary."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "widgets": [w.to_dict() for w in self.widgets],
            "layout": self.layout,
            "theme": self.theme,
            "variables": self.variables,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "created_by": self.created_by,
            "is_public": self.is_public,
            "tags": self.tags,
            "widget_count": len(self.widgets)
        }


@dataclass
class DashboardStats:
    """Dashboard statistics."""
    total_dashboards: int = 0
    total_widgets: int = 0
    active_dashboards: int = 0


class AgentDashboard:
    """Dashboard builder utility for agents."""

    def __init__(self):
        self._lock = threading.RLock()
        self._dashboards: Dict[str, Dashboard] = {}
        self._data_sources: Dict[str, Callable] = {}
        self._stats = DashboardStats()
        self._default_layout = {
            "columns": 12,
            "row_height": 30,
            "margin": [10, 10],
            "container_padding": [10, 10]
        }

    def create_dashboard(
        self,
        name: str,
        description: str = "",
        theme: str = "light",
        created_by: str = "system",
        is_public: bool = False,
        tags: List[str] = None
    ) -> Dashboard:
        """Create a new dashboard."""
        with self._lock:
            dashboard_id = str(uuid.uuid4())[:8]
            dashboard = Dashboard(
                id=dashboard_id,
                name=name,
                description=description,
                theme=theme,
                created_by=created_by,
                is_public=is_public,
                tags=tags or [],
                layout=self._default_layout.copy()
            )
            self._dashboards[dashboard_id] = dashboard
            self._stats.total_dashboards += 1
            self._stats.active_dashboards += 1
            return dashboard

    def get_dashboard(self, dashboard_id: str) -> Optional[Dashboard]:
        """Get dashboard by ID."""
        with self._lock:
            return self._dashboards.get(dashboard_id)

    def update_dashboard(
        self,
        dashboard_id: str,
        name: str = None,
        description: str = None,
        theme: str = None,
        is_public: bool = None,
        tags: List[str] = None
    ) -> Optional[Dashboard]:
        """Update dashboard metadata."""
        with self._lock:
            dashboard = self._dashboards.get(dashboard_id)
            if not dashboard:
                return None

            if name is not None:
                dashboard.name = name
            if description is not None:
                dashboard.description = description
            if theme is not None:
                dashboard.theme = theme
            if is_public is not None:
                dashboard.is_public = is_public
            if tags is not None:
                dashboard.tags = tags

            dashboard.updated_at = time.time()
            return dashboard

    def delete_dashboard(self, dashboard_id: str) -> bool:
        """Delete a dashboard."""
        with self._lock:
            if dashboard_id in self._dashboards:
                del self._dashboards[dashboard_id]
                self._stats.total_dashboards -= 1
                self._stats.active_dashboards -= 1
                return True
            return False

    def list_dashboards(
        self,
        tags: List[str] = None,
        created_by: str = None,
        include_public_only: bool = False
    ) -> List[Dashboard]:
        """List dashboards with optional filters."""
        with self._lock:
            result = list(self._dashboards.values())

            if tags:
                result = [d for d in result if any(t in d.tags for t in tags)]
            if created_by:
                result = [d for d in result if d.created_by == created_by]
            if include_public_only:
                result = [d for d in result if d.is_public]

            result.sort(key=lambda d: d.updated_at, reverse=True)
            return result

    def add_widget(
        self,
        dashboard_id: str,
        widget_type: WidgetType,
        title: str,
        position: Dict[str, int] = None,
        config: Dict[str, Any] = None,
        data_source: str = None,
        refresh_interval: int = 0
    ) -> Optional[Widget]:
        """Add a widget to a dashboard."""
        with self._lock:
            dashboard = self._dashboards.get(dashboard_id)
            if not dashboard:
                return None

            widget_id = str(uuid.uuid4())[:8]
            position = position or {"x": 0, "y": 0, "w": 3, "h": 2}

            widget = Widget(
                id=widget_id,
                type=widget_type,
                title=title,
                position=position,
                config=config or {},
                data_source=data_source,
                refresh_interval=refresh_interval,
                refresh_strategy=RefreshStrategy.INTERVAL if refresh_interval > 0 else RefreshStrategy.MANUAL
            )

            dashboard.add_widget(widget)
            self._stats.total_widgets += 1

            return widget

    def update_widget(
        self,
        dashboard_id: str,
        widget_id: str,
        title: str = None,
        position: Dict[str, int] = None,
        config: Dict[str, Any] = None,
        data_source: str = None,
        refresh_interval: int = None
    ) -> Optional[Widget]:
        """Update a widget."""
        with self._lock:
            dashboard = self._dashboards.get(dashboard_id)
            if not dashboard:
                return None

            widget = dashboard.get_widget(widget_id)
            if not widget:
                return None

            if title is not None:
                widget.title = title
            if position is not None:
                widget.position = position
            if config is not None:
                widget.update_config(config)
            if data_source is not None:
                widget.data_source = data_source
            if refresh_interval is not None:
                widget.refresh_interval = refresh_interval
                widget.refresh_strategy = RefreshStrategy.INTERVAL if refresh_interval > 0 else RefreshStrategy.MANUAL

            return widget

    def remove_widget(self, dashboard_id: str, widget_id: str) -> bool:
        """Remove a widget from a dashboard."""
        with self._lock:
            dashboard = self._dashboards.get(dashboard_id)
            if not dashboard:
                return False

            result = dashboard.remove_widget(widget_id)
            if result:
                self._stats.total_widgets -= 1
            return result

    def register_data_source(self, name: str, handler: Callable):
        """Register a data source handler."""
        with self._lock:
            self._data_sources[name] = handler

    def get_widget_data(self, dashboard_id: str, widget_id: str) -> Optional[Any]:
        """Get data for a widget from its data source."""
        with self._lock:
            dashboard = self._dashboards.get(dashboard_id)
            if not dashboard:
                return None

            widget = dashboard.get_widget(widget_id)
            if not widget or not widget.data_source:
                return None

            handler = self._data_sources.get(widget.data_source)
            if handler:
                try:
                    return handler(widget)
                except Exception:
                    return None
            return None

    def export_dashboard(self, dashboard_id: str) -> Optional[str]:
        """Export dashboard as JSON."""
        dashboard = self.get_dashboard(dashboard_id)
        if dashboard:
            return json.dumps(dashboard.to_dict(), indent=2)
        return None

    def import_dashboard(self, json_str: str) -> Optional[Dashboard]:
        """Import dashboard from JSON."""
        try:
            data = json.loads(json_str)
            dashboard = self.create_dashboard(
                name=data.get("name", "Imported Dashboard"),
                description=data.get("description", ""),
                theme=data.get("theme", "light"),
                created_by=data.get("created_by", "imported"),
                tags=data.get("tags", [])
            )

            # Import layout
            if "layout" in data:
                dashboard.layout = data["layout"]

            # Import variables
            if "variables" in data:
                dashboard.variables = data["variables"]

            # Import widgets
            for widget_data in data.get("widgets", []):
                self.add_widget(
                    dashboard_id=dashboard.id,
                    widget_type=WidgetType(widget_data.get("type", "text")),
                    title=widget_data.get("title", "Widget"),
                    position=widget_data.get("position"),
                    config=widget_data.get("config", {}),
                    data_source=widget_data.get("data_source"),
                    refresh_interval=widget_data.get("refresh_interval", 0)
                )

            return dashboard
        except Exception:
            return None

    def clone_dashboard(self, dashboard_id: str, new_name: str = None) -> Optional[Dashboard]:
        """Clone a dashboard."""
        with self._lock:
            original = self._dashboards.get(dashboard_id)
            if not original:
                return None

            new_dashboard = self.create_dashboard(
                name=new_name or f"{original.name} (Copy)",
                description=original.description,
                theme=original.theme,
                created_by=original.created_by,
                tags=list(original.tags)
            )

            # Copy layout and variables
            new_dashboard.layout = dict(original.layout)
            new_dashboard.variables = dict(original.variables)

            # Copy widgets
            for widget in original.widgets:
                self.add_widget(
                    dashboard_id=new_dashboard.id,
                    widget_type=widget.type,
                    title=widget.title,
                    position=dict(widget.position),
                    config=dict(widget.config),
                    data_source=widget.data_source,
                    refresh_interval=widget.refresh_interval
                )

            return new_dashboard

    def get_stats(self) -> Dict:
        """Get dashboard statistics."""
        with self._lock:
            return {
                "total_dashboards": self._stats.total_dashboards,
                "total_widgets": self._stats.total_widgets,
                "active_dashboards": self._stats.active_dashboards,
                "registered_data_sources": len(self._data_sources)
            }


# Global dashboard instance
agent_dashboard = AgentDashboard()
