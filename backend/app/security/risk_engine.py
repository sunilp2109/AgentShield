"""Risk scoring for AgentShield tool requests.

Scores follow the CVSS v3.1 severity scale:
  None:     0.0
  Low:      0.1 – 3.9
  Medium:   4.0 – 6.9
  High:     7.0 – 8.9
  Critical: 9.0 – 10.0
"""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel, Field

from app.security.detector import Detector
from app.security.trust_engine import SourceType, TrustLevel, assess_trust

# ---------------------------------------------------------------------------
# Baselines — expressed on the CVSS 0.0–10.0 scale
# ---------------------------------------------------------------------------
TOOL_BASELINE_RISK: dict[str, float] = {
    "browse_url": 1.0,
    "list_files": 1.0,
    "read_public_file": 1.5,
    "read_private_file": 6.0,
    "read_file": 1.5,
    "write_file": 7.0,
    "send_email": 7.0,
    "external_upload": 9.0,
}

# Modifiers — expressed on the CVSS 0.0–10.0 scale
UNTRUSTED_SOURCE_MODIFIER: float = 2.0
PROMPT_INJECTION_MODIFIER: float = 3.0
SENSITIVE_DATA_MODIFIER: float = 2.5
EXTERNAL_DESTINATION_MODIFIER: float = 2.5
CRITICAL_ACTION_MODIFIER: float = 2.0

CRITICAL_ACTIONS = frozenset({"write_file", "external_upload"})
PRIVATE_FILE_NAMES = frozenset({"confidential.txt", "employee_data.txt"})
PRIVATE_FILE_TOKENS = ("confidential", "employee", "secret", "private", "password", "credential", "token")
INTERNAL_HOST_MARKERS = (".local", ".internal", "localhost")
_detector = Detector()


class RiskLevel(str, Enum):
    NONE = "NONE"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class RiskAssessment(BaseModel):
    risk_score: float = Field(ge=0.0, le=10.0)
    risk_level: RiskLevel
    factors: list[str] = Field(default_factory=list)
    explanation: str = ""


def assess_risk(
    tool_name: str,
    arguments: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> RiskAssessment:
    arguments = arguments or {}
    metadata = metadata or {}
    signals = _collect_signals(tool_name, arguments, metadata)

    score: float = signals.baseline
    factors = [f"tool_baseline:{signals.baseline_label}={signals.baseline}"]

    if signals.untrusted_source:
        score += UNTRUSTED_SOURCE_MODIFIER
        factors.append(f"untrusted_source=+{UNTRUSTED_SOURCE_MODIFIER}")
    if signals.prompt_injection:
        score += PROMPT_INJECTION_MODIFIER
        factors.append(f"prompt_injection=+{PROMPT_INJECTION_MODIFIER}")
    if signals.sensitive_data:
        score += SENSITIVE_DATA_MODIFIER
        factors.append(f"sensitive_data=+{SENSITIVE_DATA_MODIFIER}")
    if signals.external_destination:
        score += EXTERNAL_DESTINATION_MODIFIER
        factors.append(f"external_destination=+{EXTERNAL_DESTINATION_MODIFIER}")
    if signals.critical_action:
        score += CRITICAL_ACTION_MODIFIER
        factors.append(f"critical_action=+{CRITICAL_ACTION_MODIFIER}")

    score = round(min(10.0, max(0.0, score)), 1)
    level = _risk_level(score)
    return RiskAssessment(
        risk_score=score,
        risk_level=level,
        factors=factors,
        explanation=_explain(signals),
    )


class _Signals:
    def __init__(self) -> None:
        self.tool_name = ""
        self.baseline: float = 0.0
        self.baseline_label = ""
        self.source_type = SourceType.USER
        self.untrusted_source = False
        self.prompt_injection = False
        self.sensitive_data = False
        self.external_destination = False
        self.critical_action = False
        self.private_file = False
        self.destination = ""


def _collect_signals(
    tool_name: str,
    arguments: dict[str, Any],
    metadata: dict[str, Any],
) -> _Signals:
    signals = _Signals()
    signals.tool_name = tool_name
    signals.source_type = _resolve_source_type(arguments, metadata)
    trust = assess_trust(signals.source_type, {**arguments, **metadata})
    signals.untrusted_source = trust.trust_level == TrustLevel.UNTRUSTED

    path = str(metadata.get("path") or arguments.get("path") or metadata.get("filename") or "")
    attachments = _string_list(arguments.get("attachments") or metadata.get("attachments") or [])
    signals.private_file = _is_private_file(path, attachments, arguments, metadata)
    signals.baseline, signals.baseline_label = _baseline_for(tool_name, signals.private_file)

    blob = _text_blob(arguments, metadata)
    detection = metadata.get("injection")
    if detection is None:
        detection = _detector.detect(blob)
    signals.prompt_injection = bool(getattr(detection, "is_injection", detection))

    signals.destination = str(
        metadata.get("destination")
        or arguments.get("recipient")
        or arguments.get("url")
        or ""
    )
    signals.external_destination = _is_external_destination(tool_name, signals.destination, metadata)
    signals.sensitive_data = _is_sensitive_data(tool_name, path, attachments, arguments, metadata, signals.private_file)
    action_type = str(metadata.get("action_type") or tool_name)
    signals.critical_action = action_type in CRITICAL_ACTIONS or tool_name in CRITICAL_ACTIONS
    return signals


def _baseline_for(tool_name: str, private_file: bool) -> tuple[float, str]:
    if tool_name == "read_file":
        label = "read_private_file" if private_file else "read_public_file"
        return TOOL_BASELINE_RISK[label], label
    if tool_name in TOOL_BASELINE_RISK:
        return TOOL_BASELINE_RISK[tool_name], tool_name
    return 5.0, "unknown_tool"


def _resolve_source_type(arguments: dict[str, Any], metadata: dict[str, Any]) -> SourceType:
    raw = metadata.get("source_type") or arguments.get("source_type") or SourceType.USER
    if isinstance(raw, SourceType):
        return raw
    try:
        return SourceType(str(raw).upper())
    except ValueError:
        return SourceType.USER


def _is_private_file(
    path: str,
    attachments: list[str],
    arguments: dict[str, Any],
    metadata: dict[str, Any],
) -> bool:
    if metadata.get("private_file") is True:
        return True
    names = [path, *attachments, str(arguments.get("body") or ""), str(metadata.get("content") or "")]
    blob = " ".join(names).lower()
    if any(name.lower() in blob for name in PRIVATE_FILE_NAMES):
        return True
    return any(token in blob for token in PRIVATE_FILE_TOKENS)


def _is_sensitive_data(
    tool_name: str,
    path: str,
    attachments: list[str],
    arguments: dict[str, Any],
    metadata: dict[str, Any],
    private_file: bool,
) -> bool:
    if metadata.get("sensitive") is True:
        return True
    exporting = tool_name in {"send_email", "external_upload", "write_file"}
    if exporting and private_file:
        return True
    blob = _text_blob(arguments, metadata).lower()
    return exporting and any(token in blob for token in PRIVATE_FILE_TOKENS)


def _is_external_destination(tool_name: str, destination: str, metadata: dict[str, Any]) -> bool:
    if metadata.get("external_destination") is True:
        return True
    if tool_name == "external_upload":
        return True
    if not destination:
        return False
    lowered = destination.lower()
    return not any(marker in lowered for marker in INTERNAL_HOST_MARKERS)


def _text_blob(arguments: dict[str, Any], metadata: dict[str, Any]) -> str:
    parts = [_string_values(arguments), _string_values(metadata.get("content"))]
    return " ".join(item for group in parts for item in group)


def _string_values(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        found: list[str] = []
        for item in value.values():
            found.extend(_string_values(item))
        return found
    if isinstance(value, list):
        found: list[str] = []
        for item in value:
            found.extend(_string_values(item))
        return found
    return []


def _string_list(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    if value:
        return [str(value)]
    return []


def _risk_level(score: float) -> RiskLevel:
    """Map a CVSS 0.0–10.0 score to a severity band."""
    if score >= 9.0:
        return RiskLevel.CRITICAL
    if score >= 7.0:
        return RiskLevel.HIGH
    if score >= 4.0:
        return RiskLevel.MEDIUM
    if score > 0.0:
        return RiskLevel.LOW
    return RiskLevel.NONE


def _explain(signals: _Signals) -> str:
    subject = _source_phrase(signals.source_type, signals.untrusted_source)
    actions = _action_phrases(signals)
    if not actions:
        actions = [_fallback_action(signals.tool_name)]
    joined = _join_actions(actions)
    sentence = f"{subject} attempted to {joined}."
    if signals.prompt_injection:
        sentence += " The request also contains prompt injection."
    return sentence


def _source_phrase(source_type: SourceType, untrusted: bool) -> str:
    labels = {
        SourceType.PDF: "Untrusted PDF",
        SourceType.WEBPAGE: "Untrusted webpage",
        SourceType.EMAIL: "Untrusted email",
        SourceType.TOOL_RESPONSE: "Untrusted tool output",
        SourceType.EXTERNAL_API: "Untrusted external API",
        SourceType.LOCAL_PRIVATE_FILE: "A sensitive local file",
        SourceType.USER: "A trusted user",
        SourceType.SYSTEM: "A trusted system process",
    }
    if untrusted and source_type in labels:
        return labels[source_type]
    return labels.get(source_type, "An untrusted source" if untrusted else "A trusted user")


def _action_phrases(signals: _Signals) -> list[str]:
    phrases: list[str] = []
    if signals.private_file or (signals.tool_name == "read_file" and signals.baseline_label == "read_private_file"):
        phrases.append("access a private file")
    if signals.tool_name == "send_email" and signals.external_destination:
        phrases.append("send its contents to an external email address")
    elif signals.tool_name == "send_email":
        phrases.append("send email")
    if signals.tool_name == "external_upload":
        phrases.append("upload data to an external destination")
    if signals.tool_name == "write_file":
        phrases.append("write to the filesystem")
    if signals.tool_name == "browse_url":
        phrases.append("browse an external webpage" if signals.external_destination else "browse a page")
    if signals.tool_name == "list_files":
        phrases.append("list files")
    if signals.tool_name == "read_file" and not signals.private_file:
        phrases.append("read a file")
    return list(dict.fromkeys(phrases))


def _fallback_action(tool_name: str) -> str:
    return f"invoke {tool_name or 'an unknown tool'}"


def _join_actions(actions: list[str]) -> str:
    if len(actions) == 1:
        return actions[0]
    if len(actions) == 2:
        return f"{actions[0]} and {actions[1]}"
    return f"{', '.join(actions[:-1])}, and {actions[-1]}"
