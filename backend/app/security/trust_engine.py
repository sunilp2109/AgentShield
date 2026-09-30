"""Trust classification for tool results and external content."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TrustLevel(str, Enum):
    TRUSTED = "TRUSTED"
    SENSITIVE = "SENSITIVE"
    UNTRUSTED = "UNTRUSTED"


class SourceType(str, Enum):
    USER = "USER"
    SYSTEM = "SYSTEM"
    LOCAL_PRIVATE_FILE = "LOCAL_PRIVATE_FILE"
    WEBPAGE = "WEBPAGE"
    EMAIL = "EMAIL"
    PDF = "PDF"
    TOOL_RESPONSE = "TOOL_RESPONSE"
    EXTERNAL_API = "EXTERNAL_API"


SOURCE_TRUST_RULES: dict[SourceType, TrustLevel] = {
    SourceType.USER: TrustLevel.TRUSTED,
    SourceType.SYSTEM: TrustLevel.TRUSTED,
    SourceType.LOCAL_PRIVATE_FILE: TrustLevel.SENSITIVE,
    SourceType.WEBPAGE: TrustLevel.UNTRUSTED,
    SourceType.EMAIL: TrustLevel.UNTRUSTED,
    SourceType.PDF: TrustLevel.UNTRUSTED,
    SourceType.TOOL_RESPONSE: TrustLevel.UNTRUSTED,
    SourceType.EXTERNAL_API: TrustLevel.UNTRUSTED,
}

_SOURCE_REASONS: dict[SourceType, str] = {
    SourceType.USER: "User-provided input is treated as trusted.",
    SourceType.SYSTEM: "System-generated content is treated as trusted.",
    SourceType.LOCAL_PRIVATE_FILE: "Local private files are classified as sensitive.",
    SourceType.WEBPAGE: "Webpage content is untrusted external data.",
    SourceType.EMAIL: "Email content is untrusted external data.",
    SourceType.PDF: "PDF content is untrusted external data.",
    SourceType.TOOL_RESPONSE: "Tool responses are untrusted until independently verified.",
    SourceType.EXTERNAL_API: "External API data is untrusted.",
}

_TOOL_SOURCE_TYPES: dict[str, SourceType] = {
    "browse_url": SourceType.WEBPAGE,
    "list_files": SourceType.LOCAL_PRIVATE_FILE,
    "read_file": SourceType.LOCAL_PRIVATE_FILE,
    "send_email": SourceType.TOOL_RESPONSE,
}


class TrustAssessment(BaseModel):
    source_type: SourceType
    trust_level: TrustLevel
    reason: str


def assess_trust(
    source_type: SourceType | str,
    metadata: dict[str, Any] | None = None,
) -> TrustAssessment:
    metadata = metadata or {}
    source = _coerce_source_type(source_type)
    source = _refine_source_type(source, metadata)
    level = SOURCE_TRUST_RULES[source]
    return TrustAssessment(
        source_type=source,
        trust_level=level,
        reason=_reason_for(source, metadata),
    )


def infer_source_type(
    tool_name: str,
    metadata: dict[str, Any] | None = None,
) -> SourceType:
    metadata = metadata or {}
    source = _TOOL_SOURCE_TYPES.get(tool_name, SourceType.TOOL_RESPONSE)
    return _refine_source_type(source, metadata)


def assess_tool_result(
    tool_name: str,
    metadata: dict[str, Any] | None = None,
) -> TrustAssessment:
    metadata = metadata or {}
    return assess_trust(infer_source_type(tool_name, metadata), metadata)


def _coerce_source_type(source_type: SourceType | str) -> SourceType:
    try:
        return source_type if isinstance(source_type, SourceType) else SourceType(str(source_type).upper())
    except ValueError as exc:
        known = ", ".join(item.value for item in SourceType)
        raise ValueError(f"Unknown source type '{source_type}'. Known types: {known}") from exc


def _refine_source_type(source: SourceType, metadata: dict[str, Any]) -> SourceType:
    path = str(metadata.get("path") or metadata.get("filename") or "")
    if source == SourceType.LOCAL_PRIVATE_FILE and path.lower().endswith(".pdf"):
        return SourceType.PDF
    return source


def _reason_for(source: SourceType, metadata: dict[str, Any]) -> str:
    reason = _SOURCE_REASONS[source]
    detail_keys = ("path", "filename", "url", "tool", "origin")
    details = [f"{key}={metadata[key]}" for key in detail_keys if metadata.get(key)]
    if details:
        return f"{reason} ({', '.join(details)})"
    return reason
