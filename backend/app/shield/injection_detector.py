from app.security.detector import Detector
from app.shield.models import FirewallDecision, PipelineResult, ToolRequest


class PromptInjectionDetector:
    """Shield stage that classifies text only. It never follows detected instructions."""

    def __init__(self, detector: Detector | None = None) -> None:
        self.detector = detector or Detector()

    def evaluate(self, request: ToolRequest) -> PipelineResult:
        blob = " ".join(_string_values(request.arguments))
        detection = self.detector.detect(blob)
        if detection.is_injection:
            return PipelineResult(
                decision=FirewallDecision.BLOCK,
                reasons=["prompt_injection", *detection.matched_patterns],
                stage="prompt_injection_detector",
            )
        return PipelineResult(decision=FirewallDecision.ALLOW, stage="prompt_injection_detector")


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
