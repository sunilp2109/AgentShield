import json
from uuid import uuid4

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.agent.agent import run_agent
from app.agent.provider import get_agent_provider
from app.agent.state import ProposedToolCall
from app.agent.tool_adapter import build_tool_catalog
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
    context = {
        "user_intent": payload.message,
        "request_id": request_id,
        "session_id": turn.session_id,
    }
    tool_results = dispatch_tool_calls(
        turn.tool_calls,
        session_id=turn.session_id,
        context=context,
    )
    follow_calls, follow_results = _continue_from_documents(
        payload.message,
        turn.session_id,
        request_id,
        turn.tool_calls,
        tool_results,
    )
    all_calls = [_public_tool_call(call) for call in (*turn.tool_calls, *follow_calls)]
    all_results = [_public_tool_run(item) for item in (*tool_results, *follow_results)]
    return ChatResponse(
        response=_assistant_text(turn.response, all_results),
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
) -> tuple[list[ProposedToolCall], list[ToolRun]]:
    seen = {_tool_key(call) for call in original_calls}
    extra_calls: list[ProposedToolCall] = []
    extra_results: list[ToolRun] = []
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
    return extra_calls, extra_results


def _tool_key(call: ProposedToolCall) -> str:
    return json.dumps({"name": call.name, "arguments": call.arguments}, sort_keys=True, default=str)


def _read_payload(run: ToolRun) -> tuple[str, str]:
    payload = run.result if isinstance(run.result, dict) else {}
    path = str(payload.get("path") or run.arguments.get("path") or "")
    content = str(payload.get("content") or "")
    return path, content


def _assistant_text(planned: str, results: list[ToolRun]) -> str:
    if any(item.decision == "BLOCK" for item in results):
        return (
            "I couldn't complete that action because the requested operation was blocked "
            "by the application's security controls."
        )
    if any(item.decision == "APPROVAL_REQUIRED" or item.approval_required for item in results):
        return "I need a human to approve this action before I can continue."
    summaries: list[str] = []
    for item in results:
        if item.name != "read_file" or item.execution_status != "EXECUTED":
            continue
        _path, content = _read_payload(item)
        if not content or _must_hide(content):
            continue
        summaries.append(content.strip().splitlines()[0][:180])
    if summaries:
        return "Here is the summary:\n" + "\n".join(summaries)
    return planned or "I finished processing that request."


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
