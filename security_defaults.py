"""Security Defaults Module

Provide secure default configurations for common frameworks and services.
"""
import time
import threading
import uuid
import json
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class FrameworkType(str, Enum):
    """Framework types."""
    DJANGO = "django"
    FLASK = "flask"
    FASTAPI = "fastapi"
    EXPRESS = "express"
    SPRING = "spring"
    LARAVEL = "laravel"
    ASPNET = "aspnet"
    GENERIC = "generic"


class ConfigCategory(str, Enum):
    """Configuration categories."""
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    SESSION = "session"
    COOKIE = "cookie"
    CORS = "cors"
    CSRF = "csrf"
    SSL_TLS = "ssl_tls"
    HEADERS = "headers"
    RATE_LIMITING = "rate_limiting"
    INPUT_VALIDATION = "input_validation"
    OUTPUT_ENCODING = "output_encoding"
    ENCRYPTION = "encryption"
    Logging = "logging"
    ERROR_HANDLING = "error_handling"


@dataclass
class SecurityConfig:
    """Security configuration for a framework."""
    id: str
    name: str
    framework: FrameworkType
    description: str
    category: ConfigCategory
    config_key: str
    default_value: Any
    secure_value: Any
    recommendation: str
    risk_level: str  # "low", "medium", "high", "critical"
    cwe_id: str = ""  # Common Weakness Enumeration


@dataclass
class ConfigProfile:
    """Complete security configuration profile."""
    id: str
    name: str
    framework: FrameworkType
    description: str
    configs: List[SecurityConfig]
    created_at: float
    updated_at: float


class SecurityDefaultsManager:
    """Manage security default configurations."""

    def __init__(self):
        self._lock = threading.RLock()
        self._profiles: Dict[str, ConfigProfile] = {}
        self._custom_configs: Dict[str, SecurityConfig] = {}
        self._init_defaults()

    def _init_defaults(self):
        """Initialize default security configurations."""
        defaults = [
            # Django Security
            SecurityConfig(
                id="dj001", name="SECURE_SSL_REDIRECT", framework=FrameworkType.DJANGO,
                description="Redirect HTTP to HTTPS", category=ConfigCategory.SSL_TLS, config_key="SECURE_SSL_REDIRECT",
                default_value=False, secure_value=True,
                recommendation="Always redirect HTTP to HTTPS",
                risk_level="high", cwe_id="CWE-295"
            ),
            SecurityConfig(
                id="dj002", name="SESSION_COOKIE_SECURE", framework=FrameworkType.DJANGO,
                description="Secure session cookie", category=ConfigCategory.COOKIE, config_key="SESSION_COOKIE_SECURE",
                default_value=False, secure_value=True,
                recommendation="Set secure flag on session cookie",
                risk_level="high", cwe_id="CWE-614"
            ),
            SecurityConfig(
                id="dj003", name="SESSION_COOKIE_HTTP_ONLY", framework=FrameworkType.DJANGO,
                description="HTTP only session cookie", category=ConfigCategory.COOKIE, config_key="SESSION_COOKIE_HTTP_ONLY",
                default_value=False, secure_value=True,
                recommendation="Prevent JavaScript access to session cookie",
                risk_level="high", cwe_id="CWE-1004"
            ),
            SecurityConfig(
                id="dj004", name="CSRF_COOKIE_SECURE", framework=FrameworkType.DJANGO,
                description="Secure CSRF cookie", category=ConfigCategory.CSRF, config_key="CSRF_COOKIE_SECURE",
                default_value=False, secure_value=True,
                recommendation="Set secure flag on CSRF cookie",
                risk_level="medium", cwe_id="CWE-614"
            ),
            SecurityConfig(
                id="dj005", name="SECURE_BROWSER_XSS_FILTER", framework=FrameworkType.DJANGO,
                description="Browser XSS filter", category=ConfigCategory.HEADERS, config_key="SECURE_BROWSER_XSS_FILTER",
                default_value=False, secure_value=True,
                recommendation="Enable browser XSS filter",
                risk_level="low", cwe_id="CWE-79"
            ),
            SecurityConfig(
                id="dj006", name="SECURE_CONTENT_TYPE_NOSNIFF", framework=FrameworkType.DJANGO,
                description="Django security setting", category=ConfigCategory.HEADERS, config_key="SECURE_CONTENT_TYPE_NOSNIFF",
                default_value=False, secure_value=True,
                recommendation="Prevent MIME type sniffing",
                risk_level="medium", cwe_id="CWE-16"
            ),
            SecurityConfig(
                id="dj007", name="SECURE_HSTS_SECONDS", framework=FrameworkType.DJANGO,
                description="Django security setting", category=ConfigCategory.SSL_TLS, config_key="SECURE_HSTS_SECONDS",
                default_value=0, secure_value=31536000,
                recommendation="Enable HSTS with 1 year max age",
                risk_level="high", cwe_id="CWE-295"
            ),
            SecurityConfig(
                id="dj008", name="CSRF_USE_SESSIONS", framework=FrameworkType.DJANGO,
                description="Django security setting", category=ConfigCategory.CSRF, config_key="CSRF_USE_SESSIONS",
                default_value=False, secure_value=True,
                recommendation="Store CSRF token in session",
                risk_level="low", cwe_id="CWE-352"
            ),

            # Flask Security
            SecurityConfig(
                id="fl001", name="SESSION_COOKIE_SECURE", framework=FrameworkType.FLASK,
                description="Flask security setting", category=ConfigCategory.COOKIE, config_key="SESSION_COOKIE_SECURE",
                default_value=False, secure_value=True,
                recommendation="Set secure flag on session cookie",
                risk_level="high", cwe_id="CWE-614"
            ),
            SecurityConfig(
                id="fl002", name="SESSION_COOKIE_HTTPONLY", framework=FrameworkType.FLASK,
                description="Flask security setting", category=ConfigCategory.COOKIE, config_key="SESSION_COOKIE_HTTPONLY",
                default_value=False, secure_value=True,
                recommendation="Prevent JavaScript access to cookie",
                risk_level="high", cwe_id="CWE-1004"
            ),
            SecurityConfig(
                id="fl003", name="SESSION_COOKIE_SAMESITE", framework=FrameworkType.FLASK,
                description="Flask security setting", category=ConfigCategory.COOKIE, config_key="SESSION_COOKIE_SAMESITE",
                default_value=None, secure_value="Lax",
                recommendation="Set SameSite to Lax or Strict",
                risk_level="medium", cwe_id="CWE-16"
            ),

            # FastAPI Security
            SecurityConfig(
                id="fa001", name="HTTPSEnabled", framework=FrameworkType.FASTAPI,
                description="FastAPI security setting", category=ConfigCategory.SSL_TLS, config_key="HTTPSEnabled",
                default_value=False, secure_value=True,
                recommendation="Enable HTTPS in production",
                risk_level="critical", cwe_id="CWE-295"
            ),
            SecurityConfig(
                id="fa002", name="AllowCredentials", framework=FrameworkType.FASTAPI,
                description="FastAPI security setting", category=ConfigCategory.CORS, config_key="AllowCredentials",
                default_value=True, secure_value=False,
                recommendation="Disable credentials in CORS when possible",
                risk_level="high", cwe_id="CWE-346"
            ),

            # Express.js Security
            SecurityConfig(
                id="ex001", name="helmetEnabled", framework=FrameworkType.EXPRESS,
                description="Express security setting", category=ConfigCategory.HEADERS, config_key="helmetEnabled",
                default_value=False, secure_value=True,
                recommendation="Enable Helmet.js for security headers",
                risk_level="high", cwe_id="CWE-16"
            ),
            SecurityConfig(
                id="ex002", name="xssFilter", framework=FrameworkType.EXPRESS,
                description="Express security setting", category=ConfigCategory.HEADERS, config_key="xssFilter",
                default_value=False, secure_value=True,
                recommendation="Enable XSS filter",
                risk_level="medium", cwe_id="CWE-79"
            ),
            SecurityConfig(
                id="ex003", name="noSniff", framework=FrameworkType.EXPRESS,
                description="Express security setting", category=ConfigCategory.HEADERS, config_key="noSniff",
                default_value=False, secure_value=True,
                recommendation="Prevent MIME sniffing",
                risk_level="medium", cwe_id="CWE-16"
            ),
            SecurityConfig(
                id="ex004", name="forceHTTPS", framework=FrameworkType.EXPRESS,
                description="Express security setting", category=ConfigCategory.SSL_TLS, config_key="forceHTTPS",
                default_value=False, secure_value=True,
                recommendation="Force HTTPS in production",
                risk_level="high", cwe_id="CWE-295"
            ),

            # Spring Security
            SecurityConfig(
                id="sp001", name="csrfEnabled", framework=FrameworkType.SPRING,
                description="Spring security setting", category=ConfigCategory.CSRF, config_key="csrf.enabled",
                default_value=False, secure_value=True,
                recommendation="Enable CSRF protection",
                risk_level="high", cwe_id="CWE-352"
            ),
            SecurityConfig(
                id="sp002", name="sslEnabled", framework=FrameworkType.SPRING,
                description="Spring security setting", category=ConfigCategory.SSL_TLS, config_key="server.ssl.enabled",
                default_value=False, secure_value=True,
                recommendation="Enable SSL/TLS",
                risk_level="critical", cwe_id="CWE-295"
            ),
            SecurityConfig(
                id="sp003", name="hstsEnabled", framework=FrameworkType.SPRING,
                description="Spring security setting", category=ConfigCategory.SSL_TLS, config_key="server.servlet.hsts.enabled",
                default_value=False, secure_value=True,
                recommendation="Enable HSTS",
                risk_level="high", cwe_id="CWE-295"
            ),

            # Generic Web Security
            SecurityConfig(
                id="ge001", name="StrictTransportSecurity", framework=FrameworkType.GENERIC,
                description="Generic security setting", category=ConfigCategory.HEADERS, config_key="Strict-Transport-Security",
                default_value="", secure_value="max-age=31536000; includeSubDomains",
                recommendation="Enable HSTS with subdomains",
                risk_level="high", cwe_id="CWE-295"
            ),
            SecurityConfig(
                id="ge002", name="XContentTypeOptions", framework=FrameworkType.GENERIC,
                description="Generic security setting", category=ConfigCategory.HEADERS, config_key="X-Content-Type-Options",
                default_value="", secure_value="nosniff",
                recommendation="Prevent MIME type sniffing",
                risk_level="medium", cwe_id="CWE-16"
            ),
            SecurityConfig(
                id="ge003", name="XFrameOptions", framework=FrameworkType.GENERIC,
                description="Generic security setting", category=ConfigCategory.HEADERS, config_key="X-Frame-Options",
                default_value="", secure_value="DENY",
                recommendation="Prevent clickjacking",
                risk_level="medium", cwe_id="CWE-1021"
            ),
            SecurityConfig(
                id="ge004", name="XSSProtection", framework=FrameworkType.GENERIC,
                description="Generic security setting", category=ConfigCategory.HEADERS, config_key="X-XSS-Protection",
                default_value="", secure_value="1; mode=block",
                recommendation="Enable XSS protection",
                risk_level="low", cwe_id="CWE-79"
            ),
            SecurityConfig(
                id="ge005", name="ContentSecurityPolicy", framework=FrameworkType.GENERIC,
                description="Generic security setting", category=ConfigCategory.HEADERS, config_key="Content-Security-Policy",
                default_value="", secure_value="default-src 'self'",
                recommendation="Set Content Security Policy",
                risk_level="high", cwe_id="CWE-79"
            ),
            SecurityConfig(
                id="ge006", name="ReferrerPolicy", framework=FrameworkType.GENERIC,
                description="Generic security setting", category=ConfigCategory.HEADERS, config_key="Referrer-Policy",
                default_value="", secure_value="strict-origin-when-cross-origin",
                recommendation="Set Referrer Policy",
                risk_level="low", cwe_id="CWE-200"
            ),
            SecurityConfig(
                id="ge007", name="PermissionsPolicy", framework=FrameworkType.GENERIC,
                description="Generic security setting", category=ConfigCategory.HEADERS, config_key="Permissions-Policy",
                default_value="", secure_value="geolocation=(), microphone=(), camera=()",
                recommendation="Restrict browser features",
                risk_level="medium", cwe_id="CWE-16"
            ),
        ]

        # Create default profiles
        self._create_default_profiles(defaults)

    def _create_default_profiles(self, configs: List[SecurityConfig]):
        """Create default configuration profiles."""
        frameworks = {
            FrameworkType.DJANGO: "Django",
            FrameworkType.FLASK: "Flask",
            FrameworkType.FASTAPI: "FastAPI",
            FrameworkType.EXPRESS: "Express.js",
            FrameworkType.SPRING: "Spring",
            FrameworkType.GENERIC: "Generic Web",
        }

        for fw_type, fw_name in frameworks.items():
            fw_configs = [c for c in configs if c.framework == fw_type]
            if fw_configs:
                profile_id = f"default_{fw_type.value}"
                self._profiles[profile_id] = ConfigProfile(
                    id=profile_id,
                    name=f"{fw_name} Secure Profile",
                    framework=fw_type,
                    description=f"Default secure configuration for {fw_name}",
                    configs=fw_configs,
                    created_at=time.time(),
                    updated_at=time.time()
                )

    def get_frameworks(self) -> List[Dict]:
        """Get list of supported frameworks."""
        return [{"id": f.value, "name": f.name} for f in FrameworkType]

    def get_categories(self) -> List[Dict]:
        """Get list of configuration categories."""
        return [{"id": c.value, "name": c.name} for c in ConfigCategory]

    def get_profiles(self, framework: FrameworkType = None) -> List[Dict]:
        """Get configuration profiles."""
        with self._lock:
            profiles = list(self._profiles.values())

        if framework:
            profiles = [p for p in profiles if p.framework == framework]

        return [{
            "id": p.id, "name": p.name, "framework": p.framework.value,
            "description": p.description, "configs_count": len(p.configs),
            "created_at": p.created_at
        } for p in profiles]

    def get_profile(self, profile_id: str) -> Optional[ConfigProfile]:
        """Get a specific profile."""
        with self._lock:
            return self._profiles.get(profile_id)

    def get_configs(
        self,
        framework: FrameworkType = None,
        category: ConfigCategory = None,
        risk_level: str = None
    ) -> List[SecurityConfig]:
        """Get security configurations with filters."""
        with self._lock:
            configs = []
            for profile in self._profiles.values():
                configs.extend(profile.configs)

        if framework:
            configs = [c for c in configs if c.framework == framework]
        if category:
            configs = [c for c in configs if c.category == category]
        if risk_level:
            configs = [c for c in configs if c.risk_level == risk_level]

        return configs

    def generate_config_file(
        self,
        profile_id: str,
        format: str = "json"
    ) -> Optional[str]:
        """Generate configuration file content."""
        profile = self.get_profile(profile_id)
        if not profile:
            return None

        if format == "json":
            config_dict = {
                "name": profile.name,
                "description": profile.description,
                "configs": {}
            }
            for cfg in profile.configs:
                config_dict["configs"][cfg.config_key] = cfg.secure_value
            return json.dumps(config_dict, indent=2)

        elif format == "env":
            lines = [f"# {profile.name}", f"# {profile.description}", ""]
            for cfg in profile.configs:
                lines.append(f"# {cfg.recommendation}")
                lines.append(f"{cfg.config_key}={cfg.secure_value}")
                lines.append("")
            return "\n".join(lines)

        elif format == "yaml":
            import yaml
            config_dict = {
                "name": profile.name,
                "description": profile.description,
                "configs": {}
            }
            for cfg in profile.configs:
                config_dict["configs"][cfg.config_key] = cfg.secure_value
            return yaml.dump(config_dict, default_flow_style=False)

        return None

    def add_custom_config(
        self,
        name: str,
        framework: FrameworkType,
        category: ConfigCategory,
        config_key: str,
        default_value: Any,
        secure_value: Any,
        recommendation: str,
        risk_level: str = "medium",
        cwe_id: str = ""
    ) -> str:
        """Add a custom security configuration."""
        config_id = f"custom_{str(uuid.uuid4())[:8]}"

        config = SecurityConfig(
            id=config_id,
            name=name,
            framework=framework,
            category=category,
            config_key=config_key,
            default_value=default_value,
            secure_value=secure_value,
            recommendation=recommendation,
            risk_level=risk_level,
            cwe_id=cwe_id
        )

        with self._lock:
            self._custom_configs[config_id] = config

        return config_id

    def get_statistics(self) -> Dict:
        """Get security defaults statistics."""
        with self._lock:
            total_configs = sum(len(p.configs) for p in self._profiles.values())
            total_configs += len(self._custom_configs)

        by_framework = {}
        by_category = {}
        by_risk = {"critical": 0, "high": 0, "medium": 0, "low": 0}

        for profile in self._profiles.values():
            fw = profile.framework.value
            by_framework[fw] = by_framework.get(fw, 0) + len(profile.configs)

            for cfg in profile.configs:
                cat = cfg.category.value
                by_category[cat] = by_category.get(cat, 0) + 1
                if cfg.risk_level in by_risk:
                    by_risk[cfg.risk_level] += 1

        return {
            "total_profiles": len(self._profiles),
            "total_configs": total_configs,
            "custom_configs": len(self._custom_configs),
            "by_framework": by_framework,
            "by_category": by_category,
            "by_risk_level": by_risk
        }


# Global security defaults manager
security_defaults = SecurityDefaultsManager()
