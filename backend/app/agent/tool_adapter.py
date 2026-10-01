"""Convert registered tools into LLM-facing catalog entries.

This adapter describes tools. It does not execute them.
"""

from __future__ import annotations

from typing import Any

from app.agent.state import ProposedToolCall
from app.tools.registry import TOOL_REGISTRY
from app.tools.schemas import TOOL_PARAMETERS


def build_tool_catalog() -> list[dict[str, Any]]:
    catalog: list[dict[str, Any]] = []
    for name, spec in TOOL_REGISTRY.items():
        catalog.append(
            {
                "name": name,
                "description": spec.description,
                "parameters": TOOL_PARAMETERS.get(
                    name,
                    {"type": "object", "properties": {}},
                ),
            }
        )
    return catalog


def registered_tool_names() -> set[str]:
    return set(TOOL_REGISTRY)


def normalize_tool_calls(raw_calls: list[Any], *, allow_unregistered: bool = True) -> list[ProposedToolCall]:
    allowed = registered_tool_names()
    normalized: list[ProposedToolCall] = []
    for item in raw_calls:
        if isinstance(item, ProposedToolCall):
            call = item
        elif isinstance(item, dict):
            call = ProposedToolCall(
                name=str(item.get("name", "")),
                arguments=item.get("arguments") or {},
            )
        else:
            continue
        if not call.name.strip():
            continue
        if not allow_unregistered and call.name not in allowed:
            continue
        if not isinstance(call.arguments, dict):
            call.arguments = {}
        normalized.append(call)
    return normalized
