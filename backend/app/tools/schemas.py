from collections.abc import Callable
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


def _default_trust(source_name: str) -> Any:
    from app.security.trust_engine import SourceType, assess_trust

    mapping = {
        "webpage": SourceType.WEBPAGE,
        "file": SourceType.LOCAL_PRIVATE_FILE,
        "tool": SourceType.TOOL_RESPONSE,
    }
    return assess_trust(mapping.get(source_name, SourceType.TOOL_RESPONSE))


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ToolSpec(BaseModel):
    model_config = ConfigDict(arbitrary_types_allowed=True)

    name: str
    description: str
    risk_level: RiskLevel
    requires_confirmation: bool
    handler: Callable[..., Any]


class BrowseUrlResult(BaseModel):
    url: str
    title: str
    content: str
    status: str
    trust: Any = Field(default_factory=lambda: _default_trust("webpage"))


class ListFilesResult(BaseModel):
    files: list[str]
    status: str
    trust: Any = Field(default_factory=lambda: _default_trust("file"))


class ReadFileResult(BaseModel):
    path: str
    content: str
    status: str
    trust: Any = Field(default_factory=lambda: _default_trust("file"))


class SendEmailRequest(BaseModel):
    recipient: str = Field(min_length=1)
    subject: str
    body: str
    attachments: list[str] = Field(default_factory=list)


class SendEmailResult(BaseModel):
    recipient: str
    subject: str
    body: str
    attachments: list[str]
    status: str
    trust: Any = Field(default_factory=lambda: _default_trust("tool"))


TOOL_PARAMETERS: dict[str, dict[str, Any]] = {
    "browse_url": {
        "type": "object",
        "properties": {
            "url": {"type": "string", "description": "URL of a simulated page to open"},
        },
        "required": ["url"],
    },
    "list_files": {
        "type": "object",
        "properties": {},
        "required": [],
    },
    "read_file": {
        "type": "object",
        "properties": {
            "path": {"type": "string", "description": "File name to read"},
        },
        "required": ["path"],
    },
    "send_email": {
        "type": "object",
        "properties": {
            "recipient": {"type": "string"},
            "subject": {"type": "string"},
            "body": {"type": "string"},
            "attachments": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["recipient", "subject", "body"],
    },
}
