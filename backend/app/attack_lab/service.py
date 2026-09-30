"""Run Attack Lab scenarios through the existing AgentShield pipeline."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from app.agent.agent import run_agent
from app.attack_lab.scenarios import AttackScenario, get_scenario, to_public
from app.security.audit import get_events
from app.security.firewall import FirewallResult, evaluate_and_execute
from app.security.state import shield_state
from app.tools.registry import TOOL_REGISTRY

_DECISION_RANK = {
    "BLOCK": 40,
    "APPROVAL_REQUIRED": 30,
    "BYPASS": 20,
    "ALLOW": 10,
}


class ToolAttemptOut(BaseModel):
    name: str
    label: str
    attempted: bool = True
    decision: str | None = None
    execution_status: str | None = None
    executed: bool = False
    approval_id: str | None = None
    result_summary: str | None = None
    reason: str | None = None


class PipelineStageOut(BaseModel):
    trust_level: str | None = None
    injection_detected: bool | None = None
    injection_confidence: float | None = None
    risk_score: int | None = None
    risk_level: str | None = None
    policy_decision: str | None = None
    firewall_decision: str | None = None
    tool_executed: bool | None = None


class AttackRunResult(BaseModel):
    scenario_id: str
    name: str
    payload: str
    source_type: str
    source_name: str
    shield_enabled: bool
    session_id: str
    request_id: str
    injection_detected: bool = False
    injection_confidence: float = 0.0
    risk_score: int | None = None
    risk_level: str | None = None
    policy_decision: str | None = None
    firewall_decision: str | None = None
    execution_status: str | None = None
    tool_execution: bool = False
    approval_created: bool = False
    approval_id: str | None = None
    audit_event_id: str | None = None
    audit_event_ids: list[str] = Field(default_factory=list)
    reason: str | None = None
    pipeline: PipelineStageOut = Field(default_factory=PipelineStageOut)
    tools: list[ToolAttemptOut] = Field(default_factory=list)
    agent_response: str | None = None


def run_scenario(scenario_id: str) -> AttackRunResult | None:
    scenario = get_scenario(scenario_id)
    if scenario is None:
        return None

    request_id = f"req_attack_{uuid4().hex[:12]}"
    session_id = f"attack-lab-{scenario.id}"
    public = to_public(scenario)

    turn = run_agent(
        f"{scenario.user_intent}\n\n[Untrusted content from {scenario.source_name}]\n{scenario.payload}",
        session_id=session_id,
    )

    context: dict[str, Any] = {
        "session_id": session_id,
        "request_id": request_id,
        "source_type": scenario.source_type,
        "filename": scenario.source_name,
        "user_intent": scenario.user_intent,
        "content": scenario.payload,
    }

    firewall_results: list[FirewallResult] = []
    attempts: list[ToolAttemptOut] = []
    for call in scenario.tool_calls:
        if call.name not in TOOL_REGISTRY:
            attempts.append(
                ToolAttemptOut(
                    name=call.name,
                    label=_tool_label(call),
                    attempted=True,
                    decision="BLOCK",
                    execution_status="REJECTED",
                    executed=False,
                    reason="Tool is not registered with AgentShield.",
                )
            )
            continue
        result = evaluate_and_execute(call, context)
        firewall_results.append(result)
        executed = result.execution_status == "EXECUTED" and result.result is not None
        attempts.append(
            ToolAttemptOut(
                name=call.name,
                label=_tool_label(call),
                attempted=True,
                decision=result.decision,
                execution_status=result.execution_status,
                executed=executed,
                approval_id=result.approval_id or result.pending_action_id,
                result_summary=_safe_result_summary(result),
                reason=result.reason or None,
            )
        )

    events = [
        event
        for event in get_events(session_id=session_id, limit=50)
        if event.request_id == request_id
    ]
    primary = _primary_result(firewall_results, events)
    injection = any(event.injection_detected for event in events)
    confidence = max((event.injection_confidence for event in events), default=0.0)
    approval = next((item.approval_id for item in attempts if item.approval_id), None)
    tool_execution = any(item.executed for item in attempts)
    public_source = public.source_type
    audit_ids = [event.id for event in events]

    return AttackRunResult(
        scenario_id=scenario.id,
        name=scenario.name,
        payload=scenario.payload,
        source_type=public_source,
        source_name=scenario.source_name,
        shield_enabled=shield_state.shield_enabled,
        session_id=session_id,
        request_id=request_id,
        injection_detected=bool(injection),
        injection_confidence=float(confidence),
        risk_score=primary.get("risk_score"),
        risk_level=primary.get("risk_level"),
        policy_decision=primary.get("policy_decision"),
        firewall_decision=primary.get("firewall_decision"),
        execution_status=primary.get("execution_status"),
        tool_execution=tool_execution,
        approval_created=bool(approval),
        approval_id=approval,
        audit_event_id=audit_ids[0] if audit_ids else None,
        audit_event_ids=audit_ids,
        reason=primary.get("reason"),
        pipeline=PipelineStageOut(
            trust_level=primary.get("trust_level"),
            injection_detected=bool(injection) if events or firewall_results else None,
            injection_confidence=float(confidence) if injection else (0.0 if events else None),
            risk_score=primary.get("risk_score"),
            risk_level=primary.get("risk_level"),
            policy_decision=primary.get("policy_decision"),
            firewall_decision=primary.get("firewall_decision"),
            tool_executed=tool_execution,
        ),
        tools=attempts,
        agent_response=turn.response or None,
    )


def _primary_result(results: list[FirewallResult], events: list[Any]) -> dict[str, Any]:
    if results:
        chosen = max(results, key=lambda item: _DECISION_RANK.get(item.decision, 0))
        matching = next((event for event in events if event.tool_name == chosen.tool), events[0] if events else None)
        trust_level = None
        if chosen.trust is not None:
            trust_level = getattr(chosen.trust.trust_level, "value", chosen.trust.trust_level)
        elif matching is not None:
            trust_level = matching.trust_level
        return {
            "firewall_decision": chosen.decision,
            "execution_status": chosen.execution_status,
            "risk_score": chosen.risk_score if chosen.risk_score is not None else getattr(matching, "risk_score", None),
            "risk_level": chosen.risk_level if chosen.risk_level is not None else getattr(matching, "risk_level", None),
            "policy_decision": getattr(matching, "policy_decision", None) or chosen.decision,
            "reason": chosen.reason,
            "trust_level": trust_level,
        }
    if events:
        event = events[0]
        return {
            "firewall_decision": event.firewall_decision,
            "execution_status": event.execution_status,
            "risk_score": event.risk_score,
            "risk_level": event.risk_level,
            "policy_decision": event.policy_decision,
            "reason": event.block_reason,
            "trust_level": event.trust_level,
        }
    return {}


def _tool_label(call: Any) -> str:
    arguments = getattr(call, "arguments", None) or {}
    name = getattr(call, "name", "")
    if name == "read_file":
        path = str(arguments.get("path") or "file")
        return f"read {path}"
    if name == "send_email":
        return "send_email"
    if name == "browse_url":
        return "browse_url"
    return str(name)


def _safe_result_summary(result: FirewallResult) -> str | None:
    if result.result is None:
        return None
    payload = result.result
    if isinstance(payload, dict):
        status = payload.get("status")
        if status == "simulated":
            return "simulated"
        if status:
            return str(status)
        if "content" in payload:
            return "mock file content returned"
        if "url" in payload:
            return "simulated page opened"
    return "mock tool returned a result"
