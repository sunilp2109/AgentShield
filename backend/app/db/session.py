from collections.abc import Iterator
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db.base import Base

connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

_schema_ready = False


def _ensure_sqlite_directory() -> None:
    url = settings.database_url
    if not url.startswith("sqlite") or ":memory:" in url:
        return
    raw = url.split("sqlite:///", 1)[-1]
    if not raw:
        return
    Path(raw).expanduser().parent.mkdir(parents=True, exist_ok=True)


def init_db() -> None:
    """Create tables on the existing engine. Safe to call more than once."""
    global _schema_ready
    if _schema_ready:
        return
    _ensure_sqlite_directory()
    from app.db import models as _models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _schema_ready = True


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
