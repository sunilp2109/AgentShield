"""Repeated demo runs, concurrent request isolation, and refresh consistency."""

from concurrent.futures import ThreadPoolExecutor

from tests.e2e.helpers import (
    MANAGER_EMAIL_PROMPT,
    SAFE_DOC_PROMPT,
    audit_events,
    chat,
    client,
    disable_shield,
    enable_shield,
    pending_approvals,
    run_attack,
    track_executions,
)


def test_malicious_pdf_is_deterministic_across_five_runs(monkeypatch) -> None:
    track_executions(monkeypatch)
    enable_shield()
    results = [run_attack("malicious-pdf") for _ in range(5)]
    decisions = {item["firewall_decision"] for item in results}
    assert decisions == {"BLOCK"}
    assert all(item["tool_execution"] is False for item in results)
    assert all(item["injection_detected"] is True for item in results)
    assert len({item["request_id"] for item in results}) == 5
    assert len({item["session_id"] for item in results}) >= 1


def test_full_demo_history_remains_queryable(monkeypatch) -> None:
    track_executions(monkeypatch)
    enable_shield()
    chat(SAFE_DOC_PROMPT, "e2e-history-safe")
    email = chat(MANAGER_EMAIL_PROMPT, "e2e-history-email")
    approval_id = next(item["approval_id"] for item in email["tool_results"] if item.get("approval_id"))
    client.post(f"/api/v1/approvals/{approval_id}/approve", json={})
    run_attack("malicious-pdf")
    disable_shield()
    run_attack("malicious-pdf")
    enable_shield()
    run_attack("malicious-pdf")
    events = audit_events(limit=200)
    decisions = {event["firewall_decision"] for event in events}
    assert {"ALLOW", "BLOCK", "BYPASS"}.issubset(decisions)


def test_concurrent_safe_requests_keep_distinct_ids(monkeypatch) -> None:
    track_executions(monkeypatch)
    enable_shield()

    def run(index: int):
        return chat(SAFE_DOC_PROMPT, f"e2e-concurrent-{index}")

    with ThreadPoolExecutor(max_workers=3) as pool:
        payloads = list(pool.map(run, range(3)))
    request_ids = []
    for payload in payloads:
        events = audit_events(session_id=payload["session_id"], limit=20)
        request_ids.extend(event["request_id"] for event in events)
        assert payload["session_id"].startswith("e2e-concurrent-")
        assert all(event["session_id"] == payload["session_id"] for event in events)
    assert len(set(request_ids)) >= 3


def test_shield_and_approval_state_survive_repeated_reads() -> None:
    enable_shield()
    first = client.get("/api/v1/security/status").json()
    second = client.get("/api/v1/security/status").json()
    assert first["shield_enabled"] is True
    assert second["shield_enabled"] is True
    disable_shield()
    assert client.get("/api/v1/security/status").json()["shield_enabled"] is False
    enable_shield()
    email = chat(MANAGER_EMAIL_PROMPT, "e2e-refresh-approval")
    approval_id = next(item["approval_id"] for item in email["tool_results"] if item.get("approval_id"))
    listed = pending_approvals()
    again = pending_approvals()
    assert any(item["id"] == approval_id for item in listed)
    assert any(item["id"] == approval_id for item in again)
    client.post(f"/api/v1/approvals/{approval_id}/approve", json={})
    assert all(item["id"] != approval_id for item in pending_approvals())
    stored = client.get(f"/api/v1/approvals/{approval_id}").json()
    assert stored["status"] in {"EXECUTED", "EXECUTION_FAILED"}
    if stored["status"] == "EXECUTED":
        assert stored["execution_status"] == "EXECUTED"
