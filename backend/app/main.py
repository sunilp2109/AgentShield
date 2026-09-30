from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.config import settings
from app.db.session import init_db
from app.security.state import shield_state


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="AgentShield",
    description="Runtime security firewall for LLM-powered AI agents",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "status": "ok",
        "service": "agentshield-backend",
        "shield_enabled": shield_state.shield_enabled,
        "llm_provider": settings.llm_provider,
    }
