"""Documentation Generator Module

Automatic documentation generation from code.
"""
import threading
import os
import re
import ast
import json
import hashlib
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
import inspect
import importlib.util


class DocFormat(str, Enum):
    """Documentation formats."""
    MARKDOWN = "markdown"
    HTML = "html"
    JSON = "json"
    OPENAPI = "openapi"


class DocType(str, Enum):
    """Documentation types."""
    API = "api"
    MODULE = "module"
    CLASS = "class"
    FUNCTION = "function"
    MIXED = "mixed"


@dataclass
class DocItem:
    """Documentation item."""
    name: str
    doc_type: DocType
    signature: str = ""
    docstring: str = ""
    params: List[Dict] = field(default_factory=list)
    returns: Dict = field(default_factory=dict)
    raises: List[Dict] = field(default_factory=list)
    examples: List[str] = field(default_factory=list)
    children: List["DocItem"] = field(default_factory=list)
    source_file: str = ""
    line_number: int = 0
    metadata: Dict = field(default_factory=dict)


@dataclass
class Documentation:
    """Generated documentation."""
    title: str
    format: DocFormat
    items: List[DocItem] = field(default_factory=list)
    generated_at: float = 0
    source_files: List[str] = field(default_factory=list)
    metadata: Dict = field(default_factory=dict)


class DocumentationGenerator:
    """Automatic documentation generator from code."""

    def __init__(self):
        self._lock = threading.RLock()
        self._cache: Dict[str, Documentation] = {}
        self._source_cache: Dict[str, str] = {}

    def parse_file(self, file_path: str) -> List[DocItem]:
        """Parse a Python file and extract documentation."""
        items = []

        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                source = f.read()
        except Exception:
            return items

        try:
            tree = ast.parse(source)
        except Exception:
            return items

        for node in ast.walk(tree):
            if isinstance(node, ast.Module):
                item = self._parse_module(node, source, file_path)
                if item:
                    items.append(item)

            elif isinstance(node, ast.ClassDef):
                item = self._parse_class(node, source, file_path)
                if item:
                    items.append(item)

            elif isinstance(node, ast.FunctionDef):
                # Only top-level functions
                if not isinstance(node.parent if hasattr(node, 'parent') else None, ast.ClassDef):
                    item = self._parse_function(node, source, file_path)
                    if item:
                        items.append(item)

        return items

    def _parse_module(self, node: ast.Module, source: str, file_path: str) -> Optional[DocItem]:
        """Parse module-level docstring."""
        docstring = ast.get_docstring(node) or ""

        item = DocItem(
            name=Path(file_path).stem,
            doc_type=DocType.MODULE,
            docstring=docstring,
            source_file=file_path,
            line_number=1,
            metadata={"path": file_path}
        )

        return item

    def _parse_class(self, node: ast.ClassDef, source: str, file_path: str) -> Optional[DocItem]:
        """Parse class and its methods."""
        docstring = ast.get_docstring(node) or ""
        signature = self._get_signature(node)

        item = DocItem(
            name=node.name,
            doc_type=DocType.CLASS,
            signature=signature,
            docstring=docstring,
            source_file=file_path,
            line_number=node.lineno,
            metadata={"bases": [self._get_name(b) for b in node.bases]}
        )

        # Parse methods
        for child in node.body:
            if isinstance(child, ast.FunctionDef):
                method = self._parse_function(child, source, file_path)
                if method:
                    item.children.append(method)

        return item

    def _parse_function(self, node: ast.FunctionDef, source: str, file_path: str) -> Optional[DocItem]:
        """Parse function/method."""
        docstring = ast.get_docstring(node) or ""
        signature = self._get_signature(node)

        item = DocItem(
            name=node.name,
            doc_type=DocType.FUNCTION,
            signature=signature,
            docstring=docstring,
            source_file=file_path,
            line_number=node.lineno,
            metadata={"is_async": isinstance(node, ast.AsyncFunctionDef)}
        )

        # Parse arguments
        item.params = self._parse_params(node.args)

        # Parse return annotation
        if node.returns:
            item.returns = {
                "type": ast.unparse(node.returns),
                "description": ""
            }

        # Parse raises (from docstring)
        item.raises = self._parse_raises(docstring)

        # Parse examples
        item.examples = self._parse_examples(docstring)

        return item

    def _get_signature(self, node: ast.FunctionDef) -> str:
        """Get function signature."""
        args = []
        for arg in node.args.args:
            arg_str = arg.arg
            if arg.annotation:
                arg_str += f": {ast.unparse(arg.annotation)}"
            args.append(arg_str)

        # Add *args and **kwargs
        if node.args.vararg:
            args.append(f"*{ast.unparse(node.args.vararg)}")
        if node.args.kwarg:
            args.append(f"**{ast.unparse(node.args.kwarg)}")

        return f"({', '.join(args)})"

    def _parse_params(self, args: ast.arguments) -> List[Dict]:
        """Parse function parameters."""
        params = []

        for arg in args.args:
            param = {
                "name": arg.arg,
                "type": ast.unparse(arg.annotation) if arg.annotation else "Any",
                "default": "",
                "description": ""
            }
            # Get default value
            defaults_offset = len(args.args) - len(args.defaults)
            idx = args.args.index(arg) - defaults_offset
            if idx >= 0 and idx < len(args.defaults):
                param["default"] = ast.unparse(args.defaults[idx])

            params.append(param)

        return params

    def _parse_raises(self, docstring: str) -> List[Dict]:
        """Parse raises from docstring."""
        raises = []
        lines = docstring.split('\n')
        in_raises = False

        for line in lines:
            if line.strip().lower().startswith('raises:'):
                in_raises = True
                continue

            if in_raises:
                if line.strip() == '':
                    in_raises = False
                    continue

                # Match exception type
                match = re.match(r'(\w+)\s*[-–—]?\s*(.*)', line.strip())
                if match:
                    raises.append({
                        "type": match.group(1),
                        "description": match.group(2)
                    })

        return raises

    def _parse_examples(self, docstring: str) -> List[str]:
        """Parse examples from docstring."""
        examples = []
        lines = docstring.split('\n')
        in_example = False
        current_example = []

        for line in lines:
            if line.strip().lower().startswith(('example:', 'examples:')):
                in_example = True
                continue

            if in_example:
                if line.strip() == '' and current_example:
                    examples.append('\n'.join(current_example))
                    current_example = []
                elif line.strip():
                    current_example.append(line)

        if current_example:
            examples.append('\n'.join(current_example))

        return examples

    def _get_name(self, node: ast.AST) -> str:
        """Get name from AST node."""
        if isinstance(node, ast.Name):
            return node.id
        elif isinstance(node, ast.Attribute):
            return f"{self._get_name(node.value)}.{node.attr}"
        return ast.unparse(node)

    def generate_markdown(self, doc: Documentation) -> str:
        """Generate Markdown documentation."""
        lines = [f"# {doc.title}\n"]
        lines.append(f"*Generated: {datetime.fromtimestamp(doc.generated_at).isoformat()}*\n")

        if doc.metadata.get("description"):
            lines.append(f"{doc.metadata['description']}\n")

        lines.append("---\n")

        for item in doc.items:
            lines.extend(self._render_doc_item_md(item))

        return '\n'.join(lines)

    def _render_doc_item_md(self, item: DocItem, level: int = 1) -> List[str]:
        """Render documentation item as Markdown."""
        lines = []

        prefix = "#" * min(level, 6)

        if item.doc_type == DocType.MODULE:
            lines.append(f"{prefix} Module: {item.name}\n")
        elif item.doc_type == DocType.CLASS:
            lines.append(f"{prefix} Class: {item.name}\n")
            if item.metadata.get("bases"):
                lines.append(f"*Inherits from: {', '.join(item.metadata['bases'])}*\n")
        elif item.doc_type == DocType.FUNCTION:
            lines.append(f"{prefix} Function: {item.name}{item.signature}\n")

        if item.docstring:
            lines.append(f"\n{item.docstring}\n")

        if item.params:
            lines.append("\n**Parameters:**\n")
            for param in item.params:
                default = f" = {param['default']}" if param['default'] else ""
                lines.append(f"- `{param['name']}` ({param['type']}{default})")

        if item.returns:
            lines.append(f"\n**Returns:** `{item.returns.get('type', 'Any')}`")
            if item.returns.get('description'):
                lines.append(f" - {item.returns['description']}")

        if item.raises:
            lines.append("\n**Raises:**\n")
            for exc in item.raises:
                lines.append(f"- `{exc['type']}`: {exc.get('description', '')}")

        if item.examples:
            lines.append("\n**Examples:**\n")
            for example in item.examples:
                lines.append("```python")
                lines.append(example)
                lines.append("```\n")

        # Render children
        for child in item.children:
            lines.extend(self._render_doc_item_md(child, level + 1))

        return lines

    def generate_html(self, doc: Documentation) -> str:
        """Generate HTML documentation."""
        md = self.generate_markdown(doc)

        # Simple Markdown to HTML conversion
        html = f"""<!DOCTYPE html>
<html>
<head>
    <title>{doc.title}</title>
    <style>
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; }}
        h1, h2, h3 {{ color: #333; }}
        code {{ background: #f4f4f4; padding: 2px 6px; border-radius: 3px; }}
        pre {{ background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }}
        .docstring {{ color: #666; line-height: 1.6; }}
        .params {{ margin-left: 20px; }}
        .metadata {{ color: #888; font-size: 0.9em; }}
    </style>
</head>
<body>
    <pre>{md}</pre>
</body>
</html>"""

        return html

    def generate_openapi(self, doc: Documentation) -> Dict:
        """Generate OpenAPI documentation."""
        openapi = {
            "openapi": "3.0.0",
            "info": {
                "title": doc.title,
                "version": doc.metadata.get("version", "1.0.0"),
                "description": doc.metadata.get("description", "")
            },
            "paths": {},
            "components": {
                "schemas": {}
            }
        }

        for item in doc.items:
            if item.doc_type == DocType.FUNCTION:
                path = f"/{item.name}"
                openapi["paths"][path] = {
                    "get": {
                        "summary": item.name,
                        "description": item.docstring,
                        "parameters": [],
                        "responses": {"200": {"description": "Success"}}
                    }
                }

                # Add parameters
                for param in item.params:
                    openapi["paths"][path]["get"]["parameters"].append({
                        "name": param["name"],
                        "in": "query",
                        "schema": {"type": param["type"]}
                    })

        return openapi

    def generate(
        self,
        source: str,
        title: str,
        format: DocFormat = DocFormat.MARKDOWN,
        metadata: Dict = None
    ) -> Documentation:
        """Generate documentation from source."""
        doc = Documentation(
            title=title,
            format=format,
            generated_at=datetime.now().timestamp(),
            metadata=metadata or {}
        )

        # Handle source as file path or directory
        if os.path.isfile(source):
            doc.source_files = [source]
            doc.items = self.parse_file(source)
        elif os.path.isdir(source):
            for root, dirs, files in os.walk(source):
                for file in files:
                    if file.endswith('.py'):
                        file_path = os.path.join(root, file)
                        doc.source_files.append(file_path)
                        doc.items.extend(self.parse_file(file_path))

        # Render based on format
        if format == DocFormat.MARKDOWN:
            doc.metadata["content"] = self.generate_markdown(doc)
        elif format == DocFormat.HTML:
            doc.metadata["content"] = self.generate_html(doc)
        elif format == DocFormat.OPENAPI:
            doc.metadata["content"] = self.generate_openapi(doc)
        elif format == DocFormat.JSON:
            doc.metadata["content"] = json.dumps(doc.items, indent=2, default=str)

        return doc

    def generate_api_docs(
        self,
        module_name: str,
        format: DocFormat = DocFormat.MARKDOWN
    ) -> str:
        """Generate documentation for a module."""
        try:
            spec = importlib.util.find_spec(module_name)
            if not spec or not spec.origin:
                return ""

            return self.generate(
                source=spec.origin,
                title=f"API Documentation: {module_name}",
                format=format,
                metadata={"module": module_name}
            ).metadata.get("content", "")

        except Exception as e:
            return f"Error generating docs: {str(e)}"

    def get_cache(self) -> Dict[str, Dict]:
        """Get cached documentation."""
        with self._lock:
            return {
                path: {
                    "title": doc.title,
                    "format": doc.format.value,
                    "generated_at": doc.generated_at,
                    "source_files": doc.source_files
                }
                for path, doc in self._cache.items()
            }

    def clear_cache(self):
        """Clear documentation cache."""
        with self._lock:
            self._cache.clear()
            self._source_cache.clear()


# Global documentation generator
doc_generator = DocumentationGenerator()


# Initialize with sample documentation
def init_sample_docs():
    """Initialize sample documentation."""
    # This creates some sample doc items
    sample_item = DocItem(
        name="example_function",
        doc_type=DocType.FUNCTION,
        signature="(param1: str, param2: int = 10)",
        docstring="This is an example function for demonstration.",
        params=[
            {"name": "param1", "type": "str", "default": "", "description": "First parameter"},
            {"name": "param2", "type": "int", "default": "10", "description": "Second parameter"}
        ],
        returns={"type": "str", "description": "Result string"},
        source_file="example.py",
        line_number=10
    )

    return [sample_item]


init_sample_docs()
