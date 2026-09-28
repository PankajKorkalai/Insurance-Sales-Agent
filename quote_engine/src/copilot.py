"""Sales copilot: answers agent questions from insurer policy documents (RAG).

Retrieval and cited answering reuse the ../rag pipeline (ChromaDB + Azure
OpenAI). With a saved quote attached, the copilot writes a pitch that combines
the quote's exact figures (from the database) with cited policy sections, to
help the agent answer a customer who is comparing insurers.
"""

from __future__ import annotations

import os
import sys
from functools import lru_cache
from pathlib import Path
from types import ModuleType
from typing import Any

from database import PROJECT_ROOT

RAG_SRC = Path(os.getenv("RAG_DIR") or PROJECT_ROOT.parent / "rag") / "src"
RAG_COMPANIES: tuple[str, ...] = ("HDFC ERGO", "ICICI Lombard", "Bajaj Allianz")

PITCH_SYSTEM_PROMPT = """You are a sales copilot for a motor insurance agent. The agent \
has prepared a quote for a customer who is comparing it with other insurers.

Rules:
1. Quote figures (premium, IDV, add-on prices, NCB) may ONLY come from the QUOTE FACTS \
block, copied exactly. Never invent, estimate or round figures, and never state a \
competitor's premium - you do not know it.
2. Statements about what a policy covers or excludes may ONLY come from the policy \
chunks, and each must be cited as "(Source: {company} - Section {section_number})".
3. If the chunks do not answer something, say so plainly instead of guessing.
4. Be practical: give the agent short talking points they can say to the customer, \
then note any point where competitors look similar so the agent is not caught out.
5. If any chunk has source_type "third-party" or "sample", end with a line starting \
"Verification note:" saying the policy details must be verified against the official \
policy wording before quoting them to the customer."""


class CopilotUnavailableError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def _rag_query() -> ModuleType:
    """Import rag/src/query.py lazily so the quote engine still runs without the RAG stack."""
    if not RAG_SRC.is_dir():
        raise CopilotUnavailableError(f"RAG project not found at {RAG_SRC}. Set RAG_DIR in .env.")
    if str(RAG_SRC) not in sys.path:
        sys.path.append(str(RAG_SRC))
    try:
        import query  # type: ignore[import-not-found]
    except ImportError as exc:
        raise CopilotUnavailableError(
            f"RAG dependencies are missing ({exc.name}). Run: pip install -r requirements.txt"
        ) from None
    return query


def status() -> dict[str, Any]:
    try:
        rows = _rag_query().list_chunks()
    except (CopilotUnavailableError, RuntimeError) as exc:
        return {"available": False, "detail": str(exc), "chunks": 0, "companies": []}
    companies = sorted({r["metadata"].get("company") for r in rows if r["metadata"].get("company")})
    return {"available": bool(rows), "detail": None, "chunks": len(rows), "companies": companies}


def _retrieve(question: str, companies: list[str] | None, n_results: int) -> list[dict[str, Any]]:
    query = _rag_query()
    targets = companies or list(RAG_COMPANIES)
    if len(targets) > 1:
        per_company = max(1, n_results // len(targets))
        grouped = query.compare_across_companies(question, targets, n_results_per_company=per_company)
        chunks = [c for company in targets for c in grouped.get(company, [])]
    else:
        chunks = query.search_chunks(question, n_results=n_results, filters={"company": targets[0]})
    return sorted(chunks, key=lambda c: c["distance"])


def _quote_facts(quote: dict[str, Any]) -> str:
    b = quote["breakdown"]
    lines = [
        f"Quote {quote['display_id']} ({quote['plan_tier']} plan) for {quote['customer_name']}",
        f"Vehicle: {b['vehicle']}, {b['vehicle_age_months']} months old, city {b.get('city') or '-'}",
        f"IDV: Rs {b['idv']:,.2f}",
        f"Own damage premium: Rs {b['od_premium']:,.2f}; NCB {b['ncb_discount_pct']}% = Rs {b['ncb_discount_amount']:,.2f}",
        f"Third-party premium: Rs {b['tp_premium']:,.2f}",
    ]
    for a in b["addon_breakdown"]:
        lines.append(f"Add-on {a['addon_name']}: Rs {a['price']:,.2f}")
    lines += [
        f"Net premium: Rs {b['total_premium']:,.2f}",
        f"GST: Rs {quote['gst_amount']:,.2f}",
        f"Total payable: Rs {quote['total_payable']:,.2f}",
    ]
    return "\n".join(lines)


def ask(
    question: str,
    companies: list[str] | None = None,
    n_results: int = 6,
    quote: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Answer from policy chunks; with `quote`, produce a grounded competitive pitch."""
    query = _rag_query()
    try:
        chunks = _retrieve(question, companies, n_results)
    except (RuntimeError, ValueError, EnvironmentError) as exc:
        raise CopilotUnavailableError(f"Policy search failed: {exc}") from None

    if quote is None:
        answer = query.answer_from_chunks(question, chunks)
        mode = "policy_qa"
    else:
        mode = "quote_pitch"
        if not chunks:
            answer = "No matching policy sections were found, so I can't compare coverage for this question."
        else:
            messages = [
                {"role": "system", "content": PITCH_SYSTEM_PROMPT},
                {"role": "user", "content": (
                    f"QUOTE FACTS:\n{_quote_facts(quote)}\n\n"
                    f"Policy document chunks:\n\n{query._format_context(chunks)}\n\n"
                    f"Agent's question: {question}"
                )},
            ]
            try:
                answer = query.get_chat_completion(messages)
            except (RuntimeError, EnvironmentError) as exc:
                raise CopilotUnavailableError(f"Answer generation failed: {exc}") from None

    if answer.startswith("[error]"):
        raise CopilotUnavailableError(answer.removeprefix("[error]").strip())

    sources = [
        {
            "chunk_id": c["chunk_id"],
            "company": c["metadata"].get("company"),
            "section_number": c["metadata"].get("section_number"),
            "section_title": c["metadata"].get("section_title"),
            "source_type": c["metadata"].get("source_type"),
            "similarity": round(float(c["similarity"]), 3),
            "excerpt": c["content"][:280],
        }
        for c in chunks
    ]
    return {"answer": answer, "mode": mode, "sources": sources}
