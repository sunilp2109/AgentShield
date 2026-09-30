"""Human-in-the-loop approval queue.

Handles what happens AFTER Policy Engine returns APPROVAL_REQUIRED.
It never overrides BLOCK and never executes tools while a request is pending.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import delete, select, update
from sqlalchemy.exc import OperationalError

from app.config import settings
from app.db.models import ApprovalRequest
from app.db.session import SessionLocal, init_db
from app.security.audit import (
    AuditEventCreate,
    _audit_source_type,
    _data_sensitivity,
    _destination_type,
    _sanitize_text,
    _source_name,
    _target_resource,
    log_event,
)
from app.security.detector import DetectionResult, Detector
from app.security.policy_engine import PolicyDecision, evaluate_policy
from app.security.risk_engine import RiskAssessment, assess_risk
from app.security.state import shield_state
from app.security.trust_engine import TrustAssessment, assess_trust
from app.shield.models import FirewallDecision
from app.tools.executor import execute_tool
from app.tools.registry import TOOL_REGISTRY

logger = logging.getLogger("agentshield.approval")

PENDING = "PENDING"
APPROVED = "APPROVED"
REJECTED = "REJECTED"
EXPIRED = "EXPIRED"
EXECUTED = "EXECUTED"
EXECUTION_FAILED = "EXECUTION_FAILED"

APPROVAL_STATUSES = frozenset(
    {PENDING, APPROVED, REJECTED, EXPIRED, EXECUTED, EXECUTION_FAILED}
)
_BODY_KEYS = frozenset({"body", "content", "text", "message", "note"})
_SAFE_CONTEXT_KEYS = (
    "session_id",
    "request_id",
    "source_type",
    "filename",
    "source_name",
    "user_intent",
    "user_message",
    "path",
    "url",
    "destination",
)
_TRUST_SOURCE_ALIASES = {
    "USER": "USER",
    "USER_REQUEST": "USER",
    "SYSTEM": "SYSTEM",
    "DOCUMENT": "PDF",
    "PDF": "PDF",
    "WEB_PAGE": "WEBPAGE",
    "WEBPAGE": "WEBPAGE",
    "EMAIL": "EMAIL",
    "TOOL_OUTPUT": "TOOL_RESPONSE",
    "TOOL_RESPONSE": "TOOL_RESPONSE",
    "LOCAL_PRIVATE_FILE": "LOCAL_PRIVATE_FILE",
    "EXTERNAL_API": "EXTERNAL_API",
}
_detector = Detector()


class ApprovalError(Exception):
    def __init__(self, message: str, status_code: int = 409) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class ApprovalRequestOut(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    request_id: str
    session_id: str
    created_at: datetime
    updated_at: datetime
    status: str
    tool_name: str
    action: str
    target_resource: str | None = None
    source_type: str | None = None
    source_name: str | None = None
    trust_level: str | None = None
    data_sensitivity: str | None = None
    destination_type: str | None = None
    injection_detected: bool = False
    injection_confidence: float = 0.0
    risk_score: int | None = None
    risk_level: str | None = None
    policy_decision: str
    reason: str | None = None
    tool_arguments: dict[str, Any] = Field(default_factory=dict)
    expires_at: datetime
    decided_at: datetime | None = None
    decided_by: str | None = None
    rejection_reason: str | None = None
    execution_status: str
    execution_result_summary: str | None = None
    result: Any | None = None
    stored_context: dict[str, Any] = Field(default_factory=dict, exclude=True)


class ApprovalService:
    """Persist and resolve APPROVAL_REQUIRED tool calls."""

    def create_request(
        self,
        *,
        tool_name: str,
        arguments: dict[str, Any] | None,
        context: dict[str, Any] | None,
        policy: PolicyDecision,
        risk: RiskAssessment,
        trust: TrustAssessment,
        injection: DetectionResult | None = None,
        reason: str = "",
    ) -> ApprovalRequestOut:
        if policy.decision != FirewallDecision.APPROVAL_REQUIRED:
            raise ApprovalError(
                "Approval requests can only be created for APPROVAL_REQUIRED actions.",
                400,
            )

        init_db()
        arguments = arguments or {}
        context = dict(context or {})
        now = _now()
        ttl = max(1, int(settings.approval_ttl_minutes))
        row = ApprovalRequest(
            id=uuid4().hex,
            request_id=str(context.get("request_id") or uuid4().hex)[:64],
            session_id=str(context.get("session_id") or "default")[:128],
            created_at=now,
            updated_at=now,
            status=PENDING,
            tool_name=tool_name,
            action=tool_name,
            target_resource=_target_resource(tool_name, arguments, context),
            source_type=_audit_source_type(trust, context),
            source_name=_source_name(tool_name, arguments, context),
            trust_level=_enum_value(trust.trust_level),
            data_sensitivity=_data_sensitivity(tool_name, arguments, context, trust),
            destination_type=_destination_type(tool_name, arguments, context),
            injection_detected=bool(getattr(injection, "is_injection", False)),
            injection_confidence=float(getattr(injection, "confidence", 0.0) or 0.0),
            risk_score=risk.risk_score,
            risk_level=_enum_value(risk.risk_level),
            policy_decision="APPROVAL_REQUIRED",
            reason=_sanitize_text(reason or policy.reason, max_len=500),
            tool_arguments=_safe_tool_arguments(tool_name, arguments),
            context_json=_safe_context(context),
            expires_at=now + timedelta(minutes=ttl),
            execution_status="NOT_EXECUTED",
        )
        with SessionLocal() as session:
            session.add(row)
            session.commit()
            session.refresh(row)
            out = _to_out(row)
        _audit_lifecycle(out, "APPROVAL_CREATED", "APPROVAL_REQUIRED", "PENDING_APPROVAL")
        return out

    def get_pending_requests(self) -> list[ApprovalRequestOut]:
        return self.get_requests(status=PENDING)

    def get_requests(
        self, *, status: str | None = None, session_id: str | None = None
    ) -> list[ApprovalRequestOut]:
        init_db()
        self.expire_due_requests()
        stmt = select(ApprovalRequest).order_by(ApprovalRequest.created_at.desc())
        if status:
            stmt = stmt.where(ApprovalRequest.status == status.upper())
        if session_id:
            stmt = stmt.where(ApprovalRequest.session_id == session_id)
        with SessionLocal() as session:
            rows = session.scalars(stmt).all()
            return [_to_out(row) for row in rows]

    def get_request(self, approval_id: str) -> ApprovalRequestOut | None:
        init_db()
        self._expire_if_due(approval_id)
        with SessionLocal() as session:
            row = session.get(ApprovalRequest, approval_id)
            return _to_out(row) if row else None

    def approve_request(
        self,
        approval_id: str,
        *,
        decided_by: str | None = None,
    ) -> ApprovalRequestOut:
        init_db()
        self._expire_if_due(approval_id)
        current = self.get_request(approval_id)
        if current is None:
            raise ApprovalError("Approval request not found.", 404)
        if current.status == APPROVED:
            return self.execute_approved_request(approval_id)
        now = _now()
        with SessionLocal() as session:
            result = session.execute(
                update(ApprovalRequest)
                .where(ApprovalRequest.id == approval_id, ApprovalRequest.status == PENDING)
                .values(
                    status=APPROVED,
                    updated_at=now,
                    decided_at=now,
                    decided_by=_sanitize_text(decided_by, max_len=128),
                    execution_status="NOT_EXECUTED",
                )
            )
            session.commit()
            if result.rowcount != 1:
                raise self._conflict(approval_id)
            row = session.get(ApprovalRequest, approval_id)
            out = _to_out(row) if row else None
        if out is None:
            raise ApprovalError("Approval request not found.", 404)
        _audit_lifecycle(out, "APPROVAL_APPROVED", "ALLOW", "PENDING_APPROVAL")
        return self.execute_approved_request(approval_id)

    def reject_request(
        self,
        approval_id: str,
        *,
        reason: str | None = None,
        decided_by: str | None = None,
    ) -> ApprovalRequestOut:
        init_db()
        self._expire_if_due(approval_id)
        now = _now()
        with SessionLocal() as session:
            result = session.execute(
                update(ApprovalRequest)
                .where(ApprovalRequest.id == approval_id, ApprovalRequest.status == PENDING)
                .values(
                    status=REJECTED,
                    updated_at=now,
                    decided_at=now,
                    decided_by=_sanitize_text(decided_by, max_len=128),
                    rejection_reason=_sanitize_text(reason, max_len=500),
                    execution_status="NOT_EXECUTED",
                    execution_result_summary="Action rejected by a human reviewer.",
                )
            )
            session.commit()
            if result.rowcount != 1:
                raise self._conflict(approval_id)
            row = session.get(ApprovalRequest, approval_id)
            out = _to_out(row) if row else None
        if out is None:
            raise ApprovalError("Approval request not found.", 404)
        _audit_lifecycle(out, "APPROVAL_REJECTED", "BLOCK", "NOT_EXECUTED")
        return out

    def expire_request(self, approval_id: str) -> ApprovalRequestOut:
        init_db()
        now = _now()
        with SessionLocal() as session:
            row = session.get(ApprovalRequest, approval_id)
            if row is None:
                raise ApprovalError("Approval request not found.", 404)
            if row.status != PENDING:
                raise self._conflict(approval_id)
            row.status = EXPIRED
            row.updated_at = now
            row.execution_status = "NOT_EXECUTED"
            row.execution_result_summary = "Approval request expired."
            session.commit()
            session.refresh(row)
            out = _to_out(row)
        _audit_lifecycle(out, "APPROVAL_EXPIRED", "APPROVAL_REQUIRED", "NOT_EXECUTED")
        return out

    def expire_due_requests(self) -> int:
        init_db()
        now = _now()
        expired_ids: list[str] = []
        with SessionLocal() as session:
            due = session.scalars(
                select(ApprovalRequest).where(
                    ApprovalRequest.status == PENDING,
                    ApprovalRequest.expires_at <= now,
                )
            ).all()
            for row in due:
                row.status = EXPIRED
                row.updated_at = now
                row.execution_status = "NOT_EXECUTED"
                row.execution_result_summary = "Approval request expired."
                expired_ids.append(row.id)
            session.commit()
        for approval_id in expired_ids:
            item = self.get_request(approval_id)
            if item:
                _audit_lifecycle(item, "APPROVAL_EXPIRED", "APPROVAL_REQUIRED", "NOT_EXECUTED")
        return len(expired_ids)

    def execute_approved_request(self, approval_id: str) -> ApprovalRequestOut:
        init_db()
        self._expire_if_due(approval_id)

        def _snapshot() -> ApprovalRequestOut:
            with SessionLocal() as session:
                row = session.get(ApprovalRequest, approval_id)
                if row is None:
                    raise ApprovalError("Approval request not found.", 404)
                if row.status == EXECUTED:
                    raise ApprovalError("Request was already executed.", 409)
                if row.status != APPROVED:
                    raise self._conflict(approval_id)
                return _row_snapshot(row)

        snapshot = _with_sqlite_retry(_snapshot)

        try:
            valid, message, policy = self._revalidate(snapshot)
        except Exception:
            logger.exception("Approved action revalidation failed.")
            failed = self._mark_execution_failed(
                approval_id, "Approved action could not be revalidated."
            )
            _audit_lifecycle(failed, "APPROVED_ACTION_FAILED", "BLOCK", "ERROR")
            raise ApprovalError("Approved action could not be revalidated.", 409) from None
        if not valid:
            failed = self._mark_execution_failed(approval_id, message)
            _audit_lifecycle(failed, "APPROVED_ACTION_FAILED", "BLOCK", "ERROR", message)
            raise ApprovalError(message or "Approved action is no longer safe to execute.", 409)

        try:
            result = execute_tool(snapshot.tool_name, snapshot.tool_arguments or {})
        except Exception:
            logger.exception("Approved tool execution failed.")
            failed = self._mark_execution_failed(approval_id, "Tool execution failed.")
            _audit_lifecycle(failed, "APPROVED_ACTION_FAILED", "ALLOW", "ERROR")
            raise ApprovalError("Tool execution failed.", 409) from None

        safe_result = _safe_execution_result(result)
        now = _now()

        def _mark_executed() -> ApprovalRequestOut:
            with SessionLocal() as session:
                locked = session.execute(
                    update(ApprovalRequest)
                    .where(ApprovalRequest.id == approval_id, ApprovalRequest.status == APPROVED)
                    .values(
                        status=EXECUTED,
                        updated_at=now,
                        execution_status="EXECUTED",
                        execution_result_summary="Approved action executed.",
                        reason=_sanitize_text(
                            policy.reason if policy else snapshot.reason, max_len=500
                        ),
                    )
                )
                session.commit()
                if locked.rowcount != 1:
                    raise ApprovalError("Request was already executed.", 409)
                row = session.get(ApprovalRequest, approval_id)
                if row is None:
                    raise ApprovalError("Approval request not found.", 404)
                return _to_out(row, result=safe_result)

        out = _with_sqlite_retry(_mark_executed)
        _audit_lifecycle(out, "APPROVED_ACTION_EXECUTED", "ALLOW", "EXECUTED")
        return out

    def clear_requests(self) -> int:
        init_db()
        with SessionLocal() as session:
            result = session.execute(delete(ApprovalRequest))
            session.commit()
            return int(result.rowcount or 0)

    def _revalidate(self, row: ApprovalRequestOut) -> tuple[bool, str, PolicyDecision | None]:
        from app.security.firewall import (
            _is_forbidden_tool,
            _schema_arguments,
            _validate_arguments,
            _validate_filesystem_path,
        )

        name = row.tool_name
        arguments = dict(row.tool_arguments or {})
        if _is_forbidden_tool(name) or name not in TOOL_REGISTRY:
            return False, "Tool is not registered with AgentShield.", None
        cleaned = _schema_arguments(name, arguments)
        invalid = _validate_arguments(name, cleaned)
        if invalid:
            return False, invalid, None
        path_error = _validate_filesystem_path(name, cleaned)
        if path_error:
            return False, path_error, None

        context = dict(row_context(row))
        metadata = {**context, "tool": name, "action": name}
        if name == "read_file":
            metadata.setdefault("path", cleaned.get("path"))
        if name == "send_email":
            metadata.setdefault("destination", cleaned.get("recipient"))
        if name == "browse_url":
            metadata.setdefault("url", cleaned.get("url"))
        source_type = metadata.get("source_type") or row.source_type or "USER"
        source_type = _TRUST_SOURCE_ALIASES.get(str(source_type).upper(), source_type)
        trust = assess_trust(source_type, {**cleaned, **metadata})
        injection = _detector.detect(_text_from_args(cleaned, metadata))
        risk = assess_risk(name, cleaned, metadata)
        policy = evaluate_policy(
            name, cleaned, metadata, risk=risk, trust=trust, injection=injection
        )
        if policy.decision == FirewallDecision.BLOCK:
            return False, policy.reason or "Current policy blocks this action.", policy
        return True, "", policy

    def _mark_execution_failed(self, approval_id: str, message: str) -> ApprovalRequestOut:
        now = _now()
        with SessionLocal() as session:
            session.execute(
                update(ApprovalRequest)
                .where(ApprovalRequest.id == approval_id)
                .values(
                    status=EXECUTION_FAILED,
                    updated_at=now,
                    execution_status="NOT_EXECUTED",
                    execution_result_summary=_sanitize_text(message, max_len=240),
                    rejection_reason=_sanitize_text(message, max_len=500),
                )
            )
            session.commit()
            row = session.get(ApprovalRequest, approval_id)
            if row is None:
                raise ApprovalError("Approval request not found.", 404)
            return _to_out(row)

    def _expire_if_due(self, approval_id: str) -> None:
        now = _now()
        with SessionLocal() as session:
            row = session.get(ApprovalRequest, approval_id)
            if row is None or row.status != PENDING:
                return
            if _as_utc(row.expires_at) > now:
                return
            row.status = EXPIRED
            row.updated_at = now
            row.execution_status = "NOT_EXECUTED"
            row.execution_result_summary = "Approval request expired."
            session.commit()
            out = _to_out(row)
        _audit_lifecycle(out, "APPROVAL_EXPIRED", "APPROVAL_REQUIRED", "NOT_EXECUTED")

    def _conflict(self, approval_id: str) -> ApprovalError:
        item = self.get_request(approval_id)
        if item is None:
            return ApprovalError("Approval request not found.", 404)
        messages = {
            APPROVED: "Request is already approved.",
            REJECTED: "Request was rejected.",
            EXPIRED: "Request has expired.",
            EXECUTED: "Request was already executed.",
            EXECUTION_FAILED: "Request already failed execution.",
            PENDING: "Request cannot be modified.",
        }
        return ApprovalError(messages.get(item.status, "Request is not pending."), 409)


approval_service = ApprovalService()


def create_approval_request(**kwargs: Any) -> ApprovalRequestOut:
    return approval_service.create_request(**kwargs)


def get_approval(approval_id: str) -> ApprovalRequestOut | None:
    return approval_service.get_request(approval_id)


def get_pending_approvals() -> list[ApprovalRequestOut]:
    return approval_service.get_pending_requests()


def clear_approvals() -> int:
    return approval_service.clear_requests()


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _with_sqlite_retry(operation, attempts: int = 10):
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            return operation()
        except OperationalError as exc:
            last = exc
            if "locked" not in str(exc).lower() or attempt == attempts - 1:
                raise
            time.sleep(0.05 * (attempt + 1))
    raise last  # pragma: no cover



def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _enum_value(value: Any) -> str | None:
    if value is None:
        return None
    return str(getattr(value, "value", value))


def _safe_tool_arguments(tool_name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    from app.security.firewall import _schema_arguments

    cleaned = _schema_arguments(tool_name, arguments)
    safe: dict[str, Any] = {}
    for key, value in cleaned.items():
        if key in _BODY_KEYS:
            text = _sanitize_text(str(value), max_len=500)
            safe[key] = text or ""
        elif key == "attachments":
            safe[key] = [str(item) for item in value] if isinstance(value, list) else []
        elif isinstance(value, str):
            safe[key] = _sanitize_text(value, max_len=255) or value
        else:
            safe[key] = value
    return safe


def _safe_context(context: dict[str, Any]) -> dict[str, Any]:
    safe: dict[str, Any] = {}
    for key in _SAFE_CONTEXT_KEYS:
        value = context.get(key)
        if value is None or callable(value):
            continue
        if hasattr(value, "value"):
            safe[key] = str(value.value)
        else:
            text = _sanitize_text(str(value), max_len=240)
            if text:
                safe[key] = text
    return safe


def _safe_execution_result(result: Any) -> Any:
    if not isinstance(result, dict):
        return result
    safe = dict(result)
    if "content" in safe:
        safe["content"] = "[REDACTED]"
    if "body" in safe and isinstance(safe["body"], str):
        redacted = _sanitize_text(safe["body"], max_len=240)
        safe["body"] = redacted or "[REDACTED]"
    return safe


def _text_from_args(arguments: dict[str, Any], metadata: dict[str, Any]) -> str:
    parts: list[str] = []
    for value in list(arguments.values()) + [metadata.get("user_intent"), metadata.get("content")]:
        if isinstance(value, str):
            parts.append(value)
        elif isinstance(value, list):
            parts.extend(str(item) for item in value)
    return " ".join(parts)


def row_context(row: ApprovalRequestOut) -> dict[str, Any]:
    context = dict(row.stored_context or {})
    if not context:
        return {
            "session_id": row.session_id,
            "request_id": row.request_id,
            "source_type": row.source_type,
            "filename": row.source_name,
        }
    return context


def _row_snapshot(row: ApprovalRequest) -> ApprovalRequestOut:
    return _to_out(row)


def _to_out(row: ApprovalRequest, result: Any | None = None) -> ApprovalRequestOut:
    return ApprovalRequestOut(
        id=row.id,
        request_id=row.request_id,
        session_id=row.session_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
        status=row.status,
        tool_name=row.tool_name,
        action=row.action,
        target_resource=row.target_resource,
        source_type=row.source_type,
        source_name=row.source_name,
        trust_level=row.trust_level,
        data_sensitivity=row.data_sensitivity,
        destination_type=row.destination_type,
        injection_detected=row.injection_detected,
        injection_confidence=row.injection_confidence,
        risk_score=row.risk_score,
        risk_level=row.risk_level,
        policy_decision=row.policy_decision,
        reason=row.reason,
        tool_arguments=dict(row.tool_arguments or {}),
        expires_at=row.expires_at,
        decided_at=row.decided_at,
        decided_by=row.decided_by,
        rejection_reason=row.rejection_reason,
        execution_status=row.execution_status,
        execution_result_summary=row.execution_result_summary,
        result=result,
        stored_context=dict(row.context_json or {}),
    )


def _audit_lifecycle(
    item: ApprovalRequestOut,
    action: str,
    firewall_decision: str,
    execution_status: str,
    block_reason: str | None = None,
) -> None:
    try:
        log_event(
            AuditEventCreate(
                session_id=item.session_id,
                request_id=item.request_id,
                shield_enabled=shield_state.shield_enabled,
                source_type=item.source_type,
                source_name=item.source_name,
                trust_level=item.trust_level,
                user_intent=None,
                tool_name=item.tool_name,
                action=action,
                target_resource=item.target_resource,
                data_sensitivity=item.data_sensitivity,
                destination_type=item.destination_type,
                injection_detected=item.injection_detected,
                injection_confidence=item.injection_confidence,
                risk_score=item.risk_score,
                risk_level=item.risk_level,
                policy_decision=item.policy_decision,
                firewall_decision=firewall_decision,
                execution_status=execution_status,
                execution_result_summary=action.replace("_", " ").title() + ".",
                block_reason=block_reason,
                approval_required=True,
            )
        )
    except Exception:
        logger.exception("Failed to record approval audit event.")
