"""Same malicious PDF with Shield OFF then ON again."""

from app.attack_lab.scenarios import MALICIOUS_PDF_PAYLOAD

from tests.e2e.helpers import (
    disable_shield,
    enable_shield,
    run_attack,
    track_executions,
)


def test_same_malicious_pdf_bypasses_when_shield_off(monkeypatch) -> None:
    executed = track_executions(monkeypatch)
    disable_shield()
    body = run_attack("malicious-pdf")
    assert body["payload"] == MALICIOUS_PDF_PAYLOAD
    assert body["shield_enabled"] is False
    assert body["firewall_decision"] == "BYPASS"
    if body["execution_status"] == "EXECUTED":
        assert body["tool_execution"] is True
        assert [name for name, _args in executed] == ["read_file", "send_email"]
    else:
        assert executed == []


def test_same_malicious_pdf_is_blocked_when_shield_returns_on(monkeypatch) -> None:
    executed = track_executions(monkeypatch)
    disable_shield()
    off = run_attack("malicious-pdf")
    off_count = len(executed)
    enable_shield()
    on = run_attack("malicious-pdf")
    assert off["payload"] == on["payload"] == MALICIOUS_PDF_PAYLOAD
    assert off["firewall_decision"] == "BYPASS"
    assert on["shield_enabled"] is True
    assert on["injection_detected"] is True
    assert on["policy_decision"] == "BLOCK"
    assert on["firewall_decision"] == "BLOCK"
    assert on["execution_status"] == "BLOCKED"
    assert on["tool_execution"] is False
    assert on["approval_created"] is False
    assert len(executed) == off_count
