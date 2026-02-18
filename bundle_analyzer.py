"""Bundle Analyzer Module

Analyze JavaScript bundles for size, dependencies, and optimization opportunities.
"""
import os
import re
import json
import gzip
import threading
import uuid
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from enum import Enum


class BundleType(str, Enum):
    """Bundle types."""
    JAVASCRIPT = "javascript"
    TYPESCRIPT = "typescript"
    CSS = "css"
    WEBPACK = "webpack"
    ROLLUP = "rollup"
    ESBUILD = "esbuild"
    PARCEL = "parcel"
    UNKNOWN = "unknown"


class ModuleType(str, Enum):
    """Module types."""
    LOCAL = "local"
    NODE_modules = "node_modules"
    EXTERNAL = "external"
    ABSOLUTE = "absolute"


@dataclass
class Module:
    """Individual module in bundle."""
    id: str
    name: str
    path: str
    size: int
    module_type: ModuleType
    dependencies: List[str] = field(default_factory=list)


@dataclass
class BundleAnalysis:
    """Complete bundle analysis result."""
    id: str
    file_path: str
    analyzed_at: float
    total_size: int
    gzipped_size: int
    module_count: int
    modules: List[Module]
    chunks: List[Dict]
    dependencies: Dict[str, int]  # package -> size
    duplicates: List[Dict]  # Duplicate packages
    suggestions: List[str]


class BundleAnalyzer:
    """Analyze JavaScript bundles."""

    # Common large packages
    KNOWN_LARGE_PACKAGES = {
        "moment": {"size_kb": 300, "替代": "dayjs, date-fns"},
        "lodash": {"size_kb": 500, "替代": "lodash-es (tree-shake)"},
        "react-dom": {"size_kb": 150, "替代": ""},
        "@babel/runtime": {"size_kb": 100, "替代": ""},
        "antd": {"size_kb": 1000, "替代": "antd-lite, @ant-design/icons only"},
        "material-ui": {"size_kb": 800, "替代": "@mui/material"},
        "firebase": {"size_kb": 600, "替代": "firebase (modular)"},
        "aws-sdk": {"size_kb": 1000, "替代": "@aws-sdk/client-s3"},
        "chart.js": {"size_kb": 500, "替代": "chart.js (tree-shake)"},
    }

    def __init__(self):
        self._lock = threading.RLock()
        self._analyses: Dict[str, BundleAnalysis] = {}

    def _parse_webpack_stats(self, content: str) -> Optional[Dict]:
        """Parse webpack stats JSON."""
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            return None

    def _parse_imports(self, content: str) -> List[str]:
        """Parse import statements from bundle."""
        imports = []

        # ES6 imports
        es6_pattern = r'import\s+.*?from\s+["\']([^"\']+)["\']'
        imports.extend(re.findall(es6_pattern, content))

        # CommonJS requires
        cjs_pattern = r'require\s*\(\s*["\']([^"\']+)["\']\s*\)'
        imports.extend(re.findall(cjs_pattern, content))

        return list(set(imports))

    def _analyze_file(self, file_path: str) -> BundleAnalysis:
        """Analyze a single bundle file."""
        analysis_id = str(uuid.uuid4())[:12]

        try:
            file_size = os.path.getsize(file_path)
        except OSError:
            file_size = 0

        # Try to read file content
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
        except Exception:
            content = ""

        # Calculate gzipped size
        try:
            gzipped = gzip.compress(content.encode('utf-8'))
            gzipped_size = len(gzipped)
        except Exception:
            gzipped_size = 0

        # Parse imports/dependencies
        imports = self._parse_imports(content)

        # Build dependencies dict
        dependencies = {}
        for imp in imports:
            if imp.startswith('.'):
                continue
            # Extract package name
            pkg = imp.split('/')[0].replace('@', '')
            dependencies[pkg] = dependencies.get(pkg, 0) + 1000  # Approximate

        # Find duplicate/invalid imports
        duplicates = []
        pkg_counts = {}
        for imp in imports:
            pkg = imp.split('/')[0]
            if pkg.startswith('.'):
                continue
            if pkg in pkg_counts:
                duplicates.append({"package": pkg, "count": pkg_counts[pkg] + 1})
            pkg_counts[pkg] = pkg_counts.get(pkg, 0)

        # Generate suggestions
        suggestions = self._generate_suggestions(dependencies, file_size)

        # Create modules list (simplified)
        modules = []
        for i, imp in enumerate(set(imports)):
            is_node = not imp.startswith('.')
            modules.append(Module(
                id=str(i),
                name=imp,
                path=imp,
                size=dependencies.get(imp.split('/')[0].replace('@', ''), 0),
                module_type=ModuleType.NODE_modules if is_node else ModuleType.LOCAL
            ))

        return BundleAnalysis(
            id=analysis_id,
            file_path=file_path,
            analyzed_at=datetime.now().timestamp(),
            total_size=file_size,
            gzipped_size=gzipped_size,
            module_count=len(imports),
            modules=modules,
            chunks=[],
            dependencies=dependencies,
            duplicates=duplicates,
            suggestions=suggestions
        )

    def _generate_suggestions(self, dependencies: Dict[str, int], file_size: int) -> List[str]:
        """Generate optimization suggestions."""
        suggestions = []
        total_size_kb = file_size / 1024

        # Check bundle size
        if total_size_kb > 500:
            suggestions.append(f"Bundle size ({total_size_kb:.1f}KB) exceeds 500KB. Consider code splitting.")

        # Check for known large packages
        for pkg in dependencies:
            pkg_base = pkg.split('@')[-1]
            if pkg_base in self.KNOWN_LARGE_PACKAGES:
                info = self.KNOWN_LARGE_PACKAGES[pkg_base]
                suggestion = f"Consider replacing '{pkg_base}' ({info['size_kb']}KB)"
                if info.get('替代'):
                    suggestion += f" with {info['替代']}"
                suggestions.append(suggestion)

        # Check for duplicates
        if len(dependencies) > 100:
            suggestions.append(f"High number of dependencies ({len(dependencies)}). Consider using barrel files.")

        # Check for unoptimized imports
        for pkg in dependencies:
            if pkg in ['moment', 'lodash', 'lodash-es']:
                suggestions.append(f"Use modular imports from '{pkg}' instead of full import.")

        return suggestions

    def analyze_file(self, file_path: str) -> BundleAnalysis:
        """Analyze a bundle file."""
        analysis = self._analyze_file(file_path)

        with self._lock:
            self._analyses[analysis.id] = analysis

        return analysis

    def analyze_directory(self, directory: str) -> List[BundleAnalysis]:
        """Analyze all bundle files in a directory."""
        analyses = []
        path = Path(directory)

        if not path.exists():
            return analyses

        # Find bundle files
        extensions = ['.js', '.bundle.js', '.min.js', '.chunk.js']
        bundle_files = []

        for ext in extensions:
            bundle_files.extend(path.rglob(f'*{ext}'))

        # Also look for stats files
        stats_files = list(path.rglob('*stats*.json'))

        # Analyze each file
        for bundle_file in bundle_files:
            analysis = self._analyze_file(str(bundle_file))
            analyses.append(analysis)

        return analyses

    def get_analysis(self, analysis_id: str) -> Optional[BundleAnalysis]:
        """Get a bundle analysis."""
        with self._lock:
            return self._analyses.get(analysis_id)

    def get_analyses(self, limit: int = 50) -> List[Dict]:
        """Get recent analyses."""
        with self._lock:
            analyses = sorted(
                self._analyses.values(),
                key=lambda x: x.analyzed_at,
                reverse=True
            )

        return [
            {
                "id": a.id,
                "file_path": a.file_path,
                "analyzed_at": a.analyzed_at,
                "total_size": a.total_size,
                "gzipped_size": a.gzipped_size,
                "module_count": a.module_count,
                "suggestions_count": len(a.suggestions)
            }
            for a in analyses[:limit]
        ]

    def get_statistics(self) -> Dict:
        """Get analyzer statistics."""
        with self._lock:
            total = len(self._analyses)

            if total == 0:
                return {"total_analyses": 0}

            total_size = sum(a.total_size for a in self._analyses.values())
            avg_size = total_size / total
            total_modules = sum(a.module_count for a in self._analyses.values())

            # Top dependencies
            all_deps = {}
            for a in self._analyses.values():
                for dep, size in a.dependencies.items():
                    all_deps[dep] = all_deps.get(dep, 0) + size

            top_deps = sorted(all_deps.items(), key=lambda x: x[1], reverse=True)[:10]

            return {
                "total_analyses": total,
                "average_bundle_size": avg_size,
                "total_modules": total_modules,
                "top_dependencies": dict(top_deps)
            }


# Global bundle analyzer
bundle_analyzer = BundleAnalyzer()
