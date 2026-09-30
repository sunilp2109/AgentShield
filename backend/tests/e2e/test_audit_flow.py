"""Audit completeness, privacy, persistence, and dashboard API consistency."""

from sqlalchemy import func, select

from app.db.models import SecurityEvent
from app.db.session import SessionLocal, init_db

from tests.e2e.helpers import (
    MANAGER_EMAIL_PROMPT,
    SAFE_DOC_PROMPT,
    audit_events,
    audit_stats,
    blob_has_secret,
    chat,
    client,
    disable_shield,
    enable_shield,
    pending_approvals,
    run_attack,
    track_executions,
)


def test_audit_records_each_major_decision(monkeypatch) -> None:
    track_executions(monkeypatch)
    enable_shield()
    chat(SAFE_DOC_PROMPT, "e2e-audit-safe")
    email = chat(MANAGER_EMAIL_PROMPT, "e2e-audit-approve")
    approval_id = next(item["approval_id"] for item in email["tool_results"] if item.get("approval_id"))
    client.post(f"/api/v1/approvals/{approval_id}/approve", json={})
    rejected = chat(MANAGER_EMAIL_PROMPT, "e2e-audit-reject")
    reject_id = next(item["approval_id"] for item in rejected["tool_results"] if item.get("approval_id"))
    client.post(f"/api/v1/approvals/{reject_id}/reject", json={"reason": "demo reject"})
    run_attack("malicious-pdf")
    disable_shield()
    run_attack("malicious-pdf")

    events = audit_events(limit=200)
    decisions = {event["firewall_decision"] for event in events}
    actions = {event["action"] for event in events}
    assert "ALLOW" in decisions
    assert "APPROVAL_REQUIRED" in decisions or "ALLOW" in {
        event["firewall_decision"] for event in events if event["action"] == "APPROVAL_APPROVED"
    }
    assert "BLOCK" in decisions
    assert "BYPASS" in decisions
    assert "APPROVAL_CREATED" in actions
    assert "APPROVAL_APPROVED" in actions
    assert "APPROVED_ACTION_EXECUTED" in actions
    assert "APPROVAL_REJECTED" in actions
    stats = audit_stats()
    assert stats["blocked"] >= 1
    assert stats["bypassed"] >= 1
    assert stats["allowed"] >= 1
    assert stats["total_events"] >= 5


def test_audit_and_approval_payloads_never_contain_secrets(monkeypatch) -> None:
    track_executions(monkeypatch)
    enable_shield()
    blocked = run_attack("malicious-pdf")
    disable_shield()
    bypassed = run_attack("malicious-pdf")
    events = audit_events(limit=200)
    pending = pending_approvals()
    stats = audit_stats()
    assert not blob_has_secret(blocked)
    assert not blob_has_secret(bypassed)
    assert not blob_has_secret(events)
    assert not blob_has_secret(pending)
    assert not blob_has_secret(stats)
    init_db()
    with SessionLocal() as session:
        blob = "".join(
            " ".join(
                str(getattr(row, column))
                for column in (
                    "user_intent",
                    "execution_result_summary",
                    "block_reason",
                    "source_name",
                    "target_resource",
                )
            )
            for row in session.scalars(select(SecurityEvent)).all()
        )
    assert "sk_live_demo_not_real_111" not in blob
    assert "CONFIDENTIAL - INTERNAL ONLY" not in blob


def test_audit_rows_persist_in_sqlite() -> None:
    enable_shield()
    chat(SAFE_DOC_PROMPT, "e2e-audit-persist")
    first = audit_events(session_id="e2e-audit-persist", limit=20)
    assert first
    init_db()
    with SessionLocal() as session:
        count = session.scalar(select(func.count()).select_from(SecurityEvent))
    assert count >= len(first)
    second = audit_events(session_id="e2e-audit-persist", limit=20)
    assert [event["id"] for event in second] == [event["id"] for event in first]


def test_dashboard_apis_match_audit_store() -> None:
    enable_shield()
    chat(SAFE_DOC_PROMPT, "e2e-dashboard-consistency")
    status = client.get("/api/v1/security/status").json()
    health = client.get("/health").json()
    events = audit_events(limit=20)
    stats = audit_stats()
    pending = pending_approvals()
    assert status["shield_enabled"] is True
    assert health["shield_enabled"] is True
    assert stats["total_events"] >= len(events) or stats["total_events"] >= 1
    assert isinstance(pending, list)
    assert all("firewall_decision" in event for event in events)
    assert all("id" in event and "timestamp" in event for event in events)
