from fastapi import APIRouter

from app.security.state import shield_state

router = APIRouter()


@router.get("/health")
def api_health() -> dict[str, object]:
    return {"status": "ok", "shield_enabled": shield_state.shield_enabled}
