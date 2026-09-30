"""Safe trusted-user flow through chat, firewall, tools, and audit."""

from app.security.trust_engine import TrustLevel

from tests.e2e.helpers import (
    SAFE_DOC_PROMPT,
    audit_events,
    audit_stats,
    chat,
    enable_shield,
    pending_approvals,
    track_executions,
)


def test_safe_documentation_browse_is_allowed_and_logged(monkeypatch) -> None:
    executed = track_executions(monkeypatch)
    enable_shield()
    payload = chat(SAFE_DOC_PROMPT, "e2e-safe-docs")
    results = payload["tool_results"]
    assert results, "Mock agent should propose browse_url for the documentation prompt."
    browse = next(item for item in results if item["name"] == "browse_url")
    assert browse["decision"] == "ALLOW"
    assert browse["execution_status"] == "EXECUTED"
    assert browse["result"]["status"] == "ok"
    assert browse["trust"]["trust_level"] == TrustLevel.TRUSTED.value
    assert executed == [("browse_url", {"url": "https://intranet.acme.local/handbook"})]
    assert pending_approvals() == []

    events = audit_events(session_id="e2e-safe-docs", limit=50)
    assert events
    event = events[0]
    assert event["firewall_decision"] == "ALLOW"
    assert event["policy_decision"] == "ALLOW"
    assert event["execution_status"] == "EXECUTED"
    assert event["injection_detected"] is False
    assert event["risk_level"] == "LOW"
    assert event["shield_enabled"] is True
    stats = audit_stats()
    assert stats["allowed"] >= 1
    assert stats["total_events"] >= 1
