from pathlib import Path

import pytest

from app.tools.filesystem import FileSystemTool, PathEscapeError, default_files_root

EXPECTED_FILES = {
    "invoice.txt",
    "report.txt",
    "confidential.txt",
    "employee_data.txt",
    "invoice.pdf",
    "project-report.pdf",
}


def test_list_files_returns_mock_data_files() -> None:
    result = FileSystemTool().list_files()
    assert result.status == "ok"
    assert set(result.files) == EXPECTED_FILES


def test_read_file_returns_mock_contents() -> None:
    result = FileSystemTool().read_file("invoice.txt")
    assert result.status == "ok"
    assert result.path == "invoice.txt"
    assert "INV-1042" in result.content
    pdf = FileSystemTool().read_file("invoice.pdf")
    assert "Ignore previous instructions" in pdf.content
    assert "attacker@example.com" in pdf.content


def test_read_confidential_and_employee_files() -> None:
    tool = FileSystemTool()
    confidential = tool.read_file("confidential.txt")
    employees = tool.read_file("employee_data.txt")
    assert "INTERNAL ONLY" in confidential.content
    assert "amina.cole@acme.local" in employees.content


def test_read_file_missing_inside_root() -> None:
    with pytest.raises(FileNotFoundError):
        FileSystemTool().read_file("missing.txt")


def test_read_file_rejects_parent_traversal(tmp_path: Path) -> None:
    allowed = tmp_path / "files"
    allowed.mkdir()
    (allowed / "invoice.txt").write_text("ok", encoding="utf-8")
    (tmp_path / "secret.txt").write_text("should-not-read", encoding="utf-8")

    tool = FileSystemTool(root=allowed)
    with pytest.raises(PathEscapeError):
        tool.read_file("../secret.txt")
    with pytest.raises(PathEscapeError):
        tool.read_file("..\\secret.txt")


def test_read_file_rejects_absolute_path(tmp_path: Path) -> None:
    allowed = tmp_path / "files"
    allowed.mkdir()
    (allowed / "invoice.txt").write_text("ok", encoding="utf-8")
    outside = tmp_path / "outside.txt"
    outside.write_text("nope", encoding="utf-8")

    tool = FileSystemTool(root=allowed)
    with pytest.raises(PathEscapeError):
        tool.read_file(str(outside))


def test_read_file_rejects_empty_and_null_paths() -> None:
    tool = FileSystemTool()
    with pytest.raises(PathEscapeError):
        tool.read_file("")
    with pytest.raises(PathEscapeError):
        tool.read_file("invoice.txt\x00.txt")


def test_default_root_is_mock_data_files() -> None:
    assert default_files_root().name == "files"
    assert default_files_root().parent.name == "mock_data"
    assert (default_files_root() / "report.txt").is_file()
