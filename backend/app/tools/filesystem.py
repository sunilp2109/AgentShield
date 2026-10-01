from pathlib import Path

from app.tools.schemas import ListFilesResult, ReadFileResult


def default_files_root() -> Path:
    return Path(__file__).resolve().parents[2] / "mock_data" / "files"


class PathEscapeError(PermissionError):
    """Raised when a filesystem tool call tries to leave mock_data/files."""


class FileSystemTool:
    name = "filesystem"
    description = "List and read files inside the controlled mock_data/files directory only."

    def __init__(self, root: Path | None = None) -> None:
        self.root = (root or default_files_root()).resolve()

    def list_files(self) -> ListFilesResult:
        from app.security.trust_engine import SourceType, assess_trust

        root = self._require_root()
        files = sorted(path.name for path in root.iterdir() if path.is_file())
        return ListFilesResult(
            files=files,
            status="ok",
            trust=assess_trust(SourceType.LOCAL_PRIVATE_FILE, {"tool": "list_files"}),
        )

    def read_file(self, path: str) -> ReadFileResult:
        from app.security.trust_engine import SourceType, assess_trust

        target = self._resolve_inside_root(path)
        if not target.is_file():
            raise FileNotFoundError(f"File not found: {path}")
        return ReadFileResult(
            path=target.name,
            content=target.read_text(encoding="utf-8"),
            status="ok",
            trust=assess_trust(SourceType.LOCAL_PRIVATE_FILE, {"path": target.name, "tool": "read_file"}),
        )

    def _require_root(self) -> Path:
        if not self.root.is_dir():
            raise FileNotFoundError(f"Mock filesystem root does not exist: {self.root}")
        return self.root

    def _resolve_inside_root(self, path: str) -> Path:
        if not path or not path.strip():
            raise PathEscapeError("Path escapes the controlled mock filesystem.")
        if "\x00" in path:
            raise PathEscapeError("Path escapes the controlled mock filesystem.")

        candidate = Path(path)
        if candidate.is_absolute():
            raise PathEscapeError("Path escapes the controlled mock filesystem.")

        root = self._require_root()
        resolved = (root / path).resolve()
        if not resolved.is_relative_to(root):
            raise PathEscapeError("Path escapes the controlled mock filesystem.")
        return resolved
