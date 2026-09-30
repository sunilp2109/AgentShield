from collections.abc import Callable
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.security.trust_engine import SourceType, TrustAssessment, assess_trust


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
    trust: TrustAssessment = Field(
        default_factory=lambda: assess_trust(SourceType.WEBPAGE)
    )


class ListFilesResult(BaseModel):
    files: list[str]
    status: str
    trust: TrustAssessment = Field(
        default_factory=lambda: assess_trust(SourceType.LOCAL_PRIVATE_FILE)
    )


class ReadFileResult(BaseModel):
    path: str
    content: str
    status: str
    trust: TrustAssessment


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
    trust: TrustAssessment = Field(
        default_factory=lambda: assess_trust(SourceType.TOOL_RESPONSE)
    )
