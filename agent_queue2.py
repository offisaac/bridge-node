"""Agent Queue 2 Module

Queue connector for agent services supporting RabbitMQ and Kafka with connection
management, producer/consumer patterns, message serialization, partitioning,
and fault tolerance.
"""
import asyncio
import os
import json
import time
import uuid
import hashlib
from typing import Dict, List, Optional, Any, Callable, Set
from dataclasses import dataclass, field
from collections import defaultdict
from collections import deque
import threading
import queue
import random

from shared import QueueType, DeliveryMode, ConsumerType


@dataclass
class QueueConfig:
    """Queue connector configuration."""
    queue_type: QueueType = QueueType.RABBITMQ
    # RabbitMQ - credentials should come from environment variables
    rabbitmq_host: str = os.getenv("RABBITMQ_HOST", "localhost")
    rabbitmq_port: int = int(os.getenv("RABBITMQ_PORT", "5672"))
    rabbitmq_user: str = os.getenv("RABBITMQ_USER", "")
    rabbitmq_password: str = os.getenv("RABBITMQ_PASSWORD", "")
    rabbitmq_vhost: str = os.getenv("RABBITMQ_VHOST", "/")
    rabbitmq_connection_timeout: float = 10.0
    # Kafka
    kafka_bootstrap_servers: str = "localhost:9092"
    kafka_client_id: str = "agent-queue"
    kafka_group_id: str = "agent-consumers"
    # Common
    max_retry: int = 3
    retry_delay: float = 1.0
    heartbeat_interval: float = 30.0
    prefetch_count: int = 10
    serialization: str = "json"  # json, msgpack, protobuf
    compression: str = "none"  # none, gzip, snappy
    batch_size: int = 100
    batch_timeout_ms: int = 1000


@dataclass
class QueueMessage:
    """Queue message definition."""
    id: str
    topic: str
    payload: Any
    key: str = None
    partition: int = 0
    timestamp: float = field(default_factory=time.time)
    headers: Dict[str, str] = field(default_factory=dict)
    delivery_mode: DeliveryMode = DeliveryMode.PERSISTENT
    correlation_id: str = None
    reply_to: str = None
    retry_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class QueueConsumer:
    """Queue consumer definition."""
    id: str
    topic: str
    consumer_type: ConsumerType = ConsumerType.FIFO
    handler: Callable = None
    offset: int = 0
    partition: int = 0
    active: bool = True
    message_count: int = 0
    error_count: int = 0


@dataclass
class QueueProducer:
    """Queue producer definition."""
    id: str
    topic: str
    partition_count: int = 1
    message_count: int = 0
    error_count: int = 0


@dataclass
class QueueStats:
    """Queue statistics."""
    total_messages_sent: int = 0
    total_messages_received: int = 0
    total_errors: int = 0
    active_consumers: int = 0
    active_producers: int = 0
    avg_latency_ms: float = 0
    queue_size: int = 0
    reconnection_count: int = 0


class MessageSerializer:
    """Message serialization."""

    @staticmethod
    def serialize(data: Any, format: str = "json") -> bytes:
        """Serialize message to bytes."""
        if format == "json":
            return json.dumps(data).encode("utf-8")
        elif format == "msgpack":
            import msgpack
            return msgpack.packb(data)
        else:
            return json.dumps(data).encode("utf-8")

    @staticmethod
    def deserialize(data: bytes, format: str = "json") -> Any:
        """Deserialize message from bytes."""
        if format == "json":
            return json.loads(data.decode("utf-8"))
        elif format == "msgpack":
            import msgpack
            return msgpack.unpackb(data, raw=False)
        else:
            return json.loads(data.decode("utf-8"))


class AgentQueueConnector:
    """Queue connector for RabbitMQ and Kafka."""

    def __init__(self, config: QueueConfig = None):
        self._config = config or QueueConfig()
        self._lock = threading.RLock()
        self._stats = QueueStats()
        self._connected = False
        self._consumers: Dict[str, QueueConsumer] = {}
        self._producers: Dict[str, QueueProducer] = {}
        self._message_queues: Dict[str, deque] = defaultdict(deque)
        self._handlers: Dict[str, Callable] = {}
        self._running = False
        self._worker_tasks: List[asyncio.Task] = []

    def configure(self, config: QueueConfig):
        """Update configuration."""
        with self._lock:
            self._config = config

    async def connect(self) -> bool:
        """Connect to queue server."""
        with self._lock:
            if self._connected:
                return True

            try:
                if self._config.queue_type == QueueType.RABBITMQ:
                    await self._connect_rabbitmq()
                elif self._config.queue_type == QueueType.KAFKA:
                    await self._connect_kafka()

                self._connected = True
                return True
            except Exception as e:
                self._stats.total_errors += 1
                return False

    async def _connect_rabbitmq(self):
        """Connect to RabbitMQ."""
        # In real implementation, would use aio-pika
        # For now, simulate connection
        pass

    async def _connect_kafka(self):
        """Connect to Kafka."""
        # In real implementation, would use aiokafka
        # For now, simulate connection
        pass

    async def disconnect(self):
        """Disconnect from queue server."""
        with self._lock:
            self._connected = False
            self._running = False

            # Cancel worker tasks
            for task in self._worker_tasks:
                task.cancel()

            self._worker_tasks.clear()

    def is_connected(self) -> bool:
        """Check if connected."""
        return self._connected

    async def create_topic(self, topic: str, partitions: int = 1) -> bool:
        """Create a topic/queue."""
        if not self._connected:
            await self.connect()

        with self._lock:
            self._message_queues[topic] = deque(maxlen=self._config.batch_size * 10)
            return True

    async def delete_topic(self, topic: str) -> bool:
        """Delete a topic/queue."""
        with self._lock:
            self._message_queues.pop(topic, None)
            # Remove consumers and producers for this topic
            self._consumers = {k: v for k, v in self._consumers.items() if v.topic != topic}
            self._producers = {k: v for k, v in self._producers.items() if v.topic != topic}
            return True

    async def publish(
        self,
        topic: str,
        payload: Any,
        key: str = None,
        partition: int = 0,
        headers: Dict[str, str] = None,
        delivery_mode: DeliveryMode = DeliveryMode.PERSISTENT
    ) -> str:
        """Publish message to queue."""
        message_id = str(uuid.uuid4())

        if not self._connected:
            await self.connect()

        message = QueueMessage(
            id=message_id,
            topic=topic,
            payload=payload,
            key=key,
            partition=partition,
            headers=headers or {},
            delivery_mode=delivery_mode
        )

        with self._lock:
            # Get or create producer
            producer_id = f"producer_{topic}"
            if producer_id not in self._producers:
                self._producers[producer_id] = QueueProducer(
                    id=producer_id,
                    topic=topic,
                    partition_count=1
                )

            # Ensure queue exists
            if topic not in self._message_queues:
                self._message_queues[topic] = deque(maxlen=self._config.batch_size * 10)

            # Add to queue
            self._message_queues[topic].append(message)
            self._producers[producer_id].message_count += 1
            self._stats.total_messages_sent += 1
            self._stats.queue_size = sum(len(q) for q in self._message_queues.values())

        return message_id

    async def publish_batch(
        self,
        topic: str,
        messages: List[Any],
        keys: List[str] = None
    ) -> List[str]:
        """Publish batch of messages."""
        message_ids = []
        keys = keys or [None] * len(messages)

        for i, payload in enumerate(messages):
            msg_id = await self.publish(
                topic=topic,
                payload=payload,
                key=keys[i] if i < len(keys) else None
            )
            message_ids.append(msg_id)

        return message_ids

    async def subscribe(
        self,
        topic: str,
        handler: Callable,
        consumer_type: ConsumerType = ConsumerType.FIFO,
        partition: int = 0
    ) -> str:
        """Subscribe to queue."""
        consumer_id = str(uuid.uuid4())[:12]

        consumer = QueueConsumer(
            id=consumer_id,
            topic=topic,
            consumer_type=consumer_type,
            handler=handler,
            partition=partition,
            active=True
        )

        with self._lock:
            self._consumers[consumer_id] = consumer
            self._handlers[consumer_id] = handler
            self._stats.active_consumers += 1

        # Start consumer worker
        asyncio.create_task(self._consumer_worker(consumer_id))

        return consumer_id

    async def _consumer_worker(self, consumer_id: str):
        """Worker for consuming messages."""
        while self._running:
            consumer = self._consumers.get(consumer_id)
            if not consumer or not consumer.active:
                break

            try:
                # Get message from queue
                with self._lock:
                    queue = self._message_queues.get(consumer.topic)
                    if not queue or len(queue) == 0:
                        await asyncio.sleep(0.1)
                        continue

                    if consumer.consumer_type == ConsumerType.FIFO:
                        message = queue.popleft()
                    elif consumer.consumer_type == ConsumerType.BROADCAST:
                        # Get all messages
                        message = queue[0] if queue else None
                    elif consumer.consumer_type == ConsumerType.PARTITIONED:
                        message = None
                        for msg in queue:
                            if msg.partition == consumer.partition:
                                message = msg
                                break
                    else:
                        message = queue.popleft() if queue else None

                if message:
                    # Call handler
                    handler = self._handlers.get(consumer_id)
                    if handler:
                        try:
                            await handler(message)
                            consumer.message_count += 1
                            self._stats.total_messages_received += 1
                        except Exception as e:
                            consumer.error_count += 1
                            self._stats.total_errors += 1

            except Exception as e:
                self._stats.total_errors += 1
                await asyncio.sleep(0.5)

    async def unsubscribe(self, consumer_id: str) -> bool:
        """Unsubscribe from queue."""
        with self._lock:
            consumer = self._consumers.get(consumer_id)
            if consumer:
                consumer.active = False
                self._stats.active_consumers -= 1
                del self._consumers[consumer_id]
                self._handlers.pop(consumer_id, None)
                return True
            return False

    async def consume(
        self,
        topic: str,
        timeout: float = 1.0,
        max_messages: int = 1
    ) -> List[QueueMessage]:
        """Consume messages directly (non-blocking)."""
        messages = []

        with self._lock:
            queue = self._message_queues.get(topic)
            if not queue:
                return messages

            for _ in range(min(max_messages, len(queue))):
                if queue:
                    messages.append(queue.popleft())

            self._stats.queue_size = sum(len(q) for q in self._message_queues.values())

        return messages

    def get_queue_size(self, topic: str) -> int:
        """Get size of queue."""
        with self._lock:
            queue = self._message_queues.get(topic)
            return len(queue) if queue else 0

    def get_topics(self) -> List[str]:
        """Get list of topics."""
        with self._lock:
            return list(self._message_queues.keys())

    def get_consumers(self, topic: str = None) -> List[Dict]:
        """Get list of consumers."""
        with self._lock:
            consumers = list(self._consumers.values())
            if topic:
                consumers = [c for c in consumers if c.topic == topic]
            return [
                {
                    "id": c.id,
                    "topic": c.topic,
                    "consumer_type": c.consumer_type.value,
                    "partition": c.partition,
                    "active": c.active,
                    "message_count": c.message_count,
                    "error_count": c.error_count
                }
                for c in consumers
            ]

    def get_producers(self, topic: str = None) -> List[Dict]:
        """Get list of producers."""
        with self._lock:
            producers = list(self._producers.values())
            if topic:
                producers = [p for p in producers if p.topic == topic]
            return [
                {
                    "id": p.id,
                    "topic": p.topic,
                    "partition_count": p.partition_count,
                    "message_count": p.message_count,
                    "error_count": p.error_count
                }
                for p in producers
            ]

    async def start(self):
        """Start queue connector."""
        self._running = True
        if not self._connected:
            await self.connect()

    async def stop(self):
        """Stop queue connector."""
        self._running = False
        await self.disconnect()

    def get_stats(self) -> Dict:
        """Get queue statistics."""
        with self._lock:
            return {
                "connected": self._connected,
                "queue_type": self._config.queue_type.value,
                "total_messages_sent": self._stats.total_messages_sent,
                "total_messages_received": self._stats.total_messages_received,
                "total_errors": self._stats.total_errors,
                "active_consumers": self._stats.active_consumers,
                "active_producers": self._stats.active_producers,
                "avg_latency_ms": round(self._stats.avg_latency_ms, 2),
                "queue_size": self._stats.queue_size,
                "topics": list(self._message_queues.keys()),
                "config": {
                    "serialization": self._config.serialization,
                    "compression": self._config.compression,
                    "batch_size": self._config.batch_size,
                }
            }


# Global queue connector instance
agent_queue_connector = AgentQueueConnector()
