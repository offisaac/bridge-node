"""Agent GraphQL Module

GraphQL client for agent services with query/mutation/subscription execution,
schema introspection, cache management, and batch operations.
"""
import asyncio
import json
import time
import uuid
import hashlib
from typing import Dict, List, Optional, Any, Callable, Set
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
from collections import deque
import threading


class OperationType(str, Enum):
    """GraphQL operation types."""
    QUERY = "query"
    MUTATION = "mutation"
    SUBSCRIPTION = "subscription"
    SCHEMA = "schema"
    INTROSPECTION = "introspection"


class CacheStrategy(str, Enum):
    """Cache strategies."""
    NO_CACHE = "no_cache"
    MEMORY = "memory"
    PERSISTENT = "persistent"
    INVALIDATE_AFTER_MUTATION = "invalidate_after_mutation"


@dataclass
class GraphQLConfig:
    """GraphQL client configuration."""
    endpoint: str = ""
    ws_endpoint: str = ""
    headers: Dict[str, str] = field(default_factory=dict)
    timeout: float = 30.0
    max_retries: int = 3
    retry_delay: float = 1.0
    cache_enabled: bool = True
    cache_ttl: int = 300  # seconds
    max_cache_size: int = 1000
    batch_enabled: bool = True
    batch_delay: float = 0.05  # 50ms batching window
    max_batch_size: int = 10
    schema_cache_enabled: bool = True
    validate_variables: bool = True


@dataclass
class GraphQLOperation:
    """GraphQL operation definition."""
    id: str
    query: str
    operation_type: OperationType
    operation_name: str = None
    variables: Dict[str, Any] = field(default_factory=dict)
    headers: Dict[str, str] = field(default_factory=dict)
    timeout: float = 30.0
    cache_strategy: CacheStrategy = CacheStrategy.MEMORY
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GraphQLResult:
    """GraphQL operation result."""
    operation_id: str
    data: Any
    errors: List[Dict] = field(default_factory=list)
    extensions: Dict[str, Any] = field(default_factory=dict)
    cached: bool = False
    execution_time_ms: float = 0
    timestamp: float = field(default_factory=time.time)


@dataclass
class SchemaInfo:
    """GraphQL schema information."""
    types: Dict[str, Any] = field(default_factory=dict)
    query_type: str = None
    mutation_type: str = None
    subscription_type: str = None
    directives: List[str] = field(default_factory=list)
    fetched_at: float = field(default_factory=time.time)


@dataclass
class GraphQLStats:
    """GraphQL statistics."""
    total_queries: int = 0
    total_mutations: int = 0
    total_subscriptions: int = 0
    cache_hits: int = 0
    cache_misses: int = 0
    total_errors: int = 0
    avg_execution_time_ms: float = 0
    batch_operations: int = 0
    bytes_sent: int = 0
    bytes_received: int = 0


class QueryCache:
    """GraphQL query cache."""

    def __init__(self, max_size: int = 1000, ttl: int = 300):
        self._max_size = max_size
        self._ttl = ttl
        self._cache: Dict[str, tuple] = {}  # key -> (result, timestamp)
        self._lock = threading.RLock()

    def _make_key(self, query: str, variables: Dict) -> str:
        """Generate cache key from query and variables."""
        content = json.dumps({"query": query, "variables": variables}, sort_keys=True)
        return hashlib.sha256(content.encode()).hexdigest()

    def get(self, query: str, variables: Dict) -> Optional[GraphQLResult]:
        """Get cached result."""
        key = self._make_key(query, variables)
        with self._lock:
            if key in self._cache:
                result, timestamp = self._cache[key]
                if time.time() - timestamp < self._ttl:
                    return result
                del self._cache[key]
        return None

    def set(self, query: str, variables: Dict, result: GraphQLResult):
        """Set cached result."""
        key = self._make_key(query, variables)
        with self._lock:
            if len(self._cache) >= self._max_size:
                # Remove oldest
                oldest = min(self._cache.items(), key=lambda x: x[1][1])
                del self._cache[oldest[0]]
            self._cache[key] = (result, time.time())

    def invalidate(self, pattern: str = None):
        """Invalidate cache."""
        with self._lock:
            if pattern is None:
                self._cache.clear()
            else:
                # Remove entries matching pattern
                to_remove = [k for k in self._cache.keys() if pattern in k]
                for k in to_remove:
                    del self._cache[k]

    def get_stats(self) -> Dict:
        """Get cache statistics."""
        with self._lock:
            return {
                "size": len(self._cache),
                "max_size": self._max_size,
                "ttl": self._ttl
            }


class BatchProcessor:
    """Batch GraphQL operations."""

    def __init__(self, delay: float = 0.05, max_size: int = 10):
        self._delay = delay
        self._max_size = max_size
        self._pending: deque = deque()
        self._lock = threading.Lock()
        self._triggered = False

    async def add(self, operation: GraphQLOperation) -> List[GraphQLOperation]:
        """Add operation to batch, return batch if ready."""
        with self._lock:
            self._pending.append(operation)
            if len(self._pending) >= self._max_size:
                batch = list(self._pending)
                self._pending.clear()
                return batch
            self._triggered = True

        # Wait for more operations or timeout
        await asyncio.sleep(self._delay)

        with self._lock:
            if self._triggered and self._pending:
                batch = list(self._pending)
                self._pending.clear()
                self._triggered = False
                return batch

        return []

    def flush(self) -> List[GraphQLOperation]:
        """Flush pending operations."""
        with self._lock:
            batch = list(self._pending)
            self._pending.clear()
            self._triggered = False
            return batch


class AgentGraphQLClient:
    """GraphQL client for agents."""

    def __init__(self, config: GraphQLConfig = None):
        self._config = config or GraphQLConfig()
        self._lock = threading.RLock()
        self._cache = QueryCache(self._config.max_cache_size, self._config.cache_ttl)
        self._batch_processor = BatchProcessor(self._config.batch_delay, self._config.max_batch_size)
        self._schema: SchemaInfo = None
        self._stats = GraphQLStats()
        self._subscriptions: Dict[str, Callable] = {}
        self._middleware: List[Callable] = []
        self._type_resolvers: Dict[str, Callable] = {}

    def configure(self, config: GraphQLConfig):
        """Update configuration."""
        with self._lock:
            self._config = config
            self._cache = QueryCache(config.max_cache_size, config.cache_ttl)
            self._batch_processor = BatchProcessor(config.batch_delay, config.max_batch_size)

    async def execute(
        self,
        query: str,
        variables: Dict[str, Any] = None,
        operation_name: str = None,
        headers: Dict[str, str] = None,
        cache: CacheStrategy = CacheStrategy.MEMORY,
        timeout: float = None
    ) -> GraphQLResult:
        """Execute a GraphQL operation."""
        operation_id = str(uuid.uuid4())
        variables = variables or {}
        headers = headers or {}
        timeout = timeout or self._config.timeout

        # Determine operation type
        operation_type = self._detect_operation_type(query)

        operation = GraphQLOperation(
            id=operation_id,
            query=query,
            operation_type=operation_type,
            operation_name=operation_name,
            variables=variables,
            headers=headers,
            timeout=timeout,
            cache_strategy=cache
        )

        # Check cache for queries
        if operation_type == OperationType.QUERY and cache != CacheStrategy.NO_CACHE:
            cached = self._cache.get(query, variables)
            if cached:
                self._stats.cache_hits += 1
                cached.cached = True
                return cached

        self._stats.cache_misses += 1

        # Apply middleware
        for mw in self._middleware:
            operation = await mw(operation)
            if operation is None:
                raise ValueError("Middleware cancelled operation")

        # Execute based on operation type
        if operation_type == OperationType.QUERY:
            result = await self._execute_query(operation)
        elif operation_type == OperationType.MUTATION:
            result = await self._execute_mutation(operation)
        elif operation_type == OperationType.SUBSCRIPTION:
            result = await self._execute_subscription(operation)
        elif operation_type in (OperationType.SCHEMA, OperationType.INTROSPECTION):
            result = await self._execute_introspection(operation)
        else:
            raise ValueError(f"Unknown operation type: {operation_type}")

        # Cache result if applicable
        if operation_type == OperationType.QUERY and cache != CacheStrategy.NO_CACHE:
            self._cache.set(query, variables, result)

        return result

    def _detect_operation_type(self, query: str) -> OperationType:
        """Detect operation type from query."""
        query_lower = query.strip().lower()
        if query_lower.startswith("mutation"):
            return OperationType.MUTATION
        elif query_lower.startswith("subscription"):
            return OperationType.SUBSCRIPTION
        elif query_lower.startswith("{") or query_lower.startswith("query"):
            return OperationType.QUERY
        return OperationType.QUERY

    async def _execute_query(self, operation: GraphQLOperation) -> GraphQLResult:
        """Execute query operation."""
        start_time = time.time()

        try:
            # In a real implementation, this would make HTTP request
            # For now, simulate execution
            self._stats.total_queries += 1
            self._stats.bytes_sent += len(operation.query)

            # Simulate response (in real implementation, use httpx/aiohttp)
            result = GraphQLResult(
                operation_id=operation.id,
                data={"result": "simulated"},
                errors=[],
                execution_time_ms=(time.time() - start_time) * 1000
            )

            return result
        except Exception as e:
            self._stats.total_errors += 1
            raise

    async def _execute_mutation(self, operation: GraphQLOperation) -> GraphQLResult:
        """Execute mutation operation."""
        start_time = time.time()
        self._stats.total_mutations += 1

        try:
            # Invalidate cache after mutation if configured
            if self._config.cache_enabled:
                self._cache.invalidate()

            result = GraphQLResult(
                operation_id=operation.id,
                data={"result": "mutated"},
                errors=[],
                execution_time_ms=(time.time() - start_time) * 1000
            )

            return result
        except Exception as e:
            self._stats.total_errors += 1
            raise

    async def _execute_subscription(self, operation: GraphQLOperation) -> GraphQLResult:
        """Execute subscription operation."""
        start_time = time.time()
        self._stats.total_subscriptions += 1

        # Store subscription
        self._subscriptions[operation.id] = lambda: None

        result = GraphQLResult(
            operation_id=operation.id,
            data={"status": "subscribed"},
            errors=[],
            execution_time_ms=(time.time() - start_time) * 1000
        )

        return result

    async def _execute_introspection(self, operation: GraphQLOperation) -> GraphQLResult:
        """Execute introspection query."""
        start_time = time.time()

        # Return cached schema if available
        if self._schema and self._config.schema_cache_enabled:
            return GraphQLResult(
                operation_id=operation.id,
                data={"schema": self._schema.__dict__},
                execution_time_ms=(time.time() - start_time) * 1000
            )

        # Simulate schema fetch
        self._schema = SchemaInfo(
            types={"Query": {}, "Mutation": {}, "Subscription": {}},
            query_type="Query",
            mutation_type="Mutation",
            subscription_type="Subscription"
        )

        return GraphQLResult(
            operation_id=operation.id,
            data={"schema": self._schema.__dict__},
            execution_time_ms=(time.time() - start_time) * 1000
        )

    async def execute_batch(
        self,
        operations: List[Dict[str, Any]]
    ) -> List[GraphQLResult]:
        """Execute multiple operations in batch."""
        if not self._config.batch_enabled:
            # Execute sequentially
            results = []
            for op in operations:
                result = await self.execute(
                    op.get("query"),
                    op.get("variables"),
                    op.get("operation_name"),
                    op.get("headers"),
                    op.get("cache", CacheStrategy.NO_CACHE)
                )
                results.append(result)
            return results

        self._stats.batch_operations += 1
        # In real implementation, would batch HTTP requests
        results = []
        for op in operations:
            result = await self.execute(
                op.get("query"),
                op.get("variables"),
                op.get("operation_name"),
                op.get("headers"),
                CacheStrategy.NO_CACHE  # Don't cache batch ops
            )
            results.append(result)

        return results

    async def fetch_schema(self, force: bool = False) -> SchemaInfo:
        """Fetch GraphQL schema via introspection."""
        if self._schema and not force and self._config.schema_cache_enabled:
            return self._schema

        introspection_query = """
        query IntrospectionQuery {
            __schema {
                queryType { name }
                mutationType { name }
                subscriptionType { name }
                types {
                    ...FullType
                }
                directives {
                    name
                    description
                    locations
                    args {
                        ...InputValue
                    }
                }
            }
        }
        """

        result = await self.execute(introspection_query)
        if result.errors:
            raise ValueError(f"Schema fetch failed: {result.errors}")

        self._schema = SchemaInfo(
            types=result.data.get("__schema", {}).get("types", {}),
            query_type=result.data.get("__schema", {}).get("queryType", {}).get("name"),
            mutation_type=result.data.get("__schema", {}).get("mutationType", {}).get("name"),
            subscription_type=result.data.get("__schema", {}).get("subscriptionType", {}).get("name")
        )

        return self._schema

    def get_type(self, type_name: str) -> Optional[Dict]:
        """Get type information from schema."""
        if not self._schema:
            return None
        return self._schema.types.get(type_name)

    def list_queries(self) -> List[str]:
        """List available queries from schema."""
        if not self._schema:
            return []
        query_type = self._schema.types.get(self._schema.query_type, {})
        return list(query_type.get("fields", {}).keys())

    def list_mutations(self) -> List[str]:
        """List available mutations from schema."""
        if not self._schema or not self._schema.mutation_type:
            return []
        mutation_type = self._schema.types.get(self._schema.mutation_type, {})
        return list(mutation_type.get("fields", {}).keys())

    def register_middleware(self, middleware: Callable):
        """Register middleware function."""
        self._middleware.append(middleware)

    def register_type_resolver(self, type_name: str, resolver: Callable):
        """Register custom type resolver."""
        self._type_resolvers[type_name] = resolver

    def unsubscribe(self, operation_id: str) -> bool:
        """Unsubscribe from a subscription."""
        if operation_id in self._subscriptions:
            del self._subscriptions[operation_id]
            return True
        return False

    def clear_cache(self):
        """Clear query cache."""
        self._cache.invalidate()

    def get_stats(self) -> Dict:
        """Get GraphQL statistics."""
        with self._lock:
            total_ops = self._stats.total_queries + self._stats.total_mutations + self._stats.total_subscriptions
            cache_total = self._stats.cache_hits + self._stats.cache_misses

            return {
                "total_queries": self._stats.total_queries,
                "total_mutations": self._stats.total_mutations,
                "total_subscriptions": self._stats.total_subscriptions,
                "cache_hits": self._stats.cache_hits,
                "cache_misses": self._stats.cache_misses,
                "cache_hit_rate": round(self._stats.cache_hits / cache_total * 100, 2) if cache_total > 0 else 0,
                "total_errors": self._stats.total_errors,
                "avg_execution_time_ms": round(self._stats.avg_execution_time_ms, 2),
                "batch_operations": self._stats.batch_operations,
                "active_subscriptions": len(self._subscriptions),
                "bytes_sent": self._stats.bytes_sent,
                "bytes_received": self._stats.bytes_received,
                "cache_stats": self._cache.get_stats()
            }


# Global GraphQL client instance
agent_graphql_client = AgentGraphQLClient()
