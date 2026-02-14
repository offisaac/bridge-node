# BridgeNode

SSH Tunnel Web Interaction Middleware - 通过 SSH 隧道实现本地-集群数据交换、实时监控、文件传输。

## 功能特性

- **LaTeX 编辑器** - 实时渲染 LaTeX 公式，一键复制源码或图片
- **文件传输** - 拖拽上传/下载，支持大文件分片上传
- **命令控制台** - 发送控制命令到远程服务器
- **日志追踪** - 实时查看远程日志文件
- **WebSocket 监控** - 实时隧道状态监控

## 快速开始

### 1. 安装依赖

```bash
cd bridge-node
pip install -r requirements.txt
```

### 2. 启动服务器

```bash
python server.py --port 8080
```

### 3. 建立 SSH 隧道

```bash
# 使用脚本生成
./scripts/generate_ssh.sh -u your_user -h your_host -p 8080

# 或者手动执行
ssh -L 8080:localhost:8080 user@your-cluster -N -f
```

### 4. 访问 Web 界面

打开浏览器访问: http://127.0.0.1:8080

默认登录凭据:
- 用户名: `admin`
- 密码: `password`

## 项目结构

```
bridge-node/
├── server.py              # FastAPI 主服务器
├── config.py              # 配置管理
├── auth.py                # 认证模块
├── tunnel_monitor.py      # SSH 隧道心跳监测
├── log_tailer.py          # 日志尾部追踪
├── file_transfer.py       # 文件上传/下载
├── websocket_manager.py   # WebSocket 连接管理
├── static/
│   └── index.html         # 前端单页应用
├── scripts/
│   └── generate_ssh.sh    # SSH 连接脚本生成器
└── requirements.txt       # Python 依赖
```

## API 端点

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/api/auth/login` | 用户登录获取 Token |
| GET | `/api/status` | 获取系统状态 |
| POST | `/api/logs` | 获取日志内容 |
| POST | `/api/files/upload/init` | 初始化上传 |
| POST | `/api/files/upload/chunk` | 上传分片 |
| POST | `/api/files/upload/complete` | 完成上传 |
| GET | `/api/files/list` | 列出文件 |
| GET | `/api/files/download/{name}` | 下载文件 |
| POST | `/api/command` | 发送控制命令 |
| WS | `/ws/monitor` | WebSocket 实时监控 |

## 配置

在 `server.py` 中修改默认用户名密码:

```python
DEFAULT_USERNAME = "admin"
DEFAULT_PASSWORD = "password"
```

或者通过环境变量配置端口:

```bash
PORT=9000 python server.py
```
