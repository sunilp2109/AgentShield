from app.shield.action_firewall import ActionFirewall
from app.shield.injection_detector import PromptInjectionDetector
from app.shield.models import FirewallDecision, PipelineResult, ToolRequest
from app.shield.policy_engine import PolicyEngine
from app.shield.risk_engine import RiskEngine
from app.shield.trust_analyzer import TrustAnalyzer


class ShieldPipeline:
    """Evaluate a tool request when SHIELD is ON."""

    def __init__(self) -> None:
        self.stages = [
            ("prompt_injection_detector", PromptInjectionDetector()),
            ("trust_analyzer", TrustAnalyzer()),
            ("risk_engine", RiskEngine()),
            ("policy_engine", PolicyEngine()),
            ("action_firewall", ActionFirewall()),
        ]

    def evaluate(self, request: ToolRequest) -> PipelineResult:
        result = PipelineResult(decision=FirewallDecision.ALLOW, stage=None)
        for _name, stage in self.stages:
            result = stage.evaluate(request)
            if result.decision != FirewallDecision.ALLOW:
                return result
        return result
