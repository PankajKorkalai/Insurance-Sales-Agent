"""Database engine and session setup for Neon Postgres."""

from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session, sessionmaker

PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent

load_dotenv(PROJECT_ROOT / ".env")


def _build_url(raw_url: str | None) -> URL:
    """Normalise DATABASE_URL for SQLAlchemy + psycopg2 and enforce SSL for Neon."""
    if not raw_url:
        raise EnvironmentError(
            "DATABASE_URL is not set. Add it to the .env file in the project root."
        )
    url = make_url(raw_url)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg2")
    if "sslmode" not in url.query:
        url = url.update_query_dict({"sslmode": "require"})
    return url


DATABASE_URL: URL = _build_url(os.getenv("DATABASE_URL"))

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,      # Neon suspends idle computes; drop dead connections
    pool_recycle=300,
    pool_size=5,
    max_overflow=5,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: yields a session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
