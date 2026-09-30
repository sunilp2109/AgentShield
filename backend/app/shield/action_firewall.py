from app.shield.models import FirewallDecision, PipelineResult, ToolRequest


class ActionFirewall:
    def evaluate(self, request: ToolRequest) -> PipelineResult:
        return PipelineResult(
            decision=FirewallDecision.ALLOW,
            reasons=["firewall_pass"],
            stage="action_firewall",
        )
