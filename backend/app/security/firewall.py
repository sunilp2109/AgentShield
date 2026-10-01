"""Action Firewall: the only execution gate between the LLM and tools."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from app.agent.state import ProposedToolCall
from app.security.audit import log_firewall_result
from app.security.detector import DetectionResult, Detector
from app.security.policy_engine import PolicyDecision, evaluate_policy
from app.security.risk_engine import RiskAssessment, assess_risk
from app.security.state import shield_state
from app.security.trust_engine import SourceType, TrustAssessment, assess_trust
from app.shield.models import FirewallDecision
from app.tools.executor import execute_tool
from app.tools.schemas import TOOL_PARAMETERS

logger = logging.getLogger("agentshield.firewall")

FORBIDDEN_TOOLS = frozenset(
    {
        "shell",
        "bash",
        "cmd",
        "powershell",
        "run_shell",
        "system",
        "os.system",
        "subprocess",
        "eval",
        "exec",
    }
)
_pending_actions: dict[str, dict[str, Any]] = {}
_detector = Detector()


@dataclass
class _EvalSnapshot:
    trust: TrustAssessment | None = None
    injection: DetectionResult | None = None
    risk: RiskAssessment | None = None
    policy: PolicyDecision | None = None


class FirewallResult(BaseModel):
    decision: str
    execution_status: str
    tool: str
    risk_score: float | None = None
    risk_level: str | None = None
    reason: str = ""
    result: Any | None = None
    approval_required: bool = False
    pending_action_id: str | None = None
    approval_id: str | None = None
    policy_rule: str | None = None
    trust: TrustAssessment | None = None


class PendingAction(BaseModel):
    id: str
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)
    policy: PolicyDecision
    risk: RiskAssessment
    trust: TrustAssessment


class ActionFirewall:
    """Authorize and optionally execute a proposed tool call."""

    def evaluate_and_execute(
        self,
        tool_call: ProposedToolCall | dict[str, Any],
        context: dict[str, Any] | None = None,
    ) -> FirewallResult:
        call = _as_tool_call(tool_call)
        context = dict(context or {})
        snapshot = _EvalSnapshot()
        result = self._decide(call, context, snapshot)
        _record_audit(call, context, result, snapshot)
        return result

    def _decide(
        self,
        call: ProposedToolCall,
        context: dict[str, Any],
        snapshot: _EvalSnapshot,
    ) -> FirewallResult:
        name = call.name.strip()

        if _is_forbidden_tool(name):
            return _reject(name, "System/shell execution is not allowed.", snapshot=snapshot)
        from app.tools.registry import TOOL_REGISTRY
        if name not in TOOL_REGISTRY:
            return _reject(name, "Tool is not registered with AgentShield.", snapshot=snapshot)

        invalid = _validate_arguments(name, call.arguments)
        if invalid:
            return _reject(name, invalid, snapshot=snapshot)

        path_error = _validate_filesystem_path(name, call.arguments)
        if path_error:
            return _reject(name, path_error, snapshot=snapshot)

        if not shield_state.shield_enabled:
            return self._bypass(call)

        return self._enforce(call, context, snapshot)

    def _bypass(self, call: ProposedToolCall) -> FirewallResult:
        executed = _run_registered_tool(call.name, call.arguments)
        if executed.failed:
            logger.info(
                "tool=%s decision=BYPASS execution_status=FAILED risk_score=%s",
                call.name,
                None,
            )
            return FirewallResult(
                decision="BYPASS",
                execution_status="FAILED",
                tool=call.name,
                reason=executed.error,
            )
        logger.info("tool=%s decision=BYPASS execution_status=EXECUTED risk_score=%s", call.name, None)
        return FirewallResult(
            decision="BYPASS",
            execution_status="EXECUTED",
            tool=call.name,
            reason="Shield is off; tool executed without AgentShield policy enforcement.",
            result=executed.result,
            trust=_trust_from_result(executed.result),
        )

    def _enforce(self, call: ProposedToolCall, context: dict[str, Any], snapshot: _EvalSnapshot) -> FirewallResult:
        metadata = _context_metadata(call, context)
        source_type = metadata.get("source_type", SourceType.USER)
        trust = context.get("trust") or assess_trust(source_type, {**call.arguments, **metadata})
        injection = context.get("injection") or _detector.detect(_text_blob(call.arguments, metadata))
        risk = context.get("risk") or assess_risk(call.name, call.arguments, metadata)
        policy = evaluate_policy(
            call.name,
            call.arguments,
            metadata,
            risk=risk,
            trust=trust,
            injection=injection,
        )
        snapshot.trust = trust
        snapshot.injection = injection
        snapshot.risk = risk
        snapshot.policy = policy

        if policy.decision == FirewallDecision.ALLOW:
            executed = _run_registered_tool(call.name, call.arguments)
            status = "FAILED" if executed.failed else "EXECUTED"
            logger.info(
                "tool=%s decision=ALLOW execution_status=%s risk_score=%s",
                call.name,
                status,
                risk.risk_score,
            )
            return FirewallResult(
                decision="ALLOW",
                execution_status=status,
                tool=call.name,
                risk_score=risk.risk_score,
                risk_level=risk.risk_level.value,
                reason=executed.error if executed.failed else policy.reason,
                result=None if executed.failed else executed.result,
                policy_rule=policy.policy_rule,
                trust=trust if not executed.failed else None,
            )

        if policy.decision == FirewallDecision.APPROVAL_REQUIRED:
            pending_id = _store_pending(call, context, policy, risk, trust, injection)
            logger.info(
                "tool=%s decision=APPROVAL_REQUIRED execution_status=PENDING risk_score=%s",
                call.name,
                risk.risk_score,
            )
            return FirewallResult(
                decision="APPROVAL_REQUIRED",
                execution_status="PENDING",
                tool=call.name,
                risk_score=risk.risk_score,
                risk_level=risk.risk_level.value,
                reason=policy.reason,
                approval_required=True,
                pending_action_id=pending_id,
                approval_id=pending_id,
                policy_rule=policy.policy_rule,
                trust=trust,
            )

        logger.info(
            "tool=%s decision=BLOCK execution_status=BLOCKED risk_score=%s",
            call.name,
            risk.risk_score,
        )
        return FirewallResult(
            decision="BLOCK",
            execution_status="BLOCKED",
            tool=call.name,
            risk_score=risk.risk_score,
            risk_level=risk.risk_level.value,
            reason=policy.reason,
            policy_rule=policy.policy_rule,
            trust=trust,
        )


def evaluate_and_execute(
    tool_call: ProposedToolCall | dict[str, Any],
    context: dict[str, Any] | None = None,
) -> FirewallResult:
    return ActionFirewall().evaluate_and_execute(tool_call, context)


def _record_audit(
    call: ProposedToolCall,
    context: dict[str, Any],
    result: FirewallResult,
    snapshot: _EvalSnapshot,
) -> None:
    try:
        log_firewall_result(
            tool_name=call.name,
            arguments=call.arguments,
            context=context,
            decision=result.decision,
            execution_status=result.execution_status,
            reason=result.reason,
            approval_required=result.approval_required,
            trust=snapshot.trust,
            injection=snapshot.injection,
            risk=snapshot.risk,
            policy=snapshot.policy,
        )
    except Exception:
        logger.exception("Audit logging failed; security decision was not changed.")


def get_pending_action(pending_id: str) -> dict[str, Any] | None:
    from app.security.approval import get_approval

    item = get_approval(pending_id)
    if item is not None:
        dumped = item.model_dump(mode="json")
        dumped["tool"] = item.tool_name
        dumped["arguments"] = item.tool_arguments
        return dumped
    return _pending_actions.get(pending_id)


class _ExecOutcome:
    def __init__(self, result: Any | None = None, error: str | None = None) -> None:
        self.result = result
        self.error = error or ""

    @property
    def failed(self) -> bool:
        return bool(self.error)


def _run_registered_tool(name: str, arguments: dict[str, Any]) -> _ExecOutcome:
    cleaned = _schema_arguments(name, arguments)
    try:
        return _ExecOutcome(result=execute_tool(name, cleaned))
    except Exception:
        return _ExecOutcome(error="Tool execution failed.")


def _as_tool_call(tool_call: ProposedToolCall | dict[str, Any]) -> ProposedToolCall:
    if isinstance(tool_call, ProposedToolCall):
        return tool_call
    return ProposedToolCall(
        name=str(tool_call.get("name") or ""),
        arguments=tool_call.get("arguments") or {},
    )


def _is_forbidden_tool(name: str) -> bool:
    lowered = name.lower().replace(" ", "")
    return lowered in FORBIDDEN_TOOLS or any(token in lowered for token in ("os.system", "subprocess", "/bin/"))


def _validate_arguments(name: str, arguments: dict[str, Any]) -> str | None:
    if not isinstance(arguments, dict):
        return "Tool arguments must be an object."
    schema = TOOL_PARAMETERS.get(name, {"properties": {}, "required": []})
    properties = schema.get("properties") or {}
    for required in schema.get("required") or []:
        if required not in arguments or arguments[required] in (None, ""):
            return f"Missing required argument '{required}'."
    for key, spec in properties.items():
        if key not in arguments:
            continue
        expected = spec.get("type")
        value = arguments[key]
        if expected == "string" and not isinstance(value, str):
            return f"Argument '{key}' must be a string."
        if expected == "array" and not isinstance(value, list):
            return f"Argument '{key}' must be a list."
    return None


def _schema_arguments(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    properties = (TOOL_PARAMETERS.get(name) or {}).get("properties") or {}
    if not properties:
        return {}
    return {key: value for key, value in arguments.items() if key in properties}


def _validate_filesystem_path(name: str, arguments: dict[str, Any]) -> str | None:
    if name != "read_file":
        return None
    path = arguments.get("path")
    if not isinstance(path, str):
        return "Missing required argument 'path'."
    from app.tools.filesystem import FileSystemTool, PathEscapeError
    try:
        FileSystemTool()._resolve_inside_root(path)
    except PathEscapeError:
        return "Filesystem path is outside the controlled mock directory."
    except FileNotFoundError:
        return "Filesystem path is outside the controlled mock directory."
    return None


def _context_metadata(call: ProposedToolCall, context: dict[str, Any]) -> dict[str, Any]:
    metadata = {
        key: value
        for key, value in context.items()
        if key not in {"risk", "trust", "injection"}
    }
    metadata.setdefault("source_type", SourceType.USER)
    metadata.setdefault("tool", call.name)
    metadata.setdefault("action", call.name)
    if call.name == "read_file":
        metadata.setdefault("path", call.arguments.get("path"))
        metadata.setdefault("target", call.arguments.get("path"))
    if call.name == "send_email":
        metadata.setdefault("destination", call.arguments.get("recipient"))
    if call.name == "browse_url":
        metadata.setdefault("url", call.arguments.get("url"))
        metadata.setdefault("target", call.arguments.get("url"))
    return metadata


def _store_pending(
    call: ProposedToolCall,
    context: dict[str, Any],
    policy: PolicyDecision,
    risk: RiskAssessment,
    trust: TrustAssessment,
    injection: DetectionResult | None = None,
) -> str:
    payload = PendingAction(
        id=uuid4().hex,
        tool=call.name,
        arguments=call.arguments,
        context=context,
        policy=policy,
        risk=risk,
        trust=trust,
    )
    pending_id = payload.id
    _pending_actions[pending_id] = payload.model_dump(mode="json")
    try:
        from app.security.approval import create_approval_request

        created = create_approval_request(
            tool_name=call.name,
            arguments=call.arguments,
            context=context,
            policy=policy,
            risk=risk,
            trust=trust,
            injection=injection,
            reason=policy.reason,
        )
        _pending_actions.pop(pending_id, None)
        pending_id = created.id
        payload.id = pending_id
        _pending_actions[pending_id] = payload.model_dump(mode="json")
    except Exception:
        logger.exception("Failed to persist approval request; tool was not executed.")
    return pending_id


def _reject(tool: str, reason: str, snapshot: _EvalSnapshot | None = None) -> FirewallResult:
    is_shell = _is_forbidden_tool(tool)
    tool_lower = tool.lower()
    from app.security.policy_engine import PolicyDecision
    from app.security.risk_engine import RiskAssessment, RiskLevel

    if is_shell:
        score = 9.4
        level = RiskLevel.CRITICAL
        rule = "FORBIDDEN_EXECUTION_BLOCKED"
    elif "api" in tool_lower or "endpoint" in tool_lower:
        score = 8.8
        level = RiskLevel.HIGH
        rule = "UNAUTHORIZED_API_ACCESS"
    elif any(token in tool_lower for token in ("credential", "secret", "password", "key")):
        score = 9.0
        level = RiskLevel.CRITICAL
        rule = "UNTRUSTED_CREDENTIAL_ACCESS"
    elif any(token in tool_lower for token in ("recon", "system_prompt", "jailbreak")):
        score = 8.8
        level = RiskLevel.HIGH
        rule = "SYSTEM_RECONNAISSANCE_BLOCKED"
    elif "database" in tool_lower or "sql" in tool_lower:
        score = 9.2
        level = RiskLevel.CRITICAL
        rule = "UNAUTHORIZED_DATABASE_ACCESS"
    elif "outside the controlled" in reason.lower() or "traversal" in reason.lower():
        score = 8.5
        level = RiskLevel.HIGH
        rule = "PATH_TRAVERSAL_BLOCKED"
    elif reason.startswith("Missing") or "argument" in reason.lower():
        score = 5.0
        level = RiskLevel.MEDIUM
        rule = "INVALID_TOOL_PAYLOAD"
    else:
        score = 8.5
        level = RiskLevel.HIGH
        rule = "UNAUTHORIZED_TOOL_REQUEST"

    risk = RiskAssessment(
        risk_score=score,
        risk_level=level,
        factors=[f"rejected_tool:{tool}"],
        explanation=f"Firewall blocked execution: {reason}",
    )
    policy = PolicyDecision(
        decision=FirewallDecision.BLOCK,
        risk_score=score,
        risk_level=level,
        reason=reason,
        policy_rule=rule,
        requires_human_approval=False,
    )
    if snapshot is not None:
        snapshot.risk = risk
        snapshot.policy = policy

    logger.info("tool=%s decision=BLOCK execution_status=REJECTED risk_score=%s", tool, score)
    return FirewallResult(
        decision="BLOCK",
        execution_status="REJECTED",
        tool=tool,
        risk_score=score,
        risk_level=level.value,
        reason=reason,
        policy_rule=rule,
    )


def _trust_from_result(result: Any) -> TrustAssessment | None:
    if isinstance(result, dict) and result.get("trust"):
        return TrustAssessment.model_validate(result["trust"])
    return None


def _text_blob(arguments: dict[str, Any], metadata: dict[str, Any]) -> str:
    values: list[str] = []
    for item in (arguments, metadata.get("content")):
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
