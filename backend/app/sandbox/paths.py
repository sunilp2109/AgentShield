from pathlib import Path

from app.config import settings


def sandbox_root() -> Path:
    configured = Path(settings.sandbox_fs_root)
    if configured.is_absolute():
        return configured.resolve()
    backend_root = Path(__file__).resolve().parents[2]
    return (backend_root / configured).resolve()


def resolve_sandbox_path(relative: str) -> Path:
    root = sandbox_root()
    candidate = Path(relative)
    if candidate.is_absolute() or "\x00" in relative:
        raise PermissionError("Path escapes the controlled mock filesystem.")
    resolved = (root / relative).resolve()
    if not resolved.is_relative_to(root):
        raise PermissionError("Path escapes the controlled mock filesystem.")
    return resolved
