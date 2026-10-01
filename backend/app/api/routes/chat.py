import json
from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agent.agent import run_agent
from app.agent.provider import get_agent_provider, infer_probing_or_unauthorized_call, is_greeting
from app.agent.state import ProposedToolCall
from app.agent.tool_adapter import build_tool_catalog
from app.security.audit import log_chat_turn
from app.security.detector import Detector
from app.security.gateway import ToolRun, dispatch_tool_calls
from app.security.state import shield_state
from app.security.trust_engine import SourceType

router = APIRouter()
_detector = Detector()

_SECRET_MARKERS = (
    "sk_live",
    "sk_test",
    "password",
    "CONFIDENTIAL - INTERNAL ONLY",
    "api_key",
    "bearer ",
)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1)
    session_id: str | None = None


class ChatResponse(BaseModel):
    response: str
    tool_calls: list[ProposedToolCall]
    tool_results: list[ToolRun] = Field(default_factory=list)
    reasoning_summary: str = ""
    sources: list[str] = Field(default_factory=list)
    session_id: str
    request_id: str
    shield_enabled: bool


@router.post("/chat", response_model=ChatResponse)
def chat(payload: ChatRequest) -> ChatResponse:
    request_id = uuid4().hex
    turn = run_agent(payload.message, session_id=payload.session_id)
    effective_tool_calls = list(turn.tool_calls)
    if not effective_tool_calls and not is_greeting(payload.message):
        effective_tool_calls.append(infer_probing_or_unauthorized_call(payload.message))

    context = {
        "user_intent": payload.message,
        "request_id": request_id,
        "session_id": turn.session_id,
    }
    tool_results = dispatch_tool_calls(
        effective_tool_calls,
        session_id=turn.session_id,
        context=context,
    )
    follow_calls, follow_results, follow_up_summary = _continue_from_documents(
        payload.message,
        turn.session_id,
        request_id,
        effective_tool_calls,
        tool_results,
    )
    all_calls = [_public_tool_call(call) for call in (*effective_tool_calls, *follow_calls)]
    all_results = [_public_tool_run(item) for item in (*tool_results, *follow_results)]
    response_text = _build_response(turn.response, payload.message, all_results, follow_up_summary)

    # Always log the prompt so every chat turn shows up in audit logs,
    # even when the agent responds conversationally without invoking any tools.
    tool_calls_made = bool(all_calls)
    if not tool_calls_made:
        # No tool calls → no firewall events → nothing logged yet; create one now.
        log_chat_turn(
            user_message=payload.message,
            session_id=turn.session_id,
            request_id=request_id,
            tool_calls_made=False,
        )
    else:
        # Tool calls were made; firewall already logged events, but we still
        # want a top-level chat row that carries the full prompt.
        log_chat_turn(
            user_message=payload.message,
            session_id=turn.session_id,
            request_id=request_id,
            tool_calls_made=True,
        )

    return ChatResponse(
        response=response_text,
        tool_calls=all_calls,
        tool_results=all_results,
        reasoning_summary=turn.reasoning_summary,
        sources=list(dict.fromkeys([*turn.sources, *(_sources_from_calls(follow_calls))])),
        session_id=turn.session_id,
        request_id=request_id,
        shield_enabled=shield_state.shield_enabled,
    )


def _continue_from_documents(
    user_intent: str,
    session_id: str,
    request_id: str,
    original_calls: list[ProposedToolCall],
    tool_results: list[ToolRun],
) -> tuple[list[ProposedToolCall], list[ToolRun], str]:
    seen = {_tool_key(call) for call in original_calls}
    extra_calls: list[ProposedToolCall] = []
    extra_results: list[ToolRun] = []
    follow_up_summary = ""
    provider = get_agent_provider()
    catalog = build_tool_catalog()

    for run in tool_results:
        if run.name != "read_file" or run.execution_status != "EXECUTED":
            continue
        path, content = _read_payload(run)
        if not path or not content:
            continue
        plan = provider.plan(
            [
                {"role": "user", "content": user_intent},
                {"role": "tool", "name": path, "content": content},
            ],
            catalog,
        )
        if plan.response and not plan.response.startswith("I will use"):
            follow_up_summary = plan.response

        new_calls = [call for call in plan.tool_calls if _tool_key(call) not in seen]
        if not new_calls:
            continue
        document_context = {
            "user_intent": user_intent,
            "request_id": request_id,
            "session_id": session_id,
            "filename": path,
            "source_name": path,
            "source_type": SourceType.PDF if path.lower().endswith(".pdf") else SourceType.LOCAL_PRIVATE_FILE,
            "content": content,
        }
        dispatched = dispatch_tool_calls(new_calls, session_id=session_id, context=document_context)
        extra_calls.extend(new_calls)
        extra_results.extend(dispatched)
        for call in new_calls:
            seen.add(_tool_key(call))
    return extra_calls, extra_results, follow_up_summary


def _tool_key(call: ProposedToolCall) -> str:
    return json.dumps({"name": call.name, "arguments": call.arguments}, sort_keys=True, default=str)


def _read_payload(run: ToolRun) -> tuple[str, str]:
    payload = run.result if isinstance(run.result, dict) else {}
    path = str(payload.get("path") or run.arguments.get("path") or "")
    content = str(payload.get("content") or "")
    return path, content


def _build_response(planned: str, user_message: str, results: list[ToolRun], follow_up: str = "") -> str:
    """Produce a rich, natural-language reply that reflects what actually happened."""
    has_block = any(item.decision == "BLOCK" for item in results)
    has_approval = any(item.decision == "APPROVAL_REQUIRED" or item.approval_required for item in results)

    # If the LLM already returned a non-trivial planned response, prefer it
    planned_clean = (planned or "").strip()

    if has_block and has_approval:
        # Mixed: some approved-pending, some blocked
        blocked = [r for r in results if r.decision == "BLOCK"]
        pending = [r for r in results if r.decision == "APPROVAL_REQUIRED"]
        tool_name = blocked[0].name.replace("_", " ") if blocked else "action"
        pending_name = pending[0].name.replace("_", " ") if pending else "action"
        return (
            f"I encountered two security decisions. "
            f"The **{tool_name}** was blocked because it violates security policy and cannot proceed. "
            f"The **{pending_name}** requires your approval before I can continue."
        )

    if has_block:
        blocked = [r for r in results if r.decision == "BLOCK"]
        item = blocked[0]
        tool_name = item.name.replace("_", " ")
        reason = item.reasons[0] if item.reasons else ""
        risk_info = ""
        if item.risk_level and item.risk_score is not None:
            risk_info = f" (CVSS {item.risk_score} - {item.risk_level})"

        is_recon_or_probing = (
            any(
                token in item.name.lower()
                for token in ("api", "credential", "shell", "recon", "database", "unauthorized")
            )
            or any(
                token in user_message.lower()
                for token in (
                    "api",
                    "apis",
                    "endpoint",
                    "endpoints",
                    "backend",
                    "token",
                    "secret",
                    "password",
                    "credential",
                    "bash",
                    "shell",
                    "exec",
                    "whoami",
                )
            )
            or reason == "Tool is not registered with AgentShield."
        )
        if is_recon_or_probing:
            return (
                f"AgentShield blocked malicious activities{risk_info}. "
                "Unauthorized requests for internal APIs, backend endpoints, system credentials, "
                "or unapproved operations are strictly blocked by security policy. "
                "No data was accessed or transmitted."
            )

        if reason and not reason.startswith("Missing"):
            return (
                f"I wasn't able to complete that request. "
                f"AgentShield blocked the **{tool_name}** operation{risk_info} — {reason.rstrip('.')}. "
                "No data was accessed or transmitted."
            )
        return (
            f"I couldn't complete that action. "
            f"The **{tool_name}** operation was blocked by AgentShield's security policy{risk_info}. "
            "No data was accessed or transmitted."
        )

    if has_approval:
        pending = [r for r in results if r.decision == "APPROVAL_REQUIRED" or r.approval_required]
        item = pending[0]
        tool_name = item.name.replace("_", " ")
        target = item.arguments.get("recipient") or item.arguments.get("path") or item.arguments.get("url") or ""
        risk_info = ""
        if item.risk_level and item.risk_score is not None:
            risk_info = f" CVSS score is **{item.risk_score}** ({item.risk_level})."
        target_info = f" to **{target}**" if target else ""
        return (
            f"I've prepared the **{tool_name}**{target_info}, but I need your approval before proceeding. "
            f"This action involves sensitive information or an external destination.{risk_info} "
            "Please review the security card below and approve or reject."
        )

    # If a follow-up answer or summary was generated by the LLM after tool execution, prefer it
    if follow_up.strip() and not follow_up.strip().startswith("I will use"):
        return follow_up.strip()

    # All allowed or bypass — build a useful summary
    executed = [r for r in results if r.execution_status == "EXECUTED"]
    if not executed:
        # No tools ran — use greeting or security response
        if is_greeting(user_message):
            return (
                "Hello! I am an AI assistant protected by **AgentShield**. "
                "I can help you read and summarize documents, browse authorized web pages, "
                "or draft emails under real-time security inspection and CVSS risk evaluation. "
                "How can I help you today?"
            )
        if shield_state.shield_enabled:
            return (
                "AgentShield blocked malicious activities. "
                "Unauthorized requests for internal APIs, backend endpoints, system credentials, "
                "or unapproved operations are strictly blocked by security policy. "
                "No data was accessed or transmitted."
            )
        if planned_clean:
            return planned_clean
        return "I'm here to help. You can ask me to read files, summarize documents, browse websites, or draft and send emails."

    # Build response from executed tool results
    parts: list[str] = []
    user_lower = user_message.lower()
    for item in executed:
        if item.name == "read_file":
            path, content = _read_payload(item)
            if content and not _must_hide(content):
                lines = [l.strip() for l in content.strip().splitlines() if l.strip()]
                preview = " ".join(lines)[:600]
                filename = path or "the file"
                parts.append(f"I read **{filename}**. Here is the content:\n\n{preview}")
            elif content:
                filename = path or "the file"
                parts.append(f"I read **{filename}**, but the content was redacted by security policy.")
            else:
                parts.append(f"I opened the file, but it appears to be empty.")

        elif item.name == "browse_url":
            url = item.arguments.get("url", "the page")
            result = item.result or {}
            browse_content = ""
            if isinstance(result, dict):
                browse_content = str(result.get("content") or result.get("text") or "")
            if browse_content and not _must_hide(browse_content):
                preview = browse_content.strip()[:500]
                parts.append(f"I browsed **{url}** and retrieved the following:\n\n{preview}")
            else:
                parts.append(f"I browsed **{url}**, but couldn't retrieve readable content.")

        elif item.name == "send_email":
            recipient = item.arguments.get("recipient", "the recipient")
            parts.append(f"The email has been sent to **{recipient}** successfully.")

        elif item.name == "list_files":
            wants_list = any(w in user_lower for w in ("list", "what files", "which files", "show files", "available files", "all files"))
            if wants_list or len(executed) == 1:
                result = item.result or {}
                if isinstance(result, dict):
                    files = result.get("files") or []
                    if files:
                        file_list = "\n".join(f"- {f}" for f in files)
                        parts.append(f"Here are the files available:\n\n{file_list}")
                    else:
                        parts.append("No files were found in the directory.")
                else:
                    parts.append("File listing completed.")

    if parts:
        return "\n\n".join(parts)

    # Fallback to LLM's planned response
    if planned_clean:
        return planned_clean
    return "I finished processing that request."


def _public_tool_call(call: ProposedToolCall) -> ProposedToolCall:
    arguments = dict(call.arguments or {})
    for key in ("body", "note", "content"):
        value = arguments.get(key)
        if isinstance(value, str) and _must_hide(value):
            arguments[key] = "[redacted]"
    return ProposedToolCall(name=call.name, arguments=arguments)


def _public_tool_run(run: ToolRun) -> ToolRun:
    payload = run.model_dump()
    result = payload.get("result")
    if isinstance(result, dict) and isinstance(result.get("content"), str) and _must_hide(result["content"]):
        result = {**result, "content": "[redacted]"}
        payload["result"] = result
    arguments = payload.get("arguments") or {}
    if isinstance(arguments.get("body"), str) and _must_hide(arguments["body"]):
        payload["arguments"] = {**arguments, "body": "[redacted]"}
    return ToolRun.model_validate(payload)


def _must_hide(text: str) -> bool:
    lower = text.lower()
    if _detector.detect(text).is_injection:
        return True
    return any(marker.lower() in lower for marker in _SECRET_MARKERS)


def _sources_from_calls(calls: list[ProposedToolCall]) -> list[str]:
    sources: list[str] = []
    for call in calls:
        path = call.arguments.get("path") or call.arguments.get("url")
        if path:
            sources.append(str(path))
    return sources