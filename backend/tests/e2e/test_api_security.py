"""API validation and error-response hygiene."""

from tests.e2e.helpers import blob_has_secret, client, enable_shield


def test_malformed_json_is_rejected() -> None:
    response = client.post(
        "/api/v1/chat",
        content=b"{not-json",
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code in {400, 422}
    assert "traceback" not in response.text.lower()
    assert "os.environ" not in response.text.lower()


def test_missing_chat_message_is_rejected() -> None:
    response = client.post("/api/v1/chat", json={})
    assert response.status_code == 422
    assert "traceback" not in response.text.lower()


def test_invalid_ids_and_enums_are_rejected() -> None:
    enable_shield()
    assert client.get("/api/v1/approvals/does-not-exist").status_code == 404
    assert client.post("/api/v1/approvals/does-not-exist/approve", json={}).status_code == 404
    assert client.post("/api/v1/attack-lab/run", json={"scenario_id": "not-real"}).status_code == 404
    assert client.get("/api/v1/audit/events/missing-event").status_code == 404
    invalid_decision = client.get("/api/v1/audit/events", params={"decision": "MAYBE"})
    assert invalid_decision.status_code == 422
    invalid_status = client.get("/api/v1/approvals", params={"status": "HACKED"})
    assert invalid_status.status_code == 422
    invalid_source = client.get("/api/v1/audit/events", params={"source_type": "ALIEN"})
    assert invalid_source.status_code == 422


def test_error_bodies_do_not_leak_secrets_or_stack_traces() -> None:
    enable_shield()
    responses = [
        client.post("/api/v1/chat", json={}),
        client.post("/api/v1/attack-lab/run", json={"scenario_id": "missing"}),
        client.post("/api/v1/approvals/nope/approve", json={}),
        client.get("/api/v1/audit/events", params={"decision": "NOPE"}),
    ]
    for response in responses:
        assert response.status_code >= 400
        assert "Traceback" not in response.text
        assert "File \"" not in response.text
        assert not blob_has_secret(response.text)
        assert ".venv" not in response.text
        assert "LLM_API_KEY" not in response.text
