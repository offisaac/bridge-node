# BridgeNode API 契约文档

本文档定义了 BridgeNode 后端服务的所有 API 接口，供前端开发者使用。

## 基础信息

- **Base URL**: `http://<server>:<port>/api`
- **认证方式**: Bearer Token (Header: `Authorization: Bearer <token>`)
- **文件上传最大**: 100MB (单文件)
- **PDF文件最大**: 10MB

---

## 1. 流式文件下载

### `GET /api/fs/download`

流式下载集群文件。

**参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| path | string | 是 | 文件在集群上的绝对路径 |

**Headers**:
| Header | 说明 |
|--------|------|
| Content-Length | 文件大小（供前端计算进度）|
| Content-Disposition | `attachment; filename="xxx"`（强制下载）|

**响应示例**:
```
HTTP/1.1 200 OK
Content-Type: application/octet-stream
Content-Length: 1234567
Content-Disposition: attachment; filename="example.pdf"

<file binary content>
```

**错误响应**:
- 404: 文件不存在
- 400: 路径不是文件

---

## 2. 分块文件上传

### `POST /api/fs/upload`

分块上传文件到集群指定路径，使用 `CLUSTER_UPLOAD_DIR` 环境变量指定目标目录。

**参数** (Form Data):
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| destination | string | 是 | 目标路径（支持绝对路径或相对路径）|
| filename | string | 否 | 文件名（当 destination 是目录时使用）|
| chunk_index | int | 否 | 分块序号（从 0 开始）|
| total_chunks | int | 否 | 总分块数（大于 1 表示分块上传）|
| upload_id | string | 否 | 上传会话 ID（分块上传时必填）|
| chunk | file | 否 | 文件块内容 |

**环境变量**:
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| CLUSTER_UPLOAD_DIR | `/tmp/cluster_uploads` | 集群上传目录 |

**单文件上传示例**:
```bash
curl -X POST "http://localhost:8888/api/fs/upload?destination=/home/user/data" \
  -H "Authorization: Bearer <token>" \
  -F "chunk=@/path/to/file.pdf"
```

**分块上传示例**:
```bash
# 1. 初始化上传 (获取 upload_id)
# 2. 上传各个分块
curl -X POST "http://localhost:8888/api/fs/upload?destination=/home/user/data&chunk_index=0&total_chunks=3&upload_id=<uuid>" \
  -H "Authorization: Bearer <token>" \
  -F "chunk=@chunk_0.bin"

# 3. 最后一个分块上传完成后自动合并
```

**成功响应**:
```json
{
  "success": true,
  "path": "/home/user/data/example.pdf",
  "filename": "example.pdf",
  "complete": true
}
```

**分块响应**:
```json
{
  "success": true,
  "chunk_index": 0,
  "total_chunks": 3,
  "complete": false,
  "upload_id": "uuid-xxx"
}
```

---

## 3. 上下文提交

### `POST /api/context/submit`

提交上下文内容，支持 PDF 文件解析和文本输入，存入 JSON 数据库并返回 UUID。

**参数** (multipart/form-data):
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 否 | 上下文标题 |
| description | string | 否 | 文本描述 |
| file | file | 否 | 上传文件（支持 PDF 和文本文件）|

**PDF 解析**:
- 使用 `pypdf` 库提取 PDF 文本内容
- 最大 PDF 文件大小: 10MB
- 非 PDF 文件尝试以 UTF-8 文本读取

**请求示例**:
```bash
curl -X POST "http://localhost:8888/api/context/submit" \
  -H "Authorization: Bearer <token>" \
  -F "title=项目文档" \
  -F "description=这是关于xxx的说明" \
  -F "file=@document.pdf"
```

**成功响应**:
```json
{
  "success": true,
  "context_id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "项目文档",
  "content_length": 12345,
  "pdf_extracted": true,
  "created_at": "2024-01-15T10:30:00"
}
```

### `GET /api/context/list`

列出所有上下文。

**参数**:
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| limit | int | 20 | 返回数量限制 |

**响应**:
```json
{
  "success": true,
  "total": 5,
  "contexts": [...]
}
```

### `GET /api/context/{context_id}`

获取指定上下文详情。

### `DELETE /api/context/{context_id}`

删除指定上下文。

---

## 4. Claude Hook 接口

### `POST /api/internal/claude_hook`

供大模型工具调用的内部接口，收到数据后立刻通过 SSE 广播给前端。

**参数** (JSON Body):
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | 是 | 输出内容 |
| label | string | 否 | 标签 (默认: "Claude Output") |
| metadata | object | 否 | 额外元数据 |

**请求示例**:
```bash
curl -X POST "http://localhost:8888/api/internal/claude_hook" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "content": "分析结果：xxx",
    "label": "AI Analysis",
    "metadata": {"task_id": "123"}
  }'
```

**成功响应**:
```json
{
  "success": true,
  "message": "Output broadcasted via SSE",
  "timestamp": "2024-01-15T10:30:00.123456"
}
```

---

## 5. SSE 输出流

### `GET /api/stream/output`

Server-Sent Events 流，当 `claude_hook` 收到数据时，通过 SSE 广播给前端。

**Headers**:
| Header | 值 |
|--------|------|
| Accept | text/event-stream |

**响应格式**:
```
data: {"type": "claude_output", "content": "...", "label": "...", "timestamp": "..."}

data: {"type": "connected", "message": "SSE stream connected"}

data: {"type": "heartbeat", "timestamp": "..."}
```

**事件类型**:
| 类型 | 说明 |
|------|------|
| claude_output | Claude 输出数据 |
| connected | SSE 连接成功 |
| heartbeat | 心跳保活 (每30秒) |

**前端使用示例** (JavaScript):
```javascript
const eventSource = new EventSource('/api/stream/output', {
  headers: { 'Authorization': 'Bearer <token>' }
});

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);

  if (data.type === 'claude_output') {
    // 处理 Claude 输出
    displayOutput(data.content, data.label);
  } else if (data.type === 'connected') {
    console.log('SSE connected');
  }
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
};
```

---

## 6. 额外接口 (向后兼容)

### `POST /api/claude/push`

与 `claude_hook` 功能相同，用于向后兼容。

---

## 错误响应格式

所有错误响应遵循统一格式:

```json
{
  "detail": "错误详细描述"
}
```

或带有错误码:

```json
{
  "error": "invalid_credentials",
  "message": "用户名或密码错误",
  "hint": "请检查用户名和密码是否正确"
}
```

**HTTP 状态码**:
| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 404 | 资源不存在 |
| 413 | 文件过大 |
| 500 | 服务器内部错误 |

---

## 认证

所有 API (除 `/api/auth/login` 外) 需要在 Header 中提供 token:

```
Authorization: Bearer <token>
```

获取 Token:
```bash
# 方式1: 用户登录
curl -X POST "http://localhost:8888/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "xxx"}'

# 方式2: 获取当前 token
curl -X GET "http://localhost:8888/api/auth/token"
```

---

## 完整请求示例

### 文件上传 + 通知 Claude

```bash
# 1. 上传文件
curl -X POST "http://localhost:8888/api/fs/upload?destination=/data" \
  -H "Authorization: Bearer xxx" \
  -F "chunk=@data.csv"

# 2. 提交上下文
curl -X POST "http://localhost:8888/api/context/submit" \
  -H "Authorization: Bearer xxx" \
  -F "title=数据文件" \
  -F "file=@report.pdf"

# 3. Claude Hook 通知 (可选)
curl -X POST "http://localhost:8888/api/internal/claude_hook" \
  -H "Authorization: Bearer xxx" \
  -H "Content-Type: application/json" \
  -d '{"content": "文件处理完成", "label": "System"}'
```

---

## 前端集成建议

1. **SSE 连接**: 使用 `EventSource` 接收实时输出，设置重连机制
2. **文件上传**: 大文件使用分块上传，显示进度条
3. **PDF 预览**: 上传后可调用 `/api/context/{id}` 获取解析后的文本
4. **错误处理**: 对 401 错误引导用户重新登录

---

*Generated for BridgeNode v1.0.0*
