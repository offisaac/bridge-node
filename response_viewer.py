"""Response Viewer Module

JSON/XML response viewer with syntax highlighting.
"""
import threading
import json
import xml.etree.ElementTree as ET
import re
import html
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid


class ContentType(str, Enum):
    """Content types."""
    JSON = "json"
    XML = "xml"
    HTML = "html"
    TEXT = "text"
    UNKNOWN = "unknown"


class Theme(str, Enum):
    """Syntax highlighting themes."""
    LIGHT = "light"
    DARK = "dark"
    MONOKAI = "monokai"
    GITHUB = "github"


@dataclass
class ResponseRecord:
    """Response record."""
    id: str
    content: str
    content_type: ContentType
    timestamp: float
    status_code: int = 0
    headers: Dict = field(default_factory=dict)
    metadata: Dict = field(default_factory=dict)


class ResponseViewer:
    """JSON/XML response viewer with syntax highlighting."""

    def __init__(self):
        self._lock = threading.RLock()
        self._responses: List[ResponseRecord] = []
        self._max_records = 1000

        # Syntax highlighting colors
        self._themes = {
            Theme.LIGHT: {
                "string": "#22863a",
                "number": "#005cc5",
                "boolean": "#d73a49",
                "null": "#6a737d",
                "key": "#032f62",
                "bracket": "#24292e",
                "tag": "#6f42c1",
                "attribute": "#005cc5",
                "text": "#24292e"
            },
            Theme.DARK: {
                "string": "#a5d6ff",
                "number": "#79c0ff",
                "boolean": "#ff7b72",
                "null": "#8b949e",
                "key": "#7ee787",
                "bracket": "#c9d1d9",
                "tag": "#ff7b72",
                "attribute": "#79c0ff",
                "text": "#c9d1d9"
            },
            Theme.MONOKAI: {
                "string": "#e6db74",
                "number": "#ae81ff",
                "boolean": "#f92672",
                "null": "#75715e",
                "key": "#a6e22e",
                "bracket": "#f8f8f2",
                "tag": "#f92672",
                "attribute": "#a6e22e",
                "text": "#f8f8f2"
            },
            Theme.GITHUB: {
                "string": "#032f62",
                "number": "#005cc5",
                "boolean": "#d73a49",
                "null": "#6a737d",
                "key": "#6f42c1",
                "bracket": "#24292e",
                "tag": "#22863a",
                "attribute": "#005cc5",
                "text": "#24292e"
            }
        }

    def add_response(
        self,
        content: str,
        content_type: ContentType = None,
        status_code: int = 0,
        headers: Dict = None,
        metadata: Dict = None
    ) -> str:
        """Add a response to view."""
        if content_type is None:
            content_type = self._detect_content_type(content)

        record_id = str(uuid.uuid4())[:12]

        record = ResponseRecord(
            id=record_id,
            content=content,
            content_type=content_type,
            timestamp=datetime.now().timestamp(),
            status_code=status_code,
            headers=headers or {},
            metadata=metadata or {}
        )

        with self._lock:
            self._responses.append(record)

            # Trim old records
            if len(self._responses) > self._max_records:
                self._responses = self._responses[-self._max_records:]

        return record_id

    def _detect_content_type(self, content: str) -> ContentType:
        """Detect content type from content."""
        content = content.strip()

        if content.startswith('{') or content.startswith('['):
            try:
                json.loads(content)
                return ContentType.JSON
            except:
                pass

        if content.startswith('<'):
            try:
                ET.fromstring(content)
                return ContentType.XML
            except:
                pass

        if content.startswith('<!DOCTYPE html') or content.startswith('<html'):
            return ContentType.HTML

        return ContentType.TEXT

    def format_json(self, content: str, theme: Theme = Theme.GITHUB) -> str:
        """Format JSON with syntax highlighting."""
        try:
            data = json.loads(content)
            formatted = json.dumps(data, indent=2, ensure_ascii=False)
        except:
            formatted = content

        colors = self._themes.get(theme, self._themes[Theme.GITHUB])

        # Escape HTML
        formatted = html.escape(formatted)

        # Apply highlighting
        # Strings
        formatted = re.sub(
            r'("(?:[^"\\]|\\.)*")',
            f'<span style="color:{colors["string"]}">\\1</span>',
            formatted
        )

        # Numbers
        formatted = re.sub(
            r'\b(-?\d+\.?\d*)\b',
            f'<span style="color:{colors["number"]}">\\1</span>',
            formatted
        )

        # Booleans
        formatted = re.sub(
            r'\b(true|false)\b',
            f'<span style="color:{colors["boolean"]}">\\1</span>',
            formatted
        )

        # Null
        formatted = re.sub(
            r'\bnull\b',
            f'<span style="color:{colors["null"]}">null</span>',
            formatted
        )

        # Keys (in JSON, keys are strings followed by colon)
        formatted = re.sub(
            r'("(?:[^"\\]|\\.)*")(\s*:)',
            f'<span style="color:{colors["key"]}">\\1</span>\\2',
            formatted
        )

        return formatted

    def format_xml(self, content: str, theme: Theme = Theme.GITHUB) -> str:
        """Format XML with syntax highlighting."""
        colors = self._themes.get(theme, self._themes[Theme.GITHUB])

        # Escape HTML first
        content = html.escape(content)

        # Pretty print if possible
        try:
            root = ET.fromstring(content)
            content = ET.tostring(root, encoding='unicode')
        except:
            pass

        # Apply highlighting

        # Tags
        content = re.sub(
            r'(&lt;/?)(\w+)(.*?)(&gt;)',
            f'\\1<span style="color:{colors["tag"]}">\\2</span>\\3\\4',
            content
        )

        # Attributes
        content = re.sub(
            r'(\s)(\w+)(=)',
            f'\\1<span style="color:{colors["attribute"]}">\\2</span>\\3',
            content
        )

        # Attribute values
        content = re.sub(
            r'(".*?")',
            f'<span style="color:{colors["string"]}">\\1</span>',
            content
        )

        return content

    def format_html(self, content: str, theme: Theme = Theme.GITHUB) -> str:
        """Format HTML with basic highlighting."""
        colors = self._themes.get(theme, self._themes[Theme.GITHUB])

        # Escape HTML
        content = html.escape(content)

        # Tags
        content = re.sub(
            r'(&lt;/?)(\w+)(.*?)(&gt;)',
            f'\\1<span style="color:{colors["tag"]}">\\2</span>\\3\\4',
            content
        )

        return content

    def format_plain(self, content: str) -> str:
        """Format plain text."""
        return html.escape(content)

    def format(
        self,
        content: str,
        content_type: ContentType = None,
        theme: Theme = Theme.GITHUB,
        wrap: bool = True
    ) -> str:
        """Format content with syntax highlighting."""
        if content_type is None:
            content_type = self._detect_content_type(content)

        if content_type == ContentType.JSON:
            formatted = self.format_json(content, theme)
        elif content_type == ContentType.XML:
            formatted = self.format_xml(content, theme)
        elif content_type == ContentType.HTML:
            formatted = self.format_html(content, theme)
        else:
            formatted = self.format_plain(content)

        # Wrap in container
        if wrap:
            colors = self._themes.get(theme, self._themes[Theme.GITHUB])
            formatted = f'''<div style="background:#f6f8fa;padding:15px;border-radius:5px;font-family:monospace;white-space:pre-wrap;word-break:break-all;color:{colors['text']}">{formatted}</div>'''

        return formatted

    def get_html_viewer(
        self,
        content: str,
        content_type: ContentType = None,
        theme: Theme = Theme.GITHUB,
        title: str = "Response Viewer"
    ) -> str:
        """Get complete HTML viewer page."""
        formatted = self.format(content, content_type, theme)
        colors = self._themes.get(theme, self._themes[Theme.GITHUB])

        theme_options = "".join(
            f'<option value="{t.value}" {"selected" if t == theme else ""}>{t.value}</option>'
            for t in Theme
        )

        return f'''<!DOCTYPE html>
<html>
<head>
    <title>{title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #fff; }}
        .header {{ display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }}
        .title {{ font-size: 24px; font-weight: bold; color: #24292e; }}
        .controls {{ display: flex; gap: 10px; align-items: center; }}
        select, button {{ padding: 8px 12px; border: 1px solid #d1d5da; border-radius: 6px; background: #fff; cursor: pointer; }}
        button:hover {{ background: #f6f8fa; }}
        #viewer {{ background: #f6f8fa; padding: 15px; border-radius: 6px; overflow: auto; }}
        .info {{ margin-top: 15px; color: #666; font-size: 14px; }}
    </style>
</head>
<body>
    <div class="header">
        <div class="title">{title}</div>
        <div class="controls">
            <select id="theme" onchange="updateTheme()">
                {theme_options}
            </select>
            <button onclick="copyContent()">Copy</button>
        </div>
    </div>
    <div id="viewer">{formatted}</div>
    <div class="info">Content type: {content_type or 'auto-detected'}</div>

    <script>
        const originalContent = `{re.sub(r'`', r'\\`', content)}`;

        function updateTheme() {{
            const theme = document.getElementById('theme').value;
            // In real implementation, would re-render with new theme
            alert('Theme would change to: ' + theme);
        }}

        function copyContent() {{
            navigator.clipboard.writeText(originalContent).then(() => {{
                alert('Copied to clipboard!');
            }});
        }}
    </script>
</body>
</html>'''

    def get_response(self, record_id: str) -> Optional[Dict]:
        """Get a response record."""
        with self._lock:
            for record in self._responses:
                if record.id == record_id:
                    return {
                        "id": record.id,
                        "content": record.content,
                        "content_type": record.content_type.value,
                        "timestamp": record.timestamp,
                        "status_code": record.status_code,
                        "headers": record.headers,
                        "metadata": record.metadata
                    }
        return None

    def get_responses(
        self,
        content_type: ContentType = None,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """Get response records."""
        with self._lock:
            records = list(self._responses)

        if content_type:
            records = [r for r in records if r.content_type == content_type]

        records.sort(key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "id": r.id,
                "content_type": r.content_type.value,
                "timestamp": r.timestamp,
                "status_code": r.status_code,
                "preview": r.content[:100] + "..." if len(r.content) > 100 else r.content
            }
            for r in records[offset:offset + limit]
        ]

    def minify_json(self, content: str) -> str:
        """Minify JSON."""
        try:
            data = json.loads(content)
            return json.dumps(data, separators=(',', ':'))
        except:
            return content

    def prettify_json(self, content: str, indent: int = 2) -> str:
        """Prettify JSON with custom indent."""
        try:
            data = json.loads(content)
            return json.dumps(data, indent=indent, ensure_ascii=False)
        except:
            return content

    def get_stats(self) -> Dict:
        """Get viewer statistics."""
        with self._lock:
            total = len(self._responses)
            by_type = {}

            for record in self._responses:
                ct = record.content_type.value
                by_type[ct] = by_type.get(ct, 0) + 1

            return {
                "total_responses": total,
                "by_content_type": by_type
            }


# Global response viewer
response_viewer = ResponseViewer()
