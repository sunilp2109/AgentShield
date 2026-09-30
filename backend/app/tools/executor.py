"""Low-level registered-tool runner.

The agent graph must not import this module. Production authorization goes
through app.security.firewall before this helper is allowed to run a tool.
"""

from __future__ import annotations

from typing import Any

from app.agent.state import ProposedToolCall
from app.security.trust_engine import TrustAssessment, assess_tool_result
from app.tools.registry import get_tool


def execute_tool(name: str, arguments: dict[str, Any] | None = None) -> dict[str, Any]:
    spec = get_tool(name)
    payload = arguments or {}
    result = spec.handler(**payload)
    dumped = result.model_dump(mode="json") if hasattr(result, "model_dump") else result
    if not isinstance(dumped, dict):
        dumped = {"value": dumped}
    return _ensure_trust(name, payload, dumped)


def execute_tool_calls(tool_calls: list[ProposedToolCall]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for call in tool_calls:
        results.append(
            {
                "name": call.name,
                "arguments": call.arguments,
                "result": execute_tool(call.name, call.arguments),
            }
        )
    return results


def _ensure_trust(name: str, arguments: dict[str, Any], payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("trust"):
        TrustAssessment.model_validate(payload["trust"])
        return payload
    metadata = {**arguments, **payload, "tool": name}
    payload["trust"] = assess_tool_result(name, metadata).model_dump(mode="json")
    return payload
