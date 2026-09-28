# Motor Insurance Quote Engine

FastAPI + PostgreSQL (Neon) backend that gives insurance agents instant,
itemised motor insurance quotes across Basic / Standard / Premium plans.

Premiums are **deterministic and rule-based**: every figure comes from an
explicit formula using `Decimal` arithmetic, and every quote carries a
`formula_trace` showing exactly how each number was produced. No AI or
estimation is involved in pricing.

## Project layout

```
src/models.py       SQLAlchemy ORM tables
src/database.py     engine/session from DATABASE_URL (SSL enforced for Neon)
src/seed_data.py    idempotent seed: slabs, rate card, 30 vehicles, 6 add-ons
src/calculator.py   pure premium formulas (reads reference data, never writes)
src/advisor.py      AI add-on advisor: prompt, output validation, fallback
src/llm.py          Azure OpenAI client (advisor only)
src/schemas.py      Pydantic request/response models
src/main.py         FastAPI endpoints
alembic/            migrations
tests/              calculator unit tests (no DB needed)
```

## Setup

```powershell
cd C:\Users\dhawa\Desktop\Nice_Software\quote_engine
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
```

Create `.env` (git-ignored, see `.env.example`):

```
DATABASE_URL=postgresql://<user>:<password>@<endpoint>.neon.tech/<db>?sslmode=require
```

`sslmode=require` is added automatically if missing, and `postgresql://` is
switched to the psycopg2 driver.

## Database

```powershell
.venv\Scripts\alembic upgrade head        # create/upgrade tables
.venv\Scripts\python src\seed_data.py     # seed reference data (safe to re-run)
```

After changing `src/models.py`:

```powershell
.venv\Scripts\alembic revision --autogenerate -m "describe change"
.venv\Scripts\alembic upgrade head
```

## Run the app

The agent dashboard is the React app in `../Frontend`. The quote engine on
port 8000 is the API (and, after `npm run build`, can also serve that app).

From `Nice_Software`:

```powershell
.\run.bat
```

That starts the API at http://127.0.0.1:8000 and the agent UI at
http://127.0.0.1:5173. Quotes, customers, dashboard, analytics and the
add-on advisor all live in that React app and read from Postgres / ChromaDB.

API only:

```powershell
cd quote_engine
.\run.bat
# or: .venv\Scripts\uvicorn main:app --app-dir src --reload --port 8000
```

Frontend only (API must already be up):

```powershell
cd Frontend
.\run.bat
```

Demo customers and quote history (idempotent unless `--reset`):

```powershell
.venv\Scripts\python src\seed_demo.py
```

- Agent app: http://127.0.0.1:5173/
- After `npm run build`, the same app is also served at http://127.0.0.1:8000/
- Customer quote page: http://127.0.0.1:8000/q/{token}
- API docs: http://127.0.0.1:8000/docs

## Tests

```powershell
.venv\Scripts\python -m unittest discover -s tests -v
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | API + database check |
| GET | `/vehicles?make=&fuel_type=&year=` | Search vehicle master |
| GET / POST | `/vehicles/{id}`, `/vehicles` | Get / add a vehicle |
| GET | `/addons`, `/rate-card` | Reference data |
| GET | `/city-zone?city=Pune` | Which zone a city is priced in |
| POST / GET | `/customers`, `/customers/{id}`, `/customers?phone=` | Customers |
| POST | `/quotes/calculate` | Basic / Standard / Premium side by side (nothing saved) |
| POST | `/addons/options` | Add-on prices, eligibility and rule recommendations for a vehicle |
| POST | `/quotes` | Calculate one plan and save it as a draft quote |
| GET | `/quotes?customer_id=&vehicle_id=&status=&q=` | Saved quotes (`status` includes derived `expired`) |
| PATCH | `/quotes/{id}/status` | `draft -> sent -> converted` (forward only; expired quotes are blocked) |
| POST | `/quotes/{id}/share` | Customer link + WhatsApp / email; marks draft as sent |
| GET | `/quotes/{id}/document` | Printable HTML (browser Save as PDF) |
| GET / POST | `/q/{token}`, `/q/{token}/accept` | Customer view and one-click accept |
| GET | `/dashboard?period=month\|30d\|all` | Agent metrics, funnel, trend, top vehicles |
| GET | `/assistant/status` | RAG knowledge-base health |
| POST | `/assistant/ask` | Cited policy Q&A; with `quote_id`, a competitive pitch |

Example: compare plans

```json
POST /quotes/calculate
{ "vehicle_id": 12, "city": "Mumbai", "claim_free_years": 3 }
```

Example: save a quote for a new customer (matched by phone if they already exist)

```json
POST /quotes
{
  "vehicle_id": 12, "city": "Mumbai", "claim_free_years": 3,
  "plan_tier": "premium",
  "registration_date": "2026-02-10",
  "customer": { "name": "Rahul Sharma", "phone": "9876543210", "city": "Mumbai" }
}
```

For `premium`, pass `selected_addon_ids` to override the recommended add-ons.

## Pricing rules

```
IDV                 = ex_showroom_price x (1 - depreciation_pct / 100)
OD premium          = IDV x od_rate_pct / 100
NCB discount        = OD premium x ncb_discount_pct / 100
Net OD premium      = OD premium - NCB discount
TP premium          = rate_card.tp_premium_flat (by cc band)
Add-on price        = flat_X -> X;  pct_of_idv_X -> IDV x X / 100
Total premium       = Net OD premium + TP premium + sum(add-on prices)
```

- **Rounding:** every monetary step is rounded to 2 decimals (half-up), and the
  next step uses the rounded value, so each number reproduces exactly from the
  ones shown before it.
- **Vehicle age:** completed months from `registration_date`; if omitted,
  1 January of the vehicle's model year is assumed (shown in `age_basis`).
- **Depreciation slabs** (inclusive, months): 0-6 = 5%, 7-12 = 15%, 13-24 = 20%,
  25-36 = 30%, 37-48 = 40%, 49-60 = 50%. Vehicles over 60 months need a manually
  agreed IDV, so Standard/Premium return a 422; Basic (TP-only) still works.
- **NCB:** 1 yr 20%, 2 yr 25%, 3 yr 35%, 4 yr 45%, 5+ yr 50%. Applies to OD only.
- **cc band:** `below_1000` (< 1000 cc, including EVs stored as 0 cc),
  `1000_1500` (1000-1500 cc), `above_1500` (> 1500 cc).
- **City zone:** metros (Mumbai, Delhi, Kolkata, Chennai, Bengaluru, Hyderabad,
  Ahmedabad, Pune) are `zone_a_mumbai_delhi`; listed tier-2 cities are
  `zone_b_tier2`; everything else is `zone_c_other`. See `calculator.py`.
- **Plans:** Basic = TP only. Standard = OD + TP with NCB. Premium = Standard +
  recommended add-ons.
- **Add-on rules** (`ADDON_RULES` in `calculator.py`):

  | Add-on | Eligible | Recommended in Premium |
  |---|---|---|
  | zero_depreciation | up to 60 months | when eligible |
  | roadside_assistance | always | always |
  | engine_protection | up to 60 months, not EVs | only in flood-prone cities |
  | consumables_cover | up to 60 months | when eligible |
  | return_to_invoice | up to 36 months | when eligible |
  | key_replacement | always | always |

  Selecting an ineligible add-on returns a 422 with the reason.

Every saved quote stores its full breakdown in `quotes.calculation_snapshot`,
so it stays reproducible even if rates or slabs change later.

## AI add-on advisor

`POST /advisor/addons` (and the **Ask AI advisor** button in the UI) explains
which add-ons suit a vehicle, using Azure OpenAI (`AZURE_OPENAI_*` in `.env`).
The AI never prices anything:

1. The rule engine decides which add-ons are available for the vehicle (age,
   fuel type) and computes each exact price from IDV.
2. Only that list, with exact prices, is sent to the model (`src/advisor.py`,
   `SYSTEM_PROMPT`), which returns JSON recommendations with 1-2 sentence
   reasons.
3. `validate_advice` rejects the response if it names an add-on not in the
   list, states a different price, skips an add-on, or mentions any rupee amount
   that isn't a listed price.
4. A rejected response gets one retry with the errors fed back; if it still
   fails (or Azure is unavailable) the rule-based recommendations are returned
   with `source: "rules_fallback"`.
5. Prices in the response and `recommended_total` always come from the rule
   engine, not the model.

```json
POST /advisor/addons
{ "vehicle_id": 12, "city": "Mumbai", "registration_date": "2025-09-01" }
```

## Reference data notes

- Depreciation and NCB slabs are the standard IRDAI values.
- Zone A/B OD rates follow the old IRDAI private-car tariff; Zone C rates are
  illustrative. TP amounts: 2,094 (< 1000 cc), 3,416 (1000-1500 cc), 7,500
  (> 1500 cc, capped at the requested range; the current IRDAI figure is 7,897).
- Vehicle prices are approximate ex-showroom figures; add-on price rules are
  illustrative.
- GST (18%) is **not** included in `total_premium`.
