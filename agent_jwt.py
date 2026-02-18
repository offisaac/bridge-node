"""Agent JWT Module

JWT token generation, validation, and management for agent authentication
and authorization with support for multiple algorithms, token revocation,
and refresh token functionality.
"""
import time
import uuid
import hashlib
import hmac
import base64
import json
import threading
import secrets
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class JWTStrategy(str, Enum):
    """JWT generation strategies."""
    ACCESS = "access"
    REFRESH = "refresh"
    API_KEY = "api_key"
    BEARER = "bearer"
    CUSTOM = "custom"


class JWTAlgorithm(str, Enum):
    """Supported JWT algorithms."""
    HS256 = "HS256"
    HS384 = "HS384"
    HS512 = "HS512"
    RS256 = "RS256"
    RS384 = "RS384"
    RS512 = "RS512"
    ES256 = "ES256"
    ES384 = "ES384"
    ES512 = "ES512"


class TokenStatus(str, Enum):
    """Token status."""
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"
    BLACKLISTED = "blacklisted"
    INVALID = "invalid"


class TokenType(str, Enum):
    """Token types."""
    ACCESS = "access"
    REFRESH = "refresh"
    ID = "id"
    API = "api"


@dataclass
class JWTClaim:
    """JWT claims."""
    sub: str  # Subject (user/agent ID)
    aud: str = ""  # Audience
    iss: str = ""  # Issuer
    exp: float = 0.0  # Expiration time
    nbf: float = 0.0  # Not before
    iat: float = field(default_factory=time.time)  # Issued at
    jti: str = ""  # JWT ID
    name: str = ""
    email: str = ""
    role: str = ""
    permissions: List[str] = field(default_factory=list)
    custom_claims: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TokenConfig:
    """Token configuration."""
    algorithm: JWTAlgorithm = JWTAlgorithm.HS256
    secret_key: str = ""
    public_key: str = ""
    private_key: str = ""
    issuer: str = "bridge-node"
    audience: str = ""
    access_token_ttl: int = 3600  # 1 hour
    refresh_token_ttl: int = 604800  # 7 days
    id_token_ttl: int = 3600
    api_token_ttl: int = 31536000  # 1 year
    issuer_alias: str = ""
    audience_alias: str = ""
    jti_prefix: str = "jwt"
    enable_blacklist: bool = True
    enable_refresh: bool = True
    require_claims: List[str] = field(default_factory=list)
    optional_claims: List[str] = field(default_factory=list)


@dataclass
class TokenMetadata:
    """Token metadata."""
    token_id: str
    agent_id: str
    token_type: TokenType
    created_at: float
    expires_at: float
    last_used: float = 0.0
    status: TokenStatus = TokenStatus.ACTIVE
    ip_address: str = ""
    user_agent: str = ""
    refresh_count: int = 0
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TokenPair:
    """Access and refresh token pair."""
    access_token: str
    refresh_token: str
    access_expires: float
    refresh_expires: float
    token_type: str = "Bearer"
    expires_in: int = 3600


@dataclass
class TokenValidationResult:
    """Token validation result."""
    valid: bool
    status: TokenStatus
    claims: Optional[JWTClaim] = None
    error: str = ""
    metadata: Optional[TokenMetadata] = None


class JWTManager:
    """JWT token management engine."""

    def __init__(self, config: TokenConfig = None):
        self._lock = threading.RLock()
        self._config = config or TokenConfig()
        self._tokens: Dict[str, TokenMetadata] = {}
        self._blacklist: Dict[str, float] = {}
        self._revoked: Dict[str, float] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._refresh_tokens: Dict[str, str] = {}  # refresh_token -> agent_id

    def _generate_jti(self) -> str:
        """Generate unique JWT ID."""
        return f"{self._config.jti_prefix}_{uuid.uuid4().hex[:16]}"

    def _base64url_encode(self, data: bytes) -> str:
        """Base64 URL-safe encoding."""
        return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')

    def _base64url_decode(self, data: str) -> bytes:
        """Base64 URL-safe decoding."""
        padding = 4 - (len(data) % 4)
        if padding != 4:
            data += '=' * padding
        return base64.urlsafe_b64decode(data)

    def _sign(self, data: str) -> str:
        """Sign data with HMAC."""
        key = self._config.secret_key.encode('utf-8')
        if self._config.algorithm == JWTAlgorithm.HS256:
            signature = hmac.new(key, data.encode('utf-8'), hashlib.sha256).digest()
        elif self._config.algorithm == JWTAlgorithm.HS384:
            signature = hmac.new(key, data.encode('utf-8'), hashlib.sha384).digest()
        elif self._config.algorithm == JWTAlgorithm.HS512:
            signature = hmac.new(key, data.encode('utf-8'), hashlib.sha512).digest()
        else:
            signature = hmac.new(key, data.encode('utf-8'), hashlib.sha256).digest()
        return self._base64url_encode(signature)

    def _verify(self, data: str, signature: str) -> bool:
        """Verify HMAC signature."""
        expected = self._sign(data)
        return hmac.compare_digest(expected, signature)

    def _create_header(self) -> str:
        """Create JWT header."""
        header = {
            "alg": self._config.algorithm.value,
            "typ": "JWT"
        }
        return self._base64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))

    def _create_payload(self, claims: JWTClaim) -> str:
        """Create JWT payload."""
        payload = {
            "sub": claims.sub,
            "iat": claims.iat
        }
        if claims.aud:
            payload["aud"] = claims.aud
        if claims.iss:
            payload["iss"] = claims.iss
        if claims.exp:
            payload["exp"] = claims.exp
        if claims.nbf:
            payload["nbf"] = claims.nbf
        if claims.jti:
            payload["jti"] = claims.jti
        if claims.name:
            payload["name"] = claims.name
        if claims.email:
            payload["email"] = claims.email
        if claims.role:
            payload["role"] = claims.role
        if claims.permissions:
            payload["permissions"] = claims.permissions
        if claims.custom_claims:
            payload.update(claims.custom_claims)
        return self._base64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))

    def _parse_payload(self, payload: str) -> Optional[JWTClaim]:
        """Parse JWT payload."""
        try:
            data = json.loads(self._base64url_decode(payload).decode('utf-8'))
            return JWTClaim(
                sub=data.get("sub", ""),
                aud=data.get("aud", ""),
                iss=data.get("iss", ""),
                exp=data.get("exp", 0.0),
                nbf=data.get("nbf", 0.0),
                iat=data.get("iat", 0.0),
                jti=data.get("jti", ""),
                name=data.get("name", ""),
                email=data.get("email", ""),
                role=data.get("role", ""),
                permissions=data.get("permissions", []),
                custom_claims={k: v for k, v in data.items() if k not in [
                    "sub", "aud", "iss", "exp", "nbf", "iat", "jti",
                    "name", "email", "role", "permissions"
                ]}
            )
        except Exception:
            return None

    def generate_token(
        self,
        agent_id: str,
        token_type: TokenType = TokenType.ACCESS,
        subject: str = None,
        claims: Dict[str, Any] = None
    ) -> str:
        """Generate a JWT token."""
        with self._lock:
            jti = self._generate_jti()
            current_time = time.time()

            if token_type == TokenType.ACCESS:
                ttl = self._config.access_token_ttl
            elif token_type == TokenType.REFRESH:
                ttl = self._config.refresh_token_ttl
            elif token_type == TokenType.ID:
                ttl = self._config.id_token_ttl
            else:
                ttl = self._config.api_token_ttl

            jwt_claims = JWTClaim(
                sub=subject or agent_id,
                iss=self._config.issuer,
                aud=self._config.audience,
                exp=current_time + ttl,
                iat=current_time,
                jti=jti,
                role=claims.get("role", "") if claims else "",
                permissions=claims.get("permissions", []) if claims else [],
                name=claims.get("name", "") if claims else "",
                email=claims.get("email", "") if claims else "",
                custom_claims=claims or {}
            )

            header = self._create_header()
            payload = self._create_payload(jwt_claims)
            signature = self._sign(f"{header}.{payload}")

            token = f"{header}.{payload}.{signature}"

            # Store metadata
            metadata = TokenMetadata(
                token_id=jti,
                agent_id=agent_id,
                token_type=token_type,
                created_at=current_time,
                expires_at=jwt_claims.exp
            )
            self._tokens[jti] = metadata

            # Store refresh token mapping
            if token_type == TokenType.REFRESH:
                self._refresh_tokens[token] = agent_id

            return token

    def generate_token_pair(
        self,
        agent_id: str,
        subject: str = None,
        claims: Dict[str, Any] = None
    ) -> TokenPair:
        """Generate access and refresh token pair."""
        access_token = self.generate_token(
            agent_id, TokenType.ACCESS, subject, claims
        )
        refresh_token = self.generate_token(
            agent_id, TokenType.REFRESH, subject, claims
        )

        access_meta = self._tokens.get(access_token.split('.')[2] if len(access_token.split('.')) > 2 else "")
        refresh_meta = self._tokens.get(refresh_token.split('.')[2] if len(refresh_token.split('.')) > 2 else "")

        return TokenPair(
            access_token=access_token,
            refresh_token=refresh_token,
            access_expires=access_meta.expires_at if access_meta else 0.0,
            refresh_expires=refresh_meta.expires_at if refresh_meta else 0.0
        )

    def validate_token(self, token: str) -> TokenValidationResult:
        """Validate a JWT token."""
        with self._lock:
            try:
                parts = token.split('.')
                if len(parts) != 3:
                    return TokenValidationResult(
                        valid=False,
                        status=TokenStatus.INVALID,
                        error="Invalid token format"
                    )

                header, payload, signature = parts

                # Verify signature
                if not self._verify(f"{header}.{payload}", signature):
                    return TokenValidationResult(
                        valid=False,
                        status=TokenStatus.INVALID,
                        error="Invalid signature"
                    )

                # Parse claims
                claims = self._parse_payload(payload)
                if not claims:
                    return TokenValidationResult(
                        valid=False,
                        status=TokenStatus.INVALID,
                        error="Invalid payload"
                    )

                # Check expiration
                current_time = time.time()
                if claims.exp and claims.exp < current_time:
                    return TokenValidationResult(
                        valid=False,
                        status=TokenStatus.EXPIRED,
                        claims=claims,
                        error="Token expired"
                    )

                # Check not before
                if claims.nbf and claims.nbf > current_time:
                    return TokenValidationResult(
                        valid=False,
                        status=TokenStatus.INVALID,
                        claims=claims,
                        error="Token not yet valid"
                    )

                # Check blacklist
                if self._config.enable_blacklist and claims.jti in self._blacklist:
                    return TokenValidationResult(
                        valid=False,
                        status=TokenStatus.BLACKLISTED,
                        claims=claims,
                        error="Token blacklisted"
                    )

                # Check revoked
                if claims.jti in self._revoked:
                    return TokenValidationResult(
                        valid=False,
                        status=TokenStatus.REVOKED,
                        claims=claims,
                        error="Token revoked"
                    )

                # Get metadata
                metadata = self._tokens.get(claims.jti)

                return TokenValidationResult(
                    valid=True,
                    status=TokenStatus.ACTIVE,
                    claims=claims,
                    metadata=metadata
                )

            except Exception as e:
                return TokenValidationResult(
                    valid=False,
                    status=TokenStatus.INVALID,
                    error=str(e)
                )

    def refresh_access_token(self, refresh_token: str) -> Optional[TokenPair]:
        """Generate new access token from refresh token."""
        with self._lock:
            result = self.validate_token(refresh_token)
            if not result.valid or result.claims.role == "":
                return None

            # Check if it's a refresh token
            metadata = self._tokens.get(result.claims.jti)
            if not metadata or metadata.token_type != TokenType.REFRESH:
                return None

            # Generate new token pair
            agent_id = metadata.agent_id
            new_pair = self.generate_token_pair(
                agent_id,
                result.claims.sub,
                {
                    "role": result.claims.role,
                    "permissions": result.claims.permissions,
                    "name": result.claims.name,
                    "email": result.claims.email
                }
            )

            # Update refresh count
            metadata.refresh_count += 1
            metadata.last_used = time.time()

            return new_pair

    def revoke_token(self, token: str) -> bool:
        """Revoke a token."""
        with self._lock:
            result = self.validate_token(token)
            if not result.claims:
                return False

            jti = result.claims.jti
            self._revoked[jti] = time.time()

            if jti in self._tokens:
                self._tokens[jti].status = TokenStatus.REVOKED

            return True

    def blacklist_token(self, token: str, duration: int = 86400) -> bool:
        """Add token to blacklist."""
        with self._lock:
            result = self.validate_token(token)
            if not result.claims:
                return False

            jti = result.claims.jti
            self._blackList[jti] = time.time() + duration

            if jti in self._tokens:
                self._tokens[jti].status = TokenStatus.BLACKLISTED

            return True

    def get_token_metadata(self, token: str) -> Optional[TokenMetadata]:
        """Get token metadata."""
        with self._lock:
            result = self.validate_token(token)
            if not result.valid:
                return None
            return self._tokens.get(result.claims.jti)

    def list_agent_tokens(self, agent_id: str) -> List[TokenMetadata]:
        """List all tokens for an agent."""
        with self._lock:
            return [
                m for m in self._tokens.values()
                if m.agent_id == agent_id
            ]

    def revoke_agent_tokens(self, agent_id: str) -> int:
        """Revoke all tokens for an agent."""
        with self._lock:
            count = 0
            for metadata in self._tokens.values():
                if metadata.agent_id == agent_id and metadata.status == TokenStatus.ACTIVE:
                    self._revoked[metadata.token_id] = time.time()
                    metadata.status = TokenStatus.REVOKED
                    count += 1
            return count

    def cleanup_expired(self) -> int:
        """Clean up expired tokens."""
        with self._lock:
            current_time = time.time()
            count = 0

            # Clean expired tokens
            expired_tokens = [
                jti for jti, meta in self._tokens.items()
                if meta.expires_at < current_time
            ]
            for jti in expired_tokens:
                del self._tokens[jti]
                count += 1

            # Clean expired blacklist entries
            expired_blacklist = [
                jti for jti, expiry in self._blacklist.items()
                if expiry < current_time
            ]
            for jti in expired_blacklist:
                del self._blackList[jti]

            # Clean old revocation records (keep for 7 days)
            old_revocations = [
                jti for jti, revoked_at in self._revoked.items()
                if revoked_at < current_time - (7 * 86400)
            ]
            for jti in old_revocations:
                del self._revoked[jti]

            return count


class AgentJWT:
    """Agent JWT token service."""

    def __init__(self, config: TokenConfig = None):
        self._manager = JWTManager(config)
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def generate_token(
        self,
        agent_id: str,
        token_type: str = "access",
        subject: str = None,
        claims: Dict[str, Any] = None
    ) -> str:
        """Generate a JWT token."""
        return self._manager.generate_token(
            agent_id,
            TokenType(token_type),
            subject,
            claims
        )

    def generate_token_pair(
        self,
        agent_id: str,
        subject: str = None,
        claims: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Generate access and refresh token pair."""
        pair = self._manager.generate_token_pair(agent_id, subject, claims)
        return {
            "access_token": pair.access_token,
            "refresh_token": pair.refresh_token,
            "access_expires": pair.access_expires,
            "refresh_expires": pair.refresh_expires,
            "token_type": pair.token_type,
            "expires_in": pair.expires_in
        }

    def validate_token(self, token: str) -> Dict[str, Any]:
        """Validate a JWT token."""
        result = self._manager.validate_token(token)
        return {
            "valid": result.valid,
            "status": result.status.value,
            "error": result.error,
            "claims": {
                "sub": result.claims.sub if result.claims else None,
                "iss": result.claims.iss if result.claims else None,
                "exp": result.claims.exp if result.claims else None,
                "iat": result.claims.iat if result.claims else None,
                "jti": result.claims.jti if result.claims else None,
                "role": result.claims.role if result.claims else None,
                "permissions": result.claims.permissions if result.claims else [],
                "name": result.claims.name if result.claims else None,
                "email": result.claims.email if result.claims else None
            } if result.claims else None,
            "metadata": {
                "token_id": result.metadata.token_id,
                "agent_id": result.metadata.agent_id,
                "token_type": result.metadata.token_type.value,
                "created_at": result.metadata.created_at,
                "expires_at": result.metadata.expires_at,
                "last_used": result.metadata.last_used,
                "status": result.metadata.status.value
            } if result.metadata else None
        }

    def refresh_access_token(self, refresh_token: str) -> Optional[Dict[str, Any]]:
        """Generate new access token from refresh token."""
        pair = self._manager.refresh_access_token(refresh_token)
        if not pair:
            return None
        return {
            "access_token": pair.access_token,
            "refresh_token": pair.refresh_token,
            "access_expires": pair.access_expires,
            "refresh_expires": pair.refresh_expires,
            "token_type": pair.token_type,
            "expires_in": pair.expires_in
        }

    def revoke_token(self, token: str) -> bool:
        """Revoke a token."""
        return self._manager.revoke_token(token)

    def blacklist_token(self, token: str, duration: int = 86400) -> bool:
        """Add token to blacklist."""
        return self._manager.blacklist_token(token, duration)

    def get_token_metadata(self, token: str) -> Optional[Dict[str, Any]]:
        """Get token metadata."""
        metadata = self._manager.get_token_metadata(token)
        if not metadata:
            return None
        return {
            "token_id": metadata.token_id,
            "agent_id": metadata.agent_id,
            "token_type": metadata.token_type.value,
            "created_at": metadata.created_at,
            "expires_at": metadata.expires_at,
            "last_used": metadata.last_used,
            "status": metadata.status.value,
            "refresh_count": metadata.refresh_count
        }

    def list_agent_tokens(self, agent_id: str) -> List[Dict[str, Any]]:
        """List all tokens for an agent."""
        tokens = self._manager.list_agent_tokens(agent_id)
        return [
            {
                "token_id": m.token_id,
                "agent_id": m.agent_id,
                "token_type": m.token_type.value,
                "created_at": m.created_at,
                "expires_at": m.expires_at,
                "last_used": m.last_used,
                "status": m.status.value,
                "refresh_count": m.refresh_count
            }
            for m in tokens
        ]

    def revoke_agent_tokens(self, agent_id: str) -> int:
        """Revoke all tokens for an agent."""
        return self._manager.revoke_agent_tokens(agent_id)

    def cleanup_expired(self) -> int:
        """Clean up expired tokens."""
        return self._manager.cleanup_expired()


# Global JWT instance
agent_jwt = AgentJWT()
