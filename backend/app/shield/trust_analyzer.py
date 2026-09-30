from app.security.trust_engine import assess_tool_result
from app.shield.models import FirewallDecision, PipelineResult, ToolRequest


class TrustAnalyzer:
    def evaluate(self, request: ToolRequest) -> PipelineResult:
        assessment = assess_tool_result(request.tool_name, dict(request.arguments))
        return PipelineResult(
            decision=FirewallDecision.ALLOW,
            reasons=[
                f"source:{assessment.source_type.value}",
                f"trust:{assessment.trust_level.value}",
            ],
            stage="trust_analyzer",
        )
