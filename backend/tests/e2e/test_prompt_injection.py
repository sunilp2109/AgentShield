"""Prompt injection, malicious PDF, and data-exfiltration BLOCK paths."""

from app.attack_lab.scenarios import MALICIOUS_PDF_PAYLOAD

from tests.e2e.helpers import (
    blob_has_secret,
    client,
    enable_shield,
    pending_approvals,
    run_attack,
    track_executions,
)


def test_malicious_pdf_is_blocked_without_approval_or_execution(monkeypatch) -> None:
    executed = track_executions(monkeypatch)
    enable_shield()
    body = run_attack("malicious-pdf")
    assert body["payload"] == MALICIOUS_PDF_PAYLOAD
    assert body["source_type"] in {"PDF", "DOCUMENT"}
    assert body["injection_detected"] is True
    assert body["risk_level"] in {"HIGH", "CRITICAL"}
    assert body["policy_decision"] == "BLOCK"
    assert body["firewall_decision"] == "BLOCK"
    assert body["execution_status"] == "BLOCKED"
    assert body["tool_execution"] is False
    assert body["approval_created"] is False
    assert body["approval_id"] is None
    assert executed == []
    assert all(item["executed"] is False for item in body["tools"])
    assert pending_approvals() == []
    assert not blob_has_secret(body)

    events = client.get("/api/v1/audit/events", params={"session_id": body["session_id"], "limit": 50}).json()
    assert events
    assert any(event["firewall_decision"] == "BLOCK" for event in events)
    assert any(event["injection_detected"] is True for event in events)
    assert all(event["shield_enabled"] is True for event in events)
    stats = client.get("/api/v1/audit/stats").json()
    assert stats["blocked"] >= 1
    assert stats["injections_detected"] >= 1


def test_data_exfiltration_cannot_be_downgraded_to_approval(monkeypatch) -> None:
    executed = track_executions(monkeypatch)
    enable_shield()
    body = run_attack("data-exfiltration")
    assert body["firewall_decision"] == "BLOCK"
    assert body["policy_decision"] == "BLOCK"
    assert body["approval_created"] is False
    assert executed == []
    for item in body["tools"]:
        assert item["decision"] == "BLOCK"
        assert item["executed"] is False
        assert item["approval_id"] is None


def test_instruction_override_and_tool_abuse_do_not_execute(monkeypatch) -> None:
    executed = track_executions(monkeypatch)
    enable_shield()
    override = run_attack("instruction-override")
    abuse = run_attack("tool-abuse")
    assert override["injection_detected"] is True
    assert override["firewall_decision"] in {"BLOCK", "APPROVAL_REQUIRED"}
    assert override["tool_execution"] is False
    assert abuse["firewall_decision"] == "BLOCK"
    assert abuse["tool_execution"] is False
    assert executed == []
