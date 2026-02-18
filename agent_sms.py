"""Agent SMS Module

SMS verification and messaging for agents including OTP generation,
verification, delivery tracking, and SMS-based authentication.
"""
import time
import random
import string
import threading
import uuid
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from enum import Enum
from collections import defaultdict


class SMSStatus(str, Enum):
    """SMS status types."""
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    FAILED = "failed"
    EXPIRED = "expired"
    VERIFIED = "verified"


class SMSProvider(str, Enum):
    """SMS provider types."""
    TWILIO = "twilio"
    AWS_SNS = "aws_sns"
    NEXMO = "nexmo"
    CUSTOM = "custom"


@dataclass
class SMSConfig:
    """SMS configuration."""
    provider: SMSProvider = SMSProvider.CUSTOM
    api_key: str = ""
    api_secret: str = ""
    sender_id: str = ""
    otp_length: int = 6
    otp_expiry: int = 300
    max_retries: int = 3
    enable_voice: bool = False
    rate_limit: int = 10


@dataclass
class OTP:
    """One-time password record."""
    id: str
    phone_number: str
    code: str
    created_at: float
    expires_at: float
    status: SMSStatus = SMSStatus.PENDING
    attempts: int = 0
    verified_at: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class SMSMessage:
    """SMS message record."""
    id: str
    to_number: str
    from_number: str
    body: str
    status: SMSStatus
    created_at: float
    sent_at: Optional[float] = None
    delivered_at: Optional[float] = None
    error: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)


class SMSManager:
    """SMS management engine."""

    def __init__(self, config: SMSConfig = None):
        self._lock = threading.RLock()
        self._config = config or SMSConfig()
        self._otps: Dict[str, OTP] = {}
        self._messages: List[SMSMessage] = []
        self._phone_stats: Dict[str, int] = defaultdict(int)
        self._verification_hooks: Dict[str, List[Callable]] = defaultdict(list)

    def generate_otp(self, phone_number: str) -> OTP:
        """Generate OTP for phone number."""
        with self._lock:
            current_time = time.time()

            # Generate random code
            code = ''.join(random.choices(
                string.digits,
                k=self._config.otp_length
            ))

            # Check rate limit
            if phone_number in self._phone_stats:
                if self._phone_stats[phone_number] >= self._config.rate_limit:
                    raise ValueError("Rate limit exceeded")

            # Create OTP
            otp = OTP(
                id=str(uuid.uuid4())[:12],
                phone_number=phone_number,
                code=code,
                created_at=current_time,
                expires_at=current_time + self._config.otp_expiry,
                status=SMSStatus.PENDING
            )

            self._otps[otp.id] = otp
            self._phone_stats[phone_number] += 1

            # In production, would send SMS here
            # self._send_sms(phone_number, f"Your verification code is: {code}")

            return otp

    def verify_otp(self, otp_id: str, code: str) -> bool:
        """Verify OTP code."""
        with self._lock:
            otp = self._otps.get(otp_id)
            if not otp:
                return False

            # Check expiry
            if time.time() > otp.expires_at:
                otp.status = SMSStatus.EXPIRED
                return False

            # Check attempts
            if otp.attempts >= self._config.max_retries:
                otp.status = SMSStatus.FAILED
                return False

            # Verify code
            if otp.code == code:
                otp.status = SMSStatus.VERIFIED
                otp.verified_at = time.time()

                # Run verification hooks
                for hook in self._verification_hooks.get("verified", []):
                    try:
                        hook(otp)
                    except Exception:
                        pass

                return True

            otp.attempts += 1
            return False

    def get_otp(self, otp_id: str) -> Optional[OTP]:
        """Get OTP by ID."""
        with self._lock:
            return self._otps.get(otp_id)

    def get_otp_by_phone(self, phone_number: str) -> Optional[OTP]:
        """Get most recent OTP for phone number."""
        with self._lock:
            otps = [
                otp for otp in self._otps.values()
                if otp.phone_number == phone_number
            ]
            if otps:
                return max(otps, key=lambda x: x.created_at)
            return None

    def send_sms(
        self,
        to_number: str,
        body: str,
        from_number: str = None
    ) -> SMSMessage:
        """Send SMS message."""
        with self._lock:
            current_time = time.time()

            message = SMSMessage(
                id=str(uuid.uuid4())[:12],
                to_number=to_number,
                from_number=from_number or self._config.sender_id,
                body=body,
                status=SMSStatus.PENDING,
                created_at=current_time
            )

            # In production, would send via provider
            # try:
            #     result = self._provider.send(to_number, body)
            #     message.status = SMSStatus.SENT
            #     message.sent_at = current_time
            # except Exception as e:
            #     message.status = SMSStatus.FAILED
            #     message.error = str(e)

            # For demo, simulate sending
            message.status = SMSStatus.SENT
            message.sent_at = current_time

            self._messages.append(message)

            # Keep only last 1000 messages
            if len(self._messages) > 1000:
                self._messages = self._messages[-500:]

            return message

    def get_message(self, message_id: str) -> Optional[SMSMessage]:
        """Get message by ID."""
        with self._lock:
            for msg in self._messages:
                if msg.id == message_id:
                    return msg
            return None

    def get_messages(
        self,
        phone_number: str = None,
        status: SMSStatus = None,
        limit: int = 100
    ) -> List[SMSMessage]:
        """Get message records."""
        with self._lock:
            messages = self._messages

            if phone_number:
                messages = [m for m in messages if m.to_number == phone_number]
            if status:
                messages = [m for m in messages if m.status == status]

            return messages[-limit:]

    def get_stats(self) -> Dict[str, Any]:
        """Get SMS statistics."""
        with self._lock:
            total = len(self._messages)
            sent = sum(1 for m in self._messages if m.status == SMSStatus.SENT)
            delivered = sum(1 for m in self._messages if m.status == SMSStatus.DELIVERED)
            failed = sum(1 for m in self._messages if m.status == SMSStatus.FAILED)

            return {
                "total": total,
                "sent": sent,
                "delivered": delivered,
                "failed": failed,
                "delivery_rate": delivered / sent if sent > 0 else 0
            }

    def add_verification_hook(self, callback: Callable):
        """Add verification hook."""
        with self._lock:
            self._verification_hooks["verified"].append(callback)

    def update_config(
        self,
        provider: str = None,
        api_key: str = None,
        api_secret: str = None,
        sender_id: str = None,
        otp_length: int = None,
        otp_expiry: int = None,
        max_retries: int = None,
        enable_voice: bool = None,
        rate_limit: int = None
    ):
        """Update SMS configuration."""
        with self._lock:
            if provider:
                self._config.provider = SMSProvider(provider)
            if api_key is not None:
                self._config.api_key = api_key
            if api_secret is not None:
                self._config.api_secret = api_secret
            if sender_id is not None:
                self._config.sender_id = sender_id
            if otp_length:
                self._config.otp_length = otp_length
            if otp_expiry:
                self._config.otp_expiry = otp_expiry
            if max_retries:
                self._config.max_retries = max_retries
            if enable_voice is not None:
                self._config.enable_voice = enable_voice
            if rate_limit:
                self._config.rate_limit = rate_limit

    def get_config(self) -> SMSConfig:
        """Get SMS configuration."""
        return self._config


class AgentSMS:
    """Agent SMS verification handling system."""

    def __init__(self, config: SMSConfig = None):
        self._manager = SMSManager(config)

    def send_otp(self, phone_number: str) -> Dict[str, Any]:
        """Send OTP to phone number."""
        try:
            otp = self._manager.generate_otp(phone_number)
            return {
                "otp_id": otp.id,
                "phone_number": otp.phone_number,
                "expires_at": otp.expires_at,
                "status": otp.status.value
            }
        except ValueError as e:
            return {"error": str(e)}

    def verify_otp(self, otp_id: str, code: str) -> Dict[str, Any]:
        """Verify OTP code."""
        success = self._manager.verify_otp(otp_id, code)
        return {
            "success": success,
            "otp_id": otp_id
        }

    def get_otp(self, otp_id: str) -> Optional[Dict[str, Any]]:
        """Get OTP by ID."""
        otp = self._manager.get_otp(otp_id)
        if not otp:
            return None

        return {
            "id": otp.id,
            "phone_number": otp.phone_number,
            "created_at": otp.created_at,
            "expires_at": otp.expires_at,
            "status": otp.status.value,
            "attempts": otp.attempts,
            "verified_at": otp.verified_at
        }

    def resend_otp(self, phone_number: str) -> Dict[str, Any]:
        """Resend OTP to phone number."""
        # Check for existing OTP
        existing = self._manager.get_otp_by_phone(phone_number)
        if existing and existing.status == SMSStatus.PENDING:
            # Check if not expired yet
            if time.time() < existing.expires_at - 60:
                return {"error": "Please wait before requesting new OTP"}

        return self.send_otp(phone_number)

    def send_sms(
        self,
        to_number: str,
        body: str,
        from_number: str = None
    ) -> Dict[str, Any]:
        """Send SMS message."""
        message = self._manager.send_sms(to_number, body, from_number)
        return {
            "message_id": message.id,
            "to_number": message.to_number,
            "status": message.status.value,
            "created_at": message.created_at
        }

    def get_message(self, message_id: str) -> Optional[Dict[str, Any]]:
        """Get message by ID."""
        message = self._manager.get_message(message_id)
        if not message:
            return None

        return {
            "id": message.id,
            "to_number": message.to_number,
            "from_number": message.from_number,
            "body": message.body,
            "status": message.status.value,
            "created_at": message.created_at,
            "sent_at": message.sent_at,
            "delivered_at": message.delivered_at,
            "error": message.error
        }

    def get_messages(
        self,
        phone_number: str = None,
        status: str = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """Get message records."""
        status_enum = SMSStatus(status) if status else None
        messages = self._manager.get_messages(phone_number, status_enum, limit)

        return [
            {
                "id": m.id,
                "to_number": m.to_number,
                "from_number": m.from_number,
                "body": m.body,
                "status": m.status.value,
                "created_at": m.created_at,
                "sent_at": m.sent_at,
                "delivered_at": m.delivered_at
            }
            for m in messages
        ]

    def get_stats(self) -> Dict[str, Any]:
        """Get SMS statistics."""
        return self._manager.get_stats()

    def update_config(
        self,
        provider: str = None,
        api_key: str = None,
        api_secret: str = None,
        sender_id: str = None,
        otp_length: int = None,
        otp_expiry: int = None,
        max_retries: int = None,
        enable_voice: bool = None,
        rate_limit: int = None
    ) -> Dict[str, Any]:
        """Update SMS configuration."""
        self._manager.update_config(
            provider=provider,
            api_key=api_key,
            api_secret=api_secret,
            sender_id=sender_id,
            otp_length=otp_length,
            otp_expiry=otp_expiry,
            max_retries=max_retries,
            enable_voice=enable_voice,
            rate_limit=rate_limit
        )
        return self.get_config()

    def get_config(self) -> Dict[str, Any]:
        """Get SMS configuration."""
        config = self._manager.get_config()
        return {
            "provider": config.provider.value,
            "sender_id": config.sender_id,
            "otp_length": config.otp_length,
            "otp_expiry": config.otp_expiry,
            "max_retries": config.max_retries,
            "enable_voice": config.enable_voice,
            "rate_limit": config.rate_limit
        }


# Global instance
agent_sms = AgentSMS()
