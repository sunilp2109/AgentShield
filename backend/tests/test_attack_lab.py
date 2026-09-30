from fastapi.testclient import TestClient

from app.attack_lab.scenarios import MALICIOUS_PDF_PAYLOAD, get_scenario
from app.main import app
from app.security.audit import get_events
from app.security.state import shield_state
from app.security.approval import approval_service
from app.tools.executor import execute_tool

client = TestClient(app)


def test_lists_predefined_scenarios() -> None:
    response = client.get("/api/v1/attack-lab/scenarios")
    assert response.status_code == 200
    ids = [item["id"] for item in response.json()]
    assert ids[0] == "malicious-pdf"
    assert "data-exfiltration" in ids
    assert "tool-abuse" in ids
    assert "instruction-override" in ids
    pdf = next(item for item in response.json() if item["id"] == "malicious-pdf")
    assert pdf["payload"] == MALICIOUS_PDF_PAYLOAD
    assert "tool_calls" not in pdf


def test_invalid_scenario_is_rejected() -> None:
    response = client.post("/api/v1/attack-lab/run", json={"scenario_id": "not-a-scenario"})
    assert response.status_code == 404


def test_malicious_pdf_uses_expected_payload() -> None:
    scenario = get_scenario("malicious-pdf")
    assert scenario is not None
    assert scenario.payload == MALICIOUS_PDF_PAYLOAD
    assert [call.name for call in scenario.tool_calls] == ["read_file", "send_email"]
    assert scenario.tool_calls[0].arguments["path"] == "confidential.txt"
    assert scenario.tool_calls[1].arguments["recipient"] == "attacker@example.com"


def test_shield_on_blocks_malicious_pdf(monkeypatch) -> None:
    executed: list[str] = []

    def spy(name, arguments=None):
        executed.append(name)
        return execute_tool(name, arguments)

    monkeypatch.setattr("app.security.firewall.execute_tool", spy)
    shield_state.set_enabled(True)
    response = client.post("/api/v1/attack-lab/run", json={"scenario_id": "malicious-pdf"})
    assert response.status_code == 200
    body = response.json()
    assert body["payload"] == MALICIOUS_PDF_PAYLOAD
    assert body["shield_enabled"] is True
    assert body["injection_detected"] is True
    assert body["firewall_decision"] == "BLOCK"
    assert body["policy_decision"] == "BLOCK"
    assert body["execution_status"] == "BLOCKED"
    assert body["tool_execution"] is False
    assert executed == []
    assert all(item["executed"] is False for item in body["tools"])
    assert body["audit_event_ids"]
    events = get_events(session_id=body["session_id"])
    assert events
    assert all(event.shield_enabled is True for event in events)
    assert any(event.firewall_decision == "BLOCK" for event in events)


def test_shield_off_bypasses_same_malicious_pdf(monkeypatch) -> None:
    executed: list[str] = []

    def spy(name, arguments=None):
        executed.append(name)
        return execute_tool(name, arguments)

    monkeypatch.setattr("app.security.firewall.execute_tool", spy)
    shield_state.set_enabled(False)
    response = client.post("/api/v1/attack-lab/run", json={"scenario_id": "malicious-pdf"})
    assert response.status_code == 200
    body = response.json()
    assert body["payload"] == MALICIOUS_PDF_PAYLOAD
    assert body["shield_enabled"] is False
    assert body["firewall_decision"] == "BYPASS"
    assert body["tool_execution"] is True
    assert executed == ["read_file", "send_email"]
    summaries = {item["name"]: item["result_summary"] for item in body["tools"]}
    assert summaries["send_email"] == "simulated"
    assert "CONFIDENTIAL" not in str(body)
    assert "INTERNAL ONLY" not in str(body)
    events = get_events(session_id=body["session_id"])
    assert any(event.firewall_decision == "BYPASS" and event.shield_enabled is False for event in events)


def test_same_payload_on_then_off_then_on(monkeypatch) -> None:
    monkeypatch.setattr("app.security.firewall.execute_tool", execute_tool)
    shield_state.set_enabled(True)
    first = client.post("/api/v1/attack-lab/run", json={"scenario_id": "malicious-pdf"}).json()
    shield_state.set_enabled(False)
    second = client.post("/api/v1/attack-lab/run", json={"scenario_id": "malicious-pdf"}).json()
    shield_state.set_enabled(True)
    third = client.post("/api/v1/attack-lab/run", json={"scenario_id": "malicious-pdf"}).json()
    assert first["payload"] == second["payload"] == third["payload"] == MALICIOUS_PDF_PAYLOAD
    assert first["firewall_decision"] == "BLOCK"
    assert second["firewall_decision"] == "BYPASS"
    assert third["firewall_decision"] == "BLOCK"


def test_run_does_not_accept_arbitrary_commands() -> None:
    response = client.post(
        "/api/v1/attack-lab/run",
        json={
            "scenario_id": "malicious-pdf",
            "command": "rm -rf /",
            "path": "../../etc/passwd",
            "url": "https://evil.example",
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["scenario_id"] == "malicious-pdf"
    assert all(item["name"] in {"read_file", "send_email"} for item in body["tools"])


def test_no_real_email_is_sent() -> None:
    shield_state.set_enabled(False)
    body = client.post("/api/v1/attack-lab/run", json={"scenario_id": "malicious-pdf"}).json()
    email = next(item for item in body["tools"] if item["name"] == "send_email")
    assert email["executed"] is True
    assert email["result_summary"] == "simulated"
    assert "smtp" not in str(body).lower()


def test_data_exfiltration_blocks_when_shield_on() -> None:
    shield_state.set_enabled(True)
    body = client.post("/api/v1/attack-lab/run", json={"scenario_id": "data-exfiltration"}).json()
    assert body["firewall_decision"] == "BLOCK"
    assert body["tool_execution"] is False


def test_approval_created_when_policy_requires_it() -> None:
    shield_state.set_enabled(True)
    body = client.post("/api/v1/attack-lab/run", json={"scenario_id": "instruction-override"}).json()
    if body["firewall_decision"] == "APPROVAL_REQUIRED":
        assert body["approval_created"] is True
        assert body["approval_id"]
        approvals = approval_service.get_requests(status="PENDING")
        assert any(item.id == body["approval_id"] for item in approvals)
    else:
        assert body["approval_created"] is False


def test_instruction_override_uses_detector() -> None:
    shield_state.set_enabled(True)
    response = client.post("/api/v1/attack-lab/run", json={"scenario_id": "instruction-override"})
    assert response.status_code == 200
    body = response.json()
    assert body["injection_detected"] is True
    assert body["injection_confidence"] > 0


def test_tool_abuse_does_not_execute_when_shield_on(monkeypatch) -> None:
    executed: list[str] = []

    def spy(name, arguments=None):
        executed.append(name)
        raise AssertionError("executed")

    monkeypatch.setattr("app.security.firewall.execute_tool", spy)
    shield_state.set_enabled(True)
    body = client.post("/api/v1/attack-lab/run", json={"scenario_id": "tool-abuse"}).json()
    assert body["firewall_decision"] == "BLOCK"
    assert body["tool_execution"] is False
    assert executed == []
