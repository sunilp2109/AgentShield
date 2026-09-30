from app.security.risk_engine import RiskLevel, assess_risk
from app.shield.models import FirewallDecision, PipelineResult, ToolRequest
from app.tools.registry import TOOL_REGISTRY


class RiskEngine:
    def evaluate(self, request: ToolRequest) -> PipelineResult:
        known = set(TOOL_REGISTRY) | {
            "read_public_file",
            "read_private_file",
            "write_file",
            "external_upload",
        }
        if request.tool_name not in known:
            return PipelineResult(
                decision=FirewallDecision.BLOCK,
                reasons=["unknown_tool"],
                stage="risk_engine",
            )

        assessment = assess_risk(request.tool_name, dict(request.arguments))
        reasons = [
            f"risk_score:{assessment.risk_score}",
            f"risk_level:{assessment.risk_level.value}",
            assessment.explanation,
            *assessment.factors,
        ]
        if assessment.risk_level == RiskLevel.CRITICAL:
            decision = FirewallDecision.BLOCK
        elif assessment.risk_level == RiskLevel.HIGH:
            decision = FirewallDecision.APPROVAL_REQUIRED
        else:
            decision = FirewallDecision.ALLOW
        return PipelineResult(decision=decision, reasons=reasons, stage="risk_engine")
