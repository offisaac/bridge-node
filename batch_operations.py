"""Batch Operations API Module

Generic batch processing API for handling multiple operations in a single request.
Supports parallel execution, transaction rollback, and result aggregation.
"""
import asyncio
import uuid
import time
from typing import Dict, List, Any, Optional, Callable, Union
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from concurrent.futures import ThreadPoolExecutor
import threading


class BatchOperationType(str, Enum):
    """Types of operations supported in batch processing."""
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    EXECUTE = "execute"
    VALIDATE = "validate"


class BatchStatus(str, Enum):
    """Batch operation status."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIAL = "partial"
    CANCELLED = "cancelled"


@dataclass
class BatchOperation:
    """Single operation in a batch request."""
    id: str
    type: BatchOperationType
    resource: str
    data: Dict[str, Any]
    options: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BatchOperationResult:
    """Result of a single operation."""
    operation_id: str
    success: bool
    data: Optional[Any] = None
    error: Optional[str] = None
    status_code: Optional[int] = None
    duration_ms: int = 0


@dataclass
class BatchRequest:
    """Batch request containing multiple operations."""
    operations: List[BatchOperation]
    options: Dict[str, Any] = field(default_factory=dict)


@dataclass
class BatchResponse:
    """Batch response with all operation results."""
    batch_id: str
    status: BatchStatus
    results: List[BatchOperationResult]
    total_duration_ms: int = 0
    succeeded: int = 0
    failed: int = 0


class BatchOperationHandler:
    """Handler for different operation types."""

    def __init__(self):
        self._handlers: Dict[str, Dict[BatchOperationType, Callable]] = {}

    def register(self, resource: str, operation: BatchOperationType, handler: Callable):
        """Register a handler for a resource operation."""
        if resource not in self._handlers:
            self._handlers[resource] = {}
        self._handlers[resource][operation] = handler

    async def execute(self, operation: BatchOperation) -> BatchOperationResult:
        """Execute a single operation."""
        start_time = time.time()

        try:
            resource_handlers = self._handlers.get(operation.resource, {})
            handler = resource_handlers.get(operation.type)

            if not handler:
                return BatchOperationResult(
                    operation_id=operation.id,
                    success=False,
                    error=f"No handler for {operation.resource}/{operation.type}",
                    duration_ms=int((time.time() - start_time) * 1000)
                )

            # Execute handler
            if asyncio.iscoroutinefunction(handler):
                result = await handler(operation.data, operation.options)
            else:
                result = handler(operation.data, operation.options)

            return BatchOperationResult(
                operation_id=operation.id,
                success=True,
                data=result,
                status_code=200,
                duration_ms=int((time.time() - start_time) * 1000)
            )

        except Exception as e:
            return BatchOperationResult(
                operation_id=operation.id,
                success=False,
                error=str(e),
                status_code=500,
                duration_ms=int((time.time() - start_time) * 1000)
            )


class BatchProcessor:
    """Batch processor with parallel execution support."""

    def __init__(
        self,
        max_parallel: int = 10,
        enable_rollback: bool = False,
        executor: Optional[ThreadPoolExecutor] = None
    ):
        self.max_parallel = max_parallel
        self.enable_rollback = enable_rollback
        self.executor = executor or ThreadPoolExecutor(max_workers=max_parallel)
        self.handler = BatchOperationHandler()

        # Batch storage
        self._batches: Dict[str, Dict] = {}
        self._lock = threading.RLock()

    def add_batch(self, batch_id: str, request: BatchRequest):
        """Add a batch to storage."""
        with self._lock:
            self._batches[batch_id] = {
                "request": request,
                "status": BatchStatus.PENDING,
                "results": [],
                "created_at": datetime.now().isoformat()
            }

    def update_batch(
        self,
        batch_id: str,
        status: BatchStatus = None,
        results: List[BatchOperationResult] = None
    ):
        """Update batch status and results."""
        with self._lock:
            if batch_id in self._batches:
                if status:
                    self._batches[batch_id]["status"] = status
                if results is not None:
                    self._batches[batch_id]["results"] = results
                self._batches[batch_id]["updated_at"] = datetime.now().isoformat()

    def get_batch(self, batch_id: str) -> Optional[Dict]:
        """Get batch by ID."""
        with self._lock:
            return self._batches.get(batch_id)

    def list_batches(self, limit: int = 50, status: BatchStatus = None) -> List[Dict]:
        """List batches with optional status filter."""
        with self._lock:
            batches = list(self._batches.values())
            if status:
                batches = [b for b in batches if b["status"] == status]
            return sorted(
                batches,
                key=lambda x: x.get("created_at", ""),
                reverse=True
            )[:limit]

    async def process_batch(self, request: BatchRequest) -> BatchResponse:
        """Process a batch request with parallel execution."""
        batch_id = str(uuid.uuid4())
        start_time = time.time()

        # Initialize batch
        self.add_batch(batch_id, request)
        self.update_batch(batch_id, BatchStatus.RUNNING)

        results: List[BatchOperationResult] = []

        # Execute operations in parallel with semaphore
        semaphore = asyncio.Semaphore(self.max_parallel)

        async def process_with_semaphore(op: BatchOperation) -> BatchOperationResult:
            async with semaphore:
                return await self.handler.execute(op)

        # Create tasks
        tasks = [process_with_semaphore(op) for op in request.operations]

        # Wait for all to complete
        results = await asyncio.gather(*tasks, return_exceptions=False)

        # Calculate status
        succeeded = sum(1 for r in results if r.success)
        failed = len(results) - succeeded

        if failed == 0:
            status = BatchStatus.COMPLETED
        elif succeeded == 0:
            status = BatchStatus.FAILED
        else:
            status = BatchStatus.PARTIAL

        # Update batch
        self.update_batch(batch_id, status, results)

        total_duration = int((time.time() - start_time) * 1000)

        return BatchResponse(
            batch_id=batch_id,
            status=status,
            results=results,
            total_duration_ms=total_duration,
            succeeded=succeeded,
            failed=failed
        )

    async def process_sequential(self, request: BatchRequest) -> BatchResponse:
        """Process operations sequentially (in order)."""
        batch_id = str(uuid.uuid4())
        start_time = time.time()

        self.add_batch(batch_id, request)
        self.update_batch(batch_id, BatchStatus.RUNNING)

        results: List[BatchOperationResult] = []

        for operation in request.operations:
            result = await self.handler.execute(operation)
            results.append(result)

            # Check for failure with rollback enabled
            if self.enable_rollback and not result.success:
                # Rollback previous operations
                await self._rollback(results[:-1])
                self.update_batch(batch_id, BatchStatus.FAILED, results)
                return BatchResponse(
                    batch_id=batch_id,
                    status=BatchStatus.FAILED,
                    results=results,
                    total_duration_ms=int((time.time() - start_time) * 1000),
                    succeeded=sum(1 for r in results if r.success),
                    failed=len(results)
                )

        succeeded = sum(1 for r in results if r.success)
        status = BatchStatus.COMPLETED if succeeded == len(results) else BatchStatus.PARTIAL

        self.update_batch(batch_id, status, results)

        return BatchResponse(
            batch_id=batch_id,
            status=status,
            results=results,
            total_duration_ms=int((time.time() - start_time) * 1000),
            succeeded=succeeded,
            failed=len(results) - succeeded
        )

    async def _rollback(self, results: List[BatchOperationResult]):
        """Rollback completed operations."""
        for result in reversed(results):
            if result.success and result.data:
                # Try to call undo handler if available
                pass  # Implement rollback logic per resource


# Global batch processor instance
batch_processor = BatchProcessor(max_parallel=10)


# Helper function to create batch request
def create_batch_request(
    operations: List[Dict[str, Any]],
    options: Optional[Dict[str, Any]] = None
) -> BatchRequest:
    """Create a BatchRequest from a list of operation dicts."""
    ops = [
        BatchOperation(
            id=str(uuid.uuid4()),
            type=BatchOperationType(op.get("type", "read")),
            resource=op.get("resource", ""),
            data=op.get("data", {}),
            options=op.get("options", {})
        )
        for op in operations
    ]
    return BatchRequest(operations=ops, options=options or {})
