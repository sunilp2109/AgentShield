from app.shield.models import PipelineResult, ToolRequest


class PolicyEngine:
    """Pipeline adapter for the Module 8 policy engine. Does not execute tools."""

    def evaluate(self, request: ToolRequest) -> PipelineResult:
        from app.security.policy_engine import evaluate_policy

        verdict = evaluate_policy(request.tool_name, dict(request.arguments))
        return PipelineResult(
            decision=verdict.decision,
            reasons=[
                verdict.policy_rule,
                verdict.reason,
                f"risk_score:{verdict.risk_score}",
                f"risk_level:{verdict.risk_level.value}",
            ],
            stage="policy_engine",
        )
