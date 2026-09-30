"""Automated demo-readiness and final sequence checks."""

from tests.e2e.helpers import (
    MANAGER_EMAIL_PROMPT,
    audit_events,
    chat,
    client,
    disable_shield,
    enable_shield,
    pending_approvals,
    run_attack,
    track_executions,
)


def test_core_surfaces_are_available() -> None:
    health = client.get("/health").json()
    assert health["status"] == "ok"
    assert "llm_provider" in health
    status = client.get("/api/v1/security/status").json()
    assert "shield_enabled" in status
    assert client.get("/api/v1/audit/stats").status_code == 200
    assert client.get("/api/v1/audit/events", params={"limit": 20}).status_code == 200
    assert client.get("/api/v1/approvals", params={"status": "PENDING"}).status_code == 200
    scenarios = client.get("/api/v1/attack-lab/scenarios").json()
    assert any(item["id"] == "malicious-pdf" for item in scenarios)


def test_final_hackathon_demo_sequence(monkeypatch) -> None:
    executed = track_executions(monkeypatch)
    enable_shield()
    assert client.get("/api/v1/security/status").json()["mode"] == "PROTECTED"

    blocked = run_attack("malicious-pdf")
    assert blocked["injection_detected"] is True
    assert blocked["risk_level"] in {"HIGH", "CRITICAL"}
    assert blocked["firewall_decision"] == "BLOCK"
    assert blocked["execution_status"] == "BLOCKED"
    events = audit_events(session_id=blocked["session_id"], limit=20)
    assert events
    sample = next(event for event in events if event["firewall_decision"] == "BLOCK")
    assert sample["injection_detected"] is True
    assert sample["shield_enabled"] is True
    assert sample["execution_status"] in {"BLOCKED", "NOT_EXECUTED"}

    email = chat(MANAGER_EMAIL_PROMPT, "e2e-final-approval")
    pending = next(item for item in email["tool_results"] if item["name"] == "send_email")
    assert pending["decision"] == "APPROVAL_REQUIRED"
    approval_id = pending["approval_id"]
    assert any(item["id"] == approval_id for item in pending_approvals())
    approved = client.post(f"/api/v1/approvals/{approval_id}/approve", json={"decided_by": "judge"})
    assert approved.status_code == 200
    assert approved.json()["status"] == "EXECUTED"
    assert approved.json()["execution_status"] == "EXECUTED"

    disable_shield()
    bypassed = run_attack("malicious-pdf")
    assert bypassed["shield_enabled"] is False
    assert bypassed["firewall_decision"] == "BYPASS"

    enable_shield()
    blocked_again = run_attack("malicious-pdf")
    assert blocked_again["firewall_decision"] == "BLOCK"
    assert blocked_again["tool_execution"] is False
    assert any(name == "send_email" for name, _args in executed)
    assert all(item["id"] != approval_id for item in pending_approvals())
