"""FastAPI app for the Motor Insurance Quote Engine.

One application serves the agent dashboard (React build), the JSON API (also
reachable under /api for the frontend), the customer quote pages (/q/{token})
and the RAG sales copilot.
"""

from __future__ import annotations

import os
import re
import secrets
from collections import Counter
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from typing import Any, Literal
from urllib.parse import quote as url_quote

from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import Select, and_, case, func, or_, select, text
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session, joinedload, selectinload

import copilot
import mailer
from advisor import build_addon_context, get_addon_advice
from calculator import (
    CITY_ZONES,
    FLOOD_PRONE_CITIES,
    ZONE_A_CITIES,
    ZONE_B_CITIES,
    calculate_all_three_plans,
    calculate_full_quote,
    city_zone_for,
    compare_insurer_quotes,
    load_reference_data,
    recommended_addons,
    resolve_vehicle_age,
)
from database import PROJECT_ROOT, get_db
from documents import addon_label, render_message_page, render_quote_html
from models import INSURERS, Addon, Customer, InsurerAddonPolicy, InsurerPolicySection, Quote, RateCard, VehicleMaster
from schemas import (
    AddonOptionsRequest,
    AddonOptionsResponse,
    AddonOut,
    AddonPolicyOut,
    AdvisorRequest,
    AdvisorResponse,
    AssistantRequest,
    AssistantResponse,
    CustomerCreate,
    CustomerOut,
    EffectiveStatus,
    LeadStatus,
    InsurerCompareRequest,
    InsurerComparison,
    MarketAddonResponse,
    PlanComparison,
    PlanComparisonRequest,
    PolicySectionOut,
    QuoteBreakdown,
    QuoteOut,
    QuoteRequest,
    QuoteStatusUpdate,
    RateCardOut,
    SendEmailOut,
    ShareOut,
    ShareRequest,
    VehicleCreate,
    VehicleOut,
)

QUOTE_VALIDITY = timedelta(days=int(os.getenv("QUOTE_VALIDITY_DAYS", "30")))
IST = timezone(timedelta(hours=5, minutes=30))
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST") or PROJECT_ROOT.parent / "Frontend" / "dist")
PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or "").rstrip("/")

app = FastAPI(
    title="Motor Insurance Quote Engine",
    description="Deterministic, rule-based motor insurance premium quotes with itemised breakdowns.",
    version="2.0.0",
)


class StripApiPrefix:
    """Serve every route under /api/... as well, so the SPA can call /api/* in dev and prod."""

    def __init__(self, asgi_app: Any) -> None:
        self.app = asgi_app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] == "http" and (scope["path"] == "/api" or scope["path"].startswith("/api/")):
            scope = dict(scope)
            scope["path"] = scope["path"][4:] or "/"
            scope["raw_path"] = scope["path"].encode()
        await self.app(scope, receive, send)


app.add_middleware(StripApiPrefix)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

ALLOWED_STATUS_TRANSITIONS: dict[str, set[str]] = {
    "draft": {"sent", "converted"},
    "sent": {"converted"},
    "converted": set(),
}


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #

def _quote_vehicle(vehicle: VehicleMaster, payload: Any) -> Any:
    """Catalog row plus optional quote-time edits (cc, price, year, fuel). Never writes to DB."""
    fuel = payload.fuel_type or vehicle.fuel_type
    engine_cc = vehicle.engine_cc if payload.engine_cc is None else payload.engine_cc
    if fuel == "electric":
        engine_cc = 0
    return SimpleNamespace(
        vehicle_id=vehicle.vehicle_id,
        make=vehicle.make,
        model=vehicle.model,
        year=vehicle.year if payload.year is None else payload.year,
        fuel_type=fuel,
        engine_cc=engine_cc,
        ex_showroom_price=vehicle.ex_showroom_price if payload.ex_showroom_price is None else payload.ex_showroom_price,
    )


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_or_404(db: Session, model: type, pk: int, label: str) -> Any:
    obj = db.get(model, pk)
    if obj is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"{label} {pk} not found.")
    return obj


def _unprocessable(exc: Exception) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))


def display_id(quote: Quote) -> str:
    return f"QT-{quote.created_at.year}-{quote.quote_id:04d}"


def effective_status(quote: Quote, now: datetime | None = None) -> str:
    if quote.status in ("draft", "sent") and quote.valid_until and quote.valid_until < (now or _now()):
        return "expired"
    return quote.status


def _vehicle_label(v: VehicleMaster) -> str:
    return f"{v.make} {v.model} {v.year}"


def _quote_out(quote: Quote) -> QuoteOut:
    snapshot = dict(quote.calculation_snapshot)
    snapshot.setdefault("gst_amount", quote.gst_amount)
    snapshot.setdefault("total_payable", quote.total_payable)
    snapshot.setdefault("insurer", quote.insurer)
    c = quote.customer
    return QuoteOut(
        quote_id=quote.quote_id,
        display_id=display_id(quote),
        customer_id=quote.customer_id,
        vehicle_id=quote.vehicle_id,
        plan_tier=quote.plan_tier,
        insurer=quote.insurer,
        status=quote.status,
        effective_status=effective_status(quote),
        claim_free_years=quote.claim_free_years,
        city=quote.city,
        idv=quote.idv,
        od_premium=quote.od_premium,
        ncb_discount_amount=quote.ncb_discount_amount,
        tp_premium=quote.tp_premium,
        addons_selected=quote.addons_selected,
        total_premium=quote.total_premium,
        gst_amount=quote.gst_amount,
        total_payable=quote.total_payable,
        created_at=quote.created_at,
        valid_until=quote.valid_until,
        sent_at=quote.sent_at,
        converted_at=quote.converted_at,
        share_url=f"/q/{quote.share_token}" if quote.share_token else None,
        customer={"customer_id": c.customer_id, "name": c.name, "phone": c.phone, "email": c.email, "city": c.city},
        vehicle=VehicleOut.model_validate(quote.vehicle),
        breakdown=QuoteBreakdown.model_validate(snapshot),
    )


def _quote_query() -> Select:
    return select(Quote).options(joinedload(Quote.customer), joinedload(Quote.vehicle))


def _load_quote(db: Session, quote_id: int) -> Quote:
    quote = db.scalars(_quote_query().where(Quote.quote_id == quote_id)).first()
    if quote is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Quote {quote_id} not found.")
    return quote


def _status_clause(wanted: str, now: datetime) -> Any:
    live = or_(Quote.valid_until.is_(None), Quote.valid_until >= now)
    if wanted == "expired":
        return and_(Quote.status.in_(("draft", "sent")), Quote.valid_until < now)
    if wanted == "converted":
        return Quote.status == "converted"
    return and_(Quote.status == wanted, live)


def _set_status(quote: Quote, new_status: str, now: datetime) -> None:
    """Apply a forward status change and stamp its timestamp. Raises 409 if not allowed."""
    if new_status == quote.status:
        return
    if new_status not in ALLOWED_STATUS_TRANSITIONS[quote.status]:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Cannot change status from '{quote.status}' to '{new_status}'.")
    if effective_status(quote, now) == "expired":
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Quote {display_id(quote)} expired on {quote.valid_until:%d %b %Y}. Create a fresh quote.",
        )
    quote.status = new_status
    if new_status in ("sent", "converted") and quote.sent_at is None:
        quote.sent_at = now
    if new_status == "converted":
        quote.converted_at = now


def _customer_out(customer: Customer, quote_count: int = 0, converted: int = 0, last_at: datetime | None = None) -> CustomerOut:
    out = CustomerOut.model_validate(customer)
    out.preferred_vehicle_label = _vehicle_label(customer.preferred_vehicle) if customer.preferred_vehicle else None
    out.quote_count, out.converted_count, out.last_quote_at = quote_count, converted, last_at
    return out


def _customer_stats_query() -> Select:
    return (
        select(
            Customer,
            func.count(Quote.quote_id),
            func.coalesce(func.sum(case((Quote.status == "converted", 1), else_=0)), 0),
            func.max(Quote.created_at),
        )
        .outerjoin(Quote, Quote.customer_id == Customer.customer_id)
        .options(selectinload(Customer.preferred_vehicle))
        .group_by(Customer.customer_id)
    )


# --------------------------------------------------------------------------- #
# Health & reference data
# --------------------------------------------------------------------------- #

@app.get("/health", tags=["meta"])
def health(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, f"Database unavailable: {exc.__class__.__name__}")
    return {"status": "ok", "database": "ok"}


@app.get("/vehicles", response_model=list[VehicleOut], tags=["vehicles"])
def list_vehicles(
    make: str | None = Query(None, description="Case-insensitive partial match."),
    fuel_type: str | None = None,
    year: int | None = None,
    db: Session = Depends(get_db),
) -> list[VehicleMaster]:
    stmt = select(VehicleMaster).order_by(VehicleMaster.make, VehicleMaster.model, VehicleMaster.year)
    if make:
        stmt = stmt.where(VehicleMaster.make.ilike(f"%{make}%"))
    if fuel_type:
        stmt = stmt.where(VehicleMaster.fuel_type == fuel_type.lower())
    if year:
        stmt = stmt.where(VehicleMaster.year == year)
    return list(db.scalars(stmt))


@app.get("/vehicles/{vehicle_id}", response_model=VehicleOut, tags=["vehicles"])
def get_vehicle(vehicle_id: int, db: Session = Depends(get_db)) -> VehicleMaster:
    return _get_or_404(db, VehicleMaster, vehicle_id, "Vehicle")


@app.post("/vehicles", response_model=VehicleOut, status_code=status.HTTP_201_CREATED, tags=["vehicles"])
def create_vehicle(payload: VehicleCreate, db: Session = Depends(get_db)) -> VehicleMaster:
    vehicle = VehicleMaster(**payload.model_dump())
    db.add(vehicle)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "A vehicle with this make, model, year and fuel type already exists.")
    db.refresh(vehicle)
    return vehicle


@app.get("/addons", response_model=list[AddonOut], tags=["reference"])
def list_addons(db: Session = Depends(get_db)) -> list[Addon]:
    return list(db.scalars(select(Addon).order_by(Addon.addon_id)))


@app.post("/addons/options", response_model=AddonOptionsResponse, tags=["reference"])
def addon_options(payload: AddonOptionsRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Every add-on for this vehicle and city: exact price, eligibility and rule recommendation."""
    vehicle = _quote_vehicle(_get_or_404(db, VehicleMaster, payload.vehicle_id, "Vehicle"), payload)
    try:
        ctx = build_addon_context(
            vehicle, payload.city, db, payload.registration_date,
            claim_free_years=payload.claim_free_years, insurer=payload.insurer,
        )
    except ValueError as exc:
        raise _unprocessable(exc)
    available = {a.addon_id: a for a in ctx["available"]}
    unavailable = {u["addon_id"]: u["reason"] for u in ctx["unavailable"]}
    picks = dict(ctx["rule_picks"])
    options = []
    for addon in ctx["addons"]:
        a = available.get(addon.addon_id)
        options.append({
            "addon_id": addon.addon_id,
            "addon_name": addon.addon_name,
            "price_rule": addon.price_rule,
            "applicability_note": addon.applicability_note,
            "available": a is not None,
            "price": a.price if a else None,
            "formula": a.formula if a else None,
            "unavailable_reason": unavailable.get(addon.addon_id),
            "recommended": addon.addon_id in picks,
            "recommendation_reason": picks.get(addon.addon_id),
        })
    return {**ctx["profile"], "options": options}


@app.post("/addons/market", response_model=MarketAddonResponse, tags=["reference"])
def addon_market(payload: InsurerCompareRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Add-on catalogue with each insurer's price, eligibility and recommendation."""
    vehicle = _quote_vehicle(_get_or_404(db, VehicleMaster, payload.vehicle_id, "Vehicle"), payload)
    merged: dict[int, dict[str, Any]] = {}
    profile: dict[str, Any] | None = None
    try:
        for insurer in INSURERS:
            ctx = build_addon_context(
                vehicle, payload.city, db, payload.registration_date,
                claim_free_years=payload.claim_free_years, insurer=insurer,
            )
            if profile is None:
                profile = {k: v for k, v in ctx["profile"].items() if k != "insurer"}
            available = {a.addon_id: a for a in ctx["available"]}
            unavailable = {u["addon_id"]: u["reason"] for u in ctx["unavailable"]}
            picks = dict(ctx["rule_picks"])
            for addon in ctx["addons"]:
                row = merged.setdefault(addon.addon_id, {
                    "addon_id": addon.addon_id,
                    "addon_name": addon.addon_name,
                    "by_insurer": [],
                })
                avail = addon.addon_id in available
                price = available[addon.addon_id].price if avail else None
                rec = addon.addon_id in picks
                row["by_insurer"].append({
                    "insurer": insurer,
                    "available": avail,
                    "price": price,
                    "recommended": rec,
                    "reason": picks.get(addon.addon_id) if rec else unavailable.get(addon.addon_id) or addon.applicability_note,
                })
    except ValueError as exc:
        raise _unprocessable(exc)
    options = []
    for row in merged.values():
        prices = [p["price"] for p in row["by_insurer"] if p["available"] and p["price"] is not None]
        recommended_by = [p["insurer"] for p in row["by_insurer"] if p["recommended"] and p["available"]]
        options.append({
            **row,
            "available": any(p["available"] for p in row["by_insurer"]),
            "recommended": bool(recommended_by),
            "recommended_by": recommended_by,
            "price_min": min(prices) if prices else None,
            "price_max": max(prices) if prices else None,
        })
    options.sort(key=lambda o: o["addon_id"])
    return {**(profile or {}), "options": options}


@app.get("/rate-card", response_model=list[RateCardOut], tags=["reference"])
def list_rate_card(
    insurer: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[RateCard]:
    stmt = select(RateCard).order_by(RateCard.insurer, RateCard.city_zone, RateCard.cc_band)
    if insurer:
        stmt = stmt.where(RateCard.insurer == insurer)
    return list(db.scalars(stmt))


@app.get("/addon-policies", response_model=list[AddonPolicyOut], tags=["reference"])
def list_addon_policies(
    insurer: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    stmt = select(InsurerAddonPolicy).options(joinedload(InsurerAddonPolicy.addon)).order_by(
        InsurerAddonPolicy.insurer, InsurerAddonPolicy.addon_id
    )
    if insurer:
        stmt = stmt.where(InsurerAddonPolicy.insurer == insurer)
    rows = list(db.scalars(stmt).unique())
    return [
        {
            "policy_id": row.policy_id,
            "insurer": row.insurer,
            "addon_id": row.addon_id,
            "addon_name": row.addon.addon_name if row.addon else None,
            "price_rule": row.price_rule,
            "applicability_note": row.applicability_note,
            "max_vehicle_age_months": row.max_vehicle_age_months,
            "excluded_fuel_types": row.excluded_fuel_types or [],
            "recommend_only_in_flood_prone_city": row.recommend_only_in_flood_prone_city,
            "min_claim_free_years": row.min_claim_free_years,
            "recommendation_reason": row.recommendation_reason,
        }
        for row in rows
    ]


@app.get("/insurers", tags=["reference"])
def list_insurers() -> list[str]:
    return list(INSURERS)


@app.get("/insurers/{insurer}/policy-sections", response_model=list[PolicySectionOut], tags=["reference"])
def list_policy_sections(insurer: str, db: Session = Depends(get_db)) -> list[InsurerPolicySection]:
    if insurer not in INSURERS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown insurer '{insurer}'.")
    return list(db.scalars(
        select(InsurerPolicySection)
        .where(InsurerPolicySection.insurer == insurer)
        .order_by(InsurerPolicySection.section_number)
    ))


@app.get("/cities", tags=["reference"])
def list_cities() -> list[dict[str, Any]]:
    """Known cities with their zone and flood-prone flag (other cities price as zone C)."""
    cities = sorted(ZONE_A_CITIES | ZONE_B_CITIES)
    return [
        {"city": c.title(), "city_zone": city_zone_for(c), "flood_prone": c in FLOOD_PRONE_CITIES}
        for c in cities
    ]


@app.get("/city-zone", tags=["reference"])
def get_city_zone(city: str) -> dict[str, str]:
    """Which rate-card zone a city falls into."""
    return {"city": city, "city_zone": city_zone_for(city), "zones": ", ".join(CITY_ZONES)}


# --------------------------------------------------------------------------- #
# Customers
# --------------------------------------------------------------------------- #

@app.post("/customers", response_model=CustomerOut, status_code=status.HTTP_201_CREATED, tags=["customers"])
def create_customer(payload: CustomerCreate, db: Session = Depends(get_db)) -> CustomerOut:
    existing = db.scalars(select(Customer).where(Customer.phone == payload.phone)).first()
    if existing is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Customer {existing.name} (id {existing.customer_id}) already uses this mobile number.",
        )
    if payload.preferred_vehicle_id is not None:
        _get_or_404(db, VehicleMaster, payload.preferred_vehicle_id, "Vehicle")
    customer = Customer(**payload.model_dump())
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return _customer_out(customer)


@app.get("/customers", response_model=list[CustomerOut], tags=["customers"])
def list_customers(
    phone: str | None = None,
    q: str | None = Query(None, description="Search name, phone, email, city or registration number."),
    lead_status: LeadStatus | None = None,
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[CustomerOut]:
    stmt = _customer_stats_query().order_by(Customer.created_at.desc()).limit(limit)
    if phone:
        stmt = stmt.where(Customer.phone == phone)
    if lead_status:
        stmt = stmt.where(Customer.lead_status == lead_status)
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(or_(
            Customer.name.ilike(like), Customer.phone.ilike(like), Customer.email.ilike(like),
            Customer.city.ilike(like), Customer.registration_number.ilike(like),
        ))
    return [_customer_out(c, n, conv, last) for c, n, conv, last in db.execute(stmt).unique()]


@app.get("/customers/{customer_id}", response_model=CustomerOut, tags=["customers"])
def get_customer(customer_id: int, db: Session = Depends(get_db)) -> CustomerOut:
    row = db.execute(_customer_stats_query().where(Customer.customer_id == customer_id)).unique().first()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Customer {customer_id} not found.")
    return _customer_out(*row)


# --------------------------------------------------------------------------- #
# Quotes
# --------------------------------------------------------------------------- #

@app.post("/quotes/calculate", response_model=PlanComparison, tags=["quotes"])
def calculate_plans(payload: PlanComparisonRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Basic / Standard / Premium side by side. Nothing is saved."""
    vehicle = _quote_vehicle(_get_or_404(db, VehicleMaster, payload.vehicle_id, "Vehicle"), payload)
    try:
        plans = calculate_all_three_plans(
            vehicle,
            city_zone_for(payload.city),
            payload.claim_free_years,
            db,
            city=payload.city,
            registration_date=payload.registration_date,
            premium_addon_ids=payload.selected_addon_ids,
            insurer=payload.insurer,
        )
        return plans
    except ValueError as exc:
        raise _unprocessable(exc)


@app.post("/quotes/compare-insurers", response_model=InsurerComparison, tags=["quotes"])
def compare_insurers(payload: InsurerCompareRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Premium quotes from every policy provider for the same vehicle, NCB and add-ons."""
    vehicle = _quote_vehicle(_get_or_404(db, VehicleMaster, payload.vehicle_id, "Vehicle"), payload)
    try:
        return compare_insurer_quotes(
            vehicle,
            payload.city,
            payload.claim_free_years,
            payload.selected_addon_ids,
            db,
            registration_date=payload.registration_date,
        )
    except ValueError as exc:
        raise _unprocessable(exc)


@app.post("/advisor/addons", response_model=AdvisorResponse, tags=["advisor"])
def advise_addons(payload: AdvisorRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    """AI explanation of which add-ons suit this vehicle.

    Availability and prices come from the rule engine; the LLM only chooses and
    explains. Output that names unknown add-ons or states different prices is
    rejected (one retry), then replaced by rule-based recommendations.
    """
    vehicle = _quote_vehicle(_get_or_404(db, VehicleMaster, payload.vehicle_id, "Vehicle"), payload)
    try:
        return get_addon_advice(
            vehicle, payload.city, db,
            registration_date=payload.registration_date,
            claim_free_years=payload.claim_free_years,
            insurer=payload.insurer,
        )
    except ValueError as exc:
        raise _unprocessable(exc)


@app.post("/quotes", response_model=QuoteOut, status_code=status.HTTP_201_CREATED, tags=["quotes"])
def create_quote(payload: QuoteRequest, db: Session = Depends(get_db)) -> QuoteOut:
    """Calculate one plan tier and save it as a draft quote.

    A new customer is matched to an existing one by phone number, so re-quoting
    the same customer does not create duplicates.
    """
    vehicle = _quote_vehicle(_get_or_404(db, VehicleMaster, payload.vehicle_id, "Vehicle"), payload)

    if payload.existing_customer_id is not None:
        customer = _get_or_404(db, Customer, payload.existing_customer_id, "Customer")
    else:
        details = payload.customer
        customer = db.scalars(select(Customer).where(Customer.phone == details.phone)).first()
        if customer is None:
            customer = Customer(**details.model_dump())
            db.add(customer)
            db.flush()

    city_zone = city_zone_for(payload.city)
    try:
        ref = load_reference_data(db, insurer=payload.insurer)
        age_months, _ = resolve_vehicle_age(vehicle, registration_date=payload.registration_date)
        picks = recommended_addons(ref.addons, age_months, vehicle.fuel_type, payload.city, payload.claim_free_years)
        reasons = {a.addon_id: r for a, r in picks}
        addon_ids: list[int] = []
        if payload.plan_tier == "premium":
            addon_ids = payload.selected_addon_ids if payload.selected_addon_ids is not None else list(reasons)
        breakdown = calculate_full_quote(
            vehicle, city_zone, payload.claim_free_years, addon_ids, db,
            include_own_damage=payload.plan_tier != "basic",
            plan_tier=payload.plan_tier,
            city=payload.city,
            registration_date=payload.registration_date,
            reference=ref,
            addon_reasons=reasons,
            insurer=payload.insurer,
        )
    except ValueError as exc:
        db.rollback()
        raise _unprocessable(exc)

    snapshot = QuoteBreakdown.model_validate(breakdown).model_dump(mode="json")
    now = _now()
    quote = Quote(
        customer_id=customer.customer_id,
        vehicle_id=vehicle.vehicle_id,
        claim_free_years=payload.claim_free_years,
        city=payload.city,
        idv=breakdown["idv"],
        od_premium=breakdown["od_premium"],
        ncb_discount_amount=breakdown["ncb_discount_amount"],
        tp_premium=breakdown["tp_premium"],
        addons_selected=[
            {"addon_id": a["addon_id"], "addon_name": a["addon_name"], "price": str(a["price"])}
            for a in breakdown["addon_breakdown"]
        ],
        plan_tier=payload.plan_tier,
        insurer=payload.insurer,
        total_premium=breakdown["total_premium"],
        gst_amount=breakdown["gst_amount"],
        total_payable=breakdown["total_payable"],
        calculation_snapshot=snapshot,
        created_at=now,
        valid_until=now + QUOTE_VALIDITY,
    )
    db.add(quote)
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Could not save quote: {exc.__class__.__name__}")
    return _quote_out(_load_quote(db, quote.quote_id))


@app.get("/quotes", response_model=list[QuoteOut], tags=["quotes"])
def list_quotes(
    customer_id: int | None = None,
    vehicle_id: int | None = None,
    status_filter: EffectiveStatus | None = Query(None, alias="status"),
    q: str | None = Query(None, description="Search quote id, customer, phone, city or vehicle."),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> list[QuoteOut]:
    stmt = _quote_query().order_by(Quote.created_at.desc()).limit(limit)
    if customer_id is not None:
        stmt = stmt.where(Quote.customer_id == customer_id)
    if vehicle_id is not None:
        stmt = stmt.where(Quote.vehicle_id == vehicle_id)
    if status_filter is not None:
        stmt = stmt.where(_status_clause(status_filter, _now()))
    if q and q.strip():
        term = q.strip()
        like = f"%{term}%"
        conditions = [
            Customer.name.ilike(like), Customer.phone.ilike(like), Quote.city.ilike(like),
            VehicleMaster.make.ilike(like), VehicleMaster.model.ilike(like),
            func.concat(VehicleMaster.make, " ", VehicleMaster.model).ilike(like),
        ]
        id_match = re.fullmatch(r"(?:QT-\d{4}-)?0*(\d+)", term, re.IGNORECASE)
        if id_match:
            conditions.append(Quote.quote_id == int(id_match.group(1)))
        stmt = (
            stmt.join(Customer, Customer.customer_id == Quote.customer_id)
            .join(VehicleMaster, VehicleMaster.vehicle_id == Quote.vehicle_id)
            .where(or_(*conditions))
        )
    return [_quote_out(q_) for q_ in db.scalars(stmt).unique()]


@app.get("/quotes/{quote_id}", response_model=QuoteOut, tags=["quotes"])
def get_quote(quote_id: int, db: Session = Depends(get_db)) -> QuoteOut:
    return _quote_out(_load_quote(db, quote_id))


@app.patch("/quotes/{quote_id}/status", response_model=QuoteOut, tags=["quotes"])
def update_quote_status(quote_id: int, payload: QuoteStatusUpdate, db: Session = Depends(get_db)) -> QuoteOut:
    """Move a quote forward: draft -> sent -> converted (draft -> converted also allowed)."""
    quote = _load_quote(db, quote_id)
    _set_status(quote, payload.status, _now())
    db.commit()
    return _quote_out(_load_quote(db, quote_id))


def _base_url(request: Request) -> str:
    return PUBLIC_BASE_URL or str(request.base_url).rstrip("/")


def _whatsapp_number(phone: str | None) -> str:
    """Digits for wa.me: India numbers become 91XXXXXXXXXX."""
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("91") and len(digits) >= 12:
        return digits
    if len(digits) >= 10:
        return "91" + digits[-10:]
    return digits


def _ensure_customer_link(quote: Quote, request: Request, db: Session) -> tuple[str, str]:
    """Mint the public /q/{token} link and mark a draft as sent. Caller may commit first."""
    if effective_status(quote) == "expired":
        raise HTTPException(status.HTTP_409_CONFLICT, f"Quote {display_id(quote)} has expired. Create a fresh quote.")
    if quote.share_token is None:
        quote.share_token = secrets.token_urlsafe(18)
    if quote.status == "draft":
        _set_status(quote, "sent", _now())
    db.commit()
    link = f"{_base_url(request)}/q/{quote.share_token}"
    first_name = quote.customer.name.split()[0]
    message = (
        f"Hi {first_name}, here is your complete {quote.insurer} motor policy document "
        f"{display_id(quote)} for your {quote.vehicle.make} {quote.vehicle.model}. "
        f"Total payable Rs {quote.total_payable:,.2f} (incl. GST), valid till {quote.valid_until:%d %b %Y}. "
        f"Open, download and accept it here: {link}"
    )
    return link, message


def _share_payload(quote: Quote, request: Request, link: str, message: str) -> dict[str, Any]:
    wa = _whatsapp_number(quote.customer.phone)
    email = (quote.customer.email or "").strip()
    subject = f"Your {quote.insurer} motor policy document {display_id(quote)}"
    wa_chat = f"https://wa.me/{wa}" if wa else ""
    return {
        "share_url": link,
        "wa_me_url": wa_chat,
        "whatsapp_url": f"{wa_chat}?text={url_quote(message)}" if wa else "",
        "email_url": (
            f"mailto:{email}?subject={url_quote(subject)}&body={url_quote(message)}" if email else ""
        ),
        "message": message,
        "quote": _quote_out(quote),
    }


@app.post("/quotes/{quote_id}/share", response_model=ShareOut, tags=["quotes"])
def share_quote(
    quote_id: int, request: Request, payload: ShareRequest | None = None, db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Create the customer link (view, download, one-click accept) and mark a draft as sent."""
    quote = _load_quote(db, quote_id)
    link, message = _ensure_customer_link(quote, request, db)
    return _share_payload(_load_quote(db, quote_id), request, link, message)


@app.post("/quotes/{quote_id}/send-email", response_model=SendEmailOut, tags=["quotes"])
def send_quote_email(quote_id: int, request: Request, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Send the policy document from dhawalevs@rknec.edu to the customer's Step-1 email."""
    quote = _load_quote(db, quote_id)
    to_email = (quote.customer.email or "").strip()
    if not to_email:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This customer has no email address.")
    link, message = _ensure_customer_link(quote, request, db)
    quote = _load_quote(db, quote_id)
    subject = f"Your {quote.insurer} motor policy document {display_id(quote)}"
    document_html = render_quote_html(
        _quote_out(quote).model_dump(),
        customer_view=True,
        accept_action=f"/q/{quote.share_token}/accept",
        policy_sections=_policy_section_payload(db, quote.insurer),
    )
    try:
        sent = mailer.send_quote_document(
            to_email=to_email,
            customer_name=quote.customer.name,
            subject=subject,
            text_body=message,
            share_url=link,
            attachment_html=document_html,
            attachment_name=f"{display_id(quote)}-policy-document.html",
        )
    except mailer.MailerError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return {
        "sent": True,
        "email_from": sent["email_from"],
        "email_to": sent["email_to"],
        "share_url": link,
        "message": message,
        "quote": _quote_out(quote),
    }


@app.get("/quotes/{quote_id}/document", response_class=HTMLResponse, tags=["quotes"])
def quote_document(quote_id: int, db: Session = Depends(get_db)) -> HTMLResponse:
    """Complete printable policy quote (use the browser's Save as PDF)."""
    quote = _quote_out(_load_quote(db, quote_id))
    return HTMLResponse(render_quote_html(
        quote.model_dump(),
        customer_view=False,
        policy_sections=_policy_section_payload(db, quote.insurer),
    ))


# --------------------------------------------------------------------------- #
# Customer-facing quote page (shared link)
# --------------------------------------------------------------------------- #

def _policy_section_payload(db: Session, insurer: str) -> list[dict[str, Any]]:
    sections = list(db.scalars(
        select(InsurerPolicySection)
        .where(InsurerPolicySection.insurer == insurer)
        .order_by(InsurerPolicySection.section_number)
    ))
    return [
        {
            "section_number": s.section_number,
            "section_title": s.section_title,
            "parent_category": s.parent_category,
            "related_addon": s.related_addon,
            "content": s.content,
        }
        for s in sections
    ]


def _quote_by_token(db: Session, token: str) -> Quote | None:
    return db.scalars(_quote_query().where(Quote.share_token == token)).first()


@app.get("/q/{token}", response_class=HTMLResponse, include_in_schema=False)
def customer_quote_page(token: str, accepted: int = 0, db: Session = Depends(get_db)) -> HTMLResponse:
    quote = _quote_by_token(db, token)
    if quote is None:
        return HTMLResponse(render_message_page("Quote not found", "This link is invalid or has been withdrawn."), 404)
    out = _quote_out(quote).model_dump()
    return HTMLResponse(render_quote_html(
        out,
        customer_view=True,
        accept_action=f"/q/{token}/accept",
        just_accepted=bool(accepted),
        policy_sections=_policy_section_payload(db, quote.insurer),
    ))


@app.post("/q/{token}/accept", include_in_schema=False)
def customer_accept_quote(token: str, db: Session = Depends(get_db)) -> Any:
    quote = _quote_by_token(db, token)
    if quote is None:
        return HTMLResponse(render_message_page("Quote not found", "This link is invalid or has been withdrawn."), 404)
    if quote.status != "converted":
        try:
            _set_status(quote, "converted", _now())
        except HTTPException as exc:
            return HTMLResponse(render_message_page("Quote cannot be accepted", str(exc.detail)), exc.status_code)
        db.commit()
    return RedirectResponse(f"/q/{token}?accepted=1", status_code=status.HTTP_303_SEE_OTHER)


# --------------------------------------------------------------------------- #
# Agent dashboard
# --------------------------------------------------------------------------- #

Period = Literal["month", "30d", "all"]


def _period_bounds(period: str, now: datetime) -> tuple[datetime | None, datetime | None, datetime | None, str]:
    """(start, previous_start, previous_end, label); None start means all time."""
    local = now.astimezone(IST)
    if period == "month":
        start = local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        prev_start = (start - timedelta(days=1)).replace(day=1)
        return start, prev_start, start, local.strftime("%B %Y")
    if period == "30d":
        start = now - timedelta(days=30)
        return start, start - timedelta(days=30), start, "Last 30 days"
    return None, None, None, "All time"


def _in(ts: datetime | None, start: datetime | None, end: datetime | None) -> bool:
    return ts is not None and (start is None or ts >= start) and (end is None or ts < end)


def _change(current: float, previous: float | None) -> float | None:
    if previous is None or previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


@app.get("/dashboard", tags=["dashboard"])
def dashboard(period: Period = "month", db: Session = Depends(get_db)) -> dict[str, Any]:
    """Quotes created / sent / converted, premium won, funnel, trends and top vehicles."""
    now = _now()
    start, prev_start, prev_end, label = _period_bounds(period, now)
    quotes = list(db.scalars(_quote_query().order_by(Quote.created_at.desc())).unique())

    def counts(s: datetime | None, e: datetime | None) -> dict[str, float]:
        converted = [q for q in quotes if _in(q.converted_at, s, e)]
        return {
            "created": sum(_in(q.created_at, s, e) for q in quotes),
            "sent": sum(_in(q.sent_at, s, e) for q in quotes),
            "converted": len(converted),
            "premium": float(sum((q.total_payable for q in converted), Decimal("0"))),
        }

    cur = counts(start, None)
    prev = counts(prev_start, prev_end) if start is not None else None
    cohort = [q for q in quotes if _in(q.created_at, start, None)]
    cohort_converted = sum(q.status == "converted" for q in cohort)
    metric = lambda key: {"value": cur[key], "previous": prev[key] if prev else None,  # noqa: E731
                          "change_pct": _change(cur[key], prev[key] if prev else None)}

    # Trend: up to 8 equal buckets across the period (daily buckets when the period is short).
    first = start or (min((q.created_at for q in quotes), default=now) - timedelta(days=1))
    span_days = max(1, (now - first).days + 1)
    bucket_days = max(1, -(-span_days // 8))
    trend = []
    bucket_start = first
    while bucket_start < now:
        bucket_end = min(bucket_start + timedelta(days=bucket_days), now + timedelta(seconds=1))
        trend.append({
            "label": bucket_start.astimezone(IST).strftime("%d %b"),
            "created": sum(_in(q.created_at, bucket_start, bucket_end) for q in quotes),
            "sent": sum(_in(q.sent_at, bucket_start, bucket_end) for q in quotes),
            "converted": sum(_in(q.converted_at, bucket_start, bucket_end) for q in quotes),
        })
        bucket_start = bucket_end

    vehicle_counts = Counter(f"{q.vehicle.make} {q.vehicle.model}" for q in cohort)
    top_vehicles = [
        {"name": name, "count": n, "percent": round(n / len(cohort) * 100)}
        for name, n in vehicle_counts.most_common(5)
    ]
    addon_counts = Counter(a["addon_name"] for q in cohort for a in q.addons_selected)
    comprehensive = sum(q.plan_tier != "basic" for q in cohort) or 1
    addon_attach = [
        {"addon_name": name, "label": addon_label(name), "count": n, "attach_rate": round(n / comprehensive * 100)}
        for name, n in addon_counts.most_common()
    ]

    events: list[dict[str, Any]] = []
    for q in quotes[:60]:
        who = f"{q.customer.name} ({q.vehicle.make} {q.vehicle.model})"
        events.append({"kind": "created", "at": q.created_at, "quote_id": q.quote_id,
                       "text": f"Quote {display_id(q)} created for {who}"})
        if q.sent_at:
            events.append({"kind": "sent", "at": q.sent_at, "quote_id": q.quote_id,
                           "text": f"Quote {display_id(q)} sent to {q.customer.name}"})
        if q.converted_at:
            events.append({"kind": "converted", "at": q.converted_at, "quote_id": q.quote_id,
                           "text": f"{q.customer.name} accepted {display_id(q)} - Rs {q.total_payable:,.0f}"})
    for c in db.scalars(select(Customer).order_by(Customer.created_at.desc()).limit(10)):
        events.append({"kind": "customer", "at": c.created_at, "quote_id": None, "text": f"New customer added: {c.name}"})
    events.sort(key=lambda ev: ev["at"], reverse=True)

    return {
        "period": {"key": period, "label": label, "start": start},
        "metrics": {
            "quotes_created": metric("created"),
            "quotes_sent": metric("sent"),
            "quotes_converted": metric("converted"),
            "premium_converted": metric("premium"),
            "conversion_rate": round(cohort_converted / len(cohort) * 100, 1) if cohort else 0.0,
            "open_quotes": sum(effective_status(q, now) in ("draft", "sent") for q in quotes),
            "expiring_soon": sum(
                effective_status(q, now) in ("draft", "sent") and q.valid_until is not None
                and q.valid_until < now + timedelta(days=7) for q in quotes
            ),
        },
        "funnel": {
            "created": len(cohort),
            "sent": sum(q.sent_at is not None for q in cohort),
            "converted": cohort_converted,
            "expired": sum(effective_status(q, now) == "expired" for q in cohort),
        },
        "plan_mix": dict(Counter(q.plan_tier for q in cohort)),
        "trend": trend,
        "top_vehicles": top_vehicles,
        "addon_attach": addon_attach,
        "recent_quotes": [_quote_out(q).model_dump(mode="json", exclude={"breakdown"}) for q in quotes[:6]],
        "recent_activity": events[:8],
    }


# --------------------------------------------------------------------------- #
# Sales copilot (RAG)
# --------------------------------------------------------------------------- #

@app.get("/assistant/status", tags=["assistant"])
def assistant_status() -> dict[str, Any]:
    return copilot.status()


@app.post("/assistant/ask", response_model=AssistantResponse, tags=["assistant"])
def assistant_ask(payload: AssistantRequest, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Cited answers from insurer policy wordings; with quote_id, a competitive pitch for that quote."""
    quote_ctx = None
    if payload.quote_id is not None:
        out = _quote_out(_load_quote(db, payload.quote_id))
        quote_ctx = {**out.model_dump(mode="json"), "customer_name": out.customer.name}
    try:
        result = copilot.ask(payload.question, payload.companies, payload.n_results, quote_ctx)
    except copilot.CopilotUnavailableError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc))
    return {**result, "quote_display_id": quote_ctx["display_id"] if quote_ctx else None}


# --------------------------------------------------------------------------- #
# Agent app (React build). Mounted last so API routes take precedence.
# --------------------------------------------------------------------------- #

if (FRONTEND_DIST / "index.html").is_file():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="agent-app")
else:
    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse("/docs")
