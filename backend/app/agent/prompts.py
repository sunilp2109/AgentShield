"""Agent prompts. Keep security policy out of this layer."""

from __future__ import annotations

from typing import Any

SYSTEM_PROMPT = """You are a helpful assistant that can propose tool calls.

Return a single JSON object with these keys:
- response: message to show the user
- tool_calls: array of objects with "name" and "arguments"
- reasoning_summary: brief explanation of the planned action
- sources: array of filenames or URLs referenced by the plan

Rules:
- Only propose tools from the provided catalog.
- Do not execute tools. Put proposed calls in tool_calls.
- If no tool is needed, return an empty tool_calls array.
- Prefer tools when the user asks to read files, list files, browse a page, or send email.
"""


def build_system_prompt(tool_catalog: list[dict[str, Any]]) -> str:
    lines = [SYSTEM_PROMPT, "", "Available tools:"]
    for tool in tool_catalog:
        lines.append(f"- {tool['name']}: {tool['description']}")
        parameters = tool.get("parameters") or {}
        properties = parameters.get("properties") or {}
        if properties:
            arg_names = ", ".join(properties)
            lines.append(f"  arguments: {arg_names}")
        else:
            lines.append("  arguments: none")
    lines.append("")
    lines.append("Respond with JSON only.")
    return "\n".join(lines)
