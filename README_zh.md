# BridgeNode

<div align="center">

[![PyPI 版本](https://img.shields.io/pypi/v/bridgenode)](https://pypi.org/project/bridgenode/)
[![Python 版本](https://img.shields.io/pypi/pyversions/bridgenode)](https://pypi.org/project/bridgenode/)
[![许可证](https://img.shields.io/pypi/l/bridgenode)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/offisaac/bridge-node)](https://github.com/offisaac/bridge-node/stargazers)

**English** | [中文](README_zh.md)

现代化的 SSH 隧道 Web 界面，实现本地-集群数据交换、实时监控和文件传输。

</div>

## 特性

- 📁 **文件传输** - 拖拽上传/下载，支持大文件分片传输
- 📊 **实时监控** - WebSocket 驱动的隧道状态和系统指标
- 📝 **日志追踪** - 实时流式读取远程日志文件
- 💻 **命令控制台** - 在远程服务器上执行预定义或自定义命令
- 🎨 **精美 UI** - 深色/浅色主题，现代设计 (Notion/Linear 风格)

## 快速开始

### 安装

```bash
git clone https://github.com/offisaac/bridge-node.git
cd bridge-node
pip install -r requirements.txt
```

### 配置

设置环境变量：

```bash
# 必需：设置凭据
export BRIDGENODE_USERNAME=admin
export BRIDGENODE_PASSWORD=your_secure_password

# 可选：自定义端口（默认：8080）
export PORT=8080
```

### 运行

```bash
python server.py --port 8080
```

### 访问

浏览器打开：`http://localhost:8080`

创建 SSH 隧道访问远程服务器：

```bash
ssh -L 8080:localhost:8080 user@your-cluster -N -f
```

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
├── rate_limiter.py        # API 速率限制
├── static/                # 前端静态资源
│   ├── index.html         # 主页面
│   ├── styles/            # CSS 样式
│   └── js/               # JavaScript 模块
├── scripts/               # 脚本工具
│   └── generate_ssh.sh    # SSH 连接脚本生成器
├── tests/                 # 测试套件
├── k8s/                   # Kubernetes 部署配置
├── LICENSE                # MIT 许可证
├── README.md              # 英文文档
└── requirements.txt       # Python 依赖
```

## 部署

### Docker

```bash
docker build -t bridegenode .
docker run -d -p 8080:8080 \
  -e BRIDGENODE_USERNAME=admin \
  -e BRIDGENODE_PASSWORD=your_password \
  bridgenode
```

### Kubernetes

```bash
kubectl apply -f k8s/
```

## 安全

- JWT 认证
- API 速率限制
- 命令白名单
- 路径遍历防护

**重要**：生产环境请修改默认凭据！

## 许可证

MIT 许可证 - 详见 [LICENSE](LICENSE) 文件。

---

<div align="center">

由 [offisaac](https://github.com/offisaac) 用 ❤️打造

</div>
