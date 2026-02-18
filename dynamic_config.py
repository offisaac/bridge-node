"""BridgeNode Dynamic Configuration Center

动态配置中心 - 热更新、运行时修改配置
支持配置变更推送、版本控制、回滚
"""
import os
import json
import time
import hashlib
import threading
from typing import Any, Optional, Dict, List, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import copy


class ConfigScope(str, Enum):
    """Configuration scope."""
    GLOBAL = "global"       # 全局配置
    USER = "user"           # 用户级配置
    SESSION = "session"    # 会话级配置
    RUNTIME = "runtime"    # 运行时配置


class ConfigType(str, Enum):
    """Configuration value types."""
    STRING = "string"
    NUMBER = "number"
    BOOLEAN = "boolean"
    JSON = "json"
    ARRAY = "array"


@dataclass
class ConfigEntry:
    """Configuration entry."""
    key: str
    value: Any
    scope: ConfigScope
    config_type: ConfigType
    default_value: Any
    description: str = ""
    modified_at: float = field(default_factory=time.time)
    modified_by: str = ""
    version: int = 1
    validators: List[str] = field(default_factory=list)


@dataclass
class ConfigHistory:
    """Configuration change history."""
    key: str
    old_value: Any
    new_value: Any
    modified_at: float
    modified_by: str
    version: int


class DynamicConfig:
    """动态配置核心类"""

    def __init__(self):
        self._configs: Dict[str, ConfigEntry] = {}
        self._history: Dict[str, List[ConfigHistory]] = {}
        self._lock = threading.RLock()
        self._change_listeners: List[Callable] = []

        # 初始化默认配置
        self._init_default_configs()

    def _init_default_configs(self):
        """初始化默认配置"""
        defaults = [
            ConfigEntry(
                key="system.max_connections",
                value=100,
                scope=ConfigScope.GLOBAL,
                config_type=ConfigType.NUMBER,
                default_value=100,
                description="最大连接数"
            ),
            ConfigEntry(
                key="system.request_timeout",
                value=30,
                scope=ConfigScope.GLOBAL,
                config_type=ConfigType.NUMBER,
                default_value=30,
                description="请求超时时间(秒)"
            ),
            ConfigEntry(
                key="cache.enabled",
                value=True,
                scope=ConfigScope.GLOBAL,
                config_type=ConfigType.BOOLEAN,
                default_value=True,
                description="缓存开关"
            ),
            ConfigEntry(
                key="cache.default_ttl",
                value=3600,
                scope=ConfigScope.GLOBAL,
                config_type=ConfigType.NUMBER,
                default_value=3600,
                description="缓存默认TTL(秒)"
            ),
            ConfigEntry(
                key="rate_limit.enabled",
                value=True,
                scope=ConfigScope.GLOBAL,
                config_type=ConfigType.BOOLEAN,
                default_value=True,
                description="限流开关"
            ),
            ConfigEntry(
                key="rate_limit.requests_per_minute",
                value=60,
                scope=ConfigScope.GLOBAL,
                config_type=ConfigType.NUMBER,
                default_value=60,
                description="每分钟请求限制"
            ),
            ConfigEntry(
                key="logging.level",
                value="info",
                scope=ConfigScope.GLOBAL,
                config_type=ConfigType.STRING,
                default_value="info",
                description="日志级别"
            ),
            ConfigEntry(
                key="feature.news_api",
                value=True,
                scope=ConfigScope.GLOBAL,
                config_type=ConfigType.BOOLEAN,
                default_value=True,
                description="新闻API功能开关"
            ),
            ConfigEntry(
                key="feature.persist_api",
                value=True,
                scope=ConfigScope.GLOBAL,
                config_type=ConfigType.BOOLEAN,
                default_value=True,
                description="持久化API功能开关"
            ),
        ]

        with self._lock:
            for config in defaults:
                self._configs[config.key] = config
                self._history[config.key] = []

    def get(self, key: str, default: Any = None) -> Any:
        """获取配置值"""
        with self._lock:
            config = self._configs.get(key)
            return config.value if config else default

    def set(
        self,
        key: str,
        value: Any,
        scope: ConfigScope = ConfigScope.GLOBAL,
        config_type: ConfigType = None,
        description: str = "",
        modified_by: str = "system"
    ) -> bool:
        """设置配置值"""
        with self._lock:
            existing = self._configs.get(key)

            # 确定类型
            if config_type is None:
                if existing:
                    config_type = existing.config_type
                else:
                    config_type = self._infer_type(value)

            # 验证值
            if not self._validate(key, value):
                return False

            # 获取默认值
            default_value = existing.default_value if existing else value

            # 创建或更新配置
            config = ConfigEntry(
                key=key,
                value=value,
                scope=scope,
                config_type=config_type,
                default_value=default_value,
                description=description or (existing.description if existing else ""),
                modified_at=time.time(),
                modified_by=modified_by,
                version=(existing.version + 1) if existing else 1
            )

            # 保存历史
            if existing:
                history = ConfigHistory(
                    key=key,
                    old_value=existing.value,
                    new_value=value,
                    modified_at=time.time(),
                    modified_by=modified_by,
                    version=config.version
                )
                self._history.setdefault(key, []).append(history)
                # 只保留最近50条历史
                if len(self._history[key]) > 50:
                    self._history[key] = self._history[key][-50:]

            self._configs[key] = config

            # 通知监听器
            self._notify_listeners(key, value)

            return True

    def _infer_type(self, value: Any) -> ConfigType:
        """推断配置类型"""
        if isinstance(value, bool):
            return ConfigType.BOOLEAN
        elif isinstance(value, int):
            return ConfigType.NUMBER
        elif isinstance(value, float):
            return ConfigType.NUMBER
        elif isinstance(value, str):
            return ConfigType.STRING
        elif isinstance(value, list):
            return ConfigType.ARRAY
        elif isinstance(value, dict):
            return ConfigType.JSON
        return ConfigType.STRING

    def _validate(self, key: str, value: Any) -> bool:
        """验证配置值"""
        config = self._configs.get(key)
        if not config:
            return True  # 新配置不验证

        # 类型验证
        if config.config_type == ConfigType.NUMBER:
            if not isinstance(value, (int, float)):
                return False
        elif config.config_type == ConfigType.BOOLEAN:
            if not isinstance(value, bool):
                return False
        elif config.config_type == ConfigType.STRING:
            if not isinstance(value, str):
                return False

        return True

    def delete(self, key: str) -> bool:
        """删除配置"""
        with self._lock:
            if key in self._configs:
                del self._configs[key]
                return True
            return False

    def reset(self, key: str) -> bool:
        """重置为默认值"""
        with self._lock:
            config = self._configs.get(key)
            if not config or config.value == config.default_value:
                return False

            old_value = config.value
            config.value = config.default_value
            config.version += 1
            config.modified_at = time.time()
            config.modified_by = "system"

            # 保存历史
            history = ConfigHistory(
                key=key,
                old_value=old_value,
                new_value=config.default_value,
                modified_at=time.time(),
                modified_by="system",
                version=config.version
            )
            self._history.setdefault(key, []).append(history)

            self._notify_listeners(key, config.default_value)
            return True

    def get_all(self, scope: ConfigScope = None) -> Dict[str, Any]:
        """获取所有配置"""
        with self._lock:
            if scope:
                return {
                    k: v.value
                    for k, v in self._configs.items()
                    if v.scope == scope
                }
            return {k: v.value for k, v in self._configs.items()}

    def get_config_info(self, key: str) -> Optional[Dict]:
        """获取配置详情"""
        with self._lock:
            config = self._configs.get(key)
            if not config:
                return None

            return {
                "key": config.key,
                "value": config.value,
                "scope": config.scope.value,
                "type": config.config_type.value,
                "default_value": config.default_value,
                "description": config.description,
                "modified_at": config.modified_at,
                "modified_by": config.modified_by,
                "version": config.version
            }

    def get_history(self, key: str, limit: int = 10) -> List[Dict]:
        """获取配置变更历史"""
        with self._lock:
            history = self._history.get(key, [])
            return [
                {
                    "old_value": h.old_value,
                    "new_value": h.new_value,
                    "modified_at": h.modified_at,
                    "modified_by": h.modified_by,
                    "version": h.version
                }
                for h in history[-limit:]
            ]

    def add_listener(self, callback: Callable[[str, Any], None]):
        """添加配置变更监听器"""
        self._change_listeners.append(callback)

    def _notify_listeners(self, key: str, value: Any):
        """通知监听器"""
        for callback in self._change_listeners:
            try:
                callback(key, value)
            except Exception as e:
                print(f"[Config] Listener error: {e}")

    def export(self) -> Dict:
        """导出所有配置"""
        with self._lock:
            return {
                "exported_at": datetime.now().isoformat(),
                "configs": {
                    k: {
                        "value": v.value,
                        "scope": v.scope.value,
                        "type": v.config_type.value,
                        "description": v.description,
                        "version": v.version
                    }
                    for k, v in self._configs.items()
                }
            }

    def import_config(self, data: Dict) -> int:
        """导入配置"""
        imported = 0
        for key, config_data in data.get("configs", {}).items():
            if self.set(
                key=key,
                value=config_data.get("value"),
                scope=ConfigScope(config_data.get("scope", "global")),
                description=config_data.get("description", "")
            ):
                imported += 1
        return imported


# 全局动态配置实例
dynamic_config = DynamicConfig()


# 便捷函数
def get_config(key: str, default: Any = None) -> Any:
    """获取配置"""
    return dynamic_config.get(key, default)


def set_config(key: str, value: Any, **kwargs) -> bool:
    """设置配置"""
    return dynamic_config.set(key, value, **kwargs)


def reset_config(key: str) -> bool:
    """重置配置"""
    return dynamic_config.reset(key)
