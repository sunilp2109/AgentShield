"""Persistent security audit logging.

This module records Action Firewall outcomes. It never changes ALLOW / BLOCK
decisions and never executes tools.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field
from sqlalchemy import Select, delete, func, select

from app.db.models import SecurityEvent
from app.db.session import SessionLocal, init_db
from app.security.detector import DetectionResult, Detector
from app.security.policy_engine import PolicyDecision
from app.security.risk_engine import (
    INTERNAL_HOST_MARKERS,
    PRIVATE_FILE_NAMES,
    PRIVATE_FILE_TOKENS,
    RiskAssessment,
    assess_risk,
)
from app.security.state import shield_state
from app.security.trust_engine import SourceType, TrustAssessment, TrustLevel, assess_trust

logger = logging.getLogger("agentshield.audit")

DECISIONS = frozenset({"ALLOW", "APPROVAL_REQUIRED", "BLOCK", "BYPASS"})
RISK_LEVELS = frozenset({"LOW", "MEDIUM", "HIGH", "CRITICAL"})
MAX_EVENT_LIMIT = 200
SOURCE_TYPE_ALIASES = {
    "USER": "USER_REQUEST",
    "USER_REQUEST": "USER_REQUEST",
    "DOCUMENT": "DOCUMENT",
    "PDF": "DOCUMENT",
    "WEB": "WEB_PAGE",
    "WEB_PAGE": "WEB_PAGE",
    "WEBPAGE": "WEB_PAGE",
    "EMAIL": "EMAIL",
    "TOOL_OUTPUT": "TOOL_OUTPUT",
    "TOOL_RESPONSE": "TOOL_OUTPUT",
    "SYSTEM": "SYSTEM",
}
SOURCE_TYPE_GROUPS = {
    "USER_REQUEST": ("USER_REQUEST", "USER"),
    "DOCUMENT": ("DOCUMENT", "PDF"),
    "WEB_PAGE": ("WEB_PAGE", "WEBPAGE", "WEB"),
    "EMAIL": ("EMAIL",),
    "TOOL_OUTPUT": ("TOOL_OUTPUT", "TOOL_RESPONSE"),
    "SYSTEM": ("SYSTEM",),
}

_SOURCE_TYPE_MAP = {
    SourceType.USER: "USER_REQUEST",
    SourceType.SYSTEM: "SYSTEM",
    SourceType.WEBPAGE: "WEB_PAGE",
    SourceType.PDF: "DOCUMENT",
    SourceType.EMAIL: "EMAIL",
    SourceType.TOOL_RESPONSE: "TOOL_OUTPUT",
    SourceType.LOCAL_PRIVATE_FILE: "DOCUMENT",
    SourceType.EXTERNAL_API: "WEB_PAGE",
}

_SECRET_RE = re.compile(
    r"(?i)\b(api[_-]?key|password|passwd|secret|token|bearer|authorization)\b\s*[=:]\s*\S+"
)
_KEY_LIKE_RE = re.compile(r"(?i)\b(sk_live|sk_test|sk-|ghp_|xox[baprs]-)[^\s,]+\b")
_detector = Detector()


class SecurityEventOut(BaseModel):
    id: str
    timestamp: datetime
    session_id: str
    request_id: str
    shield_enabled: bool
    source_type: str | None = None
    source_name: str | None = None
    trust_level: str | None = None
    user_intent: str | None = None
    tool_name: str
    action: str
    target_resource: str | None = None
    data_sensitivity: str | None = None
    destination_type: str | None = None
    injection_detected: bool = False
    injection_confidence: float = 0.0
    risk_score: float | None = None
    risk_level: str | None = None
    policy_decision: str
    firewall_decision: str
    execution_status: str
    execution_result_summary: str | None = None
    block_reason: str | None = None
    approval_required: bool = False
    created_at: datetime


class AuditStats(BaseModel):
    total_events: int = 0
    allowed: int = 0
    approval_required: int = 0
    blocked: int = 0
    bypassed: int = 0
    injections_detected: int = 0
    critical_events: int = 0
    average_risk_score: float | None = None
    shield_on_events: int = 0
    shield_off_events: int = 0
    risk_low: int = 0
    risk_medium: int = 0
    risk_high: int = 0
    risk_critical: int = 0


class AuditEventCreate(BaseModel):
    session_id: str = "default"
    request_id: str | None = None
    shield_enabled: bool | None = None
    source_type: str | None = None
    source_name: str | None = None
    trust_level: str | None = None
    user_intent: str | None = None
    tool_name: str
    action: str | None = None
    target_resource: str | None = None
    data_sensitivity: str | None = None
    destination_type: str | None = None
    injection_detected: bool = False
    injection_confidence: float = Field(default=0.0, ge=0, le=1)
    risk_score: float | None = Field(default=None, ge=0.0, le=10.0)
    risk_level: str | None = None
    policy_decision: str
    firewall_decision: str
    execution_status: str
    execution_result_summary: str | None = None
    block_reason: str | None = None
    approval_required: bool = False


class AuditService:
    """Create and query append-only security events."""

    def log_event(self, payload: AuditEventCreate | dict[str, Any]) -> SecurityEventOut | None:
        try:
            init_db()
            event = payload if isinstance(payload, AuditEventCreate) else AuditEventCreate.model_validate(payload)
            now = datetime.now(timezone.utc)
            row = SecurityEvent(
                id=uuid4().hex,
                timestamp=now,
                session_id=_clip(event.session_id or "default", 128) or "default",
                request_id=_clip(event.request_id or uuid4().hex, 64) or uuid4().hex,
                shield_enabled=bool(event.shield_enabled)
                if event.shield_enabled is not None
                else shield_state.shield_enabled,
                source_type=_clip(event.source_type, 32),
                source_name=_sanitize_text(event.source_name, max_len=255),
                trust_level=_clip(event.trust_level, 32),
                user_intent=_sanitize_text(event.user_intent, max_len=2000),
                tool_name=_clip(event.tool_name, 64) or "unknown",
                action=_clip(event.action or event.tool_name, 64) or "unknown",
                target_resource=_sanitize_text(event.target_resource, max_len=255),
                data_sensitivity=_clip(event.data_sensitivity, 32),
                destination_type=_clip(event.destination_type, 32),
                injection_detected=bool(event.injection_detected),
                injection_confidence=float(event.injection_confidence or 0.0),
                risk_score=event.risk_score,
                risk_level=_clip(event.risk_level, 16),
                policy_decision=event.policy_decision,
                firewall_decision=event.firewall_decision,
                execution_status=event.execution_status,
                execution_result_summary=_sanitize_text(event.execution_result_summary, max_len=240),
                block_reason=_sanitize_text(event.block_reason, max_len=500),
                approval_required=bool(event.approval_required),
                created_at=now,
            )
            with SessionLocal() as session:
                session.add(row)
                session.commit()
                session.refresh(row)
                out = _to_out(row)
            _log_console(out)
            return out
        except Exception:
            logger.exception("Audit logging failed; security decision was not changed.")
            return None

    def get_events(
        self,
        *,
        decision: str | None = None,
        risk_level: str | None = None,
        injection_detected: bool | None = None,
        shield_enabled: bool | None = None,
        session_id: str | None = None,
        source_type: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[SecurityEventOut]:
        init_db()
        stmt = _filtered_select(
            decision=decision,
            risk_level=risk_level,
            injection_detected=injection_detected,
            shield_enabled=shield_enabled,
            session_id=session_id,
            source_type=source_type,
        ).order_by(SecurityEvent.created_at.desc(), SecurityEvent.id.desc())
        stmt = stmt.offset(max(0, offset)).limit(max(1, min(limit, MAX_EVENT_LIMIT)))
        with SessionLocal() as session:
            rows = session.scalars(stmt).all()
            return [_to_out(row) for row in rows]

    def get_event_by_id(self, event_id: str) -> SecurityEventOut | None:
        init_db()
        with SessionLocal() as session:
            row = session.get(SecurityEvent, event_id)
            return _to_out(row) if row else None

    def get_event_stats(self) -> AuditStats:
        init_db()
        with SessionLocal() as session:
            total = session.scalar(select(func.count()).select_from(SecurityEvent)) or 0
            allowed = _count_decision(session, "ALLOW")
            approval_required = _count_decision(session, "APPROVAL_REQUIRED")
            blocked = _count_decision(session, "BLOCK")
            bypassed = _count_decision(session, "BYPASS")
            injections = session.scalar(
                select(func.count()).select_from(SecurityEvent).where(SecurityEvent.injection_detected.is_(True))
            ) or 0
            critical = session.scalar(
                select(func.count()).select_from(SecurityEvent).where(SecurityEvent.risk_level == "CRITICAL")
            ) or 0
            average = session.scalar(
                select(func.avg(SecurityEvent.risk_score)).where(SecurityEvent.risk_score.is_not(None))
            )
            shield_on = session.scalar(
                select(func.count()).select_from(SecurityEvent).where(SecurityEvent.shield_enabled.is_(True))
            ) or 0
            shield_off = session.scalar(
                select(func.count()).select_from(SecurityEvent).where(SecurityEvent.shield_enabled.is_(False))
            ) or 0
            risk_low = _count_risk_level(session, "LOW")
            risk_medium = _count_risk_level(session, "MEDIUM")
            risk_high = _count_risk_level(session, "HIGH")
            risk_critical = _count_risk_level(session, "CRITICAL")
        return AuditStats(
            total_events=int(total),
            allowed=int(allowed),
            approval_required=int(approval_required),
            blocked=int(blocked),
            bypassed=int(bypassed),
            injections_detected=int(injections),
            critical_events=int(critical),
            average_risk_score=round(float(average), 2) if average is not None else None,
            shield_on_events=int(shield_on),
            shield_off_events=int(shield_off),
            risk_low=int(risk_low),
            risk_medium=int(risk_medium),
            risk_high=int(risk_high),
            risk_critical=int(risk_critical),
        )

    def clear_events(self) -> int:
        """Test/demo helper. Not exposed on the public audit API."""
        init_db()
        with SessionLocal() as session:
            result = session.execute(delete(SecurityEvent))
            session.commit()
            return int(result.rowcount or 0)


audit_service = AuditService()


def log_event(payload: AuditEventCreate | dict[str, Any]) -> SecurityEventOut | None:
    return audit_service.log_event(payload)


def log_shield_state_change(
    *,
    enabled: bool,
    session_id: str = "default",
    request_id: str | None = None,
) -> SecurityEventOut | None:
    """Record an operator Shield ON/OFF change. Does not alter enforcement itself."""
    action = "shield_enabled" if enabled else "shield_disabled"
    decision = "SHIELD_ENABLED" if enabled else "SHIELD_DISABLED"
    return log_event(
        {
            "session_id": session_id or "default",
            "request_id": request_id,
            "shield_enabled": enabled,
            "source_type": "SYSTEM",
            "source_name": "operator",
            "user_intent": "Enable AgentShield" if enabled else "Disable AgentShield",
            "tool_name": "shield",
            "action": action,
            "policy_decision": decision,
            "firewall_decision": decision,
            "execution_status": "EXECUTED",
            "execution_result_summary": "Shield ON" if enabled else "Shield OFF",
        }
    )


def get_events(**kwargs: Any) -> list[SecurityEventOut]:
    return audit_service.get_events(**kwargs)


def get_event_by_id(event_id: str) -> SecurityEventOut | None:
    return audit_service.get_event_by_id(event_id)


def get_event_stats() -> AuditStats:
    return audit_service.get_event_stats()


def clear_events() -> int:
    return audit_service.clear_events()


def log_chat_turn(
    *,
    user_message: str,
    session_id: str,
    request_id: str,
    tool_calls_made: bool = False,
) -> SecurityEventOut | None:
    """Record a user chat prompt as an audit event.

    Called for every chat turn so that the prompt always appears in audit
    logs even when the agent responds conversationally without using any tools.
    """
    decision = "ALLOW"
    return log_event(
        {
            "session_id": session_id or "default",
            "request_id": request_id,
            "shield_enabled": shield_state.shield_enabled,
            "source_type": "USER_REQUEST",
            "source_name": "user",
            "user_intent": _sanitize_text(user_message, max_len=2000),
            "tool_name": "chat",
            "action": "chat_message",
            "policy_decision": decision,
            "firewall_decision": decision,
            "execution_status": "EXECUTED",
            "execution_result_summary": (
                "Agent used tools to respond." if tool_calls_made else "Agent responded conversationally."
            ),
        }
    )


def log_firewall_result(
    *,
    tool_name: str,
    arguments: dict[str, Any] | None,
    context: dict[str, Any] | None,
    decision: str,
    execution_status: str,
    reason: str = "",
    approval_required: bool = False,
    trust: TrustAssessment | None = None,
    injection: DetectionResult | None = None,
    risk: RiskAssessment | None = None,
    policy: PolicyDecision | None = None,
) -> SecurityEventOut | None:
    """Persist an audit event for a completed firewall decision."""
    arguments = arguments or {}
    context = dict(context or {})
    try:
        trust, injection, risk = _ensure_assessments(tool_name, arguments, context, trust, injection, risk)
    except Exception:
        logger.exception("Audit assessment enrichment failed; storing the firewall outcome only.")

    source = _audit_source_type(trust, context)
    target = _target_resource(tool_name, arguments, context)
    payload = AuditEventCreate(
        session_id=str(context.get("session_id") or "default"),
        request_id=str(context.get("request_id") or uuid4().hex),
        shield_enabled=shield_state.shield_enabled,
        source_type=source,
        source_name=_source_name(tool_name, arguments, context),
        trust_level=_enum_value(getattr(trust, "trust_level", None)),
        user_intent=_user_intent(context),
        tool_name=tool_name,
        action=tool_name,
        target_resource=target,
        data_sensitivity=_data_sensitivity(tool_name, arguments, context, trust),
        destination_type=_destination_type(tool_name, arguments, context),
        injection_detected=bool(getattr(injection, "is_injection", False)),
        injection_confidence=float(getattr(injection, "confidence", 0.0) or 0.0),
        risk_score=getattr(risk, "risk_score", None),
        risk_level=_enum_value(getattr(risk, "risk_level", None)),
        policy_decision=_enum_value(getattr(policy, "decision", None)) or decision,
        firewall_decision=decision,
        execution_status=_map_execution_status(decision, execution_status),
        execution_result_summary=_result_summary(decision, execution_status, tool_name),
        block_reason=reason if decision == "BLOCK" else None,
        approval_required=bool(approval_required or decision == "APPROVAL_REQUIRED"),
    )
    return log_event(payload)


def _ensure_assessments(
    tool_name: str,
    arguments: dict[str, Any],
    context: dict[str, Any],
    trust: TrustAssessment | None,
    injection: DetectionResult | None,
    risk: RiskAssessment | None,
) -> tuple[TrustAssessment | None, DetectionResult | None, RiskAssessment | None]:
    metadata = {
        key: value
        for key, value in context.items()
        if key not in {"risk", "trust", "injection"}
    }
    source = metadata.get("source_type") or SourceType.USER
    trust = trust or context.get("trust") or assess_trust(source, {**arguments, **metadata})
    injection = injection or context.get("injection")
    if injection is None:
        injection = _detector.detect(_text_blob(arguments, metadata))
    risk = risk or context.get("risk") or assess_risk(tool_name, arguments, metadata)
    return trust, injection, risk


def _map_execution_status(decision: str, module_status: str) -> str:
    if decision == "BYPASS":
        if module_status == "FAILED":
            return "ERROR"
        return "BYPASSED"
    if module_status == "EXECUTED":
        return "EXECUTED"
    if module_status == "PENDING":
        return "PENDING_APPROVAL"
    if module_status in {"BLOCKED", "REJECTED"}:
        return "BLOCKED"
    if module_status == "FAILED":
        return "ERROR"
    return "NOT_EXECUTED"


def _audit_source_type(trust: TrustAssessment | None, context: dict[str, Any]) -> str:
    raw = getattr(trust, "source_type", None) or context.get("source_type") or SourceType.USER
    if isinstance(raw, str):
        try:
            raw = SourceType(raw.upper())
        except ValueError:
            mapped = str(raw).upper()
            aliases = {
                "USER": "USER_REQUEST",
                "USER_REQUEST": "USER_REQUEST",
                "WEB_PAGE": "WEB_PAGE",
                "WEBPAGE": "WEB_PAGE",
                "DOCUMENT": "DOCUMENT",
                "PDF": "DOCUMENT",
            }
            return aliases.get(mapped, mapped)
    return _SOURCE_TYPE_MAP.get(raw, "USER_REQUEST")


def _source_name(tool_name: str, arguments: dict[str, Any], context: dict[str, Any]) -> str | None:
    filename = context.get("filename") or context.get("source_name")
    if filename:
        return str(filename)
    if tool_name == "read_file":
        return str(arguments.get("path") or "") or None
    if tool_name == "browse_url":
        return str(arguments.get("url") or "") or None
    if tool_name == "send_email":
        return str(arguments.get("recipient") or "") or None
    return "user"


def _target_resource(tool_name: str, arguments: dict[str, Any], context: dict[str, Any]) -> str | None:
    if tool_name == "read_file":
        return str(arguments.get("path") or context.get("path") or "") or None
    if tool_name == "browse_url":
        return str(arguments.get("url") or context.get("url") or "") or None
    if tool_name == "send_email":
        return str(arguments.get("recipient") or context.get("destination") or "") or None
    if tool_name == "list_files":
        return "mock_data/files"
    return None


def _destination_type(tool_name: str, arguments: dict[str, Any], context: dict[str, Any]) -> str | None:
    if tool_name == "browse_url":
        return "WEB_PAGE"
    if tool_name in {"read_file", "list_files"}:
        return "LOCAL_FILE"
    if tool_name != "send_email":
        return None
    destination = str(arguments.get("recipient") or context.get("destination") or "")
    if not destination:
        return "EMAIL"
    lowered = destination.lower()
    if any(marker in lowered for marker in INTERNAL_HOST_MARKERS):
        return "INTERNAL_EMAIL"
    return "EXTERNAL_EMAIL"


def _data_sensitivity(
    tool_name: str,
    arguments: dict[str, Any],
    context: dict[str, Any],
    trust: TrustAssessment | None,
) -> str:
    blob = " ".join(
        [
            str(arguments.get("path") or ""),
            str(context.get("path") or ""),
            str(context.get("filename") or ""),
            " ".join(str(item) for item in (arguments.get("attachments") or [])),
        ]
    ).lower()
    if any(name.lower() in blob for name in PRIVATE_FILE_NAMES) or any(
        token in blob for token in ("confidential", "employee_data")
    ):
        return "CONFIDENTIAL"
    if any(token in blob for token in PRIVATE_FILE_TOKENS):
        return "SENSITIVE"
    level = getattr(trust, "trust_level", None)
    if level == TrustLevel.SENSITIVE:
        return "SENSITIVE"
    if level == TrustLevel.UNTRUSTED:
        return "UNTRUSTED"
    return "NORMAL"


def _user_intent(context: dict[str, Any]) -> str | None:
    return _sanitize_text(str(context.get("user_intent") or context.get("user_message") or "") or None, max_len=2000)


def _result_summary(decision: str, module_status: str, tool_name: str) -> str:
    if decision == "BLOCK":
        return "Action blocked by AgentShield."
    if decision == "APPROVAL_REQUIRED":
        return "Action pending human approval."
    if decision == "BYPASS":
        if module_status == "FAILED":
            return "Tool execution failed with Shield off."
        return "Tool executed with Shield off."
    if module_status == "FAILED":
        return "Tool execution failed."
    summaries = {
        "browse_url": "Simulated page opened.",
        "read_file": "File read completed.",
        "list_files": "File list completed.",
        "send_email": "Simulated email sent.",
    }
    return summaries.get(tool_name, "Tool executed.")


def _sanitize_text(value: str | None, *, max_len: int = 240) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    lowered = text.lower()
    forbidden_snippets = (
        "confidential - internal only",
        "fake api token",
        "vpn jumphost",
        "sk_live_demo_not_real",
    )
    if any(snippet in lowered for snippet in forbidden_snippets):
        return "[REDACTED]"
    text = _SECRET_RE.sub(lambda match: f"{match.group(1)}=[REDACTED]", text)
    text = _KEY_LIKE_RE.sub("[REDACTED]", text)
    if len(text) > max_len:
        text = text[: max_len - 1].rstrip() + "…"
    return text


def _clip(value: str | None, max_len: int) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_len]


def _enum_value(value: Any) -> str | None:
    if value is None:
        return None
    return str(getattr(value, "value", value))


def _text_blob(arguments: dict[str, Any], metadata: dict[str, Any]) -> str:
    values: list[str] = []
    for item in (arguments, metadata.get("content"), metadata.get("user_intent"), metadata.get("user_message")):
        values.extend(_string_values(item))
    return " ".join(values)


def _string_values(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        found: list[str] = []
        for item in value.values():
            found.extend(_string_values(item))
        return found
    if isinstance(value, list):
        found: list[str] = []
        for item in value:
            found.extend(_string_values(item))
        return found
    return []


def _to_out(row: SecurityEvent) -> SecurityEventOut:
    return SecurityEventOut(
        id=row.id,
        timestamp=row.timestamp,
        session_id=row.session_id,
        request_id=row.request_id,
        shield_enabled=row.shield_enabled,
        source_type=row.source_type,
        source_name=row.source_name,
        trust_level=row.trust_level,
        user_intent=row.user_intent,
        tool_name=row.tool_name,
        action=row.action,
        target_resource=row.target_resource,
        data_sensitivity=row.data_sensitivity,
        destination_type=row.destination_type,
        injection_detected=row.injection_detected,
        injection_confidence=row.injection_confidence,
        risk_score=row.risk_score,
        risk_level=row.risk_level,
        policy_decision=row.policy_decision,
        firewall_decision=row.firewall_decision,
        execution_status=row.execution_status,
        execution_result_summary=row.execution_result_summary,
        block_reason=row.block_reason,
        approval_required=row.approval_required,
        created_at=row.created_at,
    )


def _filtered_select(
    *,
    decision: str | None,
    risk_level: str | None,
    injection_detected: bool | None,
    shield_enabled: bool | None,
    session_id: str | None,
    source_type: str | None,
) -> Select[tuple[SecurityEvent]]:
    stmt = select(SecurityEvent)
    if decision:
        stmt = stmt.where(SecurityEvent.firewall_decision == decision)
    if risk_level:
        stmt = stmt.where(SecurityEvent.risk_level == risk_level)
    if injection_detected is not None:
        stmt = stmt.where(SecurityEvent.injection_detected.is_(injection_detected))
    if shield_enabled is not None:
        stmt = stmt.where(SecurityEvent.shield_enabled.is_(shield_enabled))
    if session_id:
        stmt = stmt.where(SecurityEvent.session_id == session_id)
    if source_type:
        canonical = SOURCE_TYPE_ALIASES.get(source_type.upper(), source_type.upper())
        group = SOURCE_TYPE_GROUPS.get(canonical, (canonical,))
        stmt = stmt.where(SecurityEvent.source_type.in_(group))
    return stmt


def _count_decision(session: Any, decision: str) -> int:
    value = session.scalar(
        select(func.count()).select_from(SecurityEvent).where(SecurityEvent.firewall_decision == decision)
    )
    return int(value or 0)


def _count_risk_level(session: Any, level: str) -> int:
    value = session.scalar(
        select(func.count()).select_from(SecurityEvent).where(SecurityEvent.risk_level == level)
    )
    return int(value or 0)


def _log_console(event: SecurityEventOut) -> None:
    if event.tool_name == "shield":
        logger.info("[AUDIT] %s", event.action)
        return
    short_id = event.request_id if event.request_id.startswith("req_") else f"req_{event.request_id[:8]}"
    risk = event.risk_score if event.risk_score is not None else "n/a"
    extra = ""
    if event.firewall_decision == "BYPASS":
        extra = " | shield=false"
    logger.info(
        "[AUDIT] %s | %s | %s | %s | risk=%s%s",
        short_id,
        event.source_type or "UNKNOWN",
        event.action,
        event.firewall_decision,
        risk,
        extra,
    )
