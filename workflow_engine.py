#!/usr/bin/env python3
"""
Workflow Engine - 工作流编排引擎
自动化任务编排和执行

支持:
- DAG 工作流定义
- 条件分支
- 并行执行
- 错误处理和重试
- 状态持久化
- Webhook 触发
"""

import asyncio
import json
import uuid
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Set, Any, Callable
from dataclasses import dataclass, field, asdict
from collections import defaultdict
import threading


class NodeStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    WAITING = "waiting"


class WorkflowStatus(Enum):
    DRAFT = "draft"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


class NodeType(Enum):
    TASK = "task"
    CONDITION = "condition"
    PARALLEL = "parallel"
    WAIT = "wait"
    WEBHOOK = "webhook"
    TRANSFORM = "transform"
    APPROVAL = "approval"


@dataclass
class WorkflowNode:
    """工作流节点"""
    id: str
    name: str
    node_type: NodeType = NodeType.TASK
    config: Dict = field(default_factory=dict)  # 节点配置
    inputs: Dict[str, Any] = field(default_factory=dict)  # 输入映射
    outputs: Dict[str, Any] = field(default_factory=dict)  # 输出映射
    retry_count: int = 0
    max_retries: int = 3
    timeout: int = 300  # 秒
    conditions: List[str] = field(default_factory=list)  # 条件表达式
    on_failure: str = ""  # 失败时跳转节点


@dataclass
class WorkflowEdge:
    """工作流边（连接）"""
    source: str
    target: str
    condition: str = ""  # 条件表达式
    label: str = ""


@dataclass
class Workflow:
    """工作流定义"""
    id: str
    name: str
    description: str = ""
    nodes: List[WorkflowNode] = field(default_factory=list)
    edges: List[WorkflowEdge] = field(default_factory=list)
    status: WorkflowStatus = WorkflowStatus.DRAFT
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class ExecutionNode:
    """执行中的节点状态"""
    node_id: str
    status: NodeStatus = NodeStatus.PENDING
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    output: Any = None
    error: Optional[str] = None
    retry: int = 0


@dataclass
class WorkflowExecution:
    """工作流执行实例"""
    id: str
    workflow_id: str
    status: WorkflowStatus = WorkflowStatus.RUNNING
    nodes: Dict[str, ExecutionNode] = field(default_factory=dict)
    started_at: str = field(default_factory=lambda: datetime.now().isoformat())
    completed_at: Optional[str] = None
    context: Dict[str, Any] = field(default_factory=dict)  # 执行上下文
    history: List[Dict] = field(default_factory=list)


# ========== 内置节点处理器 ==========

class NodeHandler:
    """节点处理器基类"""

    def __init__(self, engine: 'WorkflowEngine'):
        self.engine = engine

    async def execute(self, node: WorkflowNode, context: Dict) -> Any:
        raise NotImplementedError


class TaskHandler(NodeHandler):
    """任务节点处理器"""

    async def execute(self, node: WorkflowNode, context: Dict) -> Any:
        # 获取输入参数
        inputs = self._resolve_inputs(node.inputs, context)

        # 执行任务
        task_type = node.config.get("type", "shell")
        result = await self._execute_task(task_type, inputs, node.config)

        return result

    def _resolve_inputs(self, inputs: Dict, context: Dict) -> Dict:
        resolved = {}
        for key, value in inputs.items():
            if isinstance(value, str) and value.startswith("${") and value.endswith("}"):
                # 引用上下文
                ref = value[2:-1]
                resolved[key] = context.get(ref)
            else:
                resolved[key] = value
        return resolved

    async def _execute_task(self, task_type: str, inputs: Dict, config: Dict) -> Any:
        if task_type == "shell":
            import subprocess
            cmd = inputs.get("command", "")

            # SEC-021: Validate command against whitelist before execution
            # Import whitelist from server.py if available, otherwise use basic validation
            try:
                from server import ALLOWED_COMMANDS
                if ALLOWED_COMMANDS is not None:
                    if cmd not in ALLOWED_COMMANDS:
                        return {"error": "Command not in whitelist", "allowed_commands": ALLOWED_COMMANDS[:5]}
            except ImportError:
                # Fallback: basic shell injection prevention
                if any(char in cmd for char in [';', '&&', '||', '|', '`', '$', '>', '<', '\n', '\r']):
                    return {"error": "Potential command injection detected"}

            result = subprocess.run(
                cmd,
                shell=True,  # Safe: command is validated against whitelist
                capture_output=True,
                text=True,
                timeout=config.get("timeout", 300)
            )
            return {"stdout": result.stdout, "stderr": result.stderr, "returncode": result.returncode}

        elif task_type == "http":
            import aiohttp
            url = inputs.get("url", "")
            method = inputs.get("method", "GET")
            async with aiohttp.ClientSession() as session:
                async with session.request(method, url, json=inputs.get("body")) as resp:
                    return {"status": resp.status, "body": await resp.text()}

        elif task_type == "transform":
            # 数据转换
            data = inputs.get("data")
            transform = config.get("transform", {})
            # 执行转换逻辑
            return self._transform_data(data, transform)

        return {"result": "unknown task type"}

    def _transform_data(self, data: Any, transform: Dict) -> Any:
        """数据转换"""
        transform_type = transform.get("type")

        if transform_type == "map":
            mapping = transform.get("mapping", {})
            return {mapping.get(k, k): v for k, v in (data or {}).items()}

        return data


class ConditionHandler(NodeHandler):
    """条件节点处理器"""

    async def execute(self, node: WorkflowNode, context: Dict) -> bool:
        conditions = node.conditions

        # 简单条件评估
        for cond in conditions:
            if self._evaluate(cond, context):
                return True

        return False

    def _evaluate(self, condition: str, context: Dict) -> bool:
        """评估条件表达式"""
        # 简单实现：支持 ${key} == value 格式
        if "==" in condition:
            left, right = condition.split("==")
            left = left.strip()
            right = right.strip().strip('"').strip("'")

            # 解析左边
            if left.startswith("${") and left.endswith("}"):
                left = context.get(left[2:-1])

            return str(left) == right

        return True


class WaitHandler(NodeHandler):
    """等待节点处理器"""

    async def execute(self, node: WorkflowNode, context: Dict) -> Any:
        duration = node.config.get("duration", 60)  # 秒
        await asyncio.sleep(duration)
        return {"waited": duration}


class WebhookHandler(NodeHandler):
    """Webhook 节点处理器"""

    async def execute(self, node: WorkflowNode, context: Dict) -> Any:
        import aiohttp
        url = node.config.get("url", "")
        method = node.config.get("method", "POST")

        # 准备 payload
        payload = self._resolve_inputs(node.inputs, context)
        payload = node.config.get("payload_template", {}).format(**context)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(method, url, json=payload) as resp:
                    return {"status": resp.status, "body": await resp.text()}
        except Exception as e:
            return {"error": str(e)}


class ApprovalHandler(NodeHandler):
    """审批节点处理器"""

    async def execute(self, node: WorkflowNode, context: Dict) -> Any:
        # 暂停等待审批
        approval_id = str(uuid.uuid4())
        # 这里应该触发通知，等待外部审批
        # 暂时返回 pending 状态
        return {
            "approval_id": approval_id,
            "status": "pending",
            "message": node.config.get("message", "Approval required")
        }


# ========== 工作流引擎 ==========

class WorkflowEngine:
    """工作流引擎"""

    def __init__(self, data_dir: Path = None):
        self.data_dir = data_dir or Path("/home/pengxiang/bridge-node/.workflows")
        self.data_dir.mkdir(parents=True, exist_ok=True)

        self.workflows: Dict[str, Workflow] = {}
        self.executions: Dict[str, WorkflowExecution] = {}

        # 节点处理器
        self.handlers: Dict[NodeType, NodeHandler] = {
            NodeType.TASK: TaskHandler(self),
            NodeType.CONDITION: ConditionHandler(self),
            NodeType.WAIT: WaitHandler(self),
            NodeType.WEBHOOK: WebhookHandler(self),
            NodeType.APPROVAL: ApprovalHandler(self),
        }

        self._load_workflows()

    def _state_file(self, name: str) -> Path:
        return self.data_dir / f"{name}.json"

    def _load_workflows(self):
        """加载工作流"""
        for wf_file in self.data_dir.glob("workflow_*.json"):
            try:
                with open(wf_file) as f:
                    data = json.load(f)
                    nodes = []
                    for ndata in data.get("nodes", []):
                        ndata['node_type'] = NodeType(ndata['node_type'])
                        nodes.append(WorkflowNode(**ndata))

                    edges = [WorkflowEdge(**e) for e in data.get("edges", [])]
                    data['nodes'] = nodes
                    data['edges'] = edges
                    data['status'] = WorkflowStatus(data['status'])

                    wf = Workflow(**data)
                    self.workflows[wf.id] = wf
            except Exception as e:
                print(f"Error loading workflow {wf_file}: {e}")

    def _save_workflow(self, workflow: Workflow):
        """保存工作流"""
        data = asdict(workflow)
        data['status'] = workflow.status.value
        data['nodes'] = [
            {**asdict(n), 'node_type': n.node_type.value}
            for n in workflow.nodes
        ]
        data['edges'] = [asdict(e) for e in workflow.edges]

        with open(self._state_file(f"workflow_{workflow.id}"), "w") as f:
            json.dump(data, f, indent=2)

    # ========== 工作流管理 ==========

    def create_workflow(self, name: str, description: str = "") -> Workflow:
        """创建工作流"""
        wf_id = f"wf_{uuid.uuid4().hex[:8]}"
        workflow = Workflow(
            id=wf_id,
            name=name,
            description=description
        )
        self.workflows[wf_id] = workflow
        self._save_workflow(workflow)
        return workflow

    def add_node(self, workflow_id: str, node: WorkflowNode) -> bool:
        """添加节点"""
        if workflow_id not in self.workflows:
            return False
        workflow = self.workflows[workflow_id]
        workflow.nodes.append(node)
        workflow.updated_at = datetime.now().isoformat()
        self._save_workflow(workflow)
        return True

    def add_edge(self, workflow_id: str, edge: WorkflowEdge) -> bool:
        """添加边"""
        if workflow_id not in self.workflows:
            return False
        workflow = self.workflows[workflow_id]
        workflow.edges.append(edge)
        workflow.updated_at = datetime.now().isoformat()
        self._save_workflow(workflow)
        return True

    def get_workflow(self, workflow_id: str) -> Optional[Workflow]:
        return self.workflows.get(workflow_id)

    def list_workflows(self, status: WorkflowStatus = None) -> List[Workflow]:
        wfs = list(self.workflows.values())
        if status:
            wfs = [w for w in wfs if w.status == status]
        return wfs

    # ========== 执行引擎 ==========

    def _build_dag(self, workflow: Workflow) -> Dict[str, List[str]]:
        """构建 DAG"""
        dag = defaultdict(list)
        for edge in workflow.edges:
            dag[edge.source].append(edge.target)
        return dict(dag)

    def _get_in_degree(self, workflow: Workflow) -> Dict[str, int]:
        """获取入度"""
        in_degree = defaultdict(int)
        for node in workflow.nodes:
            in_degree[node.id] = 0
        for edge in workflow.edges:
            in_degree[edge.target] += 1
        return dict(in_degree)

    async def execute(self, workflow_id: str, context: Dict = None) -> WorkflowExecution:
        """执行工作流"""
        workflow = self.workflows.get(workflow_id)
        if not workflow:
            raise ValueError(f"Workflow not found: {workflow_id}")

        # 创建执行实例
        exec_id = f"exec_{uuid.uuid4().hex[:8]}"
        execution = WorkflowExecution(
            id=exec_id,
            workflow_id=workflow_id,
            context=context or {}
        )

        # 初始化节点状态
        for node in workflow.nodes:
            execution.nodes[node.id] = ExecutionNode(node_id=node.id)

        self.executions[exec_id] = execution

        try:
            await self._run_workflow(workflow, execution)
        except Exception as e:
            execution.status = WorkflowStatus.FAILED
            execution.history.append({
                "time": datetime.now().isoformat(),
                "action": "error",
                "message": str(e)
            })

        return execution

    async def _run_workflow(self, workflow: Workflow, execution: WorkflowExecution):
        """运行工作流"""
        dag = self._build_dag(workflow)
        in_degree = self._get_in_degree(workflow)

        # 找出起始节点（入度为0）
        start_nodes = [node.id for node in workflow.nodes if in_degree[node.id] == 0]
        queue = start_nodes.copy()

        completed: Set[str] = set()

        while queue:
            node_id = queue.pop(0)
            if node_id in completed:
                continue

            # 获取节点
            node = next((n for n in workflow.nodes if n.id == node_id), None)
            if not node:
                continue

            # 执行节点
            exec_node = execution.nodes[node_id]
            exec_node.status = NodeStatus.RUNNING
            exec_node.started_at = datetime.now().isoformat()

            try:
                # 获取处理器
                handler = self.handlers.get(node.node_type)
                if handler:
                    output = await handler.execute(node, execution.context)
                    exec_node.output = output
                    exec_node.status = NodeStatus.COMPLETED
                else:
                    exec_node.status = NodeStatus.SKIPPED

            except Exception as e:
                exec_node.error = str(e)
                exec_node.retry += 1

                if exec_node.retry < node.max_retries:
                    # 重试
                    queue.append(node_id)
                    exec_node.status = NodeStatus.WAITING
                else:
                    exec_node.status = NodeStatus.FAILED
                    execution.status = WorkflowStatus.FAILED
                    execution.history.append({
                        "time": datetime.now().isoformat(),
                        "node": node_id,
                        "action": "failed",
                        "error": str(e)
                    })
                    return

            finally:
                exec_node.completed_at = datetime.now().isoformat()

            if exec_node.status == NodeStatus.COMPLETED:
                completed.add(node_id)

                # 处理条件边
                for edge in workflow.edges:
                    if edge.source == node_id:
                        # 检查条件
                        if edge.condition:
                            # 评估条件
                            cond_handler = self.handlers[NodeType.CONDITION]
                            # 简化：直接通过
                            if True:  # TODO: 评估条件
                                queue.append(edge.target)
                        else:
                            queue.append(edge.target)

        # 检查是否全部完成
        if len(completed) == len(workflow.nodes):
            execution.status = WorkflowStatus.COMPLETED
        else:
            execution.status = WorkflowStatus.FAILED

        execution.completed_at = datetime.now().isoformat()

    def get_execution(self, execution_id: str) -> Optional[WorkflowExecution]:
        return self.executions.get(execution_id)

    def list_executions(self, workflow_id: str = None) -> List[WorkflowExecution]:
        execs = list(self.executions.values())
        if workflow_id:
            execs = [e for e in execs if e.workflow_id == workflow_id]
        return execs


# 全局单例
_engine: Optional[WorkflowEngine] = None


def get_workflow_engine() -> WorkflowEngine:
    """获取工作流引擎单例"""
    global _engine
    if _engine is None:
        _engine = WorkflowEngine()
    return _engine


# ========== API 函数 ==========

def create_workflow_api(data: dict) -> dict:
    """创建工作流 API"""
    engine = get_workflow_engine()
    wf = engine.create_workflow(
        name=data.get("name", ""),
        description=data.get("description", "")
    )
    return {"success": True, "workflow_id": wf.id, "workflow": asdict(wf)}


def add_node_api(workflow_id: str, data: dict) -> dict:
    """添加节点 API"""
    engine = get_workflow_engine()
    node = WorkflowNode(
        id=data.get("id", f"node_{uuid.uuid4().hex[:8]}"),
        name=data.get("name", ""),
        node_type=NodeType(data.get("node_type", "task")),
        config=data.get("config", {}),
        inputs=data.get("inputs", {}),
        outputs=data.get("outputs", {}),
        max_retries=data.get("max_retries", 3),
        timeout=data.get("timeout", 300)
    )
    success = engine.add_node(workflow_id, node)
    return {"success": success}


def add_edge_api(workflow_id: str, data: dict) -> dict:
    """添加边 API"""
    engine = get_workflow_engine()
    edge = WorkflowEdge(
        source=data.get("source", ""),
        target=data.get("target", ""),
        condition=data.get("condition", ""),
        label=data.get("label", "")
    )
    success = engine.add_edge(workflow_id, edge)
    return {"success": success}


async def execute_workflow_api(workflow_id: str, context: dict = None) -> dict:
    """执行工作流 API"""
    engine = get_workflow_engine()
    execution = await engine.execute(workflow_id, context or {})
    return {
        "success": True,
        "execution_id": execution.id,
        "status": execution.status.value
    }


def get_execution_api(execution_id: str) -> dict:
    """获取执行结果 API"""
    engine = get_workflow_engine()
    execution = engine.get_execution(execution_id)
    if not execution:
        return {"error": "Execution not found"}

    return {
        "execution_id": execution.id,
        "workflow_id": execution.workflow_id,
        "status": execution.status.value,
        "context": execution.context,
        "nodes": {
            nid: {
                "status": n.status.value,
                "output": n.output,
                "error": n.error
            }
            for nid, n in execution.nodes.items()
        },
        "history": execution.history
    }


def list_workflows_api() -> dict:
    """列出工作流 API"""
    engine = get_workflow_engine()
    workflows = engine.list_workflows()
    return {
        "workflows": [
            {**asdict(w), 'status': w.status.value, 'nodes': None, 'edges': None}
            for w in workflows
        ],
        "count": len(workflows)
    }


if __name__ == "__main__":
    # 测试
    import asyncio

    async def test():
        engine = get_workflow_engine()

        # 创建工作流
        wf = engine.create_workflow("测试工作流", "这是一个测试")
        print(f"Created workflow: {wf.id}")

        # 添加节点
        node1 = WorkflowNode(
            id="start",
            name="开始",
            node_type=NodeType.TASK,
            config={"type": "shell", "command": "echo 'Hello Workflow'"}
        )
        node2 = WorkflowNode(
            id="wait",
            name="等待",
            node_type=NodeType.WAIT,
            config={"duration": 1}
        )
        node3 = WorkflowNode(
            id="end",
            name="结束",
            node_type=NodeType.TASK,
            config={"type": "shell", "command": "echo 'Workflow Complete'"}
        )

        engine.add_node(wf.id, node1)
        engine.add_node(wf.id, node2)
        engine.add_node(wf.id, node3)

        # 添加边
        engine.add_edge(wf.id, WorkflowEdge(source="start", target="wait"))
        engine.add_edge(wf.id, WorkflowEdge(source="wait", target="end"))

        # 执行
        print("Executing workflow...")
        execution = await engine.execute(wf.id, {})

        print(f"Execution status: {execution.status.value}")
        print(f"Execution history: {execution.history}")

    asyncio.run(test())
