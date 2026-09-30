"""Hybrid prompt injection detector.

Architecture:
    Detector
    ├── RuleDetector          (implemented)
    ├── PatternDetector       (stub for later pattern/obfuscation rules)
    └── SemanticDetector      (interface only)

This module only classifies text. It never executes, evals, or follows
instructions found in the input.
"""

from __future__ import annotations

import re
import unicodedata
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Protocol

from pydantic import BaseModel, Field

_ZERO_WIDTH = re.compile(r"[\u200b\u200c\u200d\ufeff\u2060\u180e]")
_NON_ALNUM = re.compile(r"[^\w\s]+", re.UNICODE)
_WHITESPACE = re.compile(r"\s+")

# Common homoglyphs that survive NFKC. Map to ASCII lookalikes.
_HOMOGLYPHS = str.maketrans(
    {
        "а": "a",
        "е": "e",
        "о": "o",
        "р": "p",
        "с": "c",
        "у": "y",
        "х": "x",
        "і": "i",
        "ј": "j",
        "ѕ": "s",
        "ԁ": "d",
        "ɡ": "g",
    }
)


class DetectionResult(BaseModel):
    is_injection: bool
    confidence: float = Field(ge=0, le=1)
    categories: list[str] = Field(default_factory=list)
    matched_patterns: list[str] = Field(default_factory=list)


class TextDetector(Protocol):
    def detect(self, text: str) -> DetectionResult: ...


class SemanticDetector(ABC):
    """Interface for future embedding/model-based detection."""

    @abstractmethod
    def detect(self, text: str) -> DetectionResult:
        """Classify meaning. Must not execute the input."""


@dataclass(frozen=True)
class InjectionRule:
    pattern_id: str
    category: str
    regex: re.Pattern[str]
    confidence: float


def normalize_text(text: str) -> str:
    """Normalize case, whitespace, and simple Unicode obfuscation."""
    if not text:
        return ""
    value = unicodedata.normalize("NFKC", str(text))
    value = _ZERO_WIDTH.sub("", value)
    value = value.translate(_HOMOGLYPHS)
    value = value.casefold()
    value = value.replace("_", " ").replace("-", " ")
    value = _NON_ALNUM.sub(" ", value)
    return _WHITESPACE.sub(" ", value).strip()


def _rule(pattern_id: str, category: str, pattern: str, confidence: float) -> InjectionRule:
    return InjectionRule(
        pattern_id=pattern_id,
        category=category,
        regex=re.compile(pattern, re.IGNORECASE),
        confidence=confidence,
    )


class RuleDetector:
    """Rule-based detector. Matches normalized phrases, not raw exact strings."""

    RULES: tuple[InjectionRule, ...] = (
        _rule(
            "ignore previous instructions",
            "instruction_override",
            r"\bignore\s+(?:all\s+)?(?:your\s+)?previous\s+instructions?\b",
            0.95,
        ),
        _rule(
            "ignore all previous instructions",
            "instruction_override",
            r"\bignore\s+all\s+previous\s+instructions?\b",
            0.97,
        ),
        _rule(
            "disregard previous instructions",
            "instruction_override",
            r"\bdisregard\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions?|prompts?)\b",
            0.93,
        ),
        _rule(
            "reveal system prompt",
            "secret_exfiltration",
            r"\breveal\s+(?:the\s+)?system\s+prompts?\b",
            0.9,
        ),
        _rule(
            "reveal hidden instructions",
            "secret_exfiltration",
            r"\breveal\s+(?:the\s+)?hidden\s+instructions?\b",
            0.9,
        ),
        _rule(
            "access confidential files",
            "data_exfiltration",
            r"\baccess\s+(?:the\s+)?confidential\s+files?\b",
            0.88,
        ),
        _rule(
            "send passwords",
            "data_exfiltration",
            r"\bsend\s+(?:me\s+)?(?:the\s+)?passwords?\b",
            0.86,
        ),
        _rule(
            "upload sensitive data",
            "data_exfiltration",
            r"\bupload\s+(?:the\s+)?sensitive\s+data\b",
            0.88,
        ),
        _rule(
            "disable security",
            "security_bypass",
            r"\bdisable\s+(?:the\s+)?security\b",
            0.87,
        ),
        _rule(
            "execute unauthorized command",
            "unauthorized_execution",
            r"\bexecute\s+(?:an?\s+)?unauthorized\s+commands?\b",
            0.92,
        ),
        _rule(
            "bypass security",
            "security_bypass",
            r"\bbypass\s+(?:the\s+)?security\b",
            0.9,
        ),
        _rule(
            "send data externally",
            "data_exfiltration",
            r"\bsend\s+(?:the\s+)?data\s+externally\b",
            0.88,
        ),
    )

    def detect(self, text: str) -> DetectionResult:
        normalized = normalize_text(text)
        if not normalized:
            return DetectionResult(is_injection=False, confidence=0.0, categories=[], matched_patterns=[])

        matched: list[InjectionRule] = [rule for rule in self.RULES if rule.regex.search(normalized)]
        if not matched:
            return DetectionResult(is_injection=False, confidence=0.0, categories=[], matched_patterns=[])

        categories = list(dict.fromkeys(rule.category for rule in matched))
        patterns = list(dict.fromkeys(rule.pattern_id for rule in matched))
        confidence = max(rule.confidence for rule in matched)
        if len(matched) > 1:
            confidence = min(1.0, confidence + 0.05 * (len(matched) - 1))
        return DetectionResult(
            is_injection=True,
            confidence=round(confidence, 4),
            categories=categories,
            matched_patterns=patterns,
        )


class PatternDetector:
    """Placeholder for encoded/obfuscated pattern detection."""

    def detect(self, text: str) -> DetectionResult:
        return DetectionResult(is_injection=False, confidence=0.0, categories=[], matched_patterns=[])


class Detector:
    """Hybrid orchestrator. Currently RuleDetector is the active implementation."""

    def __init__(
        self,
        rule_detector: RuleDetector | None = None,
        pattern_detector: PatternDetector | None = None,
        semantic_detector: SemanticDetector | None = None,
    ) -> None:
        self.rule_detector = rule_detector or RuleDetector()
        self.pattern_detector = pattern_detector or PatternDetector()
        self.semantic_detector = semantic_detector

    def detect(self, text: str) -> DetectionResult:
        parts = [
            self.rule_detector.detect(text),
            self.pattern_detector.detect(text),
        ]
        if self.semantic_detector is not None:
            parts.append(self.semantic_detector.detect(text))
        return _merge_results(parts)


def _merge_results(parts: list[DetectionResult]) -> DetectionResult:
    hits = [part for part in parts if part.is_injection]
    if not hits:
        return DetectionResult(is_injection=False, confidence=0.0, categories=[], matched_patterns=[])
    categories = list(dict.fromkeys(category for part in hits for category in part.categories))
    patterns = list(dict.fromkeys(pattern for part in hits for pattern in part.matched_patterns))
    confidence = min(1.0, max(part.confidence for part in hits))
    return DetectionResult(
        is_injection=True,
        confidence=confidence,
        categories=categories,
        matched_patterns=patterns,
    )
