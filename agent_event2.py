"""Agent Event Module

Advanced agent event handling system with event bus, pub/sub, event routing,
filtering, transformation, persistence, and replay capabilities.
"""
import time
import threading
import uuid
import json
from typing import Dict, List, Optional, Any, Callable, Set
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from collections import defaultdict
from queue import Queue, PriorityQueue
import asyncio


class EventPriority(str, Enum):
    """Event priority levels."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class EventState(str, Enum):
    """Event states."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"
    CANCELLED = "cancelled"


class EventType(str, Enum):
    """Event types."""
    SYNC = "sync"
    ASYNC = "async"
    BROADCAST = "broadcast"
    ROUTED = "routed"
    SCHEDULED = "scheduled"


@dataclass
class EventFilter:
    """Event filter configuration."""
    source: str = None
    event_type: str = None
    priority: EventPriority = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    custom_filter: Callable = None


@dataclass
class Event:
    """Event definition."""
    id: str
    name: str
    data: Any
    source: str
    event_type: EventType = EventType.SYNC
    priority: EventPriority = EventPriority.NORMAL
    timestamp: float = field(default_factory=time.time)
    expiry: float = 0
    correlation_id: str = None
    causation_id: str = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    state: EventState = EventState.PENDING
    retries: int = 0


@dataclass
class EventHandler:
    """Event handler definition."""
    id: str
    name: str
    handler: Callable
    event_names: List[str]
    filter: EventFilter = None
    priority: int = 0
    async_handler: bool = False
    timeout: float = 30.0
    retry_count: int = 0


@dataclass
class EventSubscription:
    """Event subscription."""
    id: str
    subscriber_id: str
    event_names: List[str]
    callback: Callable
    filter: EventFilter = None
    active: bool = True


@dataclass
class EventRoute:
    """Event route definition."""
    id: str
    source_event: str
    target_event: str
    transformer: Callable = None
    filter: EventFilter = None
    enabled: bool = True


@dataclass
class EventStats:
    """Event statistics."""
    total_events: int = 0
    processed_events: int = 0
    failed_events: int = 0
    expired_events: int = 0
    handlers_triggered: int = 0
    avg_processing_time_ms: float = 0


class AgentEventBus:
    """Central event bus for agent events."""

    def __init__(self):
        self._lock = threading.RLock()
        self._handlers: Dict[str, List[EventHandler]] = defaultdict(list)
        self._subscriptions: Dict[str, List[EventSubscription]] = defaultdict(list)
        self._routes: Dict[str, List[EventRoute]] = defaultdict(list)
        self._event_queue: Queue = Queue()
        self._priority_queue: PriorityQueue = PriorityQueue()
        self._event_history: List[Event] = []
        self._max_history = 10000
        self._stats = EventStats()
        self._processing = False
        self._worker_thread: threading.Thread = None
        self._stop_event = threading.Event()

    def register_handler(
        self,
        name: str,
        handler: Callable,
        event_names: List[str],
        priority: int = 0,
        async_handler: bool = False,
        timeout: float = 30.0,
        retry_count: int = 0
    ) -> str:
        """Register an event handler."""
        with self._lock:
            handler_id = str(uuid.uuid4())[:12]
            event_handler = EventHandler(
                id=handler_id,
                name=name,
                handler=handler,
                event_names=event_names,
                priority=priority,
                async_handler=async_handler,
                timeout=timeout,
                retry_count=retry_count
            )

            for event_name in event_names:
                self._handlers[event_name].append(event_handler)
                # Sort by priority
                self._handlers[event_name].sort(key=lambda h: h.priority, reverse=True)

            return handler_id

    def unregister_handler(self, handler_id: str) -> bool:
        """Unregister an event handler."""
        with self._lock:
            for event_name, handlers in self._handlers.items():
                self._handlers[event_name] = [h for h in handlers if h.id != handler_id]
            return True

    def subscribe(
        self,
        subscriber_id: str,
        event_names: List[str],
        callback: Callable,
        filter: EventFilter = None
    ) -> str:
        """Subscribe to events."""
        with self._lock:
            sub_id = str(uuid.uuid4())[:12]
            subscription = EventSubscription(
                id=sub_id,
                subscriber_id=subscriber_id,
                event_names=event_names,
                callback=callback,
                filter=filter
            )

            for event_name in event_names:
                self._subscriptions[event_name].append(subscription)

            return sub_id

    def unsubscribe(self, subscription_id: str) -> bool:
        """Unsubscribe from events."""
        with self._lock:
            for event_name, subs in self._subscriptions.items():
                self._subscriptions[event_name] = [s for s in subs if s.id != subscription_id]
            return True

    def add_route(
        self,
        source_event: str,
        target_event: str,
        transformer: Callable = None,
        filter: EventFilter = None
    ) -> str:
        """Add event route."""
        with self._lock:
            route_id = str(uuid.uuid4())[:12]
            route = EventRoute(
                id=route_id,
                source_event=source_event,
                target_event=target_event,
                transformer=transformer,
                filter=filter
            )
            self._routes[source_event].append(route)
            return route_id

    def remove_route(self, route_id: str) -> bool:
        """Remove event route."""
        with self._lock:
            for source, routes in self._routes.items():
                self._routes[source] = [r for r in routes if r.id != route_id]
            return True

    def publish(self, event: Event) -> List[Any]:
        """Publish an event synchronously."""
        with self._lock:
            self._stats.total_events += 1
            start_time = time.time()
            results = []

            # Check if event is expired
            if event.expiry > 0 and time.time() > event.expiry:
                self._stats.expired_events += 1
                event.state = EventState.EXPIRED
                return results

            # Get handlers for this event
            handlers = self._handlers.get(event.name, [])
            subscriptions = self._subscriptions.get(event.name, [])

            # Execute handlers
            for handler in handlers:
                if self._should_handle(handler, event):
                    try:
                        result = self._execute_handler(handler, event)
                        results.append(result)
                        self._stats.handlers_triggered += 1
                    except Exception as e:
                        self._handle_error(handler, event, str(e))

            # Notify subscribers
            for sub in subscriptions:
                if sub.active and self._should_subscribe(sub, event):
                    try:
                        sub.callback(event)
                    except Exception:
                        pass

            # Process routes
            routes = self._routes.get(event.name, [])
            for route in routes:
                if route.enabled and self._should_route(route, event):
                    try:
                        transformed_event = event
                        if route.transformer:
                            transformed_event = route.transformer(event)
                        self.publish(transformed_event)
                    except Exception:
                        pass

            # Update stats
            event.state = EventState.COMPLETED
            self._stats.processed_events += 1
            processing_time = int((time.time() - start_time) * 1000)
            if self._stats.processed_events > 1:
                self._stats.avg_processing_time_ms = (
                    (self._stats.avg_processing_time_ms * (self._stats.processed_events - 1) + processing_time)
                    / self._stats.processed_events
                )

            # Add to history
            self._event_history.append(event)
            if len(self._event_history) > self._max_history:
                self._event_history.pop(0)

            return results

    def publish_async(self, event: Event):
        """Publish an event asynchronously."""
        self._event_queue.put(event)

    def _should_handle(self, handler: EventHandler, event: Event) -> bool:
        """Check if handler should handle event."""
        if handler.filter:
            if handler.filter.source and event.source != handler.filter.source:
                return False
            if handler.filter.event_type and event.event_type.value != handler.filter.event_type:
                return False
            if handler.filter.priority and event.priority != handler.filter.priority:
                return False
        return True

    def _should_subscribe(self, subscription: EventSubscription, event: Event) -> bool:
        """Check if subscription should receive event."""
        if subscription.filter:
            return self._should_handle(EventHandler(
                id="", name="", handler=lambda: None,
                event_names=[], filter=subscription.filter
            ), event)
        return True

    def _should_route(self, route: EventRoute, event: Event) -> bool:
        """Check if route should process event."""
        if route.filter:
            return self._should_handle(EventHandler(
                id="", name="", handler=lambda: None,
                event_names=[], filter=route.filter
            ), event)
        return True

    def _execute_handler(self, handler: EventHandler, event: Event) -> Any:
        """Execute handler."""
        if handler.async_handler:
            return asyncio.run(handler.handler(event))
        return handler.handler(event)

    def _handle_error(self, handler: EventHandler, event: Event, error: str):
        """Handle handler error."""
        if handler.retry_count > 0 and event.retries < handler.retry_count:
            event.retries += 1
            event.state = EventState.PENDING
            self.publish(event)
        else:
            self._stats.failed_events += 1
            event.state = EventState.FAILED

    def get_event(self, event_id: str) -> Optional[Event]:
        """Get event by ID."""
        with self._lock:
            for event in self._event_history:
                if event.id == event_id:
                    return event
            return None

    def get_events(
        self,
        name: str = None,
        source: str = None,
        state: EventState = None,
        limit: int = 100
    ) -> List[Dict]:
        """Get events from history."""
        with self._lock:
            events = list(self._event_history)
            if name:
                events = [e for e in events if e.name == name]
            if source:
                events = [e for e in events if e.source == source]
            if state:
                events = [e for e in events if e.state == state]
            events = events[-limit:]
            return [
                {"id": e.id, "name": e.name, "source": e.source, "type": e.event_type.value,
                 "priority": e.priority.value, "state": e.state.value, "timestamp": e.timestamp}
                for e in events
            ]

    def get_stats(self) -> Dict:
        """Get event bus statistics."""
        with self._lock:
            return {
                "total_events": self._stats.total_events,
                "processed_events": self._stats.processed_events,
                "failed_events": self._stats.failed_events,
                "expired_events": self._stats.expired_events,
                "handlers_triggered": self._stats.handlers_triggered,
                "avg_processing_time_ms": round(self._stats.avg_processing_time_ms, 2),
                "registered_handlers": sum(len(h) for h in self._handlers.values()),
                "active_subscriptions": sum(len(s) for s in self._subscriptions.values()),
                "active_routes": sum(len(r) for r in self._routes.values())
            }

    def clear_history(self):
        """Clear event history."""
        with self._lock:
            self._event_history.clear()

    def replay_events(self, from_timestamp: float = None, event_name: str = None):
        """Replay events."""
        with self._lock:
            events = list(self._event_history)
            if from_timestamp:
                events = [e for e in events if e.timestamp >= from_timestamp]
            if event_name:
                events = [e for e in events if e.name == event_name]

            for event in events:
                # Reset event state for replay
                event.state = EventState.PENDING
                event.retries = 0
                self.publish(event)

    def start_worker(self):
        """Start async event worker."""
        if self._worker_thread and self._worker_thread.is_alive():
            return
        self._stop_event.clear()
        self._worker_thread = threading.Thread(target=self._run_worker, daemon=True)
        self._worker_thread.start()

    def _run_worker(self):
        """Worker thread for async events."""
        while not self._stop_event.is_set():
            try:
                event = self._event_queue.get(timeout=1)
                self.publish(event)
            except Exception:
                pass

    def stop_worker(self):
        """Stop async event worker."""
        self._stop_event.set()
        if self._worker_thread:
            self._worker_thread.join(timeout=5)


class EventAggregator:
    """Aggregate events over time windows."""

    def __init__(self, window_size_seconds: int = 60):
        self._window_size = window_size_seconds
        self._lock = threading.RLock()
        self._event_windows: Dict[str, List[Event]] = defaultdict(list)

    def add_event(self, event: Event):
        """Add event to aggregator."""
        with self._lock:
            current_time = time.time()
            window_key = event.name

            # Remove old events
            cutoff = current_time - self._window_size
            self._event_windows[window_key] = [
                e for e in self._event_windows[window_key]
                if e.timestamp >= cutoff
            ]

            self._event_windows[window_key].append(event)

    def get_counts(self) -> Dict[str, int]:
        """Get event counts per window."""
        with self._lock:
            return {name: len(events) for name, events in self._event_windows.items()}

    def get_rate(self, event_name: str = None) -> float:
        """Get events per second rate."""
        with self._lock:
            current_time = time.time()
            cutoff = current_time - self._window_size

            if event_name:
                events = [e for e in self._event_windows[event_name] if e.timestamp >= cutoff]
                return len(events) / self._window_size
            else:
                total = sum(len([e for e in events if e.timestamp >= cutoff])
                          for events in self._event_windows.values())
                return total / self._window_size


# Global event bus instance
agent_event_bus = AgentEventBus()
