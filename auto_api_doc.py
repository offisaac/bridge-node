"""BridgeNode Auto API Documentation System

自动生成的API文档系统
支持OpenAPI/Swagger格式导出
"""
import os
import re
import json
import inspect
from typing import Dict, List, Any, Optional, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import threading


class ApiDocFormat(str, Enum):
    """API documentation formats."""
    OPENAPI_JSON = "openapi_json"
    OPENAPI_YAML = "openapi_yaml"
    MARKDOWN = "markdown"
    HTML = "html"


@dataclass
class ApiEndpoint:
    """API endpoint documentation."""
    path: str
    method: str
    summary: str = ""
    description: str = ""
    tags: List[str] = field(default_factory=list)
    parameters: List[Dict] = field(default_factory=list)
    request_body: Optional[Dict] = None
    responses: Dict[str, Dict] = field(default_factory=dict)
    security: List[Dict] = field(default_factory=list)
    deprecated: bool = False
    request_example: Optional[Dict] = None
    response_example: Optional[Dict] = None


@dataclass
class ApiSchema:
    """API schema documentation."""
    name: str
    type: str = "object"
    properties: Dict[str, Dict] = field(default_factory=dict)
    required: List[str] = field(default_factory=list)
    description: str = ""


class ApiVersion:
    """API version tracking."""

    def __init__(self, version: str, release_date: str, changes: str):
        self.version = version
        self.release_date = release_date
        self.changes = changes


class AutoApiDoc:
    """自动API文档生成器"""

    def __init__(self, title: str = "BridgeNode API", version: str = "1.0.0"):
        self.title = title
        self.version = version
        self.endpoints: List[ApiEndpoint] = []
        self.schemas: Dict[str, ApiSchema] = {}
        self.tags: List[Dict] = []
        self._lock = threading.RLock()

        # Server info
        self.server_url = "http://localhost:8888"
        self.description = "BridgeNode API Documentation"

        # Version history
        self.versions: List[ApiVersion] = [
            ApiVersion("1.0.0", "2026-02-16", "Initial release")
        ]

    def add_endpoint(self, endpoint: ApiEndpoint):
        """Add endpoint documentation."""
        with self._lock:
            self.endpoints.append(endpoint)

    def add_schema(self, schema: ApiSchema):
        """Add schema documentation."""
        with self._lock:
            self.schemas[schema.name] = schema

    def add_tag(self, name: str, description: str = ""):
        """Add tag."""
        self.tags.append({"name": name, "description": description})

    def add_version(self, version: str, release_date: str, changes: str):
        """Add a new API version."""
        self.versions.append(ApiVersion(version, release_date, changes))

    def get_version_history(self) -> List[Dict]:
        """Get version history."""
        return [
            {
                "version": v.version,
                "release_date": v.release_date,
                "changes": v.changes
            }
            for v in self.versions
        ]

    def generate_openapi(self) -> Dict:
        """Generate OpenAPI 3.0 documentation."""
        paths = {}

        for endpoint in self.endpoints:
            path_item = paths.setdefault(endpoint.path, {})

            # Convert method to lowercase
            method = endpoint.method.lower()

            # Build operation
            operation = {
                "summary": endpoint.summary,
                "description": endpoint.description,
                "tags": endpoint.tags,
                "deprecated": endpoint.deprecated,
                "parameters": endpoint.parameters,
                "responses": endpoint.responses
            }

            if endpoint.request_body:
                operation["requestBody"] = endpoint.request_body

            if endpoint.security:
                operation["security"] = endpoint.security

            path_item[method] = operation

        # Build OpenAPI spec
        spec = {
            "openapi": "3.0.3",
            "info": {
                "title": self.title,
                "version": self.version,
                "description": self.description
            },
            "servers": [
                {"url": self.server_url, "description": "Production server"}
            ],
            "paths": paths,
            "components": {
                "schemas": {},
                "securitySchemes": {
                    "bearerAuth": {
                        "type": "http",
                        "scheme": "bearer",
                        "bearerFormat": "JWT"
                    }
                }
            },
            "tags": self.tags
        }

        # Add schemas
        for name, schema in self.schemas.items():
            spec["components"]["schemas"][name] = {
                "type": schema.type,
                "properties": schema.properties,
                "required": schema.required,
                "description": schema.description
            }

        return spec

    def generate_markdown(self) -> str:
        """Generate Markdown documentation."""
        md = []
        md.append(f"# {self.title}")
        md.append(f"\nVersion: {self.version}")
        md.append(f"\n{self.description}")
        md.append("\n## Base URL")
        md.append(f"\n`{self.server_url}`")
        md.append("\n## Authentication")
        md.append("\nAll endpoints require a Bearer token in the Authorization header:")
        md.append("\n```")
        md.append("Authorization: Bearer YOUR_TOKEN")
        md.append("```")
        md.append("\n## Endpoints")

        # Group by tags
        by_tag = {}
        for endpoint in self.endpoints:
            tag = endpoint.tags[0] if endpoint.tags else "Other"
            if tag not in by_tag:
                by_tag[tag] = []
            by_tag[tag].append(endpoint)

        for tag, endpoints in by_tag.items():
            md.append(f"\n### {tag}")
            md.append("")

            for ep in endpoints:
                md.append(f"#### `{ep.method.upper()} {ep.path}`")
                md.append(f"\n{ep.summary}")
                if ep.description:
                    md.append(f"\n{ep.description}")

                if ep.parameters:
                    md.append("\n**Parameters:**")
                    md.append("| Name | Type | Required | Description |")
                    md.append("|------|------|----------|-------------|")
                    for param in ep.parameters:
                        required = "Yes" if param.get("required") else "No"
                        md.append(f"| {param.get('name')} | {param.get('in')} | {required} | {param.get('description', '')} |")

                if ep.responses:
                    md.append("\n**Responses:**")
                    for code, response in ep.responses.items():
                        md.append(f"- `{code}`: {response.get('description', '')}")

                md.append("")

        return "\n".join(md)

    def generate_html(self) -> str:
        """Generate HTML documentation with Swagger UI style."""
        openapi_json = json.dumps(self.generate_openapi(), indent=2)

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{self.title}</title>
    <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui.css">
    <style>
        body {{ margin: 0; padding: 0; }}
        .topbar {{ display: none; }}
    </style>
</head>
<body>
    <div id="swagger-ui"></div>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
    <script>
        const spec = {openapi_json};
        window.onload = () => {{
            window.ui = SwaggerUIBuilders({{
                spec: spec,
                dom_id: '#swagger-ui',
                deepLinking: true,
                presets: [
                    SwaggerUIBuilders.presets.apis,
                    SwaggerUIStandalonePreset
                ],
                layout: 'StandaloneLayout'
            }});
        }};
    </script>
</body>
</html>"""

        return html

    def export(self, format: ApiDocFormat = ApiDocFormat.OPENAPI_JSON) -> str:
        """Export documentation in specified format."""
        if format == ApiDocFormat.OPENAPI_JSON:
            return json.dumps(self.generate_openapi(), indent=2)
        elif format == ApiDocFormat.MARKDOWN:
            return self.generate_markdown()
        elif format == ApiDocFormat.HTML:
            return self.generate_html()
        else:
            return json.dumps(self.generate_openapi(), indent=2)

    def save(self, filepath: str, format: ApiDocFormat = None):
        """Save documentation to file."""
        if format is None:
            if filepath.endswith(".json"):
                format = ApiDocFormat.OPENAPI_JSON
            elif filepath.endswith(".yaml") or filepath.endswith(".yml"):
                format = ApiDocFormat.OPENAPI_YAML
            elif filepath.endswith(".md"):
                format = ApiDocFormat.MARKDOWN
            elif filepath.endswith(".html"):
                format = ApiDocFormat.HTML
            else:
                format = ApiDocFormat.OPENAPI_JSON

        content = self.export(format)

        # Handle YAML
        if format == ApiDocFormat.OPENAPI_YAML:
            try:
                import yaml
                data = self.generate_openapi()
                content = yaml.dump(data, default_flow_style=False)
            except ImportError:
                pass

        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)


# Global API documentation instance
auto_api_doc = AutoApiDoc()


# Helper functions for documenting endpoints
def doc_endpoint(
    path: str,
    method: str,
    summary: str = "",
    description: str = "",
    tags: List[str] = None,
    parameters: List[Dict] = None,
    request_body: Dict = None,
    responses: Dict = None
):
    """Decorator to document an endpoint."""
    def decorator(func: Callable):
        # Create endpoint doc
        endpoint = ApiEndpoint(
            path=path,
            method=method,
            summary=summary,
            description=description,
            tags=tags or [],
            parameters=parameters or [],
            request_body=request_body,
            responses=responses or {}
        )

        # Add to global doc
        auto_api_doc.add_endpoint(endpoint)

        return func
    return decorator
