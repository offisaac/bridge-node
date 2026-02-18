"""Data Export Module

Multi-format data export service.
"""
import threading
import time
import json
import csv
import io
import xml.etree.ElementTree as ET
from typing import Dict, List, Any, Optional, Union
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid
import base64
import zipfile


class ExportFormat(str, Enum):
    """Export formats."""
    JSON = "json"
    CSV = "csv"
    XML = "xml"
    YAML = "yaml"
    TSV = "tsv"
    HTML = "html"
    MARKDOWN = "markdown"
    PDF = "pdf"
    XLSX = "xlsx"
    ZIP = "zip"


class CompressionType(str, Enum):
    """Compression types."""
    NONE = "none"
    ZIP = "zip"
    GZIP = "gzip"
    BZIP2 = "bzip2"


@dataclass
class ExportJob:
    """Export job."""
    id: str
    format: ExportFormat
    data: List[Dict]
    created_at: float
    status: str = "pending"
    completed_at: Optional[float] = None
    file_size: int = 0
    metadata: Dict = field(default_factory=dict)


@dataclass
class ExportTemplate:
    """Export template."""
    id: str
    name: str
    format: ExportFormat
    columns: List[str]
    filters: Dict = field(default_factory=dict)
    transformations: List[Dict] = field(default_factory=list)


class DataExporter:
    """Multi-format data export service."""

    def __init__(self):
        self._lock = threading.RLock()
        self._jobs: Dict[str, ExportJob] = {}
        self._templates: Dict[str, ExportTemplate] = {}
        self._export_handlers = {
            ExportFormat.JSON: self._export_json,
            ExportFormat.CSV: self._export_csv,
            ExportFormat.XML: self._export_xml,
            ExportFormat.YAML: self._export_yaml,
            ExportFormat.TSV: self._export_tsv,
            ExportFormat.HTML: self._export_html,
            ExportFormat.MARKDOWN: self._export_markdown,
        }

    def create_job(
        self,
        data: List[Dict],
        export_format: ExportFormat,
        metadata: Dict = None
    ) -> str:
        """Create an export job."""
        job_id = str(uuid.uuid4())[:12]

        job = ExportJob(
            id=job_id,
            format=export_format,
            data=data,
            created_at=time.time(),
            metadata=metadata or {}
        )

        with self._lock:
            self._jobs[job_id] = job

        return job_id

    def execute_job(self, job_id: str) -> Optional[str]:
        """Execute an export job."""
        with self._lock:
            if job_id not in self._jobs:
                return None
            job = self._jobs[job_id]

        # Get handler
        handler = self._export_handlers.get(job.format)
        if not handler:
            return None

        # Execute export
        try:
            result = handler(job.data)
            job.status = "completed"
            job.completed_at = time.time()
            job.file_size = len(result) if isinstance(result, str) else len(result.get("content", ""))
            return result
        except Exception as e:
            job.status = "failed"
            job.metadata["error"] = str(e)
            return None

    def export_data(
        self,
        data: List[Dict],
        export_format: ExportFormat,
        filename: str = None,
        metadata: Dict = None
    ) -> Dict:
        """Export data in specified format."""
        job_id = self.create_job(data, export_format, metadata)
        result = self.execute_job(job_id)

        if not result:
            return {"error": "Export failed"}

        if isinstance(result, dict):
            return {
                "job_id": job_id,
                "content": result.get("content", ""),
                "mime_type": result.get("mime_type", "text/plain"),
                "filename": filename or f"export.{export_format.value}",
                "size": len(result.get("content", ""))
            }
        else:
            return {
                "job_id": job_id,
                "content": result,
                "mime_type": self._get_mime_type(export_format),
                "filename": filename or f"export.{export_format.value}",
                "size": len(result)
            }

    def _export_json(self, data: List[Dict]) -> Dict:
        """Export as JSON."""
        content = json.dumps(data, indent=2, default=str)
        return {"content": content, "mime_type": "application/json"}

    def _export_csv(self, data: List[Dict]) -> Dict:
        """Export as CSV."""
        if not data:
            return {"content": "", "mime_type": "text/csv"}

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)

        return {"content": output.getvalue(), "mime_type": "text/csv"}

    def _export_tsv(self, data: List[Dict]) -> Dict:
        """Export as TSV."""
        if not data:
            return {"content": "", "mime_type": "text/tab-separated-values"}

        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=data[0].keys(), delimiter="\t")
        writer.writeheader()
        writer.writerows(data)

        return {"content": output.getvalue(), "mime_type": "text/tab-separated-values"}

    def _export_xml(self, data: List[Dict]) -> Dict:
        """Export as XML."""
        root = ET.Element("data")
        for item in data:
            row = ET.SubElement(root, "record")
            for key, value in item.items():
                child = ET.SubElement(row, key)
                child.text = str(value)

        content = ET.tostring(root, encoding="unicode")
        return {"content": content, "mime_type": "application/xml"}

    def _export_yaml(self, data: List[Dict]) -> Dict:
        """Export as YAML (simplified)."""
        lines = []
        for i, item in enumerate(data):
            if i > 0:
                lines.append("")
            lines.append(f"- {json.dumps(item)}")

        content = "\n".join(lines)
        return {"content": content, "mime_type": "text/yaml"}

    def _export_html(self, data: List[Dict]) -> Dict:
        """Export as HTML table."""
        if not data:
            return {"content": "<table></table>", "mime_type": "text/html"}

        headers = list(data[0].keys())
        rows = []
        for item in data:
            row = "<tr>" + "".join(f"<td>{item.get(h, '')}</td>" for h in headers) + "</tr>"
            rows.append(row)

        html = f"""<!DOCTYPE html>
<html>
<head><title>Export</title>
<style>
table {{ border-collapse: collapse; width: 100%; }}
th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
th {{ background-color: #f2f2f2; }}
</style>
</head>
<body>
<table>
<thead><tr>{"".join(f"<th>{h}</th>" for h in headers)}</tr></thead>
<tbody>{"".join(rows)}</tbody>
</table>
</body>
</html>"""

        return {"content": html, "mime_type": "text/html"}

    def _export_markdown(self, data: List[Dict]) -> Dict:
        """Export as Markdown table."""
        if not data:
            return {"content": "", "mime_type": "text/markdown"}

        headers = list(data[0].keys())
        lines = []

        # Header row
        lines.append("| " + " | ".join(headers) + " |")
        lines.append("|" + "|".join(["---"] * len(headers)) + "|")

        # Data rows
        for item in data:
            row = "| " + " | ".join(str(item.get(h, "")) for h in headers) + " |"
            lines.append(row)

        return {"content": "\n".join(lines), "mime_type": "text/markdown"}

    def _get_mime_type(self, export_format: ExportFormat) -> str:
        """Get MIME type for format."""
        mime_types = {
            ExportFormat.JSON: "application/json",
            ExportFormat.CSV: "text/csv",
            ExportFormat.TSV: "text/tab-separated-values",
            ExportFormat.XML: "application/xml",
            ExportFormat.YAML: "text/yaml",
            ExportFormat.HTML: "text/html",
            ExportFormat.MARKDOWN: "text/markdown",
        }
        return mime_types.get(export_format, "text/plain")

    def get_job(self, job_id: str) -> Optional[Dict]:
        """Get export job."""
        with self._lock:
            if job_id not in self._jobs:
                return None
            job = self._jobs[job_id]
            return {
                "id": job.id,
                "format": job.format.value,
                "status": job.status,
                "created_at": job.created_at,
                "completed_at": job.completed_at,
                "file_size": job.file_size,
                "metadata": job.metadata
            }

    def get_jobs(self, limit: int = 100) -> List[Dict]:
        """Get export jobs."""
        with self._lock:
            jobs = sorted(self._jobs.values(), key=lambda x: x.created_at, reverse=True)

        return [
            {
                "id": j.id,
                "format": j.format.value,
                "status": j.status,
                "created_at": j.created_at,
                "file_size": j.file_size
            }
            for j in jobs[:limit]
        ]

    def create_template(
        self,
        name: str,
        format: ExportFormat,
        columns: List[str],
        filters: Dict = None,
        transformations: List[Dict] = None
    ) -> str:
        """Create an export template."""
        template_id = str(uuid.uuid4())[:12]

        template = ExportTemplate(
            id=template_id,
            name=name,
            format=format,
            columns=columns,
            filters=filters or {},
            transformations=transformations or []
        )

        with self._lock:
            self._templates[template_id] = template

        return template_id

    def get_templates(self) -> List[Dict]:
        """Get export templates."""
        with self._lock:
            return [
                {
                    "id": t.id,
                    "name": t.name,
                    "format": t.format.value,
                    "columns": t.columns,
                    "filters": t.filters,
                    "transformations": t.transformations
                }
                for t in self._templates.values()
            ]

    def apply_template(
        self,
        template_id: str,
        data: List[Dict]
    ) -> Optional[Dict]:
        """Apply template to data."""
        with self._lock:
            if template_id not in self._templates:
                return None
            template = self._templates[template_id]

        # Filter columns
        if template.columns:
            filtered_data = []
            for item in data:
                filtered = {k: v for k, v in item.items() if k in template.columns}
                filtered_data.append(filtered)
        else:
            filtered_data = data

        # Apply filters
        for key, value in template.filters.items():
            filtered_data = [item for item in filtered_data if item.get(key) == value]

        # Export with template format
        return self.export_data(filtered_data, template.format)

    def batch_export(
        self,
        data: List[Dict],
        formats: List[ExportFormat]
    ) -> Dict:
        """Export data in multiple formats."""
        results = {}
        for fmt in formats:
            try:
                result = self.export_data(data, fmt)
                results[fmt.value] = result
            except Exception as e:
                results[fmt.value] = {"error": str(e)}

        return results


# Global data exporter
data_exporter = DataExporter()


# Initialize with sample templates
def init_sample_templates():
    """Initialize sample export templates."""
    data_exporter.create_template(
        name="User Report",
        format=ExportFormat.CSV,
        columns=["id", "name", "email", "created_at"]
    )

    data_exporter.create_template(
        name="API Logs",
        format=ExportFormat.JSON,
        columns=["timestamp", "level", "message", "source"]
    )

    data_exporter.create_template(
        name="Metrics Summary",
        format=ExportFormat.HTML,
        columns=["metric", "value", "timestamp"]
    )


init_sample_templates()
