#!/bin/bash
# BridgeNode 一键启动脚本

# 设置工作目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== BridgeNode 启动脚本 ===${NC}"

# 检查 Python 环境
if ! command -v python3 &> /dev/null; then
    echo -e "${YELLOW}警告: 未找到 python3${NC}"
    exit 1
fi

# 检查依赖
if [ ! -f "requirements.txt" ]; then
    echo -e "${YELLOW}错误: 未找到 requirements.txt${NC}"
    exit 1
fi

# 启动服务器
echo -e "${GREEN}启动 BridgeNode 服务...${NC}"
export PORT=8888
python3 server.py --port 8888
