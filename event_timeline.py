"""Event Timeline Module

Visual event timeline for tracking and analyzing events over time with filtering and aggregation.
"""
import threading
import time
import uuid
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import json


class EventType(str, Enum):
    """Event types."""
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    SUCCESS = "success"
    CRITICAL = "critical"
    DEPLOYMENT = "deployment"
    SCALING = "scaling"
    FAILURE = "failure"
    RECOVERY = "recovery"
    CUSTOM = "custom"


class TimeGranularity(str, Enum):
    """Time granularity for aggregation."""
    SECOND = "second"
    MINUTE = "minute"
    HOUR = "hour"
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


@dataclass
class TimelineEvent:
    """Single timeline event."""
    id: str
    title: str
    description: str
    event_type: EventType
    timestamp: float
    source: str
    metadata: Dict = field(default_factory=dict)
    duration: Optional[float] = None
    parent_id: Optional[str] = None
    tags: List[str] = field(default_factory=list)


@dataclass
class TimelineSegment:
    """A segment of events within a time range."""
    start_time: float
    end_time: float
    events: List[TimelineEvent]
    event_count: int = 0


@dataclass
class TimelineReport:
    """Complete timeline analysis report."""
    id: str
    name: str
    start_time: float
    end_time: float
    total_events: int
    events_by_type: Dict[str, int]
    events_by_source: Dict[str, int]
    segments: List[TimelineSegment]
    annotations: List[Dict] = field(default_factory=list)


class EventTimeline:
    """Event timeline tracker and analyzer."""

    def __init__(self):
        self._lock = threading.RLock()
        self._events: Dict[str, TimelineEvent] = {}
        self._reports: Dict[str, TimelineReport] = {}
        self._max_events = 100000

    def add_event(
        self,
        title: str,
        description: str,
        event_type: EventType = EventType.INFO,
        source: str = "system",
        metadata: Dict = None,
        duration: Optional[float] = None,
        parent_id: Optional[str] = None,
        tags: List[str] = None,
        timestamp: float = None
    ) -> str:
        """Add an event to the timeline."""
        event_id = str(uuid.uuid4())[:12]

        event = TimelineEvent(
            id=event_id,
            title=title,
            description=description,
            event_type=event_type,
            timestamp=timestamp or time.time(),
            source=source,
            metadata=metadata or {},
            duration=duration,
            parent_id=parent_id,
            tags=tags or []
        )

        with self._lock:
            self._events[event_id] = event

            # Trim old events if needed
            if len(self._events) > self._max_events:
                sorted_events = sorted(self._events.items(), key=lambda x: x[1].timestamp)
                self._events = dict(sorted_events[-self._max_events:])

        return event_id

    def add_events_batch(self, events: List[Dict]) -> List[str]:
        """Add multiple events at once."""
        event_ids = []

        for event_data in events:
            event_id = self.add_event(
                title=event_data.get("title", ""),
                description=event_data.get("description", ""),
                event_type=EventType(event_data.get("event_type", "info")),
                source=event_data.get("source", "system"),
                metadata=event_data.get("metadata", {}),
                duration=event_data.get("duration"),
                parent_id=event_data.get("parent_id"),
                tags=event_data.get("tags", []),
                timestamp=event_data.get("timestamp")
            )
            event_ids.append(event_id)

        return event_ids

    def get_event(self, event_id: str) -> Optional[TimelineEvent]:
        """Get a specific event."""
        with self._lock:
            return self._events.get(event_id)

    def get_events(
        self,
        event_type: EventType = None,
        source: str = None,
        start_time: float = None,
        end_time: float = None,
        tags: List[str] = None,
        limit: int = 1000,
        offset: int = 0
    ) -> List[TimelineEvent]:
        """Get events with filters."""
        with self._lock:
            events = list(self._events.values())

        # Apply filters
        if event_type:
            events = [e for e in events if e.event_type == event_type]

        if source:
            events = [e for e in events if e.source == source]

        if start_time:
            events = [e for e in events if e.timestamp >= start_time]

        if end_time:
            events = [e for e in events if e.timestamp <= end_time]

        if tags:
            events = [e for e in events if any(t in e.tags for t in tags)]

        # Sort by timestamp
        events.sort(key=lambda x: x.timestamp, reverse=True)

        return events[offset:offset + limit]

    def get_timeline(
        self,
        start_time: float = None,
        end_time: float = None,
        granularity: TimeGranularity = TimeGranularity.MINUTE
    ) -> List[Dict]:
        """Get timeline data with specified granularity."""
        events = self.get_events(start_time=start_time, end_time=end_time, limit=10000)

        # Group events by time bucket
        timeline = {}
        bucket_seconds = {
            TimeGranularity.SECOND: 1,
            TimeGranularity.MINUTE: 60,
            TimeGranularity.HOUR: 3600,
            TimeGranularity.DAY: 86400,
            TimeGranularity.WEEK: 604800,
            TimeGranularity.MONTH: 2592000
        }

        bucket_size = bucket_seconds.get(granularity, 60)

        for event in events:
            bucket = int(event.timestamp / bucket_size) * bucket_size
            if bucket not in timeline:
                timeline[bucket] = {
                    "time": bucket,
                    "events": [],
                    "count": 0,
                    "types": {}
                }

            timeline[bucket]["events"].append({
                "id": event.id,
                "title": event.title,
                "type": event.event_type.value,
                "source": event.source
            })
            timeline[bucket]["count"] += 1

            type_key = event.event_type.value
            timeline[bucket]["types"][type_key] = timeline[bucket]["types"].get(type_key, 0) + 1

        return list(timeline.values())

    def get_statistics(
        self,
        start_time: float = None,
        end_time: float = None
    ) -> Dict:
        """Get timeline statistics."""
        events = self.get_events(start_time=start_time, end_time=end_time, limit=100000)

        events_by_type = {}
        events_by_source = {}
        total_duration = 0
        event_with_duration = 0

        for event in events:
            # By type
            type_key = event.event_type.value
            events_by_type[type_key] = events_by_type.get(type_key, 0) + 1

            # By source
            events_by_source[event.source] = events_by_source.get(event.source, 0) + 1

            # Duration
            if event.duration:
                total_duration += event.duration
                event_with_duration += 1

        return {
            "total_events": len(events),
            "events_by_type": events_by_type,
            "events_by_source": events_by_source,
            "avg_duration": total_duration / event_with_duration if event_with_duration > 0 else 0,
            "time_range": {
                "start": min(e.timestamp for e in events) if events else None,
                "end": max(e.timestamp for e in events) if events else None
            }
        }

    def create_report(
        self,
        name: str,
        start_time: float,
        end_time: float,
        granularity: TimeGranularity = TimeGranularity.HOUR
    ) -> TimelineReport:
        """Create a timeline analysis report."""
        import uuid

        report_id = str(uuid.uuid4())[:12]
        events = self.get_events(start_time=start_time, end_time=end_time, limit=100000)

        # Calculate stats
        events_by_type = {}
        events_by_source = {}

        for event in events:
            events_by_type[event.event_type.value] = events_by_type.get(event.event_type.value, 0) + 1
            events_by_source[event.source] = events_by_source.get(event.source, 0) + 1

        # Create segments
        segments = self._create_segments(events, granularity)

        report = TimelineReport(
            id=report_id,
            name=name,
            start_time=start_time,
            end_time=end_time,
            total_events=len(events),
            events_by_type=events_by_type,
            events_by_source=events_by_source,
            segments=segments
        )

        with self._lock:
            self._reports[report_id] = report

        return report

    def _create_segments(
        self,
        events: List[TimelineEvent],
        granularity: TimeGranularity
    ) -> List[TimelineSegment]:
        """Create timeline segments."""
        if not events:
            return []

        bucket_seconds = {
            TimeGranularity.SECOND: 1,
            TimeGranularity.MINUTE: 60,
            TimeGranularity.HOUR: 3600,
            TimeGranularity.DAY: 86400,
            TimeGranularity.WEEK: 604800,
            TimeGranularity.MONTH: 2592000
        }

        bucket_size = bucket_seconds.get(granularity, 3600)

        buckets: Dict[int, List[TimelineEvent]] = {}

        for event in events:
            bucket = int(event.timestamp / bucket_size) * bucket_size
            if bucket not in buckets:
                buckets[bucket] = []
            buckets[bucket].append(event)

        segments = []
        for bucket_time in sorted(buckets.keys()):
            segment_events = buckets[bucket_time]
            segments.append(TimelineSegment(
                start_time=bucket_time,
                end_time=bucket_time + bucket_size,
                events=segment_events,
                event_count=len(segment_events)
            ))

        return segments

    def get_report(self, report_id: str) -> Optional[TimelineReport]:
        """Get a timeline report."""
        with self._lock:
            return self._reports.get(report_id)

    def get_reports(self, limit: int = 50) -> List[Dict]:
        """Get recent timeline reports."""
        with self._lock:
            reports = sorted(
                self._reports.values(),
                key=lambda x: x.start_time,
                reverse=True
            )

        return [
            {
                "id": r.id,
                "name": r.name,
                "start_time": r.start_time,
                "end_time": r.end_time,
                "total_events": r.total_events,
                "events_by_type": r.events_by_type
            }
            for r in reports[:limit]
        ]

    def add_annotation(
        self,
        report_id: str,
        title: str,
        description: str,
        timestamp: float = None,
        color: str = "#ff0000"
    ) -> Optional[str]:
        """Add annotation to a report."""
        with self._lock:
            report = self._reports.get(report_id)
            if not report:
                return None

            annotation_id = str(uuid.uuid4())[:12]
            report.annotations.append({
                "id": annotation_id,
                "title": title,
                "description": description,
                "timestamp": timestamp or time.time(),
                "color": color
            })

            return annotation_id

    def delete_event(self, event_id: str) -> bool:
        """Delete an event."""
        with self._lock:
            if event_id in self._events:
                del self._events[event_id]
                return True
        return False

    def clear_events(
        self,
        start_time: float = None,
        end_time: float = None,
        event_type: EventType = None
    ) -> int:
        """Clear events matching filters."""
        with self._lock:
            events_to_delete = []

            for event_id, event in self._events.items():
                should_delete = True

                if start_time and event.timestamp < start_time:
                    should_delete = False
                if end_time and event.timestamp > end_time:
                    should_delete = False
                if event_type and event.event_type != event_type:
                    should_delete = False

                if should_delete:
                    events_to_delete.append(event_id)

            for event_id in events_to_delete:
                del self._events[event_id]

            return len(events_to_delete)

    def get_html_timeline(
        self,
        start_time: float = None,
        end_time: float = None,
        title: str = "Event Timeline"
    ) -> str:
        """Generate HTML timeline visualization."""
        events = self.get_events(start_time=start_time, end_time=end_time, limit=500)

        event_rows = ""
        for event in events:
            color_map = {
                EventType.INFO: "#3b82f6",
                EventType.WARNING: "#f59e0b",
                EventType.ERROR: "#ef4444",
                EventType.SUCCESS: "#22c55e",
                EventType.CRITICAL: "#dc2626",
                EventType.DEPLOYMENT: "#8b5cf6",
                EventType.SCALING: "#06b6d4",
                EventType.FAILURE: "#f43f5e",
                EventType.RECOVERY: "#10b981",
                EventType.CUSTOM: "#6b7280"
            }
            color = color_map.get(event.event_type, "#6b7280")

            event_rows += f"""
            <div class="event" style="border-left: 4px solid {color};">
                <div class="event-time">{datetime.fromtimestamp(event.timestamp).strftime('%Y-%m-%d %H:%M:%S')}</div>
                <div class="event-title">{event.title}</div>
                <div class="event-desc">{event.description}</div>
                <div class="event-meta">
                    <span class="event-type" style="background:{color}">{event.event_type.value}</span>
                    <span class="event-source">{event.source}</span>
                </div>
            </div>
            """

        return f"""<!DOCTYPE html>
<html>
<head>
    <title>{title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f9fafb; }}
        .container {{ max-width: 1200px; margin: 0 auto; }}
        .header {{ background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        h1 {{ margin: 0 0 10px 0; color: #111827; }}
        .stats {{ display: flex; gap: 20px; color: #6b7280; }}
        .timeline {{ background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }}
        .event {{ padding: 15px 20px; border-bottom: 1px solid #e5e7eb; }}
        .event:last-child {{ border-bottom: none; }}
        .event-time {{ color: #6b7280; font-size: 12px; margin-bottom: 4px; }}
        .event-title {{ font-weight: 600; color: #111827; margin-bottom: 4px; }}
        .event-desc {{ color: #4b5563; font-size: 14px; margin-bottom: 8px; }}
        .event-meta {{ display: flex; gap: 10px; }}
        .event-type {{ padding: 2px 8px; border-radius: 4px; font-size: 12px; color: white; }}
        .event-source {{ color: #9ca3af; font-size: 12px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>{title}</h1>
            <div class="stats">
                <span>Total Events: {len(events)}</span>
            </div>
        </div>
        <div class="timeline">
            {event_rows}
        </div>
    </div>
</body>
</html>"""


# Global event timeline instance
event_timeline = EventTimeline()
