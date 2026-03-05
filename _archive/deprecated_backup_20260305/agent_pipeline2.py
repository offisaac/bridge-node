"""Agent Pipeline Module

Agent processing pipeline with stages, chaining, parallel execution,
error handling, flow control, and streaming support.
"""
import time
import threading
import uuid
import asyncio
from typing import Dict, List, Optional, Any, Callable, Union, AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, Future
import asyncio


class StageType(str, Enum):
    """Pipeline stage types."""
    TRANSFORM = "transform"
    FILTER = "filter"
    VALIDATE = "validate"
    AGGREGATE = "aggregate"
    SPLIT = "split"
    MERGE = "merge"
    BRANCH = "branch"
    CUSTOM = "custom"


class PipelineState(str, Enum):
    """Pipeline states."""
    IDLE = "idle"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class FlowControl(str, Enum):
    """Flow control strategies."""
    CONTINUE = "continue"
    STOP = "stop"
    RETRY = "retry"
    SKIP = "skip"
    FALLBACK = "fallback"


@dataclass
class StageConfig:
    """Stage configuration."""
    name: str
    stage_type: StageType
    handler: Callable = None
    timeout: float = 60.0
    retry_count: int = 0
    retry_delay: float = 1.0
    parallel: bool = False
    max_workers: int = 4
    condition: str = None  # conditional execution
    on_error: FlowControl = FlowControl.CONTINUE
    error_handler: Callable = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class StageResult:
    """Stage execution result."""
    stage_name: str
    success: bool
    input_data: Any
    output_data: Any = None
    error: str = ""
    duration_ms: int = 0
    retries: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PipelineConfig:
    """Pipeline configuration."""
    name: str
    max_parallel: int = 4
    buffer_size: int = 100
    timeout: float = 3600.0
    error_strategy: FlowControl = FlowControl.CONTINUE
    enable_logging: bool = True
    enable_metrics: bool = True
    enable_streaming: bool = False


@dataclass
class PipelineStats:
    """Pipeline statistics."""
    total_executions: int = 0
    successful_executions: int = 0
    failed_executions: int = 0
    total_items_processed: int = 0
    total_duration_ms: int = 0
    avg_duration_ms: float = 0
    stage_stats: Dict[str, Dict] = field(default_factory=dict)


class PipelineStage:
    """Pipeline stage."""

    def __init__(self, config: StageConfig):
        self.config = config
        self._executor: Optional[ThreadPoolExecutor] = None
        if config.parallel:
            self._executor = ThreadPoolExecutor(max_workers=config.max_workers)

    async def execute(self, data: Any) -> StageResult:
        """Execute the stage."""
        start_time = time.time()
        stage_name = self.config.name
        retries = 0
        error_msg = ""

        # Retry loop
        while retries <= self.config.retry_count:
            try:
                if self.config.handler:
                    if asyncio.iscoroutinefunction(self.config.handler):
                        output = await self.config.handler(data)
                    else:
                        output = self.config.handler(data)
                else:
                    output = data

                duration = int((time.time() - start_time) * 1000)
                return StageResult(
                    stage_name=stage_name,
                    success=True,
                    input_data=data,
                    output_data=output,
                    duration_ms=duration,
                    retries=retries
                )
            except Exception as e:
                error_msg = str(e)
                retries += 1
                if retries <= self.config.retry_count:
                    time.sleep(self.config.retry_delay * retries)

        # All retries failed
        duration = int((time.time() - start_time) * 1000)

        # Try error handler if configured
        if self.config.error_handler:
            try:
                output = self.config.error_handler(data, error_msg)
                return StageResult(
                    stage_name=stage_name,
                    success=True,
                    input_data=data,
                    output_data=output,
                    error=error_msg,
                    duration_ms=duration,
                    retries=retries
                )
            except:
                pass

        return StageResult(
            stage_name=stage_name,
            success=False,
            input_data=data,
            error=error_msg,
            duration_ms=duration,
            retries=retries
        )

    def shutdown(self):
        """Shutdown the stage."""
        if self._executor:
            self._executor.shutdown(wait=False)


class AgentPipeline:
    """Agent processing pipeline."""

    def __init__(self, config: PipelineConfig):
        self.config = config
        self._stages: List[PipelineStage] = []
        self._stage_names: Dict[str, int] = {}
        self._state = PipelineState.IDLE
        self._stats = PipelineStats()
        self._lock = threading.RLock()
        self._current_execution = None

    def add_stage(self, config: StageConfig) -> 'AgentPipeline':
        """Add a stage to the pipeline."""
        with self._lock:
            stage = PipelineStage(config)
            self._stages.append(stage)
            self._stage_names[config.name] = len(self._stages) - 1
            return self

    def add_transform(self, name: str, handler: Callable) -> 'AgentPipeline':
        """Add a transform stage."""
        config = StageConfig(name=name, stage_type=StageType.TRANSFORM, handler=handler)
        return self.add_stage(config)

    def add_filter(self, name: str, handler: Callable) -> 'AgentPipeline':
        """Add a filter stage."""
        config = StageConfig(name=name, stage_type=StageType.FILTER, handler=handler)
        return self.add_stage(config)

    def add_validate(self, name: str, handler: Callable) -> 'AgentPipeline':
        """Add a validation stage."""
        config = StageConfig(name=name, stage_type=StageType.VALIDATE, handler=handler)
        return self.add_stage(config)

    def insert_stage(self, index: int, config: StageConfig) -> 'AgentPipeline':
        """Insert a stage at a specific index."""
        with self._lock:
            stage = PipelineStage(config)
            self._stages.insert(index, stage)
            # Rebuild name index
            self._stage_names.clear()
            for i, s in enumerate(self._stages):
                self._stage_names[s.config.name] = i
            return self

    def remove_stage(self, name: str) -> bool:
        """Remove a stage by name."""
        with self._lock:
            if name not in self._stage_names:
                return False
            index = self._stage_names[name]
            self._stages.pop(index)
            # Rebuild name index
            self._stage_names.clear()
            for i, s in enumerate(self._stages):
                self._stage_names[s.config.name] = i
            return True

    def get_stage(self, name: str) -> Optional[PipelineStage]:
        """Get a stage by name."""
        with self._lock:
            if name not in self._stage_names:
                return None
            return self._stages[self._stage_names[name]]

    async def execute(self, data: Any) -> Dict[str, StageResult]:
        """Execute the pipeline on data."""
        with self._lock:
            if self._state == PipelineState.RUNNING:
                raise RuntimeError("Pipeline already running")

            self._state = PipelineState.RUNNING
            self._stats.total_executions += 1
            results = {}
            current_data = data

        start_time = time.time()

        try:
            for stage in self._stages:
                result = await stage.execute(current_data)
                results[stage.config.name] = result

                if self.config.enable_metrics:
                    if stage.config.name not in self._stats.stage_stats:
                        self._stats.stage_stats[stage.config.name] = {
                            "executions": 0, "successes": 0, "failures": 0, "total_ms": 0
                        }
                    stats = self._stats.stage_stats[stage.config.name]
                    stats["executions"] += 1
                    stats["total_ms"] += result.duration_ms
                    if result.success:
                        stats["successes"] += 1
                    else:
                        stats["failures"] += 1

                if not result.success:
                    if self.config.error_strategy == FlowControl.STOP:
                        break
                    elif self.config.error_strategy == FlowControl.CONTINUE:
                        # Continue with original data
                        continue

                if result.output_data is not None:
                    current_data = result.output_data

        except Exception as e:
            self._state = PipelineState.FAILED
            self._stats.failed_executions += 1
            raise
        else:
            self._state = PipelineState.COMPLETED
            self._stats.successful_executions += 1

        self._stats.total_duration_ms += int((time.time() - start_time) * 1000)
        if self._stats.total_executions > 0:
            self._stats.avg_duration_ms = self._stats.total_duration_ms / self._stats.total_executions

        return results

    async def execute_parallel(self, data_list: List[Any]) -> List[Dict[str, StageResult]]:
        """Execute pipeline in parallel on multiple data items."""
        tasks = [self.execute(data) for data in data_list]
        return await asyncio.gather(*tasks, return_exceptions=True)

    async def execute_streaming(self, data_iter: AsyncIterator[Any]) -> AsyncIterator[Dict[str, StageResult]]:
        """Execute pipeline in streaming mode."""
        self._state = PipelineState.RUNNING
        try:
            async for data in data_iter:
                result = await self.execute(data)
                self._stats.total_items_processed += 1
                yield result
        finally:
            self._state = PipelineState.IDLE

    def execute_batch(self, data_list: List[Any]) -> List[Dict[str, StageResult]]:
        """Execute pipeline on a batch of data (sync version)."""
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(self.execute_parallel(data_list))
        finally:
            loop.close()

    def get_results(self) -> Dict:
        """Get pipeline results summary."""
        with self._lock:
            return {
                "name": self.config.name,
                "state": self._state.value,
                "stages": [s.config.name for s in self._stages],
                "stats": self._stats.__dict__,
                "stage_count": len(self._stages)
            }

    def get_stats(self) -> Dict:
        """Get detailed statistics."""
        with self._lock:
            return self._stats.__dict__

    def reset_stats(self):
        """Reset statistics."""
        with self._lock:
            self._stats = PipelineStats()

    def shutdown(self):
        """Shutdown the pipeline."""
        for stage in self._stages:
            stage.shutdown()
        self._state = PipelineState.IDLE


class PipelineBuilder:
    """Builder for creating pipelines."""

    def __init__(self, name: str):
        self._config = PipelineConfig(name=name)
        self._stages: List[StageConfig] = []

    def with_max_parallel(self, max_parallel: int) -> 'PipelineBuilder':
        self._config.max_parallel = max_parallel
        return self

    def with_buffer_size(self, buffer_size: int) -> 'PipelineBuilder':
        self._config.buffer_size = buffer_size
        return self

    def with_timeout(self, timeout: float) -> 'PipelineBuilder':
        self._config.timeout = timeout
        return self

    def with_error_strategy(self, strategy: FlowControl) -> 'PipelineBuilder':
        self._config.error_strategy = strategy
        return self

    def with_logging(self, enabled: bool) -> 'PipelineBuilder':
        self._config.enable_logging = enabled
        return self

    def with_metrics(self, enabled: bool) -> 'PipelineBuilder':
        self._config.enable_metrics = enabled
        return self

    def add_stage(self, config: StageConfig) -> 'PipelineBuilder':
        self._stages.append(config)
        return self

    def add_transform(self, name: str, handler: Callable, **kwargs) -> 'PipelineBuilder':
        config = StageConfig(name=name, stage_type=StageType.TRANSFORM, handler=handler, **kwargs)
        self._stages.append(config)
        return self

    def add_filter(self, name: str, handler: Callable, **kwargs) -> 'PipelineBuilder':
        config = StageConfig(name=name, stage_type=StageType.FILTER, handler=handler, **kwargs)
        self._stages.append(config)
        return self

    def add_validate(self, name: str, handler: Callable, **kwargs) -> 'PipelineBuilder':
        config = StageConfig(name=name, stage_type=StageType.VALIDATE, handler=handler, **kwargs)
        self._stages.append(config)
        return self

    def build(self) -> AgentPipeline:
        pipeline = AgentPipeline(self._config)
        for stage_config in self._stages:
            pipeline.add_stage(stage_config)
        return pipeline


class PipelineManager:
    """Manage multiple pipelines."""

    def __init__(self):
        self._lock = threading.RLock()
        self._pipelines: Dict[str, AgentPipeline] = {}
        self._stats = PipelineStats()

    def create_pipeline(self, config: PipelineConfig) -> AgentPipeline:
        """Create a new pipeline."""
        with self._lock:
            pipeline = AgentPipeline(config)
            self._pipelines[config.name] = pipeline
            return pipeline

    def get_pipeline(self, name: str) -> Optional[AgentPipeline]:
        """Get a pipeline by name."""
        with self._lock:
            return self._pipelines.get(name)

    def delete_pipeline(self, name: str) -> bool:
        """Delete a pipeline."""
        with self._lock:
            if name in self._pipelines:
                pipeline = self._pipelines[name]
                pipeline.shutdown()
                del self._pipelines[name]
                return True
            return False

    def list_pipelines(self) -> List[Dict]:
        """List all pipelines."""
        with self._lock:
            return [
                {"name": name, "state": p._state.value, "stages": len(p._stages)}
                for name, p in self._pipelines.items()
            ]

    def get_all_stats(self) -> Dict:
        """Get aggregated statistics."""
        with self._lock:
            total = PipelineStats()
            for pipeline in self._pipelines.values():
                stats = pipeline.get_stats()
                total.total_executions += stats.get("total_executions", 0)
                total.successful_executions += stats.get("successful_executions", 0)
                total.failed_executions += stats.get("failed_executions", 0)
                total.total_duration_ms += stats.get("total_duration_ms", 0)
            if total.total_executions > 0:
                total.avg_duration_ms = total.total_duration_ms / total.total_executions
            return total.__dict__


# Global pipeline manager
agent_pipeline_manager = PipelineManager()
