import pytest

from app.agent.state import ProposedToolCall
from app.security.gateway import dispatch_tool_calls
from app.security.state import shield_state
from app.security.trust_engine import (
    SOURCE_TRUST_RULES,
    SourceType,
    TrustAssessment,
    TrustLevel,
    assess_tool_result,
    assess_trust,
    infer_source_type,
)
from app.tools.browser import SAFE_PAGE_URL, BrowserTool
from app.tools.email import EmailTool
from app.tools.executor import execute_tool
from app.tools.filesystem import FileSystemTool


def test_source_type_trust_rules() -> None:
    expected = {
        SourceType.USER: TrustLevel.TRUSTED,
        SourceType.SYSTEM: TrustLevel.TRUSTED,
        SourceType.LOCAL_PRIVATE_FILE: TrustLevel.SENSITIVE,
        SourceType.WEBPAGE: TrustLevel.UNTRUSTED,
        SourceType.EMAIL: TrustLevel.UNTRUSTED,
        SourceType.PDF: TrustLevel.UNTRUSTED,
        SourceType.TOOL_RESPONSE: TrustLevel.UNTRUSTED,
        SourceType.EXTERNAL_API: TrustLevel.UNTRUSTED,
    }
    assert SOURCE_TRUST_RULES == expected
    for source, level in expected.items():
        assessment = assess_trust(source, {"origin": "unit-test"})
        assert isinstance(assessment, TrustAssessment)
        assert assessment.source_type == source
        assert assessment.trust_level == level
        assert assessment.reason
        assert "origin=unit-test" in assessment.reason


def test_assess_trust_accepts_string_source_type() -> None:
    assessment = assess_trust("webpage", {"url": "https://intranet.acme.local/handbook"})
    assert assessment.source_type == SourceType.WEBPAGE
    assert assessment.trust_level == TrustLevel.UNTRUSTED
    assert "url=https://intranet.acme.local/handbook" in assessment.reason


def test_assess_trust_rejects_unknown_source_type() -> None:
    with pytest.raises(ValueError, match="Unknown source type"):
        assess_trust("social_media")


def test_local_pdf_is_refined_to_untrusted() -> None:
    assessment = assess_trust(SourceType.LOCAL_PRIVATE_FILE, {"path": "contract.pdf"})
    assert assessment.source_type == SourceType.PDF
    assert assessment.trust_level == TrustLevel.UNTRUSTED


def test_infer_source_type_for_registered_tools() -> None:
    assert infer_source_type("browse_url") == SourceType.WEBPAGE
    assert infer_source_type("list_files") == SourceType.LOCAL_PRIVATE_FILE
    assert infer_source_type("read_file", {"path": "invoice.txt"}) == SourceType.LOCAL_PRIVATE_FILE
    assert infer_source_type("read_file", {"path": "manual.pdf"}) == SourceType.PDF
    assert infer_source_type("send_email") == SourceType.TOOL_RESPONSE
    assert infer_source_type("unknown_tool") == SourceType.TOOL_RESPONSE


def test_browse_url_result_carries_untrusted_webpage_metadata() -> None:
    result = BrowserTool().browse_url(SAFE_PAGE_URL)
    assert result.trust.source_type == SourceType.WEBPAGE
    assert result.trust.trust_level == TrustLevel.UNTRUSTED


def test_read_file_result_carries_sensitive_local_file_metadata() -> None:
    result = FileSystemTool().read_file("invoice.txt")
    assert result.trust.source_type == SourceType.LOCAL_PRIVATE_FILE
    assert result.trust.trust_level == TrustLevel.SENSITIVE
    assert "path=invoice.txt" in result.trust.reason


def test_list_files_result_carries_sensitive_metadata() -> None:
    result = FileSystemTool().list_files()
    assert result.trust.source_type == SourceType.LOCAL_PRIVATE_FILE
    assert result.trust.trust_level == TrustLevel.SENSITIVE


def test_send_email_result_carries_untrusted_tool_response_metadata() -> None:
    result = EmailTool().send_email("ops@acme.local", "Hi", "Body")
    assert result.trust.source_type == SourceType.TOOL_RESPONSE
    assert result.trust.trust_level == TrustLevel.UNTRUSTED


def test_executor_always_stamps_trust_metadata() -> None:
    result = execute_tool("read_file", {"path": "report.txt"})
    assert "trust" in result
    assert result["trust"]["source_type"] == SourceType.LOCAL_PRIVATE_FILE.value
    assert result["trust"]["trust_level"] == TrustLevel.SENSITIVE.value


def test_dispatch_attaches_trust_to_executed_tool_runs() -> None:
    shield_state.set_enabled(False)
    runs = dispatch_tool_calls(
        [ProposedToolCall(name="browse_url", arguments={"url": SAFE_PAGE_URL})]
    )
    assert runs[0].trust is not None
    assert runs[0].trust.source_type == SourceType.WEBPAGE
    assert runs[0].trust.trust_level == TrustLevel.UNTRUSTED
    assert runs[0].result["trust"]["trust_level"] == TrustLevel.UNTRUSTED.value


def test_assess_tool_result_matches_inference() -> None:
    assessment = assess_tool_result("browse_url", {"url": SAFE_PAGE_URL})
    assert assessment.source_type == SourceType.WEBPAGE
    assert assessment.trust_level == TrustLevel.UNTRUSTED
