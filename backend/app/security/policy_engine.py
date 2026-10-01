"""Policy Engine: authorization decisions only.

This module does not execute tools, call an LLM, access files, send email,
browse websites, or modify data. It consumes Trust Engine, Detector, and
Risk Engine outputs and returns ALLOW, APPROVAL_REQUIRED, or BLOCK.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from app.security.detector import DetectionResult, Detector
from app.security.risk_engine import (
    INTERNAL_HOST_MARKERS,
    PRIVATE_FILE_NAMES,
    PRIVATE_FILE_TOKENS,
    RiskAssessment,
    RiskLevel,
    assess_risk,
)
from app.security.trust_engine import SourceType, TrustAssessment, TrustLevel, assess_trust
from app.shield.models import FirewallDecision

HIGH_RISK_TOOLS = frozenset({"send_email", "write_file", "external_upload"})
EXFILTRATION_TOOLS = frozenset({"send_email", "external_upload"})
CREDENTIAL_MARKERS = (
    "password",
    "passwords",
    "api key",
    "api_key",
    "apikey",
    "token",
    "secret",
    "credential",
)
_detector = Detector()


class PolicyDecision(BaseModel):
    decision: FirewallDecision
    risk_score: float = Field(ge=0.0, le=10.0)
    risk_level: RiskLevel
    reason: str
    policy_rule: str
    requires_human_approval: bool


def evaluate_policy(
    tool_name: str,
    arguments: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
    *,
    risk: RiskAssessment | None = None,
    trust: TrustAssessment | None = None,
    injection: DetectionResult | None = None,
) -> PolicyDecision:
    arguments = arguments or {}
    metadata = metadata or {}

    source_type = metadata.get("source_type") or arguments.get("source_type") or SourceType.USER
    trust = trust or assess_trust(source_type, {**arguments, **metadata})
    injection = injection or _detector.detect(_text_blob(arguments, metadata))
    risk = risk or assess_risk(tool_name, arguments, metadata)

    untrusted = trust.trust_level == TrustLevel.UNTRUSTED
    trusted_user = trust.trust_level == TrustLevel.TRUSTED
    private_file = _mentions_private_file(tool_name, arguments, metadata)
    credentials = _mentions_credentials(arguments, metadata)
    sensitive = private_file or credentials or bool(metadata.get("sensitive"))
    external = _is_external_destination(tool_name, arguments, metadata)
    high_risk_tool = tool_name in HIGH_RISK_TOOLS
    exfil_tool = tool_name in EXFILTRATION_TOOLS

    if sensitive and external:
        return _result(
            FirewallDecision.BLOCK,
            risk,
            "Untrusted content attempted to access sensitive data and send it to an external destination."
            if untrusted
            else "Sensitive or critical data cannot be sent to an external destination.",
            "UNTRUSTED_SENSITIVE_EXTERNAL" if untrusted else "SENSITIVE_EXTERNAL_DESTINATION",
        )

    if untrusted and credentials:
        return _result(
            FirewallDecision.BLOCK,
            risk,
            "Untrusted content attempted to access credentials or other secrets.",
            "UNTRUSTED_CREDENTIAL_ACCESS",
        )

    if untrusted and private_file:
        return _result(
            FirewallDecision.BLOCK,
            risk,
            "Untrusted content attempted to access a private or sensitive file.",
            "UNTRUSTED_PRIVATE_FILE_ACCESS",
        )

    if untrusted and (exfil_tool or (high_risk_tool and (sensitive or external))):
        return _result(
            FirewallDecision.BLOCK,
            risk,
            "Untrusted content attempted to trigger unauthorized data access or exfiltration.",
            "UNTRUSTED_HIGH_RISK_ACTION",
        )

    if trusted_user and high_risk_tool:
        return _result(
            FirewallDecision.APPROVAL_REQUIRED,
            risk,
            "This high-risk user-requested action requires confirmation before execution.",
            "HIGH_RISK_USER_ACTION",
        )

    if trusted_user and risk.risk_score <= 3.9:
        return _result(
            FirewallDecision.ALLOW,
            risk,
            "Low-risk action from a trusted user request.",
            "LOW_RISK_ACTION",
        )

    if risk.risk_score >= 7.0:
        return _result(
            FirewallDecision.BLOCK,
            risk,
            "Risk score is at or above the block threshold.",
            "RISK_THRESHOLD_BLOCK",
        )
    if risk.risk_score >= 4.0:
        return _result(
            FirewallDecision.APPROVAL_REQUIRED,
            risk,
            "This action requires confirmation based on its risk score.",
            "RISK_THRESHOLD_APPROVAL",
        )
    return _result(
        FirewallDecision.ALLOW,
        risk,
        "Low-risk action from a trusted user request."
        if trusted_user
        else "Low-risk action permitted by policy thresholds.",
        "LOW_RISK_ACTION" if trusted_user else "RISK_THRESHOLD_ALLOW",
    )


def _result(
    decision: FirewallDecision,
    risk: RiskAssessment,
    reason: str,
    policy_rule: str,
) -> PolicyDecision:
    return PolicyDecision(
        decision=decision,
        risk_score=risk.risk_score,
        risk_level=risk.risk_level,
        reason=reason,
        policy_rule=policy_rule,
        requires_human_approval=decision == FirewallDecision.APPROVAL_REQUIRED,
    )


def _mentions_private_file(
    tool_name: str,
    arguments: dict[str, Any],
    metadata: dict[str, Any],
) -> bool:
    if metadata.get("private_file") is True:
        return True
    path = str(metadata.get("path") or arguments.get("path") or metadata.get("filename") or "")
    attachments = arguments.get("attachments") or metadata.get("attachments") or []
    names = [path, *_as_strings(attachments), str(arguments.get("body") or ""), str(metadata.get("content") or "")]
    blob = " ".join(names).lower()
    if any(name.lower() in blob for name in PRIVATE_FILE_NAMES):
        return True
    if tool_name == "read_file" and any(token in blob for token in PRIVATE_FILE_TOKENS):
        return True
    return any(token in blob for token in ("confidential", "employee_data", "private file"))


def _mentions_credentials(arguments: dict[str, Any], metadata: dict[str, Any]) -> bool:
    blob = _text_blob(arguments, metadata).lower()
    path = str(arguments.get("path") or metadata.get("path") or "").lower()
    haystack = f"{blob} {path}"
    return any(marker in haystack for marker in CREDENTIAL_MARKERS)


def _is_external_destination(
    tool_name: str,
    arguments: dict[str, Any],
    metadata: dict[str, Any],
) -> bool:
    if metadata.get("external_destination") is True:
        return True
    if tool_name == "external_upload":
        return True
    destination = str(
        metadata.get("destination") or arguments.get("recipient") or arguments.get("url") or ""
    )
    if not destination:
        return False
    lowered = destination.lower()
    return not any(marker in lowered for marker in INTERNAL_HOST_MARKERS)


def _text_blob(arguments: dict[str, Any], metadata: dict[str, Any]) -> str:
    parts: list[str] = []
    parts.extend(_string_values(arguments))
    parts.extend(_string_values(metadata.get("content")))
    return " ".join(parts)


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


def _as_strings(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if value:
        return [str(value)]
    return []
