"""Event Store Module

Event sourcing event storage.
"""
import threading
import json
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid


class EventType(str, Enum):
    """Event types."""
    COMMAND = "command"
    EVENT = "event"
    STATE_CHANGE = "state_change"
    ACTION = "action"
    ERROR = "error"


@dataclass
class Event:
    """Event for event sourcing."""
    id: str
    aggregate_id: str
    aggregate_type: str
    type: EventType
    data: Dict
    metadata: Dict = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    version: int = 1


@dataclass
class Aggregate:
    """Aggregate root."""
    id: str
    type: str
    version: int = 0
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())


class EventStore:
    """Event sourcing event store."""

    def __init__(self, max_events: int = 100000):
        self.max_events = max_events
        self._lock = threading.RLock()
        self._events: List[Event] = []
        self._aggregates: Dict[str, Aggregate] = {}

    def append_event(
        self,
        aggregate_id: str,
        aggregate_type: str,
        event_type: EventType,
        data: Dict,
        metadata: Dict = None
    ) -> str:
        """Append an event to the store."""
        event_id = str(uuid.uuid4())[:8]

        # Get aggregate version
        aggregate_key = f"{aggregate_type}:{aggregate_id}"
        version = 1
        if aggregate_key in self._aggregates:
            version = self._aggregates[aggregate_key].version + 1

        event = Event(
            id=event_id,
            aggregate_id=aggregate_id,
            aggregate_type=aggregate_type,
            type=event_type,
            data=data,
            metadata=metadata or {},
            version=version
        )

        with self._lock:
            self._events.append(event)

            # Trim events
            if len(self._events) > self.max_events:
                self._events = self._events[-self.max_events:]

            # Update aggregate
            self._aggregates[aggregate_key] = Aggregate(
                id=aggregate_id,
                type=aggregate_type,
                version=version,
                updated_at=datetime.now().isoformat()
            )

        return event_id

    def get_event(self, event_id: str) -> Optional[Dict]:
        """Get event by ID."""
        with self._lock:
            event = next((e for e in self._events if e.id == event_id), None)
            if not event:
                return None

            return {
                "id": event.id,
                "aggregate_id": event.aggregate_id,
                "aggregate_type": event.aggregate_type,
                "type": event.type.value,
                "data": event.data,
                "metadata": event.metadata,
                "timestamp": event.timestamp,
                "version": event.version
            }

    def get_events_for_aggregate(
        self,
        aggregate_id: str,
        aggregate_type: str = None,
        from_version: int = None
    ) -> List[Dict]:
        """Get events for an aggregate."""
        with self._lock:
            events = [
                e for e in self._events
                if e.aggregate_id == aggregate_id
            ]

            if aggregate_type:
                events = [e for e in events if e.aggregate_type == aggregate_type]

            if from_version:
                events = [e for e in events if e.version > from_version]

            events = sorted(events, key=lambda x: x.version)

            return [
                {
                    "id": e.id,
                    "aggregate_id": e.aggregate_id,
                    "aggregate_type": e.aggregate_type,
                    "type": e.type.value,
                    "data": e.data,
                    "metadata": e.metadata,
                    "timestamp": e.timestamp,
                    "version": e.version
                }
                for e in events
            ]

    def get_all_events(
        self,
        event_type: EventType = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """Get all events with filters."""
        with self._lock:
            events = self._events.copy()

        if event_type:
            events = [e for e in events if e.type == event_type]

        events = sorted(events, key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "id": e.id,
                "aggregate_id": e.aggregate_id,
                "aggregate_type": e.aggregate_type,
                "type": e.type.value,
                "data": e.data,
                "timestamp": e.timestamp,
                "version": e.version
            }
            for e in events[offset:offset+limit]
        ]

    def get_aggregate(self, aggregate_id: str, aggregate_type: str) -> Optional[Dict]:
        """Get aggregate state by replaying events."""
        events = self.get_events_for_aggregate(aggregate_id, aggregate_type)

        if not events:
            return None

        # Replay events to build state
        state = {}
        for event in events:
            # Apply event data to state
            state.update(event["data"])

        return {
            "id": aggregate_id,
            "type": aggregate_type,
            "version": len(events),
            "state": state,
            "events_count": len(events)
        }

    def get_stats(self) -> Dict:
        """Get event store statistics."""
        with self._lock:
            total = len(self._events)
            by_type = {}
            by_aggregate = {}

            for event in self._events:
                type_key = event.type.value
                agg_key = event.aggregate_type

                by_type[type_key] = by_type.get(type_key, 0) + 1
                by_aggregate[agg_key] = by_aggregate.get(agg_key, 0) + 1

            return {
                "total_events": total,
                "by_type": by_type,
                "by_aggregate": by_aggregate,
                "aggregates": len(self._aggregates)
            }

    def clear(self, before: str = None):
        """Clear events."""
        with self._lock:
            if before:
                self._events = [
                    e for e in self._events
                    if e.timestamp > before
                ]
            else:
                self._events.clear()
                self._aggregates.clear()


# Global event store
event_store = EventStore()
