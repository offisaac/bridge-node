# Bridge-Node 多 Claude 协作方案

## 核心原则

- **串行协作**：同一时间只有一个 Claude 在修改代码
- **Git 管理**：所有修改通过 Git 追踪
- **状态文件**：实时共享工作进度

---

## 1. 任务分配机制

### 1.1 任务创建

发起方（你）在任务文件中声明要做什么：

**文件**: `bridge-node/.collab/tasks.md`

```markdown
# 协作任务清单

## 当前任务
- CLAUDE_A: server.py - 添加 WebSocket 心跳机制
- CLAUDE_B: 待分配

## 待处理任务
- [ ] auth.py - 添加 Token 刷新逻辑
- [ ] file_transfer.py - 优化大文件分片
- [ ] config.py - 添加配置热重载
- [ ] 测试 - 编写单元测试

## 完成记录
- 2024-XX-XX CLAUDE_A: 修复了 WebSocket 断连问题
```

### 1.2 分配方式

告诉某个 Claude 要做什么：
```
"你是 CLAUDE_A，请处理 server.py - 添加 WebSocket 心跳机制"
```

告诉另一个 Claude：
```
"你是 CLAUDE_B，请处理 auth.py - 添加 Token 刷新逻辑"
```

---

## 2. 状态同步机制

### 2.1 工作状态文件

**文件**: `bridge-node/.collab/status.json`

```json
{
  "version": 2,
  "active": {
    "CLAUDE_A": {
      "file": "server.py",
      "task": "添加 WebSocket 心跳机制",
      "started_at": "2024-01-01T10:00:00",
      "git_branch": "feat/websocket-heartbeat",
      "progress": "正在修改 _heartbeat 方法"
    },
    "CLAUDE_B": {
      "file": "auth.py",
      "task": "添加 Token 刷新逻辑",
      "started_at": "2024-01-01T10:05:00",
      "git_branch": "feat/token-refresh",
      "progress": "正在实现 refresh_token 函数"
    }
  },
  "queue": [],
  "last_sync": "2024-01-01T10:10:00"
}
```

### 2.2 同步命令

每个 Claude 开始工作时：

```bash
# 1. 拉取最新状态
cd bridge-node && git pull
cat .collab/status.json

# 2. 检查要修改的文件是否被占用
# 如果 file 字段与他人重复，则不能开始

# 3. 声明自己的工作
# 更新 status.json 的 active 字段，声明占用某个文件
```

每个 Claude 完成任务后：

```bash
# 1. 提交自己的修改
cd bridge-node && git add -A && git commit -m "feat: 描述修改"

# 2. 释放文件占用
# 从 status.json 的 active 中移除自己的记录

# 3. 推送更改
git push
```

---

## 3. 冲突检测机制

### 3.1 修改前检查

每个 Claude 在修改文件前必须执行：

```bash
# 检查文件状态
cd bridge-node
git status <要修改的文件>

# 如果有未提交的本地修改，说明其他 Claude 正在工作
# 必须先 git pull 获取最新版本

# 如果远程有新提交，也必须先 pull
git fetch origin
git log HEAD..origin/main --oneline
```

### 3.2 修改时保护

```python
# 在 server.py 顶部添加注释标记当前处理者
# 处理中: CLAUDE_A - WebSocket 心跳
# 开始时间: 2024-01-01 10:00
```

### 3.3 修改后验证

```bash
# 提交前确保没有冲突
git diff --cached
git status
```

---

## 4. 工作流程

### 4.1 CLAUDE_A 工作流程

```
1. 读取 .collab/tasks.md 确认任务
2. 读取 .collab/status.json 检查文件占用
3. 声明占用: 更新 status.json，标记开始
4. 修改代码
5. 测试功能
6. 提交: git add -A && git commit -m "feat: 具体描述"
7. 释放占用: 更新 status.json，标记完成
8. 推送: git push
9. 汇报: 告知用户完成状态
```

### 4.2 CLAUDE_B 工作流程

同上，从步骤 1 开始。

---

## 5. 协作命令约定

### 5.1 分配任务

```
"CLAUDE_A 处理 server.py，CLAUDE_B 处理 auth.py"
```

### 5.2 切换任务

```
"CLAUDE_A 停止当前任务，改为处理 config.py"
```

### 5.3 查询状态

```
"现在谁在处理什么？"
→ 读取 .collab/status.json 回答
```

### 5.4 同步检查

```
"检查最新代码状态"
→ 执行 git fetch && git pull 并汇报
```

---

## 6. 目录结构

```
bridge-node/
├── .collab/              # 协作目录
│   ├── tasks.md         # 任务清单
│   ├── status.json     # 实时状态
│   └── history.md      # 完成记录
├── server.py
├── auth.py
├── file_transfer.py
├── config.py
├── ...
```

---

## 7. 初始化

首次协作前，先创建协作目录：

```bash
cd bridge-node
mkdir -p .collab

# 初始化任务文件
cat > .collab/tasks.md << 'EOF'
# 协作任务清单

## 当前任务
（无）

## 待处理任务
- [ ] server.py - 待认领
- [ ] auth.py - 待认领
- [ ] file_transfer.py - 待认领
- [ ] config.py - 待认领

## 完成记录
（无）
EOF

# 初始化状态文件
cat > .collab/status.json << 'EOF'
{
  "version": 1,
  "active": {},
  "queue": [],
  "last_sync": null
}
EOF

# 初始化历史记录
cat > .collab/history.md << 'EOF'
# 完成记录

## 2024 年
（无记录）
EOF

git add .collab/
git commit -m "chore: 初始化协作目录"
git push
```

---

## 8. 异常处理

| 情况 | 处理方式 |
|------|----------|
| CLAUDE_A 崩溃未释放 | CLAUDE_B 可以强制接管，更新 status.json |
| 代码冲突 | 手动合并后提交 |
| 需要紧急修改 | 直接修改，事后同步 |

---

## 总结

1. **任务分配**: 通过 tasks.md 声明
2. **状态同步**: 通过 state.json 实时共享
3. **冲突检测**: 每次修改前 git pull
4. **串行原则**: 同一文件同一时间只允许一个 Claude 修改

---

## 快速查看当前状态

```bash
# 查看当前迭代进度
cat bridge-node/.collab/state.json

# 查看所有已完成任务
cat bridge-node/.collab/state.json | jq '.COMPLETED_TASKS'
```
