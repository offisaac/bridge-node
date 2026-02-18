"""Agent Contract Module

Contract management for agents including contract creation, validation, signing,
execution tracking, and compliance monitoring.
"""
import time
import uuid
import threading
import hashlib
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class ContractStatus(str, Enum):
    """Contract status types."""
    DRAFT = "draft"
    PENDING = "pending"
    ACTIVE = "active"
    EXPIRED = "expired"
    TERMINATED = "terminated"
    CANCELLED = "cancelled"


class ContractType(str, Enum):
    """Contract type types."""
    SERVICE = "service"
    LICENSE = "license"
    SLA = "sla"
    NDA = "nda"
    PARTNERSHIP = "partnership"
    EMPLOYMENT = "employment"
    VENDOR = "vendor"
    CUSTOM = "custom"


class SignatureStatus(str, Enum):
    """Signature status types."""
    PENDING = "pending"
    SIGNED = "signed"
    REJECTED = "rejected"
    EXPIRED = "expired"


class PartyType(str, Enum):
    """Party type types."""
    AGENT = "agent"
    USER = "user"
    ORGANIZATION = "organization"
    SYSTEM = "system"


@dataclass
class ContractParty:
    """Contract party data."""
    id: str
    party_type: PartyType
    name: str
    email: str
    role: str  # signer, approver, observer
    signed_at: float = 0.0
    signature: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ContractClause:
    """Contract clause data."""
    id: str
    title: str
    content: str
    order: int
    required: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ContractTerm:
    """Contract term data."""
    id: str
    key: str
    value: str
    description: str = ""


@dataclass
class Contract:
    """Contract data."""
    id: str
    name: str
    contract_type: ContractType
    status: ContractStatus
    created_at: float
    updated_at: float
    start_date: float
    end_date: float
    parties: List[ContractParty] = field(default_factory=list)
    clauses: List[ContractClause] = field(default_factory=list)
    terms: List[ContractTerm] = field(default_factory=list)
    document_url: str = ""
    version: str = "1.0"
    parent_id: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ContractEvent:
    """Contract event data."""
    id: str
    contract_id: str
    event_type: str
    description: str
    timestamp: float
    user_id: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ContractConfig:
    """Contract configuration."""
    require_all_signatures: bool = True
    auto_expire: bool = True
    expiration_warning_days: int = 30
    max_attachments: int = 10
    enable_versioning: bool = True
    default_validity_days: int = 365
    require_witness: bool = False


class ContractManager:
    """Contract management engine."""

    def __init__(self, config: ContractConfig = None):
        self._lock = threading.RLock()
        self._config = config or ContractConfig()
        self._contracts: Dict[str, Contract] = {}
        self._events: List[ContractEvent] = []
        self._hooks: Dict[str, List[Callable]] = defaultdict(list)

    def create_contract(
        self,
        name: str,
        contract_type: str,
        start_date: float,
        end_date: float,
        parties: List[Dict[str, Any]] = None,
        clauses: List[Dict[str, Any]] = None,
        terms: List[Dict[str, Any]] = None,
        document_url: str = "",
        metadata: Dict[str, Any] = None
    ) -> Contract:
        """Create a new contract."""
        with self._lock:
            current_time = time.time()

            # Create parties
            contract_parties = []
            if parties:
                for i, p in enumerate(parties):
                    party = ContractParty(
                        id=str(uuid.uuid4())[:12],
                        party_type=PartyType(p.get("party_type", "user")),
                        name=p.get("name", ""),
                        email=p.get("email", ""),
                        role=p.get("role", "signer"),
                        metadata=p.get("metadata", {})
                    )
                    contract_parties.append(party)

            # Create clauses
            contract_clauses = []
            if clauses:
                for i, c in enumerate(clauses):
                    clause = ContractClause(
                        id=str(uuid.uuid4())[:12],
                        title=c.get("title", ""),
                        content=c.get("content", ""),
                        order=c.get("order", i),
                        required=c.get("required", True),
                        metadata=c.get("metadata", {})
                    )
                    contract_clauses.append(clause)

            # Create terms
            contract_terms = []
            if terms:
                for t in terms:
                    term = ContractTerm(
                        id=str(uuid.uuid4())[:12],
                        key=t.get("key", ""),
                        value=t.get("value", ""),
                        description=t.get("description", "")
                    )
                    contract_terms.append(term)

            contract = Contract(
                id=str(uuid.uuid4())[:12],
                name=name,
                contract_type=ContractType(contract_type),
                status=ContractStatus.DRAFT,
                created_at=current_time,
                updated_at=current_time,
                start_date=start_date,
                end_date=end_date,
                parties=contract_parties,
                clauses=contract_clauses,
                terms=contract_terms,
                document_url=document_url,
                metadata=metadata or {}
            )

            self._contracts[contract.id] = contract

            # Log event
            self._log_event(contract.id, "created", "Contract created")

            return contract

    def get_contract(self, contract_id: str) -> Optional[Contract]:
        """Get contract by ID."""
        with self._lock:
            return self._contracts.get(contract_id)

    def get_contracts(
        self,
        contract_type: str = None,
        status: str = None,
        limit: int = 100
    ) -> List[Contract]:
        """Get contracts."""
        with self._lock:
            contracts = list(self._contracts.values())

            if contract_type:
                contracts = [c for c in contracts if c.contract_type.value == contract_type]
            if status:
                contracts = [c for c in contracts if c.status.value == status]

            return contracts[:limit]

    def update_contract(
        self,
        contract_id: str,
        name: str = None,
        start_date: float = None,
        end_date: float = None,
        document_url: str = None,
        metadata: Dict[str, Any] = None
    ) -> Optional[Contract]:
        """Update contract."""
        with self._lock:
            contract = self._contracts.get(contract_id)
            if not contract:
                return None

            current_time = time.time()

            if name is not None:
                contract.name = name
            if start_date is not None:
                contract.start_date = start_date
            if end_date is not None:
                contract.end_date = end_date
            if document_url is not None:
                contract.document_url = document_url

            contract.updated_at = current_time

            if metadata:
                contract.metadata.update(metadata)

            self._log_event(contract_id, "updated", "Contract updated")

            return contract

    def add_party(
        self,
        contract_id: str,
        party_type: str,
        name: str,
        email: str,
        role: str = "signer",
        metadata: Dict[str, Any] = None
    ) -> Optional[ContractParty]:
        """Add party to contract."""
        with self._lock:
            contract = self._contracts.get(contract_id)
            if not contract:
                return None

            party = ContractParty(
                id=str(uuid.uuid4())[:12],
                party_type=PartyType(party_type),
                name=name,
                email=email,
                role=role,
                metadata=metadata or {}
            )

            contract.parties.append(party)
            contract.updated_at = time.time()

            self._log_event(contract_id, "party_added", f"Party added: {name}")

            return party

    def remove_party(self, contract_id: str, party_id: str) -> bool:
        """Remove party from contract."""
        with self._lock:
            contract = self._contracts.get(contract_id)
            if not contract:
                return False

            for i, party in enumerate(contract.parties):
                if party.id == party_id:
                    contract.parties.pop(i)
                    contract.updated_at = time.time()
                    self._log_event(contract_id, "party_removed", f"Party removed: {party_id}")
                    return True

            return False

    def sign_contract(
        self,
        contract_id: str,
        party_id: str,
        signature: str
    ) -> bool:
        """Sign contract."""
        with self._lock:
            contract = self._contracts.get(contract_id)
            if not contract:
                return False

            for party in contract.parties:
                if party.id == party_id:
                    party.signature = signature
                    party.signed_at = time.time()
                    contract.updated_at = time.time()

                    self._log_event(contract_id, "signed", f"Party {party.name} signed")

                    # Check if all required parties have signed
                    if self._config.require_all_signatures:
                        all_signed = all(
                            p.signature for p in contract.parties if p.role == "signer"
                        )
                        if all_signed and contract.status == ContractStatus.PENDING:
                            contract.status = ContractStatus.ACTIVE
                            self._log_event(contract_id, "activated", "Contract activated")

                    return True

            return False

    def activate_contract(self, contract_id: str) -> bool:
        """Activate contract."""
        with self._lock:
            contract = self._contracts.get(contract_id)
            if not contract:
                return False

            # Check if all required parties have signed
            if self._config.require_all_signatures:
                unsigned = [p for p in contract.parties if p.role == "signer" and not p.signature]
                if unsigned:
                    return False

            contract.status = ContractStatus.ACTIVE
            contract.updated_at = time.time()

            self._log_event(contract_id, "activated", "Contract activated")

            # Run hooks
            for hook in self._hooks.get("activated", []):
                try:
                    hook(contract)
                except Exception:
                    pass

            return True

    def expire_contract(self, contract_id: str) -> bool:
        """Expire contract."""
        with self._lock:
            contract = self._contracts.get(contract_id)
            if not contract:
                return False

            contract.status = ContractStatus.EXPIRED
            contract.updated_at = time.time()

            self._log_event(contract_id, "expired", "Contract expired")

            return True

    def terminate_contract(self, contract_id: str, reason: str = "") -> bool:
        """Terminate contract."""
        with self._lock:
            contract = self._contracts.get(contract_id)
            if not contract:
                return False

            contract.status = ContractStatus.TERMINATED
            contract.updated_at = time.time()

            self._log_event(contract_id, "terminated", f"Contract terminated: {reason}")

            return True

    def cancel_contract(self, contract_id: str, reason: str = "") -> bool:
        """Cancel contract."""
        with self._lock:
            contract = self._contracts.get(contract_id)
            if not contract:
                return False

            contract.status = ContractStatus.CANCELLED
            contract.updated_at = time.time()

            self._log_event(contract_id, "cancelled", f"Contract cancelled: {reason}")

            return True

    def check_expiring_contracts(self, days: int = None) -> List[Contract]:
        """Check for expiring contracts."""
        with self._lock:
            warning_days = days or self._config.expiration_warning_days
            current_time = time.time()
            warning_time = current_time + (warning_days * 86400)

            expiring = []
            for contract in self._contracts.values():
                if contract.status == ContractStatus.ACTIVE:
                    if contract.end_date <= warning_time:
                        expiring.append(contract)

            return expiring

    def delete_contract(self, contract_id: str) -> bool:
        """Delete contract."""
        with self._lock:
            contract = self._contracts.get(contract_id)
            if not contract:
                return False

            if contract.status == ContractStatus.ACTIVE:
                return False

            del self._contracts[contract_id]
            self._log_event(contract_id, "deleted", "Contract deleted")

            return True

    def _log_event(self, contract_id: str, event_type: str, description: str):
        """Log contract event."""
        event = ContractEvent(
            id=str(uuid.uuid4())[:12],
            contract_id=contract_id,
            event_type=event_type,
            description=description,
            timestamp=time.time()
        )
        self._events.append(event)

        # Keep only last 5000 events
        if len(self._events) > 5000:
            self._events = self._events[-2500:]

    def get_events(
        self,
        contract_id: str = None,
        event_type: str = None,
        limit: int = 100
    ) -> List[ContractEvent]:
        """Get contract events."""
        with self._lock:
            events = self._events

            if contract_id:
                events = [e for e in events if e.contract_id == contract_id]
            if event_type:
                events = [e for e in events if e.event_type == event_type]

            return events[-limit:]

    def get_stats(self) -> Dict[str, Any]:
        """Get contract statistics."""
        with self._lock:
            total = len(self._contracts)
            by_status = defaultdict(int)
            by_type = defaultdict(int)

            for contract in self._contracts.values():
                by_status[contract.status.value] += 1
                by_type[contract.contract_type.value] += 1

            active_count = by_status.get("active", 0)
            expiring = len(self.check_expiring_contracts())

            return {
                "total_contracts": total,
                "active_contracts": active_count,
                "by_status": dict(by_status),
                "by_type": dict(by_type),
                "expiring_soon": expiring
            }

    def update_config(
        self,
        require_all_signatures: bool = None,
        auto_expire: bool = None,
        expiration_warning_days: int = None,
        max_attachments: int = None,
        enable_versioning: bool = None,
        default_validity_days: int = None,
        require_witness: bool = None
    ):
        """Update contract configuration."""
        with self._lock:
            if require_all_signatures is not None:
                self._config.require_all_signatures = require_all_signatures
            if auto_expire is not None:
                self._config.auto_expire = auto_expire
            if expiration_warning_days is not None:
                self._config.expiration_warning_days = expiration_warning_days
            if max_attachments is not None:
                self._config.max_attachments = max_attachments
            if enable_versioning is not None:
                self._config.enable_versioning = enable_versioning
            if default_validity_days is not None:
                self._config.default_validity_days = default_validity_days
            if require_witness is not None:
                self._config.require_witness = require_witness

    def get_config(self) -> ContractConfig:
        """Get contract configuration."""
        return self._config


class AgentContract:
    """Agent contract handling system."""

    def __init__(self, config: ContractConfig = None):
        self._manager = ContractManager(config)

    def create_contract(
        self,
        name: str,
        contract_type: str,
        start_date: float,
        end_date: float,
        parties: List[Dict[str, Any]] = None,
        clauses: List[Dict[str, Any]] = None,
        terms: List[Dict[str, Any]] = None,
        document_url: str = "",
        metadata: Dict[str, Any] = None
    ) -> Dict[str, Any]:
        """Create a new contract."""
        contract = self._manager.create_contract(
            name, contract_type, start_date, end_date,
            parties, clauses, terms, document_url, metadata
        )
        return {
            "id": contract.id,
            "name": contract.name,
            "contract_type": contract.contract_type.value,
            "status": contract.status.value,
            "created_at": contract.created_at,
            "start_date": contract.start_date,
            "end_date": contract.end_date,
            "version": contract.version
        }

    def get_contract(self, contract_id: str) -> Optional[Dict[str, Any]]:
        """Get contract by ID."""
        contract = self._manager.get_contract(contract_id)
        if not contract:
            return None
        return {
            "id": contract.id,
            "name": contract.name,
            "contract_type": contract.contract_type.value,
            "status": contract.status.value,
            "created_at": contract.created_at,
            "updated_at": contract.updated_at,
            "start_date": contract.start_date,
            "end_date": contract.end_date,
            "document_url": contract.document_url,
            "version": contract.version,
            "parties": [
                {
                    "id": p.id,
                    "party_type": p.party_type.value,
                    "name": p.name,
                    "email": p.email,
                    "role": p.role,
                    "signed": bool(p.signature),
                    "signed_at": p.signed_at
                }
                for p in contract.parties
            ],
            "clauses": [
                {
                    "id": c.id,
                    "title": c.title,
                    "content": c.content,
                    "order": c.order,
                    "required": c.required
                }
                for c in contract.clauses
            ],
            "terms": [
                {
                    "id": t.id,
                    "key": t.key,
                    "value": t.value,
                    "description": t.description
                }
                for t in contract.terms
            ],
            "metadata": contract.metadata
        }

    def get_contracts(
        self,
        contract_type: str = None,
        status: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get contracts."""
        contracts = self._manager.get_contracts(contract_type, status, limit)
        return [
            {
                "id": c.id,
                "name": c.name,
                "contract_type": c.contract_type.value,
                "status": c.status.value,
                "start_date": c.start_date,
                "end_date": c.end_date,
                "version": c.version
            }
            for c in contracts
        ]

    def update_contract(
        self,
        contract_id: str,
        name: str = None,
        start_date: float = None,
        end_date: float = None,
        document_url: str = None,
        metadata: Dict[str, Any] = None
    ) -> Optional[Dict[str, Any]]:
        """Update contract."""
        contract = self._manager.update_contract(
            contract_id, name, start_date, end_date, document_url, metadata
        )
        if not contract:
            return None
        return {
            "id": contract.id,
            "name": contract.name,
            "status": contract.status.value,
            "updated_at": contract.updated_at
        }

    def add_party(
        self,
        contract_id: str,
        party_type: str,
        name: str,
        email: str,
        role: str = "signer",
        metadata: Dict[str, Any] = None
    ) -> Optional[Dict[str, Any]]:
        """Add party to contract."""
        party = self._manager.add_party(
            contract_id, party_type, name, email, role, metadata
        )
        if not party:
            return None
        return {
            "id": party.id,
            "party_type": party.party_type.value,
            "name": party.name,
            "email": party.email,
            "role": party.role
        }

    def remove_party(self, contract_id: str, party_id: str) -> bool:
        """Remove party from contract."""
        return self._manager.remove_party(contract_id, party_id)

    def sign_contract(
        self,
        contract_id: str,
        party_id: str,
        signature: str
    ) -> bool:
        """Sign contract."""
        return self._manager.sign_contract(contract_id, party_id, signature)

    def activate_contract(self, contract_id: str) -> bool:
        """Activate contract."""
        return self._manager.activate_contract(contract_id)

    def expire_contract(self, contract_id: str) -> bool:
        """Expire contract."""
        return self._manager.expire_contract(contract_id)

    def terminate_contract(self, contract_id: str, reason: str = "") -> bool:
        """Terminate contract."""
        return self._manager.terminate_contract(contract_id, reason)

    def cancel_contract(self, contract_id: str, reason: str = "") -> bool:
        """Cancel contract."""
        return self._manager.cancel_contract(contract_id, reason)

    def check_expiring_contracts(self, days: int = None) -> List[Dict[str, Any]]:
        """Check for expiring contracts."""
        contracts = self._manager.check_expiring_contracts(days)
        return [
            {
                "id": c.id,
                "name": c.name,
                "contract_type": c.contract_type.value,
                "end_date": c.end_date,
                "days_remaining": int((c.end_date - time.time()) / 86400)
            }
            for c in contracts
        ]

    def delete_contract(self, contract_id: str) -> bool:
        """Delete contract."""
        return self._manager.delete_contract(contract_id)

    def get_events(
        self,
        contract_id: str = None,
        event_type: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get contract events."""
        events = self._manager.get_events(contract_id, event_type, limit)
        return [
            {
                "id": e.id,
                "contract_id": e.contract_id,
                "event_type": e.event_type,
                "description": e.description,
                "timestamp": e.timestamp,
                "user_id": e.user_id
            }
            for e in events
        ]

    def get_stats(self) -> Dict[str, Any]:
        """Get contract statistics."""
        return self._manager.get_stats()

    def update_config(
        self,
        require_all_signatures: bool = None,
        auto_expire: bool = None,
        expiration_warning_days: int = None,
        max_attachments: int = None,
        enable_versioning: bool = None,
        default_validity_days: int = None,
        require_witness: bool = None
    ) -> Dict[str, Any]:
        """Update contract configuration."""
        self._manager.update_config(
            require_all_signatures=require_all_signatures,
            auto_expire=auto_expire,
            expiration_warning_days=expiration_warning_days,
            max_attachments=max_attachments,
            enable_versioning=enable_versioning,
            default_validity_days=default_validity_days,
            require_witness=require_witness
        )
        return self.get_config()

    def get_config(self) -> Dict[str, Any]:
        """Get contract configuration."""
        config = self._manager.get_config()
        return {
            "require_all_signatures": config.require_all_signatures,
            "auto_expire": config.auto_expire,
            "expiration_warning_days": config.expiration_warning_days,
            "max_attachments": config.max_attachments,
            "enable_versioning": config.enable_versioning,
            "default_validity_days": config.default_validity_days,
            "require_witness": config.require_witness
        }


# Global instance
agent_contract = AgentContract()
