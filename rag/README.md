# Motor Insurance Policy RAG

Ingest motor insurance policy PDFs from multiple insurers, chunk them by numbered
section, embed them with Azure OpenAI, store them in ChromaDB, and ask
comparison questions with section-level citations.

## Project layout

```
data/raw_docs/          source PDFs, one per company (e.g. hdfcergo_motor.pdf)
data/processed_chunks/  chunk JSON files produced by ingestion (review/edit here)
src/config.py           loads .env, Azure OpenAI client, get_embedding / get_chat_completion
src/ingest.py           PDF extraction + section-based chunking -> JSON
src/embed_store.py      embeddings + ChromaDB storage
src/query.py            search, cross-company comparison, cited Q&A functions
src/cli.py              interactive terminal (ask.bat launches it)
src/seed.py             seeds ChromaDB with sample sections for the 3 companies
data/seed/              seed content (seed_sections.json)
.chroma_db/             persisted ChromaDB (git-ignored)
```

## Setup

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1        # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

Create `.env` in the project root (copy `.env.example`). It is git-ignored.

```
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_OPENAI_API_VERSION=2024-12-01-preview
AZURE_OPENAI_EMBEDDING_DEPLOYMENT=text-embedding-ada-002
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
```

All commands below are run from the project root (the `rag/` folder):

```powershell
cd C:\Users\dhawa\Desktop\Nice_Software\rag
```

## Adding a new company's PDF

The pipeline is currently limited to three companies, configured in
`COMPANY_DISPLAY_NAMES` in `src/ingest.py`:

| File slug      | Stored company name |
|----------------|---------------------|
| `hdfcergo`     | HDFC ERGO           |
| `icicilombard` | ICICI Lombard       |
| `bajajallianz` | Bajaj Allianz       |

PDFs with any other slug are skipped during ingestion.

1. Save the PDF to `data/raw_docs/` as `<companyslug>_<doctype>.pdf`, e.g.
   `icicilombard_motor.pdf`.
   - The part before the first `_` is the company slug, mapped to the stored
     company name through `COMPANY_DISPLAY_NAMES`. To add a fourth insurer,
     add an entry there first.
   - The part after the first `_` is the document type. `motor` maps to
     `motor_policy_wording` (see `DOCUMENT_TYPE_ALIASES`); anything else is
     used as-is (e.g. `tataaig_motor_addon_wording.pdf` -> `motor_addon_wording`).
2. The PDF must contain selectable text. Scanned PDFs need OCR first.
3. Run ingestion, review the JSON, then run embedding (below).

## Seed data

Until real PDFs are available, the database can be seeded with sample
sections for the three companies (definitions, own damage, third-party
liability, exclusions, NCB, claims, and all six add-ons, already tagged with
`parent_category` / `related_addon`):

```powershell
python src/seed.py              # write chunk JSON + embed into ChromaDB
python src/seed.py --json-only  # only write data/processed_chunks/*.json
```

Seed content lives in `data/seed/seed_sections.json`. Tariff-standard items
(IDV and parts depreciation schedules, NCB slabs, third-party property limit)
follow the standard Indian motor tariff; company-specific add-on terms are
illustrative placeholders, not taken from the insurers' actual policy
wordings. Seed chunks are stored with `source_type: "sample"`, and answers
that use them end with a verification note.

Seed chunks use the same `document_type` (`motor_policy_wording`) as ingested
PDFs, so ingesting and embedding a company's real PDF replaces its seed
chunks. `seed.py` will not overwrite a chunk file that already contains
ingested PDF data unless run with `--force`.

## Running ingestion

```powershell
python src/ingest.py
```

For every PDF in `data/raw_docs/` this extracts text, splits it into one chunk
per numbered section (`4.2`, `4.2.1`, `Section 4.2`, and short styled
top-level headings like `4. EXCLUSIONS`), splits any section over ~500 tokens
on paragraph breaks into `_partN` chunks, writes
`data/processed_chunks/<company>_<document_type>.json`, and prints a
per-document chunk count table.

Review the JSON before embedding. This is where you manually tag:

- `parent_category`: `coverage`, `addons`, `exclusions`, `claims`, `ncb`, `definitions`
- `related_addon`: `zero_dep`, `engine_protection`, `roadside_assistance`,
  `consumables`, `return_to_invoice`, `key_replacement`, or `null`
- `source_type`: `official` (default) or `third-party` for figures taken from
  aggregator sites, brochures by third parties, etc.

Note: re-running ingestion overwrites the JSON files, including manual tags.
Keep tagged files backed up, or re-apply tags after re-ingesting.

## Running embedding

```powershell
python src/embed_store.py
```

Loads every JSON file in `data/processed_chunks/`, embeds each chunk's
`content` in batches of 20 (with a short pause between batches), and upserts
into the `motor_insurance_chunks` collection in `.chroma_db/`. Re-running is
safe: chunks are upserted by `chunk_id`, and chunks that no longer exist in a
document's JSON are removed. Re-run after editing tags so the metadata
filters pick them up.

`null` metadata values are not stored in ChromaDB (it does not accept nulls),
so untagged chunks simply won't match a `related_addon` / `parent_category`
filter.

## Querying

### Interactive terminal

From the project root (no need to activate the venv; `ask.bat` uses `.venv`):

```powershell
.\ask.bat                                  # interactive mode
.\ask.bat --company hdfc --addon zero_dep  # start with filters set
```

`python src/cli.py` and `python src/query.py` start the same terminal.

Type a question to get a cited answer followed by the sections it used.
Commands:

| Command | What it does |
|---|---|
| `<question>` or `/ask <question>` | Cited answer + list of retrieved sources |
| `/compare <question>` | Top sections per company side by side, then a comparison answer |
| `/search <text>` | Matching sections with similarity scores, no LLM call |
| `/company hdfc, icici` / `/company all` | Filter companies (short names like `hdfc`, `icici`, `bajaj` work) |
| `/addon zero_dep` / `/addon off` | Filter by add-on (prefixes like `zero`, `engine` work) |
| `/category exclusions` / `/category off` | Filter by category |
| `/filters`, `/clear` | Show / remove all filters |
| `/list [text]` | Browse stored sections under the current filters |
| `/show <n>` or `/show <chunk_id>` | Full text of result `n` from the last command |
| `/stats` | Chunk counts by company, category, add-on, source type |
| `/n 8` | Chunks retrieved per question (default 5) |
| `/sources on\|off`, `/full on\|off` | Toggle source list after answers / full text in `/search` |
| `/help`, `/exit` | Help / quit (Ctrl+C also quits) |

The prompt shows active filters, e.g. `ask [HDFC ERGO | zero_dep]>`.

### One-shot

```powershell
.\ask.bat "Is engine damage from water ingress covered?"
.\ask.bat --company icici --no-sources "What is the key replacement limit?"
.\ask.bat --compare "What is the towing distance under roadside assistance?"
.\ask.bat --search --category ncb "NCB transfer to new vehicle"
```

Answers only use retrieved chunks, cite each claim as
`(Source: <company> - Section <section_number>)`, call out differences between
companies, and flag `third-party` and `sample` figures for verification.

From Python (run from `src/` or add it to `sys.path`):

```python
from query import search_chunks, compare_across_companies, ask_with_citation

search_chunks("Is engine damage from water ingress covered?", n_results=5,
              filters={"company": "HDFC ERGO"})

compare_across_companies("zero depreciation claim limit per year",
                         companies=["HDFC ERGO", "ICICI Lombard"])

print(ask_with_citation("How does NCB transfer work?",
                        filters={"parent_category": "ncb"}))
```

Filter values can be a single value or a list (`{"company": ["HDFC ERGO", "Tata AIG"]}`);
multiple keys are combined with AND. Company names must match the stored
names (see `COMPANY_DISPLAY_NAMES`).
