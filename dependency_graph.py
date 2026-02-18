"""Dependency Graph Module

Visual service dependency graph.
"""
import threading
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import uuid


class NodeType(str, Enum):
    """Node types."""
    SERVICE = "service"
    DATABASE = "database"
    EXTERNAL = "external"
    CACHE = "cache"
    QUEUE = "queue"


class EdgeType(str, Enum):
    """Edge types."""
    CALLS = "calls"
    USES = "uses"
    DEPENDS_ON = "depends_on"


@dataclass
class DependencyNode:
    """Dependency graph node."""
    id: str
    name: str
    node_type: NodeType
    metadata: Dict = field(default_factory=dict)


@dataclass
class DependencyEdge:
    """Dependency graph edge."""
    id: str
    source: str
    target: str
    edge_type: EdgeType
    metadata: Dict = field(default_factory=dict)


class DependencyGraph:
    """Service dependency graph."""

    def __init__(self):
        self._lock = threading.RLock()
        self._nodes: Dict[str, DependencyNode] = {}
        self._edges: List[DependencyEdge] = []

    def add_node(
        self,
        name: str,
        node_type: NodeType,
        metadata: Dict = None
    ) -> str:
        """Add a node to the graph."""
        node_id = str(uuid.uuid4())[:8]

        node = DependencyNode(
            id=node_id,
            name=name,
            node_type=node_type,
            metadata=metadata or {}
        )

        with self._lock:
            self._nodes[name] = node

        return node_id

    def add_edge(
        self,
        source: str,
        target: str,
        edge_type: EdgeType = EdgeType.DEPENDS_ON,
        metadata: Dict = None
    ) -> str:
        """Add an edge to the graph."""
        edge_id = str(uuid.uuid4())[:8]

        edge = DependencyEdge(
            id=edge_id,
            source=source,
            target=target,
            edge_type=edge_type,
            metadata=metadata or {}
        )

        with self._lock:
            self._edges.append(edge)

        return edge_id

    def remove_node(self, name: str) -> bool:
        """Remove a node and its edges."""
        with self._lock:
            if name not in self._nodes:
                return False

            del self._nodes[name]
            self._edges = [e for e in self._edges if e.source != name and e.target != name]
            return True

    def get_nodes(self, node_type: NodeType = None) -> List[Dict]:
        """Get graph nodes."""
        with self._lock:
            nodes = list(self._nodes.values())

        if node_type:
            nodes = [n for n in nodes if n.node_type == node_type]

        return [
            {
                "id": n.id,
                "name": n.name,
                "type": n.node_type.value,
                "metadata": n.metadata
            }
            for n in nodes
        ]

    def get_edges(self, source: str = None, target: str = None) -> List[Dict]:
        """Get graph edges."""
        with self._lock:
            edges = self._edges.copy()

        if source:
            edges = [e for e in edges if e.source == source]
        if target:
            edges = [e for e in edges if e.target == target]

        return [
            {
                "id": e.id,
                "source": e.source,
                "target": e.target,
                "type": e.edge_type.value,
                "metadata": e.metadata
            }
            for e in edges
        ]

    def get_dependencies(self, service: str) -> List[str]:
        """Get direct dependencies of a service."""
        with self._lock:
            return [e.target for e in self._edges if e.source == service]

    def get_dependents(self, service: str) -> List[str]:
        """Get services that depend on this service."""
        with self._lock:
            return [e.source for e in self._edges if e.target == service]

    def get_graph(self) -> Dict:
        """Get full graph data."""
        return {
            "nodes": self.get_nodes(),
            "edges": self.get_edges()
        }

    def detect_cycles(self) -> List[List[str]]:
        """Detect cycles in the dependency graph."""
        with self._lock:
            # Build adjacency list
            adj = {}
            for node in self._nodes.values():
                adj[node.name] = []
            for edge in self._edges:
                if edge.source in adj:
                    adj[edge.source].append(edge.target)

        # DFS to find cycles
        visited = set()
        rec_stack = set()
        cycles = []

        def dfs(node, path):
            visited.add(node)
            rec_stack.add(node)
            path.append(node)

            for neighbor in adj.get(node, []):
                if neighbor not in visited:
                    if dfs(neighbor, path.copy()):
                        return True
                elif neighbor in rec_stack:
                    # Found cycle
                    cycle_start = path.index(neighbor)
                    cycles.append(path[cycle_start:] + [neighbor])

            rec_stack.remove(node)
            return False

        for node in adj:
            if node not in visited:
                dfs(node, [])

        return cycles

    def get_stats(self) -> Dict:
        """Get dependency graph statistics."""
        with self._lock:
            node_types = {}
            for node in self._nodes.values():
                t = node.node_type.value
                node_types[t] = node_types.get(t, 0) + 1

            return {
                "total_nodes": len(self._nodes),
                "total_edges": len(self._edges),
                "by_type": node_types
            }

    def generate_dot(self) -> str:
        """Generate Graphviz DOT format."""
        lines = ["digraph dependencies {"]

        # Nodes
        for node in self._nodes.values():
            color = {
                NodeType.SERVICE: "blue",
                NodeType.DATABASE: "green",
                NodeType.EXTERNAL: "gray",
                NodeType.CACHE: "orange",
                NodeType.QUEUE: "purple"
            }.get(node.node_type, "white")

            lines.append(f'  "{node.name}" [color={color}];')

        # Edges
        for edge in self._edges:
            lines.append(f'  "{edge.source}" -> "{edge.target}";')

        lines.append("}")
        return "\n".join(lines)


# Global dependency graph
dependency_graph = DependencyGraph()


# Initialize with default dependencies
def init_default_graph():
    """Initialize default dependency graph."""
    # Add nodes
    dependency_graph.add_node("api-gateway", NodeType.SERVICE)
    dependency_graph.add_node("auth-service", NodeType.SERVICE)
    dependency_graph.add_node("user-service", NodeType.SERVICE)
    dependency_graph.add_node("order-service", NodeType.SERVICE)
    dependency_graph.add_node("payment-service", NodeType.SERVICE)
    dependency_graph.add_node("postgres", NodeType.DATABASE)
    dependency_graph.add_node("redis", NodeType.CACHE)
    dependency_graph.add_node("rabbitmq", NodeType.QUEUE)

    # Add edges
    dependency_graph.add_edge("api-gateway", "auth-service")
    dependency_graph.add_edge("api-gateway", "user-service")
    dependency_graph.add_edge("api-gateway", "order-service")
    dependency_graph.add_edge("user-service", "postgres")
    dependency_graph.add_edge("user-service", "redis")
    dependency_graph.add_edge("order-service", "postgres")
    dependency_graph.add_edge("order-service", "payment-service")
    dependency_graph.add_edge("payment-service", "postgres")
    dependency_graph.add_edge("order-service", "rabbitmq")


init_default_graph()
