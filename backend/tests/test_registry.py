import pytest

from app.tools.browser import SAFE_PAGE_URL
from app.tools.registry import TOOL_REGISTRY, get_tool
from app.tools.schemas import RiskLevel, ToolSpec

REQUIRED_METADATA = ("name", "description", "risk_level", "requires_confirmation")


def test_registry_contains_all_tools() -> None:
    assert set(TOOL_REGISTRY) == {"browse_url", "list_files", "read_file", "send_email"}


def test_registry_entries_include_required_metadata() -> None:
    for name, spec in TOOL_REGISTRY.items():
        assert isinstance(spec, ToolSpec)
        assert spec.name == name
        assert spec.description
        assert spec.risk_level in RiskLevel
        assert isinstance(spec.requires_confirmation, bool)
        for field in REQUIRED_METADATA:
            assert hasattr(spec, field)


def test_send_email_is_high_risk_and_needs_confirmation() -> None:
    spec = TOOL_REGISTRY["send_email"]
    assert spec.risk_level == RiskLevel.HIGH
    assert spec.requires_confirmation is True


def test_registry_handlers_invoke_tools() -> None:
    browse = TOOL_REGISTRY["browse_url"].handler(SAFE_PAGE_URL)
    listed = TOOL_REGISTRY["list_files"].handler()
    invoice = TOOL_REGISTRY["read_file"].handler("invoice.txt")
    mailed = TOOL_REGISTRY["send_email"].handler(
        "ops@acme.local",
        "Ping",
        "Simulated only",
        ["report.txt"],
    )
    assert browse.status == "ok"
    assert "invoice.txt" in listed.files
    assert invoice.status == "ok"
    assert mailed.status == "simulated"


def test_get_tool_unknown_name() -> None:
    with pytest.raises(KeyError, match="Unknown tool"):
        get_tool("run_shell")
