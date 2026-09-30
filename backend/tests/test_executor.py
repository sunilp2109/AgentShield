from app.agent.state import ProposedToolCall
from app.tools.executor import execute_tool, execute_tool_calls


def test_executor_reads_mock_file() -> None:
    result = execute_tool("read_file", {"path": "invoice.txt"})
    assert result["status"] == "ok"
    assert "INV-1042" in result["content"]
    assert result["trust"]["trust_level"] == "SENSITIVE"


def test_executor_runs_proposed_calls() -> None:
    results = execute_tool_calls(
        [ProposedToolCall(name="list_files", arguments={})]
    )
    assert results[0]["name"] == "list_files"
    assert "invoice.txt" in results[0]["result"]["files"]
