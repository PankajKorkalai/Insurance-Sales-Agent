"""Interactive terminal for querying the motor insurance policy store.

Run `python src/cli.py` (or `ask.bat`) and type a question, or use /help for
commands. Pass a question as arguments for a one-shot answer.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import sys
import textwrap
import time
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Callable

from ingest import COMPANY_DISPLAY_NAMES
from query import (
    PARENT_CATEGORIES,
    RELATED_ADDONS,
    answer_from_chunks,
    compare_across_companies,
    get_chunk,
    list_chunks,
    search_chunks,
)

KNOWN_COMPANIES: list[str] = sorted(set(COMPANY_DISPLAY_NAMES.values()))


# --------------------------------------------------------------------------- #
# Terminal styling
# --------------------------------------------------------------------------- #

def _supports_color() -> bool:
    if os.getenv("NO_COLOR") or not sys.stdout.isatty():
        return False
    if os.name == "nt":
        os.system("")  # enables ANSI escape processing in the Windows console
    return True


_COLOR = _supports_color()


def _style(code: str) -> Callable[[str], str]:
    return (lambda s: f"\033[{code}m{s}\033[0m") if _COLOR else (lambda s: s)


bold, dim = _style("1"), _style("2")
red, green, yellow, blue, magenta, cyan = (_style(c) for c in ("31", "32", "33", "34", "35", "36"))


def _width() -> int:
    return max(60, min(shutil.get_terminal_size((100, 20)).columns, 120))


def _rule(title: str = "") -> None:
    line = "-" * _width()
    if title:
        title = f" {title} "
        line = "--" + title + line[len(title) + 2 :]
    print(dim(line))


def _wrap(text: str, indent: str = "    ") -> str:
    width = _width() - len(indent)
    out: list[str] = []
    for para in text.splitlines():
        out.append(textwrap.fill(para, width=width, initial_indent=indent, subsequent_indent=indent) if para.strip() else "")
    return "\n".join(out)


def _status(message: str) -> None:
    if _COLOR:
        print(dim(message), end="\r", flush=True)


def _clear_status() -> None:
    if _COLOR:
        print(" " * _width(), end="\r", flush=True)


def _error(message: str) -> None:
    print(red(f"Error: {message}"))


# --------------------------------------------------------------------------- #
# Session state
# --------------------------------------------------------------------------- #

@dataclass
class Session:
    companies: list[str] = field(default_factory=list)
    addon: str | None = None
    category: str | None = None
    n_results: int = 5
    show_sources: bool = True
    full_text: bool = False
    last_results: list[str] = field(default_factory=list)

    def filters(self, include_company: bool = True) -> dict[str, Any]:
        f: dict[str, Any] = {}
        if include_company and self.companies:
            f["company"] = self.companies if len(self.companies) > 1 else self.companies[0]
        if self.addon:
            f["related_addon"] = self.addon
        if self.category:
            f["parent_category"] = self.category
        return f

    def describe(self) -> str:
        parts = [
            f"companies={', '.join(self.companies) if self.companies else 'all'}",
            f"addon={self.addon or 'any'}",
            f"category={self.category or 'any'}",
            f"n={self.n_results}",
            f"sources={'on' if self.show_sources else 'off'}",
            f"full={'on' if self.full_text else 'off'}",
        ]
        return "  ".join(parts)

    def prompt(self) -> str:
        tags = [*self.companies, *(t for t in (self.addon, self.category) if t)]
        suffix = f" [{' | '.join(tags)}]" if tags else ""
        return f"\n{bold(cyan('ask'))}{yellow(suffix)}{bold('>')} "


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def resolve_company(token: str) -> str | None:
    """Match 'hdfc', 'hdfcergo', 'HDFC ERGO', 'icici' ... to a stored company name."""
    key = _norm(token)
    if not key:
        return None
    if token.lower() in COMPANY_DISPLAY_NAMES:
        return COMPANY_DISPLAY_NAMES[token.lower()]
    exact = [c for c in KNOWN_COMPANIES if _norm(c) == key]
    if exact:
        return exact[0]
    partial = [c for c in KNOWN_COMPANIES if _norm(c).startswith(key) or key in _norm(c)]
    return partial[0] if len(partial) == 1 else None


def _section_sort_key(row: dict[str, Any]) -> tuple[Any, ...]:
    meta = row["metadata"]
    number = meta.get("section_number") or ""
    parts = tuple(int(p) if p.isdigit() else 0 for p in number.split(".")) if number else (9999,)
    return (meta.get("company") or "", parts, row["chunk_id"])


# --------------------------------------------------------------------------- #
# Rendering
# --------------------------------------------------------------------------- #

def _chunk_label(meta: dict[str, Any]) -> str:
    section = meta.get("section_number") or "-"
    title = meta.get("section_title") or ""
    tags = "/".join(t for t in (meta.get("parent_category"), meta.get("related_addon")) if t)
    source = meta.get("source_type") or "official"
    source_str = yellow(source) if source != "official" else green(source)
    return (
        f"{bold(meta.get('company') or '?')}  {cyan('Sec ' + section)} {title}"
        + (f"  {magenta(tags)}" if tags else "")
        + f"  {source_str}"
    )


def print_sources(chunks: list[dict[str, Any]], session: Session, show_content: bool = False) -> None:
    session.last_results = [c["chunk_id"] for c in chunks]
    for i, chunk in enumerate(chunks, start=1):
        sim = chunk.get("similarity")
        score = f"  {dim(f'sim {sim:.3f}')}" if sim is not None else ""
        print(f"  {bold(f'[{i}]')} {_chunk_label(chunk['metadata'])}{score}")
        if show_content:
            content = chunk["content"]
            if not session.full_text and len(content) > 300:
                content = content[:300].rsplit(" ", 1)[0] + " ..."
            print(dim(_wrap(content, indent="      ")))
            print()


def print_answer(answer: str, elapsed: float) -> None:
    _rule("Answer")
    print(answer.strip())
    _rule(f"{elapsed:.1f}s")


# --------------------------------------------------------------------------- #
# Commands
# --------------------------------------------------------------------------- #

def cmd_ask(session: Session, question: str) -> None:
    if not question:
        _error("Usage: /ask <question>  (or just type the question)")
        return
    start = time.perf_counter()
    _status("Searching policy sections...")
    chunks = search_chunks(question, n_results=session.n_results, filters=session.filters() or None)
    _clear_status()
    if not chunks:
        print(yellow("No matching sections. Check /filters or run seed/ingestion first."))
        return
    _status("Generating answer...")
    answer = answer_from_chunks(question, chunks)
    _clear_status()
    print_answer(answer, time.perf_counter() - start)
    if session.show_sources:
        print(dim("Sources retrieved (use /show <n> for full text):"))
        print_sources(chunks, session)


def cmd_search(session: Session, query: str) -> None:
    if not query:
        _error("Usage: /search <text>")
        return
    _status("Searching...")
    chunks = search_chunks(query, n_results=session.n_results, filters=session.filters() or None)
    _clear_status()
    if not chunks:
        print(yellow("No matching sections."))
        return
    _rule(f"Top {len(chunks)} matches")
    print_sources(chunks, session, show_content=True)


def cmd_compare(session: Session, question: str) -> None:
    if not question:
        _error("Usage: /compare <question>")
        return
    companies = session.companies or KNOWN_COMPANIES
    per_company = max(1, min(session.n_results, 3))
    start = time.perf_counter()
    _status(f"Searching {len(companies)} companies...")
    results = compare_across_companies(
        question, companies, n_results_per_company=per_company,
        filters=session.filters(include_company=False) or None,
    )
    _clear_status()

    combined: list[dict[str, Any]] = []
    for company in companies:
        chunks = results.get(company, [])
        combined.extend(chunks)
        _rule(company)
        if chunks:
            offset = len(combined) - len(chunks)
            for i, chunk in enumerate(chunks, start=offset + 1):
                score = dim(f"sim {chunk['similarity']:.3f}")
                print(f"  {bold(f'[{i}]')} {_chunk_label(chunk['metadata'])}  {score}")
        else:
            print(yellow("  No matching sections for this company."))
    session.last_results = [c["chunk_id"] for c in combined]

    if not combined:
        return
    _status("Generating comparison...")
    prompt = f"{question}\n\nCompare the answer for each of these companies: {', '.join(companies)}."
    answer = answer_from_chunks(prompt, combined)
    _clear_status()
    print_answer(answer, time.perf_counter() - start)


def cmd_company(session: Session, arg: str) -> None:
    if not arg:
        print(f"Companies: {', '.join(session.companies) or 'all'}   (available: {', '.join(KNOWN_COMPANIES)})")
        return
    if arg.lower() in {"all", "off", "none", "clear"}:
        session.companies = []
        print(green("Company filter cleared (all companies)."))
        return
    resolved: list[str] = []
    for token in re.split(r"[,;]", arg):
        token = token.strip()
        if not token:
            continue
        company = resolve_company(token)
        if company is None:
            _error(f"Unknown or ambiguous company '{token}'. Available: {', '.join(KNOWN_COMPANIES)}")
            return
        if company not in resolved:
            resolved.append(company)
    session.companies = resolved
    print(green(f"Companies: {', '.join(resolved)}"))


def _set_choice(session: Session, attr: str, arg: str, choices: tuple[str, ...], label: str) -> None:
    if not arg:
        print(f"{label}: {getattr(session, attr) or 'any'}   (choices: {', '.join(choices)}, off)")
        return
    value = arg.strip().lower().replace(" ", "_").replace("-", "_")
    if value in {"off", "none", "any", "clear"}:
        setattr(session, attr, None)
        print(green(f"{label} filter cleared."))
        return
    matches = [c for c in choices if c == value] or [c for c in choices if c.startswith(value)]
    if len(matches) != 1:
        _error(f"Unknown {label.lower()} '{arg}'. Choices: {', '.join(choices)}")
        return
    setattr(session, attr, matches[0])
    print(green(f"{label}: {matches[0]}"))


def cmd_addon(session: Session, arg: str) -> None:
    _set_choice(session, "addon", arg, RELATED_ADDONS, "Add-on")


def cmd_category(session: Session, arg: str) -> None:
    _set_choice(session, "category", arg, PARENT_CATEGORIES, "Category")


def cmd_filters(session: Session, _: str) -> None:
    print(session.describe())


def cmd_clear(session: Session, _: str) -> None:
    session.companies, session.addon, session.category = [], None, None
    print(green("All filters cleared."))


def cmd_n(session: Session, arg: str) -> None:
    try:
        n = int(arg)
        if not 1 <= n <= 50:
            raise ValueError
    except ValueError:
        _error("Usage: /n <1-50>")
        return
    session.n_results = n
    print(green(f"Retrieving {n} chunks per query."))


def _toggle(session: Session, attr: str, arg: str, label: str) -> None:
    value = arg.strip().lower()
    if value in {"on", "true", "yes", "1"}:
        setattr(session, attr, True)
    elif value in {"off", "false", "no", "0"}:
        setattr(session, attr, False)
    elif not value:
        setattr(session, attr, not getattr(session, attr))
    else:
        _error(f"Usage: /{label} on|off")
        return
    print(green(f"{label}: {'on' if getattr(session, attr) else 'off'}"))


def cmd_sources(session: Session, arg: str) -> None:
    _toggle(session, "show_sources", arg, "sources")


def cmd_full(session: Session, arg: str) -> None:
    _toggle(session, "full_text", arg, "full")


def cmd_list(session: Session, arg: str) -> None:
    rows = sorted(list_chunks(session.filters() or None), key=_section_sort_key)
    if arg:
        needle = arg.lower()
        rows = [
            r for r in rows
            if needle in r["chunk_id"].lower()
            or needle in (r["metadata"].get("section_title") or "").lower()
        ]
    if not rows:
        print(yellow("No stored chunks match."))
        return
    session.last_results = [r["chunk_id"] for r in rows]
    _rule(f"{len(rows)} stored chunks")
    current = None
    for i, row in enumerate(rows, start=1):
        meta = row["metadata"]
        if meta.get("company") != current:
            current = meta.get("company")
            print(bold(f"\n{current}"))
        tags = "/".join(t for t in (meta.get("parent_category"), meta.get("related_addon")) if t)
        print(
            f"  {dim(f'[{i}]'.rjust(5))} {cyan((meta.get('section_number') or '-').ljust(7))}"
            f"{(meta.get('section_title') or '')[:55]:<56}{magenta(tags)}"
        )
    print(dim("\nUse /show <n> to read a chunk."))


def cmd_show(session: Session, arg: str) -> None:
    arg = arg.strip()
    if not arg:
        _error("Usage: /show <n from last results> or /show <chunk_id>")
        return
    chunk_id = arg
    if arg.isdigit():
        idx = int(arg)
        if not 1 <= idx <= len(session.last_results):
            _error(f"No result [{idx}]. Last command returned {len(session.last_results)} result(s).")
            return
        chunk_id = session.last_results[idx - 1]
    chunk = get_chunk(chunk_id)
    if chunk is None:
        _error(f"Chunk '{chunk_id}' not found.")
        return
    _rule(chunk["chunk_id"])
    print(_chunk_label(chunk["metadata"]))
    meta = chunk["metadata"]
    print(dim(f"document_type={meta.get('document_type')}  retrieved_date={meta.get('retrieved_date')}"))
    print()
    print(_wrap(chunk["content"], indent="  "))
    _rule()


def cmd_stats(session: Session, _: str) -> None:
    rows = list_chunks(None)
    if not rows:
        print(yellow("Collection is empty. Run `python src/seed.py` or ingest + embed first."))
        return
    _rule(f"{len(rows)} chunks in store")
    for label, key in (("Company", "company"), ("Category", "parent_category"),
                       ("Add-on", "related_addon"), ("Source type", "source_type"),
                       ("Document type", "document_type")):
        counts = Counter(r["metadata"].get(key) or "(untagged)" for r in rows)
        print(bold(label))
        for value, n in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0])):
            print(f"  {value:<28}{n:>4}")


HELP_TEXT = f"""
{bold('Asking')}
  <question>                 Answer with citations from retrieved sections
  /ask <question>            Same as typing the question
  /compare <question>        Retrieve per company, show side by side, then compare
  /search <text>             Show matching sections + scores, no LLM answer

{bold('Filters')} (apply to ask / search / list; compare uses addon + category)
  /company <name>[, <name>]  e.g. /company hdfc, icici     /company all
  /addon <name>|off          {', '.join(RELATED_ADDONS)}
  /category <name>|off       {', '.join(PARENT_CATEGORIES)}
  /filters                   Show current settings
  /clear                     Remove all filters

{bold('Browsing')}
  /list [text]               List stored sections (optionally matching text)
  /show <n>|<chunk_id>       Full text of result n from the last command
  /stats                     Counts by company, category, add-on, source type

{bold('Settings')}
  /n <1-50>                  Chunks retrieved per question (default 5)
  /sources on|off            Show retrieved sources after answers
  /full on|off               Show full chunk text in /search

  /help                      This help
  /exit                      Quit (also: exit, quit, Ctrl+C)
"""


def cmd_help(session: Session, _: str) -> None:
    print(HELP_TEXT)


COMMANDS: dict[str, Callable[[Session, str], None]] = {
    "ask": cmd_ask, "a": cmd_ask,
    "search": cmd_search, "s": cmd_search,
    "compare": cmd_compare, "c": cmd_compare,
    "company": cmd_company, "companies": cmd_company,
    "addon": cmd_addon,
    "category": cmd_category, "cat": cmd_category,
    "filters": cmd_filters, "f": cmd_filters,
    "clear": cmd_clear,
    "n": cmd_n,
    "sources": cmd_sources,
    "full": cmd_full,
    "list": cmd_list, "ls": cmd_list,
    "show": cmd_show,
    "stats": cmd_stats,
    "help": cmd_help, "h": cmd_help, "?": cmd_help,
}


def run_line(session: Session, line: str) -> bool:
    """Execute one input line. Returns False when the user wants to quit."""
    line = line.strip()
    if not line:
        return True
    if line.lower() in {"exit", "quit", "/exit", "/quit", "/q"}:
        return False
    if line.lower() in {"help", "?"}:
        cmd_help(session, "")
        return True

    if line.startswith("/"):
        name, _, arg = line[1:].partition(" ")
        handler = COMMANDS.get(name.lower())
        if handler is None:
            _error(f"Unknown command '/{name}'. Type /help for commands.")
            return True
    else:
        handler, arg = cmd_ask, line

    try:
        handler(session, arg.strip())
    except KeyboardInterrupt:
        _clear_status()
        print(yellow("\nCancelled."))
    except (RuntimeError, ValueError, EnvironmentError) as exc:
        _clear_status()
        _error(str(exc))
    return True


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #

def _build_session(args: argparse.Namespace) -> Session | None:
    session = Session(n_results=args.n_results, show_sources=not args.no_sources)
    for token in args.company or []:
        company = resolve_company(token)
        if company is None:
            _error(f"Unknown company '{token}'. Available: {', '.join(KNOWN_COMPANIES)}")
            return None
        session.companies.append(company)
    if args.addon:
        _set_choice(session, "addon", args.addon, RELATED_ADDONS, "Add-on")
    if args.category:
        _set_choice(session, "category", args.category, PARENT_CATEGORIES, "Category")
    return session


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Query motor insurance policies. Run without a question for interactive mode.",
    )
    parser.add_argument("question", nargs="*", help="Ask once and exit.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--compare", action="store_true", help="One-shot: compare across companies.")
    mode.add_argument("--search", action="store_true", help="One-shot: show matching sections only.")
    parser.add_argument("--company", action="append", help="Company filter (repeatable), e.g. hdfc.")
    parser.add_argument("--addon", help=f"Add-on filter: {', '.join(RELATED_ADDONS)}.")
    parser.add_argument("--category", help=f"Category filter: {', '.join(PARENT_CATEGORIES)}.")
    parser.add_argument("-n", "--n-results", type=int, default=5, help="Chunks to retrieve (default 5).")
    parser.add_argument("--no-sources", action="store_true", help="Hide retrieved sources after answers.")
    args = parser.parse_args()

    session = _build_session(args)
    if session is None:
        return 2

    if args.question:
        question = " ".join(args.question)
        handler = cmd_compare if args.compare else cmd_search if args.search else cmd_ask
        try:
            handler(session, question)
        except (RuntimeError, ValueError, EnvironmentError) as exc:
            _error(str(exc))
            return 1
        return 0

    print(bold("Motor Insurance Policy Assistant"))
    print(dim(f"Companies: {', '.join(KNOWN_COMPANIES)}.  Type a question, /help for commands, /exit to quit."))
    if session.filters():
        print(dim(session.describe()))

    while True:
        try:
            line = input(session.prompt())
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not run_line(session, line):
            break
    print(dim("Bye."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
