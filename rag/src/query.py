"""Retrieval, cross-company comparison and cited Q&A over the motor insurance chunks."""

from __future__ import annotations

import sys
from typing import Any

from config import get_chat_completion, get_embedding
from embed_store import get_collection

METADATA_FIELDS: tuple[str, ...] = (
    "company",
    "document_type",
    "section_number",
    "section_title",
    "parent_category",
    "related_addon",
    "source_type",
    "retrieved_date",
)

PARENT_CATEGORIES: tuple[str, ...] = (
    "coverage", "addons", "exclusions", "claims", "ncb", "definitions",
)
RELATED_ADDONS: tuple[str, ...] = (
    "zero_dep", "engine_protection", "roadside_assistance",
    "consumables", "return_to_invoice", "key_replacement",
)

SYSTEM_PROMPT = """You are an assistant that compares motor insurance policy documents \
from different insurance companies.

Follow these rules strictly:
1. Answer ONLY using the information in the provided chunks. Never use outside \
knowledge. If the chunks do not contain the answer, say so plainly.
2. Cite every claim with "(Source: {company} - Section {section_number})", using the \
company and section number given in the chunk header exactly. If a chunk's section \
number is "unnumbered", write "Section unnumbered".
3. If chunks from different companies conflict or differ, state the difference \
explicitly for each company rather than picking one.
4. Check the source_type of every chunk you use. If any is "third-party" or \
"sample", you MUST end the answer with a line starting "Verification note:" that \
names those companies and says the figures should be verified against each \
company's official policy document."""


def _build_where(filters: dict[str, Any] | None) -> dict[str, Any] | None:
    """Turn {"company": "HDFC ERGO", "related_addon": [...]} into a ChromaDB where clause."""
    if not filters:
        return None
    clauses: list[dict[str, Any]] = []
    for key, value in filters.items():
        if value is None:
            continue
        if isinstance(value, (list, tuple, set)):
            clauses.append({key: {"$in": list(value)}})
        else:
            clauses.append({key: value})
    if not clauses:
        return None
    return clauses[0] if len(clauses) == 1 else {"$and": clauses}


def search_chunks(
    query: str,
    n_results: int = 5,
    filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Semantic search over stored chunks, optionally filtered on metadata.

    Returns dicts with chunk_id, content, metadata, distance (cosine) and
    similarity (1 - distance).
    """
    if not query.strip():
        return []

    query_embedding = get_embedding(query)
    collection = get_collection()
    where = _build_where(filters)

    try:
        result = collection.query(
            query_embeddings=[query_embedding],
            n_results=n_results,
            where=where,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as exc:
        raise RuntimeError(
            f"ChromaDB query failed (filters={filters}): {type(exc).__name__}: {exc}"
        ) from exc

    ids = result.get("ids", [[]])[0]
    documents = (result.get("documents") or [[]])[0]
    metadatas = (result.get("metadatas") or [[]])[0]
    distances = (result.get("distances") or [[]])[0]

    matches: list[dict[str, Any]] = []
    for chunk_id, content, metadata, distance in zip(ids, documents, metadatas, distances):
        full_metadata = {field: None for field in METADATA_FIELDS}
        full_metadata.update(metadata or {})
        matches.append({
            "chunk_id": chunk_id,
            "content": content,
            "metadata": full_metadata,
            "distance": distance,
            "similarity": 1.0 - distance,
        })
    return matches


def compare_across_companies(
    query: str,
    companies: list[str],
    n_results_per_company: int = 3,
    filters: dict[str, Any] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Run the same search once per company and group results by company.

    `filters` (e.g. {"related_addon": "zero_dep"}) is applied on top of the
    per-company filter.
    """
    comparison: dict[str, list[dict[str, Any]]] = {}
    for company in companies:
        try:
            comparison[company] = search_chunks(
                query,
                n_results=n_results_per_company,
                filters={**(filters or {}), "company": company},
            )
        except RuntimeError as exc:
            print(f"[error] Search failed for {company}: {exc}")
            comparison[company] = []
    return comparison


def _format_context(chunks: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for i, chunk in enumerate(chunks, start=1):
        meta = chunk["metadata"]
        section = meta.get("section_number") or "unnumbered"
        title = f" ({meta['section_title']})" if meta.get("section_title") else ""
        blocks.append(
            f"[Chunk {i}]\n"
            f"Company: {meta.get('company') or 'unknown'}\n"
            f"Section: {section}{title}\n"
            f"Document type: {meta.get('document_type') or 'unknown'}\n"
            f"source_type: {meta.get('source_type') or 'official'}\n"
            f"Content:\n{chunk['content']}"
        )
    return "\n\n---\n\n".join(blocks)


def answer_from_chunks(query: str, chunks: list[dict[str, Any]]) -> str:
    """Generate a cited answer to `query` using only the given chunks."""
    if not chunks:
        return "No matching policy sections were found for this question (check your filters or run ingestion/embedding first)."

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Policy document chunks:\n\n{_format_context(chunks)}\n\n"
                f"Question: {query}"
            ),
        },
    ]
    try:
        return get_chat_completion(messages)
    except (RuntimeError, EnvironmentError) as exc:
        return f"[error] Answer generation failed: {exc}"


def ask_with_citation(
    query: str,
    filters: dict[str, Any] | None = None,
    n_results: int = 5,
) -> str:
    """Answer `query` from retrieved chunks only, with per-claim section citations."""
    try:
        chunks = search_chunks(query, n_results=n_results, filters=filters)
    except (RuntimeError, ValueError, EnvironmentError) as exc:
        return f"[error] Retrieval failed: {exc}"
    return answer_from_chunks(query, chunks)


def list_chunks(filters: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    """Return stored chunks (id + metadata, no embedding search) matching `filters`."""
    try:
        result = get_collection().get(where=_build_where(filters), include=["metadatas"])
    except Exception as exc:
        raise RuntimeError(f"ChromaDB get failed: {type(exc).__name__}: {exc}") from exc
    rows: list[dict[str, Any]] = []
    for chunk_id, metadata in zip(result["ids"], result["metadatas"] or []):
        full_metadata = {field: None for field in METADATA_FIELDS}
        full_metadata.update(metadata or {})
        rows.append({"chunk_id": chunk_id, "metadata": full_metadata})
    return rows


def get_chunk(chunk_id: str) -> dict[str, Any] | None:
    """Fetch a single stored chunk by id, or None if it does not exist."""
    try:
        result = get_collection().get(ids=[chunk_id], include=["documents", "metadatas"])
    except Exception as exc:
        raise RuntimeError(f"ChromaDB get failed: {type(exc).__name__}: {exc}") from exc
    if not result["ids"]:
        return None
    full_metadata = {field: None for field in METADATA_FIELDS}
    full_metadata.update((result["metadatas"] or [{}])[0] or {})
    return {
        "chunk_id": result["ids"][0],
        "content": (result["documents"] or [""])[0],
        "metadata": full_metadata,
    }


def main() -> int:
    from cli import main as cli_main

    return cli_main()


if __name__ == "__main__":
    sys.exit(main())
