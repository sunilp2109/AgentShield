from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/status")
def agent_status() -> dict[str, object]:
    return {
        "status": "ready",
        "llm_provider": settings.llm_provider,
        "executes_tools": False,
    }
