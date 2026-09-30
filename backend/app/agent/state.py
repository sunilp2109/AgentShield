from typing import Any, TypedDict

from pydantic import BaseModel, Field


class ProposedToolCall(BaseModel):
    name: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class AgentPlan(BaseModel):
    response: str = ""
    tool_calls: list[ProposedToolCall] = Field(default_factory=list)
    reasoning_summary: str = ""
    sources: list[str] = Field(default_factory=list)


class AgentTurn(BaseModel):
    response: str
    tool_calls: list[ProposedToolCall] = Field(default_factory=list)
    reasoning_summary: str = ""
    sources: list[str] = Field(default_factory=list)
    session_id: str


class AgentState(TypedDict, total=False):
    messages: list[dict[str, Any]]
    user_message: str
    response: str
    tool_calls: list[dict[str, Any]]
    reasoning_summary: str
    sources: list[str]
