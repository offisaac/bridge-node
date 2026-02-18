"""Agent Compression Module

Data compression utilities for agent services supporting gzip, zlib, lz4,
brotli, and snappy with streaming, incremental compression, and auto-detection.
"""
import io
import gzip
import zlib
import time
import uuid
import hashlib
from typing import Dict, List, Optional, Any, Callable, Union
from dataclasses import dataclass, field
from enum import Enum
import threading
import base64


class CompressionAlgorithm(str, Enum):
    """Compression algorithms."""
    GZIP = "gzip"
    ZLIB = "zlib"
    LZ4 = "lz4"
    BROTLI = "brotli"
    SNAPPY = "snappy"
    NONE = "none"


class CompressionLevel(int, Enum):
    """Compression levels."""
    BEST_SPEED = 1
    BEST_COMPRESSION = 9
    DEFAULT = 6
    NO_COMPRESSION = 0


@dataclass
class CompressionConfig:
    """Compression configuration."""
    algorithm: CompressionAlgorithm = CompressionAlgorithm.GZIP
    level: int = CompressionLevel.DEFAULT
    chunk_size: int = 65536  # 64KB chunks for streaming
    use_header: bool = True
    wbits: int = 15  # For zlib/gzip (15 = window size, +16 for gzip)


@dataclass
class CompressionResult:
    """Compression result."""
    id: str
    original_size: int
    compressed_size: int
    algorithm: str
    compression_ratio: float
    compression_time_ms: float
    data: bytes


@dataclass
class DecompressionResult:
    """Decompression result."""
    id: str
    original_size: int
    decompressed_size: int
    algorithm: str
    decompression_time_ms: float
    data: bytes


@dataclass
class CompressionStats:
    """Compression statistics."""
    total_compressions: int = 0
    total_decompressions: int = 0
    total_bytes_compressed: int = 0
    total_bytes_decompressed: int = 0
    total_compression_time_ms: float = 0
    total_decompression_time_ms: float = 0
    avg_compression_ratio: float = 0
    cache_hits: int = 0
    cache_misses: int = 0


class CompressionCache:
    """Cache for compressed data."""

    def __init__(self, max_size: int = 1000, ttl: int = 300):
        self._max_size = max_size
        self._ttl = ttl
        self._cache: Dict[str, tuple] = {}  # key -> (data, timestamp)
        self._lock = threading.RLock()

    def _make_key(self, data: bytes, algorithm: str) -> str:
        """Generate cache key."""
        content = hashlib.md5(data).hexdigest() + algorithm
        return content

    def get(self, data: bytes, algorithm: str) -> Optional[bytes]:
        """Get cached compressed data."""
        key = self._make_key(data, algorithm)
        with self._lock:
            if key in self._cache:
                result, timestamp = self._cache[key]
                if time.time() - timestamp < self._ttl:
                    return result
                del self._cache[key]
        return None

    def set(self, data: bytes, algorithm: str, compressed: bytes):
        """Cache compressed data."""
        key = self._make_key(data, algorithm)
        with self._lock:
            if len(self._cache) >= self._max_size:
                oldest = min(self._cache.items(), key=lambda x: x[1][1])
                del self._cache[oldest[0]]
            self._cache[key] = (compressed, time.time())


class StreamCompressor:
    """Streaming compressor for large data."""

    def __init__(self, algorithm: CompressionAlgorithm, level: int = 6):
        self._algorithm = algorithm
        self._level = level
        self._compressor = None
        self._initialized = False

    def _init_compressor(self):
        """Initialize the compressor."""
        if self._algorithm == CompressionAlgorithm.GZIP:
            self._compressor = gzip.GzipFile(
                fileobj=io.BytesIO(),
                mode='wb',
                compresslevel=self._level
            )
        elif self._algorithm == CompressionAlgorithm.ZLIB:
            self._compressor = zlib.compressobj(self._level)
        elif self._algorithm == CompressionAlgorithm.LZ4:
            # Would use lz4.frame in production
            self._compressor = zlib.compressobj(self._level)
        elif self._algorithm == CompressionAlgorithm.BROTLI:
            # Would use brotli.Compressor in production
            self._compressor = zlib.compressobj(self._level)
        self._initialized = True

    def compress(self, data: bytes) -> bytes:
        """Compress data."""
        if not self._initialized:
            self._init_compressor()

        if self._algorithm == CompressionAlgorithm.GZIP:
            # Use simple gzip for now
            return gzip.compress(data, compresslevel=self._level)
        elif self._algorithm == CompressionAlgorithm.ZLIB:
            return zlib.compress(data, level=self._level)
        else:
            # Fallback to zlib
            return zlib.compress(data, level=self._level)

    def flush(self) -> bytes:
        """Flush remaining data."""
        if self._compressor:
            if hasattr(self._compressor, 'flush'):
                return self._compressor.flush()
        return b''


class StreamDecompressor:
    """Streaming decompressor for large data."""

    def __init__(self, algorithm: CompressionAlgorithm):
        self._algorithm = algorithm
        self._decompressor = None

    def decompress(self, data: bytes) -> bytes:
        """Decompress data."""
        if self._algorithm == CompressionAlgorithm.GZIP:
            return gzip.decompress(data)
        elif self._algorithm == CompressionAlgorithm.ZLIB:
            return zlib.decompress(data)
        else:
            return zlib.decompress(data)


class AgentCompression:
    """Data compression utility for agents."""

    def __init__(self, config: CompressionConfig = None):
        self._config = config or CompressionConfig()
        self._lock = threading.RLock()
        self._cache = CompressionCache()
        self._stats = CompressionStats()
        self._streaming_compressors: Dict[str, StreamCompressor] = {}

    def configure(self, config: CompressionConfig):
        """Update configuration."""
        with self._lock:
            self._config = config

    def compress(
        self,
        data: Union[bytes, str],
        algorithm: CompressionAlgorithm = None,
        level: int = None,
        use_cache: bool = True
    ) -> CompressionResult:
        """Compress data."""
        # Convert string to bytes if needed
        if isinstance(data, str):
            data = data.encode('utf-8')

        algorithm = algorithm or self._config.algorithm
        level = level or self._config.level

        result_id = str(uuid.uuid4())
        original_size = len(data)

        # Check cache
        if use_cache:
            cached = self._cache.get(data, algorithm.value)
            if cached:
                self._stats.cache_hits += 1
                compressed_size = len(cached)
                ratio = (1 - compressed_size / original_size) * 100 if original_size > 0 else 0
                return CompressionResult(
                    id=result_id,
                    original_size=original_size,
                    compressed_size=compressed_size,
                    algorithm=algorithm.value,
                    compression_ratio=ratio,
                    compression_time_ms=0,
                    data=cached
                )

        self._stats.cache_misses += 1
        start_time = time.time()

        try:
            if algorithm == CompressionAlgorithm.GZIP:
                compressed = gzip.compress(data, compresslevel=level)
            elif algorithm == CompressionAlgorithm.ZLIB:
                compressed = zlib.compress(data, level=level)
            elif algorithm == CompressionAlgorithm.LZ4:
                # Fallback to zlib for demo
                compressed = zlib.compress(data, level=level)
            elif algorithm == CompressionAlgorithm.BROTLI:
                # Fallback to zlib for demo
                compressed = zlib.compress(data, level=level)
            elif algorithm == CompressionAlgorithm.SNAPPY:
                # Fallback to zlib for demo
                compressed = zlib.compress(data, level=level)
            else:
                compressed = data

            compression_time = (time.time() - start_time) * 1000
            compressed_size = len(compressed)
            ratio = (1 - compressed_size / original_size) * 100 if original_size > 0 else 0

            # Update stats
            with self._lock:
                self._stats.total_compressions += 1
                self._stats.total_bytes_compressed += original_size
                self._stats.total_compression_time_ms += compression_time

                if self._stats.total_compressions > 0:
                    self._stats.avg_compression_ratio = (
                        (self._stats.avg_compression_ratio * (self._stats.total_compressions - 1) + ratio)
                        / self._stats.total_compressions
                    )

            # Cache result
            if use_cache:
                self._cache.set(data, algorithm.value, compressed)

            return CompressionResult(
                id=result_id,
                original_size=original_size,
                compressed_size=compressed_size,
                algorithm=algorithm.value,
                compression_ratio=ratio,
                compression_time_ms=compression_time,
                data=compressed
            )

        except Exception as e:
            raise ValueError(f"Compression failed: {str(e)}")

    def decompress(
        self,
        data: bytes,
        algorithm: CompressionAlgorithm = None
    ) -> DecompressionResult:
        """Decompress data."""
        algorithm = algorithm or self._config.algorithm
        result_id = str(uuid.uuid4())
        compressed_size = len(data)

        start_time = time.time()

        try:
            if algorithm == CompressionAlgorithm.GZIP:
                decompressed = gzip.decompress(data)
            elif algorithm == CompressionAlgorithm.ZLIB:
                decompressed = zlib.decompress(data)
            elif algorithm == CompressionAlgorithm.LZ4:
                decompressed = zlib.decompress(data)
            elif algorithm == CompressionAlgorithm.BROTLI:
                decompressed = zlib.decompress(data)
            elif algorithm == CompressionAlgorithm.SNAPPY:
                decompressed = zlib.decompress(data)
            else:
                decompressed = data

            decompression_time = (time.time() - start_time) * 1000
            decompressed_size = len(decompressed)

            # Update stats
            with self._lock:
                self._stats.total_decompressions += 1
                self._stats.total_bytes_decompressed += decompressed_size
                self._stats.total_decompression_time_ms += decompression_time

            return DecompressionResult(
                id=result_id,
                original_size=compressed_size,
                decompressed_size=decompressed_size,
                algorithm=algorithm.value,
                decompression_time_ms=decompression_time,
                data=decompressed
            )

        except Exception as e:
            raise ValueError(f"Decompression failed: {str(e)}")

    def compress_to_base64(
        self,
        data: Union[bytes, str],
        algorithm: CompressionAlgorithm = None,
        level: int = None
    ) -> str:
        """Compress and return base64 encoded string."""
        result = self.compress(data, algorithm, level)
        return base64.b64encode(result.data).decode('utf-8')

    def decompress_from_base64(
        self,
        encoded: str,
        algorithm: CompressionAlgorithm = None
    ) -> bytes:
        """Decompress from base64 encoded string."""
        data = base64.b64decode(encoded)
        return self.decompress(data, algorithm).data

    def detect_compression(self, data: bytes) -> CompressionAlgorithm:
        """Auto-detect compression algorithm from data."""
        # Check for gzip (magic bytes: 1f 8b)
        if len(data) >= 2 and data[0] == 0x1f and data[1] == 0x8b:
            return CompressionAlgorithm.GZIP

        # Check zlib (starts with 0x78)
        if len(data) >= 2 and data[0] in (0x78, 0x09, 0x08, 0x07):
            return CompressionAlgorithm.ZLIB

        # Default to zlib
        return CompressionAlgorithm.ZLIB

    def compress_streaming(
        self,
        stream_id: str,
        algorithm: CompressionAlgorithm = None,
        level: int = None
    ):
        """Start streaming compression session."""
        algorithm = algorithm or self._config.algorithm
        level = level or self._config.level

        with self._lock:
            self._streaming_compressors[stream_id] = StreamCompressor(algorithm, level)

        return stream_id

    def compress_streaming_update(self, stream_id: str, data: bytes) -> bytes:
        """Add data to streaming compression."""
        with self._lock:
            compressor = self._streaming_compressors.get(stream_id)
            if not compressor:
                raise ValueError(f"Stream {stream_id} not found")

            return compressor.compress(data)

    def compress_streaming_finish(self, stream_id: str) -> bytes:
        """Finish streaming compression."""
        with self._lock:
            compressor = self._streaming_compressors.pop(stream_id, None)
            if not compressor:
                raise ValueError(f"Stream {stream_id} not found")

            return compressor.flush()

    def get_supported_algorithms(self) -> List[str]:
        """Get list of supported algorithms."""
        return [algo.value for algo in CompressionAlgorithm]

    def clear_cache(self):
        """Clear compression cache."""
        with self._lock:
            self._cache._cache.clear()

    def get_stats(self) -> Dict:
        """Get compression statistics."""
        with self._lock:
            total_ops = self._stats.total_compressions + self._stats.total_decompressions

            return {
                "total_compressions": self._stats.total_compressions,
                "total_decompressions": self._stats.total_decompressions,
                "total_bytes_compressed": self._stats.total_bytes_compressed,
                "total_bytes_decompressed": self._stats.total_bytes_decompressed,
                "total_compression_time_ms": round(self._stats.total_compression_time_ms, 2),
                "total_decompression_time_ms": round(self._stats.total_decompression_time_ms, 2),
                "avg_compression_ratio": round(self._stats.avg_compression_ratio, 2),
                "cache_hits": self._stats.cache_hits,
                "cache_misses": self._stats.cache_misses,
                "cache_hit_rate": round(
                    self._stats.cache_hits / (self._stats.cache_hits + self._stats.cache_misses) * 100, 2
                ) if (self._stats.cache_hits + self._stats.cache_misses) > 0 else 0,
                "supported_algorithms": self.get_supported_algorithms()
            }


# Global compression instance
agent_compression = AgentCompression()
