"""
Agent Credential Module

Provides credential management, authentication tracking, and secure credential storage for agents.
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import List, Optional
from threading import RLock
import uuid
import hashlib
import secrets


class CredentialType(Enum):
    """Credential types."""
    PASSWORD = "password"
    API_KEY = "api_key"
    SSH_KEY = "ssh_key"
    CERTIFICATE = "certificate"
    TOKEN = "token"
    OAUTH = "oauth"
    API_SECRET = "api_secret"
    JWT = "jwt"
    BASIC_AUTH = "basic_auth"
    CUSTOM = "custom"


class CredentialStatus(Enum):
    """Credential status."""
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"
    SUSPENDED = "suspended"
    PENDING = "pending"
    ROTATED = "rotated"


class CredentialCategory(Enum):
    """Credential categories."""
    AUTHENTICATION = "authentication"
    AUTHORIZATION = "authorization"
    API_ACCESS = "api_access"
    ENCRYPTION = "encryption"
    SIGNING = "signing"
    EXTERNAL_SERVICE = "external_service"
    INTERNAL_SERVICE = "internal_service"
    DATABASE = "database"
    CLOUD_PROVIDER = "cloud_provider"
    THIRD_PARTY = "third_party"


class CredentialRotationPolicy(Enum):
    """Credential rotation policies."""
    MANUAL = "manual"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    ON_EXPIRE = "on_expire"


class EncryptionAlgorithm(Enum):
    """Encryption algorithms."""
    AES256 = "aes256"
    AES128 = "aes128"
    RSA2048 = "rsa2048"
    RSA4096 = "rsa4096"
    ED25519 = "ed25519"


@dataclass
class Credential:
    """Credential definition."""
    id: str = field(default_factory=lambda: f"CRE-{uuid.uuid4().hex[:8].upper()}")
    agent_id: str = ""
    name: str = ""
    credential_type: CredentialType = CredentialType.PASSWORD
    category: CredentialCategory = CredentialCategory.AUTHENTICATION
    status: CredentialStatus = CredentialStatus.ACTIVE
    username: str = ""
    credential_value: str = ""
    encrypted_value: str = ""
    service: str = ""
    endpoint: str = ""
    expires_at: Optional[str] = None
    issued_at: str = field(default_factory=lambda: datetime.now().isoformat())
    last_rotated: Optional[str] = None
    last_used: Optional[str] = None
    rotation_policy: CredentialRotationPolicy = CredentialRotationPolicy.MANUAL
    rotation_reminder_days: int = 7
    metadata: dict = field(default_factory=dict)
    tags: list = field(default_factory=list)
    notes: str = ""
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class CredentialAccess:
    """Credential access record."""
    id: str = field(default_factory=lambda: f"ACC-{uuid.uuid4().hex[:8].upper()}")
    credential_id: str = ""
    agent_id: str = ""
    accessed_by: str = ""
    access_method: str = ""
    ip_address: str = ""
    user_agent: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    success: bool = True
    error_message: str = ""


@dataclass
class CredentialRotation:
    """Credential rotation record."""
    id: str = field(default_factory=lambda: f"ROT-{uuid.uuid4().hex[:8].upper()}")
    credential_id: str = ""
    rotated_by: str = ""
    old_value_hash: str = ""
    new_value: str = ""
    new_value_hash: str = ""
    reason: str = ""
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    automatic: bool = False


@dataclass
class CredentialPolicy:
    """Credential policy."""
    id: str = field(default_factory=lambda: f"POL-{uuid.uuid4().hex[:8].upper()}")
    name: str = ""
    description: str = ""
    credential_types: list = field(default_factory=list)
    min_length: int = 8
    require_uppercase: bool = True
    require_lowercase: bool = True
    require_numbers: bool = True
    require_special: bool = False
    max_age_days: int = 90
    require_rotation: bool = True
    rotation_policy: CredentialRotationPolicy = CredentialRotationPolicy.MONTHLY
    allow_reuse: bool = False
    reuse_count: int = 0
    require_mfa: bool = False
    ip_whitelist: list = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class CredentialMetrics:
    """Credential metrics."""
    agent_id: str = ""
    total_credentials: int = 0
    active_credentials: int = 0
    expired_credentials: int = 0
    expiring_soon: int = 0
    revoked_credentials: int = 0
    total_rotations: int = 0
    last_rotation_date: Optional[str] = None
    avg_credential_age_days: float = 0.0


@dataclass
class CredentialConfig:
    """Credential configuration."""
    encryption_enabled: bool = True
    encryption_algorithm: EncryptionAlgorithm = EncryptionAlgorithm.AES256
    default_rotation_policy: CredentialRotationPolicy = CredentialRotationPolicy.MONTHLY
    rotation_reminder_days: int = 7
    max_credentials_per_agent: int = 50
    require_approval: bool = False
    audit_logging: bool = True
    auto_rotate_on_expire: bool = True


@dataclass
class CredentialReport:
    """Credential report."""
    agent_id: str = ""
    total_credentials: int = 0
    credentials_by_type: dict = field(default_factory=dict)
    credentials_by_status: dict = field(default_factory=dict)
    expiring_credentials: list = field(default_factory=list)
    compliance_issues: list = field(default_factory=list)
    recommendations: list = field(default_factory=list)


class CredentialManager:
    """Manages agent credentials."""

    def __init__(self):
        self._credentials: dict[str, Credential] = {}
        self._access_records: dict[str, List[CredentialAccess]] = {}
        self._rotation_records: dict[str, List[CredentialRotation]] = {}
        self._policies: dict[str, CredentialPolicy] = {}
        self._lock = RLock()
        self._config = CredentialConfig()
        self._initialize_default_policies()

    def _initialize_default_policies(self):
        """Initialize default credential policies."""
        default_policies = [
            CredentialPolicy(
                name="Strong Password",
                description="Standard strong password policy",
                credential_types=["password"],
                min_length=12,
                require_uppercase=True,
                require_lowercase=True,
                require_numbers=True,
                require_special=True,
                max_age_days=90,
                require_rotation=True,
                rotation_policy=CredentialRotationPolicy.MONTHLY
            ),
            CredentialPolicy(
                name="API Key",
                description="API key policy",
                credential_types=["api_key", "api_secret"],
                min_length=32,
                require_uppercase=False,
                require_lowercase=False,
                require_numbers=True,
                require_special=False,
                max_age_days=180,
                require_rotation=True,
                rotation_policy=CredentialRotationPolicy.QUARTERLY
            ),
        ]
        for policy in default_policies:
            self._policies[policy.id] = policy

    def create_credential(self, agent_id: str, name: str, credential_type: CredentialType = CredentialType.PASSWORD,
                        credential_value: str = "", **kwargs) -> Credential:
        """Create a new credential."""
        with self._lock:
            credential = Credential(
                agent_id=agent_id,
                name=name,
                credential_type=credential_type,
                credential_value=credential_value,
                **kwargs
            )

            # Hash the credential value
            if credential_value:
                credential.credential_value = self._hash_value(credential_value)

            self._credentials[credential.id] = credential
            self._access_records[credential.id] = []
            self._rotation_records[credential.id] = []
            return credential

    def get_credential(self, credential_id: str) -> Optional[Credential]:
        """Get a credential."""
        return self._credentials.get(credential_id)

    def get_agent_credentials(self, agent_id: str, status: CredentialStatus = None,
                            category: CredentialCategory = None) -> List[Credential]:
        """Get all credentials for an agent."""
        creds = [c for c in self._credentials.values() if c.agent_id == agent_id]
        if status:
            creds = [c for c in creds if c.status == status]
        if category:
            creds = [c for c in creds if c.category == category]
        return creds

    def update_credential(self, credential_id: str, **kwargs) -> Optional[Credential]:
        """Update a credential."""
        with self._lock:
            credential = self._credentials.get(credential_id)
            if not credential:
                return None

            for key, value in kwargs.items():
                if hasattr(credential, key):
                    setattr(credential, key, value)

            credential.updated_at = datetime.now().isoformat()
            return credential

    def delete_credential(self, credential_id: str) -> bool:
        """Delete a credential."""
        with self._lock:
            if credential_id in self._credentials:
                del self._credentials[credential_id]
                if credential_id in self._access_records:
                    del self._access_records[credential_id]
                if credential_id in self._rotation_records:
                    del self._rotation_records[credential_id]
                return True
            return False

    def rotate_credential(self, credential_id: str, new_value: str, rotated_by: str = "",
                        reason: str = "", automatic: bool = False) -> Optional[Credential]:
        """Rotate a credential."""
        with self._lock:
            credential = self._credentials.get(credential_id)
            if not credential:
                return None

            # Create rotation record
            rotation = CredentialRotation(
                credential_id=credential_id,
                rotated_by=rotated_by,
                old_value_hash=credential.credential_value,
                new_value=self._hash_value(new_value),
                new_value_hash=self._hash_value(new_value),
                reason=reason,
                automatic=automatic
            )

            # Update credential
            credential.credential_value = self._hash_value(new_value)
            credential.last_rotated = datetime.now().isoformat()
            credential.updated_at = datetime.now().isoformat()
            credential.status = CredentialStatus.ROTATED

            # Reset status to active after rotation
            credential.status = CredentialStatus.ACTIVE

            self._rotation_records[credential_id].append(rotation)
            return credential

    def revoke_credential(self, credential_id: str) -> Optional[Credential]:
        """Revoke a credential."""
        return self.update_credential(credential_id, status=CredentialStatus.REVOKED)

    def suspend_credential(self, credential_id: str) -> Optional[Credential]:
        """Suspend a credential."""
        return self.update_credential(credential_id, status=CredentialStatus.SUSPENDED)

    def activate_credential(self, credential_id: str) -> Optional[Credential]:
        """Activate a credential."""
        return self.update_credential(credential_id, status=CredentialStatus.ACTIVE)

    def expire_credential(self, credential_id: str) -> Optional[Credential]:
        """Expire a credential."""
        return self.update_credential(credential_id, status=CredentialStatus.EXPIRED)

    def record_access(self, credential_id: str, agent_id: str, accessed_by: str = "",
                    access_method: str = "", **kwargs) -> Optional[CredentialAccess]:
        """Record credential access."""
        credential = self._credentials.get(credential_id)
        if not credential:
            return None

        access = CredentialAccess(
            credential_id=credential_id,
            agent_id=agent_id,
            accessed_by=accessed_by,
            access_method=access_method,
            **kwargs
        )

        credential.last_used = datetime.now().isoformat()
        self._access_records[credential_id].append(access)
        return access

    def get_access_history(self, credential_id: str, limit: int = 100) -> List[CredentialAccess]:
        """Get access history for a credential."""
        records = self._access_records.get(credential_id, [])
        return sorted(records, key=lambda x: x.timestamp, reverse=True)[:limit]

    def get_rotation_history(self, credential_id: str) -> List[CredentialRotation]:
        """Get rotation history for a credential."""
        return self._rotation_records.get(credential_id, [])

    def check_expiring_credentials(self, agent_id: str, days: int = 7) -> List[Credential]:
        """Check for credentials expiring within specified days."""
        threshold = datetime.now() + timedelta(days=days)
        creds = self.get_agent_credentials(agent_id)
        expiring = []
        for c in creds:
            if c.expires_at:
                exp_date = datetime.fromisoformat(c.expires_at)
                if c.status == CredentialStatus.ACTIVE and exp_date <= threshold:
                    expiring.append(c)
        return expiring

    def get_expiring_credentials(self, days: int = 7) -> List[Credential]:
        """Get all expiring credentials across all agents."""
        threshold = datetime.now() + timedelta(days=days)
        expiring = []
        for c in self._credentials.values():
            if c.expires_at and c.status == CredentialStatus.ACTIVE:
                exp_date = datetime.fromisoformat(c.expires_at)
                if exp_date <= threshold:
                    expiring.append(c)
        return expiring

    # Policy management
    def create_policy(self, name: str, description: str = "", **kwargs) -> CredentialPolicy:
        """Create a credential policy."""
        policy = CredentialPolicy(name=name, description=description, **kwargs)
        self._policies[policy.id] = policy
        return policy

    def get_policy(self, policy_id: str) -> Optional[CredentialPolicy]:
        """Get a policy."""
        return self._policies.get(policy_id)

    def get_policies(self) -> List[CredentialPolicy]:
        """Get all policies."""
        return list(self._policies.values())

    def update_policy(self, policy_id: str, **kwargs) -> Optional[CredentialPolicy]:
        """Update a policy."""
        policy = self._policies.get(policy_id)
        if not policy:
            return None
        for key, value in kwargs.items():
            if hasattr(policy, key):
                setattr(policy, key, value)
        return policy

    def delete_policy(self, policy_id: str) -> bool:
        """Delete a policy."""
        if policy_id in self._policies:
            del self._policies[policy_id]
            return True
        return False

    def validate_credential(self, credential_id: str, policy_id: str = None) -> dict:
        """Validate a credential against a policy."""
        credential = self._credentials.get(credential_id)
        if not credential:
            return {"valid": False, "errors": ["Credential not found"]}

        errors = []

        # If no specific policy, find matching policy
        if not policy_id:
            for pol in self._policies.values():
                if credential.credential_type.value in pol.credential_types:
                    policy = pol
                    break
            else:
                return {"valid": True, "errors": []}
        else:
            policy = self._policies.get(policy_id)
            if not policy:
                return {"valid": False, "errors": ["Policy not found"]}

        # Validate against policy
        value = credential.credential_value
        if len(value) < policy.min_length:
            errors.append(f"Password must be at least {policy.min_length} characters")

        if policy.require_uppercase and not any(c.isupper() for c in value):
            errors.append("Password must contain uppercase letters")

        if policy.require_lowercase and not any(c.islower() for c in value):
            errors.append("Password must contain lowercase letters")

        if policy.require_numbers and not any(c.isdigit() for c in value):
            errors.append("Password must contain numbers")

        if policy.require_special and not any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in value):
            errors.append("Password must contain special characters")

        # Check expiration
        if credential.expires_at and policy.max_age_days:
            exp_date = datetime.fromisoformat(credential.expires_at)
            days_until_exp = (exp_date - datetime.now()).days
            if days_until_exp < 0:
                errors.append("Credential has expired")
            elif days_until_exp < policy.rotation_reminder_days:
                errors.append(f"Credential expires in {days_until_exp} days")

        return {"valid": len(errors) == 0, "errors": errors}

    def get_metrics(self, agent_id: str) -> CredentialMetrics:
        """Get credential metrics for an agent."""
        creds = self.get_agent_credentials(agent_id)
        total = len(creds)
        active = len([c for c in creds if c.status == CredentialStatus.ACTIVE])
        expired = len([c for c in creds if c.status == CredentialStatus.EXPIRED])
        expiring = len(self.check_expiring_credentials(agent_id))
        revoked = len([c for c in creds if c.status == CredentialStatus.REVOKED])

        rotations = 0
        last_rotation = None
        for cred in creds:
            rot_history = self._rotation_records.get(cred.id, [])
            rotations += len(rot_history)
            if rot_history:
                latest = max(rot_history, key=lambda x: x.timestamp)
                if not last_rotation or latest.timestamp > last_rotation:
                    last_rotation = latest.timestamp

        # Calculate average age
        ages = []
        now = datetime.now()
        for c in creds:
            created = datetime.fromisoformat(c.created_at)
            age = (now - created).days
            ages.append(age)
        avg_age = sum(ages) / len(ages) if ages else 0.0

        return CredentialMetrics(
            agent_id=agent_id,
            total_credentials=total,
            active_credentials=active,
            expired_credentials=expired,
            expiring_soon=expiring,
            revoked_credentials=revoked,
            total_rotations=rotations,
            last_rotation_date=last_rotation,
            avg_credential_age_days=avg_age
        )

    def generate_report(self, agent_id: str) -> CredentialReport:
        """Generate a credential report."""
        creds = self.get_agent_credentials(agent_id)

        by_type = {}
        by_status = {}
        for c in creds:
            t = c.credential_type.value
            by_type[t] = by_type.get(t, 0) + 1
            s = c.status.value
            by_status[s] = by_status.get(s, 0) + 1

        expiring = self.check_expiring_credentials(agent_id)
        expiring_list = [{"id": c.id, "name": c.name, "expires": c.expires_at} for c in expiring]

        # Compliance issues
        issues = []
        for c in creds:
            if c.status == CredentialStatus.EXPIRED:
                issues.append(f"Credential '{c.name}' has expired")
            if c.status == CredentialStatus.ACTIVE and c.expires_at:
                exp_date = datetime.fromisoformat(c.expires_at)
                if exp_date <= datetime.now():
                    issues.append(f"Credential '{c.name}' is past expiration date")

        # Recommendations
        recommendations = []
        if expiring:
            recommendations.append(f"Rotate {len(expiring)} expiring credentials")
        if len([c for c in creds if c.status == CredentialStatus.EXPIRED]) > 0:
            recommendations.append("Remove or renew expired credentials")
        if len([c for c in creds if c.rotation_policy == CredentialRotationPolicy.MANUAL]) > 0:
            recommendations.append("Consider enabling automatic rotation for manual policies")

        return CredentialReport(
            agent_id=agent_id,
            total_credentials=len(creds),
            credentials_by_type=by_type,
            credentials_by_status=by_status,
            expiring_credentials=expiring_list,
            compliance_issues=issues,
            recommendations=recommendations
        )

    def _hash_value(self, value: str) -> str:
        """Hash a credential value."""
        return hashlib.sha256(value.encode()).hexdigest()

    def get_config(self) -> dict:
        """Get configuration."""
        return {
            "encryption_enabled": self._config.encryption_enabled,
            "encryption_algorithm": self._config.encryption_algorithm.value,
            "default_rotation_policy": self._config.default_rotation_policy.value,
            "rotation_reminder_days": self._config.rotation_reminder_days,
            "max_credentials_per_agent": self._config.max_credentials_per_agent,
            "require_approval": self._config.require_approval,
            "audit_logging": self._config.audit_logging,
            "auto_rotate_on_expire": self._config.auto_rotate_on_expire
        }

    def update_config(self, **kwargs):
        """Update configuration."""
        with self._lock:
            for key, value in kwargs.items():
                if hasattr(self._config, key):
                    if key == "encryption_algorithm" and isinstance(value, str):
                        value = EncryptionAlgorithm(value)
                    if key == "default_rotation_policy" and isinstance(value, str):
                        value = CredentialRotationPolicy(value)
                    setattr(self._config, key, value)


class AgentCredential:
    """Public API for agent credential."""

    def __init__(self):
        self.manager = CredentialManager()

    # Credentials
    def create(self, agent_id: str, name: str, **kwargs) -> Credential:
        """Create a credential."""
        return self.manager.create_credential(agent_id, name, **kwargs)

    def get(self, credential_id: str) -> Optional[Credential]:
        """Get a credential."""
        return self.manager.get_credential(credential_id)

    def list(self, agent_id: str, **kwargs) -> List[Credential]:
        """List credentials."""
        return self.manager.get_agent_credentials(agent_id, **kwargs)

    def update(self, credential_id: str, **kwargs) -> Optional[Credential]:
        """Update a credential."""
        return self.manager.update_credential(credential_id, **kwargs)

    def delete(self, credential_id: str) -> bool:
        """Delete a credential."""
        return self.manager.delete_credential(credential_id)

    def rotate(self, credential_id: str, new_value: str, **kwargs) -> Optional[Credential]:
        """Rotate a credential."""
        return self.manager.rotate_credential(credential_id, new_value, **kwargs)

    def revoke(self, credential_id: str) -> Optional[Credential]:
        """Revoke a credential."""
        return self.manager.revoke_credential(credential_id)

    def suspend(self, credential_id: str) -> Optional[Credential]:
        """Suspend a credential."""
        return self.manager.suspend_credential(credential_id)

    def activate(self, credential_id: str) -> Optional[Credential]:
        """Activate a credential."""
        return self.manager.activate_credential(credential_id)

    # Access tracking
    def record_access(self, credential_id: str, agent_id: str, **kwargs) -> Optional[CredentialAccess]:
        """Record credential access."""
        return self.manager.record_access(credential_id, agent_id, **kwargs)

    def get_access_history(self, credential_id: str, **kwargs) -> List[CredentialAccess]:
        """Get access history."""
        return self.manager.get_access_history(credential_id, **kwargs)

    # Rotation
    def get_rotation_history(self, credential_id: str) -> List[CredentialRotation]:
        """Get rotation history."""
        return self.manager.get_rotation_history(credential_id)

    def check_expiring(self, agent_id: str, **kwargs) -> List[Credential]:
        """Check expiring credentials."""
        return self.manager.check_expiring_credentials(agent_id, **kwargs)

    # Policies
    def create_policy(self, name: str, **kwargs) -> CredentialPolicy:
        """Create a policy."""
        return self.manager.create_policy(name, **kwargs)

    def get_policy(self, policy_id: str) -> Optional[CredentialPolicy]:
        """Get a policy."""
        return self.manager.get_policy(policy_id)

    def list_policies(self) -> List[CredentialPolicy]:
        """List policies."""
        return self.manager.get_policies()

    def update_policy(self, policy_id: str, **kwargs) -> Optional[CredentialPolicy]:
        """Update a policy."""
        return self.manager.update_policy(policy_id, **kwargs)

    def delete_policy(self, policy_id: str) -> bool:
        """Delete a policy."""
        return self.manager.delete_policy(policy_id)

    def validate(self, credential_id: str, **kwargs) -> dict:
        """Validate credential."""
        return self.manager.validate_credential(credential_id, **kwargs)

    # Metrics & Reports
    def metrics(self, agent_id: str) -> CredentialMetrics:
        """Get metrics."""
        return self.manager.get_metrics(agent_id)

    def report(self, agent_id: str) -> CredentialReport:
        """Generate report."""
        return self.manager.generate_report(agent_id)

    # Config
    def config(self) -> dict:
        """Get config."""
        return self.manager.get_config()

    def update_config(self, **kwargs):
        """Update config."""
        self.manager.update_config(**kwargs)


# Global instance
agent_credential = AgentCredential()
