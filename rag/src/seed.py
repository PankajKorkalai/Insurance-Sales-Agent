"""Seeds ChromaDB with sample motor policy sections for the configured companies.

Reads data/seed/seed_sections.json, writes one processed-chunks JSON file per
company (same format as ingest.py output) and embeds them. Seed chunks are
tagged source_type="sample" so answers flag them for verification.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path
from typing import Any

from embed_store import COLLECTION_NAME, get_collection, store_chunk_file
from ingest import (
    COMPANY_DISPLAY_NAMES,
    PROJECT_ROOT,
    _make_chunk_id,
    output_path_for,
    save_chunks_to_json,
)

SEED_FILE: Path = PROJECT_ROOT / "data" / "seed" / "seed_sections.json"
SEED_DOCUMENT_TYPE: str = "motor_policy_wording"
SEED_SOURCE_TYPE: str = "sample"


def build_seed_chunks(company: str, sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    retrieved_date = date.today().isoformat()
    return [
        {
            "chunk_id": _make_chunk_id(company, SEED_DOCUMENT_TYPE, s["section_number"]),
            "company": company,
            "document_type": SEED_DOCUMENT_TYPE,
            "section_number": s["section_number"],
            "section_title": s["section_title"],
            "parent_category": s.get("parent_category"),
            "related_addon": s.get("related_addon"),
            "content": s["content"],
            "source_type": SEED_SOURCE_TYPE,
            "retrieved_date": retrieved_date,
        }
        for s in sections
    ]


def _has_real_chunks(path: Path) -> bool:
    """True if an existing chunk file contains ingested (non-sample) data."""
    if not path.exists():
        return False
    try:
        existing = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return True
    return any(c.get("source_type") != SEED_SOURCE_TYPE for c in existing)


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed ChromaDB with sample policy sections.")
    parser.add_argument("--json-only", action="store_true", help="Write chunk JSON files without embedding.")
    parser.add_argument("--force", action="store_true", help="Overwrite chunk files that contain ingested PDF data.")
    args = parser.parse_args()

    try:
        seed: dict[str, list[dict[str, Any]]] = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"[error] Could not read seed file {SEED_FILE}: {exc}")
        return 1

    allowed = set(COMPANY_DISPLAY_NAMES.values())
    written: list[Path] = []
    for company, sections in seed.items():
        if company not in allowed:
            print(f"Skipping '{company}': not in COMPANY_DISPLAY_NAMES.")
            continue
        out_path = output_path_for(company, SEED_DOCUMENT_TYPE)
        if _has_real_chunks(out_path) and not args.force:
            print(f"Skipping '{company}': {out_path.name} holds ingested PDF chunks (use --force to overwrite).")
            continue
        chunks = build_seed_chunks(company, sections)
        save_chunks_to_json(chunks, str(out_path))
        written.append(out_path)
        print(f"Wrote {len(chunks)} seed chunks for {company} -> {out_path.name}")

    if args.json_only or not written:
        return 0

    stored = sum(store_chunk_file(path) for path in written)
    try:
        count = get_collection().count()
    except Exception as exc:
        print(f"[error] Could not count collection: {exc}")
        return 1
    print(f"\nSeeded {stored} chunks. Collection '{COLLECTION_NAME}' now holds {count}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
