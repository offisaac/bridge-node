"""Agent Validation Module

Input validation utilities for agent services including schema validation, type
checking, range validation, format validation (email, URL, IP), custom validators,
and validation rules.
"""
import re
import time
import uuid
import ipaddress
from typing import Dict, List, Optional, Any, Callable, Set, Union
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict
import threading


class ValidationType(str, Enum):
    """Validation types."""
    REQUIRED = "required"
    TYPE = "type"
    RANGE = "range"
    FORMAT = "format"
    LENGTH = "length"
    ENUM = "enum"
    PATTERN = "pattern"
    CUSTOM = "custom"
    SCHEMA = "schema"


class DataType(str, Enum):
    """Data types for validation."""
    STRING = "string"
    INTEGER = "integer"
    FLOAT = "float"
    BOOLEAN = "boolean"
    LIST = "list"
    DICT = "dict"
    EMAIL = "email"
    URL = "url"
    IP = "ip"
    UUID = "uuid"
    DATE = "date"
    DATETIME = "datetime"


class ValidationLevel(str, Enum):
    """Validation levels."""
    ERROR = "error"
    WARNING = "warning"
    INFO = "info"


@dataclass
class ValidationRule:
    """Validation rule definition."""
    field: str
    validation_type: ValidationType
    data_type: DataType = None
    required: bool = False
    min_value: Union[int, float] = None
    max_value: Union[int, float] = None
    min_length: int = None
    max_length: int = None
    pattern: str = None
    enum_values: List[Any] = None
    format: str = None
    custom_validator: Callable = None
    error_message: str = None
    warning_message: str = None


@dataclass
class ValidationError:
    """Validation error."""
    field: str
    message: str
    level: ValidationLevel = ValidationLevel.ERROR
    code: str = None
    value: Any = None


@dataclass
class ValidationResult:
    """Validation result."""
    id: str
    valid: bool
    errors: List[ValidationError] = field(default_factory=list)
    warnings: List[ValidationError] = field(default_factory=list)
    validated_at: float = field(default_factory=time.time)
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SchemaDefinition:
    """Schema definition for validation."""
    name: str
    rules: List[ValidationRule] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class ValidationStats:
    """Validation statistics."""
    total_validations: int = 0
    valid_count: int = 0
    invalid_count: int = 0
    total_errors: int = 0
    total_warnings: int = 0
    avg_validation_time_ms: float = 0
    schema_count: int = 0


class BuiltInValidators:
    """Built-in validator functions."""

    @staticmethod
    def validate_email(value: str) -> bool:
        """Validate email format."""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, value))

    @staticmethod
    def validate_url(value: str) -> bool:
        """Validate URL format."""
        pattern = r'^https?://[^\s/$.?#].[^\s]*$'
        return bool(re.match(pattern, value))

    @staticmethod
    def validate_ip(value: str) -> bool:
        """Validate IP address (IPv4 or IPv6)."""
        try:
            ipaddress.ip_address(value)
            return True
        except ValueError:
            return False

    @staticmethod
    def validate_ipv4(value: str) -> bool:
        """Validate IPv4 address."""
        try:
            ipaddress.IPv4Address(value)
            return True
        except ValueError:
            return False

    @staticmethod
    def validate_ipv6(value: str) -> bool:
        """Validate IPv6 address."""
        try:
            ipaddress.IPv6Address(value)
            return True
        except ValueError:
            return False

    @staticmethod
    def validate_uuid(value: str) -> bool:
        """Validate UUID format."""
        pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        return bool(re.match(pattern, value.lower()))

    @staticmethod
    def validate_date(value: str) -> bool:
        """Validate date format (YYYY-MM-DD)."""
        pattern = r'^\d{4}-\d{2}-\d{2}$'
        return bool(re.match(pattern, value))

    @staticmethod
    def validate_datetime(value: str) -> bool:
        """Validate datetime format (ISO 8601)."""
        pattern = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}'
        return bool(re.match(pattern, value))

    @staticmethod
    def validate_phone(value: str) -> bool:
        """Validate phone number."""
        pattern = r'^\+?[\d\s\-()]+$'
        return bool(re.match(pattern, value)) and len(re.sub(r'\D', '', value)) >= 10

    @staticmethod
    def validate_credit_card(value: str) -> bool:
        """Validate credit card number (Luhn algorithm)."""
        digits = re.sub(r'\D', '', value)
        if not digits or len(digits) < 13 or len(digits) > 19:
            return False

        # Luhn algorithm
        total = 0
        reverse_digits = digits[::-1]
        for i, digit in enumerate(reverse_digits):
            n = int(digit)
            if i % 2 == 1:
                n *= 2
                if n > 9:
                    n -= 9
            total += n
        return total % 10 == 0


class AgentValidation:
    """Input validation utility for agents."""

    def __init__(self):
        self._lock = threading.RLock()
        self._schemas: Dict[str, SchemaDefinition] = {}
        self._stats = ValidationStats()
        self._custom_validators: Dict[str, Callable] = {}

    def register_schema(self, schema: SchemaDefinition):
        """Register a validation schema."""
        with self._lock:
            self._schemas[schema.name] = schema
            self._stats.schema_count += 1

    def create_schema(
        self,
        name: str,
        rules: List[Dict],
        metadata: Dict[str, Any] = None
    ) -> SchemaDefinition:
        """Create and register a validation schema."""
        validation_rules = []

        for rule_dict in rules:
            rule = ValidationRule(
                field=rule_dict.get("field"),
                validation_type=ValidationType(rule_dict.get("type", "required")),
                data_type=DataType(rule_dict.get("data_type")) if rule_dict.get("data_type") else None,
                required=rule_dict.get("required", False),
                min_value=rule_dict.get("min_value"),
                max_value=rule_dict.get("max_value"),
                min_length=rule_dict.get("min_length"),
                max_length=rule_dict.get("max_length"),
                pattern=rule_dict.get("pattern"),
                enum_values=rule_dict.get("enum_values"),
                format=rule_dict.get("format"),
                error_message=rule_dict.get("error_message"),
                warning_message=rule_dict.get("warning_message")
            )
            validation_rules.append(rule)

        schema = SchemaDefinition(
            name=name,
            rules=validation_rules,
            metadata=metadata or {}
        )

        self.register_schema(schema)
        return schema

    def register_custom_validator(self, name: str, validator: Callable):
        """Register a custom validator function."""
        with self._lock:
            self._custom_validators[name] = validator

    def validate(
        self,
        data: Dict[str, Any],
        schema_name: str = None,
        rules: List[ValidationRule] = None
    ) -> ValidationResult:
        """Validate data against schema or rules."""
        result_id = str(uuid.uuid4())
        start_time = time.time()

        errors = []
        warnings = []

        # Get rules to validate
        validation_rules = rules
        if schema_name and not validation_rules:
            schema = self._schemas.get(schema_name)
            if schema:
                validation_rules = schema.rules

        if not validation_rules:
            return ValidationResult(
                id=result_id,
                valid=False,
                errors=[ValidationError(field="", message="No validation rules provided")]
            )

        # Validate each field
        for rule in validation_rules:
            value = data.get(rule.field)

            # Required check
            if rule.required and (value is None or value == ""):
                errors.append(ValidationError(
                    field=rule.field,
                    message=rule.error_message or f"Field '{rule.field}' is required",
                    code="REQUIRED"
                ))
                continue

            if value is None:
                continue

            # Type validation
            if rule.data_type:
                type_error = self._validate_type(value, rule.data_type, rule.field)
                if type_error:
                    errors.append(type_error)

            # Range validation
            if rule.min_value is not None or rule.max_value is not None:
                range_error = self._validate_range(value, rule.min_value, rule.max_value, rule.field)
                if range_error:
                    errors.append(range_error)

            # Length validation
            if rule.min_length is not None or rule.max_length is not None:
                length_error = self._validate_length(value, rule.min_length, rule.max_length, rule.field)
                if length_error:
                    errors.append(length_error)

            # Enum validation
            if rule.enum_values is not None:
                enum_error = self._validate_enum(value, rule.enum_values, rule.field)
                if enum_error:
                    errors.append(enum_error)

            # Pattern validation
            if rule.pattern:
                pattern_error = self._validate_pattern(value, rule.pattern, rule.field)
                if pattern_error:
                    errors.append(pattern_error)

            # Format validation
            if rule.format:
                format_error = self._validate_format(value, rule.format, rule.field)
                if format_error:
                    errors.append(format_error)

            # Custom validation
            if rule.custom_validator:
                try:
                    if not rule.custom_validator(value):
                        errors.append(ValidationError(
                            field=rule.field,
                            message=rule.error_message or f"Custom validation failed for '{rule.field}'",
                            code="CUSTOM"
                        ))
                except Exception as e:
                    errors.append(ValidationError(
                        field=rule.field,
                        message=str(e),
                        code="CUSTOM_ERROR"
                    ))

        # Update stats
        validation_time = (time.time() - start_time) * 1000

        with self._lock:
            self._stats.total_validations += 1
            if errors:
                self._stats.invalid_count += 1
                self._stats.total_errors += len(errors)
            else:
                self._stats.valid_count += 1

            if self._stats.total_validations > 1:
                self._stats.avg_validation_time_ms = (
                    (self._stats.avg_validation_time_ms * (self._stats.total_validations - 1) + validation_time)
                    / self._stats.total_validations
                )

        return ValidationResult(
            id=result_id,
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            data=data
        )

    def _validate_type(self, value: Any, data_type: DataType, field: str) -> Optional[ValidationError]:
        """Validate data type."""
        try:
            if data_type == DataType.STRING:
                if not isinstance(value, str):
                    return ValidationError(field=field, message=f"Expected string, got {type(value).__name__}", code="TYPE")
            elif data_type == DataType.INTEGER:
                if not isinstance(value, int) or isinstance(value, bool):
                    return ValidationError(field=field, message=f"Expected integer, got {type(value).__name__}", code="TYPE")
            elif data_type == DataType.FLOAT:
                if not isinstance(value, (int, float)) or isinstance(value, bool):
                    return ValidationError(field=field, message=f"Expected float, got {type(value).__name__}", code="TYPE")
            elif data_type == DataType.BOOLEAN:
                if not isinstance(value, bool):
                    return ValidationError(field=field, message=f"Expected boolean, got {type(value).__name__}", code="TYPE")
            elif data_type == DataType.LIST:
                if not isinstance(value, list):
                    return ValidationError(field=field, message=f"Expected list, got {type(value).__name__}", code="TYPE")
            elif data_type == DataType.DICT:
                if not isinstance(value, dict):
                    return ValidationError(field=field, message=f"Expected dict, got {type(value).__name__}", code="TYPE")
            elif data_type == DataType.EMAIL:
                if not isinstance(value, str) or not BuiltInValidators.validate_email(value):
                    return ValidationError(field=field, message="Invalid email format", code="FORMAT")
            elif data_type == DataType.URL:
                if not isinstance(value, str) or not BuiltInValidators.validate_url(value):
                    return ValidationError(field=field, message="Invalid URL format", code="FORMAT")
            elif data_type == DataType.IP:
                if not isinstance(value, str) or not BuiltInValidators.validate_ip(value):
                    return ValidationError(field=field, message="Invalid IP address", code="FORMAT")
            elif data_type == DataType.UUID:
                if not isinstance(value, str) or not BuiltInValidators.validate_uuid(value):
                    return ValidationError(field=field, message="Invalid UUID format", code="FORMAT")
            elif data_type == DataType.DATE:
                if not isinstance(value, str) or not BuiltInValidators.validate_date(value):
                    return ValidationError(field=field, message="Invalid date format (YYYY-MM-DD)", code="FORMAT")
            elif data_type == DataType.DATETIME:
                if not isinstance(value, str) or not BuiltInValidators.validate_datetime(value):
                    return ValidationError(field=field, message="Invalid datetime format (ISO 8601)", code="FORMAT")
        except Exception as e:
            return ValidationError(field=field, message=str(e), code="TYPE_ERROR")
        return None

    def _validate_range(self, value: Union[int, float], min_val: Union[int, float], max_val: Union[int, float], field: str) -> Optional[ValidationError]:
        """Validate numeric range."""
        if not isinstance(value, (int, float)):
            return None

        if min_val is not None and value < min_val:
            return ValidationError(field=field, message=f"Value must be >= {min_val}", code="RANGE")

        if max_val is not None and value > max_val:
            return ValidationError(field=field, message=f"Value must be <= {max_val}", code="RANGE")

        return None

    def _validate_length(self, value: Any, min_len: int, max_len: int, field: str) -> Optional[ValidationError]:
        """Validate length."""
        length = len(value) if hasattr(value, '__len__') else 1

        if min_len is not None and length < min_len:
            return ValidationError(field=field, message=f"Length must be >= {min_len}", code="LENGTH")

        if max_len is not None and length > max_len:
            return ValidationError(field=field, message=f"Length must be <= {max_len}", code="LENGTH")

        return None

    def _validate_enum(self, value: Any, enum_values: List[Any], field: str) -> Optional[ValidationError]:
        """Validate enum value."""
        if value not in enum_values:
            return ValidationError(
                field=field,
                message=f"Value must be one of: {', '.join(str(v) for v in enum_values)}",
                code="ENUM"
            )
        return None

    def _validate_pattern(self, value: str, pattern: str, field: str) -> Optional[ValidationError]:
        """Validate against regex pattern."""
        if not isinstance(value, str):
            return None

        if not re.match(pattern, value):
            return ValidationError(field=field, message=f"Value does not match pattern", code="PATTERN")
        return None

    def _validate_format(self, value: str, format: str, field: str) -> Optional[ValidationError]:
        """Validate format."""
        validators = {
            "email": BuiltInValidators.validate_email,
            "url": BuiltInValidators.validate_url,
            "ip": BuiltInValidators.validate_ip,
            "ipv4": BuiltInValidators.validate_ipv4,
            "ipv6": BuiltInValidators.validate_ipv6,
            "uuid": BuiltInValidators.validate_uuid,
            "date": BuiltInValidators.validate_date,
            "datetime": BuiltInValidators.validate_datetime,
            "phone": BuiltInValidators.validate_phone,
            "credit_card": BuiltInValidators.validate_credit_card,
        }

        validator = validators.get(format)
        if validator and not validator(value):
            return ValidationError(field=field, message=f"Invalid {format} format", code="FORMAT")
        return None

    def get_schema(self, name: str) -> Optional[SchemaDefinition]:
        """Get schema by name."""
        return self._schemas.get(name)

    def list_schemas(self) -> List[str]:
        """List all registered schemas."""
        return list(self._schemas.keys())

    def delete_schema(self, name: str) -> bool:
        """Delete a schema."""
        with self._lock:
            if name in self._schemas:
                del self._schemas[name]
                return True
            return False

    def get_stats(self) -> Dict:
        """Get validation statistics."""
        with self._lock:
            return {
                "total_validations": self._stats.total_validations,
                "valid_count": self._stats.valid_count,
                "invalid_count": self._stats.invalid_count,
                "success_rate": round(
                    self._stats.valid_count / self._stats.total_validations * 100, 2
                ) if self._stats.total_validations > 0 else 0,
                "total_errors": self._stats.total_errors,
                "total_warnings": self._stats.total_warnings,
                "avg_validation_time_ms": round(self._stats.avg_validation_time_ms, 2),
                "schema_count": self._stats.schema_count,
                "custom_validators_count": len(self._custom_validators)
            }


# Global validation instance
agent_validation = AgentValidation()
