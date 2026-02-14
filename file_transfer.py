"""BridgeNode File Transfer - Upload/Download with chunking support"""
import os
import uuid
import aiofiles
from typing import Dict, Optional, List
from fastapi import UploadFile

from config import UPLOAD_DIR, CHUNK_SIZE


class FileTransfer:
    """Handle file upload/download operations."""

    def __init__(self):
        self.uploads: Dict[str, Dict] = {}  # upload_id -> metadata

    async def init_upload(self, filename: str, total_size: int) -> str:
        """Initialize a chunked upload and return upload_id."""
        upload_id = str(uuid.uuid4())
        self.uploads[upload_id] = {
            "filename": filename,
            "total_size": total_size,
            "received": 0,
            "chunks": {},
            "filepath": os.path.join(UPLOAD_DIR, f"{upload_id}_{filename}")
        }
        return upload_id

    async def upload_chunk(
        self,
        upload_id: str,
        chunk_index: int,
        chunk: bytes
    ) -> Dict:
        """Upload a single chunk."""
        if upload_id not in self.uploads:
            return {"error": "Invalid upload_id"}

        upload = self.uploads[upload_id]
        upload["chunks"][chunk_index] = chunk
        upload["received"] += len(chunk)

        return {
            "received": upload["received"],
            "total": upload["total_size"],
            "progress": upload["received"] / upload["total_size"] * 100
        }

    async def complete_upload(self, upload_id: str) -> Dict:
        """Combine chunks and finalize upload."""
        if upload_id not in self.uploads:
            return {"error": "Invalid upload_id"}

        upload = self.uploads[upload_id]

        # Write all chunks to file
        async with aiofiles.open(upload["filepath"], 'wb') as f:
            for i in sorted(upload["chunks"].keys()):
                await f.write(upload["chunks"][i])

        result = {
            "filename": upload["filename"],
            "size": upload["received"],
            "filepath": upload["filepath"]
        }

        # Cleanup
        del self.uploads[upload_id]

        return result

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
