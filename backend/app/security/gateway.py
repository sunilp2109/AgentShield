from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from app.agent.state import ProposedToolCall
from app.security.firewall import FirewallResult, evaluate_and_execute
from app.security.trust_engine import TrustAssessment


class ToolRun(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    shield_applied: bool
    decision: str | None = None
    status: str
    result: Any | None = None
    reasons: list[str] = Field(default_factory=list)
    stage: str | None = None
    trust: TrustAssessment | None = None
    execution_status: str | None = None
    approval_required: bool = False
    approval_id: str | None = None
    risk_score: float | None = None
    risk_level: str | None = None


def dispatch_tool_calls(
    tool_calls: list[ProposedToolCall],
    *,
    session_id: str = "default",
    context: dict[str, Any] | None = None,
) -> list[ToolRun]:
    """Run proposed tool calls through the Action Firewall."""
    shared = {"session_id": session_id, **(context or {})}
    shared.setdefault("request_id", uuid4().hex)
    return [
        dispatch_tool_call(call, session_id=session_id, context=shared) for call in tool_calls
    ]


def dispatch_tool_call(
    call: ProposedToolCall,
    *,
    session_id: str = "default",
    context: dict[str, Any] | None = None,
) -> ToolRun:
    payload = {"session_id": session_id, **(context or {})}
    payload.setdefault("request_id", uuid4().hex)
    result = evaluate_and_execute(call, payload)
    return _to_tool_run(call, result)


def _to_tool_run(call: ProposedToolCall, result: FirewallResult) -> ToolRun:
    status_map = {
        "EXECUTED": "executed",
        "PENDING": "approval_required",
        "BLOCKED": "blocked",
        "REJECTED": "blocked",
        "FAILED": "failed",
    }
    reasons = [result.reason] if result.reason else []
    if result.policy_rule:
        reasons.append(result.policy_rule)
    return ToolRun(
        name=call.name,
        arguments=call.arguments,
        shield_applied=result.decision != "BYPASS",
        decision=result.decision,
        status=status_map.get(result.execution_status, result.execution_status.lower()),
        result=result.result,
        reasons=reasons,
        stage="action_firewall",
        trust=result.trust,
        execution_status=result.execution_status,
        approval_required=result.approval_required,
        approval_id=result.approval_id or result.pending_action_id,
        risk_score=result.risk_score,
        risk_level=result.risk_level,
    )
