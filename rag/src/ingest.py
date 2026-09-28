"""PDF extraction and section-aware chunking for motor insurance policy documents."""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

import tiktoken
from pypdf import PdfReader
from pypdf.errors import PdfReadError

PROJECT_ROOT: Path = Path(__file__).resolve().parent.parent
RAW_DOCS_DIR: Path = PROJECT_ROOT / "data" / "raw_docs"
PROCESSED_CHUNKS_DIR: Path = PROJECT_ROOT / "data" / "processed_chunks"

MAX_CHUNK_TOKENS: int = 500
CONTINUATION_HEADER_RESERVE: int = 30
EMBEDDING_ENCODING: str = "cl100k_base"

# Filename slug (text before the first "_") -> company name stored in metadata.
# Only these companies are ingested; PDFs with any other slug are skipped.
COMPANY_DISPLAY_NAMES: dict[str, str] = {
    "hdfcergo": "HDFC ERGO",
    "icicilombard": "ICICI Lombard",
    "bajajallianz": "Bajaj Allianz",
}

# Filename suffix (text after the first "_") -> document_type stored in metadata.
DOCUMENT_TYPE_ALIASES: dict[str, str] = {
    "motor": "motor_policy_wording",
    "wording": "motor_policy_wording",
    "brochure": "motor_brochure",
    "prospectus": "motor_prospectus",
}

HEADING_RE = re.compile(
    r"""
    ^[ \t]*
    (?:(?P<prefix>section|clause)[ \t]+)?
    (?P<num>\d{1,2}(?:\.\d{1,2}){0,3})
    (?P<dot>\.)?
    (?:[ \t]*[-:)\u2013\u2014][ \t]*|[ \t]+)
    (?P<title>\S[^\n]*?)
    [ \t]*$
    """,
    re.IGNORECASE | re.MULTILINE | re.VERBOSE,
)
TOC_LEADER_RE = re.compile(r"(?:\.{3,}|\u2026{2,}|(?:\. ){3,})\s*\d+\s*$")
PAGE_NUMBER_RE = re.compile(r"^\s*(?:page\s*)?\d+(?:\s*(?:of|/)\s*\d+)?\s*$", re.IGNORECASE)

MAX_TITLE_CHARS: int = 120


@lru_cache(maxsize=1)
def _encoding() -> tiktoken.Encoding:
    return tiktoken.get_encoding(EMBEDDING_ENCODING)


def count_tokens(text: str) -> int:
    return len(_encoding().encode(text))


# --------------------------------------------------------------------------- #
# Extraction
# --------------------------------------------------------------------------- #

def _normalise_line(line: str) -> str:
    return re.sub(r"[ \t\u00a0]+", " ", line).strip()


def _repeated_lines(pages: list[list[str]], min_ratio: float = 0.6) -> set[str]:
    """Lines appearing on most pages are running headers/footers."""
    if len(pages) < 3:
        return set()
    counts: Counter[str] = Counter()
    for lines in pages:
        counts.update({ln for ln in lines if ln and len(ln) < 100})
    threshold = max(3, int(len(pages) * min_ratio))
    return {ln for ln, n in counts.items() if n >= threshold}


def extract_text_from_pdf(path: str) -> str:
    """Extract plain text from a PDF, keeping one heading per line where possible.

    Strips page numbers and running headers/footers that repeat on most pages
    so they don't break section detection.
    """
    try:
        reader = PdfReader(path)
    except (PdfReadError, OSError) as exc:
        raise RuntimeError(f"Could not open PDF '{path}': {exc}") from exc

    pages: list[list[str]] = []
    for page_number, page in enumerate(reader.pages, start=1):
        try:
            raw = page.extract_text() or ""
        except Exception as exc:
            print(f"  [warn] {Path(path).name}: failed to read page {page_number}: {exc}")
            raw = ""
        pages.append([_normalise_line(ln) for ln in raw.splitlines()])

    repeated = _repeated_lines(pages)
    page_texts: list[str] = []
    for lines in pages:
        kept = [
            ln for ln in lines
            if ln not in repeated and not PAGE_NUMBER_RE.match(ln)
        ]
        page_texts.append("\n".join(kept))

    text = "\n\n".join(page_texts)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# --------------------------------------------------------------------------- #
# Chunking
# --------------------------------------------------------------------------- #

def _looks_like_heading_title(title: str) -> bool:
    words = [w for w in re.findall(r"[A-Za-z][A-Za-z'&-]*", title)]
    if not words:
        return False
    if title.isupper():
        return True
    significant = [w for w in words if len(w) > 3]
    if not significant:
        return title[0].isupper()
    capitalised = sum(1 for w in significant if w[0].isupper())
    return capitalised / len(significant) >= 0.6


def _is_heading(match: re.Match[str]) -> bool:
    line = match.group(0)
    title = match.group("title").strip()
    num = match.group("num")

    if TOC_LEADER_RE.search(line):
        return False
    if not title or not (title[0].isalpha() or title[0] == "("):
        return False
    if not title[0].isupper() and title[0] != "(":
        return False

    has_prefix = match.group("prefix") is not None
    is_dotted = "." in num

    if has_prefix or is_dotted:
        return True
    # Bare top-level numbers ("4. EXCLUSIONS") are ambiguous with numbered list
    # items, so only accept short, heading-styled lines.
    return (
        match.group("dot") is not None
        and len(title) <= 80
        and not title.endswith((".", ",", ";"))
        and _looks_like_heading_title(title)
    )


def _clean_title(title: str) -> str:
    title = title.strip().rstrip(":-\u2013\u2014 ").strip()
    sentence_end = re.search(r"(?<=[a-z])\.\s", title)
    if sentence_end:
        title = title[: sentence_end.start() + 1]
    if len(title) > MAX_TITLE_CHARS:
        title = title[:MAX_TITLE_CHARS].rsplit(" ", 1)[0] + "..."
    return title


def _hard_split(text: str, max_tokens: int) -> list[str]:
    tokens = _encoding().encode(text)
    return [
        _encoding().decode(tokens[i : i + max_tokens]).strip()
        for i in range(0, len(tokens), max_tokens)
    ]


_SPLIT_LEVELS: tuple[tuple[str, str], ...] = (
    (r"\n\s*\n", "\n\n"),         # paragraph breaks
    (r"\n", "\n"),                # line breaks (pypdf often drops blank lines)
    (r"(?<=[.;:])\s+", " "),      # sentence boundaries
)


def _split_to_token_limit(text: str, max_tokens: int, level: int = 0) -> list[str]:
    """Split on paragraph breaks first, then finer boundaries, packing greedily."""
    text = text.strip()
    if not text:
        return []
    if count_tokens(text) <= max_tokens:
        return [text]
    if level >= len(_SPLIT_LEVELS):
        return _hard_split(text, max_tokens)

    pattern, joiner = _SPLIT_LEVELS[level]
    units = [u.strip() for u in re.split(pattern, text) if u.strip()]
    if len(units) <= 1:
        return _split_to_token_limit(text, max_tokens, level + 1)

    pieces: list[str] = []
    for unit in units:
        pieces.extend(_split_to_token_limit(unit, max_tokens, level + 1))

    packed: list[str] = []
    current: list[str] = []
    for piece in pieces:
        candidate = joiner.join(current + [piece])
        if current and count_tokens(candidate) > max_tokens:
            packed.append(joiner.join(current))
            current = [piece]
        else:
            current.append(piece)
    if current:
        packed.append(joiner.join(current))
    return packed


def _make_chunk_id(company: str, document_type: str, key: str) -> str:
    return f"{company}_{document_type}_{key}".lower().replace(" ", "_")


def chunk_by_section(
    text: str,
    company: str,
    document_type: str,
    source_type: str = "official",
    max_tokens: int = MAX_CHUNK_TOKENS,
) -> list[dict[str, Any]]:
    """Split a policy document into one chunk per numbered section/sub-section.

    Headings like "4.2", "4.2.1 Title", "Section 4.2" start a new chunk. Text
    before the first heading becomes a "preamble" chunk. Any section longer
    than `max_tokens` is split on paragraph breaks into "_partN" chunks.
    """
    retrieved_date = date.today().isoformat()

    headings = [m for m in HEADING_RE.finditer(text) if _is_heading(m)]

    sections: list[tuple[str | None, str | None, str, str]] = []
    first_start = headings[0].start() if headings else len(text)
    preamble = text[:first_start].strip()
    if preamble:
        sections.append((None, None, preamble, "preamble" if headings else "nosection"))

    for i, match in enumerate(headings):
        end = headings[i + 1].start() if i + 1 < len(headings) else len(text)
        body = text[match.start() : end].strip()
        number = match.group("num").rstrip(".")
        title = _clean_title(match.group("title"))
        sections.append((number, title, body, number))

    chunks: list[dict[str, Any]] = []
    used_ids: set[str] = set()

    def unique_id(base: str) -> str:
        candidate, n = base, 2
        while candidate in used_ids:
            candidate = f"{base}_{n}"
            n += 1
        used_ids.add(candidate)
        return candidate

    for number, title, body, key in sections:
        if count_tokens(body) <= max_tokens:
            parts = [body]
        else:
            parts = _split_to_token_limit(body, max_tokens - CONTINUATION_HEADER_RESERVE)

        base_id = _make_chunk_id(company, document_type, key)
        for idx, part in enumerate(parts, start=1):
            if len(parts) > 1:
                chunk_id = unique_id(f"{base_id}_part{idx}")
                if idx > 1 and number:
                    part = f"{number} {title or ''} (continued)\n{part}".strip()
            else:
                chunk_id = unique_id(base_id)

            chunks.append({
                "chunk_id": chunk_id,
                "company": company,
                "document_type": document_type,
                "section_number": number,
                "section_title": title,
                "parent_category": None,
                "related_addon": None,
                "content": part,
                "source_type": source_type,
                "retrieved_date": retrieved_date,
            })

    return chunks


# --------------------------------------------------------------------------- #
# Output
# --------------------------------------------------------------------------- #

def save_chunks_to_json(chunks: list[dict[str, Any]], output_path: str) -> None:
    path = Path(output_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(chunks, f, indent=2, ensure_ascii=False)


def parse_filename(pdf_path: Path) -> tuple[str | None, str]:
    """`hdfcergo_motor.pdf` -> ("HDFC ERGO", "motor_policy_wording").

    Company is None when the slug is not in COMPANY_DISPLAY_NAMES.
    """
    stem = pdf_path.stem.lower()
    slug, _, rest = stem.partition("_")
    company = COMPANY_DISPLAY_NAMES.get(slug)
    rest = rest or "motor"
    document_type = DOCUMENT_TYPE_ALIASES.get(rest, rest)
    return company, document_type


def output_path_for(company: str, document_type: str) -> Path:
    name = f"{company}_{document_type}".lower().replace(" ", "_")
    return PROCESSED_CHUNKS_DIR / f"{name}.json"


def main() -> int:
    pdfs = sorted(RAW_DOCS_DIR.glob("*.pdf"))
    if not pdfs:
        print(f"No PDFs found in {RAW_DOCS_DIR}")
        return 1

    summary: list[tuple[str, str, int, str]] = []
    for pdf in pdfs:
        company, document_type = parse_filename(pdf)
        if company is None:
            print(
                f"Skipping {pdf.name}: company slug not in COMPANY_DISPLAY_NAMES "
                f"({', '.join(COMPANY_DISPLAY_NAMES)})"
            )
            continue
        print(f"Processing {pdf.name} -> company='{company}', document_type='{document_type}'")
        try:
            text = extract_text_from_pdf(str(pdf))
            if not text:
                print(f"  [warn] No extractable text in {pdf.name} (scanned PDF?). Skipping.")
                summary.append((company, document_type, 0, "no text"))
                continue
            chunks = chunk_by_section(text, company, document_type)
            out_path = output_path_for(company, document_type)
            save_chunks_to_json(chunks, str(out_path))
            summary.append((company, document_type, len(chunks), out_path.name))
        except Exception as exc:
            print(f"  [error] {pdf.name}: {exc}")
            summary.append((company, document_type, 0, "failed"))

    if not summary:
        print("No PDFs matched the configured companies.")
        return 1

    col1 = max(len("Company"), *(len(r[0]) for r in summary))
    col2 = max(len("Document type"), *(len(r[1]) for r in summary))
    header = f"{'Company':<{col1}}  {'Document type':<{col2}}  {'Chunks':>6}  Output"
    print("\n" + header)
    print("-" * len(header))
    for company, document_type, n, note in summary:
        print(f"{company:<{col1}}  {document_type:<{col2}}  {n:>6}  {note}")
    print("-" * len(header))
    print(f"{'Total':<{col1}}  {'':<{col2}}  {sum(r[2] for r in summary):>6}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
