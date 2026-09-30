"""Human-in-the-loop approval, rejection, revalidation, expiry, and double-exec."""

from app.security.approval import approval_service
from app.tools.registry import TOOL_REGISTRY

from tests.e2e.helpers import (
    MANAGER_EMAIL_PROMPT,
    actions_for,
    chat,
    client,
    enable_shield,
    pending_approvals,
    track_executions,
)


def _pending_email(monkeypatch, session_id: str):
    executed = track_executions(monkeypatch)
    enable_shield()
    payload = chat(MANAGER_EMAIL_PROMPT, session_id)
    email = next(item for item in payload["tool_results"] if item["name"] == "send_email")
    return email, executed


def test_legitimate_manager_email_requires_then_executes_once(monkeypatch) -> None:
    email, executed = _pending_email(monkeypatch, "e2e-approval-ok")
    assert email["decision"] == "APPROVAL_REQUIRED"
    assert email["execution_status"] == "PENDING"
    assert email["approval_required"] is True
    assert email["result"] is None
    assert executed == []
    approval_id = email["approval_id"]
    assert approval_id
    stored = next(item for item in pending_approvals() if item["id"] == approval_id)
    assert stored["status"] == "PENDING"
    assert stored["injection_detected"] is False
    assert stored["risk_level"] in {"MEDIUM", "HIGH", "CRITICAL"}

    approved = client.post(f"/api/v1/approvals/{approval_id}/approve", json={"decided_by": "reviewer"})
    assert approved.status_code == 200
    body = approved.json()
    assert body["status"] == "EXECUTED"
    assert body["execution_status"] == "EXECUTED"
    assert body["result"]["status"] == "simulated"
    assert [name for name, _args in executed] == ["send_email"]

    second = client.post(f"/api/v1/approvals/{approval_id}/approve", json={})
    assert second.status_code == 409
    assert [name for name, _args in executed] == ["send_email"]
    actions = actions_for("e2e-approval-ok")
    assert "APPROVAL_CREATED" in actions
    assert "APPROVAL_APPROVED" in actions
    assert "APPROVED_ACTION_EXECUTED" in actions


def test_rejected_approval_never_executes(monkeypatch) -> None:
    email, executed = _pending_email(monkeypatch, "e2e-approval-reject")
    approval_id = email["approval_id"]
    rejected = client.post(
        f"/api/v1/approvals/{approval_id}/reject",
        json={"reason": "Not needed for this demo"},
    )
    assert rejected.status_code == 200
    body = rejected.json()
    assert body["status"] == "REJECTED"
    assert body["execution_status"] == "NOT_EXECUTED"
    assert executed == []
    retry = client.post(f"/api/v1/approvals/{approval_id}/approve", json={})
    assert retry.status_code == 409
    assert executed == []
    assert "APPROVAL_REJECTED" in actions_for("e2e-approval-reject")
    assert all(item["id"] != approval_id for item in pending_approvals())


def test_expired_approval_cannot_execute(monkeypatch) -> None:
    email, executed = _pending_email(monkeypatch, "e2e-approval-expire")
    approval_id = email["approval_id"]
    expired = approval_service.expire_request(approval_id)
    assert expired.status == "EXPIRED"
    assert expired.execution_status == "NOT_EXECUTED"
    retry = client.post(f"/api/v1/approvals/{approval_id}/approve", json={})
    assert retry.status_code == 409
    assert "expired" in retry.json()["detail"].lower()
    assert executed == []
    assert "APPROVAL_EXPIRED" in actions_for("e2e-approval-expire")


def test_approval_revalidation_blocks_when_tool_disappears(monkeypatch) -> None:
    email, executed = _pending_email(monkeypatch, "e2e-approval-revalidate")
    approval_id = email["approval_id"]
    monkeypatch.delitem(TOOL_REGISTRY, "send_email")
    failed = client.post(f"/api/v1/approvals/{approval_id}/approve", json={})
    assert failed.status_code == 409
    assert executed == []
    stored = approval_service.get_request(approval_id)
    assert stored is not None
    assert stored.status == "EXECUTION_FAILED"
    assert stored.execution_status == "NOT_EXECUTED"
