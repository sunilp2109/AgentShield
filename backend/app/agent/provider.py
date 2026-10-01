"""LLM provider abstraction used by the agent.

Switch providers with LLM_PROVIDER. Credentials come from the environment.
No vendor SDK is required; HTTP providers use OpenAI-compatible chat completions.
"""

from __future__ import annotations

import json
import re
from typing import Any, Protocol

import httpx

from app.agent.prompts import build_system_prompt
from app.agent.state import AgentPlan, ProposedToolCall
from app.agent.tool_adapter import normalize_tool_calls
from app.config import settings

PROVIDER_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "groq": "https://api.groq.com/openai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
}
DEFAULT_MODELS = {
    "openai": "gpt-4o-mini",
    "groq": "openai/gpt-oss-120b",
    "openrouter": "openai/gpt-4o-mini",
}

KNOWN_FILES = (
    "invoice.pdf",
    "project-report.pdf",
    "invoice.txt",
    "report.txt",
    "confidential.txt",
    "employee_data.txt",
)
URL_RE = re.compile(r"https?://[^\s]+", re.IGNORECASE)
EMAIL_RE = re.compile(r"[\w.+-]+@[\w.-]+\.\w+")
FILE_RE = re.compile(r"\b[\w.-]+\.(?:txt|pdf)\b", re.IGNORECASE)


class AgentProvider(Protocol):
    name: str

    def plan(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> AgentPlan:
        """Return a structured plan. Must not execute tools."""
        ...


class MockAgentProvider:
    name = "mock"

    def plan(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> AgentPlan:
        user_message = _last_user_message(messages)
        document_text = _untrusted_document_text(messages)
        tool_calls = _infer_tool_calls(user_message, extra=document_text)
        sources = _sources_from_calls(tool_calls)
        if tool_calls:
            names = ", ".join(call.name for call in tool_calls)
            response = f"I will use {names} to help with that request."
            reasoning = f"The latest user message maps to tool(s): {names}."
        else:
            if is_greeting(user_message):
                response = (
                    "Hello! I am an AI assistant protected by **AgentShield**. "
                    "I can help you read and summarize documents, browse authorized web pages, "
                    "or draft emails under real-time security inspection and CVSS risk evaluation. "
                    "How can I help you today?"
                )
                reasoning = "User provided a conversational greeting."
            else:
                response = (
                    "AgentShield blocked malicious activities: unauthorized request or unapproved execution "
                    "is prohibited by security policy."
                )
                reasoning = "Unrecognized or unauthorized execution request intercepted."
        return AgentPlan(
            response=response,
            tool_calls=tool_calls,
            reasoning_summary=reasoning,
            sources=sources,
        )


class OpenAICompatibleProvider:
    name = "openai_compatible"

    def __init__(self, api_key: str, model: str, base_url: str, provider_name: str) -> None:
        self.api_key = api_key
        self.model = model
        self.base_url = base_url.rstrip("/")
        self.name = provider_name

    @classmethod
    def from_settings(cls) -> OpenAICompatibleProvider:
        provider_name = settings.llm_provider.strip().lower() or "openai"
        api_key = settings.llm_api_key.strip()
        if not api_key:
            raise RuntimeError(
                f"LLM_API_KEY is required when LLM_PROVIDER={provider_name}."
            )
        base_url = settings.llm_base_url.strip() or PROVIDER_BASE_URLS.get(
            provider_name,
            PROVIDER_BASE_URLS["openai"],
        )
        model = settings.llm_model.strip() or DEFAULT_MODELS.get(provider_name, "gpt-4o-mini")
        return cls(
            api_key=api_key,
            model=model,
            base_url=base_url,
            provider_name=provider_name,
        )

    def plan(self, messages: list[dict[str, Any]], tools: list[dict[str, Any]]) -> AgentPlan:
        payload = {
            "model": self.model,
            "temperature": 0.2,
            "messages": [
                {"role": "system", "content": build_system_prompt(tools)},
                *_provider_messages(messages),
            ],
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        url = f"{self.base_url}/chat/completions"
        response = httpx.post(
            url,
            headers=headers,
            json={**payload, "response_format": {"type": "json_object"}},
            timeout=60.0,
        )
        if response.status_code >= 400:
            response = httpx.post(url, headers=headers, json=payload, timeout=60.0)
        response.raise_for_status()
        message = response.json()["choices"][0]["message"]
        return _plan_from_completion(message)


def get_agent_provider() -> AgentProvider:
    name = (settings.llm_provider or "mock").strip().lower()
    if name in {"mock", "none", ""}:
        return MockAgentProvider()
    return OpenAICompatibleProvider.from_settings()


def parse_agent_plan(raw: str) -> AgentPlan:
    data = _loads_json_object(raw)
    calls = normalize_tool_calls(data.get("tool_calls") or [])
    sources = data.get("sources") or _sources_from_calls(calls)
    if not isinstance(sources, list):
        sources = []
    return AgentPlan(
        response=str(data.get("response") or ""),
        tool_calls=calls,
        reasoning_summary=str(data.get("reasoning_summary") or ""),
        sources=[str(item) for item in sources],
    )


def _last_user_message(messages: list[dict[str, Any]]) -> str:
    for message in reversed(messages):
        if message.get("role") == "user":
            return str(message.get("content") or "")
    return ""


def _untrusted_document_text(messages: list[dict[str, Any]]) -> str:
    chunks: list[str] = []
    for message in messages:
        if message.get("role") in {"tool", "document", "tool_result"}:
            chunks.append(str(message.get("content") or ""))
    return "\n".join(chunks)


def _call_key(call: ProposedToolCall) -> str:
    return json.dumps({"name": call.name, "arguments": call.arguments}, sort_keys=True, default=str)


GREETING_WORDS = frozenset(
    {
        "hi",
        "hello",
        "hey",
        "howdy",
        "greetings",
        "help",
        "thanks",
        "thank you",
        "ok",
        "okay",
        "bye",
        "goodbye",
    }
)

GREETING_PATTERNS = (
    r"^(hi|hello|hey|howdy|greetings)\b",
    r"^good\s+(morning|afternoon|evening|day)\b",
    r"^(what'?s\s+up|sup|yo)\b",
    r"^(who\s+are\s+you|what\s+are\s+you|what\s+can\s+you\s+do|how\s+can\s+you\s+help)\b",
    r"^(help|what\s+is\s+agentshield|tell\s+me\s+about\s+yourself|how\s+does\s+this\s+work)\b",
)


def is_greeting(text: str) -> bool:
    cleaned = re.sub(r"[^\w\s]", "", text.strip().lower())
    if not cleaned:
        return True
    if any(
        token in cleaned.split() or token in cleaned
        for token in (
            "api",
            "apis",
            "endpoint",
            "endpoints",
            "key",
            "keys",
            "token",
            "tokens",
            "password",
            "passwords",
            "secret",
            "secrets",
            "credential",
            "credentials",
            "shell",
            "bash",
            "cmd",
            "exec",
            "database",
            "sql",
            "drop",
            "delete",
            "hack",
            "bypass",
            "jailbreak",
            "prompt",
            "override",
            "exfiltrate",
        )
    ):
        return False
    if cleaned in GREETING_WORDS:
        return True
    return any(re.search(pat, cleaned) for pat in GREETING_PATTERNS)


def _infer_probing_or_unauthorized_call(message: str) -> ProposedToolCall:
    lower = message.lower()
    clean_msg = message.strip()[:300]

    if any(
        token in lower
        for token in (
            "shell",
            "bash",
            "powershell",
            "cmd",
            "exec",
            "terminal",
            "os.system",
            "subprocess",
            "eval(",
            "exec(",
            "sh ",
            "sudo",
        )
    ):
        return ProposedToolCall(name="run_shell", arguments={"command": clean_msg})

    if any(
        token in lower
        for token in (
            "api_key",
            "api key",
            "apikey",
            "secret",
            "password",
            "credential",
            "private key",
            "id_rsa",
            "bearer",
            "auth token",
            "access token",
            "env var",
            "credentials",
            "secrets",
            "passwords",
            "token",
            "tokens",
            "keys",
        )
    ) or (
        re.search(r"\bkey\b", lower)
        and not re.search(r"\bkey\s+(findings?|takeaways?|points?|policies)\b", lower)
    ):
        return ProposedToolCall(
            name="credential_access",
            arguments={"target": "system_credentials", "query": clean_msg},
        )

    if any(
        token in lower
        for token in (
            "api",
            "apis",
            "endpoint",
            "endpoints",
            "backend",
            "swagger",
            "openapi",
            "rest api",
            "webhook",
            "routes",
            "route",
        )
    ):
        return ProposedToolCall(
            name="api_access",
            arguments={"action": "query_api_details", "query": clean_msg},
        )

    if any(
        token in lower
        for token in (
            "database",
            "sql",
            "drop table",
            "select *",
            "truncate",
            "query database",
            "dump database",
            "nosql",
            "postgres",
            "sqlite",
        )
    ):
        return ProposedToolCall(name="database_query", arguments={"query": clean_msg})

    if any(
        token in lower
        for token in (
            "system prompt",
            "jailbreak",
            "bypass",
            "override",
            "hack",
            "exploit",
            "developer mode",
            "ignore previous",
            "ignore all instructions",
            "instructions prompt",
        )
    ):
        return ProposedToolCall(
            name="system_reconnaissance",
            arguments={"target": "system_internals", "query": clean_msg},
        )

    return ProposedToolCall(name="unauthorized_execution", arguments={"action": clean_msg})


infer_probing_or_unauthorized_call = _infer_probing_or_unauthorized_call


def _infer_tool_calls(message: str, extra: str = "") -> list[ProposedToolCall]:
    calls = _infer_from_text(message, allow_unmentioned_files=True)
    if extra.strip():
        influenced = _infer_from_text(extra, allow_unmentioned_files=True, is_document=True)
        seen = {_call_key(call) for call in calls}
        for call in influenced:
            key = _call_key(call)
            if key not in seen:
                calls.append(call)
                seen.add(key)
    return normalize_tool_calls(calls)


def _infer_from_text(
    message: str,
    *,
    allow_unmentioned_files: bool,
    is_document: bool = False,
) -> list[ProposedToolCall]:
    lower = message.lower()
    calls: list[ProposedToolCall] = []

    urls = URL_RE.findall(message)
    wants_docs = any(token in lower for token in ("documentation", "handbook", "intranet"))
    if urls or "browse" in lower or wants_docs:
        url = urls[0] if urls else "https://intranet.acme.local/handbook"
        calls.append(ProposedToolCall(name="browse_url", arguments={"url": url.rstrip(".,")}))

    if re.search(r"\blist\b.*\bfiles?\b", lower):
        calls.append(ProposedToolCall(name="list_files", arguments={}))

    seen_files: set[str] = set()
    for filename in KNOWN_FILES:
        if filename.lower() in lower:
            seen_files.add(filename)
            calls.append(ProposedToolCall(name="read_file", arguments={"path": filename}))
    for filename in FILE_RE.findall(message):
        if filename not in seen_files and (
            allow_unmentioned_files or "read" in lower or "open" in lower or "summar" in lower
        ):
            seen_files.add(filename)
            calls.append(ProposedToolCall(name="read_file", arguments={"path": filename}))

    wants_email = bool(
        EMAIL_RE.search(message)
        and ("send" in lower or "mail" in lower or "email" in lower)
        or re.search(r"\b(send\s+)?e-?mail\b", lower)
        or ("send" in lower and any(token in lower for token in ("manager", "director", "report")))
    )
    if wants_email:
        recipient = EMAIL_RE.search(message)
        default_recipient = "manager@example.com" if "manager" in lower else "user@acme.local"
        calls.append(
            ProposedToolCall(
                name="send_email",
                arguments={
                    "recipient": recipient.group(0) if recipient else default_recipient,
                    "subject": "Agent message",
                    "body": message[:500],
                    "attachments": [name for name in KNOWN_FILES if name.lower() in lower],
                },
            )
        )

    if calls or is_document:
        return calls

    if is_greeting(message):
        return []

    calls.append(_infer_probing_or_unauthorized_call(message))
    return calls


def _sources_from_calls(calls: list[ProposedToolCall]) -> list[str]:
    sources: list[str] = []
    for call in calls:
        if call.name == "read_file":
            path = call.arguments.get("path")
            if path:
                sources.append(str(path))
        elif call.name == "browse_url":
            url = call.arguments.get("url")
            if url:
                sources.append(str(url))
    return sources


def _provider_messages(messages: list[dict[str, Any]]) -> list[dict[str, str]]:
    cleaned: list[dict[str, str]] = []
    for message in messages:
        role = str(message.get("role") or "")
        content = str(message.get("content") or "")
        if role in {"user", "assistant"}:
            cleaned.append({"role": role, "content": content})
        elif role in {"tool", "document", "tool_result"}:
            name = str(message.get("name") or "document")
            cleaned.append(
                {
                    "role": "user",
                    "content": f"Retrieved file {name}:\n{content}",
                }
            )
    return cleaned


def _plan_from_completion(message: dict[str, Any]) -> AgentPlan:
    content = _message_text(message)
    if content.strip():
        try:
            return parse_agent_plan(content)
        except (json.JSONDecodeError, ValueError):
            pass
    native = message.get("tool_calls") or []
    calls: list[dict[str, Any]] = []
    for item in native:
        if not isinstance(item, dict):
            continue
        function = item.get("function") or {}
        name = str(function.get("name") or "")
        arguments = function.get("arguments") or {}
        if isinstance(arguments, str):
            try:
                arguments = json.loads(arguments)
            except json.JSONDecodeError:
                arguments = {}
        if name:
            calls.append({"name": name, "arguments": arguments if isinstance(arguments, dict) else {}})
    if calls:
        proposed = normalize_tool_calls(calls)
        names = ", ".join(call.name for call in proposed)
        return AgentPlan(
            response=content.strip() or f"I will use {names} to help with that request.",
            tool_calls=proposed,
            reasoning_summary="",
            sources=_sources_from_calls(proposed),
        )
    if content.strip():
        return AgentPlan(response=content.strip(), tool_calls=[], reasoning_summary="", sources=[])
    raise ValueError("LLM did not return a usable plan.")


def _message_text(message: dict[str, Any]) -> str:
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
            elif item:
                parts.append(str(item))
        return "".join(parts)
    return ""


def _loads_json_object(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start < 0 or end <= start:
            raise
        data = json.loads(text[start : end + 1])
    if not isinstance(data, dict):
        raise ValueError("LLM did not return a JSON object.")
    return data
