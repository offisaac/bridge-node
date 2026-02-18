# BridgeNode 自主改进提案 (Autonomous Backlog)

**Agent**: agent-driver
**Date**: 2026-02-17
**Iteration**: 0/100

---

## 1. 项目概况

### 1.1 核心架构
- **项目**: BridgeNode - SSH Tunnel Web Interaction Middleware
- **主文件**: server.py (23,349 行)
- **文件总数**: 349 个文件
- **Agent 模块**: 130+ 个 (agent-*.js + agent_*.py)
- **框架**: FastAPI + uvicorn + WebSocket

### 1.2 扫描的 Agent 文件
- **JavaScript**: agent-acl.js, agent-adapter.js, agent-alerting-2.js, 等 73 个
- **Python**: agent_antivirus.py, agent_audit.py, agent_backup2.py, 等 61 个

---

## 2. 发现的问题

### 2.1 代码重复 (Code Duplication)

| 重复类型 | 发现位置 | 严重程度 |
|---------|---------|---------|
| 枚举重复定义 | agent_queue.py, agent_queue2.py 都有 QueueType, TaskState | HIGH |
| 数据类重复 | 多个 agent 文件重复定义 QueueConfig, TaskConfig | HIGH |
| 导入重复 | 30+ 文件重复 `from typing import Dict, List, Optional` | MEDIUM |
| asyncio 重复导入 | server.py 重复 `import asyncio` (行 3, 19, 5401, 5681) | MEDIUM |

**示例**:
```python
# agent_queue.py
class QueueType(str, Enum):
    FIFO = "fifo"
    LIFO = "lifo"

# agent_queue2.py (另一个完全不同的 QueueType!)
class QueueType(str, Enum):
    RABBITMQ = "rabbitmq"
    KAFKA = "kafka"
```

### 2.2 缺失测试 (Missing Tests)

- **当前状态**: 无专门测试文件
- **风险**: 130+ agent 模块无单元测试覆盖
- **建议**: 添加 pytest 测试框架和基础测试用例

### 2.3 性能瓶颈 (Performance Bottlenecks)

| 问题 | 位置 | 影响 |
|-----|------|------|
| 启动时大量导入 | server.py 行 28-192 | 启动时间过长 (23,349 行单文件) |
| 同步导入阻塞 | 所有 import 语句 | 冷启动延迟 |
| 重复导入 | asyncio 在 server.py 中导入 4 次 | 内存浪费 |

### 2.4 安全隐患 (Security Issues)

| 问题 | 发现位置 | 严重程度 |
|-----|---------|---------|
| 硬编码密码 | agent_queue2.py:49 `rabbitmq_password: str = "guest"` | HIGH |
| 弱密码比较 | agent-identity.js:391 `password !== expectedPassword` | MEDIUM |
| 明文凭证 | request-formatter.js:293 凭证明文传输 | HIGH |

---

## 3. 改进提案

### 3.1 代码重构 (优先级: HIGH)

1. **抽取共享模块**: 创建 `shared/enums.py` 和 `shared/dataclasses.py`
   - 统一 QueueType, TaskState, QueueStatus 等枚举
   - 统一 QueueConfig, TaskConfig 等数据类

2. **拆分 server.py**:
   - 将 23,349 行拆分为模块化组件
   - 使用懒加载 (lazy import) 减少启动时间

### 3.2 测试覆盖 (优先级: HIGH)

1. **添加测试框架**:
   ```
   tests/
   ├── test_agents/
   │   ├── test_agent_queue.py
   │   ├── test_agent_security.py
   │   └── ...
   ├── test_api/
   │   └── test_server.py
   └── conftest.py
   ```

2. **目标覆盖率**: 核心模块 80%+

### 3.3 性能优化 (优先级: MEDIUM)

1. **实现懒加载**:
   ```python
   @lazy_import
   def get_agent_queue():
       from agent_queue import agent_queue
       return agent_queue
   ```

2. **异步并行导入**: 使用 `asyncio.gather()` 并行加载非依赖模块

### 3.4 安全加固 (优先级: HIGH)

1. **移除硬编码凭证**: 使用环境变量或密钥管理系统
2. **安全比较**: 使用 constant-time 比较防止时序攻击
3. **凭证加密**: 传输层使用加密而非明文

---

## 4. 实施计划

| 阶段 | 任务 | 预计工时 |
|-----|------|---------|
| Phase 1 | 创建共享模块 (enums, dataclasses) | 4h |
| Phase 2 | 添加基础测试框架和覆盖率 | 8h |
| Phase 3 | 懒加载实现和 server.py 拆分 | 12h |
| Phase 4 | 安全修复 (凭证、比较) | 4h |

---

## 5. 风险评估

| 风险 | 影响 | 缓解措施 |
|-----|------|---------|
| 重构破坏现有功能 | HIGH | 完整测试覆盖 |
| 懒加载引入延迟 | MEDIUM | 监控启动性能 |
| 安全修复导致兼容性问题 | MEDIUM | 渐进式迁移 |

---

## 6. 成功指标

- [ ] 代码重复减少 60%+
- [ ] 单元测试覆盖达到 60%+
- [ ] 启动时间减少 30%+
- [ ] 安全漏洞修复 100%

---

**提案生成完毕，等待 PM 审批**
