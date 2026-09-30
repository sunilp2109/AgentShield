from enum import Enum

from pydantic import BaseModel, Field


class FirewallDecision(str, Enum):
    ALLOW = "ALLOW"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    BLOCK = "BLOCK"


class ToolRequest(BaseModel):
    tool_name: str
    arguments: dict[str, object] = Field(default_factory=dict)
    agent_id: str = "default"
    session_id: str = "default"


class PipelineResult(BaseModel):
    decision: FirewallDecision
    reasons: list[str] = Field(default_factory=list)
    stage: str | None = None
