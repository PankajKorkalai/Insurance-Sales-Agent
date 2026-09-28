"""Idempotent seeding of reference data and sample vehicles.

Each row is matched on its natural key (e.g. make+model+year+fuel, zone+cc band)
and only inserted if missing, so running this repeatedly never duplicates data.
Existing rows are left untouched.
"""

from __future__ import annotations

import json
import sys
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from calculator import CC_BAND_1000_1500, CC_BAND_ABOVE_1500, CC_BAND_BELOW_1000, ZONE_A, ZONE_B, ZONE_C
from database import SessionLocal
from models import (
    Addon,
    Customer,
    DepreciationSlab,
    InsurerAddonPolicy,
    InsurerPolicySection,
    NcbSlab,
    Quote,
    RateCard,
    VehicleMaster,
)

D = Decimal

# Standard IRDAI IDV depreciation schedule. Bands are inclusive, in completed months.
DEPRECIATION_SLABS: list[dict[str, Any]] = [
    {"age_min_months": 0, "age_max_months": 6, "depreciation_pct": D("5")},
    {"age_min_months": 7, "age_max_months": 12, "depreciation_pct": D("15")},
    {"age_min_months": 13, "age_max_months": 24, "depreciation_pct": D("20")},
    {"age_min_months": 25, "age_max_months": 36, "depreciation_pct": D("30")},
    {"age_min_months": 37, "age_max_months": 48, "depreciation_pct": D("40")},
    {"age_min_months": 49, "age_max_months": 60, "depreciation_pct": D("50")},
]

# Standard NCB slabs.
NCB_SLABS: list[dict[str, Any]] = [
    {"claim_free_years": 1, "ncb_discount_pct": D("20")},
    {"claim_free_years": 2, "ncb_discount_pct": D("25")},
    {"claim_free_years": 3, "ncb_discount_pct": D("35")},
    {"claim_free_years": 4, "ncb_discount_pct": D("45")},
    {"claim_free_years": 5, "ncb_discount_pct": D("50")},
]

# Illustrative OD rates. Third-party premium is the IRDAI national tariff
# (same for every insurer). Own-damage rates and add-on terms differ by
# provider, matching each company's policy wording (age limits, RSA km, etc.).
TP_BY_BAND: dict[str, Decimal] = {
    CC_BAND_BELOW_1000: D("2094"),
    CC_BAND_1000_1500: D("3416"),
    CC_BAND_ABOVE_1500: D("7500"),
}
OD_RATES_BY_INSURER: dict[str, dict[str, dict[str, Decimal]]] = {
    "HDFC ERGO": {
        ZONE_A: {CC_BAND_BELOW_1000: D("3.127"), CC_BAND_1000_1500: D("3.283"), CC_BAND_ABOVE_1500: D("3.440")},
        ZONE_B: {CC_BAND_BELOW_1000: D("3.039"), CC_BAND_1000_1500: D("3.191"), CC_BAND_ABOVE_1500: D("3.343")},
        ZONE_C: {CC_BAND_BELOW_1000: D("2.850"), CC_BAND_1000_1500: D("2.990"), CC_BAND_ABOVE_1500: D("3.130")},
    },
    "ICICI Lombard": {
        ZONE_A: {CC_BAND_BELOW_1000: D("3.315"), CC_BAND_1000_1500: D("3.480"), CC_BAND_ABOVE_1500: D("3.646")},
        ZONE_B: {CC_BAND_BELOW_1000: D("3.221"), CC_BAND_1000_1500: D("3.382"), CC_BAND_ABOVE_1500: D("3.544")},
        ZONE_C: {CC_BAND_BELOW_1000: D("3.021"), CC_BAND_1000_1500: D("3.169"), CC_BAND_ABOVE_1500: D("3.318")},
    },
    "Bajaj Allianz": {
        ZONE_A: {CC_BAND_BELOW_1000: D("3.002"), CC_BAND_1000_1500: D("3.152"), CC_BAND_ABOVE_1500: D("3.302")},
        ZONE_B: {CC_BAND_BELOW_1000: D("2.917"), CC_BAND_1000_1500: D("3.063"), CC_BAND_ABOVE_1500: D("3.209")},
        ZONE_C: {CC_BAND_BELOW_1000: D("2.736"), CC_BAND_1000_1500: D("2.870"), CC_BAND_ABOVE_1500: D("3.005")},
    },
}
OD_RATES = OD_RATES_BY_INSURER["HDFC ERGO"]


def _rate_rows(insurer: str, od_map: dict[str, dict[str, Decimal]]) -> list[dict[str, Any]]:
    return [
        {
            "insurer": insurer,
            "city_zone": zone,
            "cc_band": band,
            "od_rate_pct": rate,
            "tp_premium_flat": TP_BY_BAND[band],
        }
        for zone, bands in od_map.items()
        for band, rate in bands.items()
    ]


RATE_CARD: list[dict[str, Any]] = _rate_rows("HDFC ERGO", OD_RATES_BY_INSURER["HDFC ERGO"])
ALL_RATE_CARDS: list[dict[str, Any]] = [
    row
    for insurer, od_map in OD_RATES_BY_INSURER.items()
    for row in _rate_rows(insurer, od_map)
]

# (make, model, year, fuel_type, engine_cc, ex_showroom_price). EVs use engine_cc 0.
VEHICLES: list[tuple[str, str, int, str, int, int]] = [
    ("Maruti Suzuki", "Alto K10 VXi", 2024, "petrol", 998, 450000),
    ("Maruti Suzuki", "WagonR LXi CNG", 2023, "cng", 998, 645000),
    ("Maruti Suzuki", "Swift VXi", 2025, "petrol", 1197, 729000),
    ("Maruti Suzuki", "Baleno Delta", 2024, "petrol", 1197, 754000),
    ("Maruti Suzuki", "Dzire ZXi", 2025, "petrol", 1197, 879000),
    ("Maruti Suzuki", "Brezza VXi", 2023, "petrol", 1462, 1014000),
    ("Maruti Suzuki", "Ertiga ZXi", 2022, "petrol", 1462, 1105000),
    ("Hyundai", "Grand i10 Nios Sportz", 2023, "petrol", 1197, 736000),
    ("Hyundai", "i20 Asta", 2024, "petrol", 1197, 961000),
    ("Hyundai", "Venue S(O)", 2025, "petrol", 1197, 1000000),
    ("Hyundai", "Verna SX", 2024, "petrol", 1497, 1335000),
    ("Hyundai", "Creta SX", 2026, "petrol", 1497, 1560000),
    ("Tata", "Tiago XZ", 2023, "petrol", 1199, 640000),
    ("Tata", "Tiago EV XZ+ LR", 2024, "electric", 0, 1114000),
    ("Tata", "Punch Adventure", 2025, "petrol", 1199, 712000),
    ("Tata", "Nexon Creative", 2024, "petrol", 1199, 1070000),
    ("Tata", "Nexon EV Empowered", 2025, "electric", 0, 1729000),
    ("Tata", "Harrier Adventure", 2023, "diesel", 1956, 1949000),
    ("Honda", "Amaze VX", 2025, "petrol", 1199, 915000),
    ("Honda", "City V", 2023, "petrol", 1498, 1289000),
    ("Honda", "Elevate VX", 2024, "petrol", 1498, 1391000),
    ("Toyota", "Urban Cruiser Hyryder G", 2024, "petrol", 1462, 1449000),
    ("Toyota", "Innova Crysta GX", 2022, "diesel", 2393, 2045000),
    ("Toyota", "Fortuner 4x2 AT", 2025, "diesel", 2755, 3643000),
    ("Mahindra", "Thar LX", 2023, "diesel", 2184, 1535000),
    ("Mahindra", "Scorpio-N Z8", 2024, "diesel", 2184, 1899000),
    ("Mahindra", "XUV700 AX5", 2026, "petrol", 1999, 1694000),
    ("Kia", "Sonet HTX", 2024, "petrol", 1197, 1152000),
    ("Kia", "Seltos HTX", 2025, "petrol", 1497, 1499000),
    ("Kia", "Carens Prestige", 2022, "petrol", 1497, 1209000),
]

ADDONS: list[dict[str, str]] = [
    {
        "addon_name": "zero_depreciation",
        "price_rule": "pct_of_idv_0.45",
        "applicability_note": "Recommended for vehicles up to 5 years old; not sold beyond 5 years. "
                              "Waives depreciation on replaced parts in OD claims.",
    },
    {
        "addon_name": "roadside_assistance",
        "price_rule": "flat_249",
        "applicability_note": "Recommended for all vehicles. 24x7 towing, flat tyre, battery "
                              "jump-start and fuel delivery.",
    },
    {
        "addon_name": "engine_protection",
        "price_rule": "pct_of_idv_0.15",
        "applicability_note": "Recommended in flood-prone cities (e.g. Mumbai, Chennai, Kolkata) "
                              "for vehicles up to 5 years old. Covers water ingress and hydrostatic "
                              "lock damage. Not available for electric vehicles.",
    },
    {
        "addon_name": "consumables_cover",
        "price_rule": "pct_of_idv_0.10",
        "applicability_note": "Recommended for vehicles up to 5 years old. Covers engine oil, "
                              "coolant, nuts, bolts and other consumables used in OD repairs.",
    },
    {
        "addon_name": "return_to_invoice",
        "price_rule": "pct_of_idv_0.30",
        "applicability_note": "Only for vehicles up to 3 years old. Pays the gap between IDV and "
                              "invoice value (plus registration and road tax) on total loss or theft.",
    },
    {
        "addon_name": "key_replacement",
        "price_rule": "flat_499",
        "applicability_note": "Recommended for all vehicles, especially those with smart keys or "
                              "remote fobs. Covers lost or stolen key and lock replacement.",
    },
]


# Eligibility and prices from each insurer's motor policy wording (RAG seed).
# addon_name is resolved to addon_id at seed time.
INSURER_ADDON_POLICIES: list[dict[str, Any]] = [
    # HDFC ERGO — 5-year zero-dep, 50 km RSA, RTI to 3 years
    {
        "insurer": "HDFC ERGO", "addon_name": "zero_depreciation", "price_rule": "pct_of_idv_0.45",
        "max_vehicle_age_months": 60, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 0,
        "recommendation_reason": "HDFC ERGO Zero Depreciation is for vehicles up to 5 years; 2 claims per year, tyres only if damaged with other parts",
        "applicability_note": "HDFC ERGO: vehicles up to 5 years. 2 claims per policy year. Compulsory deductible still applies.",
    },
    {
        "insurer": "HDFC ERGO", "addon_name": "roadside_assistance", "price_rule": "flat_249",
        "max_vehicle_age_months": None, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 0,
        "recommendation_reason": "HDFC ERGO RSA covers towing up to 50 km and 4 services a year",
        "applicability_note": "HDFC ERGO: 24x7 towing up to 50 km, 4 assistance services per year. Fuel cost borne by the insured.",
    },
    {
        "insurer": "HDFC ERGO", "addon_name": "engine_protection", "price_rule": "pct_of_idv_0.15",
        "max_vehicle_age_months": 60, "excluded_fuel_types": ["electric"],
        "recommend_only_in_flood_prone_city": True, "min_claim_free_years": 0,
        "recommendation_reason": "HDFC ERGO Engine Protect is for ICE vehicles up to 5 years; water ingress is excluded from base OD",
        "applicability_note": "HDFC ERGO: vehicles up to 5 years. Covers water ingression and hydrostatic lock. Not for electric vehicles.",
    },
    {
        "insurer": "HDFC ERGO", "addon_name": "consumables_cover", "price_rule": "pct_of_idv_0.10",
        "max_vehicle_age_months": 60, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 1,
        "recommendation_reason": "HDFC ERGO Consumables after 1 claim-free year; oils and fasteners are excluded from base OD",
        "applicability_note": "HDFC ERGO: vehicles up to 5 years. Engine oil, coolant, nuts and bolts on an admissible OD claim. Fuel not covered.",
    },
    {
        "insurer": "HDFC ERGO", "addon_name": "return_to_invoice", "price_rule": "pct_of_idv_0.30",
        "max_vehicle_age_months": 36, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 2,
        "recommendation_reason": "HDFC ERGO Return to Invoice is for vehicles up to 3 years; suggested from 2 claim-free years",
        "applicability_note": "HDFC ERGO: vehicles up to 3 years. Pays invoice plus first registration and road tax on total loss or theft.",
    },
    {
        "insurer": "HDFC ERGO", "addon_name": "key_replacement", "price_rule": "flat_499",
        "max_vehicle_age_months": None, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 0,
        "recommendation_reason": "HDFC ERGO Key Replacement covers keys and lock set up to Rs 25,000, 2 claims a year",
        "applicability_note": "HDFC ERGO: lost or stolen keys including lock set, up to Rs 25,000. Max 2 claims per year. Police report required.",
    },
    # ICICI Lombard — 7-year zero-dep, 100 km RSA, RTI to 4 years
    {
        "insurer": "ICICI Lombard", "addon_name": "zero_depreciation", "price_rule": "pct_of_idv_0.52",
        "max_vehicle_age_months": 84, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 0,
        "recommendation_reason": "ICICI Lombard Zero Depreciation is for vehicles up to 7 years with unlimited claims",
        "applicability_note": "ICICI Lombard: vehicles up to 7 years. Unlimited claims; Rs 1,000 extra deductible from the third claim. Tyres excluded unless damaged with other parts.",
    },
    {
        "insurer": "ICICI Lombard", "addon_name": "roadside_assistance", "price_rule": "flat_349",
        "max_vehicle_age_months": None, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 0,
        "recommendation_reason": "ICICI Lombard RSA covers towing up to 100 km and 5 services a year",
        "applicability_note": "ICICI Lombard: 24x7 towing up to 100 km, spare key pick-up, 5 services per year.",
    },
    {
        "insurer": "ICICI Lombard", "addon_name": "engine_protection", "price_rule": "pct_of_idv_0.18",
        "max_vehicle_age_months": 84, "excluded_fuel_types": ["electric"],
        "recommend_only_in_flood_prone_city": True, "min_claim_free_years": 0,
        "recommendation_reason": "ICICI Lombard Engine Protect is for ICE vehicles up to 7 years in flood-prone cities",
        "applicability_note": "ICICI Lombard: vehicles up to 7 years. Water ingression, hydrostatic lock and lubricating-oil leak. 5% deductible. Not for electric vehicles.",
    },
    {
        "insurer": "ICICI Lombard", "addon_name": "consumables_cover", "price_rule": "pct_of_idv_0.12",
        "max_vehicle_age_months": 84, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 0,
        "recommendation_reason": "ICICI Lombard Consumables is available from year one on vehicles up to 7 years",
        "applicability_note": "ICICI Lombard: vehicles up to 7 years. Oils, refrigerant, fasteners on an admissible OD claim. Routine service parts excluded.",
    },
    {
        "insurer": "ICICI Lombard", "addon_name": "return_to_invoice", "price_rule": "pct_of_idv_0.35",
        "max_vehicle_age_months": 48, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 1,
        "recommendation_reason": "ICICI Lombard Return to Invoice is for vehicles up to 4 years; suggested from 1 claim-free year",
        "applicability_note": "ICICI Lombard: vehicles up to 4 years. Pays the gap from IDV to original invoice plus registration and road tax.",
    },
    {
        "insurer": "ICICI Lombard", "addon_name": "key_replacement", "price_rule": "flat_699",
        "max_vehicle_age_months": None, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 0,
        "recommendation_reason": "ICICI Lombard Key Protect covers keys and lock set up to Rs 50,000, 1 claim a year",
        "applicability_note": "ICICI Lombard: lost, stolen or damaged keys including locksmith, up to Rs 50,000. 1 claim per year.",
    },
    # Bajaj Allianz — tighter age caps, cheaper RSA, engine protect only 3 years
    {
        "insurer": "Bajaj Allianz", "addon_name": "zero_depreciation", "price_rule": "pct_of_idv_0.40",
        "max_vehicle_age_months": 60, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 0,
        "recommendation_reason": "Bajaj Allianz Depreciation Shield is for vehicles up to 5 years (2 claims if ≤3 years, 1 claim if 3–5 years)",
        "applicability_note": "Bajaj Allianz: vehicles up to 5 years. 2 claims/year if the vehicle is up to 3 years old; 1 claim/year from 3 to 5 years.",
    },
    {
        "insurer": "Bajaj Allianz", "addon_name": "roadside_assistance", "price_rule": "flat_199",
        "max_vehicle_age_months": None, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 0,
        "recommendation_reason": "Bajaj Allianz Spot Assistance covers towing up to 25 km and 3 services a year",
        "applicability_note": "Bajaj Allianz: towing up to 25 km, 3 services per year. Accommodation up to Rs 2,000 if stranded over 100 km from home.",
    },
    {
        "insurer": "Bajaj Allianz", "addon_name": "engine_protection", "price_rule": "pct_of_idv_0.14",
        "max_vehicle_age_months": 36, "excluded_fuel_types": ["electric"],
        "recommend_only_in_flood_prone_city": True, "min_claim_free_years": 0,
        "recommendation_reason": "Bajaj Allianz Engine Protector is only for ICE vehicles up to 3 years",
        "applicability_note": "Bajaj Allianz: vehicles up to 3 years only. Water ingression or lubricating-oil leak. Not for electric vehicles.",
    },
    {
        "insurer": "Bajaj Allianz", "addon_name": "consumables_cover", "price_rule": "pct_of_idv_0.09",
        "max_vehicle_age_months": 60, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 1,
        "recommendation_reason": "Bajaj Allianz Consumable Expenses after 1 claim-free year for vehicles up to 5 years",
        "applicability_note": "Bajaj Allianz: vehicles up to 5 years. Oils, nuts, bolts and grease on an admissible OD claim.",
    },
    {
        "insurer": "Bajaj Allianz", "addon_name": "return_to_invoice", "price_rule": "pct_of_idv_0.28",
        "max_vehicle_age_months": 36, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 2,
        "recommendation_reason": "Bajaj Allianz Return to Invoice is for vehicles up to 3 years; suggested from 2 claim-free years",
        "applicability_note": "Bajaj Allianz: vehicles up to 3 years. Pays invoice plus registration and road tax on theft or total loss.",
    },
    {
        "insurer": "Bajaj Allianz", "addon_name": "key_replacement", "price_rule": "flat_299",
        "max_vehicle_age_months": None, "excluded_fuel_types": [],
        "recommend_only_in_flood_prone_city": False, "min_claim_free_years": 0,
        "recommendation_reason": "Bajaj Allianz Key and Lock Replacement is capped at Rs 10,000, 1 claim a year",
        "applicability_note": "Bajaj Allianz: keys and lock set up to Rs 10,000. 1 claim per year. Police report within 48 hours.",
    },
]


def _insert_missing(
    db: Session, model: type, rows: list[dict[str, Any]], key_fields: tuple[str, ...]
) -> int:
    """Insert rows whose natural key is not already present. Returns rows inserted."""
    existing = {
        tuple(getattr(obj, f) for f in key_fields)
        for obj in db.scalars(select(model))
    }
    new_rows = [r for r in rows if tuple(r[f] for f in key_fields) not in existing]
    db.add_all(model(**r) for r in new_rows)
    return len(new_rows)


def seed_depreciation_slabs(db: Session) -> int:
    return _insert_missing(db, DepreciationSlab, DEPRECIATION_SLABS, ("age_min_months", "age_max_months"))


def seed_ncb_slabs(db: Session) -> int:
    return _insert_missing(db, NcbSlab, NCB_SLABS, ("claim_free_years",))


def seed_rate_card(db: Session) -> int:
    return _insert_missing(db, RateCard, ALL_RATE_CARDS, ("insurer", "city_zone", "cc_band"))


def seed_vehicles(db: Session) -> int:
    rows = [
        {
            "make": make, "model": model, "year": year, "fuel_type": fuel,
            "engine_cc": cc, "ex_showroom_price": D(price),
        }
        for make, model, year, fuel, cc, price in VEHICLES
    ]
    return _insert_missing(db, VehicleMaster, rows, ("make", "model", "year", "fuel_type"))


def seed_addons(db: Session) -> int:
    return _insert_missing(db, Addon, ADDONS, ("addon_name",))


def seed_insurer_addon_policies(db: Session) -> int:
    ids = {a.addon_name: a.addon_id for a in db.scalars(select(Addon))}
    rows = []
    for raw in INSURER_ADDON_POLICIES:
        addon_id = ids.get(raw["addon_name"])
        if addon_id is None:
            continue
        row = {k: v for k, v in raw.items() if k != "addon_name"}
        row["addon_id"] = addon_id
        rows.append(row)
    return _insert_missing(db, InsurerAddonPolicy, rows, ("insurer", "addon_id"))


def seed_insurer_policy_sections(db: Session) -> int:
    """Load policy wordings from the RAG seed file into Postgres."""
    seed_path = Path(__file__).resolve().parent.parent.parent / "rag" / "data" / "seed" / "seed_sections.json"
    if not seed_path.is_file():
        return 0
    payload = json.loads(seed_path.read_text(encoding="utf-8"))
    rows: list[dict[str, Any]] = []
    for insurer, sections in payload.items():
        for section in sections:
            rows.append({
                "insurer": insurer,
                "section_number": section["section_number"],
                "section_title": section["section_title"],
                "parent_category": section.get("parent_category") or "other",
                "related_addon": section.get("related_addon"),
                "content": section["content"],
            })
    return _insert_missing(db, InsurerPolicySection, rows, ("insurer", "section_number"))


def run_all() -> dict[str, int]:
    seeders = (
        ("depreciation_slabs", seed_depreciation_slabs),
        ("ncb_slabs", seed_ncb_slabs),
        ("rate_card", seed_rate_card),
        ("vehicle_master", seed_vehicles),
        ("addons", seed_addons),
        ("insurer_addon_policies", seed_insurer_addon_policies),
        ("insurer_policy_sections", seed_insurer_policy_sections),
    )
    inserted: dict[str, int] = {}
    with SessionLocal() as db:
        try:
            for name, seeder in seeders:
                inserted[name] = seeder(db)
            db.commit()
        except SQLAlchemyError as exc:
            db.rollback()
            raise RuntimeError(f"Seeding failed and was rolled back: {exc}") from exc
    return inserted


def table_counts() -> dict[str, int]:
    tables = (
        ("vehicle_master", VehicleMaster), ("depreciation_slabs", DepreciationSlab),
        ("rate_card", RateCard), ("ncb_slabs", NcbSlab), ("addons", Addon),
        ("insurer_addon_policies", InsurerAddonPolicy),
        ("insurer_policy_sections", InsurerPolicySection),
        ("customers", Customer), ("quotes", Quote),
    )
    with SessionLocal() as db:
        return {name: db.scalar(select(func.count()).select_from(model)) or 0 for name, model in tables}


def main() -> int:
    try:
        inserted = run_all()
        counts = table_counts()
    except (RuntimeError, SQLAlchemyError) as exc:
        print(f"[error] {exc}")
        return 1

    print(f"{'Table':<20}{'Inserted':>10}{'Total rows':>12}")
    print("-" * 42)
    for name, total in counts.items():
        print(f"{name:<20}{inserted.get(name, 0):>10}{total:>12}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
