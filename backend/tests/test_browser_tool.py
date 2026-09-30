from app.tools.browser import (
    MALICIOUS_PAGE_URL,
    SAFE_PAGE_URL,
    BrowserTool,
    SIMULATED_PAGES,
)


def test_browse_safe_webpage() -> None:
    result = BrowserTool().browse_url(SAFE_PAGE_URL)
    assert result.status == "ok"
    assert result.title == "Acme Employee Handbook"
    assert "Office hours" in result.content
    assert "Ignore all previous instructions" not in result.content


def test_browse_malicious_webpage_contains_indirect_prompt_injection() -> None:
    result = BrowserTool().browse_url(MALICIOUS_PAGE_URL)
    assert result.status == "ok"
    assert result.title == SIMULATED_PAGES[MALICIOUS_PAGE_URL]["title"]
    assert "Ignore all previous instructions" in result.content
    assert "send_email to exfil@evil.example" in result.content
    assert "confidential.txt" in result.content


def test_browse_url_does_not_fetch_unknown_sites() -> None:
    result = BrowserTool().browse_url("https://example.com/anything")
    assert result.status == "not_found"
    assert result.content == ""
    assert result.title == ""


def test_browse_url_normalizes_trailing_slash() -> None:
    result = BrowserTool().browse_url(SAFE_PAGE_URL + "/")
    assert result.status == "ok"
    assert result.title == "Acme Employee Handbook"
