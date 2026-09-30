from fastapi import APIRouter, Request
from pydantic import BaseModel

from app.security.audit import log_shield_state_change
from app.security.state import shield_state

router = APIRouter()


class ToggleRequest(BaseModel):
    enabled: bool


def _status_payload() -> dict[str, object]:
    enabled = shield_state.shield_enabled
    return {
        "shield_enabled": enabled,
        "enabled": enabled,
        "mode": "PROTECTED" if enabled else "BASELINE",
    }


@router.get("/security/status")
def security_status() -> dict[str, object]:
    return _status_payload()


@router.post("/security/toggle")
def security_toggle(payload: ToggleRequest, request: Request) -> dict[str, object]:
    enabled = shield_state.set_enabled(payload.enabled)
    log_shield_state_change(
        enabled=enabled,
        session_id=request.headers.get("x-session-id") or "default",
        request_id=request.headers.get("x-request-id"),
    )
    return _status_payload()
