from fastapi import APIRouter

from app.security.state import shield_state

router = APIRouter()

PIPELINE_STAGES = [
    "prompt_injection_detector",
    "trust_analyzer",
    "risk_engine",
    "policy_engine",
    "action_firewall",
]


@router.get("/mode")
def shield_mode() -> dict[str, object]:
    enabled = shield_state.shield_enabled
    return {
        "enabled": enabled,
        "mode": "on" if enabled else "off",
        "pipeline": PIPELINE_STAGES,
        "decisions": ["ALLOW", "APPROVAL_REQUIRED", "BLOCK"],
    }
