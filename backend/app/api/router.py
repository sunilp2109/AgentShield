from fastapi import APIRouter

from app.api.routes import agent, approvals, attack_lab, audit, chat, health, security, shield

api_router = APIRouter()
api_router.include_router(health.router, tags=["health"])
api_router.include_router(agent.router, prefix="/agent", tags=["agent"])
api_router.include_router(shield.router, prefix="/shield", tags=["shield"])

v1_router = APIRouter()
v1_router.include_router(chat.router, tags=["chat"])
v1_router.include_router(security.router, tags=["security"])
v1_router.include_router(audit.router, tags=["audit"])
v1_router.include_router(approvals.router, tags=["approvals"])
v1_router.include_router(attack_lab.router, tags=["attack-lab"])
api_router.include_router(v1_router, prefix="/v1")
