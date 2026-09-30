"""Global AgentShield security state.

`shield_enabled` controls the live execution pipeline:
- False: LLM → Tool Executor → Tool
- True:  LLM → AgentShield → Tool Executor → Tool
"""

from __future__ import annotations

from threading import Lock

from app.config import settings


class ShieldState:
    def __init__(self, enabled: bool = True) -> None:
        self._lock = Lock()
        self._enabled = enabled

    @property
    def shield_enabled(self) -> bool:
        with self._lock:
            return self._enabled

    def set_enabled(self, enabled: bool) -> bool:
        with self._lock:
            self._enabled = bool(enabled)
            return self._enabled

    def as_dict(self) -> dict[str, bool]:
        return {"shield_enabled": self.shield_enabled}


shield_state = ShieldState(enabled=settings.shield_enabled)
