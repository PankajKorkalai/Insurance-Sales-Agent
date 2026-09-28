"""Embeds processed chunks with Azure OpenAI and stores them in a persistent ChromaDB."""

from __future__ import annotations

import json
import sys
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

import chromadb
from chromadb.api.models.Collection import Collection

from config import PROJECT_ROOT, get_embedding

CHROMA_DB_DIR: Path = PROJECT_ROOT / ".chroma_db"
PROCESSED_CHUNKS_DIR: Path = PROJECT_ROOT / "data" / "processed_chunks"
COLLECTION_NAME: str = "motor_insurance_chunks"

BATCH_SIZE: int = 20
BATCH_DELAY_SECONDS: float = 1.0

EXCLUDED_METADATA_FIELDS: frozenset[str] = frozenset({"content", "chunk_id"})


@lru_cache(maxsize=1)
def get_collection() -> Collection:
    """Open (or create) the persistent collection, using cosine distance."""
    try:
        client = chromadb.PersistentClient(path=str(CHROMA_DB_DIR))
        return client.get_or_create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
    except Exception as exc:
        raise RuntimeError(
            f"Failed to open ChromaDB collection '{COLLECTION_NAME}' at {CHROMA_DB_DIR}: "
            f"{type(exc).__name__}: {exc}"
        ) from exc


def _to_metadata(chunk: dict[str, Any]) -> dict[str, str | int | float | bool]:
    """ChromaDB metadata only accepts scalar, non-null values."""
    metadata: dict[str, str | int | float | bool] = {}
    for key, value in chunk.items():
        if key in EXCLUDED_METADATA_FIELDS or value is None:
            continue
        metadata[key] = value if isinstance(value, (str, int, float, bool)) else str(value)
    return metadata


def embed_and_store_chunks(
    chunks: list[dict[str, Any]],
    batch_size: int = BATCH_SIZE,
    delay_seconds: float = BATCH_DELAY_SECONDS,
) -> int:
    """Embed each chunk's content and upsert into ChromaDB. Returns the number stored.

    Chunks whose embedding fails are skipped and reported; re-running is safe
    because records are upserted by chunk_id.
    """
    collection = get_collection()

    seen: set[str] = set()
    unique_chunks: list[dict[str, Any]] = []
    for chunk in chunks:
        chunk_id = chunk.get("chunk_id")
        content = (chunk.get("content") or "").strip()
        if not chunk_id or not content:
            print(f"  [warn] Skipping chunk with missing chunk_id or content: {chunk_id!r}")
            continue
        if chunk_id in seen:
            print(f"  [warn] Duplicate chunk_id '{chunk_id}' - keeping the first occurrence.")
            continue
        seen.add(chunk_id)
        unique_chunks.append(chunk)

    total = len(unique_chunks)
    stored = 0
    failed: list[str] = []

    for start in range(0, total, batch_size):
        batch = unique_chunks[start : start + batch_size]
        ids: list[str] = []
        embeddings: list[list[float]] = []
        documents: list[str] = []
        metadatas: list[dict[str, str | int | float | bool]] = []

        for chunk in batch:
            try:
                vector = get_embedding(chunk["content"])
            except (RuntimeError, ValueError, EnvironmentError) as exc:
                print(f"  [error] Embedding failed for '{chunk['chunk_id']}': {exc}")
                failed.append(chunk["chunk_id"])
                continue
            ids.append(chunk["chunk_id"])
            embeddings.append(vector)
            documents.append(chunk["content"])
            metadatas.append(_to_metadata(chunk))

        if ids:
            try:
                collection.upsert(
                    ids=ids,
                    embeddings=embeddings,
                    documents=documents,
                    metadatas=metadatas,
                )
            except Exception as exc:
                raise RuntimeError(
                    f"ChromaDB upsert failed for batch starting at chunk {start + 1}: "
                    f"{type(exc).__name__}: {exc}"
                ) from exc
            stored += len(ids)

        print(f"Embedded {min(start + batch_size, total)}/{total} chunks")
        if start + batch_size < total:
            time.sleep(delay_seconds)

    if failed:
        print(f"  [warn] {len(failed)} chunk(s) failed to embed: {', '.join(failed)}")
    return stored


def remove_stale_chunks(company: str, document_type: str, keep_ids: set[str]) -> int:
    """Delete stored chunks for a document whose ids are no longer in the JSON file."""
    collection = get_collection()
    try:
        existing = collection.get(
            where={"$and": [{"company": company}, {"document_type": document_type}]},
            include=[],
        )
        stale = [chunk_id for chunk_id in existing["ids"] if chunk_id not in keep_ids]
        if stale:
            collection.delete(ids=stale)
        return len(stale)
    except Exception as exc:
        raise RuntimeError(
            f"ChromaDB cleanup failed for {company} / {document_type}: {type(exc).__name__}: {exc}"
        ) from exc


def store_chunk_file(path: Path) -> int:
    """Embed and store one processed-chunks JSON file, then drop its stale chunks."""
    print(f"\nLoading {path.name}")
    try:
        chunks: list[dict[str, Any]] = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"  [error] Could not read {path.name}: {exc}")
        return 0
    if not chunks:
        print("  [warn] File is empty, skipping.")
        return 0

    try:
        stored = embed_and_store_chunks(chunks)
        keep_ids = {c["chunk_id"] for c in chunks if c.get("chunk_id")}
        documents = {(c.get("company"), c.get("document_type")) for c in chunks}
        for company, document_type in documents:
            if company and document_type:
                removed = remove_stale_chunks(company, document_type, keep_ids)
                if removed:
                    print(f"  Removed {removed} stale chunk(s) for {company} / {document_type}")
        return stored
    except RuntimeError as exc:
        print(f"  [error] {exc}")
        return 0


def main() -> int:
    json_files = sorted(PROCESSED_CHUNKS_DIR.glob("*.json"))
    if not json_files:
        print(f"No chunk files found in {PROCESSED_CHUNKS_DIR}. Run src/ingest.py first.")
        return 1

    grand_total = sum(store_chunk_file(path) for path in json_files)

    try:
        count = get_collection().count()
    except Exception as exc:
        print(f"[error] Could not count collection: {exc}")
        return 1
    print(f"\nStored {grand_total} chunks this run. Collection '{COLLECTION_NAME}' now holds {count}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
