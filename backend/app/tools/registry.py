from app.tools.browser import BrowserTool
from app.tools.email import EmailTool
from app.tools.filesystem import FileSystemTool
from app.tools.schemas import RiskLevel, ToolSpec

_browser = BrowserTool()
_filesystem = FileSystemTool()
_email = EmailTool()

TOOL_REGISTRY: dict[str, ToolSpec] = {
    "browse_url": ToolSpec(
        name="browse_url",
        description=_browser.description,
        risk_level=RiskLevel.MEDIUM,
        requires_confirmation=False,
        handler=_browser.browse_url,
    ),
    "list_files": ToolSpec(
        name="list_files",
        description="List files in the controlled mock filesystem.",
        risk_level=RiskLevel.LOW,
        requires_confirmation=False,
        handler=_filesystem.list_files,
    ),
    "read_file": ToolSpec(
        name="read_file",
        description="Read a single file from the controlled mock filesystem.",
        risk_level=RiskLevel.MEDIUM,
        requires_confirmation=False,
        handler=_filesystem.read_file,
    ),
    "send_email": ToolSpec(
        name="send_email",
        description=_email.description,
        risk_level=RiskLevel.HIGH,
        requires_confirmation=True,
        handler=_email.send_email,
    ),
}


def get_tool(name: str) -> ToolSpec:
    try:
        return TOOL_REGISTRY[name]
    except KeyError as exc:
        known = ", ".join(sorted(TOOL_REGISTRY))
        raise KeyError(f"Unknown tool '{name}'. Known tools: {known}") from exc
