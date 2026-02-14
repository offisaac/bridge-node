"""BridgeNode Log Tailer - Real-time log file streaming"""
import asyncio
import os
import re
from typing import Optional, List, Callable


class LogTailer:
    """Real-time log file tailing with filtering."""

    def __init__(self):
        self.file_positions: dict = {}  # filepath -> last position
        self.filters: dict = {}  # filepath -> regex pattern

    def set_filter(self, filepath: str, pattern: Optional[str] = None):
        """Set regex filter for a file."""
        if pattern:
            self.filters[filepath] = re.compile(pattern)
        else:
            self.filters.pop(filepath, None)

    async def tail(
        self,
        filepath: str,
        lines: int = 100,
        callback: Optional[Callable] = None
    ) -> List[str]:
        """Read last N lines from a log file."""
        if not os.path.exists(filepath):
            return [f"File not found: {filepath}"]

        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                # Seek to end
                f.seek(0, 2)
                file_size = f.tell()

                # Read last lines
                if file_size > 0:
                    f.seek(max(0, file_size - 10000))
                    content = f.read()

                # Get last N lines
                all_lines = content.split('\n')
                last_lines = all_lines[-lines:] if len(all_lines) > lines else all_lines

                # Apply filter if set
                if filepath in self.filters:
                    pattern = self.filters[filepath]
                    last_lines = [l for l in last_lines if pattern.search(l)]

                # Store position
                self.file_positions[filepath] = file_size

                return last_lines
        except Exception as e:
            return [f"Error reading log: {str(e)}"]

    async def watch(self, filepath: str, callback: Callable[[str], None]):
        """Watch file for new lines (streaming)."""
        if not os.path.exists(filepath):
            return

        try:
            with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
                # Start from stored position or end
                start_pos = self.file_positions.get(filepath, 0)
                f.seek(start_pos)

                while True:
                    line = f.readline()
                    if line:
                        self.file_positions[filepath] = f.tell()

                        # Apply filter if set
                        if filepath in self.filters:
                            if not self.filters[filepath].search(line):
                                continue

                        await callback(line.rstrip())
                    else:
                        await asyncio.sleep(0.5)
        except Exception:
            pass


# Global tailer instance
log_tailer = LogTailer()
