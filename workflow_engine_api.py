"""
Workflow Engine API Routes
工作流引擎 API 路由集成

Usage:
    from workflow_engine_api import workflow_bp
    app.register_blueprint(workflow_bp, url_prefix="/api/workflow")
"""

import json
from flask import Blueprint, request, jsonify
from workflow_engine import (
    get_workflow_engine, NodeType, WorkflowStatus, asdict
)
import asyncio

workflow_bp = Blueprint('workflow', __name__)


# ========== Workflow APIs ==========

@workflow_bp.route("/workflows", methods=["POST"])
def create_workflow():
    """创建工作流"""
    data = request.json or {}
    result = create_workflow_api(data)
    return jsonify(result)


@workflow_bp.route("/workflows", methods=["GET"])
def list_workflows():
    """列出工作流"""
    result = list_workflows_api()
    return jsonify(result)


@workflow_bp.route("/workflows/<workflow_id>", methods=["GET"])
def get_workflow(workflow_id):
    """获取工作流详情"""
    engine = get_workflow_engine()
    wf = engine.get_workflow(workflow_id)
    if not wf:
        return jsonify({"error": "Workflow not found"}), 404

    return jsonify({
        **asdict(wf),
        'status': wf.status.value,
        'nodes': [
            {**asdict(n), 'node_type': n.node_type.value}
            for n in wf.nodes
        ],
        'edges': [asdict(e) for e in wf.edges]
    })


@workflow_bp.route("/workflows/<workflow_id>", methods=["DELETE"])
def delete_workflow(workflow_id):
    """删除工作流"""
    engine = get_workflow_engine()
    if workflow_id in engine.workflows:
        del engine.workflows[workflow_id]
        return jsonify({"success": True})
    return jsonify({"error": "Workflow not found"}), 404


# ========== Node APIs ==========

@workflow_bp.route("/workflows/<workflow_id>/nodes", methods=["POST"])
def add_node(workflow_id):
    """添加节点"""
    data = request.json or {}
    result = add_node_api(workflow_id, data)
    return jsonify(result)


@workflow_bp.route("/workflows/<workflow_id>/nodes/<node_id>", methods=["DELETE"])
def delete_node(workflow_id, node_id):
    """删除节点"""
    engine = get_workflow_engine()
    wf = engine.get_workflow(workflow_id)
    if not wf:
        return jsonify({"error": "Workflow not found"}), 404

    wf.nodes = [n for n in wf.nodes if n.id != node_id]
    # 删除相关的边
    wf.edges = [e for e in wf.edges if e.source != node_id and e.target != node_id]

    return jsonify({"success": True})


# ========== Edge APIs ==========

@workflow_bp.route("/workflows/<workflow_id>/edges", methods=["POST"])
def add_edge(workflow_id):
    """添加边"""
    data = request.json or {}
    result = add_edge_api(workflow_id, data)
    return jsonify(result)


@workflow_bp.route("/workflows/<workflow_id>/edges", methods=["DELETE"])
def delete_edge(workflow_id):
    """删除边"""
    data = request.json or {}
    source = data.get("source")
    target = data.get("target")

    engine = get_workflow_engine()
    wf = engine.get_workflow(workflow_id)
    if not wf:
        return jsonify({"error": "Workflow not found"}), 404

    wf.edges = [e for e in wf.edges if not (e.source == source and e.target == target)]

    return jsonify({"success": True})


# ========== Execution APIs ==========

@workflow_bp.route("/workflows/<workflow_id>/execute", methods=["POST"])
def execute_workflow(workflow_id):
    """执行工作流"""
    data = request.json or {}
    context = data.get("context", {})

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    result = loop.run_until_complete(execute_workflow_api(workflow_id, context))
    return jsonify(result)


@workflow_bp.route("/executions", methods=["GET"])
def list_executions():
    """列出执行记录"""
    workflow_id = request.args.get("workflow_id")
    engine = get_workflow_engine()
    executions = engine.list_executions(workflow_id)

    return jsonify({
        "executions": [
            {
                "id": e.id,
                "workflow_id": e.workflow_id,
                "status": e.status.value,
                "started_at": e.started_at,
                "completed_at": e.completed_at
            }
            for e in executions
        ],
        "count": len(executions)
    })


@workflow_bp.route("/executions/<execution_id>", methods=["GET"])
def get_execution(execution_id):
    """获取执行详情"""
    result = get_execution_api(execution_id)
    if "error" in result:
        return jsonify(result), 404
    return jsonify(result)


@workflow_bp.route("/executions/<execution_id>/cancel", methods=["POST"])
def cancel_execution(execution_id):
    """取消执行"""
    engine = get_workflow_engine()
    execution = engine.get_execution(execution_id)

    if not execution:
        return jsonify({"error": "Execution not found"}), 404

    execution.status = WorkflowStatus.CANCELLED
    return jsonify({"success": True})


# ========== Templates ==========

@workflow_bp.route("/templates", methods=["GET"])
def list_templates():
    """列出工作流模板"""
    templates = [
        {
            "id": "simple_shell",
            "name": "简单 Shell 命令",
            "description": "执行单个 Shell 命令",
            "nodes": [
                {"id": "start", "name": "执行命令", "node_type": "task", "config": {"type": "shell", "command": "echo 'Hello'"}}
            ],
            "edges": []
        },
        {
            "id": "sequential",
            "name": "顺序执行",
            "description": "顺序执行多个任务",
            "nodes": [
                {"id": "step1", "name": "步骤1", "node_type": "task", "config": {"type": "shell", "command": "echo 'Step 1'"}},
                {"id": "step2", "name": "步骤2", "node_type": "task", "config": {"type": "shell", "command": "echo 'Step 2'"}},
                {"id": "step3", "name": "步骤3", "node_type": "task", "config": {"type": "shell", "command": "echo 'Step 3'"}}
            ],
            "edges": [
                {"source": "step1", "target": "step2"},
                {"source": "step2", "target": "step3"}
            ]
        },
        {
            "id": "webhook_trigger",
            "name": "Webhook 触发",
            "description": "Webhook 触发 + HTTP 请求",
            "nodes": [
                {"id": "trigger", "name": "Webhook 触发", "node_type": "webhook", "config": {}},
                {"id": "request", "name": "HTTP 请求", "node_type": "task", "config": {"type": "http", "url": "http://example.com"}}
            ],
            "edges": [
                {"source": "trigger", "target": "request"}
            ]
        }
    ]
    return jsonify({"templates": templates})
