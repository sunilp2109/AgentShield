import pytest

from app.config import settings
from app.db.session import init_db
from app.security.approval import clear_approvals
from app.security.audit import clear_events
from app.security.state import shield_state


@pytest.fixture(autouse=True)
def use_mock_llm(monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "mock")
    monkeypatch.setattr(settings, "llm_api_key", "")
    yield


@pytest.fixture(autouse=True)
def reset_shield_state():
    shield_state.set_enabled(True)
    yield
    shield_state.set_enabled(True)


@pytest.fixture(autouse=True)
def reset_audit_log():
    init_db()
    clear_events()
    clear_approvals()
    yield
    clear_events()
    clear_approvals()
