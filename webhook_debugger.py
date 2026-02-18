"""Webhook Debugger Module

Webhook testing and debugging tool.
"""
import threading
import time
import json
import hashlib
import hmac
import uuid
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import asyncio
import aiohttp


class WebhookMethod(str, Enum):
    """HTTP methods for webhooks."""
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"


class WebhookStatus(str, Enum):
    """Webhook delivery status."""
    PENDING = "pending"
    SENDING = "sending"
    SUCCESS = "success"
    FAILED = "failed"
    TIMEOUT = "timeout"
    RETRYING = "retrying"


class SignatureAlgorithm(str, Enum):
    """HMAC signature algorithms."""
    SHA256 = "sha256"
    SHA1 = "sha1"
    SHA512 = "sha512"


@dataclass
class WebhookRequest:
    """Webhook request record."""
    id: str
    url: str
    method: WebhookMethod
    headers: Dict
    body: str
    timestamp: float
    signature: str = ""
    signature_algorithm: SignatureAlgorithm = SignatureAlgorithm.SHA256
    secret: str = ""


@dataclass
class WebhookResponse:
    """Webhook response record."""
    id: str
    request_id: str
    status_code: int
    headers: Dict
    body: str
    duration_ms: float
    timestamp: float
    error: str = ""


@dataclass
class WebhookTest:
    """Webhook test case."""
    id: str
    name: str
    url: str
    method: WebhookMethod
    headers: Dict
    body: str
    expected_status: int = 200
    expected_body_contains: str = ""
    timeout_seconds: int = 30


class WebhookDebugger:
    """Webhook testing and debugging tool."""

    def __init__(self):
        self._lock = threading.RLock()
        self._requests: List[WebhookRequest] = []
        self._responses: Dict[str, WebhookResponse] = {}
        self._tests: Dict[str, WebhookTest] = {}
        self._max_records = 10000
        self._default_secret = ""

    def create_request(
        self,
        url: str,
        method: WebhookMethod = WebhookMethod.POST,
        headers: Dict = None,
        body: str = "",
        signature_algorithm: SignatureAlgorithm = SignatureAlgorithm.SHA256,
        secret: str = None
    ) -> str:
        """Create a webhook request."""
        request_id = str(uuid.uuid4())[:12]

        # Generate signature if secret is provided
        signature = ""
        actual_secret = secret or self._default_secret
        if actual_secret and body:
            signature = self._generate_signature(body, actual_secret, signature_algorithm)

        request = WebhookRequest(
            id=request_id,
            url=url,
            method=method,
            headers=headers or {},
            body=body,
            timestamp=time.time(),
            signature=signature,
            signature_algorithm=signature_algorithm,
            secret=actual_secret
        )

        with self._lock:
            self._requests.append(request)

            # Trim old records
            if len(self._requests) > self._max_records:
                self._requests = self._requests[-self._max_records:]

        return request_id

    def _generate_signature(
        self,
        body: str,
        secret: str,
        algorithm: SignatureAlgorithm
    ) -> str:
        """Generate HMAC signature."""
        if algorithm == SignatureAlgorithm.SHA256:
            return hmac.new(
                secret.encode(),
                body.encode(),
                hashlib.sha256
            ).hexdigest()
        elif algorithm == SignatureAlgorithm.SHA1:
            return hmac.new(
                secret.encode(),
                body.encode(),
                hashlib.sha1
            ).hexdigest()
        elif algorithm == SignatureAlgorithm.SHA512:
            return hmac.new(
                secret.encode(),
                body.encode(),
                hashlib.sha512
            ).hexdigest()
        return ""

    async def send_request(self, request_id: str) -> Optional[str]:
        """Send a webhook request."""
        with self._lock:
            request = None
            for req in self._requests:
                if req.id == request_id:
                    request = req
                    break
            if not request:
                return None

        # Add signature to headers
        headers = dict(request.headers)
        if request.signature:
            headers["X-Webhook-Signature"] = request.signature
            headers["X-Webhook-Timestamp"] = str(int(request.timestamp))

        start_time = time.time()

        try:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    method=request.method.value,
                    url=request.url,
                    headers=headers,
                    data=request.body,
                    timeout=aiohttp.ClientTimeout(total=30)
                ) as response:
                    response_body = await response.text()
                    duration = (time.time() - start_time) * 1000

                    response_record = WebhookResponse(
                        id=str(uuid.uuid4())[:12],
                        request_id=request_id,
                        status_code=response.status,
                        headers=dict(response.headers),
                        body=response_body,
                        duration_ms=duration,
                        timestamp=time.time()
                    )

        except asyncio.TimeoutError:
            response_record = WebhookResponse(
                id=str(uuid.uuid4())[:12],
                request_id=request_id,
                status_code=0,
                headers={},
                body="",
                duration_ms=(time.time() - start_time) * 1000,
                timestamp=time.time(),
                error="Request timeout"
            )

        except Exception as e:
            response_record = WebhookResponse(
                id=str(uuid.uuid4())[:12],
                request_id=request_id,
                status_code=0,
                headers={},
                body="",
                duration_ms=(time.time() - start_time) * 1000,
                timestamp=time.time(),
                error=str(e)
            )

        with self._lock:
            self._responses[request_id] = response_record

        return response_record.id

    def send_request_sync(self, request_id: str) -> Optional[str]:
        """Send a webhook request synchronously."""
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        return loop.run_until_complete(self.send_request(request_id))

    def get_request(self, request_id: str) -> Optional[Dict]:
        """Get a webhook request."""
        with self._lock:
            for req in self._requests:
                if req.id == request_id:
                    return {
                        "id": req.id,
                        "url": req.url,
                        "method": req.method.value,
                        "headers": req.headers,
                        "body": req.body,
                        "timestamp": req.timestamp,
                        "signature": req.signature,
                        "signature_algorithm": req.signature_algorithm.value,
                        "has_response": req.id in self._responses
                    }
        return None

    def get_response(self, request_id: str) -> Optional[Dict]:
        """Get a webhook response."""
        with self._lock:
            if request_id not in self._responses:
                return None

            resp = self._responses[request_id]
            return {
                "id": resp.id,
                "request_id": resp.request_id,
                "status_code": resp.status_code,
                "headers": resp.headers,
                "body": resp.body,
                "duration_ms": resp.duration_ms,
                "timestamp": resp.timestamp,
                "error": resp.error
            }

    def get_request_with_response(self, request_id: str) -> Optional[Dict]:
        """Get request with its response."""
        request = self.get_request(request_id)
        if not request:
            return None

        response = self.get_response(request_id)
        request["response"] = response

        return request

    def get_requests(
        self,
        limit: int = 100,
        offset: int = 0
    ) -> List[Dict]:
        """Get all webhook requests."""
        with self._lock:
            requests = sorted(self._requests, key=lambda x: x.timestamp, reverse=True)

        return [
            {
                "id": r.id,
                "url": r.url,
                "method": r.method.value,
                "timestamp": r.timestamp,
                "has_response": r.id in self._responses
            }
            for r in requests[offset:offset + limit]
        ]

    def create_test(
        self,
        name: str,
        url: str,
        method: WebhookMethod = WebhookMethod.POST,
        headers: Dict = None,
        body: str = "",
        expected_status: int = 200,
        expected_body_contains: str = "",
        timeout_seconds: int = 30
    ) -> str:
        """Create a webhook test case."""
        test_id = str(uuid.uuid4())[:12]

        test = WebhookTest(
            id=test_id,
            name=name,
            url=url,
            method=method,
            headers=headers or {},
            body=body,
            expected_status=expected_status,
            expected_body_contains=expected_body_contains,
            timeout_seconds=timeout_seconds
        )

        with self._lock:
            self._tests[test_id] = test

        return test_id

    def get_tests(self) -> List[Dict]:
        """Get all webhook tests."""
        with self._lock:
            return [
                {
                    "id": t.id,
                    "name": t.name,
                    "url": t.url,
                    "method": t.method.value,
                    "expected_status": t.expected_status,
                    "expected_body_contains": t.expected_body_contains
                }
                for t in self._tests.values()
            ]

    def get_test(self, test_id: str) -> Optional[Dict]:
        """Get a webhook test."""
        with self._lock:
            if test_id not in self._tests:
                return None
            t = self._tests[test_id]
            return {
                "id": t.id,
                "name": t.name,
                "url": t.url,
                "method": t.method.value,
                "headers": t.headers,
                "body": t.body,
                "expected_status": t.expected_status,
                "expected_body_contains": t.expected_body_contains,
                "timeout_seconds": t.timeout_seconds
            }

    def delete_test(self, test_id: str) -> bool:
        """Delete a webhook test."""
        with self._lock:
            if test_id not in self._tests:
                return False
            del self._tests[test_id]
            return True

    def run_test(self, test_id: str) -> Optional[Dict]:
        """Run a webhook test."""
        test = self.get_test(test_id)
        if not test:
            return None

        # Create request
        request_id = self.create_request(
            url=test["url"],
            method=WebhookMethod(test["method"]),
            headers=test["headers"],
            body=test["body"]
        )

        # Send request
        response_id = self.send_request_sync(request_id)
        response = self.get_response(request_id)

        if not response:
            return {
                "test_id": test_id,
                "success": False,
                "error": "Failed to send request"
            }

        # Evaluate result
        success = (
            response["status_code"] == test["expected_status"] and
            (not test["expected_body_contains"] or test["expected_body_contains"] in response["body"])
        )

        return {
            "test_id": test_id,
            "test_name": test["name"],
            "success": success,
            "request_id": request_id,
            "response": response,
            "expected_status": test["expected_status"],
            "actual_status": response["status_code"],
            "status_match": response["status_code"] == test["expected_status"],
            "body_contains_expected": test["expected_body_contains"] in response["body"] if test["expected_body_contains"] else True
        }

    def verify_signature(
        self,
        body: str,
        signature: str,
        secret: str,
        algorithm: SignatureAlgorithm = SignatureAlgorithm.SHA256
    ) -> bool:
        """Verify a webhook signature."""
        expected = self._generate_signature(body, secret, algorithm)
        return hmac.compare_digest(expected, signature)

    def set_default_secret(self, secret: str):
        """Set default webhook secret."""
        with self._lock:
            self._default_secret = secret

    def get_stats(self) -> Dict:
        """Get webhook debugger statistics."""
        with self._lock:
            total_requests = len(self._requests)
            total_responses = len(self._responses)
            successful = sum(1 for r in self._responses.values() if r.status_code >= 200 and r.status_code < 300)
            failed = sum(1 for r in self._responses.values() if r.status_code >= 400 or r.error)

            avg_duration = 0
            if total_responses > 0:
                avg_duration = sum(r.duration_ms for r in self._responses.values()) / total_responses

            return {
                "total_requests": total_requests,
                "total_responses": total_responses,
                "successful": successful,
                "failed": failed,
                "success_rate": successful / total_responses if total_responses > 0 else 0,
                "average_duration_ms": avg_duration,
                "total_tests": len(self._tests)
            }

    def clear_history(self):
        """Clear request/response history."""
        with self._lock:
            self._requests.clear()
            self._responses.clear()


# Global webhook debugger
webhook_debugger = WebhookDebugger()


# Initialize with sample tests
def init_sample_tests():
    """Initialize sample webhook tests."""
    webhook_debugger.create_test(
        name="Health Check",
        url="https://httpbin.org/status/200",
        method=WebhookMethod.GET,
        expected_status=200
    )

    webhook_debugger.create_test(
        name="POST JSON",
        url="https://httpbin.org/post",
        method=WebhookMethod.POST,
        headers={"Content-Type": "application/json"},
        body=json.dumps({"test": "data"}),
        expected_status=200
    )


init_sample_tests()
