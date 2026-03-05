"""Agent Migration 2 Module

Cross-cloud migration system for agents including multi-cloud provider support,
data transfer, compatibility checking, and migration verification.
"""
import time
import uuid
import threading
import hashlib
import json
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class CloudProvider(str, Enum):
    """Supported cloud providers."""
    AWS = "aws"
    AZURE = "azure"
    GCP = "gcp"
    KUBERNETES = "kubernetes"
    ON_PREMISE = "on_premise"
    CUSTOM = "custom"


class MigrationStatus(str, Enum):
    """Migration status."""
    PENDING = "pending"
    PLANNING = "planning"
    PREPARING = "preparing"
    MIGRATING = "migrating"
    VALIDATING = "validating"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"
    PAUSED = "paused"


class MigrationPhase(str, Enum):
    """Migration phases."""
    ASSESSMENT = "assessment"
    PLANNING = "planning"
    PREPARATION = "preparation"
    DATA_MIGRATION = "data_migration"
    APPLICATION_MIGRATION = "application_migration"
    VALIDATION = "validation"
    CUTOVER = "cutover"
    POST_MIGRATION = "post_migration"


class ResourceType(str, Enum):
    """Resource types for migration."""
    COMPUTE = "compute"
    STORAGE = "storage"
    DATABASE = "database"
    NETWORK = "network"
    CONTAINER = "container"
    SERVERLESS = "serverless"
    SECURITY = "security"


class TransferMethod(str, Enum):
    """Data transfer methods."""
    DIRECT = "direct"
    STAGING = "staging"
    STREAMING = "streaming"
    BATCH = "batch"
    REPLICATION = "replication"


@dataclass
class CloudEndpoint:
    """Cloud provider endpoint configuration."""
    provider: CloudProvider
    region: str
    zone: str = ""
    endpoint: str = ""
    access_key: str = ""
    secret_key: str = ""
    project_id: str = ""
    subscription_id: str = ""
    is_active: bool = True


@dataclass
class MigrationResource:
    """Resource to be migrated."""
    id: str
    name: str
    resource_type: ResourceType
    source_endpoint: CloudEndpoint
    target_endpoint: CloudEndpoint
    config: Dict[str, Any] = field(default_factory=dict)
    dependencies: List[str] = field(default_factory=list)
    estimated_size: int = 0
    estimated_duration: float = 0.0
    status: MigrationStatus = MigrationStatus.PENDING


@dataclass
class MigrationPlan:
    """Migration plan."""
    id: str
    name: str
    source_endpoint: CloudEndpoint
    target_endpoint: CloudEndpoint
    resources: List[MigrationResource] = field(default_factory=list)
    phases: List[str] = field(default_factory=list)
    status: MigrationStatus = MigrationStatus.PENDING
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    total_resources: int = 0
    migrated_resources: int = 0
    failed_resources: int = 0


@dataclass
class MigrationConfig:
    """Migration configuration."""
    name: str
    source_provider: CloudProvider
    target_provider: CloudProvider
    source_region: str
    target_region: str
    transfer_method: TransferMethod = TransferMethod.DIRECT
    parallel_transfers: int = 4
    bandwidth_limit_mbps: int = 0  # 0 = unlimited
    verify_checksums: bool = True
    enable_rollback: bool = True
    pause_on_error: bool = False
    compression_enabled: bool = True
    encryption_enabled: bool = True


@dataclass
class MigrationStats:
    """Migration statistics."""
    total_migrations: int = 0
    successful_migrations: int = 0
    failed_migrations: int = 0
    total_bytes_transferred: int = 0
    avg_transfer_speed_mbps: float = 0.0


@dataclass
class CompatibilityReport:
    """Compatibility assessment report."""
    resource_id: str
    resource_name: str
    is_compatible: bool
    issues: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    recommendations: List[str] = field(default_factory=list)


class CrossCloudMigration:
    """Cross-cloud migration engine."""

    def __init__(self, config: MigrationConfig):
        self.config = config
        self._lock = threading.RLock()
        self._resources: Dict[str, MigrationResource] = {}
        self._compatibility_reports: Dict[str, CompatibilityReport] = {}
        self._stats = MigrationStats()
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)
        self._migration_log: List[Dict[str, Any]] = []

    def add_resource(
        self,
        name: str,
        resource_type: ResourceType,
        source_endpoint: CloudEndpoint,
        target_endpoint: CloudEndpoint,
        config: Dict[str, Any] = None,
        dependencies: List[str] = None,
        estimated_size: int = 0,
        estimated_duration: float = 0.0
    ) -> str:
        """Add a resource to migrate."""
        with self._lock:
            resource_id = str(uuid.uuid4())[:8]

            resource = MigrationResource(
                id=resource_id,
                name=name,
                resource_type=resource_type,
                source_endpoint=source_endpoint,
                target_endpoint=target_endpoint,
                config=config or {},
                dependencies=dependencies or [],
                estimated_size=estimated_size,
                estimated_duration=estimated_duration
            )

            self._resources[resource_id] = resource
            return resource_id

    def remove_resource(self, resource_id: str) -> bool:
        """Remove a resource from migration."""
        with self._lock:
            if resource_id in self._resources:
                del self._resources[resource_id]
                return True
            return False

    def list_resources(self) -> List[MigrationResource]:
        """List all resources."""
        with self._lock:
            return list(self._resources.values())

    def _check_compatibility(self, resource: MigrationResource) -> CompatibilityReport:
        """Check compatibility between source and target."""
        issues = []
        warnings = []
        recommendations = []

        source = resource.source_endpoint
        target = resource.target_endpoint

        # Check provider compatibility
        if source.provider == target.provider:
            warnings.append(f"Same provider ({source.provider.value}) migration - consider using native tools")

        # Check resource type specific compatibility
        if resource.resource_type == ResourceType.DATABASE:
            # Check database compatibility
            source_db = resource.config.get("database_type", "")
            target_db = resource.config.get("target_database_type", "")

            if source_db != target_db:
                issues.append(f"Database type mismatch: {source_db} -> {target_db}")

            # Check version compatibility
            source_version = resource.config.get("version", "")
            if source_version:
                recommendations.append(f"Ensure target database version is compatible with {source_version}")

        elif resource.resource_type == ResourceType.STORAGE:
            # Check storage compatibility
            source_storage_type = resource.config.get("storage_type", "")
            if source_storage_type:
                recommendations.append(f"Consider using equivalent storage class in target cloud")

        elif resource.resource_type == ResourceType.COMPUTE:
            # Check compute compatibility
            source_instance = resource.config.get("instance_type", "")
            if source_instance:
                recommendations.append(f"Select equivalent instance type in target cloud")

        elif resource.resource_type == ResourceType.NETWORK:
            # Check network compatibility
            recommendations.append("Ensure VPC CIDR ranges do not overlap")
            recommendations.append("Update security groups for new IP ranges")

        is_compatible = len(issues) == 0

        report = CompatibilityReport(
            resource_id=resource.id,
            resource_name=resource.name,
            is_compatible=is_compatible,
            issues=issues,
            warnings=warnings,
            recommendations=recommendations
        )

        self._compatibility_reports[resource.id] = report
        return report

    def assess_compatibility(self) -> Dict[str, CompatibilityReport]:
        """Assess compatibility for all resources."""
        with self._lock:
            reports = {}
            for resource in self._resources.values():
                report = self._check_compatibility(resource)
                reports[resource.id] = report
            return reports

    def _execute_resource_migration(self, resource: MigrationResource) -> bool:
        """Execute migration for a single resource."""
        try:
            # Simulate migration based on resource type
            if resource.resource_type == ResourceType.STORAGE:
                # Simulate storage migration
                time.sleep(0.1)
            elif resource.resource_type == ResourceType.DATABASE:
                # Simulate database migration
                time.sleep(0.2)
            elif resource.resource_type == ResourceType.COMPUTE:
                # Simulate compute migration
                time.sleep(0.15)
            else:
                time.sleep(0.1)

            # Update resource status
            resource.status = MigrationStatus.COMPLETED

            # Log migration
            self._migration_log.append({
                "resource_id": resource.id,
                "resource_name": resource.name,
                "timestamp": time.time(),
                "status": "completed"
            })

            return True

        except Exception as e:
            resource.status = MigrationStatus.FAILED
            self._migration_log.append({
                "resource_id": resource.id,
                "resource_name": resource.name,
                "timestamp": time.time(),
                "status": "failed",
                "error": str(e)
            })
            return False

    def execute_migration(self) -> bool:
        """Execute the migration for all resources."""
        with self._lock:
            if not self._resources:
                return False

            try:
                # Sort resources by dependencies
                migrated_ids = set()

                while len(migrated_ids) < len(self._resources):
                    # Find ready resources (all dependencies satisfied)
                    ready_resources = []
                    for resource in self._resources.values():
                        if resource.id in migrated_ids:
                            continue
                        if resource.status != MigrationStatus.PENDING:
                            continue

                        # Check if all dependencies are migrated
                        deps_satisfied = all(dep_id in migrated_ids for dep_id in resource.dependencies)
                        if deps_satisfied:
                            ready_resources.append(resource)

                    if not ready_resources:
                        break

                    # Migrate ready resources
                    for resource in ready_resources:
                        resource.status = MigrationStatus.MIGRATING
                        success = self._execute_resource_migration(resource)

                        if success:
                            self._stats.successful_migrations += 1
                        else:
                            self._stats.failed_migrations += 1
                            if self.config.pause_on_error:
                                return False

                        migrated_ids.add(resource.id)

                self._stats.total_migrations = len(self._resources)
                return True

            except Exception:
                return False

    def rollback_migration(self, resource_id: str = None) -> bool:
        """Rollback migration for a resource or all resources."""
        with self._lock:
            if resource_id:
                resource = self._resources.get(resource_id)
                if resource:
                    resource.status = MigrationStatus.ROLLED_BACK
                    return True
                return False
            else:
                # Rollback all
                for resource in self._resources.values():
                    if resource.status == MigrationStatus.COMPLETED:
                        resource.status = MigrationStatus.ROLLED_BACK
                return True

    def get_migration_log(self) -> List[Dict[str, Any]]:
        """Get migration log."""
        with self._lock:
            return list(self._migration_log)

    def get_stats(self) -> Dict[str, Any]:
        """Get migration statistics."""
        with self._lock:
            return {
                "total_migrations": self._stats.total_migrations,
                "successful_migrations": self._stats.successful_migrations,
                "failed_migrations": self._stats.failed_migrations,
                "total_bytes_transferred": self._stats.total_bytes_transferred,
                "avg_transfer_speed_mbps": round(self._stats.avg_transfer_speed_mbps, 2),
                "resources_count": len(self._resources)
            }

    def validate_migration(self, resource_id: str = None) -> bool:
        """Validate migration results."""
        with self._lock:
            if resource_id:
                resource = self._resources.get(resource_id)
                if not resource:
                    return False
                return resource.status == MigrationStatus.COMPLETED
            else:
                # Validate all
                return all(
                    r.status == MigrationStatus.COMPLETED
                    for r in self._resources.values()
                )


class AgentMigration2:
    """Agent cross-cloud migration management system."""

    def __init__(self):
        self._lock = threading.RLock()
        self._migrations: Dict[str, CrossCloudMigration] = {}
        self._plans: Dict[str, MigrationPlan] = {}
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def create_migration(
        self,
        name: str,
        source_provider: CloudProvider,
        target_provider: CloudProvider,
        source_region: str,
        target_region: str,
        transfer_method: TransferMethod = TransferMethod.DIRECT,
        parallel_transfers: int = 4,
        bandwidth_limit_mbps: int = 0,
        verify_checksums: bool = True,
        enable_rollback: bool = True,
        pause_on_error: bool = False,
        compression_enabled: bool = True,
        encryption_enabled: bool = True
    ) -> str:
        """Create a new migration."""
        with self._lock:
            migration_id = str(uuid.uuid4())[:8]

            config = MigrationConfig(
                name=name,
                source_provider=source_provider,
                target_provider=target_provider,
                source_region=source_region,
                target_region=target_region,
                transfer_method=transfer_method,
                parallel_transfers=parallel_transfers,
                bandwidth_limit_mbps=bandwidth_limit_mbps,
                verify_checksums=verify_checksums,
                enable_rollback=enable_rollback,
                pause_on_error=pause_on_error,
                compression_enabled=compression_enabled,
                encryption_enabled=encryption_enabled
            )

            migration = CrossCloudMigration(config)
            self._migrations[migration_id] = migration
            return migration_id

    def get_migration(self, migration_id: str) -> Optional[CrossCloudMigration]:
        """Get migration by ID."""
        with self._lock:
            return self._migrations.get(migration_id)

    def delete_migration(self, migration_id: str) -> bool:
        """Delete a migration."""
        with self._lock:
            if migration_id in self._migrations:
                del self._migrations[migration_id]
                return True
            return False

    def list_migrations(self) -> List[Dict[str, Any]]:
        """List all migrations."""
        with self._lock:
            return [
                {
                    "id": mid,
                    "name": m.config.name,
                    "source_provider": m.config.source_provider.value,
                    "target_provider": m.config.target_provider.value,
                    "source_region": m.config.source_region,
                    "target_region": m.config.target_region,
                    "transfer_method": m.config.transfer_method.value,
                    "stats": m.get_stats()
                }
                for mid, m in self._migrations.items()
            ]

    def add_resource(
        self,
        migration_id: str,
        name: str,
        resource_type: ResourceType,
        source_provider: CloudProvider,
        source_region: str,
        target_provider: CloudProvider,
        target_region: str,
        config: Dict[str, Any] = None,
        dependencies: List[str] = None,
        estimated_size: int = 0,
        estimated_duration: float = 0.0
    ) -> Optional[str]:
        """Add a resource to migrate."""
        migration = self.get_migration(migration_id)
        if not migration:
            return None

        source_endpoint = CloudEndpoint(provider=source_provider, region=source_region)
        target_endpoint = CloudEndpoint(provider=target_provider, region=target_region)

        return migration.add_resource(
            name=name,
            resource_type=resource_type,
            source_endpoint=source_endpoint,
            target_endpoint=target_endpoint,
            config=config,
            dependencies=dependencies,
            estimated_size=estimated_size,
            estimated_duration=estimated_duration
        )

    def remove_resource(self, migration_id: str, resource_id: str) -> bool:
        """Remove a resource from migration."""
        migration = self.get_migration(migration_id)
        if not migration:
            return False
        return migration.remove_resource(resource_id)

    def get_resources(self, migration_id: str) -> List[Dict[str, Any]]:
        """Get resources in a migration."""
        migration = self.get_migration(migration_id)
        if not migration:
            return []

        resources = migration.list_resources()
        return [
            {
                "id": r.id,
                "name": r.name,
                "resource_type": r.resource_type.value,
                "status": r.status.value,
                "estimated_size": r.estimated_size,
                "estimated_duration": r.estimated_duration,
                "dependencies": r.dependencies
            }
            for r in resources
        ]

    def assess_compatibility(self, migration_id: str) -> Dict[str, Dict[str, Any]]:
        """Assess compatibility for a migration."""
        migration = self.get_migration(migration_id)
        if not migration:
            return {}

        reports = migration.assess_compatibility()
        return {
            rid: {
                "resource_name": r.resource_name,
                "is_compatible": r.is_compatible,
                "issues": r.issues,
                "warnings": r.warnings,
                "recommendations": r.recommendations
            }
            for rid, r in reports.items()
        }

    def execute_migration(self, migration_id: str) -> bool:
        """Execute a migration."""
        migration = self.get_migration(migration_id)
        if not migration:
            return False
        return migration.execute_migration()

    def rollback_migration(self, migration_id: str, resource_id: str = None) -> bool:
        """Rollback a migration."""
        migration = self.get_migration(migration_id)
        if not migration:
            return False
        return migration.rollback_migration(resource_id)

    def validate_migration(self, migration_id: str, resource_id: str = None) -> bool:
        """Validate a migration."""
        migration = self.get_migration(migration_id)
        if not migration:
            return False
        return migration.validate_migration(resource_id)

    def get_migration_log(self, migration_id: str) -> List[Dict[str, Any]]:
        """Get migration log."""
        migration = self.get_migration(migration_id)
        if not migration:
            return []
        return migration.get_migration_log()

    def get_stats(self, migration_id: str) -> Optional[Dict[str, Any]]:
        """Get migration statistics."""
        migration = self.get_migration(migration_id)
        if not migration:
            return None
        return migration.get_stats()

    def get_all_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics for all migrations."""
        return {
            mid: m.get_stats()
            for mid, m in self._migrations.items()
        }

    def create_plan(
        self,
        name: str,
        source_provider: CloudProvider,
        source_region: str,
        target_provider: CloudProvider,
        target_region: str
    ) -> str:
        """Create a migration plan."""
        with self._lock:
            plan_id = str(uuid.uuid4())[:8]

            plan = MigrationPlan(
                id=plan_id,
                name=name,
                source_endpoint=CloudEndpoint(provider=source_provider, region=source_region),
                target_endpoint=CloudEndpoint(provider=target_provider, region=target_region)
            )

            self._plans[plan_id] = plan
            return plan_id

    def get_plan(self, plan_id: str) -> Optional[MigrationPlan]:
        """Get migration plan."""
        with self._lock:
            return self._plans.get(plan_id)

    def list_plans(self) -> List[Dict[str, Any]]:
        """List migration plans."""
        with self._lock:
            return [
                {
                    "id": pid,
                    "name": p.name,
                    "source_provider": p.source_endpoint.provider.value,
                    "source_region": p.source_endpoint.region,
                    "target_provider": p.target_endpoint.provider.value,
                    "target_region": p.target_endpoint.region,
                    "status": p.status.value,
                    "total_resources": p.total_resources,
                    "migrated_resources": p.migrated_resources
                }
                for pid, p in self._plans.items()
            ]


# Global migration instance
agent_migration2 = AgentMigration2()
