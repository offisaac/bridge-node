"""BridgeNode File Transfer - Upload/Download with chunking support"""
import os
import uuid
import asyncio
import aiofiles
import json
import time
from typing import Dict, Optional, List, Set
from fastapi import UploadFile

from config import UPLOAD_DIR, CHUNK_SIZE


class FileTransfer:
    """Handle file upload/download operations with chunking support."""

    def __init__(self):
        self.uploads: Dict[str, Dict] = {}  # upload_id -> metadata (in-memory for active uploads)
        self.temp_dir = os.path.join(os.path.dirname(__file__), "temp_uploads")
        os.makedirs(self.temp_dir, exist_ok=True)

    def _get_chunk_dir(self, upload_id: str) -> str:
        """Get directory for storing chunks."""
        return os.path.join(self.temp_dir, upload_id)

    def _get_chunk_path(self, upload_id: str, chunk_index: int) -> str:
        """Get path for a specific chunk file."""
        return os.path.join(self._get_chunk_dir(upload_id), f"chunk_{chunk_index}")

    def _get_metadata_path(self, upload_id: str) -> str:
        """Get path for upload metadata."""
        return os.path.join(self._get_chunk_dir(upload_id), "metadata.json")

    def _save_metadata(self, upload_id: str, metadata: Dict) -> None:
        """Save upload metadata to disk."""
        meta_path = self._get_metadata_path(upload_id)
        with open(meta_path, 'w') as f:
            json.dump(metadata, f)

    def _load_metadata(self, upload_id: str) -> Optional[Dict]:
        """Load upload metadata from disk."""
        meta_path = self._get_metadata_path(upload_id)
        if os.path.exists(meta_path):
            with open(meta_path, 'r') as f:
                return json.load(f)
        return None

    async def init_upload(self, filename: str, total_size: int, chunk_size: int = 1024 * 1024) -> str:
        """Initialize a chunked upload and return upload_id.

        Args:
            filename: Name of the file being uploaded
            total_size: Total size in bytes
            chunk_size: Size of each chunk (default 1MB)

        Returns:
            upload_id: Unique identifier for this upload session
        """
        upload_id = str(uuid.uuid4())
        chunk_dir = self._get_chunk_dir(upload_id)
        os.makedirs(chunk_dir, exist_ok=True)

        metadata = {
            "upload_id": upload_id,
            "filename": filename,
            "total_size": total_size,
            "chunk_size": chunk_size,
            "total_chunks": (total_size + chunk_size - 1) // chunk_size,
            "uploaded_chunks": [],  # List of chunk indices that have been uploaded
            "received": 0,
            "created_at": time.time(),
            "status": "in_progress"
        }

        self.uploads[upload_id] = metadata
        self._save_metadata(upload_id, metadata)

        return upload_id

    async def upload_chunk(
        self,
        upload_id: str,
        chunk_index: int,
        chunk: bytes
    ) -> Dict:
        """Upload a single chunk.

        Args:
            upload_id: Upload session ID
            chunk_index: Index of this chunk (0-based)
            chunk: Binary content of the chunk

        Returns:
            Progress information dict
        """
        # Check if upload exists in memory or load from disk
        if upload_id not in self.uploads:
            metadata = self._load_metadata(upload_id)
            if metadata is None:
                return {"error": "Invalid upload_id"}
            self.uploads[upload_id] = metadata

        upload = self.uploads[upload_id]
        chunk_dir = self._get_chunk_dir(upload_id)
        os.makedirs(chunk_dir, exist_ok=True)

        # Save chunk to disk (for resume support)
        chunk_path = self._get_chunk_path(upload_id, chunk_index)
        async with aiofiles.open(chunk_path, 'wb') as f:
            await f.write(chunk)

        # Update metadata
        if chunk_index not in upload.get("uploaded_chunks", []):
            upload.setdefault("uploaded_chunks", []).append(chunk_index)
            upload["received"] += len(chunk)

        upload["status"] = "in_progress"
        self._save_metadata(upload_id, upload)

        return {
            "upload_id": upload_id,
            "chunk_index": chunk_index,
            "chunk_size": len(chunk),
            "received": upload["received"],
            "total": upload["total_size"],
            "progress": upload["received"] / upload["total_size"] * 100 if upload["total_size"] > 0 else 0,
            "uploaded_chunks": len(upload.get("uploaded_chunks", [])),
            "total_chunks": upload.get("total_chunks", 0)
        }

    async def upload_chunks_concurrent(
        self,
        upload_id: str,
        chunks: Dict[int, bytes]
    ) -> Dict:
        """Upload multiple chunks concurrently.

        Args:
            upload_id: Upload session ID
            chunks: Dict of {chunk_index: chunk_data}

        Returns:
            Combined progress information
        """
        # Create coroutines for all chunks
        tasks = [
            self.upload_chunk(upload_id, idx, data)
            for idx, data in chunks.items()
        ]

        # Execute concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Check for errors
        errors = [str(r) for r in results if isinstance(r, Exception)]
        if errors:
            return {"error": "; ".join(errors), "partial_results": results}

        # Return combined progress
        if upload_id in self.uploads:
            upload = self.uploads[upload_id]
            return {
                "upload_id": upload_id,
                "received": upload["received"],
                "total": upload["total_size"],
                "progress": upload["received"] / upload["total_size"] * 100 if upload["total_size"] > 0 else 0,
                "uploaded_chunks": len(upload.get("uploaded_chunks", [])),
                "total_chunks": upload.get("total_chunks", 0)
            }

        return {"error": "Upload not found"}

    async def get_upload_status(self, upload_id: str) -> Dict:
        """Get upload progress status.

        Args:
            upload_id: Upload session ID

        Returns:
            Status information including list of uploaded chunks
        """
        # Try memory first, then disk
        if upload_id not in self.uploads:
            metadata = self._load_metadata(upload_id)
            if metadata is None:
                return {"error": "Upload not found", "upload_id": upload_id}
            self.uploads[upload_id] = metadata

        upload = self.uploads[upload_id]

        # Scan chunk directory to verify uploaded chunks
        chunk_dir = self._get_chunk_dir(upload_id)
        if os.path.exists(chunk_dir):
            existing_chunks = []
            for f in os.listdir(chunk_dir):
                if f.startswith("chunk_"):
                    try:
                        idx = int(f.split("_")[1])
                        existing_chunks.append(idx)
                    except (ValueError, IndexError):
                        pass
            upload["uploaded_chunks"] = sorted(existing_chunks)
            upload["received"] = sum(
                os.path.getsize(os.path.join(chunk_dir, f))
                for f in os.listdir(chunk_dir)
                if f.startswith("chunk_")
            )

        return {
            "upload_id": upload_id,
            "filename": upload.get("filename"),
            "status": upload.get("status", "unknown"),
            "received": upload.get("received", 0),
            "total": upload.get("total_size", 0),
            "progress": upload["received"] / upload["total_size"] * 100 if upload.get("total_size", 0) > 0 else 0,
            "uploaded_chunks": upload.get("uploaded_chunks", []),
            "total_chunks": upload.get("total_chunks", 0),
            "created_at": upload.get("created_at")
        }

    def get_uploaded_chunks(self, upload_id: str) -> List[int]:
        """Get list of uploaded chunk indices (for resume support)."""
        if upload_id in self.uploads:
            return self.uploads[upload_id].get("uploaded_chunks", [])

        # Load from disk
        metadata = self._load_metadata(upload_id)
        if metadata:
            chunk_dir = self._get_chunk_dir(upload_id)
            if os.path.exists(chunk_dir):
                chunks = []
                for f in os.listdir(chunk_dir):
                    if f.startswith("chunk_"):
                        try:
                            idx = int(f.split("_")[1])
                            chunks.append(idx)
                        except (ValueError, IndexError):
                            pass
                return sorted(chunks)

        return []

    async def complete_upload(self, upload_id: str) -> Dict:
        """Combine chunks and finalize upload.

        Args:
            upload_id: Upload session ID

        Returns:
            Final file information
        """
        if upload_id not in self.uploads:
            metadata = self._load_metadata(upload_id)
            if metadata is None:
                return {"error": "Invalid upload_id"}
            self.uploads[upload_id] = metadata

        upload = self.uploads[upload_id]
        chunk_dir = self._get_chunk_dir(upload_id)
        final_path = os.path.join(UPLOAD_DIR, f"{upload_id}_{upload['filename']}")

        os.makedirs(UPLOAD_DIR, exist_ok=True)

        # Get all chunk files and sort by index
        chunk_files = []
        for f in os.listdir(chunk_dir):
            if f.startswith("chunk_"):
                try:
                    idx = int(f.split("_")[1])
                    chunk_files.append((idx, os.path.join(chunk_dir, f)))
                except (ValueError, IndexError):
                    pass

        chunk_files.sort(key=lambda x: x[0])

        # Merge chunks into final file
        async with aiofiles.open(final_path, 'wb') as dest:
            for idx, chunk_path in chunk_files:
                async with aiofiles.open(chunk_path, 'rb') as src:
                    await dest.write(await src.read())

        result = {
            "filename": upload["filename"],
            "size": upload["received"],
            "filepath": final_path,
            "upload_id": upload_id
        }

        # Update status and cleanup
        upload["status"] = "completed"
        self._save_metadata(upload_id, upload)

        # Clean up chunk files (optional: keep for debugging)
        # import shutil
        # shutil.rmtree(chunk_dir, ignore_errors=True)

        # Remove from memory
        del self.uploads[upload_id]

        return result

    async def cancel_upload(self, upload_id: str) -> Dict:
        """Cancel and clean up an upload."""
        if upload_id in self.uploads:
            del self.uploads[upload_id]

        # Clean up chunk directory
        chunk_dir = self._get_chunk_dir(upload_id)
        if os.path.exists(chunk_dir):
            import shutil
            shutil.rmtree(chunk_dir, ignore_errors=True)

        return {"success": True, "upload_id": upload_id, "status": "cancelled"}

    async def download_file(self, filepath: str) -> Optional[bytes]:
        """Read file for download."""
        if not os.path.exists(filepath):
            return None

        async with aiofiles.open(filepath, 'rb') as f:
            return await f.read()

    def list_files(self, directory: str = UPLOAD_DIR) -> List[Dict]:
        """List files in upload directory."""
        if not os.path.exists(directory):
            return []

        files = []
        for f in os.listdir(directory):
            fp = os.path.join(directory, f)
            if os.path.isfile(fp):
                files.append({
                    "name": f,
                    "size": os.path.getsize(fp),
                    "modified": os.path.getmtime(fp)
                })
        return files


# Global file transfer instance
file_transfer = FileTransfer()
