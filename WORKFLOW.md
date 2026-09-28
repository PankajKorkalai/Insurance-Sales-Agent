# InsureAI — Workflow and Team Work Distribution

InsureAI is a motor-insurance sales agent app. An agent can take a customer from enquiry to a complete, comparable policy quote for **HDFC ERGO**, **ICICI Lombard** and **Bajaj Allianz**, then share the document on WhatsApp or email.

Pricing is **deterministic** (rate cards, NCB slabs, GST). Policy wording and sales pitches come from a **RAG pipeline** over insurer documents. The agent UI is a React dashboard.

```
Frontend (agent UI)
        │  /api
        ▼
Quote engine (FastAPI + Postgres)
        ├── Premium calculator
        ├── Add-on options + recommender
        ├── Insurer / plan comparison
        └── Sales copilot ──► RAG (ChromaDB + Azure OpenAI)
```

---

## End-to-end agent workflow

This is the path an agent follows in the app.

### 1. Customer

Name, mobile, email and city. City selects the IRDAI rate-card zone and flood-prone add-on rules. Mobile is reused for WhatsApp (`https://wa.me/91…`); email is the address the policy document is sent to.

### 2. Vehicle

Make, model, year, fuel, engine CC, ex-showroom price and registration date. Age in completed months picks the IDV depreciation slab. Engine size picks the CC band for own-damage and third-party rates.

### 3. Coverage

Claim-free years (NCB) and add-ons. Changing NCB recomputes which add-ons are allowed and suggested. Each add-on shows that insurer’s price and eligibility (age, fuel, flood city, minimum claim-free years).

### 4. Compare plans

Every provider is shown with **Basic**, **Standard** and **Premium**:

| Plan     | What it is |
|----------|------------|
| Basic    | Third-party only (IRDAI flat TP; no IDV, OD, NCB or add-ons) |
| Standard | Own-damage + third-party, with NCB, no add-ons |
| Premium  | Standard + the add-ons that insurer can actually sell |

The selected plan is explained step by step: insurer rate card → vehicle age → IDV → OD premium → NCB → TP → add-ons → GST 18% → total payable.

### 5. Policy document

A full printable quote (premium breakdown + that insurer’s policy wording). The agent can:

- send it on **WhatsApp** using the Step 1 mobile number (`https://wa.me/91XXXXXXXXXX`)
- **email** it from `dhawalevs@rknec.edu` to the Step 1 address
- print / save PDF
- open the **competitive pitch** copilot (RAG + this quote’s exact figures)

---

## How the three codebases fit together

| Folder | Role |
|--------|------|
| `rag/` | Ingest policy PDFs, chunk by section, embed, retrieve with citations |
| `quote_engine/` | Quotes, customers, calculator, add-on advisor, comparison, documents, mail |
| `Frontend/` | Agent dashboard, 5-step wizard, analytics, AI assistant modal |

Quote prices always come from Postgres rate cards. The LLM is never used to invent a premium. RAG is used only to **explain wording** and to write a **cited sales pitch**.

---

## Team work distribution

### 1. Vitthal Dhawale — RAG pipeline

**Owned:** `rag/` and the sales-copilot bridge in `quote_engine/src/copilot.py`.

**What was built**

- PDF ingest for HDFC ERGO, ICICI Lombard and Bajaj Allianz (`rag/src/ingest.py`): extract text, split on numbered policy sections, cap chunks (~500 tokens).
- Embedding and storage (`rag/src/embed_store.py`): Azure OpenAI embeddings into ChromaDB (`motor_insurance_chunks`).
- Retrieval and cited Q&A (`rag/src/query.py`): semantic search, per-company compare, answers that may only use retrieved chunks and must cite `(Source: company - Section n)`.
- Interactive CLI (`rag/src/cli.py` / `ask.bat`) with company, add-on and category filters.
- Seed wordings (`rag/data/seed/seed_sections.json`) so the copilot works before live PDFs are fully tagged.
- Quote-engine copilot: `/assistant/ask` reuses that retrieval. With a `quote_id` it writes talking points using **database figures** plus **cited policy sections**.

**Why this is needed**

Agents cannot memorise three policy wordings. RAG lets them ask “is water-ingress engine damage covered?” or “compare towing distance on RSA” and get a cited answer instead of a guess. The competitive pitch on Step 5 is the same pipeline attached to a real quote, so the agent can defend HDFC vs ICICI vs Bajaj without inventing premiums.

---

### 2. Pankaj — Frontend and UI dashboards

**Owned:** `Frontend/` (React 19, Vite, Tailwind).

**What was built**

- Shell: sidebar, top search, tab routing (`App.jsx`, `Sidebar.jsx`, `TopBar.jsx`).
- **Dashboard** — quotes sent / converted, funnel, trend, recent activity (`Dashboard.jsx`).
- **Analytics** — period views over the same live API (`Analytics.jsx`).
- **Customers** — list, search, new customer form (`NewCustomer.jsx`).
- **Quotes** — list plus the 5-step wizard (`NewQuotePage.jsx`): customer → vehicle → coverage → compare plans → policy document.
- Quote detail modal, share / WhatsApp / email / PDF (`QuoteDetail.jsx`).
- AI assistant modal wired to `/assistant/ask` (`AIAssistantModal.jsx`).
- API client (`api.js`) talking to FastAPI under `/api` (Vite proxy to port 8000).

**Why this is needed**

The calculator and RAG are unusable in a sales conversation without a screen. The dashboard is what the agent lives in: find a customer, run a quote, compare three insurers, explain the math, send the document. All numbers on screen come from the API; the UI does not hard-code premiums.

---

### 3. Shreyanshi — Add-on recommender

**Owned:** `quote_engine/src/advisor.py`, Azure OpenAI client (`llm.py`), `/advisor/addons`.

**What was built**

- Vehicle profile for the model: age, fuel, city, flood-prone flag, NCB, IDV, and the **already-priced** list of add-ons that this insurer may sell.
- LLM prompt that may recommend **only** from that list, at the **exact database price**.
- Validation: unknown add-on, wrong price, or a rupee amount in the text that does not match a listed price → retry once with the errors, then **fall back** to the deterministic rule recommendations.
- Split output: `recommendations` vs `not_recommended`, each with a short reason the agent can say out loud.

**Why this is needed**

Six add-ons × three insurers × age / fuel / flood / NCB rules is too much to pick by hand. The recommender suggests Zero Dep, RSA, engine protection, consumables, RTI and key replacement **for this car and city**. It does not set the price — the calculator does — so a model hallucination cannot change what the customer pays.

---

### 4. Preeti — Quote comparison and add-ons

**Owned:** per-insurer add-on catalogue, market options, and provider comparison.

**What was built**

- Add-on catalogue and **per-insurer policies** (`insurer_addon_policies` in `models.py` / `seed_data.py`): different prices and eligibility (e.g. RSA ₹249 / ₹349 / ₹199; engine protection age limits differ).
- `POST /addons/market` — one add-on row with `by_insurer` prices, availability and “recommended by”.
- `POST /quotes/compare-insurers` — for the same vehicle, city, NCB and selected add-ons, each of the three insurers returns Basic, Standard and Premium.
- If an insurer cannot sell an add-on, that cover is **skipped for that insurer only**; the quote still completes.
- Comparison payload includes formula traces, skipped add-ons, addon notes (wording / applicability) and a lowest-premium flag.
- Step 3 UI chips show the price range across providers; Step 4 shows the real totals.

**Why this is needed**

A single shared rate card would pretend all three companies charge the same. They do not. Comparison is the product: the agent sees why Bajaj’s RSA is cheaper, why ICICI still allows engine protection on an older car, and which **plan** on which **provider** is actually lowest after GST.

---

### 5. Komalika — Premium calculator

**Owned:** `quote_engine/src/calculator.py` (and the formulas used by quotes, documents and tests).

**What was built**

- **IDV** = ex-showroom × (1 − IRDAI depreciation % for completed-month age).
- **Own-damage premium** = IDV × that insurer’s OD rate for city zone + CC band.
- **NCB** on own-damage only: 0 / 20 / 25 / 35 / 45 / 50% by claim-free years. Never applied to TP or add-ons.
- **Third-party** = IRDAI flat amount by CC band (same on all three insurers).
- **Add-on price** = flat rupees or % of IDV, from that insurer’s rule.
- **GST 18%** on net premium (OD after NCB + TP + add-ons).
- **`formula_trace`** — every intermediate line so the UI can explain the process, not only the total.
- Three plan builders: Basic (TP only), Standard (OD+TP+NCB), Premium (standard + selected add-ons).
- Decimal `ROUND_HALF_UP`; unit tests with no database.

**Why this is needed**

Premium is the number the customer pays. It has to be reproducible from the rate card, not estimated by an LLM. The calculator is the source of truth for saved quotes, the comparison table, GST, the policy document and the copilot’s “QUOTE FACTS” block.

---

## Who owns which layer (quick map)

| Concern | Owner | Main code |
|---------|--------|-----------|
| Policy PDFs → chunks → embeddings → cited answers | Vitthal Dhawale | `rag/src/ingest.py`, `embed_store.py`, `query.py`; `quote_engine/src/copilot.py` |
| Agent screens, wizard, dashboards | Pankaj | `Frontend/src/` |
| “Which add-ons should I sell?” | Shreyanshi | `quote_engine/src/advisor.py` |
| Add-on catalogue + 3-insurer compare | Preeti | `calculator.compare_insurer_quotes`, `/addons/market`, `/quotes/compare-insurers` |
| IDV, OD, NCB, TP, GST, plan maths | Komalika | `quote_engine/src/calculator.py` |

Shared plumbing (database models, FastAPI routes, seed data, quote documents) is used by everyone; the table above is the **feature ownership**, not a claim that one person wrote every import.

---

## Data the calculator is not allowed to invent

These always come from Postgres (seeded / migrated), never from the LLM:

- Depreciation slabs and NCB slabs  
- Per-insurer OD rates and TP flats  
- Per-insurer add-on price rules and eligibility  
- GST at 18%

The LLM may only (a) pick among already-priced add-ons and (b) phrase policy wording that was retrieved from ChromaDB.
