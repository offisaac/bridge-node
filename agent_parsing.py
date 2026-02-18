"""Agent Parsing Module

Text parsing utilities for agent services including JSON/XML/CSV/YAML parsing, text
extraction, regex patterns, template rendering, and data transformation.
"""
import re
import json
import time
import uuid
import csv
import io
from typing import Dict, List, Optional, Any, Callable, Union
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
import threading
import yaml


class ParseFormat(str, Enum):
    """Parsing formats."""
    JSON = "json"
    XML = "xml"
    CSV = "csv"
    YAML = "yaml"
    TEXT = "text"
    REGEX = "regex"
    HTML = "html"


class ExtractMode(str, Enum):
    """Extraction modes."""
    FIRST = "first"
    ALL = "all"
    COUNT = "count"


@dataclass
class ParseConfig:
    """Parsing configuration."""
    format: ParseFormat = ParseFormat.JSON
    delimiter: str = ","
    quote_char: str = '"'
    strict: bool = True
    encoding: str = "utf-8"
    trim: bool = True
    skip_empty: bool = False


@dataclass
class ParseResult:
    """Parsing result."""
    id: str
    success: bool
    data: Any = None
    error: str = None
    parse_time_ms: float = 0
    parsed_at: float = field(default_factory=time.time)


@dataclass
class ExtractResult:
    """Extraction result."""
    id: str
    matches: List[str] = field(default_factory=list)
    count: int = 0
    extract_time_ms: float = 0


@dataclass
class TransformResult:
    """Data transformation result."""
    id: str
    success: bool
    data: Any = None
    error: str = None
    transform_time_ms: float = 0


@dataclass
class ParsingStats:
    """Parsing statistics."""
    total_parses: int = 0
    successful_parses: int = 0
    failed_parses: int = 0
    total_extractions: int = 0
    total_transforms: int = 0
    avg_parse_time_ms: float = 0
    avg_extract_time_ms: float = 0


class AgentParsing:
    """Text parsing utility for agents."""

    def __init__(self, config: ParseConfig = None):
        self._config = config or ParseConfig()
        self._lock = threading.RLock()
        self._stats = ParsingStats()
        self._templates: Dict[str, str] = {}
        self._regex_patterns: Dict[str, re.Pattern] = {}

    def configure(self, config: ParseConfig):
        """Update configuration."""
        with self._lock:
            self._config = config

    def parse(
        self,
        content: str,
        format: ParseFormat = None,
        options: Dict[str, Any] = None
    ) -> ParseResult:
        """Parse content based on format."""
        result_id = str(uuid.uuid4())
        format = format or self._config.format
        start_time = time.time()

        try:
            if format == ParseFormat.JSON:
                data = json.loads(content)
            elif format == ParseFormat.YAML:
                data = yaml.safe_load(content)
            elif format == ParseFormat.CSV:
                data = self._parse_csv(content, options or {})
            elif format == ParseFormat.XML:
                data = self._parse_xml(content)
            elif format == ParseFormat.TEXT:
                data = content.strip() if self._config.trim else content
            else:
                data = content

            parse_time = (time.time() - start_time) * 1000

            with self._lock:
                self._stats.total_parses += 1
                self._stats.successful_parses += 1
                if self._stats.total_parses > 1:
                    self._stats.avg_parse_time_ms = (
                        (self._stats.avg_parse_time_ms * (self._stats.total_parses - 1) + parse_time)
                        / self._stats.total_parses
                    )

            return ParseResult(
                id=result_id,
                success=True,
                data=data,
                parse_time_ms=parse_time
            )

        except Exception as e:
            parse_time = (time.time() - start_time) * 1000

            with self._lock:
                self._stats.total_parses += 1
                self._stats.failed_parses += 1

            return ParseResult(
                id=result_id,
                success=False,
                error=str(e),
                parse_time_ms=parse_time
            )

    def _parse_csv(self, content: str, options: Dict) -> List[Dict]:
        """Parse CSV content."""
        delimiter = options.get("delimiter", self._config.delimiter)
        has_header = options.get("has_header", True)

        reader = csv.reader(io.StringIO(content), delimiter=delimiter)
        rows = list(reader)

        if not rows:
            return []

        if has_header:
            headers = rows[0]
            return [
                {headers[i]: row[i] if i < len(row) else "" for i in range(len(headers))}
                for row in rows[1:]
            ]
        else:
            return rows

    def _parse_xml(self, content: str) -> Dict:
        """Parse XML content (simplified)."""
        # Simple XML to dict conversion
        result = {}
        root_match = re.match(r'<(\w+)([^>]*)>(.*)</\1>', content, re.DOTALL)
        if root_match:
            tag = root_match.group(1)
            attrs = root_match.group(2)
            body = root_match.group(3)

            # Parse attributes
            attr_dict = {}
            for match in re.finditer(r'(\w+)="([^"]*)"', attrs):
                attr_dict[match.group(1)] = match.group(2)

            result[tag] = {"_attrs": attr_dict, "_body": body.strip()}

        return result

    def extract(
        self,
        content: str,
        pattern: str,
        mode: ExtractMode = ExtractMode.FIRST,
        group: int = 0
    ) -> ExtractResult:
        """Extract text using regex pattern."""
        result_id = str(uuid.uuid4())
        start_time = time.time()

        try:
            regex = re.compile(pattern, re.MULTILINE | re.DOTALL)
            matches = regex.findall(content)

            extract_time = (time.time() - start_time) * 1000

            with self._lock:
                self._stats.total_extractions += 1

            if mode == ExtractMode.FIRST:
                return ExtractResult(
                    id=result_id,
                    matches=[matches[0]] if matches else [],
                    count=1 if matches else 0,
                    extract_time_ms=extract_time
                )
            elif mode == ExtractMode.ALL:
                return ExtractResult(
                    id=result_id,
                    matches=matches,
                    count=len(matches),
                    extract_time_ms=extract_time
                )
            elif mode == ExtractMode.COUNT:
                return ExtractResult(
                    id=result_id,
                    matches=[],
                    count=len(matches),
                    extract_time_ms=extract_time
                )

        except Exception as e:
            return ExtractResult(
                id=result_id,
                matches=[],
                count=0,
                extract_time_ms=(time.time() - start_time) * 1000
            )

    def extract_json_path(self, content: str, path: str) -> Any:
        """Extract data using JSONPath-like syntax."""
        try:
            data = json.loads(content)
            return self._get_json_path(data, path)
        except Exception:
            return None

    def _get_json_path(self, data: Any, path: str) -> Any:
        """Get value at JSON path."""
        parts = path.strip("/").split("/")
        current = data

        for part in parts:
            if isinstance(current, dict):
                current = current.get(part)
            elif isinstance(current, list):
                try:
                    idx = int(part)
                    current = current[idx] if 0 <= idx < len(current) else None
                except ValueError:
                    return None
            else:
                return None

            if current is None:
                return None

        return current

    def extract_xml_xpath(self, content: str, xpath: str) -> List[str]:
        """Extract data using XPath-like syntax (simplified)."""
        results = []

        # Simple tag extraction
        pattern = rf'<{xpath.replace("/", "|")}>([^<]*)</{xpath.replace("/", "|")}>'
        matches = re.findall(pattern, content)
        results.extend(matches)

        return results

    def register_template(self, name: str, template: str):
        """Register a template string."""
        with self._lock:
            self._templates[name] = template

    def render_template(
        self,
        name: str = None,
        template: str = None,
        context: Dict[str, Any] = None
    ) -> str:
        """Render a template with context."""
        context = context or {}

        if name:
            template = self._templates.get(name)

        if not template:
            raise ValueError("Template not found")

        # Simple template rendering (supports {{ variable }} and {% if %})
        result = template

        # Replace variables
        for key, value in context.items():
            result = result.replace(f"{{{{ {key} }}}}", str(value))

        # Handle simple conditionals
        if_match = re.findall(r'{% if (\w+) %}(.*?){% endif %}', result, re.DOTALL)
        for var, body in if_match:
            pattern_start = f'{{% if {var} %}}'
            pattern_end = '{% endif %}'
            if context.get(var):
                result = result.replace(pattern_start + body + pattern_end, body)
            else:
                result = result.replace(pattern_start + body + pattern_end, '')

        return result

    def transform(
        self,
        data: Any,
        transformations: List[Dict[str, Any]]
    ) -> TransformResult:
        """Apply transformations to data."""
        result_id = str(uuid.uuid4())
        start_time = time.time()

        try:
            current_data = data

            for transform in transformations:
                transform_type = transform.get("type")

                if transform_type == "rename_keys":
                    mapping = transform.get("mapping", {})
                    current_data = self._rename_keys(current_data, mapping)

                elif transform_type == "filter_keys":
                    keys = transform.get("keys", [])
                    current_data = self._filter_keys(current_data, keys)

                elif transform_type == "map_values":
                    field = transform.get("field")
                    mapping = transform.get("mapping", {})
                    current_data = self._map_values(current_data, field, mapping)

                elif transform_type == "flatten":
                    current_data = self._flatten(current_data)

                elif transform_type == "unflatten":
                    separator = transform.get("separator", ".")
                    current_data = self._unflatten(current_data, separator)

                elif transform_type == "coerce_types":
                    type_map = transform.get("types", {})
                    current_data = self._coerce_types(current_data, type_map)

                elif transform_type == "merge":
                    other = transform.get("data", {})
                    current_data = self._merge(current_data, other)

                elif transform_type == "filter":
                    condition = transform.get("condition")
                    current_data = self._filter(current_data, condition)

            transform_time = (time.time() - start_time) * 1000

            with self._lock:
                self._stats.total_transforms += 1

            return TransformResult(
                id=result_id,
                success=True,
                data=current_data,
                transform_time_ms=transform_time
            )

        except Exception as e:
            return TransformResult(
                id=result_id,
                success=False,
                error=str(e),
                transform_time_ms=(time.time() - start_time) * 1000
            )

    def _rename_keys(self, data: Dict, mapping: Dict) -> Dict:
        """Rename keys in dictionary."""
        if not isinstance(data, dict):
            return data
        return {mapping.get(k, k): v for k, v in data.items()}

    def _filter_keys(self, data: Dict, keys: List[str]) -> Dict:
        """Filter keys in dictionary."""
        if not isinstance(data, dict):
            return data
        return {k: v for k, v in data.items() if k in keys}

    def _map_values(self, data: Dict, field: str, mapping: Dict) -> Dict:
        """Map values for a specific field."""
        if not isinstance(data, dict):
            return data
        if field in data:
            data = dict(data)
            data[field] = mapping.get(data[field], data[field])
        return data

    def _flatten(self, data: Dict, parent_key: str = "", separator: str = ".") -> Dict:
        """Flatten nested dictionary."""
        items = []
        for k, v in data.items():
            new_key = f"{parent_key}{separator}{k}" if parent_key else k
            if isinstance(v, dict):
                items.extend(self._flatten(v, new_key, separator).items())
            else:
                items.append((new_key, v))
        return dict(items)

    def _unflatten(self, data: Dict, separator: str = ".") -> Dict:
        """Unflatten dictionary."""
        result = {}
        for key, value in data.items():
            parts = key.split(separator)
            current = result
            for part in parts[:-1]:
                if part not in current:
                    current[part] = {}
                current = current[part]
            current[parts[-1]] = value
        return result

    def _coerce_types(self, data: Dict, type_map: Dict) -> Dict:
        """Coerce field types."""
        result = dict(data)
        for field, type_name in type_map.items():
            if field in result:
                try:
                    if type_name == "int":
                        result[field] = int(result[field])
                    elif type_name == "float":
                        result[field] = float(result[field])
                    elif type_name == "str":
                        result[field] = str(result[field])
                    elif type_name == "bool":
                        result[field] = bool(result[field])
                except (ValueError, TypeError):
                    pass
        return result

    def _merge(self, data1: Dict, data2: Dict) -> Dict:
        """Merge two dictionaries."""
        result = dict(data1)
        result.update(data2)
        return result

    def _filter(self, data: List[Dict], condition: Dict) -> List[Dict]:
        """Filter list of dictionaries."""
        if not isinstance(data, list):
            return data

        field = condition.get("field")
        operator = condition.get("operator", "eq")
        value = condition.get("value")

        filtered = []
        for item in data:
            if not isinstance(item, dict):
                continue

            item_value = item.get(field)
            matches = False

            if operator == "eq":
                matches = item_value == value
            elif operator == "ne":
                matches = item_value != value
            elif operator == "gt":
                matches = item_value > value
            elif operator == "lt":
                matches = item_value < value
            elif operator == "in":
                matches = item_value in value
            elif operator == "contains":
                matches = value in str(item_value)

            if matches:
                filtered.append(item)

        return filtered

    def to_json(self, data: Any, indent: int = 2) -> str:
        """Convert data to JSON string."""
        return json.dumps(data, indent=indent, ensure_ascii=False)

    def to_yaml(self, data: Any) -> str:
        """Convert data to YAML string."""
        return yaml.dump(data, allow_unicode=True)

    def to_csv(self, data: List[Dict], fields: List[str] = None) -> str:
        """Convert list of dicts to CSV."""
        if not data:
            return ""

        fields = fields or list(data[0].keys()) if data else []
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows(data)
        return output.getvalue()

    def register_regex(self, name: str, pattern: str):
        """Register a regex pattern."""
        with self._lock:
            self._regex_patterns[name] = re.compile(pattern)

    def get_template(self, name: str) -> Optional[str]:
        """Get template by name."""
        return self._templates.get(name)

    def list_templates(self) -> List[str]:
        """List all registered templates."""
        return list(self._templates.keys())

    def get_stats(self) -> Dict:
        """Get parsing statistics."""
        with self._lock:
            return {
                "total_parses": self._stats.total_parses,
                "successful_parses": self._stats.successful_parses,
                "failed_parses": self._stats.failed_parses,
                "success_rate": round(
                    self._stats.successful_parses / self._stats.total_parses * 100, 2
                ) if self._stats.total_parses > 0 else 0,
                "total_extractions": self._stats.total_extractions,
                "total_transforms": self._stats.total_transforms,
                "avg_parse_time_ms": round(self._stats.avg_parse_time_ms, 2),
                "avg_extract_time_ms": round(self._stats.avg_extract_time_ms, 2),
                "template_count": len(self._templates),
                "regex_pattern_count": len(self._regex_patterns)
            }


# Global parsing instance
agent_parsing = AgentParsing()
